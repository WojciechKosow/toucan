package com.toucan_motion.toucan.config;

import java.nio.file.Paths;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves published animation bundles (written by {@code LocalPublishingService}) as static content
 * at {@code /preview/**}. This path is made public in {@code SecurityConfig} so hosted preview links
 * are shareable and embeddable.
 */
@Configuration
public class StaticResourceConfig implements WebMvcConfigurer {

    private final String publishDir;

    public StaticResourceConfig(@Value("${app.publish.dir:published}") String publishDir) {
        this.publishDir = publishDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Paths.get(publishDir).toAbsolutePath().normalize().toUri().toString();
        registry.addResourceHandler("/preview/**").addResourceLocations(location);
    }
}
