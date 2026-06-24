// @toucan/spec — the single definition of the SceneSpec wire contract.
//
// Placeholder for Section 0. Section 1 fills this in with the zod schema and
// types for the element + edge + timeline IR (closed vocabularies for element
// `kind` and timeline `verb`), plus the exported JSON Schema artifact that the
// Spring Boot validator mirrors.
//
// Contract invariants (enforced from Section 1):
//   - elements/edges/timeline only; NO coordinates anywhere (positions come from
//     auto-layout).
//   - referential integrity: every edge.from/to and timeline.target resolves.
//   - kind/verb dispatch via a registry, never an inline switch.

export const SPEC_PACKAGE = "@toucan/spec";
