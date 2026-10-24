/* Zahlungsaufträge (Finanzen → Bank & Kasse → Zahlungsaufträge, Wunsch Simon 20.10.2026):
   ausgehende Überweisungen erfassen – von Hand, aus einer Mail oder direkt aus dem Rechnungs-Anhang (KI liest Empfänger, IBAN, Betrag, Referenz, Fälligkeit) –
   und dann „In George freigeben“ (Enable Banking legt die Überweisung an, Simon bestätigt sie in George), per QR-Code mit der George-App scannen
   oder als SEPA-Datei hochladen. Bezahlt wird automatisch erkannt, sobald die Abbuchung im Konto ist.
   Daten: /admin/api/fin/pay (GET Liste; POST op: save|delete|paid|qr|sepa|bank|extract). Öffentlich: F.payPage(), F.payFromMail(mail, anhang|null), Aktion paynew. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.pay=F.icons.pay||'<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>';
var PAY=null, busy=false, at=0, SEL={};
UI.payF=UI.payF||"offen";
var ST={entwurf:["Unvollständig","draft"],bereit:["Bereit","open"],bank:["Freigabe in George","due"],ausgefuehrt:["Ausgeführt","part"],bezahlt:["Bezahlt","paid"],abgelehnt:["Abgelehnt","due"],storniert:["Storniert","grey"]};
var OPENST={entwurf:1,bereit:1,abgelehnt:1};
function load(){ if(busy) return; busy=true; F.api("/admin/api/fin/pay").then(function(j){ busy=false; at=Date.now(); PAY=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler",orders:[],bank:{}}; F.render(); }).catch(function(){ busy=false; PAY={ok:false,error:"Nicht erreichbar",orders:[],bank:{}}; F.render(); }); }
function api(body){ return F.api("/admin/api/fin/pay",{body:body}).then(function(j){ if(!j||!j.ok) F.toast((j&&j.error)||"Fehler",true); return j; }); }
function eur(n){ return F.eur(+n||0); }
function ibanFmt(v){ return String(v||"").replace(/(.{4})/g,"$1 ").trim(); }
/* gleiche Prüfung wie am Server (Prüfziffer mod 97) – für die Anzeige im Formular */
function ibanOk(v){ var s=String(v||"").replace(/[\s-]/g,"").toUpperCase(); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false; var r=(s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,function(c){ return String(c.charCodeAt(0)-55); }), m=0; for(var i=0;i<r.length;i+=7) m=Number(String(m)+r.slice(i,i+7))%97; return m===1; }
function today(){ return (F.D&&F.D.today)||F.ymd(); }
function list(){ var o=(PAY&&PAY.orders)||[]; if(UI.payF==="offen") return o.filter(function(x){ return ["entwurf","bereit","bank","ausgefuehrt","abgelehnt"].indexOf(x.status)>-1; }); if(UI.payF==="bezahlt") return o.filter(function(x){ return x.status==="bezahlt"; }); return o; }
function head(t,sub,btns){ return '<div class="fsd-head"><div><h1>'+t+'</h1>'+(sub?'<p>'+sub+'</p>':'')+'</div><div class="fsd-btns">'+(btns||"")+'</div></div>'; }

F.payPage=function(){
  if(!PAY||Date.now()-at>60000) load();
  if(!PAY) return head("Zahlungsaufträge","Lade …","");
  var all=PAY.orders||[], L=list(), b=PAY.bank||{}, open=all.filter(function(x){ return OPENST[x.status]||x.status==="bank"; }), sum=open.reduce(function(s,x){ return s+(+x.amount||0); },0);
  var sel=Object.keys(SEL).filter(function(k){ return SEL[k]&&all.some(function(x){ return x.id===k&&OPENST[x.status]; }); });
  var t=today();
  var info=b.ok?'<div class="pay-info ok">'+F.svg("check")+'<span><b>In George freigeben ist aktiv</b> ('+esc(b.bank||"")+(b.iban?" · "+esc(ibanFmt(b.iban)):"")+'). Die Überweisung wird angelegt, du bestätigst sie in George – ohne deine Bestätigung wird nichts ausgeführt.</span></div>'
    :'<div class="pay-info">'+F.svg("alert")+'<span><b>Freigabe direkt in George ist noch nicht verfügbar</b>'+(b.reason?" – "+esc(b.reason):"")+'. Bis dahin: <b>QR-Code</b> mit der George-App scannen oder die <b>SEPA-Datei</b> hochladen.</span></div>';
  var chips='<div class="chips">'+[["offen","Offen"],["bezahlt","Bezahlt"],["alle","Alle"]].map(function(c){ return '<button type="button" class="chip" data-act="payf:'+c[0]+'" aria-pressed="'+(UI.payF===c[0])+'">'+c[1]+'</button>'; }).join("")+'</div>';
  /* Liste statt Tabelle: passt auch neben Finanz-Menü und Statusleiste (kein Abschneiden rechts) */
  var rows=L.map(function(o){ var s=ST[o.status]||[o.status,"grey"], late=o.date&&o.date<t&&["bereit","entwurf"].indexOf(o.status)>-1, canSel=OPENST[o.status]&&!(o.problems||[]).length;
    return '<div class="pay-r" data-act="payedit:'+esc(o.id)+'" role="button" tabindex="0">'+
      '<span class="pay-ck" data-noact>'+(canSel?'<input type="checkbox" data-paysel="'+esc(o.id)+'"'+(SEL[o.id]?" checked":"")+' aria-label="Für SEPA-Datei auswählen">':'')+'</span>'+
      '<span class="pay-who"><b>'+esc(o.name||"—")+'</b><small>'+esc(ibanFmt(o.iban)||"IBAN fehlt")+'</small></span>'+
      '<span class="pay-why"><span>'+esc(o.reference?"Ref. "+o.reference:(o.text||"—"))+'</span>'+((o.problems||[]).length?'<small class="bad-t">'+esc(o.problems[0])+'</small>':o.source&&o.source.kind==="mail"?'<small>📧 '+esc(o.source.subject||"aus Mail")+(o.voucherId?' · 📄 Beleg angelegt':'')+'</small>':o.voucherId?'<small>📄 Beleg angelegt</small>':'')+'</span>'+
      '<span class="pay-when'+(late?" bad-t":"")+'">'+(o.date?esc(F.de(o.date)):'<span class="muted">sofort</span>')+'</span>'+
      '<span class="pay-amt"><b class="num">'+eur(o.amount)+'</b><span class="fsd-pill '+s[1]+'">'+esc(s[0])+'</span></span>'+
      '<span class="pay-acts" data-noact>'+(o.status==="bereit"&&b.ok?'<button type="button" class="btn primary sm" data-act="paybank:'+esc(o.id)+'">In George freigeben</button>':'')+
        (o.status==="bereit"?'<button type="button" class="btn sm" data-act="payqr:'+esc(o.id)+'" title="QR-Code für die George-App">QR</button>':'')+
        (o.status==="bank"?'<small class="muted">in George bestätigen</small>':'')+'</span></div>'; }).join("");
  return head("Zahlungsaufträge",open.length?open.length+" offen · "+eur(sum):"Überweisungen erfassen und in George freigeben",
      (sel.length?'<button class="btn" data-act="paysepa">SEPA-Datei ('+sel.length+')</button>':'')+'<button class="btn primary" data-act="paynew">+ Zahlung erfassen</button>')+
    info+chips+
    (L.length?'<div class="pay-l">'+rows+'</div>'
      :'<div class="sd-empty">'+(UI.payF==="offen"?"Keine offenen Zahlungen. Im Postfach bei einer Rechnung auf „Zahlung erfassen“ (Kartensymbol) klicken – die KI füllt alles aus.":"Keine Einträge.")+'</div>');
};

/* ---------- Erfassen / Bearbeiten ---------- */
var DR=null, ATT=null, BEL=null;   /* ATT {m,a}: Zahlung aus einem Mail-Anhang → dort zusätzlich „Auch als Beleg anlegen (offen)“; BEL: KI-Auslesung als Beleg */
function belegHtml(o){ if(!ATT||!ATT.a) return "";
  var b=BEL||{}, M=F.M||{}, sent=M.voucherSent?M.voucherSent(ATT.m,ATT.a):null, dup=(b.dupes||[]).length, on=!sent&&!dup;
  var lines=(b.lines||[]).filter(function(l){ return l.gross>0; }), rate=lines.length===1?lines[0].rate:BEL?(b.tax>0?20:0):20; rate=[20,13,10,0].indexOf(rate)>-1?rate:20;
  var g=b.gross>0&&(!b.currency||b.currency==="EUR")?b.gross:(o.amount||"");
  return '<div class="pay-bel"><label class="row" style="gap:10px"><input type="checkbox" name="mkbeleg"'+(on?" checked":"")+' style="width:18px;height:18px"> <b>Auch als Beleg anlegen (offen)</b> <span class="muted small">– mit „'+esc(ATT.a.filename||"Anhang")+'“</span></label>'+
    (sent?'<div class="notice"><span>Dieser Anhang ist schon als Beleg erfasst ('+esc(new Date(sent.at).toLocaleDateString("de-AT"))+').</span></div>':'')+(dup&&F.KI&&F.KI.dupesHtml?F.KI.dupesHtml(b.dupes):'')+
    '<div class="pay-belf"><div class="grid2"><label class="fl">Lieferant<input class="f" name="bsupplier" value="'+esc(b.supplier||o.name||"")+'"></label><label class="fl">Belegdatum<input class="f" type="date" name="bdate" value="'+esc(b.invoiceDate||o.invoiceDate||today())+'"></label></div>'+
    '<div class="grid2"><label class="fl">Betrag brutto (€)<input class="f num" name="bgross" inputmode="decimal" value="'+esc(g?String(g).replace(".",","):"")+'"></label><label class="fl">USt-Satz<select class="f" name="btax">'+[20,13,10,0].map(function(r){ return '<option value="'+r+'"'+(r===rate?" selected":"")+'>'+r+' %</option>'; }).join("")+'</select></label></div>'+
    F.taxRuleSelect('name="brule" data-rate="[name=btax]"',b.taxRule)+
    '<label class="fl">Kategorie<select class="f" name="bcat"><option value="">Kategorien werden geladen …</option></select></label>'+
    '<label class="fl">Beschreibung<input class="f" name="bdesc" maxlength="200" value="'+esc(String((b.description||ATT.m.subject||"")+(b.invoiceNumber&&String(b.description||"").indexOf(b.invoiceNumber)<0?" · Nr. "+b.invoiceNumber:"")).slice(0,200))+'"></label>'+
    (BEL?'':'<p class="muted small" style="margin:0">Belegdaten bitte kurz prüfen (KI-Auslesung nicht verfügbar).</p>')+'</div></div>'; }
function belegCats(){ var sel=document.querySelector('form[data-form="paysave"] [name=bcat]'); if(!sel) return;
  F.loadMeta(function(meta){ if(!document.body.contains(sel)) return; if(meta&&meta.error){ sel.innerHTML='<option value="">Kategorien nicht verfügbar</option>'; return; }
    var ts=(meta&&meta.accountingTypes)||[], last=""; try{ last=String(localStorage.getItem("fsc_sev_cat")||"").replace(/^"|"$/g,""); }catch(e){}
    var used=ts.filter(function(t){ return t.used>0; }), rest=ts.filter(function(t){ return !(t.used>0); }), opt=function(t){ return '<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>'; };
    sel.innerHTML='<option value="">Kategorie wählen …</option>'+(used.length?'<optgroup label="Häufig verwendet">'+used.map(opt).join("")+'</optgroup>':'')+'<optgroup label="Alle Kategorien">'+rest.map(opt).join("")+'</optgroup>';
    var pre=BEL&&BEL.accountingTypeId; if(pre&&ts.some(function(t){ return t.id===pre; })) sel.value=pre; else if(last&&ts.some(function(t){ return t.id===last; })) sel.value=last; }); }
function form(o,x){ o=o||{}; x=x||{};
  var warn=(x.alreadyPaid?'<div class="notice" style="background:var(--warn-soft)"><span><b>Laut Rechnung schon bezahlt bzw. per Lastschrift/Karte</b> – bitte prüfen, ob du überhaupt überweisen musst.</span></div>':'')+
    (x.isPayable===false?'<div class="notice"><span>Das sieht nicht nach einer Zahlungsaufforderung aus.</span></div>':'')+(x.notes?'<p class="muted small" style="margin:0">KI-Hinweis: '+esc(x.notes)+'</p>':'');
  var editable=!o.status||OPENST[o.status];
  F.modal('<form data-form="paysave" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+(o.id?"Zahlung":"Neue Zahlung")+'</h2>'+F.btnClose()+'</div>'+warn+
    (o.source&&o.source.kind==="mail"?'<p class="muted small" style="margin:0">📧 Aus Mail: '+esc(o.source.subject||"")+(o.source.filename?" · "+esc(o.source.filename):"")+'</p>':'')+
    '<div class="grid2"><label class="fl">Empfänger<input class="f" name="name" required maxlength="70" value="'+esc(o.name||"")+'"'+(editable?"":" disabled")+'></label>'+
    '<label class="fl">Betrag (€)<input class="f num" name="amount" required inputmode="decimal" value="'+esc(o.amount?String(o.amount).replace(".",","):"")+'"'+(editable?"":" disabled")+'></label></div>'+
    '<div class="grid2"><label class="fl">IBAN<input class="f" name="iban" required autocomplete="off" spellcheck="false" value="'+esc(ibanFmt(o.iban||""))+'"'+(editable?"":" disabled")+'><span class="small" id="payIbanOk"></span></label>'+
    '<label class="fl"><span>BIC <span class="muted small">(optional)</span></span><input class="f" name="bic" maxlength="11" autocomplete="off" value="'+esc(o.bic||"")+'"'+(editable?"":" disabled")+'></label></div>'+
    '<div class="grid2"><label class="fl"><span>Zahlungsreferenz <span class="muted small">(vom Zahlschein)</span></span><input class="f" name="reference" maxlength="35" value="'+esc(o.reference||"")+'"'+(editable?"":" disabled")+'></label>'+
    '<label class="fl">oder Verwendungszweck<input class="f" name="text" maxlength="140" value="'+esc(o.text||"")+'" placeholder="z. B. Rechnung 2026-123"'+(editable?"":" disabled")+'></label></div>'+
    '<div class="grid2"><label class="fl"><span>Fällig am <span class="muted small">(leer = sofort)</span></span><input class="f" type="date" name="date" value="'+esc(o.date||"")+'"'+(editable?"":" disabled")+'></label>'+
    '<label class="fl"><span>Rechnungsnummer <span class="muted small">(optional)</span></span><input class="f" name="invoiceNumber" maxlength="60" value="'+esc(o.invoiceNumber||"")+'"'+(editable?"":" disabled")+'></label></div>'+
    (!o.id?belegHtml(o):'')+
    '<label class="fl">Notiz<textarea class="f" name="note" rows="2" maxlength="1000">'+esc(o.note||"")+'</textarea></label>'+
    (o.history&&o.history.length?'<details><summary class="muted small">Verlauf</summary><div class="small muted" style="display:grid;gap:2px;margin-top:6px">'+o.history.slice().reverse().map(function(h){ return '<span>'+esc(new Date(h.at).toLocaleString("de-AT",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}))+' · '+esc(h.what)+'</span>'; }).join("")+'</div></details>':'')+
    '<div class="err" id="payErr"></div>'+
    '<div class="foot"><span class="row wrap">'+(o.id&&(OPENST[o.status]||o.status==="storniert")?'<button type="button" class="btn bad-t" data-act="paydel:'+esc(o.id)+'">Löschen</button>':'')+
      (o.id&&o.status!=="bezahlt"?'<button type="button" class="btn" data-act="paypaid:'+esc(o.id)+'">Als bezahlt markieren</button>':'')+(o.id&&o.status==="bezahlt"&&o.paid&&o.paid.manual?'<button type="button" class="btn" data-act="payunpaid:'+esc(o.id)+'">Doch nicht bezahlt</button>':'')+
      (o.source&&o.source.mailId?'<button type="button" class="btn" data-act="paymail:'+esc(o.source.mailId)+'">Mail öffnen</button>':'')+(o.voucherId?'<button type="button" class="btn" data-act="payvou">Beleg ansehen</button>':'')+'</span>'+
      '<span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">'+(editable?"Speichern":"Notiz speichern")+'</button></span></div></form>',"wide");
  ibanHint(); if(!o.id&&ATT&&ATT.a){ belegCats(); var rs=document.querySelector('form[data-form="paysave"] [name=brule]'); if(rs) F.taxRuleSync(rs); }
}
function ibanHint(){ var f=document.querySelector('form[data-form="paysave"]'), el=document.getElementById("payIbanOk"); if(!f||!el) return; var v=f.iban.value.trim(); el.className="small "+(v?(ibanOk(v)?"ok-t":"bad-t"):""); el.textContent=v?(ibanOk(v)?"✓ IBAN gültig":"✗ IBAN stimmt nicht (Prüfziffer)"):""; }
F.listen("input",'form[data-form="paysave"] [name="iban"]',ibanHint);
/* Betrag/Empfänger der Zahlung → Beleg mitziehen, solange dort nicht selbst etwas geändert wurde */
F.listen("input",'form[data-form="paysave"] [name="amount"],form[data-form="paysave"] [name="name"]',function(el){ var f=el.form, t=f&&f[el.name==="amount"?"bgross":"bsupplier"]; if(t&&t.getAttribute("data-own")!=="1"&&(!t.value||t.getAttribute("data-sync")==="1")){ t.value=el.value; t.setAttribute("data-sync","1"); } });
F.listen("input",'form[data-form="paysave"] [name="bgross"],form[data-form="paysave"] [name="bsupplier"]',function(el){ el.setAttribute("data-own","1"); });
F.listen("change",'form[data-form="paysave"] [name="mkbeleg"]',function(el){ var b=el.closest(".pay-bel"); if(b) b.classList.toggle("off",!el.checked); });
F.form("paysave",function(f){ var err=document.getElementById("payErr"), btn=f.querySelector("[type=submit]");
  var o=Object.assign({},DR||{},{name:f.name.value,amount:f.amount.value.replace(/\./g,"").replace(",","."),iban:f.iban.value,bic:f.bic.value,reference:f.reference.value.trim(),text:f.text.value.trim(),date:f.date.value,invoiceNumber:f.invoiceNumber.value,note:f.note.value});
  if(/^\d+(\.\d{1,2})?$/.test(String(f.amount.value).trim())) o.amount=f.amount.value.trim();   /* „12.50“ ist schon ein Punkt-Betrag */
  /* Beleg (offen) aus demselben Anhang: vorher prüfen, damit nichts halb gespeichert wird */
  var mk=f.mkbeleg&&f.mkbeleg.checked&&ATT&&ATT.a, vb=null;
  if(mk){ var bg=parseFloat(String(f.bgross.value).replace(/\./g,"").replace(",",".")); if(/^\d+(\.\d{1,2})?$/.test(String(f.bgross.value).trim())) bg=parseFloat(f.bgross.value);
    if(!(bg>0)){ err.textContent="Beleg: bitte den Betrag brutto eingeben."; f.bgross.focus(); return; }
    if(!f.bcat.value){ err.textContent="Beleg: bitte eine Kategorie wählen."; f.bcat.focus(); return; }
    var M=F.M||{}, m=ATT.m, a=ATT.a, lines=((BEL&&BEL.lines)||[]).filter(function(l){ return l.gross>0; });
    vb={mail:{folder:m.folder||"INBOX",uid:m.uid,index:a.index||0,account:M.accOf?M.accOf(m):(m.account||""),filename:a.filename},supplierName:f.bsupplier.value.trim()||f.name.value.trim(),date:f.bdate.value,description:f.bdesc.value.trim(),gross:bg,taxRate:parseFloat(f.btax.value),accountingTypeId:f.bcat.value,taxRule:f.brule?f.brule.value:undefined};
    if(lines.length>1){ var ps=0; lines.forEach(function(l){ ps+=+l.gross||0; }); if(Math.abs(ps-bg)<0.02) vb.positions=lines.map(function(l){ return {gross:l.gross,taxRate:l.rate}; }); }
    if(BEL&&BEL.deliveryFrom){ vb.deliveryDate=BEL.deliveryFrom; if(BEL.deliveryTo) vb.deliveryDateUntil=BEL.deliveryTo; }
    try{ localStorage.setItem("fsc_sev_cat",vb.accountingTypeId); }catch(e){} }
  btn.disabled=true; err.textContent=mk?"Speichere Zahlung und Beleg …":"";
  api({op:"save",order:o}).then(function(j){ if(!j||!j.ok){ btn.disabled=false; err.textContent=(j&&j.error)||"Fehler"; return; }
    var ord=j.order, msg=ord.status==="bereit"?"Zahlung bereit":"Zahlung gespeichert – "+((ord.problems||[])[0]||"noch unvollständig");
    var done=function(extra,bad){ F.closeModal(); F.toast(msg+(extra||""),bad||ord.status!=="bereit"); ATT=null; BEL=null; PAY=null; load(); };
    if(!vb){ done(); return; }
    F.api("/admin/api/sevdesk/voucher",{body:vb}).then(function(v){
      if(!v||!v.ok){ done(" · Beleg NICHT angelegt: "+((v&&v.error)||"Fehler"),true); return; }
      var M=F.M||{}, sk=F.ls("fsc_sev_sent")||{}; sk[ATT.m.id+"#"+(ATT.a.index||0)]={id:v.id,at:Date.now()}; F.ls("fsc_sev_sent",sk);
      api({op:"link",id:ord.id,voucherId:String(v.id||"")}).then(function(){ done(" · Beleg angelegt (offen)"); if(F.load) F.load(true); });
    }).catch(function(){ done(" · Beleg NICHT angelegt (keine Verbindung)",true); });
  }); });
F.action("payedit",function(id,el,e){ if(e&&e.target&&e.target.closest&&e.target.closest("[data-noact]")) return;   /* Klick aufs Häkchen öffnet nicht den Dialog */
  var o=((PAY&&PAY.orders)||[]).find(function(x){ return x.id===id; }); if(!o) return; DR={id:o.id}; form(o); });
F.listen("keydown",".pay-r",function(el,e){ if(e.target===el&&(e.key==="Enter"||e.key===" ")){ e.preventDefault(); F.actions.payedit(el.getAttribute("data-act").split(":")[1]); } });
F.action("payf",function(v){ UI.payF=v; F.render(); });
F.listen("change","[data-paysel]",function(el){ SEL[el.getAttribute("data-paysel")]=el.checked; F._forceRender=true; F.render(); });
F.action("paydel",function(id){ F.confirm("Diesen Zahlungsauftrag löschen?","Löschen",function(){ api({op:"delete",id:id,confirm:true}).then(function(j){ if(j&&j.ok){ F.closeModal(); F.toast("Gelöscht"); load(); } }); },true); });
F.action("paypaid",function(id){ api({op:"paid",id:id,on:true}).then(function(j){ if(j&&j.ok){ F.closeModal(); F.toast("Als bezahlt markiert"); load(); } }); });
F.action("payunpaid",function(id){ api({op:"paid",id:id,on:false}).then(function(j){ if(j&&j.ok){ F.closeModal(); load(); } }); });
F.action("paymail",function(id){ F.closeModal(); UI.msel=id; F.go("post"); });
F.action("payvou",function(){ F.closeModal(); UI.fin="vou:open"; F.go("geld"); });
F.action("paynew",function(){ DR=null; ATT=null; BEL=null; form({}); });

/* ---------- QR-Code (George-App scannen) ---------- */
F.action("payqr",function(id){ var o=((PAY&&PAY.orders)||[]).find(function(x){ return x.id===id; })||{};
  api({op:"qr",id:id}).then(function(j){ if(!j||!j.ok) return;
    F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:20px">QR-Code für George</h2>'+F.btnClose()+'</div>'+
      '<div class="pay-qr">'+j.svg+'</div>'+
      '<div class="pay-qrd"><b>'+esc(o.name)+'</b><span>'+esc(ibanFmt(o.iban))+'</span><span class="num"><b>'+eur(o.amount)+'</b></span><span class="muted">'+esc(o.reference?"Zahlungsreferenz "+o.reference:(o.text||""))+'</span></div>'+
      '<p class="muted small" style="margin:0">In der George-App die Überweisung per QR-Code/Scan starten und diesen Code scannen – Empfänger, IBAN, Betrag und Verwendungszweck sind dann ausgefüllt. Freigeben wie gewohnt in George.</p>'+
      '<div class="foot"><span></span><button type="button" class="btn" data-closemodal>Fertig</button></div></div>',"narrow"); }); });

/* ---------- SEPA-Datei ---------- */
F.action("paysepa",function(){ var ids=Object.keys(SEL).filter(function(k){ return SEL[k]; }); if(!ids.length) return;
  api({op:"sepa",ids:ids}).then(function(j){ if(!j||!j.ok) return; var b=new Blob([j.xml],{type:"application/xml"}), a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=j.name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
    F.toast(j.count+(j.count===1?" Zahlung":" Zahlungen")+" · "+eur(j.sum)+" – Datei in George hochladen und dort freigeben"); SEL={}; load(); }); });

/* ---------- In George freigeben ---------- */
F.action("paybank",function(id){ var o=((PAY&&PAY.orders)||[]).find(function(x){ return x.id===id; }); if(!o) return;
  F.confirm("Überweisung über "+eur(o.amount)+" an „"+o.name+"“ ("+ibanFmt(o.iban)+") in George anlegen? Danach öffnet sich George – dort bestätigst du die Zahlung. Ohne deine Bestätigung in George wird nichts überwiesen.","In George freigeben",function(){
    var w=null; try{ w=window.open("about:blank","_blank"); }catch(e){}
    api({op:"bank",id:id,confirm:true}).then(function(j){ if(!j||!j.ok){ if(w) w.close(); return; }
      if(w&&!w.closed) w.location.href=j.url; else location.href=j.url;
      F.toast("George geöffnet – bitte dort bestätigen"); load(); }); }); });

/* ---------- Aus Mail / Anhang ---------- */
F.payFromMail=function(m,a){ if(!m) return;
  var M=F.M||{}, acc=M.accOf?M.accOf(m):(m.account||"");
  var src={kind:"mail",mailId:m.id,account:acc,folder:m.folder||"INBOX",uid:m.uid||0,index:a?(a.index||0):null,filename:a?(a.filename||""):"",subject:m.subject||"",from:m.from||""};
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:20px">Zahlung erfassen</h2>'+F.btnClose()+'</div><p class="muted" style="margin:0">'+F.svg("spark")+' Die KI liest '+(a?"„"+esc(a.filename||"den Anhang")+"“":"die Mail")+' aus …</p></div>',"narrow");
  var text=a?"":(m.bodyHtml?String(m.body||"").replace(/<[^>]+>/g," "):String(m.body||m.preview||""));
  ATT=a?{m:m,a:a}:null; BEL=null;
  var pP=api({op:"extract",mail:{account:acc,folder:m.folder||"INBOX",uid:a?m.uid:null,index:a?(a.index||0):null,filename:a?a.filename:"",subject:m.subject,from:m.from,fromName:m.fromName,date:m.date},text:text}).catch(function(){ return null; });
  var pB=a&&F.KI&&F.KI.api?F.KI.api("beleg-extract",{mail:{folder:m.folder||"INBOX",uid:m.uid,index:a.index||0,account:acc,filename:a.filename},subject:m.subject,from:m.from,fromName:m.fromName,date:m.date}).then(function(j){ return j&&j.beleg?Object.assign({},j.beleg,{dupes:j.dupes||[]}):null; }).catch(function(){ return null; }):Promise.resolve(null);
  Promise.all([pP,pB]).then(function(r){ var j=r[0], x=(j&&j.ok&&j.x)||{}; BEL=r[1];
    if(!x.amount&&BEL&&BEL.gross>0&&(!BEL.currency||BEL.currency==="EUR")) x.amount=BEL.gross; if(!x.name&&BEL&&BEL.supplier) x.name=BEL.supplier; if(!x.invoiceNumber&&BEL&&BEL.invoiceNumber) x.invoiceNumber=BEL.invoiceNumber;
    DR={source:src}; form({name:x.name,iban:x.iban,bic:x.bic,amount:x.amount,reference:x.reference,text:x.text||(x.invoiceNumber&&!x.reference?"Rechnung "+x.invoiceNumber:""),date:x.date,invoiceNumber:x.invoiceNumber,invoiceDate:x.invoiceDate,source:src},j&&j.ok?x:{notes:"Zahlungsdaten automatisch auslesen ging nicht – bitte von Hand ausfüllen."});
  }); };
F.action("mpay",function(v){ var i=v.indexOf("|"), M=F.M||{}, m=M.find&&M.find(v.slice(0,i)); if(!m) return; var a=(m.attachments||[]).find(function(x){ return String(x.index||0)===v.slice(i+1); }); F.payFromMail(m,a||null); });

/* Rückkehr aus George (…/admin?zahlung=status#geld) → Zahlungsaufträge zeigen */
(function(){ try{ var q=new URLSearchParams(location.search), st=q.get("zahlung"); if(!st) return; history.replaceState(null,"",location.pathname+location.hash);
  UI.fin="pay"; setTimeout(function(){ F.toast(st==="bank"?"In George freigegeben – wird ausgeführt":st==="ausgefuehrt"?"Überweisung ausgeführt ✓":st==="bereit"?"In George nicht freigegeben – Zahlung ist wieder bereit":st==="abgelehnt"?"Die Bank hat die Zahlung abgelehnt":"Status unklar – bitte in George prüfen",st!=="bank"&&st!=="ausgefuehrt"); },1500); }catch(e){} })();

F.feed(function(){ var o=((PAY&&PAY.orders)||[]), t=today(), due=o.filter(function(x){ return x.status==="bereit"&&x.date&&x.date<=F.addDays(t,2); });
  if(!PAY&&F.current==="heute"&&!busy&&Date.now()-at>300000) load();
  return due.length?[{id:"pay-due-"+due.length,rank:2,sev:due.some(function(x){ return x.date<t; })?"bad":"warn",icon:"euro",tag:["warn","Zahlung"],t:due.length===1?"Zahlung fällig: "+due[0].name+" · "+eur(due[0].amount):due.length+" Zahlungen fällig · "+eur(due.reduce(function(s,x){ return s+x.amount; },0)),d:"bis "+F.de(due.map(function(x){ return x.date; }).sort()[0])+" – in George freigeben",acts:[["Ansehen","fin:pay","primary"]]}]:[]; });

F.css('form[data-form="paysave"] .grid2{align-items:end}.pay-bel{display:grid;gap:10px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--sunk)}.pay-bel.off .pay-belf{opacity:.45;pointer-events:none}.pay-belf{display:grid;gap:10px}.pay-info{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--warn-soft);color:var(--ink);font-size:13.5px;line-height:1.45}.pay-info.ok{background:var(--ok-soft)}.pay-info svg{width:18px;height:18px;flex:none;margin-top:1px}'+
  '.pay-l{display:grid;border:1px solid var(--line);border-radius:var(--r,14px);background:var(--panel);overflow:hidden}'+
  '.pay-r{display:grid;grid-template-columns:28px minmax(0,1.3fr) minmax(0,1.2fr) 92px 128px auto;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);cursor:pointer}.pay-r:first-child{border-top:0}.pay-r:hover{background:var(--sunk)}'+
  '.pay-r small{display:block;font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pay-who,.pay-why{min-width:0;display:grid}.pay-who b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pay-why>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.pay-when{font-size:13.5px;white-space:nowrap}.pay-amt{display:grid;justify-items:end;gap:3px}.pay-amt b{font-size:15px}'+
  '.pay-ck input{width:17px;height:17px}.pay-acts{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}'+
  '@container fsdw (max-width:1100px){.pay-r{grid-template-columns:28px minmax(0,1fr) 120px;row-gap:6px}.pay-why{grid-column:2}.pay-when{grid-column:3;grid-row:2;text-align:right}.pay-amt{grid-column:3;grid-row:1}.pay-acts{grid-column:2/-1;justify-content:flex-start}}'+
  '@media (max-width:900px){.pay-r{grid-template-columns:28px minmax(0,1fr) auto;row-gap:6px}.pay-why{grid-column:2}.pay-when{grid-column:3;grid-row:2;text-align:right}.pay-amt{grid-column:3;grid-row:1}.pay-acts{grid-column:2/-1;justify-content:flex-start}}'+
  '.pay-qr{display:grid;place-items:center;background:#fff;border-radius:14px;padding:14px}.pay-qr svg{width:min(280px,100%);height:auto}'+
  '.pay-qrd{display:grid;gap:2px;text-align:center}');
})();
