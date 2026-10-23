import { fileURLToPath } from "node:url";

import { validateChessFile } from "./content-validation";
import { validateJsonDirectory } from "./validation-files";

const defaultDirectory = fileURLToPath(
  new URL("../../shared/chess", import.meta.url),
);

async function main(): Promise<void> {
  const directory = process.argv[2] ?? defaultDirectory;
  const result = await validateJsonDirectory(
    directory,
    validateChessFile,
    (chess) => chess.puzzles.length,
  );
  console.log(
    `Validated ${result.entries} chess puzzle(s) in ${result.files} file(s).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
