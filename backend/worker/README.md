# Beta Climb Worker

Каркас Python-воркера для будущего переноса обработки видео из RatPoC.
Обработчик задач и логика анализа пока не реализованы.

## Установка

Нужны Python 3.12 и Poetry 2.x. MediaPipe 0.10.21 из RatPoC не выпускает
бинарные пакеты для Python 3.13 и новее.

Из каталога `backend/worker`:

```sh
poetry env use python3.12
poetry install
poetry run python -c "import core, service, database"
```

Для будущего запуска обработки и рендеринга видео также понадобится FFmpeg
в `PATH`: это системная зависимость, она не устанавливается через Poetry.
Веса моделей и данные RatPoC в каркас не входят.

## Структура

- `src/core` — общие настройки и инфраструктура (`pydantic-settings`).
- `src/service` — обработка видео и бизнес-логика анализа.
- `src/database` — работа с PostgreSQL через SQLAlchemy и Psycopg 3.

Все три пакета устанавливаются Poetry из `src/`.
