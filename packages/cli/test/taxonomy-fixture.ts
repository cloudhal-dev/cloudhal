/**
 * RFC-0002 public-site fixture shared by the static build (`e2e.test.ts`) and the Site Worker
 * (`cloudflare.test.ts`) tests, applied on top of the starter seed (News category, Cloudhal tag,
 * "Hello, world"):
 *
 * - 21 published issues in News, so `/category/news` is indexable and has a page 2;
 * - tag `weekly` on all 21 issues, then renamed to `weekly-digest` (prefix redirect, page 2, feed);
 * - tag `cloudhal` stays on "Hello, world" only: a thin archive (`noindex,follow`);
 * - a proposed tag on issue 1 (404) and a tag on issue 2 that is then retired without a
 *   redirect (410);
 * - issue 5's slug changes after it was published (exact 301).
 */
import type { ContentEntry, Term } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";

export const ISSUES = 21;

export interface TaxonomyFixture {
  readonly news: Term;
  readonly cloudhal: Term;
  readonly weekly: Term;
  readonly renamedEntry: ContentEntry;
}

const writer = { kind: "human" as const, id: "user_fixture0001", name: "Fixture Writer" };

const issueSlug = (i: number) => `issue-${String(i).padStart(2, "0")}`;

export async function applyTaxonomyFixture(
  store: SiteGraphStore,
  siteId: string,
): Promise<TaxonomyFixture> {
  const must = <T>(v: T | undefined, what: string): T => {
    if (v === undefined) throw new Error(`fixture: ${what} missing`);
    return v;
  };
  const news = must(await store.getTermBySlug(siteId, "category", "news"), "news");
  const cloudhal = must(await store.getTermBySlug(siteId, "tag", "cloudhal"), "cloudhal");
  const tag = must(await store.getTaxonomyByKey(siteId, "tag"), "tag taxonomy");
  const term = (slug: string, name: string, status: Term["status"] = "active") =>
    store.createTerm({
      siteId,
      taxonomyId: tag.id,
      slug,
      status,
      visibility: "public",
      labels: { en: { name } },
    });
  const weekly = await term("weekly", "Weekly");
  const oldTopic = await term("old-topic", "Old topic");
  const proposed = await term("proposed-idea", "Proposed idea", "proposed");

  const entries: ContentEntry[] = [];
  for (let i = 1; i <= ISSUES; i++) {
    const extra = i === 1 ? [proposed.id] : i === 2 ? [oldTopic.id] : [];
    entries.push(
      await store.createContentEntry({
        siteId,
        collection: "posts",
        slug: issueSlug(i),
        locale: "en",
        status: "published",
        title: `Issue ${i}`,
        summary: `Weekly issue number ${i}.`,
        body: { format: "markdown", value: `Issue ${i} of the weekly digest.` },
        fields: {},
        tags: [],
        terms: {
          category: { ids: [news.id], primary: news.id },
          tag: { ids: [weekly.id, ...extra] },
        },
        author: writer,
        publishedAt: new Date(Date.UTC(2026, 0, i)).toISOString(),
      }),
    );
  }
  await store.retireTerm(must(await store.getTerm(oldTopic.id), "old-topic"));
  const renamed = await store.renameTerm(
    must(await store.getTerm(weekly.id), "weekly"),
    "weekly-digest",
  );
  const five = must(await store.getContentEntry(entries[4]?.id as string), "issue 5");
  const renamedEntry = await store.updateContentEntry({ ...five, slug: "issue-05-renamed" });
  return { news, cloudhal, weekly: renamed.terms[0] as Term, renamedEntry };
}
