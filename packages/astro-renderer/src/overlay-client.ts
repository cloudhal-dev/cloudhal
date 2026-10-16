/**
 * Cloudhal's overlay module (RFC-0025 §3): what overlays need beyond the platform. A self-contained,
 * versioned file under `/_cloudhal/` (CSP `script-src 'self'`), loaded only by surfaces with an
 * overlay. The overlays themselves are native: `<dialog>` opened by Invoker Commands
 * (`command="show-modal"`), popovers by `popovertarget`, tooltips by `interestfor`; this module
 * fills the gaps of older browsers and adds what the platform does not do.
 *
 * - Invoker Commands for browsers before December 2025 (`show-modal`, `close`, `--next`/`--prev`).
 * - A dialog's fallback link (`a[data-ch-open]`) opens the dialog instead of its page.
 * - `closedby` where it is missing (Safari): a click on the backdrop closes `any` dialogs, and
 *   Escape never closes an `explicit` one (`closedby="none"`).
 * - `aria-expanded` on every trigger, kept in step with its overlay.
 * - Lightboxes: a thumbnail opens its image; previous, next and the arrow keys move through them.
 * - Tooltips on focus and hover where `interestfor` is missing; Escape hides them.
 * - Popovers and tooltips placed next to their trigger where CSS anchor positioning is missing.
 */

const code = String.raw`const d=document,B=HTMLButtonElement.prototype,D=window.HTMLDialogElement&&HTMLDialogElement.prototype;
const anchored=!!(window.CSS&&CSS.supports("position-area","bottom"));
const byId=(id)=>id?d.getElementById(id):null;
const place=(p,el,above)=>{if(anchored||!el)return;const r=el.getBoundingClientRect();p.style.position="fixed";p.style.margin="0";p.style.inset="auto";
const top=above?r.top-p.offsetHeight-8:r.bottom+8;p.style.top=Math.round(Math.max(8,Math.min(top,innerHeight-p.offsetHeight-8)))+"px";
p.style.left=Math.round(Math.max(8,Math.min(r.left,innerWidth-p.offsetWidth-8)))+"px";};
const isOpen=(t)=>!!t.open||(t.matches&&t.matches(":popover-open"));
const triggers=(t)=>d.querySelectorAll('[commandfor="'+t.id+'"]:not([command="close"]),[popovertarget="'+t.id+'"]:not([popovertargetaction="hide"]),[data-ch-open="'+t.id+'"],[data-ch-lightbox="'+t.id+'"]');
const sync=(t)=>{for(const b of triggers(t))b.setAttribute("aria-expanded",String(isOpen(t)));};
if(D&&!("commandForElement"in B))d.addEventListener("click",(e)=>{const b=e.target instanceof Element&&e.target.closest("button[commandfor]");if(!b||b.disabled)return;
const t=byId(b.getAttribute("commandfor")),c=b.getAttribute("command")||"";if(!t)return;
if(c==="show-modal"&&t.showModal&&!t.open)t.showModal();else if(c==="close"&&t.close)t.close();
else if(c.startsWith("--")){const ev=new Event("command");ev.command=c;ev.source=b;t.dispatchEvent(ev);}});
for(const a of d.querySelectorAll("a[data-ch-open]"))a.addEventListener("click",(e)=>{const t=byId(a.getAttribute("data-ch-open"));if(t&&t.showModal){e.preventDefault();t.showModal();}});
for(const t of d.querySelectorAll("dialog.ch-dialog")){sync(t);new MutationObserver(()=>sync(t)).observe(t,{attributes:true,attributeFilter:["open"]});
if(D&&!("closedBy"in D)){if(t.getAttribute("closedby")==="none")t.addEventListener("cancel",(e)=>e.preventDefault());
if(t.getAttribute("closedby")==="any")t.addEventListener("click",(e)=>{if(e.target!==t)return;const r=t.getBoundingClientRect();
if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)t.close();});}}
for(const p of d.querySelectorAll("[popover].ch-popover")){sync(p);p.addEventListener("toggle",(e)=>{sync(p);if(e.newState==="open")place(p,d.querySelector('[popovertarget="'+p.id+'"]'),p.getAttribute("data-placement")==="top");});}
for(const box of d.querySelectorAll("dialog.ch-lightbox__dialog")){const items=[...box.querySelectorAll(".ch-lightbox__item")],count=box.querySelector(".ch-lightbox__count");let at=0;
const show=(i)=>{if(!items.length)return;at=(i+items.length)%items.length;items.forEach((f,k)=>{f.hidden=k!==at;});if(count)count.textContent=(at+1)+" / "+items.length;};
box.addEventListener("command",(e)=>{if(e.command==="--next")show(at+1);else if(e.command==="--prev")show(at-1);});
box.addEventListener("keydown",(e)=>{if(e.key==="ArrowRight")show(at+1);else if(e.key==="ArrowLeft")show(at-1);});
for(const a of d.querySelectorAll('a[data-ch-lightbox="'+box.id+'"]'))a.addEventListener("click",(e)=>{if(!box.showModal)return;e.preventDefault();show(Number(a.getAttribute("data-index"))||0);box.showModal();});}
if(!("interestForElement"in B))for(const el of d.querySelectorAll("[interestfor]")){const tip=byId(el.getAttribute("interestfor"));if(!tip||!tip.showPopover)continue;let timer=0;
const on=()=>{clearTimeout(timer);if(isOpen(tip))return;try{tip.showPopover({source:el});}catch{try{tip.showPopover();}catch{}}place(tip,el,true);};
const off=()=>{clearTimeout(timer);timer=setTimeout(()=>{try{tip.hidePopover();}catch{}},120);};
el.addEventListener("mouseenter",on);el.addEventListener("focus",on);el.addEventListener("mouseleave",off);el.addEventListener("blur",off);
el.addEventListener("keydown",(e)=>{if(e.key==="Escape")off();});}
`;

export const OVERLAY_SCRIPT = { path: "/_cloudhal/overlay.1.js", code } as const;
