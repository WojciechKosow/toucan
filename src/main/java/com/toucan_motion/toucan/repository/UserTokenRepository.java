package com.toucan_motion.toucan.repository;

import java.util.Optional;
import java.util.UUID;

import com.toucan_motion.toucan.entity.TokenType;
import com.toucan_motion.toucan.entity.User;
import com.toucan_motion.toucan.entity.UserToken;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserTokenRepository extends JpaRepository<UserToken, UUID> {
    Optional<UserToken> findByUserAndTypeAndUsedFalse(User user, TokenType type);
}
