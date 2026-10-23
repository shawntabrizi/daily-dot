import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { jsonFiles } from "./validation-files";

it("excludes sibling provenance JSON from deployable content", async () => {
  const directory = await mkdtemp(join(tmpdir(), "daily-content-"));
  try {
    const content = join(directory, "core.json");
    await Promise.all([
      writeFile(content, "{}"),
      writeFile(join(directory, "core.provenance.json"), "{}"),
    ]);

    expect(await jsonFiles(directory)).toEqual([content]);
  } finally {
    await rm(directory, { recursive: true });
  }
});
