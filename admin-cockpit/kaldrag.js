/* Kalender am PC: Termine mit der Maus ziehen (kald.js Tag/Woche, Monatsraster aus kal.js).
   Tag/Woche: Termin verschieben (anderer Tag, andere Uhrzeit, Dauer bleibt), oben oder unten am Rand ziehen = früher/später beginnen bzw. enden
   (15-Minuten-Raster), in „ganztägig“ ziehen = ohne Uhrzeit, ganztägigen Termin ins Raster ziehen = mit Uhrzeit (1 Stunde).
   Monat: auf einen anderen Tag ziehen (Uhrzeit bleibt). Esc bricht ab, danach „Rückgängig“ in der Meldung.
   Nur eigene Termine und private iCloud-Termine – Mail-Kalender und Serientermine bleiben fest (kal.js moveEvent). */
(function(){
"use strict";
var F=window.FSC, UI=F.UI;
function A(){ return F.kalApi; }
var HR=48, SNAP=15, D=null, BLOCK=0;
function pad(n){ return String(n).padStart(2,"0"); }
function hhmm(m){ m=Math.max(0,Math.min(1440,Math.round(m))); if(m===1440) return "23:59"; return pad(Math.floor(m/60))+":"+pad(m%60); }
function mins(t){ var m=String(t||"").match(/^(\d{1,2}):(\d{2})/); return m?(+m[1])*60+(+m[2]):null; }
function snap(m){ return Math.round(m/SNAP)*SNAP; }
function under(x,y,sel){ var els=document.elementsFromPoint(x,y)||[]; for(var i=0;i<els.length;i++){ if(D&&(els[i]===D.el||D.el.contains(els[i])||(D.ghost&&els[i]===D.ghost))) continue; var c=els[i].closest&&els[i].closest(sel); if(c) return c; } return null; }
function dayTxt(iso){ return new Date(iso+"T12:00:00").toLocaleDateString("de-AT",{weekday:"short",day:"numeric",month:"numeric"}); }

F.css(
'.kwe.kedit{touch-action:none}.kwe .kwe-rs{position:absolute;left:0;right:0;height:7px;cursor:ns-resize;z-index:2}.kwe .kwe-rs.t{top:-1px}.kwe .kwe-rs.b{bottom:-1px}'+
'.kwe.kedit:hover .kwe-rs.b:after{content:"";position:absolute;left:50%;bottom:2px;width:18px;margin-left:-9px;height:2px;border-radius:2px;background:color-mix(in srgb,var(--c) 70%,var(--ink))}'+
'.kwe.kdragging{z-index:5!important;box-shadow:var(--shadow-pop);opacity:.92;cursor:grabbing;transition:none}'+
'html.kdrag-on,html.kdrag-on *{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}html.kdrag-rs,html.kdrag-rs *{cursor:ns-resize!important}'+
'.kdrop{outline:2px dashed var(--glow);outline-offset:-2px;background:color-mix(in srgb,var(--glow) 10%,transparent)!important}'+
'.kghost{position:fixed;z-index:200;pointer-events:none;border-radius:4px;box-shadow:var(--shadow-pop);opacity:.95;max-width:240px;transform:translate(-50%,-50%)}'+
'.kdtip{position:fixed;z-index:201;pointer-events:none;background:var(--ink);color:var(--ground);font:600 12px/1 var(--f-mono);padding:5px 8px;border-radius:6px;white-space:nowrap;transform:translate(12px,12px)}'+
'[data-kev]{cursor:grab}'
);

/* ---------- Start: Maus gedrückt auf einem verschiebbaren Termin (erst nach 5 px Bewegung wird gezogen, sonst normaler Klick) ---------- */
document.addEventListener("pointerdown",function(e){
  if(e.button!==0||e.pointerType==="touch"||F.current!=="kal"||(A()&&A().isMobile&&A().isMobile())) return;
  var el=e.target.closest&&e.target.closest("[data-kev]"); if(!el) return;
  if(D) finish(true);   /* altes Ziehen nie offen lassen (sonst bleiben Zeit-Anzeige/Geist am Bildschirm) */
  var rs=e.target.closest(".kwe-rs"), grid=el.classList.contains("kwe");
  D={el:el,id:el.getAttribute("data-kev"),pid:e.pointerId,x0:e.clientX,y0:e.clientY,started:false,
    kind:grid?"grid":(el.closest(".kw-all")?"allday":"month"),mode:rs?(rs.classList.contains("t")?"top":"bottom"):"move"};
  var ev=A().findEvent(D.id); if(!ev){ D=null; return; }
  D.ev={date:ev.date,time:ev.time||"",endTime:ev.endTime||""};
  if(grid){ D.st=+el.getAttribute("data-kst"); D.en=+el.getAttribute("data-ken"); D.day=el.getAttribute("data-kday"); D.off=(e.clientY-el.getBoundingClientRect().top)/HR*60; D.css={top:el.style.top,height:el.style.height,left:el.style.left,width:el.style.width}; D.home=el.parentNode; }
  else D.day=el.getAttribute("data-kday")||((el.closest("[data-calday]")||{}).getAttribute?el.closest("[data-calday]").getAttribute("data-calday"):ev.date);
  if(rs) e.preventDefault();
},true);

document.addEventListener("pointermove",function(e){
  if(!D||e.pointerId!==D.pid) return;
  if(!D.started){ if(Math.abs(e.clientX-D.x0)+Math.abs(e.clientY-D.y0)<5) return; begin(); }
  e.preventDefault();
  if(D.kind==="grid") moveGrid(e); else moveChip(e);
  autoScroll(e);
},{passive:false});

function begin(){
  D.started=true; document.documentElement.classList.add(D.mode==="move"?"kdrag-on":"kdrag-rs");
  try{ D.el.setPointerCapture(D.pid); }catch(x){}
  if(D.kind==="grid"){ D.el.classList.add("kdragging"); D.el.style.left="2px"; D.el.style.width="calc(100% - 5px)"; }
  else { var g=D.el.cloneNode(true); g.classList.add("kghost"); g.removeAttribute("data-act"); g.removeAttribute("data-kev"); g.style.width=D.el.offsetWidth+"px"; document.body.appendChild(g); D.ghost=g; D.el.style.opacity=".35"; }
  D.tip=document.createElement("div"); D.tip.className="kdtip"; document.body.appendChild(D.tip);
}
function tip(e,txt){ if(!D.tip) return; D.tip.textContent=txt; D.tip.style.left=e.clientX+"px"; D.tip.style.top=e.clientY+"px"; }
function hilite(el){ if(D.hi&&D.hi!==el) D.hi.classList.remove("kdrop"); D.hi=el; if(el) el.classList.add("kdrop"); }

/* Tag/Woche: im Stundenraster verschieben oder Anfang/Ende ziehen; über „ganztägig“ = ohne Uhrzeit */
function moveGrid(e){
  var all=D.mode==="move"&&under(e.clientX,e.clientY,".kw-all [data-kdcol]");
  if(all){ hilite(all); D.res={date:all.getAttribute("data-kdcol"),time:"",endTime:""}; D.el.style.visibility="hidden"; tip(e,dayTxt(D.res.date)+" · ganztägig"); return; }
  hilite(null); D.el.style.visibility="";
  var col=(D.mode==="move"?under(e.clientX,e.clientY,".kw-col[data-kdcol]"):null)||D.el.parentNode, r=col.getBoundingClientRect(), at=(e.clientY-r.top)/HR*60, st=D.st, en=D.en;
  if(D.mode==="move"){ var dur=D.en-D.st; st=Math.max(0,Math.min(1440-dur,snap(at-D.off))); en=st+dur; if(col!==D.el.parentNode) col.appendChild(D.el); }
  else if(D.mode==="top") st=Math.max(0,Math.min(D.en-SNAP,snap(at)));
  else en=Math.min(1440,Math.max(D.st+SNAP,snap(at)));
  D.el.style.top=(st/60*HR)+"px"; D.el.style.height=Math.max(20,(en-st)/60*HR-2)+"px";
  var day=col.getAttribute("data-kdcol"); D.res={date:day,time:hhmm(st),endTime:hhmm(en)};
  var sm=D.el.querySelector("small"); if(sm) sm.textContent=D.res.time+"–"+D.res.endTime;
  tip(e,(day!==D.day?dayTxt(day)+" · ":"")+D.res.time+"–"+D.res.endTime);
}
/* Monat und „ganztägig“: auf einen Tag ziehen (Uhrzeit bleibt); ganztägig ins Stundenraster = mit Uhrzeit */
function moveChip(e){
  if(D.ghost){ D.ghost.style.left=e.clientX+"px"; D.ghost.style.top=e.clientY+"px"; }
  var cell=under(e.clientX,e.clientY,"[data-calday],.kw-all [data-kdcol]");
  if(cell){ hilite(cell); var k=cell.getAttribute("data-calday")||cell.getAttribute("data-kdcol"); D.res={date:k}; if(D.kind==="allday") D.res.time=""; tip(e,dayTxt(k)+(D.ev.time&&D.kind==="month"?" · "+D.ev.time:"")); return; }
  var col=D.kind==="allday"&&under(e.clientX,e.clientY,".kw-col[data-kdcol]");
  if(col){ hilite(col); var r=col.getBoundingClientRect(), st=Math.max(0,Math.min(1380,snap((e.clientY-r.top)/HR*60-15))); D.res={date:col.getAttribute("data-kdcol"),time:hhmm(st),endTime:hhmm(st+60)}; tip(e,dayTxt(D.res.date)+" · "+D.res.time+"–"+D.res.endTime); return; }
  hilite(null); D.res=null; tip(e,"");
}
var asT=null;
/* Am oberen/unteren Rand des Stundenrasters weiterscrollen – nur wenn wirklich in diese Richtung gezogen wird; der Termin wandert mit */
function autoScroll(e){
  var sc=document.getElementById("kwScroll"); clearInterval(asT); if(!sc||D.kind==="month") return; var r=sc.getBoundingClientRect(), v=0;
  if(e.clientY<r.top+32&&e.clientY>r.top-60&&e.clientY<D.y0-8) v=-12; else if(e.clientY>r.bottom-32&&e.clientY<r.bottom+60&&e.clientY>D.y0+8) v=12;
  var last={clientX:e.clientX,clientY:e.clientY};
  if(v) asT=setInterval(function(){ if(!D){ clearInterval(asT); return; } var b=sc.scrollTop; sc.scrollTop+=v; if(sc.scrollTop===b) return; if(D.kind==="grid") moveGrid(last); else moveChip(last); },30);
}

/* ---------- Ende: speichern (oder abbrechen) ---------- */
function sweep(){ Array.prototype.forEach.call(document.querySelectorAll("body > .kdtip, body > .kghost"),function(x){ x.remove(); }); }
function cleanup(d){ clearInterval(asT); document.documentElement.classList.remove("kdrag-on","kdrag-rs"); d=d||D; if(d){ if(d.hi) d.hi.classList.remove("kdrop"); d.hi=null; } sweep(); }
function finish(cancel){
  var d=D; D=null; if(!d) return; cleanup(d); if(!d.started) return;
  BLOCK=Date.now();   /* der Klick nach dem Ziehen öffnet den Termin nicht */
  var r=d.res, o=d.ev;
  var same=!r||(r.date===o.date&&(r.time==null||r.time===o.time)&&(r.endTime==null||r.endTime===o.endTime||(!r.time&&!o.time)));
  if(cancel||same){ F._forceRender=true; F.render(); return; }
  var patch={date:r.date}; if(r.time!=null){ patch.time=r.time; patch.endTime=r.endTime!=null?r.endTime:""; }
  A().moveEvent(d.id,patch).then(function(ok){ if(!ok) return;
    var what=d.mode==="move"?(r.date!==o.date?"verschoben auf "+dayTxt(r.date)+(patch.time?" "+patch.time:""):(patch.time?"verschoben auf "+patch.time+"–"+patch.endTime:"ganztägig")):"jetzt "+patch.time+"–"+patch.endTime;
    F.toast("Termin "+what,false,"Rückgängig",function(){ A().moveEvent(d.id,{date:o.date,time:o.time,endTime:o.endTime}).then(function(k){ if(k) F.toast("Rückgängig gemacht"); }); });
  });
}
document.addEventListener("pointerup",function(e){ if(D&&e.pointerId===D.pid) finish(false); },true);
document.addEventListener("pointercancel",function(e){ if(D&&e.pointerId===D.pid) finish(true); },true);
/* Fenster verliert den Fokus, Tab wird gewechselt oder das Element verschwindet (Neuaufbau): Ziehen abbrechen statt hängen lassen */
window.addEventListener("blur",function(){ if(D) finish(true); });
document.addEventListener("visibilitychange",function(){ if(document.hidden&&D) finish(true); });
document.addEventListener("lostpointercapture",function(e){ if(D&&D.started&&e.pointerId===D.pid&&!document.contains(D.el)) finish(true); },true);
/* Sicherheitsnetz: bleibt trotzdem etwas stehen, verschwindet es beim nächsten Klick/Ansichtswechsel */
document.addEventListener("pointerdown",function(){ if(!D) sweep(); },true);
window.addEventListener("hashchange",function(){ if(D) finish(true); else sweep(); });
document.addEventListener("keydown",function(e){ if(D&&D.started&&e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); finish(true); } },true);
window.addEventListener("click",function(e){ if(Date.now()-BLOCK<350&&e.target.closest&&e.target.closest("[data-kev],[data-kdslot],[data-calday],.kw-col")){ e.preventDefault(); e.stopPropagation(); } },true);
})();
