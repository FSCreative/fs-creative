/* Ansicht "Plattformen": Überblick, kochdu, Kantineur, Blitzdings, VALUERO, Skikaiser (eigene Datei skikaiser.js), Hüttengaudi (huettengaudi.js).
   Verrechnen läuft über die gemeinsamen Flows: Rechnung via F.openInvoice (pre.after: billing / kochduSettle),
   Rückgängig über /admin/api/kochdu-settle bzw. /admin/api/billing {op:"unbill"}. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;

var TABS=[["ueb","Überblick"],["kochdu","kochdu"],["kantineur","Kantineur"],["blitz","Blitzdings"],["valuero","VALUERO"],["ski","Skikaiser"],["hg","Hüttengaudi"]];
F.UI.plat=F.UI.plat||F.ls("fsc_plat_tab")||"ueb";
if(!TABS.some(function(t){return t[0]===F.UI.plat;})) F.UI.plat="ueb";
F.UI.platOpen=F.UI.platOpen||{};          // VALUERO: aufgeklappte Monatsaufstellungen
var BILL=null;                              // /admin/api/billing (Rechnungs-Historie je Schlüssel)
var BUSY={};                                // laufende Aktionen (Doppelklick-Schutz)

F.css(
'.pl-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'+
'.pl-card{padding:16px 18px;display:grid;gap:8px;align-content:start;text-align:left;font:inherit;color:inherit;cursor:pointer;min-width:0}'+
'.pl-card:hover{border-color:var(--ink-3)}'+
'.pl-card .pl-t{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:2px 8px;min-width:0}'+
'.pl-card .pl-t .muted{text-align:right;text-wrap:balance}'+
'.pl-card h3{font-size:17px;min-width:0;overflow-wrap:anywhere}'+
'.pl-fig{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;font-size:13.5px;margin:0;padding-top:8px;border-top:1px solid var(--line)}'+
'.pl-fig dt{color:var(--ink-2);min-width:0}.pl-fig dd{margin:0;text-align:right;font-family:var(--f-mono);font-variant-numeric:tabular-nums;white-space:nowrap}'+
'.pl-bars{display:grid;gap:14px;padding:16px 18px}'+
'.pl-bar .pl-bl{display:flex;justify-content:space-between;gap:10px;font-size:13.5px;margin-bottom:5px;flex-wrap:wrap}'+
'.pl-bar .pl-bl b{font-weight:600}'+
'.pl-track{display:flex;height:12px;border-radius:99px;background:var(--sunk);overflow:hidden}'+
'.pl-track i{display:block;height:100%}'+
'.pl-track .a{background:var(--ok)} .pl-track .b{background:var(--warn)} .pl-track .c{background:var(--info)} .pl-track .d{background:var(--glow)}'+
'.pl-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2)}'+
'.pl-leg span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;vertical-align:0;background:var(--c)}'+
'.pl-quote{padding:14px 18px;display:grid;gap:8px}'+
'.pl-quote .row-between{font-size:13.5px}'+
'.pl-quote .bar i{background:var(--ok)}'+
'.pl-sub .count{margin-left:6px}'+
'.pl-head-r{align-items:center}'+
'.pl-tbl td.r,.pl-tbl th.r{text-align:right}'+
'.pl-tbl .invs{align-items:flex-start}'+
'.pl-tbl tfoot td{font-weight:700;border-top:1px solid var(--line);background:var(--sunk)}'+
'.pl-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}'+
'.pl-donut{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:center;padding:16px 18px}'+
'.pl-donut svg{width:150px;height:150px;display:block}'+
'.pl-donut ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:13.5px}'+
'.pl-donut li{display:grid;grid-template-columns:12px max-content minmax(0,1fr);gap:8px;align-items:center}.pl-donut li .num{text-align:right}'+
'.pl-donut li i{width:10px;height:10px;border-radius:3px;background:var(--c)}'+
'.pl-bk{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:14px;align-items:start;padding:14px 18px;border-bottom:1px solid var(--line)}'+
'.pl-bk:last-child{border-bottom:0}'+
'.pl-date{border:1px solid var(--line);border-radius:10px;text-align:center;padding:6px 0;background:var(--sunk)}'+
'.pl-date b{display:block;font-family:var(--f-display);font-size:22px;line-height:1}'+
'.pl-date span{font-size:11.5px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em}'+
'.pl-bk .pl-meta{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--ink-2);margin-top:4px}'+
'.pl-bk .pl-right{display:grid;gap:6px;justify-items:end}'+
'.pl-bk .pl-amt{font-family:var(--f-mono);font-weight:700;font-size:15px}'+
'.pl-obj{border-bottom:1px solid var(--line)}'+
'.pl-obj:last-child{border-bottom:0}'+
'.pl-objh{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 18px}'+
'.pl-objh .pl-tog{border:0;background:none;font:inherit;color:inherit;text-align:left;padding:0;display:grid;gap:4px;min-width:0;cursor:pointer}'+
'.pl-objh .pl-tog h3{font-size:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}'+
'.pl-chev{display:inline-block;transition:transform .15s;color:var(--ink-3)}'+
'.pl-chev.on{transform:rotate(90deg)}'+'@media (prefers-reduced-motion:reduce){.pl-chev{transition:none}}'+
'.pl-refund{margin:0 18px 12px;padding:10px 12px;border-radius:10px;background:var(--bad-soft);color:var(--bad);font-size:13.5px}'+
'.pl-block{margin:0 18px 12px;padding:10px 12px;border-radius:10px;background:var(--warn-soft);color:var(--ink);font-size:13.5px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}'+
'.pl-notes{margin:0 18px 12px;padding:0 0 0 18px;font-size:13px;color:var(--ink-2)}.pl-notes li{margin:2px 0}'+
'.pl-months{padding:0 18px 14px}'+
'.pl-months table{border:1px solid var(--line);border-radius:10px;overflow:hidden}'+
'.pl-note{font-size:12.5px;color:var(--ink-3)}'+
'body.priv .kpi.pl-nopriv .v{filter:none}'+
/* Kennzahlen: Beschriftung ausgewogen, Zahl bricht nicht aus der Kachel, Zusatz leise */
'.view-plat .kpi{min-width:0}.view-plat .kpi .k{text-wrap:balance}.view-plat .kpi .v{line-height:1.15}.view-plat .kpi .s{font-weight:500;color:var(--ink-3);text-wrap:pretty}'+
/* Kacheln in einem Panel (z. B. App-Statistiken) sind verschachtelt: kein zweiter Panel-Grund */
'@media (min-width:901px){.view-plat .panel .kpi.panel{background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}}'+
'.pl-fig:empty{display:none}'+
/* Prüfpunkte (Plattform-Audit): je Zeile Stufe, Text, Aktionen */
'.pl-checks{display:grid}'+
'.pl-ck{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:11px 18px;border-bottom:1px solid var(--line);font-size:13.5px}'+
'.pl-ck:last-child{border-bottom:0}.pl-ck .pl-ckt{min-width:0;overflow-wrap:anywhere;text-wrap:pretty}'+
'.pl-ck.bad{background:var(--bad-soft)}'+
'@media (max-width:900px){'+
  '.pl-cards{grid-template-columns:minmax(0,1fr)}'+
  '.pl-tbl thead{display:none}'+
  '.pl-tbl tr{display:block;border-bottom:1px solid var(--line);padding:8px 0}'+
  '.pl-tbl tbody tr:last-child{border-bottom:0}'+
  '.pl-tbl td{display:flex;justify-content:space-between;gap:12px;border:0;padding:4px 16px;text-align:right}'+
  '.pl-tbl td:first-child{text-align:left}'+
  '.pl-tbl td[data-l]::before{content:attr(data-l);color:var(--ink-3);font:400 12.5px var(--f-body);letter-spacing:0;text-align:left;flex:none}'+
  '.pl-tbl td:empty{display:none}'+
  '.pl-tbl td.pl-a{justify-content:flex-end}'+
  '.pl-tbl tfoot tr{display:block}'+
  '.pl-donut{grid-template-columns:minmax(0,1fr);justify-items:center}'+
  '.pl-donut ul{width:100%}'+
  '.pl-bk{grid-template-columns:50px minmax(0,1fr)}'+
  '.pl-bk .pl-right{grid-column:1/-1;justify-items:stretch;grid-template-columns:auto 1fr;align-items:center}'+
  '.pl-bk .pl-right .pl-acts{grid-column:1/-1;justify-content:flex-start}'+
  '.pl-objh{grid-template-columns:minmax(0,1fr)}'+
  '.pl-objh .pl-acts{justify-content:flex-start}'+
  '.pl-ck{grid-template-columns:minmax(0,1fr)}.pl-ck .pl-acts{justify-content:flex-start}'+
'}'
);

/* ---------- Hilfen ---------- */
function c2e(v){ return (+v||0)/100; }
function money(v,cls){ return '<span class="money num'+(cls?" "+cls:"")+'">'+eur(v)+'</span>'; }
function P(){ return (F.D&&F.D.platforms)||{}; }
function item(key){ return ((F.D&&F.D.abgleich&&F.D.abgleich.items)||[]).find(function(x){return x.key===key;})||null; }
function items(src){ return ((F.D&&F.D.abgleich&&F.D.abgleich.items)||[]).filter(function(x){return x.src===src;}); }
function billRecs(key){ return (BILL&&BILL.invoices&&BILL.invoices[key])||[]; }
function vaYear(x){ return x&&x.invoicedYear!=null?(+x.invoicedYear||0):((x&&+x.invoiced)||0); }   /* VALUERO „Verrechnet <Jahr>“: nur Rechnungen dieses Jahres, ohne Stornos (alter Server: invoiced) */
function stamp(iso){ return iso?'Stand '+new Date(iso).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""; }
F.icons.external=F.icons.external||'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';
function ext(url,label){ return '<a class="btn" href="'+esc(url)+'" target="_blank" rel="noopener" title="'+esc(label)+' in neuem Tab öffnen">'+esc(label)+F.svg("external")+'</a>'; }
function okRes(j){ return j&&!j.error&&j.ok!==false; }
function num(n){ return (+n||0).toLocaleString("de-AT"); }
function kpi(k,v,s,opts){ opts=opts||{}; var tag=opts.act?'button':'div';
  return '<'+tag+' class="panel kpi'+(opts.cls?" "+opts.cls:"")+'"'+(opts.act?' data-act="'+opts.act+'"':'')+'><span class="k">'+k+'</span><span class="v num'+(opts.vcls?" "+opts.vcls:"")+'">'+v+'</span>'+(s?'<span class="s">'+s+'</span>':'')+'</'+tag+'>'; }
F.platKpi=kpi;
function sevTag(l){ if(!l) return ""; var m={bezahlt:"ok",offen:"warn",ueberfaellig:"bad",entwurf:"grey",fehlt:"bad",manuell:"grey",alt:"grey",neu:"info",sonst:"grey",storniert:"grey"}; return '<span class="tag '+(m[l.state]||"grey")+'">'+esc(l.label||"")+'</span>'; }
function invLine(l){
  if(!l) return '<span class="muted">noch nie</span>';
  /* Rechnung öffnet das Rechnungsdetail (Finanzen) – ohne Finanzen-Modul das PDF. <a>, weil invLine auch in Knöpfen steht (kein Knopf im Knopf) */
  var nr=l.id&&F.actions.fin?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(l.id)+'" data-act="fin:invd:'+esc(l.id)+'" title="Rechnung öffnen">'+esc(l.nr||"Entwurf")+'</a>'
    :l.id?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(l.id)+'" target="_blank" rel="noopener" data-docview data-doctitle="Rechnung '+esc(l.nr||"Entwurf")+'">'+esc(l.nr||"Entwurf")+'</a>':esc(l.nr||"ohne Rechnung");
  return '<span>'+nr+' · '+deShort(l.date)+' · '+money(l.gross)+' '+sevTag(l)+'</span>';
}
/* Waagrechte Balken (HTML, damit am Handy lesbar): rows=[{label,parts:[[wert,cls,titel]],right}] */
function hbars(rows,legend){
  var mx=Math.max.apply(null,rows.map(function(r){ return r.parts.reduce(function(a,p){return a+(+p[0]||0);},0); }).concat([0.01]));
  return '<div class="pl-bars">'+(legend?'<div class="pl-leg">'+legend.map(function(l){ return '<span style="--c:var(--'+l[1]+')">'+esc(l[0])+'</span>'; }).join("")+'</div>':'')+
    rows.map(function(r){ return '<div class="pl-bar"><div class="pl-bl"><b>'+esc(r.label)+'</b><span class="muted">'+(r.right||"")+'</span></div><div class="pl-track" role="img" aria-label="'+esc(r.label)+'">'+
      r.parts.map(function(p){ var w=Math.max(0,(+p[0]||0)/mx*100); return w>0?'<i class="'+p[1]+'" style="width:'+w.toFixed(2)+'%" title="'+esc(p[2]||"")+'"></i>':''; }).join("")+'</div></div>'; }).join("")+'</div>';
}
/* Ring-Diagramm: segs=[[label,wert,tokenName,anzeige]] */
function donut(segs,center){
  var tot=segs.reduce(function(a,s){return a+(+s[1]||0);},0), R=52, C=2*Math.PI*R, off=0, g="";
  g+='<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="var(--sunk)" stroke-width="18"/>';
  if(tot>0) segs.forEach(function(s){ var v=+s[1]||0; if(v<=0) return; var len=v/tot*C;
    g+='<circle cx="70" cy="70" r="'+R+'" fill="none" stroke="var(--'+s[2]+')" stroke-width="18" stroke-dasharray="'+len.toFixed(2)+' '+(C-len).toFixed(2)+'" stroke-dashoffset="'+(-off).toFixed(2)+'" transform="rotate(-90 70 70)"><title>'+esc(s[0])+'</title></circle>'; off+=len; });
  g+='<text x="70" y="75" text-anchor="middle" font-size="16" font-weight="700" fill="var(--ink)" font-family="ui-monospace,monospace">'+esc(center!=null?center:"")+'</text>';
  return '<div class="pl-donut"><svg viewBox="0 0 140 140" role="img" aria-label="'+esc(segs.map(function(s){return s[0];}).join(", "))+'">'+g+'</svg><ul>'+
    segs.map(function(s){ return '<li style="--c:var(--'+s[2]+')"><i></i><span>'+esc(s[0])+'</span><span class="num">'+(s[3]!=null?s[3]:esc(s[1]))+'</span></li>'; }).join("")+'</ul></div>';
}
F.platHbars=hbars; F.platDonut=donut;
function quote(label,done,total){ var p=total>0?Math.min(100,done/total*100):0; return '<div class="panel pl-quote"><div class="row-between"><span>'+esc(label)+'</span><b class="num">'+Math.round(p)+' %</b></div><div class="bar"><i style="width:'+p.toFixed(1)+'%"></i></div></div>'; }
function sec(title,right,body){ return '<section class="panel"><div class="panel-h"><h2>'+title+'</h2>'+(right||"")+'</div>'+body+'</section>'; }
/* Prüfpunkte: rows=[{lvl:"bad"|"warn"|"info",tag,text,inv (Rechnung öffnen),acts (HTML)}] – rot = Achtung, nie automatisch gebucht */
var CK_TAG={bad:"Achtung",warn:"Prüfen",info:"Hinweis"}, CK_ORD={bad:0,warn:1,info:2};
function checkRows(rows){ return rows.slice().sort(function(a,b){ return (CK_ORD[a.lvl]||2)-(CK_ORD[b.lvl]||2); }); }
function checkList(rows){
  return '<div class="pl-checks">'+checkRows(rows).map(function(r){ var l=CK_TAG[r.lvl]?r.lvl:"info";
    return '<div class="pl-ck '+l+'"><span class="tag '+l+'">'+esc(r.tag||CK_TAG[l])+'</span><span class="pl-ckt">'+esc(r.text||"")+'</span><span class="pl-acts">'+
      (r.inv&&F.actions.fin?'<button class="btn" data-act="fin:invd:'+esc(r.inv)+'">Rechnung öffnen</button>':'')+(r.acts||"")+'</span></div>'; }).join("")+'</div>';
}
function checkSec(title,rows){ if(!rows.length) return ""; var bad=rows.filter(function(r){ return r.lvl==="bad"; }).length;
  return sec(title,'<span class="tag '+(bad?"bad":"warn")+'">'+rows.length+(bad?" · "+bad+" dringend":"")+'</span>',checkList(rows)); }
function mmOf(m){ return String(m||"").split("-").reverse().join("/"); }

/* ---------- Billing-Historie (für Rückgängig & Blitzdings-Rechnungen) ---------- */
function loadBill(){ return F.api("/admin/api/billing").then(function(b){ if(b&&b.invoices){ BILL=b; } return BILL; }).catch(function(){ return BILL; }); }
F.onData(function(){ loadBill().then(function(){ if(F.current==="plat") F.render(); }); });

/* ---------- Ausstehende Änderungen ----------
   Der Server puffert Plattform-Daten bis zu 25 s. Damit eine gerade gespeicherte Änderung (verrechnet, bezahlt …)
   nach dem Neuladen nicht kurz wieder "zurückspringt", wird sie bis zu 45 s lokal über die Serverdaten gelegt. */
var PEND=[];
function pend(kind,id,val){ PEND=PEND.filter(function(x){ return !(x.kind===kind&&x.id===String(id)); }); PEND.push({kind:kind,id:String(id),val:val,exp:Date.now()+45000}); applyPend(F.D); }
function applyPend(d){
  if(!d||!d.platforms) return; var now=Date.now(); PEND=PEND.filter(function(x){ return x.exp>now; });
  PEND.forEach(function(x){
    if(x.kind==="kochdu"&&d.platforms.kochdu){ var ko=d.platforms.kochdu, r=(ko.restaurants||[]).find(function(y){return String(y.id)===x.id;}); if(!r) return; var t=ko.totals=ko.totals||{};
      if(x.val==="settle"&&+r.barOpenCents>0){ var o=+r.barOpenCents; r.barSettledCents=(+r.barSettledCents||0)+o; r.barOpenCents=0; r.lastSettledAt=new Date().toISOString(); t.barOpenCents=Math.max(0,(+t.barOpenCents||0)-o); t.barSettledCents=(+t.barSettledCents||0)+o;
        var it=(d.abgleich.items||[]).find(function(y){return y.key==="kochdu:"+x.id;}); if(it){ it.unbilled=0; it.action=null; } }
      if(x.val==="unsettle"&&+r.barSettledCents>0){ var sc=+r.barSettledCents; r.barOpenCents=(+r.barOpenCents||0)+sc; r.barSettledCents=0; t.barOpenCents=(+t.barOpenCents||0)+sc; t.barSettledCents=Math.max(0,(+t.barSettledCents||0)-sc); } }
    if(x.kind==="blitz"&&d.platforms.blitzdings){ var b=(d.platforms.blitzdings.upcoming||[]).find(function(y){return String(y.id)===x.id;}); if(b) bzApply(b,x.val,d); }
  });
}
F.onData(applyPend);

/* ---------- "Neue Buchungen seit dem letzten Besuch" (gleiche Basis wie im klassischen Dashboard) ---------- */
var SEENK="fsc_seen_counts_v1";
function curCounts(){
  var p=P(), ko=p.kochdu, bz=p.blitzdings, va=p.valuero, out={};
  if(ko){ var t=ko.totals||{}; var bo=t.barOrders, oo=t.onlineOrders;
    if(bo==null&&oo==null){ bo=0; oo=0; (ko.restaurants||[]).forEach(function(r){ bo+=+r.barOrders||0; oo+=+r.onlineOrders||0; }); }
    out.kochdu=(+bo||0)+(+oo||0); }
  if(bz){ var bk=bz.bookings||{}; out.blitz=(bk.paidCount!=null||bk.openCount!=null)?(+bk.paidCount||0)+(+bk.openCount||0):(+bk.total||0); }
  if(va){ var vb=0; (va.objects||[]).forEach(function(o){ vb+=+o.feeBookings||0; }); out.valuero=vb; }
  return out;
}
function seenFresh(){ return String(F.D&&F.D.year)===String(new Date().getFullYear()); }  // Basis nur im laufenden Jahr pflegen
function newCounts(){
  if(!F.D||!seenFresh()) return {};
  var seen=F.ls(SEENK)||{}, cur=curCounts(), ch=false, out={};
  Object.keys(cur).forEach(function(k){ if(seen[k]==null){ seen[k]=cur[k]; ch=true; } out[k]=Math.max(0,cur[k]-(+seen[k]||0)); });
  if(ch) F.ls(SEENK,seen);
  return out;
}
function clearSeen(k){
  if(!F.D||!seenFresh()) return false;
  var seen=F.ls(SEENK)||{}, cur=curCounts(); if(cur[k]==null||seen[k]===cur[k]) return false;
  seen[k]=cur[k]; F.ls(SEENK,seen); return true;
}
var TAB2SEEN={kochdu:"kochdu",blitz:"blitz",valuero:"valuero"};

/* ---------- Kennzahlen je Plattform (Überblick) ---------- */
function fscRevenue(){
  if(!BILL||!BILL.invoices) return null;
  var yr=String(F.D.year), byId={}, r={paid:0,open:0};
  ((F.D.sev&&F.D.sev.invoices)||[]).forEach(function(i){ byId[i.id]=i; });
  Object.keys(BILL.invoices).forEach(function(k){ if(k.indexOf("site:")!==0) return;
    (BILL.invoices[k]||[]).forEach(function(inv){ if(String(inv.date||"").slice(0,4)!==yr) return; var x=byId[inv.id];
      if(x&&(x.cancelled||x.type==="SR")) return;   /* storniert: weder bezahlt noch offen */
      if(x){ if(x.status===100||x.status===50){ r.open+=+inv.gross||0; return; } r.paid+=+x.paid||(x.status===1000?+x.gross||0:0); r.open+=+x.open||0; }
      else r.open+=+inv.gross||0; }); });
  return r;
}
function sums(){
  var p=P(), out=[];
  /* kochdu: bezahlt = verlinkte Monatsrechnungen laut Buchhaltung + Online-Provision (behält Mollie ein); offen = Rechnungen offen + Rückstand + laufender Monat (KO-12/X4) */
  if(p.kochdu){ var t=p.kochdu.totals||{}, ki=items("kochdu"), kn=ki.length&&ki.some(function(x){ return x.pendingAuto!=null; });
    out.push({id:"kochdu",label:"kochdu",paid:kn?ki.reduce(function(a,x){ return a+(+x.paid||0); },0)+c2e(t.onlineProvisionCents):c2e(t.barSettledCents)+c2e(t.onlineProvisionCents),open:kn?ki.reduce(function(a,x){ return a+(+x.open||0)+(+x.unbilled||0)+(+x.pendingAuto||0); },0):c2e(t.barOpenCents),note:"Bar per Monatsrechnung + Online-Provision"}); }
  if(p.kantineur) out.push({id:"kantineur",label:"Kantineur",paid:c2e(p.kantineur.revenueGrossCents),open:0,note:"Abos laufen automatisch"});
  if(p.blitzdings){ var r=p.blitzdings.revenue||{}; out.push({id:"blitz",label:"Blitzdings",paid:c2e(r.paidCents),open:c2e(r.openCents),note:"laut Blitzdings"}); }
  if(p.valuero){ var v=items("valuero"); out.push({id:"valuero",label:"VALUERO",paid:v.reduce(function(a,x){return a+vaYear(x);},0),open:v.reduce(function(a,x){return a+(+x.unbilled||0);},0),refund:v.reduce(function(a,x){return a+(+x.refund||0);},0),note:"verrechnet "+F.D.year}); }
  var ski=F.D.skikaiser; if(ski&&ski.configured&&ski.totals) out.push({id:"ski",label:"Skikaiser",paid:c2e(ski.totals.proceedsCents),open:0,note:"Erlös nach Store-Gebühr"});
  var hg=F.D.huettengaudi; if(hg&&hg.configured&&hg.totals) out.push({id:"hg",label:"Hüttengaudi",paid:c2e(hg.totals.proceedsCents),open:0,note:"Erlös nach Store-Gebühr"});
  return out;
}

/* ---------- Überblick ---------- */
function vUeb(){
  var p=P(), s=sums(), fsc=fscRevenue(), nc=newCounts();
  var paidAll=s.reduce(function(a,x){return a+x.paid;},0)+(fsc?fsc.paid:0), openAll=s.reduce(function(a,x){return a+x.open;},0)+(fsc?fsc.open:0);
  var refund=(s.find(function(x){return x.id==="valuero";})||{}).refund||0;
  var ka=p.kantineur, ski=F.D.skikaiser, hg=F.D.huettengaudi;
  var card=function(id,title,sub,figs,extra){ return '<button class="panel pl-card" data-act="pltab:'+id+'"><div class="pl-t"><h3>'+title+'</h3><span class="muted">'+sub+'</span></div><dl class="pl-fig">'+figs.map(function(f){ return '<dt>'+f[0]+'</dt><dd'+(f[2]?' class="'+f[2]+'"':'')+'>'+f[1]+'</dd>'; }).join("")+'</dl>'+(extra||"")+'</button>'; };
  var off=function(n){ return '<div class="muted">Keine Verbindung zu '+n+'.</div>'; };
  var badge=function(k){ return nc[k]?'<span class="tag glow">'+nc[k]+' neu</span>':''; };
  var ko=p.kochdu, kt=ko&&ko.totals||{}, bz=p.blitzdings, br=bz&&bz.revenue||{}, va=items("valuero");
  var cards=
    (ko?card("kochdu","kochdu",'Bestellplattform '+badge("kochdu"),[["Bezahlt",money((s.find(function(x){return x.id==="kochdu";})||{}).paid||0)],["Bar-Gebühren offen",money(c2e(kt.barOpenCents),kt.barOpenCents>0?"warn-t":""),""],["Restaurants",num((ko.restaurants||[]).length)]]):'<div class="panel pl-card"><h3>kochdu</h3>'+off("kochdu")+'</div>')+
    (ka?card("kantineur","Kantineur","Vereinskasse",[["Eingenommen",money(c2e(ka.revenueGrossCents))],["MRR",money(c2e(ka.mrrCents))],["Aktive Abos",num((ka.subscribers||{}).active)]].concat(ka.trial?[["In Testzeit (Demo)",num(ka.trial.running)+(ka.trial.endingSoon?' <span class="muted">· '+num(ka.trial.endingSoon)+' enden bald</span>':'')]]:[])):'<div class="panel pl-card"><h3>Kantineur</h3>'+off("Kantineur")+'</div>')+
    (bz?card("blitz","Blitzdings",'Fotobox &amp; 360° '+badge("blitz"),[["Bezahlt",money(c2e(br.paidCents))],["Offen",money(c2e(br.openCents),br.openCents>0?"warn-t":"")],["Anstehend",num((bz.bookings||{}).upcomingCount!=null?bz.bookings.upcomingCount:(bz.upcoming||[]).length)]]):'<div class="panel pl-card"><h3>Blitzdings</h3>'+off("Blitzdings")+'</div>')+
    (p.valuero?card("valuero","VALUERO",'Tourismus &amp; Hosting '+badge("valuero"),[["Verrechnet "+esc(F.D.year),money(va.reduce(function(a,x){return a+vaYear(x);},0))],["Offen",money(va.reduce(function(a,x){return a+x.unbilled;},0),"warn-t")]].concat(refund>0.005?[["Zu erstatten",money(refund,"bad-t")]]:[])):'<div class="panel pl-card"><h3>VALUERO</h3>'+off("den VALUERO-Objekten")+'</div>')+
    (fsc?'<button class="panel pl-card" data-go="web"><div class="pl-t"><h3>FS Creative</h3><span class="muted">Websites</span></div><dl class="pl-fig"><dt>Bezahlt</dt><dd>'+money(fsc.paid)+'</dd><dt>Offen</dt><dd>'+money(fsc.open,fsc.open>0.005?"warn-t":"")+'</dd></dl><span class="pl-note">Hosting, Domains &amp; Mail '+esc(F.D.year)+'</span></button>':'')+
    (ski&&ski.configured&&ski.totals?card("ski","Skikaiser","In-App-Käufe",[["Erlös",money(c2e(ski.totals.proceedsCents))],["Käufe",num(ski.totals.count)]]):card("ski","Skikaiser","In-App-Käufe",[],'<span class="pl-note">'+(ski&&ski.configured?"Statistik antwortet gerade nicht.":"Noch nicht verbunden. Hier steht, was die App liefern muss.")+'</span>'))+
    (hg&&hg.configured&&hg.totals?card("hg","Hüttengaudi","Edelweiß-Pakete",[["Erlös",money(c2e(hg.totals.proceedsCents))],["Käufe",num(hg.totals.count)]].concat(hg.users?[["Aktiv 7 Tage",num(hg.users.aktiv7)]]:[])):card("hg","Hüttengaudi","Edelweiß-Pakete",[],'<span class="pl-note">'+(hg&&hg.configured?"Statistik antwortet gerade nicht.":"Noch nicht verbunden. Hier steht, was die App liefern muss.")+'</span>'));
  var rows=s.filter(function(x){return x.id!=="ski"&&x.id!=="hg";}).map(function(x){ return {label:x.label,right:'<span class="money">'+eur0(x.paid)+' bezahlt'+(x.open>0.005?' · '+eur0(x.open)+' offen':'')+'</span>',parts:[[x.paid,"a","Bezahlt "+eur(x.paid)],[x.open,"b","Offen "+eur(x.open)]]}; });
  return '<div class="kpis">'+
      kpi("Bezahlt gesamt",'<span class="money">'+eur0(paidAll)+'</span>',"alle Plattformen"+(fsc?" + Websites":"")+" · "+esc(F.D.year))+
      kpi("Offen gesamt",'<span class="money">'+eur0(openAll)+'</span>',"noch nicht bezahlt bzw. verrechnet",{vcls:openAll>0.005?"warn-t":""})+
      kpi("Kantineur MRR",'<span class="money">'+(ka?eur0(c2e(ka.mrrCents)):"—")+'</span>',ka?'<span class="money">'+eur0(c2e(ka.mrrCents)*12)+'</span> pro Jahr':"keine Verbindung",{act:"pltab:kantineur"})+
      (refund>0.005?kpi("Zu erstatten",'<span class="money">'+eur0(refund)+'</span>',"VALUERO: mehr verrechnet als angefallen",{act:"pltab:valuero",vcls:"bad-t"})
        :kpi("Neue Buchungen",num((nc.kochdu||0)+(nc.blitz||0)+(nc.valuero||0)),"seit deinem letzten Besuch"))+
    '</div>'+
    '<div class="pl-cards">'+cards+'</div>'+
    sec("Bezahlt vs. offen je Plattform",'<span class="muted">'+esc(F.D.year)+'</span>',rows.length?hbars(rows,[["Bezahlt","ok"],["Offen","warn"]]):'<div class="empty">Noch keine Plattform-Daten.</div>');
}

/* ---------- kochdu ---------- */
function vKochdu(){
  var ko=P().kochdu;
  if(!ko) return '<div class="panel empty">Keine Verbindung zu kochdu. Prüfe KOCHDU_STATS_URL und KOCHDU_STATS_TOKEN in Railway.</div>';
  var t=ko.totals||{}, rs=(ko.restaurants||[]).slice(), n=ko.nutzer||{};
  var bo=t.barOrders, oo=t.onlineOrders; if(bo==null&&oo==null){ bo=0; oo=0; rs.forEach(function(r){ bo+=+r.barOrders||0; oo+=+r.onlineOrders||0; }); }
  var open=c2e(t.barOpenCents), settled=c2e(t.barSettledCents), online=c2e(t.onlineProvisionCents);
  rs.sort(function(a,b){ return (+b.barOpenCents||0)-(+a.barOpenCents||0)||String(a.name||"").localeCompare(String(b.name||"")); });
  var sevOk=!!F.D.sev;
  var body=rs.map(function(r){
    var ro=c2e(r.barOpenCents), rp=c2e(r.barSettledCents), ron=c2e(r.onlineProvisionCents), it=item("kochdu:"+r.id);
    var li=r.lastInvoice, liAt=li?String(li.at||"").slice(0,10):"";   // Bar-Monatsrechnung, die kochdu selbst erstellt und verschickt hat
    var last=it&&it.last?invLine(it.last):li&&(!r.lastSettledAt||liAt>=String(r.lastSettledAt).slice(0,10))?'<span>'+(li.docId?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(li.docId)+'" target="_blank" rel="noopener" data-docview data-doctitle="Rechnung '+esc(li.nr||"")+'">'+esc(li.nr||"Rechnung")+'</a>':esc(li.nr||"Rechnung"))+' · '+esc(String(li.month||"").split("-").reverse().join("/"))+' <span class="tag '+(li.sent?"ok":"warn")+'">'+(li.sent?"Monatsrechnung verschickt":"Monatsrechnung, nicht verschickt")+'</span></span>'
      :(r.lastSettledAt?'<span>'+de(String(r.lastSettledAt).slice(0,10))+' <span class="tag grey">ohne Rechnung</span></span>':'<span class="muted">noch nie</span>');
    var acts='<span class="muted">automatisch (monatliche Rechnung)</span>';   // Verrechnen läuft automatisch über die kochdu-Monatsabrechnung
    return '<tr><td><b>'+esc(r.name||"—")+'</b>'+(r.active===false?' <span class="tag grey" title="Lokal stillgelegt – Provisionen bleiben sichtbar">stillgelegt</span>':'')+(r.provisionRatePct!=null?'<div class="sub">'+esc(r.provisionRatePct)+' % Provision</div>':'')+'</td>'+
      '<td class="r num" data-l="Bestellungen bar / online">'+num(r.barOrders)+' / '+num(r.onlineOrders)+'</td>'+
      '<td class="r" data-l="Bar offen">'+money(ro,ro>0.005?"warn-t":"")+'</td>'+
      '<td class="r" data-l="Bar verrechnet">'+money(rp,"ok-t")+'</td>'+
      '<td class="r" data-l="Online (automatisch)">'+money(ron)+'</td>'+
      '<td data-l="Letzte Abrechnung"><div class="invs">'+last+(it&&it.settledWithoutInvoice>0.005?'<span class="tag warn"><span class="money">'+eur(it.settledWithoutInvoice)+'</span> ohne Rechnung</span>':'')+'</div></td>'+
      '<td class="pl-a"><div class="pl-acts">'+acts+'</div></td></tr>';
  }).join("");
  var appTotal=(+n.apple||0)+(+n.android||0), kunden=n.kunden!=null?n.kunden:n.total;
  var hasApp=ko.nutzer&&(kunden!=null||n.apple!=null||n.android!=null);
  var chartRows=rs.filter(function(r){ return (+r.barOpenCents||0)+(+r.barSettledCents||0)>0; }).map(function(r){ var a=c2e(r.barSettledCents), b=c2e(r.barOpenCents); return {label:r.name||"—",right:'<span class="money">'+eur0(a)+' verrechnet'+(b>0.005?' · '+eur0(b)+' offen':'')+'</span>',parts:[[a,"a","Verrechnet "+eur(a)],[b,"b","Offen "+eur(b)]]}; });
  return (sevOk?'':'<div class="notice"><span>Die Buchhaltung antwortet gerade nicht. „Verrechnen“ markiert dann nur als verrechnet, ohne Rechnung.</span><button class="btn" data-act="reload">Neu laden</button></div>')+
    checkSec("Zur Prüfung",koChecks(ko))+
    '<div class="kpis">'+
      kpi("Bestellungen",num((+bo||0)+(+oo||0)),num(bo)+" bar · "+num(oo)+" online")+
      kpi("Bar-Gebühren offen",'<span class="money">'+eur(open)+'</span>',t.barDueCents!=null&&+t.barDueCents>0?"Rückstand "+eur(c2e(t.barDueCents))+" (Zur Prüfung) · Rest am 1. automatisch":"wird am 1. automatisch verrechnet (Monatsrechnung)",{vcls:t.barDueCents!=null&&+t.barDueCents>0?"warn-t":""})+
      kpi("Bar-Gebühren verrechnet",'<span class="money">'+eur(settled)+'</span>',"bereits abgerechnet",{vcls:"ok-t"})+
      kpi("Online-Gebühren",'<span class="money">'+eur(online)+'</span>',"automatisch einbehalten")+
    '</div>'+
    quote("Verrechnet-Quote Bar-Gebühren · "+eur0(settled)+" von "+eur0(settled+open),settled,settled+open)+
    sec("Gebühren pro Restaurant",'<span class="muted">Bar = Monatsrechnung durch kochdu · Online = Mollie behält ein</span>',
      rs.length?'<table class="pl-tbl"><thead><tr><th>Restaurant</th><th class="r">Best. bar / online</th><th class="r">Bar offen</th><th class="r">Bar verrechnet</th><th class="r">Online</th><th>Letzte Abrechnung</th><th></th></tr></thead><tbody>'+body+'</tbody>'+
        '<tfoot><tr><td>Gesamt</td><td class="r num" data-l="Bestellungen">'+num(bo)+' / '+num(oo)+'</td><td class="r" data-l="Bar offen">'+money(open,"warn-t")+'</td><td class="r" data-l="Bar verrechnet">'+money(settled,"ok-t")+'</td><td class="r" data-l="Online">'+money(online)+'</td><td></td><td></td></tr></tfoot></table>'
        :'<div class="empty">Keine aktiven Restaurants mit Umsätzen im Zeitraum.</div>')+
    lastOrdersSec(ko)+
    (chartRows.length?sec("Bar-Gebühren je Restaurant","",hbars(chartRows,[["Verrechnet","ok"],["Offen","warn"]])):'')+
    sec("App-Statistiken",'<span class="muted">Installationen = registrierte Geräte (Push) · Store-Downloads nur in App Store / Play Console</span>',
      hasApp?'<div class="panel-b"><div class="kpis">'+
        kpi("Registrierte Kunden",num(kunden),(n.web!=null?"davon Web/Desktop "+num(n.web):"")+(n.gesamt!=null?" · inkl. Team "+num(n.gesamt):""),{cls:"pl-nopriv"})+
        kpi("App-Nutzer iOS",n.apple!=null?num(n.apple):"—","registrierte Geräte",{cls:"pl-nopriv"})+
        kpi("App-Nutzer Android",n.android!=null?num(n.android):"—","registrierte Geräte",{cls:"pl-nopriv"})+
        kpi("App-Nutzer gesamt",(n.apple!=null||n.android!=null)?num(appTotal):"—","iOS + Android",{cls:"pl-nopriv"})+
      '</div></div>':'<div class="empty">kochdu liefert noch keine App-Statistik.</div>');
}
/* Letzte 5 Bestellungen über alle Restaurants */
var KO_ST={PENDING:["neu","info"],ACCEPTED:["angenommen","info"],PREPARING:["in Zubereitung","info"],READY:["fertig","ok"],OUT_FOR_DELIVERY:["unterwegs","info"],DELIVERED:["geliefert","ok"],COMPLETED:["abgeschlossen","ok"],PICKED_UP:["abgeholt","ok"],REJECTED:["abgelehnt","bad"],CANCELLED:["storniert","bad"],DECLINED:["abgelehnt","bad"]};
function lastOrdersSec(ko){
  var lo=ko.lastOrders||[];
  if(!lo.length) return sec("Letzte Bestellungen","",'<div class="empty">Noch keine Daten – kochdu liefert die letzten Bestellungen nach dem nächsten Update.</div>');
  return sec("Letzte Bestellungen",'<span class="muted">alle Restaurants</span>','<div class="scroll"><table><tbody>'+lo.map(function(o){ var st=KO_ST[o.status]||[String(o.status||"").toLowerCase(),"grey"];
    return '<tr><td class="nowrap num muted">'+esc(o.at?new Date(o.at).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"")+'</td><td><b>'+esc(o.restaurant)+'</b><div class="sub">#'+esc(o.nr)+(o.customer?' · '+esc(o.customer):'')+(o.type?' · '+esc(o.type==="DELIVERY"?"Lieferung":o.type==="PICKUP"?"Abholung":o.type==="DINE_IN"?"vor Ort":o.type.toLowerCase()):'')+'</div></td><td><span class="tag '+st[1]+'">'+esc(st[0])+'</span></td><td class="nowrap">'+esc(o.payment==="cash"?"bar":o.payment?"online":"")+'</td><td class="r num money">'+eur(c2e(o.totalCents))+'</td></tr>'; }).join("")+'</tbody></table></div>');
}
function kochduRest(id){ return ((P().kochdu||{}).restaurants||[]).find(function(r){ return String(r.id)===String(id); }); }
/* Prüfpunkte aus der kochdu-Statistik (CONTRACT-fs-order §4): stornierte/fehlende Monatsabrechnung → „neu abrechnen“ (billMonth, erst Probelauf),
   doppelt verrechnet → Gutschrift-Vorschlag unter „Zur Prüfung“ (nur auf Klick), alte Auszahlungs-Gutschrift → melden, nie still ändern */
function koChecks(ko){
  var rows=[], inv={}; ((F.D.sev&&F.D.sev.invoices)||[]).forEach(function(i){ inv[i.id]=i; });
  var bm=function(r,m,part,lbl){ var k=r.id+"~"+m+"~"+part; return '<button class="btn primary" data-act="plkbm:'+esc(k)+'"'+(BUSY["m"+k]?" disabled":"")+'>'+esc(lbl)+'</button>'; };
  (ko.restaurants||[]).forEach(function(r){ var nm=r.name||"Lokal";
    (r.months||[]).forEach(function(m){ var mm=mmOf(m.month), d=m.doc||{};
      if(+m.doubleBilledCents>0){ var di=d.docId&&inv[d.docId], paid=!!di&&(di.status===750||di.status===1000);
        rows.push({lvl:"bad",tag:"Doppelt verrechnet",text:nm+" "+mm+": "+eur(c2e(m.doubleBilledCents))+" schon per Verrechnung von Hand abgerechnet und nochmals in "+(d.nr||"der Monatsrechnung")+". "+(paid?"Gutschrift-Vorschlag liegt unter „Zur Prüfung“ (nur auf Klick).":"Die Monatsrechnung ist noch nicht bezahlt – eine Gutschrift geht erst danach; nichts wird automatisch korrigiert."),inv:d.docId||"",acts:paid&&F.actions.fin?'<button class="btn" data-act="fin:review">Zur Prüfung</button>':''}); }
      if(m.state==="storniert"&&+m.openCents>0){ var cd=(m.cancelledDocs||[])[0]||{}; rows.push({lvl:"warn",tag:"Storniert",text:nm+" "+mm+": Monatsrechnung "+(cd.nr||"")+" storniert – "+eur(c2e(m.openCents))+" neu abrechnen.",inv:cd.docType==="CreditNote"?"":(cd.docId||""),acts:bm(r,m.month,"cash","Neu abrechnen")}); }
      else if(m.state==="ueberschneidung"&&+m.openCents>0) rows.push({lvl:"warn",tag:"Teilweise von Hand",text:nm+" "+mm+": "+eur(c2e(m.manualCents))+" schon von Hand verrechnet, Rest "+eur(c2e(m.openCents))+" offen.",acts:bm(r,m.month,"cash","Rest abrechnen")});
      else if(m.state==="rueckstand"&&+m.openCents>0) rows.push({lvl:"warn",tag:"Rückstand",text:nm+" "+mm+": weder Monatsrechnung noch Verrechnung von Hand ("+eur(c2e(m.openCents))+"). Vorsicht: Die alte Sammelrechnung „kochdu Provisionen "+mm+"“ kann den Monat schon enthalten – vorher prüfen.",acts:bm(r,m.month,"cash","Abrechnen …")});
      else if(m.state==="offen"&&!m.autoPending&&+m.openCents>0) rows.push({lvl:"warn",tag:"Monatslauf fehlt",text:nm+" "+mm+": abgeschlossen, aber noch keine Monatsrechnung ("+eur(c2e(m.openCents))+").",acts:bm(r,m.month,"cash","Abrechnen")});
      else if(m.state==="haengt") rows.push({lvl:"info",tag:"Lauf hängt",text:nm+" "+mm+": Abrechnungslauf ohne Beleg – der nächste Lauf übernimmt den Beleg oder legt ihn an."});
      if(+m.owedCents>0&&!(m.doc&&m.state==="gutschrift")) rows.push({lvl:"warn",tag:"An das Lokal",text:nm+" "+mm+": kochdu schuldet dem Lokal "+eur(c2e(m.owedCents))+" (Guthaben/Gutscheine übersteigen die Gebühr).",acts:bm(r,m.month,"cash","Abrechnung an das Lokal erstellen")});
    });
    (r.payouts||[]).forEach(function(x){ if(!x||!x.legacySign||x.cancelled||x.deleted) return;
      rows.push({lvl:"warn",tag:"Alte Auszahlungs-Gutschrift",text:nm+" "+mmOf(x.month)+": Auszahlungs-Gutschrift "+(x.nr||"(Entwurf)")+" in alter Form (Gebühr ohne USt). Bitte den Entwurf löschen und neu erzeugen – nichts wird still geändert.",acts:bm(r,x.month,"payout","Neu erzeugen …")}); });
  });
  var now=Date.now(); (((ko.billing||{}).hanging)||[]).forEach(function(h){ if(h&&h.since&&now-Date.parse(h.since)>864e5) rows.push({lvl:"info",tag:"Lauf hängt",text:"Abrechnung "+mmOf(h.month)+" ("+(h.part||"")+") seit "+deShort(String(h.since).slice(0,10))+" ohne Beleg."}); });
  return rows;
}
/* „Neu abrechnen“: kochdu-Aktion billMonth über den bestehenden Proxy – erst Probelauf (zeigt, was entsteht), dann auf Klick echt */
function kbmErr(j){ var e=(j&&(j.error||(j.line&&j.line.error)))||"unbekannter Fehler"; return {bad_month:"ungültiger Monat",month_not_closed:"Monat ist noch nicht abgeschlossen",not_found:"Lokal nicht gefunden",billing_exclude:"Lokal ist von der Barabrechnung ausgenommen",unknown_action:"kochdu kennt „neu abrechnen“ noch nicht (Update ausstehend)",bad_part:"unbekannte Abrechnungsart"}[e]||String(e); }
F.action("plkbm",function(v){
  var x=String(v).split("~"), rid=x[0], month=x[1], part=x[2]==="payout"?"payout":"cash", r=kochduRest(rid); if(!r||BUSY["m"+v]) return;
  if(!Array.isArray(r.months)){ F.toast("kochdu kennt „neu abrechnen“ noch nicht (Update ausstehend)",true); return; }   /* altes kochdu würde jede unbekannte Aktion als „verrechnet“ speichern */
  var m=(r.months||[]).find(function(y){ return y.month===month; })||{}, mm=mmOf(month), body={action:"billMonth",restaurantId:rid,month:month,part:part};
  BUSY["m"+v]=1; F.render();
  F.api("/admin/api/kochdu-settle",{body:Object.assign({dry:true},body)}).then(function(j){
    delete BUSY["m"+v]; F.render();
    if(!j||j.ok===false||j.error){ F.toast("kochdu: "+kbmErr(j),true); return; }
    var l=j.line||{};
    if(j.nothing||l.skipped){ F.toast((r.name||"")+" "+mm+": "+(l.skipped||"nichts abzurechnen")); F.load(true); return; }
    var g=+l.gross||0, neg=g<0||part==="payout";
    var txt=(r.name||"")+" "+mm+": "+(part==="payout"?"Auszahlungs-Abrechnung":"Barzahlungsabrechnung")+" über "+eur(g)+(+l.manualSettledGross>0?" (abzüglich bereits von Hand verrechnet "+eur(+l.manualSettledGross)+")":"")+". "+
      (neg?"Wird als Entwurf angelegt – du überweist und sendest selbst.":"Wird angelegt, fertiggestellt und per Mail an das Lokal geschickt.")+(l.addressWarning?" Hinweis: "+l.addressWarning:"")+
      (m.state==="rueckstand"?" Achtung: Monat vor 10/2026 – die alte Sammelrechnung „kochdu Provisionen "+mm+"“ kann diese Gebühren schon als Erlös enthalten. Bitte vorher prüfen.":"");
    F.confirm(txt,neg?"Entwurf anlegen":"Abrechnen & senden",function(){
      BUSY["m"+v]=1; F.render();
      F.api("/admin/api/kochdu-settle",{body:Object.assign({dry:false,send:true},body)}).then(function(k2){
        delete BUSY["m"+v];
        if(!k2||k2.ok===false||k2.error){ F.toast("kochdu: "+kbmErr(k2)+" – bitte in kochdu prüfen, bevor du es noch einmal versuchst",true); F.load(true); return; }
        var l2=k2.line||{}; F.toast((r.name||"")+" "+mm+": "+(l2.skipped?l2.skipped:(l2.invoiceNumber?"Rechnung "+l2.invoiceNumber:"Beleg")+" angelegt"+(l2.mail?" und versendet":"")));
        F.load(true);
      }).catch(function(){ delete BUSY["m"+v]; F.toast("Keine Verbindung zu kochdu – bitte in kochdu prüfen, ob der Beleg entstanden ist",true); F.render(); });
    });
  }).catch(function(){ delete BUSY["m"+v]; F.toast("Keine Verbindung zum Server",true); F.render(); });
});
function kochduSettleOnly(r){
  var cents=Math.round(+r.barOpenCents||0); BUSY["k"+r.id]=1; F.render();
  F.api("/admin/api/kochdu-settle",{body:{action:"settle",restaurantId:r.id,amountCents:cents}}).then(function(j){
    delete BUSY["k"+r.id];
    if(!okRes(j)){ F.toast("kochdu hat abgelehnt: "+((j&&j.error)||"unbekannter Fehler"),true); F.render(); return; }
    pend("kochdu",r.id,"settle"); F.toast(r.name+" als verrechnet markiert (ohne Rechnung)"); F.load(true);
  }).catch(function(){ delete BUSY["k"+r.id]; F.toast("Keine Verbindung zum Server",true); F.render(); });
}
F.action("plkbill",function(id){
  var r=kochduRest(id); if(!r||!(+r.barOpenCents>0)) return;
  if(!F.D.sev){ F.confirm("Die Buchhaltung ist gerade nicht erreichbar. "+r.name+" nur als verrechnet markieren (ohne Rechnung)?","Nur markieren",function(){ kochduSettleOnly(r); }); return; }
  var it=item("kochdu:"+r.id), amt=c2e(r.barOpenCents);
  var pre=it&&it.action?JSON.parse(JSON.stringify(it.action)):{title:"Rechnung · kochdu · "+(r.name||""),contactName:r.name||"",headText:"kochdu-Gebühren für Bestellungen mit Barzahlung bis "+de(F.D.today)+".",
    items:[{name:"kochdu Vermittlungsgebühren (Barzahlungen)",text:(+r.barOrders||0)+" Bar-Bestellungen bis "+de(F.D.today),qty:1,priceGross:amt,taxRate:20}],
    after:{billing:{key:"kochdu:"+r.id,label:r.name||""},kochduSettle:{restaurantId:r.id,amountCents:Math.round(+r.barOpenCents||0)}}};
  pre.onDone=function(){ if(pre.after&&pre.after.kochduSettle) pend("kochdu",r.id,"settle"); loadBill(); };
  F.openInvoice(pre);
});
/* Rückgängig: kochdu-Stand zurücksetzen und – falls die letzte Abrechnung zu dieser Verrechnung gehört – den Rechnungs-Eintrag entfernen */
F.action("plkundo",function(id){
  var r=kochduRest(id); if(!r) return;
  loadBill().then(function(){
    var recs=billRecs("kochdu:"+r.id), last=recs[recs.length-1], sd=String(r.lastSettledAt||"").slice(0,10);
    var belongs=!!(last&&sd&&Math.abs(Date.parse(String(last.date).slice(0,10))-Date.parse(sd))<=864e5*1.01);
    var txt="Verrechnung für "+(r.name||"Restaurant")+" zurücknehmen? Die Bar-Gebühren gelten in kochdu dann wieder als offen."+(belongs?" Die zugehörige Rechnung "+(last.nr||"")+" wird aus der Abrechnungs-Historie entfernt – stornieren musst du sie selbst unter Finanzen › Rechnungen.":"");
    F.confirm(txt,"Zurücknehmen",function(){
      BUSY["k"+r.id]=1; F.render();
      F.api("/admin/api/kochdu-settle",{body:{action:"unsettle",restaurantId:r.id}}).then(function(j){
        if(!okRes(j)) throw new Error((j&&j.error)||"kochdu hat abgelehnt");
        pend("kochdu",r.id,"unsettle");
        return belongs?F.api("/admin/api/billing",{body:{op:"unbill",key:"kochdu:"+r.id}}).then(function(b){ return {unbilled:okRes(b)}; }):{unbilled:false};
      }).then(function(res){
        delete BUSY["k"+r.id];
        if(belongs&&!res.unbilled) F.toast("kochdu zurückgesetzt, aber der Rechnungs-Eintrag konnte nicht entfernt werden",true);
        else F.toast("Verrechnung zurückgenommen"+(belongs&&last.id?" – Rechnung "+(last.nr||"")+" prüfen":""),false,belongs&&last.id&&F.sevOpenInvoice?"Rechnung öffnen":null,belongs&&last.id&&F.sevOpenInvoice?function(){ F.sevOpenInvoice(last.id); }:null);
        F.load(true);
      }).catch(function(e){ delete BUSY["k"+r.id]; F.toast("Rückgängig fehlgeschlagen: "+(e&&e.message||"keine Verbindung"),true); F.render(); });
    },true);
  });
});

/* ---------- Kantineur ---------- */
var KA_PLANS={KANTINEUR:{label:"Kantineur",price:9},MAGAZINEUR:{label:"Magazineur",price:14.9}};
var KA_STATUS={ACTIVE:["aktiv","ok"],TRIAL:["Testphase","info"],PAUSED:["pausiert","warn"],INACTIVE:["inaktiv","grey"],CANCELLED:["gekündigt","bad"],CANCELED:["gekündigt","bad"],EXPIRED:["abgelaufen","grey"],PENDING:["ausstehend","warn"],PAST_DUE:["Zahlung offen","bad"]};
var KA_ADMIN="https://kantineur.at/betreiber/kantinen";
function kaPlan(p){ return (KA_PLANS[p]||{}).label||p||"—"; }
/* Prüfpunkte Kantineur (KA-7/KA-10, Abo-Fehler, Rechnungen aus dem Abgleich): Doppelabbuchung und „Zahlung offen“ rot */
function kaChecks(k){
  var a=k.attention||{}, rows=[], it=item("kantineur"), dd=function(v){ return v?de(String(v).slice(0,10)):""; };
  (a.subscriptionErrors||[]).forEach(function(x){ var dbl=/zweites mollie-abo|doppelt abgebucht/i.test(x.error||"");
    rows.push({lvl:dbl?"bad":"warn",tag:dbl?"Doppelabbuchung":"Abo-Fehler",text:(x.name||"Kantine")+": "+(x.error||"Monatsabo bei Mollie nicht in Ordnung")+(dbl?" – zweites Abo im Kantineur-Betreiberbereich bzw. bei Mollie beenden und doppelt Eingezogenes erstatten.":""),acts:ext(KA_ADMIN,"Kantineur")}); });
  (a.pastDue||[]).forEach(function(x){ rows.push({lvl:"bad",tag:"Zahlung offen",text:(x.name||"Kantine")+": Monatseinzug geplatzt oder zurückgebucht"+(x.paidUntil?" · bezahlt bis "+dd(x.paidUntil):"")+".",acts:ext(KA_ADMIN,"Kantineur")}); });
  (a.activeWithoutMollie||[]).forEach(function(x){ rows.push({lvl:"warn",tag:"Kein Monatsabo",text:(x.name||"Kantine")+": bezahlt, aber kein Monatsabo bei Mollie – es wird nicht mehr abgebucht"+(x.paidUntil?" (bezahlt bis "+dd(x.paidUntil)+")":"")+". Nachholen mit „Abo bei Mollie einrichten“.",acts:ext(KA_ADMIN,"Kantineur")}); });
  (a.planChanges||[]).forEach(function(x){ rows.push({lvl:"info",tag:"Tarifwechsel",text:(x.name||"Kantine")+": "+kaPlan(x.plan)+" → "+kaPlan(x.nextPlan)+" ab dem nächsten Einzug."}); });
  /* ältere Kantineur-Version ohne attention: Status-Zähler */
  var cs=(k.canteens||{}).byStatus||{};
  if(!a.pastDue&&+cs.PAST_DUE>0) rows.push({lvl:"bad",tag:"Zahlung offen",text:num(cs.PAST_DUE)+(+cs.PAST_DUE===1?" Kantine":" Kantinen")+" mit geplatztem Monatseinzug – im Kantineur-Betreiberbereich ansehen.",acts:ext(KA_ADMIN,"Kantineur")});
  ((it&&it.notes)||[]).forEach(function(n){ rows.push(n); });
  return rows;
}
/* Abo-Zahlungen mit Rechnung (Kantineur ab apiVersion 2) */
function kaPaySec(k){
  var ps=(k.payments||[]).slice(0,12); if(!ps.length) return "";
  var inv={}; ((F.D.sev&&F.D.sev.invoices)||[]).forEach(function(i){ inv[i.id]=i; if(i.mpid&&i.type!=="SR"&&!inv[i.mpid]) inv[i.mpid]=i; });
  var ST={sent:["versendet","ok"],unsent:["nicht versendet","warn"],missing:["Rechnung fehlt","bad"]};
  return sec("Abo-Zahlungen & Rechnungen",'<span class="muted">je Mollie-Einzug genau eine Rechnung</span>','<div class="scroll"><table class="pl-tbl"><thead><tr><th>Bezahlt</th><th>Kantine</th><th class="r">Betrag</th><th>Rechnung</th></tr></thead><tbody>'+
    ps.map(function(p){ var i=(p.invoiceId&&inv[p.invoiceId])||inv[p.molliePaymentId], st=ST[p.invoiceState]||["?","grey"], back=(+p.refundedCents||0)+(+p.chargedBackCents||0);
      var nr=i?(F.actions.fin?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'" data-act="fin:invd:'+esc(i.id)+'">'+esc(i.nr||"Entwurf")+'</a>':esc(i.nr||"Entwurf")):(p.invoiceNumber?esc(p.invoiceNumber):'<span class="muted">—</span>');
      return '<tr><td class="nowrap" data-l="Bezahlt">'+(p.paidAt?deShort(String(p.paidAt).slice(0,10)):"—")+'</td><td data-l="Kantine"><b>'+esc(p.canteenName||"—")+'</b><div class="sub">'+esc(kaPlan(p.plan))+(p.periodStart?" · "+deShort(p.periodStart)+"–"+deShort(p.periodEnd):"")+'</div></td>'+
        '<td class="r" data-l="Betrag">'+money(c2e(p.grossCents))+(back>0?'<div class="sub bad-t">'+(+p.chargedBackCents>0?"zurückgebucht ":"erstattet ")+'<span class="money">'+eur(c2e(back))+'</span></div>':'')+'</td>'+
        '<td data-l="Rechnung"><span class="invs">'+nr+' <span class="tag '+(i&&i.status===100?"warn":st[1])+'">'+esc(i&&i.status===100?"Entwurf":i&&i.cancelled?"storniert":st[0])+'</span>'+(i&&Math.abs((+i.gross||0)-c2e(p.grossCents))>0.005?' <span class="tag bad">Betrag weicht ab</span>':'')+'</span>'+(p.invoiceError?'<div class="sub warn-t">'+esc(p.invoiceError)+'</div>':'')+'</td></tr>'; }).join("")+
    '</tbody></table></div>'+(k.paymentsTruncated||(k.payments||[]).length>12?'<p class="pl-note" style="padding:0 18px 12px">Die letzten 12 Einzüge – alle im Kantineur-Betreiberbereich.</p>':''));
}
function vKantineur(){
  var k=P().kantineur;
  if(!k) return '<div class="panel empty">Keine Verbindung zu Kantineur. Prüfe KANTINEUR_STATS_URL und KANTINEUR_STATS_TOKEN in Railway.</div>';
  var sub=k.subscribers||{}, bp=sub.byPlan||{}, cs=(k.canteens||{}).byStatus||{}, mrr=c2e(k.mrrCents);
  var planObj=function(x){ return (x&&typeof x==="object")?x:{active:+x||0,paying:0,sponsored:0,mrrCents:0}; };
  var keys=Object.keys(KA_PLANS).concat(Object.keys(bp).filter(function(x){return !KA_PLANS[x];}));
  var plans=keys.map(function(key){ var o=planObj(bp[key]); return {key:key,label:(KA_PLANS[key]||{}).label||key,price:(KA_PLANS[key]||{}).price,active:+o.active||0,paying:+o.paying||0,sponsored:+o.sponsored||0,mrr:c2e(o.mrrCents)}; });
  var sumA=0,sumP=0,sumS=0; plans.forEach(function(p){ sumA+=p.active; sumP+=p.paying; sumS+=p.sponsored; });
  var spon=+sub.sponsored||0;
  var stRows=Object.keys(cs).filter(function(s){return +cs[s]>0;}).sort(function(a,b){return cs[b]-cs[a];});
  var tones=["ok","info","glow","warn","bad","ink-3"];
  var cks=kaChecks(k), ckBad=cks.filter(function(r){ return r.lvl==="bad"; }).length, ckWarn=cks.filter(function(r){ return r.lvl==="warn"; }).length, ki=k.invoices||null;
  return '<div class="kpis"'+(k.trial||ckBad||ckWarn?' style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"':'')+'>'+
      kpi("Umsatz diesen Monat",'<span class="money">'+eur(c2e(k.thisMonthGrossCents))+'</span>',"automatisch über die Plattform",{vcls:"ok-t"})+
      kpi("Aktive Abos",num(sub.active),num(sub.paying)+" zahlend · "+num(spon)+" gesponsert")+
      kpi("Umsatz / Monat (MRR)",'<span class="money">'+eur(mrr)+'</span>','<span class="money">'+eur(mrr*12)+'</span> pro Jahr'+(spon?" · "+spon+"× Gutschein gratis":""),{vcls:"ok-t"})+
      kpi("Eingenommen "+esc(F.D.year),'<span class="money">'+eur(c2e(k.revenueGrossCents))+'</span>',k.revenueNetCents?'netto <span class="money">'+eur(c2e(k.revenueNetCents))+'</span>':"brutto, fließt in die Gesamt-Einnahmen")+
      (ckBad||ckWarn?kpi("Zur Prüfung",num(ckBad+ckWarn),(ckBad?num(ckBad)+" dringend":"")+(ckBad&&ckWarn?" · ":"")+(ckWarn?num(ckWarn)+" prüfen":""),{vcls:ckBad?"bad-t":"warn-t"}):'')+
      (k.trial?kpi("In Testzeit (Demo)",num(k.trial.running),[k.trial.endingSoon?num(k.trial.endingSoon)+" enden in 3 Tagen":"keine endet in den nächsten 3 Tagen",k.trial.expired?num(k.trial.expired)+" abgelaufen ohne Abo":""].filter(Boolean).join(" · ")+(k.trial.showcase?' <span class="muted">· ohne '+num(k.trial.showcase)+' Vorführ-Kantine'+(k.trial.showcase===1?'':'n')+'</span>':''),{vcls:k.trial.endingSoon?"warn-t":""}):'')+
    '</div>'+
    checkSec("Zur Prüfung",cks)+
    '<div class="two">'+
      sec("Abo-Varianten",'<span class="muted">Umsatz effektiv, Gutscheine eingerechnet</span>',
        '<table class="pl-tbl"><thead><tr><th>Variante</th><th class="r">Listenpreis</th><th class="r">Aktiv</th><th class="r">Zahlend</th><th class="r">Umsatz / Monat</th></tr></thead><tbody>'+
        plans.map(function(p){ return '<tr><td><b>'+esc(p.label)+'</b>'+(p.sponsored?' <span class="muted">· '+p.sponsored+' gesponsert</span>':'')+'</td><td class="r" data-l="Listenpreis">'+(p.price!=null?money(p.price):'<span class="muted">—</span>')+'</td><td class="r num" data-l="Aktiv">'+num(p.active)+'</td><td class="r num" data-l="Zahlend">'+num(p.paying)+'</td><td class="r" data-l="Umsatz / Monat">'+money(p.mrr)+'</td></tr>'; }).join("")+
        '</tbody><tfoot><tr><td>Gesamt</td><td></td><td class="r num" data-l="Aktiv">'+num(sumA)+'</td><td class="r num" data-l="Zahlend">'+num(sumP)+'</td><td class="r" data-l="Umsatz / Monat">'+money(mrr,"ok-t")+'</td></tr></tfoot></table>')+
      sec("Abo-Verteilung","",sumA?donut(plans.filter(function(p){return p.active>0;}).map(function(p,i){ return [p.label,p.active,["info","glow","ok","warn"][i%4],num(p.active)+" Abos"]; }),num(sumA)):'<div class="empty">Noch keine aktiven Abos.</div>')+
    '</div>'+
    sec("Kantinen nach Status",'<span class="muted">'+num((k.canteens||{}).total)+' registriert</span>',
      stRows.length?hbars(stRows.map(function(s,i){ var m=KA_STATUS[s]||[s.toLowerCase(),"grey"]; return {label:m[0].charAt(0).toUpperCase()+m[0].slice(1),right:num(cs[s])+(cs[s]===1?" Kantine":" Kantinen"),parts:[[+cs[s],{ok:"a",warn:"b",info:"c"}[m[1]]||"d",m[0]]]}; })):'<div class="empty">Keine Status-Aufteilung verfügbar.</div>')+
    kaPaySec(k)+
    '<p class="pl-note">Kantineur rechnet die Abos selbst ab: je Mollie-Einzug eine Rechnung in deiner Buchhaltung, die Zahlung ordnet der Mollie-Abgleich zu. Hier ist nichts zu verrechnen'+(ki?' · Rechnungen '+num(ki.written)+(ki.missing?' · <span class="bad-t">'+num(ki.missing)+' fehlen</span>':'')+(ki.unsent?' · '+num(ki.unsent)+' nicht versendet':''):'')+'.</p>';
}

/* ---------- Blitzdings ---------- */
function bzPayTag(b){ return b.paymentStatus==="PAID"?'<span class="tag ok">bezahlt</span>':b.paymentStatus==="REFUNDED"?'<span class="tag grey">erstattet</span>':'<span class="tag warn">offen</span>'; }
/* BD-10: Buchungsliste nicht (aktuell) geladen → sichtbar, nie still „0 zu verrechnen“ */
function bzStatusNote(){ var s=F.D&&F.D.abgleich&&F.D.abgleich.blitzStatus; if(!s||(s.status!=="fehlt"&&s.status!=="stale"&&!s.partial)) return "";
  return '<div class="notice" style="background:var(--warn-soft)"><span><b>Blitzdings-Buchungen '+(s.status==="fehlt"?"nicht geladen":"nicht aktuell")+'</b> – Liste unvollständig'+(s.status==="stale"&&s.at?" (Stand "+esc(new Date(s.at).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))+")":"")+(s.error?": "+esc(s.error):"")+'. „Zu verrechnen“ kann zu niedrig sein.</span><button class="btn" data-act="reload">Neu laden</button></div>'; }
/* Prüfpunkte Blitzdings: Abgleich-Hinweise (Storno prüfen, offenes Angebot, Doppelrechnung, Betrag geändert …) + Rechnungsmeldung an Blitzdings */
function bzChecks(bz){
  var rows=[], rep=bz&&bz.invoiceReport;
  items("blitzdings").forEach(function(x){ (x.notes||[]).forEach(function(n){ var id=x.bookingId||String(x.key).replace(/^blitz:/,"");
    var acts=(F.actions.bkshow?'<button class="btn" data-act="bkshow:'+esc(id)+'">Buchung</button>':'')+(x.offerOpen?'<button class="btn primary" data-act="plbaccept:'+esc(id)+'">Als angenommen markieren</button>':'');
    rows.push({lvl:n.lvl,tag:n.lvl==="bad"&&x.cancelled?"Storno prüfen":x.offerOpen?"Angebot offen":"",text:(x.name||"Buchung")+(x.reference?" ("+x.reference+")":"")+": "+n.text,inv:n.inv||((x.cancelled||/Doppelrechnung/.test(n.text))&&x.last&&x.last.id)||"",acts:acts}); }); });
  if(rep){
    if((rep.stock||[]).length) rows.push({lvl:"warn",tag:"An Blitzdings melden",text:rep.stock.length+(rep.stock.length===1?" Cockpit-Rechnung ist":" Cockpit-Rechnungen sind")+" Blitzdings noch nicht gemeldet (ältere Einträge). Melden sperrt dort die automatische Rechnung bei Online-Zahlung oder Angebotsannahme – keine Rechnung wird geändert.",acts:'<button class="btn primary" data-act="plbrep:stock"'+(BUSY.brep?" disabled":"")+'>An Blitzdings melden</button>'});
    (rep.duplicates||[]).forEach(function(d){ rows.push({lvl:"bad",tag:"Doppelrechnung",text:"Buchung "+(d.reference||d.bookingId)+": Cockpit-Rechnung "+(d.nr||"(Entwurf)")+(d.other?" und Blitzdings-Rechnung "+(d.otherNr||"")+"":"")+(d.inProgress?" – Blitzdings legt gerade selbst eine an":"")+". Eine davon stornieren bzw. den Entwurf löschen – nicht automatisch.",inv:d.invoiceId}); });
    var pend=(rep.pending||[]).filter(function(x){ return x.tries>0; });
    if(pend.length) rows.push({lvl:"info",tag:"Meldung wartet",text:pend.length+(pend.length===1?" Rechnungsmeldung wartet":" Rechnungsmeldungen warten")+" auf Blitzdings: "+(pend[0].err||"nicht erreichbar")+" – wird von selbst wiederholt.",acts:'<button class="btn" data-act="plbrep:pending"'+(BUSY.brep?" disabled":"")+'>Jetzt versuchen</button>'});
  }
  return rows;
}
F.action("plbrep",function(what){
  var rep=(P().blitzdings||{}).invoiceReport||{}, list=what==="stock"?(rep.stock||[]):(rep.pending||[]); if(!list.length||BUSY.brep) return;
  var go=function(){ BUSY.brep=1; F.render();
    F.api("/admin/api/blitz/booking-invoice",{body:{items:list.map(function(x){ return {bookingId:x.bookingId,invoiceId:x.invoiceId,nr:x.nr||""}; })}}).then(function(j){
      delete BUSY.brep; if(!j||j.ok===false){ F.toast("Blitzdings: "+((j&&j.error)||"nicht erreichbar"),true); F.render(); return; }
      F.toast(j.reported+" gemeldet"+(j.duplicates?" · "+j.duplicates+" mögliche Doppelrechnung(en) – bitte prüfen":"")+(j.queued?" · "+j.queued+" warten (Blitzdings-Update ausstehend)":""),!!j.duplicates||!!j.queued); F.load(true);
    }).catch(function(){ delete BUSY.brep; F.toast("Keine Verbindung zum Server",true); F.render(); }); };
  if(what==="stock") F.confirm(list.length+(list.length===1?" Cockpit-Rechnung":" Cockpit-Rechnungen")+" an Blitzdings melden? Blitzdings legt für diese Buchungen dann keine eigene Rechnung mehr an. Rechnungen werden nicht geändert.","Melden",go); else go();
});
/* offenes Angebot: Kunde hat z. B. telefonisch zugesagt → in Blitzdings bestätigen (danach normale Verrechnung, keine Blitzdings-Rechnung) */
F.action("plbaccept",function(id){
  F.confirm("Angebot als angenommen markieren? Die Buchung wird in Blitzdings bestätigt und erscheint danach normal unter „Zu verrechnen“.","Als angenommen markieren",function(){
    F.api("/admin/api/blitz/booking-status",{body:{id:id,status:"CONFIRMED"}}).then(function(j){ if(!j||j.ok===false){ F.toast("Blitzdings hat nicht gespeichert: "+((j&&j.error)||"Fehler"),true); return; } F.toast("Angebot als angenommen markiert"); F.load(true); }).catch(function(){ F.toast("Keine Verbindung",true); });
  });
});
function vBlitz(){
  var bz=P().blitzdings;
  var kal=F.blitzKal?F.blitzKal():"";   /* Verfügbarkeitskalender + Buchung anlegen (blitz-kal.js) */
  if(!bz) return bzStatusNote()+'<div class="panel empty">Keine Verbindung zu Blitzdings. Prüfe BLITZDINGS_STATS_URL und BLITZDINGS_STATS_TOKEN in Railway.</div>'+checkSec("Zur Prüfung",bzChecks(null))+kal;
  var r=bz.revenue||{}, bk=bz.bookings||{}, ups=(bz.upcoming||[]).slice().sort(function(a,b){ return String(a.eventDate||"").localeCompare(String(b.eventDate||"")); });
  var sevOk=!!F.D.sev;
  var list=ups.map(function(b){
    var d=b.eventDate?new Date(String(b.eventDate).slice(0,10)+"T12:00:00"):null, day=String(b.eventDate||"").slice(0,10);
    var end=b.eventEndDate&&String(b.eventEndDate).slice(0,10)!==day?" – "+deShort(b.eventEndDate):"";
    var it=item("blitz:"+b.id), recs=billRecs("blitz:"+b.id), rec=recs[recs.length-1];
    var inv="";
    if(it&&it.last) inv='<span class="invs">'+invLine(it.last)+'</span>';
    else if(rec) inv='<span>'+(rec.id?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(rec.id)+'" target="_blank" rel="noopener" data-docview data-doctitle="Rechnung '+esc(rec.nr||"Entwurf")+'">'+esc(rec.nr||"Entwurf")+'</a>':esc(rec.nr||"Rechnung"))+' <span class="tag info">angelegt '+deShort(rec.date)+'</span></span>';
    var sto=!!(it&&it.last&&it.last.state==="storniert"), diff=!!(it&&it.action&&inv&&!sto&&+it.unbilled>0.005&&!it.depositOnly);   /* storniert → wieder zu verrechnen; Betrag geändert → Differenz */
    var offer=b.offerOpen===true||(b.status==="PENDING"&&b.paymentStatus!=="PAID");   /* Angebot/Anfrage noch nicht angenommen: nie eine Rechnung (sonst Doppelrechnung bei Annahme) */
    var canInv=(!inv||sto||diff)&&+b.totalCents>0&&!offer&&b.invoiceInProgress!==true;
    var paid=b.paymentStatus==="PAID";
    return '<div class="pl-bk"><div class="pl-date"><b>'+(d?d.getDate():"–")+'</b><span>'+(d?esc(d.toLocaleDateString("de-AT",{month:"short"})):"")+'</span></div>'+
      '<div style="min-width:0"><div><b>'+esc(b.package||"Buchung")+'</b>'+(b.reference?' <span class="tag grey">'+esc(b.reference)+'</span>':'')+'</div>'+
        '<div class="pl-meta"><span>'+esc(b.customerName||"—")+'</span>'+(b.location?'<span>'+esc(b.location)+'</span>':'')+(b.customerPhone?'<a href="tel:'+esc(String(b.customerPhone).replace(/[^\d+]/g,""))+'">'+esc(b.customerPhone)+'</a>':'')+(b.customerEmail?'<span>'+esc(b.customerEmail)+'</span>':'')+'<span>'+(d?esc(d.toLocaleDateString("de-AT",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"})):"")+esc(end)+'</span></div>'+
        ((b.extras||[]).length?'<div class="pl-meta">+ '+esc(b.extras.map(function(e){return e&&e.name;}).filter(Boolean).join(", "))+'</div>':'')+
      '</div>'+
      '<div class="pl-right"><span class="pl-amt money">'+eur(c2e(b.totalCents))+'</span>'+(offer?'<span class="tag info">'+(b.offerOpen?"Angebot offen":"nicht angenommen")+'</span>':bzPayTag(b))+
        '<div class="pl-acts">'+inv+
          (canInv?'<button class="btn" data-act="plbinv:'+esc(b.id)+'"'+(sevOk?'':' disabled title="Buchhaltung ist gerade nicht erreichbar"')+'>'+(diff?"Differenz · "+money(+it.unbilled):"Rechnung")+'</button>':'')+
          (it&&it.depositOnly&&+it.unbilled>0.005&&F.actions.bkshow?'<button class="btn" data-act="bkshow:'+esc(b.id)+'" title="Anzahlung verrechnet – Restrechnung im Buchungsfenster vorbereiten">Restrechnung · '+money(+it.unbilled)+'</button>':'')+
          '<button class="btn'+(paid?"":" primary")+'" data-act="plbpay:'+esc(b.id)+'"'+(BUSY["b"+b.id]?" disabled":"")+'>'+(paid?"↺ Auf offen":"Als bezahlt")+'</button>'+
        '</div></div></div>';
  }).join("");
  return bzStatusNote()+'<div class="kpis">'+
      kpi("Bezahlt",'<span class="money">'+eur(c2e(r.paidCents))+'</span>',num(bk.paidCount)+" bezahlte Buchungen",{vcls:"ok-t"})+
      kpi("Offen",'<span class="money">'+eur(c2e(r.openCents))+'</span>',num(bk.openCount)+" offen",{vcls:r.openCents>0?"warn-t":""})+
      kpi("Anstehende Termine",num(bk.upcomingCount!=null?bk.upcomingCount:ups.length),"ab heute")+
      kpi("Diesen Monat bezahlt",'<span class="money">'+eur(c2e(r.thisMonthPaidCents))+'</span>',r.refundedCents?'<span class="money">'+eur(c2e(r.refundedCents))+'</span> erstattet':"seit Monatsanfang")+
    '</div>'+checkSec("Zur Prüfung",bzChecks(bz))+kal+
    sec("Nächste Termine",'<span class="muted">„Als bezahlt“ wird direkt in Blitzdings gespeichert</span>',ups.length?list:'<div class="empty">Keine anstehenden Termine.</div>')+
    bzPastSec(sevOk)+
    sec("Bezahlt vs. offen",'<span class="muted">'+esc(F.D.year)+'</span>',donut([["Bezahlt",c2e(r.paidCents),"ok",'<span class="money">'+eur(c2e(r.paidCents))+'</span>'],["Offen",c2e(r.openCents),"warn",'<span class="money">'+eur(c2e(r.openCents))+'</span>']].concat(r.refundedCents?[["Erstattet",c2e(r.refundedCents),"ink-3",'<span class="money">'+eur(c2e(r.refundedCents))+'</span>']]:[]),num((+bk.paidCount||0)+(+bk.openCount||0))));
}
/* Vergangene Buchungen ohne Rechnung (aus dem Abgleich): Rechnung, bezahlte Rechnung, einer bestehenden zuordnen oder ausblenden */
function bzPastSec(sevOk){
  var t=F.D.today||"", past=items("blitzdings").filter(function(x){ return (+x.unbilled||0)>0.005&&x.date&&x.date<t; }).sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); });
  if(!past.length) return "";
  var A=F.actions, sum=past.reduce(function(a,x){ return a+(+x.unbilled||0); },0);
  var rows=past.map(function(x){ var id=String(x.key).replace(/^blitz:/,""), d=new Date(x.date+"T12:00:00"), dis=sevOk?"":' disabled title="Buchhaltung ist gerade nicht erreichbar"';
    return '<div class="pl-bk"><div class="pl-date"><b>'+d.getDate()+'</b><span>'+esc(d.toLocaleDateString("de-AT",{month:"short"}))+'</span></div>'+
      '<div style="min-width:0"><div><b>'+esc(x.name||"Buchung")+'</b></div><div class="pl-meta"><span>'+esc(x.sub||"")+'</span></div>'+(x.last&&(x.last.state==="storniert"||x.depositOnly)?'<div class="pl-meta"><span class="invs">'+(x.depositOnly?"Anzahlung: ":"")+invLine(x.last)+'</span></div>':'')+'</div>'+
      '<div class="pl-right"><span class="pl-amt money">'+eur(x.unbilled)+'</span>'+(x.depositOnly?'<span class="tag warn">Rest offen</span>':x.paidOnPlatform?'<span class="tag ok">online bezahlt</span>':'<span class="tag warn">ohne Rechnung</span>')+
        '<div class="pl-acts">'+(x.action?'<button class="btn primary" data-act="plbinv:'+esc(id)+'"'+dis+'>Rechnung</button>':'')+
          (x.depositOnly&&A.bkshow?'<button class="btn primary" data-act="bkshow:'+esc(id)+'" title="Anzahlung verrechnet – Restrechnung im Buchungsfenster vorbereiten">Restrechnung</button>':'')+
          (x.paidOnPlatform&&x.action&&A.sdpaidinv?'<button class="btn" data-act="sdpaidinv:'+esc(x.key)+'"'+dis+' title="Rechnung anlegen und gleich als bezahlt verbuchen">Bezahlte Rechnung</button>':'')+
          (A.sdassign?'<button class="btn" data-act="sdassign:'+esc(x.key)+'" title="Einer bestehenden (Sammel-)Rechnung zuordnen">Zuordnen</button>':'')+
          (A.sdign?'<button class="btn" data-act="sdign:'+esc(x.key)+'" title="Ohne Rechnung erledigt – ausblenden">Ausblenden</button>':'')+
      '</div></div></div>'; }).join("");
  return sec("Ohne Rechnung (vergangen)",'<span class="muted">'+past.length+' Buchung'+(past.length===1?"":"en")+' · <span class="money">'+eur(sum)+'</span></span>',rows);
}
function bzBooking(id){ return ((P().blitzdings||{}).upcoming||[]).find(function(b){ return String(b.id)===String(id); }); }
function bzApply(b,paid,d){
  var bz=((d||F.D).platforms).blitzdings, r=bz.revenue=bz.revenue||{}, bk=bz.bookings=bz.bookings||{}, amt=+b.totalCents||0, was=b.paymentStatus==="PAID";
  if(was===paid) return;
  b.paymentStatus=paid?"PAID":"UNPAID";
  var s=paid?1:-1;
  r.paidCents=Math.max(0,(+r.paidCents||0)+s*amt); r.openCents=Math.max(0,(+r.openCents||0)-s*amt);
  bk.paidCount=Math.max(0,(+bk.paidCount||0)+s); bk.openCount=Math.max(0,(+bk.openCount||0)-s);
  r.thisMonthPaidCents=Math.max(0,(+r.thisMonthPaidCents||0)+s*amt);
}
function bzSetPaid(id,paid,quiet){
  var b=bzBooking(id); if(!b) return;
  var prev=b.paymentStatus, prevR=JSON.stringify(P().blitzdings.revenue||{}), prevB=JSON.stringify(P().blitzdings.bookings||{});
  bzApply(b,paid); BUSY["b"+id]=1; F.render();
  F.api("/admin/api/blitz-pay",{body:{id:b.id,paid:paid}}).then(function(j){
    delete BUSY["b"+id];
    if(!okRes(j)) throw new Error((j&&j.error)||"abgelehnt");
    pend("blitz",id,paid);
    if(!quiet) F.toast((b.customerName||"Buchung")+(paid?" als bezahlt markiert":" wieder auf offen"),false,"Rückgängig",function(){ bzSetPaid(id,!paid,true); });
    F.render(); setTimeout(function(){ F.load(true); },1500);
  }).catch(function(e){
    delete BUSY["b"+id]; b.paymentStatus=prev; P().blitzdings.revenue=JSON.parse(prevR); P().blitzdings.bookings=JSON.parse(prevB);
    F.toast("Blitzdings hat nicht gespeichert: "+(e&&e.message||"keine Verbindung"),true); F.render();
  });
}
F.action("plbpay",function(id){ var b=bzBooking(id); if(b) bzSetPaid(id,b.paymentStatus!=="PAID"); });
F.action("plbinv",function(id){
  var b=bzBooking(id), it=item("blitz:"+id); if(!b&&!(it&&it.action)) return;   /* vergangene Buchung: nur im Abgleich (Vorlage it.action) */
  if(!F.D.sev){ F.toast("Buchhaltung ist gerade nicht erreichbar",true); return; }
  b=b||{id:id};
  var day=String(b.eventDate||"").slice(0,10), extras=(b.extras||[]).map(function(e){return e&&e.name;}).filter(Boolean).join(", ");
  var to=F.blitzInvTo?F.blitzInvTo(b):{contactName:b.customerName||"",email:b.customerEmail||""};   /* Firma vor Person, Person als z. H. (blitz-kal.js) */
  var pre=it&&it.action?JSON.parse(JSON.stringify(it.action)):Object.assign({title:"Rechnung · Blitzdings-Buchung",deliveryDate:day||undefined,headText:(b.reference?"Buchung "+b.reference+" – ":"")+"vielen Dank für Ihre Buchung bei Blitzdings.",
    items:[{name:"Blitzdings "+(b.package||"Fotobox"),text:[day?"Event am "+de(day):"",b.location?"Ort: "+b.location:"",extras?"inkl. "+extras:""].filter(Boolean).join(" · "),qty:1,priceGross:c2e(b.totalCents),taxRate:20}]},to);
  if(b.customerEmail&&!pre.email) pre.email=b.customerEmail;
  /* Bug #4 behoben: Rechnung wird in der Abrechnungs-Historie vermerkt */
  var lbl=b.customerName?b.customerName+(b.reference?" · "+b.reference:""):((pre.after&&pre.after.billing&&pre.after.billing.label)||"Buchung");
  pre.after=Object.assign({},pre.after||{},{billing:{key:"blitz:"+id,label:lbl}});
  pre.onDone=function(){ loadBill(); };
  F.openInvoice(pre);
});

/* ---------- VALUERO ---------- */
function vValuero(){
  var va=P().valuero;
  if(!va) return '<div class="panel empty">Keine Verbindung zu den VALUERO-Objekten (Antonhaus, Alpinappart).</div>';
  var objs=va.objects||[], sevOk=!!F.D.sev, tOpen=0,tPaid=0,tTot=0,tRef=0;
  var cards=objs.map(function(o){
    var it=item("valuero:"+o.key)||{invoiced:0,unbilled:0,refund:0}, prov=c2e(o.provisionCents), settled=vaYear(it), open=+it.unbilled||0, refund=+it.refund||0;
    var canUndo=billRecs("valuero:"+o.key).length>0||!!it.last, busy=!!BUSY["v"+o.key];
    tOpen+=open; tPaid+=settled; tTot+=prov; tRef+=refund;
    var opened=!!F.UI.platOpen[o.key];
    var months=(o.months||[]).slice().sort(function(a,b){ return String(a.month).localeCompare(String(b.month)); });
    var mName=function(m){ var d=new Date(m+"-15T12:00:00"); return isNaN(d)?m:d.toLocaleDateString("de-AT",{month:"long",year:"numeric"}); };
    return '<div class="pl-obj"><div class="pl-objh"><button type="button" class="pl-tog" data-act="plvtog:'+esc(o.key)+'" aria-expanded="'+opened+'">'+
        '<h3><span class="pl-chev'+(opened?" on":"")+'">›</span>'+esc(o.name)+(o.ratesLabel?' <span class="tag ok">'+esc(o.ratesLabel)+'</span>':'')+'</h3>'+
        '<span class="muted">fällig '+money(open)+' · verrechnet '+money(settled)+' · gesamt '+money(prov)+(it.pending>0.005?' · laufendes Quartal '+money(it.pending):'')+(it.nextBilling?' · nächste Abrechnung '+esc(de(it.nextBilling)):'')+(refund>0.005?' · <b class="bad-t">erstatten '+money(refund)+'</b>':'')+' · '+num(o.feeBookings)+' Buchungen</span>'+
        (it.last?'<span class="invs">Letzte Rechnung: '+invLine(it.last)+'</span>':'')+
      '</button><div class="pl-acts">'+
        (open>0.005?'<button class="btn primary" data-act="plvbill:'+esc(o.key)+'"'+(busy?" disabled":"")+' title="Rechnungsentwurf für die fälligen Quartale anlegen">Verrechnen · '+money(open)+'</button>':'')+
        (it.catchupAction?'<button class="btn" data-act="vacatch:'+esc(o.key)+'"'+(busy?" disabled":"")+' title="Rechnungsentwurf für Anreisen, die nach der Abrechnung dazugekommen sind">Nachverrechnen · '+money(it.catchup)+'</button>':'')+
        (canUndo?'<button class="btn" data-act="plvundo:'+esc(o.key)+'"'+(busy?" disabled":"")+' title="Letzte Abrechnung zurücknehmen">Rückgängig</button>':'')+
      '</div></div>'+
      vaBlock(o.key,it)+
      (refund>0.005?'<div class="pl-refund">Zu viel verrechnet: <b class="money">'+eur(refund)+'</b>. Es wurde mehr verrechnet, als heute an Gebühren angefallen ist (Storno, Senkung oder später online bezahlt). Nicht „Rückgängig“ – die Rechnung bleibt gültig: Gutschrift prüfen.'+(it.last&&it.last.id?' <button class="btn" data-act="'+(/bezahlt|teil/i.test(it.last.label||"")?"fincn:":"fin:invd:")+esc(it.last.id)+'">'+(/bezahlt|teil/i.test(it.last.label||"")?"Gutschrift zu "+esc(it.last.nr||"Rechnung"):"Rechnung "+esc(it.last.nr||"")+" öffnen")+'</button>':'')+'</div>':'')+
      (opened?'<div class="pl-months"><table class="pl-tbl"><thead><tr><th>Anreisemonat</th><th class="r">Buchungen</th><th class="r">Gebühr</th></tr></thead><tbody>'+
        (months.length?months.map(function(m){ return '<tr><td>'+esc(mName(m.month))+'</td><td class="r num" data-l="Buchungen">'+num(m.bookings)+'</td><td class="r" data-l="Gebühr">'+money(c2e(m.provisionCents),"ok-t")+'</td></tr>'; }).join(""):'<tr><td colspan="3" class="empty">Keine Buchungen im Jahr.</td></tr>')+
        '</tbody></table></div>':'')+
    '</div>';
  }).join("");
  var miss=items("valuero").filter(function(x){ return x.missing; }), nl=va.notLive||[];
  return (sevOk?'':'<div class="notice"><span>Die Buchhaltung antwortet gerade nicht. „Verrechnen“ vermerkt dann nur den Betrag, ohne Rechnung.</span><button class="btn" data-act="reload">Neu laden</button></div>')+
    (miss.length?'<div class="notice"><span><b>Gebührendaten fehlen:</b> '+miss.map(function(x){ return esc(x.name)+(x.last&&x.last.nr?" (zuletzt "+esc(x.last.nr)+")":""); }).join(" · ")+' – kein Verrechnen und keine Erstattung, bis die Daten wieder da sind.</span><button class="btn" data-act="reload">Neu laden</button></div>':'')+
    (nl.length?'<div class="notice"><span><b>Auf der Partner-Plattform, aber nicht für die Abrechnung freigegeben:</b> '+nl.map(function(h){ return esc(h.name||h.key)+(h.billingStartSuggestion?" (Start-Vorschlag "+esc(h.billingStartSuggestion.slice(5,7)+"/"+h.billingStartSuggestion.slice(0,4))+")":""); }).join(" · ")+' – wird nicht verrechnet.</span></div>':'')+
    '<div class="kpis">'+
      kpi("Fällige Gebühren",'<span class="money">'+eur(tOpen)+'</span>',"abgelaufene Quartale, nach Aufenthalt",{vcls:tOpen>0.005?"warn-t":""})+
      kpi("Verrechnet "+esc(F.D.year),'<span class="money">'+eur(tPaid)+'</span>',"Rechnungen "+esc(F.D.year)+", ohne Stornos",{vcls:"ok-t"})+
      kpi("Gebühren gesamt",'<span class="money">'+eur(tTot)+'</span>',num(objs.reduce(function(a,o){return a+(+o.feeBookings||0);},0))+" Buchungen")+
      (tRef>0.005?kpi("Zu erstatten",'<span class="money">'+eur(tRef)+'</span>',"mehr verrechnet als angefallen",{vcls:"bad-t"}):kpi("Objekte",num(objs.length),"Antonhaus, Alpinappart …"))+
    '</div>'+
    quote("Verrechnet-Quote · "+eur0(Math.min(tPaid,tTot))+" von "+eur0(tTot),Math.min(tPaid,tTot),tTot)+
    sec("Gebühren je Objekt",'<span class="muted">Zeile antippen für die Monatsaufstellung</span>',objs.length?cards:'<div class="empty">Keine Gebühren im Zeitraum.</div>')+
    sec("Verrechnet vs. offen","",donut([["Verrechnet",Math.min(tPaid,tTot),"ok",'<span class="money">'+eur(Math.min(tPaid,tTot))+'</span>'],["Offen",tOpen,"warn",'<span class="money">'+eur(tOpen)+'</span>']].concat(tRef>0.005?[["Zu erstatten",tRef,"bad",'<span class="money">'+eur(tRef)+'</span>']]:[]),tTot>0?Math.round(Math.min(tPaid,tTot)/tTot*100)+" %":"–"));
}
function vaObj(key){ return ((P().valuero||{}).objects||[]).find(function(o){ return o.key===key; }); }
/* Gesperrtes Objekt (Daten fehlen, Datumsbasis, Umstellung/Freigabe/Abrechnungsbeginn offen): Hinweis + Ein-Klick-Vorschlag, dazu Hinweise ohne Aktion */
function vaBlock(key,it){
  if(!it) return "";
  var p=it.proposal, sw=BILL&&BILL.valuero&&BILL.valuero[key]&&BILL.valuero[key].switch;
  return (it.blocked?'<div class="pl-block"><span>'+esc(it.blocked)+'</span>'+(p?'<button class="btn primary" data-act="vaprop:'+esc(key)+'">'+esc(p.label||"Prüfen")+'</button>':(it.missing?'<button class="btn" data-act="reload">Neu laden</button>':''))+'</div>':'')+
    ((it.notes||[]).length?'<ul class="pl-notes">'+it.notes.map(function(n){ return '<li>'+esc(n)+'</li>'; }).join("")+'</ul>':'')+
    (sw?'<div class="muted small" style="margin:0 18px 10px">Umstellung auf Anreise bestätigt am '+esc(de(String(sw.confirmedAt||"").slice(0,10)))+' (bis '+esc(de(sw.cutoff))+' nach Eingang, '+esc(sw.invoiceNr||"RE-1272")+' bleibt bestehen) · <button class="link" data-act="vaswitchundo:'+esc(key)+'">zurücknehmen</button></div>':'');
}
function vaPost(body,msg){ BUSY["v"+body.key]=1; F.render();
  return F.api("/admin/api/billing",{body:body}).then(function(j){ delete BUSY["v"+body.key]; if(!okRes(j)){ F.toast("Nicht gespeichert: "+((j&&j.error)||"unbekannt"),true); F.render(); return; } BILL=j.billing||BILL; F.toast(msg); F.load(true); })
    .catch(function(){ delete BUSY["v"+body.key]; F.toast("Keine Verbindung zum Server",true); F.render(); }); }
/* Ein-Klick-Vorschläge (nur auf ausdrücklichen Klick; Rechnungen bleiben unverändert) */
F.action("vaprop",function(key){
  var it=item("valuero:"+key), p=it&&it.proposal; if(!p) return;
  var lines=(p.lines||[]).map(function(l){ return '<li>'+esc(l)+'</li>'; }).join("");
  if(p.op==="vastart"&&!p.start){
    F.modal('<form data-form="vastart" data-key="'+esc(key)+'" class="stackf"><div class="row-between"><h2 style="font-size:19px">Abrechnungsbeginn · '+esc(it.name||key)+'</h2>'+F.btnClose()+'</div>'+(lines?'<ul class="pl-notes" style="margin:0">'+lines+'</ul>':'')+
      '<label class="fl">Erster Anreisemonat, der verrechnet wird<input class="f" type="month" name="m" required value="'+esc(F.D.today.slice(0,7))+'"></label>'+
      '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Übernehmen</button></span></div></form>',"narrow"); return; }
  var title=p.title||(p.op==="vastart"?"Abrechnungsbeginn · "+(it.name||key):(it.name||key)+" prüfen");
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:19px">'+esc(title)+'</h2>'+F.btnClose()+'</div>'+(it.blocked?'<p class="muted" style="margin:0">'+esc(it.blocked)+'</p>':'')+(lines?'<ul class="pl-notes" style="margin:0">'+lines+'</ul>':'')+
    (p.op==="vaswitch"?'<p class="muted" style="margin:0;font-size:13px">Es wird nichts storniert und keine Rechnung geändert. Gespeichert wird nur, was je Anreisemonat schon verrechnet ist – das wird ab der nächsten Quartalsrechnung abgezogen und auf der Rechnung ausgewiesen.</p>':'')+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" data-act="vapropok:'+esc(key)+'">'+esc(p.label||"Übernehmen")+'</button></span></div></div>',"wide");
});
F.action("vapropok",function(key){
  var it=item("valuero:"+key), p=it&&it.proposal; if(!p) return; F.closeModal();
  if(p.op==="vaswitch") vaPost({op:"vaswitch",key:key},"Umstellung übernommen – ab jetzt nach Anreise");
  else if(p.op==="vaack") vaPost({op:"vaack",key:key,liveSince:p.liveSince||undefined,src:p.src||undefined},"Bestätigt – Verrechnen wieder möglich");   /* Freigabe und Quellenwechsel auf einen Klick */
  else if(p.op==="vastart") vaPost({op:"vastart",key:key,start:p.start},"Abrechnungsbeginn gespeichert");
});
F.form("vastart",function(f){ var key=f.getAttribute("data-key"), m=String(f.m.value||""); if(!/^\d{4}-\d{2}$/.test(m)) return; F.closeModal(); vaPost({op:"vastart",key:key,start:m+"-01"},"Abrechnungsbeginn gespeichert"); });
F.action("vaswitchundo",function(key){ F.confirm("Umstellung auf Anreise für "+key+" zurücknehmen? Danach gibt es bis zur erneuten Bestätigung kein Verrechnen.","Zurücknehmen",function(){ vaPost({op:"vaswitch",key:key,undo:true},"Umstellung zurückgenommen"); },true); });
F.action("vacatch",function(key){ var it=item("valuero:"+key); if(!it||!it.catchupAction) return; var pre=JSON.parse(JSON.stringify(it.catchupAction)); pre.onDone=function(){ loadBill(); }; F.openInvoice(pre); });
F.action("plvtog",function(k){ F.UI.platOpen[k]=!F.UI.platOpen[k]; F.render(); });
F.action("plvbill",function(key){
  var o=vaObj(key), it=item("valuero:"+key); if(!o) return;
  if(!it){ F.toast("Abgleich noch nicht geladen – bitte neu laden",true); return; }   /* nie die ganze Jahresprovision ohne Abgleich verrechnen */
  if(it.blocked){ F.toast(it.blocked,true); return; }
  var open=+it.unbilled||0; if(!(open>0.005)){ F.toast("Noch nichts fällig – VALUERO wird quartalsweise am 1. nach Aufenthalt verrechnet"+(it&&it.nextBilling?" (nächste Abrechnung "+de(it.nextBilling)+")":"")); return; }
  if(!F.D.sev){ F.confirm("Die Buchhaltung ist gerade nicht erreichbar. "+eur(open)+" für "+o.name+" nur als verrechnet vermerken (ohne Rechnung)?","Nur vermerken",function(){
      BUSY["v"+key]=1; F.render();
      F.api("/admin/api/billing",{body:{op:"invoice",key:"valuero:"+key,invoice:{id:"",nr:"",gross:open,date:F.D.today,label:(o.name||key)+" (ohne Rechnung)",from:it&&it.action&&it.action.after.billing.from,to:it&&it.action&&it.action.after.billing.to,src:it&&it.action&&it.action.after.billing.src,basis:it&&it.action&&it.action.after.billing.basis}}}).then(function(j){
        delete BUSY["v"+key]; if(!okRes(j)){ F.toast("Speichern fehlgeschlagen",true); F.render(); return; } F.toast(o.name+" als verrechnet vermerkt"); F.load(true);
      }).catch(function(){ delete BUSY["v"+key]; F.toast("Keine Verbindung zum Server",true); F.render(); });
    }); return; }
  var pre=it&&it.action?JSON.parse(JSON.stringify(it.action)):{title:"Rechnung · VALUERO-Gebühren",contactName:o.name||"",headText:"Vermittlungsgebühren VALUERO "+F.D.year+".",
    items:[{name:"VALUERO Vermittlungsgebühren "+F.D.year,text:(o.ratesLabel?o.ratesLabel+" · ":"")+"lt. Buchungsaufstellung",qty:1,priceGross:open,taxRate:20}],after:{billing:{key:"valuero:"+key,label:o.name||key}}};
  F.openInvoice(pre);
});
F.action("plvundo",function(key){
  var o=vaObj(key); if(!o) return;
  loadBill().then(function(){
    var recs=billRecs("valuero:"+key), last=recs[recs.length-1];
    if(!last){ F.toast("Keine Abrechnung zum Zurücknehmen gefunden",true); return; }
    if(String(last.date||"").slice(0,4)!==String(F.D.year)){ F.toast("Die letzte Abrechnung stammt aus "+String(last.date||"").slice(0,4)+". Wechsle dorthin, um sie zurückzunehmen.",true); return; }
    F.confirm("Letzte Abrechnung für "+o.name+" ("+(last.nr||"ohne Rechnung")+", "+eur(last.gross)+" vom "+de(last.date)+") zurücknehmen?"+(last.id?" Die Rechnung musst du selbst unter Finanzen › Rechnungen stornieren.":""),"Zurücknehmen",function(){
      BUSY["v"+key]=1; F.render();
      F.api("/admin/api/billing",{body:{op:"unbill",key:"valuero:"+key}}).then(function(j){
        delete BUSY["v"+key];
        if(!okRes(j)){ F.toast("Rückgängig fehlgeschlagen: "+((j&&j.error)||"unbekannt"),true); F.render(); return; }
        F.toast("Abrechnung zurückgenommen",false,last.id&&F.sevOpenInvoice?"Rechnung öffnen":null,last.id&&F.sevOpenInvoice?function(){ F.sevOpenInvoice(last.id); }:null);
        F.load(true);
      }).catch(function(){ delete BUSY["v"+key]; F.toast("Keine Verbindung zum Server",true); F.render(); });
    },true);
  });
});

/* ---------- Ansicht ---------- */
var LINKS={kochdu:["https://www.kochdu.at/admin","kochdu-Admin"],kantineur:["https://www.kantineur.at/betreiber","Betreiber-Bereich"],blitz:["https://www.blitzdings.co.at/admin","Blitzdings-Admin"]};
F.action("pltab",function(t){ var x=String(t).split("~"); t=x[0]; if(!TABS.some(function(y){return y[0]===t;})) t="ueb"; if(t==="valuero"&&x[1]) F.UI.platOpen[x[1]]=true; F.UI.plat=t; F.ls("fsc_plat_tab",t); if(F.current!=="plat") F.go("plat"); else { F.render(); window.scrollTo(0,0); }
  if(t==="blitz"&&x[1]&&F.actions.bkshow) F.actions.bkshow(x[1]); });   /* blitz~<id>: Buchung gleich öffnen */
function vPlat(){
  var tab=F.UI.plat, nc=newCounts(), p=P();
  var subnav='<nav class="subnav pl-sub" aria-label="Plattformen">'+TABS.map(function(t){ var n=nc[TAB2SEEN[t[0]]]; return '<button type="button" data-act="pltab:'+t[0]+'" aria-current="'+(t[0]===tab)+'">'+t[1]+(n?'<span class="count">'+n+'</span>':'')+'</button>'; }).join("")+'</nav>';
  var src={kochdu:p.kochdu,kantineur:p.kantineur,blitz:p.blitzdings,valuero:p.valuero}[tab];
  var right=(LINKS[tab]?ext(LINKS[tab][0],LINKS[tab][1]+" öffnen"):'')+(tab!=="ueb"&&tab!=="ski"&&tab!=="hg"?(F.actions.fin?'<button class="btn" data-act="fin:inv">Rechnungen</button>':'<button class="btn" data-go="geld">Finanzen</button>'):'');
  var subs={ueb:"Alle eigenen Produkte für "+esc(F.D.year)+" auf einen Blick.",kochdu:"Bestellplattform · Bar-Gebühren rechnet kochdu monatlich selbst ab, Online-Provisionen behält Mollie ein.",kantineur:"Vereinskasse · Abos werden automatisch abgerechnet.",blitz:"Fotobox & 360° · Verfügbarkeit, Buchungen, Zahlungen und Rechnungen.",valuero:"Vermittlungsgebühren je Objekt · Abrechnung per Rechnung.",ski:"App mit In-App-Käufen (Einmalkäufe).",hg:"Idle-Game für iOS mit Edelweiß-Paketen (Einmalkäufe)."};
  var body=tab==="kochdu"?vKochdu():tab==="kantineur"?vKantineur():tab==="blitz"?vBlitz():tab==="valuero"?vValuero():tab==="ski"?(F.skikaiserView?F.skikaiserView():'<div class="panel empty">Skikaiser-Modul fehlt.</div>'):tab==="hg"?(F.huettengaudiView?F.huettengaudiView():'<div class="panel empty">Hüttengaudi-Modul fehlt.</div>'):vUeb();
  return F.head("Plattformen",subs[tab]+(src&&src.fetchedAt?' <span class="muted">· '+esc(stamp(src.fetchedAt))+'</span>':''),right?'<div class="row wrap pl-head-r">'+right+'</div>':'')+subnav+body;
}
F.view({id:"plat",label:"Plattformen",short:"Plattf.",icon:"plat",order:70,
  count:function(){ var n=newCounts(); return (n.kochdu||0)+(n.blitz||0)+(n.valuero||0); },
  render:vPlat,
  after:function(){ var k=TAB2SEEN[F.UI.plat]; if(k&&clearSeen(k)) setTimeout(F.renderNav,0); if(F.UI.plat==="blitz"&&F.blitzKalAfter) F.blitzKalAfter(); if(!BILL) loadBill().then(function(b){ if(b&&F.current==="plat") F.render(); }); }
});

/* Schnellsuche: Restaurants, Buchungen, Objekte */
F.searcher(function(q){
  var p=P(), out=[];
  ((p.kochdu||{}).restaurants||[]).forEach(function(r){ if(String(r.name||"").toLowerCase().indexOf(q)>-1) out.push({group:"Plattformen",label:"kochdu · "+r.name,sub:"Bar offen "+eur(c2e(r.barOpenCents)),act:"pltab:kochdu~"+r.id}); });
  ((p.blitzdings||{}).upcoming||[]).forEach(function(b){ if((String(b.customerName||"")+" "+(b.reference||"")+" "+(b.package||"")+" "+(b.location||"")).toLowerCase().indexOf(q)>-1) out.push({group:"Plattformen",label:"Blitzdings · "+(b.customerName||"Buchung"),sub:de(String(b.eventDate||"").slice(0,10))+" · "+(b.package||"")+" · "+eur(c2e(b.totalCents)),act:(F.actions.bkshow?"bkshow:":"pltab:blitz~")+b.id}); });
  ((p.valuero||{}).objects||[]).forEach(function(o){ if(String(o.name||"").toLowerCase().indexOf(q)>-1) out.push({group:"Plattformen",label:"VALUERO · "+o.name,sub:num(o.feeBookings)+" Buchungen",act:"pltab:valuero~"+o.key}); });
  [["kochdu","kochdu"],["kantineur","Kantineur"],["blitzdings","Blitzdings","blitz"],["valuero","VALUERO"],["skikaiser","Skikaiser","ski"]].forEach(function(t){ if(t[0].indexOf(q)===0) out.push({group:"Plattformen",label:t[1],sub:"Plattform öffnen",act:"pltab:"+(t[2]||t[0])}); });
  if(["hüttengaudi","huettengaudi","huttengaudi"].some(function(n){ return n.indexOf(q)===0; })) out.push({group:"Plattformen",label:"Hüttengaudi",sub:"Plattform öffnen",act:"pltab:hg"});
  return out.slice(0,8);
});
})();
