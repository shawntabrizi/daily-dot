export type ContractAddress = `0x${string}`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function isContractAddress(value: unknown): value is ContractAddress {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Only the finalized Revive.Instantiated event is a durable address source.
 * A dry-run address may have been calculated against a reorged best block.
 */
export function instantiatedContractAddress(
  events: readonly unknown[],
): ContractAddress {
  const addresses: ContractAddress[] = [];
  for (const raw of events) {
    const outer = asRecord(raw);
    if (!outer) continue;
    const event = asRecord(outer.event) ?? outer;
    if (event.type !== "Revive") continue;
    const variant = asRecord(event.value);
    if (variant?.type !== "Instantiated") continue;
    const payload = asRecord(variant.value);
    if (!isContractAddress(payload?.contract)) {
      throw new Error(
        "Revive.Instantiated did not contain a valid contract address.",
      );
    }
    addresses.push(payload.contract.toLowerCase() as ContractAddress);
  }
  if (addresses.length !== 1) {
    throw new Error(
      "Deployment finalized without exactly one Revive.Instantiated event "
        + `(found ${addresses.length}); refusing a dry-run-predicted address.`,
    );
  }
  return addresses[0]!;
}
