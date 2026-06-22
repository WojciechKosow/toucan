package com.toucan_motion.toucan.generation;

/**
 * Used when no Anthropic API key is configured. It never performs a live completion — generators
 * detect {@link #isLive()} == {@code false} and emit their built-in stub animation instead, so the
 * whole pipeline (generate &rarr; publish &rarr; preview &rarr; download) runs without a key.
 */
public class StubLlmClient implements LlmClient {

    @Override
    public boolean isLive() {
        return false;
    }

    @Override
    public String complete(String systemPrompt, String userPrompt) {
        throw new UnsupportedOperationException(
                "StubLlmClient cannot perform live completions; check isLive() first.");
    }
}
