import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs` so relative labels ("5 minutes ago", "42 min left")
 * age without a refetch.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
