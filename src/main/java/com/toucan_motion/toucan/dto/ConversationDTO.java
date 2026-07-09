package com.toucan_motion.toucan.dto;

import com.toucan_motion.toucan.entity.AnimationStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A chat-style animation session. {@code status} is derived from the latest version (what the thread
 * is doing right now). {@code versions} is populated on the single-conversation view and left null on
 * the list view.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConversationDTO {
    private UUID id;
    private String title;
    /** Derived from the latest version's status (PENDING/GENERATING while a turn runs). */
    private AnimationStatus status;
    /** Version number the preview currently shows; null until the first version is READY. */
    private Integer currentVersion;
    /** Public URL of the hosted current version. */
    private String previewUrl;
    private List<VersionDTO> versions;
    private LocalDateTime createdAt;
}
