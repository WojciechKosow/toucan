// Remotion CLI configuration. Render settings live here so `npm run render` is
// reproducible. Compositions themselves stay deterministic (frame N is a pure
// function of N) — see src/throwaway/MovingBox.tsx and, later, the Scene kit.
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setConcurrency(1);

// Intra-package imports use NodeNext-style ".js" specifiers (so tsc + Node ESM
// agree); teach webpack to resolve them back to the ".ts"/".tsx" sources, and to
// compile the workspace @toucan/spec package (exported as raw TypeScript).
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ...(config.resolve?.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    },
  },
}));
