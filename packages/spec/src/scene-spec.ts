// The SceneSpec contract: the single element + edge + timeline IR the AI emits
// and the renderer consumes. NO coordinates anywhere — positions are computed by
// the deterministic auto-layout pass (Section 2). Structure + closed vocabularies
// are enforced here in zod; referential integrity is enforced in the superRefine
// below. The Java SceneSpecValidator mirrors these rules exactly.
import { z } from "zod";
import {
  DirectionEnum,
  EdgeKindEnum,
  ElementKindEnum,
  VERB_TARGET,
  VerbEnum,
} from "./vocab.js";

/** Envelope limits — keep specs inside the "renders clean" window. */
export const LIMITS = {
  maxElements: 24,
  maxEdges: 48,
  maxTimeline: 64,
  beatMinMs: 300,
  beatMaxMs: 6000,
} as const;

/** A short slug id, unique across elements and (separately) edges. */
const id = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "id must be a short slug (letters, digits, - or _)",
  );

// ── per-kind element props (registry of shapes, keyed by `kind`) ──
const nodeProps = z.object({
  label: z.string().min(1),
  sublabel: z.string().optional(),
  icon: z.string().optional(),
});
const browserProps = z.object({
  label: z.string().min(1).default("Browser"),
  url: z.string().optional(),
});
const labelProps = z.object({ text: z.string().min(1) });
const edgeLabelProps = z.object({ text: z.string().min(1) });
const groupProps = z.object({
  label: z.string().optional(),
  members: z.array(id).min(1),
});

export const ElementSchema = z.discriminatedUnion("kind", [
  z.object({
    id,
    kind: z.literal(ElementKindEnum.enum.node),
    props: nodeProps,
  }),
  z.object({
    id,
    kind: z.literal(ElementKindEnum.enum.browser),
    props: browserProps,
  }),
  z.object({
    id,
    kind: z.literal(ElementKindEnum.enum.label),
    props: labelProps,
  }),
  z.object({
    id,
    kind: z.literal(ElementKindEnum.enum["edge-label"]),
    props: edgeLabelProps,
  }),
  z.object({
    id,
    kind: z.literal(ElementKindEnum.enum.group),
    props: groupProps,
  }),
]);
export type Element = z.infer<typeof ElementSchema>;

export const EdgeSchema = z.object({
  id,
  from: id,
  to: id,
  kind: EdgeKindEnum.default("data"),
  label: z.string().optional(),
});
export type Edge = z.infer<typeof EdgeSchema>;

export const TimelineStepSchema = z.object({
  verb: VerbEnum,
  /** id of the element or edge this verb acts on (resolved per VERB_TARGET). */
  target: id,
  /** optional absolute beat index. */
  at: z.number().int().nonnegative().optional(),
  /** optional "play after this element/edge's animation" reference. */
  after: id.optional(),
  args: z.record(z.unknown()).optional(),
});
export type TimelineStep = z.infer<typeof TimelineStepSchema>;

export const MetaSchema = z.object({
  title: z.string().min(1),
  /** optional internal director hint (topic class) — never user-facing. */
  topic: z.string().optional(),
  direction: DirectionEnum.default("LR"),
  themeParams: z.record(z.unknown()).optional(),
  beatDurationMs: z
    .number()
    .int()
    .min(LIMITS.beatMinMs)
    .max(LIMITS.beatMaxMs)
    .optional(),
});
export type Meta = z.infer<typeof MetaSchema>;

/**
 * The full SceneSpec. The superRefine enforces referential integrity that a flat
 * schema cannot: unique ids, disjoint element/edge id-spaces, every edge endpoint
 * and group member and timeline target resolving to a declared id of the right
 * kind. A dangling id fails here, before the spec can ever reach the renderer.
 */
export const SceneSpecSchema = z
  .object({
    meta: MetaSchema,
    elements: z.array(ElementSchema).min(1).max(LIMITS.maxElements),
    edges: z.array(EdgeSchema).max(LIMITS.maxEdges).default([]),
    timeline: z.array(TimelineStepSchema).min(1).max(LIMITS.maxTimeline),
  })
  .superRefine((spec, ctx) => {
    const elementIds = new Set<string>();
    spec.elements.forEach((el, i) => {
      if (elementIds.has(el.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate element id "${el.id}"`,
          path: ["elements", i, "id"],
        });
      }
      elementIds.add(el.id);
    });

    const edgeIds = new Set<string>();
    spec.edges.forEach((e, i) => {
      if (edgeIds.has(e.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate edge id "${e.id}"`,
          path: ["edges", i, "id"],
        });
      }
      edgeIds.add(e.id);
      if (elementIds.has(e.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge id "${e.id}" collides with an element id (id-spaces must be disjoint)`,
          path: ["edges", i, "id"],
        });
      }
      if (!elementIds.has(e.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge "${e.id}" references unknown source element "${e.from}"`,
          path: ["edges", i, "from"],
        });
      }
      if (!elementIds.has(e.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `edge "${e.id}" references unknown target element "${e.to}"`,
          path: ["edges", i, "to"],
        });
      }
    });

    // group members must resolve to declared elements
    spec.elements.forEach((el, i) => {
      if (el.kind === "group") {
        el.props.members.forEach((m, j) => {
          if (!elementIds.has(m)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `group "${el.id}" references unknown member element "${m}"`,
              path: ["elements", i, "props", "members", j],
            });
          }
        });
      }
    });

    // timeline targets resolve to the id-space the verb acts on
    spec.timeline.forEach((step, i) => {
      const want = VERB_TARGET[step.verb];
      const isElement = elementIds.has(step.target);
      const isEdge = edgeIds.has(step.target);
      const resolves =
        want === "element"
          ? isElement
          : want === "edge"
            ? isEdge
            : isElement || isEdge;
      if (!resolves) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `timeline[${i}] verb "${step.verb}" target "${step.target}" does not resolve to ${
            want === "any" ? "an element or edge" : `${want}`
          }`,
          path: ["timeline", i, "target"],
        });
      }
      if (
        step.after !== undefined &&
        !elementIds.has(step.after) &&
        !edgeIds.has(step.after)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `timeline[${i}] "after" references unknown id "${step.after}"`,
          path: ["timeline", i, "after"],
        });
      }
    });
  });

export type SceneSpec = z.infer<typeof SceneSpecSchema>;
