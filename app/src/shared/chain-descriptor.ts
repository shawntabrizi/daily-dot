import { paseo_asset_hub } from "@parity/product-sdk-descriptors/paseo-asset-hub";

import type { NetworkTarget } from "../networks";

/**
 * The shared metadata supports both targets, but host routing keys on genesis.
 * Keep the descriptor metadata while identifying the chain selected at build.
 */
export function assetHubDescriptor(
  network: NetworkTarget,
): typeof paseo_asset_hub {
  if (paseo_asset_hub.genesis === network.genesisHash) {
    return paseo_asset_hub;
  }
  return {
    ...paseo_asset_hub,
    genesis: network.genesisHash,
  } as typeof paseo_asset_hub;
}
