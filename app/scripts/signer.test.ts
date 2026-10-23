import { expect, it } from "vitest";

import { NETWORKS, type NetworkTarget } from "../src/networks";
import { signingIdentity } from "./signer";

it("uses Alice on testnets but refuses dev accounts on mainnet", () => {
  expect(signingIdentity(NETWORKS["paseo-next-v2"], {}).description).toBe(
    "dev account Alice",
  );
  const mainnet: NetworkTarget = {
    ...NETWORKS["paseo-next-v2"],
    label: "Mainnet safety test",
    kind: "mainnet",
  };
  expect(() => signingIdentity(mainnet, {})).toThrow(
    "dev accounts are refused",
  );
});
