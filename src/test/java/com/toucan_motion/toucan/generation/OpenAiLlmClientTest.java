package com.toucan_motion.toucan.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class OpenAiLlmClientTest {

    @Test
    void extractsAssistantContent() throws Exception {
        String json =
                "{\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\","
                        + "\"content\":\"<!DOCTYPE html><html></html>\"},\"finish_reason\":\"stop\"}]}";

        assertThat(OpenAiLlmClient.extractContent(json)).isEqualTo("<!DOCTYPE html><html></html>");
    }

    @Test
    void throwsWhenNoChoices() {
        assertThatThrownBy(() -> OpenAiLlmClient.extractContent("{\"choices\":[]}"))
                .isInstanceOf(RuntimeException.class);
    }
}
