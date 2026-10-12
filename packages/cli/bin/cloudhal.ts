#!/usr/bin/env node
import { main } from "../src/cli.ts";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`cloudhal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
