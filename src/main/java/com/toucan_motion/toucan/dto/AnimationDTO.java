package com.toucan_motion.toucan.dto;

import com.toucan_motion.toucan.entity.AnimationStatus;
import com.toucan_motion.toucan.entity.AnimationType;
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
    private AnimationType type;
    private String prompt;
    private String previewUrl;
    private String embedSnippet;
    private AnimationStatus status;
    private String errorMessage;
    private LocalDateTime createdAt;
}
