/**
 * Visual check for Studio screens (DESIGN.md §8): opens each route in headless Chrome at the
 * given widths, saves a full-page PNG, and fails when a page scrolls sideways or logs a console
 * error. No dependencies: Chrome over the DevTools protocol (Node 24 has WebSocket).
 *
 *   STUDIO_URL=http://localhost:5173 STUDIO_EMAIL=… STUDIO_PASSWORD=… \
 *     pnpm design:shots -- --out .shots --widths 1440,390 /sites /sites/<id>/pages
 *
 * `SHOTS_PSEUDO=1` renders in the pseudo-locale ("[Šààṽéé]": accented, longer, bracketed) to find
 * hard-coded text and labels with no room for longer languages; `SHOTS_PSEUDO=rtl` in its
 * right-to-left variant (`dir="rtl"`), to find layouts that do not mirror (ADR-0033).
 *
 * Credentials are those of a local test account on your own dev server (never a real one);
 * without them only public routes (/login) render. `route@<js>` runs JS after load (open a dialog) and tags the file `_action`.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((p): p is string => Boolean(p));

interface Options {
  out: string;
  widths: number[];
  routes: string[];
  base: string;
  wait: number;
  /** `SHOTS_SCHEME=dark|light`: emulated colour scheme (default: the browser's, light). */
  scheme: "dark" | "light" | undefined;
  /** `SHOTS_LOCALE=tr`: Studio's language for the run. */
  locale: string | undefined;
  /** `SHOTS_PSEUDO=1|rtl`: the pseudo-locale or its right-to-left variant (dev server only). */
  pseudo: "1" | "rtl" | undefined;
}

function parse(argv: string[]): Options {
  const opts: Options = {
    out: ".shots",
    widths: [1440, 390],
    routes: [],
    base: process.env.STUDIO_URL ?? "http://localhost:5173",
    wait: Number(process.env.SHOTS_WAIT ?? 2000),
    scheme:
      process.env.SHOTS_SCHEME === "dark" || process.env.SHOTS_SCHEME === "light"
        ? process.env.SHOTS_SCHEME
        : undefined,
    locale: process.env.SHOTS_LOCALE || undefined,
    pseudo:
      process.env.SHOTS_PSEUDO === "1" || process.env.SHOTS_PSEUDO === "rtl"
        ? process.env.SHOTS_PSEUDO
        : undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--out") opts.out = argv[++i] as string;
    else if (a === "--widths") opts.widths = (argv[++i] as string).split(",").map(Number);
    else if (a !== "--") opts.routes.push(a);
  }
  if (opts.routes.length === 0) opts.routes = ["/login", "/sites"];
  return opts;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: { result?: unknown }) => void>();
  readonly errors: string[] = [];
  private ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)?.(m);
        this.pending.delete(m.id);
      } else if (m.method === "Runtime.exceptionThrown") {
        this.errors.push(m.params.exceptionDetails?.exception?.description ?? "exception");
      } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        this.errors.push(
          m.params.args
            .map((x: { value?: unknown; description?: string }) => x.value ?? x.description)
            .join(" "),
        );
      }
    });
  }
  static async connect(url: string) {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.addEventListener("open", r));
    return new Cdp(ws);
  }
  send(method: string, params: Record<string, unknown> = {}) {
    return new Promise<{ result?: unknown }>((resolve) => {
      const id = ++this.id;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate<T>(expression: string): Promise<T> {
    const r = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as { result?: { result?: { value?: T } } };
    return r.result?.result?.value as T;
  }
  close() {
    this.ws.close();
  }
}

async function launch(width: number): Promise<{ chrome: ChildProcess; cdp: Cdp }> {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("Chrome not found; set CHROME_PATH");
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome = spawn(
    exe,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${path.join(tmpdir(), `cloudhal-shots-${port}`)}`,
      "--no-first-run",
      "--hide-scrollbars",
      `--window-size=${width},900`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 50; i++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Array<{
        type: string;
        webSocketDebuggerUrl: string;
      }>;
      const page = targets.find((t) => t.type === "page");
      if (page) return { chrome, cdp: await Cdp.connect(page.webSocketDebuggerUrl) };
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  chrome.kill();
  throw new Error("Chrome did not start");
}

async function shoot(opts: Options, width: number): Promise<string[]> {
  const problems: string[] = [];
  const height = width < 768 ? 844 : 900;
  const { chrome, cdp } = await launch(width);
  const metrics = (h: number) =>
    cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: h,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
  try {
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await metrics(height);
    // SHOTS_SCHEME=dark renders the dark theme (Studio follows prefers-color-scheme).
    if (opts.scheme)
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: opts.scheme }],
      });
    if (process.env.STUDIO_EMAIL && process.env.STUDIO_PASSWORD) {
      await cdp.send("Page.navigate", { url: `${opts.base}/login` });
      await sleep(1500);
      const body = JSON.stringify({
        email: process.env.STUDIO_EMAIL,
        password: process.env.STUDIO_PASSWORD,
      });
      const status = await cdp.evaluate<number>(
        `fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(body)}}).then(r=>r.status)`,
      );
      if (status !== 200) problems.push(`sign-in failed (${status})`);
    }
    // SHOTS_LOCALE=tr picks Studio's language, SHOTS_PSEUDO=1 the pseudo-locale (stored per
    // browser, read on load; the pseudo-locale exists on a dev server only).
    if (opts.locale || opts.pseudo) {
      if (!process.env.STUDIO_EMAIL) {
        await cdp.send("Page.navigate", { url: `${opts.base}/login` });
        await sleep(800);
      }
      if (opts.locale)
        await cdp.evaluate(
          `localStorage.setItem('cloudhal.studio.locale', ${JSON.stringify(opts.locale)})`,
        );
      if (opts.pseudo)
        await cdp.evaluate(
          `localStorage.setItem('cloudhal.studio.pseudo', ${JSON.stringify(opts.pseudo)})`,
        );
    }
    for (const route of opts.routes) {
      const [p, action] = route.split("@") as [string, string | undefined];
      cdp.errors.length = 0;
      await cdp.send("Page.navigate", { url: `${opts.base}${p}` });
      await sleep(opts.wait);
      if (action) {
        await cdp.evaluate(action);
        await sleep(800);
      }
      // Studio scrolls its content column, not the document: measure the tallest scroller.
      const full = await cdp.evaluate<number>(
        `Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll('*')].filter(e=>{const s=getComputedStyle(e);return (s.overflowY==='auto'||s.overflowY==='scroll')&&e.scrollHeight>e.clientHeight}).map(e=>e.scrollHeight))`,
      );
      await metrics(Math.min(Math.max(full ?? height, height), 8000));
      await sleep(400);
      const overflow = await cdp.evaluate<boolean>(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth",
      );
      const shot = (await cdp.send("Page.captureScreenshot", { format: "png" })) as {
        result?: { data?: string };
      };
      const tag = `${opts.scheme ? `_${opts.scheme}` : ""}${opts.locale ? `_${opts.locale}` : ""}${opts.pseudo ? (opts.pseudo === "rtl" ? "_pseudo-rtl" : "_pseudo") : ""}`;
      const name = `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}${action ? "_action" : ""}${tag}_${width}.png`;
      const file = path.join(opts.out, name);
      writeFileSync(file, Buffer.from(shot.result?.data ?? "", "base64"));
      const notes = [
        overflow ? "horizontal overflow" : "",
        cdp.errors.length ? `console: ${cdp.errors[0]?.split("\n")[0]}` : "",
      ].filter(Boolean);
      console.log(
        `${notes.length ? "✗" : "✓"} ${file}${notes.length ? `  ${notes.join("; ")}` : ""}`,
      );
      if (notes.length) problems.push(`${p} @${width}: ${notes.join("; ")}`);
      await metrics(height);
    }
  } finally {
    cdp.close();
    chrome.kill();
  }
  return problems;
}

const opts = parse(process.argv.slice(2));
mkdirSync(opts.out, { recursive: true });
const problems: string[] = [];
for (const w of opts.widths) problems.push(...(await shoot(opts, w)));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
