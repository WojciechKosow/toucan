package com.toucan_motion.toucan.entity;

/** Lifecycle of a single render attempt for an {@link Animation}. */
public enum RenderJobStatus {
    QUEUED,
    GENERATING,
    READY,
    FAILED
}
