package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.dto.AnimationDTO;
import com.toucan_motion.toucan.entity.Animation;
import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.generation.AnimationGeneratorRegistry;
import com.toucan_motion.toucan.generation.GeneratedAnimation;
import com.toucan_motion.toucan.publishing.PublishingService;
import com.toucan_motion.toucan.repository.AnimationRepository;
import com.toucan_motion.toucan.request.CreateAnimationRequest;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AnimationServiceImpl implements AnimationService {

    private final AnimationRepository animationRepository;
    private final AnimationGeneratorRegistry generators;
    private final PublishingService publishingService;

    @Override
    public AnimationDTO create(UUID userId, CreateAnimationRequest request) {
        // Persist first so a record exists even if generation fails. Deliberately not @Transactional:
        // the LLM call can take many seconds and we don't want to hold a DB connection across it.
        Animation animation =
                animationRepository.save(
                        Animation.builder()
                                .userId(userId)
                                .type(request.getType())
                                .prompt(request.getPrompt())
                                .status(AnimationStatus.GENERATING)
                                .build());

        try {
            GeneratedAnimation generated = generators.get(request.getType()).generate(request.getPrompt());
            String previewUrl = publishingService.publish(animation.getId(), generated.html());
            animation.setGeneratedCode(generated.html());
            animation.setSpecJson(generated.specJson());
            animation.setPreviewUrl(previewUrl);
            animation.setStatus(AnimationStatus.READY);
        } catch (RuntimeException e) {
            animation.setStatus(AnimationStatus.FAILED);
            animation.setErrorMessage(e.getMessage());
            animationRepository.save(animation);
            throw e;
        }

        return mapToDTO(animationRepository.save(animation));
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
                .orElseThrow(() -> new RuntimeException("Animation not found."));
    }

    @Override
    public String getCodeForDownload(UUID userId, UUID animationId) {
        Animation animation =
                animationRepository
                        .findByIdAndUserId(animationId, userId)
                        .orElseThrow(() -> new RuntimeException("Animation not found."));
        if (animation.getGeneratedCode() == null) {
            throw new RuntimeException("This animation has no generated code to download.");
        }
        return animation.getGeneratedCode();
    }

    private AnimationDTO mapToDTO(Animation a) {
        return AnimationDTO.builder()
                .id(a.getId())
                .type(a.getType())
                .prompt(a.getPrompt())
                .previewUrl(a.getPreviewUrl())
                .embedSnippet(a.getPreviewUrl() == null ? null : buildEmbedSnippet(a.getPreviewUrl()))
                .status(a.getStatus())
                .errorMessage(a.getErrorMessage())
                .createdAt(a.getCreatedAt())
                .build();
    }

    private String buildEmbedSnippet(String previewUrl) {
        return "<iframe src=\""
                + previewUrl
                + "\" width=\"800\" height=\"450\" style=\"border:0;border-radius:8px\""
                + " loading=\"lazy\" allowfullscreen></iframe>";
    }
}
