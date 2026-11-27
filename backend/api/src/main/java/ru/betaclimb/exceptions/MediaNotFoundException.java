package ru.betaclimb.exceptions;

import org.springframework.http.HttpStatus;

public final class MediaNotFoundException extends ApplicationException {
    public MediaNotFoundException() {
        super(
                HttpStatus.NOT_FOUND,
                ApplicationStatus.MEDIA_NOT_FOUND,
                "Медиафайл не найден."
        );
    }
}
