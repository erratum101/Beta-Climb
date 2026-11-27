package ru.betaclimb.controllers;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import ru.betaclimb.exceptions.ProfileNotFoundException;
import ru.betaclimb.services.ProfileData;
import ru.betaclimb.services.ProfileService.SavedProfile;
import ru.betaclimb.services.ProfileService;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/profiles")
@RequiredArgsConstructor
@Tag(name = "Профили", description = "Создание, просмотр и обновление профиля скалолаза.")
@ApiResponses({
        @ApiResponse(responseCode = "400", description = "Некорректный UUID, JSON или данные профиля.",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
        @ApiResponse(responseCode = "500", description = "Внутренняя ошибка сервера.",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
})
public class ProfileController {

    private final ProfileService service;

    @PostMapping
    @Operation(summary = "Создать профиль", description = "Сохраняет профиль скалолаза и возвращает его UUID и данные. "
            + "Все поля обязательны, согласие на обработку данных должно быть подтверждено.")
    @ApiResponse(responseCode = "201", description = "Профиль создан.",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = SavedProfile.class)),
            headers = @Header(name = "Location", description = "Относительный адрес созданного профиля.",
                    schema = @Schema(type = "string", example = "/api/profiles/550e8400-e29b-41d4-a716-446655440000")))
    public ResponseEntity<SavedProfile> create(
            @io.swagger.v3.oas.annotations.parameters.RequestBody(description = "Данные нового профиля.", required = true)
            @Valid @RequestBody ProfileData profile
    ) {
        SavedProfile saved = service.create(profile);

        return ResponseEntity.created(URI.create("/api/profiles/" + saved.id())).body(saved);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Получить профиль", description = "Возвращает сохранённые данные профиля по его UUID.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Профиль найден.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = SavedProfile.class))),
            @ApiResponse(responseCode = "404", description = "Профиль не найден (PROFILE_NOT_FOUND).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
    })
    public SavedProfile find(@Parameter(description = "UUID профиля.") @PathVariable UUID id) {
        return service.find(id).orElseThrow(ProfileNotFoundException::new);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Обновить профиль", description = "Полностью заменяет данные существующего профиля. "
            + "Передайте все поля, включая подтверждённое согласие на обработку данных.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Данные профиля обновлены.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = SavedProfile.class))),
            @ApiResponse(responseCode = "404", description = "Профиль не найден (PROFILE_NOT_FOUND).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
    })
    public SavedProfile update(
            @Parameter(description = "UUID обновляемого профиля.") @PathVariable UUID id,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(description = "Полный набор новых данных профиля.", required = true)
            @Valid @RequestBody ProfileData profile
    ) {
        return service.update(id, profile)
                .orElseThrow(ProfileNotFoundException::new);
    }
}
