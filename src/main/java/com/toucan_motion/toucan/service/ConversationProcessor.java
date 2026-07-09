package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.engine.AnimationEngine;
import com.toucan_motion.toucan.engine.EngineResult;
import com.toucan_motion.toucan.engine.EngineUsage;
import com.toucan_motion.toucan.entity.Animation;
import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.entity.Conversation;
import com.toucan_motion.toucan.publishing.PublishingService;
import com.toucan_motion.toucan.repository.AnimationRepository;
import com.toucan_motion.toucan.repository.ConversationRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

/**
 * The async half of a conversation turn. Turn 1 generates from scratch; later turns edit the current
 * HTML. Either way it hosts the result via {@link PublishingService} (overwriting the conversation's
 * single preview) and marks the version {@code READY}. Non-transactional like {@link
 * AnimationProcessor}: the engine call can take many seconds, then short saves commit the result.
 */
@Component
@RequiredArgsConstructor
public class ConversationProcessor {

    private static final Logger log = LoggerFactory.getLogger(ConversationProcessor.class);

    private final ConversationRepository conversationRepository;
    private final AnimationRepository animationRepository;
    private final AnimationEngine animationEngine;
    private final PublishingService publishingService;

    @Async
    public void processTurn(UUID conversationId, UUID versionId) {
        Conversation conversation = conversationRepository.findById(conversationId).orElse(null);
        Animation version = animationRepository.findById(versionId).orElse(null);
        if (conversation == null || version == null) {
            log.warn("Conversation {} / version {} vanished before processing", conversationId, versionId);
            return;
        }

        try {
            EngineResult result;
            if (version.getVersionNumber() != null && version.getVersionNumber() == 1) {
                result = animationEngine.generate(conversationId, version.getPrompt());
            } else {
                List<Animation> priorVersions =
                        animationRepository.findByConversationIdOrderByVersionNumberAsc(conversationId)
                                .stream()
                                .filter(v -> v.getVersionNumber() < version.getVersionNumber())
                                .toList();
                String currentHtml = latestReadyHtml(priorVersions);
                if (currentHtml == null) {
                    throw new IllegalStateException(
                            "No successful prior version to edit for conversation " + conversationId);
                }
                String thread = threadOf(priorVersions);
                result = animationEngine.edit(conversationId, currentHtml, thread, version.getPrompt());
            }

            String previewUrl = publishingService.publish(conversationId, result.html());

            version.setGeneratedCode(result.html());
            version.setEngineUsageJson(result.usageJson());
            version.setStatus(AnimationStatus.READY);
            animationRepository.save(version);

            conversation.setCurrentVersion(version.getVersionNumber());
            conversation.setPreviewUrl(previewUrl);
            if (conversation.getTitle() == null) {
                conversation.setTitle(deriveTitle(version.getPrompt()));
            }
            conversationRepository.save(conversation);

            logUsage(conversation.getId(), version, previewUrl, result.usage());
        } catch (Exception e) {
            log.warn(
                    "Conversation {} turn v{} failed: {}",
                    conversationId,
                    version.getVersionNumber(),
                    e.getMessage());
            version.setStatus(AnimationStatus.FAILED);
            version.setErrorMessage(e.getMessage());
            animationRepository.save(version);
        }
    }

    /** The HTML of the highest-numbered READY version among {@code priorVersions}, or null. */
    private static String latestReadyHtml(List<Animation> priorVersions) {
        String html = null;
        for (Animation v : priorVersions) {
            if (v.getStatus() == AnimationStatus.READY && v.getGeneratedCode() != null) {
                html = v.getGeneratedCode();
            }
        }
        return html;
    }

    /** Prior user messages, oldest first, one per line — context for the editor. */
    private static String threadOf(List<Animation> priorVersions) {
        StringBuilder sb = new StringBuilder();
        for (Animation v : priorVersions) {
            sb.append("- ").append(v.getPrompt()).append('\n');
        }
        return sb.toString();
    }

    private static String deriveTitle(String firstMessage) {
        String t = firstMessage.strip().replaceAll("\\s+", " ");
        return t.length() <= 60 ? t : t.substring(0, 57) + "…";
    }

    private void logUsage(UUID conversationId, Animation version, String previewUrl, EngineUsage usage) {
        if (usage != null) {
            log.info(
                    "Conversation {} v{} READY — preview {} — usage provider={} model={} in={} out={} cost={}",
                    conversationId,
                    version.getVersionNumber(),
                    previewUrl,
                    usage.provider(),
                    usage.model(),
                    usage.inputTokens(),
                    usage.outputTokens(),
                    usage.costUsd() == null ? "n/a" : String.format("$%.6f", usage.costUsd()));
        } else {
            log.info(
                    "Conversation {} v{} READY — preview {}",
                    conversationId,
                    version.getVersionNumber(),
                    previewUrl);
        }
    }
}
