/* Postfach – Extras: Kontextmenü (Rechtsklick), Tastenkürzel + Hilfe, Wischen am Handy, Drucken,
   „Als To-Do“, „Als Termin“, Beleg an sevDesk aus einem Mail-Anhang (auch über „Beleg erfassen“ in Geld). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
var M=F.M=F.M||{};

/* ---------- Kontextmenü ---------- */
var ctxEl=null, ctxItems=[];
function ctxHost(){ if(!ctxEl){ ctxEl=document.createElement("div"); ctxEl.className="mctx"; ctxEl.setAttribute("role","menu"); ctxEl.hidden=true; document.body.appendChild(ctxEl);
  ctxEl.addEventListener("click",function(e){ var b=e.target.closest("[data-ci]"); if(!b) return; e.stopPropagation(); var it=ctxItems[+b.getAttribute("data-ci")]; hideCtx(); if(it&&it.act) it.act(); });
  ctxEl.addEventListener("keydown",function(e){ var bs=Array.prototype.slice.call(ctxEl.querySelectorAll("button")), i=bs.indexOf(document.activeElement);
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); var n=bs[(i+(e.key==="ArrowDown"?1:-1)+bs.length)%bs.length]; if(n) n.focus(); }
    else if(e.key==="Escape"||e.key==="Tab"){ e.preventDefault(); e.stopPropagation(); hideCtx(); } });
} return ctxEl; }
function hideCtx(){ if(ctxEl&&!ctxEl.hidden){ ctxEl.hidden=true; ctxEl.innerHTML=""; ctxItems=[]; if(ctxEl._ret&&ctxEl._ret.focus) try{ ctxEl._ret.focus(); }catch(e){} } }
M.ctx=function(x,y,items,title){
  var h=ctxHost(); ctxItems=items; h._ret=document.activeElement;
  h.innerHTML=(title?'<div class="mctx-t">'+esc(title)+'</div>':'')+items.map(function(it,i){ return it.sep?'<hr>':'<button type="button" role="menuitem" data-ci="'+i+'"'+(it.danger?' class="dg"':'')+'>'+esc(it.label)+'</button>'; }).join("");
  h.hidden=false;
  var w=h.offsetWidth||200, hh=h.offsetHeight||10;
  h.style.left=Math.max(6,Math.min(x,window.innerWidth-w-6))+"px";
  h.style.top=Math.max(6,Math.min(y,window.innerHeight-hh-6))+"px";
  var f=h.querySelector("button"); if(f) f.focus();
};
document.addEventListener("click",function(e){ if(ctxEl&&!ctxEl.hidden&&!ctxEl.contains(e.target)) hideCtx(); },true);
window.addEventListener("blur",hideCtx);
document.addEventListener("scroll",function(e){ if(ctxEl&&!ctxEl.contains(e.target)) hideCtx(); },true);
window.addEventListener("resize",hideCtx);
M.ctxOpen=function(){ return ctxEl&&!ctxEl.hidden; };

function rowMenu(m,x,y){
  var id=m.id, tr=M.isTrashed(m), sp=M.isSpam(m);
  var items=[
    {label:"Öffnen",act:function(){ M.open(id,{fromOutside:F.current!=="post"}); }},
    {label:m.read?"Als ungelesen markieren":"Als gelesen markieren",act:function(){ M.setRead([m],!m.read); }},
    {label:m.starred?"★ Markierung entfernen":"☆ Markieren",act:function(){ M.toggleStar(m); }},
    {sep:true},
    {label:"Antworten",act:function(){ M.reply(m,"reply"); }},
    {label:"Allen antworten",act:function(){ M.reply(m,"all"); }},
    {label:"Weiterleiten",act:function(){ M.reply(m,"fwd"); }},
    {label:"Als To-Do",act:function(){ M.todoFromMail(m); }},
    {label:"Als Termin",act:function(){ M.eventFromMail(m); }},
    {sep:true},
    {label:"Verschieben …",act:function(){ M.showMoveMenu(x,y,UI.mpick[id]?M.selectedIds():[id]); }},
    {label:sp?"Kein Spam":"Als Spam",act:function(){ if(sp) M.moveMessages([id],"INBOX","move"); else M.moveMessages([id],null,"spam"); }},
    {label:UI.mpick[id]?"Abwählen":"Auswählen",act:function(){ M.togglePick(id); }},
    {label:tr?"Wiederherstellen":"In den Papierkorb",danger:!tr,act:function(){ if(tr) M.restore([id]); else M.trash(UI.mpick[id]?M.selectedIds():[id]); }}
  ];
  if(m.local) items=items.filter(function(it){ return /Öffnen|Antworten|Weiterleiten|To-Do|Termin/.test(it.label||""); });
  M.ctx(x,y,items);
}
F.listen("contextmenu",".mrow2",function(el,e){ var id=el.getAttribute("data-mid"), m=M.find(id); if(!m) return; e.preventDefault(); rowMenu(m,e.clientX,e.clientY); });
/* Tastatur-Alternative zum Rechtsklick: Kontextmenü-Taste oder Umschalt+F10 auf einer Zeile */
F.listen("keydown",".mrow2",function(el,e){ if(e.target!==el) return; if(e.key==="ContextMenu"||(e.shiftKey&&e.key==="F10")){ var m=M.find(el.getAttribute("data-mid")); if(!m) return; e.preventDefault(); var r=el.getBoundingClientRect(); rowMenu(m,r.left+40,r.top+r.height/2); } });

/* ---------- Tastenkürzel ---------- */
var KEYS=[["Nächste / vorherige Mail",["J","K"],["↓","↑"]],["Neue Mail",["C"]],["Antworten",["R"]],["Allen antworten",["A"]],["Weiterleiten",["F"]],["Löschen",["#"],["Entf"]],["Markieren (Stern)",["S"]],["Gelesen / ungelesen",["U"]],["Auswählen",["X"]],["Verschieben",["V"]],["Als To-Do",["T"]],["Suchen",["/"]],["Diese Hilfe",["?"]],["Senden (im Editor)",["⌘","↵"]],["Entwurf speichern (im Editor)",["⌘","S"]],["Schließen / abwählen",["Esc"]],["Kontextmenü auf einer Zeile",["⇧","F10"]]];
M.showKeys=function(){
  F.modal('<div class="row-between"><h2 style="font-size:19px">Tastenkürzel im Postfach</h2>'+F.btnClose()+'</div><div class="mkeys">'+KEYS.map(function(k){ return '<div><span>'+esc(k[0])+'</span><span>'+k[1].map(function(x){ return '<span class="kbd">'+esc(x)+'</span>'; }).join(" ")+(k[2]?' <span class="muted">oder</span> '+k[2].map(function(x){ return '<span class="kbd">'+esc(x)+'</span>'; }).join(" "):'')+'</span></div>'; }).join("")+'</div><div class="foot"><span class="muted">Rechtsklick auf eine Mail öffnet weitere Aktionen. Am Handy: Zeile nach links wischen löscht, nach rechts ändert gelesen.</span><button type="button" class="btn primary" data-closemodal>Alles klar</button></div>',"narrow");
};
F.action("mkeys",M.showKeys);
document.addEventListener("keydown",function(e){
  if(F.current!=="post"||!F.D) return;
  if(M.composeOpen&&M.composeOpen()) return;
  if(M.ctxOpen()){ if(e.key==="Escape"){ e.preventDefault(); hideCtx(); } return; }
  if(F.modalOpen()) { if(e.key==="?"&&document.querySelector("#modalHost .mkeys")){ e.preventDefault(); F.closeModal(); } return; }
  if(document.getElementById("drawer").classList.contains("on")) return;
  var t=e.target;
  if(t&&t.id==="mqr"&&(e.metaKey||e.ctrlKey)&&e.key==="Enter"){ e.preventDefault(); M.quickReply(M.cur()); return; }
  if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))){ if(e.key==="Escape"&&t.id!=="msearch") t.blur(); return; }
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  var k=e.key, m=M.cur(), list=M.viewIds(), i=list.indexOf(UI.msel);
  function go(d){ if(!list.length) return; var n=i<0?0:Math.max(0,Math.min(list.length-1,i+d)), id=list[n]; if(id.indexOf("dr_")===0||id.indexOf("ob_")===0){ UI.msel=id; UI.mscrollTo=id; F.render(); return; } M.open(id); }
  if(k==="j"||k==="ArrowDown"){ e.preventDefault(); go(1); }
  else if(k==="k"||k==="ArrowUp"){ e.preventDefault(); go(-1); }
  else if(k==="c"){ e.preventDefault(); F.compose({}); }
  else if(k==="/"){ e.preventDefault(); var s=document.getElementById("msearch"); if(s){ s.focus(); s.select(); } }
  else if(k==="?"){ e.preventDefault(); M.showKeys(); }
  else if(k==="Escape"){ if(M.selectedIds().length){ UI.mpick={}; F.render(); } else if(UI.msel){ UI.msel=null; F.render(); } }
  else if(k==="Enter"&&UI.msel&&UI.msel.indexOf("dr_")===0){ e.preventDefault(); M.openDraft(UI.msel.slice(3)); }
  else if(!m) return;
  else if(k==="r"){ e.preventDefault(); M.reply(m,"reply"); }
  else if(k==="a"){ e.preventDefault(); M.reply(m,"all"); }
  else if(k==="f"){ e.preventDefault(); M.reply(m,"fwd"); }
  else if(k==="#"||k==="Delete"||k==="Backspace"){ e.preventDefault(); var sel=M.selectedIds(); if(M.isTrashed(m)&&!sel.length) M.purge([m.id]); else M.trash(sel.length?sel:[m.id]); }
  else if(k==="s"){ e.preventDefault(); M.toggleStar(m); }
  else if(k==="u"){ e.preventDefault(); M.setRead([m],!m.read); }
  else if(k==="x"){ e.preventDefault(); M.togglePick(m.id); }
  else if(k==="v"){ e.preventDefault(); var sel2=M.selectedIds(), p=M.menuPos(document.querySelector('.rb[data-act="mx:move"]')); M.showMoveMenu(p[0],p[1],sel2.length?sel2:[m.id]); }
  else if(k==="t"){ e.preventDefault(); M.todoFromMail(m); }
});

/* ---------- Wischen am Handy: links = löschen/wiederherstellen, rechts = gelesen umschalten ---------- */
var SW=null;
document.addEventListener("touchstart",function(e){ var row=e.target.closest&&e.target.closest(".mrow2"); if(!row||e.touches.length!==1||e.target.closest("[data-act]")) { SW=null; return; } SW={row:row,x:e.touches[0].clientX,y:e.touches[0].clientY,dx:0,lock:null}; },{passive:true});
document.addEventListener("touchmove",function(e){ if(!SW) return; var dx=e.touches[0].clientX-SW.x, dy=e.touches[0].clientY-SW.y;
  if(SW.lock===null&&(Math.abs(dx)>8||Math.abs(dy)>8)) SW.lock=Math.abs(dx)>Math.abs(dy)*1.3?"x":"y";
  if(SW.lock!=="x") return; SW.dx=dx; SW.row.style.transition="none"; SW.row.style.transform="translateX("+Math.max(-120,Math.min(120,dx))+"px)";
  SW.row.classList.toggle("sw-l",dx<-70); SW.row.classList.toggle("sw-r",dx>70); },{passive:true});
document.addEventListener("touchend",function(){ if(!SW) return; var s=SW; SW=null; s.row.style.transition=""; s.row.style.transform=""; s.row.classList.remove("sw-l","sw-r");
  if(s.lock!=="x") return; var m=M.find(s.row.getAttribute("data-mid")); if(!m||m.outbox||m.draftLocal) return;
  if(s.dx<-70){ if(M.isTrashed(m)) M.restore([m.id]); else M.trash([m.id]); }
  else if(s.dx>70){ M.setRead([m],!m.read); F.toast(m.read?"Als gelesen markiert":"Als ungelesen markiert"); } });
document.addEventListener("touchcancel",function(){ if(SW){ SW.row.style.transform=""; SW.row.classList.remove("sw-l","sw-r"); SW=null; } });

/* ---------- Drucken: druckbare Ansicht in neuem Tab (Mail-HTML gesäubert, Skripte per CSP gesperrt) ---------- */
M.print=function(m){
  var w=window.open("","_blank");
  if(!w){ F.toast("Pop-up blockiert – bitte Pop-ups für diese Seite erlauben",true); return; }
  var body=m.bodyHtml?M.sanitize(m.body||""):('<div style="white-space:pre-wrap">'+esc(m.body||m.preview||"")+'</div>');
  var tos=(m.toList&&m.toList.length?m.toList.map(function(x){ return (x.name?x.name+" ":"")+"<"+x.address+">"; }).join(", "):(m.to||""));
  var cc=(m.ccList||[]).map(function(x){ return (x.name?x.name+" ":"")+"<"+x.address+">"; }).join(", ");
  var atts=(m.attachments||[]).map(function(a){ return a.filename; }).join(", ");
  w.document.open();
  w.document.write('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'"><title>'+esc(m.subject||"Mail")+'</title><style>body{font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:760px;margin:30px auto;padding:0 20px}h1{font-size:20px;margin:0 0 8px}.meta{color:#555;font-size:12.5px;border-bottom:1px solid #ddd;padding-bottom:10px;margin-bottom:16px}.bar{margin:0 0 18px;font-size:13px;color:#555}img{max-width:100%;height:auto}blockquote{margin:6px 0 6px 4px;padding-left:10px;border-left:3px solid #ddd;color:#555}@media print{.bar{display:none}}</style></head><body>'+
    '<p class="bar">Druckansicht – mit ⌘P / Strg+P drucken oder als PDF sichern.</p><h1>'+esc(m.subject||"(kein Betreff)")+'</h1><div class="meta">Von: '+esc((m.fromName?m.fromName+" ":"")+"<"+(m.from||"")+">")+'<br>An: '+esc(tos)+(cc?'<br>Cc: '+esc(cc):'')+'<br>Datum: '+esc(m.date?new Date(m.date).toLocaleString("de-AT"):"")+(atts?'<br>Anhänge: '+esc(atts):'')+'</div>'+body+'</body></html>');
  w.document.close();
  setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} },400);
};

/* ---------- Notiz aus einer Mail ---------- */
function mailNotes(m){
  var who=m.fromName||m.from||"", when=m.date?new Date(m.date).toLocaleString("de-AT"):"";
  var txt=m.bodyHtml?M.htmlToText(m.body||""):String(m.body||m.preview||"").trim();
  if(txt.length>1500) txt=txt.slice(0,1500)+" …";
  return "Aus E-Mail\nVon: "+who+(m.from?" <"+m.from+">":"")+(when?"\nDatum: "+when:"")+"\nBetreff: "+(m.subject||"")+(txt?"\n\n"+txt:"");
}
M.mailNotes=mailNotes;

/* ---------- Als To-Do ---------- */
M.todoFromMail=function(m){
  if(!m) return;
  F.modal('<form data-form="mtodo" class="stackf"><div class="row-between"><h2 style="font-size:19px">Als To-Do anlegen</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Aufgabe<input class="f" name="text" required value="'+esc(m.subject||"(kein Betreff)")+'"></label>'+
    '<label class="fl">Fällig am (optional)<input class="f" name="due" type="date"></label>'+
    '<label class="fl">Notiz<textarea class="f" name="notes" rows="7">'+esc(mailNotes(m))+'</textarea></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">To-Do anlegen</button></span></div></form>',"narrow");
};
F.form("mtodo",function(f){ var txt=f.text.value.trim(); if(!txt) return; var btn=f.querySelector("[type=submit]"); btn.disabled=true;
  F.addTodo({text:txt,due:f.due.value||"",notes:f.notes.value.trim()}).then(function(j){ F.closeModal(); if(j&&Array.isArray(j.todos)) F.toast("To-Do angelegt",false,"Ansehen",function(){ F.go("kal"); }); }).catch(function(){ btn.disabled=false; F.toast("To-Do konnte nicht gespeichert werden",true); }); });

/* ---------- Als Termin ---------- */
var SPARTEN=[["fsc","FS Creative"],["kochdu","kochdu"],["kantineur","Kantineur"],["blitzdings","Blitzdings"],["valuero","VALUERO"],["privat","Privat (iCloud)"]];
M.eventFromMail=function(m){
  if(!m) return;
  var d=m.date?new Date(m.date):new Date(); if(isNaN(d)) d=new Date();
  F.modal('<form data-form="mevent" class="stackf"><div class="row-between"><h2 style="font-size:19px">Als Termin anlegen</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Titel<input class="f" name="title" required value="'+esc(m.subject||"(kein Betreff)")+'"></label>'+
    '<div class="grid2"><label class="fl">Datum<input class="f" name="date" type="date" required value="'+F.ymd(d)+'"></label><label class="fl">Bereich<select class="f" name="sparte">'+SPARTEN.map(function(s){ return '<option value="'+s[0]+'">'+esc(s[1])+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Von (optional)<input class="f" name="time" type="time"></label><label class="fl">Bis (optional)<input class="f" name="endTime" type="time"></label></div>'+
    '<label class="fl">Ort (optional)<input class="f" name="location"></label>'+
    '<label class="fl">Notiz<textarea class="f" name="notes" rows="6">'+esc(mailNotes(m))+'</textarea></label>'+
    '<div class="err" id="mevErr"></div><div class="foot"><span class="muted">„Privat“ landet im iCloud-Kalender, alles andere im Dashboard-Kalender.</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Termin anlegen</button></span></div></form>',"narrow");
};
function calErr(e){ e=String(e||""); return /not_configured/.test(e)?"Der private iCloud-Kalender ist nicht verbunden (Einstellungen).":(/403|forbidden/i.test(e)?"Keine Schreibrechte für diesen Kalender.":"Speichern im iCloud-Kalender fehlgeschlagen ("+e+")"); }
F.form("mevent",function(f){
  var err=document.getElementById("mevErr"), btn=f.querySelector("[type=submit]");
  var ev={title:f.title.value.trim(),date:f.date.value,time:f.time.value||"",endTime:f.endTime.value||"",location:f.location.value.trim(),notes:f.notes.value.trim(),sparte:f.sparte.value,source:"manual"};
  if(!ev.title){ err.textContent="Bitte einen Titel eingeben."; return; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)){ err.textContent="Bitte ein gültiges Datum wählen."; return; }
  btn.disabled=true; err.textContent="Speichere …";
  var done=function(msg){ F.closeModal(); F.toast(msg,false,"Kalender",function(){ F.go("kal"); }); F.load(true); };
  var fail=function(msg){ btn.disabled=false; err.textContent=msg; };
  if(ev.sparte==="privat"){
    F.api("/admin/api/private-cal",{body:{op:"create",event:ev}}).then(function(j){ if(j&&j.ok) done("Privater Termin angelegt – erscheint auch am iPhone"); else fail(calErr(j&&j.error)); }).catch(function(){ fail("Keine Verbindung zum Server."); });
    return;
  }
  ev.id="e"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  F.api("/admin/api/events").then(function(cur){
    var base=(cur&&Array.isArray(cur.events))?cur.events:null;
    if(!base) throw new Error("load");
    return F.api("/admin/api/events",{body:{events:base.concat([ev]),base:base}});
  }).then(function(j){ if(j&&j.ok!==false&&Array.isArray(j.events)) done("Termin angelegt"); else fail("Speichern fehlgeschlagen."); }).catch(function(){ fail("Termine konnten nicht geladen werden – bitte erneut versuchen."); });
});

/* ---------- Beleg an sevDesk ---------- */
function guessAmount(m){
  var txt=String((m&&(m.bodyHtml?String(m.body||"").replace(/<[^>]+>/g," "):m.body))||(m&&m.preview)||"").replace(/&nbsp;/g," ");
  var re=/(gesamt(?:betrag|summe)?|rechnungsbetrag|endbetrag|summe|total|zu zahlen|betrag|amount paid|amount due|paid)[^0-9€$]{0,40}(?:€|eur|\$|usd)?\s*([0-9]{1,3}(?:[.\s][0-9]{3})*,[0-9]{2}|[0-9]+[.,][0-9]{2})/gi, mm, best=null;
  while((mm=re.exec(txt))){ var v=parseFloat(mm[2].replace(/[.\s](?=[0-9]{3}(?:[,.]|$))/g,"").replace(",",".")); if(v>0) best=v; }
  return best;
}
M.guessAmount=guessAmount;
var VOU=null;
/* pre (optional, z. B. von der KI): supplier, date, gross, taxRate, desc, cat, title, html (Zusatzinfo), extra (weitere Felder an den Server), onDone(j) */
/* ---------- Vorschau des Belegs neben dem Formular (zoombar) ---------- */
var MVZ={z:1,kind:""};
function prevKind(a){ var ct=String(a.contentType||"").toLowerCase(), fn=String(a.filename||"").toLowerCase();
  if(/pdf/.test(ct)||/\.pdf$/.test(fn)) return "pdf";
  if((/^image\/(png|jpe?g|gif|webp|bmp)/.test(ct))||/\.(png|jpe?g|gif|webp|bmp)$/.test(fn)) return "img";
  return ""; }
function prevHtml(kind,href){
  var tb='<div class="mvtb"><button type="button" class="btn icon" data-act="mvz:out" title="Verkleinern" aria-label="Verkleinern">−</button><span class="num muted" id="mvZl">'+(kind==="img"?"Einpassen":"")+'</span><button type="button" class="btn icon" data-act="mvz:in" title="Vergrößern" aria-label="Vergrößern">+</button><button type="button" class="btn" data-act="mvz:fit">Einpassen</button><span style="flex:1"></span><a class="btn" href="'+esc(href)+'" target="_blank" rel="noopener">In neuem Tab ↗</a></div>';
  if(kind==="pdf") return '<div class="mvprev">'+tb+'<div class="mvscroll"><iframe id="mvPdf" title="Beleg-Vorschau" src="'+esc(href)+'#zoom=page-width&amp;toolbar=1"></iframe></div></div>';
  return '<div class="mvprev">'+tb+'<div class="mvscroll" id="mvScroll"><img id="mvImg" alt="Beleg-Vorschau" src="'+esc(href)+'" draggable="false"></div><div class="muted small">Strg/⌘ + Mausrad zum Zoomen, ziehen zum Verschieben, Doppelklick = 100 %.</div></div>';
}
function mvZoom(z){
  MVZ.z=Math.max(0.25,Math.min(6,z));
  var lbl=document.getElementById("mvZl");
  if(MVZ.kind==="img"){ var im=document.getElementById("mvImg"); if(!im) return; if(MVZ.z===1){ im.style.width="100%"; im.style.maxWidth="100%"; if(lbl) lbl.textContent="Einpassen"; } else { im.style.maxWidth="none"; im.style.width=Math.round(MVZ.z*100)+"%"; if(lbl) lbl.textContent=Math.round(MVZ.z*100)+" %"; } }
  else if(MVZ.kind==="pdf"){ var fr=document.getElementById("mvPdf"); if(!fr) return; var base=fr.getAttribute("src").split("#")[0].replace(/&pz=\d+$/,""); /* eigener Parameter erzwingt Neuladen – nur den #zoom zu ändern ignorieren manche PDF-Viewer */
    fr.setAttribute("src",base+"&pz="+Math.round(MVZ.z*100)+"#zoom="+(MVZ.z===1?"page-width":Math.round(MVZ.z*100))+"&toolbar=1"); if(lbl) lbl.textContent=MVZ.z===1?"":Math.round(MVZ.z*100)+" %"; }
}
F.action("mvz",function(v){ if(v==="in") mvZoom(MVZ.z*1.25); else if(v==="out") mvZoom(MVZ.z/1.25); else mvZoom(1); });
function wirePreview(){
  var sc=document.getElementById("mvScroll"), im=document.getElementById("mvImg"); if(!sc||!im) return;
  sc.addEventListener("wheel",function(e){ if(!(e.ctrlKey||e.metaKey)) return; e.preventDefault(); mvZoom(MVZ.z*(e.deltaY<0?1.12:1/1.12)); },{passive:false});
  im.addEventListener("dblclick",function(){ mvZoom(MVZ.z===1?2:1); });
  var drag=null;
  sc.addEventListener("pointerdown",function(e){ if(MVZ.z===1) return; drag={x:e.clientX,y:e.clientY,l:sc.scrollLeft,t:sc.scrollTop}; sc.setPointerCapture(e.pointerId); sc.classList.add("grab"); });
  sc.addEventListener("pointermove",function(e){ if(!drag) return; sc.scrollLeft=drag.l-(e.clientX-drag.x); sc.scrollTop=drag.t-(e.clientY-drag.y); });
  var up=function(){ drag=null; sc.classList.remove("grab"); }; sc.addEventListener("pointerup",up); sc.addEventListener("pointercancel",up);
}
M.openVoucher=function(m,a,pre){
  if(!m||!a) return; pre=pre||{}; VOU={m:m,a:a,pre:pre};
  var pvHref=pre.href||(M.attHref(m,a)+"&inline=1"), pvKind=prevKind(a); MVZ={z:1,kind:pvKind};
  var g=pre.gross!=null?pre.gross:guessAmount(m), day=pre.date||(m.date&&!isNaN(new Date(m.date))?F.ymd(new Date(m.date)):F.ymd()), vs=M.voucherSent(m,a), tr=pre.taxRate!=null?+pre.taxRate:20;
  F.modal((pvKind?'<div class="mvwrap">'+prevHtml(pvKind,pvHref):'')+'<form data-form="mvoucher" class="stackf"><div class="row-between"><h2 style="font-size:19px">'+esc(pre.title||"Beleg an sevDesk")+'</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Wird als <b>Beleg-Entwurf</b> in sevDesk angelegt – inkl. Datei. Prüfen und buchen machst du in sevDesk.</p>'+
    '<div class="att" style="justify-self:start"><a href="'+esc(pre.href||(M.attHref(m,a)+"&inline=1"))+'" target="_blank" rel="noopener" title="Anhang ansehen"><span class="ak">'+esc(M.attIconTxt(a))+'</span><span class="nm">'+esc(a.filename||"Anhang")+'</span><span class="sz">'+esc(M.fmtBytes(a.size))+'</span></a></div>'+
    (vs?'<div class="notice">Dieser Anhang wurde am '+esc(new Date(vs.at).toLocaleDateString("de-AT"))+' schon als Beleg gesendet. Nochmal senden legt einen zweiten Beleg an.</div>':'')+
    '<div class="grid2"><label class="fl">Lieferant<input class="f" name="supplier" list="mvContacts" value="'+esc(pre.supplier||m.fromName||m.from||"")+'"></label><label class="fl">Belegdatum<input class="f" name="date" type="date" required value="'+day+'"></label>'+
    '<label class="fl">Betrag brutto (€)<input class="f num" name="gross" type="number" step="0.01" min="0.01" inputmode="decimal" value="'+(g?g.toFixed(2):"")+'"'+(g?'':' autofocus')+'></label><label class="fl">USt-Satz<select class="f" name="tax">'+[20,13,10,0].map(function(r){ return '<option value="'+r+'"'+(r===tr?" selected":"")+'>'+r+' %</option>'; }).join("")+'</select></label></div>'+
    '<label class="fl">Kategorie<select class="f" name="cat" required><option value="">Kategorien werden geladen …</option></select></label>'+
    '<label class="fl">Beschreibung<input class="f" name="desc" maxlength="200" value="'+esc(String(pre.desc||m.subject||"").slice(0,200))+'"></label>'+(pre.html||"")+
    '<div class="err" id="mvMsg">'+(g&&!pre.html?'<span class="muted">Betrag aus der Mail übernommen – bitte kurz prüfen.</span>':'')+'</div>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="mvSave">An sevDesk senden</button></span></div><datalist id="mvContacts"></datalist></form>'+(pvKind?'</div>':''),pvKind?"xwide":"narrow");
  if(pvKind==="img") wirePreview();
  F.loadMeta(function(meta){
    var sel=document.querySelector('[data-form="mvoucher"] [name=cat]'); if(!sel) return;
    if(meta&&meta.error){ sel.innerHTML='<option value="">Kategorien nicht verfügbar</option>'; document.getElementById("mvMsg").textContent="sevDesk: "+meta.error; return; }
    var ts=(meta&&meta.accountingTypes)||[], last="";
    try{ last=String(localStorage.getItem("fsc_sev_cat")||"").replace(/^"|"$/g,""); }catch(e){} /* wie im klassischen Dashboard als Klartext */
    var used=ts.filter(function(t){ return t.used>0; }), rest=ts.filter(function(t){ return !(t.used>0); }), opt=function(t){ return '<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>'; };
    sel.innerHTML='<option value="">Kategorie wählen …</option>'+(used.length?'<optgroup label="Häufig verwendet">'+used.map(opt).join("")+'</optgroup>':'')+'<optgroup label="Alle Kategorien">'+rest.map(opt).join("")+'</optgroup>';
    if(pre.cat&&ts.some(function(t){ return t.id===pre.cat; })) sel.value=pre.cat; else if(last&&ts.some(function(t){ return t.id===last; })) sel.value=last;
    var dl=document.getElementById("mvContacts"); if(dl) dl.innerHTML=(meta.contacts||[]).map(function(c){ return '<option value="'+esc(c.name)+'"></option>'; }).join("");
  });
};
F.form("mvoucher",function(f){
  if(!VOU) return; var m=VOU.m, a=VOU.a, msg=document.getElementById("mvMsg"), btn=document.getElementById("mvSave");
  var body={mail:{folder:m.folder||"INBOX",uid:m.uid,index:a.index||0,account:M.accOf(m),filename:a.filename},supplierName:f.supplier.value.trim(),date:f.date.value,description:f.desc.value.trim(),gross:parseFloat(String(f.gross.value).replace(",",".")),taxRate:parseFloat(f.tax.value),accountingTypeId:f.cat.value};
  var pre=VOU.pre||{}; if(pre.extra) Object.keys(pre.extra).forEach(function(k){ if(!(k in body)) body[k]=pre.extra[k]; });
  if(body.positions){ var ps=0; body.positions.forEach(function(x){ ps+=+x.gross||0; }); if(Math.abs(ps-body.gross)>0.02) delete body.positions; }  /* Betrag geändert → eine Position mit dem gewählten Satz */
  if(!(body.gross>0)){ msg.textContent="Bitte den Rechnungsbetrag (brutto) eingeben."; f.gross.focus(); return; }
  if(!body.accountingTypeId){ msg.textContent="Bitte eine Kategorie wählen."; f.cat.focus(); return; }
  try{ localStorage.setItem("fsc_sev_cat",body.accountingTypeId); }catch(e){}
  btn.disabled=true; msg.textContent="Lade Beleg zu sevDesk hoch …";
  F.api("/admin/api/sevdesk/voucher",{body:body}).then(function(j){
    if(!j||!j.ok){ btn.disabled=false; msg.textContent="sevDesk hat abgelehnt: "+((j&&j.error)||"unbekannter Fehler"); return; }
    var sk=F.ls("fsc_sev_sent")||{}; sk[m.id+"#"+(a.index||0)]={id:j.id,at:Date.now()}; F.ls("fsc_sev_sent",sk);
    var done=VOU.pre&&VOU.pre.onDone; VOU=null; F.closeModal(); if(done) try{ done(j); }catch(e){}
    F.toast("Beleg als Entwurf in sevDesk angelegt",false,"sevDesk öffnen",function(){ window.open(F.SEVURL,"_blank","noopener"); });
    if(F.current==="post") F.render(); F.load(true);
  }).catch(function(){ btn.disabled=false; msg.textContent="Keine Verbindung zum Server."; });
});

/* „Beleg erfassen“ (Geld): Mails mit PDF/Bild-Anhängen zur Auswahl */
var PICK={q:""};
function pickList(){
  var q=PICK.q.toLowerCase();
  var rows=M.store.messages.filter(function(m){ return !m.deleted&&!m.local&&!M.isSent(m)&&!M.isSpam(m)&&m.uid!=null&&(m.attachments||[]).some(M.isVoucherAtt); })
    .filter(function(m){ return !q||((m.subject||"")+" "+(m.fromName||"")+" "+(m.from||"")+" "+(m.attachments||[]).map(function(a){return a.filename;}).join(" ")).toLowerCase().indexOf(q)>-1; })
    .sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,40);
  if(!rows.length) return '<div class="empty">'+(M.store.loading||!M.store.full?"Postfach wird geladen …":(q?"Keine passenden Mails.":"Keine Mails mit PDF- oder Bild-Anhängen."))+'</div>';
  return rows.map(function(m){ return '<div class="vpick"><div class="vm"><b>'+esc(m.fromName||m.from||"—")+'</b><span class="muted">'+esc(M.fmtMailDate(m.date))+'</span></div><div class="vs">'+esc(m.subject||"(kein Betreff)")+'</div><div class="attl">'+(m.attachments||[]).filter(M.isVoucherAtt).map(function(a){ var vs=M.voucherSent(m,a); return '<button type="button" class="btn'+(vs?"":" primary")+'" data-act="mvpick:'+esc(m.id)+'|'+esc(a.index||0)+'" title="'+(vs?"Schon an sevDesk gesendet":"Als Beleg erfassen")+'">'+(vs?M.ic("check")+" ":"")+esc(a.filename||"Anhang")+'</button>'; }).join("")+'</div></div>'; }).join("");
}
function renderPick(){ var l=document.getElementById("mvList"); if(l) l.innerHTML=pickList(); }
(M.refreshHooks=M.refreshHooks||[]).push(renderPick);
F.action("voucher",function(){
  PICK.q="";
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:19px">Beleg erfassen</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Wähle einen Anhang aus deinem Postfach. Er wird mit Betrag und Kategorie als Beleg-Entwurf an sevDesk gesendet.</p>'+
    '<input class="f" id="mvQ" type="search" placeholder="Absender, Betreff oder Dateiname …" aria-label="Mails durchsuchen" autocomplete="off">'+
    '<div id="mvList" class="vlist">'+pickList()+'</div>'+
    '<div class="foot"><span class="row wrap">'+(F.KI&&F.KI.openUpload?'<button type="button" class="btn primary" data-act="kiupload">Datei/Foto hochladen (KI)</button>':'')+'<a class="link" href="'+esc(F.SEVURL)+'" target="_blank" rel="noopener">Direkt in sevDesk hochladen ↗</a></span><button type="button" class="btn" data-closemodal>Schließen</button></div></div>',"wide");
  if(!M.store.full) M.loadFull();
});
F.listen("input","#mvQ",function(el){ PICK.q=el.value; renderPick(); });
F.action("mvpick",function(v){ var i=v.indexOf("|"), m=M.find(v.slice(0,i)), idx=String(v.slice(i+1)); if(!m) return; var a=(m.attachments||[]).filter(function(x){ return String(x.index||0)===idx; })[0]; if(a) M.openVoucher(m,a); });

F.css([
'.dialog.xwide{width:min(1240px,100%)}',
'.mvwrap{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(330px,1fr);gap:20px;align-items:start}',
'.mvprev{display:flex;flex-direction:column;gap:8px;min-width:0}',
'.mvtb{display:flex;align-items:center;gap:6px}',
'.mvtb .num{min-width:72px;text-align:center}',
'.mvscroll{height:min(74vh,880px);overflow:auto;border:1px solid var(--line);border-radius:12px;background:var(--bg-2,rgba(127,127,127,.08));touch-action:pan-x pan-y pinch-zoom}',
'.mvscroll.grab{cursor:grabbing}',
'.mvscroll img{display:block;width:100%;max-width:100%;height:auto;margin:0 auto;user-select:none;cursor:zoom-in}',
'.mvscroll iframe{width:100%;height:100%;border:0;display:block;background:#fff}',
'@media (max-width:860px){.mvwrap{grid-template-columns:1fr}.mvscroll{height:46vh}}',
".mctx{position:fixed;z-index:85;min-width:210px;max-width:calc(100vw - 12px);background:var(--panel);border:1px solid var(--line);border-radius:11px;box-shadow:0 12px 32px rgba(0,0,0,.2);padding:4px;display:grid}",
".mctx[hidden]{display:none}",
".mctx button{border:0;background:none;text-align:left;padding:8px 11px;border-radius:7px;font-size:13.5px;color:var(--ink)}",
".mctx button:hover,.mctx button:focus{background:var(--sunk);outline:none}",
".mctx .dg{color:var(--bad)}",
".mctx hr{border:0;border-top:1px solid var(--line);margin:4px 2px}",
".mctx-t{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;padding:6px 11px 4px}",
".mkeys{display:grid;gap:2px}",
".mkeys>div{display:flex;justify-content:space-between;gap:12px;padding:6px 2px;border-bottom:1px dashed var(--line);font-size:14px;align-items:center}",
".mkeys>div:last-child{border-bottom:0}",
".mrow2.sw-l{box-shadow:inset -6px 0 0 var(--bad)}",
".mrow2.sw-r{box-shadow:inset 6px 0 0 var(--info)}",
".vlist{display:grid;gap:8px;max-height:56vh;overflow-y:auto}",
".vpick{border:1px solid var(--line);border-radius:11px;padding:10px 12px;display:grid;gap:6px}",
".vpick .vm{display:flex;justify-content:space-between;gap:10px}",
".vpick .vs{font-size:13.5px;color:var(--ink-2);overflow-wrap:anywhere}",
".vpick .btn{white-space:normal;text-align:left;overflow-wrap:anywhere}",
".vpick .btn svg{width:14px;height:14px}"
].join("\n"));
})();
