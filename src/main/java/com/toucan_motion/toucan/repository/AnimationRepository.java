package com.toucan_motion.toucan.repository;

import com.toucan_motion.toucan.entity.Animation;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnimationRepository extends JpaRepository<Animation, UUID> {

    List<Animation> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<Animation> findByIdAndUserId(UUID id, UUID userId);
}
