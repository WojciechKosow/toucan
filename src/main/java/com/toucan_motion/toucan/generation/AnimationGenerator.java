package com.toucan_motion.toucan.generation;

import com.toucan_motion.toucan.entity.AnimationType;

/**
 * One strategy per animation type. Each generator owns its constrained, schema-shaped prompt (the LLM
 * returns a JSON <em>spec</em>, never animation code) and a deterministic stub spec used when no model
 * is configured. The shared, hand-built renderer turns the validated spec into the final bundle.
 */
public interface AnimationGenerator {

    /** The animation type this generator handles. */
    AnimationType type();

    /**
     * Produces a complete, self-contained HTML bundle (plus the validated spec it was rendered from)
     * for the given user description.
     *
     * @param description the user's natural-language prompt
     * @return the rendered bundle and its canonical spec JSON
     */
    GeneratedAnimation generate(String description);
}
