/* KI (Claude) – Belege & Steuer: KI-Prüfung unklarer sevDesk-Belege (Steuerregel, U30, E1a), Belege aus Mail-Anhängen auslesen,
   KI-Check vor der UVA-Abgabe. Schnittstellen für andere Module: FSC.steuerAiSuggest(docs), FSC.kiUvaCheck(key).
   Schreibzugriffe nur per Klick: Cockpit-Einordnung über /admin/api/steuer, sevDesk-Steuerregel über /admin/api/steuer/sevfix (mit Bestätigung). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
var M=F.M=F.M||{};

/* ---------- Schnittstellen ---------- */
/* docs: Belege (Objekte mit id oder {doc:{id}}) oder IDs → Promise mit Vorschlägen [{id,taxRule,uvaClass,u30,e1a,supplierCountry,reverseCharge,confidence,reason,meta}] */
F.steuerAiSuggest=function(docs){
  var ids=(docs||[]).map(function(d){ return d==null?"":typeof d==="object"?String((d.doc&&d.doc.id)||d.id||""):String(d); }).filter(Boolean);
  if(!ids.length) return Promise.resolve([]);
  return K.api("belege",{ids:ids.slice(0,160)}).then(function(j){ return j.suggestions||[]; });
};
F.kiUvaCheck=function(key,force){ return K.api("uva-check",{key:key,force:!!force}); };

/* ---------- KI-Prüfung Belege ---------- */
function belegRow(s){
  var m=s.meta||{}, U=K.ui, done=U.open["b"+s.id];
  if(s.error) return '<div class="kirow"><div class="kimain"><b>'+esc(m.supplier||s.id)+'</b><div class="muted">'+esc(s.error)+'</div></div></div>';
  var diffRule=m.taxRule&&s.taxRule!==m.taxRule, diffClass=s.uvaClass!==(m.override||m.cockpit), diffE1a=s.e1a!==m.e1aNow;
  var acts=[];
  if(diffClass) acts.push('<button type="button" class="btn primary" data-act="kibtake:'+esc(s.id)+'" title="Einordnung im Cockpit speichern (ändert sevDesk nicht)">Übernehmen</button>');
  if(diffE1a&&m.cats&&m.cats.length===1) acts.push('<button type="button" class="btn" data-act="kibe1a:'+esc(s.id)+'" title="Gilt für alle Belege dieser sevDesk-Kategorie">E1a für „'+esc(m.cats[0])+'“</button>');
  if(diffRule&&m.fixable) acts.push('<button type="button" class="btn" data-act="kibsev:'+esc(s.id)+'">In sevDesk ändern …</button>');
  if(!diffRule&&!diffClass&&!diffE1a) acts.push('<span class="tag ok">passt</span>');
  return '<div class="kirow"><div class="kimain"><b>'+esc(m.supplier||"—")+'</b> <span class="muted">'+esc(F.de(m.date))+(m.desc?" · "+esc(m.desc):"")+'</span>'+
    '<div class="muted">Jetzt: sevDesk '+esc(m.taxRuleTxt||"–")+' · Cockpit '+esc(K.CLASS_TXT[m.override||m.cockpit]||m.cockpit||"–")+' · E1a '+esc(m.e1aNow||"–")+(m.enshrined?' · <span class="bad-t">festgeschrieben</span>':'')+'</div>'+
    '<div class="kitags"><span class="tag '+(diffRule?"warn":"grey")+'">'+esc(s.taxRule+" "+(K.RULE_TXT[s.taxRule]||""))+'</span><span class="tag '+(diffClass?"warn":"grey")+'">'+esc(K.CLASS_TXT[s.uvaClass]||s.uvaClass)+'</span><span class="tag grey">U30 '+esc((s.u30||[]).join(", "))+'</span><span class="tag '+(diffE1a?"warn":"grey")+'" title="'+esc(K.e1aTxt(s.e1a))+'">E1a '+esc(s.e1a)+'</span>'+(s.supplierCountry?'<span class="tag grey">'+esc(s.supplierCountry)+'</span>':'')+K.conf(s.confidence)+'</div>'+
    '<div class="kireason">'+esc(s.reason)+'</div></div><div class="kiamt num money">'+F.eur(m.gross)+'</div><div class="row wrap">'+(done?'<span class="tag ok">'+esc(done)+'</span>':acts.join(""))+'</div></div>';
}
K.belegeHtml=function(){
  var U=K.ui, s=K.st; if(!U.belegeP) U.belegeP=K.periods()[0][0];
  var right=K.sel("kiBelegeP",U.belegeP,K.periods())+'<button type="button" class="btn primary" data-act="kibelege"'+(U.busy.belege?" disabled":"")+'>'+(U.busy.belege?"Prüfe …":"Unklare Belege prüfen")+'</button>'+(U.belege&&!U.busy.belege?'<button type="button" class="btn" data-act="kibelege:force" title="Ohne Zwischenspeicher neu einschätzen">Neu</button>':'');
  var inner;
  if(s&&!s.configured) inner=K.notSetHtml();
  else if(U.busy.belege) inner='<div class="empty">Claude prüft die Belege … (bis zu einer Minute)</div>';
  else if(!U.belege) inner='<div class="empty">Prüft Belege mit ausländischem Lieferanten, ohne Steuerregel, mit Abweichung zum Cockpit oder ohne E1a-Zuordnung und schlägt Steuerregel, U30-Kennzahlen und E1a-Kategorie vor.</div>';
  else if(!U.belege.list.length) inner='<div class="empty">'+esc(U.belege.note||"Keine unklaren Belege.")+'</div>';
  else { var list=U.belege.list.slice().sort(function(a,b){ return (a.confidence||0)-(b.confidence||0); });
    inner='<p class="muted kip-sub">'+list.length+' Belege'+(U.belege.label?' · '+esc(U.belege.label):'')+'. „Übernehmen“ speichert die Einordnung nur im Cockpit (UVA/E1a-Berechnung); sevDesk wird erst mit „In sevDesk ändern“ und Bestätigung geändert.</p><div class="kilist">'+list.map(belegRow).join("")+'</div>'; }
  return K.panel("ki-belege","KI-Prüfung Belege","Steuerregel (sevDesk 2.0), U30-Kennzahlen, E1a-Kategorie",right,inner);
};
F.listen("change","#kiBelegeP",function(el){ K.ui.belegeP=el.value; });
F.action("kibelege",function(v){
  if(!K.ready()){ F.toast(K.NOT_SET,true); return; }
  var U=K.ui; U.busy.belege=1; U.open={}; K.rerender();
  K.api("belege",{period:U.belegeP,force:v==="force"}).then(function(j){ U.busy.belege=0; U.belege={list:j.suggestions||[],label:j.label,note:j.note}; K.load(true).then(K.rerender); K.rerender(); })
    .catch(function(e){ U.busy.belege=0; K.fail(e); K.rerender(); });
});
function sugOf(id){ return ((K.ui.belege&&K.ui.belege.list)||[]).filter(function(s){ return s.id===id; })[0]; }
function steuerPost(body){ return F.api("/admin/api/steuer",{body:body}).then(function(j){ if(!j||j.ok===false) throw new Error((j&&j.error)||"Speichern fehlgeschlagen"); return j; }); }
F.action("kibtake",function(id){ var s=sugOf(id); if(!s) return;
  steuerPost({op:"doc",id:id,patch:{kz:s.uvaClass}}).then(function(){ K.ui.open["b"+id]="übernommen"; F.toast("Einordnung im Cockpit gespeichert"); K.rerender(); }).catch(K.fail); });
F.action("kibe1a",function(id){ var s=sugOf(id); if(!s||!s.meta||!s.meta.cats||s.meta.cats.length!==1) return; var cat=s.meta.cats[0], mp={}; mp[cat]=s.e1a;
  F.confirm("E1a-Kennzahl "+K.e1aTxt(s.e1a)+" für alle Belege der Kategorie „"+cat+"“ verwenden?","Zuordnen",function(){ steuerPost({op:"mapping",mapping:mp}).then(function(){ K.ui.open["b"+id]="E1a zugeordnet"; F.toast("Kategorie zugeordnet"); K.rerender(); }).catch(K.fail); }); });
F.action("kibsev",function(id){ var s=sugOf(id); if(!s) return; var m=s.meta||{};
  F.confirm("Steuerregel in sevDesk ändern: „"+(m.supplier||"Beleg")+"“ von „"+(m.taxRuleTxt||m.taxRule)+"“ auf „"+s.taxRule+" "+(K.RULE_TXT[s.taxRule]||"")+"“?","In sevDesk ändern",function(){
    F.api("/admin/api/steuer/sevfix",{body:{id:id,taxRule:s.taxRule,confirm:true}}).then(function(j){ if(j&&j.ok){ K.ui.open["b"+id]="in sevDesk geändert"; F.toast("Steuerregel in sevDesk geändert"); K.rerender(); } else F.toast("sevDesk: "+((j&&j.error)||"abgelehnt"),true); }).catch(function(){ F.toast("Keine Verbindung zum Server.",true); });
  }); });

/* ---------- KI-Check vor UVA-Abgabe ---------- */
var SEVC={error:"bad",warn:"warn",info:"grey"};
K.uvaHtml=function(){
  var U=K.ui, s=K.st, ps=K.periods().filter(function(p){ return /Q/.test(p[0]); }); if(!U.uvaP) U.uvaP=ps[0][0];
  var right=K.sel("kiUvaP",U.uvaP,ps)+'<button type="button" class="btn primary" data-act="kiuva"'+(U.busy.uva?" disabled":"")+'>'+(U.busy.uva?"Prüfe …":"KI-Check starten")+'</button>'+(U.uva&&!U.busy.uva?'<button type="button" class="btn" data-act="kiuva:force">Neu</button>':'');
  var inner, r=U.uva;
  if(s&&!s.configured) inner=K.notSetHtml();
  else if(U.busy.uva) inner='<div class="empty">Claude prüft Kennzahlen und Belege … (kann 1–2 Minuten dauern)</div>';
  else if(!r) inner='<div class="empty">Schickt die berechneten Kennzahlen und eine Belegübersicht an Claude und meldet Auffälligkeiten (fehlendes Reverse Charge, ausländische USt, ungewöhnliche Beträge). Ändert nichts.</div>';
  else inner='<div class="row wrap"><span class="tag '+(r.verdict==="ok"?"ok":r.verdict==="kritisch"?"bad":"warn")+'">'+(r.verdict==="ok"?"abgabebereit":r.verdict==="kritisch"?"kritisch":"bitte prüfen")+'</span><b>'+esc(r.label)+'</b><span class="muted">Zahllast <span class="money">'+F.eur(r.zahllast)+'</span>'+(r.cached?" · aus dem Zwischenspeicher":"")+'</span></div>'+
    '<p style="margin:0">'+esc(r.summary)+'</p>'+
    ((r.findings||[]).length?'<div class="kilist">'+r.findings.map(function(f){ return '<div class="kirow"><div class="kimain"><div><span class="tag '+(SEVC[f.severity]||"grey")+'">'+(f.severity==="error"?"Fehler":f.severity==="warn"?"Prüfen":"Info")+'</span> <b>'+esc(f.title)+'</b>'+(f.kz?' <span class="muted">KZ '+esc(f.kz)+'</span>':'')+'</div><div class="kireason">'+esc(f.detail)+'</div>'+((f.docIds||[]).length?'<div class="muted">Belege: '+f.docIds.map(esc).join(", ")+'</div>':'')+'</div></div>'; }).join("")+'</div>':'<div class="muted">Keine Auffälligkeiten.</div>')+
    '<p class="muted kip-sub">Nur eine Plausibilitätsprüfung – keine Steuerberatung. Abgabe weiterhin über die Steuer-Ansicht.</p>';
  return K.panel("ki-uva","KI-Check vor Abgabe (UVA)","Plausibilität, fehlendes Reverse Charge, ungewöhnliche Beträge – nur lesen",right,inner);
};
F.listen("change","#kiUvaP",function(el){ K.ui.uvaP=el.value; });
F.action("kiuva",function(v){
  if(!K.ready()){ F.toast(K.NOT_SET,true); return; }
  var U=K.ui; U.busy.uva=1; K.rerender();
  F.kiUvaCheck(U.uvaP,v==="force").then(function(j){ U.busy.uva=0; U.uva=j; K.load(true).then(K.rerender); K.rerender(); }).catch(function(e){ U.busy.uva=0; K.fail(e); K.rerender(); });
});

/* ---------- Belege aus Mail-Anhängen ---------- */
var SEVVER=null;
function sevVersion(){ if(SEVVER) return SEVVER; SEVVER=F.api("/admin/api/sevdesk/status").then(function(j){ return String((j&&j.version)||""); }).catch(function(){ SEVVER=null; return ""; }); return SEVVER; }
K.openVoucherWith=function(m,a,x,onDone){
  if(!M.openVoucher) return;
  sevVersion().then(function(ver){
    var lines=(x.lines||[]).filter(function(l){ return l.gross>0; }), eur=!x.currency||x.currency==="EUR";
    var info='<div class="kibox"><div class="row-between"><b>'+F.svg("spark")+' Von der KI ausgelesen</b>'+K.conf(x.confidence)+'</div>'+
      '<div class="kitags">'+(x.invoiceNumber?'<span class="tag grey">Nr. '+esc(x.invoiceNumber)+'</span>':'')+(x.supplierUid?'<span class="tag grey">UID '+esc(x.supplierUid)+'</span>':'')+(x.supplierCountry?'<span class="tag grey">'+esc(x.supplierCountry)+'</span>':'')+
      (x.deliveryFrom?'<span class="tag grey">Leistung '+esc(F.de(x.deliveryFrom))+(x.deliveryTo&&x.deliveryTo!==x.deliveryFrom?' – '+esc(F.de(x.deliveryTo)):'')+'</span>':'')+
      '<span class="tag info">'+esc(x.taxRule+" "+(K.RULE_TXT[x.taxRule]||""))+'</span><span class="tag grey" title="'+esc(K.e1aTxt(x.e1a))+'">E1a '+esc(x.e1a)+'</span></div>'+
      (lines.length>1?'<div class="muted">Steuersätze: '+lines.map(function(l){ return l.rate+" %: "+F.eur(l.gross); }).join(" · ")+' (werden als eigene Positionen angelegt)</div>':'')+
      (!eur?'<div class="bad-t">Rechnung in '+esc(x.currency)+' ('+esc(String(x.gross))+' '+esc(x.currency)+') – bitte den Euro-Betrag laut Kontoauszug eintragen.</div>':'')+
      (x.isInvoice===false?'<div class="bad-t">Laut KI ist das vermutlich keine Rechnung.</div>':'')+
      (x.notes?'<div class="muted">'+esc(x.notes)+'</div>':'')+
      (/^2/.test(ver)?'':'<div class="muted">Steuerregel bitte in sevDesk prüfen (Konto ohne Steuerregeln/Update 2.0).</div>')+'</div>';
    var extra={};
    if(lines.length>1&&eur) extra.positions=lines.map(function(l){ return {gross:l.gross,taxRate:l.rate}; });
    if(/^2/.test(ver)) extra.taxRule=x.taxRule;
    if(x.deliveryFrom){ extra.deliveryDate=x.deliveryFrom; if(x.deliveryTo) extra.deliveryDateUntil=x.deliveryTo; }
    var rate=lines.length===1?lines[0].rate:(x.tax>0?20:0);
    M.openVoucher(m,a,{title:"Beleg an sevDesk (KI)",supplier:x.supplier,date:x.invoiceDate||undefined,gross:eur&&x.gross>0?x.gross:null,taxRate:[20,13,10,0].indexOf(rate)>-1?rate:20,
      desc:(x.description||m.subject||"")+(x.invoiceNumber&&String(x.description||"").indexOf(x.invoiceNumber)<0?" · Nr. "+x.invoiceNumber:""),cat:x.accountingTypeId||"",html:info,extra:extra,onDone:onDone});
  });
};
M.kiVoucherBtn=function(m,a){ return '<button type="button" class="kiatt" data-act="mvki:'+esc(m.id)+'|'+esc(a.index||0)+'" title="Als Beleg erfassen (KI liest Betrag, Steuer, Lieferant aus)" aria-label="Als Beleg erfassen (KI)">'+F.svg("spark")+'</button>'; };
F.action("mvki",function(v){
  var i=v.indexOf("|"), m=M.find&&M.find(v.slice(0,i)), idx=+v.slice(i+1); if(!m) return;
  var a=(m.attachments||[]).filter(function(x){ return (x.index||0)===idx; })[0]; if(!a) return;
  if(!K.ready()){ K.load(true).then(function(){ if(!K.ready()) F.toast(K.NOT_SET,true); else F.actions.mvki(v); }); return; }
  F.toast("KI liest den Beleg „"+(a.filename||"Anhang")+"“ …");
  K.api("beleg-extract",{mail:{folder:m.folder||"INBOX",uid:m.uid,index:a.index||0,account:M.accOf?M.accOf(m):(m.account||""),filename:a.filename},subject:m.subject,from:m.from,fromName:m.fromName,date:m.date})
    .then(function(j){ K.openVoucherWith(m,a,j.beleg); K.load(true); }).catch(K.fail);
});

F.css([
".kireason{font-size:13.5px;color:var(--ink-2)}",
".kibox{border:1px solid var(--line);border-radius:11px;padding:10px 12px;display:grid;gap:6px;background:var(--sunk)}",
".kibox svg,.kiatt svg{width:14px;height:14px;vertical-align:-2px}",
".att .kiatt{border:0;background:none;padding:0 8px;color:var(--info)}"
].join("\n"));
})();
