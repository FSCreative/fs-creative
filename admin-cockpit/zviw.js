/* VIW Cloud: Dateien der VIW-Nextcloud im Cockpit (über den Server, viw-cloud.js – das App-Passwort bleibt dort).
   Ordner ansehen, Dateien/ganze Ordner hochladen (Ziehen oder Auswahl, große Dateien in Teilen mit Fortschritt), herunterladen, PDF/Bild ansehen,
   neuer Ordner, umbenennen, verschieben (auch per Ziehen auf einen Ordner), löschen (→ Papierkorb der Nextcloud), interner Link.
   Mail-Anhänge: „In VIW Cloud speichern“ (Ordner wählen). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.cloud=F.icons.cloud||'<path d="M7 18.5h10.5a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.3 10.6 4 4 0 0 0 7 18.5z"/>';
F.icons.vfolder='<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>';
F.icons.vfile='<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>';
F.icons.vup='<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';
F.icons.vdown='<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';
F.icons.vdots='<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>';
F.icons.vext='<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';
F.icons.vrefresh='<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>';
F.icons.vnewdir='<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>';

var ST=null, STP=null, CUR=null, LOADING=false, SEL={}, Q=[], QRUN=0, POLICY=null, MADE={};
var SMALL=10*1024*1024, CHUNK=10*1024*1024;
UI.viwPath=UI.viwPath||F.ls("fsc_viw_path")||"/";
UI.viwQ=UI.viwQ||"";

/* ---------- Hilfen ---------- */
function api(path,body){ return F.api(path,body?{body:body}:undefined); }
function join(dir,name){ dir=String(dir||"/"); return (dir==="/"?"":dir.replace(/\/+$/,""))+"/"+String(name||"").replace(/^\/+/,""); }
function parentOf(p){ var a=String(p||"/").split("/").filter(Boolean); a.pop(); return "/"+a.join("/"); }
function baseOf(p){ return String(p||"").split("/").filter(Boolean).pop()||""; }
function bytes(n){ n=+n||0; if(n<1024) return n+" B"; if(n<1048576) return (n/1024).toFixed(n<10240?1:0).replace(".",",")+" KB"; if(n<1073741824) return (n/1048576).toFixed(n<10485760?1:0).replace(".",",")+" MB"; return (n/1073741824).toFixed(1).replace(".",",")+" GB"; }
function when(iso){ if(!iso) return ""; var d=new Date(iso), now=new Date(); if(d.toDateString()===now.toDateString()) return "heute "+d.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); return d.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit",year:d.getFullYear()===now.getFullYear()?undefined:"numeric"}); }
function fileUrl(p,inline){ return "/admin/api/viw/file?path="+encodeURIComponent(p)+(inline?"&inline=1":""); }
function kind(it){ var n=String(it.name||"").toLowerCase(), t=String(it.type||"");
  if(/pdf/.test(t)||/\.pdf$/.test(n)) return "pdf"; if(/^image\/(png|jpe?g|gif|webp)/.test(t)||/\.(png|jpe?g|gif|webp)$/.test(n)) return "img"; return ""; }
function extTag(n){ var e=(String(n||"").split(".").pop()||"").toUpperCase(); return e.length>0&&e.length<=4&&String(n).indexOf(".")>0?e:""; }
function setPath(p){ UI.viwPath=p||"/"; F.ls("fsc_viw_path",UI.viwPath); SEL={}; UI.viwQ=""; }
F.viwOn=false;

/* ---------- Laden ---------- */
function loadStatus(check){
  if(STP) return STP;
  STP=api("/admin/api/viw/status"+(check?"?check=1":"")).then(function(j){ ST=j||{ok:false}; F.viwOn=!!(j&&j.configured); STP=null; if(F.current==="viw") F.render(); return ST; })
    .catch(function(){ STP=null; ST=ST||{ok:false,error:"Keine Verbindung zum Server"}; return ST; });
  return STP;
}
function load(path,quiet){
  path=path||UI.viwPath||"/"; LOADING=true; if(!quiet&&F.current==="viw") paintList();
  return api("/admin/api/viw/list?path="+encodeURIComponent(path)).then(function(j){
    LOADING=false;
    if(j&&j.ok){ CUR={path:j.path,items:j.items||[],self:j.self,at:Date.now()}; if(j.path!==UI.viwPath) setPath(j.path); }
    else if(path!=="/"&&j&&/Nicht gefunden/.test(j.error||"")){ setPath("/"); return load("/"); }
    else CUR={path:path,items:[],error:(j&&j.error)||"Fehler beim Laden",at:Date.now()};
    if(F.current==="viw") F.render();
  }).catch(function(){ LOADING=false; CUR={path:path,items:[],error:"Keine Verbindung zum Server",at:Date.now()}; if(F.current==="viw") F.render(); });
}
setTimeout(function(){ loadStatus(false); },1500);   /* nur ob eingerichtet – für den Knopf an Mail-Anhängen */

/* ---------- Darstellung ---------- */
function setupHtml(){
  var err=ST&&ST.error?'<div class="notice" style="margin-bottom:14px">'+esc(ST.error)+'</div>':'';
  var v=function(k,t){ return '<code>'+k+'</code><span>'+t+'</span>'; };
  return '<div class="card vw-setup">'+err+'<h2>VIW Cloud verbinden</h2><p class="muted">Die Zugangsdaten trägst du einmal in Railway beim Dienst des Cockpits unter <b>Variables</b> ein – sie bleiben am Server, das Cockpit zeigt sie nie an.</p>'+
    '<h3>Du meldest dich bei VIW mit E-Mail und Passwort an (auch Gastzugang)</h3><div class="vw-vars">'+v("VIW_CLOUD_URL","Adresse der Nextcloud, z. B. https://cloud.viw.at (die Adresse aus dem Browser geht auch)")+v("VIW_CLOUD_USER","dein Login, meist die E-Mail-Adresse")+v("VIW_CLOUD_PASSWORD","dein Passwort – oder, falls möglich, ein App-Passwort (Einstellungen → Sicherheit)")+'</div>'+
    '<p class="muted small">Änderst du das Passwort bei VIW, hier in Railway mitändern. Mit Zwei-Faktor-Anmeldung geht es nur mit App-Passwort.</p>'+
    '<h3>Du hast nur einen Freigabe-Link (…/s/…)</h3><div class="vw-vars">'+v("VIW_CLOUD_URL","der ganze Link, z. B. https://cloud.viw.at/s/AbCdEf123")+v("VIW_CLOUD_PASSWORD","nur wenn der Link ein Passwort hat")+'</div>'+
    '<p class="muted small">Hochladen geht über den Link nur, wenn VIW ihn mit „Hochladen und Bearbeiten erlauben“ freigegeben hat.</p>'+
    '<p class="muted">Nach dem Speichern startet das Cockpit neu (ca. 1 Minute) – dann diese Seite neu laden.</p></div>';
}
function crumbs(path){
  var a=String(path||"/").split("/").filter(Boolean), out='<button type="button" class="vw-cr" data-act="viwgo:/" data-vdrop="/">'+F.svg("cloud")+'<span>VIW Cloud</span></button>', cur="";
  a.forEach(function(s,i){ cur+="/"+s; out+='<span class="vw-sep">/</span><button type="button" class="vw-cr'+(i===a.length-1?' on':'')+'" data-act="viwgo:'+esc(cur)+'" data-vdrop="'+esc(cur)+'">'+esc(s)+'</button>'; });
  return '<nav class="vw-crumbs" aria-label="Pfad">'+out+'</nav>';
}
function rowHtml(it){
  var k=kind(it), sel=!!SEL[it.path], thumb=it.dir?'<span class="vw-ic d">'+F.svg("vfolder")+'</span>':(it.preview&&it.fileid&&k==="img"?'<span class="vw-ic t"><img loading="lazy" alt="" src="/admin/api/viw/preview?fileid='+encodeURIComponent(it.fileid)+'" onerror="var p=this.parentNode;p.classList.remove(\'t\');p.innerHTML=\'<b>'+esc(extTag(it.name)||"BILD")+'</b>\'"></span>':'<span class="vw-ic">'+(extTag(it.name)?'<b>'+esc(extTag(it.name))+'</b>':F.svg("vfile"))+'</span>');
  var name=it.dir?'<button type="button" class="vw-n" data-act="viwgo:'+esc(it.path)+'">'+esc(it.name)+'</button>'
    :k?'<a class="vw-n" href="'+esc(fileUrl(it.path,true))+'" target="_blank" rel="noopener" data-docview="'+esc(fileUrl(it.path,true))+'" data-doctitle="'+esc(it.name)+'">'+esc(it.name)+'</a>'
    :'<a class="vw-n" href="'+esc(fileUrl(it.path))+'" download="'+esc(it.name)+'" title="Herunterladen">'+esc(it.name)+'</a>';
  return '<div class="vw-row'+(sel?' sel':'')+(it.dir?' dir':'')+'" draggable="true" data-vpath="'+esc(it.path)+'"'+(it.dir?' data-vdrop="'+esc(it.path)+'"':'')+'>'+
    '<label class="vw-ck" data-noact><input type="checkbox" data-vsel="'+esc(it.path)+'"'+(sel?' checked':'')+' aria-label="Auswählen"></label>'+thumb+
    '<span class="vw-nm">'+name+'<span class="vw-sub muted">'+(it.dir?"Ordner":bytes(it.size))+(it.modified?' · '+esc(when(it.modified)):'')+'</span></span>'+
    '<span class="vw-sz muted">'+(it.dir?(it.size?bytes(it.size):""):bytes(it.size))+'</span><span class="vw-dt muted">'+esc(when(it.modified))+'</span>'+
    (it.dir?'':'<a class="btn icon vw-dl" href="'+esc(fileUrl(it.path))+'" download="'+esc(it.name)+'" title="Herunterladen" aria-label="Herunterladen">'+F.svg("vdown")+'</a>')+
    '<button type="button" class="btn icon vw-more" data-act="viwmenu:'+esc(it.path)+'" title="Mehr" aria-label="Mehr">'+F.svg("vdots")+'</button></div>';
}
function listHtml(){
  if(!CUR||CUR.path!==UI.viwPath) return '<div class="vw-empty muted">Lade …</div>';
  if(CUR.error) return '<div class="vw-empty"><b>'+esc(CUR.error)+'</b><button type="button" class="btn" data-act="viwreload">Erneut versuchen</button></div>';
  var q=String(UI.viwQ||"").toLowerCase().trim(), its=CUR.items.filter(function(x){ return !q||x.name.toLowerCase().indexOf(q)>-1; });
  if(!CUR.items.length) return '<div class="vw-empty">'+F.svg("vup")+'<b>Dieser Ordner ist leer</b><span class="muted">Dateien oder Ordner hierher ziehen oder „Hochladen“ wählen.</span></div>';
  if(!its.length) return '<div class="vw-empty muted">Nichts gefunden für „'+esc(UI.viwQ)+'“.</div>';
  var all=its.length&&its.every(function(x){ return SEL[x.path]; });
  return '<div class="vw-head muted"><label class="vw-ck"><input type="checkbox" data-vselall'+(all?' checked':'')+' aria-label="Alle auswählen"></label><span></span><span>Name</span><span class="vw-sz">Größe</span><span class="vw-dt">Geändert</span><span></span><span></span></div>'+its.map(rowHtml).join("");
}
function selBar(){ var n=Object.keys(SEL).length; if(!n) return ""; return '<div class="vw-selbar"><b>'+n+' ausgewählt</b><button type="button" class="btn sm" data-act="viwmovesel">Verschieben…</button><button type="button" class="btn sm dg" data-act="viwdelsel">Löschen…</button><button type="button" class="btn sm" data-act="viwselnone">Auswahl aufheben</button></div>'; }
function queueHtml(){
  if(!Q.length) return "";
  var done=Q.filter(function(x){ return x.state==="done"||x.state==="skip"; }).length, errs=Q.filter(function(x){ return x.state==="err"; }).length, total=0, sent=0;
  Q.forEach(function(x){ total+=x.size; sent+=x.state==="done"||x.state==="skip"?x.size:(x.sent||0); });
  var busy=Q.some(function(x){ return x.state==="wait"||x.state==="up"; }), pct=total?Math.round(sent/total*100):100;
  var rows=Q.filter(function(x){ return x.state!=="done"&&x.state!=="skip"; }).slice(0,8).map(function(x){ var p=x.size?Math.round((x.sent||0)/x.size*100):0;
    return '<div class="vw-qr'+(x.state==="err"?' err':'')+'"><span class="vw-qn">'+esc(x.rel)+'</span><span class="muted">'+(x.state==="err"?esc(x.err||"Fehler"):x.state==="wait"?"wartet":p+" %")+'</span><span class="vw-bar"><i style="width:'+(x.state==="err"?100:p)+'%"></i></span></div>'; }).join("");
  return '<div class="vw-q" id="vwQ"><div class="vw-qh"><b>'+(busy?'Lade hoch … '+done+' von '+Q.length:errs?done+' hochgeladen, '+errs+' fehlgeschlagen':'Fertig – '+done+' hochgeladen')+'</b>'+
    (busy?'<span class="muted">'+bytes(sent)+' von '+bytes(total)+'</span><button type="button" class="btn sm" data-act="viwqstop">Abbrechen</button>':'<button type="button" class="btn sm" data-act="viwqclear">Schließen</button>')+'</div>'+
    '<span class="vw-bar big"><i style="width:'+pct+'%"></i></span>'+rows+'</div>';
}
function paintList(){ var l=document.getElementById("vwList"); if(l) l.innerHTML=listHtml(); var s=document.getElementById("vwSel"); if(s) s.innerHTML=selBar(); }
function paintQueue(){ var h=document.getElementById("vwQh"); if(h) h.innerHTML=queueHtml(); }
function quotaTxt(){ var qo=ST&&ST.quota; if(!qo||!(qo.used>=0)) return ""; return bytes(qo.used)+" belegt"+(qo.avail>0?" · "+bytes(qo.avail)+" frei":""); }
function render(){
  if(!ST){ loadStatus(true); return F.head("VIW Cloud","Nextcloud von VIW")+'<div class="vw-empty muted">Lade …</div>'; }
  if(!ST.configured) return F.head("VIW Cloud","Dateien in der Nextcloud von VIW – direkt aus dem Cockpit")+setupHtml();
  if(ST.reachable===undefined&&!STP) loadStatus(true);
  if(!CUR||CUR.path!==UI.viwPath){ if(!LOADING) load(UI.viwPath,true); }
  var web=webDir(UI.viwPath);
  var sub=(ST.mode==="share"?"Freigabe-Link":ST.user?"angemeldet als "+esc(ST.user):"")+(ST.host?" · "+esc(ST.host):"")+(quotaTxt()?" · "+esc(quotaTxt()):"")+(ST.reachable===false?' · <b class="bad-t">'+esc(ST.error||"nicht erreichbar")+'</b>':"");
  var right='<button type="button" class="btn icon" data-act="viwreload" title="Aktualisieren" aria-label="Aktualisieren">'+F.svg("vrefresh")+'</button>'+
    (web?'<a class="btn" href="'+esc(web)+'" target="_blank" rel="noopener">'+F.svg("vext")+' In Nextcloud öffnen</a>':'')+
    '<button type="button" class="btn" data-act="viwnewdir">'+F.svg("vnewdir")+' Neuer Ordner</button>'+
    '<button type="button" class="btn primary" data-act="viwup">'+F.svg("vup")+' Hochladen</button>';
  return F.head("VIW Cloud",sub,right)+
    '<div class="vw-wrap" id="vwWrap" data-vdropzone><div class="vw-top">'+crumbs(UI.viwPath)+'<input class="f vw-q-in" type="search" placeholder="In diesem Ordner suchen …" value="'+esc(UI.viwQ)+'" data-viwq aria-label="In diesem Ordner suchen"></div>'+
    '<div id="vwSel">'+selBar()+'</div><div class="vw-list" id="vwList">'+listHtml()+'</div>'+
    '<div class="vw-drop" aria-hidden="true"><div>'+F.svg("vup")+'<b>Loslassen zum Hochladen</b><span id="vwDropTo"></span></div></div>'+
    '<p class="muted small vw-foot">Ganze Ordner hochladen: Ordner hierher ziehen oder <button type="button" class="link" data-act="viwupdir">Ordner auswählen</button>. Gelöschtes landet im Papierkorb der Nextcloud.</p></div>'+
    '<div id="vwQh">'+queueHtml()+'</div>'+
    '<input type="file" id="vwFiles" multiple hidden><input type="file" id="vwDir" webkitdirectory multiple hidden>';
}
function webDir(dir){ if(!ST||!ST.web) return ""; return ST.mode==="share"?ST.web+"?path="+encodeURIComponent(dir||"/"):ST.web+"/index.php/apps/files/?dir="+encodeURIComponent(dir||"/"); }
function webItem(it){ if(!ST||!ST.web) return ""; return ST.mode!=="share"&&it.fileid?ST.web+"/index.php/f/"+it.fileid:webDir(it.dir?it.path:parentOf(it.path)); }
F.view({id:"viw",label:"VIW Cloud",short:"Cloud",icon:"cloud",order:17,render:render});

/* ---------- Navigation & Auswahl ---------- */
F.action("viwgo",function(p){ if(p===UI.viwPath&&CUR&&!CUR.error) return; setPath(p); CUR=null; if(F.current!=="viw") F.go("viw"); else { F.render(); load(p); } });
F.action("viwreload",function(){ ST=null; CUR=null; F.render(); load(UI.viwPath); });
F.listen("input","[data-viwq]",function(el){ UI.viwQ=el.value; paintList(); });
F.listen("change","[data-vsel]",function(el){ var p=el.getAttribute("data-vsel"); if(el.checked) SEL[p]=1; else delete SEL[p]; var r=el.closest(".vw-row"); if(r) r.classList.toggle("sel",el.checked); var s=document.getElementById("vwSel"); if(s) s.innerHTML=selBar(); });
F.listen("change","[data-vselall]",function(el){ var q=String(UI.viwQ||"").toLowerCase(); SEL={}; if(el.checked&&CUR) CUR.items.forEach(function(x){ if(!q||x.name.toLowerCase().indexOf(q)>-1) SEL[x.path]=1; }); paintList(); });
F.action("viwselnone",function(){ SEL={}; paintList(); });
function itemOf(p){ return CUR&&CUR.items.filter(function(x){ return x.path===p; })[0]; }

/* ---------- Ordner, Umbenennen, Verschieben, Löschen ---------- */
function nameDialog(title,ok,val,fn){
  F.modal('<form id="vwNameF" class="stackf" novalidate><div class="row-between"><h2 style="font-size:19px">'+esc(title)+'</h2>'+F.btnClose()+'</div><label class="fl">Name<input class="f" id="vwName" maxlength="200" autocomplete="off" autofocus value="'+esc(val||"")+'"></label><div id="vwNameErr" class="bad-t small" style="min-height:18px"></div><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="vwNameOk">'+esc(ok)+'</button></span></div></form>',"narrow");
  var f=document.getElementById("vwNameF"), inp=document.getElementById("vwName");
  if(inp&&val){ var dot=val.lastIndexOf("."); try{ inp.setSelectionRange(0,dot>0?dot:val.length); }catch(e){} }
  f.addEventListener("submit",function(e){ e.preventDefault(); var v=inp.value.trim(), er=document.getElementById("vwNameErr"), b=document.getElementById("vwNameOk");
    if(!v){ er.textContent="Bitte einen Namen eingeben."; return; } if(/[\/\\]/.test(v)){ er.textContent="Bitte ohne / und \\."; return; }
    b.disabled=true; fn(v,function(msg){ b.disabled=false; er.textContent=msg; }); });
}
F.action("viwnewdir",function(){ nameDialog("Neuer Ordner in „"+(baseOf(UI.viwPath)||"VIW Cloud")+"“","Anlegen","",function(name,fail){
  api("/admin/api/viw/op",{op:"mkdir",dir:UI.viwPath,name:name}).then(function(j){ if(!j||!j.ok) return fail(j&&j.error||"Fehler"); F.closeModal(); F.toast("Ordner „"+name+"“ angelegt"); load(UI.viwPath,true); }).catch(function(){ fail("Keine Verbindung"); }); }); });
function renameIt(p){ var old=baseOf(p); nameDialog("Umbenennen","Umbenennen",old,function(name,fail){ if(name===old){ F.closeModal(); return; }
  api("/admin/api/viw/op",{op:"rename",path:p,name:name}).then(function(j){ if(!j||!j.ok) return fail(j&&j.error==="exists"?"Diesen Namen gibt es hier schon.":(j&&j.error)||"Fehler"); F.closeModal(); delete SEL[p]; F.toast("Umbenannt in „"+name+"“"); load(UI.viwPath,true); }).catch(function(){ fail("Keine Verbindung"); }); }); }
function moveItems(paths,to){
  paths=paths.filter(function(p){ return parentOf(p)!==to&&(to+"/").indexOf(p+"/")!==0; }); if(!paths.length){ F.toast("Schon in diesem Ordner"); return; }
  var ok=0, errs=[];
  (function next(i){ if(i>=paths.length){ SEL={}; F.toast(errs.length?ok+" verschoben, "+errs.length+" nicht: "+errs[0]:(ok===1?"„"+baseOf(paths[0])+"“":ok+" Einträge")+" verschoben nach „"+(baseOf(to)||"VIW Cloud")+"“",!!errs.length); load(UI.viwPath,true); return; }
    api("/admin/api/viw/op",{op:"move",path:paths[i],to:to}).then(function(j){ if(j&&j.ok) ok++; else errs.push(baseOf(paths[i])+": "+(j&&j.error==="exists"?"Name gibt es dort schon":(j&&j.error)||"Fehler")); next(i+1); }).catch(function(){ errs.push("Keine Verbindung"); next(i+1); }); })(0);
}
function deleteItems(paths){
  var n=paths.length, one=n===1?itemOf(paths[0]):null;
  F.confirm((one?"„"+one.name+"“"+(one.dir?" (Ordner mit Inhalt)":""):n+" Einträge")+" löschen? Das landet im Papierkorb der VIW-Nextcloud und lässt sich dort wiederherstellen.","Löschen",function(){
    var ok=0, errs=[];
    (function next(i){ if(i>=n){ SEL={}; F.toast(errs.length?ok+" gelöscht, Fehler: "+errs[0]:(one?"„"+one.name+"“":ok+" Einträge")+" gelöscht",!!errs.length); load(UI.viwPath,true); return; }
      api("/admin/api/viw/op",{op:"delete",path:paths[i],confirm:true}).then(function(j){ if(j&&j.ok) ok++; else errs.push((j&&j.error)||"Fehler"); next(i+1); }).catch(function(){ errs.push("Keine Verbindung"); next(i+1); }); })(0);
  },true);
}
F.action("viwmovesel",function(){ var ps=Object.keys(SEL); if(!ps.length) return; F.viwPick({title:ps.length+" Einträge verschieben nach …",ok:"Hierher verschieben",start:UI.viwPath,exclude:ps},function(dir){ moveItems(ps,dir); }); });
F.action("viwdelsel",function(){ var ps=Object.keys(SEL); if(ps.length) deleteItems(ps); });
function copyLink(it){ var url=webItem(it); if(!url) return;
  (navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(function(){ F.toast("Link kopiert – öffnet sich nur für Personen mit Zugang zur VIW Cloud"); }).catch(function(){ F.toast(url); }); }
function menuFor(p,x,y){
  var it=itemOf(p); if(!it||!F.M||!F.M.ctx) return false; var k=kind(it), items=[];
  if(it.dir) items.push({label:"Öffnen",act:function(){ F.actions.viwgo(it.path); }});
  else { if(k) items.push({label:"Ansehen",act:function(){ F.viewDoc(fileUrl(it.path,true),it.name); }}); items.push({label:"Herunterladen",act:function(){ var a=document.createElement("a"); a.href=fileUrl(it.path); a.download=it.name; document.body.appendChild(a); a.click(); a.remove(); }}); }
  items.push({label:"Umbenennen…",act:function(){ renameIt(it.path); }},{label:"Verschieben nach…",act:function(){ F.viwPick({title:"„"+it.name+"“ verschieben nach …",ok:"Hierher verschieben",start:parentOf(it.path),exclude:[it.path]},function(dir){ moveItems([it.path],dir); }); }},
    {label:"Link kopieren (intern)",act:function(){ copyLink(it); }});
  if(ST&&ST.web) items.push({label:"In Nextcloud öffnen",act:function(){ window.open(webItem(it),"_blank","noopener"); }});
  items.push({sep:true},{label:"Löschen…",danger:true,act:function(){ deleteItems([it.path]); }});
  F.M.ctx(x,y,items,it.name); return true;
}
F.action("viwmenu",function(p,el){ var r=el?el.getBoundingClientRect():{left:200,bottom:200}; menuFor(p,r.left-150,r.bottom+4); });
F.listen("contextmenu",".vw-row",function(el,e){ if(menuFor(el.getAttribute("data-vpath"),e.clientX,e.clientY)) e.preventDefault(); });

/* ---------- Ordner wählen (Verschieben, Mail-Anhänge speichern) ---------- */
var PK=null;
F.viwPick=function(o,cb){ PK={o:o,cb:cb,path:o.start||"/",items:null,err:""}; pkLoad(); };
function pkLoad(){ PK.items=null; pkPaint(); var my=PK.path;
  api("/admin/api/viw/list?path="+encodeURIComponent(my)).then(function(j){ if(!PK||PK.path!==my) return; if(j&&j.ok){ PK.path=j.path; PK.items=(j.items||[]).filter(function(x){ return x.dir; }); PK.err=""; } else { PK.items=[]; PK.err=(j&&j.error)||"Fehler"; } pkPaint(); })
    .catch(function(){ if(PK){ PK.items=[]; PK.err="Keine Verbindung"; pkPaint(); } }); }
function pkPaint(){
  var o=PK.o, ex=o.exclude||[], a=PK.path.split("/").filter(Boolean), cr='<button type="button" class="vw-cr" data-act="viwpk:/">'+F.svg("cloud")+'<span>VIW Cloud</span></button>', cur="";
  a.forEach(function(s){ cur+="/"+s; cr+='<span class="vw-sep">/</span><button type="button" class="vw-cr" data-act="viwpk:'+esc(cur)+'">'+esc(s)+'</button>'; });
  var blocked=ex.some(function(p){ return (PK.path+"/").indexOf(p+"/")===0; });
  var list=PK.items===null?'<div class="muted small" style="padding:10px">Lade …</div>':PK.err?'<div class="bad-t small" style="padding:10px">'+esc(PK.err)+'</div>':
    PK.items.length?PK.items.map(function(x){ var no=ex.indexOf(x.path)>-1; return '<button type="button" class="vw-pki"'+(no?' disabled title="Kann nicht in sich selbst"':'')+' data-act="viwpk:'+esc(x.path)+'">'+F.svg("vfolder")+'<span>'+esc(x.name)+'</span></button>'; }).join(""):'<div class="muted small" style="padding:10px">Keine Unterordner</div>';
  var html='<div class="stackf"><div class="row-between"><h2 style="font-size:19px">'+esc(o.title||"Ordner wählen")+'</h2>'+F.btnClose()+'</div><nav class="vw-crumbs sm">'+cr+'</nav><div class="vw-pk">'+list+'</div>'+
    (PK.newOpen?'<div class="row" style="gap:8px"><input class="f" id="vwPkNew" maxlength="200" placeholder="Name des neuen Ordners" autocomplete="off" style="flex:1"><button type="button" class="btn" data-act="viwpkcreate">Anlegen</button></div>':'')+
    '<div class="foot"><button type="button" class="btn" data-act="viwpknew">'+F.svg("vnewdir")+' Neuer Ordner</button><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="button" class="btn primary" data-act="viwpkok"'+(blocked?' disabled':'')+'>'+esc(o.ok||"Hier speichern")+'</button></span></div><div id="vwPkErr" class="bad-t small"></div></div>';
  if(document.getElementById("vwPkWrap")) document.getElementById("vwPkWrap").innerHTML=html; else F.modal('<div id="vwPkWrap">'+html+'</div>',"narrow");
}
F.action("viwpk",function(p){ if(!PK) return; PK.path=p; PK.newOpen=false; pkLoad(); });
F.action("viwpkok",function(){ if(!PK) return; var p=PK.path, cb=PK.cb; PK=null; F.closeModal(); cb(p); });
F.action("viwpknew",function(){ if(!PK) return; PK.newOpen=true; pkPaint(); var i=document.getElementById("vwPkNew"); if(i) i.focus(); });
F.action("viwpkcreate",function(){ if(!PK) return; var i=document.getElementById("vwPkNew"), name=i?i.value.trim():"", e=document.getElementById("vwPkErr"); if(!name){ if(e) e.textContent="Bitte einen Namen eingeben."; return; }
  api("/admin/api/viw/op",{op:"mkdir",dir:PK.path,name:name}).then(function(j){ if(!PK) return; if(!j||!j.ok){ var e2=document.getElementById("vwPkErr"); if(e2) e2.textContent=(j&&j.error)||"Fehler"; return; } PK.newOpen=false; PK.path=j.path; pkLoad(); }); });
F.listen("keydown","#vwPkNew",function(el,e){ if(e.key==="Enter"){ e.preventDefault(); F.actions.viwpkcreate(); } });

/* ---------- Hochladen ---------- */
F.action("viwup",function(){ var i=document.getElementById("vwFiles"); if(i){ i.value=""; i.click(); } });
F.action("viwupdir",function(){ var i=document.getElementById("vwDir"); if(i){ i.value=""; i.click(); } });
F.listen("change","#vwFiles,#vwDir",function(el){ var fs=[].slice.call(el.files||[]); enqueue(fs.map(function(f){ return {file:f,rel:f.webkitRelativePath||f.name}; }),UI.viwPath); });
function enqueue(list,dir){
  if(!list.length) return; if(!Q.some(function(x){ return x.state==="wait"||x.state==="up"; })){ Q=[]; POLICY=null; MADE={}; }
  list.forEach(function(x){ if(x.dirOnly){ Q.push({id:Math.random().toString(36).slice(2),dirOnly:true,dir:dir,rel:x.rel,size:0,state:"wait"}); return; }
    Q.push({id:Math.random().toString(36).slice(2),file:x.file,dir:dir,rel:String(x.rel||x.file.name).replace(/^\/+/,""),size:x.file.size,sent:0,state:"wait"}); });
  paintQueue(); pump();
}
function pump(){ while(QRUN<2){ var it=Q.filter(function(x){ return x.state==="wait"; })[0]; if(!it) break; QRUN++; it.state="up"; run(it).then(fin(it),function(e){ it.state="err"; it.err=String(e&&e.message||e||"Fehler").slice(0,120); fin(it)(); }); } }
function fin(it){ return function(){ QRUN--; paintQueue(); if(!Q.some(function(x){ return x.state==="wait"||x.state==="up"; })){ var d=Q.filter(function(x){ return x.state==="done"; }).length, er=Q.filter(function(x){ return x.state==="err"; }).length;
  if(d||er) F.toast(er?d+" hochgeladen, "+er+" fehlgeschlagen":d+(d===1?" Datei":" Dateien")+" hochgeladen",!!er); if(CUR) load(UI.viwPath,true); } else pump(); }; }
function op(body){ return api("/admin/api/viw/op",body).then(function(j){ if(!j||!j.ok) throw new Error(j&&j.error==="exists"?"exists":(j&&j.error)||"Fehler"); return j; }); }
function ensureDir(d){ if(d==="/"||MADE[d]) return Promise.resolve(); if(MADE[d+"…"]) return MADE[d+"…"]; var p=op({op:"mkdirs",path:d}).then(function(){ MADE[d]=1; }); MADE[d+"…"]=p; return p; }
function xhrPut(url,blob,it,base){
  return new Promise(function(res,rej){ var x=new XMLHttpRequest(); it.xhr=x; x.open("PUT",url); x.setRequestHeader("Content-Type","application/octet-stream");
    x.upload.onprogress=function(e){ it.sent=base+(e.loaded||0); paintQueueSoon(); };
    x.onload=function(){ it.xhr=null; var j=null; try{ j=JSON.parse(x.responseText); }catch(e){} if(j&&j.ok) res(j); else rej(new Error(j&&j.error?j.error:"HTTP "+x.status)); };
    x.onerror=function(){ it.xhr=null; rej(new Error("Verbindung abgebrochen")); }; x.onabort=function(){ it.xhr=null; rej(new Error("abgebrochen")); };
    x.send(blob); }); }
var pqT=null; function paintQueueSoon(){ if(pqT) return; pqT=setTimeout(function(){ pqT=null; paintQueue(); },250); }
/* Name vorhanden: einmal fragen (Ersetzen / Beide behalten / Überspringen, auf Wunsch für alle) */
var ASK=null;
function decide(name){
  if(POLICY) return Promise.resolve(POLICY);
  if(ASK) return ASK.then(function(){ return POLICY||decide(name); });
  ASK=new Promise(function(res){
    F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:19px">„'+esc(name)+'“ gibt es schon</h2>'+F.btnClose()+'</div><p class="muted" style="margin:0">Was soll mit der Datei passieren?</p>'+
      '<label class="row small" style="gap:8px"><input type="checkbox" id="vwAll" checked style="width:18px;height:18px"> Für alle weiteren gleich entscheiden</label>'+
      '<div class="foot"><button type="button" class="btn" data-vdec="skip">Überspringen</button><span class="row"><button type="button" class="btn" data-vdec="keep">Beide behalten</button><button type="button" class="btn primary" data-vdec="replace">Ersetzen</button></span></div></div>',"narrow");
    var done=function(v){ var all=document.getElementById("vwAll"); if(all&&all.checked) POLICY=v; F.closeModal(); ASK=null; res(v); };
    var host=document.getElementById("modalHost"); var h=function(e){ var b=e.target.closest&&e.target.closest("[data-vdec]"); if(b){ host.removeEventListener("click",h,true); e.preventDefault(); e.stopPropagation(); done(b.getAttribute("data-vdec")); } else if(e.target.closest&&e.target.closest("[data-closemodal]")){ host.removeEventListener("click",h,true); setTimeout(function(){ ASK=null; res("skip"); },0); } };
    host.addEventListener("click",h,true);
    var k=function(e){ if(e.key==="Escape"&&ASK){ document.removeEventListener("keydown",k,true); host.removeEventListener("click",h,true); setTimeout(function(){ ASK=null; res("skip"); },0); } }; document.addEventListener("keydown",k,true); });
  return ASK;
}
function freeName(dir,name){ var dot=name.lastIndexOf("."), stem=dot>0?name.slice(0,dot):name, ext=dot>0?name.slice(dot):"";
  return (function next(i){ var n=i===1?name:stem+" ("+i+")"+ext; return op({op:"exists",path:join(dir,n)}).then(function(j){ return j.exists&&i<50?next(i+1):n; }); })(2); }
function run(it){
  var target=join(it.dir,it.rel), dir=parentOf(target), name=baseOf(target);
  if(it.dirOnly) return ensureDir(target).then(function(){ it.state="done"; });
  var mtime=it.file.lastModified?Math.floor(it.file.lastModified/1000):0;
  return ensureDir(dir).then(function(){
    var small=it.size<=SMALL||(ST&&ST.mode==="share");   /* Freigabe-Link: immer in einem Stück (Server reicht durch) */
    var attempt=function(overwrite,nm){ var path=join(dir,nm);
      if(small) return xhrPut("/admin/api/viw/upload?path="+encodeURIComponent(path)+"&overwrite="+(overwrite?1:0)+"&mtime="+mtime,it.file,it,0);
      return (overwrite?Promise.resolve({exists:false}):op({op:"exists",path:path})).then(function(j){ if(j.exists) throw new Error("exists");
        return op({op:"chunkstart",path:path}).then(function(s){ it.upId=s.id; var n=Math.ceil(it.size/CHUNK);
          return (function part(i){ if(i>n) return op({op:"chunkdone",id:s.id,path:path,total:it.size,mtime:mtime,overwrite:overwrite});
            var from=(i-1)*CHUNK, blob=it.file.slice(from,Math.min(it.size,from+CHUNK)), tries=0;
            var put=function(){ return xhrPut("/admin/api/viw/chunk?id="+encodeURIComponent(s.id)+"&n="+i+"&total="+it.size+"&path="+encodeURIComponent(path),blob,it,from).catch(function(e){ if(it.stop||++tries>=3) throw e; return new Promise(function(r){ setTimeout(r,1500*tries); }).then(put); }); };
            return put().then(function(){ return part(i+1); }); })(1).catch(function(e){ op({op:"chunkabort",id:s.id}).catch(function(){}); throw e; }); }); }); };
    return attempt(false,name).catch(function(e){ if(e.message!=="exists") throw e;
      return decide(name).then(function(v){ if(v==="skip"){ it.state="skip"; return; } if(v==="replace") return attempt(true,name); return freeName(dir,name).then(function(nm){ it.rel=it.rel.replace(/[^/]*$/,nm); return attempt(false,nm); }); }); });
  }).then(function(){ if(it.state!=="skip"){ it.state="done"; it.sent=it.size; } });
}
F.action("viwqstop",function(){ Q.forEach(function(x){ if(x.state==="wait"){ x.state="err"; x.err="abgebrochen"; } if(x.state==="up"){ x.stop=true; if(x.xhr) x.xhr.abort(); } }); paintQueue(); });
F.action("viwqclear",function(){ Q=[]; paintQueue(); });
window.addEventListener("beforeunload",function(e){ if(Q.some(function(x){ return x.state==="wait"||x.state==="up"; })){ e.preventDefault(); e.returnValue=""; } });

/* ---------- Ziehen: Dateien/Ordner vom Computer hochladen, Einträge auf Ordner verschieben ---------- */
var DRAG=null, dz=0;
function isFiles(e){ var t=e.dataTransfer&&e.dataTransfer.types; return !!t&&[].indexOf.call(t,"Files")>-1; }
function dropTarget(e){ var el=e.target&&e.target.closest&&e.target.closest("[data-vdrop]"); return el?el.getAttribute("data-vdrop"):UI.viwPath; }
F.listen("dragstart",".vw-row",function(el,e){ var p=el.getAttribute("data-vpath"); DRAG=SEL[p]?Object.keys(SEL):[p]; try{ e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain",DRAG.length+" Einträge"); }catch(x){} });
document.addEventListener("dragend",function(){ DRAG=null; clearHi(); });
function clearHi(){ document.querySelectorAll(".vw-row.dropok,.vw-cr.dropok").forEach(function(b){ b.classList.remove("dropok"); }); var w=document.getElementById("vwWrap"); if(w) w.classList.remove("dragon"); dz=0; }
document.addEventListener("dragover",function(e){ var w=document.getElementById("vwWrap"); if(!w||F.current!=="viw") return;
  var inside=w.contains(e.target)||(e.target.closest&&e.target.closest(".head"));
  if(isFiles(e)){ e.preventDefault(); if(!inside) return; w.classList.add("dragon"); var t=dropTarget(e), lbl=document.getElementById("vwDropTo"); if(lbl) lbl.textContent="nach „"+(baseOf(t)||"VIW Cloud")+"“";
    document.querySelectorAll(".vw-row.dropok,.vw-cr.dropok").forEach(function(b){ b.classList.remove("dropok"); }); var el=e.target.closest&&e.target.closest("[data-vdrop]"); if(el) el.classList.add("dropok"); return; }
  if(DRAG){ var el2=e.target.closest&&e.target.closest("[data-vdrop]"); document.querySelectorAll(".vw-row.dropok,.vw-cr.dropok").forEach(function(b){ if(b!==el2) b.classList.remove("dropok"); });
    if(el2&&DRAG.indexOf(el2.getAttribute("data-vdrop"))<0){ e.preventDefault(); el2.classList.add("dropok"); } }
});
document.addEventListener("dragleave",function(e){ if(!e.relatedTarget||!document.getElementById("vwWrap")||!document.getElementById("vwWrap").contains(e.relatedTarget)){ var w=document.getElementById("vwWrap"); if(w&&isFiles(e)) w.classList.remove("dragon"); } });
document.addEventListener("drop",function(e){ var w=document.getElementById("vwWrap"); if(!w||F.current!=="viw") return;
  if(isFiles(e)){ e.preventDefault(); var t=dropTarget(e); clearHi(); collect(e.dataTransfer).then(function(list){ if(list.length) enqueue(list,t); }); return; }
  if(DRAG){ var el=e.target.closest&&e.target.closest("[data-vdrop]"); if(!el) return; e.preventDefault(); var to=el.getAttribute("data-vdrop"), ps=DRAG; DRAG=null; clearHi(); moveItems(ps,to); } });
/* Ordner aus dem Finder/Explorer: Einträge rekursiv lesen (readEntries liefert in Portionen) */
function collect(dt){
  var items=[].slice.call(dt.items||[]), entries=items.map(function(i){ return i.webkitGetAsEntry?i.webkitGetAsEntry():null; }).filter(Boolean), out=[];
  if(!entries.length) return Promise.resolve([].slice.call(dt.files||[]).map(function(f){ return {file:f,rel:f.name}; }));
  function walk(en,pre){ if(en.isFile) return new Promise(function(r){ en.file(function(f){ out.push({file:f,rel:pre+f.name}); r(); },function(){ r(); }); });
    if(!en.isDirectory) return Promise.resolve(); var rd=en.createReader(), all=[];
    return new Promise(function(r){ (function more(){ rd.readEntries(function(b){ if(!b.length){ if(!all.length) out.push({dirOnly:true,rel:pre+en.name}); Promise.all(all.map(function(c){ return walk(c,pre+en.name+"/"); })).then(r); return; } all=all.concat([].slice.call(b)); more(); },function(){ r(); }); })(); }); }
  return Promise.all(entries.map(function(en){ return walk(en,""); })).then(function(){ return out; });
}

/* ---------- Mail-Anhänge in die VIW Cloud ---------- */
F.viwSaveMail=function(m,atts){
  var M=F.M||{}; if(!m||!atts||!atts.length) return;
  var mails=atts.map(function(a){ return {folder:m.folder||"INBOX",uid:m.uid,index:a.index||0,account:M.accOf?M.accOf(m):(m.account||""),filename:a.filename}; });
  F.viwPick({title:(atts.length===1?"„"+(atts[0].filename||"Anhang")+"“":atts.length+" Anhänge")+" in VIW Cloud speichern",ok:"Hier speichern",start:F.ls("fsc_viw_maildir")||UI.viwPath||"/"},function(dir){
    F.ls("fsc_viw_maildir",dir); F.toast("Speichere in VIW Cloud …");
    api("/admin/api/viw/op",{op:"frommail",dir:dir,mails:mails}).then(function(j){
      if(!j||!j.ok){ F.toast("Nicht gespeichert: "+((j&&j.error)||"Fehler"),true); return; }
      F.toast((j.saved.length===1?"„"+baseOf(j.saved[0])+"“":j.saved.length+" Anhänge")+" gespeichert in „"+(baseOf(dir)||"VIW Cloud")+"“",false,"Öffnen",function(){ setPath(dir); CUR=null; F.go("viw"); });
      if(CUR&&CUR.path===dir) CUR=null;
    }).catch(function(){ F.toast("Keine Verbindung zum Server",true); });
  });
};
F.action("mviw",function(v){ var M=F.M||{}, i=v.indexOf("|"), m=M.find?M.find(v.slice(0,i)):null, idx=v.slice(i+1); if(!m) return;
  var atts=(m.attachments||[]).filter(function(a){ return idx==="all"||String(a.index||0)===idx; }); if(atts.length) F.viwSaveMail(m,atts); });

/* ---------- Styles ---------- */
F.css([
".vw-setup{max-width:760px;padding:22px 24px}.vw-setup h2{font-size:19px;margin:0 0 6px}.vw-setup h3{font-size:15px;margin:18px 0 4px}.vw-setup ol{margin:14px 0;padding-left:20px;display:grid;gap:10px;line-height:1.5}",
".vw-vars{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin-top:8px;align-items:baseline}.vw-vars code{font-family:var(--f-mono);font-size:12.5px;background:var(--sunk);border:1px solid var(--line);border-radius:6px;padding:2px 7px}.vw-vars span{font-size:13px;color:var(--ink-2)}",
".vw-wrap{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 12px 6px;min-height:320px}",
".vw-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.vw-q-in{flex:0 1 260px;margin-left:auto}",
".vw-crumbs{display:flex;align-items:center;gap:2px;flex-wrap:wrap;min-width:0}.vw-cr{display:inline-flex;align-items:center;gap:6px;border:0;background:none;color:var(--ink-2);font:inherit;font-weight:600;padding:5px 8px;border-radius:8px;cursor:pointer;max-width:240px}.vw-cr span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
".vw-cr:hover{background:var(--sunk);color:var(--ink)}.vw-cr.on{color:var(--ink)}.vw-cr svg{width:17px;height:17px;color:var(--glow)}.vw-sep{color:var(--ink-3)}.vw-cr.dropok{background:var(--glow-soft);color:var(--glow)}",
".vw-head,.vw-row{display:grid;grid-template-columns:28px 38px minmax(0,1fr) 92px 120px 34px 34px;align-items:center;gap:8px;padding:5px 8px;border-radius:10px}",
".vw-head{font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding-top:2px;padding-bottom:6px;border-bottom:1px solid var(--line);border-radius:0;margin-bottom:4px}",
".vw-row{min-height:46px}.vw-row:hover{background:var(--sunk)}.vw-row.sel{background:var(--glow-soft)}.vw-row.dropok{outline:2px solid var(--glow);background:var(--glow-soft)}",
".vw-ck{display:flex;justify-content:center}.vw-ck input{width:17px;height:17px;accent-color:var(--glow)}",
".vw-ic{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:var(--sunk);color:var(--ink-3);overflow:hidden}.vw-ic svg{width:19px;height:19px}.vw-ic.d{background:var(--glow-soft);color:var(--glow)}.vw-ic b{font:600 9.5px var(--f-mono);letter-spacing:.02em}.vw-ic.t img{width:100%;height:100%;object-fit:cover}",
".vw-nm{min-width:0;display:flex;flex-direction:column}.vw-n{border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--ink);text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}.vw-n:hover{color:var(--glow)}",
".vw-sub{display:none;font-size:12px}.vw-sz,.vw-dt{font-size:13px;font-family:var(--f-mono);white-space:nowrap}.vw-sz{text-align:right}",
".vw-row .btn.icon{width:32px;height:32px;opacity:.55}.vw-row:hover .btn.icon{opacity:1}.vw-row .btn.icon svg{width:17px;height:17px}.vw-row.dir .vw-more{grid-column:7}",
".vw-empty{display:grid;justify-items:center;gap:8px;padding:56px 16px;text-align:center}.vw-empty svg{width:34px;height:34px;color:var(--ink-3)}",
".vw-selbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--glow-soft);border-radius:10px;padding:8px 12px;margin-bottom:6px}.vw-selbar b{margin-right:auto}",
".vw-drop{position:absolute;inset:0;border:2px dashed var(--glow);border-radius:14px;background:color-mix(in srgb,var(--panel) 82%,transparent);display:none;place-items:center;pointer-events:none;z-index:3}",
".vw-drop div{display:grid;justify-items:center;gap:6px;background:var(--panel);padding:18px 26px;border-radius:14px;box-shadow:var(--shadow-pop)}.vw-drop svg{width:30px;height:30px;color:var(--glow)}.vw-wrap.dragon .vw-drop{display:grid}",
".vw-foot{margin:10px 4px 6px}.vw-foot .link{border:0;background:none;color:var(--glow);font:inherit;padding:0;cursor:pointer;text-decoration:underline}",
".vw-q{position:fixed;right:22px;bottom:22px;width:min(380px,calc(100vw - 32px));background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-pop);padding:12px 14px;z-index:40;display:grid;gap:8px}",
".vw-qh{display:flex;gap:10px;align-items:center}.vw-qh b{margin-right:auto;font-size:14px}.vw-qh .muted{font-size:12px}",
".vw-bar{display:block;height:4px;background:var(--sunk);border-radius:99px;overflow:hidden}.vw-bar.big{height:6px}.vw-bar i{display:block;height:100%;background:var(--glow);transition:width .25s}",
".vw-qr{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;font-size:12.5px}.vw-qr .vw-bar{grid-column:1/-1}.vw-qn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.vw-qr.err .vw-bar i{background:var(--bad)}.vw-qr.err .muted{color:var(--bad)}",
".vw-crumbs.sm .vw-cr{padding:4px 6px;font-size:13.5px}.vw-pk{display:grid;gap:4px;max-height:46vh;min-height:120px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px}",
".vw-pki{display:flex;align-items:center;gap:10px;border:0;background:none;color:var(--ink);font:inherit;text-align:left;padding:8px 10px;border-radius:8px;cursor:pointer}.vw-pki:hover{background:var(--sunk)}.vw-pki svg{width:18px;height:18px;color:var(--glow)}.vw-pki:disabled{opacity:.4;cursor:not-allowed}",
"@media (max-width:760px){.vw-head{display:none}.vw-row{grid-template-columns:24px 36px minmax(0,1fr) 34px 34px}.vw-sz,.vw-dt{display:none}.vw-sub{display:block}.vw-q-in{flex:1 1 100%;margin-left:0}.vw-row .btn.icon{opacity:1}.vw-row.dir .vw-more{grid-column:5}}"
].join("\n"));
})();
