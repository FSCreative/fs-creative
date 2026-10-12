/* Plattformen › Hüttengaudi: Idle-Game (iOS) – Edelweiß-Pakete, Nutzung, Fortschritt, Ereignisse, Feedback, Fehler und Steuerung der App.
   Daten: F.D.huettengaudi (server.js huettengaudiStats) – {configured:false} solange HUETTENGAUDI_STATS_URL fehlt.
   Steuerung: POST /admin/api/huettengaudi/config|feedback|fehler|aufraeumen (server.js leitet mit Token an das App-Backend weiter, der Browser sieht es nie). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, deShort=F.deShort;

F.css(
'.hg-chart{padding:14px 18px 12px;container-type:inline-size}'+
'.hg-cols{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:end;height:170px;border-bottom:1px solid var(--line)}'+
'.hg-col{height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:stretch;min-width:0}'+
'.hg-n{font-size:11px;color:var(--ink-3);text-align:center;font-family:var(--f-mono);margin-bottom:3px;min-height:14px}'+
'.hg-g{position:relative;background:var(--glow-soft);border:1px solid var(--glow);border-bottom:0;border-radius:5px 5px 0 0;min-height:0}'+
'.hg-g.solid{background:var(--info);border-color:var(--info)}'+
'.hg-g i{position:absolute;left:0;right:0;bottom:0;background:var(--glow);border-radius:4px 4px 0 0}'+
'.hg-col.cur .hg-g{box-shadow:0 0 0 2px var(--ink) inset}'+
'.hg-lab{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;margin-top:6px;font-size:11.5px;color:var(--ink-3);text-align:center}'+
'.hg-lab b{font-weight:400}.hg-lab .s{display:none}'+
'@container (max-width:420px){.hg-lab .l{display:none}.hg-lab .s{display:inline}}'+
'.hg-leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2);margin-bottom:10px}'+
'.hg-leg span::before{content:"";display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:var(--c)}'+
'.hg-days{display:grid;grid-template-columns:repeat(30,minmax(0,1fr));gap:2px;align-items:end;height:110px;border-bottom:1px solid var(--line)}'+
'.hg-day{height:100%;display:flex;flex-direction:column-reverse;min-width:0}'+
'.hg-day i{display:block;background:var(--c);min-height:0}'+
'.hg-day i:last-child{border-radius:3px 3px 0 0}'+
'.hg-dlab{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-3);margin-top:5px}'+
'.hg-mini{display:flex;gap:8px 18px;flex-wrap:wrap;padding:12px 18px;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}'+
'.hg-mini b{font:700 18px var(--f-mono);color:var(--ink);margin-right:4px}'+
'.hg-welten{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}'+
'.hg-welt{padding:14px 18px;border-bottom:1px solid var(--line);display:grid;gap:8px;align-content:start}'+
'.hg-welt:nth-child(odd){border-right:1px solid var(--line)}'+
'.hg-welt h3{font-size:15px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}'+
'.hg-welt h3 span{font:400 12.5px var(--f-body);color:var(--ink-3)}'+
'.hg-fr{display:grid;grid-template-columns:58px minmax(0,1fr) 88px 36px;gap:10px;align-items:center;font-size:12.5px}'+
'.hg-fr.pk{grid-template-columns:minmax(0,170px) minmax(0,1fr) 88px}'+
'.hg-fr .j{text-align:right}.hg-fr .j .tag{margin:0}'+
'.hg-fr .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.hg-fr .r{text-align:right;font-family:var(--f-mono);font-variant-numeric:tabular-nums;white-space:nowrap}'+
'.hg-ft{height:10px;border-radius:99px;background:var(--sunk);overflow:hidden}'+
'.hg-ft i{display:block;height:100%;background:var(--glow);border-radius:99px}'+
'.hg-ft.ok i{background:var(--ok)}'+
'.hg-bars{display:grid;gap:8px;padding:14px 18px}'+
'.hg-list{list-style:none;margin:0;padding:0}'+
'.hg-list>li{padding:12px 18px;border-bottom:1px solid var(--line);display:grid;gap:6px}'+
'.hg-list>li:last-child{border-bottom:0}'+
'.hg-list>li.done{opacity:.55}'+
'.hg-list .h{display:flex;gap:6px 10px;align-items:center;flex-wrap:wrap;font-size:13px}'+
'.hg-list .h .link{margin-left:auto}'+
'.hg-list p{margin:0;font-size:14.5px;white-space:pre-wrap;overflow-wrap:anywhere}'+
'.hg-list details summary{cursor:pointer;font-size:14px;list-style:none;overflow-wrap:anywhere}'+
'.hg-list details summary::-webkit-details-marker{display:none}'+
'.hg-code{margin:8px 0 0;padding:12px 14px;background:var(--sunk);border:1px solid var(--line);border-radius:10px;font:12.5px/1.55 var(--f-mono);color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto}'+
'.hg-kv{list-style:none;margin:0;padding:0}'+
'.hg-kv li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:7px 18px;border-bottom:1px solid var(--line);font-size:13.5px}'+
'.hg-kv li:last-child{border-bottom:0}'+
'.hg-kv .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.hg-sub{padding:10px 18px 4px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3)}'+
'.hg-recent{list-style:none;margin:0;padding:0}'+
'.hg-recent li{display:grid;grid-template-columns:54px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 18px;border-bottom:1px solid var(--line);font-size:13.5px}'+
'.hg-recent li:last-child{border-bottom:0}'+
'.hg-recent .nm{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}'+
'.hg-ctl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}'+
'.hg-ci{padding:12px 18px;border-bottom:1px solid var(--line);display:grid;gap:4px;align-content:start;min-width:0}'+
'.hg-ci:not(:nth-child(3n)){border-right:1px solid var(--line)}'+
'.hg-ci .k{font-size:12.5px;color:var(--ink-3);display:flex;gap:8px;align-items:center;flex-wrap:wrap}'+
'.hg-ci .v{font-weight:600;font-size:14.5px;overflow-wrap:anywhere}'+
'.hg-ci p{margin:0;font-size:13.5px;color:var(--ink-2);white-space:pre-wrap;overflow-wrap:anywhere}'+
'.hg-werte{padding:8px 18px;font-size:13px;border-top:1px solid var(--line)}.hg-werte b{font-family:var(--f-mono);margin-left:3px}'+
'.hg-foot{padding:10px 18px;font-size:13px;display:flex;gap:8px 16px;flex-wrap:wrap;align-items:center;justify-content:space-between}'+
'.hg-form fieldset{border:1px solid var(--line);border-radius:12px;padding:10px 14px 14px;margin:0;display:grid;gap:10px;min-width:0}'+
'.hg-form legend{font-weight:700;font-size:14px;padding:0 6px}'+
'.hg-form .hint{font-size:12.5px;color:var(--ink-3)}'+
'.hg-diff{margin:0;padding-left:18px;display:grid;gap:6px;font-size:14px}'+
'.hg-diff li{overflow-wrap:anywhere}'+
'.hg-warn{padding:10px 12px;border-radius:10px;background:var(--warn-soft);font-size:13.5px}'+
'.hg-empty{padding:26px clamp(18px,3vw,32px);display:grid;gap:18px}'+
'.hg-empty h2{font-size:22px}'+
'.hg-empty p{margin:0;color:var(--ink-2);max-width:68ch}'+
'.hg-steps{list-style:none;margin:0;padding:0;display:grid;gap:16px;counter-reset:hg}'+
'.hg-steps>li{display:grid;grid-template-columns:30px minmax(0,1fr);gap:12px;counter-increment:hg}'+
'.hg-steps>li::before{content:counter(hg);width:28px;height:28px;border-radius:50%;background:var(--glow);color:#2a1a00;display:grid;place-items:center;font-weight:700;font-size:14px}'+
'.hg-steps h3{font-size:16px;margin-bottom:4px}'+
'.hg-vars{display:grid;gap:8px;margin-top:8px}'+
'.hg-var{display:grid;grid-template-columns:minmax(0,230px) minmax(0,1fr);gap:4px 14px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:13.5px}'+
'.hg-var code{font:600 13px var(--f-mono);overflow-wrap:anywhere}'+
'.hg-fields{margin:8px 0 0;padding-left:18px;color:var(--ink-2);font-size:13.5px;display:grid;gap:3px}'+
'.hg-fields code{font:12.5px var(--f-mono);color:var(--ink)}'+
'@media (max-width:900px){.hg-cols{gap:3px;height:150px}.hg-lab{gap:3px;font-size:10.5px}.hg-n{font-size:9.5px}.hg-days{gap:1px}'+
  '.hg-welten,.hg-ctl{grid-template-columns:minmax(0,1fr)}.hg-welt:nth-child(odd),.hg-ci:not(:nth-child(3n)){border-right:0}'+
  '.hg-fr{grid-template-columns:52px minmax(0,1fr) 84px 34px}.hg-fr.pk{grid-template-columns:minmax(0,120px) minmax(0,1fr) 84px}.hg-var{grid-template-columns:minmax(0,1fr)}.hg-recent li{grid-template-columns:46px minmax(0,1fr) auto;padding:10px 14px}}'
);

/* ---------- Hilfen (wie skikaiser.js) ---------- */
var MON=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
function c2e(v){ return (+v||0)/100; }
function money(v,cls){ return '<span class="money num'+(cls?" "+cls:"")+'">'+eur(v)+'</span>'; }
function num(n){ return (+n||0).toLocaleString("de-AT"); }
function dez(n,d){ return (+n||0).toLocaleString("de-AT",{maximumFractionDigits:d==null?1:d}); }
function pct(v,d){ return (v*100).toLocaleString("de-AT",{maximumFractionDigits:d==null?1:d})+" %"; }
function plat(p){ var s=String(p||""); if(/ios|apple|app ?store|iphone|ipad/i.test(s)) return "iOS"; if(/android|google|play/i.test(s)) return "Android"; return s||"unbekannt"; }
function sec(title,right,body){ return '<section class="panel"><div class="panel-h"><h2>'+title+'</h2>'+(right||"")+'</div>'+body+'</section>'; }
function kpi(k,v,s,o){ return F.platKpi?F.platKpi(k,v,s,o):'<div class="panel kpi"><span class="k">'+k+'</span><span class="v num">'+v+'</span><span class="s">'+(s||"")+'</span></div>'; }
function ago(iso){ var t=Date.parse(iso||""); if(!t) return ""; var m=Math.round((Date.now()-t)/60000); if(m<60) return "vor "+Math.max(1,m)+" Min."; var h=Math.round(m/60); if(h<36) return "vor "+h+" Std."; return deShort(String(iso).slice(0,10)); }
function dt(iso){ var t=Date.parse(iso||""); return t?new Date(t).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):""; }
function dauer(min){ var m=Math.round(+min||0); return m<60?m+" Min.":Math.floor(m/60)+" Std. "+String(m%60).padStart(2,"0")+" Min."; }
function kuerzen(s,n){ s=String(s==null?"":s); return s.length>n?s.slice(0,n-1)+"…":s; }
function onOff(b){ return b?'<span class="tag ok">an</span>':'<span class="tag grey">aus</span>'; }
function HG(){ return F.D&&F.D.huettengaudi; }

/* ---------- Leerzustand: Einrichtung ---------- */
function hgVar(name,text){ return '<div class="hg-var"><code>'+name+'</code><span>'+text+'</span></div>'; }
function setupHelp(){
  return '<ol class="hg-steps">'+
    '<li><div><h3>App-Backend in Railway</h3><p>Das Backend liegt im Spiel-Projekt unter <code>Tools/backend/server.ts</code> (Bun, eine Datei, Vorlage wie Skikaiser). In Railway als Function mit Postgres in der EU anlegen und diese Variablen setzen:</p><div class="hg-vars">'+
      hgVar("DATABASE_URL","Verbindung zur Postgres-Datenbank (setzt Railway beim Verknüpfen)")+
      hgVar("HUETTENGAUDI_SECRET","Signatur-Schlüssel für die Meldungen der App – derselbe steckt in der App (Resources/HgApi.txt, nicht im Repo)")+
      hgVar("STATS_TOKEN","Langes, zufälliges Token nur für das Cockpit")+'</div></div></li>'+
    '<li><div><h3>Variablen im Cockpit setzen</h3><p>Im Railway-Service der FS-Creative-Website unter <b>Variables</b> eintragen. Railway startet den Dienst danach neu.</p><div class="hg-vars">'+
      hgVar("HUETTENGAUDI_STATS_URL","Adresse des Statistik-Endpunkts ohne Token, also <code>https://&lt;backend&gt;/v1/stats</code>")+
      hgVar("HUETTENGAUDI_STATS_TOKEN","Dasselbe Token wie <code>STATS_TOKEN</code> im Backend. Es bleibt am Server, der Browser sieht es nie.")+'</div></div></li>'+
    '<li><div><h3>Was du dann siehst und steuerst</h3><ul class="hg-fields">'+
      '<li>Umsatz und Erlös der Edelweiß-Pakete, Downloads, aktive Spieler, Geräte und Versionen</li>'+
      '<li>Fortschritt je Welt (Stufen 1–10), Spielzeit, Edelweiß, Boni und Ereignisse der letzten 30 Tage</li>'+
      '<li>Feedback und Fehler aus dem Spiel (erledigt / behoben markieren)</li>'+
      '<li>Steuerung über <code>GET /v1/config</code>: Ankündigung, Wartung, Mindestversion, Einnahmen-Aktion, Pakete und Video an/aus, Gas-Dauer und -Pause</li>'+
    '</ul></div></li>'+
  '</ol>';
}
function emptyState(){
  return '<section class="panel hg-empty"><div><span class="tag glow">Noch nicht verbunden</span></div>'+
    '<div style="display:grid;gap:8px"><h2>Hüttengaudi verbinden</h2><p>Sobald das App-Backend läuft, siehst du hier die kompletten Statistiken der App und steuerst sie direkt aus dem Cockpit: Ankündigungen, Wartungshinweis, Einnahmen-Aktionen und Notschalter. Der Erlös fließt auch in die Einkommens-Prognose ein.</p>'+
    '<p>Dafür braucht es zwei Dinge: das Backend in Railway und zwei Variablen im Dienst der Website.</p></div>'+setupHelp()+'</section>';
}

/* ---------- Kopf: Kennzahlen ---------- */
function kopf(s){
  var t=s.totals||{}, u=s.users||{}, gross=c2e(t.grossCents), proc=c2e(t.proceedsCents), cnt=+t.count||0;
  var inc=((F.D.income&&F.D.income.lines)||[]).find(function(l){return l.key==="huettengaudi";});
  return '<div class="kpis">'+
    kpi("Erlös nach Store-Gebühr",'<span class="money">'+eur(proc)+'</span>','brutto <span class="money">'+eur(gross)+'</span> · '+esc(F.D.year)+(inc?' · Prognose <span class="money">'+F.eur0(inc.monthly)+'</span> / Monat':''),{vcls:"ok-t"})+
    kpi("Käufe",num(cnt),(u.kaeufer!=null?num(u.kaeufer)+" Käufer · ":"")+(cnt?'Ø <span class="money">'+eur(gross/cnt)+'</span>':"noch keine")+(+t.refunds?" · "+num(t.refunds)+" erstattet":""))+
    kpi("Downloads",num(u.gesamt),"neu heute "+num(u.neuHeute)+" · 7 Tage "+num(u.neu7)+" · 30 Tage "+num(u.neu30))+
    kpi("Aktiv heute",num(u.aktivHeute),"7 Tage "+num(u.aktiv7)+" · 30 Tage "+num(u.aktiv30))+
  '</div>';
}

/* ---------- Monats-Säulen (12 Spalten wie Skikaiser) ---------- */
function cols(rows,aria){
  var mx=Math.max.apply(null,rows.map(function(r){return +r.v||0;}).concat([1]));
  var cur=String(F.D.year)===F.D.today.slice(0,4)?+F.D.today.slice(5,7)-1:-1;
  return '<div class="hg-cols" role="img" aria-label="'+esc(aria)+'">'+rows.map(function(r,i){ var h=(+r.v||0)/mx*100;
      return '<div class="hg-col'+(i===cur?" cur":"")+'" title="'+esc(r.title)+'"><span class="hg-n">'+(r.n||"")+'</span>'+
        (h>0?'<div class="hg-g'+(r.cls?" "+r.cls:"")+'" style="height:'+h.toFixed(2)+'%">'+(r.inner!=null?'<i style="height:'+(r.inner*100).toFixed(2)+'%"></i>':'')+'</div>':'')+'</div>'; }).join("")+'</div>'+
    '<div class="hg-lab">'+MON.map(function(m){return '<span title="'+m+'"><b class="l">'+m+'</b><b class="s">'+m.charAt(0)+'</b></span>';}).join("")+'</div>';
}
function umsatzChart(s){
  var map={}; (s.byMonth||[]).forEach(function(m){ map[m.month]=m; });
  var rows=MON.map(function(m,i){ var k=F.D.year+"-"+String(i+1).padStart(2,"0"), r=map[k]||{grossCents:0,proceedsCents:0,count:0}, g=+r.grossCents||0;
    return {v:g,inner:g?(+r.proceedsCents||0)/g:0,n:r.count?num(r.count):"",cls:"money",title:m+": "+num(r.count)+" Käufe · "+eur(c2e(g))+" brutto · "+eur(c2e(r.proceedsCents))+" Erlös"}; });
  return sec("Umsatz je Monat",'<span class="muted">'+esc(F.D.year)+'</span>','<div class="hg-chart"><div class="hg-leg"><span style="--c:var(--glow-soft)">Umsatz brutto</span><span style="--c:var(--glow)">Erlös nach Store-Gebühr</span><em class="muted" style="font-style:normal">Zahl = Käufe</em></div>'+cols(rows,"Umsatz je Monat")+'</div>');
}
function downloadChart(s){
  var map={}; ((s.users&&s.users.jeMonat)||[]).forEach(function(m){ map[m.monat]=m; });
  var sum=0, rows=MON.map(function(m,i){ var k=F.D.year+"-"+String(i+1).padStart(2,"0"), r=map[k]||{}, n=+r.neu||0; sum+=n;
    return {v:n,n:n?num(n):"",cls:"solid",title:m+": "+num(n)+" neue Geräte"+(r.ios!=null?" (iOS "+num(r.ios)+", Android "+num(r.android)+")":"")}; });
  return sec("Neue Downloads je Monat",'<span class="muted">'+num(sum)+' in '+esc(F.D.year)+' · erster Start je Gerät</span>','<div class="hg-chart">'+cols(rows,"Neue Downloads je Monat")+'</div>');
}

/* ---------- Steuerung (Fernsteuerung der App, GET /v1/config) ---------- */
function aktionStatus(a){
  if(!a||!a.aktiv) return ["aus","grey"];
  var bis=Date.parse(a.bis||""); if(bis&&bis<Date.now()) return ["abgelaufen","warn"];
  if(!(+a.faktor>1)) return ["an, Faktor ×1","warn"];
  return ["läuft","ok"];
}
function steuerung(s){
  var c=s.config;
  if(!c) return sec("Steuerung der App","",'<div class="empty">Die Steuerung wurde nicht mitgeliefert. Neu laden oder Backend prüfen.</div>');
  var a=c.aktion||{}, as=aktionStatus(a), an=c.ankuendigung||{}, wa=c.wartung||{};
  var item=function(k,v,p){ return '<div class="hg-ci"><span class="k">'+k+'</span>'+(v?'<span class="v">'+v+'</span>':'')+(p?'<p>'+p+'</p>':'')+'</div>'; };
  var body='<div class="hg-ctl">'+
    item("Ankündigung "+onOff(an.aktiv),"",an.text?esc(kuerzen(an.text,160)):'<span class="muted">kein Text</span>')+
    item("Wartungshinweis "+(wa.aktiv?'<span class="tag bad">an</span>':'<span class="tag grey">aus</span>'),"",wa.text?esc(kuerzen(wa.text,160)):'<span class="muted">kein Text</span>')+
    item('Einnahmen-Aktion <span class="tag '+as[1]+'">'+as[0]+'</span>',a.aktiv||a.titel?"×"+esc(dez(a.faktor,2))+(a.titel?" · "+esc(kuerzen(a.titel,60)):""):"",a.bis?(Date.parse(a.bis)<Date.now()?"endete ":"bis ")+esc(dt(a.bis)):(a.aktiv?"ohne Enddatum":""))+
    item("Mindestversion",esc(c.mindestVersion||"0.0.0"),c.storeUrl?'Store-Link: <a href="'+esc(c.storeUrl)+'" target="_blank" rel="noopener">'+esc(kuerzen(c.storeUrl.replace(/^https:\/\//,""),48))+'</a>':'<span class="muted">kein Store-Link</span>')+
    item("Angebote",'Edelweiß-Pakete '+onOff(c.pakete)+' Video '+onOff(c.video),(!c.pakete||!c.video)?'<span class="warn-t">Notschalter aktiv: '+[!c.pakete?"Pakete":"",!c.video?"Video":""].filter(Boolean).join(" und ")+' ausgeblendet</span>':"")+
    item("Gas geben",esc(c.gasMinuten)+" Min. doppelt",'danach '+esc(c.gasPauseStunden)+' Std. Pause (oder Video)')+
  '</div>';
  var right='<div class="row wrap">'+(s.configGeaendert?'<span class="muted">geändert '+esc(ago(s.configGeaendert))+'</span>':'')+'<button type="button" class="btn primary" data-act="hgcfg">Steuerung bearbeiten</button></div>';
  var foot='<div class="hg-foot"><span class="muted">Die App holt die Steuerung beim Start und regelmäßig im Spiel (Server-Cache 1 Minute).</span><button type="button" class="link" data-act="hgclean">Testdaten löschen</button></div>';
  return sec("Steuerung der App",right,(wa.aktiv?'<div class="notice" style="margin:12px 18px 0"><span><b>Wartungshinweis ist an.</b> Alle Spieler sehen ihn beim nächsten Abruf.</span></div>':'')+body+foot);
}

/* Formular im Dialog: so bleibt die Eingabe erhalten, auch wenn das Cockpit im Hintergrund neu lädt */
function isoLokal(iso){ var t=Date.parse(iso||""); if(!t) return ""; var d=new Date(t), p=function(n){ return String(n).padStart(2,"0"); }; return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); }
function chk(name,on,label){ return '<label class="chk"><input type="checkbox" name="'+name+'"'+(on?" checked":"")+'> '+label+'</label>'; }
function cfgForm(c){
  var a=c.aktion||{};
  return '<form data-form="hgcfg" class="stackf hg-form" novalidate><div class="row-between"><h2 style="font-size:20px">Hüttengaudi steuern</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Gilt für alle Spieler, sobald die App die Steuerung neu lädt. Vor dem Speichern siehst du alle Änderungen noch einmal.</p>'+
    '<fieldset><legend>Ankündigung</legend>'+chk("ank_aktiv",c.ankuendigung.aktiv,"Ankündigung im Spiel anzeigen")+
      '<label class="fl">Text (höchstens 300 Zeichen)<textarea class="f" name="ank_text" rows="2" maxlength="300" placeholder="z. B. Neue Welt ab Freitag!">'+esc(c.ankuendigung.text)+'</textarea></label></fieldset>'+
    '<fieldset><legend>Wartungshinweis</legend>'+chk("wart_aktiv",c.wartung.aktiv,"Wartungshinweis anzeigen")+
      '<label class="fl">Text (höchstens 300 Zeichen)<textarea class="f" name="wart_text" rows="2" maxlength="300" placeholder="z. B. Heute ab 22 Uhr kurze Wartung.">'+esc(c.wartung.text)+'</textarea></label></fieldset>'+
    '<fieldset><legend>Einnahmen-Aktion</legend>'+chk("akt_aktiv",a.aktiv,"Aktion läuft (Einnahmen × Faktor)")+
      '<div class="grid2"><label class="fl">Titel<input class="f" name="akt_titel" maxlength="300" value="'+esc(a.titel||"")+'" placeholder="Hüttengaudi-Wochenende ×2"></label>'+
      '<label class="fl">Faktor (1 bis 3)<input class="f num" name="akt_faktor" type="number" min="1" max="3" step="0.1" inputmode="decimal" value="'+esc(a.faktor!=null?a.faktor:1)+'"></label></div>'+
      '<label class="fl">Endet am (leer = bis du sie abschaltest)<input class="f" name="akt_bis" type="datetime-local" value="'+esc(isoLokal(a.bis))+'"></label>'+
      '<span class="hint">Die App rechnet mit dem Faktor, solange die Aktion an ist und das Ende nicht vorbei ist.</span></fieldset>'+
    '<fieldset><legend>App-Version</legend><div class="grid2"><label class="fl">Mindestversion<input class="f" name="min_version" value="'+esc(c.mindestVersion||"0.0.0")+'" placeholder="0.0.0" inputmode="decimal"></label>'+
      '<label class="fl">App-Store-Link<input class="f" name="store_url" type="url" maxlength="300" value="'+esc(c.storeUrl||"")+'" placeholder="https://apps.apple.com/…"></label></div>'+
      '<span class="hint">Ältere Versionen als die Mindestversion werden zum Aktualisieren aufgefordert. 0.0.0 = keine Sperre.</span></fieldset>'+
    '<fieldset><legend>Angebote (Notschalter)</legend>'+chk("pakete",c.pakete,"Edelweiß-Pakete im Shop anbieten")+chk("video",c.video,"Video-Angebot bei „Gas geben“ anbieten")+'</fieldset>'+
    '<fieldset><legend>Gas geben</legend><div class="grid2"><label class="fl">Dauer in Minuten (1 bis 60)<input class="f num" name="gas_min" type="number" min="1" max="60" step="1" value="'+esc(c.gasMinuten)+'"></label>'+
      '<label class="fl">Pause in Stunden (0 bis 48)<input class="f num" name="gas_pause" type="number" min="0" max="48" step="1" value="'+esc(c.gasPauseStunden)+'"></label></div></fieldset>'+
    '<div class="err" id="hgCfgErr"></div>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Weiter</button></span></div></form>';
}
F.action("hgcfg",function(){ var s=HG(); if(!s||!s.config){ F.toast("Steuerung nicht geladen",true); return; } F.UI.hgDraft=null; F.modal(cfgForm(s.config),"wide"); });
F.action("hgcfgback",function(){ var s=HG(); F.modal(cfgForm(F.UI.hgDraft||(s&&s.config)),"wide"); });
F.form("hgcfg",function(f){
  var err=document.getElementById("hgCfgErr"), bad=function(m){ if(err) err.textContent=m; };
  var faktor=parseFloat(String(f.akt_faktor.value).replace(",",".")), gm=Number(f.gas_min.value), gp=Number(f.gas_pause.value);
  var ver=String(f.min_version.value).trim()||"0.0.0", url=String(f.store_url.value).trim(), bisV=String(f.akt_bis.value||"");
  var bis=null; if(bisV){ var t=new Date(bisV); if(isNaN(t)) return bad("Das Ende der Aktion ist kein gültiges Datum."); bis=t.toISOString(); }
  var c={ankuendigung:{aktiv:f.ank_aktiv.checked,text:String(f.ank_text.value).trim()},wartung:{aktiv:f.wart_aktiv.checked,text:String(f.wart_text.value).trim()},
    mindestVersion:ver,storeUrl:url,aktion:{aktiv:f.akt_aktiv.checked,titel:String(f.akt_titel.value).trim(),faktor:Math.round(faktor*100)/100,bis:bis},
    pakete:f.pakete.checked,video:f.video.checked,gasPauseStunden:gp,gasMinuten:gm};
  if(c.ankuendigung.aktiv&&!c.ankuendigung.text) return bad("Die Ankündigung ist an, aber ohne Text.");
  if(c.wartung.aktiv&&!c.wartung.text) return bad("Der Wartungshinweis ist an, aber ohne Text.");
  if(c.ankuendigung.text.length>300||c.wartung.text.length>300||c.aktion.titel.length>300) return bad("Texte höchstens 300 Zeichen.");
  if(!(faktor>=1&&faktor<=3)) return bad("Der Faktor muss zwischen 1 und 3 liegen.");
  if(!(Number.isInteger(gm)&&gm>=1&&gm<=60)) return bad("Gas-Dauer: ganze Minuten von 1 bis 60.");
  if(!(Number.isInteger(gp)&&gp>=0&&gp<=48)) return bad("Gas-Pause: ganze Stunden von 0 bis 48.");
  if(!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(ver)) return bad("Mindestversion bitte als Zahl mit Punkten, z. B. 1.2.0.");
  if(url&&!/^(https:\/\/|itms-apps:\/\/)[^\s"'<>\\]+$/.test(url)) return bad("Der Store-Link muss mit https:// beginnen.");
  var s=HG(), d=diff(s&&s.config,c);
  if(!d.length){ F.closeModal(); F.toast("Keine Änderungen"); return; }
  F.UI.hgDraft=c;
  var warn=[];
  if(c.wartung.aktiv) warn.push("Der Wartungshinweis ist an – alle Spieler sehen ihn.");
  if(!c.pakete) warn.push("Die Edelweiß-Pakete werden in der App ausgeblendet.");
  if(!c.video) warn.push("Das Video-Angebot wird in der App ausgeblendet.");
  if(c.aktion.aktiv&&c.aktion.bis&&Date.parse(c.aktion.bis)<Date.now()) warn.push("Das Ende der Aktion liegt in der Vergangenheit – sie wirkt also nicht.");
  if(c.aktion.aktiv&&!c.aktion.titel) warn.push("Die Aktion hat keinen Titel.");
  F.modal('<div class="row-between"><h2 style="font-size:19px">Steuerung speichern?</h2>'+F.btnClose()+'</div><p class="muted" style="margin:0">Diese Änderungen gehen an alle Spieler:</p><ul class="hg-diff">'+d.join("")+'</ul>'+
    (warn.length?'<div class="hg-warn">'+warn.map(esc).join("<br>")+'</div>':'')+'<div class="err" id="hgCfgErr2"></div>'+
    '<div class="foot"><button type="button" class="btn" data-act="hgcfgback">Zurück</button><button type="button" class="btn primary" data-act="hgcfgsave">Jetzt speichern</button></div>',"narrow");
});
var FELDER=[
  ["Ankündigung",function(c){ return c.ankuendigung.aktiv?"an":"aus"; }],["Ankündigungstext",function(c){ return c.ankuendigung.text||"(leer)"; }],
  ["Wartungshinweis",function(c){ return c.wartung.aktiv?"an":"aus"; }],["Wartungstext",function(c){ return c.wartung.text||"(leer)"; }],
  ["Einnahmen-Aktion",function(c){ return c.aktion.aktiv?"an":"aus"; }],["Aktionstitel",function(c){ return c.aktion.titel||"(leer)"; }],
  ["Faktor",function(c){ return "×"+dez(c.aktion.faktor,2); }],["Aktion endet",function(c){ return c.aktion.bis?dt(c.aktion.bis):"ohne Ende"; }],
  ["Mindestversion",function(c){ return c.mindestVersion||"0.0.0"; }],["App-Store-Link",function(c){ return c.storeUrl||"(leer)"; }],
  ["Edelweiß-Pakete",function(c){ return c.pakete?"an":"aus"; }],["Video-Angebot",function(c){ return c.video?"an":"aus"; }],
  ["Gas-Dauer",function(c){ return c.gasMinuten+" Min."; }],["Gas-Pause",function(c){ return c.gasPauseStunden+" Std."; }]
];
function diff(alt,neu){
  var out=[]; FELDER.forEach(function(x){ var a=alt?x[1](alt):"", b=x[1](neu); if(a!==b) out.push('<li><b>'+esc(x[0])+':</b> '+(alt?'<span class="muted">'+esc(kuerzen(a,70))+'</span> → ':'')+esc(kuerzen(b,120))+'</li>'); });
  return out;
}
F.action("hgcfgsave",function(v,el){
  var c=F.UI.hgDraft; if(!c) return; if(el) el.disabled=true;
  var fail=function(m){ if(el) el.disabled=false; var e=document.getElementById("hgCfgErr2"); if(e) e.textContent="Nicht gespeichert: "+m; else F.toast("Nicht gespeichert: "+m,true); };
  F.api("/admin/api/huettengaudi/config",{body:c}).then(function(j){
    if(!(j&&j.ok)) return fail((j&&(j.fehler||j.error))||"unbekannter Fehler");
    var s=HG(); if(s){ s.config=j.config||c; s.configGeaendert=new Date().toISOString(); }
    F.UI.hgDraft=null; F.closeModal(); F.toast("Steuerung gespeichert. Die App übernimmt sie beim nächsten Abruf."); F.render();
  }).catch(function(){ fail("keine Verbindung zum Server"); });
});
F.action("hgclean",function(){
  F.confirm("Testdaten löschen? Sandbox-Käufe und alle Daten von Spielern mit „test“ oder „editor“ in der Version werden endgültig entfernt.","Testdaten löschen",function(){
    F.api("/admin/api/huettengaudi/aufraeumen",{body:{}}).then(function(j){
      if(!(j&&j.ok)){ F.toast("Löschen fehlgeschlagen: "+((j&&(j.fehler||j.error))||"unbekannt"),true); return; }
      F.toast("Testdaten gelöscht: "+num(j.spieler)+" Spieler, "+num(j.kaeufe)+" Käufe, "+num(j.feedback)+" Feedback, "+num(j.fehler)+" Fehler"); F.load(true);
    }).catch(function(){ F.toast("Keine Verbindung zum Server",true); });
  },true);
});

/* ---------- Fortschritt: Trichter je Welt, Spielzeit, Edelweiß, Boni ---------- */
function fortschritt(s){
  var fs=s.fortschritt; if(!fs) return "";
  var jetzt={}; (fs.verteilung||[]).forEach(function(v){ jetzt[v.welt+"-"+v.stufe]=+v.jetzt||0; });
  var fertigSumme=(fs.jeWelt||[]).reduce(function(a,w){ return a+(+w.fertig||0); },0);
  var mini='<div class="hg-mini"><span><b>'+num(fs.spieler)+'</b>Spieler mit Spielstand</span><span><b>'+esc(dauer(fs.schnittSpielzeitMin))+'</b>Ø Spielzeit</span>'+
    '<span><b>'+esc(dez(fs.edelweissSchnitt))+'</b>Ø Edelweiß</span>'+(fs.prozentSchnitt!=null?'<span><b>'+esc(dez(fs.prozentSchnitt,0))+' %</b>Ø Fortschritt</span>':'')+'<span><b>'+num(fertigSumme)+'</b>Welten abgeschlossen</span></div>';
  var welten=(fs.jeWelt||[]).map(function(w){
    var st=w.stufen||[], basis=Math.max(+w.spieler||0,st.reduce(function(m,x){ return Math.max(m,+x.erreicht||0); },0)), null0=jetzt[w.welt+"-0"]||0;
    var rows=st.map(function(x){ var e=+x.erreicht||0, p=basis?e/basis:0, j=jetzt[w.welt+"-"+x.stufe]||0;
      return '<div class="hg-fr" title="'+esc("Stufe "+x.stufe+": "+num(e)+" erreicht"+(j?" · "+num(j)+" gerade hier":""))+'"><span class="muted">Stufe '+esc(x.stufe)+'</span><span class="hg-ft'+(x.stufe===10?" ok":"")+'"><i style="width:'+(p*100).toFixed(1)+'%"></i></span>'+
        '<span class="r">'+num(e)+' <span class="muted">'+(basis?pct(p,0):"–")+'</span></span><span class="j">'+(j?'<span class="tag info">'+num(j)+'</span>':'')+'</span></div>'; }).join("");
    return '<div class="hg-welt"><h3>'+esc(w.welt+" · "+(w.name||"Welt "+w.welt))+'<span>'+num(w.spieler)+' Spieler · '+num(w.fertig)+' fertig'+(null0?' · '+num(null0)+' noch ohne Ausbau':'')+'</span></h3>'+rows+'</div>';
  }).join("");
  var pk=fs.perks||[], pmax=Math.max(1,+fs.spieler||0);
  var perks=pk.length?'<div class="hg-sub">Boni (gekauft, je Spieler)</div><div class="hg-bars">'+pk.map(function(x){ var p=(+x.anzahl||0)/pmax;
      return '<div class="hg-fr pk"><span class="nm">'+esc(x.name||x.perk)+'</span><span class="hg-ft"><i style="width:'+(Math.min(1,p)*100).toFixed(1)+'%"></i></span><span class="r">'+num(x.anzahl)+' <span class="muted">'+pct(Math.min(1,p),0)+'</span></span></div>'; }).join("")+'</div>':'';
  return sec("Fortschritt",'<span class="muted">Stufe erreicht je Welt · blaue Zahl = gerade dort</span>',mini+(welten?'<div class="hg-welten">'+welten+'</div>':'<div class="empty">Noch kein Spielstand gemeldet.</div>')+perks);
}

/* ---------- Ereignisse der letzten 30 Tage ---------- */
var EV={gas:["Gas geben","glow"],video:["Videos angesehen","info"],video_abbruch:["Videos abgebrochen","warn"],zeitsprung:["Zeitsprünge","ok"],welt_wechsel:["Weltwechsel","bad"],
  welt_fertig:["Welten fertig","ok"],perk:["Boni gekauft","glow"],shop_offen:["Shop geöffnet","grey"],kauf_abbruch:["Kauf abgebrochen","warn"]};
var EV_CHART=["gas","video","zeitsprung","welt_wechsel"];
function ereignisse(s){
  var e=s.ereignisse; if(!e) return "";
  var sum={}; (e.summen||[]).forEach(function(x){ sum[x.art]=+x.anzahl||0; });
  var vid=sum.video||0, vab=sum.video_abbruch||0;
  var mini='<div class="hg-mini">'+["gas","video","zeitsprung","welt_wechsel","welt_fertig","perk","shop_offen","kauf_abbruch"].map(function(k){ return '<span><b>'+num(sum[k])+'</b>'+esc(EV[k][0])+(k==="video"&&vid+vab?' <span class="muted">('+pct(vid/(vid+vab),0)+' bis zum Ende)</span>':'')+'</span>'; }).join("")+'</div>';
  var tag={}; (e.tage||[]).forEach(function(x){ (tag[x.tag]=tag[x.tag]||{})[x.art]=+x.anzahl||0; });
  var heute=Date.parse(F.D.today+"T12:00:00Z"), tage=[]; for(var i=29;i>=0;i--) tage.push(new Date(heute-i*864e5).toISOString().slice(0,10));
  var mx=Math.max.apply(null,tage.map(function(d){ var t=tag[d]||{}; return EV_CHART.reduce(function(a,k){ return a+(t[k]||0); },0); }).concat([1]));
  var chart='<div class="hg-chart"><div class="hg-leg">'+EV_CHART.map(function(k){ return '<span style="--c:var(--'+EV[k][1]+')">'+esc(EV[k][0])+'</span>'; }).join("")+'</div>'+
    '<div class="hg-days" role="img" aria-label="Ereignisse je Tag, letzte 30 Tage">'+tage.map(function(d){ var t=tag[d]||{};
      return '<div class="hg-day" title="'+esc(deShort(d)+": "+EV_CHART.map(function(k){ return EV[k][0]+" "+num(t[k]); }).join(" · "))+'">'+EV_CHART.map(function(k){ var v=t[k]||0; return v?'<i style="--c:var(--'+EV[k][1]+');height:'+(v/mx*100).toFixed(2)+'%"></i>':''; }).join("")+'</div>'; }).join("")+'</div>'+
    '<div class="hg-dlab"><span>'+esc(deShort(tage[0]))+'</span><span>heute</span></div></div>';
  var perkName={Kochloeffel:"Goldener Kochlöffel",Bus:"Stammgäste-Bus",Turbo:"Turbo-Gas",LangeNacht:"Lange Nacht"};
  var werte=function(art,label,name){ var l=(e.werte||[]).filter(function(x){ return x.art===art; }); if(!l.length) return "";
    return '<div class="hg-werte"><span class="muted">'+esc(label)+':</span> '+l.slice(0,8).map(function(x){ return esc(name?name(x.wert):x.wert)+'<b>'+num(x.anzahl)+'</b>'; }).join(" · ")+'</div>'; };
  return sec("Ereignisse",'<span class="muted">letzte 30 Tage</span>',mini+chart+werte("perk","Boni",function(w){ return perkName[w]||w; })+werte("zeitsprung","Zeitsprünge")+werte("welt_fertig","Fertige Welten",function(w){ return "Welt "+w; }));
}

/* ---------- Geräte: Versionen, Modelle, Regionen ---------- */
function geraete(s){
  var u=s.users; if(!u) return "";
  var liste=function(l,key){ return (l||[]).length?'<ul class="hg-kv">'+l.map(function(x){ return '<li><span class="nm">'+esc(x[key]||"?")+'</span><span class="num">'+num(x.anzahl)+'</span></li>'; }).join("")+'</ul>':'<div class="empty" style="padding:12px 18px">—</div>'; };
  var sys=(u.jeSystem||[]).map(function(x){ return esc(plat(x.plattform))+" "+num(x.anzahl); }).join(" · ");
  return sec("Geräte",'<span class="muted">'+(sys||"keine Geräte")+(u.starts!=null?' · '+num(u.starts)+' Starts':'')+'</span>',
    '<div class="hg-sub">Versionen (aktiv in 30 Tagen)</div>'+liste(u.versionen,"version")+'<div class="hg-sub">Modelle (Top 10)</div>'+liste(u.modelle,"modell")+'<div class="hg-sub">Regionen (Top 10)</div>'+liste(u.regionen,"region"));
}

/* ---------- Feedback und Fehler ---------- */
var ART={lob:["Lob","ok"],fehler:["Fehler","bad"],idee:["Idee","info"],sonstiges:["Sonstiges","grey"]};
function feedbackPanel(s){
  var li=s.feedback; if(!li) return "";
  var offen=li.filter(function(x){return !x.erledigt;}), zeig=F.UI.hgFbAll?li:offen.slice(0,12);
  var z=s.zaehler||{}, nOffen=z.feedbackOffen!=null?z.feedbackOffen:offen.length, nGes=z.feedbackGesamt!=null?z.feedbackGesamt:li.length;
  var body=zeig.length?'<ul class="hg-list">'+zeig.map(function(x){ var a=ART[x.art]||ART.sonstiges;
      return '<li'+(x.erledigt?' class="done"':'')+'><div class="h"><span class="tag '+a[1]+'">'+a[0]+'</span><span class="muted">'+esc(ago(x.datum))+(x.plattform?' · '+esc(plat(x.plattform)):'')+(x.modell?' · '+esc(x.modell):'')+(x.version?' · v'+esc(x.version):'')+(x.sprache?' · '+esc(x.sprache):'')+'</span>'+
        (x.erledigt?'<button type="button" class="link" data-act="hgfbauf:'+esc(x.id)+'">Wieder öffnen</button>':'<button type="button" class="link" data-act="hgfb:'+esc(x.id)+'">Erledigt</button>')+'</div><p>'+esc(x.text)+'</p></li>'; }).join("")+'</ul>'
    :'<div class="empty">'+(li.length?"Alles erledigt.":"Noch kein Feedback.")+'</div>';
  var foot=li.length>offen.length||offen.length>12?'<div class="hg-foot"><button type="button" class="link" data-act="hgfball">'+(F.UI.hgFbAll?"Nur offene zeigen":"Alle "+li.length+" zeigen (auch erledigte)")+'</button></div>':'';
  return sec("Feedback aus dem Spiel",'<span class="muted">'+num(nOffen)+' offen · '+num(nGes)+' gesamt</span>',body+foot);
}
function fehlerArt(a){ a=String(a||"").toLowerCase(); if(a==="exception"||a==="ausnahme") return ["Ausnahme","bad"]; if(a==="error"||a==="fehler") return ["Fehler","bad"]; if(a==="assert") return ["Assert","warn"]; if(a==="abbruch"||a==="crash") return ["Absturz","warn"]; return [a||"Fehler","bad"]; }
function fehlerPanel(s){
  var l=s.fehler; if(!l) return "";
  var zeig=F.UI.hgErrAll?l:l.slice(0,8), z=s.zaehler||{};
  var body=zeig.length?'<ul class="hg-list">'+zeig.map(function(x){ var a=fehlerArt(x.art), ok=!!x.behoben;
      return '<li'+(ok?' class="done"':'')+'><div class="h"><span class="tag '+a[1]+'">'+esc(a[0])+'</span>'+(ok?'<span class="tag ok">behoben'+(x.behobenVersion?' in v'+esc(x.behobenVersion):'')+'</span>':'')+
        '<span class="muted">'+num(x.anzahl)+'× · '+num(x.spieler)+' Spieler · '+esc(ago(x.zuletzt))+(x.versionen?' · v'+esc(x.versionen):'')+'</span>'+
        (ok?'<button type="button" class="link" data-act="hgerrauf:'+esc(x.hash)+'">Wieder öffnen</button>':'<button type="button" class="link" data-act="hgerr:'+esc(x.hash)+'">Behoben</button>')+'</div>'+
        '<details><summary><b>'+esc(x.meldung)+'</b></summary><div class="muted" style="margin-top:6px">'+esc([plat(x.plattform),x.modell,x.os,x.szene?("Szene "+x.szene):""].filter(Boolean).join(" · "))+(x.erstmals?' · zuerst '+esc(ago(x.erstmals)):'')+'</div>'+
        (x.stack?'<pre class="hg-code">'+esc(x.stack)+'</pre>':'')+'</details></li>'; }).join("")+'</ul>'
    :'<div class="empty">Keine Fehler gemeldet.</div>';
  var foot=l.length>8?'<div class="hg-foot"><button type="button" class="link" data-act="hgerrall">'+(F.UI.hgErrAll?"Weniger anzeigen":"Alle "+l.length+" anzeigen")+'</button></div>':'';
  return sec("Fehler und Abstürze",'<span class="muted">'+(z.fehlerOffen!=null?num(z.fehlerOffen)+' offen · ':'')+num(l.length)+' verschiedene · Stack aufklappen</span>',body+foot);
}
function toggle(url,body,ok,el){
  if(el) el.disabled=true;
  var fail=function(){ if(el) el.disabled=false; F.toast("Konnte nicht gespeichert werden",true); };
  F.api(url,{body:body}).then(function(j){ if(j&&j.ok){ ok(j); F.render(); } else fail(); }).catch(fail);
}
function fbSet(id,val,el){
  toggle("/admin/api/huettengaudi/feedback",{id:+id,erledigt:val},function(){ var s=HG(); if(!s) return;
    (s.feedback||[]).forEach(function(x){ if(+x.id===+id) x.erledigt=val; }); if(s.zaehler&&s.zaehler.feedbackOffen!=null) s.zaehler.feedbackOffen=Math.max(0,(+s.zaehler.feedbackOffen||0)+(val?-1:1));
    F.toast(val?"Als erledigt markiert":"Wieder offen"); },el);
}
function errSet(hash,val,el){
  toggle("/admin/api/huettengaudi/fehler",{hash:String(hash),behoben:val},function(j){ var s=HG(); if(!s) return;
    (s.fehler||[]).forEach(function(x){ if(x.hash===hash){ x.behoben=val?new Date().toISOString():null; x.behobenVersion=val?(j.behobenVersion||""):""; } });
    if(s.zaehler&&s.zaehler.fehlerOffen!=null) s.zaehler.fehlerOffen=Math.max(0,(+s.zaehler.fehlerOffen||0)+(val?-1:1));
    F.toast(val?"Als behoben markiert. Kommt der Fehler in einer neueren Version wieder, ist er wieder offen.":"Wieder offen"); },el);
}
F.action("hgfb",function(id,el){ fbSet(id,true,el); });
F.action("hgfbauf",function(id,el){ fbSet(id,false,el); });
F.action("hgerr",function(h,el){ errSet(h,true,el); });
F.action("hgerrauf",function(h,el){ errSet(h,false,el); });
F.action("hgfball",function(){ F.UI.hgFbAll=!F.UI.hgFbAll; F.render(); });
F.action("hgerrall",function(){ F.UI.hgErrAll=!F.UI.hgErrAll; F.render(); });
F.action("hgall",function(){ F.UI.hgAll=!F.UI.hgAll; F.render(); });
F.action("hghelp",function(){ F.UI.hgHelp=!F.UI.hgHelp; F.render(); });

/* ---------- Käufe: Pakete und letzte Käufe ---------- */
function kaeufe(s){
  var prods=(s.byProduct||[]).slice().sort(function(a,b){return (+b.grossCents||0)-(+a.grossCents||0);});
  var recentAll=(s.recent||[]).slice(0,15), recent=F.UI.hgAll?recentAll:recentAll.slice(0,6);
  return '<div class="two">'+
    sec("Edelweiß-Pakete",'<span class="muted">nach Umsatz</span>',prods.length?'<table class="pl-tbl"><thead><tr><th>Paket</th><th class="r">Käufe</th><th class="r">Brutto</th><th class="r">Erlös</th></tr></thead><tbody>'+
      prods.map(function(p){ return '<tr><td><b>'+esc(p.name||p.productId)+'</b>'+(p.name&&p.productId&&p.name!==p.productId?'<div class="sub">'+esc(String(p.productId).replace(/^at\.fscreative\.huettengaudi\./,""))+'</div>':'')+'</td><td class="r num" data-l="Käufe">'+num(p.count)+'</td><td class="r" data-l="Brutto">'+money(c2e(p.grossCents))+'</td><td class="r" data-l="Erlös">'+money(c2e(p.proceedsCents),"ok-t")+'</td></tr>'; }).join("")+
      '</tbody></table>':'<div class="empty">Noch keine Käufe in '+esc(F.D.year)+'.</div>')+
    sec("Letzte Käufe",'<span class="muted">'+(s.fetchedAt?"Stand "+esc(new Date(s.fetchedAt).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})):"")+'</span>',recent.length?'<ul class="hg-recent">'+recent.map(function(r){
      var d=String(r.date||""); return '<li><span class="num muted">'+esc(deShort(d.slice(0,10)))+'</span><span style="min-width:0"><span class="nm">'+esc(r.name||"Kauf")+'</span><span class="muted">'+esc(plat(r.platform))+(r.country?" · "+esc(r.country):"")+(d.length>10&&Date.parse(d)?" · "+esc(new Date(d).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"})):"")+'</span></span>'+money(c2e(r.priceCents))+'</li>'; }).join("")+'</ul>'+
      (recentAll.length>6?'<div class="hg-foot"><button type="button" class="link" data-act="hgall">'+(F.UI.hgAll?"Weniger anzeigen":"Alle "+recentAll.length+" anzeigen")+'</button></div>':''):'<div class="empty">Noch keine Käufe in '+esc(F.D.year)+'.</div>')+
  '</div>';
}

F.huettengaudiView=function(){
  var s=HG();
  if(!s||!s.configured) return emptyState();
  if(s.error||!s.totals){
    var why={timeout:"Die Statistik hat nicht rechtzeitig geantwortet.",keine_antwort:"Die Statistik-Adresse antwortet nicht, lehnt das Token ab oder liefert kein JSON. Prüfe HUETTENGAUDI_STATS_URL und HUETTENGAUDI_STATS_TOKEN.",unauthorized:"Das Token wird abgelehnt. Prüfe HUETTENGAUDI_STATS_TOKEN."}[s.error]||("Fehler: "+s.error);
    return '<div class="notice"><span><b>Hüttengaudi ist eingerichtet, liefert aber gerade keine Daten.</b> '+esc(why)+'</span><button class="btn" data-act="reload">Neu laden</button></div>'+
      '<section class="panel hg-empty"><h2>So ist die Verbindung eingerichtet</h2>'+setupHelp()+'</section>';
  }
  return kopf(s)+steuerung(s)+'<div class="two">'+umsatzChart(s)+downloadChart(s)+'</div>'+fortschritt(s)+
    '<div class="two">'+ereignisse(s)+geraete(s)+'</div>'+'<div class="two">'+feedbackPanel(s)+fehlerPanel(s)+'</div>'+kaeufe(s)+
    '<p class="pl-note">Edelweiß-Pakete sind Einmalkäufe. Brutto = Preis inkl. USt., Erlös = Auszahlung von Apple nach 15 % Provision. Sandbox-Käufe und Testspieler zählen nicht. <button type="button" class="link" data-act="hghelp">'+(F.UI.hgHelp?"Einrichtung ausblenden":"Wie ist die Verbindung eingerichtet?")+'</button></p>'+
    (F.UI.hgHelp?'<section class="panel hg-empty">'+setupHelp()+'</section>':'');
};
})();
