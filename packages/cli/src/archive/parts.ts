/**
 * NDJSON parts (RFC-0039 §1): one JSON row per line, a new part every 8 MB. A row's line is
 * `JSON.stringify(row)` and a newline; JSON.stringify never writes a raw newline, so the rows of a
 * part are exactly its newlines. The writer and the reader count them the same way.
 */
import { ArchiveError, type ArchiveErrorCode } from "./errors.ts";
import { ARCHIVE_LIMITS, PART_SPLIT_BYTES } from "./limits.ts";

const LF = 0x0a;
const encoder = new TextEncoder();

export interface NdjsonSplitOptions {
  /** Start a new part when the next line would cross this size (default 8 MiB). */
  partBytes?: number;
  /** Refuse a line above this size (default: the reader's part cap, 16 MiB). */
  maxLineBytes?: number;
}

function encodeLine(row: unknown, index: number): Uint8Array {
  const text = JSON.stringify(row);
  if (text === undefined)
    throw new ArchiveError("invalid_input", `row ${index} has no JSON form (${typeof row})`);
  return encoder.encode(`${text}\n`);
}

/**
 * `rows` as NDJSON parts, in the given order (the caller sorts): a new part when the current one
 * is not empty and the next line would take it above `partBytes`. A line larger than `partBytes`
 * goes alone in its own part; a line above `maxLineBytes` is refused. No rows give no parts.
 */
export function splitNdjson(
  rows: Iterable<unknown>,
  options: NdjsonSplitOptions = {},
): Uint8Array[] {
  const partBytes = options.partBytes ?? PART_SPLIT_BYTES;
  const maxLine = options.maxLineBytes ?? ARCHIVE_LIMITS.partBytes;
  const parts: Uint8Array[] = [];
  let lines: Uint8Array[] = [];
  let size = 0;
  let index = 0;
  for (const row of rows) {
    const line = encodeLine(row, index);
    if (line.length > maxLine)
      throw new ArchiveError(
        "too_large",
        `row ${index} is ${line.length} bytes as JSON, above the ${maxLine}-byte part cap`,
      );
    if (size > 0 && size + line.length > partBytes) {
      parts.push(Buffer.concat(lines, size));
      lines = [];
      size = 0;
    }
    lines.push(line);
    size += line.length;
    index++;
  }
  if (size > 0) parts.push(Buffer.concat(lines, size));
  return parts;
}

/** `rows` as one NDJSON file (`ledger.ndjson`), refused above `maxBytes`. */
export function encodeNdjson(
  rows: Iterable<unknown>,
  maxBytes: number = ARCHIVE_LIMITS.partBytes,
): Uint8Array {
  const lines: Uint8Array[] = [];
  let size = 0;
  let index = 0;
  for (const row of rows) {
    const line = encodeLine(row, index++);
    size += line.length;
    if (size > maxBytes)
      throw new ArchiveError("too_large", `the rows are above ${maxBytes} bytes as NDJSON`);
    lines.push(line);
  }
  return Buffer.concat(lines, size);
}

/**
 * The rows of an NDJSON file: its newlines. An empty file, an empty line or a missing final
 * newline is refused with `code` (`damaged` when reading, `invalid_input` when writing).
 */
export function countRows(
  bytes: Uint8Array,
  path: string,
  code: ArchiveErrorCode = "damaged",
): number {
  if (bytes.length === 0 || bytes[bytes.length - 1] !== LF)
    throw new ArchiveError(code, `${path}: not NDJSON (empty, or no final newline)`, { path });
  let rows = 0;
  let previous = -1;
  for (let i = bytes.indexOf(LF); i >= 0; i = bytes.indexOf(LF, i + 1)) {
    if (i === previous + 1) throw new ArchiveError(code, `${path}: has an empty line`, { path });
    previous = i;
    rows++;
  }
  return rows;
}
