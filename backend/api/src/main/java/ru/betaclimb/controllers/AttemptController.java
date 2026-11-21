package ru.betaclimb.controllers;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.CacheControl;
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
    public ResponseEntity<Void> media(@PathVariable UUID id, @RequestParam UUID profileId, HttpServletRequest request,
                                      HttpServletResponse response) {
        var url = attempts.media(BrowserOwner.resolve(request, response), profileId, id);
        return ResponseEntity.status(HttpStatus.TEMPORARY_REDIRECT).location(url).build();
    }

    @GetMapping("/{id}/thumbnail")
    public ResponseEntity<Void> thumbnail(@PathVariable UUID id, @RequestParam UUID profileId, HttpServletRequest request,
                                          HttpServletResponse response) {
        var url = attempts.thumbnail(BrowserOwner.resolve(request, response), profileId, id);
        return ResponseEntity.status(HttpStatus.TEMPORARY_REDIRECT).cacheControl(CacheControl.noStore()).location(url).build();
    }
}
