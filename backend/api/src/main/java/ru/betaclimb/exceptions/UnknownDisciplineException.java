package ru.betaclimb.exceptions;

import org.springframework.http.HttpStatus;

public final class UnknownDisciplineException extends ApplicationException {
    public UnknownDisciplineException() {
        super(
                HttpStatus.BAD_REQUEST,
                ApplicationStatus.UNKNOWN_DISCIPLINE,
                "Неизвестная дисциплина."
        );
    }
}
