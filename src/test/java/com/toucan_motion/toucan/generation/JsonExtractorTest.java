package com.toucan_motion.toucan.generation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class JsonExtractorTest {

    @Test
    void stripsMarkdownFences() {
        String raw = "```json\n{\"type\":\"flow\"}\n```";
        assertThat(JsonExtractor.extract(raw)).isEqualTo("{\"type\":\"flow\"}");
    }

    @Test
    void dropsPreambleAndTrailingProse() {
        String raw = "Sure, here is the spec:\n{\"a\":1}\nHope that helps!";
        assertThat(JsonExtractor.extract(raw)).isEqualTo("{\"a\":1}");
    }

    @Test
    void isBraceAwareInsideStrings() {
        // a closing brace inside a string value must not end the object early
        String raw = "{\"code\":\"if (x) { y(); }\",\"n\":2}";
        assertThat(JsonExtractor.extract(raw)).isEqualTo(raw);
    }

    @Test
    void handlesEscapedQuotes() {
        String raw = "noise {\"label\":\"say \\\"hi\\\"\"} tail";
        assertThat(JsonExtractor.extract(raw)).isEqualTo("{\"label\":\"say \\\"hi\\\"\"}");
    }
}
