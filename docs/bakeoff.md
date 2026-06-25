# Provider bake-off (Section 5) — methodology & decision record

The AI director (`SceneDirector`) turns one topic prompt into a validated
`SceneSpec` via a single director system prompt
(`src/main/resources/prompts/scene-director-system.md`), with a
generate → parse → validate → **one** repair-reprompt loop. We pick the LLM
provider **empirically**: run both candidates over the fixture prompts and choose
the one with **fewer repair-reprompts at equal valid-spec rate** (locked
decision 4).

## How to run

The bake-off is a gated test (never runs in CI — it's live and costs tokens):

```
RUN_BAKEOFF=1 \
OPENAI_API_KEY=…  ANTHROPIC_API_KEY=…  \
BAKEOFF_SAMPLES=5 \
./mvnw -Dtest=SceneDirectorBakeOffTest test
```

It scores each provider on every topic in `TOPICS`, recording per provider/topic:

- **valid-spec rate** — fraction of runs whose spec passed `SceneSpecValidator`
  (after at most one repair),
- **repair-reprompt count** — total/avg reprompts (0 = validated first try).

Results are printed and written to `target/bakeoff-results.md`.

Candidates: `gpt-4.1` vs `claude-opus-4-8`. Keyless `StubLlmClient` (the bundled
hero fixture) stays the offline control path throughout.

## Decision — PROVISIONAL (pending Section 6)

**Status: not yet run / no provider selected.**

Two blockers, both expected:

1. **Only one topic prompt exists today** (`fixtures/01-auth-flow.json`). A
   bake-off over a single topic is a coin-flip; per the section's own caution we
   do **not** declare a winner off one prompt. The `TOPICS` map grows during the
   Section 6 fixtures climb, and the real comparison happens there.
2. **API keys are required** and are not available in the build sandbox, so the
   live runs are done on a developer machine (or CI with secrets) when Section 6
   provides the topic spread.

Until then the provider remains whatever `llm.provider` / available key selects
at runtime (default OpenAI `gpt-4.1`), and the choice is explicitly provisional.
The offline stub path is unaffected and always available.
