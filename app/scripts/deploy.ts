/**
 * Deploy DailyScores, WordRegistry, ChessRegistry, MiniRegistry and
 * ConnectionsRegistry to the selected Asset Hub. No address or ABI is
 * activated until every deployment finalizes. `--only mini` (comma-separated
 * names) deploys just those contracts and merges them into the existing
 * finalized record, so one registry can be redeployed without the others.
 *
 * Build first (with the pinned cargo-pvm-contract, see PROGRESS.md):
 *   (cd ../contracts/scores && cargo pvm-contract build)
 *   (cd ../contracts/word && cargo pvm-contract build)
 *   (cd ../contracts/chess && cargo pvm-contract build)
 *   (cd ../contracts/mini && cargo pvm-contract build)
 *   (cd ../contracts/connections && cargo pvm-contract build)
 */

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ss58ToH160 } from "@parity/product-sdk-address";
import { loadPvmContractArtifacts } from "@parity/product-sdk-contracts/pvm";
import { paseo_asset_hub } from "@parity/product-sdk-descriptors/paseo-asset-hub";
import { ensureAccountMapped } from "@parity/product-sdk-tx";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

import { atomicWrite } from "./atomic-write";
import { instantiatedContractAddress } from "./deployment-events";
import { signingIdentity, type Signer } from "./signer";
import {
  assetHubRpc,
  CONTRACT_NAMES,
  deploymentAbiPath,
  deploymentRecordPath,
  describeTarget,
  readDeploymentRecord,
  targetNetwork,
  type ActiveDeploymentRecord,
  type ContractName,
} from "./target";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const contractsDirectory = join(scriptsDirectory, "..", "..", "contracts");
const network = targetNetwork();
const rpc = assetHubRpc(network);

/** `--only a,b`: deploy a subset into the existing record. */
export function parseOnly(argv: readonly string[]): ContractName[] | null {
  const known: readonly ContractName[] = CONTRACT_NAMES;
  let raw: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--only") {
      raw = argv[index + 1];
    } else if (arg.startsWith("--only=")) {
      raw = arg.slice("--only=".length);
    }
  }
  if (raw === undefined) {
    return null;
  }
  const names = raw.split(",").map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    throw new Error("--only needs at least one contract name.");
  }
  for (const name of names) {
    if (!known.includes(name as ContractName)) {
      throw new Error(`Unknown contract "${name}"; expected one of ${known.join(", ")}.`);
    }
  }
  return [...new Set(names)] as ContractName[];
}
const only = parseOnly(process.argv.slice(2));

interface ContractBuild {
  name: ContractName;
  label: string;
  base: string;
  abi: Uint8Array;
  abiSha256: string;
  bytecode: Uint8Array;
  bytecodeSha256: string;
}

const buildSpecs: ReadonlyArray<
  Pick<ContractBuild, "name" | "label" | "base">
> = [
  {
    name: "scores",
    label: "DailyScores",
    base: join(
      contractsDirectory,
      "scores",
      "target",
      "daily-scores.release",
    ),
  },
  {
    name: "word",
    label: "WordRegistry",
    base: join(
      contractsDirectory,
      "word",
      "target",
      "word-registry.release",
    ),
  },
  {
    name: "chess",
    label: "ChessRegistry",
    base: join(
      contractsDirectory,
      "chess",
      "target",
      "chess-registry.release",
    ),
  },
  {
    name: "mini",
    label: "MiniRegistry",
    base: join(
      contractsDirectory,
      "mini",
      "target",
      "mini-registry.release",
    ),
  },
  {
    name: "connections",
    label: "ConnectionsRegistry",
    base: join(
      contractsDirectory,
      "connections",
      "target",
      "connections-registry.release",
    ),
  },
];
const selectedSpecs = only
  ? buildSpecs.filter((spec) => only.includes(spec.name))
  : buildSpecs;

function sha256(contents: Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}

function sha256Abi(contents: Uint8Array): string {
  const parsed = JSON.parse(new TextDecoder().decode(contents)) as unknown;
  return sha256(
    new TextEncoder().encode(JSON.stringify(parsed)),
  );
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

async function loadBuild(
  spec: Pick<ContractBuild, "name" | "label" | "base">,
): Promise<ContractBuild> {
  const [artifacts, abi, polkavm] = await Promise.all([
    loadPvmContractArtifacts(spec.base),
    readFile(`${spec.base}.abi.json`),
    readFile(`${spec.base}.polkavm`),
  ]);
  if (sha256(artifacts.bytecode) !== sha256(polkavm)) {
    throw new Error(
      `${spec.label} artifact loader disagrees with ${spec.base}.polkavm.`,
    );
  }
  return {
    ...spec,
    abi,
    abiSha256: sha256Abi(abi),
    bytecode: artifacts.bytecode,
    bytecodeSha256: sha256(polkavm),
  };
}

async function submitFinalized(
  tx: {
    createSubmitAndWatch(
      signer: Signer,
      options: object,
    ): {
      subscribe(observer: {
        next(event: any): void;
        error(error: unknown): void;
      }): { unsubscribe(): void };
    };
  },
  signer: Signer,
  label: string,
): Promise<any> {
  return new Promise((resolve, reject) => {
    let subscription: { unsubscribe(): void } | null = null;
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.unsubscribe();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(
      () => finish(new Error(`${label} timed out waiting for finalization`)),
      120_000,
    );
    try {
      subscription = tx
        .createSubmitAndWatch(signer, {
          mortality: { mortal: true, period: 256 },
        })
        .subscribe({
          next: (event: any) => {
            if (event.type !== "finalized") return;
            if (!event.ok) {
              finish(
                new Error(
                  `${label} failed: ${JSON.stringify(
                    event.dispatchError,
                    bigintReplacer,
                  )}`,
                ),
              );
            } else {
              finish(undefined, event);
            }
          },
          error: (error: unknown) =>
            finish(
              error instanceof Error ? error : new Error(String(error)),
            ),
        });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function instantiate(
  api: any,
  signer: Signer,
  deployer: string,
  build: ContractBuild,
): Promise<`0x${string}`> {
  console.log(`Deploying ${build.label} (${build.bytecode.length} bytes)…`);
  const dryRun = await api.apis.ReviveApi.instantiate(
    deployer,
    0n,
    undefined,
    undefined,
    { type: "Upload", value: build.bytecode },
    new Uint8Array(0),
    undefined,
  );
  if (!dryRun.result.success) {
    throw new Error(
      `${build.label} dry-run failed: ${JSON.stringify(
        dryRun.result.value,
        bigintReplacer,
      )}`,
    );
  }
  const gas = dryRun.weight_required;
  const tx = api.tx.Revive.instantiate_with_code({
    value: 0n,
    weight_limit: {
      ref_time: (gas.ref_time * 13n) / 10n,
      proof_size: (gas.proof_size * 13n) / 10n,
    },
    storage_deposit_limit:
      dryRun.storage_deposit.type === "Charge"
        ? (dryRun.storage_deposit.value * 13n) / 10n
        : 0n,
    code: build.bytecode,
    data: new Uint8Array(0),
    salt: undefined,
  });
  const finalized = await submitFinalized(
    tx,
    signer,
    `${build.label} deploy`,
  );
  const address = instantiatedContractAddress(finalized.events ?? []);
  console.log(
    `  ${build.label} at ${address} `
      + `(finalized block #${finalized.block?.number ?? "unknown"})`,
  );
  return address;
}

const CONTENT_ID_OF: Partial<Record<ContractName, keyof NonNullable<ActiveDeploymentRecord["content"]>>> = {
  word: "wordListId",
  chess: "chessSetId",
  mini: "miniSetId",
  connections: "connectionsSetId",
};

async function activateDeployment(
  builds: readonly ContractBuild[],
  contracts: Partial<ActiveDeploymentRecord["contracts"]>,
): Promise<void> {
  const abiMetadata = {} as ActiveDeploymentRecord["abis"];
  for (const build of builds) {
    const file = `${network.id}-${build.name}-${build.abiSha256.slice(0, 12)}.abi.json`;
    await atomicWrite(deploymentAbiPath(file), build.abi);
    abiMetadata[build.name] = {
      file,
      sha256: build.abiSha256,
    };
  }

  let record: ActiveDeploymentRecord;
  if (only) {
    // A partial deploy joins the live stack: keep the other addresses, ABIs
    // and content ids; a redeployed registry starts without content.
    const existing = readDeploymentRecord(network);
    const content = { ...existing.content };
    for (const build of builds) {
      const key = CONTENT_ID_OF[build.name];
      if (key) delete content[key];
    }
    record = {
      ...existing,
      contracts: { ...existing.contracts, ...contracts },
      abis: { ...existing.abis, ...abiMetadata },
      ...(Object.keys(content).length > 0 ? { content } : {}),
      deployedAt: new Date().toISOString(),
    };
    if ("content" in record && Object.keys(content).length === 0) {
      delete record.content;
    }
  } else {
    record = {
      network: network.id,
      chain: network.chainKey,
      status: "deployed",
      contracts: contracts as ActiveDeploymentRecord["contracts"],
      abis: abiMetadata,
      deployedAt: new Date().toISOString(),
    };
  }
  await atomicWrite(
    deploymentRecordPath(network),
    `${JSON.stringify(record, null, 2)}\n`,
  );
}

async function main(): Promise<void> {
  if (only) {
    // Fail before any transaction if there is no live record to merge into.
    readDeploymentRecord(network);
  }
  const builds = await Promise.all(selectedSpecs.map(loadBuild));
  await mkdir(dirname(deploymentRecordPath(network)), { recursive: true });

  const client = createClient(getWsProvider(rpc));
  try {
    const api = client.getTypedApi(paseo_asset_hub);
    const identity = signingIdentity(network);
    console.log(describeTarget(network, rpc));
    console.log(
      `Deploying as ${identity.description} (${identity.address})`,
    );
    await ensureAccountMapped(
      identity.address,
      identity.signer,
      {
        addressIsMapped: async (address: string) =>
          (await api.query.Revive.OriginalAccount.getValue(
            ss58ToH160(address),
          )) !== undefined,
      },
      api,
    );

    const deployed = {} as Partial<ActiveDeploymentRecord["contracts"]>;
    for (const build of builds) {
      deployed[build.name] = await instantiate(
        api,
        identity.signer,
        identity.address,
        build,
      );
    }

    const currentBuilds = await Promise.all(selectedSpecs.map(loadBuild));
    for (const original of builds) {
      const current = currentBuilds.find(
        (candidate) => candidate.name === original.name,
      );
      if (
        current?.bytecodeSha256 !== original.bytecodeSha256 ||
        current.abiSha256 !== original.abiSha256
      ) {
        throw new Error(
          `${original.label} build artifacts changed during deployment. `
            + "Rebuild and deploy again.",
        );
      }
    }

    await activateDeployment(builds, deployed);
    console.log(
      `Activated finalized ${only ? `${only.join(", ")} in the` : `${builds.length}-contract`} record at ${deploymentRecordPath(network)}.`,
    );
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
