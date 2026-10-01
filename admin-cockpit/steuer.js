/* Finanzen → UVA (U30) und JAB (Jahresabschluss: E1a + U1 + E1) nach österreichischem Steuerrecht.
   Grundlage: BMF-Formulare U30 2026 (Stand 13.03.2026), U1 2025, E1a 2025, E1 2025, Ausfüllhilfen U30a/U1a/E2.
   Rechnet aus den sevDesk-Rechnungen und -Belegen; jede Zahl ist bis zum einzelnen Beleg nachvollziehbar. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, de=F.de, deShort=F.deShort;
var ST=null, loading=false, loadErr="";
F.UI.uvaKey=F.UI.uvaKey||null; F.UI.jabYear=F.UI.jabYear||null; F.UI.stOpen=F.UI.stOpen||{};

function load(force){
  if(loading) return; loading=true;
  F.api("/admin/api/steuer"+(force?"?force=1":"")).then(function(j){ loading=false; if(j&&j.ok){ ST=j; loadErr=""; } else { loadErr=(j&&j.error)||"Fehler"; if(j&&j.settings){ ST=ST||j; } } if(F.current==="geld") F.render(); })
    .catch(function(){ loading=false; loadErr="Keine Verbindung."; if(F.current==="geld") F.render(); });
}
F.steuerData=function(){ return ST&&ST.data?ST.data:null; };
function post(body,msg){ return F.api("/admin/api/steuer",{body:body}).then(function(j){ if(j&&j.ok){ ["settings","mapping","uva","jab","docs"].forEach(function(k){ ST[k]=j[k]; }); if(msg) F.toast(msg); F.render(); } else F.toast("Speichern fehlgeschlagen: "+((j&&j.error)||""),true); return j; }); }
function r2(n){ return Math.round((+n||0)*100)/100; }
function money(n){ return '<span class="num money">'+eur(n)+'</span>'; }

/* ---------- Zeiträume ---------- */
function periodsOf(year,mode){ var out=[]; if(mode==="monat"){ for(var m=1;m<=12;m++) out.push({key:year+"-M"+String(m).padStart(2,"0"),label:new Date(year,m-1,1).toLocaleDateString("de-AT",{month:"long"})+" "+year,from:year+"-"+String(m).padStart(2,"0")+"-01",to:F.ymd(new Date(year,m,0)),endMonth:m,year:year}); } else { for(var q=1;q<=4;q++) out.push({key:year+"-Q"+q,label:q+". Quartal "+year,from:year+"-"+String(q*3-2).padStart(2,"0")+"-01",to:F.ymd(new Date(year,q*3,0)),endMonth:q*3,year:year}); } return out; }
function dueOf(p){ return F.ymd(new Date(p.year,p.endMonth+1,15)); }       // 15. des zweitfolgenden Monats
function inP(d,p){ return d&&d>=p.from&&d<=p.to; }

/* ---------- Einordnung der Belege ---------- */
// Ausgangsrechnungen
var OUT_OPTS=[["auto","automatisch"],["inl","Inland steuerpflichtig (Satz laut Rechnung)"],["ns","nicht steuerbar (Leistungsort Ausland) – nicht in 000"],["zm","Leistung an EU-Unternehmer – nur ZM, nicht in 000"],["017","ig. Lieferung (Ware an EU-Unternehmer) – KZ 017"],["011","Ausfuhrlieferung (Ware ins Drittland) – KZ 011"],["020","sonstige steuerfreie Umsätze – KZ 020"],["ignore","nicht berücksichtigen"]];
// Eingangsbelege
var IN_OPTS=[["auto","automatisch"],["060","Vorsteuer laut Beleg – KZ 060"],["rc","Reverse Charge (ausländischer Leister) – KZ 057/066"],["ige","ig. Erwerb Ware aus der EU – KZ 070/072/065"],["none","keine Vorsteuer (z. B. Pkw, Privatanteil, ausländische USt)"],["ignore","nicht berücksichtigen"]];
function docCfg(id){ return (ST.docs&&ST.docs[id])||{}; }
function outClass(inv,line){
  var o=docCfg(inv.id).kz; if(o&&o!=="auto") return o;
  if(line.rate>0) return "inl";
  if(inv.taxType==="eu") return "zm";
  if(inv.taxType==="noteu") return "ns";
  return "pruefen";
}
function inClass(v,line){
  var o=docCfg(v.id).kz; if(o&&o!=="auto") return o;
  if(line.tax>0.004) return "060";
  if(v.taxType==="ss"||v.taxType==="eu"||v.taxType==="noteu") return "rc";
  return "none";
}
function sign(inv){ return inv.type==="SR"?-1:1; }
// Zahlungsanteil (Teilzahlungen) für Ist-Besteuerung
function paidShare(doc){ if(doc.status===1000) return 1; if(doc.status===750&&doc.gross) return Math.max(0,Math.min(1,doc.paid/doc.gross)); return 0; }

/* ---------- UVA berechnen ---------- */
function computeUva(p){
  var ist=ST.settings.besteuerung==="ist", K={}, docs={}, zm=[], review=[];
  function add(kz,base,tax,doc,kind,info){ var k=K[kz]=K[kz]||{base:0,tax:0}; k.base+=base||0; k.tax+=tax||0; (docs[kz]=docs[kz]||[]).push({doc:doc,kind:kind,base:base,tax:tax,info:info}); }
  ST.data.invoices.forEach(function(inv){
    if(inv.status<200||inv.status===50||inv.type==="AR") return;
    if(docCfg(inv.id).ignore||docCfg(inv.id).kz==="ignore") return;
    var share=1, date=inv.date;
    if(ist){ share=paidShare(inv); date=inv.payDate; if(!share||!date) return; }
    if(!inP(date,p)) return;
    var sg=sign(inv);
    inv.lines.forEach(function(l){
      var net=l.net*share*sg, tax=l.tax*share*sg, c=outClass(inv,l);
      if(c==="inl"){ var kz=l.rate===20?"022":l.rate===13?"006":l.rate===10?"029":l.rate===4.9?"124":"pruefen"; if(kz==="pruefen"){ review.push({doc:inv,kind:"out",why:"Steuersatz "+l.rate+" % passt zu keiner Kennzahl"}); return; } add("000",net,0,inv,"out"); add(kz,net,tax,inv,"out"); }
      else if(c==="017"||c==="011"||c==="020"){ add("000",net,0,inv,"out"); add(c,net,0,inv,"out"); }
      else if(c==="zm"){ zm.push({doc:inv,net:net}); }
      else if(c==="ns"){ /* nicht steuerbar: weder 000 noch 021 */ (docs.ns=docs.ns||[]).push({doc:inv,kind:"out",base:net}); }
      else if(c==="pruefen"){ review.push({doc:inv,kind:"out",why:"0 % ohne EU-/Drittland-Kennzeichen – bitte einordnen"}); }
    });
  });
  ST.data.vouchers.forEach(function(v){
    if(v.cd!=="C"||v.status<100) return;
    if(docCfg(v.id).ignore||docCfg(v.id).kz==="ignore") return;
    var lines=v.lines.length?v.lines:[{rate:v.net?r2(v.tax/v.net*100):0,net:v.net,tax:v.tax}];
    lines.forEach(function(l){
      var c=inClass(v,l);
      if(c==="rc"){ // Steuerschuld entsteht mit Ablauf des Monats der Leistung – auch bei Ist-Besteuerung
        if(!inP(v.date,p)) return; var t=r2(l.net*0.2); add("057",l.net,t,v,"in"); add("066",0,t,v,"in"); }
      else if(c==="ige"){ if(!inP(v.date,p)) return; var t2=r2(l.net*0.2); add("070",l.net,0,v,"in"); add("072",l.net,t2,v,"in"); add("065",0,t2,v,"in"); }
      else if(c==="060"){ var d=ist?v.payDate:v.date, sh=ist?paidShare(v):1; if(!d||!sh||!inP(d,p)) return; add("060",0,l.tax*sh,v,"in"); }
    });
  });
  Object.keys(K).forEach(function(k){ K[k].base=r2(K[k].base); K[k].tax=r2(K[k].tax); });
  var g=function(k,f){ return (K[k]&&K[k][f||"tax"])||0; };
  var ust=g("022")+g("006")+g("029")+g("124")+g("057")+g("072");
  var vst=g("060")+g("065")+g("066");
  var z=r2(ust-vst);
  return {K:K,docs:docs,zm:zm,review:review,ust:r2(ust),vst:r2(vst),zahllast:z};
}
var UVA_ROWS=[
  ["000","Gesamtbetrag der Bemessungsgrundlage für Lieferungen und sonstige Leistungen (ohne USt)","base"],
  ["011","davon steuerfrei: Ausfuhrlieferungen","base"],
  ["017","davon steuerfrei: innergemeinschaftliche Lieferungen","base"],
  ["020","davon steuerfrei: übrige steuerfreie Umsätze ohne Vorsteuerabzug","base"],
  ["022","zu versteuern mit 20 % (Normalsteuersatz)","both"],
  ["006","zu versteuern mit 13 %","both"],
  ["029","zu versteuern mit 10 %","both"],
  ["124","zu versteuern mit 4,9 % (ab 07/2026)","both"],
  ["057","Steuerschuld gemäß § 19 Abs. 1 zweiter Satz (Reverse Charge, ausländische Leister)","tax"],
  ["070","Gesamtbetrag der innergemeinschaftlichen Erwerbe","base"],
  ["072","ig. Erwerbe zu versteuern mit 20 %","both"],
  ["060","Gesamtbetrag der Vorsteuern","tax"],
  ["065","Vorsteuern aus dem innergemeinschaftlichen Erwerb","tax"],
  ["066","Vorsteuern betreffend die Steuerschuld gemäß § 19 Abs. 1 zweiter Satz","tax"]
];
function kzTable(r,rows,showEmpty){
  return '<div class="scroll"><table class="kz"><thead><tr><th>KZ</th><th>Bezeichnung (Formular)</th><th class="r">Bemessungsgrundlage</th><th class="r">Steuer</th><th></th></tr></thead><tbody>'+
    rows.filter(function(x){ return showEmpty||r.K[x[0]]||x[0]==="000"; }).map(function(x){ var k=r.K[x[0]]||{base:0,tax:0}, n=(r.docs[x[0]]||[]).length;
      return '<tr><td><span class="kzb">'+x[0]+'</span></td><td>'+esc(x[1])+'</td><td class="r">'+(x[2]!=="tax"?money(k.base):'<span class="muted">—</span>')+'</td><td class="r">'+(x[2]!=="base"?money(k.tax):'<span class="muted">—</span>')+'</td><td class="r">'+(n?'<button class="link" data-act="stdocs:'+x[0]+'">'+n+' Beleg'+(n===1?"":"e")+'</button>':'')+'</td></tr>'; }).join("")+
    '<tr class="grp"><td><span class="kzb">095</span></td><td>'+(r.zahllast>=0?"Vorauszahlung (Zahllast)":"Überschuss (Gutschrift)")+'</td><td></td><td class="r">'+money(r.zahllast)+'</td><td></td></tr></tbody></table></div>';
}
function docsList(r,kz){
  var arr=kz==="zm"?r.zm.map(function(z){return {doc:z.doc,kind:"out",base:z.net};}):(kz==="review"?r.review.map(function(x){return {doc:x.doc,kind:x.kind,info:x.why};}):(r.docs[kz]||[]));
  if(!arr.length) return '<div class="empty">Keine Belege.</div>';
  return '<div class="scroll"><table><tbody>'+arr.map(function(x){ var d=x.doc, out=x.kind==="out", opts=out?OUT_OPTS:IN_OPTS, cur=docCfg(d.id).kz||"auto";
    return '<tr><td class="nowrap num">'+deShort(out?d.date:d.date)+(d.payDate?'<div class="sub">bez. '+deShort(d.payDate)+'</div>':'')+'</td><td><b>'+esc(out?(d.nr+" · "+d.contact):(d.supplier||"Beleg"))+'</b><div class="sub">'+esc(out?(d.taxType!=="default"?"Steuerart "+d.taxType:""):(d.desc||""))+(x.info?' · '+esc(x.info):'')+'</div></td><td class="r">'+(x.base!=null?money(x.base):'')+(x.tax?'<div class="sub">Steuer '+eur(x.tax)+'</div>':'')+'</td>'+
      '<td><select class="f" data-stdoc="'+esc(d.id)+'" aria-label="Einordnung">'+opts.map(function(o){ return '<option value="'+o[0]+'"'+(cur===o[0]?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("")+'</select></td>'+
      (out?'<td class="r"><a class="btn icon" href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(d.id)+'" target="_blank" rel="noopener" aria-label="PDF">↗</a></td>':'<td></td>')+'</tr>'; }).join("")+'</tbody></table></div>';
}
F.action("stdocs",function(kz){ F.UI.stOpen[kz]=!F.UI.stOpen[kz]; F.render(); });
F.listen("change","[data-stdoc]",function(el){ post({op:"doc",id:el.getAttribute("data-stdoc"),patch:{kz:el.value==="auto"?"":el.value}},"Einordnung gespeichert"); });

/* Vorjahresumsatz für Pflichten-Hinweise (netto, gestellte Rechnungen) */
function netRevenue(year){ var s=0; ST.data.invoices.forEach(function(i){ if(i.status>=200&&i.status!==50&&String(i.date||"").slice(0,4)===String(year)) s+=i.net*sign(i); }); return s; }

function renderUva(){
  if(!ST||!ST.data) return loadingBox();
  var yr=+F.D.year, set=ST.settings, ps=periodsOf(yr,set.zeitraum), today=F.D.today;
  var cur=ps.find(function(p){return p.key===F.UI.uvaKey;})||ps.filter(function(p){ return p.to<today; }).pop()||ps[0];
  F.UI.uvaKey=cur.key;
  var r=computeUva(cur), done=ST.uva[cur.key], due=dueOf(cur);
  var prevRev=netRevenue(yr-1);
  var duty=prevRev>100000?"Vorjahresumsatz über 100.000 € → monatliche UVA ist Pflicht.":(prevRev>55000?"Vorjahresumsatz zwischen 55.000 € und 100.000 € → vierteljährliche UVA.":"Vorjahresumsatz bis 55.000 € → keine Pflicht zur Abgabe, außer die Zahllast wird nicht rechtzeitig bezahlt oder du willst eine Gutschrift. Die UVA trotzdem intern aufbewahren.");
  var chips=ps.map(function(p){ var d=ST.uva[p.key], st=d?"ok":(p.to>=today?"grey":(dueOf(p)<today?"bad":"warn")); var lbl=set.zeitraum==="monat"?new Date(p.year,p.endMonth-1,1).toLocaleDateString("de-AT",{month:"short"}):("Q"+p.key.slice(-1));
    return '<button class="chip pchip '+st+'" data-act="uvap:'+p.key+'" aria-pressed="'+(p.key===cur.key)+'">'+lbl+(d?" ✓":"")+'</button>'; }).join("");
  return settingsBar()+
    '<section class="panel"><div class="panel-h"><div><h2>UVA '+esc(cur.label)+'</h2><div class="muted">Zeitraum '+de(cur.from)+' – '+de(cur.to)+' · '+(set.besteuerung==="ist"?"Ist-Besteuerung (nach Zahlungseingang)":"Soll-Besteuerung (nach Rechnungsdatum)")+'</div></div><div class="chips">'+chips+'</div></div>'+
    '<div class="panel-b uva-top"><div><div class="k">'+(r.zahllast>=0?"Zahllast (KZ 095)":"Gutschrift (KZ 095)")+'</div><div class="v num money">'+eur(Math.abs(r.zahllast))+'</div><div class="s">'+(r.zahllast>=0?"an das Finanzamt zu zahlen":"wird gutgeschrieben")+'</div></div>'+
      '<div><div class="k">Fällig</div><div class="v num">'+de(due)+'</div><div class="s">Abgabe und Zahlung über FinanzOnline'+(due<today&&!done?' · <b class="bad-t">überfällig</b>':'')+'</div></div>'+
      '<div class="uva-done">'+(done?'<span class="tag ok">Erledigt am '+de(done.doneAt)+'</span><button class="btn" data-act="uvaundo:'+cur.key+'">Zurücksetzen</button>':'<button class="btn glow" data-act="uvadone:'+cur.key+'">Als erledigt markieren</button>')+'</div></div>'+
    (r.review.length?'<div class="notice" style="margin:0 18px 14px"><span><b>'+r.review.length+' Beleg'+(r.review.length===1?"":"e")+'</b> konnte'+(r.review.length===1?"":"n")+' nicht eindeutig eingeordnet werden und fehlen in den Kennzahlen.</span><button class="btn" data-act="stdocs:review">Einordnen</button></div>':'')+
    (F.UI.stOpen.review&&r.review.length?'<div class="panel-b">'+docsList(r,"review")+'</div>':'')+
    kzTable(r,UVA_ROWS,false)+
    UVA_ROWS.filter(function(x){ return F.UI.stOpen[x[0]]; }).map(function(x){ return '<div class="panel-b"><div class="sec-t">Belege zu KZ '+x[0]+'</div>'+docsList(r,x[0])+'</div>'; }).join("")+
    '</section>'+
    (r.zm.length?'<section class="panel"><div class="panel-h"><h2>Zusammenfassende Meldung (ZM)</h2><span class="muted">Leistungen an EU-Unternehmer – nicht in der UVA, Abgabe bis Ende des Folgemonats ('+de(F.ymd(new Date(cur.year,cur.endMonth+1,0)))+')</span></div><div class="scroll"><table><thead><tr><th>Kunde</th><th>Rechnung</th><th class="r">Bemessungsgrundlage</th></tr></thead><tbody>'+r.zm.map(function(z){ return '<tr><td>'+esc(z.doc.contact)+'</td><td>'+esc(z.doc.nr)+'</td><td class="r">'+money(z.net)+'</td></tr>'; }).join("")+'</tbody></table></div><div class="panel-b muted">Für die ZM brauchst du die UID-Nummer jedes Kunden. Die Zuordnung zum Zeitraum richtet sich nach der Leistung, nicht nach dem Rechnungsdatum.</div></section>':'')+
    '<section class="panel"><div class="panel-b muted small"><b>Hinweise:</b> '+esc(duty)+' Reverse Charge (Google, Meta, Railway, Cloudflare …) zählt im Monat der Leistung, auch bei Ist-Besteuerung. Leistungen an Unternehmer im Ausland sind in Österreich nicht steuerbar und stehen weder in KZ 000 noch in KZ 021. Negative Bemessungsgrundlagen (z. B. nach Gutschriften) werden im Formular als 0 eingetragen und über KZ 090 bzw. 067 korrigiert. Dies ist eine Kontrollrechnung aus deinen sevDesk-Daten – vor dem Absenden in FinanzOnline prüfen.</div></section>';
}
F.action("uvap",function(k){ F.UI.uvaKey=k; F.render(); });
F.action("uvadone",function(k){ var p=periodsOf(+k.slice(0,4),ST.settings.zeitraum).find(function(x){return x.key===k;}); var r=computeUva(p); var sum={zahllast:r.zahllast,kz:{}}; Object.keys(r.K).forEach(function(z){ sum.kz[z]=r.K[z]; });
  F.confirm("UVA "+p.label+" als erledigt markieren? ("+(r.zahllast>=0?"Zahllast ":"Gutschrift ")+eur(Math.abs(r.zahllast))+")","Erledigt",function(){ post({op:"done",kind:"uva",key:k,summary:sum},"UVA als erledigt gespeichert"); }); });
F.action("uvaundo",function(k){ F.confirm("Erledigt-Markierung für diese UVA entfernen?","Zurücksetzen",function(){ post({op:"undone",kind:"uva",key:k},"Zurückgesetzt"); }); });

function settingsBar(){
  var s=ST.settings;
  return '<div class="row wrap st-set"><label class="fl inline">Besteuerung <select class="f" data-stset="besteuerung"><option value="ist"'+(s.besteuerung==="ist"?" selected":"")+'>Ist (nach Zahlung)</option><option value="soll"'+(s.besteuerung==="soll"?" selected":"")+'>Soll (nach Rechnung)</option></select></label>'+
    '<label class="fl inline">UVA-Zeitraum <select class="f" data-stset="zeitraum"><option value="quartal"'+(s.zeitraum==="quartal"?" selected":"")+'>Quartal</option><option value="monat"'+(s.zeitraum==="monat"?" selected":"")+'>Monat</option></select></label>'+
    '<button class="btn" data-act="streload">sevDesk neu laden</button><span class="muted small">'+(ST.data?"Stand "+F.ago(ST.data.fetchedAt):"")+(loadErr?' · <span class="bad-t">'+esc(loadErr)+'</span>':'')+'</span></div>';
}
F.listen("change","[data-stset]",function(el){ var o={}; o[el.getAttribute("data-stset")]=el.value; post({op:"settings",settings:o},"Gespeichert"); F.UI.uvaKey=null; });
F.action("streload",function(){ load(true); F.toast("Lade Rechnungen und Belege aus sevDesk …"); });
function loadingBox(){ if(!ST&&!loading) load(false); return '<section class="panel"><div class="empty">'+(loadErr?'sevDesk-Daten konnten nicht geladen werden: '+esc(loadErr)+' <button class="btn" data-act="streload">Erneut versuchen</button>':'Lade alle Rechnungen und Belege aus sevDesk …')+'</div></section>'; }

/* ---------- JAB: E1a + U1 + E1 ---------- */
var E1A=[
  ["9100","Waren, Rohstoffe, Hilfsstoffe"],["9110","Beigestelltes Personal (Fremdpersonal) und Fremdleistungen"],["9120","Personalaufwand (eigenes Personal)"],
  ["9130","Abschreibungen auf das Anlagevermögen (AfA, geringwertige Wirtschaftsgüter)"],["9160","Reise- und Fahrtspesen inkl. Kilometergeld und Diäten"],
  ["9170","Tatsächliche Kfz-Kosten (ohne AfA, Leasing und Kilometergeld)"],["9180","Miet- und Pachtaufwand, Leasing"],["9190","Provisionen an Dritte, Lizenzgebühren"],
  ["9200","Werbe- und Repräsentationsaufwendungen, Spenden, Trinkgelder"],["9215","Kleines Arbeitsplatzpauschale"],["9217","Großes Arbeitsplatzpauschale"],["9220","Zinsen und ähnliche Aufwendungen"],
  ["9225","Eigene Pflichtversicherungsbeiträge (SVS), Selbständigenvorsorge"],["9230","Übrige Aufwendungen/Betriebsausgaben (Saldo)"],["9275","Arbeitszimmer"],["none","nicht betrieblich / nicht absetzbar"]
];
var KW=[[/wareneinkauf|material|waren|rohstoff/i,"9100"],[/fremdleist|subunternehm|freelanc|fremdpersonal/i,"9110"],[/lohn|gehalt|personal/i,"9120"],[/abschreib|afa|gwg|geringwertig/i,"9130"],
  [/reise|fahrt|kilometer|diät|bahn|flug|hotel|übernacht/i,"9160"],[/kfz|treibstoff|tank|benzin|diesel|auto|fahrzeug|parken|vignette/i,"9170"],[/miete|pacht|leasing/i,"9180"],[/provision|lizenz/i,"9190"],
  [/werbung|marketing|anzeige|ads|repräsent|bewirtung|spende|trinkgeld|geschenk/i,"9200"],[/zins/i,"9220"],[/svs|sozialversicherung|pflichtversicherung|selbständigenvorsorge|vorsorge/i,"9225"]];
function defaultKz(cat){ for(var i=0;i<KW.length;i++){ if(KW[i][0].test(cat||"")) return KW[i][1]; } return "9230"; }
function catKz(cat){ return (ST.mapping&&ST.mapping[cat])||defaultKz(cat); }
function computeJab(year){
  var y=String(year), E={}, cats={}, assets=[], rev=0, revDocs=[];
  // Einnahmen-Ausgaben-Rechnung: Zufluss-Abfluss-Prinzip (Zahlungsdatum), Nettosystem
  ST.data.invoices.forEach(function(inv){ if(inv.status<200||inv.status===50||docCfg(inv.id).ignore||docCfg(inv.id).kz==="ignore") return; var sh=paidShare(inv); if(!sh||String(inv.payDate||"").slice(0,4)!==y) return; var base=inv.lines.length?inv.lines.reduce(function(a,l){ return a+l.net; },0):inv.net; var n=base*sh*sign(inv); rev+=n; revDocs.push({doc:inv,net:n}); });
  ST.data.vouchers.forEach(function(v){ if(v.cd!=="C"||v.status<100||docCfg(v.id).ignore||docCfg(v.id).kz==="ignore") return; var sh=paidShare(v);
    var cfg=docCfg(v.id);
    if(cfg.asset){ // Anlagegut: AfA statt Sofortaufwand (Halbjahres-AfA bei Anschaffung im 2. Halbjahr)
      var nd=cfg.nd||3, start=String(v.date||""), sy=+start.slice(0,4), half=+start.slice(5,7)>6, per=v.net/nd, afa=0;
      if(sy===+y) afa=half?per/2:per; else if(+y>sy){ var used=(half?0.5:1)+(+y-sy-1); var rest=Math.max(0,v.net-used*per); afa=Math.min(per,rest); }
      if(afa>0.004){ E["9130"]=(E["9130"]||0)+afa; assets.push({doc:v,afa:afa,nd:nd}); }
      return;
    }
    if(!sh||String(v.payDate||"").slice(0,4)!==y) return;
    var lines=v.lines.length?v.lines:[{net:v.net,tax:v.tax,cat:"(ohne Kategorie)"}];
    lines.forEach(function(l){ var cat=l.cat||"(ohne Kategorie)", kz=catKz(cat), net=l.net*sh;
      // Nicht abziehbare Vorsteuer (z. B. Pkw) gehört zum Aufwand
      if(inClass(v,l)==="none"&&l.tax>0) net+=l.tax*sh;
      var c=cats[cat]=cats[cat]||{cat:cat,kz:kz,sum:0,n:0,docs:[]}; c.sum+=net; c.n++; c.docs.push(v);
      if(kz!=="none") E[kz]=(E[kz]||0)+net;
      if(l.net>1000&&!cfg.asset&&kz!=="9225") assets.push({doc:v,check:true,net:l.net}); });
  });
  Object.keys(E).forEach(function(k){ E[k]=r2(E[k]); });
  var aufw=r2(Object.keys(E).reduce(function(a,k){ return a+E[k]; },0)), gewinn=r2(rev-aufw);
  var gfb=gewinn>0?r2(Math.min(gewinn,33000)*0.15):0;          // Grundfreibetrag KZ 9221: 15 % von max. 33.000 € = max. 4.950 €
  // U1: alle Monate des Jahres nach den UVA-Regeln
  var u1=computeUva({from:y+"-01-01",to:y+"-12-31"}), paidUva=0, doneUva=Object.keys(ST.uva).filter(function(k){ return k.slice(0,4)===y; });
  doneUva.forEach(function(k){ var sm=ST.uva[k].summary; if(sm) paidUva+=+sm.zahllast||0; });
  return {rev:r2(rev),revDocs:revDocs,E:E,cats:Object.keys(cats).map(function(k){return cats[k];}).sort(function(a,b){return b.sum-a.sum;}),aufw:aufw,gewinn:gewinn,gfb:gfb,steuerGewinn:r2(gewinn-gfb),assets:assets,u1:u1,paidUva:r2(paidUva),doneUva:doneUva.length};
}
function renderJab(){
  if(!ST||!ST.data) return loadingBox();
  var years={}; ST.data.invoices.concat(ST.data.vouchers).forEach(function(d){ var y=String(d.payDate||d.date||"").slice(0,4); if(y) years[y]=1; });
  var ys=Object.keys(years).sort().reverse(), cy=String(new Date().getFullYear());
  var y=F.UI.jabYear||String(+cy-1); if(ys.indexOf(y)<0&&ys.length) y=ys.find(function(x){return x<cy;})||ys[0];
  F.UI.jabYear=y;
  var j=computeJab(y), done=ST.jab[y], due=(+y+1)+"-06-30", running=y>=cy;
  var row=function(kz,label,val,strong){ return '<tr'+(strong?' class="grp"':'')+'><td>'+(kz?'<span class="kzb">'+kz+'</span>':'')+'</td><td>'+label+'</td><td class="r">'+money(val)+'</td></tr>'; };
  var e1a='<table class="kz"><thead><tr><th>KZ</th><th>E1a – Bezeichnung</th><th class="r">Betrag</th></tr></thead><tbody>'+
    row("9040","Erträge/Betriebseinnahmen (Waren-/Leistungserlöse) – netto",j.rev)+row("9050","Erträge, die in einer Mitteilung gemäß § 109a erfasst sind",0)+
    E1A.filter(function(x){ return x[0]!=="none"&&j.E[x[0]]; }).map(function(x){ return row(x[0],esc(x[1]),j.E[x[0]]); }).join("")+
    row("","Summe Aufwendungen/Betriebsausgaben",j.aufw,true)+row("","Gewinn/Verlust (E1a Punkt 55, keine KZ)",j.gewinn,true)+
    row("9221","Grundfreibetrag (15 % vom Gewinn bis 33.000 €, max. 4.950 €)",j.gfb)+
    row("","Steuerlicher Gewinn → E1 Kennzahl 327 (Einkünfte aus Gewerbebetrieb)",j.steuerGewinn,true)+'</tbody></table>';
  var u1=j.u1, u1rows=UVA_ROWS;
  return '<div class="row wrap st-set"><label class="fl inline">Jahr <select class="f" data-jaby>'+(ys.length?ys:[y]).map(function(x){ return '<option'+(x===y?" selected":"")+'>'+x+'</option>'; }).join("")+'</select></label><button class="btn" data-act="streload">sevDesk neu laden</button>'+
    '<span class="muted small">Einnahmen-Ausgaben-Rechnung (§ 4 Abs. 3 EStG), Nettosystem, nach Zahlungsdatum</span></div>'+
    '<section class="panel"><div class="panel-h"><div><h2>Jahresabschluss '+esc(y)+'</h2><div class="muted">Abgabe über FinanzOnline bis '+de(due)+' (Papier bis 30.04.)'+(running?' · Jahr läuft noch – Zahlungen bis 31.12. fehlen':'')+'</div></div>'+
      '<div class="row">'+(done?'<span class="tag ok">Erledigt am '+de(done.doneAt)+'</span><button class="btn" data-act="jabundo:'+y+'">Zurücksetzen</button>':'<button class="btn glow" data-act="jabdone:'+y+'"'+(running?' disabled title="Erst nach Jahresende"':'')+'>Als erledigt markieren</button>')+'</div></div>'+
    '<div class="kpis" style="padding:14px 18px"><div class="kpi panel"><span class="k">Einnahmen netto</span><span class="v num money">'+F.eur0(j.rev)+'</span></div><div class="kpi panel"><span class="k">Ausgaben netto</span><span class="v num money">'+F.eur0(j.aufw)+'</span></div><div class="kpi panel"><span class="k">Gewinn</span><span class="v num money'+(j.gewinn<0?" bad-t":"")+'">'+F.eur0(j.gewinn)+'</span></div><div class="kpi panel"><span class="k">Steuerlicher Gewinn</span><span class="v num money">'+F.eur0(j.steuerGewinn)+'</span><span class="s">nach Grundfreibetrag</span></div></div></section>'+
    '<section class="panel"><div class="panel-h"><h2>E1a – Beilage für Einzelunternehmer</h2><span class="muted">Gewinnermittlung: vollständige Einnahmen-Ausgaben-Rechnung · USt-Nettosystem ankreuzen</span></div><div class="scroll">'+e1a+'</div></section>'+
    '<section class="panel"><div class="panel-h"><h2>Buchungskategorien → E1a-Kennzahlen</h2><span class="muted">Zuordnung wird gespeichert und gilt für alle Jahre</span></div><div class="scroll"><table><thead><tr><th>Kategorie in sevDesk</th><th class="r">Betrag</th><th>Kennzahl</th></tr></thead><tbody>'+
      j.cats.map(function(c){ var cur=(ST.mapping&&ST.mapping[c.cat])||""; return '<tr><td><b>'+esc(c.cat)+'</b><div class="sub">'+c.n+' Position'+(c.n===1?"":"en")+(cur?"":" · automatisch zugeordnet")+'</div></td><td class="r">'+money(c.sum)+'</td><td><select class="f" data-stmap="'+esc(c.cat)+'" aria-label="Kennzahl">'+E1A.map(function(x){ return '<option value="'+x[0]+'"'+(c.kz===x[0]?" selected":"")+'>'+(x[0]==="none"?"":x[0]+" – ")+esc(x[1])+'</option>'; }).join("")+'</select></td></tr>'; }).join("")+'</tbody></table></div></section>'+
    (j.assets.length?'<section class="panel"><div class="panel-h"><h2>Anlagevermögen prüfen</h2><span class="muted">Ausgaben über 1.000 € netto sind meist Anlagegüter: AfA über die Nutzungsdauer statt Sofortaufwand</span></div><div class="scroll"><table><tbody>'+
      j.assets.map(function(a){ var d=a.doc, cfg=docCfg(d.id); return '<tr><td class="num">'+deShort(d.date)+'</td><td><b>'+esc(d.supplier||"Beleg")+'</b><div class="sub">'+esc(d.desc||"")+'</div></td><td class="r">'+money(d.net)+'</td><td>'+(cfg.asset?'<span class="tag info">AfA '+eur(a.afa)+' in '+y+'</span>':'<span class="tag warn">als Sofortaufwand gebucht</span>')+'</td>'+
        '<td class="nowrap"><label class="row small"><input type="checkbox" data-stasset="'+esc(d.id)+'"'+(cfg.asset?" checked":"")+'> Anlagegut</label>'+(cfg.asset?' <label class="small">Nutzungsdauer <input class="f num" style="width:64px;display:inline-block" type="number" min="1" max="50" data-stnd="'+esc(d.id)+'" value="'+(cfg.nd||3)+'"> J.</label>':'')+'</td></tr>'; }).join("")+'</tbody></table></div><div class="panel-b muted small">Halbjahres-AfA: Anschaffung im 2. Halbjahr → im ersten Jahr halbe AfA. Geringwertige Wirtschaftsgüter bis 1.000 € netto dürfen sofort abgesetzt werden (KZ 9130).</div></section>':'')+
    '<section class="panel"><div class="panel-h"><h2>U1 – Umsatzsteuererklärung '+esc(y)+'</h2><span class="muted">'+(ST.settings.besteuerung==="ist"?"Ist-Besteuerung":"Soll-Besteuerung")+'</span></div>'+kzTable(u1,u1rows,false)+
      '<div class="panel-b"><dl class="facts"><dt>Zahllast laut U1 (KZ 095)</dt><dd class="num money">'+eur(u1.zahllast)+'</dd><dt>Davon über '+j.doneUva+' erledigte UVA'+(j.doneUva===1?"":"s")+' bereits gemeldet</dt><dd class="num money">'+eur(j.paidUva)+'</dd><dt><b>'+(u1.zahllast-j.paidUva>=0?"Restschuld":"Gutschrift")+'</b></dt><dd class="num money"><b>'+eur(Math.abs(u1.zahllast-j.paidUva))+'</b></dd></dl></div></section>'+
    '<section class="panel"><div class="panel-b muted small"><b>So wird gerechnet:</b> Einnahmen und Ausgaben zählen im Jahr der Zahlung (Zufluss-Abfluss-Prinzip), jeweils netto (USt ist im Nettosystem ein Durchlaufposten). Vorsteuer, die nicht abgezogen werden darf (z. B. Pkw), wird dem Aufwand zugeschlagen. Der Grundfreibetrag (KZ 9221) steht automatisch zu; ein investitionsbedingter Gewinnfreibetrag (KZ 9227) und Investitionsfreibeträge (KZ 9276 ff.) sind hier nicht berechnet. Nicht abzugsfähige Teile (z. B. 50 % Bewirtung) über KZ 9280 korrigieren. Kontrollrechnung aus deinen sevDesk-Daten – vor dem Einreichen prüfen bzw. mit deinem Steuerberater abstimmen.</div></section>';
}
F.listen("change","[data-jaby]",function(el){ F.UI.jabYear=el.value; F.render(); });
F.listen("change","[data-stmap]",function(el){ var m={}; m[el.getAttribute("data-stmap")]=el.value; post({op:"mapping",mapping:m},"Zuordnung gespeichert"); });
F.listen("change","[data-stasset]",function(el){ post({op:"doc",id:el.getAttribute("data-stasset"),patch:{asset:el.checked,nd:3}},el.checked?"Als Anlagegut markiert":"Wieder Sofortaufwand"); });
F.listen("change","[data-stnd]",function(el){ post({op:"doc",id:el.getAttribute("data-stnd"),patch:{nd:el.value}},"Nutzungsdauer gespeichert"); });
F.action("jabdone",function(y){ var j=computeJab(y); F.confirm("Jahresabschluss "+y+" als erledigt markieren?","Erledigt",function(){ post({op:"done",kind:"jab",key:y,summary:{rev:j.rev,aufw:j.aufw,gewinn:j.gewinn,gfb:j.gfb,steuerGewinn:j.steuerGewinn,E:j.E,u1Zahllast:j.u1.zahllast}},"Jahresabschluss als erledigt gespeichert"); }); });
F.action("jabundo",function(y){ F.confirm("Erledigt-Markierung für den Jahresabschluss "+y+" entfernen?","Zurücksetzen",function(){ post({op:"undone",kind:"jab",key:y},"Zurückgesetzt"); }); });

F.geldTab({id:"uva",label:"UVA",order:30,sub:"Umsatzsteuervoranmeldung (Formular U30) – Kennzahlen zum Eintragen in FinanzOnline",render:renderUva});
F.geldTab({id:"jab",label:"JAB",order:40,sub:"Jahresabschluss: Einnahmen-Ausgaben-Rechnung (E1a), Umsatzsteuererklärung (U1) und Gewinn für die E1",render:renderJab});

/* "Heute": fällige UVA, die noch nicht erledigt ist */
F.feed(function(){
  if(!ST||!ST.data) return [];
  var out=[], today=F.D.today, cy=+today.slice(0,4);
  [cy-1,cy].forEach(function(y){ periodsOf(y,ST.settings.zeitraum).forEach(function(p){ var due=dueOf(p); if(ST.uva[p.key]||p.to>=today) return; var days=(Date.parse(due)-Date.parse(today))/864e5; if(days>30||days<-45) return;
    out.push({id:"uva:"+p.key,rank:days<0?2:3,sev:days<0?"bad":"warn",icon:"euro",tag:[days<0?"bad":"warn","UVA"],t:"UVA "+p.label+(days<0?" ist überfällig":" fällig am "+F.de(due)),d:"Kennzahlen stehen unter Finanzen → UVA",acts:[["Öffnen","uvaopen:"+p.key,"primary"]]}); }); });
  return out;
});
F.action("uvaopen",function(k){ F.UI.geldTab="uva"; F.UI.uvaKey=k; F.go("geld"); });
// Daten im Hintergrund laden, damit "Heute" die UVA-Fälligkeit zeigen kann
setTimeout(function(){ if(!ST) load(false); },4000);

F.css(".kzb{display:inline-block;min-width:44px;text-align:center;font-family:var(--f-mono);font-weight:700;font-size:13px;padding:3px 7px;border-radius:7px;background:var(--glow-soft);color:var(--glow-ink)}"+
  "table.kz td{vertical-align:middle}.uva-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:center}.uva-top .k{font-size:12px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em;font-weight:600}.uva-top .v{font-family:var(--f-display);font-size:26px;font-weight:700}.uva-top .s{font-size:12.5px;color:var(--ink-2)}.uva-done{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}"+
  ".st-set{gap:14px}.fl.inline{display:flex;align-items:center;gap:8px}.fl.inline .f{width:auto}.pchip.ok{border-color:var(--ok);color:var(--ok)}.pchip.bad{border-color:var(--bad);color:var(--bad)}.pchip.warn{border-color:var(--warn);color:var(--warn)}.pchip[aria-pressed=true]{background:var(--ink);color:var(--ground);border-color:var(--ink)}"+
  "@media(max-width:900px){.uva-top{grid-template-columns:minmax(0,1fr)}.uva-done{justify-content:flex-start}}");
})();
