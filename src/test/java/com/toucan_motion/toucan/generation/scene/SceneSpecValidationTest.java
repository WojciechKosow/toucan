package com.toucan_motion.toucan.generation.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.toucan_motion.toucan.generation.scene.SceneSpec.Element;
import com.toucan_motion.toucan.generation.scene.SceneSpec.TimelineStep;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * Java half of the Section 1 gate. Loads the SAME frozen fixture the Node test
 * uses ({@code fixtures/01-auth-flow.json}) and asserts the two validators agree:
 * the fixture validates, and the same referential-integrity violations are
 * rejected with a clear message.
 */
class SceneSpecValidationTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Path FIXTURE = Path.of("fixtures/01-auth-flow.json");

    private final SceneSpecValidator validator = new SceneSpecValidator();

    private SceneSpec loadFixture() throws Exception {
        assertThat(Files.exists(FIXTURE))
                .as("fixture present at %s (cwd=%s)", FIXTURE, Path.of("").toAbsolutePath())
                .isTrue();
        return MAPPER.readValue(Files.readString(FIXTURE), SceneSpec.class);
    }

    @Test
    void authFlowFixtureIsValid() throws Exception {
        SceneSpec spec = loadFixture();
        assertThatCode(() -> validator.validate(spec)).doesNotThrowAnyException();
    }

    @Test
    void danglingTimelineTargetIsRejected() throws Exception {
        SceneSpec spec = loadFixture();
        spec.getTimeline().get(0).setTarget("does_not_exist");
        assertThatThrownBy(() -> validator.validate(spec))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does_not_exist");
    }

    @Test
    void danglingEdgeFromIsRejected() throws Exception {
        SceneSpec spec = loadFixture();
        spec.getEdges().get(0).setFrom("ghost");
        assertThatThrownBy(() -> validator.validate(spec))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ghost");
    }

    @Test
    void unknownElementKindIsRejected() throws Exception {
        SceneSpec spec = loadFixture();
        Element bogus = new Element();
        bogus.setId("x");
        bogus.setKind("wormhole");
        bogus.setProps(new LinkedHashMap<>());
        spec.getElements().add(bogus);
        assertThatThrownBy(() -> validator.validate(spec))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("wormhole");
    }

    @Test
    void unknownTimelineVerbIsRejected() throws Exception {
        SceneSpec spec = loadFixture();
        spec.getTimeline().get(0).setVerb("teleport");
        assertThatThrownBy(() -> validator.validate(spec))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("teleport");
    }

    @Test
    void wrongTargetTypeForVerbIsRejected() throws Exception {
        SceneSpec spec = loadFixture();
        // packet.travel must target an edge; point it at an element id instead.
        TimelineStep travel =
                spec.getTimeline().stream()
                        .filter(s -> "packet.travel".equals(s.getVerb()))
                        .findFirst()
                        .orElseThrow();
        travel.setTarget("client");
        assertThatThrownBy(() -> validator.validate(spec))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("does not resolve to edge");
    }

    @Test
    void duplicateElementIdIsRejected() throws Exception {
        SceneSpec spec = loadFixture();
        Element dup = new Element();
        dup.setId("api");
        dup.setKind("label");
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("text", "dup");
        dup.setProps(props);
        spec.getElements().add(dup);
        assertThatThrownBy(() -> validator.validate(spec))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Duplicate element id");
    }
}
