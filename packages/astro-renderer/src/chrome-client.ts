/**
 * Cloudhal's chrome module (RFC-0025 §2): what the header needs beyond CSS. A self-contained,
 * versioned file under `/_cloudhal/` (CSP `script-src 'self'`), loaded only by pages whose header
 * asks for it (a sticky, hiding, shrinking or transparent header, a drawer or full-screen menu,
 * submenus). Without it every page still works: the menu link opens `/menu`, submenus are
 * popovers the browser opens itself, and the header stays where CSS puts it.
 *
 * - `--ch-header-h` on the root follows the header's height (scroll padding, transparent heroes).
 * - `data-ch-scrolled` on the header once the page has scrolled (fill, shrink, stuck style).
 * - `hide-on-scroll` hides the header while the reader scrolls down and shows it on the way up,
 *   when keyboard focus is in it, and near the top; never at motion `none` or under reduced motion.
 * - The menu link (`[data-ch-dialog]`) opens its modal dialog instead of `/menu`; a click on the
 *   backdrop or on a link inside closes it, and the browser returns focus to the link.
 * - An open disclosure menu closes on Escape or a click elsewhere.
 * - Submenu popovers sit under their button where CSS anchor positioning is missing (a mega panel
 *   spans the page under the header instead).
 * - RFC-0025 25d: the announcement's close button and the consent bar's buttons, hidden without
 *   JavaScript, write the reader's choice to a first-party cookie (a year, `SameSite=Lax`) and
 *   mark the root as `prefs.1.js` does on the next page, so the bar goes at once and stays gone;
 *   `--ch-consent-h` keeps focused content clear of the consent bar.
 */

const code = String.raw`const d=document,h=d.documentElement,hd=d.querySelector(".ch-header");
const keep=(k,v)=>{d.cookie=k+"="+encodeURIComponent(v)+"; Max-Age=31536000; Path=/; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");};
for(const b of d.querySelectorAll("[data-ch-dismiss]")){b.hidden=false;b.addEventListener("click",()=>{const id=b.getAttribute("data-ch-dismiss")||"";
const m=/(?:^|;\s*)ch_dismiss=([^;]*)/.exec(d.cookie),old=m?decodeURIComponent(m[1]).split(",").filter(Boolean):[];
keep("ch_dismiss",[...old.filter((x)=>x!==id),id].slice(-5).join(","));h.setAttribute("data-ch-announcement-dismissed","");const main=d.getElementById("main");if(main)main.focus({preventScroll:true});});}
const bar=d.querySelector("[data-ch-consent-bar]");
if(bar){const setC=()=>h.style.setProperty("--ch-consent-h",(h.hasAttribute("data-ch-consent")?0:bar.offsetHeight)+"px");setC();
if("ResizeObserver"in window)new ResizeObserver(setC).observe(bar);
for(const b of bar.querySelectorAll("[data-ch-consent-choice]")){b.hidden=false;b.addEventListener("click",()=>{const v=b.getAttribute("data-ch-consent-choice")||"ok";keep("ch_consent",v);h.setAttribute("data-ch-consent",v);setC();});}}
if(hd){
const setH=()=>h.style.setProperty("--ch-header-h",hd.offsetHeight+"px");
setH();if("ResizeObserver"in window)new ResizeObserver(setH).observe(hd);
const quiet=()=>h.getAttribute("data-ch-motion")==="none"||matchMedia("(prefers-reduced-motion: reduce)").matches;
const hides=hd.getAttribute("data-behavior")==="hide-on-scroll";
let last=scrollY,ticking=false;
const sync=()=>{ticking=false;const y=Math.max(0,scrollY);
hd.toggleAttribute("data-ch-scrolled",y>4);
if(hides){const near=y<hd.offsetHeight*2,down=y>last+6,up=y<last-6;
if(quiet()||near||up||hd.querySelector(":focus-visible"))hd.removeAttribute("data-ch-hidden");else if(down)hd.setAttribute("data-ch-hidden","");}
last=y;};
addEventListener("scroll",()=>{if(!ticking){ticking=true;requestAnimationFrame(sync);}},{passive:true});
hd.addEventListener("focusin",()=>hd.removeAttribute("data-ch-hidden"));
sync();}
for(const a of d.querySelectorAll("a[data-ch-dialog]")){const dlg=d.getElementById(a.getAttribute("data-ch-dialog"));
if(!dlg||typeof dlg.showModal!=="function")continue;
a.setAttribute("role","button");a.setAttribute("aria-haspopup","dialog");a.setAttribute("aria-controls",dlg.id);
const open=(e)=>{e.preventDefault();dlg.showModal();a.setAttribute("aria-expanded","true");};
a.addEventListener("click",open);a.addEventListener("keydown",(e)=>{if(e.key===" ")open(e);});
dlg.addEventListener("close",()=>a.setAttribute("aria-expanded","false"));
dlg.addEventListener("click",(e)=>{if(e.target===dlg||(e.target instanceof Element&&e.target.closest("a[href]")))dlg.close();});}
const menus=[...d.querySelectorAll("details.ch-menu")];
if(menus.length){d.addEventListener("keydown",(e)=>{if(e.key!=="Escape")return;for(const m of menus)if(m.open){m.open=false;m.querySelector("summary")?.focus();}});
d.addEventListener("click",(e)=>{for(const m of menus)if(m.open&&!(e.target instanceof Node&&m.contains(e.target)))m.open=false;});}
if(!(window.CSS&&CSS.supports("anchor-name","--a"))){for(const p of d.querySelectorAll("[popover].ch-nav-menu__pop:not(.ch-nav-menu__pop--mega)")){
p.addEventListener("toggle",(e)=>{if(e.newState!=="open")return;const b=d.querySelector('[popovertarget="'+p.id+'"]');if(!b)return;
const r=b.getBoundingClientRect();p.style.position="fixed";p.style.margin="0";p.style.top=Math.round(r.bottom+6)+"px";
p.style.left=Math.round(Math.max(8,Math.min(r.left,innerWidth-p.offsetWidth-8)))+"px";});}}
`;

export const CHROME_SCRIPT = { path: "/_cloudhal/chrome.2.js", code } as const;
/** Earlier names, still asked for by cached pages: they get the current code. */
export const CHROME_SCRIPT_ALIASES = ["/_cloudhal/chrome.1.js"] as const;
