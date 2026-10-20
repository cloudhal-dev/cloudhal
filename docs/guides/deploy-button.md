# Deploy to Cloudflare button

Cloudflare's [Deploy to Cloudflare button](https://developers.cloudflare.com/workers/configuration/deploy-button/) copies a public repository into your GitHub account, creates the resources its root `wrangler.jsonc` declares and connects the repository to [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), which then runs the repository's `deploy` script. A button deploys one Worker; a Cloudhal installation is two (the site Worker and the admin Worker with Studio, API and MCP), one D1 database and one R2 bucket. So the button points at [`cloudhal-dev/cloudhal-template`](https://github.com/cloudhal-dev/cloudhal-template), a blog project whose `deploy` script is `cloudhal deploy`: the button provisions the site Worker's database and bucket, and `cloudhal deploy` makes the rest.

## What one click creates

- a copy of the template in your GitHub account; every push to its default branch deploys again
- the site Worker (the name you choose in the form, `cloudhal-site` by default) and `<base>-admin`, where `<base>` is that name without `-site`
- the D1 database and R2 bucket named in the form, used by both Workers
- the starter blog, pushed to the deployment on the first build only

## Creating the owner account

A local `cloudhal deploy` prints a one-time setup link. In Workers Builds the build log is kept, so the link is never printed. The first build ends with these steps instead:

1. In the Cloudflare dashboard, open **Workers & Pages › `<base>-admin` › Settings › Variables and Secrets**, edit `CLOUDHAL_SETUP_TOKEN` and enter a random value of your own (32 characters or more). Saving deploys it. Or run `npx wrangler secret put CLOUDHAL_SETUP_TOKEN --name <base>-admin`.
2. Open `https://<base>-admin.<your-subdomain>.workers.dev/login#setup=<that value>` and create the owner account.

Until an owner exists, sign-up needs that token. Once the owner exists, sign-up is closed whatever the token is.

## How `cloudhal deploy` behaves in Workers Builds

Workers Builds sets `WORKERS_CI=1`. Every build starts from a fresh clone, with no `.cloudhal/` folder: no local site, no `secrets.json`, no `state.json`. With `WORKERS_CI=1`, `cloudhal deploy`:

- **takes its names from the committed `wrangler.jsonc`.** It reads the Worker name (Workers Builds requires the config to name the connected Worker), the `DB` database's name and id, and the `BLOBS` bucket's name. A database id in that file is used without any D1 call, because the Workers Builds token may not have D1 permission. An all-zero placeholder id counts as no id. The deploy rewrites the file in the build's checkout and never commits it.
- **seeds the starter site** under `cloudhal.json`'s `siteId` when the checkout has none. It is pushed only when the deployment does not have that site yet. After that, the deployment is the source of truth, as it is for any deploy.
- **leaves the secrets on the Workers.** It lists each Worker's secrets (`wrangler secret list`). Any secret a Worker already has is kept, since wrangler keeps every secret a deploy does not set. A missing secret is generated and set. The secrets both Workers share are set on both together. If listing fails for any reason other than "Worker not found", the deploy stops, because generating new secrets would make data they encrypt unreadable (for example commenters' email addresses).
- **creates a new deployment token on every build.** The CLI uses it for the first push and nothing else.

## Limits

- **Existing deployments are not checked before new code goes out.** Workers Builds has no record of the previous deploy, so the schedules downgrade check (RFC-0008) and the cache purge after analytics or comments are switched on or off do not run. Cached pages pick up such a switch as they expire.
- **The scheduler starts on cron in every build.** If the account has no free cron slot, the build falls back to the Durable Object alarm each time (one extra admin upload). The Workers plan is `free` unless `cloudhal.json` sets `schedules.plan`.
- **Deploy through Git, work through Studio.** A clone of your copy has no `.cloudhal/` folder and no deployment token, because every build replaces the token. So a local `cloudhal deploy` stops with "site … not found in the local store", before it touches any secret, and `cloudhal push`, `pull` and `owner transfer` have no token to use. Edit content in Studio, connect agents with keys created in Studio (remote MCP), and deploy code changes by pushing to the default branch.
- **Custom domains** need zone permissions the default Workers Builds token lacks. Set them with `cloudhal domain set` and give the build token *Zone › Workers Routes* and *DNS* edit permissions on that zone, or add the domain in the dashboard.
- **Preview branches**: Workers Builds runs `wrangler versions upload` for non-default branches, which uploads only the site Worker. Keep deploying from the default branch.
- **`--jurisdiction eu`** has no effect: the button creates the database before `cloudhal deploy` runs.

## Making your own template

Start from `npm create cloudhal@latest`, then:

- commit `cloudhal.json` and a root `wrangler.jsonc` that names the site Worker, a `DB` D1 database (placeholder id `00000000-0000-0000-0000-000000000000`) and a `BLOBS` R2 bucket
- remove the `build` script (Workers Builds would run it before `deploy`), keep `"deploy": "cloudhal deploy"`
- commit a lockfile and a `.node-version` of `24`. The CLI runs on Node 24.

## Before 0.3.2: the site Worker shows Studio

Workers Builds sets `WRANGLER_CI_OVERRIDE_NAME` to the Worker a build is connected to. Before 0.3.2, `cloudhal deploy` passed it on to wrangler, so the admin Worker was uploaded under the site Worker's name. The site's address then served Studio, and no `<name>-admin` Worker existed. To fix a deployment made that way, bump `@cloudhal/*` in your copy of the template to 0.3.2 or later and push. The next build deploys both Workers under their own names.
