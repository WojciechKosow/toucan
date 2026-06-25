// Edge: routed connector (§4), edge.draw stroke-in (§6), warm progress trail +
// arrival pulse (§6 packet.travel). Packets themselves render in a layer above
// the nodes (see Scene) so they read as the warm focus.
import React from "react";
import type { Theme } from "../../theme.js";
import type { EdgeRoute } from "../../layout/index.js";
import { endAngleDeg, pathD, pointAtT, polylineLength } from "../geometry.js";
import type { EdgeRuntime } from "../runtime.js";

export const EdgeShape: React.FC<{
  route: EdgeRoute;
  rt: EdgeRuntime;
  theme: Theme;
}> = ({ route, rt, theme }) => {
  if (route.points.length < 2 || rt.draw <= 0) return null;
  const c = theme.color;
  const len = polylineLength(route.points);
  const d = pathD(route.points);
  const end = route.points[route.points.length - 1];
  const angle = endAngleDeg(route.points);
  const head = theme.shape.arrowhead;
  const litColor = c.warm;

  return (
    <g>
      {/* idle connector, stroked in over edge.draw */}
      <path
        d={d}
        fill="none"
        stroke={c.connector}
        strokeWidth={theme.shape.connectorWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - rt.draw)}
      />
      {/* warm progress trail behind the packet */}
      {rt.lit > 0 && (
        <path
          d={d}
          fill="none"
          stroke={litColor}
          strokeWidth={theme.shape.connectorWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - rt.lit)}
          opacity={0.9}
        />
      )}
      {/* arrowhead, fades+scales in as the draw completes */}
      <g
        transform={`translate(${end.x} ${end.y}) rotate(${angle}) scale(${0.8 + 0.2 * rt.draw})`}
        opacity={rt.draw}
      >
        <path
          d={`M 0 0 L ${-head} ${-head * 0.5} L ${-head} ${head * 0.5} Z`}
          fill={rt.lit > 0.5 ? litColor : c.connector}
        />
      </g>
      {/* arrival pulse ring at the target end */}
      {rt.arrival > 0 && (
        <circle
          cx={end.x}
          cy={end.y}
          r={theme.shape.packet * (1 + 0.7 * (1 - rt.arrival))}
          fill="none"
          stroke={c.warm}
          strokeWidth={2}
          opacity={rt.arrival}
        />
      )}
    </g>
  );
};

/** A traveling packet (20px warm dot + soft halo) and its optional edge-label pill. */
export const Packet: React.FC<{
  route: EdgeRoute;
  t: number;
  theme: Theme;
  labelText?: string;
  labelOpacity: number;
}> = ({ route, t, theme, labelText, labelOpacity }) => {
  const p = pointAtT(route.points, t);
  const c = theme.color;
  const r = theme.shape.packet;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: p.x - theme.shape.packetHalo / 2,
          top: p.y - theme.shape.packetHalo / 2,
          width: theme.shape.packetHalo,
          height: theme.shape.packetHalo,
          borderRadius: theme.shape.packetHalo,
          background: `radial-gradient(circle, ${c.warmSoft} 0%, rgba(0,0,0,0) 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: p.x - r / 2,
          top: p.y - r / 2,
          width: r,
          height: r,
          borderRadius: r,
          background: c.warm,
          boxShadow: `0 0 12px ${c.warmSoft}`,
        }}
      />
      {labelText && labelOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            left: p.x,
            top: p.y - r - 14,
            transform: "translate(-50%, -100%)",
            opacity: labelOpacity,
            background: c.bgSurface,
            color: c.textPrimary,
            borderRadius: theme.shape.pillRadius,
            padding: `${theme.shape.pillPadY}px ${theme.shape.pillPadX}px`,
            fontFamily: theme.fontFamily.sans,
            fontSize: theme.type.edgeLabel.size,
            fontWeight: theme.type.edgeLabel.weight,
            whiteSpace: "nowrap",
          }}
        >
          {labelText}
        </div>
      )}
    </>
  );
};
