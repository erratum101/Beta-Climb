from sqlalchemy import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from database.settings import DBSettings


def connection_url(settings: DBSettings) -> URL:
    if settings.url:
        # currentSchema is a JDBC option; psycopg receives search_path on connection.
        url = make_url(settings.url.removeprefix("jdbc:")).difference_update_query(["currentSchema"])
        url = url.set(drivername="postgresql+psycopg", username=settings.username or url.username,
                      password=settings.password or url.password)
    else:
        url = URL.create("postgresql+psycopg", username=settings.pg_user, password=settings.pg_password,
                         host=settings.pg_host, port=settings.pg_port, database=settings.pg_database)
    if settings.ssl_root_cert:
        url = url.update_query_dict({"sslrootcert": settings.ssl_root_cert})
    return url


def create_engine(settings: DBSettings) -> AsyncEngine:
    return create_async_engine(connection_url(settings), pool_pre_ping=True, connect_args={
        "options": f"-csearch_path={settings.schema_name} -ctimezone=UTC",
    })
