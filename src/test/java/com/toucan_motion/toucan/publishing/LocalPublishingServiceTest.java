package com.toucan_motion.toucan.publishing;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalPublishingServiceTest {

    @Test
    void publishWritesBundleAndReturnsUrl(@TempDir Path tempDir) throws Exception {
        LocalPublishingService service =
                new LocalPublishingService(tempDir.toString(), "http://localhost:8080/");
        UUID id = UUID.randomUUID();

        String url = service.publish(id, "<!DOCTYPE html><html></html>");

        assertThat(url).isEqualTo("http://localhost:8080/preview/" + id + "/index.html");
        Path written = tempDir.resolve(id.toString()).resolve("index.html");
        assertThat(Files.readString(written)).contains("<!DOCTYPE html>");
    }
}
