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
  chev:'<path d="m6 9 6 6 6-6"/>',
  check:'<path d="m5 12 5 5 9-10"/>'
};
Object.keys(IC).forEach(function(k){ F.icons["m_"+k]=IC[k]; });
M.ic=function(n){ if(n==="starfill") return '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true">'+IC.star+'</svg>'; return F.svg("m_"+n); };
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
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){ if(a.acc!==b.acc) return order.indexOf(a.acc)-order.indexOf(b.acc); return folderName(a.path,a.acc).localeCompare(folderName(b.path,b.acc),"de"); });
}
function moveTargets(acc){ var out=[{path:"INBOX",name:"Posteingang"}]; customFolders(acc).forEach(function(f){ out.push({path:f.path,name:folderName(f.path,acc)}); }); return out; }

/* ---------- Daten übernehmen ---------- */
function norm(m){ return {id:m.id,folder:m.folder||"INBOX",uid:m.uid,fromName:m.fromName||"",from:m.from||"",toName:m.toName||"",to:m.to||"",subject:m.subject||"",preview:m.preview||"",body:m.body||m.preview||"",bodyHtml:!!m.bodyHtml,date:m.date||"",read:!!m.read,starred:!!m.starred,deleted:false,attachments:Array.isArray(m.attachments)?m.attachments:[],toList:m.toList||[],ccList:m.ccList||[],replyTo:m.replyTo||"",messageId:m.messageId||"",inReplyTo:m.inReplyTo||"",answered:!!m.answered,forwarded:!!m.forwarded,answeredAt:m.answeredAt||null,account:m.account||""}; }
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
  var inc=d.messages.map(norm), server;
  if(full||!S.full){ server=inc; if(full){ S.full=true; S.fullAt=Date.now(); } }
  else { var idx={}; server=S.messages.filter(function(m){return !m.local;}).map(function(m,i){ idx[m.id]=i; return m; }); inc.forEach(function(m){ if(idx[m.id]!=null) server[idx[m.id]]=m; else server.push(m); }); }
  if(d.fetchedAt) S.fetchedAt=d.fetchedAt;
  S.messages=server.map(function(m){ return m.local?m:applyOv(m); }).concat(liveLocals(server));
  M.changed();
}
/* Nach jeder lokalen Änderung: andere Module (Heute, Zähler) sehen denselben Stand */
M.changed=function(){
  S.ver++;
  if(F.D&&F.D.mail){ F.D.mail.messages=S.messages.filter(function(m){ return !m.deleted&&!m.local; }); if(S.accounts.length) F.D.mail.accounts=S.accounts; }
  var n=inboxUnread();
  try{ document.title=(n>0?"("+n+") ":"")+"FS Cockpit"; }catch(e){}
};
M.setOv=function(m,fields){ Object.assign(m,fields); if(m.local) return; OV[m.id]=Object.assign(OV[m.id]||{},fields,{at:Date.now()}); };
M.refresh=function(){ if(F.current==="post") F.render(); else F.renderNav(); (M.refreshHooks||[]).forEach(function(h){ try{ h(); }catch(e){} }); };
M.loadFull=function(){
  if(M._lf) return M._lf; S.loading=true;
  M._lf=F.api("/admin/api/all?year="+encodeURIComponent(F.year)).then(function(d){
    S.loading=false; M._lf=null;
    if(d&&d.mail&&Array.isArray(d.mail.messages)){ S.err=""; ingest(d.mail,true); } else S.err="Postfach konnte nicht geladen werden.";
    M.refresh(); return d;
  }).catch(function(){ S.loading=false; M._lf=null; S.err="Keine Verbindung zum Server."; M.refresh(); });
  return M._lf;
};
var relT=null;
M.scheduleReload=function(ms){ clearTimeout(relT); relT=setTimeout(function(){ M.loadFull(); },ms||4000); };
F.onData(function(d){ if(d&&d.mail) ingest(d.mail,false); if(F.current==="post"&&Date.now()-S.fullAt>55000) setTimeout(M.loadFull,50); });

/* ---------- Server-Aktionen ---------- */
function items(msgs){ return msgs.filter(function(m){ return m&&m.uid!=null&&!m.local; }).map(function(m){ return {folder:m.folder||"INBOX",uid:m.uid,account:accOf(m)}; }); }
M.items=items;
M.action=function(op,msgs,target){
  var it=items(msgs); if(!it.length) return Promise.resolve(true);
  var body={op:op,items:it}; if(target) body.target=target;
  return F.api("/admin/api/mail-action",{body:body}).then(function(j){
    if(!j||j.ok===false||j.error){ F.toast("Mailserver: Aktion fehlgeschlagen"+(j&&(j.detail||j.error)?" ("+String(j.detail||j.error).slice(0,80)+")":""),true); return false; }
    return true;
  }).catch(function(){ F.toast("Keine Verbindung zum Mailserver – Änderung evtl. nicht gespeichert",true); return false; });
};

/* ---------- Zählen, Ansichten ---------- */
function find(id){ for(var i=0;i<S.messages.length;i++) if(S.messages[i].id===id) return S.messages[i]; return null; }
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
  if(UI.mq){ var q=UI.mq.toLowerCase(); list=list.filter(function(m){ return ((m.fromName||"")+" "+(m.from||"")+" "+(m.to||"")+" "+(m.toName||"")+" "+(m.subject||"")+" "+(m.preview||"")+" "+(m.bodyHtml?"":(m.body||""))+" "+(m.bodyHtml?String(m.body||"").replace(/<[^>]+>/g," "):"")).toLowerCase().indexOf(q)>-1; }); }
  return list;
}
function isOpen(m){ var rs=replyState(m); return !m.outbox&&!m.draftLocal&&!isSent(m)&&!(rs&&rs.ans); }
function mailView(){
  var list=baseView(), flt=UI.mfilt||"all";
  if(flt==="unread") list=list.filter(function(m){return !m.read;});
  else if(flt==="star") list=list.filter(function(m){return m.starred;});
  else if(flt==="att") list=list.filter(function(m){return m.attachments&&m.attachments.length;});
  else if(flt==="open") list=list.filter(isOpen);
  return list.sort(function(x,y){ return (new Date(y.date))-(new Date(x.date)); });
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
  return '<button type="button" class="fbtn'+(opts.cls?" "+opts.cls:"")+'" data-act="mfolder:'+esc(key)+'"'+(opts.drop?' data-drop="'+esc(opts.drop)+'"':'')+(UI.mf===key?' aria-current="true"':'')+' title="'+esc(label)+'">'+ic(icon)+'<span class="fl">'+esc(label)+'</span>'+(cnt?'<span class="n'+(opts.hot?" hot":"")+'">'+cnt+'</span>':'')+'</button>'; }
function folderPanel(){
  var c=counts(), h="";
  if(multiAcc()){
    var ab=function(k,label,sub,tone,warn){ var n=inboxUnread(k); return '<button type="button" class="accbtn" data-act="macct:'+esc(k)+'"'+(UI.macct===k?' aria-current="true"':'')+' title="'+esc(sub||label)+'"><span class="adot" style="background:var(--'+tone+')"></span><span class="atx"><span class="atl">'+esc(label)+'</span>'+(sub?'<span class="atu">'+esc(sub)+'</span>':'')+'</span>'+(warn?'<span class="awarn" data-act="msettings" role="button" tabindex="0" title="'+esc(warn)+'" aria-label="'+esc(warn)+'">!</span>':'')+(n?'<span class="n hot">'+n+'</span>':'')+'</button>'; };
    h+='<div class="accsw">'+ab("all","Alle Konten","","ink-3","")+accounts().map(function(a){ return ab(a.key,a.label||a.key,a.user,accTone(a.key),accWarn(a)); }).join("")+'</div>';
  }
  var ob=M.outbox?M.outbox():[];
  h+=fb("inbox","inbox","Posteingang",c.inboxUnread,{hot:true,drop:"INBOX"})+fb("drafts","draft","Entwürfe",c.drafts)+
    fb("outbox","outbox","Postausgang",ob.length,{cls:ob.some(function(o){return o.status==="failed";})?"warn":"",hot:ob.length>0})+
    fb("sent","sent","Gesendet",0)+fb("spam","spam","Spam",c.spam,{drop:"__spam"})+fb("trash","trash","Papierkorb",0,{drop:"__trash"});
  var cf=customFolders(UI.macct!=="all"?UI.macct:null);
  if(cf.length){ var lastA=null; if(!multiAcc()||UI.macct!=="all") h+='<div class="fdiv">Ordner</div>';
    cf.forEach(function(f){ if(multiAcc()&&UI.macct==="all"&&f.acc!==lastA){ h+='<div class="fdiv">Ordner · '+esc(accInfo(f.acc).label)+'</div>'; lastA=f.acc; }
      h+=fb("f:"+f.acc+"|"+f.path,"folder",folderName(f.path,f.acc),f.unread,{hot:f.unread>0,drop:f.acc+"|"+f.path}); }); }
  return h;
}
M.folderPanel=folderPanel;
var FNAMES={inbox:"Posteingang",drafts:"Entwürfe",outbox:"Postausgang",sent:"Gesendet",spam:"Spam",trash:"Papierkorb",unread:"Ungelesen",starred:"Markiert"};
function curFolderLabel(){ var f=UI.mf; if(FNAMES[f]) return FNAMES[f]; if(f.indexOf("f:")===0){ var p=parseFolderKey(f); return folderName(p.path,p.acc); } return f; }

/* ---------- Liste ---------- */
function rowHtml(m){
  var sent=isSent(m)||!!m.outbox||!!m.draftLocal, nm=sent?m.toName:m.fromName, ad=sent?m.to:m.from;
  var who=esc(sent?("An: "+(m.toName||m.to||"—")):(m.fromName||m.from||"—"));
  if(m.draftLocal) who='<span class="bad-t">Entwurf</span> · '+esc(m.to?("An: "+m.to):"(kein Empfänger)");
  if(m.outbox) who+=(m.ob.status==="failed"?' <span class="tag bad">Fehlgeschlagen</span>':' <span class="tag info">Wird gesendet</span>');
  var rs=replyState(m), ics="";
  if(rs&&rs.ans) ics+='<span title="Beantwortet'+(rs.date?" am "+esc(new Date(rs.date).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})):"")+'">'+ic("reply")+'</span>';
  if(rs&&rs.fwd) ics+='<span title="Weitergeleitet">'+ic("forward")+'</span>';
  if(m.attachments&&m.attachments.length) ics+='<span title="'+m.attachments.length+(m.attachments.length===1?" Anhang":" Anhänge")+'">'+ic("clip")+'</span>';
  var fl=(UI.mf!=="inbox"&&UI.mf.indexOf("f:")!==0&&!m.outbox&&!m.draftLocal&&(m.folder||"INBOX")!=="INBOX"&&!isSent(m)&&!isTrashed(m)&&!isSpam(m))?'<span class="tag grey">'+esc(folderName(m.folder,accOf(m)))+'</span>':'';
  var canPick=!(m.outbox||m.draftLocal), picked=!!UI.mpick[m.id], qa="";
  if(canPick){
    if(isTrashed(m)) qa='<div class="mqa"><button type="button" data-act="mqa:restore|'+esc(m.id)+'" title="Wiederherstellen" aria-label="Wiederherstellen">'+ic("restore")+'</button><button type="button" class="dg" data-act="mqa:purge|'+esc(m.id)+'" title="Endgültig löschen" aria-label="Endgültig löschen">'+ic("trash")+'</button></div>';
    else qa='<div class="mqa"><button type="button" data-act="mqa:read|'+esc(m.id)+'" title="'+(m.read?"Als ungelesen (U)":"Als gelesen (U)")+'" aria-label="'+(m.read?"Als ungelesen":"Als gelesen")+'">'+ic(m.read?"mail":"mailopen")+'</button><button type="button" data-act="mqa:move|'+esc(m.id)+'" title="Verschieben (V)" aria-label="Verschieben">'+ic("folder")+'</button><button type="button" class="dg" data-act="mqa:trash|'+esc(m.id)+'" title="Löschen (#)" aria-label="Löschen">'+ic("trash")+'</button></div>';
  }
  var star=canPick?'<button type="button" class="star'+(m.starred?" on":"")+'" data-act="mstar:'+esc(m.id)+'" title="Markieren (S)" aria-label="'+(m.starred?"Markierung entfernen":"Markieren")+'" aria-pressed="'+!!m.starred+'">'+(m.starred?"★":"☆")+'</button>':'';
  var avBtn=canPick?av(nm,ad,"",' data-act="mpick:'+esc(m.id)+'" role="checkbox" aria-checked="'+picked+'" tabindex="0" title="Auswählen (X)"','<span class="ck">'+ic("check")+'</span>'):av(nm,ad);
  return '<div class="mrow2'+(m.read?"":" unread")+(UI.msel===m.id?" sel":"")+(picked?" picked":"")+(isTrashed(m)?" trashed":"")+'" data-mid="'+esc(m.id)+'" tabindex="0" role="button"'+(canPick?' draggable="true"':'')+'>'+avBtn+
    '<div class="mm"><div class="l1"><span class="who">'+who+'</span>'+accPill(m)+'<span class="when" title="'+esc(m.date?new Date(m.date).toLocaleString("de-AT"):"")+'">'+esc(fmtMailDate(m.date))+'</span></div>'+
    '<div class="l2"><span class="subj">'+esc(m.subject||"(kein Betreff)")+'</span>'+fl+'<span class="ics">'+ics+'</span>'+star+'</div>'+
    (m.preview?'<div class="pre">'+esc(m.preview)+'</div>':'')+'</div>'+qa+'</div>';
}
function chipsHtml(list){
  var base=baseView(), f=UI.mf, cur=UI.mfilt||"all";
  var n={unread:base.filter(function(m){return !m.read;}).length,star:base.filter(function(m){return m.starred;}).length,att:base.filter(function(m){return m.attachments&&m.attachments.length;}).length,open:base.filter(isOpen).length};
  function chip(k,l,c,tt){ return '<button type="button" class="chip" data-act="mfilt:'+k+'" aria-pressed="'+(cur===k)+'"'+(tt?' title="'+tt+'"':'')+'>'+l+(c!=null?' <span class="cn">'+c+'</span>':'')+'</button>'; }
  var tools="";
  if(f==="trash"&&list.length) tools='<button type="button" class="link bad-t" data-act="mempty">Papierkorb leeren</button>';
  else if(f==="spam"&&list.length) tools='<button type="button" class="link bad-t" data-act="mspamclear">Spam leeren</button>';
  var pickable=list.filter(function(m){ return !m.outbox&&!m.draftLocal; }).length;
  return chip("all","Alle")+chip("unread","Ungelesen",n.unread)+chip("star","★",n.star,"Markiert")+chip("att",'<span class="ci">'+ic("clip")+'</span>',n.att,"Mit Anhang")+
    (f==="sent"||f==="outbox"||f==="drafts"?"":chip("open","Offen",n.open,"Noch nicht beantwortet"))+'<span class="sp"></span>'+tools+(pickable?'<button type="button" class="link" data-act="mbulk:all" title="Alle auswählen">'+pickable+' auswählen</button>':'');
}
function emptyHtml(){
  var f=UI.mf, e=["inbox","Alles erledigt","Keine Nachrichten in dieser Ansicht."];
  if(UI.mq) e=["mail","Nichts gefunden","Für „"+UI.mq+"“ gibt es keine Treffer."];
  else if(UI.mfilt&&UI.mfilt!=="all") e=["inbox","Keine Treffer","Mit diesem Filter ist die Liste leer."];
  else if(f==="drafts") e=["draft","Keine Entwürfe","Angefangene Mails werden hier automatisch gesichert."];
  else if(f==="outbox") e=["outbox","Postausgang leer","Alle Mails wurden versendet."];
  else if(f==="trash") e=["trash","Papierkorb ist leer",""];
  else if(f==="spam") e=["spam","Kein Spam","Hier ist alles sauber."];
  else if(f==="sent") e=["sent","Noch nichts gesendet",""];
  if(!S.messages.length&&S.loading) e=["refresh","Postfach wird geladen …",""];
  return '<div class="mempty"><span class="ei">'+ic(e[0])+'</span><b>'+esc(e[1])+'</b>'+(e[2]?'<span>'+esc(e[2])+'</span>':'')+'</div>';
}
function listHtml(list){
  if(!list.length) return emptyHtml();
  var out=[], last=null, grouped=UI.mf!=="outbox", shown=list.slice(0,UI.mshow);
  shown.forEach(function(m){ if(grouped){ var g=grpLabel(m.date); if(g!==last){ out.push('<div class="mgrp">'+esc(g)+'</div>'); last=g; } } out.push(rowHtml(m)); });
  if(list.length>shown.length) out.push('<button type="button" class="more" data-act="mmore">Weitere '+Math.min(150,list.length-shown.length)+' von '+(list.length-shown.length)+' anzeigen</button>');
  return out.join("");
}

/* ---------- Lesebereich ---------- */
function rb(act,icon,label,extra,showLabel){ return '<button type="button" class="rb'+(extra||"")+'" data-act="'+act+'" title="'+esc(label)+'" aria-label="'+esc(label)+'">'+ic(icon)+(showLabel?'<span class="rl">'+esc(label.replace(/ \(.\)$/,""))+'</span>':'')+'</button>'; }
function frame(html,title){ return '<iframe class="mframe" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="'+esc(title||"Mail-Inhalt")+'" srcdoc="'+esc('<!doctype html><meta charset="utf-8"><base target="_blank"><style>html,body{background:#fff}body{font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1b2420;margin:14px;overflow-wrap:anywhere}img{max-width:100%;height:auto}blockquote{margin:6px 0 6px 4px;padding-left:10px;border-left:3px solid #dcdfd8;color:#56605a}</style>'+(html||""))+'"></iframe>'; }
M.frame=frame;
function attachmentsHtml(m){
  var atts=(m&&m.attachments)||[]; if(!atts.length) return "";
  var chips=atts.map(function(a){
    var href=M.attHref(m,a), vs=M.voucherSent(m,a), canV=M.isVoucherAtt(a);
    return '<span class="att"><a href="'+esc(href)+'&inline=1" target="_blank" rel="noopener" title="Im Browser öffnen"><span class="ak">'+esc(attIconTxt(a))+'</span><span class="nm">'+esc(a.filename||"Anhang")+'</span><span class="sz">'+esc(fmtBytes(a.size))+'</span></a>'+
      '<a href="'+esc(href)+'&dl=1" download="'+esc(a.filename||"anhang")+'" title="Herunterladen" aria-label="'+esc((a.filename||"Anhang")+" herunterladen")+'">'+ic("down")+'</a>'+
      (canV?'<button type="button" class="'+(vs?"done":"")+'" data-act="mvoucher:'+esc(m.id)+'|'+esc(a.index||0)+'" title="'+(vs?"Bereits als Beleg an sevDesk gesendet – erneut senden":"Als Beleg an sevDesk senden")+'" aria-label="Beleg an sevDesk">'+(vs?ic("check"):ic("receipt"))+'</button>':'')+'</span>';
  }).join("");
  var zip="";
  if(atts.length>1){ var z="/admin/api/mail-attachments-zip?folder="+encodeURIComponent(m.folder||"INBOX")+"&uid="+encodeURIComponent(m.uid)+"&account="+encodeURIComponent(accOf(m))+"&name="+encodeURIComponent(m.subject||"Anhaenge")+"&atts="+encodeURIComponent(JSON.stringify(atts.map(function(a){ return {index:a.index,filename:a.filename}; })));
    zip='<a class="link" href="'+esc(z)+'" download>'+ic("down")+' Alle als ZIP</a>'; }
  return '<div class="attbox"><div class="atth"><span>'+ic("clip")+' '+atts.length+(atts.length>1?" Anhänge":" Anhang")+'</span>'+zip+'</div><div class="attl">'+chips+'</div></div>';
}
function outboxReader(o){
  var tb='<div class="rtool">'+rb("mback","back","Zurück"," rb-back")+(o.status==="failed"?rb("mob:retry|"+o.oid,"refresh","Erneut senden"," pri",true):'')+rb("mob:edit|"+o.oid,"edit","Bearbeiten","",true)+rb("mob:discard|"+o.oid,"trash","Verwerfen"," dg",true)+'</div>';
  return tb+'<div class="rin"><div class="rsender">'+av("",o.to,"lg")+'<div class="rw"><div class="rn">An: '+esc(o.to)+(o.cc?' <span class="muted">· Cc: '+esc(o.cc)+'</span>':'')+'</div><div class="rto">'+(o.status==="failed"?'<span class="bad-t">Senden fehlgeschlagen: '+esc(o.error||"unbekannter Fehler")+'</span>':'Wird gesendet …')+'</div></div><div class="rdate">'+esc(new Date(o.date).toLocaleString("de-AT"))+'</div></div>'+
    '<h2 class="rsubj">'+esc(o.subject||"(kein Betreff)")+'</h2>'+
    (o.attsDropped?'<div class="notice">Die Anhänge waren zu groß zum Zwischenspeichern im Browser. Bitte über „Bearbeiten“ neu anhängen.</div>':'')+
    (o.attachments&&o.attachments.length?'<div class="attbox"><div class="atth"><span>'+ic("clip")+' '+o.attachments.length+(o.attachments.length>1?" Anhänge":" Anhang")+'</span></div><div class="attl">'+o.attachments.map(function(a){ return '<span class="att"><span class="ai"><span class="ak">'+esc(attIconTxt(a))+'</span><span class="nm">'+esc(a.filename)+'</span><span class="sz">'+esc(fmtBytes(a.size))+'</span></span></span>'; }).join("")+'</div></div>':'')+
    frame(o.html,"Mail im Postausgang")+'</div>';
}
function readerHtml(){
  var sel=UI.msel;
  if(sel&&sel.indexOf("ob_")===0&&M.findOb){ var o=M.findOb(sel); if(o) return outboxReader(o); }
  var m=sel?find(sel):null;
  if(!m){ var c=counts(); return '<div class="mempty tall"><span class="ei">'+ic("mailopen")+'</span><b>Keine Nachricht ausgewählt</b><span>'+(c.inboxUnread?c.inboxUnread+" ungelesen im Posteingang · ":"")+'Mit <span class="kbd">J</span> <span class="kbd">K</span> durchblättern, <span class="kbd">?</span> zeigt alle Tastenkürzel.</span></div>'; }
  var sent=isSent(m), trashed=isTrashed(m), spam=isSpam(m), dbox=isDraftBox(m), id=esc(m.id);
  var tb=rb("mback","back","Zurück"," rb-back");
  if(trashed) tb+=rb("mx:restore","restore","Wiederherstellen","",true)+rb("mx:purge","trash","Endgültig löschen"," dg",true);
  else {
    if(dbox) tb+=rb("mx:editdraft","edit","Weiter bearbeiten"," pri",true);
    tb+=rb("mx:reply","reply","Antworten (R)","",true)+rb("mx:replyall","replyall","Allen antworten (A)")+rb("mx:forward","forward","Weiterleiten (F)")+
      '<span class="rsep"></span>'+rb("mx:todo","todo","Als To-Do (T)")+rb("mx:termin","cal","Als Termin")+
      '<span class="rsep"></span>'+rb("mx:move","folder","Verschieben (V)")+(spam?rb("mx:notspam","inboxin","Kein Spam – in den Posteingang"):rb("mx:spam","spam","Als Spam"))+rb("mx:trash","trash","Löschen (#)"," dg");
  }
  tb+='<span class="rsp"></span>'+rb("mx:"+(m.read?"unread":"read"),m.read?"mail":"mailopen",m.read?"Als ungelesen (U)":"Als gelesen (U)")+
    rb("mx:star",m.starred?"starfill":"star",m.starred?"Markierung entfernen (S)":"Markieren (S)",m.starred?" on":"")+rb("mx:print","print","Drucken")+rb("mwebmail","ext","In Webmail öffnen");
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
  if(addr){ var la=addr.toLowerCase(); rel=S.messages.filter(function(x){ return x.id!==m.id&&!x.deleted&&((x.from||"").toLowerCase()===la||(isSent(x)&&(x.to||"").toLowerCase()===la)); }).sort(function(a,b){ return new Date(b.date)-new Date(a.date); }).slice(0,5); }
  var canQr=!trashed&&!sent&&!dbox&&(m.replyTo||m.from);
  var qrVal=UI.mqrFor===m.id?(UI.mqr||""):"";
  var qr=canQr?'<div class="qreply"><textarea id="mqr" data-keepfocus="mqr" rows="3" aria-label="Schnell antworten" placeholder="Schnell antworten an '+esc(m.fromName||m.from)+' …">'+esc(qrVal)+'</textarea><div class="qbar"><span class="qh"><span class="kbd">⌘</span><span class="kbd">↵</span> senden · Signatur und Zitat werden angehängt</span><button type="button" class="btn" data-act="mx:reply">Erweitert</button><button type="button" class="btn primary" data-act="mx:qrsend">Senden</button></div></div>':'';
  var body=m.bodyHtml?frame(m.body||"",m.subject):'<div class="mbody">'+linkify(m.body||m.preview||"")+'</div>';
  return '<div class="rtool">'+tb+'</div><div class="rin" id="mreadS">'+
    '<h2 class="rsubj">'+esc(m.subject||"(kein Betreff)")+'</h2><div class="rtags">'+tags+'</div>'+
    '<div class="rsender">'+av(sent?m.toName:m.fromName,sent?m.to:m.from,"lg")+
      '<div class="rw"><div class="rn">'+(sent?"An: ":"")+esc(who||"—")+(addr&&addr!==who?' <button type="button" class="raddr" data-act="mmailto:'+esc(addr)+'" title="Neue Mail an diese Adresse">&lt;'+esc(addr)+'&gt;</button>':'')+'</div><div class="rto">'+toLine+'</div></div>'+
      '<div class="rdate">'+esc(m.date?new Date(m.date).toLocaleString("de-AT",{weekday:"short",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"")+'<span>'+esc(relTime(m.date))+'</span></div></div>'+
    attachmentsHtml(m)+body+
    (m.body||m.preview?'':'<div class="notice"><span>Kein Textinhalt im Abruf. Die vollständige Nachricht findest du im Webmail.</span><button type="button" class="btn" data-act="mwebmail">In Webmail öffnen</button></div>')+
    qr+
    (rel.length?'<div class="rrel"><div class="sec-t">Weitere Mails '+(sent?"an":"von")+' '+esc(who)+'</div>'+rel.map(function(x){ return '<button type="button" class="ri" data-act="mrel:'+esc(x.id)+'">'+(isSent(x)?'<span class="muted" title="Gesendet">'+ic("sent")+'</span>':'')+'<span class="s">'+esc(x.subject||"(kein Betreff)")+'</span><span class="d">'+esc(fmtMailDate(x.date))+'</span></button>'; }).join("")+'</div>':'')+
  '</div>';
}

/* ---------- Ansicht ---------- */
function bulkHtml(){
  var n=M.selectedIds().length; if(!n) return "";
  return '<div class="mbulk" role="toolbar" aria-label="Auswahl"><b>'+n+' ausgewählt</b><button type="button" class="btn" data-act="mbulk:read">Als gelesen</button><button type="button" class="btn" data-act="mbulk:unread">Als ungelesen</button><button type="button" class="btn" data-act="mbulk:star">★ Markieren</button><button type="button" class="btn" data-act="mbulk:move">Verschieben …</button><button type="button" class="btn" data-act="mbulk:spam">Spam</button><button type="button" class="btn danger" data-act="mbulk:trash">Löschen</button><span class="sp"></span><button type="button" class="btn" data-act="mbulk:all">Alle auswählen</button><button type="button" class="btn" data-act="mbulk:clear">Abwählen</button></div>';
}
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
  UI.mreadFor=UI.msel;
  if(UI.msel&&!find(UI.msel)&&!(M.findOb&&M.findOb(UI.msel))) UI.msel=null;
  var list=mailView(), c=counts();
  return F.head("Postfach"+(c.inboxUnread?' <span class="tag glow hnew">'+c.inboxUnread+' neu</span>':''),subLine(),
    '<button type="button" class="btn icon" data-act="mrefresh" title="Aktualisieren" aria-label="Postfach aktualisieren">'+ic("refresh")+'</button><button type="button" class="btn icon hide-m" data-act="mkeys" title="Tastenkürzel (?)" aria-label="Tastenkürzel">'+ic("keys")+'</button><button type="button" class="btn icon" data-act="mwebmail" title="In Webmail öffnen" aria-label="In Webmail öffnen">'+ic("ext")+'</button><button type="button" class="btn primary" data-act="compose">'+ic("edit")+' Neue Mail</button>')+
  '<div class="mtools"><button type="button" class="btn fpill" data-act="mfoldsheet" aria-haspopup="dialog">'+ic("folder")+' '+esc(curFolderLabel())+(multiAcc()&&UI.macct!=="all"?" · "+esc(accInfo(UI.macct).label):"")+' '+ic("chev")+'</button>'+
    '<div class="msearch">'+F.svg("search")+'<input class="f" id="msearch" data-keepfocus="msearch" type="search" placeholder="Mails durchsuchen … (Taste /)" aria-label="Mails durchsuchen" autocomplete="off" value="'+esc(UI.mq)+'">'+(UI.mq?'<button type="button" class="x" data-act="msearchx" aria-label="Suche leeren">'+F.svg("close")+'</button>':'')+'</div></div>'+
  bulkHtml()+
  '<div class="mbox'+(UI.msel?" reading":"")+'">'+
    '<nav class="mfold panel" aria-label="Ordner">'+folderPanel()+'</nav>'+
    '<section class="panel mlistp" aria-label="Nachrichten"><div class="mchips">'+chipsHtml(list)+'</div><div class="mscroll" id="mlistS">'+listHtml(list)+'</div></section>'+
    '<section class="panel mread" aria-label="Lesebereich">'+readerHtml()+'</section>'+
  '</div>';
}
function after(){
  var ls=document.getElementById("mlistS"); if(ls&&UI.mlistTop) ls.scrollTop=UI.mlistTop;
  var rs=document.getElementById("mreadS"); if(rs&&UI.mreadTop) rs.scrollTop=UI.mreadTop;
  if(UI.mscrollTo){ var row=document.querySelector('.mrow2[data-mid="'+(window.CSS&&CSS.escape?CSS.escape(UI.mscrollTo):UI.mscrollTo)+'"]'); if(row&&row.scrollIntoView) row.scrollIntoView({block:"nearest"}); UI.mscrollTo=null; }
  if(UI.mfocusQr){ UI.mfocusQr=false; var q=document.getElementById("mqr"); if(q) q.focus(); }
  if(!S.full&&!S.loading&&!S.err) M.loadFull();
  else if(S.full&&!S.loading&&Date.now()-S.fullAt>60000) M.loadFull();
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
  if(id.indexOf("dr_")===0){ if(M.openDraft) M.openDraft(id.slice(3)); return; }
  if(id.indexOf("ob_")===0){ UI.msel=id; F.render(); return; }
  M.open(id);
});
F.listen("keydown",".mrow2",function(el,e){ if(e.target!==el) return; if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.click(); } });
F.listen("keydown",".mav[data-act]",function(el,e){ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); el.click(); } });
F.listen("input","#msearch",function(el){ UI.mq=el.value; UI.mshow=150; F.render(); });
F.listen("keydown","#msearch",function(el,e){ if(e.key==="Escape"){ e.stopPropagation(); UI.mq=""; el.value=""; F.render(); var s=document.getElementById("msearch"); if(s) s.blur(); } });
F.listen("input","#mqr",function(el){ UI.mqr=el.value; UI.mqrFor=UI.msel; });
F.action("msearchx",function(){ UI.mq=""; F.render(); var s=document.getElementById("msearch"); if(s) s.focus(); });

/* ---------- Navigation in der Ansicht ---------- */
F.action("mfolder",function(k){ if(k!==UI.mf){ UI.mf=k; UI.mfilt="all"; UI.mpick={}; UI.msel=null; UI.mlistTop=0; UI.mshow=150; } F.closeModal(); F.render(); });
F.action("macct",function(k){ if(k!==UI.macct){ UI.macct=k; UI.mpick={}; UI.msel=null; UI.mlistTop=0; if(UI.mf.indexOf("f:")===0) UI.mf="inbox"; } F.closeModal(); F.render(); });
F.action("mfilt",function(k){ UI.mfilt=k; UI.mlistTop=0; F.render(); });
F.action("mmore",function(){ UI.mshow+=150; F.render(); });
F.action("mback",function(){ UI.msel=null; F.render(); });
F.action("mrel",function(id){ M.open(id,{fromOutside:!find(id)||M.folderKeyOf(find(id))!==UI.mf}); });
F.action("msettings",function(){ if(F.actions.settings) F.actions.settings(); else F.toast("Konten richtest du in den Einstellungen ein."); });
F.action("mwebmail",function(){ window.open("https://webmail.world4you.com","_blank","noopener"); });
F.action("mrefresh",function(){ F.toast("Postfach wird aktualisiert …"); M.loadFull().then(function(){ if(!S.err) F.toast("Postfach aktualisiert"); else F.toast(S.err,true); }); });
F.action("mfoldsheet",function(){ F.modal('<div class="row-between"><h2 style="font-size:19px">Ordner</h2>'+F.btnClose()+'</div><nav class="mfold sheetf" aria-label="Ordner">'+folderPanel()+'</nav>',"sheetdlg"); });
F.action("mmailto",function(addr){ F.compose({to:addr}); });

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
function moveMessages(ids,target,op){
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
  F.toast((op==="spam"?"Als Spam markiert":"Verschoben nach „"+(dest==="INBOX"?"Posteingang":folderName(dest,acc))+"“")+(other?" – "+other+" Mail(s) aus anderem Konto übersprungen":""));
}
M.moveMessages=moveMessages;
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
function flushUndo(){
  if(UNDO.timer){ clearTimeout(UNDO.timer); UNDO.timer=null; }
  if(!UNDO.ids.length) return;
  var ids=UNDO.ids, its=UNDO.items; UNDO.ids=[]; UNDO.items=[];
  ids.forEach(function(id){ var m=find(id); if(m&&m.deleted) M.setOv(m,{flushed:true}); });
  if(its.length) F.api("/admin/api/mail-action",{body:{op:"trash",items:its}}).then(function(j){ if(!j||j.ok===false||j.error) F.toast("Mailserver: Löschen fehlgeschlagen",true); }).catch(function(){ F.toast("Keine Verbindung – Löschen evtl. nicht gespeichert",true); });
  M.scheduleReload(3000);
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
window.addEventListener("beforeunload",beacon);
function trashMessages(ids){
  var msgs=ids.map(find).filter(function(m){ return m&&!isTrashed(m); }); if(!msgs.length) return;
  flushUndo();
  var mids=msgs.map(function(m){return m.id;});
  var nxt=mids.indexOf(UI.msel)>-1?neighborId(mids):UI.msel;
  var now=new Date().toISOString();
  msgs.forEach(function(m){ M.setOv(m,{deleted:true,trashedAt:now,flushed:false}); delete UI.mpick[m.id]; });
  var locals=msgs.filter(function(m){ return m.local; });
  if(locals.length){ M.local=M.local.filter(function(l){ return locals.indexOf(l)<0; }); S.messages=S.messages.filter(function(m){ return locals.indexOf(m)<0; }); }
  UNDO.ids=mids; UNDO.items=items(msgs); UNDO.timer=setTimeout(flushUndo,6000);
  UI.msel=nxt; M.changed(); F.render();
  F.toast((msgs.length>1?msgs.length+" Nachrichten":"Nachricht")+" gelöscht",false,"Rückgängig",function(){
    if(UNDO.timer){ clearTimeout(UNDO.timer); UNDO.timer=null; }
    var back=UNDO.ids.length?UNDO.ids:[]; UNDO.ids=[]; UNDO.items=[];
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
  var i=v.indexOf("|"), op=v.slice(0,i), m=find(v.slice(i+1)); if(!m) return;
  if(op==="read") setRead([m],!m.read);
  else if(op==="trash") trashMessages([m.id]);
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
  else if(op==="trash"){ var tr=ids.filter(function(id){ return isTrashed(find(id)); }); if(tr.length===ids.length) purge(ids); else trashMessages(ids); }
  else if(op==="move"){ var p=menuPos(el); M.showMoveMenu(p[0],p[1],ids); }
});

/* ---------- Aktionen im Lesebereich ---------- */
M.cur=function(){ return UI.msel?find(UI.msel):null; };
F.action("mx",function(op,el){
  var m=M.cur(); if(!m) return;
  if(op==="reply") M.reply(m,"reply");
  else if(op==="replyall") M.reply(m,"all");
  else if(op==="forward") M.reply(m,"fwd");
  else if(op==="todo") M.todoFromMail(m);
  else if(op==="termin") M.eventFromMail(m);
  else if(op==="move"){ var p=menuPos(el); M.showMoveMenu(p[0],p[1],[m.id]); }
  else if(op==="spam") moveMessages([m.id],null,"spam");
  else if(op==="notspam") moveMessages([m.id],"INBOX","move");
  else if(op==="trash") trashMessages([m.id]);
  else if(op==="restore") restore([m.id]);
  else if(op==="purge") purge([m.id]);
  else if(op==="read") setRead([m],true);
  else if(op==="unread") setRead([m],false);
  else if(op==="star") toggleStar(m);
  else if(op==="print") M.print(m);
  else if(op==="editdraft") M.editServerDraft(m);
  else if(op==="qrsend") M.quickReply(m);
});
F.action("mvoucher",function(v){ var i=v.indexOf("|"), m=find(v.slice(0,i)); if(!m) return; var idx=+v.slice(i+1); var a=(m.attachments||[]).filter(function(x){ return (x.index||0)===idx; })[0]; if(a) M.openVoucher(m,a); });
/* Kompatibilität mit älteren Aufrufen */
F.action("reply",function(id){ var m=find(id); if(m) M.reply(m,"reply"); });
F.action("mailtodo",function(id){ var m=find(id); if(m) M.todoFromMail(m); });

/* ---------- Ziehen auf Ordner ---------- */
var dragIds=null;
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
F.css([
".view-post{max-width:1500px}",
".hnew{font-size:13px;vertical-align:middle;margin-left:6px}",
".mtools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
".msearch{position:relative;flex:1;min-width:0;max-width:460px}",
".msearch>svg{position:absolute;left:11px;top:50%;width:15px;height:15px;transform:translateY(-50%);color:var(--ink-3);pointer-events:none}",
".msearch input{padding-left:34px;padding-right:32px}",
".msearch input::-webkit-search-cancel-button{display:none}",
".msearch .x{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--ink-3);padding:4px;display:grid}",
".msearch .x svg{width:14px;height:14px}",
".fpill{display:none}",
".fpill svg{width:14px;height:14px}",
".mbox{display:grid;grid-template-columns:212px minmax(0,360px) minmax(0,1fr);gap:14px;align-items:start}",
".mfold{display:grid;gap:1px;align-content:start;padding:8px;position:sticky;top:12px;max-height:calc(100vh - 40px);overflow-y:auto}",
".fbtn,.accbtn{display:flex;align-items:center;gap:9px;width:100%;padding:7px 9px;border:0;background:none;border-radius:9px;color:var(--ink-2);font-weight:500;text-align:left;font-size:14px;min-width:0}",
".fbtn svg{width:16px;height:16px;flex:none}",
".fbtn .fl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
".fbtn:hover,.accbtn:hover{background:var(--sunk);color:var(--ink)}",
".fbtn[aria-current=true],.accbtn[aria-current=true]{background:var(--ink);color:var(--ground)}",
".fbtn .n,.accbtn .n{margin-left:auto;font-family:var(--f-mono);font-size:12px;color:var(--ink-3);flex:none}",
".fbtn .n.hot,.accbtn .n.hot{background:var(--glow);color:#2a1a00;border-radius:99px;padding:0 7px}",
".fbtn.warn{color:var(--bad)}",
".fbtn.dropok{outline:2px dashed var(--glow);outline-offset:-2px}",
".fdiv{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;padding:12px 9px 4px}",
".accsw{display:grid;gap:1px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--line)}",
".adot{width:9px;height:9px;border-radius:50%;flex:none}",
".atx{display:grid;min-width:0}.atl,.atu{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.atu{font-size:11.5px;opacity:.75}",
".awarn{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--bad);color:#fff;font-size:12px;font-weight:700;flex:none}",
".mlistp{display:flex;flex-direction:column;max-height:calc(100vh - 210px);min-height:320px;overflow:hidden}",
".mchips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}",
".mchips .sp{flex:1}",".mchips .cn{font-family:var(--f-mono);font-size:11.5px;opacity:.75}",
".mchips .ci svg{width:13px;height:13px;vertical-align:-2px}",
".mscroll{overflow-y:auto;flex:1;min-height:0}",
".mgrp{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:600;padding:10px 14px 4px;position:sticky;top:0;background:var(--panel);z-index:1}",
".mrow2{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;padding:10px 12px 10px 14px;border-bottom:1px solid var(--line);cursor:pointer;position:relative;touch-action:pan-y;background:var(--panel);transition:transform .15s}",
".mrow2:hover{background:var(--sunk)}",
".mrow2.sel{background:var(--glow-soft)}",
".mrow2.picked{background:var(--info-soft)}",
".mrow2.trashed{opacity:.75}",
".mrow2.dragging{opacity:.5}",
".mrow2.unread::before{content:'';position:absolute;left:4px;top:24px;width:6px;height:6px;border-radius:50%;background:var(--glow)}",
".mav{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12.5px;font-weight:700;flex:none;cursor:pointer;user-select:none}",
".mav.lg{width:42px;height:42px;font-size:14px;cursor:default}",
".mav .ck{display:none}.mav .ck svg{width:16px;height:16px}",
".mrow2.picked .mav{background:var(--info)!important;color:#fff!important}",
".mrow2.picked .mav .i{display:none}.mrow2.picked .mav .ck{display:grid}",
".mm{min-width:0;display:grid;gap:1px}",
".mm .l1,.mm .l2{display:flex;gap:6px;align-items:center;min-width:0}",
".mm .who{font-weight:500;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}",
".mrow2.unread .who{font-weight:700;color:var(--ink)}",
".mm .when{font-size:12px;color:var(--ink-3);white-space:nowrap;margin-left:auto;flex:none}",
".mm .subj{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;flex:1;min-width:0}",
".mrow2.unread .subj{font-weight:600}",
".mm .pre{font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
".mm .tag{flex:none}",
".ics{display:flex;gap:3px;color:var(--ink-3);flex:none}.ics svg{width:13px;height:13px}",
".star{border:0;background:none;padding:0 2px;color:var(--ink-3);font-size:15px;line-height:1;flex:none}",
".star.on{color:var(--glow)}",
".accpill{font-size:11px;font-weight:600;padding:0 7px;border-radius:99px;white-space:nowrap;flex:none}",
".mqa{position:absolute;right:8px;top:6px;display:none;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:2px;box-shadow:0 2px 8px rgba(0,0,0,.08)}",
".mrow2:hover .mqa{display:flex}",
"@media (hover:none){.mrow2:hover .mqa{display:none}}",
".mqa button{border:0;background:none;padding:5px;border-radius:6px;color:var(--ink-2);display:grid}",
".mqa button:hover{background:var(--sunk);color:var(--ink)}.mqa button.dg:hover{color:var(--bad)}",
".mqa svg{width:15px;height:15px}",
".mempty{display:grid;justify-items:center;gap:6px;padding:40px 20px;color:var(--ink-3);text-align:center;font-size:13.5px}",
".mempty b{color:var(--ink-2);font-size:15px}.mempty.tall{padding:90px 20px}",
".mempty .ei{width:46px;height:46px;border-radius:50%;background:var(--sunk);display:grid;place-items:center;color:var(--ink-3)}.mempty .ei svg{width:22px;height:22px}",
".kbd{display:inline-block;font-family:var(--f-mono);font-size:11.5px;line-height:1.5;border:1px solid var(--line);border-bottom-width:2px;border-radius:5px;padding:0 5px;background:var(--sunk);color:var(--ink-2);min-width:20px;text-align:center}",
".mread{display:flex;flex-direction:column;max-height:calc(100vh - 150px);min-height:320px;overflow:hidden;position:sticky;top:12px}",
".rtool{display:flex;gap:2px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid var(--line);align-items:center}",
".rb{display:inline-flex;align-items:center;gap:6px;border:0;background:none;border-radius:8px;padding:7px 8px;color:var(--ink-2);font-size:13px;font-weight:600}",
".rb:hover{background:var(--sunk);color:var(--ink)}",
".rb svg{width:17px;height:17px}",
".rb.dg:hover{color:var(--bad)}.rb.on{color:var(--glow)}",
".rb.pri{background:var(--ink);color:var(--ground)}",
".rsep{width:1px;height:20px;background:var(--line);margin:0 4px}.rsp{flex:1}",
".rb-back{display:none}",
".rin{padding:16px 20px 22px;overflow-y:auto;display:grid;gap:14px;align-content:start;min-width:0;flex:1}",
".rsubj{font-size:21px;overflow-wrap:anywhere;line-height:1.25}",
".rtags{display:flex;gap:6px;flex-wrap:wrap;margin-top:-6px}",
".tagbtn{border:0;cursor:pointer}",
".rsender{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:12px;align-items:center}",
".rn{font-weight:600;overflow-wrap:anywhere}",
".raddr{border:0;background:none;padding:0;color:var(--info);font:inherit;font-weight:500;font-size:13.5px;cursor:pointer;overflow-wrap:anywhere;text-align:left}",
".raddr:hover{text-decoration:underline}",
".rto{font-size:13px;color:var(--ink-3);overflow-wrap:anywhere}",
".rdate{font-size:12.5px;color:var(--ink-3);text-align:right;display:grid}",
".mframe{width:100%;height:max(440px,calc(100vh - 470px));border:1px solid var(--line);border-radius:10px;background:#fff}",
".mbody a{color:var(--info)}",
".attbox{border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:8px}",
".atth{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--ink-2);font-weight:600;flex-wrap:wrap;align-items:center}",
".atth svg{width:14px;height:14px;vertical-align:-2px}",
".atth .link{display:inline-flex;gap:5px;align-items:center;padding:0}",
".attl{display:flex;flex-wrap:wrap;gap:6px}",
".att{display:inline-flex;align-items:stretch;border:1px solid var(--line);border-radius:9px;overflow:hidden;max-width:100%;font-size:13px;background:var(--panel)}",
".att>a,.att>button,.att>.ai{display:flex;align-items:center;gap:6px;padding:5px 9px;text-decoration:none;color:var(--ink);border:0;background:none;min-width:0}",
".att>a:hover,.att>button:hover{background:var(--sunk)}",
".att>*+*{border-left:1px solid var(--line)!important}",
".att svg{width:15px;height:15px}",
".att .ak{font-size:10.5px;font-weight:700;font-family:var(--f-mono);color:var(--ink-3);text-transform:uppercase}",
".att .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px;min-width:0}",
".att .sz{color:var(--ink-3);font-size:12px;white-space:nowrap}",
".att .done{color:var(--ok)}",
".qreply{border:1px solid var(--line);border-radius:12px;padding:10px;display:grid;gap:6px;background:var(--panel)}",
".qreply textarea{border:0;background:none;resize:vertical;min-height:64px;width:100%;font:inherit;color:inherit;outline:none}",
".qbar{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap}",
".qh{margin-right:auto;font-size:12px;color:var(--ink-3)}",
".rrel{display:grid;gap:2px}",
".ri{display:flex;gap:8px;align-items:center;border:0;background:none;padding:7px 8px;border-radius:8px;text-align:left;font-size:13.5px;color:var(--ink);min-width:0}",
".ri:hover{background:var(--sunk)}.ri svg{width:13px;height:13px}",
".ri .s{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.ri .d{font-size:12px;color:var(--ink-3)}",
".mbulk{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 12px;border-radius:var(--r);background:var(--info-soft);position:sticky;top:8px;z-index:5}",
".mbulk .sp{flex:1}",
".sheetf{position:static;max-height:none;padding:0}",
"@media (max-width:1180px){.mbox{grid-template-columns:minmax(0,340px) minmax(0,1fr)}.mbox>.mfold{display:none}.fpill{display:inline-flex}}",
"@media (max-width:900px){.mbox{grid-template-columns:minmax(0,1fr)}.mbox.reading>.mlistp{display:none}.mbox:not(.reading)>.mread{display:none}",
"  .mlistp,.mread{max-height:none;min-height:0;overflow:visible;position:static}.mscroll{overflow:visible}.rin{overflow:visible}",
"  .rb-back{display:inline-flex}.rb .rl{display:none}.rsep{display:none}.rtool{position:sticky;top:0;z-index:2;background:var(--panel);border-radius:var(--r) var(--r) 0 0}",
"  .mframe{height:70vh}.rsender{grid-template-columns:42px minmax(0,1fr)}.rdate{grid-column:2;text-align:left}",
"  .msearch{max-width:none;flex-basis:100%}.mgrp{position:static}.mtools .fpill{flex:none}",
"  .mrow2 .mqa{display:none!important}.mbulk{top:0}}"
].join("\n"));

F.view({id:"post",label:"Postfach",short:"Post",icon:"post",order:40,mobile:true,count:function(){ return inboxUnread(); },render:vPost,after:after});
})();
