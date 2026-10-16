/** PWA-5: ask the browser not to evict our IndexedDB data. */
export async function isPersisted(): Promise<boolean | null> {
  if (!navigator.storage?.persisted) return null;
  return navigator.storage.persisted();
}

export async function requestPersist(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
