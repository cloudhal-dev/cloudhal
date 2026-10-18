/** `cloudhal site list | create | delete` (RFC-0034 §2–3). */
import { createSite, deleteSite, listSites } from "../commands/site.ts";
import { type CliCommand, remoteFlags, subcommands } from "./types.ts";

const USAGE =
  "usage: cloudhal site list | create --name <name> --slug <slug> [--locale <tag>] [--project <id>] [--theme <name>] | delete <siteId> --confirm <slug>  [--remote] [--admin-url <url>]";

const list: CliCommand = async (_rest, values, { projectDir }) => {
  const sites = await listSites({ projectDir, ...remoteFlags(values) });
  for (const s of sites) {
    console.log(`${s.id}  ${s.slug}  ${s.defaultLocale}  ${s.theme}  ${s.name}`);
    if (s.hosts.length > 0) console.log(`  hosts: ${s.hosts.join(", ")}`);
    if (s.conflicts.length > 0)
      console.log(`  not served (another site holds it): ${s.conflicts.join(", ")}`);
  }
  return 0;
};

const create: CliCommand = async (_rest, values, { projectDir }) => {
  if (!values.name || !values.slug) throw new Error(USAGE);
  const site = await createSite(
    { projectDir, ...remoteFlags(values) },
    {
      name: values.name,
      slug: values.slug,
      ...(values.locale ? { locale: values.locale } : {}),
      ...(values.project ? { projectId: values.project } : {}),
      ...(values.theme ? { theme: values.theme } : {}),
    },
  );
  console.log(`created ${site.id} in project ${site.projectId} (nothing is published)`);
  return 0;
};

const remove: CliCommand = async (rest, values, { projectDir }) => {
  const [siteId] = rest;
  if (!siteId || !values.confirm) throw new Error(USAGE);
  const r = await deleteSite({ projectDir, ...remoteFlags(values) }, siteId, values.confirm);
  console.log(`deleted ${siteId}: ${r.rows} rows, ${r.objects} stored files`);
  return 0;
};

export const SITE_COMMANDS = {
  site: subcommands({ list, create, delete: remove }, USAGE),
} satisfies Record<string, CliCommand>;
