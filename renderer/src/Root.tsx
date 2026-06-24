// Composition registry. Section 0 ships a single throwaway composition to prove
// the toolchain renders an MP4. The real Scene kit (node/edge/label/group + verb
// animators) is registered here from Section 3 onward.
import { Composition } from "remotion";
import { MovingBox } from "./throwaway/MovingBox.js";

export const RemotionRoot = () => {
  return (
    <Composition
      id="MovingBox"
      component={MovingBox}
      durationInFrames={90}
      fps={30}
      width={1280}
      height={720}
    />
  );
};
