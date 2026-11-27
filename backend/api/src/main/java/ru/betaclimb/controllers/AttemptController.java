package ru.betaclimb.controllers;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import ru.betaclimb.services.AttemptData;
import ru.betaclimb.services.AttemptService;
import ru.betaclimb.services.VideoStorage.StoredObject;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/attempts")
@RequiredArgsConstructor
@Tag(name = "Попытки", description = "Загрузка видео, история попыток и результаты анализа. "
        + "Доступ привязан к профилю и cookie betaclimb-owner. Cookie устанавливается автоматически; "
        + "для последующих запросов используйте тот же браузер.")
@ApiResponses({
        @ApiResponse(responseCode = "500", description = "Внутренняя ошибка сервера.",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
})
public class AttemptController {
    private final AttemptService attempts;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Загрузить видео попытки", description = "Сохраняет видео и ставит задачу анализа в очередь. "
            + "Возвращает текущее состояние попытки; результат можно получить отдельным запросом. "
            + "Повтор запроса с тем же Idempotency-Key и cookie возвращает прежнюю попытку для того же профиля "
            + "без повторной загрузки. Новый ключ нужен для каждой новой попытки.")
    @ApiResponses({
            @ApiResponse(responseCode = "202", description = "Видео принято либо возвращена ранее созданная попытка.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = AttemptData.class))),
            @ApiResponse(responseCode = "400", description = "Некорректные параметры, пустое видео (EMPTY_VIDEO) "
                    + "или неизвестная дисциплина (UNKNOWN_DISCIPLINE).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Профиль не найден (PROFILE_NOT_FOUND).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
            @ApiResponse(responseCode = "409", description = "Idempotency-Key уже использован для другого профиля (UPLOAD_KEY_ALREADY_USED).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
            @ApiResponse(responseCode = "413", description = "Превышен настроенный лимит загрузки: "
                    + "по умолчанию 250 МБ на файл и 251 МБ на запрос (UPLOAD_TOO_LARGE).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
            @ApiResponse(responseCode = "415", description = "Неподдерживаемый тип запроса или формат видео (UNSUPPORTED_VIDEO_FORMAT).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
    })
    public ResponseEntity<AttemptData> create(
            @Parameter(description = "UUID существующего профиля скалолаза.")
            @RequestParam UUID profileId,
            @Parameter(description = "Непустой видеофайл с MIME-типом video/*. Если тип не указан или равен "
                    + "application/octet-stream, формат определяется по расширению: mp4, m4v, mov, webm, mkv, 3gp.")
            @RequestParam MultipartFile file,
            @Parameter(description = "Дисциплина. Если не задана, берётся первая дисциплина профиля.",
                    schema = @Schema(allowableValues = {"bouldering", "lead", "speed"}))
            @RequestParam(required = false) String discipline,
            @Parameter(description = "Кадр в формате JPEG для дополнительного разбора при review=true.")
            @RequestParam(required = false) MultipartFile frame,
            @Parameter(description = "Длительность видео в секундах для дополнительного разбора при review=true. "
                    + "Если не указана, в разбор передаётся 0.", example = "42.5")
            @RequestParam(required = false) Double durationSec,
            @Parameter(description = "Запустить дополнительный разбор новой попытки. По умолчанию false.")
            @RequestParam(required = false, defaultValue = "false") boolean review,
            @Parameter(description = "UUID ключа идемпотентности. Сохраняйте ключ при повторе запроса "
                    + "и создавайте новый для новой попытки.", example = "550e8400-e29b-41d4-a716-446655440000")
            @RequestHeader("Idempotency-Key") UUID requestId,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        var attempt = attempts.create(
                BrowserOwner.resolve(request, response),
                profileId,
                requestId,
                file,
                discipline,
                frame,
                durationSec,
                review
        );

        return ResponseEntity.accepted().body(attempt);
    }

    @GetMapping
    @Operation(summary = "Получить историю попыток", description = "Возвращает попытки указанного профиля "
            + "для текущей cookie betaclimb-owner, от новых к старым. Если совпадений нет, возвращает пустой массив.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Список попыток с текущими состояниями и результатами анализа.",
                    content = @Content(mediaType = "application/json", array = @ArraySchema(schema = @Schema(implementation = AttemptData.class)))),
            @ApiResponse(responseCode = "400", description = "UUID профиля отсутствует или имеет неверный формат.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
    })
    public List<AttemptData> list(
            @Parameter(description = "UUID профиля, для которого запрашивается история.")
            @RequestParam UUID profileId,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        return attempts.list(BrowserOwner.resolve(request, response), profileId);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Получить попытку и результат анализа", description = "Возвращает состояние обработки, "
            + "результат анализа и ссылки на медиа. Можно повторять запрос для отслеживания обработки. "
            + "Попытка должна принадлежать указанному профилю и текущей cookie betaclimb-owner.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Попытка найдена.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = AttemptData.class))),
            @ApiResponse(responseCode = "400", description = "UUID попытки или профиля отсутствует либо имеет неверный формат.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Попытка не найдена для этого профиля и cookie (ATTEMPT_NOT_FOUND).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
    })
    public AttemptData get(
            @Parameter(description = "UUID попытки.")
            @PathVariable UUID id,
            @Parameter(description = "UUID профиля, которому принадлежит попытка.")
            @RequestParam UUID profileId,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        return attempts.get(
                BrowserOwner.resolve(request, response),
                profileId,
                id
        );
    }

    @GetMapping("/{id}/media")
    @Parameter(name = "Range", in = ParameterIn.HEADER,
            description = "Необязательный диапазон байтов для частичной загрузки видео.",
            schema = @Schema(type = "string"), example = "bytes=0-1023")
    @Operation(summary = "Получить видео попытки", description = "Возвращает видео для воспроизведения: "
            + "обработанную версию, если она указана в результате анализа, иначе исходный файл. "
            + "Нужны UUID профиля и cookie betaclimb-owner, использованная при загрузке.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Видео целиком. Content-Type соответствует сохранённому файлу.",
                    content = @Content(mediaType = "application/octet-stream", schema = @Schema(type = "string", format = "binary"))),
            @ApiResponse(responseCode = "206", description = "Фрагмент видео по заголовку Range.",
                    content = @Content(mediaType = "application/octet-stream", schema = @Schema(type = "string", format = "binary"))),
            @ApiResponse(responseCode = "400", description = "UUID попытки или профиля отсутствует либо имеет неверный формат.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Попытка недоступна (ATTEMPT_NOT_FOUND) или видео не найдено (MEDIA_NOT_FOUND).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
    })
    public ResponseEntity<Resource> media(
            @Parameter(description = "UUID попытки.")
            @PathVariable UUID id,
            @Parameter(description = "UUID профиля, которому принадлежит попытка.")
            @RequestParam UUID profileId,
            HttpServletRequest request,
            HttpServletResponse response
    ) throws IOException {
        return inline(attempts.media(
                BrowserOwner.resolve(request, response),
                profileId,
                id
        ));
    }

    @GetMapping("/{id}/thumbnail")
    @Operation(summary = "Получить превью попытки", description = "Возвращает изображение превью, если оно указано "
            + "в результате анализа. Нужны UUID профиля и cookie betaclimb-owner, использованная при загрузке.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Изображение превью. Content-Type соответствует сохранённому файлу.",
                    content = @Content(mediaType = "application/octet-stream", schema = @Schema(type = "string", format = "binary"))),
            @ApiResponse(responseCode = "400", description = "UUID попытки или профиля отсутствует либо имеет неверный формат.",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class))),
            @ApiResponse(responseCode = "404", description = "Попытка недоступна (ATTEMPT_NOT_FOUND) или превью не найдено (MEDIA_NOT_FOUND).",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiExceptionHandler.ApiError.class)))
    })
    public ResponseEntity<Resource> thumbnail(
            @Parameter(description = "UUID попытки.")
            @PathVariable UUID id,
            @Parameter(description = "UUID профиля, которому принадлежит попытка.")
            @RequestParam UUID profileId,
            HttpServletRequest request,
            HttpServletResponse response
    ) throws IOException {
        return inline(attempts.thumbnail(
                BrowserOwner.resolve(request, response),
                profileId,
                id
        ));
    }

    private static ResponseEntity<Resource> inline(StoredObject object) throws IOException {
        Resource body = object.body();

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(object.contentType()))
                .contentLength(body.contentLength())
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .body(body);
    }
}
