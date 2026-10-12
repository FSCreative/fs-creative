/* Plattformen › Skikaiser: In-App-Käufe (Einmalkäufe, keine Abos).
   Daten: F.D.skikaiser (server.js skikaiserStats) – {configured:false} solange SKIKAISER_STATS_URL fehlt. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;

F.css(
'.sk-chart{padding:14px 18px 12px}'+
'.sk-cols{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:end;height:190px;border-bottom:1px solid var(--line)}'+
'.sk-col{height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;min-width:0}'+
'.sk-n{font-size:11px;color:var(--ink-3);text-align:center;font-family:var(--f-mono);margin-bottom:3px;min-height:14px}'+
'.sk-g{position:relative;background:var(--glow-soft);border:1px solid var(--glow);border-bottom:0;border-radius:5px 5px 0 0;min-height:0}'+
'.sk-g i{position:absolute;left:0;right:0;bottom:0;background:var(--glow);border-radius:4px 4px 0 0}'+
'.sk-col.cur .sk-g{box-shadow:0 0 0 2px var(--ink) inset}'+
'.sk-lab{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;margin-top:6px;font-size:11.5px;color:var(--ink-3);text-align:center}'+
'.sk-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2);margin-bottom:10px}'+
'.sk-leg span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:var(--c);border:1px solid var(--glow)}'+
'.sk-recent{list-style:none;margin:0;padding:0}'+
'.sk-recent li{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 18px;border-bottom:1px solid var(--line);font-size:13.5px}'+
'.sk-recent li:last-child{border-bottom:0}'+
'.sk-recent .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}'+
'.sk-share{height:6px;border-radius:99px;background:var(--sunk);overflow:hidden;margin-top:5px;max-width:220px}'+
'.sk-share i{display:block;height:100%;background:var(--glow)}'+
'.sk-empty{padding:26px clamp(18px,3vw,32px);display:grid;gap:18px}'+
'.sk-empty h2{font-size:22px}'+
'.sk-empty p{margin:0;color:var(--ink-2);max-width:68ch}'+
'.sk-steps{list-style:none;margin:0;padding:0;display:grid;gap:16px;counter-reset:sk}'+
'.sk-steps>li{display:grid;grid-template-columns:30px minmax(0,1fr);gap:12px;counter-increment:sk}'+
'.sk-steps>li::before{content:counter(sk);width:28px;height:28px;border-radius:50%;background:var(--glow);color:#2a1a00;display:grid;place-items:center;font-weight:700;font-size:14px}'+
'.sk-steps h3{font-size:16px;margin-bottom:4px}'+
'.sk-code{margin:8px 0 0;padding:12px 14px;background:var(--sunk);border:1px solid var(--line);border-radius:10px;font:12.5px/1.55 var(--f-mono);color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}'+
'.sk-vars{display:grid;gap:8px;margin-top:8px}'+
'.sk-var{display:grid;grid-template-columns:minmax(0,230px) minmax(0,1fr);gap:4px 14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:13.5px}'+
'.sk-var code{font:600 13px var(--f-mono);overflow-wrap:anywhere}'+
'.sk-fields{margin:8px 0 0;padding-left:18px;color:var(--ink-2);font-size:13.5px;display:grid;gap:3px}'+
'.sk-fields code{font:12.5px var(--f-mono);color:var(--ink)}'+
'.sk-list{list-style:none;margin:0;padding:0}'+
'.sk-list>li{padding:12px 18px;border-bottom:1px solid var(--line);display:grid;gap:6px}'+
'.sk-list>li:last-child{border-bottom:0}'+
'.sk-list>li.done{opacity:.55}'+
'.sk-list .h{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px}'+
'.sk-list .h .link{margin-left:auto}'+
'.sk-list p{margin:0;font-size:14.5px;white-space:pre-wrap;overflow-wrap:anywhere}'+
'.sk-list details summary{cursor:pointer;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:14px;list-style:none}'+
'.sk-list details summary::-webkit-details-marker{display:none}'+
'.sk-list details b{overflow-wrap:anywhere}'+
'.sk-names{list-style:none;margin:0;padding:0}'+
'.sk-names li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:9px 18px;border-bottom:1px solid var(--line);font-size:14px}'+
'.sk-names li:last-child{border-bottom:0}'+
'.sk-mini{display:flex;gap:18px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}'+
'.sk-mini b{font:700 18px var(--f-mono);color:var(--ink);margin-right:4px}'+
'.sk-foot{padding:10px 18px;font-size:13px}'+
'.sk-act{display:flex;gap:8px;align-items:center;flex-wrap:wrap}'+
'.sk-act .btn{padding:4px 10px;font-size:12.5px}'+
'.sk-names li.sk-n4{grid-template-columns:minmax(0,1fr) auto auto auto}'+
'.sk-form{padding:14px 18px;display:grid;gap:12px}'+
'.sk-form .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}'+
'.sk-form .chk{display:flex;gap:8px;align-items:center;font-size:14px}'+
'.sk-tbl{width:100%;border-collapse:collapse;font-size:13.5px}'+
'.sk-tbl td,.sk-tbl th{padding:7px 18px;border-bottom:1px solid var(--line);text-align:left}'+
'.sk-tbl td.r,.sk-tbl th.r{text-align:right;font-family:var(--f-mono)}'+
'@media (max-width:900px){.sk-form .row2{grid-template-columns:1fr}.sk-tbl td,.sk-tbl th{padding:7px 12px}}'+
'@media (max-width:900px){.sk-cols{gap:3px;height:160px}.sk-lab{gap:3px;font-size:10.5px}.sk-n{font-size:9.5px}.sk-var{grid-template-columns:minmax(0,1fr)}.sk-recent li{grid-template-columns:46px minmax(0,1fr) auto;padding:10px 14px}}'
);

var MON=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
function c2e(v){ return (+v||0)/100; }
function money(v,cls){ return '<span class="money num'+(cls?" "+cls:"")+'">'+eur(v)+'</span>'; }
function num(n){ return (+n||0).toLocaleString("de-AT"); }
function pct(v,d){ return (v*100).toLocaleString("de-AT",{maximumFractionDigits:d==null?1:d})+" %"; }
function plat(p){ var s=String(p||""); if(/ios|apple|app ?store|iphone|ipad/i.test(s)) return "iOS"; if(/android|google|play/i.test(s)) return "Android"; return s||"unbekannt"; }
function sec(title,right,body){ return '<section class="panel"><div class="panel-h"><h2>'+title+'</h2>'+(right||"")+'</div>'+body+'</section>'; }
function kpi(k,v,s,o){ return F.platKpi?F.platKpi(k,v,s,o):'<div class="panel kpi"><span class="k">'+k+'</span><span class="v num">'+v+'</span><span class="s">'+(s||"")+'</span></div>'; }

var EXAMPLE='{\n  "fetchedAt": "2026-10-01T08:00:00Z",\n  "purchases": [\n    {\n      "id": "txn_1000000123",\n      "date": "2026-09-28T14:12:00Z",\n      "productId": "ski.pass.saison",\n      "productName": "Saison-Pass",\n      "priceCents": 999,\n      "proceedsCents": 849,\n      "platform": "ios",\n      "country": "AT",\n      "refunded": false\n    }\n  ],\n  "users": { "total": 5400, "buyers": 312 }\n}';

/* ---------- Leerzustand: was das App-Backend liefern muss ---------- */
function setupHelp(open){
  var yr=F.D?F.D.year:new Date().getFullYear();
  return '<ol class="sk-steps">'+
    '<li><div><h3>Statistik-Endpunkt im Skikaiser-Backend</h3><p>Das App-Backend stellt eine Adresse bereit, die alle Käufe eines Jahres als JSON zurückgibt. Das Cockpit ruft sie so auf:</p>'+
      '<pre class="sk-code">GET https://api.skikaiser.app/stats?token=GEHEIMES_TOKEN&amp;year='+esc(yr)+'</pre>'+
      '<p style="margin-top:8px">Das Backend prüft das Token und antwortet nur bei Übereinstimmung (sonst <code>{"error":"unauthorized"}</code>). Die Adresse ist nur ein Beispiel.</p></div></li>'+
    '<li><div><h3>Antwort: Liste der Käufe</h3><p>Ein Eintrag je Einmalkauf aus App Store und Google Play (keine Abos):</p>'+
      '<pre class="sk-code" id="skExample">'+esc(EXAMPLE)+'</pre>'+
      '<div class="row wrap" style="margin-top:8px"><button type="button" class="btn" data-act="skcopy">Beispiel kopieren</button></div>'+
      '<ul class="sk-fields">'+
        '<li><code>date</code> Kaufzeitpunkt (ISO), <code>priceCents</code> Preis brutto in Cent (EUR)</li>'+
        '<li><code>proceedsCents</code> dein Erlös nach Store-Gebühr. Fehlt er, rechnet das Cockpit mit 15 % Gebühr.</li>'+
        '<li><code>productId</code>, <code>productName</code> für die Top-Produkte, <code>platform</code> „ios“ oder „android“, <code>country</code> optional</li>'+
        '<li><code>refunded: true</code> zählt als Erstattung und nicht zum Umsatz</li>'+
        '<li><code>users</code> optional (z. B. <code>{"total":5400,"buyers":312}</code>), dann zeigt das Cockpit die Kaufquote</li>'+
      '</ul>'+
      '<p style="margin-top:8px" class="muted">Alternativ gehen fertige Summen: <code>totals</code>, <code>byMonth[]</code>, <code>byProduct[]</code>, <code>byPlatform[]</code>.</p></div></li>'+
    '<li><div><h3>Variablen in Railway setzen</h3><p>Im Railway-Service der FS-Creative-Website unter <b>Variables</b> eintragen. Railway startet den Dienst danach neu.</p>'+
      '<div class="sk-vars">'+
        '<div class="sk-var"><code>SKIKAISER_STATS_URL</code><span>Adresse des Endpunkts ohne Token, z. B. <code>https://api.skikaiser.app/stats</code></span></div>'+
        '<div class="sk-var"><code>SKIKAISER_STATS_TOKEN</code><span>Dasselbe geheime Token wie im Skikaiser-Backend. Wird als <code>?token=</code> angehängt.</span></div>'+
      '</div></div></li>'+
  '</ol>';
}
F.action("skcopy",function(){
  var done=function(){ F.toast("Beispiel kopiert"); };
  try{ navigator.clipboard.writeText(EXAMPLE).then(done,function(){ F.toast("Kopieren nicht möglich. Bitte markieren und kopieren.",true); }); }catch(e){ F.toast("Kopieren nicht möglich. Bitte markieren und kopieren.",true); }
});
F.action("skall",function(){ F.UI.skAll=!F.UI.skAll; F.render(); });
F.action("skhelp",function(){ F.UI.skHelp=!F.UI.skHelp; F.render(); });

function emptyState(){
  return '<section class="panel sk-empty"><div><span class="tag glow">Noch nicht verbunden</span></div>'+
    '<div style="display:grid;gap:8px"><h2>Skikaiser verbinden</h2><p>Sobald das Backend der App seine Käufe meldet, siehst du hier Umsatz und Erlös nach Store-Gebühr, Käufe je Monat, Top-Produkte, die Aufteilung iOS/Android und die letzten Käufe. Der Erlös fließt auch in die Einkommens-Prognose ein.</p>'+
    '<p>Dafür braucht es zwei Dinge: einen Statistik-Endpunkt im App-Backend und zwei Variablen in Railway.</p></div>'+
    setupHelp()+'</section>';
}

/* ---------- Übersicht ---------- */
function monthChart(byMonth,year){
  var map={}; (byMonth||[]).forEach(function(m){ map[m.month]=m; });
  var rows=MON.map(function(_,i){ var k=year+"-"+String(i+1).padStart(2,"0"); return map[k]||{month:k,grossCents:0,proceedsCents:0,count:0}; });
  var mx=Math.max.apply(null,rows.map(function(r){return +r.grossCents||0;}).concat([1]));
  var cur=String(year)===F.D.today.slice(0,4)?+F.D.today.slice(5,7)-1:-1;
  return '<div class="sk-chart"><div class="sk-leg"><span style="--c:var(--glow-soft)">Umsatz brutto</span><span style="--c:var(--glow)">Erlös nach Store-Gebühr</span><em class="muted" style="font-style:normal">Zahl über dem Balken = Käufe</em></div>'+
    '<div class="sk-cols" role="img" aria-label="Käufe je Monat">'+rows.map(function(r,i){ var g=(+r.grossCents||0)/mx*100, p=(+r.grossCents?(+r.proceedsCents||0)/(+r.grossCents)*100:0);
      return '<div class="sk-col'+(i===cur?" cur":"")+'" title="'+esc(MON[i]+": "+num(r.count)+" Käufe · "+eur(c2e(r.grossCents))+" brutto · "+eur(c2e(r.proceedsCents))+" Erlös")+'"><span class="sk-n">'+(r.count?num(r.count):"")+'</span>'+
        (g>0?'<div class="sk-g money" style="height:'+g.toFixed(2)+'%"><i style="height:'+p.toFixed(2)+'%"></i></div>':'')+'</div>'; }).join("")+'</div>'+
    '<div class="sk-lab">'+MON.map(function(m){return '<span>'+m+'</span>';}).join("")+'</div></div>';
}
function overview(s){
  var t=s.totals||{}, gross=c2e(t.grossCents), proc=c2e(t.proceedsCents), cnt=+t.count||0, refunds=+t.refunds||0;
  var fee=gross>0?1-proc/gross:0, avg=cnt?gross/cnt:0, avgP=cnt?proc/cnt:0;
  var u=s.users, uo=typeof u==="number"?{total:u}:(u&&typeof u==="object"?u:null);
  var uTot=uo?+(uo.total||uo.installs||uo.count||uo.users||0):0, buyers=uo?+(uo.buyers||uo.payingUsers||uo.payers||0):0;
  var conv=uTot>0?(buyers||cnt)/uTot:null;
  var inc=((F.D.income&&F.D.income.lines)||[]).find(function(l){return l.key==="skikaiser";});
  var prods=(s.byProduct||[]).slice().sort(function(a,b){return (+b.grossCents||0)-(+a.grossCents||0);});
  var pTot=prods.reduce(function(a,p){return a+(+p.grossCents||0);},0)||1;
  var plats={}; (s.byPlatform||[]).forEach(function(p){ var k=plat(p.platform); plats[k]=plats[k]||{label:k,grossCents:0,count:0}; plats[k].grossCents+=+p.grossCents||0; plats[k].count+=+p.count||0; });
  var pl=Object.keys(plats).map(function(k){return plats[k];}).sort(function(a,b){return b.grossCents-a.grossCents;});
  var tone={iOS:"info",Android:"ok"};
  var recentAll=(s.recent||[]).slice(0,15), recent=F.UI.skAll?recentAll:recentAll.slice(0,6);
  return '<div class="kpis">'+
      kpi("Umsatz brutto",'<span class="money">'+eur(gross)+'</span>',num(cnt)+" Käufe "+esc(F.D.year))+
      kpi("Erlös nach Store-Gebühr",'<span class="money">'+eur(proc)+'</span>',gross>0?"Store-Gebühr "+pct(fee)+' · <span class="money">'+eur(gross-proc)+'</span>':"Apple / Google behalten ihren Anteil",{vcls:"ok-t"})+
      kpi("Ø Kaufwert",'<span class="money">'+eur(avg)+'</span>',cnt?'Erlös Ø <span class="money">'+eur(avgP)+'</span>':"noch keine Käufe")+
      (conv!=null?kpi("Kaufquote",pct(conv),(buyers?num(buyers)+" Käufer":num(cnt)+" Käufe")+" bei "+num(uTot)+" Nutzern"+(refunds?" · "+num(refunds)+" erstattet":"")):
        kpi("Erstattungen",num(refunds),inc?'Prognose <span class="money">'+eur0(inc.monthly)+'</span> / Monat':"zurückgegebene Käufe",{vcls:refunds?"warn-t":""}))+
    '</div>'+
    sec("Käufe je Monat",'<span class="muted">'+esc(F.D.year)+(inc&&conv!=null?' · Prognose <span class="money">'+eur0(inc.monthly)+'</span> / Monat':'')+'</span>',monthChart(s.byMonth,F.D.year))+
    '<div class="two">'+
      sec("Top-Produkte",'<span class="muted">nach Umsatz</span>',prods.length?'<table class="pl-tbl"><thead><tr><th>Produkt</th><th class="r">Käufe</th><th class="r">Brutto</th><th class="r">Erlös</th></tr></thead><tbody>'+
        prods.slice(0,10).map(function(p){ var sh=(+p.grossCents||0)/pTot; return '<tr><td><b>'+esc(p.name||p.productId)+'</b>'+(p.name&&p.productId&&p.name!==p.productId?'<div class="sub">'+esc(p.productId)+'</div>':'')+'<div class="sk-share" title="'+esc(pct(sh,0))+' vom Umsatz"><i style="width:'+(sh*100).toFixed(1)+'%"></i></div></td><td class="r num" data-l="Käufe">'+num(p.count)+'</td><td class="r" data-l="Brutto">'+money(c2e(p.grossCents))+'</td><td class="r" data-l="Erlös">'+money(c2e(p.proceedsCents),"ok-t")+'</td></tr>'; }).join("")+
        '</tbody></table>':'<div class="empty">Noch keine Käufe.</div>')+
      sec("iOS und Android",'<span class="muted">nach Umsatz</span>',pl.length&&F.platDonut?F.platDonut(pl.map(function(p){ return [p.label,c2e(p.grossCents),tone[p.label]||"glow",num(p.count)+' Käufe · <span class="money">'+eur(c2e(p.grossCents))+'</span>']; }),pl.length>1&&gross>0?pct((pl[0].grossCents/100)/gross,0)+" "+pl[0].label:pl[0].label):'<div class="empty">Keine Plattform-Angaben.</div>')+
    '</div>'+
    sec("Letzte Käufe",'<span class="muted">'+(s.fetchedAt?"Stand "+esc(new Date(s.fetchedAt).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})):"")+'</span>',recent.length?'<ul class="sk-recent">'+recent.map(function(r){
      var d=String(r.date||""); return '<li><span class="num muted">'+esc(deShort(d.slice(0,10)))+'</span><span style="min-width:0"><span class="nm" style="display:block">'+esc(r.name||"Kauf")+'</span><span class="muted">'+esc(plat(r.platform))+(r.country?" · "+esc(r.country):"")+(d.length>10&&Date.parse(d)?" · "+esc(new Date(d).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"})):"")+'</span></span>'+money(c2e(r.priceCents))+'</li>'; }).join("")+'</ul>'+(recentAll.length>6?'<div class="panel-b" style="padding-top:8px"><button type="button" class="link" data-act="skall">'+(F.UI.skAll?"Weniger anzeigen":"Alle "+recentAll.length+" anzeigen")+'</button></div>':''):'<div class="empty">Noch keine Käufe in '+esc(F.D.year)+'.</div>')+
    '<p class="pl-note">Einmalkäufe ohne Abos. Brutto = Preis inkl. USt., Erlös = Auszahlung von Apple bzw. Google. Erstattete Käufe zählen nicht zum Umsatz. <button type="button" class="link" data-act="skhelp">'+(F.UI.skHelp?"Einrichtung ausblenden":"Wie ist die Verbindung eingerichtet?")+'</button></p>'+
    (F.UI.skHelp?'<section class="panel sk-empty">'+setupHelp()+'</section>':'');
}

/* ---------- 12.10.: Nutzung, Feedback, Abstürze, Namen, Läufe (Skikaiser-Backend /v1/stats) ---------- */
function ago(iso){ var t=Date.parse(iso||""); if(!t) return ""; var m=Math.round((Date.now()-t)/60000); if(m<60) return "vor "+Math.max(1,m)+" Min."; var h=Math.round(m/60); if(h<36) return "vor "+h+" Std."; return deShort(String(iso).slice(0,10)); }
function nutzung(s){
  var u=s.users; if(!u||!u.byPlatform) return "";
  var ios=0, and=0; u.byPlatform.forEach(function(p){ if(p.platform==="ios") ios=+p.installs||0; else if(p.platform==="android") and=+p.installs||0; });
  var a=u.aktiv||{}, n=u.neu||{}, tot=+u.total||0;
  var html='<div class="kpis">'+
    kpi("Downloads",num(tot),"iOS "+num(ios)+" · Android "+num(and))+
    kpi("Neue Spieler",num(n.woche),"7 Tage · heute "+num(n.heute)+" · 30 Tage "+num(n.monat))+
    kpi("Aktive Spieler",num(a.woche),"7 Tage · heute "+num(a.heute)+" · 30 Tage "+num(a.monat))+
    kpi("Spielstarts",num(u.starts),tot?"Ø "+(Math.round((+u.starts||0)/tot*10)/10).toLocaleString("de-AT")+" je Gerät":"noch keine")+
  '</div>';
  var map={}; (u.installsByMonth||[]).forEach(function(m){ map[m.month]=m; });
  var cur=String(F.D.year)===F.D.today.slice(0,4)?+F.D.today.slice(5,7):12;
  var rows=MON.slice(0,cur).map(function(m,i){ var k=F.D.year+"-"+String(i+1).padStart(2,"0"), x=map[k]||{}; var a1=+x.ios||0, a2=+x.android||0; return {label:m,parts:[[a1,"info","iOS "+num(a1)],[a2,"ok","Android "+num(a2)]],right:num(a1+a2)}; });
  var bars=F.platHbars?F.platHbars(rows,[["iOS","info"],["Android","ok"]]):"";
  var dn=F.platDonut&&tot?F.platDonut([["iOS",ios,"info",num(ios)],["Android",and,"ok",num(and)]],pct(ios/Math.max(1,ios+and),0)+" iOS"):'<div class="empty">Noch keine Downloads.</div>';
  var ver=(u.versionen||[]).map(function(v){ return '<li><span class="nm">'+esc(v.version||"?")+'</span><span class="muted">'+esc(plat(v.plattform))+'</span><span class="num">'+num(v.anzahl)+'</span></li>'; }).join("");
  return html+'<div class="two">'+sec("Downloads je Monat",'<span class="muted">'+esc(F.D.year)+' · erster Start je Gerät</span>','<div class="panel-b">'+bars+'</div>')+
    sec("Downloads je System",'<span class="muted">alle Geräte</span>','<div class="panel-b">'+dn+'</div>'+(ver?'<div class="sk-foot muted">Versionen aktiver Geräte (30 Tage)</div><ul class="sk-names">'+ver+'</ul>':''))+'</div>';
}
var ART={lob:["Lob","ok"],fehler:["Fehler","bad"],idee:["Idee","info"],sonstiges:["Sonstiges","grey"]};
function feedbackPanel(s){
  var f=s.feedback; if(!f) return "";
  var li=f.liste||[], offen=li.filter(function(x){return !x.erledigt;}), zeig=F.UI.skFbAll?li:offen.slice(0,12);
  var body=zeig.length?'<ul class="sk-list">'+zeig.map(function(x){ var a=ART[x.art]||ART.sonstiges;
      return '<li'+(x.erledigt?' class="done"':'')+'><div class="h"><span class="tag '+a[1]+'">'+a[0]+'</span><span class="muted">'+esc(ago(x.date))+' · '+esc(plat(x.platform))+(x.modell?' · '+esc(x.modell):'')+(x.version?' · v'+esc(x.version):'')+(x.sprache?' · '+esc(String(x.sprache).toUpperCase()):'')+'</span>'+
        (x.erledigt?'<span class="tag grey">erledigt</span>':'<button type="button" class="link" data-act="skfb:'+esc(x.id)+'">Erledigt</button>')+'</div><p>'+esc(x.text)+'</p></li>'; }).join("")+'</ul>'
    :'<div class="empty">'+(li.length?"Alles erledigt.":"Noch kein Feedback.")+'</div>';
  var foot=li.length>offen.length||offen.length>12?'<div class="sk-foot"><button type="button" class="link" data-act="skfball">'+(F.UI.skFbAll?"Nur offene zeigen":"Alle "+li.length+" zeigen (auch erledigte)")+'</button></div>':'';
  return sec("Feedback aus dem Spiel",'<span class="muted">'+num(f.offen)+' offen · '+num(f.gesamt)+' gesamt</span>',body+foot);
}
function fehlerPanel(s){
  var alle=s.fehler; if(!alle) return "";
  var l=F.UI.skErrFix?alle:alle.filter(function(x){ return !x.behoben; });
  var zeig=F.UI.skErrAll?l:l.slice(0,8);
  var body=zeig.length?'<ul class="sk-list">'+zeig.map(function(x){ var ab=x.art==="abbruch";
      return '<li><details><summary><span class="tag '+(ab?"warn":"bad")+'">'+(ab?"Abbruch":"Fehler")+'</span><b>'+esc(x.meldung)+'</b><span class="muted">'+num(x.anzahl)+'× · '+num(x.spieler)+' Spieler · '+esc(ago(x.zuletzt))+(x.versionen?' · v'+esc(x.versionen):'')+'</span></summary>'+
        '<div class="muted" style="margin-top:6px">'+esc([plat(x.platform),x.modell,x.os,x.szene?("Szene "+x.szene):""].filter(Boolean).join(" · "))+' · zuerst '+esc(ago(x.erstmals))+'</div>'+(x.stack?'<pre class="sk-code">'+esc(x.stack)+'</pre>':'')+
        '<div class="sk-act" style="margin-top:8px">'+(x.behoben?'<span class="tag ok">behoben'+(x.behobenVersion?' in v'+esc(x.behobenVersion):'')+'</span><button type="button" class="btn" data-act="skerr:'+esc(x.hash)+'|0">Wieder öffnen</button>':'<button type="button" class="btn" data-act="skerr:'+esc(x.hash)+'|1">Behoben</button><span class="muted">kommt er in einer neueren Version wieder, ist er wieder offen</span>')+'</div></details></li>'; }).join("")+'</ul>'
    :'<div class="empty">'+(alle.length?"Alle Fehler sind behoben.":"Keine Abstürze oder Fehler gemeldet.")+'</div>';
  var nFix=alle.length-alle.filter(function(x){ return !x.behoben; }).length;
  var foot='<div class="sk-foot">'+(l.length>8?'<button type="button" class="link" data-act="skerrall">'+(F.UI.skErrAll?"Weniger anzeigen":"Alle "+l.length+" anzeigen")+'</button> · ':'')+(nFix?'<button type="button" class="link" data-act="skerrfix">'+(F.UI.skErrFix?"Behobene ausblenden":nFix+" behobene zeigen")+'</button>':'')+'</div>';
  return sec("Abstürze und Fehler",'<span class="muted">'+num(alle.length-nFix)+' offen · Abbruch = App unerwartet beendet</span>',body+foot);
}
function namenPanel(s){
  var n=s.namen; if(!n) return "";
  var tone={neu:"info","geprüft":"ok",gesperrt:"bad",Verdacht:"warn"};
  var mini='<div class="sk-mini"><span><b>'+num(n.gesamt)+'</b>vergeben</span><span><b>'+num(n.ungeprueft)+'</b>ungeprüft</span><span><b>'+num(n.verdacht)+'</b>Verdacht</span><span><b>'+num(n.gesperrt)+'</b>gesperrt</span></div>';
  function knoepfe(r){
    if(!r.id) return '';
    if(r.status==="gesperrt") return '<span class="sk-act"><button type="button" class="btn" data-act="sknam:'+esc(r.id)+'|entsperren">Entsperren</button></span>';
    return '<span class="sk-act">'+(r.status!=="geprüft"?'<button type="button" class="btn" data-act="sknam:'+esc(r.id)+'|ok">OK</button>':'')+'<button type="button" class="btn" data-act="sknam:'+esc(r.id)+'|sperren">Sperren</button></span>';
  }
  function zeile(r){ return '<li class="sk-n4"><span class="nm"><b>'+esc(r.name)+'</b>'+(r.verdacht?' <span class="muted">('+esc(r.verdacht)+')</span>':'')+'</span><span class="muted">'+esc(r.land||"")+' · '+esc(ago(r.datum))+'</span><span class="tag '+(tone[r.status]||"grey")+'">'+esc(r.status)+'</span>'+knoepfe(r)+'</li>'; }
  var offen=n.offen||[];
  var pruef=offen.length?'<div class="sk-foot"><b>Zu prüfen ('+num(offen.length)+')</b></div><ul class="sk-names">'+offen.slice(0,30).map(zeile).join("")+'</ul>':'<div class="sk-foot muted">Keine Namen zu prüfen.</div>';
  var l=(n.neueste||[]).slice(0,F.UI.skNamAll?40:10);
  var list=pruef+'<div class="sk-foot"><b>Zuletzt gewählt</b></div>'+(l.length?'<ul class="sk-names">'+l.map(zeile).join("")+'</ul>':'<div class="empty">Noch keine Namen gewählt.</div>');
  var foot='<div class="sk-foot">'+((n.neueste||[]).length>10?'<button type="button" class="link" data-act="sknamall">'+(F.UI.skNamAll?"Weniger anzeigen":"Mehr anzeigen")+'</button> · ':'')+(n.pruefseite?'<a href="'+esc(n.pruefseite)+'" target="_blank" rel="noopener">Prüfseite öffnen</a> <span class="muted">(mit deinem Admin-Token, ?t=…)</span>':'')+'</div>';
  return sec("Ranglisten-Namen",'<span class="muted">neueste zuerst</span>',mini+list+foot);
}
function laeufePanel(s){
  var l=s.laeufe; if(!l||!l.byStrecke) return "";
  var rows=l.byStrecke.slice(0,12).map(function(r){ return {label:r.name||r.strecke,parts:[[+r.ziel||0,"ok","Ziel "+num(r.ziel)],[+r.dsq||0,"warn","Disqualifiziert "+num(r.dsq)],[+r.dnf||0,"bad","Sturz "+num(r.dnf)]],right:num(r.anzahl)}; });
  var st=(l.byStufe||[]).map(function(x){ return esc(x.stufe)+" "+num(x.anzahl); }).join(" · ");
  var body=rows.length&&F.platHbars?'<div class="panel-b">'+F.platHbars(rows,[["Ziel","ok"],["DSQ","warn"],["Sturz","bad"]])+'</div>'+(st?'<div class="sk-foot muted">Schwierigkeit: '+st+'</div>':''):'<div class="empty">Noch keine Läufe in '+esc(F.D.year)+'.</div>';
  return sec("Gespielte Strecken",'<span class="muted">'+num(l.gesamt)+' Läufe '+esc(F.D.year)+'</span>',body);
}
function zeitFmt(ms){ var t=(+ms||0)/1000, m=Math.floor(t/60), r=t-m*60; return (m?m+":"+(r<10?"0":""):"")+r.toFixed(2).replace(".",","); }
function steuerungPanel(s){
  var c=s.config; if(!c) return "";
  var a=c.ankuendigung||{};
  var f='<div class="sk-form">'+
    '<label class="chk"><input type="checkbox" id="skAnkAn"'+(a.aktiv?" checked":"")+'> Ankündigung im Hauptmenü der App zeigen</label>'+
    '<div class="row2"><label class="fl">Text Deutsch<input class="f" type="text" id="skAnkDe" maxlength="280" value="'+esc(a.de||"")+'" placeholder="z. B. Neu: Saalbach und St. Anton!"></label>'+
    '<label class="fl">Text Englisch<input class="f" type="text" id="skAnkEn" maxlength="280" value="'+esc(a.en||"")+'" placeholder="optional, sonst Deutsch"></label></div>'+
    '<div class="row2"><label class="fl">Mindestversion (ältere Apps müssen aktualisieren)<input class="f" type="text" id="skMinV" maxlength="20" value="'+esc(c.mindestVersion||"")+'" placeholder="leer = aus, z. B. 1.0.1"></label>'+
    '<label class="fl">App-Store-Link (Knopf „Aktualisieren“)<input class="f" type="url" id="skStore" maxlength="200" value="'+esc(c.storeUrl||"")+'" placeholder="https://apps.apple.com/app/id…"></label></div>'+
    '<label class="chk"><input type="checkbox" id="skRlAn"'+(c.ranglisteAktiv!==false?" checked":"")+'> Online-Rangliste aktiv (aus: App zeigt „pausiert“, Zeiten werden später gemeldet)</label>'+
    '<div class="sk-act"><button type="button" class="btn" data-act="skcfg">Speichern</button><span class="muted">wirkt beim nächsten App-Start bzw. nach spätestens einer Minute</span></div>'+
  '</div>';
  return sec("App-Steuerung",'<span class="muted">Ankündigung · Mindestversion · Rangliste</span>',f);
}
function ranglistePanel(s){
  var r=s.rangliste; if(!r) return "";
  var beste=r.beste||[], neu=(r.neueste||[]).slice(0,F.UI.skZtAll?40:10);
  function loesch(z){ return '<button type="button" class="btn" data-act="skzeit:'+esc(z.spieler)+'|'+esc(z.strecke)+'|'+esc(z.stufeNr)+'" title="Diese Zeit löschen">Löschen</button>'; }
  var tb=beste.length?'<table class="sk-tbl"><thead><tr><th>Strecke · Stufe</th><th>Platz</th><th>Name</th><th class="r">Zeit</th><th></th></tr></thead><tbody>'+beste.map(function(z){ return '<tr><td>'+(z.platz===1?'<b>'+esc(z.streckenName)+'</b> · '+esc(z.stufe):'')+'</td><td>'+esc(z.platz)+'.</td><td>'+esc(z.name)+'</td><td class="r">'+zeitFmt(z.zeitMs)+'</td><td>'+loesch(z)+'</td></tr>'; }).join("")+'</tbody></table>':'<div class="empty">Noch keine Zeiten.</div>';
  var nl=neu.length?'<table class="sk-tbl"><tbody>'+neu.map(function(z){ return '<tr><td>'+esc(ago(z.datum))+'</td><td>'+esc(z.name)+'</td><td>'+esc(z.streckenName)+' · '+esc(z.stufe)+'</td><td class="r">'+zeitFmt(z.zeitMs)+'</td><td>'+loesch(z)+'</td></tr>'; }).join("")+'</tbody></table>':'';
  var foot='<div class="sk-foot sk-act">'+((r.neueste||[]).length>10?'<button type="button" class="link" data-act="skztall">'+(F.UI.skZtAll?"Weniger anzeigen":"Mehr neue Zeiten")+'</button>':'')+
    '<button type="button" class="btn" data-act="skauf">Testdaten aufräumen</button><button type="button" class="btn" data-act="skreset">Alle Zeiten löschen (vor dem Start)</button></div>';
  return sec("Online-Rangliste",'<span class="muted">'+num(r.zeiten)+' Zeiten · '+num(r.spieler)+' Spieler</span>','<div class="sk-mini"><span>Schnellste je Strecke und Stufe – auffällige Zeiten hier löschen</span></div>'+tb+(nl?'<div class="sk-foot"><b>Neueste Zeiten</b></div>'+nl:'')+foot);
}
function steuer(was,daten,ok,el){
  if(el) el.disabled=true;
  return F.api("/admin/api/skikaiser/steuer",{body:{was:was,daten:daten||{}}}).then(function(j){
    if(j&&j.ok){ F.toast(ok||"Gespeichert"); F.load(true); }
    else { if(el) el.disabled=false; F.toast("Fehler: "+((j&&j.error)||"keine Antwort"),true); }
    return j;
  }).catch(function(){ if(el) el.disabled=false; F.toast("Keine Verbindung zum Skikaiser-Server",true); });
}
F.action("sknam",function(arg,el){ var p=String(arg).split("|"); steuer("namen",{id:p[0],aktion:p[1]},{ok:"Name freigegeben",sperren:"Name gesperrt – Spieler muss einen neuen wählen",entsperren:"Name entsperrt"}[p[1]],el); });
F.action("skerr",function(arg,el){ var p=String(arg).split("|"); steuer("fehler",{hash:p[0],behoben:p[1]==="1"},p[1]==="1"?"Als behoben markiert":"Wieder offen",el); });
F.action("skzeit",function(arg,el){ var p=String(arg).split("|"); if(!window.confirm("Diese Zeit aus der Online-Rangliste löschen?")) return; steuer("zeit",{spieler:p[0],strecke:p[1],stufe:+p[2]},"Zeit gelöscht",el); });
F.action("skauf",function(arg,el){ steuer("aufraeumen",{},"Testdaten gelöscht",el); });
F.action("skreset",function(arg,el){ if(!window.confirm("Wirklich ALLE Zeiten der Online-Rangliste löschen? Das lässt sich nicht rückgängig machen.")||!window.confirm("Sicher? Alle Bestzeiten aller Spieler verschwinden aus der Rangliste.")) return; steuer("zeiten-zuruecksetzen",{bestaetigung:"ALLE ZEITEN LOESCHEN"},"Alle Zeiten gelöscht",el); });
F.action("skcfg",function(arg,el){
  function v(id){ var e=document.getElementById(id); return e?e.value.trim():""; } function c(id){ var e=document.getElementById(id); return !!(e&&e.checked); }
  var mv=v("skMinV"); if(mv&&!/^[0-9.]+$/.test(mv)){ F.toast("Mindestversion nur mit Ziffern und Punkten, z. B. 1.0.1",true); return; }
  steuer("config",{ankuendigung:{aktiv:c("skAnkAn"),de:v("skAnkDe"),en:v("skAnkEn")},mindestVersion:mv,storeUrl:v("skStore"),ranglisteAktiv:c("skRlAn")},"App-Steuerung gespeichert",el);
});
F.action("skerrfix",function(){ F.UI.skErrFix=!F.UI.skErrFix; F.render(); });
F.action("skztall",function(){ F.UI.skZtAll=!F.UI.skZtAll; F.render(); });
F.action("skfb",function(id,el){
  if(el) el.disabled=true;
  F.api("/admin/api/skikaiser/feedback",{body:{id:+id,erledigt:true}}).then(function(j){
    if(j&&j.ok){ var f=F.D.skikaiser&&F.D.skikaiser.feedback; if(f){ (f.liste||[]).forEach(function(x){ if(+x.id===+id) x.erledigt=true; }); f.offen=Math.max(0,(+f.offen||1)-1); } F.toast("Als erledigt markiert"); F.render(); }
    else { if(el) el.disabled=false; F.toast("Konnte nicht gespeichert werden",true); }
  }).catch(function(){ if(el) el.disabled=false; F.toast("Konnte nicht gespeichert werden",true); });
});
F.action("skfball",function(){ F.UI.skFbAll=!F.UI.skFbAll; F.render(); });
F.action("skerrall",function(){ F.UI.skErrAll=!F.UI.skErrAll; F.render(); });
F.action("sknamall",function(){ F.UI.skNamAll=!F.UI.skNamAll; F.render(); });

F.skikaiserView=function(){
  var s=F.D.skikaiser;
  if(!s||!s.configured) return emptyState();
  if(s.error||!s.totals){
    var why={timeout:"Die Statistik hat nicht rechtzeitig geantwortet.",keine_antwort:"Die Statistik-Adresse antwortet nicht oder liefert kein JSON.",unauthorized:"Das Token wird abgelehnt. Prüfe SKIKAISER_STATS_TOKEN."}[s.error]||("Fehler: "+s.error);
    return '<div class="notice"><span><b>Skikaiser ist eingerichtet, liefert aber gerade keine Daten.</b> '+esc(why)+'</span><button class="btn" data-act="reload">Neu laden</button></div>'+
      '<section class="panel sk-empty"><h2>So muss der Endpunkt antworten</h2>'+setupHelp()+'</section>';
  }
  return steuerungPanel(s)+nutzung(s)+overview(s)+'<div class="two">'+feedbackPanel(s)+fehlerPanel(s)+'</div>'+'<div class="two">'+namenPanel(s)+laeufePanel(s)+'</div>'+ranglistePanel(s);
};
})();
