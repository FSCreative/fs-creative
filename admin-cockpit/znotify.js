/* Hinweise am PC: Popup (Browser-Mitteilung) + Ton bei neuer Mail im Posteingang oder neuer Website-Chat-Nachricht.
   Nur am Computer, solange das Cockpit in einem Tab offen ist (auch im Hintergrund). Einstellungen je Browser (localStorage „fsc-dnotify“).
   Öffnen: Glocke in der Kopfleiste bzw. data-act="dnotcfg". Eigene, sparsame Abfragen: Mails alle 30 s (etag), Chat alle 15 s (?v=). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
if(/iPhone|iPad|Android/.test(navigator.userAgent)) return;   // am Handy gibt es dafür Push
var K="fsc-dnotify", DEF={on:false,sound:true,mail:true,chat:true};
function cfg(){ try{ return Object.assign({},DEF,JSON.parse(localStorage.getItem(K)||"{}")); }catch(e){ return Object.assign({},DEF); } }
function save(c){ try{ localStorage.setItem(K,JSON.stringify(c)); }catch(e){} bell(); }
var hasN="Notification" in window;
/* Ton: kurzer Zweiklang per WebAudio (keine Datei); Browser erlauben Ton erst nach einem Klick im Cockpit → beim ersten Klick freischalten */
var AC=null; function ac(){ try{ AC=AC||new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==="suspended") AC.resume(); }catch(e){} return AC; }
document.addEventListener("click",function(){ if(cfg().on&&cfg().sound) ac(); },{capture:true});
function beep(kind){ var a=ac(); if(!a) return; try{ var t=a.currentTime+0.02;
  (kind==="chat"?[[880,0],[1175,0.13],[1568,0.26]]:[[660,0],[990,0.15]]).forEach(function(n){ var o=a.createOscillator(), g=a.createGain(); o.type="sine"; o.frequency.value=n[0];
    g.gain.setValueAtTime(0.0001,t+n[1]); g.gain.exponentialRampToValueAtTime(0.22,t+n[1]+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+n[1]+0.32); o.connect(g); g.connect(a.destination); o.start(t+n[1]); o.stop(t+n[1]+0.36); }); }catch(e){} }
function pop(kind,title,body,go){
  var c=cfg(); if(!c.on||!c[kind]) return;
  if(c.sound) beep(kind);
  if(hasN&&Notification.permission==="granted"){ try{ var n=new Notification(title,{body:String(body||"").slice(0,180),tag:"fsc-"+kind,renotify:true,icon:"/logos/cockpit-icon-180.png"});
    n.onclick=function(){ try{ window.focus(); }catch(e){} if(go) F.go(go); n.close(); }; }catch(e){} }
  else if(!document.hidden&&F.toast) F.toast(title+(body?" – "+body:""));
}
/* neue Mails: ungelesene im Posteingang, die beim letzten Blick noch nicht da waren (erste Runde nur merken) */
var mailSeen=null, mailEtag="";
function pollMail(){ if(!cfg().on||!cfg().mail) return;
  F.api("/admin/api/mail?etag="+encodeURIComponent(mailEtag)).then(function(md){
    if(!md||md.same||!Array.isArray(md.messages)) return; mailEtag=md.etag||"";
    var inbox=md.messages.filter(function(m){ return m&&m.id&&/^inbox$/i.test(m.folder||"INBOX")&&!m.deleted; });
    if(!mailSeen){ mailSeen={}; inbox.forEach(function(m){ mailSeen[m.id]=1; }); return; }
    var fresh=inbox.filter(function(m){ return !mailSeen[m.id]&&!m.read; }); inbox.forEach(function(m){ mailSeen[m.id]=1; });
    if(fresh.length===1) pop("mail",fresh[0].fromName||fresh[0].from||"Neue Mail",fresh[0].subject||"(ohne Betreff)","post");
    else if(fresh.length>1) pop("mail",fresh.length+" neue Mails",fresh.slice(0,3).map(function(m){ return (m.fromName||m.from||"")+": "+(m.subject||""); }).join(" · "),"post");
  }).catch(function(){});
}
/* Chat: ungelesene Besucher-Nachrichten je Unterhaltung gestiegen → Hinweis */
var chatSeen=null, chatVer="";
function pollChat(){ if(!cfg().on||!cfg().chat) return;
  F.api("/admin/api/chat/state?v="+encodeURIComponent(chatVer)).then(function(j){
    if(!j||!j.ok||j.same||!Array.isArray(j.convs)) return; chatVer=j.ver||"";
    var cur={}; j.convs.forEach(function(c){ cur[c.id]=c.unread||0; });
    if(!chatSeen){ chatSeen=cur; return; }
    var up=j.convs.filter(function(c){ return (c.unread||0)>(chatSeen[c.id]||0); }); chatSeen=cur;
    if(up.length){ var c=up[0]; pop("chat","Website-Chat: "+(c.name||("Besucher #"+c.no)),(c.last&&c.last.text)||"Neue Nachricht","chat"); }
  }).catch(function(){});
}
setInterval(pollMail,30000); setInterval(pollChat,15000); setTimeout(function(){ pollMail(); pollChat(); },4000);
/* Glocke in der Kopfleiste + Einstellungen */
var ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
function bell(){ var host=document.querySelector(".topbar .tb-right"); if(!host) return; var b=document.getElementById("dnotBtn");
  if(!b){ b=document.createElement("button"); b.id="dnotBtn"; b.type="button"; b.className="tb-i"; b.setAttribute("data-act","dnotcfg"); var st=document.getElementById("stamp"); host.insertBefore(b,st?st.nextSibling:host.firstChild); }
  var on=cfg().on; b.innerHTML=ICON+(on?'<span class="dn-dot" aria-hidden="true"></span>':''); b.title=on?"Hinweise am PC: an":"Hinweise am PC: aus"; b.setAttribute("aria-label",b.title); }
F.css(".topbar #dnotBtn{position:relative}.topbar #dnotBtn .dn-dot{position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;background:#30d158}");
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bell); else bell();
F.action("dnotcfg",function(){
  var c=cfg(), perm=hasN?Notification.permission:"unsupported";
  var row=function(k,t){ return '<label class="row small" style="gap:10px;min-height:38px"><input type="checkbox" name="'+k+'"'+(c[k]?" checked":"")+' style="width:20px;height:20px"> '+esc(t)+'</label>'; };
  F.modal('<form data-form="dnotcfg" class="stackf"><div class="row-between"><h2 style="font-size:19px">Hinweise am PC</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Popup und Ton, solange das Cockpit in einem Browser-Tab offen ist – auch wenn du gerade in einem anderen Programm arbeitest.'+(perm==="denied"?' <b>Der Browser blockiert Mitteilungen für das Cockpit</b> – in den Website-Einstellungen (Schloss links neben der Adresse) „Benachrichtigungen“ erlauben; der Ton funktioniert trotzdem.':'')+'</p>'+
    row("on","Hinweise einschalten")+row("mail","Neue Mail im Posteingang")+row("chat","Neue Nachricht im Website-Chat")+row("sound","Ton abspielen")+
    '<div class="foot"><button type="button" class="btn" data-act="dnottest">Testen</button><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Speichern</button></span></div></form>');
});
F.form("dnotcfg",function(f){
  var c={on:f.on.checked,mail:f.mail.checked,chat:f.chat.checked,sound:f.sound.checked}; save(c); ac();
  var done=function(){ F.closeModal(); F.toast(c.on?"Hinweise am PC eingeschaltet":"Hinweise am PC ausgeschaltet"); };
  if(c.on&&hasN&&Notification.permission==="default"){ try{ var r=Notification.requestPermission(); if(r&&r.then) r.then(done,done); else done(); }catch(e){ done(); } } else done();
});
F.action("dnottest",function(){ var c=cfg(); ac(); beep("chat"); if(hasN&&Notification.permission==="default"){ try{ Notification.requestPermission(); }catch(e){} }
  if(hasN&&Notification.permission==="granted"){ try{ new Notification("FS Cockpit",{body:"So sieht ein Hinweis aus.",tag:"fsc-test",icon:"/logos/cockpit-icon-180.png"}); }catch(e){} } else F.toast("Ton gespielt – Popups bitte im Browser erlauben"); });
})();
