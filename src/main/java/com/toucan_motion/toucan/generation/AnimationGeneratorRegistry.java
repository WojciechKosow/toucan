package com.toucan_motion.toucan.generation;

import com.toucan_motion.toucan.entity.AnimationType;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Resolves the {@link AnimationGenerator} for a given {@link AnimationType}. */
@Component
public class AnimationGeneratorRegistry {

    private final Map<AnimationType, AnimationGenerator> byType = new EnumMap<>(AnimationType.class);

    public AnimationGeneratorRegistry(List<AnimationGenerator> generators) {
        for (AnimationGenerator generator : generators) {
            byType.put(generator.type(), generator);
        }
    }

    public AnimationGenerator get(AnimationType type) {
        AnimationGenerator generator = byType.get(type);
        if (generator == null) {
            throw new IllegalArgumentException(
                    "This animation type is not available yet: " + type);
        }
        return generator;
    }
}
