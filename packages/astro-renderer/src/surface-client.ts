/**
 * The interaction runtime (RFC-0020 §4): one small first-party module under `/_cloudhal/`, so the
 * site's `script-src 'self'` stays as it is. A surface with inputs or button actions is rendered
 * complete on the server, with its data model in a `<script type="application/json"
 * data-ch-state>`; this module then keeps it live:
 *
 * - `data-ch-model="<pointer>"` inputs (Toggle, Select, Slider) write to the data;
 * - `data-ch-action='<json>'` buttons run a named action (set, toggle, increment, reset,
 *   navigate, copy, share, scrollTo);
 * - `data-ch-text='<value>'` elements show a binding or a named function's result as text;
 * - `data-ch-visible='<condition>'` elements are hidden while the condition is false.
 *
 * Nothing a model wrote is evaluated: values are JSON, functions are Cloudhal's fixed set (the
 * same as `@cloudhal/core-ts/surfaces`; a test keeps them equal), text goes in as `textContent`,
 * links must be same-site paths or https. Without JavaScript the page keeps its server state.
 *
 * Worker-safe: the code is a constant, written as a static asset by the build and served from
 * memory by `cloudhal dev`. The file name carries a version (`/_cloudhal/*` is immutable): bump it
 * with any change to the code; a test pins the code's hash to the version.
 */

const code = String.raw`const ptr=(p)=>p===""?[]:String(p).slice(1).split("/").map((s)=>s.replace(/~1/g,"/").replace(/~0/g,"~"));
const BAD=new Set(["__proto__","prototype","constructor"]);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const get=(d,p)=>{if(typeof p!=="string"||(p&&p[0]!=="/"))return undefined;let c=d;for(const s of ptr(p)){if(Array.isArray(c))c=/^\d+$/.test(s)?c[+s]:undefined;else if(c&&typeof c==="object"&&own(c,s))c=c[s];else return undefined;}return c;};
const put=(d,p,v)=>{if(typeof p!=="string"||p[0]!=="/")return;const k=ptr(p);if(!k.length||k.some((s)=>BAD.has(s)))return;let c=d;for(let i=0;i<k.length-1;i++){const s=k[i];if(c[s]===null||typeof c[s]!=="object")c[s]={};c=c[s];}c[k[k.length-1]]=v;};
const obj=(v)=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const isPath=(v)=>obj(v)&&typeof v.path==="string"&&Object.keys(v).length===1;
const isCall=(v)=>obj(v)&&typeof v.call==="string";
const txt=(v)=>v===undefined||v===null?"":String(v);
const num=(v)=>typeof v==="number"?v:typeof v==="string"?Number(v):NaN;
const fn=(name,a,loc)=>{const v=a.value;switch(name){
case"formatDate":{const d=new Date(txt(v));if(Number.isNaN(d.getTime()))return"";const st=["short","medium","long","full"].includes(txt(a.style))?txt(a.style):"medium";return new Intl.DateTimeFormat(loc,{dateStyle:st,timeZone:"UTC"}).format(d);}
case"formatNumber":{const n=num(v);if(!Number.isFinite(n))return"";const g=Math.min(Math.max(0,Math.trunc(num(a.digits===undefined?2:a.digits))||0),6);return new Intl.NumberFormat(loc,{maximumFractionDigits:g}).format(n);}
case"formatCurrency":{const n=num(v);const c=txt(a.currency).toUpperCase();if(!Number.isFinite(n)||!/^[A-Z]{3}$/.test(c))return"";try{return new Intl.NumberFormat(loc,{style:"currency",currency:c}).format(n);}catch{return"";}}
case"pluralize":{const n=num(a.count);return(n===1?txt(a.one):txt(a.other)).replace(/#/g,Number.isFinite(n)?String(n):"");}
case"concat":return(Array.isArray(a.parts)?a.parts:[]).map(txt).join("");
case"length":return Array.isArray(v)||typeof v==="string"?v.length:0;
case"required":return!(v===undefined||v===null||v===""||(Array.isArray(v)&&v.length===0));
case"minLength":return txt(v).length>=num(a.min);
case"maxLength":return txt(v).length<=num(a.max);
case"email":return/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/.test(txt(v));
case"range":{const n=num(v);return Number.isFinite(n)&&n>=num(a.min)&&n<=num(a.max);}}
return"";};
const val=(v,d,loc)=>{if(isPath(v))return get(d,v.path);if(isCall(v)){const a={};for(const[k,x]of Object.entries(obj(v.args)?v.args:{}))a[k]=Array.isArray(x)?x.map((y)=>val(y,d,loc)):val(x,d,loc);return fn(v.call,a,loc);}return v;};
const truthy=(v)=>!(v===undefined||v===null||v===false||v===0||v===""||(Array.isArray(v)&&v.length===0));
const cond=(c,d)=>{if(c===undefined)return true;if(isPath(c))return truthy(get(d,c.path));if(!obj(c))return false;const[op,a]=Object.entries(c)[0]||[];const o=(x)=>isPath(x)?get(d,x.path):x;
if(["eq","ne","gt","lt"].includes(op)&&Array.isArray(a)){const x=o(a[0]);const y=o(a[1]);if(op==="eq")return x===y;if(op==="ne")return x!==y;if(typeof x!==typeof y||(typeof x!=="number"&&typeof x!=="string"))return false;return op==="gt"?x>y:x<y;}
if(op==="and"&&Array.isArray(a))return a.every((x)=>cond(x,d));if(op==="or"&&Array.isArray(a))return a.some((x)=>cond(x,d));if(op==="not")return!cond(a,d);return false;};
const safe=(h)=>typeof h==="string"&&/^(\/(?!\/)|#|https:\/\/)/.test(h)&&!/[\s<>"']/.test(h);
const json=(el,a)=>{try{return JSON.parse(el.getAttribute(a)||"null");}catch{return undefined;}};
const boot=(root)=>{const s=root.querySelector("script[data-ch-state]");if(!s||root.hasAttribute("data-ch-live"))return;root.setAttribute("data-ch-live","");
let init;try{init=JSON.parse(s.textContent||"{}");}catch{return;}let d=structuredClone(init);const loc=document.documentElement.lang||"en";
const render=()=>{for(const el of root.querySelectorAll("[data-ch-text]"))el.textContent=txt(val(json(el,"data-ch-text"),d,loc));
for(const el of root.querySelectorAll("[data-ch-visible]"))el.hidden=!cond(json(el,"data-ch-visible"),d);
for(const el of root.querySelectorAll("[data-ch-model]")){const v=get(d,el.getAttribute("data-ch-model"));if(el.type==="radio")el.checked=el.value===txt(v);else if(v!==undefined&&document.activeElement!==el)el.value=txt(v);}};
const write=(e)=>{const el=e.target instanceof Element?e.target.closest("[data-ch-model]"):null;if(!el||!root.contains(el)||(el.type==="radio"&&!el.checked))return;put(d,el.getAttribute("data-ch-model"),el.type==="range"||el.type==="number"?num(el.value):el.value);render();};
root.addEventListener("input",write);root.addEventListener("change",write);
root.addEventListener("click",(e)=>{const el=e.target instanceof Element?e.target.closest("[data-ch-action]"):null;if(!el||!root.contains(el))return;const a=json(el,"data-ch-action");if(!obj(a))return;e.preventDefault();
switch(a.action){case"set":put(d,a.path,a.value);break;
case"toggle":put(d,a.path,!truthy(get(d,a.path)));break;
case"increment":{const n=num(get(d,a.path));const by=num(a.by);put(d,a.path,(Number.isFinite(n)?n:0)+(Number.isFinite(by)?by:1));break;}
case"reset":d=structuredClone(init);break;
case"navigate":if(safe(a.href))location.assign(a.href);return;
case"copy":navigator.clipboard?.writeText(txt(a.value)).catch(()=>{});return;
case"share":if(navigator.share)navigator.share({title:document.title,url:location.href}).catch(()=>{});else navigator.clipboard?.writeText(location.href).catch(()=>{});return;
case"scrollTo":document.getElementById(txt(a.anchor))?.scrollIntoView({behavior:"smooth",block:"start"});return;
default:return;}
render();});
render();};
for(const root of document.querySelectorAll("[data-ch-surface]"))boot(root);
`;

export const SURFACE_SCRIPT = { path: "/_cloudhal/surface.1.js", code } as const;

/** JSON for a `<script type="application/json">`: nothing in it can end the element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value ?? {})
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
