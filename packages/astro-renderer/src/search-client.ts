/**
 * Cloudhal's search module (RFC-0029 §6): the reader's search modal. A self-contained, versioned
 * file under `/_cloudhal/` (CSP `script-src 'self'`, `connect-src 'self'`), loaded only by pages of
 * deployments that answer searches. Without it nothing is lost: the header form and `/search` work
 * as plain HTML.
 *
 * The theme renders the markup and the words; this module only wires them:
 * - `dialog[data-ch-search]` with `data-endpoint` (`/search.json`), `data-page` (`/search`) and
 *   `data-words` (JSON: `kinds`, `all`, `none`, `recent`, `clear`, `limited`, `error`, `updating`,
 *   `count` as plural forms with `#`), holding `[data-ch-search-input]` (the combobox),
 *   `[data-ch-search-list]` (the listbox), `[data-ch-search-note]`, `[data-ch-search-status]` (a
 *   live region) and `[data-ch-search-close]`.
 * - Anything marked `[data-ch-search-open]` opens it (a link's click, a form field's focus), as do
 *   ⌘K / Ctrl+K and `/` outside text fields.
 *
 * Behaviour (WAI-ARIA combobox with a listbox popup): typing asks the endpoint after 200 ms and
 * cancels the request it replaces; hits come grouped by kind, each a link with its context and
 * a snippet the server escaped and marked; the last option is "all results" on `/search`. ↑↓ move
 * the active option (`aria-activedescendant`), Enter opens it (or the results page when none is
 * active), Escape (even in a search field, which would clear itself first) or a click on the
 * backdrop closes, and focus returns to the trigger (a header field takes it back without opening
 * the modal again).
 * Before typing, the last five searches show; they stay in this browser (`localStorage`) and a
 * button clears them. A `429` says to wait and links to the results page.
 */

const code = String.raw`const d=document,dlg=d.querySelector("dialog[data-ch-search]");
if(dlg&&dlg.showModal){
const $=(s)=>dlg.querySelector(s),input=$("[data-ch-search-input]"),list=$("[data-ch-search-list]"),note=$("[data-ch-search-note]"),status=$("[data-ch-search-status]");
let W={};try{W=JSON.parse(dlg.getAttribute("data-words")||"{}");}catch(e){}
const endpoint=dlg.getAttribute("data-endpoint")||"/search.json",page=dlg.getAttribute("data-page")||"/search";
const lang=d.documentElement.lang||"en",rules=new Intl.PluralRules(lang),KEY="ch_search_recent";
const fill=(s,q)=>String(s||"").split("{q}").join(q);
const count=(n)=>{const c=W.count||{};return String(c[rules.select(n)]||c.other||"#").split("#").join(n.toLocaleString(lang));};
const recent=()=>{try{const r=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(r)?r.filter((x)=>typeof x==="string").slice(0,5):[];}catch(e){return[];}};
const remember=(q)=>{q=q.trim();if(!q)return;try{localStorage.setItem(KEY,JSON.stringify([q,...recent().filter((x)=>x.toLowerCase()!==q.toLowerCase())].slice(0,5)));}catch(e){}};
const forget=()=>{try{localStorage.removeItem(KEY);}catch(e){}};
let options=[],active=-1,timer=0,ctrl=null,query="",back=null,returning=false,closedAt=0;
const shut=()=>{closedAt=Date.now();dlg.close();};
const el=(tag,cls,text)=>{const e=d.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const say=(text)=>{if(status)status.textContent=text||"";};
const show=(text,link)=>{if(!note)return;note.textContent=text||"";if(link){note.append(" ");const a=el("a","",link.text);a.href=link.href;note.append(a);}note.hidden=!text;};
const setActive=(i)=>{active=options.length?(i+options.length)%options.length:-1;
options.forEach((o,j)=>o.setAttribute("aria-selected",String(j===active)));
if(active<0){input.removeAttribute("aria-activedescendant");return;}
const o=options[active];input.setAttribute("aria-activedescendant",o.id);if(o.scrollIntoView)o.scrollIntoView({block:"nearest"});};
const option=(href,parts,onPick)=>{const o=el("a","ch-search-option");o.href=href;o.id="ch-search-o"+options.length;o.setAttribute("role","option");o.tabIndex=-1;
for(const p of parts)o.append(p);o.addEventListener("pointermove",()=>{if(options[active]!==o)setActive(options.indexOf(o));});
o.addEventListener("click",(e)=>{if(onPick){e.preventDefault();onPick();}else remember(query);});options.push(o);return o;};
const group=(label,items)=>{const g=el("div","ch-search-group");g.setAttribute("role","group");const h=el("div","ch-search-group__label",label);h.id="ch-search-g"+list.children.length;
h.setAttribute("role","presentation");g.setAttribute("aria-labelledby",h.id);g.append(h,...items);list.append(g);};
const reset=()=>{list.textContent="";options=[];active=-1;input.removeAttribute("aria-activedescendant");show("");};
const done=()=>{input.setAttribute("aria-expanded",String(options.length>0));};
const showRecent=()=>{reset();const r=recent();if(r.length){group(W.recent||"",r.map((q)=>option(page+"?q="+encodeURIComponent(q),[el("span","ch-search-option__title",q)],()=>{input.value=q;run(q);})));
const b=el("button","ch-search-clear",W.clear||"Clear");b.type="button";b.addEventListener("click",()=>{forget();showRecent();input.focus();});note.textContent="";note.append(b);note.hidden=false;}
done();say("");};
const render=(q,json)=>{reset();const order=[],by={};
for(const h of json.hits||[]){if(!by[h.kind]){by[h.kind]=[];order.push(h.kind);}const parts=[el("span","ch-search-option__title",h.title)];
if(h.context)parts.unshift(el("span","ch-search-option__context",h.context));if(h.snippetHtml){const s=el("span","ch-search-option__snippet");s.innerHTML=h.snippetHtml;parts.push(s);}
by[h.kind].push(option(h.href,parts));}
for(const k of order)group((W.kinds||{})[k]||k,by[k]);
if(json.total>0){const all=option(page+"?q="+encodeURIComponent(q),[el("span","ch-search-option__title",fill(W.all,q))],()=>{remember(q);location.href=page+"?q="+encodeURIComponent(q);});
all.classList.add("ch-search-option--all");const g=el("div","ch-search-group");g.setAttribute("role","group");g.append(all);list.append(g);}
else show(fill(W.none,q));
if(json.stale&&json.total>0)show(W.updating||"");setActive(json.total>0?0:-1);done();say(json.total>0?count(json.total):fill(W.none,q));};
const run=(q)=>{clearTimeout(timer);if(ctrl)ctrl.abort();query=q;if(!q.trim()){showRecent();return;}
ctrl=new AbortController();dlg.setAttribute("aria-busy","true");
fetch(endpoint+"?q="+encodeURIComponent(q),{signal:ctrl.signal,headers:{accept:"application/json"}})
.then((r)=>r.status===429?{limited:true}:r.ok?r.json():Promise.reject(new Error(String(r.status))))
.then((json)=>{if(q!==query)return;dlg.removeAttribute("aria-busy");
if(json.limited){reset();done();show(W.limited||"",{text:fill(W.all,q),href:page+"?q="+encodeURIComponent(q)});say(W.limited||"");return;}render(q,json);})
.catch((e)=>{if(e&&e.name==="AbortError")return;dlg.removeAttribute("aria-busy");reset();done();show(W.error||"",{text:fill(W.all,q),href:page+"?q="+encodeURIComponent(q)});});};
const open=(q)=>{if(!dlg.open)dlg.showModal();if(typeof q==="string"&&q)input.value=q;input.focus();input.select();run(input.value);};
input.setAttribute("role","combobox");input.setAttribute("aria-autocomplete","list");input.setAttribute("aria-expanded","false");if(list.id)input.setAttribute("aria-controls",list.id);
input.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>run(input.value),200);});
input.addEventListener("keydown",(e)=>{if(e.key==="ArrowDown"||e.key==="ArrowUp"){if(!options.length)return;e.preventDefault();setActive(active<0?(e.key==="ArrowDown"?0:-1):active+(e.key==="ArrowDown"?1:-1));}
else if(e.key==="Enter"&&active>=0&&options[active]){e.preventDefault();options[active].click();}
else if(e.key==="Enter")remember(input.value);
else if(e.key==="Escape"){e.preventDefault();shut();}});
dlg.addEventListener("click",(e)=>{if(e.target===dlg)shut();});
dlg.addEventListener("close",()=>{closedAt=Date.now();clearTimeout(timer);if(ctrl)ctrl.abort();dlg.removeAttribute("aria-busy");
if(back&&back.isConnected){returning=true;back.focus();returning=false;}back=null;});
for(const b of dlg.querySelectorAll("[data-ch-search-close]"))b.addEventListener("click",shut);
d.addEventListener("click",(e)=>{const t=e.target instanceof Element&&e.target.closest("[data-ch-search-open]");if(!t||dlg.open)return;e.preventDefault();open();});
d.addEventListener("focusin",(e)=>{const t=e.target instanceof Element&&e.target.closest("[data-ch-search-open]");if(returning||dlg.open||!t||!(e.target instanceof HTMLInputElement)||dlg.contains(e.relatedTarget)||Date.now()-closedAt<300)return;const q=e.target.value;back=e.target;open(q);});
d.addEventListener("keydown",(e)=>{const t=e.target,typing=t instanceof Element&&(t.closest("input,textarea,select,[contenteditable]")!==null);
if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==="k"){e.preventDefault();if(dlg.open)shut();else open();}
else if(e.key==="/"&&!typing&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!dlg.open){e.preventDefault();open();}});
d.documentElement.setAttribute("data-ch-search-ready","");}
`;

export const SEARCH_SCRIPT = { path: "/_cloudhal/search.1.js", code } as const;
