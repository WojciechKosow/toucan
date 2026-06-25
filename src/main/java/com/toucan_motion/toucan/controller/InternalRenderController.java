package com.toucan_motion.toucan.controller;

import com.toucan_motion.toucan.service.RenderCallbackService;
import java.io.IOException;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * Service-to-service endpoints for the renderer. These live under {@code /api/internal/**}, which
 * {@code SecurityConfig} guards with the shared internal token (ROLE_INTERNAL) — never the user JWT.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/internal")
public class InternalRenderController {

    private final RenderCallbackService renderCallbackService;

    /**
     * The renderer's terminal callback. Multipart so a READY result can upload the MP4 (+ poster)
     * straight through to the {@code PublishingService} seam; a FAILED result carries just the error.
     */
    @PostMapping(value = "/render-callback", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void renderCallback(
            @RequestParam("jobId") UUID jobId,
            @RequestParam("status") String status,
            @RequestParam(value = "durationMs", required = false) Long durationMs,
            @RequestParam(value = "error", required = false) String error,
            @RequestPart(value = "mp4", required = false) MultipartFile mp4,
            @RequestPart(value = "poster", required = false) MultipartFile poster) {
        switch (status == null ? "" : status.toUpperCase()) {
            case "READY" -> renderCallbackService.onReady(jobId, durationMs, bytes(mp4), bytes(poster));
            case "FAILED" -> renderCallbackService.onFailed(jobId, error);
            default ->
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "Unknown callback status \"" + status + "\".");
        }
    }

    private static byte[] bytes(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return null;
        }
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Could not read uploaded part.", e);
        }
    }
}
