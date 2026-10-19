/* FS Creative – Website-Chat (ausgeliefert als /chat/w.js?v=…, Server: chat.js). Lädt mit defer, baut das Fenster erst beim ersten Öffnen.
   Unterhaltungs-ID zufällig in localStorage „fsc-chat“ (bleibt beim Seitenwechsel), Nachrichten nur als Text (textContent, nie HTML). */
(function(){
"use strict";
var W=window, d=document;
if(W.__fscChat||/^\/admin/.test(location.pathname)||!W.fetch||!W.JSON) return; W.__fscChat=1;
var K="fsc-chat", st={}, online=false, built=false, isOpen=false, msgs=[], last=0, pollT=null, bgT=null, typing=false, sending=false, closed=false, el={};
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
var IC='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/></svg>';
var CSS='.fscc-print{position:fixed;right:90px;bottom:calc(29px + var(--fscc-tb,0px));z-index:300;height:40px;display:inline-flex;align-items:center;gap:7px;padding:0 16px 0 13px;border-radius:999px;background:#ffd60a;color:#1d1d1f;font:800 13.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;letter-spacing:.08em;text-decoration:none;box-shadow:0 10px 26px rgba(0,0,0,.32);transition:transform .2s;-webkit-tap-highlight-color:transparent}.fscc-print:hover{transform:translateY(-2px)}.fscc-print:focus-visible{outline:3px solid var(--text,#fff);outline-offset:3px}.fscc-print svg{width:18px;height:18px;flex:none}'+
'.fscc-b{position:fixed;right:20px;bottom:calc(20px + var(--fscc-tb,0px));z-index:300;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--accent,#0a84ff);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,0,.35);transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent}'+
'.fscc-b:hover{transform:translateY(-2px) scale(1.04)}.fscc-b:focus-visible{outline:3px solid var(--text,#fff);outline-offset:3px}.fscc-b[aria-expanded=true]{transform:scale(.9);opacity:0;pointer-events:none}'+
'.fscc-dot{position:absolute;right:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#8e8e93;border:2.5px solid var(--bg,#0a0a0f)}.fscc-dot.on{background:#30d158}'+
'.fscc-n{position:absolute;left:-4px;top:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#ff453a;color:#fff;font:700 12px/20px system-ui,-apple-system,sans-serif;text-align:center}'+
'.fscc-p{position:fixed;right:20px;bottom:calc(20px + var(--fscc-tb,0px));z-index:400;width:380px;max-width:calc(100vw - 40px);height:min(620px,calc(100vh - 40px - var(--fscc-tb,0px)));display:flex;flex-direction:column;background:var(--bg-soft,#111118);color:var(--text,#f5f5f7);border:1px solid var(--border-2,rgba(255,255,255,.14));border-radius:20px;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;opacity:0;transform:translateY(16px) scale(.98);transition:opacity .2s,transform .2s;pointer-events:none}'+
'.fscc-p.on{opacity:1;transform:none;pointer-events:auto}.fscc-p *{box-sizing:border-box}'+
'.fscc-h{display:flex;align-items:center;gap:11px;padding:14px 14px 12px 16px;border-bottom:1px solid var(--border,rgba(255,255,255,.09))}'+
'.fscc-av{position:relative;width:40px;height:40px;border-radius:50%;background:#0a0a0f;flex:none;display:flex;align-items:center;justify-content:center}.fscc-av img{width:26px;height:26px;object-fit:contain}.fscc-av .fscc-dot{right:-1px;top:auto;bottom:-1px;width:13px;height:13px;border-color:var(--bg-soft,#111118)}'+
'.fscc-t{flex:1;min-width:0}.fscc-t b{display:block;font-size:15.5px}.fscc-t span{display:block;font-size:12.5px;color:var(--text-dim,#a1a1aa)}'+
'.fscc-x{width:36px;height:36px;border-radius:50%;border:0;background:var(--surface-2,rgba(255,255,255,.06));color:inherit;cursor:pointer;font-size:20px;line-height:1;display:flex;align-items:center;justify-content:center}.fscc-x:focus-visible,.fscc-s:focus-visible{outline:2px solid var(--accent,#0a84ff);outline-offset:2px}'+
'.fscc-off{margin:10px 12px 0;padding:9px 12px;border-radius:12px;background:var(--surface-2,rgba(255,255,255,.06));font-size:13px;color:var(--text-dim,#a1a1aa)}'+
'.fscc-l{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px;overscroll-behavior:contain}'+
'.fscc-m{max-width:84%;padding:8px 12px;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14.5px}.fscc-m small{display:block;font-size:11px;opacity:.7;margin-top:2px}'+
'.fscc-m.v{align-self:flex-end;background:var(--accent,#0a84ff);color:#fff;border-bottom-right-radius:5px}.fscc-m.me,.fscc-m.ki{align-self:flex-start;background:var(--surface-2,rgba(255,255,255,.07));border-bottom-left-radius:5px}'+
'.fscc-m .who{display:block;font-size:11px;font-weight:700;opacity:.75;margin-bottom:1px}.fscc-m.sys{align-self:center;max-width:92%;background:none;color:var(--text-dim,#a1a1aa);font-size:12.5px;text-align:center;padding:4px 8px}'+
'.fscc-ty{align-self:flex-start;color:var(--text-dim,#a1a1aa);font-size:12.5px;padding:2px 6px}.fscc-hi{align-self:center;text-align:center;color:var(--text-dim,#a1a1aa);font-size:13.5px;padding:18px 10px 8px}'+
'.fscc-pv{font-size:11.5px;color:var(--text-faint,#6e6e78);padding:0 14px 6px;text-align:center}.fscc-pv a{color:inherit;text-decoration:underline}'+
'.fscc-f{border-top:1px solid var(--border,rgba(255,255,255,.09));padding:10px 10px calc(10px + env(safe-area-inset-bottom));display:grid;gap:8px}'+
'.fscc-nm,.fscc-in{width:100%;border:1px solid var(--border-2,rgba(255,255,255,.14));background:var(--bg,#0a0a0f);color:inherit;border-radius:14px;padding:9px 12px;font:inherit;font-size:16px}.fscc-nm{font-size:14px;padding:7px 12px}'+
'.fscc-nm:focus,.fscc-in:focus{outline:none;border-color:var(--accent,#0a84ff)}.fscc-row{display:flex;gap:8px;align-items:flex-end}.fscc-in{resize:none;max-height:130px;min-height:42px;line-height:1.35}'+
'.fscc-s{flex:none;width:42px;height:42px;border-radius:50%;border:0;background:var(--accent,#0a84ff);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}.fscc-s:disabled{opacity:.45;cursor:default}'+
'.fscc-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;opacity:0}.fscc-err{font-size:12.5px;color:#ff6961;padding:0 4px}'+
'html.light .fscc-p{box-shadow:0 24px 60px rgba(18,20,28,.18)}html.light .fscc-b{box-shadow:0 10px 26px rgba(18,20,28,.25)}'+
'@media(max-width:640px){.fscc-print{right:78px;bottom:calc(21px + var(--fscc-tb,0px));height:40px;padding:0 14px 0 11px}.fscc-b{right:14px;bottom:calc(14px + var(--fscc-tb,0px));width:54px;height:54px}.fscc-p{right:0;left:0;top:0;bottom:0;width:100%;max-width:none;height:100%;height:100dvh;border-radius:0;border:0}}'+
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
function label(){ if(!btn) return; btn.setAttribute("aria-label","Chat öffnen – "+(online?"Simon ist online":"Simon ist gerade offline, die KI nimmt deine Anfrage an")); dot.className="fscc-dot"+(online?" on":""); if(el.adot) el.adot.className="fscc-dot"+(online?" on":""); }
function setBadge(n){ if(!btn) return; if(n>0&&!isOpen){ if(!badge){ badge=h("span","fscc-n"); badge.setAttribute("aria-hidden","true"); btn.appendChild(badge); } badge.textContent=n>9?"9+":String(n); } else if(badge){ badge.remove(); badge=null; } }
function checkStatus(){
  var q=st.cid&&st.started?"?c="+st.cid+"&a="+(st.seen||0):"";
  api("/chat/api/status"+q).then(function(j){ if(!j||!j.ok) return; online=!!j.online; label(); setBadge(j.n||0); }).catch(function(){});
  bg();
}
/* geschlossen: alle 30 s nach Antworten schauen (nur wenn schon geschrieben wurde und der Tab sichtbar ist) */
function bg(){ clearTimeout(bgT); if(st.started&&!isOpen) bgT=setTimeout(function(){ if(isOpen) return; if(!d.hidden) checkStatus(); else bg(); },30000); }

function build(){
  built=true;
  var p=el.p=h("div","fscc-p"); p.id="fscc-panel"; p.setAttribute("role","dialog"); p.setAttribute("aria-label","Chat mit FS Creative"); p.setAttribute("aria-hidden","true");
  var hd=h("div","fscc-h"), av=h("div","fscc-av"), img=h("img"); img.src="/logos/Logo%20Gl%C3%BChbirne%20Weiss.png"; img.alt=""; img.width=26; img.height=26; av.appendChild(img); el.adot=h("span","fscc-dot"); av.appendChild(el.adot);
  var t=h("div","fscc-t"); el.title=h("b"); el.sub=h("span"); t.appendChild(el.title); t.appendChild(el.sub);
  var x=h("button","fscc-x","×"); x.type="button"; x.setAttribute("aria-label","Chat schließen"); x.addEventListener("click",function(){ toggle(false); });
  hd.appendChild(av); hd.appendChild(t); hd.appendChild(x); p.appendChild(hd);
  el.off=h("div","fscc-off","Ich bin gerade nicht online – aber meine KI kann deine Anfrage annehmen."); el.off.setAttribute("role","note"); p.appendChild(el.off);
  el.list=h("div","fscc-l"); el.list.setAttribute("role","log"); el.list.setAttribute("aria-live","polite"); el.list.setAttribute("aria-label","Nachrichten"); el.list.tabIndex=0; p.appendChild(el.list);
  el.pv=h("div","fscc-pv"); el.pv.appendChild(d.createTextNode("Mit dem Chat akzeptierst du unsere ")); var a=h("a",null,"Datenschutzerklärung"); a.href="/datenschutz"; el.pv.appendChild(a); el.pv.appendChild(d.createTextNode(".")); p.appendChild(el.pv);
  var f=el.form=h("form","fscc-f"); f.setAttribute("novalidate","");
  el.nm=h("input","fscc-nm"); el.nm.type="text"; el.nm.maxLength=80; el.nm.placeholder="Dein Name (optional)"; el.nm.autocomplete="name"; el.nm.setAttribute("aria-label","Dein Name (optional)"); if(st.name) el.nm.value=st.name;
  el.hp=h("input","fscc-hp"); el.hp.type="text"; el.hp.name="website"; el.hp.tabIndex=-1; el.hp.autocomplete="off"; el.hp.setAttribute("aria-hidden","true");
  var row=h("div","fscc-row"); el.in=h("textarea","fscc-in"); el.in.rows=1; el.in.maxLength=2000; el.in.placeholder="Schreib eine Nachricht …"; el.in.setAttribute("aria-label","Nachricht");
  el.s=h("button","fscc-s"); el.s.type="submit"; el.s.setAttribute("aria-label","Senden"); el.s.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
  row.appendChild(el.in); row.appendChild(el.s); el.err=h("div","fscc-err"); el.err.setAttribute("role","status");
  f.appendChild(el.nm); f.appendChild(el.hp); f.appendChild(row); f.appendChild(el.err); p.appendChild(f);
  el.in.addEventListener("input",grow);
  el.in.addEventListener("keydown",function(e){ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); send(); } });
  f.addEventListener("submit",function(e){ e.preventDefault(); send(); });
  p.addEventListener("keydown",function(e){ if(e.key==="Escape"){ e.preventDefault(); toggle(false); } });
  d.body.appendChild(p); head();
}
function grow(){ el.in.style.height="auto"; el.in.style.height=Math.min(130,el.in.scrollHeight+2)+"px"; }
function head(){ if(!built) return; el.title.textContent=online?"Simon ist online":"FS Creative"; el.sub.textContent=online?"Antwortet dir hier persönlich":"Gerade nicht online · KI-Assistent hilft weiter"; el.off.style.display=online?"none":""; label(); }
function toggle(on){
  if(on===isOpen) return; isOpen=on;
  if(on&&!built) build();
  btn.setAttribute("aria-expanded",String(on)); el.p.setAttribute("aria-hidden",String(!on)); el.p.classList.toggle("on",on);
  if(on){ setBadge(0); start(); setTimeout(function(){ try{ el.in.focus({preventScroll:true}); }catch(e){ el.in.focus(); } },60); }
  else { clearTimeout(pollT); btn.focus(); checkStatus(); }
}
function start(){
  paint();
  api("/chat/api/start",{cid:cid(),page:location.pathname}).then(function(j){ if(!j||!j.ok) return; online=!!j.online; closed=!!j.closed; typing=!!j.typing; msgs=j.msgs||[]; last=msgs.length?msgs[msgs.length-1].id:0; if(j.name&&!el.nm.value) el.nm.value=j.name; seen(); head(); paint(); schedule(); }).catch(function(){ schedule(); });
}
function seen(){ if(last&&last!==st.seen){ st.seen=last; save(); } }
function schedule(){ clearTimeout(pollT); if(isOpen) pollT=setTimeout(poll,typing?2500:4000); }
function poll(){
  if(!isOpen||d.hidden){ schedule(); return; }
  api("/chat/api/poll?c="+cid()+"&after="+last).then(function(j){ if(j&&j.ok){ var ch=online!==!!j.online||typing!==!!j.typing; online=!!j.online; typing=!!j.typing; closed=!!j.closed; add(j.msgs||[]); if(ch){ head(); paint(); } } schedule(); }).catch(schedule);
}
function add(arr){ var n=0; arr.forEach(function(m){ if(m.id>last){ msgs.push(m); last=m.id; n++; } }); if(n){ seen(); paint(); } }
function fmt(iso){ var t=new Date(iso); return isNaN(t)?"":t.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); }
function paint(){
  if(!built) return; var L=el.list, atEnd=L.scrollHeight-L.scrollTop-L.clientHeight<60; L.textContent="";
  if(!msgs.length) L.appendChild(h("div","fscc-hi",online?"Hallo! 👋 Wie kann ich dir helfen? Schreib mir einfach hier.":"Hallo! 👋 Erzähl kurz, worum es geht – Website, Grafik, Druck oder etwas anderes. Simon meldet sich persönlich."));
  msgs.forEach(function(m){ var b=h("div","fscc-m "+(m.from==="v"||m.from==="me"||m.from==="ki"||m.from==="sys"?m.from:"sys"));
    if(m.from==="me"||m.from==="ki") b.appendChild(h("span","who",m.from==="me"?"Simon":"KI-Assistent · Angaben unverbindlich"));
    b.appendChild(d.createTextNode(m.text)); if(m.from!=="sys") b.appendChild(h("small",null,fmt(m.at))); L.appendChild(b); });
  if(typing) L.appendChild(h("div","fscc-ty","schreibt …"));
  el.pv.style.display=st.started?"none":""; el.nm.style.display=st.started&&st.name?"none":"";
  if(atEnd||sending) L.scrollTop=L.scrollHeight;
}
function send(){
  var text=el.in.value.trim(); if(!text||sending) return;
  if(text.length>2000){ el.err.textContent="Bitte höchstens 2000 Zeichen."; return; }
  var nm=el.nm.value.trim().slice(0,80); sending=true; el.s.disabled=true; el.err.textContent="";
  api("/chat/api/send",{cid:cid(),text:text,name:nm,page:location.pathname,website:el.hp.value}).then(function(j){
    sending=false; el.s.disabled=false;
    if(!j||!j.ok){ el.err.textContent=j&&j.error==="too_many"?"Zu viele Nachrichten – bitte kurz warten.":j&&j.error==="too_long"?"Bitte höchstens 2000 Zeichen.":"Senden hat nicht geklappt – bitte nochmal versuchen."; return; }
    el.in.value=""; grow(); st.started=1; if(nm) st.name=nm; save();
    if(j.msg) add([j.msg]); if(!online) typing=true; paint(); schedule();
  }).catch(function(){ sending=false; el.s.disabled=false; el.err.textContent="Keine Verbindung – bitte nochmal versuchen."; });
}
if(d.readyState==="loading") d.addEventListener("DOMContentLoaded",init); else init();
})();
