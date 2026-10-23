/** A minimal DevTools client over a browser-level socket (flat sessions), and base64 helpers. */
import { CSP_LISTENER } from "./checks/scripts.ts";
import { type CdpSocket, RenderError, type RenderSession } from "./types.ts";

/**
 * A minimal DevTools client over a browser-level socket (flat sessions). Enough for
 * `render_page`: a browser context per session, one page per width, evaluate and screenshot.
 */
export class Cdp {
  #id = 0;
  readonly #pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  readonly #listeners = new Set<(m: CdpEvent) => void>();
  readonly #socket: CdpSocket;
  #closed = false;
  constructor(socket: CdpSocket) {
    this.#socket = socket;
    socket.onMessage((raw) => {
      let m: { id?: number; result?: unknown; error?: { message?: string } } & CdpEvent;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      if (m.id !== undefined) {
        const p = this.#pending.get(m.id);
        if (!p) return;
        this.#pending.delete(m.id);
        if (m.error) p.reject(new RenderError(m.error.message ?? "DevTools error"));
        else p.resolve(m.result);
      } else if (m.method) {
        for (const l of this.#listeners) l(m);
      }
    });
    socket.onClose(() => {
      this.#closed = true;
      for (const p of this.#pending.values()) p.reject(new RenderError("the browser went away"));
      this.#pending.clear();
    });
  }
  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    if (this.#closed) return Promise.reject(new RenderError("the browser went away"));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.#id;
      this.#pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.#socket.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });
  }
  /** Resolves on the next event `method` of `sessionId` (or after `ms`, whichever comes first). */
  waitFor(method: string, sessionId: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.#listeners.delete(listener);
        resolve();
      };
      const listener = (m: CdpEvent) => {
        if (m.method === method && m.sessionId === sessionId) done();
      };
      const timer = setTimeout(done, ms);
      this.#listeners.add(listener);
    });
  }
  close(): void {
    if (!this.#closed) this.#socket.close();
    this.#closed = true;
  }
}

export interface CdpEvent {
  method?: string;
  sessionId?: string;
  params?: Record<string, unknown>;
}

/**
 * A render session over a DevTools socket: an isolated browser context (no cookies shared
 * between calls). `closeBrowser` also closes the browser (Browser Rendering sessions).
 */
export async function cdpSession(
  socket: CdpSocket,
  options: { closeBrowser?: boolean; loadTimeoutMs?: number } = {},
): Promise<RenderSession> {
  const cdp = new Cdp(socket);
  const { browserContextId } = await cdp.send<{ browserContextId: string }>(
    "Target.createBrowserContext",
    { disposeOnDetach: true },
  );
  return {
    async open(url, viewport) {
      const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", {
        url: "about:blank",
        browserContextId,
      });
      const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
        targetId,
        flatten: true,
      });
      const s = (method: string, params: Record<string, unknown> = {}) =>
        cdp.send(method, params, sessionId);
      await s("Page.enable");
      await s("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.width < 768,
      });
      if (viewport.width < 768) await s("Emulation.setTouchEmulationEnabled", { enabled: true });
      // The same render on every machine: the scheme asked for, whatever the host prefers.
      await s("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-color-scheme", value: viewport.scheme ?? "light" },
          {
            name: "prefers-reduced-motion",
            value: viewport.reducedMotion === false ? "no-preference" : "reduce",
          },
        ],
      });
      // Before the page's own scripts: keep the CSP violations it raises (`script-blocked`).
      await s("Page.addScriptToEvaluateOnNewDocument", { source: CSP_LISTENER });
      const loaded = cdp.waitFor("Page.loadEventFired", sessionId, options.loadTimeoutMs ?? 12_000);
      const nav = await s("Page.navigate", { url });
      if (typeof nav.errorText === "string" && nav.errorText)
        throw new RenderError(`could not open the page: ${nav.errorText}`);
      await loaded;
      // Phones zoom out to fit a page that is too wide; stay at 100 % so the screenshot shows
      // what overflows (the overflow-x check names it).
      if (viewport.width < 768) await s("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
      return {
        async evaluate<T>(expression: string): Promise<T> {
          const r = await cdp.send<{
            result?: { value?: T };
            exceptionDetails?: { exception?: { description?: string }; text?: string };
          }>(
            "Runtime.evaluate",
            { expression, awaitPromise: true, returnByValue: true },
            sessionId,
          );
          if (r.exceptionDetails)
            throw new RenderError(
              r.exceptionDetails.exception?.description ??
                r.exceptionDetails.text ??
                "script failed",
            );
          return r.result?.value as T;
        },
        async screenshot(quality) {
          const r = await cdp.send<{ data: string }>(
            "Page.captureScreenshot",
            { format: "jpeg", quality },
            sessionId,
          );
          return base64ToBytes(r.data);
        },
        async close() {
          await cdp.send("Target.closeTarget", { targetId });
        },
      };
    },
    async close() {
      try {
        await cdp.send("Target.disposeBrowserContext", { browserContextId });
        if (options.closeBrowser) await cdp.send("Browser.close");
      } catch {
        // already gone
      } finally {
        cdp.close();
      }
    },
  };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
