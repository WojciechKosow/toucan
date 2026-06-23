package com.toucan_motion.toucan.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.toucan_motion.toucan.entity.AnimationType;
import com.toucan_motion.toucan.generation.render.HtmlBundler;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/** End-to-end coverage of the spec/render pipeline (stub path) plus the live-parse and repair paths. */
class GenerationPipelineTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final HtmlBundler bundler = new HtmlBundler();

    private List<AnimationGenerator> stubGenerators() {
        LlmClient stub = new StubLlmClient();
        return List.of(
                new FlowAnimationGenerator(stub, bundler),
                new CodeBlockAnimationGenerator(stub, bundler),
                new DataStructureAnimationGenerator(stub, bundler));
    }

    @Test
    void everyStubBundleIsSelfContainedAndSeekable() throws Exception {
        for (AnimationGenerator gen : stubGenerators()) {
            GeneratedAnimation out = gen.generate("How a request reaches the database");
            String html = out.html();

            assertThat(html).startsWith("<!DOCTYPE html>");
            assertThat(html).contains("</html>");

            // determinism / MP4 capture contract is present
            assertThat(html).contains("window.__seek");
            assertThat(html).contains("window.__duration");
            assertThat(html).contains("__TOUCAN_RENDERER__");

            // fully self-contained: no external network resources
            assertThat(html).doesNotContain("http://");
            assertThat(html).doesNotContain("https://");
            assertThat(html).doesNotContain("src=\"//");

            // the spec is valid JSON and was baked in
            assertThat(MAPPER.readTree(out.specJson())).isNotNull();

            // write a sample so the output can be eyeballed
            Path p = Path.of("target", "samples", gen.type().name().toLowerCase() + ".html");
            Files.createDirectories(p.getParent());
            Files.writeString(p, html);
        }
    }

    @Test
    void flowStubBakesInTheDescriptionAsTitle() {
        GeneratedAnimation out = new FlowAnimationGenerator(new StubLlmClient(), bundler)
                .generate("How money moves between banks");
        assertThat(out.specJson()).contains("How money moves between banks");
        assertThat(out.specJson()).contains("\"type\":\"flow\"");
    }

    @Test
    void liveFlowParsesFencedJsonResponse() {
        String response =
                "```json\n"
                        + "{\"type\":\"flow\",\"title\":\"Order pipeline\",\"direction\":\"horizontal\","
                        + "\"nodes\":[{\"label\":\"Cart\"},{\"label\":\"Checkout\"},{\"label\":\"Paid\"}],"
                        + "\"traveler\":{\"label\":\"order\"},\"beatDurationMs\":800}\n```";

        GeneratedAnimation out =
                new FlowAnimationGenerator(fakeLive(response), bundler).generate("orders");

        assertThat(out.specJson()).contains("Order pipeline");
        assertThat(out.html()).contains("Order pipeline");
    }

    @Test
    void invalidFirstResponseTriggersOneRepairThenSucceeds() {
        String bad = "I cannot do that.";
        String good =
                "{\"type\":\"flow\",\"nodes\":[{\"label\":\"A\"},{\"label\":\"B\"},{\"label\":\"C\"}]}";

        GeneratedAnimation out =
                new FlowAnimationGenerator(sequencedLive(bad, good), bundler).generate("abc");

        assertThat(out.specJson()).contains("\"label\":\"A\"");
    }

    @Test
    void unrecoverableSpecAfterRepairThrows() {
        String tooFew = "{\"type\":\"flow\",\"nodes\":[{\"label\":\"only\"}]}";

        assertThatThrownBy(
                        () -> new FlowAnimationGenerator(sequencedLive(tooFew, tooFew), bundler)
                                .generate("x"))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void registryResolvesAllThreeTypes() {
        AnimationGeneratorRegistry registry = new AnimationGeneratorRegistry(stubGenerators());
        assertThat(registry.get(AnimationType.FLOW).type()).isEqualTo(AnimationType.FLOW);
        assertThat(registry.get(AnimationType.CODE_BLOCK).type()).isEqualTo(AnimationType.CODE_BLOCK);
        assertThat(registry.get(AnimationType.DATA_STRUCTURE).type())
                .isEqualTo(AnimationType.DATA_STRUCTURE);
    }

    // ---- fake LLM clients ----
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

    /** Returns the responses in order across successive calls (for the repair path). */
    private static LlmClient sequencedLive(String... responses) {
        return new LlmClient() {
            private int call = 0;

            @Override
            public boolean isLive() {
                return true;
            }

            @Override
            public String complete(String systemPrompt, String userPrompt) {
                return responses[Math.min(call++, responses.length - 1)];
            }
        };
    }
}
