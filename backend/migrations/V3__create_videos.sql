CREATE TABLE videos (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES athlete_profiles (id),
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_videos_profile_id
    ON videos (profile_id);
