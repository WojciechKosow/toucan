// label + edge-label elements (§3 type, §6 label.show). Rendered as a pill on
// bg/surface so free-floating tokens read as captions, not nodes.
import React from "react";
import type { ElementVisualProps } from "./NodeBox.js";

export const LabelEl: React.FC<ElementVisualProps> = ({
  box,
  props,
  rt,
  theme,
}) => {
  const o = rt.appear;
  if (o <= 0) return null;
  const text = String(props.text ?? "");
  const c = theme.color;
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        transform: `translate(-50%, -50%) translateY(${(1 - o) * 12}px) scale(${0.96 + 0.04 * o})`,
        opacity: o,
        background: c.bgSurface,
        color: c.textPrimary,
        border: `1px solid ${c.nodeBorder}`,
        borderRadius: theme.shape.pillRadius,
        padding: `${theme.shape.pillPadY}px ${theme.shape.pillPadX}px`,
        fontFamily: theme.fontFamily.sans,
        fontSize: theme.type.edgeLabel.size,
        fontWeight: theme.type.edgeLabel.weight,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};
