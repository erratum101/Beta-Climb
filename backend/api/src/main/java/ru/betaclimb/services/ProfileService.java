package ru.betaclimb.services;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.betaclimb.repositories.ProfileEntity;
import ru.betaclimb.repositories.ProfileRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ProfileService {

    private final ProfileRepository repository;

    public ProfileService(ProfileRepository repository) {
        this.repository = repository;
    }

    public Optional<SavedProfile> find(UUID id) {
        return repository.findById(id).map(this::toResponse);
    }

    @Transactional
    public SavedProfile create(ProfileData data) {
        ProfileEntity entity = new ProfileEntity();
        apply(entity, data);
        return toResponse(repository.save(entity));
    }

    @Transactional
    public Optional<SavedProfile> update(UUID id, ProfileData data) {
        return repository.findById(id).map(entity -> {
            apply(entity, data);
            return toResponse(repository.save(entity));
        });
    }

    private void apply(ProfileEntity entity, ProfileData data) {
        entity.setNickname(data.nickname().trim());
        entity.setHeightCm(data.heightCm());
        entity.setWeightKg(data.weightKg());
        entity.setAgeYears(data.ageYears());
        entity.setExperience(data.experience());
        entity.setDisciplines(data.disciplines().toArray(String[]::new));
        entity.setMaxGrade(data.maxGrade());
        entity.setGender(data.gender());
        entity.setConsentAccepted(data.consentAccepted());
    }

    private SavedProfile toResponse(ProfileEntity entity) {
        return new SavedProfile(entity.getId(), new ProfileData(
                entity.getNickname(), entity.getHeightCm(), entity.getWeightKg(),
                entity.getAgeYears(), entity.getExperience(), List.of(entity.getDisciplines()),
                entity.getMaxGrade(), entity.getGender(), entity.getConsentAccepted()
        ));
    }

    public record SavedProfile(UUID id, ProfileData profile) {
    }
}
