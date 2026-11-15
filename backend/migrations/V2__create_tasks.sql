CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    payload JSONB NOT NULL,
    next_attempt_at TIMESTAMP NOT NULL,
    tries INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    status TEXT NOT NULL,
    type TEXT NOT NULL
);
