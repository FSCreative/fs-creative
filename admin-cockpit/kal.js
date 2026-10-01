/* Kalender & To-Dos: Monatsansicht (Desktop) / Monat + Tagesliste (Handy), Tagesansicht, Termin-Details und -Editor
   (Dashboard-Termine über /admin/api/events mit {events, base}; private Termine im iCloud-Kalender über /admin/api/private-cal),
   To-Do-Liste mit Filtern, Gruppen, Detailansicht, Editor und Rückgängig.
   Öffentlich für andere Module: F.openTodoEdit(vorlage), F.openTodoView(id), F.openEventEdit(vorlage, datum), F.openEventView(id), F.calEvents().
   Aktionen: todoedit:id, todoview:id, tododel:id, todotoggle:id, newtodo, newevent[:datum], event:id / eventview:id, eventedit:id,
   eventdel:id, kaltab:kal|todo, calnav:-1|0|1, dayview:datum, fincal:nr. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, de=F.de, UI=F.UI;

/* ---------- Sparten & Farben (eigene Tokens, hell und dunkel) ---------- */
var SPARTEN=[["fsc","FS Creative"],["kochdu","kochdu"],["kantineur","Kantineur"],["blitzdings","Blitzdings"],["valuero","VALUERO"],["privat","Privat"]];
function spKey(k){ return SPARTEN.some(function(s){ return s[0]===k; })?k:"fsc"; }
function spName(k){ var s=SPARTEN.find(function(x){ return x[0]===k; }); return s?s[1]:"FS Creative"; }
F.icons.lock=F.icons.lock||'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
F.icons.todo=F.icons.todo||'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>';
var SPL='--sp-fsc:#2f62e0;--sp-kochdu:#7c4ddb;--sp-kantineur:#2a7ab8;--sp-blitzdings:#b87304;--sp-valuero:#16885a;--sp-privat:#cf366c;--sp-todo:var(--info);--sp-inv:var(--ok);--sp-invbad:var(--bad);';
var SPD='--sp-fsc:#86a8ff;--sp-kochdu:#b597ff;--sp-kantineur:#7cbce9;--sp-blitzdings:#f0b452;--sp-valuero:#62c895;--sp-privat:#ff86ad;';
F.css(
':root{'+SPL+'}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){'+SPD+'}}:root[data-theme="dark"]{'+SPD+'}'+
'.kal-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}'+
'.subnav .cnt{font-family:var(--f-mono);font-size:12px;margin-left:6px;opacity:.75}'+
'.kcal-h{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid var(--line)}'+
'.kmonth{font-family:var(--f-display);font-size:19px;font-weight:700;min-width:160px;text-align:center;text-transform:capitalize}'+
'.kst{display:flex;flex-wrap:wrap;gap:6px 14px;padding:10px 18px;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--ink-2);align-items:center}'+
'.kst .bad-t{font-weight:600}'+
'.kdows,.kgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}'+
'.kdows div{padding:8px 8px 6px;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600}'+
'.kgrid{border-top:1px solid var(--line);touch-action:pan-y}'+
'.kcell{min-height:112px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 5px 6px;display:flex;flex-direction:column;gap:2px;cursor:pointer;min-width:0}'+
'.kcell:nth-child(7n){border-right:0}.kcell:nth-last-child(-n+7){border-bottom:0}'+
'.kcell:hover{background:var(--sunk)}'+
'.kcell.out{background:color-mix(in srgb,var(--sunk) 50%,var(--panel))}.kcell.out .kdn{color:var(--ink-3)}'+
'.kdn{align-self:flex-start;border:0;background:none;font:600 13px/1.2 var(--f-mono);padding:3px 7px;border-radius:99px;color:var(--ink-2)}'+
'.kdn:hover{background:var(--line)}'+
'.kcell.today .kdn{background:var(--glow);color:#2a1a00}'+
'.kc{display:block;width:100%;min-width:0;border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 15%,var(--panel));color:var(--ink);border-radius:5px;padding:1px 5px;font-size:12px;line-height:1.5;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.kc:hover{background:color-mix(in srgb,var(--c) 26%,var(--panel))}'+
'.kc .kt{font-family:var(--f-mono);font-size:11px;color:var(--ink-2);margin-right:4px}'+
'.kc svg,.kdv svg.lk{width:11px;height:11px;vertical-align:-1px;margin-right:3px}'+
'.kc.late{font-weight:600}'+
'.kmore{border:0;background:none;color:var(--ink-2);font-size:12px;font-weight:600;text-align:left;padding:1px 5px;border-radius:5px}.kmore:hover{background:var(--line)}'+
'.kdots{display:none}'+
'.klegend{display:flex;flex-wrap:wrap;gap:6px 14px;padding:12px 18px;border-top:1px solid var(--line);font-size:12.5px;color:var(--ink-2)}'+
'.spdot{display:inline-block;width:9px;height:9px;border-radius:3px;background:var(--c);margin-right:6px;vertical-align:0}'+
'.kagenda{display:none;border-top:1px solid var(--line)}'+
'.kag-h{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 18px}'+
'.kag-h b{display:block;text-transform:capitalize}'+
'.kdv{display:grid;grid-template-columns:58px 4px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;border:0;border-top:1px solid var(--line);background:none;padding:10px 18px;text-align:left;color:var(--ink)}'+
'.kdv:hover{background:var(--sunk)}'+
'.kdv-t{display:grid;font-family:var(--f-mono);font-size:13px;line-height:1.3}.kdv-t small{color:var(--ink-3);font-family:var(--f-body);font-size:12px}'+
'.kbar{align-self:stretch;border-radius:3px;background:var(--c);min-height:28px}'+
'.kdv-m{display:grid;min-width:0}.kdv-m b{font-weight:600;overflow-wrap:anywhere}.kdv-m small{color:var(--ink-3);font-size:12.5px;overflow-wrap:anywhere}'+
'.kdv .go{color:var(--ink-3)}'+
'.kdvlist{border:1px solid var(--line);border-radius:12px;overflow:hidden}.kdvlist .kdv:first-child{border-top:0}'+
'.sppick{display:flex;flex-wrap:wrap;gap:6px;border:0;margin:0;padding:0;min-width:0}'+
'.sppick legend{font-size:13px;color:var(--ink-2);padding:0;margin-bottom:6px}'+
'.sppick label{position:relative;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:99px;padding:4px 11px;font-size:13px;font-weight:600;color:var(--ink-2);cursor:pointer}'+
'.sppick input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}'+
'.sppick label:has(input:checked){border-color:var(--c);color:var(--ink);background:color-mix(in srgb,var(--c) 16%,var(--panel))}'+
'.sppick label:focus-within{outline:2px solid var(--glow);outline-offset:2px}'+
'.khint{font-size:12.5px;color:var(--ink-2);background:var(--sunk);border-radius:10px;padding:8px 11px}'+
'.ktitle{display:flex;align-items:center;gap:10px;font-size:21px;overflow-wrap:anywhere;min-width:0}'+
'.ktitle .spdot{width:12px;height:12px;border-radius:4px;flex:none;margin:0}'+
'.kv dd.pre{white-space:pre-wrap}'+
'.kpis .kpi{border:1px solid var(--line)}.kpis .kpi[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}'+
'.kprog{display:grid;gap:6px;padding:14px 18px;border-bottom:1px solid var(--line)}'+
'.kadd{display:flex;gap:8px;padding:14px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}.kadd input[name=text]{flex:1 1 220px}.kadd input[type=date]{flex:0 1 160px}'+
'.ktodo{display:grid;grid-template-columns:20px minmax(0,1fr) auto 32px;gap:10px;align-items:center;padding:8px 12px 8px 18px;border-top:1px solid var(--line)}'+
'.ktodo input{width:18px;height:18px;accent-color:var(--ok);margin:0}'+
'.ktodo .todo-t{display:grid;min-width:0}'+
'.ktodo .todo-t small{color:var(--ink-3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.ktodo.done .todo-t>span{text-decoration:line-through;color:var(--ink-3)}'+
'.ktodo .del{border:0;background:none;color:var(--ink-3);border-radius:8px;padding:4px;display:grid;place-items:center}.ktodo .del:hover{color:var(--bad);background:var(--bad-soft)}.ktodo .del svg{width:15px;height:15px}'+
'.kgrp{display:flex;gap:8px;align-items:baseline;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;padding:14px 18px 6px}'+
'.kgrp.bad-t{color:var(--bad)}.kgrp .num{font-size:11.5px}'+
'.kfoot{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;padding:12px 18px;border-top:1px solid var(--line)}'+
'@media (max-width:900px){'+
  '.kcal-h{padding:10px 12px}.kmonth{min-width:0;font-size:17px}'+
  '.kdows div{padding:6px 0;text-align:center;font-size:10.5px}'+
  '.kcell{min-height:50px;padding:3px 1px 5px;align-items:center;gap:3px}'+
  '.kcell .kc,.kcell .kmore{display:none}'+
  '.kdn{pointer-events:none;align-self:center;font-size:13px;padding:3px 0;width:28px;text-align:center}'+
  '.kdots{display:flex;gap:3px;justify-content:center;flex-wrap:wrap;max-width:100%}.kdots i{width:6px;height:6px;border-radius:50%;background:var(--c)}'+
  '.kcell.sel{background:var(--glow-soft)}.kcell.sel .kdn{box-shadow:inset 0 0 0 2px var(--glow)}'+
  '.kagenda{display:block}'+
  '.kdv{grid-template-columns:50px 4px minmax(0,1fr) auto;gap:10px;padding:10px 14px}'+
  '.ktodo{padding-left:14px}'+
  '.klegend{padding:12px}'+
'}'
);

/* ---------- Datum-Hilfen ---------- */
function today(){ return (F.D&&F.D.today)||F.ymd(); }
function isoOk(s){ return /^\d{4}-\d{2}-\d{2}$/.test(String(s||"")); }
function addDays(iso,n){ var d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return F.ymd(d); }
function diffDays(a,b){ var p=function(s){ var m=s.split("-"); return Date.UTC(+m[0],+m[1]-1,+m[2]); }; return Math.round((p(a)-p(b))/864e5); }
function longDate(iso,noYear){ var d=new Date(iso+"T12:00:00"); if(isNaN(d)) return iso||""; var o={weekday:"long",day:"numeric",month:"long"}; if(!noYear) o.year="numeric"; return d.toLocaleDateString("de-AT",o); }
function isMobile(){ return !!(window.matchMedia&&window.matchMedia("(max-width:900px)").matches); }
function dueMeta(due){
  if(!isoOk(due)) return null; var x=diffDays(due,today());
  var lbl=x===0?"heute":x===1?"morgen":x===-1?"gestern":x<0?(-x)+" Tg. überfällig":F.deShort(due);
  return {d:x,cls:x<0?"bad":x<=2?"warn":"grey",lbl:lbl};
}

/* ---------- Kalender-Daten (voll über /admin/api/all; vorher Fallback auf F.D.events) ---------- */
var CAL={ready:false,loading:false,p:null,at:0,err:"",outlook:[],outlookAt:"",outlookOk:null,priv:null,privEvents:[],manualRaw:[]};
function normManual(e){ return {id:e.id,title:e.title||"Termin",date:String(e.date||"").slice(0,10),time:e.time||"",endTime:e.endTime||"",location:e.location||"",notes:e.notes||"",sparte:spKey(e.sparte),source:"manual"}; }
function applyPriv(pc){
  if(!pc) return;
  CAL.priv={configured:!!pc.configured,calName:pc.calName||"",calColor:pc.calColor||"",error:pc.error||"",fetchedAt:pc.fetchedAt||"",user:pc.user||""};
  if(Array.isArray(pc.events)) CAL.privEvents=pc.events.map(function(e){ return Object.assign({},e,{source:"icloud",sparte:"privat",title:e.title||"Termin",time:e.time||"",endTime:e.endTime||"",location:e.location||"",notes:e.notes||""}); });
}
function applyAll(d){
  if(d.calendar&&Array.isArray(d.calendar.events)){
    CAL.outlook=d.calendar.events.map(function(e,i){ return {id:String(e.id||("o"+i+"_"+(e.date||e.start||""))),title:e.title||"Termin",date:String(e.date||e.start||"").slice(0,10),time:e.time||"",endTime:e.endTime||"",location:e.location||"",notes:e.notes||"",sparte:"fsc",source:"outlook"}; }).filter(function(e){ return isoOk(e.date); });
    CAL.outlookAt=d.calendar.fetchedAt||new Date().toISOString(); CAL.outlookOk=true;
  } else if(d.calendar===null) CAL.outlookOk=false;
  if(d.privateCal) applyPriv(d.privateCal);
  if(Array.isArray(d.manualEvents)) CAL.manualRaw=d.manualEvents;
  CAL.ready=true; CAL.at=Date.now(); CAL.err="";
  syncD();
}
function loadCal(force){
  if(CAL.loading) return CAL.p;
  if(!force&&CAL.ready&&Date.now()-CAL.at<20000) return Promise.resolve();
  CAL.loading=true;
  CAL.p=F.api("/admin/api/all?year="+encodeURIComponent(F.year)).then(function(d){
    CAL.loading=false;
    if(!d||d.ok===false||d.error) CAL.err=(d&&d.error)||"Fehler"; else applyAll(d);
    rerender();
  }).catch(function(e){ CAL.loading=false; CAL.err=String(e&&e.message||e); rerender(); });
  return CAL.p;
}
function rerender(){ if(F.D&&F.current==="kal") F.render(); }
/* Heute-Ansicht & Suche: F.D.events aktuell halten (gleiches Fenster wie der Server: gestern bis +60 Tage) */
function syncD(){
  if(!F.D||!CAL.ready) return; var t=today(), a=addDays(t,-1), b=addDays(t,60);
  F.D.events=allEvents().filter(function(e){ return e.date>=a&&e.date<=b; }).map(function(e){ return {id:e.id,title:e.title,date:e.date,time:e.time||"",endTime:e.endTime||"",location:e.location||"",sparte:e.sparte,source:e.source==="manual"?"manuell":e.source==="outlook"?"kalender":"icloud"}; })
    .sort(function(x,y){ return (x.date+(x.time||"")).localeCompare(y.date+(y.time||"")); });
}
function allEvents(){
  if(CAL.ready) return CAL.manualRaw.map(normManual).concat(CAL.outlook,CAL.privEvents);
  return ((F.D&&F.D.events)||[]).map(function(e){ var src=e.source==="kalender"?"outlook":e.source==="manuell"?"manual":e.source; return Object.assign({},e,{source:src,sparte:src==="icloud"?"privat":spKey(e.sparte),pending:true}); });
}
function findEvent(id){ return allEvents().find(function(e){ return String(e.id)===String(id); }); }
F.calEvents=allEvents;
function icloudOn(){ return !!(CAL.priv&&CAL.priv.configured); }
function calName(){ return (CAL.priv&&CAL.priv.calName)||"privat"; }
function readOnly(e){ return e.source==="outlook"||(e.source==="icloud"&&e.recurring); }

/* Daten laden: einmal kurz nach dem Start (für Suche/Heute), danach beim Öffnen und bei jedem Neuladen, wenn veraltet */
var first=true;
F.onData(function(){ if(first){ first=false; setTimeout(function(){ loadCal(false); },1500); return; } if(CAL.ready) syncD(); if(F.current==="kal"&&Date.now()-CAL.at>20000) loadCal(false); });

/* ---------- Einträge je Tag (Termine, Blitzdings, To-Dos, fällige Rechnungen) ---------- */
function calItems(){
  var map={}, D=F.D, t=today();
  function push(k,o){ k=String(k||"").slice(0,10); if(!isoOk(k)) return; (map[k]=map[k]||[]).push(o); }
  var bd=(D.platforms&&D.platforms.blitzdings&&D.platforms.blitzdings.upcoming)||[];
  bd.forEach(function(b){ push(b.eventDate,{kind:"bd",label:(b.package||"Buchung")+(b.customerName?" · "+b.customerName:""),c:"blitzdings",sub:"Blitzdings-Buchung"+(b.reference?" "+b.reference:""),loc:b.location||b.eventLocation||"",act:"go:plat",time:""}); });
  allEvents().forEach(function(e){ var sp=e.source==="icloud"?"privat":spKey(e.sparte);
    push(e.date,{kind:"evt",label:e.title||"Termin",time:e.time||"",end:e.endTime||"",loc:e.location||"",c:sp,priv:e.source==="icloud",
      sub:(e.source==="icloud"?"Privat · iCloud":e.source==="outlook"?"Mail-Kalender":spName(sp)),act:"eventview:"+e.id}); });
  (D.todos||[]).forEach(function(x){ if(x.due&&!x.done) push(x.due,{kind:"todo",label:x.text||"Aufgabe",c:"todo",time:"",sub:"To-Do"+(x.due<t?" · überfällig":""),late:x.due<t,act:"todoview:"+x.id}); });
  ((D.sev&&D.sev.invoices)||[]).forEach(function(i){ if(i.due&&i.open>0.005) push(i.due,{kind:"inv",label:(i.nr||"Entwurf")+" · "+(i.contact||""),c:i.overdue?"invbad":"inv",time:"",sub:(i.overdue?"Überfällig":"Rechnung fällig")+" · offen "+F.eur(i.open),money:true,act:"fincal:"+(i.nr||i.id)}); });
  Object.keys(map).forEach(function(k){ map[k].sort(function(a,b){ return (a.time||"")<(b.time||"")?-1:(a.time||"")>(b.time||"")?1:0; }); });
  return map;
}
function chip(e){
  return '<button type="button" class="kc'+(e.late?" late":"")+'" style="--c:var(--sp-'+e.c+')" data-act="'+esc(e.act)+'" title="'+esc((e.time?e.time+(e.end?"–"+e.end:"")+" · ":"")+e.label+" · "+e.sub)+'">'+(e.priv?F.svg("lock"):'')+(e.time?'<span class="kt">'+esc(e.time)+'</span>':'')+esc(e.label)+'</button>';
}
function dvItem(e){
  var time=e.time?'<b>'+esc(e.time)+'</b>'+(e.end?'<small>bis '+esc(e.end)+'</small>':''):'<small>ganztägig</small>';
  var sub=[e.sub,e.loc].filter(Boolean).map(esc).join(" · ");
  return '<button type="button" class="kdv" data-act="'+esc(e.act)+'"><span class="kdv-t">'+time+'</span><span class="kbar" style="--c:var(--sp-'+e.c+')"></span><span class="kdv-m"><b>'+(e.priv?'<svg class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'+F.icons.lock+'</svg>':'')+esc(e.label)+'</b>'+(sub?'<small'+(e.money?' class="money"':'')+'>'+sub+'</small>':'')+'</span><span class="go" aria-hidden="true">›</span></button>';
}

/* ---------- Monatsansicht ---------- */
var DOW=["Mo","Di","Mi","Do","Fr","Sa","So"];
function curMonth(){ if(!/^\d{4}-\d{2}$/.test(UI.kalMonth||"")) UI.kalMonth=today().slice(0,7); return UI.kalMonth; }
function shiftMonth(n){ if(n===0){ UI.kalMonth=today().slice(0,7); UI.kalSel=today(); } else { var m=curMonth().split("-"); UI.kalMonth=F.ymd(new Date(+m[0],+m[1]-1+n,1)).slice(0,7); } F.render(); }
function selDay(){ var m=curMonth(); if(!UI.kalSel||UI.kalSel.slice(0,7)!==m) UI.kalSel=today().slice(0,7)===m?today():m+"-01"; return UI.kalSel; }
function vCal(){
  var map=calItems(), m=curMonth().split("-"), y=+m[0], mo=+m[1]-1, t=today(), sel=selDay();
  var first=new Date(y,mo,1), start=new Date(y,mo,1-((first.getDay()+6)%7)), cells="";
  for(var i=0;i<42;i++){
    var d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i), k=F.ymd(d), list=map[k]||[], out=d.getMonth()!==mo;
    cells+='<div class="kcell'+(out?" out":"")+(k===t?" today":"")+(k===sel?" sel":"")+'" data-calday="'+k+'" aria-label="'+esc(longDate(k))+(list.length?", "+list.length+(list.length===1?" Eintrag":" Einträge"):"")+'">'+
      '<button type="button" class="kdn" data-act="dayview:'+k+'" title="Tagesansicht">'+d.getDate()+'</button>'+
      '<div class="kdots">'+list.slice(0,4).map(function(e){ return '<i style="--c:var(--sp-'+e.c+')"></i>'; }).join("")+'</div>'+
      list.slice(0,3).map(chip).join("")+(list.length>3?'<button type="button" class="kmore" data-act="dayview:'+k+'">+'+(list.length-3)+' mehr</button>':'')+'</div>';
  }
  var agList=map[sel]||[];
  var title=first.toLocaleDateString("de-AT",{month:"long",year:"numeric"});
  return '<section class="panel">'+
    '<div class="kcal-h"><div class="row"><button type="button" class="btn icon" data-act="calnav:-1" aria-label="Voriger Monat" title="Voriger Monat (←)">‹</button><div class="kmonth" aria-live="polite">'+esc(title)+'</div><button type="button" class="btn icon" data-act="calnav:1" aria-label="Nächster Monat" title="Nächster Monat (→)">›</button></div>'+
      '<div class="row wrap"><button type="button" class="btn" data-act="calnav:0" title="Heute (T)">Heute</button><button type="button" class="btn primary" data-act="newevent:'+(isMobile()?sel:"")+'">+ Termin</button></div></div>'+
    statusLine()+
    '<div class="kdows" aria-hidden="true">'+DOW.map(function(x){ return '<div>'+x+'</div>'; }).join("")+'</div>'+
    '<div class="kgrid" id="kgrid">'+cells+'</div>'+
    '<div class="kagenda" aria-live="polite"><div class="kag-h"><div><b>'+esc(longDate(sel,true))+'</b><span class="muted">'+(agList.length?agList.length+(agList.length===1?" Eintrag":" Einträge"):"Keine Einträge")+'</span></div><button type="button" class="btn primary" data-act="newevent:'+sel+'">+ Termin</button></div>'+
      (agList.length?agList.map(dvItem).join(""):'<div class="empty" style="border-top:1px solid var(--line)">Frei – tippe auf „+ Termin“, um etwas einzutragen.</div>')+'</div>'+
    '<div class="klegend">'+SPARTEN.map(function(s){ return '<span><i class="spdot" style="--c:var(--sp-'+s[0]+')"></i>'+esc(s[0]==="privat"?"Privat (iCloud, mit iPhone synchron)":s[1])+'</span>'; }).join("")+
      '<span><i class="spdot" style="--c:var(--sp-todo)"></i>To-Dos (fällig)</span><span><i class="spdot" style="--c:var(--sp-inv)"></i>Rechnung fällig</span><span><i class="spdot" style="--c:var(--sp-invbad)"></i>Rechnung überfällig</span></div>'+
  '</section>';
}
function statusLine(){
  var parts=[];
  if(!CAL.ready) parts.push(CAL.err?'<span class="bad-t">Kalender konnte nicht vollständig geladen werden ('+esc(CAL.err)+').</span> <button type="button" class="link" data-act="calreload">Erneut versuchen</button>':'<span>Lade alle Termine …</span>');
  else {
    var p=CAL.priv;
    if(!p||!p.configured) parts.push('<span><i class="spdot" style="--c:var(--sp-privat)"></i>Privater iCloud-Kalender nicht verbunden</span>'+(F.actions.settings?' <button type="button" class="link" data-act="settings:icloud">Verbinden</button>':''));
    else if(p.error){ var e=p.error, msg=/login_failed/.test(e)?"iCloud-Anmeldung fehlgeschlagen – bitte in den Einstellungen neu verbinden.":/^http_/.test(e)?"iCloud antwortet mit Fehler ("+e.slice(5)+").":"iCloud nicht erreichbar ("+e+")."; parts.push('<span class="bad-t">'+esc(msg)+'</span>'+(F.actions.settings?' <button type="button" class="link" data-act="settings:icloud">Einstellungen</button>':'')); }
    else parts.push('<span><i class="spdot" style="--c:var(--sp-privat)"></i>iCloud „'+esc(calName())+'“ verbunden'+(p.fetchedAt?' · Stand '+esc(F.ago(p.fetchedAt)):'')+'</span>');
    if(CAL.outlookOk) parts.push('<span>Mail-Kalender: '+CAL.outlook.length+(CAL.outlook.length===1?" Termin":" Termine")+' · synchronisiert '+esc(F.ago(CAL.outlookAt))+'</span>');
    else if(CAL.outlookOk===false) parts.push('<span class="muted">Mail-Kalender nicht verfügbar</span>');
    parts.push('<button type="button" class="link" data-act="calreload" style="margin-left:auto">'+(CAL.loading?"Lädt …":"Neu laden")+'</button>');
  }
  return '<div class="kst">'+parts.join("")+'</div>';
}

/* Klick in eine freie Stelle eines Tages: Handy = Tag wählen, Desktop = neuer Termin (wie im klassischen Dashboard) */
F.listen("click",".kcell",function(el){
  var k=el.getAttribute("data-calday"); if(!k) return;
  if(isMobile()){ UI.kalSel=k; if(k.slice(0,7)!==curMonth()) UI.kalMonth=k.slice(0,7); F.render(); return; }
  openEventEdit(null,k);
});
/* Wischen am Handy: Monat wechseln */
(function(){
  var sx=null, sy=0;
  document.addEventListener("touchstart",function(e){ var g=e.target.closest&&e.target.closest("#kgrid"); if(!g||e.touches.length!==1){ sx=null; return; } sx=e.touches[0].clientX; sy=e.touches[0].clientY; },{passive:true});
  document.addEventListener("touchend",function(e){ if(sx===null) return; var t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy; sx=null; if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5) shiftMonth(dx<0?1:-1); },{passive:true});
})();
/* Tastatur in der Monatsansicht: ← → Monat, T heute, N neuer Termin */
document.addEventListener("keydown",function(e){
  if(F.current!=="kal"||UI.kalTab==="todo"||F.modalOpen()||e.metaKey||e.ctrlKey||e.altKey) return;
  var c=document.getElementById("cmdk"); if(c&&c.classList.contains("on")) return;
  var tg=e.target; if(tg&&(/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)||tg.isContentEditable)) return;
  if(e.key==="ArrowLeft"){ e.preventDefault(); shiftMonth(-1); } else if(e.key==="ArrowRight"){ e.preventDefault(); shiftMonth(1); }
  else if(e.key==="t"||e.key==="T"){ shiftMonth(0); } else if(e.key==="n"||e.key==="N"){ e.preventDefault(); openEventEdit(null,isMobile()?selDay():""); }
});
F.action("calnav",function(v){ shiftMonth(+v||0); });
F.action("calreload",function(){ loadCal(true); F.render(); });
F.action("dayview",function(k){ openDayView(k); });
F.action("fincal",function(nr){ F.closeModal(); F.UI.invQ=nr||""; F.UI.invF="all"; F.go("geld"); });

/* ---------- Tagesansicht ---------- */
function openDayView(k){
  if(!isoOk(k)) return; var list=calItems()[k]||[];
  F.modal('<div class="row-between"><div><h2 style="font-size:20px">'+esc(longDate(k))+'</h2><div class="muted">'+(list.length?list.length+(list.length===1?" Eintrag":" Einträge"):"Keine Einträge")+'</div></div>'+F.btnClose()+'</div>'+
    (list.length?'<div class="kdvlist">'+list.map(dvItem).join("")+'</div>':'<div class="empty">Keine Einträge an diesem Tag.</div>')+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Schließen</button><button type="button" class="btn primary" data-act="newevent:'+k+'">+ Termin an diesem Tag</button></span></div>',"narrow");
}

/* ---------- Termin: Details ---------- */
function openEventView(id){
  var e=findEvent(id);
  if(!e||e.pending){ if(!CAL.ready){ F.toast("Lade Termine …"); loadCal(true).then(function(){ var x=findEvent(id); if(x&&!x.pending) openEventView(id); else F.toast("Termin nicht gefunden",true); }); } else F.toast("Termin nicht gefunden",true); return; }
  var sp=e.source==="icloud"?"privat":spKey(e.sparte), ro=readOnly(e);
  var time=e.time?e.time+(e.endTime?" – "+e.endTime:"")+" Uhr":"ganztägig";
  var src=e.source==="icloud"?'Privat · iCloud-Kalender „'+esc(calName())+'“ – ändert sich auch am iPhone'+(e.recurring?'<br><span class="muted">Serientermin – bitte am iPhone bearbeiten.</span>':''):
    e.source==="outlook"?'Mail-Kalender<br><span class="muted">Wird aus dem Mail-Kalender übernommen – bitte dort ändern.</span>':'Dashboard (nur im Cockpit)';
  F.modal('<div class="row-between"><h2 class="ktitle"><span class="spdot" style="--c:var(--sp-'+sp+')"></span>'+esc(e.title||"Termin")+'</h2>'+F.btnClose()+'</div>'+
    '<dl class="kv"><dt>Datum</dt><dd>'+esc(longDate(e.date))+'</dd><dt>Zeit</dt><dd>'+esc(time)+'</dd>'+
    '<dt>Bereich</dt><dd><span class="tag grey" style="background:color-mix(in srgb,var(--sp-'+sp+') 16%,var(--panel));color:var(--ink)">'+esc(spName(sp))+'</span></dd>'+
    (e.location?'<dt>Ort</dt><dd>'+esc(e.location)+'</dd>':'')+(e.notes?'<dt>Notizen</dt><dd class="pre">'+esc(e.notes)+'</dd>':'')+
    '<dt>Kalender</dt><dd>'+src+'</dd></dl>'+
    '<div class="foot"><span>'+(ro?'':'<button type="button" class="btn danger" data-act="eventdel:'+esc(e.id)+'">Löschen</button>')+'</span><span class="row"><button type="button" class="btn" data-closemodal>Schließen</button>'+(ro?'':'<button type="button" class="btn primary" data-act="eventedit:'+esc(e.id)+'">Bearbeiten</button>')+'</span></div>',"narrow");
}
F.openEventView=openEventView;
F.action("eventview",openEventView);
F.action("event",openEventView);
F.action("eventedit",function(id){ var e=findEvent(id); if(e) openEventEdit(e); });
F.action("eventdel",function(id){ deleteEvent(id); });

/* ---------- Termin: Editor ---------- */
var EDIT=null; // bearbeiteter Termin (oder null bei neu)
function openEventEdit(ev,date){
  if(ev&&ev.id&&!CAL.ready){ loadCal(true).then(function(){ var x=findEvent(ev.id); if(x) openEventEdit(x); }); return; }
  var isNew=!(ev&&ev.id); EDIT=isNew?null:ev; ev=ev||{};
  if(!isNew&&readOnly(ev)){ F.toast(ev.source==="outlook"?"Termine aus dem Mail-Kalender bitte dort ändern.":"Serientermine bitte direkt am iPhone ändern.",true); return; }
  var sp=ev.source==="icloud"?"privat":spKey(ev.sparte||"fsc");
  F.modal('<form data-form="kalevent" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+(isNew?"Neuer Termin":"Termin bearbeiten")+'</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Titel<input class="f" name="title" required autofocus value="'+esc(ev.title||"")+'" maxlength="200"></label>'+
    '<fieldset class="sppick"><legend>Bereich</legend>'+SPARTEN.map(function(s){ return '<label style="--c:var(--sp-'+s[0]+')"><input type="radio" name="sparte" value="'+s[0]+'"'+(s[0]===sp?" checked":"")+'><i class="spdot" style="margin:0"></i>'+esc(s[1])+'</label>'; }).join("")+'</fieldset>'+
    '<div class="khint" id="kevHint">'+spHint(sp)+'</div>'+
    '<div class="grid2"><label class="fl">Datum<input class="f" type="date" name="date" required value="'+esc(ev.date||(isoOk(date)?date:today()))+'"></label>'+
    '<div class="grid2" style="grid-template-columns:repeat(2,minmax(0,1fr))"><label class="fl">Von<input class="f" type="time" name="time" value="'+esc(ev.time||"")+'"></label><label class="fl">Bis (optional)<input class="f" type="time" name="end" value="'+esc(ev.endTime||"")+'"></label></div></div>'+
    '<label class="fl">Ort (optional)<input class="f" name="location" value="'+esc(ev.location||"")+'"></label>'+
    '<label class="fl">Notizen (optional)<textarea class="f" name="notes" rows="3">'+esc(ev.notes||"")+'</textarea></label>'+
    '<div class="err" id="kevErr" role="alert"></div>'+
    '<div class="foot"><span>'+(isNew?'':'<button type="button" class="btn danger" data-act="eventdel:'+esc(ev.id)+'">Löschen</button>')+'</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="kevSave">Speichern</button></span></div></form>',"narrow");
}
function spHint(sp){
  if(sp==="privat") return icloudOn()?'Wird im iCloud-Kalender „'+esc(calName())+'“ gespeichert und erscheint auch am iPhone.':'Der private iCloud-Kalender ist noch nicht verbunden.'+(F.actions.settings?' <button type="button" class="link" data-act="settings:icloud">Jetzt verbinden</button>':' Verbinden in den Einstellungen.');
  return 'Geschäftlicher Termin („'+esc(spName(sp))+'“) – wird nur im Cockpit gespeichert.';
}
F.listen("change",'.sppick input[name="sparte"]',function(el){ var h=document.getElementById("kevHint"); if(h) h.innerHTML=spHint(el.value); });
F.openEventEdit=function(ev,date){ openEventEdit(ev&&ev.id?findEvent(ev.id)||ev:(ev?Object.assign({},ev,{id:""}):null),date); };
F.action("newevent",function(date){ openEventEdit(null,date); });

function postManual(next){
  var base=CAL.manualRaw.map(function(e){ return Object.assign({},e); });
  return F.api("/admin/api/events",{body:{events:next,base:base}}).then(function(j){
    if(j&&Array.isArray(j.events)){ CAL.manualRaw=j.events; syncD(); F.render(); return true; }
    F.toast("Termin konnte nicht gespeichert werden",true); return false;
  }).catch(function(){ F.toast("Keine Verbindung zum Server.",true); return false; });
}
function privErr(e){ e=String(e||""); return /recurring/.test(e)?"Serientermine bitte direkt am iPhone ändern.":/changed_elsewhere/.test(e)?"Der Termin wurde inzwischen am iPhone geändert – bitte neu laden und erneut versuchen.":/not_configured/.test(e)?"Privater Kalender ist nicht verbunden (Einstellungen).":/403|forbidden/i.test(e)?"Keine Schreibrechte für diesen geteilten Kalender.":"Speichern im iCloud-Kalender fehlgeschlagen ("+(e||"unbekannt")+")"; }
function privOp(op,payload,okMsg){
  return F.api("/admin/api/private-cal",{body:Object.assign({op:op},payload)}).then(function(j){
    if(j&&j.ok){ if(j.privateCal) applyPriv(j.privateCal); syncD(); F.render(); if(okMsg) F.toast(okMsg); return {ok:true}; }
    var e=(j&&j.error)||""; if(/changed_elsewhere/.test(e)) loadCal(true);
    return {ok:false,msg:privErr(e)};
  }).catch(function(){ return {ok:false,msg:"iCloud nicht erreichbar – bitte später erneut versuchen."}; });
}
function newId(){ return "e"+Date.now().toString(36)+Math.random().toString(36).slice(2,5); }

F.form("kalevent",function(f){
  var err=document.getElementById("kevErr"), btn=document.getElementById("kevSave"); err.innerHTML="";
  var sel=f.querySelector('input[name="sparte"]:checked');
  var obj={title:f.title.value.trim(),date:f.date.value,time:f.time.value||"",endTime:f.end.value||"",location:f.location.value.trim(),notes:f.notes.value.trim(),sparte:sel?sel.value:"fsc",source:"manual"};
  if(!obj.title){ err.textContent="Bitte einen Titel eingeben."; return; }
  if(!isoOk(obj.date)){ err.textContent="Bitte ein gültiges Datum wählen."; return; }
  if(!obj.time) obj.endTime="";
  if(obj.endTime&&obj.endTime<=obj.time){ err.textContent="Das Ende muss nach dem Beginn liegen."; return; }
  var old=EDIT, wasPriv=!!(old&&old.source==="icloud");
  var busy=function(on){ btn.disabled=on; btn.textContent=on?"Speichert …":"Speichern"; };
  var fail=function(m){ busy(false); err.textContent=m; };
  var run=function(){
    if(obj.sparte==="privat"||wasPriv){
      if(!icloudOn()){ err.innerHTML='Der private iCloud-Kalender ist noch nicht verbunden.'+(F.actions.settings?' <button type="button" class="link" data-act="settings:icloud">In den Einstellungen verbinden</button>':''); return; }
      if(wasPriv&&old.recurring){ err.textContent="Serientermine bitte direkt am iPhone ändern."; return; }
      busy(true);
      if(obj.sparte==="privat"&&wasPriv){ privOp("update",{href:old.href,etag:old.etag,uid:old.uid,event:obj},"Privater Termin aktualisiert – auch am iPhone").then(function(r){ if(r.ok) F.closeModal(); else fail(r.msg); }); return; }
      if(obj.sparte==="privat"){ privOp("create",{event:obj},"Privater Termin angelegt – erscheint auch am iPhone").then(function(r){ if(!r.ok) return fail(r.msg); F.closeModal(); if(old&&old.source==="manual") postManual(CAL.manualRaw.filter(function(x){ return x.id!==old.id; })); }); return; }
      // privat → geschäftlich: aus iCloud entfernen und im Cockpit anlegen
      privOp("delete",{href:old.href,etag:old.etag,recurring:!!old.recurring},"").then(function(r){ if(!r.ok) return fail(r.msg); obj.id=newId(); postManual(CAL.manualRaw.concat([obj])).then(function(ok){ F.closeModal(); if(ok) F.toast("Termin aus dem privaten Kalender in „"+spName(obj.sparte)+"“ verschoben"); }); });
      return;
    }
    busy(true);
    var next;
    if(old&&old.source==="manual") next=CAL.manualRaw.map(function(x){ return x.id===old.id?Object.assign({},x,obj,{id:x.id}):x; });
    else { obj.id=newId(); next=CAL.manualRaw.concat([obj]); }
    postManual(next).then(function(ok){ if(ok){ F.closeModal(); F.toast(old?"Termin gespeichert":"Termin angelegt"); } else busy(false); });
  };
  if(!CAL.ready){ busy(true); loadCal(true).then(function(){ busy(false); if(!CAL.ready) return fail("Kalender konnte nicht geladen werden – bitte erneut versuchen."); run(); }); } else run();
});

function deleteEvent(id){
  var e=findEvent(id); if(!e) return;
  if(e.source==="outlook"){ F.toast("Termine aus dem Mail-Kalender bitte dort löschen.",true); return; }
  if(e.source==="icloud"){
    if(e.recurring){ F.toast("Serientermine bitte direkt am iPhone löschen.",true); return; }
    F.confirm("Privaten Termin „"+(e.title||"")+"“ löschen? Er verschwindet auch am iPhone.","Löschen",function(){ privOp("delete",{href:e.href,etag:e.etag,recurring:!!e.recurring},"Termin gelöscht").then(function(r){ if(!r.ok) F.toast(r.msg,true); }); },true);
    return;
  }
  var raw=CAL.manualRaw.find(function(x){ return x.id===id; }); if(!raw) return;
  F.closeModal();
  postManual(CAL.manualRaw.filter(function(x){ return x.id!==id; })).then(function(ok){ if(ok) F.toast("Termin gelöscht",false,"Rückgängig",function(){ postManual(CAL.manualRaw.concat([raw])).then(function(o){ if(o) F.toast("Termin wiederhergestellt"); }); }); });
}

/* ---------- To-Dos ---------- */
function todos(){ return (F.D&&F.D.todos)||[]; }
function findTodo(id){ return todos().find(function(t){ return String(t.id)===String(id); }); }
function patchTodo(id,patch){ return F.todosPost(todos().map(function(t){ return t.id===id?Object.assign({},t,patch):t; })); }
function okJ(j){ return j&&Array.isArray(j.todos); }
UI.todoF=UI.todoF||"open";
function hideDone(v){ if(v!==undefined) F.ls("fsc_cockpit_todo_hidedone",!!v); return !!F.ls("fsc_cockpit_todo_hidedone"); }
function todoStats(){
  var all=todos(), t=today(), open=all.filter(function(x){ return !x.done; });
  return {all:all,open:open,over:open.filter(function(x){ return isoOk(x.due)&&x.due<t; }),tod:open.filter(function(x){ return x.due===t; }),done:all.filter(function(x){ return x.done; })};
}
function grp(x){ if(x.done) return "Erledigt"; var m=dueMeta(x.due); if(!m) return "Ohne Datum"; if(m.d<0) return "Überfällig"; if(m.d===0) return "Heute"; if(m.d===1) return "Morgen"; if(m.d<=7) return "Nächste 7 Tage"; return "Später"; }
function todoRow(x){
  var m=dueMeta(x.due), note=String(x.notes||"").split("\n").filter(function(l){ return l.trim(); })[0]||"";
  return '<div class="ktodo'+(x.done?" done":"")+'"><input type="checkbox" data-todo="'+esc(x.id)+'"'+(x.done?" checked":"")+' aria-label="'+(x.done?"Wieder öffnen":"Erledigt")+': '+esc(x.text||"")+'">'+
    '<button type="button" class="todo-t" data-act="todoview:'+esc(x.id)+'"><span>'+esc(x.text||"Aufgabe")+'</span>'+(note?'<small>'+esc(note)+'</small>':'')+'</button>'+
    (m&&!x.done?'<span class="tag '+m.cls+'" title="Fällig '+esc(de(x.due))+'">'+esc(m.lbl)+'</span>':'<span></span>')+
    '<button type="button" class="del" data-act="tododel:'+esc(x.id)+'" aria-label="To-Do löschen" title="Löschen">'+F.svg("close")+'</button></div>';
}
function vTodo(){
  var s=todoStats(), f=UI.todoF, hd=hideDone(), list;
  if(f==="over") list=s.over; else if(f==="today") list=s.tod; else if(f==="done") list=s.done; else list=s.all.filter(function(x){ return !(hd&&x.done); });
  list=list.slice().sort(function(a,b){ if(!!a.done!==!!b.done) return a.done?1:-1; var ad=a.due||"9999", bd=b.due||"9999"; if(ad!==bd) return ad<bd?-1:1; return (a.created||0)-(b.created||0); });
  var tile=function(k,l,n,cls){ return '<button type="button" class="panel kpi" data-act="tfilter:'+k+'" aria-pressed="'+(f===k)+'"><span class="k">'+l+'</span><span class="v num '+(n?cls:"")+'">'+n+'</span></button>'; };
  var counts={}; list.forEach(function(x){ var g=grp(x); counts[g]=(counts[g]||0)+1; });
  var body="", last=null;
  list.forEach(function(x){ var g=grp(x); if(g!==last){ body+='<div class="kgrp'+(g==="Überfällig"?" bad-t":"")+'">'+g+' <span class="num">'+counts[g]+'</span></div>'; last=g; } body+=todoRow(x); });
  var pct=s.all.length?Math.round(s.done.length/s.all.length*100):0;
  var emptyTxt=f==="open"?(s.all.length?"Alles erledigt. Oben eine neue Aufgabe anlegen.":"Noch keine To-Dos. Oben die erste Aufgabe anlegen."):"Nichts in dieser Ansicht.";
  return '<div class="kpis">'+tile("open","Offen",s.open.length,"")+tile("over","Überfällig",s.over.length,"bad-t")+tile("today","Heute fällig",s.tod.length,"warn-t")+tile("done","Erledigt",s.done.length,"ok-t")+'</div>'+
  '<section class="panel">'+
    '<div class="kprog"><div class="row-between"><span class="muted">'+(s.open.length?s.open.length+" offen · "+s.all.length+" gesamt":(s.all.length?"Alles erledigt":"Keine To-Dos"))+'</span><span class="muted num">'+pct+' % erledigt</span></div><div class="bar" role="progressbar" aria-valuenow="'+pct+'" aria-valuemin="0" aria-valuemax="100" aria-label="Erledigt"><i style="width:'+pct+'%;background:var(--ok)"></i></div></div>'+
    '<form class="kadd" data-form="kaltodoadd"><input class="f" name="text" placeholder="Neue Aufgabe … (Enter zum Hinzufügen)" aria-label="Neue Aufgabe" required data-keepfocus="ktodoadd" autocomplete="off"><input class="f" type="date" name="due" aria-label="Fällig am (optional)" title="Fällig am (optional)"><button class="btn primary" type="submit">Hinzufügen</button></form>'+
    (f!=="open"?'<div class="kst"><span>Filter: <b>'+({over:"Überfällig",today:"Heute fällig",done:"Erledigt"}[f])+'</b></span><button type="button" class="link" data-act="tfilter:open">Filter aufheben</button></div>':'')+
    (list.length?'<div>'+body+'</div>':'<div class="empty">'+emptyTxt+'</div>')+
    '<div class="kfoot"><button type="button" class="btn" data-act="todohidedone">'+(hd?"Erledigte anzeigen":"Erledigte ausblenden")+'</button><button type="button" class="btn" data-act="todocleardone"'+(s.done.length?"":" disabled")+'>Erledigte löschen'+(s.done.length?" ("+s.done.length+")":"")+'</button></div>'+
  '</section>';
}
F.action("tfilter",function(k){ UI.todoF=(UI.todoF===k&&k!=="open")?"open":k; F.render(); });
F.action("todohidedone",function(){ hideDone(!hideDone()); F.render(); });
F.action("todocleardone",function(){
  var done=todos().filter(function(t){ return t.done; }), n=done.length; if(!n){ F.toast("Keine erledigten Aufgaben"); return; }
  F.confirm(n+(n===1?" erledigte Aufgabe":" erledigte Aufgaben")+" endgültig löschen?","Löschen",function(){
    F.todosPost(todos().filter(function(t){ return !t.done; })).then(function(j){ if(okJ(j)) F.toast(n+(n===1?" Aufgabe":" Aufgaben")+" gelöscht",false,"Rückgängig",function(){ F.todosPost(todos().concat(done)).then(function(k){ if(okJ(k)) F.toast("Wiederhergestellt"); }); }); });
  },true);
});
F.form("kaltodoadd",function(f){
  var txt=f.text.value.trim(); if(!txt) return;
  var due=f.due.value||""; f.text.value=""; f.due.value="";
  F.addTodo({text:txt,due:due,notes:""}).then(function(j){ if(okJ(j)) F.toast("To-Do angelegt"); });
});
function delTodo(id){
  var t=findTodo(id); if(!t) return; F.closeModal();
  F.todosPost(todos().filter(function(x){ return x.id!==t.id; })).then(function(j){ if(okJ(j)) F.toast("To-Do gelöscht",false,"Rückgängig",function(){ F.todosPost(todos().concat([t])).then(function(k){ if(okJ(k)) F.toast("Wiederhergestellt"); }); }); });
}
F.action("tododel",delTodo);
F.action("todotoggle",function(id){
  var t=findTodo(id); if(!t) return; var on=!t.done; F.closeModal();
  patchTodo(t.id,{done:on,doneAt:on?Date.now():null}).then(function(j){ if(okJ(j)) F.toast(on?"Erledigt":"Wieder offen",false,"Rückgängig",function(){ patchTodo(t.id,{done:!on,doneAt:!on?Date.now():null}); }); });
});

/* To-Do: Details */
function openTodoView(id){
  var t=findTodo(id); if(!t){ F.toast("To-Do nicht gefunden",true); return; }
  var m=dueMeta(t.due);
  F.modal('<div class="row-between"><h2 class="ktitle"><span class="spdot" style="--c:'+(t.done?"var(--ok)":"var(--sp-todo)")+'"></span>'+esc(t.text||"Aufgabe")+'</h2>'+F.btnClose()+'</div>'+
    '<dl class="kv"><dt>Status</dt><dd>'+(t.done?'<span class="tag ok">Erledigt</span>':'<span class="tag info">Offen</span>')+'</dd>'+
    '<dt>Fällig</dt><dd>'+(t.due?esc(longDate(t.due))+(m&&!t.done?' · <span class="tag '+m.cls+'">'+esc(m.lbl)+'</span>':''):'<span class="muted">ohne Datum</span>')+'</dd>'+
    '<dt>Notizen</dt><dd class="pre">'+(t.notes?esc(t.notes):'<span class="muted">Keine Infos hinterlegt</span>')+'</dd>'+
    (t.created>1e11?'<dt>Angelegt</dt><dd>'+esc(new Date(t.created).toLocaleDateString("de-AT"))+'</dd>':'')+'</dl>'+
    '<div class="foot"><button type="button" class="btn danger" data-act="tododel:'+esc(t.id)+'">Löschen</button><span class="row wrap"><button type="button" class="btn" data-act="todotoggle:'+esc(t.id)+'">'+(t.done?"Wieder öffnen":"Erledigt")+'</button><button type="button" class="btn primary" data-act="todoedit:'+esc(t.id)+'">Bearbeiten</button></span></div>',"narrow");
}
F.openTodoView=openTodoView;
F.action("todoview",openTodoView);

/* To-Do: Editor (auch für neue To-Dos, z. B. aus einer Mail mit Vorlage {text, due, notes}) */
var TEDIT=null;
function openTodoEdit(t){
  t=t||{}; var ex=t.id?findTodo(t.id):null; TEDIT=ex?ex.id:null; if(ex) t=ex;
  F.modal('<form data-form="kaltodo" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+(ex?"Aufgabe bearbeiten":"Neue Aufgabe")+'</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Aufgabe<input class="f" name="text" required autofocus maxlength="300" value="'+esc(t.text||"")+'"></label>'+
    '<label class="fl">Fällig am (optional)<input class="f" type="date" name="due" value="'+esc(isoOk(t.due)?t.due:"")+'"></label>'+
    '<label class="fl">Notizen (optional)<textarea class="f" name="notes" rows="5">'+esc(t.notes||"")+'</textarea></label>'+
    '<label class="row" style="font-size:14px"><input type="checkbox" name="done"'+(t.done?" checked":"")+' style="width:18px;height:18px;accent-color:var(--ok)"> Erledigt</label>'+
    '<div class="err" id="ktdErr" role="alert"></div>'+
    '<div class="foot"><span>'+(ex?'<button type="button" class="btn danger" data-act="tododel:'+esc(ex.id)+'">Löschen</button>':'')+'</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Speichern</button></span></div></form>',"narrow");
}
F.openTodoEdit=openTodoEdit;
F.action("todoedit",function(id){ openTodoEdit({id:id}); });
F.action("newtodo",function(){ openTodoEdit(null); });
F.form("kaltodo",function(f){
  var err=document.getElementById("ktdErr"), txt=f.text.value.trim(); if(!txt){ err.textContent="Bitte einen Text eingeben."; return; }
  var obj={text:txt,due:f.due.value||"",notes:f.notes.value.trim(),done:f.done.checked}, btn=f.querySelector("[type=submit]"); btn.disabled=true;
  var ex=TEDIT?findTodo(TEDIT):null, p;
  if(ex){ if(obj.done!==!!ex.done) obj.doneAt=obj.done?Date.now():null; p=patchTodo(ex.id,obj); }
  else { if(obj.done) obj.doneAt=Date.now(); p=F.addTodo(obj); }
  p.then(function(j){ if(okJ(j)){ F.closeModal(); F.toast(ex?"To-Do gespeichert":"To-Do angelegt"); } else { btn.disabled=false; err.textContent="Speichern fehlgeschlagen – bitte erneut versuchen."; } });
});

/* ---------- Ansicht ---------- */
UI.kalTab=UI.kalTab||F.ls("fsc_cockpit_kaltab")||"kal";
F.action("kaltab",function(v){ UI.kalTab=v==="todo"?"todo":"kal"; F.ls("fsc_cockpit_kaltab",UI.kalTab); if(F.current!=="kal") F.go("kal"); else F.render(); });
F.view({id:"kal",label:"Kalender & To-Dos",short:"Kalender",icon:"kal",order:50,mobile:true,
  count:function(){ return todoStats().open.length; },
  render:function(){
    var s=todoStats(), tab=UI.kalTab, t=today();
    var evToday=allEvents().filter(function(e){ return e.date===t; }).length;
    var sub=tab==="todo"?(s.open.length?s.open.length+" offen"+(s.over.length?" · "+s.over.length+" überfällig":"")+(s.tod.length?" · "+s.tod.length+" heute fällig":""):"Alles erledigt.")
      :"Dashboard-Termine, privater iCloud-Kalender, Mail-Kalender, fällige To-Dos und Rechnungen. "+(evToday?evToday+(evToday===1?" Termin":" Termine")+" heute.":"Heute keine Termine.");
    return F.head("Kalender & To-Dos",esc(sub),'<button class="btn" data-act="newtodo">+ To-Do</button><button class="btn primary" data-act="newevent:">+ Termin</button>')+
      '<div class="kal-top"><nav class="subnav" aria-label="Kalender oder To-Dos"><button type="button" data-act="kaltab:kal" aria-current="'+(tab!=="todo")+'">Kalender</button><button type="button" data-act="kaltab:todo" aria-current="'+(tab==="todo")+'">To-Dos<span class="cnt">'+s.open.length+'</span></button></nav>'+
      (tab!=="todo"&&s.over.length?'<button type="button" class="tag bad" style="border:0" data-act="kaltab:todo">'+s.over.length+(s.over.length===1?" To-Do überfällig":" To-Dos überfällig")+'</button>':'')+'</div>'+
      (tab==="todo"?vTodo():vCal());
  },
  after:function(){ if(UI.kalTab!=="todo") loadCal(false); }
});

/* ---------- Heute: Hinweis bei iCloud-Problemen (Termine und fällige To-Dos zeigt heute.js selbst) ---------- */
F.feed(function(){
  var p=CAL.priv; if(!p||!p.configured||!p.error) return [];
  return [{id:"icloud:"+p.error,rank:3,sev:"warn",icon:"kal",tag:["warn","Kalender"],t:/login_failed/.test(p.error)?"iCloud-Kalender: Anmeldung fehlgeschlagen":"iCloud-Kalender nicht erreichbar",d:"Private Termine sind eventuell nicht aktuell. "+(/login_failed/.test(p.error)?"App-Passwort in den Einstellungen neu eintragen.":"Fehler: "+p.error),acts:F.actions.settings?[["Einstellungen","settings:icloud","primary"]]:[["Kalender","go:kal"]]}];
});

/* ---------- Schnellsuche: To-Dos und Termine ---------- */
F.searcher(function(q){
  q=String(q||"").toLowerCase().trim(); if(q.length<2) return [];
  var m=function(s){ return String(s||"").toLowerCase().indexOf(q)>-1; }, t=today(), out=[];
  todos().filter(function(x){ return m(x.text)||m(x.notes); }).sort(function(a,b){ return (a.done?1:0)-(b.done?1:0)||String(a.due||"9999").localeCompare(String(b.due||"9999")); }).slice(0,5).forEach(function(x){
    out.push({group:"To-Dos",label:x.text||"Aufgabe",sub:x.done?"erledigt":(x.due?(x.due<t?"überfällig · ":"fällig ")+de(x.due):"offen"),act:"todoview:"+x.id}); });
  var ev=allEvents().filter(function(e){ return m(e.title)||m(e.location)||m(e.notes); });
  ev.sort(function(a,b){ var fa=a.date>=t, fb=b.date>=t; if(fa!==fb) return fa?-1:1; return fa?(a.date+(a.time||"")).localeCompare(b.date+(b.time||"")):(b.date).localeCompare(a.date); });
  ev.slice(0,5).forEach(function(e){ out.push({group:"Termine",label:e.title||"Termin",sub:de(e.date)+(e.time?" · "+e.time:"")+(e.source==="icloud"?" · privat":""),act:"eventview:"+e.id}); });
  return out;
});
})();
