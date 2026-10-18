/**
 * `key` as it reads in the reading order (ADR-0033): in a right-to-left language ArrowLeft points
 * forward and ArrowRight back, so they swap; every other key is returned as it is. Keyboard
 * handlers whose Left and Right mean "previous / next", "open / close" or "nest / move out" read
 * the key through this, so the arrow keeps pointing the way the layout goes.
 */
export function readingKey(key: string, direction: string | undefined): string {
  if (direction !== "rtl") return key;
  if (key === "ArrowLeft") return "ArrowRight";
  if (key === "ArrowRight") return "ArrowLeft";
  return key;
}
