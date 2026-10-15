/** RFC-0021 §4: Browser Rendering's DevTools socket carries messages in length-prefixed chunks. */
import { describe, expect, it } from "vitest";
import { chunksToMessage, messageToChunks } from "../src/browser-render.ts";

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
