/* Wetter auf „Heute“: realistische Wetter-Ebene über dem echten Bergfoto im Kopfbereich (Uhr/Wetterzeile).
   Canvas statt Zeichnungen: Schnee in drei Tiefenebenen (vorne groß und unscharf), Regen als feine Schlieren mit Wind,
   Nebel/Wolken als weiche, langsam ziehende Schleier, Sonne als warmes Gegenlicht, Gewitter als Aufhellen des Himmels,
   nachts kühleres, dunkleres Licht. Nur im Kopfbereich (keine Glasflächen darunter), pausiert im Hintergrund,
   „Bewegung reduzieren“ → ein ruhiges Standbild. Hängt sich an .ag-hero, ohne heute.js zu ändern. */
(function(){
"use strict";
var F=window.FSC;
var still=function(){ return window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches; };
function isDay(){ var d=new Date(), h=d.getHours()+d.getMinutes()/60, m=d.getMonth(); var up=[7.9,7.4,6.6,6.6,5.9,5.5,5.7,6.2,6.9,7.5,7.3,7.9][m], down=[16.9,17.6,18.3,20.1,20.7,21.1,21.0,20.4,19.4,18.3,16.8,16.5][m]; return h>=up&&h<down; }

/* Weiche, kachelbare Nebeltextur (einmal berechnet): Summe aus verschobenen, unscharfen Kreisen */
var FOG=null;
function fogTex(){
  if(FOG) return FOG; var c=document.createElement("canvas"), W=512, H=256; c.width=W; c.height=H; var g=c.getContext("2d"), s=1234567;
  var r=function(){ s=(s*16807)%2147483647; return s/2147483647; };
  for(var i=0;i<90;i++){ var x=r()*W, y=H*0.25+r()*H*0.6, rad=30+r()*90, a=0.05+r()*0.08;
    for(var k=-1;k<=1;k++){ var gr=g.createRadialGradient(x+k*W,y,0,x+k*W,y,rad); gr.addColorStop(0,"rgba(255,255,255,"+a+")"); gr.addColorStop(1,"rgba(255,255,255,0)"); g.fillStyle=gr; g.fillRect(x+k*W-rad,y-rad,rad*2,rad*2); } }
  FOG=c; return c;
}

function Scene(host,w){
  this.host=host; this.w=w||{}; this.ic=this.w.icon||"cloud"; this.day=isDay();
  var c=this.c=document.createElement("canvas"); c.className="ag-wx"; c.setAttribute("aria-hidden","true"); host.insertBefore(c,host.firstChild);
  this.g=c.getContext("2d"); this.parts=[]; this.t0=performance.now(); this.flash=0; this.nextFlash=this.t0+4000+Math.random()*6000;
  this.size(); this.seed(); var self=this;
  this.onR=function(){ self.size(); self.seed(); if(still()) self.frame(self.t0+16); }; window.addEventListener("resize",this.onR);
  if(still()) this.frame(this.t0+16); else this.loop();
}
Scene.prototype.size=function(){ var r=this.host.getBoundingClientRect(), d=Math.min(2,window.devicePixelRatio||1); this.W=Math.max(1,r.width+24); this.H=Math.max(1,r.height+26);
  this.c.width=Math.round(this.W*d); this.c.height=Math.round(this.H*d); this.c.style.width=this.W+"px"; this.c.style.height=this.H+"px"; this.g.setTransform(d,0,0,d,0,0); };
Scene.prototype.seed=function(){
  var ic=this.ic, W=this.W, H=this.H, P=this.parts=[], i, n;
  if(ic==="snow"){ n=Math.round(W*H/5200);
    for(i=0;i<n;i++){ var z=Math.random(); P.push({x:Math.random()*W,y:Math.random()*H,z:z,r:z<0.6?0.8+z*1.6:2.2+z*3.4,v:12+z*38,ph:Math.random()*6.28,sw:0.4+Math.random()*1.2}); } }
  if(ic==="rain"||ic==="storm"){ n=Math.round(W*H/(ic==="storm"?1500:2300));
    for(i=0;i<n;i++){ var zz=Math.random(); P.push({x:Math.random()*W,y:Math.random()*H,z:zz,l:9+zz*18,v:520+zz*480,a:0.08+zz*0.22}); } }
};
Scene.prototype.loop=function(){ var self=this; this.raf=requestAnimationFrame(function(t){ if(!self.c.isConnected){ self.stop(); return; } if(!document.hidden) self.frame(t); self.loop(); }); };
Scene.prototype.stop=function(){ cancelAnimationFrame(this.raf); window.removeEventListener("resize",this.onR); };
Scene.prototype.frame=function(t){
  var g=this.g, W=this.W, H=this.H, ic=this.ic, dt=Math.min(0.05,((t-(this.last||t))/1000)||0.016); this.last=t;
  var sec=(t-this.t0)/1000, wind=Math.sin(sec*0.13)*0.6+0.4;
  g.clearRect(0,0,W,H);
  /* Licht: Sonne (warmes Gegenlicht), bewölkt (kühler Schleier), Nacht (dunkler, kühl) */
  if(this.day&&(ic==="sun"||ic==="cloudSun")){
    var gx=W*0.82, gy=-H*0.15, sg=g.createRadialGradient(gx,gy,0,gx,gy,Math.max(W,H)*0.75);
    sg.addColorStop(0,"rgba(255,226,170,"+(ic==="sun"?0.34:0.2)+")"); sg.addColorStop(0.35,"rgba(255,206,140,0.10)"); sg.addColorStop(1,"rgba(255,200,130,0)");
    g.fillStyle=sg; g.fillRect(0,0,W,H);
    var pulse=0.5+0.5*Math.sin(sec*0.4); g.fillStyle="rgba(255,240,210,"+(0.05+pulse*0.03)+")"; g.beginPath(); g.arc(gx,gy+H*0.12,H*0.32,0,6.283); g.fill();
  }
  if(/cloud|rain|storm|snow|fog/.test(ic)&&ic!=="cloudSun"){ var cg=g.createLinearGradient(0,0,0,H); cg.addColorStop(0,"rgba(150,165,185,"+(ic==="cloud"?0.16:0.22)+")"); cg.addColorStop(1,"rgba(150,165,185,0)"); g.fillStyle=cg; g.fillRect(0,0,W,H); }
  if(!this.day){ var ng=g.createLinearGradient(0,0,0,H); ng.addColorStop(0,"rgba(10,20,45,0.28)"); ng.addColorStop(1,"rgba(10,20,45,0)"); g.fillStyle=ng; g.fillRect(0,0,W,H); }
  /* Nebel / Wolkenschleier: weiche Textur, langsam ziehend (zwei Lagen gegeneinander) */
  if(/fog|cloud|rain|snow|storm/.test(ic)){
    var tx=fogTex(), k=ic==="fog"?1:ic==="cloudSun"?0.35:0.6;
    for(var L=0;L<2;L++){ var sp=(L?9:5)*(1+wind*0.6), off=(sec*sp)%tx.width, yy=(L?H*0.35:-H*0.05), hh=H*(L?0.8:0.7);
      g.globalAlpha=k*(L?0.55:0.8); for(var xx=-off;xx<W;xx+=tx.width) g.drawImage(tx,xx,yy,tx.width,hh); }
    g.globalAlpha=1;
  }
  /* Schnee: drei Tiefen, vorne groß und unscharf */
  if(ic==="snow"){ for(var i=0;i<this.parts.length;i++){ var p=this.parts[i];
      p.y+=p.v*dt; p.x+=(Math.sin(sec*p.sw+p.ph)*10+wind*18*p.z)*dt; if(p.y>H+6){ p.y=-6; p.x=Math.random()*W; } if(p.x>W+6) p.x=-6; else if(p.x<-6) p.x=W+6;
      var rr=p.r, gr=g.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*(p.z>0.75?2.4:1.6)); gr.addColorStop(0,"rgba(255,255,255,"+(0.55+p.z*0.35)+")"); gr.addColorStop(1,"rgba(255,255,255,0)");
      g.fillStyle=gr; g.beginPath(); g.arc(p.x,p.y,rr*(p.z>0.75?2.4:1.6),0,6.283); g.fill(); } }
  /* Regen: feine, schräge Schlieren mit Bewegungsunschärfe */
  if(ic==="rain"||ic==="storm"){ g.lineCap="round"; var ang=0.18+wind*0.12;
    for(var j=0;j<this.parts.length;j++){ var q=this.parts[j]; q.y+=q.v*dt; q.x+=q.v*ang*dt; if(q.y>H+20){ q.y=-20; q.x=Math.random()*(W+60)-60; } if(q.x>W+20) q.x=-20;
      var lg=g.createLinearGradient(q.x,q.y,q.x-q.l*ang,q.y-q.l); lg.addColorStop(0,"rgba(215,230,245,"+q.a+")"); lg.addColorStop(1,"rgba(215,230,245,0)");
      g.strokeStyle=lg; g.lineWidth=q.z>0.7?1.4:0.8; g.beginPath(); g.moveTo(q.x,q.y); g.lineTo(q.x-q.l*ang,q.y-q.l); g.stroke(); } }
  /* Gewitter: kurzes, doppeltes Aufhellen des Himmels */
  if(ic==="storm"){ if(t>this.nextFlash){ this.flash=1; this.nextFlash=t+5000+Math.random()*9000; this.f2=t+160; }
    if(this.f2&&t>this.f2){ this.flash=Math.max(this.flash,0.7); this.f2=0; }
    if(this.flash>0.01){ g.fillStyle="rgba(225,232,255,"+(this.flash*0.35)+")"; g.fillRect(0,0,W,H); this.flash*=0.82; } }
};

var CUR=null;
function mount(){
  var hero=F.current==="heute"&&document.querySelector("#main .ag-hero");
  if(!hero){ if(CUR&&!CUR.c.isConnected){ CUR.stop(); CUR=null; } return; }
  var w=F.D&&F.D.weather||null, key=(w?w.icon:"none")+"|"+(isDay()?"d":"n");
  if(CUR&&CUR.c.isConnected&&CUR.host===hero&&CUR.key===key) return;
  if(CUR){ CUR.stop(); if(CUR.c.parentNode) CUR.c.parentNode.removeChild(CUR.c); CUR=null; }
  if(!w) return;
  hero.classList.add("has-wx"); CUR=new Scene(hero,w); CUR.key=key;
}
var main=document.getElementById("main");
if(main&&window.MutationObserver) new MutationObserver(function(){ mount(); }).observe(main,{childList:true});
if(F.onData) F.onData(function(){ setTimeout(mount,0); });
setInterval(mount,5*60*1000);   // Tag/Nacht-Wechsel, neues Wetter
setTimeout(mount,1200);

F.css(
".ag-hero.has-wx{position:relative;isolation:isolate}.ag-hero.has-wx>*:not(.ag-wx){position:relative;z-index:1}"+
/* Canvas deckt den Kopfbereich ab, Ränder weich auslaufen lassen */
".ag-wx{position:absolute;left:-12px;top:-14px;z-index:0;pointer-events:none;"+
"-webkit-mask-image:linear-gradient(180deg,#000 0,#000 72%,transparent 100%);mask-image:linear-gradient(180deg,#000 0,#000 72%,transparent 100%)}"
);
})();
