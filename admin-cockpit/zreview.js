/* Finanzen → „Zur Prüfung“: zentrale Stelle für alles, was das Cockpit selbst erkennt (Bankregeln, Mollie, Geldtransit,
   Belegdateien aus Mails, USt-Zahlung, wiederkehrende Belege/Rechnungen, Mahnungen). Nichts wird automatisch gebucht –
   „Bestätigen“ führt genau die vorgeschlagene Aktion aus, „Ablehnen“ merkt sich den Vorschlag (kommt nicht wieder).
   Außerdem: F.sugBox(kind,id) – „Vorschlag“-Kasten oben beim Öffnen eines offenen Umsatzes bzw. unbezahlten Belegs (nie automatisch). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, de=F.de, UI=F.UI;
var RV=null, busy=false, SG={}, OPEN={};
try{ if(/[?&]fin=review\b/.test(location.search)){ UI.fin="review"; F.ls("fsc_fin_page","review"); history.replaceState(null,"",location.pathname+"#geld"); } }catch(e){}
F.css(
  '.rv-cnt{display:inline-block;min-width:18px;padding:0 6px;margin-left:4px;border-radius:9px;background:var(--bad);color:#fff;font-size:11px;line-height:18px;text-align:center;font-weight:700}'+
  '.rv-hot{background:var(--warn-soft)!important}'+
  '.rv-g{margin-bottom:14px}.rv-gh{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}.rv-gh b{font-size:15px}'+
  '.rv-i{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:10px 0;border-top:1px solid var(--line);flex-wrap:wrap}'+
  '.rv-l{min-width:0;flex:1 1 260px}.rv-l b{display:block}.rv-l span{display:block;color:var(--ink-2);font-size:12.5px;overflow-wrap:anywhere}.rv-l .rv-err{color:var(--bad)}'+
  '.rv-r{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.rv-amt{font-variant-numeric:tabular-nums;font-weight:700;min-width:90px;text-align:right}'+
  '.rv-sug{border:1.5px solid var(--warn);background:var(--warn-soft);border-radius:12px;padding:10px 12px;margin:0 0 12px}.rv-sug h4{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--warn)}'+
  '.rv-sc{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:6px 0;border-top:1px solid rgba(0,0,0,.07);flex-wrap:wrap}.rv-sc:first-of-type{border-top:0}.rv-sc .rv-l span{font-size:12px}'+
  '.rv-why{color:var(--ok)!important}'
);
function load(){ if(busy) return; busy=true; F.api("/admin/api/fin/proposals").then(function(j){ busy=false; RV=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler",items:[],groups:[],count:0}; F.render(); }).catch(function(){ busy=false; RV={ok:false,error:"Vorschläge nicht erreichbar",items:[],groups:[],count:0}; }); }
F.reviewCount=function(){ if(!RV) load(); return RV&&RV.ok?RV.count||0:0; };
F.reviewReset=function(){ RV=null; load(); };
F.onData(function(){ RV=null; load(); });
function amt(x){ return x.amount==null?'':'<span class="rv-amt '+(x.amount<0?"bad-t":"ok-t")+'">'+eur(x.amount)+'</span>'; }
function viewBtn(x){ var a=x.voucherId?"sdvou:"+x.voucherId:x.invoiceId?"fin:invd:"+x.invoiceId:(x.txId||(x.txIds||[])[0])?"ftxassign:"+(x.txId||x.txIds[0]):""; return a?'<button class="btn" data-act="'+esc(a)+'">Ansehen</button>':''; }
function item(x){
  return '<div class="rv-i"><div class="rv-l"><b>'+esc(x.title||"Vorschlag")+'</b><span>'+(x.date?de(x.date)+' · ':'')+esc(x.detail||"")+'</span>'+(x.source?'<span>Quelle: '+esc(x.source)+'</span>':'')+(x.hint?'<span class="rv-err">'+esc(x.hint)+'</span>':'')+(x.error?'<span class="rv-err">Letzter Versuch: '+esc(x.error)+'</span>':'')+'</div>'+
    '<div class="rv-r">'+amt(x)+'<button class="btn primary" data-act="rvok:'+esc(x.id)+'">Bestätigen</button><button class="btn" data-act="rvno:'+esc(x.id)+'">Ablehnen</button>'+((x.voucherId||x.invoiceId||x.txId||(x.txIds||[]).length)?'<button class="btn" data-act="rvdet:'+esc(x.id)+'">Details</button>':viewBtn(x))+'</div></div>';
}
/* Details: Buchung(en) und Beleg/Rechnung nebeneinander, Beleg mit Vorschau – direkt bestätigen oder ablehnen */
F.action("rvdet",function(id){
  F.modal('<div class="rvd"><div class="row-between"><h2 style="font-size:20px">Details</h2>'+F.btnClose()+'</div><p class="muted">Lade …</p></div>',"wide");
  F.api("/admin/api/fin/proposals?detail="+encodeURIComponent(id)).then(function(j){
    var box=document.querySelector(".rvd"); if(!box) return;
    if(!j||!j.ok){ box.innerHTML='<div class="row-between"><h2 style="font-size:20px">Details</h2>'+F.btnClose()+'</div><p class="rv-err">'+esc((j&&j.error)||"Nicht verfügbar")+'</p>'; return; }
    var x=j.item, tx=(j.txs||[]).map(function(t){ return '<div class="rvd-c"><span class="rvd-k">Buchung · '+esc(t.account)+(t.status!==100?' · nicht mehr offen':'')+'</span><b class="'+(t.amount<0?"bad-t":"ok-t")+'">'+eur(t.amount)+'</b><span>'+de(t.date)+(t.name?' · '+esc(t.name):'')+'</span><span class="muted" style="word-break:break-word">'+esc(t.purpose)+'</span></div>'; }).join("");
    var v=j.voucher, vh=v?'<div class="rvd-c"><span class="rvd-k">Beleg</span><b>'+eur(v.gross)+'</b><span>'+esc(v.supplier||"—")+(v.date?' · '+de(v.date):'')+'</span>'+(v.desc?'<span class="muted">'+esc(v.desc)+'</span>':'')+(v.positions||[]).map(function(p){ return '<span class="muted">'+esc(p.text||"Position")+' · '+eur(p.gross)+' · '+p.rate+' %</span>'; }).join("")+(v.paid>0?'<span class="muted">bereits bezahlt '+eur(v.paid)+'</span>':'')+'<span><button type="button" class="btn"'+F.docAttrs(v.doc,"Beleg "+(v.supplier||""))+'>Vollbild</button></span></div>':'';
    var iv=j.invoice, ih=iv?'<div class="rvd-c"><span class="rvd-k">Rechnung '+esc(iv.nr)+'</span><b>'+eur(iv.gross)+'</b><span>'+esc(iv.contact||"—")+(iv.date?' · '+de(iv.date):'')+'</span>'+(iv.header?'<span class="muted">'+esc(iv.header)+'</span>':'')+(iv.paid>0?'<span class="muted">bereits bezahlt '+eur(iv.paid)+'</span>':'')+'<span><button type="button" class="btn"'+F.docAttrs(iv.pdf,"Rechnung "+iv.nr)+'>Vollbild</button></span></div>':'';
    var prev=v?v.doc:iv?iv.pdf:"";
    box.innerHTML='<div class="row-between"><h2 style="font-size:20px">'+esc(x.title||"Vorschlag")+'</h2>'+F.btnClose()+'</div>'+(x.detail?'<p class="muted" style="margin:0">'+esc(x.detail)+'</p>':'')+
      '<div class="rvd-g"><div class="rvd-s">'+tx+vh+ih+'</div>'+(prev?'<iframe class="rvd-f" src="'+esc(prev)+'" title="Beleg-Vorschau"></iframe>':'')+'</div>'+
      '<div class="foot"><span>'+amt(x)+'</span><span class="row"><button class="btn" data-act="rvno:'+esc(x.id)+'">Ablehnen</button><button class="btn primary" data-act="rvok:'+esc(x.id)+'">Bestätigen</button></span></div>';
  });
});
F.css(".rvd-g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:14px;margin-top:12px}.rvd-s{display:flex;flex-direction:column;gap:10px}.rvd-c{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:1px solid var(--line,rgba(127,127,127,.25));border-radius:12px}.rvd-k{font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.65}.rvd-c b{font-size:18px}.rvd-f{width:100%;min-height:60vh;border:1px solid var(--line,rgba(127,127,127,.25));border-radius:12px;background:#fff}@media(max-width:760px){.rvd-g{grid-template-columns:1fr}.rvd-f{min-height:50vh}}");
F.reviewPage=function(mobile){
  if(!RV){ load(); return (mobile?'':'<div class="fsd-head"><div><h1>Zur Prüfung</h1></div></div>')+'<div class="sd-empty">Lade Vorschläge …</div>'; }
  if(!RV.ok) return '<div class="notice">'+esc(RV.error||"Fehler")+' <button class="btn" data-act="rvreload">Neu laden</button></div>';
  var groups=RV.groups||[], items=RV.items||[];
  var head=mobile?'':'<div class="fsd-head"><div><h1>Zur Prüfung</h1><p>Was das Cockpit selbst erkannt hat – gebucht wird erst, wenn du bestätigst.</p></div><div class="fsd-btns"><button class="btn" data-act="rvreload">Aktualisieren</button></div></div>';
  var body=groups.length?groups.map(function(g){ var list=items.filter(function(x){ return x.kind===g.kind; });
      return '<section class="'+(mobile?"fsm-card":"fsd-card")+' rv-g"><div class="rv-gh"><b>'+esc(g.label)+' <span class="muted">('+g.count+')</span></b>'+(g.count>1?'<button class="btn primary" data-act="rvall:'+esc(g.kind)+'">Alle bestätigen ('+g.count+')</button>':'')+'</div>'+list.map(item).join("")+'</section>'; }).join("")
    :'<section class="'+(mobile?"fsm-card":"fsd-card")+'"><p class="sd-empty">Nichts zu prüfen. 🎉<br><span class="muted">Neue Vorschläge (Bankregeln, Mollie, Geldtransit, Belegdateien, USt-Zahlung …) erscheinen hier – nichts wird ohne dich gebucht.</span></p></section>';
  var log=(RV.log||[]).length?'<details class="'+(mobile?"fsm-card":"fsd-card")+'"><summary>Zuletzt erledigt</summary>'+RV.log.slice(0,12).map(function(l){ return '<div class="muted" style="font-size:12.5px;padding:3px 0">'+de(String(l.at).slice(0,10))+' · '+(l.rejected?"abgelehnt":"bestätigt")+' · '+esc(l.title||"")+(l.amount!=null?' · '+eur(l.amount):'')+'</div>'; }).join("")+'</details>':'';
  return head+body+log;
};
function done(j,msg){ if(F.finAfterBook) F.finAfterBook(); if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); RV=null; load(); return; } RV=j; F.toast(msg); if(F.finTxReset) F.finTxReset(); F.load(true); }
function find(id){ return RV&&(RV.items||[]).find(function(x){ return x.id===id; }); }
F.action("rvreload",function(){ RV=null; load(); });
F.action("rvok",function(id){ var x=find(id); if(!x) return; F.confirm("Bestätigen: "+x.title+(x.amount!=null?" ("+eur(x.amount)+")":"")+"?","Bestätigen",function(){ F.toast("Führe aus …"); F.api("/admin/api/fin/proposals",{body:{confirm:true,op:"accept",id:id}}).then(function(j){ done(j,"Erledigt: "+x.title); }); }); });
F.action("rvno",function(id){ var x=find(id); if(!x) return; F.api("/admin/api/fin/proposals",{body:{confirm:true,op:"reject",id:id}}).then(function(j){ done(j,x.kind==="dunning"?"Mahnstufe übersprungen":"Abgelehnt – kommt nicht wieder"); }); });
F.action("rvall",function(kind){ var g=(RV&&RV.groups||[]).find(function(x){ return x.kind===kind; }); if(!g) return;
  F.confirm("Alle "+g.count+" Vorschläge „"+g.label+"“ bestätigen und ausführen?","Alle bestätigen",function(){ F.toast("Führe "+g.count+" Vorschläge aus …"); F.api("/admin/api/fin/proposals",{body:{confirm:true,op:"acceptAll",kind:kind}}).then(function(j){ var r=(j&&j.results)||[], bad=r.filter(function(x){ return !x.ok; }); done(j,bad.length?(r.length-bad.length)+" erledigt, "+bad.length+" Fehler: "+bad[0].error:r.length+" erledigt"); }); }); });
F.action("rvgo",function(){ UI.fin="review"; F.ls("fsc_fin_page","review"); F.go("geld"); window.scrollTo(0,0); });
F.feed(function(){ var n=F.reviewCount(); if(!n) return []; var g=(RV.groups||[]).map(function(x){ return x.label+" ("+x.count+")"; }).join(" · ");
  return [{id:"fin-review-"+n,rank:2,sev:"warn",icon:"bank",tag:["warn","Finanzen"],t:n+(n===1?" Vorschlag":" Vorschläge")+" zur Prüfung",d:g+" – nichts wird ohne dich gebucht.",acts:[["Prüfen","rvgo","primary"]]}]; });

/* ---------- Vorschlag beim Öffnen (Umsatz / Beleg) ---------- */
F.sugBox=function(kind,id){
  var key=kind+"-"+String(id).replace(/[^\w-]/g,""), el="rvs-"+key;
  F.api("/admin/api/fin/suggest?"+(kind==="voucher"?"voucher=":"tx=")+encodeURIComponent(id)).then(function(j){ var n=document.getElementById(el); if(!n) return;
    var c=j&&j.ok?(j.candidates||[]):[]; SG[key]=c; OPEN[key]={kind:kind,id:id};
    if(!c.length){ n.remove(); return; }
    n.innerHTML='<h4>Vorschlag</h4>'+c.slice(0,3).map(function(x,i){ return '<div class="rv-sc"><div class="rv-l"><b>'+(i===0?"★ ":"")+esc(x.label)+'</b><span>'+esc(x.sub||"")+'</span><span class="rv-why">'+esc((x.reasons||[]).join(" · "))+'</span></div><div class="rv-r"><button type="button" class="btn'+(i===0?" primary":"")+'" data-act="rvsug:'+esc(key)+'~'+i+'">Übernehmen</button></div></div>'; }).join("");
  }).catch(function(){ var n=document.getElementById(el); if(n) n.remove(); });
  return '<div class="rv-sug" id="'+esc(el)+'"><span class="muted small">Suche passenden Vorschlag …</span></div>';
};
/* „wie zuletzt“ des geöffneten Umsatzes (falls schon geladen): {category, rate, rc, taxRule, supplier} – zum Vorbelegen von „Ausgabe buchen“ */
F.sugLike=function(id){ var c=(SG["tx-"+String(id).replace(/[^\w-]/g,"")]||[]).filter(function(x){ return x.type==="like"; })[0]; return c&&c.do&&c.do.body&&c.do.body.act||null; };
F.action("rvsug",function(v){ var p=String(v).split("~"), c=(SG[p[0]]||[])[+p[1]]; if(!c||!c.do) return;
  F.confirm("Übernehmen: "+c.label+"?","Übernehmen",function(){ F.toast("Ordne zu …"); F.api(c.do.url,{body:c.do.body}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; }
    F.closeModal(); F.closeDrawer(); var S=F.sevState; if(S&&S.bank&&S.bank.transactions&&c.do.body.txId) S.bank.transactions=S.bank.transactions.filter(function(t){ return t.id!==c.do.body.txId; });
    F.toast("Übernommen: "+c.label); RV=null; if(F.finTxReset) F.finTxReset(); F.load(true); }); }); });
})();
