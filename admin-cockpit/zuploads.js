/* Uploads: Links anlegen, über die Kunden ohne Anmeldung beliebig viele/große Dateien hochladen (www.fs-creative.at/upload/<token>), hier herunterladen.
   Daten: GET /admin/api/uploads (Links + Dateien + freier Speicher), POST {op:create|update|seen|deleteFile|deleteLink}, …/file (Download), …/zip (alle als ZIP) – Logik in uploads.js. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, de=F.de;
var ST=null, busy=false, OPEN={};
function hb(n){ n=+n||0; return n>=1073741824?(n/1073741824).toFixed(1).replace(".",",")+" GB":n>=1048576?(n/1048576).toFixed(1).replace(".",",")+" MB":Math.max(1,Math.round(n/1024))+" KB"; }
function dt(iso){ return iso?de(String(iso).slice(0,10))+" "+String(iso).slice(11,16):""; }
function load(){ if(busy) return; busy=true; F.api("/admin/api/uploads").then(function(j){ busy=false; ST=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler",links:[]}; F.render(); }).catch(function(){ busy=false; ST={ok:false,error:"Nicht erreichbar",links:[]}; F.render(); }); }
function isNew(l){ return l.lastAt&&(!l.seenAt||l.lastAt>l.seenAt); }
F.css('.up-l{display:grid}.up-r{border-top:1px solid var(--line);padding:14px 18px;display:grid;gap:10px}.up-r:first-child{border-top:0}.up-h{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}.up-h>div{flex:1 1 260px;min-width:0}.up-h b{font-size:15px}'+
  '.up-url{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.up-url code{font-size:12.5px;background:var(--sunk);padding:4px 8px;border-radius:6px;overflow-wrap:anywhere}.up-f{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:10px;align-items:center;font-size:13.5px;padding:6px 0;border-top:1px dashed var(--line)}'+
  '.up-f span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.up-msg{font-size:13px;background:var(--sunk);border-radius:8px;padding:8px 10px;white-space:pre-line}.up-new{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--warn);margin-right:6px}'+
  '@media(max-width:700px){.up-f{grid-template-columns:minmax(0,1fr) auto}.up-f .muted{display:none}}');
function linkRow(l){
  var o=OPEN[l.id], files=l.files||[], part=files.filter(function(f){ return !f.done; });
  return '<div class="up-r"><div class="up-h"><div><b>'+(isNew(l)?'<span class="up-new" title="Neue Dateien"></span>':'')+esc(l.title)+'</b>'+(l.open?'':' <span class="tag grey">geschlossen</span>')+
    '<div class="muted" style="font-size:13px">'+l.count+' Datei'+(l.count===1?'':'en')+(l.count?' · '+hb(l.bytes):'')+(part.length?' · '+part.length+' unvollständig':'')+(l.lastAt?' · zuletzt '+dt(l.lastAt):'')+' · angelegt '+de(String(l.createdAt).slice(0,10))+(l.expires?' · offen bis '+de(String(l.expires).slice(0,10)):'')+'</div>'+
    (l.note?'<div class="muted" style="font-size:13px">Hinweis für den Kunden: '+esc(l.note)+'</div>':'')+'</div>'+
    '<div class="row wrap" style="gap:6px"><button type="button" class="btn sm" data-act="upcopy:'+esc(l.id)+'">'+F.svg("link")+' Link kopieren</button><button type="button" class="btn sm" data-act="upmail:'+esc(l.id)+'">'+F.svg("mail")+' Per Mail</button>'+
    (l.count?'<a class="btn sm" href="/admin/api/uploads/zip?link='+encodeURIComponent(l.id)+'" download>'+F.svg("download")+' Alle (ZIP)</a>':'')+
    '<button type="button" class="btn sm" data-act="uptoggle:'+esc(l.id)+'">'+(l.active?"Schließen":"Wieder öffnen")+'</button><button type="button" class="btn sm" data-act="upopen:'+esc(l.id)+'" aria-expanded="'+!!o+'">'+(o?"Dateien zu":"Dateien")+'</button></div></div>'+
    '<div class="up-url"><code>'+esc(l.url)+'</code></div>'+
    (o?((l.msgs||[]).map(function(m){ return '<div class="up-msg"><b>Nachricht '+dt(m.at)+':</b> '+esc(m.text)+'</div>'; }).join("")+
      (files.length?files.map(function(f){ return '<div class="up-f"><span title="'+esc(f.name)+'">'+esc(f.name)+'</span><span class="muted">'+(f.done?hb(f.size):Math.floor(100*f.got/f.size)+" % von "+hb(f.size))+'</span><span class="muted">'+dt(f.doneAt||f.at)+'</span><span class="row" style="gap:4px">'+
        (f.done?'<a class="btn sm" href="/admin/api/uploads/file?link='+encodeURIComponent(l.id)+'&f='+encodeURIComponent(f.id)+'" download>'+F.svg("download")+'</a>':'')+'<button type="button" class="btn sm" data-act="updelf:'+esc(l.id)+'|'+esc(f.id)+'" title="Datei löschen" aria-label="Datei löschen">✕</button></span></div>'; }).join(""):'<div class="muted" style="font-size:13px">Noch keine Dateien.</div>')+
      '<div><button type="button" class="link" data-act="updell:'+esc(l.id)+'" style="color:var(--bad)">Link samt Dateien löschen</button></div>'):'')+'</div>';
}
function render(){
  if(!ST){ load(); return F.head("Uploads","Links für Kunden-Dateien")+'<div class="muted" style="padding:20px">Lade …</div>'; }
  if(!ST.ok) return F.head("Uploads","")+'<div class="notice"><span>'+esc(ST.error)+'</span><button type="button" class="btn sm" data-act="upreload">Erneut</button></div>';
  var L=ST.links||[], tot=L.reduce(function(a,l){ return a+l.bytes; },0);
  return F.head("Uploads",'Kunden laden über einen Link Dateien hoch – ohne Anmeldung, beliebig viele und groß'+(ST.free!=null?' · Speicher frei: '+hb(ST.free):'')+(tot?' · belegt: '+hb(tot):''),'<button type="button" class="btn primary" data-act="upnew">'+F.svg("plus")+' Neuer Upload-Link</button>')+
    '<div class="panel"><div class="up-l">'+(L.length?L.map(linkRow).join(""):'<div class="muted" style="padding:20px">Noch keine Upload-Links. Lege einen an und schick ihn dem Kunden.</div>')+'</div></div>';
}
function link(id){ return ((ST&&ST.links)||[]).find(function(l){ return l.id===id; })||null; }
function post(body,msg){ return F.api("/admin/api/uploads",{body:body}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; } if(msg) F.toast(msg); load(); return j; }); }
function copy(t){ try{ navigator.clipboard.writeText(t).then(function(){ F.toast("Link kopiert"); },function(){ F.toast("Kopieren nicht möglich – bitte markieren",true); }); }catch(e){ F.toast("Kopieren nicht möglich – bitte markieren",true); } }
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
  post(b).then(function(j){ if(!j) return; F.closeModal(); OPEN[j.link.id]=true; copy(j.link.url); F.toast("Upload-Link angelegt und kopiert",false,j.link.email?"Per Mail senden":null,j.link.email?function(){ mail(j.link); }:null); });
};
function mail(l){
  if(!F.compose){ copy(l.url); return; }
  F.compose({title:"Upload-Link senden",to:l.email||"",subject:"Dateien hochladen · "+l.title+" · FS Creative",
    text:"Hallo,\n\nüber diesen Link kannst du mir die Dateien ganz einfach hochladen – ohne Anmeldung, beliebig viele und auch große Dateien (einfach hineinziehen oder auswählen):\n\n"+l.url+"\n\n"+(l.note?l.note+"\n\n":"")+"Danke und liebe Grüße\nSimon Felder\nFS Creative"});
}
F.action("upcopy",function(id){ var l=link(id); if(l) copy(l.url); });
F.action("upmail",function(id){ var l=link(id); if(l) mail(l); });
F.action("upopen",function(id){ OPEN[id]=!OPEN[id]; var l=link(id); if(OPEN[id]&&l&&isNew(l)){ l.seenAt=new Date().toISOString(); F.api("/admin/api/uploads",{body:{op:"seen",id:id}}); } F.render(); });
F.action("uptoggle",function(id){ var l=link(id); if(l) post({op:"update",id:id,active:!l.active},l.active?"Link geschlossen – keine Uploads mehr möglich":"Link wieder offen"); });
function ask(title,text,yes,fn){ F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:20px">'+esc(title)+'</h2>'+F.btnClose()+'</div><p>'+esc(text)+'</p><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="button" class="btn danger" id="upYes">'+esc(yes)+'</button></span></div></div>',"narrow");
  setTimeout(function(){ var b=document.getElementById("upYes"); if(b) b.onclick=function(){ F.closeModal(); fn(); }; },0); }
F.action("updelf",function(v){ var p=String(v).split("|"), l=link(p[0]), f=l&&(l.files||[]).find(function(x){ return x.id===p[1]; }); if(!f) return;
  ask("Datei löschen?","„"+f.name+"“ wird endgültig vom Server gelöscht.","Endgültig löschen",function(){ post({op:"deleteFile",id:p[0],file:p[1],confirm:true},"Datei gelöscht"); }); });
F.action("updell",function(id){ var l=link(id); if(!l) return;
  ask("Upload-Link löschen?","Der Link „"+l.title+"“ funktioniert danach nicht mehr und alle "+l.count+" Datei(en) werden endgültig vom Server gelöscht.","Link und Dateien löschen",function(){ post({op:"deleteLink",id:id,confirm:true},"Link gelöscht"); }); });
F.view({id:"uploads",label:"Uploads",short:"Uploads",icon:"upload",order:37,count:function(){ return ST&&ST.ok?(ST.links||[]).filter(isNew).length:0; },render:render,after:function(){ if(!ST) load(); }});
setTimeout(load,4000); setInterval(function(){ if(document.visibilityState==="visible") load(); },120000);
})();
