/**
 * Redirect planning (RFC-0002 §4.5, invariant 14): matching a request path, and the in-memory plan
 * an operation builds before it writes — new redirects, chains collapsed onto the new target,
 * redirects from paths that are served again deleted, loops refused. Worker-safe.
 */
import { assertValid, type Redirect, type RedirectSource } from "@cloudhal/core-contracts";
import { InvariantError } from "./errors.ts";
import { ID_PREFIX } from "./ids.ts";
import type { OpBatch } from "./node-sql.ts";

/** `/a/b/` → `/a/b`; the root stays `/`. Query and fragment are not part of a request path here. */
export function normalisePath(path: string): string {
  const p = path.split(/[?#]/, 1)[0] ?? "/";
  return p.length > 1 ? p.replace(/\/+$/, "") || "/" : p || "/";
}

/** A target split into its site path and the `?query#fragment` suffix; `undefined` for https URLs. */
export function splitTarget(to: string): { path: string; suffix: string } | undefined {
  if (!to.startsWith("/")) return undefined;
  const i = to.search(/[?#]/);
  return i < 0 ? { path: to, suffix: "" } : { path: to.slice(0, i), suffix: to.slice(i) };
}

/** Appends the unmatched rest of a prefix match to a target, before its query or fragment. */
export function joinTarget(to: string, rest: string): string {
  if (!rest) return to;
  const i = to.search(/[?#]/);
  const head = i < 0 ? to : to.slice(0, i);
  const tail = i < 0 ? "" : to.slice(i);
  return `${head.replace(/\/+$/, "")}${rest}${tail}`;
}

/** The proper ancestors of a path, longest first, including `/`. */
export function ancestorPaths(path: string): string[] {
  const out: string[] = [];
  let p = path;
  while (p.length > 1) {
    p = p.slice(0, p.lastIndexOf("/")) || "/";
    out.push(p);
  }
  return out;
}

export interface RedirectMatch {
  readonly redirect: Redirect;
  /** Where to send the request: `to`, plus the unmatched rest of the path for prefix redirects. */
  readonly location: string;
}

/** Exact `from` first, then the longest `prefix` redirect above the path. */
export function matchRedirect(
  redirects: Iterable<Redirect>,
  requestPath: string,
): RedirectMatch | undefined {
  const path = normalisePath(requestPath);
  const byFrom = new Map<string, Redirect>();
  for (const r of redirects) byFrom.set(r.from, r);
  const exact = byFrom.get(path);
  if (exact) return { redirect: exact, location: exact.to };
  for (const anc of ancestorPaths(path)) {
    const r = byFrom.get(anc);
    if (r?.match === "prefix")
      return {
        redirect: r,
        location: joinTarget(r.to, anc === "/" ? path : path.slice(anc.length)),
      };
  }
  return undefined;
}

/** Refuses a redirect set in which following redirects from `start` comes back or never ends. */
export function assertNoLoop(redirects: readonly Redirect[], start: string): void {
  let path = start;
  const seen = new Set<string>();
  for (let hop = 0; hop < 25; hop++) {
    const m = matchRedirect(redirects, path);
    if (!m) return;
    const next = splitTarget(m.location);
    if (!next) return;
    if (seen.has(m.redirect.id) || normalisePath(next.path) === start)
      throw new InvariantError("invalid_redirect", `redirect from ${start} would loop`, {
        from: start,
        via: m.redirect.from,
      });
    seen.add(m.redirect.id);
    path = next.path;
  }
  throw new InvariantError("invalid_redirect", `redirect from ${start} starts a chain of 25+ hops`);
}

interface Working {
  node: Redirect;
  readonly original: Redirect | undefined;
  deleted: boolean;
}

export interface MoveOptions {
  readonly match: Redirect["match"];
  readonly reason: Redirect["reason"];
  readonly source?: RedirectSource;
  readonly status?: Redirect["status"];
  readonly note?: string;
  readonly metadata?: Redirect["metadata"];
}

/**
 * The redirect changes of one operation, applied to an in-memory copy of the site's redirects and
 * emitted into the operation's batch at the end (one CAS per touched redirect).
 */
export class RedirectPlan {
  readonly #siteId: string;
  readonly #ts: string;
  readonly #newId: (prefix: string) => string;
  readonly #items: Working[];

  constructor(
    siteId: string,
    existing: readonly Redirect[],
    ts: string,
    newId: (prefix: string) => string,
  ) {
    this.#siteId = siteId;
    this.#ts = ts;
    this.#newId = newId;
    this.#items = existing.map((r) => ({ node: r, original: r, deleted: false }));
  }

  #live(): Working[] {
    return this.#items.filter((w) => !w.deleted);
  }

  /** Redirects as they will be after the plan. */
  current(): Redirect[] {
    return this.#live().map((w) => w.node);
  }

  /** `path` is served again (a node lives there now): redirects from it, or below it, go. */
  serve(path: string, prefix: boolean): void {
    for (const w of this.#live())
      if (w.node.from === path || (prefix && w.node.from.startsWith(`${path}/`))) w.deleted = true;
  }

  /**
   * Redirects that pointed at `from` (or below it, for prefix moves) now point at `to`. One that
   * would point at itself is dropped (renaming back).
   */
  repoint(from: string, to: string, match: Redirect["match"]): void {
    if (from === to) return;
    for (const w of this.#live()) {
      const target = splitTarget(w.node.to);
      if (!target) continue;
      let next: string | undefined;
      if (target.path === from) next = `${to}${target.suffix}`;
      else if (match === "prefix" && target.path.startsWith(`${from}/`))
        next = `${to}${target.path.slice(from.length)}${target.suffix}`;
      if (next === undefined) continue;
      if (splitTarget(next)?.path === w.node.from) w.deleted = true;
      else w.node = { ...w.node, to: next };
    }
  }

  /** A node moved from `from` to `to`: chains are collapsed onto `to` and `from` redirects there. */
  move(from: string, to: string, options: MoveOptions): void {
    if (from === to) return;
    this.repoint(from, to, options.match);
    this.upsert(from, to, options);
  }

  /** Creates or replaces the redirect from `from`, then refuses loops. */
  upsert(from: string, to: string, options: MoveOptions): Redirect {
    const status = options.status ?? 301;
    if (status === 302 && options.reason !== "manual")
      throw new InvariantError(
        "invalid_redirect",
        "302 is only for manual redirects; automatic ones are 301",
      );
    if (splitTarget(to)?.path === from)
      throw new InvariantError(
        "invalid_redirect",
        `a redirect from ${from} cannot point to itself`,
      );
    const fields = {
      to,
      status,
      match: options.match,
      reason: options.reason,
      ...(options.source ? { source: options.source } : {}),
      ...(options.note !== undefined ? { note: options.note } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };
    let w = this.#live().find((x) => x.node.from === from);
    if (w) {
      const { source: _s, note: _n, metadata: _m, ...rest } = w.node;
      w.node = { ...rest, ...fields };
    } else {
      w = {
        node: {
          schemaVersion: 1,
          id: this.#newId(ID_PREFIX.redirect),
          siteId: this.#siteId,
          from,
          ...fields,
          rev: 0,
          createdAt: this.#ts,
          updatedAt: this.#ts,
        },
        original: undefined,
        deleted: false,
      };
      this.#items.push(w);
    }
    this.#assertNoLoop(from);
    return w.node;
  }

  /** Removes the redirect with this id (manual delete inside a plan). */
  remove(id: string): void {
    for (const w of this.#live()) if (w.node.id === id) w.deleted = true;
  }

  #assertNoLoop(start: string): void {
    assertNoLoop(this.current(), start);
  }

  /** Statements this plan will emit. */
  get writes(): number {
    return this.#items.filter((w) => this.#changed(w)).length;
  }

  #changed(w: Working): boolean {
    if (!w.original) return !w.deleted;
    return w.deleted || w.node !== w.original;
  }

  /**
   * Adds the plan to a batch: deletes first (frees `from` keys), then CAS updates, then inserts.
   * Returns the redirects created or updated, as stored.
   */
  async emit(batch: OpBatch): Promise<Redirect[]> {
    const out: Redirect[] = [];
    for (const w of this.#items) if (w.original && w.deleted) batch.delete("redirect", w.original);
    for (const w of this.#items) {
      if (!w.original || w.deleted || w.node === w.original) continue;
      const next: Redirect = { ...w.node, rev: w.original.rev + 1, updatedAt: this.#ts };
      assertValid("redirect", next);
      await batch.update("redirect", w.original, next);
      out.push(next);
    }
    for (const w of this.#items) {
      if (w.original || w.deleted) continue;
      assertValid("redirect", w.node);
      await batch.insert("redirect", w.node);
      out.push(w.node);
    }
    return out;
  }
}
