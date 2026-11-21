package ru.betaclimb.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import ru.betaclimb.repositories.AttemptRepository;
import ru.betaclimb.repositories.AttemptRepository.StoredAttempt;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class AttemptService {
    private static final Logger LOG = LoggerFactory.getLogger(AttemptService.class);
    private static final Set<String> DISCIPLINES = Set.of("bouldering", "lead", "speed");
    private static final Map<String, String> PHONE_FORMATS = Map.of(
            "mp4", "video/mp4", "m4v", "video/mp4", "mov", "video/quicktime", "webm", "video/webm",
            "mkv", "video/x-matroska", "3gp", "video/3gpp");

    private final AttemptRepository attempts;
    private final ProfileService profiles;
    private final VideoStorage storage;
    private final ObjectMapper json;

    public AttemptService(AttemptRepository attempts, ProfileService profiles, VideoStorage storage, ObjectMapper json) {
        this.attempts = attempts;
        this.profiles = profiles;
        this.storage = storage;
        this.json = json;
    }

    public List<AttemptData> list(String owner, UUID profileId) {
        return attempts.list(owner, profileId).stream().map(AttemptData::from).toList();
    }

    public AttemptData get(String owner, UUID profileId, UUID id) {
        return AttemptData.from(requireAttempt(owner, profileId, id));
    }

    public URI media(String owner, UUID profileId, UUID id) {
        StoredAttempt attempt = requireAttempt(owner, profileId, id);
        String key = attempt.result().path("playbackKey").asString(attempt.sourceKey());
        if (!key.startsWith("betaclimb/" + id + "/") || key.contains("..")) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        return storage.inlineUrl(key);
    }

    public URI thumbnail(String owner, UUID profileId, UUID id) {
        String key = requireAttempt(owner, profileId, id).thumbnailKey()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return storage.inlineUrl(key);
    }

    public AttemptData create(String owner, UUID profileId, UUID requestId, MultipartFile file, String discipline) {
        var existing = attempts.findRequest(owner, requestId);
        if (existing.isPresent()) {
            return resultForProfile(existing.get(), profileId);
        }
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Видео пустое");
        }
        ProfileData profile = profiles.find(profileId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Профиль не найден")).profile();
        if (discipline == null) {
            discipline = profile.disciplines().getFirst();
        }
        if (!DISCIPLINES.contains(discipline)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Неизвестная дисциплина");
        }
        String fileName = displayName(file.getOriginalFilename());
        String type = videoType(file.getContentType(), fileName);
        String snapshot = json.writeValueAsString(profile);
        UUID id = UUID.randomUUID();
        String key = "betaclimb/" + id + "/source";
        storage.upload(key, file, type);
        StoredAttempt stored = attempts.insertAndEnqueue(owner, requestId, id, profileId, key, fileName, discipline,
                snapshot, () -> discardUnused(key, id));
        if (!stored.id().equals(id)) {
            discardUnused(key, id);
        }
        return resultForProfile(stored, profileId);
    }

    private static AttemptData resultForProfile(StoredAttempt stored, UUID profileId) {
        if (!stored.profileId().equals(profileId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ключ загрузки уже использован");
        }
        return AttemptData.from(stored);
    }

    private StoredAttempt requireAttempt(String owner, UUID profileId, UUID id) {
        return attempts.find(owner, profileId, id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void discardUnused(String key, UUID id) {
        try {
            storage.delete(key);
        } catch (RuntimeException error) {
            LOG.warn("Could not remove unused upload {}", id);
        }
    }

    private static String displayName(String name) {
        if (name == null || name.isBlank()) return "video";
        String clean = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
                .replaceAll("\\p{Cntrl}", "").strip();
        return clean.isEmpty() ? "video" : clean.substring(0, Math.min(clean.length(), 255));
    }

    private static String videoType(String contentType, String name) {
        if (contentType != null && contentType.matches("video/[A-Za-z0-9.+-]+")) return contentType;
        if (contentType == null || contentType.isBlank() || contentType.equals("application/octet-stream")) {
            String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
            String type = PHONE_FORMATS.get(extension);
            if (type != null) return type;
        }
        throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Выбери видеофайл");
    }
}
