/** `cloudhal --help`; every command it names has an entry in `COMMANDS` (cli.ts). */
export const HELP = `cloudhal — agent-native sites

Usage:
  cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
  cloudhal dev [--port <n>] [--host]                      live preview (drafts visible)
  cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
  cloudhal build [--snapshot <id>]                        static HTML from the published/latest snapshot
  cloudhal studio [--port <n>] [--no-auth]                API + Studio UI for this project (default :8787)
  cloudhal mcp [--mode plan|manual|edits|auto|bypass] [--scopes a,b] [--skills <dir>] [--preview-url <url>]
                                                          MCP server over stdio for this project
  cloudhal deploy [--name <base>] [--dry-run] [--jurisdiction eu] [--scheduler cron|alarm] [--plan free|paid]
                  [--force-downgrade] [--no-build-studio]
                                                          site + admin Workers on Cloudflare (uses wrangler login);
                                                          --jurisdiction eu keeps a newly created D1 database
                                                          in the EU (cannot be changed later); --scheduler picks
                                                          the minute cron trigger or the Durable Object alarm;
                                                          --plan sizes scheduler ticks for the account's Workers
                                                          plan (default free; remembered);
                                                          --force-downgrade deploys older schedules code over
                                                          open releases and time gates; from the monorepo a
                                                          stale apps/studio/dist is rebuilt first
                                                          (--no-build-studio: fail instead)
  cloudhal domain [set <hostname>] [--studio <hostname>] | remove [site|studio|all]
                                                          custom domains for the next deploy
  cloudhal push [--replace] [--cancel-schedules] [--admin-url <url>]
                                                          local site → deployment (refused while releases are
                                                          open unless --cancel-schedules cancels them)
  cloudhal pull [--replace] [--admin-url <url>]           deployment → local site
  cloudhal owner transfer --to <email> [--admin-url <url>]
                                                          make a member the deployment's Owner
                                                          (lockout recovery; uses the deployment token)
  cloudhal site list | create --name <name> --slug <slug> [--locale <tag>] [--project <id>] [--theme <name>] [--from <siteId>]
                     | delete <siteId> --confirm <slug>  [--remote] [--admin-url <url>]
                                                          the installation's sites (RFC-0034): one Studio,
                                                          many isolated sites; nothing is published
  cloudhal migrate tags-to-terms [--dry-run] [--revert <id>]
                                                          move entry tags into tag terms (RFC-0002);
                                                          resumable; --revert <id> undoes a run
  cloudhal media import-urls [--dry-run] [--include-markdown] [--allow-host <host>]… | --revert <id>
                                                          copy linked images into the media library
                                                          (RFC-0004); revertible
  cloudhal media verify [<assetId>]                       recompute media checksums
  cloudhal media gc [--dry-run]                           delete unreferenced media bytes (> 24 h old)
  cloudhal media placeholders [--remote] [--all] [--dry-run]
                                                          draw missing image placeholders in local Chrome
  cloudhal analytics status [--remote]                    site analytics: settings, daily totals, budget
  cloudhal analytics rollup [--days <n>] [--remote] [--redo]
                                                          compute daily totals (--remote backfills the
                                                          deployment from WAE, up to 92 days)
  cloudhal analytics seed [--days <n>] [--views <n>]      demo traffic in the local SQLite only
  cloudhal analytics export [--from <date> --to <date>] [--remote] [--out <file>]
                                                          daily totals as CSV (default: 30 days)
  cloudhal comments status [--remote]                     reader comments: counts, pending, daily cap, purges
  cloudhal comments export [--remote] [--with-personal-data --out <file>]
                                                          comments as JSON lines (stdout or --out)
  cloudhal comments import --in <file> [--remote]         JSON lines back in; idempotent, safe to rerun
  cloudhal schedules status [--remote]                    the scheduler's health, open releases, gated pages
  cloudhal schedules list [--remote] [--limit <n>]        the site's releases
  cloudhal schedules run-due [--remote]                   one scheduler tick now (self-hosting: run it from
                                                          the system's cron every minute)
  cloudhal ai build-eval [--remote] [--models a,b] [--briefs landing,faq] [--out <file>]
                        [--design] [--look] [--judge <model>|none]
                                                          compare models on Build chat's turn, in memory
                                                          (real model calls; RFC-0020 open question 7);
                                                          --design renders each result: failed checks and
                                                          a vision model's score (RFC-0021 21c); --look lets
                                                          the model see its render first, as Build chat does
  cloudhal ai judge-check [--remote] [--judge <model>]   score the reference pages (empty → strong) with the
                                                          design judge; fails when it does not rank them
  cloudhal render <path|url> [--width 1440,390] [--scheme dark] [--motion static|reduce|full]
                        [--frames <n>] [--base <url>] [--out <dir>]
                                                          screenshots and render_page's checks for a page
                                                          (of cloudhal dev by default; RFC-0024)
  cloudhal motion audit [--path <p>]                      the motion each page asks for, against its budgets
  cloudhal tokens export [--format dtcg] [--out <file>]   the site's design tokens as a W3C Design Tokens file
                                                          (Figma, Style Dictionary; RFC-0023)
  cloudhal chrome get [--file <f>] | set --file <f>       the site's header, footer and brand as JSON
                                                          (RFC-0025)
  cloudhal search reindex [--remote]                      rebuild the search index from the live snapshot
                                                          (publishing keeps it current; for restored backups)
  cloudhal --help
`;
