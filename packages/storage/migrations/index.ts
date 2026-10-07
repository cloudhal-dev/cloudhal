import type { Migration } from "../src/migrate.ts";
import { migration0001Init } from "./0001_init.ts";

/** All Cloudhal storage migrations, in order. */
export const migrations: readonly Migration[] = [migration0001Init];
