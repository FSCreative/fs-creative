/* Einstellungen: Mail-Konten (Passwörter), privater iCloud-Kalender, Verbindungen, Darstellung, Beträge ausblenden.
   Öffnen: F.actions.settings() bzw. data-act="settings" – optional "settings:mail" / "settings:icloud" / "settings:<kontoKey>". */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;

F.css(
'.set{display:grid;gap:18px}'+
'.set-sec{display:grid;gap:10px}'+
'.set-sec>h3{font-size:16px}'+
'.set-p{margin:0;color:var(--ink-2);font-size:13.5px}'+
'.acard{border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:10px;background:var(--panel)}'+
'.acard .ah{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'+
'.acard .an{display:grid;min-width:0;flex:1}'+
'.acard .an span{color:var(--ink-3);font-size:13px;overflow-wrap:anywhere}'+
'.acard .af{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'+
'.acard .pw{display:flex;gap:6px;flex:1 1 240px;min-width:0}'+
'.acard .hint{font-size:12.5px;color:var(--ink-3)}'+
'.acard .hint a{color:var(--info)}'+
'.amsg{font-size:13.5px;padding:8px 10px;border-radius:9px}'+
'.amsg.ok{background:var(--ok-soft);color:var(--ok)}'+
'.amsg.bad{background:var(--bad-soft);color:var(--bad)}'+
'.amsg.wait{background:var(--info-soft);color:var(--info)}'+
'.icl{display:grid;gap:4px}'+
'.icl label{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:9px;cursor:pointer}'+
'.icl label:hover{background:var(--sunk)}'+
'.icl label.ro{opacity:.55;cursor:default}'+
'.icl i{width:11px;height:11px;border-radius:50%;flex:none}'+
'.icl em{font-style:normal;font-size:11.5px;color:var(--ink-3);margin-left:auto}'+
'.set-int{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px 16px}'+
'.set-int>div{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--line);font-size:13.5px;min-width:0}'+
'.set-int>div span:last-child{margin-left:auto;color:var(--ink-3);font-size:12px;white-space:nowrap}'+
'.set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}'+
'.set .seg{max-width:360px;flex:1 1 240px}'+
'.set-tabs{position:sticky;top:-20px;background:var(--panel);z-index:1;padding:4px 0}'
);

/* ---------- Zustand ---------- */
var S={data:null,err:"",msgs:{},poll:null};
var IC={step:"idle",user:"",pass:"",cals:[],sel:"",msg:"",ok:false,busy:false};
function icReset(){ IC={step:"idle",user:"",pass:"",cals:[],sel:"",msg:"",ok:false,busy:false}; }
function root(){ return document.getElementById("setRoot"); }

function accounts(){
  var d=S.data;
  if(d&&d.accounts&&d.accounts.length) return d.accounts;
  return ((F.D&&F.D.mail&&F.D.mail.accounts)||[]).map(function(a){ return Object.assign({},a,{ok:undefined}); });
}
function accStatus(a){
  var m=S.msgs[a.key]||{};
  if(m.restarting&&a.ok!==true) return '<span class="tag info">Wird verbunden …</span>';
  if(a.configured===false) return '<span class="tag warn">Passwort fehlt</span>';
  if(a.ok===true) return '<span class="tag ok">Verbunden</span>';
  if(a.ok===false) return '<span class="tag bad">Anmeldung fehlgeschlagen</span>';
  return '<span class="tag grey">'+(S.data?"Wird geprüft …":"Lade …")+'</span>';
}
function accCard(a,canSave){
  var m=S.msgs[a.key]||{}, k=esc(a.key), showLg=!a.primary&&(a.customLogin||m.showLogin);
  var hint=a.google?'Google-Konto: bitte ein <b>App-Passwort</b> verwenden, nicht das normale Passwort. Erstellen unter <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords</a> (als '+esc(a.user||"")+' angemeldet, die Bestätigung in zwei Schritten muss aktiv sein).'
    :(a.primary?'Das Passwort deines World4You-Postfachs.':'Passwort des Postfachs.');
  return '<div class="acard" data-akey="'+k+'">'+
    '<div class="ah"><span class="dot '+(a.ok===true?"ok":a.configured===false?"warn":a.ok===false?"bad":"")+'"></span><div class="an"><b>'+esc(a.label||a.key)+(a.primary?' <span class="tag grey">Hauptkonto</span>':'')+'</b><span>'+esc(a.user||"")+'</span></div>'+accStatus(a)+'</div>'+
    '<div class="af"><div class="pw"><input class="f" type="password" autocomplete="new-password" spellcheck="false" data-sk="pw:'+k+'" data-apw="'+k+'" aria-label="Passwort für '+esc(a.label||a.key)+'" placeholder="'+(a.configured===false?(a.google?"App-Passwort eintragen":"Passwort eintragen"):"Neues Passwort (leer = unverändert)")+'"><button type="button" class="btn" data-apweye="'+k+'" aria-label="Passwort anzeigen">Anzeigen</button></div>'+
    '<button type="button" class="btn primary" data-asave="'+k+'"'+(canSave===false?' disabled title="Railway-Token fehlt"':'')+(m.busy?' disabled':'')+'>'+(m.busy?"Wird geprüft …":"Prüfen &amp; speichern")+'</button></div>'+
    (a.primary?'':(showLg?'<label class="fl">Anmeldename, falls abweichend (z. B. Hauptadresse bei einem Alias)<input class="f" type="text" autocomplete="off" spellcheck="false" data-sk="lg:'+k+'" data-alogin="'+k+'" value="'+esc(a.customLogin||"")+'"></label>':'<div><button type="button" class="link" data-amore="'+k+'">Anmeldename weicht von der Adresse ab?</button></div>'))+
    '<div class="hint">'+hint+'</div>'+
    (m.text?'<div class="amsg '+(m.restarting?"wait":m.ok?"ok":"bad")+'" role="status">'+esc(m.text)+'</div>':'')+
  '</div>';
}

function icHtml(){
  var st=(S.data&&S.data.icloud)||{}, msg=IC.msg?'<div class="amsg '+(IC.ok?"ok":"bad")+'" role="status">'+esc(IC.msg)+'</div>':'';
  if(st.configured&&IC.step==="idle"){
    return '<div class="acard"><div class="ah"><span class="dot" style="background:'+esc(st.calColor||"var(--ok)")+'"></span><div class="an"><b>'+esc(st.calName||"Kalender")+'</b><span>'+esc(st.user||"")+'</span></div><span class="tag ok">Verbunden</span></div>'+
      '<div class="af"><button type="button" class="btn" data-ic="change">Anderen Kalender wählen</button><button type="button" class="btn" data-ic="disconnect">Trennen</button></div>'+msg+'</div>';
  }
  if(IC.step==="pick"){
    return '<div class="acard"><div class="ah"><div class="an"><b>Kalender auswählen</b><span>'+esc(IC.user)+'</span></div></div><div class="icl" role="radiogroup" aria-label="iCloud-Kalender">'+
      (IC.cals.length?IC.cals.map(function(c){ return '<label class="'+(c.writable?"":"ro")+'"><input type="radio" name="icl" value="'+esc(c.url)+'"'+(IC.sel===c.url?" checked":"")+(c.writable?"":" disabled")+'><i style="background:'+esc(c.color||"var(--info)")+'"></i><span>'+esc(c.name||"Kalender")+'</span>'+(c.shared?'<em>geteilt</em>':'')+(c.writable?'':'<em>nur lesen</em>')+'</label>'; }).join(""):'<div class="empty">Keine Termin-Kalender gefunden.</div>')+
      '</div><div class="af"><button type="button" class="btn" data-ic="back">Zurück</button><button type="button" class="btn primary" data-ic="save"'+(IC.busy||!IC.cals.length?" disabled":"")+'>'+(IC.busy?"Speichert …":"Speichern")+'</button></div>'+msg+'</div>';
  }
  return '<div class="acard">'+
    '<label class="fl">Apple-ID (E-Mail)<input class="f" type="email" autocomplete="off" spellcheck="false" id="icUser" data-sk="icuser" value="'+esc(IC.user||st.user||"")+'"></label>'+
    '<div class="af"><div class="pw"><input class="f" type="password" autocomplete="new-password" spellcheck="false" id="icPass" data-sk="icpass" aria-label="App-spezifisches Passwort" placeholder="App-spezifisches Passwort (xxxx-xxxx-xxxx-xxxx)"><button type="button" class="btn" data-ic="eye" aria-label="Passwort anzeigen">Anzeigen</button></div>'+
    '<button type="button" class="btn primary" data-ic="discover"'+(IC.busy?" disabled":"")+'>'+(IC.busy?"Verbinde …":"Verbinden")+'</button></div>'+
    '<div class="hint">Mit der Apple-ID anmelden, über die du den geteilten Kalender am iPhone siehst. Das <b>App-spezifische Passwort</b> erstellst du unter <a href="https://account.apple.com/account/manage" target="_blank" rel="noopener">account.apple.com</a> → Anmeldung und Sicherheit → App-spezifische Passwörter. Dein normales Apple-Passwort funktioniert hier nicht.</div>'+
    (st.configured?'<div><button type="button" class="link" data-ic="cancel">Abbrechen</button></div>':'')+msg+'</div>';
}

function intHtml(){
  var d=S.data, rows=((d&&d.integrations)||[]).map(function(x){ return '<div><span class="dot '+(x.ok?"ok":"")+'"></span><span>'+esc(x.label)+'</span><span>'+(x.ok?"verbunden":"nicht eingerichtet")+'</span></div>'; });
  var sk=F.D&&F.D.skikaiser;
  if(sk) rows.push('<div><span class="dot '+(sk.configured?(sk.error?"bad":"ok"):"")+'"></span><span>Skikaiser (App-Verkäufe)</span><span>'+(!sk.configured?"nicht eingerichtet":sk.error?"Fehler":"verbunden")+'</span></div>');
  if(!rows.length) return '<div class="muted">'+(S.err?esc(S.err):(d?"—":"Lade …"))+'</div>';
  return '<div class="set-int">'+rows.join("")+'</div>';
}
function skiHtml(){
  var sk=F.D&&F.D.skikaiser;
  if(!sk) return '<p class="set-p">Noch keine Daten geladen.</p>';
  if(!sk.configured) return '<div class="amsg wait">Nicht eingerichtet. Damit die App-Verkäufe erscheinen, am Server die Variablen <b>SKIKAISER_STATS_URL</b> und <b>SKIKAISER_STATS_TOKEN</b> setzen (Railway → Dienst der Website → Variables).</div>';
  if(sk.error) return '<div class="amsg bad">Eingerichtet, aber die Statistik antwortet nicht: '+esc(sk.error)+'. URL und Token prüfen.</div>';
  var t=sk.totals||{};
  return '<div class="amsg ok">Verbunden'+(t.count!=null?' · '+esc(t.count)+' Käufe '+esc(F.year)+' · <span class="money">'+F.eur((t.proceedsCents||0)/100)+'</span> Erlös nach Store-Gebühr':'')+'</div>';
}

function prefsHtml(){
  var t=F.theme(), p=!!F.ls("fsc_priv");
  return '<div class="set-row"><span>Darstellung</span><div class="seg" role="group" aria-label="Darstellung">'+[["auto","Automatisch"],["light","Hell"],["dark","Dunkel"]].map(function(o){ return '<button type="button" data-act="theme:'+o[0]+'" aria-pressed="'+(t===o[0])+'">'+o[1]+'</button>'; }).join("")+'</div></div>'+
    '<div class="set-row"><span>Beträge ausblenden<br><span class="muted" style="font-size:12.5px">Verdeckt alle Summen, z. B. beim Bildschirm teilen.</span></span><div class="seg" role="group" aria-label="Beträge" style="max-width:240px"><button type="button" data-setpriv="0" aria-pressed="'+!p+'">Sichtbar</button><button type="button" data-setpriv="1" aria-pressed="'+p+'">Ausgeblendet</button></div></div>';
}

/* ---------- Rendern (Eingaben bleiben beim Neuzeichnen erhalten) ---------- */
function body(){
  var d=S.data||{}, accs=accounts();
  return '<div class="set" id="setRoot">'+
    '<div class="row-between"><h2 style="font-size:20px">Einstellungen</h2>'+F.btnClose()+'</div>'+
    '<section class="set-sec" id="set-mail"><h3>E-Mail-Konten</h3><p class="set-p">Passwort eintragen und auf „Prüfen &amp; speichern“ klicken. Die Anmeldung wird zuerst getestet, dann wird das Passwort sicher beim Mail-Dienst hinterlegt (nicht im Browser gespeichert). Der Mail-Dienst startet danach kurz neu.</p>'+
      (d.canSave===false?'<div class="amsg bad">Speichern ist gerade nicht möglich: Der Railway-Token fehlt am Server.</div>':'')+
      (accs.length?accs.map(function(a){ return accCard(a,d.canSave); }).join(""):'<div class="muted">'+(S.err?esc(S.err):(S.data?"Der Mail-Dienst meldet keine Konten.":"Lade …"))+'</div>')+'</section>'+
    '<section class="set-sec" id="set-icloud"><h3>Privater Kalender (iCloud)</h3><p class="set-p">Verbindet den Kalender im Cockpit mit einem iCloud-Kalender, z. B. dem mit deiner Lebensgefährtin geteilten. Private Termine landen dort und erscheinen auf allen iPhones; Änderungen am iPhone siehst du hier.</p>'+icHtml()+'</section>'+
    '<section class="set-sec" id="set-prefs"><h3>Ansicht</h3><p class="set-p">Wird nur in diesem Browser gespeichert.</p>'+prefsHtml()+'</section>'+
    '<section class="set-sec" id="set-ski"><h3>Skikaiser</h3>'+skiHtml()+'</section>'+
    '<section class="set-sec" id="set-int"><h3>Verbindungen</h3><p class="set-p">Schnittstellen, die am Server eingerichtet sind. Fehlende Zugänge werden in Railway als Variablen hinterlegt.</p>'+intHtml()+'</section>'+
    '<div class="row" style="flex-wrap:wrap;gap:8px"><a class="btn" href="/admin/logout">Abmelden</a></div>'+
  '</div>';
}
function paint(){
  var r=root(); if(!r) return;
  var keep={}, ae=document.activeElement, fk=ae&&r.contains(ae)?(ae.getAttribute("data-sk")||(ae.getAttribute("data-asave")?"sv:"+ae.getAttribute("data-asave"):null)||(ae.getAttribute("data-ic")?"ic:"+ae.getAttribute("data-ic"):null)):null, sel=ae&&ae.selectionStart;
  r.querySelectorAll("[data-sk]").forEach(function(i){ keep[i.getAttribute("data-sk")]={v:i.value,t:i.type}; });
  var radio=r.querySelector("input[name=icl]:checked"); if(radio) IC.sel=radio.value;
  var dlg=r.closest(".dialog"), sc=dlg?dlg.scrollTop:0;
  r.outerHTML=body();
  r=root();
  Object.keys(keep).forEach(function(k){ var i=r.querySelector('[data-sk="'+k+'"]'); if(i){ i.value=keep[k].v; if(i.type==="password"||i.type==="text") i.type=keep[k].t; } });
  if(dlg) dlg.scrollTop=sc;
  if(fk){ var f=r.querySelector('[data-sk="'+fk+'"]')||(fk.indexOf("sv:")===0?r.querySelector('[data-asave="'+fk.slice(3)+'"]'):null)||(fk.indexOf("ic:")===0?r.querySelector('[data-ic="'+fk.slice(3)+'"]'):null); if(f&&!f.disabled){ f.focus(); try{ if(sel!=null) f.setSelectionRange(sel,sel); }catch(e){} } }
}

/* ---------- Laden + Abfragen alle 8 s, solange offen ---------- */
function load(){
  return F.api("/admin/api/settings").then(function(d){
    if(!d||d.ok===false){ S.err="Einstellungen konnten nicht geladen werden"+(d&&d.error?" ("+d.error+")":"")+"."; paint(); return; }
    S.data=d; S.err="";
    var reload=false;
    Object.keys(S.msgs).forEach(function(k){
      var m=S.msgs[k], a=(d.accounts||[]).find(function(x){ return x.key===k; });
      if(!m.restarting||!a) return;
      if(a.ok===true){ m.restarting=false; m.ok=true; m.text="Verbunden – die Mails werden jetzt geladen."; reload=true; }
      else if(a.ok===false&&a.configured!==false&&m.since&&Date.now()-m.since>60000){ m.restarting=false; m.ok=false; m.text="Anmeldung nach dem Neustart fehlgeschlagen – bitte das Passwort prüfen."; }
    });
    if(reload) F.load(true);
    paint();
  }).catch(function(){ S.err="Keine Verbindung zum Server."; paint(); });
}
function stopPoll(){ clearInterval(S.poll); S.poll=null; }
function startPoll(){ stopPoll(); S.poll=setInterval(function(){ if(!root()){ stopPoll(); return; } if(!document.hidden) load(); },8000); }

F.action("settings",function(where){
  if(!S.data) S.err="";
  if(IC.step!=="idle"&&!IC.busy) icReset();
  F.closeDrawer();
  F.modal(body(),"wide");
  load(); startPoll();
  var target=where==="icloud"?"set-icloud":where==="mail"||where==="konten"?"set-mail":where==="prefs"?"set-prefs":"";
  var acc=where&&!target?document.querySelector('#setRoot [data-akey="'+(window.CSS&&CSS.escape?CSS.escape(where):where)+'"]'):null;
  setTimeout(function(){
    var el=acc||(target&&document.getElementById(target));
    if(el){ el.scrollIntoView({block:"start"}); var i=el.querySelector("input"); if(i) i.focus(); }
    else { var c=document.querySelector("#setRoot [data-closemodal]"); if(c) c.focus(); }
  },40);
});

/* Passwort anzeigen, Anmeldename einblenden */
F.listen("click","#setRoot [data-apweye]",function(b){ var i=root().querySelector('[data-apw="'+b.getAttribute("data-apweye")+'"]'); if(!i) return; var show=i.type==="password"; i.type=show?"text":"password"; b.textContent=show?"Verbergen":"Anzeigen"; b.setAttribute("aria-label",show?"Passwort verbergen":"Passwort anzeigen"); i.focus(); });
F.listen("click","#setRoot [data-amore]",function(b){ var k=b.getAttribute("data-amore"); S.msgs[k]=Object.assign(S.msgs[k]||{},{showLogin:true}); paint(); var i=root().querySelector('[data-alogin="'+k+'"]'); if(i) i.focus(); });

/* Mail-Konto prüfen & speichern */
function saveAccount(key){
  var r=root(); if(!r) return;
  var pwEl=r.querySelector('[data-apw="'+key+'"]'), lgEl=r.querySelector('[data-alogin="'+key+'"]'), pw=(pwEl&&pwEl.value||"").trim();
  if(!pw){ S.msgs[key]=Object.assign(S.msgs[key]||{},{ok:false,restarting:false,text:"Bitte zuerst das Passwort eintragen."}); paint(); var p2=root().querySelector('[data-apw="'+key+'"]'); if(p2) p2.focus(); return; }
  var prev=S.msgs[key]||{};
  S.msgs[key]={busy:true,showLogin:prev.showLogin}; paint();
  F.api("/admin/api/settings/mail-account",{body:{key:key,pass:pw,login:lgEl?lgEl.value.trim():""}}).then(function(j){
    if(j&&j.ok){
      S.msgs[key]={ok:true,restarting:true,since:Date.now(),showLogin:prev.showLogin,text:(j.tested===false?"Gespeichert (Anmeldung nicht getestet).":"Anmeldung erfolgreich – gespeichert.")+" Der Mail-Dienst startet neu (ca. 1–2 Minuten), danach erscheinen die Mails im Postfach."};
      var i=root()&&root().querySelector('[data-apw="'+key+'"]'); if(i) i.value="";
      F.toast("Passwort gespeichert – Mail-Dienst startet neu");
    } else {
      var e=j&&j.error, t=e==="login_failed"?"Anmeldung abgelehnt – das Passwort stimmt nicht. Bei Google bitte ein App-Passwort verwenden."
        :e==="connect_failed"?"Mail-Server nicht erreichbar"+(j.detail?": "+j.detail:"")+"."
        :e==="railway_token_missing"?"Speichern nicht möglich: Der Railway-Token fehlt am Server."
        :e==="unknown_account"?"Dieses Konto kennt der Mail-Dienst nicht."
        :"Fehler: "+((j&&(j.detail||e))||"unbekannt");
      S.msgs[key]={ok:false,text:t,showLogin:prev.showLogin};
    }
    paint();
  }).catch(function(){ S.msgs[key]={ok:false,text:"Keine Verbindung zum Server.",showLogin:prev.showLogin}; paint(); });
}
F.listen("click","#setRoot [data-asave]",function(b){ if(!b.disabled) saveAccount(b.getAttribute("data-asave")); });
F.listen("keydown","#setRoot [data-apw],#setRoot [data-alogin]",function(el,e){ if(e.key!=="Enter") return; e.preventDefault(); saveAccount(el.getAttribute("data-apw")||el.getAttribute("data-alogin")); });

/* iCloud */
function icPost(b,cb){ IC.busy=true; paint(); F.api("/admin/api/settings/icloud",{body:b}).then(function(j){ IC.busy=false; cb(j||{ok:false}); paint(); }).catch(function(){ IC.busy=false; cb({ok:false,error:"Keine Verbindung zum Server."}); paint(); }); }
function icDiscover(){
  var r=root(), u=(r.querySelector("#icUser").value||"").trim(), p=(r.querySelector("#icPass").value||"").trim();
  if(!u||!p){ IC.msg="Bitte Apple-ID und App-spezifisches Passwort eintragen."; IC.ok=false; paint(); return; }
  IC.user=u; IC.pass=p; IC.msg="";
  icPost({action:"discover",user:u,pass:p},function(j){
    if(j.ok){ IC.step="pick"; IC.cals=j.calendars||[]; var w=IC.cals.filter(function(c){ return c.writable; }), sh=w.filter(function(c){ return c.shared; }); IC.sel=(sh[0]||w[0]||{}).url||""; IC.msg=""; }
    else { IC.pass=""; IC.ok=false; IC.msg=j.error==="login_failed"?"Anmeldung abgelehnt – bitte ein App-spezifisches Passwort verwenden (nicht das normale Apple-Passwort).":j.error==="missing"?"Bitte Apple-ID und Passwort eintragen.":"Verbindung fehlgeschlagen"+(j.detail?": "+j.detail:(j.error&&j.error!=="failed"?": "+j.error:""))+"."; var pi=root()&&root().querySelector("#icPass"); if(pi) pi.value=""; }
  });
}
F.listen("click","#setRoot [data-ic]",function(b){
  var a=b.getAttribute("data-ic"), r=root();
  if(a==="eye"){ var pi=r.querySelector("#icPass"); if(pi){ var show=pi.type==="password"; pi.type=show?"text":"password"; b.textContent=show?"Verbergen":"Anzeigen"; pi.focus(); } return; }
  if(a==="change"){ icReset(); IC.step="form"; IC.user=(S.data&&S.data.icloud&&S.data.icloud.user)||""; paint(); var pp=root().querySelector("#icPass"); if(pp) pp.focus(); return; }
  if(a==="cancel"){ icReset(); paint(); return; }
  if(a==="back"){ IC.step="form"; IC.msg=""; paint(); return; }
  if(a==="discover"){ icDiscover(); return; }
  if(a==="save"){
    var sel=r.querySelector("input[name=icl]:checked"); if(!sel){ IC.msg="Bitte einen Kalender wählen."; IC.ok=false; paint(); return; }
    IC.sel=sel.value;
    icPost({action:"save",user:IC.user,pass:IC.pass,calUrl:sel.value},function(j){
      if(j.ok){ icReset(); IC.msg="Verbunden mit „"+(j.calName||"Kalender")+"“ – private Termine erscheinen jetzt im Kalender."; IC.ok=true; load(); F.load(true); }
      else { IC.ok=false; IC.msg=j.error==="login_failed"?"Anmeldung abgelehnt – bitte erneut verbinden.":"Speichern fehlgeschlagen"+(j.detail?": "+j.detail:(j.error?" ("+j.error+")":""))+"."; }
    });
    return;
  }
  if(a==="disconnect"){
    /* Bestätigung inline statt Dialog-Wechsel, damit die Einstellungen offen bleiben */
    if(b.getAttribute("data-sure")!=="1"){ b.setAttribute("data-sure","1"); b.classList.add("danger"); b.textContent="Wirklich trennen?"; IC.msg="Die Termine bleiben in iCloud erhalten, erscheinen aber nicht mehr im Cockpit."; IC.ok=false;
      var m=r.querySelector("#set-icloud .amsg"); if(m) m.textContent=IC.msg; else b.closest(".acard").insertAdjacentHTML("beforeend",'<div class="amsg wait" role="status">'+esc(IC.msg)+'</div>'); IC.msg=""; return; }
    icPost({action:"disconnect"},function(j){ if(j.ok){ IC.msg="Getrennt."; IC.ok=true; load(); F.load(true); } else { IC.msg="Trennen fehlgeschlagen"+(j.error?" ("+j.error+")":"")+"."; IC.ok=false; } });
  }
});
F.listen("keydown","#setRoot #icUser,#setRoot #icPass",function(el,e){ if(e.key==="Enter"){ e.preventDefault(); icDiscover(); } });
F.listen("change","#setRoot input[name=icl]",function(el){ IC.sel=el.value; });

/* Beträge ausblenden (Schalter in den Einstellungen) */
F.listen("click","#setRoot [data-setpriv]",function(b){ var on=b.getAttribute("data-setpriv")==="1"; if(on!==!!F.ls("fsc_priv")) F.actions.priv(); });

/* Darstellung/Beträge auch von anderswo geändert → Schalter nachziehen */
var origTheme=F.theme; F.theme=function(t){ var r=origTheme.apply(this,arguments); if(t!==undefined) syncPrefs(); return r; };
var origPriv=F.priv; F.priv=function(on){ var r=origPriv.apply(this,arguments); if(on!==undefined) syncPrefs(); return r; };
function syncPrefs(){ var s=document.querySelector("#setRoot #set-prefs"); if(!s) return; s.innerHTML='<h3>Ansicht</h3><p class="set-p">Wird nur in diesem Browser gespeichert.</p>'+prefsHtml(); }
F.onData(function(){ if(root()){ var s=document.querySelector("#setRoot #set-ski"); if(s) s.innerHTML='<h3>Skikaiser</h3>'+skiHtml(); } });

F.searcher(function(q){
  var hits=[["E-Mail-Konten & Passwörter","settings:mail","Einstellungen"],["Privater Kalender (iCloud) verbinden","settings:icloud","Einstellungen"],["Verbindungen & Schnittstellen","settings:","Einstellungen"],["Skikaiser einrichten","settings:","Einstellungen"]];
  return hits.filter(function(h){ return h[0].toLowerCase().indexOf(q)>-1; }).map(function(h){ return {group:"Einstellungen",label:h[0],sub:h[2],act:h[1]}; });
});
})();
