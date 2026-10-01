/* KI (Claude) – Beleg hochladen ohne Mail: Drag & Drop, Dateiauswahl oder Foto mit der Handykamera.
   Mehrere Dateien → Warteschlange; Claude liest jede Datei aus, danach der vorbefüllte Dialog „Beleg an sevDesk“.
   An sevDesk geht der Beleg (Entwurf inkl. Originaldatei) erst mit Klick. Einstieg: Finanzen → „Beleg erfassen“ und Ansicht „KI“. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
var UQ=[], busy=false, seq=0;
var MAXB=15*1024*1024;

function readAsDataURL(file){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result)); }; r.onerror=function(){ rej(new Error("Datei konnte nicht gelesen werden.")); }; r.readAsDataURL(file); }); }
/* Bilder: HEIC (falls der Browser es anzeigen kann) und große Fotos als JPEG (max. 2400 px, KI-Limit 5 MB) */
function prepImage(file){
  var heic=/\.(heic|heif)$/i.test(file.name)||/hei[cf]/i.test(file.type);
  if(!heic&&file.size<=3.5*1024*1024) return readAsDataURL(file).then(function(d){ return {name:file.name,mime:file.type,data:d}; });
  return new Promise(function(res,rej){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var s=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight)), c=document.createElement("canvas");
      c.width=Math.round(img.naturalWidth*s); c.height=Math.round(img.naturalHeight*s); c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
      res({name:file.name.replace(/\.[^.]+$/,"")+".jpg",mime:"image/jpeg",data:c.toDataURL("image/jpeg",0.85)});
    };
    img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error(heic?"HEIC-Fotos kann dieser Browser nicht umwandeln – bitte als JPG oder PDF hochladen (iPhone: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“).":"Bild konnte nicht gelesen werden.")); };
    img.src=url;
  });
}
function prep(file){
  if(file.size>MAXB) return Promise.reject(new Error("Größer als 15 MB."));
  if(/^image\//.test(file.type)||/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) return prepImage(file);
  if(/pdf|xml/.test(file.type)||/\.(pdf|xml)$/i.test(file.name)) return readAsDataURL(file).then(function(d){ return {name:file.name,mime:file.type||"application/pdf",data:d}; });
  return Promise.reject(new Error("Dateityp nicht unterstützt (PDF, JPG, PNG, HEIC oder XML-Rechnung)."));
}
function addFiles(list){
  Array.prototype.slice.call(list||[]).slice(0,30).forEach(function(f){ UQ.push({key:"u"+(++seq),file:f,name:f.name,size:f.size,status:"warte"}); });
  paint(); next();
}
function next(){
  if(busy) return; var it=UQ.filter(function(x){ return x.status==="warte"; })[0]; if(!it) return;
  if(K.st&&!K.st.configured){ UQ.forEach(function(x){ if(x.status==="warte"){ x.status="fehler"; x.err=K.NOT_SET; } }); paint(); return; }
  busy=true; it.status="lese"; paint();
  prep(it.file).then(function(p){ return K.api("beleg-upload",{filename:p.name,mime:p.mime,data:p.data}); })
    .then(function(j){ it.status="bereit"; it.res=j; it.file=null; })
    .catch(function(e){ it.status="fehler"; it.err=(e&&e.message)||"Fehler"; it.file=null; })
    .then(function(){ busy=false; paint(); K.load(true); next(); });
}
function itemHtml(it){
  var x=it.res&&it.res.beleg, st={warte:["grey","wartet"],lese:["info","KI liest …"],bereit:["ok","bereit"],fehler:["bad","Fehler"],erledigt:["ok","an sevDesk gesendet"]}[it.status];
  return '<div class="kirow"><div class="kimain"><b>'+esc(x&&x.supplier||it.name)+'</b> <span class="muted">'+esc(it.name)+' · '+Math.max(1,Math.round(it.size/1024))+' KB</span>'+
    (x?'<div class="kitags"><span class="tag grey">'+esc(F.de(x.invoiceDate)||"ohne Datum")+'</span>'+(x.invoiceNumber?'<span class="tag grey">Nr. '+esc(x.invoiceNumber)+'</span>':'')+K.conf(x.confidence)+(it.res.dupes&&it.res.dupes.length?'<span class="tag bad">mögliche Dublette</span>':'')+'</div>':'')+
    (it.err?'<div class="bad-t" style="font-size:13px">'+esc(it.err)+'</div>':'')+'</div>'+
    '<div class="kiamt num money">'+(x&&x.gross?F.eur(x.gross):'')+'</div><div class="row wrap"><span class="tag '+st[0]+'">'+st[1]+'</span>'+
    (it.status==="bereit"?'<button type="button" class="btn primary" data-act="kiupopen:'+it.key+'">Prüfen &amp; an sevDesk</button>':'')+
    (it.status!=="lese"?'<button type="button" class="btn icon" data-act="kiupdrop:'+it.key+'" title="Entfernen" aria-label="Entfernen">✕</button>':'')+'</div></div>';
}
function dropHtml(){
  return '<div class="kidrop" id="kiDrop" tabindex="0" role="button" aria-label="Dateien hier ablegen oder auswählen">'+F.svg("spark")+'<b>Belege hierher ziehen</b><span class="muted">PDF, JPG, PNG, HEIC oder XML-Rechnung · bis 15 MB · mehrere auf einmal</span>'+
    '<span class="row wrap" style="justify-content:center"><label class="btn primary">Dateien wählen<input type="file" id="kiFiles" multiple accept="application/pdf,image/*,.pdf,.xml,.heic,.heif" hidden></label>'+
    '<label class="btn">Foto aufnehmen<input type="file" id="kiCam" accept="image/*,application/pdf" capture="environment" hidden></label></span></div>';
}
function bodyHtml(){
  return '<div class="stackf" id="kiUp"><div class="row-between"><h2 style="font-size:19px">Beleg hochladen (KI)</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Claude liest Lieferant, Datum, Beträge und Steuer aus. Danach prüfst du im Beleg-Dialog und schickst ihn als Entwurf (mit Datei) an sevDesk.</p>'+
    (K.st&&!K.st.configured?K.notSetHtml():'')+dropHtml()+(UQ.length?'<div class="kilist">'+UQ.map(itemHtml).join("")+'</div>':'')+
    '<div class="foot"><span class="muted">'+(UQ.filter(function(x){ return x.status==="bereit"; }).length?'Noch nicht gesendete Belege bleiben hier, bis du sie öffnest (3 Std.).':'')+'</span><button type="button" class="btn" data-closemodal>Schließen</button></div></div>';
}
function paint(){ var r=document.getElementById("kiUp"); if(r) r.outerHTML=bodyHtml(); if(F.current==="ki") F.render(); }
K.openUpload=function(){ K.load(false); F.modal(bodyHtml(),"wide"); };
K.uploadPanelHtml=function(){ return K.panel("ki-upload","Beleg hochladen","Ohne Mail: Datei ablegen oder am Handy fotografieren","",dropHtml()+(UQ.length?'<div class="kilist">'+UQ.map(itemHtml).join("")+'</div>':'')); };
F.action("kiupload",function(){ K.openUpload(); });
F.listen("change","#kiFiles,#kiCam",function(el){ addFiles(el.files); el.value=""; });
F.listen("dragover","#kiDrop",function(el,e){ e.preventDefault(); el.classList.add("on"); });
F.listen("drop","#kiDrop",function(el,e){ e.preventDefault(); el.classList.remove("on"); if(e.dataTransfer&&e.dataTransfer.files) addFiles(e.dataTransfer.files); });
F.listen("keydown","#kiDrop",function(el,e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); var i=el.querySelector("#kiFiles"); if(i) i.click(); } });
F.action("kiupdrop",function(k){ UQ=UQ.filter(function(x){ return x.key!==k; }); paint(); });
F.action("kiupopen",function(k){
  var it=UQ.filter(function(x){ return x.key===k; })[0]; if(!it||!it.res) return;
  var r=it.res, x=r.beleg, m={id:"upload:"+r.uploadId,subject:x.description||it.name,date:new Date().toISOString(),fromName:x.supplier}, a={index:0,filename:x.filename||it.name,size:it.size};
  K.openVoucherWith(m,a,x,function(){ it.status="erledigt"; if(UQ.some(function(y){ return y.status==="bereit"||y.status==="warte"||y.status==="lese"; })) setTimeout(K.openUpload,400); else paint(); },
    {dupes:r.dupes,href:"/admin/api/ki/beleg-upload?id="+encodeURIComponent(r.uploadId),extra:{uploadId:r.uploadId}});
});

F.css([
".kidrop{border:2px dashed var(--line);border-radius:14px;padding:22px 14px;display:grid;gap:8px;justify-items:center;text-align:center;cursor:pointer}",
".kidrop.on,.kidrop:hover{border-color:var(--info);background:var(--info-soft)}",
".kidrop svg{width:26px;height:26px;color:var(--info)}"
].join("\n"));
})();
