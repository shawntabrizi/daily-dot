import { describe, expect, it, vi } from "vitest";
import type { PolkadotClient } from "polkadot-api";

import { NETWORKS } from "../networks";
import { GenesisMismatchError } from "./genesis";
import {
  connectReadChain,
  type ReadChainDependencies,
} from "./read-chain-client";

function connection() {
  return {
    client: {} as PolkadotClient,
    destroy: vi.fn(),
  };
}

describe("read chain connection", () => {
  it("keeps host-owned connectivity as the preferred read path", async () => {
    const host = connection();
    const direct = connection();
    const dependencies: ReadChainDependencies = {
      createHost: vi.fn(async () => host),
      createDirect: vi.fn(async () => direct),
      assertGenesis: vi.fn(async () => undefined),
    };

    const connected = await connectReadChain(NETWORKS["paseo-next-v2"], dependencies);

    expect(connected.client).toBe(host.client);
    expect(connected.transport).toBe("host");
    expect(dependencies.createDirect).not.toHaveBeenCalled();
  });

  it("passes configured direct endpoints in order when the host is absent", async () => {
    const direct = connection();
    const dependencies: ReadChainDependencies = {
      createHost: vi.fn(async () => {
        throw new Error("Host provider unavailable");
      }),
      createDirect: vi.fn(async () => direct),
      assertGenesis: vi.fn(async () => undefined),
    };

    const connected = await connectReadChain(NETWORKS["paseo-next-v2"], dependencies);

    expect(connected.client).toBe(direct.client);
    expect(connected.transport).toBe("direct");
    expect(dependencies.createDirect).toHaveBeenCalledWith(
      NETWORKS["paseo-next-v2"].assetHubRpc,
    );
  });

  it("refuses a direct connection whose genesis does not match", async () => {
    const direct = connection();
    const mismatch = new GenesisMismatchError(NETWORKS["paseo-next-v2"], {
      name: "Wrong Asset Hub",
      genesisHash: "0xwrong",
    });
    const dependencies: ReadChainDependencies = {
      createHost: vi.fn(async () => {
        throw new Error("Host provider unavailable");
      }),
      createDirect: vi.fn(async () => direct),
      assertGenesis: vi.fn(async () => {
        throw mismatch;
      }),
    };

    await expect(
      connectReadChain(NETWORKS["paseo-next-v2"], dependencies),
    ).rejects.toBe(mismatch);
    expect(direct.destroy).toHaveBeenCalledOnce();
  });
});
