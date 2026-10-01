(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort, svg=F.svg, head=F.head, UI=F.UI, ago=F.ago, dayLabel=F.dayLabel;
function D_(){ return F.D; }
/* Grundgerüst – wird zum vollen Funktionsumfang ausgebaut. */

UI.mailFilter=UI.mailFilter||"inbox";
function mailAction(op,m){ return F.api("/admin/api/mail-action",{body:{op:op,items:[{folder:m.folder||"INBOX",uid:m.uid,account:m.account||""}]}}).catch(function(){}); }
function isInbox(m){ return F.isInbox(m); }
F.action("mail",function(v){ var m=F.D.mail.messages.find(function(y){return y.id===v;}); if(!m) return; UI.mailSel=v; if(!m.read){ m.read=true; mailAction("seen",m); } if(F.current!=="post") F.go("post"); else F.render(); });
F.action("mailunread",function(v){ var m=F.D.mail.messages.find(function(y){return y.id===v;}); if(m){ m.read=false; mailAction("unseen",m); F.render(); } });
F.action("reply",function(v){ var m=F.D.mail.messages.find(function(y){return y.id===v;}); if(m) F.compose({title:"Antworten",to:m.replyTo||m.from,subject:"Re: "+String(m.subject||"").replace(/^(re|aw|fwd?|wg):\s*/i,""),text:"\n\n\nAm "+new Date(m.date).toLocaleString("de-AT")+" schrieb "+(m.fromName||m.from)+":\n"+String(m.body&&!m.bodyHtml?m.body:(m.preview||"")).split("\n").map(function(l){return "> "+l;}).join("\n"),inReplyTo:m.messageId||"",account:m.account}); });
F.action("mailtodo",function(v){ var m=F.D.mail.messages.find(function(y){return y.id===v;}); if(m) F.addTodo({text:"Mail: "+(m.subject||"")+" ("+(m.fromName||m.from)+")"}).then(function(){ F.toast("Als To-Do angelegt"); }); });
F.action("mailf",function(k){ UI.mailFilter=k; F.render(); });
function vPost(){
  var all=F.D.mail.messages, f=UI.mailFilter;
  var list=all.filter(function(m){ if(f==="inbox") return isInbox(m); if(f==="unread") return isInbox(m)&&!m.read; if(f==="open") return isInbox(m)&&!m.answered; if(f==="sent") return /sent|gesendet/i.test(m.folder||""); return true; });
  var sel=all.find(function(m){return m.id===UI.mailSel;});
  var chip=function(k,l){ return '<button class="chip" data-mailf="'+k+'" aria-pressed="'+(f===k)+'">'+l+'</button>'; };
  return head("Postfach",F.D.mail.fetchedAt?"Stand "+ago(F.D.mail.fetchedAt)+". Ordner, Regeln und Anhänge an sevDesk weiterhin im klassischen Dashboard.":"Postfach wird geladen …",'<button class="btn primary" data-act="compose">Neue Mail</button>')+
  '<div class="chips">'+chip("inbox","Posteingang")+chip("unread","Ungelesen")+chip("open","Unbeantwortet")+chip("sent","Gesendet")+chip("all","Alle")+'</div>'+
  '<div class="mailgrid"><section class="panel mlist">'+(list.length?list.slice(0,120).map(function(m){ return '<button class="mrow'+(m.read?" read":"")+'" data-act="mail:'+esc(m.id)+'"'+(m.id===UI.mailSel?' aria-current="true"':'')+'><span class="udot"></span><span style="min-width:0"><div class="from">'+esc(/sent|gesendet/i.test(m.folder||"")?"An: "+(m.toName||m.to):(m.fromName||m.from))+'</div><div class="sub">'+esc(m.subject||"(kein Betreff)")+'</div></span><span class="muted num">'+esc(fmtMailDate(m.date))+'</span></button>'; }).join(""):'<div class="empty">Keine Mails.</div>')+'</section>'+
  '<section class="panel" id="mailview">'+(sel?mailView(sel):'<div class="empty">Mail auswählen.</div>')+'</section></div>';
}
function fmtMailDate(iso){ var d=new Date(iso); if(isNaN(d)) return ""; var n=new Date(); if(d.toDateString()===n.toDateString()) return d.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); return d.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"}); }
function attHref(m,a){ return "/admin/api/mail-attachment?folder="+encodeURIComponent(m.folder||"INBOX")+"&uid="+encodeURIComponent(m.uid)+"&index="+encodeURIComponent(a.index||0)+"&account="+encodeURIComponent(m.account||""); }
function mailView(m){
  var atts=(m.attachments||[]);
  return '<div class="mview"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0"><h2 style="font-size:20px;overflow-wrap:anywhere">'+esc(m.subject||"(kein Betreff)")+'</h2><div class="muted">'+esc((m.fromName?m.fromName+" ":"")+"<"+(m.from||"")+">")+' · '+esc(new Date(m.date).toLocaleString("de-AT"))+'</div>'+(m.to?'<div class="muted">An: '+esc(m.to)+'</div>':'')+'</div>'+
    '<div class="acts"><button class="btn primary" data-act="reply:'+esc(m.id)+'">Antworten</button><button class="btn" data-act="mailtodo:'+esc(m.id)+'">Als To-Do</button><button class="btn" data-act="mailunread:'+esc(m.id)+'">Ungelesen</button></div></div>'+
    (atts.length?'<div class="atts">'+atts.map(function(a){ return '<a class="btn" href="'+attHref(m,a)+'&inline=1" target="_blank" rel="noopener">📎 '+esc(a.filename||a.name||"Anhang")+'</a>'; }).join("")+'</div>':'')+
    (m.bodyHtml?'<iframe sandbox="" referrerpolicy="no-referrer" title="Mail-Inhalt" srcdoc="'+esc('<base target="_blank"><style>body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1b2420;margin:12px}img{max-width:100%}</style>'+(m.body||""))+'"></iframe>':'<div class="mbody">'+esc(m.body||m.preview||"")+'</div>')+'</div>';
}
function mailAction(op,m){ return api("/admin/api/mail-action",{method:"POST",body:{op:op,items:[{folder:m.folder||"INBOX",uid:m.uid,account:m.account||""}]}}).catch(function(){}); }

F.view({id:"post",label:"Postfach",short:"Post",icon:"post",order:40,mobile:true,count:function(){ return F.unreadMails().length; },render:vPost});
})();
