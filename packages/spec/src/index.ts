// @toucan/spec — the single definition of the SceneSpec wire contract.
//
// element + edge + timeline IR with closed vocabularies for element `kind` and
// timeline `verb`. NO coordinates anywhere (positions come from auto-layout).
// Referential integrity (every edge endpoint / group member / timeline target
// resolves) is enforced in SceneSpecSchema's superRefine. The Spring Boot
// SceneSpecValidator mirrors these rules; schema/scene-spec.schema.json is the
// exported JSON Schema artifact (structure + vocab only — refinements live in code).

export const SPEC_PACKAGE = "@toucan/spec";

export * from "./vocab.js";
export * from "./scene-spec.js";
export * from "./validate.js";
