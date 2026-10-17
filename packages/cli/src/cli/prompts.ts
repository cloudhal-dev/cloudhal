import { createInterface } from "node:readline/promises";

/**
 * Where a new D1 database should live (RFC-0007 D7), asked only when `cloudhal deploy` is about to
 * create it. Enter keeps the automatic location.
 */
export async function askJurisdiction(): Promise<"auto" | "eu"> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (
        await rl.question(
          "Where should the D1 database live?\n  1) Automatic: Cloudflare picks the location (default)\n  2) EU jurisdiction: the data stays inside the EU\nA location cannot be changed after the database is created. Choose [1/2]: ",
        )
      )
        .trim()
        .toLowerCase();
      if (answer === "" || answer === "1" || answer === "automatic") return "auto";
      if (answer === "2" || answer === "eu") return "eu";
    }
  } finally {
    rl.close();
  }
}

/** A yes/no question at the terminal; Enter means yes. */
export async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
