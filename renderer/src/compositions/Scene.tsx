// The top-level Scene composition: consumes a validated SceneSpec + the
// deterministic layout, and sequences the timeline into eased, frame-pure motion
// built strictly to docs/visual-style.md. Element/verb dispatch goes through the
// registries (no switch). Frame N is a pure function of N (§10).
import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneSpec } from "@toucan/spec";
import { layoutScene } from "../layout/index.js";
import { buildTheme, type ThemeParams } from "../theme.js";
import { interFontFamily } from "../fonts.js";
import { progress } from "../timing.js";
import { buildSchedule } from "./schedule.js";
import { deriveRenderState } from "./runtime.js";
import { ELEMENT_COMPONENTS } from "./elements/registry.js";
import { EdgeShape, Packet } from "./elements/Edge.js";
import { SAFE_MARGIN } from "../layout/constants.js";

// Intersected with Record<string, unknown> so it satisfies Remotion's
// Composition generic (Props extends Record<string, unknown>).
export type SceneProps = {
  spec: SceneSpec;
  themeParams?: ThemeParams;
} & Record<string, unknown>;

export const Scene: React.FC<SceneProps> = ({ spec, themeParams }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tp = (themeParams ??
    (spec.meta?.themeParams as ThemeParams) ??
    {}) as ThemeParams;
  const theme = useMemo(() => buildTheme(tp, interFontFamily), [tp]);
  const layout = useMemo(() => layoutScene(spec), [spec]);
  const schedule = useMemo(
    () => buildSchedule(spec, layout, fps),
    [spec, layout, fps],
  );
  const rs = deriveRenderState(spec, layout, schedule, frame, fps, theme);

  const groups = spec.elements.filter((e) => e.kind === "group");
  const nonGroups = spec.elements.filter((e) => e.kind !== "group");
  const edges = spec.edges ?? [];

  const titleOpacity = progress(
    frame,
    0,
    theme.motion.ms.slow,
    fps,
    theme.motion.easing.outSoft,
  );

  return (
    <AbsoluteFill style={{ background: theme.color.bgBase }}>
      {/* camera-transformed stage (transformOrigin 0,0 so focus math lands centered) */}
      <AbsoluteFill
        style={{
          transform: `translate(${rs.camera.x}px, ${rs.camera.y}px) scale(${rs.camera.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {groups.map((el) => {
          const box = layout.nodes[el.id];
          if (!box) return null;
          const C = ELEMENT_COMPONENTS[el.kind];
          return (
            <C
              key={el.id}
              box={box}
              props={el.props as Record<string, unknown>}
              rt={rs.elements[el.id]}
              theme={theme}
              frame={frame}
              fps={fps}
            />
          );
        })}

        <svg
          width={layout.stage.width}
          height={layout.stage.height}
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
        >
          {edges.map((e) => {
            const route = layout.edges[e.id];
            const rt = rs.edges[e.id];
            if (!route || !rt) return null;
            return <EdgeShape key={e.id} route={route} rt={rt} theme={theme} />;
          })}
        </svg>

        {nonGroups.map((el) => {
          const box = layout.nodes[el.id];
          if (!box) return null;
          const C = ELEMENT_COMPONENTS[el.kind];
          if (!C) return null;
          return (
            <C
              key={el.id}
              box={box}
              props={el.props as Record<string, unknown>}
              rt={rs.elements[el.id]}
              theme={theme}
              frame={frame}
              fps={fps}
            />
          );
        })}

        {/* packets ride above everything — the single warm focus */}
        {edges.map((e) => {
          const route = layout.edges[e.id];
          const rt = rs.edges[e.id];
          if (!route || !rt) return null;
          return rt.packets.map((pk, i) => (
            <Packet
              key={`${e.id}-${i}`}
              route={route}
              t={pk.t}
              theme={theme}
              labelText={pk.labelText}
              labelOpacity={pk.labelOpacity}
            />
          ));
        })}
      </AbsoluteFill>

      {/* scene title — fixed (not affected by camera), within the safe area */}
      {spec.meta?.title && (
        <div
          style={{
            position: "absolute",
            left: SAFE_MARGIN,
            top: SAFE_MARGIN - 24,
            opacity: titleOpacity,
            transform: `translateY(${(1 - titleOpacity) * 8}px)`,
            fontFamily: theme.fontFamily.sans,
            fontSize: theme.type.title.size,
            fontWeight: theme.type.title.weight,
            lineHeight: theme.type.title.lineHeight,
            letterSpacing: `${theme.type.title.tracking}em`,
            color: theme.color.textPrimary,
          }}
        >
          {spec.meta.title}
        </div>
      )}
    </AbsoluteFill>
  );
};
