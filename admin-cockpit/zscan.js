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
  function loadCv(){ if(cvReady) return cvReady; cvReady=new Promise(function(res){ try{ self.importScripts(CV_URL); }catch(e){ return res(null); }
    var cv=self.cv; if(!cv) return res(null);
    if(typeof cv.then==="function") cv.then(function(m){ self.cv=m; res(m); });
    else if(cv.Mat) res(cv); else cv.onRuntimeInitialized=function(){ res(self.cv); };
    setTimeout(function(){ res(self.cv&&self.cv.Mat?self.cv:null); },30000); }); return cvReady; }
  function order(p){ var s=p.map(function(q){ return q.x+q.y; }), d=p.map(function(q){ return q.y-q.x; });
    return [p[s.indexOf(Math.min.apply(null,s))],p[d.indexOf(Math.min.apply(null,d))],p[s.indexOf(Math.max.apply(null,s))],p[d.indexOf(Math.max.apply(null,d))]]; }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
  function cropWarp(cv,W,H,buf){
    var src=cv.matFromImageData({data:new Uint8ClampedArray(buf),width:W,height:H}), sc=Math.min(1,900/Math.max(W,H)), sm=new cv.Mat(), g=new cv.Mat(), e=new cv.Mat(), cs=new cv.MatVector(), hi=new cv.Mat(), best=null, bestA=0;
    try{
      cv.resize(src,sm,new cv.Size(Math.round(W*sc),Math.round(H*sc)),0,0,cv.INTER_AREA);
      cv.cvtColor(sm,g,cv.COLOR_RGBA2GRAY); cv.GaussianBlur(g,g,new cv.Size(5,5),0); cv.Canny(g,e,40,140);
      var k=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,5)); cv.dilate(e,e,k); k.delete();
      cv.findContours(e,cs,hi,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
      var area=sm.cols*sm.rows;
      for(var i=0;i<cs.size();i++){ var c=cs.get(i), a=cv.contourArea(c); if(a<area*0.2||a<=bestA){ c.delete(); continue; }
        var ap=new cv.Mat(); cv.approxPolyDP(c,ap,0.02*cv.arcLength(c,true),true);
        if(ap.rows===4&&cv.isContourConvex(ap)){ bestA=a; best=[]; for(var j=0;j<4;j++) best.push({x:ap.data32S[j*2]/sc,y:ap.data32S[j*2+1]/sc}); }
        ap.delete(); c.delete(); }
      if(!best){ return null; }
      var q=order(best), w=Math.round(Math.max(dist(q[0],q[1]),dist(q[3],q[2]))), h=Math.round(Math.max(dist(q[0],q[3]),dist(q[1],q[2])));
      var A=cv.matFromArray(4,1,cv.CV_32FC2,[q[0].x,q[0].y,q[1].x,q[1].y,q[2].x,q[2].y,q[3].x,q[3].y]), B=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w,0,w,h,0,h]), M=cv.getPerspectiveTransform(A,B), dst=new cv.Mat();
      cv.warpPerspective(src,dst,M,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE);
      var out={w:w,h:h,buf:new Uint8ClampedArray(dst.data).buffer}; A.delete(); B.delete(); M.delete(); dst.delete(); return out;
    } finally { src.delete(); sm.delete(); g.delete(); e.delete(); cs.delete(); hi.delete(); }
  }
  function filter(W,H,buf){
    var d=new Uint8ClampedArray(buf), n=W*H, g=new Uint8ClampedArray(n), I=new Uint32Array((W+1)*(H+1)), x, y;
    for(var i=0;i<n;i++) g[i]=(77*d[i*4]+150*d[i*4+1]+29*d[i*4+2])>>8;
    for(y=0;y<H;y++){ var row=0; for(x=0;x<W;x++){ row+=g[y*W+x]; I[(y+1)*(W+1)+x+1]=I[y*(W+1)+x+1]+row; } }
    var r=Math.max(15,Math.round(Math.max(W,H)/28));
    for(y=0;y<H;y++){ var y0=Math.max(0,y-r), y1=Math.min(H,y+r+1);
      for(x=0;x<W;x++){ var x0=Math.max(0,x-r), x1=Math.min(W,x+r+1), m=(I[y1*(W+1)+x1]-I[y0*(W+1)+x1]-I[y1*(W+1)+x0]+I[y0*(W+1)+x0])/((x1-x0)*(y1-y0));
        var v=g[y*W+x]/Math.max(1,m*1.04)*255; v=(v-70)*255/175; v=v<0?0:v>255?255:v; v=255*Math.pow(v/255,1.35);
        var kk=(y*W+x)*4; d[kk]=d[kk+1]=d[kk+2]=v; d[kk+3]=255; } }
    return d.buffer;
  }
  self.onmessage=function(ev){ var m=ev.data;
    (m.crop?loadCv():Promise.resolve(null)).then(function(cv){ var W=m.w, H=m.h, buf=m.buf, cropped=false;
      if(cv){ try{ var c=cropWarp(cv,W,H,buf); if(c){ W=c.w; H=c.h; buf=c.buf; cropped=true; } }catch(e){} }
      var out=filter(W,H,buf); self.postMessage({id:m.id,w:W,h:H,buf:out,cropped:cropped},[out]); })
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
