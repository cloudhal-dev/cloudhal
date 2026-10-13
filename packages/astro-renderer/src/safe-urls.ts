/**
 * The URL checks every renderer path shares: markdown links and images, section images and CTAs,
 * SEO images, and the HTML body sanitizer (RFC-0012).
 */

/**
 * Link targets markdown may produce. Everything else (javascript:, data:, vbscript:, …) is dropped.
 * The check runs on what a browser would parse (WHATWG URL): C0 controls and spaces trimmed at the
 * ends, tabs and newlines removed anywhere (`java\tscript:` is `javascript:`), and a backslash read
 * as a slash, so `/\host` and `\\host` are protocol-relative like `//host`.
 */
export function safeHref(href: string): string | undefined {
  const value = asParsed(href);
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || /^[/\\]{2}/.test(value)) return undefined;
  return value; // relative path, fragment or query
}

/** A URL as a browser reads it: no tabs or newlines, no C0 controls or spaces at either end. */
function asParsed(href: string): string {
  const value = href.replace(/[\t\n\r]/g, "");
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start++;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end--;
  return value.slice(start, end);
}

/** Image sources: what `safeHref` allows (no mailto/tel) plus raster data: URLs. */
export function safeSrc(src: string): string | undefined {
  const value = src.trim();
  if (/^data:image\/(png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  const safe = safeHref(value);
  return safe && !/^(mailto|tel):/i.test(safe) ? safe : undefined;
}
