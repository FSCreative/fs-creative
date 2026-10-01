/* KI (Claude) – Ausgangsrechnung vorbereiten: Feld „Mit KI ausfüllen“ im Rechnungsdialog (shared.js ruft F.kiInvoiceHtml auf).
   Freitext oder Kundenmail/Anfrage → Kunde, Positionen (netto → brutto für den Dialog), Leistungszeitraum, Steuerfall (AT 20 %, EU-B2B Reverse Charge,
   Drittland nicht steuerbar), Zahlungsziel, Kopf-/Fußtext. Angelegt wird wie bisher erst mit „Entwurf in sevDesk anlegen“. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
var PRE=null, BUSY=false;
var CASE={inland:"Inland (österr. USt)",eu_rc:"EU-Unternehmer – Reverse Charge",drittland:"Drittland – nicht steuerbar"};

function sources(){
  var D=F.D||{}, o=['<option value="">— oder Quelle wählen —</option>'];
  var ls=(D.leads||[]).filter(function(l){ return l.stage!=="verloren"; }).slice(0,15);
  if(ls.length) o.push('<optgroup label="Anfragen">'+ls.map(function(l){ return '<option value="lead:'+esc(l.id)+'">'+esc((l.company||l.name)+" – "+(l.topic||""))+'</option>'; }).join("")+'</optgroup>');
  var M=F.M||{}, ms=((M.store&&M.store.messages&&M.store.messages.length?M.store.messages:(D.mail&&D.mail.messages))||[]).filter(function(m){ return !m.deleted&&!(M.isSent&&M.isSent(m))&&!(M.isSpam&&M.isSpam(m)); })
    .slice().sort(function(a,b){ return String(b.date||"").localeCompare(String(a.date||"")); }).slice(0,25);
  if(ms.length) o.push('<optgroup label="Mails">'+ms.map(function(m){ return '<option value="mail:'+esc(m.id)+'">'+esc((m.fromName||m.from||"")+" – "+(m.subject||"").slice(0,50))+'</option>'; }).join("")+'</optgroup>');
  return o.join("");
}
F.kiInvoiceHtml=function(pre){
  PRE=pre||{};
  var k=PRE.kiInfo, out="";
  if(k) out+='<div class="kibox"><div class="row-between"><b>'+F.svg("spark")+' Von der KI vorbereitet</b>'+K.conf(k.confidence)+'</div>'+
    '<div class="kitags"><span class="tag '+(k.existing?"ok":"warn")+'">'+(k.existing?"Kunde in sevDesk vorhanden":"neuer Kunde – wird in sevDesk angelegt")+'</span><span class="tag '+(k.taxCase==="inland"?"grey":"info")+'">'+esc(CASE[k.taxCase]||k.taxCase)+'</span>'+(k.uid?'<span class="tag grey">UID '+esc(k.uid)+'</span>':'')+(k.deliveryDateUntil?'<span class="tag grey">Leistung bis '+esc(F.de(k.deliveryDateUntil))+'</span>':'')+'</div>'+
    '<div class="muted"><b>Fußtext:</b> '+esc(k.footText).replace(/\n/g,"<br>")+'</div>'+(k.notes?'<div class="bad-t" style="font-size:13px">'+esc(k.notes)+'</div>':'')+
    '<div class="muted">Preise im Dialog sind brutto (aus netto umgerechnet). Steuerregel und Fußtext werden mit angelegt.</div></div>';
  out+='<details class="kiinv"'+(k?'':' open')+'><summary>'+F.svg("spark")+' Mit KI ausfüllen</summary><div class="stackf" style="gap:8px;margin-top:8px">'+
    '<textarea class="f" id="kiInvText" rows="3" placeholder="z. B. Rechnung an Lerch: Website-Relaunch 2.400 € netto, Hosting 12 Monate">'+esc(PRE.kiText||"")+'</textarea>'+
    '<div class="row wrap"><select class="f" id="kiInvSrc" style="flex:1;min-width:200px">'+sources()+'</select><button type="button" class="btn primary" data-act="kiinvfill"'+(BUSY?" disabled":"")+'>'+(BUSY?"KI füllt aus …":"Ausfüllen")+'</button></div>'+
    '<div class="err" id="kiInvErr"></div></div></details>';
  return out;
};
function fill(inv,pre){
  F.openInvoice(Object.assign({},pre,{contactName:inv.contactName,email:inv.email,address:inv.address,invoiceDate:inv.invoiceDate,deliveryDate:inv.deliveryDate,headText:inv.headText,
    items:inv.items.map(function(i){ return {name:i.name,text:i.text,qty:i.qty,priceGross:i.priceGross,taxRate:i.taxRate}; }),
    taxRule:inv.taxRule||undefined,footText:inv.footText,timeToPay:inv.timeToPay,deliveryDateUntil:inv.deliveryDateUntil||undefined,kiInfo:inv}));
}
K.invoiceDraft=function(req,pre){
  pre=Object.assign({title:"Neue Rechnung (KI)"},pre||{}); pre.kiText=req.text||"";
  BUSY=true;
  return K.api("rechnung",req).then(function(j){ BUSY=false; K.load(true); if(!j.invoice.items.length) throw new Error("Die KI hat keine Positionen gefunden – bitte genauer beschreiben."); fill(j.invoice,pre); return j.invoice; })
    .catch(function(e){ BUSY=false; throw e; });
};
F.action("kiinvfill",function(){
  var t=document.getElementById("kiInvText"), s=document.getElementById("kiInvSrc"), err=document.getElementById("kiInvErr");
  var req={text:(t&&t.value||"").trim()}, v=s&&s.value||"";
  if(/^lead:/.test(v)) req.leadId=v.slice(5); if(/^mail:/.test(v)) req.mailId=v.slice(5);
  if(!req.text&&!req.leadId&&!req.mailId){ err.textContent="Bitte beschreiben, was verrechnet wird, oder eine Mail/Anfrage wählen."; return; }
  if(K.st&&!K.st.configured){ err.textContent=K.NOT_SET; return; }
  var b=document.querySelector('[data-act="kiinvfill"]'); if(b){ b.disabled=true; b.textContent="KI füllt aus …"; } err.textContent="";
  var keep=Object.assign({},PRE); delete keep.kiInfo;
  K.invoiceDraft(req,keep).catch(function(e){ var er=document.getElementById("kiInvErr"); if(er) er.textContent=e.message; var bb=document.querySelector('[data-act="kiinvfill"]'); if(bb){ bb.disabled=false; bb.textContent="Ausfüllen"; } });
});
/* Vorschlag aus dem Assistenten: Dialog öffnen und ausfüllen */
K.invoiceFromProposal=function(d){
  F.openInvoice({title:"Neue Rechnung (KI)",kiText:d.text||""});
  var err=document.getElementById("kiInvErr"); if(err) err.textContent="KI füllt aus …";
  return K.invoiceDraft({text:d.text||"",leadId:d.leadId||undefined,mailId:d.mailId||undefined},{}).catch(function(e){ var er=document.getElementById("kiInvErr"); if(er) er.textContent=e.message; else F.toast(e.message,true); });
};
F.css([
".kiinv summary{cursor:pointer;font-weight:600;font-size:14px;color:var(--info);display:inline-flex;gap:6px;align-items:center}.kiinv summary svg{width:15px;height:15px}",
".kiinv{border:1px dashed var(--line);border-radius:11px;padding:8px 12px}"
].join("\n"));
})();
