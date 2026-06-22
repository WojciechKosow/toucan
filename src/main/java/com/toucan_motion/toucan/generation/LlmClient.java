package com.toucan_motion.toucan.generation;

/**
 * Minimal abstraction over the text-generation backend. Keeping every generator behind this
 * interface means the concrete provider (the Anthropic Messages API, or the keyless stub used for
 * local development) is a single swappable bean.
 */
public interface LlmClient {

    /**
     * @return {@code true} when a real model is configured. When {@code false}, generators must fall
     *     back to their deterministic stub output instead of calling {@link #complete}.
     */
    boolean isLive();

    /** Runs a single completion and returns the model's text output. */
    String complete(String systemPrompt, String userPrompt);
}
