package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.dto.AnimationDTO;
import com.toucan_motion.toucan.request.CreateAnimationRequest;
import java.util.List;
import java.util.UUID;

public interface AnimationService {

    /** Generates an animation from a prompt, publishes it, and returns the result. */
    AnimationDTO create(UUID userId, CreateAnimationRequest request);

    /** Lists the caller's animations, newest first. */
    List<AnimationDTO> listForUser(UUID userId);

    /** Returns one of the caller's animations. */
    AnimationDTO getForUser(UUID userId, UUID animationId);

    /** Returns the generated HTML of one of the caller's animations, for download. */
    String getCodeForDownload(UUID userId, UUID animationId);
}
