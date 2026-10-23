import { Binary, createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { paseo_asset_hub } from "@parity/product-sdk-descriptors/paseo-asset-hub";
import { ensureAccountMapped } from "@parity/product-sdk-tx";
import { ss58ToH160 } from "@parity/product-sdk-address";
import {
  decodeFunctionResult,
  encodeFunctionData,
  hexToBytes,
  type Abi,
} from "viem";

import type { NetworkTarget } from "../src/networks";
import { signingIdentity } from "./signer";
import { assetHubRpc, describeTarget } from "./target";

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function outputHex(value: string | Uint8Array): `0x${string}` {
  return (
    typeof value === "string" ? value : Binary.toHex(value)
  ) as `0x${string}`;
}

function revertText(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string"
      ? hexToBytes(value as `0x${string}`)
      : value;
  return new TextDecoder().decode(bytes);
}

export interface ContractWriter {
  accountH160: string;
  query<T>(functionName: string, args: readonly unknown[]): Promise<T>;
  write(functionName: string, args: readonly unknown[]): Promise<void>;
  close(): void;
}

export async function connectContractWriter(
  network: NetworkTarget,
  destination: `0x${string}`,
  abi: Abi,
): Promise<ContractWriter> {
  const rpc = assetHubRpc(network);
  const client = createClient(getWsProvider(rpc));
  try {
    const api = client.getTypedApi(paseo_asset_hub);
    const unsafeApi = client.getUnsafeApi();
    const identity = signingIdentity(network);
    const accountH160 = ss58ToH160(identity.address).toLowerCase();
    console.log(describeTarget(network, rpc));
    console.log(
      `Signing as ${identity.description} (${identity.address})`,
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

    let nonce = Number(
      await api.apis.AccountNonceApi.account_nonce(
        identity.address,
        { at: "best" },
      ),
    );

    async function call(data: `0x${string}`): Promise<any> {
      return (unsafeApi as any).apis.ReviveApi.call(
        identity.address,
        destination,
        0n,
        undefined,
        undefined,
        hexToBytes(data),
        { at: "best" },
      );
    }

    async function query<T>(
      functionName: string,
      args: readonly unknown[],
    ): Promise<T> {
      const data = encodeFunctionData({
        abi,
        functionName,
        args,
      });
      const result = await call(data);
      if (!result.result.success || result.result.value.flags !== 0) {
        throw new Error(`query ${functionName} reverted`);
      }
      return decodeFunctionResult({
        abi,
        functionName,
        data: outputHex(result.result.value.data),
      }) as T;
    }

    async function write(
      functionName: string,
      args: readonly unknown[],
    ): Promise<void> {
      const data = encodeFunctionData({
        abi,
        functionName,
        args,
      });
      const dryRun = await call(data);
      if (!dryRun.result.success) {
        throw new Error(
          `${functionName} dry-run failed: ${JSON.stringify(
            dryRun.result.value,
            bigintReplacer,
          )}`,
        );
      }
      if (dryRun.result.value.flags !== 0) {
        throw new Error(
          `${functionName} reverted: ${revertText(
            dryRun.result.value.data,
          )}`,
        );
      }
      const gas = dryRun.weight_required;
      const deposit =
        dryRun.storage_deposit.type === "Charge"
          ? dryRun.storage_deposit.value
          : 0n;
      const tx = api.tx.Revive.call({
        dest: destination,
        value: 0n,
        weight_limit: {
          ref_time: (gas.ref_time * 15n) / 10n,
          proof_size: (gas.proof_size * 15n) / 10n,
        },
        storage_deposit_limit: deposit * 2n + 1_000_000_000n,
        data: hexToBytes(data),
      });
      const useNonce = nonce++;
      await new Promise<void>((resolve, reject) => {
        let subscription: { unsubscribe(): void } | null = null;
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          subscription?.unsubscribe();
          if (error) reject(error);
          else resolve();
        };
        const timer = setTimeout(
          () =>
            finish(
              new Error(
                `${functionName} nonce=${useNonce} timed out waiting for finalization`,
              ),
            ),
          120_000,
        );
        try {
          subscription = tx
            .createSubmitAndWatch(identity.signer, {
              nonce: useNonce,
              mortality: { mortal: true, period: 256 },
            })
            .subscribe({
              next: (event: any) => {
                if (event.type !== "finalized") return;
                if (!event.ok) {
                  finish(
                    new Error(
                      `${functionName} failed: ${JSON.stringify(
                        event.dispatchError,
                        bigintReplacer,
                      )}`,
                    ),
                  );
                } else {
                  finish();
                }
              },
              error: (error: unknown) =>
                finish(
                  error instanceof Error
                    ? error
                    : new Error(String(error)),
                ),
            });
        } catch (error) {
          finish(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });
    }

    return {
      accountH160,
      query,
      write,
      close: () => client.destroy(),
    };
  } catch (error) {
    client.destroy();
    throw error;
  }
}
