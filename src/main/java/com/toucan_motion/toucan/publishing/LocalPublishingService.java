package com.toucan_motion.toucan.publishing;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * v0.1 publishing: writes a self-contained {@code index.html} to a local directory that Spring Boot
 * serves under {@code /preview/**} (see {@code StaticResourceConfig}). Swap this bean for a
 * Cloudflare R2 implementation later — no caller changes.
 */
@Service
public class LocalPublishingService implements PublishingService {

    private final Path publishDir;
    private final String baseUrl;

    public LocalPublishingService(
            @Value("${app.publish.dir:published}") String publishDir,
            @Value("${app.publish.base-url:http://localhost:8080}") String baseUrl) {
        this.publishDir = Paths.get(publishDir).toAbsolutePath().normalize();
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    @Override
    public String publish(UUID animationId, String html) {
        try {
            Path dir = publishDir.resolve(animationId.toString());
            Files.createDirectories(dir);
            Files.writeString(dir.resolve("index.html"), html, StandardCharsets.UTF_8);
            return baseUrl + "/preview/" + animationId + "/index.html";
        } catch (IOException e) {
            throw new RuntimeException("Failed to publish animation " + animationId, e);
        }
    }

    @Override
    public RenderArtifacts publishRender(UUID animationId, byte[] mp4, byte[] poster) {
        try {
            Path dir = publishDir.resolve(animationId.toString());
            Files.createDirectories(dir);
            Files.write(dir.resolve("render.mp4"), mp4);
            String mp4Url = baseUrl + "/preview/" + animationId + "/render.mp4";
            String posterUrl = null;
            if (poster != null && poster.length > 0) {
                Files.write(dir.resolve("poster.png"), poster);
                posterUrl = baseUrl + "/preview/" + animationId + "/poster.png";
            }
            return new RenderArtifacts(mp4Url, posterUrl);
        } catch (IOException e) {
            throw new RuntimeException("Failed to publish render for animation " + animationId, e);
        }
    }
}
