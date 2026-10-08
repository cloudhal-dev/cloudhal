#!/usr/bin/env node
/**
 * `npm create cloudhal@latest [dir] [-- --name "My site"]` — creates a Cloudhal site project:
 * the blog starter with a seeded local site, ready for `npm install && npm run dev`.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { init } from "@cloudhal/cli";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: "string" },
    starter: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  process.stdout.write(
    "Usage: npm create cloudhal@latest [directory] -- [--name <site name>] [--starter blog]\n",
  );
  process.exit(0);
}

const dir = positionals[0] ?? "my-cloudhal-site";
try {
  const r = await init({
    dir,
    ...(values.name ? { name: values.name } : {}),
    ...(values.starter ? { starter: values.starter } : {}),
    log: (l) => console.log(`  ${l}`),
  });
  const rel = path.relative(process.cwd(), r.projectDir) || ".";
  console.log(`
Created ${r.projectDir}

  cd ${rel}
  npm install
  npm run dev        live preview with drafts, fully offline
  npm run studio     Studio + API + MCP for this project
  npm run deploy     put it on Cloudflare (uses your wrangler login)
`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
