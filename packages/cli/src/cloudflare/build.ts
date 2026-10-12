import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Builds the project's Site Worker (`CLOUDHAL_TARGET=cloudflare astro build`). Output:
 * `dist/server/wrangler.json` (+ `entry.mjs`) and `dist/client` (static assets).
 */
export async function buildSiteWorker(
  projectDir: string,
  log: (line: string) => void = () => {},
): Promise<string> {
  const require = createRequire(path.join(projectDir, "package.json"));
  const astroBin = path.join(path.dirname(require.resolve("astro/package.json")), "bin/astro.mjs");
  const { VITEST: _v, NODE_ENV: _n, ...env } = process.env;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [astroBin, "build"], {
      cwd: projectDir,
      env: { ...env, CLOUDHAL_TARGET: "cloudflare" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      for (const line of chunk.toString().split("\n")) if (line.trim()) log(line);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`astro build failed (${code}):\n${output.slice(-4000)}`)),
    );
  });
  return path.join(projectDir, "dist/server/wrangler.json");
}
