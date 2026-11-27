package ru.betaclimb.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

@ConfigurationProperties(prefix = "storage")
public record StorageProperties(Path dir) {
    public StorageProperties {
        dir = (dir == null ? Path.of("data/media") : dir).toAbsolutePath().normalize();
    }
}
