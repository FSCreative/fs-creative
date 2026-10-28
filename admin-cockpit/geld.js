/* Ansicht "Geld & Abgleich": Kennzahlen der Buchhaltung, Abgleich Plattformen ↔ Rechnungen, Rechnungen, Bank. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;
/* Symbole für Finanzen, Belege und Zahlungen (24×24, Strich) – nur falls FSC.icons sie noch nicht kennt */
(function(I){ if(F.icons) Object.keys(I).forEach(function(k){ if(!F.icons[k]) F.icons[k]=I[k]; }); })({
  doc:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  beleg:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  wallet:'<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5.5a2.5 2.5 0 0 0 0 5H20v10a1 1 0 0 1-1 1H5.5A2.5 2.5 0 0 1 3 17.5v-11"/><path d="M16.5 14.5h.01"/>',
  card:'<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  download:'<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  upload:'<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
  send:'<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  chevD:'<path d="m6 9 6 6 6-6"/>', chevR:'<path d="m9 6 6 6-6 6"/>', chevL:'<path d="m15 6-6 6 6 6"/>',
  checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alertCircle:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  offer:'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'
});
F.UI.money=F.UI.money||"zu"; F.UI.invQ=F.UI.invQ||""; F.UI.invF=F.UI.invF||"open"; F.UI.geldTab=F.UI.geldTab||"uebersicht";
/* Unterpunkte von "Finanzen": weitere Module melden sich mit F.geldTab({id,label,order,render}) an */
F.geldTabs=[{id:"uebersicht",label:"Übersicht",order:10},{id:"prognose",label:"Jahresprognose",order:20}];
F.geldTab=function(t){ F.geldTabs.push(t); F.geldTabs.sort(function(a,b){ return a.order-b.order; }); };
(F._pendTabs||[]).forEach(F.geldTab); F._pendTabs=[];   // Module, die vor geld.js geladen werden (z. B. finimport.js)
F.action("geldtab",function(k){ F.UI.geldTab=k; F.render(); window.scrollTo(0,0); });
function subnav(){ return '<div class="subnav" role="tablist">'+F.geldTabs.map(function(t){ return '<button role="tab" data-act="geldtab:'+t.id+'" aria-current="'+(F.UI.geldTab===t.id)+'">'+esc(t.label)+'</button>'; }).join("")+'</div>'; }

F.barChart=function(vals,opts){
  opts=opts||{}; var W=640,H=210,pl=46,pb=24,pt=12, mx=Math.max.apply(null,vals.concat([1])), step=Math.pow(10,Math.floor(Math.log10(mx))), top=Math.ceil(mx/step)*step, bw=(W-pl)/vals.length, M=opts.labels||["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  var y=function(v){ return pt+(H-pt-pb)*(1-v/top); }, g="", hl=opts.highlight;
  [0,top/2,top].forEach(function(t){ g+='<line x1="'+pl+'" x2="'+W+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="var(--line)"/><text x="'+(pl-8)+'" y="'+(y(t)+4)+'" text-anchor="end" font-size="11" fill="var(--ink-3)" font-family="ui-monospace,monospace">'+(t>=1000?(t/1000).toLocaleString("de-AT")+"k":Math.round(t))+'</text>'; });
  vals.forEach(function(v,i){ var x=pl+i*bw+bw*.2, w=bw*.6, h=i===hl;
    if(v>0) g+='<rect x="'+x+'" y="'+y(v)+'" width="'+w+'" height="'+(y(0)-y(v))+'" rx="4" fill="'+(h?"var(--glow)":"var(--ink)")+'" opacity="'+(h?1:.82)+'"><title>'+M[i]+': '+(opts.fmt||eur)(v)+'</title></rect>';
    else g+='<rect x="'+x+'" y="'+(y(0)-2)+'" width="'+w+'" height="2" fill="var(--line)"/>';
    g+='<text x="'+(x+w/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="var(--ink-3)">'+M[i]+'</text>'; });
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(opts.label||"Diagramm")+'">'+g+'</svg>';
};
function stateTag(l){ if(!l) return '<span class="tag grey">keine Rechnung</span>'; var m={bezahlt:"ok",offen:"warn",ueberfaellig:"bad",entwurf:"grey",fehlt:"bad",manuell:"grey",alt:"grey",neu:"info",sonst:"grey",storniert:"grey"}; return '<span class="tag '+(m[l.state]||"grey")+'">'+esc(l.label)+'</span>'; }
function invLink(l){ if(!l) return ""; return l.id?'<a href="#" data-act="fin:invd:'+esc(l.id)+'">'+esc(l.nr||"Entwurf")+'</a>':esc(l.nr||"manuell"); }
function problem(x){ return x.refund>0.005||(x.invoices||[]).some(function(l){return l&&(l.state==="fehlt"||l.state==="ueberfaellig");})||x.settledWithoutInvoice>0.005; }

/* VALUERO-Abrechnungen, die das frühere Dashboard nur im Browser gespeichert hat */
/* geprüft gegen ALLE Abrechnungs-Einträge am Server (nicht nur die letzten 4 im Abgleich) – sonst käme der Altbestand doppelt (VA-8) */
var BILLG=null, billgBusy=false;
function valueroLegacy(){
  var st=F.ls("fsc_einnahmen_dashboard_v1"), settled=Object.assign({antonhaus:[{amountCents:34754,at:"2026-07-30T00:00:00.000Z"}]},(st&&st.valuero&&st.valuero.settled)||{}), out=[], sum=0;
  if(!settled||!F.D) return {count:0,sum:0,list:[]};
  if(!BILLG){ if(!billgBusy){ billgBusy=true; F.api("/admin/api/billing").then(function(b){ billgBusy=false; if(b&&b.invoices){ BILLG=b; F.render(); } }).catch(function(){ billgBusy=false; }); } return {count:0,sum:0,list:[]}; }
  Object.keys(settled).forEach(function(key){ (settled[key]||[]).forEach(function(s){
    if(!s||!(+s.amountCents>0)||String(s.at||"").slice(0,4)!==String(F.D.year)) return;
    var item=F.D.abgleich.items.find(function(x){return x.key==="valuero:"+key;}); if(!item) return;
    var known=((BILLG.invoices||{})["valuero:"+key]||[]).concat(item.invoices||[]).some(function(l){ return l&&((s.invoiceId&&String(l.id)===String(s.invoiceId))||(Math.abs((+l.gross||0)-s.amountCents/100)<0.02&&String(l.date||"").slice(0,10)===String(s.at).slice(0,10))); });
    if(!known&&!(s.invoiceId&&item.invoiced>=s.amountCents/100-0.02)){ out.push({key:key,s:s,name:item.name}); sum+=s.amountCents/100; }
  }); });
  return {count:out.length,sum:sum,list:out};
}
F.action("migrate",function(){
  var mig=valueroLegacy(); if(!mig.count) return;
  Promise.all(mig.list.map(function(e){ return F.api("/admin/api/billing",{body:{op:"invoice",key:"valuero:"+e.key,invoice:{id:e.s.invoiceId?String(e.s.invoiceId):"",nr:e.s.invoiceId?"":"manuell",gross:e.s.amountCents/100,date:String(e.s.at).slice(0,10),label:e.name+" (übernommen)"}}}); }))
    .then(function(){ BILLG=null; F.toast(mig.count+" VALUERO-Abrechnungen übernommen"); F.load(true); }).catch(function(){ F.toast("Übernehmen fehlgeschlagen",true); });
});
F.action("invoice",function(key){ var x=F.D.abgleich.items.find(function(y){return y.key===key;}); if(x&&x.action&&x.src!=="kochdu") F.openInvoice(x.action); });   /* kochdu: Monatsrechnung kommt von kochdu selbst */
F.action("openinvoices",function(){ F.UI.geldTab="rechnungen"; F.UI.rgF="open"; F.go("geld"); });
F.action("money",function(k){ F.UI.money=k; F.render(); });
F.action("invf",function(k){ F.UI.invF=k; F.UI.invMore=0; F.render(); });
F.action("invmore",function(){ F.UI.invMore=(F.UI.invMore||0)+40; F.render(); });
F.action("txacc",function(id){ F.UI.txAcc=id; F.render(); });
F.listen("input","[data-invq]",function(el){ F.UI.invQ=el.value; clearTimeout(el._d); el._d=setTimeout(F.render,250); });
function invSt(i){ return i.cancelled?" · storniert":i.type==="SR"?" · Storno":i.status===100?(i.src==="print"?" · wartet auf Druckauftrag":" · Entwurf"):i.open>0.005?" · offen "+eur(i.open):i.status===1000?" · bezahlt":""; }
F.searcher(function(q){ return F.D.sev?F.D.sev.invoices.filter(function(i){ return i.type!=="MA"&&(i.nr+" "+i.contact+" "+(i.header||"")).toLowerCase().indexOf(q)>-1; }).slice(0,6).map(function(i){ return {group:"Rechnungen",label:(i.nr||"Entwurf")+" · "+i.contact,sub:eur(i.gross)+invSt(i),act:"fin:invd:"+i.id}; }):[]; });

F.view({id:"geld",label:"Finanzen",short:"Finanzen",icon:"geld",order:30,mobile:true,
  count:function(){ return (F.reviewCount?F.reviewCount():0)+((F.D.sev&&F.D.sev.overdueCount)||0); },   // Zur Prüfung + überfällige Rechnungen (früher: Plattform-Posten ohne Rechnung)
  render:function(){
    var tab=F.geldTabs.find(function(t){return t.id===F.UI.geldTab;})||F.geldTabs[0];
    if(tab.id!=="uebersicht") return F.head("Finanzen",tab.sub||"")+subnav()+(tab.id==="prognose"?renderPrognose():tab.render());
    return renderUebersicht();
  }
});
F.css(
'.todo{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}'+
'.todo button{display:grid;gap:4px;text-align:left;font:inherit;color:inherit;cursor:pointer;padding:16px 18px;border-radius:var(--r);border:1px solid var(--line);background:var(--panel);transition:transform .12s ease,box-shadow .12s ease}'+
'.todo button:hover{transform:translateY(-2px);box-shadow:0 8px 22px color-mix(in srgb,var(--glow) 18%,transparent)}'+
'@media (prefers-reduced-motion:reduce){.todo button{transition:none}.todo button:hover{transform:none}}'+
'.todo .n{font-size:28px;font-weight:750;font-variant-numeric:tabular-nums;letter-spacing:-.02em}'+
'.todo .l{font-weight:650}.todo .h{font-size:13px;color:var(--ink-3);text-wrap:pretty}'+
'.todo .warn{border-color:var(--warn);background:var(--warn-soft)}.todo .bad{border-color:var(--bad);background:var(--bad-soft)}.todo .info{border-color:var(--info);background:var(--info-soft)}'+
'.todo-ok{padding:18px;border-radius:var(--r);background:var(--ok-soft);font-weight:650}'+
'.bill{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:14px}'+
'.bill .c{border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;gap:8px;background:var(--sunk);min-width:0}'+
'.bill .c .top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}'+
'.bill .c .amt{font-size:22px;font-weight:750;font-variant-numeric:tabular-nums}'+
'.bill .c .nm{font-weight:650;overflow-wrap:anywhere}.bill .c .sb{font-size:13px;color:var(--ink-3);text-wrap:pretty}'+
'.bill .c .ac{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}'+
'details.abg>summary{cursor:pointer;padding:14px 18px;font-weight:650;list-style:none;display:flex;justify-content:space-between;align-items:center}'+
'details.abg>summary::-webkit-details-marker{display:none}details.abg>summary:after{content:"▾";color:var(--ink-3)}details.abg[open]>summary:after{content:"▴"}'
);
F.action("sdign",function(key){
  var x=F.D.abgleich.items.find(function(y){return y.key===key;}); if(!x) return;
  /* Website: nur dieser Zeitraum – das Folgejahr kommt wieder (WEB-6) */
  var from=x.src==="website"&&x.action&&x.action.after&&x.action.after.billing?x.action.after.billing.from:undefined;
  F.confirm("„"+x.name+"“ ("+eur(x.unbilled)+") ausblenden? "+(from?"Gilt nur für den Zeitraum ab "+de(from)+" – der nächste Zeitraum kommt wieder.":"Der Posten taucht wieder auf, sobald mehr zu verrechnen ist."),"Ausblenden",function(){
    F.api("/admin/api/billing",{body:{op:"ignore",key:key,amount:x.unbilled,from:from}}).then(function(j){ if(j&&j.ok===false){ F.toast("Nicht gespeichert",true); return; } F.toast("Ausgeblendet",false,"Rückgängig",function(){ F.api("/admin/api/billing",{body:{op:"unignore",key:key}}).then(function(){ F.load(true); }); }); F.load(true); });
  });
});
/* Bereits bezahlte Buchung (bar/Überweisung/online): Rechnung anlegen → als versendet markieren → Zahlung verbuchen */
F.action("sdpaidinv",function(key){
  var x=F.D.abgleich.items.find(function(y){return y.key===key;}); if(!x||!x.action) return;
  var accs=(F.D.sev&&F.D.sev.accounts)||[];
  var pre=Object.assign({},x.action,{title:"Bezahlte Rechnung · "+(x.action.contactName||""),invoiceDate:x.date||undefined});
  pre.after=Object.assign({},pre.after||{},{paid:{amount:x.unbilled,date:x.date||F.D.today}});
  pre.paidNote='Diese Buchung ist bereits bezahlt. Die Rechnung wird angelegt, als versendet markiert und die Zahlung auf dem gewählten Konto verbucht. <b>Vorher prüfen:</b> Ist sie schon als Blitzdings-Einnahme-Beleg (SI-2026…) erfasst? Dann stattdessen „Ausblenden“ – sonst wäre der Umsatz doppelt.';
  pre.paidAccounts=accs;
  F.openInvoice(pre);
});
F.action("sdunign",function(key){ F.api("/admin/api/billing",{body:{op:"unignore",key:key}}).then(function(){ F.toast("Wieder eingeblendet"); F.load(true); }); });
F.action("sdshowign",function(){ F.UI.showIgn=!F.UI.showIgn; F.render(); });
F.action("sdzu",function(){ var el=document.getElementById("zuVerrechnen"); if(el) el.scrollIntoView({behavior:"smooth",block:"start"}); });
function renderUebersicht(){
  var D=F.D, sev=D.sev, ab=D.abgleich, f=F.UI.money, SRC=F.SRC, mig=valueroLegacy();
  var zu=ab.items.filter(function(x){ return x.unbilled>0.005||x.refund>0.005||(x.src==="valuero"&&x.blocked); }).sort(function(a,b){ return (b.unbilled||0)-(a.unbilled||0); });
  var ign=ab.items.filter(function(x){ return x.ignored; });
  var drafts=sev?sev.invoices.filter(function(i){return i.status===100&&i.src!=="print";}):[], over=sev?sev.invoices.filter(function(i){return i.overdue;}):[];   /* Druck-Entwürfe warten auf den Druckauftrag */
  var vdr=sev&&sev.vouchers?sev.vouchers.drafts||0:0, unass=sev?sev.unassigned||0:0;
  var tiles=[];
  if(over.length) tiles.push('<button class="bad" data-act="sdtab:rechnungen|overdue"><span class="n">'+over.length+'</span><span class="l">Überfällig</span><span class="h">'+eur0(over.reduce(function(s,i){return s+i.open;},0))+' – erinnern oder mahnen</span></button>');
  if(drafts.length) tiles.push('<button class="info" data-act="sdtab:rechnungen|draft"><span class="n">'+drafts.length+'</span><span class="l">Entwürfe senden</span><span class="h">'+eur0(drafts.reduce(function(s,i){return s+i.gross;},0))+' warten auf Versand</span></button>');
  if(unass) tiles.push('<button class="info" data-act="sdtab:bank"><span class="n">'+unass+'</span><span class="l">Bankumsätze zuordnen</span><span class="h">mit Vorschlägen</span></button>');
  if(vdr) tiles.push('<button data-act="sdtab:belege|draft"><span class="n">'+vdr+'</span><span class="l">Beleg-Entwürfe</span><span class="h">prüfen & fertig markieren</span></button>');
  /* Überzahlte Rechnungen (eigene Buchhaltung): Differenz zuordnen – Mahnspesen, Zinsen, Trinkgeld, weitere Rechnung oder Guthaben */
  var ovp=sev&&sev.local?sev.invoices.filter(function(i){ return F.overToAssign?F.overToAssign(i):i.over>0.005&&!i.cancelled; }):[];   /* ohne gewollt überzahlte Mollie-Connect-Sammelrechnungen */
  if(ovp.length) tiles.push('<button class="info" data-act="'+(ovp.length===1?"overpay:"+esc(ovp[0].id):"fin:inv:paid")+'"><span class="n">'+ovp.length+'</span><span class="l">Überzahlung zuordnen</span><span class="h">'+(ovp.length===1?esc(ovp[0].nr||"")+" · ":"")+eur(ovp.reduce(function(s,i){return s+i.over;},0))+' – woher kommt die Differenz?</span></button>');
  var bal=sev?sev.accounts.reduce(function(s,a){return s+(+a.balance||0);},0):null;
  var cm=String(new Date().getFullYear())===String(D.year)?new Date().getMonth():-1;
  var card=function(x){
    var tag={website:"Website",kochdu:"kochdu",valuero:"VALUERO",blitzdings:"Blitzdings",kantineur:"Kantineur"}[x.src]||x.src;
    var auto=x.src==="kochdu";   /* kochdu rechnet seit 15.10.2026 selbst monatlich ab – hier keine eigene Rechnung (sonst doppelt) */
    return '<div class="c"><div class="top"><span class="tag grey">'+esc(tag)+'</span>'+(x.refund>0.005?'<span class="tag bad">'+eur(x.refund)+' zu viel verrechnet</span>':'')+(x.storno?'<span class="tag warn">storniert</span>':'')+'</div>'+
      '<div><div class="nm">'+esc(x.name)+'</div><div class="sb">'+esc(x.sub)+'</div>'+(x.blocked?'<div class="sb warn-t">'+esc(x.blocked)+'</div>':'')+(auto?'<div class="sb">kochdu rechnet selbst ab (Monatsrechnung am 1.). '+(x.unbilled>0.005?'Rückstand im kochdu-Reiter unter „Zur Prüfung“ abrechnen.':'')+'</div>':'')+'</div>'+
      (x.unbilled>0.005?'<div class="amt">'+eur(x.unbilled)+'</div>':'')+
      '<div class="ac">'+(x.action&&!auto?'<button class="btn primary" data-act="invoice:'+esc(x.key)+'">Rechnung erstellen</button>':'')+(auto&&x.unbilled>0.005?'<button class="btn" data-act="pltab:kochdu">kochdu öffnen</button>':'')+(x.src==="valuero"&&x.proposal?'<button class="btn primary" data-act="vaprop:'+esc(String(x.key).replace(/^valuero:/,""))+'">'+esc(x.proposal.label||"Prüfen")+'</button>':'')+(x.src==="blitzdings"&&x.unbilled>0.005&&x.paidOnPlatform?'<button class="btn" data-act="sdpaidinv:'+esc(x.key)+'" title="Rechnung anlegen und gleich als bezahlt verbuchen">Bezahlte Rechnung</button>':'')+(x.src==="blitzdings"&&x.unbilled>0.005?'<button class="btn" data-act="sdassign:'+esc(x.key)+'" title="Einer bestehenden (Sammel-)Rechnung zuordnen">Zuordnen</button>':'')+(x.unbilled>0.005?'<button class="btn" data-act="sdign:'+esc(x.key)+'" title="Ohne Rechnung erledigt – ausblenden">Ausblenden</button>':'')+'</div></div>';
  };
  // Detail-Abgleich (eingeklappt)
  var rows=ab.items.filter(function(x){ if(f==="zu") return x.unbilled>0.005||x.refund>0.005; if(f==="offen") return x.open>0.005; if(f==="prob") return problem(x); return true; });
  var groups={}; rows.forEach(function(x){ (groups[x.src]=groups[x.src]||[]).push(x); });
  var body=Object.keys(SRC).filter(function(k){return groups[k];}).map(function(k){
    return '<tr class="grp"><td colspan="5">'+SRC[k]+'</td></tr>'+groups[k].map(function(x){
      var invs=(x.invoices||[]).map(function(l){ return '<span>'+(l&&l.id?invLink(l):esc(l&&l.nr||"manuell"))+' · '+eur(l.gross)+' '+stateTag(l)+'</span>'; }).join("");
      if(x.src==="kochdu"&&x.settledWithoutInvoice>0.005) invs+='<span class="tag warn">'+eur(x.settledWithoutInvoice)+' ohne Rechnung als verrechnet markiert</span>';
      if(x.ignored) invs+='<span class="tag grey">'+eur(x.ignored.amount)+' ausgeblendet</span>';
      return '<tr><td><b>'+esc(x.name)+'</b><div class="sub">'+esc(x.sub)+'</div></td><td class="r num">'+(x.unbilled>0.005?'<b class="warn-t">'+eur(x.unbilled)+'</b>':'<span class="muted">—</span>')+'</td><td class="r num">'+eur(x.invoiced)+'</td><td class="r num">'+(x.open>0.005?eur(x.open):'<span class="muted">—</span>')+'</td><td><div class="invs">'+(invs||'<span class="muted">—</span>')+'</div></td></tr>';
    }).join("");
  }).join("");
  var chip=function(k,l,n){ return '<button class="chip" data-act="money:'+k+'" aria-pressed="'+(f===k)+'">'+l+(n!=null?' · '+n:'')+'</button>'; };
  var cnt=function(fn){ return ab.items.filter(fn).length; };
  return F.head("Finanzen","Was ansteht, auf einen Blick. Rechnungen, Bank, Belege und Kontakte findest du in den Reitern darunter.",'<button class="btn" data-act="voucher">'+F.svg("beleg")+'Beleg erfassen</button><button class="btn primary" data-act="newinvoice">'+F.svg("plus")+'Neue Rechnung</button>')+subnav()+
    (D.sevConfigured&&!sev?'<div class="notice">Die Buchhaltungsdaten konnten gerade nicht geladen werden. Die Plattform-Zahlen stimmen, der Abgleich mit Rechnungen folgt beim nächsten Laden. <button class="btn" data-act="reload">Neu laden</button></div>':'')+
    (mig.count?'<div class="notice"><span>Aus dem früheren Dashboard sind <b>'+mig.count+' VALUERO-Abrechnungen</b> ('+eur(mig.sum)+') noch nicht am Server gespeichert.</span><button class="btn primary" data-act="migrate">Übernehmen</button></div>':'')+
    '<section><div class="sec-t">Zu tun</div>'+(tiles.length?'<div class="todo">'+tiles.join("")+'</div>':'<div class="todo-ok">Alles erledigt 🎉 Keine Entwürfe, nichts überfällig.</div>')+'</section>'+
    '<div class="kpis">'+
      '<div class="panel kpi"><span class="k">Umsatz '+esc(D.year)+'</span><span class="v num">'+(sev?eur0(sev.revenueYear):"—")+'</span><span class="s">gestellte Rechnungen, brutto</span></div>'+
      '<button class="panel kpi" data-act="sdtab:rechnungen|open"><span class="k">Offen</span><span class="v num">'+(sev?eur0(sev.openSum):"—")+'</span><span class="s">'+(sev?sev.openCount+" Rechnungen":"")+'</span></button>'+
      '<button class="panel kpi" data-act="sdtab:rechnungen|overdue"><span class="k">Überfällig</span><span class="v num'+(sev&&sev.overdueSum?" bad-t":"")+'">'+(sev?eur0(sev.overdueSum):"—")+'</span><span class="s">'+(sev?sev.overdueCount+" Rechnungen":"")+'</span></button>'+
      '<button class="panel kpi" data-act="sdtab:bank"><span class="k">Bank</span><span class="v num'+(bal!=null&&bal<0?" bad-t":"")+'">'+(bal==null?"—":eur0(bal))+'</span><span class="s">'+(sev?sev.accounts.length+" Konten":"")+'</span></button>'+
    '</div>'+
    '<section class="panel" id="zuVerrechnen"><div class="panel-h"><h2>Zu verrechnen</h2><span class="muted">'+(zu.length?eur(ab.totals.unbilled)+' · '+zu.length+' Posten':'')+'</span></div>'+
      (zu.length?'<div class="bill">'+zu.map(card).join("")+'</div>':'<div class="sd-empty"><b>Nichts offen 🎉</b>Alle Leistungen sind verrechnet.</div>')+
      (ign.length?'<div style="padding:0 16px 14px"><button class="link" data-act="sdshowign">'+(F.UI.showIgn?"Ausgeblendete verbergen":ign.length+" ausgeblendet · anzeigen")+'</button>'+(F.UI.showIgn?'<div class="sd-list sd-box" style="margin-top:8px">'+ign.map(function(x){ return '<div class="sd-row" style="cursor:default"><div><div class="t">'+esc(x.name)+'</div><div class="s">'+eur(x.ignored.amount)+' · ausgeblendet am '+de(String(x.ignored.at||"").slice(0,10))+'</div></div><div class="r"><button class="btn" data-act="sdunign:'+esc(x.key)+'">Wieder einblenden</button></div></div>'; }).join("")+'</div>':'')+'</div>':'')+
    '</section>'+
    (sev?'<section class="panel"><div class="panel-h"><h2>Umsatz je Monat</h2><span class="muted">laut Rechnungen</span></div><div class="chart">'+F.barChart(sev.byMonth,{highlight:cm,label:"Umsatz je Monat"})+'</div></section>':'')+
    '<details class="panel abg"'+(F.UI.abgOpen?" open":"")+' data-abg><summary>Abgleich je Plattform<span class="muted" style="margin-left:auto;margin-right:10px;font-weight:500">angefallen ↔ verrechnet ↔ bezahlt</span></summary>'+
      '<div class="sd-tools"><div class="chips">'+chip("zu","Zu verrechnen",cnt(function(x){return x.unbilled>0.005||x.refund>0.005;}))+chip("offen","Verrechnet, noch offen",cnt(function(x){return x.open>0.005;}))+chip("prob","Auffällig",cnt(problem))+chip("alle","Alle",ab.items.length)+'</div></div>'+
      '<div class="scroll"><table><thead><tr><th>Posten</th><th class="r">Nicht verrechnet</th><th class="r">Verrechnet</th><th class="r">Davon offen</th><th>Rechnungen</th></tr></thead><tbody>'+(body||'<tr><td colspan="5" class="empty">Nichts in dieser Ansicht. 👍</td></tr>')+'</tbody></table></div></details>';
}
F.listen("click","[data-abg] > summary",function(el){ F.UI.abgOpen=!el.parentNode.open; });

/* ---------- Jahresprognose ---------- */
// Logik: Ist (gestellte Rechnungen bis heute) + Rest des Jahres.
// Rest je Monat = aktuelles Monatstempo (Schnitt der letzten 3 vollen Monate); hat das Vorjahr mind. 8 Monate mit Umsatz,
// zur Hälfte gemischt mit dem Vorjahreswert dieses Monats × Wachstumsfaktor (Ist heuer ÷ Vorjahr im gleichen Zeitraum).
// Dazu kommen Plattform-Einnahmen, die nicht über eigene Rechnungen laufen (Kantineur-Abos),
// und bereits angefallene, aber noch nicht verrechnete Beträge aus dem Abgleich.
// kochdu-Online-Provisionen nicht extra: sie werden je Monat per Sammelrechnung verrechnet (fin-mollie.js) und stecken schon in „Rechnungen“.
function monthSums(invs,year){ var m=new Array(12).fill(0); invs.forEach(function(i){ if((i.status===200||i.status===750||i.status===1000)&&String(i.date||"").slice(0,4)===String(year)){ var k=parseInt(String(i.date).slice(5,7),10)-1; m[k]+=i.type==="SR"?-Math.abs(i.gross):i.gross; } }); return m; }
F.renderPrognose=function(){ return renderPrognose(); };
function renderPrognose(){
  var D=F.D, sev=D.sev, yr=+D.year, now=new Date(), cy=now.getFullYear();
  if(!sev) return '<div class="notice">Die Rechnungsdaten konnten gerade nicht geladen werden – die Prognose braucht sie.</div>';
  if(yr!==cy) return '<section class="panel"><div class="empty">Die Prognose gibt es für das laufende Jahr. Wähle links '+cy+' als Jahr.</div></section>';
  var cur=monthSums(sev.invoices,yr), prev=monthSums(sev.invoices,yr-1), mNow=now.getMonth();
  var dayFrac=now.getDate()/new Date(cy,mNow+1,0).getDate();
  var ist=cur.reduce(function(a,b){return a+b;},0);
  // Vergleichszeitraum Vorjahr: volle Monate bis Vormonat + anteilig laufender Monat
  var prevSame=prev.slice(0,mNow).reduce(function(a,b){return a+b;},0)+prev[mNow]*dayFrac;
  // Monatstempo: Schnitt der letzten 3 vollen Monate
  var last3=[mNow-1,mNow-2,mNow-3].filter(function(x){return x>=0;}).map(function(x){return cur[x];});
  var runRate=last3.length?last3.reduce(function(a,b){return a+b;},0)/last3.length:(ist/Math.max(dayFrac,0.1));
  // Saisonverlauf nur, wenn das Vorjahr in mindestens 8 Monaten Umsätze hat (sonst ist es nicht aussagekräftig)
  var prevMonths=prev.filter(function(v){return v>0;}).length;
  var hasPrev=prevMonths>=8&&prevSame>0;
  var growth=hasPrev?Math.max(0.5,Math.min(2,ist/prevSame)):1;
  var restMonths=[], method;
  for(var m=mNow;m<12;m++){
    var part=m===mNow?(1-dayFrac):1, v=runRate;
    if(hasPrev) v=0.5*prev[m]*growth+0.5*runRate;     // Mischung: Saison des Vorjahres und aktuelles Tempo
    restMonths.push({m:m,v:v*part});
  }
  method=hasPrev?"je zur Hälfte Vorjahresverlauf × Wachstum ("+(growth>=1?"+":"")+Math.round((growth-1)*100)+" %) und aktuelles Monatstempo":"aktuelles Monatstempo (Schnitt der letzten "+last3.length+" vollen Monate)"+(prevMonths?"; Vorjahr hat zu wenige Monate für einen Saisonverlauf":"");
  var rest=restMonths.reduce(function(a,b){return a+b.v;},0);
  var inc=D.income||{lines:[]}, kantMon=0, kantYtd=0;
  var kl=(inc.lines||[]).find(function(l){return l.key==="kantineur";}); kantMon=kl?kl.monthly:0;
  var ka=D.platforms&&D.platforms.kantineur; kantYtd=ka?(ka.revenueGrossCents||0)/100:0;
  var remFrac=(12-mNow-dayFrac);
  var unbilled=D.abgleich.totals.unbilled||0;
  var rows=[
    ["Rechnungen",ist,rest,"Ist bis heute + Hochrechnung: "+method+" · inkl. kochdu-Online-Provisionen (monatliche Sammelrechnung)"],
    ["Kantineur-Abos",kantYtd,kantMon*remFrac,"läuft über die Plattform, nicht über eigene Rechnungen"],
    ["Angefallen, noch nicht verrechnet",0,unbilled,"aus dem Abgleich – kommt mit den nächsten Rechnungen"]
  ].filter(function(r){ return r[1]>0.5||r[2]>0.5; });
  var tIst=rows.reduce(function(a,r){return a+r[1];},0), tRest=rows.reduce(function(a,r){return a+r[2];},0), total=tIst+tRest;
  var prevTotal=prev.reduce(function(a,b){return a+b;},0);
  var chartVals=cur.map(function(v,i){ if(i<mNow) return v; var r=restMonths.find(function(x){return x.m===i;}); return i===mNow?v+(r?r.v:0):(r?r.v:0); });
  // Ausgaben/Gewinn: aus der Steuer-Ansicht (lädt Belege), falls schon geladen
  var st=F.steuerData&&F.steuerData();
  // ohne Privates, Steuerzahlungen (USt/ESt) und Umbuchungen – die sind keine Betriebsausgaben
  var SC=window.FSC_STEUER, costIst=0; if(st){ st.vouchers.forEach(function(v){ if(v.cd==="C"&&v.status>=100&&String(v.date||"").slice(0,4)===String(yr)) costIst+=SC?SC.lines(v).reduce(function(a,l){ return a+(SC.nonBiz(l)?0:l.net); },0):v.net; }); }
  var costTotal=costIst>0?costIst/((mNow+dayFrac)/12):0;
  return '<div class="kpis">'+
    '<div class="panel kpi"><span class="k">Prognose Umsatz '+yr+'</span><span class="v num money">'+eur0(total)+'</span><span class="s">brutto, alle Quellen</span></div>'+
    '<div class="panel kpi"><span class="k">Davon schon da</span><span class="v num money">'+eur0(tIst)+'</span><span class="s">'+Math.round(tIst/Math.max(1,total)*100)+' % der Prognose</span></div>'+
    '<div class="panel kpi"><span class="k">Noch erwartet</span><span class="v num money">'+eur0(tRest)+'</span><span class="s">bis 31.12.</span></div>'+
    '<div class="panel kpi"><span class="k">Vorjahr '+(yr-1)+'</span><span class="v num money">'+(prevTotal?eur0(prevTotal):"—")+'</span><span class="s">'+(prevTotal?((total-prevTotal>=0?"+":"")+Math.round((total/prevTotal-1)*100)+" % erwartet"):"keine Vorjahresdaten")+'</span></div>'+
  '</div>'+
  '<section class="panel"><div class="panel-h"><h2>Verlauf '+yr+'</h2><span class="muted">volle Balken = Ist, blasse = Prognose (Rechnungen)</span></div><div class="chart">'+progChart(cur,chartVals,mNow)+'</div></section>'+
  '<section class="panel"><div class="panel-h"><h2>So setzt sich die Prognose zusammen</h2></div><div class="scroll"><table><thead><tr><th>Quelle</th><th class="r">Ist bis heute</th><th class="r">Erwartet bis Jahresende</th><th class="r">Summe</th></tr></thead><tbody>'+
    rows.map(function(r){ return '<tr><td><b>'+esc(r[0])+'</b><div class="sub">'+esc(r[3])+'</div></td><td class="r num money">'+eur0(r[1])+'</td><td class="r num money">'+eur0(r[2])+'</td><td class="r num money"><b>'+eur0(r[1]+r[2])+'</b></td></tr>'; }).join("")+
    '<tr class="grp"><td>Gesamt</td><td class="r num money">'+eur0(tIst)+'</td><td class="r num money">'+eur0(tRest)+'</td><td class="r num money">'+eur0(total)+'</td></tr></tbody></table></div></section>'+
  (costIst>0?'<section class="panel"><div class="panel-h"><h2>Ausgaben und Gewinn (grob)</h2><span class="muted">netto, laut Belegen, linear hochgerechnet</span></div><div class="panel-b"><dl class="facts"><dt>Ausgaben bis heute</dt><dd class="num money">'+eur0(costIst)+'</dd><dt>Ausgaben-Prognose Jahr</dt><dd class="num money">'+eur0(costTotal)+'</dd><dt>Umsatz-Prognose netto (÷ 1,2)</dt><dd class="num money">'+eur0(total/1.2)+'</dd><dt><b>Gewinn-Prognose vor Steuern</b></dt><dd class="num money"><b>'+eur0(total/1.2-costTotal)+'</b></dd></dl><p class="muted" style="margin:10px 0 0">Grobe Schätzung. Genaue Zahlen nach Kategorien findest du unter JAB.</p></div></section>':'<p class="muted">Ausgaben und Gewinn erscheinen hier, sobald du einmal den Unterpunkt UVA oder JAB geöffnet hast (dort werden die Belege geladen).</p>');
}
function progChart(cur,vals,mNow){
  var W=640,H=210,pl=46,pb=24,pt=12, mx=Math.max.apply(null,vals.concat([1])), step=Math.pow(10,Math.floor(Math.log10(mx))), top=Math.ceil(mx/step)*step, bw=(W-pl)/12, M=["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
  var y=function(v){ return pt+(H-pt-pb)*(1-v/top); }, g="";
  [0,top/2,top].forEach(function(t){ g+='<line x1="'+pl+'" x2="'+W+'" y1="'+y(t)+'" y2="'+y(t)+'" stroke="var(--line)"/><text x="'+(pl-8)+'" y="'+(y(t)+4)+'" text-anchor="end" font-size="11" fill="var(--ink-3)" font-family="ui-monospace,monospace">'+(t>=1000?(t/1000).toLocaleString("de-AT")+"k":Math.round(t))+'</text>'; });
  vals.forEach(function(v,i){ var x=pl+i*bw+bw*.2, w=bw*.6, real=i<mNow?v:(i===mNow?cur[i]:0), fc=Math.max(0,v-real);
    if(fc>0) g+='<rect x="'+x+'" y="'+y(real+fc)+'" width="'+w+'" height="'+(y(real)-y(real+fc))+'" rx="4" fill="var(--glow)" opacity=".55"><title>'+M[i]+': Prognose '+eur(fc)+'</title></rect>';
    if(real>0) g+='<rect x="'+x+'" y="'+y(real)+'" width="'+w+'" height="'+(y(0)-y(real))+'" rx="4" fill="var(--ink)" opacity=".85"><title>'+M[i]+': Ist '+eur(real)+'</title></rect>';
    g+='<text x="'+(x+w/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="11" fill="var(--ink-3)">'+M[i]+'</text>'; });
  return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Umsatzverlauf mit Prognose">'+g+'</svg>';
}
})();
