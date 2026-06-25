package com.toucan_motion.toucan.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Locked decision 2: the user-facing API takes a prompt only — no animation type. Topic
 * classification survives solely as an optional internal director hint (Section 5), never a user
 * choice.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateAnimationRequest {

    @NotBlank
    @Size(max = 4000)
    private String prompt;
}
