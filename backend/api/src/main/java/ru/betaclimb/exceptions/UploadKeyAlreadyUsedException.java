package ru.betaclimb.exceptions;

import org.springframework.http.HttpStatus;

public final class UploadKeyAlreadyUsedException extends ApplicationException {
    public UploadKeyAlreadyUsedException() {
        super(
                HttpStatus.CONFLICT,
                ApplicationStatus.UPLOAD_KEY_ALREADY_USED,
                "Ключ загрузки уже использован."
        );
    }
}
