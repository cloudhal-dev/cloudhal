/**
 * `render_page` on Node (RFC-0021 §4): the local Chrome over its DevTools protocol, started on
 * the first render and stopped after a minute without one. `CHROME_PATH` picks the executable;
 * `CLOUDHAL_RENDER=off` turns rendering off. No browser library: Node 24 has WebSocket.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type CdpSocket, cdpSession, type PageRenderer } from "@cloudhal/mcp-server/render";
import type { RenderDeps } from "@cloudhal/mcp-server/tools";

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/pw-browsers/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

/** The Chrome to render with, if this machine has one. */
export function findChrome(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.CHROME_PATH) return existsSync(env.CHROME_PATH) ? env.CHROME_PATH : undefined;
  return CANDIDATES.find((p) => existsSync(p));
}

/** `render_page`'s deps for `cloudhal studio` and `cloudhal mcp`, or undefined (no Chrome, or off). */
export function localRender(env: NodeJS.ProcessEnv = process.env): RenderDeps | undefined {
  if (env.CLOUDHAL_RENDER === "off") return undefined;
  const executable = findChrome(env);
  return executable ? { renderer: chromeRenderer(executable) } : undefined;
}

function nodeSocket(ws: WebSocket): CdpSocket {
  return {
    send: (m) => ws.send(m),
    onMessage: (l) => ws.addEventListener("message", (e) => l(String(e.data))),
    onClose: (l) => ws.addEventListener("close", () => l()),
    close: () => ws.close(),
  };
}

export interface ChromeRendererOptions {
  /** Stop Chrome this long after the last session closes (default 60 s). */
  idleMs?: number;
  /** How long one launch may take to print its DevTools endpoint (default 20 s). */
  startMs?: number;
  /** Launches before giving up, each with a fresh profile (default 3, #207). */
  launches?: number;
  /** Wait before the second launch, doubled before each later one (default 1 s). */
  backoffMs?: number;
}

/** A Chrome process this renderer started. */
interface Launch {
  readonly process: ChildProcess;
  readonly endpoint: Promise<string>;
  readonly dir: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts one headless Chrome on a new temporary profile. */
function launchChrome(executable: string, startMs: number): Launch {
  const dir = mkdtempSync(path.join(tmpdir(), "cloudhal-render-"));
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = new Promise<string>((resolve, reject) => {
    let err = "";
    // A warm start is under a second; a cold one on a busy CI runner can take over 10 s. A launch
    // that hangs past this is killed and the renderer launches again (session()).
    const timer = setTimeout(
      () => reject(new Error(`Chrome did not start within ${startMs / 1000} s`)),
      startMs,
    );
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString();
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) {
        clearTimeout(timer);
        resolve(m[1] as string);
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Chrome exited"));
    });
  });
  endpoint.catch(() => {});
  const killOnExit = () => child.kill();
  process.once("exit", killOnExit);
  child.once("exit", () => process.off("exit", killOnExit));
  return { process: child, endpoint, dir };
}

/** Stops a launch (forcefully if it ignores SIGTERM) and removes its profile. */
function killChrome({ process: child, dir }: Launch): void {
  // Chrome's helpers can still be writing into the profile as the main process exits: retry, and
  // never let a leftover temporary directory become an uncaught exception.
  const removeProfile = () => {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // the OS cleans its temporary directory
    }
  };
  if (child.exitCode !== null || child.signalCode !== null) {
    removeProfile();
    return;
  }
  child.kill();
  // A Chrome still starting up can ignore SIGTERM and outlive this process: force it.
  const force = setTimeout(() => child.kill("SIGKILL"), 2000);
  force.unref?.();
  child.once("exit", () => clearTimeout(force));
  child.once("exit", removeProfile);
}

export function chromeRenderer(
  executable: string,
  options: ChromeRendererOptions = {},
): PageRenderer & { stop(): void } {
  const startMs = options.startMs ?? 20_000;
  const launches = Math.max(1, options.launches ?? 3);
  const backoffMs = options.backoffMs ?? 1000;
  let chrome: Launch | undefined;
  let active = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    const current = chrome;
    chrome = undefined;
    if (current) killChrome(current);
  };

  // The running Chrome's endpoint, launching it when needed. A stuck or crashed cold start is
  // killed and launched again with a new profile, with a growing pause, so a busy machine gets
  // several chances before render_page fails (#207). The error names the last failure.
  const endpoint = async (): Promise<string> => {
    let last: unknown;
    for (let attempt = 0; attempt < launches; attempt++) {
      if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1));
      if (!chrome) {
        const launched = launchChrome(executable, startMs);
        // A Chrome that exits on its own (a crash) is launched again by the next session.
        launched.process.once("exit", () => {
          if (chrome !== launched) return;
          chrome = undefined;
          killChrome(launched);
        });
        chrome = launched;
      }
      const current = chrome;
      try {
        return await current.endpoint;
      } catch (error) {
        last = error;
        // Another session may already have replaced it: only drop this launch.
        if (chrome === current) chrome = undefined;
        killChrome(current);
      }
    }
    const reason = last instanceof Error ? last.message : String(last);
    throw new Error(`${reason} (${launches} ${launches === 1 ? "launch" : "launches"})`);
  };

  return {
    stop() {
      clearTimeout(idle);
      stop();
    },
    async session() {
      clearTimeout(idle);
      const url = await endpoint();
      const ws = new WebSocket(url);
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", () => reject(new Error("could not reach Chrome")), {
          once: true,
        });
      });
      active++;
      const session = await cdpSession(nodeSocket(ws));
      return {
        open: session.open,
        async close() {
          await session.close();
          active--;
          if (active === 0) {
            idle = setTimeout(stop, options.idleMs ?? 60_000);
            idle.unref?.();
          }
        },
      };
    },
  };
}
