/* Ansicht "Kunden & Leads": Pipeline + Kundenakte. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;
var STAGES=F.STAGES=[["anfrage","Anfrage"],["entwurf","Entwurf"],["angebot","Angebot"],["auftrag","Auftrag"],["live","Live"]];
function val(l){ return +l.value||0; }

F.invLine=function(i){ var cls=i.overdue?"bad":i.status===1000?"ok":i.status===100?"grey":"warn", lbl=i.overdue?"überfällig":i.status===1000?"bezahlt":i.status===100?"Entwurf":i.status===750?"teilbezahlt":"offen"; return '<span><a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'" target="_blank" rel="noopener">'+esc(i.nr||"Entwurf")+'</a> · '+de(i.date)+' · '+eur(i.gross)+' <span class="tag '+cls+'">'+lbl+'</span></span>'; };
function leadMails(l){ var e=String(l.email||"").toLowerCase(); if(!e) return []; return F.D.mail.messages.filter(function(m){ return String(m.from||"").toLowerCase()===e||String(m.to||"").toLowerCase().indexOf(e)>-1; }).slice(0,8); }
function leadInvoices(l){ if(!F.D.sev) return []; var names=[l.company,l.name].filter(Boolean).map(function(x){return x.toLowerCase();}); return F.D.sev.invoices.filter(function(i){ var c=String(i.contact||"").toLowerCase(); return c&&names.some(function(n){ return c===n||c.indexOf(n)>-1||n.indexOf(c)>-1; }); }).slice(0,8); }
function leadPost(body){ return F.api("/admin/api/leads",{body:body}).then(function(j){ if(!j.ok){ F.toast("Speichern fehlgeschlagen: "+(j.error||""),true); return null; } F.D.leads=j.leads; return j; }); }

function openLead(id){
  var l=F.D.leads.find(function(x){return x.id===id;}); if(!l) return; F.UI.leadSel=id;
  var st=l.stage||"anfrage", mails=leadMails(l), invs=leadInvoices(l);
  F.openDrawer('<div class="row-between" style="align-items:flex-start"><div style="min-width:0"><div class="sec-t">Kundenakte</div><h2>'+esc(l.company||l.name)+'</h2><div class="muted">'+esc(l.topic||"")+' · seit '+de(l.created)+'</div></div><button class="btn icon" data-close aria-label="Schließen">'+F.svg("close")+'</button></div>'+
    '<div><div class="sec-t">Phase</div><div class="stages">'+STAGES.map(function(s){ return '<button data-stage="'+s[0]+'" class="'+(s[0]===st?"on":"")+'">'+s[1]+'</button>'; }).join("")+'</div><div style="margin-top:6px"><button class="link" data-stage="verloren">'+(st==="verloren"?"✓ als verloren markiert":"Als verloren markieren")+'</button></div></div>'+
    '<div class="row wrap"><button class="btn primary" data-act="replylead:'+esc(l.id)+'"'+(l.email?'':' disabled')+'>Mail schreiben</button><button class="btn" data-act="leadinvoice:'+esc(l.id)+'">Rechnung erstellen</button>'+(l.phone?'<a class="btn" href="tel:'+esc(l.phone.replace(/\s+/g,""))+'">Anrufen</a>':'')+'<button class="btn" data-act="leadtodo:'+esc(l.id)+'">Als To-Do</button></div>'+
    (F.kiLeadHtml?F.kiLeadHtml(l):'')+'<form data-form="leadedit" class="stackf"><div class="grid2"><label class="fl">Name<input class="f" name="name" value="'+esc(l.name||"")+'"></label><label class="fl">Firma / Verein<input class="f" name="company" value="'+esc(l.company||"")+'"></label><label class="fl">E-Mail<input class="f" name="email" type="email" value="'+esc(l.email||"")+'"></label><label class="fl">Telefon<input class="f" name="phone" value="'+esc(l.phone||"")+'"></label><label class="fl">Thema<input class="f" name="topic" value="'+esc(l.topic||"")+'"></label><label class="fl">Projektwert (€)<input class="f num" name="value" type="number" min="0" step="50" value="'+(l.value||"")+'"></label></div>'+
    '<label class="fl">Notizen<textarea class="f" name="notes" rows="4" placeholder="Was wurde besprochen, was ist der nächste Schritt?">'+esc(l.notes||"")+'</textarea></label><div><button class="btn primary" type="submit">Speichern</button></div></form>'+
    '<dl class="kv"><dt>Gekommen über</dt><dd>'+esc(l.source||"—")+'</dd><dt>Gratis-Entwurf</dt><dd>'+(l.entwurf?"Ja, gewünscht":"Nein")+'</dd></dl>'+
    (l.message?'<div><div class="sec-t">Nachricht aus dem Formular</div><div class="mbody quote">'+esc(l.message)+'</div></div>':'')+
    '<div><div class="sec-t">Mails</div>'+(mails.length?mails.map(function(m){ return '<button class="link" style="display:block;text-align:left" data-act="mail:'+esc(m.id)+'">'+deShort(String(m.date).slice(0,10))+' · '+esc(m.subject||"(kein Betreff)")+'</button>'; }).join(""):'<span class="muted">Keine Mails mit '+esc(l.email||"dieser Adresse")+' im Postfach.</span>')+'</div>'+
    '<div><div class="sec-t">Rechnungen in sevDesk</div>'+(invs.length?'<div class="invs">'+invs.map(F.invLine).join("")+'</div>':'<span class="muted">Noch keine.</span>')+'</div>'+
    ((l.history||[]).length?'<div><div class="sec-t">Verlauf</div><div class="muted">'+l.history.slice().reverse().map(function(h){ return de(h.at)+" → "+((STAGES.find(function(s){return s[0]===h.stage;})||[0,h.stage])[1]); }).join("<br>")+'</div></div>':''),
    function(){ if(F.UI.leadSel) openLead(F.UI.leadSel); });
}
F.openLead=openLead;
F.action("lead",openLead);
F.listen("click","[data-stage]",function(el){ var sid=F.UI.leadSel, stage=el.getAttribute("data-stage"); if(!sid) return; leadPost({op:"update",id:sid,patch:{stage:stage}}).then(function(j){ if(j){ F.toast("Phase: "+((STAGES.find(function(s){return s[0]===stage;})||[0,"verloren"])[1])); F.render(); openLead(sid); } }); });
F.form("leadedit",function(f){ var sid=F.UI.leadSel; leadPost({op:"update",id:sid,patch:{name:f.name.value,company:f.company.value,email:f.email.value,phone:f.phone.value,topic:f.topic.value,value:f.value.value,notes:f.notes.value}}).then(function(j){ if(j){ F.toast("Gespeichert"); F.render(); openLead(sid); } }); });
F.action("leadinvoice",function(id){ var l=F.D.leads.find(function(y){return y.id===id;}); if(l) F.openInvoice({title:"Rechnung · "+(l.company||l.name),contactName:l.company||l.name,email:l.email}); });
F.action("leadtodo",function(id){ var l=F.D.leads.find(function(y){return y.id===id;}); if(l) F.addTodo({text:"Lead: "+(l.company||l.name)+" – nächster Schritt",due:F.D.today}).then(function(){ F.toast("To-Do angelegt"); }); });
F.action("replylead",function(id){ var l=F.D.leads.find(function(y){return y.id===id;}); if(l) F.compose({title:"Antwort an "+l.name,to:l.email,subject:"Deine Anfrage bei FS Creative"+(l.topic?" – "+l.topic:""),text:"Hallo "+String(l.name||"").split(" ")[0]+",\n\nvielen Dank für deine Anfrage!\n\n\nLiebe Grüße\nSimon\n\nFS Creative · Dorfstraße 3/1 · 6793 Gaschurn · +43 664 1430620"+(l.message?"\n\n> "+l.message.split("\n").join("\n> "):"")}); });
F.action("newlead",function(){
  F.modal('<form data-form="newlead" class="stackf"><h2 style="font-size:20px">Neuer Lead</h2><div class="grid2"><label class="fl">Name<input class="f" name="name" required autofocus></label><label class="fl">Firma / Verein<input class="f" name="company"></label><label class="fl">E-Mail<input class="f" name="email" type="email"></label><label class="fl">Telefon<input class="f" name="phone" type="tel"></label></div><label class="fl">Thema<input class="f" name="topic" value="Website"></label><label class="fl">Notiz<textarea class="f" name="message" rows="3"></textarea></label><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Anlegen</button></span></div></form>',"narrow");
});
F.form("newlead",function(f){ leadPost({op:"create",name:f.name.value,company:f.company.value,email:f.email.value,phone:f.phone.value,topic:f.topic.value,message:f.message.value}).then(function(j){ if(j){ F.closeModal(); F.toast("Lead angelegt"); F.go("kunden"); } }); });
F.searcher(function(q){ return F.D.leads.filter(function(l){ return (l.name+" "+(l.company||"")+" "+(l.email||"")+" "+(l.topic||"")).toLowerCase().indexOf(q)>-1; }).slice(0,6).map(function(l){ return {group:"Kunden & Leads",label:l.company||l.name,sub:(l.topic||"")+" · "+((STAGES.find(function(s){return s[0]===(l.stage||"anfrage");})||[0,"verloren"])[1]),act:"lead:"+l.id}; }); });

F.view({id:"kunden",label:"Kunden & Leads",short:"Kunden",icon:"kunden",order:20,mobile:true,
  count:function(){ return F.newLeads().length; },
  render:function(){
    var D=F.D;
    var cols=STAGES.map(function(s){
      var ls=D.leads.filter(function(l){ return (l.stage||"anfrage")===s[0]; });
      return '<div class="col"><div class="col-h"><span>'+s[1]+'</span><span class="num">'+ls.length+(ls.some(val)?' · '+eur0(ls.reduce(function(a,l){return a+val(l);},0)):'')+'</span></div>'+
        (ls.map(function(l){ return '<button class="card" data-act="lead:'+esc(l.id)+'"><span class="n">'+esc(l.company||l.name)+'</span><span class="m"><span>'+esc(l.topic||"")+'</span>'+(val(l)?'<span class="num">'+eur0(l.value)+'</span>':'')+'</span><span class="x">'+esc((l.company?l.name+" · ":"")+F.ago(l.updated||l.created))+(l.entwurf&&s[0]==="anfrage"?" · Gratis-Entwurf":"")+'</span></button>'; }).join("")||'<span class="muted" style="padding:6px">Keine</span>')+'</div>';
    }).join("");
    var lost=D.leads.filter(function(l){return l.stage==="verloren";});
    var bySrc={}; D.leads.forEach(function(l){ var k=l.source||"unbekannt"; bySrc[k]=(bySrc[k]||0)+1; });
    var rows=Object.keys(bySrc).sort(function(a,b){return bySrc[b]-bySrc[a];}).slice(0,8), mx=rows.length?bySrc[rows[0]]:1;
    return F.head("Kunden & Leads","Anfragen über das Website-Formular landen automatisch in „Anfrage“. Ein Klick öffnet die Kundenakte.",'<button class="btn primary" data-act="newlead">Neuer Lead</button>')+
      (D.leads.length?'<div class="pipe">'+cols+'</div>':'<section class="panel"><div class="empty">Noch keine Anfragen. Sobald jemand das Formular auf fs-creative.at/kontakt ausfüllt, erscheint er hier.</div></section>')+
      (lost.length?'<p class="muted">Verloren: '+lost.map(function(l){ return '<button class="link" data-act="lead:'+esc(l.id)+'">'+esc(l.company||l.name)+'</button>'; }).join(", ")+'</p>':'')+
      (rows.length?'<section class="panel"><div class="panel-h"><h2>Woher kommen die Anfragen?</h2><span class="muted">Seite, auf der das Formular abgeschickt wurde</span></div><div class="panel-b bars">'+rows.map(function(k){ return '<div><div class="row-between small"><span>'+esc(k)+'</span><span class="num">'+bySrc[k]+'</span></div><div class="bar"><i style="width:'+(bySrc[k]/mx*100)+'%"></i></div></div>'; }).join("")+'</div></section>':'');
  }
});
})();
