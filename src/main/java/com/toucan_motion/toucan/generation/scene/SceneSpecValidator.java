package com.toucan_motion.toucan.generation.scene;

import com.toucan_motion.toucan.generation.scene.SceneSpec.Edge;
import com.toucan_motion.toucan.generation.scene.SceneSpec.Element;
import com.toucan_motion.toucan.generation.scene.SceneSpec.Meta;
import com.toucan_motion.toucan.generation.scene.SceneSpec.TimelineStep;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * The canonical gatekeeper for {@link SceneSpec}. Nothing reaches the renderer
 * without passing here. Mirrors the zod schema in {@code packages/spec} exactly so
 * the Java and TypeScript validators agree on what is valid.
 *
 * <p>Enforces, in order: the envelope (counts/durations), closed vocabularies
 * (element {@code kind}, edge {@code kind}, timeline {@code verb}, layout
 * {@code direction}), and referential integrity (unique ids; disjoint
 * element/edge id-spaces; every edge endpoint, group member and timeline target
 * resolves to a declared id of the kind its verb acts on). On any violation it
 * throws {@link IllegalArgumentException} with a precise, single-line message.
 *
 * <p>All kind/verb dispatch goes through the registries below — never an inline
 * {@code switch}. Extending the kit means adding a registry entry (a deliberate,
 * reviewed act), not editing control flow.
 */
@Component
public class SceneSpecValidator {

    // ── envelope limits (mirror LIMITS in packages/spec) ──
    public static final int MAX_ELEMENTS = 24;
    public static final int MAX_EDGES = 48;
    public static final int MAX_TIMELINE = 64;
    public static final int BEAT_MIN_MS = 300;
    public static final int BEAT_MAX_MS = 6000;

    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_-]+$");

    private static final Set<String> ELEMENT_KINDS =
            Set.of("node", "browser", "group", "label", "edge-label");
    private static final Set<String> EDGE_KINDS =
            Set.of("data", "control", "request", "response", "query", "reference");
    private static final Set<String> VERBS =
            Set.of(
                    "camera.focus",
                    "packet.travel",
                    "node.state",
                    "highlight",
                    "edge.draw",
                    "label.show");
    private static final Set<String> DIRECTIONS = Set.of("LR", "RL", "TB", "BT");

    /** What id-space each verb's target must resolve to. Registry — never a switch. */
    private enum TargetType {
        ELEMENT,
        EDGE,
        ANY
    }

    private static final Map<String, TargetType> VERB_TARGET =
            Map.of(
                    "camera.focus", TargetType.ELEMENT,
                    "packet.travel", TargetType.EDGE,
                    "node.state", TargetType.ELEMENT,
                    "highlight", TargetType.ANY,
                    "edge.draw", TargetType.EDGE,
                    "label.show", TargetType.ELEMENT);

    /** Intrinsic per-kind prop requirements. Registry — never a switch. */
    @FunctionalInterface
    private interface ElementRule {
        void check(Element el);
    }

    private static final Map<String, ElementRule> ELEMENT_RULES =
            Map.of(
                    "node", el -> requireText(el, "label"),
                    "browser", el -> {}, // label is optional (renderer defaults it)
                    "label", el -> requireText(el, "text"),
                    "edge-label", el -> requireText(el, "text"),
                    "group", SceneSpecValidator::requireMembers);

    /** Validates the spec in place; throws {@link IllegalArgumentException} on any violation. */
    public void validate(SceneSpec spec) {
        if (spec == null) {
            throw new IllegalArgumentException("SceneSpec is null.");
        }
        validateMeta(spec.getMeta());

        List<Element> elements = spec.getElements();
        List<Edge> edges = spec.getEdges() == null ? List.of() : spec.getEdges();
        List<TimelineStep> timeline = spec.getTimeline();

        if (elements == null || elements.isEmpty()) {
            throw new IllegalArgumentException("A SceneSpec needs at least one element.");
        }
        if (elements.size() > MAX_ELEMENTS) {
            throw new IllegalArgumentException(
                    "Too many elements: " + elements.size() + " (max " + MAX_ELEMENTS + ").");
        }
        if (edges.size() > MAX_EDGES) {
            throw new IllegalArgumentException(
                    "Too many edges: " + edges.size() + " (max " + MAX_EDGES + ").");
        }
        if (timeline == null || timeline.isEmpty()) {
            throw new IllegalArgumentException("A SceneSpec needs at least one timeline step.");
        }
        if (timeline.size() > MAX_TIMELINE) {
            throw new IllegalArgumentException(
                    "Too many timeline steps: " + timeline.size() + " (max " + MAX_TIMELINE + ").");
        }

        Set<String> elementIds = new HashSet<>();
        for (Element el : elements) {
            requireSlug(el.getId(), "element id");
            if (!elementIds.add(el.getId())) {
                throw new IllegalArgumentException("Duplicate element id \"" + el.getId() + "\".");
            }
            ElementRule rule = ELEMENT_RULES.get(el.getKind());
            if (rule == null) {
                throw new IllegalArgumentException(
                        "Unknown element kind \"" + el.getKind() + "\" on element \"" + el.getId() + "\".");
            }
            rule.check(el);
        }

        Set<String> edgeIds = new HashSet<>();
        for (Edge e : edges) {
            requireSlug(e.getId(), "edge id");
            if (!edgeIds.add(e.getId())) {
                throw new IllegalArgumentException("Duplicate edge id \"" + e.getId() + "\".");
            }
            if (elementIds.contains(e.getId())) {
                throw new IllegalArgumentException(
                        "Edge id \"" + e.getId() + "\" collides with an element id (id-spaces must be disjoint).");
            }
            String kind = e.getKind() == null ? "data" : e.getKind();
            if (!EDGE_KINDS.contains(kind)) {
                throw new IllegalArgumentException(
                        "Unknown edge kind \"" + kind + "\" on edge \"" + e.getId() + "\".");
            }
            if (!elementIds.contains(e.getFrom())) {
                throw new IllegalArgumentException(
                        "Edge \"" + e.getId() + "\" references unknown source element \"" + e.getFrom() + "\".");
            }
            if (!elementIds.contains(e.getTo())) {
                throw new IllegalArgumentException(
                        "Edge \"" + e.getId() + "\" references unknown target element \"" + e.getTo() + "\".");
            }
        }

        // group members must resolve to declared elements
        for (Element el : elements) {
            if ("group".equals(el.getKind())) {
                for (String member : members(el)) {
                    if (!elementIds.contains(member)) {
                        throw new IllegalArgumentException(
                                "Group \"" + el.getId() + "\" references unknown member element \"" + member + "\".");
                    }
                }
            }
        }

        // timeline: verb known, target resolves to the right id-space, after resolves
        for (int i = 0; i < timeline.size(); i++) {
            TimelineStep step = timeline.get(i);
            TargetType want = VERB_TARGET.get(step.getVerb());
            if (want == null) {
                throw new IllegalArgumentException(
                        "Unknown timeline verb \"" + step.getVerb() + "\" at step " + i + ".");
            }
            boolean isElement = elementIds.contains(step.getTarget());
            boolean isEdge = edgeIds.contains(step.getTarget());
            boolean resolves =
                    switch (want) {
                        case ELEMENT -> isElement;
                        case EDGE -> isEdge;
                        case ANY -> isElement || isEdge;
                    };
            if (!resolves) {
                throw new IllegalArgumentException(
                        "timeline["
                                + i
                                + "] verb \""
                                + step.getVerb()
                                + "\" target \""
                                + step.getTarget()
                                + "\" does not resolve to "
                                + (want == TargetType.ANY ? "an element or edge" : want.name().toLowerCase())
                                + ".");
            }
            if (step.getAfter() != null
                    && !elementIds.contains(step.getAfter())
                    && !edgeIds.contains(step.getAfter())) {
                throw new IllegalArgumentException(
                        "timeline[" + i + "] \"after\" references unknown id \"" + step.getAfter() + "\".");
            }
        }
    }

    private void validateMeta(Meta meta) {
        if (meta == null || meta.getTitle() == null || meta.getTitle().isBlank()) {
            throw new IllegalArgumentException("SceneSpec.meta.title is required.");
        }
        String dir = meta.getDirection() == null ? "LR" : meta.getDirection();
        if (!DIRECTIONS.contains(dir)) {
            throw new IllegalArgumentException("Unknown layout direction \"" + dir + "\".");
        }
        Integer beat = meta.getBeatDurationMs();
        if (beat != null && (beat < BEAT_MIN_MS || beat > BEAT_MAX_MS)) {
            throw new IllegalArgumentException(
                    "meta.beatDurationMs " + beat + " out of range [" + BEAT_MIN_MS + ", " + BEAT_MAX_MS + "].");
        }
    }

    // ── shared helpers (used by the element-rule registry) ──

    private static void requireText(Element el, String key) {
        Object v = el.getProps() == null ? null : el.getProps().get(key);
        if (!(v instanceof String s) || s.isBlank()) {
            throw new IllegalArgumentException(
                    "Element \"" + el.getId() + "\" (" + el.getKind() + ") requires a non-empty \"" + key + "\".");
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> members(Element el) {
        Object v = el.getProps() == null ? null : el.getProps().get("members");
        if (v instanceof List<?> list) {
            return (List<String>) list;
        }
        return List.of();
    }

    private static void requireMembers(Element el) {
        Object v = el.getProps() == null ? null : el.getProps().get("members");
        if (!(v instanceof List<?> list) || list.isEmpty()) {
            throw new IllegalArgumentException(
                    "Group \"" + el.getId() + "\" requires a non-empty \"members\" list.");
        }
    }

    private static void requireSlug(String id, String what) {
        if (id == null || id.isBlank() || !ID.matcher(id).matches()) {
            throw new IllegalArgumentException(
                    "Invalid " + what + " \"" + id + "\" (must be a short slug: letters, digits, - or _).");
        }
    }
}
