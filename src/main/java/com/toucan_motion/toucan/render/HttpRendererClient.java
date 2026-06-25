package com.toucan_motion.toucan.render;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** HTTP implementation: {@code POST {renderer.base-url}/render} with the dispatch as JSON. */
@Component
public class HttpRendererClient implements RendererClient {

    private static final Logger log = LoggerFactory.getLogger(HttpRendererClient.class);

    private final RestClient http;

    public HttpRendererClient(@Value("${app.renderer.base-url:http://localhost:3001}") String baseUrl) {
        this.http = RestClient.builder().baseUrl(baseUrl).build();
    }

    @Override
    public void dispatch(RenderDispatch dispatch) {
        log.info("Dispatching render job {} (animation {}) to renderer", dispatch.jobId(), dispatch.animationId());
        http.post().uri("/render").body(dispatch).retrieve().toBodilessEntity();
    }
}
