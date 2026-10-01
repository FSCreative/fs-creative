/* Gemeinsame Dialoge: Rechnung (sevDesk), Zahlungseingang, einfache Mail. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur;

/* ---------- Rechnung erstellen (Entwurf in sevDesk) ---------- */
var META=null;
F.loadMeta=function(cb,force){ if(META&&!force) return cb(META); F.api("/admin/api/sevdesk/meta"+(force?"?force=1":"")).then(function(m){ META=m||{}; cb(META); }).catch(function(){ cb({}); }); };
function irow(it){ it=it||{}; var tax=it.taxRate!=null?+it.taxRate:20; return '<div class="irow"><input class="f" data-i="name" placeholder="Bezeichnung" value="'+esc(it.name||"")+'"><input class="f num" data-i="qty" type="number" min="0" step="0.5" value="'+esc(it.qty||1)+'" aria-label="Menge"><input class="f num" data-i="price" type="number" step="0.01" placeholder="brutto €" value="'+(it.priceGross!=null?esc(it.priceGross):"")+'" aria-label="Einzelpreis brutto"><select class="f" data-i="tax" aria-label="USt">'+[20,13,10,0].map(function(r){ return '<option value="'+r+'"'+(tax===r?" selected":"")+'>'+r+' %</option>'; }).join("")+'</select><button type="button" class="btn icon del" data-delrow aria-label="Position entfernen">✕</button><input class="f t2" data-i="text" placeholder="Beschreibung (optional)" value="'+esc(it.text||"")+'"></div>'; }
var INVCTX=null;
F.openInvoice=function(pre){
  pre=pre||{}; INVCTX=pre; var today=F.D?F.D.today:F.ymd();
  F.modal('<form data-form="invoice" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+esc(pre.title||"Neue Rechnung")+'</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Wird als <b>Entwurf</b> in sevDesk angelegt. Prüfen und versenden machst du in sevDesk.</p>'+
    '<div class="grid2"><label class="fl">Kunde<input class="f" name="contact" list="invContacts" required value="'+esc(pre.contactName||"")+'"></label><label class="fl">E-Mail (für neue Kunden)<input class="f" name="email" type="email" value="'+esc(pre.email||"")+'"></label>'+
    '<label class="fl">Rechnungsdatum<input class="f" name="date" type="date" value="'+esc(pre.invoiceDate||today)+'"></label><label class="fl">Leistungsdatum<input class="f" name="delivery" type="date" value="'+esc(pre.deliveryDate||today)+'"></label></div>'+
    '<label class="fl">Adresse<textarea class="f" name="address" rows="2" placeholder="Name, Straße, PLZ Ort">'+esc(pre.address||pre.contactName||"")+'</textarea></label>'+
    '<label class="fl">Einleitungstext<textarea class="f" name="head" rows="2">'+esc(pre.headText||"")+'</textarea></label>'+
    '<div><div class="sec-t">Positionen</div><div id="irows" style="display:grid;gap:10px">'+((pre.items&&pre.items.length?pre.items:[{}]).map(irow).join(""))+'</div><button type="button" class="link" data-addrow>+ Position</button></div>'+
    '<div class="foot"><span id="invSum" class="num"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="invSave">Entwurf in sevDesk anlegen</button></span></div><div class="err" id="invErr"></div><datalist id="invContacts"></datalist></form>',"wide");
  invSum();
  F.loadMeta(function(m){ var dl=document.getElementById("invContacts"); if(dl) dl.innerHTML=(m.contacts||[]).map(function(c){ return '<option value="'+esc(c.name)+'"></option>'; }).join(""); });
};
function invItems(){ var out=[]; document.querySelectorAll("#irows .irow").forEach(function(r){ var g=function(k){ return r.querySelector('[data-i="'+k+'"]').value; }; var nm=g("name").trim(), pr=g("price"); if(!nm||pr==="") return; out.push({name:nm,text:g("text").trim(),qty:parseFloat(g("qty"))||1,priceGross:parseFloat(pr),taxRate:parseFloat(g("tax"))}); }); return out; }
function invSum(){ var g=0; invItems().forEach(function(i){ g+=i.qty*i.priceGross; }); var el=document.getElementById("invSum"); if(el) el.textContent="Summe brutto "+eur(g); }
F.listen("input","#irows",invSum);
F.listen("change","#irows",invSum);
F.listen("click","[data-addrow]",function(){ document.getElementById("irows").insertAdjacentHTML("beforeend",irow({})); });
F.listen("click","[data-delrow]",function(el){ if(document.querySelectorAll("#irows .irow").length>1) el.closest(".irow").remove(); invSum(); });
F.form("invoice",function(form){
  var items=invItems(), err=document.getElementById("invErr"), btn=document.getElementById("invSave"), contact=form.contact.value.trim();
  if(!contact){ err.textContent="Bitte einen Kunden angeben."; return; }
  if(!items.length){ err.textContent="Bitte mindestens eine Position mit Bezeichnung und Preis angeben."; return; }
  var body={contactName:contact,email:form.email.value.trim(),address:form.address.value.trim()||contact,invoiceDate:form.date.value,deliveryDate:form.delivery.value,headText:form.head.value.trim(),items:items};
  btn.disabled=true; err.textContent=""; btn.textContent="Lege Entwurf an …";
  F.api("/admin/api/sevdesk/invoice",{body:body}).then(function(j){
    if(!j||!j.ok){ btn.disabled=false; btn.textContent="Entwurf in sevDesk anlegen"; err.textContent="sevDesk hat abgelehnt: "+((j&&j.error)||"unbekannter Fehler"); return; }
    var after=(INVCTX&&INVCTX.after)||{}, jobs=[];
    if(after.siteCustomer) jobs.push(F.api("/admin/api/billing",{body:{op:"site",key:after.siteCustomer.replace(/^site:/,""),patch:{customer:contact}}}));
    if(after.billing) jobs.push(F.api("/admin/api/billing",{body:{op:"invoice",key:after.billing.key,invoice:{id:j.id,nr:j.nr,gross:j.gross,from:after.billing.from,to:after.billing.to,label:after.billing.label}}}));
    if(after.kochduSettle) jobs.push(F.api("/admin/api/kochdu-settle",{body:{action:"settle",restaurantId:after.kochduSettle.restaurantId,amountCents:after.kochduSettle.amountCents}}));
    var cb=INVCTX&&INVCTX.onDone;
    Promise.all(jobs.map(function(p){ return p.then(function(r){ return r&&r.ok!==false&&!r.error; }).catch(function(){ return false; }); })).then(function(res){
      var failed=res.filter(function(x){ return !x; }).length;
      F.closeModal();
      if(failed) F.toast("Rechnungsentwurf "+(j.nr||"")+" angelegt, aber "+failed+" Folgeschritt(e) (als verrechnet markieren) fehlgeschlagen – bitte prüfen",true);
      else F.toast("Rechnungsentwurf "+(j.nr||"")+" in sevDesk angelegt",false,"In sevDesk öffnen",function(){ window.open(F.SEVURL+"/fi/detail/type/RE/id/"+encodeURIComponent(j.id),"_blank","noopener"); });
      if(cb) cb(j,{failed:failed}); F.load(true); });
  }).catch(function(){ btn.disabled=false; btn.textContent="Entwurf in sevDesk anlegen"; err.textContent="Keine Verbindung zum Server."; });
});
F.action("newinvoice",function(){ F.openInvoice({}); });
F.action("pdf",function(id){ window.open("/admin/api/sevdesk/pdf?id="+encodeURIComponent(id),"_blank","noopener"); });

/* ---------- Zahlungseingang ---------- */
F.openBook=function(id,txId){
  var i=F.D&&F.D.sev&&F.D.sev.invoices.find(function(x){return x.id===id;}); if(!i) return;
  var accs=F.D.sev.accounts||[], def=(accs.find(function(a){return a.isDefault;})||accs[0]||{}).id;
  var txs=(F.D.sev.transactions||[]).filter(function(t){ return t.status===100&&t.amount>0; });
  F.modal('<form data-form="book" data-id="'+esc(id)+'" class="stackf"><h2 style="font-size:20px">Zahlungseingang erfassen</h2><p style="margin:0">'+esc(i.nr||"Entwurf")+' · '+esc(i.contact)+' · offen <b>'+eur(i.open)+'</b></p>'+
    '<label class="fl">Betrag<input class="f num" name="amount" type="number" step="0.01" min="0.01" value="'+i.open.toFixed(2)+'" required></label><label class="fl">Datum<input class="f" name="date" type="date" value="'+F.D.today+'"></label>'+
    (txs.length?'<label class="fl">Bankumsatz zuordnen (optional)<select class="f" name="tx"><option value="">— ohne Bankumsatz —</option>'+txs.map(function(t){ return '<option value="'+esc(t.id)+'" data-acc="'+esc(t.accountId)+'"'+(t.id===txId?" selected":"")+'>'+F.deShort(t.date)+' · '+eur(t.amount)+' · '+esc((t.name||t.purpose||"").slice(0,50))+'</option>'; }).join("")+'</select></label>':'')+
    '<label class="fl">Konto<select class="f" name="account">'+accs.map(function(a){ return '<option value="'+esc(a.id)+'"'+(a.id===def?" selected":"")+'>'+esc(a.name)+'</option>'; }).join("")+'</select></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">In sevDesk buchen</button></span></div><div class="err" id="bkErr"></div></form>',"narrow");
};
F.action("book",function(id){ F.openBook(id); });
F.form("book",function(f){
  var id=f.getAttribute("data-id"), err=document.getElementById("bkErr"); err.textContent="Buche …";
  var body={id:id,amount:f.amount.value,date:f.date.value,accountId:f.account.value};
  if(f.tx&&f.tx.value){ body.transactionId=f.tx.value; body.accountId=f.tx.selectedOptions[0].getAttribute("data-acc")||body.accountId; }
  F.api("/admin/api/sevdesk/book",{body:body}).then(function(j){ if(j&&j.ok){ F.closeModal(); F.toast("Zahlung in sevDesk gebucht"); F.load(true); } else err.textContent="sevDesk hat abgelehnt: "+((j&&j.error)||"unbekannt"); }).catch(function(){ err.textContent="Keine Verbindung."; });
});

/* ---------- Einfache Mail (das Postfach-Modul ersetzt F.compose durch die volle Version) ---------- */
F.compose=function(pre){
  pre=pre||{}; var accs=((F.D&&F.D.mail.accounts)||[]).filter(function(a){return a.configured!==false;});
  F.modal('<form data-form="mail" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+esc(pre.title||"Neue Mail")+'</h2>'+F.btnClose()+'</div>'+
    (accs.length>1?'<label class="fl">Von<select class="f" name="account">'+accs.map(function(a){ return '<option value="'+esc(a.key)+'"'+(a.key===pre.account||(!pre.account&&a.primary)?" selected":"")+'>'+esc((a.label||a.key)+(a.user?" · "+a.user:""))+'</option>'; }).join("")+'</select></label>':'')+
    '<label class="fl">An<input class="f" name="to" required value="'+esc(pre.to||"")+'"></label><label class="fl">Betreff<input class="f" name="subject" required value="'+esc(pre.subject||"")+'"></label><label class="fl">Nachricht<textarea class="f" name="text" rows="10" autofocus>'+esc(pre.text||"")+'</textarea></label>'+
    '<input type="hidden" name="inReplyTo" value="'+esc(pre.inReplyTo||"")+'"><div class="foot"><span class="muted">Wird über dein Postfach gesendet.</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Senden</button></span></div><div class="err" id="cmErr"></div></form>',"wide");
};
F.form("mail",function(f){
  var err=document.getElementById("cmErr"), btn=f.querySelector("[type=submit]"); btn.disabled=true; err.textContent="";
  var text=f.text.value, html='<div style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap">'+esc(text)+'</div>';
  F.api("/admin/api/mail-send",{body:{account:f.account?f.account.value:undefined,to:f.to.value,subject:f.subject.value,text:text,html:html,inReplyTo:f.inReplyTo.value||undefined}}).then(function(j){
    if(j&&j.ok!==false&&!j.error){ F.closeModal(); F.toast("Gesendet"); setTimeout(function(){ F.load(true); },1500); } else { btn.disabled=false; err.textContent="Senden fehlgeschlagen: "+((j&&(j.detail||j.error))||"unbekannt"); } }).catch(function(){ btn.disabled=false; err.textContent="Keine Verbindung."; });
});
F.action("compose",function(){ F.compose({}); });

/* ---------- To-Dos speichern (gemeinsam für Heute, Kalender, Postfach) ---------- */
F.todosPost=function(next){
  var base=(F.D.todos||[]).map(function(t){return Object.assign({},t);});
  return F.api("/admin/api/todos",{body:{todos:next,base:base}}).then(function(j){ if(j&&Array.isArray(j.todos)) F.D.todos=j.todos; else F.toast("To-Dos konnten nicht gespeichert werden",true); F.render(); return j; });
};
F.addTodo=function(t){ return F.todosPost((F.D.todos||[]).concat([Object.assign({id:"t"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),text:"",due:"",done:false,created:Date.now()},t)])); };
})();
