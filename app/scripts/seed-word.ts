/**
 * Resume-safe Word list seeding.
 *
 * A stable per-file creation nonce prevents duplicate lists. The on-chain
 * `day_count` is authoritative after interruptions; a local cursor records
 * every finalized batch for operator visibility and fast reconciliation.
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateWordlistFile,
  WORD_BATCH_SIZE,
  type WordlistFile,
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
  new URL("../../shared/wordlists", import.meta.url),
);
const network = targetNetwork();
const cursorPath = join(
  appDirectory,
  `.daily-seed-word.${network.id}.json`,
);

interface ListView {
  creator: string;
  name: string;
  emoji: string;
  day_count: number | bigint;
  start_day: number | bigint;
  sealed: boolean;
}

async function main(): Promise<void> {
  const inputs = await loadSeedInputs<WordlistFile>(
    contentDirectory,
    "Word",
    validateWordlistFile,
  );
  const target = await loadContractTarget(network, "word");
  assertAbiFunctions(
    target.abi,
    [
      "createListWithNonce",
      "getListForCreation",
      "getList",
      "addDays",
      "sealList",
    ],
    "WordRegistry",
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
      // The name is in the nonce: a regenerated list (v2, v3) is a new on-chain list.
      const nonce = creationNonce("word", `${file}#${content.name}`);
      console.log(
        `\n${file}: "${content.name}" — ${content.words.length} words, `
          + `startDay ${content.startDay}`,
      );

      const locate = async (): Promise<number | null> => {
        const result = await writer.query<number | bigint>(
          "getListForCreation",
          [writer.accountH160, nonce],
        );
        const id = Number(result);
        return id === 0xffff_ffff ? null : id;
      };

      let listId = await locate();
      if (listId === null) {
        try {
          await writer.write("createListWithNonce", [
            content.name,
            content.emoji,
            content.startDay,
            nonce,
          ]);
        } catch (error) {
          listId = await locate();
          if (listId === null) throw error;
        }
        listId ??= await locate();
        if (listId === null) {
          throw new Error(`Could not resolve the list created for ${file}.`);
        }
        console.log(`  created list #${listId}`);
      }

      let view = await writer.query<ListView>("getList", [listId]);
      if (
        view.creator.toLowerCase() !== writer.accountH160 ||
        view.name !== content.name ||
        view.emoji !== content.emoji ||
        Number(view.start_day) !== content.startDay
      ) {
        throw new Error(
          `List #${listId} does not match ${file}'s creator or metadata.`,
        );
      }
      let nextIndex = Number(view.day_count);
      entriesAfterCursor(
        content.words,
        nextIndex,
        `List #${listId}`,
      );
      const local = cursor.get(file);
      if (local && local.nextIndex !== nextIndex) {
        console.log(
          `  cursor ${local.nextIndex}, chain ${nextIndex}; chain wins`,
        );
      }
      if (view.sealed) {
        if (nextIndex !== content.words.length) {
          throw new Error(
            `Sealed list #${listId} does not match ${file}'s length.`,
          );
        }
        await cursor.update(file, {
          creationNonce: nonce.toString(),
          entityId: listId,
          nextIndex,
          sealed: true,
        });
        await recordDeploymentContentId(
          network,
          "wordListId",
          listId,
        );
        console.log("  already sealed — skipping");
        continue;
      }

      let remaining = entriesAfterCursor(
        content.words,
        nextIndex,
        `List #${listId}`,
      );
      while (remaining.length > 0) {
        const batch = remaining.slice(0, WORD_BATCH_SIZE);
        console.log(`  step: addDays ${nextIndex}..${nextIndex + batch.length - 1}`);
        await writer.write("addDays", [listId, batch]);
        view = await writer.query<ListView>("getList", [listId]);
        const confirmed = Number(view.day_count);
        if (confirmed !== nextIndex + batch.length) {
          throw new Error(
            `List #${listId} finalized at ${confirmed}, expected `
              + `${nextIndex + batch.length}.`,
          );
        }
        nextIndex = confirmed;
        await cursor.update(file, {
          creationNonce: nonce.toString(),
          entityId: listId,
          nextIndex,
          sealed: false,
        });
        console.log(`  finalized through word ${nextIndex}`);
        remaining = entriesAfterCursor(
          content.words,
          nextIndex,
          `List #${listId}`,
        );
      }

      await writer.write("sealList", [listId]);
      view = await writer.query<ListView>("getList", [listId]);
      if (!view.sealed || Number(view.day_count) !== content.words.length) {
        throw new Error(`List #${listId} did not seal with expected content.`);
      }
      await cursor.update(file, {
        creationNonce: nonce.toString(),
        entityId: listId,
        nextIndex,
        sealed: true,
      });
      await recordDeploymentContentId(
        network,
        "wordListId",
        listId,
      );
      console.log(`  sealed list #${listId}`);
    }
  } finally {
    writer.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
