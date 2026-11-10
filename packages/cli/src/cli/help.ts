/**
 * `cloudhal --help`; every command it names has an entry in `COMMANDS` (cli.ts). The usage text is
 * in four pieces, each a readable size: the project on this machine, Cloudflare, content and sites,
 * operations. `HELP` prints them in that order.
 */
/** init, dev, snapshot, build, studio, mcp: the project on this machine. */
const PROJECT = `  cloudhal init <dir> [--name <name>] [--starter blog]   create a site project with a seeded local store
  cloudhal dev [--port <n>] [--host [<addr>]]             live preview (drafts visible); --host alone is
                                                          0.0.0.0, every IPv4 address (:: for IPv6 too)
  cloudhal snapshot [--label <text>] [--publish]          freeze the current graph (optionally publish)
  cloudhal build [--snapshot <id> | --published]          static HTML from the published snapshot, else the
                                                          latest, else a fresh one of the drafts; --published:
                                                          the published snapshot only, and before the first
                                                          publish the not-published status page with a
                                                          .cloudhal-status marker (RFC-0043; self-hosting)
  cloudhal studio [--port <n>] [--host [<addr>]] [--base-url <url>] [--behind-proxy] [--no-auth]
                  [--init-if-empty [--starter blog] [--name <name>]]
                                                          API + Studio UI for this project (default :8787);
                                                          while nobody has an account it prints a one-time
                                                          setup link for the owner (or set CLOUDHAL_SETUP_TOKEN:
                                                          32+ characters of A-Z a-z 0-9 - . _ ~); --no-auth
                                                          skips sign-in for local scripts and is refused
                                                          unless --host is loopback and --behind-proxy is off;
                                                          self-hosting: --host 0.0.0.0 (CLOUDHAL_HOST) listens
                                                          beyond this machine (alone: every IPv4 address),
                                                          --base-url (CLOUDHAL_BASE_URL) is the origin browsers
                                                          open Studio at, required behind a reverse proxy and
                                                          recommended whenever --host is not loopback (without
                                                          it sign-in accepts each request's own origin),
                                                          --behind-proxy (CLOUDHAL_BEHIND_PROXY=1) trusts its
                                                          X-Forwarded-Proto/Host and the last X-Forwarded-For
                                                          hop and needs --base-url, --init-if-empty
                                                          (CLOUDHAL_INIT=<starter>) creates the project first
                                                          when the folder is empty (lost+found aside) and has
                                                          no cloudhal.json; CLOUDHAL_SITE_BUILD=on (the Docker
                                                          image) runs its site-build at start and after every
                                                          publish, debounced, one build at a time
  cloudhal mcp [--mode plan|manual|edits|auto|bypass] [--scopes a,b] [--skills <dir>] [--preview-url <url>]
                                                          MCP server over stdio for this project
`;

/** deploy, domain, push, pull: the Cloudflare deployment. */
const CLOUDFLARE = `  cloudhal deploy [--name <base>] [--dry-run] [--jurisdiction eu] [--scheduler cron|alarm] [--plan free|paid]
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
  cloudhal domain [set <hostname>] [--studio <hostname>] [--redirect <hostname>]… | remove [site|studio|redirects|all]
                                                          custom domains for the next deploy
  cloudhal push [--replace] [--cancel-schedules] [--admin-url <url>]
                                                          local site → deployment (refused while releases are
                                                          open unless --cancel-schedules cancels them)
  cloudhal pull [--replace] [--admin-url <url>]           deployment → local site
`;

/** export, import, owner, site, migrate, fields: content and sites. */
const CONTENT = `  cloudhal export [--out <file>] [--site <id>] [--no-media] [--latest-only]
                                                          one site as a .cloudhal file (RFC-0039): its graph,
                                                          snapshots and media; never user accounts, comments,
                                                          analytics or secrets (its history names who made each
                                                          change). Default <site-slug>-<YYYYMMDD>.cloudhal, dated
                                                          by the newest row it holds (a deletion alone does not
                                                          move it); a file there is replaced only by the same
                                                          archive, --out <file> replaces any;
                                                          --site: a site listed in cloudhal.json sites;
                                                          --no-media: the graph only; --latest-only: only the
                                                          published and the latest snapshot
  cloudhal import <file> [--replace] [--dry-run] | --revert <snapshot-id> [--dry-run]
                                                          a .cloudhal file into this project (RFC-0039), its site
                                                          id kept; every file is verified before anything is
                                                          written. By default the archive's site must be
                                                          cloudhal.json's siteId or listed in sites, and absent
                                                          here or holding exactly the archive's nodes (missing
                                                          snapshots and media are added); --replace: the local
                                                          nodes become the archive's, its published snapshot
                                                          included, after a "before import <file>" snapshot of
                                                          them; an archive of another site switches cloudhal.json
                                                          siteId to it (the old site stays in the local store,
                                                          unlisted; write its id back to undo); --revert <id>:
                                                          back to such a snapshot, revs moved forward, saving the
                                                          current graph first; --dry-run prints the manifest and
                                                          the difference and writes nothing
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
  cloudhal fields rename <c> <from> <to> | retype <c> <key> <type> [--options a,b] [--multiple] [--clear] | localize <c> <key> on|off | remove <c> <key> | continue|revert <c> <id>  [--dry-run] [--remote]
                                                          change a collection's typed fields with their values
                                                          (RFC-0041): snapshotted, resumable; --dry-run reports
                                                          and greps the theme; revert <id> undoes a run
`;

/** media, analytics, comments, schedules, ai, render, motion, tokens, chrome, search. */
const OPERATIONS = `  cloudhal media import-urls [--dry-run] [--include-markdown] [--allow-host <host>]… | --revert <id>
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

export const HELP = `cloudhal — agent-native sites

Usage:
${PROJECT}${CLOUDFLARE}${CONTENT}${OPERATIONS}`;
