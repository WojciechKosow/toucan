package com.toucan_motion.toucan.generation;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.http.StreamResponse;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.RawMessageStreamEvent;
import com.anthropic.models.messages.ThinkingConfigAdaptive;

/**
 * Live {@link LlmClient} backed by the Anthropic Messages API.
 *
 * <p>Generating a polished, self-contained animation is a complex task, so we run with adaptive
 * thinking on and stream the response — streaming keeps long outputs under the SDK's HTTP timeout
 * and we simply accumulate the text deltas (thinking deltas are ignored).
 */
public class AnthropicLlmClient implements LlmClient {

    private final AnthropicClient client;
    private final String model;
    private final long maxTokens;

    public AnthropicLlmClient(String apiKey, String model, long maxTokens) {
        this.client = AnthropicOkHttpClient.builder().apiKey(apiKey).build();
        this.model = model;
        this.maxTokens = maxTokens;
    }

    @Override
    public boolean isLive() {
        return true;
    }

    @Override
    public String complete(String systemPrompt, String userPrompt) {
        MessageCreateParams params =
                MessageCreateParams.builder()
                        .model(model)
                        .maxTokens(maxTokens)
                        .system(systemPrompt)
                        .thinking(ThinkingConfigAdaptive.builder().build())
                        .addUserMessage(userPrompt)
                        .build();

        StringBuilder out = new StringBuilder();
        try (StreamResponse<RawMessageStreamEvent> stream =
                client.messages().createStreaming(params)) {
            stream.stream()
                    .flatMap(event -> event.contentBlockDelta().stream())
                    .flatMap(delta -> delta.delta().text().stream())
                    .forEach(textDelta -> out.append(textDelta.text()));
        }
        return out.toString();
    }
}
