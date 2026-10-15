/* Dokument-Ansicht in der App: PDFs (Rechnungen, Angebote, Belege) und Bilder in einem Vollbild-Overlay mit „Zurück“.
   Grund: In der Home-Bildschirm-App (iPhone, ohne Browserleiste) öffnete ein Link auf die Datei sie bildschirmfüllend ohne Weg zurück.
   API:   F.viewDoc(url, title)                         → öffnet die Ansicht
          F.docAttrs(url, title)                        → ' data-docview=".." data-doctitle=".."' für Links/Buttons
          F.docEmbed(url, title, iframeHtml)            → am Desktop die Inline-Vorschau (iframe), am Handy eine Karte „Beleg ansehen“
   Jedes Element mit data-docview="URL" (leer = href) (optional data-doctitle) öffnet die Ansicht; bei <a> bleibt href für Mittelklick/⌘-Klick.
   PDFs werden mit PDF.js (cdnjs, erst beim ersten Öffnen geladen) Seite für Seite auf <canvas> gezeichnet – nur sichtbare Seiten. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var PDFJS="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    PDFJS_WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
var ICON_SHARE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
    ICON_TAB='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
    ICON_DOC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';

F.css(
'.dv{position:fixed;inset:0;z-index:85;display:flex;flex-direction:column;background:#2b2e2d;color:#fff;-webkit-text-size-adjust:100%}'+
'.dv-bar{flex:none;display:flex;align-items:center;gap:6px;padding:calc(6px + env(safe-area-inset-top,0px)) calc(8px + env(safe-area-inset-right,0px)) 6px calc(6px + env(safe-area-inset-left,0px));background:#1d201f;border-bottom:1px solid rgba(255,255,255,.08)}'+
'.dv-b{appearance:none;-webkit-appearance:none;border:0;background:transparent;color:#fff;font-family:inherit;font-weight:600;font-size:16px;line-height:1;min-width:44px;height:44px;padding:0 10px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;text-decoration:none;white-space:nowrap}'+
'.dv-b:hover{background:rgba(255,255,255,.1)}.dv-b:active{background:rgba(255,255,255,.18)}.dv-b:focus-visible{outline:2px solid #8fc3ff;outline-offset:1px}'+
'.dv-b svg{width:20px;height:20px}.dv-b[disabled]{opacity:.35;cursor:default}'+
'.dv-back{font-size:17px;padding:0 12px 0 6px;color:#9fd0ff}.dv-back b{font-size:28px;font-weight:400;line-height:0;margin-top:-3px}'+
'.dv-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.2}.dv-t b{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dv-t small{font-size:12px;color:rgba(255,255,255,.6)}'+
'.dv-acts{display:flex;align-items:center;gap:2px}.dv-z{font-size:22px;font-weight:500}'+
'.dv-body{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-x pan-y pinch-zoom;padding:12px 12px calc(16px + env(safe-area-inset-bottom,0px))}'+
'.dv-pages{display:flex;flex-direction:column;align-items:center;gap:12px;margin:0 auto;width:max-content;min-width:100%}'+
'.dv-pg{position:relative;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.45);border-radius:2px;overflow:hidden}'+
'.dv-pg canvas{display:block;width:100%;height:100%}'+
'.dv-pg i{position:absolute;inset:0;display:grid;place-items:center;color:#9a9a9a;font-size:13px;font-style:normal}'+
'.dv-img{display:block;margin:0 auto;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.45);max-width:none;height:auto}'+
'.dv-pre{margin:0 auto;max-width:900px;background:#fff;color:#222;padding:16px;border-radius:4px;white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,monospace}'+
'.dv-msg{max-width:420px;margin:12vh auto 0;text-align:center;display:grid;gap:14px;justify-items:center;font-size:15px;line-height:1.45;color:rgba(255,255,255,.85)}'+
'.dv-msg .dv-cta{background:#fff;color:#1d201f;border-radius:12px;padding:0 18px;font-size:15px}.dv-msg .dv-cta:hover{background:#e9e9e9}'+
'.dv-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:#fff;animation:dvspin .8s linear infinite}'+
'@keyframes dvspin{to{transform:rotate(360deg)}}'+
'body.dv-open{overflow:hidden}'+
'@media (max-width:560px){.dv-lbl{display:none}.dv-zbtn{display:none}}'+
'@media (pointer:coarse) and (max-width:900px){.dv-tab{display:none}}'+
/* Handy-Ersatz für die eingebettete PDF-Vorschau */
'.dv-card{display:flex;align-items:center;gap:14px;width:100%;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink);font:inherit;text-align:left;cursor:pointer;min-height:64px}'+
'.dv-card:active{background:var(--sunk)}.dv-card svg{width:30px;height:30px;flex:none;color:var(--glow)}'+
'.dv-card span{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.dv-card b{font-size:15px}.dv-card small{color:var(--ink-3);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.dv-card em{font-style:normal;font-size:22px;color:var(--ink-3)}'
);

/* ---------- Hilfen ---------- */
function desktop(){ return window.innerWidth>900||!(window.matchMedia&&window.matchMedia("(pointer:coarse)").matches); }
function dlUrl(url){ url=String(url).replace(/([?&])inline=1(&|$)/,function(m,a,b){ return b?a:""; }); return /[?&]dl=1/.test(url)?url:url+(url.indexOf("?")>-1?"&":"?")+"dl=1"; }
function sniff(b){ /* b: Uint8Array */
  var s=""; for(var i=0;i<Math.min(b.length,16);i++) s+=String.fromCharCode(b[i]);
  if(s.indexOf("%PDF")>-1) return "application/pdf";
  if(b[0]===0x89&&s.slice(1,4)==="PNG") return "image/png";
  if(b[0]===0xff&&b[1]===0xd8) return "image/jpeg";
  if(s.slice(0,4)==="GIF8") return "image/gif";
  if(s.slice(0,4)==="RIFF"&&s.slice(8,12)==="WEBP") return "image/webp";
  if(/ftyp(hei|hev|mif1|msf1)/.test(s.slice(4,12))) return "image/heic";
  if(/^\s*<\?xml|^\s*</.test(s)) return "text/xml";
  return ""; }
function fileName(r,title,type){
  var cd=r.headers.get("Content-Disposition")||"", m=cd.match(/filename\*=UTF-8''([^;]+)/i)||cd.match(/filename="?([^";]+)"?/i), n="";
  if(m){ try{ n=decodeURIComponent(m[1]); }catch(e){ n=m[1]; } }
  if(!n) n=String(title||"Dokument").replace(/[\\\/:*?"<>|]+/g,"_").trim()||"Dokument";
  if(!/\.[a-z0-9]{2,5}$/i.test(n)){ var ext={"application/pdf":".pdf","image/png":".png","image/jpeg":".jpg","image/gif":".gif","image/webp":".webp","image/heic":".heic","text/xml":".xml"}[type]; if(ext) n+=ext; }
  return n; }

var pdfjsP=null;
function loadPdfJs(){
  if(window.pdfjsLib&&window.pdfjsLib.getDocument) return Promise.resolve(window.pdfjsLib);
  if(pdfjsP) return pdfjsP;
  pdfjsP=new Promise(function(res,rej){
    var s=document.createElement("script"); s.src=PDFJS; s.async=true; s.crossOrigin="anonymous";
    s.onload=function(){ var L=window.pdfjsLib; if(!L||!L.getDocument){ rej(new Error("PDF.js nicht verfügbar")); return; } L.GlobalWorkerOptions.workerSrc=PDFJS_WORKER; res(L); };
    s.onerror=function(){ s.remove(); rej(new Error("PDF-Anzeige konnte nicht geladen werden (offline?)")); };
    document.head.appendChild(s);
  });
  pdfjsP.catch(function(){ pdfjsP=null; });
  return pdfjsP;
}

/* ---------- Zustand ---------- */
var S=null; /* {el,body,url,title,blob,name,type,objUrls[],pdf,pages[],zoom,io,pushed,seq,ratio} */
var seq=0;

function bar(title){
  var share=!!navigator.share;
  return '<div class="dv-bar">'+
    '<button type="button" class="dv-b dv-back" data-dv="close" aria-label="Zurück zur App"><b>‹</b>Zurück</button>'+
    '<div class="dv-t"><b>'+esc(title||"Dokument")+'</b><small id="dvInfo">Lade …</small></div>'+
    '<div class="dv-acts">'+
      '<button type="button" class="dv-b dv-z dv-zbtn" data-dv="zout" aria-label="Verkleinern" title="Verkleinern" disabled>−</button>'+
      '<button type="button" class="dv-b dv-z dv-zbtn" data-dv="zin" aria-label="Vergrößern" title="Vergrößern" disabled>+</button>'+
      '<button type="button" class="dv-b" data-dv="share" title="'+(share?"Teilen / Sichern":"Herunterladen")+'">'+ICON_SHARE+'<span class="dv-lbl">'+(share?"Teilen":"Sichern")+'</span></button>'+
      '<button type="button" class="dv-b dv-tab" data-dv="tab" title="In neuem Tab öffnen">'+ICON_TAB+'<span class="dv-lbl">Neuer Tab</span></button>'+
    '</div></div>';
}
function info(t){ var i=S&&S.el.querySelector("#dvInfo"); if(i) i.textContent=t||""; }
function setZoomBtns(on){ if(!S) return; [].forEach.call(S.el.querySelectorAll(".dv-zbtn"),function(b){ b.disabled=!on; }); }
function msg(html){ if(S) S.body.innerHTML='<div class="dv-msg">'+html+'</div>'; }
function fail(text){
  if(!S) return; info("");
  msg('<div>'+esc(text||"Die Datei konnte nicht angezeigt werden.")+'</div>'+
    '<a class="dv-b dv-cta" href="'+esc(dlUrl(S.url))+'" download>Datei herunterladen</a>'+
    (desktop()?'<button type="button" class="dv-b" data-dv="tab">'+ICON_TAB+'In neuem Tab öffnen</button>':''));
}

F.viewDoc=function(url,title){
  if(!url) return;
  var reuse=S&&S.pushed&&history.state&&history.state.fscDocView===S.seq?S.seq:0; /* zweites Dokument direkt aus der Ansicht: kein weiterer Verlaufseintrag */
  if(S) close(true);
  var el=document.createElement("div");
  el.className="dv"; el.id="fscDocView"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true"); el.setAttribute("aria-label",title||"Dokument");
  el.innerHTML=bar(title)+'<div class="dv-body" tabindex="-1"><div class="dv-msg"><div class="dv-spin" role="status" aria-label="Lade Dokument"></div></div></div>';
  document.body.appendChild(el); document.body.classList.add("dv-open");
  S={el:el,body:el.querySelector(".dv-body"),url:url,title:title||"Dokument",objUrls:[],pages:[],zoom:1,seq:reuse||++seq,pushed:!!reuse,prevFocus:document.activeElement};
  if(!reuse) try{ history.pushState({fscDocView:S.seq},""); S.pushed=true; }catch(e){}
  el.addEventListener("click",onBarClick);
  var back=el.querySelector(".dv-back"); if(back) try{ back.focus({preventScroll:true}); }catch(e){}
  load(S);
};

function load(st){
  fetch(st.url,{credentials:"include",cache:"no-store"}).then(function(r){
    if(r.redirected&&/\/admin\/login/.test(r.url)) throw new Error("Sitzung abgelaufen – bitte neu anmelden.");
    if(!r.ok) return r.text().then(function(t){ throw new Error((t&&t.length<200&&!/</.test(t)?t:"Fehler beim Laden")+" (HTTP "+r.status+")"); });
    return r.arrayBuffer().then(function(buf){
      var bytes=new Uint8Array(buf), ct=String(r.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase(), sn=sniff(bytes);
      var type=sn||ct||"application/octet-stream";
      if(sn==="text/xml"&&/^text\/html/.test(ct)) type=ct;
      return {bytes:bytes,type:type,name:fileName(r,st.title,type)};
    });
  }).then(function(d){
    if(S!==st) return;
    st.type=d.type; st.name=d.name; st.blob=new Blob([d.bytes],{type:d.type});
    if(d.type==="application/pdf") return showPdf(st,d.bytes);
    if(/^image\//.test(d.type)) return showImg(st);
    if(/xml|^text\/plain|json/.test(d.type)) return showText(st);
    info(""); msg('<div>Für diesen Dateityp gibt es keine Vorschau.</div><button type="button" class="dv-b dv-cta" data-dv="share">'+(navigator.share?"Teilen / Sichern":"Datei herunterladen")+'</button>');
  }).catch(function(e){ if(S===st) fail(e&&e.message); });
}

/* ---------- Bild ---------- */
function showImg(st){
  var u=URL.createObjectURL(st.blob); st.objUrls.push(u);
  var im=new Image(); im.className="dv-img"; im.alt=st.title; im.decoding="async";
  im.onload=function(){ if(S!==st) return; st.body.innerHTML=""; st.body.appendChild(im); st.img=im; info(im.naturalWidth+" × "+im.naturalHeight+" px"); layoutImg(); setZoomBtns(true); };
  im.onerror=function(){ if(S===st) fail("Das Bild kann hier nicht angezeigt werden"+(/heic/.test(st.type)?" (HEIC-Format).":".")); };
  im.src=u;
}
function layoutImg(){ if(!S||!S.img) return; var w=baseW(); S.img.style.width=Math.round(Math.min(w,Math.max(S.img.naturalWidth,320))*S.zoom)+"px"; }

/* ---------- Text (XML-Rechnungen) ---------- */
function showText(st){
  st.blob.text().then(function(t){ if(S!==st) return; info(""); st.body.innerHTML='<pre class="dv-pre"></pre>'; st.body.firstChild.textContent=t.slice(0,400000); });
}

/* ---------- PDF ---------- */
function baseW(){ if(!S) return 600; var cs=getComputedStyle(S.body), w=S.body.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight); return Math.max(200,Math.min(w,1000)); }
function showPdf(st,bytes){
  info("Lade Anzeige …");
  return loadPdfJs().then(function(L){
    if(S!==st) return;
    var task=L.getDocument({data:bytes,isEvalSupported:false}); st.loadTask=task;
    return task.promise.then(function(pdf){
      if(S!==st){ pdf.destroy(); return; }
      st.pdf=pdf;
      return pdf.getPage(1).then(function(p1){
        if(S!==st) return;
        var v=p1.getViewport({scale:1}); st.ratio=v.height/v.width;
        var wrap=document.createElement("div"); wrap.className="dv-pages";
        for(var n=1;n<=pdf.numPages;n++){
          var pg=document.createElement("div"); pg.className="dv-pg"; pg.setAttribute("data-pg",n);
          pg.innerHTML='<i>Seite '+n+'</i>';
          wrap.appendChild(pg);
          st.pages[n]={el:pg,ratio:n===1?st.ratio:0,page:n===1?p1:null,canvas:null,task:null,shown:false,want:false,w:0};
        }
        st.body.innerHTML=""; st.body.appendChild(wrap);
        info(pdf.numPages===1?"1 Seite":pdf.numPages+" Seiten");
        setZoomBtns(true); layoutPdf();
        if("IntersectionObserver" in window){
          st.io=new IntersectionObserver(function(es){ if(S!==st) return; es.forEach(function(e){ var n=+e.target.getAttribute("data-pg"), p=st.pages[n]; p.want=e.isIntersecting; if(e.isIntersecting) renderPage(st,n); else unloadPage(p); }); },{root:st.body,rootMargin:"900px 0px"});
          st.pages.forEach(function(p){ if(p) st.io.observe(p.el); });
        } else st.pages.forEach(function(p,n){ if(p){ p.want=true; renderPage(st,n); } });
      });
    });
  }).catch(function(e){ if(S===st) fail((e&&e.message&&!/^Invalid|^Unexpected/.test(e.message)?e.message:"Die PDF-Datei konnte nicht gelesen werden.")); });
}
function layoutPdf(){
  if(!S||!S.pdf) return; var w=Math.round(baseW()*S.zoom);
  S.pages.forEach(function(p){ if(!p) return; var r=p.ratio||S.ratio; p.el.style.width=w+"px"; p.el.style.height=Math.round(w*r)+"px"; });
}
function unloadPage(p){
  if(p.task){ try{ p.task.cancel(); }catch(e){} p.task=null; }
  if(p.canvas){ p.canvas.width=0; p.canvas.height=0; p.canvas.remove(); p.canvas=null; }
  p.shown=false; p.w=0;
}
function renderPage(st,n){
  var p=st.pages[n]; if(!p||!st.pdf) return;
  var cssW=Math.round(baseW()*st.zoom); if(p.shown&&p.w===cssW) return;
  if(p.task) return; /* läuft schon – nach Ende ggf. neu */
  p.w=cssW; p.shown=true;
  (p.page?Promise.resolve(p.page):st.pdf.getPage(n)).then(function(page){
    if(S!==st||!p.want&&st.io) { p.shown=false; return; }
    p.page=page;
    var v1=page.getViewport({scale:1}); p.ratio=v1.height/v1.width; p.el.style.height=Math.round(cssW*p.ratio)+"px";
    var dpr=Math.min(window.devicePixelRatio||1,3), scale=cssW/v1.width*dpr;
    var maxPx=12e6; if(v1.width*v1.height*scale*scale>maxPx) scale=Math.sqrt(maxPx/(v1.width*v1.height)); /* Canvas-Grenze iOS */
    var vp=page.getViewport({scale:scale});
    var c=document.createElement("canvas"); c.width=Math.floor(vp.width); c.height=Math.floor(vp.height);
    var ctx=c.getContext("2d",{alpha:false}); ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height);
    p.task=page.render({canvasContext:ctx,viewport:vp});
    return p.task.promise.then(function(){
      p.task=null; if(S!==st||!p.shown){ c.width=0; c.height=0; return; }
      if(p.canvas){ p.canvas.width=0; p.canvas.height=0; p.canvas.remove(); }
      p.canvas=c; p.el.innerHTML=""; p.el.appendChild(c);
      var now=Math.round(baseW()*st.zoom); if(now!==p.w) renderPage(st,n);
    });
  }).catch(function(e){ p.task=null; p.shown=false; if(e&&e.name==="RenderingCancelledException") return; if(S===st) p.el.innerHTML='<i>Seite '+n+' konnte nicht gezeichnet werden</i>'; });
}
function rerender(){
  if(!S) return;
  if(S.img){ layoutImg(); return; }
  if(!S.pdf) return;
  layoutPdf();
  S.pages.forEach(function(p,n){ if(!p) return; if(p.want||!S.io) renderPage(S,n); });
}
function zoom(f){
  if(!S||!(S.pdf||S.img)) return;
  var b=S.body, cx=(b.scrollLeft+b.clientWidth/2)/Math.max(1,b.scrollWidth), cy=(b.scrollTop+b.clientHeight/2)/Math.max(1,b.scrollHeight);
  var z=f===1?1:Math.max(1,Math.min(4,Math.round(S.zoom*f*100)/100)); if(z===S.zoom) return; S.zoom=z;
  rerender();
  b.scrollLeft=cx*b.scrollWidth-b.clientWidth/2; b.scrollTop=cy*b.scrollHeight-b.clientHeight/2;
  info((S.pdf?(S.pdf.numPages===1?"1 Seite":S.pdf.numPages+" Seiten")+" · ":"")+Math.round(z*100)+" %");
}

/* ---------- Aktionen ---------- */
function share(){
  if(!S) return;
  if(!S.blob){ location.href=dlUrl(S.url); return; }
  var file=null; try{ file=new File([S.blob],S.name||"Dokument",{type:S.type}); }catch(e){}
  if(file&&navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
    navigator.share({files:[file],title:S.title}).catch(function(e){ if(e&&e.name!=="AbortError") F.toast("Teilen fehlgeschlagen",true); });
    return;
  }
  var u=URL.createObjectURL(S.blob); S.objUrls.push(u);
  var a=document.createElement("a"); a.href=u; a.download=S.name||"Dokument"; a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove();
}
function onBarClick(e){
  var b=e.target.closest("[data-dv]"); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  var k=b.getAttribute("data-dv");
  if(k==="close") close();
  else if(k==="share") share();
  else if(k==="tab"&&S) window.open(S.url,"_blank","noopener");
  else if(k==="zin") zoom(1.25);
  else if(k==="zout") zoom(0.8);
}

function close(fromPop){
  var st=S; if(!st) return; S=null;
  if(st.io) st.io.disconnect();
  st.pages.forEach(function(p){ if(p) unloadPage(p); });
  if(st.loadTask) try{ st.loadTask.destroy(); }catch(e){}
  if(st.pdf) try{ st.pdf.destroy(); }catch(e){}
  setTimeout(function(){ st.objUrls.forEach(function(u){ try{ URL.revokeObjectURL(u); }catch(e){} }); },1500); /* Download per Blob-Link kurz laufen lassen */
  st.el.remove(); document.body.classList.remove("dv-open");
  if(!fromPop&&st.pushed&&history.state&&history.state.fscDocView===st.seq){ st.ignorePop=true; ignoreNextPop=true; try{ history.back(); }catch(e){ ignoreNextPop=false; } }
  if(st.prevFocus&&st.prevFocus.focus&&document.contains(st.prevFocus)) try{ st.prevFocus.focus({preventScroll:true}); }catch(e){}
}
F.closeDoc=function(){ close(); };
F.docOpen=function(){ return !!S; };
var ignoreNextPop=false;
window.addEventListener("popstate",function(){ if(ignoreNextPop){ ignoreNextPop=false; return; } if(S) close(true); });
/* Escape schließt nur die Ansicht, nicht zusätzlich den Dialog darunter */
window.addEventListener("keydown",function(e){
  if(!S) return;
  if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); close(); return; }
  if(/input|textarea|select/i.test((e.target&&e.target.tagName)||"")) return;
  if((e.key==="+"||e.key==="=")&&!e.metaKey&&!e.ctrlKey){ e.preventDefault(); zoom(1.25); }
  else if(e.key==="-"&&!e.metaKey&&!e.ctrlKey){ e.preventDefault(); zoom(0.8); }
  else if(e.key==="0"&&!e.metaKey&&!e.ctrlKey){ e.preventDefault(); zoom(1); }
  else if((e.metaKey||e.ctrlKey)&&/^[k]$/i.test(e.key)) e.stopPropagation();
},true);
var rt=0, lastW=0;
window.addEventListener("resize",function(){ if(!S) return; clearTimeout(rt); rt=setTimeout(function(){ if(!S) return; var w=baseW(); if(w!==lastW){ lastW=w; rerender(); } },180); });
/* Klick auf data-docview (vor dem zentralen Klick-Handler, damit Zeilen-Aktionen darunter nicht mitlaufen) */
window.addEventListener("click",function(e){
  var t=e.target; if(!t||!t.closest) return;
  var el=t.closest("[data-docview]"); if(!el) return;
  if(el.tagName==="A"&&(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)) return; /* Desktop: neuer Tab wie gewohnt */
  e.preventDefault(); e.stopPropagation();
  F.viewDoc(el.getAttribute("data-docview")||el.getAttribute("href"),el.getAttribute("data-doctitle")||el.getAttribute("title")||(el.textContent||"").trim().slice(0,80));
},true);

/* ---------- Bausteine für die Module ---------- */
F.docAttrs=function(url,title){ return ' data-docview="'+esc(url)+'"'+(title?' data-doctitle="'+esc(title)+'"':''); };
F.docLink=function(url,title,label,cls){ return '<a'+(cls?' class="'+cls+'"':'')+' href="'+esc(url)+'" target="_blank" rel="noopener"'+F.docAttrs(url,title)+'>'+label+'</a>'; };
F.docCard=function(url,title,label,sub){ return '<button type="button" class="dv-card"'+F.docAttrs(url,title)+'>'+ICON_DOC+'<span><b>'+esc(label||"Beleg ansehen")+'</b><small>'+esc(sub||title||"Antippen zum Öffnen")+'</small></span><em aria-hidden="true">›</em></button>'; };
/* Desktop: eingebettete Vorschau (iframe) wie bisher; Handy: Karte, die die Vollbild-Ansicht öffnet (iOS-iframes zeigen nur Seite 1 und fangen das Scrollen) */
F.docEmbed=function(url,title,iframeHtml,label){ return window.innerWidth>900?iframeHtml:F.docCard(url,title,label||"Beleg ansehen",title); };
})();
