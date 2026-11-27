package ru.betaclimb;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

class RailwayDatabaseEnvironmentPostProcessorTest {

    private final RailwayDatabaseEnvironmentPostProcessor processor = new RailwayDatabaseEnvironmentPostProcessor();

    @Test
    void mapsRailwayUrlToJdbcWithoutRequiringSslInsideRailway() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty(
                        "DATABASE_URL",
                        "postgresql://postgres:secret]bl@postgres.railway.internal:5432/railway"
                );

        processor.postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getProperty("spring.datasource.url"))
                .isEqualTo("jdbc:postgresql://postgres.railway.internal:5432/railway");
        assertThat(environment.getProperty("spring.datasource.username")).isEqualTo("postgres");
        assertThat(environment.getProperty("spring.datasource.password")).isEqualTo("secret]bl");
    }

    @Test
    void keepsAnExplicitJdbcUrl() {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("DB_URL", "jdbc:postgresql://db:5432/betaclimb")
                .withProperty("DATABASE_URL", "postgresql://postgres:secret@postgres.railway.internal:5432/railway");

        processor.postProcessEnvironment(environment, new SpringApplication());

        assertThat(environment.getProperty("spring.datasource.url")).isNull();
    }
}
