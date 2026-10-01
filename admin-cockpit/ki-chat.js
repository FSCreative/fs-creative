/* KI (Claude) – Cockpit-Assistent: Chat-Fenster (Seitenleiste „KI-Assistent“ oder ⌘J / Strg+J).
   Antworten kommen gestreamt (Server-Sent Events). Der Assistent liest Cockpit-Daten über Werkzeuge am Server;
   To-Dos, Termine und Mail-Entwürfe kommen nur als Vorschlag und werden erst mit Klick angelegt. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
var LSK="fsc_ki_chat_v1";
var CH={sid:"",items:[],busy:false,ctrl:null};
(function(){ var s=F.ls(LSK); if(s&&s.sid&&Array.isArray(s.items)){ CH.sid=s.sid; CH.items=s.items.slice(-30); } if(!CH.sid) CH.sid="c"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); })();
function save(){ F.ls(LSK,{sid:CH.sid,items:CH.items.slice(-30).map(function(it){ return {role:it.role,text:String(it.text||"").slice(0,6000),proposals:it.proposals||[],error:it.error||"",tools:it.tools||[]}; })}); }

/* ---------- Darstellung ---------- */
function md(t){
  var h=esc(t||"");
  h=h.replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>").replace(/`([^`\n]+)`/g,"<code>$1</code>");
  var lines=h.split("\n"), out=[], inList=false;
  lines.forEach(function(l){ var m=l.match(/^\s*[-•*]\s+(.*)$/);
    if(m){ if(!inList){ out.push("<ul>"); inList=true; } out.push("<li>"+m[1]+"</li>"); return; }
    if(inList){ out.push("</ul>"); inList=false; }
    var hh=l.match(/^#{1,4}\s+(.*)$/); out.push(hh?"<p><b>"+hh[1]+"</b></p>":(l.trim()?"<p>"+l+"</p>":"")); });
  if(inList) out.push("</ul>");
  return out.join("");
}
function propHtml(p,i,j){
  var d=p.data||{}, done=p.done, body, btn;
  if(p.kind==="todo"){ body='<b>To-Do:</b> '+esc(d.text)+(d.due?' <span class="muted">fällig '+esc(F.de(d.due))+'</span>':''); btn="Anlegen"; }
  else if(p.kind==="event"){ body='<b>Termin:</b> '+esc(d.title)+' <span class="muted">'+esc(F.de(d.date))+(d.time?" "+esc(d.time)+(d.endTime?"–"+esc(d.endTime):""):"")+(d.location?" · "+esc(d.location):"")+'</span>'; btn="Anlegen"; }
  else { body='<b>Mail an '+esc(d.to||"?")+':</b> '+esc(d.subject||"")+'<div class="kich-mail">'+esc(String(d.text||"").slice(0,600))+(String(d.text||"").length>600?" …":"")+'</div>'; btn="Im Mail-Editor öffnen"; }
  return '<div class="kich-prop">'+body+'<div class="row">'+(done?'<span class="tag ok">'+esc(done)+'</span>':'<button type="button" class="btn primary" data-act="kiprop:'+i+'|'+j+'">'+btn+'</button><button type="button" class="btn" data-act="kipropx:'+i+'|'+j+'">Verwerfen</button>')+'</div></div>';
}
function itemHtml(it,i){
  if(it.role==="user") return '<div class="kich-u">'+esc(it.text)+'</div>';
  var tools=(it.tools||[]).length?'<div class="kich-tools">'+it.tools.map(function(t){ return '<span>'+F.svg("search")+esc(t)+'</span>'; }).join("")+'</div>':'';
  return '<div class="kich-a">'+tools+(it.text?md(it.text):(CH.busy&&i===CH.items.length-1&&!it.error?'<p class="muted kich-dots">Denke nach …</p>':''))+
    (it.notice?'<p class="muted">'+esc(it.notice)+'</p>':'')+(it.error?'<p class="bad-t">'+esc(it.error)+'</p>':'')+(it.proposals||[]).map(function(p,j){ return propHtml(p,i,j); }).join("")+'</div>';
}
var SUGG=["Was steht heute an?","Welche Rechnungen sind überfällig?","Wie sieht die UVA für dieses Quartal aus?","Gibt es neue Anfragen von Kunden?","Welche Termine habe ich diese Woche?"];
function logHtml(){
  if(!CH.items.length) return '<div class="kich-empty">'+F.svg("spark")+'<b>Frag dein Cockpit</b><span>Finanzen, UVA, Postfach, Termine, To-Dos, Plattformen, Websites. Änderungen schlägt der Assistent nur vor – anlegen tust du mit einem Klick.</span>'+
    (K.st&&!K.st.configured?'<span class="bad-t">'+esc(K.NOT_SET)+'</span>':'<div class="kich-sugg">'+SUGG.map(function(s){ return '<button type="button" class="btn" data-kisugg="'+esc(s)+'">'+esc(s)+'</button>'; }).join("")+'</div>')+'</div>';
  return CH.items.map(itemHtml).join("");
}
function host(){
  var h=document.getElementById("kiChat"); if(h) return h;
  h=document.createElement("section"); h.id="kiChat"; h.className="kichat"; h.hidden=true; h.setAttribute("aria-label","KI-Assistent");
  h.innerHTML='<div class="kich-h"><span class="kich-t">'+F.svg("spark")+'<b>KI-Assistent</b><span class="muted">Claude Opus 5.5</span></span><button type="button" class="btn icon" data-act="kichatnew" title="Neues Gespräch" aria-label="Neues Gespräch">↺</button><button type="button" class="btn icon" data-act="kichat" title="Schließen (Esc)" aria-label="Schließen">'+F.svg("close")+'</button></div>'+
    '<div class="kich-log" id="kiLog" aria-live="polite"></div><form class="kich-in" id="kiForm"><textarea id="kiIn" rows="2" placeholder="Frag etwas … (Enter senden, Umschalt+Enter neue Zeile)" aria-label="Nachricht an den Assistenten"></textarea><button type="submit" class="btn primary" id="kiSend">Senden</button></form>';
  document.body.appendChild(h);
  h.querySelector("#kiForm").addEventListener("submit",function(e){ e.preventDefault(); send(); });
  h.querySelector("#kiIn").addEventListener("keydown",function(e){ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); send(); } if(e.key==="Escape"){ e.stopPropagation(); toggle(false); } });
  h.addEventListener("click",function(e){ var b=e.target.closest("[data-kisugg]"); if(b){ document.getElementById("kiIn").value=b.getAttribute("data-kisugg"); send(); } });
  return h;
}
function paint(scroll){
  var log=document.getElementById("kiLog"); if(!log) return;
  var near=log.scrollHeight-log.scrollTop-log.clientHeight<80;
  log.innerHTML=logHtml();
  if(scroll||near) log.scrollTop=log.scrollHeight;
  var b=document.getElementById("kiSend"); if(b){ b.textContent=CH.busy?"Stopp":"Senden"; b.classList.toggle("primary",!CH.busy); }
}
function toggle(on){
  var h=host(); if(on===undefined) on=h.hidden; h.hidden=!on; document.body.classList.toggle("kichat-on",on);
  if(on){ K.load(false).then(function(){ paint(true); }); paint(true); setTimeout(function(){ var i=document.getElementById("kiIn"); if(i) i.focus(); },30); }
}
K.chatSend=function(text){ toggle(true); var i=document.getElementById("kiIn"); if(i&&text){ i.value=text; send(); } };
K.chatOpen=function(text){ toggle(true); if(text){ var i=document.getElementById("kiIn"); if(i){ i.value=text; i.focus(); } } };
F.action("kichat",function(){ toggle(); });
F.action("kichatnew",function(){ if(CH.ctrl) CH.ctrl.abort(); F.api("/admin/api/ki/chat-reset",{body:{sessionId:CH.sid}}).catch(function(){}); CH.sid="c"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); CH.items=[]; CH.busy=false; save(); paint(true); var i=document.getElementById("kiIn"); if(i) i.focus(); });
document.addEventListener("keydown",function(e){
  if((e.metaKey||e.ctrlKey)&&!e.shiftKey&&!e.altKey&&String(e.key).toLowerCase()==="j"){ e.preventDefault(); toggle(); }
  else if(e.key==="Escape"){ var h=document.getElementById("kiChat"); if(h&&!h.hidden&&!F.modalOpen()) toggle(false); }
});

/* ---------- Senden + Stream lesen ---------- */
function send(){
  if(CH.busy){ if(CH.ctrl) CH.ctrl.abort(); return; }
  var inp=document.getElementById("kiIn"), text=(inp.value||"").trim(); if(!text) return;
  inp.value="";
  var history=CH.items.filter(function(x){ return x.text; }).slice(-8).map(function(x){ return {role:x.role,text:x.text}; });
  CH.items.push({role:"user",text:text}); var a={role:"assistant",text:"",tools:[],proposals:[]}; CH.items.push(a);
  CH.busy=true; paint(true);
  var ctrl=window.AbortController?new AbortController():null; CH.ctrl=ctrl;
  var finish=function(){ CH.busy=false; CH.ctrl=null; save(); paint(); K.load(true); };
  fetch("/admin/api/ki/chat",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify({sessionId:CH.sid,message:text,history:history}),signal:ctrl?ctrl.signal:undefined})
    .then(function(r){
      if(r.redirected&&/\/admin\/login/.test(r.url)){ location.href="/admin/login"; throw new Error("login"); }
      var ct=r.headers.get("content-type")||"";
      if(!/event-stream/.test(ct)) return r.json().then(function(j){ a.error=(j&&j.error)||("Fehler "+r.status); if(j&&j.code==="not_configured"&&K.st) K.st.configured=false; });
      var rd=r.body.getReader(), dec=new TextDecoder(), buf="";
      function handle(ev,data){
        var d; try{ d=JSON.parse(data); }catch(e){ return; }
        if(ev==="delta"){ if(d.t) a.text+=d.t; else if(a.text&&!/\n\n$/.test(a.text)) a.text+="\n\n"; }
        else if(ev==="tool"){ if(a.tools.indexOf(d.label)<0) a.tools.push(d.label); }
        else if(ev==="proposal") a.proposals.push({kind:d.kind,data:d.data});
        else if(ev==="notice") a.notice=d.t;
        else if(ev==="error") a.error=d.error;
        paint();
      }
      function pump(){ return rd.read().then(function(res){
        if(res.done) return;
        buf+=dec.decode(res.value,{stream:true});
        var parts=buf.split("\n\n"); buf=parts.pop();
        parts.forEach(function(chunk){ var ev="message", data=""; chunk.split("\n").forEach(function(l){ if(l.indexOf("event: ")===0) ev=l.slice(7); else if(l.indexOf("data: ")===0) data+=l.slice(6); }); if(data) handle(ev,data); });
        return pump(); }); }
      return pump();
    })
    .then(function(){ a.text=a.text.replace(/\s+$/,""); finish(); })
    .catch(function(e){ if(e&&e.name==="AbortError") a.notice="Abgebrochen."; else if(String(e&&e.message)!=="login") a.error="Keine Verbindung zum Server."; finish(); });
}

/* ---------- Vorschläge bestätigen ---------- */
function propOf(v){ var p=v.split("|"), it=CH.items[+p[0]]; return it&&it.proposals?it.proposals[+p[1]]:null; }
F.action("kipropx",function(v){ var p=propOf(v); if(!p) return; p.done="verworfen"; save(); paint(); });
F.action("kiprop",function(v){
  var p=propOf(v); if(!p||p.done) return; var d=p.data||{};
  var ok=function(t){ p.done=t; save(); paint(); };
  if(p.kind==="todo"){ if(!F.D){ F.toast("Daten noch nicht geladen.",true); return; } F.addTodo({text:d.text,due:d.due||""}).then(function(j){ if(j&&j.ok!==false) { ok("angelegt"); F.toast("To-Do angelegt"); } }); return; }
  if(p.kind==="event"){
    var ev={id:"e"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),title:d.title,date:d.date,time:d.time||"",endTime:d.endTime||"",location:d.location||"",notes:d.notes||"",source:"manual"};
    F.api("/admin/api/events").then(function(cur){ var base=(cur&&Array.isArray(cur.events))?cur.events:null; if(!base) throw new Error("load"); return F.api("/admin/api/events",{body:{events:base.concat([ev]),base:base}}); })
      .then(function(j){ if(j&&j.ok!==false&&Array.isArray(j.events)){ ok("angelegt"); F.toast("Termin angelegt",false,"Kalender",function(){ F.go("kal"); }); F.load(true); } else F.toast("Termin konnte nicht gespeichert werden.",true); })
      .catch(function(){ F.toast("Termine konnten nicht geladen werden.",true); });
    return;
  }
  if(p.kind==="mail"){
    var M=F.M||{}, m=d.mailId&&M.find?M.find(d.mailId):null;
    F.compose({title:m?"Antworten":"Neue Mail",to:d.to||(m&&(m.replyTo||m.from))||"",subject:d.subject||(m?"Re: "+String(m.subject||"").replace(/^(re|aw)\s*:\s*/i,""):""),text:d.text,inReplyTo:m&&m.messageId||undefined,account:m&&M.accOf?M.accOf(m):undefined});
    ok("im Editor geöffnet");
  }
});

/* ---------- Seitenleiste ---------- */
function rail(){
  var rf=document.querySelector(".rail-foot"); if(!rf||document.getElementById("rfKi")) return;
  var b=document.createElement("button"); b.type="button"; b.id="rfKi"; b.className="rf-ic"; b.setAttribute("data-act","kichat"); b.innerHTML=F.svg("spark")+'<span>KI-Assistent</span><span class="muted" style="margin-left:auto">⌘J</span>';
  rf.insertBefore(b,rf.firstChild);
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",rail); else rail();

F.css([
".kichat{position:fixed;right:16px;bottom:16px;top:16px;width:min(440px,calc(100vw - 32px));z-index:80;background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden}",
".kichat[hidden]{display:none}",
".kich-h{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}",
".kich-t{display:flex;align-items:center;gap:7px;margin-right:auto;min-width:0}.kich-t svg{width:17px;height:17px}",
".kich-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px}",
".kich-u{align-self:flex-end;max-width:85%;background:var(--ink);color:var(--ground);padding:8px 12px;border-radius:14px 14px 4px 14px;white-space:pre-wrap;overflow-wrap:anywhere}",
".kich-a{max-width:100%;overflow-wrap:anywhere;font-size:14.5px}.kich-a p{margin:0 0 8px}.kich-a ul{margin:0 0 8px;padding-left:20px}.kich-a code{background:var(--sunk);padding:0 4px;border-radius:4px}",
".kich-tools{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px}.kich-tools span{display:inline-flex;gap:4px;align-items:center;font-size:12px;color:var(--ink-3);background:var(--sunk);border-radius:99px;padding:2px 8px}.kich-tools svg{width:11px;height:11px}",
".kich-prop{border:1px solid var(--line);border-radius:11px;padding:9px 11px;display:grid;gap:7px;margin-top:6px;background:var(--sunk)}",
".kich-mail{white-space:pre-wrap;font-size:13px;color:var(--ink-2);max-height:140px;overflow:auto}",
".kich-in{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line);align-items:flex-end}",
".kich-in textarea{flex:1;resize:none;border:1px solid var(--line);border-radius:12px;padding:8px 10px;background:var(--panel);color:var(--ink);font:inherit;max-height:160px}",
".kich-empty{margin:auto;display:grid;gap:8px;text-align:center;justify-items:center;color:var(--ink-2);max-width:340px}.kich-empty svg{width:28px;height:28px;color:var(--info)}",
".kich-sugg{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}.kich-sugg .btn{white-space:normal}",
".kich-dots{animation:kipulse 1.2s ease-in-out infinite}@keyframes kipulse{50%{opacity:.4}}",
"@media (max-width:700px){.kichat{left:0;right:0;top:0;bottom:0;width:auto;border-radius:0}}"
].join("\n"));
})();
