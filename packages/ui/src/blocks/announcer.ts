/**
 * A polite live region's words that are announced every time, the same message twice included:
 * the region is emptied first and the message set a moment later, so screen readers see a change.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const SETTLE_MS = 50;

export function useAnnouncer(): readonly [string, (message: string) => void] {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const say = useCallback((message: string) => {
    clearTimeout(timer.current);
    setText("");
    timer.current = setTimeout(() => setText(message), SETTLE_MS);
  }, []);
  return [text, say] as const;
}
