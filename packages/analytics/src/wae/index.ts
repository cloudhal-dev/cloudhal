/**
 * @cloudhal/analytics/wae — Workers Analytics Engine adapters (RFC-0006 §4, §7.3). The site Worker
 * writes with `new WaeWriter(env.ANALYTICS)`; the admin Worker reads with
 * `new WaeReader(env.ANALYTICS_SQL, { dataset, budget })`. Worker-safe; no API token.
 */
export {
  type CompiledWaeQuery,
  compileWae,
  DATASET_RE,
  type WaeCompileOptions,
} from "./compile.ts";
export {
  ABSENT,
  BLOB,
  clsSlot,
  DOUBLE,
  fromDataPoint,
  toDataPoint,
  type WaeDataPoint,
  type WaeDataset,
} from "./layout.ts";
export { clearWaeCache, WaeReader, type WaeReaderOptions, type WaeSqlBinding } from "./reader.ts";
export { WaeWriter } from "./writer.ts";

/** The dataset name for a deployment: `<name>_events`, `-` → `_`, lower case (RFC-0006 §4). */
export function datasetName(deployment: string): string {
  const base = deployment
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || "cloudhal"}_events`;
}
