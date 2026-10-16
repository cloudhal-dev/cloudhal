/**
 * Cloudhal's motion module (RFC-0024 §7): what CSS cannot do alone, for pages whose surfaces use
 * `motion`. A self-contained, versioned file under `/_cloudhal/` (CSP `script-src 'self'`), loaded
 * only by pages that need it; it never evaluates code and only adds classes, `hidden`-free state
 * and CSS custom properties (through the CSSOM).
 *
 * - **Reveals.** Content is complete without this module. Components already on screen play their
 *   entrance through `@starting-style` (pure CSS). Components below the first screen get the
 *   "before" state (`ch-pre`) only once the module runs, while still off screen, and lose it as
 *   they enter (IntersectionObserver), or at once if the reader scrolled past them before the module
 *   ran; `replay` puts it back when they leave downwards. Wipes
 *   and masks start fully clipped, which an observer never sees intersect, so their parent is
 *   watched instead.
 * - **Scroll stories.** A `Scrolly`'s step crossing the middle of the screen becomes the active one;
 *   its number goes to the surface's data through a `ch:set` event the interaction runtime takes
 *   (at every motion level: it is content, not movement).
 * - **Scroll effects without scroll-driven CSS** (Firefox today): `--ch-p` (0–1) on each element,
 *   written once a frame from passive scroll events, which the theme's fallback rules read.
 * - **Pointer effects.** `tilt`, `magnetic` and `spotlight` follow a fine pointer through
 *   `--ch-mx`/`--ch-my` (0–1), one write per frame.
 * - **Pause control.** `[data-ch-motion-toggle]` buttons pause loops and ambient effects for every
 *   page (`data-ch-motion-paused` on `<html>`, remembered when storage allows).
 *
 * Nothing moves when the page's level is `none` or the reader asks for reduced motion.
 */

const code = String.raw`const d=document,h=d.documentElement;
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const level=h.getAttribute("data-ch-motion")||"none";
const moving=!reduce&&level!=="none";
const KEY="ch-motion-paused";
let paused=false;try{paused=localStorage.getItem(KEY)==="1";}catch{}
const setPaused=(p)=>{paused=p;if(p)h.setAttribute("data-ch-motion-paused","");else h.removeAttribute("data-ch-motion-paused");
for(const b of d.querySelectorAll("[data-ch-motion-toggle]"))b.setAttribute("aria-pressed",String(p));
try{if(p)localStorage.setItem(KEY,"1");else localStorage.removeItem(KEY);}catch{}};
setPaused(paused);
d.addEventListener("click",(e)=>{const b=e.target instanceof Element&&e.target.closest("[data-ch-motion-toggle]");if(b)setPaused(!paused);});
if(moving&&"IntersectionObserver"in window){
const watch=new Map();
const io=new IntersectionObserver((es)=>{for(const e of es){for(const el of watch.get(e.target)||[]){
if(e.isIntersecting||e.boundingClientRect.bottom<=0){el.classList.remove("ch-pre");}
else if(el.hasAttribute("data-ch-replay")&&e.boundingClientRect.top>0)el.classList.add("ch-pre");}
if((e.isIntersecting||e.boundingClientRect.bottom<=0)&&!(watch.get(e.target)||[]).some((el)=>el.hasAttribute("data-ch-replay")))io.unobserve(e.target);}},{rootMargin:"0px 0px -6% 0px",threshold:0.1});
const fold=innerHeight;
for(const el of d.querySelectorAll("[data-ch-reveal]")){if(el.getBoundingClientRect().top<=fold)continue;
el.classList.add("ch-pre");
const clip=/^(wipe|mask)-/.test(el.getAttribute("data-ch-reveal")||"");
const at=clip&&el.parentElement?el.parentElement:el;
if(!watch.has(at))watch.set(at,[]);watch.get(at).push(el);io.observe(at);}}
for(const sc of d.querySelectorAll(".ch-scrolly[data-ch-step-path]")){
const steps=[...sc.children].filter((c)=>c.classList.contains("ch-step"));const path=sc.getAttribute("data-ch-step-path");
const root=sc.closest("[data-ch-surface]");if(!steps.length||!path||!root||!("IntersectionObserver"in window))continue;
sc.setAttribute("data-ch-live","");
const so=new IntersectionObserver((es)=>{for(const e of es){if(!e.isIntersecting)continue;const n=steps.indexOf(e.target)+1;
for(const s of steps)s.toggleAttribute("data-ch-active",s===e.target);sc.setAttribute("data-ch-current",String(n));
root.dispatchEvent(new CustomEvent("ch:set",{detail:{path,value:n}}));}},{rootMargin:"-45% 0px -45% 0px",threshold:0});
for(const s of steps)so.observe(s);}
if(moving&&!(window.CSS&&CSS.supports("animation-timeline: view()"))){
const els=[...d.querySelectorAll("[data-ch-scroll],.ch-progress")];
if(els.length){let raf=0;const tick=()=>{raf=0;const vh=innerHeight,sh=d.documentElement.scrollHeight;
for(const el of els){let p;
if(el.matches('.ch-progress[data-placement="page"]'))p=scrollY/Math.max(1,sh-vh);
else if(el.classList.contains("ch-progress")){const sec=el.closest(".ch-surface")||el.parentElement;const r=sec.getBoundingClientRect();p=-r.top/Math.max(1,r.height-vh);}
else{const r=el.getBoundingClientRect();if(r.bottom<-vh||r.top>2*vh)continue;p=(vh-r.top)/(vh+r.height);}
el.style.setProperty("--ch-p",Math.min(1,Math.max(0,p)).toFixed(4));}};
addEventListener("scroll",()=>{if(!raf)raf=requestAnimationFrame(tick);},{passive:true});addEventListener("resize",()=>{if(!raf)raf=requestAnimationFrame(tick);},{passive:true});tick();}}
if(moving&&matchMedia("(hover: hover) and (pointer: fine)").matches){
let raf=0,pending=null;
const apply=()=>{raf=0;if(!pending)return;const[el,x,y]=pending;pending=null;
el.style.setProperty("--ch-mx",x.toFixed(3));el.style.setProperty("--ch-my",y.toFixed(3));};
d.addEventListener("pointermove",(e)=>{const el=e.target instanceof Element&&e.target.closest('[data-ch-hover="tilt"],[data-ch-hover="magnetic"],[data-ch-hover="spotlight"]');
if(!el)return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;
pending=[el,Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];
if(!raf)raf=requestAnimationFrame(apply);},{passive:true});
d.addEventListener("pointerout",(e)=>{const el=e.target instanceof Element&&e.target.closest("[data-ch-hover]");
if(el&&!(e.relatedTarget instanceof Node&&el.contains(e.relatedTarget))){el.style.removeProperty("--ch-mx");el.style.removeProperty("--ch-my");}},{passive:true});}
`;

export const MOTION_SCRIPT = { path: "/_cloudhal/motion.2.js", code } as const;

/** Earlier names of the module, served with the current code (each version only adds). */
export const MOTION_SCRIPT_ALIASES = ["/_cloudhal/motion.1.js"] as const;
