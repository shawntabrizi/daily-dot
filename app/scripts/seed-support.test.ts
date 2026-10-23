import { expect, it } from "vitest";

import {
  creationNonce,
  entriesAfterCursor,
} from "./seed-support";

it("resumes after finalized entries and keeps creation nonces stable", () => {
  expect(entriesAfterCursor(["finalized", "next", "last"], 1, "sample"))
    .toEqual(["next", "last"]);
  expect(() =>
    entriesAfterCursor(["only"], 2, "sample"),
  ).toThrow("outside content length");

  expect(creationNonce("word", "sample.json")).toBe(
    creationNonce("word", "sample.json"),
  );
  expect(creationNonce("word", "sample.json")).not.toBe(
    creationNonce("chess", "sample.json"),
  );
});
