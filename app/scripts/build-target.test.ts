import { expect, it } from "vitest";

import { buildTarget } from "./build-target";
import { CONTRACT_NAMES, readTargetRecord } from "./target";
import { NETWORKS } from "../src/networks";

it("loads the Paseo Next v2 record; once deployed it carries five ABIs and four content ids", () => {
  const target = buildTarget({ DAILY_NETWORK: "paseo-next-v2" });

  if (target.deployment.status !== "deployed") {
    expect(target.deployment.status).toBe("pending");
    expect(target.abis).toBeNull();
    return;
  }
  for (const name of CONTRACT_NAMES) {
    expect(target.abis?.[name]).toEqual(expect.any(Array));
  }
  expect(target.abis?.scores).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "function", name: "currentDay" }),
    ]),
  );
  const content = target.deployment.content ?? {};
  for (const id of [content.wordListId, content.chessSetId, content.miniSetId, content.connectionsSetId]) {
    expect(Number.isInteger(id)).toBe(true);
  }
});

it("refuses a build target with no deployment record", () => {
  const unrecorded = { ...NETWORKS["paseo-next-v2"], id: "nowhere" as const };
  expect(() =>
    readTargetRecord(unrecorded as unknown as typeof NETWORKS["paseo-next-v2"]),
  ).toThrow('No deployment record for "nowhere"');
});
