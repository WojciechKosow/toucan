// Element kind → component. Dispatch goes through this map, never an inline
// switch on kind (build-plan rule). Extending the kit = adding an entry here.
import type React from "react";
import { GroupBox } from "./GroupBox.js";
import { LabelEl } from "./LabelEl.js";
import { NodeBox, type ElementVisualProps } from "./NodeBox.js";

export const ELEMENT_COMPONENTS: Record<
  string,
  React.FC<ElementVisualProps>
> = {
  node: NodeBox,
  browser: NodeBox,
  label: LabelEl,
  "edge-label": LabelEl,
  group: GroupBox,
};
