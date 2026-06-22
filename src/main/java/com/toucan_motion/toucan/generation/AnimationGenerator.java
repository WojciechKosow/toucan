package com.toucan_motion.toucan.generation;

import com.toucan_motion.toucan.entity.AnimationType;

/**
 * One strategy per animation type. Each generator owns its constrained prompt template (where output
 * quality lives) and a deterministic stub used when no model is configured.
 */
public interface AnimationGenerator {

    /** The animation type this generator handles. */
    AnimationType type();

    /**
     * Produces a complete, self-contained HTML document for the given user description.
     *
     * @param description the user's natural-language prompt
     * @return a single self-contained HTML document (no external network dependencies)
     */
    String generate(String description);
}
