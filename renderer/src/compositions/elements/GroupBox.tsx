// group element (§4): a soft boundary around its members, drawn behind nodes.
import React from "react";
import type { ElementVisualProps } from "./NodeBox.js";

export const GroupBox: React.FC<ElementVisualProps> = ({
  box,
  props,
  rt,
  theme,
}) => {
  const o = rt.appear;
  if (o <= 0) return null;
  const c = theme.color;
  const label = typeof props.label === "string" ? props.label : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x - box.width / 2,
        top: box.y - box.height / 2,
        width: box.width,
        height: box.height,
        opacity: o * 0.9,
        borderRadius: theme.shape.nodeRadius + 8,
        border: `1.5px dashed ${c.nodeBorder}`,
        background: c.bgSurface,
        boxSizing: "border-box",
      }}
    >
      {label && (
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 16,
            fontFamily: theme.fontFamily.sans,
            fontSize: theme.type.nodeSublabel.size,
            fontWeight: 600,
            color: c.textMuted,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
};
