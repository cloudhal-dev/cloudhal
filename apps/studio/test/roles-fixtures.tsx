/**
 * Shared fixtures for the staff-role screens (RFC-0005): a fetch stub that routes by method and
 * path, `/api/me` per role, the server's role rules, and the provider wrapper.
 */
import { Toasty } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { CodeProvider } from "../src/components/CodeProvider.tsx";
import { I18nProvider, type Locale } from "../src/i18n/index.tsx";
import type { Ability, InstanceInfo, Me, Role } from "../src/lib/api.ts";
import { FALLBACK_ABILITIES, FALLBACK_ROLE_SCOPES, holds, roleRules } from "../src/lib/roles.ts";

export function wrap(children: ReactNode, locale: Locale = "en") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={qc}>
        <CodeProvider>
          <Toasty>{children}</Toasty>
        </CodeProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

export interface Reply {
  status: number;
  body?: unknown;
}
export type Route = (url: string, init: RequestInit | undefined) => Reply | undefined;

/** Stubs `fetch`: the first route that answers wins; anything else is a 404. */
export function serve(...routes: Route[]) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, "");
    let reply: Reply | undefined;
    for (const r of routes) {
      reply = r(path, init);
      if (reply) break;
    }
    reply ??= { status: 404, body: { error: "not_found", message: path } };
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** A route for `method path` (path without the query string unless `exact`). */
export function on(method: string, path: string, reply: Reply | ((init?: RequestInit) => Reply)) {
  return (url: string, init?: RequestInit) => {
    const m = (init?.method ?? "GET").toUpperCase();
    const p = url.split("?")[0];
    if (m !== method || (p !== path && url !== path)) return undefined;
    return typeof reply === "function" ? reply(init) : reply;
  };
}

export const bodyOf = (fn: ReturnType<typeof serve>, method: string, path: string) => {
  const call = fn.mock.calls.find(
    ([u, i]) =>
      String(u)
        .replace(/^https?:\/\/[^/]+/, "")
        .split("?")[0] === path &&
      ((i as RequestInit | undefined)?.method ?? "GET").toUpperCase() === method,
  );
  return call ? JSON.parse(String((call[1] as RequestInit).body ?? "{}")) : undefined;
};

export const USER_IDS: Record<Role, string> = {
  owner: "u_owner",
  administrator: "u_admin",
  editor: "u_editor",
  author: "u_author",
  contributor: "u_contrib",
};
export const ACTOR_IDS: Record<Role, string> = {
  owner: "user_owner0001",
  administrator: "user_admin0001",
  editor: "user_editor001",
  author: "user_author001",
  contributor: "user_contrib01",
};
export const NAMES: Record<Role, string> = {
  owner: "Halil",
  administrator: "Ada",
  editor: "Ece",
  author: "Arda",
  contributor: "Cem",
};

/** `/api/me` for someone in `role`, with the server's ability map and invitable roles. */
export function meFor(role: Role): Me {
  const scopes = FALLBACK_ROLE_SCOPES[role];
  const can = Object.fromEntries(
    (Object.entries(FALLBACK_ABILITIES) as [Ability, string][]).map(([a, need]) => [
      a,
      need === "owner" ? role === "owner" : holds(scopes, need as never),
    ]),
  ) as Record<Ability, boolean>;
  const invitable: Role[] = can["members.manage"]
    ? ["administrator", "editor", "author", "contributor"]
    : can["members.invite"]
      ? ["author", "contributor"]
      : [];
  return {
    actor: { kind: "human", id: ACTOR_IDS[role], name: NAMES[role] },
    role,
    member: true,
    scopes,
    can,
    invitableRoles: invitable,
    userId: USER_IDS[role],
  };
}

const rules = roleRules();
export const INSTANCE: InstanceInfo = {
  signUp: "first-user",
  features: {
    agentKeys: true,
    mcp: true,
    activity: true,
    previewLinks: false,
    deployTransfer: false,
    approvals: true,
    members: true,
  },
  roles: {
    names: [...rules.names],
    scopes: rules.scopes,
    modeCaps: rules.modeCaps,
    abilities: rules.abilities,
  },
  invites: {
    defaultHours: 168,
    minHours: 1,
    maxHours: 336,
    adminMaxHours: 72,
    delivery: ["link"],
  },
};

/** `/api/me` and `/api/instance` for a person in `role`. */
export const asRole = (role: Role): Route[] => [
  on("GET", "/api/me", { status: 200, body: meFor(role) }),
  on("GET", "/api/instance", { status: 200, body: INSTANCE }),
];
