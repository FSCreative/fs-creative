/* KI (Claude) – Postfach & Anfragen: Mail zusammenfassen, Antwortvorschlag (Simons Ton, landet im Schnell-Antworten-Feld),
   Anfragen aus dem Kontaktformular einschätzen (Priorität, Budget, nächster Schritt) und in die Kundenakte übernehmen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
var M=F.M=F.M||{};
var MS={};   // Ergebnisse je Mail (nur in diesem Tab)
function spark(){ return F.svg(F.icons.sparkle?"sparkle":"spark"); }

function mailPayload(m){
  var body=String(m.body||m.preview||"");
  return {from:m.from||"",fromName:m.fromName||"",to:m.to||"",date:m.date||"",subject:m.subject||"",text:m.bodyHtml?"":body.slice(0,60000),html:m.bodyHtml?body.slice(0,120000):""};
}
M.kiBar=function(m){
  if(!m||m.outbox||m.draftLocal||(M.isTrashed&&M.isTrashed(m))) return "";
  var r=MS[m.id]||{}, sent=M.isSent&&M.isSent(m);
  var bar='<div class="kibar" role="group" aria-label="KI zu dieser Mail"><span class="kibar-t">'+spark()+' KI</span>'+
    '<button type="button" class="btn'+(r.busy==="sum"?" busy":"")+'" data-act="kimsum:'+esc(m.id)+'"'+(r.busy?" disabled":"")+'>'+(r.busy==="sum"?"Fasse zusammen …":"Zusammenfassen")+'</button>'+
    (sent?'':'<button type="button" class="btn'+(r.busy==="reply"?" busy":"")+'" data-act="kimreply:'+esc(m.id)+'"'+(r.busy?" disabled":"")+'>'+(r.busy==="reply"?"Schreibe Vorschlag …":"Antwort vorschlagen")+'</button>')+
    '<button type="button" class="btn icon" data-act="kimask:'+esc(m.id)+'" title="Im Assistenten zu dieser Mail fragen" aria-label="Assistent fragen">?</button></div>';
  var s=r.sum;
  if(s) bar+='<div class="kisum"><div class="row-between"><b>Zusammenfassung</b><button type="button" class="link" data-act="kimsumx:'+esc(m.id)+'">Ausblenden</button></div><p>'+esc(s.summary)+'</p>'+
    ((s.points||[]).length?'<ul>'+s.points.map(function(p){ return '<li>'+esc(p)+'</li>'; }).join("")+'</ul>':'')+
    '<div class="kitags">'+(s.actionNeeded?'<span class="tag warn">Handlung nötig</span>':'<span class="tag grey">nur zur Info</span>')+(s.deadline?'<span class="tag bad">bis '+esc(F.de(s.deadline))+'</span>':'')+(s.isLead?'<span class="tag info">mögliche Kundenanfrage</span>':'')+'</div>'+
    (s.deadline||s.actionNeeded?'<div class="row wrap"><button type="button" class="btn" data-act="kimtodo:'+esc(m.id)+'">Als Aufgabe'+(s.deadline?" bis "+esc(F.deShort(s.deadline)):"")+'</button></div>':'')+'</div>';
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
    /* Am Handy ist das Schnell-Antworten-Feld ausgeblendet → Vorschlag im Verfassen-Fenster öffnen */
    if(window.innerWidth>900&&(document.getElementById("mqr")||F.current==="post")){ F.UI.mqr=j.text; F.UI.mqrFor=id; F.UI.mfocusQr=true; rr(); F.toast("Antwortvorschlag eingefügt – prüfen und senden (Signatur und Zitat werden angehängt)"); }
    else F.compose({title:"Antworten",to:m.replyTo||m.from,subject:"Re: "+String(m.subject||"").replace(/^(re|aw)\s*:\s*/i,""),text:j.text,inReplyTo:m.messageId||undefined,account:M.accOf?M.accOf(m):undefined});
  }).catch(function(e){ r.busy=""; r.err=e.message; rr(); });
});
F.action("kimtodo",function(id){
  var m=M.find&&M.find(id), s=MS[id]&&MS[id].sum; if(!m||!s||!F.addTodo) return;
  F.addTodo({text:"✉ "+(m.fromName||m.from||"")+": "+(s.summary||m.subject||"").slice(0,180),due:s.deadline||"",mailId:id}).then(function(){ F.toast("Aufgabe angelegt",false,"Ansehen",function(){ F.go("auftraege"); }); });
});
F.action("kimask",function(id){
  var m=M.find&&M.find(id); if(!m||!K.chatOpen) return;
  K.chatOpen("Zur Mail „"+(m.subject||"")+"“ von "+(m.fromName||m.from||"")+" (mail_id "+id+"): ");
});

/* ---------- Anfragen (Kundenakte) ---------- */
F.kiLeadHtml=function(l){
  var r=K.st&&K.st.leads&&K.st.leads[l.id], busy=K.ui&&K.ui.busy["lead"+l.id];
  if(!r) return '<div class="kibox"><div class="row-between"><b>'+spark()+' KI-Einschätzung</b><button type="button" class="btn" data-act="kilead:'+esc(l.id)+'"'+(busy?" disabled":"")+'>'+(busy?"Schätze ein …":"Einschätzen")+'</button></div><span class="muted">Priorität, Budget und nächster Schritt für diese Anfrage.</span></div>';
  var pt='<span class="tag '+(r.priority==="hoch"?"bad":r.priority==="mittel"?"warn":"grey")+'">Priorität '+esc(r.priority)+'</span>';
  var acts='<div class="kl-acts">'+(r.positions&&r.positions.length?'<button type="button" class="btn pri" data-act="kileadoffer:'+esc(l.id)+'">Angebot daraus</button>':'')+'<button type="button" class="btn" data-act="kileadfill:'+esc(l.id)+'">In Notizen übernehmen</button><button type="button" class="link" data-act="kileadre:'+esc(l.id)+'">Neu einschätzen</button></div>';
  if(!r.v) return '<div class="kibox kl"><div class="row-between"><b>'+spark()+' KI-Einschätzung</b>'+pt+'</div>'+
    '<div class="kitags">'+(r.projectType?'<span class="tag grey">'+esc(r.projectType)+'</span>':'')+(r.budgetRange?'<span class="tag grey">'+esc(r.budgetRange)+'</span>':'')+'</div>'+
    '<div><b>Nächster Schritt:</b> '+esc(r.nextStep||"")+'</div><div class="muted">'+esc(r.notes||"")+'</div><p class="muted kl-old">Ältere Einschätzung – „Neu einschätzen“ liefert Positionen und Preise.</p>'+acts+'</div>';
  var li=function(a){ return '<ul class="kl-ul">'+a.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join("")+'</ul>'; };
  var sec=function(t,h){ return '<div class="kl-s"><h4>'+t+'</h4>'+h+'</div>'; };
  var pos=r.positions||[], rec=r.recurring||[];
  return '<div class="kibox kl"><div class="row-between"><b>'+spark()+' KI-Einschätzung</b>'+pt+'</div>'+
    (r.summary?'<p class="kl-sum">'+esc(r.summary)+'</p>':'')+
    '<div class="kitags">'+(r.projectType?'<span class="tag grey">'+esc(r.projectType)+'</span>':'')+(r.reason?'<span class="kl-why">'+esc(r.reason)+'</span>':'')+'</div>'+
    (r.feasibility&&(r.feasibility.summary||(r.feasibility.checks||[]).length)?sec("Machbarkeit",'<div class="kl-fz"><span class="tag '+({"machbar":"ok","machbar mit Einschränkungen":"warn","kritisch":"bad"}[r.feasibility.verdict]||"grey")+'">'+esc(r.feasibility.verdict)+'</span>'+(r.feasibility.summary?'<span>'+esc(r.feasibility.summary)+'</span>':'')+'</div>'+
      ((r.feasibility.checks||[]).length?'<ul class="kl-fc">'+r.feasibility.checks.map(function(c){ return '<li class="'+esc(c.status)+'"><i>'+(c.status==="ok"?"✓":c.status==="problem"?"✕":"!")+'</i><span><b>'+esc(c.topic)+'</b> '+esc(c.note)+'</span></li>'; }).join("")+'</ul>':'')):'')+
    (r.needs&&r.needs.length?sec("Bedarf",li(r.needs)):'')+
    (pos.length?sec("Positionen (netto)",'<div class="kl-pos">'+pos.map(function(p){ var t=p.qty*p.priceNet; return '<div class="kl-p"><div class="kl-pn"><b>'+esc(p.name)+'</b>'+(p.desc?'<span>'+esc(p.desc)+'</span>':'')+'</div><div class="kl-pa"><b class="num">'+F.eur(t)+'</b>'+(p.qty!==1?'<span>'+String(p.qty).replace(".",",")+' '+esc(p.unit)+' × '+F.eur(p.priceNet)+'</span>':'<span>'+esc(p.unit)+'</span>')+'</div></div>'; }).join("")+
      '<div class="kl-p kl-tot"><div class="kl-pn"><b>Summe einmalig</b>'+(r.budgetRange?'<span>Spanne '+esc(r.budgetRange)+'</span>':'')+'</div><div class="kl-pa"><b class="num">'+F.eur(r.budgetEur)+'</b><span>brutto '+F.eur(r.budgetEur*1.2)+'</span></div></div></div>'):'')+
    (rec.length?sec("Laufend",'<div class="kl-pos">'+rec.map(function(p){ return '<div class="kl-p"><div class="kl-pn"><b>'+esc(p.name)+'</b></div><div class="kl-pa"><b class="num">'+F.eur(p.priceNet)+'</b><span>pro '+esc(p.per)+'</span></div></div>'; }).join("")+'</div>'):'')+
    (r.nextSteps&&r.nextSteps.length?sec("Nächste Schritte",li(r.nextSteps)):'')+
    (r.questions&&r.questions.length?sec("Fragen fürs Erstgespräch",li(r.questions)):'')+
    acts+'</div>';
};
F.css(".kl{gap:10px;min-width:0;overflow-wrap:anywhere}.kl p{margin:0}.kl-sum{font-size:14.5px;line-height:1.45}.kl-why{font-size:12.5px;color:var(--ink-3);align-self:center}"+
  ".kl-s{display:grid;gap:5px;min-width:0}.kl-s h4{margin:0;font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);font-weight:700}"+
  ".kl-ul{margin:0;padding-left:18px;display:grid;gap:3px;font-size:14px;line-height:1.4}"+
  ".kl-pos{display:grid;border:1px solid var(--line);border-radius:10px;background:var(--sunk);overflow:hidden}"+
  ".kl-p{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-top:1px solid var(--line);min-width:0}.kl-p:first-child{border-top:0}"+
  ".kl-pn{display:grid;gap:2px;min-width:0}.kl-pn b{font-size:14px;font-weight:600}.kl-pn span,.kl-pa span{font-size:12.5px;color:var(--ink-3)}"+
  ".kl-pa{display:grid;justify-items:end;gap:2px;flex:none;text-align:right}.kl-pa b{font-size:14px;font-weight:600;white-space:nowrap}.kl-pa span{white-space:nowrap}"+
  ".kl-tot{background:var(--hover,var(--sunk))}.kl-tot b{font-weight:700}.kl-old{font-size:12.5px}"+
  ".kl-fz{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;font-size:14px;line-height:1.4}.kl-fz .tag{white-space:nowrap}"+
  ".kl-fc{list-style:none;margin:2px 0 0;padding:0;display:grid;gap:5px;font-size:13.5px;line-height:1.4}.kl-fc li{display:grid;grid-template-columns:20px minmax(0,1fr);gap:6px}.kl-fc i{font-style:normal;font-weight:700;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;margin-top:1px;background:var(--warn-soft);color:var(--warn)}.kl-fc li.ok i{background:var(--ok-soft,var(--sunk));color:var(--ok)}.kl-fc li.problem i{background:var(--bad-soft);color:var(--bad)}.kl-fc b{font-weight:600}"+
  ".kl-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}"+
  "@media (max-width:900px){.kl-acts .btn{min-height:42px;flex:1 1 auto;justify-content:center}.kl-acts .link{min-height:40px}}");
F.action("kileadoffer",function(id){
  var r=K.st&&K.st.leads&&K.st.leads[id], l=F.D.leads.find(function(y){return y.id===id;}); if(!r||!l||!F.openOffer) return;
  F.openOffer({title:"Angebot · "+(l.company||l.name),contactName:l.company||l.name,email:l.email,address:[l.company,l.company&&l.name!==l.company?l.name:""].filter(Boolean).join("\n")||l.name,
    header:"Angebot"+(l.topic?" "+l.topic:""),headText:"Vielen Dank für Ihre Anfrage"+(l.topic?" zum Thema „"+l.topic+"“":"")+". Gerne biete ich Ihnen folgende Leistungen an:",
    items:(r.positions||[]).map(function(p){ return {name:p.name,text:p.desc,qty:p.qty,priceGross:String(Math.round(p.priceNet*1.2*100)/100),taxRate:20}; }),after:{leadId:l.id}});
});
K.onLead=function(id){ if(F.UI.leadSel===id&&F.openLead&&document.getElementById("drawer").classList.contains("on")) F.openLead(id); };
F.action("kileadfill",function(id){
  var r=K.st&&K.st.leads&&K.st.leads[id], f=document.querySelector('[data-form="leadedit"]'); if(!r||!f) return;
  var L=function(t,a){ return a&&a.length?"\n"+t+":\n"+a.map(function(x){ return "• "+x; }).join("\n"):""; };
  var add=r.v?"KI-Einschätzung ("+F.de(F.D.today)+"): Priorität "+r.priority+(r.projectType?" · "+r.projectType:"")+(r.summary?"\n"+r.summary:"")+L("Bedarf",r.needs)+
    L("Positionen (netto)",(r.positions||[]).map(function(p){ return p.name+(p.qty!==1?" ("+p.qty+" "+p.unit+")":"")+": "+F.eur(p.qty*p.priceNet); }))+(r.budgetEur?"\nSumme einmalig: "+F.eur(r.budgetEur)+" netto"+(r.budgetRange?" (Spanne "+r.budgetRange+")":""):"")+
    L("Laufend",(r.recurring||[]).map(function(p){ return p.name+": "+F.eur(p.priceNet)+"/"+p.per; }))+L("Nächste Schritte",r.nextSteps)+L("Fragen",r.questions)
    :"KI-Einschätzung ("+F.de(F.D.today)+"): Priorität "+r.priority+(r.budgetRange?", Budget "+r.budgetRange:"")+". Nächster Schritt: "+r.nextStep+"\n"+r.notes;
  f.notes.value=(f.notes.value?f.notes.value.replace(/\s+$/,"")+"\n\n":"")+add;
  if(!f.value.value&&r.budgetEur>0) f.value.value=r.budgetEur;
  f.notes.focus(); F.toast("Eingetragen – mit „Speichern“ übernehmen");
});
F.action("kileadre",function(id){
  if(!needKi()) return; K.ui.busy["lead"+id]=1;
  K.api("lead",{id:id,force:true}).then(function(j){ K.ui.busy["lead"+id]=0; K.st.leads[id]=j.lead; K.onLead(id); K.rerender(); }).catch(function(e){ K.ui.busy["lead"+id]=0; K.fail(e); });
});

F.css([
".kibar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:2px 0}",
".kibar-t{display:inline-flex;gap:5px;align-items:center;font-size:11.5px;font-weight:700;color:var(--glow-ink);text-transform:uppercase;letter-spacing:.07em;margin-right:4px}.kibar-t svg{width:15px;height:15px;color:var(--glow)}",
".kibar .btn{min-height:32px;padding:0 12px;font-size:12.5px;border-radius:99px;background:var(--sunk);border-color:var(--line)}",
".kibar .btn:hover{background:var(--hover,var(--sunk));border-color:color-mix(in srgb,var(--glow) 45%,transparent)}",
".kibar .btn.busy{color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 45%,transparent)}",
".kisum{border:1px solid var(--line);border-left:3px solid var(--glow);border-radius:12px;padding:12px 14px;display:grid;gap:6px;background:var(--sunk);font-size:14px;line-height:1.5;text-wrap:pretty}",
".kisum p{margin:0}.kisum ul{margin:0;padding-left:20px}.kisum .kitags{display:flex;flex-wrap:wrap;gap:6px}",
"@media (max-width:900px){.kibar .btn{min-height:40px;padding:0 14px;font-size:14px}}"
].join("\n"));
})();
