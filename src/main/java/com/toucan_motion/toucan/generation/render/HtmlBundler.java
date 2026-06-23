package com.toucan_motion.toucan.generation.render;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.toucan_motion.toucan.generation.spec.AnimationSpec;
import com.toucan_motion.toucan.generation.spec.Theme;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Assembles the final, self-contained HTML bundle from the shared template, the shared runtime, the
 * per-type renderer, and the baked-in spec + theme JSON.
 *
 * <p>This is the "bundle" step of the spec/render split: one artifact that is simultaneously the
 * hosted preview, the code download, and the source a headless worker captures to MP4. Everything is
 * inlined — no CDNs, no web fonts, no network calls.
 */
@Component
public class HtmlBundler {

    private final ObjectMapper mapper = new ObjectMapper();
    private final Map<String, String> resourceCache = new ConcurrentHashMap<>();

    /**
     * @param title document title (HTML-escaped into {@code <title>})
     * @param spec the validated spec, serialised and baked into the page
     * @param theme the theme tokens, serialised and baked into the page
     * @param rendererResource classpath path of the type renderer JS (e.g. {@code renderer/flow.js})
     */
    public String bundle(String title, AnimationSpec spec, Theme theme, String rendererResource) {
        String template = load("renderer/template.html");
        String runtime = load("renderer/runtime.js");
        String renderer = load(rendererResource);

        String specJson = embedJson(spec);
        String themeJson = embedJson(theme);

        return template
                .replace("@@TITLE@@", htmlEscape(title == null || title.isBlank() ? "Toucan animation" : title))
                .replace("@@SPEC_JSON@@", specJson)
                .replace("@@THEME_JSON@@", themeJson)
                .replace("@@RENDERER_JS@@", renderer)
                .replace("@@RUNTIME_JS@@", runtime);
    }

    /** Serialises to JSON and neutralises {@code </} so the JSON can sit safely in a script tag. */
    private String embedJson(Object value) {
        try {
            return mapper.writeValueAsString(value).replace("</", "<\\/");
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialise spec/theme to JSON", e);
        }
    }

    /** Serialises a spec to canonical JSON for persistence (no script-tag escaping). */
    public String toJson(AnimationSpec spec) {
        try {
            return mapper.writeValueAsString(spec);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialise spec to JSON", e);
        }
    }

    private String load(String resource) {
        return resourceCache.computeIfAbsent(resource, this::readClasspath);
    }

    private String readClasspath(String resource) {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            if (in == null) {
                throw new IllegalStateException("Renderer resource not found on classpath: " + resource);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read renderer resource: " + resource, e);
        }
    }

    private static String htmlEscape(String s) {
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
