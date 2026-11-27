package ru.betaclimb;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import ru.betaclimb.controllers.ApiExceptionHandler;
import ru.betaclimb.controllers.ProfileController;
import ru.betaclimb.services.ProfileService;

import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ApiExceptionHandlerTests {
    private final ProfileService profiles = mock(ProfileService.class);
    private final MockMvc mvc = standaloneSetup(new ProfileController(profiles))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();

    @Test
    void returnsApplicationStatusAndMessageForMissingProfile() throws Exception {
        UUID id = UUID.randomUUID();
        when(profiles.find(id)).thenReturn(Optional.empty());

        mvc.perform(get("/api/profiles/" + id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value("PROFILE_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Профиль не найден."))
                .andExpect(jsonPath("$.httpStatus").doesNotHaveJsonPath());
    }

    @Test
    void keepsSpringStatusAndHeadersForInvalidRequests() throws Exception {
        mvc.perform(get("/api/profiles/not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("INVALID_REQUEST"));

        mvc.perform(post("/api/profiles/" + UUID.randomUUID()))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string(HttpHeaders.ALLOW, containsString("GET")))
                .andExpect(jsonPath("$.status").value("HTTP_ERROR"));
    }

    @Test
    void returnsPublicMessageForUnexpectedFailure() throws Exception {
        UUID id = UUID.randomUUID();
        when(profiles.find(id)).thenThrow(new IllegalStateException("Database connection failed"));

        mvc.perform(get("/api/profiles/" + id))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.status").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.message").value("Произошла внутренняя ошибка. Попробуй ещё раз."));
    }
}
