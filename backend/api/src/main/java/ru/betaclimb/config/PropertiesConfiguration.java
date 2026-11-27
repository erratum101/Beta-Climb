package ru.betaclimb.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import ru.betaclimb.properties.DeepseekProperties;
import ru.betaclimb.properties.StorageProperties;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({DeepseekProperties.class, StorageProperties.class})
public class PropertiesConfiguration {
}
