/**
 * Resume-safe Daily Mini set seeding.
 *
 * Stable creation nonces prevent duplicate sets, while the finalized on-chain
 * puzzle count reconciles the local cursor after an interrupted batch.
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTENT_BATCH_SIZE,
  validateMiniFile,
  type MiniFile,
} from "./content-validation";
import { connectContractWriter } from "./contract-writer";
import { recordDeploymentContentId } from "./deployment-record";
import {
  assertAbiFunctions,
  creationNonce,
  entriesAfterCursor,
  loadContractTarget,
  loadSeedInputs,
  ResumeCursor,
} from "./seed-support";
import { appDirectory, targetNetwork } from "./target";

const contentDirectory = fileURLToPath(
  new URL("../../shared/mini", import.meta.url),
);
const network = targetNetwork();
const cursorPath = join(
  appDirectory,
  `.daily-seed-mini.${network.id}.json`,
);

interface SetView {
  creator: string;
  name: string;
  emoji: string;
  puzzle_count: number | bigint;
  start_day: number | bigint;
  sealed: boolean;
}

async function main(): Promise<void> {
  const inputs = await loadSeedInputs<MiniFile>(
    contentDirectory,
    "mini",
    validateMiniFile,
  );
  const target = await loadContractTarget(network, "mini");
  assertAbiFunctions(
    target.abi,
    [
      "createSetWithNonce",
      "getSetForCreation",
      "getSet",
      "addPuzzles",
      "sealSet",
    ],
    "MiniRegistry",
  );

  const cursor = await ResumeCursor.load(
    cursorPath,
    network,
    target.address,
  );
  const writer = await connectContractWriter(
    network,
    target.address,
    target.abi,
  );
  try {
    for (const { file, content } of inputs) {
      const nonce = creationNonce("mini", file);
      console.log(
        `\n${file}: "${content.name}" — ${content.puzzles.length} puzzles`,
      );

      const locate = async (): Promise<number | null> => {
        const result = await writer.query<number | bigint>(
          "getSetForCreation",
          [writer.accountH160, nonce],
        );
        const id = Number(result);
        return id === 0xffff_ffff ? null : id;
      };

      let setId = await locate();
      if (setId === null) {
        try {
          await writer.write("createSetWithNonce", [
            content.name,
            content.emoji,
            content.startDay,
            nonce,
          ]);
        } catch (error) {
          setId = await locate();
          if (setId === null) throw error;
        }
        setId ??= await locate();
        if (setId === null) {
          throw new Error(`Could not resolve the set created for ${file}.`);
        }
        console.log(`  created set #${setId}`);
      }

      let view = await writer.query<SetView>("getSet", [setId]);
      if (
        view.creator.toLowerCase() !== writer.accountH160 ||
        view.name !== content.name ||
        view.emoji !== content.emoji ||
        Number(view.start_day) !== content.startDay
      ) {
        throw new Error(
          `Set #${setId} does not match ${file}'s creator or metadata.`,
        );
      }
      let nextIndex = Number(view.puzzle_count);
      entriesAfterCursor(
        content.puzzles,
        nextIndex,
        `Set #${setId}`,
      );
      const local = cursor.get(file);
      if (local && local.nextIndex !== nextIndex) {
        console.log(
          `  cursor ${local.nextIndex}, chain ${nextIndex}; chain wins`,
        );
      }
      if (view.sealed) {
        if (nextIndex !== content.puzzles.length) {
          throw new Error(
            `Sealed set #${setId} does not match ${file}'s length.`,
          );
        }
        await cursor.update(file, {
          creationNonce: nonce.toString(),
          entityId: setId,
          nextIndex,
          sealed: true,
        });
        await recordDeploymentContentId(
          network,
          "miniSetId",
          setId,
        );
        console.log("  already sealed — skipping");
        continue;
      }

      let remaining = entriesAfterCursor(
        content.puzzles,
        nextIndex,
        `Set #${setId}`,
      );
      while (remaining.length > 0) {
        const batch = remaining.slice(
          0,
          CONTENT_BATCH_SIZE,
        );
        await writer.write("addPuzzles", [setId, batch]);
        view = await writer.query<SetView>("getSet", [setId]);
        const confirmed = Number(view.puzzle_count);
        if (confirmed !== nextIndex + batch.length) {
          throw new Error(
            `Set #${setId} finalized at ${confirmed}, expected `
              + `${nextIndex + batch.length}.`,
          );
        }
        nextIndex = confirmed;
        await cursor.update(file, {
          creationNonce: nonce.toString(),
          entityId: setId,
          nextIndex,
          sealed: false,
        });
        console.log(`  finalized through puzzle ${nextIndex}`);
        remaining = entriesAfterCursor(
          content.puzzles,
          nextIndex,
          `Set #${setId}`,
        );
      }

      await writer.write("sealSet", [setId]);
      view = await writer.query<SetView>("getSet", [setId]);
      if (!view.sealed || Number(view.puzzle_count) !== content.puzzles.length) {
        throw new Error(`Set #${setId} did not seal with expected content.`);
      }
      await cursor.update(file, {
        creationNonce: nonce.toString(),
        entityId: setId,
        nextIndex,
        sealed: true,
      });
      await recordDeploymentContentId(
        network,
        "miniSetId",
        setId,
      );
      console.log(`  sealed set #${setId}`);
    }
  } finally {
    writer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
