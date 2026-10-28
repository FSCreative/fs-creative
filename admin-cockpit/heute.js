/* Ansicht „Heute“ im Alpenglas-Look (Wunsch Simon 27.10.2026): große Uhr mit Datum und Wetter, „Für dich, jetzt“ (die wichtigsten Einträge
   aller Module als Karten, darunter „Alles, was ansteht“), rechts Termine, Geld-Ring, Druck live und Meine Aufgaben; darunter Posteingang,
   Plattformen, Aufträge und Monatseinkommen. Unten schwebt „Frag dein Cockpit …“ (KI-Chat).
   Handy: eine Spalte – Uhr, Frage an die KI, Schnellaktionen, Termine, Geld, Druck, Für dich, Aufgaben, Post, Plattformen, Einkommen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;
var SRC={website:"Websites",kochdu:"kochdu",valuero:"VALUERO",blitzdings:"Blitzdings",kantineur:"Kantineur"};
F.SRC=SRC;
F.isInbox=function(m){ return /^inbox$/i.test(m.folder||"INBOX"); };
F.unreadMails=function(){ return F.D?F.D.mail.messages.filter(function(m){ return !m.read && F.isInbox(m); }):[]; };
F.newLeads=function(){ return F.D?F.D.leads.filter(function(l){ return (l.stage||"anfrage")==="anfrage"; }):[]; };
F.siteBad=function(s){ return s.up===false||/FAILED|CRASHED/.test(s.status||""); };

/* Symbole aus dem Alpenglas-Satz – nur als Ersatz, falls core.js sie (noch) nicht mitbringt */
var ICF={
  sparkle:'<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  send:'<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5z"/>',
  chevR:'<path d="m9 6 6 6-6 6"/>',
  chevD:'<path d="m6 9 6 6 6-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  plug:'<path d="M9 2v6M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/>',
  checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  alertCircle:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  cloud:'<path d="M7 19h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.6A3.8 3.8 0 0 0 7 19z"/>',
  cloudSun:'<path d="M9 2.5v1.5M3.5 8H5M4.9 3.9l1 1M14.1 3.9l-1 1"/><path d="M6.3 11a3.5 3.5 0 0 1 6.1-3.6"/><path d="M8 20h9a4 4 0 0 0 .4-8 5 5 0 0 0-9.5 1.4A3.3 3.3 0 0 0 8 20z"/>',
  snow:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
  rain:'<path d="M7 15h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.6A3.8 3.8 0 0 0 7 15z"/><path d="m8.5 18-1 3M12.5 18l-1 3M16.5 18l-1 3"/>',
  fog:'<path d="M4 8h16M3 12h18M5 16h14M8 20h8"/>',
  storm:'<path d="M7 15h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.6A3.8 3.8 0 0 0 7 15z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>'
};
Object.keys(ICF).forEach(function(k){ if(!F.icons[k]) F.icons[k]=ICF[k]; });

/* Basis-Einträge für "Heute" */
F.feed(function(){
  var D=F.D, out=[], today=D.today;
  F.newLeads().forEach(function(l){ out.push({id:"lead:"+l.id,rank:1,sev:"glow",icon:"lead",tag:["glow","Neue Anfrage"],t:(l.company?l.company+" · ":"")+l.name,d:(l.topic||"Anfrage")+(l.entwurf?" · möchte einen Gratis-Entwurf":"")+(l.source?" · über "+l.source:"")+" · "+F.ago(l.created),acts:[["Kundenakte","lead:"+l.id],["Antworten","replylead:"+l.id,"primary"]]}); });
  var sev=D.sev;
  /* Überfällige Rechnung: „Details“ öffnet die Rechnungsseite (fin:invd), Zahlungseingang über den bestehenden Dialog (gebucht wird erst dort) */
  if(sev) sev.invoices.filter(function(i){return i.overdue&&i.open>0.005&&!i.cancelled&&i.type!=="SR";}).forEach(function(i){ out.push({id:"inv:"+i.id,rank:2,sev:"bad",icon:"euro",tag:["bad","Überfällig"],t:(i.contact||"Kunde")+" · "+(i.nr||"Entwurf"),d:eur(i.open)+" offen · fällig seit "+de(i.due),acts:[["Details",(F.actions.fin?"fin:invd:":"sdinv:")+i.id],["Mahnen","sdremind:"+i.id],["Zahlungseingang erfassen","book:"+i.id,"primary"]]}); });
  (D.sites||[]).forEach(function(s){
    if(/FAILED|CRASHED/.test(s.status||"")) out.push({id:"rw:"+s.key,rank:2,sev:"bad",icon:"alert",tag:["bad","Deploy"],t:"Deploy fehlgeschlagen: "+s.name,d:"Railway · letzter Versuch "+(s.lastDeploy?F.ago(s.lastDeploy):""),acts:[["Websites","go:web"]]});
    else if(s.up===false&&(s.active||!s.own)) out.push({id:"down:"+s.key,rank:2,sev:"bad",icon:"alert",tag:["bad","Offline"],t:s.name+" ist nicht erreichbar",d:s.domain||"",acts:s.url?[["Öffnen","url:"+s.url]]:[]});
  });
  // Plattform-Abgleich („Zu verrechnen“) bewusst nicht mehr unter „Zu erledigen“ – kochdu & Co. rechnen automatisch ab
  /* Mail eines bekannten Kunden (Postfach: F.M.custOf) bekommt zusätzlich „Kundenakte“ */
  F.unreadMails().filter(function(m){ return !m.answered && (Date.now()-Date.parse(m.date||0))<14*864e5; }).slice(0,8).forEach(function(m){
    var c=null; try{ c=F.M&&F.M.custOf?F.M.custOf(m):null; }catch(e){ c=null; }
    var acts=[["Lesen","mail:"+m.id,"primary"]]; if(c&&c.lead) acts.push(["Kundenakte","lead:"+c.lead.id]);
    out.push({id:"mail:"+m.id,rank:4,sev:"info",icon:"post",tag:["info","Mail"],t:(m.fromName||m.from||"")+": „"+(m.subject||"(kein Betreff)")+"“",d:F.ago(m.date)+" · ungelesen"+(c&&c.lead?" · Kunde: "+(c.lead.company||c.lead.name||""):""),acts:acts}); });
  /* Bankumsätze & Entwürfe: Feed kommt aus sevdesk.js (Dateiname historisch) */
  return out;
});

/* Hinweis „Auftrag abgeschlossen, aber keine Rechnung“ – nur ein Hinweis mit Knopf, nie automatisch eine Rechnung.
   Gilt nur für Aufträge, die ihre Belege kennen (project.docs) oder ab heute angelegt wurden; ältere Aufträge bleiben wie bisher still.
   Als verrechnet gilt: verknüpfte Rechnung (nicht storniert) oder eine Rechnung an den Buchhaltungs-Kontakt des Leads seit Auftragsbeginn. */
var NOINV_FROM=Date.parse("2026-10-28T00:00:00");
function projBilled(p){
  var inv=(F.D.sev&&F.D.sev.invoices)||[], byId=function(id){ return inv.find(function(i){ return String(i.id)===String(id); }); };
  if((Array.isArray(p.docs)?p.docs:[]).some(function(d){ if(!d||d.kind!=="invoice") return false; var i=byId(d.docId!=null?d.docId:d.id); return !i||(!i.cancelled&&i.type!=="SR"); })) return true;
  var ld=p.leadId&&(F.D.leads||[]).find(function(l){ return l.id===p.leadId; }), cid=p.contactId||(ld&&ld.contactId), from=p.created?F.ymd(new Date(+p.created)):"";
  return !!(cid&&inv.some(function(i){ return String(i.contactId)===String(cid)&&!i.cancelled&&i.type!=="SR"&&i.type!=="MA"&&(!from||String(i.date||"")>=from); }));
}
F.feed(function(){
  var A=F.D.auftraege, ok=F.ls("fsc_noinv_ok")||{}; if(!A||!Array.isArray(A.projects)||!F.D.sev) return [];
  return A.projects.filter(function(p){ return p&&p.status==="abgeschlossen"&&p.id!=="pdruckshop"&&!ok[p.id]&&(Array.isArray(p.docs)||(+p.created||0)>=NOINV_FROM)&&!projBilled(p); }).slice(0,5).map(function(p){
    return {id:"noinv:"+p.id,rank:3,sev:"warn",icon:"euro",tag:["warn","Rechnung fehlt"],t:"Auftrag abgeschlossen: "+p.name,d:(p.customer?p.customer+" · ":"")+"noch keine Rechnung verknüpft",
      acts:[["Rechnung erstellen","tkinvoice:"+p.id,"primary"],["Auftrag","tkprojopen:"+p.id],["Keine nötig","hnoinv:"+p.id]]}; });
});
F.action("hnoinv",function(id){ var ok=F.ls("fsc_noinv_ok")||{}; ok[id]=Date.now(); F.ls("fsc_noinv_ok",ok); F.toast("Ausgeblendet – für diesen Auftrag kommt kein Hinweis mehr"); F.render(); });

/* „Meine Aufgaben“ (früher To-Dos): offene Aufgaben aus „Aufträge“, nächste Frist zuerst; Haken = erledigt (mit Rückgängig), + legt eine Aufgabe ohne Auftrag an */
function openTasks(){ var T=(F.D.auftraege&&F.D.auftraege.tasks)||[]; return T.filter(function(x){ return x.status!=="erledigt"; }).sort(function(a,b){ var pa=a.prio==="dringend"?0:a.prio==="hoch"?1:2, pb=b.prio==="dringend"?0:b.prio==="hoch"?1:2; return String(a.due||"9999").localeCompare(String(b.due||"9999"))||pa-pb; }); }
F.taskList=function(n){ var t=F.D.today, arr=openTasks().slice(0,n||8), P=(F.D.auftraege&&F.D.auftraege.projects)||[];
  return arr.length?arr.map(function(x){ var p=P.find(function(y){ return y.id===x.projectId; });
    return '<div class="tdrow"><input type="checkbox" data-tkdone="'+esc(x.id)+'" aria-label="Erledigt"><button type="button" class="todo-t" data-act="tkopen:'+esc(x.id)+'" title="'+esc(x.title||"")+'">'+esc(x.title||"")+(x.due?' <span class="due'+(x.due<t?" late":"")+'">'+(x.due<t?"überfällig · ":"")+de(x.due)+'</span>':'')+(p?' <span class="due">· '+esc(p.name)+'</span>':'')+'</button></div>'; }).join(""):'<div class="empty">Keine offenen Aufgaben.</div>'; };
F.taskAdd=function(){ return '<form class="todo-add" data-form="todo"><input class="f" name="text" placeholder="Neue Aufgabe …" aria-label="Neue Aufgabe" required><input class="f" type="date" name="due" aria-label="Fällig am" style="max-width:150px"><button class="btn primary" type="submit" aria-label="Aufgabe anlegen">+</button></form>'; };
F.form("todo",function(f){ var txt=f.text.value.trim(); if(!txt) return; F.addTodo({text:txt,due:f.due.value||""}).then(function(j){ if(j&&j.ok) F.toast("Aufgabe angelegt",false,"Ansehen",function(){ F.go("auftraege"); }); }); });
F.listen("change","[data-tkdone]",function(el){ var id=el.getAttribute("data-tkdone"), T=(F.D.auftraege&&F.D.auftraege.tasks)||[], x=T.find(function(y){ return y.id===id; }); if(!x||!F.tkApi) return;
  if(x.print){ el.checked=false; F.toast("Druckaufträge schließt du auf der Druck-Seite ab",true); return; }
  var prev=x.status; F.tkApi("task.move",{id:id,status:"erledigt"}).then(function(j){ if(j&&j.ok) F.toast("Erledigt ✓",false,"Rückgängig",function(){ F.tkApi("task.move",{id:id,status:prev}); }); }); });

/* ---------- Hilfen ---------- */
function p2(n){ return String(n).padStart(2,"0"); }
function hhmm(d){ return p2(d.getHours())+":"+p2(d.getMinutes()); }
function isMob(){ return window.innerWidth<=900; }
function greet(){ var h=new Date().getHours(); return h<11?"Guten Morgen":h<17?"Hallo":"Guten Abend"; }
function openTxt(n){ return n?n+(n===1?" Sache offen":" Sachen offen"):"alles erledigt"; }
function c2e(c){ return (+c||0)/100; }
function byDateDesc(a,b){ return String(b.date||"").localeCompare(String(a.date||"")); }
/* eine Karte darf nie die ganze Seite mitreißen */
function safe(fn){ try{ return fn()||""; }catch(e){ console.error(e); return ""; } }
function dayShort(iso){ var t=F.D.today; if(iso===t) return "Heute"; var d1=new Date(t+"T12:00:00"); d1.setDate(d1.getDate()+1); if(iso===F.ymd(d1)) return "Morgen";
  return new Date(iso+"T12:00:00").toLocaleDateString("de-AT",{weekday:"short",day:"numeric",month:"numeric"}); }
function hdr(title,right){ return '<div class="ag-h"><h2>'+esc(title)+'</h2>'+(right||'')+'</div>'; }
function lnk(label,attr){ return '<button type="button" class="link ag-lk" '+attr+'>'+esc(label)+F.svg("chevR")+'</button>'; }
/* Reihenfolge wie F.feedItems (Rang), bei gleichem Rang zuerst Kritisches */
var SEVO={bad:0,warn:1,glow:2,info:3,ok:4};
function sevo(x){ var v=SEVO[x.sev]; return v==null?5:v; }
function feedSorted(){ return F.feedItems().map(function(x,i){ return [x,i]; }).sort(function(a,b){ return (a[0].rank-b[0].rank)||(sevo(a[0])-sevo(b[0]))||(a[1]-b[1]); }).map(function(p){ return p[0]; }); }
/* Initialen + Farbe aus dem Namen (Posteingang) */
function initials(name){ var s=String(name||"").replace(/["'„“”()<>]/g," ").trim(); if(s.indexOf("@")>0) s=s.split("@")[0].replace(/[._+-]+/g," ");
  var w=s.split(/\s+/).filter(function(x){ return /[0-9A-Za-zÀ-ž]/.test(x); });
  var a=w.length>1?w[0].charAt(0)+w[1].charAt(0):(w[0]||"?").slice(0,2); return a.toUpperCase(); }
function avc(name){ var s=String(name||""), h=0; for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; return "c"+(Math.abs(h)%6); }

/* ---------- Kopf: Uhr, Datum, Wetter, Begrüßung ---------- */
/* Die Uhr bleibt im HTML leer und wird nur vom eigenen Takt befüllt – so baut die Uhr die Seite nie neu auf */
function wxLine(){ var w=F.D.weather; if(!w||w.temp==null||!isFinite(+w.temp)) return "";
  var parts=[w.place||"",Math.round(+w.temp)+"°",w.text||""];
  if(w.min!=null&&w.max!=null&&isFinite(+w.min)&&isFinite(+w.max)) parts.push(Math.round(+w.min)+"° bis "+Math.round(+w.max)+"°");
  if(w.snowLine!=null&&isFinite(+w.snowLine)&&+w.snowLine>0) parts.push("Schneefallgrenze "+Math.round(+w.snowLine).toLocaleString("de-AT")+" m");
  var txt=parts.filter(Boolean).join(" · ");
  return '<p class="ag-wx" title="'+esc(txt)+'">'+F.svg(Object.prototype.hasOwnProperty.call(F.icons,w.icon)?w.icon:"cloud")+'<span>'+esc(txt)+'</span></p>'; }
function chips(){ var out="", nl=F.newLeads().length, cust=(F.D.sites||[]).filter(function(s){ return !s.own&&s.active; }), bad=cust.filter(F.siteBad).length;
  if(nl) out+=' · <button type="button" class="ag-chip glow" data-go="kunden">'+nl+(nl===1?" neue Anfrage":" neue Anfragen")+'</button>';
  if(bad) out+=' · <button type="button" class="ag-chip bad" data-go="web">'+bad+(bad===1?" Website mit Problem":" Websites mit Problem")+'</button>';
  return out; }
function heroHtml(f){ var dl=new Date().toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long"});
  return '<div class="ag-hero"><time class="ag-clock" id="agClock"></time><p class="ag-date">'+esc(dl)+'</p>'+safe(wxLine)+
    '<p class="ag-greet">'+esc(greet())+', Simon · '+esc(openTxt(f.length))+chips()+'</p>'+(isMob()?'':quickDesk())+'</div>'; }
/* Schnellaktionen (gleich wie „+ Neu“ oben, plus Beleg); .glass = Unschärfe aus der Shell, damit die Schrift über hellem Schnee lesbar bleibt */
function scanIn(cap){ return '<input type="file" class="fsd-scan" accept="image/*,application/pdf"'+(cap?' capture="environment"':'')+' multiple hidden>'; }
function quickDesk(){ return '<div class="ag-qa"><button type="button" class="ag-q glass" data-act="compose">'+F.mxIc("mail")+'Neue Mail</button><button type="button" class="ag-q glass" data-act="newevent:">'+F.mxIc("cal")+'Termin</button>'+
  '<button type="button" class="ag-q glass" data-act="newinvoice">'+F.mxIc("inv")+'Rechnung</button><label class="ag-q glass" role="button" tabindex="0">'+F.mxIc("cam")+'Beleg hochladen'+scanIn(false)+'</label></div>'; }
function quickMob(){ return '<div class="panel ag-quick"><button type="button" data-act="compose">'+F.mxIc("mail")+'<span>Neue Mail</span></button><button type="button" data-act="newevent:">'+F.mxIc("cal")+'<span>Termin</span></button>'+
  '<button type="button" data-act="newinvoice">'+F.mxIc("inv")+'<span>Rechnung</span></button><label class="ag-qs" role="button" tabindex="0">'+F.mxIc("cam")+'<span>Beleg scannen</span>'+scanIn(true)+'</label></div>'; }
F.listen("keydown","label.ag-q,label.ag-qs",function(el,e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); var i=el.querySelector("input"); if(i) i.click(); } });
/* kleiner Hinweis, wenn Verbindungen gestört sind (Daten aus /admin/api/cockpit → connections) */
function connNote(){ var c=F.D.connections; if(!c||!(+c.error>0)) return "";
  var p=(c.problems||[]).filter(function(x){ return x&&x.state==="error"; }).map(function(x){ return x.label; }).filter(Boolean), n=+c.error;
  return '<button type="button" class="ag-conn glass" data-act="'+(F.actions.conn?"conn":"settings")+'">'+F.svg("plug")+'<span><b>'+n+(n===1?" Verbindung gestört":" Verbindungen gestört")+'</b><small>'+esc(p.slice(0,3).join(", ")||"Details ansehen")+'</small></span>'+F.svg("chevR")+'</button>'; }

/* ---------- Für dich, jetzt ---------- */
function primOf(x){ var a=x.acts||[]; return a.filter(function(y){ return /\bprimary\b/.test(y[2]||""); })[0]||a[0]||null; }
function snoozeBtn(x){ return '<button type="button" class="btn icon" data-snooze="'+esc(x.id)+'" title="Bis morgen ausblenden" aria-label="Bis morgen ausblenden">'+F.svg("close")+'</button>'; }
/* Karte = li.item (Handy: Wischen rechts = Hauptaktion, links = ausblenden, Antippen = Aktionsblatt aus mobile.js) */
function cardHtml(x){ var tg=x.tag||["grey",""], pr=primOf(x), rest=(x.acts||[]).filter(function(a){ return a!==pr; });
  return '<li class="item ag-fc"><span class="sev '+esc(x.sev||"")+'"></span><div class="ag-fb"><div class="ag-k"><span class="ico">'+F.svg(x.icon)+'</span>'+(tg[1]?'<span class="tag '+esc(tg[0])+'">'+esc(tg[1])+'</span>':'')+'</div>'+
    '<div class="t" title="'+esc(x.t)+'">'+esc(x.t)+'</div>'+(x.d?'<div class="d" title="'+esc(x.d)+'">'+esc(x.d)+'</div>':'')+'</div>'+
    '<div class="acts">'+(pr?'<button type="button" class="btn primary" data-act="'+esc(pr[1])+'">'+esc(pr[0])+'</button>':'')+
    rest.map(function(a){ return '<button type="button" class="btn ag-sec" data-act="'+esc(a[1])+'">'+esc(a[0])+'</button>'; }).join("")+snoozeBtn(x)+'</div></li>'; }
/* kompakte Zeile für „Alles, was ansteht“ */
function feedItemHtml(x){ var tg=x.tag||["grey",""];
  return '<li class="item"><span class="sev '+esc(x.sev||"")+'"></span><span class="ico">'+F.svg(x.icon)+'</span><div style="min-width:0"><div class="t">'+(tg[1]?'<span class="tag '+esc(tg[0])+'">'+esc(tg[1])+'</span>':'')+esc(x.t)+'</div><div class="d">'+esc(x.d||"")+'</div></div>'+
    '<div class="acts">'+(x.acts||[]).map(function(a){ return '<button type="button" class="btn '+esc(a[2]||"")+'" data-act="'+esc(a[1])+'">'+esc(a[0])+'</button>'; }).join("")+snoozeBtn(x)+'</div></li>'; }
function forCard(f){
  var cards=f.filter(function(x){ return String(x.id).indexOf("mail:")!==0; }).slice(0,3), inC={}; cards.forEach(function(x){ inC[x.id]=1; });
  var rest=f.filter(function(x){ return !inC[x.id]; }), open=!!F.UI.feedAll;
  var body=!f.length?'<p class="ag-empty">'+F.svg("checkCircle")+'<span>Nichts offen. Genieß den Tag.</span></p>':
    cards.length?'<ul class="feed ag-fcs">'+cards.map(cardHtml).join("")+'</ul>':'<p class="ag-none">Sonst nichts offen – nur ungelesene Mails, siehe Posteingang.</p>';
  return '<section class="panel agp ag-for">'+hdr("Für dich, jetzt",f.length?'<span class="ag-meta">'+cards.length+' von '+f.length+'</span>':'')+body+
    (rest.length?(open?'<ul class="feed ag-list">'+rest.map(feedItemHtml).join("")+'</ul>':'')+
      '<button type="button" class="ag-tog'+(open?" on":"")+'" data-act="togglefeed" aria-expanded="'+open+'">'+(open?"Weniger anzeigen":"Alles, was ansteht ("+f.length+")")+F.svg("chevD")+'</button>':'')+'</section>'; }

/* ---------- Termine: heute (jetzt hervorgehoben, nächster mit „in 25 Min.“), danach die nächsten Tage ---------- */
function bzEvents(){ var D=F.D;
  return ((D.platforms&&D.platforms.blitzdings&&D.platforms.blitzdings.upcoming)||[]).map(function(b){ var d=String(b.eventDate||"").slice(0,10), e=String(b.eventEndDate||"").slice(0,10), pk=b.package&&typeof b.package==="object"?b.package.name:b.package;
    return {id:"bz_"+b.id,bid:b.id,bz:true,cust:b.customerName||"",title:"Fotobox: "+(b.customerName||"Buchung")+(pk?" · "+pk:""),date:d,end:/^\d{4}-\d{2}-\d{2}$/.test(e)&&e>d?e:"",
      time:String(b.eventDate||"").slice(11,16).replace(/^00:00$/,""),endTime:String(b.eventEndDate||"").slice(11,16).replace(/^00:00$/,""),location:b.location||"",cal:"Blitzdings"}; })
    .filter(function(b){ return /^\d{4}-\d{2}-\d{2}$/.test(b.date); }); }
function agendaData(){
  var D=F.D, today=D.today, evs=(D.events||[]).filter(function(e){ return e&&e.date; });
  var lim=new Date(today+"T12:00:00"); lim.setDate(lim.getDate()+14); lim=F.ymd(lim);
  /* Fotobox-Buchungen, die schon (über „In iCloud eintragen“) im Kalender stehen, nicht doppelt zeigen; mehrtägige auch an den Folgetagen */
  var bz=bzEvents().filter(function(b){ return !evs.some(function(e){ return e.date===b.date&&b.cust&&String(e.title||"").indexOf("Fotobox: "+b.cust)===0; }); })
    .map(function(b){ return b.date<today&&b.end>=today?Object.assign({},b,{date:today,time:"",endTime:""}):b; });
  var all=evs.concat(bz).filter(function(e){ return e.date>=today&&e.date<=lim; }).sort(function(a,b){ return (a.date+(a.time||"")).localeCompare(b.date+(b.time||"")); });
  var tdy=all.filter(function(e){ return e.date===today; }), later=all.filter(function(e){ return e.date>today; });
  return {today:tdy,later:later.slice(0,Math.max(2,6-tdy.length))}; }
function tm(t){ var m=String(t||"").match(/^(\d{1,2}):(\d{2})/); return m?p2(m[1])+":"+m[2]:""; }
function evTimes(e){ var s0=tm(e.time); if(!s0) return null; var s=new Date(e.date+"T"+s0+":00").getTime(); if(isNaN(s)) return null;
  var e0=tm(e.endTime), en=e0?new Date(e.date+"T"+e0+":00").getTime():NaN; if(isNaN(en)||en<=s) en=s+3600e3; return [s,en]; }
function evRow(e,isToday){ var t=isToday?evTimes(e):null, meta=[e.location||"",e.cal||""].filter(Boolean).join(" · "), tt=tm(e.time);
  var act=e.bz?' data-act="'+(e.bid!=null&&F.actions.bzopen?"bzopen:"+esc(e.bid):e.bid!=null?"pltab:blitz~"+esc(e.bid):"pltab:blitz")+'"':(e.id?' data-act="event:'+esc(e.id)+'"':' data-go="kal"');
  return '<button type="button" class="ag-ev"'+act+(t?' data-s="'+t[0]+'" data-e="'+t[1]+'"':'')+' title="'+esc(e.title+(tt?" · "+tt+(tm(e.endTime)?"–"+tm(e.endTime):""):" · ganztags")+(meta?" · "+meta:""))+'">'+
    '<span class="ag-ev-t'+(tt?"":" ad")+'">'+esc(tt||"ganztags")+'</span><span class="ag-ev-b"><b>'+esc(e.title||"Termin")+'</b><small><span class="ag-rel"></span><span class="ag-m">'+esc(meta)+'</span></small></span></button>'; }
function agendaCard(){ var A=agendaData(), today=F.D.today, out="", last="";
  out+=A.today.length?A.today.map(function(e){ return evRow(e,true); }).join(""):'<p class="ag-none">Heute keine Termine.</p>';
  A.later.forEach(function(e){ if(e.date!==last){ last=e.date; out+='<div class="ag-dl">'+esc(dayShort(e.date))+'</div>'; } out+=evRow(e,false); });
  return '<section class="panel agp ag-cal">'+hdr("Heute",'<span class="ag-meta">'+A.today.length+'</span><button type="button" class="ag-ib" data-act="newevent:'+esc(today)+'" title="Neuer Termin heute" aria-label="Neuer Termin heute">'+F.svg("plus")+'</button>'+lnk("Kalender",'data-go="kal"'))+
    '<div class="ag-evs">'+out+'</div></section>'; }

/* ---------- Geld: Umsatz dieses Monats im Ring gegen den Schnitt der letzten 3 vollen Monate (sonst Vormonat) ---------- */
function monthsOfYear(sev,y){ var m=[0,0,0,0,0,0,0,0,0,0,0,0];
  (sev.invoices||[]).forEach(function(i){ if((i.status===200||i.status===750||i.status===1000)&&String(i.date||"").slice(0,4)===String(y)){ var k=parseInt(String(i.date).slice(5,7),10)-1; if(k>=0&&k<12) m[k]+=+i.gross||0; } }); return m; }
function moneyData(){ var D=F.D, sev=D.sev, now=new Date(), cy=now.getFullYear(), cm=now.getMonth();
  if(String(D.year)!==String(cy)) return {other:true};
  var bm=sev.byMonth||[], py=null;
  var val=function(i){ if(i>=0) return +bm[i]||0; if(!py) py=monthsOfYear(sev,cy-1); return py[12+i]||0; };   // Jänner–März: Vormonate aus dem Vorjahr
  var mn=function(i){ return new Date(cy,i,1).toLocaleDateString("de-AT",{month:"short"}).replace(/\.$/,""); };
  var cur=val(cm), l3=[val(cm-3),val(cm-2),val(cm-1)], avg=(l3[0]+l3[1]+l3[2])/3, ref=null;
  if(avg>0) ref={v:avg,lbl:"vom Schnitt",sub:"Ø "+mn(cm-3)+"–"+mn(cm-1)};
  else if(l3[2]>0) ref={v:l3[2],lbl:"vom Vormonat",sub:new Date(cy,cm-1,1).toLocaleDateString("de-AT",{month:"long"})};
  return {cur:cur,ref:ref,month:now.toLocaleDateString("de-AT",{month:"long"}),pct:ref?Math.round(cur/ref.v*100):null}; }
function moneyCard(){ var D=F.D, sev=D.sev, head=hdr("Geld",lnk("Finanzen",'data-go="geld"'));
  if(!sev) return '<section class="panel agp ag-money">'+head+'<p class="ag-none">Die Buchhaltung ist gerade nicht erreichbar – die Zahlen kommen mit dem nächsten Laden.</p></section>';
  var m=moneyData(), ring="", main;
  if(m.other){ main='<span class="ag-lbl">Umsatz '+esc(D.year)+'</span><b class="ag-big num money">'+eur0(sev.revenueYear)+'</b><span class="ag-sub">Jahr '+esc(D.year)+' gewählt</span>'; }
  else { var p=m.pct, fill=p==null?0:Math.min(100,Math.max(0,p)), C=2*Math.PI*50;
    ring='<span class="ag-ring'+(p!=null&&p>=100?" full":"")+'" role="img" aria-label="'+esc(p==null?"Kein Vergleichswert":p+" % "+m.ref.lbl)+'"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="50"/>'+
      (fill>0?'<circle class="val" cx="60" cy="60" r="50" stroke-dasharray="'+(C*fill/100).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 60 60)"/>':'')+'</svg>'+
      '<span class="ag-ring-c"><b>'+(p==null?"—":p+" %")+'</b><small>'+esc(p==null?"kein Vergleich":m.ref.lbl)+'</small></span></span>';
    main='<span class="ag-lbl">Umsatz '+esc(m.month)+'</span><b class="ag-big num money">'+eur0(m.cur)+'</b>'+(m.ref?'<span class="ag-sub">'+esc(m.ref.sub)+' <span class="money">'+eur0(m.ref.v)+'</span></span>':'<span class="ag-sub">laut Rechnungen</span>'); }
  var mr=function(cls,act,k,n,v,money,tip){ return '<button type="button" class="ag-mr'+(cls?" "+cls:"")+'" data-act="'+act+'" title="'+esc(tip)+'"><span>'+esc(k)+(n?' · '+n:'')+'</span><b class="num'+(money?" money":"")+'">'+esc(v)+'</b></button>'; };
  var rows=mr("","sdtab:rechnungen|open","Offen",sev.openCount,eur0(sev.openSum),true,sev.openCount+(sev.openCount===1?" offene Rechnung":" offene Rechnungen"))+
    (sev.overdueCount?mr("bad","sdtab:rechnungen|overdue","Überfällig",sev.overdueCount,eur0(sev.overdueSum),true,sev.overdueCount+(sev.overdueCount===1?" überfällige Rechnung":" überfällige Rechnungen")):'')+
    (sev.drafts?mr("","sdtab:rechnungen|draft","Entwürfe",0,String(sev.drafts),false,"Rechnungsentwürfe festschreiben"):'');
  return '<section class="panel agp ag-money">'+head+'<button type="button" class="ag-mtop" data-go="geld">'+ring+'<span class="ag-mv">'+main+'</span></button><div class="ag-mrows">'+rows+'</div></section>'; }

/* ---------- Druck live: laufende Druckaufträge (Daten aus zprint.js über F.prLive) ---------- */
var PR_RANK={pending_payment:0,payment_failed:0,paid:1,invoice_requested:1,ordered:2,in_production:3,shipped:4,delivered:5};
var PR_LIVE={ordered:1,in_production:1,shipped:1,problem:1};
var PR_STEPS=["Bestellt","Bei Print.com","In Produktion","Versendet","Zugestellt"];
function druckCard(){ var L=null; try{ L=F.prLive?F.prLive():null; }catch(e){ L=null; } if(!L) return "";
  var act=(L.orders||[]).filter(function(o){ return o&&PR_LIVE[o.status]; }).sort(function(a,b){ return String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")); }), rv=+L.review||0;
  if(!act.length&&!rv) return "";
  var rows=act.slice(0,2).map(function(o){ var pr=o.progress||{}, bad=o.status==="problem", on=Math.min(5,bad?(o.pcOrder?2:1):(PR_RANK[o.status]||0));
    var dl=pr.delivery?new Date(pr.delivery+"T12:00:00"):null, dTxt=dl&&!isNaN(dl)?dl.toLocaleDateString("de-AT",{weekday:"short",day:"numeric",month:"numeric"}):"";
    var line=bad?'<span class="bad-t">Problem bei Print.com</span>':esc((o.statusText||PR_STEPS[Math.max(0,on-1)])+(dTxt?" · "+(o.status==="shipped"?"Zustellung":"Lieferung")+" voraussichtlich "+dTxt:""));
    var bars=""; for(var i=0;i<5;i++) bars+='<i class="'+(i<on?(bad&&i===on-1?"bad":"on"):"")+(i===on-1&&!bad?" cur":"")+'"></i>';
    var name=[o.customer,o.product].filter(Boolean).join(" · ")||o.nr||"Druckauftrag";
    return '<button type="button" class="ag-pr" data-act="prord:'+esc(o.id)+'" title="'+esc(name+(o.nr?" · "+o.nr:""))+'"><b>'+esc(name)+'</b><span class="ag-stp" role="img" aria-label="'+esc("Schritt "+on+" von 5: "+(PR_STEPS[Math.max(0,on-1)]||""))+'">'+bars+'</span><small>'+(o.nr?esc(o.nr)+' · ':'')+line+'</small></button>'; }).join("");
  return '<section class="panel agp ag-druck">'+hdr("Druck",(act.length?'<span class="ag-meta ag-live"><i></i>live</span>':'')+(rv?'<button type="button" class="ag-pill" data-go="print">'+rv+' zur Prüfung</button>':'')+(act.length>2?lnk("Alle "+act.length,'data-go="print"'):''))+
    (rows?'<div class="ag-prs">'+rows+'</div>':'<p class="ag-none">Gerade läuft kein Druckauftrag. <button type="button" class="link" data-go="print">Zur Prüfung</button></p>')+'</section>'; }

/* ---------- Meine Aufgaben ---------- */
function tasksCard(){ var T=openTasks(), t0=F.D.today, over=T.filter(function(x){ return x.due&&x.due<t0; }).length;
  return '<section class="panel agp ag-tasks">'+hdr("Meine Aufgaben",'<span class="ag-meta'+(over?" bad-t":"")+'">'+(over?over+" überfällig":T.length+" offen")+'</span>'+lnk("Alle",'data-go="auftraege"'))+F.taskList(isMob()?6:5)+F.taskAdd()+'</section>'; }

/* ---------- Posteingang: die 3 neuesten ungelesenen Mails (sonst die 3 neuesten) ---------- */
function mailWhen(d){ return F.M&&F.M.fmtMailDate?F.M.fmtMailDate(d):F.ago(d); }
function mailRow(m){ var nm=m.fromName||m.from||"—", sub=m.subject||"(kein Betreff)", pv=String(m.preview||"").replace(/\s+/g," ").trim();
  return '<button type="button" class="ag-row'+(m.read?"":" un")+'" data-act="mail:'+esc(m.id)+'" title="'+esc(nm+" – "+sub)+'"><span class="ag-av '+avc(nm)+'" aria-hidden="true">'+esc(initials(nm))+'</span>'+
    '<span class="ag-rb"><b>'+esc(nm)+'</b><small>'+esc(sub)+(pv?' – '+esc(pv):'')+'</small></span><span class="ag-rt">'+esc(mailWhen(m.date))+'</span></button>'; }
function inboxCard(){ var M=(F.D.mail&&F.D.mail.messages)||[], un=F.unreadMails().filter(function(m){ return !m.deleted; }).sort(byDateDesc), list=un.slice(0,3);
  if(!list.length) list=M.filter(function(m){ return F.isInbox(m)&&!m.deleted; }).sort(byDateDesc).slice(0,3);
  var ms=F.D.mail||{}, warn=ms.error||(ms.stale?"Der Mail-Dienst liefert gerade ältere Daten.":"");
  return '<section class="panel agp ag-inbox">'+hdr("Posteingang",'<span class="ag-meta">'+(un.length?un.length+" neu":"alles gelesen")+'</span>'+lnk("Postfach",'data-go="post"'))+
    (warn?'<button type="button" class="ag-warn" data-act="'+(F.actions.conn?"conn:mail":"go:post")+'">'+F.svg("alertCircle")+'<span>'+esc(warn)+'</span></button>':'')+
    (list.length?'<div class="ag-rows">'+list.map(mailRow).join("")+'</div>':'<p class="ag-none">Keine Mails.</p>')+'</section>'; }

/* ---------- Plattformen heute ---------- */
var BRAND={kochdu:["#6645ef","#f0edff","kd"],valuero:["#1f6a49","#f4f1ea","VA"],blitz:["#c79c47","#1c1a16","BD"],kantineur:["#5980a6","#e9f0f7","KA"]};   // Markenfarben (mkt-brands.json)
function platRow(k,title,sub){ var b=BRAND[k], tip=(title+" – "+sub).replace(/<span class="money">[^<]*<\/span>/g,"…").replace(/<[^>]+>/g,"");
  return '<button type="button" class="ag-row" data-act="pltab:'+k+'" title="'+tip+'"><span class="ag-av" style="background:'+b[0]+';color:'+b[1]+'" aria-hidden="true">'+b[2]+'</span><span class="ag-rb"><b>'+title+'</b><small>'+sub+'</small></span>'+F.svg("chevR")+'</button>'; }
function platCard(){ var D=F.D, P=D.platforms||{}, today=D.today, now=new Date(), ym=today.slice(0,7), curY=String(D.year)===String(now.getFullYear()), mon=now.toLocaleDateString("de-AT",{month:"long"}), rows="";
  var ko=P.kochdu; if(ko){ var lo=(ko.lastOrders||[]).filter(function(o){ return o&&o.at&&!isNaN(new Date(o.at)); }).sort(function(a,b){ return String(b.at).localeCompare(String(a.at)); });
    var td=lo.filter(function(o){ return F.ymd(new Date(o.at))===today; }), sum=td.reduce(function(a,o){ return a+(+o.totalCents||0); },0), last=lo[0], capped=td.length>=5&&td.length===lo.length;
    rows+=platRow("kochdu",esc("kochdu · "+(td.length?(capped?"mind. ":"")+td.length+(td.length===1?" Bestellung":" Bestellungen")+" heute":"heute noch keine Bestellung")),
      td.length?'<span class="money">'+esc(eur(c2e(sum)))+'</span>'+(last?esc(" · zuletzt "+hhmm(new Date(last.at))+(last.restaurant?" · "+last.restaurant:"")):'')
        :esc(last?"zuletzt "+F.ago(last.at)+(last.restaurant?" · "+last.restaurant:""):(ko.restaurants||[]).length+" Restaurants")); }
  var va=P.valuero; if(va&&va.objects&&va.objects.length){ var bk=0, prov=0, names=[];
    va.objects.forEach(function(o){ if(curY){ var m=(o.months||[]).find(function(x){ return String(x.month||"").slice(0,7)===ym; }); if(m){ bk+=+m.bookings||0; prov+=+m.provisionCents||0; if(+m.bookings>0) names.push(o.name); } } else { bk+=+o.feeBookings||0; prov+=+o.provisionCents||0; } });
    var when=curY?"im "+mon:D.year;
    rows+=platRow("valuero",esc("VALUERO · "+(bk?bk+(bk===1?" Buchung ":" Buchungen ")+when:(curY?"im "+mon+" noch keine Buchung":"keine Buchungen "+D.year))),
      esc(names.length?names.slice(0,3).join(", ")+(names.length>3?" …":""):va.objects.length+(va.objects.length===1?" Haus":" Häuser"))+(prov?' · Provision <span class="money">'+esc(eur0(c2e(prov)))+'</span>':'')); }
  var bz=P.blitzdings; if(bz){ var up=(bz.upcoming||[]).filter(function(b){ return b&&String(b.eventDate||"").slice(0,10)>=today; }).sort(function(a,b){ return String(a.eventDate).localeCompare(String(b.eventDate)); }), bkk=bz.bookings||{};
    var hasSt=up.some(function(b){ return b.status; }), pend=hasSt?up.filter(function(b){ return b.status==="PENDING"&&b.paymentStatus!=="PAID"; }).length:0, nUp=bkk.upcomingCount!=null?+bkk.upcomingCount:up.length, nx=up[0];
    var sub=nx?"nächster Termin "+dayShort(String(nx.eventDate).slice(0,10))+(nx.customerName?" · "+nx.customerName:""):"keine anstehenden Termine";
    if(+bkk.openCount) sub+=" · "+bkk.openCount+" unbezahlt";
    rows+=platRow("blitz",esc("Blitzdings · "+(pend?pend+(pend===1?" Anfrage":" Anfragen"):nUp+(nUp===1?" Termin":" Termine")+" anstehend")),esc(sub)); }
  var ka=P.kantineur; if(ka){ var sb=ka.subscribers||{}, tr=ka.trial||{}, ac=+sb.active||0;
    rows+=platRow("kantineur",'Kantineur · <span class="money">'+esc(eur0(c2e(ka.thisMonthGrossCents)))+'</span> im '+esc(mon),
      esc(ac+(ac===1?" aktives Abo":" aktive Abos"))+(+tr.endingSoon?' · <span class="warn-t">'+esc(tr.endingSoon+(+tr.endingSoon===1?" Testzeit endet bald":" Testzeiten enden bald"))+'</span>':'')+(ka.mrrCents?' · MRR <span class="money">'+esc(eur0(c2e(ka.mrrCents)))+'</span>':'')); }
  return '<section class="panel agp ag-plat">'+hdr("Plattformen heute",lnk("Alle",'data-go="plat"'))+(rows?'<div class="ag-rows">'+rows+'</div>':'<p class="ag-none">Gerade keine Plattform-Daten.</p>')+'</section>'; }

/* ---------- Aufträge im Blick: aktive Aufträge mit Fortschritt (erledigte/alle Aufgaben) und nächster Abgabe – Druckshop läuft separat ---------- */
function projectsPanel(){
  var A=F.D.auftraege||{projects:[],tasks:[]}, t0=F.D.today, PC=F.tkPCOL||["#7b8bff"];
  var P=(A.projects||[]).filter(function(p){ return p.status==="aktiv"&&p.id!=="pdruckshop"; }).map(function(p){ var T=(A.tasks||[]).filter(function(t){ return t.projectId===p.id; }), o=T.filter(function(t){ return t.status!=="erledigt"; });
    var due=o.filter(function(t){ return t.due; }).map(function(t){ return t.due; }).sort()[0]||p.due||"";
    return {p:p,n:T.length,open:o.length,pct:T.length?Math.round((T.length-o.length)/T.length*100):0,due:due,over:o.some(function(t){ return t.due&&t.due<t0; })}; })
    .sort(function(a,b){ return (b.over-a.over)||String(a.due||"9999").localeCompare(String(b.due||"9999")); }).slice(0,5);
  var body=P.length?P.map(function(x){ var c=PC[x.p.color||0]||PC[0];
    return '<button type="button" class="ab-r" data-act="tkprojopen:'+esc(x.p.id)+'" title="'+esc(x.p.name)+'"><span class="ab-t"><i style="background:'+c+'"></i><b>'+esc(x.p.name)+'</b><span class="ab-m'+(x.over?" bad-t":"")+'">'+(x.open?x.open+" offen":"alles erledigt")+(x.over?" · überfällig":x.due?" · Abgabe "+esc(deShort?deShort(x.due):de(x.due)):"")+'</span></span><span class="ab-b"><span style="width:'+x.pct+'%;background:'+c+'"></span></span></button>'; }).join("")
    :'<p class="ag-none">Keine aktiven Aufträge. <button type="button" class="link" data-act="newproj">Auftrag anlegen</button></p>';
  return '<section class="panel agp ag-proj">'+hdr("Aufträge im Blick",lnk("Alle",'data-go="auftraege"'))+'<div class="ab">'+body+'</div></section>'; }

/* ---------- Geschätztes Monatseinkommen (Desktop offen, Handy zum Aufklappen) ---------- */
function incomeCard(mob){ var inc=F.D.income; if(!inc||!inc.lines||!inc.lines.length) return "";
  var open=!mob||!!F.UI.incOpen;
  var lines=inc.lines.map(function(l){ return '<div class="line"><span>'+esc(l.label)+'</span><span class="num money">'+eur0(l.monthly)+'</span><span class="muted">'+esc(l.basis)+(l.live&&l.key==="kochdu"?' · live':'')+'</span></div>'+(mob?'':monthsBar(l)); }).join("");
  var total='<b class="ag-big num money">'+eur0(inc.total)+'</b><span class="ag-sub">pro Monat, geschätzt</span>';
  return '<section class="panel agp ag-inc">'+hdr("Monatseinkommen",mob?'':lnk("Wie gerechnet?",'data-act="incomeinfo"'))+
    (mob?'<button type="button" class="ag-incb" data-act="hmincome" aria-expanded="'+open+'">'+total+F.svg("chevD")+'</button>':'<div class="ag-incb">'+total+'</div>')+
    (open?'<div class="income">'+lines+(mob?'<button type="button" class="ag-tog" data-act="incomeinfo">Wie gerechnet?</button>':(inc.computedAt?'<p class="muted">Prognose für VALUERO und Skikaiser vom '+F.de(inc.computedAt)+', nächste Neuberechnung am '+F.de(inc.nextAt)+'.</p>':''))+'</div>':'')+'</section>'; }
/* kleiner Monatsverlauf (z. B. kochdu-Provision der letzten Monate) */
function monthsBar(l){
  var ms=(l.months||[]).filter(function(m){ return m&&m.month; }); if(ms.length<2) return "";
  var max=Math.max.apply(null,ms.map(function(m){ return +m.eur||0; }))||1;
  return '<div class="mbars" aria-label="Verlauf '+esc(l.label)+'">'+ms.map(function(m){ var h=Math.max(2,Math.round((+m.eur||0)/max*28)); var lbl=new Date(+m.month.slice(0,4),+m.month.slice(5,7)-1,1).toLocaleDateString("de-AT",{month:"short"});
    return '<span class="mb" title="'+esc(lbl+" "+m.month.slice(0,4)+": "+F.eur(m.eur)+(m.orders!=null?" · "+m.orders+" Bestellungen":""))+'"><i style="height:'+h+'px"></i><em>'+esc(lbl)+'</em></span>'; }).join("")+'</div>';
}

/* ---------- Frag dein Cockpit: schwebende Leiste (Desktop) bzw. Karte oben (Handy) → KI-Chat ---------- */
var KEYJ=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent||"")?"⌘J":"Strg+J";
function askCard(){ return '<form class="panel ag-ask" data-form="agask" aria-label="Frag dein Cockpit"><span class="ag-ask-i" aria-hidden="true">'+F.svg("sparkle")+'</span>'+
  '<input name="q" type="text" value="'+esc(F.UI.agAsk||"")+'" data-agask data-keepfocus="agask" placeholder="Frag dein Cockpit …" aria-label="Frage an den KI-Assistenten" autocomplete="off" enterkeyhint="send">'+
  '<button type="submit" class="ag-go" aria-label="Frage senden">'+F.svg("send")+'</button></form>'; }
function ensureDock(){ if(document.getElementById("agDock")) return;
  var d=document.createElement("form"); d.id="agDock"; d.className="agdock"; d.setAttribute("data-form","agask"); d.setAttribute("aria-label","Frag dein Cockpit");
  d.innerHTML='<span class="agdock-i" aria-hidden="true">'+F.svg("sparkle")+'</span><input name="q" type="text" placeholder="Frag dein Cockpit … z. B. „Was ist diese Woche offen?“" aria-label="Frage an den KI-Assistenten" autocomplete="off" enterkeyhint="send">'+
    '<button type="button" class="agdock-k" data-act="kichat" title="KI-Assistent öffnen">'+KEYJ+'</button><button type="submit" class="ag-go" aria-label="Frage senden" title="Fragen (Enter)">'+F.svg("send")+'</button>';
  document.body.appendChild(d); }
function askKi(q){ if(F.kiAsk) F.kiAsk(q); else if(F.KI&&F.KI.chatSend&&q) F.KI.chatSend(q); else if(F.actions.kichat) F.actions.kichat(); }
F.form("agask",function(f){ var q=(f.q&&f.q.value||"").trim(); if(f.q){ f.q.value=""; if(isMob()) f.q.blur(); } F.UI.agAsk=""; askKi(q); });
F.listen("input","[data-agask]",function(el){ F.UI.agAsk=el.value; });
F.listen("keydown","#agDock input",function(el,e){ if(e.key==="Escape"){ el.value=""; el.blur(); } });

/* ---------- Ansicht ---------- */
function desktopHeute(f){
  return '<div class="ag">'+heroHtml(f)+
    '<div class="ag-r">'+safe(connNote)+safe(agendaCard)+safe(moneyCard)+safe(druckCard)+safe(tasksCard)+'</div>'+
    safe(function(){ return forCard(f); })+
    '<div class="ag-low">'+safe(inboxCard)+safe(platCard)+'</div>'+
    '<div class="ag-more">'+safe(projectsPanel)+safe(function(){ return incomeCard(false); })+'</div></div>'; }
function mobileHeute(f){
  return '<div class="agm">'+heroHtml(f)+safe(connNote)+askCard()+quickMob()+safe(agendaCard)+safe(moneyCard)+safe(druckCard)+safe(function(){ return forCard(f); })+
    safe(tasksCard)+safe(inboxCard)+safe(platCard)+safe(function(){ return incomeCard(true); })+'</div>'; }
F.view({id:"heute",label:"Heute",short:"Heute",icon:"heute",order:10,mobile:true,
  count:function(){ return F.feedItems().length; },
  render:function(){ var f=feedSorted(); return isMob()?mobileHeute(f):desktopHeute(f); },
  after:function(){ ensureDock(); tick(); }
});

/* Eigener Takt (jede Minute): Uhr, laufender Termin („Jetzt · bis …“), nächster Termin („in 25 Min.“) – nur Text/Klassen, kein Neuaufbau */
function relTxt(min){ if(min<1) return "gleich"; if(min<60) return "in "+min+" Min."; if(min>=12*60) return ""; var h=Math.floor(min/60), m=min%60; return "in "+h+" Std."+(m&&h<3?" "+m+" Min.":""); }
function tick(){
  var c=document.getElementById("agClock"); if(!c) return;
  var now=new Date(), ms=now.getTime(), t=hhmm(now), nx=false;
  if(c.textContent!==t){ c.textContent=t; c.setAttribute("datetime",t); }
  Array.prototype.forEach.call(document.querySelectorAll("#main .ag-ev[data-s]"),function(r){
    var s=+r.getAttribute("data-s"), e=+r.getAttribute("data-e"), st=ms>=e?"past":ms>=s?"now":"", rel="";
    if(st==="now") rel="Jetzt · bis "+hhmm(new Date(e));
    else if(!st&&!nx){ nx=true; rel=relTxt(Math.ceil((s-ms)/60000)); }
    r.classList.toggle("now",st==="now"); r.classList.toggle("past",st==="past"); r.classList.toggle("next",!st&&!!rel);
    var el=r.querySelector(".ag-rel"); if(el&&el.textContent!==rel) el.textContent=rel;
  });
}
var loopT=null;
function loop(){ tick(); clearTimeout(loopT); loopT=setTimeout(loop,60400-Date.now()%60000); }
loop();
document.addEventListener("visibilitychange",function(){ if(!document.hidden) loop(); });

F.action("hmincome",function(){ F.UI.incOpen=!F.UI.incOpen; F._forceRender=true; F.render(); });
F.action("togglefeed",function(){ F.UI.feedAll=!F.UI.feedAll; F.render(); });
/* Beim Drehen/Größenändern zwischen Handy- und Desktop-Darstellung wechseln */
var wasMx=window.innerWidth<=900;
window.addEventListener("resize",function(){ var m=window.innerWidth<=900; if(m!==wasMx){ wasMx=m; if(F.D&&(F.current==="heute"||F.current==="kunden")){ F._forceRender=true; F.render(); } } });

F.action("incomeinfo",function(){
  F.modal('<div class="row-between"><h2 style="font-size:19px">So wird das Monatseinkommen geschätzt</h2>'+F.btnClose()+'</div>'+
    '<ul class="plain"><li><b>Kantineur:</b> die aktuell laufenden Abos (monatlich wiederkehrend), immer tagesaktuell.</li>'+
    '<li><b>kochdu:</b> Provision (bar und online) der letzten 30 Tage direkt aus kochdu, bei jedem Aufruf live; dazu die Veränderung zu den 30 Tagen davor. Falls kochdu diese Werte nicht liefert: Zuwachs der letzten bis zu 60 Tage bzw. Schnitt seit dem ersten Monat mit Provision.</li>'+
    '<li><b>VALUERO:</b> Schnitt der letzten 3 vollen Monate, angepasst mit dem Saisonverlauf aus dem Vorjahr (Winter und Sommer im Montafon).</li>'+
    '<li><b>Skikaiser:</b> Schnitt der letzten 3 Monate nach Store-Gebühr, sobald die App angebunden ist.</li>'+
    '<li><b>Websites:</b> fixe Hosting- und Domain-Verträge, Jahresbetrag ÷ 12.</li></ul>'+
    '<p class="muted">VALUERO und Skikaiser (und kochdu ohne Live-Werte) werden nur alle 14 Tage neu berechnet, damit die Zahl ruhig bleibt.</p><div class="foot"><span></span><button class="btn" data-act="incomerecalc">Jetzt neu berechnen</button></div>',"narrow");
});
F.action("incomerecalc",function(){ F.closeModal(); F.api("/admin/api/cockpit?year="+F.year+"&forecast=1").then(function(d){ if(d&&d.income){ F.D=d; F.render(); F.toast("Prognose neu berechnet"); } }); });

/* ---------- Handy-Bausteine (≤ 900 px), auch von „Kunden“ genutzt ---------- */
var MXI={
  mail:'<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="m4 7.5 8 5.6 8-5.6"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15" rx="2.4"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13v4M10 15h4"/>',
  inv:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  chev:'<path d="m9 6 6 6-6 6"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  offer:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  todo:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  back:'<path d="m15 6-6 6 6 6"/>'
};
F.mxIc=function(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(MXI[k]||"")+'</svg>'; };

/* ---------- Styles ---------- */
F.css(
/* gemeinsam genutzte Bausteine (Aufgaben-Zeilen, Aufträge, Einkommen, Listen in Dialogen) */
".glow-t{color:var(--glow)}"+
".ab{display:grid}.ab-r{display:grid;gap:9px;border:0;border-top:1px solid var(--line);background:none;text-align:left;padding:13px 18px 14px;width:100%;color:var(--ink);font:inherit}.ab-r:first-child{border-top:0}.ab-r:hover{background:var(--hover,var(--sunk))}"+
".ab-t{display:flex;align-items:center;gap:10px;min-width:0}.ab-t i{width:10px;height:10px;border-radius:3px;flex:none}.ab-t b{font-weight:600;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ab-m{margin-left:auto;font-size:12.5px;color:var(--ink-3);white-space:nowrap;flex:none}"+
".ab-b{height:5px;border-radius:5px;background:var(--sunk);overflow:hidden}.ab-b span{display:block;height:100%;border-radius:5px}"+
".tdrow{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;align-items:center;padding:8px 16px;border-top:1px solid var(--line)}"+
".tdrow input{width:16px;height:16px;margin:0;accent-color:var(--glow)}"+
".tdrow .todo-t{border:0;background:none;padding:0;text-align:left;font:inherit;font-size:13.5px;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
".tdrow .due{font-size:12px;color:var(--ink-3)}.tdrow .due.late{color:var(--bad)}"+
"ul.plain{margin:0;padding-left:18px;display:grid;gap:8px} .income .v{font-size:28px} .mbars{display:flex;gap:6px;align-items:flex-end;margin:-2px 0 6px;min-height:44px}.mbars .mb{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10.5px;color:var(--ink-3)}.mbars .mb i{display:block;width:16px;border-radius:3px 3px 0 0;background:var(--glow-soft)}.mbars .mb em{font-style:normal}"+

/* Raster Desktop: links Uhr, Für dich, Post/Plattformen, Aufträge/Einkommen – rechts Termine, Geld, Druck, Aufgaben */
".ag{display:grid;gap:20px;grid-template-columns:minmax(0,1fr) clamp(300px,30%,384px);grid-template-rows:auto auto auto auto 1fr;grid-template-areas:'hero r' 'for r' 'low r' 'more r' '. r';align-items:start}"+
".ag>.ag-hero{grid-area:hero}.ag>.ag-for{grid-area:for}.ag>.ag-low{grid-area:low}.ag>.ag-more{grid-area:more}"+
".ag>.ag-r{grid-area:r;display:grid;gap:20px;align-content:start;min-width:0}"+
".ag-low,.ag-more{display:flex;flex-wrap:wrap;gap:20px;align-items:stretch;min-width:0}.ag-low>*,.ag-more>*{flex:1 1 300px;min-width:0}.ag-low>.ag-inbox,.ag-more>.ag-proj{flex-grow:1.3}"+
".ag-more:empty,.ag-low:empty{display:none}"+
"@media (max-width:1039px){.ag{grid-template-columns:minmax(0,1fr);grid-template-rows:none;grid-template-areas:'hero' 'r' 'for' 'low' 'more'}.ag>.ag-r{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start}.ag>.ag-r>.ag-conn{grid-column:1/-1}}"+

/* Glas-Karten (nur die oberste Ebene ist .panel; Inneres über --sunk/--hover) */
".agp{padding:18px 20px 16px;min-width:0}"+
".ag-h{display:flex;align-items:center;gap:8px;min-height:26px;margin:0 0 10px}"+
".ag-h h2{flex:1;min-width:0;margin:0;font:700 12px/1.3 var(--f-body);letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".ag-meta{font:700 11.5px/1.3 var(--f-body);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);white-space:nowrap;font-variant-numeric:tabular-nums}"+
".ag-lk{display:inline-flex;align-items:center;gap:1px;font-size:13px;white-space:nowrap;padding:4px 0 4px 6px}.ag-lk svg{width:15px;height:15px}"+
".ag-ib{width:28px;height:28px;flex:none;border-radius:50%;border:0;background:var(--sunk);color:var(--ink-2);display:grid;place-items:center;padding:0}.ag-ib:hover{background:var(--hover,var(--sunk));color:var(--ink)}.ag-ib svg{width:15px;height:15px}"+
".ag-none{margin:2px 0 4px;color:var(--ink-3);font-size:13.5px;text-wrap:pretty}"+
".ag-empty{display:flex;align-items:center;gap:10px;margin:4px 0;color:var(--ink-2);font-size:14.5px}.ag-empty svg{width:22px;height:22px;color:var(--ok);flex:none}"+
".ag-tog{display:flex;align-items:center;justify-content:center;gap:6px;margin:14px auto 0;padding:8px 16px;border:1px solid var(--line);border-radius:99px;background:var(--sunk);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer}"+
".ag-tog:hover{background:var(--hover,var(--sunk));border-color:var(--line-2)}.ag-tog svg{width:16px;height:16px;color:var(--ink-3)}.ag-tog.on svg{transform:rotate(180deg)}"+
".ag-pill{border:0;border-radius:99px;padding:3px 10px;background:var(--warn-soft);color:var(--warn);font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer}"+

/* Kopf: Uhr, Datum, Wetter */
".ag-hero{min-width:0;padding:4px 2px 6px}"+
".ag-clock{display:block;min-height:.94em;margin-left:-.04em;font:200 clamp(78px,8vw,116px)/.94 -apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI Variable Display','Segoe UI','Helvetica Neue',sans-serif;letter-spacing:-.045em;font-variant-numeric:tabular-nums;color:var(--ink)}"+
".ag-date{margin:12px 0 0;font:600 20px/1.3 var(--f-display);letter-spacing:-.01em;color:var(--ink)}"+
".ag-wx{display:flex;align-items:center;gap:7px;margin:5px 0 0;font-size:15px;color:var(--ink-2);min-width:0}.ag-wx svg{width:18px;height:18px;flex:none}.ag-wx span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
".ag-greet{margin:12px 0 0;font-size:14px;color:var(--ink-2);text-wrap:pretty}"+
".ag-chip{border:0;background:none;padding:0;font:inherit;font-weight:700;cursor:pointer}.ag-chip.glow{color:var(--glow)}.ag-chip.bad{color:var(--bad)}.ag-chip:hover{text-decoration:underline}"+
".ag-qa{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}"+
".ag-q{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px 0 11px;border-radius:99px;border:1px solid var(--line);background:var(--sunk);color:var(--ink);font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}"+
".ag-q:hover{background:var(--hover,var(--sunk));border-color:var(--line-2)}.ag-q svg{width:16px;height:16px;flex:none}"+
":root[data-theme='glas'] .ag-hero{text-shadow:0 1px 18px rgba(4,10,20,.35)}:root[data-theme='glas'] .ag-qa{text-shadow:none}"+
".ag-conn{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;border-radius:var(--r-sm,12px);border:1px solid color-mix(in srgb,var(--bad) 35%,transparent);background:var(--bad-soft);color:var(--ink);font:inherit;cursor:pointer;min-width:0}"+
".ag-conn>svg{width:20px;height:20px;color:var(--bad);flex:none}.ag-conn>svg:last-child{width:16px;height:16px;color:var(--ink-3)}.ag-conn span{flex:1;min-width:0;display:grid}.ag-conn b{font-size:14px;font-weight:700}.ag-conn small{font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+

/* Termine */
".ag-evs{display:grid;margin:0 -10px}"+
".ag-ev{display:grid;grid-template-columns:54px minmax(0,1fr);gap:12px;align-items:start;width:100%;min-width:0;text-align:left;border:0;background:none;color:var(--ink);font:inherit;padding:10px;border-radius:14px;cursor:pointer;box-shadow:inset 0 1px 0 var(--line)}"+
".ag-evs>.ag-ev:first-child,.ag-dl+.ag-ev,.ag-ev.now,.ag-ev.now+.ag-ev{box-shadow:none}"+
".ag-ev:hover{background:var(--hover,var(--sunk))}"+
".ag-ev-t{font-weight:800;font-size:14px;line-height:1.35;font-variant-numeric:tabular-nums;white-space:nowrap}.ag-ev-t.ad{font-size:11.5px;font-weight:700;color:var(--ink-2);padding-top:2px}"+
".ag-ev-b{display:grid;min-width:0}.ag-ev b{font-weight:700;font-size:14.5px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".ag-ev small{font-size:12.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-ev small:has(.ag-rel:empty):has(.ag-m:empty){display:none}"+
".ag-rel:not(:empty)+.ag-m:not(:empty):before{content:' · '}.ag-ev.next .ag-rel{color:var(--glow);font-weight:600}"+
".ag-ev.now{background:var(--glow-soft)}.ag-ev.now .ag-ev-t{color:var(--glow)}.ag-ev.now .ag-rel{color:var(--glow-ink);font-weight:600}"+
".ag-ev.past{opacity:.55}"+
".ag-dl{padding:12px 10px 2px;font-size:12px;font-weight:700;color:var(--ink-3)}"+
".ag-cal .ag-none{padding:0 10px;margin:0 0 4px}"+

/* Geld */
".ag-mtop{display:flex;align-items:center;gap:18px;width:100%;min-width:0;border:0;background:none;padding:2px 0;text-align:left;color:var(--ink);font:inherit;cursor:pointer;border-radius:14px}"+
".ag-ring{position:relative;width:108px;height:108px;flex:none;display:grid;place-items:center}.ag-ring svg{position:absolute;inset:0;width:100%;height:100%}"+
".ag-ring circle{fill:none;stroke-width:11}.ag-ring .trk{stroke:var(--sunk)}.ag-ring .val{stroke:var(--glow);stroke-linecap:round}.ag-ring.full .val{stroke:var(--ok)}"+
".ag-ring-c{position:relative;display:grid;justify-items:center;text-align:center;line-height:1}.ag-ring-c b{font:800 21px/1 var(--f-body);letter-spacing:-.02em;font-variant-numeric:tabular-nums}.ag-ring-c small{margin-top:5px;font-size:10.5px;font-weight:600;color:var(--ink-2);max-width:74px;line-height:1.2}"+
".ag-mv{display:grid;gap:2px;min-width:0}.ag-lbl{font-size:13px;color:var(--ink-2)}"+
".ag-big{font:800 26px/1.15 var(--f-body);letter-spacing:-.02em;white-space:nowrap;font-variant-numeric:tabular-nums}.ag-sub{font-size:12.5px;color:var(--ink-3);text-wrap:pretty}"+
".ag-mrows{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}"+
".ag-mr{flex:1 1 90px;display:grid;gap:1px;min-width:0;text-align:left;border:1px solid var(--line);background:var(--sunk);border-radius:14px;padding:8px 11px;color:var(--ink);font:inherit;cursor:pointer}"+
".ag-mr:hover{background:var(--hover,var(--sunk));border-color:var(--line-2)}.ag-mr span{font-size:12px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-mr b{font-size:15px;font-weight:700;white-space:nowrap}"+
".ag-mr.bad{border-color:color-mix(in srgb,var(--bad) 40%,transparent);background:var(--bad-soft)}.ag-mr.bad span,.ag-mr.bad b{color:var(--bad)}"+

/* Druck */
".ag-live{display:inline-flex;align-items:center;gap:6px;color:var(--ok)}.ag-live i{width:7px;height:7px;border-radius:50%;background:var(--ok)}"+
".ag-prs{display:grid;margin:0 -10px}"+
".ag-pr{display:grid;width:100%;min-width:0;text-align:left;border:0;background:none;color:var(--ink);font:inherit;padding:10px;border-radius:14px;cursor:pointer}.ag-pr+.ag-pr{box-shadow:inset 0 1px 0 var(--line)}.ag-pr:hover{background:var(--hover,var(--sunk))}"+
".ag-pr b{font-size:16px;font-weight:700;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".ag-stp{display:flex;gap:6px;margin:12px 0 8px}.ag-stp i{flex:1;height:7px;border-radius:7px;background:var(--sunk)}.ag-stp i.on{background:var(--glow)}.ag-stp i.bad{background:var(--bad)}"+
".ag-pr small{font-size:12.5px;color:var(--ink-2);text-wrap:pretty}"+

/* Zeilen: Posteingang, Plattformen */
".ag-rows{display:grid;margin:0 -10px}"+
".ag-row{display:flex;align-items:center;gap:12px;width:100%;min-width:0;text-align:left;border:0;background:none;color:var(--ink);font:inherit;padding:8px 10px;border-radius:14px;cursor:pointer}"+
".ag-row:hover{background:var(--hover,var(--sunk))}.ag-row>svg{width:16px;height:16px;color:var(--ink-3);flex:none}"+
".ag-av{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;font:800 13px/1 var(--f-body);letter-spacing:.02em;flex:none}"+
".ag-av.c0{background:color-mix(in srgb,var(--glow) 24%,transparent);color:var(--glow-ink)}.ag-av.c1{background:color-mix(in srgb,var(--ok) 24%,transparent);color:var(--ok)}.ag-av.c2{background:color-mix(in srgb,var(--warn) 24%,transparent);color:var(--warn)}"+
".ag-av.c3{background:color-mix(in srgb,var(--bad) 22%,transparent);color:var(--bad)}.ag-av.c4{background:color-mix(in srgb,var(--pink) 24%,transparent);color:var(--pink)}.ag-av.c5{background:var(--sunk);color:var(--ink)}"+
".ag-rb{flex:1;min-width:0;display:grid;gap:1px}.ag-rb b{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ag-row.un .ag-rb b{font-weight:800}"+
".ag-rb small{font-size:13px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
".ag-rt{flex:none;align-self:flex-start;padding-top:2px;font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums;white-space:nowrap}"+
".ag-row.un .ag-rt:before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--glow);margin-right:6px;vertical-align:1px}"+
".ag-warn{display:flex;align-items:center;gap:8px;width:100%;margin:0 0 8px;padding:8px 10px;border:0;border-radius:12px;background:var(--warn-soft);color:var(--ink);font:inherit;font-size:13px;text-align:left;cursor:pointer}.ag-warn svg{width:16px;height:16px;color:var(--warn);flex:none}"+

/* Aufgaben */
".ag-tasks .tdrow{padding:8px 0}.ag-tasks .ag-h+.tdrow{border-top:0}.ag-tasks .empty{padding:6px 0 10px;text-align:left;font-size:13.5px}"+
".ag-tasks .todo-add{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:'t t' 'd b';gap:8px;padding:12px 0 2px;border-top:1px solid var(--line)}"+
".ag-tasks .todo-add input[name=text]{grid-area:t}.ag-tasks .todo-add input[name=due]{grid-area:d;max-width:none!important}.ag-tasks .todo-add .btn{grid-area:b;min-width:44px;justify-content:center;font-size:18px}"+

/* Aufträge + Einkommen in Glas-Karten */
".agp .ab{margin:0 -10px}.agp .ab-r{padding:10px;border-top:0;border-radius:14px}.agp .ab-r+.ab-r{box-shadow:inset 0 1px 0 var(--line)}.agp .ab-r:hover{box-shadow:none}"+
".ag-incb{display:flex;align-items:baseline;gap:8px;width:100%;border:0;background:none;padding:0;color:var(--ink);font:inherit;text-align:left}button.ag-incb{cursor:pointer}.ag-incb svg{width:18px;height:18px;margin-left:auto;align-self:center;color:var(--ink-3)}.ag-incb[aria-expanded=true] svg{transform:rotate(180deg)}"+
".ag-inc .income{margin-top:12px}.ag-inc .income .muted{text-wrap:pretty}"+

/* „Für dich, jetzt“ – Karten (Desktop) und Liste „Alles, was ansteht“ */
"@media (min-width:901px){"+
  ".view-heute .ag-fcs{display:flex;flex-wrap:wrap;gap:14px}"+
  ".view-heute .ag-fcs>.item{flex:1 1 180px;min-width:0;display:flex;flex-direction:column;align-items:stretch;gap:0;position:relative;padding:15px 16px 14px;border:1px solid var(--line);border-radius:18px;background:var(--sunk)}"+
  ".view-heute .ag-fcs .sev{display:none}"+
  ".ag-fcs .ag-k{display:flex;align-items:center;gap:7px;min-width:0;padding-right:28px;margin-bottom:8px}"+
  ".ag-fcs .ag-k .ico{width:24px;height:24px;border-radius:8px;flex:none}.ag-fcs .ag-k .ico svg{width:14px;height:14px}"+
  ".ag-fcs .sev.bad~.ag-fb .ico{color:var(--bad)}.ag-fcs .sev.warn~.ag-fb .ico{color:var(--warn)}.ag-fcs .sev.glow~.ag-fb .ico,.ag-fcs .sev.info~.ag-fb .ico{color:var(--glow)}.ag-fcs .sev.ok~.ag-fb .ico{color:var(--ok)}"+
  ".ag-fcs .ag-k .tag{min-width:0;overflow:hidden;text-overflow:ellipsis}"+
  ".ag-fcs .t{font-size:16px;font-weight:700;line-height:1.3;letter-spacing:-.01em;color:var(--ink);text-wrap:balance;hyphens:auto;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}"+
  ".ag-fcs .d{margin-top:4px;font-size:13px;line-height:1.4;color:var(--ink-2);text-wrap:pretty;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}"+
  ".view-heute .ag-fcs .acts{margin-top:auto;padding-top:14px;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:6px 12px}"+
  ".ag-fcs .acts .btn.primary{border-radius:99px;padding:7px 16px;min-height:34px;font-weight:700}"+
  ".ag-fcs .acts .ag-sec{border:0;background:none;padding:4px 0;min-height:0;color:var(--ink-2);font-weight:600}.ag-fcs .acts .ag-sec:hover{color:var(--ink);background:none;text-decoration:underline}"+
  ".ag-fcs .acts [data-snooze]{position:absolute;top:10px;right:10px;width:28px;height:28px;min-height:0;padding:0;border:0;border-radius:50%;background:none;color:var(--ink-3);display:grid;place-items:center}"+
  ".ag-fcs .acts [data-snooze]:hover{background:var(--hover,var(--sunk));color:var(--ink)}.ag-fcs .acts [data-snooze] svg{width:14px;height:14px}"+
  ".view-heute .ag-list{margin:14px -20px 0;border-top:1px solid var(--line)}"+
  ".view-heute .ag-list .item{grid-template-columns:8px minmax(0,1fr) auto!important;gap:12px;padding:10px 20px!important;row-gap:0}"+
  ".view-heute .ag-list .item .ico{display:none}"+
  ".view-heute .ag-list .item .sev{width:8px;height:8px;border-radius:50%;align-self:start;margin-top:7px}"+
  ".view-heute .ag-list .item .t{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".view-heute .ag-list .item .t .tag{font-size:10.5px;padding:1px 6px;margin-right:6px;background:var(--sunk);color:var(--ink-2)}"+
  ".view-heute .ag-list .item .d{font-size:12.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".view-heute .ag-list .item .acts{grid-column:auto!important;flex-wrap:nowrap;gap:4px;align-self:center}"+
  ".view-heute .ag-list .item .acts .btn{min-height:28px;padding:3px 10px;font-size:12.5px;display:none}"+
  ".view-heute .ag-list .item .acts .btn.primary{display:inline-flex;background:none;color:var(--glow);border-color:transparent}"+
  ".view-heute .ag-list .item:hover .acts .btn,.view-heute .ag-list .item:focus-within .acts .btn{display:inline-flex}.view-heute .ag-list .item:hover .acts .btn.primary,.view-heute .ag-list .item:focus-within .acts .btn.primary{background:var(--glow);color:var(--on-glow)}"+
  ".view-heute .ag-list .item:hover{background:var(--hover,var(--sunk))}"+
  /* Platz für die schwebende Frage-Leiste */
  ".view-heute{padding-bottom:70px}"+
"}"+

/* Frag dein Cockpit – schwebende Leiste (Desktop, nur auf Heute) */
".agdock{display:none}"+
"@media (min-width:901px){"+
  "body[data-view='heute']:not(.kichat-on) .agdock{display:flex}"+
  ".agdock{position:fixed;z-index:30;bottom:calc(20px + env(safe-area-inset-bottom,0px));left:calc(var(--rail-w,244px) + (100% - var(--rail-w,244px))/2);transform:translateX(-50%);width:min(620px,calc(100% - var(--rail-w,244px) - 48px));align-items:center;gap:8px;padding:7px 7px 7px 18px;border-radius:30px;background:var(--glass-strong,var(--panel));-webkit-backdrop-filter:var(--glass-blur,none);backdrop-filter:var(--glass-blur,none);border:1px solid var(--glass-line,var(--line));box-shadow:var(--shadow-pop)}"+
  ".agdock:focus-within{border-color:color-mix(in srgb,var(--glow) 55%,transparent)}"+
  ".agdock-i{display:grid;place-items:center;color:var(--glow);flex:none}.agdock-i svg{width:20px;height:20px}"+
  ".agdock input{flex:1;min-width:0;border:0;background:none;color:var(--ink);font:inherit;font-size:15px;font-weight:600;padding:11px 0;outline:none}.agdock input::placeholder{color:var(--ink-3);font-weight:500}"+
  ".agdock-k{flex:none;border:1px solid var(--line-2);border-radius:7px;background:none;color:var(--ink-3);font:600 11px var(--f-mono);padding:2px 7px;cursor:pointer}.agdock-k:hover{color:var(--ink)}"+
  ".agdock .ag-go{width:46px;height:46px}"+
  "body[data-view='heute']:not(.kichat-on) .toast{bottom:calc(100px + env(safe-area-inset-bottom,0px))}"+
"}"+
".ag-go{flex:none;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:var(--btn-pri,var(--glow));color:var(--btn-pri-ink,var(--on-glow));cursor:pointer}.ag-go svg{width:19px;height:19px}.ag-go:hover{filter:brightness(1.08)}"+

/* Handy */
"@media (max-width:900px){"+
  ".agm{display:grid;gap:12px;min-width:0}"+
  ".view-heute .agm .ag-hero{padding:calc(16px + env(safe-area-inset-top,0px)) 4px 4px}"+
  ".agm .ag-clock{font-size:76px;line-height:.95}"+
  ".agm .ag-date{margin-top:8px;font-size:19px}.agm .ag-wx{font-size:14.5px;align-items:flex-start}.agm .ag-wx svg{margin-top:1px}.agm .ag-wx span{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2}.agm .ag-greet{margin-top:8px}"+
  ".agm .agp{padding:16px 16px 14px}"+
  ".agm .ag-h h2{font-size:12px}"+
  ".agm .ag-ask{display:flex;align-items:center;gap:10px;padding:6px 6px 6px 16px;border-radius:26px}"+
  ".ag-ask-i{display:grid;place-items:center;color:var(--glow);flex:none}.ag-ask-i svg{width:20px;height:20px}"+
  ".ag-ask input{flex:1;min-width:0;border:0;background:none;color:var(--ink);font:inherit;font-size:16px;font-weight:600;padding:12px 0;outline:none}.ag-ask input::placeholder{color:var(--ink-3);font-weight:500}"+
  ".ag-quick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px;padding:6px}"+
  ".ag-quick>button,.ag-quick>label{display:grid;justify-items:center;align-content:center;gap:6px;min-height:68px;padding:8px 2px;border:0;border-radius:14px;background:none;color:var(--ink);font:inherit;font-size:12.5px;font-weight:600;line-height:1.15;text-align:center;cursor:pointer}"+
  ".ag-quick svg{width:22px;height:22px}.ag-quick>*:active{background:var(--hover,var(--sunk))}.ag-quick>label svg{color:var(--glow)}"+
  ".agm .ag-ev{min-height:52px}.agm .ag-row{min-height:56px}.agm .ag-ib{width:36px;height:36px}.agm .ag-lk{min-height:40px}"+
  ".agm .ag-mr{padding:10px 12px}"+
  /* Für dich: Zeilen randlos in der Karte; Aktionen per Antippen/Wischen (mobile.js) */
  ".agm .ag-for{padding:16px 0 0;overflow:hidden}.agm .ag-for>.ag-h,.agm .ag-for>.ag-none,.agm .ag-for>.ag-empty{padding-inline:16px}"+
  ".agm .ag-for>.ag-empty{margin-bottom:14px}.agm .ag-for .ag-tog{margin:12px auto 14px}"+
  ".view-heute .agm .ag-for .feed{border-top:1px solid var(--line)}.view-heute .agm .ag-for .feed+.feed{border-top:0}"+
  ".view-heute .agm .ag-for .feed>.item{background:transparent}"+
  ".view-heute .gsw>.item{background:var(--panel-solid,var(--panel))}"+
  ".agm .ag-fc .ag-k{display:flex;margin-bottom:2px}.agm .ag-fc .ag-k .tag{padding:0;background:none;font-size:11px;letter-spacing:.05em;text-transform:uppercase}"+
  ".agm .ag-fc .t{font-weight:600;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}"+
  /* Aufgaben: große Häkchen + Eingabe */
  ".agm .ag-tasks .tdrow{grid-template-columns:28px minmax(0,1fr);gap:12px;min-height:52px}.agm .ag-tasks .tdrow input{width:24px;height:24px}"+
  ".agm .ag-tasks .tdrow .todo-t{font-size:15px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;margin:6px 0;line-height:1.35}"+
  ".agm .ag-tasks .todo-add{grid-template-columns:minmax(0,1fr) 54px}.agm .ag-tasks .todo-add input.f{height:46px;font-size:16px;border-radius:12px}.agm .ag-tasks .todo-add .btn{font-size:22px;border-radius:12px}"+
  ".agm .ag-inc .income .line{padding:6px 0;border-top:1px solid var(--line)}"+
"}"+
"@media (prefers-reduced-motion:no-preference){"+
  ".ag-live i,.ag-stp i.cur{animation:agPulse 2s ease-in-out infinite}"+
  "@keyframes agPulse{50%{opacity:.4}}"+
"}");
/* Handy-Bausteine (.mx-*), die „Kunden“ nutzt */
F.css(
"@media (max-width:900px){"+
  ".mx{display:grid;gap:12px;min-width:0}"+
  ".mx-card{background:var(--panel);border-radius:14px;border:1px solid color-mix(in srgb,var(--line) 75%,transparent);padding:12px 16px 14px;min-width:0}"+
  ".mx-card.flush{padding:0;overflow:hidden}"+
  ".mx-h{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px}.mx-card.flush .mx-h{padding:4px 16px 0}"+
  ".mx-h h3{font-size:16px;font-weight:650;margin:0;display:flex;align-items:center;gap:8px;letter-spacing:-.01em}.mx-h h3 .tag{font-size:12px}"+
  ".mx-badge{min-width:24px;height:24px;border-radius:99px;background:var(--glow);color:var(--on-glow);font:700 12.5px/24px var(--f-mono);text-align:center;padding:0 7px}"+
  ".mx-link{display:inline-flex;align-items:center;gap:2px;border:0;background:none;color:var(--glow);font-size:14px;font-weight:600;padding:10px 0 10px 10px;min-height:44px}.mx-link svg{width:16px;height:16px}"+
  ".mx-more{display:block;width:100%;border:0;border-top:1px solid var(--line);background:none;color:var(--glow);font-weight:600;font-size:15px;min-height:50px}"+
  ".mx-empty{color:var(--ink-3);text-align:center;padding:18px 16px;margin:0;font-size:14px}"+
  /* Schnellaktionen */
  ".mx-quick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}"+
  ".mx-q{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:70px;padding:8px 4px;border-radius:14px;border:1px solid color-mix(in srgb,var(--line) 75%,transparent);background:var(--panel);color:var(--ink);font-size:12.5px;font-weight:600;line-height:1.15;text-align:center;cursor:pointer}"+
  ".mx-q svg{width:22px;height:22px;flex:none}.mx-q:active{transform:scale(.97)}"+
  ".mx-q1{background:var(--glow);border-color:var(--glow);color:var(--on-glow)}"+
  /* Kennzahlen-Chips */
  ".mx-chips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 calc(-1*clamp(16px,4vw,44px));padding:0 clamp(16px,4vw,44px) 2px;scroll-padding:0 16px}.mx-chips::-webkit-scrollbar{display:none}"+
  ".mx-chip{flex:none;display:grid;gap:1px;min-width:142px;text-align:left;background:var(--panel);border:1px solid color-mix(in srgb,var(--line) 75%,transparent);border-radius:14px;padding:10px 14px;color:var(--ink);font:inherit;cursor:pointer}"+
  ".mx-chip>span{font-size:12.5px;color:var(--ink-3);white-space:nowrap}.mx-chip>b{font-size:20px;font-weight:650;letter-spacing:-.02em;white-space:nowrap}.mx-chip>i{font-style:normal;font-size:12px;color:var(--ink-3);white-space:nowrap}.mx-chip>i em{font-style:normal}"+
  ".mx-chip.glow{border-color:var(--glow);background:var(--glow-soft)}.mx-chip.bad{border-color:color-mix(in srgb,var(--bad) 40%,transparent);background:var(--bad-soft)}.mx-chip.warn{border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:var(--warn-soft)}"+
  ".mx-chip:active{transform:scale(.97)}"+
  /* Zeilen */
  ".mx-row{display:flex;width:100%;gap:12px;align-items:center;justify-content:space-between;text-align:left;border:0;border-top:1px solid var(--line);background:none;padding:10px 12px 10px 16px;min-height:60px;color:var(--ink);font:inherit;cursor:pointer}"+
  ".mx-row:active{background:var(--sunk)}"+
  ".mx-l{display:grid;min-width:0;gap:2px}.mx-l b{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mx-l>span{font-size:13px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".mx-r{display:flex;align-items:center;gap:4px;flex:none;color:var(--ink-3)}.mx-r small{font-size:12.5px}.mx-r>svg{width:18px;height:18px}.mx-r.up>svg{transform:rotate(90deg)}"+
  ".mx-row:not(.unread) .mx-l b{font-weight:500}.mx-row.unread{box-shadow:inset 3px 0 0 var(--glow)}"+
  /* Feed-Zeilen größer */
  ".mx-feed .feed{border-top:1px solid var(--line)}.mx-feed .feed .item{min-height:62px;padding:10px 14px 10px 0!important}"+
  ".mx-feed .item .t{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mx-feed .item .d{font-size:13px}"+
  /* Tagesliste */
  ".mx-day{padding:4px 0 6px}.mx-day+.mx-day{border-top:1px solid var(--line);padding-top:10px}"+
  ".mx-dh{font-size:13px;font-weight:700;color:var(--ink-3);margin-bottom:4px}.mx-dh.today{color:var(--glow)}"+
  ".mx-ev{display:grid;grid-template-columns:60px 3px minmax(0,1fr);gap:10px;align-items:stretch;padding:6px 0;min-height:44px}"+
  ".mx-ev>span{font-size:13px;font-weight:600;color:var(--ink-2);padding-top:1px}.mx-ev>i{border-radius:2px;background:var(--glow)}"+
  ".mx-ev b{display:block;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx-ev small{display:block;color:var(--ink-3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
  ".mx-none{font-size:14px;color:var(--ink-3);padding:4px 0 6px}"+
  /* To-Dos: große Häkchen + Eingabe */
  ".mx-todos .tdrow{grid-template-columns:28px minmax(0,1fr);gap:12px;min-height:54px;padding:8px 16px}"+
  ".mx-todos .tdrow input{width:24px;height:24px}"+
  ".mx-todos .tdrow .todo-t{font-size:15px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;padding:0;margin:6px 0;line-height:1.35}"+
  ".mx-todos .tdrow .due{font-size:12.5px}"+
  ".mx-todos .todo-add{display:grid;grid-template-columns:minmax(0,1fr) 54px;grid-template-areas:'t t' 'd b';gap:8px;padding:12px 16px 14px;border-top:1px solid var(--line)}"+
  ".mx-todos .todo-add input[name=text]{grid-area:t}.mx-todos .todo-add input[name=due]{grid-area:d;max-width:none!important}.mx-todos .todo-add .btn{grid-area:b;justify-content:center;font-size:22px;border-radius:12px}"+
  ".mx-todos .todo-add input.f{height:46px;font-size:16px;border-radius:12px}"+
  ".mx .empty{padding:14px 16px;color:var(--ink-3);font-size:14px}"+
  /* Monatseinkommen */
  ".mx-inc .mx-row{border-top:0;min-height:64px}.mx-inc .mx-l>span{font-size:13px}.mx-inc .mx-l b{font-size:20px;font-weight:650}.mx-inc .mx-l b small{font:500 13px var(--f-body);color:var(--ink-3)}"+
  ".mx-incb{border-top:1px solid var(--line)}.mx-il{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--line);min-height:52px}"+
  ".mx-il span{display:grid;min-width:0;font-size:15px}.mx-il small{font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx-il b{font-weight:600;font-size:15px;white-space:nowrap}.mx-incb .mx-more{border-top:0}"+
"}");
})();
