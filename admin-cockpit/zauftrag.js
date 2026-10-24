/* Auftragsmanagement (Wunsch Simon 19.10.2026): Aufträge (Projekte) mit Aufgaben – Board (Zu erledigen / In Arbeit / In Prüfung / Erledigt)
   oder Liste, Kennzahlen, Filter, Aufgaben-Dialog mit Checkliste und Kommentaren, Drag & Drop zwischen den Spalten.
   Daten: F.D.auftraege {projects, tasks} über /admin/api/auftraege (op: task.save|task.move|task.check|task.comment|task.delete|project.save|project.delete).
   Öffentlich: F.tkDeadlines(n) für die Statusleiste, Aktion tkopen:id. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.board=F.icons.board||'<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="16.5" y="4" width="4" height="7" rx="1.5"/>';
var COLS=[["offen","Zu erledigen","var(--ink-3)"],["arbeit","In Arbeit","var(--glow)"],["pruefung","In Prüfung","#a78bfa"],["erledigt","Erledigt","var(--ok)"]];
var PRIO={normal:["Normal",""],hoch:["Hoch","warn"],dringend:["Dringend","bad"]};
var PCOL=["#7b8bff","#3ecf8e","#a78bfa","#e879f9","#f5a524","#2dd4bf","#f87171","#94a3b8","#d4a24c","#8b5cf6","#38bdf8","#84cc16"];   // Montafon-Palette (hell wie dunkel lesbar)
F.tkPCOL=PCOL;
UI.tkView=UI.tkView||F.ls("fsc_tk_view")||"board"; UI.tkProj=UI.tkProj||""; UI.tkPrio=UI.tkPrio||""; UI.tkQ=UI.tkQ||""; UI.tkDoneAll=!!UI.tkDoneAll;

function A(){ var a=F.D&&F.D.auftraege; return a&&a.tasks?a:{projects:[],tasks:[]}; }
function proj(id){ return A().projects.find(function(p){ return p.id===id; })||null; }
function today(){ return (F.D&&F.D.today)||F.ymd(); }
function addDays(iso,n){ var d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return F.ymd(d); }
function weekEnd(){ var d=new Date(today()+"T12:00:00"), w=(d.getDay()+6)%7; d.setDate(d.getDate()+(6-w)); return F.ymd(d); }
function weekStart(){ var d=new Date(today()+"T12:00:00"), w=(d.getDay()+6)%7; d.setDate(d.getDate()-w); d.setHours(0,0,0,0); return d.getTime(); }
function dueLabel(due){ if(!due) return ""; var t=today(); if(due===t) return "Heute"; if(due===addDays(t,1)) return "Morgen"; if(due===addDays(t,-1)) return "Gestern";
  var d=new Date(due+"T12:00:00"), diff=Math.round((d-new Date(t+"T12:00:00"))/864e5);
  if(diff>0&&diff<7) return d.toLocaleDateString("de-AT",{weekday:"short"}).replace(".","");
  return d.toLocaleDateString("de-AT",{day:"numeric",month:"short"}); }
function dueCls(t){ if(!t.due||t.status==="erledigt") return ""; var d=today(); return t.due<d?"over":t.due===d?"today":t.due<=addDays(d,2)?"soon":""; }
function api(op,payload){ return F.api("/admin/api/auftraege",{body:Object.assign({op:op},payload||{})}).then(function(j){
  if(j&&j.ok&&j.data){ F.D.auftraege=j.data; F.render(); } else F.toast((j&&j.error)||"Speichern fehlgeschlagen",true); return j; }); }
F.tkApi=api;
F.tkReload=function(){ return F.api("/admin/api/auftraege").then(function(j){ if(j&&j.ok&&F.D){ F.D.auftraege={projects:j.projects,tasks:j.tasks,rev:j.rev}; F.render(); if(DR&&DR.print&&document.querySelector(".tk-dlg")) openTask(DR.id); } }); };
F.tkByPrint=function(oid){ return A().tasks.find(function(t){ return t.print&&t.print.id===oid; })||null; };

/* ---------- Druckaufträge: Status kommt von der Druck-Seite; Spalte wechseln = Aktion dort (mit Rückfrage) ---------- */
var PTAG={paid:"warn",invoice_requested:"warn",ordered:"info",in_production:"info",shipped:"ok",delivered:"ok",rejected:"grey",problem:"bad"};
function pInfo(t){ var o=t.print||{}; return {nr:o.nr,product:o.product,purchase:o.purchase,gross:o.gross,paymentStatus:o.paymentStatus}; }
function pCan(t){ var o=t.print||{}, st=o.status; return {place:st==="paid"||st==="invoice_requested"||(st==="problem"&&!o.pcOrder), reject:["ordered","in_production","shipped","delivered","rejected"].indexOf(st)<0, complete:["ordered","in_production","shipped"].indexOf(st)>-1||(st==="problem"&&!!o.pcOrder)}; }
function printMove(t,st){ var c=pCan(t), id=t.print.id; F.render();
  if(st===t.status) return;
  if(st==="arbeit"&&c.place) return F.prPlace(id,pInfo(t),true);
  if(st==="erledigt"&&c.complete) return F.prComplete(id,pInfo(t),true);
  if(st==="erledigt"&&c.place) return F.modal('<div class="tk-dh"><h2>Druckauftrag '+esc(t.print.nr||"")+'</h2>'+F.btnClose()+'</div><p>Der Auftrag wartet noch auf deine Prüfung. Was soll passieren?</p><div class="foot"><button type="button" class="btn" data-closemodal>Abbrechen</button><div class="btns"><button type="button" class="btn danger" data-act="tkprreject:'+esc(t.id)+'">Ablehnen …</button><button type="button" class="btn primary" data-act="tkprplace:'+esc(t.id)+'">Freigeben &amp; bestellen</button></div></div>',"narrow");
  F.toast("Druckaufträge folgen der Druck-Seite („"+(t.print.statusText||t.print.status)+"“) – dorthin geht es nur über Freigeben, Ablehnen oder Abschließen",true); }
function tkByIdP(id){ var t=A().tasks.find(function(x){ return x.id===id; }); return t&&t.print?t:null; }
F.action("tkprplace",function(id){ var t=tkByIdP(id); if(!t) return; F.closeModal(); F.prPlace(t.print.id,pInfo(t),true); });
F.action("tkprreject",function(id){ var t=tkByIdP(id); if(!t) return; F.closeModal(); F.prReject(t.print.id,pInfo(t),true); });
F.action("tkprcomplete",function(id){ var t=tkByIdP(id); if(!t) return; F.closeModal(); F.prComplete(t.print.id,pInfo(t),true); });
F.action("tkprorder",function(id){ var t=tkByIdP(id); if(!t) return; F.closeModal(); F.go("print"); setTimeout(function(){ F.actions.prord(t.print.id); },0); });
function printBlock(t){ var o=t.print, c=pCan(t), eur=F.eur;
  return '<div class="tk-print"><div class="tk-print-h">'+F.svg("print")+'<b>Druckauftrag '+esc(o.nr||"")+'</b><span class="tag '+(PTAG[o.status]||"grey")+'">'+esc(o.statusText||o.status)+'</span></div>'+
    '<div class="tk-print-d">'+esc([o.copies?o.copies+" Stk.":"",o.product,o.customer].filter(Boolean).join(" · "))+(o.gross!=null?' · <b>'+eur(o.gross)+'</b>':'')+(o.margin!=null?' · Marge '+eur(o.margin):'')+(o.pcOrder?' · Print.com '+esc(o.pcOrder):'')+(o.payment==="invoice"?' · auf Rechnung':'')+'</div>'+
    '<div class="tk-links">'+(c.place?'<button type="button" class="btn primary sm" data-act="tkprplace:'+esc(t.id)+'">'+(o.status==="invoice_requested"?"Freigeben &amp; bei Print.com bestellen":"Bei Print.com bestellen")+'</button>':'')+
      (c.reject?'<button type="button" class="btn danger sm" data-act="tkprreject:'+esc(t.id)+'">Ablehnen'+(o.paymentStatus==="paid"?" / Erstatten":"")+'</button>':'')+
      (c.complete?'<button type="button" class="btn sm" data-act="tkprcomplete:'+esc(t.id)+'">Abschließen</button>':'')+
      '<button type="button" class="btn sm" data-act="tkprorder:'+esc(t.id)+'">Druckdaten &amp; Details öffnen</button></div>'+
    '<small class="mu">Der Status kommt von der Druck-Seite: Freigeben → In Arbeit, Versendet/Abschließen/Ablehnen → Erledigt.</small></div>'; }

/* ---------- Kennzahlen, Filter ---------- */
function stats(){ var T=A().tasks, t=today(), we=weekEnd(), ws=weekStart();
  var open=T.filter(function(x){ return x.status!=="erledigt"; });
  return {open:open.length, week:open.filter(function(x){ return x.due&&x.due>=t&&x.due<=we; }).length, over:open.filter(function(x){ return x.due&&x.due<t; }).length,
    done:T.filter(function(x){ return x.status==="erledigt"&&x.doneAt&&x.doneAt>=ws; }).length, projects:A().projects.filter(function(p){ return p.status!=="abgeschlossen"; }).length}; }
function filtered(){ var q=UI.tkQ.trim().toLowerCase();
  return A().tasks.filter(function(x){ if(UI.tkProj&&x.projectId!==UI.tkProj) return false;
    if(UI.tkPrio==="hoch"&&x.prio==="normal") return false; if(UI.tkPrio==="dringend"&&x.prio!=="dringend") return false;
    if(q){ var p=proj(x.projectId); if((x.title+" "+(x.notes||"")+" "+(p?p.name+" "+(p.customer||""):"")).toLowerCase().indexOf(q)<0) return false; }
    return true; }); }
function sortCol(st,l){ return l.sort(function(a,b){ if(st==="erledigt") return (b.doneAt||0)-(a.doneAt||0);
  var pa=a.prio==="dringend"?0:a.prio==="hoch"?1:2, pb=b.prio==="dringend"?0:b.prio==="hoch"?1:2;
  return (a.due||"9999").localeCompare(b.due||"9999")||pa-pb||(a.order||0)-(b.order||0); }); }

/* ---------- Karte ---------- */
function projTag(p){ return p?'<span class="tk-pj" style="--pc:'+PCOL[p.color||0]+'" title="'+esc(p.name)+'"><i></i><span>'+esc(p.name)+'</span></span>':'<span class="tk-pj none"><i></i><span>Ohne Auftrag</span></span>'; }
function prioTag(t){ var p=PRIO[t.prio]; return p&&p[1]?'<span class="tag '+p[1]+'">'+(t.prio==="dringend"?"⚑ ":"")+p[0]+'</span>':''; }
function checkInfo(t){ var c=t.checklist||[]; if(!c.length) return null; var d=c.filter(function(x){ return x.done; }).length; return {d:d,n:c.length,pct:Math.round(d/c.length*100)}; }
function card(t){ var p=proj(t.projectId), ci=checkInfo(t), dc=dueCls(t), nc=(t.comments||[]).length;
  return '<div class="tk-card'+(t.status==="erledigt"?" done":"")+'" draggable="true" data-tk="'+esc(t.id)+'" tabindex="0" role="button" aria-label="'+esc(t.title)+'">'+
    '<div class="tk-top">'+projTag(p)+prioTag(t)+'</div>'+
    '<div class="tk-t">'+(t.status==="erledigt"?'<span class="tk-ok">'+F.svg("check")+'</span>':'')+esc(t.title)+'</div>'+
    (t.print?'<div class="tk-pst">'+F.svg("print")+'<span class="tag '+(PTAG[t.print.status]||"grey")+'">'+esc(t.print.statusText||t.print.status)+'</span></div>':'')+
    (ci?'<div class="tk-bar"><span style="width:'+ci.pct+'%;background:'+(p?PCOL[p.color||0]:"var(--glow)")+'"></span></div>':'')+
    '<div class="tk-meta">'+(t.due?'<span class="tk-due '+dc+'">'+F.svg("kal")+esc(dueLabel(t.due))+'</span>':'<span class="tk-due none">ohne Frist</span>')+
      (nc?'<span class="tk-mi" title="'+nc+' Kommentar'+(nc===1?"":"e")+'">💬 '+nc+'</span>':'')+(ci?'<span class="tk-mi num">'+ci.d+'/'+ci.n+'</span>':'')+'</div></div>'; }

/* ---------- Ansicht ---------- */
function vAuftraege(){
  var s=stats(), l=filtered(), act=A().projects.filter(function(p){ return p.status!=="abgeschlossen"; });
  var head=F.head("Aufträge",s.open+" offen · "+s.projects+" aktive"+(s.projects===1?"r Auftrag":" Aufträge"),
    '<div class="seg"><button type="button" data-act="tkview:board" aria-pressed="'+(UI.tkView==="board")+'">'+F.svg("board")+' Board</button><button type="button" data-act="tkview:list" aria-pressed="'+(UI.tkView==="list")+'">☰ Liste</button></div>'+
    '<button type="button" class="btn" data-act="tkprojects">Aufträge verwalten</button><button type="button" class="btn primary" data-act="tknew:">+ Neue Aufgabe</button>');
  var kpi=function(k,v,cls,act0){ return '<button type="button" class="tk-kpi'+(cls?" "+cls:"")+'"'+(act0?' data-act="'+act0+'"':'')+'><span>'+k+'</span><b class="num">'+v+'</b></button>'; };
  var kpis='<div class="tk-kpis">'+kpi("Offen",s.open)+kpi("Diese Woche fällig",s.week)+kpi("Überfällig",s.over,s.over?"bad":"")+kpi("Diese Woche erledigt",s.done,"ok")+'</div>';
  var bar='<div class="tk-bar2"><select class="f" data-tkf="proj" aria-label="Auftrag"><option value="">Alle Aufträge</option>'+act.concat(A().projects.filter(function(p){ return p.status==="abgeschlossen"; })).map(function(p){ return '<option value="'+esc(p.id)+'"'+(UI.tkProj===p.id?" selected":"")+'>'+esc(p.name)+(p.status==="abgeschlossen"?" (abgeschlossen)":"")+'</option>'; }).join("")+'</select>'+
    '<select class="f" data-tkf="prio" aria-label="Priorität"><option value="">Jede Priorität</option><option value="hoch"'+(UI.tkPrio==="hoch"?" selected":"")+'>Hoch und dringend</option><option value="dringend"'+(UI.tkPrio==="dringend"?" selected":"")+'>Nur dringend</option></select>'+
    '<input class="f tk-q" type="search" data-tkf="q" data-keepfocus="tkq" placeholder="Nach Titel, Auftrag oder Kunde filtern …" value="'+esc(UI.tkQ)+'" aria-label="Aufgaben filtern"></div>';
  if(!A().tasks.length&&!A().projects.length) return head+kpis+'<section class="panel tk-empty"><b>Noch keine Aufträge</b><p>Lege einen Auftrag an (z. B. „Website Relaunch Muster GmbH“) und plane die Aufgaben dazu – mit Frist, Priorität und Checkliste. Fristen erscheinen rechts in der Statusleiste.</p><div class="btns"><button type="button" class="btn primary" data-act="tkprojnew">+ Ersten Auftrag anlegen</button><button type="button" class="btn" data-act="tknew:">+ Aufgabe ohne Auftrag</button></div></section>';
  if(window.innerWidth<=900) return head+mobileBoard(l,s,bar);
  return head+kpis+bar+(UI.tkView==="list"?listView(l):board(l));
}
/* Handy: Status als Reiter, darunter die Karten in voller Breite (statt seitlich wischbarem Board) */
function mobileBoard(l,s,bar){
  var cur=UI.tkMCol||"offen", cnt={}; COLS.forEach(function(c){ cnt[c[0]]=l.filter(function(t){ return t.status===c[0]; }).length; });
  var all=sortCol(cur,l.filter(function(t){ return t.status===cur; })), shown=cur==="erledigt"&&!UI.tkDoneAll?all.slice(0,15):all;
  return '<div class="tkm-sum"><span>'+s.open+' offen</span>'+(s.over?'<span class="bad">'+s.over+' überfällig</span>':'')+'<span>'+s.week+' diese Woche fällig</span><span class="ok">'+s.done+' erledigt</span></div>'+bar+
    '<div class="tkm-tabs">'+COLS.map(function(c){ return '<button type="button" data-act="tkmcol:'+c[0]+'"'+(cur===c[0]?' aria-current="true"':'')+'><span class="dot" style="background:'+c[2]+'"></span>'+c[1]+' <b class="num">'+cnt[c[0]]+'</b></button>'; }).join("")+'</div>'+
    '<div class="tk-cards tkm-cards" data-tkcol="'+cur+'">'+(shown.map(card).join("")||'<div class="tk-none">Keine Aufgaben</div>')+(all.length>shown.length?'<button type="button" class="link" data-act="tkdoneall">Alle '+all.length+' anzeigen</button>':'')+'</div>';
}
F.action("tkmcol",function(c){ UI.tkMCol=c; F.render(); });
function board(l){
  return '<div class="tk-board">'+COLS.map(function(c){ var all=sortCol(c[0],l.filter(function(t){ return t.status===c[0]; })), shown=c[0]==="erledigt"&&!UI.tkDoneAll?all.slice(0,15):all;
    return '<section class="tk-col" data-tkcol="'+c[0]+'"><div class="tk-ch"><span class="dot" style="background:'+c[2]+'"></span><b>'+c[1]+'</b><span class="cnt num">'+all.length+'</span><button type="button" class="tk-add" data-act="tknew:'+c[0]+'" aria-label="Aufgabe in „'+c[1]+'“ anlegen" title="Neue Aufgabe">+</button></div>'+
      '<div class="tk-cards">'+(shown.map(card).join("")||'<div class="tk-none">Keine Aufgaben</div>')+(all.length>shown.length?'<button type="button" class="link" data-act="tkdoneall">Alle '+all.length+' anzeigen</button>':'')+'</div></section>'; }).join("")+'</div>';
}
function listView(l){
  var rows=sortCol("offen",l.filter(function(t){ return t.status!=="erledigt"; })).concat(sortCol("erledigt",l.filter(function(t){ return t.status==="erledigt"; })).slice(0,UI.tkDoneAll?999:15));
  if(!rows.length) return '<section class="panel tk-empty"><b>Keine Aufgaben</b><p>Mit diesen Filtern ist die Liste leer.</p></section>';
  return '<section class="panel"><table class="tk-tab"><thead><tr><th>Aufgabe</th><th>Auftrag</th><th>Status</th><th>Priorität</th><th>Frist</th><th>Checkliste</th></tr></thead><tbody>'+rows.map(function(t){ var p=proj(t.projectId), ci=checkInfo(t);
    return '<tr data-tk="'+esc(t.id)+'"'+(t.status==="erledigt"?' class="done"':'')+'><td class="tt">'+esc(t.title)+'</td><td>'+projTag(p)+'</td><td><select class="f sm" data-tkst="'+esc(t.id)+'" aria-label="Status">'+COLS.map(function(c){ return '<option value="'+c[0]+'"'+(t.status===c[0]?" selected":"")+'>'+c[1]+'</option>'; }).join("")+'</select></td><td>'+(prioTag(t)||'<span class="mu">Normal</span>')+'</td><td><span class="tk-due '+dueCls(t)+'">'+(t.due?esc(dueLabel(t.due)):"–")+'</span></td><td class="num">'+(ci?ci.d+"/"+ci.n:"–")+'</td></tr>'; }).join("")+'</tbody></table></section>';
}

/* ---------- Aufgaben-Dialog ---------- */
var DR=null;
function openTask(id,status,pre){
  var t=id?A().tasks.find(function(x){ return x.id===id; }):null; if(id&&!t){ F.toast("Aufgabe nicht gefunden",true); return; }
  DR=t?JSON.parse(JSON.stringify(t)):Object.assign({id:"",title:"",projectId:UI.tkProj||"",status:status||"offen",prio:"normal",due:"",notes:"",checklist:[],comments:[]},pre||{});
  var P0=proj(DR.projectId), lead0=(DR.leadId&&leads().find(function(l){ return l.id===DR.leadId; }))||(P0&&leadOf(P0));
  var projs=A().projects.filter(function(p){ return p.status!=="abgeschlossen"||p.id===DR.projectId; });
  F.modal('<form class="tk-dlg" data-form="tksave"><div class="tk-dh"><h2>'+(t?"Aufgabe bearbeiten":"Neue Aufgabe")+'</h2>'+F.btnClose()+'</div>'+
    (t&&t.print?printBlock(t):'')+
    '<label class="fl">Titel<input class="f" name="title" required maxlength="200" value="'+esc(DR.title)+'"'+(t?"":" autofocus")+' placeholder="z. B. Startseite Entwurf an Kunden schicken"></label>'+
    '<div class="tk-g3"><label class="fl">Auftrag<select class="f" name="projectId"><option value="">— ohne Auftrag —</option>'+projs.map(function(p){ return '<option value="'+esc(p.id)+'"'+(DR.projectId===p.id?" selected":"")+'>'+esc(p.name)+'</option>'; }).join("")+'</select></label>'+
    (DR.print?'<div class="fl">Status<input type="hidden" name="status" value="'+esc(DR.status)+'"><span class="tk-ro">'+esc((COLS.find(function(c){ return c[0]===DR.status; })||[,""])[1])+' <small class="mu">(von der Druck-Seite)</small></span></div>':
    '<div class="fl">Status<div class="tk-seg" role="radiogroup" aria-label="Status">'+COLS.map(function(c){ return '<label><input type="radio" name="status" value="'+c[0]+'"'+(DR.status===c[0]?" checked":"")+'><span><i style="background:'+c[2]+'"></i>'+c[1]+'</span></label>'; }).join("")+'</div></div>')+
    '<div class="fl">Priorität<div class="tk-seg" role="radiogroup" aria-label="Priorität">'+Object.keys(PRIO).map(function(k){ return '<label class="'+PRIO[k][1]+'"><input type="radio" name="prio" value="'+k+'"'+(DR.prio===k?" checked":"")+'><span>'+PRIO[k][0]+'</span></label>'; }).join("")+'</div></div></div>'+
    '<div class="tk-g3"><label class="fl">Frist<input class="f" type="date" name="due" value="'+esc(DR.due||"")+'"></label><div class="fl tk-quick"><span>Schnell</span><div><button type="button" class="btn sm" data-act="tkdue:0">Heute</button><button type="button" class="btn sm" data-act="tkdue:1">Morgen</button><button type="button" class="btn sm" data-act="tkdue:7">+1 Woche</button><button type="button" class="btn sm" data-act="tkdue:x">Keine</button></div></div></div>'+
    '<div class="fl">Checkliste<div id="tkCl">'+clHtml()+'</div><div class="tk-cladd"><input class="f" id="tkClNew" placeholder="Punkt hinzufügen und Enter drücken" maxlength="200"><button type="button" class="btn" data-act="tkcladd">Hinzufügen</button></div></div>'+
    '<label class="fl">Notizen<textarea class="f" name="notes" rows="3" maxlength="4000" placeholder="Details, Links, Zugangsinfos …">'+esc(DR.notes||"")+'</textarea></label>'+
    (DR.mailRef||lead0||t?'<div class="tk-links">'+(DR.mailRef?'<button type="button" class="btn sm" data-act="tkmail">📧 Mail: '+esc(String(DR.mailRef.subject||"öffnen").slice(0,60))+'</button>':'')+(lead0?'<button type="button" class="btn sm" data-act="tklead:'+esc(lead0.id)+'">👤 Kundenakte: '+esc(lead0.company||lead0.name)+'</button>':'')+(t?'<button type="button" class="btn sm" data-act="tktermin">📅 Als Termin eintragen</button>':'')+'</div>':'')+
    (t?'<div class="fl">Kommentare<div class="tk-cm">'+((t.comments||[]).slice().reverse().map(function(c){ return '<div><small>'+esc(new Date(c.at).toLocaleString("de-AT",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}))+'</small><p>'+esc(c.text)+'</p></div>'; }).join("")||'<span class="mu">Noch keine Kommentare.</span>')+'</div><div class="tk-cladd"><input class="f" id="tkCmNew" placeholder="Kommentar schreiben …" maxlength="2000"><button type="button" class="btn" data-act="tkcomment">Senden</button></div></div>':'')+
    '<div class="foot">'+(t?'<button type="button" class="btn bad-t" data-act="tkdel:'+esc(t.id)+'">Löschen</button>':'<span></span>')+'<div class="btns"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></div></div></form>',"wide");
}
function clHtml(){ return (DR.checklist||[]).map(function(c,i){ return '<div class="tk-cli'+(c.done?" on":"")+'"><input type="checkbox" data-tkcl="'+i+'"'+(c.done?" checked":"")+' aria-label="Erledigt"><span>'+esc(c.t)+'</span><button type="button" class="x" data-act="tkcldel:'+i+'" aria-label="Punkt entfernen">×</button></div>'; }).join("")||'<div class="mu tk-none2">Noch keine Punkte – Teilschritte machen den Fortschritt auf der Karte sichtbar.</div>'; }
function clRefresh(){ var el=document.getElementById("tkCl"); if(el) el.innerHTML=clHtml(); }
function clAdd(){ var i=document.getElementById("tkClNew"); if(!i||!i.value.trim()) return; DR.checklist.push({t:i.value.trim().slice(0,200),done:false}); i.value=""; clRefresh(); i.focus(); }
F.action("tkcladd",clAdd);
F.action("tkcldel",function(i){ DR.checklist.splice(+i,1); clRefresh(); });
F.listen("change","[data-tkcl]",function(el){ var i=+el.getAttribute("data-tkcl"); if(DR&&DR.checklist[i]){ DR.checklist[i].done=el.checked; el.parentNode.classList.toggle("on",el.checked); } });
F.listen("keydown","#tkClNew",function(el,e){ if(e.key==="Enter"){ e.preventDefault(); clAdd(); } });
F.listen("keydown","#tkCmNew",function(el,e){ if(e.key==="Enter"){ e.preventDefault(); F.actions.tkcomment(); } });
F.action("tkdue",function(v){ var f=document.querySelector(".tk-dlg"); if(!f) return; f.due.value=v==="x"?"":addDays(today(),+v); });
F.form("tksave",function(f){
  var x={id:DR.id||undefined,title:f.title.value,projectId:f.projectId.value,status:f.status.value,prio:f.prio.value,due:f.due.value,notes:f.notes.value,checklist:DR.checklist,mailRef:DR.mailRef||undefined};
  var pending=document.getElementById("tkClNew"); if(pending&&pending.value.trim()) x.checklist=x.checklist.concat([{t:pending.value.trim(),done:false}]);
  api("task.save",{task:x}).then(function(j){ if(j&&j.ok){ F.closeModal(); F.toast(DR.id?"Gespeichert":"Aufgabe angelegt"); } });
});
F.action("tkcomment",function(){ var i=document.getElementById("tkCmNew"); if(!i||!i.value.trim()||!DR||!DR.id) return; var id=DR.id;
  api("task.comment",{id:id,text:i.value}).then(function(j){ if(j&&j.ok){ var keep={title:document.querySelector(".tk-dlg").title.value}; openTask(id); var f=document.querySelector(".tk-dlg"); if(f) f.title.value=keep.title; } }); });
F.action("tkdel",function(id){ if(!confirm("Diese Aufgabe wirklich löschen?")) return; api("task.delete",{id:id}).then(function(j){ if(j&&j.ok){ F.closeModal(); F.toast("Aufgabe gelöscht"); } }); });
F.action("tknew",function(st){ if(F.current!=="auftraege") F.go("auftraege"); openTask("",st||"offen"); });
F.action("tkopen",function(id){ if(F.current!=="auftraege") F.go("auftraege"); openTask(id); });
F.action("tkview",function(v){ UI.tkView=v==="list"?"list":"board"; F.ls("fsc_tk_view",UI.tkView); F.render(); });
F.action("tkdoneall",function(){ UI.tkDoneAll=true; F.render(); });
F.listen("click",".tk-card",function(el,e){ if(e.target.closest("[data-act]")) return; openTask(el.getAttribute("data-tk")); });
F.listen("keydown",".tk-card",function(el,e){ if(e.target===el&&(e.key==="Enter"||e.key===" ")){ e.preventDefault(); openTask(el.getAttribute("data-tk")); } });
F.listen("click",".tk-tab tbody tr",function(el,e){ if(e.target.closest("select")) return; openTask(el.getAttribute("data-tk")); });
F.listen("change","[data-tkst]",function(el){ var id=el.getAttribute("data-tkst"), t=A().tasks.find(function(x){ return x.id===id; }); if(t&&t.print) return printMove(t,el.value); api("task.move",{id:id,status:el.value}); });
F.listen("change","[data-tkf]",function(el){ var k=el.getAttribute("data-tkf"); if(k==="proj") UI.tkProj=el.value; else if(k==="prio") UI.tkPrio=el.value; F.render(); });
F.listen("input","[data-tkf=q]",function(el){ UI.tkQ=el.value; F.render(); });

/* ---------- Drag & Drop zwischen den Spalten ---------- */
var dragId=null;
F.listen("dragstart",".tk-card",function(el,e){ dragId=el.getAttribute("data-tk"); el.classList.add("dragging"); try{ e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain",dragId); }catch(x){} });
F.listen("dragover",".tk-col",function(el,e){ if(!dragId) return; e.preventDefault(); document.querySelectorAll(".tk-col.over").forEach(function(c){ if(c!==el) c.classList.remove("over"); }); el.classList.add("over"); });
F.listen("drop",".tk-col",function(el,e){ if(!dragId) return; e.preventDefault(); var st=el.getAttribute("data-tkcol"), id=dragId, t=A().tasks.find(function(x){ return x.id===id; }); dragId=null; el.classList.remove("over");
  if(t&&t.print&&t.status!==st) return printMove(t,st);
  if(t&&t.status!==st){ t.status=st; F.render(); api("task.move",{id:id,status:st}).then(function(j){ if(j&&j.ok&&st==="erledigt") F.toast("Erledigt ✓"); }); } });
document.addEventListener("dragend",function(){ dragId=null; document.querySelectorAll(".tk-col.over,.tk-card.dragging").forEach(function(c){ c.classList.remove("over"); c.classList.remove("dragging"); }); });

/* ---------- Aufträge verwalten ---------- */
function projModal(){ var P=A().projects.slice().sort(function(a,b){ return (a.status==="abgeschlossen")-(b.status==="abgeschlossen")||String(a.name).localeCompare(String(b.name),"de"); });
  F.modal('<div class="tk-dh"><h2>Aufträge</h2>'+F.btnClose()+'</div><div class="tk-pl">'+(P.map(function(p){ var n=A().tasks.filter(function(t){ return t.projectId===p.id; }), o=n.filter(function(t){ return t.status!=="erledigt"; }).length;
      return '<div class="tk-pr'+(p.status==="abgeschlossen"?" off":"")+'"><span class="sw" style="background:'+PCOL[p.color||0]+'"></span><div><b>'+esc(p.name)+'</b><small>'+esc([p.customer,p.status==="aktiv"?"":p.status==="pausiert"?"pausiert":"abgeschlossen",o+" offen / "+n.length+" Aufgaben",p.due?"bis "+F.de(p.due):""].filter(Boolean).join(" · "))+'</small></div><button type="button" class="btn sm" data-act="tkprojedit:'+esc(p.id)+'">Bearbeiten</button></div>'; }).join("")||'<p class="mu">Noch keine Aufträge.</p>')+'</div>'+
    '<div class="foot"><span></span><button type="button" class="btn primary" data-act="tkprojnew">+ Neuer Auftrag</button></div>',"narrow"); }
function projEdit(id,pre){ var p=id?proj(id):null, x=p||Object.assign({name:"",customer:"",color:A().projects.length%PCOL.length,status:"aktiv",due:"",note:"",leadId:""},pre||{}), ld=leadOf(x);
  var leads=((F.D&&F.D.leads)||[]).map(function(l){ return l.company||l.name; }).filter(Boolean).filter(function(v,i,a){ return a.indexOf(v)===i; }).slice(0,300);
  F.modal('<form class="tk-dlg" data-form="tkprojsave"><input type="hidden" name="id" value="'+esc(x.id||"")+'"><input type="hidden" name="leadId" value="'+esc(x.leadId||(ld?ld.id:""))+'"><div class="tk-dh"><h2>'+(p?"Auftrag bearbeiten":"Neuer Auftrag")+'</h2>'+F.btnClose()+'</div>'+
    (p?'<div class="tk-links">'+(ld?'<button type="button" class="btn sm" data-act="tklead:'+esc(ld.id)+'">👤 Kundenakte</button>':'')+'<button type="button" class="btn sm" data-act="tkoffer:'+esc(p.id)+'">Angebot schreiben</button><button type="button" class="btn sm" data-act="tkinvoice:'+esc(p.id)+'">Rechnung schreiben</button><button type="button" class="btn sm" data-act="tknewin:'+esc(p.id)+'">+ Aufgabe</button></div>':'')+
    '<label class="fl">Name<input class="f" name="name" required maxlength="120" autofocus value="'+esc(x.name)+'" placeholder="z. B. Website Relaunch Muster GmbH"></label>'+
    '<label class="fl">Kunde<input class="f" name="customer" maxlength="160" list="tkLeads" value="'+esc(x.customer||"")+'" placeholder="Firma oder Name"><datalist id="tkLeads">'+leads.map(function(v){ return '<option value="'+esc(v)+'">'; }).join("")+'</datalist></label>'+
    '<div class="tk-g3"><label class="fl">Status<select class="f" name="status"><option value="aktiv"'+(x.status==="aktiv"?" selected":"")+'>Aktiv</option><option value="pausiert"'+(x.status==="pausiert"?" selected":"")+'>Pausiert</option><option value="abgeschlossen"'+(x.status==="abgeschlossen"?" selected":"")+'>Abgeschlossen</option></select></label>'+
    '<label class="fl">Abgabe (optional)<input class="f" type="date" name="due" value="'+esc(x.due||"")+'"></label><div class="fl">Farbe<div class="tk-cols">'+PCOL.map(function(c,i){ return '<label><input type="radio" name="color" value="'+i+'"'+((x.color||0)===i?" checked":"")+'><span style="background:'+c+'"></span></label>'; }).join("")+'</div></div></div>'+
    '<label class="fl">Notiz<textarea class="f" name="note" rows="2" maxlength="2000">'+esc(x.note||"")+'</textarea></label>'+
    '<div class="foot">'+(p?'<button type="button" class="btn bad-t" data-act="tkprojdel:'+esc(p.id)+'">Löschen</button>':'<button type="button" class="btn" data-act="tkprojects">Zurück</button>')+'<div class="btns"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></div></div></form>',"narrow"); }
F.action("tkprojects",projModal);
F.action("tkprojnew",function(){ projEdit(""); });
F.action("tkprojedit",projEdit);
F.form("tkprojsave",function(f){ var c=f.querySelector('input[name=color]:checked');
  var ld=leadOf({customer:f.customer.value,leadId:f.leadId.value});
  api("project.save",{project:{id:f.id.value||undefined,name:f.name.value,customer:f.customer.value,status:f.status.value,due:f.due.value,note:f.note.value,color:c?c.value:0,leadId:ld?ld.id:""}}).then(function(j){ if(j&&j.ok){ F.toast("Auftrag gespeichert"); if(!f.id.value) UI.tkProj=j.id; projModal(); } }); });
F.action("tkprojdel",function(id){ if(!confirm("Diesen Auftrag löschen?")) return; api("project.delete",{id:id}).then(function(j){ if(j&&j.ok){ if(UI.tkProj===id) UI.tkProj=""; projModal(); } }); });

/* ---------- Verbindungen: Kunden, Mails, Kalender, Rechnungen ---------- */
function leads(){ return (F.D&&F.D.leads)||[]; }
function leadOf(p){ if(!p) return null; var L=leads(); if(p.leadId){ var a=L.find(function(l){ return l.id===p.leadId; }); if(a) return a; }
  var c=String(p.customer||"").trim().toLowerCase(); return c?L.find(function(l){ return String(l.company||"").trim().toLowerCase()===c||String(l.name||"").trim().toLowerCase()===c; })||null:null; }
function leadProjects(id){ var l=leads().find(function(x){ return x.id===id; }); return l?A().projects.filter(function(p){ var ld=leadOf(p); return ld&&ld.id===l.id; }):[]; }
F.tkLeadProjects=leadProjects;
F.tkLeadHtml=function(l){ var P=leadProjects(l.id); if(!P.length) return '';
  return '<div><div class="sec-t">Aufträge</div>'+P.map(function(p){ var T=A().tasks.filter(function(t){ return t.projectId===p.id; }), o=T.filter(function(t){ return t.status!=="erledigt"; }), nx=o.filter(function(t){ return t.due; }).sort(function(a,b){ return a.due.localeCompare(b.due); })[0];
    return '<button type="button" class="tk-lr" data-act="tkprojopen:'+esc(p.id)+'"><span class="sw" style="background:'+PCOL[p.color||0]+'"></span><span><b>'+esc(p.name)+'</b><small>'+(o.length?o.length+" offen":"alles erledigt")+(nx?" · nächste Frist "+esc(dueLabel(nx.due)):"")+(p.status!=="aktiv"?" · "+esc(p.status):"")+'</small></span></button>'; }).join("")+'</div>'; };
F.action("tkprojfromlead",function(id){ var l=leads().find(function(x){ return x.id===id; }); if(!l) return; F.closeDrawer&&F.closeDrawer(); if(F.current!=="auftraege") F.go("auftraege");
  projEdit("",{name:(l.topic&&l.topic!=="Etwas anderes"?l.topic+" – ":"")+(l.company||l.name),customer:l.company||l.name,leadId:l.id}); });
F.action("tkprojopen",function(id){ F.closeDrawer&&F.closeDrawer(); UI.tkProj=id; F.go("auftraege"); });
F.action("tklead",function(id){ F.closeModal(); if(F.openLead){ if(F.current!=="kunden") F.go("kunden"); F.openLead(id); } });
F.action("tknewin",function(pid){ UI.tkProj=pid; F.closeModal(); openTask("","offen",{projectId:pid}); });
F.action("tkmail",function(){ var r=DR&&DR.mailRef; if(!r) return; F.closeModal(); UI.msel=r.id; UI.mq=r.subject||""; if(F.M&&F.M.serverSearch) F.M.serverSearch(); F.go("post"); });
F.action("tktermin",function(){ if(!DR) return; var t=DR, p=proj(t.projectId); F.closeModal(); if(F.openEventEdit) F.openEventEdit({title:t.title+(p?" · "+p.name:""),notes:t.notes||""},t.due||today()); });
function bill(pid,kind){ var p=proj(pid); if(!p) return; var ld=leadOf(p); F.closeModal(); if(F.openInvoice) F.openInvoice(Object.assign({title:(kind==="offer"?"Angebot · ":"Rechnung · ")+p.name,contactName:p.customer||(ld&&(ld.company||ld.name))||"",email:ld&&ld.email||""},kind==="offer"?{kind:"offer"}:{})); }
F.action("tkoffer",function(pid){ bill(pid,"offer"); });
F.action("tkinvoice",function(pid){ bill(pid,""); });
/* Mail → Aufgabe: Betreff als Titel, Absender als Notiz, Mail verknüpft, Auftrag des Kunden vorausgewählt */
F.tkFromMail=function(m){ if(!m) return;
  var subj=String(m.subject||"").replace(/^\s*((re|aw|wg|fw|fwd)\s*:\s*)+/i,"").trim(), from=String(m.from||"").toLowerCase();
  var ld=leads().find(function(l){ return l.email&&String(l.email).toLowerCase()===from; }), pr=ld?A().projects.filter(function(p){ var x=leadOf(p); return x&&x.id===ld.id&&p.status!=="abgeschlossen"; })[0]:null;
  if(F.current!=="auftraege") F.go("auftraege");
  openTask("","offen",{title:subj.slice(0,200)||"Mail beantworten",projectId:pr?pr.id:"",notes:"Aus Mail von "+(m.fromName?m.fromName+" ":"")+"<"+(m.from||"")+"> vom "+new Date(m.date).toLocaleDateString("de-AT"),
    mailRef:{id:m.id,account:m.account||"",folder:m.folder||"INBOX",uid:m.uid||0,subject:m.subject||"",from:m.from||""}}); };

/* ---------- für Statusleiste & Suche ---------- */
F.tkOpenDue=function(){ return A().tasks.filter(function(t){ return t.status!=="erledigt"&&t.due; }).map(function(t){ var p=proj(t.projectId); return {id:t.id,title:t.title,due:t.due,project:p?p.name:""}; }); };
F.tkDeadlines=function(n){ return A().tasks.filter(function(t){ return t.status!=="erledigt"&&t.due; }).sort(function(a,b){ return a.due.localeCompare(b.due)||(a.prio==="dringend"?-1:0); }).slice(0,n||6).map(function(t){ var p=proj(t.projectId); return {id:t.id,title:t.title,due:t.due,label:dueLabel(t.due),cls:dueCls(t),color:p?PCOL[p.color||0]:"var(--ink-3)",project:p?p.name:"",prio:t.prio}; }); };
F.tkDueDays=function(){ var o={}; A().tasks.forEach(function(t){ if(t.status!=="erledigt"&&t.due) o[t.due]=(o[t.due]||0)+1; }); return o; };
F.searcher(function(q){ q=q.toLowerCase(); return A().tasks.filter(function(t){ return t.title.toLowerCase().indexOf(q)>-1; }).slice(0,6).map(function(t){ var p=proj(t.projectId); return {group:"Aufgaben",label:t.title,sub:(p?p.name+" · ":"")+(t.due?"fällig "+dueLabel(t.due):"ohne Frist"),act:"tkopen:"+t.id}; }); });
F.feed(function(){ var t=today(); return A().tasks.filter(function(x){ return x.status!=="erledigt"&&x.due&&x.due<=t&&!x.print&&!x.leadId; }).map(function(x){ var p=proj(x.projectId), over=x.due<t;
  return {id:"tk:"+x.id,rank:over?2:3,sev:over?"bad":"ok",icon:"check",tag:[over?"bad":"ok",over?"Frist überschritten":"Heute fällig"],t:x.title,d:(p?p.name+" · ":"")+(over?"fällig "+F.de(x.due):"heute fällig"),acts:[["Öffnen","tkopen:"+x.id]]}; }); });

F.css(
'.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel)}.seg button{border:0;background:none;padding:6px 12px;font-size:13px;font-weight:600;color:var(--ink-2);display:flex;align-items:center;gap:6px}.seg button svg{width:15px;height:15px}.seg button[aria-pressed="true"]{background:var(--sunk);color:var(--ink)}'+
'.tk-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}'+
'.tk-kpi{display:grid;gap:4px;text-align:left;padding:14px 18px;border:1px solid var(--line);border-radius:var(--r);background:var(--panel);box-shadow:var(--shadow);color:var(--ink)}.tk-kpi span{font-size:13px;color:var(--ink-2)}.tk-kpi b{font:600 27px/1.1 var(--f-mono);letter-spacing:-.03em}.tk-kpi.bad b{color:var(--bad)}.tk-kpi.ok b{color:var(--ok)}'+
'.tk-bar2{display:flex;flex-wrap:wrap;gap:10px}.tk-bar2 select.f{width:auto;min-width:170px}.tk-bar2 .tk-q{flex:1;min-width:220px}'+
'.tk-board{display:grid;grid-template-columns:repeat(4,minmax(172px,1fr));gap:12px;overflow-x:auto;padding-bottom:6px;align-items:start}'+
'.tk-col{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:10px;min-height:120px;transition:outline-color .15s;outline:2px dashed transparent;outline-offset:-4px}.tk-col.over{outline-color:var(--glow)}'+
'.tk-ch{display:flex;align-items:center;gap:8px;padding:2px 2px 10px;min-width:0}.tk-ch b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.tk-ch .dot{width:9px;height:9px;border-radius:50%}.tk-ch b{font-size:14.5px;font-weight:700;color:var(--ink)}.tk-ch .cnt{font-size:12px;color:var(--ink-3);border-radius:99px;padding:0 4px}.tk-add{margin-left:auto;border:0;background:none;font-size:20px;line-height:1;color:var(--ink-3);width:28px;height:28px;border-radius:8px}.tk-add:hover{background:var(--sunk);color:var(--ink)}'+
'.tk-col{min-width:0}.tk-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:9px}.tk-card,.tk-top,.tk-meta{min-width:0}.tk-top>*{min-width:0}.tk-t{overflow-wrap:anywhere}.tk-none{font-size:12.5px;color:var(--ink-3);text-align:center;padding:16px 0}'+
'.tk-card{background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:9px;cursor:pointer;transition:transform .12s,border-color .12s}.tk-card:hover{border-color:var(--line-2);transform:translateY(-1px)}.tk-card.dragging{opacity:.45}.tk-card.done .tk-t{color:var(--ink-2)}'+
'.tk-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'+
'.tk-pj{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:99px;background:color-mix(in srgb,var(--pc) 16%,transparent);color:var(--ink);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tk-pj i{width:7px;height:7px;border-radius:50%;background:var(--pc);flex:none}.tk-pj>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tk-pj.none{--pc:var(--ink-3);color:var(--ink-3)}'+
'.tk-t{font-weight:600;font-size:14px;line-height:1.35;display:flex;gap:6px;align-items:flex-start}.tk-ok{color:var(--ok);flex:none}.tk-ok svg{width:16px;height:16px}'+
'.tk-bar{height:4px;border-radius:4px;background:var(--line);overflow:hidden}.tk-bar span{display:block;height:100%;border-radius:4px}'+
'.tk-meta{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--ink-3)}.tk-meta .tk-mi{margin-left:auto}.tk-meta .tk-mi+.tk-mi{margin-left:0}'+
'.tk-due{display:inline-flex;align-items:center;gap:5px;font-weight:600;color:var(--ink-2)}.tk-due svg{width:13px;height:13px}.tk-due.over{color:var(--bad)}.tk-due.today{color:var(--glow)}.tk-due.soon{color:var(--warn)}.tk-due.none{font-weight:400;color:var(--ink-3)}'+
'.tk-tab{width:100%;border-collapse:collapse;font-size:13.5px}.tk-tab th{text-align:left;font-size:12px;color:var(--ink-3);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line)}.tk-tab td{padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:middle}.tk-tab tr{cursor:pointer}.tk-tab tbody tr:hover{background:var(--sunk)}.tk-tab .tt{font-weight:600}.tk-tab tr.done .tt{color:var(--ink-3);text-decoration:line-through}.tk-tab select.f.sm{padding:4px 8px;width:auto;font-size:12.5px}'+
'.tk-empty{padding:28px;text-align:center;display:grid;gap:8px;justify-items:center}.tk-empty p{color:var(--ink-2);max-width:520px;margin:0}.tk-empty .btns,.tk-dlg .btns{display:flex;gap:8px;flex-wrap:wrap}'+
'.tk-dlg{display:grid;gap:14px}.tk-dh{display:flex;justify-content:space-between;align-items:center}.tk-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'+
'.tk-quick span{font-size:13px;color:var(--ink-2)}.tk-quick div{display:flex;flex-wrap:wrap;gap:6px}.btn.sm{padding:3px 10px;font-size:12px;min-height:28px}'+
'#tkCl{display:grid;gap:4px}.tk-cli{display:flex;align-items:center;gap:9px;padding:5px 8px;border-radius:8px;background:var(--sunk)}.tk-cli span{flex:1;font-size:14px;color:var(--ink)}.tk-cli.on span{text-decoration:line-through;color:var(--ink-3)}.tk-cli .x{border:0;background:none;color:var(--ink-3);font-size:18px;line-height:1}'+
'.tk-cladd{display:flex;gap:8px;margin-top:6px}.tk-none2{font-size:12.5px}'+
'.tk-cm{display:grid;gap:8px;max-height:220px;overflow:auto}.tk-cm div{background:var(--sunk);border-radius:8px;padding:7px 10px}.tk-cm small{color:var(--ink-3)}.tk-cm p{margin:2px 0 0;color:var(--ink);white-space:pre-wrap}'+
'.tk-links{display:flex;flex-wrap:wrap;gap:6px}'+
'.tk-pst{display:flex;align-items:center;gap:6px;min-width:0}.tk-pst svg{width:14px;height:14px;color:var(--ink-3);flex:none}.tk-pst .tag{font-size:11px}'+
'.tk-print{display:grid;gap:8px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--sunk)}.tk-print-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tk-print-h svg{width:17px;height:17px}.tk-print-d{font-size:13px;color:var(--ink-2)}.tk-print small{font-size:12px}'+
'.tk-ro{display:flex;align-items:center;gap:6px;min-height:38px;font-size:14px;color:var(--ink)}'+
'.tk-lr{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:8px 10px;margin-top:6px}.tk-lr:hover{border-color:var(--ink-3)}.tk-lr .sw{width:10px;height:10px;border-radius:3px;flex:none}.tk-lr span:last-child{display:grid;min-width:0}.tk-lr small{color:var(--ink-3)}'+
'.tk-pl{display:grid;gap:6px}.tk-pr{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:10px}.tk-pr.off{opacity:.6}.tk-pr .sw{width:12px;height:12px;border-radius:4px;flex:none}.tk-pr div{flex:1;min-width:0;display:grid}.tk-pr small{color:var(--ink-3)}'+
'.tk-cols{display:flex;flex-wrap:wrap;gap:6px;padding-top:4px}.tk-cols input{position:absolute;opacity:0;pointer-events:none}.tk-cols span{display:block;width:22px;height:22px;border-radius:6px;cursor:pointer;border:2px solid transparent}.tk-cols input:checked+span{border-color:var(--ink);box-shadow:0 0 0 2px var(--panel) inset}'+
'.tk-g3:has(.tk-seg){grid-template-columns:1fr}.tk-seg{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}.tk-seg label{position:relative;cursor:pointer}.tk-seg input{position:absolute;opacity:0;pointer-events:none}.tk-seg span{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel);border-radius:99px;padding:6px 12px;font-size:13.5px;font-weight:500;color:var(--ink);white-space:nowrap}.tk-seg i{width:8px;height:8px;border-radius:50%}.tk-seg input:checked+span{background:var(--glow);border-color:var(--glow);color:var(--on-glow)}.tk-seg .warn input:checked+span{background:var(--warn);border-color:var(--warn)}.tk-seg .bad input:checked+span{background:var(--bad);border-color:var(--bad);color:#fff}.tk-seg input:focus-visible+span{outline:2px solid var(--glow);outline-offset:2px}@media (max-width:900px){.tk-seg span{padding:9px 14px;font-size:14.5px}}@media (max-width:900px){.tkm-sum{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px;color:var(--ink-3);margin:2px 0 10px}.tkm-sum .bad{color:var(--bad);font-weight:600}.tkm-sum .ok{color:var(--ok)}.view-auftraege .tk-bar2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.view-auftraege .tk-bar2 .tk-q{grid-column:1/-1;order:-1}.view-auftraege .tk-bar2 select.f{min-width:0;width:100%}.tkm-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:12px calc(-1*clamp(16px,4vw,44px)) 10px;padding:0 clamp(16px,4vw,44px)}.tkm-tabs::-webkit-scrollbar{display:none}.tkm-tabs button{flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:99px;padding:8px 14px;font:inherit;font-size:14px;font-weight:500}.tkm-tabs button b{font-weight:600;color:var(--ink-3)}.tkm-tabs button[aria-current]{background:var(--glow);border-color:var(--glow);color:var(--on-glow)}.tkm-tabs button[aria-current] b{color:inherit}.tkm-tabs .dot{width:8px;height:8px;border-radius:50%}.tkm-cards{display:grid;gap:8px;padding-bottom:90px}.tk-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.tk-board{grid-template-columns:repeat(4,minmax(260px,82vw));scroll-snap-type:x mandatory}.tk-col{scroll-snap-align:start}.tk-g3{grid-template-columns:1fr}.tk-tab th:nth-child(4),.tk-tab td:nth-child(4),.tk-tab th:nth-child(6),.tk-tab td:nth-child(6){display:none}}'
);

F.view({id:"auftraege",label:"Aufträge",short:"Aufträge",icon:"board",order:22,mobile:false,
  count:function(){ var t=today(); return A().tasks.filter(function(x){ return x.status!=="erledigt"&&x.due&&x.due<=t; }).length; },
  render:vAuftraege});
})();
