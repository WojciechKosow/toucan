package com.toucan_motion.toucan.generation.scene;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.toucan_motion.toucan.generation.LlmClient;
import org.junit.jupiter.api.Test;

/**
 * The director's generate → parse → validate → one-repair machinery, exercised deterministically
 * with a mocked {@link LlmClient} (no API key, no network), plus the keyless stub path that returns
 * the bundled hero fixture.
 */
class SceneDirectorTest {

    private final SceneSpecValidator validator = new SceneSpecValidator();

    // A valid spec, deliberately wrapped in prose + a code fence to exercise JSON extraction.
    private static final String GOOD_RESPONSE =
            "Sure! Here is the spec:\n```json\n"
                    + "{\"meta\":{\"title\":\"Demo\",\"direction\":\"LR\"},"
                    + "\"elements\":[{\"id\":\"a\",\"kind\":\"node\",\"props\":{\"label\":\"A\"}},"
                    + "{\"id\":\"b\",\"kind\":\"node\",\"props\":{\"label\":\"B\"}}],"
                    + "\"edges\":[{\"id\":\"e\",\"from\":\"a\",\"to\":\"b\",\"kind\":\"data\"}],"
                    + "\"timeline\":[{\"verb\":\"edge.draw\",\"target\":\"e\"},"
                    + "{\"verb\":\"node.state\",\"target\":\"b\",\"args\":{\"state\":\"active\"}}]}"
                    + "\n```\n";

    // Invalid: the timeline targets an id that does not resolve -> validator rejects it.
    private static final String BAD_RESPONSE =
            "{\"meta\":{\"title\":\"Broken\"},"
                    + "\"elements\":[{\"id\":\"a\",\"kind\":\"node\",\"props\":{\"label\":\"A\"}}],"
                    + "\"timeline\":[{\"verb\":\"camera.focus\",\"target\":\"does-not-exist\"}]}";

    @Test
    void stubPathReturnsTheValidHeroSpecOffline() {
        LlmClient stub = mock(LlmClient.class);
        when(stub.isLive()).thenReturn(false);

        SceneDirector director = new SceneDirector(stub, validator);
        SceneSpec spec = director.direct("anything at all");

        assertThat(spec.getMeta().getTitle()).isEqualTo("How JWT authentication works");
        assertThat(spec.getElements()).isNotEmpty();
        assertThat(spec.getTimeline()).isNotEmpty();
        validator.validate(spec); // does not throw
    }

    @Test
    void liveValidatesOnFirstTry() {
        LlmClient llm = mock(LlmClient.class);
        when(llm.isLive()).thenReturn(true);
        when(llm.complete(any(), any())).thenReturn(GOOD_RESPONSE);

        DirectorOutcome outcome = new SceneDirector(llm, validator).generate("explain a thing");

        assertThat(outcome.valid()).isTrue();
        assertThat(outcome.reprompts()).isZero();
        assertThat(outcome.spec().getElements()).hasSize(2);
        verify(llm, times(1)).complete(any(), any());
    }

    @Test
    void liveRepairsOnceThenValidates() {
        LlmClient llm = mock(LlmClient.class);
        when(llm.isLive()).thenReturn(true);
        when(llm.complete(any(), any())).thenReturn(BAD_RESPONSE, GOOD_RESPONSE);

        DirectorOutcome outcome = new SceneDirector(llm, validator).generate("explain a thing");

        assertThat(outcome.valid()).isTrue();
        assertThat(outcome.reprompts()).isEqualTo(1);
        verify(llm, times(2)).complete(any(), any());
    }

    @Test
    void liveFailingTwiceIsInvalidAndDirectThrows() {
        LlmClient llm = mock(LlmClient.class);
        when(llm.isLive()).thenReturn(true);
        when(llm.complete(any(), any())).thenReturn(BAD_RESPONSE, BAD_RESPONSE);

        SceneDirector director = new SceneDirector(llm, validator);

        DirectorOutcome outcome = director.generate("explain a thing");
        assertThat(outcome.valid()).isFalse();
        assertThat(outcome.reprompts()).isEqualTo(1);
        assertThat(outcome.error()).isNotBlank();

        assertThatThrownBy(() -> director.direct("explain a thing"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("did not return a valid SceneSpec");
    }
}
