package ru.betaclimb.controllers;

import io.swagger.v3.oas.annotations.media.Schema;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import ru.betaclimb.exceptions.ApplicationException;
import ru.betaclimb.exceptions.ApplicationStatus;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final String INTERNAL_ERROR_MESSAGE = "Произошла внутренняя ошибка. Попробуй ещё раз.";

    @ExceptionHandler(ApplicationException.class)
    public ResponseEntity<Object> handleApplicationException(ApplicationException error, WebRequest request) {
        return respond(
                error,
                new ApiError(error.getStatus(), error.getMessage()),
                HttpHeaders.EMPTY,
                error.getHttpStatus(),
                request
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpectedException(Exception error, WebRequest request) {
        return handleExceptionInternal(
                error,
                null,
                HttpHeaders.EMPTY,
                HttpStatus.INTERNAL_SERVER_ERROR,
                request
        );
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception error,
            Object body,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        ApiError response;
        if (status.is5xxServerError()) {
            LOG.error("Unhandled API error (HTTP {})", status.value(), error);
            response = new ApiError(ApplicationStatus.INTERNAL_ERROR, INTERNAL_ERROR_MESSAGE);
        } else {
            response = switch (status.value()) {
                case 400 -> new ApiError(ApplicationStatus.INVALID_REQUEST, "Проверь данные запроса.");
                case 413 -> new ApiError(ApplicationStatus.UPLOAD_TOO_LARGE, "Видео слишком большое.");
                default -> new ApiError(ApplicationStatus.HTTP_ERROR, "Не удалось обработать запрос.");
            };
        }

        return respond(
                error,
                response,
                headers,
                status,
                request
        );
    }

    private ResponseEntity<Object> respond(
            Exception error,
            ApiError body,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        HttpHeaders responseHeaders = new HttpHeaders();
        responseHeaders.addAll(headers);
        responseHeaders.setContentType(MediaType.APPLICATION_JSON);

        return super.handleExceptionInternal(
                error,
                body,
                responseHeaders,
                status,
                request
        );
    }

    @Schema(description = "Ошибка API: машинный код и сообщение для пользователя.")
    public record ApiError(
            @Schema(description = "Код ошибки приложения.") ApplicationStatus status,
            @Schema(description = "Описание ошибки.") String message
    ) {
    }
}
