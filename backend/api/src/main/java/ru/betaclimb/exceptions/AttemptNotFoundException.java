package ru.betaclimb.exceptions;

import org.springframework.http.HttpStatus;

public final class AttemptNotFoundException extends ApplicationException {
    public AttemptNotFoundException() {
        super(
                HttpStatus.NOT_FOUND,
                ApplicationStatus.ATTEMPT_NOT_FOUND,
                "Попытка не найдена."
        );
    }
}
