package ru.betaclimb.exceptions;

import org.springframework.http.HttpStatus;

public final class EmptyVideoException extends ApplicationException {
    public EmptyVideoException() {
        super(
                HttpStatus.BAD_REQUEST,
                ApplicationStatus.EMPTY_VIDEO,
                "Видео пустое."
        );
    }
}
