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
