// Composition registry. Section 0 ships a throwaway box; Section 3 adds the real
// Scene that renders a SceneSpec to the visual-style spec. Kind/verb dispatch and
// layout live inside Scene; here we just register it and compute its duration
// from the timeline schedule.
import { Composition } from "remotion";
import type { SceneSpec } from "@toucan/spec";
import { MovingBox } from "./throwaway/MovingBox.js";
import { Scene, type SceneProps } from "./compositions/Scene.js";
import { layoutScene } from "./layout/index.js";
import {
  buildSchedule,
  sceneDurationInFrames,
} from "./compositions/schedule.js";
import heroAuthFlow from "../../fixtures/01-auth-flow.json";

const SCENE_FPS = 30;
const heroSpec = heroAuthFlow as unknown as SceneSpec;

export const RemotionRoot = () => {
  return (
    <>
      <Composition
        id="MovingBox"
        component={MovingBox}
        durationInFrames={90}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="Scene"
        component={Scene}
        durationInFrames={300}
        fps={SCENE_FPS}
        width={1920}
        height={1080}
        defaultProps={{ spec: heroSpec, themeParams: {} } satisfies SceneProps}
        calculateMetadata={({ props }) => {
          const layout = layoutScene(props.spec);
          const schedule = buildSchedule(props.spec, layout, SCENE_FPS);
          return {
            durationInFrames: sceneDurationInFrames(schedule.durationInFrames),
            fps: SCENE_FPS,
            width: 1920,
            height: 1080,
          };
        }}
      />
    </>
  );
};
