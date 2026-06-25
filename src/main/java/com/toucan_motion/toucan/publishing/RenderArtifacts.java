package com.toucan_motion.toucan.publishing;

/**
 * Public URLs of a published render. {@code posterUrl} may be null if the renderer produced no
 * poster frame.
 */
public record RenderArtifacts(String mp4Url, String posterUrl) {}
