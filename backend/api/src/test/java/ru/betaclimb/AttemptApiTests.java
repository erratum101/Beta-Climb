package ru.betaclimb;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import ru.betaclimb.services.ProfileData;
import ru.betaclimb.services.ProfileService;
import ru.betaclimb.services.VideoStorage;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "DB_SCHEMA=betaclimb")
@AutoConfigureMockMvc
@Import(PostgresTestConfiguration.class)
class AttemptApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ProfileService profiles;
    @Autowired ObjectMapper json;
    @MockitoBean VideoStorage storage;

    @Test
    void uploadAndRetryPublishOneTaskAndPrivateResult() throws Exception {
        UUID profile = profile();
        UUID requestId = UUID.randomUUID();
        Cookie owner = owner(profile);
        String id = upload(profile, requestId, owner);
        assertThat(upload(profile, requestId, owner)).isEqualTo(id);
        verify(storage, times(1)).upload(any(), any(), eq("video/mp4"));
        assertThat(db.queryForObject("SELECT count(*) FROM tasks WHERE video_id = ? AND status = 'pending' "
                + "AND type = 'prepare_video'", Integer.class, UUID.fromString(id))).isEqualTo(1);
        assertThat(db.queryForObject("SELECT profile_snapshot ->> 'experience' FROM videos WHERE id = ?",
                String.class, UUID.fromString(id))).isEqualTo("gt1y");
        String url = "/api/attempts/" + id;
        mvc.perform(get(url).param("profileId", profile.toString()).cookie(owner))
                .andExpect(status().isOk()).andExpect(jsonPath("$.owner_key").doesNotExist())
                .andExpect(jsonPath("$.fileName").value("climb.mp4"));
        mvc.perform(get(url).param("profileId", profile.toString())).andExpect(status().isNotFound());
        mvc.perform(get(url + "/media").param("profileId", profile.toString())).andExpect(status().isNotFound());
        mvc.perform(get("/api/attempts").param("profileId", profile.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        String playback = "betaclimb/" + id + "/runs/sample/prepared.mp4";
        db.update("UPDATE videos SET result_data=jsonb_build_object('playbackKey', CAST(? AS text)) WHERE id=?",
                playback, UUID.fromString(id));
        URI signed = URI.create("https://storage.example.test/private/video");
        when(storage.inlineUrl(playback)).thenReturn(signed);
        mvc.perform(get(url + "/media").param("profileId", profile.toString()).cookie(owner))
                .andExpect(status().isTemporaryRedirect()).andExpect(header().string("Location", signed.toString()));
    }

    @Test
    void onlyTheOwnerCanOpenTheThumbnailAfterItIsPublished() throws Exception {
        UUID profile = profile();
        Cookie owner = owner(profile);
        UUID id = UUID.fromString(upload(profile, UUID.randomUUID(), owner));
        String thumbnail = "/api/attempts/" + id + "/thumbnail";
        String setThumbnail = "UPDATE videos SET result_data=jsonb_build_object('thumbnailKey', CAST(? AS text)) WHERE id=?";

        mvc.perform(get("/api/attempts").param("profileId", profile.toString()).cookie(owner))
                .andExpect(jsonPath("$[0].thumbnailUrl").doesNotExist())
                .andExpect(jsonPath("$[0].mediaUrl").exists());
        mvc.perform(get(thumbnail).param("profileId", profile.toString()).cookie(owner)).andExpect(status().isNotFound());
        db.update(setThumbnail, "betaclimb/" + UUID.randomUUID() + "/runs/sample/thumbnail.jpg", id);
        mvc.perform(get(thumbnail).param("profileId", profile.toString()).cookie(owner)).andExpect(status().isNotFound());

        String key = "betaclimb/" + id + "/runs/sample/thumbnail.jpg";
        db.update(setThumbnail, key, id);
        URI signed = URI.create("https://storage.example.test/private/thumbnail");
        when(storage.inlineUrl(key)).thenReturn(signed);
        mvc.perform(get("/api/attempts").param("profileId", profile.toString()).cookie(owner))
                .andExpect(jsonPath("$[0].thumbnailUrl").value(thumbnail + "?profileId=" + profile));
        mvc.perform(get(thumbnail).param("profileId", profile.toString())).andExpect(status().isNotFound());
        mvc.perform(get(thumbnail).param("profileId", UUID.randomUUID().toString()).cookie(owner))
                .andExpect(status().isNotFound());
        mvc.perform(get(thumbnail).param("profileId", profile.toString()).cookie(owner))
                .andExpect(status().isTemporaryRedirect()).andExpect(header().string("Location", signed.toString()));
        verify(storage).inlineUrl(key);
    }

    @Test
    void concurrentCopiesOnlyRemoveTheLosingObject() throws Exception {
        UUID profile = profile();
        Cookie owner = owner(profile);
        UUID requestId = UUID.randomUUID();
        CyclicBarrier uploads = new CyclicBarrier(2);
        doAnswer(invocation -> { uploads.await(10, TimeUnit.SECONDS); return null; })
                .when(storage).upload(any(), any(), any());
        Callable<String> send = () -> upload(profile, requestId, owner);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(send);
            var second = executor.submit(send);
            String winner = first.get(20, TimeUnit.SECONDS);
            assertThat(second.get(20, TimeUnit.SECONDS)).isEqualTo(winner);
            var removed = org.mockito.ArgumentCaptor.forClass(String.class);
            verify(storage).delete(removed.capture());
            assertThat(removed.getValue()).isNotEqualTo("betaclimb/" + winner + "/source");
            assertThat(db.queryForObject("SELECT count(*) FROM tasks WHERE video_id = ?", Integer.class,
                    UUID.fromString(winner))).isEqualTo(1);
        }
    }

    @Test
    void failedEnqueueRollsBackVideoAndDiscardsItsObject() throws Exception {
        UUID profile = profile();
        UUID requestId = UUID.randomUUID();
        Cookie owner = owner(profile);
        db.execute("ALTER TABLE tasks ADD CONSTRAINT test_reject_prepare CHECK (type <> 'prepare_video') NOT VALID");
        try {
            assertThatThrownBy(() -> upload(profile, requestId, owner))
                    .hasRootCauseInstanceOf(java.sql.SQLException.class);
        } finally {
            db.execute("ALTER TABLE tasks DROP CONSTRAINT test_reject_prepare");
        }
        assertThat(db.queryForObject("SELECT count(*) FROM videos WHERE request_id = ?", Integer.class, requestId))
                .isZero();
        verify(storage).delete(any());
    }

    private UUID profile() {
        return profiles.create(new ProfileData("Test", 175, 70, 25, "gt1y", List.of("bouldering"), "amateur",
                "female", true)).id();
    }

    private Cookie owner(UUID profile) throws Exception {
        return mvc.perform(get("/api/attempts").param("profileId", profile.toString()))
                .andExpect(status().isOk()).andReturn().getResponse().getCookie("betaclimb-owner");
    }

    private String upload(UUID profile, UUID requestId, Cookie owner) throws Exception {
        MockMultipartHttpServletRequestBuilder form = multipart("/api/attempts");
        form.file(new MockMultipartFile("file", "climb.mp4", "video/mp4", new byte[]{1, 2, 3}));
        var response = mvc.perform(form.param("profileId", profile.toString()).header("Idempotency-Key", requestId)
                        .cookie(owner)).andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("processing"))
                .andReturn().getResponse();
        return json.readTree(response.getContentAsString()).get("id").asString();
    }
}
