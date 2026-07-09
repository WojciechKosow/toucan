package com.toucan_motion.toucan.engine;

/**
 * Token usage + computed cost for one generation run, parsed from the engine's {@code usage[generate]}
 * telemetry line. Billing-prep only — persisted alongside the animation so cost can be attributed to
 * an author later; no Stripe here. Any field may be null when the engine didn't report it (e.g.
 * {@code costUsd} for an unpriced model).
 */
public record EngineUsage(
        String provider, String model, Long inputTokens, Long outputTokens, Double costUsd) {}
