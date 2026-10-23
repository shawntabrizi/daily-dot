import { fileURLToPath } from "node:url";

import { validateConnectionsFile } from "./content-validation";
import { validateJsonDirectory } from "./validation-files";

const defaultDirectory = fileURLToPath(
  new URL("../../shared/connections", import.meta.url),
);

async function main(): Promise<void> {
  const directory = process.argv[2] ?? defaultDirectory;
  const result = await validateJsonDirectory(
    directory,
    validateConnectionsFile,
    (file) => file.puzzles.length,
  );
  console.log(
    `Validated ${result.entries} Connections puzzle(s) in ${result.files} file(s).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
