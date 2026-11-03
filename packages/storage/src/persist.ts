export type StorageStatus = {
  persisted: boolean;
  usageBytes?: number;
  quotaBytes?: number;
};

/**
 * Asks the browser not to evict our IndexedDB data under storage pressure.
 * Safe to call repeatedly; resolves false where unsupported or denied.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage) return { persisted: false };
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted?.() ?? Promise.resolve(false),
    navigator.storage.estimate?.() ?? Promise.resolve(undefined),
  ]);
  return { persisted, usageBytes: estimate?.usage, quotaBytes: estimate?.quota };
}
