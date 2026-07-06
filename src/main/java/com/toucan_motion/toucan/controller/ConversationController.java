package com.toucan_motion.toucan.controller;

import com.toucan_motion.toucan.dto.ConversationDTO;
import com.toucan_motion.toucan.request.ConversationMessageRequest;
import com.toucan_motion.toucan.security.CustomUserDetails;
import com.toucan_motion.toucan.service.ConversationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/**
 * The chat-style animation surface: a conversation whose first message generates an animation and
 * whose later messages edit it. Poll {@code GET /{id}} for the current preview + version thread.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/conversations")
public class ConversationController {

    private final ConversationService conversationService;

    /** Start a new conversation from the first message. */
    @PostMapping
    public ConversationDTO start(
            @AuthenticationPrincipal CustomUserDetails principal,
            @Valid @RequestBody ConversationMessageRequest request) {
        return conversationService.start(principal.getId(), request);
    }

    /** Add a follow-up message that edits the current animation. */
    @PostMapping("/{id}/messages")
    public ConversationDTO message(
            @AuthenticationPrincipal CustomUserDetails principal,
            @PathVariable UUID id,
            @Valid @RequestBody ConversationMessageRequest request) {
        return conversationService.postMessage(principal.getId(), id, request);
    }

    @GetMapping
    public List<ConversationDTO> list(@AuthenticationPrincipal CustomUserDetails principal) {
        return conversationService.listForUser(principal.getId());
    }

    @GetMapping("/{id}")
    public ConversationDTO get(
            @AuthenticationPrincipal CustomUserDetails principal, @PathVariable UUID id) {
        return conversationService.getForUser(principal.getId(), id);
    }

    @GetMapping("/{id}/versions/{versionNumber}/download")
    public ResponseEntity<String> download(
            @AuthenticationPrincipal CustomUserDetails principal,
            @PathVariable UUID id,
            @PathVariable int versionNumber) {
        String code = conversationService.getVersionCodeForDownload(principal.getId(), id, versionNumber);
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"animation-" + id + "-v" + versionNumber + ".html\"")
                .contentType(MediaType.TEXT_HTML)
                .body(code);
    }
}
