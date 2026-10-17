/**
 * Where each message of a catalog module sits in its source (for RFC-0032 codemods): the key path
 * (`menus.save.summary`), the decoded value and the span of its whole entry (from the start of the
 * key's line to the end of the line with its comma). Catalogs are `export const … = { … }` object
 * literals of strings, so a small scanner is enough.
 */
export interface CatalogEntry {
  path: string;
  value: string;
  /** Start of the line holding the key. */
  lineStart: number;
  /** Where the key itself starts (after the indentation). */
  keyStart: number;
  /** End of the entry, after its trailing comma and newline. */
  lineEnd: number;
}

class Scanner {
  i = 0;
  readonly src: string;
  readonly entries: CatalogEntry[] = [];
  constructor(src: string) {
    this.src = src;
  }

  skip() {
    for (;;) {
      while (/\s/.test(this.src[this.i] ?? "")) this.i++;
      if (this.src.startsWith("//", this.i)) this.i = this.src.indexOf("\n", this.i);
      else if (this.src.startsWith("/*", this.i)) this.i = this.src.indexOf("*/", this.i) + 2;
      else return;
      if (this.i < 0) this.i = this.src.length;
    }
  }

  /** A string literal at `i`: its decoded value; `i` moves past it. */
  string(): string {
    const quote = this.src[this.i] as string;
    let j = this.i + 1;
    while (this.src[j] !== quote) j += this.src[j] === "\\" ? 2 : 1;
    const body = this.src.slice(this.i + 1, j);
    this.i = j + 1;
    return quote === '"'
      ? (JSON.parse(`"${body}"`) as string)
      : JSON.parse(`"${body.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
  }

  key(): string {
    const ch = this.src[this.i];
    if (ch === '"' || ch === "'") return this.string();
    const m = /[\w$]+/y;
    m.lastIndex = this.i;
    const found = m.exec(this.src);
    if (!found) throw new Error(`expected a key at ${this.i}`);
    this.i += found[0].length;
    return found[0];
  }

  object(prefix: string) {
    this.i++; // {
    for (;;) {
      this.skip();
      if (this.src[this.i] === "}") {
        this.i++;
        return;
      }
      const keyStart = this.i;
      const lineStart = this.src.lastIndexOf("\n", keyStart - 1) + 1;
      const key = this.key();
      this.skip();
      this.i++; // :
      this.skip();
      const path = `${prefix}${key}`;
      if (this.src[this.i] === "{") this.object(`${path}.`);
      else {
        const value = this.string();
        this.skip();
        if (this.src[this.i] === ",") this.i++;
        const nl = this.src.indexOf("\n", this.i);
        const lineEnd = nl < 0 ? this.src.length : nl + 1;
        this.entries.push({ path, value, lineStart, keyStart, lineEnd });
        continue;
      }
      this.skip();
      if (this.src[this.i] === ",") this.i++;
    }
  }
}

/** Every message of a catalog module, in source order. Lazy modules' paths start with their namespace. */
export function catalogEntries(source: string): CatalogEntry[] {
  const start = source.search(/export const \w+\s*(?::[^=]+)?=\s*\{/);
  if (start < 0) return [];
  const scanner = new Scanner(source);
  scanner.i = source.indexOf("{", source.indexOf("=", start));
  scanner.object("");
  return scanner.entries;
}
