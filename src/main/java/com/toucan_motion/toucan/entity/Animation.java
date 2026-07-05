package com.toucan_motion.toucan.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.*;

@Entity
@Builder
@Getter
@Setter
@Table(name = "animations")
@AllArgsConstructor
@NoArgsConstructor
public class Animation {

    @Id
    @GeneratedValue
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    /** The user's natural-language description that drives generation. */
    @Column(columnDefinition = "text", nullable = false)
    private String prompt;

    /** The generated, self-contained animation (a single HTML document) — legacy preview path. */
    @Column(columnDefinition = "text")
    private String generatedCode;

    /**
     * The validated JSON spec the animation was rendered from. Persisted so the deferred timeline
     * editor / style-memory features can edit the spec and re-render without re-prompting the model.
     */
    @Column(columnDefinition = "text")
    private String specJson;

    /** Public URL of the hosted, running preview. */
    private String previewUrl;

    /** Public URL of the rendered MP4 (the v0.1 deliverable). Populated when {@code READY}. */
    private String mp4Url;

    /** Public URL of the poster frame for the MP4. */
    private String posterUrl;

    /** Rendered video duration in milliseconds. */
    private Long durationMs;

    /**
     * Token usage + cost telemetry from the HTML engine, stored verbatim as the engine's
     * {@code usage[generate]} JSON. Billing-prep only (author + cost per generation); no Stripe yet.
     */
    @Column(columnDefinition = "text")
    private String engineUsageJson;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AnimationStatus status;

    /** Populated only when {@link #status} is {@link AnimationStatus#FAILED}. */
    @Column(columnDefinition = "text")
    private String errorMessage;

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
