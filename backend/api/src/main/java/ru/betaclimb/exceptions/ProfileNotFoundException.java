package ru.betaclimb.exceptions;

import org.springframework.http.HttpStatus;

public final class ProfileNotFoundException extends ApplicationException {
    public ProfileNotFoundException() {
        super(
                HttpStatus.NOT_FOUND,
                ApplicationStatus.PROFILE_NOT_FOUND,
                "Профиль не найден."
        );
    }
}
