// Closed vocabularies for the SceneSpec IR. These are the ONLY element kinds,
// edge kinds, timeline verbs, and layout directions the engine understands.
//
// Everything downstream (zod schema, Java validator, renderer, AI director
// prompt) dispatches through these registries — never an inline switch. Adding a
// kind/verb is a deliberate, reviewed act (see build-plan: STOP-and-ask before
// extending the kit, then re-verify all fixtures).
import { z } from "zod";

export const ElementKindEnum = z.enum([
  "node",
  "browser",
  "group",
  "label",
  "edge-label",
]);
export type ElementKind = z.infer<typeof ElementKindEnum>;
export const ELEMENT_KINDS = ElementKindEnum.options;

export const EdgeKindEnum = z.enum([
  "data",
  "control",
  "request",
  "response",
  "query",
  "reference",
]);
export type EdgeKind = z.infer<typeof EdgeKindEnum>;
export const EDGE_KINDS = EdgeKindEnum.options;

export const VerbEnum = z.enum([
  "camera.focus",
  "packet.travel",
  "node.state",
  "highlight",
  "edge.draw",
  "label.show",
]);
export type Verb = z.infer<typeof VerbEnum>;
export const VERBS = VerbEnum.options;

export const DirectionEnum = z.enum(["LR", "RL", "TB", "BT"]);
export type LayoutDirection = z.infer<typeof DirectionEnum>;

/** What kind of id each verb's `target` must resolve to. Registry — never a switch. */
export type TargetType = "element" | "edge" | "any";
export const VERB_TARGET: Record<Verb, TargetType> = {
  "camera.focus": "element",
  "packet.travel": "edge",
  "node.state": "element",
  highlight: "any",
  "edge.draw": "edge",
  "label.show": "element",
};
