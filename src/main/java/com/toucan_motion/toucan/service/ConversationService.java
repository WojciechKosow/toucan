package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.dto.ConversationDTO;
import com.toucan_motion.toucan.request.ConversationMessageRequest;
import java.util.List;
import java.util.UUID;

public interface ConversationService {

    /** Starts a conversation from the first message (generates version 1), async. */
    ConversationDTO start(UUID userId, ConversationMessageRequest request);

    /** Adds a follow-up message that edits the current animation (a new version), async. */
    ConversationDTO postMessage(UUID userId, UUID conversationId, ConversationMessageRequest request);

    /** Lists the caller's conversations, newest first (without the versions array). */
    List<ConversationDTO> listForUser(UUID userId);

    /** Returns one conversation with its full version thread. */
    ConversationDTO getForUser(UUID userId, UUID conversationId);

    /** Returns the HTML of a specific version, for download. */
    String getVersionCodeForDownload(UUID userId, UUID conversationId, int versionNumber);
}
