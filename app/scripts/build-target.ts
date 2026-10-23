import { readFileSync } from "node:fs";

import type { ProcessEnv } from "./target";
import {
  deploymentAbiPath,
  readTargetRecord,
  targetNetwork,
} from "./target";

/** Vite calls this before bundling any source or deployment data. */
export function buildTarget(env: ProcessEnv = process.env) {
  const network = targetNetwork(env);
  const deployment = readTargetRecord(network);
  const abis =
    deployment.status === "deployed"
      ? Object.fromEntries(
          Object.entries(deployment.abis).map(([name, metadata]) => {
            const parsed = JSON.parse(
              readFileSync(deploymentAbiPath(metadata.file), "utf8"),
            ) as unknown;
            if (!Array.isArray(parsed)) {
              throw new Error(`${metadata.file} must contain a contract ABI array.`);
            }
            return [name, parsed];
          }),
        )
      : null;
  return {
    network,
    deployment,
    abis,
  };
}
