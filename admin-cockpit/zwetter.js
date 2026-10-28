/* Alpenkulisse auf „Heute“: gezeichnete Montafon-Landschaft (Bergketten mit Dunst, Schneefelder, Wald, Talwiese,
   kleines Dorf mit Kirche wie in Gaschurn) im ganzen Kopfbereich – oben links bis bündig an „Für dich, jetzt“ (unten)
   und an die rechte Spalte „Heute“ (rechts). Hinter Uhr, Datum und Text blendet sie weich aus.
   Wetter aus F.D.weather (Sonne, Wolken, Regen, Schnee, Nebel, Gewitter, Schneefallgrenze) und Tag/Dämmerung/Nacht
   nach Wiener Zeit. Alle Farben als CSS-Variablen je Darstellung (Hell/Alpenglas/Dunkel).
   Hängt sich an .ag-hero, ohne heute.js zu ändern. „Bewegung reduzieren“ → Standbild. */
(function(){
"use strict";
var F=window.FSC;
var VW=1600, VH=320;

/* ---------- kleine Helfer ---------- */
function rng(seed){ var s=seed>>>0||1; return function(){ s=(Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
function n1(v){ return Math.round(v*10)/10; }
function poly(pts,r0){ var d="", f=r0?Math.round:n1; for(var i=0;i<pts.length;i++) d+=(i?"L":"M")+f(pts[i][0])+" "+f(pts[i][1]); return d+"Z"; }
function yAt(pts,x){ if(x<=pts[0][0]) return pts[0][1]; for(var i=1;i<pts.length;i++){ if(pts[i][0]>=x){ var a=pts[i-1], b=pts[i], t=(x-a[0])/((b[0]-a[0])||1); return a[1]+(b[1]-a[1])*t; } } return pts[pts.length-1][1]; }
/* Grat mit Feinstruktur (Mittelpunktverschiebung) zwischen gesetzten Ankerpunkten */
function ridge(anc,rough,seed,minSeg){ var r=rng(seed), out=[anc[0]];
  function md(a,b,amp){ if(b[0]-a[0]<=minSeg){ out.push(b); return; } var t=.5+(r()-.5)*.24, m=[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t+(r()-.5)*amp]; md(a,m,amp*.56); md(m,b,amp*.56); }
  for(var i=0;i<anc.length-1;i++) md(anc[i],anc[i+1],rough*(anc[i+1][0]-anc[i][0])); return out; }
/* weiche Hügel (Kosinus-Interpolation) */
function smooth(anc,step){ var p=[]; for(var i=0;i<anc.length-1;i++){ var a=anc[i], b=anc[i+1], n=Math.max(1,Math.round((b[0]-a[0])/step)); for(var j=0;j<n;j++){ var t=j/n, u=(1-Math.cos(Math.PI*t))/2; p.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*u]); } } p.push(anc[anc.length-1]); return p; }
function shape(pts){ return poly(pts.concat([[VW+20,VH+20],[-20,VH+20]])); }

/* ---------- Farben ---------- */
function rgba(c){ var m; if(c.charAt(0)==="#") return [parseInt(c.substr(1,2),16),parseInt(c.substr(3,2),16),parseInt(c.substr(5,2),16),1];
  m=c.match(/[\d.]+/g); return [+m[0],+m[1],+m[2],m[3]!=null?+m[3]:1]; }
function css(v){ var r=Math.round(v[0]), g=Math.round(v[1]), b=Math.round(v[2]); if(v[3]>=.999) return "#"+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); return "rgba("+r+","+g+","+b+","+(Math.round(v[3]*100)/100)+")"; }
function mix(a,b,k){ var x=rgba(a), y=rgba(b); return css([x[0]+(y[0]-x[0])*k, x[1]+(y[1]-x[1])*k, x[2]+(y[2]-x[2])*k, x[3]+(y[3]-x[3])*k]); }
function grey(a,k,dk){ var x=rgba(a), l=x[0]*.3+x[1]*.55+x[2]*.15; var v=[x[0]+(l-x[0])*k, x[1]+(l-x[1])*k, x[2]+(l-x[2])*k, x[3]]; if(dk){ v[0]*=1-dk; v[1]*=1-dk; v[2]*=1-dk; } return css(v); }

/* Paletten je Darstellung (light = Hell, dark = Alpenglas und Dunkel) und Tageszeit */
var PAL={
  light:{
    day:{s1:"#b9d1ec",s2:"#d5e3f2",s3:"#ebf0f6",f1:"#9fb4cf",f2:"#cad7e7",fs:"#f6f9fd",fss:"#d2ddeb",fsh:"rgba(55,80,125,.17)",
      m1:"#7089ab",m2:"#a8bcd2",ms:"#fcfdff",mss:"#cbd8e8",msh:"rgba(30,52,92,.2)",n1:"#93a99a",n2:"#5f7e6d",t1:"#4b735f",t2:"#2c5142",lx:"#c99f45",
      g1:"#c7d6a5",g2:"#9cb87f",pl:"#fbf9f4",pls:"#e0dbd0",wd:"#704630",wdk:"#4f321f",rf:"#4a4f58",rfl:"#7a818c",win:"#3b4350",wino:"#3b4350",glowc:"#ffcf7a",glow:"0",
      shut:"#5c7a54",ch:"#fefdf9",sp:"#4b5a66",spl:"#738390",pa:"#ece3cf",rv:"#a6c4db",fn:"#8b6e55",sun:"#fff8e3",sung:"rgba(255,206,120,.5)",moon:"#f6f1df",
      cl1:"#ffffff",cl2:"#d6dfeb",fog:"rgba(255,255,255,.85)",rain:"rgba(62,92,135,.55)",flake:"#ffffff",flk:"rgba(45,65,100,.7)",smoke:"rgba(120,130,146,.55)",sl:"rgba(30,50,85,.55)",star:"#ffffff"},
    dusk:{s1:"#9db0d3",s2:"#dcc7d2",s3:"#f6d8bf",f1:"#b0a6c4",f2:"#d9c4cc",fs:"#fde4db",fss:"#cfc0d4",fsh:"rgba(70,50,105,.18)",
      m1:"#85839f",m2:"#b4a6b7",ms:"#ffe9e0",mss:"#c4b6cb",msh:"rgba(50,38,85,.24)",n1:"#8a978a",n2:"#5d7166",t1:"#43604f",t2:"#2a4536",lx:"#c08f42",
      g1:"#bcc194",g2:"#94a174",pl:"#f9efe5",pls:"#d8c8bb",wd:"#6e4127",wdk:"#4c2c18",rf:"#46444e",rfl:"#6f6b78",win:"#ffcf7a",wino:"#4a4450",glowc:"#ffc56a",glow:".75",
      shut:"#56704f",ch:"#fbf3ea",sp:"#46485a",spl:"#6a6a80",pa:"#e8d6c0",rv:"#c3b6cf",fn:"#7a5e4c",sun:"#fff0d2",sung:"rgba(255,170,110,.55)",moon:"#f8f0dc",
      cl1:"#fff3ec",cl2:"#d9c3cf",fog:"rgba(255,244,238,.8)",rain:"rgba(80,80,125,.5)",flake:"#ffffff",flk:"rgba(90,80,120,.3)",smoke:"rgba(125,115,140,.55)",sl:"rgba(55,40,85,.55)",star:"#ffffff"},
    night:{s1:"#7286ad",s2:"#98a7c3",s3:"#c3cbdb",f1:"#8394b3",f2:"#a5b2c9",fs:"#e6ecf5",fss:"#b2bed3",fsh:"rgba(25,35,70,.2)",
      m1:"#62749a",m2:"#8695b2",ms:"#eef2f9",mss:"#a9b5cb",msh:"rgba(18,28,60,.26)",n1:"#6c7c92",n2:"#4a596f",t1:"#37485a",t2:"#263545",lx:"#6f6c5c",
      g1:"#8592a6",g2:"#66748a",pl:"#e2e6ee",pls:"#b4bbc8",wd:"#4b3a33",wdk:"#33271f",rf:"#323946",rfl:"#4c5462",win:"#ffd27e",wino:"#3b4352",glowc:"#ffc35e",glow:"1",
      shut:"#465a52",ch:"#e8ebf1",sp:"#36404d",spl:"#4d5866",pa:"#adb5c3",rv:"#9fb1cb",fn:"#55504e",sun:"#fff",sung:"rgba(255,255,255,0)",moon:"#fdf8e6",
      cl1:"#e9edf5",cl2:"#a9b4c8",fog:"rgba(235,240,248,.7)",rain:"rgba(40,55,90,.5)",flake:"#ffffff",flk:"rgba(50,65,100,.3)",smoke:"rgba(225,230,240,.6)",sl:"rgba(20,30,60,.55)",star:"#ffffff"}
  },
  dark:{
    day:{s1:"rgba(66,112,172,.8)",s2:"rgba(104,150,204,.88)",s3:"rgba(164,195,228,.92)",f1:"#7d93b2",f2:"#62789a",fs:"#e8eef7",fss:"#a5b5cc",fsh:"rgba(8,16,36,.24)",
      m1:"#4e6382",m2:"#3c506c",ms:"#f0f4fa",mss:"#a8b8cd",msh:"rgba(6,12,28,.3)",n1:"#3c5250",n2:"#283b3c",t1:"#21403a",t2:"#142c26",lx:"#a8873c",
      g1:"#46634f",g2:"#2f4739",pl:"#eeebe4",pls:"#bdb8ae",wd:"#5f3d26",wdk:"#3f2716",rf:"#2b3038",rfl:"#4a515d",win:"#1d232b",wino:"#1d232b",glowc:"#ffc96e",glow:"0",
      shut:"#465f44",ch:"#f3f1eb",sp:"#323d49",spl:"#4d5a68",pa:"#a39882",rv:"#7091b0",fn:"#6d5642",sun:"#fffbea",sung:"rgba(255,196,110,.55)",moon:"#f6f1df",
      cl1:"rgba(238,243,250,.92)",cl2:"rgba(165,180,202,.88)",fog:"rgba(210,222,238,.38)",rain:"rgba(205,222,245,.55)",flake:"#ffffff",flk:"rgba(0,0,0,0)",smoke:"rgba(220,226,234,.5)",sl:"rgba(235,242,252,.6)",star:"#ffffff"},
    dusk:{s1:"rgba(60,70,125,.12)",s2:"rgba(150,110,150,.24)",s3:"rgba(240,160,120,.34)",f1:"#6f6589",f2:"#574f72",fs:"#f3cbbf",fss:"#a28ea9",fsh:"rgba(20,10,40,.24)",
      m1:"#4b4869",m2:"#3a3854",ms:"#f8dbd0",mss:"#a391ab",msh:"rgba(15,8,35,.3)",n1:"#36403f",n2:"#262f31",t1:"#1f3530",t2:"#132520",lx:"#9c7a3c",
      g1:"#3b4a3c",g2:"#29362d",pl:"#e6dbd0",pls:"#b2a598",wd:"#523422",wdk:"#372214",rf:"#26262e",rfl:"#45444f",win:"#ffc670",wino:"#2a2730",glowc:"#ffbe62",glow:".8",
      shut:"#3f543d",ch:"#ece2d8",sp:"#2e2e3c",spl:"#484859",pa:"#8f7f73",rv:"#8a7f9f",fn:"#5e4a3c",sun:"#ffe9c8",sung:"rgba(255,160,110,.5)",moon:"#f8f0dc",
      cl1:"rgba(250,225,215,.88)",cl2:"rgba(150,125,150,.85)",fog:"rgba(230,205,200,.3)",rain:"rgba(215,205,235,.5)",flake:"#ffffff",flk:"rgba(0,0,0,0)",smoke:"rgba(220,210,220,.45)",sl:"rgba(250,235,235,.6)",star:"#ffffff"},
    night:{s1:"rgba(6,12,26,.2)",s2:"rgba(14,24,46,.32)",s3:"rgba(32,48,78,.42)",f1:"#36476a",f2:"#2b3a57",fs:"#adbdd6",fss:"#6c7d9b",fsh:"rgba(0,4,14,.26)",
      m1:"#26354f",m2:"#1d2a40",ms:"#c8d4e6",mss:"#7c8ca9",msh:"rgba(0,4,14,.32)",n1:"#1d2a35",n2:"#16212b",t1:"#13241f",t2:"#0b1714",lx:"#4f4a34",
      g1:"#1f2c2b",g2:"#162120",pl:"#a0a7b2",pls:"#757c88",wd:"#2f2219",wdk:"#20160f",rf:"#13171e",rfl:"#252b35",win:"#ffcb6a",wino:"#1b2029",glowc:"#ffbf55",glow:"1",
      shut:"#2b3a33",ch:"#aeb5c0",sp:"#1c232c",spl:"#2b333e",pa:"#5f6672",rv:"#4f6383",fn:"#3b342f",sun:"#fff",sung:"rgba(255,255,255,0)",moon:"#fdf8e6",
      cl1:"rgba(150,165,190,.55)",cl2:"rgba(70,85,110,.6)",fog:"rgba(170,185,210,.22)",rain:"rgba(180,200,230,.45)",flake:"#ffffff",flk:"rgba(0,0,0,0)",smoke:"rgba(190,200,215,.35)",sl:"rgba(220,230,250,.55)",star:"#ffffff"}
  }
};
var LAND=["f1","f2","fs","fss","m1","m2","ms","mss","n1","n2","t1","t2","g1","g2","lx"];
/* Wetter verändert das Licht: bedeckt = entsättigt und dunstig, Gewitter = dunkler, Nebel = ferne Ketten verschwinden im Grau */
function palette(theme,phase,ic,snowy,season){
  var p=Object.assign({},PAL[theme==="light"?"light":"dark"][phase]), k={cloud:.45,rain:.55,snow:.42,fog:.5,storm:.62,cloudSun:.12}[ic]||0;
  if(k){ var dk=ic==="storm"?.16:ic==="rain"?.06:0;
    LAND.forEach(function(n){ p[n]=grey(p[n],k,dk); });
    ["s1","s2","s3"].forEach(function(n){ p[n]=grey(p[n],k*1.15>1?1:k*1.15,dk*1.2); });
    var hz=ic==="fog"?.5:ic==="snow"?.32:k*.35;
    ["f1","f2","fs","fss"].forEach(function(n){ p[n]=mix(p[n],theme==="light"?p.s3:p.m2,hz); });
    if(ic==="fog") ["m1","m2","mss"].forEach(function(n){ p[n]=mix(p[n],theme==="light"?p.s3:p.f2,.28); });
    /* Hell: bei Niederschlag dunklerer, grauer Himmel – sonst sieht man Schnee und Regen nicht */
    if(theme==="light"&&/rain|snow|storm/.test(ic)){ var dg={rain:["#a2acba","#b9c1cc","#d3d8df",.5],snow:["#9eaabb","#b5bfcc","#d0d6de",.55],storm:["#77818f","#959eab","#bcc2ca",.62]}[ic];
      p.s1=mix(p.s1,dg[0],dg[3]); p.s2=mix(p.s2,dg[1],dg[3]); p.s3=mix(p.s3,dg[2],dg[3]*.8); }
    if(/rain|storm/.test(ic)){ p.cl1=grey(p.cl1,.5,ic==="storm"?.3:.12); p.cl2=grey(p.cl2,.5,ic==="storm"?.38:.2); }
    else if(ic!=="cloudSun"){ p.cl2=grey(p.cl2,.4,.04); }
  }
  if(season!=="autumn") p.lx=mix(p.t1,p.n1,.35);
  if(snowy){ p.g1=p.ms; p.g2=p.mss; }
  p.clh=theme==="light"?p.cl2:p.cl1;
  p.lit=phase==="night"?"rgba(200,215,240,.06)":phase==="dusk"?"rgba(255,190,160,.16)":k>.3?"rgba(255,255,255,.03)":"rgba(255,250,235,.2)";
  /* bedeckt: diffuses Licht – Licht- und Schattenseiten nur noch angedeutet */
  if(k>.3){ ["fsh","msh"].forEach(function(n){ var v=rgba(p[n]); v[3]*=.5; p[n]=css(v); }); }
  return p;
}

/* ---------- Tageszeit (Wiener Zeit), Sonnenauf-/untergang im Montafon je Monatsmitte (MEZ, ohne Sommerzeit) ---------- */
var UP=[8.02,7.44,6.56,5.62,4.85,4.46,4.72,5.32,5.92,6.56,7.29,7.92], DN=[16.94,17.69,18.4,19.04,19.69,20.21,20.14,19.48,18.58,17.64,16.87,16.58];
function vienna(){ var d=new Date(), o={};
  try{ new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Vienna",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric",hourCycle:"h23"}).formatToParts(d).forEach(function(x){ o[x.type]=x.value; });
    var h=+o.hour+(+o.minute)/60, utc=d.getUTCHours()+d.getUTCMinutes()/60, off=Math.round(((h-utc)%24+24)%24);
    return {h:h,m:+o.month-1,d:+o.day,dst:off===2?1:0}; }
  catch(e){ return {h:d.getHours()+d.getMinutes()/60,m:d.getMonth(),d:d.getDate(),dst:0}; } }
function sunTimes(v){ var m=v.m, t=(v.d-15)/30.5, m2=t<0?(m+11)%12:(m+1)%12, a=Math.abs(t);
  return {up:UP[m]+(UP[m2]-UP[m])*a+v.dst, dn:DN[m]+(DN[m2]-DN[m])*a+v.dst}; }
function sky(){ var v=vienna(), s=sunTimes(v), h=v.h, ph="night";
  if(h>=s.up+.4&&h<s.dn-.4) ph="day"; else if((h>=s.up-.6&&h<s.up+.4)||(h>=s.dn-.4&&h<s.dn+.6)) ph="dusk";
  return {phase:ph,t:Math.max(0,Math.min(1,(h-s.up)/(s.dn-s.up))),month:v.m}; }

/* ---------- Landschaft (einmal berechnet, danach aus dem Speicher) ---------- */
/* Höhe in Metern → y im Bild (Talboden Gaschurn ≈ 1000 m, höchste Gipfel ≈ 2900 m) */
function yOf(m){ return 262-(m-1000)*.092; }
var FAR=[[0,148],[90,124],[170,138],[260,108],[330,126],[420,118],[500,94],[560,112],[650,118],[720,100],[800,120],[880,110],[960,80],[1010,98],[1080,118],[1160,108],[1230,124],[1300,100],[1360,114],[1440,86],[1500,106],[1560,118],[1600,112]];
var MID=[[0,186],[60,164],[140,176],[230,144],[300,166],[390,154],[470,128],[540,156],[610,166],[700,138],[780,160],[860,146],[940,166],[1020,134],[1100,156],[1170,144],[1250,112],[1320,140],[1380,156],[1440,146],[1500,126],[1556,150],[1600,142]];
var NEAR=[[0,214],[90,200],[200,208],[320,190],[430,204],[540,196],[640,212],[760,198],[860,206],[960,192],[1060,210],[1140,220],[1220,206],[1300,200],[1380,206],[1460,194],[1540,202],[1600,194]];
var MEAD=[[0,262],[200,258],[420,264],[640,256],[860,262],[1040,254],[1180,258],[1300,251],[1420,255],[1520,249],[1600,253]];

function peaks(anc){ var o=[]; for(var i=1;i<anc.length-1;i++) if(anc[i][1]<anc[i-1][1]&&anc[i][1]<anc[i+1][1]) o.push(i); return o; }
/* Sättel: tiefster Punkt zwischen zwei Gipfeln (dazu die beiden Bildränder) */
function saddles(anc,pk){ var s=[0], i, j; for(i=0;i<pk.length-1;i++){ var b=pk[i]+1; for(j=pk[i]+1;j<pk[i+1];j++) if(anc[j][1]>anc[b][1]) b=j; s.push(b); } s.push(anc.length-1); return s; }
/* Linie a→b mit leichtem Zickzack quer zur Richtung (Rippen und Rinnen wirken gezeichnet, nicht gelinealt) */
function jline(a,b,amp,r){ var out=[a]; (function md(p,q,am){ var dx=q[0]-p[0], dy=q[1]-p[1], L=Math.sqrt(dx*dx+dy*dy); if(L<=6){ out.push(q); return; }
  var k=(r()-.5)*am, m=[(p[0]+q[0])/2-dy/L*k,(p[1]+q[1])/2+dx/L*k]; md(p,m,am*.55); md(m,q,am*.55); })(a,b,amp); return out; }
/* Flanken (Licht von rechts): je Gipfel eine Schattenseite (Sattel links → Gipfel → Rippe steil hinunter) und eine Lichtseite
   (Gipfel → Sattel rechts → Rinne). Die Spitzen der Flächen liegen tief unter den Vorbergen, jede Fläche läuft nach unten
   in den Dunst aus – so wirkt der Berg modelliert statt aus Dreiecken zusammengesetzt. */
function flanks(pts,anc,r){
  var pk=peaks(anc), sd=saddles(anc,pk), sh=[], li=[];
  pk.forEach(function(k,n){ var P=anc[k], SL=anc[sd[n]], SR=anc[sd[n+1]], wl=P[0]-SL[0], wr=SR[0]-P[0];
    var C=[P[0]-wl*(.38+r()*.16), P[1]+wl*(.85+r()*.35)], rl=pts.filter(function(p){ return p[0]>=SL[0]&&p[0]<=P[0]; });
    sh.push(poly(rl.concat(jline(P,C,wl*.16,r).slice(1),jline(C,SL,wl*.12,r).slice(1,-1)),1));
    var D=[P[0]+wr*(.3+r()*.14), P[1]+wr*(.7+r()*.3)], rr=pts.filter(function(p){ return p[0]>=P[0]&&p[0]<=SR[0]; });
    li.push(poly(rr.concat(jline(SR,D,wr*.12,r).slice(1),jline(D,P,wr*.14,r).slice(1,-1)),1)); });
  return {sh:sh,li:li}; }
/* Schnee liegt oberhalb einer unruhigen Höhenlinie: hohe Gipfel tragen viel, niedrige wenig, Sättel nichts.
   Unten zieht er in Rinnen hinunter, dazwischen schauen Felsrippen heraus. Hauchdünne Säume entfallen. */
function snowField(pts,anc,base,r){
  var F=[], pk=peaks(anc), i, x, ph=[r()*9,r()*9,r()*9,r()*9,r()*9];
  pk.forEach(function(k){ var P=anc[k], d=base-P[1]; if(d<5) return; var nf=2+Math.floor(r()*2);
    for(i=0;i<nf;i++) F.push([P[0]+(r()-.5)*d*1.6, 4+r()*4, Math.min(9,2.5+d*(.1+r()*.14))]);
    F.push([P[0]+(r()-.5)*d*1.2, 2.4+r()*2, -(2.5+r()*Math.min(7,d*.22))]); });
  var low=[];
  for(x=-10;x<=VW+10;x+=2){
    var y=base+5*Math.sin(x*.0061+ph[0])+3.4*Math.sin(x*.017+ph[1])+2.2*Math.sin(x*.041+ph[2])+1.3*Math.sin(x*.093+ph[3])+.8*Math.sin(x*.23+ph[4])+(r()-.5)*1.2;
    for(i=0;i<F.length;i++){ var u=Math.abs(x-F[i][0])/F[i][1]; if(u<1) y+=F[i][2]*Math.pow(1-u,1.25); }
    var ry=yAt(pts,x), t=y-ry; if(t<8) t=Math.max(-2,(t-3)*1.6);
    low.push([x,ry+t]); }
  return poly([[-20,-20],[VW+20,-20]].concat(low.reverse())); }
/* Wald: Silhouette aus vielen Fichtenspitzen (gestuft), Ränder überlappen */
function forest(r,base,step,hmin,hmax,x0,notch){
  var pts=[[x0,base(x0)+40]];
  for(var x=x0;x<VW+8;x+=step*(.7+r()*.6)){ var b=base(x)+(r()-.5)*3, h=hmin+r()*(hmax-hmin), w=h*(.5+r()*.16);
    if(notch) pts.push([x-w*.5,b-h*.1],[x-w*.32,b-h*.44],[x-w*.15,b-h*.42],[x,b-h],[x+w*.15,b-h*.42],[x+w*.32,b-h*.44],[x+w*.5,b-h*.1]);
    else pts.push([x-w*.5,b-h*.12],[x-w*.2,b-h*.55],[x,b-h],[x+w*.2,b-h*.55],[x+w*.5,b-h*.12]); }
  pts.push([VW+20,VH+20],[x0,VH+20]); var d=""; for(var i=0;i<pts.length;i++) d+=(i?"L":"M")+Math.round(pts[i][0])+" "+Math.round(pts[i][1]); return d+"Z"; }

/* Häuser (Ursprung = Mitte unten): Montafoner Haus, weißer gemauerter Sockel, dunkles Holz oben, steiles Dach mit Vorsprung */
function win(x,y,w,h,lit){ return '<rect class="'+(lit?"k-win":"k-wino")+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'"/>'; }
function chaletF(r,snowy){ var b='', g='', W=[[-10.6,-8.8,4.2,4.6],[6.4,-8.8,4.2,4.6],[-10.4,-18.8,4,4],[6.4,-18.8,4,4],[-2,-27,4,3.6]];
  b+='<rect class="k-pl" x="-15" y="-11.2" width="30" height="11.2"/><rect class="k-pls" x="-15" y="-11.2" width="30" height="1.7"/>'+
     '<path class="k-wd" d="M-15 -11H15V-20L0 -33L-15 -20Z"/><path class="k-wdk" d="M-16.5 -13.8h33v2.4h-33zM-1.9 -6.6h3.8V0h-3.8z"/>'+
     '<path class="k-sh" d="M-12.3 -8.8h1.4v4.6h-1.4zM-6.1 -8.8h1.4v4.6h-1.4zM4.7 -8.8h1.4v4.6h-1.4zM10.9 -8.8h1.4v4.6h-1.4z"/>';
  W.forEach(function(w){ var lit=r()<.62; b+=win(w[0],w[1],w[2],w[3],lit); if(lit) g+='<rect class="k-gw" x="'+(w[0]-1.5)+'" y="'+(w[1]-1.5)+'" width="'+(w[2]+3)+'" height="'+(w[3]+3)+'"/>'; });
  b+='<rect class="k-rf" x="6.8" y="-33.4" width="2.8" height="6"/>'+
     '<path class="k-rfs" d="M-18.8 -18.6L0 -34.9L18.8 -18.6" stroke-width="2.9" stroke-linejoin="miter"/>'+
     (snowy?'<path class="k-rs" d="M-19.3 -19.4L0 -36.2L19.3 -19.4" stroke-width="1.7" stroke-linejoin="round"/>':'');
  return {b:b,g:g,ch:[8.2,-33.4]}; }
function chaletS(r,snowy){ var b='', g='', W=[[-17.2,-8.6,3.8,4.4],[-6.6,-8.6,3.8,4.4],[-17,-18.8,3.6,3.8],[-6.6,-18.8,3.6,3.8],[-11.8,-26,3.6,3.2],[4.2,-8.6,3.2,4.4],[10.2,-8.6,3.2,4.4],[16.2,-8.6,3.2,4.4],[4.3,-18.4,3,3.6],[10.3,-18.4,3,3.6],[16.3,-18.4,3,3.6]];
  b+='<rect class="k-pl" x="-21" y="-11.2" width="22" height="11.2"/><rect class="k-pls" x="1" y="-11.2" width="20" height="11.2"/>'+
     '<path class="k-wd" d="M-21 -11H1V-20L-10 -30L-21 -20Z"/><rect class="k-wdk" x="1" y="-20.2" width="20" height="9.2"/>'+
     '<path class="k-wdk" d="M-22.4 -13.6h24v2.3h-24zM-17.6 -6.4h3.6V0h-3.6z"/><rect class="k-rf" x="1" y="-13.6" width="20.6" height="2.3" opacity=".55"/>'+
     '<path class="k-sh" d="M-19 -8.6h1.3v4.4h-1.3zM-13 -8.6h1.3v4.4h-1.3zM-8.4 -8.6h1.3v4.4h-1.3zM-2.4 -8.6h1.3v4.4h-1.3z"/>';
  W.forEach(function(w,i){ var lit=r()<.58; b+=win(w[0],w[1],w[2],w[3],lit); if(lit) g+='<rect class="k-gw" x="'+(w[0]-1.5)+'" y="'+(w[1]-1.5)+'" width="'+(w[2]+3)+'" height="'+(w[3]+3)+'"/>'; });
  b+='<rect class="k-rf" x="13" y="-35.6" width="2.8" height="6"/>'+
     '<path class="'+(snowy?"k-rsf":"k-rf")+'" d="M-11.6 -31.8L11.6 -31.8L27 -17.2L4.2 -17.2Z"/>'+
     (snowy?'<path class="k-rfs" d="M4.2 -17.2H27" stroke-width="1.2"/>':'<path class="k-rfl" d="M-11.2 -31.4H11.4" stroke-width=".9"/>')+
     '<path class="k-rfs" d="M-24 -17.4L-10 -31.6" stroke-width="2.7"/>'+(snowy?'<path class="k-rs" d="M-24.8 -18.6L-10.6 -32.8" stroke-width="1.5"/>':'');
  return {b:b,g:g,ch:[14.4,-35.6]}; }
function church(snowy){ var b='';
  b+='<rect class="k-chu" x="-14" y="-20" width="41" height="20"/><path class="k-pls" d="M27 0V-17Q35 -15.5 35 -8V0Z"/>'+
     '<path class="'+(snowy?"k-rsf":"k-rf")+'" d="M-15.5 -19.4H28.5L26.4 -30.4H-13.2Z"/>'+(snowy?'':'<path class="k-rfl" d="M-13 -30H26" stroke-width=".8"/>')+
     '<path class="k-wino" d="M-5 -6.5v-6.5a1.5 1.5 0 0 1 3 0v6.5zM5 -6.5v-6.5a1.5 1.5 0 0 1 3 0v6.5zM15 -6.5v-6.5a1.5 1.5 0 0 1 3 0v6.5z"/>'+
     '<rect class="k-chu" x="-26" y="-51" width="12" height="51"/><rect class="k-pls" x="-17" y="-51" width="3" height="51"/>'+
     '<path class="k-wdk" d="M-24.2 -43.5v-4a1 1 0 0 1 2 0v4zM-20.2 -43.5v-4a1 1 0 0 1 2 0v4zM-21.6 -6V0h-4.4V-6a2.2 2.2 0 0 1 4.4 0z"/>'+
     '<circle class="k-chu" cx="-20" cy="-35" r="2.6"/><circle class="k-spk" cx="-20" cy="-35" r="2.6" stroke-width=".7"/>'+
     '<rect class="k-sp" x="-27" y="-52.6" width="14" height="1.8"/>'+
     '<path class="k-spl" d="M-27 -52.4L-20 -86L-20 -52.4Z"/><path class="k-sp" d="M-20 -86L-13 -52.4L-20 -52.4Z"/>'+
     '<path class="k-chu" d="M-23.6 -52.4L-20 -58.6L-16.4 -52.4Z"/><path class="k-spk" d="M-20 -86V-91.5M-21.9 -89.4H-18.1" stroke-width=".8"/>';
  return b; }
function tree(kind,x,y,s,cls){ return '<use href="#alp'+kind+'" class="'+cls+'" transform="translate('+x+' '+y+') scale('+s+')"/>'; }

var LCACHE={};
function landscape(snowy,snowLine,season){
  var key=(snowy?1:0)+"|"+(snowLine||0)+"|"+season; if(LCACHE[key]) return LCACHE[key];
  var r=rng(20261028), far=ridge(FAR,.2,11,5), mid=ridge(MID,.24,23,4), near=smooth(NEAR,8), mead=smooth(MEAD,10), i;
  var FF=flanks(far,FAR,r), MF=flanks(mid,MID,r), ffa=FF.sh.join(""), mfa=MF.sh.join("");
  function facets(a,c){ return a.map(function(d){ return '<path class="'+c+'" d="'+d+'"/>'; }).join(""); }
  var fsn='<path d="'+snowField(far,FAR,snowy?122:106,r)+'"/>', msn='<path d="'+snowField(mid,MID,snowy?162:146,r)+'"/>';
  var nearY=function(x){ return yAt(near,x); }, meadY=function(x){ return yAt(mead,x); };
  var t1=forest(rng(5),function(x){ return nearY(x)+9+5*Math.sin(x/47)+3*Math.sin(x/13); },6.5,9,17,120,false);
  var t2=forest(rng(9),function(x){ var a=nearY(x), b=meadY(x); return a+(b-a)*.5+4*Math.sin(x/31); },7,12,22,120,true);
  /* goldene Lärchen im Herbst (sonst hellere Fichten): einzelne Bäume am oberen Rand des vorderen Waldes */
  var lr=rng(77), lx="";
  for(i=0;i<34;i++){ var xx=260+lr()*1320, a0=nearY(xx), b0=meadY(xx), by=a0+(b0-a0)*(.42+lr()*.3);
    lx+='<use href="#alpPine2" transform="translate('+Math.round(xx)+' '+Math.round(by)+') scale('+(.2+lr()*.12).toFixed(2)+')"/>'; }
  var defs='<defs>'+
    '<linearGradient id="alpGf" gradientUnits="userSpaceOnUse" x1="0" y1="78" x2="0" y2="244"><stop offset="0" style="stop-color:var(--a-f1)"/><stop offset="1" style="stop-color:var(--a-f2)"/></linearGradient>'+
    '<linearGradient id="alpGm" gradientUnits="userSpaceOnUse" x1="0" y1="110" x2="0" y2="250"><stop offset="0" style="stop-color:var(--a-m1)"/><stop offset="1" style="stop-color:var(--a-m2)"/></linearGradient>'+
    '<linearGradient id="alpGn" gradientUnits="userSpaceOnUse" x1="0" y1="186" x2="0" y2="262"><stop offset="0" style="stop-color:var(--a-n1)"/><stop offset="1" style="stop-color:var(--a-n2)"/></linearGradient>'+
    '<linearGradient id="alpGg" gradientUnits="userSpaceOnUse" x1="0" y1="248" x2="0" y2="320"><stop offset="0" style="stop-color:var(--a-g1)"/><stop offset="1" style="stop-color:var(--a-g2)"/></linearGradient>'+
    '<linearGradient id="alpGh" gradientUnits="userSpaceOnUse" x1="0" y1="132" x2="0" y2="236"><stop offset="0" style="stop-color:var(--a-s3);stop-opacity:0"/><stop offset=".72" style="stop-color:var(--a-s3);stop-opacity:.55"/><stop offset="1" style="stop-color:var(--a-s3);stop-opacity:0"/></linearGradient>'+
    '<linearGradient id="alpGsf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a-fsh)"/><stop offset=".35" style="stop-color:var(--a-fsh);stop-opacity:.7"/><stop offset=".75" style="stop-color:var(--a-fsh);stop-opacity:.14"/><stop offset="1" style="stop-color:var(--a-fsh);stop-opacity:0"/></linearGradient>'+
    '<linearGradient id="alpGsm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a-msh)"/><stop offset=".35" style="stop-color:var(--a-msh);stop-opacity:.78"/><stop offset=".75" style="stop-color:var(--a-msh);stop-opacity:.16"/><stop offset="1" style="stop-color:var(--a-msh);stop-opacity:0"/></linearGradient>'+
    '<linearGradient id="alpGlm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a-lit)"/><stop offset=".4" style="stop-color:var(--a-lit);stop-opacity:.4"/><stop offset="1" style="stop-color:var(--a-lit);stop-opacity:0"/></linearGradient>'+
    '<path id="alpFarP" d="'+shape(far)+'"/><path id="alpMidP" d="'+shape(mid)+'"/><path id="alpNearP" d="'+shape(near)+'"/>'+
    '<g id="alpSnF">'+fsn+'</g><g id="alpSnM">'+msn+'</g>'+
    '<clipPath id="alpCf"><use href="#alpFarP"/></clipPath><clipPath id="alpCm"><use href="#alpMidP"/></clipPath>'+
    '<path id="alpFfP" d="'+ffa+'"/><path id="alpFmP" d="'+mfa+'"/><path id="alpT1P" d="'+t1+'"/>'+
    '<clipPath id="alpFf"><use href="#alpFfP"/></clipPath><clipPath id="alpFm"><use href="#alpFmP"/></clipPath>'+
    '<filter id="alpFb" x="-2%" y="-5%" width="104%" height="110%"><feGaussianBlur stdDeviation="1.1"/></filter>'+
    /* oberhalb der Schneefallgrenze frisch angezuckert – mit weichem Übergang statt harter Kante */
    (snowLine?'<linearGradient id="alpSLg" gradientUnits="userSpaceOnUse" x1="0" y1="'+n1(yOf(snowLine)-16)+'" x2="0" y2="'+n1(yOf(snowLine)+2)+'"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>'+
      '<mask id="alpSL" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="320"><rect width="1600" height="320" fill="url(#alpSLg)"/></mask>':'')+
  '</defs>';
  var SV='<svg class="alp-back" viewBox="0 0 1600 320" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">';
  /* hinten: Bergketten bis zur mittleren Kette (dahinter/dazwischen können Wolkenbänder ziehen) */
  var back=SV+defs+
    '<use href="#alpFarP" class="k-far"/><g clip-path="url(#alpCf)"><g filter="url(#alpFb)">'+facets(FF.sh,"k-fsh")+'</g>'+
    '<use href="#alpSnF" class="k-fs"/><g clip-path="url(#alpFf)"><use href="#alpSnF" class="k-fss"/></g></g>'+
    '<rect class="k-haze" x="0" y="132" width="1600" height="104"/>'+
    '<use href="#alpMidP" class="k-mid"/><g clip-path="url(#alpCm)"><g filter="url(#alpFb)">'+facets(MF.sh,"k-msh")+facets(MF.li,"k-mli")+'</g>'+
    '<use href="#alpSnM" class="k-ms"/><g clip-path="url(#alpFm)"><use href="#alpSnM" class="k-mss"/></g></g>'+
    (snowLine?'<g mask="url(#alpSL)" class="k-frost"><use href="#alpMidP"/></g>':'')+
  '</svg>';
  /* vorne: Vorberge, Wald, Talwiese mit Bach, Weg und Zaun */
  var back2=SV+
    '<use href="#alpNearP" class="k-near"/>'+
    '<use href="#alpT1P" class="k-t1"/><g class="k-lx">'+lx+'</g><path class="k-t2" d="'+t2+'"/>'+
    (snowLine?'<g mask="url(#alpSL)" class="k-frost2"><use href="#alpT1P"/></g>':'')+
    '<path class="k-g" d="M906 262C930 258 934 238 962 233C990 228 1032 228 1054 234C1074 240 1080 256 1104 262Z"/>'+
    '<path class="k-g" d="'+shape(mead)+'"/>'+
    '<path class="k-rv" d="M960 314C1060 306 1150 316 1240 310S1400 303 1480 309S1570 312 1610 306" stroke-width="2.4"/>'+
    '<path class="k-pa" d="M560 292C700 286 820 294 960 289S1180 283 1320 284S1470 279 1610 281" stroke-width="2.2"/>'+
    '<path class="k-pa" d="M1384 330C1392 316 1376 304 1394 294S1404 286 1398 282" stroke-width="1.8"/>'+
    '<path class="k-fn" d="M1170 289.6H1262M1172 289.6v-3.4M1180 289.6v-3.4M1188 289.6v-3.4M1196 289.6v-3.4M1204 289.6v-3.4M1212 289.6v-3.4M1220 289.6v-3.4M1228 289.6v-3.4M1236 289.6v-3.4M1244 289.6v-3.4M1252 289.6v-3.4M1260 289.6v-3.4M1170 287.6H1262" stroke-width=".7"/>'+
  '</svg>';
  /* Dorf: hintere Reihe kleiner, Kirche, vordere Reihe; ein paar Bäume dazwischen, Fichten rahmen rechts */
  var vr=rng(314), H=[
    [1318,265,"F",.7,0,0],[1362,261,"S",.68,1,1],[1468,263,"F",.72,0,0],[1534,261,"S",.64,0,0],
    [1322,293,"S",.97,0,1],[1384,299,"F",1.02,0,0],[1480,297,"F",.99,1,1],[1548,292,"S",.9,1,0]];
  var body='', glow='', smoke=[];
  body+=tree("Pine2",1342,276,.44,"k-t2")+tree("Pine",1506,272,.4,"k-t2")+tree("Tree",1446,270,.36,"k-lx")+tree("Pine2",1562,270,.42,"k-t1");
  H.slice(0,4).forEach(house);
  body+='<g transform="translate(1414 274) scale(.96)">'+church(snowy)+'</g>';
  body+=tree("Tree",1290,300,.46,"k-lx")+tree("Pine",1432,302,.44,"k-t2")+tree("Pine2",1516,302,.52,"k-t1");
  H.slice(4).forEach(house);
  body+=tree("Pine",1288,312,.66,"k-t2")+tree("Pine2",1274,316,.5,"k-t1")+
        tree("Pine2",1572,318,.66,"k-t2");
  function house(h){ var o=h[2]==="F"?chaletF(vr,snowy):chaletS(vr,snowy), fl=h[4]?-1:1, tr='translate('+h[0]+' '+h[1]+') scale('+(h[3]*fl)+' '+h[3]+')';
    body+='<g transform="'+tr+'">'+o.b+'</g>'; glow+='<g transform="'+tr+'">'+o.g+'</g>';
    if(h[5]) smoke.push([h[0]+o.ch[0]*h[3]*fl,h[1]+o.ch[1]*h[3]]); }
  /* ganzes Dorf etwas größer (um die Dorfmitte), Rauchpunkte mitrechnen */
  var VS=1.1, VX=1449, VT='translate('+VX+' 300) scale('+VS+') translate(-1440 -300)';
  smoke=smoke.map(function(c){ return [VX+(c[0]-1440)*VS,300+(c[1]-300)*VS]; });
  /* Weiler auf einer Waldlichtung (nur auf breiten Bildschirmen sichtbar, über/rechts neben den Schnellknöpfen): zwei Höfe und ein Stadel */
  var hb='', hg='';
  [[970,250,"F",.56,0],[1012,247,"S",.5,1]].forEach(function(h){ var o=h[2]==="F"?chaletF(vr,snowy):chaletS(vr,snowy), fl=h[4]?-1:1, tr='translate('+h[0]+' '+h[1]+') scale('+(h[3]*fl)+' '+h[3]+')';
    hb+='<g transform="'+tr+'">'+o.b+'</g>'; hg+='<g transform="'+tr+'">'+o.g+'</g>'; });
  hb=tree("Pine2",992,248,.3,"k-t2")+tree("Tree",950,252,.28,"k-lx")+hb+
    '<g transform="translate(1046 250) scale(.56)"><path class="k-wd" d="M-10 0V-9L0 -17L10 -9V0Z"/><rect class="k-wdk" x="-2.6" y="-6.5" width="5.2" height="6.5"/>'+
    '<path class="'+(snowy?"k-rs":"k-rfs")+'" d="M-12.4 -8L0 -18.6L12.4 -8" stroke-width="2.4"/></g>'+tree("Pine",1064,253,.3,"k-t1")+tree("Pine2",934,255,.32,"k-t1");
  var front='<svg class="alp-front" viewBox="0 0 1600 320" preserveAspectRatio="xMaxYMax slice" aria-hidden="true"><defs>'+
    '<path id="alpPine" d="M0 -50L2.2 -43H1L4.6 -35H2.6L6.6 -26H4.2L8.6 -16H5.8L10 -6H1.2V0H-1.2V-6H-10L-5.8 -16H-8.6L-4.2 -26H-6.6L-2.6 -35H-4.6L-1 -43H-2.2Z"/>'+
    '<path id="alpPine2" d="M0 -52L1.6 -44H.8L3.6 -35H2L5.4 -25H3.4L7 -14H4.6L7.8 -6H1V0H-1V-6H-7.8L-4.6 -14H-7L-3.4 -25H-5.4L-2 -35H-3.6L-.8 -44H-1.6Z"/>'+
    '<g id="alpTree"><rect class="k-trunk" x="-1" y="-9" width="2" height="9"/><path d="M0 -40C6 -38 9.5 -30 9 -22C8.6 -14 4.6 -9 0 -9C-4.6 -9 -8.6 -14 -9 -22C-9.5 -30 -6 -38 0 -40Z"/></g>'+
    '<filter id="alpBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>'+
    '<g class="k-glowg" filter="url(#alpBlur)">'+hg+'</g>'+hb+
    '<g transform="'+VT+'"><g class="k-glowg" filter="url(#alpBlur)">'+glow+'</g>'+body+'</g></svg>';
  return (LCACHE[key]={back:back,back2:back2,front:front,smoke:smoke});
}

/* ---------- Wetter-Ebenen ---------- */
/* Wolken: aus vielen weichen Ballen zusammengesetzt, flache Unterseite, Verlauf von hell (oben) nach grau (unten) */
function cloudPath(seed){ var r=rng(seed), d="", n=8+Math.floor(r()*4), base=80;
  for(var i=0;i<n;i++){ var t=i/(n-1), x=26+t*188+(r()-.5)*12, env=Math.sin(Math.PI*(.08+t*.84)), rad=7+r()*6+env*(12+r()*14), y=base-rad*(.45+r()*.35)-env*6*r();
    d+="M"+n1(x-rad)+" "+n1(y)+"a"+n1(rad)+" "+n1(rad)+" 0 1 0 "+n1(2*rad)+" 0a"+n1(rad)+" "+n1(rad)+" 0 1 0 "+n1(-2*rad)+" 0Z"; }
  return d+"M30 "+(base-9)+"H210V"+base+"H30Z"; }
var CLOUDS=[cloudPath(17),cloudPath(29),cloudPath(41),cloudPath(53)];
function cloudDefs(){ var d='<svg class="alp-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>'+
  '<linearGradient id="alpCg" gradientUnits="userSpaceOnUse" x1="0" y1="18" x2="0" y2="82"><stop offset="0" style="stop-color:var(--a-cl1)"/><stop offset=".45" style="stop-color:var(--a-cl1)"/><stop offset="1" style="stop-color:var(--a-cl2)"/></linearGradient>'+
  '<clipPath id="alpCc"><rect x="-40" y="-60" width="320" height="141"/></clipPath>'+
  '<filter id="alpCb" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>'+
  '<filter id="alpCs" x="-10%" y="-25%" width="120%" height="150%"><feGaussianBlur stdDeviation="2.1"/></filter>'+
  '<linearGradient id="alpSm" gradientUnits="userSpaceOnUse" x1="0" y1="60" x2="0" y2="0"><stop offset="0" style="stop-color:var(--a-smoke);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--a-smoke);stop-opacity:0"/></linearGradient>';
  CLOUDS.forEach(function(p,i){ d+='<g id="alpCl'+i+'"><path d="'+p+'" transform="translate(4 7)" style="fill:var(--a-clh)" opacity=".3" filter="url(#alpCb)"/><g filter="url(#alpCs)"><path d="'+p+'" fill="url(#alpCg)" clip-path="url(#alpCc)"/></g></g>'; });
  return d+'</defs></svg>'; }
function tile(svg){ return "url('data:image/svg+xml,"+encodeURIComponent(svg).replace(/'/g,"%27")+"')"; }
function rainTile(p,w,h,n,seed){ var r=rng(seed), s='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">';
  for(var i=0;i<n;i++){ var x=r()*w, y=r()*h, l=h*(.1+r()*.12); s+='<path d="M'+n1(x)+' '+n1(y)+'v'+n1(l)+(y+l>h?'M'+n1(x)+' '+n1(y-h)+'v'+n1(l):'')+'" stroke="'+p.rain+'" stroke-opacity="'+(.45+r()*.55).toFixed(2)+'" stroke-width="1.1" stroke-linecap="round"/>'; }
  return tile(s+'</svg>'); }
function snowTile(p,w,n,rmin,rmax,seed){ var r=rng(seed), sh=rgba(p.flk)[3]>0, s='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+w+'">'+
    (sh?'<defs><filter id="d" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy=".4" stdDeviation=".8" flood-color="'+p.flk+'"/></filter></defs><g filter="url(#d)">':'<g>');
  for(var i=0;i<n;i++){ var x=r()*w, y=r()*w, rr=rmin+r()*(rmax-rmin);
    for(var dx=-1;dx<=1;dx++) for(var dy=-1;dy<=1;dy++){ var cx=x+dx*w, cy=y+dy*w; if(cx<-rr-1||cx>w+rr+1||cy<-rr-1||cy>w+rr+1) continue;
      s+='<circle cx="'+n1(cx)+'" cy="'+n1(cy)+'" r="'+n1(rr)+'" fill="'+p.flake+'"/>'; } }
  return tile(s+'</g></svg>'); }

function build(st){
  var p=palette(st.theme,st.phase,st.ic,st.snowy,st.season), L=landscape(st.snowy,st.snowLine,st.season), ic=st.ic, night=st.phase==="night", r=rng(99), i, h='';
  var vars=""; for(var k in p) vars+="--a-"+k+":"+p[k]+";";
  var clouds=/cloud|rain|snow|storm|fog/.test(ic), sun=!night&&/sun|cloudSun/.test(ic), clear=/sun|cloudSun/.test(ic);
  h+='<div class="alp-sky"></div>';
  if(night&&!/rain|snow|storm|fog/.test(ic)){ for(var g=0;g<3;g++){ h+='<div class="alp-stars" style="animation-delay:-'+(g*1.7).toFixed(1)+'s;animation-duration:'+(4.6+g*1.3).toFixed(1)+'s">';
      for(i=0;i<(clear?6:3);i++) h+='<i style="left:'+(34+r()*64).toFixed(1)+'%;top:'+(5+r()*40).toFixed(1)+'%;--z:'+(1.2+r()*1.3).toFixed(1)+'px"></i>'; h+='</div>'; } }
  if(night&&!/rain|storm|fog/.test(ic)) h+='<div class="alp-astro alp-moon" data-x="1388" data-y="72"><i></i></div>';
  if(sun) h+='<div class="alp-astro alp-sun" data-sun="1"><i></i></div>';
  if(ic==="storm") h+='<div class="alp-flash"></div>';
  if(/cloud|rain|snow|storm/.test(ic)&&ic!=="cloudSun") h+='<div class="alp-deck"></div><div class="alp-deck d2"></div>';
  if(clouds||ic==="cloudSun"){ var n={cloudSun:2,cloud:5,rain:5,snow:5,fog:2,storm:5}[ic]||3;
    h+='<div class="alp-clouds">';
    for(i=0;i<n;i++){ var dur=Math.round(150+r()*110), ph=(i+.15+r()*.5)/n;
      h+='<div class="alp-cl" style="top:'+(7+((i*29)%22)+r()*5).toFixed(1)+'%;animation-duration:'+dur+'s;animation-delay:-'+Math.round(ph*dur)+'s;--p:'+ph.toFixed(2)+'">'+
        '<svg viewBox="0 0 240 90" style="width:clamp(150px,'+(20+r()*12).toFixed(1)+'%,400px);opacity:'+(.7+r()*.3).toFixed(2)+'"><use href="#alpCl'+(i%4)+'"/></svg></div>'; }
    h+='</div>'; }
  h+=L.back;
  /* Wolkenbänder hängen vor der mittleren Kette (bedeckt, Regen, Schnee, Nebel, Gewitter) */
  if(/^(cloud|rain|snow|fog|storm)$/.test(ic)) h+='<div class="alp-band" data-band="150" style="animation-duration:84s"><i></i><i></i></div><div class="alp-band b2" data-band="182" style="animation-duration:66s;animation-delay:-30s"><i></i><i></i></div>';
  h+=L.back2;
  if(st.snowLine) h+='<div class="alp-sll" data-sly="'+n1(yOf(st.snowLine))+'"></div>';
  if(ic==="fog") for(i=0;i<3;i++) h+='<div class="alp-fog" style="bottom:'+(8+i*12)+'%;animation-duration:'+(38+i*14)+'s;animation-delay:-'+(i*9)+'s"></div>';
  h+=L.front;
  h+='<div class="alp-smoke">'; L.smoke.forEach(function(c,j){ h+='<div class="alp-chim" data-x="'+n1(c[0])+'" data-y="'+n1(c[1])+'">';
    for(var w=0;w<2;w++) h+='<i style="animation-delay:-'+(w*3.6+j*1.3).toFixed(1)+'s"><svg viewBox="0 0 20 60"><path d="M10 59C6.5 50 13.5 42 10 33C6.5 24 13 15 9.5 3" fill="none" stroke="url(#alpSm)" stroke-width="2.6" stroke-linecap="round"/></svg></i>';
    h+='</div>'; }); h+='</div>';
  if(ic==="fog") h+='<div class="alp-fog alp-fog2" style="bottom:2%;animation-duration:46s"></div>';
  if(/rain|storm/.test(ic)) h+='<div class="alp-pr alp-rain"><i style="background-image:'+rainTile(p,90,150,9,3)+';--t:150px;animation-duration:.62s"></i><i style="background-image:'+rainTile(p,70,110,8,7)+';--t:110px;animation-duration:.85s;opacity:.55"></i></div>';
  if(ic==="snow") h+='<div class="alp-pr alp-snow">'+
    '<b style="animation-duration:5s"><i style="background-image:'+snowTile(p,150,9,.8,1.4,4)+';--t:150px;animation-duration:9s"></i></b>'+
    '<b style="animation-duration:6.5s;animation-delay:-2s"><i style="background-image:'+snowTile(p,190,7,1.3,2.1,8)+';--t:190px;animation-duration:7.5s"></i></b>'+
    '<b style="animation-duration:4.2s;animation-delay:-1s"><i style="background-image:'+snowTile(p,240,5,2,2.9,12)+';--t:240px;animation-duration:6s"></i></b></div>';
  if(st.snowLine) h+='<span class="alp-slb" data-y="'+n1(yOf(st.snowLine))+'">❄ '+String(Math.round(st.snowLine)).replace(/\B(?=(\d{3})+(?!\d))/g,".")+' m</span>';
  var el=document.createElement("div"); el.className="ag-alp ph-"+st.phase+" wx-"+ic; el.setAttribute("aria-hidden","true"); el.style.cssText=vars;
  el.innerHTML=cloudDefs()+h; return el;
}

/* ---------- Zustand ---------- */
function theme(){ var t=document.documentElement.getAttribute("data-theme"); if(t==="light") return "light"; if(t==="glas"||t==="dark") return t; return F.isDark&&F.isDark()?"dark":"light"; }
function state(){ var w=F.D&&F.D.weather||{}, ic=/^(sun|cloudSun|cloud|rain|snow|fog|storm)$/.test(w.icon)?w.icon:"cloud", s=sky(), sl=+w.snowLine;
  sl=isFinite(sl)&&sl>0?Math.round(sl/50)*50:0;
  var winter=[11,0,1,2].indexOf(s.month)>-1, snowy=winter||(ic==="snow"&&(!sl||sl<=1300));
  var season=[8,9,10].indexOf(s.month)>-1?"autumn":"other";
  return {theme:theme(),phase:s.phase,t:s.t,ic:ic,snowLine:sl,snowy:snowy,season:season}; }

/* ---------- Einhängen und Ausmessen ---------- */
var CUR={key:"",el:null}, RO=null, OBS=[], RAF=0, LASTFIT="";
function mount(){
  if(F.current!=="heute") return;
  var hero=document.querySelector("#main .ag-hero"); if(!hero) return;
  var st=state(), key=[st.theme,st.phase,st.ic,st.snowLine,st.snowy,st.season].join("|");
  if(CUR.key!==key||!CUR.el){ var old=CUR.el; CUR.el=build(st); CUR.key=key; CUR.st=st; LASTFIT=""; if(old&&old.parentNode) old.parentNode.removeChild(old); }
  CUR.st.t=st.t;
  hero.querySelectorAll(":scope>.ag-alp").forEach(function(x){ if(x!==CUR.el) x.parentNode.removeChild(x); });
  if(CUR.el.parentNode!==hero){ hero.insertBefore(CUR.el,hero.firstChild); LASTFIT=""; }
  hero.classList.add("has-alp");
  watch(hero); fit();
}
function watch(hero){ if(!window.ResizeObserver) return; var list=[hero,hero.parentNode];
  if(OBS.length===list.length&&OBS[0]===list[0]&&OBS[1]===list[1]) return;
  if(!RO) RO=new ResizeObserver(function(){ if(!RAF) RAF=requestAnimationFrame(function(){ RAF=0; fit(); }); });
  RO.disconnect(); list.forEach(function(e){ if(e) RO.observe(e); }); OBS=list; }
/* Fläche: links oben = Kopfbereich, unten bis zur Oberkante des nächsten Elements darunter („Für dich, jetzt“),
   rechts bis zur linken Kante der Spalte daneben („Heute“). Gestapelt (Handy/schmal): volle Breite. */
function fit(){
  var el=CUR.el, hero=el&&el.parentNode; if(!hero||!hero.isConnected) return;
  var hb=hero.getBoundingClientRect(), right=null, below=null, sib=hero.parentNode?hero.parentNode.children:[];
  for(var i=0;i<sib.length;i++){ var s=sib[i]; if(s===hero) continue; var b=s.getBoundingClientRect(); if(!b.width&&!b.height) continue;
    if(b.left>=hb.right-1&&b.top<hb.bottom-1&&b.bottom>hb.top+1){ if(right===null||b.left<right) right=b.left; }
    else if(b.top>=hb.bottom-1&&b.left<hb.right-1&&b.right>hb.left+1){ if(below===null||b.top<below) below=b.top; } }
  var W=Math.max(40,(right!==null?right:hb.right)-hb.left), H=Math.max(40,(below!==null?below:hb.bottom)-hb.top);
  /* Text-Ausdehnung (nur die Schrift, nicht die Blockbreite) für die Ausblendung */
  var rects=[], big=0, all=0, mob=W<620;
  ["ag-clock","ag-date","ag-wx","ag-greet"].forEach(function(c){ var e=hero.querySelector("."+c); if(!e) return; var rg=document.createRange(); rg.selectNodeContents(e);
    var rs=rg.getClientRects(); for(var j=0;j<rs.length;j++){ var q=rs[j]; if(q.width<1) continue; var x1=q.right-hb.left;
      rects.push([q.left-hb.left,q.top-hb.top,x1,q.bottom-hb.top]); all=Math.max(all,x1); if(c==="ag-clock"||c==="ag-date") big=Math.max(big,x1); } });
  var sig=[W,H,Math.round(all),Math.round(big),rects.length,rects.map(function(q){ return Math.round(q[1])+","+Math.round(q[2]); }).join(";")].join("|");
  var sc=Math.max(W/VW,H/VH);
  if(sig!==LASTFIT){ LASTFIT=sig;
    el.style.width=W.toFixed(1)+"px"; el.style.height=H.toFixed(1)+"px"; el.style.setProperty("--sc",sc.toFixed(4)); el.classList.toggle("alp-mob",mob);
    var m=maskSvg(W,H,big||all,rects,mob,CUR.st.theme); el.style.webkitMaskImage=m; el.style.maskImage=m; }
  /* Sonne, Mond, Rauch und Schneefallgrenze an Bildkoordinaten ausrichten (Bild ist rechts unten verankert) */
  var P=function(x,y){ return [W-(VW-x)*sc,H-(VH-y)*sc]; };
  var ux=Math.min(1530,VW-(W-((big||all)+70))/sc);   // Sonne/Mond nie hinter der Uhr
  el.querySelectorAll("[data-x]").forEach(function(e){ var x=+e.getAttribute("data-x"); if(e.classList.contains("alp-moon")) x=Math.max(x,ux);
    var q=P(x,+e.getAttribute("data-y")); e.style.transform="translate("+q[0].toFixed(1)+"px,"+q[1].toFixed(1)+"px)"; });
  var su=el.querySelector(".alp-sun"); if(su){ var t=CUR.st.t, x0=Math.max(1300,ux), q=P(x0+(1540-x0)*t,100-46*Math.sin(Math.PI*t)); su.style.transform="translate("+q[0].toFixed(1)+"px,"+q[1].toFixed(1)+"px)"; }
  var sl=el.querySelector(".alp-slb"); if(sl){ sl.style.top=(P(0,+sl.getAttribute("data-y"))[1]).toFixed(1)+"px"; }
  /* Schneefallgrenze: gestrichelt erst dort, wo die Kulisse voll sichtbar ist (nie als Verlängerung der Textzeile) */
  var sll=el.querySelector(".alp-sll"); if(sll){ sll.style.top=(P(0,+sll.getAttribute("data-sly"))[1]).toFixed(1)+"px"; var sx=Math.max(fadeEnd(W,big||all,mob)-70,all+60); sll.style.left=sx.toFixed(1)+"px"; sll.style.display=W-sx<150?"none":""; }
  el.querySelectorAll("[data-band]").forEach(function(e){ e.style.top=(P(0,+e.getAttribute("data-band"))[1]).toFixed(1)+"px"; });
}
/* Maske: oben weich ins Freie, links (hinter Uhr/Datum) durchsichtig, zur Mitte hin voll; um jede Textzeile weich ausgespart */
function fadeStart(W,R){ return Math.max(0,Math.min(R-30,W*.7)); }
function fadeEnd(W,R,mob){ var a=fadeStart(W,R); return Math.min(W*.95,Math.max(a+120,R+(mob?100:300))); }
function maskSvg(W,H,R,rects,mob,th){
  var a=fadeStart(W,R), b=fadeEnd(W,R,mob), st="", sv="";
  for(var i=0;i<=12;i++){ var t=i/12, e=t*t*t*(t*(t*6-15)+10); st+='<stop offset="'+((a+(b-a)*t)/W).toFixed(4)+'" stop-color="#fff" stop-opacity="'+e.toFixed(3)+'"/>'; }
  var pad=mob?8:14, blur=mob?9:16, k="";
  rects.forEach(function(q){ k+='<rect x="'+(q[0]-pad).toFixed(1)+'" y="'+(q[1]-pad*.6).toFixed(1)+'" width="'+(q[2]-q[0]+pad*2).toFixed(1)+'" height="'+(q[3]-q[1]+pad*1.2).toFixed(1)+'" rx="'+pad+'"/>'; });
  /* oben weich ins Freie: im Glas länger (Übergang ins Foto), im Hellen kürzer */
  var vf=th==="light"?Math.min(.16,44/H):Math.min(.2,56/H);
  for(i=0;i<=8;i++){ var u=i/8, ev=u*u*u*(u*(u*6-15)+10); sv+='<stop offset="'+(u*vf).toFixed(4)+'" stop-color="#fff" stop-opacity="'+ev.toFixed(3)+'"/>'; }
  var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+Math.round(W)+'" height="'+Math.round(H)+'" viewBox="0 0 '+W.toFixed(1)+' '+H.toFixed(1)+'" preserveAspectRatio="none"><defs>'+
    '<linearGradient id="h" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="'+W.toFixed(1)+'" y2="0">'+st+'</linearGradient>'+
    '<linearGradient id="v" x1="0" y1="0" x2="0" y2="1">'+sv+'</linearGradient>'+
    '<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="'+blur+'"/></filter>'+
    '<mask id="mh" maskUnits="userSpaceOnUse" x="0" y="0" width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'"><rect width="100%" height="100%" fill="url(#h)"/></mask>'+
    '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'"><rect width="100%" height="100%" fill="url(#v)" mask="url(#mh)"/><g filter="url(#b)" fill="#000" opacity=".74">'+k+'</g></mask></defs>'+
    '<rect width="100%" height="100%" fill="#000" mask="url(#m)"/></svg>';
  return tile(svg);
}

var main=document.getElementById("main");
if(main&&window.MutationObserver) new MutationObserver(function(){ mount(); }).observe(main,{childList:true,subtree:false});
if(F.onData) F.onData(function(){ setTimeout(mount,0); });
document.addEventListener("fsc-theme",function(){ setTimeout(mount,0); });
setInterval(mount,5*60*1000);   // Tageszeit, Sonnenstand
setTimeout(mount,600);


F.css(
".ag-hero.has-alp{position:relative;isolation:isolate}.ag-hero.has-alp>*:not(.ag-alp){position:relative;z-index:1}"+
".ag-alp{position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:hidden;contain:strict;text-shadow:none;"+
  "-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}"+
".ag-alp>*{position:absolute}.alp-defs{width:0;height:0;overflow:hidden}"+
".alp-sky{inset:0;background:linear-gradient(180deg,var(--a-s1) 0%,var(--a-s2) 30%,var(--a-s3) 58%)}"+
".alp-back,.alp-front{left:0;top:0;width:100%;height:100%;display:block}"+
/* Landschaft */
".ag-alp .k-far{fill:url(#alpGf)}.ag-alp .k-mid{fill:url(#alpGm)}.ag-alp .k-near{fill:url(#alpGn)}.ag-alp .k-g{fill:url(#alpGg)}.ag-alp .k-haze{fill:url(#alpGh)}"+
".ag-alp .k-fs{fill:var(--a-fs)}.ag-alp .k-fss{fill:var(--a-fss)}.ag-alp .k-fsh{fill:url(#alpGsf)}.ag-alp .k-ms{fill:var(--a-ms)}.ag-alp .k-mss{fill:var(--a-mss)}.ag-alp .k-msh{fill:url(#alpGsm)}.ag-alp .k-mli{fill:url(#alpGlm)}"+
".ag-alp .k-frost{fill:var(--a-ms);opacity:.42}.ag-alp .k-frost2{fill:var(--a-ms);opacity:.3}"+
".ag-alp .k-t1{fill:var(--a-t1)}.ag-alp .k-t2{fill:var(--a-t2)}.ag-alp .k-lx{fill:var(--a-lx)}.ag-alp .k-trunk{fill:var(--a-wdk)}"+
".ag-alp .k-rv{fill:none;stroke:var(--a-rv);opacity:.8}.ag-alp .k-pa{fill:none;stroke:var(--a-pa);stroke-linecap:round}.ag-alp .k-fn{fill:none;stroke:var(--a-fn);opacity:.5}"+
".alp-mob .alp-slb,.alp-mob .alp-sll{display:none!important}"+
".alp-sll{right:0;height:0;border-top:1px dashed var(--a-sl);-webkit-mask-image:linear-gradient(90deg,transparent,#000 70px);mask-image:linear-gradient(90deg,transparent,#000 70px)}"+
/* Dorf */
".ag-alp .k-pl,.ag-alp .k-chu{fill:var(--a-pl)}.ag-alp .k-chu{fill:var(--a-ch)}.ag-alp .k-pls{fill:var(--a-pls)}.ag-alp .k-wd{fill:var(--a-wd)}.ag-alp .k-wdk{fill:var(--a-wdk)}"+
".ag-alp .k-rf{fill:var(--a-rf)}.ag-alp .k-rfs{fill:none;stroke:var(--a-rf)}.ag-alp .k-rfl{fill:none;stroke:var(--a-rfl)}.ag-alp .k-rs{fill:none;stroke:var(--a-ms);stroke-linecap:round}.ag-alp .k-rsf{fill:var(--a-ms)}"+
".ag-alp .k-win{fill:var(--a-win)}.ag-alp .k-wino{fill:var(--a-wino)}.ag-alp .k-sh{fill:var(--a-shut)}.ag-alp .k-sp{fill:var(--a-sp)}.ag-alp .k-spl{fill:var(--a-spl)}.ag-alp .k-spk{fill:none;stroke:var(--a-sp)}"+
".ag-alp .k-glowg{opacity:var(--a-glow)}.ag-alp .k-gw{fill:var(--a-glowc)}"+
/* Sonne, Mond, Sterne – Position setzt fit() */
".alp-astro{left:0;top:0;width:0;height:0}"+
".alp-sun>i{position:absolute;left:calc(var(--sc)*-100px);top:calc(var(--sc)*-100px);width:calc(var(--sc)*200px);height:calc(var(--sc)*200px);border-radius:50%;"+
  "background:radial-gradient(circle,var(--a-sun) 0 7%,var(--a-sung) 10%,transparent 62%)}"+
".alp-sun:after{content:'';position:absolute;left:calc(var(--sc)*-13px);top:calc(var(--sc)*-13px);width:calc(var(--sc)*26px);height:calc(var(--sc)*26px);border-radius:50%;background:var(--a-sun);box-shadow:0 0 calc(var(--sc)*18px) var(--a-sung)}"+
".alp-moon>i{position:absolute;left:calc(var(--sc)*-12px);top:calc(var(--sc)*-12px);width:calc(var(--sc)*24px);height:calc(var(--sc)*24px);border-radius:50%;"+
  "background:radial-gradient(circle at 38% 36%,var(--a-moon) 0 55%,color-mix(in srgb,var(--a-moon) 82%,#8a93a6) 100%);"+
  "box-shadow:0 0 calc(var(--sc)*16px) color-mix(in srgb,var(--a-moon) 55%,transparent),0 0 calc(var(--sc)*60px) color-mix(in srgb,var(--a-moon) 25%,transparent)}"+
".alp-moon>i:after{content:'';position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 70% 40%,transparent 0 47%,rgba(20,30,50,.18) 50%,rgba(20,30,50,.32) 70%)}"+
".alp-stars{inset:0;animation:alpTw 5s ease-in-out infinite}.alp-stars>i{position:absolute;width:var(--z);height:var(--z);border-radius:50%;background:var(--a-star);box-shadow:0 0 4px var(--a-star)}"+
/* Wolken ziehen über die ganze Breite, hinter den Gipfeln */
".alp-clouds{inset:0}.alp-cl{left:0;width:100%;height:0;transform:translateX(calc(var(--p)*(100% + 420px)));animation:alpDrift 200s linear infinite}"+
".alp-cl>svg{position:absolute;right:100%;top:0;height:auto;aspect-ratio:240/90;overflow:visible}"+
".alp-flash{inset:0;opacity:0;background:radial-gradient(ellipse at 72% 18%,rgba(255,255,255,.95),rgba(225,232,255,.45) 38%,transparent 72%);animation:alpFlash 11s linear infinite}"+
".alp-fog{left:-30%;width:160%;height:26%;background:radial-gradient(ellipse 50% 50% at 50% 50%,var(--a-fog),transparent 72%);animation:alpFog 40s ease-in-out infinite alternate}"+
".alp-fog2{height:18%;opacity:.8}"+
/* Wolkenbänder vor der mittleren Kette */
".alp-band{left:-30%;width:160%;height:calc(var(--sc)*46px);margin-top:calc(var(--sc)*-23px);animation:alpFog 80s ease-in-out infinite alternate}"+
".alp-band>i{position:absolute;top:0;left:10%;width:52%;height:100%;background:radial-gradient(closest-side,var(--a-fog),transparent)}"+
".alp-band>i+i{left:44%;top:18%;width:46%;height:82%;opacity:.85}.alp-band.b2{opacity:.7}.alp-band.b2>i{left:24%}.alp-band.b2>i+i{left:58%}"+
":root[data-theme='light'] .alp-band{opacity:.72}:root[data-theme='light'] .alp-band.b2{opacity:.5}:root:not([data-theme='light']) .alp-band{opacity:.75}:root:not([data-theme='light']) .alp-band.b2{opacity:.5}"+
".alp-deck{left:-25%;width:150%;top:-14%;height:46%;opacity:.75;background:radial-gradient(ellipse 50% 50% at 50% 50%,var(--a-cl2),transparent 70%);animation:alpFog 90s ease-in-out infinite alternate}"+
":root:not([data-theme='light']) .alp-deck{opacity:.32}:root:not([data-theme='light']) .alp-deck.d2{opacity:.22}"+
".alp-deck.d2{top:4%;height:30%;left:-5%;width:120%;opacity:.5;background:radial-gradient(ellipse 50% 50% at 50% 50%,var(--a-cl1),transparent 70%);animation-duration:70s;animation-direction:alternate-reverse}"+
/* Rauch aus den Kaminen */
".alp-smoke{inset:0}.alp-chim{left:0;top:0;width:0;height:0}"+
".alp-chim>i{position:absolute;left:calc(var(--sc)*-6px);bottom:0;width:calc(var(--sc)*12px);height:calc(var(--sc)*38px);transform-origin:50% 100%;opacity:0;animation:alpSmoke 7.2s ease-out infinite}"+
".alp-chim>i>svg{display:block;width:100%;height:100%;overflow:visible}"+
/* Niederschlag: Kacheln, die sich nur verschieben */
".alp-pr{inset:-20%;pointer-events:none}.alp-rain{transform:rotate(11deg)}"+
".alp-pr i{position:absolute;left:0;right:0;top:calc(var(--t)*-1);bottom:0;animation:alpFall 1s linear infinite}"+
".alp-snow>b{position:absolute;inset:0;animation:alpSway 5s ease-in-out infinite alternate}"+
/* Schneefallgrenze */
".alp-slb{right:12px;margin-top:-22px;padding:2px 8px;border-radius:99px;font:600 11px/1.45 var(--f-body);letter-spacing:.02em;white-space:nowrap;"+
  "color:var(--ink-2);background:color-mix(in srgb,var(--panel-solid,#fff) 70%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}"+
":root[data-theme='glas'] .alp-slb,:root[data-theme='dark'] .alp-slb{color:#eef3fa;background:rgba(10,18,30,.42)}"+
"@keyframes alpTw{0%,100%{opacity:.35}50%{opacity:1}}"+
"@keyframes alpDrift{from{transform:translateX(0)}to{transform:translateX(calc(100% + 420px))}}"+
"@keyframes alpFlash{0%,86%,100%{opacity:0}87%{opacity:.85}88%{opacity:.1}89.5%{opacity:.6}92%{opacity:0}}"+
"@keyframes alpFog{from{transform:translateX(-6%)}to{transform:translateX(6%)}}"+
"@keyframes alpSmoke{0%{opacity:0;transform:translateY(0) scale(.7,.6)}18%{opacity:.85}70%{opacity:.35}100%{opacity:0;transform:translate(calc(var(--sc)*-7px),calc(var(--sc)*-22px)) scale(1.6,1.25)}}"+
"@keyframes alpFall{from{transform:translateY(0)}to{transform:translateY(var(--t))}}"+
"@keyframes alpSway{from{transform:translateX(-10px)}to{transform:translateX(10px)}}"+
"@media (prefers-reduced-motion:reduce){.ag-alp *{animation:none!important}.alp-chim>i{opacity:.6}.alp-chim>i+i{opacity:0}.alp-stars{opacity:.8}}"
);
})();
