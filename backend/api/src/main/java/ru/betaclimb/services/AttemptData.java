package ru.betaclimb.services;

import com.fasterxml.jackson.annotation.JsonInclude;
import ru.betaclimb.repositories.AttemptRepository.StoredAttempt;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AttemptData(UUID id, Instant createdAt, String fileName, String gradeLabel, String discipline,
                          String result, double durationSec, String status, String stage, String rejectReason,
                          int wallVariant, Collection<JsonNode> holds, Collection<JsonNode> moments,
                          String primaryAction, Collection<JsonNode> limitations, JsonNode route, String mediaUrl,
                          String thumbnailUrl) {
    public static AttemptData from(StoredAttempt row) {
        JsonNode data = row.result();
        String base = "/api/attempts/" + row.id();
        String query = "?profileId=" + row.profileId();
        return new AttemptData(row.id(), row.createdAt(), row.fileName(), data.path("gradeLabel").asString(""),
                row.discipline(), data.path("result").asString("unknown"), row.durationSec(), row.status(),
                row.stage(), row.rejectReason(), 0, array(data, "holds"), array(data, "moments"),
                data.path("primaryAction").asString(""), array(data, "limitations"), data.get("route"),
                base + "/media" + query, row.thumbnailKey().isPresent() ? base + "/thumbnail" + query : null);
    }

    private static Collection<JsonNode> array(JsonNode result, String field) {
        JsonNode value = result.path(field);
        return value.isArray() ? value.values() : List.of();
    }
}
