package ru.betaclimb;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import ru.betaclimb.repositories.ProfileRepository;

import java.util.UUID;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "DB_SCHEMA=betaclimb")
@AutoConfigureMockMvc
@Import(PostgresTestConfiguration.class)
class ApiApplicationTests {

    private static final String PROFILE = """
            {"nickname":"Test climber","heightCm":180,"weightKg":75,"ageYears":25,
             "experience":"gt1y","disciplines":["bouldering","lead"],
             "maxGrade":"amateur","gender":"male","consentAccepted":true}
            """;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ProfileRepository repository;

    @BeforeEach
    void clearProfiles() {
        repository.deleteAll();
    }

    @Test
    void appliesMigrationToPostgres() {
        assertThat(jdbcTemplate.queryForObject("select 1", Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from flyway_schema_history where version in ('1', '2', '3', '4') and success", Integer.class
        )).isEqualTo(4);
        assertThat(jdbcTemplate.queryForObject("select current_schema()", String.class)).isEqualTo("betaclimb");
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from pg_tables where schemaname = 'betaclimb' and tablename <> 'flyway_schema_history'",
                Integer.class
        )).isEqualTo(4);
        assertThat(jdbcTemplate.queryForObject(
                "select count(*) from pg_tables where schemaname = 'public'", Integer.class
        )).isZero();
    }

    @Test
    void createsReadsAndUpdatesProfile() throws Exception {
        String location = mvc.perform(post("/api/profiles")
                        .contentType(MediaType.APPLICATION_JSON).content(PROFILE))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.profile.nickname").value("Test climber"))
                .andReturn().getResponse().getHeader("Location");

        assertThat(location).isNotNull();
        mvc.perform(get(location))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.heightCm").value(180))
                .andExpect(jsonPath("$.profile.weightKg").value(75))
                .andExpect(jsonPath("$.profile.ageYears").value(25))
                .andExpect(jsonPath("$.profile.experience").value("gt1y"))
                .andExpect(jsonPath("$.profile.disciplines[0]").value("bouldering"))
                .andExpect(jsonPath("$.profile.disciplines[1]").value("lead"))
                .andExpect(jsonPath("$.profile.maxGrade").value("amateur"))
                .andExpect(jsonPath("$.profile.gender").value("male"))
                .andExpect(jsonPath("$.profile.consentAccepted").value(true));

        String updated = PROFILE.replace("Test climber", "  Updated climber  ")
                .replace("180", "181").replace("75", "76").replace("25", "26")
                .replace("gt1y", "m1to3").replace("\"bouldering\",\"lead\"", "\"speed\"")
                .replace("amateur", "advanced").replace("male", "female");
        mvc.perform(put(location).contentType(MediaType.APPLICATION_JSON).content(updated))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.nickname").value("Updated climber"));

        var saved = repository.findById(UUID.fromString(location.substring(location.lastIndexOf('/') + 1)))
                .orElseThrow();
        assertThat(repository.count()).isEqualTo(1);
        assertThat(saved.getNickname()).isEqualTo("Updated climber");
        assertThat(saved.getHeightCm()).isEqualTo(181);
        assertThat(saved.getWeightKg()).isEqualTo(76);
        assertThat(saved.getAgeYears()).isEqualTo(26);
        assertThat(saved.getExperience()).isEqualTo("m1to3");
        assertThat(saved.getDisciplines()).containsExactly("speed");
        assertThat(saved.getMaxGrade()).isEqualTo("advanced");
        assertThat(saved.getGender()).isEqualTo("female");
        assertThat(saved.getConsentAccepted()).isTrue();
    }

    @ParameterizedTest
    @MethodSource("invalidProfiles")
    void rejectsInvalidProfileWithoutSaving(String profile) throws Exception {
        mvc.perform(post("/api/profiles").contentType(MediaType.APPLICATION_JSON).content(profile))
                .andExpect(status().isBadRequest());
        assertThat(repository.count()).isZero();
    }

    static Stream<String> invalidProfiles() {
        return Stream.of(
                PROFILE.replace("Test climber", " "),
                PROFILE.replace("Test climber", "a".repeat(25)),
                PROFILE.replace("180", "119"),
                PROFILE.replace("180", "251"),
                PROFILE.replace("75", "34"),
                PROFILE.replace("75", "201"),
                PROFILE.replace("25", "3"),
                PROFILE.replace("25", "102"),
                PROFILE.replace("gt1y", "unknown"),
                PROFILE.replace("[\"bouldering\",\"lead\"]", "[]"),
                PROFILE.replace("lead", "unknown"),
                PROFILE.replace("lead", "bouldering"),
                PROFILE.replace("amateur", "unknown"),
                PROFILE.replace("male", "unknown"),
                PROFILE.replace("true", "false"),
                PROFILE.replace("180", "null"),
                "{}"
        );
    }

    @Test
    void returnsNotFoundForUnknownProfile() throws Exception {
        String url = "/api/profiles/" + UUID.randomUUID();
        mvc.perform(get(url)).andExpect(status().isNotFound());
        mvc.perform(put(url).contentType(MediaType.APPLICATION_JSON).content(PROFILE))
                .andExpect(status().isNotFound());
        assertThat(repository.count()).isZero();
    }
}
