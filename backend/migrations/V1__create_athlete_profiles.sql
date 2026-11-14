CREATE TABLE athlete_profiles (
    id UUID PRIMARY KEY,
    nickname VARCHAR(24) NOT NULL,
    height_cm INTEGER NOT NULL,
    weight_kg INTEGER NOT NULL,
    age_years INTEGER NOT NULL,
    experience VARCHAR(16) NOT NULL,
    disciplines TEXT[] NOT NULL,
    max_grade VARCHAR(16) NOT NULL,
    gender VARCHAR(6) NOT NULL,
    consent_accepted BOOLEAN NOT NULL
);
