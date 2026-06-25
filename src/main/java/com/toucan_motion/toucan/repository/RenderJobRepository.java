package com.toucan_motion.toucan.repository;

import com.toucan_motion.toucan.entity.RenderJob;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RenderJobRepository extends JpaRepository<RenderJob, UUID> {

    Optional<RenderJob> findTopByAnimationIdOrderByCreatedAtDesc(UUID animationId);
}
