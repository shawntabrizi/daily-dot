// Adds the worker's Pocket cards to its published executable record, because
// bulletin-deploy up to 0.22.0 drops them (see deploy/bulletin-deploy.config.ts).
// Under 0.23.0+, which keeps them, this reads back a complete record and
// writes nothing.
//
// Reads `worker.<label>.<tld>`'s `executable` text record, checks it is the one
// this config publishes, merges in `includes.pocket` + `pocket.cards`, writes it
// with the same key, and reads it back. Adapted from Nemanja's pets, itself from
// paritytech/humanity-spa's scripts/publish-pocket-cards.mts.
//
//   DEPLOY_DOMAIN=dailyondot.paseo MNEMONIC=... pnpm pocket:publish -- --env <env> [--derivation-path //4] [--dry-run]
//
// `--derivation-path` applies a Substrate-style path to MNEMONIC, as bulletin-deploy's
// own flag does; the signer must be the account that owns the name.
// `--dry-run` prints what it would write and signs nothing; it needs no MNEMONIC.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The Android host refuses a face larger than this (RemoteFaceSource.MAX_FACE_BYTES). */
const MAX_FACE_BYTES = 256 * 1024;
const MAX_CARD_ID_BYTES = 256;

const fail = (...lines: string[]): never => {
  process.stderr.write(`\nError: ${lines.join("\n")}\n\n`);
  process.exit(1);
};

const argv = process.argv.slice(2);
const envId = argv[argv.indexOf("--env") + 1];
const dryRun = argv.includes("--dry-run");
const derivationPath = argv.includes("--derivation-path") ? argv[argv.indexOf("--derivation-path") + 1] : undefined;
if (argv.includes("--derivation-path") && !derivationPath) fail("--derivation-path needs a value, e.g. //4.");
if (!argv.includes("--env") || !envId) fail("--env <bulletin-deploy environment id> is required.");
const domain = process.env.DEPLOY_DOMAIN?.trim() || fail("DEPLOY_DOMAIN is required, e.g. dailyondot.paseo.");
const mnemonic = process.env.MNEMONIC?.trim();
if (!dryRun && !mnemonic) fail("MNEMONIC is required to sign (the key that owns the name).");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(root, "deploy/bulletin-deploy.config.ts");
const config = (await import(pathToFileURL(configPath).href)).default;
const worker = config.executables.find((e: { kind: string }) => e.kind === "worker");
const cards: { id: string; title: string; preview: string }[] =
  worker?.pocket?.cards ?? fail("no worker pocket.cards in the config");

// Screen the cards the way the Android host will, so a defect fails here and not on a phone.
const workerDir = resolve(dirname(configPath), worker.path);
const seen = new Set<string>();
for (const card of cards) {
  const where = `pocket card "${card.id}"`;
  if (!card.id || card.id.normalize("NFC") !== card.id || Buffer.byteLength(card.id) > MAX_CARD_ID_BYTES) {
    fail(`${where}: bad id`);
  }
  if (seen.has(card.id)) fail(`${where}: duplicate id`);
  seen.add(card.id);
  if (!card.title.trim()) fail(`${where}: blank title`);
  if (isAbsolute(card.preview) || card.preview.split("/").includes("..") || /^[a-z]+:/i.test(card.preview)) {
    fail(`${where}: preview must be a relative path inside the worker folder`);
  }
  const face = resolve(workerDir, card.preview);
  if (!existsSync(face)) fail(`${where}: ${face} missing; run pnpm pocket:build first`);
  if (statSync(face).size > MAX_FACE_BYTES) fail(`${where}: preview over ${MAX_FACE_BYTES} bytes`);
  JSON.parse(readFileSync(face, "utf8"));
}

// The workspace's pinned bulletin-deploy (a root devDependency), as a library.
const bd = await import("bulletin-deploy");

const { doc } = await bd.loadEnvironments();
const ep = bd.resolveEndpoints(doc, envId);
const tld: string = ep.tld ?? "dot";
if (!domain.endsWith(`.${tld}`)) fail(`${domain} is not on the "${envId}" TLD .${tld}`);
const workerName = `worker.${domain.slice(0, -(tld.length + 1))}`;

const dotns = new bd.DotNS();
await dotns.connect({
  mnemonic: mnemonic ?? bd.DEFAULT_MNEMONIC,
  ...(derivationPath ? { derivationPath } : {}),
  ...(ep.assetHub.length ? { assetHubEndpoints: ep.assetHub } : {}),
  ...(ep.autoAccountMapping ? { autoAccountMapping: true } : {}),
  ...(Object.keys(ep.contracts).length ? { contracts: ep.contracts } : {}),
  ...(ep.nativeToEthRatio ? { nativeToEthRatio: ep.nativeToEthRatio } : {}),
  ...(ep.registerStorageDeposit !== undefined ? { registerStorageDeposit: ep.registerStorageDeposit } : {}),
  environmentId: envId,
  tld,
  network: ep.network,
});
try {
  const current: string = await dotns.getTextRecord(workerName, "executable");
  if (!current) fail(`${workerName}.${tld} has no executable record; deploy the product first`);
  const published = JSON.parse(current);
  if (
    published.kind !== "worker"
    || published.entrypoint !== worker.entrypoint
    || JSON.stringify(published.appVersion) !== JSON.stringify(worker.appVersion)
  ) {
    fail(`${workerName}.${tld} is not the record this config publishes`, current);
  }
  const next = JSON.stringify({
    ...published,
    includes: { ...published.includes, pocket: true },
    pocket: { cards: cards.map(({ id, title, preview }) => ({ id, title, preview })) },
  });
  if (Buffer.byteLength(next) > bd.getTextRecordBudgetBytes()) fail("record over the text-record budget", next);
  process.stdout.write(`\n${workerName}.${tld} executable\n  published:  ${current}\n  with cards: ${next}\n`);
  if (next === current) process.stdout.write("Already published.\n");
  else if (dryRun) process.stdout.write("Dry run: nothing written.\n");
  else {
    await dotns.setTextRecord(workerName, "executable", next);
    if ((await dotns.getTextRecord(workerName, "executable")) !== next) fail("read-back does not match what was written");
    process.stdout.write(`Published ${cards.length} Pocket card(s) on ${workerName}.${tld}.\n`);
  }
} finally {
  dotns.disconnect();
}
process.exit(0);
