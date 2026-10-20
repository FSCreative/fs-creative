/* Mitteilungen per Web Push (Handy und installierte App am PC): Service Worker registrieren, Abo anlegen, Themen wählen, Test senden.
   iPhone: nur in der „Zum Home-Bildschirm“-App (ab iOS 16.4) und nach Antippen erlaubt. Öffnen: data-act="pushcfg".
   Für andere Module: F.swReg() (aktiver Service Worker, z. B. für Hinweise am PC), F.pushEnable(themen); Antippen einer Mitteilung → Ansicht wechseln ohne Neuladen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
if(F.icons&&!F.icons.bell) F.icons.bell='<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>';
var ok=("serviceWorker" in navigator)&&("PushManager" in window)&&("Notification" in window);
var standalone=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true;
var TOP=[["mail","Neue Mails im Posteingang"],["lead","Neue Anfragen (Website)"],["fin","Finanzen (Mahnungen, Zahllast, Belege)"],["mkt","Marketing (gepostet oder Fehler beim Posten)"]];
function b64u(s){ var p="=".repeat((4-s.length%4)%4), b=atob((s+p).replace(/-/g,"+").replace(/_/g,"/")), a=new Uint8Array(b.length); for(var i=0;i<b.length;i++) a[i]=b.charCodeAt(i); return a; }
var REG=null;
function reg(){ if(!REG) REG=navigator.serviceWorker.register("/admin/sw.js",{scope:"/admin/"}).catch(function(e){ REG=null; throw e; }); return REG; }
/* showNotification braucht einen aktiven Worker – nach der ersten Registrierung kurz warten (navigator.serviceWorker.ready greift hier nicht: /admin liegt außerhalb von /admin/) */
function activeReg(r){ if(r.active) return r; var w=r.installing||r.waiting; if(!w) return r;
  return new Promise(function(res){ var t=setTimeout(function(){ res(r); },5000); w.addEventListener("statechange",function(){ if(w.state==="activated"){ clearTimeout(t); res(r); } }); }); }
F.swReg=function(){ return "serviceWorker" in navigator?reg().then(activeReg):Promise.reject(new Error("Kein Service Worker")); };
var mobile=/iPhone|iPad|Android/.test(navigator.userAgent);
function device(){ var u=navigator.userAgent; return (/iPhone/.test(u)?"iPhone":/iPad/.test(u)?"iPad":/Android/.test(u)?"Android":/Mac/.test(u)?"Mac":"Browser")+(standalone?" (App)":""); }
function current(){ return ok?reg().then(function(r){ return r.pushManager.getSubscription(); }):Promise.resolve(null); }
function ask(){ try{ var r=Notification.requestPermission(); return r&&r.then?r:new Promise(function(res){ Notification.requestPermission(res); }); }catch(e){ return Promise.reject(e); } }
function enable(topics,perm){
  return (perm||ask()).then(function(p){
    if(p!=="granted") throw new Error(p==="denied"?"Das iPhone hat Mitteilungen für das Cockpit abgelehnt. Falls „Cockpit“ unter Einstellungen → Mitteilungen fehlt: Symbol vom Home-Bildschirm löschen, in Safari neu „Zum Home-Bildschirm“ hinzufügen, von dort öffnen und hier erneut einschalten.":"Nicht erlaubt");
    return Promise.all([reg(),F.api("/admin/api/push")]); })
  .then(function(x){ var r=x[0], j=x[1]; if(!j||!j.ok) throw new Error((j&&j.error)||"Server nicht bereit");
    return r.pushManager.getSubscription().then(function(s){ return s||r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(j.publicKey)}); }); })
  .then(function(sub){ return F.api("/admin/api/push",{body:{op:"subscribe",subscription:sub.toJSON(),device:device(),topics:topics}}); });
}
function sheet(){
  if(!ok){ F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:19px">Mitteilungen</h2>'+F.btnClose()+'</div><p class="muted">Dieser Browser kann keine Mitteilungen empfangen.'+(/iPhone|iPad/.test(navigator.userAgent)?' Am iPhone: in Safari auf <b>Teilen → Zum Home-Bildschirm</b> tippen und das Cockpit von dort öffnen (ab iOS 16.4).':'')+'</p></div>',"narrow"); return; }
  current().then(function(sub){ return F.api("/admin/api/push"+(sub?"?endpoint="+encodeURIComponent(sub.endpoint):"")).then(function(j){ return {sub:sub,j:j||{}}; }); }).then(function(o){
    var mine=o.sub&&o.j.mine, tp=mine?mine.topics:["mail","lead","fin"], on=!!mine&&Notification.permission==="granted";
    F.modal('<form data-form="pushcfg" class="stackf"><div class="row-between"><h2 style="font-size:19px">Mitteilungen (Push)</h2>'+F.btnClose()+'</div>'+
      '<p class="muted" style="margin:0">'+(on?'Auf diesem Gerät aktiv.':'Auf diesem Gerät noch aus.')+(!mobile?' Push meldet sich auch, wenn das Cockpit geschlossen ist'+(standalone?' (App und Browser zählen als eigene Geräte).':' – in der installierten App bitte dort extra einschalten.'):'')+(/iPhone|iPad/.test(navigator.userAgent)&&!standalone?' Am iPhone gehen Mitteilungen nur, wenn das Cockpit vom Home-Bildschirm geöffnet ist.':'')+'</p>'+
      TOP.map(function(t){ return '<label class="row small" style="gap:10px;min-height:40px"><input type="checkbox" name="t_'+t[0]+'"'+(tp.indexOf(t[0])>-1?" checked":"")+' style="width:20px;height:20px"> '+esc(t[1])+'</label>'; }).join("")+
      ((o.j.devices||[]).length?'<p class="muted small" style="margin:0">Aktive Geräte: '+o.j.devices.map(function(d){ return esc(d.device); }).join(", ")+'</p>':'')+
      '<div class="fsd-btns" style="justify-content:flex-end;flex-wrap:wrap">'+(on?'<button type="button" class="btn" data-act="pushtest">Test senden</button><button type="button" class="btn" data-act="pushoff">Ausschalten</button>':'')+'<button type="submit" class="btn primary">'+(on?"Speichern":"Mitteilungen einschalten")+'</button></div><div class="err" id="pushErr"></div></form>',"narrow");
  });
}
F.action("pushcfg",sheet);
F.pushEnable=function(topics){ return ok?enable(topics,Promise.resolve(Notification.permission)):Promise.reject(new Error("Push nicht verfügbar")); };
/* Mitteilung angetippt → der Service Worker holt dieses Fenster nach vorne und sagt, welche Ansicht */
if("serviceWorker" in navigator){ navigator.serviceWorker.addEventListener("message",function(e){ var d=e.data||{}; if(d.type!=="fsc-go") return;
  var h=String(d.url||"").split("#")[1]||""; if(h&&F.views&&F.views.some(function(v){ return v.id===h; })&&F.current!==h) F.go(h); });
  try{ navigator.serviceWorker.startMessages(); }catch(e){} }
F.form("pushcfg",function(f){ var tp=TOP.map(function(t){ return t[0]; }).filter(function(k){ return f["t_"+k].checked; }), err=document.getElementById("pushErr");
  var perm=Notification.permission==="granted"?null:ask();   // sofort im Antippen fragen – sonst lehnt das iPhone ohne Nachfrage ab
  current().then(function(sub){ if(sub&&!perm) return F.api("/admin/api/push",{body:{op:"topics",endpoint:sub.endpoint,topics:tp}}); return enable(tp,perm); })
  .then(function(j){ if(!j||j.ok===false) throw new Error((j&&j.error)||"Fehler"); F.closeModal(); F.toast("Mitteilungen gespeichert"); try{ localStorage.setItem("fsc_push_ask","done"); }catch(e){} })
  .catch(function(e){ if(err) err.textContent=e.message||String(e); }); });
F.action("pushtest",function(){ F.api("/admin/api/push",{body:{op:"test"}}).then(function(j){ F.toast(j&&j.sent?"Test gesendet":"Kein Gerät erreicht",!(j&&j.sent)); }); });
F.action("pushoff",function(){ current().then(function(sub){ if(!sub) return; return F.api("/admin/api/push",{body:{op:"unsubscribe",endpoint:sub.endpoint}}).then(function(){ return sub.unsubscribe(); }); }).then(function(){ F.closeModal(); F.toast("Mitteilungen aus"); }); });
/* Einmal nachfragen: in der Home-Bildschirm-App am Handy, wenn noch nicht entschieden (App am PC: fragt znotify.js) */
if(ok&&standalone&&mobile&&Notification.permission==="default"){ var asked=null; try{ asked=localStorage.getItem("fsc_push_ask"); }catch(e){}
  if(!asked) setTimeout(function(){ try{ localStorage.setItem("fsc_push_ask","1"); }catch(e){} F.toast&&F.confirm&&F.confirm("Mitteilungen aufs Handy einschalten? Du bekommst eine Meldung bei neuen Mails, Anfragen und Chats.","Einschalten",function(){ enable(["mail","lead","fin"],ask()).then(function(){ F.toast("Mitteilungen aktiv"); }).catch(function(e){ F.toast(e.message||String(e),true); }); }); },4000); }
if(ok&&Notification.permission==="granted") reg().catch(function(){});
})();
