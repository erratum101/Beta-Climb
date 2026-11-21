from pydantic import AliasChoices, BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DBSettings(BaseSettings):
    """Connection settings under the names the API and libpq already use."""

    model_config = SettingsConfigDict(extra="ignore", populate_by_name=True)

    # A URL, possibly in JDBC form, takes precedence over the separate libpq values below.
    url: str | None = Field(default=None, validation_alias=AliasChoices("DB_URL", "DATABASE_URL"))
    username: str | None = Field(default=None, validation_alias="DB_USERNAME")
    password: str | None = Field(default=None, validation_alias="DB_PASSWORD", repr=False)
    schema_name: str = Field(default="public", validation_alias="DB_SCHEMA", pattern="^[a-z_][a-z0-9_]*$")

    pg_host: str = Field(default="localhost", validation_alias="PGHOST")
    pg_port: int = Field(default=5432, validation_alias="PGPORT")
    pg_database: str = Field(default="betaclimb", validation_alias="PGDATABASE")
    pg_user: str | None = Field(default=None, validation_alias="PGUSER")
    pg_password: str | None = Field(default=None, validation_alias="PGPASSWORD", repr=False)
    ssl_root_cert: str | None = Field(default=None, validation_alias="PGSSLROOTCERT")


class QueueSettings(BaseModel):
    lease_seconds: float = Field(default=90, gt=0)  # [sec] a claimed row belongs to its worker this long
    heartbeat_period: float = Field(default=30, gt=0)  # [sec] between lease renewals, keep well below lease_seconds
    max_tries: int = Field(default=3, ge=1)  # attempts of one stage before the video fails
    retry_delay_base: float = Field(default=2, ge=1)  # [sec] a retry waits retry_delay_base ** tries
    retry_delay_max: float = Field(default=60, ge=0)  # [sec] upper bound of that wait
