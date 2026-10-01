(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, deShort=F.deShort, svg=F.svg, head=F.head, UI=F.UI, ago=F.ago, dayLabel=F.dayLabel;
function D_(){ return F.D; }
/* Grundgerüst – wird zum vollen Funktionsumfang ausgebaut. */
function vPlat(){
  var P=F.D.platforms, c=function(v){ return eur((+v||0)/100); };
  var ko=P.kochdu, bz=P.blitzdings, ka=P.kantineur, va=P.valuero;
  var card=function(t,sub,body){ return '<section class="panel plat"><div class="plat-h"><h3>'+t+'</h3><span class="muted">'+sub+'</span></div>'+body+'</section>'; };
  var dl=function(rows){ return '<dl class="facts">'+rows.map(function(r){ return '<dt>'+r[0]+'</dt><dd class="num">'+r[1]+'</dd>'; }).join("")+'</dl>'; };
  return head("Plattformen","Live-Zahlen deiner eigenen Produkte für "+esc(F.D.year)+". Verrechnet wird im Bereich Geld & Abgleich.")+
  '<div class="plats">'+
   card("kochdu","Bestellplattform",ko?dl([["Restaurants",(ko.restaurants||[]).length],["Bar-Gebühren offen",c(ko.totals.barOpenCents)],["Bar-Gebühren verrechnet",c(ko.totals.barSettledCents)],["Online-Provisionen",c(ko.totals.onlineProvisionCents)]].concat(ko.nutzer&&ko.nutzer.total!=null?[["App-Nutzer",ko.nutzer.total]]:[])):'<div class="muted">Keine Verbindung zu kochdu.</div>')+
   card("Blitzdings","Fotobox & 360°",bz?dl([["Bezahlt",c(bz.revenue.paidCents)],["Offen",c(bz.revenue.openCents)],["Diesen Monat",c(bz.revenue.thisMonthPaidCents)],["Anstehende Buchungen",(bz.upcoming||[]).length]])+((bz.upcoming||[]).length?'<div class="invs">'+bz.upcoming.slice(0,5).map(function(b){ return '<span>'+deShort(String(b.eventDate||"").slice(0,10))+' · '+esc(b.customerName||"")+' · '+esc(b.package||"")+' <span class="tag '+(b.paymentStatus==="PAID"?"ok":"warn")+'">'+(b.paymentStatus==="PAID"?"bezahlt":"offen")+'</span></span>'; }).join("")+'</div>':''):'<div class="muted">Keine Verbindung zu Blitzdings.</div>')+
   card("Kantineur","Vereinskasse",ka?dl([["MRR",c(ka.mrrCents)],["Aktive Abos",(ka.subscribers||{}).active||0],["Zahlend",(ka.subscribers||{}).paying||0],["Kantinen",(ka.canteens||{}).total||0],["Umsatz "+esc(F.D.year),c(ka.revenueGrossCents)]]):'<div class="muted">Keine Verbindung zu Kantineur.</div>')+
   card("VALUERO","Tourismus & Hosting",va?dl(va.objects.map(function(o){ return [esc(o.name)+' <span class="muted">('+(+o.feeBookings||0)+' Buchungen)</span>',c(o.provisionCents)]; })):'<div class="muted">Keine Verbindung zu den VALUERO-Objekten.</div>')+
  '</div><p class="muted">Detail-Tabellen der Plattformen (Monate, Abo-Varianten, App-Statistiken) findest du weiterhin im <a href="/admin">klassischen Dashboard</a>.</p>';
}

F.view({id:"plat",label:"Plattformen",short:"Plattf.",icon:"plat",order:70,render:vPlat});
})();
