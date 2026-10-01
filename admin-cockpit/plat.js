/* Ansicht "Plattformen": Überblick, kochdu, Kantineur, Blitzdings, VALUERO, Skikaiser (eigene Datei skikaiser.js).
   Verrechnen läuft über die gemeinsamen Flows: Rechnung via F.openInvoice (pre.after: billing / kochduSettle),
   Rückgängig über /admin/api/kochdu-settle bzw. /admin/api/billing {op:"unbill"}. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;

var TABS=[["ueb","Überblick"],["kochdu","kochdu"],["kantineur","Kantineur"],["blitz","Blitzdings"],["valuero","VALUERO"],["ski","Skikaiser"]];
F.UI.plat=F.UI.plat||F.ls("fsc_plat_tab")||"ueb";
if(!TABS.some(function(t){return t[0]===F.UI.plat;})) F.UI.plat="ueb";
F.UI.platOpen=F.UI.platOpen||{};          // VALUERO: aufgeklappte Monatsaufstellungen
var BILL=null;                              // /admin/api/billing (Rechnungs-Historie je Schlüssel)
var BUSY={};                                // laufende Aktionen (Doppelklick-Schutz)

F.css(
'.pl-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}'+
'.pl-card{padding:16px 18px;display:grid;gap:8px;align-content:start;text-align:left;font:inherit;color:inherit;cursor:pointer}'+
'.pl-card:hover{border-color:var(--ink-3)}'+
'.pl-card .pl-t{display:flex;justify-content:space-between;align-items:baseline;gap:8px}'+
'.pl-card h3{font-size:17px}'+
'.pl-fig{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px;font-size:13.5px}'+
'.pl-fig dt{color:var(--ink-2)} .pl-fig dd{margin:0;text-align:right;font-family:var(--f-mono);font-variant-numeric:tabular-nums}'+
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
'.pl-tbl tfoot td{font-weight:700;border-top:1px solid var(--line);background:var(--sunk)}'+
'.pl-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}'+
'.pl-donut{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:center;padding:16px 18px}'+
'.pl-donut svg{width:150px;height:150px;display:block}'+
'.pl-donut ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:13.5px}'+
'.pl-donut li{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:8px;align-items:center}'+
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
'.pl-chev.on{transform:rotate(90deg)}'+
'.pl-refund{margin:0 18px 12px;padding:10px 12px;border-radius:10px;background:var(--bad-soft);color:var(--bad);font-size:13.5px}'+
'.pl-months{padding:0 18px 14px}'+
'.pl-months table{border:1px solid var(--line);border-radius:10px;overflow:hidden}'+
'.pl-note{font-size:12.5px;color:var(--ink-3)}'+
'body.priv .kpi.pl-nopriv .v{filter:none}'+
'@media (max-width:900px){'+
  '.pl-cards{grid-template-columns:minmax(0,1fr)}'+
  '.pl-tbl thead{display:none}'+
  '.pl-tbl tr{display:block;border-bottom:1px solid var(--line);padding:8px 0}'+
  '.pl-tbl tbody tr:last-child{border-bottom:0}'+
  '.pl-tbl td{display:flex;justify-content:space-between;gap:12px;border:0;padding:4px 16px;text-align:right}'+
  '.pl-tbl td:first-child{text-align:left}'+
  '.pl-tbl td[data-l]::before{content:attr(data-l);color:var(--ink-3);font-size:12.5px;text-align:left;flex:none}'+
  '.pl-tbl td.pl-a{justify-content:flex-end}'+
  '.pl-tbl tfoot tr{display:block}'+
  '.pl-donut{grid-template-columns:minmax(0,1fr);justify-items:center}'+
  '.pl-donut ul{width:100%}'+
  '.pl-bk{grid-template-columns:50px minmax(0,1fr)}'+
  '.pl-bk .pl-right{grid-column:1/-1;justify-items:stretch;grid-template-columns:auto 1fr;align-items:center}'+
  '.pl-bk .pl-right .pl-acts{grid-column:1/-1;justify-content:flex-start}'+
  '.pl-objh{grid-template-columns:minmax(0,1fr)}'+
  '.pl-objh .pl-acts{justify-content:flex-start}'+
'}'
);

/* ---------- Hilfen ---------- */
function c2e(v){ return (+v||0)/100; }
function money(v,cls){ return '<span class="money num'+(cls?" "+cls:"")+'">'+eur(v)+'</span>'; }
function P(){ return (F.D&&F.D.platforms)||{}; }
function item(key){ return ((F.D&&F.D.abgleich&&F.D.abgleich.items)||[]).find(function(x){return x.key===key;})||null; }
function items(src){ return ((F.D&&F.D.abgleich&&F.D.abgleich.items)||[]).filter(function(x){return x.src===src;}); }
function billRecs(key){ return (BILL&&BILL.invoices&&BILL.invoices[key])||[]; }
function stamp(iso){ return iso?'Stand '+new Date(iso).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""; }
function ext(url,label){ return '<a class="btn" href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+' ↗</a>'; }
function okRes(j){ return j&&!j.error&&j.ok!==false; }
function num(n){ return (+n||0).toLocaleString("de-AT"); }
function kpi(k,v,s,opts){ opts=opts||{}; var tag=opts.act?'button':'div';
  return '<'+tag+' class="panel kpi'+(opts.cls?" "+opts.cls:"")+'"'+(opts.act?' data-act="'+opts.act+'"':'')+'><span class="k">'+k+'</span><span class="v num'+(opts.vcls?" "+opts.vcls:"")+'">'+v+'</span>'+(s?'<span class="s">'+s+'</span>':'')+'</'+tag+'>'; }
F.platKpi=kpi;
function sevTag(l){ if(!l) return ""; var m={bezahlt:"ok",offen:"warn",ueberfaellig:"bad",entwurf:"grey",fehlt:"bad",manuell:"grey",alt:"grey",neu:"info",sonst:"grey"}; return '<span class="tag '+(m[l.state]||"grey")+'">'+esc(l.label||"")+'</span>'; }
function invLine(l){
  if(!l) return '<span class="muted">noch nie</span>';
  var nr=l.id?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(l.id)+'" target="_blank" rel="noopener">'+esc(l.nr||"Entwurf")+'</a>':esc(l.nr||"ohne Rechnung");
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
      if(x){ if(x.status===100||x.status===50){ r.open+=+inv.gross||0; return; } r.paid+=+x.paid||(x.status===1000?+x.gross||0:0); r.open+=+x.open||0; }
      else r.open+=+inv.gross||0; }); });
  return r;
}
function sums(){
  var p=P(), out=[];
  if(p.kochdu){ var t=p.kochdu.totals||{}; out.push({id:"kochdu",label:"kochdu",paid:c2e(t.barSettledCents)+c2e(t.onlineProvisionCents),open:c2e(t.barOpenCents),note:"Bar verrechnet + Online-Provision"}); }
  if(p.kantineur) out.push({id:"kantineur",label:"Kantineur",paid:c2e(p.kantineur.revenueGrossCents),open:0,note:"Abos laufen automatisch"});
  if(p.blitzdings){ var r=p.blitzdings.revenue||{}; out.push({id:"blitz",label:"Blitzdings",paid:c2e(r.paidCents),open:c2e(r.openCents),note:"laut Blitzdings"}); }
  if(p.valuero){ var v=items("valuero"); out.push({id:"valuero",label:"VALUERO",paid:v.reduce(function(a,x){return a+(+x.invoiced||0);},0),open:v.reduce(function(a,x){return a+(+x.unbilled||0);},0),refund:v.reduce(function(a,x){return a+(+x.refund||0);},0),note:"verrechnet "+F.D.year}); }
  var ski=F.D.skikaiser; if(ski&&ski.configured&&ski.totals) out.push({id:"ski",label:"Skikaiser",paid:c2e(ski.totals.proceedsCents),open:0,note:"Erlös nach Store-Gebühr"});
  return out;
}

/* ---------- Überblick ---------- */
function vUeb(){
  var p=P(), s=sums(), fsc=fscRevenue(), nc=newCounts();
  var paidAll=s.reduce(function(a,x){return a+x.paid;},0)+(fsc?fsc.paid:0), openAll=s.reduce(function(a,x){return a+x.open;},0)+(fsc?fsc.open:0);
  var refund=(s.find(function(x){return x.id==="valuero";})||{}).refund||0;
  var ka=p.kantineur, ski=F.D.skikaiser;
  var card=function(id,title,sub,figs,extra){ return '<button class="panel pl-card" data-act="pltab:'+id+'"><div class="pl-t"><h3>'+title+'</h3><span class="muted">'+sub+'</span></div><dl class="pl-fig">'+figs.map(function(f){ return '<dt>'+f[0]+'</dt><dd'+(f[2]?' class="'+f[2]+'"':'')+'>'+f[1]+'</dd>'; }).join("")+'</dl>'+(extra||"")+'</button>'; };
  var off=function(n){ return '<div class="muted">Keine Verbindung zu '+n+'.</div>'; };
  var badge=function(k){ return nc[k]?'<span class="tag glow">'+nc[k]+' neu</span>':''; };
  var ko=p.kochdu, kt=ko&&ko.totals||{}, bz=p.blitzdings, br=bz&&bz.revenue||{}, va=items("valuero");
  var cards=
    (ko?card("kochdu","kochdu",'Bestellplattform '+badge("kochdu"),[["Bezahlt",money(c2e(kt.barSettledCents)+c2e(kt.onlineProvisionCents))],["Bar-Gebühren offen",money(c2e(kt.barOpenCents),kt.barOpenCents>0?"warn-t":""),""],["Restaurants",num((ko.restaurants||[]).length)]]):'<div class="panel pl-card"><h3>kochdu</h3>'+off("kochdu")+'</div>')+
    (ka?card("kantineur","Kantineur","Vereinskasse",[["Eingenommen",money(c2e(ka.revenueGrossCents))],["MRR",money(c2e(ka.mrrCents))],["Aktive Abos",num((ka.subscribers||{}).active)]]):'<div class="panel pl-card"><h3>Kantineur</h3>'+off("Kantineur")+'</div>')+
    (bz?card("blitz","Blitzdings",'Fotobox &amp; 360° '+badge("blitz"),[["Bezahlt",money(c2e(br.paidCents))],["Offen",money(c2e(br.openCents),br.openCents>0?"warn-t":"")],["Anstehend",num((bz.bookings||{}).upcomingCount!=null?bz.bookings.upcomingCount:(bz.upcoming||[]).length)]]):'<div class="panel pl-card"><h3>Blitzdings</h3>'+off("Blitzdings")+'</div>')+
    (p.valuero?card("valuero","VALUERO",'Tourismus &amp; Hosting '+badge("valuero"),[["Verrechnet "+esc(F.D.year),money(va.reduce(function(a,x){return a+x.invoiced;},0))],["Offen",money(va.reduce(function(a,x){return a+x.unbilled;},0),"warn-t")]].concat(refund>0.005?[["Zu erstatten",money(refund,"bad-t")]]:[])):'<div class="panel pl-card"><h3>VALUERO</h3>'+off("den VALUERO-Objekten")+'</div>')+
    (fsc?'<button class="panel pl-card" data-go="web"><div class="pl-t"><h3>FS Creative</h3><span class="muted">Websites</span></div><dl class="pl-fig"><dt>Bezahlt</dt><dd>'+money(fsc.paid)+'</dd><dt>Offen</dt><dd>'+money(fsc.open,fsc.open>0.005?"warn-t":"")+'</dd></dl><span class="pl-note">Hosting, Domains &amp; Mail '+esc(F.D.year)+'</span></button>':'')+
    (ski&&ski.configured&&ski.totals?card("ski","Skikaiser","In-App-Käufe",[["Erlös",money(c2e(ski.totals.proceedsCents))],["Käufe",num(ski.totals.count)]]):card("ski","Skikaiser","In-App-Käufe",[],'<span class="pl-note">'+(ski&&ski.configured?"Statistik antwortet gerade nicht.":"Noch nicht verbunden. Hier steht, was die App liefern muss.")+'</span>'));
  var rows=s.filter(function(x){return x.id!=="ski";}).map(function(x){ return {label:x.label,right:'<span class="money">'+eur0(x.paid)+' bezahlt'+(x.open>0.005?' · '+eur0(x.open)+' offen':'')+'</span>',parts:[[x.paid,"a","Bezahlt "+eur(x.paid)],[x.open,"b","Offen "+eur(x.open)]]}; });
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
    var last=it&&it.last?invLine(it.last):(r.lastSettledAt?'<span>'+de(String(r.lastSettledAt).slice(0,10))+' <span class="tag grey">ohne Rechnung</span></span>':'<span class="muted">noch nie</span>');
    var acts=(ro>0.005?'<button class="btn primary" data-act="plkbill:'+esc(r.id)+'"'+(BUSY["k"+r.id]?" disabled":"")+' title="'+(sevOk?"Rechnung in sevDesk anlegen und als verrechnet markieren":"sevDesk nicht erreichbar – nur als verrechnet markieren")+'">Verrechnen · '+money(ro)+'</button>':'')+
      (rp>0.005?'<button class="btn" data-act="plkundo:'+esc(r.id)+'"'+(BUSY["k"+r.id]?" disabled":"")+' title="Verrechnung zurücknehmen">↺ Rückgängig</button>':'')+
      (ro<=0.005&&rp<=0.005?'<span class="muted">—</span>':'');
    return '<tr><td><b>'+esc(r.name||"—")+'</b>'+(r.provisionRatePct!=null?' <span class="muted">· '+esc(r.provisionRatePct)+' %</span>':'')+'</td>'+
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
  return (sevOk?'':'<div class="notice"><span>sevDesk antwortet gerade nicht. „Verrechnen“ markiert dann nur als verrechnet, ohne Rechnung.</span><button class="btn" data-act="reload">Neu laden</button></div>')+
    '<div class="kpis">'+
      kpi("Bestellungen",num((+bo||0)+(+oo||0)),num(bo)+" bar · "+num(oo)+" online")+
      kpi("Bar-Gebühren offen",'<span class="money">'+eur(open)+'</span>',"verrechnest du selbst",{vcls:open>0.005?"warn-t":""})+
      kpi("Bar-Gebühren verrechnet",'<span class="money">'+eur(settled)+'</span>',"bereits abgerechnet",{vcls:"ok-t"})+
      kpi("Online-Gebühren",'<span class="money">'+eur(online)+'</span>',"automatisch einbehalten")+
    '</div>'+
    quote("Verrechnet-Quote Bar-Gebühren · "+eur0(settled)+" von "+eur0(settled+open),settled,settled+open)+
    sec("Gebühren pro Restaurant",'<span class="muted">Bar = du verrechnest · Online = automatisch</span>',
      rs.length?'<table class="pl-tbl"><thead><tr><th>Restaurant</th><th class="r">Best. bar / online</th><th class="r">Bar offen</th><th class="r">Bar verrechnet</th><th class="r">Online</th><th>Letzte Abrechnung</th><th></th></tr></thead><tbody>'+body+'</tbody>'+
        '<tfoot><tr><td>Gesamt</td><td class="r num" data-l="Bestellungen">'+num(bo)+' / '+num(oo)+'</td><td class="r" data-l="Bar offen">'+money(open,"warn-t")+'</td><td class="r" data-l="Bar verrechnet">'+money(settled,"ok-t")+'</td><td class="r" data-l="Online">'+money(online)+'</td><td></td><td></td></tr></tfoot></table>'
        :'<div class="empty">Keine aktiven Restaurants mit Umsätzen im Zeitraum.</div>')+
    (chartRows.length?sec("Bar-Gebühren je Restaurant","",hbars(chartRows,[["Verrechnet","ok"],["Offen","warn"]])):'')+
    sec("App-Statistiken",'<span class="muted">Installationen = registrierte Geräte (Push) · Store-Downloads nur in App Store / Play Console</span>',
      hasApp?'<div class="panel-b"><div class="kpis">'+
        kpi("Registrierte Kunden",num(kunden),(n.web!=null?"davon Web/Desktop "+num(n.web):"")+(n.gesamt!=null?" · inkl. Team "+num(n.gesamt):""),{cls:"pl-nopriv"})+
        kpi("App-Nutzer iOS",n.apple!=null?num(n.apple):"—","registrierte Geräte",{cls:"pl-nopriv"})+
        kpi("App-Nutzer Android",n.android!=null?num(n.android):"—","registrierte Geräte",{cls:"pl-nopriv"})+
        kpi("App-Nutzer gesamt",(n.apple!=null||n.android!=null)?num(appTotal):"—","iOS + Android",{cls:"pl-nopriv"})+
      '</div></div>':'<div class="empty">kochdu liefert noch keine App-Statistik.</div>');
}
function kochduRest(id){ return ((P().kochdu||{}).restaurants||[]).find(function(r){ return String(r.id)===String(id); }); }
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
  if(!F.D.sev){ F.confirm("sevDesk ist gerade nicht erreichbar. "+r.name+" nur als verrechnet markieren (ohne Rechnung)?","Nur markieren",function(){ kochduSettleOnly(r); }); return; }
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
    var txt="Verrechnung für "+(r.name||"Restaurant")+" zurücknehmen? Die Bar-Gebühren gelten in kochdu dann wieder als offen."+(belongs?" Die zugehörige Rechnung "+(last.nr||"")+" wird aus der Abrechnungs-Historie entfernt – in sevDesk musst du sie selbst stornieren oder löschen.":"");
    F.confirm(txt,"Zurücknehmen",function(){
      BUSY["k"+r.id]=1; F.render();
      F.api("/admin/api/kochdu-settle",{body:{action:"unsettle",restaurantId:r.id}}).then(function(j){
        if(!okRes(j)) throw new Error((j&&j.error)||"kochdu hat abgelehnt");
        pend("kochdu",r.id,"unsettle");
        return belongs?F.api("/admin/api/billing",{body:{op:"unbill",key:"kochdu:"+r.id}}).then(function(b){ return {unbilled:okRes(b)}; }):{unbilled:false};
      }).then(function(res){
        delete BUSY["k"+r.id];
        if(belongs&&!res.unbilled) F.toast("kochdu zurückgesetzt, aber der Rechnungs-Eintrag konnte nicht entfernt werden",true);
        else F.toast("Verrechnung zurückgenommen"+(belongs&&last.id?" – Rechnung "+(last.nr||"")+" in sevDesk prüfen":""),false,belongs&&last.id?"In sevDesk öffnen":null,belongs&&last.id?function(){ window.open(F.SEVURL+"/fi/detail/type/RE/id/"+encodeURIComponent(last.id),"_blank","noopener"); }:null);
        F.load(true);
      }).catch(function(e){ delete BUSY["k"+r.id]; F.toast("Rückgängig fehlgeschlagen: "+(e&&e.message||"keine Verbindung"),true); F.render(); });
    },true);
  });
});

/* ---------- Kantineur ---------- */
var KA_PLANS={KANTINEUR:{label:"Kantineur",price:9},MAGAZINEUR:{label:"Magazineur",price:14.9}};
var KA_STATUS={ACTIVE:["aktiv","ok"],TRIAL:["Testphase","info"],PAUSED:["pausiert","warn"],INACTIVE:["inaktiv","grey"],CANCELLED:["gekündigt","bad"],CANCELED:["gekündigt","bad"],EXPIRED:["abgelaufen","grey"],PENDING:["ausstehend","warn"]};
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
  return '<div class="kpis">'+
      kpi("Umsatz diesen Monat",'<span class="money">'+eur(c2e(k.thisMonthGrossCents))+'</span>',"automatisch über die Plattform",{vcls:"ok-t"})+
      kpi("Aktive Abos",num(sub.active),num(sub.paying)+" zahlend · "+num(spon)+" gesponsert")+
      kpi("Umsatz / Monat (MRR)",'<span class="money">'+eur(mrr)+'</span>','<span class="money">'+eur(mrr*12)+'</span> pro Jahr'+(spon?" · "+spon+"× Gutschein gratis":""),{vcls:"ok-t"})+
      kpi("Eingenommen "+esc(F.D.year),'<span class="money">'+eur(c2e(k.revenueGrossCents))+'</span>',k.revenueNetCents?'netto <span class="money">'+eur(c2e(k.revenueNetCents))+'</span>':"brutto, fließt in die Gesamt-Einnahmen")+
    '</div>'+
    '<div class="two">'+
      sec("Abo-Varianten",'<span class="muted">Umsatz effektiv, Gutscheine eingerechnet</span>',
        '<table class="pl-tbl"><thead><tr><th>Variante</th><th class="r">Listenpreis</th><th class="r">Aktiv</th><th class="r">Zahlend</th><th class="r">Umsatz / Monat</th></tr></thead><tbody>'+
        plans.map(function(p){ return '<tr><td><b>'+esc(p.label)+'</b>'+(p.sponsored?' <span class="muted">· '+p.sponsored+' gesponsert</span>':'')+'</td><td class="r" data-l="Listenpreis">'+(p.price!=null?money(p.price):'<span class="muted">—</span>')+'</td><td class="r num" data-l="Aktiv">'+num(p.active)+'</td><td class="r num" data-l="Zahlend">'+num(p.paying)+'</td><td class="r" data-l="Umsatz / Monat">'+money(p.mrr)+'</td></tr>'; }).join("")+
        '</tbody><tfoot><tr><td>Gesamt</td><td></td><td class="r num" data-l="Aktiv">'+num(sumA)+'</td><td class="r num" data-l="Zahlend">'+num(sumP)+'</td><td class="r" data-l="Umsatz / Monat">'+money(mrr,"ok-t")+'</td></tr></tfoot></table>')+
      sec("Abo-Verteilung","",sumA?donut(plans.filter(function(p){return p.active>0;}).map(function(p,i){ return [p.label,p.active,["info","glow","ok","warn"][i%4],num(p.active)+" Abos"]; }),num(sumA)):'<div class="empty">Noch keine aktiven Abos.</div>')+
    '</div>'+
    sec("Kantinen nach Status",'<span class="muted">'+num((k.canteens||{}).total)+' registriert</span>',
      stRows.length?hbars(stRows.map(function(s,i){ var m=KA_STATUS[s]||[s.toLowerCase(),"grey"]; return {label:m[0].charAt(0).toUpperCase()+m[0].slice(1),right:num(cs[s])+(cs[s]===1?" Kantine":" Kantinen"),parts:[[+cs[s],{ok:"a",warn:"b",info:"c"}[m[1]]||"d",m[0]]]}; })):'<div class="empty">Keine Status-Aufteilung verfügbar.</div>')+
    '<p class="pl-note">Kantineur rechnet die Abos selbst ab. Hier ist nichts zu verrechnen. '+esc(stamp(k.fetchedAt))+'</p>';
}

/* ---------- Blitzdings ---------- */
function bzPayTag(b){ return b.paymentStatus==="PAID"?'<span class="tag ok">bezahlt</span>':b.paymentStatus==="REFUNDED"?'<span class="tag grey">erstattet</span>':'<span class="tag warn">offen</span>'; }
function vBlitz(){
  var bz=P().blitzdings;
  if(!bz) return '<div class="panel empty">Keine Verbindung zu Blitzdings. Prüfe BLITZDINGS_STATS_URL und BLITZDINGS_STATS_TOKEN in Railway.</div>';
  var r=bz.revenue||{}, bk=bz.bookings||{}, ups=(bz.upcoming||[]).slice().sort(function(a,b){ return String(a.eventDate||"").localeCompare(String(b.eventDate||"")); });
  var sevOk=!!F.D.sev;
  var list=ups.map(function(b){
    var d=b.eventDate?new Date(String(b.eventDate).slice(0,10)+"T12:00:00"):null, day=String(b.eventDate||"").slice(0,10);
    var end=b.eventEndDate&&String(b.eventEndDate).slice(0,10)!==day?" – "+deShort(b.eventEndDate):"";
    var it=item("blitz:"+b.id), recs=billRecs("blitz:"+b.id), rec=recs[recs.length-1];
    var inv="";
    if(it&&it.last) inv='<span class="invs">'+invLine(it.last)+'</span>';
    else if(rec) inv='<span>'+(rec.id?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(rec.id)+'" target="_blank" rel="noopener">'+esc(rec.nr||"Entwurf")+'</a>':esc(rec.nr||"Rechnung"))+' <span class="tag info">angelegt '+deShort(rec.date)+'</span></span>';
    var canInv=!inv&&+b.totalCents>0;
    var paid=b.paymentStatus==="PAID";
    return '<div class="pl-bk"><div class="pl-date"><b>'+(d?d.getDate():"–")+'</b><span>'+(d?esc(d.toLocaleDateString("de-AT",{month:"short"})):"")+'</span></div>'+
      '<div style="min-width:0"><div><b>'+esc(b.package||"Buchung")+'</b>'+(b.reference?' <span class="tag grey">'+esc(b.reference)+'</span>':'')+'</div>'+
        '<div class="pl-meta"><span>'+esc(b.customerName||"—")+'</span>'+(b.location?'<span>'+esc(b.location)+'</span>':'')+(b.customerPhone?'<a href="tel:'+esc(String(b.customerPhone).replace(/[^\d+]/g,""))+'">'+esc(b.customerPhone)+'</a>':'')+(b.customerEmail?'<span>'+esc(b.customerEmail)+'</span>':'')+'<span>'+(d?esc(d.toLocaleDateString("de-AT",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"})):"")+esc(end)+'</span></div>'+
        ((b.extras||[]).length?'<div class="pl-meta">+ '+esc(b.extras.map(function(e){return e&&e.name;}).filter(Boolean).join(", "))+'</div>':'')+
      '</div>'+
      '<div class="pl-right"><span class="pl-amt money">'+eur(c2e(b.totalCents))+'</span>'+bzPayTag(b)+
        '<div class="pl-acts">'+inv+
          (canInv?'<button class="btn" data-act="plbinv:'+esc(b.id)+'"'+(sevOk?'':' disabled title="sevDesk ist gerade nicht erreichbar"')+'>Rechnung</button>':'')+
          '<button class="btn'+(paid?"":" primary")+'" data-act="plbpay:'+esc(b.id)+'"'+(BUSY["b"+b.id]?" disabled":"")+'>'+(paid?"↺ Auf offen":"Als bezahlt")+'</button>'+
        '</div></div></div>';
  }).join("");
  return '<div class="kpis">'+
      kpi("Bezahlt",'<span class="money">'+eur(c2e(r.paidCents))+'</span>',num(bk.paidCount)+" bezahlte Buchungen",{vcls:"ok-t"})+
      kpi("Offen",'<span class="money">'+eur(c2e(r.openCents))+'</span>',num(bk.openCount)+" offen",{vcls:r.openCents>0?"warn-t":""})+
      kpi("Anstehende Termine",num(bk.upcomingCount!=null?bk.upcomingCount:ups.length),"ab heute")+
      kpi("Diesen Monat bezahlt",'<span class="money">'+eur(c2e(r.thisMonthPaidCents))+'</span>',r.refundedCents?'<span class="money">'+eur(c2e(r.refundedCents))+'</span> erstattet':"seit Monatsanfang")+
    '</div>'+
    sec("Nächste Termine",'<span class="muted">„Als bezahlt“ wird direkt in Blitzdings gespeichert</span>',ups.length?list:'<div class="empty">Keine anstehenden Termine.</div>')+
    sec("Bezahlt vs. offen",'<span class="muted">'+esc(F.D.year)+'</span>',donut([["Bezahlt",c2e(r.paidCents),"ok",'<span class="money">'+eur(c2e(r.paidCents))+'</span>'],["Offen",c2e(r.openCents),"warn",'<span class="money">'+eur(c2e(r.openCents))+'</span>']].concat(r.refundedCents?[["Erstattet",c2e(r.refundedCents),"ink-3",'<span class="money">'+eur(c2e(r.refundedCents))+'</span>']]:[]),num((+bk.paidCount||0)+(+bk.openCount||0))))+
    '<p class="pl-note">'+esc(stamp(bz.fetchedAt))+'</p>';
}
function bzBooking(id){ return ((P().blitzdings||{}).upcoming||[]).find(function(b){ return String(b.id)===String(id); }); }
function bzApply(b,paid,d){
  var bz=((d||F.D).platforms).blitzdings, r=bz.revenue=bz.revenue||{}, bk=bz.bookings=bz.bookings||{}, amt=+b.totalCents||0, was=b.paymentStatus==="PAID";
  if(was===paid) return;
  b.paymentStatus=paid?"PAID":"UNPAID";
  var s=paid?1:-1;
  r.paidCents=Math.max(0,(+r.paidCents||0)+s*amt); r.openCents=Math.max(0,(+r.openCents||0)-s*amt);
  bk.paidCount=Math.max(0,(+bk.paidCount||0)+s); bk.openCount=Math.max(0,(+bk.openCount||0)-s);
  var mk=(d||F.D).today.slice(0,7); if(paid&&String(b.eventDate||"").slice(0,7)<=mk) r.thisMonthPaidCents=(+r.thisMonthPaidCents||0)+amt;
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
  var b=bzBooking(id); if(!b) return;
  if(!F.D.sev){ F.toast("sevDesk ist gerade nicht erreichbar",true); return; }
  var it=item("blitz:"+b.id), day=String(b.eventDate||"").slice(0,10), extras=(b.extras||[]).map(function(e){return e&&e.name;}).filter(Boolean).join(", ");
  var pre=it&&it.action?JSON.parse(JSON.stringify(it.action)):{title:"Rechnung · Blitzdings-Buchung",contactName:b.customerName||"",deliveryDate:day||undefined,headText:(b.reference?"Buchung "+b.reference+" – ":"")+"vielen Dank für Ihre Buchung bei Blitzdings.",
    items:[{name:"Blitzdings "+(b.package||"Fotobox"),text:[day?"Event am "+de(day):"",b.location?"Ort: "+b.location:"",extras?"inkl. "+extras:""].filter(Boolean).join(" · "),qty:1,priceGross:c2e(b.totalCents),taxRate:20}]};
  if(b.customerEmail&&!pre.email) pre.email=b.customerEmail;
  /* Bug #4 behoben: Rechnung wird in der Abrechnungs-Historie vermerkt */
  pre.after=Object.assign({},pre.after||{},{billing:{key:"blitz:"+b.id,label:(b.customerName||"Buchung")+(b.reference?" · "+b.reference:"")}});
  pre.onDone=function(){ loadBill(); };
  F.openInvoice(pre);
});

/* ---------- VALUERO ---------- */
function vValuero(){
  var va=P().valuero;
  if(!va) return '<div class="panel empty">Keine Verbindung zu den VALUERO-Objekten (Antonhaus, Alpinappart).</div>';
  var objs=va.objects||[], sevOk=!!F.D.sev, tOpen=0,tPaid=0,tTot=0,tRef=0;
  var cards=objs.map(function(o){
    var it=item("valuero:"+o.key)||{invoiced:0,unbilled:c2e(o.provisionCents),refund:0}, prov=c2e(o.provisionCents), settled=+it.invoiced||0, open=+it.unbilled||0, refund=+it.refund||0;
    tOpen+=open; tPaid+=settled; tTot+=prov; tRef+=refund;
    var opened=!!F.UI.platOpen[o.key];
    var months=(o.months||[]).slice().sort(function(a,b){ return String(a.month).localeCompare(String(b.month)); });
    var mName=function(m){ var d=new Date(m+"-15T12:00:00"); return isNaN(d)?m:d.toLocaleDateString("de-AT",{month:"long",year:"numeric"}); };
    return '<div class="pl-obj"><div class="pl-objh"><button type="button" class="pl-tog" data-act="plvtog:'+esc(o.key)+'" aria-expanded="'+opened+'">'+
        '<h3><span class="pl-chev'+(opened?" on":"")+'">›</span>'+esc(o.name)+(o.ratesLabel?' <span class="tag ok">'+esc(o.ratesLabel)+'</span>':'')+'</h3>'+
        '<span class="muted">offen '+money(open)+' · verrechnet '+money(settled)+' · gesamt '+money(prov)+(refund>0.005?' · <b class="bad-t">erstatten '+money(refund)+'</b>':'')+' · '+num(o.feeBookings)+' Buchungen</span>'+
        (it.last?'<span class="invs">Letzte Rechnung: '+invLine(it.last)+'</span>':'')+
      '</button><div class="pl-acts">'+
        (open>0.005?'<button class="btn primary" data-act="plvbill:'+esc(o.key)+'"'+(BUSY["v"+o.key]?" disabled":"")+' title="'+(sevOk?"Rechnung in sevDesk anlegen":"sevDesk nicht erreichbar – nur als verrechnet markieren")+'">Verrechnen · '+money(open)+'</button>':'')+
        (settled>0.005?'<button class="btn" data-act="plvundo:'+esc(o.key)+'"'+(BUSY["v"+o.key]?" disabled":"")+'>↺ Rückgängig</button>':'')+
      '</div></div>'+
      (refund>0.005?'<div class="pl-refund">Zu erstatten: <b class="money">'+eur(refund)+'</b>. Es wurde mehr verrechnet als aktuell an Gebühren angefallen ist (Storno nach der Abrechnung). Mit „Rückgängig“ die letzte Abrechnung zurücknehmen und neu verrechnen.</div>':'')+
      (opened?'<div class="pl-months"><table class="pl-tbl"><thead><tr><th>Buchungsmonat</th><th class="r">Buchungen</th><th class="r">Gebühr</th></tr></thead><tbody>'+
        (months.length?months.map(function(m){ return '<tr><td>'+esc(mName(m.month))+'</td><td class="r num" data-l="Buchungen">'+num(m.bookings)+'</td><td class="r" data-l="Gebühr">'+money(c2e(m.provisionCents),"ok-t")+'</td></tr>'; }).join(""):'<tr><td colspan="3" class="empty">Keine Buchungen im Jahr.</td></tr>')+
        '</tbody></table></div>':'')+
    '</div>';
  }).join("");
  return (sevOk?'':'<div class="notice"><span>sevDesk antwortet gerade nicht. „Verrechnen“ vermerkt dann nur den Betrag, ohne Rechnung.</span><button class="btn" data-act="reload">Neu laden</button></div>')+
    '<div class="kpis">'+
      kpi("Offene Gebühren",'<span class="money">'+eur(tOpen)+'</span>',"noch nicht verrechnet",{vcls:tOpen>0.005?"warn-t":""})+
      kpi("Verrechnet "+esc(F.D.year),'<span class="money">'+eur(tPaid)+'</span>',"laut Abrechnungs-Historie",{vcls:"ok-t"})+
      kpi("Gebühren gesamt",'<span class="money">'+eur(tTot)+'</span>',num(objs.reduce(function(a,o){return a+(+o.feeBookings||0);},0))+" Buchungen")+
      (tRef>0.005?kpi("Zu erstatten",'<span class="money">'+eur(tRef)+'</span>',"mehr verrechnet als angefallen",{vcls:"bad-t"}):kpi("Objekte",num(objs.length),"Antonhaus, Alpinappart …"))+
    '</div>'+
    quote("Verrechnet-Quote · "+eur0(Math.min(tPaid,tTot))+" von "+eur0(tTot),Math.min(tPaid,tTot),tTot)+
    sec("Gebühren je Objekt",'<span class="muted">Zeile antippen für die Monatsaufstellung</span>',objs.length?cards:'<div class="empty">Keine Gebühren im Zeitraum.</div>')+
    sec("Verrechnet vs. offen","",donut([["Verrechnet",Math.min(tPaid,tTot),"ok",'<span class="money">'+eur(Math.min(tPaid,tTot))+'</span>'],["Offen",tOpen,"warn",'<span class="money">'+eur(tOpen)+'</span>']].concat(tRef>0.005?[["Zu erstatten",tRef,"bad",'<span class="money">'+eur(tRef)+'</span>']]:[]),tTot>0?Math.round(Math.min(tPaid,tTot)/tTot*100)+" %":"–"));
}
function vaObj(key){ return ((P().valuero||{}).objects||[]).find(function(o){ return o.key===key; }); }
F.action("plvtog",function(k){ F.UI.platOpen[k]=!F.UI.platOpen[k]; F.render(); });
F.action("plvbill",function(key){
  var o=vaObj(key), it=item("valuero:"+key); if(!o) return;
  var open=it?+it.unbilled||0:c2e(o.provisionCents); if(!(open>0.005)) return;
  if(!F.D.sev){ F.confirm("sevDesk ist gerade nicht erreichbar. "+eur(open)+" für "+o.name+" nur als verrechnet vermerken (ohne Rechnung)?","Nur vermerken",function(){
      BUSY["v"+key]=1; F.render();
      F.api("/admin/api/billing",{body:{op:"invoice",key:"valuero:"+key,invoice:{id:"",nr:"",gross:open,date:F.D.today,label:(o.name||key)+" (ohne Rechnung)"}}}).then(function(j){
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
    F.confirm("Letzte Abrechnung für "+o.name+" ("+(last.nr||"ohne Rechnung")+", "+eur(last.gross)+" vom "+de(last.date)+") zurücknehmen?"+(last.id?" In sevDesk musst du die Rechnung selbst stornieren oder löschen.":""),"Zurücknehmen",function(){
      BUSY["v"+key]=1; F.render();
      F.api("/admin/api/billing",{body:{op:"unbill",key:"valuero:"+key}}).then(function(j){
        delete BUSY["v"+key];
        if(!okRes(j)){ F.toast("Rückgängig fehlgeschlagen: "+((j&&j.error)||"unbekannt"),true); F.render(); return; }
        F.toast("Abrechnung zurückgenommen",false,last.id?"In sevDesk öffnen":null,last.id?function(){ window.open(F.SEVURL+"/fi/detail/type/RE/id/"+encodeURIComponent(last.id),"_blank","noopener"); }:null);
        F.load(true);
      }).catch(function(){ delete BUSY["v"+key]; F.toast("Keine Verbindung zum Server",true); F.render(); });
    },true);
  });
});

/* ---------- Ansicht ---------- */
var LINKS={kochdu:["https://www.kochdu.at/admin","kochdu-Admin"],kantineur:["https://www.kantineur.at/betreiber","Betreiber-Bereich"],blitz:["https://www.blitzdings.co.at/admin","Blitzdings-Admin"]};
F.action("pltab",function(t){ var x=String(t).split("~"); t=x[0]; if(!TABS.some(function(y){return y[0]===t;})) t="ueb"; if(t==="valuero"&&x[1]) F.UI.platOpen[x[1]]=true; F.UI.plat=t; F.ls("fsc_plat_tab",t); if(F.current!=="plat") F.go("plat"); else { F.render(); window.scrollTo(0,0); } });
function vPlat(){
  var tab=F.UI.plat, nc=newCounts(), p=P();
  var subnav='<nav class="subnav pl-sub" aria-label="Plattformen">'+TABS.map(function(t){ var n=nc[TAB2SEEN[t[0]]]; return '<button type="button" data-act="pltab:'+t[0]+'" aria-current="'+(t[0]===tab)+'">'+t[1]+(n?'<span class="count">'+n+'</span>':'')+'</button>'; }).join("")+'</nav>';
  var src={kochdu:p.kochdu,kantineur:p.kantineur,blitz:p.blitzdings,valuero:p.valuero}[tab];
  var right=(LINKS[tab]?ext(LINKS[tab][0],LINKS[tab][1]+" öffnen"):'')+(tab!=="ueb"&&tab!=="ski"?'<button class="btn" data-go="geld">Abgleich</button>':'');
  var subs={ueb:"Alle eigenen Produkte für "+esc(F.D.year)+" auf einen Blick.",kochdu:"Bestellplattform · Bar-Gebühren verrechnest du, Online-Provisionen laufen automatisch.",kantineur:"Vereinskasse · Abos werden automatisch abgerechnet.",blitz:"Fotobox & 360° · Buchungen, Zahlungen und Rechnungen.",valuero:"Vermittlungsgebühren je Objekt · Abrechnung über sevDesk.",ski:"App mit In-App-Käufen (Einmalkäufe)."};
  var body=tab==="kochdu"?vKochdu():tab==="kantineur"?vKantineur():tab==="blitz"?vBlitz():tab==="valuero"?vValuero():tab==="ski"?(F.skikaiserView?F.skikaiserView():'<div class="panel empty">Skikaiser-Modul fehlt.</div>'):vUeb();
  return F.head("Plattformen",subs[tab]+(src&&src.fetchedAt?' <span class="muted">· '+esc(stamp(src.fetchedAt))+'</span>':''),right?'<div class="row wrap pl-head-r">'+right+'</div>':'')+subnav+body;
}
F.view({id:"plat",label:"Plattformen",short:"Plattf.",icon:"plat",order:70,
  count:function(){ var n=newCounts(); return (n.kochdu||0)+(n.blitz||0)+(n.valuero||0); },
  render:vPlat,
  after:function(){ var k=TAB2SEEN[F.UI.plat]; if(k&&clearSeen(k)) setTimeout(F.renderNav,0); if(!BILL) loadBill().then(function(b){ if(b&&F.current==="plat") F.render(); }); }
});

/* Schnellsuche: Restaurants, Buchungen, Objekte */
F.searcher(function(q){
  var p=P(), out=[];
  ((p.kochdu||{}).restaurants||[]).forEach(function(r){ if(String(r.name||"").toLowerCase().indexOf(q)>-1) out.push({group:"Plattformen",label:"kochdu · "+r.name,sub:"Bar offen "+eur(c2e(r.barOpenCents)),act:"pltab:kochdu~"+r.id}); });
  ((p.blitzdings||{}).upcoming||[]).forEach(function(b){ if((String(b.customerName||"")+" "+(b.reference||"")+" "+(b.package||"")+" "+(b.location||"")).toLowerCase().indexOf(q)>-1) out.push({group:"Plattformen",label:"Blitzdings · "+(b.customerName||"Buchung"),sub:de(String(b.eventDate||"").slice(0,10))+" · "+(b.package||"")+" · "+eur(c2e(b.totalCents)),act:"pltab:blitz~"+b.id}); });
  ((p.valuero||{}).objects||[]).forEach(function(o){ if(String(o.name||"").toLowerCase().indexOf(q)>-1) out.push({group:"Plattformen",label:"VALUERO · "+o.name,sub:num(o.feeBookings)+" Buchungen",act:"pltab:valuero~"+o.key}); });
  [["kochdu","kochdu"],["kantineur","Kantineur"],["blitzdings","Blitzdings","blitz"],["valuero","VALUERO"],["skikaiser","Skikaiser","ski"]].forEach(function(t){ if(t[0].indexOf(q)===0) out.push({group:"Plattformen",label:t[1],sub:"Plattform öffnen",act:"pltab:"+(t[2]||t[0])}); });
  return out.slice(0,8);
});
})();
