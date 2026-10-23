import { randomUUID } from "node:crypto";
import {
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

export async function atomicWrite(
  destination: string,
  contents: Uint8Array | string,
): Promise<void> {
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
