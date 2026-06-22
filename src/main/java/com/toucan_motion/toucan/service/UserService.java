package com.toucan_motion.toucan.service;

import com.toucan_motion.toucan.dto.UserDTO;
import com.toucan_motion.toucan.request.LoginRequest;
import com.toucan_motion.toucan.request.RegisterRequest;
import com.toucan_motion.toucan.response.AuthResponse;

import java.util.UUID;

public interface UserService {
    AuthResponse login(LoginRequest request);

    UserDTO getCurrentUser(UUID userId);

    void register(RegisterRequest request);

    void verifyAccount(UUID tokenId, String token);

    void resendVerificationEmail(String email);

    void resetPassword(String email);

    void confirmPasswordReset(UUID tokenId, String rawToken, String newPassword);
}