package com.toucan_motion.toucan.engine;

/** Thrown when the animation engine fails to produce a gated HTML file. */
public class EngineException extends RuntimeException {

    public EngineException(String message) {
        super(message);
    }

    public EngineException(String message, Throwable cause) {
        super(message, cause);
    }
}
