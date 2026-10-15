/**
 * Cloudhal's MCP Apps View (RFC-0020 §6, phase 20f; the MCP Apps extension, 2026-01-26): hosts
 * that render UI resources (Claude, ChatGPT, VS Code, …) show the page an agent is building right
 * inside the conversation. `preview_page` and `patch_draft` point at it with
 * `_meta.ui.resourceUri`; after `patch_draft` the View asks `preview_page` for the new version.
 *
 * Outward only: the View is our own constant HTML, never model output, and nothing from MCP Apps
 * reaches the public site. The preview is Cloudhal's escaped preview document, shown in a shadow
 * root (its styles stay inside; no script in it can run). It contacts no server of its own: tool
 * calls go through the host, so the default MCP Apps CSP (no connections) is enough.
 */

/** The View's resource (MCP Apps: a `ui://` URI). */
export const PREVIEW_UI_URI = "ui://cloudhal/preview";
/** The MCP Apps HTML profile. */
export const MCP_APP_MIME = "text/html;profile=mcp-app";
/** The MCP Apps extension a host advertises in its capabilities. */
export const MCP_APPS_EXTENSION = "io.modelcontextprotocol/ui";

const script = String.raw`const out=document.getElementById("preview");const status=document.getElementById("status");
const root=out.attachShadow({mode:"open"});
let seq=0;const pending=new Map();
const post=(m)=>window.parent.postMessage(Object.assign({jsonrpc:"2.0"},m),"*");
const request=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});post({id,method,params});});
const say=(t)=>{status.textContent=t;status.hidden=!t;};
const size=()=>post({method:"ui/notifications/size-changed",params:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}});
new ResizeObserver(size).observe(document.body);
const show=(html)=>{if(typeof html!=="string"||!html){say("No preview yet.");return;}
const doc=new DOMParser().parseFromString(html,"text/html");
const css=[...doc.querySelectorAll("style")].map((s)=>s.textContent||"").join("\n").replace(/:root/g,":host");
for(const el of doc.querySelectorAll("script,iframe,object,embed,link,meta,base,form"))el.remove();
const style=document.createElement("style");style.textContent=css+"\n:host{display:block}";
const body=document.createElement("div");body.className="page";body.append(...doc.body.childNodes);
root.replaceChildren(style,body);say("");size();};
const fromResult=async(r)=>{if(!r)return;const sc=r.structuredContent||{};
if(r.isError){const t=(r.content||[]).map((c)=>c&&c.text||"").join(" ");say(t.slice(0,300)||"The step was refused.");return;}
if(typeof sc.html==="string"){show(sc.html);return;}
const page=sc.page;if(page&&typeof page.id==="string"&&typeof page.siteId==="string"){say("Updating preview…");
try{const p=await request("tools/call",{name:"preview_page",arguments:{siteId:page.siteId,pageId:page.id}});show(p&&p.structuredContent&&p.structuredContent.html);}catch(e){say("Preview unavailable.");}}};
window.addEventListener("message",(e)=>{if(e.source!==window.parent)return;const m=e.data;if(!m||m.jsonrpc!=="2.0")return;
if(m.id!==undefined&&!m.method){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}return;}
switch(m.method){case"ui/notifications/tool-input":say("Working…");break;
case"ui/notifications/tool-result":fromResult(m.params);break;
case"ui/notifications/tool-cancelled":say("Cancelled.");break;
case"ui/notifications/host-context-changed":{const t=m.params&&m.params.theme;if(t==="dark"||t==="light")document.documentElement.style.colorScheme=t;break;}
case"ui/resource-teardown":post({id:m.id,result:{}});break;
default:if(m.id!==undefined)post({id:m.id,error:{code:-32601,message:"method not found"}});}});
request("ui/initialize",{protocolVersion:"2026-01-26",appCapabilities:{},clientInfo:{name:"cloudhal-preview",version:"1"}}).then(()=>post({method:"ui/notifications/initialized"})).catch(()=>say("This host does not run MCP Apps."));
`;

/** The View: one HTML document, its script inline (MCP Apps hosts serve the resource as is). */
export const PREVIEW_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cloudhal preview</title>
<style>
:root{color-scheme:light dark;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
body{margin:0}
#status{margin:0;padding:8px 12px;color:#59636e;font-size:13px}
#preview{display:block;background:#fff;color-scheme:light}
</style>
</head>
<body>
<p id="status">Waiting for the agent…</p>
<div id="preview"></div>
<script>${script}</script>
</body>
</html>
`;
