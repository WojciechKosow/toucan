package com.toucan_motion.toucan.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.toucan_motion.toucan.entity.AnimationType;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class CodeBlockAnimationGeneratorTest {

    private final CodeBlockAnimationGenerator generator =
            new CodeBlockAnimationGenerator(new StubLlmClient());

    @Test
    void stubProducesSelfContainedHtml() {
        String html = generator.generate("Explain <script> tags");

        assertThat(html).startsWith("<!DOCTYPE html>");
        assertThat(html).contains("</html>");
        // user input is HTML-escaped into the page
        assertThat(html).contains("&lt;script&gt; tags");
        // self-contained: no external network resources
        assertThat(html).doesNotContain("http://");
        assertThat(html).doesNotContain("https://");
        assertThat(html).doesNotContain("src=\"//");
    }

    @Test
    void sanitizeStripsMarkdownFencesFromLiveOutput() {
        CodeBlockAnimationGenerator gen =
                new CodeBlockAnimationGenerator(
                        fakeLive("```html\n<!DOCTYPE html><html><body>hi</body></html>\n```"));

        String html = gen.generate("anything");

        assertThat(html).startsWith("<!DOCTYPE html>");
        assertThat(html).doesNotContain("```");
    }

    @Test
    void sanitizeDropsPreambleBeforeDoctype() {
        CodeBlockAnimationGenerator gen =
                fakeGenerator("Sure! Here is your animation:\n<!DOCTYPE html><html></html>");

        assertThat(gen.generate("anything")).startsWith("<!DOCTYPE html>");
    }

    @Test
    void registryResolvesWiredTypeAndRejectsUnwired() {
        AnimationGeneratorRegistry registry = new AnimationGeneratorRegistry(List.of(generator));

        assertThat(registry.get(AnimationType.CODE_BLOCK)).isSameAs(generator);
        assertThatThrownBy(() -> registry.get(AnimationType.DATA_STRUCTURE))
                .isInstanceOf(IllegalArgumentException.class);
    }

    /** Writes a real sample of the stub output so its quality can be eyeballed. */
    @Test
    void rendersSampleArtifactForInspection() throws Exception {
        String html = generator.generate("How memoized recursion speeds up Fibonacci");
        Path out = Path.of("target", "toucan-codeblock-stub.html");
        Files.createDirectories(out.getParent());
        Files.writeString(out, html);
        assertThat(Files.exists(out)).isTrue();
    }

    private static CodeBlockAnimationGenerator fakeGenerator(String response) {
        return new CodeBlockAnimationGenerator(fakeLive(response));
    }

    private static LlmClient fakeLive(String response) {
        return new LlmClient() {
            @Override
            public boolean isLive() {
                return true;
            }

            @Override
            public String complete(String systemPrompt, String userPrompt) {
                return response;
            }
        };
    }
}
