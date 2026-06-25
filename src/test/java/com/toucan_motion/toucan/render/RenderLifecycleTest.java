package com.toucan_motion.toucan.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.toucan_motion.toucan.dto.AnimationDTO;
import com.toucan_motion.toucan.entity.Animation;
import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.entity.RenderJob;
import com.toucan_motion.toucan.entity.RenderJobStatus;
import com.toucan_motion.toucan.entity.Role;
import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.repository.AnimationRepository;
import com.toucan_motion.toucan.repository.RenderJobRepository;
import com.toucan_motion.toucan.repository.UserRepository;
import com.toucan_motion.toucan.request.CreateAnimationRequest;
import com.toucan_motion.toucan.service.AnimationService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * End-to-end of the orchestration spine, hermetic for CI: the renderer is mocked, so no Node
 * service is needed, and {@code @Async} runs inline (see {@link SyncExecutorConfig}) so the worker
 * completes before assertions. Proves: create → PENDING then GENERATING + a render job + dispatch;
 * the internal callback drives READY (with a stored mp4Url) and FAILED; a dispatch error fails the
 * row; and {@code /api/internal/**} rejects calls without the shared token.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RenderLifecycleTest {

    @TestConfiguration
    static class SyncExecutorConfig implements AsyncConfigurer {
        @Bean
        @Override
        public java.util.concurrent.Executor getAsyncExecutor() {
            return new SyncTaskExecutor();
        }
    }

    @Autowired private AnimationService animationService;
    @Autowired private AnimationRepository animationRepository;
    @Autowired private RenderJobRepository renderJobRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private MockMvc mvc;

    @MockitoBean private RendererClient rendererClient;

    private static final String TOKEN = "dev-internal-render-token";

    @Test
    void createReservesPendingThenDispatches() {
        UUID userId = newUser();

        AnimationDTO dto =
                animationService.create(userId, new CreateAnimationRequest("Explain an auth flow"));

        // Returned immediately as PENDING…
        assertThat(dto.getStatus()).isEqualTo(AnimationStatus.PENDING);

        // …and the inline worker then validated a spec, persisted it, and dispatched a render job.
        Animation persisted = animationRepository.findById(dto.getId()).orElseThrow();
        assertThat(persisted.getStatus()).isEqualTo(AnimationStatus.GENERATING);
        assertThat(persisted.getSpecJson()).contains("\"timeline\"");
        RenderJob job =
                renderJobRepository.findTopByAnimationIdOrderByCreatedAtDesc(dto.getId()).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(RenderJobStatus.GENERATING);
        verify(rendererClient).dispatch(any(RenderDispatch.class));
    }

    @Test
    void dispatchFailureMarksAnimationFailed() {
        doThrow(new RuntimeException("renderer unreachable")).when(rendererClient).dispatch(any());
        UUID userId = newUser();

        AnimationDTO dto =
                animationService.create(userId, new CreateAnimationRequest("Explain a checkout flow"));

        Animation persisted = animationRepository.findById(dto.getId()).orElseThrow();
        assertThat(persisted.getStatus()).isEqualTo(AnimationStatus.FAILED);
        assertThat(persisted.getErrorMessage()).contains("renderer unreachable");
        RenderJob job =
                renderJobRepository.findTopByAnimationIdOrderByCreatedAtDesc(dto.getId()).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(RenderJobStatus.FAILED);
    }

    @Test
    void readyCallbackPublishesMp4AndCompletes() throws Exception {
        UUID animationId = newPendingAnimation();
        UUID jobId = newQueuedJob(animationId);

        MockMultipartFile mp4 =
                new MockMultipartFile("mp4", "render.mp4", "video/mp4", new byte[] {0, 0, 0, 1, 2, 3});

        mvc.perform(
                        multipart("/api/internal/render-callback")
                                .file(mp4)
                                .param("jobId", jobId.toString())
                                .param("status", "READY")
                                .param("durationMs", "3000")
                                .header("X-Internal-Token", TOKEN))
                .andExpect(status().isNoContent());

        Animation a = animationRepository.findById(animationId).orElseThrow();
        assertThat(a.getStatus()).isEqualTo(AnimationStatus.READY);
        assertThat(a.getMp4Url()).endsWith("/preview/" + animationId + "/render.mp4");
        assertThat(a.getDurationMs()).isEqualTo(3000L);
        assertThat(renderJobRepository.findById(jobId).orElseThrow().getStatus())
                .isEqualTo(RenderJobStatus.READY);
    }

    @Test
    void failedCallbackRecordsError() throws Exception {
        UUID animationId = newPendingAnimation();
        UUID jobId = newQueuedJob(animationId);

        mvc.perform(
                        multipart("/api/internal/render-callback")
                                .param("jobId", jobId.toString())
                                .param("status", "FAILED")
                                .param("error", "compositions not built")
                                .header("X-Internal-Token", TOKEN))
                .andExpect(status().isNoContent());

        Animation a = animationRepository.findById(animationId).orElseThrow();
        assertThat(a.getStatus()).isEqualTo(AnimationStatus.FAILED);
        assertThat(a.getErrorMessage()).contains("compositions not built");
    }

    @Test
    void callbackWithoutInternalTokenIsRejected() throws Exception {
        UUID animationId = newPendingAnimation();
        UUID jobId = newQueuedJob(animationId);

        mvc.perform(
                        multipart("/api/internal/render-callback")
                                .param("jobId", jobId.toString())
                                .param("status", "FAILED")
                                .param("error", "should not apply"))
                .andExpect(status().isUnauthorized());

        assertThat(animationRepository.findById(animationId).orElseThrow().getStatus())
                .isEqualTo(AnimationStatus.PENDING);
    }

    // ── helpers ──

    private UUID newUser() {
        User user =
                User.builder()
                        .displayName("Test User")
                        .email("user-" + UUID.randomUUID() + "@toucan.test")
                        .password("x")
                        .enabled(true)
                        .role(Role.USER)
                        .build();
        return userRepository.save(user).getId();
    }

    private UUID newPendingAnimation() {
        return animationRepository
                .save(
                        Animation.builder()
                                .userId(newUser())
                                .prompt("seed")
                                .status(AnimationStatus.PENDING)
                                .build())
                .getId();
    }

    private UUID newQueuedJob(UUID animationId) {
        return renderJobRepository
                .save(
                        RenderJob.builder()
                                .animationId(animationId)
                                .status(RenderJobStatus.QUEUED)
                                .attempts(1)
                                .build())
                .getId();
    }
}
