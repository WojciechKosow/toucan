package com.toucan_motion.toucan.generation.spec;

/**
 * A validated, content-only description of an animation. The LLM produces one of these (as JSON); the
 * renderer consumes it. A spec decides <em>what</em> is shown — labels, order, counts, operations —
 * and never <em>how</em> it animates; all timing, layout and motion live in the deterministic
 * renderer.
 */
public interface AnimationSpec {

    /** The {@code type} discriminator baked into the JSON (e.g. {@code "flow"}). */
    String wireType();

    /**
     * Clamps and normalises the spec into the v0.1-supported envelope (node counts, element sizes,
     * sane beat durations, …) and throws {@link IllegalArgumentException} only when the content is too
     * broken to render. Called after parsing whether the spec came from the model or a stub, so the
     * renderer can assume a well-formed spec.
     */
    void validateAndRepair();
}
