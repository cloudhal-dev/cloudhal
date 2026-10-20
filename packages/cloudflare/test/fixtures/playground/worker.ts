/**
 * Test-only playground Worker: the real `createPlaygroundWorker`, the starter seed, demo media
 * from the static files, and a renderer that reads the session's store through
 * `withRequestStore` the way the Astro pages do (getSource, serveMedia).
 */
import "../../../src/workerd-prelude.ts";
import { getSource, serveMedia, withRequestStore } from "@cloudhal/astro-renderer/runtime";
import { seedStarterSite } from "@cloudhal/core-ts";
import { createPlaygroundWorker } from "../../../src/playground.ts";

const playground = createPlaygroundWorker({
  deployUrl: "https://cloudhal.dev/docs/deploy",
  seed: async (store) => ({
    siteId: (await seedStarterSite(store, { name: "Playground Demo", slug: "demo" })).id,
  }),
  demoMedia: { prefix: "demo/", keys: ["media/hello.txt"] },
  render: (request, { store, siteId }) =>
    withRequestStore(store, siteId, async () => {
      const media = await serveMedia(request, { siteId });
      if (media) return media;
      const response = { headers: new Headers(), status: 200 };
      const source = await getSource({ siteId } as never, { request, response });
      if (!source) return new Response("unpublished", { status: 503, headers: response.headers });
      const site = await source.site();
      response.headers.set("content-type", "text/html; charset=utf-8");
      response.headers.set("cache-tag", "should-be-removed");
      return new Response(
        `<h1>${site.name}</h1><a href="/about/">About</a><a href="https://example.org/x">Out</a>`,
        { headers: response.headers },
      );
    }),
});

export const PlaygroundSite = playground.PlaygroundSite;
export default playground.worker;
