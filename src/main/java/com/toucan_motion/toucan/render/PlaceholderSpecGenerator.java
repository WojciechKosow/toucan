package com.toucan_motion.toucan.render;

import com.toucan_motion.toucan.generation.scene.SceneSpec;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Section 4 placeholder for the spec step. The async worker needs a valid {@link SceneSpec} to
 * persist and hand to the renderer so the orchestration spine can be proven end-to-end; the real
 * LLM director that turns a prompt into a bespoke spec is Section 5. Until then this emits a fixed,
 * always-valid two-node graph titled from the prompt. It deliberately does NOT touch the legacy
 * per-type generators — that path is being retired, not extended.
 */
@Component
public class PlaceholderSpecGenerator {

    public SceneSpec generate(String prompt) {
        SceneSpec spec = new SceneSpec();

        SceneSpec.Meta meta = new SceneSpec.Meta();
        meta.setTitle(titleFrom(prompt));
        meta.setDirection("LR");
        spec.setMeta(meta);

        SceneSpec.Element start = node("start", "Start");
        SceneSpec.Element end = node("end", "End");
        spec.setElements(List.of(start, end));

        SceneSpec.Edge edge = new SceneSpec.Edge();
        edge.setId("e1");
        edge.setFrom("start");
        edge.setTo("end");
        edge.setKind("data");
        spec.setEdges(List.of(edge));

        spec.setTimeline(List.of(step("edge.draw", "e1"), step("node.state", "end")));
        return spec;
    }

    private static String titleFrom(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            return "Untitled";
        }
        String trimmed = prompt.strip();
        return trimmed.length() > 80 ? trimmed.substring(0, 80) : trimmed;
    }

    private static SceneSpec.Element node(String id, String label) {
        SceneSpec.Element el = new SceneSpec.Element();
        el.setId(id);
        el.setKind("node");
        el.setProps(Map.of("label", label));
        return el;
    }

    private static SceneSpec.TimelineStep step(String verb, String target) {
        SceneSpec.TimelineStep s = new SceneSpec.TimelineStep();
        s.setVerb(verb);
        s.setTarget(target);
        return s;
    }
}
