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

export function chromeRenderer(
  executable: string,
  options: { idleMs?: number } = {},
): PageRenderer {
  let chrome: { process: ChildProcess; endpoint: Promise<string>; dir: string } | undefined;
  let active = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    if (!chrome) return;
    const { process: child, dir } = chrome;
    chrome = undefined;
    child.kill();
    // A Chrome still starting up can ignore SIGTERM and outlive this process: force it.
    const force = setTimeout(() => child.kill("SIGKILL"), 2000);
    force.unref?.();
    child.once("exit", () => clearTimeout(force));
    // Chrome's helpers can still be writing into the profile as the main process exits: retry,
    // and never let a leftover temporary directory become an uncaught exception.
    child.once("exit", () => {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // the OS cleans its temporary directory
      }
    });
  };

  const start = () => {
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
      // A warm start is under a second, a cold one on a busy CI runner can take over 10 s; one that
      // hangs past this is killed and launched once more (session()).
      const timer = setTimeout(() => reject(new Error("Chrome did not start")), 20_000);
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
        if (chrome?.process === child) chrome = undefined;
      });
    });
    endpoint.catch(() => {});
    chrome = { process: child, endpoint, dir };
    const killOnExit = () => child.kill();
    process.once("exit", killOnExit);
    child.once("exit", () => process.off("exit", killOnExit));
    return chrome;
  };

  return {
    async session() {
      clearTimeout(idle);
      let url: string;
      try {
        url = await (chrome ?? start()).endpoint;
      } catch {
        // A stuck or crashed cold start: one fresh launch with a new profile.
        stop();
        url = await start().endpoint;
      }
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
