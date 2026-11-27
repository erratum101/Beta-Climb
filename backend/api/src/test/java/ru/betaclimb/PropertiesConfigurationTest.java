package ru.betaclimb;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import ru.betaclimb.config.PropertiesConfiguration;
import ru.betaclimb.properties.DeepseekProperties;
import ru.betaclimb.properties.StorageProperties;
import ru.betaclimb.services.VideoStorage;

import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class PropertiesConfigurationTest {
    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withUserConfiguration(PropertiesConfiguration.class);

    @TempDir
    Path temporaryDirectory;

    @Test
    void registersPropertiesWithDefaults() {
        contextRunner.run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(DeepseekProperties.class).apiKey()).isEmpty();
            assertThat(context.getBean(StorageProperties.class).dir())
                    .isEqualTo(Path.of("data/media").toAbsolutePath().normalize());
        });
    }

    @Test
    void bindsAndNormalizesConfiguredValues() {
        Path directory = temporaryDirectory.resolve("unused/../media");

        contextRunner.withPropertyValues(
                        "deepseek.api-key=  test-key  ",
                        "storage.dir=" + directory
                )
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(DeepseekProperties.class).apiKey()).isEqualTo("test-key");
                    assertThat(context.getBean(StorageProperties.class).dir())
                            .isEqualTo(temporaryDirectory.resolve("media"));
                });
    }

    @Test
    void initializesStorageDirectoryAfterInjection() {
        Path directory = temporaryDirectory.resolve("media");

        contextRunner.withPropertyValues("storage.dir=" + directory)
                .withBean(VideoStorage.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(VideoStorage.class);
                    assertThat(directory).isDirectory();
                });
    }
}
