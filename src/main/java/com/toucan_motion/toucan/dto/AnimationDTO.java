package com.toucan_motion.toucan.dto;

import com.toucan_motion.toucan.entity.AnimationStatus;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnimationDTO {
    private UUID id;
    private String prompt;
    private AnimationStatus status;
    /** Public URL of the hosted, running HTML preview (the v0.1 deliverable). */
    private String previewUrl;
    private String mp4Url;
    private String posterUrl;
    private Long durationMs;
    private String embedSnippet;
    private String errorMessage;
    private LocalDateTime createdAt;
}
