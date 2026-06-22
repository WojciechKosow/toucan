package com.toucan_motion.toucan.entity;

/**
 * The three animation types Toucan v0.1 supports. Only {@link #CODE_BLOCK} is wired end-to-end
 * in the first vertical slice; the other two follow the same slice once it is proven.
 */
public enum AnimationType {
    CODE_BLOCK,
    ARCHITECTURE_DIAGRAM,
    DATA_STRUCTURE
}
