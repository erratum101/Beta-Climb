# Beta Climb API

Для запуска нужны JDK 25 и PostgreSQL. Настройки подключения задаются через
`DB_URL`, `DB_USERNAME`, `DB_PASSWORD` и `DB_SCHEMA` (по умолчанию `public`).
При запуске Flyway применяет миграции из `backend/migrations`.

Из `backend/api` выполните `./gradlew bootRun` (Windows: `.\gradlew.bat bootRun`).

После запуска доступны:

- [Swagger UI](http://localhost:8080/swagger-ui.html) — просмотр и вызов методов API.
- [OpenAPI JSON](http://localhost:8080/v3/api-docs).
- [OpenAPI YAML](http://localhost:8080/v3/api-docs.yaml).

Если задана переменная `PORT`, используйте её значение вместо `8080`.
Спецификация автоматически формируется из контроллеров и моделей.

Для загрузки видео через Swagger UI сначала создайте профиль через
`POST /api/profiles`, затем передайте его `id` как `profileId` в
`POST /api/attempts`. Заголовок `Idempotency-Key` должен содержать UUID,
уникальный для каждой новой загрузки. Попытки привязаны к cookie
`betaclimb-owner`, которую API устанавливает автоматически: используйте
тот же браузер для последующих запросов.
