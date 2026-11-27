package ru.betaclimb;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import ru.betaclimb.config.OpenApiConfiguration;
import ru.betaclimb.controllers.ApiExceptionHandler;
import ru.betaclimb.controllers.AttemptController;
import ru.betaclimb.controllers.ProfileController;
import ru.betaclimb.services.AttemptService;
import ru.betaclimb.services.ProfileService;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(classes = OpenApiTests.TestConfiguration.class)
@AutoConfigureMockMvc
class OpenApiTests {
    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ProfileService profiles;

    @MockitoBean
    private AttemptService attempts;

    @Test
    void exposesControllerOperationsAndUploadSchema() throws Exception {
        mvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("Beta Climb API"))
                .andExpect(jsonPath("$.paths['/api/profiles'].post").exists())
                .andExpect(jsonPath("$.paths['/api/profiles'].post.responses['201'].content['application/json'].schema['$ref']")
                        .value("#/components/schemas/SavedProfile"))
                .andExpect(jsonPath("$.paths['/api/profiles/{id}'].put").exists())
                .andExpect(jsonPath("$.paths['/api/attempts'].get").exists())
                .andExpect(jsonPath("$.paths['/api/attempts'].post.requestBody.content['multipart/form-data']").exists())
                .andExpect(jsonPath("$.paths['/api/attempts'].post.responses['202'].content['application/json'].schema['$ref']")
                        .value("#/components/schemas/AttemptData"))
                .andExpect(jsonPath("$.paths['/api/attempts'].post.responses['409'].content['application/json'].schema['$ref']")
                        .value("#/components/schemas/ApiError"))
                .andExpect(jsonPath("$.paths['/api/attempts'].post.parameters[?(@.name == 'Idempotency-Key')].required")
                        .value(hasItem(true)))
                .andExpect(jsonPath("$.paths['/api/attempts/{id}/media'].get").exists())
                .andExpect(jsonPath("$.paths['/api/attempts/{id}/media'].get.responses['200'].content['application/octet-stream'].schema.format")
                        .value("binary"))
                .andExpect(jsonPath("$.paths['/error']").doesNotExist());
    }

    @Test
    void servesSwaggerUiAndConfiguration() throws Exception {
        mvc.perform(get("/swagger-ui.html"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/swagger-ui/index.html"));

        mvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Swagger UI")));

        mvc.perform(get("/v3/api-docs/swagger-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").value("/v3/api-docs"));
    }

    @Configuration(proxyBeanMethods = false)
    @EnableAutoConfiguration(exclude = DataSourceAutoConfiguration.class)
    @Import({OpenApiConfiguration.class, ProfileController.class, AttemptController.class, ApiExceptionHandler.class})
    static class TestConfiguration {
    }
}
