package ru.betaclimb.services;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import ru.betaclimb.repositories.AttemptRepository.StoredAttempt;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
@Builder
public record AttemptData(
        UUID id,
        Instant createdAt,
        String fileName,
        String gradeLabel,
        String discipline,
        String result,
        double durationSec,
        String status,
        String stage,
        String rejectReason,
        int wallVariant,
        Collection<JsonNode> holds,
        Collection<JsonNode> moments,
        String primaryAction,
        Collection<JsonNode> limitations,
        JsonNode route,
        String mediaUrl,
        String thumbnailUrl
) {
    public static AttemptData from(StoredAttempt row) {
        JsonNode data = row.result();
        String base = "/api/attempts/" + row.id();
        String query = "?profileId=" + row.profileId();

        return AttemptData.builder()
                .id(row.id())
                .createdAt(row.createdAt())
                .fileName(row.fileName())
                .gradeLabel(data.path("gradeLabel").asString(""))
                .discipline(row.discipline())
                .result(data.path("result").asString("unknown"))
                .durationSec(row.durationSec())
                .status(row.status())
                .stage(row.stage())
                .rejectReason(row.rejectReason())
                .wallVariant(0)
                .holds(array(data, "holds"))
                .moments(array(data, "moments"))
                .primaryAction(data.path("primaryAction").asString(""))
                .limitations(array(data, "limitations"))
                .route(data.get("route"))
                .mediaUrl(base + "/media" + query)
                .thumbnailUrl(row.thumbnailKey().isPresent() ? base + "/thumbnail" + query : null)
                .build();
    }

    private static Collection<JsonNode> array(JsonNode result, String field) {
        JsonNode value = result.path(field);

        return value.isArray() ? value.values() : List.of();
    }
}
