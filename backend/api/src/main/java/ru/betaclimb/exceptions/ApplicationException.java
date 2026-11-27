package ru.betaclimb.exceptions;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public abstract class ApplicationException extends RuntimeException {
    private final HttpStatus httpStatus;
    private final ApplicationStatus status;

    protected ApplicationException(
            HttpStatus httpStatus,
            ApplicationStatus status,
            String message
    ) {
        super(message);
        this.httpStatus = httpStatus;
        this.status = status;
    }
}
