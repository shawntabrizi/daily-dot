// The host reads worker JS as Latin-1, so the bundle must be ASCII. Run after
// the Vite build (`pnpm pocket:build` chains it).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "pocket/dist/worker.js");
const bytes = readFileSync(path);
const bad = bytes.findIndex((byte) => byte > 0x7f);
if (bad !== -1) {
  throw new Error(`pocket/dist/worker.js is not ASCII: byte 0x${bytes[bad].toString(16)} at offset ${bad}`);
}
process.stdout.write(`pocket/dist/worker.js: ${bytes.length} bytes, ASCII\n`);
