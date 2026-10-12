/* Plattformen › Hüttengaudi: Idle-Game (iOS) mit Edelweiß-Paketen – Statistik und Steuerung der App, aufgebaut wie Skikaiser.
   Oben vier Kennzahlen, darunter drei Reiter: Zu erledigen (Feedback, Abstürze, Programmfehler) · Zahlen · Einstellungen.
   Die App selbst ist wie Skikaiser aufgebaut (Telemetrie.cs): Feedback-Fenster, anonyme Statistik zum Abschalten, Absturz-Erkennung,
   Käufe und Feedback warten offline, Datenschutz im Spiel, Nachricht in der Laufschrift, „Update erzwingen“ sperrt bis zum Update.
   Daten: F.D.huettengaudi (server.js huettengaudiStats) – {configured:false} solange HUETTENGAUDI_STATS_URL fehlt.
   Aktionen: POST /admin/api/huettengaudi/feedback|fehler|config|aufraeumen (server.js leitet mit Token an das App-Backend weiter, der Browser sieht es nie).
   Gestaltung: nutzt die Klassen aus skikaiser.js (sk-…), damit beide Apps gleich aussehen; hier steht nur, was Hüttengaudi zusätzlich braucht (hg-…). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, deShort=F.deShort;

F.css(
'.hg-mini{padding:10px 18px;border-bottom:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}'+
'.hg-welten{list-style:none;margin:0;padding:0}'+
'.hg-welten>li{padding:12px 18px;border-bottom:1px solid var(--line)}'+
'.hg-welten>li:last-child{border-bottom:0}'+
'.hg-wk{display:flex;justify-content:space-between;align-items:baseline;gap:2px 12px;flex-wrap:wrap;font-size:13.5px;margin-bottom:8px}'+
'.hg-st{display:flex;align-items:flex-end;gap:3px;height:44px;border-bottom:1px solid var(--line)}'+
'.hg-st i{flex:1 1 0;min-width:0;background:var(--glow);border-radius:3px 3px 0 0;min-height:1px}'+
'.hg-st i.z{background:var(--ok)}'+
'.hg-stl{display:flex;gap:3px;margin-top:4px;font-size:10.5px;color:var(--ink-3)}'+
'.hg-stl span{flex:1 1 0;min-width:0;text-align:center}'+
'.hg-status{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13.5px;color:var(--ink-2)}'+
'#hgEinst textarea.f{min-height:64px}'
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
function dt(iso){ var t=Date.parse(iso||""); return t?new Date(t).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""; }
function dauer(min){ var m=Math.round(+min||0); return m<60?m+" Min.":Math.floor(m/60)+" Std. "+String(m%60).padStart(2,"0")+" Min."; }
function HG(){ return F.D&&F.D.huettengaudi; }

/* Spielbegriffe in Klartext (Katalog.cs, Shop.cs) */
var WELT=["Gipfelstube","Après-Ski-Bar","Ski-in/Ski-out-Resort","Dein Skigebiet"];
function welt(n,name){ return name||WELT[+n-1]||("Welt "+n); }
var PERK={Kochloeffel:"Goldener Kochlöffel",Bus:"Stammgäste-Bus",Turbo:"Turbo-Gas",LangeNacht:"Lange Nacht"};
var ZEITSPRUNG={"0":"1 Stunde","1":"4 Stunden"};
function paket(id){ var m=String(id||"").match(/edelweiss(\d+)$/i); return m?m[1]+" Edelweiß":String(id||"Paket"); }
function ort(sz){ var m=String(sz||"").match(/^Welt (\d+) B(\d+)$/); if(!m) return sz||""; return welt(m[1])+(+m[2]?", Stufe "+(+m[2]):""); }
var DN=null;
function land(c){ c=String(c||""); if(!/^[a-z]{2}$/i.test(c)) return c&&c!=="?"?c:"unbekannt"; try{ DN=DN||new Intl.DisplayNames(["de"],{type:"region"}); return DN.of(c.toUpperCase())||c; }catch(e){ return c; } }

/* ---------- Leerzustand: Einrichtung ---------- */
function hgVar(name,text){ return '<div class="sk-var"><code>'+name+'</code><span>'+text+'</span></div>'; }
function setupHelp(){
  return '<ol class="sk-steps">'+
    '<li><div><h3>App-Backend in Railway</h3><p>Das Backend liegt im Spiel-Projekt unter <code>Tools/backend/server.ts</code> (eine Datei, Vorlage wie Skikaiser). In Railway als Function mit Postgres in der EU anlegen und diese Variablen setzen:</p><div class="sk-vars">'+
      hgVar("DATABASE_URL","Verbindung zur Postgres-Datenbank (setzt Railway beim Verknüpfen)")+
      hgVar("HUETTENGAUDI_SECRET","Schlüssel, mit dem die App ihre Meldungen unterschreibt – derselbe steckt in der App")+
      hgVar("STATS_TOKEN","Langes, zufälliges Token nur für das Cockpit")+'</div></div></li>'+
    '<li><div><h3>Variablen im Cockpit setzen</h3><p>Im Railway-Service der FS-Creative-Website unter <b>Variables</b> eintragen. Railway startet den Dienst danach neu.</p><div class="sk-vars">'+
      hgVar("HUETTENGAUDI_STATS_URL","Adresse des Statistik-Endpunkts ohne Token, also <code>https://&lt;backend&gt;/v1/stats</code>")+
      hgVar("HUETTENGAUDI_STATS_TOKEN","Dasselbe Token wie <code>STATS_TOKEN</code> im Backend. Es bleibt am Server, der Browser sieht es nie.")+'</div></div></li>'+
    '<li><div><h3>Was du dann siehst und steuerst</h3><ul class="sk-fields">'+
      '<li>Feedback, Abstürze und Programmfehler aus dem Spiel zum Abhaken</li>'+
      '<li>Downloads, aktive Spieler, Käufe der Edelweiß-Pakete, wie weit die Spieler kommen und was sie im Spiel tun</li>'+
      '<li>Einstellungen: Nachricht an alle Spieler, Update erzwingen, Einnahmen-Aktion, Pakete und Video an/aus, „Gas geben“</li>'+
    '</ul></div></li>'+
  '</ol>';
}
function emptyState(){
  return '<section class="panel sk-empty"><div><span class="tag glow">Noch nicht verbunden</span></div>'+
    '<div style="display:grid;gap:8px"><h2>Hüttengaudi verbinden</h2><p>Sobald das App-Backend läuft, siehst du hier Feedback, Fehler und Zahlen der App und steuerst sie direkt aus dem Cockpit. Der Erlös fließt auch in die Einkommens-Prognose ein.</p>'+
    '<p>Dafür braucht es zwei Dinge: das Backend in Railway und zwei Variablen im Dienst der Website.</p></div>'+setupHelp()+'</section>';
}

/* ---------- Kopf: vier Kennzahlen und Reiter (wie Skikaiser) ---------- */
function aufgaben(s){
  var out=[];
  (s.feedback||[]).forEach(function(x){ if(!x.erledigt) out.push({art:"fb",datum:x.datum,x:x}); });
  (s.fehler||[]).forEach(function(x){ if(!x.behoben) out.push({art:"err",datum:x.zuletzt,x:x}); });
  return out.sort(function(a,b){ return String(b.datum).localeCompare(String(a.datum)); });
}
function kennzahlen(s,liste){
  var u=s.users||{}, t=s.totals||{}, nFb=liste.filter(function(a){ return a.art==="fb"; }).length, nErr=liste.length-nFb;
  return '<div class="kpis">'+
    kpi("Downloads",num(u.gesamt),"neu: "+num(u.neuHeute)+" heute · "+num(u.neu7)+" in 7 Tagen")+
    kpi("Aktive Spieler",num(u.aktiv7),"letzte 7 Tage · heute "+num(u.aktivHeute))+
    kpi("Erlös "+esc(F.D.year),'<span class="money">'+eur(c2e(t.proceedsCents))+'</span>',num(t.count)+" Käufe, nach Store-Gebühr",{vcls:"ok-t"})+
    kpi("Zu erledigen",num(liste.length),liste.length?[nFb?num(nFb)+" Feedback":"",nErr?num(nErr)+" Fehler":""].filter(Boolean).join(" · "):"alles erledigt",{vcls:liste.length?"warn-t":""})+
  '</div>';
}
function reiter(akt,offen){
  var T=[["todo","Zu erledigen"+(offen?" ("+offen+")":"")],["zahlen","Zahlen"],["einst","Einstellungen"]];
  return '<div class="seg sk-seg">'+T.map(function(t){ return '<button type="button" data-act="hgtab:'+t[0]+'" aria-pressed="'+(t[0]===akt)+'">'+t[1]+'</button>'; }).join("")+'</div>';
}
/* Notschalter, die Geld kosten, wenn man sie vergisst – oben sichtbar halten */
function hinweis(s){
  var c=s.config, l=[]; if(!c) return "";
  if(c.pakete===false) l.push("die Edelweiß-Pakete sind ausgeblendet");
  if(c.video===false) l.push("das Video-Angebot ist aus");
  if(!l.length) return "";
  var t=l.join(", "); t=t.charAt(0).toUpperCase()+t.slice(1);
  return '<div class="notice"><span><b>Achtung:</b> '+esc(t)+'.</span><button type="button" class="btn" data-act="hgtab:einst">Einstellungen</button></div>';
}

/* ---------- Reiter „Zu erledigen“: Feedback und Programmfehler in einer Liste ---------- */
var ART={lob:"Lob",fehler:"Fehler gemeldet",idee:"Idee",sonstiges:"Nachricht"};
function geraet(x){ return [x.modell||(x.plattform?(plat(x.plattform)==="iOS"?"iPhone":plat(x.plattform)):""), x.version?"Version "+x.version:""].filter(Boolean).join(" · "); }
var FEHLER={NullReferenceException:"Ein Teil des Spiels fehlte, als er gebraucht wurde.",MissingReferenceException:"Ein schon entferntes Teil des Spiels wurde noch verwendet.",UnassignedReferenceException:"Ein Teil des Spiels war nicht zugewiesen.",
  IndexOutOfRangeException:"Eine Liste wurde über ihr Ende hinaus gelesen.",ArgumentOutOfRangeException:"Ein Wert lag außerhalb des erlaubten Bereichs.",KeyNotFoundException:"Ein gesuchter Eintrag fehlte.",
  InvalidOperationException:"Ein Ablauf war in diesem Moment nicht möglich.",FormatException:"Eine Zahl oder ein Text ließ sich nicht lesen.",OutOfMemoryException:"Dem Gerät ging der Speicher aus.",
  DivideByZeroException:"Es wurde durch null geteilt.",ArgumentNullException:"Eine Funktion bekam einen leeren Wert.",ArgumentException:"Eine Funktion bekam einen ungültigen Wert.",NotSupportedException:"Etwas wird auf diesem Gerät nicht unterstützt."};
function fehlerText(x){
  var m=String(x.meldung||"").trim(), typ=(m.match(/^([A-Za-z_.]*Exception)\b/)||[])[1];
  if(typ){ typ=typ.split(".").pop(); if(FEHLER[typ]) return FEHLER[typ]; }
  var erste=m.split("\n")[0]; return erste?"Fehlermeldung: „"+(erste.length>140?erste.slice(0,139)+"…":erste)+"“":"Fehler ohne Meldung.";
}
function technik(x){
  return [x.meldung||"", x.stack||"", [x.modell,x.os].filter(Boolean).join(" · "), x.szene?"Ort im Spiel: "+x.szene:"",
    (x.erstmals?"Zuerst "+dt(x.erstmals):"")+(x.zuletzt?(x.erstmals?" · ":"")+"Zuletzt "+dt(x.zuletzt):"")].filter(Boolean).join("\n");
}
function zeile(titel,wann,inhalt,knoepfe){ return '<li><div class="sk-t"><b>'+titel+'</b><span class="muted">'+wann+'</span></div><div class="sk-c">'+inhalt+'</div><div class="sk-b">'+knoepfe+'</div></li>'; }
function tabTodo(s,liste){
  var hint='<p class="sk-hint">Feedback aus dem Spiel, Abstürze und Programmfehler. Einmal erledigt, verschwindet der Eintrag.</p>';
  if(!liste.length) return hint+'<section class="panel"><div class="empty">Nichts zu tun – alles erledigt.</div></section>';
  var z=liste.slice(0,F.UI.hgAlle?300:30).map(function(a){
    var x=a.x;
    if(a.art==="fb") return zeile("Feedback",esc(ART[x.art]||"Nachricht")+" · "+esc(ago(a.datum)),'<p>'+esc(x.text)+'</p><span class="muted">'+esc(geraet(x))+'</span>',
      '<button type="button" class="btn primary" data-act="hgfb:'+esc(x.id)+'">Erledigt</button>');
    var vs=String(x.versionen||"").trim().split(/\s+/).filter(Boolean), ab=x.art==="abbruch";
    return zeile(ab?"Absturz":"Programmfehler",esc(ago(a.datum)),'<p>'+(ab?"Die App wurde unerwartet beendet.":esc(fehlerText(x)))+'</p><span class="muted">'+num(x.anzahl)+'-mal bei '+num(x.spieler)+(+x.spieler===1?" Spieler":" Spielern")+(x.szene?" · "+esc(ort(x.szene)):"")+(vs.length?" · Version "+esc(vs.join(", ")):"")+'</span>'+
      '<details><summary class="muted">Technische Details</summary><pre class="sk-code">'+esc(technik(x))+'</pre></details>',
      '<button type="button" class="btn primary" data-act="hgerr:'+esc(x.hash)+'" title="Taucht der Fehler in einer neueren Version wieder auf, kommt er zurück in die Liste.">Behoben</button>');
  }).join("");
  return hint+'<section class="panel"><ul class="sk-todo">'+z+'</ul>'+(liste.length>30?'<div class="sk-foot"><button type="button" class="link" data-act="hgalle">'+(F.UI.hgAlle?"Weniger anzeigen":"Alle "+liste.length+" anzeigen")+'</button></div>':'')+'</section>';
}
function setze(url,body,ok,el){
  if(el) el.disabled=true;
  return F.api(url,{body:body}).then(function(j){
    if(j&&j.ok){ ok(j); F.render(); }
    else { if(el) el.disabled=false; F.toast("Hat nicht geklappt: "+((j&&(j.fehler||j.error))||"keine Antwort"),true); }
  }).catch(function(){ if(el) el.disabled=false; F.toast("Hüttengaudi-Server nicht erreichbar",true); });
}
function fbSet(id,val,el){
  setze("/admin/api/huettengaudi/feedback",{id:+id,erledigt:val},function(){ var s=HG(); if(!s) return;
    (s.feedback||[]).forEach(function(x){ if(String(x.id)===String(id)) x.erledigt=val; });
    if(s.zaehler&&s.zaehler.feedbackOffen!=null) s.zaehler.feedbackOffen=Math.max(0,(+s.zaehler.feedbackOffen||0)+(val?-1:1));
    if(val) F.toast("Erledigt",false,"Rückgängig",function(){ fbSet(id,false); }); else F.toast("Wieder in der Liste"); },el);
}
function errSet(hash,val,el){
  setze("/admin/api/huettengaudi/fehler",{hash:String(hash),behoben:val},function(j){ var s=HG(); if(!s) return;
    (s.fehler||[]).forEach(function(x){ if(x.hash===hash){ x.behoben=val?new Date().toISOString():null; x.behobenVersion=val?(j.behobenVersion||""):""; } });
    if(s.zaehler&&s.zaehler.fehlerOffen!=null) s.zaehler.fehlerOffen=Math.max(0,(+s.zaehler.fehlerOffen||0)+(val?-1:1));
    if(val) F.toast("Als behoben markiert",false,"Rückgängig",function(){ errSet(hash,false); }); else F.toast("Wieder in der Liste"); },el);
}
F.action("hgtab",function(t){ F.UI.hgTab=t; F.ls&&F.ls("fsc_hg_tab",t); F.render(); });
F.action("hgalle",function(){ F.UI.hgAlle=!F.UI.hgAlle; F.render(); });
F.action("hgfb",function(id,el){ fbSet(id,true,el); });
F.action("hgerr",function(h,el){ errSet(h,true,el); });

/* ---------- Reiter „Zahlen“ ---------- */
function downloads(s){
  var u=s.users||{}, map={}, andr=false, sum=0; (u.jeMonat||[]).forEach(function(m){ map[m.monat]=m; });
  var cur=String(F.D.year)===F.D.today.slice(0,4)?+F.D.today.slice(5,7):12;
  var rows=MON.slice(0,cur).map(function(m,i){ var x=map[F.D.year+"-"+String(i+1).padStart(2,"0")]||{}, a1=+x.ios||0, a2=+x.android||0, n=Math.max(+x.neu||0,a1+a2);
    if(a2) andr=true; sum+=n;
    return {label:m,n:n,parts:[[a1,"c","iPhone "+num(a1)],[a2,"a","Android "+num(a2)],[n-a1-a2,"d","andere "+num(n-a1-a2)]],right:num(n)}; });
  var erst=0; while(erst<rows.length&&!rows[erst].n) erst++; rows=rows.slice(erst);   /* erst ab dem ersten Download */
  var top=(u.regionen||[]).filter(function(r){ return r.region&&r.region!=="?"; }).slice(0,4);
  var foot=top.length?'<div class="sk-foot muted">Am meisten aus: '+top.map(function(r){ return esc(land(r.region))+" "+num(r.anzahl); }).join(" · ")+'</div>':'';
  return sec("Downloads je Monat",'<span class="muted">neue Geräte · '+num(sum)+' in '+esc(F.D.year)+'</span>',rows.length&&F.platHbars?F.platHbars(rows,andr?[["iPhone","info"],["Android","ok"]]:null)+foot:'<div class="empty">Noch keine Downloads in '+esc(F.D.year)+'.</div>');
}
function fortschritt(s){
  var fs=s.fortschritt||{}, jetzt={};
  (fs.verteilung||[]).forEach(function(v){ jetzt[v.welt+"-"+v.stufe]=+v.jetzt||0; });
  var mini='<div class="hg-mini">'+[num(fs.spieler)+" Spieler mit Spielstand",fs.schnittSpielzeitMin!=null?"Ø "+dauer(fs.schnittSpielzeitMin)+" gespielt":"",fs.edelweissSchnitt!=null?"Ø "+dez(fs.edelweissSchnitt)+" Edelweiß auf dem Konto":""].filter(Boolean).map(esc).join(" · ")+'</div>';
  var li=(fs.jeWelt||[]).map(function(w){
    var st=w.stufen||[], sp=+w.spieler||0, fe=+w.fertig||0, name=welt(w.welt,w.name);
    var basis=Math.max(sp,st.reduce(function(m,x){ return Math.max(m,+x.erreicht||0); },0));
    var bars=st.map(function(x){ var e=+x.erreicht||0, p=basis?e/basis:0, j=jetzt[w.welt+"-"+x.stufe]||0;
      return '<i'+(+x.stufe===10?' class="z"':'')+' style="height:'+(p*100).toFixed(1)+'%" title="'+esc("Stufe "+x.stufe+": "+num(e)+" Spieler ("+pct(p,0)+")"+(j?" · "+num(j)+" gerade hier":""))+'"></i>'; }).join("");
    return '<li><div class="hg-wk"><b>'+esc(name)+'</b><span class="muted">'+num(sp)+' Spieler · '+num(fe)+' fertig'+(sp&&fe?" ("+pct(Math.min(1,fe/sp),0)+")":"")+'</span></div>'+
      '<div class="hg-st" role="img" aria-label="'+esc(name+": wie viele Spieler Stufe 1 bis 10 erreicht haben")+'">'+bars+'</div><div class="hg-stl">'+st.map(function(x){ return '<span>'+esc(x.stufe)+'</span>'; }).join("")+'</div></li>';
  }).join("");
  return sec("Wie weit kommen die Spieler?",'<span class="muted">Stufe 1 bis 10 je Welt</span>',(fs.spieler!=null?mini:"")+(li?'<ul class="hg-welten">'+li+'</ul>':'<div class="empty">Noch kein Spielstand gemeldet.</div>'));
}
var EV=[["gas","Gas gegeben"],["video","Video angesehen statt gewartet"],["zeitsprung","Zeitsprung gekauft"],["perk","Bonus gekauft"],["welt_fertig","Welt abgeschlossen"],
  ["welt_wechsel","In eine neue Welt gewechselt"],["shop_offen","Shop geöffnet"],["kauf_abbruch","Kauf abgebrochen"],["kauf_fehler","Kauf fehlgeschlagen"]];
function wertName(art,w){
  if(art==="zeitsprung") return ZEITSPRUNG[w]||("Zeitsprung "+w);
  if(art==="perk") return PERK[w]||w;
  if(art==="welt_fertig"||art==="welt_wechsel") return welt(w);
  if(art==="kauf_abbruch"||art==="kauf_fehler") return paket(w);
  return w;
}
function ereignisse(s){
  var e=s.ereignisse; if(!e) return sec("Was die Spieler tun","",'<div class="empty">Noch keine Ereignisse gemeldet.</div>');
  var sum={}; (e.summen||[]).forEach(function(x){ sum[x.art]=+x.anzahl||0; });
  var rows=EV.map(function(d){ var k=d[0], n=sum[k]||0, det=[];
    if(k==="video"&&sum.video_abbruch) det.push(num(sum.video_abbruch)+"-mal vorher abgebrochen");
    (e.werte||[]).filter(function(x){ return x.art===k&&x.wert!==""&&x.wert!=null; }).slice(0,4).forEach(function(x){ det.push(wertName(k,String(x.wert))+" "+num(x.anzahl)); });
    return '<tr><td>'+esc(d[1])+(det.length?'<div class="sub">'+esc(det.join(" · "))+'</div>':'')+'</td><td class="r'+(k==="kauf_fehler"&&n?" bad-t":"")+'">'+num(n)+'</td></tr>'; }).join("");
  return sec("Was die Spieler tun",'<span class="muted">letzte 30 Tage</span>','<table class="sk-tbl"><tbody>'+rows+'</tbody></table>'+
    '<div class="sk-foot muted">Spieler können die anonyme Statistik in den Einstellungen der App abschalten – Käufe und Feedback kommen trotzdem an.</div>');
}
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
function kaeufe(s){
  var t=s.totals||{}, u=s.users||{}, gross=c2e(t.grossCents), proc=c2e(t.proceedsCents), cnt=+t.count||0, refunds=+t.refunds||0;
  var fee=gross>0?1-proc/gross:0, avg=cnt?gross/cnt:0, avgP=cnt?proc/cnt:0, dl=+u.gesamt||0, kf=+u.kaeufer||0;
  var inc=((F.D.income&&F.D.income.lines)||[]).find(function(l){return l.key==="huettengaudi";});
  var prods=(s.byProduct||[]).slice().sort(function(a,b){return (+b.grossCents||0)-(+a.grossCents||0);});
  var pTot=prods.reduce(function(a,p){return a+(+p.grossCents||0);},0)||1;
  var recentAll=(s.recent||[]).slice(0,15), recent=F.UI.hgAll?recentAll:recentAll.slice(0,6);
  return '<div class="kpis">'+
      kpi("Umsatz brutto",'<span class="money">'+eur(gross)+'</span>',num(cnt)+" Käufe "+esc(F.D.year))+
      kpi("Erlös nach Store-Gebühr",'<span class="money">'+eur(proc)+'</span>',gross>0?'abzüglich USt. und Apple: <span class="money">'+eur(gross-proc)+'</span> ('+pct(fee,0)+')':"Auszahlung von Apple",{vcls:"ok-t"})+
      kpi("Ø Kaufwert",'<span class="money">'+eur(avg)+'</span>',cnt?'Erlös Ø <span class="money">'+eur(avgP)+'</span>':"noch keine Käufe")+
      (dl>0?kpi("Kaufquote",pct(kf/dl),num(kf)+" Käufer bei "+num(dl)+" Downloads"+(refunds?" · "+num(refunds)+" erstattet":"")):
        kpi("Erstattungen",num(refunds),"zurückgegebene Käufe",{vcls:refunds?"warn-t":""}))+
    '</div>'+
    sec("Käufe je Monat",'<span class="muted">'+esc(F.D.year)+(inc?' · Prognose <span class="money">'+eur0(inc.monthly)+'</span> / Monat':'')+'</span>',monthChart(s.byMonth,F.D.year))+
    '<div class="two">'+
      sec("Edelweiß-Pakete",'<span class="muted">nach Umsatz</span>',prods.length?'<table class="pl-tbl"><thead><tr><th>Paket</th><th class="r">Käufe</th><th class="r">Brutto</th><th class="r">Erlös</th></tr></thead><tbody>'+
        prods.map(function(p){ var sh=(+p.grossCents||0)/pTot; return '<tr><td><b>'+esc(p.name&&p.name!==p.productId?p.name:paket(p.productId))+'</b><div class="sk-share" title="'+esc(pct(sh,0))+' vom Umsatz"><i style="width:'+(sh*100).toFixed(1)+'%"></i></div></td><td class="r num" data-l="Käufe">'+num(p.count)+'</td><td class="r" data-l="Brutto">'+money(c2e(p.grossCents))+'</td><td class="r" data-l="Erlös">'+money(c2e(p.proceedsCents),"ok-t")+'</td></tr>'; }).join("")+
        '</tbody></table>':'<div class="empty">Noch keine Käufe in '+esc(F.D.year)+'.</div>')+
      sec("Letzte Käufe",'<span class="muted">'+(s.fetchedAt?"Stand "+esc(new Date(s.fetchedAt).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})):"")+'</span>',recent.length?'<ul class="sk-recent">'+recent.map(function(r){
        var d=String(r.date||""); return '<li><span class="num muted">'+esc(deShort(d.slice(0,10)))+'</span><span style="min-width:0"><span class="nm" style="display:block">'+esc(r.name||"Kauf")+'</span><span class="muted">'+esc(land(r.country))+(d.length>10&&Date.parse(d)?" · "+esc(new Date(d).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"})):"")+'</span></span>'+money(c2e(r.priceCents))+'</li>'; }).join("")+'</ul>'+
        (recentAll.length>6?'<div class="panel-b" style="padding-top:8px"><button type="button" class="link" data-act="hgall">'+(F.UI.hgAll?"Weniger anzeigen":"Alle "+recentAll.length+" anzeigen")+'</button></div>':''):'<div class="empty">Noch keine Käufe in '+esc(F.D.year)+'.</div>')+
    '</div>'+
    '<p class="pl-note">Edelweiß-Pakete sind Einmalkäufe. Brutto = Preis inkl. USt., Erlös = Auszahlung von Apple nach 15 % Provision. Erstattete Käufe, Käufe aus der Sandbox und Testgeräte zählen nicht. <button type="button" class="link" data-act="hghelp">'+(F.UI.hgHelp?"Einrichtung ausblenden":"Wie ist die Verbindung eingerichtet?")+'</button></p>'+
    (F.UI.hgHelp?'<section class="panel sk-empty">'+setupHelp()+'</section>':'');
}
function tabZahlen(s){
  return '<div class="two">'+downloads(s)+fortschritt(s)+'</div>'+ereignisse(s)+kaeufe(s);
}
F.action("hgall",function(){ F.UI.hgAll=!F.UI.hgAll; F.render(); });
F.action("hghelp",function(){ F.UI.hgHelp=!F.UI.hgHelp; F.render(); });

/* ---------- Reiter „Einstellungen“ (Fernsteuerung der App, GET /v1/config) ----------
   Die App holt die Einstellungen beim Start und alle 10 Minuten. Eingaben bleiben erhalten, auch wenn das Cockpit im Hintergrund neu lädt (F.UI.hgEdit). */
function wert(id,def){ var d=F.UI.hgEdit||{}; return Object.prototype.hasOwnProperty.call(d,id)?d[id]:def; }
function attr(id){ return ' id="'+id+'" data-hgf data-keepfocus="'+id+'"'; }
function chk(id,on,label){ return '<label class="chk"><input type="checkbox"'+attr(id)+(wert(id,!!on)?" checked":"")+'> '+label+'</label>'; }
function eingabe(id,label,v,o){ o=o||{};
  var val=esc(wert(id,v==null?"":String(v))), ph=o.ph?' placeholder="'+esc(o.ph)+'"':'', ml=o.max?' maxlength="'+o.max+'"':'';
  if(o.area) return '<label class="fl">'+label+'<textarea class="f" rows="2"'+attr(id)+ml+ph+'>'+val+'</textarea></label>';
  return '<label class="fl">'+label+'<input class="f'+(o.zahl?" num":"")+'" type="'+(o.typ||"text")+'"'+attr(id)+ml+ph+(o.zahl?' min="'+o.zahl[0]+'" max="'+o.zahl[1]+'" step="'+o.zahl[2]+'" inputmode="decimal"':'')+' value="'+val+'"></label>';
}
function karte(titel,text,inhalt){ return '<section class="panel sk-card"><h3>'+titel+'</h3><p>'+text+'</p>'+inhalt+'</section>'; }
function isoLokal(iso){ var t=Date.parse(iso||""); if(!t) return ""; var d=new Date(t), p=function(n){ return String(n).padStart(2,"0"); }; return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes()); }
function aktionStatus(a){
  if(!a||!a.aktiv) return "";
  var bis=Date.parse(a.bis||"");
  if(bis&&bis<Date.now()) return '<span class="tag warn">abgelaufen</span> seit '+esc(dt(a.bis))+' – die Spieler bekommen nichts mehr extra.';
  return '<span class="tag ok">läuft</span> Einnahmen ×'+esc(dez(a.faktor,2))+(bis?" bis "+esc(dt(a.bis)):", bis du sie ausschaltest");
}
function tabEinst(s){
  var c=s.config, g=s.configGeaendert?ago(s.configGeaendert):"";
  var hint='<p class="sk-hint">Was du hier speicherst, sehen die Spieler beim nächsten Start der App, spätestens nach etwa 10 Minuten.'+(g?' Zuletzt geändert '+(/^vor/.test(g)?"":"am ")+esc(g):'')+'</p>';
  if(!c) return hint+'<section class="panel"><div class="empty">Die Einstellungen der App wurden nicht mitgeliefert. Bitte neu laden.</div></section>';
  var an=c.ankuendigung||{}, a=c.aktion||{}, st=aktionStatus(a);
  var vers=((s.users&&s.users.versionen)||[]).filter(function(v){ return v.version&&v.version!=="?"; }).slice(0,4);
  return hint+'<div class="sk-cards" id="hgEinst">'+
    karte("Nachricht an alle Spieler","Erscheint einmal als Fenster „Neuigkeiten“ und läuft danach oben im Spiel als Laufschrift mit, z. B. „Neue Welt ab Freitag!“.",
      chk("hgAnkAn",an.aktiv,"Nachricht anzeigen")+eingabe("hgAnkText","Text",an.text,{area:1,max:300,ph:"z. B. Neue Welt ab Freitag!"}))+
    karte("Update erzwingen","Wer eine ältere Version hat, kann erst nach dem Update weiterspielen (der Spielstand bleibt). Leer lassen = aus.",
      '<div class="row2">'+eingabe("hgMinV","Mindestens Version",c.mindestVersion&&c.mindestVersion!=="0.0.0"?c.mindestVersion:"",{max:20,ph:"z. B. 1.0.3"})+eingabe("hgStore","Link zum App Store",c.storeUrl,{typ:"url",max:300,ph:"https://apps.apple.com/app/…"})+'</div>'+
      (vers.length?'<p>Gerade im Einsatz (letzte 30 Tage): '+vers.map(function(v){ return esc(v.version)+" bei "+num(v.anzahl)+(+v.anzahl===1?" Gerät":" Geräten"); }).join(" · ")+'</p>':''))+
    karte("Einnahmen-Aktion","Solange die Aktion läuft, verdienen alle Spieler mehr. Der Titel läuft im Spiel als Laufschrift mit, z. B. „Hüttengaudi-Wochenende · Einnahmen ×2“.",
      chk("hgAktAn",a.aktiv,"Aktion läuft")+(st?'<div class="hg-status">'+st+'</div>':'')+
      '<div class="row2">'+eingabe("hgAktTitel","Titel",a.titel,{max:300,ph:"z. B. Hüttengaudi-Wochenende"})+eingabe("hgAktFaktor","Einnahmen mal (1 bis 3)",a.faktor!=null?a.faktor:1,{typ:"number",zahl:[1,3,0.1]})+'</div>'+
      eingabe("hgAktBis","Endet am (leer = bis du sie ausschaltest)",isoLokal(a.bis),{typ:"datetime-local"}))+
    karte("Angebote im Spiel","Zum schnellen Abschalten, falls beim Kaufen oder bei den Videos etwas nicht stimmt.",
      chk("hgPakete",c.pakete!==false,"Edelweiß-Pakete im Shop anbieten")+chk("hgVideo",c.video!==false,"Video ansehen statt warten (bei „Gas geben“)"))+
    karte("Gas geben","„Gas geben“ verdoppelt die Einnahmen für ein paar Minuten. Danach heißt es warten – oder ein Video ansehen. Mit dem Bonus Turbo-Gas hält es dreimal so lang.",
      '<div class="row2">'+eingabe("hgGasMin","Dauer in Minuten (1 bis 60)",c.gasMinuten,{typ:"number",zahl:[1,60,1]})+eingabe("hgGasPause","Pause in Stunden (0 bis 48)",c.gasPauseStunden,{typ:"number",zahl:[0,48,1]})+'</div>')+
    '<div><button type="button" class="btn primary" data-act="hgcfg">Speichern</button></div>'+
  '</div>'+
  sec("Vor dem Verkaufsstart",'','<div class="sk-card"><p>Während der Testphase wurden Käufe aus der Sandbox und Spielstände von Testgeräten gespeichert. In den Zahlen zählen sie nicht mit. Vor dem Start im App Store kannst du sie endgültig entfernen.</p><div class="sk-foot" style="padding:0"><button type="button" class="btn" data-act="hgclean">Testdaten löschen</button></div></div>');
}
function merk(el){ var d=F.UI.hgEdit=F.UI.hgEdit||{}; d[el.id]=el.type==="checkbox"?el.checked:el.value; }
F.listen("input","#hgEinst [data-hgf]",merk);
F.listen("change","#hgEinst [data-hgf]",merk);
function vergleich(c){ c=c||{}; var a=c.aktion||{}, an=c.ankuendigung||{}, bis=Date.parse(a.bis||"");
  return JSON.stringify([!!an.aktiv,an.text||"",c.mindestVersion||"0.0.0",c.storeUrl||"",!!a.aktiv,a.titel||"",+a.faktor||1,bis?Math.floor(bis/60000):null,c.pakete!==false,c.video!==false,+c.gasPauseStunden,+c.gasMinuten]); }
function pruefen(c){
  var a=c.aktion;
  if(c.ankuendigung.aktiv&&!c.ankuendigung.text) return "Bitte einen Text für die Nachricht eingeben";
  if(c.ankuendigung.text.length>300||a.titel.length>300) return "Texte bitte höchstens 300 Zeichen";
  if(!/^\d{1,4}(\.\d{1,4}){0,3}$/.test(c.mindestVersion)) return "Version bitte nur mit Ziffern und Punkten, z. B. 1.0.3";
  if(c.storeUrl&&!/^(https:\/\/|itms-apps:\/\/)[^\s"'<>\\]+$/.test(c.storeUrl)) return "Der Link zum App Store muss mit https:// beginnen";
  if(!(a.faktor>=1&&a.faktor<=3)) return "Einnahmen mal: bitte eine Zahl von 1 bis 3, z. B. 2";
  if(a.aktiv&&a.faktor===1) return "Für die Aktion bitte mehr als 1 eintragen, z. B. 2 für doppelte Einnahmen";
  if(a.aktiv&&a.bis&&Date.parse(a.bis)<Date.now()) return "Das Ende der Aktion liegt in der Vergangenheit – Datum ändern oder Aktion ausschalten";
  if(!(Number.isInteger(c.gasMinuten)&&c.gasMinuten>=1&&c.gasMinuten<=60)) return "Gas geben: Dauer in ganzen Minuten von 1 bis 60";
  if(!(Number.isInteger(c.gasPauseStunden)&&c.gasPauseStunden>=0&&c.gasPauseStunden<=48)) return "Gas geben: Pause in ganzen Stunden von 0 bis 48";
  return "";
}
F.action("hgcfg",function(arg,el){
  var s=HG(); if(!s||!s.config){ F.toast("Einstellungen nicht geladen – bitte neu laden",true); return; }
  function v(id){ var e=document.getElementById(id); return e?String(e.value).trim():""; } function c(id){ var e=document.getElementById(id); return !!(e&&e.checked); }
  var bisV=v("hgAktBis"), bis=null; if(bisV){ var t=new Date(bisV); if(isNaN(t)){ F.toast("Das Ende der Aktion ist kein gültiges Datum",true); return; } bis=t.toISOString(); }
  var aktiv=c("hgAktAn"), faktor=parseFloat(v("hgAktFaktor").replace(",","."));
  if(!aktiv&&!(faktor>=1&&faktor<=3)) faktor=1;
  var neu={ankuendigung:{aktiv:c("hgAnkAn"),text:v("hgAnkText")},mindestVersion:v("hgMinV")||"0.0.0",storeUrl:v("hgStore"),
    aktion:{aktiv:aktiv,titel:v("hgAktTitel"),faktor:Math.round(faktor*100)/100,bis:bis},pakete:c("hgPakete"),video:c("hgVideo"),gasPauseStunden:Number(v("hgGasPause")),gasMinuten:Number(v("hgGasMin"))};
  var f=pruefen(neu); if(f){ F.toast(f,true); return; }
  if(vergleich(s.config)===vergleich(neu)){ F.UI.hgEdit={}; F.toast("Keine Änderungen"); return; }
  if(el) el.disabled=true;
  F.api("/admin/api/huettengaudi/config",{body:neu}).then(function(j){
    if(el) el.disabled=false;
    if(!(j&&j.ok)){ F.toast("Hat nicht geklappt: "+((j&&(j.fehler||j.error))||"keine Antwort"),true); return; }
    s.config=j.config||Object.assign({},s.config,neu); s.configGeaendert=new Date().toISOString(); F.UI.hgEdit={};
    F.toast("Gespeichert – die Spieler sehen es spätestens in 10 Minuten"); F.render();
  }).catch(function(){ if(el) el.disabled=false; F.toast("Hüttengaudi-Server nicht erreichbar",true); });
});
F.action("hgclean",function(){
  F.confirm("Testdaten endgültig löschen? Käufe aus der Sandbox und alles von Testgeräten wird entfernt.","Testdaten löschen",function(){
    F.api("/admin/api/huettengaudi/aufraeumen",{body:{}}).then(function(j){
      if(!(j&&j.ok)){ F.toast("Hat nicht geklappt: "+((j&&(j.fehler||j.error))||"keine Antwort"),true); return; }
      F.toast("Testdaten gelöscht: "+num(j.spieler)+" Spieler, "+num(j.kaeufe)+" Käufe, "+num(j.feedback)+" Feedback, "+num(j.fehler)+" Fehler"); F.load(true);
    }).catch(function(){ F.toast("Hüttengaudi-Server nicht erreichbar",true); });
  },true);
});

F.huettengaudiView=function(){
  var s=HG();
  if(!s||!s.configured) return emptyState();
  if(s.error||!s.totals){
    var why={timeout:"Die Statistik hat nicht rechtzeitig geantwortet.",keine_antwort:"Die Statistik-Adresse antwortet nicht, lehnt das Token ab oder liefert kein JSON. Prüfe HUETTENGAUDI_STATS_URL und HUETTENGAUDI_STATS_TOKEN.",unauthorized:"Das Token wird abgelehnt. Prüfe HUETTENGAUDI_STATS_TOKEN."}[s.error]||("Fehler: "+s.error);
    return '<div class="notice"><span><b>Hüttengaudi ist eingerichtet, liefert aber gerade keine Daten.</b> '+esc(why)+'</span><button class="btn" data-act="reload">Neu laden</button></div>'+
      '<section class="panel sk-empty"><h2>So ist die Verbindung eingerichtet</h2>'+setupHelp()+'</section>';
  }
  var tab=F.UI.hgTab||(F.ls&&F.ls("fsc_hg_tab"))||"todo"; if(["todo","zahlen","einst"].indexOf(tab)<0) tab="todo"; F.UI.hgTab=tab;
  var liste=aufgaben(s);
  var body=tab==="zahlen"?tabZahlen(s):tab==="einst"?tabEinst(s):tabTodo(s,liste);
  return (tab!=="einst"?hinweis(s):"")+kennzahlen(s,liste)+reiter(tab,liste.length)+body;
};
})();
