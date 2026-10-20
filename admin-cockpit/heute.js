/* Ansicht "Heute": priorisierte Liste aus allen Modulen, Termine, To-Dos, Umsatz. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;
var SRC={website:"Websites",kochdu:"kochdu",valuero:"VALUERO",blitzdings:"Blitzdings",kantineur:"Kantineur"};
F.SRC=SRC;
F.isInbox=function(m){ return /^inbox$/i.test(m.folder||"INBOX"); };
F.unreadMails=function(){ return F.D?F.D.mail.messages.filter(function(m){ return !m.read && F.isInbox(m); }):[]; };
F.newLeads=function(){ return F.D?F.D.leads.filter(function(l){ return (l.stage||"anfrage")==="anfrage"; }):[]; };
F.siteBad=function(s){ return s.up===false||/FAILED|CRASHED/.test(s.status||""); };

/* Basis-Einträge für "Heute" */
F.feed(function(){
  var D=F.D, out=[], today=D.today;
  F.newLeads().forEach(function(l){ out.push({id:"lead:"+l.id,rank:1,sev:"glow",icon:"lead",tag:["glow","Neue Anfrage"],t:(l.company?l.company+" · ":"")+l.name,d:(l.topic||"Anfrage")+(l.entwurf?" · möchte einen Gratis-Entwurf":"")+(l.source?" · über "+l.source:"")+" · "+F.ago(l.created),acts:[["Kundenakte","lead:"+l.id],["Antworten","replylead:"+l.id,"primary"]]}); });
  var sev=D.sev;
  if(sev) sev.invoices.filter(function(i){return i.overdue&&i.open>0.005;}).forEach(function(i){ out.push({id:"inv:"+i.id,rank:2,sev:"bad",icon:"euro",tag:["bad","Überfällig"],t:(i.contact||"Kunde")+" · "+(i.nr||"Entwurf"),d:eur(i.open)+" offen · fällig seit "+de(i.due),acts:[["Details","sdinv:"+i.id],["Mahnen","sdremind:"+i.id],["Zahlung erfassen","book:"+i.id,"primary"]]}); });
  (D.sites||[]).forEach(function(s){
    if(/FAILED|CRASHED/.test(s.status||"")) out.push({id:"rw:"+s.key,rank:2,sev:"bad",icon:"alert",tag:["bad","Deploy"],t:"Deploy fehlgeschlagen: "+s.name,d:"Railway · letzter Versuch "+(s.lastDeploy?F.ago(s.lastDeploy):""),acts:[["Websites","go:web"]]});
    else if(s.up===false&&(s.active||!s.own)) out.push({id:"down:"+s.key,rank:2,sev:"bad",icon:"alert",tag:["bad","Offline"],t:s.name+" ist nicht erreichbar",d:s.domain||"",acts:s.url?[["Öffnen","url:"+s.url]]:[]});
  });
  // Plattform-Abgleich („Zu verrechnen“) bewusst nicht mehr unter „Zu erledigen“ – kochdu & Co. rechnen automatisch ab
  F.unreadMails().filter(function(m){ return !m.answered && (Date.now()-Date.parse(m.date||0))<14*864e5; }).slice(0,8).forEach(function(m){ out.push({id:"mail:"+m.id,rank:4,sev:"info",icon:"post",tag:["info","Mail"],t:(m.fromName||m.from||"")+": „"+(m.subject||"(kein Betreff)")+"“",d:F.ago(m.date)+" · ungelesen",acts:[["Lesen","mail:"+m.id,"primary"]]}); });
  /* Bankumsätze & Entwürfe: Feed kommt aus sevdesk.js (Dateiname historisch) */
  return out;
});

/* „Meine Aufgaben“ (früher To-Dos): offene Aufgaben aus „Aufträge“, nächste Frist zuerst; Haken = erledigt (mit Rückgängig), + legt eine Aufgabe ohne Auftrag an */
function openTasks(){ var T=(F.D.auftraege&&F.D.auftraege.tasks)||[]; return T.filter(function(x){ return x.status!=="erledigt"; }).sort(function(a,b){ var pa=a.prio==="dringend"?0:a.prio==="hoch"?1:2, pb=b.prio==="dringend"?0:b.prio==="hoch"?1:2; return String(a.due||"9999").localeCompare(String(b.due||"9999"))||pa-pb; }); }
F.taskList=function(n){ var t=F.D.today, arr=openTasks().slice(0,n||8), P=(F.D.auftraege&&F.D.auftraege.projects)||[];
  return arr.length?arr.map(function(x){ var p=P.find(function(y){ return y.id===x.projectId; });
    return '<div class="tdrow"><input type="checkbox" data-tkdone="'+esc(x.id)+'" aria-label="Erledigt"><button type="button" class="todo-t" data-act="tkopen:'+esc(x.id)+'">'+esc(x.title||"")+(x.due?' <span class="due'+(x.due<t?" late":"")+'">'+(x.due<t?"überfällig · ":"")+de(x.due)+'</span>':'')+(p?' <span class="due">· '+esc(p.name)+'</span>':'')+'</button></div>'; }).join(""):'<div class="empty">Keine offenen Aufgaben.</div>'; };
F.taskAdd=function(){ return '<form class="todo-add" data-form="todo"><input class="f" name="text" placeholder="Neue Aufgabe …" aria-label="Neue Aufgabe" required><input class="f" type="date" name="due" aria-label="Fällig am" style="max-width:150px"><button class="btn primary" type="submit" aria-label="Aufgabe anlegen">+</button></form>'; };
F.form("todo",function(f){ var txt=f.text.value.trim(); if(!txt) return; F.addTodo({text:txt,due:f.due.value||""}).then(function(j){ if(j&&j.ok) F.toast("Aufgabe angelegt",false,"Ansehen",function(){ F.go("auftraege"); }); }); });
F.listen("change","[data-tkdone]",function(el){ var id=el.getAttribute("data-tkdone"), T=(F.D.auftraege&&F.D.auftraege.tasks)||[], x=T.find(function(y){ return y.id===id; }); if(!x||!F.tkApi) return;
  if(x.print){ el.checked=false; F.toast("Druckaufträge schließt du auf der Druck-Seite ab",true); return; }
  var prev=x.status; F.tkApi("task.move",{id:id,status:"erledigt"}).then(function(j){ if(j&&j.ok) F.toast("Erledigt ✓",false,"Rückgängig",function(){ F.tkApi("task.move",{id:id,status:prev}); }); }); });

F.view({id:"heute",label:"Heute",short:"Heute",icon:"heute",order:10,mobile:true,
  count:function(){ return F.feedItems().length; },
  render:function(){
    var D=F.D, f=F.feedItems(), today=D.today, h=new Date().getHours(), UI=F.UI;
    var greet=h<11?"Guten Morgen":h<17?"Hallo":"Guten Abend";
    if(window.innerWidth<=900) return mobileHeute();
    var shown=UI.feedAll?f:f.slice(0,12);
    var items=shown.map(feedItemHtml).join("");
    var ab=D.abgleich.totals, sev=D.sev, cust=(D.sites||[]).filter(function(s){return !s.own&&s.active;}), bad=cust.filter(F.siteBad);
    /* alle Kalender (Dashboard, Mail-Kalender, alle iCloud-Kalender) + Fotobox-Buchungen; heute + die nächsten Termine */
    var bz=((D.platforms&&D.platforms.blitzdings&&D.platforms.blitzdings.upcoming)||[]).map(function(b){ var d=String(b.eventDate||"").slice(0,10); return {id:"bz_"+b.id,title:"Fotobox: "+(b.customerName||"Buchung")+(b.package?" · "+b.package:""),date:d,time:String(b.eventDate||"").slice(11,16).replace(/^00:00$/,""),location:b.location||"",cal:"Blitzdings"}; });
    var allEv=D.events.concat(bz.filter(function(b){ return /^\d{4}-\d{2}-\d{2}$/.test(b.date); })).filter(function(e){ return e.date>=today; }).sort(function(a,b){ return (a.date+(a.time||"")).localeCompare(b.date+(b.time||"")); });
    var todayEv=allEv.filter(function(e){return e.date===today;}), nextEv=allEv.slice(0,Math.max(8,todayEv.length+5));
    var dateLine=new Date().toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    /* Termine nach Tagen gruppieren: Heute, Morgen, dann Wochentag + Datum */
    var dayName=function(d){ if(d===today) return "Heute"; var t1=new Date(today+"T12:00:00"); t1.setDate(t1.getDate()+1); if(d===F.ymd(t1)) return "Morgen"; return new Date(d+"T12:00:00").toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"numeric"}); };
    var grp=[], lastD=null; nextEv.forEach(function(e){ if(e.date!==lastD){ grp.push({d:e.date,list:[]}); lastD=e.date; } grp[grp.length-1].list.push(e); });
    if(!todayEv.length) grp.unshift({d:today,list:[]});
    var agenda=grp.map(function(g){ return '<div class="hday"><div class="hday-h'+(g.d===today?" today":"")+'">'+esc(dayName(g.d))+'</div>'+
      (g.list.length?g.list.map(function(e){ return '<div class="hev"><span class="ht">'+esc(e.time||"ganztags")+'</span><span class="hb"></span><div style="min-width:0"><b>'+esc(e.title)+'</b>'+((e.location||e.cal)?'<small>'+esc([e.location||"",e.cal||""].filter(Boolean).join(" · "))+'</small>':'')+'</div></div>'; }).join(""):'<div class="hnone">Keine Termine</div>')+'</div>'; }).join("");
    return F.head(greet+", Simon.",esc(dateLine)+(f.length?" · "+f.length+(f.length===1?" Sache offen":" Sachen offen"):" · alles erledigt"),
      '<button class="btn" data-act="compose">Neue Mail</button><button class="btn" data-act="newevent:">Neuer Termin</button><button class="btn primary" data-act="newinvoice">Neue Rechnung</button>')+
    kpiCards(sev,cust,bad)+
    (function(){ var todoP='<section class="panel hcol-todo"><div class="panel-h"><h2>Zu erledigen</h2><span class="muted">'+(f.length?f.length+" offen · priorisiert":"")+'</span></div>'+
        (items?'<ul class="feed">'+items+'</ul>':'<div class="empty">Nichts offen. 🎉</div>')+
        (f.length>12?'<button class="more" data-act="togglefeed">'+(UI.feedAll?"Weniger anzeigen":"Alle "+f.length+" anzeigen")+'</button>':'')+'</section>',
      dayP='<section class="panel"><div class="panel-h"><h2>Mein Tag</h2><button class="link" data-go="kal">Kalender →</button></div><div class="hagenda">'+agenda+'</div></section>',
      todosP='<section class="panel"><div class="panel-h"><h2>Meine Aufgaben</h2><button class="link" data-go="auftraege">Alle →</button></div>'+F.taskList(8)+F.taskAdd()+'</section>';
      /* Statusleiste rechts sichtbar → Termine und Mails stehen schon dort: zwei Spalten ohne Doppelungen */
      if(F.sideVisible&&F.sideVisible()) return '<div class="hgrid two-col">'+todoP+'<div class="stack">'+projectsPanel()+todosP+incomePanel()+'</div></div>';
      return '<div class="hgrid">'+todoP+'<div class="stack">'+projectsPanel()+dayP+todosP+'</div><div class="stack">'+mailPanel()+incomePanel()+'</div></div>'; })();
  }
});
/* Kennzahlen-Karten: Umsatz des Monats (mit Verlauf), offene Forderungen, offene Aufgaben, neue Anfragen (mit Verlauf je Woche) */
function spark(vals,color){ if(!vals||vals.length<2) return ''; var mx=Math.max.apply(null,vals), mn=Math.min.apply(null,vals), w=120, h=28, rg=mx-mn||1;
  var pts=vals.map(function(v,i){ return (i*(w/(vals.length-1))).toFixed(1)+","+(h-2-(v-mn)/rg*(h-6)).toFixed(1); }).join(" ");
  return '<svg class="hk-sp" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>'; }
function kpiCards(sev,cust,bad){
  var D=F.D, now=new Date(), cm=String(now.getFullYear())===String(D.year)?now.getMonth():-1, mName=now.toLocaleDateString("de-AT",{month:"long"});
  var rev=sev&&sev.byMonth&&cm>-1?sev.byMonth.slice(0,cm+1):null, cur=rev?rev[cm]:null, prev=rev&&cm>0?rev[cm-1]:null;
  var dlt=prev?Math.round((cur-prev)/prev*100):null;
  var T=(D.auftraege&&D.auftraege.tasks)||[], t0=D.today, open=T.filter(function(t){ return t.status!=="erledigt"; }), over=open.filter(function(t){ return t.due&&t.due<t0; }).length, dueToday=open.filter(function(t){ return t.due===t0; }).length;
  var wk=[0,0,0,0,0,0,0,0], ms=Date.now(); (D.leads||[]).forEach(function(l){ var a=Math.floor((ms-Date.parse(l.created))/(7*864e5)); if(a>=0&&a<8) wk[7-a]++; });
  var nl=F.newLeads().length, wkNew=wk[7];
  var card=function(go,k,v,sub,cls,sp,money){ return '<button data-go="'+go+'"><span class="k">'+k+'</span><span class="v num'+(money?" money":"")+'">'+v+'</span>'+(sp||'<span class="hk-nosp"></span>')+'<span class="s '+(cls||"")+'">'+sub+'</span></button>'; };
  return '<div class="day hk">'+
    (rev?card("geld","Umsatz "+esc(mName),eur0(cur),dlt==null?"laut Rechnungen":(dlt>=0?"+":"")+dlt+" % zum Vormonat",dlt==null?"":dlt>=0?"ok-t":"bad-t",spark(rev.slice(-7),"var(--ok)"),true):'')+
    card("geld","Offene Forderungen",sev?eur0(sev.openSum):"—",sev?(sev.overdueCount?esc(eur0(sev.overdueSum))+" überfällig":"nichts überfällig"):"lädt …",sev&&sev.overdueCount?"warn-t":"ok-t","",true)+
    card("auftraege","Offene Aufgaben",String(open.length),over?over+(over===1?" Frist":" Fristen")+" überschritten":dueToday?dueToday+" heute fällig":"keine Frist überschritten",over?"bad-t":dueToday?"glow-t":"ok-t")+
    card("kunden","Neue Anfragen",String(nl),wkNew?wkNew+" diese Woche":(D.leads||[]).length+" Leads insgesamt","glow-t",spark(wk,"var(--glow)"))+
    (bad.length?card("web","Websites",(cust.length-bad.length)+"/"+cust.length,bad.length+" mit Problem","bad-t"):'')+
  '</div>'; }
/* Aufträge im Blick: aktive Aufträge mit Fortschritt (erledigte/alle Aufgaben) und nächster Abgabe – Druckshop läuft separat */
function projectsPanel(){
  var A=F.D.auftraege||{projects:[],tasks:[]}, t0=F.D.today, PC=F.tkPCOL||["#7b8bff"];
  var P=(A.projects||[]).filter(function(p){ return p.status==="aktiv"&&p.id!=="pdruckshop"; }).map(function(p){ var T=(A.tasks||[]).filter(function(t){ return t.projectId===p.id; }), o=T.filter(function(t){ return t.status!=="erledigt"; });
    var due=o.filter(function(t){ return t.due; }).map(function(t){ return t.due; }).sort()[0]||p.due||"";
    return {p:p,n:T.length,open:o.length,pct:T.length?Math.round((T.length-o.length)/T.length*100):0,due:due,over:o.some(function(t){ return t.due&&t.due<t0; })}; })
    .sort(function(a,b){ return (b.over-a.over)||String(a.due||"9999").localeCompare(String(b.due||"9999")); }).slice(0,5);
  var body=P.length?P.map(function(x){ var c=PC[x.p.color||0]||PC[0];
    return '<button type="button" class="ab-r" data-act="tkprojopen:'+esc(x.p.id)+'"><span class="ab-t"><i style="background:'+c+'"></i><b>'+esc(x.p.name)+'</b><span class="ab-m'+(x.over?" bad-t":"")+'">'+(x.open?x.open+" offen":"alles erledigt")+(x.over?" · überfällig":x.due?" · Abgabe "+esc(deShort?deShort(x.due):de(x.due)):"")+'</span></span><span class="ab-b"><span style="width:'+x.pct+'%;background:'+c+'"></span></span></button>'; }).join("")
    :'<div class="empty">Keine aktiven Aufträge. <button class="link" data-act="newproj">Auftrag anlegen</button></div>';
  return '<section class="panel"><div class="panel-h"><h2>Aufträge im Blick</h2><button class="link" data-go="auftraege">Alle Aufträge →</button></div><div class="ab">'+body+'</div></section>'; }
function feedItemHtml(x){ return '<li class="item"><span class="sev '+x.sev+'"></span><span class="ico">'+F.svg(x.icon)+'</span><div style="min-width:0"><div class="t"><span class="tag '+x.tag[0]+'">'+esc(x.tag[1])+'</span>'+esc(x.t)+'</div><div class="d">'+esc(x.d)+'</div></div><div class="acts">'+x.acts.map(function(a){ return '<button class="btn '+(a[2]||"")+'" data-act="'+esc(a[1])+'">'+esc(a[0])+'</button>'; }).join("")+'<button class="btn icon" data-snooze="'+esc(x.id)+'" title="Bis morgen ausblenden" aria-label="Bis morgen ausblenden">✕</button></div></li>'; }

/* ---------- Handy (≤ 900 px): eine Spalte im Stil der Finanzen-Ansicht ---------- */
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
var mxIc=F.mxIc;
function mobileHeute(){
  var D=F.D, f=F.feedItems(), today=D.today, h=new Date().getHours(), UI=F.UI;
  var greet=h<11?"Guten Morgen":h<17?"Hallo":"Guten Abend";
  var dateLine=new Date().toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long"});
  var ab=D.abgleich.totals, sev=D.sev, cust=(D.sites||[]).filter(function(s){return !s.own&&s.active;}), bad=cust.filter(F.siteBad), nl=F.newLeads().length;
  /* Kennzahlen als wischbare Chips */
  var chip=function(go,label,val,sub,cls,money){ return '<button type="button" class="mx-chip'+(cls?" "+cls:"")+'" data-go="'+go+'"><span>'+esc(label)+'</span><b class="num'+(money?" money":"")+'">'+val+'</b><i>'+sub+'</i></button>'; };
  var chips='<div class="mx-chips" aria-label="Kennzahlen">'+
    chip("kunden","Neue Anfragen",String(nl),esc(D.leads.length+" Leads gesamt"),nl?"glow":"")+
    chip("geld","Offene Forderungen",sev?eur0(sev.openSum):"—",sev?(sev.overdueCount?'<em class="bad-t">'+esc(eur0(sev.overdueSum))+' überfällig</em>':"nichts überfällig"):"lädt …",sev&&sev.overdueCount?"bad":"",true)+
    chip("web","Websites",(cust.length-bad.length)+"/"+cust.length,bad.length?'<em class="bad-t">'+bad.length+' mit Problem</em>':"alle erreichbar",bad.length?"bad":"")+'</div>';
  /* Schnellaktionen */
  var quick='<div class="mx-quick">'+
    '<button type="button" class="mx-q" data-act="compose">'+mxIc("mail")+'<span>Neue Mail</span></button>'+
    '<button type="button" class="mx-q" data-act="newevent:">'+mxIc("cal")+'<span>Termin</span></button>'+
    '<button type="button" class="mx-q" data-act="newinvoice">'+mxIc("inv")+'<span>Rechnung</span></button>'+
    '<label class="mx-q mx-q1">'+mxIc("cam")+'<span>Beleg scannen</span><input type="file" class="fsd-scan" accept="image/*,application/pdf" capture="environment" multiple hidden></label></div>';
  /* Zu erledigen: Top 5, Rest auf Wunsch */
  var shown=UI.feedAll?f:f.slice(0,5);
  var todo='<section class="mx-card flush mx-feed"><div class="mx-h"><h3>Zu erledigen</h3>'+(f.length?'<span class="mx-badge">'+f.length+'</span>':'')+'</div>'+
    (f.length?'<ul class="feed">'+shown.map(feedItemHtml).join("")+'</ul>'+(f.length>5?'<button type="button" class="mx-more" data-act="togglefeed">'+(UI.feedAll?"Weniger anzeigen":"Alle "+f.length+" anzeigen")+'</button>':''):'<p class="mx-empty">Nichts offen. 🎉</p>')+'</section>';
  /* Mein Tag: heute + morgen */
  var t1=new Date(today+"T12:00:00"); t1.setDate(t1.getDate()+1); var tomorrow=F.ymd(t1);
  var bz=((D.platforms&&D.platforms.blitzdings&&D.platforms.blitzdings.upcoming)||[]).map(function(b){ var d=String(b.eventDate||"").slice(0,10); return {title:"Fotobox: "+(b.customerName||"Buchung")+(b.package?" · "+b.package:""),date:d,time:String(b.eventDate||"").slice(11,16).replace(/^00:00$/,""),location:b.location||"",cal:"Blitzdings"}; });
  var evs=D.events.concat(bz).filter(function(e){ return e.date===today||e.date===tomorrow; }).sort(function(a,b){ return (a.date+(a.time||"")).localeCompare(b.date+(b.time||"")); });
  var day=function(d,lbl){ var l=evs.filter(function(e){ return e.date===d; }); return '<div class="mx-day"><div class="mx-dh'+(d===today?" today":"")+'">'+lbl+'</div>'+(l.length?l.map(function(e){ return '<div class="mx-ev"><span class="num">'+esc(e.time||"ganztags")+'</span><i></i><div><b>'+esc(e.title)+'</b>'+((e.location||e.cal)?'<small>'+esc([e.location||"",e.cal||""].filter(Boolean).join(" · "))+'</small>':'')+'</div></div>'; }).join(""):'<div class="mx-none">Keine Termine</div>')+'</div>'; };
  var agenda='<section class="mx-card"><div class="mx-h"><h3>Mein Tag</h3><button type="button" class="mx-link" data-go="kal">Kalender'+mxIc("chev")+'</button></div>'+day(today,"Heute")+day(tomorrow,"Morgen")+'</section>';
  /* To-Dos */
  var todos='<section class="mx-card flush mx-todos"><div class="mx-h"><h3>Meine Aufgaben</h3><button type="button" class="mx-link" data-go="auftraege">Alle'+mxIc("chev")+'</button></div>'+F.taskList(8)+F.taskAdd()+'</section>';
  /* Neueste Mails (3) */
  var mails=((D.mail&&D.mail.messages)||[]).filter(function(m){ return F.isInbox(m)&&!m.deleted; }).sort(function(a,b){ return String(b.date||"").localeCompare(String(a.date||"")); }).slice(0,3), unread=F.unreadMails().length;
  var mailC='<section class="mx-card flush"><div class="mx-h"><h3>Neueste Mails'+(unread?' <span class="tag info">'+unread+' ungelesen</span>':'')+'</h3><button type="button" class="mx-link" data-go="post">Postfach'+mxIc("chev")+'</button></div>'+
    (mails.length?mails.map(function(m){ return '<button type="button" class="mx-row'+(m.read?"":" unread")+'" data-act="mail:'+esc(m.id)+'"><span class="mx-l"><b>'+esc(m.fromName||m.from||"")+'</b><span>'+esc(m.subject||"(kein Betreff)")+'</span></span><span class="mx-r"><small>'+esc(F.M&&F.M.fmtMailDate?F.M.fmtMailDate(m.date):F.ago(m.date))+'</small>'+mxIc("chev")+'</span></button>'; }).join(""):'<p class="mx-empty">Keine Mails.</p>')+'</section>';
  /* Monatseinkommen: zugeklappt, Antippen klappt auf */
  var inc=D.income, incC="";
  if(inc&&inc.lines&&inc.lines.length){
    var open=!!UI.incOpen;
    incC='<section class="mx-card flush mx-inc"><button type="button" class="mx-row" data-act="hmincome" aria-expanded="'+open+'"><span class="mx-l"><span>Geschätztes Monatseinkommen</span><b class="num money">'+eur0(inc.total)+' <small>/ Monat</small></b></span><span class="mx-r'+(open?" up":"")+'">'+mxIc("chev")+'</span></button>'+
      (open?'<div class="mx-incb">'+inc.lines.map(function(l){ return '<div class="mx-il"><span>'+esc(l.label)+'<small>'+esc(l.basis)+(l.live&&l.key==="kochdu"?' · live':'')+'</small></span><b class="num money">'+eur0(l.monthly)+'</b></div>'; }).join("")+'<button type="button" class="mx-more" data-act="incomeinfo">Wie gerechnet?</button></div>':'')+'</section>';
  }
  return F.head(greet+", Simon.",esc(dateLine)+(f.length?" · "+f.length+(f.length===1?" Sache offen":" Sachen offen"):" · alles erledigt"),"")+
    '<div class="mx">'+quick+chips+todo+agenda+todos+mailC+incC+'</div>';
}
F.action("hmincome",function(){ F.UI.incOpen=!F.UI.incOpen; F._forceRender=true; F.render(); });
/* Beim Drehen/Größenändern zwischen Handy- und Desktop-Darstellung wechseln */
var wasMx=window.innerWidth<=900;
window.addEventListener("resize",function(){ var m=window.innerWidth<=900; if(m!==wasMx){ wasMx=m; if(F.D&&(F.current==="heute"||F.current==="kunden")){ F._forceRender=true; F.render(); } } });

/* Neueste Mails (Posteingang aller Konten), ungelesene fett; Klick öffnet die Mail im Postfach */
function mailPanel(){
  var all=((F.D.mail&&F.D.mail.messages)||[]).filter(function(m){ return F.isInbox(m)&&!m.deleted; }).sort(function(a,b){ return String(b.date||"").localeCompare(String(a.date||"")); }).slice(0,6);
  var unread=F.unreadMails().length;
  return '<section class="panel"><div class="panel-h"><h2>Neueste Mails'+(unread?' <span class="tag info">'+unread+' ungelesen</span>':'')+'</h2><button class="link" data-go="post">Postfach →</button></div>'+
    (all.length?'<ul class="agenda">'+all.map(function(m){ return '<li class="hmail'+(m.read?"":" unread")+'" data-act="mail:'+esc(m.id)+'" role="button" tabindex="0" style="cursor:pointer"><span class="time">'+esc(F.M&&F.M.fmtMailDate?F.M.fmtMailDate(m.date):F.ago(m.date))+'</span><div style="min-width:0"><div style="font-weight:'+(m.read?500:700)+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(m.fromName||m.from||"")+'</div><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(m.subject||"(kein Betreff)")+'</div></div></li>'; }).join("")+'</ul>':'<div class="empty">Keine Mails.</div>')+'</section>';
}
function incomePanel(){
  var inc=F.D.income; if(!inc||!inc.lines||!inc.lines.length) return "";
  return '<section class="panel"><div class="panel-h"><h2>Geschätztes Monatseinkommen</h2><button class="link" data-act="incomeinfo">Wie gerechnet?</button></div><div class="panel-b income">'+
    '<div class="v num money">'+eur0(inc.total)+'<span class="muted" style="font-size:14px;font-weight:500"> / Monat</span></div>'+
    inc.lines.map(function(l){ return '<div class="line"><span>'+esc(l.label)+'</span><span class="num money">'+eur0(l.monthly)+'</span><span class="muted">'+esc(l.basis)+(l.live&&l.key==="kochdu"?' · live':'')+'</span></div>'+monthsBar(l); }).join("")+
    '<div class="muted">'+(inc.computedAt?'Prognose für VALUERO und Skikaiser vom '+F.de(inc.computedAt)+', nächste Neuberechnung am '+F.de(inc.nextAt)+'.':'')+'</div></div></section>';
}
/* kleiner Monatsverlauf (z. B. kochdu-Provision der letzten Monate) */
function monthsBar(l){
  var ms=(l.months||[]).filter(function(m){ return m&&m.month; }); if(ms.length<2) return "";
  var max=Math.max.apply(null,ms.map(function(m){ return +m.eur||0; }))||1;
  return '<div class="mbars" aria-label="Verlauf '+esc(l.label)+'">'+ms.map(function(m){ var h=Math.max(2,Math.round((+m.eur||0)/max*28)); var lbl=new Date(+m.month.slice(0,4),+m.month.slice(5,7)-1,1).toLocaleDateString("de-AT",{month:"short"});
    return '<span class="mb" title="'+esc(lbl+" "+m.month.slice(0,4)+": "+F.eur(m.eur)+(m.orders!=null?" · "+m.orders+" Bestellungen":""))+'"><i style="height:'+h+'px"></i><em>'+esc(lbl)+'</em></span>'; }).join("")+'</div>';
}
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
F.css(
".hgrid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}.hgrid.two-col{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}"+
".hk>button{display:grid;align-content:start}.hk .hk-sp{width:100%;max-width:170px;height:26px;margin:4px 0 2px;display:block}.hk .hk-nosp{display:block;height:6px}"+
".glow-t{color:var(--glow)}"+
".ab{display:grid}.ab-r{display:grid;gap:9px;border:0;border-top:1px solid var(--line);background:none;text-align:left;padding:13px 18px 14px;width:100%;color:var(--ink)}.ab-r:first-child{border-top:0}.ab-r:hover{background:var(--sunk)}"+
".ab-t{display:flex;align-items:center;gap:10px;min-width:0}.ab-t i{width:10px;height:10px;border-radius:3px;flex:none}.ab-t b{font-weight:600;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ab-m{margin-left:auto;font-size:12.5px;color:var(--ink-3);white-space:nowrap;flex:none}"+
".ab-b{height:5px;border-radius:5px;background:var(--sunk);overflow:hidden}.ab-b span{display:block;height:100%;border-radius:5px}"+
"@media (max-width:1280px){.hgrid{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}.hgrid>.stack:last-child{grid-column:2}}"+
"@media (max-width:1100px){.hgrid,.hgrid.two-col{grid-template-columns:minmax(0,1fr)}.hgrid>.stack:last-child{grid-column:auto}}"+
"@media (max-width:900px){.hgrid{grid-template-columns:minmax(0,1fr)}.hgrid>.stack:last-child{grid-column:auto}}"+
".hagenda{padding:0 16px 12px;display:grid;gap:10px}"+
".hday-h{font-size:12px;font-weight:700;color:var(--ink-3);text-transform:capitalize;margin:4px 0 4px}.hday-h.today{color:var(--glow)}"+
".hev{display:grid;grid-template-columns:62px 3px minmax(0,1fr);gap:10px;padding:5px 0;align-items:stretch}"+
".hev .ht{font:600 12.5px/1.4 var(--f-mono);color:var(--ink-2)}.hev .hb{border-radius:2px;background:var(--glow)}"+
".hev b{display:block;font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hev small{display:block;color:var(--ink-3);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
".hnone{font-size:13px;color:var(--ink-3);padding:2px 0 4px}"+
".tdrow{display:grid;grid-template-columns:18px minmax(0,1fr);gap:10px;align-items:center;padding:8px 16px;border-top:1px solid var(--line)}"+
".tdrow input{width:16px;height:16px;margin:0;accent-color:var(--glow)}"+
".tdrow .todo-t{border:0;background:none;padding:0;text-align:left;font:inherit;font-size:13.5px;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
".tdrow .due{font-size:12px;color:var(--ink-3)}.tdrow .due.late{color:var(--bad)}"+
".hmail{grid-template-columns:52px minmax(0,1fr)!important}.hmail .time{white-space:nowrap;font-size:12px}.hmail.unread{box-shadow:inset 3px 0 0 var(--glow);margin-left:-16px;padding-left:16px!important}"+
"@media (min-width:901px){"+
  ".view-heute .head h1{font-size:32px}"+
  ".view-heute .feed .item{grid-template-columns:8px minmax(0,1fr) auto!important;gap:12px;padding:10px 16px!important;row-gap:0}"+
  ".view-heute .feed .item .ico{display:none}"+
  ".view-heute .feed .item .sev{width:8px;height:8px;border-radius:50%;align-self:start;margin-top:7px}"+
  ".view-heute .feed .item .t{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".view-heute .feed .item .t .tag{font-size:10.5px;padding:1px 6px;margin-right:6px;background:var(--sunk);color:var(--ink-2)}"+
  ".view-heute .feed .item .d{font-size:12.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".view-heute .feed .item .acts{grid-column:auto!important;flex-wrap:nowrap;gap:4px;align-self:center}"+
  ".view-heute .feed .item .acts .btn{min-height:28px;padding:3px 10px;font-size:12.5px;display:none}"+
  ".view-heute .feed .item .acts .btn.primary{display:inline-flex;background:none;color:var(--glow);border-color:transparent}"+
  ".view-heute .feed .item:hover .acts .btn{display:inline-flex}.view-heute .feed .item:hover .acts .btn.primary{background:var(--glow);color:var(--on-glow)}"+
  ".view-heute .feed .item:hover{background:var(--sunk)}"+
"}"+
"ul.plain{margin:0;padding-left:18px;display:grid;gap:8px} .income .v{font-size:28px} .mbars{display:flex;gap:6px;align-items:flex-end;margin:-2px 0 6px;min-height:44px}.mbars .mb{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10.5px;color:var(--ink-3)}.mbars .mb i{display:block;width:16px;border-radius:3px 3px 0 0;background:var(--glow-soft)}.mbars .mb em{font-style:normal}");
/* Handy-Darstellung „Heute“ (gemeinsame .mx-Bausteine, auch von „Kunden“ genutzt) */
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
  /* Zu erledigen: Feed-Zeilen größer */
  ".mx-feed .feed{border-top:1px solid var(--line)}.mx-feed .feed .item{min-height:62px;padding:10px 14px 10px 0!important}"+
  ".mx-feed .item .t{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mx-feed .item .d{font-size:13px}"+
  /* Mein Tag */
  ".mx-day{padding:4px 0 6px}.mx-day+.mx-day{border-top:1px solid var(--line);padding-top:10px}"+
  ".mx-dh{font-size:13px;font-weight:700;color:var(--ink-3);margin-bottom:4px}.mx-dh.today{color:var(--glow)}"+
  ".mx-ev{display:grid;grid-template-columns:60px 3px minmax(0,1fr);gap:10px;align-items:stretch;padding:6px 0;min-height:44px}"+
  ".mx-ev>span{font-size:13px;font-weight:600;color:var(--ink-2);padding-top:1px}.mx-ev>i{border-radius:2px;background:var(--glow)}"+
  ".mx-ev b{display:block;font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx-ev small{display:block;color:var(--ink-3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
  ".mx-none{font-size:14px;color:var(--ink-3);padding:4px 0 6px}"+
  /* To-Dos: große Häkchen + Eingabe */
  ".mx-todos .tdrow{grid-template-columns:28px minmax(0,1fr);gap:12px;min-height:54px;padding:8px 16px}"+
  ".mx-todos .tdrow input{width:24px;height:24px}"+
  ".mx-todos .tdrow .todo-t{font-size:15px;white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;padding:6px 0;line-height:1.35}"+
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
F.action("togglefeed",function(){ F.UI.feedAll=!F.UI.feedAll; F.render(); });
})();
