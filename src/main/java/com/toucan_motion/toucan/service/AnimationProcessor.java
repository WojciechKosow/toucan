package com.toucan_motion.toucan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.toucan_motion.toucan.entity.Animation;
import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.entity.RenderJob;
import com.toucan_motion.toucan.entity.RenderJobStatus;
import com.toucan_motion.toucan.generation.scene.SceneSpec;
import com.toucan_motion.toucan.generation.scene.SceneSpecValidator;
import com.toucan_motion.toucan.render.PlaceholderSpecGenerator;
import com.toucan_motion.toucan.render.RenderDispatch;
import com.toucan_motion.toucan.render.RendererClient;
import com.toucan_motion.toucan.repository.AnimationRepository;
import com.toucan_motion.toucan.repository.RenderJobRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * The async half of {@code POST /api/animations}. Runs the spec step (placeholder now, the LLM
 * director in Section 5) and dispatches to the renderer. Deliberately NOT {@code @Transactional}:
 * the spec/LLM call can take many seconds and must not hold a DB connection or transaction open —
 * each persistence step is its own short transaction. The renderer reports completion later through
 * the internal callback; this method's job ends once the renderer has accepted the work.
 */
@Component
@RequiredArgsConstructor
public class AnimationProcessor {

    private static final Logger log = LoggerFactory.getLogger(AnimationProcessor.class);

    private final AnimationRepository animationRepository;
    private final RenderJobRepository renderJobRepository;
    private final PlaceholderSpecGenerator specGenerator;
    private final SceneSpecValidator validator;
    private final RendererClient rendererClient;

    // Boot 4 autoconfigures Jackson 3 (tools.jackson); we serialize the spec with a plain Jackson-2
    // ObjectMapper instance, as the rest of the generation code does.
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.internal.callback-base-url:http://localhost:8080}")
    private String callbackBaseUrl;

    @Async
    public void process(UUID animationId) {
        Animation animation = animationRepository.findById(animationId).orElse(null);
        if (animation == null) {
            log.warn("Animation {} vanished before processing", animationId);
            return;
        }

        RenderJob job = null;
        try {
            // ── spec step (outside any transaction) ──
            SceneSpec spec = specGenerator.generate(animation.getPrompt());
            validator.validate(spec);
            String specJson = objectMapper.writeValueAsString(spec);

            animation.setSpecJson(specJson);
            animation.setStatus(AnimationStatus.GENERATING);
            animationRepository.save(animation);

            // ── enqueue + dispatch (render_jobs table is the source of truth) ──
            job =
                    renderJobRepository.save(
                            RenderJob.builder()
                                    .animationId(animation.getId())
                                    .status(RenderJobStatus.QUEUED)
                                    .attempts(0)
                                    .build());

            String callbackUrl = trimTrailingSlash(callbackBaseUrl) + "/api/internal/render-callback";
            rendererClient.dispatch(
                    new RenderDispatch(
                            job.getId(), animation.getId(), animation.getPrompt(), specJson, callbackUrl));

            job.setStatus(RenderJobStatus.GENERATING);
            job.setAttempts(job.getAttempts() + 1);
            renderJobRepository.save(job);
        } catch (Exception e) {
            log.warn("Render dispatch failed for animation {}: {}", animationId, e.getMessage());
            animation.setStatus(AnimationStatus.FAILED);
            animation.setErrorMessage(e.getMessage());
            animationRepository.save(animation);
            if (job != null) {
                job.setStatus(RenderJobStatus.FAILED);
                job.setError(e.getMessage());
                job.setAttempts(job.getAttempts() + 1);
                renderJobRepository.save(job);
            }
        }
    }

    private static String trimTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
