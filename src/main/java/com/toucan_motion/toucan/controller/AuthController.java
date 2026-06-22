package com.toucan_motion.toucan.controller;

import com.toucan_motion.toucan.request.LoginRequest;
import com.toucan_motion.toucan.request.RegisterRequest;
import com.toucan_motion.toucan.response.AuthResponse;
import com.toucan_motion.toucan.service.UserService;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    @PostMapping("/register")
    public ResponseEntity<String> register(@Valid @RequestBody RegisterRequest request) {
        userService.register(request);
        return ResponseEntity.ok("If registration is possible, you will receive further instructions.");
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody LoginRequest request) {
        return userService.login(request);
    }

    @GetMapping("/verify")
    public ResponseEntity<String> verifyAccount(
            @RequestParam UUID tokenId, @RequestParam String token) {
        userService.verifyAccount(tokenId, token);
        return ResponseEntity.ok("Your account has been activated.");
    }

    @PostMapping("/resend-verification-email")
    public ResponseEntity<String> resendVerificationEmail(@Valid @RequestBody String email) {
        userService.resendVerificationEmail(email);
        return ResponseEntity.ok("If your email is registered and unverified, a new link has been sent.");
    }

    @PostMapping("/reset-password")
    public ResponseEntity<String> resetPassword(@Valid @RequestBody String email) {
        userService.resetPassword(email);
        return ResponseEntity.ok("If your email is registered, you will receive a password reset link.");
    }

//    @PostMapping("/confirm-password-reset")
//    public ResponseEntity<String> confirmPasswordReset(
//            @RequestParam UUID tokenId,
//            @RequestParam String token,
//            @Valid @RequestBody PasswordResetRequest request) {
//        userService.confirmPasswordReset(tokenId, token, request.getNewPassword());
//        return ResponseEntity.ok("Your password has been reset successfully.");
//    }
}