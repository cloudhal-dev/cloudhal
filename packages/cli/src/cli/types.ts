import type { parseArgs } from "node:util";
import type { OPTIONS } from "../cli.ts";

/** The parsed flags, typed from `OPTIONS`. */
export type CliValues = ReturnType<
  typeof parseArgs<{ args: string[]; allowPositionals: true; options: typeof OPTIONS }>
>["values"];

/** What every command handler gets besides its positionals and flags. */
export type CliContext = { projectDir: string };

/** One `cloudhal <command>`: `rest` is the positionals after the command; resolves to the exit code. */
export type CliCommand = (rest: string[], values: CliValues, ctx: CliContext) => Promise<number>;

/** Resolves when the process is asked to stop (Ctrl-C, SIGTERM). */
export function untilSignal(also?: (resolve: () => void) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => resolve());
    also?.(resolve);
  });
}

/**
 * A command whose first positional picks an action (`cloudhal media gc`); an unknown or missing
 * action throws `usage`. The action gets the positionals after its name.
 */
export function subcommands(actions: Record<string, CliCommand>, usage: string): CliCommand {
  return async (rest, values, ctx) => {
    const [what, ...args] = rest;
    const action = what !== undefined && Object.hasOwn(actions, what) ? actions[what] : undefined;
    if (!action) throw new Error(usage);
    return action(args, values, ctx);
  };
}

/** `--remote` and `--admin-url`, spread into the remote-capable commands' options. */
export function remoteFlags(values: CliValues) {
  return {
    ...(values.remote ? { remote: true } : {}),
    ...(values["admin-url"] ? { adminUrl: values["admin-url"] } : {}),
  };
}
