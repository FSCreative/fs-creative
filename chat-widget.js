/* FS Creative – Website-Chat (ausgeliefert als /chat/w.js?v=…, Server: chat.js). Lädt mit defer, baut das Fenster erst beim ersten Öffnen.
   Unterhaltungs-ID zufällig in localStorage „fsc-chat“ (bleibt beim Seitenwechsel), Nachrichten nur als Text (textContent, nie HTML).
   Anhänge: Büroklammer, Drag & Drop oder Bild einfügen → POST /chat/api/file (roh, max. 15 MB, JPG/PNG/WebP/PDF), nacheinander mit Fortschritt; Bilder als Vorschau (groß per Klick), PDFs als Kachel. */
(function(){
"use strict";
var W=window, d=document;
if(W.__fscChat||/^\/admin/.test(location.pathname)||!W.fetch||!W.JSON) return; W.__fscChat=1;
var vw="home", meSeen=0, tyWho="", tySent=0, K="fsc-chat", st={}, online=false, built=false, isOpen=false, msgs=[], last=0, pollT=null, bgT=null, typing=false, sending=false, closed=false, el={}, upQ=[], upBusy=false;
var FMAX=15*1024*1024, FTYPES={"image/jpeg":1,"image/png":1,"image/webp":1,"application/pdf":1};
try{ st=JSON.parse(localStorage.getItem(K)||"null")||{}; }catch(e){ st={}; }
function save(){ try{ localStorage.setItem(K,JSON.stringify(st)); }catch(e){} }
function cid(){
  if(!st.cid||!/^[a-z0-9]{20,40}$/.test(st.cid)){ var A="abcdefghijklmnopqrstuvwxyz0123456789", a=new Uint8Array(24), s="", i; try{ W.crypto.getRandomValues(a); }catch(e){ for(i=0;i<24;i++) a[i]=Math.random()*256|0; } for(i=0;i<24;i++) s+=A[a[i]%36]; st.cid=s; save(); }
  return st.cid;
}
function api(path,body){
  return fetch(path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),credentials:"same-origin",cache:"no-store"}:{credentials:"same-origin",cache:"no-store"})
    .then(function(r){ return r.json().catch(function(){ return {ok:false,error:"HTTP "+r.status}; }); });
}
function h(tag,cls,text){ var e=d.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
var KI_AV="/logos/ki-avatar.svg", SV_BACK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>', SV_DOWN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
var SV_BIG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>', SV_SMALL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M10 14l-7 7M20 10h-6V4M14 10l7-7"/></svg>';
var IC='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/></svg>';
var CSS='.fscc-print{position:fixed;right:90px;bottom:calc(29px + var(--fscc-tb,0px));z-index:300;height:40px;display:inline-flex;align-items:center;gap:7px;padding:0 16px 0 13px;border-radius:999px;background:#ffd60a;color:#1d1d1f;font:800 13.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;letter-spacing:.08em;text-decoration:none;box-shadow:0 10px 26px rgba(0,0,0,.32);transition:transform .2s;-webkit-tap-highlight-color:transparent}.fscc-print:hover{transform:translateY(-2px)}.fscc-print:focus-visible{outline:3px solid var(--text,#fff);outline-offset:3px}.fscc-print svg{width:18px;height:18px;flex:none}'+
'.fscc-b{position:fixed;right:20px;bottom:calc(20px + var(--fscc-tb,0px));z-index:300;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--accent,#0a84ff);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent}'+
'.fscc-b:hover{transform:translateY(-2px) scale(1.04)}.fscc-b:focus-visible{outline:3px solid var(--text,#fff);outline-offset:3px}.fscc-b[aria-expanded=true]{transform:scale(.9);opacity:0;pointer-events:none}'+
'.fscc-dot{position:absolute;right:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#8e8e93;border:2.5px solid var(--bg,#0a0a0f)}.fscc-dot.on{background:#30d158}'+
'.fscc-n{position:absolute;left:-4px;top:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ff453a;color:#fff;font:700 12px/20px system-ui,-apple-system,sans-serif;text-align:center}'+
'.fscc-p{position:fixed;right:20px;bottom:calc(20px + var(--fscc-tb,0px));z-index:400;width:380px;max-width:calc(100vw - 40px);height:min(620px,calc(100vh - 40px - var(--fscc-tb,0px)));display:flex;flex-direction:column;background:var(--bg-soft,#111118);color:var(--text,#f5f5f7);border:1px solid var(--border-2,rgba(255,255,255,.14));border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;opacity:0;transform:translateY(16px) scale(.98);transition:opacity .2s,transform .2s;pointer-events:none}'+
'.fscc-p.on{opacity:1;transform:none;pointer-events:auto}.fscc-p *{box-sizing:border-box}'+
'.fscc-h{display:flex;align-items:center;gap:10px;padding:14px 10px 14px 14px;background:linear-gradient(135deg,var(--accent,#0a84ff),#0060d6);color:#fff}'+
'.fscc-av{position:relative;width:46px;height:46px;border-radius:50%;background:#fff;flex:none;box-shadow:0 0 0 2px rgba(255,255,255,.55)}.fscc-av img{width:100%;height:100%;border-radius:50%;display:block}.fscc-av .fscc-dot{right:0;top:auto;bottom:0;width:13px;height:13px;border-color:#0a6fe0}'+
'.fscc-t{flex:1;min-width:0}.fscc-t b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fscc-t span{display:block;font-size:12.5px;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.fscc-x{width:38px;height:38px;flex:none;border-radius:50%;border:0;background:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s}.fscc-x:hover{background:rgba(255,255,255,.16)}.fscc-x svg{width:22px;height:22px}.fscc-h .fscc-x:focus-visible{outline:2px solid #fff;outline-offset:1px}'+
'.fscc-p.big{width:min(640px,calc(100vw - 40px));height:calc(100vh - 40px - var(--fscc-tb,0px))}.fscc-p{transition:opacity .2s,transform .2s,width .25s,height .25s}.fscc-x:focus-visible,.fscc-s:focus-visible{outline:2px solid var(--accent,#0a84ff);outline-offset:2px}'+
'.fscc-off{margin:10px 12px 0;padding:9px 12px;border-radius:12px;background:var(--surface-2,rgba(255,255,255,.06));font-size:13px;color:var(--text-dim,#a1a1aa)}'+
'.fscc-l{flex:1;overflow-y:auto;padding:16px 12px 12px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}'+
'.fscc-r{display:flex;flex-direction:column;max-width:88%}.fscc-r.v{align-self:flex-end;align-items:flex-end}.fscc-r.me,.fscc-r.ki{align-self:flex-start}.fscc-r .row{display:flex;align-items:flex-end;gap:8px}.fscc-r .ava{width:30px;height:30px;border-radius:50%;flex:none;object-fit:cover;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25)}.fscc-r>small{font-size:11px;color:var(--text-faint,#8a8a94);margin:3px 4px 0 42px}.fscc-r.v>small{margin:3px 4px 0}.fscc-r .fscc-m{max-width:100%}'+
'@keyframes fsccIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.fscc-r.new{animation:fsccIn .25s ease-out}'+
'.fscc-m{max-width:84%;padding:10px 14px;border-radius:18px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14.5px}.fscc-m small{display:block;font-size:11px;opacity:.7;margin-top:2px}'+
'.fscc-m.v{align-self:flex-end;background:var(--accent,#0a84ff);color:#fff;border-bottom-right-radius:5px}.fscc-m.me,.fscc-m.ki{align-self:flex-start;background:var(--fscc-bub,rgba(255,255,255,.09));border-bottom-left-radius:5px}html.light .fscc-p{--fscc-bub:#e9eef5}'+
'.fscc-m .who{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;opacity:.85;margin-bottom:2px}.fscc-me{width:20px;height:20px;border-radius:50%;object-fit:cover;flex:none}.fscc-m.sys{align-self:center;max-width:92%;background:none;color:var(--text-dim,#a1a1aa);font-size:12.5px;text-align:center;padding:4px 8px}'+
'.fscc-ty{display:flex;gap:4px;align-items:center;padding:11px 14px;border-radius:16px;background:var(--fscc-in,rgba(127,127,127,.16))}.fscc-ty i{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.35;animation:fsccTy 1.2s infinite ease-in-out}.fscc-ty i:nth-child(2){animation-delay:.18s}.fscc-ty i:nth-child(3){animation-delay:.36s}@keyframes fsccTy{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:.9;transform:translateY(-3px)}}.fscc-hi{align-self:center;text-align:center;color:var(--text-dim,#a1a1aa);font-size:13.5px;padding:18px 10px 8px}'+
'.fscc-pv{font-size:11.5px;color:var(--text-faint,#6e6e78);padding:0 14px 6px;text-align:center}.fscc-pv a{color:inherit;text-decoration:underline}'+
'.fscc-f{border-top:1px solid var(--border,rgba(255,255,255,.09));padding:10px 12px calc(12px + env(safe-area-inset-bottom));display:grid;gap:8px}'+
'.fscc-pill{flex:1;min-width:0;display:flex;align-items:flex-end;gap:4px;border:1px solid var(--border-2,rgba(255,255,255,.14));background:var(--bg,#0a0a0f);border-radius:24px;padding:3px 3px 3px 4px;transition:border-color .15s}.fscc-pill:focus-within{border-color:var(--accent,#0a84ff)}.fscc-pill .fscc-in{border:0;background:none;border-radius:20px;padding:9px 10px}.fscc-pill .fscc-in:focus{border:0}'+
'.fscc-nm,.fscc-in{width:100%;border:1px solid var(--border-2,rgba(255,255,255,.14));background:var(--bg,#0a0a0f);color:inherit;border-radius:14px;padding:9px 12px;font:inherit;font-size:16px}.fscc-nm{font-size:14px;padding:7px 12px}'+
'.fscc-nm:focus,.fscc-in:focus{outline:none;border-color:var(--accent,#0a84ff)}.fscc-row{display:flex;gap:8px;align-items:center}.fscc-in{resize:none;max-height:130px;min-height:42px;line-height:1.35}'+
'.fscc-s{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--accent,#0a84ff);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s,opacity .15s}.fscc-s:not(:disabled):hover{transform:scale(1.06)}.fscc-s:disabled{opacity:.45;cursor:default}.fscc-s.idle{opacity:.5}'+
'.fscc-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}.fscc-err{font-size:12.5px;color:#ff6961;padding:0 4px}'+
'.fscc-clip{flex:none;width:46px;height:46px;border-radius:50%;border:0;background:var(--surface-2,rgba(255,255,255,.08));color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center}.fscc-clip:focus-visible{outline:2px solid var(--accent,#0a84ff);outline-offset:2px}.fscc-clip:disabled{opacity:.45;cursor:default}'+
'.fscc-m.file{padding:4px;white-space:normal}.fscc-m.file small{padding:0 8px 3px}.fscc-img{display:block;padding:0;border:0;background:none;cursor:zoom-in;border-radius:12px;overflow:hidden}.fscc-img img{display:block;max-width:220px;max-height:220px;width:auto;height:auto;border-radius:12px}'+
'.fscc-pdf{display:flex;align-items:center;gap:10px;padding:8px 10px;min-width:200px}.fscc-pdf .ic{flex:none;width:36px;height:42px;border-radius:6px;background:#ff453a;color:#fff;font:800 11px/42px system-ui,sans-serif;text-align:center}.fscc-pdf .nm{min-width:0;flex:1}.fscc-pdf b{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fscc-pdf span{display:block;font-size:12px;opacity:.8}'+
'.fscc-pdf a{color:inherit;font-size:12.5px;font-weight:700;text-decoration:underline;margin-right:10px}'+
'.fscc-p.drag::after{content:"Datei hier ablegen";position:absolute;inset:8px;border:2px dashed var(--accent,#0a84ff);border-radius:16px;background:rgba(10,132,255,.12);display:flex;align-items:center;justify-content:center;font-weight:700;pointer-events:none}'+
'.fscc-up{font-size:12.5px;color:var(--text-dim,#a1a1aa);padding:0 4px}.fscc-up:empty,.fscc-err:empty{display:none}'+
'.fscc-lb{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out}.fscc-lb img{max-width:100%;max-height:100%;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.6)}.fscc-lb a{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);color:#fff;font:600 14px system-ui,sans-serif;background:rgba(255,255,255,.14);padding:8px 14px;border-radius:99px;text-decoration:none}'+
'html.light .fscc-p{box-shadow:0 24px 60px rgba(18,20,28,.18)}html.light .fscc-b{box-shadow:0 10px 26px rgba(18,20,28,.25)}'+
'@media(max-width:640px){.fscc-print{right:78px;bottom:calc(21px + var(--fscc-tb,0px));height:40px;padding:0 14px 0 11px}.fscc-b{right:14px;bottom:calc(14px + var(--fscc-tb,0px));width:54px;height:54px}.fscc-p{right:0;left:0;top:0;bottom:0;width:100%;max-width:none;height:100%;height:100dvh;border-radius:0;border:0}}'+
'.fscc-p.home>.fscc-h,.fscc-p.home>.fscc-off,.fscc-p.home>.fscc-l,.fscc-p.home>.fscc-pv,.fscc-p.home>.fscc-f{display:none}.fscc-hm{display:none;flex:1;min-height:0;flex-direction:column;overflow-y:auto}.fscc-p.home>.fscc-hm{display:flex}'+
'.fscc-hero{position:relative;flex:none;padding:12px 12px 74px 22px;color:#fff;background:linear-gradient(160deg,#4b9bff,#0a6fe0 55%,#004fb5);overflow:hidden}.fscc-hero .wv{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fscc-hero .top{position:relative;display:flex;justify-content:flex-end}'+
'.fscc-hero h2{position:relative;margin:40px 0 6px;font-size:30px;line-height:1.15;font-weight:800;color:#fff}.fscc-hero p{position:relative;margin:0 0 16px;font-size:16px;opacity:.95}.fscc-hero a.ds{position:relative;display:inline-block;background:rgba(0,0,0,.22);color:#fff;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:8px;text-decoration:none}.fscc-hero a.ds:hover{background:rgba(0,0,0,.32)}'+
'.fscc-cards{position:relative;margin:-56px 14px 14px;display:grid;gap:12px}.fscc-card{background:var(--bg,#0a0a0f);border:1px solid var(--border-2,rgba(255,255,255,.12));border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.28);padding:12px 16px}html.light .fscc-card{background:#fff;box-shadow:0 8px 24px rgba(18,20,28,.12)}'+
'.fscc-cv{display:flex;gap:12px;align-items:center;width:100%;background:none;border:0;border-radius:10px;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:8px 4px}.fscc-cv:hover{background:var(--surface-2,rgba(127,127,127,.1))}.fscc-cv img{width:42px;height:42px;border-radius:50%;flex:none;background:#fff}.fscc-cv .tx{flex:1;min-width:0}'+
'.fscc-cv b{display:flex;justify-content:space-between;gap:8px;font-size:14px}.fscc-cv b small{font-weight:400;color:var(--text-dim,#a1a1aa);font-size:12px;flex:none}.fscc-cv span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;color:var(--text-dim,#a1a1aa)}'+
'.fscc-all{display:flex;justify-content:center;align-items:center;gap:6px;width:100%;margin-top:6px;padding:12px 0 4px;border:0;border-top:1px solid var(--border,rgba(255,255,255,.09));background:none;color:var(--accent,#0a84ff);font:inherit;font-weight:700;font-size:15px;cursor:pointer}'+
'.fscc-new{display:block;width:100%;padding:14px;border:0;border-radius:10px;background:var(--accent,#0a84ff);color:#fff;font:inherit;font-weight:700;font-size:15px;cursor:pointer;transition:filter .15s}.fscc-new:hover{filter:brightness(1.1)}.fscc-hint{margin:10px 2px 2px;text-align:center;font-size:12.5px;color:var(--text-dim,#a1a1aa)}'+
'.fscc-hm .lst{display:none}.fscc-hm.lst .lst{display:flex;flex-direction:column;flex:1;min-height:0}.fscc-hm.lst .main{display:none}.fscc-hm .main{display:flex;flex-direction:column}.fscc-lst-l{flex:1;overflow-y:auto;padding:8px 10px}.fscc-lst-l .fscc-cv{border-bottom:1px solid var(--border,rgba(255,255,255,.08));border-radius:0;padding:12px 6px}'+
'@media(prefers-reduced-motion:reduce){.fscc-b,.fscc-p{transition:none}}';

/* Abstand zur mobilen Tab-Leiste (index.html und Landingpages haben unten .tabbar) */
function tabbar(){ var t=d.querySelector(".tabbar"), hgt=0; if(t){ var cs=W.getComputedStyle(t); if(cs.display!=="none"&&cs.position==="fixed") hgt=t.getBoundingClientRect().height; } d.documentElement.style.setProperty("--fscc-tb",hgt?Math.round(hgt+4)+"px":"0px"); }

var btn, dot, badge;
function init(){
  var s=d.createElement("style"); s.textContent=CSS; d.head.appendChild(s);
  btn=h("button","fscc-b"); btn.type="button"; btn.setAttribute("aria-haspopup","dialog"); btn.setAttribute("aria-expanded","false"); btn.setAttribute("aria-controls","fscc-panel"); btn.innerHTML=IC;
  dot=h("span","fscc-dot"); dot.setAttribute("aria-hidden","true"); btn.appendChild(dot); label();
  btn.addEventListener("click",function(){ toggle(true); });
  d.body.appendChild(btn);
  // Knopf „PRINT“ links neben dem Chat → Online-Druckshop (nicht im Shop selbst)
  if(!/^\/print/.test(location.pathname)){ var pr=h("a","fscc-print"); pr.href="/print"; pr.setAttribute("aria-label","Druckshop – Drucksachen online bestellen"); pr.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>PRINT'; d.body.appendChild(pr); }
  tabbar(); W.addEventListener("resize",tabbar);
  var go=function(){ checkStatus(); }; if(W.requestIdleCallback) W.requestIdleCallback(go,{timeout:3000}); else setTimeout(go,1200);
  d.addEventListener("visibilitychange",function(){ if(!d.hidden&&isOpen) poll(); });
}
function label(){ if(!btn) return; btn.setAttribute("aria-label","Chat öffnen – "+(online?"KI-Assistent, Simon ist online und übernimmt bei Bedarf":"KI-Assistent, Simon meldet sich persönlich")); dot.className="fscc-dot"+(online?" on":""); if(el.adot) el.adot.className="fscc-dot"+(online?" on":""); }
function setBadge(n){ if(!btn) return; if(n>0&&!isOpen){ if(!badge){ badge=h("span","fscc-n"); badge.setAttribute("aria-hidden","true"); btn.appendChild(badge); } badge.textContent=n>9?"9+":String(n); } else if(badge){ badge.remove(); badge=null; } }
function checkStatus(){
  var q=st.cid&&st.started?"?c="+st.cid+"&a="+(st.seen||0):"";
  api("/chat/api/status"+q).then(function(j){ if(!j||!j.ok) return; online=!!j.online; label(); setBadge(j.n||0); if(j.me>0&&!isOpen) toggle(true,true); }).catch(function(){});   // Simon hat geschrieben → Chat öffnet sich
  bg();
}
/* geschlossen: alle 30 s nach Antworten schauen (nur wenn schon geschrieben wurde und der Tab sichtbar ist) */
function bg(){ clearTimeout(bgT); if(st.started&&!isOpen) bgT=setTimeout(function(){ if(isOpen) return; if(!d.hidden) checkStatus(); else bg(); },online?10000:30000); }

function build(){
  built=true;
  var p=el.p=h("div","fscc-p"); p.id="fscc-panel"; p.setAttribute("role","dialog"); p.setAttribute("aria-label","Chat mit FS Creative"); p.setAttribute("aria-hidden","true");
  var hd=h("div","fscc-h"), av=h("div","fscc-av"), img=h("img"); img.src=KI_AV; img.alt=""; img.width=46; img.height=46; av.appendChild(img); el.adot=h("span","fscc-dot"); av.appendChild(el.adot);
  var t=h("div","fscc-t"); el.title=h("b"); el.sub=h("span"); t.appendChild(el.title); t.appendChild(el.sub);
  var bg=el.big=h("button","fscc-x"); bg.type="button"; bg.setAttribute("aria-label","Chat vergrößern"); bg.innerHTML=SV_BIG; bg.addEventListener("click",function(){ var on=!p.classList.contains("big"); p.classList.toggle("big",on); bg.innerHTML=on?SV_SMALL:SV_BIG; bg.setAttribute("aria-label",on?"Chat verkleinern":"Chat vergrößern"); st.big=on?1:0; save(); });
  var x=h("button","fscc-x"); x.type="button"; x.setAttribute("aria-label","Chat minimieren"); x.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'; x.addEventListener("click",function(){ toggle(false); });
  if(st.big){ p.classList.add("big"); bg.innerHTML=SV_SMALL; bg.setAttribute("aria-label","Chat verkleinern"); }
  var bk=h("button","fscc-x"); bk.type="button"; bk.setAttribute("aria-label","Zurück zur Übersicht"); bk.innerHTML=SV_BACK; bk.addEventListener("click",function(){ view("home"); });
  hd.appendChild(bk); hd.appendChild(av); hd.appendChild(t); if(W.innerWidth>640) hd.appendChild(bg); hd.appendChild(x); p.appendChild(hd);
  buildHome(p);
  el.off=h("div","fscc-off","Simon ist gerade nicht online – der KI-Assistent hilft dir weiter und nimmt deine Anfrage für ihn auf."); el.off.setAttribute("role","note"); p.appendChild(el.off);
  el.list=h("div","fscc-l"); el.list.setAttribute("role","log"); el.list.setAttribute("aria-live","polite"); el.list.setAttribute("aria-label","Nachrichten"); el.list.tabIndex=0; p.appendChild(el.list);
  el.pv=h("div","fscc-pv"); el.pv.appendChild(d.createTextNode("Mit dem Chat akzeptierst du unsere ")); var a=h("a",null,"Datenschutzerklärung"); a.href="/datenschutz"; el.pv.appendChild(a); el.pv.appendChild(d.createTextNode(".")); p.appendChild(el.pv);
  var f=el.form=h("form","fscc-f"); f.setAttribute("novalidate","");
  el.nm=h("input","fscc-nm"); el.nm.type="text"; el.nm.maxLength=80; el.nm.placeholder="Dein Name (optional)"; el.nm.autocomplete="name"; el.nm.setAttribute("aria-label","Dein Name (optional)"); if(st.name) el.nm.value=st.name;
  el.hp=h("input","fscc-hp"); el.hp.type="text"; el.hp.name="website"; el.hp.tabIndex=-1; el.hp.autocomplete="off"; el.hp.setAttribute("aria-hidden","true");
  var row=h("div","fscc-row"), pill=h("div","fscc-pill"); el.in=h("textarea","fscc-in"); el.in.rows=1; el.in.maxLength=2000; el.in.placeholder="Deine Nachricht …"; el.in.setAttribute("aria-label","Nachricht");
  el.s=h("button","fscc-s"); el.s.type="submit"; el.s.setAttribute("aria-label","Senden"); el.s.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.5 2.5 10.6 13.4"/><path d="m21.5 2.5-7 19-3.9-8.1-8.1-3.9z"/></svg>'; el.s.classList.add("idle");
  el.clip=h("button","fscc-clip"); el.clip.type="button"; el.clip.setAttribute("aria-label","Bild oder PDF anhängen (max. 15 MB)"); el.clip.title="Bild oder PDF anhängen (max. 15 MB)";
  el.clip.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  el.file=h("input"); el.file.type="file"; el.file.multiple=true; el.file.accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"; el.file.hidden=true; el.file.tabIndex=-1;
  el.clip.addEventListener("click",function(){ el.file.click(); });
  el.file.addEventListener("change",function(){ queue(el.file.files); el.file.value=""; });
  pill.appendChild(el.in); pill.appendChild(el.s); row.appendChild(el.clip); row.appendChild(pill); row.appendChild(el.file); el.err=h("div","fscc-err"); el.err.setAttribute("role","status");
  el.up=h("div","fscc-up"); el.up.setAttribute("aria-live","polite");
  f.appendChild(el.nm); f.appendChild(el.hp); f.appendChild(row); f.appendChild(el.up); f.appendChild(el.err); p.appendChild(f);
  /* Drag & Drop aufs ganze Fenster, Bild aus der Zwischenablage ins Eingabefeld */
  var dn=0; p.addEventListener("dragenter",function(e){ if(hasFiles(e)){ e.preventDefault(); dn++; p.classList.add("drag"); } });
  p.addEventListener("dragover",function(e){ if(hasFiles(e)){ e.preventDefault(); e.dataTransfer.dropEffect="copy"; } });
  p.addEventListener("dragleave",function(){ if(--dn<=0){ dn=0; p.classList.remove("drag"); } });
  p.addEventListener("drop",function(e){ if(!hasFiles(e)) return; e.preventDefault(); dn=0; p.classList.remove("drag"); queue(e.dataTransfer.files); });
  el.in.addEventListener("paste",function(e){ var it=e.clipboardData&&e.clipboardData.files; if(it&&it.length){ e.preventDefault(); queue(it); } });
  el.in.addEventListener("input",grow); el.in.addEventListener("input",function(){ el.s.classList.toggle("idle",!el.in.value.trim()); }); el.in.addEventListener("input",function(){ if(!st.started||!el.in.value.trim()||Date.now()-tySent<3000) return; tySent=Date.now(); fetch("/chat/api/typing?c="+cid(),{method:"POST",credentials:"same-origin",cache:"no-store"}).catch(function(){}); });
  el.in.addEventListener("keydown",function(e){ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); send(); } });
  f.addEventListener("submit",function(e){ e.preventDefault(); send(); });
  p.addEventListener("keydown",function(e){ if(e.key==="Escape"){ e.preventDefault(); toggle(false); } });
  d.body.appendChild(p); head();
}
function grow(){ el.in.style.height="auto"; el.in.style.height=Math.min(130,el.in.scrollHeight+2)+"px"; }
function head(){ if(!built) return; el.title.textContent="FS Creative · Assistent"; el.sub.textContent=online?"Online · Simon ist auch da":"Online · antwortet sofort"; el.off.style.display=online?"none":""; label(); }
function toggle(on,auto){
  if(on===isOpen) return; isOpen=on;
  if(on&&!built) build();
  btn.setAttribute("aria-expanded",String(on)); el.p.setAttribute("aria-hidden",String(!on)); el.p.classList.toggle("on",on);
  if(on){ setBadge(0); view(auto?"chat":"home",auto); }   // Startseite mit Verlauf + „Neue Unterhaltung“; automatisch geöffnet (Simon hat geschrieben) → direkt in den Chat, ohne Fokus
  else { clearTimeout(pollT); btn.focus(); checkStatus(); }
}
function start(){
  paint();
  api("/chat/api/start",{cid:cid(),page:location.pathname,cart:cartSum()}).then(function(j){ if(!j||!j.ok) return; online=!!j.online; closed=!!j.closed; typing=!!j.typing; msgs=j.msgs||[]; msgs.forEach(function(m){ painted[m.id]=1; }); last=msgs.length?msgs[msgs.length-1].id:0; if(j.name&&!el.nm.value) el.nm.value=j.name; seen(); head(); paint(); schedule(); }).catch(function(){ schedule(); });
}
/* ── Startseite (Simon 18.11.2026): Begrüßung, letzte Unterhaltung, alle Unterhaltungen, „Neue Unterhaltung starten“ ──
   Mehrere Unterhaltungen je Browser: st.convs = [{c: ID, t: Zeit, p: Vorschau}], st.cid = die gerade offene */
function convs(){ if(!Array.isArray(st.convs)){ st.convs=st.cid&&st.started?[{c:st.cid,t:"",p:""}]:[]; save(); } return st.convs; }
function note(){ if(!st.started||!st.cid) return; var L=convs(), m=null, i; for(i=msgs.length-1;i>=0;i--){ if(msgs[i].from!=="sys"){ m=msgs[i]; break; } }
  var e=L.filter(function(x){ return x.c===st.cid; })[0]; if(!e){ e={c:st.cid,t:"",p:""}; L.unshift(e); }
  if(m){ var p=(m.from==="v"?"Du: ":"")+(m.file?"📎 "+(m.file.name||"Datei"):String(m.text||"")).replace(/\s+/g," ").slice(0,120); if(e.p===p&&e.t===m.at) return; e.p=p; e.t=m.at||""; }
  L.sort(function(a,b){ return String(b.t).localeCompare(String(a.t)); }); st.convs=L.slice(0,30); save(); }
function when(iso){ var t=new Date(iso); if(isNaN(t)) return ""; var n=new Date(); return t.toDateString()===n.toDateString()?fmt(iso):t.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"}); }
function convBtn(x){ var b=h("button","fscc-cv"), im=h("img"), tx=h("span","tx"), nm=h("b"); b.type="button"; im.src=KI_AV; im.alt=""; im.width=42; im.height=42;
  nm.appendChild(d.createTextNode("FS Creative · Assistent")); nm.appendChild(h("small",null,when(x.t))); tx.appendChild(nm); tx.appendChild(h("span",null,x.p||"Unterhaltung öffnen"));
  b.appendChild(im); b.appendChild(tx); b.addEventListener("click",function(){ openConv(x.c); }); return b; }
function buildHome(p){
  var hm=el.hm=h("div","fscc-hm"), main=h("div","main"), hero=h("div","fscc-hero"), top=h("div","top"), x=h("button","fscc-x");
  hero.insertAdjacentHTML("afterbegin",'<svg class="wv" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 C90 0 170 70 260 35 S380 10 400 30 V0 H0Z" fill="rgba(255,255,255,.10)"/><path d="M0 110 C110 60 210 140 300 95 S390 70 400 85 V0 H0Z" fill="rgba(255,255,255,.07)"/><path d="M0 190 C120 140 230 220 320 170 S390 150 400 160 V0 H0Z" fill="rgba(255,255,255,.05)"/></svg>');
  x.type="button"; x.setAttribute("aria-label","Chat minimieren"); x.innerHTML=SV_DOWN; x.addEventListener("click",function(){ toggle(false); }); top.appendChild(x); hero.appendChild(top);
  hero.appendChild(h("h2",null,"Hallo! 👋")); hero.appendChild(h("p",null,"Wir sind für dich da – Website, Grafik und Druck."));
  var ds=h("a","ds","Datenschutzhinweise"); ds.href="/datenschutz"; ds.target="_blank"; ds.rel="noopener"; hero.appendChild(ds); main.appendChild(hero);
  var cards=h("div","fscc-cards"); el.hmLast=h("div","fscc-card"); cards.appendChild(el.hmLast);
  var nc=h("div","fscc-card"), nb=el.hmNew=h("button","fscc-new","Neue Unterhaltung starten"); nb.type="button"; nb.addEventListener("click",newConv); nc.appendChild(nb); el.hmHint=h("div","fscc-hint"); nc.appendChild(el.hmHint); cards.appendChild(nc); main.appendChild(cards);
  var ls=h("div","lst"), lh=h("div","fscc-h"), bk=h("button","fscc-x"), lt=h("div","fscc-t"); bk.type="button"; bk.setAttribute("aria-label","Zurück"); bk.innerHTML=SV_BACK; bk.addEventListener("click",function(){ hm.classList.remove("lst"); });
  lt.appendChild(h("b",null,"Unterhaltungen")); lt.appendChild(h("span",null,"Deine bisherigen Chats in diesem Browser")); var lx=h("button","fscc-x"); lx.type="button"; lx.setAttribute("aria-label","Chat minimieren"); lx.innerHTML=SV_DOWN; lx.addEventListener("click",function(){ toggle(false); });
  lh.appendChild(bk); lh.appendChild(lt); lh.appendChild(lx); ls.appendChild(lh); el.hmList=h("div","fscc-lst-l"); ls.appendChild(el.hmList);
  var ln=h("div",null); ln.style.padding="10px 14px 14px"; var nb2=h("button","fscc-new","Neue Unterhaltung starten"); nb2.type="button"; nb2.addEventListener("click",newConv); ln.appendChild(nb2); ls.appendChild(ln);
  hm.appendChild(main); hm.appendChild(ls); p.appendChild(hm);
}
function drawHome(){ if(!built) return; var L=convs(); el.hmLast.textContent=""; el.hmLast.style.display=L.length?"":"none";
  if(L.length){ el.hmLast.appendChild(convBtn(L[0])); var all=h("button","fscc-all"); all.type="button"; all.innerHTML='Unterhaltungen ('+L.length+') <span aria-hidden="true">›</span>'; all.addEventListener("click",function(){ drawList(); el.hm.classList.add("lst"); }); el.hmLast.appendChild(all); }
  el.hmHint.textContent=online?"Der KI-Assistent antwortet sofort · Simon ist gerade online":"Der KI-Assistent antwortet sofort · Simon meldet sich bei Bedarf persönlich"; }
function drawList(){ el.hmList.textContent=""; convs().forEach(function(x){ el.hmList.appendChild(convBtn(x)); }); }
function reset(){ msgs=[]; last=0; painted={}; typing=false; meSeen=0; tyWho=""; if(built){ el.list.textContent=""; el.err.textContent=""; } }
function view(v,auto){ vw=v; el.p.classList.toggle("home",v!=="chat"); if(v!=="chat"){ clearTimeout(pollT); el.hm.classList.remove("lst"); drawHome(); setTimeout(function(){ try{ el.hmNew.focus({preventScroll:true}); }catch(e){} },60); return; }
  start(); if(!auto) setTimeout(function(){ try{ el.in.focus({preventScroll:true}); }catch(e){ el.in.focus(); } },60); }
function openConv(c){ if(c!==st.cid){ st.cid=c; st.started=1; st.seen=0; save(); reset(); } view("chat"); }
function newConv(){ delete st.cid; st.started=0; st.seen=0; save(); reset(); view("chat"); }
function seen(){ if(last&&last!==st.seen){ st.seen=last; save(); } }
function schedule(){ clearTimeout(pollT); if(isOpen&&vw==="chat") pollT=setTimeout(poll,typing?2000:online?3000:4000); }
function poll(){
  if(!isOpen||vw!=="chat"){ return; } if(d.hidden){ schedule(); return; }
  api("/chat/api/poll?c="+cid()+"&after="+last).then(function(j){ if(j&&j.ok){ var ch=online!==!!j.online||typing!==!!j.typing||tyWho!==(j.who||"")||meSeen!==(j.seen||0); meSeen=j.seen||0; online=!!j.online; typing=!!j.typing; tyWho=j.who||""; closed=!!j.closed; add(j.msgs||[]); if(ch){ head(); paint(); } } schedule(); }).catch(schedule);
}
function add(arr){ var n=0; arr.forEach(function(m){ if(m.id>last){ msgs.push(m); last=m.id; n++; } }); if(n){ seen(); paint(); } }
function fmt(iso){ var t=new Date(iso); return isNaN(t)?"":t.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); }
var painted={};
function row(cls,node,time,isNew){   /* Nachricht mit kleinem Bild links (KI-Assistent bzw. Simon), Uhrzeit darunter */
  var r=h("div","fscc-r "+cls+(isNew?" new":"")), ln=h("div","row");
  if(cls==="ki"||cls==="me"){ var av=h("img","ava"); av.src=cls==="me"?"/logos/simon-avatar.jpg":KI_AV; av.alt=""; av.width=30; av.height=30; ln.appendChild(av); }
  ln.appendChild(node); r.appendChild(ln); if(time) r.appendChild(h("small",null,time)); return r;
}
function paint(){
  if(!built) return; var L=el.list, atEnd=L.scrollHeight-L.scrollTop-L.clientHeight<60, first=!L.childNodes.length; L.textContent="";
  var hi=h("div","fscc-m ki"); hi.appendChild(d.createTextNode("Hallo! 👋 Ich bin der digitale Assistent von FS Creative und helfe dir bei Fragen zu Website, Grafik und Druck."+(online?" Lieber mit Simon sprechen? Schreib es einfach – er ist gerade online.":" Simon meldet sich bei Bedarf persönlich.")+" Wie kann ich dir helfen?"));
  L.appendChild(row("ki",hi,"",first));
  var lastV=0; msgs.forEach(function(m){ if(m.from==="v") lastV=m.id; });   // „Gelesen“ unter der letzten eigenen Nachricht, sobald Simon die Unterhaltung geöffnet hat
  msgs.forEach(function(m){ var who=m.from==="v"||m.from==="me"||m.from==="ki"?m.from:"sys", b=h("div","fscc-m "+who), isNew=!painted[m.id]&&!first; painted[m.id]=1;
    if(who==="sys"){ b.appendChild(d.createTextNode(m.text)); L.appendChild(b); return; }
    if(m.from==="me") b.appendChild(h("span","who","Simon"));
    if(m.file){ b.classList.add("file"); b.appendChild(fileEl(m.file)); } else b.appendChild(d.createTextNode(m.text));
    L.appendChild(row(who,b,(m.from==="ki"?"KI · Angaben unverbindlich · ":"")+fmt(m.at)+(m.id===lastV&&meSeen>=m.id?" · ✓✓ Gelesen":""),isNew)); });
  if(first) msgs.forEach(function(m){ painted[m.id]=1; });
  if(typing){ var ty=h("div","fscc-ty"); ty.setAttribute("aria-label",(tyWho==="me"?"Simon":"Der Assistent")+" schreibt"); ty.appendChild(h("i")); ty.appendChild(h("i")); ty.appendChild(h("i")); var tr=row(tyWho==="me"?"me":"ki",ty,""); L.appendChild(tr); }
  el.pv.style.display=st.started?"none":""; el.nm.style.display=st.started&&st.name?"none":"";
  if(atEnd||sending||first) L.scrollTop=L.scrollHeight;
  note();
}
/* ── Anhänge ── */
function furl(f,dl){ return "/chat/api/file?c="+cid()+"&f="+encodeURIComponent(f.id)+(dl?"&dl=1":""); }
function size(n){ return n>=1048576?(n/1048576).toFixed(1).replace(".",",")+" MB":Math.max(1,Math.round(n/1024))+" KB"; }
function fileEl(f){
  if(/^image\//.test(f.type)){ var bt=h("button","fscc-img"), im=h("img"); bt.type="button"; bt.setAttribute("aria-label","Bild „"+f.name+"“ groß anzeigen"); im.src=furl(f); im.alt=f.name; im.loading="lazy"; bt.appendChild(im); bt.addEventListener("click",function(){ lightbox(f); }); return bt; }
  var w=h("div","fscc-pdf"), ic=h("span","ic","PDF"), nm=h("span","nm"), o=h("a",null,"Öffnen"), dl=h("a",null,"Download"); ic.setAttribute("aria-hidden","true");
  nm.appendChild(h("b",null,f.name)); nm.appendChild(h("span",null,"PDF · "+size(f.size))); o.href=furl(f); o.target="_blank"; o.rel="noopener"; dl.href=furl(f,1); dl.setAttribute("download",f.name);
  var ln=h("span"); ln.appendChild(o); ln.appendChild(dl); nm.appendChild(ln); w.appendChild(ic); w.appendChild(nm); return w;
}
function lightbox(f){
  var lb=h("div","fscc-lb"), im=h("img"), a=h("a",null,"Herunterladen"); lb.setAttribute("role","dialog"); lb.setAttribute("aria-label",f.name); lb.tabIndex=-1; im.src=furl(f); im.alt=f.name; a.href=furl(f,1); a.setAttribute("download",f.name);
  var close=function(){ lb.remove(); try{ el.in.focus({preventScroll:true}); }catch(e){} };
  lb.addEventListener("click",function(e){ if(e.target!==a) close(); }); lb.addEventListener("keydown",function(e){ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); } });
  lb.appendChild(im); lb.appendChild(a); d.body.appendChild(lb); lb.focus();
}
function hasFiles(e){ var t=e.dataTransfer&&e.dataTransfer.types; return !!t&&Array.prototype.indexOf.call(t,"Files")>-1; }
function queue(list){
  var bad=[]; Array.prototype.forEach.call(list||[],function(f){
    if(!FTYPES[f.type]&&!/\.(jpe?g|png|webp|pdf)$/i.test(f.name||"")) bad.push("„"+(f.name||"Datei")+"“: nur Bilder (JPG, PNG, WebP) und PDFs möglich.");
    else if(f.size>FMAX) bad.push("„"+(f.name||"Datei")+"“ ist zu groß ("+size(f.size)+") – höchstens 15 MB.");
    else if(!f.size) bad.push("„"+(f.name||"Datei")+"“ ist leer.");
    else upQ.push(f); });
  el.err.textContent=bad.join(" "); upNext();
}
function upErr(j,f){ var e=j&&j.error, n="„"+(f.name||"Datei")+"“";
  return e==="too_large"?n+" ist zu groß – höchstens 15 MB.":e==="bad_type"?n+" ist kein gültiges Bild (JPG, PNG, WebP) oder PDF.":e==="too_many_files"?"Höchstens "+((j&&j.max)||40)+" Dateien pro Unterhaltung.":e==="too_many"?"Zu viele Dateien auf einmal – bitte kurz warten.":n+" konnte nicht hochgeladen werden – bitte nochmal versuchen."; }
function upNext(){
  if(upBusy) return; var f=upQ.shift(); if(!f){ el.up.textContent=""; el.clip.disabled=false; return; }
  upBusy=true; el.clip.disabled=true; var rest=upQ.length, nm=el.nm.value.trim().slice(0,80), x=new XMLHttpRequest();
  var lbl=function(pc){ el.up.textContent="Lade „"+f.name+"“ hoch … "+pc+" %"+(rest?" (noch "+rest+" weitere)":""); }; lbl(0);
  x.open("POST","/chat/api/file?c="+cid()); x.setRequestHeader("Content-Type","application/octet-stream");
  x.setRequestHeader("X-File-Name",encodeURIComponent(f.name||"datei")); x.setRequestHeader("X-Chat-Page",encodeURIComponent(location.pathname)); if(nm) x.setRequestHeader("X-Chat-Name",encodeURIComponent(nm));
  x.upload.onprogress=function(e){ if(e.lengthComputable) lbl(Math.min(99,Math.round(e.loaded/e.total*100))); };
  var done=function(j){ upBusy=false;
    if(j&&j.ok){ st.started=1; if(nm) st.name=nm; save(); if(j.msg) add([j.msg]); typing=true; paint(); schedule(); }
    else el.err.textContent=(el.err.textContent?el.err.textContent+" ":"")+upErr(j,f);
    upNext(); };
  x.onload=function(){ var j=null; try{ j=JSON.parse(x.responseText); }catch(e){ j={ok:false,error:x.status===413?"too_large":"http"}; } done(j); };
  x.onerror=function(){ done({ok:false,error:"net"}); };
  x.send(f);
}
/* Warenkorb aus dem Druckshop (gleiche Domain) mitschicken – damit die KI Preise und Positionen sieht (Simon 16.11.2026) */
function cartSum(){ try{ var c=JSON.parse(localStorage.getItem("fsc-print-cart")||"null"); if(!c||!c.items||!c.items.length||Date.now()-(+c.at||0)>30*864e5) return null;
  return c.items.slice(0,10).map(function(x){ var p=x.price||{}, f=x.designFee||{}; return {t:String(x.title||"").slice(0,80),n:+(x.copies||x.n)||0,s:String(x.size||"").slice(0,40),l:(x.labels||[]).slice(0,8).map(function(l){ return String(l&&l[0]||"").slice(0,40)+": "+String(l&&l[1]||"").slice(0,80); }),g:+p.gross||0,fee:+f.gross||0}; }); }catch(e){ return null; } }
function send(){
  var text=el.in.value.trim(); if(!text||sending) return;
  if(text.length>2000){ el.err.textContent="Bitte höchstens 2000 Zeichen."; return; }
  var nm=el.nm.value.trim().slice(0,80); sending=true; el.s.disabled=true; el.err.textContent="";
  api("/chat/api/send",{cid:cid(),text:text,name:nm,page:location.pathname,website:el.hp.value,cart:cartSum()}).then(function(j){
    sending=false; el.s.disabled=false;
    if(!j||!j.ok){ el.err.textContent=j&&j.error==="too_many"?"Zu viele Nachrichten – bitte kurz warten.":j&&j.error==="too_long"?"Bitte höchstens 2000 Zeichen.":"Senden hat nicht geklappt – bitte nochmal versuchen."; return; }
    el.in.value=""; grow(); el.s.classList.add("idle"); st.started=1; if(nm) st.name=nm; save();
    if(j.msg) add([j.msg]); typing=true; paint(); schedule();
  }).catch(function(){ sending=false; el.s.disabled=false; el.err.textContent="Keine Verbindung – bitte nochmal versuchen."; });
}
if(d.readyState==="loading") d.addEventListener("DOMContentLoaded",init); else init();
/* Besucherzählung Druckshop (Simon 04.11.2026): /print-Seiten ohne Shop-Skript (Preise, Ratgeber, Hilfe, Landingpages, QR-Generator) senden dasselbe
   anonyme Lebenszeichen wie der Shop – Zufalls-ID je Tab (sessionStorage), kein Cookie, nichts Persönliches */
(function(){ if(!/^\/print(\/|$)/.test(location.pathname)||d.querySelector('script[src*="/print/app.js"]')) return;
  var sid=""; try{ sid=sessionStorage.getItem("psSid")||""; if(!sid){ sid=Math.random().toString(36).slice(2,12)+Date.now().toString(36); sessionStorage.setItem("psSid",sid); } }catch(e){ sid=Math.random().toString(36).slice(2,14)+"t"; }
  var lastBg=0, beat=function(bye){ var bg=d.hidden&&!bye; if(bg){ if(Date.now()-lastBg<55000) return; lastBg=Date.now(); }
    try{ fetch("/print/api/hb",{method:"POST",keepalive:true,credentials:"same-origin",headers:{"Content-Type":"application/json","X-Print-Shop":"1"},body:JSON.stringify({sid:sid,path:location.pathname,step:0,prod:"",view:"seite",cart:0,items:[],bg:bg,bye:!!bye})}).catch(function(){}); }catch(e){} };
  setTimeout(beat,1500); setInterval(beat,25000); d.addEventListener("visibilitychange",function(){ if(!d.hidden) beat(); }); window.addEventListener("pagehide",function(){ beat(true); });
})();
})();
