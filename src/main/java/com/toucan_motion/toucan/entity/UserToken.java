package com.toucan_motion.toucan.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "user_tokens")
public class UserToken {
    @Id private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

    @Enumerated(EnumType.STRING)
    private TokenType type;

    @Column(nullable = false)
    private String tokenHash;

    private LocalDateTime expiresAt;

    private boolean used;

    private LocalDateTime createdAt;
}