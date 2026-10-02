/* Blitzdings: Verfügbarkeitskalender + Buchung anlegen (Teil der Ansicht Plattformen → Blitzdings, eingebunden in plat.js).
   Daten kommen live aus Blitzdings über /admin/api/blitz/* (Proxy in server.js, Token bleibt am Server).
   Buchungen werden IN Blitzdings angelegt (gleiche Preis-/Belegungslogik wie online) und erscheinen danach
   in Blitzdings, im Google-Kalender von Blitzdings, hier im Kalender und unter Heute → Nächste Termine.
   Optional pro Buchung: iCloud-Termin (/admin/api/private-cal) und Rechnungsentwurf (F.openInvoice). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, de=F.de;

var S={ month:null, data:null, key:"", loading:false, err:"", cat:null, catErr:"", catLoading:false };
var TYPE_LABEL={MINI:"Mini",BUSINESS:"Business",VIDEO360:"360°"};
var ST_LABEL={CONFIRMED:"bestätigt",PENDING:"Zahlung läuft",COMPLETED:"erledigt",CANCELLED:"storniert"};
var WD=["Mo","Di","Mi","Do","Fr","Sa","So"];

F.css(
'.bk-cal{padding:12px 14px 16px}'+
'.bk-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'+
'.bk-nav h3{font-size:16px;min-width:150px;text-align:center}'+
'.bk-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-top:10px}'+
'.bk-wd{font-size:11.5px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;text-align:center;padding:2px 0}'+
'.bk-day{min-height:78px;border:1px solid var(--line);border-radius:9px;padding:5px 6px;display:grid;align-content:start;gap:3px;background:var(--panel);text-align:left;font:inherit;color:inherit;cursor:pointer;min-width:0}'+
'.bk-day:hover{border-color:var(--ink-3)}'+
'.bk-day.out{opacity:.45}'+
'.bk-day.past{background:var(--sunk)}'+
'.bk-day.full{background:var(--warn-soft)}'+
'.bk-day.blk{background:var(--bad-soft)}'+
'.bk-day.today{box-shadow:inset 0 0 0 2px var(--info)}'+
'.bk-day .bk-n{font-size:12.5px;font-weight:600;display:flex;justify-content:space-between;align-items:center;gap:4px}'+
'.bk-day.today .bk-n b{background:var(--info);color:#fff;border-radius:99px;padding:0 6px}'+
'.bk-types{display:flex;gap:3px}'+
'.bk-types i{display:block;width:100%;height:5px;border-radius:3px;background:var(--ok)}'+
'.bk-types i.booked{background:var(--warn)} .bk-types i.blocked{background:var(--bad)}'+
'.bk-chip{display:block;font-size:11.5px;line-height:1.3;padding:1px 5px;border-radius:5px;background:var(--warn-soft);color:var(--warn);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:0;font-family:inherit;text-align:left;cursor:pointer;width:100%}'+
'.bk-chip.blk{background:var(--bad-soft);color:var(--bad)} .bk-chip.paid{background:var(--ok-soft);color:var(--ok)} .bk-chip.soft{background:var(--sunk);color:var(--ink-2)}'+
'.bk-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2);margin-top:10px}'+
'.bk-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}'+
'.bk-form .chk{display:flex;gap:8px;align-items:center;font-size:14px}'+
'.bk-form .chk input{width:17px;height:17px;accent-color:var(--ok);flex:none}'+
'.bk-ex{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}'+
'.bk-price{font-family:var(--f-mono);font-weight:700;font-size:17px}'+
'.bk-warn{padding:8px 10px;border-radius:8px;background:var(--warn-soft);color:var(--warn);font-size:13.5px}'+
'.bk-warn.bad{background:var(--bad-soft);color:var(--bad)}'+
'.bk-dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 14px;font-size:14px;margin:0}'+
'.bk-dl dt{color:var(--ink-2)} .bk-dl dd{margin:0;overflow-wrap:anywhere}'+
'@media (max-width:720px){.bk-day{min-height:52px;padding:4px}.bk-chip{display:none}.bk-day .bk-cnt{display:inline}.bk-nav h3{min-width:0}}'+
'.bk-cnt{display:none;font-size:11px;color:var(--warn)}'
);

/* ---------- Datum ---------- */
function pad(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function today(){ return (F.D&&F.D.today)||ymd(new Date()); }
function addDays(iso,n){ var d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return ymd(d); }
function daysBetween(a,b){ return Math.round((Date.parse(b+"T12:00:00")-Date.parse(a+"T12:00:00"))/86400000); }
function monthRange(m){ var first=new Date(m+"-01T12:00:00"), wd=(first.getDay()+6)%7, start=addDays(ymd(first),-wd);
  var last=new Date(first.getFullYear(),first.getMonth()+1,0,12), wd2=(last.getDay()+6)%7, end=addDays(ymd(last),6-wd2); return {from:start,to:end}; }
function monthLabel(m){ return new Date(m+"-01T12:00:00").toLocaleDateString("de-AT",{month:"long",year:"numeric"}); }
function c2e(v){ return (+v||0)/100; }

/* ---------- Laden ---------- */
function load(force){
  if(!S.month) S.month=today().slice(0,7);
  var r=monthRange(S.month), key=r.from+"_"+r.to;
  if(S.loading===key||(!force&&S.key===key&&S.data)) return;
  S.loading=key; S.err="";
  F.api("/admin/api/blitz/availability?from="+r.from+"&to="+r.to).then(function(j){
    if(S.loading!==key) return;            /* inzwischen anderer Monat gewählt */
    S.loading=false;
    if(!j||j.ok===false) S.err=(j&&j.error)||"Fehler";
    else { S.data=j; S.key=key; }
    if(F.current==="plat"&&F.UI.plat==="blitz") F.render();
  }).catch(function(){ if(S.loading!==key) return; S.loading=false; S.err="Keine Verbindung"; if(F.current==="plat") F.render(); });
}
function loadCat(cb,force){
  if(S.cat&&!force){ if(cb) cb(S.cat); return; }
  if(S.catLoading){ return; }
  S.catLoading=true;
  F.api("/admin/api/blitz/catalog"+(force?"?force=1":"")).then(function(j){
    S.catLoading=false;
    if(!j||j.ok===false){ S.catErr=(j&&j.error)||"Fehler"; F.toast("Blitzdings-Pakete nicht ladbar: "+S.catErr,true); return; }
    S.cat=j; S.catErr=""; if(cb) cb(j);
  }).catch(function(){ S.catLoading=false; F.toast("Keine Verbindung zu Blitzdings",true); });
}
function refreshAll(){ S.key=""; load(true); setTimeout(function(){ F.load(true); },300); }

function bookingById(id){ return S.data&&(S.data.bookings||[]).find(function(b){ return b.id===id; }); }
function bookingsOn(iso){
  if(!S.data) return [];
  return (S.data.bookings||[]).filter(function(b){ var e=b.eventEndDate||b.eventDate; return b.eventDate<=iso&&e>=iso; });
}
function blockedOn(iso){ return S.data?(S.data.blocked||[]).filter(function(b){ return b.date===iso; }):[]; }
function types(){ return ((S.data&&S.data.resources)||[{type:"MINI"},{type:"BUSINESS"},{type:"VIDEO360"}]).map(function(r){ return r.type; }); }

/* ---------- Kalender ---------- */
F.blitzKal=function(){
  if(!S.month) S.month=today().slice(0,7);
  var r=monthRange(S.month), t=today(), ty=types();
  var head='<div class="bk-nav"><button class="btn icon" data-act="bkm:-1" aria-label="Vormonat">‹</button><h3>'+esc(monthLabel(S.month))+'</h3><button class="btn icon" data-act="bkm:1" aria-label="Nächster Monat">›</button>'+
    '<button class="btn" data-act="bkm:0">Heute</button><span style="flex:1"></span>'+
    (S.loading?'<span class="muted">Lade …</span>':'')+
    '<button class="btn primary" data-act="bknew:">+ Buchung anlegen</button></div>';
  var body;
  if(S.err&&!S.data) body='<div class="empty">Kalender nicht ladbar: '+esc(S.err)+(S.err==="unauthorized"?' – Token in Blitzdings (COCKPIT_TOKEN/STATS_TOKEN) prüfen.':'')+' <button class="btn" data-act="bkm:r">Erneut</button></div>';
  else if(!S.data) body='<div class="empty">Lade Verfügbarkeit …</div>';
  else {
    var cells=WD.map(function(w){ return '<div class="bk-wd">'+w+'</div>'; }).join("");
    for(var d=r.from; d<=r.to; d=addDays(d,1)){
      var st=(S.data.days||{})[d]||{}, bs=bookingsOn(d), bl=blockedOn(d);
      var states=ty.map(function(x){ return st[x]||"free"; });
      var allBlk=states.every(function(s){ return s==="blocked"; }), full=states.every(function(s){ return s!=="free"; });
      var cls="bk-day"+(d.slice(0,7)!==S.month?" out":"")+(d<t?" past":"")+(d===t?" today":"")+(allBlk?" blk":full?" full":"");
      var title=ty.map(function(x,i){ return (TYPE_LABEL[x]||x)+": "+({free:"frei",booked:"gebucht",blocked:"gesperrt"})[states[i]]; }).join(" · ");
      cells+='<div class="'+cls+'" role="button" tabindex="0" data-bkday="'+d+'" title="'+esc(title)+'">'+
        '<div class="bk-n"><b>'+(+d.slice(8))+'</b>'+(bs.length?'<span class="bk-cnt">'+bs.length+'</span>':'')+'</div>'+
        '<div class="bk-types">'+states.map(function(s){ return '<i class="'+s+'"></i>'; }).join("")+'</div>'+
        bs.slice(0,3).map(function(b){ return '<button type="button" class="bk-chip'+(!b.blocking?" soft":b.paymentStatus==="PAID"?" paid":"")+'" data-act="bkshow:'+esc(b.id)+'" title="'+esc((b.customerName||"")+" · "+(b.package&&b.package.name||""))+'">'+esc(b.customerName||b.reference)+'</button>'; }).join("")+
        (bs.length>3?'<span class="muted" style="font-size:11px">+'+(bs.length-3)+' weitere</span>':'')+
        bl.map(function(x){ return '<span class="bk-chip blk">Gesperrt'+(x.type?" ("+esc(TYPE_LABEL[x.type]||x.type)+")":"")+'</span>'; }).join("")+
      '</div>';
    }
    body='<div class="bk-grid">'+cells+'</div>'+
      '<div class="bk-legend"><span>Balken je Box: '+ty.map(function(x){ return esc(TYPE_LABEL[x]||x); }).join(" · ")+'</span><span><i style="background:var(--ok)"></i>frei</span><span><i style="background:var(--warn)"></i>gebucht</span><span><i style="background:var(--bad)"></i>gesperrt</span><span><i style="box-shadow:inset 0 0 0 2px var(--info)"></i>heute</span></div>';
  }
  return '<section class="panel"><div class="panel-h"><h2>Verfügbarkeit &amp; Buchungen</h2><span class="muted">live aus Blitzdings · Tag anklicken</span></div><div class="bk-cal">'+head+body+'</div></section>';
};
F.blitzKalAfter=function(){ load(false); };

F.action("bkm",function(v){
  if(v==="r"){ S.key=""; load(true); F.render(); return; }
  var n=+v; if(!n) S.month=today().slice(0,7);
  else { var d=new Date(S.month+"-01T12:00:00"); d.setMonth(d.getMonth()+n); S.month=ymd(d).slice(0,7); }
  S.key=""; S.data=null; load(true); F.render();
});
function openDay(iso){
  var bs=bookingsOn(iso), bl=blockedOn(iso);
  if(!bs.length&&!bl.length&&iso>=today()){ openForm({eventDate:iso}); return; }
  var st=(S.data&&S.data.days||{})[iso]||{};
  F.modal('<div class="row-between"><h2 style="font-size:19px">'+esc(F.dayLabel(iso,today()))+' · '+de(iso)+'</h2>'+F.btnClose()+'</div>'+
    '<dl class="bk-dl" style="margin:10px 0">'+types().map(function(x){ return '<dt>'+esc(TYPE_LABEL[x]||x)+'</dt><dd>'+({free:'<span class="tag ok">frei</span>',booked:'<span class="tag warn">gebucht</span>',blocked:'<span class="tag bad">gesperrt</span>'})[st[x]||"free"]+'</dd>'; }).join("")+'</dl>'+
    (bs.length?'<div class="sec-t">Buchungen</div>'+bs.map(function(b){ return '<button type="button" class="btn" style="display:flex;width:100%;justify-content:space-between;margin-bottom:6px" data-act="bkshow:'+esc(b.id)+'"><span>'+esc(b.customerName)+' · '+esc(b.package.name)+'</span><span class="tag '+(b.blocking?"warn":"grey")+'">'+esc(ST_LABEL[b.status]||b.status)+'</span></button>'; }).join(""):'')+
    (bl.length?'<div class="sec-t">Gesperrt</div>'+bl.map(function(x){ return '<div class="row-between" style="margin-bottom:6px"><span>'+(x.type?esc(TYPE_LABEL[x.type]||x.type):"Alle Boxen")+(x.reason?' – '+esc(x.reason):'')+'</span><button class="btn" data-act="bkunblock:'+esc(x.id)+'">Freigeben</button></div>'; }).join(""):'')+
    '<div class="foot"><span class="row"><button class="btn" data-act="bkblock:'+iso+'">Tag sperren</button></span><span class="row"><button class="btn" data-closemodal>Schließen</button>'+(iso>=today()?'<button class="btn primary" data-act="bknew:'+iso+'">Buchung anlegen</button>':'')+'</span></div>',"narrow");
}
F.listen("click","[data-bkday]",function(el,e){ if(e.target.closest("[data-act]")) return; openDay(el.getAttribute("data-bkday")); });
F.listen("keydown","[data-bkday]",function(el,e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openDay(el.getAttribute("data-bkday")); } });

/* ---------- Sperren ---------- */
F.action("bkblock",function(iso){
  F.modal('<form data-form="bkblock" class="stackf"><div class="row-between"><h2 style="font-size:19px">'+de(iso)+' sperren</h2>'+F.btnClose()+'</div>'+
    '<input type="hidden" name="date" value="'+esc(iso)+'"><label class="fl">Box<select class="f" name="type"><option value="">Alle Boxen</option>'+types().map(function(x){ return '<option value="'+x+'">'+esc(TYPE_LABEL[x]||x)+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Grund (optional)<input class="f" name="reason" placeholder="z. B. Urlaub, Wartung"></label><div class="err" id="bkbErr"></div>'+
    '<div class="foot"><span class="muted">Gesperrte Tage sind online nicht buchbar.</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Sperren</button></span></div></form>',"narrow");
});
F.form("bkblock",function(f){
  var btn=f.querySelector("[type=submit]"); btn.disabled=true;
  F.api("/admin/api/blitz/block",{body:{date:f.date.value,type:f.type.value,reason:f.reason.value.trim()}}).then(function(j){
    if(!j||j.ok===false){ btn.disabled=false; document.getElementById("bkbErr").textContent="Nicht gespeichert: "+((j&&j.error)||"Fehler"); return; }
    F.closeModal(); F.toast(de(f.date.value)+" in Blitzdings gesperrt"); refreshAll();
  });
});
F.action("bkunblock",function(id){
  F.api("/admin/api/blitz/unblock",{body:{id:id}}).then(function(j){
    if(!j||j.ok===false){ F.toast("Nicht freigegeben: "+((j&&j.error)||"Fehler"),true); return; }
    F.closeModal(); F.toast("Tag wieder freigegeben"); refreshAll();
  });
});

/* ---------- Details ---------- */
function addr(b){ return [b.billingStreet,[b.billingZip,b.billingCity].filter(Boolean).join(" ")].filter(Boolean).join(", "); }
function showBooking(b,fresh){
  var range=de(b.eventDate)+(b.eventEndDate&&b.eventEndDate!==b.eventDate?" – "+de(b.eventEndDate):"");
  var rows=[["Termin",range],["Paket",b.package.name],["Status",(ST_LABEL[b.status]||b.status)+(b.blocking?"":" (belegt keine Box)")],["Zahlung",(b.paymentStatus==="PAID"?"bezahlt":b.paymentStatus==="REFUNDED"?"erstattet":"offen")+(b.paymentMethod==="INVOICE"?" · auf Rechnung":" · online")],
    ["Betrag",eur(c2e(b.totalCents))],["Kunde",b.customerName+(b.companyName?" ("+b.companyName+")":"")],["E-Mail",b.customerEmail],["Telefon",b.customerPhone],["Ort",b.eventLocation],["Adresse",addr(b)],
    ["Extras",(b.extras||[]).map(function(e){ return e.name; }).join(", ")],["Notiz",b.note],["Referenz",b.reference+" · Quelle: "+(b.source||"web")],["sevDesk",b.sevdeskInvoiceId?"Rechnung aus Blitzdings vorhanden":""]].filter(function(r){ return r[1]; });
  var canInv=!!F.D.sev&&!b.sevdeskInvoiceId&&+b.totalCents>0;
  F.modal('<div class="row-between"><h2 style="font-size:19px">'+(fresh?"Buchung angelegt · ":"")+esc(b.customerName)+'</h2>'+F.btnClose()+'</div>'+
    (fresh?'<p class="muted" style="margin:6px 0 0">Gespeichert in Blitzdings ('+esc(b.reference)+'). Steht damit im Blitzdings-Admin, im Google-Kalender von Blitzdings, hier im Kalender und unter Heute.</p>':'')+
    '<dl class="bk-dl" style="margin:12px 0">'+rows.map(function(r){ return '<dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd>'; }).join("")+'</dl>'+
    '<div class="sec-t">Weiter eintragen (optional)</div><div class="row wrap" style="gap:8px">'+
      '<button class="btn" data-act="bkical:'+esc(b.id)+'">In iCloud-Kalender eintragen</button>'+
      '<button class="btn" data-act="bkinv:'+esc(b.id)+'~full"'+(canInv?'':' disabled title="'+(b.sevdeskInvoiceId?"Blitzdings hat bereits eine Rechnung erstellt":"sevDesk ist gerade nicht erreichbar")+'"')+'>Rechnung in sevDesk vorbereiten</button>'+
      '<button class="btn" data-act="bkinv:'+esc(b.id)+'~dep"'+(canInv?'':' disabled')+'>Anzahlung 50 % vorbereiten</button>'+
    '</div>'+
    '<div class="foot"><span class="row">'+(b.status!=="CANCELLED"?'<button class="btn danger" data-act="bkcancel:'+esc(b.id)+'">Stornieren</button>':'<button class="btn" data-act="bkrestore:'+esc(b.id)+'">Storno aufheben</button>')+
      '<button class="btn" data-act="bkpaid:'+esc(b.id)+'">'+(b.paymentStatus==="PAID"?"Auf offen":"Als bezahlt")+'</button></span>'+
      '<span class="row"><a class="btn" href="https://www.blitzdings.co.at/admin/buchungen/'+encodeURIComponent(b.id)+'" target="_blank" rel="noopener">In Blitzdings ↗</a><button class="btn primary" data-closemodal>Fertig</button></span></div>',"narrow");
}
F.action("bkshow",function(id){ var b=bookingById(id); if(b) showBooking(b); });
function setStatus(id,body,msg){
  F.api("/admin/api/blitz/booking-status",{body:Object.assign({id:id},body)}).then(function(j){
    if(!j||j.ok===false){ F.toast("Blitzdings hat nicht gespeichert: "+((j&&j.error)||"Fehler"),true); return; }
    F.closeModal(); F.toast(msg); refreshAll();
  }).catch(function(){ F.toast("Keine Verbindung",true); });
}
F.action("bkcancel",function(id){ var b=bookingById(id); if(!b) return; F.confirm("Buchung "+b.reference+" ("+b.customerName+") stornieren? Der Tag wird wieder frei, der Google-Termin entfernt. Der Kunde bekommt keine Mail.","Stornieren",function(){ setStatus(id,{status:"CANCELLED"},"Buchung storniert"); },true); });
F.action("bkrestore",function(id){ setStatus(id,{status:"CONFIRMED"},"Storno aufgehoben"); });
F.action("bkpaid",function(id){ var b=bookingById(id); if(b) setStatus(id,{paymentStatus:b.paymentStatus==="PAID"?"UNPAID":"PAID"},b.paymentStatus==="PAID"?"Wieder auf offen":"Als bezahlt markiert"); });

/* iCloud: gleicher Weg wie „Privater Termin“ (privateCalWrite create) */
F.action("bkical",function(id,el){
  var b=bookingById(id)||LAST[id]; if(!b) return;
  var time=(String(b.note||"").match(/Uhrzeit:\s*(\d{2}:\d{2})/)||[])[1]||"";
  var ev={title:"Fotobox: "+b.customerName+" · "+b.package.name,date:b.eventDate,time:time,endTime:"",location:b.eventLocation||"",
    notes:["Blitzdings "+b.reference,b.eventEndDate&&b.eventEndDate!==b.eventDate?"bis "+de(b.eventEndDate):"",b.customerPhone?"Tel. "+b.customerPhone:"",b.customerEmail,(b.extras||[]).map(function(e){return e.name;}).join(", "),b.note].filter(Boolean).join("\n")};
  if(el) el.disabled=true;
  F.api("/admin/api/private-cal",{body:{op:"create",event:ev}}).then(function(j){
    if(j&&j.ok){ F.toast("Im iCloud-Kalender eingetragen"); if(el) el.textContent="✓ Im iCloud-Kalender"; }
    else { if(el) el.disabled=false; var e=String(j&&j.error||""); F.toast(/not_configured/.test(e)?"iCloud-Kalender ist nicht verbunden (Einstellungen).":"iCloud: "+(e||"Fehler"),true); }
  }).catch(function(){ if(el) el.disabled=false; F.toast("Keine Verbindung",true); });
});

/* Rechnung/Anzahlung: bestehender Entwurfs-Flow (sevDesk, Abrechnungs-Historie wie „Rechnung“ bei Nächste Termine) */
F.action("bkinv",function(v){
  var x=String(v).split("~"), b=bookingById(x[0])||LAST[x[0]]; if(!b) return;
  if(!F.D.sev){ F.toast("sevDesk ist gerade nicht erreichbar",true); return; }
  var dep=x[1]==="dep", txt=[de(b.eventDate)?"Event am "+de(b.eventDate)+(b.eventEndDate&&b.eventEndDate!==b.eventDate?" – "+de(b.eventEndDate):""):"",b.eventLocation?"Ort: "+b.eventLocation:""].filter(Boolean).join(" · ");
  var items;
  if(dep) items=[{name:"Anzahlung 50 % – Blitzdings "+b.package.name,text:"Buchung "+b.reference+(txt?" · "+txt:""),qty:1,priceGross:Math.round(b.totalCents/2)/100,taxRate:20}];
  else {
    var exSum=(b.extras||[]).reduce(function(s,e){ return s+(+e.priceCents||0); },0);
    items=[{name:"Blitzdings "+b.package.name,text:txt,qty:1,priceGross:c2e(b.totalCents-exSum),taxRate:20}].concat((b.extras||[]).map(function(e){ return {name:e.name,text:"",qty:1,priceGross:c2e(e.priceCents),taxRate:20}; }));
  }
  F.openInvoice({title:(dep?"Anzahlung":"Rechnung")+" · Blitzdings-Buchung",contactName:b.companyName||b.customerName,email:b.customerEmail,
    address:[b.companyName||b.customerName,b.billingStreet,[b.billingZip,b.billingCity].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
    deliveryDate:b.eventDate,headText:"Buchung "+b.reference+" – vielen Dank für Ihre Buchung bei Blitzdings.",items:items,
    after:{billing:{key:"blitz:"+b.id,label:b.customerName+" · "+b.reference+(dep?" (Anzahlung)":"")}}});
});

/* ---------- Formular ---------- */
var LAST={};   // frisch angelegte Buchungen (für Folgeaktionen, bevor der Kalender neu geladen ist)
F.action("bknew",function(iso){ F.closeModal(); openForm({eventDate:iso||""}); });
function openForm(pre){
  loadCat(function(cat){ renderForm(cat,pre||{}); });
  if(!S.cat) F.modal('<div class="empty">Lade Pakete aus Blitzdings …</div>',"narrow");
}
function renderForm(cat,pre){
  var pk=(cat.packages||[]).filter(function(p){ return p.active; });
  F.modal('<form data-form="bkbook" class="stackf bk-form" novalidate><div class="row-between"><h2 style="font-size:20px">Blitzdings-Buchung anlegen</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Wird direkt in Blitzdings gespeichert – gleiche Preise und Belegungsprüfung wie online, Status „bestätigt“.</p>'+
    '<div class="grid2"><label class="fl">Datum<input class="f" name="eventDate" type="date" required value="'+esc(pre.eventDate||"")+'"></label>'+
    '<label class="fl">Bis (mehrtägig, optional)<input class="f" name="eventEndDate" type="date"></label>'+
    '<label class="fl">Paket<select class="f" name="packageSlug" required>'+pk.map(function(p){ return '<option value="'+esc(p.slug)+'"'+(pre.packageSlug===p.slug?" selected":"")+'>'+esc(p.name)+' – '+esc(eur(c2e(p.priceCents)))+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Uhrzeit (optional)<input class="f" name="eventTime" type="time"></label></div>'+
    '<div id="bkAvail"></div>'+
    '<label class="fl">Veranstaltungsort<input class="f" name="eventLocation" placeholder="z. B. Gasthof Krone, Schruns"></label>'+
    '<div><div class="sec-t">Extras</div><div class="bk-ex" id="bkEx"></div></div>'+
    '<div class="sec-t">Kunde</div>'+
    '<div class="grid2"><label class="fl">Name<input class="f" name="customerName" required autocomplete="off"></label><label class="fl">E-Mail<input class="f" name="customerEmail" type="email" required autocomplete="off"></label>'+
    '<label class="fl">Telefon<input class="f" name="customerPhone" type="tel" autocomplete="off"></label><label class="fl">Kundentyp<select class="f" name="customerType"><option value="PRIVATE">Privat</option><option value="COMPANY">Firma</option></select></label>'+
    '<label class="fl bk-co" hidden>Firmenname<input class="f" name="companyName"></label><label class="fl bk-co" hidden>UID-Nummer<input class="f" name="vatId"></label>'+
    '<label class="fl">Straße<input class="f" name="billingStreet"></label><span class="grid2" style="gap:10px"><label class="fl">PLZ<input class="f" name="billingZip"></label><label class="fl">Ort<input class="f" name="billingCity"></label></span></div>'+
    '<label class="fl">Notiz (intern, steht in Blitzdings)<textarea class="f" name="note" rows="2"></textarea></label>'+
    '<div class="sec-t">Preis &amp; Zahlung</div>'+
    '<div class="grid2"><label class="fl">Rabatt in € (optional)<input class="f num" name="discount" type="number" min="0" step="0.01"></label><label class="fl">Fixer Endpreis in € (optional)<input class="f num" name="override" type="number" min="0" step="0.01" placeholder="leer = berechnet"></label>'+
    '<label class="fl">Zahlung<select class="f" name="pay"><option value="INVOICE_UNPAID">Auf Rechnung – offen</option><option value="INVOICE_PAID">Bereits bezahlt (bar/Überweisung)</option></select></label>'+
    '<label class="fl">Mail an Kunden<select class="f" name="customerMail"><option value="confirmation">Buchungsbestätigung (wie online)</option><option value="offer">Angebot mit Annahme-Link</option><option value="none">Keine Mail</option></select></label></div>'+
    '<label class="chk"><input type="checkbox" name="notifyAdmin"> Interne Info-Mail an Blitzdings</label>'+
    '<label class="chk"><input type="checkbox" name="sevdeskInvoice"> Rechnung sofort über Blitzdings in sevDesk festschreiben (wie Online-Firmenbuchung; braucht Adresse)</label>'+
    '<label class="chk" id="bkOvl" hidden><input type="checkbox" name="allowOverlap"> Trotzdem anlegen (Doppelbelegung bewusst zulassen)</label>'+
    '<div class="err" id="bkErr"></div>'+
    '<div class="foot"><span>Gesamt <span class="bk-price" id="bkSum">–</span> <span class="muted" id="bkSumSub"></span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="bkSave">In Blitzdings buchen</button></span></div></form>',"wide");
  renderExtras(); formUpdate();
}
function curPkg(f){ var s=f.packageSlug.value; return ((S.cat&&S.cat.packages)||[]).find(function(p){ return p.slug===s; }); }
function renderExtras(){
  var f=document.querySelector('form[data-form="bkbook"]'); if(!f) return;
  var p=curPkg(f), ex=((S.cat&&S.cat.extras)||[]).filter(function(e){ return e.active&&(!p||!p.extraSlugs||!p.extraSlugs.length||p.extraSlugs.indexOf(e.slug)>-1); });
  var sel={}; f.querySelectorAll('input[name="extra"]:checked').forEach(function(i){ sel[i.value]=1; });
  document.getElementById("bkEx").innerHTML=ex.length?ex.map(function(e){ return '<label class="chk"><input type="checkbox" name="extra" value="'+esc(e.slug)+'"'+(sel[e.slug]?" checked":"")+'> '+esc(e.name)+' <span class="muted">+'+esc(eur(c2e(e.priceCents)))+'</span></label>'; }).join(""):'<span class="muted">Keine Extras für dieses Paket.</span>';
}
function calc(f){
  var p=curPkg(f); if(!p) return null;
  var s=f.eventDate.value, e=f.eventEndDate.value, days=s&&e&&e>s?daysBetween(s,e)+1:1;
  var pkgC=Math.round(p.priceCents*(1+0.9*(days-1)));
  var exC=0; f.querySelectorAll('input[name="extra"]:checked').forEach(function(i){ var x=(S.cat.extras||[]).find(function(y){ return y.slug===i.value; }); if(x) exC+=x.priceCents; });
  var gross=pkgC+exC, disc=Math.min(gross,Math.max(0,Math.round((parseFloat(f.discount.value)||0)*100)));
  var ov=f.override.value!==""?Math.max(0,Math.round(parseFloat(f.override.value)*100)):null;
  return {days:days,gross:gross,disc:disc,total:ov!=null&&isFinite(ov)?ov:gross-disc,override:ov,pkg:p};
}
/* Belegungshinweis aus den geladenen Kalenderdaten (endgültig prüft Blitzdings beim Speichern) */
function availHint(f){
  var p=curPkg(f), s=f.eventDate.value, e=f.eventEndDate.value||s, el=document.getElementById("bkAvail"); if(!el) return;
  if(!p||!s||!S.data){ el.innerHTML=""; return; }
  if(e<s){ el.innerHTML='<div class="bk-warn bad">Das Enddatum liegt vor dem Startdatum.</div>'; return; }
  var hits=[], unknown=false;
  for(var d=s; d<=e; d=addDays(d,1)){ var st=(S.data.days||{})[d]; if(!st){ unknown=true; continue; } p.resourceTypes.forEach(function(t){ if(st[t]&&st[t]!=="free") hits.push(de(d)+" "+(TYPE_LABEL[t]||t)+" "+(st[t]==="blocked"?"gesperrt":"gebucht")); }); }
  el.innerHTML=hits.length?'<div class="bk-warn bad">Belegt: '+esc(hits.slice(0,4).join(", "))+(hits.length>4?" …":"")+'</div>':(unknown?'':'<div class="bk-warn" style="background:var(--ok-soft);color:var(--ok)">Frei für '+esc(p.name)+'</div>');
}
function formUpdate(){
  var f=document.querySelector('form[data-form="bkbook"]'); if(!f) return;
  var co=f.customerType.value==="COMPANY"; f.querySelectorAll(".bk-co").forEach(function(l){ l.hidden=!co; });
  var c=calc(f), sum=document.getElementById("bkSum"), sub=document.getElementById("bkSumSub");
  if(c){ sum.textContent=eur(c2e(c.total)); sub.textContent=(c.days>1?c.days+" Tage · ":"")+(c.override!=null?"fixer Preis":c.disc?"inkl. "+eur(c2e(c.disc))+" Rabatt":""); }
  availHint(f);
}
F.listen("change",'form[data-form="bkbook"]',function(el,e){ if(e.target.name==="packageSlug") renderExtras(); formUpdate(); });
F.listen("input",'form[data-form="bkbook"]',function(){ formUpdate(); });

F.form("bkbook",function(f){
  var err=document.getElementById("bkErr"), btn=document.getElementById("bkSave"), c=calc(f);
  var v=function(n){ return (f[n]&&f[n].value||"").trim(); };
  var miss=[];
  if(!c) miss.push("Paket");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v("eventDate"))) miss.push("Datum");
  if(v("customerName").length<2) miss.push("Name");
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("customerEmail"))) miss.push("E-Mail");
  if(f.customerType.value==="COMPANY"&&(!v("companyName")||!v("vatId"))) miss.push("Firmenname und UID");
  if(f.sevdeskInvoice.checked&&(!v("billingStreet")||!v("billingZip")||!v("billingCity"))) miss.push("Adresse (für sevDesk-Rechnung)");
  if(miss.length){ err.textContent="Bitte ausfüllen: "+miss.join(", "); return; }
  var pay=f.pay.value.split("_");
  var body={packageSlug:v("packageSlug"),eventDate:v("eventDate"),eventEndDate:v("eventEndDate"),eventTime:v("eventTime"),eventLocation:v("eventLocation"),
    extras:Array.prototype.map.call(f.querySelectorAll('input[name="extra"]:checked'),function(i){ return i.value; }),
    customerName:v("customerName"),customerEmail:v("customerEmail"),customerPhone:v("customerPhone"),customerType:f.customerType.value,
    companyName:v("companyName"),vatId:v("vatId"),billingStreet:v("billingStreet"),billingZip:v("billingZip"),billingCity:v("billingCity"),note:v("note"),
    paymentMethod:pay[0],paymentStatus:pay[1],discountCents:c.disc,totalCentsOverride:c.override,
    customerMail:f.customerMail.value,notifyAdmin:f.notifyAdmin.checked,sevdeskInvoice:f.sevdeskInvoice.checked,allowOverlap:f.allowOverlap.checked};
  btn.disabled=true; btn.textContent="Speichere in Blitzdings …"; err.textContent="";
  F.api("/admin/api/blitz/bookings",{body:body}).then(function(j){
    btn.disabled=false; btn.textContent="In Blitzdings buchen";
    if(!j||j.ok===false){
      if(j&&j.conflicts&&j.conflicts.length){ document.getElementById("bkOvl").hidden=false;
        err.textContent=(j.error||"Termin belegt")+" – "+j.conflicts.slice(0,3).map(function(x){ return de(x.date)+" "+(TYPE_LABEL[x.type]||x.type)+(x.reason==="blocked"?" gesperrt":" ("+(x.reference||"gebucht")+")"); }).join(", "); }
      else err.textContent="Blitzdings hat abgelehnt: "+((j&&j.error)||"unbekannter Fehler");
      return;
    }
    var p=c.pkg, ex=(S.cat.extras||[]).filter(function(e){ return body.extras.indexOf(e.slug)>-1; });
    var nb={id:j.booking.id,reference:j.booking.reference,eventDate:j.booking.eventDate,eventEndDate:j.booking.eventEndDate,status:j.booking.status,paymentStatus:j.booking.paymentStatus,paymentMethod:body.paymentMethod,blocking:true,source:"cockpit",
      package:{slug:p.slug,name:p.name},resourceTypes:p.resourceTypes,customerName:body.customerName,customerEmail:body.customerEmail.toLowerCase(),customerPhone:body.customerPhone,companyName:body.customerType==="COMPANY"?body.companyName:"",
      eventLocation:body.eventLocation,billingStreet:body.billingStreet,billingZip:body.billingZip,billingCity:body.billingCity,note:[body.eventTime?"Uhrzeit: "+body.eventTime:"",body.note].filter(Boolean).join("\n"),
      totalCents:j.booking.totalCents,sevdeskInvoiceId:(j.effects&&j.effects.sevdeskInvoiceId)||"",extras:ex.map(function(e){ return {name:e.name,priceCents:e.priceCents}; })};
    LAST[nb.id]=nb;
    var mail=j.effects&&j.effects.mailSent;
    F.toast("Gebucht: "+nb.customerName+" am "+de(nb.eventDate)+(body.customerMail!=="none"?(mail===false?" · Mail NICHT versendet":" · Mail versendet"):""),mail===false&&body.customerMail!=="none");
    if(nb.eventDate.slice(0,7)!==S.month){ S.month=nb.eventDate.slice(0,7); S.data=null; }
    refreshAll();
    showBooking(nb,true);
  }).catch(function(){ btn.disabled=false; btn.textContent="In Blitzdings buchen"; err.textContent="Keine Verbindung zum Server."; });
});

F.blitzKalState=S;   /* für Tests */
})();
