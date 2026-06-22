package com.toucan_motion.toucan.controller;

import com.toucan_motion.toucan.dto.AnimationDTO;
import com.toucan_motion.toucan.request.CreateAnimationRequest;
import com.toucan_motion.toucan.security.CustomUserDetails;
import com.toucan_motion.toucan.service.AnimationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/animations")
public class AnimationController {

    private final AnimationService animationService;

    @PostMapping
    public AnimationDTO create(
            @AuthenticationPrincipal CustomUserDetails principal,
            @Valid @RequestBody CreateAnimationRequest request) {
        return animationService.create(principal.getId(), request);
    }

    @GetMapping
    public List<AnimationDTO> list(@AuthenticationPrincipal CustomUserDetails principal) {
        return animationService.listForUser(principal.getId());
    }

    @GetMapping("/{id}")
    public AnimationDTO get(
            @AuthenticationPrincipal CustomUserDetails principal, @PathVariable UUID id) {
        return animationService.getForUser(principal.getId(), id);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<String> download(
            @AuthenticationPrincipal CustomUserDetails principal, @PathVariable UUID id) {
        String code = animationService.getCodeForDownload(principal.getId(), id);
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"animation-" + id + ".html\"")
                .contentType(MediaType.TEXT_HTML)
                .body(code);
    }
}
