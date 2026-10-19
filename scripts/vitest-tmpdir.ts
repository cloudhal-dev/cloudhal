/**
 * Vitest `globalSetup` shared by every package: each run gets its own temp directory, removed when
 * the run ends. `TMPDIR` points into it before the test workers start, so `os.tmpdir()` in tests
 * and in every child they spawn (wrangler, workerd, Astro, Chrome) lands there, and a test that
 * forgets its `rm` no longer leaves anything behind. A process still running from it at the end (a
 * headless Chrome whose profile is in it) is killed and named, so the leak shows. A run that was
 * killed before its teardown is swept by the next one (its pid is gone).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PREFIX = "cloudhal-vitest-";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

function sweepStale(root: string): void {
  for (const name of readdirSync(root)) {
    if (!name.startsWith(PREFIX)) continue;
    const pid = Number(name.slice(PREFIX.length).split("-")[0]);
    if (Number.isInteger(pid) && pid > 0 && !alive(pid)) {
      rmSync(path.join(root, name), { recursive: true, force: true });
    }
  }
}

/** Kills the processes whose command line names `dir`; returns their command lines. */
function killLeftovers(dir: string): string[] {
  if (process.platform === "win32") return [];
  let lines: string[];
  try {
    lines = execFileSync("pgrep", ["-fl", dir], { encoding: "utf8" }).trim().split("\n");
  } catch {
    return []; // pgrep exits 1 when nothing matches
  }
  const killed: string[] = [];
  for (const line of lines) {
    const pid = Number(line.split(" ", 1)[0]);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGKILL");
      killed.push(line.slice(0, 160));
    } catch {
      // already gone
    }
  }
  return killed;
}

export default function setup(): () => void {
  const root = tmpdir();
  const previous = process.env.TMPDIR;
  try {
    sweepStale(root);
  } catch {
    // best effort: another run may be sweeping too
  }
  const dir = mkdtempSync(path.join(root, `${PREFIX}${process.pid}-`));
  process.env.TMPDIR = dir;
  return () => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    const killed = killLeftovers(dir);
    if (killed.length) {
      console.warn(
        `vitest-tmpdir: killed ${killed.length} leftover process(es):\n${killed.join("\n")}`,
      );
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
}
