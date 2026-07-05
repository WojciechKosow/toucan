package com.toucan_motion.toucan.engine;

import java.util.UUID;

/**
 * Turns a natural-language prompt into a self-contained, autoplaying HTML animation. This is the
 * v0.1 product engine (the {@code toucan-motion} CLI), selected behind {@code app.engine=html}.
 *
 * <p>The interface exists so the CLI shell-out ({@link CliAnimationEngine}) can later be swapped for
 * an in-process or hosted implementation without touching the orchestrator. It is deliberately
 * additive: the SceneSpec/Remotion path stays intact behind {@code app.engine=scenespec}.
 */
public interface AnimationEngine {

    /**
     * @param animationId the animation being generated (used for temp-file naming and logging)
     * @param prompt the user's natural-language description
     * @return the generated HTML plus the model's token-usage/cost telemetry
     * @throws EngineException if generation fails (bad exit code, timeout, or I/O error)
     */
    EngineResult generate(UUID animationId, String prompt);
}
