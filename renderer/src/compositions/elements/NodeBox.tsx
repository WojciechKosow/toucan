// node + browser elements (§4 shape, §6 node.state / highlight, §6 appear).
import React from "react";
import type { Theme } from "../../theme.js";
import { loopPhase, msToFrames } from "../../timing.js";
import type { NodeBox as Box } from "../../layout/index.js";
import type { ElementRuntime } from "../runtime.js";
import { Icon } from "./icons.js";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export interface ElementVisualProps {
  box: Box;
  props: Record<string, unknown>;
  rt: ElementRuntime;
  theme: Theme;
  frame: number;
  fps: number;
}

export const NodeBox: React.FC<ElementVisualProps> = ({
  box,
  props,
  rt,
  theme,
  frame,
  fps,
}) => {
  const c = theme.color;
  const isBrowser = box.kind === "browser";
  const label = String(props.label ?? (isBrowser ? "Browser" : ""));
  const sublabel =
    typeof props.sublabel === "string" ? props.sublabel : undefined;
  const icon = typeof props.icon === "string" ? props.icon : undefined;

  // entrance (§6 appear): opacity, translateY +12→0, scale 0.96→1
  const o = rt.appear;
  if (o <= 0) return null;
  const enterY = (1 - o) * 12;
  const enterScale = 0.96 + 0.04 * o;

  // state → border + ring
  const stateColor: Record<string, string> = {
    idle: c.nodeBorder,
    active: c.warm,
    processing: c.warm,
    success: c.doneTeal,
    error: c.errorCoral,
  };
  const borderColor = stateColor[rt.state] ?? c.nodeBorder;
  const borderWidth =
    rt.state === "idle" ? theme.shape.borderIdle : theme.shape.borderActive;

  // one-shot active "pop" 1→1.03→1 over fast (§6 active)
  const sinceState = frame - rt.stateSinceFrame;
  const popT = clamp(sinceState / msToFrames(theme.motion.ms.fast, fps), 0, 1);
  const pop = rt.state === "active" ? 1 + 0.03 * Math.sin(Math.PI * popT) : 1;

  // error shake (§6 error): translateX ±6, ~3 oscillations over base, then settle
  const shakeT = clamp(
    sinceState / msToFrames(theme.motion.ms.base, fps),
    0,
    1,
  );
  const shakeX =
    rt.state === "error"
      ? Math.sin(shakeT * Math.PI * 6) * 6 * (1 - shakeT)
      : 0;

  const ringShadow =
    rt.state === "active" || rt.state === "processing"
      ? `0 0 0 6px ${c.warmSoft}, 0 8px 30px ${c.warmSoft}`
      : rt.state === "success"
        ? `0 0 0 6px ${c.doneTealSoft}`
        : `0 10px 30px rgba(0,0,0,0.25)`;

  return (
    <div
      style={{
        position: "absolute",
        left: box.x - box.width / 2,
        top: box.y - box.height / 2,
        width: box.width,
        height: box.height,
        opacity: o,
        transform: `translate(${shakeX}px, ${enterY}px) scale(${enterScale * pop})`,
        transformOrigin: "center",
      }}
    >
      {/* highlight focus ring (§6 highlight) — cool, offset outside the box */}
      {rt.highlight > 0 && (
        <FocusRing
          box={box}
          theme={theme}
          frame={frame}
          fps={fps}
          amt={rt.highlight}
        />
      )}
      {/* processing loop ring (§6 processing) — the one allowed linear loop */}
      {rt.state === "processing" && (
        <ProcessingRing theme={theme} frame={frame} fps={fps} />
      )}

      <div
        style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          borderRadius: theme.shape.nodeRadius,
          border: `${borderWidth}px solid ${borderColor}`,
          background: `linear-gradient(180deg, ${c.nodeFillTop} 0%, ${c.nodeFillBottom} 100%)`,
          boxShadow: ringShadow,
          padding: theme.shape.nodePadding,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 4,
        }}
      >
        {isBrowser && (
          <BrowserBar
            theme={theme}
            url={typeof props.url === "string" ? props.url : undefined}
          />
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {icon && (
            <Icon name={icon} size={theme.shape.nodeIcon} color={c.textMuted} />
          )}
          <span
            style={{
              fontFamily: theme.fontFamily.sans,
              fontSize: theme.type.nodeLabel.size,
              fontWeight: theme.type.nodeLabel.weight,
              lineHeight: theme.type.nodeLabel.lineHeight,
              color: c.textPrimary,
            }}
          >
            {label}
          </span>
        </div>
        {sublabel && (
          <span
            style={{
              fontFamily: theme.fontFamily.sans,
              fontSize: theme.type.nodeSublabel.size,
              fontWeight: theme.type.nodeSublabel.weight,
              color: c.textMuted,
            }}
          >
            {sublabel}
          </span>
        )}
      </div>

      {(rt.state === "success" || rt.state === "error") && (
        <Badge
          theme={theme}
          ok={rt.state === "success"}
          fps={fps}
          sinceState={sinceState}
        />
      )}
    </div>
  );
};

const FocusRing: React.FC<{
  box: Box;
  theme: Theme;
  frame: number;
  fps: number;
  amt: number;
}> = ({ box, theme, frame, fps, amt }) => {
  const off = theme.shape.focusRingOffset;
  const phase = loopPhase(frame, theme.motion.highlightPulsePeriodMs, fps);
  const pulse = 1.06 + 0.04 * Math.sin(phase * Math.PI * 2);
  const opacity =
    amt * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2)));
  return (
    <div
      style={{
        position: "absolute",
        left: -off,
        top: -off,
        width: box.width + off * 2,
        height: box.height + off * 2,
        borderRadius: theme.shape.nodeRadius + off,
        border: `${theme.shape.focusRingWidth}px solid ${theme.color.focusCool}`,
        opacity,
        transform: `scale(${pulse})`,
        transformOrigin: "center",
      }}
    />
  );
};

const ProcessingRing: React.FC<{
  theme: Theme;
  frame: number;
  fps: number;
}> = ({ theme, frame, fps }) => {
  const phase = loopPhase(frame, theme.motion.processingPeriodMs, fps);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: theme.shape.nodeRadius,
        border: `2px solid ${theme.color.warm}`,
        opacity: 0.6 * (1 - phase),
        transform: `scale(${1 + 0.15 * phase})`,
        transformOrigin: "center",
      }}
    />
  );
};

const Badge: React.FC<{
  theme: Theme;
  ok: boolean;
  fps: number;
  sinceState: number;
}> = ({ theme, ok, fps, sinceState }) => {
  const t = clamp(sinceState / msToFrames(theme.motion.ms.base, fps), 0, 1);
  const scale = 0.6 + 0.4 * t * (t < 0.6 ? 1.1 : 1);
  const size = theme.shape.badge;
  return (
    <div
      style={{
        position: "absolute",
        right: -size / 3,
        top: -size / 3,
        width: size,
        height: size,
        borderRadius: size,
        background: ok ? theme.color.doneTeal : theme.color.errorCoral,
        color: theme.color.textOnAccent,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.fontFamily.sans,
        fontSize: size * 0.6,
        fontWeight: 700,
        transform: `scale(${scale})`,
        opacity: t,
      }}
    >
      {ok ? "✓" : "✕"}
    </div>
  );
};

const BrowserBar: React.FC<{ theme: Theme; url?: string }> = ({
  theme,
  url,
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
      opacity: 0.9,
    }}
  >
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          width: 10,
          height: 10,
          borderRadius: 10,
          background: theme.color.nodeBorder,
        }}
      />
    ))}
    {url && (
      <span
        style={{
          marginLeft: 8,
          fontFamily: theme.fontFamily.mono,
          fontSize: 14,
          color: theme.color.textMuted,
        }}
      >
        {url}
      </span>
    )}
  </div>
);
