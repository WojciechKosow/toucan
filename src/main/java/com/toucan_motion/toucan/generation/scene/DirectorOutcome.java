package com.toucan_motion.toucan.generation.scene;

/**
 * The measured result of one live director run — what the provider bake-off records. {@code
 * reprompts} is 0 when the first response validated, 1 when the single repair-reprompt was needed.
 * {@code valid} is false only when even the repaired response failed validation (then {@code spec}
 * is null and {@code error} explains why).
 */
public record DirectorOutcome(SceneSpec spec, int reprompts, boolean valid, String error) {}
