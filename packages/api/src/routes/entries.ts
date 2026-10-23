import { checkEntryLimit } from "@cloudhal/agent-runtime";
import { renderEntryPreview, renderFragmentPreview } from "@cloudhal/astro-renderer/preview";
import type { ContentEntry, PublishStatus } from "@cloudhal/core-contracts";
import { InvariantError } from "@cloudhal/core-ts";
import { isRegistered } from "@cloudhal/core-ts/collections";
import { Hono } from "hono";
import { patchBody } from "../body.ts";
import type { Env } from "../context.ts";
import { entryDraft } from "../drafts.ts";
import { withoutNullFields } from "../entry-fields.ts";
import { badRequest, notFound } from "../errors.ts";
import { API_ACTOR, writerOf } from "../governance.ts";
import { editsLiveCorrections, entryLimit, personOf } from "../own.ts";
import { param } from "../params.ts";
import { type DraftPreview, previewResponse } from "../preview.ts";

const STATUSES = new Set<PublishStatus>(["draft", "review", "published", "archived"]);

function statusList(raw: string | undefined): PublishStatus[] | undefined {
  if (!raw) return undefined;
  const values = raw.split(",").map((s) => s.trim()) as PublishStatus[];
  for (const v of values) if (!STATUSES.has(v)) throw badRequest(`unknown status ${v}`);
  return values;
}

export const entries: Hono<Env> = new Hono<Env>()
  .get("/", async (c) => {
    const collection = c.req.query("collection") || undefined;
    const filter = c.req.query("filter") || undefined;
    const locale = c.req.query("locale") || undefined;
    const status = statusList(c.req.query("status"));
    // `filter` is the RFC-0002 §5 language; a FilterError maps to 400 with suggestions.
    return c.json(
      await c.get("store").listContentEntries(param(c, "siteId"), {
        ...(collection ? { collection } : {}),
        ...(filter ? { filter } : {}),
        ...(locale ? { locale } : {}),
        ...(status ? { status } : {}),
      }),
    );
  })
  .post("/", async (c) => {
    const siteId = param(c, "siteId");
    if (!(await c.get("store").getSite(siteId))) throw notFound("site not found");
    // RFC-0041: in a collection with typed fields, `null` removes a key.
    const input = await withoutNullFields(
      c.get("store"),
      siteId,
      (await c.req.json()) as Omit<
        ContentEntry,
        "id" | "rev" | "createdAt" | "updatedAt" | "schemaVersion"
      >,
    );
    // RFC-0040 §5: a new collection is declared first (Studio's New collection).
    const registry = await c.get("store").listCollections(siteId);
    if (typeof input.collection === "string" && !isRegistered(registry, input.collection))
      throw new InvariantError(
        "collection_undeclared",
        `collection "${input.collection}" is not declared; declare it first`,
      );
    const actor = c.get("actor") ?? API_ACTOR;
    // `author` is server-controlled (RFC-0005 I9): the caller, unless they hold full
    // content:write (Editors may credit someone else, e.g. imports).
    const limit = entryLimit(c.get("principal"));
    const author = limit ? actor : (input.author ?? actor);
    const next = { ...input, siteId, author };
    await checkEntryLimit({
      limit,
      op: "create",
      person: personOf(c),
      owner: c.get("ownership"),
      next,
    });
    const entry = await c.get("store").createContentEntry(next, { writer: writerOf(c) });
    return c.json(entry, 201);
  })
  // The body editor's inline preview of one piece (a ```surface): rendered, nothing written.
  .post("/preview-fragment", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const b = (await c.req.json().catch(() => ({}))) as { markdown?: unknown };
    if (typeof b.markdown !== "string" || b.markdown.length > 64_000)
      throw badRequest("markdown must be text of at most 64 000 characters");
    return c.json(renderFragmentPreview(site, b.markdown, { blocks: store.blocks }));
  })
  .get("/:entryId/preview", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const entry = await store.getContentEntry(param(c, "entryId"));
    if (!entry || entry.siteId !== site.id) throw notFound("entry not found");
    return previewResponse(c, renderEntryPreview(site, entry, { blocks: store.blocks }).html);
  })
  // The editor's unsaved title, summary, body and cover (RFC-0014 phase 1c): writes nothing.
  .post("/:entryId/preview", async (c) => {
    const store = c.get("store");
    const site = await store.getSite(param(c, "siteId"));
    if (!site) throw notFound("site not found");
    const entry = await store.getContentEntry(param(c, "entryId"));
    if (!entry || entry.siteId !== site.id) throw notFound("entry not found");
    const draft = entryDraft(entry, await c.req.json().catch(() => ({})));
    return c.json({
      html: renderEntryPreview(site, draft, { blocks: store.blocks }).html,
    } satisfies DraftPreview);
  })
  .get("/:entryId", async (c) => {
    const entry = await c.get("store").getContentEntry(param(c, "entryId"));
    if (!entry || entry.siteId !== param(c, "siteId")) throw notFound("entry not found");
    return c.json(entry);
  })
  .put("/:entryId", async (c) => {
    const raw = (await c.req.json()) as ContentEntry;
    if (raw.id !== param(c, "entryId") || raw.siteId !== param(c, "siteId"))
      throw badRequest("ids must match the URL");
    const body = await withoutNullFields(c.get("store"), raw.siteId, raw);
    const limit = entryLimit(c.get("principal"));
    if (limit) {
      const stored = await c.get("store").getContentEntry(body.id);
      if (!stored || stored.siteId !== body.siteId) throw notFound("entry not found");
      await checkEntryLimit({
        limit,
        op: "update",
        person: personOf(c),
        owner: c.get("ownership"),
        stored,
        next: body,
      });
      // The CAS below must overwrite exactly the revision checked here.
      if (body.rev !== stored.rev)
        return c.json(
          {
            error: "conflict",
            message: `entry ${stored.id} is at rev ${stored.rev}; reload and retry`,
            details: {
              kind: "contentEntry",
              id: stored.id,
              expectedRev: body.rev,
              actualRev: stored.rev,
            },
          },
          409,
        );
    }
    return c.json(
      await c.get("store").updateContentEntry(body, {
        writer: writerOf(c),
        ...(editsLiveCorrections(c) ? { correctionEdit: true } : {}),
      }),
    );
  })
  // RFC-0014 §4: operations on the body's blocks instead of the whole entry.
  .patch("/:entryId/body", (c) => patchBody(c, { entryId: param(c, "entryId") }))
  .delete("/:entryId", async (c) => {
    const store = c.get("store");
    const entry = await store.getContentEntry(param(c, "entryId"));
    if (!entry || entry.siteId !== param(c, "siteId")) throw notFound("entry not found");
    const rev = Number(c.req.query("rev"));
    if (!Number.isInteger(rev)) throw badRequest("query parameter rev is required");
    const limit = entryLimit(c.get("principal"));
    await checkEntryLimit({
      limit,
      op: "delete",
      person: personOf(c),
      owner: c.get("ownership"),
      stored: entry,
    });
    if (limit && rev !== entry.rev)
      return c.json(
        { error: "conflict", message: `entry ${entry.id} is at rev ${entry.rev}` },
        409,
      );
    await store.deleteContentEntry({ ...entry, rev });
    return c.body(null, 204);
  });
