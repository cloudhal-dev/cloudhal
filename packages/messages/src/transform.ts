/**
 * Compiles the messages of one catalog module's source (RFC-0032 §2): every string literal whose
 * value is more than text and `{name}` arguments is replaced by its compiled data (JSON), the rest
 * of the file is untouched. Catalogs are object literals of strings, so a small tokenizer that
 * skips comments and knows JS string escapes is enough — no JavaScript parser.
 */
import { compileMessage, MessageSyntaxError } from "./compile.ts";

export class CatalogError extends Error {
  override readonly name = "CatalogError";
}

/** The decoded value of a JS string literal's body (between its quotes). */
function decode(body: string): string {
  return body.replace(
    /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g,
    (_m, e: string) => {
      if (e.startsWith("u{")) return String.fromCodePoint(Number.parseInt(e.slice(2, -1), 16));
      if (e[0] === "u" || e[0] === "x") return String.fromCharCode(Number.parseInt(e.slice(1), 16));
      const simple: Record<string, string> = {
        n: "\n",
        t: "\t",
        r: "\r",
        b: "\b",
        f: "\f",
        v: "\v",
        "0": "\0",
      };
      if (e === "\n" || e === "\r\n" || e === " " || e === " ") return "";
      return simple[e] ?? e;
    },
  );
}

const line = (src: string, at: number) => src.slice(0, at).split("\n").length;

/** Where the comment starting at `i` ends, or `undefined` when no comment starts there. */
function commentEnd(source: string, i: number): number | undefined {
  if (source[i] !== "/") return undefined;
  if (source[i + 1] === "/") {
    const end = source.indexOf("\n", i);
    return end < 0 ? source.length : end;
  }
  if (source[i + 1] === "*") {
    const end = source.indexOf("*/", i + 2);
    return end < 0 ? source.length : end + 2;
  }
  return undefined;
}

/** The literal's replacement (compiled JSON), or `undefined` when it stays as written. */
function compileLiteral(value: string, where: string): string | undefined {
  let compiled: ReturnType<typeof compileMessage>;
  try {
    compiled = compileMessage(value);
  } catch (error) {
    const offset = error instanceof MessageSyntaxError ? `, offset ${error.offset}` : "";
    throw new CatalogError(
      `${where}: invalid message${offset}: ${(error as Error).message}\n  ${value}`,
    );
  }
  return typeof compiled === "string" && compiled === value ? undefined : JSON.stringify(compiled);
}

/**
 * `source` with its messages compiled, or the same string when nothing needed it. `file` names
 * errors: a message that does not parse fails the build with its file, line and offset.
 */
export function compileCatalogSource(source: string, file: string): string {
  let out = "";
  let last = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const comment = commentEnd(source, i);
    if (comment !== undefined) {
      i = comment;
      continue;
    }
    if (ch === "`")
      throw new CatalogError(
        `${file}:${line(source, i)}: template literals are not allowed in catalogs`,
      );
    if (ch !== '"' && ch !== "'") {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < source.length && source[j] !== ch) j += source[j] === "\\" ? 2 : 1;
    const replacement = compileLiteral(
      decode(source.slice(i + 1, j)),
      `${file}:${line(source, i)}`,
    );
    if (replacement !== undefined) {
      out += source.slice(last, i) + replacement;
      last = j + 1;
    }
    i = j + 1;
  }
  return last === 0 ? source : out + source.slice(last);
}
