package ru.betaclimb.services;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import ru.betaclimb.properties.StorageProperties;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class VideoStorage {
    private static final Pattern KEY = Pattern.compile(
            "betaclimb/[0-9a-fA-F-]{36}(?:/[A-Za-z0-9._-]+)+");

    private final StorageProperties properties;

    @PostConstruct
    void initialize() {
        try {
            Files.createDirectories(properties.dir());
        } catch (IOException error) {
            throw new IllegalStateException("Video storage directory is not writable", error);
        }
    }

    public void upload(
            String key,
            MultipartFile file,
            String contentType
    ) {
        Path target = resolve(key);

        try {
            Files.createDirectories(target.getParent());
            try (InputStream input = file.getInputStream()) {
                Files.copy(
                        input,
                        target,
                        StandardCopyOption.REPLACE_EXISTING
                );
            }
            Files.writeString(
                    typePath(target),
                    contentType,
                    StandardCharsets.UTF_8
            );
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public void delete(String key) {
        Path target = resolve(key);

        try {
            Files.deleteIfExists(target);
            Files.deleteIfExists(typePath(target));
        } catch (IOException error) {
            throw new UncheckedIOException(error);
        }
    }

    public StoredObject open(String key) {
        Path target = resolve(key);

        if (!Files.isRegularFile(target)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        String contentType;

        try {
            contentType = Files.readString(typePath(target), StandardCharsets.UTF_8).trim();
        } catch (IOException error) {
            contentType = "";
        }
        if (contentType.isEmpty()) {
            contentType = "application/octet-stream";
        }

        return new StoredObject(new FileSystemResource(target), contentType);
    }

    private Path resolve(String key) {
        if (key == null || key.contains("..") || !KEY.matcher(key).matches()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        Path path = properties.dir().resolve(key).normalize();

        if (!path.startsWith(properties.dir())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }

        return path;
    }

    private static Path typePath(Path target) {
        return target.resolveSibling(target.getFileName() + ".type");
    }

    public record StoredObject(Resource body, String contentType) {
    }
}
