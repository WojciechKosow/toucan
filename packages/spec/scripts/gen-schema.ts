// Emits schema/scene-spec.schema.json from the zod SceneSpecSchema.
//
// Note: zod-to-json-schema captures structure + closed vocabularies, but NOT the
// referential-integrity refinements (those are inexpressible in JSON Schema and
// live in code — SceneSpecSchema.superRefine and the Java SceneSpecValidator).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { SceneSpecSchema } from "../src/scene-spec.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../schema");
const outFile = resolve(outDir, "scene-spec.schema.json");

const jsonSchema = zodToJsonSchema(SceneSpecSchema, {
  name: "SceneSpec",
  $refStrategy: "none",
});

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(jsonSchema, null, 2) + "\n", "utf8");
console.log(`wrote ${outFile}`);
