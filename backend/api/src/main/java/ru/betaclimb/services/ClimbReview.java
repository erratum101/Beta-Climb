package ru.betaclimb.services;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import ru.betaclimb.properties.DeepseekProperties;
import ru.betaclimb.repositories.AttemptRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ClimbReview {
    private static final Logger LOG = LoggerFactory.getLogger(ClimbReview.class);
    private static final Set<String> CATEGORIES = Set.of(
            "feet",
            "body",
            "sequence",
            "balance",
            "setup"
    );
    private static final URI ENDPOINT = URI.create("https://api.deepseek.com/chat/completions");

    private final AttemptRepository attempts;
    private final ObjectMapper json;
    private final DeepseekProperties properties;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public void start(
            UUID id,
            byte[] frame,
            double durationSec,
            ProfileData profile
    ) {
        Thread.ofVirtual()
                .name("climb-review-" + id)
                .start(() -> review(
                        id,
                        frame,
                        durationSec,
                        profile
                ));
    }

    private void review(
            UUID id,
            byte[] frame,
            double durationSec,
            ProfileData profile
    ) {
        double duration = durationSec > 0 && durationSec < 3600 ? durationSec : 8;

        try {
            if (properties.apiKey().isBlank()) {
                attempts.publishReview(
                        id,
                        "failed",
                        duration,
                        "{}",
                        "Не задан ключ DeepSeek, разбор кадра невозможен."
                );
                return;
            }

            attempts.markStage(id, "movement");
            String answer = ask(frame, profile);

            attempts.markStage(id, "rules");
            ObjectNode result = toResult(answer, duration);
            String status = result.path("moments").size() == 0 ? "limited" : "ready";

            attempts.publishReview(
                    id,
                    status,
                    duration,
                    json.writeValueAsString(result),
                    null
            );
        } catch (RuntimeException error) {
            LOG.warn(
                    "review failed for {}: {}",
                    id,
                    error.getClass().getSimpleName()
            );
            attempts.publishReview(
                    id,
                    "failed",
                    duration,
                    "{}",
                    "Не удалось получить разбор кадра. Попробуй ещё раз."
            );
        }
    }

    private String ask(byte[] frame, ProfileData profile) {
        ObjectNode body = json.createObjectNode();
        body.put("model", "deepseek-flash");
        body.put("stream", false);

        ArrayNode messages = body.putArray("messages");
        ObjectNode user = messages.addObject();
        user.put("role", "user");

        String prompt = """
                Ты тренер по скалолазанию. По одному кадру попытки дай от 1 до 3 коротких совета на русском.
                Ответь только JSON без пояснений:
                {"moments":[{"category":"feet","title":"...","problem":"...","happened":"...","action":"..."}]}
                category только feet, body, sequence, balance или setup.
                Не выдумывай секунды, номера зацепок и ссылки. Если на кадре нет лазания, верни {"moments":[]}.
                Опыт: %s. Дисциплины: %s.
                """.formatted(profile.experience(), String.join(", ", profile.disciplines()));

        if (frame == null || frame.length == 0) {
            user.put("content", prompt);
        } else {
            ArrayNode content = user.putArray("content");
            content.addObject()
                    .put("type", "text")
                    .put("text", prompt);
            content.addObject()
                    .put("type", "image_url")
                    .putObject("image_url")
                    .put("url", "data:image/jpeg;base64," + Base64.getEncoder().encodeToString(frame));
        }

        HttpRequest request = HttpRequest.newBuilder(ENDPOINT)
                .timeout(Duration.ofSeconds(90))
                .header("Authorization", "Bearer " + properties.apiKey())
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception error) {
            throw new IllegalStateException("deepseek request failed", error);
        }

        if (response.statusCode() / 100 != 2) {
            throw new IllegalStateException("deepseek status " + response.statusCode());
        }

        String content = json.readTree(response.body())
                .path("choices")
                .path(0)
                .path("message")
                .path("content")
                .asString("");
        if (content.isBlank()) {
            throw new IllegalStateException("empty completion");
        }

        return content;
    }

    private ObjectNode toResult(String answer, double duration) {
        String text = answer.trim();

        if (text.startsWith("```")) {
            text = text.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        }

        JsonNode parsed;

        try {
            parsed = json.readTree(text);
        } catch (RuntimeException error) {
            parsed = json.createObjectNode();
        }

        ObjectNode result = json.createObjectNode();
        result.put("result", "unknown");

        ArrayNode moments = result.putArray("moments");
        ArrayNode limitations = result.putArray("limitations");
        limitations.add("Совет собран по одному кадру, без покадрового трекинга движений.");

        JsonNode incoming = parsed.path("moments");
        double start = Math.max(0, Math.min(duration * 0.35, Math.max(0, duration - 0.4)));
        double end = Math.min(duration, start + Math.min(4, Math.max(0.4, duration * 0.25)));

        if (end <= start) end = Math.min(duration, start + 0.4);

        if (incoming.isArray()) {
            for (JsonNode item : incoming) {
                if (moments.size() >= 3) break;

                String category = item.path("category").asString("");
                String title = clip(item.path("title").asString(""));
                String problem = clip(item.path("problem").asString(""));
                String happened = clip(item.path("happened").asString(""));
                String action = clip(item.path("action").asString(""));

                if (!CATEGORIES.contains(category) || title.isBlank() || problem.isBlank() || action.isBlank()) continue;
                if (happened.isBlank()) happened = "На кадре видно положение, из которого следует этот совет.";

                ObjectNode moment = moments.addObject();
                moment.put("id", "moment-" + (moments.size()));
                moment.put("category", category);
                moment.put("title", title);
                moment.put("timeSec", start);
                moment.put("startSec", start);
                moment.put("endSec", end);
                moment.put("problem", problem);
                moment.put("happened", happened);
                moment.put("action", action);
                moment.put("primary", moments.size() == 1);
                moment.putArray("holdIds");
                moment.putArray("sources");
            }
        }

        if (!moments.isEmpty()) {
            result.put("primaryAction", moments.get(0)
                    .path("action")
                    .asString(""));
        }

        result.putObject("route").put("status", "unknown");
        result.putArray("holds");

        return result;
    }

    private static String clip(String value) {
        String clean = value == null ? "" : value.strip().replaceAll("\\p{Cntrl}", "");

        return clean.length() <= 450 ? clean : clean.substring(0, 450);
    }
}
