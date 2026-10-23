/**
 * Resolve the signing account used by deploy and seed tools.
 *
 * Public dev accounts are a testnet convenience only. Any future mainnet
 * target is refused unless the operator supplies an explicit mnemonic.
 */

import { AccountId } from "polkadot-api";
import { getTxCreator } from "polkadot-api/tx-creator";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";
import {
  createDevSigner,
  getDevPublicKey,
} from "@parity/product-sdk-tx";

import type { NetworkTarget } from "../src/networks";
import type { ProcessEnv } from "./target";

/** What `getTxCreator` and `createDevSigner` both return: a signer the tx API accepts. */
export type Signer = ReturnType<typeof getTxCreator>;

export interface SigningIdentity {
  signer: Signer;
  address: string;
  description: string;
}

type DevAccountName = Parameters<typeof createDevSigner>[0];

export function signingIdentity(
  network: NetworkTarget,
  env: ProcessEnv = process.env,
): SigningIdentity {
  const mnemonic = env.DAILY_DEPLOY_MNEMONIC?.trim();
  if (mnemonic) {
    const path = env.DAILY_DEPLOY_DERIVATION?.trim() ?? "";
    const derive = sr25519CreateDerive(
      entropyToMiniSecret(mnemonicToEntropy(mnemonic)),
    );
    const keypair = derive(path);
    return {
      signer: getTxCreator(
        keypair.publicKey,
        "Sr25519",
        keypair.sign,
      ),
      address: AccountId(network.ss58Prefix).dec(keypair.publicKey),
      description: `mnemonic account${path ? ` at ${path}` : ""}`,
    };
  }
  if (network.kind === "mainnet") {
    throw new Error(
      `${network.label} is a mainnet: dev accounts are refused. `
        + "Set DAILY_DEPLOY_MNEMONIC "
        + "(and optionally DAILY_DEPLOY_DERIVATION) to sign.",
    );
  }
  const dev = (env.DEPLOY_DEV_ACCOUNT ?? "Alice") as DevAccountName;
  return {
    signer: createDevSigner(dev),
    address: AccountId(network.ss58Prefix).dec(getDevPublicKey(dev)),
    description: `dev account ${dev}`,
  };
}
