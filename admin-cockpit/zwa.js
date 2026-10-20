/* WhatsApp (nur lesen) auf der Seite „Chat“ – Umschalter „Website | WhatsApp“ in zchat.js, Server whatsapp.js (/admin/api/wa/…).
   Nicht verbunden → Anleitung Schritt für Schritt (Meta-App, Zugangsdaten, Webhook, Verbinden über /admin/wa/connect) + Hinweise.
   Verbunden → Chatliste (Suche in Name/Nummer/Text, ungelesen, letzte Nachricht) und Verlauf (Fotos groß ansehen, Sprachnachrichten, Videos,
   Dokumente, Standort, Reaktionen, bearbeitet/gelöscht). Antworten nur in der WhatsApp-App – das Cockpit sendet nie. Aktualisiert alle 10 s, solange offen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
F.icons.walock='<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
F.icons.wadoc='<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>';
F.icons.wapin='<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>';
var WS=null, WL=null, VER="", SEL=null, TH=null, Q="", busy=false, again=false, ticks=0, setupKey="", qT=null, STICK=true, SHOWSETUP=false;
F.css('.wa-p{padding:16px 18px;display:grid;gap:10px}.wa-p h2{font-size:19px;margin:0}.wa-p h3{font-size:16px;margin:0;display:flex;align-items:center;gap:9px}.wa-p p{margin:0}'+
  '.wa-n{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--ok-soft);color:var(--ok);font-size:13px;font-weight:800;flex:none}.wa-n.done{background:var(--ok);color:#fff}'+
  '.wa-steps{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;line-height:1.5}.wa-p code{background:var(--sunk);border:1px solid var(--line);padding:0 6px;border-radius:6px;font-size:12.5px;overflow-wrap:anywhere}'+
  '.wa-copy{display:flex;gap:8px;align-items:center}.wa-copy input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}.wa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}'+
  '.wa-ok{color:var(--ok);font-weight:600}.wa-warn{color:var(--warn);font-weight:600}.wa-notes{margin:0;padding-left:18px;display:grid;gap:6px;font-size:13.5px;color:var(--ink-2)}'+
  '.wa-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between}.wa-bar .muted{flex:1 1 200px;font-size:12.5px}.wa-bar .notice{flex-basis:100%;font-size:13px}'+
  '.wa-ro{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;background:var(--info-soft);color:var(--info);font-weight:700;font-size:13px}.wa-ro svg,.wa-lk svg{width:15px;height:15px}.wa-lk svg{vertical-align:-2px}'+
  '.wa-app{height:calc(100vh - 250px);height:calc(100dvh - 250px)}.wa-search{position:sticky;top:0;z-index:1;padding:10px;background:var(--panel);border-bottom:1px solid var(--line)}'+
  '.wa-day{align-self:center;margin:8px 0 2px;padding:2px 10px;border-radius:99px;background:var(--panel);border:1px solid var(--line);font-size:11.5px;color:var(--ink-3)}'+
  '.ch-m.wa-m{position:relative;white-space:normal}.wa-t{white-space:pre-wrap}.ch-m.wa-m.rx{margin-bottom:14px}'+
  '.wa-rx{position:absolute;bottom:-13px;right:10px;padding:0 6px;border-radius:99px;background:var(--panel);border:1px solid var(--line);font-size:12.5px;line-height:20px}.ch-m.wa-in{align-self:flex-start;border-bottom-left-radius:5px}.ch-m.wa-in .wa-rx{right:auto;left:10px}'+
  '.wa-img{display:block;padding:0;border:0;background:none;cursor:zoom-in;margin-bottom:4px}.wa-img img{display:block;max-width:min(280px,100%);max-height:320px;border-radius:10px}'+
  '.wa-stk{display:block;width:120px;height:120px;object-fit:contain}.wa-m audio{display:block;width:260px;max-width:100%}.wa-m video{display:block;max-width:min(320px,100%);max-height:360px;border-radius:10px;margin-bottom:4px}'+
  '.wa-doc{display:flex;gap:10px;align-items:center;padding:8px 10px;margin-bottom:4px;border-radius:10px;background:var(--sunk);color:inherit;text-decoration:none}.wa-doc svg{width:22px;height:22px;flex:none}.wa-doc small{display:block;color:var(--ink-3);margin:0}'+
  '.wa-loc{display:inline-flex;gap:6px;align-items:center;font-weight:600}.wa-loc svg{width:16px;height:16px}'+
  '.wa-q{border-left:3px solid var(--ok);padding:3px 8px;margin-bottom:5px;border-radius:6px;background:var(--sunk);font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.wa-i{color:var(--ink-3);font-style:italic}.wa-sub{font-size:11.5px;color:var(--ink-3)}.wa-older{align-self:center}.wa-big{display:block;max-width:100%;max-height:75vh;margin:0 auto;border-radius:10px}'+
  '@media(max-width:900px){.wa-app{height:calc(100dvh - 300px)}}');

/* ---------- Hilfen ---------- */
function api(p,b){ return F.api(p,b?{body:b}:undefined); }
function on(){ return F.current==="chat"&&!!F.chatMode&&F.chatMode()==="wa"; }
function hm(t){ return t.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); }
function sameDay(a,b){ return a.toDateString()===b.toDateString(); }
function yday(){ var y=new Date(); y.setDate(y.getDate()-1); return y; }
function fmtT(iso){ var t=new Date(iso), n=new Date(); if(!iso||isNaN(t)) return ""; if(sameDay(t,n)) return hm(t); if(sameDay(t,yday())) return "gestern"; return t.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit",year:t.getFullYear()===n.getFullYear()?undefined:"2-digit"}); }
function dayLabel(iso){ var t=new Date(iso), n=new Date(); if(sameDay(t,n)) return "Heute"; if(sameDay(t,yday())) return "Gestern"; return t.toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long",year:t.getFullYear()===n.getFullYear()?undefined:"numeric"}); }
function bytes(n){ n=+n||0; if(n<1024) return n+" B"; if(n<1048576) return Math.round(n/1024)+" KB"; return (n/1048576).toFixed(1).replace(".",",")+" MB"; }
function initials(c){ var p=String(c.name||"").replace(/[^\p{L}\p{N}\s]/gu,"").trim().split(/\s+/).filter(Boolean); if(!p.length) return "#"; return (p[0][0]+(p.length>1?p[p.length-1][0]:"")).toUpperCase(); }
function badge(){ var el=document.getElementById("waTogN"), n=(WL&&WL.unread)||0; if(el) el.textContent=n?String(n):""; }
function accTxt(a){ var e=String(a.event||""); return /REMOVED|OFFBOARD|DISCONNECT|DELETED|INACTIV/.test(e+" "+(a.info||""))?"Die Verbindung wurde in der WhatsApp-App oder von Meta getrennt ("+e+(a.info?", "+a.info:"")+", "+F.ago(a.at)+"). Neu verbinden, falls das nicht gewollt war.":"Meldung von Meta: "+e+(a.info?" – "+a.info:""); }
function appView(){ return WS&&WS.ok!==false&&(WS.connected||WS.chats>0)&&!SHOWSETUP; }

/* ---------- Laden ---------- */
function loadStatus(){
  return api("/admin/api/wa/status").then(function(j){ if(j&&j.ok) WS=j; else if(!WS) WS={ok:false,error:(j&&j.error)||"Fehler"}; if(on()) paint(); if(WS.ok!==false&&(WS.connected||WS.chats)&&!WL) loadList(true); return WS; })
    .catch(function(){ if(!WS) WS={ok:false,error:"Keine Verbindung zum Server"}; if(on()) paint(); });
}
function loadList(force){
  if(busy){ if(force) again=true; return; } if(!(WS&&(WS.connected||WS.chats))) return; busy=true; var rq=Q;
  api("/admin/api/wa/chats?v="+(force||rq?"":encodeURIComponent(VER))+(rq?"&q="+encodeURIComponent(rq):"")).then(function(j){ busy=false;
    if(again||rq!==Q){ again=false; loadList(true); return; }
    if(!j||!j.ok||j.same) return; WL=j; VER=j.ver; badge();
    if(WS&&j.conn){ if(j.conn.connected!==WS.connected) loadStatus(); else if(WS.sync&&WS.sync.history.progress!==j.conn.progress){ WS.sync.history.progress=j.conn.progress; if(on()) paintBar(); } }
    if(on()&&appView()){ paintList(); if(SEL) loadThread(); }
  }).catch(function(){ busy=false; });
}
function loadThread(older){
  var id=SEL; if(!id) return; var cur=TH&&TH.id===id?TH:null;
  var url="/admin/api/wa/chat?id="+encodeURIComponent(id)+"&limit="+(older?100:Math.max(100,Math.min(2000,cur?cur.messages.length:0)))+(older&&cur&&cur.messages.length?"&before="+encodeURIComponent(cur.messages[0].id):"");
  return api(url).then(function(j){ if(SEL!==id) return;
    if(!j||!j.ok){ if(j&&/nicht gefunden/.test(j.error||"")){ SEL=null; TH=null; paintList(); paintThread(); } return; }
    if(older&&cur){ var ms=document.getElementById("waMsgs"), keep=ms?ms.scrollHeight-ms.scrollTop:0; cur.messages=j.messages.concat(cur.messages); cur.more=j.more; paintMsgs(false); if(ms) ms.scrollTop=ms.scrollHeight-keep; return; }
    var same=cur&&cur.chat.name===j.chat.name&&JSON.stringify(cur.messages)===JSON.stringify(j.messages);
    TH={id:id,chat:j.chat,messages:j.messages,more:j.more||(!!cur&&cur.more&&cur.messages.length>j.messages.length)};
    if(!same) paintThread();
    if(j.chat.unread&&!document.hidden&&on()) markRead(id);
  });
}
function markRead(id){ api("/admin/api/wa/read",{id:id}).then(function(j){ if(!j||!j.ok||!WL) return; (WL.chats||[]).forEach(function(c){ if(c.id===id){ WL.unread=Math.max(0,(WL.unread||0)-c.unread); c.unread=0; } }); badge(); if(on()) paintList(); }); }

/* ---------- Einrichtung ---------- */
function step(n,done,title){ return '<h3><span class="wa-n'+(done?" done":"")+'">'+(done?"✓":n)+'</span>'+esc(title)+'</h3>'; }
function copyRow(id,val,label){ return '<label class="fl">'+esc(label)+'<span class="wa-copy"><input class="f" id="'+id+'" readonly value="'+esc(val)+'"><button type="button" class="btn" data-act="wacopy:'+id+'">Kopieren</button></span></label>'; }
function cfgForm(s){
  var env=function(k){ return s.fromEnv&&s.fromEnv[k]?' <span class="muted">(aus Railway)</span>':''; };
  return '<form data-form="wacfg" class="stackf" autocomplete="off"><div class="wa-grid">'+
    '<label class="fl">App-ID'+env("appId")+'<input class="f" name="appId" inputmode="numeric" placeholder="z. B. 1234567890123456" value="'+esc(s.appId)+'"></label>'+
    '<label class="fl">App-Geheimnis'+env("appSecret")+'<input class="f" name="appSecret" type="password" autocomplete="new-password" placeholder="'+(s.hasSecret?"gespeichert – leer lassen zum Behalten":"32 Zeichen")+'"></label>'+
    '<label class="fl">Konfigurations-ID'+env("configId")+'<input class="f" name="configId" inputmode="numeric" value="'+esc(s.configId)+'"></label></div>'+
    '<div class="row-between" style="gap:10px;flex-wrap:wrap"><span class="muted small wa-lk">'+F.svg("walock")+' Das App-Geheimnis wird verschlüsselt am Server gespeichert und nie wieder angezeigt.</span><button class="btn primary" type="submit" id="waCfgBtn">Speichern</button></div><div class="bad-t small" id="waCfgErr" role="alert"></div></form>';
}
function notesHtml(){
  return '<section class="panel wa-p"><h3>Gut zu wissen</h3><ul class="wa-notes">'+
    '<li><b>Nur lesen:</b> Antworten schreibst du weiter in der WhatsApp-Business-App (oder WhatsApp Web/Mac) – das Cockpit sendet nie etwas. Kosten: keine fürs Mitlesen.</li>'+
    '<li><b>Verlauf und Kontakte nur einmal:</b> bis zu 6 Monate Verlauf und deine Kontakte gibt es nur in den ersten 24 Stunden nach dem Verbinden – das Cockpit fordert beides gleich beim Verbinden an. Fotos und Dateien im alten Verlauf nur aus den letzten 14 Tagen.</li>'+
    '<li><b>Nicht dabei:</b> Gruppenchats, Anrufe und Broadcast-Listen. Selbstlöschende Nachrichten und „Einmal ansehen“ sind danach in der App für Einzelchats aus.</li>'+
    '<li><b>Mindestens alle 13 Tage die App öffnen:</b> Ist die WhatsApp-Business-App am Handy rund 14 Tage zu, trennt Meta die Verbindung.</li>'+
    '<li><b>Verknüpfte Geräte:</b> WhatsApp Web und WhatsApp für Mac werden beim Verbinden einmal abgemeldet – danach einfach neu verknüpfen. Antworten aus WhatsApp für Windows kommen nicht ins Cockpit.</li>'+
    '<li><b>Datenschutz:</b> Alles, was über diese Nummer läuft, landet im Cockpit – auch private Chats, wenn du die Nummer privat nutzt. Meta verarbeitet die Nachrichten dabei mit (Datenschutzerklärung ergänzen). Im Cockpit bleiben sie '+((WS&&WS.retentionMonths)||12)+' Monate, dann werden sie automatisch gelöscht.</li>'+
    '<li><b>Falls Meta das Verbinden ablehnt</b> (Hinweis auf „Tech Provider“): Unternehmensverifizierung und App-Prüfung in der Meta-App machen – kostenlos, dauert ein paar Tage.</li>'+
    '<li><b>Ganz trennen:</b> in der WhatsApp-Business-App unter Einstellungen → Konto → Business-Plattform.</li></ul></section>';
}
function setupHtml(){
  var s=WS, cfgd=!!s.configured, hook=!!(s.verifiedAt||s.lastWebhookAt);
  return '<div class="stackf">'+
    '<section class="panel wa-p"><div class="row-between" style="gap:10px;flex-wrap:wrap"><h2>WhatsApp Business ins Cockpit holen – nur lesen</h2>'+(s.chats?'<button type="button" class="btn" data-act="wachats">Zu den Chats</button>':'')+'</div>'+
      '<p>Deine WhatsApp-Chats erscheinen hier, die WhatsApp-Business-App am Handy läuft ganz normal weiter. Antworten schreibst du weiter in der App – das Cockpit sendet nie etwas. Offizieller Weg über Meta (WhatsApp Business Platform mit „Coexistence“), kostenlos.</p>'+
      (s.account&&s.account.event?'<div class="notice">'+esc(accTxt(s.account))+'</div>':'')+(s.lastError?'<div class="notice">'+esc(s.lastError)+'</div>':'')+'</section>'+
    '<section class="panel wa-p">'+step(1,cfgd,"Meta-App anlegen (einmalig, ca. 15 Minuten)")+'<ol class="wa-steps">'+
      '<li>Auf <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com → Meine Apps</a> → <b>App erstellen</b>. Typ <b>Business</b>, mit dem Unternehmensportfolio von FS Creative verbinden.</li>'+
      '<li>Anwendungsfälle hinzufügen: <b>WhatsApp</b> (mit Kunden über WhatsApp in Kontakt treten) und <b>Facebook Login for Business</b>.</li>'+
      '<li>Facebook Login for Business → <b>Einstellungen</b>: Client-OAuth-Login, Web-OAuth-Login, HTTPS erzwingen, OAuth-Login im eingebetteten Browser, Strikter Modus und <b>Login mit dem JavaScript SDK</b> einschalten. Bei „Zulässige Domains für das JavaScript SDK“ und „Gültige OAuth-Redirect-URIs“ <code>https://www.fs-creative.at/</code> eintragen.</li>'+
      '<li>Facebook Login for Business → <b>Konfigurationen</b> → Konfiguration erstellen: Login-Variante <b>WhatsApp Embedded Signup</b>, Token-Ablauf <b>Nie</b>, Berechtigungen <code>whatsapp_business_management</code> und <code>whatsapp_business_messaging</code>. Die <b>Konfigurations-ID</b> kopieren.</li>'+
      '<li>App-Einstellungen → <b>Allgemein</b>: <b>App-ID</b> und <b>App-Geheimnis</b> kopieren, Datenschutz-URL <code>https://www.fs-creative.at/datenschutz</code> eintragen, speichern.</li></ol></section>'+
    '<section class="panel wa-p">'+step(2,cfgd,"Zugangsdaten hier eintragen")+cfgForm(s)+'</section>'+
    '<section class="panel wa-p">'+step(3,hook,"Webhook eintragen und App live schalten")+'<p class="small">In der Meta-App: <b>WhatsApp → Konfiguration → Webhook</b> → Bearbeiten. Diese zwei Werte einfügen und „Überprüfen und speichern“:</p>'+
      '<div class="wa-grid">'+copyRow("waHook",s.webhookUrl,"Callback-URL")+copyRow("waTok",s.verifyToken,"Überprüfungs-Token")+'</div>'+
      '<p class="small">Danach bei <b>Webhook-Felder</b> abonnieren: '+(s.fields||[]).map(function(f){ return '<code>'+esc(f)+'</code>'; }).join(" ")+'. Zum Schluss die App oben auf <b>Live</b> schalten – sonst schickt Meta manche Webhooks nicht.</p>'+
      '<p class="small">'+(s.verifiedAt?'<span class="wa-ok">✓ Webhook von Meta bestätigt ('+esc(F.ago(s.verifiedAt))+')</span>':'<span class="muted">Noch nicht von Meta bestätigt.</span>')+
        (s.lastWebhookAt?' · zuletzt Daten empfangen '+esc(F.ago(s.lastWebhookAt))+(s.lastWebhookField?' ('+esc(s.lastWebhookField)+')':''):'')+
        (cfgd?'':' · <span class="wa-warn">Erst Schritt 2 speichern – ohne App-Geheimnis kann das Cockpit die Webhooks nicht prüfen.</span>')+'</p></section>'+
    '<section class="panel wa-p">'+step(4,!!s.connected,"Mit WhatsApp Business verbinden")+'<p class="small">Voraussetzungen: WhatsApp-Business-App ab Version 2.24.17 am Handy, die Nummer ist mit keiner anderen Schnittstelle und keinem anderen Anbieter verbunden. Im Facebook-Fenster: Portfolio FS Creative wählen → <b>Bestehende WhatsApp Business App verbinden</b> → Nummer eingeben → am Handy bestätigen und <b>Chatverlauf teilen</b> erlauben. Die App am Handy offen lassen, bis der Abgleich fertig ist.</p>'+
      (cfgd?'<p><a class="btn primary" href="/admin/wa/connect" target="_blank" rel="opener">Mit WhatsApp Business verbinden</a></p>':'<p class="muted small">Geht, sobald Schritt 2 gespeichert ist.</p>')+'</section>'+
    notesHtml()+'</div>';
}

/* ---------- Chats ---------- */
function appHtml(){
  return '<div class="wa-bar" id="waBar"></div><section class="panel ch-app wa-app" id="waApp"><aside class="ch-list" id="waAside" aria-label="WhatsApp-Chats"><div class="wa-search"><input class="f" id="waQ" type="search" placeholder="Suchen: Name, Nummer oder Text" aria-label="WhatsApp-Chats durchsuchen" autocomplete="off"></div><div id="waList"></div></aside>'+
    '<section class="ch-th" id="waThread" aria-label="WhatsApp-Verlauf"></section></section>';
}
function paintBar(){
  var el=document.getElementById("waBar"), s=WS; if(!el||!s||!s.sync) return; var h=s.sync.history, warn=[];
  if(!s.connected) warn.push('Nicht verbunden – es kommen keine neuen Nachrichten. <button type="button" class="btn" data-act="wasetup">Einrichten</button>');
  if(s.account&&s.account.event&&s.account.event!=="ACCOUNT_RECONNECTED") warn.push(esc(accTxt(s.account)));
  if(s.lastError) warn.push(esc(s.lastError));
  if(h.error) warn.push(esc(h.error));
  var hist=h.requestedAt?(h.doneAt||h.progress>=100?"":"Verlauf wird übernommen: "+h.progress+" %"):"";
  el.innerHTML='<span class="wa-ro">'+F.svg("walock")+'Nur lesen – antworten in der WhatsApp-App</span>'+
    '<span class="muted">'+esc([s.number,s.name,hist,s.lastWebhookAt?"zuletzt empfangen "+F.ago(s.lastWebhookAt):""].filter(Boolean).join(" · "))+'</span>'+
    '<button type="button" class="btn" data-act="waset">Einstellungen</button>'+(warn.length?'<div class="notice">'+warn.join("<br>")+'</div>':'');
}
function paintList(){
  var el=document.getElementById("waList"), app=document.getElementById("waApp"); if(!el) return; if(app) app.classList.toggle("sel",!!SEL);
  var cs=WL&&WL.chats; if(!cs){ el.innerHTML='<div class="ch-empty">Lade …</div>'; return; }
  if(!cs.length){ el.innerHTML='<div class="ch-empty">'+(Q?'Nichts gefunden für „'+esc(Q)+'“.':'Noch keine WhatsApp-Chats.<br>Neue Nachrichten und der Verlauf erscheinen hier, sobald Meta sie schickt.')+'</div>'; return; }
  var box=document.getElementById("waAside"), y=box?box.scrollTop:0;
  el.innerHTML=cs.map(function(c){ var l=c.last||{};
    return '<button type="button" class="ch-c" data-act="waopen:'+esc(c.id)+'"'+(c.id===SEL?' aria-current="true"':'')+'><span class="ch-av" aria-hidden="true">'+esc(initials(c))+'</span><span class="t"><b>'+esc(c.name||c.number)+'</b>'+
      '<span>'+(c.snip?esc(c.snip):(l.dir==="out"?"Du: ":"")+esc(l.text||""))+'</span>'+(c.name?'<em>'+esc(c.number)+'</em>':'')+'</span>'+
      '<span class="r"><span>'+esc(fmtT(c.hitAt||c.lastAt))+'</span>'+(c.unread?'<span class="ch-badge" aria-label="'+c.unread+' ungelesen">'+c.unread+'</span>':'')+'</span></button>'; }).join("");
  if(box) box.scrollTop=y;
}
function headHtml(c){
  var num=String(c.id||"").replace(/\D/g,"");
  return '<button type="button" class="btn icon ch-back" data-act="waback" aria-label="Zurück zur Liste">←</button><span class="ch-av" aria-hidden="true">'+esc(initials(c))+'</span><div class="t"><b>'+esc(c.name||c.number)+'</b><span>'+esc(c.name?c.number:"WhatsApp")+'</span></div>'+
    '<div class="acts"><a class="btn primary" href="https://wa.me/'+num+'" target="_blank" rel="noopener noreferrer">In WhatsApp öffnen</a><button type="button" class="btn danger" data-act="wadel" aria-label="Chat aus dem Cockpit löschen">Löschen</button></div>';
}
var MST={wartet:"wird geladen …",fehlt:"nicht mehr verfügbar (älter als 14 Tage)",abgelaufen:"nicht mehr abrufbar",fehler:"konnte nicht geladen werden","zu groß":"zu groß fürs Cockpit (über 100 MB) – in der App ansehen","gelöscht":"gelöscht"};
var KIND={image:"Foto",video:"Video",audio:"Audio",document:"Dokument",sticker:"Sticker"};
function murl(m,dl){ return "/admin/api/wa/media?c="+encodeURIComponent(SEL)+"&m="+encodeURIComponent(m.id)+(dl?"&dl=1":""); }
function mediaHtml(m){
  var md=m.media; if(!md) return ""; var kind=m.type==="audio"&&m.voice?"Sprachnachricht":(KIND[m.type]||"Datei");
  if(md.status!=="ok") return '<div class="wa-i">'+esc(kind)+(md.name?" „"+esc(md.name)+"“":"")+' – '+esc(MST[md.status]||md.status||"")+'</div>';
  var u=esc(murl(m));
  if(m.type==="image") return '<button type="button" class="wa-img" data-act="waimg:'+esc(m.id)+'" aria-label="Foto groß anzeigen"><img src="'+u+'" alt="Foto" loading="lazy"></button>';
  if(m.type==="sticker") return '<img class="wa-stk" src="'+u+'" alt="Sticker" loading="lazy">';
  if(m.type==="video") return '<video src="'+u+'" controls preload="metadata" playsinline></video>';
  if(m.type==="audio") return '<audio src="'+u+'" controls preload="none"></audio><div class="wa-sub">'+esc(kind)+' · <a href="'+esc(murl(m,true))+'">herunterladen</a></div>';
  return '<a class="wa-doc" href="'+esc(murl(m,true))+'" download>'+F.svg("wadoc")+'<span><b>'+esc(md.name||"Dokument")+'</b><small>'+esc(bytes(md.size))+'</small></span></a>';
}
function tickHtml(s){ var rd=s==="read"||s==="played"; return s==="failed"?'<span class="bad-t" title="nicht zugestellt">!</span>':'<span'+(rd?' class="ok-t"':'')+' title="'+(rd?"gelesen":s==="delivered"?"zugestellt":"gesendet")+'">'+(s==="sent"?"✓":"✓✓")+'</span>'; }
function bubble(m){
  var me=m.dir==="out", b="", t=m.media?m.caption:m.text;
  if(m.deleted) b='<div class="wa-i">Diese Nachricht wurde gelöscht.</div>';
  else {
    if(m.fwd) b+='<div class="wa-sub"><i>Weitergeleitet</i></div>';
    if(m.quote) b+='<div class="wa-q">'+(m.quote.dir==="out"?"Du":"Kontakt")+': '+esc(m.quote.text)+'</div>';
    b+=mediaHtml(m);
    if(m.type==="location"&&m.loc) b+='<a class="wa-loc" href="https://www.google.com/maps?q='+(+m.loc.lat||0).toFixed(6)+','+(+m.loc.lng||0).toFixed(6)+'" target="_blank" rel="noopener noreferrer">'+F.svg("wapin")+esc(m.loc.name||m.loc.address||"Standort auf der Karte")+'</a>'+(m.loc.name&&m.loc.address?'<div class="wa-sub">'+esc(m.loc.address)+'</div>':'');
    if(m.type==="contacts") b+='<div class="wa-sub">Kontakt</div>';
    if(t) b+='<div class="wa-t">'+esc(t)+'</div>';
    if(m.type==="unsupported"&&!t) b+='<div class="wa-i">Diese Nachricht kann hier nicht angezeigt werden – in der WhatsApp-App ansehen.</div>';
  }
  var rx=m.reactions?Object.keys(m.reactions).map(function(k){ return m.reactions[k]; }).join(" "):"";
  return '<div class="ch-m wa-m '+(me?"me":"wa-in")+(rx?" rx":"")+'">'+b+'<small>'+(m.edited&&!m.deleted?"bearbeitet · ":"")+esc(hm(new Date(m.at)))+(me&&m.status?" "+tickHtml(m.status):"")+'</small>'+(rx?'<span class="wa-rx" title="Reaktion">'+esc(rx)+'</span>':'')+'</div>';
}
function msgsHtml(){
  var out=TH.more?'<button type="button" class="btn wa-older" data-act="waolder">Ältere Nachrichten laden</button>':'', day="";
  TH.messages.forEach(function(m){ var d=new Date(m.at).toDateString(); if(d!==day){ day=d; out+='<div class="wa-day">'+esc(dayLabel(m.at))+'</div>'; } out+=bubble(m); });
  return TH.messages.length?out:'<div class="ch-m sys">Noch keine Nachrichten.</div>';
}
function paintMsgs(stick){
  var ms=document.getElementById("waMsgs"); if(!ms) return;
  if(!(TH&&TH.id===SEL)){ ms.innerHTML='<div class="ch-m sys">Lade …</div>'; return; }
  var end=STICK||!ms.querySelector(".wa-m"); ms.innerHTML=msgsHtml(); if(stick!==false&&end){ ms.scrollTop=ms.scrollHeight; STICK=true; }
}
function paintThread(){
  var th=document.getElementById("waThread"), app=document.getElementById("waApp"); if(!th) return; if(app) app.classList.toggle("sel",!!SEL);
  if(!SEL){ th.removeAttribute("data-id"); th.innerHTML='<div class="ch-none">Wähle links einen Chat.<br>Antworten schreibst du in der WhatsApp-App am Handy.</div>'; return; }
  var c=(TH&&TH.id===SEL&&TH.chat)||((WL&&WL.chats)||[]).find(function(x){ return x.id===SEL; })||{id:SEL,name:"",number:"+"+SEL};
  if(th.getAttribute("data-id")!==SEL){ th.setAttribute("data-id",SEL); STICK=true; th.innerHTML='<div class="ch-hd" id="waHd"></div><div class="ch-msgs" id="waMsgs" role="log" aria-live="polite" aria-label="Nachrichten"></div>'; }
  document.getElementById("waHd").innerHTML=headHtml(c); paintMsgs();
}
/* Neu zeichnen nur, was sich geändert hat – Eingaben in der Einrichtung bleiben beim Aktualisieren stehen */
function paint(){
  var b=document.getElementById("waBody"); if(!b) return; badge();
  if(!WS){ b.removeAttribute("data-m"); b.innerHTML='<div class="panel ch-empty">Lade …</div>'; return; }
  if(WS.ok===false){ b.removeAttribute("data-m"); b.innerHTML='<div class="notice">'+esc(WS.error)+'</div>'; return; }
  if(!appView()){
    var key=JSON.stringify(WS), ae=document.activeElement;
    if(b.getAttribute("data-m")==="setup"&&(key===setupKey||(ae&&b.contains(ae)&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)))) return;
    b.setAttribute("data-m","setup"); setupKey=key; b.innerHTML=setupHtml(); return;
  }
  if(b.getAttribute("data-m")!=="app"){ b.setAttribute("data-m","app"); b.innerHTML=appHtml(); var qi=document.getElementById("waQ"); if(qi) qi.value=Q; }
  paintBar(); paintList(); paintThread();
}

/* ---------- Aktionen ---------- */
F.action("waopen",function(id){ if(SEL===id&&TH) return; SEL=id; TH=null; paintList(); paintThread(); loadThread(); });
F.action("waback",function(){ SEL=null; TH=null; paintList(); paintThread(); });
F.action("waolder",function(){ loadThread(true); });
F.action("wasetup",function(){ SHOWSETUP=true; paint(); });
F.action("wachats",function(){ SHOWSETUP=false; paint(); loadList(true); });
F.action("wacopy",function(id){ var el=document.getElementById(id); if(!el) return; var ok=function(){ F.toast("Kopiert"); }, fb=function(){ el.select(); try{ document.execCommand("copy"); ok(); }catch(e){ F.toast("Bitte markieren und kopieren",true); } };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(ok,fb); else fb(); });
F.action("waimg",function(id){ var m=TH&&TH.messages.find(function(x){ return x.id===id; }); if(!m) return;
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:17px">Foto'+(m.dir==="out"?" von dir":TH.chat?" von "+esc(TH.chat.name||TH.chat.number):"")+'</h2>'+F.btnClose()+'</div><img class="wa-big" src="'+esc(murl(m))+'" alt="Foto">'+
    (m.caption?'<p class="small" style="margin:0;white-space:pre-wrap">'+esc(m.caption)+'</p>':'')+'<div class="foot"><span class="muted small">'+esc(dayLabel(m.at)+", "+hm(new Date(m.at)))+'</span><a class="btn" href="'+esc(murl(m,true))+'">Herunterladen</a></div></div>',"wide"); });
F.action("wadel",function(){ var id=SEL, c=TH&&TH.chat;
  F.confirm("Chat mit "+((c&&(c.name||c.number))||"diesem Kontakt")+" aus dem Cockpit löschen? In WhatsApp bleibt er erhalten.","Löschen",function(){
    api("/admin/api/wa/delete",{id:id,confirm:true}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Löschen fehlgeschlagen",true); return; }
      SEL=null; TH=null; if(WL) WL.chats=(WL.chats||[]).filter(function(x){ return x.id!==id; }); VER=""; paintList(); paintThread(); loadList(true); F.toast("Chat aus dem Cockpit gelöscht"); }); },true); });
F.action("wasync",function(k){ F.confirm((k==="history"?"Verlauf":"Kontakte")+" jetzt bei Meta anfordern? Das geht nur einmal.","Anfordern",function(){
  api("/admin/api/wa/sync",{type:k}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } WS=j; F.toast("Angefordert – kommt in den nächsten Minuten"); paint(); }); }); });
F.action("waset",function(){
  var s=WS; if(!s||!s.sync) return; var k=s.sync.contacts, h=s.sync.history, ms=[3,6,12,24,36]; if(ms.indexOf(s.retentionMonths)<0) ms.push(s.retentionMonths);
  var row=function(kind,label,st,extra){ return '<div class="row-between small" style="gap:10px"><span><b>'+label+':</b> '+(st.requestedAt?'angefordert '+esc(F.ago(st.requestedAt))+(extra?' · '+esc(extra):''):'noch nicht angefordert')+(st.error?'<br><span class="bad-t">'+esc(st.error)+'</span>':'')+'</span>'+
    (!st.requestedAt&&s.sync.windowOpen?'<button type="button" class="btn" data-act="wasync:'+kind+'">Jetzt anfordern</button>':'')+'</div>'; };
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:19px">WhatsApp-Einstellungen</h2>'+F.btnClose()+'</div>'+
    '<p class="small" style="margin:0">'+(s.connected?'Verbunden: <b>'+esc(s.number||"–")+'</b>'+(s.name?' ('+esc(s.name)+')':'')+(s.connectedAt?' seit '+esc(F.de(s.connectedAt)):''):'<span class="wa-warn">Nicht verbunden</span>')+' · '+s.chats+' Chats im Cockpit</p>'+
    '<div class="sec-t">Abgleich bei Meta (je nur einmal'+(s.sync.windowEnds?', bis '+esc(new Date(s.sync.windowEnds).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})):'')+')</div>'+
    row("contacts","Kontakte",k,k.count?k.count+(k.count===1?" Kontakt":" Kontakte"):"")+row("history","Verlauf",h,h.requestedAt?(h.doneAt||h.progress>=100?"fertig":h.progress+" %"):"")+
    (s.connected&&!s.sync.windowOpen&&(!k.requestedAt||!h.requestedAt)?'<p class="muted small" style="margin:0">Die 24 Stunden nach dem Verbinden sind vorbei – Fehlendes geht nur nach neuem Verbinden (in der App trennen, dann hier neu verbinden).</p>':'')+
    '<div class="sec-t">Webhook</div>'+copyRow("waHook2",s.webhookUrl,"Callback-URL")+copyRow("waTok2",s.verifyToken,"Überprüfungs-Token")+
    '<p class="muted small" style="margin:0">Zuletzt Daten empfangen: '+(s.lastWebhookAt?esc(F.ago(s.lastWebhookAt)):"noch nie")+(s.mediaQueue?' · '+s.mediaQueue+' Fotos/Dateien werden noch geladen':'')+'</p>'+
    '<form data-form="waret" class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap"><label class="fl" style="flex:1">Im Cockpit aufbewahren<select class="f" name="months">'+ms.sort(function(a,b){ return a-b; }).map(function(m){ return '<option value="'+m+'"'+(m===s.retentionMonths?" selected":"")+'>'+m+' Monate</option>'; }).join("")+'</select></label><button class="btn" type="submit">Speichern</button></form>'+
    '<details><summary class="small">Meta-App-Daten ändern</summary><div style="margin-top:10px">'+cfgForm(s)+'</div></details>'+
    '<div class="foot"><a class="btn" href="/admin/wa/connect" target="_blank" rel="opener">'+(s.connected?"Neu verbinden":"Verbinden")+'</a>'+(s.connected?'<button type="button" class="btn danger" data-act="wadisc">Trennen …</button>':'')+'</div></div>',"narrow");
});
F.form("waret",function(f){ var n=+f.months.value, cur=(WS&&WS.retentionMonths)||12;
  var go=function(){ api("/admin/api/wa/settings",{retentionMonths:n}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } WS=j; F.closeModal(); F.toast("Aufbewahrung: "+n+" Monate"); VER=""; loadList(true); if(SEL) loadThread(); }); };
  if(n<cur) F.confirm("Nachrichten, die älter als "+n+" Monate sind, werden jetzt aus dem Cockpit gelöscht. Fortfahren?","Löschen und speichern",go,true); else go(); });
F.form("wacfg",function(f){ var btn=document.getElementById("waCfgBtn"), er=document.getElementById("waCfgErr"); if(er) er.textContent=""; if(btn) btn.disabled=true;
  api("/admin/api/wa/settings",{appId:f.appId.value.trim(),configId:f.configId.value.trim(),appSecret:f.appSecret.value.trim()}).then(function(j){ if(btn) btn.disabled=false;
    if(!j||!j.ok){ if(er) er.textContent=(j&&j.error)||"Speichern fehlgeschlagen"; return; }
    WS=j; setupKey=""; if(document.activeElement) document.activeElement.blur(); F.closeModal(); F.toast(j.configured?"Gespeichert – weiter mit dem Webhook":"Gespeichert"); paint(); })
  .catch(function(){ if(btn) btn.disabled=false; if(er) er.textContent="Keine Verbindung zum Server."; }); });
F.action("wadisc",function(){
  F.modal('<form data-form="wadisc" class="stackf"><div class="row-between"><h2 style="font-size:19px">WhatsApp im Cockpit trennen?</h2>'+F.btnClose()+'</div><p class="small" style="margin:0">Das Cockpit bekommt danach keine neuen Nachrichten mehr. Ganz trennen (auch bei Meta) geht in der WhatsApp-Business-App unter Einstellungen → Konto → Business-Plattform.</p>'+
    '<label class="row small" style="gap:10px;min-height:36px"><input type="radio" name="keep" value="keep" checked> Chats, Fotos und Dateien im Cockpit behalten</label><label class="row small" style="gap:10px;min-height:36px"><input type="radio" name="keep" value="del"> Alle WhatsApp-Chats, Fotos und Dateien im Cockpit löschen</label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn danger">Trennen</button></span></div><div class="err" id="waDiscErr"></div></form>',"narrow"); });
F.form("wadisc",function(f){ var del=f.keep.value==="del";
  api("/admin/api/wa/disconnect",{confirm:true,deleteData:del}).then(function(j){ if(!j||!j.ok){ var e=document.getElementById("waDiscErr"); if(e) e.textContent=(j&&j.error)||"Fehler"; return; }
    F.closeModal(); WS=j; WL=null; SEL=null; TH=null; VER=""; SHOWSETUP=false; badge(); paint(); if(j.chats) loadList(true); F.toast(del?"Getrennt – WhatsApp-Daten im Cockpit gelöscht":"Getrennt – die Chats bleiben im Cockpit"); }); });
F.listen("input","#waQ",function(el){ clearTimeout(qT); qT=setTimeout(function(){ var v=el.value.trim(); if(v===Q) return; Q=v; loadList(true); },250); });

/* Verlauf unten halten, solange man unten ist (auch wenn Fotos/Videos nachladen) */
document.addEventListener("scroll",function(e){ var t=e.target; if(t&&t.id==="waMsgs") STICK=t.scrollHeight-t.scrollTop-t.clientHeight<80; },true);
["load","loadedmetadata"].forEach(function(ev){ document.addEventListener(ev,function(e){ var t=e.target, ms=t&&t.closest&&t.closest("#waMsgs"); if(ms&&STICK) ms.scrollTop=ms.scrollHeight; },true); });
/* Verbinden-Seite meldet „fertig“ (window.opener) */
window.addEventListener("message",function(e){ if(e.origin!==location.origin||!e.data||e.data.type!=="fsc-wa-connected") return; SHOWSETUP=false; WL=null; loadStatus(); F.toast("WhatsApp verbunden – Kontakte und Verlauf werden übernommen"); });
document.addEventListener("visibilitychange",function(){ if(!document.hidden&&on()){ loadStatus(); loadList(); } });
setInterval(function(){ ticks++;
  if(on()&&!document.hidden){ if(appView()) loadList(); if(ticks%6===0) loadStatus(); }
  else if(ticks%6===0&&WS&&WS.connected) loadList();   /* Zahl am Umschalter */
},10000);
setTimeout(loadStatus,2500);

F.waChat={
  render:function(seg){ if(!WS) loadStatus(); return '<div id="waRoot" class="stackf"><div class="ch-top"><div><h1>Chat</h1><p>WhatsApp Business · nur lesen – antworten in der WhatsApp-App</p></div><div class="ch-tr">'+seg+'</div></div><div id="waBody"></div></div>'; },
  after:function(){ paint(); if(appView()){ loadList(true); if(SEL) loadThread(); } },
  badge:badge
};
})();
