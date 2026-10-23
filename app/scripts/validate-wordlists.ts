import { fileURLToPath } from "node:url";

import { validateWordlistFile } from "./content-validation";
import { validateJsonDirectory } from "./validation-files";

const defaultDirectory = fileURLToPath(
  new URL("../../shared/wordlists", import.meta.url),
);

async function main(): Promise<void> {
  const directory = process.argv[2] ?? defaultDirectory;
  const result = await validateJsonDirectory(
    directory,
    validateWordlistFile,
    (wordlist) => wordlist.words.length,
  );
  console.log(
    `Validated ${result.entries} Word answer(s) in ${result.files} file(s).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
