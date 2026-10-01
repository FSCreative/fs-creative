(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort, svg=F.svg, head=F.head, UI=F.UI, ago=F.ago, dayLabel=F.dayLabel;
function D_(){ return F.D; }
/* Grundgerüst – wird zum vollen Funktionsumfang ausgebaut. */
function vWeb(){
  var s=F.D.sites||[], cust=s.filter(function(x){return !x.own;}), own=s.filter(function(x){return x.own;});
  var bad=function(x){ return x.up===false||/FAILED|CRASHED/.test(x.status||""); };
  cust.sort(function(a,b){ return F.siteBad(b)-F.siteBad(a)||(b.active-a.active)||a.name.localeCompare(b.name,"de"); });
  var tot=cust.filter(function(x){return x.active;}).reduce(function(t,x){ t.inc+=x.incomeYear; t.cost+=x.costYear; return t; },{inc:0,cost:0});
  var row=function(x){ var b=F.siteBad(x); var st=b?'<span class="tag bad">'+(x.up===false?"offline":"Deploy fehlgeschlagen")+'</span>':(x.up?'<span class="tag ok">online</span>':'<span class="tag grey">'+(x.status?"Railway":"—")+'</span>');
    return '<tr><td><span class="dot '+(b?"bad":x.up?"ok":"")+'"></span><b>'+esc(x.name)+'</b><div class="sub">'+(x.url?'<a href="'+esc(x.url)+'" target="_blank" rel="noopener">'+esc(x.url.replace(/^https:\/\//,""))+'</a>':'ohne Domain')+(x.customer?' · '+esc(x.customer):'')+'</div></td><td>'+st+'</td><td class="hide-m">'+(x.own?'<span class="muted">eigenes Projekt</span>':x.active?(x.billedUntil&&x.billedUntil>=F.D.today?'<span class="tag ok">bis '+de(x.billedUntil)+'</span>':'<span class="tag warn">'+(x.billedUntil?"fällig seit "+de(x.billedUntil):"noch nie verrechnet")+'</span>'):'<span class="muted">wird nicht verrechnet</span>')+'</td><td class="r num">'+(x.railwayMonth!=null?eur(x.railwayMonth):'—')+'</td><td class="r num hide-m">'+eur(x.costYear)+'</td><td class="r num hide-m">'+(x.incomeYear?eur(x.incomeYear):'—')+'</td><td class="r num '+(x.active&&!x.own?(x.result>=0?"pos":"neg"):"")+'">'+(x.active&&!x.own?eur(x.result):'—')+'</td></tr>'; };
  var thead='<thead><tr><th>Website</th><th>Status</th><th class="hide-m">Abrechnung</th><th class="r">Railway / Monat</th><th class="r hide-m">Kosten / Jahr</th><th class="r hide-m">Einnahmen / Jahr</th><th class="r">Ergebnis / Jahr</th></tr></thead>';
  return head("Websites",cust.filter(function(x){return x.active;}).length+" Kundenseiten werden verrechnet. Kosten = Railway (letzte 30 Tage hochgerechnet) + Domain.",'<a class="btn" href="/admin">Preise &amp; Abrechnung bearbeiten</a>')+
  '<div class="kpis"><div class="panel kpi"><span class="k">Einnahmen / Jahr</span><span class="v num">'+eur0(tot.inc)+'</span></div><div class="panel kpi"><span class="k">Kosten / Jahr</span><span class="v num">'+eur0(tot.cost)+'</span></div><div class="panel kpi"><span class="k">Ergebnis / Jahr</span><span class="v num '+(tot.inc-tot.cost>=0?"pos":"neg")+'">'+eur0(tot.inc-tot.cost)+'</span></div><div class="panel kpi"><span class="k">Railway gesamt</span><span class="v num">'+(F.D.railwayCosts?eur0(F.D.railwayCosts.totalEur):"—")+'</span><span class="s">letzte 30 Tage</span></div></div>'+
  '<section class="panel"><div class="panel-h"><h2>Kundenprojekte</h2></div><div class="scroll"><table>'+thead+'<tbody>'+cust.map(row).join("")+'</tbody></table></div></section>'+
  (own.length?'<section class="panel"><div class="panel-h"><h2>Eigene Projekte</h2></div><div class="scroll"><table>'+thead+'<tbody>'+own.map(row).join("")+'</tbody></table></div></section>':'');
}

F.view({id:"web",label:"Websites",short:"Web",icon:"web",order:60,render:vWeb});
})();
