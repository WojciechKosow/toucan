package com.toucan_motion.toucan.generation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Selects the live generation provider. {@code llm.provider} is {@code openai} | {@code anthropic} |
 * {@code stub} | {@code auto}. When the chosen provider has no API key, we fall back to the
 * deterministic stub so the app still runs.
 */
@Configuration
public class LlmConfig {

    private static final Logger log = LoggerFactory.getLogger(LlmConfig.class);

    @Bean
    public LlmClient llmClient(
            @Value("${llm.provider:auto}") String provider,
            @Value("${openai.api.key:}") String openAiKey,
            @Value("${openai.model:gpt-4o}") String openAiModel,
            @Value("${openai.max-tokens:8000}") int openAiMaxTokens,
            @Value("${openai.temperature:0.6}") double openAiTemperature,
            @Value("${openai.base-url:https://api.openai.com/v1}") String openAiBaseUrl,
            @Value("${anthropic.api.key:}") String anthropicKey,
            @Value("${anthropic.model:claude-opus-4-8}") String anthropicModel,
            @Value("${anthropic.max-tokens:20000}") long anthropicMaxTokens) {

        String selected = provider == null ? "auto" : provider.trim().toLowerCase();
        boolean hasOpenAi = openAiKey != null && !openAiKey.isBlank();
        boolean hasAnthropic = anthropicKey != null && !anthropicKey.isBlank();

        switch (selected) {
            case "openai":
                return openAi(
                        hasOpenAi, openAiKey, openAiModel, openAiMaxTokens, openAiTemperature, openAiBaseUrl);
            case "anthropic":
                return anthropic(hasAnthropic, anthropicKey, anthropicModel, anthropicMaxTokens);
            case "stub":
                log.warn("llm.provider=stub — using the deterministic stub generator.");
                return new StubLlmClient();
            default: // auto: whichever key is present, OpenAI first
                if (hasOpenAi) {
                    return openAi(
                            true, openAiKey, openAiModel, openAiMaxTokens, openAiTemperature, openAiBaseUrl);
                }
                if (hasAnthropic) {
                    return anthropic(true, anthropicKey, anthropicModel, anthropicMaxTokens);
                }
                log.warn(
                        "No LLM API key configured — using the deterministic stub generator. "
                                + "Set OPENAI_API_KEY (or openai.api.key) to enable GPT generation.");
                return new StubLlmClient();
        }
    }

    private LlmClient openAi(
            boolean hasKey,
            String key,
            String model,
            int maxTokens,
            double temperature,
            String baseUrl) {
        if (!hasKey) {
            log.warn(
                    "llm.provider=openai but openai.api.key is not set — using the stub generator. "
                            + "Set OPENAI_API_KEY (or openai.api.key) to enable GPT generation.");
            return new StubLlmClient();
        }
        log.info("OpenAI LLM client enabled (model={}).", model);
        return new OpenAiLlmClient(key, model, maxTokens, temperature, baseUrl);
    }

    private LlmClient anthropic(boolean hasKey, String key, String model, long maxTokens) {
        if (!hasKey) {
            log.warn(
                    "llm.provider=anthropic but anthropic.api.key is not set — using the stub generator.");
            return new StubLlmClient();
        }
        log.info("Anthropic LLM client enabled (model={}).", model);
        return new AnthropicLlmClient(key, model, maxTokens);
    }
}
