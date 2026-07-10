package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.dto.ConversationDTO;
import com.toucan_motion.toucan.dto.VersionDTO;
import com.toucan_motion.toucan.entity.Animation;
import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.entity.Conversation;
import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.repository.AnimationRepository;
import com.toucan_motion.toucan.repository.ConversationRepository;
import com.toucan_motion.toucan.repository.UserRepository;
import com.toucan_motion.toucan.request.ConversationMessageRequest;
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
public class ConversationServiceImpl implements ConversationService {

    private final ConversationRepository conversationRepository;
    private final AnimationRepository animationRepository;
    private final UserRepository userRepository;
    private final ConversationProcessor conversationProcessor;

    /** Per-user minimum gap between STARTING conversations (not between edits). 0 disables. */
    @Value("${app.ratelimit.generation-cooldown-seconds:0}")
    private long cooldownSeconds;

    @Override
    public ConversationDTO start(UUID userId, ConversationMessageRequest request) {
        // Non-transactional like the single-shot path: each save commits on its own so the PENDING
        // rows are visible to the async worker, and the engine work happens outside any tx.
        User user =
                userRepository
                        .findById(userId)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown user."));
        enforceRateLimit(user);
        user.setLastGeneration(LocalDateTime.now());
        userRepository.save(user);

        Conversation conversation =
                conversationRepository.save(Conversation.builder().userId(userId).build());
        Animation version = saveVersion(conversation, userId, request.getMessage(), 1);

        conversationProcessor.processTurn(conversation.getId(), version.getId());
        return toFullDTO(conversation, List.of(version));
    }

    @Override
    public ConversationDTO postMessage(
            UUID userId, UUID conversationId, ConversationMessageRequest request) {
        Conversation conversation =
                conversationRepository
                        .findByIdAndUserId(conversationId, userId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Conversation not found."));

        Animation latest =
                animationRepository
                        .findTopByConversationIdOrderByVersionNumberDesc(conversationId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.CONFLICT, "Conversation has no versions yet."));

        // Serialize turns: don't start an edit while a turn is still running.
        if (latest.getStatus() == AnimationStatus.PENDING
                || latest.getStatus() == AnimationStatus.GENERATING) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "The previous turn is still processing. Try again in a moment.");
        }
        // Need a successful animation to edit.
        if (conversation.getCurrentVersion() == null) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "The first animation hasn't succeeded yet — nothing to edit.");
        }

        Animation version =
                saveVersion(conversation, userId, request.getMessage(), latest.getVersionNumber() + 1);

        conversationProcessor.processTurn(conversationId, version.getId());
        return toFullDTO(
                conversation, animationRepository.findByConversationIdOrderByVersionNumberAsc(conversationId));
    }

    private Animation saveVersion(Conversation conversation, UUID userId, String message, int versionNumber) {
        return animationRepository.save(
                Animation.builder()
                        .userId(userId)
                        .conversationId(conversation.getId())
                        .versionNumber(versionNumber)
                        .prompt(message)
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
                    HttpStatus.TOO_MANY_REQUESTS, "Please wait before starting another conversation.");
        }
    }

    @Override
    public List<ConversationDTO> listForUser(UUID userId) {
        return conversationRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toSummaryDTO)
                .toList();
    }

    @Override
    public ConversationDTO getForUser(UUID userId, UUID conversationId) {
        Conversation conversation =
                conversationRepository
                        .findByIdAndUserId(conversationId, userId)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND, "Conversation not found."));
        return toFullDTO(
                conversation, animationRepository.findByConversationIdOrderByVersionNumberAsc(conversationId));
    }

    @Override
    public String getVersionCodeForDownload(UUID userId, UUID conversationId, int versionNumber) {
        conversationRepository
                .findByIdAndUserId(conversationId, userId)
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Conversation not found."));
        Animation version =
                animationRepository
                        .findByConversationIdAndVersionNumber(conversationId, versionNumber)
                        .orElseThrow(
                                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Version not found."));
        if (version.getGeneratedCode() == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "This version has no generated code to download.");
        }
        return version.getGeneratedCode();
    }

    /** Full view: the version thread + status derived from the latest version. */
    private ConversationDTO toFullDTO(Conversation c, List<Animation> versions) {
        return ConversationDTO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .status(deriveStatus(versions))
                .currentVersion(c.getCurrentVersion())
                .previewUrl(c.getPreviewUrl())
                .versions(versions.stream().map(this::toVersionDTO).toList())
                .createdAt(c.getCreatedAt())
                .build();
    }

    /** List view: no versions array; status from the latest version (one small query). */
    private ConversationDTO toSummaryDTO(Conversation c) {
        AnimationStatus status =
                animationRepository
                        .findTopByConversationIdOrderByVersionNumberDesc(c.getId())
                        .map(Animation::getStatus)
                        .orElse(null);
        return ConversationDTO.builder()
                .id(c.getId())
                .title(c.getTitle())
                .status(status)
                .currentVersion(c.getCurrentVersion())
                .previewUrl(c.getPreviewUrl())
                .createdAt(c.getCreatedAt())
                .build();
    }

    private VersionDTO toVersionDTO(Animation v) {
        return VersionDTO.builder()
                .versionNumber(v.getVersionNumber())
                .message(v.getPrompt())
                .status(v.getStatus())
                .errorMessage(v.getErrorMessage())
                .createdAt(v.getCreatedAt())
                .build();
    }

    private static AnimationStatus deriveStatus(List<Animation> versions) {
        if (versions.isEmpty()) {
            return null;
        }
        return versions.get(versions.size() - 1).getStatus();
    }
}
