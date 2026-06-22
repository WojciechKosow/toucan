package com.toucan_motion.toucan.request;

import com.toucan_motion.toucan.entity.AnimationType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateAnimationRequest {

    @NotNull private AnimationType type;

    @NotBlank
    @Size(max = 4000)
    private String prompt;
}
