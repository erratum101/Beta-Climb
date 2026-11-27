package ru.betaclimb.exceptions;

import org.springframework.http.HttpStatus;

public final class UnsupportedVideoFormatException extends ApplicationException {
    public UnsupportedVideoFormatException() {
        super(
                HttpStatus.UNSUPPORTED_MEDIA_TYPE,
                ApplicationStatus.UNSUPPORTED_VIDEO_FORMAT,
                "Выбери видеофайл."
        );
    }
}
