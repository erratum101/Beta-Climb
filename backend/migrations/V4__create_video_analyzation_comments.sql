CREATE TABLE video_analyzation_comments (
    id UUID PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES athlete_profiles (id),
    video_id UUID NOT NULL REFERENCES videos (id),
    timecode INTERVAL NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_video_analyzation_comments_video_timecode
    ON video_analyzation_comments (video_id, timecode);

CREATE INDEX idx_video_analyzation_comments_profile_id
    ON video_analyzation_comments (profile_id);
