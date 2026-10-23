/**
 * Build the Daily Mini answer pool: common 3–5 letter English words.
 *
 * Quality tier = frequency-ranked (google-20k, MIT) ∩ real word (ENABLE,
 * public domain), minus obscenities, the shared answer exclusions, and the
 * mini-specific exclusions. Stopwords stay in: ARE, ITS and ONE are the glue
 * of every crossword grid. Output order is frequency order, so the generator
 * prefers common words without a separate ranking file.
 *
 *   pnpm generate:mini-pool -- /path/to/enable1.txt
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const MINI_WORD_LENGTHS = [3, 4, 5] as const;

function modulePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

function lowercaseWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((word) => word.trim())
    .filter((word) => /^[a-z]+$/.test(word));
}

/** One entry per line; a multi-word entry ("white power") stays one entry. */
function normalizedLines(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Whitespace-separated words; `#` starts a comment line. */
function normalizedEntries(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith("#"))
      .flatMap((line) => line.trim().toLowerCase().split(/\s+/))
      .filter(Boolean),
  );
}

export interface MiniPool {
  [length: string]: string[];
}

export function buildMiniPool(
  frequencyText: string,
  dictionaryText: string,
  obscenityText: string,
  exclusionTexts: readonly string[],
  extraText = "",
): MiniPool {
  const legitimate = new Set(lowercaseWords(dictionaryText));
  const obscenities = normalizedLines(obscenityText);
  const excluded = new Set(
    exclusionTexts.flatMap((text) => [...normalizedEntries(text)]),
  );
  const pool: Record<number, string[]> = { 3: [], 4: [], 5: [] };
  const seen = new Set<string>();
  for (const word of lowercaseWords(frequencyText)) {
    const bucket = pool[word.length];
    if (!bucket || seen.has(word)) {
      continue;
    }
    seen.add(word);
    if (!legitimate.has(word) || obscenities.has(word) || excluded.has(word)) {
      continue;
    }
    bucket.push(word.toUpperCase());
  }
  // Authored additions: common words the frequency list lacks. They must be
  // real words (ENABLE) and pass the same filters.
  for (const word of [...normalizedEntries(extraText)]) {
    const bucket = pool[word.length];
    if (!bucket || seen.has(word)) {
      continue;
    }
    seen.add(word);
    if (!/^[a-z]+$/.test(word)) {
      throw new Error(`extra word "${word}" must be lowercase letters`);
    }
    if (!legitimate.has(word)) {
      throw new Error(`extra word "${word}" is not in the dictionary`);
    }
    if (obscenities.has(word) || excluded.has(word)) {
      continue;
    }
    bucket.push(word.toUpperCase());
  }
  return Object.fromEntries(
    MINI_WORD_LENGTHS.map((length) => [String(length), pool[length]!]),
  );
}

async function main(): Promise<void> {
  const dictionaryPath = process.argv[2];
  if (!dictionaryPath) {
    throw new Error("Usage: generate-mini-pool <path to enable1.txt>");
  }
  const [frequency, dictionary, obscenity, exclusions, miniExclusions, extra] =
    await Promise.all([
      readFile(modulePath("../../shared/sources/google-20k-english.txt"), "utf8"),
      readFile(dictionaryPath, "utf8"),
      readFile(modulePath("../../shared/sources/obscenity-en.txt"), "utf8"),
      readFile(modulePath("../../shared/sources/exclusions-en.txt"), "utf8"),
      readFile(modulePath("../../shared/mini/exclusions.txt"), "utf8"),
      readFile(modulePath("../../shared/mini/extra-words.txt"), "utf8"),
    ]);
  const pool = buildMiniPool(
    frequency,
    dictionary,
    obscenity,
    [exclusions, miniExclusions],
    extra,
  );
  const output = modulePath("../../shared/mini/pool.source.json");
  await writeFile(output, `${JSON.stringify(pool, null, 2)}\n`);
  for (const length of MINI_WORD_LENGTHS) {
    console.log(`${length} letters: ${pool[String(length)]!.length} words`);
  }
}

if (process.argv[1]?.endsWith("generate-mini-pool.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
