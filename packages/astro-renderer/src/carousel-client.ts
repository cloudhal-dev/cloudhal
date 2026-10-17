/**
 * Cloudhal's carousel module (RFC-0027 27b): what a carousel needs beyond scroll snap. A
 * self-contained, versioned file under `/_cloudhal/` (CSP `script-src 'self'`), loaded only by
 * surfaces with a `Carousel`. Without it every slide is still reachable by scrolling and by the
 * marker links; with it:
 *
 * - The arrows appear (`data-ch-pending` goes) and move by a slide (hero) or by what is in view
 *   (rail), through `scrollIntoView` (the browser handles right-to-left and the site's
 *   `scroll-behavior`); at the ends they say so (`aria-disabled`).
 * - The current slide is tracked (from the slides' boxes on `scroll` and `scrollend`) and shown on its marker
 *   (`aria-current`); a marker click scrolls the track instead of jumping the page or the hash.
 * - After the reader moves, a polite live region names the slide ("2 of 5").
 * - A hero's slides out of view are `inert`, so Tab never lands on what cannot be seen.
 * No scroll hijacking: swipe and wheel stay native.
 */

const code = String.raw`const d=document;
for(const box of d.querySelectorAll(".ch-carousel")){const track=box.querySelector(".ch-carousel__track");if(!track)continue;
const slides=[...track.children].filter((e)=>e.classList.contains("ch-carousel__slide"));if(!slides.length)continue;
const hero=box.getAttribute("data-variant")==="hero";const prev=box.querySelector('[data-ch-carousel="prev"]'),next=box.querySelector('[data-ch-carousel="next"]');
const marks=[...box.querySelectorAll(".ch-carousel__markers a")];let seen=new Set(),current=0,said=false,timer=0;
const live=d.createElement("p");live.className="sr-only";live.setAttribute("aria-live","polite");box.append(live);
const measure=()=>{const r=track.getBoundingClientRect();seen=new Set(slides.filter((s)=>{const b=s.getBoundingClientRect();const w=Math.min(b.right,r.right)-Math.max(b.left,r.left);return b.width>0&&w/b.width>=0.6;}));};
const sync=()=>{measure();const shown=slides.map((s,i)=>seen.has(s)?i:-1).filter((i)=>i>=0);if(shown.length)current=shown[0];
const last=shown.length?shown[shown.length-1]:current;
marks.forEach((m,i)=>{if(i===current)m.setAttribute("aria-current","true");else m.removeAttribute("aria-current");});
if(prev)prev.setAttribute("aria-disabled",String(current<=0));if(next)next.setAttribute("aria-disabled",String(last>=slides.length-1));
if(hero)slides.forEach((s,i)=>{s.inert=i!==current;});
if(said){said=false;live.textContent=slides[current].getAttribute("aria-label")||"";}};
track.addEventListener("scroll",()=>{clearTimeout(timer);timer=setTimeout(sync,90);},{passive:true});
track.addEventListener("scrollend",()=>{clearTimeout(timer);sync();});
addEventListener("resize",()=>{clearTimeout(timer);timer=setTimeout(sync,90);},{passive:true});
const go=(i)=>{const to=slides[Math.max(0,Math.min(slides.length-1,i))];said=true;to.scrollIntoView({block:"nearest",inline:"start"});clearTimeout(timer);timer=setTimeout(sync,400);};
const page=()=>{measure();return Math.max(1,slides.filter((s)=>seen.has(s)).length);};
for(const [b,dir] of [[prev,-1],[next,1]]){if(!b)continue;b.removeAttribute("data-ch-pending");
b.addEventListener("click",()=>{if(b.getAttribute("aria-disabled")==="true")return;go(current+dir*(hero?1:page()));});}
marks.forEach((m,i)=>m.addEventListener("click",(e)=>{e.preventDefault();go(i);}));
sync();}
`;

export const CAROUSEL_SCRIPT = { path: "/_cloudhal/carousel.1.js", code } as const;
