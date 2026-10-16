/**
 * Cloudhal's ambient module (RFC-0024 §4): particle backgrounds for bands, drawn on a canvas under
 * the content. A self-contained, versioned file under `/_cloudhal/` (CSP `script-src 'self'`) the
 * motion module imports only when a page has a particle band, motion plays at `standard` or
 * above, and the device can afford it (no Save-Data, more than 2 GB of memory).
 *
 * Guards: device-pixel ratio capped at 2; particles scaled by the band's area and capped (120
 * with links, 400 without); 30 frames a second; no drawing while the band is off screen, the tab
 * is hidden or the reader has paused motion; colors read from the band's role variables
 * (`--ch-amb-1`, `--ch-amb-2`); twinkles and glows change slowly (never more than once a second),
 * so nothing flashes. The canvas is `aria-hidden` and ignores the pointer; `interactive` bands
 * push particles away from a fine pointer.
 */

const code = String.raw`const d=document,h=d.documentElement;
const fine=matchMedia("(hover: hover) and (pointer: fine)").matches;
const expressive=h.getAttribute("data-ch-motion")==="expressive";
const rnd=(a,b)=>a+Math.random()*(b-a);
const hex=(c,a)=>{const m=/^#([0-9a-f]{6})$/i.exec((c||"").trim());if(!m)return"rgba(128,128,128,"+a+")";const n=parseInt(m[1],16);return"rgba("+(n>>16)+","+((n>>8)&255)+","+(n&255)+","+a+")";};
const start=(cv)=>{const band=cv.parentElement;if(!band)return;const ctx=cv.getContext("2d");if(!ctx)return;
const preset=band.getAttribute("data-ch-preset")||"dots";const dens=band.getAttribute("data-ch-density")||"medium";
const cs=getComputedStyle(band);const c1=cs.getPropertyValue("--ch-amb-1"),c2=cs.getPropertyValue("--ch-amb-2");
const interactive=fine&&band.hasAttribute("data-ch-interactive");
let w=0,ht=0,dpr=1,ps=[],on=false,raf=0,last=0,mx=-1e4,my=-1e4;
const make=(fresh)=>{const n=Math.round(Math.min(preset==="links"?120:400,(w*ht/10000)*(dens==="low"?0.5:dens==="high"?1.6:1)*(expressive?1:0.6)));
ps=Array.from({length:n},(_,i)=>{const big=preset==="bubbles";return{x:rnd(0,w),y:fresh?rnd(0,ht):rnd(0,ht),r:big?rnd(4,14):preset==="fireflies"?rnd(1.5,3):rnd(0.8,2.4),
vx:preset==="snow"?rnd(-0.15,0.15):preset==="bubbles"?rnd(-0.1,0.1):rnd(-0.25,0.25),vy:preset==="snow"?rnd(0.3,0.9):preset==="bubbles"?rnd(-0.6,-0.2):rnd(-0.25,0.25),
c:i%2?c2:c1,p:rnd(0,Math.PI*2),s:rnd(0.6,1.4)};});};
const size=()=>{const r=band.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);w=Math.max(1,r.width);ht=Math.max(1,r.height);
cv.width=Math.round(w*dpr);cv.height=Math.round(ht*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);make(true);};
const frame=(t)=>{raf=0;if(!on)return;raf=requestAnimationFrame(frame);if(t-last<33)return;const dt=Math.min(3,(t-last)/16.7||1);last=t;
ctx.clearRect(0,0,w,ht);const sec=t/1000;
for(const q of ps){q.x+=q.vx*dt;q.y+=q.vy*dt;
if(preset==="snow")q.x+=Math.sin(sec*0.6+q.p)*0.2*dt;
if(interactive){const dx=q.x-mx,dy=q.y-my,dd=dx*dx+dy*dy;if(dd<8100&&dd>0.01){const f=(1-Math.sqrt(dd)/90)*1.6;q.x+=dx/Math.sqrt(dd)*f;q.y+=dy/Math.sqrt(dd)*f;}}
if(q.x<-20)q.x=w+20;else if(q.x>w+20)q.x=-20;if(q.y<-20)q.y=ht+20;else if(q.y>ht+20)q.y=-20;
let a=0.5;if(preset==="stars")a=0.25+0.45*(0.5+0.5*Math.sin(sec*q.s+q.p));else if(preset==="fireflies")a=0.3+0.5*(0.5+0.5*Math.sin(sec*0.8*q.s+q.p));else if(preset==="bubbles")a=0.35;
if(preset==="fireflies"){const g=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,q.r*5);g.addColorStop(0,hex(q.c,a));g.addColorStop(1,hex(q.c,0));ctx.fillStyle=g;ctx.beginPath();ctx.arc(q.x,q.y,q.r*5,0,6.2832);ctx.fill();continue;}
ctx.beginPath();ctx.arc(q.x,q.y,q.r,0,6.2832);
if(preset==="bubbles"){ctx.strokeStyle=hex(q.c,a);ctx.lineWidth=1;ctx.stroke();}else{ctx.fillStyle=hex(q.c,a);ctx.fill();}}
if(preset==="links"){ctx.lineWidth=1;for(let i=0;i<ps.length;i++){const a=ps[i];for(let j=i+1;j<ps.length;j++){const b=ps[j];const dx=a.x-b.x,dy=a.y-b.y,dd=dx*dx+dy*dy;
if(dd<12100){ctx.strokeStyle=hex(a.c,0.22*(1-Math.sqrt(dd)/110));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}}}};
let visible=false;
const sync=()=>{const run=visible&&!d.hidden&&!h.hasAttribute("data-ch-motion-paused");if(run&&!on){on=true;last=0;if(!raf)raf=requestAnimationFrame(frame);}else if(!run&&on){on=false;}};
new IntersectionObserver((es)=>{for(const e of es)visible=e.isIntersecting;sync();}).observe(band);
d.addEventListener("visibilitychange",sync);
new MutationObserver(sync).observe(h,{attributes:true,attributeFilter:["data-ch-motion-paused"]});
if("ResizeObserver"in window)new ResizeObserver(()=>size()).observe(band);
if(interactive){band.addEventListener("pointermove",(e)=>{const r=band.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;},{passive:true});
band.addEventListener("pointerleave",()=>{mx=-1e4;my=-1e4;},{passive:true});}
size();band.setAttribute("data-ch-ambient-live","");sync();};
for(const cv of d.querySelectorAll("canvas.ch-ambient"))start(cv);
`;

export const AMBIENT_SCRIPT = { path: "/_cloudhal/ambient.1.js", code } as const;
