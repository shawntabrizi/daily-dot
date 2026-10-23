import { expect, it } from "vitest";

import {
  DEFAULT_NETWORK_ID,
  resolveNetwork,
} from "../src/networks";

it("defaults to Paseo Next v2 and refuses an unknown DAILY_NETWORK", () => {
  expect(resolveNetwork(undefined).id).toBe(DEFAULT_NETWORK_ID);
  expect(() => resolveNetwork("wrong-chain")).toThrow(
    'Unknown network "wrong-chain"',
  );
});
