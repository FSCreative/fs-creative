/* Ansicht "Websites" (FS Creative): Abrechnung der Kunden-Websites (Domain, Hosting, Mail, freier Betrag),
   Preise, echte Kosten (Railway + Domains), eigene Projekte, Railway-Projekte und Cloudflare-Websites. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de;
var U=F.UI.web=F.UI.web||{tab:"bill",q:"",f:"all",bf:"all",exp:{}};
var OWN_RX=/^(fs creative|blitzdings|valuero|kochdu|der-kantineur|buchhaltung|blitzbooth zentrale|fs-creative-mail-api|fs-dashboard|gallant-gentleness|noble-flow)$/i;
var PERLBL={1:"Monat",3:"Quartal",6:"Halbjahr",12:"Jahr"};
var DEFP={domain:0,domainPer:"year",hosting:0,hostingPer:"month",mail:0,mailPer:"month",period:12,taxRate:20,gross:true,domainLabel:"Domain",hostingLabel:"Hosting & Wartung",mailLabel:"E-Mail"};
/* world4you, reguläre Preise inkl. 20 % USt pro Jahr (p1 = Aktionspreis im 1. Jahr) */
/* world4you-Pakete pro Monat inkl. 20 % USt; Exchange/Mail je Postfach. Voreinstellungen wie am Server (W4Y_DEFAULTS). */
var W4P={exchange5:{l:"Exchange 5 GB",m:7,box:1},exchange10:{l:"Exchange 10 GB",m:10,box:1},exchange15:{l:"Exchange 15 GB",m:13.5,box:1},mailgrow:{l:"E-Mail Grow",m:4,box:1},go:{l:"Webhosting Go",m:4},grow:{l:"Webhosting Grow",m:7},business:{l:"Webhosting Business",m:12}};
var W4D=[[/^of gaschurn$/i,["exchange5"]],[/^lerch fleischhandel$/i,["exchange5"]],[/bergfreunde/i,["go"]],[/^fl(ö|oe)ry/i,["go"]]];
function w4yDef(name){ var m=W4D.find(function(d){ return d[0].test(String(name||"")); }); return m?m[1].slice():[]; }
/* Partnerrabatt world4you (wie am Server W4Y_RABATT): 5 % auf Domains, 10 % auf Mail-Pakete; Webhosting ohne Rabatt */
var W4R={domain:0.05,mail:0.10};
function w4pMonth(k){ var p=W4P[k]; return p?Math.round(p.m*(p.box?1-W4R.mail:1)*100)/100:0; }
function w4yLines(c){ return (c.w4y||[]).filter(function(k){return W4P[k];}).map(function(k){ var p=W4P[k], q=p.box?(c.w4yQty||1):1; return {k:k,l:p.l+(p.box&&q>1?" × "+q:""),year:Math.round(w4pMonth(k)*q*12*100)/100}; }); }
var W4Y={"at":{y:36,p1:12},"co.at":{y:36,p1:12},"or.at":{y:36,p1:12},"com":{y:24,p1:12},"ch":{y:14.04,p1:6.96},"net":{y:24},"org":{y:17.04},"eu":{y:19.92},"info":{y:null,p1:3.96},"de":{y:null,p1:5.04}};
var DEPLOYING=["BUILDING","DEPLOYING","INITIALIZING","QUEUED","WAITING"];
var siteBad=function(s){ return F.siteBad?F.siteBad(s):(s.up===false||/FAILED|CRASHED/.test(s.status||"")); };

/* ---------- Daten (eigene Endpunkte) ---------- */
var S=null, sTry=0, sBusy=false;      // /admin/api/sites
var B=null, bTry=0, bBusy=false, bStale=false;   // /admin/api/billing
var R=null, rTry=0, rBusy=false;      // /admin/api/railway-costs
function rerender(){ if(!F.D) return; if(F.current==="web") F.render(); else if(F.drawerRefresh===drawerRender&&document.getElementById("drawer").classList.contains("on")) drawerRender(); }
var reloadT;
function reloadCockpit(){ clearTimeout(reloadT); reloadT=setTimeout(function tick(){ if(F.busy){ reloadT=setTimeout(tick,600); return; } F.load(true); },700); }
function loadSites(force){
  if(sBusy) return; if(!force&&Date.now()-sTry<60000) return;
  sBusy=true; sTry=Date.now();
  F.api("/admin/api/sites"+(force?"?force=1":"")).then(function(d){
    sBusy=false;
    if(d&&!d.error&&d.ok!==false){ S=d; if(force){ F.toast("Websites & Projekte aktualisiert"); reloadCockpit(); } }
    else if(force) F.toast("Websites konnten nicht geladen werden",true);
    rerender();
  }).catch(function(){ sBusy=false; if(force) F.toast("Keine Verbindung zum Server",true); rerender(); });
}
function loadBilling(){
  if(bBusy) return; bBusy=true; bTry=Date.now(); bStale=false;
  F.api("/admin/api/billing").then(function(d){ bBusy=false; if(d&&d.prices) B=d; rerender(); }).catch(function(){ bBusy=false; rerender(); });
}
function loadCosts(force){
  if(rBusy) return; if(!force&&R) return; if(!force&&Date.now()-rTry<60000) return;
  rBusy=true; rTry=Date.now(); if(force) rerender();
  F.api("/admin/api/railway-costs"+(force?"?force=1":"")).then(function(d){ rBusy=false; if(d&&d.projects) R=d; if(force) F.toast(d&&d.error?"Railway-Kosten: "+d.error:"Kosten neu berechnet",!!(d&&d.error)); rerender(); }).catch(function(){ rBusy=false; rerender(); });
}
var ERRTXT={nichts_zum_zuruecknehmen:"Es gibt keine Abrechnung zum Zurücknehmen.",save_failed:"Die Datei konnte am Server nicht gespeichert werden.",bad_op:"Ungültige Anfrage."};
function billPost(body){
  return F.api("/admin/api/billing",{body:body}).then(function(j){
    if(j&&j.ok&&j.billing){ B=j.billing; reloadCockpit(); }
    else { F.toast("Speichern fehlgeschlagen"+(j&&j.error?": "+(ERRTXT[j.error]||j.error):""),true); loadBilling(); }
    rerender(); return j||{};
  }).catch(function(){ F.toast("Speichern fehlgeschlagen – keine Verbindung",true); loadBilling(); return {}; });
}
F.onData(function(){ bStale=true; });

/* ---------- Hilfen ---------- */
function num(n){ return (+n||0).toLocaleString("de-AT"); }
function bytes(n){ n=+n||0; if(n>=1e9) return (n/1e9).toLocaleString("de-AT",{maximumFractionDigits:1})+" GB"; if(n>=1e6) return (n/1e6).toLocaleString("de-AT",{maximumFractionDigits:1})+" MB"; if(n>=1e3) return Math.round(n/1e3)+" kB"; return n+" B"; }
function ymdAdd(iso,days){ var d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+days); return F.ymd(d); }
function ymdAddM(iso,months){ var d=new Date(iso+"T12:00:00"), day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+months); var last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate(); d.setDate(Math.min(day,last)); return F.ymd(d); }
function relAgo(iso){ if(!iso) return "—"; var s=(Date.now()-new Date(iso).getTime())/1000; if(s<3600) return "vor "+Math.max(1,Math.round(s/60))+" Min."; if(s<86400) return "vor "+Math.round(s/3600)+" Std."; var d=Math.round(s/86400); if(d<45) return "vor "+d+(d===1?" Tag":" Tagen"); return new Date(iso).toLocaleDateString("de-AT"); }
function zoneFor(domain,zones){ domain=String(domain||"").toLowerCase(); var best=null; (zones||[]).forEach(function(z){ var n=String(z.name||"").toLowerCase(); if(domain===n||domain.slice(-(n.length+1))==="."+n){ if(!best||n.length>best.name.length) best=z; } }); return best; }
function rwTag(st){
  if(st==="SUCCESS") return '<span class="tag ok">Online</span>';
  if(st==="FAILED"||st==="CRASHED") return '<span class="tag bad">'+(st==="CRASHED"?"Abgestürzt":"Fehler")+'</span>';
  if(DEPLOYING.indexOf(st)>-1) return '<span class="tag info">Deploy läuft</span>';
  if(st==="SLEEPING") return '<span class="tag grey">Schläft</span>';
  if(st==="EMPTY") return '<span class="tag grey">Leer</span>';
  return '<span class="tag grey">Kein Deploy</span>';
}
function rwDot(st){ return st==="SUCCESS"?"ok":(st==="FAILED"||st==="CRASHED")?"bad":DEPLOYING.indexOf(st)>-1?"warn":""; }
function upDot(s){ return s.up===false?"bad":s.up?"ok":""; }
function upTitle(s){ return s.up===false?"offline":s.up?"online":"ohne Cloudflare"; }
function projects(){ return (S&&S.railway&&S.railway.projects)||[]; }
function zones(){ return (S&&S.sites)||[]; }

/* Website-Liste wie im klassischen Dashboard: Railway-Projekte + Cloudflare-Zonen ohne Projekt */
function sitesAll(){
  if(!S) return (F.D.sites||[]).slice();
  var zs=zones(), used={}, list=[];
  projects().forEach(function(p){ var doms=p.domains||[]; if(!(p.services||[]).length&&!doms.length) return;
    var z=doms.map(function(dm){ return zoneFor(dm,zs); }).filter(Boolean); z.forEach(function(x){ used[x.name]=1; });
    var rd=(p.railwayDomains||[])[0]||"";
    list.push({key:"rw:"+p.id,name:p.name,domain:doms[0]||"",domains:doms,url:doms[0]?"https://"+doms[0]:(rd?"https://"+rd:""),up:z.length?z[0].up:null,status:p.status,rwId:p.id,envId:p.envId,lastDeploy:p.lastDeploy||null}); });
  zs.forEach(function(z){ if(used[z.name]) return; list.push({key:"cf:"+z.name,name:z.name,domain:z.name,domains:[z.name],url:"https://"+z.name,up:z.up,status:null,rwId:null}); });
  return list.sort(function(a,b){ return a.name.localeCompare(b.name,"de"); });
}
function siteBy(key){ return sitesAll().find(function(s){ return s.key===key; }); }
function prices(){ return Object.assign({},DEFP,(B&&B.prices)||{}); }
function cfg(s){
  var c=(B&&B.sites&&B.sites[s.key])||{};
  if(!B) return {active:!!s.active,domain:false,hosting:false,mail:false,mailQty:1,extra:0,extraLabel:"",customer:s.customer||"",billedUntil:s.billedUntil||null,own:s.own!=null?!!s.own:OWN_RX.test(s.name),w4y:s.w4y||w4yDef(s.name),w4yQty:s.w4yQty||1};
  return {active:!!c.active,domain:!!c.domain,hosting:!!c.hosting,mail:!!c.mail,mailQty:+c.mailQty||1,extra:+c.extra||0,extraLabel:c.extraLabel||"",customer:c.customer||"",billedUntil:c.billedUntil||null,own:c.own!=null?!!c.own:OWN_RX.test(s.name),w4y:Array.isArray(c.w4y)?c.w4y:w4yDef(s.name),w4yQty:+c.w4yQty||1};
}
function perPeriod(price,per,period){ price=+price||0; return per==="year"?price*period/12:price*period; }
function siteLines(s,c){ var P=prices(), n=+P.period||12, L=[];
  if(c.domain) L.push({name:(P.domainLabel||"Domain")+(s.domain?" "+s.domain:""),amount:perPeriod(P.domain,P.domainPer,n)});
  if(c.hosting) L.push({name:(P.hostingLabel||"Hosting")+(s.domain?" "+s.domain:""),amount:perPeriod(P.hosting,P.hostingPer,n)});
  if(c.mail) L.push({name:(P.mailLabel||"E-Mail")+(c.mailQty>1?" ("+c.mailQty+" Postfächer)":""),amount:perPeriod(P.mail,P.mailPer,n)*(c.mailQty||1)});
  if(c.extra>0) L.push({name:c.extraLabel||"Zusatzleistung",amount:c.extra});
  return L.map(function(l){ l.amount=Math.round(l.amount*100)/100; return l; });
}
function siteSum(s,c){ return siteLines(s,c).reduce(function(a,l){ return a+l.amount; },0); }
/* Stichtag 1.1. (Standard): jährlich je Kalenderjahr verrechnet, fällig erst ab 1.1.; nie verrechnete Websites nur im Jänner fällig */
function yearly(){ var P=prices(); return (+P.period||12)===12&&P.yearStart!==false; }
function nextBill(c){ return c.billedUntil?ymdAdd(c.billedUntil,1):(yearly()?(F.D.today.slice(5,7)==="01"?F.D.today.slice(0,4):String(+F.D.today.slice(0,4)+1))+"-01-01":F.D.today); }
function siteDue(c){ if(!c.active) return false; var t=F.D.today; if(!yearly()) return !c.billedUntil||c.billedUntil<t; return c.billedUntil?c.billedUntil<t:t.slice(5,7)==="01"; }
function invRecs(key){ return (B&&B.invoices&&B.invoices["site:"+key])||[]; }
function lastInv(key){ var a=invRecs(key); return a[a.length-1]||null; }
function sevInv(id){ return id&&F.D.sev?F.D.sev.invoices.find(function(i){ return i.id===id; }):null; }
function invTag(rec){
  if(!rec.id) return '<span class="tag grey">ohne Rechnung</span>';
  var i=sevInv(rec.id); if(!i) return '<span class="tag grey">in sevDesk</span>';
  var cls=i.overdue?"bad":i.status===1000?"ok":i.status===100?"grey":"warn", lbl=i.overdue?"überfällig":i.status===1000?"bezahlt":i.status===100?"Entwurf":i.status===750?"teilbezahlt":i.status===50?"deaktiviert":"offen";
  return '<span class="tag '+cls+'">'+lbl+'</span>';
}
function invInfo(rec){
  if(!rec) return '<span class="muted">noch nie verrechnet</span>';
  var i=sevInv(rec.id), nr=(i&&i.nr)||rec.nr||"Entwurf";
  return '<span class="w-inv">'+(rec.id?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(rec.id)+'" target="_blank" rel="noopener" title="Rechnung ansehen">'+esc(nr)+'</a>':esc(nr))+' · '+de(rec.date)+' · <span class="money">'+eur(rec.gross)+'</span> '+invTag(rec)+'</span>';
}
function stateTag(c){
  if(!c.active) return '<span class="tag grey">wird nicht verrechnet</span>';
  if(c.billedUntil&&!siteDue(c)) return '<span class="tag ok">verrechnet bis '+de(c.billedUntil)+'</span>';
  if(!siteDue(c)) return '<span class="tag grey">nächste Rechnung '+de(nextBill(c))+'</span>';
  return '<span class="tag warn">'+(c.billedUntil?"fällig seit "+de(ymdAdd(c.billedUntil,1)):"noch nie verrechnet")+'</span>';
}
/* FS Creative-Umsatz (wie Übersicht im klassischen Dashboard): Website-Rechnungen des Jahres, bezahlt/offen laut sevDesk */
function fscRevenue(){
  var r={paid:0,open:0,count:0}, yr=String(F.D.year); if(!B||!B.invoices) return r;
  Object.keys(B.invoices).forEach(function(k){ if(k.indexOf("site:")!==0) return;
    (B.invoices[k]||[]).forEach(function(inv){ if(String(inv.date||"").slice(0,4)!==yr) return; r.count++; var x=sevInv(inv.id);
      if(x){ if(x.status===100||x.status===50){ r.open+=+inv.gross||0; return; } r.paid+=(+x.paid||0); r.open+=(+x.open||0); }
      else r.open+=(+inv.gross||0); }); });
  return r;
}

/* ---------- Echte Kosten: Railway (letzte 30 Tage) + Domains (world4you) ---------- */
function regDomains(s){ var seen={}, out=[]; (s.domains||[]).forEach(function(d){ d=String(d||"").toLowerCase().replace(/^www\./,""); if(!d||/\.up\.railway\.app$/.test(d)) return; var parts=d.split("."), n=/\.(co|or|gv|ac)\.at$/.test(d)?3:2, reg=parts.slice(-n).join("."); if(seen[reg]) return; seen[reg]=1; var tld=parts.slice(-(n-1)).join("."), pr=W4Y[tld]||null, rb=function(v){ return v!=null?Math.round(v*(1-W4R.domain)*100)/100:null; }; out.push({name:reg,tld:tld,year:pr?rb(pr.y):null,p1:pr?rb(pr.p1):null}); }); return out; }
function siteCosts(s){
  var p=(R&&R.projects&&s.rwId)?R.projects[s.rwId]:null, fx=(R&&R.fx)||(F.D.railwayCosts&&F.D.railwayCosts.fx)||0.86;
  var rwMonth=p?(+p.eur||0):(!R&&s.railwayMonth!=null?s.railwayMonth:0), parts={};
  if(p&&p.parts) Object.keys(p.parts).forEach(function(k){ parts[k]=Math.round(p.parts[k]*fx*100)/100; });
  var doms=regDomains(s), domYear=doms.reduce(function(a,d){ return a+(d.year||0); },0);
  var w4=w4yLines(cfg(s)), w4Year=Math.round(w4.reduce(function(a,l){ return a+l.year; },0)*100)/100;
  return {loaded:!!(R&&R.projects)||s.railwayMonth!=null||w4Year>0, detail:!!(R&&R.projects), hasRw:!!s.rwId, rwMonth:rwMonth, rwYear:Math.round(rwMonth*365/30*100)/100, parts:parts, doms:doms, domYear:Math.round(domYear*100)/100, w4:w4, w4Year:w4Year, year:Math.round((rwMonth*365/30+domYear+w4Year)*100)/100, fx:fx};
}
function w4Card(s,c,k){
  var K=esc(s.key), sel=c.w4y||[];
  var opts=Object.keys(W4P).map(function(x){ var on=sel.indexOf(x)>-1; return '<label class="w-line" style="cursor:pointer"><span><input type="checkbox" data-w4y="'+K+'" value="'+x+'"'+(on?" checked":"")+'> '+esc(W4P[x].l)+'</span><span class="num muted money">'+eur(w4pMonth(x))+' / Mon.'+(W4P[x].box?' je Postfach':'')+'</span></label>'; }).join("");
  var box=sel.some(function(x){ return W4P[x]&&W4P[x].box; });
  return '<div class="w-card"><h3>Hosting/Mail · world4you</h3>'+(k.w4Year?'<div class="w-big num money">'+eur(k.w4Year)+' <span class="muted">/ Jahr</span></div>':'<div class="muted">Kein world4you-Paket</div>')+
    '<details'+(sel.length?'':' open')+'><summary class="muted" style="cursor:pointer">Pakete wählen</summary>'+opts+
    (box?'<label class="w-line"><span>Postfächer</span><input class="f num" type="number" min="1" max="99" style="max-width:80px" data-w4yqty="'+K+'" value="'+(c.w4yQty||1)+'"></label>':'')+'</details>'+
    '<div class="muted">12 Monate Laufzeit, inkl. 20 % USt, Mail-Pakete abzüglich 10 % Partnerrabatt</div></div>';
}
function costDetail(s,c){
  var k=siteCosts(s), P=prices(), n=+P.period||12, inc=siteSum(s,c)*12/n, res=inc-k.year;
  var PL={cpu:"CPU",ram:"Arbeitsspeicher",egress:"Datenverkehr",disk:"Speicher (Volume)",backup:"Backups"};
  var rw=!k.hasRw?'<div class="muted">Kein Railway-Projekt (nur Domain/Cloudflare)</div>':(!k.detail?(R&&R.error?'<div class="muted">Railway-Kosten nicht verfügbar: '+esc(R.error)+'</div>':'<div class="muted">Lade Railway-Kosten …</div>'):
    '<div class="w-big num money">'+eur(k.rwMonth)+' <span class="muted">/ Monat</span></div><div class="muted">≈ <span class="money">'+eur(k.rwYear)+'</span> pro Jahr · letzte 30 Tage</div>'+
    Object.keys(PL).filter(function(x){ return k.parts[x]>=0.005; }).map(function(x){ return '<div class="w-line"><span>'+PL[x]+'</span><b class="num money">'+eur(k.parts[x])+'</b></div>'; }).join(""));
  var dm=k.doms.length?k.doms.map(function(d){ return '<div class="w-line"><span><b>'+esc(d.name)+'</b> <span class="muted">.'+esc(d.tld)+'</span></span><b class="num money">'+(d.year!=null?eur(d.year)+' / Jahr':'Preis unbekannt')+'</b></div>'+(d.p1?'<div class="muted">1. Jahr bei Neuregistrierung: '+eur(d.p1)+'</div>':''); }).join(""):'<div class="muted">Keine eigene Domain</div>';
  var bal='<div class="w-line"><span>Einnahmen</span><b class="num pos money">'+eur(inc)+'</b></div><div class="w-line"><span>Railway</span><b class="num neg money">− '+eur(k.rwYear)+'</b></div><div class="w-line"><span>Domain'+(k.doms.length>1?"s":"")+'</span><b class="num neg money">− '+eur(k.domYear)+'</b></div>'+
    (k.w4Year?'<div class="w-line"><span>world4you Hosting/Mail</span><b class="num neg money">− '+eur(k.w4Year)+'</b></div>':'')+
    '<div class="w-line tot"><span>Ergebnis</span><b class="num money '+(res>=0?"pos":"neg")+'">'+(res<0?"− ":"")+eur(Math.abs(res))+'</b></div>';
  return '<div class="w-cd"><div class="w-card"><h3>Hosting · Railway</h3>'+rw+'</div><div class="w-card"><h3>Domain'+(k.doms.length>1?"s":"")+' · world4you</h3>'+dm+'<div class="muted">reguläre Preise inkl. 20 % USt, abzüglich 5 % Partnerrabatt</div></div>'+w4Card(s,c,k)+'<div class="w-card"><h3>Bilanz pro Jahr</h3>'+bal+'<div class="muted">Einnahmen '+(P.gross?"brutto":"netto")+' · Railway in € (Kurs '+String(k.fx).replace(".",",")+')</div></div></div>';
}

/* ---------- Ansicht ---------- */
F.css(
'.w-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px}'+
'.w-kpis .kpi{border:1px solid var(--line)}'+
'.w-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}'+
'.w-tools input.f{max-width:300px}'+
'.w-row{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1.5fr) minmax(135px,.6fr) minmax(0,1.25fr) auto;gap:14px;align-items:center;padding:12px 18px;border-bottom:1px solid var(--line)}'+
'.w-row:last-child{border-bottom:0}'+
'.w-row.hd{padding-top:9px;padding-bottom:9px;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600}'+
'.w-row.off .w-name{color:var(--ink-2)}'+
'.w-row.rw{grid-template-columns:minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1.3fr) 110px auto}'+
'.w-row.cf{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) repeat(5,minmax(64px,.45fr)) auto}'+
'.w-row.bad{background:var(--bad-soft)}'+
'.w-site{display:flex;gap:2px;align-items:flex-start;min-width:0}.w-site>div{min-width:0}'+
'.w-site .dot{margin-top:7px;flex:none}'+
'.w-name{border:0;background:none;padding:0;text-align:left;font-weight:600;overflow-wrap:anywhere;color:var(--ink)}'+
'button.w-name:hover{text-decoration:underline}'+
'.w-url{display:block;font-size:12.5px;color:var(--ink-3);text-decoration:none;overflow-wrap:anywhere}.w-url:hover{color:var(--ink)}'+
'.w-cust{font-size:12.5px;color:var(--ink-2);overflow-wrap:anywhere}'+
'.w-tgs{display:flex;flex-wrap:wrap;gap:5px;align-items:center}'+
'.w-tg{border:1px dashed var(--line);background:none;border-radius:99px;padding:3px 10px;font-size:12.5px;font-weight:600;color:var(--ink-3)}'+
'.w-tg:hover{border-color:var(--ink-3)}'+
'.w-tg[aria-pressed="true"]{border-style:solid;border-color:var(--ink-3);background:var(--sunk);color:var(--ink)}'+
'.w-tg.on[aria-pressed="true"]{background:var(--ok-soft);border-color:var(--ok);color:var(--ok)}'+
'.w-extra{font-size:12.5px;color:var(--ink-2)}'+
'.w-sum{text-align:right}.w-sum .muted{font-size:12px}.w-sum .link{white-space:nowrap}'+
'.w-inv{font-size:12.5px}.w-inv a{text-decoration:none}.w-inv a:hover{text-decoration:underline}'+
'.w-st{display:grid;gap:4px;justify-items:start;min-width:0}'+
'.w-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}'+
'.w-det{padding:2px 18px 16px;border-bottom:1px solid var(--line);background:var(--ground)}'+
'.w-cd{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding-top:12px}'+
'.w-card{border:1px solid var(--line);background:var(--panel);border-radius:11px;padding:12px 14px;display:grid;gap:6px;align-content:start;min-width:0}'+
'.w-card h3{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-family:var(--f-body)}'+
'.w-line{display:flex;justify-content:space-between;gap:10px;font-size:13.5px}.w-line>span{min-width:0;overflow-wrap:anywhere}'+
'.w-line.tot{border-top:1px solid var(--line);padding-top:6px;font-weight:700}'+
'.w-big{font-size:20px;font-weight:700}'+
'.w-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:99px;padding:2px 9px;font-size:12.5px;text-decoration:none;margin:2px 4px 2px 0;max-width:100%;overflow-wrap:anywhere;color:var(--ink)}'+
'.w-chip:hover{border-color:var(--ink-3)}.w-chip .dot{margin:0}.w-chip .cf{font-size:10px;font-weight:700;color:var(--info)}.w-chip.faint{color:var(--ink-3)}'+
'.w-sv{display:inline-block;border-radius:6px;padding:1px 7px;font-size:12px;margin:2px 4px 2px 0;background:var(--sunk);color:var(--ink-2)}'+
'.w-sv.bad{background:var(--bad-soft);color:var(--bad);font-weight:600}.w-sv.db{background:var(--info-soft);color:var(--info)}'+
'.w-m{text-align:right;font-family:var(--f-mono);font-variant-numeric:tabular-nums;font-size:13.5px}.w-m i{display:none;font-style:normal;font-family:var(--f-body);color:var(--ink-3);font-size:12px;margin-right:4px}'+
'.w-m.warn{color:var(--warn);font-weight:700}.w-m.bad{color:var(--bad)}'+
'.w-own{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;padding:14px 18px}'+
'.w-oc{border:1px solid var(--line);border-radius:11px;padding:10px 12px;display:flex;gap:6px;align-items:flex-start;justify-content:space-between}'+
'.w-oc .muted{display:block}'+
'.w-opt{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px dashed var(--line)}'+
'.w-opt input[type=checkbox]{width:18px;height:18px;accent-color:var(--ok)}'+
'.w-opt .num{font-size:13px;color:var(--ink-2)}'+
'.w-qty{display:flex;gap:8px;align-items:center;padding:6px 0 4px 28px;font-size:13px;color:var(--ink-2)}.w-qty input{max-width:90px}'+
'.w-sec{display:grid;gap:8px}'+
'.w-pgrid{display:grid;grid-template-columns:auto minmax(0,1.4fr) minmax(0,.8fr) minmax(0,.8fr);gap:8px 10px;align-items:center}'+
'.w-pgrid .h{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600}'+
'.w-dl{display:grid;gap:6px}'+
'@media (max-width:900px){'+
 '.w-row,.w-row.rw,.w-row.cf{grid-template-columns:minmax(0,1fr);gap:8px}'+
 '.w-row.hd{display:none}'+
 '.w-acts{justify-content:flex-start}'+
 '.w-sum{text-align:left}'+
 '.w-cd{grid-template-columns:minmax(0,1fr)}'+
 '.w-mets{display:flex;flex-wrap:wrap;gap:4px 16px}'+
 '.w-m{text-align:left}.w-m i{display:inline}'+
 '.w-tools input.f{max-width:none}.w-hidem{display:none}'+
 '.w-pgrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.w-pgrid .h{display:none}.w-pgrid b{grid-column:1/-1;margin-top:6px}.w-pgrid .lb{grid-column:1/-1}'+
'}'+
'@media (min-width:901px){.w-mets{display:contents}}'
);

function chip(act,k,cur,label,n){ return '<button class="chip" data-act="'+act+':'+k+'" aria-pressed="'+(cur===k)+'">'+label+(n!=null?' · '+n:'')+'</button>'; }
function hit(txt){ var q=(U.q||"").toLowerCase().trim(); return !q||String(txt||"").toLowerCase().indexOf(q)>-1; }
function siteName(s){ return '<div class="w-site"><span class="dot '+upDot(s)+'" title="'+upTitle(s)+'"></span><div><button class="w-name" data-act="wsite:'+esc(s.key)+'">'+esc(s.name)+'</button>'+
  (s.url?'<a class="w-url" href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.url.replace(/^https:\/\//,""))+(s.domain?"":" (Railway)")+' ↗</a>':'<span class="w-url">ohne Domain</span>'); }

function kpisTech(){
  var t=(S&&S.totals)||{}, rw=(S&&S.railway)||null, rt=(rw&&rw.totals)||{}, cfOff=S&&S.configured===false;
  var ds=F.D.sites||[], rwFail=S?(+rt.failed||0):(F.D.railwayFailed||0);
  var k=function(act,label,val,sub,cls){ return '<button class="panel kpi" data-act="'+act+'"><span class="k">'+label+'</span><span class="v num'+(cls?" "+cls:"")+'">'+val+'</span><span class="s">'+sub+'</span></button>'; };
  return '<div class="w-kpis'+(U.tab==="bill"?" w-hidem":"")+'">'+
    k("wtab:cf","Websites online",S?(cfOff?"—":num(t.online)):num(ds.filter(function(s){return s.up;}).length),S?(cfOff?"Cloudflare-Token fehlt":"von "+num(t.sites)+" Websites"):"lade Cloudflare …",S&&!cfOff&&t.online<t.sites?"warn-t":"")+
    k("wtab:cf","Requests (7 Tage)",S&&!cfOff?num(t.requests7d):"—","über alle Sites")+
    k("wtab:cf","Besucher (7 T, ~)",S&&!cfOff?num(t.uniques7d):"—","Cloudflare-Schätzung")+
    k("wtab:cf","Bedrohungen geblockt",S&&!cfOff?num(t.threats7d):"—","letzte 7 Tage",S&&t.threats7d>0?"warn-t":"")+
    k("wtab:rw","Railway-Projekte",rw&&rw.configured?num(+rt.projects||projects().length):(S?"—":"…"),rw&&rw.configured?num(+rt.services||0)+" Services"+(rwFail?" · "+rwFail+" mit Fehler":" · alles grün")+((+rt.deploying)?" · "+rt.deploying+" im Deploy":""):(S?"Railway-Token fehlt":"lade Railway …"),rwFail?"bad-t":"")+
  '</div>';
}

function vBill(){
  if(!B) return '<section class="panel"><div class="empty">'+(bBusy||!bTry?"Lade Abrechnung …":'Abrechnung konnte nicht geladen werden. <button class="btn" data-act="wbillreload">Erneut versuchen</button>')+'</div></section>';
  var P=prices(), n=+P.period||12, all=sitesAll().map(function(s){ return {s:s,c:cfg(s)}; });
  var custAll=all.filter(function(x){ return !x.c.own; }), own=all.filter(function(x){ return x.c.own; });
  var act=custAll.filter(function(x){ return x.c.active; });
  var perYear=act.reduce(function(a,x){ return a+siteSum(x.s,x.c)*12/n; },0);
  var due=act.filter(function(x){ return siteDue(x.c)&&siteSum(x.s,x.c)>0; }), dueSum=due.reduce(function(a,x){ return a+siteSum(x.s,x.c); },0);
  /* Kosten/Jahr: aktive Kundenseiten + eigene Projekte */
  var costOwn=Math.round(own.reduce(function(a,x){ return a+siteCosts(x.s).year; },0)*100)/100;
  var costAct=Math.round((act.reduce(function(a,x){ return a+siteCosts(x.s).year; },0)+costOwn)*100)/100;
  var noPrice=!(+P.domain||+P.hosting||+P.mail), rev=fscRevenue();
  var bf=U.bf, cust=custAll.filter(function(x){
    if(!hit(x.s.name+" "+(x.s.domains||[]).join(" ")+" "+x.c.customer)) return false;
    if(bf==="due") return siteDue(x.c)&&siteSum(x.s,x.c)>0; if(bf==="active") return x.c.active; if(bf==="inactive") return !x.c.active; if(bf==="bad") return siteBad(x.s); return true; });
  cust.sort(function(a,b){ return (b.c.active-a.c.active)||a.s.name.localeCompare(b.s.name,"de"); });
  var cnt=function(fn){ return custAll.filter(fn).length; };
  var rows=cust.map(function(x){
    var s=x.s, c=x.c, sum=siteSum(s,c), li=lastInv(s.key), isDue=siteDue(c), open=!!U.exp[s.key], kc=siteCosts(s), K=esc(s.key);
    var tg=function(f,l,cls){ return '<button class="w-tg'+(cls?" "+cls:"")+'" data-act="wtg:'+K+'|'+f+'" aria-pressed="'+c[f]+'" title="'+(c[f]?"abwählen":"anhaken")+'">'+l+'</button>'; };
    return '<div class="w-row'+(c.active?"":" off")+'">'+siteName(s)+(c.customer?'<div class="w-cust">'+esc(c.customer)+'</div>':'<div class="w-cust muted">kein Kunde hinterlegt</div>')+(/FAILED|CRASHED/.test(s.status||"")?'<span class="tag bad">Deploy fehlgeschlagen</span>':'')+'</div></div>'+
      '<div class="w-tgs">'+tg("active","Aktiv","on")+tg("domain","Domain")+tg("hosting","Hosting")+tg("mail","Mail"+(c.mail&&c.mailQty>1?" ×"+c.mailQty:""))+(c.extra>0?'<span class="w-extra">+ <span class="money">'+eur(c.extra)+'</span> '+esc(c.extraLabel||"Zusatzleistung")+'</span>':'')+'</div>'+
      '<div class="w-sum"><b class="num money">'+eur(sum)+'</b><div class="muted">pro '+(PERLBL[n]||n+" Mon.")+'</div>'+(kc.loaded||kc.domYear?'<button class="link" data-act="wexp:'+K+'" title="Echte Kosten pro Jahr (Railway + Domain)">Kosten <span class="money">'+eur(kc.year)+'</span>/J '+(open?"▴":"▾")+'</button>':'<button class="link" data-act="wexp:'+K+'">Kosten '+(open?"▴":"▾")+'</button>')+'</div>'+
      '<div class="w-st">'+invInfo(li)+stateTag(c)+'</div>'+
      '<div class="w-acts"><button class="btn'+(c.active&&sum>0&&isDue?" primary":"")+'" data-act="wbill:'+K+'"'+(c.active&&sum>0?"":" disabled")+' title="'+(c.active?(sum>0?"Rechnungsentwurf in sevDesk anlegen":"Nichts zum Verrechnen angehakt"):"Website ist nicht aktiv")+'">Verrechnen</button>'+
        (li?'<button class="btn icon" data-act="wunbill:'+K+'" title="Letzte Abrechnung zurücknehmen (Rechnung in sevDesk bleibt bestehen)" aria-label="Letzte Abrechnung zurücknehmen">↺</button>':'')+
        '<button class="btn icon" data-act="wsite:'+K+'" title="Bearbeiten" aria-label="Bearbeiten">'+F.svg("gear")+'</button></div></div>'+
      (open?'<div class="w-det">'+costDetail(s,c)+'</div>':'');
  }).join("");
  return (noPrice?'<div class="notice"><span>Noch keine Preise hinterlegt. Lege fest, was Domain, Hosting und E-Mail kosten.</span><button class="btn primary" data-act="wprices">Preise festlegen</button></div>':'')+
  '<div class="w-kpis">'+
    '<button class="panel kpi" data-act="wbf:active"><span class="k">Aktive Kunden-Websites</span><span class="v num">'+act.length+'</span><span class="s">von '+custAll.length+' Kundenprojekten</span></button>'+
    '<div class="panel kpi"><span class="k">Wiederkehrend / Jahr</span><span class="v num ok-t">'+eur0(perYear)+'</span><span class="s">'+(P.gross?"brutto":"netto")+' · '+(PERLBL[n]?"Abrechnung pro "+PERLBL[n]:"alle "+n+" Monate")+'</span></div>'+
    '<button class="panel kpi" data-act="wcosts"><span class="k">Kosten / Jahr</span><span class="v num">'+(costAct?eur0(costAct):"—")+'</span><span class="s">'+(R?'Ergebnis <span class="money '+(perYear-costAct>=0?"pos":"neg")+'">'+eur0(perYear-costAct)+'</span> · Railway + Domains'+(costOwn?' · davon eigene '+eur0(costOwn):''):(rBusy?"rechne Railway-Kosten …":"Railway + Domains, inkl. eigene Projekte"))+'</span></button>'+
    '<button class="panel kpi" data-act="wbf:due"><span class="k">Jetzt zu verrechnen</span><span class="v num'+(due.length?" warn-t":"")+'">'+eur0(dueSum)+'</span><span class="s">'+due.length+' Website'+(due.length===1?"":"s")+' fällig</span></button>'+
    '<div class="panel kpi"><span class="k">Website-Rechnungen '+esc(F.D.year)+'</span><span class="v num">'+eur0(rev.paid)+'</span><span class="s">bezahlt · offen <span class="money">'+eur0(rev.open)+'</span></span></div>'+
  '</div>'+
  '<section class="panel"><div class="panel-h"><h2>Kunden-Websites &amp; Abrechnung</h2><div class="chips">'+
    chip("wbf","all",bf,"Alle",custAll.length)+chip("wbf","due",bf,"Fällig",cnt(function(x){ return siteDue(x.c)&&siteSum(x.s,x.c)>0; }))+chip("wbf","active",bf,"Aktiv",act.length)+chip("wbf","inactive",bf,"Nicht verrechnet",custAll.length-act.length)+chip("wbf","bad",bf,"Probleme",cnt(function(x){ return siteBad(x.s); }))+
  '</div></div>'+
  '<div class="w-row hd"><span>Website · Kunde</span><span>Verrechnet wird</span><span style="text-align:right">Summe</span><span>Letzte Abrechnung</span><span></span></div>'+
  (rows||'<div class="empty">Keine Kundenprojekte'+(U.q||bf!=="all"?" in dieser Ansicht":"")+'.</div>')+
  '<div class="panel-b muted">Abrechnung pro '+(PERLBL[n]||n+" Monate")+' · Preise '+(P.gross?"brutto":"netto")+' · Antippen der Häkchen speichert sofort. Mit dem Zahnrad bearbeitest du Kunde, Postfächer und freien Betrag.</div></section>'+
  '<section class="panel"><div class="panel-h"><h2>Eigene Projekte</h2><span class="muted">werden nicht verrechnet</span></div>'+
  (own.length?'<div class="w-own">'+own.filter(function(x){ return hit(x.s.name+" "+(x.s.domains||[]).join(" ")); }).map(function(x){ var s=x.s, kc=siteCosts(s);
    return '<div class="w-oc">'+siteName(s)+((kc.loaded&&kc.hasRw)||kc.domYear?'<span class="muted">Kosten <span class="money">'+eur(kc.year)+'</span> / Jahr'+(kc.hasRw&&kc.loaded?' · Railway <span class="money">'+eur(kc.rwMonth)+'</span>/M':'')+'</span>':'')+'</div></div>'+
      '<button class="btn icon" data-act="wown:'+esc(s.key)+'|0" title="Als Kundenprojekt führen" aria-label="Als Kundenprojekt führen">⤒</button></div>'; }).join("")+'</div>':'<div class="empty">Keine eigenen Projekte markiert.</div>')+'</section>';
}

function vRailway(){
  var rw=(S&&S.railway)||null, zs=zones(), f=U.f;
  if(!S) return '<section class="panel"><div class="empty">Lade Railway-Daten …</div></section>';
  if(!rw||!rw.configured) return '<section class="panel"><div class="empty">Railway ist noch nicht verbunden – es fehlt die Variable RAILWAY_API_TOKEN im Service „fs-creative“.</div></section>';
  var ps=projects();
  if(rw.error&&!ps.length) return '<section class="panel"><div class="empty">Railway-Fehler: '+esc(rw.error)+'</div></section>';
  var list=ps.filter(function(p){
    if(!hit(p.name+" "+(p.domains||[]).join(" ")+" "+(p.services||[]).map(function(x){ return x.name; }).join(" "))) return false;
    var linked=(p.domains||[]).some(function(dm){ return zoneFor(dm,zs); });
    if(f==="err") return p.status==="FAILED"||p.status==="CRASHED"||(p.domains||[]).some(function(dm){ var z=zoneFor(dm,zs); return z&&!z.up; });
    if(f==="linked") return linked; if(f==="nocf") return (p.domains||[]).length&&!linked; if(f==="norw") return false; return true; });
  var rt=rw.totals||{};
  return '<section class="panel"><div class="panel-h"><h2>Railway-Projekte</h2><span class="muted">'+ps.length+' Projekte · '+(+rt.services||0)+' Services · Domains mit Cloudflare abgeglichen</span></div>'+
    '<div class="w-row rw hd"><span>Projekt</span><span>Domains</span><span>Services</span><span>Letztes Deploy</span><span></span></div>'+
    (list.map(function(p){
      var bad=p.status==="FAILED"||p.status==="CRASHED";
      var doms=(p.domains||[]).map(function(dm){ var z=zoneFor(dm,zs); return '<a class="w-chip" href="https://'+esc(dm)+'" target="_blank" rel="noopener" title="'+(z?(z.up?"online · "+z.ms+" ms · "+num(z.requests7d)+" Requests/7T":"offline"):"nicht in Cloudflare")+'">'+(z?'<span class="dot '+(z.up?"ok":"bad")+'"></span>':'')+esc(dm)+(z?'<span class="cf">CF</span>':'')+'</a>'; }).join("");
      if(!doms&&(p.railwayDomains||[]).length) doms='<a class="w-chip faint" href="https://'+esc(p.railwayDomains[0])+'" target="_blank" rel="noopener">'+esc(p.railwayDomains[0])+'</a>';
      var svs=(p.services||[]).map(function(x){ var b=x.status==="FAILED"||x.status==="CRASHED"; return '<span class="w-sv'+(b?" bad":(x.db?" db":""))+'" title="'+esc(x.status||"")+'">'+esc(x.name)+'</span>'; }).join("");
      return '<div class="w-row rw'+(bad?" bad":"")+'"><div class="w-site"><span class="dot '+rwDot(p.status)+'" title="'+esc(p.status||"")+'"></span><div><b>'+esc(p.name)+'</b><div>'+rwTag(p.status)+'</div></div></div>'+
        '<div>'+(doms||'<span class="muted">—</span>')+'</div><div>'+(svs||'<span class="muted">—</span>')+'</div>'+
        '<div class="muted nowrap" title="'+esc(p.lastDeploy?new Date(p.lastDeploy).toLocaleString("de-AT"):"")+'">'+esc(relAgo(p.lastDeploy))+'</div>'+
        '<div class="w-acts"><a class="btn" href="https://railway.com/project/'+encodeURIComponent(p.id)+(p.envId?'?environmentId='+encodeURIComponent(p.envId):'')+'" target="_blank" rel="noopener">Railway ↗</a></div></div>';
    }).join("")||'<div class="empty">Keine Projekte in dieser Ansicht.</div>')+'</section>';
}

function vCloudflare(){
  if(!S) return '<section class="panel"><div class="empty">Lade Cloudflare-Daten …</div></section>';
  if(S.configured===false) return '<section class="panel"><div class="empty">Cloudflare ist noch nicht verbunden (CF_API_TOKEN fehlt).</div></section>';
  var zs=zones(), f=U.f, zp={};
  projects().forEach(function(p){ (p.domains||[]).forEach(function(dm){ var z=zoneFor(dm,zs); if(z) zp[z.name]=p; }); });
  var list=zs.filter(function(x){ var p=zp[x.name]; if(!hit(x.name+" "+(p?p.name:""))) return false;
    if(f==="err") return !x.up; if(f==="linked") return !!p; if(f==="norw") return !p; if(f==="nocf") return false; return true; });
  return '<section class="panel"><div class="panel-h"><h2>Cloudflare-Websites</h2><span class="muted">Status per Live-Ping · Insights aus Cloudflare (7 Tage)'+(S.error?' · Fehler: '+esc(S.error):'')+'</span></div>'+
    '<div class="w-row cf hd"><span>Domain</span><span>Railway</span><span style="text-align:right">Antwort</span><span style="text-align:right">Requests</span><span style="text-align:right">Besucher</span><span style="text-align:right">Bedroh.</span><span style="text-align:right">Daten</span><span></span></div>'+
    (list.map(function(x){ var p=zp[x.name];
      return '<div class="w-row cf'+(x.up?"":" bad")+'"><div class="w-site"><span class="dot '+(x.up?"ok":"bad")+'" title="'+(x.up?"online":"offline")+'"></span><div><b>'+esc(x.name)+'</b>'+(x.up?'':'<div><span class="tag bad">offline'+(x.status?" · HTTP "+esc(x.status):"")+'</span></div>')+'</div></div>'+
        '<div>'+(p?'<a class="w-chip" href="https://railway.com/project/'+encodeURIComponent(p.id)+'" target="_blank" rel="noopener" title="'+esc(p.status||"")+'"><span class="dot '+rwDot(p.status)+'"></span>'+esc(p.name)+'</a>':'<span class="muted">—</span>')+'</div>'+
        '<div class="w-mets"><span class="w-m'+(x.up?"":" bad")+'"><i>Antwort</i>'+(x.up?esc(x.ms)+" ms":"offline")+'</span><span class="w-m"><i>Requests</i>'+num(x.requests7d)+'</span><span class="w-m"><i>Besucher</i>'+num(x.uniques7d)+'</span><span class="w-m'+((+x.threats7d)>0?" warn":"")+'"><i>Bedrohungen</i>'+num(x.threats7d)+'</span><span class="w-m"><i>Daten</i>'+(x.bytes7d!=null?bytes(x.bytes7d):"—")+'</span></div>'+
        '<div class="w-acts"><a class="btn" href="https://'+esc(x.name)+'" target="_blank" rel="noopener">öffnen ↗</a></div></div>';
    }).join("")||'<div class="empty">'+(zs.length?"Keine Websites in dieser Ansicht.":"Keine aktiven Zonen gefunden.")+'</div>')+'</section>';
}

function techChips(){
  var ps=projects(), zs=zones(), zp={};
  ps.forEach(function(p){ (p.domains||[]).forEach(function(dm){ var z=zoneFor(dm,zs); if(z) zp[z.name]=p; }); });
  var nErr=ps.filter(function(p){ return p.status==="FAILED"||p.status==="CRASHED"; }).length+zs.filter(function(x){ return !x.up; }).length;
  var nNoCf=ps.filter(function(p){ return (p.domains||[]).length&&!(p.domains||[]).some(function(dm){ return zoneFor(dm,zs); }); }).length;
  var nNoRw=zs.filter(function(x){ return !zp[x.name]; }).length;
  return '<div class="chips">'+chip("wf","all",U.f,"Alle")+chip("wf","err",U.f,"Probleme",nErr)+chip("wf","linked",U.f,"Verknüpft")+chip("wf","nocf",U.f,"Ohne Cloudflare",nNoCf)+chip("wf","norw",U.f,"Nur Cloudflare",nNoRw)+'</div>';
}

function vWeb(){
  var tab=U.tab, rc=F.D.railwayCosts;
  var sub=S&&S.fetchedAt?"Stand "+new Date(S.fetchedAt).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"})+" · "+relAgo(S.fetchedAt):(sBusy?"Lade Railway &amp; Cloudflare …":"");
  var right='<button class="btn" data-act="wrefresh"'+(sBusy?" disabled":"")+'>↻ Aktualisieren</button><button class="btn" data-act="wprices">'+F.svg("gear")+' Preise</button>';
  var tabs=[["bill","Abrechnung"],["rw","Railway"],["cf","Cloudflare"]];
  return F.head("Websites",sub+(rc&&rc.totalEur!=null?' · Railway gesamt <span class="money">'+eur0(rc.totalEur)+'</span> in den letzten 30 Tagen':''),right)+
    kpisTech()+
    '<div class="w-tools"><div class="subnav" role="tablist">'+tabs.map(function(t){ return '<button data-act="wtab:'+t[0]+'" aria-current="'+(tab===t[0])+'">'+t[1]+'</button>'; }).join("")+'</div>'+
    '<input class="f" type="search" placeholder="'+(tab==="bill"?"Website, Domain oder Kunde filtern …":"Projekt, Domain oder Service filtern …")+'" data-wq data-keepfocus="wq" value="'+esc(U.q)+'" aria-label="Filtern"></div>'+
    (tab!=="bill"?techChips():'')+
    (tab==="rw"?vRailway():tab==="cf"?vCloudflare():vBill());
}

/* ---------- Bearbeiten (Seitenpanel) ---------- */
var drawerKey=null;
function drawerHtml(){
  var s=siteBy(drawerKey); if(!s) return '<div class="row-between"><h2>Website</h2><button class="btn icon" data-close aria-label="Schließen">'+F.svg("close")+'</button></div><div class="empty">Diese Website gibt es nicht mehr.</div>';
  var c=cfg(s), P=prices(), n=+P.period||12, lines=siteLines(s,c), sum=siteSum(s,c), li=lastInv(s.key), K=esc(s.key), recs=invRecs(s.key).slice().reverse();
  var per=function(k){ return eur(+P[k]||0)+' / '+(P[k+"Per"]==="year"?"Jahr":"Monat"); };
  var opt=function(f,label,sub){ return '<label class="w-opt"><input type="checkbox" data-wf="'+f+'"'+(c[f]?" checked":"")+'><span>'+label+'</span><span class="num money">'+(sub||"")+'</span></label>'; };
  var head='<div class="row-between" style="align-items:flex-start"><div style="min-width:0"><div class="sec-t">'+(c.own?"Eigenes Projekt":"Kunden-Website")+'</div><h2 style="overflow-wrap:anywhere">'+esc(s.name)+'</h2>'+
    (s.url?'<a class="w-url" href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.url.replace(/^https:\/\//,""))+' ↗</a>':'<span class="muted">ohne Domain</span>')+
    '<div class="row wrap" style="margin-top:6px">'+(s.up===false?'<span class="tag bad">offline</span>':s.up?'<span class="tag ok">online</span>':'<span class="tag grey">ohne Cloudflare</span>')+(s.rwId?rwTag(s.status):'')+(s.rwId?'<a class="link" href="https://railway.com/project/'+encodeURIComponent(s.rwId)+(s.envId?'?environmentId='+encodeURIComponent(s.envId):'')+'" target="_blank" rel="noopener">Railway ↗</a>':'')+'</div></div>'+
    '<button class="btn icon" data-close aria-label="Schließen">'+F.svg("close")+'</button></div>';
  if(!B) return head+'<div class="empty">Lade Abrechnung …</div>';
  var costs='<div class="w-sec"><div class="sec-t">Echte Kosten</div>'+costDetail(s,c).replace('class="w-cd"','class="w-cd" style="grid-template-columns:minmax(0,1fr);padding-top:0"')+'</div>';
  if(c.own) return head+'<div class="notice"><span>Wird nicht verrechnet.</span><button class="btn" data-act="wown:'+K+'|0">Als Kundenprojekt führen</button></div>'+costs;
  return head+
    '<div class="w-sec" data-wdkey="'+K+'"><div class="row wrap">'+stateTag(c)+'</div>'+
      '<div class="row wrap"><button class="btn'+(c.active&&sum>0?" primary":"")+'" data-act="wbill:'+K+'"'+(c.active&&sum>0?"":" disabled")+'>Verrechnen · <span class="money">'+eur(sum)+'</span></button>'+(li?'<button class="btn" data-act="wunbill:'+K+'">↺ Letzte zurücknehmen</button>':'')+'</div>'+
      '<label class="fl">Kunde (sevDesk)<input class="f" data-wf="customer" list="wContacts" value="'+esc(c.customer)+'" placeholder="'+esc(s.name)+'" autocomplete="off"></label><datalist id="wContacts"></datalist>'+
      '<div><div class="sec-t">Was wird verrechnet?</div>'+
        opt("active","Aktiv – wird verrechnet","")+
        opt("domain",esc(P.domainLabel||"Domain"),per("domain"))+
        opt("hosting",esc(P.hostingLabel||"Hosting"),per("hosting"))+
        opt("mail",esc(P.mailLabel||"E-Mail"),per("mail")+(c.mail&&c.mailQty>1?" × "+c.mailQty:""))+
        (c.mail?'<label class="w-qty">Anzahl Postfächer <input class="f num" type="number" min="1" step="1" data-wf="mailQty" value="'+c.mailQty+'"></label>':'')+
      '</div>'+
      '<div class="grid2"><label class="fl">Freier Betrag pro Abrechnung (€)<input class="f num" type="number" step="0.01" min="0" data-wf="extra" value="'+(c.extra||"")+'" placeholder="0,00"></label><label class="fl">wofür?<input class="f" data-wf="extraLabel" value="'+esc(c.extraLabel)+'" placeholder="Zusatzleistung"></label></div>'+
      '<div class="w-card"><h3>Rechnung pro '+(PERLBL[n]||n+" Monate")+' ('+(P.gross?"brutto":"netto")+')</h3>'+(lines.length?lines.map(function(l){ return '<div class="w-line"><span>'+esc(l.name)+'</span><b class="num money">'+eur(l.amount)+'</b></div>'; }).join("")+'<div class="w-line tot"><span>Summe</span><b class="num money">'+eur(sum)+'</b></div>':'<div class="muted">Noch nichts angehakt.</div>')+'</div>'+
    '</div>'+costs+
    '<div class="w-sec"><div class="sec-t">Abrechnungen</div>'+(recs.length?'<div class="w-dl">'+recs.map(function(r){ return '<div>'+invInfo(r)+(r.from&&r.to?'<div class="muted">Zeitraum '+de(r.from)+' – '+de(r.to)+'</div>':'')+'</div>'; }).join("")+'</div>':'<span class="muted">Noch keine.</span>')+'</div>'+
    '<div><button class="btn" data-act="wown:'+K+'|1">Zu „Eigene Projekte“ verschieben</button></div>';
}
function drawerRender(){
  if(!drawerKey) return;
  var d=document.getElementById("drawer"), ae=document.activeElement, f=ae&&d.contains(ae)?ae.getAttribute("data-wf"):null, sel=null, top=d.scrollTop;
  try{ sel=f?ae.selectionStart:null; }catch(e){}
  F.openDrawer(drawerHtml(),drawerRender); d.scrollTop=top;
  if(f){ var el=d.querySelector('[data-wf="'+f+'"]'); if(el){ el.focus(); try{ if(sel!=null) el.setSelectionRange(sel,sel); }catch(e){} } }
  var dl=document.getElementById("wContacts");
  if(dl&&F.loadMeta) F.loadMeta(function(m){ var x=document.getElementById("wContacts"); if(x&&!x.childNodes.length) x.innerHTML=(m.contacts||[]).map(function(c){ return '<option value="'+esc(c.name)+'"></option>'; }).join(""); });
}
function openSite(key){ drawerKey=key; if(!B&&!bBusy) loadBilling(); if(!R) loadCosts(false); drawerRender(); }

/* ---------- Speichern ---------- */
function setSite(key,patch){
  if(!B) return Promise.resolve();
  B.sites=B.sites||{}; B.sites[key]=Object.assign({},B.sites[key]||{},patch);
  setTimeout(rerender,0);
  return billPost({op:"site",key:key,patch:patch});
}
F.listen("change","[data-wf]",function(el){
  var box=el.closest("[data-wdkey]"); if(!box) return;
  var key=box.getAttribute("data-wdkey"), f=el.getAttribute("data-wf"), v=el.type==="checkbox"?el.checked:el.value, patch={};
  if(f==="extra"){ v=parseFloat(v); if(!isFinite(v)||v<0) v=0; }
  if(f==="mailQty"){ v=parseInt(v,10); if(!(v>0)) v=1; }
  if(typeof v==="string") v=v.trim();
  patch[f]=v; setSite(key,patch);
});
F.listen("keydown","[data-wf]",function(el,e){ if(e.key==="Enter"&&el.tagName==="INPUT"&&el.type!=="checkbox"){ e.preventDefault(); el.blur(); } });

function billSite(key){
  var s=siteBy(key); if(!s||!B) return;
  var c=cfg(s), P=prices(), n=+P.period||12, lines=siteLines(s,c);
  if(!lines.length){ F.toast("Für diese Website ist nichts zum Verrechnen angehakt",true); return; }
  var from=c.billedUntil?ymdAdd(c.billedUntil,1):(yearly()?F.D.today.slice(0,4)+"-01-01":F.D.today), to=yearly()?from.slice(0,4)+"-12-31":ymdAdd(ymdAddM(from,n),-1);
  var tax=+P.taxRate; if(!isFinite(tax)) tax=20;
  var span=de(from)+" – "+de(to);
  var go=function(){ F.closeDrawer(); F.openInvoice({title:"Rechnung · "+s.name,contactName:c.customer||s.name,address:c.customer||s.name,deliveryDate:from,
    headText:"Leistungen für "+(s.domain||s.name)+" im Zeitraum "+span+".",
    items:lines.map(function(l){ return {name:l.name,text:"Zeitraum "+span,qty:1,priceGross:Math.round((P.gross?l.amount:l.amount*(1+tax/100))*100)/100,taxRate:tax}; }),
    after:{billing:{key:"site:"+key,from:from,to:to,label:s.name},siteCustomer:c.customer?null:key},
    onDone:function(){ loadBilling(); }}); };
  if(c.billedUntil&&!siteDue(c)) F.confirm("Bereits verrechnet bis "+de(c.billedUntil)+". Trotzdem den nächsten Zeitraum ("+span+") verrechnen?","Weiter",go);
  else go();
}

/* ---------- Preise ---------- */
function openPrices(){
  var P=prices();
  var row=function(k,lbl,ph){ return '<b>'+lbl+'</b><input class="f lb" name="'+k+'Label" value="'+esc(P[k+"Label"]||"")+'" placeholder="'+ph+'" aria-label="'+lbl+' – Bezeichnung auf der Rechnung"><input class="f num" name="'+k+'" type="number" step="0.01" min="0" value="'+(+P[k]?esc(P[k]):"")+'" placeholder="0,00" aria-label="'+lbl+' – Preis in €"><select class="f" name="'+k+'Per" aria-label="'+lbl+' – je">'+(k==="domain"?'<option value="year">je Jahr</option><option value="month">je Monat</option>':'<option value="month">je Monat</option><option value="year">je Jahr</option>').replace('value="'+P[k+"Per"]+'"','value="'+P[k+"Per"]+'" selected')+'</select>'; };
  F.modal('<form data-form="wprices" class="stackf"><div class="row-between"><h2 style="font-size:20px">Preise &amp; Abrechnung</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Gilt für alle Kunden-Websites. Pro Website hakst du an, was verrechnet wird – der freie Betrag kommt pro Abrechnung dazu.</p>'+
    '<div class="w-pgrid"><span class="h">Leistung</span><span class="h">Bezeichnung auf der Rechnung</span><span class="h">Preis €</span><span class="h">je</span>'+row("domain","Domain","Domain")+row("hosting","Hosting","Hosting &amp; Wartung")+row("mail","E-Mail","E-Mail-Postfach")+'</div>'+
    '<div class="grid2"><label class="fl">Abrechnungszeitraum<select class="f" name="period">'+[["12","jährlich"],["6","halbjährlich"],["3","quartalsweise"],["1","monatlich"]].map(function(o){ return '<option value="'+o[0]+'"'+(String(P.period||12)===o[0]?" selected":"")+'>'+o[1]+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Preise sind<select class="f" name="gross"><option value="1"'+(P.gross?" selected":"")+'>brutto (inkl. USt)</option><option value="0"'+(P.gross?"":" selected")+'>netto (zzgl. USt)</option></select></label>'+
    '<label class="fl">USt-Satz %<input class="f num" name="taxRate" type="number" step="1" min="0" value="'+esc(P.taxRate!=null?P.taxRate:20)+'"></label></div>'+
    '<label class="row small" style="gap:8px"><input type="checkbox" name="yearStart"'+(P.yearStart!==false?" checked":"")+'> Bei jährlicher Abrechnung immer am <b>1.1.</b> für das Kalenderjahr verrechnen (vorher nicht als „zu verrechnen“ zählen)</label>'+
    '<div class="foot"><span class="err" id="wpErr"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Speichern</button></span></div></form>',"wide");
}
F.form("wprices",function(f){
  var pr={}; ["domain","hosting","mail"].forEach(function(k){ pr[k]=f[k].value; pr[k+"Per"]=f[k+"Per"].value; pr[k+"Label"]=f[k+"Label"].value.trim(); });
  pr.period=f.period.value; pr.gross=f.gross.value==="1"; pr.taxRate=f.taxRate.value; pr.yearStart=!!f.yearStart.checked;
  var err=document.getElementById("wpErr"), btn=f.querySelector("[type=submit]"); err.textContent=""; btn.disabled=true; btn.textContent="Speichere …";
  billPost({op:"prices",prices:pr}).then(function(j){ if(j&&j.ok){ F.closeModal(); F.toast("Preise gespeichert"); } else { btn.disabled=false; btn.textContent="Speichern"; err.textContent="Fehler beim Speichern"+(j&&j.error?": "+j.error:""); } });
});

/* ---------- Aktionen ---------- */
F.action("wtab",function(k){ U.tab=k; if(k!=="bill") U.bf="all"; F.render(); });
F.action("wf",function(k){ U.f=U.f===k?"all":k; F.render(); });
F.action("wbf",function(k){ if(U.tab!=="bill") U.tab="bill"; U.bf=U.bf===k?"all":k; F.render(); });
F.action("wrefresh",function(){ loadSites(true); F.render(); });
F.action("wcosts",function(){ loadCosts(true); });
F.listen("change","[data-w4y]",function(el){ var key=el.getAttribute("data-w4y"), site=sitesAll().find(function(x){return x.key===key;}); if(!site) return;
  var cur=cfg(site).w4y.slice(), i=cur.indexOf(el.value); if(el.checked&&i<0) cur.push(el.value); if(!el.checked&&i>-1) cur.splice(i,1); setSite(key,{w4y:cur}); });
F.listen("change","[data-w4yqty]",function(el){ var v=parseInt(el.value,10); setSite(el.getAttribute("data-w4yqty"),{w4yQty:v>0?v:1}); });
F.action("wbillreload",function(){ loadBilling(); F.render(); });
F.action("wprices",function(){ if(!B){ loadBilling(); F.toast("Abrechnung wird geladen – bitte gleich nochmal",true); return; } openPrices(); });
F.action("wsite",function(key){ openSite(key); });
F.action("website",function(key){ F.go("web"); openSite(key); });
F.action("wexp",function(key){ U.exp[key]=!U.exp[key]; if(!R) loadCosts(false); F.render(); });
F.action("wbill",billSite);
F.action("wtg",function(arg){ var i=arg.lastIndexOf("|"), key=arg.slice(0,i), f=arg.slice(i+1), s=siteBy(key); if(!s||!B) return; var patch={}; patch[f]=!cfg(s)[f]; setSite(key,patch); });
F.action("wown",function(arg){ var i=arg.lastIndexOf("|"), key=arg.slice(0,i), v=arg.slice(i+1)==="1", s=siteBy(key);
  setSite(key,{own:v}).then(function(j){ if(j&&j.ok) F.toast((s?s.name+": ":"")+(v?"zu „Eigene Projekte“ verschoben":"wieder bei den Kunden-Websites"),false,"Rückgängig",function(){ setSite(key,{own:!v}); }); }); });
F.action("wunbill",function(key){
  var rec=lastInv(key), s=siteBy(key); if(!rec) return;
  F.confirm("Letzte Abrechnung von „"+(s?s.name:key)+"“ ("+(rec.nr||"Entwurf")+", "+eur(rec.gross)+") zurücknehmen? Die Rechnung in sevDesk bleibt bestehen – bitte dort bei Bedarf löschen oder stornieren.","Zurücknehmen",function(){
    billPost({op:"unbill",key:"site:"+key}).then(function(j){ if(j&&j.ok) F.toast("Abrechnung zurückgenommen",false,"Rückgängig",function(){ billPost({op:"invoice",key:"site:"+key,invoice:rec}).then(function(k){ if(k&&k.ok) F.toast("Abrechnung wiederhergestellt"); }); }); });
  },true);
});
F.listen("input","[data-wq]",function(el){ U.q=el.value; clearTimeout(el._d); el._d=setTimeout(F.render,200); });

F.searcher(function(q){
  if(!F.D) return [];
  return sitesAll().filter(function(s){ var c=cfg(s); return (s.name+" "+(s.domains||[]).join(" ")+" "+(c.customer||"")).toLowerCase().indexOf(q)>-1; }).slice(0,6).map(function(s){ var c=cfg(s);
    return {group:"Websites",label:s.name,sub:[s.domain||"",c.own?"eigenes Projekt":c.customer||"",s.up===false?"offline":""].filter(Boolean).join(" · "),act:"website:"+s.key}; });
});

F.view({id:"web",label:"Websites",short:"Web",icon:"web",order:60,
  count:function(){ return (F.D.sites||[]).filter(function(s){ return !s.own&&siteBad(s); }).length; },
  render:vWeb,
  after:function(){ loadSites(false); if((!B&&!bBusy&&Date.now()-bTry>15000)||(bStale&&!bBusy)) loadBilling(); if(!R) loadCosts(false); }
});
})();
