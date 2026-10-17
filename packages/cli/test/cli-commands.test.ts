/**
 * The command table (`COMMANDS` in cli.ts) and `cloudhal --help` agree: every command the help
 * names has a handler and every handler is in the help. Also pins `main`'s exit codes for help and
 * unknown commands.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELP } from "../src/cli/help.ts";
import { COMMANDS, main } from "../src/cli.ts";

const helpCommands = () =>
  new Set([...HELP.matchAll(/^ {2}cloudhal ([a-z][a-z-]*)/gm)].map((m) => m[1] as string));

describe("cloudhal command table", () => {
  afterEach(() => vi.restoreAllMocks());

  it("has a handler for every command in --help, and nothing else", () => {
    const named = helpCommands();
    expect(named.size).toBeGreaterThan(20);
    expect([...named].sort()).toEqual(Object.keys(COMMANDS).sort());
  });

  it("prints help: exit 0 for `<command> --help`, 1 without a command (bare --help too)", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await main(["deploy", "-h"])).toBe(0);
    expect(await main(["--help"])).toBe(1);
    expect(await main([])).toBe(1);
    expect(out).toHaveBeenCalledWith(HELP);
  });

  it("refuses an unknown command with exit 1, including Object.prototype names", async () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await main(["nope"])).toBe(1);
    expect(await main(["toString"])).toBe(1);
    expect(err).toHaveBeenCalledWith(`unknown command "nope"\n\n${HELP}`);
  });

  it("keeps the subcommand usage errors", async () => {
    await expect(main(["media", "nope"])).rejects.toThrow(
      "usage: cloudhal media import-urls|verify|gc|placeholders",
    );
    await expect(main(["analytics"])).rejects.toThrow(
      "usage: cloudhal analytics status|rollup|seed|export",
    );
    await expect(main(["schedules", "constructor"])).rejects.toThrow(
      "usage: cloudhal schedules status|list|run-due [--remote]",
    );
    await expect(main(["comments", "import"])).rejects.toThrow(
      "usage: cloudhal comments import --in <file> [--remote]",
    );
    await expect(main(["deploy", "--plan", "pro"])).rejects.toThrow(
      '--plan must be free or paid (got "pro")',
    );
  });
});
