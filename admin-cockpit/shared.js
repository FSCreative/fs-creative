/* Gemeinsame Dialoge: Rechnung, Zahlungseingang, einfache Mail. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur;

/* ---------- Rechnung erstellen (Entwurf) ---------- */
var META=null;
F.loadMeta=function(cb,force){ if(META&&!force) return cb(META); F.api("/admin/api/sevdesk/meta"+(force?"?force=1":"")).then(function(m){ META=m||{}; cb(META); }).catch(function(){ cb({}); }); };
function irow(it){ it=it||{}; var tax=it.taxRate!=null?+it.taxRate:20; return '<div class="irow"><input class="f" data-i="name" list="invParts" placeholder="Bezeichnung oder Artikel" value="'+esc(it.name||"")+'"><input class="f num" data-i="qty" type="number" min="0" step="0.5" value="'+esc(it.qty||1)+'" aria-label="Menge"><input class="f num" data-i="price" type="number" step="0.01" placeholder="brutto €" value="'+(it.priceGross!=null?esc(it.priceGross):"")+'" aria-label="Einzelpreis brutto"><select class="f" data-i="tax" aria-label="USt">'+[20,13,10,0].map(function(r){ return '<option value="'+r+'"'+(tax===r?" selected":"")+'>'+r+' %</option>'; }).join("")+'</select><button type="button" class="btn icon del" data-delrow aria-label="Position entfernen">✕</button><input class="f t2" data-i="text" placeholder="Beschreibung (optional)" value="'+esc(it.text||"")+'">'+(+it.discount>0?'<input type="hidden" data-i="disc" value="'+esc(it.discount)+'"><span class="irdisc">abzüglich '+esc(String(+it.discount).replace(".",","))+' % Rabatt</span>':'')+'</div>'; }
var INVCTX=null, PARTS=[];
F.addDays=function(iso,n){ var d=new Date(String(iso).slice(0,10)+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
/* Anschrift: Einzelfelder ↔ mehrzeiliger Adressblock (Name / z. H. / Straße / PLZ Ort / Land) */
var LAND={AT:"Österreich",DE:"Deutschland",CH:"Schweiz",IT:"Italien",LI:"Liechtenstein",FR:"Frankreich",NL:"Niederlande",BE:"Belgien",LU:"Luxemburg",ES:"Spanien",PL:"Polen",CZ:"Tschechien",SK:"Slowakei",HU:"Ungarn",SI:"Slowenien",HR:"Kroatien",DK:"Dänemark",SE:"Schweden",GB:"Vereinigtes Königreich",US:"USA"};
function landName(v){ v=String(v||"").trim(); return /^[A-Za-z]{2}$/.test(v)?(LAND[v.toUpperCase()]||v.toUpperCase()):v; }
function isAT(v){ v=String(v||"").trim().toLowerCase(); return !v||v==="at"||v==="österreich"||v==="oesterreich"||v==="austria"; }
function landKnown(v){ v=String(v||"").trim().toLowerCase(); return Object.keys(LAND).some(function(k){ return LAND[k].toLowerCase()===v; })||/^(austria|germany|switzerland|italy|deutschland)$/.test(v); }
/* best effort: alter Adresstext (Entwurf, KI, andere Dialoge) → Felder */
F.parseAddress=function(text,name){
  var r={contactPerson:"",street:"",zip:"",city:"",country:""}, lines=String(text||"").split(/\r?\n/).map(function(x){ return x.trim(); }).filter(Boolean);
  if(lines.length===1&&lines[0].indexOf(",")>-1) lines=lines[0].split(",").map(function(x){ return x.trim(); }).filter(Boolean);
  if(lines.length&&name&&lines[0].toLowerCase()===String(name).trim().toLowerCase()) lines.shift();
  else if(lines.length>1&&!name) r.name=lines.shift();
  var zi=-1; lines.forEach(function(l,i){ if(/^(?:[A-Z]{1,2}[-\s])?\d{4,5}\s+\S/.test(l)) zi=i; });
  if(zi>-1){ var m=lines[zi].match(/^(?:[A-Z]{1,2}[-\s])?(\d{4,5})\s+(.+)$/); r.zip=m[1]; r.city=m[2]; var after=lines.slice(zi+1); if(after.length) r.country=after[after.length-1]; lines=lines.slice(0,zi); }
  else if(lines.length>1&&landKnown(lines[lines.length-1])) r.country=lines.pop();
  lines.forEach(function(l){ var zh=l.match(/^(?:z\.?\s*h\.?|zh|attn\.?|c\/o)\s*:?\s*(.+)$/i);
    if(zh) r.contactPerson=zh[1];
    else if(/\d/.test(l)) r.street=r.street?r.street+", "+l:l;
    else if(!r.contactPerson) r.contactPerson=l;
    else r.street=r.street?r.street+", "+l:l; });
  return r;
};
F.composeAddress=function(a){ return [a.name,a.contactPerson?"z. H. "+a.contactPerson:"",a.street,[a.zip,a.city].filter(Boolean).join(" "),isAT(a.country)?"":landName(a.country)].filter(Boolean).join("\n"); };
var INVAUTO=null;   /* zuletzt automatisch übernommener Bestandskunde (id) */
function invMatch(name){ name=String(name||"").trim().toLowerCase(); if(!name||!META) return null; return (META.contacts||[]).find(function(c){ return c.name.toLowerCase()===name; })||null; }
function invCustomer(){
  var form=document.querySelector('form[data-form="invoice"]'); if(!form) return; var hint=document.getElementById("invCustHint"), name=form.contact.value.trim(), c=invMatch(name);
  if(META){
    if(c&&c.id!==INVAUTO){
      var initial=INVAUTO===null;   /* beim Öffnen nur Leeres ergänzen (Entwurf/Vorbelegung bleibt), bei Kundenwechsel übernehmen */
      var put=function(k,v){ var el=form[k]; if(el&&(!initial||!el.value.trim())) el.value=v||""; };
      if(!initial||!(form.street.value.trim()||form.zip.value.trim()||form.city.value.trim())){ put("street",c.street); put("zip",c.zip); put("city",c.city); form.country.value=c.country||"Österreich"; }
      else if(c.country&&isAT(form.country.value)&&form.zip.value.trim()===c.zip) form.country.value=c.country;
      put("email",c.email); put("uid",c.vat);
    }
    INVAUTO=c?c.id:"";
  }
  var known=!c&&INVCTX&&INVCTX.contactId&&INVCTX.contactName===name;
  if(hint) hint.innerHTML=!name?"":c?'✓ Bestandskunde'+(c.nr?" · Kunden-Nr. "+esc(c.nr):"")+(c.street||c.city?"":" · Adresse wird beim Kunden ergänzt"):known?"✓ Bestandskunde":META?"Neuer Kunde – wird angelegt (Kunden-Nr. vergibt die Buchhaltung)":"";
}
/* Vorschlagsliste unter Eingabefeldern (statt <datalist>, das je nach Browser/App kaum aufklappt): ab dem ersten Buchstaben passende Einträge,
   Pfeiltasten + Enter, Esc schließt, Klick übernimmt. Nutzung: <input data-sugg="schlüssel"> + F.SUGG[schlüssel]={items:function(q){…},pick:function(input,item){…}} */
F.SUGG=F.SUGG||{};
var SG={el:null,input:null,items:[],i:-1};
function sgNorm(v){ return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ß/g,"ss"); }
F.suggMatch=function(list,q,keys,max){ q=sgNorm(q).trim(); if(!q) return []; var out=[];
  list.forEach(function(it){ var best=9; keys.forEach(function(k,ki){ var v=sgNorm(it[k]); if(!v) return; var at=v.indexOf(q); if(at<0) return; var sc=at===0?0:/[\s\-.,&\/(@]/.test(v.charAt(at-1))?1:2; if(ki&&sc>1) return; sc+=ki?3:0; if(sc<best) best=sc;   /* Nebenfelder (Nr., E-Mail …) nur ab Wortanfang */ }); if(best<9) out.push([best,it]); });
  return out.sort(function(a,b){ return a[0]-b[0]||String(a[1].label).localeCompare(String(b[1].label),"de"); }).slice(0,max||8).map(function(x){ return x[1]; }); };
function sgClose(){ if(SG.el) SG.el.remove(); SG.el=null; SG.input=null; SG.items=[]; SG.i=-1; }
function sgOpen(input){ var cfg=F.SUGG[input.getAttribute("data-sugg")]; if(!cfg) return; var items=cfg.items(input.value)||[];
  if(!items.length){ sgClose(); return; }
  if(!SG.el||SG.input!==input){ sgClose(); SG.el=document.createElement("div"); SG.el.className="sugg"; SG.el.setAttribute("role","listbox"); input.parentNode.appendChild(SG.el); SG.input=input; }
  SG.items=items; SG.i=-1;
  SG.el.style.top=(input.offsetTop+input.offsetHeight+4)+"px"; SG.el.style.left=input.offsetLeft+"px"; SG.el.style.width=input.offsetWidth+"px";
  SG.el.innerHTML=items.map(function(it,i){ return '<button type="button" role="option" tabindex="-1" data-sgi="'+i+'"><b>'+esc(it.label)+'</b>'+(it.sub?'<small>'+esc(it.sub)+'</small>':'')+(it.tag?'<span class="tag '+(it.tagCls||"grey")+'">'+esc(it.tag)+'</span>':'')+'</button>'; }).join(""); }
function sgMark(){ if(!SG.el) return; [].forEach.call(SG.el.children,function(b,i){ b.classList.toggle("on",i===SG.i); if(i===SG.i) b.scrollIntoView({block:"nearest"}); }); }
function sgPick(i){ var it=SG.items[i], input=SG.input; if(!it||!input) return; var cfg=F.SUGG[input.getAttribute("data-sugg")]; sgClose(); input.value=it.value!=null?it.value:it.label; if(cfg&&cfg.pick) cfg.pick(input,it); input.dispatchEvent(new Event("change",{bubbles:true})); }
document.addEventListener("input",function(e){ var t=e.target; if(t&&t.getAttribute&&t.getAttribute("data-sugg")) sgOpen(t); });
document.addEventListener("focusin",function(e){ var t=e.target; if(t&&t.getAttribute&&t.getAttribute("data-sugg")&&t.value.trim()) sgOpen(t); });
document.addEventListener("focusout",function(e){ if(SG.input&&e.target===SG.input) setTimeout(function(){ if(SG.input&&document.activeElement!==SG.input) sgClose(); },120); });
document.addEventListener("mousedown",function(e){ var b=e.target.closest&&e.target.closest("[data-sgi]"); if(!b) return; e.preventDefault(); sgPick(+b.getAttribute("data-sgi")); });
document.addEventListener("keydown",function(e){ if(!SG.el||e.target!==SG.input) return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); SG.i=(SG.i+(e.key==="ArrowDown"?1:-1)+SG.items.length+1)%(SG.items.length+1); if(SG.i===SG.items.length) SG.i=-1; sgMark(); }
  else if(e.key==="Enter"){ e.preventDefault(); if(SG.i>-1) sgPick(SG.i); else sgClose(); }   /* Enter bei offener Liste schickt das Formular nie ab */
  else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); sgClose(); }
  else if(e.key==="Tab") sgClose(); },true);
F.css('.fl{position:relative}form[data-form="invoice"] .grid2{align-items:start}.sugg{position:absolute;z-index:90;display:grid;max-height:320px;overflow-y:auto;background:var(--glass-strong,var(--panel));-webkit-backdrop-filter:var(--glass-blur,none);backdrop-filter:var(--glass-blur,none);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-pop,0 16px 40px rgba(0,0,0,.3));padding:4px}'+
  ':where(:root[data-theme="glas"]) .sugg{border-color:var(--glass-line);border-radius:16px;box-shadow:var(--glass-hi),var(--shadow-pop)}'+
  '.sugg button{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;align-items:center;text-align:left;border:0;background:none;border-radius:8px;padding:7px 10px;color:var(--ink);cursor:pointer}'+
  '.sugg button b{font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sugg button small{grid-column:1;font-size:12px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sugg button .tag{grid-column:2;grid-row:1/span 2}'+
  '.sugg button:hover,.sugg button.on{background:var(--hover,var(--sunk))}');
/* Rechnung/Angebot „Firma / Name“: Kunden aus der Buchhaltung, dazu Kunden & Leads und Namen aus bisherigen Rechnungen (falls dort noch kein Kontakt) */
function invPeople(){ var out=[], seen={};
  var add=function(it){ var k=sgNorm(it.label).trim(); if(!k||seen[k]) return; seen[k]=1; out.push(it); };
  ((META&&META.contacts)||[]).forEach(function(c){ add({label:c.name,sub:[c.nr?"Nr. "+c.nr:"",[c.zip,c.city].filter(Boolean).join(" "),c.email].filter(Boolean).join(" · "),tag:"Kunde",tagCls:"ok",nr:c.nr,email:c.email,city:c.city,kind:"contact"}); });
  ((F.D&&F.D.leads)||[]).forEach(function(l){ var nm=l.company||l.name; if(nm) add({label:nm,sub:[l.company&&l.name?l.name:"",l.email].filter(Boolean).join(" · "),tag:"Lead",tagCls:"glow",email:l.email,person:l.company?l.name:"",kind:"lead"}); });
  ((F.D&&F.D.sev&&F.D.sev.invoices)||[]).forEach(function(i){ if(i.contact) add({label:i.contact,sub:"aus Rechnungen",kind:"inv"}); });
  return out; }
F.SUGG.invcontact={items:function(q){ return F.suggMatch(invPeople(),q,["label","nr","email","sub"],10); },
  pick:function(input,it){ var form=input.form; if(!form) return; if(it.kind==="lead"){ if(it.email&&!form.email.value.trim()) form.email.value=it.email; if(it.person&&!form.attn.value.trim()) form.attn.value=it.person; } invCustomer(); }};
F.listen("input",'form[data-form="invoice"] [name="contact"]',function(){ invCustomer(); });
F.listen("change",'form[data-form="invoice"] [name="contact"]',function(){ invCustomer(); });
function invAddrBody(form,contact,body){
  var a={name:contact,contactPerson:form.attn.value.trim(),street:form.street.value.trim(),zip:form.zip.value.trim(),city:form.city.value.trim(),country:form.country.value.trim()||"Österreich"};
  body.address=F.composeAddress(a)||contact; body.street=a.street; body.zip=a.zip; body.city=a.city; body.country=a.country; body.contactPerson=a.contactPerson;
  var uid=form.uid.value.replace(/\s+/g,"").toUpperCase(); if(uid) body.uid=uid;
  var c=invMatch(contact); if(c) body.contactId=c.id; else if(INVCTX&&INVCTX.contactId&&INVCTX.contactName===contact) body.contactId=INVCTX.contactId;
  return body;
}
/* Rechnungsdialog; mit pre.kind==="offer" derselbe Dialog als „Neues Angebot“ (Gültig bis, Betreff, → /admin/api/sevdesk/offer) */
F.openInvoice=function(pre){
  pre=pre||{}; INVCTX=pre; INVAUTO=null; var today=F.D?F.D.today:F.ymd(), offer=pre.kind==="offer";
  var A=pre.street||pre.zip||pre.city?{contactPerson:pre.contactPerson||"",street:pre.street||"",zip:pre.zip||"",city:pre.city||"",country:pre.country||""}:F.parseAddress(pre.address&&pre.address!==pre.contactName?pre.address:"",pre.contactName);
  var cname=pre.contactName||A.name||"", land=landName(A.country||pre.country)||"Österreich";
  F.modal('<form data-form="invoice" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+esc(pre.title||(offer?"Neues Angebot":"Neue Rechnung"))+'</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">'+(pre.id?'Du bearbeitest einen Entwurf. Die Positionen werden ersetzt.':'Wird als <b>Entwurf</b> angelegt. Danach kannst du ihn direkt hier ansehen und per Mail senden.')+'</p>'+(F.kiInvoiceHtml?F.kiInvoiceHtml(pre):'')+
    (pre.paidNote?'<div class="notice" style="background:var(--info-soft)"><span>'+pre.paidNote+'</span></div><label class="fl">Bezahlt auf Konto<select class="f" name="paidacc">'+(pre.paidAccounts||[]).map(function(a){ return '<option value="'+esc(a.id)+'"'+(/kasse/i.test(a.name)?" selected":"")+'>'+esc(a.name)+'</option>'; }).join("")+'</select></label>':'')+
    '<div class="grid2"><label class="fl">Firma / Name<input class="f" name="contact" data-sugg="invcontact" required autocomplete="off" placeholder="Name eintippen – Bestandskunden werden vorgeschlagen" value="'+esc(cname)+'"><span class="muted small" id="invCustHint" aria-live="polite"></span></label><label class="fl">E-Mail<input class="f" name="email" type="email" value="'+esc(pre.email||"")+'"></label></div>'+
    '<div class="grid2"><label class="fl"><span>z. H. <span class="muted small">(optional)</span></span><input class="f" name="attn" placeholder="Ansprechperson" value="'+esc(A.contactPerson||"")+'"></label><label class="fl"><span>UID <span class="muted small">(optional)</span></span><input class="f" name="uid" placeholder="ATU12345678" value="'+esc(pre.uid||"")+'"></label></div>'+
    '<label class="fl">Straße<input class="f" name="street" autocomplete="off" value="'+esc(A.street||"")+'"></label>'+
    '<div class="grid2"><div style="display:grid;grid-template-columns:6.5em minmax(0,1fr);gap:10px"><label class="fl">PLZ<input class="f" name="zip" inputmode="numeric" autocomplete="off" value="'+esc(A.zip||"")+'"></label><label class="fl">Ort<input class="f" name="city" autocomplete="off" value="'+esc(A.city||"")+'"></label></div><label class="fl">Land<input class="f" name="country" list="invLands" value="'+esc(land)+'"></label></div>'+
    '<div class="grid2">'+
    (offer?'<label class="fl">Angebotsdatum<input class="f" name="date" type="date" value="'+esc(pre.invoiceDate||today)+'"></label><label class="fl">Gültig bis<input class="f" name="valid" type="date" value="'+esc(pre.validUntil||F.addDays(pre.invoiceDate||today,30))+'"></label></div>'+
      '<label class="fl">Betreff<input class="f" name="header" value="'+esc(pre.header||"Angebot")+'"></label>'
    :'<label class="fl">Rechnungsdatum<input class="f" name="date" type="date" value="'+esc(pre.invoiceDate||today)+'"></label><label class="fl">Leistungsdatum<input class="f" name="delivery" type="date" value="'+esc(pre.deliveryDate||today)+'"></label></div>')+
    (offer?'':'<label class="fl"><span>Referenz <span class="muted small">(optional – steht rechts oben unter der Rechnungsnummer, z. B. Bestell- oder Projektnummer; leer = automatisch)</span></span><input class="f" name="reference" maxlength="60" value="'+esc(pre.reference||"")+'"></label>')+
    '<label class="fl">Einleitungstext<textarea class="f" name="head" rows="2">'+esc(pre.headText||"")+'</textarea></label>'+
    '<div><div class="sec-t">Positionen</div><div id="irows" style="display:grid;gap:10px">'+((pre.items&&pre.items.length?pre.items:[{}]).map(irow).join(""))+'</div><button type="button" class="link" data-addrow>+ Position</button></div>'+
    '<div class="foot"><span id="invSum" class="num"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="invSave">'+(offer?"Angebot als Entwurf anlegen":pre.id?"Änderungen speichern":"Entwurf anlegen")+'</button></span></div><div class="err" id="invErr"></div><datalist id="invLands">'+Object.keys(LAND).map(function(k){ return '<option value="'+esc(LAND[k])+'"></option>'; }).join("")+'</datalist><datalist id="invParts"></datalist></form>',"wide");
  invSum();
  if(F.sevParts) F.sevParts(function(ps){ PARTS=ps||[]; var dl=document.getElementById("invParts"); if(dl) dl.innerHTML=PARTS.filter(function(p){return p.active;}).map(function(p){ return '<option value="'+esc(p.name)+'">'+esc(F.eur(p.priceGross))+'</option>'; }).join(""); });
  F.loadMeta(function(m){ if(m&&m.error) META=null;   /* Fehler nicht merken → beim nächsten Öffnen neu versuchen */
    var inp=document.querySelector('form[data-form="invoice"] [name="contact"]'); invCustomer(); if(inp&&document.activeElement===inp&&inp.value.trim()) sgOpen(inp); });
  invCustomer();
};
function invItems(){ var out=[]; document.querySelectorAll("#irows .irow").forEach(function(r){ var g=function(k){ return r.querySelector('[data-i="'+k+'"]').value; }; var nm=g("name").trim(), pr=g("price"); if(!nm||pr==="") return; var d=r.querySelector('[data-i="disc"]'), it={name:nm,text:g("text").trim(),qty:parseFloat(g("qty"))||1,priceGross:parseFloat(pr),taxRate:parseFloat(g("tax"))}; if(d&&+d.value>0) it.discount=+d.value; out.push(it); }); return out; }
function invSum(){ var g=0; invItems().forEach(function(i){ g+=i.qty*i.priceGross*(1-(i.discount||0)/100); }); var el=document.getElementById("invSum"); if(el) el.textContent="Summe brutto "+eur(g); }
F.listen("input","#irows",invSum);
F.listen("change","#irows",invSum);
/* Artikel gewählt → Preis, USt und Text übernehmen */
F.listen("change",'#irows [data-i="name"]',function(el){
  var p=PARTS.find(function(x){ return x.name===el.value; }); if(!p) return;
  var r=el.closest(".irow"), pr=r.querySelector('[data-i="price"]'), tx=r.querySelector('[data-i="text"]'), tax=r.querySelector('[data-i="tax"]');
  if(pr&&!pr.value) pr.value=p.priceGross; if(tx&&!tx.value&&p.text) tx.value=p.text; if(tax) tax.value=String(p.taxRate);
  invSum();
});
F.listen("click","[data-addrow]",function(){ document.getElementById("irows").insertAdjacentHTML("beforeend",irow({})); });
F.listen("click","[data-delrow]",function(el){ if(document.querySelectorAll("#irows .irow").length>1) el.closest(".irow").remove(); invSum(); });
F.form("invoice",function(form){
  var items=invItems(), err=document.getElementById("invErr"), btn=document.getElementById("invSave"), contact=form.contact.value.trim();
  if(!contact){ err.textContent="Bitte einen Kunden angeben."; return; }
  if(!items.length){ err.textContent="Bitte mindestens eine Position mit Bezeichnung und Preis angeben."; return; }
  if(INVCTX&&INVCTX.kind==="offer") return saveOffer(form,items,contact,err,btn);
  var body={contactName:contact,email:form.email.value.trim(),invoiceDate:form.date.value,deliveryDate:form.delivery.value,headText:form.head.value.trim(),reference:form.reference?form.reference.value.trim():"",items:items};
  if(INVCTX) ["taxRule","footText","timeToPay","deliveryDateUntil","taxType","taxSet","id"].forEach(function(k){ if(INVCTX[k]) body[k]=INVCTX[k]; });
  invAddrBody(form,contact,body);
  var editing=!!body.id, lblSave=editing?"Änderungen speichern":"Entwurf anlegen";   /* z. B. von der KI (Reverse Charge, Fußtext) */
  btn.disabled=true; err.textContent=""; btn.textContent=editing?"Speichere …":"Lege Entwurf an …";
  F.api("/admin/api/sevdesk/invoice",{body:body}).then(function(j){
    if(!j||!j.ok){ btn.disabled=false; btn.textContent=lblSave; err.textContent="Abgelehnt: "+((j&&j.error)||"unbekannter Fehler"); return; }
    if(!body.contactId) META=null;   /* neuer Kunde → Kundenliste neu laden */
    var after=(INVCTX&&INVCTX.after)||{}, jobs=[];
    if(after.siteCustomer) jobs.push(F.api("/admin/api/billing",{body:{op:"site",key:after.siteCustomer.replace(/^site:/,""),patch:{customer:contact}}}));
    if(after.billing) jobs.push(F.api("/admin/api/billing",{body:{op:"invoice",key:after.billing.key,invoice:{id:j.id,nr:j.nr,gross:j.gross,from:after.billing.from,to:after.billing.to,label:after.billing.label}}}));
    if(after.paid&&form.paidacc){ var pa=form.paidacc.value; jobs.push(F.api("/admin/api/sev/invoice-op",{body:{confirm:true,op:"sent",id:j.id,sendType:"VPDF"}}).then(function(r){ if(!r||!r.ok) return r; return F.api("/admin/api/sevdesk/book",{body:{id:j.id,amount:after.paid.amount,date:after.paid.date,accountId:pa}}); })); }
    if(after.kochduSettle) jobs.push(F.api("/admin/api/kochdu-settle",{body:{action:"settle",restaurantId:after.kochduSettle.restaurantId,amountCents:after.kochduSettle.amountCents}}));
    var cb=INVCTX&&INVCTX.onDone;
    Promise.all(jobs.map(function(p){ return p.then(function(r){ return r&&r.ok!==false&&!r.error; }).catch(function(){ return false; }); })).then(function(res){
      var failed=res.filter(function(x){ return !x; }).length;
      F.closeModal();
      if(failed) F.toast("Rechnungsentwurf "+(j.nr||"")+" angelegt, aber "+failed+" Folgeschritt(e) (als verrechnet markieren) fehlgeschlagen – bitte prüfen",true);
      else if(editing) F.toast("Entwurf gespeichert");
      else F.toast("Rechnungsentwurf "+(j.nr||"")+" angelegt",false,"Öffnen & senden",function(){ if(F.sevOpenInvoice) F.sevOpenInvoice(j.id); else F.viewDoc("/admin/api/sevdesk/pdf?id="+encodeURIComponent(j.id),"Rechnung "+(j.nr||"Entwurf")); });
      if(cb) cb(j,{failed:failed}); F.load(true); });
  }).catch(function(){ btn.disabled=false; btn.textContent=lblSave; err.textContent="Keine Verbindung zum Server."; });
});
/* Angebot anlegen (gleicher Dialog). Danach optional Lead in Phase „Angebot“ schieben (nur vorwärts). */
function saveOffer(form,items,contact,err,btn){
  var ctx=INVCTX||{}, body={contactName:contact,email:form.email.value.trim(),orderDate:form.date.value,validUntil:form.valid.value,header:form.header.value.trim()||"Angebot",headText:form.head.value.trim(),items:items};
  ["taxRule","footText"].forEach(function(k){ if(ctx[k]) body[k]=ctx[k]; });
  invAddrBody(form,contact,body);
  var lbl="Angebot als Entwurf anlegen"; btn.disabled=true; err.textContent=""; btn.textContent="Lege Angebot an …";
  F.api("/admin/api/sevdesk/offer",{body:body}).then(function(j){
    if(!j||!j.ok){ btn.disabled=false; btn.textContent=lbl; err.textContent="Abgelehnt: "+((j&&j.error)||"unbekannter Fehler"); return; }
    if(!body.contactId) META=null;
    var lid=ctx.after&&ctx.after.leadId, l=lid&&F.D&&(F.D.leads||[]).find(function(x){ return x.id===lid; });
    var order=["anfrage","entwurf","angebot","auftrag","live"], move=l&&order.indexOf(l.stage||"anfrage")<order.indexOf("angebot");
    var patch=move?{stage:"angebot"}:null;
    if(l&&!(+l.value>0)){ var net=items.reduce(function(s,i){ return s+i.qty*i.priceGross/(1+(i.taxRate||0)/100); },0); patch=Object.assign(patch||{},{value:Math.round(net)}); }
    var job=patch?F.api("/admin/api/leads",{body:{op:"update",id:lid,patch:patch}}).then(function(r){ if(r&&r.ok) F.D.leads=r.leads; return r&&r.ok; }).catch(function(){ return false; }):Promise.resolve(true);
    job.then(function(ok){
      F.closeModal();
      if(!ok) F.toast("Angebot "+(j.nr||"")+" angelegt, aber die Phase des Leads konnte nicht gesetzt werden",true);
      else F.toast("Angebot "+(j.nr||"")+" als Entwurf angelegt"+(move?" · Lead jetzt in „Angebot“":""),false,"PDF ansehen",function(){ F.viewDoc("/admin/api/sevdesk/offer-pdf?id="+encodeURIComponent(j.id),"Angebot "+(j.nr||"")); });
      if(ctx.onDone) ctx.onDone(j);
      if(F.offersLoad) F.offersLoad(true); F.render();
    });
  }).catch(function(){ btn.disabled=false; btn.textContent=lbl; err.textContent="Keine Verbindung zum Server."; });
}
F.action("newinvoice",function(){ F.openInvoice({}); });
F.action("pdf",function(id,el){ F.viewDoc("/admin/api/sevdesk/pdf?id="+encodeURIComponent(id),(el&&el.getAttribute("data-doctitle"))||"Rechnung"); });

/* ---------- Zahlungseingang ---------- */
F.openBook=function(id,txId){
  var i=F.D&&F.D.sev&&F.D.sev.invoices.find(function(x){return x.id===id;}); if(!i) return;
  var accs=F.D.sev.accounts||[], def=(accs.find(function(a){return a.isDefault;})||accs[0]||{}).id;
  var txs=(F.D.sev.transactions||[]).filter(function(t){ return t.status===100&&t.amount>0; });
  F.modal('<form data-form="book" data-id="'+esc(id)+'" class="stackf"><h2 style="font-size:20px">Zahlungseingang erfassen</h2><p style="margin:0">'+esc(i.nr||"Entwurf")+' · '+esc(i.contact)+' · offen <b>'+eur(i.open)+'</b>'+(i.feeOpen>0?' + Mahngebühr <b>'+eur(i.feeOpen)+'</b>':'')+'</p>'+
    (i.feeOpen>0?'<p class="muted" style="margin:0;font-size:13px">Was über den offenen Rechnungsbetrag hinausgeht, wird als Mahngebühr gebucht – eigener Einnahme-Beleg, nicht umsatzsteuerbar (Schadenersatz).</p>':'')+
    '<label class="fl">Betrag<input class="f num" name="amount" type="number" step="0.01" min="0.01" value="'+(i.open+(i.feeOpen||0)).toFixed(2)+'" data-open="'+i.open.toFixed(2)+'" required></label>'+
    '<div class="fl" id="bkDiff" hidden><span>Differenz <b id="bkDiffAmt"></b> – Grund</span><select class="f" name="diffType"><option value="">Teilzahlung (Rest bleibt offen)</option><option value="skonto">Skonto / Kürzung (Entgeltsminderung, USt wird anteilig korrigiert)</option><option value="spesen">Bankspesen (Aufwand ohne Vorsteuer, Rechnung voll bezahlt)</option></select></div><label class="fl">Datum<input class="f" name="date" type="date" value="'+F.D.today+'"></label>'+
    (txs.length?'<label class="fl">Bankumsatz zuordnen (optional)<select class="f" name="tx"><option value="">— ohne Bankumsatz —</option>'+txs.map(function(t){ return '<option value="'+esc(t.id)+'" data-acc="'+esc(t.accountId)+'"'+(t.id===txId?" selected":"")+'>'+F.deShort(t.date)+' · '+eur(t.amount)+' · '+esc((t.name||t.purpose||"").slice(0,50))+'</option>'; }).join("")+'</select></label>':'')+
    '<label class="fl">Konto<select class="f" name="account">'+accs.map(function(a){ return '<option value="'+esc(a.id)+'"'+(a.id===def?" selected":"")+'>'+esc(a.name)+'</option>'; }).join("")+'</select></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Zahlung buchen</button></span></div><div class="err" id="bkErr"></div></form>',"narrow");
};
F.action("book",function(id){ F.openBook(id); });
F.listen("input","form[data-form=book] input[name=amount]",function(el){ var o=+el.getAttribute("data-open")||0, a=+el.value||0, d=Math.round((o-a)*100)/100, box=document.getElementById("bkDiff"); if(!box) return; box.hidden=!(d>0.004&&a>0); var t=document.getElementById("bkDiffAmt"); if(t) t.textContent=F.eur(d); });
F.form("book",function(f){
  var id=f.getAttribute("data-id"), err=document.getElementById("bkErr"); err.textContent="Buche …";
  var body={id:id,amount:f.amount.value,date:f.date.value,accountId:f.account.value,diffType:f.diffType&&!document.getElementById("bkDiff").hidden?f.diffType.value:""};
  if(f.tx&&f.tx.value){ body.transactionId=f.tx.value; body.accountId=f.tx.selectedOptions[0].getAttribute("data-acc")||body.accountId; }
  F.api("/admin/api/sevdesk/book",{body:body}).then(function(j){ if(j&&j.ok){ F.closeModal(); F.toast("Zahlung gebucht"); F.load(true); } else err.textContent="Nicht gebucht: "+((j&&j.error)||"unbekannt"); }).catch(function(){ err.textContent="Keine Verbindung."; });
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
/* „To-Do anlegen“ (KI, Mail, Kundenakte …) legt seit 20.10.2026 eine Aufgabe in „Aufträge“ an (ohne Auftrag; Anfrage → mit Kundenakte verknüpft) */
F.addTodo=function(t){ t=t||{}; return F.api("/admin/api/auftraege",{body:{op:"task.save",task:{title:String(t.text||"Aufgabe").slice(0,200),due:t.due||"",notes:t.notes||"",status:"offen",prio:t.prio||"normal",leadId:t.leadId||undefined}}})
  .then(function(j){ if(j&&j.ok&&j.data&&F.D){ F.D.auftraege=j.data; F.render(); return Object.assign({},j,{todos:[]}); } F.toast((j&&j.error)||"Aufgabe konnte nicht angelegt werden",true); return j; }); };

/* ---------- Steuerliche Regel bei jeder Beleganlage (Scan/Upload, Mail-Anhang, Zahlung, Bankumsatz) ----------
   IDs wie sevDesk Update 2.0 – die UVA rechnet daraus Vorsteuer, ig. Erwerb und Reverse Charge.
   Bei ig. Erwerb und Reverse Charge steht auf der Rechnung keine österr. USt: Beleg mit 0 %, die 20 % rechnet die UVA selbst (Server erzwingt das auch). */
F.TAXRULES=[["9","Vorsteuer abziehbar","Rechnung mit österr. USt – der Normalfall · UVA: Vorsteuer KZ 060"],
  ["10","Keine Vorsteuer","USt nicht abziehbar, z. B. Pkw, privat mitveranlasst, Eigenbeleg, Kleinunternehmer · UVA: keine Kennzahl"],
  ["8","Innergemeinschaftlicher Erwerb","Ware aus der EU ohne USt (z. B. Print.com, Geiger) – Erwerbsteuer und Vorsteuer je 20 % · UVA: KZ 070/072 + Vorsteuer 065, Zahllast unverändert"],
  ["14","Reverse Charge EU","Dienstleistung einer EU-Firma ohne USt (z. B. Google, Meta, Canva) – Steuer und Vorsteuer je 20 % · UVA: KZ 057 + Vorsteuer 066"],
  ["12","Reverse Charge Drittland","Dienstleistung aus Nicht-EU ohne USt (z. B. USA, Schweiz) – Steuer und Vorsteuer je 20 % · UVA: KZ 057 + Vorsteuer 066"],
  ["13","Reverse Charge ohne Vorsteuer","Steuerschuld geht auf dich über, Vorsteuer nicht abziehbar · UVA: nur KZ 057"]];
F.taxRuleZero=function(r){ return ["8","12","13","14"].indexOf(String(r||""))>-1; };
F.taxRuleName=function(r){ var x=F.TAXRULES.filter(function(t){ return t[0]===String(r); })[0]; return x?x[1]:""; };
F.taxRuleHint=function(r){ var x=F.TAXRULES.filter(function(t){ return t[0]===String(r); })[0]; return x?x[2]+(F.taxRuleZero(r)?" · Beleg mit 0 % USt":""):""; };
F.taxRuleOk=function(r){ return F.TAXRULES.some(function(t){ return t[0]===String(r||""); }); };
/* attr: z. B. 'name="rule" data-rate="[name=tax]"' – data-rate: USt-Satz-Feld im selben Formular, das bei ig. Erwerb/RC auf 0 % springt */
/* opt.empty: Text für „keine Regel“ (z. B. bestehender Beleg ohne Regel) – dann ist leer erlaubt und vorausgewählt, wenn sel leer ist */
F.taxRuleSelect=function(attr,sel,opt){ opt=opt||{}; sel=F.taxRuleOk(sel)?String(sel):(opt.empty?"":"9");
  return '<label class="fl trl"><span>Steuerliche Regel</span><select class="f" '+(attr||"")+' data-taxrule>'+(opt.empty?'<option value=""'+(sel===""?" selected":"")+'>'+esc(opt.empty)+'</option>':'')+F.TAXRULES.map(function(t){ return '<option value="'+t[0]+'"'+(t[0]===sel?" selected":"")+'>'+esc(t[1])+'</option>'; }).join("")+'</select><span class="muted small trh">'+esc(sel?F.taxRuleHint(sel):(opt.emptyHint||""))+'</span></label>'; };
F.taxRuleSync=function(el){ var h=el.parentNode&&el.parentNode.querySelector(".trh"); if(h) h.textContent=F.taxRuleHint(el.value);
  var rs=el.getAttribute("data-rate"), box=el.closest("form,.kq,.pay-belf"), all=rs&&box?box.querySelectorAll(rs):[]; if(!all.length) return;
  Array.prototype.forEach.call(all,function(r){   /* mehrere Positionen: jede USt-Auswahl im Formular */
    if(F.taxRuleZero(el.value)){ if(r.value!=="0"){ r.value="0"; r.dispatchEvent(new Event("change",{bubbles:true})); } r.disabled=true; r.title="Bei dieser Regel steht keine österr. USt auf der Rechnung"; }
    else if(!el.hasAttribute("data-keepdis")){ r.disabled=false; r.title=""; } }); };
F.listen("change","select[data-taxrule]",function(el){ F.taxRuleSync(el); });
F.css(".trl .trh{display:block;margin-top:4px;line-height:1.35}.irow .irdisc{grid-column:1/-1;font-size:12px;color:var(--ink-3);margin-top:-2px}");
})();
