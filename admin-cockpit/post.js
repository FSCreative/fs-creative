/* Postfach: Konten, Ordner, Liste + Lesebereich, gelesen/Stern, verschieben, Spam, Papierkorb mit Rückgängig, Mehrfachauswahl.
   Verfassen + Postausgang: post-compose.js · Beleg, To-Do, Termin, Druck, Kontextmenü, Tastatur, Wischen: post-extra.js
   Gemeinsamer Zustand liegt in FSC.M (die post-*.js-Dateien werden vor dieser Datei geladen, Aufrufe passieren erst zur Laufzeit). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
var M=F.M=F.M||{};

/* ---------- Symbole ---------- */
var IC={
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  draft:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 15h6"/>',
  outbox:'<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
  sent:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  spam:'<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  trash:'<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  cloud:'<path d="M7 18.5h10.5a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.3 10.6 4 4 0 0 0 7 18.5z"/>',
  reply:'<polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  replyall:'<polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/>',
  forward:'<polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>',
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  mailopen:'<path d="M3 9l9-6 9 6v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m3 9 9 6 9-6"/>',
  todo:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  print:'<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  ext:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  restore:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  clip:'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  back:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  inboxin:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  keys:'<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  down:'<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  pay:'<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  inv:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  board:'<rect x="3.5" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="16.5" y="4" width="4" height="7" rx="1.5"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',
  check:'<path d="m5 12 5 5 9-10"/>',
  archive:'<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><path d="M12 16.5h.01"/>',
  plug:'<path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
  spark:'<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  swipe:'<path d="M4 12h16"/><path d="m8 8-4 4 4 4"/><path d="m16 8 4 4-4 4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  filter:'<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
  send:'<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'
};
Object.keys(IC).forEach(function(k){ F.icons["m_"+k]=IC[k]; });
/* Gemeinsame Cockpit-Symbole (core.js, gleicher Strich) bevorzugen, sonst die eigenen von oben */
var CIC={inbox:"inbox",trash:"trash",star:"star",reply:"reply",replyall:"replyAll",forward:"forward",clip:"clip",mailopen:"mailOpen",cloud:"cloud",refresh:"refresh",edit:"edit",ext:"external",down:"download",print:"printer",archive:"archive",alert:"alertCircle",plug:"plug",spark:"sparkle",plus:"plus",filter:"filter",send:"send"};
function icPath(n){ var c=CIC[n]; return (c&&F.icons[c])||IC[n]||F.icons[n]||""; }
M.ic=function(n){ if(n==="starfill") return '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true">'+icPath("star")+'</svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icPath(n)+'</svg>'; };
var ic=M.ic;

/* ---------- Ordner-Erkennung ---------- */
var TRASHRX=/trash|papierkorb|deleted|gelösch|geloesch/i, SPAMRX=/junk|spam/i, SENTRX=/sent|gesendet|ausgang|outbox/i, DRAFTRX=/draft|entw[uü]rf/i;
M.RX={trash:TRASHRX,spam:SPAMRX,sent:SENTRX,draft:DRAFTRX};
function isTrashed(m){ return !!m.deleted||TRASHRX.test(m.folder||""); }
function isSent(m){ return !m.deleted&&SENTRX.test(m.folder||""); }
function isSpam(m){ return !m.deleted&&SPAMRX.test(m.folder||""); }
function isDraftBox(m){ return !m.deleted&&DRAFTRX.test(m.folder||""); }
function isHidden(m){ return isTrashed(m)||isSpam(m)||isSent(m)||DRAFTRX.test(m.folder||""); }
M.isTrashed=isTrashed; M.isSent=isSent; M.isSpam=isSpam; M.isDraftBox=isDraftBox; M.isHidden=isHidden;

/* ---------- Zustand ---------- */
var S=M.store={accounts:[],folders:[],messages:[],account:"",fetchedAt:null,full:false,fullAt:0,loading:false,err:"",ver:0};
var OV=M.ov={};            // lokale Änderungen, bis der Server sie bestätigt (max. 10 Min.)
var OV_TTL=600000;
/* „Ältere Mails laden“ (Simon 29.10.2026): Der Abruf bringt je Ordner nur die neuesten Mails (plus alle ungelesenen) – ältere holt der Knopf
   am Listenende nach (nur Kopfzeilen, Inhalt beim Öffnen). Sie bleiben bis zum Neuladen der Seite, solange der Abruf sie nicht selbst liefert. */
S.older=[]; S.olderN={}; S.olderBusy=false;
M.local=M.local||[];       // lokale Kopien gesendeter Mails, bis die Server-Kopie im Gesendet-Ordner auftaucht
if(!UI.mf) UI.mf="inbox";
if(!UI.macct) UI.macct="all";
UI.mfilt=UI.mfilt||"all"; UI.mq=UI.mq||""; UI.mpick=UI.mpick||{}; UI.mshow=UI.mshow||150;

/* ---------- Konten ---------- */
var ACC_TONES=["info","glow","ok","warn","bad"];
function accounts(){ return S.accounts.length?S.accounts:[{key:"fs",label:"FS Creative",user:S.account||"",primary:true,configured:true,ok:true}]; }
function primaryAcct(){ var a=accounts(); return (a.filter(function(x){return x.primary;})[0]||a[0]).key; }
function accOf(m){ return (m&&(m.account||(m.dr&&m.dr.account)||(m.ob&&m.ob.account)))||primaryAcct(); }
function accInfo(k){ return accounts().filter(function(x){return x.key===k;})[0]||{key:k,label:k,user:""}; }
function accTone(k){ var i=accounts().map(function(x){return x.key;}).indexOf(k); return ACC_TONES[(i<0?0:i)%ACC_TONES.length]; }
function multiAcc(){ return accounts().length>1; }
function acctOk(m){ return UI.macct==="all"||accOf(m)===UI.macct; }
function myAddrs(){ var o={}; accounts().forEach(function(a){ if(a.user) o[String(a.user).toLowerCase()]=1; }); if(S.account) o[String(S.account).toLowerCase()]=1; return o; }
function accWarn(a){ return a.configured===false?"Passwort fehlt – in den Einstellungen eintragen":(a.ok===false?("Anmeldung fehlgeschlagen"+(a.error?": "+a.error:"")):""); }
M.accounts=accounts; M.primaryAcct=primaryAcct; M.accOf=accOf; M.accInfo=accInfo; M.accTone=accTone; M.multiAcc=multiAcc; M.myAddrs=myAddrs;

function folderName(path,acc){ var meta=S.folders.filter(function(f){ return f.path===path&&(!acc||(f.account||primaryAcct())===acc); })[0]; if(meta&&meta.name) return meta.name; if(path==="INBOX") return "Posteingang"; return String(path||"").split(/[\/.]/).pop(); }
M.folderName=folderName;
function spamPath(acc){ var f=S.folders.filter(function(x){ return (x.account||primaryAcct())===acc&&SPAMRX.test(x.path); })[0]; return f?f.path:"Junk"; }
M.sentPath=function(acc){ acc=acc||primaryAcct(); var f=S.folders.filter(function(x){ return (x.account||primaryAcct())===acc&&SENTRX.test(x.path)&&!/outbox|ausgang/i.test(x.path); })[0]; return f?f.path:"Sent"; };
function customFolders(onlyAcc){
  var map={};
  function skip(f){ return f==="INBOX"||TRASHRX.test(f)||SENTRX.test(f)||SPAMRX.test(f)||DRAFTRX.test(f); }
  S.messages.forEach(function(m){ if(m.deleted||m.local) return; var f=m.folder||"INBOX"; if(skip(f)) return; var ac=accOf(m); if(onlyAcc&&ac!==onlyAcc) return; var k=ac+"|"+f; if(!map[k]) map[k]={acc:ac,path:f,unread:0}; if(!m.read) map[k].unread++; });
  S.folders.forEach(function(fo){ if(skip(fo.path)) return; var ac=fo.account||primaryAcct(); if(onlyAcc&&ac!==onlyAcc) return; var k=ac+"|"+fo.path; if(!map[k]) map[k]={acc:ac,path:fo.path,unread:fo.unread||0}; });
  var order=accounts().map(function(x){return x.key;});
  var l=Object.keys(map).map(function(k){ var f=map[k], d=fdelim(f.acc,f.path), pp=fparts(f.acc,f.path), pre=/^INBOX[.\/]/.test(f.path)?"INBOX"+d:"";
    f.key=pp.map(function(x,i){ return folderName(pre+pp.slice(0,i+1).join(d),f.acc).toLowerCase(); }); return f; });
  return l.sort(function(a,b){ if(a.acc!==b.acc) return order.indexOf(a.acc)-order.indexOf(b.acc);
    for(var i=0;i<Math.min(a.key.length,b.key.length);i++){ var c=a.key[i].localeCompare(b.key[i],"de"); if(c) return c; } return a.key.length-b.key.length; });
}
/* Ordner-Hierarchie: bei Servern mit „INBOX.“-Namensraum ist INBOX die oberste Ebene */
function nsInbox(acc){ var l=S.folders.filter(function(f){ return (f.account||primaryAcct())===acc&&f.path!=="INBOX"; }); return l.length>0&&l.every(function(f){ return /^INBOX[.\/]/.test(f.path); }); }
function fparts(acc,path){ var d=fdelim(acc,path), p=String(path||""); if(p.indexOf("INBOX"+d)===0) p=p.slice(6); return p.split(d); }
function fdepth(acc,path){ return Math.min(fparts(acc,path).length-1,6); }
function fpathLabel(acc,path){ var d=fdelim(acc,path), parts=String(path||"").split(d), out=[];
  parts.forEach(function(x,i){ var pp=parts.slice(0,i+1).join(d); if(pp==="INBOX"&&(i<parts.length-1)&&nsInbox(acc)) return; out.push(folderName(pp,acc)); }); return out.join(" › "); }
function fparent(acc,path){ var d=fdelim(acc,path), i=path.lastIndexOf(d), p=i>-1?path.slice(0,i):""; return (p==="INBOX"&&nsInbox(acc))?"":p; }
function moveTargets(acc){ var out=[{path:"INBOX",name:"Posteingang"}]; customFolders(acc).forEach(function(f){ out.push({path:f.path,name:fpathLabel(acc,f.path)}); }); return out; }

/* ---------- Daten übernehmen ---------- */
// Vorschautext: CSS-Reste aus HTML-Mails entfernen (z. B. „body,table,td,a{-webkit-text-size-adjust:100%} …“)
function cleanPrev(t){ t=String(t||"").replace(/@import\s+(url\()?[^;)\s]*\)?;?/gi," ").replace(/@(font-face|media|charset|keyframes)[^{]*/gi," "); if(!/\{[^}]*[a-z-]+:[^}]*(\}|$)/i.test(t)) return t.replace(/\s+/g," ").trim(); return t.replace(/[^{}]{0,400}\{[^{}]*\}/g," ").replace(/[^{}]{0,400}\{[^}]*$/," ").replace(/^[^{}]*?[a-z-]+:[^;{}]+;[^{}]*\}/i," ").replace(/[{}]/g," ").replace(/\s+/g," ").trim(); }
function norm(m){ return {id:m.id,folder:m.folder||"INBOX",uid:m.uid,fromName:m.fromName||"",from:m.from||"",toName:m.toName||"",to:m.to||"",subject:m.subject||"",preview:cleanPrev(m.preview),body:m.body||m.preview||"",bodyHtml:!!m.bodyHtml,date:m.date||"",read:!!m.read,starred:!!m.starred,deleted:false,attachments:Array.isArray(m.attachments)?m.attachments:[],toList:m.toList||[],ccList:m.ccList||[],replyTo:m.replyTo||"",messageId:m.messageId||"",inReplyTo:m.inReplyTo||"",answered:!!m.answered,forwarded:!!m.forwarded,answeredAt:m.answeredAt||null,account:m.account||""}; }
function applyOv(m){
  var o=OV[m.id]; if(!o) return m;
  if(Date.now()-o.at>OV_TTL){ delete OV[m.id]; return m; }
  ["read","starred"].forEach(function(k){ if(k in o){ if(!!m[k]===!!o[k]) delete o[k]; else m[k]=o[k]; } });
  ["answered","forwarded","answeredAt"].forEach(function(k){ if(k in o){ if(m[k]) delete o[k]; else m[k]=o[k]; } });
  if("folder" in o){ if(m.folder===o.folder) delete o.folder; else m.folder=o.folder; }
  if("deleted" in o){ if(TRASHRX.test(m.folder)||!o.deleted) delete o.deleted; else { m.deleted=true; m.trashedAt=o.trashedAt; m.flushed=!!o.flushed; } }
  return m;
}
function liveLocals(server){
  M.local=M.local.filter(function(l){ return Date.now()-(l.localAt||0)<600000&&!server.some(function(x){ return SENTRX.test(x.folder||"")&&(x.subject||"")===(l.subject||"")&&(x.to||"").toLowerCase()===(l.to||"").toLowerCase(); }); });
  return M.local;
}
function ingest(d,full){
  if(!d||!Array.isArray(d.messages)) return;
  if(Array.isArray(d.accounts)&&d.accounts.length) S.accounts=d.accounts;
  if(d.account) S.account=d.account;
  if(full&&Array.isArray(d.folders)) S.folders=d.folders;
  if(full){ var ids={}; d.messages.concat(S.older).forEach(function(m){ ids[m.id]=1; }); Object.keys(OV).forEach(function(k){ if(!ids[k]) delete OV[k]; }); }
  /* Cockpit-Daten (max. 200 Mails) nur einmischen, wenn sie neuer sind als der volle Abruf – sonst kämen verschobene Mails mit alter ID zurück */
  if(!full&&S.full&&(!d.fetchedAt||!S.fetchedAt||Date.parse(d.fetchedAt)<=Date.parse(S.fetchedAt))){ M.changed(); return; }
  var inc=d.messages.map(norm), server;
  if(full||!S.full){ server=inc; if(full){ S.full=true; S.fullAt=Date.now(); } }
  else { var idx={}; server=S.messages.filter(function(m){return !m.local;}).map(function(m,i){ idx[m.id]=i; return m; }); inc.forEach(function(m){ if(idx[m.id]!=null) server[idx[m.id]]=m; else server.push(m); }); }
  if(d.fetchedAt) S.fetchedAt=d.fetchedAt;
  S.messages=server.map(function(m){ return m.local?m:applyOv(m); }).concat(liveLocals(server)).concat(olderKeep(server));
  M.changed();
}
function olderKeep(server){ var ids={}; server.forEach(function(m){ ids[m.id]=1; }); return S.older.filter(function(m){ return !ids[m.id]; }).map(applyOv); }
/* Ordner der aktuellen Ansicht mit älteren Mails am Server: before = kleinste UID des Blocks der neuesten Mails, rest = noch nicht nachgeladen */
function olderTargets(){
  var f=UI.mf, t=[]; if(UI.mq) return t;
  var each=function(fn){ accounts().forEach(function(a){ if(UI.macct==="all"||UI.macct===a.key) t.push({acc:a.key,path:fn(a.key)}); }); };
  if(f==="inbox") each(function(){ return "INBOX"; }); else if(f==="sent") each(M.sentPath); else if(f.indexOf("f:")===0) t.push(parseFolderKey(f));
  return t.map(function(x){ var fo=S.folders.filter(function(y){ return y.path===x.path&&(y.account||primaryAcct())===x.acc; })[0], k=x.acc+"|"+x.path;
    return fo&&fo.before&&fo.older>0?{acc:x.acc,path:x.path,key:k,before:fo.before,n:S.olderN[k]||0,rest:Math.max(0,fo.older-(S.olderN[k]||0))}:null; }).filter(function(x){ return x&&x.rest>0; });
}
function olderBtn(){ var ts=olderTargets(); if(!ts.length) return ""; var rest=ts.reduce(function(a,x){ return a+x.rest; },0);
  return '<button type="button" class="more" data-act="molder"'+(S.olderBusy?" disabled":"")+'>'+(S.olderBusy?'<span class="spin"></span> Lade ältere Mails …':'Ältere Mails laden <span class="mu">· noch '+rest.toLocaleString("de-AT")+' am Server</span>')+'</button>'; }
/* je Ordner alles ab dem Block neu holen (bisher nachgeladene + 50) – so entsteht keine Lücke, wenn inzwischen neue Mails dazukamen */
F.action("molder",function(){
  var ts=olderTargets(); if(!ts.length||S.olderBusy) return; S.olderBusy=true; M.refresh();
  Promise.all(ts.map(function(t){ var lim=Math.min(500,t.n+50);
    return F.api("/admin/api/mail-older?account="+encodeURIComponent(t.acc)+"&folder="+encodeURIComponent(t.path)+"&before="+encodeURIComponent(t.before)+"&limit="+lim).then(function(j){
      if(!j||!j.ok||!Array.isArray(j.messages)) return (j&&j.error)||"Fehler";
      var got=j.messages.map(function(m){ var x=norm(m); x.lite=!!m.lite; return x; });
      S.older=S.older.filter(function(m){ return !(accOf(m)===t.acc&&m.olderOf===t.path); }).concat(got.map(function(x){ x.olderOf=t.path; return x; }));
      S.olderN[t.key]=got.length; return ""; }); }))
  .then(function(errs){ var e=errs.filter(Boolean)[0]; if(e) F.toast("Ältere Mails: "+e,true); }, function(){ F.toast("Ältere Mails konnten nicht geladen werden – keine Verbindung",true); })
  .then(function(){ S.olderBusy=false; var srv=S.messages.filter(function(m){ return !m.olderOf; }); S.messages=srv.concat(olderKeep(srv.filter(function(m){ return !m.local; }))); UI.mshow=Math.max(UI.mshow||150,baseView().length); M.changed(); M.refresh(); });
});
/* Nach jeder lokalen Änderung: andere Module (Heute, Zähler) sehen denselben Stand */
M.changed=function(){
  S.ver++;
  if(F.D&&F.D.mail){ F.D.mail.messages=S.messages.filter(function(m){ return !m.deleted&&!m.local; }); if(S.accounts.length) F.D.mail.accounts=S.accounts; }
};
M.setOv=function(m,fields){ Object.assign(m,fields); if(m.local) return; OV[m.id]=Object.assign(OV[m.id]||{},fields,{at:Date.now()}); };
M.refresh=function(){ if(F.current==="post") F.render(); else F.renderNav(); (M.refreshHooks||[]).forEach(function(h){ try{ h(); }catch(e){} }); };
/* Zustand des Mail-Dienstes: meldet der Server „alter Stand“/Fehler (stale/error), merken – mit Zeitpunkt, damit der neuere Abruf gewinnt */
function srvFlags(md){ if(md&&("stale" in md||"error" in md)) S.srvFlag={stale:!!md.stale,error:typeof md.error==="string"?md.error:"",at:Date.now()}; }
M.loadFull=function(){
  if(M._lf) return M._lf; S.loading=true;
  M._lf=F.api("/admin/api/mail?fresh=1").then(function(md){
    var d={mail:md}; S.loading=false; M._lf=null;
    if(md&&Array.isArray(md.messages)){ S.err=""; S.etag=md.etag||""; srvFlags(md); ingest(md,true);
      /* Der Server puffert den Abruf ~20 s: solange Verschiebungen noch nicht sichtbar sind, später erneut laden */
      if(Object.keys(OV).some(function(k){ return "folder" in OV[k]; })) M.scheduleReload(12000); }
    else S.err=md&&md.error==="mail_not_available"?"Der Mail-Dienst antwortet gerade nicht.":"Postfach konnte nicht geladen werden.";
    M.refresh(); return d;
  }).catch(function(){ S.loading=false; M._lf=null; S.err="Keine Verbindung zum Server."; M.refresh(); });
  return M._lf;
};
/* Alle 10 s nur den ETag prüfen (billig); bei Änderung den neuen Stand übernehmen */
var POLL_BUSY=false;
setInterval(function(){
  if(POLL_BUSY||document.hidden||!S.full||M._lf||UNDO.timer) return;
  POLL_BUSY=true;
  F.api("/admin/api/mail?etag="+encodeURIComponent(S.etag||"")).then(function(md){
    POLL_BUSY=false;
    if(md&&!md.same&&Array.isArray(md.messages)){ S.etag=md.etag||""; srvFlags(md); ingest(md,true); M.refresh(); }
  }).catch(function(){ POLL_BUSY=false; });
},10000);
document.addEventListener("visibilitychange",function(){ if(!document.hidden&&S.full&&Date.now()-S.fullAt>10000) M.loadFull(); });
var relT=null;
M.scheduleReload=function(ms){ clearTimeout(relT); relT=setTimeout(function(){ M.loadFull(); },ms||4000); };
F.onData(function(d){ if(d&&d.mail) ingest(d.mail,false); if(F.current==="post"&&Date.now()-S.fullAt>55000) setTimeout(M.loadFull,50); });

/* ---------- Server-Aktionen ---------- */
function pendingMove(m){ return !!(OV[m.id]&&("folder" in OV[m.id])); }
function items(msgs){ return msgs.filter(function(m){ return m&&m.uid!=null&&!m.local&&!pendingMove(m); }).map(function(m){ return {folder:m.folder||"INBOX",uid:m.uid,account:accOf(m)}; }); }
M.items=items;
M.action=function(op,msgs,target){
  var it=items(msgs);
  if(msgs.some(function(m){ return m&&pendingMove(m); })){ F.toast("Die Mail wird am Server noch verschoben – gleich nochmal versuchen",true); M.scheduleReload(1500); }
  if(!it.length) return Promise.resolve(true);
  var body={op:op,items:it}; if(target) body.target=target;
  return F.api("/admin/api/mail-action",{body:body}).then(function(j){
    if(!j||j.ok===false||j.error){ F.toast("Mailserver: Aktion fehlgeschlagen"+(j&&(j.detail||j.error)?" ("+String(j.detail||j.error).slice(0,80)+")":""),true); return false; }
    return true;
  }).catch(function(){ F.toast("Keine Verbindung zum Mailserver – Änderung evtl. nicht gespeichert",true); return false; });
};

/* ---------- Zählen, Ansichten ---------- */
function find(id){ for(var i=0;i<S.messages.length;i++) if(S.messages[i].id===id) return S.messages[i]; var x=UI.msr&&UI.msr.list; if(x) for(var j=0;j<x.length;j++) if(x[j].id===id) return x[j]; return null; }
M.find=find;
function inboxUnread(k){ return S.messages.filter(function(m){ return !isHidden(m)&&(m.folder||"INBOX")==="INBOX"&&!m.read&&!m.local&&(!k||k==="all"||accOf(m)===k); }).length; }
M.inboxUnread=inboxUnread;
function counts(){ var a=S.messages.filter(acctOk), live=a.filter(function(m){return !isHidden(m);});
  return {inboxUnread:live.filter(function(m){return (m.folder||"INBOX")==="INBOX"&&!m.read;}).length,
    unread:live.filter(function(m){return !m.read;}).length,
    spam:a.filter(isSpam).length,
    drafts:(M.draftItems?M.draftItems().length:0)+a.filter(isDraftBox).length}; }
function parseFolderKey(f){ var rest=f.slice(2), bar=rest.indexOf("|"); return {acc:bar>-1?rest.slice(0,bar):primaryAcct(),path:bar>-1?rest.slice(bar+1):rest}; }
M.folderKeyOf=function(m){ if(isTrashed(m)) return "trash"; if(isSpam(m)) return "spam"; if(isSent(m)) return "sent"; if(isDraftBox(m)) return "drafts"; if((m.folder||"INBOX")==="INBOX") return "inbox"; return "f:"+accOf(m)+"|"+m.folder; };
function msgKey(x){ x=String(x||"").trim().toLowerCase(); var mm=x.match(/<[^>]+>/); return mm?mm[0]:x; }
var RIDX=null, RIDX_V=-1;
function replyIdx(){ if(RIDX&&RIDX_V===S.ver) return RIDX; RIDX={}; RIDX_V=S.ver;
  S.messages.forEach(function(x){ if(x.deleted||!x.inReplyTo||!isSent(x)) return; var k=msgKey(x.inReplyTo), c=RIDX[k]; if(!c||new Date(x.date)>new Date(c.date)) RIDX[k]=x; }); return RIDX; }
function replyState(m){ if(!m||m.outbox||m.draftLocal||isSent(m)) return null;
  var r=m.messageId?replyIdx()[msgKey(m.messageId)]:null, ans=!!(r||m.answered), fwd=!!m.forwarded; if(!ans&&!fwd) return null;
  return {ans:ans,fwd:fwd,date:r?r.date:(m.answeredAt||null),sid:r?r.id:null}; }
M.replyState=replyState;
/* ---------- Unterhaltungen (Wunsch Simon 20.10.2026): Mails zu einem Thema zusammen – Antwortkette (Message-ID/In-Reply-To),
   sonst gleicher Betreff (ohne Re/AW/WG) mit derselben Gegenseite innerhalb von 120 Tagen. Gesendete Antworten gehören dazu. ---------- */
UI.mthreads=UI.mthreads!=null?UI.mthreads:(F.ls("fsc_mthreads")!==false); UI.mthShow=UI.mthShow||{};
var THR=null, THR_V=-1;
function subjNorm(x){ return String(x||"").replace(/^(\s*((re|aw|wg|fw|fwd|antw|antwort|tr|r)\s*(\[\d+\]|\(\d+\))?\s*:\s*)|\s*\[[^\]]{1,40}\]\s*)+/i,"").replace(/\s+/g," ").trim().toLowerCase(); }
function partnerOf(m){ var raw=String(isSent(m)?(m.to||""):(m.from||"")).toLowerCase(); return (raw.match(/[^\s<>,;"]+@[^\s<>,;"]+/)||[raw])[0]; }
function threads(){ if(THR&&THR_V===S.ver) return THR; THR_V=S.ver;
  var all=S.messages.filter(function(m){ return !m.deleted&&!isSpam(m)&&!isDraftBox(m)&&!m.outbox&&!m.draftLocal&&m.id; }), par={};
  var fnd=function(x){ while(par[x]!==x){ par[x]=par[par[x]]; x=par[x]; } return x; }, uni=function(a,b){ a=fnd(a); b=fnd(b); if(a!==b) par[b]=a; };
  all.forEach(function(m){ par[m.id]=m.id; });
  var byMid={}; all.forEach(function(m){ if(m.messageId) byMid[msgKey(m.messageId)]=m.id; });
  all.forEach(function(m){ var p=m.inReplyTo&&byMid[msgKey(m.inReplyTo)]; if(p&&p!==m.id) uni(p,m.id); });
  var bySub={}; all.forEach(function(m){ var sj=subjNorm(m.subject); if(sj.length<4) return; var k=sj+"|"+partnerOf(m), f=bySub[k];
    if(!f) bySub[k]={id:m.id,d:new Date(m.date)}; else if(Math.abs(new Date(m.date)-f.d)<120*864e5) uni(f.id,m.id); });
  var groups={}, key={}; all.forEach(function(m){ var r=fnd(m.id); (groups[r]=groups[r]||[]).push(m); key[m.id]=r; });
  Object.keys(groups).forEach(function(r){ groups[r].sort(function(a,b){ return new Date(b.date)-new Date(a.date); }); });
  THR={key:key,groups:groups}; return THR; }
function threadOf(m){ if(!m) return []; var t=threads(), r=t.key[m.id]; return r?t.groups[r]:[m]; }
function threadKey(m){ return m?threads().key[m.id]||m.id:""; }
function threadingOn(){ return !!UI.mthreads&&!UI.mq&&["sent","trash","spam","drafts","outbox"].indexOf(UI.mf)<0; }
M.threadOf=threadOf;
/* Zitierten Verlauf in Antworten einklappen (sonst steht jede ältere Mail nochmal im Text) – nur bei Antworten, nie bei Weiterleitungen */
function isReplyMail(m){ return !!m.inReplyTo||/^\s*(re|aw|antw|antwort)\s*:/i.test(m.subject||""); }
var QSEL='div.gmail_quote,blockquote[type="cite"],#appendonsend,#divRplyFwdMsg,div.OutlookMessageHeader,#mail-editor-reference-message-container,.moz-cite-prefix,div[name="messageReplySection"],.yahoo_quoted,div.protonmail_quote';
var QRX=/^\s*(-{2,}\s*(Original Message|Ursprüngliche Nachricht|Originalnachricht)\s*-{2,}|Am .{4,140}schrieb.{0,120}:\s*$|On .{4,180}wrote:\s*$|Von:\s.+(Gesendet|Datum):)/i;
function quoteHtml(html,m){ if(!isReplyMail(m)||!window.DOMParser||!html) return html;
  try{ var d=new DOMParser().parseFromString(String(html),"text/html"), q=d.body.querySelector(QSEL);
    if(!q){ var w=d.createTreeWalker(d.body,NodeFilter.SHOW_TEXT,null), n; while((n=w.nextNode())){ if(QRX.test(n.nodeValue||"")){ q=n.parentNode.closest?n.parentNode.closest("p,div,span,font")||n.parentNode:n.parentNode; break; } } }
    if(!q||q===d.body) return html;
    var start=q; while(start.parentNode&&start.parentNode!==d.body&&!start.previousSibling&&!start.nextSibling) start=start.parentNode;
    if(start.previousElementSibling&&start.previousElementSibling.tagName==="HR") start=start.previousElementSibling;
    if(!start.parentNode) return html;
    var det=d.createElement("details"); det.className="fsq"; var sm=d.createElement("summary"); sm.textContent="··· Verlauf anzeigen"; det.appendChild(sm);
    var nodes=[], x=start; while(x){ nodes.push(x); x=x.nextSibling; }
    start.parentNode.insertBefore(det,start); nodes.forEach(function(y){ det.appendChild(y); });
    if(!(d.body.textContent||"").replace(det.textContent||"","").trim()) return html;   /* nichts übrig → doch alles zeigen */
    return d.documentElement.outerHTML; }catch(e){ return html; } }
function quoteText(t,m){ t=String(t||""); if(!isReplyMail(m)) return linkify(t);
  var L=t.split(/\r?\n/), i=-1; for(var k=1;k<L.length;k++){ if(QRX.test(L[k])||(/^\s*>/.test(L[k])&&/^\s*>/.test(L[k+1]||""))){ i=k; break; } }
  if(i<1||!L.slice(0,i).join("").trim()) return linkify(t);
  return linkify(L.slice(0,i).join("\n").replace(/\s+$/,""))+'<details class="mq"><summary>··· Verlauf anzeigen</summary><div>'+linkify(L.slice(i).join("\n"))+'</div></details>'; }
M.quoteHtml=quoteHtml; M.quoteText=quoteText;
function baseView(){
  var a=S.messages.slice(), f=UI.mf, list;
  if(f==="outbox") list=M.obItems?M.obItems():[];
  else if(f==="drafts") list=(M.draftItems?M.draftItems():[]).concat(a.filter(isDraftBox));
  else if(f==="trash") list=a.filter(isTrashed);
  else if(f==="sent") list=a.filter(isSent);
  else if(f==="spam") list=a.filter(isSpam);
  else if(f.indexOf("f:")===0){ var p=parseFolderKey(f); list=a.filter(function(m){ return (m.folder||"INBOX")===p.path&&accOf(m)===p.acc&&!m.deleted; }); }
  else { a=a.filter(function(m){return !isHidden(m);});
    if(f==="unread") list=a.filter(function(m){return !m.read;});
    else if(f==="starred") list=a.filter(function(m){return m.starred;});
    else list=a.filter(function(m){return (m.folder||"INBOX")==="INBOX";}); }
  if(f!=="outbox"&&f.indexOf("f:")!==0) list=list.filter(acctOk);
  if(UI.mq) list=searchList();
  return list;
}
/* ---------- Suche (Wunsch Simon 19.10.2026): alle Ordner, alle Wörter, Umlaute egal, Befehle, dazu Treffer direkt aus dem Postfach (auch ältere Mails, Volltext) ---------- */
function normS(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ß/g,"ss"); }
function parseMq(q){ var Q={words:[],from:[],to:[],subj:[],att:false,unread:false,star:false};
  String(q||"").replace(/(\w+):("([^"]*)"|\S+)|"([^"]*)"|(\S+)/g,function(m,op,v,vq,ph,w){
    if(op){ var val=(vq!=null?vq:v).trim(), o=op.toLowerCase(), nv=normS(val); if(!val) return m;
      if(/^(von|from|absender)$/.test(o)) Q.from.push(nv); else if(/^(an|to)$/.test(o)) Q.to.push(nv); else if(/^(betreff|subject)$/.test(o)) Q.subj.push(nv);
      else if(/^(hat|has)$/.test(o)&&/^(anhang|anhange|attachment)/.test(nv)) Q.att=true; else if(/^(ist|is)$/.test(o)&&/^(ungelesen|unread)$/.test(nv)) Q.unread=true; else if(/^(ist|is)$/.test(o)&&/^(markiert|starred)$/.test(nv)) Q.star=true; else Q.words.push(normS(m));
      return m; }
    var t=normS(ph!=null?ph:w).trim(); if(t) Q.words.push(t); return m; });
  return Q; }
M.parseMq=parseMq;
var STX={};
function stxOf(m){ var k=m.id+"|"+(m.body?m.body.length:0), c=STX[m.id]; if(c&&c.k===k) return c;
  c=STX[m.id]={k:k,from:normS((m.fromName||"")+" "+(m.from||"")),to:normS((m.toName||"")+" "+(m.to||"")+" "+(m.toList||[]).map(function(a){return (a.name||"")+" "+a.address;}).join(" ")+" "+(m.ccList||[]).map(function(a){return (a.name||"")+" "+a.address;}).join(" ")),subj:normS(m.subject),
    body:normS((m.preview||"")+" "+(m.bodyHtml?String(m.body||"").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&"):(m.body||""))+" "+(m.attachments||[]).map(function(a){return a.filename;}).join(" "))};
  return c; }
function mqMatch(m,Q){ var x=stxOf(m), all=x.from+" "+x.to+" "+x.subj+" "+x.body;
  if(Q.att&&!(m.attachments&&m.attachments.length)) return false; if(Q.unread&&m.read) return false; if(Q.star&&!m.starred) return false;
  for(var i=0;i<Q.words.length;i++) if(all.indexOf(Q.words[i])<0) return false;
  for(i=0;i<Q.from.length;i++) if(x.from.indexOf(Q.from[i])<0) return false;
  for(i=0;i<Q.to.length;i++) if(x.to.indexOf(Q.to[i])<0) return false;
  for(i=0;i<Q.subj.length;i++) if(x.subj.indexOf(Q.subj[i])<0) return false;
  return true; }
function searchList(){
  var Q=parseMq(UI.mq), f=UI.mf, inTrash=f==="trash", inSpam=f==="spam", seen={}, out=[];
  var keep=function(m){ return m&&!m.local&&!m.outbox&&acctOk(m)&&(inTrash?isTrashed(m):!isTrashed(m))&&(inSpam?isSpam(m):(inTrash||!isSpam(m))); };
  S.messages.forEach(function(m){ if(keep(m)&&mqMatch(m,Q)){ seen[m.id]=1; out.push(m); } });
  var sr=UI.msr; if(sr&&sr.q===UI.mq.trim()&&sr.list) sr.list.forEach(function(m){ if(!seen[m.id]&&keep(m)&&(!Q.att||(m.attachments&&m.attachments.length))&&(!Q.star||m.starred)){ seen[m.id]=1; out.push(m); } });
  return out;
}
// Server-Suche verzögert starten (nicht bei jedem Tastendruck)
var msrT=0;
function serverSearch(){
  clearTimeout(msrT); var q=String(UI.mq||"").trim(), Q=parseMq(q);
  if(!q||(!Q.words.some(function(w){return w.length>=2;})&&!Q.from.length&&!Q.to.length&&!Q.subj.length)){ UI.msr=null; return; }
  if(UI.msr&&UI.msr.q===q&&UI.msr.acc===UI.macct) return;
  UI.msr={q:q,acc:UI.macct,busy:true,list:null};
  msrT=setTimeout(function(){ F.api("/admin/api/mail-search?q="+encodeURIComponent(q)+"&account="+encodeURIComponent(UI.macct||"all")).then(function(j){
    if(!UI.msr||UI.msr.q!==q) return;
    UI.msr={q:q,acc:UI.macct,busy:false,list:j&&j.ok?(j.messages||[]):[],err:j&&j.ok?"":((j&&j.error)||"Suche im Postfach fehlgeschlagen"),partial:!!(j&&j.partial),took:j&&j.took};
    if(F.cur&&F.cur()!=="post") return; F.render(); }); },450); }
M.serverSearch=serverSearch; M.prevText=cleanPrev;
function searchInfo(list){ if(!UI.mq) return "";
  if(!UI.msr||UI.msr.q!==UI.mq.trim()||UI.msr.acc!==UI.macct) serverSearch();   // z. B. nach Kontowechsel neu im Postfach suchen
  var sr=UI.msr, n=list.length, more=sr&&sr.list?sr.list.filter(function(m){ return !S.messages.some(function(x){return x.id===m.id;}); }).length:0;
  return '<div class="msinfo">'+ic("search")+'<span><b>'+n+'</b> Treffer in allen Ordnern'+(UI.macct!=="all"&&multiAcc()?" ("+esc(accInfo(UI.macct).label)+")":"")+'</span>'+
    (sr&&sr.busy?'<span class="mu"><span class="spin"></span> durchsucht das ganze Postfach …</span>':sr&&sr.err?'<span class="bad-t">'+esc(sr.err)+'</span>':sr&&sr.list?'<span class="mu">Postfach durchsucht'+(more?" · "+more+" ältere dazu":"")+(sr.partial?" · nur teilweise (zu viele Ordner)":"")+'</span>':'<span class="mu">Tipp: von:, an:, betreff:, hat:anhang, ist:ungelesen</span>')+'</div>'; }
function hl(s){ var Q=UI.mq?parseMq(UI.mq):null, t=esc(s); if(!Q) return t; var ws=Q.words.concat(Q.from,Q.to,Q.subj).filter(function(w){return w.length>=2;}); if(!ws.length) return t;
  var src=String(s||""), ns=normS(src); if(ns.length!==src.length) return t;   // Umlaute zerlegt → Positionen stimmen nicht, dann ohne Markierung
  var marks=[]; ws.forEach(function(w){ var i=ns.indexOf(w); while(i>-1){ marks.push([i,i+w.length]); i=ns.indexOf(w,i+w.length); } });
  if(!marks.length) return t; marks.sort(function(a,b){return a[0]-b[0];}); var out="",p=0; marks.forEach(function(r){ if(r[0]<p) return; out+=esc(src.slice(p,r[0]))+"<mark>"+esc(src.slice(r[0],r[1]))+"</mark>"; p=r[1]; }); return out+esc(src.slice(p)); }
function isOpen(m){ var rs=replyState(m); return !m.outbox&&!m.draftLocal&&!isSent(m)&&!(rs&&rs.ans); }
function mailView(){
  var list=baseView(), flt=UI.mfilt||"all";
  if(flt==="unread") list=list.filter(function(m){return !m.read;});
  else if(flt==="star") list=list.filter(function(m){return m.starred;});
  else if(flt==="att") list=list.filter(function(m){return m.attachments&&m.attachments.length;});
  else if(flt==="open") list=list.filter(isOpen);
  list.sort(function(x,y){ return (new Date(y.date))-(new Date(x.date)); });
  if(threadingOn()){ var seen={}; list=list.filter(function(m){ if(m.outbox||m.draftLocal) return true; var k=threadKey(m); if(seen[k]) return false; seen[k]=1; return true; }); }   /* je Unterhaltung nur die neueste */
  return list;
}
M.viewIds=function(){ return mailView().map(function(m){return m.id;}); };
M.selectedIds=function(){ return Object.keys(UI.mpick).filter(function(id){ return UI.mpick[id]&&find(id); }); };
function neighborId(ids){ var list=M.viewIds(), i=list.indexOf(UI.msel); if(i<0) return null; for(var k=i+1;k<list.length;k++) if(ids.indexOf(list[k])<0) return list[k]; for(var k2=i-1;k2>=0;k2--) if(ids.indexOf(list[k2])<0) return list[k2]; return null; }

/* ---------- Formatierung ---------- */
function fmtMailDate(iso){ var d=new Date(iso); if(isNaN(d)) return ""; var n=new Date(); if(d.toDateString()===n.toDateString()) return d.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); if(d.getFullYear()===n.getFullYear()) return d.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"}); return d.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit",year:"2-digit"}); }
M.fmtMailDate=fmtMailDate;
function relTime(d){ d=new Date(d); if(isNaN(d)) return ""; var s=(Date.now()-d.getTime())/1000; if(s<60) return "gerade eben"; if(s<3600) return "vor "+Math.round(s/60)+" Min."; if(s<86400) return "vor "+Math.round(s/3600)+" Std."; var dd=Math.round(s/86400); if(dd<31) return "vor "+dd+(dd===1?" Tag":" Tagen"); return ""; }
function grpLabel(d){ d=new Date(d); if(isNaN(d)) return "Ohne Datum"; var t=new Date(); t.setHours(0,0,0,0); var x=new Date(d); x.setHours(0,0,0,0); var diff=Math.round((t-x)/86400000);
  if(diff<=0) return "Heute"; if(diff===1) return "Gestern"; var wd=(t.getDay()+6)%7; if(diff<=wd) return "Diese Woche"; if(diff<=wd+7) return "Letzte Woche";
  if(x.getMonth()===t.getMonth()&&x.getFullYear()===t.getFullYear()) return "Diesen Monat"; return x.toLocaleDateString("de-AT",{month:"long",year:"numeric"}); }
function fmtBytes(n){ n=+n||0; if(n<1024) return n+" B"; if(n<1048576) return (n/1024).toFixed(0)+" KB"; return (n/1048576).toFixed(1)+" MB"; }
M.fmtBytes=fmtBytes;
var AV_TONES=["info","glow","ok","warn","bad"];
function avTone(s){ s=String(s||"?"); var h=0; for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return AV_TONES[h%AV_TONES.length]; }
function initials(n,a){ var s=String(n||a||"?").trim(); if(!n&&s.indexOf("@")>-1) return s.charAt(0).toUpperCase(); var p=s.replace(/[",<>]/g,"").split(/\s+/).filter(Boolean); return (((p[0]||"?").charAt(0))+((p[1]||"").charAt(0))).toUpperCase(); }
function av(name,addr,cls,attrs,inner){ var t=avTone(name||addr); return '<span class="mav '+(cls||"")+'" style="background:var(--'+t+'-soft);color:var(--'+t+')"'+(attrs||"")+'><span class="i">'+esc(initials(name,addr))+'</span>'+(inner||"")+'</span>'; }
M.av=av;
function accPill(m){ if(!multiAcc()||UI.macct!=="all"||m.outbox||m.draftLocal) return ""; var k=accOf(m), t=accTone(k); return '<span class="accpill" style="background:var(--'+t+'-soft);color:var(--'+t+')">'+esc(accInfo(k).label)+'</span>'; }
function linkify(s){ return esc(s).replace(/https?:\/\/[^\s<>"')]+/g,function(u){ return '<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+u+'</a>'; }); }
M.attHref=function(m,a){ return "/admin/api/mail-attachment?folder="+encodeURIComponent(m.folder||"INBOX")+"&uid="+encodeURIComponent(m.uid)+"&index="+encodeURIComponent(a.index||0)+"&account="+encodeURIComponent(accOf(m)); };
M.isVoucherAtt=function(a){ return /\.(pdf|png|jpe?g|xml)$/i.test(a.filename||"")||/pdf|image\/(png|jpe?g)|xml/i.test(a.contentType||""); };
M.voucherSent=function(m,a){ var sk=F.ls("fsc_sev_sent")||{}; return sk[m.id+"#"+(a.index||0)]||null; };
function attIconTxt(a){ var ct=String(a.contentType||"")+" "+String(a.filename||""); ct=ct.toLowerCase(); if(/pdf/.test(ct)) return "PDF"; if(/image|\.png|\.jpe?g|\.gif|\.webp|\.heic/.test(ct)) return "Bild"; if(/zip|compress/.test(ct)) return "ZIP"; if(/word|document|\.docx?/.test(ct)) return "DOC"; if(/sheet|excel|csv|\.xlsx?/.test(ct)) return "XLS"; return "Datei"; }
M.attIconTxt=attIconTxt;

/* ---------- Ordner-Spalte ---------- */
function fb(key,icon,label,cnt,opts){ opts=opts||{};
  return '<button type="button" class="fbtn'+(opts.cls?" "+opts.cls:"")+'" data-act="mfolder:'+esc(key)+'"'+(opts.drop?' data-drop="'+esc(opts.drop)+'"':'')+(opts.fdrag?' draggable="true" data-fdrag="'+esc(opts.fdrag)+'"':'')+(opts.depth?' style="padding-left:'+(9+opts.depth*14)+'px"':'')+(UI.mf===key?' aria-current="true"':'')+' title="'+esc(label)+'">'+ic(icon)+'<span class="fl">'+esc(label)+'</span>'+(cnt?'<span class="n'+(opts.hot?" hot":"")+'">'+cnt+'</span>':'')+'</button>'; }
function folderPanel(o){
  o=o||{}; var c=counts(), h="";
  if(multiAcc()){
    var ab=function(k,label,sub,tone,warn){ var n=inboxUnread(k); return '<button type="button" class="accbtn" data-act="macct:'+esc(k)+'"'+(UI.macct===k?' aria-current="true"':'')+' title="'+esc(sub||label)+'"><span class="adot" style="background:var(--'+tone+')"></span><span class="atx"><span class="atl">'+esc(label)+'</span>'+(sub?'<span class="atu">'+esc(sub)+'</span>':'')+'</span>'+(warn?'<span class="awarn" data-act="msettings:'+esc(k)+'" role="button" tabindex="0" title="'+esc(warn)+'" aria-label="'+esc(warn)+'">!</span>':'')+(n?'<span class="n hot">'+n+'</span>':'')+'</button>'; };
    h+=(o.sheet?'<div class="fdiv">Konto</div>':'')+'<div class="accsw'+(o.sheet?" accseg":"")+'">'+ab("all","Alle Konten","","ink-3","")+accounts().map(function(a){ return ab(a.key,a.label||a.key,a.user,accTone(a.key),accWarn(a)); }).join("")+'</div>';
  }
  var ob=M.outbox?M.outbox():[];
  if(o.sheet&&multiAcc()) h+='<div class="fdiv">Postfach</div>';
  h+=fb("inbox","inbox","Posteingang",c.inboxUnread,{hot:true,drop:"INBOX"})+fb("drafts","draft","Entwürfe",c.drafts)+
    fb("outbox","outbox","Postausgang",ob.length,{cls:ob.some(function(o){return o.status==="failed";})?"warn":"",hot:ob.length>0})+
    fb("sent","sent","Gesendet",0)+fb("spam","spam","Spam",c.spam,{drop:"__spam"})+fb("trash","trash","Papierkorb",0,{drop:"__trash"});
  var cf=customFolders(UI.macct!=="all"?UI.macct:null);
  if(cf.length){ var lastA=null; if(!multiAcc()||UI.macct!=="all") h+='<div class="fdiv" data-facc="'+esc(UI.macct!=="all"?UI.macct:primaryAcct())+'">Ordner</div>';
    cf.forEach(function(f){ if(multiAcc()&&UI.macct==="all"&&f.acc!==lastA){ h+='<div class="fdiv" data-facc="'+esc(f.acc)+'">Ordner · '+esc(accInfo(f.acc).label)+'</div>'; lastA=f.acc; }
      h+=fb("f:"+f.acc+"|"+f.path,"folder",folderName(f.path,f.acc),f.unread,{hot:f.unread>0,drop:f.acc+"|"+f.path,fdrag:fSpecial(f.acc,f.path)?"":f.acc+"|"+f.path,depth:fdepth(f.acc,f.path)}); }); }
  return h;
}
M.folderPanel=folderPanel;
var FNAMES={inbox:"Posteingang",drafts:"Entwürfe",outbox:"Postausgang",sent:"Gesendet",spam:"Spam",trash:"Papierkorb",unread:"Ungelesen",starred:"Markiert"};
function curFolderLabel(){ var f=UI.mf; if(FNAMES[f]) return FNAMES[f]; if(f.indexOf("f:")===0){ var p=parseFolderKey(f); return folderName(p.path,p.acc); } return f; }

/* ---------- Liste ---------- */
function rowHtml(m,o){ o=o||{};
  var sent=isSent(m)||!!m.outbox||!!m.draftLocal, nm=sent?m.toName:m.fromName, ad=sent?m.to:m.from;
  var who=sent?esc("An: ")+hl(m.toName||m.to||"—"):hl(m.fromName||m.from||"—");
  if(m.draftLocal) who='<span class="bad-t">Entwurf</span> · '+esc(m.to?("An: "+m.to):"(kein Empfänger)");
  if(m.outbox) who+=(m.ob.status==="failed"?' <span class="tag bad">Fehlgeschlagen</span>':' <span class="tag info">Wird gesendet</span>');
  var rs=replyState(m), ics="";
  if(rs&&rs.ans) ics+='<span title="Beantwortet'+(rs.date?" am "+esc(new Date(rs.date).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})):"")+'">'+ic("reply")+'</span>';
  if(rs&&rs.fwd) ics+='<span title="Weitergeleitet">'+ic("forward")+'</span>';
  if(m.attachments&&m.attachments.length) ics+='<span title="'+m.attachments.length+(m.attachments.length===1?" Anhang":" Anhänge")+'">'+ic("clip")+'</span>';
  var fl=UI.mq&&!m.outbox&&!m.draftLocal?'<span class="tag grey">'+esc(isTrashed(m)?"Papierkorb":isSent(m)?"Gesendet":(m.folder||"INBOX")==="INBOX"?"Posteingang":folderName(m.folder,accOf(m)))+'</span>':(UI.mf!=="inbox"&&UI.mf.indexOf("f:")!==0&&!m.outbox&&!m.draftLocal&&(m.folder||"INBOX")!=="INBOX"&&!isSent(m)&&!isTrashed(m)&&!isSpam(m))?'<span class="tag grey">'+esc(folderName(m.folder,accOf(m)))+'</span>':'';
  var canPick=!(m.outbox||m.draftLocal), picked=!!UI.mpick[m.id], qa="";
  if(canPick){
    if(isTrashed(m)) qa='<div class="mqa"><button type="button" data-act="mqa:restore|'+esc(m.id)+'" title="Wiederherstellen" aria-label="Wiederherstellen">'+ic("restore")+'</button><button type="button" class="dg" data-act="mqa:purge|'+esc(m.id)+'" title="Endgültig löschen" aria-label="Endgültig löschen">'+ic("trash")+'</button></div>';
    else qa='<div class="mqa"><button type="button" data-act="mqa:read|'+esc(m.id)+'" title="'+(m.read?"Als ungelesen (U)":"Als gelesen (U)")+'" aria-label="'+(m.read?"Als ungelesen":"Als gelesen")+'">'+ic(m.read?"mail":"mailopen")+'</button>'+
      (canArchive(m)?'<button type="button" data-act="mqa:archive|'+esc(m.id)+'" title="Archivieren (E)" aria-label="Archivieren">'+ic("archive")+'</button>':'')+
      '<button type="button" data-act="mqa:move|'+esc(m.id)+'" title="Verschieben (V)" aria-label="Verschieben">'+ic("folder")+'</button><button type="button" class="dg" data-act="mqa:trash|'+esc(m.id)+'" title="Löschen (#)" aria-label="Löschen">'+ic("trash")+'</button></div>';
  }
  var star=canPick?'<button type="button" class="star'+(m.starred?" on":"")+'" data-act="mstar:'+esc(m.id)+'" title="'+(m.starred?"Markierung entfernen (S)":"Markieren (S)")+'" aria-label="'+(m.starred?"Markierung entfernen":"Markieren")+'" aria-pressed="'+!!m.starred+'">'+ic(m.starred?"starfill":"star")+'</button>':'';
  var avBtn=canPick?av(nm,ad,"",' data-act="mpick:'+esc(m.id)+'" role="checkbox" aria-checked="'+picked+'" tabindex="0" title="Auswählen (X)"','<span class="ck">'+ic("check")+'</span>'):av(nm,ad);
  var thn=o.n>1?'<button type="button" class="thn'+(o.open?" on":"")+'" data-act="mthx:'+esc(m.id)+'" title="Unterhaltung mit '+o.n+' Mails '+(o.open?"zuklappen":"aufklappen")+'" aria-expanded="'+!!o.open+'">'+o.n+ic("chev")+'</button>':'';
  var whoT=m.draftLocal?"Entwurf":(sent?"An: ":"")+((nm&&ad&&nm!==ad)?nm+" <"+ad+">":(nm||ad||""));
  return '<div class="mrow2'+(m.read&&!o.unread?"":" unread")+(UI.msel===m.id?" sel":"")+(picked?" picked":"")+(isTrashed(m)?" trashed":"")+(o.child?" thc":"")+(o.open?" thopen":"")+'" data-mid="'+esc(m.id)+'" tabindex="0"'+(UI.msel===m.id?' aria-current="true"':'')+(canPick?' draggable="true"':'')+'>'+avBtn+
    '<div class="mm"><div class="l1"><span class="who" title="'+esc(whoT)+'">'+who+'</span>'+accPill(m)+'<span class="when" title="'+esc(m.date?new Date(m.date).toLocaleString("de-AT"):"")+'">'+esc(fmtMailDate(m.date))+'</span></div>'+
    '<div class="l2"><span class="subj" title="'+esc(m.subject||"")+'">'+hl(m.subject||"(kein Betreff)")+'</span>'+fl+thn+'<span class="ics">'+ics+'</span>'+star+'</div>'+
    (m.preview?'<div class="pre">'+esc(m.preview)+'</div>':'')+'</div>'+qa+'</div>';
}
function chipsHtml(list){
  var base=baseView(), f=UI.mf, cur=UI.mfilt||"all";
  var n={unread:base.filter(function(m){return !m.read;}).length,star:base.filter(function(m){return m.starred;}).length,att:base.filter(function(m){return m.attachments&&m.attachments.length;}).length,open:base.filter(isOpen).length};
  function chip(k,l,c,tt){ return '<button type="button" class="chip" data-act="mfilt:'+k+'" aria-pressed="'+(cur===k)+'"'+(tt?' title="'+tt+'" aria-label="'+tt+'"':'')+'>'+l+(c?' <span class="cn">'+c+'</span>':'')+'</button>'; }
  return chip("all","Alle")+chip("unread","Ungelesen",n.unread)+chip("star",'<span class="ci">'+ic("star")+'</span>',n.star,"Markiert")+chip("att",'<span class="ci">'+ic("clip")+'</span>',n.att,"Mit Anhang")+
    (f==="sent"||f==="outbox"||f==="drafts"?"":chip("open","Offen",n.open,"Noch nicht beantwortet"))+
    (thToggle()?'<button type="button" class="chip thchip" data-act="mthreads" aria-pressed="'+!!UI.mthreads+'" title="Mails eines Themas als Unterhaltung zusammenfassen (an/aus)" aria-label="Unterhaltungen zusammenfassen"><span class="ci">'+ic("replyall")+'</span></button>':'');
}
function thToggle(){ return !UI.mq&&["sent","trash","spam","drafts","outbox"].indexOf(UI.mf)<0;
}
/* Kopf der Mailliste (PC): Ordnername, Anzahl, Werkzeuge */
function listHead(list){
  var f=UI.mf, tools="", unread=list.filter(function(m){ return !m.read&&!m.outbox&&!m.draftLocal; }).length;
  if(f==="trash"&&list.length) tools='<button type="button" class="link bad-t" data-act="mempty">Papierkorb leeren</button>';
  else if(f==="spam"&&list.length) tools='<button type="button" class="link bad-t" data-act="mspamclear">Spam leeren</button>';
  var pickable=list.filter(function(m){ return !m.outbox&&!m.draftLocal; }).length;
  var t=UI.mq?"Suche":curFolderLabel()+(multiAcc()&&UI.macct!=="all"?" · "+accInfo(UI.macct).label:"");
  return '<div class="mlh"><div class="mlh-t"><b title="'+esc(t)+'">'+esc(t)+'</b><span>'+list.length+(list.length===1?" Mail":" Mails")+(unread?" · "+unread+" ungelesen":"")+'</span></div>'+tools+
    (pickable?'<button type="button" class="link" data-act="mbulk:all" title="Alle in dieser Liste auswählen">Alle auswählen</button>':'')+
    (thToggle()?'<button type="button" class="mlh-th" data-act="mthreads" aria-pressed="'+!!UI.mthreads+'" title="'+(UI.mthreads?"Unterhaltungen: an – Mails eines Themas sind zusammengefasst":"Unterhaltungen: aus – jede Mail einzeln")+'" aria-label="Unterhaltungen zusammenfassen">'+ic("replyall")+'</button>':'')+'</div>';
}
function emptyHtml(){
  var f=UI.mf, e=["inbox","Alles erledigt","Keine Nachrichten in dieser Ansicht. Neue Mails erscheinen hier von selbst."], act="";
  if(UI.mq){ e=["search","Nichts gefunden","Für „"+UI.mq+"“ gibt es keine Treffer. Tipp: von:, betreff:, hat:anhang"]; act='<button type="button" class="btn" data-act="msearchx">Suche leeren</button>'; }
  else if(UI.mfilt&&UI.mfilt!=="all"){ e=["inbox","Keine Treffer","Mit diesem Filter ist die Liste leer."]; act='<button type="button" class="btn" data-act="mfilt:all">Alle Mails zeigen</button>'; }
  else if(f==="drafts") e=["draft","Keine Entwürfe","Angefangene Mails werden hier automatisch gesichert."];
  else if(f==="outbox") e=["outbox","Postausgang leer","Alle Mails wurden versendet."];
  else if(f==="trash") e=["trash","Papierkorb ist leer","Gelöschte Mails landen hier und lassen sich wiederherstellen."];
  else if(f==="spam") e=["spam","Kein Spam","Hier ist alles sauber."];
  else if(f==="sent") e=["sent","Noch nichts gesendet",""];
  else if(f==="inbox") act='<button type="button" class="btn" data-act="compose">'+ic("edit")+' Neue Mail</button>';
  if(!S.messages.length&&S.loading){ e=["refresh","Postfach wird geladen …",""]; act=""; }
  else if(!S.messages.length&&S.err){ e=["alert","Postfach nicht erreichbar",S.err]; act='<button type="button" class="btn" data-act="mretry">'+ic("refresh")+' Erneut versuchen</button>'; }
  return '<div class="mempty'+(S.loading&&!S.messages.length?" busy":"")+'"><span class="ei">'+ic(e[0])+'</span><b>'+esc(e[1])+'</b>'+(e[2]?'<span>'+esc(e[2])+'</span>':'')+(act?'<div class="ea">'+act+'</div>':'')+'</div>';
}
function listHtml(list){
  if(!list.length) return emptyHtml();
  var out=[], last=null, grouped=UI.mf!=="outbox", shown=list.slice(0,UI.mshow);
  var thOn=threadingOn();
  shown.forEach(function(m){ if(grouped){ var g=grpLabel(m.date); if(g!==last){ out.push('<div class="mgrp">'+esc(g)+'</div>'); last=g; } }
    var th=thOn&&!m.outbox&&!m.draftLocal?threadOf(m):[m], open=th.length>1&&UI.mthOpen===threadKey(m);
    out.push(rowHtml(m,{n:th.length,open:open,unread:th.some(function(x){ return !x.read&&!isSent(x); })}));
    if(open) th.forEach(function(x){ if(x.id!==m.id) out.push(rowHtml(x,{child:true})); }); });   /* aufgeklappt: ältere Mails der Unterhaltung darunter */
  if(list.length>shown.length) out.push('<button type="button" class="more" data-act="mmore">Weitere '+Math.min(150,list.length-shown.length)+' von '+(list.length-shown.length)+' anzeigen</button>');
  else out.push(olderBtn());
  return out.join("");
}

/* ---------- Lesebereich ---------- */
/* Knopf in der Werkzeugleiste: o.lvl = ab welcher Breite die Beschriftung bleibt (1 = fast immer … 4 = nur breit, 0 = nur Symbol),
   o.mob = auch am Handy oben sichtbar, o.key = Tastenkürzel im Tooltip */
function rb(act,icon,label,o){ o=o||{}; var l=o.lvl||0;
  return '<button type="button" class="rb'+(o.cls?" "+o.cls:"")+(l?" l"+l:"")+(o.mob?" mk":"")+'" data-act="'+act+'" title="'+esc(label+(o.key?" ("+o.key+")":""))+'" aria-label="'+esc(label)+'">'+ic(icon)+(l?'<span class="rl">'+esc(o.short||label)+'</span>':'')+'</button>'; }
function frame(html,title){ return '<iframe class="mframe" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="'+esc(title||"Mail-Inhalt")+'" srcdoc="'+esc('<!doctype html><meta charset="utf-8"><base target="_blank"><style>html,body{background:#fff}body{font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1b2420;margin:14px;overflow-wrap:anywhere}img{max-width:100%;height:auto}blockquote{margin:6px 0 6px 4px;padding-left:10px;border-left:3px solid #dcdfd8;color:#56605a}details.fsq{margin-top:12px}details.fsq>summary{cursor:pointer;display:inline-block;list-style:none;font-size:12.5px;color:#5f6778;border:1px solid #e3e6ee;background:#f4f5f8;border-radius:99px;padding:2px 10px;margin-bottom:8px}details.fsq>summary::-webkit-details-marker{display:none}</style>'+(html||""))+'"></iframe>'; }
/* Handy: Mail-Inhalt wie in Outlook – volle Höhe statt Rahmen mit eigenem Scrollbalken, breite Newsletter auf Bildschirmbreite verkleinert
   (allow-same-origin ohne allow-scripts: im Rahmen läuft kein Skript, das Cockpit darf nur messen) */
function fitFrame(f){
  if(window.innerWidth>900) return; var d; try{ d=f.contentDocument; }catch(x){ return; } if(!d||!d.body) return;
  var b=d.body; b.style.zoom=""; b.style.margin="12px 4px";
  var w=d.documentElement.scrollWidth, cw=d.documentElement.clientWidth||f.clientWidth;
  if(w>cw+4) b.style.zoom=String(Math.max(.4,cw/w));
  f.style.height=Math.max(160,Math.ceil(d.documentElement.scrollHeight))+"px";
  if(!f._fit){ f._fit=1; try{ d.addEventListener("toggle",function(){ fitFrame(f); },true); }catch(x){} }
}
document.addEventListener("load",function(e){ var f=e.target; if(f&&f.classList&&f.classList.contains("mframe")){ fitFrame(f); setTimeout(function(){ fitFrame(f); },400); setTimeout(function(){ fitFrame(f); },1500); } },true);
M.frame=frame;
function attachmentsHtml(m){
  var atts=(m&&m.attachments)||[]; if(!atts.length) return "";
  var chips=atts.map(function(a){
    var href=M.attHref(m,a), vs=M.voucherSent(m,a), canV=M.isVoucherAtt(a);
    var dv=/^(PDF|Bild)$/.test(attIconTxt(a))?' data-docview data-doctitle="'+esc(a.filename||"Anhang")+'"':'';
    return '<span class="att"><a href="'+esc(href)+'&inline=1" target="_blank" rel="noopener" title="'+esc((a.filename||"Anhang")+" – ansehen")+'"'+dv+'><span class="ak">'+esc(attIconTxt(a))+'</span><span class="nm">'+esc(a.filename||"Anhang")+'</span><span class="sz">'+esc(fmtBytes(a.size))+'</span></a>'+
      '<a href="'+esc(href)+'&dl=1" download="'+esc(a.filename||"anhang")+'" title="Herunterladen" aria-label="'+esc((a.filename||"Anhang")+" herunterladen")+'">'+ic("down")+'</a>'+
      (canV?'<button type="button" class="'+(vs?"done":"")+'" data-act="mvoucher:'+esc(m.id)+'|'+esc(a.index||0)+'" title="'+(vs?"Bereits als Beleg erfasst – erneut erfassen":"Als Beleg erfassen")+'" aria-label="Als Beleg erfassen">'+(vs?ic("check"):ic("receipt"))+'</button>':'')+(canV&&M.kiVoucherBtn?M.kiVoucherBtn(m,a):'')+(F.viwOn?'<button type="button" data-act="mviw:'+esc(m.id)+'|'+esc(a.index||0)+'" title="In VIW Cloud speichern" aria-label="In VIW Cloud speichern">'+ic("cloud")+'</button>':'')+(canV&&F.payFromMail?'<button type="button" data-act="mpay:'+esc(m.id)+'|'+esc(a.index||0)+'" title="Überweisung anlegen – KI liest Empfänger, IBAN und Betrag aus dieser Rechnung" aria-label="Überweisung anlegen">'+ic("pay")+'</button>':'')+'</span>';
  }).join("");
  var zip="";
  if(atts.length>1){ var z="/admin/api/mail-attachments-zip?folder="+encodeURIComponent(m.folder||"INBOX")+"&uid="+encodeURIComponent(m.uid)+"&account="+encodeURIComponent(accOf(m))+"&name="+encodeURIComponent(m.subject||"Anhaenge")+"&atts="+encodeURIComponent(JSON.stringify(atts.map(function(a){ return {index:a.index,filename:a.filename}; })));
    zip='<span class="atta"><a class="link" href="'+esc(z)+'" download>'+ic("down")+' Alle als ZIP</a>'+(F.viwOn?'<button type="button" class="link" data-act="mviw:'+esc(m.id)+'|all">'+ic("cloud")+' Alle in VIW Cloud</button>':'')+'</span>'; }
  return '<div class="attbox"><div class="atth"><span>'+ic("clip")+' '+atts.length+(atts.length>1?" Anhänge":" Anhang")+'</span>'+zip+'</div><div class="attl">'+chips+'</div></div>';
}
function outboxReader(o){
  var tb='<div class="rtool" role="toolbar" aria-label="Aktionen">'+rb("mback","back","Zurück",{cls:"rb-back",mob:1})+(o.status==="failed"?rb("mob:retry|"+o.oid,"refresh","Erneut senden",{cls:"pri",lvl:1,mob:1}):'')+rb("mob:edit|"+o.oid,"edit","Bearbeiten",{lvl:2,mob:1})+rb("mob:discard|"+o.oid,"trash","Verwerfen",{cls:"dg",lvl:2,mob:1})+'</div>';
  return tb+'<div class="rin"><div class="rsender">'+av("",o.to,"lg")+'<div class="rw"><div class="rn">An: '+esc(o.to)+(o.cc?' <span class="muted">· Cc: '+esc(o.cc)+'</span>':'')+'</div><div class="rto">'+(o.status==="failed"?'<span class="bad-t">Senden fehlgeschlagen: '+esc(o.error||"unbekannter Fehler")+'</span>':'Wird gesendet …')+'</div></div><div class="rdate">'+esc(new Date(o.date).toLocaleString("de-AT"))+'</div></div>'+
    '<h2 class="rsubj">'+esc(o.subject||"(kein Betreff)")+'</h2>'+
    (o.attsDropped?'<div class="notice">Die Anhänge waren zu groß zum Zwischenspeichern im Browser. Bitte über „Bearbeiten“ neu anhängen.</div>':'')+
    (o.attachments&&o.attachments.length?'<div class="attbox"><div class="atth"><span>'+ic("clip")+' '+o.attachments.length+(o.attachments.length>1?" Anhänge":" Anhang")+'</span></div><div class="attl">'+o.attachments.map(function(a){ return '<span class="att"><span class="ai"><span class="ak">'+esc(attIconTxt(a))+'</span><span class="nm" title="'+esc(a.filename)+'">'+esc(a.filename)+'</span><span class="sz">'+esc(fmtBytes(a.size))+'</span></span></span>'; }).join("")+'</div></div>':'')+
    frame(o.html,"Mail im Postausgang")+'</div>';
}
/* ---------- Kunde zur Mail: Kundenakte, Kontakt, offene Rechnungen, Auftrag ----------
   Adresse: bei Formular-Mails (Absender ist eine eigene Adresse) „Antwort an“, sonst der Absender, bei gesendeten Mails der Empfänger.
   Zuordnung nur über F.who (kunden.js, exakt per E-Mail/Kontakt); fehlt es, wenigstens der Lead mit genau dieser E-Mail. Liest nur. */
var FREEMAIL=/^(gmail|googlemail|gmx|web|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aon|a1|chello|kabsi|t-online|freenet|posteo|mailbox|protonmail|proton|pm)\./i;
var NOREPLY=/(^|[._+-])(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|newsletters?|news|notifications?)([._+-]|@)/i;
function mAddr(s){ return (String(s||"").toLowerCase().match(/[^\s<>,;"]+@[^\s<>,;"]+/)||[""])[0]; }
function mName(s){ var t=String(s||""), i=t.indexOf("<"); return i>0?t.slice(0,i).replace(/["']/g,"").trim():""; }
/* eigene Adresse oder eigene Firmen-Domain (Freemail-Domains zählen nie als eigene) */
function ownAddr(a){ if(!a) return true; var my=myAddrs(); if(my[a]) return true; var d=a.split("@")[1]||""; if(!d||FREEMAIL.test(d)) return false;
  return Object.keys(my).some(function(x){ return x.split("@")[1]===d; }); }
function custCands(m){ var out=[], add=function(a){ a=mAddr(a); if(a&&!ownAddr(a)&&out.indexOf(a)<0) out.push(a); };
  if(isSent(m)||m.local){ (m.toList||[]).forEach(function(x){ add(x&&x.address); }); add(m.to); }
  else { add(m.from); add(m.replyTo); }   /* Formular-Mail: Absender ist eigene Adresse → bleibt nur „Antwort an“ */
  return out; }
function whoOf(addr){ if(!addr||!F.D) return null;
  if(F.who){ try{ return F.who({email:addr})||null; }catch(e){ console.error(e); return null; } }
  var ls=(F.D.leads||[]).filter(function(l){ return l&&String(l.email||"").trim().toLowerCase()===addr; }), l=ls.filter(function(x){ return x.stage!=="verloren"; })[0]||ls[0];
  return l?{lead:l,contact:null,openInvoices:[],openSum:0,projects:[]}:null; }
function whoKnown(w){ return !!(w&&(w.lead||w.contact||w.contactId||(w.openInvoices||[]).length||(w.projects||[]).length)); }
/* offene Rechnungen ohne Entwürfe und Stornos */
function openInv(w){ return ((w&&w.openInvoices)||[]).filter(function(i){ return i&&+i.open>0.005&&i.status!==100&&!i.cancelled&&i.type!=="SR"; }); }
function activeProj(w){ return ((w&&w.projects)||[]).filter(function(p){ return p&&p.status!=="abgeschlossen"&&p.id!=="pdruckshop"; }); }
M.custOf=function(m){
  if(!m||m.outbox||m.draftLocal||!F.D) return null;
  var cs=custCands(m), hit=null, addr=cs[0]||"";
  for(var i=0;i<cs.length&&!hit;i++){ var w=whoOf(cs[i]); if(whoKnown(w)){ hit=w; addr=cs[i]; } }
  var sent=isSent(m)||!!m.local;
  return {addr:addr,who:hit,lead:hit&&hit.lead||null,open:openInv(hit),projects:activeProj(hit),
    canLead:!hit&&!!addr&&!sent&&!NOREPLY.test(addr)&&!isSpam(m)&&!isTrashed(m)&&!isDraftBox(m)};
};
M.openInv=openInv;
/* Buchhaltungs-Daten (Kontakte) einmal im Hintergrund holen, damit F.who auch Kontakte ohne Lead findet */
var META_REQ=false;
function wantMeta(){ if(META_REQ||!F.who||!F.loadMeta) return; META_REQ=true;
  setTimeout(function(){ F.loadMeta(function(){ if(F.current==="post"&&UI.msel) F.render(); }); },400); }
function rcChip(act,icon,tone,label,title,cls){
  return '<button type="button" class="tag '+tone+' tagbtn'+(cls?" "+cls:"")+'" data-act="'+esc(act)+'" title="'+esc(title||label)+'">'+ic(icon)+'<span>'+label+'</span></button>'; }
function custRow(m){
  var c=M.custOf(m); if(!c) return "";
  var w=c.who, ld=c.lead, ct=w&&(w.contact||(w.contactId?{id:w.contactId}:null)), inv=c.open, pj=c.projects, out=[];
  if(ld){ var ln=ld.company||ld.name||c.addr; out.push(rcChip("lead:"+ld.id,"user","glow",'<span class="rc-pre">Kundenakte · </span>'+esc(ln),"Kundenakte öffnen: "+ln,"rc-k")); }
  if(ct&&ct.id){ var nr=ct.nr?"Kd.-Nr. "+ct.nr:"Kontakt";
    out.push(rcChip("mct:"+ct.id,"building","grey",esc(ld?nr:(ct.name||c.addr)+(ct.nr?" · "+nr:"")),"Kontakt in der Buchhaltung öffnen"+(ct.name?": "+ct.name:""),ld?"rc-n":"rc-k")); }
  if(inv.length){ var od=inv.filter(function(i){ return i.overdue; }).length, sum=inv.reduce(function(s,i){ return s+(+i.open||0); },0);
    var tt=inv.length===1?"Offene Rechnung "+(inv[0].nr||"")+(od?" – überfällig":"")+" öffnen":inv.length+" offene Rechnungen"+(od?", davon "+od+" überfällig":"")+" – Liste öffnen";
    var il=od===inv.length?od+" überfällig":inv.length+" offen";   /* rot, sobald eine überfällig ist – Details im Tooltip */
    out.push(rcChip(inv.length===1?"fin:invd:"+inv[0].id:"minvopen:"+m.id,"inv",od?"bad":"warn",il+' · <span class="money">'+esc(F.eur(sum))+'</span>',tt,"rc-m")); }
  if(pj.length) out.push(rcChip("tkprojopen:"+pj[0].id,"board","grey",'<span class="rc-pre">Auftrag · </span>'+esc(pj[0].name||"")+(pj.length>1?" +"+(pj.length-1):""),"Auftrag öffnen: "+(pj[0].name||"")+(pj.length>1?" (insgesamt "+pj.length+" laufende Aufträge)":""),"rc-p"));
  if(!out.length&&c.canLead) out.push(rcChip("mlead:"+m.id,"plus","grey","Als Lead übernehmen","Noch kein Kunde – "+c.addr+" als neuen Lead anlegen und die Kundenakte öffnen","rc-new"));
  if(!out.length) return "";
  return '<div class="rcust" role="group" aria-label="Kunde">'+out.join("")+'</div>';
}
/* Vorbefüllung „Als Lead übernehmen“: Name aus dem Absender (sonst aus der Adresse), Nachricht = Betreff + Auszug */
function leadPre(m,c){
  var a=c.addr, n="";
  if(a===mAddr(m.from)) n=String(m.fromName||"").trim(); else if(a===mAddr(m.replyTo)) n=mName(m.replyTo);
  if(!n||n.indexOf("@")>-1) n=a.split("@")[0].replace(/[0-9]+/g," ").replace(/[._+-]+/g," ").trim().split(/\s+/).filter(Boolean).map(function(x){ return x.charAt(0).toUpperCase()+x.slice(1); }).join(" ");
  var txt=m.bodyHtml?(M.htmlToText?M.htmlToText(m.body||""):String(m.body||"").replace(/<[^>]+>/g," ")):String(m.body||m.preview||"");
  txt=txt.replace(/\r/g,"").replace(/[ \t\u00a0]+/g," ").replace(/ *\n[\s]*/g,"\n").trim(); if(txt.length>700) txt=txt.slice(0,700).replace(/\s+\S*$/,"")+" …";
  var subj=String(m.subject||"").replace(/^\s*((re|aw|wg|fw|fwd)\s*:\s*)+/i,"").trim();
  var topic=subj.replace(/^(neue\s+)?(kontakt|website-?|web-?)?anfrage\s*[:\-–]\s*/i,"").trim()||subj;
  return {name:n||a,company:"",email:a,phone:"",topic:topic.slice(0,80),message:("Betreff: "+(subj||"(kein Betreff)")+(txt?"\n\n"+txt:"")).slice(0,2000),source:"Mail"};
}
M.leadFromMail=function(m){
  var c=M.custOf(m); if(!c||!c.addr){ F.toast("Keine Absender-Adresse gefunden",true); return; }
  if(c.lead){ if(F.actions.lead) F.actions.lead(c.lead.id); return; }
  var pre=leadPre(m,c);
  if(F.newLead){ F.newLead(pre); return; }
  if(!F.actions.newlead){ F.toast("Leads legst du unter „Kunden“ an.",true); return; }
  F.actions.newlead();   /* älterer Stand ohne F.newLead: Dialog öffnen und ausfüllen */
  var f=document.querySelector('[data-form="newlead"]'); if(!f) return;
  ["name","company","email","phone","topic","message"].forEach(function(k){ if(f[k]&&pre[k]) f[k].value=pre[k]; });
};
/* Zahlungseingang: eine offene Rechnung → bestehender Dialog „Zahlungseingang erfassen“ (gebucht wird erst dort), mehrere → Liste „Offen“ des Kunden */
M.payIn=function(m,list){
  var c=M.custOf(m), inv=c?c.open:[];
  if(!inv.length){ F.toast("Keine offene Rechnung zu diesem Absender gefunden",true); return; }
  if(inv.length===1&&!list){ if(F.openBook) F.openBook(inv[0].id); else if(F.actions.fin) F.actions.fin("invd:"+inv[0].id); return; }
  var names=[]; inv.forEach(function(i){ var n=String(i.contact||"").trim(); if(n&&names.indexOf(n)<0) names.push(n); });
  F.UI.fq_inv=names.length===1?names[0]:""; F.UI.fpg=0;
  if(F.actions.fin) F.actions.fin("inv:open"); else if(F.actions.openinvoices) F.actions.openinvoices(); else F.go("geld");
};
/* Menüeinträge (… im Lesebereich, Rechtsklick): Kundenakte bzw. „Als Lead übernehmen“ und „Zahlungseingang erfassen …“ (nur bei offenen Rechnungen) */
M.custItems=function(m){
  var c=M.custOf(m), o={cust:null,pay:null}; if(!c) return o;
  if(c.lead&&F.actions.lead) o.cust={label:"Kundenakte öffnen",icon:"user",act:function(){ F.actions.lead(c.lead.id); }};
  else if(c.canLead) o.cust={label:"Als Lead übernehmen",icon:"user",act:function(){ M.leadFromMail(m); }};
  if(c.open.length) o.pay={label:"Zahlungseingang erfassen …",icon:"wallet",act:function(){ M.payIn(m,false); }};
  return o;
};
F.action("mlead",function(id){ var m=find(id)||M.cur(); if(m) M.leadFromMail(m); });
F.action("minvopen",function(id){ var m=find(id)||M.cur(); if(m) M.payIn(m,true); });
F.action("mpayin",function(id){ var m=find(id)||M.cur(); if(m) M.payIn(m,false); });
/* Kontakt: Drawer aus der Buchhaltung; sind die Kontakte dort noch nicht geladen, über die Kontaktliste – der Drawer öffnet sich, sobald sie da sind */
/* sdct (sevdesk.js) lädt fehlende Kontakte selbst und öffnet danach den Drawer – genau einmal aufrufen, nie in einer Schleife
   (sonst je 300 ms eine neue, ggf. erzwungene Kontakt-Abfrage an sevDesk und der Drawer wird laufend neu aufgebaut) */
F.action("mct",function(id){
  if(F.actions.sdct){ try{ F.actions.sdct(id); return; }catch(e){ console.error(e); } }
  if(F.actions.sdctgo) F.actions.sdctgo(id); else F.go("geld");
});
function readerHtml(){
  var sel=UI.msel;
  if(sel&&sel.indexOf("ob_")===0&&M.findOb){ var o=M.findOb(sel); if(o) return outboxReader(o); }
  var m=sel?find(sel):null;
  if(!m){ var c=counts(); return '<div class="mempty tall"><span class="ei">'+ic("mailopen")+'</span><b>Wähle links eine Mail aus</b><span>'+(c.inboxUnread?c.inboxUnread+" ungelesen im Posteingang. ":"")+'<span class="hide-m">Mit <span class="kbd">J</span> <span class="kbd">K</span> durchblättern, <span class="kbd">C</span> schreibt eine neue Mail, <span class="kbd">?</span> zeigt alle Tastenkürzel.</span></span><div class="ea"><button type="button" class="btn" data-act="compose">'+ic("edit")+' Neue Mail</button></div></div>'; }
  var sent=isSent(m), trashed=isTrashed(m), spam=isSpam(m), dbox=isDraftBox(m), id=esc(m.id);
  /* Hauptaktionen mit Beschriftung, Seltenes hinter „…“ (mxmore) */
  var tb=rb("mback","back","Zurück",{cls:"rb-back",mob:1});
  if(trashed) tb+=rb("mx:restore","restore","Wiederherstellen",{lvl:1,mob:1})+rb("mx:purge","trash","Endgültig löschen",{cls:"dg",lvl:2,mob:1});
  else {
    if(dbox) tb+=rb("mx:editdraft","edit","Weiter bearbeiten",{cls:"pri",lvl:1,mob:1});
    tb+=rb("mx:reply","reply","Antworten",{cls:dbox?"":"pri",lvl:1,key:"R"})+rb("mx:replyall","replyall","Allen antworten",{lvl:2,key:"A"})+rb("mx:forward","forward","Weiterleiten",{lvl:2,key:"F"})+
      '<span class="rsep"></span>'+(canArchive(m)?rb("mx:archive","archive","Archivieren",{lvl:3,key:"E",mob:1}):'')+
      (spam?rb("mx:notspam","inboxin","Kein Spam – in den Posteingang",{lvl:3,short:"Kein Spam",mob:1}):'')+
      rb("mx:move","folder","Verschieben",{key:"V",mob:1})+rb("mx:trash","trash","Löschen",{cls:"dg",lvl:3,key:"#",mob:1});
  }
  tb+='<span class="rsep"></span>'+rb("mx:"+(m.read?"unread":"read"),m.read?"mail":"mailopen",m.read?"Als ungelesen markieren":"Als gelesen markieren",{lvl:4,key:"U",short:m.read?"Ungelesen":"Gelesen",mob:1})+
    rb("mx:star",m.starred?"starfill":"star",m.starred?"Markierung entfernen":"Markieren",{cls:m.starred?"on":"",lvl:4,key:"S",short:m.starred?"Markiert":"Markieren"})+
    (!trashed&&!dbox?rb("mx:termin","cal","Als Termin eintragen",{cls:"lx",lvl:4,short:"Termin"}):'')+
    (!trashed&&F.actions.kimsum?rb("mxki","spark","KI: zusammenfassen oder Antwort vorschlagen",{cls:"ki lx",lvl:4,short:"KI"}):'')+
    '<span class="rsp"></span><button type="button" class="rb rmore mk" data-act="mxmore" title="Weitere Aktionen: Kundenakte, Aufgabe, Rechnung, Zahlungseingang, Überweisung, Spam, Drucken …" aria-label="Weitere Aktionen" aria-haspopup="menu">'+F.svg("more")+'</button>';
  var who=sent?(m.toName||m.to):(m.fromName||m.from), addr=sent?m.to:m.from;
  var tos=(m.toList&&m.toList.length?m.toList:(m.to?[{name:m.toName,address:m.to}]:[])).map(function(x){ return esc(x.name||x.address); });
  var ccs=(m.ccList||[]).map(function(x){ return esc(x.name||x.address); });
  var toLine=sent?("von "+esc(accInfo(accOf(m)).user||S.account||"")):((tos.length?"an "+tos.join(", "):"")+(ccs.length?" · Cc "+ccs.join(", "):""));
  var tags=(multiAcc()?'<span class="tag" style="background:var(--'+accTone(accOf(m))+'-soft);color:var(--'+accTone(accOf(m))+')">'+esc(accInfo(accOf(m)).label)+'</span>':'')+
    '<span class="tag grey">'+esc(m.deleted?"Papierkorb":((m.folder||"INBOX")==="INBOX"?"Posteingang":folderName(m.folder,accOf(m))))+'</span>'+
    (m.starred?'<span class="tag glow">★ Markiert</span>':'')+(m.attachments&&m.attachments.length?'<span class="tag grey">'+m.attachments.length+(m.attachments.length>1?" Anhänge":" Anhang")+'</span>':'');
  var rs=replyState(m);
  if(rs&&rs.ans) tags+=rs.sid?'<button type="button" class="tag ok tagbtn" data-act="mrel:'+esc(rs.sid)+'" title="Gesendete Antwort öffnen">↩ Beantwortet'+(rs.date?" · "+esc(fmtMailDate(rs.date)):"")+'</button>':'<span class="tag ok">↩ Beantwortet'+(rs.date?" · "+esc(fmtMailDate(rs.date)):"")+'</span>';
  if(rs&&rs.fwd) tags+='<span class="tag info">↪ Weitergeleitet</span>';
  var rel=[];
  if(addr){ var la=addr.toLowerCase(); var thIds={}; threadOf(m).forEach(function(x){ thIds[x.id]=1; }); rel=S.messages.filter(function(x){ return !thIds[x.id]&&!x.deleted&&((x.from||"").toLowerCase()===la||(isSent(x)&&(x.to||"").toLowerCase()===la)); }).sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,5); }
  var canQr=!trashed&&!sent&&!dbox&&(m.replyTo||m.from);
  var qrVal=UI.mqrFor===m.id?(UI.mqr||""):"";
  var qr=canQr?'<div class="qreply"><textarea id="mqr" data-keepfocus="mqr" rows="3" aria-label="Schnell antworten" placeholder="Schnell antworten an '+esc(m.fromName||m.from)+' …">'+esc(qrVal)+'</textarea><div class="qbar"><span class="qh"><span class="kbd">⌘</span><span class="kbd">↵</span> senden · Signatur und Zitat werden angehängt</span><button type="button" class="btn" data-act="mx:reply">Erweitert</button><button type="button" class="btn primary" data-act="mx:qrsend">Senden</button></div></div>':'';
  if(m.lite&&!m._loading){ m._loading=true;   // Suchtreffer aus dem Postfach: Inhalt jetzt nachladen
    F.api("/admin/api/mail-message?account="+encodeURIComponent(accOf(m))+"&folder="+encodeURIComponent(m.folder||"INBOX")+"&uid="+encodeURIComponent(m.uid)).then(function(j){ if(j&&j.ok&&j.message){ var keep={read:m.read,starred:m.starred}; Object.assign(m,j.message,keep); m.lite=false; } else m._err=(j&&j.error)||"Inhalt konnte nicht geladen werden"; m._loading=false; F.render(); }); }
  var body=m.lite?'<div class="mbody mu">'+(m._err?esc(m._err):"Inhalt wird geladen …")+'</div>':m.bodyHtml?frame(quoteHtml(m.body||"",m),m.subject):'<div class="mbody">'+quoteText(m.body||m.preview||"",m)+'</div>';
  var conv=threadOf(m).filter(function(x){ return x.id!==m.id; });
  var convHtml=conv.length?'<div class="rconv"><div class="sec-t">Unterhaltung · '+(conv.length+1)+' Mails</div>'+conv.map(function(x){ var op=!!UI.mthShow[x.id], xs=isSent(x);
    if(op&&x.lite&&!x._loading){ x._loading=true; F.api("/admin/api/mail-message?account="+encodeURIComponent(accOf(x))+"&folder="+encodeURIComponent(x.folder||"INBOX")+"&uid="+encodeURIComponent(x.uid)).then(function(j){ if(j&&j.ok&&j.message){ var keep={read:x.read,starred:x.starred}; Object.assign(x,j.message,keep); x.lite=false; } else x._err=(j&&j.error)||"Inhalt konnte nicht geladen werden"; x._loading=false; F.render(); }); }
    return '<div class="rc'+(op?" open":"")+'"><button type="button" class="rch" data-act="mthshow:'+esc(x.id)+'" aria-expanded="'+op+'">'+av(xs?x.toName:x.fromName,xs?x.to:x.from)+'<span class="rcw"><b>'+(xs?"Du → "+esc(x.toName||x.to||""):esc(x.fromName||x.from||"—"))+'</b><small>'+esc(op?(x.subject||""):(x.preview||x.subject||""))+'</small></span><span class="rcd">'+esc(fmtMailDate(x.date))+ic("chev")+'</span></button>'+
      (op?'<div class="rcb">'+(x.lite?'<div class="mbody mu">'+(x._err?esc(x._err):"Inhalt wird geladen …")+'</div>':x.bodyHtml?frame(quoteHtml(x.body||"",x),x.subject):'<div class="mbody">'+quoteText(x.body||x.preview||"",x)+'</div>')+attachmentsHtml(x)+'<div class="rca"><button type="button" class="btn sm" data-act="mrel:'+esc(x.id)+'">Diese Mail öffnen</button></div></div>':'')+'</div>'; }).join("")+'</div>':'';
  return '<div class="rtool" role="toolbar" aria-label="Aktionen">'+tb+'</div><div class="rin" id="mreadS">'+
    '<h2 class="rsubj">'+esc(m.subject||"(kein Betreff)")+'</h2><div class="rtags">'+tags+'</div>'+
    '<div class="rsender">'+av(sent?m.toName:m.fromName,sent?m.to:m.from,"lg")+
      '<div class="rw"><div class="rn">'+(sent?"An: ":"")+esc(who||"—")+(addr&&addr!==who?' <button type="button" class="raddr" data-act="mmailto:'+esc(addr)+'" title="Neue Mail an '+esc(addr)+'">&lt;'+esc(addr)+'&gt;</button>':'')+'</div>'+(toLine?'<div class="rto">'+toLine+'</div>':'')+'</div>'+
      '<div class="rdate">'+esc(m.date?new Date(m.date).toLocaleString("de-AT",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"")+'<span>'+esc(relTime(m.date))+'</span></div></div>'+
    (trashed||dbox?'':custRow(m))+
    attachmentsHtml(m)+(M.kiBar?M.kiBar(m):'')+body+convHtml+
    (m.body||m.preview?'':'<div class="notice"><span>Kein Textinhalt im Abruf. Die vollständige Nachricht findest du im Webmail.</span><button type="button" class="btn" data-act="mwebmail">In Webmail öffnen</button></div>')+
    qr+
    (!trashed&&!dbox?'<div class="mrbar" role="toolbar" aria-label="Antworten"><button type="button" class="pri" data-act="mx:reply">'+ic("reply")+'<span>Antworten</span></button><button type="button" data-act="mx:replyall" aria-label="Allen antworten">'+ic("replyall")+'<span>Allen</span></button><button type="button" data-act="mx:forward">'+ic("forward")+'<span>Weiterleiten</span></button></div>':'')+
    (rel.length?'<div class="rrel"><div class="sec-t">Weitere Mails '+(sent?"an":"von")+' '+esc(who)+'</div>'+rel.map(function(x){ return '<button type="button" class="ri" data-act="mrel:'+esc(x.id)+'">'+(isSent(x)?'<span class="muted" title="Gesendet">'+ic("sent")+'</span>':'')+'<span class="s" title="'+esc(x.subject||"")+'">'+esc(x.subject||"(kein Betreff)")+'</span><span class="d">'+esc(fmtMailDate(x.date))+'</span></button>'; }).join("")+'</div>':'')+
  '</div>';
}

/* ---------- Ansicht ---------- */
function bulkHtml(){
  var n=M.selectedIds().length; if(!n) return "";
  var b=function(op,icon,l,cls){ return '<button type="button" class="btn'+(cls?" "+cls:"")+'" data-act="mbulk:'+op+'">'+ic(icon)+'<span>'+l+'</span></button>'; };
  return '<div class="mbulk" role="toolbar" aria-label="Auswahl"><b>'+n+' ausgewählt</b>'+b("read","mailopen","Gelesen")+b("unread","mail","Ungelesen")+b("star","star","Markieren")+
    (UI.mf!=="trash"?b("archive","archive","Archivieren"):'')+b("move","folder","Verschieben …")+b("spam","spam","Spam")+b("trash","trash","Löschen","danger")+
    '<span class="sp"></span><button type="button" class="btn" data-act="mbulk:all">Alle auswählen</button><button type="button" class="btn" data-act="mbulk:clear">'+F.svg("close")+'<span>Abwählen</span></button></div>';
}
/* Hinweis-Balken: Mail-Dienst gestört (F.D.mail.stale/error oder eigener Abruf) bzw. Konto nicht verbunden */
function mailHealth(){
  var md=(F.D&&F.D.mail)||{}, cAt=(F.D&&Date.parse(F.D.fetchedAt))||0, own=S.srvFlag;
  if(own&&own.at>cAt) return {stale:own.stale,error:own.error};   /* neuerer direkter Abruf gewinnt */
  return {stale:!!md.stale,error:typeof md.error==="string"?md.error:(md.error?"Der Mail-Dienst meldet einen Fehler.":"")};
}
M.health=mailHealth;
function connBanner(){
  var h=mailHealth(), own=S.err, bad=accounts().filter(function(a){ return a.configured===false||a.ok===false; });
  var t="", d="", tone="warn", extra="", x="", retry=true;
  var since=S.fetchedAt?(relTime(S.fetchedAt)||new Date(S.fetchedAt).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})).replace(/\.$/,""):"";
  if(h.error||own){ tone="bad"; t="Postfach gerade nicht erreichbar"; d=(h.error||own)+(since&&S.messages.length?" Letzter Stand: "+since+".":""); }
  else if(h.stale){ t="Postfach zeigt einen älteren Stand"; d="Der Mail-Dienst antwortet gerade nicht – neue Mails kommen eventuell verzögert."+(since?" Letzter Stand: "+since+".":""); }
  else if(bad.length){
    var sig=bad.map(function(a){ return a.key+(a.configured===false?"-c":"-o"); }).join(","); if(F.ls("fsc_mbanner_acc")===sig) return "";
    t=bad.length===1?"Konto „"+(bad[0].label||bad[0].key)+"“ ist nicht verbunden":bad.length+" Konten sind nicht verbunden";
    d=bad.map(function(a){ return (bad.length>1?(a.label||a.key)+": ":"")+accWarn(a); }).join(" · "); retry=false;
    extra='<button type="button" class="btn" data-act="msettings:'+esc(bad[0].key)+'">'+ic("edit")+'<span>Konto prüfen</span></button>';
    x='<button type="button" class="mb-x" data-act="mbannerx:'+esc(sig)+'" title="Ausblenden, bis sich etwas ändert" aria-label="Hinweis ausblenden">'+F.svg("close")+'</button>';
  }
  else return "";
  return '<div class="mbanner '+tone+'" role="status"><span class="mb-i">'+ic("alert")+'</span><div class="mb-t"><b>'+esc(t)+'</b><span>'+esc(d)+'</span></div><div class="mb-a">'+extra+
    (retry?'<button type="button" class="btn" data-act="mretry">'+ic("refresh")+'<span>Erneut versuchen</span></button>':'')+
    '<button type="button" class="btn" data-act="conn:mail">'+ic("plug")+'<span>Verbindungen</span></button></div>'+x+'</div>';
}
F.action("mretry",function(){ S.err=""; F.toast("Verbinde neu …"); M.loadFull().then(function(){ if(S.err) F.toast(S.err,true); else F.toast("Postfach aktualisiert"); }); if(F.load) F.load(false); });
F.action("mbannerx",function(sig){ F.ls("fsc_mbanner_acc",sig); F.render(); });
/* Rückfall, falls die Verbindungs-Ansicht (zconn.js) nicht geladen ist: Konten in den Einstellungen öffnen */
F.listen("click",'.mbanner [data-act^="conn"]',function(){ F.actions.msettings("mail"); });
/* Handy: einmaliger Hinweis auf die Wisch-Gesten */
function swipeTip(list){ if(!list.length||UI.mq||UI.mf==="outbox"||F.ls("fsc_mswipe_tip")) return "";
  return '<div class="mtip">'+ic("swipe")+'<span><b>Tipp:</b> Mail nach links wischen löscht, nach rechts ändert gelesen/ungelesen. Lange drücken wählt mehrere aus.</span><button type="button" class="link" data-act="mtipx">Verstanden</button></div>'; }
F.action("mtipx",function(){ F.ls("fsc_mswipe_tip",1); F.render(); });
function subLine(){
  var accs=accounts(), bad=accs.filter(function(a){ return a.configured===false||a.ok===false; });
  var s=(multiAcc()?accs.length+" Konten":(accs[0].user||S.account||"Postfach"))+(bad.length?" · "+bad.map(function(a){return a.label;}).join(", ")+" nicht verbunden":"");
  s+=" · "+(S.fetchedAt?"aktualisiert "+(relTime(S.fetchedAt)||new Date(S.fetchedAt).toLocaleString("de-AT")):"noch kein Abruf");
  if(S.loading) s+=" · lädt …"; if(S.err) s+=" · "+S.err;
  return esc(s);
}
function vPost(){
  var ls=document.getElementById("mlistS"); if(ls) UI.mlistTop=ls.scrollTop;
  var rs=document.getElementById("mreadS"); if(rs&&UI.mreadFor===UI.msel) UI.mreadTop=rs.scrollTop; else UI.mreadTop=0;
  if(UI.mreadFor!==UI.msel){ UI.mjump=UI.msel?"read":(UI.mreadFor?"list":""); if(!UI.msel&&UI.mreadFor) UI.mscrollTo=UI.mreadFor; }
  UI.mreadFor=UI.msel;
  if(UI.msel&&!find(UI.msel)&&!(M.findOb&&M.findOb(UI.msel))) UI.msel=null;
  var list=mailView(), c=counts();
  return F.head("Postfach"+(c.inboxUnread?' <span class="tag glow hnew">'+c.inboxUnread+' neu</span>':''),subLine(),
    '<button type="button" class="btn icon" data-act="mrefresh" title="Aktualisieren" aria-label="Postfach aktualisieren">'+ic("refresh")+'</button><button type="button" class="btn" data-act="mailrules" title="Regeln: Mails automatisch sortieren">'+ic("filter")+' Regeln</button><button type="button" class="btn icon hide-m" data-act="mkeys" title="Tastenkürzel (?)" aria-label="Tastenkürzel">'+ic("keys")+'</button><button type="button" class="btn icon" data-act="mwebmail" title="In Webmail öffnen" aria-label="In Webmail öffnen">'+ic("ext")+'</button><button type="button" class="btn primary" data-act="compose">'+ic("edit")+' Neue Mail</button>')+
  '<div class="mtools"><button type="button" class="btn fpill" data-act="mfoldsheet" aria-haspopup="dialog" title="Ordner und Konten">'+ic("folder")+'<span>'+esc(curFolderLabel())+(multiAcc()&&UI.macct!=="all"?" · "+esc(accInfo(UI.macct).label):"")+'</span>'+ic("chev")+'</button>'+
    '<div class="msearch">'+F.svg("search")+'<input class="f" id="msearch" data-keepfocus="msearch" type="search" placeholder="In allen Ordnern suchen … (Taste /)" aria-label="Mails durchsuchen" autocomplete="off" value="'+esc(UI.mq)+'">'+(UI.mq?'<button type="button" class="x" data-act="msearchx" aria-label="Suche leeren">'+F.svg("close")+'</button>':'')+'</div></div>'+
  bulkHtml()+mobileBar(c)+connBanner()+folderStrip(c)+
  '<div class="mbox'+(UI.msel?" reading":"")+'"'+(listW()?' style="--mlist-w:'+listW()+'px"':'')+'>'+
    '<nav class="mfold" aria-label="Ordner">'+folderPanel()+'</nav>'+
    '<section class="mlistp" aria-label="Nachrichten"><div class="mptr" aria-hidden="true">'+ic("down")+'</div>'+listHead(list)+'<div class="mchips" role="group" aria-label="Filter">'+chipsHtml(list)+'</div><div class="mscroll" id="mlistS">'+swipeTip(list)+searchInfo(list)+listHtml(list)+'</div><div class="mlist-rs" role="separator" aria-orientation="vertical" aria-label="Breite der Mailliste" tabindex="0" title="Ziehen: Breite der Mailliste ändern · Doppelklick: Standardbreite"></div></section>'+
    '<section class="mread" aria-label="Lesebereich">'+readerHtml()+'</section>'+
  '</div>'+(UI.msel||M.selectedIds().length?'':'<button type="button" class="mfab lbl" data-act="compose" aria-label="Neue Mail">'+ic("edit")+'<span>Neue Mail</span></button>');
}
/* Breite der Mailliste am PC selbst ziehen (Wunsch Simon 20.10.2026): Griff am rechten Rand der Liste, Pfeiltasten ±20 px, Doppelklick = Standard; bleibt gespeichert */
var MLW_MIN=240, MLW_READ=260;   // Mindestbreiten Liste bzw. Lesebereich
function listW(){ var w=UI.mlistW!=null?UI.mlistW:F.ls("fsc_mlist_w"); return w&&isFinite(w)?Math.round(w):0; }
function listMax(box){ var f=box.querySelector(".mfold"), fw=f&&f.offsetParent?f.offsetWidth:0; return Math.max(MLW_MIN,box.clientWidth-fw-MLW_READ); }
function setListW(box,w,save){ w=Math.round(Math.max(MLW_MIN,Math.min(listMax(box),w))); box.style.setProperty("--mlist-w",w+"px"); UI.mlistW=w; if(save) F.ls("fsc_mlist_w",w); return w; }
var MRS=null;
document.addEventListener("pointerdown",function(e){ var h=e.target.closest&&e.target.closest(".mlist-rs"); if(!h||e.button!==0) return; var box=h.closest(".mbox"), lp=h.closest(".mlistp"); if(!box||!lp) return;
  e.preventDefault(); MRS={x:e.clientX,w:lp.getBoundingClientRect().width}; document.body.classList.add("mrs-drag"); });
document.addEventListener("pointermove",function(e){ if(!MRS) return; var box=document.querySelector(".mbox"); if(box) setListW(box,MRS.w+e.clientX-MRS.x,false); });
document.addEventListener("pointerup",function(){ if(!MRS) return; MRS=null; document.body.classList.remove("mrs-drag"); if(UI.mlistW) F.ls("fsc_mlist_w",UI.mlistW); });
document.addEventListener("dblclick",function(e){ if(!(e.target.closest&&e.target.closest(".mlist-rs"))) return; UI.mlistW=null; F.ls("fsc_mlist_w",null); var box=document.querySelector(".mbox"); if(box) box.style.removeProperty("--mlist-w"); });
F.listen("keydown",".mlist-rs",function(el,e){ if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight") return; e.preventDefault(); var box=el.closest(".mbox"), lp=el.closest(".mlistp"); if(box&&lp) setListW(box,lp.getBoundingClientRect().width+(e.key==="ArrowRight"?20:-20),true); });
/* Handy: Kopfzeile wie in der Outlook-App (Konto/Ordner links, Titel, Suche) bzw. Auswahlleiste */
function mobileBar(c){
  var nsel=M.selectedIds().length;
  if(nsel) return '<div class="mapp sel"><button type="button" class="mapp-i" data-act="mbulk:clear" aria-label="Auswahl beenden">'+F.svg("close")+'</button><div class="mapp-t"><b>'+nsel+' ausgewählt</b><span>Antippen wählt weitere aus</span></div><button type="button" class="mapp-x" data-act="mbulk:all">Alle</button></div>'+
    '<div class="mselbar" role="toolbar" aria-label="Auswahl"><button type="button" data-act="mbulk:read">'+ic("mailopen")+'<span>Gelesen</span></button><button type="button" data-act="mbulk:star">'+ic("star")+'<span>Markieren</span></button>'+
      (UI.mf!=="trash"?'<button type="button" data-act="mbulk:archive">'+ic("archive")+'<span>Archiv</span></button>':'')+
      '<button type="button" data-act="mbulk:move">'+ic("folder")+'<span>Verschieben</span></button><button type="button" data-act="mbulk:spam">'+ic("spam")+'<span>Spam</span></button><button type="button" class="dg" data-act="mbulk:trash">'+ic("trash")+'<span>Löschen</span></button></div>';
  var acc=UI.macct==="all"?(multiAcc()?"Alle Konten":(accounts()[0].user||S.account||"")):(accInfo(UI.macct).user||accInfo(UI.macct).label);
  var me=UI.macct==="all"?"FS":initials(accInfo(UI.macct).label,accInfo(UI.macct).user);
  var srch=UI.msrch||!!UI.mq;
  return '<div class="mapp"><button type="button" class="mapp-av" data-act="mfoldsheet" aria-label="Konten und Ordner wechseln" title="Konten und Ordner"><span>'+esc(me)+'</span>'+(c.inboxUnread&&UI.mf!=="inbox"?'<i></i>':'')+'</button>'+
    '<button type="button" class="mapp-t" data-act="mfoldsheet" aria-haspopup="dialog"><b>'+esc(UI.mq?"Suche":curFolderLabel())+' '+ic("chev")+'</b><span>'+esc(acc)+(c.inboxUnread?' · '+c.inboxUnread+' ungelesen':'')+(S.loading?' · lädt …':'')+'</span></button>'+
    '<button type="button" class="mapp-i'+(srch?" on":"")+'" data-act="msrch" aria-label="Suchen" aria-pressed="'+srch+'">'+F.svg("search")+'</button></div>'+
    (srch?'<div class="mapp-s"><div class="msearch">'+F.svg("search")+'<input class="f" id="msearchm" data-keepfocus="msearchm" type="search" enterkeyhint="search" placeholder="In allen Ordnern suchen" aria-label="Mails durchsuchen" autocomplete="off" value="'+esc(UI.mq)+'"></div><button type="button" class="mapp-x" data-act="msrchx">Abbrechen</button></div>':'');
}
/* Handy: Ordner als wischbare Chips direkt unter dem Kopf (ein Tipp statt Seitenblatt); „Alle Ordner“ öffnet das Blatt mit Konten und eigenen Ordnern */
function folderStrip(c){
  if(M.selectedIds().length||UI.mq) return "";
  var ob=M.outbox?M.outbox():[], cur=UI.mf, it=[["inbox","inbox","Posteingang",c.inboxUnread],["drafts","draft","Entwürfe",c.drafts],["sent","sent","Gesendet",0]];
  if(ob.length) it.push(["outbox","outbox","Postausgang",ob.length]);
  it.push(["spam","spam","Spam",c.spam],["trash","trash","Papierkorb",0]);
  var h=it.map(function(x){ return '<button type="button" class="mfs'+(x[0]==="outbox"&&ob.some(function(o){ return o.status==="failed"; })?" warn":"")+'" data-act="mfolder:'+x[0]+'"'+(cur===x[0]?' aria-current="true"':'')+'>'+ic(x[1])+'<span>'+esc(x[2])+'</span>'+(x[3]?'<i>'+x[3]+'</i>':'')+'</button>'; }).join("");
  if(cur.indexOf("f:")===0||FNAMES[cur]&&!it.some(function(x){ return x[0]===cur; })) h+='<button type="button" class="mfs" aria-current="true" data-act="mfoldsheet">'+ic("folder")+'<span>'+esc(curFolderLabel())+'</span></button>';
  return '<div class="mfstrip" role="group" aria-label="Ordner">'+h+'<button type="button" class="mfs more" data-act="mfoldsheet" aria-haspopup="dialog">'+ic("folder")+'<span>Alle Ordner'+(multiAcc()?" & Konten":"")+'</span></button></div>';
}
function after(){
  var ls=document.getElementById("mlistS"); if(ls&&UI.mlistTop) ls.scrollTop=UI.mlistTop;
  var rs=document.getElementById("mreadS"); if(rs&&UI.mreadTop) rs.scrollTop=UI.mreadTop;
  var mob=window.innerWidth<=900, jump=UI.mjump; UI.mjump="";
  /* der Kern stellt nach after() die Fensterposition wieder her – deshalb erst danach springen */
  document.body.classList.toggle("m-read",mob&&!!UI.msel);
  if(mob&&jump==="read"){ UI.mscrollTo=null; setTimeout(function(){ window.scrollTo(0,0); },0); }
  if(UI.msrchFocus){ UI.msrchFocus=false; var si=document.getElementById("msearchm"); if(si) si.focus(); }
  if(mob){ var fs=document.querySelector(".mfstrip"), fc=fs&&fs.querySelector('[aria-current="true"]'); if(fc&&fc.offsetLeft+fc.offsetWidth>fs.scrollLeft+fs.clientWidth) fs.scrollLeft=Math.max(0,fc.offsetLeft-16); }
  if(UI.mscrollTo){ var row=document.querySelector('.mrow2[data-mid="'+(window.CSS&&CSS.escape?CSS.escape(UI.mscrollTo):UI.mscrollTo)+'"]'); if(row&&row.scrollIntoView) setTimeout(function(){ row.scrollIntoView({block:mob&&jump==="list"?"center":"nearest"}); },0); UI.mscrollTo=null; }
  if(UI.mfocusQr){ UI.mfocusQr=false; var q=document.getElementById("mqr"); if(q) q.focus(); }
  if(!S.full&&!S.loading&&!S.err) M.loadFull();
  else if(S.full&&!S.loading&&Date.now()-S.fullAt>60000) M.loadFull();
  wantMeta();
}
M.render=function(){ F.render(); };

/* ---------- Öffnen ---------- */
M.open=function(id,opts){
  opts=opts||{};
  UI.msel=id; UI.mscrollTo=id;
  var m=find(id);
  if(m&&!m.read&&!m.local){ M.setOv(m,{read:true}); M.action("seen",[m]); M.changed(); }
  if(opts.fromOutside){
    if(m){ UI.mf=M.folderKeyOf(m); if(UI.macct!=="all"&&accOf(m)!==UI.macct) UI.macct="all"; }
    UI.mfilt="all"; UI.mq="";
    if(F.current!=="post"){ F.go("post"); return; }
  }
  F.render();
};
F.action("mail",function(id){ M.open(id,{fromOutside:true}); });
F.listen("click",".mrow2",function(el,e){
  if(e.target.closest("[data-act]")) return;
  var id=el.getAttribute("data-mid");
  if(e.shiftKey||e.metaKey||e.ctrlKey){ togglePick(id,e.shiftKey); return; }
  if(window.innerWidth<=900&&M.selectedIds().length&&id.indexOf("dr_")!==0&&id.indexOf("ob_")!==0){ togglePick(id); return; }
  if(id.indexOf("dr_")===0){ if(M.openDraft) M.openDraft(id.slice(3)); return; }
  if(id.indexOf("ob_")===0){ UI.msel=id; F.render(); return; }
  if(threadingOn()){ var tm=find(id); if(tm&&threadOf(tm).length>1) UI.mthOpen=threadKey(tm); }
  M.open(id);
});
F.listen("keydown",".mrow2",function(el,e){ if(e.target!==el) return; if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.click(); } });
F.action("mthx",function(id){ var m=find(id); if(!m) return; var k=threadKey(m); UI.mthOpen=UI.mthOpen===k?null:k; F._forceRender=true; F.render(); });
F.action("mthshow",function(id){ UI.mthShow[id]=!UI.mthShow[id]; F._forceRender=true; F.render(); });
F.action("mthreads",function(){ UI.mthreads=!UI.mthreads; F.ls("fsc_mthreads",UI.mthreads); UI.mthOpen=null; F._forceRender=true; F.render(); F.toast(UI.mthreads?"Mails werden als Unterhaltungen zusammengefasst":"Jede Mail einzeln"); });
F.listen("keydown",".mav[data-act]",function(el,e){ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); el.click(); } });
F.listen("input","#msearch,#msearchm",function(el){ UI.mq=el.value; UI.mshow=150; serverSearch(); F.render(); });
F.listen("keydown","#msearch,#msearchm",function(el,e){ if(e.key==="Escape"){ e.stopPropagation(); UI.mq=""; el.value=""; F.render(); var s=document.getElementById("msearch"); if(s) s.blur(); } });
F.listen("input","#mqr",function(el){ UI.mqr=el.value; UI.mqrFor=UI.msel; });
F.action("msearchx",function(){ UI.mq=""; UI.msr=null; F.render(); var s=document.getElementById("msearch"); if(s) s.focus(); });

/* ---------- Navigation in der Ansicht ---------- */
F.action("mfolder",function(k){ if(k!==UI.mf){ UI.mf=k; UI.mfilt="all"; UI.mpick={}; UI.msel=null; UI.mlistTop=0; UI.mshow=150; } F.closeModal(); F.render(); });
F.action("macct",function(k){ if(k!==UI.macct){ UI.macct=k; UI.mpick={}; UI.msel=null; UI.mlistTop=0; if(UI.mf.indexOf("f:")===0) UI.mf="inbox"; } F.closeModal(); F.render(); });
F.action("mfilt",function(k){ UI.mfilt=k; UI.mlistTop=0; F.render(); });
F.action("mmore",function(){ UI.mshow+=150; F.render(); });
F.action("mback",function(){ UI.msel=null; F._forceRender=true; F.render(); });
F.action("mrel",function(id){ M.open(id,{fromOutside:!find(id)||M.folderKeyOf(find(id))!==UI.mf}); });
F.action("msettings",function(k){ if(F.actions.settings) F.actions.settings(k||"mail"); else F.toast("Konten richtest du in den Einstellungen ein."); });
F.action("mwebmail",function(){ window.open("https://webmail.world4you.com","_blank","noopener"); });
F.action("mrefresh",function(){ F.toast("Postfach wird aktualisiert …"); M.loadFull().then(function(){ if(!S.err) F.toast("Postfach aktualisiert"); else F.toast(S.err,true); }); });
F.action("mfoldsheet",function(){ F.modal('<div class="row-between"><h2 style="font-size:19px">'+(multiAcc()?"Konten & Ordner":"Ordner")+'</h2>'+F.btnClose()+'</div><nav class="mfold sheetf" aria-label="Ordner">'+folderPanel({sheet:true})+'</nav><p class="muted small sheeth">Lange drücken auf einen Ordner: umbenennen, Unterordner, löschen …</p><button type="button" class="btn sheetrules" data-act="mailrules">'+ic("filter")+' Regeln – Mails automatisch sortieren</button>',"sheetdlg"); });
F.action("mmailto",function(addr){ F.compose({to:addr}); });

/* ---------- Ordner-Kontextmenü (Rechtsklick / langes Drücken am Handy) ---------- */
var FERR={exists:"Ein Ordner mit diesem Namen existiert bereits.",bad_name:"Ungültiger Name – bitte ohne / . * % \\ \"",name_required:"Bitte einen Namen eingeben.",name_too_long:"Name ist zu lang (max. 80 Zeichen).",
  special_folder:"Systemordner können nicht geändert werden.",has_subfolders:"Der Ordner hat Unterordner – bitte zuerst diese löschen.",unknown_folder:"Ordner nicht gefunden – Postfach wird aktualisiert.",
  unknown_parent:"Übergeordneter Ordner nicht gefunden.",parent_no_children:"In diesem Ordner können keine Unterordner angelegt werden.",not_trash_or_junk:"Nur Papierkorb und Spam können geleert werden.",
  no_trash:"Kein Papierkorb gefunden.",into_itself:"Ein Ordner kann nicht in sich selbst oder einen seiner Unterordner verschoben werden.",bad_op:"Das kann der Mail-Dienst noch nicht – bitte später erneut versuchen.",mail_not_configured:"Postfach ist nicht verbunden.",unauthorized:"Keine Berechtigung."};
function ferr(j){ var e=(j&&j.error)||"Fehler"; return FERR[e]||("Fehler: "+(j&&j.detail?String(j.detail).slice(0,140):e)); }
function fmeta(acc,path){ return S.folders.filter(function(f){ return f.path===path&&(f.account||primaryAcct())===acc; })[0]||null; }
function fdelim(acc,path){ var f=fmeta(acc,path)||fmeta(acc,"INBOX"); return (f&&f.delim)||(/^INBOX\./.test(path||"")?".":"/"); }
function fSpecial(acc,path){ var f=fmeta(acc,path); return path==="INBOX"||!!(f&&f.special)||TRASHRX.test(path)||SENTRX.test(path)||SPAMRX.test(path)||DRAFTRX.test(path); }
function boxOf(acc,rx,special){ var f=S.folders.filter(function(x){ return (x.account||primaryAcct())===acc&&x.special===special; })[0]||S.folders.filter(function(x){ return (x.account||primaryAcct())===acc&&rx.test(x.path); })[0]; return f?f.path:""; }
function inFolder(acc,path){ return S.messages.filter(function(m){ return !m.local&&accOf(m)===acc&&(m.folder||"INBOX")===path; }); }
function scopeAccs(){ return UI.macct!=="all"?[UI.macct]:accounts().map(function(a){ return a.key; }); }
function folderApi(body){ return F.api("/admin/api/mail-folder",{body:body}).catch(function(){ return {ok:false,error:"Keine Verbindung zum Server"}; }); }
function fdone(msg){ F.toast(msg); M.changed(); M.refresh(); M.scheduleReload(800); }
/* Namens-Dialog (statt prompt()) */
function nameDialog(title,okLabel,val,acc,fn){
  F.modal('<form id="mfnForm" novalidate><h2 style="font-size:19px">'+esc(title)+'</h2><label class="fl2" style="display:block;margin-top:12px"><span class="muted" style="font-size:13px">Name</span><input id="mfnName" type="text" maxlength="80" autocomplete="off" autofocus value="'+esc(val||"")+'" style="width:100%;margin-top:4px"></label><div id="mfnErr" style="color:var(--bad);font-size:13px;min-height:18px;margin-top:6px"></div><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary" id="mfnOk">'+esc(okLabel)+'</button></span></div></form>',"narrow");
  var form=document.getElementById("mfnForm"), inp=document.getElementById("mfnName"), er=document.getElementById("mfnErr"), ok=document.getElementById("mfnOk");
  if(!form) return; setTimeout(function(){ try{ inp.focus(); inp.select(); }catch(e){} },60);
  form.addEventListener("submit",function(e){ e.preventDefault(); e.stopPropagation();
    var n=String(inp.value||"").trim(), d=fdelim(acc,"");
    if(!n){ er.textContent=FERR.name_required; return; }
    if(/[\/\\.*%"]/.test(n)||n.indexOf(d)>-1||/[\x00-\x1f]/.test(n)){ er.textContent="Bitte ohne die Zeichen / . * % \\ \" – Unterordner über „Neuer Unterordner…“ anlegen."; return; }
    if(n===(val||"")){ F.closeModal(); return; }
    ok.disabled=true; er.textContent="";
    fn(n,function(msg){ ok.disabled=false; er.textContent=msg; });
  });
}
function fCreate(acc,parent){
  var pname=parent?(parent==="INBOX"?"Posteingang":folderName(parent,acc)):"";
  nameDialog(parent?"Neuer Unterordner in „"+pname+"“":"Neuer Ordner"+(multiAcc()?" · "+(accInfo(acc).label||acc):""),"Anlegen","",acc,function(name,fail){
    folderApi({op:"create",account:acc,parent:parent||"",name:name}).then(function(j){
      if(!j||j.ok===false||j.error) return fail(ferr(j));
      F.closeModal(); var d=fdelim(acc,parent||"");
      if(j.path&&!fmeta(acc,j.path)) S.folders.push({account:acc,path:j.path,name:name,special:"",delim:d,total:0,unread:0});
      fdone("Ordner „"+name+"“ angelegt");
    });
  });
}
function fRename(acc,path){
  var old=folderName(path,acc);
  nameDialog("Ordner „"+old+"“ umbenennen","Umbenennen",old,acc,function(name,fail){
    folderApi({op:"rename",account:acc,path:path,name:name}).then(function(j){
      if(!j||j.ok===false||j.error) return fail(ferr(j));
      F.closeModal(); var np=j.newPath||path, d=fdelim(acc,path);
      var re=function(p){ return (p===path||p.indexOf(path+d)===0)?np+p.slice(path.length):p; };
      S.folders.forEach(function(f){ if((f.account||primaryAcct())!==acc) return; var q=re(f.path); if(q!==f.path){ f.path=q; if(q===np) f.name=name; } });
      S.messages.forEach(function(m){ if(accOf(m)===acc&&m.folder) m.folder=re(m.folder); });
      if(UI.mf.indexOf("f:")===0){ var k=parseFolderKey(UI.mf); if(k.acc===acc) UI.mf="f:"+acc+"|"+re(k.path); }
      fdone("Ordner umbenannt in „"+name+"“");
    });
  });
}
/* Ordner (samt Unterordnern) in einen anderen Ordner oder auf die oberste Ebene verschieben – per Menü oder Ziehen */
function fmoveTargets(acc,path){ var d=fdelim(acc,path), under=function(p){ return p===path||p.indexOf(path+d)===0; }, cur=fparent(acc,path), out=[];
  if(cur!=="") out.push({parent:"",label:"Oberste Ebene",depth:0});
  if(!nsInbox(acc)&&cur!=="INBOX") out.push({parent:"INBOX",label:"Posteingang",depth:0});
  customFolders(acc).forEach(function(f){ if(f.acc!==acc||under(f.path)||fSpecial(acc,f.path)||f.path===cur) return; out.push({parent:f.path,label:fpathLabel(acc,f.path),depth:fdepth(acc,f.path)}); });
  return out; }
function doMove(acc,path,parent,fail){
  var d=fdelim(acc,path), nm=folderName(path,acc);
  if(parent&&(parent===path||parent.indexOf(path+d)===0)){ F.toast(FERR.into_itself,true); return; }
  folderApi({op:"move",account:acc,path:path,parent:parent||""}).then(function(j){
    if(!j||j.ok===false||j.error){ if(fail) fail(ferr(j)); else F.toast(ferr(j),true); return; }
    F.closeModal(); var np=j.newPath||path; if(np===path) return;
    var re=function(p){ return (p===path||p.indexOf(path+d)===0)?np+p.slice(path.length):p; };
    S.folders.forEach(function(f){ if((f.account||primaryAcct())===acc) f.path=re(f.path); });
    S.messages.forEach(function(m){ if(accOf(m)===acc&&m.folder) m.folder=re(m.folder); });
    if(UI.mf.indexOf("f:")===0){ var k=parseFolderKey(UI.mf); if(k.acc===acc) UI.mf="f:"+acc+"|"+re(k.path); }
    fdone("Ordner „"+nm+"“ verschoben"+(parent&&!(parent==="INBOX"&&nsInbox(acc))?" nach „"+fpathLabel(acc,parent)+"“":" auf die oberste Ebene"));
  });
}
var FMV=null;
function fMove(acc,path){ var t=fmoveTargets(acc,path); FMV={acc:acc,path:path,t:t};
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:19px">„'+esc(folderName(path,acc))+'“ verschieben nach …</h2>'+F.btnClose()+'</div>'+
    '<p class="muted small" style="margin:0">Unterordner und Mails wandern mit.</p><div class="fmv">'+(t.map(function(x,i){ return '<button type="button" data-act="mfmv:'+i+'">'+ic(x.parent===""||x.parent==="INBOX"?"inbox":"folder")+'<span>'+esc(x.label)+'</span></button>'; }).join("")||'<p class="muted small">Keine anderen Ordner vorhanden.</p>')+'</div><div id="fmvErr" style="color:var(--bad);font-size:13px;min-height:18px"></div></div>',"narrow"); }
F.action("mfmv",function(i){ if(!FMV) return; var x=FMV.t[+i]; if(!x) return; doMove(FMV.acc,FMV.path,x.parent,function(msg){ var e=document.getElementById("fmvErr"); if(e) e.textContent=msg; }); });
function fDelete(acc,path){
  var nm=folderName(path,acc), n=inFolder(acc,path).length;
  function run(force){
    folderApi({op:"delete",account:acc,path:path,force:!!force}).then(function(j){
      if(j&&j.error==="not_empty"&&!force){ ask(j.messages||n); return; }
      if(!j||j.ok===false||j.error){ F.toast(ferr(j),true); if(j&&j.error==="unknown_folder") M.scheduleReload(300); return; }
      var tp=boxOf(acc,TRASHRX,"\\Trash");
      S.folders=S.folders.filter(function(f){ return !((f.account||primaryAcct())===acc&&f.path===path); });
      S.messages.forEach(function(m){ if(accOf(m)===acc&&(m.folder||"INBOX")===path){ if(tp) m.folder=tp; else m.deleted=true; } });
      if(UI.mf==="f:"+acc+"|"+path){ UI.mf="inbox"; UI.msel=null; UI.mpick={}; }
      fdone("Ordner „"+nm+"“ gelöscht"+(j.moved?" – "+j.moved+" Mail(s) im Papierkorb":""));
    });
  }
  function ask(cnt){ F.confirm("Ordner „"+nm+"“ enthält "+cnt+" Mail"+(cnt===1?"":"s")+" – in den Papierkorb verschieben und Ordner löschen?","Verschieben & löschen",function(){ run(true); },true); }
  if(n>0) ask(n); else F.confirm("Ordner „"+nm+"“ löschen?","Löschen",function(){ run(false); },true);
}
function fMarkRead(list){ /* list: [{acc,path}] */
  var left=list.length, bad=null, cnt=0;
  if(!left) return;
  list.forEach(function(x){ folderApi({op:"markread",account:x.acc,path:x.path}).then(function(j){
    if(!j||j.ok===false||j.error) bad=j; else inFolder(x.acc,x.path).forEach(function(m){ if(!m.read){ m.read=true; cnt++; } });
    S.folders.forEach(function(f){ if((f.account||primaryAcct())===x.acc&&f.path===x.path&&!bad) f.unread=0; });
    if(--left===0){ if(bad) F.toast(ferr(bad),true); else fdone("Alle als gelesen markiert"+(cnt?" ("+cnt+")":"")); }
  }); });
}
function fEmpty(kind){
  var rx=kind==="trash"?TRASHRX:SPAMRX, sp=kind==="trash"?"\\Trash":"\\Junk", lbl=kind==="trash"?"Papierkorb":"Spam";
  var list=scopeAccs().map(function(a){ return {acc:a,path:boxOf(a,rx,sp)}; }).filter(function(x){ return x.path; });
  if(!list.length){ F.toast("Kein "+lbl+"-Ordner gefunden",true); return; }
  var n=0; list.forEach(function(x){ n+=inFolder(x.acc,x.path).length; });
  F.confirm(lbl+" leeren? "+(n?n+" Mail(s) werden":"Alle Mails darin werden")+" endgültig gelöscht – das kann nicht rückgängig gemacht werden.","Endgültig leeren",function(){
    var left=list.length, bad=null, del=0;
    list.forEach(function(x){ folderApi({op:"empty",account:x.acc,path:x.path}).then(function(j){
      if(!j||j.ok===false||j.error) bad=j; else { del+=j.deleted||0; S.messages=S.messages.filter(function(m){ return !(accOf(m)===x.acc&&(m.folder||"INBOX")===x.path); }); }
      if(--left===0){ if(bad) F.toast(ferr(bad),true); else fdone(lbl+" geleert"+(del?" ("+del+" Mails)":"")); }
    }); });
  },true);
}
/* Menü für einen Ordner-Knopf aufbauen; null = kein Menü */
function folderMenuItems(el){
  var act=el.getAttribute("data-act")||"", items=[];
  if(el.classList.contains("fdiv")){ var fa=el.getAttribute("data-facc"); if(!fa) return null; return {title:multiAcc()?accInfo(fa).label:"",items:[{label:"Neuer Ordner…",act:function(){ fCreate(fa,""); }}]}; }
  if(act.indexOf("macct:")===0){ var ak=act.slice(6); if(ak==="all") return null;
    return {title:accInfo(ak).label||ak,items:[{label:"Neuer Ordner…",act:function(){ fCreate(ak,""); }},{label:"Posteingang: alle als gelesen markieren",act:function(){ fMarkRead([{acc:ak,path:"INBOX"}]); }}]}; }
  if(act.indexOf("mfolder:")!==0) return null;
  var key=act.slice(8);
  if(key==="inbox"){
    var accs=scopeAccs();
    accs.forEach(function(a){ items.push({label:"Neuer Unterordner"+(accs.length>1?" · "+(accInfo(a).label||a):"")+"…",act:function(){ fCreate(a,"INBOX"); }}); });
    items.push({sep:true},{label:"Alle als gelesen markieren",act:function(){ fMarkRead(accs.map(function(a){ return {acc:a,path:"INBOX"}; })); }});
    return {title:"Posteingang",items:items};
  }
  if(key==="trash"||key==="spam"){
    var rx=key==="trash"?TRASHRX:SPAMRX, spu=key==="trash"?"\\Trash":"\\Junk";
    var bl=scopeAccs().map(function(a){ return {acc:a,path:boxOf(a,rx,spu)}; }).filter(function(x){ return x.path; });
    if(key==="spam"&&bl.length) items.push({label:"Alle als gelesen markieren",act:function(){ fMarkRead(bl); }},{sep:true});
    items.push({label:"Leeren…",danger:true,act:function(){ fEmpty(key); }});
    return {title:key==="trash"?"Papierkorb":"Spam",items:items};
  }
  if(key.indexOf("f:")!==0) return null;
  var p=parseFolderKey(key), acc=p.acc, path=p.path, special=fSpecial(acc,path);
  items.push({label:"Neuer Unterordner…",act:function(){ fCreate(acc,path); }});
  if(!special) items.push({label:"Umbenennen…",act:function(){ fRename(acc,path); }},{label:"Verschieben nach…",act:function(){ fMove(acc,path); }});
  items.push({label:"Alle als gelesen markieren",act:function(){ fMarkRead([{acc:acc,path:path}]); }});
  if(!special) items.push({sep:true},{label:"Löschen…",danger:true,act:function(){ fDelete(acc,path); }});
  return {title:folderName(path,acc),items:items};
}
var FSEL=".mfold .fbtn,.mfold .accbtn,.mfold .fdiv";
var lp={t:null,x:0,y:0,el:null,at:0};
function openFolderMenu(el,x,y){ var mi=folderMenuItems(el); if(!mi||!M.ctx) return false; M.ctx(x,y,mi.items,mi.title); return true; }
F.listen("contextmenu",FSEL,function(el,e){
  clearTimeout(lp.t); lp.t=null;
  if(Date.now()-lp.at<900){ e.preventDefault(); return; }   /* langes Drücken hat das Menü schon geöffnet */
  if(openFolderMenu(el,e.clientX,e.clientY)) e.preventDefault();
});
F.listen("keydown",FSEL,function(el,e){ if(e.key==="ContextMenu"||(e.shiftKey&&e.key==="F10")){ var r=el.getBoundingClientRect(); if(openFolderMenu(el,r.left+30,r.top+r.height/2)) e.preventDefault(); } });
document.addEventListener("touchstart",function(e){
  var el=e.target&&e.target.closest&&e.target.closest(FSEL); clearTimeout(lp.t); lp.t=null; if(!el||e.touches.length!==1) return;
  var t=e.touches[0]; lp.x=t.clientX; lp.y=t.clientY; lp.el=el;
  lp.t=setTimeout(function(){ lp.t=null; if(openFolderMenu(el,lp.x,lp.y)){ lp.at=Date.now(); try{ if(navigator.vibrate) navigator.vibrate(12); }catch(x){} } },500);
},{passive:true});
document.addEventListener("touchmove",function(e){ if(!lp.t) return; var t=e.touches[0]; if(Math.abs(t.clientX-lp.x)>10||Math.abs(t.clientY-lp.y)>10){ clearTimeout(lp.t); lp.t=null; } },{passive:true});
document.addEventListener("touchend",function(e){ if(lp.t){ clearTimeout(lp.t); lp.t=null; return; } if(Date.now()-lp.at<900&&e.cancelable) e.preventDefault(); });
document.addEventListener("touchcancel",function(){ clearTimeout(lp.t); lp.t=null; });
/* Klick direkt nach langem Drücken nicht als Ordnerwechsel werten (vor allen anderen Klick-Handlern) */
window.addEventListener("click",function(e){ if(Date.now()-lp.at<900&&e.target&&e.target.closest&&e.target.closest(FSEL)){ e.preventDefault(); e.stopPropagation(); } },true);
/* Escape schließt das Menü auch ohne Fokus darin (z. B. nach langem Drücken) – das Ordnerblatt bleibt offen */
document.addEventListener("keydown",function(e){ if(e.key!=="Escape"||!(M.ctxOpen&&M.ctxOpen())) return; var c=document.querySelector(".mctx"); if(c&&c.contains(e.target)) return; e.stopPropagation(); document.body.click(); },true);
M.folderMenu={create:fCreate,rename:fRename,move:fMove,del:fDelete,markRead:fMarkRead,empty:fEmpty};
F.action("msrch",function(){ UI.msrch=!UI.msrch; if(UI.msrch) UI.msrchFocus=true; F.render(); });
F.action("msrchx",function(){ UI.msrch=false; UI.mq=""; F.render(); });
/* Handy: weitere Aktionen als Blatt von unten */
/* „…“ im Lesebereich: seltene Aktionen (PC) bzw. alles, was oben keinen Platz hat (Handy) */
F.action("mxmore",function(v,el){
  var m=M.cur(); if(!m) return; var sp=isSpam(m), tr=isTrashed(m), mob=window.innerWidth<=900, go=function(op){ return function(){ F.actions.mx(op,null); }; }, its=[];
  /* am PC sind Termin und KI oben, außer der Lesebereich ist schmal (dann blendet CSS sie dort aus) */
  var narrow=!mob&&el&&el.closest&&el.closest(".mread")&&el.closest(".mread").clientWidth<860;
  if(!tr){
    if(mob) its.push({label:"Allen antworten",icon:"replyall",act:go("replyall")},{label:"Weiterleiten",icon:"forward",act:go("forward")},{sep:true},
      {label:m.starred?"Markierung entfernen":"Markieren",icon:m.starred?"starfill":"star",act:go("star")});
    if(mob||narrow) its.push({label:"Als Termin",icon:"cal",act:go("termin")});
    var ci=M.custItems(m);
    if(its.length) its.push({sep:true});
    if(ci.cust) its.push(ci.cust);
    its.push({label:"Als Aufgabe",icon:"board",act:go("auftrag")},{label:"Rechnung erstellen",icon:"inv",act:go("rechnung")},{label:"Angebot erstellen",icon:"inv",act:go("angebot")});
    if(ci.pay) its.push(ci.pay);
    its.push({label:"Überweisung anlegen",icon:"pay",act:go("zahlung")});
    if((mob||narrow)&&F.actions.kimsum){ its.push({sep:true},{label:"KI: Zusammenfassen",icon:"spark",act:function(){ F.actions.kimsum(m.id); }});
      if(!isSent(m)&&F.actions.kimreply) its.push({label:"KI: Antwort vorschlagen",icon:"spark",act:function(){ F.actions.kimreply(m.id); }}); }
    its.push({sep:true},{label:sp?"Kein Spam":"Als Spam",icon:sp?"inboxin":"spam",act:go(sp?"notspam":"spam")});
  }
  its.push({label:"Drucken",icon:"print",act:go("print")},{label:"In Webmail öffnen",icon:"ext",act:function(){ F.actions.mwebmail(); }});
  var p=menuPos(el&&el.isConnected?el:null); M.ctx(p[0],p[1],its,"Weitere Aktionen");
});
/* KI-Knopf: Zusammenfassen / Antwortvorschlag / Assistent (ki-mail.js) */
F.action("mxki",function(v,el){
  var m=M.cur(); if(!m||!F.actions.kimsum) return; var its=[{label:"Zusammenfassen",icon:"spark",act:function(){ F.actions.kimsum(m.id); }}];
  if(!isSent(m)&&F.actions.kimreply) its.push({label:"Antwort vorschlagen",icon:"reply",act:function(){ F.actions.kimreply(m.id); }});
  if(F.actions.kimask) its.push({label:"Im Assistenten nachfragen",icon:"spark",act:function(){ F.actions.kimask(m.id); }});
  var p=menuPos(el&&el.isConnected?el:null); M.ctx(p[0],p[1],its,"KI zu dieser Mail");
});
var _go=F.go; F.go=function(id){ if(id!=="post") document.body.classList.remove("m-read"); return _go.apply(this,arguments); };

/* ---------- Gelesen, Stern ---------- */
function setRead(msgs,read){ msgs=msgs.filter(function(m){ return m&&!m.local; }); if(!msgs.length) return; msgs.forEach(function(m){ M.setOv(m,{read:read}); }); M.action(read?"seen":"unseen",msgs); M.changed(); F.render(); }
function toggleStar(m){ if(!m||m.local) return; var on=!m.starred; M.setOv(m,{starred:on}); M.action(on?"flag":"unflag",[m]); M.changed(); F.render(); }
M.setRead=setRead; M.toggleStar=toggleStar;
F.action("mstar",function(id){ toggleStar(find(id)); });
F.action("mailunread",function(id){ setRead([find(id)],false); });
function togglePick(id,range){
  if(range&&UI.mlast){ var list=M.viewIds(), i1=list.indexOf(UI.mlast), i2=list.indexOf(id); if(i1>-1&&i2>-1){ for(var k=Math.min(i1,i2);k<=Math.max(i1,i2);k++) if(find(list[k])) UI.mpick[list[k]]=true; } }
  else { if(UI.mpick[id]) delete UI.mpick[id]; else UI.mpick[id]=true; }
  UI.mlast=id; F.render();
}
M.togglePick=togglePick;
F.action("mpick",function(id,el,e){ togglePick(id,e&&e.shiftKey); });

/* ---------- Verschieben, Spam ---------- */
function moveMessages(ids,target,op,doneMsg){
  var msgs=ids.map(find).filter(function(m){ return m&&!m.local; }); if(!msgs.length) return;
  op=op||"move"; var acc=accOf(msgs[0]);
  if(target&&op==="move"&&target.indexOf("|")>-1){ var bi=target.indexOf("|"), tAcc=target.slice(0,bi); target=target.slice(bi+1); if(tAcc!==acc){ F.toast("Mails können nicht zwischen verschiedenen Konten verschoben werden",true); return; } }
  var other=msgs.filter(function(m){ return accOf(m)!==acc; }).length;
  msgs=msgs.filter(function(m){ return accOf(m)===acc; });
  var dest=op==="spam"?spamPath(acc):target;
  M.action(op,msgs,dest);
  var mids=msgs.map(function(m){return m.id;});
  var nxt=mids.indexOf(UI.msel)>-1?neighborId(mids):UI.msel;
  msgs.forEach(function(m){ M.setOv(m,{folder:dest,deleted:false}); delete UI.mpick[m.id]; });
  UI.msel=nxt; M.changed(); F.render(); M.scheduleReload();
  F.toast((doneMsg||(op==="spam"?"Als Spam markiert":"Verschoben nach „"+(dest==="INBOX"?"Posteingang":folderName(dest,acc))+"“"))+(other?" – "+other+" Mail(s) aus anderem Konto übersprungen":""));
}
M.moveMessages=moveMessages;
/* ---------- Archivieren: in den Archiv-Ordner des Kontos (\\Archive oder „Archiv“); fehlt er, nach Rückfrage anlegen ---------- */
var ARX=/^(INBOX[.\/])?(archive|archiv|archives)$/i;
var ARC={k:"",m:{}};   /* je Darstellung nur einmal suchen (wird für jede Zeile gefragt) */
function archivePath(acc){ var k=S.ver+"|"+S.folders.length; if(ARC.k!==k) ARC={k:k,m:{}}; if(acc in ARC.m) return ARC.m[acc];
  var mine=S.folders.filter(function(x){ return (x.account||primaryAcct())===acc; });
  var f=mine.filter(function(x){ return /\\Archive/i.test(x.special||""); })[0]||mine.filter(function(x){ return ARX.test(x.path); })[0]; return (ARC.m[acc]=f?f.path:""); }
function canArchive(m){ if(!m||m.local||m.outbox||m.draftLocal||isTrashed(m)||isDraftBox(m)||isSpam(m)) return false; var p=archivePath(accOf(m)); return !p||(m.folder||"INBOX")!==p; }
function archiveMessages(ids){
  var msgs=ids.map(find).filter(canArchive);
  if(!msgs.length){ var f0=find(ids[0]); if(f0&&!isTrashed(f0)&&archivePath(accOf(f0))===(f0.folder||"")) F.toast("Liegt bereits im Archiv"); return; }
  var acc=accOf(msgs[0]), ok=msgs.filter(function(m){ return accOf(m)===acc; }).map(function(m){ return m.id; }), p=archivePath(acc);
  var n=ok.length, msg=(n>1?n+" Mails":"Mail")+" archiviert";
  if(p){ moveMessages(ok,p,"move",msg); return; }
  F.confirm("Es gibt noch keinen Archiv-Ordner"+(multiAcc()?" im Konto „"+(accInfo(acc).label||acc)+"“":"")+". Ordner „Archiv“ anlegen und "+(n>1?"die "+n+" Mails":"die Mail")+" dorthin verschieben?","Anlegen & archivieren",function(){
    folderApi({op:"create",account:acc,parent:"",name:"Archiv"}).then(function(j){
      if(j&&j.error==="exists"){ M.loadFull().then(function(){ var p2=archivePath(acc); if(p2) moveMessages(ok,p2,"move",msg); else F.toast("Archiv-Ordner nicht gefunden – bitte im Webmail prüfen",true); }); return; }
      if(!j||j.ok===false||j.error){ F.toast(ferr(j),true); return; }
      var path=j.path||"Archiv"; if(!fmeta(acc,path)) S.folders.push({account:acc,path:path,name:"Archiv",special:"",delim:fdelim(acc,""),total:0,unread:0});
      moveMessages(ok,path,"move",msg);
    });
  });
}
M.archive=archiveMessages; M.canArchive=canArchive;
M.showMoveMenu=function(x,y,ids){
  var first=find(ids[0]); if(!first) return; var acc=accOf(first), cur=first.folder||"INBOX";
  var its=moveTargets(acc).filter(function(f){ return !(ids.length===1&&f.path===cur&&!first.deleted); }).map(function(f){ return {label:f.name,act:function(){ moveMessages(ids,f.path,"move"); }}; });
  if(!its.length) its=[{label:"Keine weiteren Ordner",act:function(){}}];
  setTimeout(function(){ M.ctx(x,y,its,"Verschieben nach"); },0);
};
function menuPos(el){ var r=el?el.getBoundingClientRect():{left:window.innerWidth/2-100,bottom:140}; return [r.left,r.bottom+4]; }
M.menuPos=menuPos;

/* ---------- Papierkorb mit Rückgängig ---------- */
var UNDO={timer:null,items:[],ids:[]};
/* Löschungen, die noch nicht beim Mailserver sind, im Gerät merken – am Handy wird die App oft weggewischt, bevor gesendet ist */
var PKEY="fsc_mail_pend";
function pendSave(){ var cur=F.ls(PKEY)||[]; UNDO.items.forEach(function(it){ if(!cur.some(function(x){ return x.uid===it.uid&&x.folder===it.folder&&x.account===it.account; })) cur.push(Object.assign({at:Date.now()},it)); }); F.ls(PKEY,cur.slice(-300)); }
function pendDrop(its){ var cur=(F.ls(PKEY)||[]).filter(function(x){ return !its.some(function(it){ return it.uid===x.uid&&it.folder===x.folder&&it.account===x.account; }); }); F.ls(PKEY,cur); }
function pendResend(){ var cur=(F.ls(PKEY)||[]).filter(function(x){ return Date.now()-(x.at||0)<3*864e5; }); if(!cur.length){ F.ls(PKEY,[]); return; }
  var its=cur.map(function(x){ return {folder:x.folder,uid:x.uid,account:x.account}; });
  F.api("/admin/api/mail-action",{body:{op:"trash",items:its}}).then(function(j){ if(j&&(j.ok!==false&&!j.error||j.error==="action_partly_failed")){ pendDrop(its); M.scheduleReload(1500); } }).catch(function(){}); }
setTimeout(pendResend,2500);
function flushUndo(){
  if(UNDO.timer){ clearTimeout(UNDO.timer); UNDO.timer=null; }
  if(!UNDO.ids.length) return;
  var ids=UNDO.ids, its=UNDO.items; UNDO.ids=[]; UNDO.items=[];
  ids.forEach(function(id){ var m=find(id); if(m&&m.deleted) M.setOv(m,{flushed:true}); });
  /* Mails ohne gültige UID (z. B. gerade verschoben) nicht stillschweigend auslassen: nach dem Neuladen erneut versuchen */
  var skipped=ids.filter(function(id){ var m=find(id); return m&&!m.local&&!its.some(function(it){ return it.uid===m.uid&&it.folder===(m.folder||"INBOX"); }); });
  if(skipped.length) setTimeout(function(){ M.loadFull().then(function(){ var again=skipped.map(find).filter(function(m){ return m&&!TRASHRX.test(m.folder||"")&&m.uid!=null&&!pendingMove(m); }); if(again.length) sendTrash(items(again),again.map(function(m){return m.id;})); }); },2500);
  if(its.length) sendTrash(its,ids);
  M.scheduleReload(3000);
}
function sendTrash(its,ids){
  var revert=function(failed){
    var back=ids.map(find).filter(function(m){ return m&&m.deleted&&(!failed||failed.some(function(f){ return String(f.uid)===String(m.uid)&&f.folder===(m.folder||"INBOX"); })); });
    back.forEach(function(m){ M.setOv(m,{deleted:false,trashedAt:null,flushed:false}); if(OV[m.id]) delete OV[m.id].deleted; });
    if(back.length){ M.changed(); F.render(); }
    return back.length;
  };
  F.api("/admin/api/mail-action",{body:{op:"trash",items:its}}).then(function(j){
    if(j&&j.ok!==false&&!j.error){ pendDrop(its); return; }
    var n=revert(j&&Array.isArray(j.failed)?j.failed:null);
    F.toast((n?(n>1?n+" Mails konnten":"Die Mail konnte"):"Mails konnten")+" am Mailserver nicht gelöscht werden – bitte nochmal versuchen",true);
  }).catch(function(){ var n=revert(null); F.toast("Keine Verbindung zum Mailserver – "+(n?"Mail wieder eingeblendet, bitte nochmal löschen":"bitte nochmal versuchen"),true); });
}
M.flushUndo=flushUndo;
function beacon(){
  if(!UNDO.items.length) return;
  var payload=JSON.stringify({op:"trash",items:UNDO.items}); UNDO.items=[]; UNDO.ids=[];
  if(UNDO.timer){ clearTimeout(UNDO.timer); UNDO.timer=null; }
  try{ if(navigator.sendBeacon&&navigator.sendBeacon("/admin/api/mail-action",new Blob([payload],{type:"application/json"}))) return; }catch(e){}
  try{ fetch("/admin/api/mail-action",{method:"POST",headers:{"Content-Type":"application/json"},body:payload,keepalive:true,credentials:"same-origin"}); }catch(e){}
}
window.addEventListener("pagehide",beacon);
document.addEventListener("visibilitychange",function(){ if(document.hidden&&UNDO.items.length) flushUndo(); });   // App weggewischt/gesperrt: sofort senden (Handy)
window.addEventListener("beforeunload",beacon);
function trashMessages(ids){
  var msgs=ids.map(find).filter(function(m){ return m&&!isTrashed(m); });
  if(!msgs.length){ if(ids.some(function(id){ return !find(id); })){ F.toast("Die Mail hat sich inzwischen geändert – Liste wird aktualisiert",true); M.loadFull(); } return; }
  flushUndo();
  var mids=msgs.map(function(m){return m.id;});
  var nxt=mids.indexOf(UI.msel)>-1?neighborId(mids):UI.msel;
  var now=new Date().toISOString();
  msgs.forEach(function(m){ M.setOv(m,{deleted:true,trashedAt:now,flushed:false}); delete UI.mpick[m.id]; });
  var locals=msgs.filter(function(m){ return m.local; });
  if(locals.length){ M.local=M.local.filter(function(l){ return locals.indexOf(l)<0; }); S.messages=S.messages.filter(function(m){ return locals.indexOf(m)<0; }); }
  UNDO.ids=mids; UNDO.items=items(msgs); pendSave(); UNDO.timer=setTimeout(flushUndo,window.innerWidth<=900?4000:6000);
  UI.msel=nxt; M.changed(); F.render();
  F.toast((msgs.length>1?msgs.length+" Nachrichten":"Nachricht")+" gelöscht",false,"Rückgängig",function(){
    if(UNDO.timer){ clearTimeout(UNDO.timer); UNDO.timer=null; }
    var back=UNDO.ids.length?UNDO.ids:[]; pendDrop(UNDO.items); UNDO.ids=[]; UNDO.items=[];
    if(!back.length){ F.toast("Schon an den Server übertragen – im Papierkorb wiederherstellen",true); return; }
    back.forEach(function(id){ var m=find(id); if(m){ M.setOv(m,{deleted:false,trashedAt:null}); delete OV[id].deleted; } });
    if(back.length===1) UI.msel=back[0];
    M.changed(); F.render(); F.toast("Wiederhergestellt");
  });
}
M.trash=trashMessages;
/* Zur lokal gelöschten Mail die Kopie im Server-Papierkorb finden (neue UID nach dem Verschieben) */
function trashCopy(m){
  if(TRASHRX.test(m.folder||"")) return m;
  var acc=accOf(m);
  return S.messages.filter(function(x){ return x!==m&&TRASHRX.test(x.folder||"")&&accOf(x)===acc&&(m.messageId?x.messageId===m.messageId:((x.subject||"")===(m.subject||"")&&x.date===m.date)); })[0]||null;
}
function resolveTrash(m,cb){
  if(UNDO.ids.indexOf(m.id)>-1) flushUndo();
  var c=trashCopy(m); if(c) return cb(c);
  F.toast("Suche die Mail im Papierkorb …");
  setTimeout(function(){ M.loadFull().then(function(){ var mm=find(m.id)||m; cb(trashCopy(mm)); }); },1200);
}
function restore(ids){
  var msgs=ids.map(find).filter(function(m){ return m&&isTrashed(m); }); if(!msgs.length) return;
  var pend=msgs.filter(function(m){ return UNDO.ids.indexOf(m.id)>-1; });
  if(pend.length){ UNDO.ids=UNDO.ids.filter(function(id){ return !pend.some(function(m){return m.id===id;}); }); UNDO.items=items(UNDO.ids.map(find).filter(Boolean)); pend.forEach(function(m){ M.setOv(m,{deleted:false,trashedAt:null}); delete OV[m.id].deleted; }); }
  var rest=msgs.filter(function(m){ return pend.indexOf(m)<0; });
  if(!rest.length){ M.changed(); F.render(); F.toast("Wiederhergestellt"); return; }
  var done=0, ok=0;
  rest.forEach(function(m){ resolveTrash(m,function(c){
    done++;
    if(c){ ok++; M.action("move",[c],"INBOX"); M.setOv(c,{folder:"INBOX",deleted:false}); if(c!==m){ M.setOv(m,{deleted:false}); S.messages=S.messages.filter(function(x){ return x!==m; }); } }
    if(done===rest.length){ if(UI.msel&&rest.some(function(x){return x.id===UI.msel;})) UI.msel=null; M.changed(); F.render(); M.scheduleReload();
      if(ok===rest.length) F.toast(ok>1?ok+" Nachrichten wiederhergestellt":"In den Posteingang wiederhergestellt"); else F.toast((rest.length-ok)+" Mail(s) im Papierkorb des Servers nicht gefunden – bitte aktualisieren und erneut versuchen",true); }
  }); });
}
M.restore=restore;
function purge(ids){
  var msgs=ids.map(find).filter(function(m){ return m&&isTrashed(m); }); if(!msgs.length) return;
  F.confirm(msgs.length>1?msgs.length+" Nachrichten endgültig löschen?":"Nachricht endgültig löschen?","Endgültig löschen",function(){
    var done=0;
    msgs.forEach(function(m){ resolveTrash(m,function(c){
      done++; if(c){ M.action("trash",[c]); S.messages=S.messages.filter(function(x){ return x!==c; }); }
      S.messages=S.messages.filter(function(x){ return x!==m; });
      if(done===msgs.length){ if(msgs.some(function(x){return x.id===UI.msel;})) UI.msel=null; M.changed(); F.render(); F.toast("Endgültig gelöscht"); }
    }); });
  },true);
}
M.purge=purge;
function emptyTrash(){
  var n=S.messages.filter(function(m){ return isTrashed(m)&&acctOk(m); }).length; if(!n) return;
  F.confirm("Papierkorb wirklich leeren? "+n+" Nachricht(en) werden endgültig gelöscht.","Papierkorb leeren",function(){
    flushUndo();
    var go=function(){
      var tr=S.messages.filter(function(m){ return isTrashed(m)&&acctOk(m); }), srv=tr.filter(function(m){ return TRASHRX.test(m.folder||""); });
      var byAcc={}; srv.forEach(function(m){ (byAcc[accOf(m)]=byAcc[accOf(m)]||[]).push(m); });
      Object.keys(byAcc).forEach(function(k){ M.action("trash",byAcc[k]); });
      S.messages=S.messages.filter(function(m){ return tr.indexOf(m)<0; });
      UI.msel=null; UI.mpick={}; M.changed(); F.render(); F.toast("Papierkorb geleert"); M.scheduleReload(5000);
    };
    if(S.messages.some(function(m){ return m.deleted&&acctOk(m); })) setTimeout(function(){ M.loadFull().then(go); },1200); else go();
  },true);
}
F.action("mempty",emptyTrash);
F.action("mspamclear",function(){ var ids=mailView().filter(function(m){ return !m.outbox&&!m.draftLocal; }).map(function(m){return m.id;}); if(!ids.length) return; F.confirm(ids.length+" Spam-Nachricht(en) in den Papierkorb verschieben?","In den Papierkorb",function(){ trashMessages(ids); },true); });

/* ---------- Schnellaktionen in der Liste ---------- */
F.action("mqa",function(v,el,e){
  var i=v.indexOf("|"), op=v.slice(0,i), m=find(v.slice(i+1)); if(!m){ F.toast("Die Mail hat sich inzwischen geändert – Liste wird aktualisiert",true); M.loadFull(); return; }
  if(op==="read") setRead([m],!m.read);
  else if(op==="trash") trashMessages([m.id]);
  else if(op==="archive") archiveMessages([m.id]);
  else if(op==="restore") restore([m.id]);
  else if(op==="purge") purge([m.id]);
  else if(op==="move"){ var p=menuPos(el); M.showMoveMenu(p[0],p[1],[m.id]); }
});
/* ---------- Mehrfachauswahl ---------- */
F.action("mbulk",function(op,el){
  if(op==="clear"){ UI.mpick={}; F.render(); return; }
  if(op==="all"){ var all=mailView().filter(function(m){ return !m.outbox&&!m.draftLocal; }).map(function(m){return m.id;}); var on=all.length&&all.every(function(id){ return UI.mpick[id]; }); UI.mpick={}; if(!on) all.forEach(function(id){ UI.mpick[id]=true; }); F.render(); return; }
  var ids=M.selectedIds(); if(!ids.length) return;
  if(op==="read"||op==="unread"){ setRead(ids.map(find),op==="read"); UI.mpick={}; F.render(); }
  else if(op==="star"){ var msgs=ids.map(find).filter(function(m){return m&&!m.local;}), on2=!msgs.every(function(m){return m.starred;}); msgs.forEach(function(m){ M.setOv(m,{starred:on2}); }); M.action(on2?"flag":"unflag",msgs); UI.mpick={}; M.changed(); F.render(); }
  else if(op==="spam") moveMessages(ids,null,"spam");
  else if(op==="archive") archiveMessages(ids);
  else if(op==="trash"){ var tr=ids.filter(function(id){ return isTrashed(find(id)); }); if(tr.length===ids.length) purge(ids); else trashMessages(ids); }
  else if(op==="move"){ var p=menuPos(el); M.showMoveMenu(p[0],p[1],ids); }
});

/* ---------- Aktionen im Lesebereich ---------- */
M.cur=function(){ return UI.msel?find(UI.msel):null; };
F.action("mx",function(op,el){
  var m=M.cur(); if(!m){ F.toast("Die Mail hat sich inzwischen geändert – Liste wird aktualisiert",true); M.loadFull(); return; }
  if(op==="reply") M.reply(m,"reply");
  else if(op==="replyall") M.reply(m,"all");
  else if(op==="forward") M.reply(m,"fwd");
  else if(op==="todo") M.todoFromMail(m);
  else if(op==="termin") M.eventFromMail(m);
  else if(op==="auftrag"&&F.tkFromMail) F.tkFromMail(m);
  else if(op==="zahlung"&&F.payFromMail) F.payFromMail(m,null);
  else if(op==="rechnung"&&F.invoiceFromMail) F.invoiceFromMail(m,"");
  else if(op==="angebot"&&F.invoiceFromMail) F.invoiceFromMail(m,"offer");
  else if(op==="move"){ var p=menuPos(el&&el.isConnected?el:null); M.showMoveMenu(p[0],p[1],[m.id]); }
  else if(op==="spam") moveMessages([m.id],null,"spam");
  else if(op==="notspam") moveMessages([m.id],"INBOX","move");
  else if(op==="trash") trashMessages([m.id]);
  else if(op==="archive") archiveMessages([m.id]);
  else if(op==="restore") restore([m.id]);
  else if(op==="purge") purge([m.id]);
  else if(op==="read") setRead([m],true);
  else if(op==="unread") setRead([m],false);
  else if(op==="star") toggleStar(m);
  else if(op==="print") M.print(m);
  else if(op==="editdraft") M.editServerDraft(m);
  else if(op==="qrsend") M.quickReply(m);
});
F.action("mvoucher",function(v){ var i=v.indexOf("|"), m=find(v.slice(0,i)); if(!m) return; var idx=String(v.slice(i+1)); var a=(m.attachments||[]).filter(function(x){ return String(x.index||0)===idx; })[0]; if(a) M.openVoucher(m,a); else { F.toast("Anhang nicht gefunden – Postfach wird neu geladen",true); M.loadFull(); } });
/* Kompatibilität mit älteren Aufrufen */
F.action("reply",function(id){ var m=find(id); if(m) M.reply(m,"reply"); });
F.action("mailtodo",function(id){ var m=find(id); if(m) M.todoFromMail(m); });

/* ---------- Ziehen auf Ordner ---------- */
var dragIds=null, fdrag=null;
F.listen("dragstart","[data-fdrag]",function(el,e){ var v=el.getAttribute("data-fdrag"), i=v.indexOf("|"); if(i<0) return; fdrag={acc:v.slice(0,i),path:v.slice(i+1)}; el.classList.add("dragging"); try{ e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain","Ordner"); }catch(x){} });
function fdropTarget(el){ if(!fdrag) return null; var d=el.getAttribute("data-drop"), top=el.getAttribute("data-facc");
  var cur=fparent(fdrag.acc,fdrag.path);
  if(top!=null) return top===fdrag.acc&&cur!==""?{parent:""}:null;
  if(!d||d==="__trash"||d==="__spam") return null; var acc=fdrag.acc, path=d;
  if(d!=="INBOX"){ var i=d.indexOf("|"); if(i<0) return null; acc=d.slice(0,i); path=d.slice(i+1); }
  var dl=fdelim(fdrag.acc,fdrag.path); if(acc!==fdrag.acc||path===fdrag.path||path.indexOf(fdrag.path+dl)===0) return null;
  if(path===cur||(path==="INBOX"&&(cur==="INBOX"||(nsInbox(acc)&&cur==="")))) return null; return {parent:path}; }
F.listen("dragover","[data-drop],.mfold .fdiv[data-facc]",function(el,e){ if(!fdrag||!fdropTarget(el)) return; e.preventDefault(); document.querySelectorAll(".dropok").forEach(function(b){ if(b!==el) b.classList.remove("dropok"); }); el.classList.add("dropok"); });
F.listen("drop","[data-drop],.mfold .fdiv[data-facc]",function(el,e){ var t=fdropTarget(el); if(!fdrag||!t) return; e.preventDefault(); var x=fdrag; fdrag=null; el.classList.remove("dropok"); doMove(x.acc,x.path,t.parent); });
document.addEventListener("dragend",function(){ fdrag=null; });
F.listen("dragstart",'.mrow2[draggable="true"]',function(el,e){ var id=el.getAttribute("data-mid"); dragIds=UI.mpick[id]?M.selectedIds():[id]; el.classList.add("dragging"); try{ e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain",dragIds.length+" Mail(s)"); }catch(x){} });
document.addEventListener("dragend",function(){ dragIds=null; document.querySelectorAll(".dropok,.dragging").forEach(function(b){ b.classList.remove("dropok","dragging"); }); });
F.listen("dragover","[data-drop]",function(el,e){ if(!dragIds) return; e.preventDefault(); document.querySelectorAll(".dropok").forEach(function(b){ if(b!==el) b.classList.remove("dropok"); }); el.classList.add("dropok"); });
F.listen("drop","[data-drop]",function(el,e){ if(!dragIds) return; e.preventDefault(); var dst=el.getAttribute("data-drop"), ids=dragIds; dragIds=null; el.classList.remove("dropok");
  if(dst==="__trash") trashMessages(ids); else if(dst==="__spam") moveMessages(ids,null,"spam"); else moveMessages(ids,dst,"move"); });

/* ---------- Schnellsuche (⌘K) ---------- */
F.searcher(function(q){
  q=String(q||"").trim().toLowerCase(); if(q.length<2) return [];
  return S.messages.filter(function(m){ return !m.deleted&&!m.local&&((m.subject||"")+" "+(m.fromName||"")+" "+(m.from||"")+" "+(m.to||"")+" "+(m.toName||"")+" "+(m.preview||"")).toLowerCase().indexOf(q)>-1; })
    .sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,6)
    .map(function(m){ return {group:"Mails",label:m.subject||"(kein Betreff)",sub:(isSent(m)?"An "+(m.toName||m.to):(m.fromName||m.from))+" · "+fmtMailDate(m.date)+(M.folderKeyOf(m)!=="inbox"?" · "+(FNAMES[M.folderKeyOf(m)]||folderName(m.folder,accOf(m))):""),act:"mail:"+m.id}; });
});

/* ---------- Styles ---------- */
/* Alpenglas: nur die Postfach-Box ist Glas (Unschärfe als eigene Ebene ::before, nie auf .mbox/.mread selbst – sonst hängen fixierte Leisten fest);
   Spalten, Zeilen und Leisten darin sind durchsichtig. Ohne „glas“ (hell/dunkel/automatisch) bleibt alles deckend wie bisher. */
F.css([
".view-post{max-width:1500px;--m-bg:var(--panel);--m-list:var(--ground);--m-solid:var(--panel-solid,var(--panel));--m-bar:color-mix(in srgb,var(--ground) 88%,transparent);--m-blur:saturate(1.6) blur(14px);--m-search:var(--field,var(--panel))}",
":root[data-theme=\"glas\"] .view-post{--m-bg:color-mix(in srgb,var(--panel-solid) 58%,transparent);--m-list:color-mix(in srgb,var(--panel-solid) 80%,transparent);--m-bar:var(--glass-strong);--m-blur:var(--glass-blur);--m-search:var(--glass-strong)}",
"@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){:root[data-theme=\"glas\"] .view-post{--m-bg:color-mix(in srgb,var(--panel-solid) 90%,transparent)}}",
"@media (prefers-reduced-transparency:reduce){:root[data-theme=\"glas\"] .view-post{--m-bg:var(--panel-solid);--m-list:var(--panel-solid);--m-search:var(--panel-solid)}}",
".hnew{font-size:13px;vertical-align:middle;margin-left:6px}",
/* Werkzeugzeile: Ordnerknopf (schmale Fenster) + große Suche */
".mtools{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
".msearch{position:relative;flex:1;min-width:0;max-width:600px}",
".msearch>svg{position:absolute;left:13px;top:50%;width:17px;height:17px;transform:translateY(-50%);color:var(--ink-3);pointer-events:none}",
".msearch input{padding-left:40px;padding-right:34px}",
".mtools .msearch input{height:44px;border-radius:14px;background:var(--m-search);border-color:var(--glass-line,var(--line));font-size:14.5px;box-shadow:var(--glass-hi,0 0 0 0 transparent)}",
".msearch input::-webkit-search-cancel-button{display:none}",
".msearch .x{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--ink-3);padding:6px;display:grid;border-radius:8px}",
".msearch .x:hover{color:var(--ink);background:var(--hover,var(--sunk))}",
".msearch .x svg{width:15px;height:15px}",
".fpill{display:none;min-height:44px;border-radius:14px;max-width:min(320px,40vw)}",
".fpill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
".fpill svg{width:15px;height:15px;flex:none}",
/* Hinweis-Balken (Mail-Dienst gestört / Konto nicht verbunden) */
".mbanner{display:flex;align-items:center;flex-wrap:wrap;gap:10px 12px;padding:10px 12px 10px 14px;border-radius:var(--r-sm);border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);background:linear-gradient(var(--warn-soft),var(--warn-soft)),var(--m-solid);position:relative}",
".mbanner.bad{border-color:color-mix(in srgb,var(--bad) 45%,transparent);background:linear-gradient(var(--bad-soft),var(--bad-soft)),var(--m-solid)}",
".mb-i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--warn-soft);color:var(--warn);flex:none}.mb-i svg{width:19px;height:19px}",
".mbanner.bad .mb-i{background:var(--bad-soft);color:var(--bad)}",
".mb-t{flex:1 1 260px;min-width:0;display:grid;gap:1px}",
".mb-t b{font-size:14.5px;font-weight:700;color:var(--ink);text-wrap:balance}",
".mb-t span{font-size:13px;color:var(--ink-2);text-wrap:pretty;overflow-wrap:anywhere;hyphens:auto}",
".mb-a{display:flex;gap:6px;flex-wrap:wrap}.mb-a .btn svg{width:15px;height:15px}",
".mb-x{width:32px;height:32px;border:0;background:none;border-radius:8px;color:var(--ink-3);display:grid;place-items:center;flex:none}.mb-x:hover{background:var(--hover,var(--sunk));color:var(--ink)}.mb-x svg{width:15px;height:15px}",
/* Drei Spalten: Ordner | Liste | Lesebereich */
".mbox{display:grid;grid-template-columns:220px minmax(0,var(--mlist-w,370px)) minmax(0,1fr);gap:14px;align-items:start}",
".mlistp{position:relative}.mlist-rs{position:absolute;top:0;right:0;bottom:0;width:9px;cursor:col-resize;z-index:6;touch-action:none}.mlist-rs::after{content:\"\";position:absolute;top:0;bottom:0;right:0;width:2px;background:transparent;transition:background .15s}.mlist-rs:hover::after,.mlist-rs:focus-visible::after,.mrs-drag .mlist-rs::after{background:var(--glow)}.mlist-rs:focus-visible{outline:none}",
"body.mrs-drag{cursor:col-resize;user-select:none;-webkit-user-select:none}body.mrs-drag iframe{pointer-events:none}",
/* Ordnerspalte */
".mfold{display:grid;gap:2px;align-content:start;padding:10px 8px;position:sticky;top:60px;max-height:calc(100vh - 80px);overflow-y:auto;scrollbar-width:thin}",
".fbtn,.accbtn{display:flex;align-items:center;gap:10px;width:100%;min-height:36px;padding:6px 10px;border:0;background:none;border-radius:10px;color:var(--ink-2);font-weight:500;text-align:left;font-size:14px;min-width:0;transition:background .12s,color .12s}",
".fbtn svg{width:17px;height:17px;flex:none;color:var(--ink-3)}",
".fbtn .fl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
".fbtn:hover,.accbtn:hover{background:var(--hover,var(--sunk));color:var(--ink)}.fbtn:hover svg{color:var(--ink-2)}",
".fbtn[aria-current=true],.accbtn[aria-current=true]{background:var(--sel);color:var(--ink);font-weight:600}",
".fbtn[aria-current=true] svg{color:var(--glow)}",
".fbtn .n,.accbtn .n{margin-left:auto;font-size:12px;color:var(--ink-3);flex:none;font-variant-numeric:tabular-nums}",
".fbtn .n.hot,.accbtn .n.hot{background:var(--glow-soft);color:var(--glow-ink);border-radius:99px;padding:1px 8px;font-weight:700}",
".fbtn.warn,.fbtn.warn svg{color:var(--bad)}",
".fbtn.dropok{outline:2px dashed var(--glow);outline-offset:-2px}",
".mfold .fbtn,.mfold .accbtn,.mfold .fdiv{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}",
".fdiv{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:700;padding:14px 10px 4px}",
".accsw{display:grid;gap:2px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--line)}",
".adot{width:9px;height:9px;border-radius:50%;flex:none}",
".atx{display:grid;min-width:0}.atl,.atu{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.atu{font-size:11.5px;color:var(--ink-3);font-weight:500}",
".awarn{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--bad);color:var(--on-glow);font-size:12px;font-weight:800;flex:none}",
/* Mailliste */
".mlistp{display:flex;flex-direction:column;max-height:calc(100vh - 190px);min-height:320px;overflow:hidden}",
".mlh{display:flex;align-items:center;gap:10px;padding:12px 14px 4px;min-width:0}",
".mlh-t{flex:1;min-width:0;display:grid;gap:0}",
".mlh-t b{font-size:15.5px;font-weight:700;letter-spacing:-.01em;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
".mlh-t span{font-size:12px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}",
".mlh .link{white-space:nowrap;flex:none}",
".mlh-th{width:32px;height:32px;border:1px solid var(--line);background:none;border-radius:9px;color:var(--ink-3);display:grid;place-items:center;flex:none}.mlh-th svg{width:16px;height:16px}",
".mlh-th:hover{color:var(--ink);background:var(--hover,var(--sunk))}.mlh-th[aria-pressed=true]{color:var(--glow-ink);background:var(--sel);border-color:color-mix(in srgb,var(--glow) 45%,transparent)}",
"@media (min-width:901px){.mchips .chip.thchip{display:none}}",
".mchips{display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:6px 12px 10px;border-bottom:1px solid var(--line)}",
".mchips .chip{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 10px;background:transparent;border-color:var(--line)}",
".mchips .chip:hover{background:var(--hover,var(--sunk));color:var(--ink)}",
".mchips .chip[aria-pressed=true]{background:var(--sel);color:var(--ink);border-color:color-mix(in srgb,var(--glow) 45%,transparent)}",
".mchips .cn{font-size:11.5px;opacity:.8;font-variant-numeric:tabular-nums}",
".mchips .ci svg{width:14px;height:14px;display:block}",
".mscroll{overflow-y:auto;flex:1;min-height:0;overscroll-behavior:contain}",
".msinfo{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:9px 14px;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--ink-2)}",
".msinfo svg{width:14px;height:14px;opacity:.7}.msinfo .mu{color:var(--ink-3)}",
".msinfo .spin{display:inline-block;width:11px;height:11px;border:2px solid var(--line);border-top-color:var(--glow);border-radius:50%;animation:msspin .8s linear infinite;vertical-align:-1px}",
"@keyframes msspin{to{transform:rotate(360deg)}}",
".mrow2 mark{background:color-mix(in srgb,var(--warn) 38%,transparent);color:inherit;border-radius:3px;padding:0 1px}",
".mgrp{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);font-weight:700;padding:10px 14px 5px 18px;position:sticky;top:0;background:var(--m-solid);z-index:1;border-bottom:1px solid var(--line)}",
/* Zeile: Absender (fett), Betreff, Vorschau (gedämpft), Zeit rechts, Punkt = ungelesen; Zeilen sind durchsichtig */
".mrow2{display:grid;grid-template-columns:34px minmax(0,1fr);gap:11px;padding:10px 12px 10px 18px;border-bottom:1px solid var(--line);cursor:pointer;position:relative;touch-action:pan-y;background:transparent;transition:background .12s,transform .15s}",
".mrow2:hover{background:var(--hover,var(--sunk))}",
".mrow2.sel{background:var(--sel);box-shadow:inset 3px 0 0 var(--glow)}",
".mrow2.picked{background:var(--info-soft)}",
".mrow2.trashed{opacity:.75}",
".mrow2.dragging{opacity:.5}",
".mrow2.unread::before{content:'';position:absolute;left:6px;top:23px;width:7px;height:7px;border-radius:50%;background:var(--glow);box-shadow:0 0 0 3px var(--glow-soft)}",
".fmv{display:grid;gap:4px;max-height:50vh;overflow:auto}.fmv button{display:flex;align-items:center;gap:10px;border:1px solid var(--line);background:var(--sunk);border-radius:10px;padding:10px 12px;text-align:left;color:var(--ink);cursor:pointer;min-height:42px}.fmv button:hover{border-color:var(--glow);background:var(--hover,var(--sunk))}.fmv svg{width:16px;height:16px;color:var(--ink-3);flex:none}.fmv span{overflow-wrap:anywhere}",
".mfold .fbtn[draggable=true]{cursor:grab}.mfold .fdiv.dropok{color:var(--glow);background:var(--glow-soft);border-radius:8px}",
/* Unterhaltungen: Anzahl-Knopf in der Zeile, aufgeklappte ältere Mails eingerückt, Unterhaltung im Lesebereich */
".thn{display:inline-flex;align-items:center;gap:2px;border:1px solid var(--line);background:var(--sunk);color:var(--ink-2);border-radius:99px;font:600 11.5px/1 var(--f-body);padding:3px 5px 3px 8px;margin-left:6px;flex:none;cursor:pointer;font-variant-numeric:tabular-nums}.thn svg{width:12px;height:12px;transition:transform .15s}.thn.on svg{transform:rotate(180deg)}.thn:hover{border-color:var(--glow);color:var(--glow-ink)}",
".mrow2.thopen{border-bottom-color:transparent}.mrow2.thc{padding-left:46px;background:var(--sunk)}.mrow2.thc .mav{width:28px;height:28px;font-size:11px}.mrow2.thc .pre{display:none}.mrow2.thc .l1 .who{font-weight:500}",
".rconv{display:grid;gap:6px;margin-top:6px}.rc{border:1px solid var(--line);border-radius:12px;background:var(--sunk);overflow:hidden}.rc.open{border-color:var(--line-2,var(--line))}",
".rch{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;border:0;background:none;text-align:left;padding:9px 12px;color:var(--ink);cursor:pointer;min-height:48px}.rch:hover{background:var(--hover,var(--sunk))}.rch .mav{width:30px;height:30px;font-size:11.5px}",
".rcw{display:grid;min-width:0}.rcw b{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rcw small{font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
".rcd{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--ink-3);white-space:nowrap}.rcd svg{width:13px;height:13px;transition:transform .15s}.rc.open .rcd svg{transform:rotate(180deg)}",
".rcb{padding:4px 12px 12px;display:grid;gap:10px}.rcb .mframe{min-height:220px}.rca{display:flex;justify-content:flex-end}",
"details.mq{margin-top:10px}details.mq>summary{cursor:pointer;display:inline-block;list-style:none;font-size:12.5px;color:var(--ink-3);border:1px solid var(--line);background:var(--sunk);border-radius:99px;padding:2px 10px}details.mq>summary::-webkit-details-marker{display:none}details.mq>div{margin-top:8px;color:var(--ink-3);white-space:pre-wrap}",
".mav{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12.5px;font-weight:700;flex:none;cursor:pointer;user-select:none;-webkit-user-select:none}",
".mav.lg{width:44px;height:44px;font-size:14.5px;cursor:default}",
".mav .ck{display:none}.mav .ck svg{width:16px;height:16px}",
".mrow2.picked .mav{background:var(--info)!important;color:var(--on-glow)!important}",
".mrow2.picked .mav .i{display:none}.mrow2.picked .mav .ck{display:grid}",
".mm{min-width:0;display:grid;gap:2px}",
".mm .l1,.mm .l2{display:flex;gap:6px;align-items:center;min-width:0}",
".mm .who{font-weight:600;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-size:14px}",
".mrow2.unread .who{font-weight:700;color:var(--ink)}",
".mm .when{font-size:12px;color:var(--ink-3);white-space:nowrap;margin-left:auto;flex:none;font-variant-numeric:tabular-nums}",
".mrow2.unread .when{color:var(--glow-ink);font-weight:600}",
".mm .subj{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;flex:1;min-width:0;color:var(--ink-2)}",
".mrow2.unread .subj{font-weight:600;color:var(--ink)}",
".mm .pre{font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
".mm .tag{flex:none}",
".ics{display:flex;gap:4px;color:var(--ink-3);flex:none}.ics svg{width:14px;height:14px;display:block}",
".star{border:0;background:none;padding:2px;color:var(--ink-3);line-height:0;flex:none;border-radius:6px}.star svg{width:15px;height:15px}",
".star.on{color:var(--warn)}.star:hover{color:var(--warn)}",
"@media (hover:hover){.mrow2:not(:hover):not(:focus-within) .star:not(.on){opacity:0}}",
".accpill{font-size:11px;font-weight:600;padding:0 7px;border-radius:99px;white-space:nowrap;flex:none}",
/* Schnellaktionen beim Überfahren (deckend, damit nichts durchscheint) – oben in der Absender-/Datumszeile, damit der Unterhaltungs-Knopf in der Betreffzeile klickbar bleibt */
".mqa{position:absolute;right:10px;top:3px;display:none;gap:1px;background:var(--m-solid);border:1px solid var(--line-2,var(--line));border-radius:10px;padding:2px;box-shadow:0 6px 18px rgb(0 0 0/.22)}",
".mrow2:hover .mqa,.mrow2:focus-visible .mqa,.mqa:focus-within{display:flex}",
"@media (hover:none){.mrow2:hover .mqa{display:none}}",
".mqa button{border:0;background:none;width:30px;height:24px;border-radius:7px;color:var(--ink-2);display:grid;place-items:center}",
".mqa button:hover{background:var(--hover,var(--sunk));color:var(--ink)}.mqa button.dg:hover{color:var(--bad);background:var(--bad-soft)}",
".mqa svg{width:15px;height:15px}",
/* Leere Zustände */
".mempty{display:grid;justify-items:center;gap:6px;padding:44px 22px;color:var(--ink-3);text-align:center;font-size:13.5px;text-wrap:pretty}",
".mempty b{color:var(--ink);font-size:16px;font-weight:700;text-wrap:balance}.mempty.tall{padding:90px 22px}",
".mempty .ei{width:52px;height:52px;border-radius:18px;background:var(--sunk);display:grid;place-items:center;color:var(--ink-2);margin-bottom:4px}.mempty .ei svg{width:24px;height:24px}",
".mempty .ea{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px}.mempty .ea .btn svg{width:15px;height:15px}",
".mempty.busy .ei svg{animation:msspin 1s linear infinite}",
".kbd{display:inline-block;font-family:var(--f-mono);font-size:11.5px;line-height:1.5;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;background:var(--sunk);color:var(--ink-2);min-width:20px;text-align:center}",
/* Lesebereich: Werkzeugleiste mit Beschriftung, die bei wenig Platz schrittweise zu Symbolen wird */
".mread{display:flex;flex-direction:column;max-height:calc(100vh - 130px);min-height:320px;overflow:hidden;position:sticky;top:60px}",
".rtool{display:flex;gap:4px;flex-wrap:wrap;padding:8px 10px;border-bottom:1px solid var(--line);align-items:center}",
".rb{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;min-width:36px;border:1px solid transparent;background:none;border-radius:10px;padding:0 9px;color:var(--ink-2);font-size:13px;font-weight:600;white-space:nowrap;transition:background .12s,color .12s}",
".rb.l1,.rb.l2,.rb.l3,.rb.l4{padding:0 12px 0 10px}",
".rb:hover{background:var(--hover,var(--sunk));color:var(--ink)}",
".rb svg{width:18px;height:18px;flex:none}",
".rb.dg:hover{color:var(--bad);background:var(--bad-soft)}.rb.on,.rb.on:hover{color:var(--warn)}.rb.ki svg{color:var(--glow)}",
".rb.pri{background:var(--btn-pri,var(--glow));border-color:var(--btn-pri,var(--glow));color:var(--btn-pri-ink,var(--on-glow));box-shadow:0 4px 14px rgb(0 0 0/.16)}.rb.pri:hover{background:var(--btn-pri,var(--glow));color:var(--btn-pri-ink,var(--on-glow));filter:brightness(1.07)}",
".rsep{width:1px;height:22px;background:var(--line);margin:0 4px;flex:none}.rsp{flex:1}",
".rb-back{display:none}",
".rin{padding:18px 22px 24px;overflow-y:auto;display:grid;gap:14px;align-content:start;min-width:0;flex:1;overscroll-behavior:contain}",
".rsubj{font-size:21px;font-weight:700;overflow-wrap:anywhere;line-height:1.25;text-wrap:balance;hyphens:auto}",
".rtags{display:flex;gap:6px;flex-wrap:wrap;margin-top:-6px}",
".tagbtn{border:0;cursor:pointer}",
".rsender{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center}",
".rw{display:grid;gap:2px;min-width:0}",
".rn{font-weight:600;font-size:15px;overflow-wrap:anywhere}",
".raddr{border:0;background:none;padding:0;color:var(--info);font:inherit;font-weight:500;font-size:13.5px;cursor:pointer;overflow-wrap:anywhere;text-align:left}",
".raddr:hover{text-decoration:underline}",
".rto{font-size:13px;color:var(--ink-3);overflow-wrap:anywhere}",
".rdate{font-size:12.5px;color:var(--ink-3);text-align:right;display:grid;font-variant-numeric:tabular-nums}",
/* Kunden-Zeile unter dem Absender: kompakte Chips, am PC eine Zeile (Namen kürzen sich), am Handy umbrechend */
".rcust{display:flex;align-items:center;gap:6px;min-width:0;flex-wrap:nowrap;margin-top:-4px;padding:1px 0}",
".rcust .tag.tagbtn{display:inline-flex;align-items:center;gap:5px;flex:0 1 auto;min-width:0;max-width:100%;margin:0;padding:3px 10px 3px 8px;min-height:26px;font:600 12.5px/1.3 var(--f-body);border:1px solid transparent;transition:border-color .12s,background .12s}",
".rcust .tag.tagbtn:hover{border-color:color-mix(in srgb,currentColor 35%,transparent)}",
".rcust .tag.tagbtn:focus-visible{outline:2px solid var(--glow);outline-offset:1px}",
".rcust .tag>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
".rcust .tag svg{width:13px;height:13px;flex:none}",
".rcust .tag.rc-m,.rcust .tag.rc-n{flex-shrink:0;font-variant-numeric:tabular-nums}",
".rcust .tag.rc-k{flex-shrink:2;max-width:min(300px,100%)}.rcust .tag.rc-p{flex-shrink:3;max-width:min(260px,100%)}.rcust .tag.rc-k,.rcust .tag.rc-p{min-width:min(96px,100%)}",
".rcust .tag.rc-new{background:transparent;border-style:dashed;border-color:var(--line-2,var(--line));color:var(--ink-2)}",
".rcust .tag.rc-new:hover{color:var(--ink);background:var(--hover,var(--sunk))}",
/* Mail-Inhalt: HTML-Mails auf weißem „Papier“ (für weißen Hintergrund gestaltet), Text-Mails auf der Glasfläche */
".mframe{width:100%;height:max(440px,calc(100vh - 470px));border:1px solid var(--line);border-radius:14px;background:#fff;display:block}",
":root[data-theme=\"glas\"] .mframe{border-color:transparent;box-shadow:0 10px 30px rgb(0 0 0/.25)}",
".rin>.mbody,.rcb>.mbody{background:var(--sunk);border-radius:14px;padding:14px 16px;line-height:1.55;text-wrap:pretty}",
".mbody a{color:var(--info)}",
".attbox{border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:grid;gap:8px}",
".atth{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--ink-2);font-weight:600;flex-wrap:wrap;align-items:center}",
".atth svg{width:14px;height:14px;vertical-align:-2px}",
".atth .link{display:inline-flex;gap:5px;align-items:center;padding:0}",
".atth .atta{display:inline-flex;gap:14px;flex-wrap:wrap}.atth button.link{border:0;background:none;font:inherit;font-weight:600;color:var(--glow);cursor:pointer}",
".attl{display:flex;flex-wrap:wrap;gap:6px}",
".att{display:inline-flex;align-items:stretch;border:1px solid var(--line);border-radius:10px;overflow:hidden;max-width:100%;font-size:13px;background:var(--sunk)}",
".att>a,.att>button,.att>.ai{display:flex;align-items:center;gap:6px;padding:6px 10px;min-height:34px;text-decoration:none;color:var(--ink);border:0;background:none;min-width:0}",
".att>a:hover,.att>button:hover{background:var(--hover,var(--sunk))}",
".att>*+*{border-left:1px solid var(--line)!important}",
".att svg{width:15px;height:15px}",
".att .ak{font-size:10.5px;font-weight:700;font-family:var(--f-mono);color:var(--ink-3);text-transform:uppercase}",
".att .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;min-width:0}",
".att .sz{color:var(--ink-3);font-size:12px;white-space:nowrap}",
".att .done{color:var(--ok)}",
".qreply{border:1px solid var(--line);border-radius:14px;padding:10px 12px;display:grid;gap:6px;background:var(--field,var(--panel))}",
".qreply:focus-within{border-color:var(--glow);box-shadow:0 0 0 3px var(--glow-soft)}",
".qreply textarea{border:0;background:none;resize:vertical;min-height:64px;width:100%;font:inherit;color:inherit;outline:none}",
".qreply textarea::placeholder{color:var(--ink-3)}",
".qbar{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap}",
".qh{margin-right:auto;font-size:12px;color:var(--ink-3)}",
".rrel{display:grid;gap:2px}",
".ri{display:flex;gap:8px;align-items:center;border:0;background:none;padding:8px;border-radius:10px;text-align:left;font-size:13.5px;color:var(--ink);min-width:0;min-height:38px}",
".ri:hover{background:var(--hover,var(--sunk))}.ri svg{width:13px;height:13px}",
".ri .s{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.ri .d{font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums}",
/* Auswahl (PC) */
".mbulk{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 10px 8px 14px;border-radius:var(--r-sm);border:1px solid color-mix(in srgb,var(--info) 35%,transparent);background:linear-gradient(var(--info-soft),var(--info-soft)),var(--m-solid);position:sticky;top:56px;z-index:5}",
".mbulk>b{margin-right:4px;font-variant-numeric:tabular-nums}.mbulk .sp{flex:1}.mbulk .btn svg{width:15px;height:15px}",
/* Ordner-/Kontenblatt */
".sheetf{position:static;max-height:none;padding:0;overflow:visible;flex:none}",
".accseg{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;border-bottom:0;padding:2px 0 6px;margin:0;flex-shrink:0;min-height:50px}.accseg::-webkit-scrollbar{display:none}",
".accseg .accbtn{flex:none;width:auto;max-width:78vw;min-height:40px;border:1px solid var(--line);border-radius:99px;padding:6px 14px}",
".accseg .accbtn[aria-current=true]{border-color:color-mix(in srgb,var(--glow) 45%,transparent)}.accseg .atu{display:none}",
".sheeth{margin:10px 2px 0}.sheetrules{width:100%;justify-content:center;margin-top:10px;min-height:44px}",
/* Handy: Ordner-Chips und Wisch-Tipp nur am Handy */
".mapp,.mapp-s,.mselbar,.mfab,.mrbar,.msw-bg,.mptr,.mfstrip,.mtip{display:none}",
"@media (max-width:1180px){.mbox{grid-template-columns:minmax(0,var(--mlist-w,340px)) minmax(0,1fr)}.mbox>.mfold{display:none}.fpill{display:inline-flex}}",
/* Statusleiste rechts eingeblendet und Bildschirm unter ~1750 px: Ordner als Knopf, damit der Lesebereich breit genug bleibt */
"@media (min-width:901px) and (max-width:1750px){.app.has-side .mbox{grid-template-columns:minmax(0,var(--mlist-w,340px)) minmax(0,1fr)}.app.has-side .mbox>.mfold{display:none}.app.has-side .fpill{display:inline-flex}}",
/* PC: eine Glas-Box mit drei Spalten, feine Trennlinien statt eigener Flächen */
"@media (min-width:901px){",
"  .mbox{gap:0;background:var(--m-bg);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--shadow);overflow:clip}",
"  :root[data-theme=\"glas\"] .mbox{position:relative;z-index:0;background:transparent;border-color:var(--glass-line,var(--line));box-shadow:var(--glass-hi,0 0 0 0 transparent),var(--shadow)}",
"  :root[data-theme=\"glas\"] .mbox::before{content:\"\";position:absolute;inset:0;z-index:-1;background:var(--m-bg);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);pointer-events:none}",
"  .mfold{border-right:1px solid var(--line);padding:12px 8px}",
"  .mlistp{border-right:1px solid var(--line)}",
"  .mread{container-type:inline-size}",
"  .mav{width:34px;height:34px;font-size:12px}",
"}",
"@container (max-width:1239px){.rb.l4 .rl{display:none}.rb.l4{padding:0 9px}}",
"@container (max-width:999px){.rb.l3 .rl{display:none}.rb.l3{padding:0 9px}}",
"@container (max-width:859px){.rb.lx{display:none}}",
"@container (max-width:739px){.rb.l2 .rl{display:none}.rb.l2{padding:0 9px}.rtool{gap:2px}}",
"@container (max-width:859px){.rcust .rc-pre{display:none}}",
"@container (max-width:559px){.rcust{flex-wrap:wrap}}",
"@container (max-width:399px){.rb.l1 .rl{display:none}.rb.l1{padding:0 9px}.rsep{display:none}}",
":root{--m-blue:var(--glow);--m-red:var(--bad)}   /* Handy-Akzent (auch kalm.js/mobile.js) */",
"@media (max-width:900px){",
/* Grundgerüst: Kopf und Werkzeugleiste des Desktops weg, Liste randlos auf einer (getönten) Fläche ohne Lücken */
"  .view-post .head,.view-post .mtools,.view-post .mbulk,.view-post .mlh{display:none}",
"  .view-post{margin-top:-16px}.view.view-post{gap:0}",
"  .mbox{grid-template-columns:minmax(0,1fr);gap:0;margin-inline:calc(-1*clamp(16px,4vw,44px))}",
"  .mbox.reading>.mlistp{display:none}.mbox:not(.reading)>.mread{display:none}",
"  .mlistp,.mread{max-height:none;min-height:0;overflow:visible;position:static;border:0;border-radius:0;background:var(--m-list)}",
"  .mlistp{border-radius:0 0 22px 22px;padding-bottom:6px}",
"  .mlist-rs{display:none}",
"  .mscroll{overflow:visible}",
/* Kopfzeile wie Outlook (gemeinsam mit kalm.js) */
"  .mapp{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:20;margin-inline:calc(-1*clamp(16px,4vw,44px));padding:calc(10px + env(safe-area-inset-top,0px)) 12px 8px;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px)}",
"  .view-post .mapp{background:var(--m-bar);-webkit-backdrop-filter:var(--m-blur);backdrop-filter:var(--m-blur);border-bottom:1px solid var(--line)}",
"  .mapp-av{position:relative;width:40px;height:40px;border-radius:50%;border:0;background:var(--glow-soft);color:var(--glow-ink);font-weight:800;font-size:13px;display:grid;place-items:center;flex:none}",
"  .mapp-av i{position:absolute;top:0;right:0;width:10px;height:10px;border-radius:50%;background:var(--glow);box-shadow:0 0 0 2px var(--m-solid)}",
"  .mapp-t{flex:1;min-width:0;display:grid;text-align:left;border:0;background:none;color:inherit;font:inherit;padding:0;min-height:44px;align-content:center}",
"  .mapp-t b{font-size:19px;letter-spacing:-.01em;display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden}",
"  .mapp-t b svg{width:16px;height:16px;color:var(--ink-3);flex:none}",
"  .mapp-t span{font-size:12.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
"  .mapp-i{width:42px;height:42px;border-radius:50%;border:0;background:var(--sunk);color:var(--ink);display:grid;place-items:center;flex:none}",
"  .mapp-i.on{background:var(--sel);color:var(--glow)}",
"  .mapp-i svg{width:20px;height:20px}",
"  .mapp-x{border:0;background:none;color:var(--info);font:inherit;font-weight:600;padding:8px 4px;flex:none;min-height:44px}",
"  .view-post .mapp.sel{background:linear-gradient(var(--info-soft),var(--info-soft)),var(--m-bar)}",
"  .mapp-s{display:flex;gap:8px;align-items:center;padding:4px 12px 10px;margin-inline:calc(-1*clamp(16px,4vw,44px));position:sticky;top:calc(58px + env(safe-area-inset-top,0px));z-index:19;background:var(--m-bar);-webkit-backdrop-filter:var(--m-blur);backdrop-filter:var(--m-blur);border-bottom:1px solid var(--line)}",
"  .mapp-s .msearch{flex:1;max-width:none}.mapp-s input{border-radius:99px;background:var(--field,var(--sunk));border-color:var(--line);height:42px;font-size:16px}",
/* Hinweis-Balken randlos */
"  .view-post .mbanner{margin-inline:calc(-1*clamp(16px,4vw,44px));border-radius:0;border-width:0 0 1px;padding:12px 16px}",
"  .view-post .mbanner .btn{min-height:40px}",
"  body.m-read .view-post .mbanner,body.m-read .mfstrip{display:none}",
/* Ordner als Chips */
"  .mfstrip{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:10px 16px 2px;margin-inline:calc(-1*clamp(16px,4vw,44px));background:var(--m-list);position:relative;-webkit-overflow-scrolling:touch}",
"  .mfstrip::-webkit-scrollbar{display:none}",
"  .mfs{flex:none;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;border-radius:99px;border:1px solid var(--line);background:var(--sunk);color:var(--ink-2);font:inherit;font-weight:600;font-size:14px;white-space:nowrap}",
"  .mfs svg{width:17px;height:17px;flex:none}",
"  .mfs i{font-style:normal;font-size:12px;font-weight:700;background:var(--glow-soft);color:var(--glow-ink);border-radius:99px;padding:0 7px;line-height:19px;font-variant-numeric:tabular-nums}",
"  .mfs[aria-current=true]{background:var(--sel);border-color:color-mix(in srgb,var(--glow) 45%,transparent);color:var(--ink)}",
"  .mfs[aria-current=true] svg{color:var(--glow)}",
"  .mfs.warn,.mfs.warn svg{color:var(--bad)}.mfs.warn i{background:var(--bad-soft);color:var(--bad)}",
"  .mfs.more{color:var(--ink-3);border-style:dashed}",
/* Filter als wischbare Chips */
"  .mchips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding:8px 16px 10px;border-bottom:0;gap:8px}",
"  .mchips::-webkit-scrollbar{display:none}",
"  .mchips .chip{flex:none;min-height:36px;padding:0 14px;font-size:14px}",
"  .mgrp{position:static;background:none;border:0;padding:14px 16px 6px 20px;font-size:12px}",
/* Wisch-Tipp (einmalig) */
"  .mtip{display:flex;align-items:center;gap:10px;margin:2px 12px 8px;padding:10px 12px;border-radius:14px;background:var(--info-soft);color:var(--ink-2);font-size:13px;line-height:1.4;text-wrap:pretty}",
"  .mtip>svg{width:22px;height:22px;color:var(--info);flex:none}.mtip b{color:var(--ink)}.mtip .link{flex:none;min-height:40px;padding:0 4px}",
/* Zeilen */
"  .mrow2{grid-template-columns:44px minmax(0,1fr);gap:12px;padding:12px 16px 12px 20px;border-bottom:0;background:transparent;transition:transform .25s cubic-bezier(.2,.8,.2,1),background .2s}",
"  .mrow2::after{content:'';position:absolute;left:76px;right:0;bottom:0;border-bottom:1px solid var(--line)}",
"  .mrow2:hover{background:transparent}.mrow2:active{background:var(--hover,var(--sunk))}",
"  .mrow2.sel{background:transparent;box-shadow:none}",
"  .msw>.mrow2{background:var(--m-solid)}",
"  .mrow2.unread::before{left:7px;top:30px;width:8px;height:8px;box-shadow:none}",
"  .mav{width:44px;height:44px;font-size:14.5px}",
"  .mm{gap:2px}.mm .who{font-size:15.5px}.mm .when{font-size:12.5px}",
"  .mm .subj{font-size:14.5px}",
"  .mm .pre{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13.5px;line-height:1.4}",
"  .star{padding:4px}.star svg{width:17px;height:17px}",
"  .mrow2 .mqa{display:none!important}",
"  .mrow2.picked{background:var(--sel)}",
/* Wischen: farbige Aktion hinter der Zeile (rechts = gelesen, links = löschen) */
"  .msw{position:relative;overflow:hidden}",
"  .msw-bg{display:flex;position:absolute;inset:0;align-items:center;padding:0 24px;color:var(--on-glow);font-weight:700;font-size:14px;gap:10px}",
"  .msw-bg.l{background:var(--m-red);justify-content:flex-end}.msw-bg.r{background:var(--m-blue);justify-content:flex-start}",
"  .msw-bg svg{width:22px;height:22px;transition:transform .18s cubic-bezier(.2,.8,.2,1)}",
"  .msw-bg.go svg{transform:scale(1.3)}",
"  .msw-bg span{opacity:.7;transition:opacity .15s}.msw-bg.go span{opacity:1}",
"  .msw.out{transition:height .22s ease,opacity .22s ease}",
/* Ziehen zum Aktualisieren */
"  .mptr{display:grid;place-items:center;height:0;overflow:hidden;color:var(--ink-3);transition:height .2s}",
"  .mptr svg{width:20px;height:20px;transition:transform .2s}.mptr.ready svg{transform:rotate(180deg)}.mptr.spin svg{animation:mspin .8s linear infinite}",
"  @keyframes mspin{to{transform:rotate(360deg)}}",
/* Neue Mail: schwebender Knopf über der Reiterleiste */
"  .mfab{display:grid;place-items:center;position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));width:58px;height:58px;border-radius:18px;border:0;background:var(--btn-pri,var(--m-blue));color:var(--btn-pri-ink,var(--on-glow));box-shadow:0 10px 28px rgb(0 0 0/.3);z-index:25;transition:transform .25s cubic-bezier(.2,.8,.2,1)}",
"  .mfab.lbl{display:inline-flex;align-items:center;gap:8px;width:auto;height:54px;padding:0 20px 0 16px;border-radius:27px;font:inherit;font-weight:800;font-size:15px}",
"  body:has(.toast.on) .mfab{transform:translateY(-64px)}",
"  .toast{left:12px;right:12px;max-width:none;transform:translateY(20px);display:flex;justify-content:space-between;align-items:center;border-radius:14px;padding:13px 16px}.toast.on{transform:none}.toast .ta{flex:none}",
"  .mfab svg{width:22px;height:22px}",
"  .mfab:active{transform:scale(.94)}",
/* Auswahlleiste: schwebend wie die Reiterleiste (die solange ausgeblendet ist) */
"  .mselbar{display:flex;position:fixed;left:12px;right:12px;bottom:max(8px,calc(env(safe-area-inset-bottom,0px) - 10px));z-index:35;background:var(--m-bar);-webkit-backdrop-filter:var(--m-blur);backdrop-filter:var(--m-blur);border:1px solid var(--glass-line,var(--line));border-radius:28px;box-shadow:var(--glass-hi,0 0 0 0 transparent),var(--shadow-pop);padding:4px}",
"  body:has(.view-post .mselbar) .tabbar{display:none}",
"  .mselbar button{flex:1;min-width:0;border:0;background:none;display:grid;justify-items:center;align-content:center;gap:2px;font-size:11px;font-weight:600;color:var(--ink-2);padding:4px 0;min-height:52px;border-radius:24px}",
"  .mselbar button:active{background:var(--hover,var(--sunk))}",
"  .mselbar svg{width:22px;height:22px}.mselbar .dg{color:var(--bad)}",
"  body:has(.view-post .mselbar) main{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}",
/* Lesen: Vollbild, Navigation ausgeblendet */
"  body.m-read .tabbar,body.m-read .mfab{display:none}",
"  body.m-read main{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px))}",
"  .rtool{position:sticky;top:0;z-index:20;gap:2px;padding:calc(8px + env(safe-area-inset-top,0px)) 8px 8px;border-bottom:1px solid var(--line);background:var(--m-bar);-webkit-backdrop-filter:var(--m-blur);backdrop-filter:var(--m-blur);flex-wrap:nowrap}",
"  .rtool .rb:not(.mk),.rtool .rsep,.rtool .rsp{display:none}",
"  .rtool .rb-back{display:inline-flex;margin-right:auto}",
"  body.m-read .mapp,body.m-read .mapp-s{display:none}",
"  .rb{width:44px;height:44px;padding:0!important;border-radius:50%}.rb svg{width:21px;height:21px}.rb .rl{display:none}",
"  .rb.pri{width:auto;border-radius:99px;padding:0 16px!important}.rb.pri .rl{display:inline}",
"  .rin{overflow:visible;padding:18px 16px 24px;gap:16px}",
"  .rsubj{font-size:22px;letter-spacing:-.01em}",
"  .rsender{grid-template-columns:44px minmax(0,1fr)}.rdate{grid-column:2;text-align:left;display:block}.rdate span{margin-left:6px}",
"  .rcust{flex-wrap:wrap;margin-top:-6px;gap:8px}.rcust .tag.tagbtn{min-height:38px;padding:6px 13px 6px 11px;font-size:14px}.rcust .tag svg{width:15px;height:15px}.rcust .tag.rc-m{flex-shrink:1}",
"  .attl{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.attl::-webkit-scrollbar{display:none}.att{flex:none}",
"  .att>a,.att>button,.att>.ai{min-height:42px}",
"  .att .nm{max-width:min(240px,55vw)}",
"  .mframe{height:60vh;border:0;border-radius:14px;display:block}",
"  .mrow2 .accpill{display:none}.mrow2 .star:not(.on){display:none}.mrow2 .ics{opacity:.75}",
"  .qreply{display:none}",
/* Antworten-Leiste unten: schwebend, Antworten als Hauptknopf */
"  .mrbar{display:flex;position:fixed;left:12px;right:12px;bottom:max(8px,calc(env(safe-area-inset-bottom,0px) - 10px));z-index:30;gap:6px;padding:6px;background:var(--m-bar);-webkit-backdrop-filter:var(--m-blur);backdrop-filter:var(--m-blur);border:1px solid var(--glass-line,var(--line));border-radius:30px;box-shadow:var(--glass-hi,0 0 0 0 transparent),var(--shadow-pop)}",
"  .mrbar button{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;min-height:46px;border:1px solid var(--line);background:var(--sunk);color:var(--ink);border-radius:99px;padding:0 10px;font:inherit;font-weight:600;font-size:14.5px;min-width:0;white-space:nowrap}",
"  .mrbar button:not(.pri){flex-direction:column;gap:1px;font-size:11.5px;padding:2px 6px;border-radius:22px}.mrbar button:not(.pri) span{max-width:100%;overflow:hidden;text-overflow:ellipsis}",
"  .mrbar button.pri{flex:1.35;background:var(--btn-pri,var(--m-blue));border-color:var(--btn-pri,var(--m-blue));color:var(--btn-pri-ink,var(--on-glow));font-weight:700}",
"  .mrbar button:active{filter:brightness(.92)}",
"  .mrbar svg{width:19px;height:19px;flex:none}",
"  .mread.swback{transition:transform .2s}",
/* Ordner-/Kontenblatt von links */
"  .modal:has(.dialog.sheetdlg){place-items:stretch start;padding:0}",
"  .dialog.sheetdlg{width:min(340px,88vw);max-height:none;height:100%;border-radius:0 22px 22px 0;padding:calc(16px + env(safe-area-inset-top,0px)) 12px calc(20px + env(safe-area-inset-bottom,0px));animation:msheetl .22s cubic-bezier(.2,.8,.2,1)}",
"  @keyframes msheetl{from{transform:translateX(-100%)}to{transform:none}}",
"  .sheetf .fbtn,.sheetf .accbtn{min-height:46px;padding:10px 12px;font-size:15.5px;border-radius:12px}",
"  .sheetf .accseg .accbtn{min-height:40px;padding:6px 14px;border-radius:99px;font-size:14.5px}",
"  .sheetf .fbtn svg{width:20px;height:20px}",
/* Menüs als Blatt von unten */
"  .mctx{left:8px!important;right:8px;width:auto!important;max-width:none!important;background:color-mix(in srgb,var(--panel-solid,var(--panel)) 94%,transparent)!important;top:auto!important;bottom:calc(8px + env(safe-area-inset-bottom,0px));max-height:70vh;overflow-y:auto;border-radius:20px!important;padding:8px!important;box-shadow:0 0 0 100vmax rgb(0 0 0/.35)!important;animation:msheetb .2s cubic-bezier(.2,.8,.2,1)}",
"  @keyframes msheetb{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}",
"  .mctx button{width:100%;min-height:48px;padding:12px 14px!important;font-size:16px!important}",
"}",
"@media (prefers-reduced-motion:reduce){.mrow2,.mfab,.msw-bg svg,.mptr,.mptr svg,.thn svg,.rcd svg,.mread.swback{transition:none!important}.dialog.sheetdlg,.mctx,.mempty.busy .ei svg,.mptr.spin svg,.msinfo .spin{animation:none!important}}"
].join("\n"));

F.view({id:"post",label:"Postfach",short:"Post",icon:"post",order:40,mobile:true,count:function(){ return inboxUnread(); },render:vPost,after:after});
})();
