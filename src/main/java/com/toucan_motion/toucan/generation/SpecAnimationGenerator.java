package com.toucan_motion.toucan.generation;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.toucan_motion.toucan.generation.render.HtmlBundler;
import com.toucan_motion.toucan.generation.spec.AnimationSpec;
import com.toucan_motion.toucan.generation.spec.Theme;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Shared backbone of the spec/render pipeline. Subclasses only supply the per-type prompt, the spec
 * class, a deterministic stub spec, and the renderer resource; this base does the rest:
 *
 * <ol>
 *   <li>ask the model for JSON (when a model is configured),
 *   <li>extract + parse it into the type's spec,
 *   <li>validate/repair the spec — and on failure, re-prompt the model <em>once</em> with the error,
 *   <li>bundle the validated spec + theme through the hand-built renderer.
 * </ol>
 *
 * When no model is configured it renders the deterministic stub spec, so the whole pipeline (generate
 * → publish → preview → download) runs without an API key.
 *
 * @param <S> the spec type produced for this animation type
 */
public abstract class SpecAnimationGenerator<S extends AnimationSpec> implements AnimationGenerator {

    private static final Logger log = LoggerFactory.getLogger(SpecAnimationGenerator.class);

    private final ObjectMapper mapper =
            new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    protected final LlmClient llm;
    protected final HtmlBundler bundler;

    protected SpecAnimationGenerator(LlmClient llm, HtmlBundler bundler) {
        this.llm = llm;
        this.bundler = bundler;
    }

    @Override
    public final GeneratedAnimation generate(String description) {
        S spec = produceSpec(description);
        String html = bundler.bundle(title(spec), spec, theme(), rendererResource());
        return new GeneratedAnimation(html, bundler.toJson(spec));
    }

    private S produceSpec(String description) {
        if (!llm.isLive()) {
            S spec = stubSpec(description);
            spec.validateAndRepair();
            return spec;
        }
        String raw = llm.complete(systemPrompt(), userPrompt(description));
        try {
            return parseAndValidate(raw);
        } catch (Exception first) {
            log.info("{} spec invalid on first pass ({}); re-prompting once.", wireType(), first.getMessage());
            String repaired = llm.complete(systemPrompt(), repairPrompt(description, raw, first.getMessage()));
            try {
                return parseAndValidate(repaired);
            } catch (Exception second) {
                throw new RuntimeException(
                        "Model did not return a valid " + wireType() + " spec: " + second.getMessage(), second);
            }
        }
    }

    private S parseAndValidate(String raw) throws Exception {
        S spec = mapper.readValue(JsonExtractor.extract(raw), specClass());
        spec.validateAndRepair();
        return spec;
    }

    /** Default repair prompt; subclasses may override for type-specific nudges. */
    protected String repairPrompt(String description, String previous, String error) {
        return "Your previous response was not a valid "
                + wireType()
                + " spec. Error: "
                + error
                + "\n\nReturn ONLY a corrected JSON object that conforms to the schema. No prose, no "
                + "markdown fences. Original request:\n\n"
                + description;
    }

    /** v0.1 ships one theme; this hook lets style-memory swap it later. */
    protected Theme theme() {
        return Theme.DEFAULT;
    }

    protected String wireType() {
        return type().name();
    }

    // ---- per-type hooks ----
    protected abstract String systemPrompt();

    protected abstract String userPrompt(String description);

    protected abstract Class<S> specClass();

    protected abstract S stubSpec(String description);

    protected abstract String rendererResource();

    protected abstract String title(S spec);
}
