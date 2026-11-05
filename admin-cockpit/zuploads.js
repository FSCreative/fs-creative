/* Uploads: Links anlegen, über die Kunden ohne Anmeldung beliebig viele/große Dateien hochladen (www.fs-creative.at/upload/<token>), hier herunterladen.
   Daten: GET /admin/api/uploads (Links + Dateien + freier Speicher), POST {op:create|update|seen|deleteFile|deleteLink}, …/file (Download), …/zip (alle als ZIP) – Logik in uploads.js. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, de=F.de;
var ST=null, busy=false, CUR={};   // CUR[linkId] = geöffneter Ordner („Logos/Varianten“, "" = oberste Ebene)
function hb(n){ n=+n||0; return n>=1073741824?(n/1073741824).toFixed(1).replace(".",",")+" GB":n>=1048576?(n/1048576).toFixed(1).replace(".",",")+" MB":Math.max(1,Math.round(n/1024))+" KB"; }
function dt(iso){ return iso?de(String(iso).slice(0,10))+" "+String(iso).slice(11,16):""; }
function load(){ if(busy) return; busy=true; F.api("/admin/api/uploads").then(function(j){ busy=false; ST=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler",links:[]}; F.render(); }).catch(function(){ busy=false; ST={ok:false,error:"Nicht erreichbar",links:[]}; F.render(); }); }
function isNew(l){ return l.lastAt&&(!l.seenAt||l.lastAt>l.seenAt); }
/* Aufbau wie die Kundenansicht (Wunsch Simon 05.11.2026): oben die Links als Karten, darunter je Link Kopf mit Link & Aktionen,
   dann drei Spalten – Ordnerbaum · Dateitabelle mit Pfad · Hochladen-Feld. Schmal (Handy) untereinander. */
F.css('.up-tabs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-bottom:14px}'+
  '.up-tab{display:grid;gap:3px;text-align:left;padding:12px 14px;border-radius:var(--r);border:1px solid var(--line);background:var(--panel);color:var(--ink);cursor:pointer;font:inherit;min-width:0}'+
  '.up-tab b{font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.up-tab small{font-size:12.5px;color:var(--ink-3)}.up-tab[aria-current="true"]{border-color:var(--glow);box-shadow:0 0 0 1px var(--glow) inset}'+
  '.up-new{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--warn);margin-right:6px;vertical-align:1px}'+
  '.up-wrap{container-type:inline-size;display:grid;gap:12px}'+
  '.up-head{display:flex;gap:16px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;padding:16px 18px}.up-head>div{flex:1 1 300px;min-width:0}'+
  '.up-kick{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--warn);margin:0 0 4px}.up-head h2{font-size:22px;margin:0 0 4px}.up-meta{font-size:13px;color:var(--ink-3)}'+
  '.up-url{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}.up-url code{font-size:12.5px;background:var(--sunk);padding:5px 9px;border-radius:7px;overflow-wrap:anywhere}'+
  '.up-acts{display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start}.up-msg{font-size:13px;background:var(--sunk);border-radius:8px;padding:8px 10px;white-space:pre-line;margin-top:8px}'+
  '.up-grid{display:grid;grid-template-columns:200px minmax(0,1fr) 250px;gap:12px;align-items:start}'+
  '@container (max-width:980px){.up-grid{grid-template-columns:190px minmax(0,1fr)}.up-side{grid-column:1/-1}}@container (max-width:620px){.up-grid{grid-template-columns:minmax(0,1fr)}}'+
  '.up-card{padding:12px}.up-th{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px}.up-th b{font-size:14px}'+
  '.up-tree{display:grid;gap:2px}.up-tree button{display:flex;gap:7px;align-items:center;width:100%;text-align:left;background:none;border:0;padding:6px 8px;border-radius:8px;cursor:pointer;color:var(--ink);font:inherit;font-size:13.5px;min-width:0}'+
  '.up-tree button span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.up-tree button small{color:var(--ink-3);font-size:12px}.up-tree button:hover,.up-tree button.drop{background:var(--sunk)}.up-tree button[aria-current="true"]{background:var(--sunk);font-weight:700}'+
  '.up-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding-bottom:8px;border-bottom:1px solid var(--line)}'+
  '.up-cr{display:flex;flex-wrap:wrap;gap:2px;align-items:center;font-size:13.5px}.up-cr button{background:none;border:0;padding:3px 6px;border-radius:6px;cursor:pointer;color:var(--ink);font:inherit}.up-cr button:hover,.up-cr button.drop{background:var(--sunk)}'+
  '.up-tbl{display:grid}.up-hd,.up-f,.up-d{display:grid;grid-template-columns:minmax(0,1fr) 120px 80px auto;gap:10px;align-items:center;font-size:13.5px;padding:8px 4px;border-bottom:1px solid var(--line)}'+
  '.up-hd{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);padding-top:10px}.up-f:hover,.up-d:hover,.up-d.drop{background:var(--sunk)}'+
  '.up-n{display:flex;gap:9px;align-items:center;min-width:0}.up-n span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.up-d .up-n{background:none;border:0;padding:0;cursor:pointer;color:var(--ink);font:inherit;font-weight:600;text-align:left}'+
  '.up-ext{flex:none;width:30px;height:22px;border-radius:5px;display:grid;place-items:center;font-size:9.5px;font-weight:800;letter-spacing:.02em;color:#fff;background:var(--ink-3)}'+
  '.up-ext.pdf{background:#e5484d}.up-ext.img{background:#30a46c}.up-ext.zip{background:#8e4ec6}.up-ext.doc{background:#0a84ff}.up-ext.vec{background:#f76b15}'+
  '.up-r{display:flex;gap:4px;justify-content:flex-end}.up-empty{padding:26px 10px;text-align:center;color:var(--ink-3);font-size:13.5px}'+
  '.up-drop{display:grid;justify-items:center;gap:6px;text-align:center;padding:22px 12px;border:2px dashed var(--line-2,var(--line));border-radius:12px;cursor:pointer;color:var(--ink-2)}.up-drop:hover{border-color:var(--glow);background:var(--sunk)}'+
  '.up-drop svg{width:26px;height:26px;color:var(--glow)}.up-drop b{color:var(--ink)}.up-drop small{font-size:12.5px;color:var(--ink-3)}.up-ub{display:grid;gap:6px;margin-top:10px}.up-ub .btn{justify-content:center}'+
  '.up-tgt{font-size:13px;color:var(--ink-3);margin:-4px 0 10px}.up-prog{font-size:13px;background:var(--sunk);border-radius:8px;padding:8px 10px;margin-top:10px}'+
  '.up-cv{display:grid;gap:8px;max-height:340px;overflow:auto;padding:2px 2px 10px}.up-b{max-width:88%;justify-self:start;background:var(--sunk);border-radius:14px 14px 14px 4px;padding:8px 11px;font-size:13.5px;white-space:pre-line;overflow-wrap:anywhere}.up-b.me{justify-self:end;background:color-mix(in srgb,var(--glow) 18%,var(--panel));border-radius:14px 14px 4px 14px}.up-b small{display:block;margin-top:3px;font-size:11.5px;color:var(--ink-3)}.up-cf{display:grid;gap:8px;border-top:1px solid var(--line);padding-top:10px}.up-cf textarea{resize:vertical;min-height:64px}'+
  '@container (max-width:620px){.up-hd{display:none}.up-f,.up-d{grid-template-columns:minmax(0,1fr) auto}.up-f .muted,.up-d .muted{display:none}}');
var SEL="";
function hasNew(l){ return isNew(l); }
function cur(){ var L=(ST&&ST.links)||[]; return L.find(function(l){ return l.id===SEL; })||L.find(isNew)||L[0]||null; }
function extOf(n){ var e=(String(n).split(".").pop()||"").toLowerCase(); if(e===n.toLowerCase()) e="";
  var c=/^pdf$/.test(e)?"pdf":/^(jpe?g|png|gif|webp|heic|tiff?|bmp|svg)$/.test(e)?"img":/^(zip|rar|7z|gz|tar)$/.test(e)?"zip":/^(docx?|xlsx?|pptx?|txt|csv|odt)$/.test(e)?"doc":/^(ai|eps|psd|indd|cdr|afdesign|afphoto)$/.test(e)?"vec":"";
  return '<span class="up-ext '+c+'" aria-hidden="true">'+esc((e||"?").slice(0,4).toUpperCase())+'</span>'; }
function tabHtml(l){ return '<button type="button" class="up-tab" data-act="upsel:'+esc(l.id)+'" aria-current="'+(cur()&&cur().id===l.id)+'"><b>'+(hasNew(l)?'<span class="up-new" title="Neue Dateien"></span>':'')+esc(l.title)+'</b>'+
  '<small>'+l.count+' Datei'+(l.count===1?'':'en')+(l.count?' · '+hb(l.bytes):'')+(l.active?'':' · geschlossen')+'</small><small>'+(l.lastAt?'zuletzt '+dt(l.lastAt):'angelegt '+de(String(l.createdAt).slice(0,10)))+'</small></button>'; }
function headHtml(l){ var part=(l.files||[]).filter(function(f){ return !f.done; });
  return '<section class="panel up-head"><div><p class="up-kick">Geteilter Ordner'+(l.active?'':' · geschlossen')+'</p><h2>'+esc(l.title)+'</h2>'+
    '<div class="up-meta">'+l.count+' Datei'+(l.count===1?'':'en')+(l.count?' · '+hb(l.bytes):'')+(part.length?' · '+part.length+' unvollständig':'')+(l.lastAt?' · zuletzt '+dt(l.lastAt):'')+' · angelegt '+de(String(l.createdAt).slice(0,10))+(l.expires?' · offen bis '+de(String(l.expires).slice(0,10)):'')+'</div>'+
    (l.note?'<div class="up-meta">Hinweis für den Kunden: '+esc(l.note)+'</div>':'')+
    '<div class="up-url"><code>'+esc(l.url)+'</code></div>'+
    '</div>'+
    '<div class="up-acts"><button type="button" class="btn sm" data-act="upcopy:'+esc(l.id)+'">'+F.svg("link")+' Link kopieren</button><button type="button" class="btn sm" data-act="upmail:'+esc(l.id)+'">'+F.svg("send")+' Per Mail</button>'+
    '<a class="btn sm" href="'+esc(l.url)+'" target="_blank" rel="noopener">'+F.svg("external")+' Kundenansicht</a>'+
    '<button type="button" class="btn sm" data-act="uptoggle:'+esc(l.id)+'">'+F.svg("lock")+' '+(l.active?"Schließen":"Wieder öffnen")+'</button>'+
    '<button type="button" class="btn sm" data-act="updell:'+esc(l.id)+'" style="color:var(--bad)">'+F.svg("trash")+' Löschen</button></div></section>'; }
function treeHtml(l){ var d=CUR[l.id]||"", all=(l.files||[]).filter(function(f){ return f.done; });
  function cnt(x){ return all.filter(function(f){ return inDir(f.dir,x); }).length; }
  function item(x,depth){ return '<button type="button" data-act="updir:'+esc(l.id)+'|'+esc(x)+'" data-updrop="'+esc(l.id)+'|'+esc(x)+'" style="padding-left:'+(8+depth*14)+'px"'+(x===d?' aria-current="true"':'')+'>'+FOLDER+'<span>'+esc(x?x.split("/").pop():"Alle Dateien")+'</span><small>'+cnt(x)+'</small></button>'+
    (x===""?"":"")+kids(l,x).map(function(k){ return item(k,depth+1); }).join(""); }
  return '<aside class="panel up-card" data-upos="'+esc(l.id)+'"><div class="up-th"><b>Ordner</b><button type="button" class="btn sm" data-act="upmkdir:'+esc(l.id)+'">+ Neuer Ordner</button></div><nav class="up-tree" aria-label="Ordner">'+item("",0)+'</nav></aside>'; }
function mainHtml(l){
  var d=CUR[l.id]||"", files=(l.files||[]).filter(function(f){ return (f.dir||"")===d; }), p=d?d.split("/"):[];
  if(d&&(l.dirs||[]).indexOf(d)<0){ CUR[l.id]=""; return mainHtml(l); }
  var cr='<div class="up-bar"><nav class="up-cr" aria-label="Pfad"><button type="button" data-act="updir:'+esc(l.id)+'|" data-updrop="'+esc(l.id)+'|">'+FOLDER+' Alle Dateien</button>'+
    p.map(function(x,i){ var q=p.slice(0,i+1).join("/"); return ' › <button type="button" data-act="updir:'+esc(l.id)+'|'+esc(q)+'" data-updrop="'+esc(l.id)+'|'+esc(q)+'"'+(i===p.length-1?' aria-current="true" style="font-weight:700"':'')+'>'+esc(x)+'</button>'; }).join("")+'</nav>'+
    (l.count?'<a class="btn sm" href="/admin/api/uploads/zip?link='+encodeURIComponent(l.id)+(d?'&dir='+encodeURIComponent(d):'')+'" download>'+F.svg("download")+' '+(d?'Ordner':'Alles')+' herunterladen</a>':'')+'</div>';
  var ds=kids(l,d).map(function(x){ var fs=(l.files||[]).filter(function(f){ return f.done&&inDir(f.dir,x); }), by=fs.reduce(function(a,f){ return a+f.size; },0);
    return '<div class="up-d" data-updrop="'+esc(l.id)+'|'+esc(x)+'"><button type="button" class="up-n" data-act="updir:'+esc(l.id)+'|'+esc(x)+'">'+FOLDER+'<span>'+esc(x.split("/").pop())+'</span></button><span class="muted">'+fs.length+' Datei'+(fs.length===1?'':'en')+'</span><span class="muted">'+(by?hb(by):'–')+'</span>'+
      '<span class="up-r"><button type="button" class="btn sm" data-act="upren:'+esc(l.id)+'|'+esc(x)+'" title="Umbenennen / verschieben" aria-label="Ordner umbenennen">✎</button><button type="button" class="btn sm" data-act="uprmdir:'+esc(l.id)+'|'+esc(x)+'" title="Ordner löschen" aria-label="Ordner löschen">✕</button></span></div>'; }).join("");
  var fl=files.map(function(f){ return '<div class="up-f" draggable="true" data-updrag="'+esc(l.id)+'|'+esc(f.id)+'"><span class="up-n" title="'+esc(f.name)+'">'+extOf(f.name)+'<span>'+esc(f.name)+'</span>'+(f.fs?' <span class="tag grey">von dir</span>':'')+'</span>'+
      '<span class="muted">'+dt(f.doneAt||f.at)+'</span><span class="muted">'+(f.done?hb(f.size):Math.floor(100*f.got/f.size)+" %")+'</span><span class="up-r">'+
      (f.done?'<a class="btn sm" href="/admin/api/uploads/file?link='+encodeURIComponent(l.id)+'&f='+encodeURIComponent(f.id)+'" download title="Herunterladen" aria-label="Herunterladen">'+F.svg("download")+'</a>':'')+
      ((l.dirs||[]).length?'<button type="button" class="btn sm" data-act="upmv:'+esc(l.id)+'|'+esc(f.id)+'" title="In anderen Ordner verschieben" aria-label="Verschieben">↪</button>':'')+
      '<button type="button" class="btn sm" data-act="updelf:'+esc(l.id)+'|'+esc(f.id)+'" title="Datei löschen" aria-label="Datei löschen">✕</button></span></div>'; }).join("");
  return '<section class="panel up-card" data-upos="'+esc(l.id)+'">'+cr+'<div class="up-tbl">'+((ds||fl)?'<div class="up-hd"><span>Name</span><span>Geändert</span><span>Größe</span><span></span></div>'+ds+fl:'<div class="up-empty">'+(d?'Dieser Ordner ist leer.':'Noch keine Dateien.')+'<br>Dateien einfach hierher ziehen.</div>')+'</div></section>'; }
function sideHtml(l){ var d=CUR[l.id]||"", q=UPS[l.id];
  var UP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 19.5h15"/></svg>';
  return '<aside class="panel up-card" data-upos="'+esc(l.id)+'"><div class="up-th"><b>Hochladen</b></div><p class="up-tgt">nach: <b>'+esc(d?d.split("/").pop():"Alle Dateien")+'</b> · beim Kunden „von FS Creative“</p>'+
    '<label class="up-drop">'+UP+'<b>Dateien hierher ziehen</b><small>oder klicken zum Auswählen</small><input type="file" multiple hidden data-upin="'+esc(l.id)+'"></label>'+
    '<div class="up-ub"><label class="btn sm">Ordner auswählen<input type="file" multiple webkitdirectory hidden data-upin="'+esc(l.id)+'"></label></div>'+
    (q&&q.n?'<div class="up-prog" id="upprog-'+esc(l.id)+'">'+progTxt(q)+'</div>':'')+'</aside>'; }
/* Chat mit dem Kunden (Wunsch Simon 05.11.2026): Verlauf wie im Messenger, Antwort erscheint auf der Upload-Seite; auf Wunsch kurze Mail an den Kunden */
var DRAFT={};
function chatHtml(l){ var ms=l.msgs||[];
  return '<section class="panel up-card up-chat"><div class="up-th"><b>Nachrichten</b><span class="muted" style="font-size:12.5px">'+(ms.length?ms.length+' im Verlauf':'')+'</span></div>'+
    '<div class="up-cv" id="upcv-'+esc(l.id)+'">'+(ms.length?ms.map(function(m){ var me=m.by==="fs"; return '<div class="up-b'+(me?' me':'')+'"><div>'+esc(m.text)+'</div><small>'+(me?'Du':'Kunde')+' · '+dt(m.at)+(me&&m.mailed?' · per Mail benachrichtigt':'')+'</small></div>'; }).join(""):'<div class="up-empty" style="padding:14px 6px">Noch keine Nachrichten. Schreib dem Kunden – er sieht es auf seiner Upload-Seite.</div>')+'</div>'+
    '<form data-form="upreply" class="up-cf"><input type="hidden" name="id" value="'+esc(l.id)+'"><textarea class="f" name="text" rows="3" maxlength="4000" placeholder="Nachricht an '+esc(l.title)+' …" data-updraft="'+esc(l.id)+'">'+esc(DRAFT[l.id]||"")+'</textarea>'+
    '<div class="row-between wrap" style="gap:8px">'+(l.email?'<label class="row small" style="gap:6px"><input type="checkbox" name="mail" checked style="width:16px;height:16px"> Per Mail an '+esc(l.email)+' benachrichtigen</label>':'<span class="muted small">Keine Mail-Adresse hinterlegt – der Kunde sieht es auf der Upload-Seite</span>')+
    '<button class="btn sm primary" type="submit">'+F.svg("send")+' Senden</button></div></form></section>'; }
function linkView(l){ return '<div class="up-wrap">'+headHtml(l)+'<div class="up-grid">'+treeHtml(l)+mainHtml(l)+'<div class="up-side" style="display:grid;gap:12px">'+sideHtml(l)+chatHtml(l)+'</div></div></div>'; }
document.addEventListener("input",function(e){ var t=e.target; if(t&&t.getAttribute&&t.getAttribute("data-updraft")) DRAFT[t.getAttribute("data-updraft")]=t.value; });
document.addEventListener("keydown",function(e){ var t=e.target; if(t&&t.getAttribute&&t.getAttribute("data-updraft")&&e.key==="Enter"&&(e.metaKey||e.ctrlKey)){ e.preventDefault(); var f=t.closest("form"); if(f) f.requestSubmit(); } });
F.forms.upreply=function(form){ var id=form.id.value, t=form.text.value.trim(); if(!t) return; var btn=form.querySelector("button[type=submit]"); if(btn) btn.disabled=true;
  F.api("/admin/api/uploads",{body:{op:"reply",id:id,text:t,mail:!!(form.mail&&form.mail.checked)}}).then(function(j){ if(btn) btn.disabled=false;
    if(!j||!j.ok){ F.toast((j&&j.error)||"Senden fehlgeschlagen",true); return; } DRAFT[id]="";
    F.toast(j.mailed?"Gesendet – Kunde per Mail benachrichtigt":j.mailError?"Gesendet – Mail fehlgeschlagen: "+j.mailError:"Gesendet",!!j.mailError); load(); }).catch(function(){ if(btn) btn.disabled=false; F.toast("Keine Verbindung",true); }); };
var FOLDER='<svg width="18" height="18" viewBox="0 0 24 24" fill="var(--warn)" aria-hidden="true" style="flex:none"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
function inDir(fd,d){ fd=fd||""; return !d||fd===d||fd.indexOf(d+"/")===0; }
function kids(l,d){ var pre=d?d+"/":"", n=d?d.split("/").length+1:1; return (l.dirs||[]).filter(function(x){ return x.indexOf(pre)===0&&x.split("/").length===n; }); }
// Simon lädt selbst hoch (in Stücken wie beim Kunden, landet im offenen Ordner, beim Kunden „von FS Creative“)
var UPS={};
function progTxt(q){ return 'Lade hoch: '+q.done+' von '+q.n+' Datei'+(q.n===1?'':'en')+(q.cur?' · '+esc(q.cur)+' '+q.pct+' %':'')+(q.err?' · <span style="color:var(--bad)">'+esc(q.err)+'</span>':''); }
function progShow(id){ var e=document.getElementById("upprog-"+id); if(e) e.innerHTML=progTxt(UPS[id]); else F.render(); }
function upQueue(id,items){
  var q=UPS[id]||(UPS[id]={n:0,done:0,list:[],run:false}); q.n+=items.length; q.list=q.list.concat(items); q.err=""; progShow(id); if(!q.run) upNext(id);
}
function upNext(id){
  var q=UPS[id]; if(!q.list.length){ q.run=false; var ok=q.done, bad=q.n-q.done; delete UPS[id]; F.toast(ok+" Datei"+(ok===1?"":"en")+" hochgeladen"+(bad?" · "+bad+" fehlgeschlagen":""),!!bad); load(); return; }
  q.run=true; var x=q.list.shift(), f=x.f, tries=0; q.cur=f.name; q.pct=0; progShow(id);
  function fail(m){ q.err=f.name+": "+m; progShow(id); upNext(id); }
  function init(){ return F.api("/admin/api/uploads",{body:{op:"init",id:id,name:f.name,size:f.size,type:f.type,dir:x.dir}}); }
  init().then(function(j){ if(!j||!j.ok) return fail((j&&j.error)||"Fehler"); var fid=j.id, CH=j.chunk||16777216, g=j.got||0;
    (function put(){
      if(g>=f.size){ q.done++; q.cur=""; upNext(id); return; }
      fetch("/admin/api/uploads/chunk?link="+encodeURIComponent(id)+"&f="+encodeURIComponent(fid)+"&o="+g,{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/octet-stream"},body:f.slice(g,Math.min(f.size,g+CH))})
        .then(function(r){ return r.json().catch(function(){ return {ok:false}; }).then(function(k){ k.status=r.status; return k; }); })
        .then(function(k){ if(k.ok){ tries=0; g=k.got; q.pct=Math.floor(100*g/f.size); progShow(id); put(); return; } if(k.status===404||k.status===507||k.status===401) return fail(k.error||"Fehler"); retry(); }).catch(retry);
      function retry(){ if(++tries>8) return fail("Verbindung unterbrochen"); setTimeout(function(){ init().then(function(k){ if(k&&k.ok){ fid=k.id; g=k.got; } put(); }).catch(put); },Math.min(30000,1500*tries*tries)); }
    })();
  }).catch(function(){ fail("Keine Verbindung"); });
}
function relDir(f){ var r=f.webkitRelativePath||""; return r.indexOf("/")>0?r.slice(0,r.lastIndexOf("/")):""; }
function joinD(a,b){ return [a,b].filter(Boolean).join("/"); }
document.addEventListener("change",function(e){ var t=e.target; if(!t.getAttribute||!t.getAttribute("data-upin")) return; var id=t.getAttribute("data-upin"), d=CUR[id]||"";
  var items=[].filter.call(t.files||[],function(f){ return f.size>0; }).map(function(f){ return {f:f,dir:joinD(d,relDir(f))}; }); t.value=""; if(items.length) upQueue(id,items); });
// Dateien vom Mac direkt in die geöffnete Dateiliste ziehen (ganze Ordner behalten ihre Struktur)
function walkE(en,dir,out){ return new Promise(function(res){
  if(en.isFile){ en.file(function(f){ out.push({f:f,dir:dir}); res(); },function(){ res(); }); return; }
  if(!en.isDirectory){ res(); return; }
  var d=joinD(dir,en.name), r=en.createReader(), all=[]; out.push({mk:d});
  (function more(){ r.readEntries(function(es){ if(!es.length){ Promise.all(all.map(function(x){ return walkE(x,d,out); })).then(res); return; } all=all.concat([].slice.call(es)); more(); },function(){ res(); }); })(); }); }
function osFiles(e){ return e.dataTransfer&&[].indexOf.call(e.dataTransfer.types||[],"Files")>=0; }
document.addEventListener("dragover",function(e){ if(!osFiles(e)) return; var t=e.target.closest&&e.target.closest("[data-upos]"); if(!t) return; e.preventDefault(); e.dataTransfer.dropEffect="copy"; });
document.addEventListener("drop",function(e){ if(!osFiles(e)) return; var t=e.target.closest&&e.target.closest("[data-upos]"); if(!t) return; e.preventDefault();
  var id=t.getAttribute("data-upos"), fo=e.target.closest("[data-updrop]"), d=fo?fo.getAttribute("data-updrop").split("|").slice(1).join("|"):(CUR[id]||""), dt=e.dataTransfer;
  var ens=dt.items&&dt.items.length&&dt.items[0].webkitGetAsEntry?[].map.call(dt.items,function(i){ return i.webkitGetAsEntry&&i.webkitGetAsEntry(); }).filter(Boolean):null;
  if(!ens||!ens.some(function(x){ return x.isDirectory; })){ var it=[].filter.call(dt.files||[],function(f){ return f.size>0; }).map(function(f){ return {f:f,dir:d}; }); if(it.length) upQueue(id,it); return; }
  var out=[]; Promise.all(ens.map(function(x){ return walkE(x,d,out); })).then(function(){
    out.filter(function(o){ return o.mk; }).forEach(function(o){ F.api("/admin/api/uploads",{body:{op:"mkdir",id:id,parent:"",name:o.mk}}); });
    var it=out.filter(function(o){ return o.f&&o.f.size>0; }); if(it.length) upQueue(id,it); }); });
function render(){
  if(!ST){ load(); return F.head("Uploads","Links für Kunden-Dateien")+'<div class="muted" style="padding:20px">Lade …</div>'; }
  if(!ST.ok) return F.head("Uploads","")+'<div class="notice"><span>'+esc(ST.error)+'</span><button type="button" class="btn sm" data-act="upreload">Erneut</button></div>';
  var L=ST.links||[], tot=L.reduce(function(a,l){ return a+l.bytes; },0);
  return F.head("Uploads",'Kunden laden über einen Link Dateien hoch – ohne Anmeldung, beliebig viele und groß'+(ST.free!=null?' · Speicher frei: '+hb(ST.free):'')+(tot?' · belegt: '+hb(tot):''),'<button type="button" class="btn primary" data-act="upnew">'+F.svg("plus")+' Neuer Upload-Link</button>')+
    (L.length?'<div class="up-tabs">'+L.map(tabHtml).join("")+'</div>'+linkView(cur()):'<div class="panel"><div class="muted" style="padding:20px">Noch keine Upload-Links. Lege einen an und schick ihn dem Kunden.</div></div>');
}
function link(id){ return ((ST&&ST.links)||[]).find(function(l){ return l.id===id; })||null; }
function post(body,msg){ return F.api("/admin/api/uploads",{body:body}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; } if(msg) F.toast(msg); load(); return j; }); }
function copy(t){ try{ navigator.clipboard.writeText(t).then(function(){ F.toast("Link kopiert"); },function(){ F.toast("Kopieren nicht möglich – bitte markieren",true); }); }catch(e){ F.toast("Kopieren nicht möglich – bitte markieren",true); } }
F.action("updir",function(v){ var i=String(v).indexOf("|"); CUR[v.slice(0,i)]=v.slice(i+1); F.render(); });
function nameModal(title,label,val,fn){
  F.modal('<form data-form="upname" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+esc(title)+'</h2>'+F.btnClose()+'</div><label class="fl">'+esc(label)+'<input class="f" name="n" required maxlength="300" value="'+esc(val||"")+'"></label>'+
    '<div class="foot"><span class="err" id="upNErr"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">OK</button></span></div></form>',"narrow");
  NAMEFN=fn; setTimeout(function(){ var i=document.querySelector('[data-form="upname"] input'); if(i){ i.focus(); i.select(); } },30);
}
var NAMEFN=null;
F.forms.upname=function(form){ var v=form.n.value.trim().replace(/^\/+|\/+$/g,""); if(!v){ document.getElementById("upNErr").textContent="Bitte einen Namen eingeben."; return; } if(NAMEFN) NAMEFN(v); };
F.action("upmkdir",function(id){ var d=CUR[id]||"";
  nameModal("Neuer Ordner",d?"Name (in „"+d.split("/").pop()+"“)":"Name","",function(n){ post({op:"mkdir",id:id,parent:d,name:n.replace(/\//g,"-")}).then(function(j){ if(!j) return; F.closeModal(); CUR[id]=j.dir; }); }); });
F.action("upren",function(v){ var p=String(v).split("|"), id=p[0], d=p.slice(1).join("|");
  nameModal("Ordner umbenennen","Name bzw. Pfad (mit / in einen anderen Ordner verschieben)",d,function(n){ post({op:"renameDir",id:id,from:d,to:n},"Ordner geändert").then(function(j){ if(j) F.closeModal(); }); }); });
F.action("uprmdir",function(v){ var p=String(v).split("|"), id=p[0], d=p.slice(1).join("|"), l=link(id); if(!l) return;
  var n=(l.files||[]).filter(function(f){ return inDir(f.dir,d); }).length;
  if(!n) return void post({op:"rmdirEmpty",id:id,dir:d},"Ordner gelöscht");
  ask("Ordner löschen?","„"+d.split("/").pop()+"“ samt Unterordnern und "+n+" Datei(en) wird endgültig vom Server gelöscht.","Ordner und Dateien löschen",function(){ post({op:"deleteDir",id:id,dir:d,confirm:true},"Ordner gelöscht"); }); });
F.action("upmv",function(v){ var p=String(v).split("|"), l=link(p[0]), f=l&&(l.files||[]).find(function(x){ return x.id===p[1]; }); if(!f) return;
  var opts=[""].concat(l.dirs||[]).map(function(x){ return '<option value="'+esc(x)+'"'+(x===(f.dir||"")?" selected":"")+'>'+(x?esc(x.split("/").map(function(){ return ""; }).join("\u2003")+"📁 "+x.split("/").pop()):"Alle Dateien (oberste Ebene)")+'</option>'; }).join("");
  F.modal('<form data-form="upmv" class="stackf"><div class="row-between"><h2 style="font-size:20px">Verschieben</h2>'+F.btnClose()+'</div><p class="muted" style="margin:0">'+esc(f.name)+'</p><input type="hidden" name="id" value="'+esc(l.id)+'"><input type="hidden" name="f" value="'+esc(f.id)+'"><label class="fl">Nach<select class="f" name="dir">'+opts+'</select></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Verschieben</button></span></div></form>',"narrow"); });
F.forms.upmv=function(form){ post({op:"moveFiles",id:form.id.value,files:[form.f.value],dir:form.dir.value},"Verschoben").then(function(j){ if(j) F.closeModal(); }); };
// Ziehen & Ablegen: Datei auf einen Ordner oder in den Pfad oben ziehen
document.addEventListener("dragstart",function(e){ var r=e.target.closest&&e.target.closest("[data-updrag]"); if(!r) return; e.dataTransfer.setData("text/x-fsupload",r.getAttribute("data-updrag")); e.dataTransfer.effectAllowed="move"; });
function dropT(e){ return e.target.closest&&e.target.closest("[data-updrop]"); }
document.addEventListener("dragover",function(e){ var t=dropT(e); if(!t||[].indexOf.call(e.dataTransfer.types||[],"text/x-fsupload")<0) return; e.preventDefault(); t.classList.add("drop"); });
document.addEventListener("dragleave",function(e){ var t=dropT(e); if(t) t.classList.remove("drop"); });
document.addEventListener("drop",function(e){ var t=dropT(e); if(!t) return; var v=e.dataTransfer.getData("text/x-fsupload"); if(!v) return; e.preventDefault(); t.classList.remove("drop");
  var a=v.split("|"), b=t.getAttribute("data-updrop"), i=b.indexOf("|"); if(a[0]!==b.slice(0,i)) return; post({op:"moveFiles",id:a[0],files:[a[1]],dir:b.slice(i+1)},"Verschoben"); });
F.action("upreload",function(){ ST=null; F.render(); });
F.action("upnew",function(){
  F.modal('<form data-form="upnew" class="stackf"><div class="row-between"><h2 style="font-size:20px">Neuer Upload-Link</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Titel (Kunde / Projekt)<input class="f" name="title" required maxlength="120" placeholder="z. B. SV Gaschurn – Logos"></label>'+
    '<label class="fl"><span>E-Mail des Kunden <span class="muted small">(optional – zum Senden des Links)</span></span><input class="f" name="email" type="email" maxlength="160"></label>'+
    '<label class="fl"><span>Hinweis auf der Upload-Seite <span class="muted small">(optional)</span></span><textarea class="f" name="note" rows="2" maxlength="600" placeholder="z. B. Bitte Logo als PDF oder PNG und alle Fotos in Originalgröße"></textarea></label>'+
    '<label class="fl">Offen<select class="f" name="days"><option value="0">unbegrenzt</option><option value="7">7 Tage</option><option value="30">30 Tage</option><option value="90">90 Tage</option></select></label>'+
    '<div class="foot"><span class="err" id="upErr"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Link anlegen</button></span></div></form>',"narrow");
});
F.forms.upnew=function(form){
  var b={op:"create",title:form.title.value.trim(),email:form.email.value.trim(),note:form.note.value.trim(),days:form.days.value};
  if(!b.title){ document.getElementById("upErr").textContent="Bitte einen Titel angeben."; return; }
  post(b).then(function(j){ if(!j) return; F.closeModal(); SEL=j.link.id; copy(j.link.url); F.toast("Upload-Link angelegt und kopiert",false,j.link.email?"Per Mail senden":null,j.link.email?function(){ mail(j.link); }:null); });
};
function mail(l){
  if(!F.compose){ copy(l.url); return; }
  F.compose({title:"Upload-Link senden",to:l.email||"",subject:"Dateien hochladen · "+l.title+" · FS Creative",
    text:"Hallo,\n\nüber diesen Link kannst du mir die Dateien ganz einfach hochladen – ohne Anmeldung, beliebig viele und auch große Dateien (einfach hineinziehen oder auswählen):\n\n"+l.url+"\n\n"+(l.note?l.note+"\n\n":"")+"Danke und liebe Grüße\nSimon Felder\nFS Creative"});
}
F.action("upcopy",function(id){ var l=link(id); if(l) copy(l.url); });
F.action("upmail",function(id){ var l=link(id); if(l) mail(l); });
function markSeen(l){ if(l&&isNew(l)){ l.seenAt=new Date().toISOString(); F.api("/admin/api/uploads",{body:{op:"seen",id:l.id}}); } }
F.action("upsel",function(id){ SEL=id; markSeen(link(id)); F.render(); });
F.action("uptoggle",function(id){ var l=link(id); if(l) post({op:"update",id:id,active:!l.active},l.active?"Link geschlossen – keine Uploads mehr möglich":"Link wieder offen"); });
function ask(title,text,yes,fn){ F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:20px">'+esc(title)+'</h2>'+F.btnClose()+'</div><p>'+esc(text)+'</p><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="button" class="btn danger" id="upYes">'+esc(yes)+'</button></span></div></div>',"narrow");
  setTimeout(function(){ var b=document.getElementById("upYes"); if(b) b.onclick=function(){ F.closeModal(); fn(); }; },0); }
F.action("updelf",function(v){ var p=String(v).split("|"), l=link(p[0]), f=l&&(l.files||[]).find(function(x){ return x.id===p[1]; }); if(!f) return;
  ask("Datei löschen?","„"+f.name+"“ wird endgültig vom Server gelöscht.","Endgültig löschen",function(){ post({op:"deleteFile",id:p[0],file:p[1],confirm:true},"Datei gelöscht"); }); });
F.action("updell",function(id){ var l=link(id); if(!l) return;
  ask("Upload-Link löschen?","Der Link „"+l.title+"“ funktioniert danach nicht mehr und alle "+l.count+" Datei(en) werden endgültig vom Server gelöscht.","Link und Dateien löschen",function(){ post({op:"deleteLink",id:id,confirm:true},"Link gelöscht"); }); });
F.view({id:"uploads",label:"Uploads",short:"Uploads",icon:"upload",order:37,count:function(){ return ST&&ST.ok?(ST.links||[]).filter(isNew).length:0; },render:render,after:function(){ if(!ST) load(); else if(ST.ok) markSeen(cur()); var c=document.querySelector(".up-cv"); if(c) c.scrollTop=c.scrollHeight; }});
setTimeout(load,4000);
/* offen auf „Uploads“: alle 30 s (neue Nachrichten im Chat), sonst alle 2 Min.; nie während du tippst (Eingabe bliebe zwar erhalten, aber der Fokus ginge verloren) */
var tick=0; setInterval(function(){ tick++; var a=document.activeElement; if(document.visibilityState!=="visible"||(a&&a.getAttribute&&a.getAttribute("data-updraft"))) return; if(F.current==="uploads"||tick%4===0) load(); },30000);
})();
