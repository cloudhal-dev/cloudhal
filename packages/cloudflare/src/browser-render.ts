/**
 * `render_page` on Workers (RFC-0021 §4): Cloudflare Browser Rendering through the admin Worker's
 * `BROWSER` binding. One browser per call: acquired, driven over its DevTools socket and closed.
 * The binding's socket carries messages in chunks (Workers caps a WebSocket message at 1 MiB and
 * screenshots are larger): a 4-byte little-endian length, then the UTF-8 message, in pieces.
 */
import {
  type CdpSocket,
  cdpSession,
  type PageRenderer,
  RenderError,
} from "@cloudhal/mcp-server/render";

/** The Browser Rendering binding (`browser = { binding = "BROWSER" }`). */
export interface BrowserBinding {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

const HOST = "https://fake.host";
const HEADER = 4;
const MAX_MESSAGE = 1_048_575;

/** Splits one DevTools message into the binding's chunks. */
export function messageToChunks(message: string): Uint8Array[] {
  const data = new TextEncoder().encode(message);
  const first = new Uint8Array(Math.min(MAX_MESSAGE, HEADER + data.length));
  new DataView(first.buffer).setUint32(0, data.length, true);
  first.set(data.subarray(0, MAX_MESSAGE - HEADER), HEADER);
  const chunks: Uint8Array[] = [first];
  for (let i = MAX_MESSAGE - HEADER; i < data.length; i += MAX_MESSAGE)
    chunks.push(data.subarray(i, i + MAX_MESSAGE));
  return chunks;
}

/** Collects chunks until a whole message has arrived; returns it and drops its chunks. */
export function chunksToMessage(chunks: Uint8Array[]): string | undefined {
  const first = chunks[0];
  if (!first || first.length < HEADER) return undefined;
  const expected = new DataView(first.buffer, first.byteOffset, first.byteLength).getUint32(
    0,
    true,
  );
  let total = -HEADER;
  for (let i = 0; i < chunks.length; i++) {
    total += (chunks[i] as Uint8Array).length;
    if (total > expected) throw new RenderError("Browser Rendering sent a malformed message");
    if (total === expected) {
      const parts = chunks.splice(0, i + 1);
      parts[0] = first.subarray(HEADER);
      const out = new Uint8Array(expected);
      let offset = 0;
      for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
      }
      return new TextDecoder().decode(out);
    }
  }
  return undefined;
}

/** The binding's DevTools socket as a `CdpSocket` (exported for tests). */
export function bindingSocket(ws: WebSocket): CdpSocket {
  const chunks: Uint8Array[] = [];
  const messageListeners: ((m: string) => void)[] = [];
  // Browser Rendering closes a socket that stays quiet; keep it talking while we work.
  const ping = setInterval(() => {
    try {
      ws.send("ping");
    } catch {
      clearInterval(ping);
    }
  }, 1000);
  // Recent compatibility dates deliver binary messages as Blobs (the web default); ask for
  // ArrayBuffers, and keep any Blob in order while it is read.
  (ws as WebSocket & { binaryType: string }).binaryType = "arraybuffer";
  let queue = Promise.resolve();
  const take = (bytes: Uint8Array) => {
    chunks.push(bytes);
    for (let m = chunksToMessage(chunks); m !== undefined; m = chunksToMessage(chunks))
      for (const l of messageListeners) l(m);
  };
  ws.addEventListener("message", (event) => {
    const data = event.data as string | ArrayBuffer | Blob;
    queue = queue.then(async () => {
      if (typeof data === "string") for (const l of messageListeners) l(data);
      else take(new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data));
    });
  });
  ws.addEventListener("close", () => clearInterval(ping));
  return {
    send: (m) => {
      for (const c of messageToChunks(m)) ws.send(c);
    },
    onMessage: (l) => {
      messageListeners.push(l);
    },
    onClose: (l) => ws.addEventListener("close", () => l()),
    close: () => {
      clearInterval(ping);
      ws.close();
    },
  };
}

export function browserRenderingRenderer(binding: BrowserBinding): PageRenderer {
  return {
    async session() {
      const acquired = await binding.fetch(`${HOST}/v1/acquire?keep_alive=60000`);
      if (acquired.status !== 200)
        throw new RenderError(
          `Browser Rendering refused a browser (${acquired.status}): ${(await acquired.text()).slice(0, 200)}`,
        );
      const { sessionId } = (await acquired.json()) as { sessionId?: string };
      if (!sessionId) throw new RenderError("Browser Rendering gave no session");
      const upgraded = await binding.fetch(
        `${HOST}/v1/connectDevtools?browser_session=${encodeURIComponent(sessionId)}`,
        { headers: { Upgrade: "websocket" } },
      );
      const ws = (upgraded as Response & { webSocket?: WebSocket | null }).webSocket;
      if (!ws)
        throw new RenderError(`Browser Rendering did not open a socket (${upgraded.status})`);
      (ws as WebSocket & { accept(): void }).accept();
      return cdpSession(bindingSocket(ws), { closeBrowser: true });
    },
  };
}
