import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Seedable content only: `*.provenance.json` and `*.source.json` are inputs. */
export function isContentJsonFile(name: string): boolean {
  return (
    name.endsWith(".json")
    && !name.endsWith(".provenance.json")
    && !name.endsWith(".source.json")
  );
}

export async function jsonFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Cannot read content directory ${directory}.${detail}`);
  }
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return jsonFiles(path);
      if (entry.isFile() && isContentJsonFile(entry.name)) return [path];
      return [];
    }),
  );
  return files.flat().sort();
}

export async function validateJsonDirectory<T>(
  directory: string,
  validate: (value: unknown, label: string) => T,
  entryCount: (value: T) => number,
): Promise<{ files: number; entries: number }> {
  const files = await jsonFiles(directory);
  if (files.length === 0) {
    throw new Error(`No JSON fixtures found in ${directory}.`);
  }
  let entries = 0;
  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    entries += entryCount(validate(parsed, file));
  }
  return { files: files.length, entries };
}
