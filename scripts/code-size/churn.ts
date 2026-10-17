/** Per-file git churn (non-merge commits, lines added + deleted) for the risk = size × churn table. */
import { execFileSync } from "node:child_process";
import { ROOT } from "./measure.ts";

export interface Churn {
  commits: number;
  added: number;
  deleted: number;
}

export function churnSince(since: string): Map<string, Churn> {
  const out = execFileSync(
    "git",
    ["log", `--since=${since}`, "--no-merges", "--numstat", "--format=%x00", "--no-renames"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  const churn = new Map<string, Churn>();
  for (const commit of out.split("\0")) {
    for (const line of commit.split("\n")) {
      const [added, deleted, file] = line.split("\t");
      if (!file || added === "-") continue;
      const entry = churn.get(file) ?? { commits: 0, added: 0, deleted: 0 };
      entry.commits++;
      entry.added += Number(added);
      entry.deleted += Number(deleted);
      churn.set(file, entry);
    }
  }
  return churn;
}
