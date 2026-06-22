package com.toucan_motion.toucan.generation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.time.Duration;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Live {@link LlmClient} backed by the OpenAI Chat Completions API. Called over the OkHttp client
 * already on the classpath (no extra SDK dependency). Sits behind {@link LlmClient}, so switching
 * providers is a configuration change (see {@code LlmConfig}).
 */
public class OpenAiLlmClient implements LlmClient {

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final OkHttpClient http;
    private final String apiKey;
    private final String model;
    private final int maxTokens;
    private final double temperature;
    private final String baseUrl;

    public OpenAiLlmClient(
            String apiKey, String model, int maxTokens, double temperature, String baseUrl) {
        this.apiKey = apiKey;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.http =
                new OkHttpClient.Builder()
                        .connectTimeout(Duration.ofSeconds(20))
                        .readTimeout(Duration.ofSeconds(180))
                        .callTimeout(Duration.ofSeconds(180))
                        .build();
    }

    @Override
    public boolean isLive() {
        return true;
    }

    @Override
    public String complete(String systemPrompt, String userPrompt) {
        try {
            Request request =
                    new Request.Builder()
                            .url(baseUrl + "/chat/completions")
                            .addHeader("Authorization", "Bearer " + apiKey)
                            .post(RequestBody.create(buildPayload(systemPrompt, userPrompt), JSON))
                            .build();

            try (Response response = http.newCall(request).execute()) {
                String body = response.body() != null ? response.body().string() : "";
                if (!response.isSuccessful()) {
                    throw new RuntimeException("OpenAI API error " + response.code() + ": " + body);
                }
                return extractContent(body);
            }
        } catch (IOException e) {
            throw new RuntimeException("OpenAI request failed: " + e.getMessage(), e);
        }
    }

    private String buildPayload(String systemPrompt, String userPrompt)
            throws JsonProcessingException {
        ObjectNode root = MAPPER.createObjectNode();
        root.put("model", model);
        root.put("max_tokens", maxTokens);
        root.put("temperature", temperature);
        ArrayNode messages = root.putArray("messages");
        messages.addObject().put("role", "system").put("content", systemPrompt);
        messages.addObject().put("role", "user").put("content", userPrompt);
        return MAPPER.writeValueAsString(root);
    }

    /** Pulls {@code choices[0].message.content} out of a Chat Completions response. */
    static String extractContent(String responseBody) throws IOException {
        JsonNode content =
                MAPPER.readTree(responseBody).path("choices").path(0).path("message").path("content");
        if (content.isMissingNode() || content.isNull() || content.asText().isEmpty()) {
            throw new RuntimeException("OpenAI API returned no content: " + responseBody);
        }
        return content.asText();
    }
}
