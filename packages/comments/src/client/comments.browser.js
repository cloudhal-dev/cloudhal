/**
 * The comments module (RFC-0007 §8.2), served first-party as `/_cloudhal/c.<hash>.js` and loaded
 * only on pages with an open thread. It enhances the server-rendered section
 * (`[data-cloudhal-comments]`), whose plain HTML forms work without it:
 *
 * 1. when the reader focuses a form, it fetches a challenge and solves it in the dedicated worker
 *    (`__CLOUDHAL_SOLVER__`, replaced at build time with its hashed URL) — or, with Turnstile on,
 *    loads Cloudflare's widget with the form's action;
 * 2. on submit it posts JSON (waiting for the proof if needed, and at least 3 s after the challenge
 *    was issued, the server's minimum fill time) and shows the reader's own comment inline with an
 *    "awaiting moderation" badge, built from what they typed (nothing is fetched back);
 * 3. "Reply" moves the form under a comment and sets `parentId`;
 * 4. "More comments" loads the next page (the same cached HTML) in place;
 * 5. outcomes show the section's own notes (`#comment-pending`, …) and are announced in a polite
 *    live region.
 *
 * It stores nothing on the device, sets no cookie and sends no identifier. Every step is wrapped,
 * so it never throws into the page; when anything fails the plain form still posts.
 */
/* global __CLOUDHAL_SOLVER__ */

const ROOT = "/__cloudhal/comments";
const TURNSTILE = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** Errors the server answers → the note that explains them (§6.3). */
const NOTES = {
  invalid: "comment-invalid",
  closed: "comment-closed",
  rate_limited: "comment-slow-down",
  paused: "comment-paused",
  script_required: "comment-script-required",
};

const make = (tag, props) => Object.assign(document.createElement(tag), props);

/** @param {HTMLElement} section */
const enhance = (section) => {
  const text = section.dataset;
  const live = section.querySelector("[data-live]");
  const form = section.querySelector("form[data-kind=comment]");
  const home = document.createComment("");
  form?.before(home);
  const say = (message) => {
    if (live) live.textContent = message;
  };
  const note = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    location.replace(`#${id}`); // shows it (`:target`) and scrolls to it
    say(el.textContent.trim());
  };

  /** @type {WeakMap<HTMLFormElement, { until: number, ready: Promise<Record<string, string>> }>} */
  const proofs = new WeakMap();
  let turnstileApi;

  const pow = async (kind, target) => {
    const res = await fetch(`${ROOT}/challenge?node=${encodeURIComponent(target)}&for=${kind}`, {
      credentials: "omit",
    });
    if (!res.ok) throw new Error(String(res.status));
    const issued = Date.now();
    const { challenge, bits } = await res.json();
    const solution = await new Promise((resolve, reject) => {
      const worker = new Worker(__CLOUDHAL_SOLVER__, { type: "module" });
      worker.onmessage = (e) => {
        worker.terminate();
        resolve(e.data);
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ c: challenge, b: bits });
    });
    // the server drops solutions sooner than 3 s after issue (a person takes longer)
    const wait = issued + 3200 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return { challenge, solution };
  };

  const turnstile = async (f, kind) => {
    turnstileApi ??= new Promise((resolve, reject) => {
      const script = make("script", { src: TURNSTILE, async: true });
      script.onload = () => resolve(window.turnstile);
      script.onerror = reject;
      document.head.append(script);
    });
    const api = await turnstileApi;
    return new Promise((resolve, reject) => {
      const box = make("div");
      f.querySelector("[data-turnstile]")?.replaceChildren(box);
      api.render(box, {
        sitekey: text.sitekey,
        action: kind,
        "response-field": false,
        callback: (token) => resolve({ turnstileToken: token }),
        "error-callback": reject,
        "expired-callback": () => proofs.delete(f),
      });
    });
  };

  /** Starts (or reuses) the proof for a form; a proof is used once. */
  const prepare = (f) => {
    const current = proofs.get(f);
    if (current && current.until > Date.now()) return current.ready;
    const kind = f.dataset.kind;
    const target = f.elements.namedItem(kind === "report" ? "commentId" : "nodeId")?.value ?? "";
    const ready = text.protection === "turnstile" ? turnstile(f, kind) : pow(kind, target);
    // challenges live 10 minutes; ask for a fresh one a minute early
    proofs.set(f, { until: Date.now() + 540_000, ready });
    ready.catch(() => proofs.delete(f));
    return ready;
  };

  const cancelReply = () => {
    if (!form) return;
    home.after(form);
    form.elements.namedItem("parentId").value = "";
    for (const el of form.querySelectorAll("[data-replying],[data-cancel-reply]")) el.hidden = true;
  };

  /** The reader's own comment, inline, awaiting moderation (built from what they typed). */
  const showOwn = (body) => {
    const li = make("li", { className: "cloudhal-comment cloudhal-comment-own" });
    const article = li.appendChild(make("article"));
    article
      .appendChild(make("header", { className: "cloudhal-comment-meta" }))
      .append(
        make("strong", { className: "cloudhal-comment-author", textContent: body.name.trim() }),
        " ",
        make("span", { className: "cloudhal-comment-badge", textContent: text.pendingLabel }),
      );
    const content = article.appendChild(make("div", { className: "cloudhal-comment-body" }));
    for (const p of body.body.trim().split(/\n\s*\n/))
      content.append(make("p", { textContent: p.trim() }));
    const thread = body.parentId
      ? document.getElementById(`comment-${body.parentId}`)?.closest("[data-thread]")
      : null;
    let list = thread
      ? thread.querySelector("ol")
      : section.querySelector(".cloudhal-comment-list");
    if (!list && thread)
      list = thread.appendChild(make("ol", { className: "cloudhal-comment-replies" }));
    if (list) {
      list.hidden = false;
      list.append(li);
    }
  };

  const submit = async (f) => {
    if (f.dataset.busy) return;
    f.dataset.busy = "1";
    const button = f.querySelector("[type=submit]");
    const label = button?.textContent;
    if (button) button.textContent = text.sending;
    say(text.sending);
    for (const el of f.querySelectorAll("[aria-invalid]")) el.removeAttribute("aria-invalid");
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const body = { ...Object.fromEntries(new FormData(f)), ...(await prepare(f)) };
        proofs.delete(f);
        const res = await fetch(f.action, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          credentials: "omit",
        });
        const answer = await res.json().catch(() => ({}));
        if (res.ok) {
          if (f.dataset.kind === "report") {
            f.reset();
            f.closest("details")?.removeAttribute("open");
            return note("comment-reported");
          }
          showOwn(body);
          f.elements.namedItem("body").value = "";
          cancelReply();
          return note("comment-pending");
        }
        if (answer.error === "challenge_expired" && attempt === 0) continue;
        for (const name of answer.fields ?? [])
          f.elements.namedItem(name)?.setAttribute?.("aria-invalid", "true");
        return note(NOTES[answer.error] ?? "comment-try-again");
      }
    } catch {
      note("comment-try-again");
    } finally {
      delete f.dataset.busy;
      if (button) button.textContent = label;
    }
  };

  const more = async (link) => {
    const html = await (await fetch(link.href, { credentials: "omit" })).text();
    const next = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("[data-cloudhal-comments]");
    const list = section.querySelector(".cloudhal-comment-list");
    if (!next || !list) throw new Error("no comments");
    list.append(...next.querySelectorAll(".cloudhal-comment-list > li"));
    for (const b of list.querySelectorAll("[data-reply]")) b.hidden = !form;
    const after = next.querySelector("[data-more]")?.getAttribute("href");
    if (after) link.setAttribute("href", after);
    else link.closest("nav")?.remove();
  };

  section.addEventListener("focusin", (e) => {
    const f = e.target.closest?.("form[data-kind]");
    if (f) prepare(f).catch(() => {});
  });
  section.addEventListener("submit", (e) => {
    const f = e.target.closest?.("form[data-kind]");
    if (!f) return;
    e.preventDefault();
    submit(f);
  });
  section.addEventListener("click", (e) => {
    const reply = e.target.closest?.("[data-reply]");
    if (reply && form) {
      const li = document.getElementById(`comment-${reply.dataset.reply}`);
      li?.querySelector("article")?.after(form);
      form.elements.namedItem("parentId").value = reply.dataset.reply;
      const replying = form.querySelector("[data-replying]");
      if (replying) replying.textContent = `${text.replyLabel} ${reply.dataset.name ?? ""}`.trim();
      for (const el of form.querySelectorAll("[data-replying],[data-cancel-reply]"))
        el.hidden = false;
      form.elements.namedItem("body").focus();
    }
    if (e.target.closest?.("[data-cancel-reply]")) cancelReply();
    const link = e.target.closest?.("[data-more]");
    if (link) {
      e.preventDefault();
      more(link).catch(() => {
        location.href = link.href;
      });
    }
  });
  for (const b of section.querySelectorAll("[data-reply]")) b.hidden = !form;
};

try {
  const section = document.querySelector("[data-cloudhal-comments]");
  if (section) enhance(section);
} catch {}
