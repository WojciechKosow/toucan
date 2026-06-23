package com.toucan_motion.toucan.entity;

/**
 * The three animation types Toucan v0.1 supports, all built on the shared spec/render pipeline.
 *
 * <ul>
 *   <li>{@link #FLOW} — Sequential Flow (the hero type): how something moves through ordered stages.
 *   <li>{@link #CODE_BLOCK} — Animated Code Block: progressive reveal, highlighting, annotations.
 *   <li>{@link #DATA_STRUCTURE} — operations on a basic data structure (array, stack, linked list).
 * </ul>
 */
public enum AnimationType {
    FLOW,
    CODE_BLOCK,
    DATA_STRUCTURE
}
