import { configDefaults, defineConfig } from "vitest/config";

import { buildTarget } from "./scripts/build-target";
import { selectedDataSource } from "./scripts/source-selection";

export default defineConfig(({ mode }) => {
  const target = buildTarget();
  const deployment = target.deployment;
  const source = selectedDataSource(process.env, mode);

  return {
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      exclude: [...configDefaults.exclude],
    },
    define: {
      __DAILY_NETWORK__: JSON.stringify(target.network.id),
      __DAILY_DEPLOYMENT__: JSON.stringify(deployment),
      __DAILY_ABIS__: JSON.stringify(target.abis),
      __DAILY_SOURCE__: JSON.stringify(source),
    },
  };
});
