CREATE TABLE athlete_profiles (
    id UUID PRIMARY KEY,
    nickname VARCHAR(24) NOT NULL CHECK (length(trim(nickname)) > 0),
    height_cm INTEGER NOT NULL CHECK (height_cm BETWEEN 120 AND 250),
    weight_kg INTEGER NOT NULL CHECK (weight_kg BETWEEN 35 AND 200),
    age_years INTEGER NOT NULL CHECK (age_years BETWEEN 4 AND 101),
    experience VARCHAR(16) NOT NULL CHECK (experience IN ('lt1m', 'm1to3', 'm3to6', 'm6to12', 'gt1y')),
    disciplines TEXT[] NOT NULL CHECK (
        cardinality(disciplines) BETWEEN 1 AND 3
        AND disciplines <@ ARRAY['bouldering', 'lead', 'speed']::TEXT[]
        AND array_position(disciplines, NULL) IS NULL
    ),
    max_grade VARCHAR(16) NOT NULL CHECK (max_grade IN ('novice', 'amateur', 'advanced', 'expert')),
    gender VARCHAR(6) NOT NULL CHECK (gender IN ('male', 'female')),
    consent_accepted BOOLEAN NOT NULL CHECK (consent_accepted)
);
