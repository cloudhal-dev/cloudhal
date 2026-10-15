/**
 * RFC-0020 §6 (phase 20b part 2): build rooms carry Build view events between isolates. The room
 * runs here against a fake Durable Object state and fake WebSockets; the hub talks to it through
 * a fake namespace, as two isolates would.
 */
import { BUILD_VIEWER_LIMIT, type BuildChange, BuildViewerLimitError } from "@cloudhal/api";

type Page = BuildChange extends infer C ? (C extends { page: infer P } ? P : never) : never;

import { describe, expect, it } from "vitest";
import { buildRoomClass, createDurableBuildHub } from "../src/build-rooms.ts";

/** One end of a fake socket pair: `send` delivers to the other end's listeners. */
class FakeSocket {
  peer: FakeSocket | undefined;
  closed = false;
  readonly listeners: ((e: { data: string }) => void)[] = [];
  accept() {}
  send(data: string) {
    if (this.closed || this.peer?.closed) throw new Error("closed");
    for (const l of this.peer?.listeners ?? []) l({ data });
  }
  addEventListener(_type: "message", l: (e: { data: string }) => void) {
    this.listeners.push(l);
  }
  close() {
    this.closed = true;
  }
}

function setup() {
  const accepted: FakeSocket[] = [];
  const state = {
    acceptWebSocket: (ws: FakeSocket) => accepted.push(ws),
    getWebSockets: () => accepted.filter((ws) => !ws.closed && !ws.peer?.closed),
  } as unknown as DurableObjectState;
  const Room = buildRoomClass({
    pair: () => {
      const a = new FakeSocket();
      const b = new FakeSocket();
      a.peer = b;
      b.peer = a;
      return [a as unknown as WebSocket, b as unknown as WebSocket];
    },
    upgrade: (client) => ({ status: 101, ok: false, webSocket: client }) as unknown as Response,
  });
  const room = new Room(state, {});
  const names: string[] = [];
  const rooms = {
    idFromName: (name: string) => {
      names.push(name);
      return name;
    },
    get: () => ({ fetch: (url: string, init?: RequestInit) => room.fetch(new Request(url, init)) }),
  } as unknown as DurableObjectNamespace;
  return { room, rooms, names, accepted };
}

const page = { id: "page_home00001", rev: 3, title: "Home", sections: [] } as unknown as Page;
const agent = { kind: "agent" as const, id: "agent_builder001", name: "Builder" };

describe("build rooms", () => {
  it("publishes from one isolate to viewers subscribed on another, per page", async () => {
    const { rooms, names } = setup();
    const writer = createDurableBuildHub(rooms, () => new Date("2026-10-15T10:00:00Z"));
    const viewer = createDurableBuildHub(rooms);
    const seen: BuildChange[] = [];
    const off = await viewer.subscribe(page.id, (c) => seen.push(c));
    await writer.pageChanged({ siteId: "site_abc123", page, tool: "patch_draft", actor: agent });
    await writer.patchRejected({
      siteId: "site_abc123",
      pageId: page.id,
      tool: "patch_draft",
      actor: agent,
      issues: [{ path: "/sections/0", message: "nope" }],
    });
    expect(seen.map((c) => c.kind)).toEqual(["changed", "rejected"]);
    expect(seen[0]).toMatchObject({ tool: "patch_draft", at: "2026-10-15T10:00:00.000Z" });
    expect(names.every((n) => n === page.id)).toBe(true);
    off();
    await writer.pageChanged({ siteId: "site_abc123", page, tool: "update_page", actor: agent });
    expect(seen).toHaveLength(2);
  });

  it("refuses a viewer past the limit and answers plain requests", async () => {
    const { room, rooms } = setup();
    const hub = createDurableBuildHub(rooms);
    for (let i = 0; i < BUILD_VIEWER_LIMIT; i++) await hub.subscribe(page.id, () => {});
    await expect(hub.subscribe(page.id, () => {})).rejects.toBeInstanceOf(BuildViewerLimitError);
    expect((await room.fetch(new Request("https://build-room/subscribe"))).status).toBe(426);
    expect((await room.fetch(new Request("https://build-room/other"))).status).toBe(404);
  });
});
