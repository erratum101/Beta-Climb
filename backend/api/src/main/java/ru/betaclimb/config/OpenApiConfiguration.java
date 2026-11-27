package ru.betaclimb.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@OpenAPIDefinition(info = @Info(
        title = "Beta Climb API",
        version = "1.0",
        description = "API профилей скалолазов и попыток прохождения трасс."
))
public class OpenApiConfiguration {
}
