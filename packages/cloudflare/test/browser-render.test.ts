/** RFC-0021 §4: Browser Rendering's DevTools socket carries messages in length-prefixed chunks. */
import { describe, expect, it } from "vitest";
import { bindingSocket, chunksToMessage, messageToChunks } from "../src/browser-render.ts";

describe("Browser Rendering chunks", () => {
  it("round-trips small and multi-chunk messages, waiting for the rest of a message", () => {
    const small = JSON.stringify({ id: 1, method: "Page.enable" });
    const chunks = messageToChunks(small);
    expect(chunks).toHaveLength(1);
    expect(new DataView((chunks[0] as Uint8Array).buffer).getUint32(0, true)).toBe(small.length);
    expect(chunksToMessage([...chunks])).toBe(small);

    // a screenshot reply is several MiB: three chunks, delivered one at a time
    const big = JSON.stringify({ id: 2, result: { data: "ş".repeat(1_200_000) } });
    const parts = messageToChunks(big);
    expect(parts.length).toBe(3);
    expect(parts.every((p) => p.length <= 1_048_575)).toBe(true);
    const [first, second, third] = parts as [Uint8Array, Uint8Array, Uint8Array];
    const inbox: Uint8Array[] = [first];
    expect(chunksToMessage(inbox)).toBeUndefined();
    inbox.push(second, third, ...messageToChunks(small));
    expect(chunksToMessage(inbox)).toBe(big);
    // the next message stays queued
    expect(chunksToMessage(inbox)).toBe(small);
    expect(inbox).toHaveLength(0);
  });
});

describe("Browser Rendering socket", () => {
  it("reads binary messages delivered as Blobs, in order, and asks for ArrayBuffers", async () => {
    const listeners: Record<string, ((e: { data?: unknown }) => void)[]> = {};
    const ws = {
      binaryType: "blob",
      sent: [] as unknown[],
      send(m: unknown) {
        this.sent.push(m);
      },
      close() {},
      addEventListener(type: string, l: (e: { data?: unknown }) => void) {
        listeners[type] = [...(listeners[type] ?? []), l];
      },
    };
    const socket = bindingSocket(ws as unknown as WebSocket);
    expect(ws.binaryType).toBe("arraybuffer");
    const got: string[] = [];
    socket.onMessage((m) => got.push(m));
    const one = JSON.stringify({ id: 1, result: {} });
    const two = JSON.stringify({ id: 2, result: { data: "x".repeat(2_000_000) } });
    const parts = messageToChunks(two);
    const emit = (data: unknown) => {
      for (const l of listeners.message ?? []) l({ data });
    };
    emit(new Blob(messageToChunks(one) as unknown as ArrayBuffer[]));
    for (const p of parts) emit(new Blob([p as unknown as ArrayBuffer]));
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toEqual([one, two]);
    socket.close();
  });
});
