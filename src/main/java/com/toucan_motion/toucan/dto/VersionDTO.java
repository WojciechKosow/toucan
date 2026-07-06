package com.toucan_motion.toucan.dto;

import com.toucan_motion.toucan.entity.AnimationStatus;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One turn/version in a conversation: the user's message and the state of the animation it produced. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VersionDTO {
    private Integer versionNumber;
    /** The user's message for this turn. */
    private String message;
    private AnimationStatus status;
    private String errorMessage;
    private LocalDateTime createdAt;
}
