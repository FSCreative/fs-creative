/* Finanzen › Übernahme: einmalige Vollübernahme aus sevDesk in die eigene Buchhaltung (Fortschritt, Ergebnis). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var ST={d:null,t:null};
var LBL={Contact:"Kontakte",ContactAddress:"Adressen",CommunicationWay:"E-Mail/Telefon",Invoice:"Rechnungen (inkl. Mahnungen/Storno)",InvoicePos:"Rechnungspositionen",CreditNote:"Gutschriften",CreditNotePos:"Gutschrift-Positionen",Order:"Angebote/Aufträge",OrderPos:"Angebotspositionen",Voucher:"Belege",VoucherPos:"Belegpositionen",CheckAccount:"Bankkonten",CheckAccountTransaction:"Bankumsätze",Part:"Artikel",AccountingType:"Kategorien",TaxSet:"Steuersätze",Tag:"Tags",TagRelation:"Tag-Zuordnungen"};
function load(){ F.api("/admin/api/fin/import").then(function(j){ ST.d=j; F.render(); clearTimeout(ST.t); if(j&&j.job&&j.job.running) ST.t=setTimeout(load,2500); }); }
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
F.geldTab({id:"umstieg",label:"Umstieg",order:90,sub:"Einmalige Übernahme aller Daten aus sevDesk in die eigene Buchhaltung.",render:render});
})();
