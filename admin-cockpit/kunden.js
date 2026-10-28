/* Ansicht "Kunden & Leads": Pipeline + Kundenakte. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;
var STAGES=F.STAGES=[["anfrage","Anfrage"],["entwurf","Entwurf"],["angebot","Angebot"],["auftrag","Auftrag"],["live","Live"]];
function val(l){ return +l.value||0; }
var GL=':root[data-theme="glas"] ';

F.invLine=function(i){ var cls=i.overdue?"bad":i.status===1000?"ok":i.status===100?"grey":"warn", lbl=i.overdue?"überfällig":i.status===1000?"bezahlt":i.status===100?"Entwurf":i.status===750?"teilbezahlt":"offen"; return '<span><a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'" target="_blank" rel="noopener" data-docview data-doctitle="Rechnung '+esc(i.nr||"Entwurf")+'">'+esc(i.nr||"Entwurf")+'</a> · '+de(i.date)+' · '+eur(i.gross)+' <span class="tag '+cls+'">'+lbl+'</span></span>'; };
/* Mails zur Kundenakte: Absender/Empfänger, „Antwort an“, CC und Text (Formular-Mails kommen von FS Creative mit der Kundenadresse als „Antwort an“).
   Zusätzlich wird beim Öffnen das ganze Postfach nach der Adresse durchsucht – der Schnappschuss enthält nur die letzten 200 Mails. */
var LMS={};
function mailHdr(m,e){ return JSON.stringify([m.from,m.to,m.replyTo,m.toList,m.ccList]).toLowerCase().indexOf(e)>-1; }
function leadMails(l){ var e=String(l.email||"").toLowerCase().trim(); if(!e) return [];
  var seen={}, all=F.D.mail.messages.filter(function(m){ return mailHdr(m,e)||String(m.preview||"").toLowerCase().indexOf(e)>-1; }).concat((LMS[e]&&LMS[e].list)||[]);
  return all.filter(function(m){ if(seen[m.id]||m.deleted) return false; seen[m.id]=1; return true; }).sort(function(a,b){ return String(b.date||"").localeCompare(String(a.date||"")); }).slice(0,12); }
function leadMailSearch(l){ var e=String(l.email||"").toLowerCase().trim(); if(!e||(LMS[e]&&(LMS[e].busy||Date.now()-LMS[e].at<300000))) return;
  LMS[e]={busy:true,at:Date.now(),list:[]};
  F.api("/admin/api/mail-search?q="+encodeURIComponent(e)+"&account=all").then(function(j){
    LMS[e]={busy:false,at:Date.now(),list:j&&j.ok?(j.messages||[]).filter(function(m){ return mailHdr(m,e); }):[]};
    var d=document.getElementById("drawer"); if(F.UI.leadSel===l.id&&d&&d.classList.contains("on")) openLead(l.id);
  }); }
function leadMailBusy(l){ var e=String(l.email||"").toLowerCase().trim(); return !!(LMS[e]&&LMS[e].busy); }
F.action("leadmail",function(id){ var e=String((F.D.leads.find(function(x){ return x.id===F.UI.leadSel; })||{}).email||"").toLowerCase(), hit=LMS[e]&&LMS[e].list.find(function(m){ return m.id===id; });
  if(hit&&!F.D.mail.messages.some(function(m){ return m.id===id; })) F.UI.msr={q:e,acc:"all",busy:false,list:LMS[e].list,err:""};   // ältere Mail aus der Suche: Postfach findet sie darüber
  if(F.M&&F.M.open) F.M.open(id,{fromOutside:true}); });
function leadInvoices(l){ if(!F.D.sev) return []; var names=[l.company,l.name].filter(Boolean).map(function(x){return x.toLowerCase();}); return F.D.sev.invoices.filter(function(i){ var c=String(i.contact||"").toLowerCase(); return c&&names.some(function(n){ return c===n||c.indexOf(n)>-1||n.indexOf(c)>-1; }); }).slice(0,8); }

/* ---------- Angebote (Order, Typ AN) ---------- */
var OFF=F.OFF={list:null,err:"",at:0,busy:false};
var OSTAT={100:["Entwurf","grey"],200:["versendet","info"],300:["abgelehnt","bad"],500:["angenommen","ok"],750:["teilw. berechnet","ok"],1000:["berechnet","ok"]};
function offOpen(o){ return o.status===100||o.status===200; }
F.offersLoad=function(force){
  if(OFF.busy) return Promise.resolve(); OFF.busy=true;
  return F.api("/admin/api/sevdesk/offers"+(force?"?force=1":"")).then(function(j){ OFF.busy=false; OFF.at=Date.now(); if(j&&j.ok&&Array.isArray(j.offers)){ OFF.list=j.offers; OFF.err=""; } else OFF.err=(j&&j.error)||"Fehler"; if(F.current==="kunden"||F.current==="geld") F.render(); })
    .catch(function(){ OFF.busy=false; OFF.at=Date.now(); OFF.err="Keine Verbindung zum Server."; if(F.current==="kunden") F.render(); });
};
/* Zuordnung Angebot ↔ Lead über Kontaktname (Firma oder Name), wie bei den Rechnungen */
function nameHit(c,l){ c=String(c||"").toLowerCase(); if(!c) return false; return [l.company,l.name].filter(Boolean).map(function(x){return x.toLowerCase();}).some(function(n){ return c===n||c.indexOf(n)>-1||n.indexOf(c)>-1; }); }
function leadOffers(l){ return (OFF.list||[]).filter(function(o){ return nameHit(o.contact,l); }); }
function offerLead(o){ return (F.D.leads||[]).find(function(l){ return l.stage!=="verloren"&&nameHit(o.contact,l); })||null; }
function offTag(o){ var s=OSTAT[o.status]||[String(o.status),"grey"]; return o.overdue?'<span class="tag bad">abgelaufen</span>':'<span class="tag '+s[1]+'">'+s[0]+'</span>'; }
F.offerLine=function(o){ return '<span><a href="/admin/api/sevdesk/offer-pdf?id='+encodeURIComponent(o.id)+'" target="_blank" rel="noopener" data-docview data-doctitle="Angebot '+esc(o.nr||"")+'">'+esc(o.nr||"Angebot")+'</a> · '+de(o.date)+' · '+eur(o.gross)+' '+offTag(o)+'</span>'; };
function offerRow(o){
  var l=offerLead(o), canInv=o.status===200||o.status===500||o.status===750;
  return '<tr><td style="white-space:nowrap"><a href="/admin/api/sevdesk/offer-pdf?id='+encodeURIComponent(o.id)+'" target="_blank" rel="noopener" data-docview data-doctitle="Angebot '+esc(o.nr||"Entwurf")+'">'+esc(o.nr||"Entwurf")+'</a></td>'+
    '<td>'+(l?'<button class="link" data-act="lead:'+esc(l.id)+'">'+esc(o.contact)+'</button>':esc(o.contact||"—"))+((o.header&&!/^angebot( |$)/i.test(o.header))||o.lines&&o.lines.length?'<div class="sub">'+esc(o.header&&!/^angebot( |$)/i.test(o.header)?o.header:o.lines.map(function(x){return x.name;}).slice(0,3).join(", "))+'</div>':'')+'</td>'+
    '<td class="num">'+deShort(o.date)+'</td><td class="num'+(o.overdue?' bad-t':'')+'" title="'+(o.validEst?'geschätzt: Angebotsdatum + 30 Tage':'laut Angebotstext')+'">'+(o.validUntil?(o.validEst?'~':'')+de(o.validUntil):'—')+'</td>'+
    '<td class="r num">'+eur(o.gross)+'<div class="sub">netto '+eur(o.net)+'</div></td><td>'+offTag(o)+'</td>'+
    '<td class="r"><span class="row" style="justify-content:flex-end;gap:4px;flex-wrap:wrap"><button class="btn" data-act="offpdf:'+esc(o.id)+'">PDF</button>'+(canInv?'<button class="btn" data-act="offar:'+esc(o.id)+'" title="Abschlagsrechnung (Anzahlung) erstellen">Abschlag</button>':'')+(o.status===750?'<button class="btn" data-act="offer:'+esc(o.id)+'" title="Schlussrechnung abzüglich der bezahlten Abschläge">Schlussrechnung</button>':'')+
      (o.status<750?'<button class="btn" data-act="offstat:'+esc(o.id)+'">Status</button>':'')+(canInv?'<button class="btn" data-act="offinv:'+esc(o.id)+'">In Rechnung</button>':'')+'</span></td></tr>';
}
F.offersPanelHtml=function(){ if(!OFF.list&&!OFF.busy&&!OFF.err) F.offersLoad(false); return offersPanel(); };
function offersPanel(){
  var f=F.UI.offF||"open", all=OFF.list||[];
  var flt={open:offOpen,acc:function(o){ return o.status>=500; },rej:function(o){ return o.status===300; },all:function(){ return true; }};
  var list=all.filter(flt[f]||flt.open), openL=all.filter(offOpen);
  var chip=function(k,lb){ return '<button class="chip" data-act="offf:'+k+'" aria-pressed="'+(f===k)+'">'+lb+' · '+all.filter(flt[k]).length+'</button>'; };
  var body=OFF.list==null?'<div class="empty">'+(OFF.err?'Angebote konnten nicht geladen werden: '+esc(OFF.err)+' <button class="btn" data-act="offreload">Erneut versuchen</button>':'Lade Angebote …')+'</div>':
    '<div class="scroll"><table><thead><tr><th>Nr.</th><th>Kunde</th><th>Datum</th><th>Gültig bis</th><th class="r">Betrag</th><th>Status</th><th></th></tr></thead><tbody>'+
    (list.map(offerRow).join("")||'<tr><td colspan="7" class="empty">Keine Angebote in dieser Ansicht.</td></tr>')+'</tbody></table></div>';
  return '<section class="panel" id="offers"><div class="panel-h"><h2>Angebote <span class="muted" style="font-weight:500;font-size:14px">'+(openL.length?openL.length+' offen · '+eur0(openL.reduce(function(s,o){return s+o.gross;},0)):'')+'</span></h2><div class="row wrap"><div class="chips">'+chip("open","Offen")+chip("acc","Angenommen")+chip("rej","Abgelehnt")+chip("all","Alle")+'</div><button class="btn primary" data-act="newoffer">Neues Angebot</button></div></div>'+body+'</section>';
}
F.action("offf",function(k,el){ var fromPipe=el&&el.closest&&el.closest(".pipe"); F.UI.offF=k; F.render(); var s=fromPipe&&document.getElementById("offers"); if(s&&s.scrollIntoView) s.scrollIntoView({behavior:"smooth",block:"start"}); });
F.action("offreload",function(){ OFF.list=null; OFF.err=""; F.render(); F.offersLoad(true); });
F.action("offpdf",function(id){ F.viewDoc("/admin/api/sevdesk/offer-pdf?id="+encodeURIComponent(id),"Angebot"); });
function offById(id){ return (OFF.list||[]).find(function(o){ return o.id===id; }); }
function offPost(path,body,okMsg){ return F.api(path,{body:Object.assign({confirm:true},body)}).then(function(j){ if(!j||!j.ok){ F.toast("Abgelehnt: "+((j&&j.error)||"unbekannt"),true); return null; } F.toast(okMsg); F.offersLoad(true); return j; }).catch(function(){ F.toast("Keine Verbindung zum Server.",true); return null; }); }
F.action("offstat",function(id){
  var o=offById(id); if(!o) return;
  var opts=[[200,"Versendet / offen"],[500,"Angenommen"],[300,"Abgelehnt"]].filter(function(x){ return x[0]!==o.status; });
  F.modal('<h2 style="font-size:19px">Status von '+esc(o.nr||"Angebot")+' ändern</h2><p class="muted" style="margin:0">'+esc(o.contact)+' · '+eur(o.gross)+' · jetzt: '+esc((OSTAT[o.status]||[o.status])[0])+'</p><p class="muted">Wird sofort gespeichert.'+(o.status===100?' „Versendet“ markiert den Entwurf als per PDF versendet (es wird keine Mail verschickt).':'')+'</p>'+
    '<div class="foot"><span></span><span class="row wrap">'+opts.map(function(x){ return '<button type="button" class="btn'+(x[0]===500?" primary":x[0]===300?" danger":"")+'" data-act="offsetstat:'+esc(id)+'|'+x[0]+'">'+x[1]+'</button>'; }).join("")+'<button type="button" class="btn" data-closemodal>Abbrechen</button></span></div>',"narrow");
});
F.action("offsetstat",function(v){
  var p=v.split("|"), id=p[0], st=+p[1], o=offById(id); F.closeModal();
  offPost("/admin/api/sevdesk/offer-status",{id:id,status:st},"Angebot "+((o&&o.nr)||"")+": "+(OSTAT[st]||[st])[0]).then(function(j){
    if(!j||st!==500) return; var l=o&&offerLead(o), order=["anfrage","entwurf","angebot","auftrag","live"];
    if(l&&order.indexOf(l.stage||"anfrage")<order.indexOf("auftrag")) F.toast("Angebot angenommen",false,"Lead → Auftrag",function(){ leadPost({op:"update",id:l.id,patch:{stage:"auftrag"}}).then(function(r){ if(r){ F.toast((l.company||l.name)+" ist jetzt in „Auftrag“"); F.render(); } }); });
  });
});
/* Abschlags- und Schlussrechnung (Abschläge aus dem Angebot, Schlussrechnung erst wenn alle Abschläge bezahlt) */
F.action("offar",function(id){
  var o=offById(id); if(!o) return;
  F.modal('<form data-form="offar" data-id="'+esc(id)+'" class="stackf"><div class="row-between"><h2 style="font-size:19px">Abschlagsrechnung zu '+esc(o.nr||"Angebot")+'</h2>'+F.btnClose()+'</div><p style="margin:0">'+esc(o.contact||"")+' · Angebot '+eur(o.gross)+' brutto</p>'+
    '<div class="grid2"><label class="fl">Prozent<input class="f num" name="percent" type="number" step="0.1" min="0" max="100" value="50"></label><label class="fl">oder Betrag brutto (€)<input class="f num" name="amount" type="number" step="0.01" min="0" placeholder="leer = Prozent"></label></div>'+
    '<p class="muted" style="margin:0;font-size:13px">USt auf Anzahlungen ist mit Zahlungseingang fällig (Mindest-Istbesteuerung) – das berücksichtigt die UVA automatisch. Die Schlussrechnung zieht alle bezahlten Abschläge ab.</p>'+
    '<div class="foot"><span class="err" id="offArErr"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Entwurf erstellen</button></span></div></form>',"narrow");
});
F.form("offar",function(f){ var id=f.getAttribute("data-id"), amt=+f.amount.value||0, pct=amt?0:(+f.percent.value||0), err=document.getElementById("offArErr");
  F.api("/admin/api/fin/partial",{body:{confirm:true,orderId:id,percent:pct,amount:amt}}).then(function(j){ if(!j||!j.ok){ err.textContent=(j&&j.error)||"Fehler"; return; } F.closeModal(); F.toast("Abschlagsrechnung als Entwurf angelegt"); F.offersLoad(true); F.load(true); F.UI.fin="invd:"+j.result.id; F.go("geld"); }); });
F.action("offer",function(id){
  var o=offById(id); if(!o) return;
  F.confirm("Schlussrechnung zu "+(o.nr||"dem Angebot")+" erstellen? Alle Positionen des Angebots, abzüglich der bezahlten Abschlagsrechnungen.","Schlussrechnung erstellen",function(){
    F.api("/admin/api/fin/final",{body:{confirm:true,orderId:id}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } F.toast("Schlussrechnung als Entwurf angelegt"); F.offersLoad(true); F.load(true); F.UI.fin="invd:"+j.result.id; F.go("geld"); });
  });
});
F.action("offinv",function(id){
  var o=offById(id); if(!o) return;
  F.confirm("Aus "+(o.nr||"dem Angebot")+" ("+eur(o.gross)+") eine Rechnung als Entwurf erstellen?","Rechnung erstellen",function(){
    offPost("/admin/api/sevdesk/offer-invoice",{id:id},"Rechnungsentwurf aus "+(o.nr||"Angebot")+" angelegt").then(function(j){ if(j){ F.load(true); if(j.id) F.toast("Rechnungsentwurf angelegt",false,"Öffnen",function(){ F.UI.fin="invd:"+j.id; F.go("geld"); }); } });
  });
});
F.openOffer=function(pre){ F.openInvoice(Object.assign({kind:"offer",title:"Neues Angebot",header:"Angebot"},pre||{})); };
F.action("newoffer",function(){ F.openOffer({}); });
F.action("leadoffer",function(id){ var l=F.D.leads.find(function(y){return y.id===id;}); if(!l) return;
  var g=+l.value||0;
  F.openOffer({title:"Angebot · "+(l.company||l.name),contactName:l.company||l.name,email:l.email,address:[l.company,l.company&&l.name!==l.company?l.name:""].filter(Boolean).join("\n")||l.name,
    header:"Angebot"+(l.topic?" "+l.topic:""),headText:"Vielen Dank für Ihre Anfrage"+(l.topic?" zum Thema „"+l.topic+"“":"")+". Gerne biete ich Ihnen folgende Leistungen an:",
    items:[{name:l.topic||"Website",priceGross:g?String(Math.round(g*1.2*100)/100):"",taxRate:20,qty:1}],after:{leadId:l.id}}); });
function leadPost(body){ return F.api("/admin/api/leads",{body:body}).then(function(j){ if(!j.ok){ F.toast("Speichern fehlgeschlagen: "+(j.error||""),true); return null; } F.D.leads=j.leads; return j; }); }

function openLead(id){
  var l=F.D.leads.find(function(x){return x.id===id;}); if(!l) return; F.UI.leadSel=id;
  var st=l.stage||"anfrage", mails=leadMails(l), invs=leadInvoices(l), offs=leadOffers(l); leadMailSearch(l);
  if(mob()){ F.openDrawer(leadSheet(l,st,mails,invs,offs),function(){ if(F.UI.leadSel) openLead(F.UI.leadSel); }); return; }
  F.openDrawer('<div class="row-between" style="align-items:flex-start"><div style="min-width:0"><div class="sec-t">Kundenakte</div><h2 style="overflow-wrap:anywhere;hyphens:auto">'+esc(l.company||l.name)+'</h2><div class="muted">'+esc(l.topic||"")+' · seit '+de(l.created)+'</div></div><button class="btn icon" data-close aria-label="Schließen">'+F.svg("close")+'</button></div>'+
    '<div><div class="sec-t">Phase</div><div class="stages">'+STAGES.map(function(s){ return '<button data-stage="'+s[0]+'" class="'+(s[0]===st?"on":"")+'">'+s[1]+'</button>'; }).join("")+'</div><div style="margin-top:6px"><button class="link" data-stage="verloren">'+(st==="verloren"?"✓ als verloren markiert":"Als verloren markieren")+'</button></div></div>'+
    '<div class="row wrap"><button class="btn primary" data-act="replylead:'+esc(l.id)+'"'+(l.email?'':' disabled')+'>Mail schreiben</button><button class="btn" data-act="leadoffer:'+esc(l.id)+'">Angebot erstellen</button><button class="btn" data-act="leadinvoice:'+esc(l.id)+'">Rechnung erstellen</button><button class="btn" data-act="tkprojfromlead:'+esc(l.id)+'">Auftrag anlegen</button>'+(l.phone?'<a class="btn" href="tel:'+esc(l.phone.replace(/\s+/g,""))+'">Anrufen</a>':'')+'<button class="btn" data-act="leadtodo:'+esc(l.id)+'">Als Aufgabe</button></div>'+
    (F.tkLeadHtml?F.tkLeadHtml(l):'')+(F.kiLeadHtml?F.kiLeadHtml(l):'')+'<form data-form="leadedit" class="stackf"><div class="grid2"><label class="fl">Name<input class="f" name="name" value="'+esc(l.name||"")+'"></label><label class="fl">Firma / Verein<input class="f" name="company" value="'+esc(l.company||"")+'"></label><label class="fl">E-Mail<input class="f" name="email" type="email" value="'+esc(l.email||"")+'"></label><label class="fl">Telefon<input class="f" name="phone" value="'+esc(l.phone||"")+'"></label><label class="fl">Thema<input class="f" name="topic" value="'+esc(l.topic||"")+'"></label><label class="fl">Projektwert (€)<input class="f num" name="value" type="number" min="0" step="50" value="'+(l.value||"")+'"></label></div>'+
    '<label class="fl">Notizen<textarea class="f" name="notes" rows="4" placeholder="Was wurde besprochen, was ist der nächste Schritt?">'+esc(l.notes||"")+'</textarea></label><div><button class="btn primary" type="submit">Speichern</button></div></form>'+
    '<dl class="kv"><dt>Gekommen über</dt><dd>'+esc(l.source||"—")+'</dd><dt>Gratis-Entwurf</dt><dd>'+(l.entwurf?"Ja, gewünscht":"Nein")+'</dd></dl>'+
    (l.message?'<div><div class="sec-t">Nachricht aus dem Formular</div><div class="mbody quote">'+esc(l.message)+'</div></div>':'')+
    '<div><div class="sec-t">Mails</div>'+(mails.length?mails.map(function(m){ return '<button class="link" style="display:block;text-align:left" data-act="leadmail:'+esc(m.id)+'">'+deShort(String(m.date).slice(0,10))+' · '+esc(m.subject||"(kein Betreff)")+'</button>'; }).join(""):'<span class="muted">'+(leadMailBusy(l)?'Durchsucht das Postfach …':'Keine Mails mit '+esc(l.email||"dieser Adresse")+' im Postfach.')+'</span>')+'</div>'+
    '<div><div class="sec-t">Angebote</div>'+(offs.length?'<div class="invs">'+offs.slice(0,8).map(F.offerLine).join("")+'</div>':'<span class="muted">'+(OFF.list==null?(OFF.err?"Angebote nicht geladen.":"Lade …"):"Noch keine.")+'</span>')+'</div>'+
    '<div><div class="sec-t">Rechnungen</div>'+(invs.length?'<div class="invs">'+invs.map(F.invLine).join("")+'</div>':'<span class="muted">Noch keine.</span>')+'</div>'+
    ((l.history||[]).length?'<div><div class="sec-t">Verlauf</div><div class="muted">'+l.history.slice().reverse().map(function(h){ return de(h.at)+" → "+((STAGES.find(function(s){return s[0]===h.stage;})||[0,h.stage])[1]); }).join("<br>")+'</div></div>':''),
    function(){ if(F.UI.leadSel) openLead(F.UI.leadSel); });
}
F.openLead=openLead;
F.action("lead",openLead);
F.listen("click","[data-stage]",function(el){ var sid=F.UI.leadSel, stage=el.getAttribute("data-stage"); if(!sid) return; leadPost({op:"update",id:sid,patch:{stage:stage}}).then(function(j){ if(j){ var nm="Phase: "+((STAGES.find(function(s){return s[0]===stage;})||[0,"verloren"])[1]); if(stage==="auftrag"&&F.actions.tkprojfromlead&&!(F.tkLeadProjects&&F.tkLeadProjects(sid).length)) F.toast(nm,false,"Auftrag anlegen",function(){ F.actions.tkprojfromlead(sid); }); else F.toast(nm); F.render(); openLead(sid); } }); });
F.form("leadedit",function(f){ var sid=F.UI.leadSel; leadPost({op:"update",id:sid,patch:{name:f.name.value,company:f.company.value,email:f.email.value,phone:f.phone.value,topic:f.topic.value,value:f.value.value,notes:f.notes.value}}).then(function(j){ if(j){ F.toast("Gespeichert"); F.render(); openLead(sid); } }); });
F.action("leadinvoice",function(id){ var l=F.D.leads.find(function(y){return y.id===id;}); if(l) F.openInvoice({title:"Rechnung · "+(l.company||l.name),contactName:l.company||l.name,email:l.email}); });
F.action("leadtodo",function(id){ var l=F.D.leads.find(function(y){return y.id===id;}); if(l) F.addTodo({text:"Lead: "+(l.company||l.name)+" – nächster Schritt",due:F.D.today,leadId:l.id}).then(function(j){ if(j&&j.ok) F.toast("Aufgabe angelegt",false,"Ansehen",function(){ F.go("auftraege"); }); }); });
F.action("replylead",function(id){ var l=F.D.leads.find(function(y){return y.id===id;}); if(l) F.compose({title:"Antwort an "+l.name,to:l.email,subject:"Deine Anfrage bei FS Creative"+(l.topic?" – "+l.topic:""),text:"Hallo "+String(l.name||"").split(" ")[0]+",\n\nvielen Dank für deine Anfrage!\n\n\nLiebe Grüße\nSimon\n\nFS Creative · Dorfstraße 3/1 · 6793 Gaschurn · +43 664 1430620"+(l.message?"\n\n> "+l.message.split("\n").join("\n> "):"")}); });
F.action("newlead",function(){
  F.modal('<form data-form="newlead" class="stackf"><h2 style="font-size:20px">Neuer Lead</h2><div class="grid2"><label class="fl">Name<input class="f" name="name" required autofocus></label><label class="fl">Firma / Verein<input class="f" name="company"></label><label class="fl">E-Mail<input class="f" name="email" type="email"></label><label class="fl">Telefon<input class="f" name="phone" type="tel"></label></div><label class="fl">Thema<input class="f" name="topic" value="Website"></label><label class="fl">Notiz<textarea class="f" name="message" rows="3"></textarea></label><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Anlegen</button></span></div></form>',"narrow");
});
F.form("newlead",function(f){ leadPost({op:"create",name:f.name.value,company:f.company.value,email:f.email.value,phone:f.phone.value,topic:f.topic.value,message:f.message.value}).then(function(j){ if(j){ F.closeModal(); F.toast("Lead angelegt"); F.go("kunden"); } }); });
F.searcher(function(q){ return F.D.leads.filter(function(l){ return (l.name+" "+(l.company||"")+" "+(l.email||"")+" "+(l.topic||"")).toLowerCase().indexOf(q)>-1; }).slice(0,6).map(function(l){ return {group:"Kunden & Leads",label:l.company||l.name,sub:(l.topic||"")+" · "+((STAGES.find(function(s){return s[0]===(l.stage||"anfrage");})||[0,"verloren"])[1]),act:"lead:"+l.id}; }); });

/* ---------- Handy (≤ 900 px): Phasen-Chips + Lead-Karten, Kundenakte als Vollbild-Blatt ---------- */
function mob(){ return window.innerWidth<=900; }
function mxIc(k){ return F.mxIc?F.mxIc(k):""; }
var MSTAGES=STAGES.concat([["verloren","Verloren"]]);
var NEXT={anfrage:"Anfrage beantworten",entwurf:"Gratis-Entwurf erstellen",angebot:"Angebot schicken / nachfassen",auftrag:"Projekt umsetzen, Rechnung stellen",live:"Betreuung & Wartung",verloren:"—"};
function stageName(k){ return (MSTAGES.find(function(s){ return s[0]===k; })||[0,k])[1]; }
/* nächster Schritt: letzte Zeile der Notizen, sonst offenes Angebot, sonst Hinweis je Phase */
function nextStep(l){
  var n=String(l.notes||"").split("\n").map(function(x){ return x.trim(); }).filter(Boolean), st=l.stage||"anfrage";
  if(n.length) return n[n.length-1];
  var lo=leadOffers(l).filter(offOpen)[0]; if(lo) return (lo.nr||"Angebot")+" "+(lo.overdue?"abgelaufen – nachfassen":"offen – nachfassen");
  if(st==="anfrage"&&l.entwurf) return "Möchte einen Gratis-Entwurf";
  return NEXT[st]||"";
}
function leadCard(l,showStage){
  var st=l.stage||"anfrage", sub=[l.company&&l.name!==l.company?l.name:"",l.topic||""].filter(Boolean).join(" · "), ns=nextStep(l);
  return '<button type="button" class="mx-lead st-'+esc(st)+'" data-act="lead:'+esc(l.id)+'"><span class="mx-lt"><b>'+esc(l.company||l.name||"—")+'</b>'+(val(l)?'<span class="num money">'+eur0(l.value)+'</span>':'')+'</span>'+
    '<span class="mx-ls">'+(showStage?'<em class="mx-st">'+esc(stageName(st))+'</em>':'')+'<span>'+esc(sub||"—")+'</span></span>'+
    '<span class="mx-ln"><span>'+(ns&&ns!=="—"?'<i>Nächster Schritt:</i> '+esc(ns):'')+'</span><small>'+esc(F.ago(l.updated||l.created))+'</small></span>'+mxIc("chev")+'</button>';
}
function mOffers(){
  var f=F.UI.offF||"open", all=OFF.list||[];
  var flt={open:offOpen,acc:function(o){ return o.status>=500; },rej:function(o){ return o.status===300; },all:function(){ return true; }};
  var list=all.filter(flt[f]||flt.open), openL=all.filter(offOpen);
  var chip=function(k,lb){ return '<button type="button" class="mx-seg" data-act="offf:'+k+'" aria-pressed="'+(f===k)+'">'+lb+' <b>'+all.filter(flt[k]).length+'</b></button>'; };
  var row=function(o){ var l=offerLead(o), canInv=o.status===200||o.status===500||o.status===750, btn=function(act,lb,cls){ return '<button type="button" class="btn'+(cls?" "+cls:"")+'" data-act="'+act+'">'+lb+'</button>'; };
    var desc=o.header&&!/^angebot( |$)/i.test(o.header)?o.header:(o.lines||[]).map(function(x){return x.name;}).slice(0,3).join(", ");
    return '<div class="mx-off"><div class="mx-ot"><span class="mx-l"><b>'+esc(o.contact||"—")+'</b><span>'+esc((o.nr||"Entwurf")+" · "+deShort(o.date)+(o.validUntil?" · gültig bis "+(o.validEst?"~":"")+de(o.validUntil):"")+(desc?" · "+desc:""))+'</span></span><span class="mx-or"><b class="num money">'+eur(o.gross)+'</b>'+offTag(o)+'</span></div>'+
      '<div class="mx-oa">'+(canInv?btn("offinv:"+esc(o.id),"In Rechnung","primary"):'')+btn("offpdf:"+esc(o.id),"PDF")+(o.status<750?btn("offstat:"+esc(o.id),"Status"):'')+(canInv?btn("offar:"+esc(o.id),"Abschlag"):'')+(o.status===750?btn("offer:"+esc(o.id),"Schlussrechnung"):'')+(l?btn("lead:"+esc(l.id),"Kundenakte"):'')+'</div></div>'; };
  var body=OFF.list==null?'<p class="mx-empty">'+(OFF.err?'Angebote konnten nicht geladen werden: '+esc(OFF.err)+' <button type="button" class="btn" data-act="offreload">Erneut versuchen</button>':'Lade Angebote …')+'</p>':
    (list.map(row).join("")||'<p class="mx-empty">Keine Angebote in dieser Ansicht.</p>');
  return '<section class="mx-card flush" id="offers"><div class="mx-h"><h3>Angebote</h3><span class="mx-sum num money">'+(openL.length?openL.length+' offen · '+eur0(openL.reduce(function(s,o){return s+o.gross;},0)):'')+'</span></div>'+
    '<div class="mx-segs">'+chip("open","Offen")+chip("acc","Angenommen")+chip("rej","Abgelehnt")+chip("all","Alle")+'</div>'+body+
    '<button type="button" class="mx-more" data-act="newoffer">+ Neues Angebot</button></section>';
}
function mobileKunden(){
  var D=F.D, f=F.UI.leadF||"aktiv";
  var inF=function(k){ return function(l){ var st=l.stage||"anfrage"; return k==="aktiv"?st!=="verloren":st===k; }; };
  var segs=[["aktiv","Alle aktiven"]].concat(MSTAGES).map(function(s){ var ls=D.leads.filter(inF(s[0])); return '<button type="button" class="mx-seg" data-act="leadf:'+s[0]+'" aria-pressed="'+(f===s[0])+'">'+esc(s[1])+' <b>'+ls.length+'</b></button>'; }).join("");
  var list=D.leads.filter(inF(f)).slice().sort(function(a,b){ return String(b.updated||b.created||"").localeCompare(String(a.updated||a.created||"")); });
  var sum=list.reduce(function(a,l){ return a+val(l); },0);
  var bySrc={}; D.leads.forEach(function(l){ var k=l.source||"unbekannt"; bySrc[k]=(bySrc[k]||0)+1; });
  var rows=Object.keys(bySrc).sort(function(a,b){return bySrc[b]-bySrc[a];}).slice(0,8), mx=rows.length?bySrc[rows[0]]:1;
  return F.head("Kunden & Leads",D.leads.length+" Leads",'<button class="btn" data-act="newoffer">Neues Angebot</button><button class="btn primary" data-act="newlead">Neuer Lead</button>')+
    '<div class="mx">'+
    '<div class="mx-segs mx-sticky" role="toolbar" aria-label="Phase">'+segs+'</div>'+
    (D.leads.length?'<section class="mx-card flush"><div class="mx-h"><h3>'+esc(f==="aktiv"?"Aktive Leads":stageName(f))+'</h3><span class="mx-sum num money">'+list.length+(sum?' · '+eur0(sum):'')+'</span></div>'+
      (list.map(function(l){ return leadCard(l,f==="aktiv"); }).join("")||'<p class="mx-empty">Keine Leads in „'+esc(stageName(f))+'“.</p>')+'</section>'
      :'<section class="mx-card"><p class="mx-empty">Noch keine Anfragen. Sobald jemand das Formular auf fs-creative.at/kontakt ausfüllt, erscheint er hier.</p></section>')+
    (D.sevConfigured===false?'':mOffers())+
    (rows.length?'<section class="mx-card"><div class="mx-h"><h3>Woher kommen die Anfragen?</h3></div><div class="bars">'+rows.map(function(k){ return '<div><div class="row-between small"><span>'+esc(k)+'</span><span class="num">'+bySrc[k]+'</span></div><div class="bar"><i style="width:'+(bySrc[k]/mx*100)+'%"></i></div></div>'; }).join("")+'</div></section>':'')+
    '</div>';
}
F.action("leadf",function(k){ F.UI.leadF=k; F._forceRender=true; F.render(); window.scrollTo(0,0); });
/* Kundenakte am Handy: Kopf mit Zurück, große Aktionen, Abschnitte untereinander */
function leadSheet(l,st,mails,invs,offs){
  var tel=l.phone?String(l.phone).replace(/[^\d+]/g,""):"";
  return '<div class="lm">'+
    '<div class="lm-h"><button type="button" class="lm-back" data-close aria-label="Zurück">'+mxIc("back")+'</button><div class="lm-ht"><b>'+esc(l.company||l.name)+'</b><span>'+esc([l.company&&l.name!==l.company?l.name:"",l.topic||"","seit "+de(l.created)].filter(Boolean).join(" · "))+'</span></div></div>'+
    '<div class="lm-acts">'+
      (tel?'<a class="lm-a" href="tel:'+esc(tel)+'">'+mxIc("phone")+'<span>Anrufen</span></a>':'<button type="button" class="lm-a" disabled>'+mxIc("phone")+'<span>Anrufen</span></button>')+
      '<button type="button" class="lm-a pri" data-act="replylead:'+esc(l.id)+'"'+(l.email?'':' disabled')+'>'+mxIc("mail")+'<span>Mail</span></button>'+
      '<button type="button" class="lm-a" data-act="leadoffer:'+esc(l.id)+'">'+mxIc("offer")+'<span>Angebot</span></button>'+
      '<button type="button" class="lm-a" data-act="leadinvoice:'+esc(l.id)+'">'+mxIc("inv")+'<span>Rechnung</span></button></div>'+(F.tkLeadHtml?F.tkLeadHtml(l):'')+
    '<section class="mx-card"><div class="mx-h"><h3>Phase</h3><button type="button" class="mx-link" data-act="leadtodo:'+esc(l.id)+'">Als Aufgabe</button></div><div class="lm-stages">'+STAGES.map(function(s){ return '<button type="button" data-stage="'+s[0]+'" class="'+(s[0]===st?"on":"")+'">'+s[1]+'</button>'; }).join("")+'</div>'+
      '<button type="button" class="lm-lost" data-stage="verloren">'+(st==="verloren"?"✓ als verloren markiert":"Als verloren markieren")+'</button></section>'+
    '<section class="mx-card flush"><div class="mx-h"><h3>Kontakt</h3></div>'+
      (l.email?'<a class="mx-row" href="mailto:'+esc(l.email)+'"><span class="mx-l"><span>E-Mail</span><b>'+esc(l.email)+'</b></span><span class="mx-r">'+mxIc("chev")+'</span></a>':'')+
      (tel?'<a class="mx-row" href="tel:'+esc(tel)+'"><span class="mx-l"><span>Telefon</span><b>'+esc(l.phone)+'</b></span><span class="mx-r">'+mxIc("chev")+'</span></a>':'')+
      '<div class="mx-row lm-kv"><span class="mx-l"><span>Gekommen über</span><b>'+esc(l.source||"—")+'</b></span><span class="mx-r"><small>Gratis-Entwurf: '+(l.entwurf?"ja":"nein")+'</small></span></div></section>'+
    (F.kiLeadHtml?'<div class="lm-ki">'+F.kiLeadHtml(l)+'</div>':'')+
    (l.message?'<section class="mx-card"><div class="mx-h"><h3>Nachricht aus dem Formular</h3></div><div class="mbody quote">'+esc(l.message)+'</div></section>':'')+
    '<section class="mx-card flush"><div class="mx-h"><h3>Mails</h3><span class="mx-sum">'+(leadMailBusy(l)?'sucht …':(mails.length||""))+'</span></div>'+(mails.length?mails.map(function(m){ return '<button type="button" class="mx-row" data-act="leadmail:'+esc(m.id)+'"><span class="mx-l"><b>'+esc(m.subject||"(kein Betreff)")+'</b><span>'+deShort(String(m.date).slice(0,10))+'</span></span><span class="mx-r">'+mxIc("chev")+'</span></button>'; }).join(""):'<p class="mx-empty">'+(leadMailBusy(l)?'Durchsucht das Postfach …':'Noch keine.')+'</p>')+'</section>'+
    '<section class="mx-card flush"><div class="mx-h"><h3>Angebote</h3></div>'+(offs.length?offs.slice(0,8).map(function(o){ return '<a class="mx-row" href="/admin/api/sevdesk/offer-pdf?id='+encodeURIComponent(o.id)+'" target="_blank" rel="noopener" data-docview data-doctitle="Angebot '+esc(o.nr||"")+'"><span class="mx-l"><b>'+esc(o.nr||"Angebot")+'</b><span>'+de(o.date)+'</span></span><span class="mx-r lm-amt"><b class="num money">'+eur(o.gross)+'</b>'+offTag(o)+'</span></a>'; }).join(""):'<p class="mx-empty">'+(OFF.list==null?(OFF.err?"Angebote nicht geladen.":"Lade …"):"Noch keine.")+'</p>')+'</section>'+
    '<section class="mx-card flush"><div class="mx-h"><h3>Rechnungen</h3></div>'+(invs.length?invs.map(function(i){ var cls=i.overdue?"bad":i.status===1000?"ok":i.status===100?"grey":"warn", lbl=i.overdue?"überfällig":i.status===1000?"bezahlt":i.status===100?"Entwurf":i.status===750?"teilbezahlt":"offen";
      return '<a class="mx-row" href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'" target="_blank" rel="noopener" data-docview data-doctitle="Rechnung '+esc(i.nr||"Entwurf")+'"><span class="mx-l"><b>'+esc(i.nr||"Entwurf")+'</b><span>'+de(i.date)+'</span></span><span class="mx-r lm-amt"><b class="num money">'+eur(i.gross)+'</b><span class="tag '+cls+'">'+lbl+'</span></span></a>'; }).join(""):'<p class="mx-empty">Noch keine.</p>')+'</section>'+
    '<section class="mx-card"><div class="mx-h"><h3>Daten &amp; Notizen</h3></div><form data-form="leadedit" class="stackf lm-form"><label class="fl">Name<input class="f" name="name" value="'+esc(l.name||"")+'"></label><label class="fl">Firma / Verein<input class="f" name="company" value="'+esc(l.company||"")+'"></label><label class="fl">E-Mail<input class="f" name="email" type="email" value="'+esc(l.email||"")+'"></label><label class="fl">Telefon<input class="f" name="phone" type="tel" value="'+esc(l.phone||"")+'"></label><label class="fl">Thema<input class="f" name="topic" value="'+esc(l.topic||"")+'"></label><label class="fl">Projektwert (€)<input class="f num" name="value" type="number" inputmode="decimal" min="0" step="50" value="'+(l.value||"")+'"></label>'+
      '<label class="fl">Notizen<textarea class="f" name="notes" rows="4" placeholder="Was wurde besprochen, was ist der nächste Schritt?">'+esc(l.notes||"")+'</textarea></label><button class="btn primary lm-save" type="submit">Speichern</button></form></section>'+
    ((l.history||[]).length?'<section class="mx-card"><div class="mx-h"><h3>Verlauf</h3></div><ol class="lm-hist">'+l.history.slice().reverse().map(function(h){ return '<li><span>'+de(h.at)+'</span><b>'+esc(stageName(h.stage))+'</b></li>'; }).join("")+'</ol></section>':'')+
  '</div>';
}
F.css(
"@media (max-width:900px){"+
  ".mx-segs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 calc(-1*clamp(16px,4vw,44px));padding:2px clamp(16px,4vw,44px) 4px}.mx-segs::-webkit-scrollbar{display:none}"+
  ".mx-card .mx-segs{margin:0;padding:4px 16px 12px}"+
  ".mx-seg{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:40px;border:1px solid var(--line);background:var(--panel);border-radius:99px;padding:0 14px;font-size:14px;font-weight:600;color:var(--ink-2)}"+
  ".mx-seg b{font:600 12.5px var(--f-mono);color:var(--ink-3)}"+
  ".mx-seg[aria-pressed=\"true\"]{background:var(--ink);border-color:var(--ink);color:var(--ground)}.mx-seg[aria-pressed=\"true\"] b{color:inherit;opacity:.75}"+
  GL+".mx-seg[aria-pressed=\"true\"]{background:var(--glow-soft);border-color:color-mix(in srgb,var(--glow) 45%,transparent);color:var(--glow-ink)}"+
  ".mx-sticky{position:sticky;top:calc(64px + env(safe-area-inset-top,0px));z-index:6;background:var(--ground);padding-top:6px;padding-bottom:8px}"+
  /* Alpenglas: Phasen-Leiste als Milchglas (eine Leiste je Ansicht, enthält nur Chips) */
  GL+".mx-sticky{background:var(--glass-bar,var(--glass-strong));backdrop-filter:var(--bar-blur,var(--glass-blur));-webkit-backdrop-filter:var(--bar-blur,var(--glass-blur));border-bottom:1px solid var(--glass-line,var(--line))}"+
  ".mx-sum{font-size:13px;color:var(--ink-3);white-space:nowrap}"+
  ".mx-lead{position:relative;display:grid;gap:3px;width:100%;text-align:left;border:0;border-top:1px solid var(--line);background:none;padding:12px 40px 12px 16px;min-height:76px;color:var(--ink);font:inherit;cursor:pointer}"+
  ".mx-lead:active{background:var(--hover,var(--sunk))}.mx-lead>svg{position:absolute;right:12px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:var(--ink-3)}"+
  ".mx-lead.st-anfrage{box-shadow:inset 3px 0 0 var(--glow)}"+
  ".mx-lt{display:flex;justify-content:space-between;gap:12px;align-items:baseline;min-width:0}.mx-lt b{min-width:0;font-size:16px;font-weight:600;line-height:1.3;overflow-wrap:anywhere;hyphens:auto;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.mx-lt .num{font-weight:600;font-size:15px;white-space:nowrap;flex:none}"+
  ".mx-ls{display:flex;gap:8px;align-items:center;min-width:0;font-size:13px;color:var(--ink-2)}.mx-ls>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".mx-st{flex:none;font-style:normal;font-size:12px;font-weight:600;padding:1px 8px;border-radius:99px;background:var(--sunk);color:var(--ink-2)}.st-anfrage .mx-st{background:var(--glow-soft);color:var(--glow-ink)}.st-auftrag .mx-st,.st-live .mx-st{background:var(--ok-soft);color:var(--ok)}"+
  ".mx-ln{display:flex;justify-content:space-between;gap:10px;align-items:flex-end;min-width:0;font-size:13px;color:var(--ink-3)}.mx-ln>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-width:0;line-height:1.35}.mx-ln i{font-style:normal;color:var(--ink-2);font-weight:600}.mx-ln small{flex:none;font-size:12px}"+
  /* Angebote */
  ".mx-off{border-top:1px solid var(--line);padding:12px 16px}"+
  ".mx-ot{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.mx-ot .mx-l>span{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}"+
  ".mx-or{display:grid;justify-items:end;gap:4px;flex:none}.mx-or b{font-weight:600;font-size:15px;white-space:nowrap}"+
  ".mx-oa{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}.mx-oa::-webkit-scrollbar{display:none}.mx-oa .btn{flex:none;min-height:40px;padding:0 14px;font-size:14px}"+
  /* Kundenakte als Vollbild-Blatt */
  ".drawer:has(.lm){background:var(--ground);padding:0 0 calc(28px + env(safe-area-inset-bottom,0px));gap:0}"+GL+".drawer:has(.lm){background:var(--glass-strong,var(--ground))}"+
  ".lm{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:0 12px;min-width:0}.lm>*{min-width:0}"+
  ".lm-h{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:8px;margin:0 -12px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:color-mix(in srgb,var(--ground) 90%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}"+
  GL+".lm-h{background:var(--panel-solid,var(--ground));backdrop-filter:none;-webkit-backdrop-filter:none}"+   /* im Blatt (Drawer hat schon Blur): deckend statt eigenem Blur */
  ".lm-back{width:44px;height:44px;flex:none;border-radius:50%;border:0;background:var(--sunk);display:grid;place-items:center;color:var(--ink)}.lm-back svg{width:22px;height:22px}"+
  ".lm-ht{display:grid;min-width:0}.lm-ht b{font-size:19px;font-weight:700;letter-spacing:-.01em;line-height:1.25;overflow-wrap:anywhere;hyphens:auto;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-family:var(--f-display)}.lm-ht span{font-size:13px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".lm-acts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}"+
  ".lm-a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:70px;border-radius:14px;border:1px solid color-mix(in srgb,var(--line) 75%,transparent);background:var(--panel);color:var(--ink);font-size:13px;font-weight:600;text-decoration:none;font-family:inherit;padding:6px 2px}"+
  ".lm-a svg{width:22px;height:22px}.lm-a.pri{background:var(--glow);border-color:var(--glow);color:var(--on-glow)}"+GL+".lm-a:not(.pri){background:var(--sunk)}"+".lm-a[disabled]{opacity:.4}.lm-a:active{transform:scale(.97)}"+
  ".lm-stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}"+
  ".lm-stages button{min-height:44px;border-radius:10px;border:1px solid var(--line);background:var(--sunk);font-size:12.5px;font-weight:600;color:var(--ink-2);padding:0 2px;overflow:hidden;text-overflow:ellipsis}"+
  ".lm-stages button.on{background:var(--glow);border-color:var(--glow);color:var(--on-glow)}"+
  ".lm-lost{border:0;background:none;color:var(--ink-3);font-size:14px;font-weight:600;padding:12px 0 0;min-height:40px}"+
  ".lm a.mx-row{text-decoration:none}.lm-kv{cursor:default}.lm-amt{display:grid;justify-items:end;gap:3px}.lm-amt b{font-weight:600;font-size:15px;color:var(--ink)}"+
  ".lm .mbody.quote{font-size:14px;max-height:220px;overflow:auto}"+
  ".lm .mx-card.flush:has(>.mx-empty){display:flex;align-items:center;justify-content:space-between;gap:12px}.lm .mx-card.flush:has(>.mx-empty)>.mx-h{border:0;flex:none}.lm .mx-card.flush>.mx-empty{padding:0 16px 0 0;margin:0;text-align:right;font-size:13px;min-width:0}"+
  ".lm-ki .kibox{border-radius:14px;overflow-wrap:anywhere}.lm-ki .kitags{display:flex;flex-wrap:wrap;gap:6px}.lm-ki .tag{white-space:normal;max-width:100%;height:auto;line-height:1.35;padding-top:3px;padding-bottom:3px}"+
  ".lm-form input.f,.lm-form textarea.f{font-size:16px;min-height:46px;border-radius:12px}.lm-form label.fl{font-size:13px}"+
  ".lm-save{justify-content:center;min-height:50px;font-size:16px;border-radius:12px}"+
  ".mx .tag,.lm .tag{font-size:12px}"+
  ".lm-hist{list-style:none;margin:0;padding:0}.lm-hist li{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:14px}.lm-hist li:first-child{border-top:0}.lm-hist span{color:var(--ink-3);font-size:13px}.lm-hist b{font-weight:500}"+
"}");
/* Pipeline am PC: Karten luftiger, Namen dürfen zweizeilig umbrechen; Alpenglas: Spalte als Glas, Karten als verschachtelte Box */
F.css(
'.view-kunden .pipe .col-h{gap:8px;align-items:baseline}.view-kunden .pipe .col-h>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.view-kunden .pipe .col-h .num{white-space:nowrap}'+
'.view-kunden .pipe .card{gap:5px;padding:12px 13px;transition:border-color .12s,background-color .12s}.view-kunden .pipe .card:hover{border-color:var(--line-2)}'+
'.view-kunden .pipe .card .n{font-size:14.5px;line-height:1.3;hyphens:auto;text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'+
'.view-kunden .pipe .card .m{align-items:baseline;min-width:0}.view-kunden .pipe .card .m>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.view-kunden .pipe .card .m .num{flex:none;font-weight:600;color:var(--ink)}'+
'.view-kunden .pipe .card .x{line-height:1.35;overflow-wrap:anywhere}'+
GL+'.view-kunden .pipe .col{background:color-mix(in srgb,var(--ground) 45%,var(--panel));border:1px solid var(--line)}'+
GL+'.view-kunden .pipe .card{background:var(--sunk);box-shadow:none}'+GL+'.view-kunden .pipe .card:hover{background:var(--hover,var(--sunk))}'+
'@media (prefers-reduced-motion:reduce){.lm-a:active{transform:none}}'
);
F.view({id:"kunden",label:"Kunden & Leads",short:"Kunden",icon:"kunden",order:20,mobile:true,
  count:function(){ return F.newLeads().length; },
  after:function(){ if(F.D.sevConfigured!==false&&!OFF.busy&&(!OFF.at||Date.now()-OFF.at>120000)) F.offersLoad(false); },
  render:function(){
    if(mob()) return mobileKunden();
    var D=F.D;
    var cols=STAGES.map(function(s){
      var ls=D.leads.filter(function(l){ return (l.stage||"anfrage")===s[0]; });
      var oo=s[0]==="angebot"&&OFF.list?OFF.list.filter(offOpen):[];
      return '<div class="col"><div class="col-h"><span>'+s[1]+'</span><span class="num">'+ls.length+(ls.some(val)?' · '+eur0(ls.reduce(function(a,l){return a+val(l);},0)):'')+'</span></div>'+
        (oo.length?'<button class="link small" data-act="offf:open" style="padding:0 6px 4px;text-align:left">'+oo.length+' offene Angebote · '+eur0(oo.reduce(function(a,o){return a+o.gross;},0))+'</button>':'')+
        (ls.map(function(l){ return '<button class="card" data-act="lead:'+esc(l.id)+'" title="'+esc((l.company||l.name||"")+(l.topic?" · "+l.topic:""))+'"><span class="n">'+esc(l.company||l.name)+'</span><span class="m"><span>'+esc(l.topic||"")+'</span>'+(val(l)?'<span class="num">'+eur0(l.value)+'</span>':'')+'</span><span class="x">'+esc((l.company?l.name+" · ":"")+F.ago(l.updated||l.created))+(l.entwurf&&s[0]==="anfrage"?" · Gratis-Entwurf":"")+'</span>'+(function(){ var lo=leadOffers(l).filter(offOpen)[0]; return lo?'<span class="x">'+esc(lo.nr||"Angebot")+' · '+eur0(lo.gross)+(lo.overdue?' · abgelaufen':'')+'</span>':''; })()+'</button>'; }).join("")||'<span class="muted" style="padding:6px">Keine</span>')+'</div>';
    }).join("");
    var lost=D.leads.filter(function(l){return l.stage==="verloren";});
    var bySrc={}; D.leads.forEach(function(l){ var k=l.source||"unbekannt"; bySrc[k]=(bySrc[k]||0)+1; });
    var rows=Object.keys(bySrc).sort(function(a,b){return bySrc[b]-bySrc[a];}).slice(0,8), mx=rows.length?bySrc[rows[0]]:1;
    return F.head("Kunden & Leads","Anfragen über das Website-Formular landen automatisch in „Anfrage“. Ein Klick öffnet die Kundenakte.",'<button class="btn" data-act="newoffer">Neues Angebot</button><button class="btn primary" data-act="newlead">Neuer Lead</button>')+
      (D.leads.length?'<div class="pipe">'+cols+'</div>':'<section class="panel"><div class="empty">Noch keine Anfragen. Sobald jemand das Formular auf fs-creative.at/kontakt ausfüllt, erscheint er hier.</div></section>')+
      (D.sevConfigured===false?'':offersPanel())+
      (lost.length?'<p class="muted">Verloren: '+lost.map(function(l){ return '<button class="link" data-act="lead:'+esc(l.id)+'">'+esc(l.company||l.name)+'</button>'; }).join(", ")+'</p>':'')+
      (rows.length?'<section class="panel"><div class="panel-h"><h2>Woher kommen die Anfragen?</h2><span class="muted">Seite, auf der das Formular abgeschickt wurde</span></div><div class="panel-b bars">'+rows.map(function(k){ return '<div><div class="row-between small"><span>'+esc(k)+'</span><span class="num">'+bySrc[k]+'</span></div><div class="bar"><i style="width:'+(bySrc[k]/mx*100)+'%"></i></div></div>'; }).join("")+'</div></section>':'');
  }
});
})();
