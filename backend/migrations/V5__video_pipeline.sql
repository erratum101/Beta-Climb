ALTER TABLE videos
    ADD COLUMN request_id UUID,
    ADD COLUMN owner_key TEXT,
    ADD COLUMN file_name TEXT,
    ADD COLUMN stage TEXT NOT NULL DEFAULT 'holds',
    ADD COLUMN duration_sec DOUBLE PRECISION,
    ADD COLUMN discipline TEXT,
    ADD COLUMN profile_snapshot JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN result_data JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN reject_reason TEXT,
    ADD CONSTRAINT videos_owner_request_unique UNIQUE (owner_key, request_id);

ALTER TABLE tasks
    ADD COLUMN video_id UUID REFERENCES videos (id) ON DELETE CASCADE,
    ADD COLUMN lease_token UUID,
    ADD COLUMN lease_until TIMESTAMPTZ,
    ADD COLUMN result_key TEXT,
    ADD COLUMN error TEXT,
    ADD CONSTRAINT tasks_video_stage_unique UNIQUE (video_id, type);

CREATE INDEX idx_tasks_video_pending ON tasks (next_attempt_at)
    WHERE video_id IS NOT NULL AND status = 'pending';
CREATE INDEX idx_tasks_video_running ON tasks (lease_until)
    WHERE video_id IS NOT NULL AND status = 'running';
