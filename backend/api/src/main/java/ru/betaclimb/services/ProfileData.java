package ru.betaclimb.services;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.hibernate.validator.constraints.UniqueElements;

import java.util.List;

public record ProfileData(
        @NotBlank @Size(max = 24) String nickname,
        @NotNull @Min(120) @Max(250) Integer heightCm,
        @NotNull @Min(35) @Max(200) Integer weightKg,
        @NotNull @Min(4) @Max(101) Integer ageYears,
        @NotNull @Pattern(regexp = "lt1m|m1to3|m3to6|m6to12|gt1y") String experience,
        @NotNull @Size(min = 1, max = 3) @UniqueElements
        List<@NotNull @Pattern(regexp = "bouldering|lead|speed") String> disciplines,
        @NotNull @Pattern(regexp = "novice|amateur|advanced|expert") String maxGrade,
        @NotNull @Pattern(regexp = "male|female") String gender,
        @NotNull @AssertTrue Boolean consentAccepted
) {
}
