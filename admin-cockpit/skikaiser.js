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

F.skikaiserView=function(){
  var s=F.D.skikaiser;
  if(!s||!s.configured) return emptyState();
  if(s.error||!s.totals){
    var why={timeout:"Die Statistik hat nicht rechtzeitig geantwortet.",keine_antwort:"Die Statistik-Adresse antwortet nicht oder liefert kein JSON.",unauthorized:"Das Token wird abgelehnt. Prüfe SKIKAISER_STATS_TOKEN."}[s.error]||("Fehler: "+s.error);
    return '<div class="notice"><span><b>Skikaiser ist eingerichtet, liefert aber gerade keine Daten.</b> '+esc(why)+'</span><button class="btn" data-act="reload">Neu laden</button></div>'+
      '<section class="panel sk-empty"><h2>So muss der Endpunkt antworten</h2>'+setupHelp()+'</section>';
  }
  return overview(s);
};
})();
