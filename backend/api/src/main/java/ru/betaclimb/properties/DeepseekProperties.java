package ru.betaclimb.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "deepseek")
public record DeepseekProperties(String apiKey) {
    public DeepseekProperties {
        apiKey = apiKey == null ? "" : apiKey.trim();
    }
}
