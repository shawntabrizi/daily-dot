/**
 * Daily Word's answer list, "Daily Word answers v3" (`shared/wordlists/core.json`).
 *
 * An answer is a six-letter word that is common (wordfreq Zipf frequency
 * ≥ `ANSWER_ZIPF_MIN`), spelled as a lowercase US word in SCOWL size 60
 * (which drops proper nouns and British spellings), and not in the LDNOOBW
 * offensive-word list. The survivors are shuffled with the fixed seed
 * `SHUFFLE_SEED` so day order is not frequency order; the same sources and
 * seed always produce the same file.
 *
 * The shuffled order is anchored at `ANCHOR_DAY`: v2 launched that day with
 * the first shuffled word, and every later day keeps its v2 word. The list
 * starts at `startDay` (default 0) so past days have words too; the days
 * before the anchor take the end of the cycle (the contract wraps modulo the
 * list length).
 *
 *   pnpm generate:wordlists [-- --start-day <day index>]
 *
 * Sources (all in `shared/sources/`): `wordfreq-en-six.txt` (exported from
 * wordfreq 3.1.1, CC BY-SA 4.0), `scowl-60-us.txt` (ESDB/SCOWL, MIT-like),
 * `obscenity-en.txt` (LDNOOBW, CC0).
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import {
  validateWordlistFile,
  WORD_LENGTH,
  type WordlistFile,
} from "./content-validation";

export const ANSWER_ZIPF_MIN = 4.0;
/** Fisher–Yates seed (mulberry32). Change it and every day's word changes. */
export const SHUFFLE_SEED = 20261022;
export const ANSWER_LIST_NAME = "Daily Word answers v3";
/** The day v2 went live; the first shuffled word belongs to this day. */
export const ANCHOR_DAY = 294;

function modulePath(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

export interface Candidate {
  word: string;
  zipf: number;
}

export interface GeneratedAnswers {
  /** Day order: index 0 is `startDay`'s word. */
  words: string[];
  zipf: ReadonlyMap<string, number>;
  counts: Readonly<{
    candidates: number;
    belowThreshold: number;
    notInScowl: number;
    obscenity: number;
  }>;
}

/** `word<TAB>zipf` lines; `#` comments and anything else are skipped. */
export function parseCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#")) {
      continue;
    }
    const [word, zipfText] = line.trim().split("\t");
    const zipf = Number(zipfText);
    if (word && /^[a-z]+$/.test(word) && Number.isFinite(zipf)) {
      candidates.push({ word, zipf });
    }
  }
  return candidates;
}

/** The lowercase six-letter entries of a SCOWL list (its header and proper nouns fall out). */
export function sixLetterWords(text: string): Set<string> {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((word) => word.length === WORD_LENGTH && /^[a-z]+$/.test(word)),
  );
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded generator: the same seed gives the same order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed);
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}

export function generateAnswers(
  candidatesText: string,
  scowlText: string,
  obscenityText: string,
  seed = SHUFFLE_SEED,
): GeneratedAnswers {
  const scowl = sixLetterWords(scowlText);
  const obscenities = new Set(
    obscenityText
      .split(/\r?\n/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  const counts = { candidates: 0, belowThreshold: 0, notInScowl: 0, obscenity: 0 };
  const zipf = new Map<string, number>();
  const kept: string[] = [];
  for (const candidate of parseCandidates(candidatesText)) {
    if (candidate.word.length !== WORD_LENGTH || zipf.has(candidate.word)) {
      continue;
    }
    counts.candidates += 1;
    if (candidate.zipf < ANSWER_ZIPF_MIN) {
      counts.belowThreshold += 1;
      continue;
    }
    if (!scowl.has(candidate.word)) {
      counts.notInScowl += 1;
      continue;
    }
    if (obscenities.has(candidate.word)) {
      counts.obscenity += 1;
      continue;
    }
    zipf.set(candidate.word, candidate.zipf);
    kept.push(candidate.word);
  }
  // Shuffle a sorted list so the order depends on the seed and the word set,
  // not on how the source file happened to be ranked.
  kept.sort();
  return { words: seededShuffle(kept, seed), zipf, counts };
}

/**
 * The hand-curated exclusions (names SCOWL lists in lowercase, slurs LDNOOBW
 * misses, slang) join the obscenity list; "#" starts a comment.
 */
export function withExclusions(obscenityText: string, exclusionsText: string): string {
  const excluded = exclusionsText
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
  return [obscenityText, ...excluded].join("\n");
}

/** Day order from `startDay`: index i is the word for day `startDay + i`. */
export function alignToAnchor(words: readonly string[], startDay: number): string[] {
  const count = words.length;
  const offset = (((startDay - ANCHOR_DAY) % count) + count) % count;
  return [...words.slice(offset), ...words.slice(0, offset)];
}

export function buildWordlist(words: readonly string[], startDay: number): WordlistFile {
  const wordlist: WordlistFile = {
    name: ANSWER_LIST_NAME,
    emoji: "🟩",
    startDay,
    words: [...words],
  };
  return validateWordlistFile(wordlist, "generated Word content");
}

interface GeneratorOptions {
  candidatesPath: string;
  scowlPath: string;
  obscenityPath: string;
  exclusionsPath: string;
  wordlistPath: string;
  startDay: number;
}

function options(args: readonly string[]): GeneratorOptions {
  const parsed = parseArgs({
    args,
    options: {
      candidates: { type: "string" },
      scowl: { type: "string" },
      obscenity: { type: "string" },
      exclusions: { type: "string" },
      output: { type: "string" },
      "start-day": { type: "string" },
    },
    strict: true,
  });
  const startDay = Number(parsed.values["start-day"] ?? 0);
  if (!Number.isInteger(startDay) || startDay < 0) {
    throw new Error("--start-day must be a day index (a non-negative integer).");
  }
  return {
    candidatesPath: resolve(
      parsed.values.candidates ?? modulePath("../../shared/sources/wordfreq-en-six.txt"),
    ),
    scowlPath: resolve(
      parsed.values.scowl ?? modulePath("../../shared/sources/scowl-60-us.txt"),
    ),
    obscenityPath: resolve(
      parsed.values.obscenity ?? modulePath("../../shared/sources/obscenity-en.txt"),
    ),
    exclusionsPath: resolve(
      parsed.values.exclusions ?? modulePath("../../shared/wordlists/answer-exclusions.txt"),
    ),
    wordlistPath: resolve(
      parsed.values.output ?? modulePath("../../shared/wordlists/core.json"),
    ),
    startDay,
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const paths = options(args);
  const [candidatesText, scowlText, obscenityText, exclusionsText] = await Promise.all([
    readFile(paths.candidatesPath, "utf8"),
    readFile(paths.scowlPath, "utf8"),
    readFile(paths.obscenityPath, "utf8"),
    readFile(paths.exclusionsPath, "utf8"),
  ]);
  const generated = generateAnswers(
    candidatesText,
    scowlText,
    withExclusions(obscenityText, exclusionsText),
  );
  const wordlist = buildWordlist(alignToAnchor(generated.words, paths.startDay), paths.startDay);
  await writeFile(paths.wordlistPath, `${JSON.stringify(wordlist, null, 2)}\n`);

  const { counts } = generated;
  console.log(
    `${counts.candidates} six-letter candidates; removed ${counts.belowThreshold} `
      + `below Zipf ${ANSWER_ZIPF_MIN}, ${counts.notInScowl} outside SCOWL-60, `
      + `${counts.obscenity} obscene or excluded; kept ${wordlist.words.length}.`,
  );
  console.log(
    `Wrote "${wordlist.name}" (${wordlist.words.length} words, startDay `
      + `${wordlist.startDay}, seed ${SHUFFLE_SEED}) to ${paths.wordlistPath}.`,
  );
}

const moduleUrl = new URL(import.meta.url);
if (
  moduleUrl.protocol === "file:"
  && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(moduleUrl)
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
