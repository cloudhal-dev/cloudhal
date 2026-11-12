import config from "virtual:cloudhal/config";
import { robotsTxt } from "@cloudhal/astro-renderer/feeds";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { siteOrigin } from "@cloudhal/astro-renderer/seo";
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request, url }) => {
  const headers = new Headers();
  const source = await getSource(config, { request, response: { headers } });
  headers.set("content-type", "text/plain; charset=utf-8");
  if (!source) return new Response("User-agent: *\nDisallow: /\n", { status: 503, headers });
  return new Response(robotsTxt(siteOrigin(await source.site(), url)), { headers });
};
