package com.toucan_motion.toucan.render;

import java.util.UUID;

/**
 * The payload Spring sends to the renderer's {@code POST /render}. The renderer renders the
 * {@code specJson}, then reports terminal state back to {@code callbackUrl} authenticated with the
 * shared internal token (which it holds in its own environment — never sent in this dispatch).
 * {@code prompt} is carried so the placeholder renderer can recognise the failure sentinel until
 * real compositions land in Section 3.
 */
public record RenderDispatch(
        UUID jobId, UUID animationId, String prompt, String specJson, String callbackUrl) {}
