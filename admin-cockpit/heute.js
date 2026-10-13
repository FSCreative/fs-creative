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
  D.abgleich.items.forEach(function(x){
    if(x.unbilled>0.005&&x.action) out.push({id:"bill:"+x.key,rank:3,sev:"warn",icon:"euro",tag:["warn","Zu verrechnen"],t:SRC[x.src]+" · "+x.name,d:eur(x.unbilled)+" · "+x.sub,acts:[["Rechnung erstellen","invoice:"+x.key,"primary"]]});
    if(x.refund>0.005) out.push({id:"refund:"+x.key,rank:3,sev:"bad",icon:"euro",tag:["bad","Zu viel verrechnet"],t:SRC[x.src]+" · "+x.name,d:eur(x.refund)+" mehr verrechnet als aktuell angefallen (Storno?)",acts:[["Abgleich","go:geld"]]});
    (x.invoices||[]).forEach(function(l){ if(l&&l.state==="fehlt") out.push({id:"miss:"+x.key+l.id,rank:3,sev:"warn",icon:"alert",tag:["warn","Abgleich"],t:"Rechnung "+(l.nr||l.id)+" fehlt in sevDesk",d:SRC[x.src]+" · "+x.name+" · gelöscht oder storniert?",acts:[["Abgleich","go:geld"]]}); });
  });
  F.unreadMails().filter(function(m){ return !m.answered && (Date.now()-Date.parse(m.date||0))<14*864e5; }).slice(0,8).forEach(function(m){ out.push({id:"mail:"+m.id,rank:4,sev:"info",icon:"post",tag:["info","Mail"],t:(m.fromName||m.from||"")+": „"+(m.subject||"(kein Betreff)")+"“",d:F.ago(m.date)+" · ungelesen",acts:[["Lesen","mail:"+m.id,"primary"]]}); });
  (D.todos||[]).filter(function(t){ return !t.done && t.due && t.due<=today; }).forEach(function(t){ out.push({id:"todo:"+t.id,rank:t.due<today?2:4,sev:t.due<today?"bad":"ok",icon:"check",tag:[t.due<today?"bad":"ok",t.due<today?"Überfällig":"Heute"],t:t.text||"Aufgabe",d:"To-Do · fällig "+de(t.due),acts:[["Erledigt","tododone:"+t.id]]}); });
  /* Bankumsätze & Entwürfe: Feed kommt aus sevdesk.js */
  return out;
});

F.todoList=function(arr){ var t=F.D.today; return arr.length?arr.map(function(x){ return '<div class="tdrow"><input type="checkbox" data-todo="'+esc(x.id)+'"'+(x.done?" checked":"")+' aria-label="Erledigt"><button type="button" class="todo-t" data-act="todoedit:'+esc(x.id)+'">'+esc(x.text||"")+(x.due?' <span class="due'+(!x.done&&x.due<t?" late":"")+'">'+(!x.done&&x.due<t?"überfällig · ":"")+de(x.due)+'</span>':'')+(x.notes?' <span class="due">· Notiz</span>':'')+'</button></div>'; }).join(""):'<div class="empty">Keine offenen To-Dos.</div>'; };
F.todoAdd=function(){ return '<form class="todo-add" data-form="todo"><input class="f" name="text" placeholder="Neues To-Do …" aria-label="Neues To-Do" required><input class="f" type="date" name="due" aria-label="Fällig am" style="max-width:150px"><button class="btn primary" type="submit" aria-label="To-Do anlegen">+</button></form>'; };
F.form("todo",function(f){ var txt=f.text.value.trim(); if(!txt) return; F.addTodo({text:txt,due:f.due.value||""}).then(function(){ F.toast("To-Do angelegt"); }); });
F.listen("change","[data-todo]",function(el){ var id=el.getAttribute("data-todo"), on=el.checked; F.todosPost(F.D.todos.map(function(x){ return x.id===id?Object.assign({},x,{done:on,doneAt:on?Date.now():null}):x; })).then(function(){ if(on) F.toast("Erledigt",false,"Rückgängig",function(){ F.todosPost(F.D.todos.map(function(x){ return x.id===id?Object.assign({},x,{done:false}):x; })); }); }); });
F.action("tododone",function(id){ F.todosPost(F.D.todos.map(function(t){ return t.id===id?Object.assign({},t,{done:true,doneAt:Date.now()}):t; })).then(function(){ F.toast("Erledigt"); }); });

F.view({id:"heute",label:"Heute",short:"Heute",icon:"heute",order:10,mobile:true,
  count:function(){ return F.feedItems().length; },
  render:function(){
    var D=F.D, f=F.feedItems(), today=D.today, h=new Date().getHours(), UI=F.UI;
    var greet=h<11?"Guten Morgen":h<17?"Hallo":"Guten Abend";
    var shown=UI.feedAll?f:f.slice(0,12);
    var items=shown.map(function(x){ return '<li class="item"><span class="sev '+x.sev+'"></span><span class="ico">'+F.svg(x.icon)+'</span><div style="min-width:0"><div class="t"><span class="tag '+x.tag[0]+'">'+esc(x.tag[1])+'</span>'+esc(x.t)+'</div><div class="d">'+esc(x.d)+'</div></div><div class="acts">'+x.acts.map(function(a){ return '<button class="btn '+(a[2]||"")+'" data-act="'+esc(a[1])+'">'+esc(a[0])+'</button>'; }).join("")+'<button class="btn icon" data-snooze="'+esc(x.id)+'" title="Bis morgen ausblenden" aria-label="Bis morgen ausblenden">✕</button></div></li>'; }).join("");
    var ab=D.abgleich.totals, sev=D.sev, cust=(D.sites||[]).filter(function(s){return !s.own&&s.active;}), bad=cust.filter(F.siteBad);
    /* alle Kalender (Dashboard, Mail-Kalender, alle iCloud-Kalender) + Fotobox-Buchungen; heute + die nächsten Termine */
    var bz=((D.platforms&&D.platforms.blitzdings&&D.platforms.blitzdings.upcoming)||[]).map(function(b){ var d=String(b.eventDate||"").slice(0,10); return {id:"bz_"+b.id,title:"Fotobox: "+(b.customerName||"Buchung")+(b.package?" · "+b.package:""),date:d,time:String(b.eventDate||"").slice(11,16).replace(/^00:00$/,""),location:b.location||"",cal:"Blitzdings"}; });
    var allEv=D.events.concat(bz.filter(function(b){ return /^\d{4}-\d{2}-\d{2}$/.test(b.date); })).filter(function(e){ return e.date>=today; }).sort(function(a,b){ return (a.date+(a.time||"")).localeCompare(b.date+(b.time||"")); });
    var todayEv=allEv.filter(function(e){return e.date===today;}), nextEv=allEv.slice(0,Math.max(8,todayEv.length+5));
    var openTodos=(D.todos||[]).filter(function(t){return !t.done;}).sort(function(a,b){ return String(a.due||"9999").localeCompare(String(b.due||"9999")); });
    var dateLine=new Date().toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    /* Termine nach Tagen gruppieren: Heute, Morgen, dann Wochentag + Datum */
    var dayName=function(d){ if(d===today) return "Heute"; var t1=new Date(today+"T12:00:00"); t1.setDate(t1.getDate()+1); if(d===F.ymd(t1)) return "Morgen"; return new Date(d+"T12:00:00").toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"numeric"}); };
    var grp=[], lastD=null; nextEv.forEach(function(e){ if(e.date!==lastD){ grp.push({d:e.date,list:[]}); lastD=e.date; } grp[grp.length-1].list.push(e); });
    if(!todayEv.length) grp.unshift({d:today,list:[]});
    var agenda=grp.map(function(g){ return '<div class="hday"><div class="hday-h'+(g.d===today?" today":"")+'">'+esc(dayName(g.d))+'</div>'+
      (g.list.length?g.list.map(function(e){ return '<div class="hev"><span class="ht">'+esc(e.time||"ganztags")+'</span><span class="hb"></span><div style="min-width:0"><b>'+esc(e.title)+'</b>'+((e.location||e.cal)?'<small>'+esc([e.location||"",e.cal||""].filter(Boolean).join(" · "))+'</small>':'')+'</div></div>'; }).join(""):'<div class="hnone">Keine Termine</div>')+'</div>'; }).join("");
    return F.head(greet+", Simon.",esc(dateLine)+(f.length?" · "+f.length+(f.length===1?" Sache offen":" Sachen offen"):" · alles erledigt"),
      '<button class="btn" data-act="compose">Neue Mail</button><button class="btn" data-act="newevent:">Neuer Termin</button><button class="btn primary" data-act="newinvoice">Neue Rechnung</button>')+
    '<div class="day">'+
      '<button data-go="kunden"><span class="k">Neue Anfragen</span><span class="v num">'+F.newLeads().length+'</span><span class="s">'+D.leads.length+' Leads insgesamt</span></button>'+
      '<button data-go="geld"><span class="k">Offen in sevDesk</span><span class="v num">'+(sev?eur0(sev.openSum):"—")+'</span><span class="s">'+(sev?(sev.overdueCount?eur0(sev.overdueSum)+" überfällig":"nichts überfällig"):"sevDesk lädt …")+'</span></button>'+
      '<button data-go="geld"><span class="k">Zu verrechnen</span><span class="v num">'+eur0(ab.unbilled)+'</span><span class="s">'+ab.unbilledCount+' Posten ohne Rechnung</span></button>'+
      '<button data-go="web"><span class="k">Websites</span><span class="v num">'+(cust.length-bad.length)+'/'+cust.length+'</span><span class="s">'+(bad.length?bad.length+" mit Problem":"alle erreichbar")+'</span></button>'+
    '</div>'+
    '<div class="hgrid">'+
      '<section class="panel hcol-todo"><div class="panel-h"><h2>Zu erledigen</h2><span class="muted">'+(f.length?f.length+" offen":"")+'</span></div>'+
        (items?'<ul class="feed">'+items+'</ul>':'<div class="empty">Nichts offen. 🎉</div>')+
        (f.length>12?'<button class="more" data-act="togglefeed">'+(UI.feedAll?"Weniger anzeigen":"Alle "+f.length+" anzeigen")+'</button>':'')+
      '</section>'+
      '<div class="stack">'+
        '<section class="panel"><div class="panel-h"><h2>Mein Tag</h2><button class="link" data-go="kal">Kalender →</button></div><div class="hagenda">'+agenda+'</div></section>'+
        '<section class="panel"><div class="panel-h"><h2>To-Dos</h2><button class="link" data-go="kal">Alle →</button></div>'+F.todoList(openTodos.slice(0,8))+F.todoAdd()+'</section>'+
      '</div>'+
      '<div class="stack">'+mailPanel()+incomePanel()+'</div>'+
    '</div>';
  }
});
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
".hgrid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}"+
"@media (max-width:1280px){.hgrid{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}.hgrid>.stack:last-child{grid-column:2}}"+
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
  ".view-heute .head h1{font-size:26px}"+
  ".view-heute .day{border:0;box-shadow:var(--shadow);border-radius:8px}"+
  ".view-heute .day button{padding:12px 16px}.view-heute .day .v{font-size:22px}"+
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
F.action("togglefeed",function(){ F.UI.feedAll=!F.UI.feedAll; F.render(); });
})();
