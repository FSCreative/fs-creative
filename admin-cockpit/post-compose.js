/* Postfach – Verfassen: Von-Konto, An/Cc/Bcc mit Kontaktvorschlägen, Formatierung, Signatur je Konto, Anhänge, Entwürfe (lokal),
   Antworten/Allen antworten/Weiterleiten (inkl. Original-Anhänge), Schnellantwort, Postausgang mit Wiederholen.
   Der Postausgang wird im Browser gespeichert, damit fehlgeschlagene Mails nach einem Neuladen nicht verloren gehen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
var M=F.M=F.M||{};

/* ---------- HTML säubern (für alles, was in den Editor kommt) ---------- */
var DROP_TAGS=/^(script|style|iframe|frame|frameset|object|embed|applet|link|meta|base|form|input|button|textarea|select|option|svg|math|template|noscript|audio|video|source|track|portal|title|head)$/i;
function sanitize(html){
  var doc;
  try{ doc=new DOMParser().parseFromString('<!doctype html><body>'+String(html||"")+'</body>',"text/html"); }catch(e){ return esc(String(html||"")); }
  (function walk(node){
    Array.prototype.slice.call(node.childNodes).forEach(function(n){
      if(n.nodeType===8){ n.remove(); return; }
      if(n.nodeType!==1) return;
      if(DROP_TAGS.test(n.tagName)){ n.remove(); return; }
      Array.prototype.slice.call(n.attributes).forEach(function(a){
        var k=a.name.toLowerCase(), v=String(a.value||"");
        if(/^on/.test(k)||k==="srcdoc"||k==="formaction"||k==="srcset"||/^xmlns|^xlink/.test(k)) n.removeAttribute(a.name);
        else if((k==="href"||k==="src"||k==="action"||k==="background"||k==="poster")&&/^\s*(javascript|vbscript|data)\s*:/i.test(v)&&!(k==="src"&&/^\s*data:image\/(png|jpe?g|gif|webp);/i.test(v))) n.removeAttribute(a.name);
        else if(k==="style"&&/expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript/i.test(v)) n.removeAttribute(a.name);
      });
      if(n.tagName==="A"){ n.setAttribute("target","_blank"); n.setAttribute("rel","noopener noreferrer"); }
      walk(n);
    });
  })(doc.body);
  return doc.body.innerHTML;
}
M.sanitize=sanitize;
function textToHtml(t){ return esc(String(t||"")).replace(/\r?\n/g,"<br>"); }
function htmlToText(html){ try{ var d=new DOMParser().parseFromString('<body>'+String(html||"").replace(/<br\s*\/?>/gi,"\n").replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi,"$&\n")+'</body>',"text/html"); return (d.body.textContent||"").replace(/\n{3,}/g,"\n\n").trim(); }catch(e){ return String(html||"").replace(/<[^>]+>/g," "); } }
M.htmlToText=htmlToText;

/* ---------- Entwürfe & Signatur (gleiche Schlüssel wie im klassischen Dashboard) ---------- */
var DRAFTK="fsc_mail_drafts_v1", SIGK="fsc_mail_sig_v1", OBK="fsc_mail_outbox_v1";
function loadDrafts(){ try{ var a=JSON.parse(localStorage.getItem(DRAFTK)); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function saveDrafts(a){ try{ localStorage.setItem(DRAFTK,JSON.stringify(a.slice(0,60))); return true; }catch(e){ F.toast("Entwurf konnte nicht gespeichert werden (Speicher voll)",true); return false; } }
M.draftItems=function(){ return loadDrafts().map(function(d){ return {id:"dr_"+d.id,draftLocal:true,dr:d,account:d.account||"",to:d.to,toName:"",subject:d.subject,preview:String(d.text||"").replace(/\s+/g," ").trim().slice(0,160),date:d.date,read:true,starred:false,attachments:[]}; }); };
var SIG_DEFAULT='Liebe Grüße<br><br><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="460" style="border-collapse:collapse;width:460px;font-family:Arial,Helvetica,sans-serif"><tr><td width="72" valign="middle" style="width:72px;padding:0;vertical-align:middle;border:0"><a href="https://www.fs-creative.at" style="text-decoration:none"><img src="https://www.fs-creative.at/logos/signatur.png" width="72" height="72" alt="FS Creative" border="0" style="display:block;width:72px;height:72px;border:0"></a></td><td width="18" style="width:18px;padding:0;border:0;font-size:0;line-height:0">&nbsp;</td><td width="2" bgcolor="#2f6bff" style="width:2px;padding:0;border:0;background-color:#2f6bff;font-size:0;line-height:0">&nbsp;</td><td width="16" style="width:16px;padding:0;border:0;font-size:0;line-height:0">&nbsp;</td><td valign="middle" style="padding:0;vertical-align:middle;border:0"><p style="margin:0;font-size:16px;line-height:21px;font-weight:bold;color:#0f172a">Simon Felder</p><p style="margin:0 0 7px 0;font-size:13px;line-height:18px;color:#2f6bff">FS Creative · Webdesign &amp; Digitalagentur</p><p style="margin:0;font-size:12px;line-height:18px;color:#475569"><a href="tel:+436641430620" style="color:#475569;text-decoration:none">+43 664 1430620</a></p><p style="margin:0;font-size:12px;line-height:18px;color:#475569"><a href="mailto:simon@fs-creative.at" style="color:#475569;text-decoration:none">simon@fs-creative.at</a></p><p style="margin:0;font-size:12px;line-height:18px"><a href="https://www.fs-creative.at" style="color:#2f6bff;text-decoration:none;font-weight:bold">www.fs-creative.at</a></p></td></tr><tr><td colspan="5" style="padding:12px 0 0 0;border:0;font-size:11px;line-height:16px;color:#94a3b8">Dorfstraße 3/1 · 6793 Gaschurn · Montafon</td></tr></table>';
function sigKey(acc){ return (!acc||acc===M.primaryAcct())?SIGK:(SIGK+"_"+acc); }
function getSig(acc){ try{ var o=JSON.parse(localStorage.getItem(sigKey(acc))); if(o&&typeof o.html==="string") return o; }catch(e){} var prim=(!acc||acc===M.primaryAcct()); return {on:true,html:prim?SIG_DEFAULT:('Liebe Grüße<br><b>Simon Felder</b><br>'+esc(M.accInfo(acc).label||""))}; }
function setSig(o,acc){ try{ localStorage.setItem(sigKey(acc),JSON.stringify(o)); }catch(e){} }
function sigBlock(acc){ return '<div class="fsig"><br>'+sanitize(getSig(acc).html)+'</div>'; }
M.getSig=getSig; M.sigBlock=sigBlock;
/* Signatur des Hauptkontos auch am Server ablegen – Rechnungs- und Mahnungsmails tragen sie dann ebenfalls.
   Eine selbst bearbeitete Signatur gewinnt (je Gerät nur einmal je Fassung); die Standard-Signatur kommt nur hin, wenn am Server noch keine liegt –
   so überschreibt ein anderes Gerät/Browser ohne eigene Signatur nie die richtige. */
function sigHash(s){ var h=0; for(var i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return String(h)+":"+s.length; }
function syncSig(force){
  var raw=null; try{ raw=localStorage.getItem(SIGK); }catch(e){}
  var sg=getSig(""), h=sigHash(String(sg.html||"")); if(!force&&F.ls("fsc_sig_synced")===h) return;
  var push=function(){ F.api("/admin/api/mail-signature",{body:{html:sg.html||""}}).then(function(j){ if(j&&j.ok) F.ls("fsc_sig_synced",h); }).catch(function(){}); };
  if(force||raw) return push();
  F.api("/admin/api/mail-signature").then(function(j){ if(!j||!j.ok) return; if(!j.html) push(); else F.ls("fsc_sig_synced",h); }).catch(function(){});
}
setTimeout(syncSig,5000);

/* ---------- Kontakte (aus gesendeten und empfangenen Mails gewichtet) ---------- */
var CT=null, CT_V=-1;
function contacts(){
  if(CT&&CT_V===M.store.ver) return CT;
  var map={}, mine=M.myAddrs();
  function add(addr,name,w){ if(!addr||addr.indexOf("@")<0) return; var k=addr.toLowerCase(); if(mine[k]) return; if(/no-?reply|mailer-daemon|notification/i.test(k)) return; var e=map[k]||(map[k]={a:addr,n:"",c:0}); if(name&&!e.n&&name!==addr) e.n=name; e.c+=w; }
  M.store.messages.forEach(function(m){ if(M.isSent(m)){ add(m.to,m.toName,3); (m.toList||[]).forEach(function(x){ add(x.address,x.name,3); }); (m.ccList||[]).forEach(function(x){ add(x.address,x.name,2); }); } else { add(m.replyTo||m.from,m.fromName,1); (m.ccList||[]).forEach(function(x){ add(x.address,x.name,1); }); } });
  CT=Object.keys(map).map(function(k){ return map[k]; }).sort(function(a,b){ return b.c-a.c; }).slice(0,400); CT_V=M.store.ver; return CT;
}
M.contacts=contacts;

/* ---------- Postausgang (im Browser gesichert) ---------- */
var OB=[];
(function(){ try{ var a=JSON.parse(localStorage.getItem(OBK)); if(Array.isArray(a)) OB=a; }catch(e){}
  OB.forEach(function(o){ if(o.status==="sending"){ o.status="failed"; o.error="Senden wurde unterbrochen (Seite geschlossen). Bitte unter „Gesendet“ prüfen, ob die Mail angekommen ist – sonst erneut senden."; } }); })();
function saveOutbox(){
  try{ if(!OB.length){ localStorage.removeItem(OBK); return; } localStorage.setItem(OBK,JSON.stringify(OB)); }
  catch(e){ try{ localStorage.setItem(OBK,JSON.stringify(OB.map(function(o){ if(!o.attachments.length) return o; return Object.assign({},o,{attachments:o.attachments.map(function(a){ return {filename:a.filename,contentType:a.contentType,size:a.size}; }),attsDropped:true}); }))); }catch(e2){} }
}
saveOutbox();
M.outbox=function(){ return OB; };
M.findOb=function(id){ return OB.filter(function(o){ return "ob_"+o.oid===id; })[0]||null; };
M.obItems=function(){ return OB.map(function(o){ return {id:"ob_"+o.oid,outbox:true,ob:o,account:o.account,to:o.to,toName:"",subject:o.subject,preview:o.preview,date:o.date,read:true,starred:false,attachments:[]}; }); };
function outboxSend(o){
  if(o.attsDropped&&o.attachments.some(function(a){ return !a.content; })){ o.status="failed"; o.error="Anhänge fehlen (zu groß zum Zwischenspeichern) – bitte über „Bearbeiten“ neu anhängen."; saveOutbox(); M.refresh(); return; }
  o.status="sending"; o.error=""; saveOutbox(); M.refresh();
  F.api("/admin/api/mail-send",{body:{account:o.account||undefined,to:o.to,cc:o.cc||undefined,bcc:o.bcc||undefined,inReplyTo:o.inReplyTo||undefined,source:o.source||undefined,subject:o.subject,html:o.html,text:o.text,attachments:o.attachments}})
    .then(function(j){
      if(!j||j.ok===false||j.error) throw new Error((j&&(j.detail||j.error))||"Unbekannter Fehler");
      OB=OB.filter(function(x){ return x!==o; }); saveOutbox();
      var acc=o.account||M.primaryAcct();
      var loc={id:"local_"+o.oid,local:true,localAt:Date.now(),account:acc,folder:M.sentPath(acc),uid:null,fromName:"",from:M.accInfo(acc).user||"",toName:"",to:o.to,subject:o.subject,preview:o.preview,body:o.html,bodyHtml:true,date:new Date().toISOString(),read:true,starred:false,deleted:false,attachments:[],toList:[],ccList:[],inReplyTo:o.inReplyTo||""};
      M.local.push(loc); M.store.messages.push(loc);
      markReplied(o.source);
      if(UI.msel==="ob_"+o.oid) UI.msel=loc.id;
      M.changed(); F.toast("Gesendet an "+o.to); M.refresh(); M.scheduleReload(8000);
      runAfter(o);
    })
    .catch(function(err){ if(String(err&&err.message)==="login") return; o.status="failed"; o.error=String(err&&err.message||err||"Keine Verbindung"); saveOutbox(); F.toast("Senden fehlgeschlagen – die Mail liegt im Postausgang",true,"Ansehen",function(){ UI.mf="outbox"; UI.msel="ob_"+o.oid; F.go("post"); }); M.refresh(); });
}
/* Folgeschritt erst nach erfolgreichem Versand, z. B. Angebot als versendet markieren (zangebot.js): o.after={kind,…} ist reines JSON und
   übersteht so auch den Postausgang im Browser (Wiederholen nach Neuladen); ausgeführt wird F.mailAfter[kind](after,{to,subject,files}) – files = tatsächlich mitgeschickte Anhänge. */
F.mailAfter=F.mailAfter||{};
function runAfter(o){ var a=o&&o.after, fn=a&&a.kind&&F.mailAfter[a.kind]; if(typeof fn!=="function") return; try{ fn(a,{to:o.to,subject:o.subject,files:(o.attachments||[]).filter(function(x){ return x&&x.content; }).map(function(x){ return x.filename; })}); }catch(e){ console.error(e); } }
var obSeq=0;
function queueMail(d){
  var o={oid:(++obSeq)+"_"+Date.now().toString(36),account:d.account||"",cc:d.cc||"",bcc:d.bcc||"",inReplyTo:d.inReplyTo||"",source:d.source||null,after:d.after||null,to:d.to,subject:d.subject,html:d.html,text:d.text,attachments:d.attachments||[],preview:String(d.text||"").replace(/\s+/g," ").trim().slice(0,180),date:new Date().toISOString(),status:"sending",error:""};
  OB.push(o); F.toast("Wird gesendet …"); outboxSend(o); return o;
}
M.queueMail=queueMail;
window.addEventListener("beforeunload",function(e){ if(OB.some(function(o){ return o.status==="sending"; })){ e.preventDefault(); e.returnValue="Es wird noch eine Mail gesendet."; return e.returnValue; } });
F.action("mob",function(v){
  var i=v.indexOf("|"), op=v.slice(0,i), o=M.findOb("ob_"+v.slice(i+1)); if(!o) return;
  if(op==="retry"){ outboxSend(o); }
  else if(op==="discard"){ F.confirm(o.status==="sending"?"Die Mail wird gerade gesendet. Trotzdem aus dem Postausgang entfernen?":"Diese Mail verwerfen? Sie wird nicht gesendet.","Verwerfen",function(){ OB=OB.filter(function(x){ return x!==o; }); saveOutbox(); UI.msel=null; M.refresh(); },true); }
  else if(op==="edit"){ if(o.status==="sending"){ F.toast("Die Mail wird gerade gesendet – bitte kurz warten.",true); return; } OB=OB.filter(function(x){ return x!==o; }); saveOutbox(); UI.msel=null; M.refresh();
    openCompose("Neue Nachricht",o.to,o.subject,o.html,{raw:true,cc:o.cc,bcc:o.bcc,inReplyTo:o.inReplyTo,source:o.source,account:o.account,after:o.attsDropped?null:o.after,atts:o.attachments.filter(function(a){ return a.content; })}); }   /* Anhang verloren → kein Folgeschritt (z. B. Angebot ohne PDF nicht als versendet markieren) */
});
F.action("mobshow",function(oid){ UI.mf="outbox"; UI.msel="ob_"+oid; F.go("post"); });
F.action("mobretry",function(oid){ var o=M.findOb("ob_"+oid); if(o) outboxSend(o); });
/* Heute: nicht gesendete Mails nicht übersehen (ungelesene Mails zeigt heute.js selbst) */
F.feed(function(){ return OB.filter(function(o){ return o.status==="failed"; }).map(function(o){ return {id:"outbox:"+o.oid,rank:2,sev:"bad",icon:"post",tag:["bad","Postausgang"],t:"Mail an "+o.to+" wurde nicht gesendet",d:"„"+(o.subject||"(kein Betreff)")+"“ · "+(o.error||"Fehler"),acts:[["Ansehen","mobshow:"+o.oid],["Erneut senden","mobretry:"+o.oid,"primary"]]}; }); });

/* ---------- Beantwortet / Weitergeleitet ---------- */
function srcOf(m,kind){ return m&&m.uid!=null&&!m.local?{folder:m.folder||"INBOX",uid:m.uid,account:M.accOf(m),kind:kind||"reply",id:m.id}:(m?{id:m.id,kind:kind||"reply"}:null); }
function markReplied(src){ if(!src) return; var m=M.find(src.id); if(!m) return; if(src.kind==="fwd") M.setOv(m,{forwarded:true}); else M.setOv(m,{answered:true,answeredAt:new Date().toISOString()}); M.changed(); }
function stripRe(s){ return String(s||"").replace(/^\s*((re|aw|fwd?|wg)\s*:\s*)+/i,""); }
function quoteHtml(m,kind){
  var when=m.date?new Date(m.date).toLocaleString("de-AT"):"", who=esc(m.fromName||m.from||"");
  var orig=m.bodyHtml?sanitize(m.body||""):('<div style="white-space:pre-wrap">'+esc(m.body||m.preview||"")+'</div>');
  var head=kind==="fwd"?'<div class="qh">----- Weitergeleitete Nachricht -----<br>Von: '+who+(m.from?' &lt;'+esc(m.from)+'&gt;':'')+'<br>Betreff: '+esc(m.subject||"")+(when?'<br>Datum: '+esc(when):'')+'</div>'
    :'<div class="qh">Am '+esc(when)+' schrieb '+who+':</div>';
  return '<div><br></div>'+head+'<blockquote type="cite">'+orig+'</blockquote>';
}
function uniq(a){ var seen={}; return a.filter(function(x){ var k=String(x).toLowerCase(); if(!x||seen[k]) return false; seen[k]=1; return true; }); }
M.reply=function(m,kind){
  if(!m) return;
  if(kind==="fwd"){ openCompose("Weiterleiten","","Fwd: "+stripRe(m.subject),quoteHtml(m,"fwd"),{account:M.accOf(m),source:srcOf(m,"fwd"),fwdFrom:m}); return; }
  var mine=M.myAddrs(), to=M.isSent(m)?(m.to||""):(m.replyTo||m.from||""), cc="";
  if(kind==="all"){ cc=uniq([].concat(m.toList||[],m.ccList||[]).map(function(a){ return a.address; }).filter(function(a){ return a&&!mine[a.toLowerCase()]&&a.toLowerCase()!==to.toLowerCase(); })).join(", "); }
  openCompose(kind==="all"?"Allen antworten":"Antworten",to,"Re: "+stripRe(m.subject),quoteHtml(m,"reply"),{cc:cc,inReplyTo:m.messageId||"",account:M.accOf(m),source:srcOf(m,"reply")});
};
M.quickReply=function(m){
  var ta=document.getElementById("mqr"); if(!ta||!m) return; var txt=(ta.value||"").trim(); if(!txt){ ta.focus(); return; }
  var acc=M.accOf(m), html='<div>'+textToHtml(txt)+'</div>'+(getSig(acc).on?sigBlock(acc):'')+quoteHtml(m,"reply");
  queueMail({account:acc,to:m.replyTo||m.from,subject:"Re: "+stripRe(m.subject),html:html,text:txt,attachments:[],inReplyTo:m.messageId||"",source:srcOf(m,"reply")});
  UI.mqr=""; ta.value="";
};
M.editServerDraft=function(m){ openCompose("Entwurf",m.to||"",m.subject||"",m.bodyHtml?(m.body||""):textToHtml(m.body||""),{raw:true,account:M.accOf(m),sigOn:false}); };
M.openDraft=function(id){ var d=loadDrafts().filter(function(x){ return x.id===id; })[0]; if(!d) return; openCompose(d.title||"Entwurf",d.to,d.subject,d.html,{raw:true,cc:d.cc,bcc:d.bcc,inReplyTo:d.inReplyTo,source:d.source||null,draftId:d.id,account:d.account}); };

/* ---------- Verfassen-Fenster ---------- */
var C={open:false,atts:[],initial:"",autoT:null};
function host(){ var h=document.getElementById("mcompose"); if(!h){ h=document.createElement("div"); h.id="mcompose"; h.className="modal mcmp"; h.setAttribute("role","dialog"); h.setAttribute("aria-modal","true"); h.setAttribute("aria-labelledby","mcTitle"); h.hidden=true; document.body.appendChild(h); bindHost(h); } return h; }
function $(id){ return document.getElementById(id); }
function composeAcct(){ var s=$("mcFrom"); return (s&&s.value)||C.account||M.primaryAcct(); }
function accList(){ var a=M.accounts().filter(function(x){ return x.configured!==false; }); return a.length?a:M.accounts(); }
function openCompose(title,to,subj,bodyHtml,opts){
  opts=opts||{};
  if(C.open){ saveIfMeaningful(true); }
  var accs=accList(), want=opts.account||(UI.macct&&UI.macct!=="all"?UI.macct:M.primaryAcct());
  if(!accs.some(function(a){ return a.key===want; })) want=accs[0].key;
  C={open:true,atts:(opts.atts||[]).slice(),title:title==="Verfassen"?"Neue Nachricht":(title||"Neue Nachricht"),inReplyTo:opts.inReplyTo||"",source:opts.source||null,draftId:opts.draftId||null,account:want,autoT:null,
    after:opts.after||null,   /* Folgeschritt nach dem Senden (runAfter) – nicht im Entwurf gespeichert, Entwürfe haben keine Anhänge */
    rc:{mcTo:splitAddr(to),mcCc:splitAddr(opts.cc),mcBcc:splitAddr(opts.bcc)}};
  var sig=getSig(want), raw=!!opts.raw;
  var sigOn=raw?(opts.sigOn!==false&&/class="fsig"/.test(bodyHtml||"")):sig.on;
  var html=raw?sanitize(bodyHtml||""):('<div><br></div>'+(sigOn?sigBlock(want):'')+(bodyHtml||""));
  if(opts.lead!=null&&!raw) html='<div>'+textToHtml(opts.lead)+'</div>'+(sigOn?sigBlock(want):'')+(bodyHtml||"");
  var h=host(), showCc=!!(opts.cc||opts.bcc);
  /* Empfänger als Chips: fertige Adressen stehen in C.rc, im Eingabefeld steht nur die gerade getippte */
  var rcf=function(id,ph){ return '<span class="mcin" data-rcf="'+id+'"><span class="mcchips" id="'+id+'C"></span><input class="f" id="'+id+'" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="email" enterkeyhint="next"'+(ph?' placeholder="'+esc(ph)+'"':'')+'></span>'; };
  h.innerHTML='<div class="dialog mcd" id="mcDlg">'+
    '<div class="mchead"><h2 id="mcTitle">'+esc(C.title)+'</h2><span id="mcSaved">'+(opts.draftId?"Entwurf":"")+'</span>'+
      '<button type="button" class="btn primary mcsend-top" data-act="mcsend">'+M.ic("send")+' Senden</button>'+
      '<button type="button" class="btn icon mcx" data-act="mcclose" title="Schließen – wird als Entwurf gespeichert (Esc)" aria-label="Schließen">'+F.svg("close")+'</button></div>'+
    '<div class="mcfields">'+
      (accs.length>1?'<div class="mcf"><label for="mcFrom">Von</label><select class="f" id="mcFrom">'+accs.map(function(a){ return '<option value="'+esc(a.key)+'"'+(a.key===want?" selected":"")+'>'+esc(a.label||a.key)+(a.user?' &lt;'+esc(a.user)+'&gt;':'')+'</option>'; }).join("")+'</select></div>':'')+
      '<div class="mcf"><label for="mcTo">An</label>'+rcf("mcTo","Name oder Adresse")+(showCc?'':'<button type="button" class="link" data-act="mccc" id="mcCcT">Cc/Bcc</button>')+'</div>'+
      '<div class="mcf mccc"'+(showCc?'':' hidden')+'><label for="mcCc">Cc</label>'+rcf("mcCc","")+'</div>'+
      '<div class="mcf mccc"'+(showCc?'':' hidden')+'><label for="mcBcc">Bcc</label>'+rcf("mcBcc","")+'</div>'+
      '<div class="mcf"><label for="mcSubj">Betreff</label><input class="f" id="mcSubj" autocomplete="off" value="'+esc(subj||"")+'"></div>'+
    '</div>'+
    '<div class="mced-wrap"><div class="mctb" role="toolbar" aria-label="Formatierung">'+
      '<button type="button" data-cmd="bold" title="Fett (⌘B)"><b>F</b></button><button type="button" data-cmd="italic" title="Kursiv (⌘I)"><i>K</i></button><button type="button" data-cmd="underline" title="Unterstrichen (⌘U)"><u>U</u></button><span class="tsep"></span>'+
      '<button type="button" data-cmd="insertUnorderedList" title="Aufzählung">• Liste</button><button type="button" data-cmd="insertOrderedList" title="Nummerierung">1. Liste</button><button type="button" data-cmd="formatBlock" data-arg="blockquote" title="Zitat">Zitat</button><button type="button" data-cmd="createLink" title="Link einfügen">Link</button><span class="tsep"></span>'+
      '<button type="button" data-cmd="removeFormat" title="Formatierung entfernen">Format entfernen</button></div>'+
      '<div class="mclink" id="mcLink" hidden><input class="f" id="mcLinkUrl" placeholder="https://…" aria-label="Link-Adresse"><button type="button" class="btn primary" data-act="mclinkok">Einfügen</button><button type="button" class="btn" data-act="mclinkx">Abbrechen</button></div>'+
      '<div id="mcBody" class="mced" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Nachricht"></div></div>'+
    '<input type="file" id="mcFile" multiple hidden>'+
    '<div id="mcAtts" class="attl"></div>'+
    '<div class="mcsig" id="mcSig" hidden><div class="sec-t">Signatur für dieses Konto – wird in diesem Browser gespeichert</div><div id="mcSigBody" class="mced small" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Signatur"></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-act="mcsigx">Abbrechen</button><button type="button" class="btn primary" data-act="mcsigsave">Signatur speichern</button></div></div>'+
    '<div class="mcdrop">Dateien hier ablegen</div>'+
    '<div class="err" id="mcErr" role="alert"></div>'+
    '<div class="foot"><span class="row wrap"><button type="button" class="btn icon" data-act="mcdiscard" title="Entwurf verwerfen" aria-label="Entwurf verwerfen">'+M.ic("trash")+'</button><label class="row small" style="gap:6px"><input type="checkbox" id="mcSigOn"'+(sigOn?" checked":"")+'> Signatur</label><button type="button" class="link" data-act="mcsigedit">bearbeiten</button></span>'+
    '<span class="row wrap"><button type="button" class="btn" data-act="mcdraft">Entwurf</button><button type="button" class="btn" data-act="mcattach">'+M.ic("clip")+' Anhang</button><button type="button" class="btn primary mcsend-bot" data-act="mcsend">'+M.ic("send")+' Senden <span class="kbd hide-m">⌘↵</span></button></span></div>'+
    '<div class="mcac" id="mcAc" role="listbox" hidden></div>'+
  '</div>';
  $("mcBody").innerHTML=html;
  ["mcTo","mcCc","mcBcc"].forEach(rcPaint);
  h.hidden=false; document.body.classList.add("mc-open");
  renderAtts();
  if(opts.fwdFrom) loadFwdAtts(opts.fwdFrom);
  C.initial=sigNow();
  setTimeout(function(){ var t=$("mcTo"), b=$("mcBody"); if(!t) return; if(!C.rc.mcTo.length&&!t.value&&!raw){ t.focus(); return; } if(b){ b.focus(); try{ var r=document.createRange(); r.selectNodeContents(b); r.collapse(true); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e){} } },40);
}
M.openCompose=openCompose;
/* ---------- Empfänger-Chips ---------- */
function splitAddr(v){ return String(v||"").split(/[,;]/).map(function(x){ return x.trim(); }).filter(Boolean); }
function validAddr(x){ return /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(String(x||"").replace(/^.*<([^>]+)>.*$/,"$1")); }
function rcList(id){ return (C.rc&&C.rc[id])||[]; }
function rcPaint(id){
  var h=$(id+"C"); if(!h) return; var names={};
  contacts().forEach(function(c){ if(c.n) names[c.a.toLowerCase()]=c.n; });
  h.innerHTML=rcList(id).map(function(a,i){ var ok=validAddr(a), m=a.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/), lbl=m&&m[1]?m[1]:(names[a.toLowerCase()]||a);
    return '<span class="mcchip'+(ok?"":" bad")+'" title="'+esc(a+(ok?"":" – Adresse prüfen"))+'"><span>'+esc(lbl)+'</span><button type="button" data-act="mcrm:'+id+'|'+i+'" aria-label="'+esc(a)+' entfernen">'+F.svg("close")+'</button></span>'; }).join("");
}
/* Getippte Adressen zu Chips machen: bei Komma/Strichpunkt sofort, sonst (all) auch den letzten Teil – beim Verlassen nur, wenn er wie eine Adresse aussieht */
function rcCommit(inp,all){
  if(!inp||!C.rc||!C.rc[inp.id]) return false;
  var parts=String(inp.value||"").split(/[,;]/), last=parts.pop();
  if(all==="valid"){ if(validAddr(last)){ parts.push(last); last=""; } } else if(all){ parts.push(last); last=""; }
  var add=parts.map(function(x){ return x.trim(); }).filter(Boolean); if(!add.length) return false;
  var have=C.rc[inp.id].map(function(x){ return x.toLowerCase(); });
  add.forEach(function(a){ if(have.indexOf(a.toLowerCase())<0){ C.rc[inp.id].push(a); have.push(a.toLowerCase()); } });
  inp.value=String(last||"").replace(/^\s+/,""); rcPaint(inp.id); return true;
}
F.action("mcrm",function(v){ var i=v.lastIndexOf("|"), id=v.slice(0,i), n=+v.slice(i+1); if(!C.rc||!C.rc[id]) return; C.rc[id].splice(n,1); rcPaint(id); var inp=$(id); if(inp) inp.focus(); });
function addrs(id){ var el=$(id); return rcList(id).concat(splitAddr(el&&el.value)).join(", "); }
function data(){ var b=$("mcBody"); return {account:composeAcct(),to:addrs("mcTo"),cc:addrs("mcCc"),bcc:addrs("mcBcc"),subject:($("mcSubj").value||"").trim(),html:b.innerHTML,text:(b.innerText||"").trim()}; }
function sigNow(){ var d=data(); return d.to+"|"+d.cc+"|"+d.bcc+"|"+d.subject+"|"+d.html+"|"+C.atts.length; }
function dirty(){ return C.open&&sigNow()!==C.initial; }
function saveDraft(silent){
  var d=data(), a=loadDrafts(), id=C.draftId||("d"+Date.now().toString(36)); C.draftId=id;
  d.id=id; d.date=new Date().toISOString(); d.inReplyTo=C.inReplyTo||""; d.source=C.source||null; d.title=C.title;
  a=a.filter(function(x){ return x.id!==id; }); a.unshift(d); if(!saveDrafts(a)) return;
  C.initial=sigNow();
  var sv=$("mcSaved"); if(sv) sv.textContent="Entwurf gespeichert "+new Date().toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"});
  if(!silent) F.toast("Als Entwurf gespeichert");
  M.store.ver++; if(F.current==="post") F.render(); else F.renderNav();
}
function deleteDraft(id){ if(!id) return; saveDrafts(loadDrafts().filter(function(x){ return x.id!==id; })); }
function saveIfMeaningful(silent){
  if(!C.open) return;
  var d=data(), sigLen=htmlToText(getSig(composeAcct()).html).replace(/\s+/g,"").length;
  if(dirty()&&(d.to||d.subject||d.text.replace(/\s+/g,"").length>sigLen+2)) saveDraft(silent);
}
function hide(){ clearTimeout(C.autoT); C.open=false; var h=host(); h.hidden=true; h.innerHTML=""; document.body.classList.remove("mc-open"); if(F.current==="post") F.render(); }
function closeCompose(){ if(!C.open) return; saveIfMeaningful(false); hide(); }
M.closeCompose=closeCompose;
M.composeOpen=function(){ return C.open; };

function renderAtts(){
  var h=$("mcAtts"); if(!h) return;
  h.innerHTML=C.atts.map(function(a,i){ return '<span class="att'+(a.failed?" bad":"")+'"'+(a.failed?' title="Anhang konnte nicht geladen werden"':'')+'><span class="ai"><span class="ak">'+esc(M.attIconTxt(a))+'</span><span class="nm">'+esc(a.filename)+'</span><span class="sz">'+(a.loading?"lädt …":(a.failed?"Fehler":esc(M.fmtBytes(a.size))))+'</span></span><button type="button" data-act="mcattdel:'+i+'" title="Entfernen" aria-label="'+esc(a.filename)+' entfernen">'+F.svg("close")+'</button></span>'; }).join("");
}
function readFile(f){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ var s=String(r.result||""); res(s.indexOf(",")>-1?s.slice(s.indexOf(",")+1):s); }; r.onerror=rej; r.readAsDataURL(f); }); }
function addFiles(files){
  Array.prototype.forEach.call(files||[],function(f){
    if(f.size>15000000){ F.toast("„"+f.name+"“ ist zu groß (max. 15 MB pro Datei).",true); return; }
    var ph={filename:f.name||"anhang",contentType:f.type||"application/octet-stream",size:f.size,content:null,loading:true}; C.atts.push(ph); renderAtts();
    readFile(f).then(function(b64){ ph.content=b64; ph.loading=false; renderAtts(); }).catch(function(){ ph.loading=false; ph.failed=true; renderAtts(); });
  });
}
function loadFwdAtts(m){
  (m.attachments||[]).forEach(function(a){
    var ph={filename:a.filename||"anhang",contentType:a.contentType||"application/octet-stream",size:a.size||0,content:null,loading:true}; C.atts.push(ph);
    fetch(M.attHref(m,a)+"&dl=1",{credentials:"same-origin"}).then(function(r){ if(!r.ok) throw new Error("http"); return r.blob(); })
      .then(function(b){ return readFile(b).then(function(x){ ph.content=x; ph.size=ph.size||b.size; }); })
      .then(function(){ ph.loading=false; renderAtts(); }).catch(function(){ ph.loading=false; ph.failed=true; renderAtts(); });
  });
  renderAtts(); C.initial=sigNow();
}

/* Nacheinander nachfragen (Bestätigungen erscheinen über dem Verfassen-Fenster) */
function askChain(list,done){ var i=0; (function next(){ while(i<list.length&&!list[i].when) i++; if(i>=list.length) return done(); var q=list[i++]; F.confirm(q.text,q.ok||"Trotzdem senden",next); })(); }
function doSend(){
  var d=data(), err=$("mcErr"); err.textContent="";
  if(!d.to){ err.textContent="Bitte eine Empfängeradresse eingeben."; $("mcTo").focus(); return; }
  if(C.atts.some(function(a){ return a.loading; })){ err.textContent="Die Anhänge werden noch geladen – bitte einen Moment warten."; return; }
  var all=[d.to,d.cc,d.bcc].join(","), bad=all.split(/[,;]/).map(function(x){ return x.trim(); }).filter(function(x){ return x&&!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(x.replace(/^.*<([^>]+)>.*$/,"$1")); });
  var before=d.text.split(/Am .* schrieb|----- Weitergeleitete Nachricht/)[0];
  askChain([
    {when:bad.length,text:"Diese Adresse sieht ungültig aus: "+bad.join(", ")+". Trotzdem senden?"},
    {when:!d.subject,text:"Ohne Betreff senden?"},
    {when:/anhang|anbei|attach/i.test(before)&&!C.atts.length,text:"Im Text steht „Anhang“ oder „anbei“, aber es ist keine Datei angehängt. Trotzdem senden?"},
    {when:C.atts.some(function(a){ return a.failed; }),text:"Ein Anhang konnte nicht geladen werden und wird nicht mitgeschickt. Trotzdem senden?"}
  ],function(){
    if(!C.open) return;
    d=data();
    queueMail({account:d.account,to:d.to,cc:d.cc,bcc:d.bcc,subject:d.subject,html:d.html,text:d.text,inReplyTo:C.inReplyTo,source:C.source,after:C.after,attachments:C.atts.filter(function(a){ return a.content; }).map(function(a){ return {filename:a.filename,contentType:a.contentType,size:a.size,content:a.content}; })});
    deleteDraft(C.draftId); hide();
  });
}

/* ---------- Kontaktvorschläge für An/Cc/Bcc ---------- */
var AC={input:null,items:[],i:0};
function acTok(v){ var p=v.lastIndexOf(","), q=v.lastIndexOf(";"), k=Math.max(p,q); return {pre:k>-1?v.slice(0,k+1)+" ":"",tok:(k>-1?v.slice(k+1):v).trim()}; }
function acShow(input){
  var box=$("mcAc"); if(!box) return; var t=acTok(input.value).tok.toLowerCase();
  if(t.length<2){ acHide(); return; }
  var have=rcList(input.id).map(function(x){ return x.toLowerCase(); });
  AC.items=contacts().filter(function(c){ return (c.a.toLowerCase().indexOf(t)>-1||(c.n||"").toLowerCase().indexOf(t)>-1)&&have.indexOf(c.a.toLowerCase())<0; }).slice(0,6);
  if(!AC.items.length){ acHide(); return; }
  AC.input=input; AC.i=0;
  var r=input.getBoundingClientRect(), dr=$("mcDlg").getBoundingClientRect();
  box.style.left=(r.left-dr.left)+"px"; box.style.top=(r.bottom-dr.top+$("mcDlg").scrollTop+4)+"px"; box.style.width=r.width+"px";
  box.innerHTML=AC.items.map(function(c,i){ return '<button type="button" role="option" data-act="mcac:'+i+'"'+(i===0?' aria-selected="true"':'')+'><b>'+esc(c.n||c.a)+'</b>'+(c.n?' <span class="muted">'+esc(c.a)+'</span>':'')+'</button>'; }).join("");
  box.hidden=false;
}
function acHide(){ var b=$("mcAc"); if(b){ b.hidden=true; b.innerHTML=""; } AC.items=[]; }
function acPick(i){ var c=AC.items[i], inp=AC.input; if(!c||!inp) return; var t=acTok(inp.value); inp.value=t.pre+c.a+", "; rcCommit(inp,false); acHide(); inp.focus(); }
F.action("mcac",function(i){ acPick(+i); });

/* ---------- Ereignisse im Verfassen-Fenster ---------- */
function bindHost(h){
  h.addEventListener("input",function(e){
    var t=e.target;
    if(t.id==="mcTo"||t.id==="mcCc"||t.id==="mcBcc"){ if(/[,;]/.test(t.value)) rcCommit(t,false); acShow(t); }
    clearTimeout(C.autoT); C.autoT=setTimeout(function(){ if(C.open&&dirty()){ var d=data(); if(d.to||d.subject||d.text.length>40) saveDraft(true); } },2500);
  });
  h.addEventListener("keydown",function(e){
    var t=e.target;
    if(AC.items.length&&AC.input===t){
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); AC.i=(AC.i+(e.key==="ArrowDown"?1:-1)+AC.items.length)%AC.items.length; $("mcAc").querySelectorAll("button").forEach(function(b,i){ b.setAttribute("aria-selected",String(i===AC.i)); }); return; }
      if(e.key==="Enter"||e.key==="Tab"){ e.preventDefault(); acPick(AC.i); return; }
      if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); acHide(); return; }
    }
    if(t.id==="mcLinkUrl"&&e.key==="Enter"){ e.preventDefault(); F.actions.mclinkok(); }
    if(/^mc(To|Cc|Bcc)$/.test(t.id)){
      if(e.key==="Enter"&&String(t.value||"").trim()){ e.preventDefault(); rcCommit(t,true); }
      else if(e.key==="Backspace"&&!t.value&&rcList(t.id).length){ e.preventDefault(); t.value=C.rc[t.id].pop(); rcPaint(t.id); }   /* letzten Chip wieder zum Bearbeiten ins Feld */
    }
  });
  h.addEventListener("focusout",function(e){ var t=e.target; if(/^mc(To|Cc|Bcc)$/.test(t.id)) setTimeout(function(){ var a=document.activeElement; if(!a||!a.closest||!a.closest("#mcAc")){ acHide(); if(C.open&&document.body.contains(t)) rcCommit(t,"valid"); } },150); });
  /* Klick ins Empfängerfeld (neben die Chips) setzt den Cursor ins Eingabefeld */
  h.addEventListener("click",function(e){ var f=e.target.closest&&e.target.closest(".mcin"); if(!f||e.target.closest("button,input")) return; var i=f.querySelector("input"); if(i) i.focus(); });
  h.addEventListener("change",function(e){
    var t=e.target;
    if(t.id==="mcFile"){ addFiles(t.files); t.value=""; }
    else if(t.id==="mcFrom"){ var b=$("mcBody"), ex=b.querySelector(".fsig"), sg=getSig(t.value);
      if(ex){ if(sg.on) ex.innerHTML="<br>"+sanitize(sg.html); else ex.remove(); }
      else if(sg.on&&$("mcSigOn").checked){ var tmp=document.createElement("div"); tmp.innerHTML=sigBlock(t.value); var q=b.querySelector(".qh"); if(q) b.insertBefore(tmp.firstChild,q); else b.appendChild(tmp.firstChild); }
      C.account=t.value; }
    else if(t.id==="mcSigOn"){ var b2=$("mcBody"), ex2=b2.querySelector(".fsig"), sg2=getSig(composeAcct());
      if(t.checked&&!ex2){ var tmp2=document.createElement("div"); tmp2.innerHTML=sigBlock(composeAcct()); var q2=b2.querySelector(".qh"); if(q2) b2.insertBefore(tmp2.firstChild,q2); else b2.appendChild(tmp2.firstChild); }
      else if(!t.checked&&ex2) ex2.remove();
      sg2.on=t.checked; setSig(sg2,composeAcct()); }
  });
  h.addEventListener("mousedown",function(e){
    var b=e.target.closest("[data-cmd]"); if(!b) return; e.preventDefault();
    var cmd=b.getAttribute("data-cmd"); $("mcBody").focus();
    if(cmd==="createLink"){ var s=window.getSelection(); C.linkRange=s.rangeCount?s.getRangeAt(0).cloneRange():null; $("mcLink").hidden=false; var u=$("mcLinkUrl"); u.value="https://"; setTimeout(function(){ u.focus(); u.select(); },10); return; }
    try{ document.execCommand(cmd,false,b.getAttribute("data-arg")||null); }catch(x){}
  });
  h.addEventListener("paste",function(e){
    if(e.target.closest&&e.target.closest("#mcBody")){
      var files=(e.clipboardData&&e.clipboardData.files)||[]; if(files.length){ e.preventDefault(); addFiles(files); return; }
      var htm=e.clipboardData&&e.clipboardData.getData("text/html");
      if(htm){ e.preventDefault(); try{ document.execCommand("insertHTML",false,sanitize(htm)); }catch(x){} }
    }
  });
  var dragN=0;
  h.addEventListener("dragenter",function(e){ if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],"Files")>-1){ e.preventDefault(); dragN++; h.classList.add("dragover"); } });
  h.addEventListener("dragover",function(e){ if(h.classList.contains("dragover")) e.preventDefault(); });
  h.addEventListener("dragleave",function(){ dragN=Math.max(0,dragN-1); if(!dragN) h.classList.remove("dragover"); });
  h.addEventListener("drop",function(e){ if(!h.classList.contains("dragover")) return; e.preventDefault(); dragN=0; h.classList.remove("dragover"); addFiles(e.dataTransfer.files); });
}
F.action("mcclose",closeCompose);
F.action("mccc",function(){ document.querySelectorAll(".mccc").forEach(function(r){ r.hidden=false; }); var t=$("mcCcT"); if(t) t.remove(); $("mcCc").focus(); });
F.action("mcattach",function(){ $("mcFile").click(); });
F.action("mcattdel",function(i){ C.atts.splice(+i,1); renderAtts(); });
F.action("mcdraft",function(){ saveDraft(false); });
F.action("mcsend",doSend);
F.action("mcdiscard",function(){ var d=data(); var go=function(){ deleteDraft(C.draftId); C.initial=sigNow(); hide(); F.toast("Verworfen"); };
  if(d.to||d.subject||dirty()||C.draftId) F.confirm("Diese Mail verwerfen?","Verwerfen",go,true); else go(); });
F.action("mcsigedit",function(){ var s=$("mcSig"); if(!s.hidden){ s.hidden=true; return; } $("mcSigBody").innerHTML=sanitize(getSig(composeAcct()).html); s.hidden=false; $("mcSigBody").focus(); });
F.action("mcsigx",function(){ $("mcSig").hidden=true; });
F.action("mcsigsave",function(){ var sg=getSig(composeAcct()); sg.html=sanitize($("mcSigBody").innerHTML); setSig(sg,composeAcct()); var ex=$("mcBody").querySelector(".fsig"); if(ex) ex.innerHTML="<br>"+sg.html; $("mcSig").hidden=true; F.toast("Signatur gespeichert"); if(!composeAcct()||composeAcct()===M.primaryAcct()) syncSig(true); });
F.action("mclinkok",function(){ var u=($("mcLinkUrl").value||"").trim(); $("mcLink").hidden=true; if(!u||/^\s*(javascript|data|vbscript):/i.test(u)||u==="https://") return; if(!/^[a-z]+:/i.test(u)) u="https://"+u;
  var b=$("mcBody"); b.focus(); if(C.linkRange){ var s=window.getSelection(); s.removeAllRanges(); s.addRange(C.linkRange); }
  try{ if(window.getSelection().isCollapsed) document.execCommand("insertHTML",false,'<a href="'+esc(u)+'">'+esc(u)+'</a>'); else document.execCommand("createLink",false,u); }catch(x){} });
F.action("mclinkx",function(){ $("mcLink").hidden=true; $("mcBody").focus(); });

/* Tastatur: vor dem Kern abfangen, damit Esc das Fenster mit Entwurf schließt (statt es zu verwerfen) */
window.addEventListener("keydown",function(e){
  if(!C.open) return;
  if(F.modalOpen()) return; // Bestätigung darüber: der Kern schließt sie
  if((e.metaKey||e.ctrlKey)&&e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); doSend(); }
  else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); if(!$("mcLink").hidden){ $("mcLink").hidden=true; return; } if(AC.items.length){ acHide(); return; } closeCompose(); }
  else if((e.metaKey||e.ctrlKey)&&(e.key==="s"||e.key==="S")){ e.preventDefault(); e.stopPropagation(); saveDraft(false); }
  else if((e.metaKey||e.ctrlKey)&&(e.key==="k"||e.key==="K")){ e.stopPropagation(); }
},true);
window.addEventListener("click",function(e){ if(C.open&&e.target===host()){ e.stopPropagation(); closeCompose(); } },true);
window.addEventListener("pagehide",function(){ if(C.open) saveIfMeaningful(true); });

/* ---------- F.compose für alle Module: {title,to,cc,bcc,subject,text,html,inReplyTo,account,atts,after} ----------
   after: {kind,…} (JSON) → nach erfolgreichem Versand F.mailAfter[kind] (siehe runAfter); gesendet wird immer erst mit „Senden“ */
F.compose=function(pre){
  pre=pre||{};
  var body=pre.html!=null?sanitize(pre.html):"";
  openCompose(pre.title||"Neue Nachricht",pre.to||"",pre.subject||"",body,{lead:pre.text!=null&&pre.text!==""?pre.text:null,cc:pre.cc,bcc:pre.bcc,inReplyTo:pre.inReplyTo,account:pre.account,atts:pre.atts,source:pre.source||null,after:pre.after||null});
};
F.action("compose",function(){ F.compose({}); });

/* Verfassen: Glas-Dialog (Shell), Empfänger als Chips, Editor als weißes „Papier“ (so sieht es die Empfängerin), Senden gut sichtbar */
F.css([
"#mcompose{z-index:65}",
"body.mc-open{overflow:hidden}",
".mcd{width:min(880px,100%);position:relative;gap:12px}",
".mchead{display:flex;align-items:center;gap:10px;min-width:0}",
".mchead h2{font-size:19px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
"#mcSaved{font-size:12.5px;color:var(--ink-3);white-space:nowrap}",
".mcsend-top{display:none}",
".mcd .btn svg{width:16px;height:16px}",
".mcfields{display:grid;gap:8px}",
".mcf{display:grid;grid-template-columns:64px minmax(0,1fr) auto;gap:8px;align-items:center}",
".mcf>label{font-size:13px;color:var(--ink-2);font-weight:600}",
".mcf>.mcin,.mcf>select,.mcf>#mcSubj{grid-column:2/3}",
".mcf>#mcSubj,.mcf>select{grid-column:2/4}",
".mcf .link{white-space:nowrap}",
".mcin{position:relative;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:4px 6px;min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--field,var(--panel));cursor:text}",
".mcin:focus-within{border-color:var(--glow);box-shadow:0 0 0 3px var(--glow-soft)}",
".mcin .mcchips{display:contents}",
".mcin input.f{flex:1 1 140px;width:auto;min-width:120px;min-height:30px;padding:4px;border:0!important;background:none!important;box-shadow:none!important;border-radius:6px}",
".mcchip{display:inline-flex;align-items:center;gap:2px;max-width:100%;min-height:28px;padding:1px 2px 1px 10px;border-radius:99px;background:var(--glow-soft);color:var(--glow-ink);font-size:13px;font-weight:600}",
".mcchip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
".mcchip button{border:0;background:none;color:inherit;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex:none;opacity:.7;padding:0}",
".mcchip button:hover{opacity:1;background:var(--hover,var(--sunk))}.mcchip svg{width:12px;height:12px}",
".mcchip.bad{background:var(--bad-soft);color:var(--bad)}",
".mced-wrap{display:grid;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff}",
".mced-wrap:focus-within{border-color:var(--glow);box-shadow:0 0 0 3px var(--glow-soft)}",
".mctb{display:flex;flex-wrap:wrap;gap:2px;padding:5px;background:var(--panel-solid,var(--sunk));border-bottom:1px solid var(--line)}",
".mctb button{border:0;background:none;border-radius:8px;padding:4px 10px;min-height:32px;font-size:13px;color:var(--ink-2);white-space:nowrap}",
".mctb button:hover{background:var(--hover,var(--sunk));color:var(--ink)}",
".mctb .tsep{width:1px;background:var(--line);margin:4px 4px;flex:none}",
".mclink{display:flex;gap:6px;padding:6px;background:var(--panel-solid,var(--sunk));border-bottom:1px solid var(--line)}",
".mced{min-height:260px;max-height:48vh;overflow-y:auto;padding:16px 18px;background:#fff;color:#1b2420;outline:none;overflow-wrap:anywhere;font-size:14.5px;line-height:1.55}",
".mced{overflow-x:auto}",
".mced.small{min-height:110px;border:1px solid var(--line);border-radius:12px}",
".mced.small:focus{border-color:var(--glow)}",
".mced blockquote{margin:6px 0 6px 4px;padding-left:10px;border-left:3px solid #dcdfd8;color:#56605a}",
".mced img{max-width:100%;height:auto}",
".mced table{width:auto;font-size:inherit}",
".mced td,.mced th{padding:revert;border-bottom:0;vertical-align:revert}",
".mced a{color:#2c6e8f}",
".mced .qh{color:#56605a;font-size:13px}",
".mcsig{border:1px dashed var(--line);border-radius:12px;padding:10px;display:grid;gap:8px}",
".mcd .foot .mcsend-bot{min-height:40px;padding:0 18px;font-size:14px}",
".mcsend-bot .kbd{background:transparent;border-color:currentColor;color:inherit;opacity:.55;margin-left:2px}",
".mcdrop{display:none}",
"#mcompose.dragover .mcdrop{display:grid;place-items:center;position:absolute;inset:8px;border:2px dashed var(--glow);border-radius:14px;background:var(--glow-soft);color:var(--glow-ink);font-weight:700;font-size:18px;z-index:3;pointer-events:none}",
".mcac{position:absolute;z-index:4;background:var(--panel-solid,var(--panel));border:1px solid var(--line-2,var(--line));border-radius:12px;box-shadow:var(--shadow-pop);padding:4px;display:grid;max-width:calc(100% - 20px)}",
".mcac button{border:0;background:none;text-align:left;padding:8px 10px;min-height:38px;border-radius:8px;font-size:13.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
".mcac button[aria-selected=true],.mcac button:hover{background:var(--hover,var(--sunk))}",
".att.bad{border-color:var(--bad);color:var(--bad)}",
"@media (max-width:900px){",
"  #mcompose{padding:0;place-items:stretch}",
"  #mcompose .mcd{width:100%;max-width:none;max-height:100%;height:100%;border-radius:0;border:0;padding:calc(10px + env(safe-area-inset-top,0px)) 14px calc(14px + env(safe-area-inset-bottom,0px));animation:none}",
"  #mcompose .mcd:before{display:none}",
"  .mchead .mcx{order:-1;width:44px;height:44px;border-radius:50%}",
"  .mchead h2{font-size:17px}",
"  #mcSaved{display:none}",
"  .mcsend-top{display:inline-flex;min-height:44px;padding:0 18px;border-radius:99px;font-size:15px}",
"  .mcd .foot .mcsend-bot{display:none}",
"  #mcompose .foot{background:var(--panel-solid,var(--panel))}",
"  #mcompose .foot .btn.icon{flex:none;width:46px;padding:0;justify-content:center}",
"  .mced{min-height:42vh;max-height:none}",
"  .mcf{grid-template-columns:50px minmax(0,1fr) auto}",
"  .mcin{min-height:46px}",
"  .mcchip{min-height:32px;font-size:14px}.mcchip button{width:30px;height:30px}",
"  .mctb{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.mctb::-webkit-scrollbar{display:none}.mctb button{flex:none;min-height:38px}",
"}"
].join("\n"));
})();
