/* Alpenflair auf „Heute“: Bergkulisse (Montafon) neben der Uhr mit dem aktuellen Wetter animiert –
   Sonne, Wolken, Regen, Schnee, Nebel, Gewitter, nachts Mond und Sterne; Schneefallgrenze als Linie am Berg.
   Hängt sich an den Kopfbereich von „Heute“ (.ag-hero), ohne heute.js zu ändern. „Bewegung reduzieren“ → still. */
(function(){
"use strict";
var F=window.FSC;

function rnd(seed){ var s=seed; return function(){ s=(s*9301+49297)%233280; return s/233280; }; }
function isDay(){ var h=new Date().getHours(), m=new Date().getMonth(); var up=[8,7,7,6,6,5,5,6,7,7,7,8][m], down=[16,17,18,19,20,21,21,20,19,18,17,16][m]; return h>=up&&h<down; }
/* Höhe in Metern → y im Bild (Tal Gaschurn ≈ 1000 m unten, Gipfel ≈ 3300 m oben) */
function yOf(m){ return 200-(m-1000)/2300*170; }

function mountains(){
  return '<svg class="alp-mt" viewBox="0 0 600 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">'+
    '<path class="m3" d="M0 150 L60 112 L105 128 L170 70 L215 96 L262 52 L318 104 L372 78 L430 118 L500 86 L560 110 L600 98 L600 200 L0 200Z"/>'+
    '<path class="m2" d="M0 170 L48 140 L96 152 L150 108 L196 132 L246 92 L300 128 L352 100 L410 140 L468 104 L520 130 L600 116 L600 200 L0 200Z"/>'+
    '<path class="snow" d="M246 92 L262 52 L280 74 L270 70 L262 80 L254 72Z M150 108 L170 70 L186 86 L176 84 L168 92 L160 86Z M352 100 L372 78 L388 94 L378 92 L372 98 L364 94Z M468 104 L500 86 L516 98 L504 96 L498 102 L488 98Z"/>'+
    '<path class="m1" d="M0 200 L0 182 L70 158 L130 176 L200 150 L270 174 L340 156 L420 178 L500 160 L600 172 L600 200Z"/>'+
    trees()+'</svg>';
}
function trees(){ var r=rnd(7), out=""; for(var i=0;i<16;i++){ var x=20+i*36+r()*14, b=184+r()*10, hgt=10+r()*9;
  out+='<path class="tree" d="M'+x.toFixed(1)+' '+(b-hgt).toFixed(1)+' L'+(x-hgt*0.36).toFixed(1)+' '+b.toFixed(1)+' L'+(x+hgt*0.36).toFixed(1)+' '+b.toFixed(1)+'Z"/>'; } return out; }

function scene(w){
  var ic=(w&&w.icon)||"cloud", day=isDay(), r=rnd(13), h='', i;
  var clouds=/cloud|rain|snow|storm|fog/.test(ic), sun=day&&/sun|cloudSun/.test(ic);
  if(!day){ h+='<span class="alp-moon"></span>'; if(!/rain|snow|storm|fog/.test(ic)) for(i=0;i<16;i++) h+='<i class="alp-star" style="left:'+(4+r()*92).toFixed(1)+'%;top:'+(4+r()*34).toFixed(1)+'%;animation-delay:'+(r()*4).toFixed(2)+'s"></i>'; }
  if(sun) h+='<span class="alp-sun'+(ic==="cloudSun"?" half":"")+'"><i></i></span>';
  if(clouds||ic==="cloudSun"){ var n=ic==="cloudSun"?2:ic==="cloud"?3:4, dark=/rain|storm/.test(ic);
    for(i=0;i<n;i++) h+='<svg class="alp-cloud'+(dark?" dark":"")+'" viewBox="0 0 120 56" style="top:'+(2+i*12+r()*6).toFixed(1)+'%;--s:'+(0.75+r()*0.55).toFixed(2)+';animation-duration:'+(55+r()*45).toFixed(0)+'s;animation-delay:-'+(r()*70).toFixed(0)+'s"><path d="M24 52h70a22 22 0 0 0 4-43.6A30 30 0 0 0 44.5 14 18 18 0 0 0 24 52z"/></svg>'; }
  if(/rain|storm/.test(ic)) for(i=0;i<42;i++) h+='<i class="alp-rain" style="left:'+(r()*100).toFixed(1)+'%;animation-duration:'+(0.55+r()*0.35).toFixed(2)+'s;animation-delay:-'+(r()*1.2).toFixed(2)+'s"></i>';
  if(ic==="snow") for(i=0;i<40;i++) h+='<i class="alp-snow" style="left:'+(r()*100).toFixed(1)+'%;--d:'+(2+r()*4).toFixed(1)+'px;animation-duration:'+(5+r()*5).toFixed(1)+'s;animation-delay:-'+(r()*9).toFixed(1)+'s"></i>';
  if(ic==="fog") for(i=0;i<3;i++) h+='<span class="alp-fog" style="top:'+(48+i*14)+'%;animation-duration:'+(26+i*9)+'s"></span>';
  if(ic==="storm") h+='<span class="alp-flash"></span>';
  var sl=w&&w.snowLine?'<span class="alp-sl" style="top:'+(26+yOf(w.snowLine)/200*74).toFixed(1)+'%" title="Schneefallgrenze"><b>❄ '+String(w.snowLine).replace(/\B(?=(\d{3})+(?!\d))/g,".")+' m</b></span>':'';
  return '<div class="ag-alp '+(day?"day":"night")+' wx-'+ic+'" aria-hidden="true"><div class="alp-sky">'+h+'</div>'+mountains()+sl+'</div>';
}

var LAST="";
function mount(){
  if(F.current!=="heute") return;
  var hero=document.querySelector("#main .ag-hero"); if(!hero) return;
  var w=F.D&&F.D.weather||null, key=(w?w.icon+"|"+w.snowLine:"none")+"|"+(isDay()?"d":"n");
  var cur=hero.querySelector(".ag-alp");
  if(cur&&cur.getAttribute("data-k")===key) return;
  var tmp=document.createElement("div"); tmp.innerHTML=scene(w); var el=tmp.firstChild; el.setAttribute("data-k",key);
  if(cur) hero.replaceChild(el,cur); else hero.insertBefore(el,hero.firstChild);
  hero.classList.add("has-alp"); LAST=key;
}
var main=document.getElementById("main");
if(main&&window.MutationObserver) new MutationObserver(function(){ mount(); }).observe(main,{childList:true,subtree:false});
if(F.onData) F.onData(function(){ setTimeout(mount,0); });
setInterval(mount,5*60*1000);   // Tag/Nacht-Wechsel
setTimeout(mount,1200);

F.css(
/* Kulisse rechts im Kopfbereich (feste Höhe, weg von Text und Knöpfen), Text bleibt davor */
".ag-hero.has-alp{position:relative;isolation:isolate}.ag-hero.has-alp>*:not(.ag-alp){position:relative;z-index:1}"+
".ag-alp{position:absolute;right:0;top:-6px;height:236px;width:min(620px,52%);z-index:0;pointer-events:none;overflow:hidden;"+
"-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 30%);mask-image:linear-gradient(90deg,transparent 0,#000 30%);color:var(--ink)}"+
".alp-sky{position:absolute;inset:0}"+
".alp-mt{position:absolute;left:0;right:0;bottom:0;width:100%;height:74%}"+
".alp-mt .m3{fill:currentColor;opacity:.13}.alp-mt .m2{fill:currentColor;opacity:.2}.alp-mt .m1{fill:currentColor;opacity:.3}"+
".alp-mt .snow{fill:#fff;opacity:.85}.alp-mt .tree{fill:currentColor;opacity:.42}"+
":root[data-theme='light'] .alp-mt .snow{fill:#fff;stroke:rgba(0,0,0,.12);stroke-width:.6}"+
/* Sonne */
".alp-sun{position:absolute;right:16%;top:6%;width:62px;height:62px;border-radius:50%;background:radial-gradient(circle,#ffe9a8 0 38%,#ffc94d 39% 52%,rgba(255,201,77,0) 70%)}"+
".alp-sun>i{position:absolute;inset:-22px;border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,210,110,.55) 0 4deg,transparent 4deg 30deg);"+
"-webkit-mask:radial-gradient(circle,transparent 0 44%,#000 46% 64%,transparent 70%);mask:radial-gradient(circle,transparent 0 44%,#000 46% 64%,transparent 70%);animation:alpSpin 26s linear infinite}"+
".alp-sun.half{right:22%;top:8%}"+
/* Mond + Sterne */
".alp-moon{position:absolute;right:20%;top:8%;width:42px;height:42px;border-radius:50%;box-shadow:-11px 5px 0 0 #f4f1e2;transform:rotate(-18deg);filter:drop-shadow(0 0 10px rgba(244,241,226,.45))}"+
".alp-star{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;opacity:.2;animation:alpTwinkle 3.6s ease-in-out infinite}"+
":root[data-theme='light'] .alp-star{background:#5a6b8a}"+
/* Wolken: weiche Ballen aus Schatten, ziehen langsam quer */
".alp-cloud{position:absolute;left:0;width:118px;height:56px;overflow:visible;transform:translateX(-140px) scale(var(--s));transform-origin:0 50%;animation:alpDrift 60s linear infinite;filter:drop-shadow(0 6px 10px rgba(0,0,0,.12))}"+
".alp-cloud path{fill:rgba(255,255,255,.78)}.alp-cloud.dark path{fill:rgba(186,198,214,.8)}"+
":root[data-theme='light'] .alp-cloud path{fill:rgba(150,166,190,.5)}:root[data-theme='light'] .alp-cloud.dark path{fill:rgba(110,125,150,.55)}"+
/* Regen, Schnee, Nebel, Blitz */
".alp-rain{position:absolute;top:-10%;width:1.5px;height:16px;border-radius:2px;background:linear-gradient(180deg,rgba(190,225,255,0),rgba(190,225,255,.75));transform:rotate(12deg);animation:alpRain .7s linear infinite}"+
":root[data-theme='light'] .alp-rain{background:linear-gradient(180deg,rgba(60,110,170,0),rgba(60,110,170,.6))}"+
".alp-snow{position:absolute;top:-6%;width:var(--d);height:var(--d);border-radius:50%;background:#fff;opacity:.9;animation:alpSnow 7s linear infinite}"+
":root[data-theme='light'] .alp-snow{background:#c9d6e8}"+
".alp-fog{position:absolute;left:-30%;width:160%;height:22px;border-radius:30px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);filter:blur(6px);animation:alpFog 30s ease-in-out infinite alternate}"+
".alp-flash{position:absolute;inset:0;background:rgba(255,255,255,.0);animation:alpFlash 7s infinite}"+
/* Schneefallgrenze */
".alp-sl{position:absolute;left:18%;right:0;border-top:1px dashed rgba(255,255,255,.55);height:0}.alp-sl b{position:absolute;right:6px;top:-17px;font:600 10.5px/1 var(--f-body);letter-spacing:.02em;color:var(--ink-2);background:color-mix(in srgb,var(--panel-solid,#000) 45%,transparent);padding:2px 6px;border-radius:99px}"+
":root[data-theme='light'] .alp-sl{border-top-color:rgba(40,60,90,.35)}"+
"@keyframes alpSpin{to{transform:rotate(360deg)}}"+
"@keyframes alpTwinkle{0%,100%{opacity:.15}50%{opacity:.95}}"+
"@keyframes alpDrift{to{transform:translateX(660px) scale(var(--s))}}"+
"@keyframes alpRain{to{transform:translate(-18px,220px) rotate(12deg)}}"+
"@keyframes alpSnow{0%{transform:translate(0,0)}25%{transform:translate(8px,55px)}50%{transform:translate(-6px,110px)}75%{transform:translate(7px,165px)}100%{transform:translate(0,230px)}}"+
"@keyframes alpFog{from{transform:translateX(-8%)}to{transform:translateX(8%)}}"+
"@keyframes alpFlash{0%,88%,100%{background:rgba(255,255,255,0)}89%{background:rgba(255,255,255,.55)}90%{background:rgba(255,255,255,0)}91.5%{background:rgba(255,255,255,.35)}93%{background:rgba(255,255,255,0)}}"+
/* Handy: Kulisse hinter der Uhr, etwas zurückhaltender */
"@media (max-width:900px){.ag-alp{width:82%;height:190px;opacity:.9;top:calc(env(safe-area-inset-top,0px) - 4px)}}"+
"@media (prefers-reduced-motion:reduce){.ag-alp *{animation:none!important}.alp-cloud{transform:translateX(40%) scale(var(--s))}.alp-rain,.alp-snow,.alp-flash{display:none}}"
);
})();
