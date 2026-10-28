/* Angebot → Kunde (Wunsch Simon 28.10.2026: „Ich möchte gefragt werden, ob eine Mail versendet wird – manche Angebote gebe ich gedruckt mit“).
   Nach dem Anlegen eines Angebots (shared.js saveOffer) und später aus der Angebotsliste (Entwürfe: „Per Mail senden“, „Drucken“):
   · Per Mail senden → Verfassen-Fenster des Postfachs mit dem PDF im Anhang, Empfänger/Betreff/Text vorbelegt. Gesendet wird erst mit „Senden“;
     erst wenn der Versand geklappt hat, wird das Angebot als versendet markiert (Versandart Mail) – F.mailAfter.offerSent über post-compose.js.
   · Drucken / persönlich übergeben → Druckdialog (Safari/Handy: PDF-Ansicht), danach nur auf Klick „Als übergeben markieren“ (Versandart Druck).
   · Später entscheiden, Esc oder ✕ → bleibt Entwurf.
   Nichts wird gemerkt oder vorausgewählt; ohne Klick auf „Senden“ geht keine Mail raus. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur;

F.css(
  '.od-dlg .od-sub{margin:0;overflow-wrap:anywhere}'+
  '.od-dlg .od-q{margin:2px 0 0;font-size:15px;font-weight:600}'+
  '.od-opts{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}'+
  '.od-c{display:flex;gap:12px;align-items:flex-start;width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--sunk);color:var(--ink);font:inherit;text-align:left;cursor:pointer;min-height:56px;transition:background .15s,border-color .15s}'+
  '.od-c:hover{background:var(--hover,var(--sunk));border-color:var(--ink-3)}'+
  '.od-c:focus-visible{outline:2px solid var(--glow);outline-offset:2px;border-color:var(--glow);background:var(--sel,var(--hover))}'+
  '.od-c[disabled]{cursor:default;opacity:.6}.od-c[aria-busy="true"]{opacity:1;border-color:var(--glow)}'+
  '.od-c .od-i{flex:none;width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--glow-soft);color:var(--glow-ink,var(--ink))}.od-c .od-i svg{width:19px;height:19px}'+
  '.od-c .od-t{min-width:0;flex:1}.od-c b{display:block;font-size:15px;font-weight:600;text-wrap:balance}.od-c small{display:block;color:var(--ink-2);font-size:13px;margin-top:2px;text-wrap:pretty}'+
  '.od-dlg .od-err{margin:0;min-height:0}.od-dlg .od-err:empty{display:none}'+
  '.od-dlg .od-msg{margin:0}.od-dlg .od-row .btn svg{width:16px;height:16px}'+
  '.od-pf{position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden}'+
  '@media (prefers-reduced-motion:reduce){.od-c{transition:none}}'
);

var OD={};   /* id → {id,nr,contact,contactId,email,gross,validUntil,draft,status} aus dem Anlegen; die Angebotsliste (F.OFF) gewinnt */
function pdfUrl(id){ return "/admin/api/sevdesk/offer-pdf?id="+encodeURIComponent(id); }
function listed(id){ return ((F.OFF&&F.OFF.list)||[]).filter(function(x){ return String(x.id)===String(id); })[0]||null; }
function offer(id){ id=String(id||""); var o=Object.assign({},OD[id]||{}), l=listed(id);
  if(l) ["nr","contact","contactId","gross","validUntil","status"].forEach(function(k){ if(l[k]!=null&&l[k]!=="") o[k]=l[k]; });
  o.id=id; if(!o.email) o.email=mailOf(o,l); return o; }
/* Empfänger: Mail des Buchhaltungs-Kontakts, sonst die des zugeordneten Leads */
function mailOf(o,l){ var m=F.metaCached&&F.metaCached(), cid=o.contactId!=null?String(o.contactId):"";
  var c=m&&cid?(m.contacts||[]).filter(function(x){ return String(x.id)===cid; })[0]:null; if(c&&c.email) return c.email;
  var ld=l&&F.offerLead?F.offerLead(l):null; return (ld&&ld.email)||""; }
function label(o){ return "Angebot"+(o.nr?" "+o.nr:""); }
function isDraft(o){ return o.status!=null?+o.status===100:!!o.draft; }
function sub(o){ return [o.contact,o.gross!=null&&o.gross!==""?eur(+o.gross):"",o.validUntil?"gültig bis "+F.de(o.validUntil):""].filter(Boolean).join(" · "); }
function setStatus(id,type){
  return F.api("/admin/api/sevdesk/offer-status",{body:{confirm:true,id:id,status:200,sendType:type}})
    .then(function(j){ if(j&&j.ok){ if(OD[id]) OD[id].status=200; if(F.offersLoad) F.offersLoad(true); } return j||{ok:false}; })
    .catch(function(){ return {ok:false,error:"Keine Verbindung zum Server."}; }); }
function err(t){ var e=document.getElementById("odErr"); if(e) e.textContent=t||""; }

/* ---------- Auswahl: Wie geht es zum Kunden? ---------- */
function card(act,icon,title,text){ return '<button type="button" class="od-c" data-act="'+act+'"><span class="od-i">'+F.svg(icon)+'</span><span class="od-t"><b>'+esc(title)+'</b><small>'+esc(text)+'</small></span></button>'; }
/* o: {id,nr,contact,contactId,email,gross,validUntil,draft}; opt: {created, note, warn} */
F.offerDeliver=function(o,opt){
  o=o||{}; opt=opt||{}; var id=String(o.id||""); if(!id) return;
  OD[id]=Object.assign(OD[id]||{},o,{id:id}); var x=offer(id), s=sub(x);
  F.modal('<div class="stackf od-dlg" data-od="'+esc(id)+'">'+
    '<div class="row-between"><h2 style="font-size:20px">'+esc(label(x)+(opt.created?" ist angelegt":" zum Kunden bringen"))+'</h2>'+F.btnClose()+'</div>'+
    '<p class="muted od-sub">'+esc(s+(s?" · ":"")+"noch Entwurf"+(opt.note?" · "+opt.note:""))+'</p>'+
    (opt.warn?'<div class="notice"><span>'+esc(opt.warn)+'</span></div>':'')+
    '<h3 class="od-q" id="odQ">Wie geht es zum Kunden?</h3>'+
    '<div class="od-opts" role="group" aria-labelledby="odQ">'+
      card("offmail:"+id,"send","Per Mail senden","Öffnet eine Mail mit dem PDF im Anhang"+(x.email?" an "+x.email:"")+" zum Prüfen. Gesendet wird erst, wenn du auf „Senden“ klickst.")+
      card("offprint:"+id,"printer","Drucken / persönlich übergeben","Druckt das PDF. Danach kannst du es als übergeben markieren – es geht keine Mail raus.")+
      card("offlater:"+id,"clock","Später entscheiden","Bleibt Entwurf. Senden oder drucken jederzeit unter Kunden & Leads → Angebote.")+
    '</div><p class="err od-err" id="odErr" role="alert"></p></div>',"narrow");
  focusIn('.od-c');
};
/* Tastatur: Fokus in den Dialog (wie F.modal: am Handy nicht – kein Fokusring, keine Tastatur) */
function focusIn(sel){ var touch=window.matchMedia&&matchMedia("(hover:none)").matches; if(touch) return; setTimeout(function(){ var b=document.querySelector("#modalHost "+sel); if(b) try{ b.focus(); }catch(e){} },30); }
/* Pfeiltasten zwischen den Karten (Tab/Enter/Leertaste gehen ohnehin) */
F.listen("keydown",".od-opts",function(el,e){
  if(e.key!=="ArrowDown"&&e.key!=="ArrowUp") return;
  var bs=[].slice.call(el.querySelectorAll(".od-c:not([disabled])")), n=bs.length, i=bs.indexOf(document.activeElement), dn=e.key==="ArrowDown"; if(!n) return;
  e.preventDefault(); bs[i<0?(dn?0:n-1):(i+(dn?1:n-1))%n].focus(); });

/* ---------- Per Mail senden: Verfassen-Fenster mit PDF, nichts geht ohne „Senden“ raus ---------- */
function fetchPdf(id){
  return fetch(pdfUrl(id),{credentials:"same-origin",cache:"no-store"}).then(function(r){
    if(r.redirected&&/\/admin\/login/.test(r.url)) throw new Error("Sitzung abgelaufen – bitte neu anmelden.");
    if(!r.ok) throw new Error("PDF konnte nicht geladen werden (HTTP "+r.status+")");
    return r.blob(); }).then(function(b){ if(!b||!b.size) throw new Error("Das PDF ist leer."); return b; }); }
function b64(blob){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ var s=String(r.result||""); res(s.slice(s.indexOf(",")+1)); }; r.onerror=function(){ rej(new Error("PDF konnte nicht gelesen werden.")); }; r.readAsDataURL(blob); }); }
function fileName(o){ return (label(o)+".pdf").replace(/[\\\/:*?"<>|]+/g,"_"); }
/* Anrede: Personennamen persönlich, Firmen/Vereine/Gemeinden mit „Sehr geehrte Damen und Herren“ (nicht „Guten Tag Bäckerei Lerch“) */
var ORG_RE=/\b(gmbh|e\.?\s?u\.?|ag|kg|og|gesbr|gbr|ug|ltd|inc|verein|verband|gemeinde|stadt|land|tourismus|hotel|gasthof|pension|restaurant|bäckerei|metzgerei|feuerwehr|schule|kirche|club|team|holding|genossenschaft|wirtschafts\w*|kammer|institut|stiftung|erholungswelt|alpinarium|dokumentation|zentrum|betrieb)\b/i;
function greeting(name){ name=String(name||"").trim(); return !name||ORG_RE.test(name)||name.split(/\s+/).length>3?"Sehr geehrte Damen und Herren":"Guten Tag "+name; }
function mailText(o,sigOn){ var sum=o.gross!=null&&o.gross!==""?eur(+o.gross):"";
  return greeting(o.contact)+",\n\nanbei erhalten Sie unser Angebot"+(o.nr?" "+o.nr:"")+(sum?" über "+sum:"")+"."+(o.validUntil?" Es ist gültig bis "+F.de(o.validUntil)+".":"")+
    "\n\nBei Fragen melden Sie sich gerne – ich freue mich auf Ihre Rückmeldung."+(sigOn?"":"\n\nFreundliche Grüße\nSimon Felder\nFS Creative"); }
/* Karte im Dialog: „lädt …“ anzeigen, alle Knöpfe sperren; zurück → wiederherstellen + Fehler */
function busy(el,text){ var d=el&&el.closest&&el.closest(".od-dlg"); if(!d) return null;
  var s=el.querySelector("small"), old=s?s.textContent:"", bs=[].slice.call(d.querySelectorAll("button"));
  bs.forEach(function(b){ b.disabled=true; }); el.setAttribute("aria-busy","true"); if(s) s.textContent=text;
  return {dlg:d,undo:function(msg){ bs.forEach(function(b){ b.disabled=false; }); el.removeAttribute("aria-busy"); if(s) s.textContent=old; err(msg); try{ el.focus(); }catch(e){} }}; }
F.offerMail=function(id,el){
  var o=offer(id); if(!o.id) return;
  var M=F.M||{}; if(!M.openCompose){ F.toast("Das Postfach ist nicht geladen – bitte die Seite neu laden.",true); return; }
  var b=busy(el,"PDF wird geladen …"); if(!b) F.toast("Lade PDF für "+label(o)+" …");
  fetchPdf(o.id).then(function(blob){ return b64(blob).then(function(c){ return {size:blob.size,content:c}; }); }).then(function(p){
    if(b&&!document.body.contains(b.dlg)) return;   /* Dialog inzwischen geschlossen (Esc) → nichts öffnen */
    if(b) F.closeModal();
    var acc=M.primaryAcct?M.primaryAcct():"", sg=M.getSig?M.getSig(acc):null;   /* Angebote gehen vom Hauptkonto (FS Creative) */
    F.compose({title:label(o)+" senden",account:acc||undefined,to:o.email||"",subject:label(o)+" · FS Creative",text:mailText(o,!!(sg&&sg.on)),
      atts:[{filename:fileName(o),contentType:"application/pdf",size:p.size,content:p.content}],
      after:{kind:"offerSent",id:o.id,nr:o.nr||"",draft:isDraft(o),file:fileName(o)}});
  }).catch(function(e){ var m=(e&&e.message)||"PDF konnte nicht geladen werden."; if(b&&document.body.contains(b.dlg)) b.undo(m); else F.toast(m,true); });
};
/* nach erfolgreichem Versand (post-compose.js runAfter): Entwurf → versendet (Versandart Mail). Schon versendete/angenommene Angebote bleiben, wie sie sind.
   Nur wenn das Angebots-PDF wirklich mitging – wurde es im Verfassen-Fenster entfernt, bleibt das Angebot Entwurf. */
F.mailAfter=F.mailAfter||{};
F.mailAfter.offerSent=function(a,info){
  var id=String((a&&a.id)||""); if(!id) return; var l=listed(id), lbl="Angebot"+(a.nr?" "+a.nr:"");
  if(l?+l.status!==100:!a.draft){ if(F.offersLoad) F.offersLoad(true); return; }
  if(a.file&&info&&info.files&&info.files.indexOf(a.file)<0){ F.toast("Mail ohne Angebots-PDF gesendet – "+lbl+" bleibt Entwurf",true); return; }
  setStatus(id,"VM").then(function(j){
    if(j.ok) F.toast("Gesendet an "+((info&&info.to)||"den Kunden")+" · "+lbl+" ist jetzt „versendet“");
    else F.toast("Mail gesendet, aber "+lbl+" ist noch Entwurf: "+(j.error||"Status nicht gespeichert"),true,F.actions.offstat?"Status ändern":null,F.actions.offstat?function(){ F.actions.offstat(id); }:null);
  });
};

/* ---------- Drucken / persönlich übergeben ---------- */
/* Chrome/Edge am Computer: PDF in einem unsichtbaren iframe → Druckdialog. Safari, Firefox, Handy: PDF-Ansicht (dort Teilen / Neuer Tab → Drucken). */
function canFramePrint(){ var ua=navigator.userAgent||""; if(/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return false; return /Chrome\/|Chromium\/|Edg\//.test(ua)&&!/Firefox\//.test(ua); }
var PF=null;
function printPdf(o){
  var url=pdfUrl(o.id), t=label(o), view=function(){ F.viewDoc(url,t); return "view"; };
  if(!canFramePrint()) return Promise.resolve(view());
  return fetchPdf(o.id).then(function(blob){
    if(PF){ try{ URL.revokeObjectURL(PF.getAttribute("data-u")); PF.remove(); }catch(e){} PF=null; }
    var u=URL.createObjectURL(blob.type==="application/pdf"?blob:new Blob([blob],{type:"application/pdf"})), fr=document.createElement("iframe");
    fr.className="od-pf"; fr.title="Druckansicht"; fr.setAttribute("aria-hidden","true"); fr.setAttribute("tabindex","-1"); fr.setAttribute("data-u",u);
    return new Promise(function(res){
      var done=false, fin=function(v){ if(!done){ done=true; res(v); } };
      fr.onload=function(){ setTimeout(function(){ try{ fr.contentWindow.focus(); fr.contentWindow.print(); fin("print"); }catch(e){ fin(view()); } },150); };
      setTimeout(function(){ fin("print"); },8000);   /* lädt der Druck-iframe nicht: Knöpfe „Nochmal drucken“ / „PDF ansehen“ bleiben */
      fr.src=u; document.body.appendChild(fr); PF=fr;
    });
  }).catch(function(){ return view(); });
}
function doPrint(o){ var m=document.getElementById("odPm"); if(m) m.textContent="Druck wird vorbereitet …";
  printPdf(o).then(function(how){ var m=document.getElementById("odPm"); if(m) m.textContent=how==="print"?"Der Druckdialog öffnet sich (falls nicht: „PDF ansehen“). Es wird keine Mail verschickt.":"Das PDF ist geöffnet – drucken über „Teilen“ bzw. „Neuer Tab“ und ⌘P. Es wird keine Mail verschickt."; }); }
F.offerPrint=function(id){
  var o=offer(id); if(!o.id) return; var dr=isDraft(o);
  F.modal('<div class="stackf od-dlg" data-od="'+esc(o.id)+'"><div class="row-between"><h2 style="font-size:20px">'+esc(label(o))+' drucken</h2>'+F.btnClose()+'</div>'+
    (sub(o)?'<p class="muted od-sub">'+esc(sub(o))+'</p>':'')+
    '<p class="od-msg" id="odPm" role="status" aria-live="polite"></p>'+
    '<div class="row wrap od-row"><button type="button" class="btn" data-act="offprintgo:'+esc(o.id)+'">'+F.svg("printer")+'Nochmal drucken</button><button type="button" class="btn" data-act="offview:'+esc(o.id)+'">'+F.svg("eye")+'PDF ansehen</button></div>'+
    (dr?'<p class="muted" style="margin:0;font-size:13.5px">Ausgedruckt mitgegeben? Dann als übergeben markieren – es zählt wie versendet (Versandart Druck), eine Mail geht nicht raus.</p>':'')+
    '<div class="foot"><span class="err" id="odErr" role="alert"></span><span class="row wrap"><button type="button" class="btn" data-act="offlater:'+esc(o.id)+'">'+(dr?"Später – bleibt Entwurf":"Schließen")+'</button>'+
      (dr?'<button type="button" class="btn primary" data-act="offhanded:'+esc(o.id)+'">'+F.svg("check")+'Als übergeben markieren</button>':'')+'</span></div></div>',"narrow");
  focusIn('[data-act^="offlater:"]');   /* sichere Vorgabe: Enter ändert nichts */
  doPrint(o);
};

F.action("offmail",function(id,el){ F.offerMail(id,el); });
F.action("offprint",function(id){ F.offerPrint(id); });
F.action("offprintgo",function(id){ doPrint(offer(id)); });
F.action("offview",function(id){ F.viewDoc(pdfUrl(id),label(offer(id))); });
F.action("offlater",function(id){ var o=offer(id); F.closeModal(); if(isDraft(o)) F.toast(label(o)+" bleibt Entwurf – senden oder drucken jederzeit unter Angebote"); });
F.action("offhanded",function(id,el){
  var o=offer(id); if(!isDraft(o)){ F.closeModal(); F.toast(label(o)+" ist schon versendet"); return; }
  if(el) el.disabled=true; err("");
  setStatus(o.id,"VPR").then(function(j){
    if(j.ok){ F.closeModal(); F.toast(label(o)+" als übergeben markiert – keine Mail versendet"); }
    else { if(el) el.disabled=false; err("Nicht gespeichert: "+(j.error||"unbekannter Fehler")); }
  });
});
})();
