/* Finanzen › Übernahme: einmalige Vollübernahme aus sevDesk in die eigene Buchhaltung (Fortschritt, Ergebnis). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var ST={d:null,t:null,m:null,sc:null};
var LBL={Contact:"Kontakte",ContactAddress:"Adressen",CommunicationWay:"E-Mail/Telefon",Invoice:"Rechnungen (inkl. Mahnungen/Storno)",InvoicePos:"Rechnungspositionen",CreditNote:"Gutschriften",CreditNotePos:"Gutschrift-Positionen",Order:"Angebote/Aufträge",OrderPos:"Angebotspositionen",Voucher:"Belege",VoucherPos:"Belegpositionen",CheckAccount:"Bankkonten",CheckAccountTransaction:"Bankumsätze",Part:"Artikel",AccountingType:"Kategorien",TaxSet:"Steuersätze",Tag:"Tags",TagRelation:"Tag-Zuordnungen"};
function load(){ F.api("/admin/api/fin/import").then(function(j){ ST.d=j; F.render(); clearTimeout(ST.t); if(j&&j.job&&j.job.running) ST.t=setTimeout(load,2500); }); }
function loadMode(){ F.api("/admin/api/fin/mode").then(function(j){ ST.m=j||{}; F.render(); }); F.api("/admin/api/fin/obj?type=SevClient").then(function(j){ ST.sc=(j&&j.objects&&j.objects[0])||{}; F.render(); }); }
var FIRM=[["name","Firma"],["owner","Inhaber"],["street","Straße"],["zip","PLZ"],["city","Ort"],["country","Land"],["phone","Telefon"],["email","E-Mail"],["web","Website"],["bank","Bank"],["iban","IBAN"],["bic","BIC"],["uid","UID-Nummer"],["taxNumber","Steuernummer"],["court","Firmenbuch/Gericht"],["contactPerson","Ansprechpartner"]];
function firmDefaults(){ var c=ST.sc||{}; var ib=String(c.bankIban||"").replace(/\s+/g,"").replace(/(.{4})/g,"$1 ").trim(); return {name:c.name||"FS Creative",owner:c.ceoName||"Simon Felder",street:c.addressStreet||"",zip:c.addressZip||"",city:c.addressCity||"",country:"Österreich",phone:c.contactPhone||"",email:"office@fs-creative.at",web:c.website||"",bank:c.bank||"",iban:ib,bic:c.bankBic||"",uid:c.vatNumber||"",taxNumber:c.taxNumber||"",court:c.districtCourt||"",contactPerson:c.ceoName||"Simon Felder"}; }
function firmPanel(){
  if(!ST.m){ loadMode(); return ""; }
  var f=ST.m.firm||firmDefaults();
  return '<section class="panel"><div class="panel-h"><h2>Firmendaten für Rechnungen</h2>'+(ST.m.firm?'<span class="tag ok">gespeichert</span>':'<span class="tag warn">bitte prüfen & speichern</span>')+'</div>'+
    '<form data-form="finfirm" class="stackf" style="padding:16px"><p class="muted" style="margin:0">Erscheinen im Kopf und in der Fußzeile jeder Rechnung, Mahnung und jedes Angebots. Vorausgefüllt aus sevDesk.</p>'+
    '<div class="grid2">'+FIRM.map(function(x){ return '<label class="fl">'+x[1]+'<input class="f" name="'+x[0]+'" value="'+F.esc(f[x[0]]||"")+'"></label>'; }).join("")+'</div>'+
    '<div class="foot"><span></span><button class="btn primary" type="submit">Firmendaten speichern</button></div></form></section>';
}
function cmpPanel(){
  var c=ST.cmp;
  var rows=c&&c.rows?c.rows.map(function(r){ return '<tr><td>'+F.esc(r.label)+'</td><td class="r num">'+F.esc(r.remote)+'</td><td class="r num">'+F.esc(r.local)+'</td><td>'+(r.ok?'<span class="tag ok">gleich</span>':'<span class="tag bad">abweichend</span>')+'</td></tr>'; }).join(""):"";
  return '<section class="panel"><div class="panel-h"><h2>Gegenprobe sevDesk ↔ eigene Buchhaltung</h2><button class="btn" data-act="fincmp"'+(ST.cmpBusy?" disabled":"")+'>'+(ST.cmpBusy?"rechnet …":"Jetzt vergleichen")+'</button></div>'+
    (rows?'<div class="scroll"><table><thead><tr><th>Kennzahl</th><th class="r">sevDesk</th><th class="r">Eigene Daten</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div class="sd-empty">Vergleicht Rechnungen, offene Beträge, Umsätze, Kontostände, offene Bankumsätze und Belege.</div>')+'</section>';
}
F.action("fincmp",function(){ ST.cmpBusy=true; F.render(); F.api("/admin/api/fin/compare").then(function(j){ ST.cmpBusy=false; ST.cmp=j; F.render(); if(!j||!j.ok) F.toast((j&&j.error)||"Fehler",true); }); });
function modePanel(){
  if(!ST.m) return "";
  var d=ST.d||{}, done=d.last&&!(d.job&&d.job.running), local=!!ST.m.local;
  var chk=[[!!done,"Alle Daten und Dateien aus sevDesk übernommen"],[!!ST.m.firm,"Firmendaten geprüft und gespeichert"]];
  return '<section class="panel"><div class="panel-h"><h2>Eigene Buchhaltung</h2>'+(local?'<span class="tag ok">aktiv – ohne sevDesk</span>':'<span class="tag grey">noch sevDesk</span>')+'</div><div style="padding:16px;display:grid;gap:12px">'+
    (local?'<p style="margin:0">Das Cockpit arbeitet mit deinen eigenen Daten: Rechnungen, Angebote, Belege, Bank und Steuer laufen ohne sevDesk. Neue Rechnungen bekommen fortlaufende Nummern und ein eigenes PDF.</p><div><button class="btn" data-act="finmode:0">Zurück zu sevDesk (nur für Notfälle)</button></div>':
    '<p style="margin:0">Schaltet das Cockpit auf die übernommenen Daten um. Ab dann wird <b>nichts mehr in sevDesk</b> angelegt oder geändert. sevDesk bleibt unverändert bestehen, bis du es kündigst.</p>'+
    '<ul class="plain">'+chk.map(function(c){ return '<li>'+(c[0]?"✅":"⬜️")+' '+c[1]+'</li>'; }).join("")+'</ul>'+
    '<div><button class="btn primary" data-act="finmode:1"'+(chk.every(function(c){return c[0];})&&!ST.switching?"":" disabled")+'>'+(ST.switching?"Gleiche ab …":"Eigene Buchhaltung verwenden")+'</button></div>')+
    '</div></section>';
}
function render(){
  if(!ST.d){ load(); return '<div class="sd-empty">Lade Status …</div>'; }
  var d=ST.d, j=d.job||{}, st=d.stored||{}, objs=(st.objects||[]), files=(st.files||[]);
  var pct=j.total?Math.round(j.done/j.total*100):0;
  var objRows=objs.map(function(o){ return '<tr><td>'+esc(LBL[o.type]||o.type)+'</td><td class="r num">'+o.n+'</td></tr>'; }).join("");
  var fileRows=files.map(function(f){ return '<tr><td>'+esc((f.kind==="pdf"?"PDF ":"Datei ")+(LBL[f.ref_type]||f.ref_type))+'</td><td class="r num">'+f.n+' · '+(Math.round(+f.bytes/1048576*10)/10)+' MB</td></tr>'; }).join("");
  return '<section class="panel"><div class="panel-h"><h2>Umstieg von sevDesk</h2>'+(j.running?'<span class="tag info">läuft …</span>':(d.last?'<span class="tag ok">übernommen '+esc(F.de(String(d.last.at).slice(0,10)))+'</span>':'<span class="tag grey">noch nicht übernommen</span>'))+'</div>'+
    '<div class="panel-b" style="padding:16px;display:grid;gap:12px">'+
    '<p style="margin:0">Holt <b>alle Jahre</b> aus sevDesk in die eigene Buchhaltung: Kontakte, Rechnungen, Mahnungen, Gutschriften, Angebote, Belege, Bankkonten und -umsätze, Artikel, Kategorien – <b>mit allen PDFs und Belegdateien</b>. sevDesk wird dabei nur gelesen, nichts verändert. Mehrfach ausführbar: bereits übernommene Dateien werden übersprungen, Daten aktualisiert.</p>'+
    (j.running?'<div><div class="row-between"><span>'+esc(j.phase||"")+'</span><span class="num">'+j.done+' / '+j.total+'</span></div><div class="bar" style="margin-top:6px"><i style="width:'+pct+'%;background:var(--glow)"></i></div><div class="muted" style="margin-top:6px">Dateien: '+j.files.ok+' neu · '+j.files.skip+' schon da · '+j.files.fail+' fehlgeschlagen. Du kannst das Cockpit währenddessen normal benutzen.</div></div>':
      '<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="finimp">'+(d.last?"Erneut abgleichen":"Übernahme starten")+'</button>'+(d.last?'':'<span class="muted">Dauert je nach Datenmenge 20–60 Minuten (alle PDFs werden einzeln geladen).</span>')+'</div>')+
    (objRows?'<div class="two"><div><div class="sec-t">Gespeicherte Daten</div><table><tbody>'+objRows+'</tbody></table></div><div><div class="sec-t">Gespeicherte Dateien</div><table><tbody>'+(fileRows||'<tr><td class="muted">noch keine</td></tr>')+'</tbody></table></div></div>':'')+
    (j.errors&&j.errors.length?'<details><summary class="muted">'+j.errors.length+' Hinweise/Fehler</summary><pre style="white-space:pre-wrap;font-size:12px;max-height:260px;overflow:auto">'+esc(j.errors.join("\n"))+'</pre></details>':'')+
    (st.error?'<div class="notice">Datenbank: '+esc(st.error)+'</div>':'')+
    '</div></section>';
}
F.action("finimp",function(){
  F.confirm("Jetzt alle Daten aller Jahre aus sevDesk übernehmen? sevDesk wird nur gelesen.","Übernahme starten",function(){
    F.api("/admin/api/fin/import",{body:{confirm:true}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } F.toast("Übernahme gestartet"); setTimeout(load,800); });
  });
});
F.form("finfirm",function(f){ var b={}; FIRM.forEach(function(x){ b[x[0]]=f[x[0]].value.trim(); }); F.api("/admin/api/fin/firm",{body:b}).then(function(j){ if(j&&j.ok){ ST.m.firm=j.firm; F.toast("Firmendaten gespeichert"); F.render(); } else F.toast((j&&j.error)||"Fehler",true); }); });
function setMode(on){ return F.api("/admin/api/fin/mode",{body:{confirm:true,local:on}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } ST.m.local=j.local; F.toast(j.local?"Eigene Buchhaltung aktiv – sevDesk wird nicht mehr verwendet":"sevDesk aktiv"); if(F.sevRefresh) F.sevRefresh(); else F.load(true); }); }
F.action("finmode",function(v){
  var on=v==="1";
  F.confirm(on?"Auf eigene Buchhaltung umschalten? Vorher wird alles noch einmal mit sevDesk abgeglichen (ca. 1–2 Minuten). Danach wird nichts mehr in sevDesk angelegt oder geändert.":"Zurück zu sevDesk? Was du inzwischen im Cockpit angelegt hast, ist dann nicht in sevDesk.",on?"Abgleichen & umschalten":"Zurück zu sevDesk",function(){
    if(!on){ setMode(false); return; }
    ST.switching=true; F.toast("Letzter Abgleich mit sevDesk läuft …");
    F.api("/admin/api/fin/import",{body:{confirm:true}}).then(function(){
      (function poll(){ F.api("/admin/api/fin/import").then(function(j){ ST.d=j; F.render(); if(j&&j.job&&j.job.running){ setTimeout(poll,2500); return; } ST.switching=false;
        if(j&&j.job&&j.job.phase==="Fertig") setMode(true); else F.toast("Abgleich nicht vollständig – bitte Hinweise prüfen",true); }); })();
    });
  },!on);
});
(F.geldTab||function(t){ (F._pendTabs=F._pendTabs||[]).push(t); })({id:"umstieg",label:"Umstieg",order:90,sub:"Übernahme aus sevDesk, Firmendaten und Umschalten auf die eigene Buchhaltung.",render:function(){ return render()+firmPanel()+cmpPanel()+modePanel(); }});
})();
