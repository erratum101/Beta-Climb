package ru.betaclimb;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class RailwayDatabaseEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    private static final Pattern DATABASE_URL = Pattern.compile(
            "^(?:postgres|postgresql)://(?:([^:@/]+)(?::([^@]*))?@)?([^:/?#]+)(?::(\\d+))?/([^?#]+)");

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        if (present(environment.getProperty("DB_URL")) || present(environment.getProperty("SPRING_DATASOURCE_URL"))) {
            return;
        }

        Map<String, Object> mapped = new HashMap<>();
        String databaseUrl = firstPresent(environment.getProperty("DATABASE_URL"), System.getenv("DATABASE_URL"));

        if (present(databaseUrl)) {
            Matcher matcher = DATABASE_URL.matcher(databaseUrl.trim());
            if (!matcher.find()) {
                throw new IllegalStateException("DATABASE_URL is set but is not a PostgreSQL URL");
            }

            String host = matcher.group(3);
            String port = matcher.group(4) == null ? "5432" : matcher.group(4);
            String database = decode(matcher.group(5));
            String jdbc = "jdbc:postgresql://" + host + ":" + port + "/" + database;

            if (!host.endsWith(".railway.internal") && !host.equals("localhost")) {
                jdbc = jdbc + "?sslmode=require";
            }
            mapped.put("spring.datasource.url", jdbc);
            put(
                    mapped,
                    "spring.datasource.username",
                    decode(matcher.group(1))
            );
            put(
                    mapped,
                    "spring.datasource.password",
                    decode(matcher.group(2))
            );
        } else if (present(environment.getProperty("PGHOST"))) {
            String host = environment.getProperty("PGHOST");
            String port = environment.getProperty("PGPORT", "5432");
            String database = environment.getProperty("PGDATABASE", "railway");
            mapped.put("spring.datasource.url", "jdbc:postgresql://" + host + ":" + port + "/" + database);
            put(
                    mapped,
                    "spring.datasource.username",
                    environment.getProperty("PGUSER")
            );
            put(
                    mapped,
                    "spring.datasource.password",
                    environment.getProperty("PGPASSWORD")
            );
        }

        if (!mapped.isEmpty()) {
            environment.getPropertySources()
                    .addFirst(new MapPropertySource("railwayDatabase", mapped));
        }
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    private static void put(
            Map<String, Object> target,
            String key,
            String value
    ) {
        if (value != null) {
            target.put(key, value);
        }
    }

    private static String firstPresent(String first, String second) {
        return present(first) ? first : second;
    }

    private static boolean present(String value) {
        return value != null && !value.isBlank();
    }

    private static String decode(String value) {
        if (value == null) {
            return null;
        }

        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
