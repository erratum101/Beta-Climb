package ru.betaclimb.repositories;

import lombok.Builder;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class AttemptRepository {
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    private static final String SELECT = """
            SELECT id, profile_id, url, file_name, created_at, status, stage, duration_sec, discipline,
                   reject_reason, COALESCE(result_data, '{}'::jsonb) AS result
              FROM videos
            """;


    public List<StoredAttempt> list(String owner, UUID profileId) {
        return jdbc.sql(SELECT + " WHERE owner_key = ? AND profile_id = ? ORDER BY created_at DESC, id DESC")
                .params(owner, profileId)
                .query(this::map)
                .list();
    }

    public Optional<StoredAttempt> find(
            String owner,
            UUID profileId,
            UUID id
    ) {
        return jdbc.sql(SELECT + " WHERE owner_key = ? AND profile_id = ? AND id = ?")
                .params(
                        owner,
                        profileId,
                        id
                )
                .query(this::map)
                .optional();
    }

    public Optional<StoredAttempt> findRequest(String owner, UUID requestId) {
        return jdbc.sql(SELECT + " WHERE owner_key = ? AND request_id = ?")
                .params(owner, requestId)
                .query(this::map)
                .optional();
    }

    @Transactional
    public StoredAttempt insertAndEnqueue(
            String owner,
            UUID requestId,
            UUID id,
            UUID profileId,
            String sourceKey,
            String fileName,
            String discipline,
            String snapshot,
            Runnable onRollback
    ) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                // A connection loss during commit can leave its outcome unknown. Keep the object in that case.
                if (status == STATUS_ROLLED_BACK) onRollback.run();
            }
        });

        int inserted = jdbc.sql("""
                INSERT INTO videos (id, profile_id, url, status, created_at, request_id, owner_key,
                                    file_name, stage, duration_sec, discipline, profile_snapshot)
                VALUES (?, ?, ?, 'processing', timezone('UTC', now()), ?, ?, ?, 'holds', 0, ?, CAST(? AS jsonb))
                ON CONFLICT (owner_key, request_id) DO NOTHING
                """)
                .params(
                        id,
                        profileId,
                        sourceKey,
                        requestId,
                        owner,
                        fileName,
                        discipline,
                        snapshot
                )
                .update();

        if (inserted == 1) {
            jdbc.sql("""
                    INSERT INTO tasks (id, payload, next_attempt_at, tries, created_at, updated_at, status, type, video_id)
                    VALUES (?, '{}'::jsonb, timezone('UTC', now()), 0, timezone('UTC', now()), timezone('UTC', now()),
                            'pending', 'prepare_video', ?)
                    """)
                    .params(UUID.randomUUID(), id)
                    .update();
        }

        return findRequest(owner, requestId).orElseThrow();
    }

    @Transactional
    public void markStage(UUID id, String stage) {
        jdbc.sql("UPDATE videos SET stage = ? WHERE id = ? AND status = 'processing'")
                .params(stage, id)
                .update();
    }

    @Transactional
    public void publishReview(
            UUID id,
            String status,
            double durationSec,
            String resultJson,
            String rejectReason
    ) {
        jdbc.sql("""
                UPDATE videos
                   SET status = ?, stage = 'done', duration_sec = ?, result_data = CAST(? AS jsonb), reject_reason = ?
                 WHERE id = ? AND status = 'processing'
                """)
                .params(
                        status,
                        durationSec,
                        resultJson,
                        rejectReason,
                        id
                )
                .update();
    }

    private StoredAttempt map(ResultSet row, int index) throws SQLException {
        return StoredAttempt.builder()
                .id(row.getObject("id", UUID.class))
                .profileId(row.getObject("profile_id", UUID.class))
                .sourceKey(row.getString("url"))
                .fileName(row.getString("file_name"))
                .createdAt(row.getObject("created_at", LocalDateTime.class).toInstant(ZoneOffset.UTC))
                .status(row.getString("status"))
                .stage(row.getString("stage"))
                .durationSec(row.getDouble("duration_sec"))
                .discipline(row.getString("discipline"))
                .rejectReason(row.getString("reject_reason"))
                .result(json.readTree(row.getString("result")))
                .build();
    }

    @Builder
    public record StoredAttempt(
            UUID id,
            UUID profileId,
            String sourceKey,
            String fileName,
            Instant createdAt,
            String status,
            String stage,
            double durationSec,
            String discipline,
            String rejectReason,
            JsonNode result
    ) {
        public Optional<String> thumbnailKey() {
            String key = result.path("thumbnailKey").asString("");

            if (key.startsWith("betaclimb/" + id + "/") && key.endsWith(".jpg") && !key.contains("..")) {
                return Optional.of(key);
            }

            return Optional.empty();
        }
    }
}
