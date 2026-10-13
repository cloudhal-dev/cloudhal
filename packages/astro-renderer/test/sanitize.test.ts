/**
 * RFC-0012: HTML bodies are sanitized at render time — parsed like a browser (parse5), kept to an
 * allowlist, serialized by us. The vectors below are the classic ones (OWASP, mutation XSS) plus
 * the ones `SITE_CSP` does not stop (meta refresh, base, UI redress).
 */
import { describe, expect, it } from "vitest";
import { renderBody } from "../src/markdown.ts";
import { HTML_ALLOWLIST, sanitizeHtml } from "../src/sanitize.ts";

const clean = (html: string) => sanitizeHtml(html);

describe("sanitizeHtml (RFC-0012)", () => {
  it("keeps the allowlisted structure as it was", () => {
    const html =
      '<h2>Title</h2><p>Some <strong>bold</strong>, <em>em</em> and <a href="https://example.com/a?b=1&amp;c=2" title="t">a link</a>.</p>' +
      '<ul><li>one</li></ul><table><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table>' +
      '<figure><img src="/media/x.png" alt="x" width="10" height="5"><figcaption>c</figcaption></figure>' +
      "<details open><summary>More</summary><p>text</p></details>";
    // boolean attributes come back in their explicit form, which browsers read the same
    expect(clean(html)).toBe(html.replace("<details open>", '<details open="">'));
  });

  it("drops scripts, event handlers and dangerous URLs", () => {
    expect(clean('<p onclick="x()">a<script>alert(1)</script></p>')).toBe("<p>a</p>");
    expect(clean('<img src=x onerror="alert(1)">')).toBe('<img src="x">');
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="java\tscript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="//evil.example/">x</a>')).toBe("<a>x</a>");
    expect(clean('<a href="data:text/html,<script>alert(1)</script>">x</a>')).toBe("<a>x</a>");
    expect(clean('<img src="javascript:alert(1)">')).toBe("");
    expect(clean('<img src="data:image/svg+xml;base64,PHN2Zz4=">')).toBe("");
    expect(clean('<img src="data:image/png;base64,iVBORw0KGgo=" alt="">')).toBe(
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="">',
    );
    expect(clean('<video src="data:video/mp4;base64,AAAA" controls></video>')).toBe(
      '<video controls=""></video>',
    );
  });

  it("removes what CSP does not stop: meta refresh, base, forms, frames, inline style", () => {
    expect(clean('<meta http-equiv="refresh" content="0;url=https://evil.example">ok')).toBe("ok");
    expect(clean('<base href="https://evil.example/">ok')).toBe("ok");
    expect(
      clean('<form action="/__cloudhal/comments"><input name="q"><button>Go</button></form>ok'),
    ).toBe("ok");
    expect(clean('<iframe src="https://evil.example"></iframe>ok')).toBe("ok");
    expect(clean('<div style="position:fixed;inset:0">overlay</div>')).toBe("<div>overlay</div>");
    expect(clean("<style>body{display:none}</style>ok")).toBe("ok");
  });

  it("parses like a browser: mutation XSS and foreign content do not get through", () => {
    // noscript/style/comment confusion
    expect(clean('<noscript><p title="</noscript><img src=x onerror=alert(1)>">')).not.toMatch(
      /onerror/,
    );
    expect(clean("<!--><img src=x onerror=alert(1)>-->")).not.toMatch(/onerror/);
    // SVG and MathML never reach the page, whatever they wrap
    expect(clean('<svg><a xlink:href="javascript:alert(1)">x</a></svg>ok')).toBe("ok");
    expect(clean("<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>")).not.toMatch(
      /onerror|<img/,
    );
    // inside <svg>, <img> breaks out to HTML (as in browsers): kept as an image, without onerror
    expect(clean('<svg><style><img src=x onerror="alert(1)"></style></svg>')).toBe('<img src="x">');
    // unknown elements are unwrapped, their text kept and escaped
    expect(clean("<custom-el>a &lt;b&gt;</custom-el>")).toBe("a &lt;b&gt;");
  });

  it("escapes everything it writes, rewrites ids, adds rel to new-tab links", () => {
    expect(clean('<p title="a&quot; onmouseover=&quot;x">t</p>')).toBe(
      '<p title="a&quot; onmouseover=&quot;x">t</p>',
    );
    expect(clean('<h2 id="top">T</h2><p id="user-content-x">p</p>')).toBe(
      '<h2 id="user-content-top">T</h2><p id="user-content-x">p</p>',
    );
    expect(clean('<a href="https://example.com" target="_blank" rel="opener">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(clean('<a href="https://example.com" target="_top">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    );
    // a second leading newline in <pre> survives the browser dropping the first
    expect(clean("<pre>\n\ncode</pre>")).toBe("<pre>\n\ncode</pre>");
  });

  it("is what renderBody does with html bodies; markdown is unchanged", () => {
    expect(renderBody({ format: "html", value: "<p onclick=x>hi</p><script>1</script>" })).toBe(
      "<p>hi</p>",
    );
    expect(renderBody({ format: "markdown", value: "<b>raw</b>" })).toBe(
      "<p>&lt;b&gt;raw&lt;/b&gt;</p>\n",
    );
    expect(HTML_ALLOWLIST.elements.script).toBeUndefined();
    expect(HTML_ALLOWLIST.global).toContain("id");
  });

  it("is idempotent", () => {
    const once = clean(
      '<div id="a"><p>x<b>y</div><img src=/a.png><a target=_blank href=/b>z</a><pre>\n\nq</pre>',
    );
    expect(clean(once)).toBe(once);
  });
});
