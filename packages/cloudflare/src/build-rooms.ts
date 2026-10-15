/**
 * Build rooms (RFC-0020 §6, phase 20b part 2): one Durable Object per page carries build events
 * between the admin Worker's isolates. A write on any isolate posts its change to the page's room
 * (`POST /publish`); each Build view stream holds a hibernatable WebSocket to it
 * (`/subscribe`), so an idle room costs nothing while Studio watches. The room keeps no state of
 * its own: changes pass through, viewers are its WebSockets.
 *
 * `createDurableBuildHub` is `@cloudhal/api`'s `BuildHub` over those rooms, so the API's
 * server-sent events route stays the same on Node and on Cloudflare.
 */
import {
  BUILD_VIEWER_LIMIT,
  type BuildChange,
  type BuildHub,
  BuildViewerLimitError,
  buildChange,
} from "@cloudhal/api";

export interface BuildRoomsEnv {
  /** One room per page, `idFromName(pageId)`; declared by every deploy (SQLite-backed). */
  BUILD_ROOMS?: DurableObjectNamespace;
}

/** The room's origin in requests from the Worker (a Durable Object ignores the host). */
const ROOM = "https://build-room";

/** What the room needs from the runtime; workerd's globals by default, fakes in tests. */
export interface BuildRoomRuntime {
  pair(): [WebSocket, WebSocket];
  /** The 101 answer handing the client end to the caller (Node's `Response` cannot say 101). */
  upgrade(client: WebSocket): Response;
}

const workerdRuntime: BuildRoomRuntime = {
  pair: () => {
    const p = new WebSocketPair();
    return [p[0], p[1]];
  },
  upgrade: (client) => new Response(null, { status: 101, webSocket: client }),
};

/**
 * Builds the `BuildRoom` Durable Object class. A factory, like `schedulerClockClass`, so it needs
 * no `cloudflare:workers` import and its logic runs on Node with a fake state.
 */
export function buildRoomClass(runtime: BuildRoomRuntime = workerdRuntime) {
  return class BuildRoom {
    readonly state: DurableObjectState;

    constructor(state: DurableObjectState, _env: unknown) {
      this.state = state;
    }

    async fetch(request: Request): Promise<Response> {
      const { pathname } = new URL(request.url);
      if (request.method === "POST" && pathname === "/publish") {
        const text = await request.text();
        for (const ws of this.state.getWebSockets()) {
          try {
            ws.send(text);
          } catch {
            // A socket closing as we send: the runtime drops it from the room.
          }
        }
        return new Response(null, { status: 204 });
      }
      if (pathname === "/subscribe") {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
          return new Response("expected a WebSocket upgrade", { status: 426 });
        if (this.state.getWebSockets().length >= BUILD_VIEWER_LIMIT)
          return new Response("too many viewers", { status: 429 });
        const [client, server] = runtime.pair();
        // Hibernatable: the room may sleep between changes without dropping its viewers.
        this.state.acceptWebSocket(server);
        return runtime.upgrade(client);
      }
      return new Response("not found", { status: 404 });
    }

    /** Viewers only listen; anything they send is ignored. */
    webSocketMessage(): void {}

    webSocketClose(ws: WebSocket, code: number): void {
      try {
        ws.close(code === 1005 ? 1000 : code);
      } catch {
        // Already closed.
      }
    }
  };
}

/** `BuildHub` over the rooms: publish posts to the page's room, subscribe opens a WebSocket. */
export function createDurableBuildHub(
  rooms: DurableObjectNamespace,
  now: () => Date = () => new Date(),
): BuildHub {
  const room = (pageId: string) => rooms.get(rooms.idFromName(pageId));
  const publish = async (pageId: string, change: BuildChange) => {
    const res = await room(pageId).fetch(`${ROOM}/publish`, {
      method: "POST",
      body: JSON.stringify(change),
    });
    if (!res.ok && res.status !== 204) throw new Error(`build room answered ${res.status}`);
  };
  return {
    pageChanged: (change) =>
      publish(change.page.id, buildChange({ kind: "changed", ...change }, now())),
    patchRejected: (rejection) =>
      publish(rejection.pageId, buildChange({ kind: "rejected", ...rejection }, now())),
    async subscribe(pageId, listener) {
      const res = await room(pageId).fetch(`${ROOM}/subscribe`, {
        headers: { upgrade: "websocket" },
      });
      if (res.status === 429) throw new BuildViewerLimitError();
      const ws = res.webSocket;
      if (!ws) throw new Error(`build room did not open a WebSocket (${res.status})`);
      ws.accept();
      ws.addEventListener("message", (event) => {
        try {
          listener(JSON.parse(String(event.data)) as BuildChange);
        } catch {
          // A malformed message is skipped; the viewer's next snapshot puts it right.
        }
      });
      return () => {
        try {
          ws.close(1000, "viewer left");
        } catch {
          // Already closed.
        }
      };
    },
  };
}
