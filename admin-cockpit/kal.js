(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort, svg=F.svg, head=F.head, UI=F.UI, ago=F.ago, dayLabel=F.dayLabel;
function D_(){ return F.D; }
/* Grundgerüst – wird zum vollen Funktionsumfang ausgebaut. */

F.form("event",function(f){ var ev={title:f.title.value.trim(),date:f.date.value,time:f.time.value||"",location:f.location.value.trim()};
  if(f.target.value==="icloud"){ F.api("/admin/api/private-cal",{body:{op:"create",event:ev}}).then(function(j){ if(j&&j.ok){ F.toast("Termin im iCloud-Kalender angelegt"); F.load(true); } else F.toast("iCloud: "+((j&&j.error)==="not_configured"?"nicht verbunden – in den Einstellungen einrichten":(j&&j.error)||"Fehler"),true); }); }
  else { F.api("/admin/api/events").then(function(cur){ var arr=(cur&&cur.events)||[]; return F.api("/admin/api/events",{body:{events:arr.concat([{id:"e"+Date.now().toString(36),title:ev.title,date:ev.date,time:ev.time,location:ev.location,source:"manual",sparte:"fs"}]),base:arr}}); }).then(function(j){ if(j&&j.ok){ F.toast("Termin angelegt"); F.load(true); } else F.toast("Speichern fehlgeschlagen",true); }); } });
function vKal(){
  var byDay={}; F.D.events.forEach(function(e){ (byDay[e.date]=byDay[e.date]||[]).push(e); });
  var days=Object.keys(byDay).sort().slice(0,21);
  var open=(F.D.todos||[]).filter(function(t){return !t.done;}).sort(function(a,b){ return String(a.due||"9999").localeCompare(String(b.due||"9999")); });
  var done=(F.D.todos||[]).filter(function(t){return t.done;}).slice(-8).reverse();
  return head("Kalender & To-Dos","iCloud, Dashboard-Termine und To-Dos zusammen. Die nächsten 60 Tage.")+
  '<div class="two"><section class="panel"><div class="panel-h"><h2>Termine</h2></div>'+(days.length?days.map(function(d){ return '<div class="dayhead">'+esc(F.dayLabel(d,F.D.today))+'</div><ul class="agenda">'+byDay[d].map(function(e){ return '<li><span class="time">'+esc(e.time||"ganztags")+'</span><div><div style="font-weight:600">'+esc(e.title)+'</div><div class="muted">'+esc([e.endTime?"bis "+e.endTime:"",e.location||"",{icloud:"iCloud",manuell:"Dashboard",kalender:"Kalender"}[e.source]||""].filter(Boolean).join(" · "))+'</div></div></li>'; }).join("")+'</ul>'; }).join(""):'<div class="empty">Keine Termine in den nächsten 60 Tagen.</div>')+
    '<form class="panel-b" data-form="event" style="display:grid;gap:10px;border-top:1px solid var(--line)"><div class="sec-t" style="margin:0">Neuer Termin</div><input class="f" name="title" placeholder="Titel" required aria-label="Titel"><div class="grid2"><input class="f" type="date" name="date" required value="'+F.D.today+'" aria-label="Datum"><input class="f" type="time" name="time" aria-label="Uhrzeit"></div><input class="f" name="location" placeholder="Ort (optional)" aria-label="Ort"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select class="f" name="target" style="max-width:220px" aria-label="Kalender"><option value="icloud">iCloud-Kalender</option><option value="manuell">Nur im Dashboard</option></select><button class="btn primary" type="submit">Termin anlegen</button></div></form></section>'+
  '<section class="panel"><div class="panel-h"><h2>To-Dos</h2><span class="muted">'+open.length+' offen</span></div>'+F.todoList(open)+F.todoAdd()+(done.length?'<div class="dayhead">Zuletzt erledigt</div>'+F.todoList(done):'')+'</section></div>';
}

F.view({id:"kal",label:"Kalender & To-Dos",short:"Kalender",icon:"kal",order:50,mobile:false,render:vKal});
})();
