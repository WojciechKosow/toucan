package com.toucan_motion.toucan.generation.scene;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.toucan_motion.toucan.generation.JsonExtractor;
import com.toucan_motion.toucan.generation.LlmClient;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * The unified AI director (Section 5). Turns one topic prompt into a validated {@link SceneSpec}
 * via a single director system prompt that teaches the whole closed kit and forbids coordinates.
 *
 * <p>Pipeline (retargeted from the legacy {@code SpecAnimationGenerator} machinery): ask the model
 * for one JSON object → extract + parse → validate against {@link SceneSpecValidator} → on failure,
 * re-prompt the model <em>once</em> with the precise error → validate again. When no model is
 * configured it returns the known-good hero fixture, so the whole pipeline runs offline (the CI /
 * control path).
 */
@Component
public class SceneDirector {

    private static final Logger log = LoggerFactory.getLogger(SceneDirector.class);

    private final ObjectMapper mapper =
            new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final LlmClient llm;
    private final SceneSpecValidator validator;
    private final String systemPrompt;
    private final String stubSpecJson;

    public SceneDirector(LlmClient llm, SceneSpecValidator validator) {
        this.llm = llm;
        this.validator = validator;
        this.systemPrompt = readResource("prompts/scene-director-system.md");
        this.stubSpecJson = readResource("fixtures/01-auth-flow.json");
    }

    /**
     * Production entry point: a validated {@link SceneSpec} for the prompt, or the known-good stub
     * spec when no model is configured. Throws only when a live model fails to produce a valid spec
     * even after the single repair-reprompt.
     */
    public SceneSpec direct(String prompt) {
        if (!llm.isLive()) {
            return stubSpec();
        }
        DirectorOutcome outcome = generate(prompt);
        if (!outcome.valid()) {
            throw new RuntimeException("Director did not return a valid SceneSpec: " + outcome.error());
        }
        return outcome.spec();
    }

    /**
     * Live-only generation with metrics for the provider bake-off: runs the generate → validate →
     * one-repair loop and reports whether it validated and how many reprompts it took. Never throws
     * for an invalid spec (it returns {@code valid=false}); only a transport error from the model
     * propagates.
     */
    public DirectorOutcome generate(String prompt) {
        String raw = llm.complete(systemPrompt, userPrompt(prompt));
        try {
            return new DirectorOutcome(parseAndValidate(raw), 0, true, null);
        } catch (Exception first) {
            log.info("Director spec invalid on first pass ({}); re-prompting once.", first.getMessage());
            String repaired = llm.complete(systemPrompt, repairPrompt(prompt, raw, first.getMessage()));
            try {
                return new DirectorOutcome(parseAndValidate(repaired), 1, true, null);
            } catch (Exception second) {
                return new DirectorOutcome(null, 1, false, second.getMessage());
            }
        }
    }

    /** The keyless control path: parse + validate the bundled hero fixture. */
    public SceneSpec stubSpec() {
        try {
            SceneSpec spec = mapper.readValue(stubSpecJson, SceneSpec.class);
            validator.validate(spec);
            return spec;
        } catch (IOException e) {
            throw new UncheckedIOException("Stub SceneSpec fixture is unreadable", e);
        }
    }

    private SceneSpec parseAndValidate(String raw) throws IOException {
        SceneSpec spec = mapper.readValue(JsonExtractor.extract(raw), SceneSpec.class);
        validator.validate(spec);
        return spec;
    }

    private String userPrompt(String prompt) {
        return "Topic prompt:\n\n" + prompt + "\n\nReturn only the SceneSpec JSON object.";
    }

    private String repairPrompt(String prompt, String previous, String error) {
        return "Your previous response was not a valid SceneSpec. Validation error:\n"
                + error
                + "\n\nReturn ONLY a corrected single JSON object that fixes this and conforms to the"
                + " contract (closed vocabularies, every reference resolves, no coordinates, no prose,"
                + " no code fences). Original topic prompt:\n\n"
                + prompt;
    }

    private static String readResource(String path) {
        try {
            return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Missing classpath resource: " + path, e);
        }
    }
}
