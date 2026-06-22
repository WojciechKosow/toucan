package com.toucan_motion.toucan.generation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class LlmConfig {

    private static final Logger log = LoggerFactory.getLogger(LlmConfig.class);

    @Bean
    public LlmClient llmClient(
            @Value("${anthropic.api.key:}") String apiKey,
            @Value("${anthropic.model:claude-opus-4-8}") String model,
            @Value("${anthropic.max-tokens:20000}") long maxTokens) {

        if (apiKey == null || apiKey.isBlank()) {
            log.warn(
                    "anthropic.api.key is not set — using the deterministic stub generator. "
                            + "Set anthropic.api.key (or the ANTHROPIC_API_KEY env var) to enable live generation.");
            return new StubLlmClient();
        }

        log.info("Anthropic LLM client enabled (model={}).", model);
        return new AnthropicLlmClient(apiKey, model, maxTokens);
    }
}
