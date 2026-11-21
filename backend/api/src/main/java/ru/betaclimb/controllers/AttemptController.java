package ru.betaclimb.controllers;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import ru.betaclimb.services.AttemptData;
import ru.betaclimb.services.AttemptService;
import ru.betaclimb.services.VideoStorage.StoredObject;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/attempts")
public class AttemptController {
    private final AttemptService attempts;

    public AttemptController(AttemptService attempts) {
        this.attempts = attempts;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<AttemptData> create(@RequestParam UUID profileId, @RequestParam MultipartFile file,
            @RequestParam(required = false) String discipline, @RequestHeader("Idempotency-Key") UUID requestId,
            HttpServletRequest request, HttpServletResponse response) {
        var attempt = attempts.create(BrowserOwner.resolve(request, response), profileId, requestId, file, discipline);
        return ResponseEntity.accepted().body(attempt);
    }

    @GetMapping
    public List<AttemptData> list(@RequestParam UUID profileId, HttpServletRequest request, HttpServletResponse response) {
        return attempts.list(BrowserOwner.resolve(request, response), profileId);
    }

    @GetMapping("/{id}")
    public AttemptData get(@PathVariable UUID id, @RequestParam UUID profileId, HttpServletRequest request,
                           HttpServletResponse response) {
        return attempts.get(BrowserOwner.resolve(request, response), profileId, id);
    }

    @GetMapping("/{id}/media")
    public ResponseEntity<?> media(@PathVariable UUID id, @RequestParam UUID profileId, HttpServletRequest request,
                                   HttpServletResponse response) throws IOException {
        return inline(attempts.media(BrowserOwner.resolve(request, response), profileId, id), request);
    }

    @GetMapping("/{id}/thumbnail")
    public ResponseEntity<?> thumbnail(@PathVariable UUID id, @RequestParam UUID profileId, HttpServletRequest request,
                                       HttpServletResponse response) throws IOException {
        return inline(attempts.thumbnail(BrowserOwner.resolve(request, response), profileId, id), request);
    }

    private static ResponseEntity<?> inline(StoredObject object, HttpServletRequest request) throws IOException {
        Resource body = object.body();
        MediaType type = MediaType.parseMediaType(object.contentType());
        long length = body.contentLength();
        String rangeHeader = request.getHeader(HttpHeaders.RANGE);
        if (rangeHeader == null || rangeHeader.isBlank()) {
            return ResponseEntity.ok()
                    .contentType(type)
                    .contentLength(length)
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                    .cacheControl(org.springframework.http.CacheControl.noStore())
                    .body(body);
        }
        var region = HttpRange.parseRanges(rangeHeader).getFirst().toResourceRegion(body);
        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .contentType(type)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .body(region);
    }
}
