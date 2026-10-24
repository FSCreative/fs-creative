/* Buchhaltung im Cockpit (Dateiname historisch): Rechnungen (Detail, senden, mahnen, stornieren, Entwurf bearbeiten), Bank zuordnen, Belege, Kontakte & Artikel.
   Unterpunkte von „Finanzen“. Alles Schreibende läuft über /admin/api/sev/* mit confirm:true. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;
var S={bank:null,vou:{},ct:null,parts:null,det:{},busy:{}};
F.UI.rgF=F.UI.rgF||"todo"; F.UI.rgQ=F.UI.rgQ||""; F.UI.bkAcc=F.UI.bkAcc||"all"; F.UI.vF=F.UI.vF||"all"; F.UI.vQ=F.UI.vQ||""; F.UI.stT=F.UI.stT||"kontakte"; F.UI.ctQ=F.UI.ctQ||""; F.UI.ctF=F.UI.ctF||"all"; F.UI.ptQ=F.UI.ptQ||"";
F.sevState=S;

F.css(
  '.sd-chk{margin-top:8px;padding:8px 10px;border-radius:10px;background:var(--warn-soft);border:1px solid var(--warn);color:var(--ink)}.sd-chk.hint{background:var(--sunk);border-color:var(--line)}.sd-chk span{color:var(--ink-2)}.sd-chk .btn{margin-top:6px;display:block}.sd-tax{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--sunk)}.sd-tax .trl{margin:0}.sd-tax>.btn{justify-self:start}.sd-uva{line-height:1.45}.sd-uva span{color:var(--ink-3)}'+
'.sdsig{display:grid;gap:6px}.sdsig-pv{width:100%;height:150px;border:1px solid var(--line);border-radius:10px;background:#fff}'+
'.drawer.xl{width:min(900px,100%)}'+
'.sd-list{display:grid}'+
'.sd-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);cursor:pointer;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;font:inherit;color:inherit;width:100%}'+
'.sd-row:first-child{border-top:0}.sd-row:hover{background:var(--sunk)}'+
'.sd-row .t{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sd-row .s{font-size:13px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.sd-row .r{text-align:right;display:grid;gap:3px;justify-items:end}.sd-row .amt{font-family:var(--f-mono,ui-monospace,monospace);font-weight:650}'+
'.sd-row .acts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}'+
'.sd-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line)}'+
'.sd-tools input.f{max-width:260px}'+
'.sd-hero{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end;justify-content:space-between;padding:4px 0 2px}'+
'.sd-hero .big{font-size:30px;font-weight:700;font-family:var(--f-mono,ui-monospace,monospace);letter-spacing:-.02em}'+
'.sd-acts{display:flex;flex-wrap:wrap;gap:8px}'+
'.sd-pdf{width:100%;height:560px;border:1px solid var(--line);border-radius:12px;background:var(--sunk)}'+
'.sd-pos{width:100%;border-collapse:collapse;font-size:14px}.sd-pos td,.sd-pos th{padding:7px 6px;border-bottom:1px solid var(--line);text-align:left}.sd-pos .r{text-align:right;white-space:nowrap}'+
'.sd-sug{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ok,#2e8b57);background:var(--ok-soft,#e6f4ea);color:var(--ink);border-radius:99px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}'+
'.sd-sug .m{color:var(--ink-3);font-weight:500}'+
'.sd-tx{padding:14px 16px;border-top:1px solid var(--line);display:grid;gap:8px}.sd-tx:first-child{border-top:0}'+
'.sd-tx .top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px}.sd-tx .amt{font-family:var(--f-mono,ui-monospace,monospace);font-weight:700;font-size:16px}'+
'.sd-tx.gone{opacity:.35;pointer-events:none;transition:opacity .3s}'+
'.sd-pick{display:grid;max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:12px}'+
'.sd-pick button{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border:0;border-top:1px solid var(--line);background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}.sd-pick button:first-child{border-top:0}.sd-pick button:hover{background:var(--sunk)}'+
'.sd-vrow{display:grid;grid-template-columns:84px 110px minmax(0,1fr) 34px;gap:6px;align-items:start;padding:8px;border:1px solid var(--line);border-radius:12px}.sd-vrow [data-v=cat]{grid-column:1/-1}@media (max-width:900px){.sd-vrow{grid-template-columns:96px minmax(0,1fr) 40px}.sd-vrow input.cm{grid-column:1/-1;order:9}}'+'.drawer .foot{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center}'+
'.sd-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}'+
'.sd-empty{padding:28px 18px;text-align:center;color:var(--ink-3)}.sd-empty b{display:block;color:var(--ink);font-size:16px;margin-bottom:4px}'+
'.sd-steps{display:flex;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-3)}.sd-steps span{padding:3px 9px;border-radius:99px;background:var(--sunk)}.sd-steps span.on{background:var(--glow-soft);color:var(--glow-ink);font-weight:650}'+
'@media (max-width:760px){.sd-split{grid-template-columns:minmax(0,1fr)}.sd-pdf{height:420px}}'
);

function load(key,url,cb){
  if(S.busy[key]) return; S.busy[key]=1;
  F.api(url).then(function(j){ S.busy[key]=0; cb(j||{ok:false,error:"keine Antwort"}); F.render(); }).catch(function(){ S.busy[key]=0; cb({ok:false,error:"Keine Verbindung"}); F.render(); });
}
function loading(t){ return '<div class="sd-empty">'+esc(t||"Lade …")+'</div>'; }
function errBox(j,act){ return '<div class="notice"><span>'+esc((j&&j.error)||"Fehler")+'</span><button class="btn" data-act="'+act+'">Erneut laden</button></div>'; }
function chip(act,k,cur,label,n){ return '<button class="chip" data-act="'+act+':'+k+'" aria-pressed="'+(cur===k)+'">'+label+(n!=null?' · '+n:'')+'</button>'; }
function post(url,body){ body.confirm=true; return F.api(url,{body:body}); }
function fail(j){ F.toast((j&&j.error)||"Fehler",true); }
function refreshAll(){ S.bank=null; S.vou={}; F.load(true); }
F.sevRefresh=refreshAll;

/* ================= Rechnungen ================= */
function invStatus(i){
  if(i.status===100) return ['grey','Entwurf'];
  if(i.overdue) return ['bad','überfällig'];
  if(i.status===1000) return ['ok','bezahlt'];
  if(i.status===750) return ['warn','teilbezahlt'];
  if(i.status===200) return [i.sent?'warn':'info',i.sent?'offen':'offen · nicht versendet'];
  return ['grey',String(i.status)];
}
function invTag(i){ var s=invStatus(i); return '<span class="tag '+s[0]+'">'+esc(s[1])+'</span>'; }
function invQuick(i){
  if(i.status===100) return '<button class="btn primary" data-act="sdsend:'+esc(i.id)+'">Senden</button>';
  if(i.overdue) return '<button class="btn" data-act="sdremind:'+esc(i.id)+'">Mahnen</button><button class="btn" data-act="book:'+esc(i.id)+'">Zahlung</button>';
  if(i.open>0.005) return '<button class="btn" data-act="book:'+esc(i.id)+'">Zahlung</button>';
  return '';
}
F.sevInvRow=function(i){
  return '<div class="sd-row" role="button" tabindex="0" data-act="sdinv:'+esc(i.id)+'"><div style="min-width:0"><div class="t">'+esc(i.contact||"—")+'</div><div class="s">'+esc((i.nr||"Entwurf")+" · "+deShort(i.date)+(i.header&&i.header!=="Rechnung"?" · "+i.header:"")+(i.status!==100&&i.open>0.005&&i.due?" · fällig "+deShort(i.due):""))+'</div></div>'+
    '<div class="r"><span class="amt">'+eur(i.gross)+'</span>'+invTag(i)+'</div>'+
    (invQuick(i)?'<div class="acts">'+invQuick(i)+'</div>':'')+'</div>';
};
F.action("sdrgf",function(k){ F.UI.rgF=k; F.UI.rgMore=0; F.render(); });
F.action("sdrgmore",function(){ F.UI.rgMore=(F.UI.rgMore||0)+50; F.render(); });
F.listen("input","[data-rgq]",function(el){ F.UI.rgQ=el.value; clearTimeout(el._d); el._d=setTimeout(F.render,250); });
function renderRechnungen(){
  var sev=F.D.sev; if(!sev) return '<div class="notice">Die Buchhaltungsdaten konnten gerade nicht geladen werden. <button class="btn" data-act="reload">Neu laden</button></div>';
  var inv=sev.invoices.filter(function(i){ return i.type!=="SR"; }), q=(F.UI.rgQ||"").toLowerCase(), f=F.UI.rgF;
  var cnt={todo:0,draft:0,open:0,over:0,paid:0};
  inv.forEach(function(i){ if(i.status===100) cnt.draft++; if(i.open>0.005&&i.status!==100) cnt.open++; if(i.overdue) cnt.over++; if(i.status===1000) cnt.paid++; if(i.status===100||i.overdue||(i.status===200&&!i.sent)) cnt.todo++; });
  var list=inv.filter(function(i){
    if(f==="todo"&&!(i.status===100||i.overdue||(i.status===200&&!i.sent))) return false;
    if(f==="draft"&&i.status!==100) return false; if(f==="open"&&!(i.open>0.005&&i.status!==100)) return false; if(f==="over"&&!i.overdue) return false; if(f==="paid"&&i.status!==1000) return false;
    return !q||(i.nr+" "+i.contact+" "+(i.header||"")+" "+(i.ref||"")+" "+i.gross).toLowerCase().indexOf(q)>-1;
  });
  if(f==="todo") list.sort(function(a,b){ var r=function(i){ return i.overdue?0:i.status===100?1:2; }; return r(a)-r(b)||String(b.date).localeCompare(String(a.date)); });
  var lim=60+(F.UI.rgMore||0), more=Math.max(0,list.length-lim);
  var openSum=inv.reduce(function(s,i){ return s+(i.status!==100?i.open:0); },0), overSum=inv.reduce(function(s,i){ return s+(i.overdue?i.open:0); },0), draftSum=inv.reduce(function(s,i){ return s+(i.status===100?i.gross:0); },0);
  return '<div class="kpis">'+
      '<button class="panel kpi" data-act="sdrgf:draft"><span class="k">Entwürfe</span><span class="v num">'+cnt.draft+'</span><span class="s">'+eur0(draftSum)+' noch nicht gestellt</span></button>'+
      '<button class="panel kpi" data-act="sdrgf:open"><span class="k">Offen</span><span class="v num">'+eur0(openSum)+'</span><span class="s">'+cnt.open+' Rechnungen</span></button>'+
      '<button class="panel kpi" data-act="sdrgf:over"><span class="k">Überfällig</span><span class="v num'+(overSum?" bad-t":"")+'">'+eur0(overSum)+'</span><span class="s">'+cnt.over+' Rechnungen</span></button>'+
      '<div class="panel kpi"><span class="k">Bezahlt '+esc(F.D.year)+'</span><span class="v num">'+eur0(inv.filter(function(i){return i.status===1000&&String(i.date||"").slice(0,4)===String(F.D.year);}).reduce(function(s,i){return s+i.gross;},0))+'</span><span class="s">'+cnt.paid+' insgesamt</span></div>'+
    '</div>'+
    '<section class="panel"><div class="sd-tools"><div class="chips">'+chip("sdrgf","todo",f,"Zu erledigen",cnt.todo)+chip("sdrgf","draft",f,"Entwürfe",cnt.draft)+chip("sdrgf","open",f,"Offen",cnt.open)+chip("sdrgf","over",f,"Überfällig",cnt.over)+chip("sdrgf","paid",f,"Bezahlt")+chip("sdrgf","all",f,"Alle")+'</div>'+
    '<input class="f" placeholder="Suchen: Kunde, Nr., Betrag …" data-rgq data-keepfocus="rgq" value="'+esc(F.UI.rgQ)+'" aria-label="Rechnungen suchen"></div>'+
    '<div class="sd-list">'+(list.slice(0,lim).map(F.sevInvRow).join("")||(f==="todo"?'<div class="sd-empty"><b>Alles erledigt 🎉</b>Keine Entwürfe, nichts Überfälliges.</div>':'<div class="sd-empty">Keine Rechnungen in dieser Ansicht.</div>'))+'</div>'+
    (more?'<button class="more" data-act="sdrgmore">Weitere '+Math.min(50,more)+' anzeigen ('+more+' übrig)</button>':'')+'</section>';
}

/* --- Detail (Seitenleiste) --- */
function openInv(id){
  var d=document.getElementById("drawer"); d.classList.add("xl");
  F.openDrawer(drawerHead("Rechnung","…")+loading(),null);
  F.api("/admin/api/sev/invoice?id="+encodeURIComponent(id)).then(function(j){
    if(!j||!j.ok){ F.openDrawer(drawerHead("Rechnung","")+errBox(j,"sdinv:"+id)); return; }
    S.det[id]=j; F.openDrawer(invHtml(j));
  }).catch(function(){ F.openDrawer(drawerHead("Rechnung","")+'<div class="notice">Keine Verbindung.</div>'); });
}
F.sevOpenInvoice=openInv;
var _close=F.closeDrawer; F.closeDrawer=function(){ _close(); var d=document.getElementById("drawer"); if(d) d.classList.remove("xl"); };
function drawerHead(k,t,extra){ return '<div class="row-between" style="align-items:flex-start;margin-bottom:12px"><div style="min-width:0"><div class="sec-t">'+esc(k)+'</div><h2>'+esc(t)+'</h2>'+(extra||"")+'</div><button class="btn icon" data-close aria-label="Schließen">'+F.svg("close")+'</button></div>'; }
function invHtml(i){
  var kind=i.type==="MA"?"Mahnung":i.type==="SR"?"Stornorechnung":"Rechnung", st=i.status, draft=st===100, open=st===200||st===750;
  var tagI={status:st,overdue:open&&i.due&&i.due<F.D.today&&i.open>0.005,sent:i.sent};
  var steps=[["Entwurf",draft],["Versendet",open&&!(i.paid>0)],["Bezahlt",st===1000]];
  var acts=[];
  if(draft){ acts.push('<button class="btn primary" data-act="sdsend:'+esc(i.id)+'">Per E-Mail senden</button>'); acts.push('<button class="btn" data-act="sdedit:'+esc(i.id)+'">Bearbeiten</button>'); acts.push('<button class="btn" data-act="sdsent:'+esc(i.id)+'">Als versendet markieren</button>'); }
  if(open){ acts.push('<button class="btn primary" data-act="book:'+esc(i.id)+'">Zahlung erfassen</button>'); acts.push('<button class="btn" data-act="sdsend:'+esc(i.id)+'">Erneut senden</button>'); if(i.type==="RE") acts.push('<button class="btn" data-act="sdremind:'+esc(i.id)+'">Mahnung erstellen</button>'); if(!(i.paid>0)&&!i.enshrined) acts.push('<button class="btn" data-act="sddraft:'+esc(i.id)+'">Zurück auf Entwurf</button>'); }
  if(st===1000) acts.push('<button class="btn" data-act="sdsend:'+esc(i.id)+'">Per E-Mail senden</button>');
  acts.push('<button type="button" class="btn"'+F.docAttrs("/admin/api/sevdesk/pdf?id="+encodeURIComponent(i.id),kind+" "+(i.nr||"Entwurf"))+'>PDF ansehen</button>');
  acts.push('<a class="btn" href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'&dl=1">PDF laden</a>');
  if((open||st===1000)&&i.type==="RE") acts.push('<button class="btn danger" data-act="sdcancel:'+esc(i.id)+'" style="margin-left:auto">Stornieren</button>');
  var pos='<table class="sd-pos"><thead><tr><th>Position</th><th class="r">Menge</th><th class="r">Einzel brutto</th><th class="r">USt</th><th class="r">Summe</th></tr></thead><tbody>'+
    (i.positions.map(function(p){ return '<tr><td><b>'+esc(p.name)+'</b>'+(p.text?'<div class="muted">'+esc(p.text)+'</div>':'')+'</td><td class="r num">'+esc(String(p.qty).replace(".",","))+'</td><td class="r num">'+eur(p.priceGross)+'</td><td class="r num">'+esc(p.taxRate)+' %</td><td class="r num">'+eur(p.sumGross)+'</td></tr>'; }).join("")||'<tr><td colspan="5" class="muted">Keine Positionen</td></tr>')+
    '</tbody></table>';
  return drawerHead(kind,(i.nr||"Entwurf")+" · "+(i.contact.name||""),'<div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap">'+invTag(tagI)+(i.dunningLevel?'<span class="tag warn">'+i.dunningLevel+'. Mahnstufe</span>':'')+(i.enshrined?'<span class="tag grey">festgeschrieben</span>':'')+'</div>')+
    '<div class="sd-steps" style="margin-bottom:12px">'+steps.map(function(s){ return '<span class="'+(s[1]?"on":"")+'">'+s[0]+'</span>'; }).join("")+'</div>'+
    '<div class="sd-hero"><div><div class="muted">Brutto</div><div class="big">'+eur(i.gross)+'</div><div class="muted">netto '+eur(i.net)+' · USt '+eur(i.tax)+'</div></div>'+
      (i.open>0.005?'<div style="text-align:right"><div class="muted">noch offen</div><div class="big '+(tagI.overdue?"bad-t":"warn-t")+'">'+eur(i.open)+'</div></div>':(st===1000?'<div style="text-align:right"><div class="muted">bezahlt</div><div class="big ok-t">'+eur(i.paid||i.gross)+'</div></div>':''))+'</div>'+
    '<div class="sd-acts" style="margin:14px 0">'+acts.join("")+'</div>'+
    '<div class="sd-split"><div style="display:grid;gap:14px;min-width:0">'+
      '<dl class="facts"><dt>Rechnungsdatum</dt><dd>'+de(i.date)+'</dd><dt>Leistung</dt><dd>'+de(i.delivery)+(i.deliveryUntil?' – '+de(i.deliveryUntil):'')+'</dd><dt>Fällig</dt><dd>'+(i.due?de(i.due)+' ('+i.timeToPay+' Tage)':'—')+'</dd><dt>Versendet</dt><dd>'+(i.sent?de(i.sendDate)+(i.sendType?' · '+({VM:"Mail",VPR:"Druck",VP:"Post",VPDF:"PDF"}[i.sendType]||i.sendType):''):'noch nicht')+'</dd>'+(i.payDate?'<dt>Bezahlt am</dt><dd>'+de(i.payDate)+'</dd>':'')+(i.emails.length?'<dt>E-Mail</dt><dd>'+esc(i.emails[0].value)+'</dd>':'')+'</dl>'+
      (i.address?'<div><div class="sec-t">Adresse</div><div style="white-space:pre-line">'+esc(i.address)+'</div></div>':'')+
      '<div><div class="sec-t">Positionen</div>'+pos+'</div>'+
    '</div><div style="min-width:0"><div class="sec-t">Vorschau</div>'+F.docEmbed("/admin/api/sevdesk/pdf?id="+encodeURIComponent(i.id),kind+" "+(i.nr||"Entwurf"),'<iframe class="sd-pdf" title="PDF-Vorschau" src="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'#view=FitH"></iframe>',"PDF ansehen")+'</div></div>';
}
F.action("sdinv",function(id){ openInv(id); });
F.listen("keydown",".sd-row[data-act]",function(el,e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.click(); } });

/* Senden per Mail */
function sendDialog(id,kind,ref){
  F.api("/admin/api/sev/invoice?id="+encodeURIComponent(id)+(kind?"&kind="+kind:"")+(ref?"&ref="+encodeURIComponent(ref):"")).then(function(i){
    if(!i||!i.ok) return fail(i);
    S.det[id]=i;
    var to=(i.emails[0]&&i.emails[0].value)||"";
    F.modal('<form data-form="sdsend" data-id="'+esc(id)+'" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+(i.type==="MA"?"Mahnung":"Rechnung")+' '+esc(i.nr||"")+' senden</h2>'+F.btnClose()+'</div>'+
      '<p class="muted" style="margin:0">Die Mail geht mit dem PDF im Anhang von deiner Absenderadresse raus'+(i.status===100?'. Der Entwurf bekommt damit seine Rechnungsnummer und ist danach <b>nicht mehr änderbar</b>.':'.')+'</p>'+
      '<label class="fl">An<input class="f" name="to" type="text" list="sdMails" required value="'+esc(to)+'" placeholder="kunde@beispiel.at"></label><datalist id="sdMails">'+i.emails.map(function(m){ return '<option value="'+esc(m.value)+'">'; }).join("")+'</datalist>'+
      '<label class="fl">Betreff<input class="f" name="subject" required value="'+esc(i.mail.subject)+'"></label>'+
      '<label class="fl">Nachricht<textarea class="f" name="text" rows="9" required>'+esc(i.mail.text)+'</textarea></label>'+
      (i.mail.signature?'<div class="sdsig"><label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="sig" checked> Meine Signatur anhängen</label><iframe class="sdsig-pv" sandbox="" title="Signatur" srcdoc="'+esc('<!doctype html><meta charset="utf-8"><style>body{margin:8px;font:13px Arial,sans-serif;color:#1b2420;background:#fff}</style>'+i.mail.signature)+'"></iframe></div>':'')+
      '<label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="copy"> Kopie an mich</label>'+
      '<div class="foot"><span class="num">'+eur(i.gross)+' · '+esc(i.contact.name||"")+'</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Jetzt senden</button></span></div><div class="err" id="sdSendErr"></div></form>',"wide");
  });
}
F.action("sdsend",function(id){ sendDialog(id,""); });
F.form("sdsend",function(f){
  var id=f.getAttribute("data-id"), err=document.getElementById("sdSendErr"), btn=f.querySelector("[type=submit]");
  btn.disabled=true; btn.textContent="Sende …"; err.textContent="";
  post("/admin/api/sev/invoice-op",{op:"send",id:id,toEmail:f.to.value,subject:f.subject.value,text:f.text.value,copy:f.copy.checked,signature:f.sig?f.sig.checked:undefined}).then(function(j){
    if(!j||!j.ok){ btn.disabled=false; btn.textContent="Jetzt senden"; err.textContent=(j&&j.error)||"Fehler"; return; }
    F.closeModal(); F.toast("Gesendet an "+(j.sentTo||f.to.value)); afterOp(id);
  }).catch(function(){ btn.disabled=false; btn.textContent="Jetzt senden"; err.textContent="Keine Verbindung."; });
});
function afterOp(id){ F.load(true); var d=document.getElementById("drawer"); if(id&&d&&d.classList.contains("on")) setTimeout(function(){ openInv(id); },600); }
F.action("sdsent",function(id){
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:20px">Als versendet markieren</h2>'+F.btnClose()+'</div><p class="muted" style="margin:0">Die Rechnung bekommt ihre Nummer und gilt als gestellt. Wie hast du sie verschickt?</p>'+
    '<div class="sd-acts">'+[["VM","Per Mail (selbst)"],["VP","Per Post"],["VPR","Ausgedruckt übergeben"],["VPDF","PDF heruntergeladen"]].map(function(t){ return '<button class="btn" data-act="sdsentdo:'+esc(id)+'|'+t[0]+'">'+t[1]+'</button>'; }).join("")+'</div></div>',"narrow");
});
F.action("sdsentdo",function(v){ var p=v.split("|"); F.closeModal(); post("/admin/api/sev/invoice-op",{op:"sent",id:p[0],sendType:p[1]}).then(function(j){ if(!j||!j.ok) return fail(j); F.toast("Als versendet markiert"); afterOp(p[0]); }).catch(function(){ fail(); }); });
/* Mahnung mit Mahnstufe, Mahngebühr und neuer Frist. Gebühr = Schadenersatz → 0 %, nicht in der UVA, Betriebseinnahme bei Zahlung */
var DUN_T=["Zahlungserinnerung","1. Mahnung","2. Mahnung","Letzte Mahnung"], DUN_FEE=[0,10,15,20];
F.action("sdremind",function(id){
  var i=F.D.sev&&F.D.sev.invoices.find(function(x){return x.id===id;})||S.det[id]||{}, lvl=Math.min(3,(i.dunning||i.dunningLevel||0)), saved=F.ls("fsc_dunfee")||DUN_FEE;
  F.modal('<form data-form="sdremind" data-id="'+esc(id)+'" data-nr="'+esc(i.nr||"")+'" class="stackf"><div class="row-between"><h2 style="font-size:19px">'+DUN_T[lvl]+' erstellen</h2>'+F.btnClose()+'</div>'+
    '<p style="margin:0">'+esc(i.nr||"")+' · '+esc((i.contact&&i.contact.name)||i.contact||"")+' · offen <b>'+eur(i.open||0)+'</b>'+(i.feeOpen>0?' · bisherige Mahngebühren '+eur(i.feeOpen):'')+'</p>'+
    '<div class="grid2"><label class="fl">Mahngebühr (€)<input class="f num" name="fee" type="number" step="0.01" min="0" value="'+(+saved[lvl]||0).toFixed(2)+'"></label><label class="fl">Neue Zahlungsfrist (Tage)<input class="f num" name="days" type="number" min="1" value="'+(lvl?10:7)+'"></label></div>'+
    '<p class="muted" style="margin:0;font-size:13px">Mahngebühren sind Schadenersatz: ohne Umsatzsteuer, nicht in der UVA. Bei Zahlung wird die Gebühr als eigene Einnahme gebucht (E/A-Rechnung).</p>'+
    '<div class="foot"><span class="err" id="sdRemErr"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Erstellen &amp; senden</button></span></div></form>',"narrow");
});
F.form("sdremind",function(f){
  var id=f.getAttribute("data-id"), nr=f.getAttribute("data-nr"), err=document.getElementById("sdRemErr"), btn=f.querySelector("[type=submit]");
  var i=F.D.sev&&F.D.sev.invoices.find(function(x){return x.id===id;})||{}, lvl=Math.min(3,(i.dunning||0)), saved=(F.ls("fsc_dunfee")||DUN_FEE).slice(); saved[lvl]=+f.fee.value||0; F.ls("fsc_dunfee",saved);
  btn.disabled=true; err.textContent="";
  post("/admin/api/sev/invoice-op",{op:"reminder",id:id,fee:f.fee.value,days:f.days.value}).then(function(j){ if(!j||!j.ok){ btn.disabled=false; err.textContent=(j&&j.error)||"Fehler"; return; } F.closeModal(); F.toast("Mahnung "+(j.reminder.nr||"")+" erstellt"); F.load(true); sendDialog(j.reminder.id,"reminder",nr); }).catch(function(){ btn.disabled=false; err.textContent="Keine Verbindung."; });
});
F.action("sdcancel",function(id){
  var i=S.det[id]||F.D.sev.invoices.find(function(x){return x.id===id;})||{};
  F.confirm("Rechnung "+(i.nr||"")+" über "+eur(i.gross||0)+" stornieren? Es wird eine Stornorechnung erstellt, die Rechnung gilt danach als storniert. Das lässt sich nicht rückgängig machen.","Stornieren",function(){
    post("/admin/api/sev/invoice-op",{op:"cancel",id:id}).then(function(j){ if(!j||!j.ok) return fail(j); F.toast("Storniert"+(j.storno&&j.storno.nr?" · Storno "+j.storno.nr:"")); afterOp(id); }).catch(function(){ fail(); });
  },true);
});
F.action("sddraft",function(id){
  F.confirm("Rechnung zurück auf Entwurf setzen? Danach kannst du sie bearbeiten und neu senden. Bereits verschickte PDFs beim Kunden bleiben natürlich bestehen.","Auf Entwurf setzen",function(){
    post("/admin/api/sev/invoice-op",{op:"draft",id:id}).then(function(j){ if(!j||!j.ok) return fail(j); F.toast("Wieder Entwurf"); afterOp(id); }).catch(function(){ fail(); });
  });
});
F.action("sdedit",function(id){
  var i=S.det[id]; if(!i) return;
  F.closeDrawer();
  var pre={id:i.id,title:"Entwurf bearbeiten · "+(i.contact.name||""),contactName:i.contact.name,contactId:i.contact.id,email:"",address:i.address,invoiceDate:i.date,deliveryDate:i.delivery,deliveryDateUntil:i.deliveryUntil||"",reference:i.reference||"",headText:String(i.headText||"").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,""),footText:i.footText,timeToPay:String(i.timeToPay||""),
    items:i.positions.map(function(p){ return {name:p.name,text:p.text,qty:p.qty,priceGross:p.priceGross,taxRate:p.taxRate,discount:p.discount||0}; }),onDone:function(){ setTimeout(function(){ openInv(id); },400); }};
  if(i.taxRule) pre.taxRule=i.taxRule; if(i.taxType==="custom"&&i.taxSet){ pre.taxType="custom"; pre.taxSet=i.taxSet; }
  F.openInvoice(pre);
});

/* ================= Bank ================= */
function loadBank(force){ load("bank","/admin/api/sev/bank"+(force?"?force=1":""),function(j){ S.bank=j; }); }
F.action("sdbankreload",function(){ S.bank=null; loadBank(true); F.render(); });
F.action("sdbkacc",function(k){ F.UI.bkAcc=k; F.render(); });
function txById(id){ return S.bank&&S.bank.transactions.find(function(t){ return t.id===id; }); }
function renderBank(){
  if(!S.bank){ loadBank(); return loading("Lade offene Bankumsätze …"); }
  if(!S.bank.ok) return errBox(S.bank,"sdbankreload");
  var accs={}; S.bank.transactions.forEach(function(t){ accs[t.accountId]=t.account||"Konto"; });
  var a=F.UI.bkAcc, list=S.bank.transactions.filter(function(t){ return a==="all"||t.accountId===a; });
  var withSug=list.filter(function(t){ return t.suggestions.length; }).length;
  var sevA=(F.D.sev&&F.D.sev.accounts)||[];
  return '<div class="kpis">'+
      '<div class="panel kpi"><span class="k">Nicht zugeordnet</span><span class="v num">'+S.bank.transactions.length+'</span><span class="s">Bankumsätze</span></div>'+
      '<div class="panel kpi"><span class="k">Mit Vorschlag</span><span class="v num">'+withSug+'</span><span class="s">ein Klick genügt</span></div>'+
      sevA.slice(0,2).map(function(x){ return '<div class="panel kpi"><span class="k">'+esc(x.name)+'</span><span class="v num'+(x.balance<0?" bad-t":"")+'">'+(x.balance==null?"—":eur0(x.balance))+'</span><span class="s">Saldo</span></div>'; }).join("")+
    '</div>'+
    '<section class="panel"><div class="sd-tools"><div class="chips">'+chip("sdbkacc","all",a,"Alle Konten",S.bank.transactions.length)+Object.keys(accs).map(function(k){ return chip("sdbkacc",k,a,esc(accs[k]),S.bank.transactions.filter(function(t){return t.accountId===k;}).length); }).join("")+'</div><span class="row" style="gap:6px"><button class="btn" data-act="sdbkimp">Kontoauszug importieren</button><button class="btn" data-act="sdbankreload">Aktualisieren</button></span></div>'+
    (list.length?list.map(txHtml).join(""):'<div class="sd-empty"><b>Alles zugeordnet 🎉</b>Keine offenen Bankumsätze.</div>')+'</section>';
}
function txHtml(t){
  var pos=t.amount>0;
  return '<div class="sd-tx" id="tx-'+esc(t.id)+'"><div class="top"><div style="min-width:0"><b>'+esc(t.name||"Umsatz")+'</b><div class="muted" style="overflow:hidden;text-overflow:ellipsis">'+esc(t.purpose)+'</div><div class="muted">'+de(t.date)+(t.account?' · '+esc(t.account):'')+'</div></div><div class="amt '+(pos?"ok-t":"bad-t")+'">'+(pos?"+":"")+eur(t.amount)+'</div></div>'+
    '<div class="sd-acts">'+t.suggestions.map(function(s,k){ return '<button class="sd-sug" data-act="sdbk:'+esc(t.id)+'|'+s.kind+'|'+esc(s.id)+'" title="Zuordnen">'+(k===0?'✓ ':'')+esc(s.label)+' <span class="m">'+esc(s.sub)+'</span></button>'; }).join("")+
      '<button class="btn" data-act="sdbkother:'+esc(t.id)+'">'+(t.suggestions.length?"Andere …":(pos?"Rechnung zuordnen …":"Beleg zuordnen …"))+'</button>'+
      '<button class="btn" data-act="sdbknew:'+esc(t.id)+'">'+(pos?"Als Einnahme buchen":"Als Ausgabe buchen")+'</button></div></div>';
}
function bankDo(txId,body,label){
  var el=document.getElementById("tx-"+txId); if(el) el.classList.add("gone");
  body.txId=txId;
  post("/admin/api/sev/bank-op",body).then(function(j){
    if(!j||!j.ok){ if(el) el.classList.remove("gone"); return fail(j); }
    if(S.bank) S.bank.transactions=S.bank.transactions.filter(function(t){ return t.id!==txId; });
    if(F.finAfterBook) F.finAfterBook();
    F.toast(label||"Zugeordnet"); F.render(); F.load(true);
  }).catch(function(){ if(el) el.classList.remove("gone"); fail(); });
}
F.action("sdbk",function(v){
  var p=v.split("|"), t=txById(p[0]); if(!t) return;
  var s=t.suggestions.find(function(x){ return x.id===p[2]&&x.kind===p[1]; })||{label:""};
  var body=p[1]==="invoice"?{op:"invoice",invoiceId:p[2]}:{op:"voucher",voucherId:p[2]};
  var warn=Math.abs(Math.abs(t.amount)-(s.open||0))>0.011&&s.open?" Achtung: Betrag "+eur(Math.abs(t.amount))+" ≠ offen "+eur(s.open)+" (wird als Teilzahlung gebucht).":"";
  F.confirm(eur(t.amount)+" vom "+deShort(t.date)+" mit „"+s.label+"“ verbuchen?"+warn,"Zuordnen",function(){ bankDo(t.id,body,"Zugeordnet: "+s.label); });
});
F.action("sdbkother",function(id){
  var t=txById(id); if(!t) return; var pos=t.amount>0;
  var items=pos?S.bank.openInvoices.map(function(i){ return {kind:"invoice",id:i.id,label:(i.nr||"Entwurf")+" · "+i.contact,sub:eur(i.open)+" offen · "+deShort(i.date),q:(i.nr+" "+i.contact+" "+i.open).toLowerCase()}; }).concat(S.bank.openVouchers.filter(function(v){return v.cd==="D";}).map(function(v){ return {kind:"voucher",id:v.id,label:(v.supplier||"Einnahme")+(v.desc?" · "+v.desc:""),sub:eur(v.open)+" offen",q:(v.supplier+" "+v.desc+" "+v.open).toLowerCase()}; }))
    :S.bank.openVouchers.filter(function(v){return v.cd==="C";}).map(function(v){ return {kind:"voucher",id:v.id,label:(v.supplier||"Beleg")+(v.desc?" · "+v.desc:""),sub:eur(v.open)+" offen · "+deShort(v.date),q:(v.supplier+" "+v.desc+" "+v.open).toLowerCase()}; });
  S.pick={tx:t,items:items};
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:20px">'+(pos?"Rechnung":"Beleg")+' zuordnen</h2>'+F.btnClose()+'</div><p style="margin:0"><b>'+eur(t.amount)+'</b> · '+esc(t.name)+' <span class="muted">'+esc(t.purpose)+'</span></p>'+
    (F.sugBox?F.sugBox("tx",t.id):'')+   /* Vorschlag oben (zreview.js) – nur mit „Übernehmen“ */
    '<input class="f" placeholder="Suchen …" data-sdpickq autofocus><div class="sd-pick" id="sdPick">'+pickList("")+'</div>'+
    (items.length?'':'<p class="muted" style="margin:0">Keine offenen '+(pos?"Rechnungen":"Belege")+'. Lege den Beleg zuerst an oder buche den Umsatz direkt.</p>')+
    '<div class="row-between" style="border-top:1px solid var(--line);padding-top:12px;gap:12px;flex-wrap:wrap"><span class="muted small">Nichts Betriebliches? '+(pos?"Geld von dir privat aufs Geschäftskonto":"Private Ausgabe oder Geld an dich")+' – zählt nicht als Einnahme/Ausgabe, keine Steuer.</span><span class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="sdbkpriv:'+esc(t.id)+'">'+(pos?"Als Privateinlage markieren":"Als Privatentnahme markieren")+'</button><button type="button" class="btn primary" data-act="sdbknew:'+esc(t.id)+'">Neue Buchung anlegen</button></span></div></div>',"wide");
});
function pickList(q){ var it=S.pick.items.filter(function(x){ return !q||x.q.indexOf(q)>-1; }).slice(0,80); return it.map(function(x){ return '<button type="button" data-act="sdbkpick:'+x.kind+'|'+esc(x.id)+'"><span>'+esc(x.label)+'</span><span class="muted num">'+esc(x.sub)+'</span></button>'; }).join("")||'<div class="sd-empty">Nichts gefunden.</div>'; }
F.listen("input","[data-sdpickq]",function(el){ var b=document.getElementById("sdPick"); if(b) b.innerHTML=pickList(el.value.toLowerCase()); });
F.action("sdbkpriv",function(id){ var t=S.pick&&S.pick.tx; F.closeModal(); bankDo(id,{op:"privat"},t&&t.amount>0?"Als Privateinlage markiert":"Als Privatentnahme markiert"); if(F.finTxReset) F.finTxReset(); });
F.action("sdbkpick",function(v){ var p=v.split("|"), t=S.pick.tx, it=S.pick.items.find(function(x){return x.id===p[1]&&x.kind===p[0];}); F.closeModal(); bankDo(t.id,p[0]==="invoice"?{op:"invoice",invoiceId:p[1]}:{op:"voucher",voucherId:p[1]},"Zugeordnet: "+(it?it.label:"")); });
F.action("sdbknew",function(id){
  var t=txById(id); if(!t) return; var pos=t.amount>0, la=!pos&&F.sugLike?F.sugLike(id):null;   /* vorbelegt wie der letzte Beleg desselben Händlers */
  var laRule=la?(la.taxRule||(la.rc?"14":"9")):"9", laRate=la?(F.taxRuleZero(laRule)?0:+la.rate||0):0;
  F.loadMeta(function(m){
    var cats=(m.accountingTypes||[]);
    F.modal('<form data-form="sdbknew" data-id="'+esc(id)+'" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+(pos?"Einnahme":"Ausgabe")+' buchen</h2>'+F.btnClose()+'</div>'+
      '<p class="muted" style="margin:0">Legt einen Beleg an und verbucht ihn gleich mit diesem Umsatz – mit Rechnungsdatei oder ohne (z. B. Kontoführung, Bankspesen; die Datei kannst du später anhängen).</p>'+
      '<p style="margin:0"><b class="'+(pos?"ok-t":"bad-t")+'">'+eur(t.amount)+'</b> · '+de(t.date)+'</p>'+
      (la?'<p class="muted small" style="margin:0">Vorbelegt wie beim letzten Beleg'+(la.supplier?' von „'+esc(la.supplier)+'“':'')+' – bitte kurz prüfen.</p>':'')+
      '<div class="grid2"><label class="fl">Lieferant / Zahler<input class="f" name="supplier" value="'+esc(la&&la.supplier||t.name)+'"></label><label class="fl">USt-Satz<select class="f" name="tax">'+[0,20,13,10].map(function(r){ return '<option value="'+r+'"'+(r===laRate?" selected":"")+'>'+r+' %</option>'; }).join("")+'</select></label></div>'+
      (pos?'':F.taxRuleSelect('name="rule" data-rate="[name=tax]"',laRule))+
      '<label class="fl">Kategorie<select class="f" name="cat" required><option value="">— wählen —</option>'+cats.map(function(c){ return '<option value="'+esc(c.id)+'"'+(la&&String(la.category)===String(c.id)?" selected":"")+'>'+esc(c.name)+'</option>'; }).join("")+'</select></label>'+
      '<label class="fl">Beschreibung<input class="f" name="desc" value="'+esc(t.purpose.slice(0,200))+'"></label>'+
      '<label class="fl">Rechnung / Beleg (optional)<input class="f" type="file" name="file" accept="application/pdf,image/png,image/jpeg,image/webp"></label>'+
      '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="sdBkGo">Buchen</button></span></div><div class="err" id="sdBkErr"></div></form>',"wide");
    var rs=document.querySelector('[data-form="sdbknew"] [name=rule]'); if(rs) F.taxRuleSync(rs);
  });
});
F.form("sdbknew",function(f){
  var id=f.getAttribute("data-id"); if(!f.cat.value){ document.getElementById("sdBkErr").textContent="Bitte eine Kategorie wählen."; return; }
  var file=f.file&&f.file.files&&f.file.files[0], t=txById(id), rule=f.rule?f.rule.value:"", rate=F.taxRuleZero(rule)?0:parseFloat(f.tax.value);
  if(!file||!t){ F.closeModal(); bankDo(id,{op:"newVoucher",accountingTypeId:f.cat.value,taxRate:rate,taxRule:rule,supplierName:f.supplier.value,description:f.desc.value},"Gebucht"); return; }
  /* mit Datei: hochladen → Beleg mit Datei anlegen und gleich mit dem Umsatz verbinden */
  var err=document.getElementById("sdBkErr"), btn=document.getElementById("sdBkGo"); if(file.size>15*1024*1024){ err.textContent="Die Datei ist größer als 15 MB."; return; }
  btn.disabled=true; err.textContent="Lade Datei hoch …";
  var rd=new FileReader(); rd.onerror=function(){ btn.disabled=false; err.textContent="Datei konnte nicht gelesen werden."; };
  rd.onload=function(){
    F.api("/admin/api/ki/beleg-upload",{body:{filename:file.name,mime:file.type,data:rd.result,keep:true}}).then(function(up){
      if(!up||!up.uploadId) throw new Error((up&&up.error)||"Upload fehlgeschlagen");
      err.textContent="Lege Beleg an …";
      return F.api("/admin/api/sevdesk/voucher",{body:{uploadId:up.uploadId,supplierName:f.supplier.value,date:t.date,description:f.desc.value,gross:Math.abs(t.amount),taxRate:rate,taxRule:rule||undefined,accountingTypeId:f.cat.value,creditDebit:t.amount>0?"D":"C",txId:id,confirm:true}});
    }).then(function(j){
      if(!j||!j.ok) throw new Error((j&&j.error)||"Beleg nicht gespeichert");
      F.closeModal(); if(S.bank) S.bank.transactions=S.bank.transactions.filter(function(x){ return x.id!==id; }); if(F.finAfterBook) F.finAfterBook();
      F.toast(j.booked?"Gebucht – Beleg mit Datei angelegt":"Beleg angelegt, aber nicht verbunden: "+(j.bookError||j.openError||""),!j.booked); F.render(); F.load(true);
    }).catch(function(e){ btn.disabled=false; err.textContent=String(e&&e.message||e); });
  };
  rd.readAsDataURL(file);
});

/* Blitzdings-Buchungen einer bestehenden Rechnung zuordnen (auch mehrere = Sammelrechnung) */
var ASG={key:null,inv:null,q:""};
F.action("sdassign",function(key){ ASG={key:key,inv:null,q:""}; asgStep1(); });
function asgStep1(){
  var it=F.D.abgleich.items.find(function(x){return x.key===ASG.key;})||{}, q=ASG.q.toLowerCase();
  var invs=((F.D.sev&&F.D.sev.invoices)||[]).filter(function(i){ return i.type!=="SR"&&i.type!=="MA"&&(!q||(i.nr+" "+i.contact+" "+i.gross).toLowerCase().indexOf(q)>-1); }).slice(0,60);
  F.modal('<div class="stackf"><div class="row-between"><h2 style="font-size:20px">Rechnung zuordnen</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">'+esc(it.name||"")+' · '+eur(it.unbilled||0)+' – welche Rechnung deckt diese Buchung ab?</p>'+
    '<input class="f" placeholder="Suchen: Nr., Kunde, Betrag …" data-asgq value="'+esc(ASG.q)+'" autofocus>'+
    '<div class="sd-pick">'+(invs.map(function(i){ return '<button type="button" data-act="sdasginv:'+esc(i.id)+'"><span>'+esc((i.nr||"Entwurf")+" · "+i.contact)+'</span><span class="muted num">'+eur(i.gross)+' · '+F.deShort(i.date)+'</span></button>'; }).join("")||'<div class="sd-empty">Keine Rechnung gefunden.</div>')+'</div></div>',"wide");
}
F.listen("input","[data-asgq]",function(el){ ASG.q=el.value; clearTimeout(el._t); el._t=setTimeout(function(){ var pos=el.selectionStart; asgStep1(); var n=document.querySelector("[data-asgq]"); if(n){ n.focus(); try{ n.setSelectionRange(pos,pos); }catch(e){} } },200); });
F.action("sdasginv",function(id){
  var inv=(F.D.sev.invoices||[]).find(function(i){return i.id===id;}); if(!inv) return; ASG.inv=inv;
  var cand=F.D.abgleich.items.filter(function(x){ return x.src==="blitzdings"&&x.unbilled>0.005; });
  F.modal('<form data-form="sdasg" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+esc((inv.nr||"Entwurf")+" · "+inv.contact)+'</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Welche Buchungen sind in dieser Rechnung (<b>'+eur(inv.gross)+'</b>) enthalten?</p>'+
    '<div class="sd-pick" style="max-height:380px">'+cand.map(function(x){ return '<label style="display:flex;gap:10px;align-items:center;padding:9px 12px;border-top:1px solid var(--line);cursor:pointer"><input type="checkbox" name="k" value="'+esc(x.key)+'" data-amt="'+(x.amount||x.unbilled)+'"'+(x.key===ASG.key?" checked":"")+'><span style="flex:1;min-width:0"><b>'+esc(x.name)+'</b><br><span class="muted">'+esc(x.sub)+'</span></span><span class="num">'+eur(x.amount||x.unbilled)+'</span></label>'; }).join("")+'</div>'+
    '<div class="foot"><span id="asgSum" class="num"></span><span class="row"><button type="button" class="btn" data-act="sdassignback">Zurück</button><button class="btn primary" type="submit">Zuordnen</button></span></div></form>',"wide");
  asgSum();
});
F.action("sdassignback",function(){ asgStep1(); });
function asgSum(){ var sum=0; document.querySelectorAll('form[data-form="sdasg"] [name=k]:checked').forEach(function(c){ sum+=+c.getAttribute("data-amt")||0; }); var e=document.getElementById("asgSum"); if(e&&ASG.inv){ var d=Math.round((sum-ASG.inv.gross)*100)/100; e.innerHTML='Auswahl '+eur(sum)+' · '+(Math.abs(d)<0.02?'<span class="ok-t">passt genau</span>':'<span class="warn-t">'+(d>0?"+":"")+eur(d)+' Differenz</span>'); } }
F.listen("change",'form[data-form="sdasg"] [name=k]',asgSum);
F.form("sdasg",function(f){
  var keys=Array.prototype.map.call(f.querySelectorAll("[name=k]:checked"),function(c){return c.value;}); if(!keys.length) return;
  var inv=ASG.inv;
  Promise.all(keys.map(function(k){ var x=F.D.abgleich.items.find(function(y){return y.key===k;})||{}; return F.api("/admin/api/billing",{body:{op:"invoice",key:k,invoice:{id:inv.id,nr:inv.nr,gross:x.amount||x.unbilled,date:inv.date,label:(x.name||"")+(keys.length>1?" (Sammelrechnung)":"")}}}); }))
    .then(function(){ F.closeModal(); F.toast(keys.length+(keys.length===1?" Buchung":" Buchungen")+" "+(inv.nr||"")+" zugeordnet"); F.load(true); }).catch(function(){ F.toast("Nicht gespeichert",true); });
});

/* Kontoauszug aus George (CAMT.053 / CSV / JSON) einlesen */
F.action("sdbkimp",function(){
  var accs=(F.D.sev&&F.D.sev.accounts)||[], def=(accs.find(function(x){return x.isDefault;})||accs[0]||{}).id;
  F.modal('<form data-form="sdbkimp" class="stackf"><div class="row-between"><h2 style="font-size:20px">Kontoauszug importieren</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">In George: Konto öffnen → Umsätze → <b>Exportieren</b> → Format <b>CAMT.053 (XML)</b> oder CSV. Bereits vorhandene Umsätze werden automatisch übersprungen.</p>'+
    '<label class="fl">Konto<select class="f" name="acc">'+accs.map(function(x){ return '<option value="'+esc(x.id)+'"'+(x.id===def?" selected":"")+'>'+esc(x.name)+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Datei<input class="f" type="file" name="file" accept=".xml,.csv,.txt,.json" required></label>'+
    '<div id="bkImpInfo" class="muted"></div>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit" id="bkImpGo" disabled>Importieren</button></span></div><div class="err" id="bkImpErr"></div></form>',"wide");
});
var BKIMP=null;
function bkPreview(f){
  var file=f.file.files[0], info=document.getElementById("bkImpInfo"), go=document.getElementById("bkImpGo"), er=document.getElementById("bkImpErr"); if(!file) return;
  info.textContent="Lese Datei …"; go.disabled=true; er.textContent="";
  file.text().then(function(txt){ BKIMP={content:txt,filename:file.name};
    return F.api("/admin/api/fin/bank-import",{body:{preview:true,accountId:f.acc.value,content:txt,filename:file.name}}); }).then(function(j){
    if(!j||!j.ok){ info.textContent=""; er.textContent=(j&&j.error)||"Fehler"; return; }
    info.innerHTML='<b>'+j.total+'</b> Umsätze erkannt ('+esc(j.format)+') · <b>'+j.added+' neu</b> · '+j.dup+' schon vorhanden'+(j.sample&&j.sample.length?'<br>'+j.sample.map(function(t){ return esc(F.deShort(t.date)+" · "+(t.name||t.purpose||"").slice(0,40)+" · "+F.eur(t.amount)); }).join("<br>"):'');
    go.disabled=!j.added; go.textContent=j.added?j.added+" Umsätze importieren":"Nichts Neues";
  }).catch(function(){ info.textContent=""; er.textContent="Datei konnte nicht gelesen werden."; });
}
F.listen("change",'form[data-form="sdbkimp"] [name=file],form[data-form="sdbkimp"] [name=acc]',function(el){ bkPreview(el.form); });
F.form("sdbkimp",function(f){
  if(!BKIMP) return; var go=document.getElementById("bkImpGo"); go.disabled=true; go.textContent="Importiere …";
  F.api("/admin/api/fin/bank-import",{body:{confirm:true,accountId:f.acc.value,content:BKIMP.content,filename:BKIMP.filename}}).then(function(j){
    if(!j||!j.ok){ document.getElementById("bkImpErr").textContent=(j&&j.error)||"Fehler"; go.disabled=false; return; }
    F.closeModal(); F.toast(j.added+" Umsätze importiert"+(j.dup?" · "+j.dup+" übersprungen":"")); S.bank=null; F.load(true); F.render();
  });
});

/* ================= Belege ================= */
function vouYear(){ return String(F.D.year); }
function loadVou(force){ var y=vouYear(); load("vou"+y,"/admin/api/sev/vouchers?year="+y+(force?"&force=1":""),function(j){ S.vou[y]=j; }); }
F.action("sdvoureload",function(){ delete S.vou[vouYear()]; loadVou(true); F.render(); });
F.action("sdvf",function(k){ F.UI.vF=k; F.UI.vMore=0; F.render(); });
F.action("sdvmore",function(){ F.UI.vMore=(F.UI.vMore||0)+60; F.render(); });
F.listen("input","[data-vq]",function(el){ F.UI.vQ=el.value; clearTimeout(el._d); el._d=setTimeout(F.render,250); });
function vTag(v){ var m={50:["grey","Entwurf"],100:["warn","offen"],750:["warn","teilbezahlt"],1000:["ok","bezahlt"]}[v.status]||["grey",v.statusLabel]; return '<span class="tag '+m[0]+'">'+m[1]+'</span>'; }
function renderBelege(){
  var y=vouYear(), d=S.vou[y];
  if(!d){ loadVou(); return loading("Lade Belege "+y+" …"); }
  if(!d.ok) return errBox(d,"sdvoureload");
  var all=d.vouchers, f=F.UI.vF, q=(F.UI.vQ||"").toLowerCase();
  var cnt={draft:0,open:0,nodoc:0,inc:0};
  all.forEach(function(v){ if(v.status===50) cnt.draft++; if(v.open>0.005) cnt.open++; if(!v.hasDoc) cnt.nodoc++; if(v.cd==="D") cnt.inc++; });
  var list=all.filter(function(v){
    if(f==="draft"&&v.status!==50) return false; if(f==="open"&&!(v.open>0.005)) return false; if(f==="paid"&&v.status!==1000) return false; if(f==="nodoc"&&v.hasDoc) return false; if(f==="inc"&&v.cd!=="D") return false;
    return !q||(v.supplier+" "+v.desc+" "+v.category+" "+v.gross).toLowerCase().indexOf(q)>-1;
  });
  var lim=60+(F.UI.vMore||0), more=Math.max(0,list.length-lim);
  var out=all.filter(function(v){return v.cd==="C"&&v.status>=100;}).reduce(function(s,v){return s+v.net;},0);
  return '<div class="kpis">'+
      '<div class="panel kpi"><span class="k">Ausgaben '+y+'</span><span class="v num">'+eur0(out)+'</span><span class="s">netto, '+all.filter(function(v){return v.cd==="C";}).length+' Belege</span></div>'+
      '<button class="panel kpi" data-act="sdvf:draft"><span class="k">Entwürfe</span><span class="v num">'+cnt.draft+'</span><span class="s">noch nicht fertig erfasst</span></button>'+
      '<button class="panel kpi" data-act="sdvf:open"><span class="k">Unbezahlt</span><span class="v num">'+eur0(all.reduce(function(s,v){return s+(v.cd==="C"?v.open:0);},0))+'</span><span class="s">'+cnt.open+' Belege</span></button>'+
      '<button class="panel kpi" data-act="sdvf:nodoc"><span class="k">Ohne Datei</span><span class="v num'+(cnt.nodoc?" warn-t":"")+'">'+cnt.nodoc+'</span><span class="s">Beleg fehlt</span></button>'+
    '</div>'+
    '<section class="panel"><div class="sd-tools"><div class="chips">'+chip("sdvf","all",f,"Alle",all.length)+chip("sdvf","draft",f,"Entwürfe",cnt.draft)+chip("sdvf","open",f,"Unbezahlt",cnt.open)+chip("sdvf","paid",f,"Bezahlt")+chip("sdvf","nodoc",f,"Ohne Datei",cnt.nodoc)+chip("sdvf","inc",f,"Einnahmen",cnt.inc)+'</div>'+
      '<div class="row" style="gap:8px"><input class="f" placeholder="Suchen: Lieferant, Kategorie, Betrag …" data-vq data-keepfocus="vq" value="'+esc(F.UI.vQ)+'" aria-label="Belege suchen"><button class="btn primary" data-act="voucher">+ Beleg</button></div></div>'+
    '<div class="sd-list">'+(list.slice(0,lim).map(function(v){
      return '<div class="sd-row" role="button" tabindex="0" data-act="sdvou:'+esc(v.id)+'"><div style="min-width:0"><div class="t">'+esc(v.supplier||v.desc||"Beleg")+(v.hasDoc?'':' <span class="tag warn" style="font-size:11px">ohne Datei</span>')+'</div><div class="s">'+esc(deShort(v.date)+" · "+(v.category||"ohne Kategorie")+(v.desc&&v.supplier?" · "+v.desc:""))+'</div></div>'+
        '<div class="r"><span class="amt '+(v.cd==="D"?"ok-t":"")+'">'+(v.cd==="D"?"+":"")+eur(v.gross)+'</span>'+vTag(v)+'</div></div>';
    }).join("")||'<div class="sd-empty">Keine Belege in dieser Ansicht.</div>')+'</div>'+
    (more?'<button class="more" data-act="sdvmore">Weitere '+Math.min(60,more)+' anzeigen ('+more+' übrig)</button>':'')+'</section>';
}
function vouById(id){ var hit=null; Object.keys(S.vou||{}).forEach(function(y){ var d=S.vou[y]; if(!hit&&d&&d.vouchers) hit=d.vouchers.find(function(v){return v.id===id;})||null; }); return hit; }
/* Beleg nicht im geladenen Jahr (z. B. gerade per Regel angelegt oder anderes Jahr): Jahre frisch nachladen, dann öffnen */
function findVouThen(id,cb){ var v=vouById(id); if(v) return cb(v); F.toast("Lade Beleg …");
  var cy=new Date().getFullYear(), ys=[vouYear(),String(cy),String(cy-1),String(cy-2)].filter(function(y,i,a){ return a.indexOf(y)===i; }), i=0;
  (function next(){ if(i>=ys.length){ F.toast("Beleg nicht gefunden",true); return; } var y=ys[i++]; F.api("/admin/api/sev/vouchers?year="+y+"&force=1").then(function(j){ if(j&&j.ok){ S.vou[y]=j; var h=j.vouchers.find(function(x){ return x.id===id; }); if(h) return cb(h); } next(); }); })(); }
function vrow(p,cats){ p=p||{}; var r=p.taxRate!=null?+p.taxRate:20;
  return '<div class="sd-vrow"><select class="f" data-v="cat" aria-label="Kategorie"><option value="">— Kategorie —</option>'+cats.map(function(c){ return '<option value="'+esc(c.id)+'"'+(String(c.id)===String(p.accountingTypeId)?" selected":"")+'>'+esc(c.name)+'</option>'; }).join("")+(p.accountingTypeId&&!cats.some(function(c){return String(c.id)===String(p.accountingTypeId);})?'<option value="'+esc(p.accountingTypeId)+'" selected>'+esc(p.category||"Kategorie "+p.accountingTypeId)+'</option>':'')+'</select>'+
    '<select class="f" data-v="tax" aria-label="USt">'+[20,13,10,0].map(function(x){ return '<option value="'+x+'"'+(x===r?" selected":"")+'>'+x+' %</option>'; }).join("")+'</select>'+
    '<input class="f num" data-v="gross" type="number" step="0.01" min="0" placeholder="brutto €" value="'+(p.gross!=null?esc(p.gross):"")+'" aria-label="Brutto">'+
    '<input class="f cm" data-v="comment" placeholder="Notiz" value="'+esc(p.comment||"")+'"><button type="button" class="btn icon" data-vdel aria-label="Position entfernen">✕</button></div>'; }
/* Belegdatei-URL mit Versionskennung (Dokument-ID): darf im Browser-Cache bleiben → Vorschau öffnet sofort */
F.vouDocUrl=function(v){ return "/admin/api/sev/voucher-doc?id="+encodeURIComponent(v.id)+(v.docId?"&v="+encodeURIComponent(v.docId):""); };
function openVou(id){
  var v=vouById(id); if(!v) return findVouThen(id,function(){ openVou(id); });
  F.loadMeta(function(m){
    var cats=m.accountingTypes||[], draft=v.status===50, open=v.status===100||v.status===750, paid=v.status===1000, locked=v.enshrined||v.status>=750;
    var acts=[];
    if(draft) acts.push('<button class="btn primary" data-act="sdvop:'+esc(id)+'|open">Fertig erfasst</button>');
    if(open&&v.open>0.005) acts.push('<button class="btn primary" data-act="sdvpay:'+esc(id)+'">Zahlung erfassen</button>');
    if(open&&!(v.paid>0)) acts.push('<button class="btn" data-act="sdvop:'+esc(id)+'|draft">Zurück auf Entwurf</button>');
    if(paid) acts.push('<button class="btn" data-act="sdvop:'+esc(id)+'|reopen">Zahlung lösen</button>');
    var vdoc=F.vouDocUrl(v), vtitle="Beleg "+(v.supplier||"")+(v.date?" · "+de(v.date):"");
    if(v.hasDoc) acts.push('<button type="button" class="btn"'+F.docAttrs(vdoc,vtitle)+'>Beleg ansehen</button>','<a class="btn" href="'+esc(vdoc)+'&dl=1">Datei laden</a>');
    var d=document.getElementById("drawer"); d.classList.add("xl");
    F.openDrawer(drawerHead(v.cd==="D"?"Einnahme-Beleg":"Beleg",(v.supplier||"Beleg")+" · "+eur(v.gross),'<div class="row" style="gap:8px;margin-top:6px">'+vTag(v)+(v.enshrined?'<span class="tag grey">festgeschrieben</span>':'')+'</div>')+
      (open&&v.open>0.005&&F.sugBox?F.sugBox("voucher",id):'')+   /* Vorschlag: passender Bankumsatz (zreview.js) */
      '<div class="sd-acts" style="margin-bottom:14px">'+acts.join("")+'</div>'+
      '<div class="sd-split"><form data-form="sdvou" data-id="'+esc(id)+'" class="stackf" style="min-width:0">'+
        (locked?'<div class="notice" style="background:var(--sunk)">'+(v.enshrined?"Festgeschrieben – nicht mehr änderbar.":"Bezahlt – zum Ändern zuerst „Zahlung lösen“.")+'</div>':'')+
        '<div class="grid2"><label class="fl">Belegdatum<input class="f" name="date" type="date" value="'+esc(v.date||"")+'"'+(locked?" disabled":"")+'></label><label class="fl">Lieferant<input class="f" name="supplier" value="'+esc(v.supplier)+'"'+(locked?" disabled":"")+'></label></div>'+
        '<label class="fl">Beschreibung<input class="f" name="desc" value="'+esc(v.desc)+'"'+(locked?" disabled":"")+'></label>'+
        (v.cd==="D"?'':vTaxBox(v,locked))+
        '<div><div class="sec-t">Positionen</div><div id="vrows" style="display:grid;gap:8px">'+(v.positions.length?v.positions:[{}]).map(function(p){ return vrow(p,cats); }).join("")+'</div>'+(locked?'':'<button type="button" class="link" data-vadd>+ Position</button>')+'</div>'+
        '<div class="foot"><span class="num muted" id="vSum">'+eur(v.gross)+'</span>'+(locked?'':'<button class="btn primary" type="submit">Speichern</button>')+'</div><div class="err" id="vErr"></div>'+
      '</form><div style="min-width:0"><div class="sec-t">Belegdatei</div>'+(v.hasDoc?F.docEmbed(vdoc,vtitle,'<iframe class="sd-pdf" title="Beleg" src="'+esc(vdoc)+'"></iframe>'):'<div class="sd-empty" style="border:1px dashed var(--line);border-radius:12px">Keine Datei hinterlegt.<br><span class="muted">Über „Bearbeiten“ anhängen oder neu über „+ Beleg“ erfassen.</span></div>')+'</div></div>');
    if(locked) document.querySelectorAll("#vrows input,#vrows select,#vrows button").forEach(function(x){ x.disabled=true; });
    else { var rs=document.querySelector('[data-form="sdvou"] [name=rule]'); if(rs) F.taxRuleSync(rs); }
    S.vcats=cats; if(v.cd!=="D") vUvaLoad(id);
  });
}
/* Steuerliche Regel des Belegs: sichtbar und änderbar. Offen/Entwurf → mit „Speichern“; bezahlt → eigener Knopf (ändert nur die Regel,
   Zahlung bleibt); festgeschrieben → nur Anzeige. Darunter, wie die UVA den Beleg einordnet (gleicher Rechenkern wie die UVA). */
function vTaxBox(v,locked){
  var fix=locked&&!v.enshrined, emptyTxt=v.taxSet?"aus sevDesk übernommen (Steuersatz-Set, ohne Regel)":"automatisch (ohne Regel)";
  return '<div class="sd-tax">'+F.taxRuleSelect('name="rule" data-rate="[data-v=tax]"'+(v.enshrined?' disabled':'')+(fix?' data-keepdis':''),v.taxRule,{empty:emptyTxt,emptyHint:"Ohne Regel ordnet die UVA nach Steuersatz und Lieferant ein – Ergebnis siehe unten."})+
    (fix?'<button type="button" class="btn" data-act="sdvrule:'+esc(v.id)+'">Steuerregel ändern</button>':'')+
    '<div class="sd-uva muted small" id="vUva">UVA-Einordnung wird geladen …</div></div>';
}
var UVA_KL={"060":"Vorsteuer","rc":"Reverse Charge mit Vorsteuer","rcnv":"Reverse Charge ohne Vorsteuer","ige":"ig. Erwerb","ige3":"ig. Dreiecksgeschäft","ige0":"ig. Erwerb steuerfrei","eust":"Einfuhrumsatzsteuer","fx":"ausländische USt (nicht abziehbar)","none":"keine UVA-Kennzahl","pruefen":"bitte prüfen"};
function vUvaLoad(id){
  F.api("/admin/api/steuer/explain?id="+encodeURIComponent(id)+"&kind=voucher").then(function(j){
    var el=document.getElementById("vUva"); if(!el) return;
    if(!j||!j.ok||!j.positionen){ el.textContent=""; return; }
    var seen={}, rows=j.positionen.filter(function(l){ var k=l.klasse+"|"+l.begruendung; if(seen[k]) return false; seen[k]=1; return true; });
    var pr=j.pruefung;
    el.innerHTML='<b>So zählt der Beleg in der UVA:</b> '+rows.map(function(l){ return esc(UVA_KL[l.klasse]||l.klasse)+(l.kennzahlen&&l.kennzahlen!=="–"?' · KZ '+esc(l.kennzahlen):'')+' <span>('+esc(l.begruendung)+')</span>'; }).join("; ")+(j.override?' <span class="tag grey">im Cockpit eingeordnet</span>':'')+
      (pr?'<div class="sd-chk'+(pr.hint?' hint':'')+'"><b>'+(pr.hint?"Hinweis":"USt-Prüfung")+':</b> '+esc(pr.t)+(pr.fix?' <span>'+esc(pr.fix)+'</span>':'')+(pr.rule&&pr.fixable?' <button type="button" class="btn primary" data-act="sdvrulesug:'+esc(id)+'|'+esc(pr.rule)+'">'+esc(F.taxRuleName(pr.rule)||pr.ruleTxt)+' übernehmen</button>':'')+'</div>':'');
  }).catch(function(){ var el=document.getElementById("vUva"); if(el) el.textContent=""; });
}
/* Vorschlag der USt-Prüfung: Regel in die Auswahl setzen und – wie „Steuerregel ändern“ – mit Bestätigung speichern */
F.action("sdvrulesug",function(v){ var p=v.split("|"), sel=document.querySelector('[data-form="sdvou"] [name=rule]'); if(!sel) return; sel.value=p[1]; F.taxRuleSync(sel); F.actions.sdvrule(p[0]); });
F.action("sdvrule",function(id){
  var sel=document.querySelector('[data-form="sdvou"] [name=rule]'), v=vouById(id); if(!sel||!v) return; var r=sel.value;
  if(!r){ F.toast("Bitte eine Regel wählen",true); return; } if(r===String(v.taxRule||"")){ F.toast("Die Regel ist schon gesetzt"); return; }
  F.confirm("Steuerliche Regel von „"+(v.supplier||"Beleg")+"“ auf „"+F.taxRuleName(r)+"“ ändern? Die Zahlung bleibt verbunden; die UVA rechnet den Beleg danach neu ein.","Regel ändern",function(){
    F.api("/admin/api/steuer/sevfix",{body:{id:id,taxRule:r,confirm:true}}).then(function(j){ if(j&&j.ok){ F.toast("Steuerregel geändert"); reloadVouThen(id); } else F.toast((j&&j.error)||"Fehler",true); }).catch(function(){ F.toast("Keine Verbindung",true); });
  });
});
F.action("sdvou",function(id){ openVou(id); });
F.listen("click","[data-vadd]",function(){ document.getElementById("vrows").insertAdjacentHTML("beforeend",vrow({},S.vcats||[])); });
F.listen("click","[data-vdel]",function(el){ if(document.querySelectorAll("#vrows .sd-vrow").length>1) el.closest(".sd-vrow").remove(); vSum(); });
F.listen("input","#vrows",function(){ vSum(); });
function vSum(){ var g=0; document.querySelectorAll("#vrows .sd-vrow").forEach(function(r){ g+=parseFloat(r.querySelector('[data-v="gross"]').value)||0; }); var e=document.getElementById("vSum"); if(e) e.textContent="Summe brutto "+eur(g); }
F.form("sdvou",function(f){
  var id=f.getAttribute("data-id"), err=document.getElementById("vErr"), pos=[];
  document.querySelectorAll("#vrows .sd-vrow").forEach(function(r){ var g=function(k){ return r.querySelector('[data-v="'+k+'"]').value; }; if(!g("gross")) return; pos.push({accountingTypeId:g("cat"),taxRate:g("tax"),gross:g("gross"),comment:g("comment")}); });
  if(!pos.length||pos.some(function(p){ return !p.accountingTypeId; })){ err.textContent="Jede Position braucht eine Kategorie und einen Betrag."; return; }
  var btn=f.querySelector("[type=submit]"); btn.disabled=true; btn.textContent="Speichere …"; err.textContent="";
  post("/admin/api/sev/voucher-op",{op:"update",id:id,date:f.date.value,supplier:f.supplier.value,desc:f.desc.value,positions:pos,taxRule:f.rule?f.rule.value:""}).then(function(j){
    btn.disabled=false; btn.textContent="Speichern";
    if(!j||!j.ok){ err.textContent=(j&&j.error)||"Fehler"; return; }
    F.toast("Beleg gespeichert"); reloadVouThen(id);
  }).catch(function(){ btn.disabled=false; btn.textContent="Speichern"; err.textContent="Keine Verbindung."; });
});
function reloadVouThen(id){ var y=vouYear(); F.api("/admin/api/sev/vouchers?year="+y+"&force=1").then(function(j){ if(j&&j.ok){ S.vou[y]=j; F.render(); if(id) openVou(id); } }); F.load(true); }
F.action("sdvop",function(v){
  var p=v.split("|"), txt={open:"Beleg als fertig erfasst markieren (Status offen)?",draft:"Beleg zurück auf Entwurf setzen?",reopen:"Zahlung lösen? Der Beleg ist danach wieder offen; die Bankbuchung wird getrennt."}[p[1]];
  F.confirm(txt,"OK",function(){ post("/admin/api/sev/voucher-op",{op:p[1],id:p[0]}).then(function(j){ if(!j||!j.ok) return fail(j); F.toast("Erledigt"); reloadVouThen(p[0]); }).catch(function(){ fail(); }); });
});
F.action("sdvpay",function(id){
  var v=vouById(id); if(!v) return; var accs=(F.D.sev&&F.D.sev.accounts)||[], def=(accs.find(function(a){return a.isDefault;})||accs[0]||{}).id;
  F.modal('<form data-form="sdvpay" data-id="'+esc(id)+'" class="stackf"><h2 style="font-size:20px">Zahlung erfassen</h2><p style="margin:0">'+esc(v.supplier||"Beleg")+' · offen <b>'+eur(v.open)+'</b></p>'+
    '<p class="muted" style="margin:0">Für Zahlungen ohne Bankumsatz (bar, Kreditkarte, PayPal). Ist der Umsatz auf dem Konto, ordne ihn lieber unter „Bank“ zu.</p>'+
    '<div class="grid2"><label class="fl">Betrag<input class="f num" name="amount" type="number" step="0.01" min="0.01" value="'+v.open.toFixed(2)+'" required></label><label class="fl">Datum<input class="f" name="date" type="date" value="'+F.D.today+'"></label></div>'+
    '<label class="fl">Konto<select class="f" name="account">'+accs.map(function(a){ return '<option value="'+esc(a.id)+'"'+(a.id===def?" selected":"")+'>'+esc(a.name)+'</option>'; }).join("")+'</select></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Buchen</button></span></div><div class="err" id="vpErr"></div></form>',"narrow");
});
F.form("sdvpay",function(f){
  var id=f.getAttribute("data-id"), err=document.getElementById("vpErr"); err.textContent="Buche …";
  post("/admin/api/sev/voucher-op",{op:"pay",id:id,amount:f.amount.value,date:f.date.value,accountId:f.account.value}).then(function(j){ if(!j||!j.ok){ err.textContent=(j&&j.error)||"Fehler"; return; } F.closeModal(); F.toast("Zahlung gebucht"); reloadVouThen(id); }).catch(function(){ err.textContent="Keine Verbindung."; });
});

/* ================= Kontakte & Artikel ================= */
function loadCt(force){ load("ct","/admin/api/sev/contacts"+(force?"?force=1":""),function(j){ S.ct=j; }); }
function loadParts(force){ load("parts","/admin/api/sev/parts"+(force?"?force=1":""),function(j){ S.parts=j; }); }
F.sevParts=function(cb){ if(S.parts&&S.parts.ok) return cb(S.parts.parts); F.api("/admin/api/sev/parts").then(function(j){ S.parts=j; cb(j&&j.ok?j.parts:[]); }).catch(function(){ cb([]); }); };
F.action("sdstt",function(k){ F.UI.stT=k; F.render(); });
F.action("sdctf",function(k){ F.UI.ctF=k; F.render(); });
F.action("sdctreload",function(){ S.ct=null; loadCt(true); F.render(); });
F.action("sdptreload",function(){ S.parts=null; loadParts(true); F.render(); });
F.listen("input","[data-ctq]",function(el){ F.UI.ctQ=el.value; clearTimeout(el._d); el._d=setTimeout(F.render,250); });
F.listen("input","[data-ptq]",function(el){ F.UI.ptQ=el.value; clearTimeout(el._d); el._d=setTimeout(F.render,250); });
function renderStamm(){
  var t=F.UI.stT;
  var tabs='<div class="chips" style="margin-bottom:12px">'+chip("sdstt","kontakte",t,"Kontakte",S.ct&&S.ct.ok?S.ct.contacts.length:null)+chip("sdstt","artikel",t,"Artikel & Leistungen",S.parts&&S.parts.ok?S.parts.parts.length:null)+'</div>';
  return tabs+(t==="artikel"?renderParts():renderContacts());
}
function renderContacts(){
  if(!S.ct){ loadCt(); return loading("Lade Kontakte …"); }
  if(!S.ct.ok) return errBox(S.ct,"sdctreload");
  var q=(F.UI.ctQ||"").toLowerCase(), f=F.UI.ctF;
  var list=S.ct.contacts.filter(function(c){
    if(f==="kunde"&&c.cat!=="3") return false; if(f==="lief"&&c.cat!=="2") return false; if(f==="open"&&!(c.open>0.005)) return false;
    return !q||(c.name+" "+c.nr+" "+(c.email&&c.email.value||"")+" "+(c.address&&c.address.city||"")+" "+c.vat).toLowerCase().indexOf(q)>-1;
  });
  if(!q&&f==="all") list=list.slice().sort(function(a,b){ return String(b.lastInvoice).localeCompare(String(a.lastInvoice))||a.name.localeCompare(b.name,"de"); });
  return '<section class="panel"><div class="sd-tools"><div class="chips">'+chip("sdctf","all",f,"Alle",S.ct.contacts.length)+chip("sdctf","kunde",f,"Kunden")+chip("sdctf","lief",f,"Lieferanten")+chip("sdctf","open",f,"Mit offenen Rechnungen")+'</div>'+
    '<div class="row" style="gap:8px"><input class="f" placeholder="Suchen: Name, Ort, E-Mail, UID …" data-ctq data-keepfocus="ctq" value="'+esc(F.UI.ctQ)+'"><button class="btn primary" data-act="sdct:new">+ Kontakt</button></div></div>'+
    '<div class="sd-list">'+(list.slice(0,150).map(function(c){
      return '<div class="sd-row" role="button" tabindex="0" data-act="sdct:'+esc(c.id)+'"><div style="min-width:0"><div class="t">'+esc(c.name)+(c.catLabel?' <span class="tag grey" style="font-size:11px">'+esc(c.catLabel)+'</span>':'')+'</div><div class="s">'+esc([c.nr?"Nr. "+c.nr:"",c.email&&c.email.value,c.address&&[c.address.zip,c.address.city].filter(Boolean).join(" "),c.vat].filter(Boolean).join(" · ")||"—")+'</div></div>'+
        '<div class="r">'+(c.invoices?'<span class="amt">'+eur0(c.revenue)+'</span><span class="muted">'+c.invoices+' Rechnung'+(c.invoices===1?"":"en")+'</span>':'')+(c.open>0.005?'<span class="tag warn">'+eur(c.open)+' offen</span>':'')+'</div></div>';
    }).join("")||'<div class="sd-empty">Keine Kontakte gefunden.</div>')+'</div>'+(list.length>150?'<div class="muted" style="padding:10px 16px">'+(list.length-150)+' weitere – Suche verfeinern.</div>':'')+'</section>';
}
F.action("sdct",function(id){
  var c=id==="new"?{id:"",name:"",cat:"3",email:null,phone:null,address:null,vat:"",nr:"",note:"",timeToPay:0}:S.ct.contacts.find(function(x){return x.id===id;}); if(!c) return;
  var a=c.address||{}, inv=id!=="new"&&F.D.sev?F.D.sev.invoices.filter(function(i){ return i.contactId===c.id; }).slice(0,12):[];
  var d=document.getElementById("drawer"); d.classList.remove("xl");
  F.openDrawer(drawerHead(id==="new"?"Neuer Kontakt":"Kontakt",c.name||"Neuer Kontakt",c.nr?'<div class="muted">Kundennummer '+esc(c.nr)+'</div>':'')+
    (id!=="new"?'<div class="sd-acts" style="margin-bottom:14px"><button class="btn primary" data-act="sdctinv:'+esc(c.id)+'">Neue Rechnung</button><button class="btn" data-act="sdctoffer:'+esc(c.id)+'">Neues Angebot</button>'+(c.email?'<button class="btn" data-act="sdctmail:'+esc(c.id)+'">Mail schreiben</button>':'')+'</div>':'')+
    '<form data-form="sdct" data-id="'+esc(c.id)+'" class="stackf">'+
      '<label class="fl">Name / Firma<input class="f" name="name" required value="'+esc(c.name)+'"></label>'+
      '<div class="grid2"><label class="fl">Art<select class="f" name="cat">'+[["3","Kunde"],["2","Lieferant"],["4","Partner"],["28","Interessent"]].map(function(o){ return '<option value="'+o[0]+'"'+(c.cat===o[0]?" selected":"")+'>'+o[1]+'</option>'; }).join("")+'</select></label><label class="fl">Zahlungsziel (Tage)<input class="f num" name="ttp" type="number" min="0" max="365" value="'+(c.timeToPay||"")+'" placeholder="Standard"></label></div>'+
      '<div class="grid2"><label class="fl">E-Mail<input class="f" name="email" type="email" value="'+esc(c.email&&c.email.value||"")+'"></label><label class="fl">Telefon<input class="f" name="phone" value="'+esc(c.phone&&c.phone.value||"")+'"></label></div>'+
      '<label class="fl">Straße<input class="f" name="street" value="'+esc(a.street||"")+'"></label>'+
      '<div class="grid2"><label class="fl">PLZ<input class="f" name="zip" value="'+esc(a.zip||"")+'"></label><label class="fl">Ort<input class="f" name="city" value="'+esc(a.city||"")+'"></label></div>'+
      '<label class="fl">UID-Nummer<input class="f" name="vat" value="'+esc(c.vat||"")+'" placeholder="ATU…"></label>'+
      '<label class="fl">Notiz<textarea class="f" name="note" rows="2">'+esc(c.note||"")+'</textarea></label>'+
      '<div class="foot"><span></span><button class="btn primary" type="submit">'+(id==="new"?"Anlegen":"Speichern")+'</button></div><div class="err" id="ctErr"></div></form>'+
    (inv.length?'<div style="margin-top:18px"><div class="sec-t">Rechnungen</div><div class="panel sd-list">'+inv.map(F.sevInvRow).join("")+'</div></div>':''));
});
F.form("sdct",function(f){
  var id=f.getAttribute("data-id"), c=id?S.ct.contacts.find(function(x){return x.id===id;}):null, err=document.getElementById("ctErr"), btn=f.querySelector("[type=submit]");
  btn.disabled=true; err.textContent="";
  post("/admin/api/sev/contact",{id:id,person:!!(c&&c.person),name:f.name.value,cat:f.cat.value,timeToPay:f.ttp.value,email:f.email.value,emailCur:c&&c.email,phone:f.phone.value,phoneCur:c&&c.phone,vat:f.vat.value,note:f.note.value,
    address:{id:c&&c.address&&c.address.id,street:f.street.value,zip:f.zip.value,city:f.city.value,country:c&&c.address&&c.address.country}}).then(function(j){
    btn.disabled=false;
    if(!j||!j.ok){ err.textContent=(j&&j.error)||"Fehler"; return; }
    F.toast(id?"Kontakt gespeichert":"Kontakt angelegt"); F.closeDrawer(); S.ct=null; loadCt(true);
  }).catch(function(){ btn.disabled=false; err.textContent="Keine Verbindung."; });
});
function ctPre(id){ var c=S.ct.contacts.find(function(x){return x.id===id;})||{}; var a=c.address||{}; return {contactName:c.name,email:c.email&&c.email.value||"",address:[c.name,a.street,[a.zip,a.city].filter(Boolean).join(" ")].filter(Boolean).join("\n"),uid:c.vat||undefined,timeToPay:c.timeToPay?String(c.timeToPay):undefined}; }
F.action("sdctinv",function(id){ F.closeDrawer(); F.openInvoice(ctPre(id)); });
F.action("sdctoffer",function(id){ F.closeDrawer(); F.openInvoice(Object.assign(ctPre(id),{kind:"offer"})); });
F.action("sdctmail",function(id){ var c=S.ct.contacts.find(function(x){return x.id===id;}); F.closeDrawer(); F.compose({to:c.email.value}); });

function renderParts(){
  if(!S.parts){ loadParts(); return loading("Lade Artikel …"); }
  if(!S.parts.ok) return errBox(S.parts,"sdptreload");
  var q=(F.UI.ptQ||"").toLowerCase(), list=S.parts.parts.filter(function(p){ return !q||(p.name+" "+p.nr+" "+p.text).toLowerCase().indexOf(q)>-1; });
  return '<section class="panel"><div class="sd-tools"><span class="muted">Artikel erscheinen beim Schreiben einer Rechnung oder eines Angebots als Vorschlag – Preis und Text werden übernommen.</span>'+
    '<div class="row" style="gap:8px"><input class="f" placeholder="Suchen …" data-ptq data-keepfocus="ptq" value="'+esc(F.UI.ptQ)+'"><button class="btn primary" data-act="sdpt:new">+ Artikel</button></div></div>'+
    '<div class="sd-list">'+(list.map(function(p){
      return '<div class="sd-row" role="button" tabindex="0" data-act="sdpt:'+esc(p.id)+'"><div style="min-width:0"><div class="t">'+esc(p.name)+(p.active?'':' <span class="tag grey" style="font-size:11px">inaktiv</span>')+'</div><div class="s">'+esc([p.nr,p.text].filter(Boolean).join(" · ")||"—")+'</div></div><div class="r"><span class="amt">'+eur(p.priceGross)+'</span><span class="muted">brutto · '+esc(p.taxRate)+' % USt</span></div></div>';
    }).join("")||'<div class="sd-empty"><b>Noch keine Artikel</b>Lege deine Standard-Leistungen an (z. B. Hosting, Stundensatz), dann sind Rechnungen in Sekunden geschrieben.</div>')+'</div></section>';
}
F.action("sdpt",function(id){
  var p=id==="new"?{id:"",name:"",nr:"",text:"",taxRate:20,priceGross:"",active:true}:S.parts.parts.find(function(x){return x.id===id;}); if(!p) return;
  F.modal('<form data-form="sdpt" data-id="'+esc(p.id)+'" class="stackf"><div class="row-between"><h2 style="font-size:20px">'+(p.id?"Artikel bearbeiten":"Neuer Artikel")+'</h2>'+F.btnClose()+'</div>'+
    '<div class="grid2"><label class="fl">Bezeichnung<input class="f" name="name" required value="'+esc(p.name)+'"></label><label class="fl">Artikelnummer<input class="f" name="nr" value="'+esc(p.nr)+'"'+(p.id?" disabled":"")+' placeholder="automatisch"></label></div>'+
    '<label class="fl">Beschreibung (erscheint auf der Rechnung)<textarea class="f" name="text" rows="3">'+esc(p.text)+'</textarea></label>'+
    '<div class="grid2"><label class="fl">Preis brutto €<input class="f num" name="price" type="number" step="0.01" min="0" required value="'+esc(p.priceGross)+'"></label><label class="fl">USt<select class="f" name="tax">'+[20,13,10,0].map(function(r){ return '<option value="'+r+'"'+(+p.taxRate===r?" selected":"")+'>'+r+' %</option>'; }).join("")+'</select></label></div>'+
    '<label class="row" style="gap:8px;font-size:14px"><input type="checkbox" name="active"'+(p.active?" checked":"")+'> aktiv</label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Speichern</button></span></div><div class="err" id="ptErr"></div></form>',"narrow");
});
F.form("sdpt",function(f){
  var id=f.getAttribute("data-id"), err=document.getElementById("ptErr");
  post("/admin/api/sev/part",{id:id,name:f.name.value,nr:f.nr.value,text:f.text.value,priceGross:f.price.value,taxRate:f.tax.value,active:f.active.checked}).then(function(j){
    if(!j||!j.ok){ err.textContent=(j&&j.error)||"Fehler"; return; }
    F.closeModal(); F.toast("Artikel gespeichert"); S.parts=null; loadParts(true);
  }).catch(function(){ err.textContent="Keine Verbindung."; });
});

/* ================= Registrierung ================= */
F.geldTab({id:"rechnungen",label:"Rechnungen",order:12,sub:"Alle Rechnungen: senden, Zahlung erfassen, mahnen, stornieren. Klick auf eine Rechnung öffnet die Details mit PDF.",render:renderRechnungen});
F.geldTab({id:"bank",label:"Bank",order:14,sub:"Offene Bankumsätze mit passenden Rechnungen und Belegen zuordnen – meistens mit einem Klick.",render:renderBank});
F.geldTab({id:"belege",label:"Belege",order:16,sub:"Ausgaben und Einnahme-Belege des Jahres: ansehen, korrigieren, Zahlung erfassen.",render:renderBelege});
F.geldTab({id:"stamm",label:"Kontakte & Artikel",order:18,sub:"Kunden, Lieferanten und deine Standard-Leistungen.",render:renderStamm});
F.action("sdtab",function(v){ var p=v.split("|"); F.UI.geldTab=p[0]; if(p[0]==="rechnungen"&&p[1]) F.UI.rgF=p[1]; if(p[0]==="belege"&&p[1]) F.UI.vF=p[1]; F.go("geld"); });
F.onData(function(){ var y=vouYear(); if(S.vou[y]&&Date.now()-Date.parse(S.vou[y].fetchedAt||0)>5*60000) delete S.vou[y]; });

/* Suche */
F.searcher(function(q){
  var out=[];
  if(S.ct&&S.ct.ok) S.ct.contacts.filter(function(c){ return (c.name+" "+(c.email&&c.email.value||"")).toLowerCase().indexOf(q)>-1; }).slice(0,4).forEach(function(c){ out.push({group:"Kontakte",label:c.name,sub:c.email&&c.email.value||c.catLabel,act:"sdctgo:"+c.id}); });
  return out;
});
F.action("sdctgo",function(id){ F.UI.geldTab="stamm"; F.UI.stT="kontakte"; F.go("geld"); setTimeout(function(){ F.actions.sdct(id); },50); });

/* „Heute“: was in der Buchhaltung ansteht */
F.feed(function(){
  var sev=F.D&&F.D.sev, out=[]; if(!sev) return out;
  var drafts=sev.invoices.filter(function(i){ return i.status===100; });
  if(drafts.length) out.push({id:"sd-drafts-"+drafts.length,rank:3,sev:"info",icon:"euro",tag:["info","Rechnungen"],t:drafts.length+(drafts.length===1?" Rechnungsentwurf":" Rechnungsentwürfe")+" noch nicht versendet",d:drafts.slice(0,3).map(function(i){ return i.contact+" "+eur(i.gross); }).join(" · "),acts:[["Ansehen","sdtab:rechnungen|draft","primary"]]});
  if(sev.unassigned) out.push({id:"sd-bank-"+sev.unassigned,rank:5,sev:"info",icon:"bank",tag:["info","Bank"],t:sev.unassigned+" Bankumsätze nicht zugeordnet",d:"Vorschläge stehen bereit – meist ein Klick je Umsatz.",acts:[["Zuordnen","sdtab:bank","primary"]]});
  var vd=sev.vouchers&&sev.vouchers.drafts; if(vd) out.push({id:"sd-vd-"+vd,rank:6,sev:"info",icon:"euro",tag:["info","Belege"],t:vd+(vd===1?" Beleg-Entwurf":" Beleg-Entwürfe"),d:"Prüfen und als fertig markieren.",acts:[["Ansehen","sdtab:belege|draft"]]});
  return out;
});
})();
