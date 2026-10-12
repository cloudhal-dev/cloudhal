import { useEffect, useState } from "react";

/**
 * Waits until a value stops changing (typing a slug, editing a draft) before it is previewed, so
 * a dry run or a preview request runs once per pause, not once per keystroke.
 */
export function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
