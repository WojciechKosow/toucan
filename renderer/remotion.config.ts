// Remotion CLI configuration. Render settings live here so `npm run render` is
// reproducible. Compositions themselves stay deterministic (frame N is a pure
// function of N) — see src/throwaway/MovingBox.tsx and, later, the Scene kit.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(1);
