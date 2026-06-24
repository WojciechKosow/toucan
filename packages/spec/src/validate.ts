// Thin validation entrypoints over SceneSpecSchema. The renderer re-validates the
// spec it receives with these (belt-and-suspenders behind the Java gatekeeper).
import type { SafeParseReturnType } from "zod";
import { SceneSpecSchema, type SceneSpec } from "./scene-spec.js";

/** Non-throwing validation: returns zod's discriminated success/error result. */
export function validateSceneSpec(
  input: unknown,
): SafeParseReturnType<unknown, SceneSpec> {
  return SceneSpecSchema.safeParse(input);
}

/** Throwing validation: returns the parsed spec or throws ZodError. */
export function parseSceneSpec(input: unknown): SceneSpec {
  return SceneSpecSchema.parse(input);
}
