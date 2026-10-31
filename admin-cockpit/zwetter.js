/* Alpenkulisse auf „Heute“: gezeichnete Montafon-Landschaft (eine Bergkette wie in Gaschurn, mit Taldunst und Schnee
   auf den hohen Gipfeln, Wald, Talwiese, Dorf mit Kirche) im ganzen Kopfbereich – oben links bis bündig an „Für dich, jetzt“
   (unten) und an die rechte Spalte „Heute“ (rechts). Hinter Uhr, Datum und Text blendet sie weich aus.
   Auf breiten Bildschirmen wächst das Dorf nach links: Gemeindeamt mit Fahne, Gasthof, Feuerwehr, SPAR, Haltestelle mit
   Postbus, Holzbrücke, Gondelbahn (Schneise hinauf zur Bergstation am Kamm) und verstreute Höfe – nur so weit, wie neben
   Uhr, Text und Schnellknöpfen Platz ist. Autos und Postbus fahren auf der Dorfstraße, Gondeln am Seil (nur CSS-transform,
   läuft im Compositor; nachts stehen die Gondeln, Autos fahren mit Licht).
   Wetter aus F.D.weather (Sonne, Wolken, Regen, Schnee, Nebel, Gewitter, Schneefallgrenze) und Tageszeit nach dem echten
   Sonnenstand über Gaschurn (Nacht, Dämmerung, Morgen-/Abendlicht, Tag mit wandernder Sonne). Alle Farben als CSS-Variablen je Darstellung (Hell/Alpenglas/Dunkel).
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
/* knappe Pfad-Schreibweise für sehr viele kleine Formen (Schneehauben): Zahl mit Trenner, ohne führende Null */
function cn(a){ var t=String(n1(a)).replace(/^(-?)0\./,"$1."); return t.charAt(0)==="-"?t:" "+t; }
function cpoly(pts){ var x=n1(pts[0][0]), y=n1(pts[0][1]), d='M'+x+cn(y)+'l', i;
  for(i=1;i<pts.length;i++){ var a=n1(pts[i][0]), b=n1(pts[i][1]); d+=(i>1?cn(a-x):String(n1(a-x)).replace(/^(-?)0\./,"$1."))+cn(b-y); x=a; y=b; } return d+'z'; }
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
    day:{s1:"#b9d1ec",s2:"#d5e3f2",s3:"#ebf0f6",hz:"#cad7e7",
      m1:"#7089ab",m2:"#a8bcd2",ms:"#fcfdff",mss:"#cbd8e8",msh:"rgba(30,52,92,.2)",n1:"#93a99a",n2:"#5f7e6d",t1:"#4b735f",t2:"#2c5142",lx:"#c99f45",
      g1:"#c7d6a5",g2:"#9cb87f",pl:"#fbf9f4",pls:"#e0dbd0",wd:"#704630",wdk:"#4f321f",rf:"#4a4f58",rfl:"#7a818c",win:"#3b4350",wino:"#3b4350",glowc:"#ffcf7a",glow:"0",
      shut:"#5c7a54",ch:"#fefdf9",sp:"#4b5a66",spl:"#738390",pa:"#ece3cf",rv:"#a6c4db",fn:"#8b6e55",sun:"#fff8e3",sung:"rgba(255,206,120,.5)",moon:"#f6f1df",
      cl1:"#ffffff",cl2:"#d6dfeb",fog:"rgba(255,255,255,.85)",rain:"rgba(62,92,135,.55)",flake:"#ffffff",flk:"rgba(45,65,100,.7)",smoke:"rgba(120,130,146,.55)",sl:"rgba(30,50,85,.55)",star:"#ffffff"},
    dusk:{s1:"#9db0d3",s2:"#dcc7d2",s3:"#f6d8bf",hz:"#d9c4cc",
      m1:"#85839f",m2:"#b4a6b7",ms:"#ffe9e0",mss:"#c4b6cb",msh:"rgba(50,38,85,.24)",n1:"#8a978a",n2:"#5d7166",t1:"#43604f",t2:"#2a4536",lx:"#c08f42",
      g1:"#bcc194",g2:"#94a174",pl:"#f9efe5",pls:"#d8c8bb",wd:"#6e4127",wdk:"#4c2c18",rf:"#46444e",rfl:"#6f6b78",win:"#ffcf7a",wino:"#4a4450",glowc:"#ffc56a",glow:".75",
      shut:"#56704f",ch:"#fbf3ea",sp:"#46485a",spl:"#6a6a80",pa:"#e8d6c0",rv:"#c3b6cf",fn:"#7a5e4c",sun:"#fff0d2",sung:"rgba(255,170,110,.55)",moon:"#f8f0dc",
      cl1:"#fff3ec",cl2:"#d9c3cf",fog:"rgba(255,244,238,.8)",rain:"rgba(80,80,125,.5)",flake:"#ffffff",flk:"rgba(90,80,120,.3)",smoke:"rgba(125,115,140,.55)",sl:"rgba(55,40,85,.55)",star:"#ffffff"},
    night:{s1:"#7286ad",s2:"#98a7c3",s3:"#c3cbdb",hz:"#a5b2c9",
      m1:"#62749a",m2:"#8695b2",ms:"#eef2f9",mss:"#a9b5cb",msh:"rgba(18,28,60,.26)",n1:"#6c7c92",n2:"#4a596f",t1:"#37485a",t2:"#263545",lx:"#6f6c5c",
      g1:"#8592a6",g2:"#66748a",pl:"#e2e6ee",pls:"#b4bbc8",wd:"#4b3a33",wdk:"#33271f",rf:"#323946",rfl:"#4c5462",win:"#ffd27e",wino:"#3b4352",glowc:"#ffc35e",glow:"1",
      shut:"#465a52",ch:"#e8ebf1",sp:"#36404d",spl:"#4d5866",pa:"#adb5c3",rv:"#9fb1cb",fn:"#55504e",sun:"#fff",sung:"rgba(255,255,255,0)",moon:"#fdf8e6",
      cl1:"#e9edf5",cl2:"#a9b4c8",fog:"rgba(235,240,248,.7)",rain:"rgba(40,55,90,.5)",flake:"#ffffff",flk:"rgba(50,65,100,.3)",smoke:"rgba(225,230,240,.6)",sl:"rgba(20,30,60,.55)",star:"#ffffff"}
  },
  dark:{
    day:{s1:"rgba(66,112,172,.8)",s2:"rgba(104,150,204,.88)",s3:"rgba(164,195,228,.92)",hz:"#62789a",
      m1:"#4e6382",m2:"#3c506c",ms:"#f0f4fa",mss:"#a8b8cd",msh:"rgba(6,12,28,.3)",n1:"#3c5250",n2:"#283b3c",t1:"#21403a",t2:"#142c26",lx:"#a8873c",
      g1:"#46634f",g2:"#2f4739",pl:"#eeebe4",pls:"#bdb8ae",wd:"#5f3d26",wdk:"#3f2716",rf:"#2b3038",rfl:"#4a515d",win:"#1d232b",wino:"#1d232b",glowc:"#ffc96e",glow:"0",
      shut:"#465f44",ch:"#f3f1eb",sp:"#323d49",spl:"#4d5a68",pa:"#a39882",rv:"#7091b0",fn:"#6d5642",sun:"#fffbea",sung:"rgba(255,196,110,.55)",moon:"#f6f1df",
      cl1:"rgba(238,243,250,.92)",cl2:"rgba(165,180,202,.88)",fog:"rgba(210,222,238,.38)",rain:"rgba(205,222,245,.55)",flake:"#ffffff",flk:"rgba(0,0,0,0)",smoke:"rgba(220,226,234,.5)",sl:"rgba(235,242,252,.6)",star:"#ffffff"},
    dusk:{s1:"rgba(60,70,125,.12)",s2:"rgba(150,110,150,.24)",s3:"rgba(240,160,120,.34)",hz:"#574f72",
      m1:"#4b4869",m2:"#3a3854",ms:"#f8dbd0",mss:"#a391ab",msh:"rgba(15,8,35,.3)",n1:"#36403f",n2:"#262f31",t1:"#1f3530",t2:"#132520",lx:"#9c7a3c",
      g1:"#3b4a3c",g2:"#29362d",pl:"#e6dbd0",pls:"#b2a598",wd:"#523422",wdk:"#372214",rf:"#26262e",rfl:"#45444f",win:"#ffc670",wino:"#2a2730",glowc:"#ffbe62",glow:".8",
      shut:"#3f543d",ch:"#ece2d8",sp:"#2e2e3c",spl:"#484859",pa:"#8f7f73",rv:"#8a7f9f",fn:"#5e4a3c",sun:"#ffe9c8",sung:"rgba(255,160,110,.5)",moon:"#f8f0dc",
      cl1:"rgba(250,225,215,.88)",cl2:"rgba(150,125,150,.85)",fog:"rgba(230,205,200,.3)",rain:"rgba(215,205,235,.5)",flake:"#ffffff",flk:"rgba(0,0,0,0)",smoke:"rgba(220,210,220,.45)",sl:"rgba(250,235,235,.6)",star:"#ffffff"},
    night:{s1:"rgba(6,12,26,.2)",s2:"rgba(14,24,46,.32)",s3:"rgba(32,48,78,.42)",hz:"#2b3a57",
      m1:"#26354f",m2:"#1d2a40",ms:"#c8d4e6",mss:"#7c8ca9",msh:"rgba(0,4,14,.32)",n1:"#1d2a35",n2:"#16212b",t1:"#13241f",t2:"#0b1714",lx:"#4f4a34",
      g1:"#1f2c2b",g2:"#162120",pl:"#a0a7b2",pls:"#757c88",wd:"#2f2219",wdk:"#20160f",rf:"#13171e",rfl:"#252b35",win:"#ffcb6a",wino:"#1b2029",glowc:"#ffbf55",glow:"1",
      shut:"#2b3a33",ch:"#aeb5c0",sp:"#1c232c",spl:"#2b333e",pa:"#5f6672",rv:"#4f6383",fn:"#3b342f",sun:"#fff",sung:"rgba(255,255,255,0)",moon:"#fdf8e6",
      cl1:"rgba(150,165,190,.55)",cl2:"rgba(70,85,110,.6)",fog:"rgba(170,185,210,.22)",rain:"rgba(180,200,230,.45)",flake:"#ffffff",flk:"rgba(0,0,0,0)",smoke:"rgba(190,200,215,.35)",sl:"rgba(220,230,250,.55)",star:"#ffffff"}
  }
};
var LAND=["hz","m1","m2","ms","mss","n1","n2","t1","t2","g1","g2","lx"];
/* Farbakzente im Dorf (SPAR, Feuerwehr, Fahne, Gondeln, Postbus, Lärchenfassaden …): Tag-Grundton, abends/nachts abgedunkelt */
var ACC={spg:"#15884a",spr:"#d8262e",fw:"#c42a2e",fwl:"#951c22",flr:"#cf2234",cab:"#cc3a2e",bus:"#ebb926",busd:"#a3801a",lar:"#b98f62",lrl:"#8a6643",
  car1:"#7d92ad",car2:"#9b4d3e",car3:"#e2dfd8",car4:"#3f4a5a",flw:"#dc4650",mtl:"#69727e",tyre:"#2b2f35",gold:"#c9a24a",blu:"#4f7fdc",hh:"#f3c51b",hg:"#2a8a3c",txt:"#ffffff",
  /* Montafoner Braunvieh: graubraun, Kopf und Beine dunkler, helles Flotzmaul, helle Hörner */
  cow:"#7f5d45",cowd:"#523b2c",cowm:"#ebe1d1",horn:"#efe7d6"};
var LIT={spg:1,spr:1,txt:1,hh:1,hg:1};
/* Wetter verändert das Licht: bedeckt = entsättigt und dunstig, Gewitter = dunkler, Nebel = die Kette verschwindet im Grau */
/* sv = Schneebedeckung (0–1) der oberen Talwiese (u) und des Talbodens mit dem Dorf (v) */
/* Hell: Nacht und Dämmerung sichtbar dunkler (Wunsch Simon 29.10.2026 – „es wird nicht dunkel“): Himmel, Berge, Wald und Wiese Richtung Nachtblau */
var LNIGHT={night:["#111a30",.55],dusk:["#2a2440",.22]};
function palette(theme,phase,ic,sv,season){
  var p=Object.assign({},PAL[theme==="light"?"light":"dark"][phase]), ln=theme==="light"&&LNIGHT[phase];
  if(ln) ["s1","s2","s3","hz","m1","m2","ms","mss","n1","n2","t1","t2","g1","g2","lx","pl","pls","wd","wdk","rf","rfl","pa","rv","fn","shut","ch","sp","spl","cl1","cl2"].forEach(function(n){ if(p[n]) p[n]=mix(p[n],ln[0],n==="ms"||n==="mss"?ln[1]*.7:ln[1]); });
  var k={cloud:.45,rain:.55,snow:.42,fog:.5,storm:.62,cloudSun:.12}[ic]||0, dk=ic==="storm"?.16:ic==="rain"?.06:0;
  var tone=phase==="night"?(theme==="light"?["#3d4864",.42]:["#0d1422",.62]):phase==="dusk"?["#6e5468",.2]:null;
  for(var a in ACC){ var c=ACC[a]; if(tone) c=mix(c,tone[0],LIT[a]&&phase==="night"?tone[1]*.3:tone[1]); if(k) c=grey(c,k*.5,dk*.8); p[a]=c; }
  if(k){
    LAND.forEach(function(n){ p[n]=grey(p[n],k,dk); });
    ["s1","s2","s3"].forEach(function(n){ p[n]=grey(p[n],k*1.15>1?1:k*1.15,dk*1.2); });
    /* nur eine Kette: bei trübem Wetter rückt sie in den Dunst, bei Nebel verschwindet sie fast */
    var hz=ic==="fog"?.42:ic==="snow"?.24:k*.26;
    ["m1","m2","mss"].forEach(function(n){ p[n]=mix(p[n],theme==="light"?p.s3:p.hz,hz); });
    if(ic==="fog") p.ms=mix(p.ms,theme==="light"?p.s3:p.hz,.3);
    /* Hell: bei Niederschlag dunklerer, grauer Himmel – sonst sieht man Schnee und Regen nicht */
    if(theme==="light"&&/rain|snow|storm/.test(ic)){ var dg={rain:["#a2acba","#b9c1cc","#d3d8df",.5],snow:["#9eaabb","#b5bfcc","#d0d6de",.55],storm:["#77818f","#959eab","#bcc2ca",.62]}[ic];
      p.s1=mix(p.s1,dg[0],dg[3]); p.s2=mix(p.s2,dg[1],dg[3]); p.s3=mix(p.s3,dg[2],dg[3]*.8); }
    if(/rain|storm/.test(ic)){ p.cl1=grey(p.cl1,.5,ic==="storm"?.3:.12); p.cl2=grey(p.cl2,.5,ic==="storm"?.38:.2); }
    else if(ic!=="cloudSun"){ p.cl2=grey(p.cl2,.4,.04); }
  }
  if(season!=="autumn") p.lx=mix(p.t1,p.n1,.35);
  /* Schneisen-Grün vor dem Schnee festhalten (die Schneise wird oberhalb der Grenze eigens weiß überzogen) */
  p.glc=mix(p.g1,p.n1,.4);
  /* Talwiese: oben (etwas höher) zuerst weiß, unten beim Dorf zuletzt; dazwischen nur angezuckert */
  if(sv.u) p.g1=mix(p.g1,p.ms,sv.u);
  if(sv.v) p.g2=mix(p.g2,p.mss,sv.v);
  /* verschneites Dorf: geräumte Straße grau, Bach dunkel gegen den Schnee */
  if(sv.v>=.5){ p.pa=mix(p.pa,p.rfl,theme==="light"?.5:.35); p.rv=mix(p.rv,p.n2,.5); }
  /* Schnee im Schatten des Waldes und am Vorberg (etwas bläulicher als auf freier Fläche) */
  p.sng=mix(p.ms,p.mss,.35);
  p.clh=theme==="light"?p.cl2:p.cl1;
  p.lit=phase==="night"?"rgba(200,215,240,.06)":phase==="dusk"?"rgba(255,190,160,.16)":k>.3?"rgba(255,255,255,.03)":"rgba(255,250,235,.2)";
  /* bedeckt: diffuses Licht – Licht- und Schattenseiten nur noch angedeutet */
  if(k>.3){ var v=rgba(p.msh); v[3]*=.5; p.msh=css(v); }
  /* Glas (Geschäft, Bus, Gondel): tagsüber spiegelt es den Himmel, abends und nachts innen beleuchtet */
  p.gls=phase==="day"?mix(p.wino,p.s2,.55):mix(p.win,"#ffffff",.3);
  p.refl=phase==="day"?"rgba(255,255,255,"+(k>.3?.22:.36)+")":phase==="dusk"?"rgba(255,240,230,.12)":"rgba(255,255,255,0)";
  p.shelf=phase==="day"?mix(p.wino,p.s2,.25):mix(p.win,p.wdk,.45);
  /* Fenster von Bus und Gondelkabinen: tagsüber wie Glas, abends und nachts dunkel (kein Innenlicht) */
  p.glv=phase==="day"?p.gls:mix(p.wino,p.s2,phase==="dusk"?.22:.08);
  /* Gondelseile: dunkler Kern, heller Saum */
  p.cblc=mix(p.mtl,p.tyre,.45);
  p.cblh=theme==="light"?(phase==="night"?"rgba(225,232,245,.3)":"rgba(255,255,255,.5)"):"rgba(225,235,250,"+(phase==="night"?.2:.3)+")";
  return p;
}

/* ---------- Tageszeit nach dem echten Sonnenstand über Gaschurn (Wunsch Simon 29.10.2026; vorher Monatstabelle) ----------
   Sonnenhöhe e in Grad: Nacht unter −4° (im Tal ist es dann dunkel), Dämmerung bis +2° (Sonne hinter den Bergen, Himmel noch hell),
   Morgen- bzw. Abendlicht bis +12° (warm = 0–1, Farben Richtung Dämmerung), darüber Tag – Vormittag, Mittag und Nachmittag zeigt
   die Sonne selbst: t = ihr Weg zwischen Auf- und Untergang (über den Bergen, e = 2°), Höhe am Himmel nach e. */
var LAT=47.006, LON=10.03, HZ=2;
function sunElev(ms){ var r=Math.PI/180, n=ms/864e5+2440587.5-2451545, L=(280.46+.9856474*n)%360, g=((357.528+.9856003*n)%360)*r,
  lam=(L+1.915*Math.sin(g)+.02*Math.sin(2*g))*r, eps=(23.439-4e-7*n)*r, ra=Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam)), dec=Math.asin(Math.sin(eps)*Math.sin(lam)),
  gmst=((18.697374558+24.06570982441908*n)%24+24)%24, ha=(gmst*15+LON)*r-ra;
  return Math.asin(Math.sin(LAT*r)*Math.sin(dec)+Math.cos(LAT*r)*Math.cos(dec)*Math.cos(ha))/r; }
function viennaMonth(){ try{ return +new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Vienna",month:"numeric"}).format(new Date())-1; }catch(e){ return new Date().getMonth(); } }
function sky(){ var now=Date.now(), e=sunElev(now), ph=e<-4?"night":e<HZ?"dusk":"day", warm=ph==="day"&&e<12?(12-e)/(12-HZ):0;
  /* Auf- und Untergang hinter den Bergen: UTC-Tag im 10-Minuten-Raster (Sonnenaufgang im Montafon liegt immer nach 0 Uhr UTC) */
  var d0=now-now%864e5, up=null, dn=null, pv=sunElev(d0);
  for(var m=10;m<=1440;m+=10){ var x=sunElev(d0+m*6e4); if(pv<HZ&&x>=HZ&&up===null) up=m; if(pv>=HZ&&x<HZ) dn=m; pv=x; }
  var tm=(now-d0)/6e4, t=up!==null&&dn!==null&&dn>up?Math.max(0,Math.min(1,(tm-up)/(dn-up))):.5;
  return {phase:ph,warm:Math.round(warm*4)/4,e:e,t:t,month:viennaMonth()}; }

/* ---------- Landschaft (einmal berechnet, danach aus dem Speicher) ---------- */
/* eine Bergkette (in Gaschurn sieht man nur eine): wenige markante Gipfel, über dem Dorf der höchste */
var MTN=[[0,160],[50,146],[110,156],[190,120],[250,136],[310,128],[370,148],[440,112],[500,130],[560,150],[620,140],[680,154],[760,118],[820,134],[890,106],[950,138],[1010,152],[1080,120],[1130,98],[1190,116],[1250,140],[1300,132],[1350,108],[1410,88],[1470,110],[1520,134],[1570,120],[1600,128]];
var NEAR=[[0,214],[90,200],[200,208],[320,190],[430,204],[540,196],[640,212],[760,198],[860,206],[960,192],[1060,210],[1140,220],[1220,206],[1300,200],[1380,206],[1460,194],[1540,202],[1600,194]];
var MEAD=[[0,262],[200,258],[420,264],[640,256],[860,262],[1040,254],[1180,258],[1300,251],[1420,255],[1520,249],[1600,253]];
/* Gelände (einmal): Kamm des Vorbergs, Waldrand an der Talwiese, Fuß des vorderen Waldes */
var GEO=null;
function geo(){ if(GEO) return GEO; var near=smooth(NEAR,8), mead=smooth(MEAD,10);
  function nearY(x){ return yAt(near,x); } function meadY(x){ return yAt(mead,x); }
  function t2Y(x){ var a=nearY(x), b=meadY(x); return a+(b-a)*.5+4*Math.sin(x/31); }
  return (GEO={near:near,mead:mead,nearY:nearY,meadY:meadY,t2Y:t2Y}); }

/* ---------- Höhenmodell (Schneefallgrenze → Bild) ----------
   Das Bild ist eine Ansicht vom Talboden aus; jede Ebene hat deshalb ihre eigene Höhenskala:
   · Talboden Gaschurn ≈ 980 m (Dorf, Straße, vordere Wiese), Waldrand am Fuß des Hangs ≈ 1.050 m, Lichtung mit dem
     Weiler ≈ 1.150 m;
   · vorderer Wald (k-t2): vom Waldrand (1.050 m) bis zu seinen Wipfeln ≈ 1.700 m;
   · oberer Wald am Vorberg (k-t1): 1.700 m bis zum bewaldeten Kamm ≈ 1.900–2.100 m (je nach Kammhöhe im Bild),
     die Bergstation steht knapp darunter (≈ 1.950 m);
   · Bergkette dahinter: Fuß über dem Vorberg ≈ 2.000–2.200 m, Sättel ≈ 2.450 m, Gipfel 2.550–2.900 m;
     Dauerschnee/Firn auf den Gipfeln ab ≈ 2.650 m (auch im Sommer).
   Frischer Schnee liegt nicht scharf ab der Grenze: 120 m darunter noch nichts, um die Grenze fleckig, 80 m darüber voll. */
var A_VAL=980, A_FOOT=1050, A_MID=1700, A_CREST=2000, A_LINE=-20;
function yM(m){ return 215-(m-2000)/7.2; }                       // Bergkette: Höhe → y
function crestA(x){ return A_CREST+(205-geo().nearY(x))*6; }      // Kammhöhe des Vorbergs bei x
function t2Top(x){ var g=geo(); return Math.max(g.t2Y(x)-17,g.nearY(x)+6); }   // mittlere Wipfelhöhe des vorderen Waldes
/* oberer Wald und Vorberg (über dem Kamm: Wipfel) */
function altN(x,y){ var n=geo().nearY(x), t=t2Top(x), c=crestA(x); return y<=n?c+(n-y)*10:A_MID+(t-y)/(t-n)*(c-A_MID); }
/* vorderer Wald bis zum Waldrand */
function altT2(x,y){ var m=geo().meadY(x), t=t2Top(x); return A_FOOT+(m-y)/(m-t)*(A_MID-A_FOOT); }
/* Höhe → y der vordersten sichtbaren Fläche (Kamm, oberer Wald, vorderer Wald, Talwiese bis ins Dorf) */
function yBand(A,x){ var g=geo(), n=g.nearY(x), m=g.meadY(x), t=t2Top(x), c=crestA(x);
  if(A>=c) return n;
  if(A>=A_MID) return t-(A-A_MID)/(c-A_MID)*(t-n);
  if(A>=A_FOOT) return m-(A-A_FOOT)/(A_MID-A_FOOT)*(m-t);
  return m+(A_FOOT-A)/(A_FOOT-A_VAL)*(VH-m); }
/* Linie der Schneefallgrenze: auf der Bergkette waagrecht, wo die Höhe dort sichtbar ist, sonst am Vorberg/Wald */
function yLine(A,x){ var ym=yM(A); return ym<=geo().nearY(x)?ym:yBand(A,x); }
/* Bedeckung 0–1 in Höhe A bei Schneefallgrenze S (0 = kein Schnee) */
function cover(A,S){ if(!S) return 0; var u=(A-S+120)/200; u=u<0?0:u>1?1:u; return u*u*(3-2*u); }

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
  var pk=peaks(anc), sd=saddles(anc,pk), sh=[], li=[], rb=[];
  pk.forEach(function(k,n){ var P=anc[k], SL=anc[sd[n]], SR=anc[sd[n+1]], wl=P[0]-SL[0], wr=SR[0]-P[0];
    var C=[P[0]-wl*(.38+r()*.16), P[1]+wl*(.85+r()*.35)], rl=pts.filter(function(p){ return p[0]>=SL[0]&&p[0]<=P[0]; });
    var a1=jline(P,C,wl*.16,r); sh.push(poly(rl.concat(a1.slice(1),jline(C,SL,wl*.12,r).slice(1,-1)),1));
    var D=[P[0]+wr*(.3+r()*.14), P[1]+wr*(.7+r()*.3)], rr=pts.filter(function(p){ return p[0]>=P[0]&&p[0]<=SR[0]; });
    var a2=jline(D,P,wr*.14,r); li.push(poly(rr.concat(jline(SR,D,wr*.12,r).slice(1),a2.slice(1,-1)),1));
    rb.push(a1,a2.slice().reverse()); });
  return {sh:sh,li:li,rb:rb}; }
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
  var pts=[[x0,base(x0)+40]], tips=[];
  for(var x=x0;x<VW+8;x+=step*(.7+r()*.6)){ var b=base(x)+(r()-.5)*3, h=hmin+r()*(hmax-hmin), w=h*(.5+r()*.16);
    tips.push([Math.round(x),b,h,w]);
    if(notch) pts.push([x-w*.5,b-h*.1],[x-w*.32,b-h*.44],[x-w*.15,b-h*.42],[x,b-h],[x+w*.15,b-h*.42],[x+w*.32,b-h*.44],[x+w*.5,b-h*.1]);
    else pts.push([x-w*.5,b-h*.12],[x-w*.2,b-h*.55],[x,b-h],[x+w*.2,b-h*.55],[x+w*.5,b-h*.12]); }
  pts.push([VW+20,VH+20],[x0,VH+20]); var d=""; for(var i=0;i<pts.length;i++) d+=(i?"L":"M")+Math.round(pts[i][0])+" "+Math.round(pts[i][1]); return {d:d+"Z",tips:tips}; }
/* Schneehauben auf den Wipfeln einer Waldkante (gleiche Geometrie wie forest): oben eine Haube mit ausgefranstem Rand,
   bei voller Bedeckung auch Schnee auf dem unteren Astkranz. Im Übergang nur einzelne, kleinere Hauben. */
function caps(tips,notch,alt,S,seed){ var r=rng(seed), d="";
  tips.forEach(function(t){ var x=t[0], b=t[1], h=t[2], w=t[3], y0=b-h, c=cover(alt(x,y0+h*.3),S), q=r(); if(c<.05||q>c*1.3) return;
    var s=.6+.4*c, tw=notch?w*.15/(h*.58):w*.2/(h*.45), dp=h*(notch?.56:.44)*s, hw=tw*dp, y1=y0+dp;
    d+=cpoly([[x,y0-.3],[x+hw+.25,y1],[x+hw*.35,y1-dp*.18],[x-hw*.1,y1-dp*.03],[x-hw*.5,y1-dp*.22],[x-hw-.25,y1]]);
    /* unterer Astkranz: schmaler Schneesaum entlang der Oberkante (links und rechts), damit die Fichte als Fichte lesbar bleibt */
    if(c>.5&&!notch){ var A=[[.21,.565],[.515,.105],[.41,.15],[.16,.45]];
      [-1,1].forEach(function(sg){ d+=cpoly(A.map(function(q){ return [x+sg*w*q[0],b-h*q[1]]; })); }); } });
  return d; }
/* verschneite Wipfel im Inneren eines Waldbands: in Reihen am Hang (versetzt), kleine Hauben; im Übergang ausgedünnt –
   so wird der Wald oberhalb der Grenze weiß gesprenkelt statt flächig grau. top/bot = Grenzen des Bands bei x. */
function tufts(top,bot,dx,dy,sz,alt,S,seed){ var r=rng(seed), d="", px=null, py=0;
  /* knapp geschrieben (relative Schritte, ohne überflüssige Trenner) – bei viel Schnee sind es einige tausend */
  for(var x=190;x<VW+6;x+=dx*(.8+r()*.4)){ var y1=bot(x);
    for(var k=0,y=top(x)+r()*dy;y<y1;k++,y+=dy*(.85+r()*.3)){ var xx=x+(k%2)*dx*.5+(r()-.5)*dx*.4, c=cover(alt(xx,y),S), q=r(), w=sz*(.75+r()*.5)*(.7+.3*c), h=w*(1.15+r()*.45);
      if(q>c*.92) continue;
      var ax=n1(xx-w), ay=n1(y); d+=(px===null?'M'+ax+cn(ay):'m'+String(n1(ax-px)).replace(/^(-?)0\./,"$1.")+cn(ay-py))+'l'+String(n1(w)).replace(/^0\./,".")+cn(-h)+cn(w)+cn(h)+cn(-w)+cn(-h*.42)+'z'; px=ax; py=ay; } }
  return d; }

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
/* Schnee im Dorf, solange ein Bild gebaut wird: roof = Dächer, Autos, Zäune weiß; cap = Bäume frisch angezuckert */
var SN={roof:false,cap:false};
function tree(kind,x,y,s,cls){ var t='translate('+x+' '+y+') scale('+s+')';
  return '<use href="#alp'+kind+'" class="'+cls+'" transform="'+t+'"/>'+(SN.cap?'<use href="#alp'+kind+'C" class="k-sc" transform="'+t+'"/>':''); }
/* Schneehauben für die Baum-Symbole: Spitze und je Astkranz ein Keil (wie Schnee auf Fichtenästen) */
function pineCap(T){ var d='';
  T.forEach(function(q,i){ var a=q[0], y0=q[1], b=q[2], y1=q[3], k=y1-y0;
    if(!i){ d+='M0 '+n1(y0-.4)+'L'+n1(b*.9)+' '+n1(y0+k*.86)+'L'+n1(b*.3)+' '+n1(y0+k*.7)+'L0 '+n1(y0+k*.8)+'L'+n1(-b*.4)+' '+n1(y0+k*.68)+'L'+n1(-b*.9)+' '+n1(y0+k*.86)+'Z'; return; }
    d+='M'+n1(-b-.3)+' '+n1(y1+.2)+'L'+n1(-a)+' '+n1(y0)+'H'+n1(a)+'L'+n1(b+.3)+' '+n1(y1+.2)+'L'+n1(b*.62)+' '+n1(y1-k*.16)+'L0 '+n1(y0+k*.46)+'L'+n1(-b*.62)+' '+n1(y1-k*.16)+'Z'; });
  return d; }

/* ---------- Größeres Dorf (nur auf breiten Bildschirmen): Ursprung jeweils Mitte unten ---------- */
function glowR(x,y,w,h){ return '<rect class="k-gw" x="'+n1(x-1.5)+'" y="'+n1(y-1.5)+'" width="'+n1(w+3)+'" height="'+n1(h+3)+'"/>'; }
function wins(W,r,pl){ var b='', g=''; W.forEach(function(w){ var lit=r()<pl; b+=win(w[0],w[1],w[2],w[3],lit); if(lit) g+=glowR(w[0],w[1],w[2],w[3]); }); return {b:b,g:g}; }
/* Gemeindeamt: großer, weiß verputzter Bau mit Walmdach, Gaube und Vordach über dem Eingang */
function gemeinde(r,snowy){ var W=[], b='';
  [-22,-14,-6,6,14,22].forEach(function(c){ W.push([c-2,-9.8,4,5.4],[c-2,-21.4,4,5.6],[c-2,-31,4,5]); });
  W.push([-2,-21.4,4,5.6],[-2,-31,4,5],[29.8,-9.8,2.4,5.4],[33.4,-9.8,2.4,5.4],[29.8,-21.4,2.4,5.4],[33.4,-21.4,2.4,5.4],[29.8,-31,2.4,5],[33.4,-31,2.4,5]);
  var w=wins(W,r,.34);
  b+='<rect class="k-pls" x="28" y="-34" width="9" height="34"/><rect class="k-pl" x="-28" y="-34" width="56" height="34"/>'+
     '<path class="k-pls" d="M-28 -2.6h65V0h-65zM-28 -13.4h65v.9h-65z"/>'+w.b+
     '<path class="k-wdk" d="M-3.2 0V-6.2a3.2 3.2 0 0 1 6.4 0V0z"/><rect class="k-rf" x="-6.4" y="-10.4" width="12.8" height="1.4"/>'+
     '<path class="'+(snowy?"k-rsf":"k-rf")+'" d="M-30.8 -33.4H30.8L24 -45.6H-15.4Z"/><path class="'+(snowy?"k-rss":"k-rfh")+'" d="M30.8 -33.4H39.4L24 -45.6Z"/>'+
     '<path class="k-pl" d="M-3.4 -35.4h6.8v-4.6l-3.4-2.8l-3.4 2.8z"/><rect class="k-wino" x="-1.6" y="-39.4" width="3.2" height="3"/>'+
     '<path class="k-rfs" d="M-4.8 -39.6L0 -44.2L4.8 -39.6" stroke-width="1.3"/>';
  return {b:b,g:w.g}; }
/* Fahnenmast mit rot-weiß-roter Fahne, leicht gewellt */
function flag(){ function band(y,c){ return '<path class="'+c+'" d="M.5 '+y+'c3 -1.1 5.4 1.1 8.4 0s4.6 -.9 6 0v3.1c-1.4 -.9 -3 -1.1 -6 0c-3 1.1 -5.4 -1.1 -8.4 0z"/>'; }
  return '<rect class="k-mtl" x="-.45" y="-50" width=".9" height="50"/><circle class="k-mtl" cx="0" cy="-50.3" r=".8"/>'+band(-49.4,"k-flr")+band(-46.3,"k-pl")+band(-43.2,"k-flr"); }
/* Gasthof: gemauertes Erdgeschoss, drei Holzgeschosse mit durchgehenden Balkonen (im Sommer mit Geranien), Giebel zum Tal */
function gasthof(r,snowy,flowers){ var W=[], G=[], b='', fl=[-12,-21.6,-31.2], sh='';
  [-18.5,-10.5,6.5,14.5].forEach(function(c){ G.push([c,-9.2,4,5]); sh+='M'+n1(c-1.4)+' -9.2h1.3v5h-1.3zM'+n1(c+4.1)+' -9.2h1.3v5h-1.3z'; });
  fl.forEach(function(f){ [-19,-11,-2,7,15].forEach(function(c){ W.push([c,f-8.6,4,5.2]); }); });
  W.push([-5.2,-48,3.6,4.4],[1.6,-48,3.6,4.4]);
  var w=wins(G.concat(W),r,.68);
  b+='<rect class="k-pl" x="-22" y="-12.2" width="44" height="12.2"/><path class="k-wd" d="M-22 -11.8H22V-40.6L0 -56.6L-22 -40.6Z"/>'+
     '<rect class="k-pls" x="-22" y="-12.8" width="44" height="1.4"/>'+w.b+'<path class="k-sh" d="'+sh+'"/>'+
     '<path class="k-wdk" d="M-2.8 0V-6.4a2.8 2.8 0 0 1 5.6 0V0z"/><path class="k-rfs" d="M-22 -9.8h-4.2" stroke-width=".6"/><circle class="k-gold" cx="-25" cy="-7.6" r="1.9"/>';
  fl.concat([-41.2]).forEach(function(f,i){ var x0=i<3?-24:-12.6, wd=i<3?48:25.2, d='';
    for(var x=x0+1.2;x<x0+wd-.5;x+=1.75) d+='M'+n1(x)+' '+n1(f-3.7)+'v3.3';
    b+='<rect class="k-wdk" x="'+x0+'" y="'+n1(f-4.4)+'" width="'+wd+'" height="4"/><path class="k-bal" d="'+d+'" stroke-width=".6"/><rect class="k-wd" x="'+x0+'" y="'+n1(f-4.8)+'" width="'+wd+'" height="1"/>';
    if(flowers) b+='<rect class="k-flw" x="'+n1(x0+.5)+'" y="'+n1(f-6.2)+'" width="'+n1(wd-1)+'" height="1.6" rx=".8"/>'; });
  b+='<rect class="k-rf" x="10" y="-58" width="3" height="8"/><path class="k-rfs" d="M-27 -39.6L0 -59.2L27 -39.6" stroke-width="3.2" stroke-linejoin="miter"/>'+
     (snowy?'<path class="k-rs" d="M-27.6 -40.8L0 -60.7L27.6 -40.8" stroke-width="1.8" stroke-linejoin="round"/>':'');
  return {b:b,g:w.g,ch:[11.5,-58]}; }
/* Feuerwehrhaus: Halle mit drei roten Toren und Schriftzug, daneben der Schlauchturm */
function feuerwehr(r,snowy){ var w=wins([[-26.4,-28,2.4,4.2],[-26.4,-18,2.4,4.2],[-26.4,-8,2.4,4.2],[24,-12,2.2,4.4]],r,.3), b='', d='';
  b+='<rect class="k-pls" x="22" y="-17.4" width="6.4" height="17.4"/><rect class="k-pl" x="-20" y="-18" width="42" height="18"/><rect class="k-pls" x="-20" y="-1.2" width="48.4" height="1.2"/>';
  [-17.4,-4.8,7.8].forEach(function(x){ b+='<rect class="k-fw" x="'+x+'" y="-11.6" width="10.6" height="11.6"/>'; d+='M'+x+' -8.7h10.6M'+x+' -5.8h10.6M'+x+' -2.9h10.6'; });
  b+='<path class="k-fwls" d="'+d+'" stroke-width=".4"/><text class="k-tx k-fwt" x="1" y="-13.1" font-size="4" text-anchor="middle">FEUERWEHR</text>'+
     '<path class="'+(snowy?"k-rsf":"k-rf")+'" d="M-22 -17.4H30.2L26.4 -23.4H-18.2Z"/>'+
     '<rect class="k-pl" x="-30" y="-34" width="10.4" height="34"/><rect class="k-pls" x="-22.4" y="-34" width="2.8" height="34"/>'+w.b+
     '<rect class="k-wd" x="-30.6" y="-41.6" width="11.6" height="8"/><path class="k-wdk" d="M-29.2 -40.4h2v5.6h-2zM-26 -40.4h2v5.6h-2zM-22.8 -40.4h2v5.6h-2z"/><rect class="k-fw" x="-30.6" y="-34.6" width="11.6" height="1.3"/>'+
     '<path class="'+(snowy?"k-rsf":"k-rf")+'" d="M-32.4 -41.2L-24.8 -45.4L-17.2 -41.2Z"/><rect class="k-mtl" x="-25.1" y="-49" width=".6" height="4"/><path class="k-mtl" d="M-26.6 -49.6h3.6v1.6h-3.6z"/>';
  return {b:b,g:w.g}; }
function truck(){ return (SN.roof?'<rect class="k-rsf" x="-11.2" y="-11.4" width="14.2" height="1.1" rx=".5"/><path class="k-rsf" d="M3 -9.4H7.2L7.9 -8.6H3Z"/>':'')+'<path class="k-fw" d="M-11 -2.2V-9.4H3V-2.2ZM3 -9.4H7.2L10.6 -5.6V-2.2H3Z"/>'+
  '<path class="k-wino" d="M4 -8.6H6.8L9.4 -5.6H4Z"/><rect class="k-pl" x="-11" y="-5" width="21.6" height=".8"/>'+
  '<path class="k-fwls" d="M-7.4 -9.4V-5M-3.8 -9.4V-5M-.2 -9.4V-5" stroke-width=".4"/><rect class="k-mtl" x="-10.4" y="-10.6" width="12.6" height=".9"/><rect class="k-blu" x="3.8" y="-10.4" width="2.6" height="1"/>'+
  '<circle class="k-tyre" cx="-7" cy="-1.9" r="1.9"/><circle class="k-tyre" cx="6.2" cy="-1.9" r="1.9"/>'; }
/* SPAR-Markt: moderner Holzbau (Lärche) mit Flachdach, großer Glasfront, Vordach und Schild; daneben der Werbepylon */
function spar(snowy){ var b='', d='', i;
  for(i=-29.8;i<31;i+=2.3) d+='M'+n1(i)+' -19.4V0';
  b+='<rect class="k-lar" x="-31" y="-19.6" width="62" height="19.6"/><path class="k-lrl" d="'+d+'" stroke-width=".35"/>'+
     '<rect class="k-gls" x="-27" y="-10.8" width="40" height="10.8"/>'+
     /* Regale hinter dem Glas und Spiegelung (tagsüber) – damit die Front als Geschäft lesbar ist, nicht als Garage */
     '<path class="k-shelf" d="M-26 -6.6H2M-26 -3.4H2" stroke-width=".7"/><path class="k-refl" d="M-25 -10.8h4.4l-6 10.8h-1.4V-3.4zM-12 -10.8h2.2l-6 10.8h-2.2zM5 -10.8h3.4l-6 10.8h-3.4z"/>';
  d=''; for(i=-22;i<3;i+=5) d+='M'+i+' -10.8V0';
  b+='<path class="k-mul" d="'+d+'M3 -10.8V0M13 -10.8V0M3.4 -8.6H12.6M8 -8.6V0" stroke-width=".6"/>'+
     '<rect class="k-rf" x="-29.4" y="-12.4" width="45" height="1.6"/>'+
     '<rect class="k-rf" x="-32.4" y="-21.2" width="64.8" height="1.9"/>'+(snowy?'<rect class="k-rsf" x="-32.4" y="-22.6" width="64.8" height="1.6" rx=".8"/>':'')+
     /* großes Schild über der Glasfront: grüner Kreis mit Tanne, rotes Feld mit „SPAR“ */
     '<rect class="k-pl" x="-22" y="-19.1" width="36" height="6.4" rx=".6"/><circle class="k-spg" cx="-18.2" cy="-15.9" r="2.6"/><path class="k-txf" d="M-18.2 -17.9L-16.6 -14.7H-17.7V-13.9H-18.7V-14.7H-19.8Z"/>'+
     '<rect class="k-spr" x="-14.8" y="-18.6" width="28.2" height="5.4" rx=".6"/><text class="k-tx k-txt" x="-.7" y="-14.2" font-size="5" text-anchor="middle" letter-spacing=".35">SPAR</text>'+
     /* Werbepylon an der Einfahrt (links, damit er nicht vor dem Gasthof dahinter steht) */
     '<rect class="k-mtl" x="-37.6" y="-22" width="1.6" height="22"/><rect class="k-pl" x="-40.6" y="-30.6" width="7.6" height="9.4" rx=".6"/><circle class="k-spg" cx="-36.8" cy="-27.6" r="2.4"/>'+
     '<path class="k-txf" d="M-36.8 -29.4L-35.3 -26.6H-38.3Z"/><rect class="k-spr" x="-40" y="-24.6" width="6.4" height="2.6" rx=".3"/>';
  return {b:b,g:'<rect class="k-gw" x="-28.5" y="-12.3" width="43" height="13.8"/><circle class="k-gw" cx="-36.8" cy="-26" r="5.5"/>'}; }
/* Haltestelle: Wartehäuschen und gelbes Schild mit grünem H; Postbus */
function busStop(){ return '<rect class="k-gls" x="-5.4" y="-8.4" width="10.8" height="6.8" opacity=".6"/><rect class="k-mtl" x="-6" y="-8.8" width=".8" height="8.8"/><rect class="k-mtl" x="5.2" y="-8.8" width=".8" height="8.8"/>'+
  '<rect class="k-rf" x="-7.2" y="-10" width="14.4" height="1.4"/><rect class="k-wdk" x="-4.4" y="-3.4" width="8.8" height=".9"/>'+
  '<rect class="k-mtl" x="10.2" y="-11.6" width=".7" height="11.6"/><circle class="k-hh" cx="10.55" cy="-12.8" r="2.5"/><text class="k-tx k-hgt" x="10.55" y="-11.55" font-size="3.4" text-anchor="middle">H</text>'+
  (SN.roof?'<rect class="k-rsf" x="-7.6" y="-11" width="15.2" height="1.2" rx=".6"/>':''); }
/* Postbus (Front rechts); lit = fährt: abends/nachts Scheinwerfer mit Lichtkegel und Rücklicht, Fenster bleiben dunkel */
function bus(lit){ var w=''; for(var x=-13.8;x<9;x+=4.75) w+='M'+n1(x)+' -9.2h4v3.6h-4z';
  return (lit?'<path class="k-beam" d="M15.4 -3.5L27 -4.4V-.2Z"/>':'')+'<path class="k-bus" d="M-15 -2V-9.4Q-15 -10.4 -14 -10.4H12.6Q14.2 -10.4 14.8 -8.8L15.6 -6V-2Z"/>'+
  '<path class="k-glv" d="'+w+'M10.8 -9.2H12.8Q13.6 -9.2 14 -8.4L14.8 -5.6H10.8Z"/><rect class="k-busd" x="-15" y="-3.6" width="30.6" height="1.2"/>'+
  (lit?'<rect class="k-hl" x="14.7" y="-4.3" width="1" height="1" rx=".3"/><rect class="k-tl" x="-15.3" y="-5.2" width=".8" height="1.4"/>':'')+
  '<circle class="k-tyre" cx="-9.6" cy="-1.8" r="1.8"/><circle class="k-tyre" cx="9.4" cy="-1.8" r="1.8"/>'+
  (SN.roof?'<path class="k-rsf" d="M-14.8 -10.2Q-14.6 -11.4 -13.4 -11.4H12.2Q13.6 -11.4 14 -10.3Z"/>':''); }
/* Auto: gestreckt (Kombi), damit es neben Häusern und Bus nicht wie ein Spielzeug wirkt (Front rechts) */
function car(c,lit){ return (lit?'<path class="k-beam" d="M6.6 -3.3L16 -3.9V-.3Z"/>':'')+'<path class="'+c+'" d="M-7 -1.6V-3.5Q-7 -4.3 -6.2 -4.4L-4.2 -4.6L-2.3 -6.5H3.4Q4.4 -6.5 4.9 -5.8L5.9 -4.5L6.4 -4.4Q7 -4.3 7 -3.5V-1.6Z"/>'+
  '<path class="k-wino" d="M-2 -6H.3V-4.7H-3.3ZM1 -6H3.2Q3.9 -6 4.3 -5.4L4.8 -4.7H1Z"/>'+
  (lit?'<rect class="k-hl" x="6.2" y="-3.9" width=".9" height=".8" rx=".3"/><rect class="k-tl" x="-7.2" y="-4" width=".7" height=".9"/>':'')+
  '<circle class="k-tyre" cx="-4.3" cy="-1.5" r="1.35"/><circle class="k-tyre" cx="4.3" cy="-1.5" r="1.35"/>'+
  (SN.roof?'<path class="k-rsf" d="M-2.6 -6.3Q-2.3 -7.3 -1.4 -7.3H3.2Q4.3 -7.3 4.8 -6.1Z"/>':''); }
/* Bewegung (Fahrzeuge, Gondelkabinen): kleine HTML-Ebenen mit Inline-SVG, bewegt nur über CSS-Keyframes auf transform –
   das rechnet der Compositor, ohne dass der Hauptthread jedes Bild neu zeichnet (SMIL hielt ihn dauernd mit 60 Hz wach).
   Die Ebenen (.alp-vl, .alp-gl) liegen exakt über dem Bild: 1600×320 Bildeinheiten, rechts unten verankert, skaliert mit --sc. */
/* Dorfstraße als Polylinie – dieselbe Kurve wie der gezeichnete Weg (k-pa), links und rechts aus dem Bild verlängert */
var ROADC=[[-20,294],[120,290],[260,297],[420,293],[580,289],[560,292],[600,291],[700,286],[820,294],[960,289],[1100,284],[1180,283],[1320,284],[1460,285],[1470,279],[1610,281]], ROADL=null;
function road(){ if(ROADL) return ROADL; var p=[[-90,294.8]], i, j;
  for(i=0;i+3<ROADC.length;i+=3){ var a=ROADC[i], b=ROADC[i+1], c=ROADC[i+2], e=ROADC[i+3];
    for(j=0;j<=20;j++){ var t=j/20, u=1-t; p.push([u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*e[0], u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*e[1]]); } }
  p.push([1690,281.6]); p=p.filter(function(q,k){ return !k||q[0]>p[k-1][0]+.01; });
  function seg(x){ for(var k=1;k<p.length-1;k++) if(p[k][0]>=x) return k; return p.length-1; }
  return (ROADL={y:function(x){ var k=seg(x), a=p[k-1], b=p[k]; return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]); }}); }
/* Holzbrücke über den Dorfbach (Mitte BRX): das Deck wölbt sich über die Fahrbahn – Fahrzeuge heben und neigen sich sanft
   (Kosinus-Buckel, Höhe BRA, halbe Breite BRB inkl. Auffahrt) und fahren hinter dem vorderen Geländer (Brücke in der vorderen Ebene) */
var BRX=795, BRA=1.1, BRB=13;
function bump(x){ var s=(x-BRX)/BRB; return s>-1&&s<1?BRA*(1+Math.cos(Math.PI*s))/2:0; }
/* Fahrplan (gemeinsamer Takt VT_T, alle Fahrzeuge teilen ihn – so fährt auf derselben Spur nie eines auf ein anderes auf):
   S = Start im Takt, legs = [Ziel-x, Tempo (Einheiten/s), "o" bremsen | "i" anfahren] oder ["h", Sekunden halten].
   Rechts fahrende auf der vorderen Spur, links fahrende (gespiegelt) auf der hinteren – Rechtsverkehr. Postbus hin (hält an
   der Haltestelle) und zurück, vier Autos; außerhalb des Bilds (x 380 / 1650) warten sie auf ihre nächste Fahrt. Im kompakten
   Dorf (x > 1290) ist nach diesem Fahrplan nie mehr als ein Auto zugleich unterwegs; der Bus nur mit seiner Haltestelle. */
var VT_T=100, VNL=1.5, VFL=-.9, VOL=380, VOR=1650;
var VEHS=[
  {g:"car4",S:6,x0:VOR,dir:-1,lane:VFL,s:.85,legs:[[VOL,42]]},
  {g:"bus",S:50,x0:VOR,dir:-1,lane:VFL,s:1,vw:"bus",legs:[[VOL,36]]},
  {g:"car2",S:78,x0:VOR,dir:-1,lane:VFL,s:.85,legs:[[VOL,40]]},
  {g:"bus",S:0,x0:VOL,dir:1,lane:VNL,s:1,vw:"bus",legs:[[954,36],[990,36,"o"],["h",7],[1026,36,"i"],[VOR,36]]},
  {g:"car1",S:30,x0:VOL,dir:1,lane:VNL,s:.85,legs:[[VOR,40]]},
  {g:"car3",S:48,x0:VOL,dir:1,lane:VNL,s:.85,legs:[[VOR,42]]}];
function kfVeh(o){ var R=road(), t=0, x=o.x0, P=[[0,x]], hw=o.g==="bus"?9.5:4.3*o.s;   // hw = halber Radstand
  function H(v){ return R.y(v)-bump(v); }
  o.legs.forEach(function(l){ if(l[0]==="h"){ t+=l[1]; P.push([t,x]); return; }
    var d=l[0]-x, dt=(l[2]?2:1)*Math.abs(d)/l[1], n=l[2]?8:Math.max(1,Math.ceil(Math.abs(d)/24)), U=[], i, v;
    for(i=1;i<=n;i++) U.push(i/n);
    /* über der Brücke fein abtasten (gleichförmige Fahrt), sonst gingen Heben und Neigen zwischen den Stützpunkten verloren */
    if(!l[2]) for(v=BRX-BRB-hw-2;v<=BRX+BRB+hw+2;v+=1.5){ var w=(v-x)/d; if(w>0&&w<1) U.push(w); }
    U.sort(function(a,b){ return a-b; }).forEach(function(u){ var e=l[2]==="o"?1-(1-u)*(1-u):l[2]==="i"?u*u:u; P.push([t+dt*u,x+d*e]); });
    t+=dt; x=l[0]; });
  if(t<VT_T-.01) P.push([VT_T,x]);
  /* Lage aus beiden Achsen: Höhe = Mitte zwischen Vorder- und Hinterrad, Neigung aus ihrem Höhenunterschied */
  return P.map(function(q){ var a=H(q[1]-hw), b=H(q[1]+hw);
    return (q[0]/VT_T*100).toFixed(3)+'%{transform:translate('+n1(q[1])+'px,'+(Math.round((a+b)*50)/100)+'px) rotate('+(Math.atan2(b-a,2*hw)*180/Math.PI).toFixed(2)+'deg)}'; }).join(""); }
/* Fahrzeug-Element: äußeres i fährt (Keyframes), inneres b setzt Spur, Größe und Richtung (gespiegelt = nach links) */
function vehEl(o,i){ var g=o.g==="bus"?bus(1):car("k-"+o.g,1), vb=o.g==="bus"?[-16,-11,44,11.6]:[-8,-7.2,25,7.8];
  return '<i class="alp-mv" style="animation-name:alpV'+i+';animation-delay:-'+n1((VT_T-o.S)%VT_T)+'s"'+(o.vw?' data-vw="'+o.vw+'"':'')+'>'+
    '<b style="transform:translate(0,'+o.lane+'px) scale('+(o.dir<0?-o.s:o.s)+','+o.s+')"><svg viewBox="'+vb.join(" ")+'" style="left:'+vb[0]+'px;top:'+vb[1]+'px;width:'+vb[2]+'px;height:'+vb[3]+'px">'+g+'</svg></b></i>'; }
/* Stadel (Heustadel am Dorfrand): Holz, breites Tor, steiles Dach – damit am Rand nicht nur gleiche Häuser stehen */
function stadel(snowy){ return '<path class="k-wd" d="M-13 0V-12L0 -22L13 -12V0Z"/><rect class="k-wdk" x="-13" y="-12.6" width="26" height="1.2" opacity=".6"/>'+
  '<rect class="k-wdk" x="-4.2" y="-9" width="8.4" height="9"/><path class="k-lrl" d="M-9.6 -11.4V0M-6.6 -11.4V-.2M6.6 -11.4V0M9.6 -11.4V0M0 -9V0" stroke-width=".45"/>'+
  '<path class="k-rfs" d="M-15.8 -10.4L0 -23.8L15.8 -10.4" stroke-width="2.6" stroke-linejoin="miter"/>'+
  /* Schneedach über der dunklen Traufe – sonst verschwindet das Dach vor verschneitem Hang */
  (snowy?'<path class="k-rs" d="M-16.3 -11.5L0 -25.3L16.3 -11.5" stroke-width="1.9" stroke-linejoin="round"/>':''); }
/* Weide am Fuß der Weiler-Lichtung (zwischen Weiler und Dorfstraße): vorne ein Vorarlberger Schrägzaun (schräge Latten an
   einer Querstange, dazwischen Pfosten), seitlich ein einfacher Lattenzaun den Hang hinauf, rechts ein Heustadel als Stall.
   Liegt Schnee bis zur Weide, sind die Kühe im Stall und auf dem Zaun liegt Schnee. */
var WZ=[918,1092];
function wzY(x){ return 280.6-(x-WZ[0])*.014; }
function weideFront(sn){ var d='', q='', x;
  for(x=WZ[0]+1;x<WZ[1]-1;x+=1.45) d+='M'+n1(x)+' '+n1(wzY(x)+.2)+'l2.4 -3.8';
  for(x=WZ[0];x<=WZ[1]+.1;x+=14.5) q+='M'+n1(x)+' '+n1(wzY(x)+.3)+'V'+n1(wzY(x)-4.6);
  return '<path class="k-fnw" d="'+d+'" stroke-width=".34"/><path class="k-fnw" d="'+q+'M'+WZ[0]+' '+n1(wzY(WZ[0])-2.7)+'L'+WZ[1]+' '+n1(wzY(WZ[1])-2.7)+'" stroke-width=".5"/>'+
    (sn?'<path class="k-rs" d="M'+WZ[0]+' '+n1(wzY(WZ[0])-3.9)+'L'+WZ[1]+' '+n1(wzY(WZ[1])-3.9)+'" stroke-width=".7"/>':''); }
function weideSide(sn){ var d='';
  [[WZ[0],wzY(WZ[0]),928,263.4],[WZ[1],wzY(WZ[1]),1082,262.6]].forEach(function(f){ var i, t, x, y, h;
    for(i=0;i<=3;i++){ t=i/3; x=f[0]+(f[2]-f[0])*t; y=f[1]+(f[3]-f[1])*t; h=4.4-1.8*t; d+='M'+n1(x)+' '+n1(y)+'V'+n1(y-h); }
    d+='M'+f[0]+' '+n1(f[1]-3.6)+'L'+f[2]+' '+n1(f[3]-2.3)+'M'+f[0]+' '+n1(f[1]-1.9)+'L'+f[2]+' '+n1(f[3]-1.2); });
  return '<path class="k-fnw" d="'+d+'" stroke-width=".4"/>'+(sn?'<path class="k-rs" d="M'+WZ[0]+' '+n1(wzY(WZ[0])-4)+'L928 260.8M'+WZ[1]+' '+n1(wzY(WZ[1])-4)+'L1082 260.1" stroke-width=".6"/>':''); }
/* Kuh (Blick nach rechts, Ursprung = Boden unter der Körpermitte): Rumpf, Beine, Euter; Kopf und Schwanz als eigene
   Teile mit Drehpunkt am Hals bzw. Schwanzansatz – Grasen und Schwanzwedeln sind nur CSS-Drehungen (Compositor). */
var COWB='<svg viewBox="-5.6 -8 10.6 8.4" style="left:-5.6px;top:-8px;width:10.6px;height:8.4px">'+
  '<path class="k-cowd" d="M-4.3 -4.4h.85v4.4h-.85zM-3.1 -4.4h.8v4.3h-.8zM2.3 -4.4h.8v4.3h-.8zM3.4 -4.4h.85v4.4h-.85z"/>'+
  '<path class="k-cow" d="M-4.9 -6.6Q-5 -7.6 -3.9 -7.5Q-1 -7.1 1.6 -7.5Q3.4 -7.7 4.1 -6.9L4.4 -5.3Q4.4 -3.8 3.3 -3.7H-3.9Q-5 -3.8 -5 -5Z"/>'+
  '<path class="k-cowm" d="M-1 -3.75Q-.6 -2.8 .1 -2.8Q.7 -2.9 .8 -3.75Z"/></svg>';
var COWH='<svg viewBox="-1 -3 6 5.2" style="left:-1px;top:-3px;width:6px;height:5.2px">'+
  '<path class="k-cowd" d="M-.6 -.8L1.8 -1.5Q2.8 -1.8 3.4 -1.2L4.5 .7Q4.8 1.7 3.8 1.9Q3 2 2.6 1.2L1.7 .7L-.4 1.6ZM1.6 -1.3L.4 -2L1.1 -.85Z"/>'+
  '<path class="k-cowm" d="M3.4 .5Q4.4 .3 4.65 1.2Q4.8 1.9 3.9 1.95Q3.1 1.9 3.1 1.2Z"/><path class="k-horn" d="M2.3 -1.6Q2.5 -2.5 3.1 -2.75" stroke-width=".5" stroke-linecap="round"/>'+
  '<circle class="k-gold" cx="1.5" cy="1.55" r=".5"/></svg>';
var COWT='<svg viewBox="-1.2 -.3 1.9 4.9" style="left:-1.2px;top:-.3px;width:1.9px;height:4.9px"><path class="k-ctl" d="M0 0Q-.7 1.8 -.5 3.6" stroke-width=".42"/><ellipse class="k-cowd" cx="-.5" cy="3.9" rx=".42" ry=".6"/></svg>';
/* o = [x, y, Größe, nach links?, Kopf grast (Verzögerung s, -1 = Kopf oben), Schwanz wedelt (Verzögerung, -1 = nein), wandert?] */
function cowEl(o,anim){ var hd=o[4]>=0, tl=o[5]>=0;
  return '<i class="alp-cow" style="transform:translate('+o[0]+'px,'+o[1]+'px) scale('+(o[3]?-o[2]:o[2])+','+o[2]+')"><u'+(anim&&o[6]?' class="w"':'')+'>'+
    '<b class="cw-tl'+(anim&&tl?' w':'')+'" style="left:-4.9px;top:-7px'+(anim&&tl?';animation-delay:-'+o[5]+'s':'')+'">'+COWT+'</b>'+COWB+
    '<b class="cw-hd'+(anim&&hd?' g':'')+'" style="left:3.6px;top:-6.6px;transform:rotate('+(hd?50:0)+'deg)'+(anim&&hd?';animation-delay:-'+o[4]+'s':'')+'">'+COWH+'</b></u></i>'; }
var COWS=[[947,278.4,.86,0,0,2,0],[982,268.8,.7,1,5.5,-1,0],[1012,277.6,.86,0,-1,-1,1],[1049,272,.76,1,9,5,0]];
function lamp(){ return '<rect class="k-mtl" x="-.35" y="-9.4" width=".7" height="9.4"/><rect class="k-mtl" x="-.35" y="-9.4" width="2.6" height=".8"/><circle class="k-win" cx="1.9" cy="-8.3" r=".7"/>'; }
/* Talstation der Gondelbahn: Betonsockel, Glasband, Pultdach, das zum Seil hin ansteigt */
function talstation(sn){ return '<rect class="k-pls" x="-19" y="-12" width="22" height="12"/><rect class="k-gls" x="-16.6" y="-10" width="17" height="5.4"/><path class="k-mul" d="M-12.4 -10V-4.6M-8.2 -10V-4.6M-4 -10V-4.6" stroke-width=".5"/>'+
  '<rect class="k-lar" x="3" y="-15" width="16" height="15"/><path class="k-tyre" d="M5 -4.2V-12.2H19V-4.2Z" opacity=".85"/><rect class="k-cab" x="9.4" y="-10" width="4.8" height="4.2" rx=".9"/><rect class="k-glv" x="10.1" y="-9.3" width="3.4" height="1.5"/>'+
  '<rect class="k-cab" x="-16.6" y="-2.8" width="10" height="1.5"/><path class="k-rf" d="M-21 -11.2L21.4 -17.4V-15.2L-21 -9.4Z"/>'+
  (sn?(function(t){ var a=n1(-11.3-1.3*t), b=n1(-17.6-1.3*t); return '<path class="k-rsf" d="M-21.6 -11.1L21.8 -17.3Q22.1 '+b+' 21 '+b+'L-20.6 '+a+'Q-21.9 '+a+' -21.6 -11.1Z"/>'; })(sn===true?1:sn):''); }
/* Gondelbahn: Schneise durch den Wald hinauf zu einer Lichtung knapp unter dem Kamm des Vorbergs, dort steht die
   Bergstation (gespiegelte Talstation, kleiner, weil weiter weg). Drei Stützen stehen in der Schneise, zwei Seile laufen
   ohne Lücke vom Dach der Talstation über die Stützen ins Dach der Bergstation. Kabinen ziehen langsam (move); nachts und
   bei „Bewegung reduzieren“ hängen sie still. Kabinen weiter oben etwas kleiner (Tiefe). */
var GONA=[761,265], GONS=[958,195.2], GONK=.56, GONB=[GONS[0]-21.4*GONK,GONS[1]-17.4*GONK], GOND=90;
/* Seilpunkt bei t (0 = Talstation, 1 = Bergstation); o = Versatz des hinteren Seils (perspektivisch kleiner nach oben) */
function gonP(t,o){ var A=GONA, B=GONB; return [A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t+Math.sin(Math.PI*t)*2.6+o*(1-t*.6)]; }
/* Fahrweg einer Kabine: aus der Talstation heraus, am Seil entlang, in die Bergstation hinein (beide verdecken die Enden) */
function kfCab(o,up){ var pts=[[754,266.6+o]], L=[0], i, out=[];
  for(i=0;i<=16;i++) pts.push(gonP(i/16,o)); pts.push([GONB[0]+6,GONB[1]+1.2+o*.4]);
  for(i=1;i<pts.length;i++) L.push(L[i-1]+Math.sqrt(Math.pow(pts[i][0]-pts[i-1][0],2)+Math.pow(pts[i][1]-pts[i-1][1],2)));
  for(i=0;i<pts.length;i++){ var f=L[i]/L[L.length-1]; out.push([(up?f:1-f)*100,'transform:translate('+n1(pts[i][0])+'px,'+n1(pts[i][1])+'px) scale('+(1-.26*f).toFixed(3)+')']); }
  out.sort(function(a,b){ return a[0]-b[0]; }); return out.map(function(q){ return q[0].toFixed(3)+'%{'+q[1]+'}'; }).join(""); }
var CABSVG='<svg viewBox="-2.6 -.3 5.2 6.6" style="left:-2.6px;top:-.3px;width:5.2px;height:6.6px"><path class="k-cbl" d="M0 0v2.2" stroke-width=".4"/><rect class="k-cab" x="-2.4" y="2.1" width="4.8" height="4" rx=".9"/><rect class="k-glv" x="-1.7" y="2.7" width="3.4" height="1.5"/></svg>';
/* einmal: Keyframes für alle Fahrzeuge und beide Seile */
function motionCSS(){ var c=''; VEHS.forEach(function(o,i){ c+='@keyframes alpV'+i+'{'+kfVeh(o)+'}'; }); return c+'@keyframes alpGu{'+kfCab(0,1)+'}@keyframes alpGd{'+kfCab(1.5,0)+'}'; }
/* sn = {g: Schneedecke (Schneise/Lichtung weiß, Maske alpSnG), f: Schneefallgrenze für die Bäumchen, top: Dach der Bergstation} */
function gondola(nearY,meadY,t2Y,move,sn){ var s='', i, x, c1='', c2='', S=GONS, k=GONK, P=gonP;
  for(i=0;i<=16;i++){ var t=i/16, p=P(t,0), q=P(t,1.5); c1+=(i?'L':'M')+n1(p[0])+' '+n1(p[1]); c2+=(i?'L':'M')+n1(q[0])+' '+n1(q[1]); }
  /* Gelände unter der Bahn: vom Waldrand an der Talwiese hinauf zur Lichtung, unten flach, oben steiler */
  var g0=786, g1=S[0]-5, y0=meadY(g0)+.4, y1=S[1]+.6;
  function U(x){ return Math.max(0,Math.min(1,(x-g0)/(g1-g0))); }
  function G(x){ return y0-(y0-y1)*Math.pow(U(x),1.45); }
  function Wd(x){ return 5.6-2.4*U(x); }
  /* Lichtung am Kamm (linsenförmig, oben bis an die Kammlinie) */
  var cx0=S[0]-34, cx1=S[0]+34, cr=34, cd=S[1]-nearY(S[0])+8;
  function CB(x){ var v=(x-S[0])/cr; return nearY(x)+cd*Math.sqrt(Math.max(0,1-v*v)); }
  var top=[], bot=[], cl=[], fr=rng(611);
  for(x=g0-6;x<=g1+.1;x+=3){ top.push([x,G(x)-Wd(x)/2+(fr()-.5)*.9]); bot.unshift([x,Math.min(G(x)+Wd(x)/2,meadY(x)-.2)]); }
  for(x=cx0;x<=cx1+.1;x+=2) cl.push([x,nearY(x)-.4]); for(x=cx1;x>=cx0-.1;x-=2) cl.push([x,CB(x)]);
  var gd=poly(top.concat(bot))+poly(cl);
  s+='<path class="k-glc" d="'+gd+'"/>'+(sn.g?'<path class="k-sgl" mask="url(#alpSnG)" d="'+gd+'"/>':'');
  /* Baumspitzen der unteren (näheren) Waldkante ragen in Schneise und Lichtung – so liegen beide im Wald, nicht darauf */
  var f1='', f2='', f3='';
  for(x=g0+7;x<cx1-3;x+=2.4+fr()*1.4){ var lb=-1e9;
    if(x<=g1) lb=Math.min(G(x)+Wd(x)/2,meadY(x)-.2); if(x>=cx0&&x<=cx1) lb=Math.max(lb,CB(x));
    var yb=lb+1.5, h=2.4+fr()*2, w=h*.42, d='M'+n1(x-w)+' '+n1(yb)+'L'+n1(x)+' '+n1(yb-h)+'L'+n1(x+w)+' '+n1(yb)+'Z';
    if(yb>t2Y(x)-14) f2+=d; else f1+=d;
    if(sn.f&&cover(yb>t2Y(x)-14?altT2(x,yb-h):altN(x,yb-h),sn.f)>.5) f3+='M'+n1(x-w*.62)+' '+n1(yb-h*.42)+'L'+n1(x)+' '+n1(yb-h-.2)+'L'+n1(x+w*.62)+' '+n1(yb-h*.42)+'L'+n1(x)+' '+n1(yb-h*.56)+'Z'; }
  s+='<path class="k-t1" d="'+f1+'"/><path class="k-t2" d="'+f2+'"/>'+(f3?'<path class="k-sc" d="'+f3+'"/>':'');
  /* Stützen: stehen mitten in der Schneise, weiter oben etwas schmaler */
  [.3,.56,.8].forEach(function(t){ var p=P(t,0), g=G(p[0]), f=1-.3*t;
    s+='<path class="k-mtl" d="M'+n1(p[0]-.5*f)+' '+n1(p[1]-.6)+'H'+n1(p[0]+.5*f)+'L'+n1(p[0]+1.6*f)+' '+n1(g)+'H'+n1(p[0]-1.6*f)+'Z"/>'+
       '<rect class="k-mtl" x="'+n1(p[0]-2.8*f)+'" y="'+n1(p[1]-1.2)+'" width="'+n1(5.6*f)+'" height="'+n1(f)+'"/><rect class="k-pls" x="'+n1(p[0]-2.1*f)+'" y="'+n1(g-.7)+'" width="'+n1(4.2*f)+'" height=".9"/>'; });
  /* Seile zweifarbig: heller Saum (sichtbar vor dem dunklen Wald), dunkler Kern (sichtbar im hellen Dunst) */
  s+='<path class="k-cblh" d="'+c1+c2+'" stroke-width="1.25"/><path class="k-cbl" d="'+c1+c2+'" stroke-width=".55"/>';
  /* Kabinen und Bergstation als eigene Ebene über dem Bild (vor Seil und Wald, hinter Nebel und Dorf): je drei Kabinen fahren
     hinauf (vorderes Seil) und hinunter (hinteres), 90 s pro Fahrt; nachts und bei „Bewegung reduzieren“ hängen sie still.
     Die Bergstation kommt zuletzt und deckt Seilende und ankommende Kabinen. Sichtbar zusammen mit der Talstation (data-vw). */
  var c='';
  if(move) [[0,15],[0,45],[0,75],[1,0],[1,30],[1,60]].forEach(function(q){ c+='<i class="alp-mv" style="animation-name:'+(q[0]?'alpGu':'alpGd')+';animation-delay:-'+q[1]+'s">'+CABSVG+'</i>'; });
  else [[.15,0],[.5,0],[.84,0],[.3,1.5],[.72,1.5]].forEach(function(q){ var p=P(q[0],q[1]);
    c+='<i class="alp-st" style="transform:translate('+n1(p[0])+'px,'+n1(p[1])+'px) scale('+(1-.26*q[0]).toFixed(2)+')">'+CABSVG+'</i>'; });
  var x0=Math.floor(S[0]-21.6*k)-1, y0=Math.floor(S[1]-17.6*k)-1, w=Math.ceil(S[0]+21.2*k)+1-x0, h=Math.ceil(S[1])+1-y0;
  c+='<svg viewBox="'+x0+' '+y0+' '+w+' '+h+'" style="left:'+x0+'px;top:'+y0+'px;width:'+w+'px;height:'+h+'px"><g transform="translate('+S[0]+' '+S[1]+') scale('+(-k)+' '+k+')">'+talstation(sn.top&&2.4)+'</g></svg>';
  return {a:s,gon:'<div class="alp-gl" data-vw="talstation" aria-hidden="true">'+c+'</div>'}; }

var LCACHE={};
/* move = Fahrzeuge fahren (sonst parken sie wie im Standbild), cab = Gondelkabinen fahren (nicht nachts);
   fresh = Schneefallgrenze des frischen Schnees (auch auf den Bäumen), ground = bis wohin Schnee liegt (Winter: bis ins Tal) */
function landscape(fresh,ground,season,move,cab){
  var key=fresh+"|"+ground+"|"+season+"|"+(move?1:0)+(cab?1:0); if(LCACHE[key]) return LCACHE[key];
  var r=rng(20261028), mtn=ridge(MTN,.24,23,4), G=geo(), near=G.near, mead=G.mead, nearY=G.nearY, meadY=G.meadY, t2Y=G.t2Y, i, x;
  var MF=flanks(mtn,MTN,r), mfa=MF.sh.join("");
  function facets(a,c){ return a.map(function(d){ return '<path class="'+c+'" d="'+d+'"/>'; }).join(""); }
  /* Schnee auf der Bergkette: Dauerschnee auf den hohen Gipfeln (≈ 2.650 m) und – liegt Schnee tiefer – eine zweite Decke
     bis zur Grenze (gleiche unruhige Kante mit Rinnen und Felsrippen). Darunter ein weicher, angezuckerter Saum. */
  var GB=ground?Math.min(300,yM(ground+A_LINE)):0, deep=GB>126;
  var msn='<path d="'+snowField(mtn,MTN,124,r)+'"/>'+(deep?'<path d="'+snowField(mtn,MTN,GB,rng(37))+'"/>':'');
  /* tief verschneit: an den Graten (Kanten zwischen Licht- und Schattenflanke) schaut Fels heraus, nach unten auslaufend */
  var ribs=deep?MF.rb.map(function(l){ var d=''; l.forEach(function(q,j){ d+=(j?'L':'M')+n1(q[0])+' '+n1(q[1]); }); return d; }).join(''):'';
  var mdust=deep&&GB<296?'<path class="k-msd" filter="url(#alpFsd)" d="'+snowField(mtn,MTN,GB+13,rng(41))+'"/>':'';
  function t1B(x){ return nearY(x)+9+5*Math.sin(x/47)+3*Math.sin(x/13); }
  var T1=forest(rng(5),t1B,6.5,9,17,120,false), t1=T1.d;
  var T2=forest(rng(9),t2Y,7,12,22,120,true), t2=T2.d;
  /* goldene Lärchen im Herbst (sonst hellere Fichten): einzelne Bäume am oberen Rand des vorderen Waldes */
  var lr=rng(77), lx="";
  for(i=0;i<34;i++){ var xx=260+lr()*1320, a0=nearY(xx), b0=meadY(xx), by=a0+(b0-a0)*(.42+lr()*.3);
    lx+='<use href="#alpPine2" transform="translate('+Math.round(xx)+' '+Math.round(by)+') scale('+(.2+lr()*.12).toFixed(2)+')"/>'; }
  /* Schnee am Vorberg und im Wald (Höhenmodell oben): Grenze als unruhige Höhenlinie, weich auslaufend (Maske alpSnG);
     liegender Schnee zwischen den Wipfeln am Kamm, ein heller Schleier über dem verschneiten Wald, darauf verschneite
     Wipfel – erst der obere Wald, dann der vordere. Frischer Schnee (fresh) zuckert auch die Bäume an. */
  var gl=!!ground&&ground<2250, snL='', snW='', sv1='', sv2='';
  if(gl){ var ph=[3.1,1.7,5.2], cpts=[];
    for(x=-20;x<=VW+20;x+=4) cpts.push([x,yBand(ground+A_LINE,x)+1.6*Math.sin(x*.043+ph[0])+1.1*Math.sin(x*.11+ph[1])+.7*Math.sin(x*.31+ph[2])]);
    var reg=poly([[-30,-30],[VW+30,-30]].concat(cpts.reverse()));
    snL='<mask id="alpSnG" maskUnits="userSpaceOnUse" x="-20" y="-20" width="1640" height="360"><path fill="#fff" filter="url(#alpFsn)" d="'+reg+'"/></mask>';
    snW='<g clip-path="url(#alpCn)"><path class="k-sng" filter="url(#alpFsn)" d="'+reg+'"/></g>';
    sv1='<use href="#alpT1P" class="k-sv" mask="url(#alpSnG)"/>'; sv2='<use href="#alpT2P" class="k-sv" mask="url(#alpSnG)"/>'; }
  var sc1='', sc2='';
  if(fresh&&fresh<2250){
    sc1=tufts(function(x){ return t1B(x)-12; },function(x){ return t2Y(x)-9; },5.2,3.5,1.25,altN,fresh,51)+caps(T1.tips,false,altN,fresh,53);
    sc2=tufts(function(x){ return t2Y(x)-16; },function(x){ return meadY(x)+1.5; },6,4.1,1.6,altT2,fresh,57)+caps(T2.tips,true,altT2,fresh,59); }
  var defs='<defs>'+
    '<linearGradient id="alpGm" gradientUnits="userSpaceOnUse" x1="0" y1="92" x2="0" y2="236"><stop offset="0" style="stop-color:var(--a-m1)"/><stop offset="1" style="stop-color:var(--a-m2)"/></linearGradient>'+
    '<linearGradient id="alpGn" gradientUnits="userSpaceOnUse" x1="0" y1="186" x2="0" y2="262"><stop offset="0" style="stop-color:var(--a-n1)"/><stop offset="1" style="stop-color:var(--a-n2)"/></linearGradient>'+
    '<linearGradient id="alpGg" gradientUnits="userSpaceOnUse" x1="0" y1="248" x2="0" y2="320"><stop offset="0" style="stop-color:var(--a-g1)"/><stop offset="1" style="stop-color:var(--a-g2)"/></linearGradient>'+
    /* Taldunst am Fuß der Kette: gibt Tiefe zwischen Bergen und Wald */
    '<linearGradient id="alpGh" gradientUnits="userSpaceOnUse" x1="0" y1="140" x2="0" y2="214"><stop offset="0" style="stop-color:var(--a-hz);stop-opacity:0"/><stop offset=".6" style="stop-color:var(--a-hz);stop-opacity:.34"/><stop offset="1" style="stop-color:var(--a-hz);stop-opacity:.72"/></linearGradient>'+
    '<linearGradient id="alpGsm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a-msh)"/><stop offset=".35" style="stop-color:var(--a-msh);stop-opacity:.78"/><stop offset=".75" style="stop-color:var(--a-msh);stop-opacity:.16"/><stop offset="1" style="stop-color:var(--a-msh);stop-opacity:0"/></linearGradient>'+
    '<linearGradient id="alpGlm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--a-lit)"/><stop offset=".4" style="stop-color:var(--a-lit);stop-opacity:.4"/><stop offset="1" style="stop-color:var(--a-lit);stop-opacity:0"/></linearGradient>'+
    '<path id="alpMidP" d="'+shape(mtn)+'"/><path id="alpNearP" d="'+shape(near)+'"/>'+
    '<g id="alpSnM">'+msn+'</g><clipPath id="alpCm"><use href="#alpMidP"/></clipPath>'+
    '<path id="alpFmP" d="'+mfa+'"/><path id="alpT1P" d="'+t1+'"/><path id="alpT2P" d="'+t2+'"/><clipPath id="alpFm"><use href="#alpFmP"/></clipPath>'+
    '<clipPath id="alpCn"><use href="#alpNearP"/></clipPath><clipPath id="alpCt1"><use href="#alpT1P"/></clipPath><clipPath id="alpCt2"><use href="#alpT2P"/></clipPath>'+
    '<filter id="alpFb" x="-2%" y="-5%" width="104%" height="110%"><feGaussianBlur stdDeviation="1.1"/></filter>'+
    '<filter id="alpFsd" x="-2%" y="-10%" width="104%" height="120%"><feGaussianBlur stdDeviation="2.4"/></filter>'+
    (deep?'<filter id="alpFrb" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".7"/></filter>'+
      '<linearGradient id="alpGrb" gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="0" y2="215"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'+
      '<mask id="alpRbM" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="320"><rect width="1600" height="320" fill="url(#alpGrb)"/></mask>':'')+
    '<filter id="alpFsn" x="-2%" y="-5%" width="104%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>'+snL+
  '</defs>';
  var SV='<svg class="alp-back" viewBox="0 0 1600 320" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">';
  /* hinten: die eine Bergkette (wie in Gaschurn), Licht- und Schattenflanken, Schnee, unten im Taldunst */
  var back=SV+defs+
    '<use href="#alpMidP" class="k-mid"/><g clip-path="url(#alpCm)"><g filter="url(#alpFb)">'+facets(MF.sh,"k-msh")+facets(MF.li,"k-mli")+'</g>'+mdust+
    '<use href="#alpSnM" class="k-ms"/><g clip-path="url(#alpFm)"><use href="#alpSnM" class="k-mss"/></g>'+
    (ribs?'<path class="k-rib" mask="url(#alpRbM)" filter="url(#alpFrb)" d="'+ribs+'" stroke-width="2.2"/>':'')+
    '<rect class="k-haze" x="0" y="140" width="1600" height="80"/></g>'+
  '</svg>';
  /* Schnee im Dorf (Talboden ≈ 980 m) und beim Weiler auf der Lichtung (≈ 1.150 m) */
  var vRoof=cover(A_VAL+10,ground)>=.5, vCap=cover(A_VAL+10,fresh)>=.5, wRoof=cover(1150,ground)>=.5, wCap=cover(1150,fresh)>=.5;
  SN.roof=vRoof; SN.cap=vCap;
  /* Dorfbach vom Wald herunter, unter der Dorfstraße durch (Steinbrücke) in den Talbach */
  var creek='<g data-vb="770" data-n="bach" data-k="bach"><path class="k-rv" d="M803 257C799 266 805 274 797 283S788 297 784 305" stroke-width="1.7"/></g>';
  var bridge='<g data-vb="770" data-k="bach" transform="translate(795 289.6)"><path class="k-wd" d="M-10 -.4Q0 -3.4 10 -.4V2.6H7Q0 -2.4 -7 2.6H-10Z"/><path class="k-wdk" d="M-10 1.4Q0 -1.8 10 1.4V2.6H7Q0 -2.4 -7 2.6H-10Z" opacity=".55"/>'+
    '<path class="k-brr" d="M-9.6 -2.4Q0 -6 9.6 -2.4M-9.4 -2.4V-.4M-4.8 -3.9V-1.7M0 -4.6V-2.4M4.8 -3.9V-1.7M9.4 -2.4V-.4" stroke-width=".7"/>'+
    (vRoof?'<path class="k-rs" d="M-9.6 -2.7Q0 -6.3 9.6 -2.7" stroke-width=".7"/>':'')+'</g>';
  /* vorne: Vorberge, Wald, Talwiese mit Bach, Dorfstraße, Weg und Zaun */
  var GD=gondola(nearY,meadY,t2Y,cab,{g:gl,f:fresh,top:cover(altN(958,195),ground)>=.5});
  var RD='M-20 294C120 290 260 297 420 293S560 292 600 291C700 286 820 294 960 289S1180 283 1320 284S1470 279 1610 281', RW='M1384 330C1392 316 1376 304 1394 294S1404 286 1398 282';
  var back2=SV+
    '<use href="#alpNearP" class="k-near"/>'+snW+
    '<use href="#alpT1P" class="k-t1"/><g class="k-lx">'+lx+'</g>'+sv1+(sc1?'<path class="k-sc k-sc1" clip-path="url(#alpCt1)" d="'+sc1+'"/>':'')+
    '<use href="#alpT2P" class="k-t2"/>'+sv2+(sc2?'<path class="k-sc" clip-path="url(#alpCt2)" d="'+sc2+'"/>':'')+
    '<path class="k-g" d="M906 262C930 258 934 238 962 233C990 228 1032 228 1054 234C1074 240 1080 256 1104 262Z"/>'+
    '<path class="k-g" d="'+shape(mead)+'"/>'+creek+
    '<path class="k-rv" d="M-20 309C120 302 250 316 420 309S700 300 830 309S930 317 960 314C1060 306 1150 316 1240 310S1400 303 1480 309S1570 312 1610 306" stroke-width="2.4"/>'+
    /* verschneit: geräumte Straße mit Schneewall am Rand */
    (vRoof?'<path class="k-pab" d="'+RD+'" stroke-width="3.8"/><path class="k-pab" d="'+RW+'" stroke-width="3.2"/>':'')+
    '<path class="k-pa" d="'+RD+'" stroke-width="2.2"/>'+
    '<path class="k-pa" d="'+RW+'" stroke-width="1.8"/>'+
    '<path class="k-fn" d="M1170 289.6H1262M1172 289.6v-3.4M1180 289.6v-3.4M1188 289.6v-3.4M1196 289.6v-3.4M1204 289.6v-3.4M1212 289.6v-3.4M1220 289.6v-3.4M1228 289.6v-3.4M1236 289.6v-3.4M1244 289.6v-3.4M1252 289.6v-3.4M1260 289.6v-3.4M1170 287.6H1262" stroke-width=".7"/>'+
    (vRoof?'<path class="k-rs" d="M1170 287.1H1262" stroke-width=".8"/>':'')+
    /* Gondelbahn (Talstation steht vorne beim Dorf) – nur wenn genug Platz ist */
    '<g data-vb="716" data-n="gondel" data-k="talstation">'+GD.a+'</g>'+
  '</svg>';
  /* Dorf: hintere Reihe kleiner, Kirche, vordere Reihe; ein paar Bäume dazwischen, Fichten rahmen rechts */
  var vr=rng(314), H=[
    [1318,265,"F",.7,0,0],[1362,261,"S",.68,1,1],[1468,263,"F",.72,0,0],[1534,261,"S",.64,0,0],
    [1322,293,"S",.97,0,1],[1384,299,"F",1.02,0,0],[1480,297,"F",.99,1,1],[1548,292,"S",.9,1,0]];
  var body='', glow='', smoke=[];
  body+=tree("Pine2",1342,276,.44,"k-t2")+tree("Pine",1506,272,.4,"k-t2")+tree("Tree",1446,270,.36,"k-lx")+tree("Pine2",1562,270,.42,"k-t1");
  H.slice(0,4).forEach(house);
  body+='<g transform="translate(1414 274) scale(.96)">'+church(vRoof)+'</g>';
  body+=tree("Tree",1290,300,.46,"k-lx")+tree("Pine",1432,302,.44,"k-t2")+tree("Pine2",1516,302,.52,"k-t1");
  /* Handy (schmal, das größere Dorf links ist nicht zu sehen): die zwei mittleren Häuser vorne werden SPAR und Feuerwehr (Wunsch Simon 31.10.2026) */
  H.slice(4).forEach(function(h,i){ house(h,i===1||i===2?"alp-dsk":""); });
  [[spar(vRoof),1376,299.5,.84],[feuerwehr(rng(4242),vRoof),1474,299,.86]].forEach(function(m){ var tr='translate('+m[1]+' '+m[2]+') scale('+m[3]+')';
    body+='<g class="alp-mbo" transform="'+tr+'">'+m[0].b+'</g>'; glow+='<g class="alp-mbo" transform="'+tr+'">'+m[0].g+'</g>'; });
  body+=tree("Pine",1288,312,.66,"k-t2")+tree("Pine2",1274,316,.5,"k-t1")+
        tree("Pine2",1572,318,.66,"k-t2");
  function house(h,cls){ var o=h[2]==="F"?chaletF(vr,vRoof):chaletS(vr,vRoof), fl=h[4]?-1:1, tr='translate('+h[0]+' '+h[1]+') scale('+(h[3]*fl)+' '+h[3]+')', c=cls?' class="'+cls+'"':'';
    body+='<g'+c+' transform="'+tr+'">'+o.b+'</g>'; glow+='<g'+c+' transform="'+tr+'">'+o.g+'</g>';
    if(h[5]) smoke.push([h[0]+o.ch[0]*h[3]*fl,h[1]+o.ch[1]*h[3],null,null,cls||""]); }
  /* ganzes Dorf etwas größer (um die Dorfmitte), Rauchpunkte mitrechnen */
  var VS=1.1, VX=1449, VT='translate('+VX+' 300) scale('+VS+') translate(-1440 -300)';
  smoke=smoke.map(function(c){ return [VX+(c[0]-1440)*VS,300+(c[1]-300)*VS,null,null,c[4]||""]; });
  /* Weiler auf einer Waldlichtung (nur auf breiten Bildschirmen sichtbar, über/rechts neben den Schnellknöpfen): zwei Höfe und ein Stadel */
  var hb='', hg='';
  SN.roof=wRoof; SN.cap=wCap;
  [[970,250,"F",.56,0],[1012,247,"S",.5,1]].forEach(function(h){ var o=h[2]==="F"?chaletF(vr,wRoof):chaletS(vr,wRoof), fl=h[4]?-1:1, tr='translate('+h[0]+' '+h[1]+') scale('+(h[3]*fl)+' '+h[3]+')';
    hb+='<g transform="'+tr+'">'+o.b+'</g>'; hg+='<g transform="'+tr+'">'+o.g+'</g>'; });
  hb=tree("Pine2",992,248,.3,"k-t2")+tree("Tree",950,252,.28,"k-lx")+hb+
    '<g transform="translate(1046 250) scale(.56)"><path class="k-wd" d="M-10 0V-9L0 -17L10 -9V0Z"/><rect class="k-wdk" x="-2.6" y="-6.5" width="5.2" height="6.5"/>'+
    '<path class="k-rfs" d="M-12.4 -8L0 -18.6L12.4 -8" stroke-width="2.4"/>'+(wRoof?'<path class="k-rs" d="M-12.9 -9L0 -19.9L12.9 -9" stroke-width="1.7" stroke-linejoin="round"/>':'')+'</g>'+tree("Pine",1064,253,.3,"k-t1")+tree("Pine2",934,255,.32,"k-t1");
  SN.roof=vRoof; SN.cap=vCap;
  /* Größeres Dorf auf breiten Bildschirmen: Gemeindeamt mit Fahne, Gasthof, Feuerwehr, SPAR, Haltestelle mit Postbus und
     verstreute Höfe entlang der Dorfstraße. Jede Gruppe trägt ihren linken Rand (data-vb) – fit() blendet aus, was in den
     Bereich von Uhr, Text oder Schnellknöpfen fiele; schmale Bildschirme behalten das kompakte Dorf. */
  var xr=rng(2718), XB='', XG='', flowers=season==="summer";
  function at(x,y,s,fl){ return 'translate('+x+' '+y+') scale('+(fl?-s:s)+' '+s+')'; }
  function put(o,x,y,s,fl){ var t=at(x,y,s,fl); return {b:'<g transform="'+t+'">'+o.b+'</g>', g:o.g?'<g transform="'+t+'">'+o.g+'</g>':'', ch:o.ch?[x+(fl?-1:1)*o.ch[0]*s,y+o.ch[1]*s]:null}; }
  /* data-vb = linker Rand (Bildkoordinate, Schätzwert); fit() misst ihn beim ersten Mal genau nach. data-k verbindet Gebäude,
     Fensterlicht und Rauch einer Gruppe, damit sie immer gemeinsam erscheinen. */
  function grp(vb,n,parts,extra,smk){ var b='', g=''; parts.forEach(function(o){ b+=o.b; g+=o.g; if(smk&&o.ch) smoke.push([o.ch[0],o.ch[1],vb,n]); });
    XB+='<g data-vb="'+vb+'" data-n="'+n+'" data-k="'+n+'">'+(extra&&extra[0]||'')+b+(extra&&extra[1]||'')+'</g>'; if(g) XG+='<g data-vb="'+vb+'" data-k="'+n+'">'+g+'</g>'; }
  function hof(k,x,y,s,fl){ return put(k==="F"?chaletF(xr,vRoof):chaletS(xr,vRoof),x,y,s,fl); }
  function raw(svg,x,y,s,fl,gl){ return {b:'<g transform="'+at(x,y,s,fl)+'">'+svg+'</g>', g:gl?'<g transform="'+at(x,y,s,fl)+'">'+gl+'</g>':''}; }
  var LG='<circle class="k-gw" cx="1.9" cy="-8.3" r="3.2"/>';
  /* Maßstab nach Tiefe: die vordere Straßenseite (y≈303–308) steht so weit vorne wie die vordere Häuserreihe der Dorfmitte,
     also etwa gleich groß; Fahrzeuge im selben Maßstab wie die Häuser (kein Spielzeug). */
  /* hintere Straßenseite */
  grp(1200,"gemeindeamt",[put(gemeinde(xr,vRoof),1230,279,.86),raw(flag(),1268,280,.86)],[tree("Tree",1192,281,.42,"k-lx")]);
  grp(1098,"gasthof",[put(gasthof(xr,vRoof,flowers),1136,277,.88)],[tree("Pine2",1104,279,.46,"k-t2"),tree("Tree",1170,282,.4,"k-lx")],1);
  grp(854,"hof1",[hof("S",878,276,.8,1)],[tree("Pine",905,279,.44,"k-t1")],1);
  grp(716,"talstation",[raw(talstation(vRoof),742,281,.9)],[tree("Pine2",720,283,.4,"k-t2")]);
  grp(648,"hof2",[hof("F",664,278,.78,0)],[tree("Tree",688,280,.38,"k-lx")],1);
  grp(586,"hof3",[raw(stadel(vRoof),602,276,.8)],[tree("Pine2",620,278,.36,"k-t1")]);
  /* Weide mit Kühen (Weide ≈ 1.060 m): bei Schnee bis dorthin sind die Kühe im Stall, Zaun und Stadeldach verschneit */
  var pRoof=cover(1060,ground)>=.5;
  grp(912,"weide",[raw(stadel(pRoof),1074,268.4,.58),{b:weideSide(pRoof)+(pRoof?weideFront(true):''),g:''}]);
  var COW=pRoof?'':'<div class="alp-cw" data-vb="912" data-k="weide" aria-hidden="true">'+COWS.map(function(o){ return cowEl(o,cab); }).join("")+
    '<svg viewBox="910 268 190 16" style="left:910px;top:268px;width:190px;height:16px">'+weideFront(false)+'</svg></div>';
  /* vordere Straßenseite (Fahrzeuge auf der Straße liegen dazwischen: vor der hinteren, hinter der vorderen Häuserzeile) */
  var XBH=XB; XB=bridge;
  grp(1155,"feuerwehr",[put(feuerwehr(xr,vRoof),1188,305,.98),raw(truck(),1234,308,1)]);
  grp(1044,"spar",[put(spar(vRoof),1098,305,.98),raw(lamp(),1048,300,.9,0,LG),raw(car("k-car2"),1137,307,.85),raw(car("k-car1"),1149,308.6,.85,1)]);
  grp(918,"bus",[raw(busStop(),1000,298,.95),(move?{b:'',g:''}:raw(bus(),962,292,1)),raw(lamp(),936,298,.9,0,LG)],[tree("Tree",924,300,.42,"k-lx")]);
  grp(820,"hof4",[hof("S",846,303,1,0),(move?{b:'',g:''}:raw(car("k-car3"),886,291,.85,1))],[tree("Pine2",878,306,.5,"k-t1")],1);
  grp(680,"hof5",[hof("F",700,303,.96,1)],[tree("Pine",728,306,.48,"k-t2")],1);
  grp(538,"hof6",[hof("S",562,301,.9,0)],[tree("Pine2",594,304,.46,"k-t1")]);
  /* Fahrzeuge (Fahrplan VEHS) fahren in einer eigenen Ebene zwischen den beiden Dorf-Ebenen: vor der hinteren Häuserzeile,
     hinter der vorderen. Zu sehen nur rechts der Dorfgrenze und nicht hinter SPAR/Feuerwehr (CSS-Maske, setzt fit()). */
  var VEH=move?'<div class="alp-vl" aria-hidden="true">'+VEHS.map(vehEl).join("")+'</div>':'';
  var SVF='<svg class="alp-front" viewBox="0 0 1600 320" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">';
  var frontA=SVF+'<defs>'+
    '<linearGradient id="alpHb"><stop offset="0" style="stop-color:var(--a-glowc);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--a-glowc);stop-opacity:0"/></linearGradient>'+
    '<path id="alpPine" d="M0 -50L2.2 -43H1L4.6 -35H2.6L6.6 -26H4.2L8.6 -16H5.8L10 -6H1.2V0H-1.2V-6H-10L-5.8 -16H-8.6L-4.2 -26H-6.6L-2.6 -35H-4.6L-1 -43H-2.2Z"/>'+
    '<path id="alpPine2" d="M0 -52L1.6 -44H.8L3.6 -35H2L5.4 -25H3.4L7 -14H4.6L7.8 -6H1V0H-1V-6H-7.8L-4.6 -14H-7L-3.4 -25H-5.4L-2 -35H-3.6L-.8 -44H-1.6Z"/>'+
    '<g id="alpTree"><rect class="k-trunk" x="-1" y="-9" width="2" height="9"/><path d="M0 -40C6 -38 9.5 -30 9 -22C8.6 -14 4.6 -9 0 -9C-4.6 -9 -8.6 -14 -9 -22C-9.5 -30 -6 -38 0 -40Z"/></g>'+
    /* Schneehauben dazu (nur benutzt, wenn frischer Schnee im Dorf liegt) */
    '<path id="alpPineC" d="'+pineCap([[0,-50,2.2,-43],[1,-43,4.6,-35],[2.6,-35,6.6,-26],[4.2,-26,8.6,-16],[5.8,-16,10,-6]])+'"/>'+
    '<path id="alpPine2C" d="'+pineCap([[0,-52,1.6,-44],[.8,-44,3.6,-35],[2,-35,5.4,-25],[3.4,-25,7,-14],[4.6,-14,7.8,-6]])+'"/>'+
    '<path id="alpTreeC" d="M-8.2 -29.6C-7.6 -36 -3.8 -39.8 0 -40.3C3.8 -39.8 7.6 -36 8.2 -29.6C5.6 -32.6 3 -31 .4 -33C-2.2 -31.2 -5 -32.8 -8.2 -29.6Z"/>'+
    '<filter id="alpBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter></defs>'+
    '<g class="k-glowg" filter="url(#alpBlur)">'+hg+XG+'</g>'+hb+XBH+'</svg>'+COW;
  var frontB=SVF+XB+'<g transform="'+VT+'"><g class="k-glowg" filter="url(#alpBlur)">'+glow+'</g>'+body+'</g></svg>';
  SN.roof=SN.cap=false;
  /* Linie der Schneefallgrenze (gestrichelt, als Höhenlinie) und Höhe für Schild und Niederschlag */
  var sll='', sly=0, spy=0;
  if(fresh){ var prev=null; for(x=0;x<=VW;x+=5){ var yy=yLine(fresh,x); if(yy>VH-3){ prev=null; continue; } sll+=(prev===null||Math.abs(yy-prev)>4?'M':'L')+x+' '+n1(yy); prev=yy; }
    sly=Math.max(26,Math.min(276,yLine(fresh,1565))); spy=yLine(fresh,1420); }
  return (LCACHE[key]={back:back,back2:back2,gon:GD.gon,front:frontA+VEH+frontB,smoke:smoke,sll:sll,sly:sly,spy:spy});
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
  var sv={u:cover(1100,st.ground),v:cover(A_VAL+10,st.ground)}, p=palette(st.theme,st.phase,st.ic,sv,st.season);
  /* Morgen- und Abendlicht: Tagesfarben ein Stück Richtung Dämmerung (nur Farben; Fenster bleiben dunkel, Gondeln fahren) */
  if(st.warm){ var q=palette(st.theme,"dusk",st.ic,sv,st.season), cr=/^(#[0-9a-f]{6}|rgba?\()/i;
    for(var pk in p) if(typeof p[pk]==="string"&&typeof q[pk]==="string"&&cr.test(p[pk])&&cr.test(q[pk])) p[pk]=mix(p[pk],q[pk],st.warm*.55); }
  var L=landscape(st.fresh,st.ground,st.season,!st.rm,!st.rm&&st.phase!=="night"), ic=st.ic, night=st.phase==="night", r=rng(99), i, h='';
  var vars=""; for(var k in p) vars+="--a-"+k+":"+p[k]+";";
  var clouds=/cloud|rain|snow|storm|fog/.test(ic), sun=st.phase==="day"&&/sun|cloudSun/.test(ic), clear=/sun|cloudSun/.test(ic);   // Sonne nur, solange sie über den Bergen steht
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
  h+=L.back2+L.gon;
  /* Schneefallgrenze als gestrichelte Höhenlinie: genau dort, wo der Schnee beginnt (Bergkette, Kamm, Wald, Talwiese) */
  if(st.snowLine&&L.sll) h+='<svg class="alp-sll" viewBox="0 0 1600 320" preserveAspectRatio="xMaxYMax slice" aria-hidden="true"><path class="h" d="'+L.sll+'"/><path d="'+L.sll+'"/></svg>';
  if(ic==="fog") for(i=0;i<3;i++) h+='<div class="alp-fog" style="bottom:'+(8+i*12)+'%;animation-duration:'+(38+i*14)+'s;animation-delay:-'+(i*9)+'s"></div>';
  h+=L.front;
  h+='<div class="alp-smoke">'; L.smoke.forEach(function(c,j){ h+='<div class="alp-chim'+(c[4]?" "+c[4]:"")+'" data-x="'+n1(c[0])+'" data-y="'+n1(c[1])+'"'+(c[2]!=null?' data-vb="'+c[2]+'" data-k="'+c[3]+'"':'')+'>';
    for(var w=0;w<2;w++) h+='<i style="animation-delay:-'+(w*3.6+j*1.3).toFixed(1)+'s"><svg viewBox="0 0 20 60"><path d="M10 59C6.5 50 13.5 42 10 33C6.5 24 13 15 9.5 3" fill="none" stroke="url(#alpSm)" stroke-width="2.6" stroke-linecap="round"/></svg></i>';
    h+='</div>'; }); h+='</div>';
  if(ic==="fog") h+='<div class="alp-fog alp-fog2" style="bottom:2%;animation-duration:46s"></div>';
  /* Niederschlag folgt der Schneefallgrenze: liegt sie unter dem Dorf, schneit es bis ganz unten; liegt sie im Bild darüber,
     regnet es unten und schneit nur oberhalb (weicher Übergang, die Höhe setzt fit()); liegt sie über dem Bild, regnet es. */
  var wet=/rain|snow|storm/.test(ic), S=st.fresh, py=L.spy, allSnow=wet&&(ic==="snow"?!S||S<=A_FOOT:S&&S<=A_FOOT), split=wet&&!allSnow&&S&&py>24;
  var RAIN='<div class="alp-pr alp-rain"><i style="background-image:'+rainTile(p,90,150,9,3)+';--t:150px;animation-duration:.62s"></i><i style="background-image:'+rainTile(p,70,110,8,7)+';--t:110px;animation-duration:.85s;opacity:.55"></i></div>';
  function flakes(n){ return '<div class="alp-pr alp-snow">'+
    (n>2?'<b style="animation-duration:5s"><i style="background-image:'+snowTile(p,150,9,.8,1.4,4)+';--t:150px;animation-duration:9s"></i></b>':'')+
    '<b style="animation-duration:6.5s;animation-delay:-2s"><i style="background-image:'+snowTile(p,190,7,1.3,2.1,8)+';--t:190px;animation-duration:7.5s"></i></b>'+
    '<b style="animation-duration:4.2s;animation-delay:-1s"><i style="background-image:'+snowTile(p,240,5,2,2.9,12)+';--t:240px;animation-duration:6s"></i></b></div>'; }
  if(split) h+='<div class="alp-pz" data-pz="dn" data-y="'+n1(py)+'">'+RAIN+'</div><div class="alp-pz" data-pz="up" data-y="'+n1(py)+'">'+flakes(2)+'</div>';
  else if(allSnow||ic==="snow") h+=flakes(3);
  else if(/rain|storm/.test(ic)) h+=RAIN;
  if(st.snowLine) h+='<span class="alp-slb" data-y="'+n1(L.sly)+'">❄ '+String(Math.round(st.snowLine)).replace(/\B(?=(\d{3})+(?!\d))/g,".")+' m</span>';
  var el=document.createElement("div"); el.className="ag-alp ph-"+st.phase+" wx-"+ic; el.setAttribute("aria-hidden","true"); el.style.cssText=vars;
  el.innerHTML=cloudDefs()+h; return el;
}

/* ---------- Zustand ---------- */
function theme(){ var t=document.documentElement.getAttribute("data-theme"); if(t==="light") return "light"; if(t==="glas"||t==="dark") return t; return F.isDark&&F.isDark()?"dark":"light"; }
function state(){ var w=F.D&&F.D.weather||{}, ic=/^(sun|cloudSun|cloud|rain|snow|fog|storm)$/.test(w.icon)?w.icon:"cloud", s=sky(), sl=+w.snowLine;
  sl=isFinite(sl)&&sl>0?Math.round(sl/50)*50:0;
  /* fresh = Schneefallgrenze (frischer Schnee, auch auf Bäumen und Autos); schneit es ohne Angabe, dann bis ins Tal.
     ground = bis wohin Schnee liegt: wie fresh, im Winter (Dez.–März) immer bis ins Tal (Schneedecke). */
  var winter=[11,0,1,2].indexOf(s.month)>-1, fresh=sl||(ic==="snow"?900:0), ground=winter?Math.min(fresh||900,900):fresh;
  var season=[8,9,10].indexOf(s.month)>-1?"autumn":[4,5,6,7].indexOf(s.month)>-1?"summer":"other";
  return {theme:theme(),phase:s.phase,warm:s.warm,e:s.e,t:s.t,ic:ic,snowLine:sl,fresh:fresh,ground:ground,season:season,rm:reduced()}; }
/* „Bewegung reduzieren“: Fahrzeuge parken (wie im Standbild), Kabinen hängen still – das Bild wird dafür neu gebaut */
var MQ=null; try{ MQ=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)"); }catch(e){}
function reduced(){ return !!(MQ&&MQ.matches); }

/* ---------- Einhängen und Ausmessen ---------- */
var CUR={key:"",el:null}, RO=null, OBS=[], RAF=0, LASTFIT="";
function mount(){
  if(F.current!=="heute") return;
  var hero=document.querySelector("#main .ag-hero"); if(!hero) return;
  var st=state(), key=[st.theme,st.phase,st.warm,st.ic,st.snowLine,st.fresh,st.ground,st.season,st.rm].join("|");
  if(CUR.key!==key||!CUR.el){ var old=CUR.el; CUR.el=build(st); CUR.key=key; CUR.st=st; LASTFIT=""; if(old&&old.parentNode) old.parentNode.removeChild(old); }
  CUR.st.t=st.t; CUR.st.e=st.e;
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
  ["ag-clock","ag-date","ag-wx","ag-fc4","ag-greet"].forEach(function(c){ var e=hero.querySelector("."+c); if(!e) return; var rg=document.createRange(); rg.selectNodeContents(e);
    var rs=rg.getClientRects(); for(var j=0;j<rs.length;j++){ var q=rs[j]; if(q.width<1) continue; var x1=q.right-hb.left;
      rects.push([q.left-hb.left,q.top-hb.top,x1,q.bottom-hb.top]); all=Math.max(all,x1); if(c==="ag-clock"||c==="ag-date") big=Math.max(big,x1); } });
  /* rechter Rand der Schnellknöpfe (die Gebäude des größeren Dorfs bleiben rechts davon) */
  var qr=0, qa=hero.querySelector(".ag-qa"); if(qa) for(var k=0;k<qa.children.length;k++){ var cb=qa.children[k].getBoundingClientRect(); if(cb.width) qr=Math.max(qr,cb.right-hb.left); }
  var sig=[W,H,Math.round(all),Math.round(big),Math.round(qr),rects.length,rects.map(function(q){ return Math.round(q[1])+","+Math.round(q[2]); }).join(";")].join("|");
  var sc=Math.max(W/VW,H/VH);
  if(sig!==LASTFIT){ LASTFIT=sig;
    el.style.width=W.toFixed(1)+"px"; el.style.height=H.toFixed(1)+"px"; el.style.setProperty("--sc",sc.toFixed(4)); el.classList.toggle("alp-mob",mob);
    var m=maskSvg(W,H,big||all,rects,mob,CUR.st.theme); el.style.webkitMaskImage=m; el.style.maskImage=m;
    /* größeres Dorf: nur Gebäude zeigen, die ganz im voll sichtbaren Teil stehen (nie hinter Uhr, Text oder Schnellknöpfen) */
    var thr=Math.max(fadeEnd(W,big||all,mob)-24,qr?qr+28:0,all+16), vx=VW-(W-thr)/sc;
    if(!el._vbm) measure(el);
    el.querySelectorAll("[data-vb]").forEach(function(g){ g.style.display=+g.getAttribute("data-vb")>=vx?"":"none"; });
    /* Fahrzeuge: erst ab der Dorfgrenze sichtbar (weich eingeblendet), Bus und weitere Autos nur mit „ihrem“ Dorfteil */
    var vl=el.querySelector(".alp-vl"); if(vl){ var lx=Math.round(Math.max(vx-24,500)), vm=vehMask(lx); vl.style.webkitMaskImage=vm; vl.style.maskImage=vm; }
    el.querySelectorAll("[data-vw]").forEach(function(v){ var g=el.querySelector('[data-n="'+v.getAttribute("data-vw")+'"]'); v.style.display=!g||g.style.display!=="none"?"":"none"; }); }
  /* Sonne, Mond, Rauch und Schneefallgrenze an Bildkoordinaten ausrichten (Bild ist rechts unten verankert) */
  var P=function(x,y){ return [W-(VW-x)*sc,H-(VH-y)*sc]; };
  var ux=Math.min(1530,VW-(W-((big||all)+70))/sc);   // Sonne/Mond nie hinter der Uhr
  el.querySelectorAll("[data-x]").forEach(function(e){ var x=+e.getAttribute("data-x"); if(e.classList.contains("alp-moon")) x=Math.max(x,ux);
    var q=P(x,+e.getAttribute("data-y")); e.style.transform="translate("+q[0].toFixed(1)+"px,"+q[1].toFixed(1)+"px)"; });
  var su=el.querySelector(".alp-sun"); if(su){ var t=CUR.st.t, x0=Math.max(1300,ux), q=P(x0+(1540-x0)*t,104-50*Math.min(1,Math.max(0,CUR.st.e||0)/35)); su.style.transform="translate("+q[0].toFixed(1)+"px,"+q[1].toFixed(1)+"px)"; }
  /* Schild der Schneefallgrenze: über der Linie; liegt sie über dem sichtbaren Bild (sehr breit, oben angeschnitten),
     bleibt das Schild sichtbar am oberen Rand und zeigt mit ↑, dass die Grenze noch höher liegt */
  var sl=el.querySelector(".alp-slb"); if(sl){ var sy=P(0,+sl.getAttribute("data-y"))[1], smin=(CUR.st.theme==="light"?Math.min(.16*H,44):Math.min(.2*H,56))+20;
    sl.style.top=Math.max(sy,smin).toFixed(1)+"px"; sl.classList.toggle("up",sy<smin-4); }
  /* Schneefallgrenze: gestrichelt erst dort, wo die Kulisse voll sichtbar ist (nie als Verlängerung der Textzeile) */
  var sll=el.querySelector(".alp-sll"); if(sll){ var sx=Math.max(fadeEnd(W,big||all,mob)-70,all+60), sm='linear-gradient(90deg,transparent '+Math.round(sx)+'px,#000 '+Math.round(sx+70)+'px)';
    sll.style.webkitMaskImage=sm; sll.style.maskImage=sm; sll.style.display=W-sx<150?"none":""; }
  /* Regen unten, Schnee oben: weich ineinander übergehend um die Höhe der Schneefallgrenze */
  el.querySelectorAll(".alp-pz").forEach(function(z){ var y=P(0,+z.getAttribute("data-y"))[1], up=z.getAttribute("data-pz")==="up",
    m='linear-gradient(180deg,'+(up?'#000':'transparent')+' '+Math.round(y-(up?10:26)*sc)+'px,'+(up?'transparent':'#000')+' '+Math.round(y+(up?22:6)*sc)+'px)';
    z.style.webkitMaskImage=m; z.style.maskImage=m; });
  el.querySelectorAll("[data-band]").forEach(function(e){ e.style.top=(P(0,+e.getAttribute("data-band"))[1]).toFixed(1)+"px"; });
}
/* linke Ränder der Dorf-Gruppen einmal genau messen (Bildkoordinaten, inkl. Bäume, Fahne, Fahrzeuge);
   Teile mit gleichem data-k (Gebäude, Fensterlicht, Rauch, Gondelseil + Talstation) teilen den kleinsten Wert */
function measure(el){ var mins={}, ok=false, all=el.querySelectorAll("[data-k]");
  all.forEach(function(g){ g.style.display=""; });
  all.forEach(function(g){ if(typeof g.getBBox!=="function") return; try{ var b=g.getBBox(), k=g.getAttribute("data-k"), x=b.x;
    /* getBBox() liefert Koordinaten ohne das eigene transform des Elements – das hier noch anwenden (z. B. Brücke) */
    var t=g.transform&&g.transform.baseVal&&g.transform.baseVal.numberOfItems?g.transform.baseVal.consolidate():null;
    if(t){ var M=t.matrix; x=Math.min(M.a*b.x+M.c*b.y,M.a*(b.x+b.width)+M.c*b.y,M.a*b.x+M.c*(b.y+b.height),M.a*(b.x+b.width)+M.c*(b.y+b.height))+M.e; }
    if(b.width>0){ ok=true; mins[k]=Math.min(mins[k]==null?1e9:mins[k],x); } }catch(e){} });
  if(!ok) return;
  all.forEach(function(g){ var v=mins[g.getAttribute("data-k")]; if(v!=null) g.setAttribute("data-vb",Math.floor(v)); });
  el._vbm=1; }
/* Maske der Fahrzeug-Ebene (Bildeinheiten): links ab der Dorfgrenze lx weich eingeblendet; SPAR und Feuerwehrhalle sind
   niedriger als ein Bus – dahinter verschwinden Fahrzeuge ganz, sonst führen sie scheinbar übers Dach */
function vehMask(lx){ return tile('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="320"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="'+lx+'" y1="0" x2="'+(lx+56)+'" y2="0">'+
  '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>'+
  '<path fill-rule="evenodd" fill="url(#g)" d="M0 0H1600V320H0ZM1066.4 0h63.2v320h-63.2zM1158.5 0h59.5v320h-59.5z"/></svg>'); }
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
    /* Ecke rechts unten (zwischen „Für dich, jetzt“ und „Heute“): weich auslaufen statt harter Kante */
    (mob?'':'<radialGradient id="c" gradientUnits="userSpaceOnUse" cx="'+W.toFixed(1)+'" cy="'+H.toFixed(1)+'" r="'+Math.min(110,H*.45).toFixed(1)+'"><stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset=".22" stop-color="#000" stop-opacity=".9"/><stop offset=".6" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>')+
    '<mask id="mh" maskUnits="userSpaceOnUse" x="0" y="0" width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'"><rect width="100%" height="100%" fill="url(#h)"/></mask>'+
    '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="'+W.toFixed(1)+'" height="'+H.toFixed(1)+'"><rect width="100%" height="100%" fill="url(#v)" mask="url(#mh)"/><g filter="url(#b)" fill="#000" opacity=".74">'+k+'</g>'+(mob?'':'<rect width="100%" height="100%" fill="url(#c)"/>')+'</mask></defs>'+
    '<rect width="100%" height="100%" fill="#000" mask="url(#m)"/></svg>';
  return tile(svg);
}

var main=document.getElementById("main");
if(main&&window.MutationObserver) new MutationObserver(function(){ mount(); }).observe(main,{childList:true,subtree:false});
if(F.onData) F.onData(function(){ setTimeout(mount,0); });
document.addEventListener("fsc-theme",function(){ setTimeout(mount,0); });
setInterval(mount,5*60*1000);   // Tageszeit, Sonnenstand
if(MQ){ var mqf=function(){ setTimeout(mount,0); }; if(MQ.addEventListener) MQ.addEventListener("change",mqf); else if(MQ.addListener) MQ.addListener(mqf); }
setTimeout(mount,600);


F.css(
".ag-hero.has-alp{position:relative;isolation:isolate}.ag-hero.has-alp>*:not(.ag-alp){position:relative;z-index:1}"+
".ag-alp{position:absolute;left:0;top:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:hidden;contain:strict;text-shadow:none;"+
  "-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}"+
".ag-alp>*{position:absolute}.alp-defs{width:0;height:0;overflow:hidden}"+
".alp-sky{inset:0;background:linear-gradient(180deg,var(--a-s1) 0%,var(--a-s2) 30%,var(--a-s3) 58%)}"+
".alp-back,.alp-front{left:0;top:0;width:100%;height:100%;display:block}"+
/* Landschaft */
".ag-alp .k-mid{fill:url(#alpGm)}.ag-alp .k-near{fill:url(#alpGn)}.ag-alp .k-g{fill:url(#alpGg)}.ag-alp .k-haze{fill:url(#alpGh)}"+
".ag-alp .k-ms{fill:var(--a-ms)}.ag-alp .k-mss{fill:var(--a-mss)}.ag-alp .k-msh{fill:url(#alpGsm)}.ag-alp .k-mli{fill:url(#alpGlm)}"+
/* Schnee nach Höhe: Saum unter der Schneedecke der Kette, Schnee am Kamm, Schleier und Hauben im Wald, Schneise, Straßenrand */
".ag-alp .k-msd{fill:var(--a-ms);opacity:.42}.ag-alp .k-sng{fill:var(--a-sng)}.ag-alp .k-sv{fill:var(--a-ms);opacity:.2}"+
".ag-alp .k-rib{fill:none;stroke:var(--a-m1);opacity:.2;stroke-linecap:round;stroke-linejoin:round}.ag-alp .k-sc,.ag-alp .k-sgl{fill:var(--a-ms)}.ag-alp .k-sc1{opacity:.9}.ag-alp .k-pab{fill:none;stroke:var(--a-ms);stroke-linecap:round}"+
".ag-alp .k-t1{fill:var(--a-t1)}.ag-alp .k-t2{fill:var(--a-t2)}.ag-alp .k-lx{fill:var(--a-lx)}.ag-alp .k-trunk{fill:var(--a-wdk)}"+
".ag-alp .k-rv{fill:none;stroke:var(--a-rv);opacity:.8}.ag-alp .k-pa{fill:none;stroke:var(--a-pa);stroke-linecap:round}.ag-alp .k-fn{fill:none;stroke:var(--a-fn);opacity:.5}"+
".alp-mob .alp-slb,.alp-mob .alp-sll{display:none!important}"+
".alp-sll{left:0;top:0;width:100%;height:100%;display:block;overflow:visible}"+
".alp-sll path{fill:none;stroke:var(--a-sl);stroke-width:calc(1px / var(--sc,1));stroke-dasharray:calc(4px / var(--sc,1)) calc(3px / var(--sc,1))}"+
/* heller (im Glas dunkler) Saum unter jedem Strich: auf Schnee wie auf dunklem Wald lesbar */
".alp-sll path.h{stroke:rgba(255,255,255,.6);stroke-width:calc(2.6px / var(--sc,1));stroke-dasharray:calc(5px / var(--sc,1)) calc(2px / var(--sc,1));stroke-dashoffset:calc(.5px / var(--sc,1))}"+
":root[data-theme='glas'] .alp-sll path.h,:root[data-theme='dark'] .alp-sll path.h{stroke:rgba(8,14,26,.35)}"+
/* Dorf */
".ag-alp .k-pl,.ag-alp .k-chu{fill:var(--a-pl)}.ag-alp .k-chu{fill:var(--a-ch)}.ag-alp .k-pls{fill:var(--a-pls)}.ag-alp .k-wd{fill:var(--a-wd)}.ag-alp .k-wdk{fill:var(--a-wdk)}"+
".ag-alp .k-rf{fill:var(--a-rf)}.ag-alp .k-rfs{fill:none;stroke:var(--a-rf)}.ag-alp .k-rfl{fill:none;stroke:var(--a-rfl)}.ag-alp .k-rs{fill:none;stroke:var(--a-ms);stroke-linecap:round}.ag-alp .k-rsf{fill:var(--a-ms)}"+
".ag-alp .k-win{fill:var(--a-win)}.ag-alp .k-wino{fill:var(--a-wino)}.ag-alp .k-sh{fill:var(--a-shut)}.ag-alp .k-sp{fill:var(--a-sp)}.ag-alp .k-spl{fill:var(--a-spl)}.ag-alp .k-spk{fill:none;stroke:var(--a-sp)}"+
".ag-alp .k-glowg{opacity:var(--a-glow)}.ag-alp .k-gw{fill:var(--a-glowc)}"+
/* größeres Dorf: Akzentfarben, Glas, Schrift */
".ag-alp .k-rfh{fill:var(--a-rfl)}.ag-alp .k-rss{fill:var(--a-mss)}.ag-alp .k-gls{fill:var(--a-gls)}.ag-alp .k-mtl{fill:var(--a-mtl)}.ag-alp .k-tyre{fill:var(--a-tyre)}"+
".ag-alp .k-mul{fill:none;stroke:var(--a-mtl)}.ag-alp .k-cbl{fill:none;stroke:var(--a-cblc)}.ag-alp .k-cblh{fill:none;stroke:var(--a-cblh)}"+
".ag-alp .k-refl{fill:var(--a-refl)}.ag-alp .k-shelf{fill:none;stroke:var(--a-shelf);opacity:.55}.ag-alp .k-lar{fill:var(--a-lar)}.ag-alp .k-lrl{fill:none;stroke:var(--a-lrl);opacity:.45}"+
".ag-alp .k-bal{fill:none;stroke:var(--a-wd);opacity:.7}.ag-alp .k-brr{fill:none;stroke:var(--a-wdk);stroke-linecap:round}.ag-alp .k-flw{fill:var(--a-flw)}.ag-alp .k-gold{fill:var(--a-gold)}"+
".ag-alp .k-fw{fill:var(--a-fw)}.ag-alp .k-fwls{fill:none;stroke:var(--a-fwl)}.ag-alp .k-fwt{fill:var(--a-fw)}.ag-alp .k-flr{fill:var(--a-flr)}.ag-alp .k-blu{fill:var(--a-blu)}"+
".ag-alp .k-spg{fill:var(--a-spg)}.ag-alp .k-spr{fill:var(--a-spr)}.ag-alp .k-txt,.ag-alp .k-txf{fill:var(--a-txt)}.ag-alp .k-hh{fill:var(--a-hh)}.ag-alp .k-hgt{fill:var(--a-hg)}"+
".ag-alp .k-glv{fill:var(--a-glv)}.ag-alp .k-glc{fill:var(--a-glc)}.ag-alp .k-car4{fill:var(--a-car4)}"+
".ag-alp .k-hl{fill:var(--a-glowc);opacity:var(--a-glow)}.ag-alp .k-tl{fill:#ff3b30;opacity:var(--a-glow)}.ag-alp .k-beam{fill:url(#alpHb);opacity:calc(var(--a-glow)*.75)}"+
".ag-alp .k-cow{fill:var(--a-cow)}.ag-alp .k-cowd{fill:var(--a-cowd)}.ag-alp .k-cowm{fill:var(--a-cowm)}.ag-alp .k-horn{fill:none;stroke:var(--a-horn)}.ag-alp .k-ctl{fill:none;stroke:var(--a-cowd)}.ag-alp .k-fnw{fill:none;stroke:var(--a-fn);stroke-linecap:round}"+
".ag-alp .k-cab{fill:var(--a-cab)}.ag-alp .k-bus{fill:var(--a-bus)}.ag-alp .k-busd{fill:var(--a-busd)}.ag-alp .k-car1{fill:var(--a-car1)}.ag-alp .k-car2{fill:var(--a-car2)}.ag-alp .k-car3{fill:var(--a-car3)}"+
".ag-alp .k-tx{font-family:Arial,Helvetica,sans-serif;font-weight:800}"+
/* bewegte Ebenen (Fahrzeuge, Gondel): 1600×320 Bildeinheiten, rechts unten verankert wie die SVG-Bilder */
".alp-vl,.alp-gl,.alp-cw{right:0;bottom:0;width:1600px;height:320px;transform-origin:100% 100%;transform:scale(var(--sc,1));"+
  "-webkit-mask-size:1600px 320px;mask-size:1600px 320px;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}"+
".alp-mv,.alp-st{position:absolute;left:0;top:0;width:0;height:0}.alp-mv{animation:alpV0 100s linear infinite;will-change:transform}.alp-gl .alp-mv{animation-duration:"+GOND+"s}"+
".alp-mob .alp-vl,.alp-mob .alp-cw{display:none}.alp-mv>b{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0}.alp-vl svg,.alp-gl svg,.alp-cw svg{position:absolute;overflow:visible}"+
/* Kühe: grasen (Kopf senkt sich), wedeln ab und zu mit dem Schwanz, eine geht sehr langsam ein Stück und wieder zurück */
".alp-cow,.alp-cow>u,.alp-cow b{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0}"+
".cw-hd.g{animation:alpCwG 13s ease-in-out infinite}.cw-tl.w{animation:alpCwT 8s linear infinite}.alp-cow>u.w{animation:alpCwW 150s ease-in-out infinite;animation-delay:-40s}"+
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
/* Handy: SPAR und Feuerwehr statt zweier Häuser im Ortskern; breit: umgekehrt (dort stehen sie im größeren Dorf links) */
".alp-mob .alp-dsk,.ag-alp:not(.alp-mob) .alp-mbo{display:none}"+
".alp-chim>i{position:absolute;left:calc(var(--sc)*-6px);bottom:0;width:calc(var(--sc)*12px);height:calc(var(--sc)*38px);transform-origin:50% 100%;opacity:0;animation:alpSmoke 7.2s ease-out infinite}"+
".alp-chim>i>svg{display:block;width:100%;height:100%;overflow:visible}"+
/* Niederschlag: Kacheln, die sich nur verschieben */
".alp-pr{inset:-20%;pointer-events:none}.alp-rain{transform:rotate(11deg)}.alp-pz{inset:0;pointer-events:none}.alp-pz>.alp-pr{position:absolute}"+
".alp-pr i{position:absolute;left:0;right:0;top:calc(var(--t)*-1);bottom:0;animation:alpFall 1s linear infinite}"+
".alp-snow>b{position:absolute;inset:0;animation:alpSway 5s ease-in-out infinite alternate}"+
/* Schneefallgrenze */
".alp-slb{right:12px;margin-top:-22px;padding:2px 8px;border-radius:99px;font:600 11px/1.45 var(--f-body);letter-spacing:.02em;white-space:nowrap;"+
  "color:var(--ink-2);background:color-mix(in srgb,var(--panel-solid,#fff) 70%,transparent);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}"+
":root[data-theme='glas'] .alp-slb,:root[data-theme='dark'] .alp-slb{color:#eef3fa;background:rgba(10,18,30,.42)}.alp-slb.up:after{content:' ↑';opacity:.7}"+
"@keyframes alpTw{0%,100%{opacity:.35}50%{opacity:1}}"+
"@keyframes alpDrift{from{transform:translateX(0)}to{transform:translateX(calc(100% + 420px))}}"+
"@keyframes alpFlash{0%,86%,100%{opacity:0}87%{opacity:.85}88%{opacity:.1}89.5%{opacity:.6}92%{opacity:0}}"+
"@keyframes alpFog{from{transform:translateX(-6%)}to{transform:translateX(6%)}}"+
"@keyframes alpSmoke{0%{opacity:0;transform:translateY(0) scale(.7,.6)}18%{opacity:.85}70%{opacity:.35}100%{opacity:0;transform:translate(calc(var(--sc)*-7px),calc(var(--sc)*-22px)) scale(1.6,1.25)}}"+
"@keyframes alpFall{from{transform:translateY(0)}to{transform:translateY(var(--t))}}"+
"@keyframes alpSway{from{transform:translateX(-10px)}to{transform:translateX(10px)}}"+
"@keyframes alpCwG{0%,46%{transform:rotate(50deg)}23%{transform:rotate(44deg)}54%,78%{transform:rotate(0)}86%,100%{transform:rotate(50deg)}}"+
"@keyframes alpCwT{0%,70%,100%{transform:rotate(0)}74%{transform:rotate(16deg)}78%{transform:rotate(-9deg)}82%{transform:rotate(13deg)}86%{transform:rotate(0)}}"+
"@keyframes alpCwW{0%,30%{transform:translateX(0) scaleX(1)}50%{transform:translateX(15px) scaleX(1)}51.5%,58%{transform:translateX(15px) scaleX(-1)}78%{transform:translateX(0) scaleX(-1)}79.5%,100%{transform:translateX(0) scaleX(1)}}"+
motionCSS()+
"@media (prefers-reduced-motion:reduce){.ag-alp *{animation:none!important}.alp-vl,.alp-gl .alp-mv{display:none}.alp-chim>i{opacity:.6}.alp-chim>i+i{opacity:0}.alp-stars{opacity:.8}}"
);
})();
