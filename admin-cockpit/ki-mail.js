/* KI (Claude) – Postfach & Anfragen: Mail zusammenfassen, Antwortvorschlag (Simons Ton, landet im Schnell-Antworten-Feld),
   Anfragen aus dem Kontaktformular einschätzen (Priorität, Budget, nächster Schritt) und in die Kundenakte übernehmen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
var M=F.M=F.M||{};
var MS={};   // Ergebnisse je Mail (nur in diesem Tab)

function mailPayload(m){
  var body=String(m.body||m.preview||"");
  return {from:m.from||"",fromName:m.fromName||"",to:m.to||"",date:m.date||"",subject:m.subject||"",text:m.bodyHtml?"":body.slice(0,60000),html:m.bodyHtml?body.slice(0,120000):""};
}
M.kiBar=function(m){
  if(!m||m.outbox||m.draftLocal||(M.isTrashed&&M.isTrashed(m))) return "";
  var r=MS[m.id]||{}, sent=M.isSent&&M.isSent(m);
  var bar='<div class="kibar"><span class="kibar-t">'+F.svg("spark")+' KI</span>'+
    '<button type="button" class="btn" data-act="kimsum:'+esc(m.id)+'"'+(r.busy?" disabled":"")+'>'+(r.busy==="sum"?"Fasse zusammen …":"Zusammenfassen")+'</button>'+
    (sent?'':'<button type="button" class="btn" data-act="kimreply:'+esc(m.id)+'"'+(r.busy?" disabled":"")+'>'+(r.busy==="reply"?"Schreibe Vorschlag …":"Antwort vorschlagen")+'</button>')+
    '<button type="button" class="btn icon" data-act="kimask:'+esc(m.id)+'" title="Im Assistenten zu dieser Mail fragen" aria-label="Assistent fragen">?</button></div>';
  var s=r.sum;
  if(s) bar+='<div class="kisum"><div class="row-between"><b>Zusammenfassung</b><button type="button" class="link" data-act="kimsumx:'+esc(m.id)+'">Ausblenden</button></div><p>'+esc(s.summary)+'</p>'+
    ((s.points||[]).length?'<ul>'+s.points.map(function(p){ return '<li>'+esc(p)+'</li>'; }).join("")+'</ul>':'')+
    '<div class="kitags">'+(s.actionNeeded?'<span class="tag warn">Handlung nötig</span>':'<span class="tag grey">nur zur Info</span>')+(s.deadline?'<span class="tag bad">bis '+esc(F.de(s.deadline))+'</span>':'')+(s.isLead?'<span class="tag info">mögliche Kundenanfrage</span>':'')+'</div>'+
    (s.deadline||s.actionNeeded?'<div class="row wrap"><button type="button" class="btn" data-act="kimtodo:'+esc(m.id)+'">Als To-Do'+(s.deadline?" bis "+esc(F.deShort(s.deadline)):"")+'</button></div>':'')+'</div>';
  if(r.err) bar+='<div class="bad-t" style="font-size:13px">'+esc(r.err)+'</div>';
  return bar;
};
function needKi(){ if(K.st&&!K.st.configured){ F.toast(K.NOT_SET,true); return false; } return true; }
function rr(){ if(F.current==="post") F.render(); }
F.action("kimsum",function(id){
  var m=M.find&&M.find(id); if(!m||!needKi()) return;
  var r=MS[id]=MS[id]||{}; r.busy="sum"; r.err=""; rr();
  K.api("mail",{op:"summary",mail:mailPayload(m)}).then(function(j){ r.busy=""; r.sum=j; rr(); K.load(true); }).catch(function(e){ r.busy=""; r.err=e.message; rr(); });
});
F.action("kimsumx",function(id){ if(MS[id]) MS[id].sum=null; rr(); });
F.action("kimreply",function(id){
  var m=M.find&&M.find(id); if(!m||!needKi()) return;
  var r=MS[id]=MS[id]||{}; r.busy="reply"; r.err=""; rr();
  var ta=document.getElementById("mqr"), hint=ta&&F.UI.mqrFor===id?String(ta.value||"").trim():"";
  K.api("mail",{op:"reply",mail:mailPayload(m),hint:hint}).then(function(j){
    r.busy=""; K.load(true);
    if(document.getElementById("mqr")||F.current==="post"){ F.UI.mqr=j.text; F.UI.mqrFor=id; F.UI.mfocusQr=true; rr(); F.toast("Antwortvorschlag eingefügt – prüfen und senden (Signatur und Zitat werden angehängt)"); }
    else F.compose({title:"Antworten",to:m.replyTo||m.from,subject:"Re: "+String(m.subject||"").replace(/^(re|aw)\s*:\s*/i,""),text:j.text,inReplyTo:m.messageId||undefined,account:M.accOf?M.accOf(m):undefined});
  }).catch(function(e){ r.busy=""; r.err=e.message; rr(); });
});
F.action("kimtodo",function(id){
  var m=M.find&&M.find(id), s=MS[id]&&MS[id].sum; if(!m||!s||!F.addTodo) return;
  F.addTodo({text:"✉ "+(m.fromName||m.from||"")+": "+(s.summary||m.subject||"").slice(0,180),due:s.deadline||"",mailId:id}).then(function(){ F.toast("To-Do angelegt"); });
});
F.action("kimask",function(id){
  var m=M.find&&M.find(id); if(!m||!K.chatOpen) return;
  K.chatOpen("Zur Mail „"+(m.subject||"")+"“ von "+(m.fromName||m.from||"")+" (mail_id "+id+"): ");
});

/* ---------- Anfragen (Kundenakte) ---------- */
F.kiLeadHtml=function(l){
  var r=K.st&&K.st.leads&&K.st.leads[l.id], busy=K.ui&&K.ui.busy["lead"+l.id];
  if(!r) return '<div class="kibox"><div class="row-between"><b>'+F.svg("spark")+' KI-Einschätzung</b><button type="button" class="btn" data-act="kilead:'+esc(l.id)+'"'+(busy?" disabled":"")+'>'+(busy?"Schätze ein …":"Einschätzen")+'</button></div><span class="muted">Priorität, Budget und nächster Schritt für diese Anfrage.</span></div>';
  return '<div class="kibox"><div class="row-between"><b>'+F.svg("spark")+' KI-Einschätzung</b><span class="tag '+(r.priority==="hoch"?"bad":r.priority==="mittel"?"warn":"grey")+'">Priorität '+esc(r.priority)+'</span></div>'+
    '<div class="kitags">'+(r.projectType?'<span class="tag grey">'+esc(r.projectType)+'</span>':'')+(r.budgetRange?'<span class="tag grey">'+esc(r.budgetRange)+'</span>':'')+'</div>'+
    '<div><b>Nächster Schritt:</b> '+esc(r.nextStep)+'</div><div class="muted">'+esc(r.notes)+'</div>'+
    '<div class="row wrap"><button type="button" class="btn" data-act="kileadfill:'+esc(l.id)+'">In Notizen &amp; Projektwert übernehmen</button><button type="button" class="link" data-act="kileadre:'+esc(l.id)+'">Neu einschätzen</button></div></div>';
};
K.onLead=function(id){ if(F.UI.leadSel===id&&F.openLead&&document.getElementById("drawer").classList.contains("on")) F.openLead(id); };
F.action("kileadfill",function(id){
  var r=K.st&&K.st.leads&&K.st.leads[id], f=document.querySelector('[data-form="leadedit"]'); if(!r||!f) return;
  var add="KI-Einschätzung ("+F.de(F.D.today)+"): Priorität "+r.priority+(r.budgetRange?", Budget "+r.budgetRange:"")+". Nächster Schritt: "+r.nextStep+"\n"+r.notes;
  f.notes.value=(f.notes.value?f.notes.value.replace(/\s+$/,"")+"\n\n":"")+add;
  if(!f.value.value&&r.budgetEur>0) f.value.value=r.budgetEur;
  f.notes.focus(); F.toast("Eingetragen – mit „Speichern“ übernehmen");
});
F.action("kileadre",function(id){
  if(!needKi()) return; K.ui.busy["lead"+id]=1;
  K.api("lead",{id:id,force:true}).then(function(j){ K.ui.busy["lead"+id]=0; K.st.leads[id]=j.lead; K.onLead(id); K.rerender(); }).catch(function(e){ K.ui.busy["lead"+id]=0; K.fail(e); });
});

F.css([
".kibar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 0}",
".kibar-t{display:inline-flex;gap:5px;align-items:center;font-size:12px;font-weight:700;color:var(--info);text-transform:uppercase;letter-spacing:.05em;margin-right:4px}.kibar-t svg{width:14px;height:14px}",
".kibar .btn{padding:4px 10px;font-size:12.5px}",
".kisum{border:1px solid var(--line);border-left:3px solid var(--info);border-radius:10px;padding:10px 12px;display:grid;gap:6px;background:var(--panel);font-size:14px}",
".kisum p{margin:0}.kisum ul{margin:0;padding-left:20px}"
].join("\n"));
})();
