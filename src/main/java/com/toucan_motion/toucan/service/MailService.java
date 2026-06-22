package com.toucan_motion.toucan.service;

import java.util.UUID;

public interface MailService {
    void sendVerificationEmail(String to, UUID tokenId, String rawToken);

    void sendPasswordResetEmail(String to, UUID tokenId, String rawToken);
}