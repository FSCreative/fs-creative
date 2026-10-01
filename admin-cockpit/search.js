/* Schnellsuche / Befehlspalette (⌘K bzw. Strg+K): Seiten, Aktionen und Treffer aus allen Modulen (F.searchers). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;

F.css(
'.cmdk{position:fixed;inset:0;z-index:80;display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;background:rgba(10,14,12,.45)}'+
'.cmdk.on{display:flex}'+
'.cmdk .box{width:min(640px,100%);max-height:min(560px,76vh);display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25)}'+
'.cmdk .in{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}'+
'.cmdk .in svg{width:18px;height:18px;color:var(--ink-3);flex:none}'+
'.cmdk .in input{flex:1;min-width:0;border:0;background:none;font-size:16px;outline:none;padding:4px 0}'+
'.cmdk .res{overflow-y:auto;padding:6px;flex:1}'+
'.cmdk .grp{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:600;padding:10px 10px 4px}'+
'.cmdk .it{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;padding:8px 10px;border-radius:10px;min-width:0;color:var(--ink)}'+
'.cmdk .it.on{background:var(--sunk)}'+
'.cmdk .it .ii{width:18px;height:18px;flex:none;color:var(--ink-2)}'+
'.cmdk .it .ii svg{width:18px;height:18px}'+
'.cmdk .it .tt{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 auto}'+
'.cmdk .it .ss{margin-left:auto;color:var(--ink-3);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:0 1 45%;text-align:right}'+
'.cmdk .foot{display:flex;gap:14px;padding:8px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-3);flex-wrap:wrap}'+
'.cmdk kbd{font:11px var(--f-mono);border:1px solid var(--line);border-radius:5px;padding:0 5px;margin-right:4px;background:var(--sunk)}'+
'.cmdk .none{padding:26px;text-align:center;color:var(--ink-3)}'+
'@media (max-width:900px){.cmdk{padding:10px}.cmdk .box{max-height:calc(100vh - 20px);max-height:calc(100dvh - 20px)}.cmdk .foot{display:none}.cmdk .it .ss{display:none}}'
);
F.icons.todo=F.icons.todo||'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>';
F.icons.bolt=F.icons.bolt||'<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>';
F.icons.eye=F.icons.eye||'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>';
F.icons.refresh=F.icons.refresh||'<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>';

var GROUP_ICON={"Seiten":null,"Aktionen":"bolt","Mails":"post","To-Dos":"todo","Termine":"kal","Rechnungen":"euro","Kunden & Leads":"kunden","Einstellungen":"gear","Websites":"web","Plattformen":"plat"};
var host=null, sel=0, items=[], lastFocus=null;

function ensure(){
  if(host) return host;
  host=document.createElement("div"); host.className="cmdk"; host.id="cmdk";
  host.setAttribute("role","dialog"); host.setAttribute("aria-modal","true"); host.setAttribute("aria-label","Schnellsuche");
  host.innerHTML='<div class="box"><div class="in">'+F.svg("search")+'<input id="cmdkIn" type="text" placeholder="Seite, Aktion, Mail, Kunde, Rechnung … suchen" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cmdkRes" aria-autocomplete="list"></div><div class="res" id="cmdkRes" role="listbox"></div>'+
    '<div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd>wählen</span><span><kbd>↵</kbd>öffnen</span><span><kbd>Esc</kbd>schließen</span></div></div>';
  document.body.appendChild(host);
  var inp=host.querySelector("#cmdkIn");
  inp.addEventListener("input",function(){ sel=0; build(); });
  host.addEventListener("mousedown",function(e){ if(e.target===host){ e.preventDefault(); close(); } });
  host.addEventListener("click",function(e){ var it=e.target.closest("[data-ci]"); if(it){ e.preventDefault(); e.stopPropagation(); run(+it.getAttribute("data-ci")); } });
  host.addEventListener("mousemove",function(e){ var it=e.target.closest("[data-ci]"); if(!it) return; var n=+it.getAttribute("data-ci"); if(n!==sel){ sel=n; mark(false); } });
  return host;
}
function isOpen(){ return !!(host&&host.classList.contains("on")); }

/* ---------- Einträge ---------- */
function has(n){ return typeof F.actions[n]==="function"; }
function baseActions(){
  var p=!!F.ls("fsc_priv"), t=F.theme();
  var a=[
    {label:"Neue Mail schreiben",sub:"Postfach",icon:"post",act:"_compose",kw:"mail schreiben e-mail verfassen"},
    {label:"Neue Rechnung (sevDesk)",sub:"Entwurf anlegen",icon:"euro",act:"_invoice",kw:"rechnung faktura sevdesk"},
    {label:"Offene Rechnungen",sub:"Geld",icon:"euro",act:has("openinvoices")?"openinvoices:":"go:geld",kw:"unbezahlt überfällig"},
    {label:"Neues To-Do",sub:"Aufgabe anlegen",icon:"todo",act:has("newtodo")?"newtodo:":"_todo",kw:"aufgabe todo"},
    {label:"Neuer Termin",sub:"Kalender",icon:"kal",act:has("newevent")?"newevent:":"go:kal",kw:"termin kalender event"},
    {label:"Einstellungen & E-Mail-Konten",sub:"Passwörter, iCloud, Verbindungen",icon:"gear",act:"settings:",kw:"einstellungen konten passwort"},
    {label:"Darstellung: Automatisch",sub:t==="auto"?"aktiv":"wie System",icon:"sun",act:"theme:auto",kw:"theme modus dunkel hell"},
    {label:"Darstellung: Hell",sub:t==="light"?"aktiv":"",icon:"sun",act:"theme:light",kw:"theme modus light"},
    {label:"Darstellung: Dunkel",sub:t==="dark"?"aktiv":"",icon:"moon",act:"theme:dark",kw:"theme modus dark nacht"},
    {label:p?"Beträge einblenden":"Beträge ausblenden",sub:"Privatsphäre",icon:"eye",act:"priv:",kw:"beträge privat verbergen ein aus"},
    {label:"Alles aktualisieren",sub:"Live-Daten neu laden",icon:"refresh",act:"reload:",kw:"neu laden refresh"},
    {label:"Klassisches Dashboard",sub:"Altes Dashboard öffnen",icon:"more",act:"_classic",kw:"alt"},
    {label:"Abmelden",sub:"",icon:"close",act:"_logout",kw:"logout"}
  ];
  return a;
}
function norm(s){ return String(s||"").toLowerCase(); }
function collect(q){
  var out=[], m=function(t){ return !q||norm(t).indexOf(q)>-1; };
  F.views.filter(function(v){ return !v.hidden; }).forEach(function(v){ if(m(v.label+" "+(v.short||"")+" "+v.id)) out.push({group:"Seiten",label:v.label,sub:"Seite öffnen",icon:v.icon,act:"go:"+v.id}); });
  baseActions().forEach(function(a){ if(m(a.label+" "+a.kw)) out.push(Object.assign({group:"Aktionen"},a)); });
  if(q.length>=2&&F.D){
    var ext=[];
    F.searchers.forEach(function(fn){ try{ var r=fn(q); if(Array.isArray(r)) ext=ext.concat(r); }catch(e){ console.error(e); } });
    var seen={};
    ext.forEach(function(r){ if(!r||!r.act) return; var g=r.group||"Treffer"; var key=g+"|"+r.act; if(seen[key]) return; seen[key]=1; out.push({group:g,label:r.label,sub:r.sub,icon:r.icon||GROUP_ICON[g]||"search",act:r.act}); });
    fallback(q,out);
  }
  return out;
}
/* Mails/To-Dos/Termine nur ergänzen, wenn kein Modul in dieser Gruppe etwas liefert (keine Doppelungen). */
function fallback(q,out){
  var D=F.D, g={}; out.forEach(function(x){ g[x.group]=1; });
  var m=function(t){ return norm(t).indexOf(q)>-1; };
  if(!g["Mails"]) (D.mail&&D.mail.messages||[]).filter(function(x){ return !x.deleted&&m((x.subject||"")+" "+(x.fromName||"")+" "+(x.from||"")+" "+(x.to||"")); }).sort(function(a,b){ return Date.parse(b.date||0)-Date.parse(a.date||0); }).slice(0,6).forEach(function(x){
    out.push({group:"Mails",label:x.subject||"(kein Betreff)",sub:(x.fromName||x.from||"")+(Date.parse(x.date)?" · "+F.de(F.ymd(new Date(Date.parse(x.date)))):""),icon:"post",act:has("mail")?"mail:"+x.id:"go:post"}); });
  if(!g["To-Dos"]) (D.todos||[]).filter(function(t){ return m((t.text||"")+" "+(t.notes||"")); }).slice(0,5).forEach(function(t){
    out.push({group:"To-Dos",label:t.text||"Aufgabe",sub:t.done?"erledigt":(t.due?"fällig "+F.de(t.due):"offen"),icon:"todo",act:has("todoedit")?"todoedit:"+t.id:"go:kal"}); });
  if(!g["Termine"]) (D.events||[]).filter(function(e){ return m((e.title||"")+" "+(e.location||"")); }).slice(0,5).forEach(function(e){
    out.push({group:"Termine",label:e.title||"Termin",sub:F.de(e.date)+(e.time?" · "+e.time:""),icon:"kal",act:has("event")&&e.id?"event:"+e.id:"go:kal"}); });
}

/* ---------- Anzeige ---------- */
function build(){
  var inp=host.querySelector("#cmdkIn"), q=norm(inp.value).trim();
  items=collect(q);
  if(sel>=items.length) sel=Math.max(0,items.length-1);
  var res=host.querySelector("#cmdkRes");
  if(!items.length){ res.innerHTML='<div class="none">'+(q.length===1?"Weiter tippen …":"Keine Treffer")+'</div>'; inp.removeAttribute("aria-activedescendant"); return; }
  var last=null, h="";
  items.forEach(function(it,i){
    if(it.group!==last){ h+='<div class="grp" role="presentation">'+esc(it.group)+'</div>'; last=it.group; }
    h+='<button type="button" class="it" role="option" id="cmdk-o'+i+'" data-ci="'+i+'" tabindex="-1"><span class="ii">'+F.svg(it.icon||"search")+'</span><span class="tt">'+esc(it.label||"")+'</span><span class="ss">'+esc(it.sub||"")+'</span></button>';
  });
  res.innerHTML=h; mark(true);
}
function mark(scroll){
  var res=host.querySelector("#cmdkRes"), inp=host.querySelector("#cmdkIn");
  res.querySelectorAll(".it").forEach(function(x,j){ var on=j===sel; x.classList.toggle("on",on); x.setAttribute("aria-selected",on?"true":"false"); });
  var on=res.querySelector(".it.on"); if(on){ inp.setAttribute("aria-activedescendant",on.id); if(scroll&&on.scrollIntoView) on.scrollIntoView({block:"nearest"}); }
}
function open(){
  ensure(); lastFocus=document.activeElement;
  var inp=host.querySelector("#cmdkIn"); inp.value=""; sel=0;
  host.classList.add("on"); build();
  inp.focus(); setTimeout(function(){ inp.focus(); },20);
}
function close(){ if(!host) return; host.classList.remove("on"); if(lastFocus&&lastFocus.focus&&document.contains(lastFocus)) try{ lastFocus.focus(); }catch(e){} }

/* Ausführen: "name:arg" über F.actions; Sonderfälle mit "_" */
function exec(act){
  if(act==="_compose"){ F.compose({}); return; }
  if(act==="_invoice"){ F.openInvoice({}); return; }
  if(act==="_todo"){ newTodo(); return; }
  if(act==="_classic"){ location.href="/admin"; return; }
  if(act==="_logout"){ location.href="/admin/logout"; return; }
  var i=act.indexOf(":"), k=i>-1?act.slice(0,i):act, v=i>-1?act.slice(i+1):"";
  if(F.actions[k]) F.actions[k](v,null,null); else if(F.views.some(function(x){ return x.id===k; })) F.go(k);
}
function run(i){ var it=items[i]; if(!it) return; lastFocus=null; close(); setTimeout(function(){ try{ exec(it.act); }catch(e){ console.error(e); F.toast("Aktion fehlgeschlagen",true); } },10); }

/* Neues To-Do (falls kein Kalender-/To-Do-Modul ein eigenes "newtodo" anbietet) */
function newTodo(){
  F.modal('<form data-form="cmdkTodo" class="stackf"><div class="row-between"><h2 style="font-size:20px">Neues To-Do</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Aufgabe<input class="f" name="text" required autofocus></label><label class="fl">Fällig am (optional)<input class="f" type="date" name="due"></label><label class="fl">Notiz (optional)<textarea class="f" name="notes" rows="3"></textarea></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Anlegen</button></span></div></form>',"narrow");
}
F.form("cmdkTodo",function(f){ var t=f.text.value.trim(); if(!t||!F.D) return; var b=f.querySelector("[type=submit]"); b.disabled=true; F.addTodo({text:t,due:f.due.value||"",notes:f.notes.value.trim()}).then(function(j){ if(j&&Array.isArray(j.todos)){ F.closeModal(); F.toast("To-Do angelegt"); } else b.disabled=false; }); });

F.action("search",function(){ if(isOpen()) close(); else open(); });

/* Tastatur (Capture-Phase, damit Esc nicht zusätzlich Dialoge/Drawer schließt) */
document.addEventListener("keydown",function(e){
  if(!isOpen()) return;
  var k=e.key;
  if((e.metaKey||e.ctrlKey)&&k.toLowerCase()==="k"){ e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
  if(k==="Escape"){ e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
  if(k==="ArrowDown"){ e.preventDefault(); e.stopImmediatePropagation(); if(items.length){ sel=(sel+1)%items.length; mark(true); } return; }
  if(k==="ArrowUp"){ e.preventDefault(); e.stopImmediatePropagation(); if(items.length){ sel=(sel-1+items.length)%items.length; mark(true); } return; }
  if(k==="Enter"){ e.preventDefault(); e.stopImmediatePropagation(); run(sel); return; }
  if(k==="Tab"){ e.preventDefault(); e.stopImmediatePropagation(); host.querySelector("#cmdkIn").focus(); }
},true);
})();
