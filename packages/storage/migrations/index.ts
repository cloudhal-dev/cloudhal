import type { Migration } from "../src/migrate.ts";
import { migration0001Init } from "./0001_init.ts";
import { migration0002Auth } from "./0002_auth.ts";

/** All Cloudhal storage migrations, in order. */
export const migrations: readonly Migration[] = [migration0001Init, migration0002Auth];
