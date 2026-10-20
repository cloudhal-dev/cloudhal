/** What every phase of `cloudhal deploy` reads: the options, the project, its site and names. */
import type { Site } from "@cloudhal/core-contracts";
import type { DeploymentNames, workerNames } from "../../cloudflare/config.ts";
import type { WranglerRunner } from "../../cloudflare/wrangler.ts";
import type { ProjectConfig } from "../../config.ts";
import type { DeployOptions } from "./options.ts";
import type { DeployState } from "./state.ts";

export interface DeployContext {
  readonly options: DeployOptions;
  readonly log: (line: string) => void;
  /** `cloudhal.json`, with the analytics decision made (asked once in a terminal). */
  readonly cfg: ProjectConfig;
  /** `<dataDir>/deploy`: secrets, state and generated configs. */
  readonly dir: string;
  readonly run: WranglerRunner;
  readonly site: Site;
  /** The last deploy of this project, if any. */
  readonly previous: DeployState | undefined;
  readonly base: DeploymentNames;
  readonly names: ReturnType<typeof workerNames>;
  /** Running in Cloudflare Workers Builds (`workers-builds.ts`). */
  readonly workersBuilds: boolean;
}
