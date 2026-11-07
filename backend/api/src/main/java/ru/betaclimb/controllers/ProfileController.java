package ru.betaclimb.controllers;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import ru.betaclimb.services.ProfileData;
import ru.betaclimb.services.ProfileService;
import ru.betaclimb.services.ProfileService.SavedProfile;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/profiles")
public class ProfileController {

    private final ProfileService service;

    public ProfileController(ProfileService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<SavedProfile> create(@Valid @RequestBody ProfileData profile) {
        SavedProfile saved = service.create(profile);
        return ResponseEntity.created(URI.create("/api/profiles/" + saved.id())).body(saved);
    }

    @GetMapping("/{id}")
    public SavedProfile find(@PathVariable UUID id) {
        return service.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @PutMapping("/{id}")
    public SavedProfile update(@PathVariable UUID id, @Valid @RequestBody ProfileData profile) {
        return service.update(id, profile)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
