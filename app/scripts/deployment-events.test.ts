import { expect, it } from "vitest";

import { instantiatedContractAddress } from "./deployment-events";

it("records only the address emitted by finalized instantiation", () => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";
  expect(
    instantiatedContractAddress([
      {
        type: "Revive",
        value: {
          type: "Instantiated",
          value: { contract: address },
        },
      },
    ]),
  ).toBe(address);
  expect(() =>
    instantiatedContractAddress([
      { type: "System", value: { type: "ExtrinsicSuccess" } },
    ]),
  ).toThrow("refusing a dry-run-predicted address");
});
