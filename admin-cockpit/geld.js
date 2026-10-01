/* Ansicht "Geld & Abgleich": sevDesk-Kennzahlen, Abgleich Plattformen ↔ sevDesk, Rechnungen, Bank. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort;
F.UI.money=F.UI.money||"zu"; F.UI.invQ=F.UI.invQ||""; F.UI.invF=F.UI.invF||"open"; F.UI.geldTab=F.UI.geldTab||"uebersicht";
/* Unterpunkte von "Finanzen": weitere Module melden sich mit F.geldTab({id,label,order,render}) an */
F.geldTabs=[{id:"uebersicht",label:"Übersicht & Abgleich",order:10},{id:"prognose",label:"Jahresprognose",order:20}];
F.geldTab=function(t){ F.geldTabs.push(t); F.geldTabs.sort(function(a,b){ return a.order-b.order; }); };
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
function stateTag(l){ if(!l) return '<span class="tag grey">keine Rechnung</span>'; var m={bezahlt:"ok",offen:"warn",ueberfaellig:"bad",entwurf:"grey",fehlt:"bad",manuell:"grey",alt:"grey",neu:"info",sonst:"grey"}; return '<span class="tag '+(m[l.state]||"grey")+'">'+esc(l.label)+'</span>'; }
function invLink(l){ if(!l) return ""; return l.id?'<a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(l.id)+'" target="_blank" rel="noopener">'+esc(l.nr||"Entwurf")+'</a>':esc(l.nr||"manuell"); }
function problem(x){ return x.refund>0.005||(x.invoices||[]).some(function(l){return l&&(l.state==="fehlt"||l.state==="ueberfaellig");})||x.settledWithoutInvoice>0.005; }

/* VALUERO-Abrechnungen, die das frühere Dashboard nur im Browser gespeichert hat */
function valueroLegacy(){
  var st=F.ls("fsc_einnahmen_dashboard_v1"), settled=Object.assign({antonhaus:[{amountCents:34754,at:"2026-07-30T00:00:00.000Z"}]},(st&&st.valuero&&st.valuero.settled)||{}), out=[], sum=0;
  if(!settled||!F.D) return {count:0,sum:0,list:[]};
  Object.keys(settled).forEach(function(key){ (settled[key]||[]).forEach(function(s){
    if(!s||!(+s.amountCents>0)||String(s.at||"").slice(0,4)!==String(F.D.year)) return;
    var item=F.D.abgleich.items.find(function(x){return x.key==="valuero:"+key;}); if(!item) return;
    var known=(item.invoices||[]).some(function(l){ return (s.invoiceId&&l.id===String(s.invoiceId))||(Math.abs((+l.gross||0)-s.amountCents/100)<0.02&&String(l.date||"").slice(0,10)===String(s.at).slice(0,10)); });
    if(!known&&!(s.invoiceId&&item.invoiced>=s.amountCents/100-0.02)){ out.push({key:key,s:s,name:item.name}); sum+=s.amountCents/100; }
  }); });
  return {count:out.length,sum:sum,list:out};
}
F.action("migrate",function(){
  var mig=valueroLegacy(); if(!mig.count) return;
  Promise.all(mig.list.map(function(e){ return F.api("/admin/api/billing",{body:{op:"invoice",key:"valuero:"+e.key,invoice:{id:e.s.invoiceId?String(e.s.invoiceId):"",nr:e.s.invoiceId?"":"manuell",gross:e.s.amountCents/100,date:String(e.s.at).slice(0,10),label:e.name+" (übernommen)"}}}); }))
    .then(function(){ F.toast(mig.count+" VALUERO-Abrechnungen übernommen"); F.load(true); }).catch(function(){ F.toast("Übernehmen fehlgeschlagen",true); });
});
F.action("invoice",function(key){ var x=F.D.abgleich.items.find(function(y){return y.key===key;}); if(x&&x.action) F.openInvoice(x.action); });
F.action("openinvoices",function(){ F.UI.geldTab="uebersicht"; F.UI.invF="open"; F.go("geld"); setTimeout(function(){ var q=document.querySelector("[data-invq]"); if(q) q.scrollIntoView({block:"center"}); },50); });
F.action("money",function(k){ F.UI.money=k; F.render(); });
F.action("invf",function(k){ F.UI.invF=k; F.UI.invMore=0; F.render(); });
F.action("invmore",function(){ F.UI.invMore=(F.UI.invMore||0)+40; F.render(); });
F.action("txacc",function(id){ F.UI.txAcc=id; F.render(); });
F.listen("input","[data-invq]",function(el){ F.UI.invQ=el.value; clearTimeout(el._d); el._d=setTimeout(F.render,250); });
F.searcher(function(q){ return F.D.sev?F.D.sev.invoices.filter(function(i){ return (i.nr+" "+i.contact+" "+(i.header||"")).toLowerCase().indexOf(q)>-1; }).slice(0,6).map(function(i){ return {group:"Rechnungen",label:(i.nr||"Entwurf")+" · "+i.contact,sub:eur(i.gross)+(i.open>0.005?" · offen "+eur(i.open):" · bezahlt"),act:"pdf:"+i.id}; }):[]; });

F.view({id:"geld",label:"Finanzen",short:"Finanzen",icon:"geld",order:30,mobile:true,
  count:function(){ return F.D.abgleich.totals.unbilledCount||0; },
  render:function(){
    var tab=F.geldTabs.find(function(t){return t.id===F.UI.geldTab;})||F.geldTabs[0];
    if(tab.id!=="uebersicht") return F.head("Finanzen",tab.sub||"")+subnav()+(tab.id==="prognose"?renderPrognose():tab.render());
    return renderUebersicht();
  }
});
function renderUebersicht(){ return (function(){
    var D=F.D, sev=D.sev, ab=D.abgleich, f=F.UI.money, SRC=F.SRC, mig=valueroLegacy();
    var rows=ab.items.filter(function(x){ if(f==="zu") return x.unbilled>0.005||x.refund>0.005; if(f==="offen") return x.open>0.005; if(f==="prob") return problem(x); return true; });
    var groups={}; rows.forEach(function(x){ (groups[x.src]=groups[x.src]||[]).push(x); });
    var body=Object.keys(SRC).filter(function(k){return groups[k];}).map(function(k){
      return '<tr class="grp"><td colspan="6">'+SRC[k]+'</td></tr>'+groups[k].map(function(x){
        var invs=(x.invoices||[]).map(function(l){ return '<span>'+invLink(l)+' · '+eur(l.gross)+' '+stateTag(l)+'</span>'; }).join("");
        var act=x.action?'<button class="btn primary" data-act="invoice:'+esc(x.key)+'">Rechnung · '+eur(x.unbilled)+'</button>':(x.auto?'<span class="tag ok">automatisch</span>':(x.unbilled>0.005?'':'<span class="tag ok">erledigt</span>'));
        if(x.src==="kochdu"&&x.settledWithoutInvoice>0.005) invs+='<span class="tag warn">'+eur(x.settledWithoutInvoice)+' ohne Rechnung als verrechnet markiert</span>';
        if(x.refund>0.005) act+=' <span class="tag bad">'+eur(x.refund)+' zu viel</span>';
        return '<tr><td><b>'+esc(x.name)+'</b><div class="sub">'+esc(x.sub)+'</div></td><td class="r num">'+(x.unbilled>0.005?'<b class="warn-t">'+eur(x.unbilled)+'</b>':'<span class="muted">—</span>')+'</td><td class="r num">'+eur(x.invoiced)+'</td><td class="r num">'+(x.open>0.005?eur(x.open):'<span class="muted">—</span>')+'</td><td><div class="invs">'+(invs||'<span class="muted">—</span>')+'</div></td><td class="r">'+act+'</td></tr>';
      }).join("");
    }).join("");
    var chip=function(k,l,n,a){ return '<button class="chip" data-act="'+(a||"money")+':'+k+'" aria-pressed="'+((a?F.UI.invF:f)===k)+'">'+l+(n!=null?' · '+n:'')+'</button>'; };
    var cnt=function(fn){ return ab.items.filter(fn).length; };
    var q=(F.UI.invQ||"").toLowerCase(), invF=F.UI.invF;
    var invAll=sev?sev.invoices:[];
    var invList=invAll.filter(function(i){ if(invF==="open"&&!(i.open>0.005&&i.status!==100)) return false; if(invF==="over"&&!i.overdue) return false; if(invF==="draft"&&i.status!==100) return false; if(invF==="paid"&&i.status!==1000) return false; return !q||(i.nr+" "+i.contact+" "+(i.header||"")+" "+(i.ref||"")).toLowerCase().indexOf(q)>-1; }); var invLim=(q?80:40)+(F.UI.invMore||0), invMoreN=Math.max(0,invList.length-invLim); invList=invList.slice(0,invLim);
    var cm=String(new Date().getFullYear())===String(D.year)?new Date().getMonth():-1;
    return F.head("Finanzen","sevDesk und alle Plattformen in einer Ansicht. Der Abgleich zeigt, was angefallen, verrechnet und bezahlt ist.",'<button class="btn" data-act="voucher">Beleg erfassen</button><button class="btn primary" data-act="newinvoice">Neue Rechnung</button>')+subnav()+
    (D.sevConfigured&&!sev?'<div class="notice">sevDesk antwortet gerade nicht. Die Plattform-Zahlen stimmen, der Abgleich mit Rechnungen folgt beim nächsten Laden. <button class="btn" data-act="reload">Neu laden</button></div>':'')+
    (mig.count?'<div class="notice"><span>Aus dem früheren Dashboard sind <b>'+mig.count+' VALUERO-Abrechnungen</b> ('+eur(mig.sum)+') noch nicht am Server gespeichert. Übernimm sie, damit der Abgleich auf allen Geräten stimmt.</span><button class="btn primary" data-act="migrate">Übernehmen</button></div>':'')+
    '<div class="kpis">'+
      '<div class="panel kpi"><span class="k">Umsatz '+esc(D.year)+'</span><span class="v num">'+(sev?eur0(sev.revenueYear):"—")+'</span><span class="s">gestellte Rechnungen</span></div>'+
      '<button class="panel kpi" data-act="invf:open"><span class="k">Offen</span><span class="v num">'+(sev?eur0(sev.openSum):"—")+'</span><span class="s">'+(sev?sev.openCount+" Rechnungen":"")+'</span></button>'+
      '<button class="panel kpi" data-act="invf:over"><span class="k">Überfällig</span><span class="v num'+(sev&&sev.overdueSum?" bad-t":"")+'">'+(sev?eur0(sev.overdueSum):"—")+'</span><span class="s">'+(sev?sev.overdueCount+" Rechnungen":"")+'</span></button>'+
      '<button class="panel kpi" data-act="money:zu"><span class="k">Noch nicht verrechnet</span><span class="v num'+(ab.totals.unbilled?" warn-t":"")+'">'+eur0(ab.totals.unbilled)+'</span><span class="s">'+ab.totals.unbilledCount+' Posten</span></button>'+
    '</div>'+
    '<section class="panel"><div class="panel-h"><h2>Abgleich Plattformen ↔ sevDesk</h2><div class="chips">'+chip("zu","Zu verrechnen",cnt(function(x){return x.unbilled>0.005||x.refund>0.005;}))+chip("offen","Verrechnet, noch offen",cnt(function(x){return x.open>0.005;}))+chip("prob","Auffällig",cnt(problem))+chip("alle","Alle",ab.items.length)+'</div></div>'+
      '<div class="scroll"><table><thead><tr><th>Posten</th><th class="r">Nicht verrechnet</th><th class="r">Verrechnet</th><th class="r">Davon offen</th><th>Rechnungen</th><th></th></tr></thead><tbody>'+(body||'<tr><td colspan="6" class="empty">Nichts in dieser Ansicht. 👍</td></tr>')+'</tbody></table></div></section>'+
    (ab.unlinked.length?'<section class="panel"><div class="panel-h"><h2>Offene Rechnungen ohne Plattform-Zuordnung</h2><span class="muted">z. B. Projektrechnungen</span></div><div class="scroll"><table><tbody>'+ab.unlinked.map(function(i){ return '<tr><td><a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'" target="_blank" rel="noopener">'+esc(i.nr||"Entwurf")+'</a><div class="sub">'+de(i.date)+'</div></td><td>'+esc(i.contact)+'</td><td class="r num">'+eur(i.open)+'</td><td>'+(i.overdue?'<span class="tag bad">überfällig</span>':'<span class="tag warn">fällig '+de(i.due)+'</span>')+'</td><td class="r"><button class="btn" data-act="book:'+esc(i.id)+'">Zahlung erfassen</button></td></tr>'; }).join("")+'</tbody></table></div></section>':'')+
    (sev?'<div class="two"><section class="panel"><div class="panel-h"><h2>Umsatz je Monat</h2><span class="muted">laut sevDesk</span></div><div class="chart">'+F.barChart(sev.byMonth,{highlight:cm,label:"Umsatz je Monat"})+'</div></section>'+
      '<section class="panel"><div class="panel-h"><h2>Bank</h2><span class="muted">Saldo laut sevDesk</span></div><div class="accs">'+[{id:"all",name:"Alle Konten",balance:sev.accounts.reduce(function(s,a){return s+(+a.balance||0);},0)}].concat(sev.accounts).map(function(a){ var on=(F.UI.txAcc||"all")===String(a.id); return '<button class="acc" data-act="txacc:'+esc(a.id)+'" aria-pressed="'+on+'" style="text-align:left;cursor:pointer;font:inherit;color:inherit;background:none;border:1px solid '+(on?'var(--accent,#2f6bff)':'transparent')+';border-radius:10px;padding:6px 8px"><div class="muted">'+esc(a.name)+(a.isDefault?' · Standard':'')+'</div><div class="num big'+(a.balance<0?" bad-t":"")+'">'+(a.balance==null?"—":eur(a.balance))+'</div></button>'; }).join("")+'</div>'+
        (sev.accounts.some(function(a){ return a.balance!=null&&a.balance<-1000&&a.type!=="register"; })?'<div class="panel-b muted" style="padding-top:0">Stimmt ein Saldo nicht mit der Bank überein, fehlt in sevDesk meist der Anfangssaldo des Kontos (Bank → Konto bearbeiten).</div>':'')+
        '<div class="panel-b muted" style="padding-top:0">'+(sev.unassigned?sev.unassigned+" Umsätze noch nicht zugeordnet · ":"")+((sev.vouchers&&sev.vouchers.drafts)||0)+' Beleg-Entwürfe · '+((sev.vouchers&&sev.vouchers.open)||0)+' offene Ausgaben ('+eur(sev.vouchers&&sev.vouchers.openSum)+')</div>'+
        ((sev.transactions||[]).length?'<div class="txs">'+sev.transactions.filter(function(t){ var a=F.UI.txAcc||"all"; return a==="all"||String(t.accountId)===a; }).slice(0,30).map(function(t){ return '<div class="tx"><span class="num muted">'+deShort(t.date)+'</span><span class="tx-m"><b>'+esc(t.name||t.purpose||"Umsatz")+'</b><span class="muted">'+esc(t.name?t.purpose:"")+'</span></span>'+(t.status===100?'<span class="tag warn">offen</span>':'')+'<span class="num '+(t.amount<0?"bad-t":"ok-t")+'">'+(t.amount>0?"+":"")+eur(t.amount)+'</span></div>'; }).join("")+'</div>':'')+'</section></div>'+
    '<section class="panel"><div class="panel-h"><h2>Rechnungen</h2><div class="row wrap"><div class="chips">'+chip("open","Offen",null,"invf")+chip("over","Überfällig",null,"invf")+chip("draft","Entwürfe",null,"invf")+chip("paid","Bezahlt",null,"invf")+chip("all","Alle",null,"invf")+'</div><input class="f" style="max-width:240px" placeholder="Suchen: Nr., Kunde …" data-invq data-keepfocus="invq" value="'+esc(F.UI.invQ)+'" aria-label="Rechnungen suchen"></div></div>'+
      '<div class="scroll"><table><thead><tr><th>Nr.</th><th>Kunde</th><th>Datum</th><th>Fällig</th><th class="r">Betrag</th><th class="r">Offen</th><th>Status</th><th></th></tr></thead><tbody>'+(invList.map(function(i){ var st=F.invLine(i).match(/<span class="tag[^>]*>[^<]*<\/span>/); return '<tr><td><a href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(i.id)+'" target="_blank" rel="noopener">'+esc(i.nr||"Entwurf")+'</a></td><td>'+esc(i.contact)+(i.header&&i.header!=="Rechnung"?'<div class="sub">'+esc(i.header)+'</div>':'')+'</td><td class="num">'+deShort(i.date)+'</td><td class="num">'+deShort(i.due)+'</td><td class="r num">'+eur(i.gross)+'</td><td class="r num">'+(i.open>0.005?eur(i.open):"—")+'</td><td>'+(st?st[0]:"")+'</td><td class="r nowrap">'+(i.open>0.005&&i.status!==100?'<button class="btn" data-act="book:'+esc(i.id)+'">Zahlung</button> ':'')+'<a class="btn icon" href="'+F.SEVURL+'/fi/detail/type/RE/id/'+encodeURIComponent(i.id)+'" target="_blank" rel="noopener" title="In sevDesk öffnen" aria-label="In sevDesk öffnen">↗</a></td></tr>'; }).join("")||'<tr><td colspan="8" class="empty">Keine Rechnungen in dieser Ansicht.</td></tr>')+'</tbody></table></div>'+(invMoreN?'<button class="more" data-act="invmore">Weitere '+Math.min(40,invMoreN)+' laden ('+invMoreN+' übrig)</button>':'')+'</section>':'');
  })();
}

/* ---------- Jahresprognose ---------- */
// Logik: Ist (gestellte Rechnungen laut sevDesk bis heute) + Rest des Jahres.
// Rest je Monat = aktuelles Monatstempo (Schnitt der letzten 3 vollen Monate); hat das Vorjahr mind. 8 Monate mit Umsatz,
// zur Hälfte gemischt mit dem Vorjahreswert dieses Monats × Wachstumsfaktor (Ist heuer ÷ Vorjahr im gleichen Zeitraum).
// Dazu kommen Plattform-Einnahmen, die nicht über sevDesk-Rechnungen laufen (Kantineur-Abos, kochdu-Online-Provisionen),
// und bereits angefallene, aber noch nicht verrechnete Beträge aus dem Abgleich.
function monthSums(invs,year){ var m=new Array(12).fill(0); invs.forEach(function(i){ if((i.status===200||i.status===750||i.status===1000)&&String(i.date||"").slice(0,4)===String(year)){ var k=parseInt(String(i.date).slice(5,7),10)-1; m[k]+=i.type==="SR"?-Math.abs(i.gross):i.gross; } }); return m; }
function renderPrognose(){
  var D=F.D, sev=D.sev, yr=+D.year, now=new Date(), cy=now.getFullYear();
  if(!sev) return '<div class="notice">sevDesk antwortet gerade nicht – die Prognose braucht die Rechnungsdaten.</div>';
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
  var inc=D.income||{lines:[]}, kantMon=0, kantYtd=0, kochOnlineYtd=0;
  var kl=(inc.lines||[]).find(function(l){return l.key==="kantineur";}); kantMon=kl?kl.monthly:0;
  var ka=D.platforms&&D.platforms.kantineur; kantYtd=ka?(ka.revenueGrossCents||0)/100:0;
  var ko=D.platforms&&D.platforms.kochdu; kochOnlineYtd=ko&&ko.totals?(ko.totals.onlineProvisionCents||0)/100:0;
  var remFrac=(12-mNow-dayFrac);
  var kochOnlineRest=mNow+dayFrac>0?kochOnlineYtd/(mNow+dayFrac)*remFrac:0;
  var unbilled=D.abgleich.totals.unbilled||0;
  var rows=[
    ["Rechnungen laut sevDesk",ist,rest,"Ist bis heute + Hochrechnung: "+method],
    ["Kantineur-Abos",kantYtd,kantMon*remFrac,"läuft über die Plattform, nicht über sevDesk-Rechnungen"],
    ["kochdu Online-Provisionen",kochOnlineYtd,kochOnlineRest,"automatisch einbehalten, hochgerechnet"],
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
    '<div class="panel kpi"><span class="k">Vorjahr '+(yr-1)+'</span><span class="v num money">'+(prevTotal?eur0(prevTotal):"—")+'</span><span class="s">'+(prevTotal?((total-prevTotal>=0?"+":"")+Math.round((total/prevTotal-1)*100)+" % erwartet"):"keine Vorjahresdaten in sevDesk")+'</span></div>'+
  '</div>'+
  '<section class="panel"><div class="panel-h"><h2>Verlauf '+yr+'</h2><span class="muted">dunkel = Ist, hell = Prognose (sevDesk-Rechnungen)</span></div><div class="chart">'+progChart(cur,chartVals,mNow)+'</div></section>'+
  '<section class="panel"><div class="panel-h"><h2>So setzt sich die Prognose zusammen</h2></div><div class="scroll"><table><thead><tr><th>Quelle</th><th class="r">Ist bis heute</th><th class="r">Erwartet bis Jahresende</th><th class="r">Summe</th></tr></thead><tbody>'+
    rows.map(function(r){ return '<tr><td><b>'+esc(r[0])+'</b><div class="sub">'+esc(r[3])+'</div></td><td class="r num money">'+eur0(r[1])+'</td><td class="r num money">'+eur0(r[2])+'</td><td class="r num money"><b>'+eur0(r[1]+r[2])+'</b></td></tr>'; }).join("")+
    '<tr class="grp"><td>Gesamt</td><td class="r num money">'+eur0(tIst)+'</td><td class="r num money">'+eur0(tRest)+'</td><td class="r num money">'+eur0(total)+'</td></tr></tbody></table></div></section>'+
  (costIst>0?'<section class="panel"><div class="panel-h"><h2>Ausgaben und Gewinn (grob)</h2><span class="muted">netto, Belege laut sevDesk, linear hochgerechnet</span></div><div class="panel-b"><dl class="facts"><dt>Ausgaben bis heute</dt><dd class="num money">'+eur0(costIst)+'</dd><dt>Ausgaben-Prognose Jahr</dt><dd class="num money">'+eur0(costTotal)+'</dd><dt>Umsatz-Prognose netto (÷ 1,2)</dt><dd class="num money">'+eur0(total/1.2)+'</dd><dt><b>Gewinn-Prognose vor Steuern</b></dt><dd class="num money"><b>'+eur0(total/1.2-costTotal)+'</b></dd></dl><p class="muted" style="margin:10px 0 0">Grobe Schätzung. Genaue Zahlen nach Kategorien findest du unter JAB.</p></div></section>':'<p class="muted">Ausgaben und Gewinn erscheinen hier, sobald du einmal den Unterpunkt UVA oder JAB geöffnet hast (dort werden die Belege aus sevDesk geladen).</p>');
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
