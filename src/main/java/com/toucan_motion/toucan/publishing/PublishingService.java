package com.toucan_motion.toucan.publishing;

import java.util.UUID;

/**
 * Writes a self-contained animation bundle to storage and returns its public preview URL.
 *
 * <p>v0.1 ships a local-filesystem implementation served by Spring Boot. The interface exists so a
 * Cloudflare R2 / CDN implementation can drop in later without touching any caller.
 */
public interface PublishingService {

    /**
     * @param animationId identifies the bundle (used as the storage path / URL segment)
     * @param html the complete, self-contained HTML document
     * @return the public URL at which the running preview is served
     */
    String publish(UUID animationId, String html);

    /**
     * Stores a rendered MP4 (and optional poster) for an animation and returns their public URLs.
     * This is the storage seam the renderer's callback writes through — swapping local FS for R2/S3
     * later changes only this method, never the renderer or callback contract.
     *
     * @param animationId identifies the bundle (storage path / URL segment)
     * @param mp4 the rendered MP4 bytes
     * @param poster the poster-frame bytes, or {@code null} if none
     * @return the public URLs of the stored MP4 and poster
     */
    RenderArtifacts publishRender(UUID animationId, byte[] mp4, byte[] poster);
}
