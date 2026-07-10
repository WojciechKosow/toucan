package com.toucan_motion.toucan.render;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;

import com.toucan_motion.toucan.entity.Role;
import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.repository.UserRepository;
import com.toucan_motion.toucan.request.CreateAnimationRequest;
import com.toucan_motion.toucan.service.AnimationService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;

/**
 * The {@code User.lastGeneration} rate-limit hook. With a non-zero cooldown a second create inside
 * the window is rejected with 429; the renderer is mocked so the first request's async worker makes
 * no real call.
 */
@SpringBootTest
@TestPropertySource(
        properties = {
            "app.ratelimit.generation-cooldown-seconds=3600",
            // Exercise the mocked SceneSpec renderer, not the HTML engine (the app default), so the
            // first request's async worker makes no real shell-out — as this test's contract states.
            "app.engine=scenespec"
        })
class GenerationRateLimitTest {

    @Autowired private AnimationService animationService;
    @Autowired private UserRepository userRepository;

    @MockitoBean private RendererClient rendererClient;

    @Test
    void secondCreateWithinCooldownIsRejected() {
        Mockito.doNothing().when(rendererClient).dispatch(any());
        UUID userId = newUser();

        animationService.create(userId, new CreateAnimationRequest("first prompt"));

        assertThatThrownBy(
                        () ->
                                animationService.create(
                                        userId, new CreateAnimationRequest("second prompt, too soon")))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
    }

    private UUID newUser() {
        return userRepository
                .save(
                        User.builder()
                                .displayName("Rate Limit User")
                                .email("rl-" + UUID.randomUUID() + "@toucan.test")
                                .password("x")
                                .enabled(true)
                                .role(Role.USER)
                                .build())
                .getId();
    }
}
