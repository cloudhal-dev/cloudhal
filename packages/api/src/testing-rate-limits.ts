/**
 * Shared suite for #168 item 8: Cloudhal's own long-window counters survive Better Auth's
 * rate-limit pruning. Better Auth deletes every `rateLimit` row older than its longest window
 * (60 s) whenever one of its own windows lapses; the hourly reset-mail cap used to live there and
 * restarted every minute. Runs the real API and Better Auth (with database rate limits, as
 * production does) on any backend; `Date` is faked so Better Auth's clock moves too.
 */
import { seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "./app.ts";
import { createAuth } from "./auth.ts";
import type { MailMessage } from "./mail.ts";
import type { RolesBackend } from "./testing-roles.ts";

const ORIGIN = "http://limits.test";
const IP = "203.0.113.7";
const T0 = Date.parse("2026-11-08T12:00:00.000Z");

export function describeRateLimitCounters(label: string, backend: RolesBackend): void {
  describe(`Cloudhal rate-limit counters: ${label}`, { timeout: 180_000 }, () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    afterAll(async () => {
      await backend.dispose?.();
    });

    it("keeps the hourly reset-mail cap when Better Auth prunes its 60 s window", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(T0);
      const b = await backend.create();
      await seedStarterSite(b.store, { name: "Limits", slug: "limits" });
      const auth = createAuth({
        database: b.database,
        sql: b.sql,
        baseURL: ORIGIN,
        secret: "rate-limit-test-secret-0123456789abcdefg",
        signUp: "first-user",
        clientAddressHeader: "cf-connecting-ip",
      });
      const mailbox: MailMessage[] = [];
      const pending: Promise<unknown>[] = [];
      const app = createApi({
        store: b.store,
        resolvePrincipal: auth.resolvePrincipal,
        authHandler: auth.handler,
        staff: auth.staff,
        signUp: auth.signUp,
        mail: { id: "test", send: async (m) => void mailbox.push(m) },
        defer: (task) => void pending.push(task),
      });
      const post = (path: string, body: unknown) =>
        app.request(`${ORIGIN}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "cf-connecting-ip": IP },
          body: JSON.stringify(body),
        });
      const email = "owner@example.com";
      const signedUp = await post("/api/auth/sign-up/email", {
        name: "Olive Owner",
        email,
        password: "correct horse battery staple",
      });
      expect(signedUp.status).toBe(200);
      const signIn = () =>
        post("/api/auth/sign-in/email", { email, password: "not the password at all" });
      expect((await signIn()).status).toBe(401);
      const askForResets = async (n: number) => {
        for (let i = 0; i < n; i++)
          expect((await post("/api/password-reset/request", { email })).status).toBe(202);
        while (pending.length > 0) await Promise.all(pending.splice(0));
        return mailbox.filter((m) => m.to === email).length;
      };

      // The first burst reaches the cap of 3 mails per address per hour.
      expect(await askForResets(4)).toBe(3);

      // 61 s later Better Auth's own sign-in window for this address has lapsed: its next sign-in
      // prunes every `rateLimit` row older than 60 s (the sentinel proves the prune ran).
      await b.sql.run(
        `INSERT INTO "rateLimit" ("id", "key", "count", "lastRequest") VALUES ('sentinel', 'sentinel', 1, ?)`,
        [T0],
      );
      vi.setSystemTime(T0 + 61_000);
      expect((await signIn()).status).toBe(401);
      expect(await b.sql.get(`SELECT "key" FROM "rateLimit" WHERE "key" = 'sentinel'`)).toBe(
        undefined,
      );

      // The second burst, inside the same hour, still sees the cap.
      expect(await askForResets(3)).toBe(3);

      // An hour after the first mail the address can be mailed again.
      vi.setSystemTime(T0 + 61 * 60_000);
      expect(await askForResets(1)).toBe(4);
    });
  });
}
