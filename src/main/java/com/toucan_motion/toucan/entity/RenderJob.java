package com.toucan_motion.toucan.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

/**
 * The source of truth for a render's progress (locked decision 3: no broker — this table IS the
 * queue). One row per render attempt for an {@link Animation}; the renderer reports terminal state
 * back through the internal callback, which advances this row and the owning animation together.
 */
@Entity
@Builder
@Getter
@Setter
@Table(name = "render_jobs")
@AllArgsConstructor
@NoArgsConstructor
public class RenderJob {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private UUID animationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RenderJobStatus status;

    @Column(nullable = false)
    private int attempts;

    @Column(columnDefinition = "text")
    private String error;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
