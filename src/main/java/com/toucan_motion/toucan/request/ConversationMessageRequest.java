package com.toucan_motion.toucan.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A user message — the first one starts a conversation; later ones edit the current animation. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ConversationMessageRequest {

    @NotBlank
    @Size(max = 4000)
    private String message;
}
