package com.toucan_motion.toucan.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

/**
 * A chat-style animation session: a thread of turns, each an {@link Animation} row (a version). Turn
 * 1 generates from scratch; later turns edit the current HTML. The hosted preview always shows the
 * current version ({@link #previewUrl}); prior versions' HTML is kept on their {@link Animation} rows.
 */
@Entity
@Builder
@Getter
@Setter
@Table(name = "conversations")
@AllArgsConstructor
@NoArgsConstructor
public class Conversation {

    @Id
    @GeneratedValue
    private UUID id;

    /** Author — billing-prep, and the ownership scope for all endpoints. */
    @Column(nullable = false)
    private UUID userId;

    /** Human-readable title; derived from the first message when the first version becomes READY. */
    private String title;

    /** Version number of the latest READY version (what {@link #previewUrl} shows). Null until then. */
    private Integer currentVersion;

    /** Public URL of the hosted current version: {@code /preview/{id}/index.html}. */
    private String previewUrl;

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
