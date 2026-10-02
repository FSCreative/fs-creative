/* Steuer-Rechenkern (UVA U30, ZM, E1a, U1, ESt-Schätzung) – derselbe Code läuft im Browser (window.FSC_STEUER)
   und auf dem Server (require), damit die Kennzahlen für FinanzOnline serverseitig identisch berechnet werden.
   Grundlagen: U30 2026 (13.03.2026), E1a 2025 (24.10.2025), Ausfüllhilfe E2 2025 (14.11.2025), EStG/UStG.
   USt: Sollbesteuerung (vereinbarte Entgelte) fix. E1a: Einnahmen-Ausgaben-Rechnung, Zufluss-Abfluss-Prinzip. */
(function(root,factory){ if(typeof module==="object"&&module.exports) module.exports=factory(); else root.FSC_STEUER=factory(); })(this,function(){
"use strict";
function r2(n){ return Math.round((+n||0)*100)/100; }
function num(v){ var n=parseFloat(v); return isFinite(n)?n:0; }
function inP(d,p){ return !!d&&d>=p.from&&d<=p.to; }
function ymdAdd(iso,days){ var d=new Date(iso+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }

/* ---------- Werte je Veranlagungsjahr ----------
   Quellen (geprüft 01.10.2026):
   - Tarif § 33 EStG: 2024 WKO „Aktuelle Werte ab 2024“; 2025/2026 WKO „Einkommen- und Körperschaftsteuer 2026“ (Indexierung 2026: 1,733 %)
   - Familienbonus Plus 2.000,16 € (<18) / 700,08 € (≥18), 2026/2027 nicht valorisiert: usp.gv.at „Steuerabsetzbeträge“, WKO 2026
   - AVAB/AEAB 2024 572/774/+255, 2025 601/813/+268, 2026 612/828/+273: usp.gv.at, WKO; Partner-Einkommensgrenze 2025 7.284 €, 2026 7.411 € (BMF/WKO 2026), 2024 6.937 €
   - Kindermehrbetrag 700 € je Kind ab 2024: usp.gv.at; Unterhaltsabsetzbetrag 2025 37/55/73 €, 2026 38/56/75 € je Monat: usp.gv.at
   - Kilometergeld 0,50 €/km ab 2025 (2024: 0,42), Tagesgeld 30 € (2024: 26,40), Nächtigung 17 € (2024: 15): BMF E2 2025 Anm. 34
   - Basispauschalierung: 2024 12 %/220.000, 2025 13,5 %/320.000 (E2 2025 Anm. 54), 2026 15 %/420.000, max. 63.000 € (WKO „Neuerungen 2026“)
   - Vorsteuerpauschale (§ 14 UStG, 1,8 %): max. 5.760 € bis 2025, 7.560 € ab 2026 (WKO „Ausbau der Basis- und Vorsteuerpauschalierung“)
   - Kleinunternehmergrenze 55.000 € brutto ab 2025 (§ 6 Abs. 1 Z 27 UStG idF AbgÄG 2024) */
var YEARS={
  2024:{tarif:[[12816,0],[20818,.2],[34513,.3],[66612,.4],[99266,.48],[1e6,.5],[Infinity,.55]],fabo:2000.16,fabo18:700.08,kmb:700,avab:[572,774,255],avabGrenze:6937,uab:[35,52,69],km:0.42,tag:26.4,naechtigung:15,pausch:{rate:12,rate6:6,limit:220000,vstMax:5760},verified:true},
  2025:{tarif:[[13308,0],[21617,.2],[35836,.3],[69166,.4],[103072,.48],[1e6,.5],[Infinity,.55]],fabo:2000.16,fabo18:700.08,kmb:700,avab:[601,813,268],avabGrenze:7284,uab:[37,55,73],km:0.50,tag:30,naechtigung:17,pausch:{rate:13.5,rate6:6,limit:320000,vstMax:5760},verified:true},
  2026:{tarif:[[13539,0],[21992,.2],[36458,.3],[70365,.4],[104859,.48],[1e6,.5],[Infinity,.55]],fabo:2000.16,fabo18:700.08,kmb:700,avab:[612,828,273],avabGrenze:7411,uab:[38,56,75],km:0.50,tag:30,naechtigung:17,pausch:{rate:15,rate6:6,limit:420000,vstMax:7560},verified:true}
};
var C={
  gfbGrund:33000, gfbRate:0.15,                               // Grundfreibetrag 15 % von max. 33.000 € = 4.950 €
  gfbBands:[[178000,0.13],[353000,0.07],[583000,0.045]],     // § 10 Abs. 1 EStG: max. GFB gesamt 46.400 €
  gwg:1000, ifbMax:1000000, ifbErhoeht:["2025-11-01","2026-12-31"], degMax:30, pkwMinNd:8, luxus:40000,
  apKlein:300, apGross:1200, mobiliar:300, kirche:600, kleinunternehmer:55000, kmMax:30000, ossSchwelle:10000
};
function yc(year){ var y=+year; if(YEARS[y]) return YEARS[y]; return y>2026?YEARS[2026]:YEARS[2024]; }

/* ---------- Länder ---------- */
var EU=["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","EL","HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK","XI"];
function isEU(c){ return EU.indexOf(String(c||"").toUpperCase())>-1; }
// UID-Formate je Mitgliedstaat (Format laut EU-Kommission/VIES)
var UID_RE={AT:/^ATU\d{8}$/,BE:/^BE[01]\d{9}$/,BG:/^BG\d{9,10}$/,CY:/^CY\d{8}[A-Z]$/,CZ:/^CZ\d{8,10}$/,DE:/^DE\d{9}$/,DK:/^DK\d{8}$/,EE:/^EE\d{9}$/,EL:/^EL\d{9}$/,GR:/^EL\d{9}$/,ES:/^ES[A-Z0-9]\d{7}[A-Z0-9]$/,FI:/^FI\d{8}$/,FR:/^FR[A-HJ-NP-Z0-9]{2}\d{9}$/,HR:/^HR\d{11}$/,HU:/^HU\d{8}$/,IE:/^IE\d{7}[A-W][A-I]?$|^IE\d[A-Z+*]\d{5}[A-W]$/,IT:/^IT\d{11}$/,LT:/^LT(\d{9}|\d{12})$/,LU:/^LU\d{8}$/,LV:/^LV\d{11}$/,MT:/^MT\d{8}$/,NL:/^NL\d{9}B\d{2}$/,PL:/^PL\d{10}$/,PT:/^PT\d{9}$/,RO:/^RO\d{2,10}$/,SE:/^SE\d{12}$/,SI:/^SI\d{8}$/,SK:/^SK\d{10}$/,XI:/^XI(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/};
function uidValid(uid){ var u=String(uid||"").replace(/[\s.\-]/g,"").toUpperCase(); if(!u) return {ok:false,why:"keine UID"}; var cc=u.slice(0,2), re=UID_RE[cc]; if(!re) return {ok:false,why:"unbekanntes Länderkürzel "+cc,uid:u}; return re.test(u)?{ok:true,uid:u,cc:cc}:{ok:false,why:"Format passt nicht zu "+cc,uid:u}; }
function uidCountry(uid){ var m=String(uid||"").replace(/\s/g,"").toUpperCase().match(/^([A-Z]{2})[0-9A-Z]{2,13}$/); return m?(m[1]==="EL"?"GR":m[1]):""; }
// Bekannte ausländische Anbieter (Name → Land), falls in sevDesk keine UID hinterlegt ist
var FOREIGN=[[/google|youtube/i,"IE"],[/meta platforms|facebook|instagram/i,"IE"],[/apple/i,"IE"],[/adobe/i,"IE"],[/microsoft|linkedin|github/i,"IE"],[/anthropic/i,"IE"],[/openai|chatgpt/i,"IE"],[/spotify/i,"SE"],[/hetzner/i,"DE"],[/amazon web services|\baws\b/i,"LU"],[/railway/i,"US"],[/cloudflare/i,"US"],[/figma/i,"US"],[/notion/i,"US"],[/vercel/i,"US"],[/netlify/i,"US"],[/digitalocean/i,"US"],[/dropbox/i,"IE"],[/canva/i,"AU"],[/zoom/i,"US"],[/slack/i,"IE"],[/atlassian/i,"AU"],[/jetbrains/i,"CZ"],[/midjourney/i,"US"],[/elevenlabs/i,"US"],[/framer/i,"NL"],[/webflow/i,"US"],[/calendly/i,"US"],[/zapier/i,"US"],[/mailchimp|intuit/i,"US"],[/envato/i,"AU"],[/shutterstock/i,"US"],[/squarespace/i,"IE"],[/godaddy/i,"US"],[/namecheap/i,"US"],[/twilio|sendgrid/i,"US"],[/postmark/i,"US"],[/fly\.io/i,"US"],[/stripe/i,"IE"],[/paypal/i,"LU"],[/shopify/i,"IE"],[/hubspot/i,"IE"],[/freepik/i,"ES"],[/fontshare|monotype|myfonts/i,"US"]];
// Reihenfolge: UID-Präfix → bekannter ausländischer Anbieter → Land der Kontaktadresse (oft nur Standard "AT")
function supplierCountry(v){ var c=uidCountry(v.supplierUid); if(c) return c; for(var i=0;i<FOREIGN.length;i++){ if(FOREIGN[i][0].test(v.supplier||"")) return FOREIGN[i][1]; } return v.supplierCountry?String(v.supplierCountry).toUpperCase():""; }
/* Kunde einer Ausgangsrechnung: UID und Land robust bestimmen (Cockpit-Angabe → UID des Kontakts → Rechnungsadresse → UID im
   Rechnungstext → Land des Kontakts). sevDesk liefert die gedruckte Adresse als Text (Invoice.address), Kopf-/Fußtext und taxText. */
var CNAMES=[[/deutschland|germany|\bbrd\b/,"DE"],[/italien|italia|italy/,"IT"],[/schweiz|suisse|svizzera|switzerland/,"CH"],[/liechtenstein/,"LI"],[/frankreich|france/,"FR"],[/niederlande|netherlands|nederland|holland/,"NL"],[/belgien|belgique|belgi[eë]|belgium/,"BE"],[/luxemburg|luxembourg/,"LU"],[/spanien|espa[ñn]a|spain/,"ES"],[/portugal/,"PT"],[/irland|ireland/,"IE"],[/d(ä|ae)nemark|danmark|denmark/,"DK"],[/schweden|sverige|sweden/,"SE"],[/finnland|finland|suomi/,"FI"],[/polen|polska|poland/,"PL"],[/tschechien|tschechische|česk|czech/,"CZ"],[/slowakei|slovensko|slovakia/,"SK"],[/ungarn|magyarorsz|hungary/,"HU"],[/slowenien|slovenija|slovenia/,"SI"],[/kroatien|hrvatska|croatia/,"HR"],[/rum(ä|ae)nien|rom[aâ]nia/,"RO"],[/bulgarien|bulgaria/,"BG"],[/griechenland|greece|hellas/,"GR"],[/zypern|cyprus/,"CY"],[/malta/,"MT"],[/estland|estonia|eesti/,"EE"],[/lettland|latvia|latvija/,"LV"],[/litauen|lithuania|lietuva/,"LT"],[/(ö|oe)sterreich|austria/,"AT"],[/vereinigtes k(ö|oe)nigreich|united kingdom|gro(ß|ss)britannien|england|schottland/,"GB"],[/vereinigte staaten|united states|\busa\b/,"US"],[/norwegen|norway|norge/,"NO"]];
var PLZ_PRE={D:"DE",CH:"CH",FL:"LI",I:"IT",F:"FR",NL:"NL",B:"BE",L:"LU",E:"ES",DK:"DK",S:"SE",SLO:"SI",CZ:"CZ",SK:"SK",H:"HU",PL:"PL",HR:"HR",A:"AT"};
function plain(t){ return String(t||"").replace(/<br\s*\/?>|<\/p>|<\/div>/gi,"\n").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&"); }
function addrCountry(t){ var ls=plain(t).split(/\n/).map(function(x){ return x.trim(); }).filter(Boolean); if(!ls.length) return "";
  var tail=ls.slice(-2).join(" ").toLowerCase(); for(var i=0;i<CNAMES.length;i++) if(CNAMES[i][0].test(tail)) return CNAMES[i][1];
  var m=ls.join(" ").match(/\b(SLO|CH|FL|NL|DK|CZ|SK|PL|HR|D|I|F|B|L|E|S|H|A)\s?-\s?\d{4,5}\b/); return m?PLZ_PRE[m[1]]:""; }
function textUids(t){ var out=[], re=/\b(ATU|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI) ?([0-9A-Z][0-9A-Z ]{6,15})/g, m, u=plain(t).toUpperCase();
  while((m=re.exec(u))){ var raw=(m[1]+m[2]).replace(/ /g,""); for(var k=raw.length;k>=raw.length-6&&k>=8;k--){ var v=uidValid(raw.slice(0,k)); if(v.ok){ out.push(v.uid); break; } } } return out; }
function docText(d){ return plain([d.taxText,d.headText,d.footText,d.texts,d.addrText].filter(Boolean).join("\n")); }
var RX_RC=/reverse.?charge|steuerschuldnerschaft|(ü|ue)bergang der steuerschuld|steuerschuld geht|schuldet der leistungsempf|innergemeinschaftliche|ig\.? ?lieferung|art\.? ?196|§ ?3a|vat exempt|tax liability|autoliquidation|inversione contabile|verlegd/i;
var RX_LIEF=/innergemeinschaftliche lieferung|ig\.? ?lieferung|art\.? ?7 ustg|art\.? ?138|intra.?community supply|steuerfreie innergemeinschaftliche/i, RX_DREI=/dreieck|triangular|art\.? ?25 ustg|art\.? ?141/i;
function outInfo(inv,st){ var c=st?docCfg(st,inv.id):{}, ownU=String(st&&st.settings&&st.settings.uid||"").replace(/\s/g,"").toUpperCase();
  var cu=c.uid&&uidValid(c.uid).ok?uidValid(c.uid).uid:"", du=uidCountry(inv.uid)?String(inv.uid).replace(/[\s.\-]/g,"").toUpperCase():"";
  var tu=textUids(docText(inv)).filter(function(u){ return u.slice(0,2)!=="AT"&&u!==ownU; })[0]||"";
  var uid=cu||du||tu, uidSrc=cu?"Cockpit":(du?"Kontakt":(tu?"Rechnungstext":""));
  var ac=addrCountry(inv.addrText), land=String(c.land||"").toUpperCase();
  var cc=land||uidCountry(uid)||ac||String(inv.country||"").toUpperCase(), ccSrc=land?"Cockpit":(uidCountry(uid)?"UID":(ac?"Rechnungsadresse":(inv.country?"Kontakt":"")));
  return {uid:uid,uidSrc:uidSrc,cc:cc==="EL"?"GR":cc,ccSrc:ccSrc}; }
function customerCountry(inv,st){ return outInfo(inv,st).cc; }
var AT_RATES=[20,13,10,4.9,0];
/* ---------- sevDesk-Steuerregeln: Bedeutung aus der ReceiptGuidance des Kontos ableiten, sonst Standard (sevDesk-Doku Update 2.0) ---------- */
// Primär zählt der Text (Name/Beschreibung) der Regeln DEINES Kontos (ReceiptGuidance), danach eine im Cockpit gespeicherte
// Zuordnung Regel → Klasse (st.ruleMap), erst zuletzt die Standard-IDs aus der sevDesk-Doku. Unbekannte Regeln werden gemeldet.
var RULE_IN_DEFAULT={"8":"ige","9":"060","10":"none","12":"rc","13":"rcnv","14":"rc"};
var RULE_OUT_DEFAULT={"1":"inl","2":"011","3":"igl","4":"020","5":"rcout","11":"016","17":"nsout","18":"oss","19":"oss","20":"oss","21":"rcout"};
var RULE_IN_CLASSES=["060","rc","rcnv","ige","ige3","ige0","eust","none"], RULE_OUT_CLASSES=["inl","igl","zm","zmd","011","nsout","rcout","020","016","oss"];
var RULES=null, RULEMAP={};   // id → {in, out, txt, src} aus raw.taxRules · RULEMAP: Cockpit-Zuordnung je Regel
function ruleTextClass(t,side){
  t=String(t||"").toLowerCase().replace(/[_\-]+/g," ").replace(/\s+/g," ");
  var rev=/revenue|einnahme|erl[öo]s/i.test(side||""), exp=/expense|ausgabe|aufwand/i.test(side||""), onlyIn=exp&&!rev, onlyOut=rev&&!exp;
  if(/one.?stop|\boss\b|fernverkauf|(elektronisch|telekommunikation).*(privat|nichtunternehmer|eu.?ausland)/.test(t)) return {out:"oss"};
  if(/dreieck/.test(t)) return onlyIn?{in:"ige3"}:(onlyOut?{out:"zmd"}:{in:"ige3",out:"zmd"});
  if(/einfuhrumsatzsteuer|\beust\b|einfuhr/.test(t)&&!/ausfuhr/.test(t)) return {in:"eust"};
  if(/(innergemeinschaftliche[rnms]?|ig\.?|innergem) ?erwerb|erwerbsteuer/.test(t)) return {in:/steuerfrei|art\.? ?6 abs\.? ?2/.test(t)?"ige0":"ige"};
  if(/(innergemeinschaftliche[rn]?|ig\.?|innergem) ?lieferung|art\.? ?7 |art\.? ?6 abs\.? ?1/.test(t)) return {out:"igl"};
  if(/(innergemeinschaftliche[rn]?|ig\.?|innergem) ?(sonstige )?(dienst)?leistung|sonstige leistung.*(eu|gemeinschaft|unternehmer)|§ ?3a|art\.? ?196|eu.?(dienst)?leistung/.test(t)) return onlyIn?{in:"rc"}:{out:"zm"};
  if(/revers(e|ed)? ?charge|13b|steuerschuldnerschaft|übergang der steuerschuld|leistungsempf(ä|ae)nger|§ ?19( abs\.? ?1)?\b/.test(t)){
    if(/ohne vorsteuer|nicht abzieh/.test(t)) return {in:"rcnv"};
    if(/mit vorsteuer|vorsteuerabzug/.test(t)||onlyIn) return {in:"rc"};
    return onlyOut?{out:"rcout"}:{in:"rc",out:"rcout"};
  }
  if(/nicht vorsteuerabzieh|ohne vorsteuerabzug|nicht abziehbar|keine vorsteuer|nicht absetzbar|ausw(ä|ae|a)rtige steuer|ausl(ä|ae)ndische steuer|versicherung|steuer nicht ausgewiesen|ohne (ust|umsatzsteuer|mwst)/.test(t)) return {in:"none"};
  if(/vorsteuer/.test(t)) return {in:"060"};
  if(/nicht im inland steuerbar|nicht steuerbar|nicht stb|leistungsort (im )?ausland|drittland/.test(t)) return {out:"nsout"};
  if(/ausfuhr|export/.test(t)) return {out:"011"};
  if(/nicht erhoben|kleinunternehmer|§ ?6 abs\.? ?1 z(iffer)? ?27/.test(t)) return onlyIn?{in:"none"}:{out:"016"};
  if(/steuerfrei|unecht befreit|§ ?6\b/.test(t)) return onlyIn?{in:"none"}:{out:"020"};
  if(/umsatzsteuerpflichtig|steuerpflichtig|ust ?pfl|normalsteuersatz|inland/.test(t)) return {out:"inl"};
  // sevDesk-Standardsätze („Mit 20 % Mehrwertsteuer“): Inland mit Satz; „Mit 0 %“ sagt nichts über den Grund → je Beleg automatisch
  var mr=t.match(/(mit )?(\d+(,\d)?) ?% ?(mehrwertsteuer|mwst|ust|umsatzsteuer|vorsteuer)?/); if(mr&&(mr[1]||mr[4])) return parseFloat(mr[2].replace(",","."))>0?{in:"060",out:"inl"}:{auto:true};
  return {};
}
// Schlüssel der Steuer-Einordnung eines Belegs: Update 2.0 taxRule-ID, Update 1.0 (taxType "custom") TaxSet als "ts<ID>"
function ruleKey(d){ return d&&d.taxRule?String(d.taxRule):(d&&d.taxSet?"ts"+String(d.taxSet):""); }
/* Rechnungen mit Stornorechnung (SR): über origin oder gleicher Kunde + gleicher Betrag. Solche Rechnungen sind storniert, nicht ausgebucht –
   Rechnung und Storno heben sich auf; sevDesk setzt sie auf „bezahlt“ ohne Zahlungsbetrag. */
var STORNIERT={};
function markStorno(raw){ STORNIERT={}; var inv=(raw&&raw.invoices)||[], used={};
  inv.forEach(function(sr){ if(sr.type!=="SR") return;
    var o=sr.origin&&inv.find(function(i){ return i.id===String(sr.origin)&&i.type!=="SR"; });
    if(!o) o=inv.find(function(i){ return i.type!=="SR"&&!used[i.id]&&i.contactId&&i.contactId===sr.contactId&&Math.abs(Math.abs(num(i.gross))-Math.abs(num(sr.gross)))<0.01&&String(i.date||"")<=String(sr.date||"9999"); });
    if(o){ STORNIERT[o.id]=sr.id; used[o.id]=1; } }); }
function setRules(raw,st){ RULES={}; if(st) RULEMAP=st.ruleMap||{}; markStorno(raw);
  (raw&&raw.taxSets||[]).forEach(function(t){ var id="ts"+t.id, nm=String(t.name||""), c=ruleTextClass(nm,""); RULES[id]={in:c.in||null,out:c.out||null,txt:nm?nm+" (TaxSet)":"TaxSet "+t.id,side:"",known:!!(c.in||c.out||c.auto),auto:!!c.auto,taxSet:true,rate:t.rate}; });
  (raw&&raw.taxRules||[]).forEach(function(r){ var c=ruleTextClass((r.description||"")+" "+(r.name||""),r.side); RULES[String(r.id)]={in:c.in||null,out:c.out||null,txt:r.description||r.name||"",side:r.side||"",known:!!(c.in||c.out||c.auto),auto:!!c.auto}; }); }
function ruleSrc(id,side){ id=String(id||""); var m=RULEMAP[id], r=RULES&&RULES[id], d=side==="in"?RULE_IN_DEFAULT:RULE_OUT_DEFAULT;
  if(m&&m[side]) return {c:m[side],src:"Zuordnung im Cockpit"};
  if(r&&r[side]) return {c:r[side],src:"Text der Regel in deinem sevDesk-Konto"};
  if(d[id]) return {c:d[id],src:r?"Standard-ID (Text nicht erkannt)":"Standard-ID laut sevDesk-Doku"};
  return {c:"",src:"unbekannt"}; }
function ruleIn(id){ return ruleSrc(id,"in").c; }
function ruleOut(id){ return ruleSrc(id,"out").c; }
function ruleTxt(id){ var r=RULES&&RULES[String(id)]; return (r&&r.txt)||TAXRULE_TXT[String(id)]||(id?"Regel "+id:""); }
// Diagnose: alle Regeln des Kontos (und alle in Belegen verwendeten) mit erkannter Klasse, Quelle und Anzahl im Jahr
function ruleDiagnosis(raw,st,year){ setRules(raw,st); var y=year?String(year):"", ids={}, cnt={};
  (raw.taxRules||[]).forEach(function(r){ ids[String(r.id)]=r; });
  (raw.taxSets||[]).forEach(function(t){ ids["ts"+t.id]={id:"ts"+t.id,name:"TaxSet "+t.id,description:t.name||"",side:"",rates:t.rate!=null?[t.rate+" %"]:[],taxSet:true}; });
  function c(d,side){ var id=ruleKey(d); if(!id) return; if(!ids[id]) ids[id]={id:id,name:"",description:"",side:"",rates:[],fromDocs:true}; if(y&&String(d.date||"").slice(0,4)!==y) return; var x=cnt[id]=cnt[id]||{out:0,in:0}; x[side]++; }
  (raw.invoices||[]).forEach(function(d){ if(d.status>=200&&d.type!=="WKR"&&d.type!=="MA") c(d,"out"); }); (raw.creditNotes||[]).forEach(function(d){ c(d,"out"); });
  (raw.vouchers||[]).forEach(function(d){ if(d.status>=100&&d.type!=="RV") c(d,d.cd==="D"?"out":"in"); });
  return Object.keys(ids).sort(function(a,b){ var ta=/^ts/.test(a), tb=/^ts/.test(b); return ta!==tb?(ta?1:-1):(+a.replace("ts","")-+b.replace("ts","")); }).map(function(id){ var r=ids[id], si=ruleSrc(id,"in"), so=ruleSrc(id,"out"), n=cnt[id]||{out:0,in:0}, ass=RULE_IN_DEFAULT[id]||RULE_OUT_DEFAULT[id]||"", R=RULES[id]||{};
    var got=(R.in||R.out||(R.auto?"auto":"")), unknown=(!(si.c||so.c)&&!R.auto)||(!!RULES[id]&&!R.known&&!(RULEMAP[id]&&(RULEMAP[id].in||RULEMAP[id].out)));
    return {id:id,taxSet:!!r.taxSet||/^ts/.test(id),name:r.name||"",description:r.description||"",side:r.side||"",rates:r.rates||[],fromDocs:!!r.fromDocs,in:si.c,inSrc:si.src,out:so.c,outSrc:so.src,nIn:n.in,nOut:n.out,map:RULEMAP[id]||null,
      erkannt:got,annahme:ass,unknown:unknown,used:n.in+n.out>0,ok:!unknown&&(!ass||!got||ass===got||(ass==="zm"&&got==="igl"))}; }); }  // 19 % (Jungholz/Mittelberg) wird bewusst nicht automatisch als AT gewertet – meist deutsche USt

/* ---------- Belege normalisieren ---------- */
// Positionen auf die Kopfsummen skalieren (Kopf = maßgeblich, z. B. Rabatte), Storno-Vorzeichen ohne doppelte Negation
function lines(doc){
  var sh=supHint(doc);
  var ls=(doc.lines||[]).filter(function(l){ return l&&(l.net||l.tax); }).map(function(l){ return {rate:Math.round(num(l.rate)*10)/10,net:num(l.net),tax:num(l.tax),cat:l.cat||"",catType:l.catType||"",catId:l.catId||"",catNo:String(l.catNo||""),isAsset:!!l.isAsset,sup:sh}; });
  var hn=num(doc.net), ht=num(doc.tax);
  if(doc.type==="SR"&&hn>0){ hn=-hn; ht=-ht; }            // sevDesk liefert Stornos meist schon negativ – nur dann umdrehen, wenn positiv
  if(!ls.length) return [{rate:hn?Math.round(ht/hn*1000)/10:0,net:hn,tax:ht,cat:"",catType:"",catNo:"",sup:sh}];
  var sn=ls.reduce(function(a,l){ return a+l.net; },0), st=ls.reduce(function(a,l){ return a+l.tax; },0);
  if(Math.abs(sn-hn)>0.02&&sn!==0){ var f=hn/sn; ls.forEach(function(l){ l.net=l.net*f; l.tax=l.tax*f; l.scaled=true; }); }
  else if(Math.abs(sn-hn)>0.02&&sn===0){ return [{rate:0,net:hn,tax:ht,cat:ls[0].cat,catType:ls[0].catType,catNo:ls[0].catNo,sup:sh}]; }
  st=ls.reduce(function(a,l){ return a+l.tax; },0);
  if(Math.abs(st-ht)>0.02&&st!==0){ var g=ht/st; ls.forEach(function(l){ l.tax=l.tax*g; l.scaled=true; }); }
  else if(Math.abs(ht)>0.004&&st===0){ // Positionen ohne Steuerbetrag: Kopf-Steuer nach Netto × Satz verteilen
    var w=ls.reduce(function(a,l){ return a+l.net*l.rate; },0);
    if(w) ls.forEach(function(l){ l.tax=ht*(l.net*l.rate)/w; }); else if(hn) ls.forEach(function(l){ l.tax=ht*l.net/hn; l.rate=Math.round(ht/hn*1000)/10; });
  }
  return ls;
}
// Sollbesteuerung (§ 19 Abs. 2 Z 1 lit. a UStG): Ablauf des Monats der Leistung; wird die Rechnung erst später ausgestellt,
// verschiebt sich das um höchstens einen Kalendermonat → Datum im maßgeblichen Monat (Rechnungsdatum, höchstens Ende des Folgemonats)
function monthEnd(ym){ var y=+ym.slice(0,4), m=+ym.slice(5,7); return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10); }
function nextYm(ym){ var y=+ym.slice(0,4), m=+ym.slice(5,7)+1; if(m>12){ y++; m=1; } return y+"-"+String(m).padStart(2,"0"); }
// Leistungszeitraum (deliveryDate … deliveryDateUntil): eine Dauerleistung ohne vereinbarte Teilleistungen ist mit dem Ende des
// Zeitraums ausgeführt (UStR 2000 Rz 2601 ff., Teilleistungen Rz 2610) → maßgeblich ist das Ende des Leistungszeitraums.
// Kurze Abrechnungsperioden (≤ 35 Tage: Monatsabos, Telefon, SaaS, Wartung je Monat) sind Teilleistungen der Abrechnungsperiode
// → maßgeblich ist ihr Beginn (in sevDesk meist = Belegdatum). „Ende des Zeitraums“ nur für längere, nicht teilbare Zeiträume.
var SHORT_DAYS=35;
function isShortPeriod(d){ return !!(d&&d.delivery&&d.deliveryUntil&&d.deliveryUntil>d.delivery&&dayNo(d.deliveryUntil)-dayNo(d.delivery)<=SHORT_DAYS); }
function leistEnd(d){ if(isShortPeriod(d)) return d.delivery; return d.deliveryUntil&&d.deliveryUntil>=(d.delivery||"")?d.deliveryUntil:(d.delivery||d.date); }
// Voranmeldungszeitraum eines Datums, „abgeschlossen“ = als erledigt markiert/eingereicht oder Abgabefrist (15. des zweitfolgenden Monats) vorbei
function periodKeyOf(st,date){ var y=date.slice(0,4), m=+date.slice(5,7); return (st&&st.settings&&st.settings.zeitraum)==="monat"?y+"-M"+String(m).padStart(2,"0"):y+"-Q"+Math.ceil(m/3); }
function periodDue(key){ var p=periodOfKey(key); if(!p) return ""; var y=+p.to.slice(0,4), m=+p.to.slice(5,7)+2; if(m>12){ y++; m-=12; } return y+"-"+String(m).padStart(2,"0")+"-15"; }
function periodClosed(st,key){ var today=(st&&st.today)||new Date().toISOString().slice(0,10), u=st&&st.uva&&st.uva[key]; return !!(u&&u.doneAt)||periodDue(key)<today; }
function firstOpenFrom(st,date){ var p=periodOfKey(periodKeyOf(st,date)); for(var i=0;i<36&&p;i++){ var k=periodKeyOf(st,p.from); if(!periodClosed(st,k)) return {key:k,from:p.from}; p=periodOfKey(periodKeyOf(st,ymdAdd(p.to,1))); } return null; }
function shiftSoll(l,d){ if(!d||!l||d.slice(0,7)<=l.slice(0,7)) return l; var lim=monthEnd(nextYm(l.slice(0,7))); return d<lim?d:lim; }
function sollDate(inv){ var l=leistEnd(inv); if(!inv.delivery&&!inv.deliveryUntil) return l; return shiftSoll(l,inv.date); }
// Steuerzeitpunkte einer Ausgangsrechnung (RE/TR/ER): Anteile {share,date,why}
//  - Teilleistungen (im Cockpit „monatliche Teilleistungen“): je Kalendermonat des Leistungszeitraums anteilig nach Tagen
//  - Mindest-Istbesteuerung (§ 19 Abs. 2 Z 1 lit. a letzter Satz UStG): vor Ausführung der Leistung vereinnahmte Beträge
//    im Monat der Vereinnahmung, der Rest im Soll-Monat
function dayNo(iso){ return Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/864e5; }
// Bereits gemeldet? Zeiträume, die über das Cockpit abgegeben wurden, tragen die Belegliste (summary.docIds); für alle anderen
// abgeschlossenen Zeiträume (vor dem Cockpit, mit sevDesk-Werten gemeldet) gilt: enthalten ist, was nach Rechnungsdatum hineinfiel.
function hasDocList(st,k){ var u=st&&st.uva&&st.uva[k]; return !!(u&&u.doneAt&&u.summary&&Array.isArray(u.summary.docIds)); }
function reportedIn(st,inv){ if(!st||!inv.date) return null; var ks=Object.keys(st.uva||{});
  for(var i=0;i<ks.length;i++){ var k=ks[i]; if(hasDocList(st,k)&&st.uva[k].summary.docIds.indexOf(inv.id)>-1){ var p=periodOfKey(k); if(p) return {key:k,date:inv.date>=p.from&&inv.date<=p.to?inv.date:p.to,how:"laut Cockpit-Abgabe"}; } }
  /* Ohne Cockpit-Abgabe (z. B. aus sevDesk gemeldet): sevDesk-Sollauswertung zählt eine Rechnung im Zeitraum des früheren
     Datums von Rechnung und Zahlung (Anzahlung vor Rechnung) – live für Q2/Q3 2026 geprüft (RE-1199/1200/1203). */
  var pd=inv.type==="SR"?"":(inv.payDate||""), d0=pd&&pd<inv.date&&num(inv.paid)>0.004?pd:inv.date;
  var k0=periodKeyOf(st,d0); if(periodClosed(st,k0)&&!hasDocList(st,k0)) return {key:k0,date:d0,how:d0===inv.date?"nach Rechnungsdatum, wie in sevDesk":"nach Zahlungseingang vor Rechnungsdatum, wie in sevDesk"}; return null; }
function sollParts(inv,st,total){
  var out0=sollParts0(inv,st,total), rep=reportedIn(st,inv), tt=total==null?1:total;
  if(rep&&!docCfg(st,inv.id).teil) return [{share:tt,date:rep.date,why:"bereits mit der UVA "+rep.key.replace("-"," ")+" gemeldet ("+rep.how+")"}];
  // nicht gemeldete Anteile, deren Zeitraum schon abgeschlossen ist → im ersten offenen Zeitraum nachholen
  return out0.map(function(pt){ var pk=periodKeyOf(st,pt.date); if(!st||!periodClosed(st,pk)) return pt; var fo=firstOpenFrom(st,pt.date); if(!fo) return pt;
    return {share:pt.share,date:fo.from,why:"Nachholung aus "+pk.replace("-Q"," Q").replace("-M"," Monat ")+(pt.pre?" – Anzahlung vor Rechnung":" – Leistungszeitpunkt in bereits abgegebenem Zeitraum")+" (dort nicht gemeldet)",pre:pt.pre}; }); }
function sollParts0(inv,st,total){
  total=total==null?1:total; var g=num(inv.gross), soll=sollDate(inv), le=leistEnd(inv), c=docCfg(st,inv.id), out=[];
  if(c.teil&&inv.delivery&&inv.deliveryUntil&&inv.deliveryUntil>inv.delivery){
    var a=dayNo(inv.delivery), b=dayNo(inv.deliveryUntil), days=b-a+1, ym=inv.delivery.slice(0,7);
    while(ym<=inv.deliveryUntil.slice(0,7)){ var s0=Math.max(a,dayNo(ym+"-01")), e0=Math.min(b,dayNo(monthEnd(ym))), sh=(e0-s0+1)/days;
      out.push({share:total*sh,date:shiftSoll(monthEnd(ym)>inv.deliveryUntil?inv.deliveryUntil:monthEnd(ym),inv.date),why:"Teilleistung "+ym.slice(5,7)+"/"+ym.slice(0,4)+" (anteilig nach Tagen)"}); ym=nextYm(ym); }
    return out;
  }
  var pre=0;
  var klein=!(st&&st.settings&&st.settings.kleineAnz===false);
  if(g>0) payments(inv).forEach(function(pm){ if(pm.amount<=0||!pm.date||pm.date>=le||pm.date.slice(0,7)>=soll.slice(0,7)) return;
    if(klein&&dayNo(le)-dayNo(pm.date)<31) return;          // kleine Vorauszahlung (< 1 Monat vor Leistung) → mit der Rechnung (Einstellung)
    var sh=Math.min(pm.amount/g,total-pre); if(sh<=1e-9) return; pre+=sh;
    out.push({share:sh,date:pm.date,why:"vor Ausführung der Leistung vereinnahmt – Mindest-Istbesteuerung (§ 19 Abs. 2 Z 1 lit. a)",pre:true}); });
  if(total-pre>1e-9) out.push({share:total-pre,date:soll,why:null});
  return out;
}
// Vorsteuer (§ 12 Abs. 1 Z 1 UStG): Leistung ausgeführt (bzw. Anzahlung geleistet) UND Rechnung vorhanden →
// frühestens Rechnungsdatum, spätestens Ende des Leistungszeitraums bzw. früherer Zahlung
// Reverse Charge (§ 19 Abs. 2 Z 1 lit. b UStG): Ablauf des Monats der Leistung. Abos/Werbe-Abrechnungen werden mit dem Beleg
// abgerechnet → Belegmonat; liegt der Leistungsbeginn vor dem Beleg (Rechnung kommt nach der Leistung), dessen Monat.
function rcDate(v){ var d=v.date||"", s0=v.delivery||""; return s0&&d&&s0<d?s0:(d||s0); }
// Vorsteuer: bei längeren Zeiträumen (Jahresabo, im Voraus abgerechnet) Belegdatum; sonst Leistungsbeginn bzw. frühere Zahlung
function vstDate(v){ var d=v.date||""; if(v.deliveryUntil&&v.delivery&&!isShortPeriod(v)&&v.deliveryUntil>v.delivery) return d; var le=leistEnd(v)||d, pm=payments(v).filter(function(p){ return p.amount>0&&p.date; }).map(function(p){ return p.date; }).sort()[0], t=pm&&pm<le?pm:le; return t>d?t:d; }
function docCfg(st,id){ return (st.docs&&st.docs[id])||{}; }
function skipInv(inv,st){ var c=docCfg(st,inv.id); return inv.status<200||inv.type==="MA"||inv.type==="WKR"||c.ignore||c.kz==="ignore"; }
function skipVou(v,st){ var c=docCfg(st,v.id); return v.status<100||v.type==="RV"||c.ignore||c.kz==="ignore"; }   // RV = Vorlage wiederkehrender Beleg
// Nicht-betriebliche Kategorien (Privat, Steuerzahlungen, Umbuchungen, Kredit) – weder Einnahme noch Ausgabe
var NONBIZ=/privat|entnahme|einlage|umbuchung|geldtransit|transit|umsatzsteuer|vorsteuer|\bust\b|ust-|zahllast|finanzamt|einkommensteuer|\best\b|kapitalertragsteuer|darlehen|kredit(?!karte)|tilgung|kaution/i;
// Fallbacks, wenn die Kategorie fehlt (sevDesk Update 2.0: accountDatev statt accountingType):
//  - Konto-Nr. laut Einheitskontenrahmen (EKR): 25xx Vorsteuer, 35xx USt/Finanzamt-Verrechnung, 96xx–98xx Privat – nur ohne Kontoname
//  - Lieferant: Finanzamt/Abgabenkonto → Steuerzahlung; SVS → Pflichtversicherung (§ 4 Abs. 4 Z 1 EStG)
var SUP_FA=/finanzamt|abgabenkonto|bundesministerium f(ü|ue)r finanzen|\bbmf\b/i, SUP_SVS=/\bsvs\b|sozialversicherung(sanstalt)? der selbst(ä|ae)ndigen|sva der gewerblichen/i;
function supHint(doc){ var s=String(doc&&(doc.supplier||"")||""); return SUP_FA.test(s)?"fa":(SUP_SVS.test(s)?"svs":""); }
function catNoNonBiz(l){ if(l.cat) return false; var n=parseInt(l.catNo,10); if(!(n>=1000&&n<=9999)) return false; return (n>=2500&&n<=2599)||(n>=3500&&n<=3599)||(n>=9600&&n<=9899); }
function nonBiz(l){ return /^(TAX|VAT|VATPAY|VATIMPORT|VATINT|EQUITYIN|EQUITYOUT)$/i.test(l.catType||"")||NONBIZ.test(l.cat||"")||catNoNonBiz(l)||l.sup==="fa"; }

/* ---------- Einordnung ---------- */
var OUT_OPTS=[["auto","automatisch"],["inl","Inland steuerpflichtig (Satz laut Rechnung)"],["ns","nicht steuerbar (Leistungsort Ausland) – nicht in 000"],["zm","Dienstleistung an EU-Unternehmer – nur ZM, nicht in 000"],["zmd","Dreiecksgeschäft (Mittelunternehmer) – ZM mit Kennzeichen"],["017","ig. Lieferung (Ware an EU-Unternehmer) – KZ 017 + ZM"],["011","Ausfuhrlieferung (Ware ins Drittland) – KZ 011"],["020","sonstige steuerfreie Umsätze – KZ 020"],["021","Reverse Charge im Inland (z. B. Bauleistung) – KZ 000/021"],["016","Kleinunternehmer – KZ 016"],["oss","One-Stop-Shop – nicht in der UVA"],["sonst","Kleinbetrag/sonstiges – nicht in UVA und ZM"],["dlp","durchlaufender Posten (nicht steuerbar)"],["nach20","0 % war falsch – 20 % aus dem Betrag herausrechnen (KZ 022)"],["ignore","nicht berücksichtigen"]];
var IN_OPTS=[["auto","automatisch"],["060","österr. Vorsteuer laut Beleg – KZ 060"],["rc","Reverse Charge mit Vorsteuer – KZ 057/066"],["rcnv","Reverse Charge ohne Vorsteuer – nur KZ 057"],["ige","ig. Erwerb Ware aus der EU – KZ 070/072/065"],["ige3","ig. Erwerb im Dreiecksgeschäft – KZ 070/077 (gilt als besteuert)"],["ige0","steuerfreier ig. Erwerb – KZ 070/071"],["eust","Einfuhrumsatzsteuer – KZ 061"],["fx","ausländische USt – keine Vorsteuer (Erstattungsverfahren)"],["none","keine Vorsteuer (z. B. Pkw, privat, Versicherung)"],["ignore","nicht berücksichtigen"]];
var RATE_KZ={"20":"022","13":"006","10":"029","4.9":"124","19":"037"};
var IGE_KZ={"20":"072","13":"008","10":"073","4.9":"125","19":"088"};
var TAXRULE_TXT={"1":"steuerpflichtig","2":"Ausfuhr","3":"ig. Lieferung","4":"steuerfrei","5":"Reverse Charge","8":"ig. Erwerb","9":"Vorsteuer abziehbar","10":"keine Vorsteuer","11":"Kleinunternehmer","12":"RC mit Vorsteuer (Drittland)","13":"RC ohne Vorsteuer","14":"RC mit Vorsteuer (EU)","17":"nicht im Inland steuerbar","18":"OSS Waren","19":"OSS elektron.","20":"OSS sonstige","21":"Reverse Charge"};

// Ausgangsrechnung (oder Einnahmebeleg): Klasse je Position, mit Begründung
function outWhy(doc,line,st){
  var cfg=docCfg(st,doc.id), o=cfg.kz; if(o&&o!=="auto"&&o!=="ignore") return {c:o==="inl"?(line.rate>0?"inl":"pruefen"):o,why:"im Cockpit manuell eingeordnet"+(o==="020"&&cfg.grund?" ("+cfg.grund+")":""),sure:true};
  if(!(line.rate>0)&&doc.status&&ausgebucht(doc,st)) return {c:"sonst",why:"0 %-Rechnung ausgebucht (Forderungsausfall) – ohne USt-Folge",sure:true,ausg:true};
  var r=ruleKey(doc), oi=outInfo(doc,st), cc=oi.cc, eu=isEU(cc)&&cc!=="AT", hasUid=!!oi.uid, sem=r?ruleOut(r):"", t=docText(doc);
  var lief=RX_LIEF.test(t), drei=RX_DREI.test(t), rc=RX_RC.test(t), igK=drei?"zmd":(lief?"017":"zm"), igT=drei?"Dreiecksgeschäft":(lief?"ig. Lieferung":"ig. sonstige Leistung");
  var land=cc?" (Kunde "+cc+(oi.ccSrc?" laut "+oi.ccSrc:"")+(hasUid?", UID "+oi.uid+(oi.uidSrc!=="Kontakt"?" aus "+oi.uidSrc:""):", keine UID")+")":"";
  if(sem==="inl"||(!r&&(doc.taxType==="default"||doc.taxType==="custom"||!doc.taxType))){
    if(line.rate>0) return {c:"inl",why:"steuerpflichtig mit "+line.rate+" %"+land,sure:true};
    if(eu&&(hasUid||rc)) return {c:igK,why:"0 % an EU-Kunden"+(rc?" mit Hinweis im Rechnungstext":"")+" → "+igT+(hasUid?"":" – UID fehlt")+land,sure:oi.uidSrc==="Kontakt"&&!lief&&!drei};
    if(cc&&!isEU(cc)) return {c:"ns",why:"0 % an Kunden im Drittland → nicht steuerbar (Leistungsort Ausland)"+land,sure:oi.ccSrc==="Kontakt"||oi.ccSrc==="UID"};
    if(cc==="AT"&&(hasUid||oi.ccSrc==="UID")) return {c:"pruefen",at:true,why:"0 % an österreichischen Unternehmer – nur korrekt bei steuerfreier Leistung/durchlaufendem Posten, sonst 20 % nachversteuern"+land,sure:false};
    return {c:"pruefen",at:cc==="AT",why:(cc==="AT"?"0 % an Kunden in Österreich – steuerfrei, durchlaufender Posten oder 20 % nachversteuern?":"0 % bei steuerpflichtiger Regel – Land/UID unklar")+land,sure:false};
  }
  if(sem==="011") return {c:"011",why:"Ausfuhr laut sevDesk-Steuerregel",sure:true};
  if(sem==="igl") return {c:"017",why:"ig. Lieferung laut sevDesk-Steuerregel → KZ 017 + ZM (Lieferung)"+land,sure:true};
  if(sem==="zm") return {c:drei?"zmd":"zm",why:"ig. sonstige Leistung laut sevDesk-Steuerregel → nur ZM"+land,sure:true};
  if(sem==="zmd") return {c:"zmd",why:"Dreiecksgeschäft laut sevDesk-Steuerregel → ZM mit Kennzeichen"+land,sure:true};
  if(sem==="020") return {c:"020",why:"steuerfrei laut sevDesk-Steuerregel",sure:true};
  if(sem==="rcout") return eu?{c:igK==="017"?"017":igK==="zmd"?"zmd":"zm",why:"Reverse Charge an EU-Unternehmer → "+igT+land,sure:hasUid}:(cc==="AT"?{c:"021",why:"Reverse Charge im Inland → KZ 021",sure:true}:{c:"ns",why:"Reverse Charge an Drittland-Kunden → nicht steuerbar"+land,sure:!!cc});
  if(sem==="nsout") return eu&&hasUid?{c:"zm",why:"nicht im Inland steuerbar, EU-Unternehmer → ZM"+land,sure:true}:{c:"ns",why:"nicht im Inland steuerbar"+land,sure:!eu};
  if(sem==="016") return {c:"016",why:"Kleinunternehmer laut sevDesk",sure:true};
  if(sem==="oss") return {c:"oss",why:"One-Stop-Shop laut sevDesk",sure:true};
  if(!r&&doc.taxType==="eu") return {c:igK,why:"Steuerart EU (sevDesk 1.0) → "+igT+land,sure:hasUid};
  if(!r&&doc.taxType==="noteu") return {c:"ns",why:"Steuerart Drittland (sevDesk 1.0)",sure:true};
  if(!r&&doc.taxType==="ss") return {c:"016",why:"Steuerart Kleinunternehmer (sevDesk 1.0)",sure:true};
  return line.rate>0?{c:"inl",why:"Steuersatz "+line.rate+" % (Steuerregel "+r+" unbekannt)",sure:true}:{c:"pruefen",why:"unbekannte Steuerregel "+r+" („"+ruleTxt(r)+"“) – Regel unter „Steuerregeln deines sevDesk-Kontos“ zuordnen",sure:false};
}
function outClass(doc,line,st){ return outWhy(doc,line,st).c; }
function atRate(rate){ return AT_RATES.indexOf(Math.round(rate*10)/10)>-1; }
// Eingangsbeleg: Klasse je Position, mit Begründung
function inWhy(v,line,st){
  var o=docCfg(st,v.id).kz; if(o&&o!=="auto"&&o!=="ignore") return {c:o,why:"im Cockpit manuell eingeordnet"};
  var ac=docCfg(st,v.id);
  if(ac.asset&&ac.pkw&&Math.abs(line.tax)>0.004&&atRate(line.rate)){
    if(!ac.epkw) return {c:"none",why:"Pkw/Kombi: kein Vorsteuerabzug (§ 12 Abs. 2 Z 2 lit. b UStG)"};
    var gr=Math.abs(num(v.gross)); if(gr>80000) return {c:"none",why:"E-Pkw über 80.000 € brutto: kein Vorsteuerabzug (§ 12 Abs. 2 Z 2a UStG)"};
  }
  var r=ruleKey(v), cc=supplierCountry(v), foreign=!!cc&&cc!=="AT", tax=Math.abs(line.tax)>0.004, sem=r?ruleIn(r):"";
  var src=uidCountry(v.supplierUid)?"UID":(cc&&cc!==String(v.supplierCountry||"").toUpperCase()?"bekannter Anbieter":"Kontaktadresse"), land=cc?" (Lieferant "+cc+" laut "+src+")":"";
  if(sem==="ige"||(!r&&v.taxType==="eu")){ var w=igeOrService(v,line,st); return w.c==="rc"?{c:"rc",why:"in sevDesk als ig. Erwerb gebucht – für die UVA als Reverse-Charge-Leistung behandelt (§ 19 Abs. 1 UStG, KZ 057/066): "+w.why+land,sure:w.sure}:{c:"ige",why:"ig. Erwerb (Ware) laut sevDesk"+(w.why?": "+w.why:"")+land,sure:w.sure}; }
  if(sem==="none"||(!r&&v.taxType==="ss")) return {c:"none",why:"nicht vorsteuerabziehbar laut sevDesk"};
  if(sem==="rc"||(!r&&v.taxType==="noteu")) return {c:"rc",why:"Reverse Charge mit Vorsteuer laut sevDesk"+land};
  if(sem==="rcnv") return {c:"rcnv",why:"Reverse Charge ohne Vorsteuer laut sevDesk"+land};
  if(tax){ if(!atRate(line.rate)) return {c:"fx",why:line.rate+" % ist kein österreichischer Steuersatz → ausländische USt"+land}; return {c:"060",why:"österreichische USt "+line.rate+" % ausgewiesen"+(foreign?" – Lieferant aber "+cc+", bitte prüfen":"")}; }
  if(foreign) return {c:"rc",why:"ausländischer Leister ohne USt → Reverse Charge (Art. 3a, § 19 Abs. 1 UStG)"+land};
  return {c:"none",why:"keine USt ausgewiesen, inländischer Lieferant"};
}
function inClass(v,line,st){ return inWhy(v,line,st).c; }
/* ig. Erwerb (Art. 1 UStG) gibt es nur für WAREN. sevDesk-Konten buchen EU-Dienstleistungen (Google, Meta, Adobe …) oft auch als
   „Innergemeinschaftlicher Erwerb“ – das sind sonstige Leistungen mit Reverse Charge (§ 3a Abs. 6, § 19 Abs. 1 UStG → KZ 057/066).
   Reihenfolge: Zuordnung je Lieferant im Cockpit (st.supMap) → Anlagegut/Warenkategorie → bekannter Dienstleister/Dienstleistungskategorie → unklar (Ware, prüfen). */
var RX_WARE=/(^|[\s\-])(waren?|handelsware|wareneinkauf)\b|material|rohstoff|hardware|ger(ä|ae)t|computer|laptop|notebook|monitor|kamera|objektiv|drucker|m(ö|oe)bel|zubeh(ö|oe)r|ersatzteil|fotobox|verbrauchs/i;
var RX_DIENST=/software|lizenz|abo|subscription|hosting|server|cloud|saas|api|werbung|ads|marketing|anzeige|domain|dienstleist|beratung|provision|geb(ü|ue)hr|plattform|stock|font|kurs|schulung|fortbildung|telefon|internet|e-?mail|newsletter/i;
function supKey(v){ return String(v.supplier||"").trim().toLowerCase().replace(/\s+/g," "); }
function igeOrService(v,line,st){
  var m=st&&st.supMap&&st.supMap[supKey(v)]; if(m==="rc"||m==="ige") return {c:m,why:"Zuordnung für Lieferant „"+(v.supplier||"")+"“",sure:true};
  var cat=String(line.cat||"")+" "+String(v.desc||""), kz=catKz(st||{},line);
  if(docCfg(st,v.id).asset||kz==="9100"||kz==="9130"||RX_WARE.test(cat)) return {c:"ige",why:"Warenkauf ("+(line.cat||"Anlagegut")+")",sure:true};
  var known=FOREIGN.some(function(f){ return f[0].test(v.supplier||""); });
  if(known||RX_DIENST.test(cat)||kz==="9200"||kz==="9190") return {c:"rc",why:known?"bekannter Dienstleister":"Dienstleistungs-Kategorie „"+(line.cat||"")+"“",sure:true};
  return {c:"ige",why:"Ware oder Dienstleistung? Bitte je Lieferant zuordnen",sure:false};
}

/* ---------- Zahlungen (Zufluss/Abfluss für E1a, Anzahlungen) ---------- */
function payments(doc){
  if(doc.pays&&doc.pays.length){ var s=doc.pays.reduce(function(a,p){ return a+num(p.amount); },0); if(Math.abs(s)>0.004) return doc.pays.map(function(p){ return {date:p.date,amount:num(p.amount),src:"bank"}; }); }
  var paid=num(doc.paid);
  if(Math.abs(paid)<0.005) return [];                        // kein Zahlungsbetrag (auch bei Status "bezahlt", z. B. storniert/verrechnet) → kein Zufluss
  if(paid>0.004&&doc.payDate) return [{date:doc.payDate,amount:paid,src:"payDate"}];
  if(paid<-0.004&&doc.payDate) return [{date:doc.payDate,amount:paid,src:"payDate"}];
  return [];
}

/* ---------- Abschlags-/Teil-/Endrechnungen (sevDesk AR/TR/ER) ----------
   Anzahlungen (AR) sind bei Vereinnahmung zu versteuern (Mindest-Istbesteuerung), Teilrechnungen (TR) über abgerechnete
   Teilleistungen nach Soll. Mit der Endrechnung (ER) ist das gesamte Entgelt zu versteuern, abzüglich der bereits versteuerten
   Anzahlungen/Teilleistungen (UStR 2000 Rz 2601 ff.). sevDesk dokumentiert nicht, ob sumNet der ER das Gesamtentgelt oder nur den
   Restbetrag enthält → Erkennung: Positionen − Abzüge = Kopfsumme (Rest) bzw. negative Abzugspositionen; sonst Gesamtentgelt.
   Im Cockpit überschreibbar (docs[id].erMode = "rest" | "voll"). Zuordnung AR/TR → ER über den Auftrag (origin), sonst Kunde + Datum. */
function partials(raw,st){
  var invs=(raw.invoices||[]).filter(function(i){ return !skipInv(i,st); }), ers=invs.filter(function(i){ return i.type==="ER"; }).sort(function(a,b){ return (a.date||"").localeCompare(b.date||""); });
  var out={er:{},ar:{}}; if(!ers.length) return out;
  var who=function(i){ return i.contactId?"c"+i.contactId:"n"+String(i.contact||"").toLowerCase(); };
  invs.forEach(function(x){ if(x.type!=="AR"&&x.type!=="TR") return;
    var e=ers.filter(function(er){ return (er.date||"")>=(x.date||"")&&(x.origin&&er.origin?x.origin===er.origin:who(er)===who(x)); })[0];
    if(e) (out.er[e.id]=out.er[e.id]||{list:[]}).list.push(x); });
  ers.forEach(function(er){
    var L=(out.er[er.id]||{list:[]}).list, A=L.reduce(function(a,x){ return a+num(x.net); },0), head=num(er.net), c=docCfg(st,er.id);
    var rawPos=(er.lines||[]).reduce(function(a,l){ return a+num(l.net); },0), neg=(er.lines||[]).reduce(function(a,l){ return a+Math.min(0,num(l.net)); },0), tol=Math.max(0.05,Math.abs(A)*0.005);
    var mode=c.erMode==="rest"||c.erMode==="voll"?c.erMode:(A>0.01&&(Math.abs(head-(rawPos-A))<=tol||(neg<0&&Math.abs(neg+A)<=tol))?"rest":"voll");
    var F=mode==="rest"?head+A:head, soll=sollDate(er), cut=monthEnd(soll.slice(0,7)), D=0;
    L.forEach(function(x){ if(x.type==="TR"){ D+=num(x.net); return; } var g=num(x.gross);   // TR: eigene Teilleistung, bereits nach Soll versteuert
      payments(x).forEach(function(pm){ if(g&&pm.date&&pm.date<=cut) D+=num(x.net)*pm.amount/g; }); out.ar[x.id]={cut:cut,er:er}; });
    out.er[er.id]={list:L,A:r2(A),F:r2(F),D:r2(D),mode:mode,auto:!(c.erMode==="rest"||c.erMode==="voll"),f:head?(F-D)/head:0,cut:cut,rest:r2(F-D)};
  });
  return out;
}

/* ---------- UVA (U30) ---------- */
var BASE_KZ=["000","001","021","011","012","015","017","018","019","016","020","022","124","029","006","037","052","007","070","071","072","125","073","008","088","076","077"];
var TAX_KZ=["056","057","048","044","032","060","061","083","065","066","082","087","089","064","062","063","067","090"];
var UST_KZ=["022","124","029","006","037","056","057","048","044","032","072","125","073","008","088"];
var RATE_OF={"022":20,"124":4.9,"029":10,"006":13,"037":19,"072":20,"125":4.9,"073":10,"008":13,"088":19};
var IN_000=["011","012","015","017","018","019","016","020","022","124","029","006","037","021"];
var UVA_ROWS=[
  ["000","Gesamtbetrag der Bemessungsgrundlage für Lieferungen und sonstige Leistungen (ohne USt), einschl. Anzahlungen","base"],
  ["001","zuzüglich Eigenverbrauch","base"],["021","abzüglich Umsätze mit Übergang der Steuerschuld (Inland, § 19 Abs. 1 zweiter Satz, 1a–1e)","base"],
  ["011","steuerfrei mit Vorsteuerabzug: Ausfuhrlieferungen","base"],["012","steuerfrei: Lohnveredelungen","base"],["015","steuerfrei: § 6 Abs. 1 Z 2–6, § 23 Abs. 5 (Seeschifffahrt, Luftfahrt …)","base"],["017","steuerfrei: innergemeinschaftliche Lieferungen","base"],["018","steuerfrei: ig. Lieferung neuer Fahrzeuge (Art. 2)","base"],["019","steuerfrei ohne Vorsteuerabzug: Grundstücksumsätze","base"],
  ["016","steuerfrei: Kleinunternehmer (§ 6 Abs. 1 Z 27)","base"],["020","steuerfrei ohne Vorsteuerabzug: übrige","base"],
  ["022","zu versteuern mit 20 %","both"],["124","zu versteuern mit 4,9 % (ab 07/2026)","both"],["029","zu versteuern mit 10 %","both"],["006","zu versteuern mit 13 %","both"],["037","zu versteuern mit 19 % (Jungholz/Mittelberg)","both"],
  ["056","Steuerschuld gemäß § 11 Abs. 12 und 14, § 16 Abs. 2, Art. 7 Abs. 4","tax"],
  ["057","Steuerschuld gemäß § 19 Abs. 1 zweiter Satz, 1c, 1e, Art. 25 Abs. 5 (Reverse Charge)","tax"],
  ["048","Steuerschuld gemäß § 19 Abs. 1a (Bauleistungen)","tax"],["044","Steuerschuld gemäß § 19 Abs. 1b","tax"],["032","Steuerschuld gemäß § 19 Abs. 1d","tax"],
  ["070","Gesamtbetrag der innergemeinschaftlichen Erwerbe","base"],["071","davon steuerfrei gemäß Art. 6 Abs. 2","base"],
  ["072","ig. Erwerbe zu versteuern mit 20 %","both"],["125","ig. Erwerbe mit 4,9 %","both"],["073","ig. Erwerbe mit 10 %","both"],["008","ig. Erwerbe mit 13 %","both"],["088","ig. Erwerbe mit 19 %","both"],
  ["060","Gesamtbetrag der Vorsteuern","tax"],["061","Vorsteuern betreffend die entrichtete Einfuhrumsatzsteuer","tax"],["083","Vorsteuern betreffend die geschuldete, auf dem Abgabenkonto verbuchte EUSt","tax"],
  ["065","Vorsteuern aus dem innergemeinschaftlichen Erwerb","tax"],["066","Vorsteuern betreffend Reverse Charge (§ 19 Abs. 1 zweiter Satz, 1c, 1e, Art. 25 Abs. 5)","tax"],
  ["082","Vorsteuern betreffend § 19 Abs. 1a (Bauleistungen)","tax"],["087","Vorsteuern betreffend § 19 Abs. 1b","tax"],["089","Vorsteuern betreffend § 19 Abs. 1d","tax"],
  ["064","Vorsteuern für ig. Lieferungen neuer Fahrzeuge (Art. 2)","tax"],["062","davon nicht abzugsfähig gemäß § 12 Abs. 3 iVm Abs. 4 und 5","tax"],
  ["063","Berichtigung gemäß § 12 Abs. 10 und 11","tax"],["067","Berichtigung gemäß § 16","tax"],["090","Sonstige Berichtigungen","tax"]
];
var MANUAL_KZ=["001","056","048","082","044","087","032","089","061","083","064","062","063","067","090","071","012","015","018","019"];

// Entgeltsminderung: bezahlte Rechnung mit Zahlbetrag < Brutto (Skonto, Teilausfall) bzw. im Cockpit als uneinbringlich markiert
/* Ausgebuchte Forderung: im Cockpit mit Datum erfasst (docs[id].ausfall) oder automatisch erkannt – sevDesk liefert über die API
   kein eigenes Kennzeichen; „ausgebucht“ zeigt sich als Status bezahlt (1000) ohne Zahlungsbetrag. Abschaltbar je Rechnung (noAusfall). */
function ausgebucht(inv,st){ var c=docCfg(st,inv.id); if(inv.type==="SR"||inv.type==="AR") return null;
  if(STORNIERT[inv.id]&&!c.ausfall) return null;   // storniert (SR vorhanden) – kein Forderungsausfall
  if(c.ausfall) return {date:c.ausfall,auto:false};
  if(c.noAusfall||inv.status!==1000||num(inv.gross)<=0||Math.abs(num(inv.paid))>=0.005||payments(inv).length) return null;
  return {date:inv.payDate||inv.date,auto:true}; }
function minderung(inv,st){
  if(inv.type==="SR"||inv.type==="AR"||inv.type==="ER") return null; var c=docCfg(st,inv.id), g=num(inv.gross), paid=num(inv.paid);
  if(g<=0) return null;
  var au=ausgebucht(inv,st); if(au){ var open=g-paid; if(open>0.01&&Math.abs(num(inv.tax))>0.004) return {date:au.date,share:open/g,amount:open,auto:au.auto,why:(au.auto?"ausgebucht laut sevDesk (bezahlt ohne Zahlung)":"Forderungsausfall (uneinbringlich)")+" – Berichtigung § 16 Abs. 3 UStG"}; return null; }
  if(c.noMinderung||inv.status!==1000||paid<0.005) return null;
  var diff=g-paid; if(diff<0.02||diff/g>0.5) return null;   // > 50 % Differenz: eher Teilzahlung/Gutschrift – nicht automatisch
  var d=inv.payDate||(inv.pays&&inv.pays.length?inv.pays[inv.pays.length-1].date:""); if(!d) return null;
  return {date:d,share:diff/g,amount:diff,why:"Entgeltsminderung (Skonto/Kürzung "+(diff/g*100).toFixed(1).replace(".",",")+" %) im Monat der Zahlung"};
}
function computeUva(raw,st,p){
  setRules(raw,st);
  var K={}, docs={}, zm=[], review=[], info=[], other={ns:[],oss:[],fx:[],none:[]}, minder=[];
  function k(kz){ return K[kz]=K[kz]||{base:0,tax:0}; }
  function add(kz,base,tax,doc,kind,date,why){ var x=k(kz); x.base+=base||0; x.tax+=tax||0; (docs[kz]=docs[kz]||[]).push({doc:doc,kind:kind,base:r2(base),tax:r2(tax),date:date,why:why||""}); }
  // Ausgangsrechnungen – Sollbesteuerung: Monat der Leistung (Leistungsdatum, sonst Rechnungsdatum). Anzahlungen: bei Zufluss (Mindest-Istbesteuerung).
  var PT=partials(raw,st);
  (raw.invoices||[]).forEach(function(inv){
    if(skipInv(inv,st)) return;
    var ls=lines(inv), parts=[];
    if(inv.type==="AR"){
      // Anzahlung: bei Zahlungseingang; Zahlungen nach dem Soll-Monat der Endrechnung sind dort bereits versteuert
      var g=num(inv.gross), lk=PT.ar[inv.id]; payments(inv).forEach(function(pm){ if(!inP(pm.date,p)||!g) return; if(lk&&pm.date>lk.cut){ info.push({doc:inv,why:"Zahlung nach der Endrechnung "+(lk.er.nr||"")+" – dort versteuert"}); return; } parts.push({share:pm.amount/g,date:pm.date,why:"Anzahlung bei Zahlungseingang"}); });
      parts.forEach(function(pt){ ls.forEach(function(l){ revLine(inv,l,pt,"out"); }); });
    } else if(inv.type==="SR"){
      if(inP(inv.date,p)) ls.forEach(function(l){ revLine(inv,l,{share:1,date:inv.date,why:"Storno – Monat der Ausstellung"},"out"); });
    } else {
      // ZM für ig. sonstige Leistungen: Monat der Leistung (Art. 21 Abs. 3 UStG) – ohne Verschiebung durch spätere Rechnung
      var erI=inv.type==="ER"?PT.er[inv.id]:null, tot=erI?erI.f:1;
      var dS=sollDate(inv), dL=leistEnd(inv), why=!inv.delivery&&!inv.deliveryUntil?"Rechnungsdatum (kein Leistungsdatum)":(dS!==dL?"Rechnung nach dem Leistungsmonat – Steuerschuld um einen Monat verschoben (§ 19 Abs. 2 Z 1 lit. a)":(inv.deliveryUntil&&inv.deliveryUntil!==inv.delivery?"Ende des Leistungszeitraums (Dauerleistung)":"Leistungsdatum"));
      if(erI) why="Endrechnung: Gesamtentgelt "+erI.F.toFixed(2)+" − bereits versteuert "+erI.D.toFixed(2)+(erI.mode==="rest"?" (Kopfsumme = Restbetrag)":" (Kopfsumme = Gesamtentgelt)");
      var sp=sollParts(inv,st,tot);
      ls.forEach(function(l){ if(outClass(inv,l,st)==="zm"){ if(inP(dL,p)) revLine(inv,l,{share:tot,date:dL,why:"Leistungsdatum (ZM)"},"out"); return; }
        sp.forEach(function(pt){ if(inP(pt.date,p)) revLine(inv,l,{share:pt.share,date:pt.date,why:pt.why||why},"out"); }); });
    }
    // Entgeltsminderung bei Sollbesteuerung (§ 16 UStG): Skonto/Teilausfall bei bezahlter Rechnung, Forderungsausfall laut Cockpit
    var m=minderung(inv,st); if(m&&inP(m.date,p)){ ls.forEach(function(l){ revLine(inv,{rate:l.rate,net:-l.net*m.share,tax:-l.tax*m.share},{share:1,date:m.date,why:m.why},"out"); }); minder.push({doc:inv,date:m.date,share:m.share,amount:r2(m.amount),why:m.why,auto:!!m.auto}); }
  });
  (raw.creditNotes||[]).forEach(function(cn){
    if(cn.status<200||docCfg(st,cn.id).ignore||docCfg(st,cn.id).kz==="ignore") return;
    var ls=lines(cn).map(function(l){ return {rate:l.rate,net:l.net>0?-l.net:l.net,tax:l.tax>0?-l.tax:l.tax}; });
    if(inP(cn.date,p)) ls.forEach(function(l){ revLine(cn,l,{share:1,date:cn.date,why:"Gutschrift – Monat der Ausstellung"},"out"); });
  });
  function revLine(doc,l,pt,kind){
    var net=l.net*pt.share, tax=l.tax*pt.share, c=outClass(doc,l,st);
    if(c==="inl"){ var kz=RATE_KZ[String(l.rate)]; if(!kz){ review.push({doc:doc,kind:kind,why:"Steuersatz "+l.rate+" % passt zu keiner Kennzahl"}); return; } add("000",net,0,doc,kind,pt.date,pt.why); add(kz,net,tax,doc,kind,pt.date,pt.why); }
    else if(c==="011"||c==="017"||c==="020"||c==="016"){ add("000",net,0,doc,kind,pt.date,pt.why); add(c,net,0,doc,kind,pt.date,pt.why); if(c==="017") zm.push({doc:doc,uid:outInfo(doc,st).uid,net:net,date:pt.date,kind:"L"}); }
    else if(c==="021"){ add("000",net,0,doc,kind,pt.date,pt.why); add("021",net,0,doc,kind,pt.date,pt.why); }
    else if(c==="zm"){ zm.push({doc:doc,uid:outInfo(doc,st).uid,net:net,date:pt.date,kind:"S"}); }
    else if(c==="zmd"){ zm.push({doc:doc,uid:outInfo(doc,st).uid,net:net,date:pt.date,kind:"L",dreieck:true}); }
    else if(c==="ns"){ other.ns.push({doc:doc,kind:kind,base:r2(net),date:pt.date}); }
    else if(c==="sonst"||c==="dlp"){ (other.sonst=other.sonst||[]).push({doc:doc,kind:kind,base:r2(net),date:pt.date,why:c==="dlp"?"durchlaufender Posten (nicht steuerbar)":""}); }
    else if(c==="nach20"){ var b20=net/1.2; add("000",b20,0,doc,kind,pt.date,"0 % irrtümlich – 20 % aus dem Betrag herausgerechnet"); add("022",b20,net-b20,doc,kind,pt.date,"0 % irrtümlich – 20 % aus dem Betrag herausgerechnet"); }
    else if(c==="oss"){ other.oss.push({doc:doc,kind:kind,base:r2(net),tax:r2(tax),date:pt.date}); }
    else review.push({doc:doc,kind:kind,why:"0 % ohne passende Steuerregel – bitte einordnen"});
  }
  (raw.vouchers||[]).forEach(function(v){
    if(skipVou(v,st)) return;
    var ls=lines(v);
    if(v.cd==="D"){ // Einnahmebeleg
      var dd=v.delivery||v.date; if(!inP(dd,p)) return;
      ls.forEach(function(l){ if(nonBiz(l)) return; revLine(v,l,{share:1,date:dd,why:"Einnahmebeleg"},"vin"); }); return;
    }
    if(v.cd!=="C") return;
    ls.forEach(function(l){
      if(nonBiz(l)&&docCfg(st,v.id).kz!=="060") return;
      var c=inClass(v,l,st);
      if(c==="rc"||c==="rcnv"){ var d1=rcDate(v); if(!inP(d1,p)) return; var t=r2(l.net*0.2); add("057",l.net,t,v,"in",d1,"Reverse Charge: Monat der Leistung"); if(c==="rc") add("066",0,t,v,"in",d1,"Vorsteuer aus Reverse Charge"); }
      else if(c==="ige"){ if(!inP(v.date,p)) return; var rate=l.rate>0&&IGE_KZ[String(l.rate)]?l.rate:20, t2=r2(l.net*rate/100); add("070",l.net,0,v,"in",v.date,"ig. Erwerb"); add(IGE_KZ[String(rate)],l.net,t2,v,"in",v.date,"ig. Erwerb"); add("065",0,t2,v,"in",v.date,"Vorsteuer ig. Erwerb"); }
      else if(c==="ige3"||c==="ige0"){ if(!inP(v.date,p)) return; add("070",l.net,0,v,"in",v.date,c==="ige3"?"Dreiecksgeschäft":"steuerfreier ig. Erwerb"); add(c==="ige3"?"077":"071",l.net,0,v,"in",v.date,c==="ige3"?"Erwerb gilt als besteuert (Art. 25 Abs. 2)":"steuerfrei (Art. 6 Abs. 2)"); }
      else if(c==="060"){ var dv=vstDate(v); if(!inP(dv,p)) return; add("060",0,l.tax,v,"in",dv,dv===v.date?"Belegdatum (Rechnung liegt vor, Leistung erbracht)":"Leistung erst "+dv+" ausgeführt bzw. bezahlt (§ 12 Abs. 1 Z 1 UStG)"); }
      else if(c==="eust"){ if(!inP(v.date,p)) return; add("061",0,l.tax||0,v,"in",v.date,"Einfuhrumsatzsteuer"); }
      else if(c==="fx"){ if(inP(v.date,p)) other.fx.push({doc:v,kind:"in",base:r2(l.net),tax:r2(l.tax),rate:l.rate,date:v.date}); }
      else if(c==="none"){ if(inP(v.date,p)&&Math.abs(l.tax)>0.004) other.none.push({doc:v,kind:"in",base:r2(l.net),tax:r2(l.tax),date:v.date,why:inWhy(v,l,st).why}); }
    });
  });
  // Manuelle Kennzahlen für diesen Zeitraum
  var man=(st.uvaManual&&p.key&&st.uvaManual[p.key])||{};
  Object.keys(man).forEach(function(kz){ var m=man[kz]; if(!m) return; var b=num(m.base), t=num(m.tax); if(!b&&!t) return; add(kz,b,t,{id:"manual-"+kz,nr:"manuell",contact:m.note||"manuelle Eingabe",supplier:m.note||"manuelle Eingabe"},"manual",p.to,"manuell erfasst"); });
  Object.keys(K).forEach(function(z){ K[z].base=r2(K[z].base); K[z].tax=r2(K[z].tax); });
  // Steuer der Satz-Kennzahlen so, wie das Finanzamt sie aus der Bemessungsgrundlage rechnet; Abweichung zur Rechnungssumme melden
  var roundDiff=[];
  Object.keys(RATE_OF).forEach(function(z){ if(!K[z]) return; var calc=r2(K[z].base*RATE_OF[z]/100); if(Math.abs(calc-K[z].tax)>0.05) roundDiff.push({kz:z,doc:r2(K[z].tax),calc:calc}); K[z].taxDocs=K[z].tax; K[z].tax=calc; });
  // Negative Werte: im Formular nicht zulässig (außer 063/067/090) → USt über KZ 090, Vorsteuer über KZ 067
  var corr=[];
  Object.keys(K).forEach(function(z){
    var x=K[z]; if(z==="063"||z==="067"||z==="090") return;
    var neg=(BASE_KZ.indexOf(z)>-1&&x.base<-0.004)||(TAX_KZ.indexOf(z)>-1&&x.tax<-0.004);
    if(!neg) return;
    if(UST_KZ.indexOf(z)>-1){ k("090").tax+=x.tax; corr.push({kz:z,to:"090",amount:r2(x.tax)}); if(IN_000.indexOf(z)>-1){ k("000").base-=x.base; } x.base=0; x.tax=0; }
    else if(["060","061","083","065","066","082","087","089","064"].indexOf(z)>-1){ k("067").tax+=x.tax; corr.push({kz:z,to:"067",amount:r2(x.tax)}); x.tax=0; }
    else if(z!=="000"){ if(IN_000.indexOf(z)>-1) k("000").base-=x.base; corr.push({kz:z,to:"0",amount:r2(x.base)}); x.base=0; }
  });
  if(K["000"]&&K["000"].base<0){ corr.push({kz:"000",to:"0",amount:r2(K["000"].base)}); K["000"].base=0; }
  Object.keys(K).forEach(function(z){ K[z].base=r2(K[z].base); K[z].tax=r2(K[z].tax); if(!K[z].base&&!K[z].tax&&z!=="000") delete K[z]; });
  var g=function(z){ return (K[z]&&K[z].tax)||0; };
  var ust=UST_KZ.reduce(function(a,z){ return a+g(z); },0);
  var vst=["060","061","083","065","066","082","087","089","064"].reduce(function(a,z){ return a+g(z); },0)-g("062")+g("063")+g("067");
  var zahllast=r2(ust-vst+g("090"));
  return {K:K,docs:docs,zm:zm,review:review,info:info,other:other,corr:corr,roundDiff:roundDiff,minder:minder,partials:PT,ust:r2(ust),vst:r2(vst),zahllast:zahllast,period:p};
}
// Kennzahlen für den FinanzOnline-Datenstrom: Bemessungsgrundlage bzw. Steuerbetrag je nach Kennzahl
function uvaKzMap(r){
  var out={"000":r.K["000"]?r.K["000"].base:0};
  Object.keys(r.K).forEach(function(z){ if(z==="000") return; if(BASE_KZ.indexOf(z)>-1){ if(r.K[z].base) out[z]=r.K[z].base; } else if(TAX_KZ.indexOf(z)>-1){ if(r.K[z].tax) out[z]=r.K[z].tax; } });
  if((out["065"]||out["071"]||out["072"])&&!("070" in out)) out["070"]=0;
  return out;
}
// ZM: je UID, Lieferungen (L) und sonstige Leistungen (S) getrennt
function zmRows(r){
  var by={}; r.zm.forEach(function(z){ var u=String(z.uid||"").replace(/[\s.\-]/g,"").toUpperCase(); var key=(u||("?"+(z.doc.contact||z.doc.id)))+"|"+z.kind+(z.dreieck?"D":""); var x=by[key]=by[key]||{uid:u,kunde:z.doc.contact||"",kind:z.kind,dreieck:!!z.dreieck,net:0,docs:[],valid:uidValid(u)}; x.net+=z.net; x.docs.push(z.doc); });
  return Object.keys(by).map(function(k){ by[k].net=r2(by[k].net); return by[k]; });
}

/* ---------- U1: Umsatzsteuer-Jahreserklärung ----------
   § 21 Abs. 4 UStG: Veranlagung nach Ablauf des Kalenderjahres, Erklärung über das ganze Jahr. Befreit nur Kleinunternehmer mit
   Umsätzen ≤ 55.000 € und ohne zu entrichtende Steuer (§ 21 Abs. 6). Frist § 134 Abs. 1 BAO: 30.04. (Papier) bzw. 30.06.
   (FinanzOnline) des Folgejahres; mit Steuerberater-Quote später. Jahreswerte nach Soll-Zeitpunkten über alle Monate –
   unabhängig davon, was in den UVAs gemeldet wurde; KZ 095 der U1 minus entrichtete Vorauszahlungen = Restschuld/Gutschrift. */
function periodOfKey(k){ var m=String(k||"").match(/^(\d{4})-(Q([1-4])|M(\d{2}))$/); if(!m) return null; var y=+m[1], a, b;
  if(m[3]){ a=(+m[3]-1)*3+1; b=a+2; } else { a=+m[4]; b=a; } var f=y+"-"+String(a).padStart(2,"0"); return {key:k,from:f+"-01",to:monthEnd(y+"-"+String(b).padStart(2,"0"))}; }
function computeU1(raw,st,year){
  var y=String(year), r=computeUva(raw,st,{key:"",from:y+"-01-01",to:y+"-12-31"}), kz=uvaKzMap(r), per=[], voraus=0;
  Object.keys(st.uva||{}).filter(function(k){ return k.slice(0,4)===y&&st.uva[k]&&st.uva[k].doneAt; }).sort().forEach(function(k){
    var u=st.uva[k], g=num(u.summary&&u.summary.zahllast), p=periodOfKey(k), now=p?computeUva(raw,st,p).zahllast:null; voraus+=g;
    per.push({key:k,gemeldet:r2(g),jetzt:now,diff:now==null?null:r2(now-g),fon:!!u.fon,doneAt:u.doneAt}); });
  var umsatz=r2(((r.K["000"]||{}).base||0)), nurKU=umsatz>0&&Math.abs(umsatz-((r.K["016"]||{}).base||0))<0.01;
  var pflicht=!(nurKU&&umsatz<=C.kleinunternehmer&&r.zahllast<=0);
  return {year:y,r:r,kz:kz,zahllast:r.zahllast,voraus:r2(voraus),rest:r2(r.zahllast-voraus),perioden:per,diffSum:r2(per.reduce(function(a,x){ return a+(x.diff||0); },0)),
    pflicht:pflicht,pflichtWhy:pflicht?"Regelbesteuert: U1 ist für "+y+" abzugeben (§ 21 Abs. 4 UStG).":"Kleinunternehmer mit Umsätzen bis 55.000 € und ohne Steuerschuld – keine U1-Pflicht (§ 21 Abs. 6 UStG).",
    frist:{papier:(+y+1)+"-04-30",fon:(+y+1)+"-06-30"}}; }

/* ---------- E1a / Jahresabschluss ---------- */
var E1A=[
  ["9100","Waren, Rohstoffe, Hilfsstoffe"],["9110","Beigestelltes Personal und Fremdleistungen"],["9120","Personalaufwand (eigenes Personal)"],
  ["9130","Abschreibungen (AfA linear, GWG)"],["9134","Degressive AfA (§ 7 Abs. 1a)"],["9150","Instandhaltung Gebäude"],["9160","Reise- und Fahrtspesen inkl. Kilometergeld und Diäten"],["9165","50 % Wochen-/Monats-/Jahreskarte Öffis"],
  ["9170","Tatsächliche Kfz-Kosten (ohne AfA, Leasing, Kilometergeld)"],["9180","Miet- und Pachtaufwand, Leasing"],["9190","Provisionen an Dritte, Lizenzgebühren"],
  ["9200","Werbe- und Repräsentationsaufwendungen, Trinkgelder"],["9200B","Bewirtung (Werbezweck) – 50 % abzugsfähig (Rest über KZ 9280)"],["9210","Buchwert abgegangener Anlagen"],
  ["9275","Arbeitszimmer"],["9215","Kleines Arbeitsplatzpauschale"],["9216","Ergonomisches Mobiliar (max. 300 €)"],["9217","Großes Arbeitsplatzpauschale"],
  ["9220","Zinsen und ähnliche Aufwendungen"],["9225","Eigene Pflichtversicherung (SVS), Selbständigenvorsorge"],
  ["9243","Spenden: Forschung, Lehre, Kultur, Denkmalamt"],["9244","Spenden: mildtätige Organisationen"],["9245","Spenden: Umwelt- und Tierschutz"],["9246","Spenden: freiwillige Feuerwehren"],["9206","Spenden: Sporteinrichtungen"],["9207","Spenden: Kindergärten"],["9208","Spenden: Schulen"],["9209","Spenden: andere begünstigte Einrichtungen"],
  ["9230","Übrige Aufwendungen/Betriebsausgaben (Saldo)"],["9090","Übrige Erträge (z. B. Zinserträge) – Einnahme"],["9060","Anlagenerträge (Verkauf Anlagevermögen) – Einnahme"],["none","nicht betrieblich / nicht absetzbar"]
];
var KW=[[/wareneinkauf|material|waren|rohstoff/i,"9100"],[/fremdleist|subunternehm|freelanc|fremdpersonal/i,"9110"],[/lohn|gehalt|personal/i,"9120"],[/abschreib|\bafa\b|gwg|geringwertig/i,"9130"],
  [/reise|fahrt|kilometer|diät|bahn|flug|hotel|übernacht|taxi/i,"9160"],[/kfz|treibstoff|tank|benzin|diesel|auto|fahrzeug|parken|vignette/i,"9170"],[/miete|pacht|leasing/i,"9180"],[/provision|lizenz/i,"9190"],
  [/bewirtung|geschäftsessen|restaurant/i,"9200B"],[/spende/i,"9209"],[/werbung|marketing|anzeige|\bads\b|repräsent|trinkgeld|geschenk/i,"9200"],[/zinsertr|zinsgutschrift/i,"9090"],[/zins/i,"9220"],[/svs|sozialversicherung|pflichtversicherung|selbständigenvorsorge|vorsorgekasse/i,"9225"]];
function defaultKz(cat){ if(NONBIZ.test(cat||"")) return "none"; for(var i=0;i<KW.length;i++){ if(KW[i][0].test(cat||"")) return KW[i][1]; } return "9230"; }
function catKz(st,l){ var cat=l.cat||"(ohne Kategorie)"; if(st.mapping&&st.mapping[cat]) return st.mapping[cat]; if(/^(TAX|VAT|VATPAY|VATIMPORT|VATINT|EQUITYIN|EQUITYOUT)$/i.test(l.catType||"")||catNoNonBiz(l)||l.sup==="fa") return "none"; if(l.sup==="svs") return "9225"; return defaultKz(cat); }

// Anlagegut: AfA-Plan (Halbjahresregel, linear oder degressiv mit Wechsel auf linear, Pkw mind. 8 Jahre, Luxustangente)
function assetInfo(v,st){
  var c=docCfg(st,v.id); if(!c.asset) return null;
  var ls=lines(v), ahk=0; ls.forEach(function(l){ var cl=inClass(v,l,st); ahk+=l.net+((cl==="none"||cl==="fx"||cl==="rcnv")?l.tax:0)+(cl==="rcnv"?l.net*0.2:0); });
  ahk=r2(Math.abs(ahk));
  var pkw=!!c.pkw, epkw=!!c.epkw, nd=Math.max(1,parseInt(c.nd,10)||3); if(pkw&&nd<C.pkwMinNd) nd=C.pkwMinNd;
  var start=c.start||v.date||"", sy=+start.slice(0,4), half=+start.slice(5,7)>6;
  var method=c.method==="deg"&&(!pkw||epkw)&&!c.used?"deg":"lin", degRate=Math.min(C.degMax,Math.max(1,num(c.degRate)||C.degMax))/100;
  var abg=c.abgang||"", ay=abg?+abg.slice(0,4):0, aHalf1=abg?(+abg.slice(5,7)<=6):false;
  // Luxustangente (PKW-Angemessenheitsverordnung, § 20 Abs. 1 Z 2 lit. b EStG): 40.000 € inkl. USt/NoVA – gilt auch für E-Pkw;
  // bei Vorsteuerabzug (E-Pkw) ist die Grenze auf netto 33.333,33 € umzurechnen (VwGH 2024, WKO „Elektromobilität“)
  var vstAbz=0; if(pkw) ls.forEach(function(l){ if(inClass(v,l,st)==="060") vstAbz+=l.tax; }); vstAbz=Math.abs(vstAbz);
  var lim=vstAbz>0.004?C.luxus/1.2:C.luxus, base=pkw&&ahk>lim?lim:ahk;
  var epkwNote=pkw&&epkw&&ahk+vstAbz>C.luxus&&ahk+vstAbz<=80000&&vstAbz>0.004?"E-Pkw zwischen 40.000 und 80.000 € brutto: Vorsteuer voll, aber Eigenverbrauch für den Anteil über 40.000 € (KZ 001, manuell) prüfen":"";
  // Linear: AHK/ND, im ersten Jahr halb bei Anschaffung im 2. Halbjahr. Degressiv: Satz × Restbuchwert, Wechsel auf linear sobald günstiger.
  var plan=[], bv=ahk, used=0, deg=method==="deg", lin=ahk/nd;
  for(var y=sy,i=0;i<80&&bv>0.004&&y>0;i++,y++){
    var factor=(y===sy&&half)?0.5:1; if(ay&&y===ay) factor=aHalf1?0.5:1;
    var rest=Math.max(0.5,nd-used), afa;
    if(deg){ var dA=bv*degRate*factor, lA=bv/rest*factor; if(y>sy&&lA>=dA){ deg=false; lin=bv/rest; afa=lA; } else afa=dA; }
    else afa=lin*factor;
    if(rest<=factor) afa=bv;                                  // letztes Jahr: Restbuchwert
    if(ahk<=C.gwg) afa=bv;                                    // GWG (§ 13 EStG): im Jahr der Anschaffung voll
    afa=r2(Math.min(bv,afa)); var afaL=ahk?afa*base/ahk:0;
    plan.push({year:y,afa:r2(afa),afaLux:r2(afa-afaL),bvStart:r2(bv),kz:deg?"9134":"9130",abgang:(ay&&y===ay)?r2(bv-afa):0});
    bv-=afa; used+=factor; if(ay&&y===ay) break;
  }
  var benefit=c.benefit||"";
  var ifbOk=nd>=4&&ahk>C.gwg&&!c.used&&(!pkw||epkw);
  var inErh=start>=C.ifbErhoeht[0]&&start<=C.ifbErhoeht[1];
  return {doc:v,ahk:ahk,nd:nd,pkw:pkw,epkw:epkw,luxBase:r2(base),note:epkwNote,method:method,degRate:degRate*100,start:start,sy:sy,half:half,plan:plan,benefit:benefit,ifbOk:ifbOk,ifbErhoeht:inErh,abgang:abg,gwg:ahk<=C.gwg};
}

// § 19 Abs. 1 Satz 2 / Abs. 2 Satz 2 EStG (EStR 2000 Rz 4631 ff.): regelmäßig wiederkehrende Einnahmen/Ausgaben, die kurze Zeit
// (bis 15 Tage) vor Beginn bzw. nach Ende des Kalenderjahres zu-/abfließen, zu dem sie wirtschaftlich gehören, zählen zu diesem Jahr.
// Automatisch für SVS-Beiträge (9225) und Miete/Leasing (9180); sonst im Cockpit je Beleg (docs[id].wk = "ja" | "nein").
function near15(d){ var md=String(d||"").slice(5,10); return md>="12-17"||(md&&md<="01-15"); }
// Wirtschaftliche Zugehörigkeit: Jahr des Leistungsbeginns (sonst Belegdatum); Fälligkeit ≈ Belegdatum, muss ebenfalls im 15-Tage-Fenster liegen
function zuYear(doc,pmDate,regular){ var y=String(pmDate||"").slice(0,4); if(!regular||!y) return y; var e=doc.delivery||doc.date||"", f=doc.date||e; if(!e||e.slice(0,4)===y) return y;
  return near15(pmDate)&&near15(f)&&Math.abs(dayNo(pmDate)-dayNo(f))<=31?e.slice(0,4):y; }
function isRegular(doc,st,ls){ var w=docCfg(st,doc.id).wk; if(w==="ja") return true; if(w==="nein") return false; return (ls||[]).some(function(l){ var k=catKz(st,l); return k==="9225"||k==="9180"; }); }
function computeJab(raw,st,year){
  var y=String(year), Y=yc(year), inp=jabInp(st,y), E={}, cats={}, assets=[], checks=[], rev=0, revDocs=[], other={}, notes=[];
  function addE(kz,v){ E[kz]=(E[kz]||0)+v; }
  // Einnahmen: Zufluss im Jahr, netto (Nettosystem). Anzahlungen zählen beim Zufluss; Endrechnung nur der Rest.
  (raw.invoices||[]).forEach(function(inv){
    if(skipInv(inv,st)) return; var g=Math.abs(num(inv.gross)), ls=lines(inv), net=ls.reduce(function(a,l){ return a+l.net; },0);
    // Anteil = gezahlter Betrag / Brutto; Storno (net bereits negativ) zählt beim Ausgleich negativ – keine doppelte Negation
    var reg=docCfg(st,inv.id).wk==="ja";
    payments(inv).forEach(function(pm){ if(zuYear(inv,pm.date,reg)!==y||!g) return; var sh=inv.type==="SR"?Math.abs(pm.amount)/g:pm.amount/g, n=net*sh; rev+=n; revDocs.push({doc:inv,net:r2(n),date:pm.date,src:pm.src}); });
  });
  // Gutschriften an Kunden (Rechnungskorrektur): Einnahmenminderung beim Abfluss (Zahlung laut Bank; sonst „bezahlt“ → Gutschriftsdatum)
  (raw.creditNotes||[]).forEach(function(cn){
    var c=docCfg(st,cn.id); if(cn.status<200||c.ignore||c.kz==="ignore") return; var g=Math.abs(num(cn.gross)), net=Math.abs(lines(cn).reduce(function(a,l){ return a+l.net; },0)); if(!g) return;
    var pm=payments(cn); if(!pm.length&&cn.status===1000) pm=[{date:cn.date,amount:g,src:"status"}];
    pm.forEach(function(x){ if(zuYear(cn,x.date,false)!==y) return; var n=-net*Math.abs(x.amount)/g; rev+=n; revDocs.push({doc:cn,net:r2(n),date:x.date,src:x.src}); });
  });
  (raw.vouchers||[]).forEach(function(v){
    if(skipVou(v,st)) return; var cfg=docCfg(st,v.id), ls=lines(v), g=num(v.gross);
    var reg=isRegular(v,st,ls);
    if(v.cd==="D"){ payments(v).forEach(function(pm){ if(zuYear(v,pm.date,reg)!==y||!g) return; var sh=pm.amount/g; ls.forEach(function(l){ if(nonBiz(l)) return; var kz=catKz(st,l), n=l.net*sh; if(kz==="9090"||kz==="9060"){ other[kz]=(other[kz]||0)+n; } else { rev+=n; revDocs.push({doc:v,net:r2(n),date:pm.date,src:pm.src}); } }); }); return; }
    if(v.cd!=="C") return;
    if(cfg.asset){ var a=assetInfo(v,st); if(a){ var pl=a.plan.find(function(x){ return x.year===+y; }); if(pl){ addE(pl.kz,pl.afa); if(pl.afaLux) other.lux=(other.lux||0)+pl.afaLux; if(pl.abgang) addE("9210",pl.abgang); } assets.push({a:a,cur:pl||null}); } return; }
    payments(v).forEach(function(pm){ if(zuYear(v,pm.date,reg)!==y||!g) return; var sh=pm.amount/g; if(String(pm.date).slice(0,4)!==y) notes.push({doc:v,why:"§ 19 EStG 15-Tage-Regel: Zahlung "+pm.date+" zählt wirtschaftlich zu "+y});
      ls.forEach(function(l){ var cat=l.cat||"(ohne Kategorie)", kz=catKz(st,l), cl=inClass(v,l,st), n=l.net*sh;
        if(cl==="none"||cl==="fx") n+=l.tax*sh;                 // nicht abziehbare Vorsteuer (Pkw, ausländische USt) ist Aufwand
        if(cl==="rcnv") n+=l.net*0.2*sh;                        // RC ohne Vorsteuerabzug: geschuldete USt ist Aufwand
        var c=cats[cat]=cats[cat]||{cat:cat,kz:kz,sum:0,n:0,docs:[]}; c.sum+=n; c.n++; if(c.docs.indexOf(v)<0) c.docs.push(v);
        if(kz==="none") return;
        if(kz==="9090"||kz==="9060"){ other[kz]=(other[kz]||0)-n; return; }
        if(kz==="9200B"){ addE("9200",n); other.bewirtung=(other.bewirtung||0)+n; return; }
        addE(kz,n);
        if((Math.abs(l.net)>C.gwg||l.isAsset)&&kz!=="9225"&&kz!=="9180"&&kz!=="9110"&&kz!=="9120"&&!checks.some(function(x){ return x.doc===v; })) checks.push({doc:v,net:r2(l.net),cat:cat}); }); });
  });
  // Fahrten & Reisen (Kilometergeld, Tagesgeld, Nächtigungsgeld)
  var trips=(st.trips&&st.trips[y])||[], km=0, tg=0, nn=0;
  trips.forEach(function(t){ km+=num(t.km); var h=num(t.hours); tg+=h>12?Y.tag:(h>3?Math.min(Y.tag,Math.ceil(h)*Y.tag/12):0); nn+=Math.max(0,parseInt(t.nights,10)||0); });
  var kmAbs=Math.min(km,C.kmMax), kmGeld=r2(kmAbs*Y.km), tagG=r2(tg), naechtG=r2(nn*Y.naechtigung);
  if(kmGeld+tagG+naechtG>0) addE("9160",kmGeld+tagG+naechtG);
  // Pauschalen und manuelle Beträge
  var ap=inp.ap==="gross"?C.apGross:inp.ap==="klein"?C.apKlein:0; if(ap) addE(inp.ap==="gross"?"9217":"9215",ap);
  if(num(inp.mobiliar)) addE("9216",Math.min(C.mobiliar,num(inp.mobiliar)));
  if(num(inp.oeffi)) addE("9165",r2(num(inp.oeffi)*0.5));
  if(num(inp.svs)) addE("9225",num(inp.svs));
  if(num(inp.sonstAufw)) addE("9230",num(inp.sonstAufw));
  Object.keys(E).forEach(function(z){ E[z]=r2(E[z]); if(!E[z]) delete E[z]; });
  var ertr={"9040":r2(rev),"9050":r2(num(inp.e9050)),"9060":r2((other["9060"]||0)+num(inp.e9060)),"9090":r2((other["9090"]||0)+num(inp.e9090))};
  var ertrSum=r2(ertr["9040"]+ertr["9050"]+ertr["9060"]+ertr["9090"]);
  var aufw=r2(Object.keys(E).reduce(function(a,z){ return a+E[z]; },0)), gewinn=r2(ertrSum-aufw);
  // Punkt 5: Korrekturen (gewinnerhöhend positiv, gewinnmindernd negativ)
  var K5={};
  var ifb={"9276":0,"9277":0,"9344":0,"9345":0}, ifbBase=0, gfbInvest=0;
  assets.forEach(function(x){ var a=x.a; if(a.sy!==+y) return; var b=a.benefit;
    // § 10 Abs. 3/4 EStG: ND ≥ 4 Jahre, nicht gebraucht, keine GWG, keine Pkw/Kombi
    if(b==="gfb"&&a.nd>=4&&!a.gwg&&!a.pkw&&!docCfg(st,a.doc.id).used) gfbInvest+=a.ahk;
    if(/^ifb/.test(b)&&a.ifbOk){ var base=Math.min(a.pkw?a.luxBase:a.ahk,Math.max(0,C.ifbMax-ifbBase));   // E-Pkw: nur angemessene AK ifbBase+=base;
      var oeko=b==="ifb15"||b==="ifb22", erh=a.ifbErhoeht; var kz=oeko?(erh?"9345":"9277"):(erh?"9344":"9276"); var rate=oeko?(erh?0.22:0.15):(erh?0.20:0.10);
      ifb[kz]+=base*rate; x.ifb={kz:kz,amount:r2(base*rate)}; } });
  Object.keys(ifb).forEach(function(z){ if(ifb[z]) K5[z]=-r2(ifb[z]); });
  if(other.bewirtung) K5["9280"]=r2(other.bewirtung*0.5);
  var kfz=r2((other.lux||0)+num(inp.kfzPrivat)); if(kfz) K5["9260"]=kfz;
  if(num(inp.k9290)) K5["9290"]=r2(num(inp.k9290));
  var nachKorr=r2(gewinn+Object.keys(K5).reduce(function(a,z){ return a+K5[z]; },0));
  // Gewinnfreibetrag (§ 10): Grundfreibetrag automatisch, investitionsbedingt nur soweit durch Investitionen gedeckt
  var gfbBase=Math.max(0,nachKorr), grund=inp.gfbVerzicht?0:r2(Math.min(gfbBase,C.gfbGrund)*C.gfbRate), invMax=0, lo=C.gfbGrund;
  C.gfbBands.forEach(function(b){ if(gfbBase>lo) invMax+=(Math.min(gfbBase,b[0])-lo)*b[1]; lo=b[0]; });
  invMax=r2(invMax);
  var g9227=r2(Math.min(invMax,gfbInvest)), g9229=r2(Math.min(invMax-g9227,num(inp.wertpapiere)));
  var gfb=r2(grund+g9227+g9229), steuerGewinn=r2(nachKorr-gfb);
  // U1: alle Monate des Jahres nach den UVA-Regeln
  var u1=computeUva(raw,st,{key:"",from:y+"-01-01",to:y+"-12-31"}), paidUva=0, doneUva=Object.keys(st.uva||{}).filter(function(kk){ return kk.slice(0,4)===y; });
  doneUva.forEach(function(kk){ var sm=st.uva[kk].summary; if(sm) paidUva+=num(sm.zahllast); });
  // Basispauschalierung (§ 17) als Vergleich
  var P=Y.pausch, prate=(inp.pausch6?P.rate6:P.rate)/100, umsatz=ertr["9040"]+ertr["9050"];
  var pausch=r2(Math.min(umsatz*prate,P.limit*prate)), extra=["9100","9110","9120","9165","9215","9217","9225"].reduce(function(a,z){ return a+(E[z]||0); },0);
  var pGewinn=r2(ertrSum-pausch-extra), pGrund=r2(Math.min(Math.max(0,pGewinn),C.gfbGrund)*C.gfbRate), pSteuer=r2(pGewinn-pGrund);
  var prevRev=revenueNet(raw,st,+y-1);
  var pauschVgl={rate:prate*100,pausch:pausch,extra:r2(extra),gewinn:pGewinn,gfb:pGrund,steuerGewinn:pSteuer,limit:P.limit,erlaubt:prevRev<=P.limit,prevRev:r2(prevRev),vorteil:r2(steuerGewinn-pSteuer)};
  var est=estimateESt(steuerGewinn,inp,year), estP=estimateESt(pSteuer,inp,year);
  pauschVgl.estDiff=r2(est.tax-estP.tax);
  return {year:y,Y:Y,ertr:ertr,ertrSum:ertrSum,rev:ertr["9040"],revDocs:revDocs,E:E,cats:Object.keys(cats).map(function(kk){ cats[kk].sum=r2(cats[kk].sum); return cats[kk]; }).sort(function(a,b){ return b.sum-a.sum; }),
    aufw:aufw,gewinn:gewinn,K5:K5,nachKorr:nachKorr,grund:grund,g9227:g9227,g9229:g9229,invMax:invMax,gfbInvest:r2(gfbInvest),gfb:gfb,steuerGewinn:steuerGewinn,
    assets:assets,checks:checks,notes:notes,trips:{n:trips.length,km:km,kmAbs:kmAbs,kmGeld:kmGeld,tag:tagG,naecht:naechtG},u1:u1,paidUva:r2(paidUva),doneUva:doneUva.length,pausch:pauschVgl,est:est,inp:inp};
}
// Einkommensteuer-Schätzung (Tarif § 33, Familienbonus Plus, AVAB/AEAB, Kindermehrbetrag) – nur Richtwert
function tarif(eink,year){ var T=yc(year).tarif, tax=0, lo=0; for(var i=0;i<T.length;i++){ var hi=T[i][0]; if(eink>lo) tax+=(Math.min(eink,hi)-lo)*T[i][1]; lo=hi; } return r2(tax); }
/* ---------- Kinder: Familienbonus Plus, AVAB/AEAB, Kindermehrbetrag, Unterhaltsabsetzbetrag ----------
   Familienbonus (§ 33 Abs. 3a EStG): steht der/dem Familienbeihilfe-Berechtigten oder deren (Ehe-)Partner*in zu, sowie dem
   unterhaltspflichtigen Elternteil (mit Unterhaltsabsetzbetrag). Aufteilung je Kind 100/0 oder 50/50; nicht erstattungsfähig.
   Voreinstellung FS Creative (Angabe des Inhabers): Kind 1 = Kind der Partnerin, Partnerin und Ex teilen 50/50 → Simon 0 %;
   Kind 2 = gemeinsames Kind, Partnerin beansprucht 100 % → Simon 0 %. Geburtsdaten unbekannt → Alter < 18 angenommen. */
var KIDS_DEFAULT=[{name:"Kind 1",rel:"partnerin",fb:"partnerin",share:0,birth:"",months:12,unterhalt:false,note:"Partnerin und Ex (unterhaltspflichtig) teilen den Familienbonus 50/50"},
  {name:"Kind 2",rel:"gemeinsam",fb:"partnerin",share:0,birth:"",months:12,unterhalt:false,note:"Partnerin beansprucht den vollen Familienbonus"}];
function kids(inp){ var k=inp&&Array.isArray(inp.kids)?inp.kids:null; return (k||KIDS_DEFAULT).map(function(x){ return {name:x.name||"Kind",rel:x.rel||"gemeinsam",fb:x.fb||"partnerin",share:[0,50,100].indexOf(+x.share)>-1?+x.share:0,birth:/^\d{4}-\d{2}-\d{2}$/.test(x.birth||"")?x.birth:"",months:Math.max(0,Math.min(12,parseInt(x.months,10)>=0?parseInt(x.months,10):12)),unterhalt:!!x.unterhalt,note:x.note||"",isDefault:!k}; }); }
// Eingaben eines Jahres; Kinder werden aus dem letzten Vorjahr mit Angaben übernommen, solange für das Jahr nichts gespeichert ist
function jabInp(st,year){ var y=String(year), inp=Object.assign({},(st.jabInput&&st.jabInput[y])||{}); if(!Array.isArray(inp.kids)){ var ys=Object.keys(st.jabInput||{}).filter(function(k){ return k<y&&Array.isArray(st.jabInput[k].kids); }).sort(); if(ys.length) inp.kids=st.jabInput[ys[ys.length-1]].kids; } return inp; }
function faboKids(inp,year){
  var Y=yc(year), y=+year;
  return kids(inp).map(function(k){
    var by=k.birth?+k.birth.slice(0,4):0, bm=k.birth?+k.birth.slice(5,7):0, full=0, m18=0, warn=[];
    for(var m=1;m<=k.months;m++){ var u18=!by||(by+18>y)||(by+18===y&&m<=bm); full+=u18?Y.fabo/12:Y.fabo18/12; if(!u18) m18++; }
    if(!k.birth) warn.push("Geburtsdatum fehlt – Alter unter 18 angenommen");
    if(k.share===100&&k.fb!=="simon"&&k.rel==="partnerin") warn.push("Bei einem Kind der Partnerin mit unterhaltspflichtigem Ex-Partner sind höchstens 50 % möglich, wenn dieser den Bonus beansprucht");
    if(k.share>0&&k.fb==="ex") warn.push("Familienbeihilfe bezieht der Ex-Partner – als Partner der Mutter steht dir dann kein Familienbonus zu");
    var age=by?(y-by-(bm>12?1:0)):null;
    return {kid:k,full:r2(full),simon:r2(full*k.share/100),monthsOver18:m18,age:age,warn:warn};
  });
}
function estimateESt(gewinn,inp,year){
  var Y=yc(year), vv=Math.max(0,num(inp.verlustvortrag)), andere=num(inp.andereEinkuenfte);
  // Verlustvortrag: nur bis 75 % des Gesamtbetrags der Einkünfte (§ 18 Abs. 6 iVm § 2 Abs. 2b Z 2 EStG)
  var gesamt=Math.max(0,gewinn+andere), vvUsed=r2(Math.min(vv,gesamt*0.75));
  var kirche=Math.min(C.kirche,Math.max(0,num(inp.kirchenbeitrag))), spenden=Math.min(Math.max(0,num(inp.spenden)),Math.max(0,(gesamt-vvUsed)*0.1));
  var eink=Math.max(0,r2(gesamt-vvUsed-kirche-spenden));
  var t=tarif(eink,year), fk=faboKids(inp,year), notes=[];
  if(vv>vvUsed+0.005&&gesamt>0) notes.push("Verlustvortrag nur bis 75 % des Gesamtbetrags der Einkünfte verrechenbar (§ 2 Abs. 2b EStG) – Rest "+r2(vv-vvUsed).toFixed(2)+" € bleibt vortragsfähig.");
  var faboMax=r2(fk.reduce(function(a,x){ return a+x.simon; },0)), fabo=Math.min(faboMax,t), afterFabo=Math.max(0,r2(t-fabo));   // FABO nicht erstattungsfähig
  // AVAB: Lebensgemeinschaft > 6 Monate mit Kind (Familienbeihilfe) und Partner-Einkünfte ≤ Grenze; AEAB: alleinstehend mit Kind
  var nFb=fk.filter(function(x){ return x.kid.fb==="partnerin"||x.kid.fb==="simon"; }).length, pe=num(inp.partnerEinkommen), avabOk=!!inp.avab&&nFb>0&&pe<=Y.avabGrenze, aeabOk=!!inp.aeab&&!inp.avab&&nFb>0;
  if(inp.avab&&pe>Y.avabGrenze) notes.push("Alleinverdienerabsetzbetrag steht nicht zu: Einkünfte der Partnerin "+pe.toFixed(2)+" € über der Grenze von "+Y.avabGrenze+" €.");
  var n=nFb, avab=0; if((avabOk||aeabOk)&&n>0) avab=Y.avab[0]+(n>1?Y.avab[1]-Y.avab[0]:0)+(n>2?(n-2)*Y.avab[2]:0);
  // Kindermehrbetrag (§ 33 Abs. 7): bei AVAB/AEAB oder wenn beide Partner Einkünfte haben und jeweils < 700 € Steuer zahlen (Eingabe)
  var kmb=0; if(((avabOk||aeabOk)||inp.kmbBeide)&&n>0) kmb=Math.max(0,r2(Y.kmb*n-afterFabo));
  // Unterhaltsabsetzbetrag (§ 33 Abs. 4 Z 3 lit. b): für Kinder außerhalb des Haushalts, für die gesetzlicher Unterhalt geleistet wird
  var uab=0, ui=0; fk.forEach(function(x){ if(!x.kid.unterhalt) return; uab+=Y.uab[Math.min(ui,2)]*x.kid.months; ui++; });
  var tax=r2(afterFabo-avab-kmb-uab), voraus=num(inp.vorauszahlungen);
  var faboPartnerHint=fk.some(function(x){ return x.kid.rel==="gemeinsam"&&x.kid.fb==="partnerin"&&x.kid.share===0; });
  return {eink:eink,vvUsed:r2(vvUsed),vvRest:r2(vv-vvUsed),kirche:kirche,spenden:r2(spenden),tarif:t,fabo:r2(fabo),faboMax:faboMax,kids:fk,avab:avab,kmb:kmb,uab:r2(uab),tax:tax,voraus:voraus,rest:r2(tax-voraus),grenz:grenzSatz(eink,year),verified:Y.verified,notes:notes,avabGrenze:Y.avabGrenze,faboPartnerHint:faboPartnerHint};
}
function grenzSatz(e,year){ var T=yc(year).tarif; for(var i=0;i<T.length;i++){ if(e<=T[i][0]) return T[i][1]*100; } return 55; }
// Nettoumsatz eines Jahres laut sevDesk (Rechnungsdatum, gestellte Rechnungen ohne Vorlagen/Mahnungen)
function revenueNet(raw,st,year){ var s=0, y=String(year), PT=partials(raw,st); (raw.invoices||[]).forEach(function(i){ if(skipInv(i,st)||(i.type==="AR"&&PT.ar[i.id])) return; if(String(i.date||"").slice(0,4)!==y) return;
  if(i.type==="ER"&&PT.er[i.id]){ s+=PT.er[i.id].F-PT.er[i.id].list.filter(function(x){ return x.type==="TR"; }).reduce(function(a,x){ return a+num(x.net); },0); return; }
  s+=lines(i).reduce(function(a,l){ return a+l.net; },0); }); return r2(s); }
function revenueGross(raw,st,year){ var s=0, y=String(year); (raw.invoices||[]).forEach(function(i){ if(skipInv(i,st)||i.type==="AR") return; if(String(i.date||"").slice(0,4)===y) s+=(i.type==="SR"&&num(i.gross)>0?-1:1)*num(i.gross); }); return r2(s); }

/* ---------- Plausibilität: grobe Rechenfehler sichtbar machen ---------- */
function plausibility(raw,st,year){
  var y=String(year), out=[];
  var u=computeUva(raw,st,{key:"",from:y+"-01-01",to:y+"-12-31"});
  var uvaRev=r2(((u.K["000"]||{}).base||0)+u.zm.reduce(function(a,z){ return a+z.net; },0)+u.other.ns.reduce(function(a,z){ return a+z.base; },0)+u.other.oss.reduce(function(a,z){ return a+z.base; },0)+u.corr.filter(function(c){ return c.kz==="000"; }).reduce(function(a,c){ return a+c.amount; },0));
  var dRev=0; (raw.vouchers||[]).forEach(function(v){ if(v.cd!=="D"||skipVou(v,st)||String(v.delivery||v.date||"").slice(0,4)!==y) return; lines(v).forEach(function(l){ if(!nonBiz(l)) dRev+=l.net; }); });
  var sevRev=r2(revenueNet(raw,st,y)+dRev), diff=r2(uvaRev-sevRev);
  out.push({id:"rev",ok:!sevRev||Math.abs(diff)<=Math.max(1,Math.abs(sevRev)*0.01),t:"Erlöse "+y+" laut UVA-Rechnung vs. sevDesk-Rechnungen",a:uvaRev,b:sevRev,d:diff,hint:"Unterschiede entstehen durch Leistungsdatum im Vor-/Folgejahr, Anzahlungen oder nicht eingeordnete Belege ("+u.review.length+")."});
  var dupe=raw.meta&&raw.meta.dupes||{}; var dn=Object.keys(dupe).reduce(function(a,kk){ return a+(dupe[kk]||0); },0);
  out.push({id:"dupe",ok:!dn,t:"Doppelte Belege aus sevDesk (Paginierung)",a:dn,hint:dn?"Es kamen Belege mehrfach – sie wurden entfernt.":"keine"});
  var scaled=[]; (raw.invoices||[]).concat(raw.vouchers||[]).forEach(function(d){ if(String(d.date||"").slice(0,4)!==y) return; if(lines(d).some(function(l){ return l.scaled; })) scaled.push(d); });
  out.push({id:"pos",ok:!scaled.length,t:"Positionen weichen von der Belegsumme ab (Brutto/Netto, Rabatt)",a:scaled.length,docs:scaled.slice(0,30),hint:"Gerechnet wird mit der Kopfsumme des Belegs; Positionen nur für die Aufteilung nach Steuersatz."});
  var sr=(raw.invoices||[]).filter(function(i){ return i.type==="SR"&&String(i.date||"").slice(0,4)===y; });
  out.push({id:"sr",ok:true,t:"Stornorechnungen "+y,a:sr.length,hint:sr.filter(function(i){ return num(i.net)>0; }).length+" mit positiver Summe (werden negativ gerechnet), "+sr.filter(function(i){ return num(i.net)<0; }).length+" bereits negativ (bleiben so)."});
  var zeroPaid=(raw.invoices||[]).filter(function(i){ return i.status===1000&&num(i.paid)<0.005&&num(i.gross)>0&&String(i.date||"").slice(0,4)===y&&!skipInv(i,st); });
  out.push({id:"zeropaid",ok:!zeroPaid.length,t:"Als bezahlt markiert, aber ohne Zahlungsbetrag",a:zeroPaid.length,docs:zeroPaid.slice(0,30),hint:"Zählen in der E1a nicht als Einnahme (kein Zufluss). Falls doch bezahlt: Zahlung in sevDesk zuordnen."});
  var rv=(raw.vouchers||[]).filter(function(v){ return v.type==="RV"&&v.status>=100&&String(v.date||"").slice(0,4)===y; });
  out.push({id:"rv",ok:!rv.length,t:"Wiederkehrende Belege (sevDesk-Typ RV) – als Vorlage nicht mitgerechnet",a:rv.length+" · "+r2(rv.reduce(function(a,v){ return a+num(v.tax); },0)).toFixed(2).replace(".",",")+" € Steuer",docs:rv.slice(0,30),hint:"Falls sevDesk diese Belege in der USt-Auswertung zählt (keine eigenen Einzelbelege je Monat), bitte melden – dann sind sie echte Buchungen."});
  var drafts=(raw.vouchers||[]).filter(function(v){ return v.status===50&&String(v.date||"").slice(0,4)===y; }).length+(raw.invoices||[]).filter(function(i){ return i.status===100&&String(i.date||"").slice(0,4)===y; }).length;
  out.push({id:"drafts",ok:!drafts,t:"Entwürfe in sevDesk (nicht mitgerechnet)",a:drafts,hint:drafts?"Entwürfe zählen nicht – in sevDesk fertigstellen, falls sie in den Zeitraum gehören.":"keine"});
  var nb=0, nbSum=0; (raw.vouchers||[]).forEach(function(v){ if(skipVou(v,st)||String(v.date||"").slice(0,4)!==y) return; lines(v).forEach(function(l){ if(nonBiz(l)){ nb++; nbSum+=l.net+l.tax; } }); });
  out.push({id:"nonbiz",ok:true,t:"Privat, Steuerzahlungen, Umbuchungen ausgeschlossen",a:nb+" Pos. · "+r2(nbSum).toFixed(2).replace(".",",")+" €",hint:"Positionen mit Kategorien wie Privatentnahme, USt-Vorauszahlung, Einkommensteuer, Darlehen zählen weder als Einnahme noch als Ausgabe."});
  if(u.roundDiff.length) out.push({id:"round",ok:Math.max.apply(null,u.roundDiff.map(function(x){ return Math.abs(x.calc-x.doc); }))<1,t:"USt laut Rechnungen vs. USt aus Bemessungsgrundlage",a:u.roundDiff.map(function(x){ return "KZ "+x.kz+": "+x.doc.toFixed(2)+" / "+x.calc.toFixed(2); }).join(", "),hint:"Das Finanzamt rechnet die Steuer aus der Bemessungsgrundlage. Größere Differenzen deuten auf falsch erfasste Steuersätze hin."});
  return out;
}

/* ---------- Kontrollrechnung je Zeitraum: Steuer direkt aus den sevDesk-Kopfsummen ---------- */
// USt = Summe sumTax der Ausgangsrechnungen (Leistungs-/Rechnungsdatum im Zeitraum), Vorsteuer = Summe sumTax der Eingangsbelege mit österreichischer USt (Belegdatum).
// Nachbildung der sevDesk-USt-Auswertung: USt der Einnahmen (Rechnungs-/Belegdatum) minus ausgewiesene, laut Steuerregel
// abziehbare Vorsteuer (Belegdatum). Reverse Charge und ig. Erwerb sind dort steuerneutral und fehlen. Abweichungen zur U30
// entstehen v. a. durch den Soll-Zeitpunkt (Leistungsdatum, Anzahlungen, Endrechnungen) und Cockpit-Einordnungen → diffs.
function controlCheck(raw,st,p){
  setRules(raw,st); var ust=0, vst=0, nIn=0, nOut=0, diffs=[], PT=partials(raw,st);
  (raw.invoices||[]).forEach(function(inv){ if(skipInv(inv,st)) return; var t=num(inv.tax); if(inv.type==="SR"&&num(inv.net)>0) t=-t;
    var inS=inP(inv.date,p); if(inS){ ust+=t; nOut++; }
    var uv=[]; if(inv.type==="AR"){ var lk=PT.ar[inv.id]; payments(inv).forEach(function(pm){ if(!(lk&&pm.date>lk.cut)) uv.push(pm.date); }); }
    else if(inv.type==="SR") uv.push(inv.date); else sollParts(inv,st,1).forEach(function(pt){ uv.push(pt.date); });
    var inU=uv.some(function(d){ return inP(d,p); });
    if(Math.abs(t)>0.004&&(inS!==inU||(inS&&uv.some(function(d){ return !inP(d,p); }))||(inv.type==="ER"&&inS))) diffs.push({doc:inv,kind:"out",tax:r2(t),sev:inv.date,uva:uv.join(", "),why:inv.type==="AR"?"Anzahlung: U30 im Monat der Zahlung":(inv.type==="ER"?"Endrechnung: U30 nur Gesamtentgelt abzüglich versteuerter Anzahlungen":"U30 nach Leistungsdatum/Soll-Zeitpunkt, sevDesk nach Rechnungsdatum")}); });
  (raw.creditNotes||[]).forEach(function(cn){ var cc=docCfg(st,cn.id); if(cn.status<200||cc.ignore||cc.kz==="ignore"||!inP(cn.date,p)) return; ust-=Math.abs(num(cn.tax)); });
  (raw.vouchers||[]).forEach(function(v){ if(skipVou(v,st)) return; var ls=lines(v);
    if(v.cd==="D"){ if(inP(v.date,p)) ls.forEach(function(l){ if(!nonBiz(l)) ust+=l.tax; }); return; }
    if(v.cd!=="C") return; var t=0; ls.forEach(function(l){ if(!nonBiz(l)&&sevClassOf(v,l)==="060"&&atRate(l.rate)) t+=l.tax; }); if(Math.abs(t)<0.005) return;
    var inS=inP(v.date,p), dv=vstDate(v), inU=inP(dv,p); if(inS){ vst+=t; nIn++; }
    var our=ls.reduce(function(a,l){ return a+(inClass(v,l,st)==="060"&&!nonBiz(l)?l.tax:0); },0);
    if(inS!==inU) diffs.push({doc:v,kind:"in",tax:r2(t),sev:v.date,uva:dv,why:"Vorsteuer erst mit Leistung bzw. Zahlung (§ 12 Abs. 1 Z 1 UStG)"});
    else if(inS&&Math.abs(our-t)>0.005) diffs.push({doc:v,kind:"in",tax:r2(t-our),sev:v.date,uva:dv,why:"im Cockpit anders eingeordnet (z. B. Pkw, ausländische USt, Override)"}); });
  return {ust:r2(ust),vst:r2(vst),zahllast:r2(ust-vst),nOut:nOut,nIn:nIn,diffs:diffs};
}

/* ---------- Ausgangsrechnungen ohne USt und unklare ig. Erwerbe: zur Zuordnung ---------- */
function zeroRated(raw,st,p){ setRules(raw,st); var out=[];
  (raw.invoices||[]).forEach(function(inv){ if(skipInv(inv,st)||inv.type==="SR") return; var ls=lines(inv); if(!ls.some(function(l){ return Math.abs(l.tax)<0.005&&Math.abs(l.net)>0.004&&!(l.rate>0); })) return;
    var d=leistEnd(inv); if(!inP(d,p)&&!inP(inv.date,p)) return;
    var w=null; ls.forEach(function(l){ if(l.rate>0) return; var x=outWhy(inv,l,st); if(!w||!x.sure) w=x; }); if(!w) return;
    var oi=outInfo(inv,st), cfg=docCfg(st,inv.id);
    out.push({doc:inv,net:r2(ls.filter(function(l){ return !(l.rate>0); }).reduce(function(a,l){ return a+l.net; },0)),klasse:w.c,why:w.why,sure:!!w.sure,manual:!!(cfg.kz&&cfg.kz!=="auto"),at:!!w.at,uid:oi.uid,uidSrc:oi.uidSrc,land:oi.cc,landSrc:oi.ccSrc,rule:ruleKey(inv)?ruleTxt(ruleKey(inv)):""}); });
  return out; }
function igeReview(raw,st,p){ setRules(raw,st); var by={};
  (raw.vouchers||[]).forEach(function(v){ if(v.cd!=="C"||skipVou(v,st)||!inP(v.date,p)) return; lines(v).forEach(function(l){ var r=ruleKey(v); if(nonBiz(l)||!(r?ruleIn(r)==="ige":v.taxType==="eu")||(docCfg(st,v.id).kz&&docCfg(st,v.id).kz!=="auto")) return;
    var w=igeOrService(v,l,st), k=supKey(v), x=by[k]=by[k]||{key:k,supplier:v.supplier||"",klasse:w.c,why:w.why,sure:w.sure,net:0,docs:[]}; x.net+=l.net; if(x.docs.indexOf(v)<0) x.docs.push(v); if(!w.sure) x.sure=false; }); });
  return Object.keys(by).map(function(k){ by[k].net=r2(by[k].net); return by[k]; }); }



/* ---------- Abgleich mit sevDesk (Steuerregel, Lieferant, Leistungsdatum, Overrides) ---------- */
// Vorgeschlagene sevDesk-Steuerregel: bevorzugt die im Konto vorhandene Regel mit passender Bedeutung (ReceiptGuidance), sonst Standard-IDs
function suggestRule(v,c){
  var cc=supplierCountry(v), eu=isEU(cc)&&cc!=="AT", want=c==="fx"?"none":c;
  if(RULES&&Object.keys(RULES).length){ var ids=Object.keys(RULES).filter(function(id){ return RULES[id].in===want; });
    if(ids.length){ if(want==="rc"&&ids.length>1){ var e=ids.filter(function(id){ return /\beu\b|abs\. ?1\b/i.test(RULES[id].txt); }); var ne=ids.filter(function(id){ return e.indexOf(id)<0; }); return (eu?e[0]:ne[0])||ids[0]; } return ids[0]; } }
  if(c==="rc") return eu?"14":"12"; if(c==="rcnv") return "13"; if(c==="ige") return "8"; if(c==="060") return "9"; if(c==="none"||c==="fx") return "10"; return "";
}
function sevClassOf(v,l){ var r=ruleKey(v), sem=r?ruleIn(r):""; if(sem==="ige"||sem==="none"||sem==="rc"||sem==="rcnv") return sem; if(sem==="060"||!r) return Math.abs(l.tax)>0.004?"060":"none"; return ""; }
function mismatches(raw,st,from,to){
  setRules(raw,st); var out=[];
  (raw.vouchers||[]).forEach(function(v){
    if(v.cd!=="C"||skipVou(v,st)) return; var d=v.date||""; if(from&&(d<from||d>to)) return;
    var ls=lines(v), cc=supplierCountry(v), seen={};
    ls.forEach(function(l){
      if(nonBiz(l)) return;
      var mine=inClass(v,l,st), sev=sevClassOf(v,l), ov=docCfg(st,v.id).kz;
      var key=mine+"|"+sev; if(seen[key]) return; seen[key]=1;
      if(mine==="060"&&catKz(st,l)==="9170"&&!docCfg(st,v.id).epkw&&!seen.pkw){ seen.pkw=1; out.push({doc:v,kind:"in",type:"pkw",t:"Kfz-Kosten mit Vorsteuer: bei Pkw/Kombi kein Vorsteuerabzug (§ 12 Abs. 2 Z 2 lit. b UStG) – ausgenommen E-Pkw (CO2 0), Fiskal-Lkw/Klein-Lkw laut BMF-Liste, Kleinbusse",fix:"In sevDesk als 'nicht vorsteuerabziehbar' buchen, falls Pkw.",rule:"",fixable:false}); }
      if(mine==="fx") out.push({doc:v,kind:"in",type:"fx",t:"Ausländische USt ("+l.rate+" %) – in Österreich nicht als Vorsteuer abziehbar",fix:"In sevDesk als 'nicht vorsteuerabziehbar' buchen; Rückholung nur über das Erstattungsverfahren des Landes.",rule:"",fixable:false});
      else if(sev&&mine!==sev&&!(mine==="none"&&sev==="none")){
        var rule=suggestRule(v,mine), allZero=ls.every(function(x){ return Math.abs(x.tax)<0.005&&!x.rate; });
        var canRule=!!rule&&!!v.taxRule&&(rule==="9"||rule==="8"||allZero);
        out.push({doc:v,kind:"in",type:ov&&ov!=="auto"?"override":"rule",t:(ov&&ov!=="auto"?"Cockpit-Einordnung weicht von sevDesk ab":"Steuerregel passt nicht")+": sevDesk "+(ruleKey(v)?ruleTxt(ruleKey(v)):(v.taxType||"–"))+" → Cockpit "+(IN_OPTS.filter(function(o){ return o[0]===mine; })[0]||[,mine])[1]+(cc?" (Lieferant "+cc+")":""),rule:rule,fixable:canRule&&!v.enshrined,enshrined:!!v.enshrined});
      }
    });
  });
  (raw.invoices||[]).forEach(function(inv){
    if(skipInv(inv,st)) return; var d=inv.delivery||inv.date||""; if(from&&(d<from||d>to)) return;
    var ls=lines(inv), cl=ls.map(function(l){ return outClass(inv,l,st); });
    if(cl.indexOf("zm")>-1||cl.indexOf("017")>-1){
      var eu0=outInfo(inv,st).uid, uv=uidValid(eu0);
      if(!eu0) out.push({doc:inv,kind:"out",type:"uid",t:"Leistung an EU-Unternehmer ohne UID des Kunden – für ZM und Steuerfreiheit nötig",fixable:false});
      else if(!uv.ok) out.push({doc:inv,kind:"out",type:"uid",t:"UID „"+eu0+"“ ungültig: "+uv.why,fixable:false});
      if(!inv.delivery) out.push({doc:inv,kind:"out",type:"delivery",t:"Kein Leistungsdatum – ZM-Zeitraum wird nach Rechnungsdatum bestimmt",fixable:false});
    }
    var ov=docCfg(st,inv.id).kz; if(ov&&ov!=="auto"&&ov!=="ignore") out.push({doc:inv,kind:"out",type:"override",t:"Nur im Cockpit eingeordnet ("+ov+") – sevDesk-Steuerregel: "+(ruleKey(inv)?ruleTxt(ruleKey(inv)):(inv.taxType||"–")),fixable:false});
    if(Math.abs(num(inv.tax))>0.004&&/§ ?6 abs\.? ?1 z(iffer)?\.? ?27|kleinunternehmer/i.test(docText(inv))) out.push({doc:inv,kind:"out",type:"ku",t:"Rechnungstext Kleinunternehmer, aber USt ausgewiesen (§ 11 Abs. 12 UStG: die ausgewiesene Steuer wird geschuldet) – Rechnungstext korrigieren",fixable:false});
    if(cl.indexOf("pruefen")>-1) out.push({doc:inv,kind:"out",type:"rule",t:"0 % bei steuerpflichtiger Steuerregel – Steuerregel oder Satz in sevDesk prüfen",fixable:false});
  });
  return out;
}

/* ---------- Forderungen: erkannte Entgeltsminderungen und alte offene Rechnungen (mögliche Ausfälle) ---------- */
function receivables(raw,st,today){
  var out={minder:[],alt:[]}, lim=today?ymdAdd(today,-180):"";
  (raw.invoices||[]).forEach(function(inv){ if(skipInv(inv,st)) return; var c=docCfg(st,inv.id), g=num(inv.gross), paid=num(inv.paid);
    if(inv.status===1000&&!c.ausfall&&inv.type!=="SR"&&inv.type!=="AR"&&g>0&&paid>0.004&&g-paid>=0.02) out.minder.push({doc:inv,diff:r2(g-paid),pct:r2((g-paid)/g*100),aktiv:!!minderung(inv,st),aus:!!c.noMinderung});
    if((inv.status===200||inv.status===750)&&g>0&&(c.ausfall||(lim&&(inv.date||"")<lim))) out.alt.push({doc:inv,open:r2(g-paid),ausfall:c.ausfall||""}); });
  return out;
}
/* ---------- EU & Ausland: Übersicht je Kategorie ---------- */
function euSummary(raw,st,p){
  var r=computeUva(raw,st,p), y=String(p.from).slice(0,4), out={igErwerb:0,igErwerbDreieck:0,igErwerbFrei:0,igLieferung:0,igLeistung:0,dreieck:0,ausfuhr:0,drittland:0,oss:0,rcEU:0,rcDritt:0,fxEU:0,b2cEU:0,b2cEUJahr:0,docs:{}};
  function push(k,doc,amt){ (out.docs[k]=out.docs[k]||[]).push({doc:doc,base:r2(amt)}); }
  r.zm.forEach(function(z){ if(z.dreieck){ out.dreieck+=z.net; push("dreieck",z.doc,z.net); } else if(z.kind==="L"){ out.igLieferung+=z.net; push("igLieferung",z.doc,z.net); } else { out.igLeistung+=z.net; push("igLeistung",z.doc,z.net); } });
  (r.docs["070"]||[]).forEach(function(x){ out.igErwerb+=x.base; push("igErwerb",x.doc,x.base); });
  (r.docs["077"]||[]).forEach(function(x){ out.igErwerbDreieck+=x.base; });
  (r.docs["071"]||[]).forEach(function(x){ out.igErwerbFrei+=x.base; });
  (r.docs["011"]||[]).forEach(function(x){ out.ausfuhr+=x.base; push("ausfuhr",x.doc,x.base); });
  r.other.ns.forEach(function(x){ out.drittland+=x.base; push("drittland",x.doc,x.base); });
  r.other.oss.forEach(function(x){ out.oss+=x.base; push("oss",x.doc,x.base); });
  r.other.fx.forEach(function(x){ var cc=supplierCountry(x.doc); if(isEU(cc)) { out.fxEU+=x.tax; push("fxEU",x.doc,x.tax); } });
  (r.docs["057"]||[]).forEach(function(x){ var cc=supplierCountry(x.doc); if(isEU(cc)&&cc!=="AT"){ out.rcEU+=x.base; push("rcEU",x.doc,x.base); } else { out.rcDritt+=x.base; push("rcDritt",x.doc,x.base); } });
  // B2C an Privatkunden in anderen EU-Staaten (österr. USt, keine UID) – OSS-Schwelle 10.000 € pro Jahr (Art. 3 Abs. 5 UStG)
  function b2c(per,cb){ (raw.invoices||[]).forEach(function(inv){ if(skipInv(inv,st)) return; var oi=outInfo(inv,st), cc=oi.cc, d=sollDate(inv); if(!isEU(cc)||cc==="AT"||oi.uid||!inP(d,per)) return; lines(inv).forEach(function(l){ if(l.rate>0) cb(inv,l.net); }); }); }
  b2c(p,function(inv,n){ out.b2cEU+=n; push("b2cEU",inv,n); }); b2c({from:y+"-01-01",to:y+"-12-31"},function(inv,n){ out.b2cEUJahr+=n; });
  Object.keys(out).forEach(function(k){ if(typeof out[k]==="number") out[k]=r2(out[k]); });
  out.ossWarn=out.b2cEUJahr>C.ossSchwelle; out.zmRows=zmRows(r); out.zmSum=r2(r.zm.reduce(function(a,z){ return a+z.net; },0));
  out.kz={"017":((r.K["017"]||{}).base)||0,"070":((r.K["070"]||{}).base)||0,"072":((r.K["072"]||{}).tax)||0,"065":((r.K["065"]||{}).tax)||0,"057":((r.K["057"]||{}).base)||0,"057t":((r.K["057"]||{}).tax)||0,"066":((r.K["066"]||{}).tax)||0,"011":((r.K["011"]||{}).base)||0};
  return out;
}
/* ---------- Schnittstelle für KI-Vorschläge: aktuelle Einordnung eines Belegs mit Begründung ---------- */
// Liefert pro Position die Klasse (OUT_OPTS/IN_OPTS-Schlüssel), Kennzahlen und eine Begründung – ohne Seiteneffekte.
function explainDoc(raw,st,id){
  setRules(raw,st); id=String(id);
  var inv=(raw.invoices||[]).concat(raw.creditNotes||[]).find(function(d){ return d.id===id; }), v=(raw.vouchers||[]).find(function(d){ return d.id===id; }), d=inv||v;
  if(!d) return null;
  var out=!!inv||(v&&v.cd==="D"), kz={inl:"000 + Satz-KZ",ns:"–",zm:"ZM",zmd:"ZM (Dreieck)","017":"000 + 017","011":"000 + 011","020":"000 + 020","021":"000 + 021","016":"000 + 016",oss:"OSS","060":"060",rc:"057 + 066",rcnv:"057",ige:"070 + 072/073/008 + 065",ige3:"070 + 077",ige0:"070 + 071",eust:"061",fx:"–",none:"–",pruefen:"–"};
  var ls=lines(d).map(function(l){ var w=out?outWhy(d,l,st):inWhy(d,l,st); return {rate:l.rate,net:r2(l.net),tax:r2(l.tax),cat:l.cat,klasse:w.c,kennzahlen:kz[w.c]||"",begruendung:w.why,nichtBetrieblich:nonBiz(l)}; });
  return {id:id,art:out?"Ausgang":"Eingang",nr:d.nr||"",partner:d.contact||d.supplier||"",datum:d.date,leistungsdatum:d.delivery||null,netto:d.net,steuer:d.tax,brutto:d.gross,
    sevDeskRegel:ruleKey(d)?{id:ruleKey(d),text:ruleTxt(ruleKey(d))}:null,land:out?customerCountry(d,st):supplierCountry(d),uid:out?outInfo(d,st).uid:(d.supplierUid||""),override:docCfg(st,id).kz||null,
    positionen:ls,optionen:(out?OUT_OPTS:IN_OPTS).map(function(o){ return o[0]; })};
}

function uvaDocIds(r){ var ids={}; Object.keys(r.docs||{}).forEach(function(k){ r.docs[k].forEach(function(x){ if(x.doc&&x.doc.id&&!/^manual-/.test(x.doc.id)) ids[x.doc.id]=1; }); }); (r.zm||[]).forEach(function(z){ if(z.doc&&z.doc.id) ids[z.doc.id]=1; }); return Object.keys(ids); }
return {VERSION:10,uvaDocIds:uvaDocIds,ausgebucht:ausgebucht,reportedIn:reportedIn,rcDate:rcDate,isShortPeriod:isShortPeriod,periodClosed:periodClosed,periodDue:periodDue,ruleKey:ruleKey,computeU1:computeU1,periodOfKey:periodOfKey,zeroRated:zeroRated,igeReview:igeReview,outInfo:outInfo,addrCountry:addrCountry,textUids:textUids,ruleSrc:ruleSrc,RULE_IN_CLASSES:RULE_IN_CLASSES,RULE_OUT_CLASSES:RULE_OUT_CLASSES,partials:partials,sollParts:sollParts,sollDate:sollDate,leistEnd:leistEnd,vstDate:vstDate,zuYear:zuYear,YEARS:YEARS,C:C,yc:yc,r2:r2,lines:lines,payments:payments,outClass:outClass,inClass:inClass,supplierCountry:supplierCountry,customerCountry:customerCountry,uidCountry:uidCountry,isEU:isEU,
  OUT_OPTS:OUT_OPTS,IN_OPTS:IN_OPTS,UVA_ROWS:UVA_ROWS,MANUAL_KZ:MANUAL_KZ,BASE_KZ:BASE_KZ,TAX_KZ:TAX_KZ,TAXRULE_TXT:TAXRULE_TXT,E1A:E1A,
  computeUva:computeUva,uvaKzMap:uvaKzMap,zmRows:zmRows,computeJab:computeJab,assetInfo:assetInfo,estimateESt:estimateESt,tarif:tarif,catKz:catKz,defaultKz:defaultKz,nonBiz:nonBiz,
  revenueNet:revenueNet,revenueGross:revenueGross,controlCheck:controlCheck,plausibility:plausibility,mismatches:mismatches,docCfg:docCfg,
  outWhy:outWhy,inWhy:inWhy,uidValid:uidValid,ruleDiagnosis:ruleDiagnosis,ruleTxt:ruleTxt,setRules:setRules,receivables:receivables,euSummary:euSummary,explainDoc:explainDoc,minderung:minderung,kids:kids,faboKids:faboKids,jabInp:jabInp};
});
