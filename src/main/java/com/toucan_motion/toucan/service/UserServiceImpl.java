package com.toucan_motion.toucan.service;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import com.toucan_motion.toucan.dto.UserDTO;
import com.toucan_motion.toucan.entity.Role;
import com.toucan_motion.toucan.entity.TokenType;
import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.entity.UserToken;
import com.toucan_motion.toucan.repository.UserRepository;
import com.toucan_motion.toucan.repository.UserTokenRepository;
import com.toucan_motion.toucan.request.LoginRequest;
import com.toucan_motion.toucan.request.RegisterRequest;
import com.toucan_motion.toucan.response.AuthResponse;
import com.toucan_motion.toucan.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;
    private final MailService mailService;
    private final UserTokenRepository userTokenRepository;

    @Override
    public AuthResponse login(LoginRequest request) {
        User user =
                userRepository
                        .findByEmail(request.getEmail())
                        .orElseThrow(() -> new RuntimeException("Invalid email or password."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new RuntimeException("Invalid email or password.");
        }

        if (!user.isEnabled()) {
            throw new RuntimeException("Please verify your email address before logging in.");
        }

        String token = jwtProvider.generateToken(user.getId(), request.isRememberMe());

        return new AuthResponse(token, mapToDTO(user));
    }

    @Override
    public UserDTO getCurrentUser(UUID userId) {
        User user =
                userRepository
                        .findById(userId)
                        .orElseThrow(() -> new RuntimeException("User not found."));
        return mapToDTO(user);
    }

    @Override
    public void register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email already in use.");
        }

        User user = new User();
        user.setEmail(request.getEmail());
        user.setDisplayName(request.getName());
        user.setRole(Role.USER);
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setEnabled(false);

        userRepository.save(user);

        UUID tokenId = UUID.randomUUID();
        String rawToken = UUID.randomUUID().toString();

        UserToken token =
                UserToken.builder()
                        .id(tokenId)
                        .user(user)
                        .type(TokenType.EMAIL_VERIFICATION)
                        .tokenHash(passwordEncoder.encode(rawToken))
                        .expiresAt(LocalDateTime.now().plusMinutes(30))
                        .used(false)
                        .createdAt(LocalDateTime.now())
                        .build();

        userTokenRepository.save(token);
        mailService.sendVerificationEmail(user.getEmail(), tokenId, rawToken);
    }

    @Override
    public void verifyAccount(UUID tokenId, String rawToken) {
        UserToken token =
                userTokenRepository
                        .findById(tokenId)
                        .orElseThrow(() -> new RuntimeException("Invalid token."));

        if (token.isUsed()) {
            throw new RuntimeException("Token already used.");
        }

        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("Token expired.");
        }

        if (!passwordEncoder.matches(rawToken, token.getTokenHash())) {
            throw new RuntimeException("Invalid token.");
        }

        if (!token.getType().equals(TokenType.EMAIL_VERIFICATION)) {
            throw new RuntimeException("Invalid token.");
        }

        User user = token.getUser();
        user.setEnabled(true);
        token.setUsed(true);

        userRepository.save(user);
        userTokenRepository.save(token);
    }

    @Override
    public void resendVerificationEmail(String email) {
        Optional<User> userOptional = userRepository.findByEmail(email);

        if (userOptional.isEmpty()) {
            return;
        }

        User user = userOptional.get();

        if (user.isEnabled()) {
            return;
        }

        Optional<UserToken> oldToken =
                userTokenRepository.findByUserAndTypeAndUsedFalse(user, TokenType.EMAIL_VERIFICATION);
        oldToken.ifPresent(userTokenRepository::delete);

        UUID tokenId = UUID.randomUUID();
        String rawToken = UUID.randomUUID().toString();

        UserToken token =
                UserToken.builder()
                        .id(tokenId)
                        .user(user)
                        .type(TokenType.EMAIL_VERIFICATION)
                        .tokenHash(passwordEncoder.encode(rawToken))
                        .expiresAt(LocalDateTime.now().plusMinutes(30))
                        .used(false)
                        .createdAt(LocalDateTime.now())
                        .build();

        userTokenRepository.save(token);
        mailService.sendVerificationEmail(email, tokenId, rawToken);
    }

    @Override
    public void resetPassword(String email) {
        Optional<User> userOptional = userRepository.findByEmail(email);

        if (userOptional.isEmpty()) {
            return;
        }

        User user = userOptional.get();

        Optional<UserToken> oldToken =
                userTokenRepository.findByUserAndTypeAndUsedFalse(user, TokenType.PASSWORD_RESET);
        oldToken.ifPresent(userTokenRepository::delete);

        String rawToken = UUID.randomUUID().toString();
        UUID tokenId = UUID.randomUUID();

        UserToken token =
                UserToken.builder()
                        .id(tokenId)
                        .user(user)
                        .type(TokenType.PASSWORD_RESET)
                        .tokenHash(passwordEncoder.encode(rawToken))
                        .expiresAt(LocalDateTime.now().plusMinutes(30))
                        .used(false)
                        .createdAt(LocalDateTime.now())
                        .build();

        userTokenRepository.save(token);
        mailService.sendPasswordResetEmail(email, tokenId, rawToken);
    }

    @Override
    public void confirmPasswordReset(UUID tokenId, String rawToken, String newPassword) {
        UserToken token =
                userTokenRepository
                        .findById(tokenId)
                        .orElseThrow(() -> new RuntimeException("Invalid token."));

        if (token.isUsed()) {
            throw new RuntimeException("Token already used.");
        }

        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("Token expired.");
        }

        if (!passwordEncoder.matches(rawToken, token.getTokenHash())) {
            throw new RuntimeException("Invalid token.");
        }

        if (!token.getType().equals(TokenType.PASSWORD_RESET)) {
            throw new RuntimeException("Invalid token.");
        }

        User user = token.getUser();
        user.setPassword(passwordEncoder.encode(newPassword));
        token.setUsed(true);

        userRepository.save(user);
        userTokenRepository.save(token);
    }

    private UserDTO mapToDTO(User user) {
        return new UserDTO(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                user.isEnabled(),
                user.getCreatedAt());
    }
}