package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.entity.Animation;
import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.entity.RenderJob;
import com.toucan_motion.toucan.entity.RenderJobStatus;
import com.toucan_motion.toucan.publishing.PublishingService;
import com.toucan_motion.toucan.publishing.RenderArtifacts;
import com.toucan_motion.toucan.repository.AnimationRepository;
import com.toucan_motion.toucan.repository.RenderJobRepository;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Applies the renderer's terminal callback to the {@link RenderJob} and its owning {@link Animation}
 * in one transaction. Storage goes through the {@link PublishingService} seam, so the renderer never
 * needs to know where (local FS today, R2 tomorrow) the MP4 actually lands.
 */
@Service
@RequiredArgsConstructor
public class RenderCallbackService {

    private static final Logger log = LoggerFactory.getLogger(RenderCallbackService.class);

    private final RenderJobRepository renderJobRepository;
    private final AnimationRepository animationRepository;
    private final PublishingService publishingService;

    @Transactional
    public void onReady(UUID jobId, Long durationMs, byte[] mp4, byte[] poster) {
        RenderJob job = requireJob(jobId);
        Animation animation = requireAnimation(job.getAnimationId());
        if (mp4 == null || mp4.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "READY callback carried no MP4.");
        }

        RenderArtifacts artifacts = publishingService.publishRender(animation.getId(), mp4, poster);
        animation.setMp4Url(artifacts.mp4Url());
        animation.setPosterUrl(artifacts.posterUrl());
        animation.setDurationMs(durationMs);
        animation.setErrorMessage(null);
        animation.setStatus(AnimationStatus.READY);
        animationRepository.save(animation);

        job.setStatus(RenderJobStatus.READY);
        renderJobRepository.save(job);
        log.info("Animation {} READY via job {} ({})", animation.getId(), jobId, artifacts.mp4Url());
    }

    @Transactional
    public void onFailed(UUID jobId, String error) {
        RenderJob job = requireJob(jobId);
        Animation animation = requireAnimation(job.getAnimationId());
        String message = (error == null || error.isBlank()) ? "Renderer reported failure." : error;

        animation.setStatus(AnimationStatus.FAILED);
        animation.setErrorMessage(message);
        animationRepository.save(animation);

        job.setStatus(RenderJobStatus.FAILED);
        job.setError(message);
        job.setAttempts(job.getAttempts() + 1);
        renderJobRepository.save(job);
        log.info("Animation {} FAILED via job {}: {}", animation.getId(), jobId, message);
    }

    private RenderJob requireJob(UUID jobId) {
        return renderJobRepository
                .findById(jobId)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown render job " + jobId));
    }

    private Animation requireAnimation(UUID animationId) {
        return animationRepository
                .findById(animationId)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "Unknown animation " + animationId));
    }
}
