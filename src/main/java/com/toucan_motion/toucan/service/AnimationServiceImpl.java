package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.dto.AnimationDTO;
import com.toucan_motion.toucan.entity.Animation;
import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.repository.AnimationRepository;
import com.toucan_motion.toucan.repository.UserRepository;
import com.toucan_motion.toucan.request.CreateAnimationRequest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@RequiredArgsConstructor
public class AnimationServiceImpl implements AnimationService {

    private final AnimationRepository animationRepository;
    private final UserRepository userRepository;
    private final AnimationProcessor animationProcessor;

    /** Per-user minimum gap between generations (the dormant User.lastGeneration hook). 0 disables. */
    @Value("${app.ratelimit.generation-cooldown-seconds:0}")
    private long cooldownSeconds;

    @Override
    public AnimationDTO create(UUID userId, CreateAnimationRequest request) {
        // Reserve the slot (rate-limit + a committed PENDING row), then hand off to the async worker.
        // create() is intentionally non-transactional: each save commits on its own so the PENDING row
        // is visible to the worker thread, and the LLM/render work happens entirely outside any tx.
        Animation animation = reserve(userId, request);
        animationProcessor.process(animation.getId());
        return mapToDTO(animation);
    }

    private Animation reserve(UUID userId, CreateAnimationRequest request) {
        User user =
                userRepository
                        .findById(userId)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user."));
        enforceRateLimit(user);
        user.setLastGeneration(LocalDateTime.now());
        userRepository.save(user);

        return animationRepository.save(
                Animation.builder()
                        .userId(userId)
                        .prompt(request.getPrompt())
                        .status(AnimationStatus.PENDING)
                        .build());
    }

    private void enforceRateLimit(User user) {
        if (cooldownSeconds <= 0 || user.getLastGeneration() == null) {
            return;
        }
        LocalDateTime nextAllowed = user.getLastGeneration().plus(Duration.ofSeconds(cooldownSeconds));
        if (LocalDateTime.now().isBefore(nextAllowed)) {
            throw new ResponseStatusException(
                    HttpStatus.TOO_MANY_REQUESTS, "Please wait before generating another animation.");
        }
    }

    @Override
    public List<AnimationDTO> listForUser(UUID userId) {
        return animationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::mapToDTO)
                .toList();
    }

    @Override
    public AnimationDTO getForUser(UUID userId, UUID animationId) {
        return animationRepository
                .findByIdAndUserId(animationId, userId)
                .map(this::mapToDTO)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Animation not found."));
    }

    @Override
    public String getCodeForDownload(UUID userId, UUID animationId) {
        Animation animation =
                animationRepository
                        .findByIdAndUserId(animationId, userId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Animation not found."));
        if (animation.getGeneratedCode() == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "This animation has no generated code to download.");
        }
        return animation.getGeneratedCode();
    }

    private AnimationDTO mapToDTO(Animation a) {
        return AnimationDTO.builder()
                .id(a.getId())
                .prompt(a.getPrompt())
                .status(a.getStatus())
                .previewUrl(a.getPreviewUrl())
                .mp4Url(a.getMp4Url())
                .posterUrl(a.getPosterUrl())
                .durationMs(a.getDurationMs())
                .embedSnippet(
                        a.getMp4Url() == null ? null : buildEmbedSnippet(a.getMp4Url(), a.getPosterUrl()))
                .errorMessage(a.getErrorMessage())
                .createdAt(a.getCreatedAt())
                .build();
    }

    private String buildEmbedSnippet(String mp4Url, String posterUrl) {
        String poster = posterUrl == null ? "" : " poster=\"" + posterUrl + "\"";
        return "<video src=\""
                + mp4Url
                + "\""
                + poster
                + " width=\"1280\" height=\"720\" controls playsinline"
                + " style=\"border:0;border-radius:8px;max-width:100%\"></video>";
    }
}
