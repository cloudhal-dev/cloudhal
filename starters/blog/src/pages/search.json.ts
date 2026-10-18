import config from "virtual:cloudhal/config";
import { getSource } from "@cloudhal/astro-renderer/runtime";
import { searchJsonResponse } from "@cloudhal/astro-renderer/search";
import type { APIRoute } from "astro";

/**
 * The search modal's endpoint (RFC-0029 §5): the same index and rules as `/search`, as JSON. Never
 * cached, never indexed; a static build has no search and writes no file.
 */
export const GET: APIRoute = async ({ request, url }) => {
  // The source's own headers (preview, cache tags) do not apply: the answer is never cached.
  const source = await getSource(config, { request, response: { headers: new Headers() } });
  return searchJsonResponse(config, source, url);
};
