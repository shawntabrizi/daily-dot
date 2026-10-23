import type { ProcessEnv } from "./target";

export type AppDataSource = "stub" | "chain";

/**
 * Production and ordinary dev builds are chain-first. Vitest is stub-only,
 * while DAILY_SOURCE remains an explicit local override.
 */
export function selectedDataSource(
  env: ProcessEnv,
  mode: string,
): AppDataSource {
  const selected = env.DAILY_SOURCE;
  if (selected === undefined || selected === "") {
    return mode === "test" ? "stub" : "chain";
  }
  if (selected !== "stub" && selected !== "chain") {
    throw new Error('DAILY_SOURCE must be either "stub" or "chain".');
  }
  return selected;
}
