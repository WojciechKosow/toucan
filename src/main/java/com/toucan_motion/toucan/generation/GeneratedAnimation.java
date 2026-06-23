package com.toucan_motion.toucan.generation;

/**
 * The output of a generator: the self-contained HTML bundle (preview + download + MP4 source) and the
 * validated JSON spec it was rendered from. The spec is persisted alongside the HTML so the deferred
 * timeline editor / style-memory features can edit the spec and re-render without re-prompting.
 *
 * @param html a single self-contained HTML document exposing {@code window.__seek} / {@code
 *     window.__duration}
 * @param specJson the validated spec as canonical JSON
 */
public record GeneratedAnimation(String html, String specJson) {}
