package com.toucan_motion.toucan.repository;

import com.toucan_motion.toucan.entity.Animation;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnimationRepository extends JpaRepository<Animation, UUID> {

    List<Animation> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Animation> findByIdAndUserId(UUID id, UUID userId);

    /** All versions of a conversation, oldest first (turn order). */
    List<Animation> findByConversationIdOrderByVersionNumberAsc(UUID conversationId);

    /** The latest version of a conversation (highest version number), if any. */
    Optional<Animation> findTopByConversationIdOrderByVersionNumberDesc(UUID conversationId);

    /** A specific version of a conversation. */
    Optional<Animation> findByConversationIdAndVersionNumber(UUID conversationId, Integer versionNumber);
}
