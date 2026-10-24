import { getHostLocalStorage } from "@parity/product-sdk-host";

import type { StorageLike } from "./storage";

/**
 * One key in the product's host KV store: the only channel between the app
 * and the Pocket card worker, which share no runtime.
 */
export interface KeyStore {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export function storageKeyStore(storage: StorageLike, key: string): KeyStore {
  return {
    async read() {
      return storage.getItem(key);
    },
    async write(value) {
      storage.setItem(key, value);
    },
  };
}

/**
 * Host KV inside a host container, `localStorage` outside it so the dev
 * preview still writes something the worker-shaped code can read back.
 */
export async function detectKeyStore(key: string, fallback?: StorageLike): Promise<KeyStore> {
  try {
    const host = await getHostLocalStorage();
    if (host) {
      return {
        async read() {
          const value = await host.readString(key);
          return value === "" ? null : value;
        },
        write: (value) => host.writeString(key, value),
      };
    }
  } catch {
    // Not a host: fall through.
  }
  // Resolved late: a worker or a Node tool has no window at all.
  return storageKeyStore(fallback ?? window.localStorage, key);
}
