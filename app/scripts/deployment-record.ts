import { readFile } from "node:fs/promises";

import type { NetworkTarget } from "../src/networks";
import { atomicWrite } from "./atomic-write";
import {
  deploymentRecordPath,
  parseTargetRecord,
  type ActiveDeploymentRecord,
} from "./target";

export type ContentIdName =
  keyof NonNullable<ActiveDeploymentRecord["content"]>;

export async function recordDeploymentContentId(
  network: NetworkTarget,
  name: ContentIdName,
  id: number,
  path = deploymentRecordPath(network),
): Promise<"updated" | "unchanged"> {
  if (
    !Number.isInteger(id)
    || id < 0
    || id > 0xffff_ffff
  ) {
    throw new Error(`Cannot record invalid ${name} ${id}.`);
  }

  const raw = await readFile(path, "utf8");
  const current = parseTargetRecord(network, path, raw);
  if (current.status !== "deployed") {
    throw new Error(
      `${path} is still pending; content requires deployed contracts.`,
    );
  }
  if (current.content?.[name] === id) {
    return "unchanged";
  }

  const updated: ActiveDeploymentRecord = {
    ...current,
    content: {
      ...current.content,
      [name]: id,
    },
  };
  await atomicWrite(path, `${JSON.stringify(updated, null, 2)}\n`);
  return "updated";
}
