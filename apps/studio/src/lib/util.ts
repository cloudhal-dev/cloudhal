/** Returns a copy with `key` set, or removed when the value is empty (keeps optional contract fields absent, not undefined). */
export function setOptional<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K] | "" | undefined | null,
): T {
  const copy = { ...obj };
  if (value === "" || value === undefined || value === null) {
    delete copy[key];
  } else {
    copy[key] = value as T[K];
  }
  return copy;
}

/** True when the edited copy differs from what the server last returned (drives "Unsaved changes"). */
export function isDirty<T>(draft: T | undefined, saved: T | undefined): boolean {
  if (draft === undefined || saved === undefined) return false;
  return JSON.stringify(draft) !== JSON.stringify(saved);
}
