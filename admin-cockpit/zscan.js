/* Beleg-Scanner: Foto → Blatt erkennen, zuschneiden und entzerren → Scan-Filter (Schatten/Licht ausgleichen, weißes Papier,
   dunkle scharfe Schrift) → JPEG bis 3000 px. Alles läuft in einem Web Worker (OpenCV wird dort einmal nachgeladen) –
   die Oberfläche friert nicht ein. Ohne erkannte Kanten bleibt das ganze Bild, der Filter wird trotzdem angewendet.
   Schnittstelle: F.scanDoc(file) → Promise {name, mime, data(dataURL), cropped} */
(function(){
"use strict";
var F=window.FSC;
var CV_URL="https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
function workerSrc(){ return "var CV_URL="+JSON.stringify(CV_URL)+";\n("+function(){
  var cvReady=null;
  // Achtung: das OpenCV-Modul hat selbst ein .then – nie direkt als Promise-Ergebnis übergeben (sonst wartet es ewig) → in {cv} verpacken
  function loadCv(){ if(cvReady) return cvReady; cvReady=new Promise(function(res){ try{ self.importScripts(CV_URL); }catch(e){ return res({cv:null}); }
    var cv=self.cv; if(!cv) return res({cv:null});
    if(cv.Mat) return res({cv:cv});
    if(typeof cv.then==="function") cv.then(function(m){ self.cvM=m; res({cv:m}); });
    else cv.onRuntimeInitialized=function(){ res({cv:self.cv}); };
    setTimeout(function(){ res({cv:self.cvM||null}); },30000); }); return cvReady; }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
  // Ecken ordnen (oben-links, oben-rechts, unten-rechts, unten-links) – auch bei starker Drehung: Winkel um den Schwerpunkt
  // sortieren (im Uhrzeigersinn), dann die Drehung wählen, bei der die obere Kante am waagrechtesten liegt; längliche Belege
  // bevorzugt hochkant (Grenzfall um 45°)
  function order(p){
    var cx=0, cy=0, i; for(i=0;i<4;i++){ cx+=p[i].x/4; cy+=p[i].y/4; }
    var s=p.slice().sort(function(a,b){ return Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx); });
    var bi=0, bv=-9;
    for(i=0;i<4;i++){ var a=s[i], b=s[(i+1)%4], c=s[(i+2)%4], top=dist(a,b), side=dist(b,c), v=(b.x-a.x)/Math.max(1e-6,top);
      if(side>=top*1.25) v+=0.35;
      if(v>bv){ bv=v; bi=i; } }
    return [s[bi],s[(bi+1)%4],s[(bi+2)%4],s[(bi+3)%4]];
  }
  function polyArea(o){ var a=0; for(var i=0;i<o.length;i++){ var p=o[i], q=o[(i+1)%o.length]; a+=p.x*q.y-q.x*p.y; } return Math.abs(a)/2; }
  function matPts(m){ var r=[]; for(var j=0;j<m.rows;j++) r.push({x:m.data32S[j*2],y:m.data32S[j*2+1]}); return r; }
  function boxPts(r){ var a=r.angle*Math.PI/180, c=Math.cos(a)/2, s=Math.sin(a)/2, w=r.size.width, h=r.size.height, x=r.center.x, y=r.center.y;
    return [{x:x-c*w+s*h,y:y-s*w-c*h},{x:x+c*w+s*h,y:y+s*w-c*h},{x:x+c*w-s*h,y:y+s*w+c*h},{x:x-c*w-s*h,y:y-s*w+c*h}]; }
  // Kontur → 4 Ecken: approxPolyDP mit wachsender Toleranz, dann über die konvexe Hülle, zuletzt minAreaRect (leicht gewölbte Belege)
  function quadOf(cv,c){
    var per=cv.arcLength(c,true), ap=new cv.Mat(), hull=new cv.Mat(), f, res=null, kind="poly";
    try{
      for(f=0.015;f<0.061&&!res;f+=0.009){ cv.approxPolyDP(c,ap,f*per,true); if(ap.rows===4&&cv.isContourConvex(ap)) res=matPts(ap); }
      if(!res){ kind="hull"; cv.convexHull(c,hull,false,true); var hp=cv.arcLength(hull,true);
        for(f=0.015;f<0.061&&!res;f+=0.009){ cv.approxPolyDP(hull,ap,f*hp,true); if(ap.rows===4) res=matPts(ap); } }
      if(!res){ kind="rect"; res=boxPts(cv.minAreaRect(c)); }
    } finally { ap.delete(); hull.delete(); }
    return {p:res,kind:kind};
  }
  // Kandidat bewerten: Größe, Rechteckigkeit, Seitenverhältnis/Winkel, Helligkeitssprung innen↔außen entlang der Kanten,
  // Kanten-Treffer (Canny) und Anteil heller Papierfläche im Inneren
  function rate(cv,cand,X){
    var o=order(cand.p), A=polyArea(o), fr=A/X.area, i, k, j;
    if(fr<0.03||fr>0.98) return null;
    var L=[dist(o[0],o[1]),dist(o[1],o[2]),dist(o[2],o[3]),dist(o[3],o[0])], w=(L[0]+L[2])/2, h=(L[1]+L[3])/2;
    if(Math.max(w,h)/Math.max(1,Math.min(w,h))>9) return null;
    for(i=0;i<4;i++){ var p=o[(i+3)%4], q=o[i], r=o[(i+1)%4], ang=Math.acos(Math.max(-1,Math.min(1,((p.x-q.x)*(r.x-q.x)+(p.y-q.y)*(r.y-q.y))/Math.max(1e-6,dist(p,q)*dist(r,q)))))*180/Math.PI;
      if(ang<40||ang>140) return null; }
    var rect=Math.min(cand.area,A)/Math.max(cand.area,A,1);
    var d=Math.max(3,Math.round(X.md*0.012)), n=0, ok=0, nd=0, ed=0, cw=X.cols, ch=X.rows, wv=X.wv, ev=X.ev;
    for(k=0;k<4;k++){ var a=o[k], b=o[(k+1)%4], len=Math.max(1e-6,L[k]), nx=(b.y-a.y)/len, ny=-(b.x-a.x)/len;
      for(j=0;j<24;j++){ var t=(j+0.5)/24, px=a.x+(b.x-a.x)*t, py=a.y+(b.y-a.y)*t, ix=Math.round(px), iy=Math.round(py); n++;
        if(ix>=0&&iy>=0&&ix<cw&&iy<ch&&ev[iy*cw+ix]) ed++;
        var xi=Math.round(px-nx*d), yi=Math.round(py-ny*d), xo=Math.round(px+nx*d), yo=Math.round(py+ny*d);
        if(xo<0||yo<0||xo>=cw||yo>=ch||xi<0||yi<0||xi>=cw||yi>=ch) continue;
        nd++; if(wv[yi*cw+xi]-wv[yo*cw+xo]>X.dthr) ok++; } }
    var cons=nd>=n*0.25?ok/nd:0.5, es=ed/n;
    if(cons<0.3&&es<0.4) return null;
    var pm=cv.matFromArray(4,1,cv.CV_32SC2,[o[0].x,o[0].y,o[1].x,o[1].y,o[2].x,o[2].y,o[3].x,o[3].y].map(Math.round)), mv=new cv.MatVector(), fill;
    try{ mv.push_back(pm); X.tmp.setTo(new cv.Scalar(0)); cv.fillPoly(X.tmp,mv,new cv.Scalar(255)); fill=cv.mean(X.mask,X.tmp)[0]/255; } finally { pm.delete(); mv.delete(); }
    var s=Math.sqrt(Math.min(fr,0.6))*rect*(0.2+0.8*cons)*(0.5+0.5*es)*(0.3+0.7*fill)*(cand.kind==="rect"?0.9:1);
    return {p:o,s:s,fr:fr,rect:rect,cons:cons,es:es,fill:fill,kind:cand.kind,src:cand.src};
  }
  function contourCands(cv,bin,mode,src,X,out,max){
    var cs=new cv.MatVector(), hi=new cv.Mat(), list=[], i;
    try{
      cv.findContours(bin,cs,hi,mode,cv.CHAIN_APPROX_SIMPLE);
      for(i=0;i<cs.size();i++){ var c=cs.get(i), a=cv.contourArea(c);
        if(a>=X.area*0.03){ var br=cv.boundingRect(c);
          if(!(br.x<=1&&br.y<=1&&br.x+br.width>=X.cols-1&&br.y+br.height>=X.rows-1)) list.push({c:c,a:a}); else c.delete(); }
        else c.delete(); }
      list.sort(function(p,q){ return q.a-p.a; });
      list.forEach(function(e,idx){ if(idx<max){ var q=quadOf(cv,e.c); out.push({p:q.p,kind:q.kind,area:e.a,src:src}); } e.c.delete(); });
    } finally { cs.delete(); hi.delete(); }
  }
  // Blatt/Beleg finden → Ecken im Originalbild (oder null). Mehrere Verfahren liefern Kandidaten, der beste gewinnt:
  // (a) Canny-Kanten-Konturen, (b) Helligkeits-Segmentierung (Papier = hell und farblos: min(R,G,B), Otsu), (c) minAreaRect-Rückfall
  function detect(cv,src,W,H){
    var sc=Math.min(1,900/Math.max(W,H)), sm=new cv.Mat(), g=new cv.Mat(), e=new cv.Mat(), wm=null, bin=new cv.Mat(), bin2=new cv.Mat(), mats=[sm,g,e,bin,bin2], i;
    try{
      cv.resize(src,sm,new cv.Size(Math.round(W*sc),Math.round(H*sc)),0,0,cv.INTER_AREA);
      var cols=sm.cols, rows=sm.rows, md=Math.max(cols,rows), sd=sm.data;
      wm=new cv.Mat(rows,cols,cv.CV_8UC1); mats.push(wm); var wd=wm.data;
      for(i=0;i<cols*rows;i++){ var r=sd[i*4], gg=sd[i*4+1], b=sd[i*4+2]; wd[i]=r<gg?(r<b?r:b):(gg<b?gg:b); }
      cv.GaussianBlur(wm,wm,new cv.Size(5,5),0);
      cv.cvtColor(sm,g,cv.COLOR_RGBA2GRAY); cv.GaussianBlur(g,g,new cv.Size(5,5),0); cv.Canny(g,e,30,100);
      var k5=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5)); cv.dilate(e,e,k5); k5.delete();
      var X={cols:cols,rows:rows,area:cols*rows,md:md,wv:wd,ev:e.data,dthr:10,mask:bin,tmp:new cv.Mat(rows,cols,cv.CV_8UC1)}; mats.push(X.tmp);
      var cands=[];
      // (a) Kanten
      var ec=e.clone(); mats.push(ec); contourCands(cv,ec,cv.RETR_LIST,"canny",X,cands,12);
      // (b) Helligkeit: Otsu + eine strengere Schwelle (helle Maserung/Licht im Hintergrund)
      var T=cv.threshold(wm,bin,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU), hiM=cv.mean(wm,bin)[0], T2=(T+hiM)/2;
      cv.threshold(wm,bin2,T2,255,cv.THRESH_BINARY);
      var ks=Math.max(5,Math.round(md*0.025)), kc=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(ks,ks)), ko=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(Math.max(3,ks>>1),Math.max(3,ks>>1)));
      [bin,bin2].forEach(function(m){ cv.morphologyEx(m,m,cv.MORPH_CLOSE,kc); cv.morphologyEx(m,m,cv.MORPH_OPEN,ko); });
      kc.delete(); ko.delete();
      [[bin,"seg"],[bin2,"seg2"]].forEach(function(z){ var cp=z[0].clone(); contourCands(cv,cp,cv.RETR_EXTERNAL,z[1],X,cands,4); cp.delete(); });
      var best=null;
      cands.forEach(function(c){ var r=rate(cv,c,X); if(r&&(!best||r.s>best.s)) best=r; });
      if(!best||best.s<0.06) return null;
      return {p:best.p.map(function(q){ return {x:q.x/sc,y:q.y/sc}; }),info:best};
    } finally { mats.forEach(function(m){ m.delete(); }); }
  }
  function cropWarp(cv,W,H,buf){
    var src=cv.matFromImageData({data:new Uint8ClampedArray(buf),width:W,height:H});
    try{
      var det=detect(cv,src,W,H); if(!det) return null;
      var q=order(det.p), w=Math.round(Math.max(dist(q[0],q[1]),dist(q[3],q[2]))), h=Math.round(Math.max(dist(q[0],q[3]),dist(q[1],q[2])));
      if(w<20||h<20) return null;
      var mx=w*0.01, my=h*0.01; // 1 % nach innen: Tischkante/Schattenrand abschneiden
      var A=cv.matFromArray(4,1,cv.CV_32FC2,[q[0].x,q[0].y,q[1].x,q[1].y,q[2].x,q[2].y,q[3].x,q[3].y]), B=cv.matFromArray(4,1,cv.CV_32FC2,[-mx,-my,w+mx,-my,w+mx,h+my,-mx,h+my]), M=cv.getPerspectiveTransform(A,B), dst=new cv.Mat();
      try{ cv.warpPerspective(src,dst,M,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE);
        return {w:w,h:h,buf:new Uint8ClampedArray(dst.data).buffer,quad:q,info:det.info}; }
      finally { A.delete(); B.delete(); M.delete(); dst.delete(); }
    } finally { src.delete(); }
  }
  // Scan-Filter: Papierhelligkeit (Hintergrund) grob schätzen – verkleinern, Maximum-Filter entfernt die Schrift, glätten –,
  // dann Pixel/Hintergrund → Kurve: Papier wird reinweiß, auch blasser Thermodruck bleibt deutlich dunkel
  function filter(W,H,buf){
    var d=new Uint8ClampedArray(buf), n=W*H, g=new Uint8Array(n), i, x, y;
    for(i=0;i<n;i++) g[i]=(77*d[i*4]+150*d[i*4+1]+29*d[i*4+2])>>8;
    var f=Math.max(1,Math.ceil(Math.max(W,H)/360)), w=Math.ceil(W/f), h=Math.ceil(H/f), s=new Float32Array(w*h), t=new Float32Array(w*h);
    for(y=0;y<h;y++) for(x=0;x<w;x++){ var sum=0, cnt=0, y1=Math.min(H,(y+1)*f), x1=Math.min(W,(x+1)*f);
      for(var yy=y*f;yy<y1;yy++) for(var xx=x*f;xx<x1;xx++){ sum+=g[yy*W+xx]; cnt++; } s[y*w+x]=sum/cnt; }
    function pass(a,b,r,useMax,horiz){ var len=horiz?w:h, oth=horiz?h:w;
      for(var o=0;o<oth;o++) for(var p=0;p<len;p++){ var acc=useMax?0:0, c=0;
        for(var q=Math.max(0,p-r);q<=Math.min(len-1,p+r);q++){ var v=horiz?a[o*w+q]:a[q*w+o]; if(useMax){ if(v>acc) acc=v; } else { acc+=v; c++; } }
        b[horiz?o*w+p:p*w+o]=useMax?acc:acc/c; } }
    var R=5; pass(s,t,R,true,true); pass(t,s,R,true,false); pass(s,t,R+2,false,true); pass(t,s,R+2,false,false);
    var lo=0.3, hi=0.88;
    for(y=0;y<H;y++){ var fy=Math.min(h-1,Math.max(0,(y+0.5)/f-0.5)), y0=Math.floor(fy), y2=Math.min(h-1,y0+1), ay=fy-y0;
      for(x=0;x<W;x++){ var fx=Math.min(w-1,Math.max(0,(x+0.5)/f-0.5)), x0=Math.floor(fx), x2=Math.min(w-1,x0+1), ax=fx-x0;
        var bg=(s[y0*w+x0]*(1-ax)+s[y0*w+x2]*ax)*(1-ay)+(s[y2*w+x0]*(1-ax)+s[y2*w+x2]*ax)*ay;
        var v=(g[y*W+x]/Math.max(30,bg)-lo)/(hi-lo); v=v<0?0:v>1?1:v; v=255*Math.pow(v,2.2);
        var kk=(y*W+x)*4; d[kk]=d[kk+1]=d[kk+2]=v; d[kk+3]=255; } }
    return d.buffer;
  }
  self.onmessage=function(ev){ var m=ev.data;
    (m.crop?loadCv():Promise.resolve({cv:null})).then(function(box){ var cv=box&&box.cv&&box.cv.Mat?box.cv:null, W=m.w, H=m.h, buf=m.buf, cropped=false, quad=null, info=null;
      if(cv){ try{ var c=cropWarp(cv,W,H,buf); if(c){ W=c.w; H=c.h; buf=c.buf; cropped=true; quad=c.quad; info=c.info; } }catch(e){} }
      var out=filter(W,H,buf); self.postMessage({id:m.id,w:W,h:H,buf:out,cropped:cropped,quad:quad,info:info},[out]); })
    .catch(function(e){ self.postMessage({id:m.id,error:String(e&&e.message||e)}); }); };
}.toString()+")();"; }
var WK=null, SEQ=0;
function worker(){ if(!WK) WK=new Worker(URL.createObjectURL(new Blob([workerSrc()],{type:"text/javascript"}))); return WK; }
function loadImg(file){ return new Promise(function(res,rej){ var u=URL.createObjectURL(file), i=new Image(); i.onload=function(){ res({img:i,url:u}); }; i.onerror=function(){ URL.revokeObjectURL(u); rej(new Error("Bild konnte nicht gelesen werden")); }; i.src=u; }); }
F.scanDoc=function(file){
  return loadImg(file).then(function(r){
    var img=r.img, s=Math.min(1,3000/Math.max(img.naturalWidth,img.naturalHeight)), c=document.createElement("canvas"); c.width=Math.round(img.naturalWidth*s); c.height=Math.round(img.naturalHeight*s);
    var ctx=c.getContext("2d"); ctx.drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(r.url);
    var id=ctx.getImageData(0,0,c.width,c.height);
    return new Promise(function(res,rej){ var w=worker(), my=++SEQ, t=setTimeout(function(){ w.onmessage=null; rej(new Error("Scanner hat zu lange gebraucht")); },90000);
      w.onmessage=function(ev){ var m=ev.data; if(m.id!==my) return; clearTimeout(t); if(m.error) return rej(new Error(m.error));
        var o=document.createElement("canvas"); o.width=m.w; o.height=m.h; o.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(m.buf),m.w,m.h),0,0);
        var data=o.toDataURL("image/jpeg",0.9); if(data.length>6.4e6) data=o.toDataURL("image/jpeg",0.78);
        res({name:String(file.name||"scan").replace(/\.[^.]+$/,"")+"-scan.jpg",mime:"image/jpeg",data:data,cropped:m.cropped}); };
      w.postMessage({id:my,w:id.width,h:id.height,buf:id.data.buffer,crop:true},[id.data.buffer]); });
  });
};
F.scanPreload=function(){ try{ worker().postMessage({id:-1,w:1,h:1,buf:new Uint8ClampedArray(4).buffer,crop:true}); }catch(e){} };
})();
