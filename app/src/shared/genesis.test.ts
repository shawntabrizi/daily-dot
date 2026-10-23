import { describe, expect, it } from "vitest";

import { NETWORKS } from "../networks";
import {
  assertExpectedGenesis,
  GenesisMismatchError,
} from "./genesis";
import { assetHubDescriptor } from "./chain-descriptor";

describe("genesis assertion", () => {
  it("accepts the build target genesis hash case-insensitively", async () => {
    const target = NETWORKS["paseo-next-v2"];
    await expect(
      assertExpectedGenesis({
        getChainSpecData: async () => ({
          name: "Asset Hub Next",
          genesisHash: target.genesisHash.toUpperCase(),
        }),
      }, target),
    ).resolves.toEqual({
      name: "Asset Hub Next",
      genesisHash: target.genesisHash.toUpperCase(),
    });
    expect(assetHubDescriptor(target).genesis).toBe(target.genesisHash);
  });

  it("refuses boot with the user-facing Quizzler-shaped mismatch", async () => {
    const deliberatelyWrongTarget = {
      ...NETWORKS["paseo-next-v2"],
      genesisHash:
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const,
    };

    let mismatch: unknown;
    try {
      await assertExpectedGenesis({
        getChainSpecData: async () => ({
          name: "Some Other Chain",
          genesisHash: NETWORKS["paseo-next-v2"].genesisHash,
        }),
      }, deliberatelyWrongTarget);
    } catch (error) {
      mismatch = error;
    }

    expect(mismatch).toBeInstanceOf(GenesisMismatchError);
    expect((mismatch as GenesisMismatchError).headline).toBe(
      "This version of Daily on Dot is for a different network.",
    );
    expect((mismatch as Error).message).toContain(
      "built for Paseo Next v2 (Asset Hub Next) (genesis 0xaaaaaaaa…)",
    );
    expect((mismatch as Error).message).toContain(
      "connected to Some Other Chain (genesis 0x4349b00e…)",
    );
  });
});
