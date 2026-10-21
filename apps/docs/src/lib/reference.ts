/**
 * Reference pages generated from source (ADR-0039 rule 2), so they cannot drift from the code:
 * the CLI reference is `cloudhal --help` itself.
 */
import { HELP } from "../../../../packages/cli/src/cli/help.ts";
import type { SitePage } from "./site-pages.ts";

/** One `##` section per command, with its usage lines as written in `cloudhal --help`. */
export function cliReference(help: string = HELP): SitePage {
  const usage = help.split("\nUsage:\n")[1] ?? "";
  const blocks: { name: string; lines: string[] }[] = [];
  for (const line of usage.split("\n")) {
    const command = /^ {2}cloudhal ([a-z-]+)/.exec(line);
    if (command?.[1] && command[1] !== "--help") {
      const name = command[1];
      const last = blocks.at(-1);
      if (last?.name === name) last.lines.push(line.slice(2));
      else blocks.push({ name, lines: [line.slice(2)] });
    } else if (line.trim() && blocks.length) blocks.at(-1)?.lines.push(line.slice(2));
  }
  const body = [
    "Every command of the `cloudhal` CLI (`@cloudhal/cli`), as `cloudhal --help` prints it. Run it from a project folder: `npx cloudhal <command>`, `pnpm exec cloudhal <command>`, `yarn cloudhal <command>` or `bunx cloudhal <command>` ([installation](/docs/start/installation#running-the-cli)).",
    "",
    "Commands that take `--remote` act on the deployment instead of the local store, with the deployment token from `.cloudhal/deploy/secrets.json` (written by `cloudhal deploy`).",
    "",
    ...blocks.flatMap((b) => [`## ${b.name}`, "", "```txt", ...b.lines, "```", ""]),
  ].join("\n");
  return {
    id: "docs/reference/cli",
    title: "CLI reference",
    description: "Every command and flag of the cloudhal CLI, generated from `cloudhal --help`.",
    body,
  };
}
