package com.toucan_motion.toucan.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;

/** Enables {@code @Async} so {@code AnimationProcessor} runs the render hand-off off the request thread. */
@Configuration
@EnableAsync
public class AsyncConfig {}
