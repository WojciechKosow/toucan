package com.toucan_motion.toucan.engine;

/**
 * The output of one {@link AnimationEngine#generate} call: the self-contained HTML document, the
 * parsed usage telemetry (for the cost log line), and the raw usage JSON exactly as the engine
 * emitted it (persisted verbatim on the animation, so no re-serialization drift). {@code usage} and
 * {@code usageJson} are null when the engine reported no usage (a mock run, or the {@code --html}
 * dev path).
 */
public record EngineResult(String html, EngineUsage usage, String usageJson) {}
