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
}
