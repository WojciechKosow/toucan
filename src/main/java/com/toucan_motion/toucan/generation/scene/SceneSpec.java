package com.toucan_motion.toucan.generation.scene;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.Data;

/**
 * The unified element + edge + timeline IR — the single contract the AI emits and
 * the renderer consumes. Mirrors {@code packages/spec} (the zod schema is the
 * shared source of truth). A SceneSpec decides <em>what</em> is shown and how it
 * connects; it never carries coordinates — positions are computed by the
 * deterministic auto-layout pass in the renderer.
 *
 * <p>Structure here is intentionally permissive (per-kind props are a free map);
 * the {@link SceneSpecValidator} is the gatekeeper that enforces closed
 * vocabularies, referential integrity, and the envelope before a spec is allowed
 * near the renderer.
 */
@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class SceneSpec {

    private Meta meta;
    private List<Element> elements = new ArrayList<>();
    private List<Edge> edges = new ArrayList<>();
    private List<TimelineStep> timeline = new ArrayList<>();

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Meta {
        private String title;
        /** Optional internal director hint (topic class) — never user-facing. */
        private String topic;
        private String direction = "LR";
        private Map<String, Object> themeParams;
        private Integer beatDurationMs;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Element {
        private String id;
        private String kind;
        private Map<String, Object> props = new LinkedHashMap<>();
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Edge {
        private String id;
        private String from;
        private String to;
        private String kind = "data";
        private String label;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class TimelineStep {
        private String verb;
        /** id of the element or edge this verb acts on. */
        private String target;
        private Integer at;
        private String after;
        private Map<String, Object> args;
    }
}
