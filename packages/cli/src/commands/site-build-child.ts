/**
 * One self-hosted site build in a child process (#150): `site-build --wait` (POSIX sh) runs
 * `cloudhal build` as its own child, so the build is spawned in a process group of its own and
 * ended as a group: `stop` (an abort) and the build's deadline send SIGTERM to the whole group, and
 * SIGKILL after a short grace, so no grandchild keeps the lock (`/tmp/site-build.lock`) or the
 * staging folder. Being its own group, a terminal's Ctrl-C no longer reaches it directly: Studio's
 * stop path aborts it instead. `site-build` ignores the signals during its swap, so a stop never
 * cuts a publish half-way; the build id its "live" line names (`parseLiveBuild`) is recorded, so a
 * run that went live and then failed (a stop during the clean-up after the swap) is told apart from
 * one that changed nothing. The output kept for a failure is plain text (no ANSI escapes or
 * control characters), scanned once.
 */
import { type ChildProcess, spawn } from "node:child_process";
import type { SiteBuildOutcome } from "./site-rebuild.ts";

/** The build's output kept for a failure's reason: its last lines, at most this many characters. */
const ERROR_TAIL = 600;
/** Output kept in memory while a build runs. */
const OUTPUT_KEEP = 16_384;
/** Between SIGTERM and SIGKILL to the build's process group, and after SIGKILL until we give up. */
const KILL_GRACE_MS = 2_000;
/** A running build's deadline unless `CLOUDHAL_SITE_BUILD_TIMEOUT` (seconds) says otherwise. */
export const SITE_BUILD_TIMEOUT_MS = 30 * 60_000;

/**
 * What `cloudhal build --published` rendered, from its own lines: `built … from <snapshot>
 * (published)` or `not-published: …`. Line scans, no regex over the output.
 */
export function parseBuildOutput(output: string): Pick<SiteBuildOutcome, "snapshotId" | "state"> {
  for (const line of output.split("\n").reverse()) {
    const text = line.trim();
    if (text.startsWith("not-published:")) return { state: "not-published" };
    const suffix = " (published)";
    if (!text.endsWith(suffix)) continue;
    const at = text.lastIndexOf(" from ");
    if (at === -1) continue;
    const id = text.slice(at + 6, text.length - suffix.length);
    if (id && !id.includes(" ")) return { state: "published", snapshotId: id };
  }
  return {};
}

/** What `site-build` prints once its swap is whole. */
const LIVE_PREFIX = "site-build: /data/dist -> site/current -> ";
const MAX_BUILD_ID = 64;

/**
 * The build `site-build` made live (`site-build: /data/dist -> site/current -> <id>[: …]`), when
 * its output says so: the id is letters, digits, `.`, `_` and `-`. Line scans, no regex.
 */
export function parseLiveBuild(output: string): string | undefined {
  for (const line of output.split("\n").reverse()) {
    const text = line.trim();
    if (!text.startsWith(LIVE_PREFIX)) continue;
    const rest = text.slice(LIVE_PREFIX.length);
    const colon = rest.indexOf(":");
    const id = colon === -1 ? rest : rest.slice(0, colon);
    if (id.length === 0 || id.length > MAX_BUILD_ID) return undefined;
    for (let i = 0; i < id.length; i++) {
      const c = id.charCodeAt(i);
      const ok =
        (c >= 0x30 && c <= 0x39) ||
        (c >= 0x41 && c <= 0x5a) ||
        (c >= 0x61 && c <= 0x7a) ||
        c === 0x2e ||
        c === 0x5f ||
        c === 0x2d;
      if (!ok) return undefined;
    }
    return id;
  }
  return undefined;
}

/** The last lines of `output` within `ERROR_TAIL` characters. */
export function outputTail(output: string): string {
  const lines = output.trimEnd().split("\n");
  let tail = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const next = tail ? `${lines[i]}\n${tail}` : (lines[i] ?? "");
    if (next.length > ERROR_TAIL) break;
    tail = next;
  }
  return tail || output.slice(-ERROR_TAIL);
}

const ESC = 0x1b;
const BEL = 0x07;

/** Where an escape sequence starting at `i` (an ESC) ends: the index after it. One forward scan. */
function escapeEnd(s: string, i: number): number {
  const kind = s.charCodeAt(i + 1);
  if (kind === 0x5b /* [ */) {
    // CSI: parameter and intermediate bytes, then one final byte (0x40–0x7e)
    let j = i + 2;
    while (j < s.length) {
      const c = s.charCodeAt(j++);
      if (c >= 0x40 && c <= 0x7e) return j;
    }
    return j;
  }
  if (kind === 0x5d /* ] */ || kind === 0x50 /* P */) {
    // OSC / DCS: up to BEL or ESC \ (or the end)
    let j = i + 2;
    while (j < s.length) {
      const c = s.charCodeAt(j);
      if (c === BEL) return j + 1;
      if (c === ESC && s.charCodeAt(j + 1) === 0x5c) return j + 2;
      j++;
    }
    return j;
  }
  return Math.min(s.length, i + 2);
}

/**
 * `s` without ANSI escape sequences and control characters (newlines and tabs stay; a carriage
 * return becomes a newline unless one follows), in one linear pass: what the audit row stores.
 */
export function plainText(s: string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s.charCodeAt(i);
    if (c === ESC) {
      i = escapeEnd(s, i);
      continue;
    }
    if (c === 0x0d) {
      if (s.charCodeAt(i + 1) !== 0x0a) out += "\n";
    } else if (c === 0x0a || c === 0x09 || (c >= 0x20 && c !== 0x7f && (c < 0x80 || c > 0x9f))) {
      out += s[i];
    }
    i++;
  }
  return out;
}

/** "30 min", "90 s", "250 ms". */
export function durationText(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s % 60 === 0 && s >= 60 ? `${s / 60} min` : `${s} s`;
}

export interface SiteBuildCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** `site-build:` progress lines and failures (the container log). */
  readonly log?: ((line: string) => void) | undefined;
  /** Ends the build (its process group); the result is a failure that gives the reason's message. */
  readonly signal?: AbortSignal | undefined;
  /** The build's deadline (default `SITE_BUILD_TIMEOUT_MS`): then it is ended and reported. */
  readonly timeoutMs?: number | undefined;
}

/** Signals the child's whole process group (POSIX), or the child alone where there are none. */
function signalGroup(child: ChildProcess, sig: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") child.kill(sig);
    else process.kill(-child.pid, sig);
  } catch {
    // already gone
  }
}

/** One build in a child process: success is exit code 0. Always settles (SIGKILL as the last word). */
export function runSiteBuildCommand(o: SiteBuildCommand): Promise<SiteBuildOutcome> {
  return new Promise((resolve) => {
    let output = "";
    let partial = "";
    /** Why we ended the build (abort or deadline), when we did. */
    let ended: string | undefined;
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const keep = (chunk: Buffer) => {
      const text = chunk.toString();
      output = (output + text).slice(-OUTPUT_KEEP);
      // forward the script's own progress lines, not Astro's whole build log
      const lines = (partial + text).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) if (line.startsWith("site-build:")) o.log?.(line);
    };
    const child = spawn(o.command, [...o.args], {
      cwd: o.cwd,
      env: o.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      // its own process group, so ending it ends `cloudhal build` under the shell too
      detached: process.platform !== "win32",
    });
    // Studio exiting by `process.exit` (not a stop) still ends the group.
    const onExit = () => signalGroup(child, "SIGTERM");
    process.once("exit", onExit);
    const finish = (r: SiteBuildOutcome) => {
      if (done) return;
      done = true;
      for (const t of timers) clearTimeout(t);
      process.off("exit", onExit);
      o.signal?.removeEventListener("abort", onAbort);
      resolve(r);
    };
    const end = (why: string) => {
      if (ended || done) return;
      ended = why;
      o.log?.(`site-build: ${why}; ending the build`);
      signalGroup(child, "SIGTERM");
      timers.push(
        setTimeout(() => {
          signalGroup(child, "SIGKILL");
          // a process that left the group may still hold the pipes: settle without them
          timers.push(
            setTimeout(() => {
              child.stdout?.destroy();
              child.stderr?.destroy();
              finish(failure(why));
            }, KILL_GRACE_MS),
          );
        }, KILL_GRACE_MS),
      );
    };
    const failure = (why: string): SiteBuildOutcome => {
      const text = plainText(output);
      const tail = outputTail(text);
      const build = parseLiveBuild(text);
      return { ok: false, error: tail ? `${why}: ${tail}` : why, ...(build ? { build } : {}) };
    };
    const onAbort = () => {
      const reason: unknown = o.signal?.reason;
      end(reason instanceof Error ? reason.message : "stopped");
    };
    const timeoutMs = o.timeoutMs ?? SITE_BUILD_TIMEOUT_MS;
    timers.push(setTimeout(() => end(`timed out after ${durationText(timeoutMs)}`), timeoutMs));
    if (o.signal?.aborted) onAbort();
    else o.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    child.once("error", (e) => finish({ ok: false, error: e.message }));
    child.once("close", (code, signal) => {
      // a build that finished within the grace (site-build ignores a stop during its swap): a success
      if (code === 0) {
        const text = plainText(output);
        const build = parseLiveBuild(text);
        return finish({ ok: true, ...parseBuildOutput(text), ...(build ? { build } : {}) });
      }
      if (ended) return finish(failure(ended));
      finish(failure(signal ? `stopped by ${signal}` : `exited with ${code}`));
    });
  });
}
