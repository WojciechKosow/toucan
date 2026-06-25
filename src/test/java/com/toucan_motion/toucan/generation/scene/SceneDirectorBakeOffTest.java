package com.toucan_motion.toucan.generation.scene;

import com.toucan_motion.toucan.generation.AnthropicLlmClient;
import com.toucan_motion.toucan.generation.LlmClient;
import com.toucan_motion.toucan.generation.OpenAiLlmClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Provider bake-off (Section 5): runs the director against each topic prompt with gpt-4.1 and
 * claude-opus-4-8 and records valid-spec rate + repair-reprompt count per provider. Pick the one
 * with fewer reprompts at equal validity.
 *
 * <p>Live + cost-incurring, so it is gated: it runs only with {@code RUN_BAKEOFF=1} and the
 * relevant API key(s) in the environment — never in CI. Run it locally with:
 *
 * <pre>RUN_BAKEOFF=1 OPENAI_API_KEY=… ANTHROPIC_API_KEY=… ./mvnw -Dtest=SceneDirectorBakeOffTest test</pre>
 *
 * <p>With only the hero topic present this is a one-topic coin-flip — treat the outcome as
 * provisional until Section 6 supplies a real spread of topics (see docs/bakeoff.md).
 */
@EnabledIfEnvironmentVariable(named = "RUN_BAKEOFF", matches = "1")
class SceneDirectorBakeOffTest {

    /** Topic prompts to score. Grows with the fixtures climb in Section 6. */
    private static final Map<String, String> TOPICS =
            Map.of(
                    "01-auth-flow",
                    "Explain how JWT authentication works: a browser logs in to an auth API, which"
                            + " verifies the user against a database and returns a signed JWT.");

    private final SceneSpecValidator validator = new SceneSpecValidator();

    @Test
    void bakeOff() throws Exception {
        int samples = Integer.parseInt(System.getenv().getOrDefault("BAKEOFF_SAMPLES", "5"));

        Map<String, LlmClient> providers = new LinkedHashMap<>();
        String openAiKey = System.getenv("OPENAI_API_KEY");
        String anthropicKey = System.getenv("ANTHROPIC_API_KEY");
        if (openAiKey != null && !openAiKey.isBlank()) {
            providers.put(
                    "gpt-4.1",
                    new OpenAiLlmClient(
                            openAiKey, "gpt-4.1", 16000, 0.4, "https://api.openai.com/v1"));
        }
        if (anthropicKey != null && !anthropicKey.isBlank()) {
            providers.put("claude-opus-4-8", new AnthropicLlmClient(anthropicKey, "claude-opus-4-8", 20000));
        }
        if (providers.isEmpty()) {
            throw new IllegalStateException("Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY to run the bake-off.");
        }

        StringBuilder md = new StringBuilder();
        md.append("# Provider bake-off results\n\n")
                .append("Samples per topic per provider: ")
                .append(samples)
                .append("\n\n| provider | topic | valid | valid-rate | total reprompts | avg reprompts |\n")
                .append("|---|---|---|---|---|---|\n");

        for (var provider : providers.entrySet()) {
            SceneDirector director = new SceneDirector(provider.getValue(), validator);
            for (var topic : TOPICS.entrySet()) {
                int valid = 0;
                int reprompts = 0;
                for (int i = 0; i < samples; i++) {
                    DirectorOutcome outcome = director.generate(topic.getValue());
                    if (outcome.valid()) {
                        valid++;
                    }
                    reprompts += outcome.reprompts();
                }
                md.append(
                        String.format(
                                "| %s | %s | %d/%d | %.0f%% | %d | %.2f |%n",
                                provider.getKey(),
                                topic.getKey(),
                                valid,
                                samples,
                                100.0 * valid / samples,
                                reprompts,
                                (double) reprompts / samples));
            }
        }

        md.append(
                "\n> Provisional: scored on "
                        + TOPICS.size()
                        + " topic(s). A final provider choice waits on the Section 6 fixtures climb.\n");

        Path out = Path.of("target", "bakeoff-results.md");
        Files.createDirectories(out.getParent());
        Files.writeString(out, md.toString());
        System.out.println("\n" + md + "\nWrote " + out.toAbsolutePath() + "\n");
    }
}
