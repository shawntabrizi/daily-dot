import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";

import type { Abi } from "viem";

import type { NetworkTarget } from "../src/networks";
import {
  deploymentAbiPath,
  readDeploymentRecord,
  type ContractName,
} from "./target";
import { isContentJsonFile } from "./validation-files";

export interface SeedInput<T> {
  file: string;
  path: string;
  content: T;
}

interface ResumeEntry {
  creationNonce: string;
  entityId: number;
  nextIndex: number;
  sealed: boolean;
}

interface ResumeData {
  version: 1;
  network: string;
  contract: string;
  files: Record<string, ResumeEntry>;
}

export class ResumeCursor {
  readonly #path: string;
  readonly #data: ResumeData;

  private constructor(path: string, data: ResumeData) {
    this.#path = path;
    this.#data = data;
  }

  static async load(
    path: string,
    network: NetworkTarget,
    contract: string,
  ): Promise<ResumeCursor> {
    try {
      const existing = JSON.parse(
        await readFile(path, "utf8"),
      ) as ResumeData;
      if (
        existing.version === 1 &&
        existing.network === network.id &&
        existing.contract === contract &&
        existing.files !== null &&
        typeof existing.files === "object"
      ) {
        return new ResumeCursor(path, existing);
      }
      console.log(
        `Ignoring stale resume cursor ${path}; target deployment changed.`,
      );
    } catch (error) {
      const code =
        error !== null && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code !== "ENOENT") throw error;
    }
    return new ResumeCursor(path, {
      version: 1,
      network: network.id,
      contract,
      files: {},
    });
  }

  get(file: string): ResumeEntry | undefined {
    return this.#data.files[file];
  }

  async update(file: string, entry: ResumeEntry): Promise<void> {
    this.#data.files[file] = entry;
    const temporary = `${this.#path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporary,
        `${JSON.stringify(this.#data, null, 2)}\n`,
        { flag: "wx" },
      );
      await rename(temporary, this.#path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

export async function loadSeedInputs<T>(
  directory: string,
  label: string,
  validate: (value: unknown, file: string) => T,
): Promise<SeedInput<T>[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code =
      error !== null && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code === "ENOENT") {
      throw new Error(
        `No ${label} content directory at ${directory}. `
          + "WP5b has not populated it yet.",
      );
    }
    throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && isContentJsonFile(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) {
    throw new Error(
      `No ${label} content files found in ${directory}. `
        + "Only validator fixtures exist; WP5b content is not present yet.",
    );
  }
  return Promise.all(
    files.map(async (file) => {
      const path = join(directory, file);
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      return {
        file,
        path,
        content: validate(parsed, path),
      };
    }),
  );
}

export function creationNonce(kind: ContractName, file: string): bigint {
  return createHash("sha256")
    .update(`daily-on-dot-${kind}-content-v1\0`)
    .update(file)
    .digest()
    .readBigUInt64BE(0);
}

/** The finalized contract count is the only safe resume position. */
export function entriesAfterCursor<T>(
  entries: readonly T[],
  onChainCount: number,
  label: string,
): readonly T[] {
  if (
    !Number.isInteger(onChainCount) ||
    onChainCount < 0 ||
    onChainCount > entries.length
  ) {
    throw new Error(
      `${label} has on-chain count ${onChainCount}, outside content length ${entries.length}.`,
    );
  }
  return entries.slice(onChainCount);
}

export async function loadContractTarget(
  network: NetworkTarget,
  name: ContractName,
): Promise<{ abi: Abi; address: `0x${string}` }> {
  const deployment = readDeploymentRecord(network);
  const metadata = deployment.abis[name];
  const address = deployment.contracts[name];
  if (metadata === undefined || address === undefined) {
    throw new Error(
      `${name} is not deployed on ${network.id}; run `
        + `pnpm deploy:contracts -- --only ${name} first.`,
    );
  }
  const path = deploymentAbiPath(metadata.file);
  if (basename(metadata.file) !== metadata.file) {
    throw new Error(`Unsafe ABI path in deployment record: ${metadata.file}`);
  }
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const actualHash = createHash("sha256")
    .update(JSON.stringify(parsed))
    .digest("hex");
  if (actualHash !== metadata.sha256) {
    throw new Error(
      `${name} ABI at ${path} does not match the deployment record.`,
    );
  }
  const abi = parsed as Abi;
  return {
    abi,
    address,
  };
}

export function assertAbiFunctions(
  abi: Abi,
  names: readonly string[],
  label: string,
): void {
  for (const name of names) {
    if (
      !abi.some(
        (entry) => entry.type === "function" && entry.name === name,
      )
    ) {
      throw new Error(
        `${label} ABI does not expose ${name}; build and deploy WP4 first.`,
      );
    }
  }
}
