# Several sites in one installation (RFC-0034)

One installation is one Studio, one D1 database and one R2 bucket. It can hold any number of sites. Each site is isolated: it has its own content, settings, members' roles, keys, analytics and comments. One site Worker can serve several of these sites, picking the site from the request's hostname.

## Create a site

The operator creates sites with the deployment token:

```bash
cloudhal site create --remote --name "Türkçe" --slug turkce --locale tr --project <projectId>
cloudhal site list --remote
```

The new site starts with a home page and system pages. Nothing is published. Give it its domains in Studio, under the site's settings.

## Serve it from the same site Worker

1. List the sites in `cloudhal.json`. The project's own `siteId` always comes first:

   ```json
   { "siteId": "site_english…", "sites": ["site_turkish…"], "domains": { "site": "en.example.com" } }
   ```

2. Run `cloudhal deploy`. It checks three things:
   - every site in `sites` exists on the deployment;
   - every site in `sites` uses this Worker's theme (`Site.theme.name`);
   - every hostname those sites hold gets a Cloudflare Custom Domain route. The zone must be in the same account.

3. After you add a domain to a site in Studio, deploy again so the new route exists.

Requests on a hostname that no listed site holds get a 404. They never show another site. The Worker's `*.workers.dev` address shows the first site and is marked `noindex`.

A publish purges only that site's pages from the edge cache.

## Limits

| | Workers Free | Workers Paid |
|---|---|---|
| D1 database size (shared by every site of the installation) | 500 MB | 10 GB |
| Custom domains per zone | 100 | 100 |

A site with another theme needs its own site Worker. Attaching a second site Worker to the same installation is RFC-0034 phase C2. Until then, a site with another theme is a separate installation.
