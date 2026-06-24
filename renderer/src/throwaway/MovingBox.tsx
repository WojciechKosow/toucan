// Throwaway Section 0 composition: a single box gliding across the stage.
// Its only job is to prove the Remotion toolchain renders a playable MP4.
// Deterministic by construction — position is a pure function of the frame.
// Retired once the real Scene kit lands (Section 3).
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const MovingBox = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();

  const boxSize = 200;
  const x = interpolate(
    frame,
    [0, durationInFrames - 1],
    [0, width - boxSize],
    {
      easing: Easing.inOut(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#10131C" }}>
      <div
        style={{
          position: "absolute",
          top: (height - boxSize) / 2,
          left: 0,
          width: boxSize,
          height: boxSize,
          borderRadius: 16,
          background: "#FFB35C",
          transform: `translateX(${x}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
