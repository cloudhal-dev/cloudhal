import { describe, expect, it } from "vitest";
import { isStaleChunkError, reloadForNewDeploy } from "../src/components/RouteStates.tsx";

describe("lazy route chunks after a deploy", () => {
  it("recognises missing-chunk errors from each browser engine", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: https://studio/assets/AgentsPage-abc.js",
      "Importing a module script failed.",
      "error loading dynamically imported module: https://studio/assets/x.js",
    ])
      expect(isStaleChunkError(new Error(message))).toBe(true);
    expect(isStaleChunkError(new Error("site not found"))).toBe(false);
    expect(isStaleChunkError("Failed to fetch dynamically imported module")).toBe(false);
  });

  it("reloads once, then lets the error show instead of looping", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    let reloads = 0;
    const reload = () => {
      reloads++;
    };
    const t0 = Date.UTC(2026, 9, 8, 12);
    expect(reloadForNewDeploy(storage, reload, t0)).toBe(true);
    expect(reloadForNewDeploy(storage, reload, t0 + 5_000)).toBe(false);
    expect(reloadForNewDeploy(storage, reload, t0 + 61_000)).toBe(true);
    expect(reloads).toBe(2);
  });
});
