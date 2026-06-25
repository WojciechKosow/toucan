package com.toucan_motion.toucan.render;

/**
 * Dispatches a render to the Node renderer service. Synchronous HTTP hand-off only — the renderer
 * accepts the job and reports completion asynchronously through the internal callback, so this
 * returns as soon as the renderer has accepted the work. A non-2xx / unreachable renderer surfaces
 * as an exception, which the worker turns into a FAILED job.
 */
public interface RendererClient {

    void dispatch(RenderDispatch dispatch);
}
