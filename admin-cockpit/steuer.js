/* Finanzen → UVA (U30 + ZM) und JAB (E1a + U1 + E1) nach österreichischem Steuerrecht.
   Rechenkern: admin-cockpit/steuer-calc.js (FSC_STEUER) – derselbe Code rechnet auf dem Server die Kennzahlen für FinanzOnline.
   USt: Sollbesteuerung fix. E1a: Einnahmen-Ausgaben-Rechnung nach Zahlungsdatum. Jede Zahl ist bis zum Beleg aufklappbar. */
(function(){
"use strict";
var F=window.FSC, S=window.FSC_STEUER, esc=F.esc, eur=F.eur, de=F.de, deShort=F.deShort;
var ST=null, loading=false, loadErr="";
F.UI.uvaKey=F.UI.uvaKey||null; F.UI.jabYear=F.UI.jabYear||null; F.UI.stOpen=F.UI.stOpen||{}; F.UI.jabOpen=F.UI.jabOpen||{};

var loadP=null;
function load(force){
  if(loading) return loadP; loading=true;
  loadP=F.api("/admin/api/steuer"+(force?"?force=1":"")).then(function(j){ loading=false; if(j&&j.ok){ ST=j; loadErr=""; } else { loadErr=(j&&j.error)||"Fehler"; if(j&&j.settings){ ST=ST||j; } } if(F.current==="geld"||F.current==="heute") F.render(); return ST; })
    .catch(function(){ loading=false; loadErr="Keine Verbindung."; if(F.current==="geld") F.render(); });
  return loadP;
}
F.steuerData=function(){ return ST&&ST.data?ST.data:null; };
var KEYS=["settings","mapping","uva","jab","docs","uvaManual","jabInput","trips","fon","vies"];
function apply(j){ if(j) KEYS.forEach(function(k){ if(j[k]!==undefined) ST[k]=j[k]; }); }
function post(body,msg){ return F.api("/admin/api/steuer",{body:body}).then(function(j){ if(j&&j.ok){ apply(j); if(msg) F.toast(msg); F.render(); } else F.toast("Speichern fehlgeschlagen: "+((j&&j.error)||""),true); return j; }); }
var r2=S.r2;
function money(n){ return '<span class="num money">'+eur(n)+'</span>'; }
function num(v){ var n=parseFloat(String(v==null?"":v).replace(",",".")); return isFinite(n)?n:0; }

/* ---------- Zeiträume ---------- */
function periodsOf(year,mode){ var out=[]; if(mode==="monat"){ for(var m=1;m<=12;m++) out.push({key:year+"-M"+String(m).padStart(2,"0"),label:new Date(year,m-1,1).toLocaleDateString("de-AT",{month:"long"})+" "+year,from:year+"-"+String(m).padStart(2,"0")+"-01",to:F.ymd(new Date(year,m,0)),endMonth:m,year:year}); } else { for(var q=1;q<=4;q++) out.push({key:year+"-Q"+q,label:q+". Quartal "+year,from:year+"-"+String(q*3-2).padStart(2,"0")+"-01",to:F.ymd(new Date(year,q*3,0)),endMonth:q*3,year:year}); } return out; }
function dueOf(p){ return F.ymd(new Date(p.year,p.endMonth+1,15)); }       // 15. des zweitfolgenden Monats
function periodByKey(k){ return periodsOf(+k.slice(0,4),k.indexOf("-M")>0?"monat":"quartal").find(function(x){ return x.key===k; }); }

/* ---------- Andockpunkt für KI-Vorschläge ----------
   Ist F.steuerAiSuggest(info) definiert (info = FSC_STEUER.explainDoc(...)), erscheint bei unklaren Belegen ein Button „KI-Vorschlag“.
   Erwartete Antwort (Promise): {klasse:"rc"|"060"|… (Schlüssel aus FSC_STEUER.IN_OPTS/OUT_OPTS), begruendung:"…", taxRule?:"14"}.
   Übernommen wird nur nach Klick des Inhabers (Cockpit-Einordnung); sevDesk wird dabei nicht geändert. */
function aiBtn(id){ return typeof F.steuerAiSuggest==="function"?' <button class="btn" data-act="staisug:'+esc(id)+'">KI-Vorschlag</button>':""; }
F.action("staisug",function(id){
  var info=S.explainDoc(ST.data,ST,id); if(!info||typeof F.steuerAiSuggest!=="function") return;
  F.toast("Frage KI …");
  Promise.resolve(F.steuerAiSuggest(info)).then(function(sug){
    if(!sug||!sug.klasse){ F.toast("Kein Vorschlag",true); return; }
    var opts=info.art==="Ausgang"?S.OUT_OPTS:S.IN_OPTS, lbl=(opts.find(function(o){ return o[0]===sug.klasse; })||[,sug.klasse])[1];
    F.modal('<div class="row-between"><h2 style="font-size:19px">KI-Vorschlag</h2>'+F.btnClose()+'</div><p><b>'+esc(info.partner)+'</b> · '+eur(info.netto)+'</p><p>Aktuell: '+esc(info.positionen.map(function(x){ return x.klasse+" – "+x.begruendung; }).join("; "))+'</p><p>Vorschlag: <b>'+esc(lbl)+'</b></p><p class="muted">'+esc(sug.begruendung||"")+'</p><div class="foot"><span></span><span class="row"><button class="btn" data-closemodal>Verwerfen</button><button class="btn primary" data-act="stkz:'+esc(id)+':'+esc(sug.klasse)+'">Übernehmen</button></span></div>',"narrow");
  }).catch(function(e){ F.toast("KI-Vorschlag fehlgeschlagen: "+(e&&e.message||""),true); });
});

/* ---------- Belegliste (Herleitung je Kennzahl) ---------- */
function docCfg(id){ return (ST.docs&&ST.docs[id])||{}; }
function docName(d,kind){ return kind==="out"?((d.nr?d.nr+" · ":"")+(d.contact||"")):(d.supplier||d.contact||"Beleg"); }
function docsList(arr,opts){
  opts=opts||{};
  if(!arr.length) return '<div class="empty">Keine Belege.</div>';
  var sb=0, stx=0; arr.forEach(function(x){ sb+=x.base||0; stx+=x.tax||0; });
  return '<div class="scroll"><table class="st-docs"><tbody>'+arr.map(function(x){ var d=x.doc, kind=x.kind, out=kind==="out"||kind==="vin", manual=kind==="manual", opt=out?S.OUT_OPTS:S.IN_OPTS, cur=docCfg(d.id).kz||"auto";
    return '<tr><td class="nowrap num">'+deShort(x.date||d.date)+'</td><td><b>'+esc(docName(d,out?"out":"in"))+'</b><div class="sub">'+esc([x.why,d.taxRule?("sevDesk: "+(S.TAXRULE_TXT[d.taxRule]||("Regel "+d.taxRule))):"",x.info||""].filter(Boolean).join(" · "))+'</div></td>'+
      '<td class="r">'+(x.base!=null?money(x.base):'')+(x.tax?'<div class="sub">Steuer '+eur(x.tax)+'</div>':'')+'</td>'+
      (manual||opts.noSelect?'<td></td>':'<td><select class="f" data-stdoc="'+esc(d.id)+'" aria-label="Einordnung">'+opt.map(function(o){ return '<option value="'+o[0]+'"'+(cur===o[0]?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("")+'</select></td>')+
      (kind==="out"&&!/^cn/.test(d.id)?'<td class="r"><a class="btn icon" href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(d.id)+'" target="_blank" rel="noopener" aria-label="PDF">↗</a></td>':'<td></td>')+'</tr>'; }).join("")+
    '<tr class="grp"><td></td><td>Summe ('+arr.length+' Position'+(arr.length===1?"":"en")+')</td><td class="r">'+money(sb)+(stx?'<div class="sub">Steuer '+eur(stx)+'</div>':'')+'</td><td></td><td></td></tr></tbody></table></div>';
}
F.action("stdocs",function(kz){ F.UI.stOpen[kz]=!F.UI.stOpen[kz]; F.render(); });
F.listen("change","[data-stdoc]",function(el){ post({op:"doc",id:el.getAttribute("data-stdoc"),patch:{kz:el.value==="auto"?"":el.value}},"Einordnung gespeichert"); });

/* ---------- UVA ---------- */
function kzTable(r,showAll){
  var rows=S.UVA_ROWS.filter(function(x){ return showAll||r.K[x[0]]||x[0]==="000"; });
  return '<div class="scroll"><table class="kz"><thead><tr><th>KZ</th><th>Bezeichnung (Formular U30)</th><th class="r">Bemessungsgrundlage</th><th class="r">Steuer</th><th></th></tr></thead><tbody>'+
    rows.map(function(x){ var k=r.K[x[0]]||{base:0,tax:0}, n=(r.docs[x[0]]||[]).length;
      return '<tr><td><span class="kzb">'+x[0]+'</span></td><td>'+esc(x[1])+'</td><td class="r">'+(x[2]!=="tax"||(x[0]==="057"&&k.base)?money(k.base):'<span class="muted">—</span>')+'</td><td class="r">'+(x[2]!=="base"?money(k.tax):'<span class="muted">—</span>')+'</td><td class="r">'+(n?'<button class="link" data-act="stdocs:'+x[0]+'" aria-expanded="'+!!F.UI.stOpen[x[0]]+'">'+n+' Beleg'+(n===1?"":"e")+'</button>':'')+'</td></tr>'+
        (F.UI.stOpen[x[0]]&&n?'<tr class="sub-row"><td colspan="5">'+docsList(r.docs[x[0]])+'</td></tr>':''); }).join("")+
    '<tr class="grp"><td><span class="kzb">095</span></td><td>'+(r.zahllast>=0?"Vorauszahlung (Zahllast)":"Überschuss (Gutschrift)")+' = USt '+eur(r.ust)+' − Vorsteuer '+eur(r.vst)+((r.K["090"]||{}).tax?' ± KZ 090':'')+'</td><td></td><td class="r">'+money(r.zahllast)+'</td><td></td></tr></tbody></table></div>';
}
function renderUva(){
  if(!ST||!ST.data) return loadingBox();
  var yr=+F.D.year, set=ST.settings, ps=periodsOf(yr,set.zeitraum), today=F.D.today;
  var cur=ps.find(function(p){return p.key===F.UI.uvaKey;})||ps.filter(function(p){ return p.to<today; }).pop()||ps[0];
  F.UI.uvaKey=cur.key;
  var r=S.computeUva(ST.data,ST,cur), ctl=S.controlCheck(ST.data,ST,cur), done=ST.uva[cur.key], due=dueOf(cur), zmr=S.zmRows(r);
  var prevGross=S.revenueGross(ST.data,ST,yr-1), prevNet=S.revenueNet(ST.data,ST,yr-1);
  var duty=prevNet>100000?"Vorjahresumsatz über 100.000 € → monatliche UVA ist Pflicht.":(prevNet>55000?"Vorjahresumsatz zwischen 55.000 € und 100.000 € → vierteljährliche UVA.":"Vorjahresumsatz bis 55.000 € → keine Abgabepflicht, außer die Zahllast wird nicht rechtzeitig bezahlt oder du willst eine Gutschrift.");
  var chips=ps.map(function(p){ var d=ST.uva[p.key], st=d&&d.doneAt?"ok":(p.to>=today?"grey":(dueOf(p)<today?"bad":"warn")); var lbl=set.zeitraum==="monat"?new Date(p.year,p.endMonth-1,1).toLocaleDateString("de-AT",{month:"short"}):("Q"+p.key.slice(-1));
    return '<button class="chip pchip '+st+'" data-act="uvap:'+p.key+'" aria-pressed="'+(p.key===cur.key)+'">'+lbl+(d&&d.doneAt?" ✓":"")+'</button>'; }).join("");
  var dz=r2(r.zahllast-ctl.zahllast);
  var mm=S.mismatches(ST.data,ST,cur.from,cur.to);
  return settingsBar()+
    '<section class="panel"><div class="panel-h"><div><h2>UVA '+esc(cur.label)+'</h2><div class="muted">Zeitraum '+de(cur.from)+' – '+de(cur.to)+' · Sollbesteuerung (nach Leistungsdatum, Vorsteuer nach Belegdatum)</div></div><div class="chips">'+chips+'</div></div>'+
    '<div class="panel-b uva-top"><div><div class="k">'+(r.zahllast>=0?"Zahllast (KZ 095)":"Gutschrift (KZ 095)")+'</div><div class="v num money">'+eur(Math.abs(r.zahllast))+'</div><div class="s">Kontrolle aus sevDesk-Summen: '+eur(ctl.zahllast)+(Math.abs(dz)>0.01?' · <b class="'+(Math.abs(dz)>5?"bad-t":"")+'">Abweichung '+eur(dz)+'</b> <button class="link" data-act="stctl">Warum?</button>':' · stimmt überein')+'</div></div>'+
      '<div><div class="k">Fällig</div><div class="v num">'+de(due)+'</div><div class="s">Abgabe und Zahlung'+(due<today&&!(done&&done.doneAt)?' · <b class="bad-t">überfällig</b>':'')+'</div></div>'+
      '<div class="uva-done"><button class="btn glow" data-act="uvaprep:'+cur.key+'"'+(cur.to>=today?' disabled title="Zeitraum läuft noch"':'')+'>UVA vorbereiten</button>'+(done&&done.doneAt?'<span class="tag ok">'+(done.fon?'Eingereicht (Paket '+done.fon.paket+')':'Erledigt')+' am '+de(done.doneAt)+'</span><button class="btn" data-act="uvaundo:'+cur.key+'">Zurücksetzen</button>':'<button class="btn" data-act="uvadone:'+cur.key+'">Als erledigt markieren</button>')+'</div></div>'+
    (r.review.length?'<div class="notice" style="margin:0 18px 14px"><span><b>'+r.review.length+' Beleg'+(r.review.length===1?"":"e")+'</b> konnte'+(r.review.length===1?"":"n")+' nicht eindeutig eingeordnet werden und fehlen in den Kennzahlen.</span><button class="btn" data-act="stdocs:review">Einordnen</button></div>':'')+
    (F.UI.stOpen.review&&r.review.length?'<div class="panel-b">'+docsList(r.review.map(function(x){ return {doc:x.doc,kind:x.kind,info:x.why}; }))+(typeof F.steuerAiSuggest==="function"?'<div class="row wrap">'+r.review.map(function(x){ return aiBtn(x.doc.id).replace("KI-Vorschlag","KI: "+esc(docName(x.doc,x.kind==="out"?"out":"in").slice(0,24))); }).join("")+'</div>':'')+'</div>':'')+
    kzTable(r,F.UI.stOpen.allkz)+
    '<div class="panel-b row wrap"><button class="link" data-act="stdocs:allkz">'+(F.UI.stOpen.allkz?"Nur befüllte Kennzahlen":"Alle Kennzahlen des Formulars zeigen")+'</button>'+
      (r.corr.length?'<span class="muted small">Negative Werte umgebucht: '+r.corr.map(function(c){ return "KZ "+c.kz+" "+eur(c.amount)+(c.to!=="0"?" → KZ "+c.to:" → 0"); }).join(", ")+' (nur 063, 067 und 090 dürfen negativ sein).</span>':'')+'</div>'+
    '</section>'+
    euPanel(cur)+recvPanel(cur,r)+otherPanel(r)+manualPanel(cur)+syncPanel(cur,r,mm)+fonPanel(cur,r,zmr,done)+zmPanel(cur,r,zmr)+
    '<section class="panel"><div class="panel-b muted small"><b>Hinweise:</b> '+esc(duty)+' Sollbesteuerung: die Umsatzsteuer entsteht mit Ablauf des Monats, in dem die Leistung erbracht wurde (Leistungsdatum, sonst Rechnungsdatum; § 19 Abs. 2 Z 1 lit. a UStG – wird die Rechnung erst später gelegt, verschiebt sich das um höchstens einen Monat). Anzahlungen werden bei Zahlungseingang versteuert (Mindest-Istbesteuerung). Stornos und Gutschriften mindern im Monat ihrer Ausstellung; Skonti (aus dem Zahlbetrag) und als uneinbringlich markierte Forderungen werden im Monat der Zahlung bzw. des Ausfalls automatisch berichtigt (§ 16 UStG) – nicht zusätzlich manuell erfassen. Reverse Charge (Google, Meta, Railway, Cloudflare …) zählt im Monat der Leistung: KZ 057 und gleich hohe Vorsteuer KZ 066. Ausländische Umsatzsteuer (z. B. 19 % DE) ist keine österreichische Vorsteuer. '+
      (prevGross&&prevGross<=S.C.kleinunternehmer?'Vorjahresumsatz brutto '+eur(prevGross)+' – unter der Kleinunternehmergrenze von 55.000 € brutto: Befreiung wäre möglich (Verzicht/Regelbesteuerung bindet 5 Jahre).':'Kleinunternehmergrenze: 55.000 € brutto (ab 2025) – du bist regelbesteuert.')+'</div></section>';
}
/* ---------- EU & Ausland ---------- */
var EU_ROWS=[["igLeistung","Dienstleistungen an EU-Unternehmer (Reverse Charge beim Kunden) → ZM, nicht in KZ 000"],["igLieferung","ig. Lieferungen (Ware) → KZ 017 + ZM"],["dreieck","Dreiecksgeschäfte → ZM mit Kennzeichen"],["igErwerb","ig. Erwerbe (Ware aus der EU) → KZ 070 ff., Vorsteuer KZ 065"],["rcEU","Leistungen von EU-Unternehmern (Google, Meta, Adobe, Hetzner …) → KZ 057/066"],["rcDritt","Leistungen aus dem Drittland (Railway, Cloudflare …) → KZ 057/066"],["fxEU","ausländische EU-USt auf Rechnungen (nicht abziehbar) – Steuerbetrag"],["ausfuhr","Ausfuhrlieferungen → KZ 011"],["drittland","Leistungen an Kunden im Drittland – nicht steuerbar"],["b2cEU","Leistungen an Privatkunden in anderen EU-Staaten (österr. USt)"],["oss","One-Stop-Shop (gehört in die OSS-Erklärung)"]];
function euPanel(cur){
  var e=S.euSummary(ST.data,ST,cur), rows=EU_ROWS.filter(function(x){ return e[x[0]]; });
  var uids=e.zmRows.filter(function(z){ return z.uid; });
  return '<section class="panel"><div class="panel-h"><h2>EU & Ausland</h2><span class="muted">automatisch erkannt über Steuerregel, UID-Präfix, Kontaktland und bekannte Anbieter</span></div>'+
    (rows.length?'<div class="scroll"><table><tbody>'+rows.map(function(x){ var k="eu_"+x[0], n=(e.docs[x[0]]||[]).length;
      return '<tr><td>'+esc(x[1])+'</td><td class="r">'+money(e[x[0]])+'</td><td class="r">'+(n?'<button class="link" data-act="stdocs:'+k+'">'+n+' Beleg'+(n===1?"":"e")+'</button>':'')+'</td></tr>'+(F.UI.stOpen[k]?'<tr class="sub-row"><td colspan="3">'+docsList((e.docs[x[0]]||[]).map(function(d){ return {doc:d.doc,kind:/^(igErwerb|rcEU|rcDritt|fxEU)$/.test(x[0])?"in":"out",base:d.base}; }))+'</td></tr>':''); }).join("")+'</tbody></table></div>':'<div class="panel-b muted">Keine EU- oder Auslandsumsätze in diesem Zeitraum.</div>')+
    (e.ossWarn?'<div class="notice" style="margin:0 18px 14px"><span><b>OSS-Schwelle überschritten:</b> Leistungen an Privatkunden in anderen EU-Staaten '+esc(cur.from.slice(0,4))+' gesamt '+eur(e.b2cEUJahr)+' (Schwelle 10.000 €). Ab Überschreiten gilt die USt des Kundenlandes – Abrechnung über den One-Stop-Shop (FinanzOnline) oder Registrierung im jeweiligen Land.</span></div>':(e.b2cEUJahr?'<div class="panel-b muted small">B2C-Umsätze in andere EU-Staaten '+esc(cur.from.slice(0,4))+': '+eur(e.b2cEUJahr)+' von 10.000 € OSS-Schwelle.</div>':''))+
    (uids.length?'<div class="panel-b"><div class="sec-t">UID-Nummern der EU-Kunden</div><div class="row wrap">'+uids.map(function(z){ var vs=(ST.vies||{})[z.uid];
      return '<span class="tag '+(!z.valid.ok?"bad":(vs?(vs.valid?"ok":"bad"):"grey"))+'" title="'+esc(z.valid.ok?(vs?(vs.valid?"gültig laut VIES"+(vs.name?": "+vs.name:""):"laut VIES ungültig"):"Format korrekt – noch nicht bei VIES geprüft"):z.valid.why)+'">'+esc(z.uid)+'</span>'+(z.valid.ok?'<button class="link small" data-act="vies:'+esc(z.uid)+'">'+(vs?"neu prüfen":"VIES prüfen")+'</button>':''); }).join(" ")+'</div><div class="muted small">Die UID-Prüfung (Stufe 2 mit Name) ist für steuerfreie Leistungen an EU-Unternehmer Sorgfaltspflicht. VIES-Abfrage nur auf Klick, Ergebnis wird 7 Tage gespeichert.</div></div>':'')+
    '</section>';
}
F.action("vies",function(uid){ F.toast("Frage VIES …"); F.api("/admin/api/steuer/vies?uid="+encodeURIComponent(uid)).then(function(j){ if(j&&j.ok){ ST.vies=ST.vies||{}; ST.vies[j.uid]=j; F.toast(j.valid?"UID gültig"+(j.name?": "+j.name:""):"UID laut VIES ungültig"+(j.why?" ("+j.why+")":""),!j.valid); F.render(); } else F.toast((j&&j.error)||"VIES-Fehler",true); }); });
/* ---------- Forderungen: Skonto/Kürzungen und Ausfälle (Sollbesteuerung, § 16 UStG) ---------- */
function recvPanel(cur,r){
  var rc=S.receivables(ST.data,ST,F.D.today), mi=rc.minder.filter(function(x){ var d=x.doc.payDate||""; return d>=cur.from.slice(0,4)+"-01-01"; }), alt=rc.alt;
  if(!mi.length&&!alt.length&&!r.minder.length) return "";
  return '<section class="panel"><div class="panel-h"><h2>Entgeltsminderungen und Forderungsausfälle</h2><span class="muted">Sollbesteuerung: die USt wird im Monat der Zahlung bzw. des Ausfalls berichtigt</span></div>'+
    (mi.length?'<div class="scroll"><table><tbody>'+mi.map(function(x){ var d=x.doc; return '<tr><td class="nowrap num">'+deShort(d.payDate)+'</td><td><b>'+esc(docName(d,"out"))+'</b><div class="sub">bezahlt '+eur(d.paid)+' von '+eur(d.gross)+' – Differenz '+eur(x.diff)+' ('+String(x.pct).replace(".",",")+' %)'+(x.pct>50?' · über 50 %: nicht automatisch':'')+'</div></td><td class="nowrap"><label class="row small"><input type="checkbox" data-stmind="'+esc(d.id)+'"'+(x.aktiv?" checked":"")+(x.pct>50?" disabled":"")+'> als Skonto/Kürzung berichtigen</label></td></tr>'; }).join("")+'</tbody></table></div>':'')+
    (alt.length?'<div class="panel-b"><div class="sec-t">Offene Rechnungen älter als 6 Monate</div><table><tbody>'+alt.map(function(x){ var d=x.doc; return '<tr><td class="nowrap num">'+deShort(d.date)+'</td><td><b>'+esc(docName(d,"out"))+'</b><div class="sub">offen '+eur(x.open)+'</div></td><td class="nowrap"><label class="small">uneinbringlich seit <input class="f" type="date" style="width:150px" data-stausfall="'+esc(d.id)+'" value="'+esc(x.ausfall)+'"></label></td></tr>'; }).join("")+'</tbody></table><div class="muted small">Erst ausbuchen, wenn die Forderung tatsächlich uneinbringlich ist (z. B. Insolvenz, erfolglose Exekution). Wird später doch bezahlt, ist die USt wieder abzuführen – Datum dann löschen. In sevDesk die Rechnung entsprechend ausbuchen.</div></div>':'')+'</section>';
}
F.listen("change","[data-stmind]",function(el){ post({op:"doc",id:el.getAttribute("data-stmind"),patch:{noMinderung:!el.checked}},el.checked?"Wird als Entgeltsminderung berichtigt":"Keine Berichtigung"); });
F.listen("change","[data-stausfall]",function(el){ post({op:"doc",id:el.getAttribute("data-stausfall"),patch:{ausfall:el.value||""}},el.value?"Als uneinbringlich erfasst":"Ausfall entfernt"); });
function rulesDiag(){
  var d=S.ruleDiagnosis(ST.data); if(!d.length) return '<div class="panel-b muted small">Steuerregeln deines sevDesk-Kontos konnten nicht abgerufen werden (ReceiptGuidance) – es gilt die Standard-Zuordnung laut sevDesk-Doku.</div>';
  var bad=d.filter(function(x){ return !x.ok; }).length;
  return '<div class="panel-b"><button class="link" data-act="stdocs:rules">Steuerregeln deines sevDesk-Kontos ('+d.length+(bad?', <b class="bad-t">'+bad+' weichen ab</b>':', Zuordnung bestätigt')+')</button>'+(F.UI.stOpen.rules?'<table><tbody>'+d.map(function(x){ return '<tr><td class="num">'+esc(x.id)+'</td><td>'+esc(x.description||x.name)+'<div class="sub">'+esc(x.name+" · "+(x.side||"")+" · "+(x.rates||[]).join(", "))+'</div></td><td>'+esc(x.erkannt||"–")+'</td><td>'+(x.ok?'<span class="tag ok">passt</span>':'<span class="tag bad">Annahme '+esc(x.annahme)+'</span>')+'</td></tr>'; }).join("")+'</tbody></table>':'')+'</div>';
}
function otherPanel(r){
  var o=r.other, parts=[];
  if(o.fx.length) parts.push(['fx','Ausländische Umsatzsteuer – nicht als Vorsteuer abziehbar',o.fx,'Diese Steuer holst du nur über das Erstattungsverfahren des jeweiligen Landes zurück (FinanzOnline → Vorsteuererstattung, bis 30.09. des Folgejahres) – besser: Anbieter bitten, mit deiner UID ohne USt (Reverse Charge) abzurechnen.']);
  if(o.ns.length) parts.push(['ns','Nicht steuerbar (Leistungsort Ausland) – weder in KZ 000 noch in der ZM',o.ns,'']);
  if(o.oss.length) parts.push(['oss','One-Stop-Shop – gehört in die OSS-Erklärung, nicht in die UVA',o.oss,'']);
  if(o.none.length) parts.push(['none','Belege mit Steuer, aber ohne Vorsteuerabzug',o.none,'z. B. Pkw, privat oder in sevDesk als „nicht vorsteuerabziehbar“ gebucht.']);
  if(!parts.length) return "";
  return '<section class="panel"><div class="panel-h"><h2>Nicht in den Kennzahlen</h2><span class="muted">bewusst ausgeklammert – zum Nachprüfen</span></div>'+parts.map(function(p){ var k="o_"+p[0];
    return '<div class="panel-b"><button class="link" data-act="stdocs:'+k+'">'+esc(p[1])+' ('+p[2].length+')</button>'+(p[3]?'<div class="muted small">'+esc(p[3])+'</div>':'')+(F.UI.stOpen[k]?docsList(p[2]):'')+'</div>'; }).join("")+'</section>';
}
function manualPanel(cur){
  var m=(ST.uvaManual&&ST.uvaManual[cur.key])||{}, ks=Object.keys(m);
  var lbl=function(kz){ var x=S.UVA_ROWS.find(function(r){ return r[0]===kz; }); return x?x[1]:""; };
  return '<section class="panel"><div class="panel-h"><h2>Manuelle Kennzahlen</h2><span class="muted">Eigenverbrauch, Einfuhrumsatzsteuer, Berichtigungen (Forderungsausfall, Skonto) …</span></div><div class="panel-b">'+
    (ks.length?'<table class="kz"><tbody>'+ks.map(function(kz){ return '<tr><td><span class="kzb">'+kz+'</span></td><td>'+esc(lbl(kz))+(m[kz].note?'<div class="sub">'+esc(m[kz].note)+'</div>':'')+'</td><td class="r">'+(m[kz].base?money(m[kz].base):'')+'</td><td class="r">'+(m[kz].tax?money(m[kz].tax):'')+'</td><td><button class="btn icon" data-act="stmandel:'+kz+'" aria-label="Entfernen">✕</button></td></tr>'; }).join("")+'</tbody></table>':'')+
    '<form class="row wrap st-man" data-form="stman"><select class="f" name="kz" aria-label="Kennzahl">'+S.MANUAL_KZ.map(function(kz){ return '<option value="'+kz+'">'+kz+' – '+esc(lbl(kz).slice(0,60))+'</option>'; }).join("")+'</select>'+
    '<input class="f num" name="base" placeholder="Bemessungsgrundlage" inputmode="decimal"><input class="f num" name="tax" placeholder="Steuer (negativ = Minderung)" inputmode="decimal"><input class="f" name="note" placeholder="Notiz"><button class="btn">Hinzufügen</button></form>'+
    '<div class="muted small">Bei KZ 001 (Eigenverbrauch) die Steuer zusätzlich über die Satz-Kennzahl erfassen. Forderungsausfall/Skonto: in KZ 090 die USt-Minderung mit Minus eintragen.</div></div></section>';
}
F.form("stman",function(f){ post({op:"manual",key:F.UI.uvaKey,kz:f.kz.value,base:f.base.value,tax:f.tax.value,note:f.note.value},"Kennzahl gespeichert"); });
F.action("stmandel",function(kz){ post({op:"manual",key:F.UI.uvaKey,kz:kz,base:0,tax:0},"Entfernt"); });
F.action("stctl",function(){
  var cur=periodByKey(F.UI.uvaKey), r=S.computeUva(ST.data,ST,cur), c=S.controlCheck(ST.data,ST,cur);
  F.modal('<div class="row-between"><h2 style="font-size:19px">Kontrollrechnung '+esc(cur.label)+'</h2>'+F.btnClose()+'</div><dl class="facts">'+
    '<dt>USt laut sevDesk-Rechnungen ('+c.nOut+', Kopfsummen)</dt><dd class="num money">'+eur(c.ust)+'</dd><dt>− Vorsteuer laut sevDesk-Belegen mit österr. USt ('+c.nIn+')</dt><dd class="num money">'+eur(c.vst)+'</dd><dt><b>= erwartete Zahllast</b></dt><dd class="num money"><b>'+eur(c.zahllast)+'</b></dd>'+
    '<dt>Berechnete Zahllast (KZ 095)</dt><dd class="num money">'+eur(r.zahllast)+'</dd>'+(r.minder.length?'<dt>davon Entgeltsminderungen/Ausfälle (in beiden Rechnungen berücksichtigt)</dt><dd class="num money">'+eur(-r.minder.reduce(function(a,m){ return a+m.amount; },0))+' brutto</dd>':'')+'</dl>'+
    '<p class="muted small">Die Kontrolle summiert nur die Steuerbeträge aus den Belegköpfen. Unterschiede entstehen durch: Reverse Charge (057/066 heben sich auf), manuelle Kennzahlen, Rundung (das Finanzamt rechnet 20 % der Bemessungsgrundlage'+(r.roundDiff.length?': '+r.roundDiff.map(function(x){ return "KZ "+x.kz+" Belege "+eur(x.doc)+" / berechnet "+eur(x.calc); }).join(", "):'')+'), ausländische USt, Cockpit-Einordnungen oder nicht eingeordnete Belege ('+r.review.length+').</p>',"narrow");
});
F.action("uvap",function(k){ F.UI.uvaKey=k; F.render(); });
// „UVA vorbereiten“: sevDesk frisch laden, Einordnung/Abgleich/Kontrolle prüfen und den Datenstrom serverseitig erzeugen – in einem Schritt
F.action("uvaprep",function(k){
  F.toast("Lade sevDesk neu und prüfe …");
  Promise.resolve(load(true)).then(function(){
    var p=periodByKey(k), r=S.computeUva(ST.data,ST,p), ctl=S.controlCheck(ST.data,ST,p), mm=S.mismatches(ST.data,ST,p.from,p.to), zmr=S.zmRows(r);
    var reqs=[F.api("/admin/api/fon/xml",{body:{art:"U30",key:k}})]; if(zmr.length) reqs.push(F.api("/admin/api/fon/xml",{body:{art:"U13",key:k}}));
    return Promise.all(reqs).then(function(x){
      var u=x[0]||{}, z=x[1], fixable=mm.filter(function(m){ return m.fixable; }).length, dz=r2(r.zahllast-ctl.zahllast);
      var item=function(ok,t,sub){ return '<li><span class="tag '+(ok===true?"ok":ok===false?"bad":"warn")+'">'+(ok===true?"ok":ok===false?"Fehler":"prüfen")+'</span> '+t+(sub?'<div class="muted small">'+sub+'</div>':'')+'</li>'; };
      var errs=(u.befunde||[]).filter(function(b){ return b.art==="fehler"; }).length+((z&&z.befunde)||[]).filter(function(b){ return b.art==="fehler"; }).length;
      F.modal('<div class="row-between"><h2 style="font-size:19px">UVA '+esc(p.label)+' – vorbereitet</h2>'+F.btnClose()+'</div><ul class="plain">'+
        item(true,"sevDesk-Daten neu geladen ("+ST.data.invoices.length+" Rechnungen, "+ST.data.vouchers.length+" Belege)")+
        item(!r.review.length,r.review.length?r.review.length+" Beleg(e) nicht eingeordnet":"alle Belege eingeordnet")+
        item(mm.length?"warn":true,mm.length?mm.length+" Abweichung(en) zu sevDesk"+(fixable?", davon "+fixable+" per Klick korrigierbar":""):"keine Abweichungen zu sevDesk")+
        item(Math.abs(dz)<=5?true:"warn","Kontrollrechnung: "+eur(ctl.zahllast)+" vs. berechnet "+eur(r.zahllast)+(Math.abs(dz)>0.01?" (Δ "+eur(dz)+")":""))+
        item(u.ok&&!(u.befunde||[]).some(function(b){ return b.art==="fehler"; }),"Datenstrom U30 erzeugt (Zahllast "+eur(u.zahllast)+")",(u.befunde||[]).map(function(b){ return esc(b.text); }).join("<br>")||(u.error?esc(u.error):""))+
        (z?item(z.ok&&!(z.befunde||[]).some(function(b){ return b.art==="fehler"; }),"Datenstrom ZM erzeugt ("+zmr.length+" Meldezeile(n))",(z.befunde||[]).map(function(b){ return esc(b.text); }).join("<br>")):"")+'</ul>'+
        '<div class="foot"><span class="muted small">'+(errs?"Erst die Fehler beheben, dann prüfen.":"Bereit zur Testübermittlung.")+'</span><span class="row"><button class="btn" data-act="fonxml:U30">XML ansehen</button><button class="btn primary" data-act="fonsend:U30:T"'+(errs||!(ST.fonCfg||{}).ready?" disabled":"")+'>Prüfen (Test)</button></span></div>',"wide");
      F.render();
    });
  });
});
F.action("uvadone",function(k){ var p=periodByKey(k); var r=S.computeUva(ST.data,ST,p); var sum={zahllast:r.zahllast,kz:S.uvaKzMap(r)};
  F.confirm("UVA "+p.label+" als erledigt markieren? ("+(r.zahllast>=0?"Zahllast ":"Gutschrift ")+eur(Math.abs(r.zahllast))+")","Erledigt",function(){ post({op:"done",kind:"uva",key:k,summary:sum},"UVA als erledigt gespeichert"); }); });
F.action("uvaundo",function(k){ F.confirm("Erledigt-Markierung für diese UVA entfernen? (In FinanzOnline Eingereichtes bleibt eingereicht.)","Zurücksetzen",function(){ post({op:"undone",kind:"uva",key:k},"Zurückgesetzt"); }); });

/* ---------- sevDesk-Abgleich ---------- */
function syncPanel(cur,r,mm){
  var done=ST.uva[cur.key]||{}, tx=(ST.data.transactions||[]).filter(function(t){ return t.date>cur.to&&t.date<=F.ymd(new Date(cur.year,cur.endMonth+2,31)); });
  var match=tx.filter(function(t){ return r.zahllast>0&&Math.abs(Math.abs(t.amount)-r.zahllast)<0.02; }), other=tx.filter(function(t){ return match.indexOf(t)<0; });
  var rows=mm.map(function(m,i){ var d=m.doc, out=m.kind==="out";
    return '<tr><td class="nowrap num">'+deShort(d.date)+'</td><td><b>'+esc(docName(d,out?"out":"in"))+'</b><div class="sub">'+esc(m.t)+'</div>'+(m.fix?'<div class="sub">'+esc(m.fix)+'</div>':'')+'</td><td class="r">'+money(d.net)+'</td><td class="nowrap">'+
      (m.type==="rule"&&!out&&/Reverse Charge/.test(m.t)?'<button class="btn" data-act="stkz:'+d.id+':rc">Als RC übernehmen</button> <button class="btn" data-act="stkz:'+d.id+':none">Kein RC</button> ':'')+
      aiBtn(d.id)+(m.fixable?' <button class="btn primary" data-act="sevfix:'+i+'">In sevDesk korrigieren ('+esc(S.TAXRULE_TXT[m.rule]||m.rule)+')</button>':(m.enshrined?'<span class="tag grey">festgeschrieben</span>':''))+'</td></tr>'; }).join("");
  return '<section class="panel"><div class="panel-h"><h2>Abgleich mit sevDesk</h2><span class="muted">Was im Cockpit gerechnet wird, soll auch in sevDesk so gebucht sein – und umgekehrt</span></div>'+
    (mm.length?'<div class="scroll"><table><tbody>'+rows+'</tbody></table></div>':'<div class="panel-b muted">Keine Abweichungen bei Steuerregeln, UIDs und Leistungsdaten in diesem Zeitraum.</div>')+
    '<div class="panel-b row wrap">'+(done.tagged?'<span class="tag ok">In sevDesk getaggt: '+esc(done.tagged.name)+' ('+done.tagged.ok+')</span>':'<button class="btn" data-act="sevtag:'+cur.key+'"'+(done.doneAt?'':' disabled title="Erst nach Abgabe"')+'>Belege in sevDesk taggen (UVA-'+cur.year+'-'+cur.key.slice(5)+')</button>')+
      (done.paid?'<span class="tag ok">USt-Zahlung '+eur(done.paid.amount)+' am '+de(done.paid.date)+' in sevDesk'+(done.paid.booked?' verbucht':' angelegt (Zuordnung offen)')+'</span>':
        match.map(function(t){ return '<button class="btn primary" data-act="ustpay:'+t.id+'">Zahlung '+eur(t.amount)+' vom '+de(t.date)+' als USt-Vorauszahlung in sevDesk buchen</button>'; }).join("")+
        (!match.length&&other.length?'<span class="muted small">Finanzamt-Buchungen nach Zeitraumende: '+other.map(function(t){ return eur(t.amount)+' am '+deShort(t.date)+' <button class="link" data-act="ustpay:'+t.id+'">buchen</button>'; }).join(" · ")+'</span>':'')+
        (!tx.length?'<span class="muted small">Noch keine Zahlung an das Finanzamt in sevDesk gefunden.</span>':''))+'</div>'+
    rulesDiag()+'<div class="panel-b muted small">Änderungen in sevDesk passieren nur nach deiner Bestätigung und nie bei festgeschriebenen Belegen. „Als RC übernehmen“ ändert nur die Einordnung im Cockpit.</div></section>';
}
F.action("stkz",function(v){ var a=v.split(":"); post({op:"doc",id:a[0],patch:{kz:a[1]}},a[1]==="rc"?"Als Reverse Charge übernommen":"Gespeichert"); });
F.action("sevfix",function(i){ var cur=periodByKey(F.UI.uvaKey), m=S.mismatches(ST.data,ST,cur.from,cur.to)[+i]; if(!m) return;
  F.confirm("Steuerregel von „"+docName(m.doc,"in")+"“ ("+eur(m.doc.gross)+") in sevDesk auf „"+(S.TAXRULE_TXT[m.rule]||m.rule)+"“ ändern?","In sevDesk ändern",function(){
    F.api("/admin/api/steuer/sevfix",{body:{id:m.doc.id,taxRule:m.rule,confirm:true}}).then(function(j){ if(j&&j.ok){ F.toast("In sevDesk geändert"); load(true); } else F.toast("sevDesk: "+((j&&j.error)||"Fehler"),true); }); }); });
F.action("sevtag",function(k){ var p=periodByKey(k); F.confirm("Alle Belege der UVA "+p.label+" in sevDesk mit dem Tag „UVA-"+p.year+"-"+k.slice(5)+"“ versehen?","Taggen",function(){
  F.toast("Tagge Belege in sevDesk …"); F.api("/admin/api/steuer/sevtag",{body:{key:k,confirm:true}}).then(function(j){ if(j&&j.ok){ apply(j.steuer); F.toast(j.tagged+" von "+j.total+" Belegen getaggt"+(j.fail?" ("+j.fail+" fehlgeschlagen)":"")); F.render(); } else F.toast("sevDesk: "+((j&&j.error)||"Fehler"),true); }); }); });
F.action("ustpay",function(id){ var p=periodByKey(F.UI.uvaKey), t=(ST.data.transactions||[]).find(function(x){ return x.id===id; }); if(!t) return;
  F.confirm("In sevDesk einen Beleg „USt-Vorauszahlung "+p.label+"“ über "+eur(Math.abs(t.amount))+" anlegen und mit der Bankbuchung vom "+de(t.date)+" verknüpfen?","Beleg anlegen",function(){
    F.api("/admin/api/steuer/ustpay",{body:{key:p.key,transactionId:id,confirm:true}}).then(function(j){ if(j&&j.ok){ apply(j.steuer); F.toast(j.booked?"Beleg angelegt und verbucht":"Beleg angelegt – Zuordnung bitte in sevDesk prüfen ("+j.bookErr+")",!j.booked); F.render(); } else F.toast("sevDesk: "+((j&&j.error)||"Fehler"),true); }); }); });

/* ---------- FinanzOnline ---------- */
function fonPanel(cur,r,zmr,done){
  var cfg=ST.fonCfg||{}, arch=((ST.fon&&ST.fon.archive)||[]).map(function(a,i){ a._i=i; return a; }).filter(function(a){ return a.key===cur.key; }), running=cur.to>=F.D.today;
  return '<section class="panel"><div class="panel-h"><h2>FinanzOnline</h2><span class="muted">Direkt übermitteln – „Prüfen“ testet nur, „Abgeben“ reicht verbindlich ein</span></div><div class="panel-b">'+
    (!cfg.ready?'<div class="notice"><span>'+esc(cfg.fehlt||"FinanzOnline-Zugang ist nicht eingerichtet.")+'</span></div>':'')+
    (!ST.settings.steuernummer?'<div class="notice"><span>Bitte oben die Steuernummer eintragen (9 Ziffern inkl. Finanzamtsnummer).</span></div>':'')+
    '<div class="row wrap"><b style="min-width:50px">UVA</b><button class="btn" data-act="fonxml:U30">XML ansehen</button><button class="btn" data-act="fonsend:U30:T"'+(cfg.ready&&!running?'':' disabled')+'>Prüfen (Test)</button><button class="btn glow" data-act="fonsend:U30:P"'+(cfg.ready&&!running?'':' disabled')+'>Abgeben</button>'+(running?'<span class="muted small">Zeitraum läuft noch</span>':'')+'</div>'+
    (zmr.length?'<div class="row wrap" style="margin-top:8px"><b style="min-width:50px">ZM</b><button class="btn" data-act="fonxml:U13">XML ansehen</button><button class="btn" data-act="fonsend:U13:T"'+(cfg.ready&&!running?'':' disabled')+'>Prüfen (Test)</button><button class="btn glow" data-act="fonsend:U13:P"'+(cfg.ready&&!running?'':' disabled')+'>Abgeben</button></div>':'')+
    (arch.length?'<div class="sec-t" style="margin-top:14px">Übermittlungen</div><table><tbody>'+arch.map(function(a){ return '<tr><td class="nowrap">'+de(a.at)+' '+new Date(a.at).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"})+'</td><td>'+a.art+' · '+(a.modus==="P"?"Abgabe":"Prüfung")+' · Paket '+a.paket+'</td><td><span class="tag '+(a.rc===0?"ok":"bad")+'">'+esc(a.status)+'</span> <span class="muted small">rc '+a.rc+' · '+esc(a.msg||"")+'</span></td><td><a class="link" href="/admin/api/fon/archiv?i='+a._i+'">XML</a></td></tr>'; }).join("")+'</tbody></table>':'')+
    '<div class="muted small" style="margin-top:8px">Das Webservice-PIN wird nur für diese eine Übermittlung verwendet und nirgends gespeichert. Das Übermittlungsprotokoll steht danach in deiner FinanzOnline-Databox.</div></div></section>';
}
function fonKey(art){ return art==="JAHR_ERKL"?F.UI.jabYear:F.UI.uvaKey; }
var ART_TXT={U30:"UVA (U30)",U13:"ZM (U13)",JAHR_ERKL:"Jahreserklärung (E1 + E1a + U1)"};
F.action("fonxml",function(art){
  F.api("/admin/api/fon/xml",{body:{art:art,key:fonKey(art)}}).then(function(j){
    if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; }
    F.modal('<div class="row-between"><h2 style="font-size:19px">'+ART_TXT[art]+' – Datenstrom</h2>'+F.btnClose()+'</div>'+befundeHtml(j.befunde)+
      (j.xml?'<pre class="xmlpre">'+esc(j.xml)+'</pre><div class="foot"><span class="muted small">Paketnummer 999999999 = Vorschau; beim Senden wird eine echte Nummer vergeben.</span><button class="btn" data-act="fondl">Herunterladen</button></div>':'<p>Ohne Steuernummer kann kein Datenstrom erzeugt werden.</p>'),"wide");
    F.UI.fonXml={art:art,xml:j.xml};
  });
});
F.action("fondl",function(){ var x=F.UI.fonXml; if(!x) return; var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([x.xml],{type:"application/xml"})); a.download=x.art+"_"+fonKey(x.art)+".xml"; document.body.appendChild(a); a.click(); a.remove(); });
function befundeHtml(b){ if(!b||!b.length) return '<div class="tag ok" style="margin-bottom:10px">Keine Beanstandungen</div>'; return '<ul class="plain" style="margin-bottom:10px">'+b.map(function(x){ return '<li><span class="tag '+(x.art==="fehler"?"bad":"warn")+'">'+(x.art==="fehler"?"Fehler":"Hinweis")+'</span> '+esc(x.text)+'</li>'; }).join("")+'</ul>'; }
F.action("fonsend",function(v){
  var a=v.split(":"), art=a[0], modus=a[1], cfg=ST.fonCfg||{}, what, r={zahllast:0};
  if(art==="JAHR_ERKL"){ var jj=S.computeJab(ST.data,ST,F.UI.jabYear); what="Jahreserklärung "+F.UI.jabYear+" (E1 + E1a + U1) – steuerlicher Gewinn "+eur(jj.steuerGewinn)+", U1-Zahllast "+eur(jj.u1.zahllast); }
  else { var p=periodByKey(F.UI.uvaKey); r=S.computeUva(ST.data,ST,p); what=(art==="U30"?"UVA ":"ZM ")+p.label+(art==="U30"?" – "+(r.zahllast>=0?"Zahllast ":"Gutschrift ")+eur(Math.abs(r.zahllast)):""); }
  F.modal('<form data-form="fonsend" class="stackf"><input type="hidden" name="art" value="'+art+'"><input type="hidden" name="modus" value="'+modus+'"><input type="hidden" name="zl" value="'+r.zahllast+'">'+
    '<h2 style="font-size:19px">'+(modus==="P"?"Verbindlich abgeben":"Bei FinanzOnline prüfen (Test)")+'</h2><p>'+esc(what)+'</p>'+
    (modus==="P"?'<p class="muted">Die Erklärung gilt damit als eingereicht. Die Kennzahlen werden vor dem Senden aus den aktuellen sevDesk-Daten neu berechnet; weichen sie ab, wird nichts gesendet.</p>':'<p class="muted">Der Datenstrom wird geprüft und verworfen – eingereicht wird nichts.</p>')+
    '<label class="fl">PIN des Webservice-Benutzers'+(cfg.pinEnv?' (leer lassen = PIN aus Railway)':'')+'<input class="f" type="password" name="pin" autocomplete="off"'+(cfg.pinEnv?'':' required')+'></label>'+
    (modus==="P"?'<label class="fl">Zum Bestätigen „abgeben“ eintippen<input class="f" name="best" autocomplete="off" required pattern="[Aa]bgeben"></label>':'')+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn '+(modus==="P"?"glow":"primary")+'">'+(modus==="P"?"Jetzt abgeben":"Prüfen")+'</button></span></div></form>',"narrow");
});
F.form("fonsend",function(f){
  var body={art:f.art.value,key:fonKey(f.art.value),pin:f.pin.value,expectZahllast:f.art.value==="U30"?num(f.zl.value):undefined}, P=f.modus.value==="P"; if(P) body.bestaetigung=f.best.value;
  f.pin.value=""; F.closeModal(); F.toast(P?"Übermittle an FinanzOnline …":"Prüfe bei FinanzOnline …");
  F.api(P?"/admin/api/fon/submit":"/admin/api/fon/check",{body:body}).then(function(j){ body.pin=null;
    if(j&&j.steuer) apply(j.steuer);
    if(j&&j.ok) F.toast(P?"Eingereicht (Paket "+j.paket+"): "+j.msg:"Prüfung bestanden: "+j.msg); else F.toast((j&&(j.error||j.msg))||"Fehler bei der Übermittlung",true);
    F.render(); });
});

/* ---------- ZM ---------- */
function zmPanel(cur,r,zmr){
  if(!zmr.length) return "";
  return '<section class="panel"><div class="panel-h"><h2>Zusammenfassende Meldung (ZM)</h2><span class="muted">Leistungen an EU-Unternehmer – nach Leistungszeitraum, Abgabe bis '+de(F.ymd(new Date(cur.year,cur.endMonth+1,0)))+'</span></div><div class="scroll"><table><thead><tr><th>Kunde</th><th>UID</th><th>Art</th><th class="r">Bemessungsgrundlage</th></tr></thead><tbody>'+
    zmr.map(function(z){ return '<tr><td>'+esc(z.kunde)+'<div class="sub">'+esc(z.docs.map(function(d){ return d.nr; }).join(", "))+'</div></td><td>'+(z.uid?esc(z.uid)+(z.valid.ok?'':' <span class="tag bad">'+esc(z.valid.why)+'</span>'):'<span class="tag bad">UID fehlt</span>')+'</td><td>'+(z.dreieck?"Dreiecksgeschäft":z.kind==="S"?"sonstige Leistung":"Warenlieferung")+'</td><td class="r">'+money(z.net)+'</td></tr>'; }).join("")+'</tbody></table></div>'+
    '<div class="panel-b muted small">Die ZM kennt nur ganze Euro. Die UID muss beim Kunden in sevDesk hinterlegt sein.</div></section>';
}

/* ---------- Einstellungen ---------- */
function settingsBar(){
  var s=ST.settings;
  return '<div class="row wrap st-set"><span class="tag info" title="Fix hinterlegt">Sollbesteuerung</span>'+
    '<label class="fl inline">UVA-Zeitraum <select class="f" data-stset="zeitraum"><option value="quartal"'+(s.zeitraum==="quartal"?" selected":"")+'>Quartal</option><option value="monat"'+(s.zeitraum==="monat"?" selected":"")+'>Monat</option></select></label>'+
    '<label class="fl inline">Steuernummer <input class="f" style="width:130px" data-stset="steuernummer" value="'+esc(s.steuernummer||"")+'" placeholder="98 123/4567"></label>'+
    '<button class="btn" data-act="streload">sevDesk neu laden</button><span class="muted small">'+(ST.data?"Stand "+F.ago(ST.data.fetchedAt):"")+(loadErr?' · <span class="bad-t">'+esc(loadErr)+'</span>':'')+'</span></div>';
}
F.listen("change","[data-stset]",function(el){ var o={}; o[el.getAttribute("data-stset")]=el.value; post({op:"settings",settings:o},"Gespeichert"); if(el.getAttribute("data-stset")==="zeitraum") F.UI.uvaKey=null; });
F.action("streload",function(){ load(true); F.toast("Lade Rechnungen und Belege aus sevDesk …"); });
function loadingBox(){ if(!ST&&!loading) load(false); return '<section class="panel"><div class="empty">'+(loadErr?'sevDesk-Daten konnten nicht geladen werden: '+esc(loadErr)+' <button class="btn" data-act="streload">Erneut versuchen</button>':'Lade alle Rechnungen und Belege aus sevDesk …')+'</div></section>'; }

/* ---------- JAB: E1a + U1 + E1 ---------- */
var E1A_ERTR=[["9040","Erträge/Betriebseinnahmen (Waren-/Leistungserlöse), netto, nach Zahlungseingang"],["9050","Erträge, die in einer Mitteilung gemäß § 109a erfasst sind"],["9060","Anlagenerträge/Entnahmewerte von Anlagevermögen"],["9090","Übrige Erträge (z. B. Zinsen)"]];
var K5_TXT={"9276":"Investitionsfreibetrag (10 %)","9277":"Öko-Investitionsfreibetrag (15 %)","9344":"Befristet erhöhter Investitionsfreibetrag (20 %)","9345":"Befristet erhöhter Öko-Investitionsfreibetrag (22 %)","9280":"Korrektur Werbe-/Repräsentationsaufwand (50 % Bewirtung)","9260":"Korrekturen zu Kfz-Kosten (Privatanteil, Luxustangente)","9290":"Sonstige Änderungen – Saldo"};
function e1aLabel(kz){ var x=S.E1A.find(function(e){ return e[0]===kz; }); return x?x[1]:kz; }
function jin(key,label,val,hint){ return '<label class="fl">'+esc(label)+'<input class="f num" inputmode="decimal" data-jin="'+key+'" value="'+(val?String(val).replace(".",","):"")+'">'+(hint?'<span class="muted small">'+esc(hint)+'</span>':'')+'</label>'; }
function jchk(key,label,val){ return '<label class="row small"><input type="checkbox" data-jin="'+key+'"'+(val?" checked":"")+'> '+esc(label)+'</label>'; }
function renderJab(){
  if(!ST||!ST.data) return loadingBox();
  var years={}; ST.data.invoices.concat(ST.data.vouchers).forEach(function(d){ var y=String(d.payDate||d.date||"").slice(0,4); if(y) years[y]=1; });
  var ys=Object.keys(years).sort().reverse(), cy=String(new Date().getFullYear());
  var y=F.UI.jabYear||String(+cy-1); if(ys.indexOf(y)<0&&ys.length) y=ys.find(function(x){return x<cy;})||ys[0];
  F.UI.jabYear=y;
  var j=S.computeJab(ST.data,ST,y), done=ST.jab[y], due=(+y+1)+"-06-30", running=y>=cy, inp=j.inp, Y=j.Y;
  var row=function(kz,label,val,strong,openKey){ return '<tr'+(strong?' class="grp"':'')+'><td>'+(kz?'<span class="kzb">'+kz+'</span>':'')+'</td><td>'+label+(openKey?' <button class="link" data-act="jabopen:'+openKey+'">Herleitung</button>':'')+'</td><td class="r">'+money(val)+'</td></tr>'+(openKey&&F.UI.jabOpen[openKey]?'<tr class="sub-row"><td colspan="3">'+jabDerivation(j,openKey)+'</td></tr>':''); };
  var aufwKz=Object.keys(j.E).sort();
  var e1a='<table class="kz"><thead><tr><th>KZ</th><th>E1a – Bezeichnung</th><th class="r">Betrag</th></tr></thead><tbody>'+
    E1A_ERTR.map(function(e){ return (e[0]==="9040"||e[0]==="9050"||j.ertr[e[0]])?row(e[0],esc(e[1]),j.ertr[e[0]],false,e[0]==="9040"?"9040":""):""; }).join("")+
    row("","Summe Erträge",j.ertrSum,true)+
    aufwKz.map(function(kz){ return row(kz,esc(e1aLabel(kz)),j.E[kz],false,kz); }).join("")+
    row("","Summe Aufwendungen/Betriebsausgaben",j.aufw,true)+row("","Gewinn/Verlust (Punkt 55)",j.gewinn,true)+
    Object.keys(j.K5).map(function(kz){ return row(kz,esc(K5_TXT[kz]||kz),j.K5[kz]); }).join("")+
    (Object.keys(j.K5).length?row("","Gewinn nach Korrekturen",j.nachKorr,true):"")+
    row("9221","Grundfreibetrag (15 % bis 33.000 €, max. 4.950 €)",j.grund)+
    (j.g9227||j.invMax?row("9227","Investitionsbedingter Gewinnfreibetrag (körperliche WG) – möglich bis "+eur(j.invMax)+", gedeckt durch Investitionen "+eur(j.gfbInvest),j.g9227):"")+
    (j.g9229?row("9229","Investitionsbedingter Gewinnfreibetrag (Wertpapiere)",j.g9229):"")+
    row("","Steuerlicher Gewinn → E1 (Einkünfte aus Gewerbebetrieb KZ 330 bzw. selbständiger Arbeit KZ 320)",j.steuerGewinn,true)+'</tbody></table>';
  var plaus=S.plausibility(ST.data,ST,y);
  return '<div class="row wrap st-set"><label class="fl inline">Jahr <select class="f" data-jaby>'+(ys.length?ys:[y]).map(function(x){ return '<option'+(x===y?" selected":"")+'>'+x+'</option>'; }).join("")+'</select></label><button class="btn" data-act="streload">sevDesk neu laden</button>'+
    '<span class="muted small">Einnahmen-Ausgaben-Rechnung (§ 4 Abs. 3 EStG), Nettosystem, nach Zahlungsdatum'+(Y.verified?'':' · <b class="bad-t">Werte für '+esc(y)+' nicht geprüft</b>')+'</span></div>'+
    '<section class="panel"><div class="panel-h"><div><h2>Jahresabschluss '+esc(y)+'</h2><div class="muted">Abgabe über FinanzOnline bis '+de(due)+' (Papier bis 30.04.)'+(running?' · Jahr läuft noch – Zahlungen bis 31.12. fehlen':'')+'</div></div>'+
      '<div class="row">'+(done?'<span class="tag ok">Erledigt am '+de(done.doneAt)+'</span><button class="btn" data-act="jabundo:'+y+'">Zurücksetzen</button>':'<button class="btn" data-act="jabdone:'+y+'"'+(running?' disabled title="Erst nach Jahresende"':'')+'>Als erledigt markieren</button>')+'<button class="btn" data-act="jabexport:'+y+'">Kennzahlen kopieren</button></div></div>'+
    '<div class="kpis" style="padding:14px 18px"><div class="kpi panel"><span class="k">Einnahmen netto</span><span class="v num money">'+F.eur0(j.ertrSum)+'</span></div><div class="kpi panel"><span class="k">Ausgaben netto</span><span class="v num money">'+F.eur0(j.aufw)+'</span></div><div class="kpi panel"><span class="k">Steuerlicher Gewinn</span><span class="v num money'+(j.steuerGewinn<0?" bad-t":"")+'">'+F.eur0(j.steuerGewinn)+'</span><span class="s">nach Freibeträgen</span></div><div class="kpi panel"><span class="k">ESt geschätzt</span><span class="v num money">'+F.eur0(j.est.tax)+'</span><span class="s">'+(j.est.rest>=0?"Nachzahlung ":"Gutschrift ")+F.eur0(Math.abs(j.est.rest))+'</span></div></div></section>'+
    plausPanel(plaus)+
    '<section class="panel"><div class="panel-h"><h2>E1a – Beilage für Einzelunternehmer</h2><span class="muted">vollständige Einnahmen-Ausgaben-Rechnung · USt-Nettosystem ankreuzen</span></div><div class="scroll">'+e1a+'</div></section>'+
    inputsPanel(j,y)+catsPanel(j)+assetsPanel(j,y)+tripsPanel(j,y)+pauschPanel(j)+kidsPanel(j,y)+estPanel(j,y)+
    '<section class="panel"><div class="panel-h"><h2>U1 – Umsatzsteuererklärung '+esc(y)+'</h2><span class="muted">Sollbesteuerung</span></div>'+kzTable(j.u1,false)+
      '<div class="panel-b"><dl class="facts"><dt>Zahllast laut U1 (KZ 095)</dt><dd class="num money">'+eur(j.u1.zahllast)+'</dd><dt>Davon über '+j.doneUva+' erledigte UVA'+(j.doneUva===1?"":"s")+' bereits gemeldet</dt><dd class="num money">'+eur(j.paidUva)+'</dd><dt><b>'+(j.u1.zahllast-j.paidUva>=0?"Restschuld":"Gutschrift")+'</b></dt><dd class="num money"><b>'+eur(Math.abs(j.u1.zahllast-j.paidUva))+'</b></dd></dl></div></section>'+
    jahrFonPanel(j,y)+
    '<section class="panel"><div class="panel-b muted small"><b>So wird gerechnet:</b> Einnahmen und Ausgaben zählen im Jahr der Zahlung, jeweils netto. Nicht abziehbare Vorsteuer (Pkw, ausländische USt) ist Aufwand. Privates, Steuerzahlungen (USt, ESt), Umbuchungen und Kredittilgungen zählen nicht. Kirchenbeitrag und Spenden an begünstigte Einrichtungen werden von den Empfängern automatisch an das Finanzamt gemeldet – nicht noch einmal eintragen. Kontrollrechnung aus deinen sevDesk-Daten – vor dem Einreichen prüfen bzw. mit deinem Steuerberater abstimmen.</div></section>';
}
function plausPanel(pl){
  var bad=pl.filter(function(x){ return !x.ok; }).length;
  return '<section class="panel"><div class="panel-h"><h2>Plausibilität</h2><span class="muted">'+(bad?bad+" Punkt"+(bad===1?"":"e")+" prüfen":"alles stimmig")+'</span></div><div class="scroll"><table><tbody>'+pl.map(function(x){
    return '<tr><td><span class="tag '+(x.ok?"ok":"warn")+'">'+(x.ok?"ok":"prüfen")+'</span></td><td><b>'+esc(x.t)+'</b><div class="sub">'+esc(x.hint||"")+'</div>'+(x.docs&&x.docs.length&&!x.ok?'<div class="sub">'+esc(x.docs.slice(0,8).map(function(d){ return (d.nr||d.supplier||d.id)+" ("+eur(d.net)+")"; }).join(", "))+'</div>':'')+'</td><td class="r nowrap">'+(typeof x.a==="number"&&x.b!=null?money(x.a)+'<div class="sub">sevDesk '+eur(x.b)+(x.d?' · Δ '+eur(x.d):'')+'</div>':esc(String(x.a==null?"":x.a)))+'</td></tr>'; }).join("")+'</tbody></table></div></section>';
}
function jabDerivation(j,kz){
  if(kz==="9040") return docsList(j.revDocs.map(function(x){ return {doc:x.doc,kind:"out",base:x.net,date:x.date,why:x.src==="bank"?"Zahlung laut Bank":"Zahlungsdatum"}; }),{noSelect:true});
  var cats=j.cats.filter(function(c){ return c.kz===kz||(kz==="9200"&&c.kz==="9200B"); }), parts=[];
  if(cats.length) parts.push('<table><tbody>'+cats.map(function(c){ return '<tr><td>'+esc(c.cat)+'<div class="sub">'+c.docs.slice(0,6).map(function(d){ return esc(d.supplier||"Beleg")+" "+deShort(d.payDate||d.date); }).join(", ")+(c.docs.length>6?" …":"")+'</div></td><td class="r">'+money(c.sum)+'</td></tr>'; }).join("")+'</tbody></table>');
  if(kz==="9130"||kz==="9134"||kz==="9210") j.assets.forEach(function(x){ if(x.cur&&(x.cur.kz===kz||kz==="9210"&&x.cur.abgang)) parts.push('<div class="sub">'+esc(x.a.doc.supplier||"Anlagegut")+': '+(kz==="9210"?"Restbuchwert "+eur(x.cur.abgang):"AfA "+eur(x.cur.afa))+'</div>'); });
  if(kz==="9160"&&j.trips.n) parts.push('<div class="sub">Fahrtenbuch: '+j.trips.kmAbs+' km × '+eur(j.Y.km)+' = '+eur(j.trips.kmGeld)+' · Tagesgeld '+eur(j.trips.tag)+' · Nächtigung '+eur(j.trips.naecht)+'</div>');
  if(/^(9215|9217|9216|9165)$/.test(kz)) parts.push('<div class="sub">aus deinen Eingaben unten</div>');
  return parts.join("")||'<div class="empty">Keine Einzelposten.</div>';
}
F.action("jabopen",function(k){ F.UI.jabOpen[k]=!F.UI.jabOpen[k]; F.render(); });
function inputsPanel(j,y){
  var i=j.inp;
  return '<section class="panel"><div class="panel-h"><h2>Pauschalen, Freibeträge und Korrekturen '+esc(y)+'</h2><span class="muted">Beträge, die nicht aus sevDesk kommen</span></div><div class="panel-b st-grid">'+
    '<label class="fl">Arbeitsplatzpauschale<select class="f" data-jin="ap"><option value="">keine</option><option value="klein"'+(i.ap==="klein"?" selected":"")+'>klein – 300 € (KZ 9215)</option><option value="gross"'+(i.ap==="gross"?" selected":"")+'>groß – 1.200 € (KZ 9217, keine anderen Einkünfte über 11.000 €)</option></select></label>'+
    jin("mobiliar","Ergonomisches Mobiliar (KZ 9216, max. 300 €)",i.mobiliar)+jin("oeffi","Kosten Öffi-Wochen-/Monats-/Jahreskarte (50 % → KZ 9165)",i.oeffi)+
    jin("svs","SVS-Beiträge, falls nicht in sevDesk (KZ 9225)",i.svs)+jin("sonstAufw","Sonstige Ausgaben ohne Beleg in sevDesk (KZ 9230)",i.sonstAufw)+
    jin("e9050","Erlöse laut § 109a-Mitteilung (KZ 9050)",i.e9050)+jin("e9060","Verkaufserlös Anlagevermögen (KZ 9060)",i.e9060)+jin("e9090","Übrige Erträge, z. B. Zinsen (KZ 9090)",i.e9090)+
    jin("kfzPrivat","Kfz-Privatanteil (Korrektur KZ 9260, positiv)",i.kfzPrivat)+jin("k9290","Sonstige Änderungen (KZ 9290, ± )",i.k9290)+
    jin("wertpapiere","Wertpapiere für den Gewinnfreibetrag (KZ 9229)",i.wertpapiere,"Anschaffung im Jahr, mind. 4 Jahre im Betrieb")+
    '<div class="stackf">'+jchk("gfbVerzicht","Auf den Grundfreibetrag verzichten",i.gfbVerzicht)+'</div></div></section>';
}
F.listen("change","[data-jin]",function(el){ var o={}, k=el.getAttribute("data-jin"); o[k]=el.type==="checkbox"?el.checked:el.value; post({op:"jabinput",year:F.UI.jabYear,patch:o},"Gespeichert"); });
function catsPanel(j){
  return '<section class="panel"><div class="panel-h"><h2>Buchungskategorien → E1a-Kennzahlen</h2><span class="muted">Zuordnung wird gespeichert und gilt für alle Jahre</span></div><div class="scroll"><table><thead><tr><th>Kategorie in sevDesk</th><th class="r">Betrag</th><th>Kennzahl</th></tr></thead><tbody>'+
    j.cats.map(function(c){ var cur=(ST.mapping&&ST.mapping[c.cat])||""; return '<tr><td><b>'+esc(c.cat)+'</b><div class="sub">'+c.n+' Position'+(c.n===1?"":"en")+(cur?"":" · automatisch zugeordnet")+'</div></td><td class="r">'+money(c.sum)+'</td><td><select class="f" data-stmap="'+esc(c.cat)+'" aria-label="Kennzahl">'+S.E1A.map(function(x){ return '<option value="'+x[0]+'"'+(c.kz===x[0]?" selected":"")+'>'+(x[0]==="none"?"":x[0].replace("B","")+" – ")+esc(x[1])+'</option>'; }).join("")+'</select></td></tr>'; }).join("")+'</tbody></table></div></section>';
}
F.listen("change","[data-stmap]",function(el){ var m={}; m[el.getAttribute("data-stmap")]=el.value; post({op:"mapping",mapping:m},"Zuordnung gespeichert"); });
function assetsPanel(j,y){
  var list=j.assets.map(function(x){ return {doc:x.a.doc,a:x.a,cur:x.cur,ifb:x.ifb}; });
  j.checks.forEach(function(c){ if(!list.some(function(x){ return x.doc===c.doc; })) list.push({doc:c.doc,check:true}); });
  if(!list.length) return "";
  return '<section class="panel"><div class="panel-h"><h2>Anlagevermögen</h2><span class="muted">über 1.000 € netto: AfA über die Nutzungsdauer statt Sofortaufwand · IFB/Gewinnfreibetrag</span></div><div class="scroll"><table class="st-assets"><tbody>'+
    list.map(function(x){ var d=x.doc, c=docCfg(d.id), a=x.a;
      return '<tr><td class="num">'+deShort(d.date)+'<div class="sub">'+esc(String(d.date||"").slice(0,4))+'</div></td><td><b>'+esc(d.supplier||"Beleg")+'</b><div class="sub">'+esc(d.desc||"")+'</div>'+
        (a?'<div class="sub">AHK '+eur(a.ahk)+' · '+(x.cur?(x.cur.kz==="9134"?"degressive ":"")+'AfA '+esc(y)+': '+eur(x.cur.afa)+' · Buchwert Jahresbeginn '+eur(x.cur.bvStart):'keine AfA in '+esc(y))+(x.ifb?' · '+x.ifb.kz+': '+eur(x.ifb.amount):'')+(a.benefit&&/^ifb/.test(a.benefit)&&!a.ifbOk?' · <b class="bad-t">IFB nicht zulässig (ND < 4 J., GWG, gebraucht oder Pkw)</b>':'')+'</div>':'<div class="sub"><span class="tag warn">als Sofortaufwand gebucht</span></div>')+'</td><td class="r">'+money(d.net)+'</td>'+
        '<td class="st-acfg"><label class="row small"><input type="checkbox" data-stasset="'+esc(d.id)+'"'+(c.asset?" checked":"")+'> Anlagegut</label>'+
        (c.asset?'<label class="small">ND <input class="f num" style="width:56px" type="number" min="1" max="50" data-stap="'+esc(d.id)+':nd" value="'+(a?a.nd:3)+'"> J.</label>'+
          '<select class="f" data-stap="'+esc(d.id)+':method"><option value="">linear</option><option value="deg"'+(c.method==="deg"?" selected":"")+'>degressiv (max. 30 %)</option></select>'+
          (c.method==="deg"?'<label class="small"><input class="f num" style="width:56px" data-stap="'+esc(d.id)+':degRate" value="'+(c.degRate||30)+'"> %</label>':'')+
          '<label class="row small"><input type="checkbox" data-stapc="'+esc(d.id)+':pkw"'+(c.pkw?" checked":"")+'> Pkw</label>'+(c.pkw?'<label class="row small"><input type="checkbox" data-stapc="'+esc(d.id)+':epkw"'+(c.epkw?" checked":"")+'> Elektro</label>':'')+
          '<label class="row small"><input type="checkbox" data-stapc="'+esc(d.id)+':used"'+(c.used?" checked":"")+'> gebraucht</label>'+
          '<select class="f" data-stap="'+esc(d.id)+':benefit" aria-label="Begünstigung"><option value="">keine Begünstigung</option><option value="gfb"'+(c.benefit==="gfb"?" selected":"")+'>für Gewinnfreibetrag (KZ 9227)</option><option value="ifb10"'+(c.benefit==="ifb10"?" selected":"")+'>Investitionsfreibetrag 10 % / 20 %*</option><option value="ifb15"'+(c.benefit==="ifb15"?" selected":"")+'>Öko-IFB 15 % / 22 %*</option></select>'+
          '<label class="small">Abgang <input class="f" type="date" style="width:140px" data-stap="'+esc(d.id)+':abgang" value="'+esc(c.abgang||"")+'"></label>':'')+'</td></tr>'; }).join("")+'</tbody></table></div>'+
    '<div class="panel-b muted small">Halbjahres-AfA: Anschaffung im 2. Halbjahr → im ersten Jahr halbe AfA. GWG bis 1.000 € netto sofort (KZ 9130). Pkw: mind. 8 Jahre, Luxustangente 40.000 € (Rest über KZ 9260), degressiv nur Elektro. * Erhöhter IFB 20 %/22 % für Anschaffungen 1.11.2025–31.12.2026 (KZ 9344/9345), sonst 10 %/15 % (KZ 9276/9277); max. 1 Mio € AHK, mind. 4 Jahre Nutzungsdauer, nicht gebraucht, kein GWG. Ein Wirtschaftsgut kann nur für IFB oder Gewinnfreibetrag verwendet werden.</div></section>';
}
F.listen("change","[data-stasset]",function(el){ post({op:"doc",id:el.getAttribute("data-stasset"),patch:{asset:el.checked,nd:3}},el.checked?"Als Anlagegut markiert":"Wieder Sofortaufwand"); });
F.listen("change","[data-stap]",function(el){ var a=el.getAttribute("data-stap").split(":"), o={}; o[a[1]]=el.value; post({op:"doc",id:a[0],patch:o},"Gespeichert"); });
F.listen("change","[data-stapc]",function(el){ var a=el.getAttribute("data-stapc").split(":"), o={}; o[a[1]]=el.checked; post({op:"doc",id:a[0],patch:o},"Gespeichert"); });
function tripsPanel(j,y){
  var t=(ST.trips&&ST.trips[y])||[];
  return '<section class="panel"><div class="panel-h"><h2>Fahrten und Reisen '+esc(y)+'</h2><span class="muted">Kilometergeld '+eur(j.Y.km)+'/km (Privat-Pkw, max. 30.000 km) · Tagesgeld '+eur(j.Y.tag)+' (über 12 h, sonst '+eur(j.Y.tag/12)+' je angefangener Stunde ab 3 h) · Nächtigung '+eur(j.Y.naechtigung)+'</span></div>'+
    (t.length?'<div class="scroll"><table><thead><tr><th>Datum</th><th>Strecke · Zweck</th><th class="r">km</th><th class="r">Stunden</th><th class="r">Nächte</th><th></th></tr></thead><tbody>'+t.map(function(x,i){ return '<tr><td class="num">'+de(x.date)+'</td><td>'+esc(x.route)+'<div class="sub">'+esc(x.purpose)+'</div></td><td class="r num">'+x.km+'</td><td class="r num">'+x.hours+'</td><td class="r num">'+x.nights+'</td><td><button class="btn icon" data-act="tripdel:'+i+'" aria-label="Entfernen">✕</button></td></tr>'; }).join("")+
      '<tr class="grp"><td></td><td>Summe → KZ 9160</td><td class="r num">'+j.trips.km+'</td><td colspan="2" class="r">'+money(j.trips.kmGeld+j.trips.tag+j.trips.naecht)+'</td><td></td></tr></tbody></table></div>':'')+
    '<form class="panel-b row wrap" data-form="trip"><input class="f" type="date" name="date" required style="width:150px"><input class="f" name="route" placeholder="Strecke (von – nach)" required><input class="f" name="purpose" placeholder="Zweck (Kunde, Termin)"><input class="f num" name="km" placeholder="km" inputmode="decimal" style="width:80px"><input class="f num" name="hours" placeholder="Std." inputmode="decimal" style="width:70px"><input class="f num" name="nights" placeholder="Nächte" inputmode="numeric" style="width:80px"><button class="btn">Hinzufügen</button></form>'+
    '<div class="panel-b muted small">Nur im Cockpit erfasst – in sevDesk gibt es dafür keinen Beleg. Das Fahrtenbuch muss Datum, Strecke, Zweck und km enthalten. Kilometergeld nur für Fahrzeuge im Privatvermögen; für ein betriebliches Fahrzeug stattdessen die tatsächlichen Kosten (KZ 9170).</div></section>';
}
F.form("trip",function(f){ var y=F.UI.jabYear, t=((ST.trips&&ST.trips[y])||[]).slice(); t.push({date:f.date.value,route:f.route.value,purpose:f.purpose.value,km:num(f.km.value),hours:num(f.hours.value),nights:parseInt(f.nights.value,10)||0}); t.sort(function(a,b){ return String(a.date).localeCompare(b.date); }); post({op:"trips",year:y,trips:t},"Fahrt gespeichert"); });
F.action("tripdel",function(i){ var y=F.UI.jabYear, t=((ST.trips&&ST.trips[y])||[]).slice(); t.splice(+i,1); post({op:"trips",year:y,trips:t},"Entfernt"); });
function pauschPanel(j){
  var p=j.pausch;
  return '<section class="panel"><div class="panel-h"><h2>Vergleich Basispauschalierung</h2><span class="muted">§ 17 EStG: '+String(p.rate).replace(".",",")+' % vom Umsatz, Vorjahresumsatz max. '+F.eur0(p.limit)+'</span></div><div class="panel-b"><dl class="facts">'+
    '<dt>Pauschale Betriebsausgaben</dt><dd class="num money">'+eur(p.pausch)+'</dd><dt>zusätzlich absetzbar (Waren, Fremdlöhne, Personal, Öffi-Karte 50 %, Arbeitsplatz, SVS; Reisekosten nur bei Kostenersatz)</dt><dd class="num money">'+eur(p.extra)+'</dd>'+
    '<dt>Gewinn pauschaliert, nach Grundfreibetrag</dt><dd class="num money">'+eur(p.steuerGewinn)+'</dd><dt>Gewinn tatsächlich (oben)</dt><dd class="num money">'+eur(j.steuerGewinn)+'</dd>'+
    '<dt><b>'+(p.vorteil>0?"Pauschalierung wäre günstiger um":"Tatsächliche Rechnung ist günstiger um")+'</b></dt><dd class="num money"><b>'+eur(Math.abs(p.vorteil))+'</b> Gewinn · ESt ca. '+eur(Math.abs(p.estDiff))+'</dd></dl>'+
    jchk("pausch6","6 %-Satz (kaufmännische/technische Beratung, § 22 Z 2, schriftstellerisch, vortragend …)",j.inp.pausch6)+
    '<div class="muted small">'+(p.erlaubt?'Voraussetzung erfüllt (Vorjahresumsatz '+eur(p.prevRev)+').':'<b class="bad-t">Nicht zulässig: Vorjahresumsatz '+eur(p.prevRev)+' über der Grenze.</b>')+' Zusätzlich möglich: Vorsteuerpauschale 1,8 % vom Umsatz (max. '+F.eur0(j.Y.pausch.vstMax)+'). Mit Pauschalierung kein investitionsbedingter Gewinnfreibetrag und kein IFB; nach einem Wechsel zurück zur Einnahmen-Ausgaben-Rechnung ist die Pauschalierung 5 Jahre gesperrt.</div></div></section>';
}
var REL_TXT={gemeinsam:"gemeinsames Kind",partnerin:"Kind der Partnerin",eigen:"eigenes Kind (nicht im Haushalt)"}, FB_TXT={partnerin:"Partnerin",simon:"Simon",ex:"anderer Elternteil (Ex)",andere:"andere Person"};
function kidsPanel(j,y){
  var e=j.est, ks=e.kids;
  return '<section class="panel"><div class="panel-h"><h2>Kinder '+esc(y)+'</h2><span class="muted">Familienbonus Plus (Beilage L 1k), Alleinverdiener-, Kindermehr-, Unterhaltsabsetzbetrag</span></div>'+
    (ks.length&&ks[0].kid.isDefault?'<div class="notice" style="margin:0 18px 10px"><span>Voreinstellung nach deinen Angaben: Kind 1 = Kind deiner Partnerin (Partnerin und Ex teilen 50/50), Kind 2 = gemeinsames Kind (Partnerin beansprucht 100 %) → für dich 0 €. Änderungen werden gespeichert.</span></div>':'')+
    '<div class="scroll"><table class="st-kids"><thead><tr><th>Kind</th><th>Beziehung</th><th>Familienbeihilfe bezieht</th><th>Dein Anteil Familienbonus</th><th>Geburtsdatum</th><th>Monate</th><th class="r">Bonus voll / für dich</th><th></th></tr></thead><tbody>'+
    ks.map(function(x,i){ var k=x.kid, sel=function(f,opts){ return '<select class="f" data-stkid="'+i+':'+f+'">'+Object.keys(opts).map(function(o){ return '<option value="'+o+'"'+(String(k[f])===o?" selected":"")+'>'+esc(opts[o])+'</option>'; }).join("")+'</select>'; };
      return '<tr><td><input class="f" style="width:110px" data-stkid="'+i+':name" value="'+esc(k.name)+'">'+(k.note?'<div class="sub">'+esc(k.note)+'</div>':'')+'</td><td>'+sel("rel",REL_TXT)+(k.rel==="eigen"?'<label class="row small"><input type="checkbox" data-stkidc="'+i+':unterhalt"'+(k.unterhalt?" checked":"")+'> ich zahle Unterhalt</label>':'')+'</td><td>'+sel("fb",FB_TXT)+'</td><td>'+sel("share",{"0":"0 %","50":"50 %","100":"100 %"})+'</td>'+
        '<td><input class="f" type="date" style="width:145px" data-stkid="'+i+':birth" value="'+esc(k.birth)+'"></td><td><input class="f num" style="width:56px" type="number" min="0" max="12" data-stkid="'+i+':months" value="'+k.months+'"></td>'+
        '<td class="r">'+money(x.full)+'<div class="sub">dir: '+eur(x.simon)+(x.monthsOver18?' · '+x.monthsOver18+' Mon. ab 18':'')+'</div>'+(x.warn.length?'<div class="sub bad-t">'+esc(x.warn.join(" · "))+'</div>':'')+'</td><td><button class="btn icon" data-act="kiddel:'+i+'" aria-label="Entfernen">✕</button></td></tr>'; }).join("")+'</tbody></table></div>'+
    '<div class="panel-b row wrap"><button class="btn" data-act="kidadd">Kind hinzufügen</button></div>'+
    '<div class="panel-b muted small"><b>Regeln:</b> Den Familienbonus erhält die Person, die Familienbeihilfe bezieht, oder deren (Ehe-)Partner*in, sowie der unterhaltspflichtige Elternteil. Je Kind wird er zu 100 % oder 50/50 aufgeteilt; beansprucht der unterhaltspflichtige Ex-Partner seine Hälfte, bleibt im Haushalt höchstens die andere Hälfte. Ab dem Monat nach dem 18. Geburtstag beträgt er '+eur(j.Y.fabo18)+' statt '+eur(j.Y.fabo)+' jährlich. '+
      '<b>Zur Aufteilung:</b> Der Familienbonus ist nicht erstattungsfähig – er kürzt nur Einkommensteuer, die tatsächlich anfällt (Ausnahme: Kindermehrbetrag bis '+eur(j.Y.kmb)+' je Kind bei geringer Steuer). Schöpft die Steuer der Partnerin den vollen Bonus für das gemeinsame Kind nicht aus, kann eine Aufteilung 50/50 zwischen euch die genutzte Summe erhöhen; umgekehrt bringt dir ein Anteil nur so viel, wie deine eigene Steuer hergibt.</div></section>';
}
function kidsArr(){ var y=F.UI.jabYear; return S.kids(S.jabInp(ST,y)).map(function(k){ return {name:k.name,rel:k.rel,fb:k.fb,share:k.share,birth:k.birth,months:k.months,unterhalt:k.unterhalt,note:k.note}; }); }
function saveKids(ks,msg){ post({op:"jabinput",year:F.UI.jabYear,patch:{kids:ks}},msg||"Gespeichert"); }
F.listen("change","[data-stkid]",function(el){ var a=el.getAttribute("data-stkid").split(":"), ks=kidsArr(); ks[+a[0]][a[1]]=a[1]==="share"||a[1]==="months"?+el.value:el.value; if(a[1]!=="name") ks[+a[0]].note=""; saveKids(ks); });
F.listen("change","[data-stkidc]",function(el){ var a=el.getAttribute("data-stkidc").split(":"), ks=kidsArr(); ks[+a[0]][a[1]]=el.checked; saveKids(ks); });
F.action("kidadd",function(){ var ks=kidsArr(); ks.push({name:"Kind "+(ks.length+1),rel:"gemeinsam",fb:"partnerin",share:0,birth:"",months:12}); saveKids(ks,"Kind hinzugefügt"); });
F.action("kiddel",function(i){ var ks=kidsArr(); ks.splice(+i,1); saveKids(ks,"Entfernt"); });
function estPanel(j,y){
  var e=j.est, i=j.inp;
  return '<section class="panel"><div class="panel-h"><h2>Einkommensteuer '+esc(y)+' – Schätzung (E1)</h2><span class="muted">Tarif '+esc(y)+', Familienbonus Plus, Absetzbeträge – Richtwert</span></div><div class="panel-b st-grid">'+
    jin("verlustvortrag","Offene Verluste aus Vorjahren (E1 KZ 462)",i.verlustvortrag)+jin("andereEinkuenfte","Andere Einkünfte (z. B. Dienstverhältnis, Vermietung)",i.andereEinkuenfte)+
    jin("partnerEinkommen","Einkünfte der Partnerin (für AVAB, Grenze "+F.eur0(e.avabGrenze)+")",i.partnerEinkommen,"Partnerin arbeitet → Alleinverdienerabsetzbetrag meist nicht möglich")+
    '<div class="stackf">'+jchk("avab","Alleinverdienerabsetzbetrag beantragen",i.avab)+jchk("aeab","Alleinerzieherabsetzbetrag (ohne Partner*in)",i.aeab)+jchk("kmbBeide","Kindermehrbetrag: beide Partner mit Einkünften und je < 700 € Steuer",i.kmbBeide)+'</div>'+
    jin("kirchenbeitrag","Kirchenbeitrag (max. 600 €)",i.kirchenbeitrag,"wird automatisch gemeldet – nur für die Schätzung")+jin("spenden","Private Spenden",i.spenden,"wird automatisch gemeldet – nur für die Schätzung")+
    jin("vorauszahlungen","ESt-Vorauszahlungen "+esc(y),i.vorauszahlungen)+'</div>'+
    (e.notes.length?'<div class="notice" style="margin:0 18px 10px"><span>'+esc(e.notes.join(" "))+'</span></div>':'')+
    '<div class="panel-b"><dl class="facts"><dt>Steuerlicher Gewinn'+(e.vvUsed?' − Verlustvortrag '+eur(e.vvUsed):'')+(e.kirche||e.spenden?' − Sonderausgaben':'')+' = Einkommen</dt><dd class="num money">'+eur(e.eink)+'</dd>'+
    '<dt>Einkommensteuer laut Tarif (Grenzsteuersatz '+e.grenz+' %)</dt><dd class="num money">'+eur(e.tarif)+'</dd><dt>− Familienbonus Plus für dich'+(e.fabo<e.faboMax?' (max. bis zur Steuer – zustehend '+eur(e.faboMax)+')':'')+'</dt><dd class="num money">'+eur(e.fabo)+'</dd>'+(e.avab?'<dt>− Alleinverdiener-/Alleinerzieherabsetzbetrag</dt><dd class="num money">'+eur(e.avab)+'</dd>':'')+(e.kmb?'<dt>− Kindermehrbetrag</dt><dd class="num money">'+eur(e.kmb)+'</dd>':'')+(e.uab?'<dt>− Unterhaltsabsetzbetrag</dt><dd class="num money">'+eur(e.uab)+'</dd>':'')+
    '<dt><b>Einkommensteuer geschätzt</b></dt><dd class="num money"><b>'+eur(e.tax)+'</b></dd>'+(e.voraus?'<dt>− Vorauszahlungen</dt><dd class="num money">'+eur(e.voraus)+'</dd>':'')+'<dt><b>'+(e.rest>=0?"Nachzahlung":"Gutschrift")+'</b></dt><dd class="num money"><b>'+eur(Math.abs(e.rest))+'</b></dd>'+(e.vvRest?'<dt>Verbleibender Verlustvortrag</dt><dd class="num money">'+eur(e.vvRest)+'</dd>':'')+'</dl>'+
    '<div class="muted small" style="margin-top:8px">SVS-Beiträge sind als Betriebsausgabe (KZ 9225) schon im Gewinn berücksichtigt; die SVS-Nachbemessung folgt dem Bescheid. Ohne Gewähr – Absetzbeträge hängen von weiteren Voraussetzungen ab.</div></div></section>';
}
function jahrFonPanel(j,y){
  var s=ST.settings, cfg=ST.fonCfg||{}, arch=((ST.fon&&ST.fon.archive)||[]).map(function(a,i){ a._i=i; return a; }).filter(function(a){ return a.art==="JAHR_ERKL"&&a.key===y; }), running=y>=String(new Date().getFullYear());
  return '<section class="panel"><div class="panel-h"><h2>FinanzOnline – Jahreserklärung '+esc(y)+'</h2><span class="muted">E1 + E1a + U1 als ein Datenstrom (Anbringen JAHR_ERKL, BMF-Schema 2025)</span></div><div class="panel-b st-grid">'+
    '<label class="fl">Einkunftsart<select class="f" data-stset="einkunftsart"><option value="GW"'+(s.einkunftsart!=="SA"?" selected":"")+'>Gewerbebetrieb</option><option value="SA"'+(s.einkunftsart==="SA"?" selected":"")+'>selbständige Arbeit</option></select></label>'+
    '<label class="fl">Betriebsanschrift (Straße, Nr.)<input class="f" data-stset="betriebAdr" value="'+esc(s.betriebAdr||"")+'"></label><label class="fl">PLZ<input class="f" data-stset="betriebPlz" value="'+esc(s.betriebPlz||"")+'"></label><label class="fl">Ort<input class="f" data-stset="betriebOrt" value="'+esc(s.betriebOrt||"")+'"></label>'+
    '<label class="fl">Branchenkennzahl (E2)<input class="f" data-stset="brkz" value="'+esc(s.brkz||"")+'" placeholder="741"><span class="muted small">741 Grafik-Design · 731 Werbung · 621 Programmierung</span></label>'+
    '<label class="fl">Steuernummer<input class="f" data-stset="steuernummer" value="'+esc(s.steuernummer||"")+'"></label></div>'+
    '<div class="panel-b row wrap"><button class="btn" data-act="fonxml:JAHR_ERKL">XML ansehen</button><button class="btn" data-act="fonsend:JAHR_ERKL:T"'+(cfg.ready&&!running?'':' disabled')+'>Prüfen (Test)</button><button class="btn glow" data-act="fonsend:JAHR_ERKL:P"'+(cfg.ready&&!running?'':' disabled')+'>Abgeben</button>'+(running?'<span class="muted small">erst nach Jahresende</span>':'')+(!cfg.ready?'<span class="muted small">'+esc(cfg.fehlt||"")+'</span>':'')+'</div>'+
    (arch.length?'<div class="panel-b"><table><tbody>'+arch.map(function(a){ return '<tr><td class="nowrap">'+de(a.at)+'</td><td>'+(a.modus==="P"?"Abgabe":"Prüfung")+' · Paket '+a.paket+'</td><td><span class="tag '+(a.rc===0?"ok":"bad")+'">'+esc(a.status)+'</span> <span class="muted small">'+esc(a.msg||"")+'</span></td><td><a class="link" href="/admin/api/fon/archiv?i='+a._i+'">XML</a></td></tr>'; }).join("")+'</tbody></table></div>':'')+
    '<div class="panel-b muted small">Für '+esc(y)+(+y===2025?' ist der Datenstrom gegen das veröffentlichte BMF-Schema geprüft.':' gibt es noch kein BMF-Schema – „Prüfen“ meldet das; bis dahin „Kennzahlen kopieren“.')+' Nicht mitgeschickt werden die Beilage L 1k (Familienbonus – bei 0 % für dich nicht nötig) sowie Sonderausgaben, die automatisch übermittelt werden.</div></section>';
}
F.listen("change","[data-jaby]",function(el){ F.UI.jabYear=el.value; F.render(); });
F.action("jabdone",function(y){ var j=S.computeJab(ST.data,ST,y); F.confirm("Jahresabschluss "+y+" als erledigt markieren?","Erledigt",function(){ post({op:"done",kind:"jab",key:y,summary:{ertr:j.ertr,aufw:j.aufw,gewinn:j.gewinn,K5:j.K5,gfb:j.gfb,steuerGewinn:j.steuerGewinn,E:j.E,u1Zahllast:j.u1.zahllast,est:j.est.tax}},"Jahresabschluss als erledigt gespeichert"); }); });
F.action("jabundo",function(y){ F.confirm("Erledigt-Markierung für den Jahresabschluss "+y+" entfernen?","Zurücksetzen",function(){ post({op:"undone",kind:"jab",key:y},"Zurückgesetzt"); }); });
// Alle Kennzahlen als Text zum Übertragen in FinanzOnline
F.action("jabexport",function(y){
  var j=S.computeJab(ST.data,ST,y), L=[], f=function(n){ return (Math.round(n*100)/100).toLocaleString("de-AT",{minimumFractionDigits:2,maximumFractionDigits:2}); };
  L.push("E1a "+y+" – Gewinnermittlung (vollständige Einnahmen-Ausgaben-Rechnung, USt-Nettosystem)");
  ["9040","9050","9060","9090"].forEach(function(k){ if(j.ertr[k]||k==="9040"||k==="9050") L.push("KZ "+k+"\t"+f(j.ertr[k])); });
  Object.keys(j.E).sort().forEach(function(k){ L.push("KZ "+k+"\t"+f(j.E[k])); });
  L.push("Gewinn/Verlust\t"+f(j.gewinn));
  Object.keys(j.K5).forEach(function(k){ L.push("KZ "+k+"\t"+f(j.K5[k])); });
  L.push("KZ 9221\t"+f(j.grund)); if(j.g9227) L.push("KZ 9227\t"+f(j.g9227)); if(j.g9229) L.push("KZ 9229\t"+f(j.g9229));
  L.push("Steuerlicher Gewinn\t"+f(j.steuerGewinn)); L.push("");
  L.push("U1 "+y); var m=S.uvaKzMap(j.u1); Object.keys(m).sort().forEach(function(k){ L.push("KZ "+k+"\t"+f(m[k])); }); L.push("Zahllast/Gutschrift\t"+f(j.u1.zahllast)); L.push("");
  L.push("E1 "+y); L.push("Einkünfte aus Gewerbebetrieb (bzw. selbständiger Arbeit)\t"+f(j.steuerGewinn)); if(j.inp.verlustvortrag) L.push("KZ 462 Offene Verlustabzüge\t"+f(j.inp.verlustvortrag));
  if(j.est.faboMax) L.push("Familienbonus Plus für dich "+f(j.est.faboMax)+": Beilage L 1k je Kind ausfüllen"); if(j.inp.avab) L.push("Punkt 4.1.1 Alleinverdienerabsetzbetrag beantragen"); if(j.inp.aeab) L.push("Punkt 4.1.2 Alleinerzieherabsetzbetrag beantragen");
  var txt=L.join("\n");
  try{ navigator.clipboard.writeText(txt).catch(function(){}); }catch(e){}
  F.modal('<div class="row-between"><h2 style="font-size:19px">Kennzahlen '+esc(y)+'</h2>'+F.btnClose()+'</div><p class="muted small">In die Zwischenablage kopiert. Direkt übermitteln: unten „FinanzOnline – Jahreserklärung“.</p><pre class="xmlpre">'+esc(txt)+'</pre>',"wide");
});

F.geldTab({id:"uva",label:"UVA",order:30,sub:"Umsatzsteuervoranmeldung (U30) und ZM – berechnen, prüfen und direkt an FinanzOnline übermitteln",render:renderUva});
F.geldTab({id:"jab",label:"JAB",order:40,sub:"Jahresabschluss: Einnahmen-Ausgaben-Rechnung (E1a), Umsatzsteuererklärung (U1) und Einkommensteuer (E1)",render:renderJab});

/* "Heute": fällige UVA, die noch nicht erledigt ist */
F.feed(function(){
  if(!ST||!ST.data) return [];
  var out=[], today=F.D.today, cy=+today.slice(0,4);
  [cy-1,cy].forEach(function(y){ periodsOf(y,ST.settings.zeitraum).forEach(function(p){ var due=dueOf(p); if((ST.uva[p.key]&&ST.uva[p.key].doneAt)||p.to>=today) return; var days=(Date.parse(due)-Date.parse(today))/864e5; if(days>30||days<-45) return;
    out.push({id:"uva:"+p.key,rank:days<0?2:3,sev:days<0?"bad":"warn",icon:"euro",tag:[days<0?"bad":"warn","UVA"],t:"UVA "+p.label+(days<0?" ist überfällig":" fällig am "+F.de(due)),d:"Kennzahlen prüfen und unter Finanzen → UVA direkt abgeben",acts:[["Öffnen","uvaopen:"+p.key,"primary"]]}); }); });
  // ZM: Abgabe bis Ende des Folgemonats nach dem Meldezeitraum
  [cy-1,cy].forEach(function(y){ periodsOf(y,ST.settings.zeitraum).forEach(function(p){ if(p.to>=today) return; var due=F.ymd(new Date(p.year,p.endMonth+1,0)), days=(Date.parse(due)-Date.parse(today))/864e5; if(days>20||days<-45) return;
    var r=S.computeUva(ST.data,ST,p); if(!r.zm.length) return; var sent=((ST.fon&&ST.fon.archive)||[]).some(function(a){ return a.art==="U13"&&a.key===p.key&&a.modus==="P"&&a.rc===0; }); if(sent) return;
    out.push({id:"zm:"+p.key,rank:days<0?2:3,sev:days<0?"bad":"warn",icon:"euro",tag:[days<0?"bad":"warn","ZM"],t:"Zusammenfassende Meldung "+p.label+(days<0?" ist überfällig":" fällig am "+F.de(due)),d:r.zm.length+" Leistung(en) an EU-Unternehmer",acts:[["Öffnen","uvaopen:"+p.key,"primary"]]}); }); });
  // Jahreserklärung: 30.06. des Folgejahres (FinanzOnline)
  var jy=String(cy-1), jdue=cy+"-06-30", jd=(Date.parse(jdue)-Date.parse(today))/864e5;
  if(!ST.jab[jy]&&jd<=60&&jd>=-90) out.push({id:"jab:"+jy,rank:jd<0?2:4,sev:jd<0?"bad":"warn",icon:"euro",tag:[jd<0?"bad":"warn","JAB"],t:"Jahreserklärung "+jy+(jd<0?" ist überfällig":" fällig am "+F.de(jdue)),d:"E1, E1a und U1 unter Finanzen → JAB",acts:[["Öffnen","jabopenv:"+jy,"primary"]]});
  // Offene Steuer-Abweichungen im letzten abgeschlossenen Zeitraum
  var lp=periodsOf(cy,ST.settings.zeitraum).concat(periodsOf(cy-1,ST.settings.zeitraum)).filter(function(p){ return p.to<today; }).sort(function(a,b){ return a.to<b.to?1:-1; })[0];
  if(lp&&!(ST.uva[lp.key]&&ST.uva[lp.key].doneAt)){ var rr=S.computeUva(ST.data,ST,lp), mmn=S.mismatches(ST.data,ST,lp.from,lp.to).length; if(rr.review.length||mmn) out.push({id:"stcheck:"+lp.key,rank:4,sev:"warn",icon:"alert",tag:["warn","Steuer"],t:(rr.review.length?rr.review.length+" Beleg(e) nicht eingeordnet":"")+(rr.review.length&&mmn?", ":"")+(mmn?mmn+" Abweichung(en) zu sevDesk":""),d:"UVA "+lp.label+" – vor der Abgabe klären",acts:[["Öffnen","uvaopen:"+lp.key,"primary"]]}); }
  return out;
});
F.action("jabopenv",function(y){ F.UI.geldTab="jab"; F.UI.jabYear=y; F.go("geld"); });
F.action("uvaopen",function(k){ F.UI.geldTab="uva"; F.UI.uvaKey=k; F.go("geld"); });
// Daten im Hintergrund laden, damit "Heute" die UVA-Fälligkeit zeigen kann
setTimeout(function(){ if(!ST) load(false); },4000);

F.css(".kzb{display:inline-block;min-width:44px;text-align:center;font-family:var(--f-mono);font-weight:700;font-size:13px;padding:3px 7px;border-radius:7px;background:var(--glow-soft);color:var(--glow-ink)}"+
  "table.kz td{vertical-align:middle}.uva-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:center}.uva-top .k{font-size:12px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;font-weight:600}.uva-top .v{font-family:var(--f-display);font-size:26px;font-weight:700}.uva-top .s{font-size:12.5px;color:var(--ink-2)}.uva-done{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}"+
  ".st-set{gap:14px}.fl.inline{display:flex;align-items:center;gap:8px}.fl.inline .f{width:auto}.pchip.ok{border-color:var(--ok);color:var(--ok)}.pchip.bad{border-color:var(--bad);color:var(--bad)}.pchip.warn{border-color:var(--warn);color:var(--warn)}.pchip[aria-pressed=true]{background:var(--ink);color:var(--ground);border-color:var(--ink)}"+
  "tr.sub-row>td{background:var(--ground-2,rgba(127,127,127,.05));padding:6px 10px}.st-docs select.f{max-width:260px}.st-man .f{width:auto;min-width:120px}.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px 16px}"+
  ".st-kids .f{width:auto;min-width:0}.st-acfg{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;max-width:520px}.st-acfg .f{width:auto}.xmlpre{max-height:55vh;overflow:auto;font-size:12px;background:var(--ground-2,rgba(127,127,127,.08));padding:10px;border-radius:8px;white-space:pre-wrap;word-break:break-all}"+
  "@media(max-width:900px){.uva-top{grid-template-columns:minmax(0,1fr)}.uva-done{justify-content:flex-start}.st-docs select.f{max-width:150px}}");
})();
