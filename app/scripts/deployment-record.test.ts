import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { NETWORKS } from "../src/networks";
import { recordDeploymentContentId } from "./deployment-record";
import type { ActiveDeploymentRecord } from "./target";

function deployment(): ActiveDeploymentRecord {
  return {
    network: "paseo-next-v2",
    chain: "paseo-asset-hub",
    status: "deployed",
    contracts: {
      scores: "0x1111111111111111111111111111111111111111",
      word: "0x2222222222222222222222222222222222222222",
      chess: "0x3333333333333333333333333333333333333333",
      mini: "0x4444444444444444444444444444444444444444",
      connections: "0x5555555555555555555555555555555555555555",
    },
    abis: {
      scores: {
        file: "paseo-next-v2-scores.abi.json",
        sha256: "1".repeat(64),
      },
      word: {
        file: "paseo-next-v2-word.abi.json",
        sha256: "2".repeat(64),
      },
      chess: {
        file: "paseo-next-v2-chess.abi.json",
        sha256: "3".repeat(64),
      },
      mini: {
        file: "paseo-next-v2-mini.abi.json",
        sha256: "4".repeat(64),
      },
      connections: {
        file: "paseo-next-v2-connections.abi.json",
        sha256: "5".repeat(64),
      },
    },
    deployedAt: "2026-07-28T20:15:44.373Z",
  };
}

it("merges each sealed content id without disturbing deployment metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-deployment-"));
  const path = join(directory, "paseo-next-v2.json");
  const original = deployment();
  try {
    await writeFile(path, `${JSON.stringify(original, null, 2)}\n`);

    expect(
      await recordDeploymentContentId(
        NETWORKS["paseo-next-v2"],
        "wordListId",
        7,
        path,
      ),
    ).toBe("updated");
    expect(
      await recordDeploymentContentId(
        NETWORKS["paseo-next-v2"],
        "chessSetId",
        11,
        path,
      ),
    ).toBe("updated");

    const updated = JSON.parse(
      await readFile(path, "utf8"),
    ) as ActiveDeploymentRecord;
    expect(updated.content).toEqual({
      wordListId: 7,
      chessSetId: 11,
    });
    expect(updated.contracts).toEqual(original.contracts);
    expect(updated.abis).toEqual(original.abis);
    expect(updated.deployedAt).toBe(original.deployedAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("does not rewrite a deployment record when sealed content is recorded again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-deployment-"));
  const path = join(directory, "paseo-next-v2.json");
  const original: ActiveDeploymentRecord = {
    ...deployment(),
    content: {
      wordListId: 0,
      chessSetId: 0,
    },
  };
  try {
    const raw = `${JSON.stringify(original, null, 2)}\n`;
    await writeFile(path, raw);
    const before = await stat(path);

    expect(
      await recordDeploymentContentId(
        NETWORKS["paseo-next-v2"],
        "wordListId",
        0,
        path,
      ),
    ).toBe("unchanged");

    expect(await readFile(path, "utf8")).toBe(raw);
    expect((await stat(path)).ino).toBe(before.ino);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
