/* Globale Funktionen: Versionsprüfung, ungelesene Mails im Fenstertitel, Schnellzugriffe in der Seitenleiste,
   Aktualisieren beim Zurückkehren ins Fenster. */
(function(){
"use strict";
var F=window.FSC;
F.icons.eye=F.icons.eye||'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>';
F.icons.refresh=F.icons.refresh||'<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>';
F.icons.eyeoff=F.icons.eyeoff||'<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.3 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1"/><path d="M9.9 10a2.8 2.8 0 0 0 4 4"/>';

F.css(
'.rail-foot .rf-ic svg{width:15px;height:15px;flex:none}'+
'.rail-foot .rf-new{background:var(--glow-soft);color:var(--glow-ink);font-weight:600}'+
'.rail-foot .rf-new:hover{background:var(--glow-soft);color:var(--glow-ink)}'
);

/* ---------- Neue Version ---------- */
var me=document.currentScript, BUILD=null, fresh=false, toasted=0;
try{ var m=/[?&]v=([^&]+)/.exec(me&&me.src||""); if(m) BUILD=decodeURIComponent(m[1]); }catch(e){}
function short(b){ return String(b||"").slice(0,12); }
function busyUI(){
  if(F.modalOpen&&F.modalOpen()) return true;
  var d=document.getElementById("drawer"); if(d&&d.classList.contains("on")) return true;
  var c=document.getElementById("cmdk"); if(c&&c.classList.contains("on")) return true;
  var a=document.activeElement; if(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&a.value) return true;
  return false;
}
function reloadNow(){ location.reload(); }
function announce(){
  var rf=document.querySelector(".rail-foot");
  if(rf&&!document.getElementById("rfNew")){
    var b=document.createElement("button"); b.type="button"; b.id="rfNew"; b.className="rf-new rf-ic";
    b.innerHTML=F.svg("refresh")+'<span>Neue Version – neu laden</span>';
    b.addEventListener("click",function(){ if(F.modalOpen()) F.confirm("Neu laden? Offene Eingaben im Dialog gehen verloren.","Neu laden",reloadNow); else reloadNow(); });
    rf.insertBefore(b,rf.firstChild);
  }
  if(Date.now()-toasted>5*60000){ toasted=Date.now(); F.toast("Neue Version verfügbar",false,"Neu laden",function(){ if(F.modalOpen()) F.confirm("Neu laden? Offene Eingaben im Dialog gehen verloren.","Neu laden",reloadNow); else reloadNow(); }); }
}
function vcheck(fromVisible){
  if(document.hidden) return;
  F.api("/admin/api/version").then(function(d){
    if(!d||!d.build) return;
    if(BUILD===null){ BUILD=short(d.build); return; }
    if(short(d.build)===short(BUILD)) return;
    if(!fresh){ fresh=true; toasted=0; }
    /* Beim Zurückkommen ins Fenster still neu laden, wenn gerade nichts offen ist (wie im klassischen Dashboard) */
    if(fromVisible&&!busyUI()){ reloadNow(); return; }
    announce();
  }).catch(function(){});
}
setInterval(function(){ vcheck(false); },60000);
setTimeout(function(){ vcheck(false); },3000);
document.addEventListener("visibilitychange",function(){ if(!document.hidden) vcheck(true); });

/* ---------- Ungelesene Mails im Fenstertitel ---------- */
var BASE_TITLE=document.title||"FS Cockpit";
function title(){
  var n=0; try{ n=F.D&&F.unreadMails?F.unreadMails().length:0; }catch(e){}
  var t=(n?"("+n+") ":"")+BASE_TITLE; if(document.title!==t) document.title=t;
}
var origRender=F.render; F.render=function(){ var r=origRender.apply(this,arguments); title(); return r; };
F.onData(function(){ setTimeout(title,0); });

/* ---------- Seitenleiste: Beträge ausblenden + Einstellungen ---------- */
function privLabel(){
  var b=document.getElementById("rfPriv"); if(!b) return; var on=!!F.ls("fsc_priv");
  b.innerHTML=F.svg(on?"eyeoff":"eye")+'<span>'+(on?"Beträge einblenden":"Beträge ausblenden")+'</span>';
  b.setAttribute("aria-pressed",on?"true":"false");
}
function rail(){
  var rf=document.querySelector(".rail-foot"); if(!rf||document.getElementById("rfPriv")) return;
  var ref=document.getElementById("refresh")||null;
  var p=document.createElement("button"); p.type="button"; p.id="rfPriv"; p.className="rf-ic"; p.setAttribute("data-act","priv"); p.title="Beträge verdecken, z. B. beim Bildschirm teilen";
  var s=document.createElement("button"); s.type="button"; s.id="rfSet"; s.className="rf-ic"; s.setAttribute("data-act","settings"); s.innerHTML=F.svg("gear")+'<span>Einstellungen</span>';
  rf.insertBefore(p,ref); rf.insertBefore(s,ref);
  privLabel();
}
var origPriv=F.priv; F.priv=function(on){ var r=origPriv.apply(this,arguments); privLabel(); return r; };
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",rail); else rail();

/* ---------- Aktualisieren, wenn das Fenster wieder den Fokus bekommt ---------- */
window.addEventListener("focus",function(){
  if(!F.D||F.busy||F.modalOpen()) return;
  if(Date.now()-Date.parse(F.D.fetchedAt)>30000) F.load(false);
});
})();
