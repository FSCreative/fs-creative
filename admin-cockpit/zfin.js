/* Finanzen im Aufbau von sevDesk: eigene Navigation links (Übersicht, Aufträge, Rechnungen, Belege, Bank, Steuern, Verwalten),
   Tabellen wie in sevDesk, Rechnung als eigene Seite mit PDF links und Details rechts.
   Nutzt die vorhandenen Aktionen (senden, Zahlung, Mahnung, Storno, Beleg, Bank-Zuordnung …) und Unterseiten (UVA, U1, JAB, Prognose, Umstieg). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, UI=F.UI;
function deShort(v){ var m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?m[3]+"."+m[2]+"."+m[1].slice(2):""; }
UI.fin=UI.fin||F.ls("fsc_fin_page")||"dash";
if(/^invd(:|$)/.test(UI.fin)&&!UI.fin.split(":")[1]) UI.fin="inv";   // Detailseite ohne Rechnung nie wiederherstellen
var C={tx:null,vou:{},cn:null,busy:{}};
var IC={
  dash:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  orders:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  inv:'<path d="M3 7h18v12H3z"/><path d="M3 7l3-3h12l3 3"/>',
  vou:'<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  bank:'<path d="M3 10h18L12 4z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  tax:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  ct:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  prod:'<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  sync:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  set:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  back:'<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  dl:'<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  cash:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>',
  id:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 10h4M14 14h3"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17h.01"/>',
  cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'
};
function ic(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IC[k]||"")+'</svg>'; }
/* Navigation wie in sevDesk */
var NAV=[
  {id:"dash",label:"Übersicht",icon:"dash"},
  {id:"orders",label:"Aufträge",icon:"orders",sub:[["orders","Angebote"]]},
  {id:"inv",label:"Rechnungen",icon:"inv",sub:[["inv","Alle"],["wkr","Wiederkehrend"],["dun","Mahnungen"],["cn","Gutschriften"]]},
  {id:"vou",label:"Belege",icon:"vou",sub:[["vou","Alle"],["rvou","Wiederkehrend"]]},
  {id:"bank",label:"Bank & Kasse",icon:"bank",sub:[["bank","Kontoumsätze"],["open","Nicht zugeordnet"],["kasse","Kassenbuch"]]},
  {id:"steuer",label:"Steuern",icon:"tax",sub:[["steuer","Übersicht"],["uva","Voranmeldung (UVA)"],["u1","Umsatzsteuer-Jahr (U1)"],["jab","Gewinn & Jahreserklärung"],["anlagen","Anlagen & Abschreibungen"],["prognose","Prognose"]]},
  {sep:"Verwalten"},
  {id:"ct",label:"Kontakte",icon:"ct"},
  {id:"prod",label:"Produkte",icon:"prod"},
  {id:"abgl",label:"Plattformen verrechnen",icon:"sync"},
  {id:"lock",label:"Festschreiben",icon:"lock"},
  {id:"mydata",label:"Meine Daten",icon:"id"},
  {id:"umstieg",label:"Firma & Einstellungen",icon:"set"}
];
function groupOf(p){ for(var i=0;i<NAV.length;i++){ var n=NAV[i]; if(n.id===p) return n.id; if(n.sub&&n.sub.some(function(s){return s[0]===p;})) return n.id; } return p; }
function sidebar(){
  var cur=UI.fin, g=groupOf(cur.split(":")[0]);
  return '<nav class="fsd-nav" aria-label="Finanzen"><button type="button" class="fsd-search" data-act="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Suchen<kbd>⌘K</kbd></button>'+NAV.map(function(n){
    if(n.sep) return '<div class="fsd-sep">'+esc(n.sep)+'</div>';
    var on=g===n.id;
    return '<button type="button" class="fsd-i'+(on?" on":"")+'" data-act="fin:'+n.id+'">'+ic(n.icon)+'<span>'+esc(n.label)+'</span></button>'+
      (on&&n.sub&&n.sub.length>1&&n.id!=="orders"?'<div class="fsd-sub">'+n.sub.map(function(s){ return '<button type="button" class="'+(cur.split(":")[0]===s[0]?"on":"")+'" data-act="fin:'+s[0]+'">'+esc(s[1])+'</button>'; }).join("")+'</div>':'');
  }).join("")+'<button type="button" class="fsd-i fsd-help" data-act="help">'+ic("help")+'<span>Hilfe</span><kbd>?</kbd></button></nav>';
}
F.action("fin",function(p){ if(/^invd/.test(p)&&!p.split(":")[1]) p="inv"; UI.fin=p; if(!/^invd/.test(p)) F.ls("fsc_fin_page",p.split(":")[0]); UI.fpg=0; F._forceRender=true; F.render(); window.scrollTo(0,0); });

/* Status-Pillen wie in sevDesk */
function pill(kind,label){ return '<span class="fsd-pill '+kind+'">'+esc(label)+'</span>'; }
function invPill(i){
  if(i.cancelled) return pill("grey","Storniert");
  if(i.type==="SR") return pill("grey","Storno");
  if(i.status===100) return pill("draft","Entwurf");
  if(i.status===1000) return pill("paid","Bezahlt");
  if(i.overdue) return pill("due","Fällig");
  if(i.status===750) return pill("open","Teilbezahlt");
  return pill("open","Offen");
}
function relDue(i){
  if(i.status===100||!i.due) return '<span class="m">– – –</span>';
  if(i.status===1000||i.cancelled||i.type==="SR") return '<span class="fsd-strike">'+de(i.due)+'</span>';
  var d=Math.round((new Date(i.due+"T12:00:00")-new Date(F.D.today+"T12:00:00"))/864e5);
  if(d<0) return '<span class="fsd-due">Seit '+(-d)+' Tag'+(d===-1?"":"en")+'</span>';
  if(d===0) return '<span class="fsd-due">Heute</span>';
  return '<span style="color:var(--sd-ink2)">In '+d+' Tag'+(d===1?"":"en")+'</span>';
}
function pager(n,per){ var pg=UI.fpg||0, pages=Math.max(1,Math.ceil(n/per)); if(pages<=1) return ''; return '<div class="fsd-pager"><button type="button" data-act="fpg:'+(pg-1)+'"'+(pg<=0?" disabled":"")+'>‹</button><span>'+(pg*per+1)+' – '+Math.min(n,(pg+1)*per)+' von '+n+'</span><button type="button" data-act="fpg:'+(pg+1)+'"'+(pg>=pages-1?" disabled":"")+'>›</button></div>'; }
F.action("fdl",function(id){ location.href="/admin/api/sevdesk/pdf?id="+encodeURIComponent(id)+"&dl=1"; });
F.action("fpg",function(v){ UI.fpg=Math.max(0,+v||0); F.render(); });
function tabs(act,cur,list){ return '<div class="fsd-tabs">'+list.map(function(t){ return '<button type="button" data-act="'+act+':'+t[0]+'" aria-pressed="'+(cur===t[0])+'">'+esc(t[1])+(t[2]!=null?' <span class="n">'+t[2]+'</span>':'')+'</button>'; }).join("")+'</div>'; }
function head(title,sub,btns){ return '<div class="fsd-head"><div><h1>'+title+'</h1>'+(sub?'<p>'+sub+'</p>':'')+'</div><div class="fsd-btns">'+(btns||"")+'</div></div>'; }
function search(key,ph){ return '<input class="f fsd-q" data-fq="'+key+'" data-keepfocus="fq'+key+'" placeholder="'+esc(ph)+'" value="'+esc(UI["fq_"+key]||"")+'">'; }
F.listen("input","[data-fq]",function(el){ UI["fq_"+el.getAttribute("data-fq")]=el.value; UI.fpg=0; clearTimeout(el._t); el._t=setTimeout(F.render,220); });
function sevOk(){ return !!(F.D&&F.D.sev); }
function noSev(){ return '<div class="notice">Die Buchhaltung antwortet gerade nicht. <button class="btn" data-act="reload">Neu laden</button></div>'; }

/* ---------- Übersicht (Dashboard wie sevDesk) ---------- */
function vouLoad(){ var y=String(F.D.year); if(C.vou[y]||C.busy["v"+y]) return; C.busy["v"+y]=1;
  var fail=function(){ C.busy["v"+y]=0; C.vouErr=(C.vouErr||0)+1; if(C.vouErr<6) setTimeout(function(){ vouLoad(); },C.vouErr*4000); else { C.vou[y]={ok:false}; F.render(); } };
  F.api("/admin/api/sev/vouchers?year="+y).then(function(j){ if(!j||!j.ok) return fail(); C.busy["v"+y]=0; C.vouErr=0; C.vou[y]=j; F.render(); }).catch(fail); }

/* Ertrag/Aufwand-Diagramm: Raster mit Beträgen, abgerundete Balken (Aufwand + Abschreibung gestapelt), Ergebnis-Linie,
   aktueller Monat markiert, kommende Monate blass; Drüberfahren/Antippen zeigt die Zahlen des Monats */
var MNL=["Jänner","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"], MNS=["Jän","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
var CH=null;
function niceMax(v){ if(v<=0) return 1000; var p=Math.pow(10,Math.floor(Math.log10(v))), n=v/p; return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p; }
function chTip(i){ if(!CH) return ""; var r=CH.rev[i], e=CH.exp[i], a=CH.afa[i], g=r-e-a, f=CH.y+"-"+String(i+1).padStart(2,"0")>F.D.today.slice(0,7);
  return '<b>'+MNL[i]+' '+CH.y+'</b>'+(f?' <span class="muted">(kommt noch)</span>':'')+'<span><i style="background:#2fb27b"></i>Ertrag '+eur(r)+'</span><span><i style="background:#ef4a4a"></i>Aufwand '+eur(e)+'</span><span><i style="background:#f5a524"></i>Abschreibung '+eur(a)+'</span><span><i style="background:#534acc"></i>Ergebnis <b class="'+(g<0?"bad-t":"ok-t")+'">'+eur(g)+'</b></span>'; }
function finChart(rev,exp,afa,y){
  CH={rev:rev,exp:exp,afa:afa,y:y};
  var W=720,H=230,L=52,T=10,B=26,ih=H-T-B,iw=W-L-8,bw=iw/12;
  var res=rev.map(function(r,i){ return r-exp[i]-afa[i]; }), top=niceMax(Math.max.apply(null,rev.concat(exp.map(function(e,i){ return e+afa[i]; }))));
  var low=Math.min(0,Math.min.apply(null,res)), bot=low<0?-niceMax(-low):0, span=top-bot, yv=function(v){ return T+(top-v)/span*ih; };
  var cm=+F.D.today.slice(5,7)-1, cy=+F.D.today.slice(0,4), curI=cy===y?cm:(y<cy?11:-1);
  var g='', steps=4; for(var k=0;k<=steps;k++){ var v=bot+span*k/steps, yy=yv(v); g+='<line x1="'+L+'" x2="'+(W-8)+'" y1="'+yy+'" y2="'+yy+'" stroke="var(--sd-line)" '+(Math.abs(v)<0.5?'stroke-width="1.2" stroke="var(--sd-line2)"':'stroke-dasharray="3 4"')+'/><text x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end" font-size="11" fill="var(--sd-mut2)">'+(Math.abs(v)>=1000?(Math.round(v/100)/10).toLocaleString("de-AT")+"k":Math.round(v))+'</text>'; }
  var rb=function(x,y0,w,h){ if(h<=0.5) return ''; var r=Math.min(4,w/2,h); return 'M'+x+','+(y0+h)+'V'+(y0+r)+'Q'+x+','+y0+' '+(x+r)+','+y0+'H'+(x+w-r)+'Q'+(x+w)+','+y0+' '+(x+w)+','+(y0+r)+'V'+(y0+h)+'Z'; };
  var b='', pts=[];
  for(var i=0;i<12;i++){
    var x0=L+i*bw, w=Math.min(18,bw*0.32), gx=x0+bw/2-w-1.5, ex=x0+bw/2+1.5, fut=y>cy||(y===cy&&i>cm), op=fut?' opacity=".35"':'';
    var y0=yv(0), hr=y0-yv(Math.max(0,rev[i])), he=y0-yv(exp[i]), ha=y0-yv(exp[i]+afa[i])-he;
    b+='<g class="fch-m" data-chm="'+i+'" data-act="chm:'+i+'"><rect class="fch-hit" x="'+x0+'" y="'+T+'" width="'+bw+'" height="'+ih+'" rx="6"/>'+
      '<path d="'+rb(gx,y0-hr,w,hr)+'" fill="#2fb27b"'+op+'/>'+(ha>0.5?'<path d="'+rb(ex,y0-he-ha,w,ha)+'" fill="#f5a524"'+op+'/>':'')+'<rect x="'+ex+'" y="'+(y0-he)+'" width="'+w+'" height="'+he+'" fill="#ef4a4a"'+op+(ha>0.5?'':' rx="3"')+'/>'+
      '<text x="'+(x0+bw/2)+'" y="'+(H-8)+'" text-anchor="middle" font-size="11" '+(i===curI?'font-weight="700" fill="var(--sd-ink)"':'fill="var(--sd-mut2)"')+'>'+MNS[i]+'</text>'+(i===curI?'<circle cx="'+(x0+bw/2)+'" cy="'+(H-2)+'" r="2.5" fill="#fb523b"/>':'')+'</g>';
    if(!fut) pts.push((x0+bw/2)+','+yv(res[i]));
  }
  var line=pts.length>1?'<polyline points="'+pts.join(" ")+'" fill="none" stroke="#534acc" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>'+pts.map(function(p){ var q=p.split(","); return '<circle cx="'+q[0]+'" cy="'+q[1]+'" r="3" fill="#fff" stroke="#534acc" stroke-width="2" pointer-events="none"/>'; }).join(""):'';
  return {svg:'<svg viewBox="0 0 '+W+' '+H+'" class="fsd-chart fch-svg" role="img" aria-label="Ertrag und Aufwand je Monat">'+g+b+line+'</svg>',tip:chTip(curI>=0?curI:11)};
}
function chShow(i,el){ var t=document.getElementById("fchTip"); if(t) t.innerHTML=chTip(i); document.querySelectorAll(".fch-m.on").forEach(function(x){ x.classList.remove("on"); }); if(el) el.classList.add("on"); }
document.addEventListener("mouseover",function(e){ var g=e.target&&e.target.closest&&e.target.closest(".fch-m"); if(g) chShow(+g.getAttribute("data-chm"),g); });
F.action("chm",function(v,el){ chShow(+v,el); });

/* Plattform-Kacheln (Blitzdings, kochdu, Kantineur, Skikaiser, Hüttengaudi): Umsatz groß, Kennzahlen darunter, Mollie-Stand */
function platTiles(){
  var P=(F.D&&F.D.platforms)||{}, c=function(v){ return eur0((+v||0)/100); }, out=[];
  var moOf=function(rx){ var p=null; (MO&&MO.summary||[]).forEach(function(m){ (m.byProfile||[]).forEach(function(b){ if(rx.test(b.name)) p=b; }); }); if(!p) return "";
    return '<div class="pt-mo">Mollie: '+eur0(p.gross+p.provisions)+' eingenommen · Gebühren '+eur(p.fees)+(p.unmatched?' · <b class="bad-t">'+p.unmatched+' ohne Rechnung</b>':'')+'</div>'; };
  var tile=function(key,name,big,bigl,rows,mo){ return '<button type="button" class="fsd-card pt" data-act="platgo:'+key+'"><div class="pt-h"><b>'+name+'</b><span>'+ic("right")+'</span></div><div class="pt-big">'+big+'</div><div class="pt-bl">'+bigl+'</div><div class="pt-rows">'+rows.map(function(r){ return '<div><span>'+r[0]+'</span><b>'+r[1]+'</b></div>'; }).join("")+'</div>'+(mo||"")+'</button>'; };
  var b=P.blitzdings; if(b&&b.revenue) out.push(tile("blitzdings","Blitzdings",c(b.revenue.paidCents),"bezahlt (brutto)",[["offen",c(b.revenue.openCents)],["diesen Monat",c(b.revenue.thisMonthPaidCents)],["Buchungen",((b.bookings||{}).total||0)+" · "+((b.bookings||{}).upcomingCount||0)+" kommend"]],moOf(/blitz/i)));
  var k=P.kochdu; if(k&&k.totals){ var t=k.totals; out.push(tile("kochdu","kochdu",c((+t.onlineProvisionCents||0)+(+t.barProvisionCents||0)),"Provisionen gesamt",[["online / bar",c(t.onlineProvisionCents)+" / "+c(t.barProvisionCents)],["Bar noch offen",c(t.barOpenCents)],["Bestellungen",((+t.onlineOrders||0)+(+t.barOrders||0))+" · "+((k.restaurants||[]).length)+" Lokale"],["Nutzer",(k.nutzer&&k.nutzer.gesamt)||0]],moOf(/koch/i))); }
  var q=P.kantineur; if(q&&q.canteens) out.push(tile("kantineur","Kantineur",c(q.mrrCents)+"<small>/Monat</small>","wiederkehrend (MRR)",[["Umsatz bisher",c(q.revenueGrossCents)],["Kantinen aktiv",(q.canteens.byStatus&&q.canteens.byStatus.ACTIVE)||q.canteens.total||0],["zahlend / gesponsert",((q.subscribers||{}).paying||0)+" / "+((q.subscribers||{}).sponsored||0)]],moOf(/kantin/i)));
  var game=function(key,name,d){ if(!d||!d.configured) return; var t=d.totals||{}, u=d.users||{}; out.push(tile(key,name,c(t.proceedsCents),"Erlöse (nach Store-Gebühr)",[["Käufe",(t.count||0)+(t.refunds?" · "+t.refunds+" erstattet":"")],["Spieler",(u.total!=null?u.total:u.gesamt)||0],["aktiv 30 Tage",(u.aktiv&&u.aktiv.monat!=null?u.aktiv.monat:u.aktiv30)||0]])); };
  game("skikaiser","Skikaiser",F.D&&F.D.skikaiser); game("huettengaudi","Hüttengaudi",F.D&&F.D.huettengaudi);
  if(!out.length) return "";
  if(!MO&&!C.busy.mo){ C.busy.mo=1; F.api("/admin/api/fin/mollie?year="+F.D.year).then(function(j){ C.busy.mo=0; MO=j||{ok:false}; F.render(); }); }
  return '<div class="pt-wrap"><div class="fsd-ch" style="margin:4px 2px 8px"><b>Plattformen</b><span class="muted">'+esc(String(F.D.year))+' · live</span></div><div class="pt-grid">'+out.join("")+'</div></div>';
}
F.action("platgo",function(k){ var t={blitzdings:"blitz",kochdu:"kochdu",kantineur:"kantineur",skikaiser:"ski",huettengaudi:"hg"}[k]||"ueb"; F.UI.plat=t; F.ls("fsc_plat_tab",t); F.go("plat"); window.scrollTo(0,0); });
function pageDash(){
  if(!sevOk()) return noSev();
  var sev=F.D.sev, y=String(F.D.year); vouLoad();
  var inv=sev.invoices.filter(function(i){ return i.type!=="MA"&&i.type!=="SR"&&!i.cancelled&&(i.status>=200)&&String(i.date||"").slice(0,4)===y; });
  var rev=new Array(12).fill(0), exp=new Array(12).fill(0);
  inv.forEach(function(i){ var m=+String(i.date).slice(5,7)-1; rev[m]+=(i.type==="SR"?-1:1)*Math.abs(i.net||i.gross/1.2); });
  var vd=C.vou[y], cats={};
  // wie sevDesk „Gewinn und Verlust“: Umsatz = Rechnungen netto (ohne Stornierte) + Einnahme-Belege (Erlösminderung abziehen, durchlaufende Posten nicht)
  if(vd&&vd.ok) vd.vouchers.forEach(function(v){ if(v.cd!=="D"||v.status<100||v.type==="RV") return; if(/durchlaufend/i.test(v.category||"")) return; var m=+String(v.date||"").slice(5,7)-1; if(m>=0) rev[m]+=(/erl(ö|oe)sminderung/i.test(v.category||"")?-1:1)*(v.net||0); });
  // Aufwand wie sevDesk: Anlagen-Käufe nicht als Ausgabe (sie kommen über die Abschreibung), Geldtransit/Privat nie
  if(F.steuerLoad) F.steuerLoad();
  var AID=F.assetDocIds?F.assetDocIds():{}, AF=F.afaByMonth?F.afaByMonth(+y):null, afa=new Array(12).fill(0);
  if(AF) Object.keys(AF.months).forEach(function(k){ afa[+k.slice(5,7)-1]+=AF.months[k]; });
  if(vd&&vd.ok) vd.vouchers.forEach(function(v){ if(v.cd!=="C"||v.status<100||v.type==="RV") return; if(/geldtransit|privat/i.test(v.category||"")) return; var m=+String(v.date||"").slice(5,7)-1, n=v.net||0, an=AID[v.id]?(AID[v.id]===true?n:Math.min(n,AID[v.id])):0; n-=an; if(m>=0) exp[m]+=n;
    if(n){ var c=v.category||"Sonstiges"; cats[c]=(cats[c]||0)+n; } });
  if(AF&&AF.total) cats["Abschreibungen"]=(cats["Abschreibungen"]||0)+AF.total;
  var chart=finChart(rev,exp,afa,+y);
  var tr=rev.reduce(function(a,b){return a+b;},0), te=exp.reduce(function(a,b){return a+b;},0)+afa.reduce(function(a,b){return a+b;},0);
  var trG=inv.reduce(function(a,i){ return a+(+i.gross||0); },0);
  if(vd&&vd.ok) vd.vouchers.forEach(function(v){ if(v.cd!=="D"||v.status<100||v.type==="RV"||/durchlaufend/i.test(v.category||"")) return; trG+=(/erl(ö|oe)sminderung/i.test(v.category||"")?-1:1)*(v.gross||0); });
  var catArr=Object.keys(cats).map(function(k){return [k,cats[k]];}).sort(function(a,b){return b[1]-a[1];});
  var donut=function(parts,colors,center){ var tot=parts.reduce(function(a,p){return a+Math.max(0,p[1]);},0)||1, acc=0, R=46, Cc=2*Math.PI*R;
    return '<svg viewBox="0 0 120 120" class="fsd-donut"><circle cx="60" cy="60" r="'+R+'" fill="none" stroke="var(--sunk)" stroke-width="16"/>'+parts.map(function(p,k){ var f=Math.max(0,p[1])/tot, s='<circle cx="60" cy="60" r="'+R+'" fill="none" stroke="'+colors[k%colors.length]+'" stroke-width="16" stroke-dasharray="'+(f*Cc)+' '+Cc+'" stroke-dashoffset="'+(-acc*Cc)+'" transform="rotate(-90 60 60)"><title>'+esc(p[0])+': '+eur(p[1])+'</title></circle>'; acc+=f; return s; }).join("")+'<text x="60" y="64" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">'+center+'</text></svg>'; };
  var cols=["#e5322d","#f58b7c","#f9b8ae","#c0362c","#fbd3cc","#8f1f1a","#d9d9de"];
  var invAll=sev.invoices.filter(function(i){ return i.type!=="MA"&&i.type!=="SR"&&!i.cancelled&&String(i.date||"").slice(0,4)===y&&i.status>=200; });
  var paid=invAll.filter(function(i){return i.status===1000;}).reduce(function(a,i){return a+i.gross;},0), open=invAll.filter(function(i){return i.open>0.005&&!i.overdue;}).reduce(function(a,i){return a+i.open;},0), over=invAll.filter(function(i){return i.overdue;}).reduce(function(a,i){return a+i.open;},0);
  var accs=sev.accounts||[], bal=accs.reduce(function(a,x){return a+(+x.balance||0);},0);
  var ab=F.D.abgleich.totals;
  var tasks=[];
  if(ab.unbilled>0.005) tasks.push(['abgl',eur0(ab.unbilled)+" zu verrechnen",ab.unbilledCount+" Posten ohne Rechnung"]);
  var drafts=sev.invoices.filter(function(i){return i.status===100;}); if(drafts.length) tasks.push(["inv:draft",drafts.length+" Rechnungsentwürfe","noch nicht versendet"]);
  var od=sev.invoices.filter(function(i){return i.overdue;}); if(od.length) tasks.push(["inv:due",od.length+" überfällig",eur0(od.reduce(function(a,i){return a+i.open;},0))+" offen"]);
  if(sev.unassigned) tasks.push(["open",sev.unassigned+" Bankumsätze","noch nicht zugeordnet"]);
  if(sev.vouchers&&sev.vouchers.drafts) tasks.push(["vou:draft",sev.vouchers.drafts+" Beleg-Entwürfe","prüfen & abschließen"]);
  return head("Übersicht","Jahr "+esc(y),'<button class="btn" data-act="voucher">Ausgabe erfassen</button><button class="btn primary" data-act="newinvoice">Rechnung schreiben</button>')+
    platTiles()+'<div class="fsd-grid">'+
      (function(){ var op=sev.invoices.filter(function(i){ return i.type!=="MA"&&i.type!=="SR"&&!i.cancelled&&(i.status===200||i.status===750); }), nf=function(i){ return i.gross?i.open*(i.net/i.gross):i.open; };
        var due=op.filter(function(i){return i.overdue;}).reduce(function(a,i){return a+nf(i);},0), notdue=op.filter(function(i){return !i.overdue;}).reduce(function(a,i){return a+nf(i);},0), tot=due+notdue||1;
        return '<section class="fsd-card fsd-kpi"><div class="fsd-ch"><b>Umsatz</b><span class="muted">netto · '+esc(y)+'</span></div><div class="fsd-big">'+(vd&&vd.ok?eur(tr):'…')+'</div><div class="fsd-bigl">'+(vd&&vd.ok?'brutto '+eur(trG)+' · ':'')+'Rechnungen ohne Stornierte + Einnahme-Belege</div><button type="button" class="fsd-acc" data-act="fin:inv"><span>Rechnungen</span><b>→</b></button></section>'+
          '<section class="fsd-card fsd-kpi"><div class="fsd-ch"><b>Offene Forderungen</b><span class="muted">netto</span></div><div class="fsd-big">'+eur(due+notdue)+'</div><div class="muted" style="font-size:12px">brutto '+eur(op.reduce(function(a,i){return a+i.open;},0))+'</div><div class="fsd-bar2"><i style="width:'+(due/tot*100)+'%;background:#e5322d"></i><i style="width:'+(notdue/tot*100)+'%;background:#f5a524"></i></div>'+
          '<div class="fsd-dl" style="margin-top:8px"><span><i style="background:#e5322d"></i>Fällige Rechnungen<b>'+eur(due)+'</b></span><span><i style="background:#f5a524"></i>Offene Rechnungen<b>'+eur(notdue)+'</b></span></div></section>'; })()+
      '<section class="fsd-card span2 fch"><div class="fsd-ch"><b>Ertrag / Aufwand</b><span class="muted">netto · '+esc(y)+(vd?'':' · lädt …')+'</span></div>'+
        '<div class="fch-sum"><div><span><i style="background:#2fb27b"></i>Erträge</span><b>'+eur0(tr)+'</b></div><div><span><i style="background:#ef4a4a"></i>Aufwand</span><b>'+eur0(te-afa.reduce(function(a,b){return a+b;},0))+'</b></div><div><span><i style="background:#f5a524"></i>Abschreibung</span><b>'+eur0(afa.reduce(function(a,b){return a+b;},0))+'</b></div><div><span><i style="background:#534acc"></i>Ergebnis</span><b class="'+(tr-te<0?"bad-t":"ok-t")+'">'+eur0(tr-te)+'</b></div></div>'+
        '<div class="fch-tip" id="fchTip">'+chart.tip+'</div>'+chart.svg+'</section>'+
      '<section class="fsd-card"><div class="fsd-ch"><b>Meine Aufgaben</b></div>'+(tasks.length?tasks.map(function(t){ return '<button type="button" class="fsd-task" data-act="fin:'+t[0]+'"><b>'+esc(t[1])+'</b><span>'+esc(t[2])+'</span></button>'; }).join(""):'<div class="sd-empty">Du hast keine offenen Aufgaben. 🎉</div>')+'</section>'+
      '<section class="fsd-card"><div class="fsd-ch"><b>Aufwand</b><span class="muted">nach Kategorie</span></div><div class="fsd-dn">'+donut(catArr.slice(0,6),cols,eur0(te))+'<div class="fsd-dl">'+catArr.slice(0,6).map(function(c,k){ return '<span><i style="background:'+cols[k%cols.length]+'"></i>'+esc(c[0])+'<b>'+eur0(c[1])+'</b></span>'; }).join("")+'</div></div></section>'+
      '<section class="fsd-card"><div class="fsd-ch"><b>Rechnungen</b><span class="muted">'+esc(y)+'</span></div><div class="fsd-dn">'+donut([["Bezahlt",paid],["Offen",open],["Überfällig",over]],["#2fb27b","#f5a524","#ef4a4a"],eur0(paid+open+over))+'<div class="fsd-dl"><span><i style="background:#2fb27b"></i>Bezahlt<b>'+eur0(paid)+'</b></span><span><i style="background:#f5a524"></i>Offen<b>'+eur0(open)+'</b></span><span><i style="background:#ef4a4a"></i>Überfällig<b>'+eur0(over)+'</b></span></div></div></section>'+
      '<section class="fsd-card"><div class="fsd-ch"><b>Konto</b></div><div class="fsd-big">'+eur(bal)+'</div><div class="fsd-bigl">Gesamtsaldo</div>'+accs.map(function(a){ return '<button type="button" class="fsd-acc" data-act="fin:bank:'+esc(a.id)+'"><span>'+esc(a.name)+'</span><b'+(a.balance<0?' class="bad-t"':'')+'>'+(a.balance==null?"—":eur(a.balance))+'</b></button>'; }).join("")+'</section>'+
    '</div>';
}

/* ---------- Rechnungen ---------- */
function pageInv(kind){
  if(!sevOk()) return noSev();
  var parts=UI.fin.split(":"), f=parts[1]||"all", q=(UI.fq_inv||"").toLowerCase(), per=25;
  var base=F.D.sev.invoices.slice().sort(function(a,b){ return (+b.id||0)-(+a.id||0); }).filter(function(i){ return kind==="dun"?i.dunning>0:i.type!=="MA"; });
  var cnt={all:base.length,draft:0,open:0,due:0,paid:0,locked:0};
  base.forEach(function(i){ if(i.status===100) cnt.draft++; if(i.open>0.005&&i.status!==100) cnt.open++; if(i.overdue) cnt.due++; if(i.status===1000) cnt.paid++; if(i.enshrined) cnt.locked++; });
  var list=base.filter(function(i){ if(f==="draft"&&i.status!==100) return false; if(f==="open"&&!(i.open>0.005&&i.status!==100)) return false; if(f==="due"&&!i.overdue) return false; if(f==="paid"&&i.status!==1000) return false; if(f==="locked"&&!i.enshrined) return false; return !q||(i.nr+" "+i.contact+" "+i.header+" "+i.gross).toLowerCase().indexOf(q)>-1; });
  var openSum=base.reduce(function(a,i){ return a+(i.status!==100?i.open:0); },0), pg=UI.fpg||0;
  var rows=list.slice(pg*per,(pg+1)*per).map(function(i){
    var sub=i.type==="SR"?(i.header||"Stornorechnung"):(i.header&&!/^rechnung$/i.test(i.header)?i.header:("Rechnung "+(i.nr||"")));
    var icons='<span class="fsd-ic">'+(i.status===100?'<button type="button" title="Per E-Mail senden" data-act="sdsend:'+esc(i.id)+'">'+ic("mail")+'</button>':(i.open>0.005?'<button type="button" title="Zahlung erfassen" data-act="book:'+esc(i.id)+'">'+ic("cash")+'</button>':''))+'<button type="button" title="Herunterladen" data-act="fdl:'+esc(i.id)+'">'+ic("dl")+'</button></span>';
    return '<tr class="fsd-row" data-act="fin:invd:'+esc(i.id)+'"><td>'+invPill(i)+'</td><td>'+relDue(i)+'</td><td class="nowrap m">'+(i.status===100?'– – –':(i.enshrined?'<span class="fsd-lock" title="Festgeschrieben">'+ic("lock")+'</span>':'')+esc(i.nr||"–"))+'</td><td><div>'+esc(i.contact||"—")+'</div><div class="sub">'+esc(sub)+'</div></td><td class="m">'+deShort(i.date)+'</td><td class="r nowrap">'+eur(i.type==="SR"?-Math.abs(i.gross):i.gross)+'</td><td class="r nowrap">'+eur(i.status===100?i.gross:i.open)+'</td><td class="r">'+icons+'</td></tr>';
  }).join("");
  return head(kind==="dun"?"Mahnungen":"Rechnungen",'Offene Rechnungen: '+eur(openSum),'<button class="btn primary" data-act="newinvoice">Rechnung schreiben</button>')+
    '<section class="fsd-card flush"><div class="fsd-bar">'+tabs("fin:"+(kind==="dun"?"dun":"inv"),f,[["all","Alle"],["draft","Entwurf"],["open","Offen"],["due","Fällig"],["locked","Festgeschrieben"],["paid","Bezahlt"]])+search("inv","Suchen …")+'</div>'+
    '<div class="scroll"><table class="fsd-t"><thead><tr><th>Status</th><th>Fälligkeit</th><th>Rechnungsnr.</th><th>Kunde</th><th>Datum</th><th class="r">Betrag (brutto)</th><th class="r">Offen (brutto)</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="empty">Keine Rechnungen in dieser Ansicht.</td></tr>')+'</tbody></table></div>'+pager(list.length,per)+'</section>';
}
/* Rechnung als eigene Seite */
var DET={};
function pageInvDetail(id){
  var d=DET[id];
  if(!d){ if(!C.busy["d"+id]){ C.busy["d"+id]=1; F.api("/admin/api/sev/invoice?id="+encodeURIComponent(id)).then(function(j){ C.busy["d"+id]=0; DET[id]=j||{ok:false}; F.render(); }); } return '<div class="sd-empty">Lade Rechnung …</div>'; }
  if(!d.ok) return '<div class="fsd-dhead"><button class="fsd-back" data-act="fin:inv" aria-label="Zurück">'+ic("back")+'</button><h1>Rechnung</h1></div><div class="notice">Diese Rechnung wurde nicht gefunden.</div>';
  var st=d.status, draft=st===100, open=st===200||st===750, i0=(F.D.sev.invoices||[]).find(function(x){return x.id===id;})||{};
  var kind=d.type==="MA"?"Mahnung":d.type==="SR"?"Stornorechnung":"Rechnung";
  var more=[];
  if(draft){ more.push(["sdedit:"+id,"Bearbeiten"]); more.push(["sdsent:"+id,"Als versendet markieren"]); }
  if(open||st===1000){ more.push(["sdsend:"+id,"Per E-Mail senden"]); }
  if(open&&d.type==="RE"){ more.push(["sdremind:"+id,"Mahnung erstellen"]); if(st===200&&!(d.paid>0)&&!d.enshrined) more.push(["sddraft:"+id,"Zurück auf Entwurf"]); }
  if(st===200&&d.type==="RE"&&!i0.cancelled) more.push(["sdcancel:"+id,"Stornieren"]);
  if((st===750||st===1000)&&!i0.cancelled&&d.type!=="SR"&&d.type!=="MA") more.push(["fincn:"+id,"Gutschrift"]);
  if(d.type==="RE"&&st>=200&&!i0.cancelled) more.push(["finwkr:"+id,"Wiederkehrend"]);
  var main=draft?'<button class="btn primary" data-act="sdsend:'+esc(id)+'">Per E-Mail senden</button>':(open?'<button class="btn primary" data-act="book:'+esc(id)+'">Als bezahlt markieren</button>':'');
  var pos=(d.positions||[]).map(function(p){ return '<tr><td>'+esc(p.name)+(p.text?'<div class="sub">'+esc(p.text)+'</div>':'')+'</td><td class="r num">'+esc(String(p.qty).replace(".",","))+'</td><td class="r num">'+eur(p.sumGross)+'</td></tr>'; }).join("");
  var ids=(F.D.sev.invoices||[]).map(function(x){return x.id;}), ix=ids.indexOf(id), prev=ix>0?ids[ix-1]:"", next=ix>-1&&ix<ids.length-1?ids[ix+1]:"";
  var row=function(k,v){ return '<div><dt>'+k+'</dt><dd>'+v+'</dd></div>'; };
  var amt=String(eur(d.gross)).replace(/€\s?/,"").trim();
  return '<div class="fsd-dhead"><button class="fsd-back" data-act="fin:inv" aria-label="Zurück">'+ic("back")+'</button><h1>'+kind+' Nr. '+esc(d.nr||"Entwurf")+'</h1><span class="sp"></span>'+
      '<button class="btn" data-act="newinvoice">Neue Rechnung</button>'+(more.length?'<button class="btn" data-act="finmore:'+esc(id)+'">Mehr <span style="font-size:10px">▾</span></button>':'')+'<a class="btn" href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(id)+'&dl=1">Herunterladen</a>'+main+'</div>'+
    '<div class="fsd-detail"><div class="fsd-pdf"><iframe title="PDF" src="/admin/api/sevdesk/pdf?id='+encodeURIComponent(id)+'#view=FitH"></iframe></div>'+
    '<aside class="fsd-side"><section class="fsd-card fsd-nrbar"><b>'+esc(d.nr||"Entwurf")+'</b><span class="fsd-ic"><button type="button" title="Vorherige"'+(prev?' data-act="fin:invd:'+esc(prev)+'"':' disabled style="opacity:.3"')+'>'+ic("left")+'</button><button type="button" title="Nächste"'+(next?' data-act="fin:invd:'+esc(next)+'"':' disabled style="opacity:.3"')+'>'+ic("right")+'</button></span></section>'+
      '<section class="fsd-card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div class="fsd-cname">'+esc(d.contact.name||"")+'</div><div class="fsd-cdate">'+de(d.date)+'</div></div>'+invPill(Object.assign({},i0,{status:st}))+'</div><div class="fsd-amt"><span>Betrag <i>(Brutto)</i></span><b>'+esc(amt)+'<small>EUR</small></b></div>'+(d.open>0.005&&d.paid>0?'<div class="fsd-cdate" style="text-align:right">davon offen '+eur(d.open)+'</div>':'')+'</section>'+
      '<section class="fsd-card"><div class="fsd-ctitle">Rechnungsdetails</div><dl class="fsd-rows" style="margin:0">'+
        row("Fälligkeit",relDue(Object.assign({},i0,{status:st})))+row("Zahlungsziel",d.due?'<b style="font-weight:600">'+de(d.due)+'</b> ('+d.timeToPay+' Tage)':'—')+
        row("Rechnungsdatum",de(d.date))+row("Leistungsdatum",de(d.delivery)+(d.deliveryUntil?' – '+de(d.deliveryUntil):''))+
        row("Versendet am",d.sent?de(d.sendDate)+(d.sendType?' <span style="color:var(--sd-ink2)">als '+({VM:"E-Mail",VPR:"Druck",VP:"Post",VPDF:"PDF"}[d.sendType]||d.sendType)+'</span>':''):'—')+
        row("Festgeschrieben",d.enshrined?ic("lock")+de(d.sendDate||d.date):'nein')+(d.payDate?row("Bezahlt am",de(d.payDate)):'')+(d.emails&&d.emails[0]?row("E-Mail",esc(d.emails[0].value)):'')+
      '</dl></section>'+
      '<section class="fsd-card"><div class="fsd-ctitle">Positionen</div><table class="fsd-t sm"><tbody>'+pos+'</tbody></table></section></aside></div>';
}
F.action("finmore",function(id,el){
  var d=DET[id]; if(!d) return; var acts=[];
  var st=d.status, draft=st===100, open=st===200||st===750;
  if(draft){ acts.push(["Bearbeiten","sdedit"]); acts.push(["Als versendet markieren","sdsent"]); }
  if(open||st===1000) acts.push(["Per E-Mail senden","sdsend"]);
  if(open&&d.type==="RE"){ acts.push(["Mahnung erstellen","sdremind"]); if(st===200&&!(d.paid>0)&&!d.enshrined) acts.push(["Zurück auf Entwurf","sddraft"]); }
  var i1=(F.D.sev.invoices||[]).find(function(x){return x.id===id;})||{};
  if((st===750||st===1000)&&!i1.cancelled&&d.type!=="SR"&&d.type!=="MA") acts.push(["Gutschrift (Minderleistung)","fincn"]);
  if(d.type==="RE"&&st>=200&&!i1.cancelled) acts.push(["Als wiederkehrend anlegen","finwkr"]);
  if(st===200&&d.type==="RE"&&!i1.cancelled) acts.push(["Stornieren","sdcancel",1]);
  var r=el.getBoundingClientRect();
  if(F.M&&F.M.ctx) F.M.ctx(r.left,r.bottom+4,acts.map(function(a){ return {label:a[0],danger:!!a[2],act:function(){ delete DET[id]; F.actions[a[1]](id); }}; }));
});

/* ---------- Gutschriften ---------- */
function pageCn(){
  if(!C.cn){ if(!C.busy.cn){ C.busy.cn=1; F.api("/admin/api/sev/creditnotes").then(function(j){ C.busy.cn=0; C.cn=j||{ok:false}; F.render(); }); } return head("Gutschriften","")+'<div class="sd-empty">Lade …</div>'; }
  var list=C.cn.creditNotes||[];
  return head("Gutschriften",list.length+" Gutschriften","")+'<section class="fsd-card flush"><div class="scroll"><table class="fsd-t"><thead><tr><th>Status</th><th>Nr.</th><th>Kunde</th><th>Datum</th><th class="r">Betrag (brutto)</th></tr></thead><tbody>'+
    (list.map(function(c){ return '<tr><td>'+(c.status>=1000?pill("paid","Bezahlt"):c.status===100?pill("draft","Entwurf"):pill("open","Offen"))+'</td><td>'+esc(c.nr)+'</td><td><b>'+esc(c.contact)+'</b>'+(c.header?'<div class="sub">'+esc(c.header)+'</div>':'')+'</td><td class="num">'+deShort(c.date)+'</td><td class="r num">'+eur(c.gross)+'</td></tr>'; }).join("")||'<tr><td colspan="5" class="empty">Keine Gutschriften.</td></tr>')+'</tbody></table></div></section>';
}

/* ---------- Belege mit Kategorien links ---------- */
function pageVou(){
  var y=String(F.D.year); vouLoad(); var vd=C.vou[y];
  if(!vd) return head("Belege","")+'<div class="sd-empty">Lade Belege '+esc(y)+' …</div>';
  if(!vd.ok) return head("Belege","")+noSev();
  var parts=UI.fin.split(":"), f=parts[1]||"all", cat=UI.fvcat||"", q=(UI.fq_vou||"").toLowerCase(), per=25, pg=UI.fpg||0;
  var all=vd.vouchers, cats={};
  all.forEach(function(v){ var c=v.category||"Ohne Kategorie"; var o=cats[c]=cats[c]||{n:0,s:0,cd:v.cd}; o.n++; o.s+=(v.cd==="D"?1:-1)*v.gross; });
  var totalS=all.reduce(function(a,v){return a+(v.cd==="D"?1:-1)*v.gross;},0);
  var list=all.filter(function(v){ if(cat&&(v.category||"Ohne Kategorie")!==cat) return false; if(f==="draft"&&v.status!==50) return false; if(f==="open"&&!(v.open>0.005)) return false; if(f==="paid"&&v.status!==1000) return false; if(f==="nodoc"&&v.hasDoc) return false; return !q||(v.supplier+" "+v.desc+" "+v.category+" "+v.gross).toLowerCase().indexOf(q)>-1; });
  var catHtml='<button type="button" class="fsd-cat'+(cat?"":" on")+'" data-act="fvcat:">'+ic("tag")+'<b>Alle Kategorien</b><span><span class="'+(totalS<0?"bad-t":"ok-t")+'">'+eur(Math.abs(totalS))+'</span> ('+all.length+')</span></button>'+
    Object.keys(cats).sort(function(a,b){ return Math.abs(cats[b].s)-Math.abs(cats[a].s); }).map(function(k){ var c=cats[k]; return '<button type="button" class="fsd-cat'+(cat===k?" on":"")+'" data-act="fvcat:'+esc(k)+'">'+ic("tag")+'<b>'+esc(k)+'</b><span><span class="'+(c.s<0?"bad-t":"ok-t")+'">'+eur(Math.abs(c.s))+'</span> ('+c.n+')</span></button>'; }).join("");
  var vp=function(v){ if(v.status===50) return pill("draft","Entwurf"); if(v.status===1000) return pill("paid","Bezahlt"); if(v.open>0.005){ var due=v.dueDate||""; return due&&due<F.D.today?pill("due","Fällig"):pill("open","Offen"); } return pill("grey",v.statusLabel); };
  var rows=list.slice(pg*per,(pg+1)*per).map(function(v){ return '<tr class="fsd-row" data-act="sdvou:'+esc(v.id)+'"><td>'+vp(v)+'</td><td class="m nowrap">'+(v.status===50?'– – –':de(v.date))+'</td><td><div class="sub" style="color:var(--sd-ink);max-width:260px">'+esc(v.supplier||"—")+'</div><div class="sub" style="max-width:260px">'+esc(v.desc||"")+'</div></td><td class="r nowrap">'+(v.cd==="D"?"":"-")+eur(v.gross)+'</td><td class="r nowrap">'+eur(v.open||0)+'</td><td>'+(v.category?'<span class="fsd-chip" title="'+esc(v.category)+'">'+esc(v.category)+'</span>':'')+'</td><td>'+(v.hasDoc?'':'<span class="m" title="Ohne Datei">ohne Datei</span>')+'</td></tr>'; }).join("");
  return head("Belege","",'<button class="btn" data-act="sdvoureload">Aktualisieren</button><button class="btn primary" data-act="voucher">Ausgabe erfassen</button>')+
    '<div class="fsd-vou"><aside class="fsd-card fsd-cats">'+catHtml+'</aside><section class="fsd-card flush"><div class="fsd-bar">'+tabs("fin:vou",f,[["all","Alle"],["draft","Entwurf"],["open","Offen"],["paid","Bezahlt"],["nodoc","Ohne Datei"]])+search("vou","Suchen …")+'</div>'+
    '<div class="scroll"><table class="fsd-t"><thead><tr><th>Status</th><th>Belegdatum</th><th>Lieferant / Kunde</th><th class="r">Betrag (Brutto)</th><th class="r">Offen (Brutto)</th><th>Kategorie</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" class="empty">Keine Belege in dieser Ansicht.</td></tr>')+'</tbody></table></div>'+pager(list.length,per)+'</section></div>';
}
F.action("fvcat",function(k){ UI.fvcat=k; UI.fpg=0; F.render(); });

/* ---------- Bank: Konten-Tabelle wie sevDesk ---------- */
function txLoad(force){ if(C.busy.tx) return; C.busy.tx=1; F.api("/admin/api/sev/transactions"+(force?"?force=1":"")).then(function(j){ C.busy.tx=0; C.tx=j||{ok:false}; F.render(); }); }
F.action("ftxreload",function(){ C.tx=null; txLoad(true); });
var MO=null;
/* Mollie-Abgleich je Konto: eingenommen → Gebühren → netto → ausbezahlt (auf der Bank?) → noch bei Mollie, Kontrolle gegen den Mollie-Saldo */
function mollieCard(m){
  var ok=m.diff==null?null:Math.abs(m.diff)<0.02, st=function(l,v,cls,sub){ return '<div class="mo-k"><span>'+l+'</span><b class="num'+(cls?" "+cls:"")+'">'+v+'</b>'+(sub?'<i>'+sub+'</i>':'')+'</div>'; };
  return '<section class="fsd-card mo"><div class="row-between"><div class="fsd-ctitle" style="margin:0">'+esc(m.name)+' <span class="muted" style="font-size:12px;font-weight:400">Abgleich '+esc(String(F.D.year))+'</span></div>'+
    (ok==null?'<span class="fsd-pill grey">noch nicht abgerufen</span>':ok?'<span class="fsd-pill paid">stimmt mit Mollie überein</span>':'<span class="fsd-pill due">Abweichung '+eur(m.diff)+'</span>')+'</div>'+
    '<div class="mo-flow">'+st("Eingenommen (brutto)",eur(m.gross),"",m.countPayments+" Zahlungen")+'<em>−</em>'+st("Mollie-Gebühren",eur(m.fees),"bad-t","an den Rechnungen gebucht")+'<em>=</em>'+st("Netto",eur(m.net),"")+
      '<em>→</em>'+st("Ausbezahlt",eur(m.payouts),"",m.payoutsMissing.length?'<b class="bad-t">'+m.payoutsMissing.length+' nicht auf der Bank gefunden</b>':"alle auf der Bank gefunden")+'<em>·</em>'+st("Noch bei Mollie",eur(m.stillAtMollie),"",m.mollieBalance!=null?"Mollie meldet "+eur(m.mollieBalance)+(m.pending?" (davon "+eur(m.pending)+" in Bearbeitung)":""):"")+'</div>'+
    ((m.byProfile||[]).length>1?'<div class="mo-prof">'+m.byProfile.map(function(b){ return '<span><b>'+esc(b.name)+'</b> '+eur(b.gross+b.provisions)+' · Gebühren '+eur(b.fees)+(b.unmatched?' · <i class="bad-t">'+b.unmatched+' offen</i>':'')+'</span>'; }).join("")+'</div>':'')+
    (m.provisions||m.refunds?'<div class="muted small" style="margin-top:6px">'+(m.provisions?'Provisionen (Connect) '+eur(m.provisions)+' · ':'')+(m.refunds?'Rückerstattungen '+eur(m.refunds):'')+'</div>':'')+
    (m.unmatched.length?'<details class="mo-open"><summary><b>'+m.unmatched.length+' Zahlung'+(m.unmatched.length===1?"":"en")+' noch keiner Rechnung zugeordnet</b> <span class="muted">('+eur(m.unmatched.reduce(function(a,x){ return a+x.gross; },0))+' brutto)</span></summary>'+m.unmatched.slice(0,30).map(function(x){ return '<div class="mo-row"><span>'+deShort(x.date)+'</span><span>'+esc(x.name||"")+' <i>'+esc(x.purpose||"")+'</i></span><b class="num">'+eur(x.gross)+'</b><span class="muted">Gebühr '+eur(x.fee)+'</span><button class="btn sm" data-act="ftxassign:'+esc(x.id)+'">Zuordnen</button></div>'; }).join("")+'</details>':'<div class="muted small" style="margin-top:6px">Alle Zahlungen einer Rechnung zugeordnet.</div>')+
    (m.payoutsMissing.length?'<div class="notice" style="margin-top:8px">Auszahlungen ohne Bankumsatz: '+m.payoutsMissing.map(function(x){ return deShort(x.date)+" "+eur(x.amount); }).join(", ")+' – Kontoauszug aus George importieren, dann werden sie automatisch verknüpft.</div>':'')+'</section>';
}
F.action("fmollie",function(){ F.toast("Rufe Mollie ab …"); F.api("/admin/api/fin/mollie",{body:{confirm:true}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Mollie-Abruf fehlgeschlagen",true); return; } MO=null; C.tx=null; var o=(j.result.orgs||[]).reduce(function(a,x){ a.n+=x.added||0; a.f+=x.fees||0; a.p+=x.linked||0; if(x.error) a.e.push(x.org+": "+x.error); return a; },{n:0,f:0,p:0,e:[]}); F.toast(o.e.length?o.e.join(" · "):(o.n+" Zahlungen, "+o.f+" Gebühren, "+(o.p+(j.result.relinked||0))+" Auszahlungen mit der Bank verknüpft"),!!o.e.length); F.load(true); }); });
/* PayPal direkt (nur lesend): täglicher Abruf am Server, hier Status, Saldo-Kontrolle und manueller Abruf */
var PP=null;
function paypalBox(){
  if(!PP||!PP.ok) return "";
  if(!PP.configured) return '<section class="fsd-card"><div class="fsd-ctitle">PayPal verbinden</div><p class="muted" style="font-size:13px;margin:6px 0 0">Unter <b>developer.paypal.com → Apps &amp; Credentials → Live → Create App</b> eine App anlegen, bei den Funktionen nur <b>Transaction search</b> anhaken und Client-ID und Secret in Railway als <b>PAYPAL_CLIENT_ID</b> und <b>PAYPAL_SECRET</b> eintragen. Danach kommen die PayPal-Umsätze täglich automatisch – Gebühren an der jeweiligen Zahlung, Auszahlungen aufs Bankkonto als Geldtransit.</p></section>';
  var l=PP.last||{}, d=l.diff;
  return '<section class="fsd-card mo"><div class="row-between"><div class="fsd-ctitle" style="margin:0">PayPal <span class="muted" style="font-size:12px;font-weight:400">'+(PP.at?"zuletzt abgerufen "+de(PP.at.slice(0,10))+" "+PP.at.slice(11,16):"wird täglich automatisch abgerufen")+'</span></div>'+
    (PP.error?'<span class="fsd-pill due">'+esc(PP.error)+'</span>':d==null?'<span class="fsd-pill grey">noch nicht abgerufen</span>':Math.abs(d)<0.02?'<span class="fsd-pill paid">Saldo stimmt mit PayPal überein</span>':'<span class="fsd-pill due">Abweichung zum PayPal-Saldo '+eur(d)+'</span>')+'</div>'+
    (l.at?'<div class="muted small" style="margin-top:6px">Letzter Abruf: '+(l.added||0)+' neue Umsätze'+(l.fees?', '+l.fees+' mit Gebühr':'')+(l.dup?', '+l.dup+' schon vorhanden':'')+(l.balance!=null?' · PayPal-Saldo '+eur(l.balance):'')+'</div>':'')+'</section>';
}
F.action("fpaypal",function(){ F.toast("Rufe PayPal ab …"); F.api("/admin/api/fin/paypal",{body:{confirm:true}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"PayPal-Abruf fehlgeschlagen",true); return; } PP=null; C.tx=null; var r=j.result||{}; F.toast((r.added||0)+" neue PayPal-Umsätze"+(r.fees?", "+r.fees+" mit Gebühr":"")); F.load(true); }); });
/* George direkt (PSD2 über Enable Banking, nur Kontoinformation): verbinden, Freigabe-Laufzeit, Saldo-Kontrolle, manueller Abruf */
var EB=null;
function ebankBox(){
  if(!EB||!EB.ok) return "";
  if(!EB.configured) return '<section class="fsd-card"><div class="fsd-ctitle">George direkt verbinden</div><p class="muted" style="font-size:13px;margin:6px 0 0">Bei <b>enablebanking.com</b> kostenlos registrieren, im Control Panel eine Anwendung (Production, „Restricted“ – nur eigene Konten) anlegen, als Redirect-URL <b>https://www.fs-creative.at/admin/api/fin/ebank/callback</b> eintragen und den Schlüssel erzeugen lassen. Danach in Railway <b>EB_APP_ID</b> (Application-ID) und <b>EB_PRIVATE_KEY</b> (Inhalt der .pem-Datei) setzen. Dann erscheint hier „George verbinden“.</p></section>';
  var ss=EB.sessions||[];
  if(!ss.length) return '<section class="fsd-card"><div class="row-between"><div><div class="fsd-ctitle" style="margin:0">George direkt verbinden</div><div class="muted small">Freigabe einmal in George bestätigen – danach kommen die Umsätze täglich automatisch (gilt 180 Tage).</div></div><button class="btn primary" data-act="febconnect">George verbinden</button></div></section>';
  return ss.map(function(x){ var days=x.validUntil?Math.round((Date.parse(x.validUntil)-Date.now())/864e5):null;
    return '<section class="fsd-card mo"><div class="row-between"><div class="fsd-ctitle" style="margin:0">'+esc(x.bank)+' <span class="muted" style="font-size:12px;font-weight:400">'+(days!=null?(days>0?"Freigabe noch "+days+" Tage":"Freigabe abgelaufen"):"")+(EB.at?" · zuletzt abgerufen "+de(EB.at.slice(0,10))+" "+EB.at.slice(11,16):" · täglich automatisch")+'</span></div>'+
      ((days!=null&&days<14)?'<button class="btn primary" data-act="febconnect">Freigabe erneuern</button>':'<button class="btn sm" data-act="febdisc:'+esc(x.bank)+'">Trennen</button>')+'</div>'+
      x.accounts.map(function(a){ var d=a.diff; return '<div class="mo-acc"><span><b>'+esc(a.name)+'</b></span><span class="muted">'+esc(a.iban||"")+'</span><b class="num">'+(a.balance!=null?eur(a.balance):"—")+'</b>'+(d==null?'<span class="fsd-pill grey">noch nicht abgerufen</span>':Math.abs(d)<0.02?'<span class="fsd-pill paid">Saldo stimmt</span>':'<span class="fsd-pill due">Abweichung '+eur(d)+'</span>')+'</div>'; }).join("")+
      (EB.error?'<div class="notice" style="margin-top:8px">'+esc(EB.error)+'</div>':'')+'</section>'; }).join("");
}
F.action("febconnect",function(){ F.toast("Öffne George-Freigabe …"); var w=window.open("about:blank","_blank"); F.api("/admin/api/fin/ebank",{body:{op:"start"}}).then(function(j){ if(!j||!j.ok||!j.url){ if(w) w.close(); F.toast((j&&j.error)||"Verbinden fehlgeschlagen",true); return; }
    // eigenes Fenster (in der Dock-App öffnet die Bank sowieso im Browser) – hier warten, bis die Freigabe angekommen ist
    if(w) w.location.href=j.url; else { location.href=j.url; return; }
    var before=EB&&EB.sessions?JSON.stringify(EB.sessions.map(function(x){ return x.validUntil; })):"", n=0;
    F.toast("Freigabe im Browserfenster bestätigen – das Cockpit aktualisiert sich danach von selbst");
    var t=setInterval(function(){ if(++n>120){ clearInterval(t); return; } F.api("/admin/api/fin/ebank").then(function(e){ if(e&&e.ok&&JSON.stringify((e.sessions||[]).map(function(x){ return x.validUntil; }))!==before&&(e.sessions||[]).length){ clearInterval(t); EB=e; C.tx=null; F.toast("George verbunden – Umsätze werden abgerufen"); F.render(); setTimeout(function(){ EB=null; C.tx=null; F.load(true); },8000); } }); },5000); }); });
F.action("febdisc",function(b){ if(!confirm("Verbindung zu "+b+" trennen? Bereits importierte Umsätze bleiben.")) return; F.api("/admin/api/fin/ebank",{body:{op:"disconnect",bank:b}}).then(function(){ EB=null; F.render(); }); });
F.action("febsync",function(){ F.toast("Rufe Bankumsätze ab …"); F.api("/admin/api/fin/ebank",{body:{op:"sync",confirm:true}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Abruf fehlgeschlagen",true); return; } EB=null; C.tx=null; var e=(j.result.accounts||[]).filter(function(x){ return x.error; }), n=(j.result.accounts||[]).reduce(function(a,x){ return a+(x.added||0); },0); F.toast(e.length?e.map(function(x){ return x.account+": "+x.error; }).join(" · "):n+" neue Bankumsätze",!!e.length); F.load(true); }); });
(function(){ var h=location.hash||""; if(h.indexOf("#bank-verbunden")===0||h.indexOf("#bank-fehler=")===0){ setTimeout(function(){ if(h.indexOf("#bank-fehler=")===0) F.toast("George: "+decodeURIComponent(h.slice(13)),true); else F.toast("George verbunden – Umsätze werden abgerufen"); try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){} },800); } })();
function pageBank(mode){
  if(!C.tx){ txLoad(); return head("Konten","")+'<div class="sd-empty">Lade Bankumsätze …</div>'; }
  if(!C.tx.ok) return head("Konten","")+noSev();
  var parts=UI.fin.split(":"), acc=mode==="kasse"?(((C.tx.accounts||[]).find(function(a){return /kasse|register/i.test(a.name+" "+a.type);})||{}).id||"none"):(parts[1]||"all"), q=(UI.fq_tx||"").toLowerCase(), per=50, pg=UI.fpg||0;
  var accs=C.tx.accounts||[];
  var list=C.tx.transactions.filter(function(t){ if(acc!=="all"&&t.accountId!==acc) return false; if(mode==="open"&&t.status!==100) return false; return !q||(t.name+" "+t.purpose+" "+t.amount).toLowerCase().indexOf(q)>-1; });
  var stp=function(t){ if(t.transit) return pill("grey","Geldtransit"); return t.status===100?pill("open","Offen"):t.status===300?pill("grey","Privat"):t.status===350?pill("paid","Automatisch"):pill("paid","Gebucht"); };
  var rows=list.slice(pg*per,(pg+1)*per).map(function(t){ var lk=t.links.map(function(l){ return l.type==="Invoice"?'<a href="#" data-act="fin:invd:'+esc(l.id)+'">'+esc(l.nr)+'</a>':'<a href="#" data-act="sdvou:'+esc(l.id)+'">Beleg</a>'; }).join(", ");
    return '<tr><td>'+stp(t)+'</td><td><b>'+esc(t.name||"—")+'</b><div class="sub">'+esc(t.purpose)+'</div></td><td class="num">'+deShort(t.date)+'</td><td class="r num '+(t.amount<0?"bad-t":"ok-t")+'">'+eur(t.amount)+'</td><td>'+(lk||(t.status===100?'<button class="btn" data-act="ftxassign:'+esc(t.id)+'">Zuordnen</button>':'<span class="muted">—</span>'))+'</td></tr>'; }).join("");
  var title=mode==="kasse"?"Kassenbuch":mode==="open"?"Unvollständig":"Alle Konten";
  var accTabs=mode==="kasse"?"":tabs("fin:"+(mode==="open"?"open":"bank"),acc,[["all","Alle"]].concat(accs.map(function(a){ return [a.id,a.name]; })));
  if(!MO&&!C.busy.mo){ C.busy.mo=1; F.api("/admin/api/fin/mollie?year="+F.D.year).then(function(j){ C.busy.mo=0; MO=j||{ok:false}; F.render(); }); }
  var moBox=MO&&MO.ok&&!MO.configured&&mode==="bank"?'<section class="fsd-card"><div class="fsd-ctitle">Mollie verbinden</div><p class="muted" style="font-size:13px;margin:6px 0 0">Damit Mollie-Zahlungen (Blitzdings) und Connect-Provisionen (kochdu) automatisch hereinkommen: in Mollie unter <b>Entwickler → Organisations-Zugangstoken</b> ein Token mit Leserechten (balances, payments, profiles, organizations, settlements) erstellen und in Railway als Variable <b>MOLLIE_ORG_TOKEN</b> eintragen (zweite Organisation: MOLLIE_ORG_TOKEN_2). Danach erscheint hier „Mollie abrufen“.</p></section>':'';
  var moSum=mode==="bank"&&MO&&MO.summary&&MO.summary.length?MO.summary.map(mollieCard).join(""):"";
  if(mode==="bank"&&!PP&&!C.busy.pp){ C.busy.pp=1; F.api("/admin/api/fin/paypal").then(function(j){ C.busy.pp=0; PP=j||{ok:false}; F.render(); }); }
  if(mode==="bank"&&!EB&&!C.busy.eb){ C.busy.eb=1; F.api("/admin/api/fin/ebank").then(function(j){ C.busy.eb=0; EB=j||{ok:false}; F.render(); }); }
  if(mode==="bank") moSum=ebankBox()+moSum+paypalBox();
  return head(title,mode==="open"?list.length+" Umsätze ohne Zuordnung":(MO&&MO.at?"Mollie zuletzt abgerufen: "+de(MO.at.slice(0,10))+" "+MO.at.slice(11,16):""),(MO&&MO.configured?'<button class="btn" data-act="fmollie">Mollie abrufen</button>':'')+(EB&&EB.sessions&&EB.sessions.length&&mode==="bank"?'<button class="btn" data-act="febsync">George abrufen</button>':'')+(PP&&PP.configured&&mode==="bank"?'<button class="btn" data-act="fpaypal">PayPal abrufen</button>':'')+'<button class="btn" data-act="bankrules">Regeln</button><button class="btn" data-act="sdbkimp">Kontoauszug importieren</button><button class="btn" data-act="ftxreload">Aktualisieren</button>')+moBox+moSum+
    '<section class="fsd-card flush"><div class="fsd-bar">'+accTabs+search("tx","Name, Verwendungszweck, Betrag …")+'</div><div class="scroll"><table class="fsd-t"><thead><tr><th>Status</th><th>Name / Verwendungszweck</th><th>Buchungstag</th><th class="r">Betrag</th><th>Verknüpfungen</th></tr></thead><tbody>'+(rows||'<tr><td colspan="5" class="empty">Keine Umsätze.</td></tr>')+'</tbody></table></div>'+pager(list.length,per)+'</section>';
}
/* Offenen Umsatz zuordnen: vorhandene Bank-Zuordnung (Vorschläge) verwenden */
F.action("ftxassign",function(id){ var st=F.sevState; if(st&&st.bank&&st.bank.ok&&st.bank.transactions.some(function(t){return t.id===id;})){ F.actions.sdbkother(id); return; }
  F.toast("Lade Vorschläge …"); F.api("/admin/api/sev/bank").then(function(j){ if(st) st.bank=j; if(j&&j.ok&&j.transactions.some(function(t){return t.id===id;})) F.actions.sdbkother(id); else F.toast("Umsatz ist nicht mehr offen",true); }); });


/* ---------- Festschreiben (wie sevDesk: Einstellungen → System → Festschreiben) ---------- */
var LK=null;
function lkLoad(){ if(C.busy.lk) return; C.busy.lk=1; F.api("/admin/api/fin/settings").then(function(j){ C.busy.lk=0; LK=j||{ok:false}; F.render(); }); }
function pageLock(){
  if(!LK){ lkLoad(); return head("Festschreiben","")+'<div class="sd-empty">Lade …</div>'; }
  if(!LK.ok) return head("Festschreiben","")+'<div class="notice">'+esc(LK.error||"Nicht verfügbar")+'</div>';
  var y=String(F.D.year), T=[["Invoice","Rechnungen"],["Voucher","Belege"],["CreditNote","Gutschriften"],["CheckAccountTransaction","Zahlungen"]];
  return head("Festschreiben","Festgeschriebene Dokumente können nicht mehr geändert oder gelöscht werden – Korrektur nur per Storno, Gutschrift oder Gegenbuchung. Nicht umkehrbar.")+
    '<section class="fsd-card"><div class="fsd-ctitle">Automatisch</div><label style="display:flex;gap:10px;align-items:center;font-size:14px;margin-top:8px"><input type="checkbox" data-lkauto="1"'+(LK.autoEnshrine?" checked":"")+'> Rechnungen bei Fertigstellung (Versand, Download, „als versendet“) automatisch festschreiben</label><p class="muted" style="font-size:12.5px;margin:8px 0 0">Empfohlen (GoBD/BAO). Gilt nur für Ausgangsrechnungen – Belege, Gutschriften und Zahlungen schreibst du unten je Zeitraum fest.</p></section>'+
    '<section class="fsd-card"><div class="fsd-ctitle">Noch nicht festgeschrieben</div><dl class="fsd-rows" style="margin:0">'+T.map(function(t){ var o=LK.open[t[0]]||{}; return '<div><dt>'+t[1]+'</dt><dd>'+(o.count||0)+(o.oldest?' <span class="muted">seit '+de(o.oldest)+'</span>':'')+'</dd></div>'; }).join("")+'</dl></section>'+
    '<form class="fsd-card" data-form="finlock"><div class="fsd-ctitle">Zeitraum festschreiben</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0"><label class="fl">Von<input class="f" type="date" name="from" value="'+y+'-01-01"></label><label class="fl">Bis<input class="f" type="date" name="to" value="'+lastMonthEnd()+'"></label></div>'+
    '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:14px">'+T.map(function(t){ return '<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="t" value="'+t[0]+'" checked> '+t[1]+'</label>'; }).join("")+'</div>'+
    '<p class="muted" style="font-size:12.5px">Entwürfe werden nicht festgeschrieben. Später im Zeitraum erfasste Dokumente musst du erneut festschreiben (wie bei sevDesk). Empfehlung: monatlich, spätestens mit der UVA.</p><div style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Festschreiben …</button></div></form>';
}
function lastMonthEnd(){ var d=new Date(F.D.today+"T12:00:00"); d.setDate(0); return d.toISOString().slice(0,10); }
F.listen("change","[data-lkauto]",function(el){ F.api("/admin/api/fin/settings",{body:{confirm:true,autoEnshrine:el.checked}}).then(function(j){ if(j&&j.ok){ F.toast(el.checked?"Automatisches Festschreiben an":"Automatisches Festschreiben aus"); LK=null; F.render(); } else F.toast((j&&j.error)||"Fehler",true); }); });
F.form("finlock",function(f){
  var types=[].slice.call(f.querySelectorAll('input[name=t]:checked')).map(function(x){return x.value;}); if(!types.length){ F.toast("Bitte Dokumentart wählen",true); return; }
  F.confirm("Alle fertigen Dokumente vom "+de(f.from.value)+" bis "+de(f.to.value)+" festschreiben? Das lässt sich nicht rückgängig machen.","Festschreiben",function(){
    F.api("/admin/api/fin/enshrine",{body:{confirm:true,from:f.from.value,to:f.to.value,types:types}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } var r=j.result||{}, n=Object.keys(r).reduce(function(a,k){return a+r[k];},0); F.toast(n+" Dokumente festgeschrieben"); LK=null; F.load(true); });
  },true);
});

/* ---------- Gutschrift „Minderleistung“ (nur zu bezahlten/teilbezahlten Rechnungen, sonst Storno) ---------- */
F.action("fincn",function(id){
  var go=function(d){ if(!d||!d.ok){ F.toast("Rechnung nicht geladen",true); return; }
    F.modal('<form data-form="fincn" data-id="'+esc(id)+'" class="stackf"><div class="row-between"><h2 style="font-size:19px">Gutschrift zu '+esc(d.nr||"")+'</h2>'+F.btnClose()+'</div>'+
      '<p class="muted" style="margin:0;font-size:13px">Minderleistung/Teilstorno einer bezahlten Rechnung: Menge oder Preis anpassen, nicht betroffene Positionen auf 0 setzen. Erlös und USt werden im Monat der Gutschrift gemindert.</p>'+
      '<div class="scroll"><table class="fsd-t sm" style="min-width:420px"><thead><tr><th>Position</th><th class="r">Menge</th><th class="r">Preis netto</th><th class="r">USt</th></tr></thead><tbody>'+(d.positions||[]).map(function(p,k){ return '<tr><td>'+esc(p.name)+'<input type="hidden" name="n'+k+'" value="'+esc(p.name)+'"><input type="hidden" name="t'+k+'" value="'+p.taxRate+'"></td><td class="r"><input class="f num" style="width:80px" name="q'+k+'" type="number" step="0.01" value="0"></td><td class="r"><input class="f num" style="width:110px" name="p'+k+'" type="number" step="0.01" value="'+p.priceNet.toFixed(2)+'"></td><td class="r">'+p.taxRate+' %</td></tr>'; }).join("")+'</tbody></table></div>'+
      '<label class="fl">Grund / Text<input class="f" name="reason" value="Gutschrift wegen Minderleistung zu Rechnung '+esc(d.nr||"")+'"></label><label class="fl">Datum<input class="f" type="date" name="date" value="'+F.D.today+'"></label>'+
      '<div class="foot"><span class="err" id="cnErr"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Gutschrift erstellen</button></span></div></form>',"wide"); };
  if(DET[id]) go(DET[id]); else F.api("/admin/api/sev/invoice?id="+encodeURIComponent(id)).then(function(j){ DET[id]=j; go(j); });
});
F.form("fincn",function(f){
  var id=f.getAttribute("data-id"), d=DET[id]||{}, pos=[];
  (d.positions||[]).forEach(function(p,k){ var q=+f["q"+k].value||0, pr=+f["p"+k].value||0; if(q&&pr) pos.push({name:f["n"+k].value,quantity:q,price:pr,taxRate:+f["t"+k].value||0}); });
  if(!pos.length){ document.getElementById("cnErr").textContent="Bitte bei mindestens einer Position eine Menge eintragen."; return; }
  F.api("/admin/api/fin/creditnote",{body:{confirm:true,invoiceId:id,positions:pos,reason:f.reason.value,date:f.date.value}}).then(function(j){ if(!j||!j.ok){ document.getElementById("cnErr").textContent=(j&&j.error)||"Fehler"; return; } F.closeModal(); C.cn=null; F.toast("Gutschrift "+(j.result.nr||"")+" erstellt"); F.actions.fin("cn"); });
});

/* ---------- Wiederkehrende Rechnungen ---------- */
var WK=null, IVL=[["7D","wöchentlich"],["14D","alle 2 Wochen"],["1M","monatlich"],["2M","alle 2 Monate"],["3M","vierteljährlich"],["6M","halbjährlich"],["12M","jährlich"],["24M","alle 2 Jahre"],["36M","alle 3 Jahre"]];
function ivName(k){ var x=IVL.find(function(i){return i[0]===k;}); return x?x[1]:k; }
function wkrForm(t,fromId){ var r=(t&&t.recur)||{}, nd=function(){ var x=new Date(F.D.today+"T12:00:00"); x.setMonth(x.getMonth()+1); x.setDate(1); return x.toISOString().slice(0,10); };
  return '<form data-form="finwkr" data-id="'+esc(t?t.id:"")+'" data-from="'+esc(fromId||"")+'" class="stackf"><div class="row-between"><h2 style="font-size:19px">'+(t?"Wiederkehrende Rechnung bearbeiten":"Als wiederkehrende Rechnung anlegen")+'</h2>'+F.btnClose()+'</div>'+
    '<div class="grid2"><label class="fl">Intervall<select class="f" name="interval">'+IVL.map(function(i){ return '<option value="'+i[0]+'"'+((r.interval||"1M")===i[0]?" selected":"")+'>'+i[1]+'</option>'; }).join("")+'</select></label><label class="fl">Nächste Rechnung am<input class="f" type="date" name="start" value="'+(r.next||nd())+'" required></label></div>'+
    '<div class="grid2"><label class="fl">Enddatum (optional)<input class="f" type="date" name="end" value="'+(r.end||"")+'"></label><label class="fl">Abrechnung<select class="f" name="advance"><option value="1"'+(r.advance!==false?" selected":"")+'>im Voraus (Zeitraum ab Rechnungsdatum)</option><option value="0"'+(r.advance===false?" selected":"")+'>nachträglich (zurückliegender Zeitraum)</option></select></label></div>'+
    '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="autoSend"'+(r.autoSend?" checked":"")+'> automatisch fertigstellen und per E-Mail an den Kunden senden (sonst Entwurf zum Prüfen)</label>'+
    '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active"'+(r.active!==false?" checked":"")+'> aktiv</label>'+
    '<div class="foot"><span class="err" id="wkErr"></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Speichern</button></span></div></form>'; }
F.action("finwkr",function(id){ F.modal(wkrForm(null,id),"narrow"); });
F.action("finwkredit",function(id){ var t=WK&&WK.templates.find(function(x){return x.id===id;}); if(t) F.modal(wkrForm(t),"narrow"); });
F.form("finwkr",function(f){
  var body={confirm:true,interval:f.interval.value,start:f.start.value,end:f.end.value,advance:f.advance.value,autoSend:f.autoSend.checked,active:f.active.checked};
  if(f.getAttribute("data-id")) body.id=f.getAttribute("data-id"); else body.fromId=f.getAttribute("data-from");
  F.api("/admin/api/fin/recurring",{body:body}).then(function(j){ if(!j||!j.ok){ document.getElementById("wkErr").textContent=(j&&j.error)||"Fehler"; return; } F.closeModal(); WK=null; F.toast("Wiederkehrende Rechnung gespeichert"); F.actions.fin("wkr"); });
});
F.action("finwkrrun",function(id){ F.confirm("Jetzt sofort eine Rechnung aus dieser Vorlage erstellen (als Entwurf)? Der nächste Termin verschiebt sich um ein Intervall.","Jetzt erstellen",function(){ F.api("/admin/api/fin/recurring",{body:{confirm:true,op:"run",id:id}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } WK=null; F.load(true); F.toast("Rechnungsentwurf erstellt"); if(j.result&&j.result[0]) F.actions.fin("invd:"+j.result[0].id); }); }); });
F.action("finwkrdel",function(id){ F.confirm("Vorlage löschen? Bereits erstellte Rechnungen bleiben.","Löschen",function(){ F.api("/admin/api/fin/recurring",{body:{confirm:true,op:"delete",id:id}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } WK=null; F.render(); }); },true); });
function pageWkr(){
  if(!WK){ if(!C.busy.wk){ C.busy.wk=1; F.api("/admin/api/fin/recurring").then(function(j){ C.busy.wk=0; WK=j||{ok:false}; F.render(); }); } return head("Wiederkehrende Rechnungen","")+'<div class="sd-empty">Lade …</div>'; }
  if(!WK.ok) return head("Wiederkehrende Rechnungen","")+'<div class="notice">'+esc(WK.error||"Nicht verfügbar")+'</div>';
  var rows=WK.templates.map(function(t){ var r=t.recur; return '<tr><td>'+(r?(r.active?pill("paid","Aktiv"):pill("grey","Pausiert")):pill("draft","aus sevDesk"))+'</td><td><div>'+esc(t.contact||"—")+'</div><div class="sub">'+esc(t.positions.join(", ")||t.header)+'</div></td><td class="m">'+(r?esc(ivName(r.interval))+(r.advance===false?" · nachträglich":""):"– – –")+'</td><td class="m">'+(r&&r.active?de(r.next):"–")+(r&&r.end?'<div class="sub">bis '+de(r.end)+'</div>':'')+'</td><td class="m">'+(r&&r.autoSend?"automatisch":"Entwurf")+'</td><td class="r nowrap">'+eur(t.gross)+'</td>'+
    '<td class="r"><span class="fsd-btns" style="justify-content:flex-end"><button class="btn sm" data-act="finwkredit:'+esc(t.id)+'">Bearbeiten</button>'+(r?'<button class="btn sm" data-act="finwkrrun:'+esc(t.id)+'">Jetzt erstellen</button>':'')+'<button class="btn sm" data-act="finwkrdel:'+esc(t.id)+'">Löschen</button></span></td></tr>'; }).join("");
  return head("Wiederkehrende Rechnungen","Anlegen: Rechnung öffnen → Mehr → „Als wiederkehrend anlegen“. Fällige Rechnungen entstehen automatisch (stündliche Prüfung).","")+
    '<section class="fsd-card flush"><div class="scroll"><table class="fsd-t"><thead><tr><th>Status</th><th>Kunde</th><th>Intervall</th><th>Nächste</th><th>Versand</th><th class="r">Betrag (brutto)</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="empty">Noch keine wiederkehrenden Rechnungen.</td></tr>')+'</tbody></table></div></section>';
}

/* ---------- Wiederkehrende Belege (Vorlagen, z. B. Versicherung, Abos): automatisch am Fälligkeitstag als Beleg angelegt ---------- */
var RV=null;
function rvLoad(){ if(C.busy.rv) return; C.busy.rv=1; F.api("/admin/api/fin/rv").then(function(j){ C.busy.rv=0; RV=j||{ok:false}; F.render(); }); }
function rvPost(body,msg){ body.confirm=true; F.api("/admin/api/fin/rv",{body:body}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } RV=j; F.closeModal&&F.closeModal(); F.toast(msg+(j.made?" · "+j.made+" fällige Belege angelegt":"")); if(j.made) F.load(true); F.render(); }); }
var RVST={active:["paid","Aktiv"],paused:["grey","Pausiert"],stale:["draft","In sevDesk pausiert"],ended:["grey","Beendet"]};
function pageRv(){
  if(!RV){ rvLoad(); return head("Wiederkehrende Belege","")+'<div class="sd-empty">Lade …</div>'; }
  if(!RV.ok) return head("Wiederkehrende Belege","")+'<div class="notice">'+esc(RV.error||"Nicht verfügbar")+'</div>';
  var it=RV.items||[], act=it.filter(function(x){ return x.state==="active"; }), perMonth=act.reduce(function(a,x){ var m=/^(\d+)M$/.exec(x.interval), d=/^(\d+)D$/.exec(x.interval); return a+(x.credit?-1:1)*x.gross/(m?+m[1]:d?(+d[1]/30.4):1); },0);
  var rows=it.map(function(x){ var st=RVST[x.state]||["grey",x.state];
    return '<tr><td class="rv-st">'+pill(st[0],st[1])+'</td><td><b>'+esc(x.supplier)+'</b><div class="sub">'+esc(x.description||x.categories.join(", "))+(x.description&&x.categories.length?' · '+esc(x.categories.join(", ")):'')+'</div></td><td class="m">'+esc(ivName(x.interval)||"–")+'</td><td class="m num">'+(x.state==="active"?de(x.next):'–')+(x.end?'<div class="sub">bis '+de(x.end)+'</div>':'')+'</td><td class="m num">'+(x.last?de(x.last):'–')+(x.made?'<div class="sub">'+x.made+'× im Cockpit</div>':'')+'</td><td class="r num nowrap '+(x.credit?"ok-t":"")+'">'+eur(x.gross)+'</td>'+
      '<td class="r"><span class="fsd-btns" style="justify-content:flex-end"><button class="btn sm" data-act="rvedit:'+esc(x.id)+'">Bearbeiten</button>'+(x.state==="active"?'<button class="btn sm" data-act="rvpause:'+esc(x.id)+'">Pausieren</button>':'<button class="btn sm" data-act="rvresume:'+esc(x.id)+'">Aktivieren</button>')+'<button class="btn sm" data-act="rvdel:'+esc(x.id)+'">Löschen</button></span></td></tr>'; }).join("");
  return head("Wiederkehrende Belege","Fixkosten wie Versicherungen oder Abos: am Fälligkeitstag entsteht automatisch der Beleg (stündliche Prüfung) – zuordnen zur Abbuchung wie gewohnt.","")+
    '<section class="fsd-card mo"><div class="mo-flow"><div class="mo-k"><span>Aktive Vorlagen</span><b class="num">'+act.length+'</b></div><em>·</em><div class="mo-k"><span>Fixkosten pro Monat (brutto)</span><b class="num">'+eur(perMonth)+'</b></div><em>·</em><div class="mo-k"><span>Nächster Beleg</span><b class="num">'+(act.length?de(act.map(function(x){return x.next;}).sort()[0]):"–")+'</b></div></div></section>'+
    '<section class="fsd-card flush"><div class="scroll"><table class="fsd-t"><thead><tr><th>Status</th><th>Lieferant / Beschreibung</th><th>Intervall</th><th>Nächster</th><th>Zuletzt</th><th class="r">Betrag (brutto)</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" class="empty">Keine wiederkehrenden Belege.</td></tr>')+'</tbody></table></div></section>';
}
F.action("rvedit",function(id){ var x=(RV.items||[]).find(function(i){ return i.id===id; }); if(!x) return;
  F.modal('<form data-form="rvsave" data-id="'+esc(id)+'" class="stackf"><div class="row-between"><h2 style="font-size:19px">'+esc(x.supplier)+'</h2>'+F.btnClose()+'</div><p class="muted" style="margin:0">'+esc(x.description||"")+' · '+eur(x.gross)+' brutto</p>'+
    '<div class="grid2"><label class="fl">Intervall<select class="f" name="interval">'+IVL.map(function(i){ return '<option value="'+i[0]+'"'+(x.interval===i[0]?" selected":"")+'>'+i[1]+'</option>'; }).join("")+'</select></label><label class="fl">Nächster Beleg am<input class="f" type="date" name="next" value="'+esc(x.next||"")+'" required></label></div>'+
    '<label class="fl">Endet am (optional)<input class="f" type="date" name="end" value="'+esc(x.end||"")+'"></label><p class="muted small" style="margin:0">Speichern aktiviert die Vorlage. Liegt der Termin in der Vergangenheit, werden die fehlenden Belege sofort angelegt.</p>'+
    '<div class="fsd-btns" style="justify-content:flex-end"><button type="submit" class="btn primary">Speichern</button></div></form>',"narrow"); });
F.form("rvsave",function(f){ rvPost({op:"save",id:f.getAttribute("data-id"),interval:f.interval.value,next:f.next.value,end:f.end.value},"Gespeichert"); });
F.action("rvpause",function(id){ rvPost({op:"pause",id:id},"Pausiert"); });
F.action("rvresume",function(id){ F.confirm("Vorlage wieder aktivieren? Der nächste Termin wird auf das nächste Fälligkeitsdatum ab heute gesetzt.","Aktivieren",function(){ rvPost({op:"resume",id:id},"Aktiviert"); }); });
F.action("rvdel",function(id){ F.confirm("Vorlage entfernen? Bereits angelegte Belege bleiben.","Entfernen",function(){ rvPost({op:"delete",id:id},"Entfernt"); },true); });

/* ---------- Kassenbuch: unveränderbar, Korrektur per Gegenbuchung, nie negativ ---------- */
var KB=null;
function kbLoad(){ if(C.busy.kb) return; C.busy.kb=1; F.api("/admin/api/fin/cash").then(function(j){ C.busy.kb=0; KB=j||{ok:false}; F.render(); }); }
function pageKasse(){
  if(!KB){ kbLoad(); return head("Kassenbuch","")+'<div class="sd-empty">Lade …</div>'; }
  if(!KB.ok) return head("Kassenbuch","")+'<div class="notice">'+esc(KB.error||"Nicht verfügbar")+'</div>';
  var a=KB.accounts[0];
  if(!a) return head("Kassenbuch","Für Barzahlungen: jede Buchung ist sofort unveränderbar, Korrekturen nur per Gegenbuchung.")+
    '<form class="fsd-card" data-form="kbopen" style="max-width:520px"><div class="fsd-ctitle">Kasse anlegen</div><div class="grid2" style="margin:12px 0"><label class="fl">Name<input class="f" name="name" value="Kasse"></label><label class="fl">Anfangsbestand (€)<input class="f num" name="amount" type="number" step="0.01" min="0" value="0"></label></div><label class="fl">Stichtag<input class="f" type="date" name="date" value="'+F.D.today+'"></label><p class="muted" style="font-size:12.5px">Der Anfangsbestand ist nach dem Anlegen nicht mehr änderbar.</p><div style="display:flex;justify-content:flex-end"><button class="btn primary" type="submit">Kasse anlegen</button></div></form>';
  var rows=a.rows.map(function(r){ var lk=r.links.map(function(l){ return l.type==="Invoice"?'<a href="#" data-act="fin:invd:'+esc(l.id)+'">Rechnung</a>':'<a href="#" data-act="sdvou:'+esc(l.id)+'">Beleg</a>'; }).join(", ");
    return '<tr'+(r.reversedBy?' style="opacity:.55"':'')+'><td class="m">'+de(r.date)+'</td><td><div>'+esc(r.text||"—")+'</div>'+(r.name?'<div class="sub">'+esc(r.name)+'</div>':'')+'</td><td class="r nowrap '+(r.amount<0?"bad-t":"ok-t")+'">'+eur(r.amount)+'</td><td class="r nowrap">'+eur(r.balance)+'</td><td>'+(r.kind==="start"?'<span class="m">Anfangsbestand</span>':r.reversedBy?'<span class="m">storniert</span>':r.reverses?'<span class="m">Gegenbuchung</span>':(lk||(r.status===100?'<button class="btn sm" data-act="ftxassign:'+esc(r.id)+'">Zuordnen</button>':'')))+'</td><td class="r">'+(!r.kind&&!r.reversedBy&&!r.reverses&&!r.links.length?'<button class="btn sm" data-act="kbrev:'+esc(a.id)+'|'+esc(r.id)+'">Stornieren</button>':'')+'</td></tr>'; }).join("");
  return head("Kassenbuch",esc(a.name)+' · Bestand <b>'+eur(a.balance)+'</b>','')+
    '<form class="fsd-card" data-form="kbbook" data-acc="'+esc(a.id)+'"><div class="fsd-ctitle">Neue Kassenbuchung</div><div style="display:grid;grid-template-columns:140px 150px 140px minmax(0,1fr) minmax(0,1fr) auto;gap:10px;align-items:end;margin-top:10px" class="kbgrid">'+
      '<label class="fl">Art<select class="f" name="dir"><option value="in">Einnahme</option><option value="out">Ausgabe</option></select></label><label class="fl">Datum<input class="f" type="date" name="date" value="'+F.D.today+'" max="'+F.D.today+'"></label><label class="fl">Betrag (€)<input class="f num" name="amount" type="number" step="0.01" min="0.01" required></label><label class="fl">Text<input class="f" name="text" required placeholder="z. B. Barverkauf, Tankquittung"></label><label class="fl">Name (optional)<input class="f" name="name"></label><button class="btn primary" type="submit">Buchen</button></div>'+
      '<p class="muted" style="font-size:12.5px;margin:8px 0 0">Kassenbuchungen sind sofort festgeschrieben. Danach mit „Zuordnen“ einem Beleg oder einer Rechnung zuweisen. Der Bestand kann nie negativ werden.</p></form>'+
    '<section class="fsd-card flush"><div class="scroll"><table class="fsd-t"><thead><tr><th>Datum</th><th>Text</th><th class="r">Betrag</th><th class="r">Bestand</th><th>Verknüpfung</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">Noch keine Buchungen.</td></tr>')+'</tbody></table></div></section>';
}
F.form("kbopen",function(f){ F.confirm("Kasse „"+f.name.value+"“ mit Anfangsbestand "+F.eur(+f.amount.value||0)+" anlegen? Der Anfangsbestand ist danach nicht mehr änderbar.","Anlegen",function(){ F.api("/admin/api/fin/cash",{body:{confirm:true,op:"open",name:f.name.value,amount:f.amount.value,date:f.date.value}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } KB=null; F.load(true); F.render(); }); }); });
F.form("kbbook",function(f){ var acc=f.getAttribute("data-acc"); F.api("/admin/api/fin/cash",{body:{confirm:true,op:"book",accountId:acc,dir:f.dir.value,date:f.date.value,amount:f.amount.value,text:f.text.value,name:f.name.value}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } KB=null; C.tx=null; F.toast("Gebucht"); F.render(); }); });
F.action("kbrev",function(v){ var p=v.split("|"); F.confirm("Diese Kassenbuchung per Gegenbuchung (mit heutigem Datum) stornieren?","Stornieren",function(){ F.api("/admin/api/fin/cash",{body:{confirm:true,op:"reverse",accountId:p[0],id:p[1]}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } KB=null; C.tx=null; F.render(); }); },true); });

/* ---------- Meine Daten: Firmen-, Steuer-, Bank- und Kontaktdaten zum Kopieren ---------- */
var MD=null, MDE=false;
function mdDefaults(f){ f=f||{}; var ad=[f.street||"Dorfstraße 3/Top 1",[f.zip||"6793",f.city||"Gaschurn"].join(" "),"Vorarlberg",f.country||"Österreich"].join(", ");
  return [["Firma","Firmenname","Simon Leonhard Felder"],["Firma","Freie Bezeichnung",f.name||"FS Creative"],["Firma","Inhaber",f.owner||"Simon Leonhard Felder"],["Firma","Anschrift",ad],["Firma","Branche (SIC)","7311-0000 – Werbeagenturen"],
    ["Steuer & Register","UID-Nummer",f.uid||"ATU82622967"],["Steuer & Register","Steuernummer",f.taxNumber||"98159/4260"],["Steuer & Register","D-U-N-S® Nummer","30-108-8847"],["Steuer & Register","Gerichtsstand",f.court||"BG Bludenz"],
    ["Bank","Bank",f.bank||"Sparkasse Bludenz"],["Bank","IBAN",f.iban||"AT09 2060 7032 0137 9702"],["Bank","BIC",f.bic||"SSBLAT21XXX"],["Bank","Kontoinhaber",f.owner||"Simon Leonhard Felder"],
    ["Kontakt","Telefon","0664/1430620"],["Kontakt","Telefon international","+43 664 1430620"],["Kontakt","E-Mail","simon@fs-creative.at"],["Kontakt","E-Mail Büro",f.email||"office@fs-creative.at"],["Kontakt","Website",f.web||"www.fs-creative.at"]]
    .map(function(r){ return {g:r[0],l:r[1],v:r[2]}; }); }
function mdLoad(){ if(C.busy.md) return; C.busy.md=1; F.api("/admin/api/mydata").then(function(j){ C.busy.md=0; MD=j&&j.ok?(j.rows&&j.rows.length?j.rows:mdDefaults(j.firm)):{err:(j&&j.error)||"Fehler"}; F.render(); }); }
function pageMyData(){
  if(!MD){ mdLoad(); return head("Meine Daten","")+'<div class="sd-empty">Lade …</div>'; }
  if(MD.err) return head("Meine Daten","")+'<div class="notice">'+esc(MD.err)+'</div>';
  var groups=[]; MD.forEach(function(r,i){ var g=groups.find(function(x){ return x.g===r.g; }); if(!g){ g={g:r.g,rows:[]}; groups.push(g); } g.rows.push({r:r,i:i}); });
  var body=MDE?'<section class="fsd-card"><div class="md-edit">'+MD.map(function(r,i){ return '<input class="f" data-md="'+i+':g" value="'+esc(r.g)+'" placeholder="Gruppe"><input class="f" data-md="'+i+':l" value="'+esc(r.l)+'" placeholder="Bezeichnung"><input class="f" data-md="'+i+':v" value="'+esc(r.v)+'" placeholder="Wert"><button class="btn sm" data-act="mddel:'+i+'" aria-label="Entfernen">✕</button>'; }).join("")+'</div><div class="fsd-btns" style="margin-top:12px"><button class="btn" data-act="mdadd">Zeile hinzufügen</button></div></section>':
    '<div class="md-grid">'+groups.map(function(g){ return '<section class="fsd-card"><div class="row-between" style="margin-bottom:6px"><div class="fsd-ctitle" style="margin:0">'+esc(g.g)+'</div><button class="btn sm" data-act="mdcopyg:'+esc(g.g)+'">Gruppe kopieren</button></div>'+
      g.rows.map(function(x){ return '<button type="button" class="md-row" data-act="mdcopy:'+x.i+'" title="Klicken zum Kopieren"><span>'+esc(x.r.l)+'</span><b>'+esc(x.r.v)+'</b><i>'+ic("copy")+'</i></button>'; }).join("")+'</section>'; }).join("")+'</div>';
  return head("Meine Daten","Alles zum Nachschlagen – Klick auf eine Zeile kopiert den Wert.",MDE?'<button class="btn" data-act="mdcancel">Abbrechen</button><button class="btn primary" data-act="mdsave">Speichern</button>':'<button class="btn" data-act="mdedit">Bearbeiten</button><button class="btn primary" data-act="mdcopyall">Alles kopieren</button>')+body;
}
function mdCopy(txt,msg){ var ok=function(){ F.toast(msg||"Kopiert"); }; if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok,function(){ mdFallback(txt); ok(); }); else { mdFallback(txt); ok(); } }
function mdFallback(t){ var a=document.createElement("textarea"); a.value=t; a.style.position="fixed"; a.style.opacity="0"; document.body.appendChild(a); a.select(); try{ document.execCommand("copy"); }catch(e){} a.remove(); }
F.action("mdcopy",function(i){ var r=MD[+i]; if(r) mdCopy(r.v,r.l+" kopiert"); });
F.action("mdcopyg",function(g){ mdCopy(MD.filter(function(r){ return r.g===g; }).map(function(r){ return r.l+": "+r.v; }).join("\n"),g+" kopiert"); });
F.action("mdcopyall",function(){ var out=[], last=null; MD.forEach(function(r){ if(r.g!==last){ if(last!==null) out.push(""); out.push(r.g); last=r.g; } out.push(r.l+": "+r.v); }); mdCopy(out.join("\n"),"Alle Daten kopiert"); });
F.action("mdedit",function(){ MDE=true; MD=MD.map(function(r){ return {g:r.g,l:r.l,v:r.v}; }); F.render(); });
F.action("mdcancel",function(){ MDE=false; MD=null; F.render(); });
F.action("mdadd",function(){ MD.push({g:(MD[MD.length-1]||{}).g||"Sonstiges",l:"",v:""}); F.render(); });
F.action("mddel",function(i){ MD.splice(+i,1); F.render(); });
F.listen("input","[data-md]",function(el){ var a=el.getAttribute("data-md").split(":"); MD[+a[0]][a[1]]=el.value; });
F.action("mdsave",function(){ F.api("/admin/api/mydata",{body:{confirm:true,rows:MD}}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Nicht gespeichert",true); return; } MD=j.rows; MDE=false; F.toast("Gespeichert"); F.render(); }); });

/* ---------- Bankregeln: offene Umsätze automatisch privat / Geldtransit / als Beleg buchen ---------- */
var BR={list:null,cats:[],accs:[],edit:null,prev:null};
function brLoad(){ return F.api("/admin/api/fin/bankrules").then(function(j){ if(!j||!j.ok){ BR.list=[]; BR.err=(j&&j.error)||"Fehler"; } else { BR.err=""; BR.list=j.rules; BR.cats=j.categories||[]; BR.accs=j.accounts||[]; } brPaint(); }); }
function brSum(r){ var c=r.cond, a=r.act, w=[]; if(c.name) w.push("Name „"+c.name+"“"); if(c.purpose) w.push("Zweck „"+c.purpose+"“"); if(c.dir) w.push(c.dir==="in"?"Eingang":"Ausgang"); if(c.min!==""||c.max!=="") w.push("Betrag "+(c.min!==""?"ab "+c.min+" ":"")+(c.max!==""?"bis "+c.max:"")); if(c.account){ var ac=BR.accs.find(function(x){ return x.id===c.account; }); w.push("Konto "+(ac?ac.name:c.account)); }
  var cat=BR.cats.find(function(x){ return x.id===a.category; });
  return "Wenn "+w.join(" und ")+" → "+(a.type==="privat"?"privat (Entnahme/Einlage)":a.type==="transit"?"Geldtransit (eigenes Konto)":"Beleg „"+(cat?cat.name:"?")+"“, "+a.rate+" % USt"); }
function brPrevHtml(p){ return '<div class="mr-prev"><b>'+p.count+' offene Umsätze passen</b>'+(p.sample||[]).map(function(t){ return '<div><span>'+deShort(t.date)+' · '+esc(t.name||"")+'</span> '+esc(t.purpose||"")+' <b class="'+(t.amount<0?"bad-t":"ok-t")+'">'+eur(t.amount)+'</b></div>'; }).join("")+'</div>'; }
function brBody(){
  var head='<div class="row-between"><h2 style="font-size:19px">'+(BR.edit?(BR.edit.id?"Bankregel bearbeiten":"Neue Bankregel"):"Bankregeln")+'</h2>'+F.btnClose()+'</div>';
  if(BR.list==null) return '<div class="stackf" id="brBox">'+head+'<div class="empty">Lade …</div></div>';
  if(BR.err) return '<div class="stackf" id="brBox">'+head+'<div class="notice">'+esc(BR.err)+'</div></div>';
  if(!BR.edit) return '<div class="stackf" id="brBox">'+head+'<p class="muted" style="margin:0">Regeln buchen offene Bankumsätze automatisch – nach jedem Kontoauszug-Import und Mollie-Abruf. Die oberste passende Regel gewinnt.</p>'+
    (BR.list.length?BR.list.map(function(r,i){ return '<div class="mr-row'+(r.active?"":" off")+'"><label class="mr-sw"><input type="checkbox" data-brtog="'+esc(r.id)+'"'+(r.active?" checked":"")+'><span></span></label><div class="mr-main"><b>'+esc(r.name)+'</b><span>'+esc(brSum(r))+'</span><i>'+(r.hits?r.hits+"× angewendet":"noch nicht angewendet")+'</i></div><div class="mr-btns">'+(i>0?'<button class="btn icon" data-act="brup:'+i+'" aria-label="Nach oben">↑</button>':'')+'<button class="btn" data-act="bredit:'+esc(r.id)+'">Bearbeiten</button><button class="btn" data-act="brapply:'+esc(r.id)+'">Jetzt anwenden</button><button class="btn icon" data-act="brdel:'+esc(r.id)+'" aria-label="Löschen">✕</button></div></div>'; }).join(""):'<div class="empty">Noch keine Regeln. Beispiele: „Kontoführung“ → Beleg Bankspesen 0 %, „SVS“ → Beleg Sozialversicherung 0 %, Überweisung an dein Privatkonto → privat.</div>')+
    '<div class="foot"><button class="btn" data-act="brrunall">Alle Regeln jetzt anwenden</button><button class="btn primary" data-act="brnew">Neue Regel</button></div></div>';
  var r=BR.edit, c=r.cond, a=r.act;
  return '<div class="stackf" id="brBox">'+head+'<label class="fl">Name der Regel<input class="f" data-brn="1" value="'+esc(r.name||"")+'" placeholder="z. B. Kontoführung Sparkasse"></label>'+
    '<div class="mr-sec">Wenn ein offener Umsatz … <span class="muted small">(mehrere Begriffe mit Komma = einer reicht)</span></div>'+
    '<div class="grid2"><label class="fl">Name enthält<input class="f" data-brc="name" value="'+esc(c.name||"")+'" placeholder="Sparkasse, SVS"></label><label class="fl">Verwendungszweck enthält<input class="f" data-brc="purpose" value="'+esc(c.purpose||"")+'" placeholder="Kontoführung, Entgelt"></label></div>'+
    '<div class="grid2"><label class="fl">Richtung<select class="f" data-brc="dir"><option value="">egal</option><option value="out"'+(c.dir==="out"?" selected":"")+'>Ausgang (Geld raus)</option><option value="in"'+(c.dir==="in"?" selected":"")+'>Eingang (Geld rein)</option></select></label><label class="fl">Konto<select class="f" data-brc="account"><option value="">alle Konten</option>'+BR.accs.map(function(x){ return '<option value="'+esc(x.id)+'"'+(c.account===x.id?" selected":"")+'>'+esc(x.name)+'</option>'; }).join("")+'</select></label></div>'+
    '<div class="grid2"><label class="fl">Betrag ab (€)<input class="f num" type="number" step="0.01" data-brc="min" value="'+esc(c.min)+'"></label><label class="fl">Betrag bis (€)<input class="f num" type="number" step="0.01" data-brc="max" value="'+esc(c.max)+'"></label></div>'+
    '<div class="mr-sec">… dann</div><div class="row wrap" style="gap:16px">'+[["beleg","als Beleg buchen (Kategorie + Steuer)"],["privat","privat (Entnahme/Einlage)"],["transit","Geldtransit (zwischen eigenen Konten)"]].map(function(o){ return '<label class="row small"><input type="radio" name="brt" data-bra="type" value="'+o[0]+'"'+(a.type===o[0]?" checked":"")+'> '+o[1]+'</label>'; }).join("")+'</div>'+
    (a.type==="beleg"?'<div class="grid2"><label class="fl">Kategorie<select class="f" data-bra="category"><option value="">– wählen –</option>'+BR.cats.map(function(x){ return '<option value="'+esc(x.id)+'"'+(a.category===x.id?" selected":"")+'>'+esc(x.name)+'</option>'; }).join("")+'</select></label><label class="fl">USt im Betrag<select class="f" data-bra="rate">'+[[20,"20 % (Vorsteuer abziehen)"],[13,"13 %"],[10,"10 %"],[0,"0 % – keine Vorsteuer (Bankspesen, Versicherung, SVS …)"]].map(function(o){ return '<option value="'+o[0]+'"'+(+a.rate===o[0]?" selected":"")+'>'+o[1]+'</option>'; }).join("")+'</select></label></div>'+
      '<div class="grid2"><label class="fl">Lieferant (leer = Name aus der Bank)<input class="f" data-bra="supplier" value="'+esc(a.supplier||"")+'"></label><label class="fl">Beschreibung<input class="f" data-bra="desc" value="'+esc(a.desc||"")+'" placeholder="z. B. Kontoführung"></label></div>':'')+
    '<div class="row wrap" style="justify-content:space-between"><button class="btn" data-act="brprev">Vorschau: welche offenen Umsätze passen?</button><span class="err" id="brErr"></span></div><div id="brPrev">'+(BR.prev?brPrevHtml(BR.prev):'')+'</div>'+
    '<div class="foot"><span class="muted small">Belege per Regel sind normale Belege – unter Belege prüfbar und änderbar.</span><span class="row"><button class="btn" data-act="brback">Zurück</button><button class="btn primary" data-act="brsave">Speichern</button></span></div></div>';
}
function brPaint(){ var b=document.getElementById("brBox"); if(b) b.outerHTML=brBody(); }
function brErr(t){ var e=document.getElementById("brErr"); if(e) e.textContent=t||""; }
function brPost(b){ return F.api("/admin/api/fin/bankrules",{body:Object.assign({confirm:true},b)}); }
F.action("bankrules",function(){ BR.edit=null; BR.prev=null; BR.list=null; F.modal(brBody(),"wide"); brLoad(); });
F.action("brnew",function(){ BR.edit={name:"",active:true,cond:{dir:"out",min:"",max:""},act:{type:"beleg",rate:0}}; BR.prev=null; brPaint(); });
F.action("bredit",function(id){ var r=BR.list.find(function(x){ return x.id===id; }); if(r){ BR.edit=JSON.parse(JSON.stringify(r)); BR.prev=null; brPaint(); } });
F.action("brback",function(){ BR.edit=null; brPaint(); });
F.listen("input","[data-brc],[data-brn],[data-bra]",function(el){ if(!BR.edit) return; if(el.hasAttribute("data-brn")) BR.edit.name=el.value; else if(el.hasAttribute("data-brc")) BR.edit.cond[el.getAttribute("data-brc")]=el.value; else BR.edit.act[el.getAttribute("data-bra")]=el.value; });
F.listen("change","[data-brc],[data-bra]",function(el){ if(!BR.edit) return; if(el.hasAttribute("data-brc")) BR.edit.cond[el.getAttribute("data-brc")]=el.value; else { BR.edit.act[el.getAttribute("data-bra")]=el.value; if(el.getAttribute("data-bra")==="type") brPaint(); } });
F.listen("change","[data-brtog]",function(el){ var r=BR.list.find(function(x){ return x.id===el.getAttribute("data-brtog"); }); if(!r) return; r.active=el.checked; brPost({op:"save",rule:r}).then(function(j){ F.toast(j&&j.ok?(el.checked?"Regel aktiv":"Regel pausiert"):((j&&j.error)||"Fehler"),!(j&&j.ok)); brLoad(); }); });
F.action("brprev",function(){ brErr(""); brPost({op:"preview",rule:BR.edit}).then(function(j){ if(!j||!j.ok){ brErr((j&&j.error)||"Fehler"); return; } BR.prev=j; var p=document.getElementById("brPrev"); if(p) p.innerHTML=brPrevHtml(j); }); });
F.action("brsave",function(){ brErr(""); brPost({op:"save",rule:BR.edit}).then(function(j){ if(!j||!j.ok){ brErr((j&&j.error)||"Fehler"); return; } F.toast("Regel gespeichert"); BR.edit=null; brLoad(); }); });
F.action("brdel",function(id){ F.confirm("Bankregel löschen? Bereits gebuchte Umsätze bleiben unverändert.","Löschen",function(){ brPost({op:"delete",id:id}).then(function(){ F.actions.bankrules(); }); },true); });
F.action("brup",function(i){ i=+i; var L2=BR.list.slice(); if(i<1) return; var x=L2[i]; L2[i]=L2[i-1]; L2[i-1]=x; BR.list=L2; brPaint(); brPost({op:"order",ids:L2.map(function(r){ return r.id; })}); });
function brDone(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } var b=j.by||{}; F.toast(j.done?j.done+" Umsätze gebucht"+(b.beleg?" · "+b.beleg+" Belege":"")+(b.privat?" · "+b.privat+" privat":"")+(b.transit?" · "+b.transit+" Geldtransit":""):"Keine passenden offenen Umsätze"); C.tx=null; F.load(true); brLoad(); }
F.action("brapply",function(id){ brPost({op:"preview",id:id}).then(function(p){ if(!p||!p.ok){ F.toast((p&&p.error)||"Fehler",true); return; } if(!p.count){ F.toast("Keine passenden offenen Umsätze"); return; } F.confirm("Regel jetzt auf "+p.count+" offene Umsätze anwenden?","Anwenden",function(){ brPost({op:"apply",id:id}).then(brDone); }); }); });
F.action("brrunall",function(){ F.confirm("Alle aktiven Regeln jetzt auf die offenen Umsätze anwenden?","Anwenden",function(){ brPost({op:"runall"}).then(brDone); }); });
/* ---------- Ansicht registrieren: ersetzt „Finanzen“ ---------- */
function pageTab(id){ var t=(F.geldTabs||[]).find(function(x){return x.id===id;}); if(!t) return '<div class="sd-empty">Nicht verfügbar.</div>'; var prev=UI.geldTab; UI.geldTab=id; try{ return head(t.label,t.sub||"","")+t.render(); } finally { UI.geldTab=prev; } }
function pageAbgl(){ var prev=UI.geldTab; UI.geldTab="uebersicht"; try{ var v=F.views.find(function(x){return x.id==="geld";}); return F._geldOrig?F._geldOrig.call(v):""; } finally { UI.geldTab=prev; } }
function content(){
  var p=UI.fin.split(":")[0], id=UI.fin.split(":")[1];
  if(p==="dash") return pageDash();
  if(p==="inv") return pageInv("inv");
  if(p==="dun") return pageInv("dun");
  if(p==="invd") return pageInvDetail(id);
  if(p==="cn") return pageCn();
  if(p==="vou") return pageVou();
  if(p==="bank") return pageBank("bank");
  if(p==="kasse") return pageKasse();
  if(p==="wkr") return pageWkr();
  if(p==="rvou") return pageRv();
  if(p==="open") return pageBank("open");
  if(p==="orders"){ return head("Angebote","",'<button class="btn primary" data-act="newoffer">Angebot erstellen</button>')+(F.offersPanelHtml?F.offersPanelHtml():'<div class="sd-empty">Angebote findest du unter Kunden & Leads.</div>'); }
  if(p==="ct"){ F.UI.stT="kontakte"; return pageTab("stamm"); }
  if(p==="prod"){ F.UI.stT="artikel"; return pageTab("stamm"); }
  if(p==="steuer") return head("Steuern "+esc(String(F.D.year)),"Was steht an, was ist schon bezahlt, was kommt noch.","")+(F.steuerOverview?F.steuerOverview():"");
  if(p==="uva"||p==="u1"||p==="jab"||p==="prognose"||p==="umstieg"||p==="anlagen") return p==="prognose"?head("Jahresprognose","")+(F.renderPrognose?F.renderPrognose():pageTab("prognose")):pageTab(p);
  if(p==="abgl") return pageAbgl();
  if(p==="lock") return pageLock();
  if(p==="mydata") return pageMyData();
  return pageDash();
}
/* ---------- Handy: gleiche Struktur als App-Ansicht (Reiter oben, Listen statt Tabellen, Beleg-Scan mit der Kamera) ---------- */
var MNAV=[["dash","Übersicht"],["inv","Rechnungen"],["vou","Belege"],["rvou","Wiederk. Belege"],["bank","Bank"],["kasse","Kasse"],["steuer","Steuern"],["anlagen","Abschreibungen"],["orders","Angebote"],["cn","Gutschriften"],["ct","Kontakte"],["prod","Produkte"],["abgl","Plattformen"],["mydata","Meine Daten"],["lock","Festschreiben"],["umstieg","Einstellungen"]];
function mNav(){ var g=UI.fin.split(":")[0]; if(g==="invd"||g==="dun") g="inv"; if(g==="open") g="bank"; if(g==="uva"||g==="u1"||g==="jab"||g==="prognose") g="steuer";
  return '<nav class="fsm-nav" aria-label="Finanzen">'+MNAV.map(function(n){ return '<button type="button" data-act="fin:'+n[0]+'"'+(g===n[0]?' aria-current="page"':'')+'>'+esc(n[1])+'</button>'; }).join("")+'</nav>'; }
function scanInput(cls,label){ return '<label class="'+cls+'">'+ic("cam")+(label?'<span>'+label+'</span>':'')+'<input type="file" class="fsd-scan" accept="image/*,application/pdf" capture="environment" multiple hidden></label>'; }
F.listen("change",".fsd-scan",function(el){ var fs=el.files; if(fs&&fs.length){ if(F.KI&&F.KI.scan) F.KI.scan(fs); else F.toast("Beleg-Scan ist gerade nicht verfügbar",true); } el.value=""; });
function mRow(act,title,sub,amt,right){ return '<button type="button" class="fsm-row" data-act="'+act+'"><span class="fsm-l"><b>'+esc(title||"—")+'</b><span>'+sub+'</span></span><span class="fsm-r"><b>'+amt+'</b>'+(right||"")+'</span></button>'; }
function mDash(){
  if(!sevOk()) return noSev();
  var sev=F.D.sev, ab=F.D.abgleich.totals, accs=sev.accounts||[], bal=accs.reduce(function(a,x){return a+(+x.balance||0);},0);
  var od=sev.invoices.filter(function(i){return i.overdue&&!i.cancelled;}), op=sev.invoices.filter(function(i){return i.open>0.005&&i.status!==100&&!i.cancelled&&i.type!=="SR";}), dr=sev.invoices.filter(function(i){return i.status===100;});
  var tile=function(act,lbl,val,sub,cls){ return '<button type="button" class="fsm-tile'+(cls?" "+cls:"")+'" data-act="'+act+'"><span>'+lbl+'</span><b>'+val+'</b><i>'+sub+'</i></button>'; };
  var nt=function(l){ return l.reduce(function(a,i){ return a+(i.gross?i.open*i.net/i.gross:i.open); },0); }, gt=function(l){ return l.reduce(function(a,i){return a+i.open;},0); };
  return platTiles()+'<section class="fsm-scan">'+scanInput("fsm-scanbtn","Beleg scannen")+'<p>Foto mit der Kamera – die KI liest Lieferant, Datum und Betrag aus.</p><div class="fsm-scan2"><button type="button" class="btn" data-act="kiupload">Datei hochladen</button><button type="button" class="btn" data-act="newinvoice">Rechnung schreiben</button></div></section>'+
    '<div class="fsm-tiles">'+tile("fin:inv:open","Offen (netto)",eur0(nt(op)),"brutto "+eur0(gt(op))+" · "+op.length+" Rechn.")+tile("fin:inv:due","Überfällig (netto)",eur0(nt(od)),"brutto "+eur0(gt(od))+" · "+od.length+" Rechn.",od.length?"bad":"")+
      tile("fin:bank","Kontostand",eur0(bal),accs.length+" Konten")+tile("fin:abgl","Zu verrechnen",eur0(ab.unbilled||0),(ab.unbilledCount||0)+" Posten")+'</div>'+
    '<section class="fsm-card"><h3>Zu erledigen</h3>'+
      [dr.length?mRow("fin:inv:draft",dr.length+" Rechnungsentwürfe","noch nicht versendet","",""):"",
       sev.unassigned?mRow("fin:open",sev.unassigned+" Bankumsätze","noch nicht zugeordnet","",""):"",
       sev.vouchers&&sev.vouchers.drafts?mRow("fin:vou:draft",sev.vouchers.drafts+" Beleg-Entwürfe","prüfen & abschließen","",""):"",
       od.length?mRow("fin:inv:due",od.length+" überfällig","erinnern oder mahnen","",""):""].join("")||'<p class="fsm-empty">Alles erledigt. 🎉</p>'+
    '</section>'+
    '<section class="fsm-card"><h3>Letzte Rechnungen</h3>'+sev.invoices.slice().sort(function(a,b){return (+b.id||0)-(+a.id||0);}).slice(0,5).map(mInvRow).join("")+'<button type="button" class="fsm-more" data-act="fin:inv">Alle Rechnungen</button></section>';
}
function mInvRow(i){ return mRow("fin:invd:"+esc(i.id),i.contact,esc(i.nr||"Entwurf")+" · "+deShort(i.date)+" · "+relDue(i),eur(i.type==="SR"?-Math.abs(i.gross):i.gross),invPill(i)); }
function mInv(kind){
  if(!sevOk()) return noSev();
  var f=UI.fin.split(":")[1]||"all", q=(UI.fq_inv||"").toLowerCase(), per=30, pg=UI.fpg||0;
  var list=F.D.sev.invoices.slice().sort(function(a,b){ return (+b.id||0)-(+a.id||0); }).filter(function(i){ if(kind==="dun"?!(i.dunning>0):i.type==="MA") return false; if(f==="draft"&&i.status!==100) return false; if(f==="open"&&!(i.open>0.005&&i.status!==100)) return false; if(f==="due"&&!i.overdue) return false; if(f==="paid"&&i.status!==1000) return false; if(f==="locked"&&!i.enshrined) return false; return !q||(i.nr+" "+i.contact+" "+i.header+" "+i.gross).toLowerCase().indexOf(q)>-1; });
  return '<div class="fsm-tabs">'+tabs("fin:"+(kind==="dun"?"dun":"inv"),f,[["all","Alle"],["draft","Entwurf"],["open","Offen"],["due","Fällig"],["paid","Bezahlt"]])+'</div>'+search("inv","Rechnung, Kunde, Betrag …")+
    '<section class="fsm-card flush">'+(list.slice(pg*per,(pg+1)*per).map(mInvRow).join("")||'<p class="fsm-empty">Keine Rechnungen.</p>')+pager(list.length,per)+'</section>'+
    '<button type="button" class="fsm-fab" data-act="newinvoice" aria-label="Rechnung schreiben">'+ic("plus")+'</button>';
}
function mInvDetail(id){
  var d=DET[id]; if(!d){ pageInvDetail(id); return '<p class="fsm-empty">Lade Rechnung …</p>'; }
  if(!d.ok) return '<div class="fsm-dh"><button type="button" class="fsd-back" data-act="fin:inv" aria-label="Zurück">'+ic("back")+'</button><b>Rechnung</b></div><div class="notice">Diese Rechnung wurde nicht gefunden.</div>';
  var st=d.status, i0=(F.D.sev.invoices||[]).find(function(x){return x.id===id;})||{}, draft=st===100, open=st===200||st===750;
  var b=[]; if(draft){ b.push(["sdsend","Per E-Mail senden",1]); b.push(["sdedit","Bearbeiten"]); b.push(["sdsent","Als versendet markieren"]); }
  if(open){ b.push(["book","Als bezahlt markieren",1]); b.push(["sdsend","Per E-Mail senden"]); if(d.type==="RE") b.push(["sdremind","Mahnung erstellen"]); }
  if(st===1000) b.push(["sdsend","Per E-Mail senden"]);
  if(st===200&&d.type==="RE"&&!i0.cancelled) b.push(["sdcancel","Stornieren"]);
  if((st===750||st===1000)&&!i0.cancelled&&d.type!=="SR"&&d.type!=="MA") b.push(["fincn","Gutschrift"]);
  var row=function(k,v){ return '<div><dt>'+k+'</dt><dd>'+v+'</dd></div>'; };
  return '<div class="fsm-dh"><button type="button" class="fsd-back" data-act="fin:inv" aria-label="Zurück">'+ic("back")+'</button><b>'+esc(d.nr||"Entwurf")+'</b></div>'+
    '<section class="fsm-card"><div class="fsm-top"><div><b>'+esc(d.contact.name||"")+'</b><span>'+de(d.date)+'</span></div>'+invPill(Object.assign({},i0,{status:st}))+'</div><div class="fsm-amt">'+eur(d.gross)+'</div>'+(d.open>0.005&&d.paid>0?'<div class="fsm-sub">davon offen '+eur(d.open)+'</div>':'')+'</section>'+
    '<div class="fsm-acts">'+b.map(function(x){ return '<button type="button" class="btn'+(x[2]?" primary":"")+'" data-act="'+x[0]+':'+esc(id)+'">'+x[1]+'</button>'; }).join("")+'<a class="btn" href="/admin/api/sevdesk/pdf?id='+encodeURIComponent(id)+'" target="_blank" rel="noopener">PDF ansehen</a></div>'+
    '<section class="fsm-card"><h3>Rechnungsdetails</h3><dl class="fsd-rows" style="margin:0">'+row("Fälligkeit",relDue(Object.assign({},i0,{status:st})))+row("Zahlungsziel",d.due?de(d.due)+' ('+d.timeToPay+' Tage)':'—')+row("Leistungsdatum",de(d.delivery)||"—")+row("Versendet am",d.sent?de(d.sendDate):'—')+row("Festgeschrieben",d.enshrined?'ja':'nein')+(d.payDate?row("Bezahlt am",de(d.payDate)):'')+'</dl></section>'+
    '<section class="fsm-card"><h3>Positionen</h3>'+(d.positions||[]).map(function(p){ return '<div class="fsm-pos"><span>'+esc(p.name)+(p.qty!==1?' <i>× '+esc(String(p.qty).replace(".",","))+'</i>':'')+'</span><b>'+eur(p.sumGross)+'</b></div>'; }).join("")+'</section>';
}
function mVou(){
  var y=String(F.D.year); vouLoad(); var vd=C.vou[y];
  var top='<section class="fsm-scan slim">'+scanInput("fsm-scanbtn","Beleg scannen")+'<button type="button" class="btn" data-act="kiupload">Datei</button></section>';
  if(!vd) return top+'<p class="fsm-empty">Lade Belege …</p>';
  if(!vd.ok) return top+noSev();
  var f=UI.fin.split(":")[1]||"all", cat=UI.fvcat||"", q=(UI.fq_vou||"").toLowerCase(), per=30, pg=UI.fpg||0, cats={};
  vd.vouchers.forEach(function(v){ var c=v.category||"Ohne Kategorie"; cats[c]=(cats[c]||0)+1; });
  var list=vd.vouchers.filter(function(v){ if(cat&&(v.category||"Ohne Kategorie")!==cat) return false; if(f==="draft"&&v.status!==50) return false; if(f==="open"&&!(v.open>0.005)) return false; if(f==="paid"&&v.status!==1000) return false; return !q||(v.supplier+" "+v.desc+" "+v.category+" "+v.gross).toLowerCase().indexOf(q)>-1; });
  var vp=function(v){ return v.status===50?pill("draft","Entwurf"):v.status===1000?pill("paid","Bezahlt"):(v.open>0.005?pill("open","Offen"):pill("grey",v.statusLabel)); };
  return top+'<div class="fsm-tabs">'+tabs("fin:vou",f,[["all","Alle"],["draft","Entwurf"],["open","Offen"],["paid","Bezahlt"]])+'</div>'+
    '<div class="fsm-filt">'+search("vou","Lieferant, Betrag …")+'<select class="f" data-fvsel="1" aria-label="Kategorie"><option value="">Alle Kategorien</option>'+Object.keys(cats).sort().map(function(k){ return '<option'+(k===cat?" selected":"")+' value="'+esc(k)+'">'+esc(k)+' ('+cats[k]+')</option>'; }).join("")+'</select></div>'+
    '<section class="fsm-card flush">'+(list.slice(pg*per,(pg+1)*per).map(function(v){ return mRow("sdvou:"+esc(v.id),v.supplier,esc(v.category||"ohne Kategorie")+" · "+deShort(v.date)+(v.hasDoc?"":" · ohne Datei"),(v.cd==="D"?"":"-")+eur(v.gross),vp(v)); }).join("")||'<p class="fsm-empty">Keine Belege.</p>')+pager(list.length,per)+'</section>'+
    scanInput("fsm-fab","");
}
F.listen("change","[data-fvsel]",function(el){ UI.fvcat=el.value; UI.fpg=0; F.render(); });
function mBank(mode){
  if(!C.tx){ txLoad(); return '<p class="fsm-empty">Lade Bankumsätze …</p>'; }
  if(!C.tx.ok) return noSev();
  var acc=UI.fin.split(":")[1]||"all", q=(UI.fq_tx||"").toLowerCase(), per=40, pg=UI.fpg||0, accs=C.tx.accounts||[];
  var list=C.tx.transactions.filter(function(t){ if(acc!=="all"&&t.accountId!==acc) return false; if(mode==="open"&&t.status!==100) return false; return !q||(t.name+" "+t.purpose+" "+t.amount).toLowerCase().indexOf(q)>-1; });
  return '<div class="fsm-tabs">'+tabs("fin:"+(mode==="open"?"open":"bank"),acc,[["all","Alle"]].concat(accs.map(function(a){ return [a.id,a.name]; })))+'</div>'+
    '<div class="fsm-filt">'+search("tx","Name, Zweck, Betrag …")+'<button type="button" class="btn" data-act="fin:'+(mode==="open"?"bank":"open")+'">'+(mode==="open"?"Alle":"Nur offene")+'</button></div><button type="button" class="btn" style="width:100%" data-act="bankrules">Bankregeln</button>'+
    '<section class="fsm-card flush">'+(list.slice(pg*per,(pg+1)*per).map(function(t){ return mRow(t.status===100?"ftxassign:"+esc(t.id):(t.links[0]&&t.links[0].type==="Invoice"?"fin:invd:"+esc(t.links[0].id):(t.links[0]?"sdvou:"+esc(t.links[0].id):"fin:bank")),t.name||"—",esc(deShort(t.date)+" · "+(t.purpose||"").slice(0,60)),'<span class="'+(t.amount<0?"bad-t":"ok-t")+'">'+eur(t.amount)+'</span>',t.status===100?pill("open","Zuordnen"):pill("paid",t.links.length?(t.links[0].nr||"Gebucht"):"Gebucht")); }).join("")||'<p class="fsm-empty">Keine Umsätze.</p>')+pager(list.length,per)+'</section>';
}
function mobile(){
  var p=UI.fin.split(":")[0], id=UI.fin.split(":")[1], body;
  if(p==="dash") body=mDash(); else if(p==="inv") body=mInv("inv"); else if(p==="dun") body=mInv("dun"); else if(p==="invd") body=mInvDetail(id);
  else if(p==="vou") body=mVou(); else if(p==="bank") body=mBank("bank"); else if(p==="open") body=mBank("open");
  else body='<div class="fsm-wide">'+content()+'</div>';
  return '<div class="fsd fsm">'+(p==="invd"?"":'<div class="fsm-head"><h1>Finanzen</h1><button type="button" class="fsm-hbtn" data-act="help" aria-label="Hilfe">'+ic("help")+'</button></div>'+mNav())+'<div class="fsm-body">'+body+'</div></div>';
}
var gv=F.views.find(function(x){return x.id==="geld";});
if(gv){
  F._geldOrig=gv.render;
  // alte Sprungziele (F.UI.geldTab aus Heute, Suche, Steuer-Hinweisen …) auf die neuen Seiten abbilden
  var GT={rechnungen:"inv",bank:"open",belege:"vou",stamm:"ct",uva:"uva",u1:"u1",jab:"jab",prognose:"prognose",umstieg:"umstieg",steuer:"steuer"};
  gv.render=function(){
    if(UI.geldTab&&UI.geldTab!=="__z"){ var m=GT[UI.geldTab]; if(m){ UI.fin=m+(m==="inv"&&UI.rgF&&UI.rgF!=="todo"&&UI.rgF!=="all"?":"+({open:"open",overdue:"due",draft:"draft"}[UI.rgF]||"all"):""); } UI.geldTab="__z"; }
    if(window.innerWidth<=900) return mobile();
    return '<div class="fsd">'+sidebar()+'<div class="fsd-main">'+content()+'</div></div>';
  };
}
/* nach Aktionen Detail neu laden */
var _load=F.load; F.load=function(force){ if(force){ DET={}; C.tx=null; C.cn=null; C.vou={}; KB=null; WK=null; } return _load.apply(this,arguments); };

/* Aussehen 1:1 nach sevDesk (Inter, Farben, Maße aus dem Original abgenommen) */
(function(){ if(document.getElementById("fsd-font")) return; var l=document.createElement("link"); l.id="fsd-font"; l.rel="stylesheet"; l.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"; document.head.appendChild(l); })();
F.css(
'main:has(>.view-geld .fsd),main:has(.fsd){padding:0!important;max-width:none!important}'+
'.view-geld:has(.fsd){max-width:none;padding:0;margin:0}'+
'.fsd{--sd-ink:#100b2d;--sd-ink2:#5e5e74;--sd-mut:#777;--sd-mut2:#717387;--sd-line:rgba(6,3,20,.11);--sd-line2:rgba(6,3,20,.17);--sd-navy:#212144;--sd-coral:#f15a3a;--sd-hov:rgba(6,3,20,.05);--sd-bg:#fff;--sd-side:#fbf9f9;--sd-red:#a7002c;'+
  'font-family:Inter,-apple-system,system-ui,arial,sans-serif;font-size:14px;color:var(--sd-ink);display:grid;grid-template-columns:243px minmax(0,1fr);min-height:calc(100vh - 48px);background:var(--sd-bg);-webkit-font-smoothing:antialiased}'+
'.fsd *{font-family:inherit}'+
'body .fsd{--ground:#fbf9f9;--panel:#fff;--sunk:#f1f1f3;--ink:#100b2d;--ink-2:#5e5e74;--ink-3:#777;--line:rgba(6,3,20,.11);--glow:#212144;--glow-ink:#212144;--glow-soft:#ececf6;--on-glow:#fff;--sel:#e4e3fb;--ok:#169c56;--ok-soft:#d7f6e6;--warn:#8a6a00;--warn-soft:#fdeeb5;--bad:#e5322d;--bad-soft:#fcd9d9;--info:#534acc;--info-soft:#ecedfe;color-scheme:light}'+
'.fsd-nav{background:var(--sd-side);border-right:1px solid var(--sd-line);padding:14px 16px;display:flex;flex-direction:column;gap:2px;position:sticky;top:48px;height:calc(100vh - 48px);overflow-y:auto}'+
'.fsd-search{display:flex;align-items:center;gap:8px;background:rgba(6,3,20,.06);border-radius:8px;height:34px;padding:0 10px;margin:0 0 12px;border:0;color:var(--sd-ink2);font-size:14px;cursor:pointer;text-align:left}'+
'.fsd-search svg{width:16px;height:16px}.fsd-search kbd{margin-left:auto;font:inherit;font-size:11px;color:var(--sd-mut)}'+
'.fsd-i{display:flex;align-items:center;gap:12px;border:0;background:none;border-radius:8px;padding:8px;font-size:14px;font-weight:500;color:var(--sd-ink2);text-align:left;cursor:pointer;line-height:20px}'+
'.fsd-i svg{width:18px;height:18px;flex:none;stroke-width:1.6}'+
'.fsd-i:hover{background:var(--sd-hov)}.fsd-i.on{color:var(--sd-ink);font-weight:600}.fsd-i.on svg{color:var(--sd-ink);stroke-width:2.2}'+
'.fsd-sub{display:grid;margin:0 0 4px 18px;padding-left:2px;border-left:2px solid #f2c3ba}'+
'.fsd-sub button{border:0;background:none;text-align:left;font-size:14px;font-weight:500;color:var(--sd-ink2);padding:5px 0 5px 18px;margin-left:-2px;border-left:2px solid transparent;cursor:pointer;line-height:18px}'+
'.fsd-sub button:hover{color:var(--sd-ink)}.fsd-sub button.on{color:var(--sd-ink);font-weight:600;border-left-color:var(--sd-navy)}'+
'.fsd-sep{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--sd-mut2);padding:16px 8px 6px;font-weight:500}'+
'.fsd-main{padding:22px 24px 48px;min-width:0;display:flex;flex-direction:column;gap:16px}'+
'.fsd-main.narrow{max-width:940px;margin:0 auto;width:100%}'+
'.fsd-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;min-height:44px}'+
'.fsd-head h1{font-size:20px;font-weight:500;letter-spacing:-.3px;color:#1d1d1d;margin:0}.fsd-head p{margin:2px 0 0;color:var(--sd-mut2);font-size:13px}'+
'.fsd-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'+
'body .fsd .btn,body .fsd .btn:not(.primary){height:40px;border-radius:8px;border:1px solid var(--sd-line2);background:#fff;color:var(--sd-ink);font-size:14px;font-weight:400;padding:8px 12px;box-shadow:none;display:inline-flex;align-items:center;gap:6px;text-decoration:none}'+
'body .fsd .btn:hover{background:#f7f7f8}body .fsd .btn.primary,body[data-view] .fsd .btn.primary{background:var(--sd-navy)!important;border:1px solid transparent!important;color:#fff!important;box-shadow:none!important;font-weight:400}body .fsd .btn.primary:hover{background:#2c2c5a!important}'+
'.fsd .btn.sm{height:30px;font-size:12px;font-weight:500;padding:4px 10px}'+
'.fsd-card{background:#fff;border:1px solid var(--sd-line);border-radius:12px;padding:16px 18px;min-width:0}'+
'.fsd-card.flush{padding:0;overflow:hidden}'+
'.fsd-ch{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:12px}.fsd-ch b{font-size:14px;font-weight:600}.fsd-ch .muted{font-size:12px;color:var(--sd-mut2)}'+
'.fsd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;grid-auto-flow:dense}.fsd-grid .span2{grid-column:span 2}.fsd-grid>.fsd-card{min-height:250px}'+
'@media (min-width:1700px){.fsd-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}'+
'.fsd-chart{width:100%;height:auto}.fch-svg{display:block;margin-top:4px}.fch-hit{fill:transparent;cursor:pointer}.fch-m:hover .fch-hit,.fch-m.on .fch-hit{fill:rgba(6,3,20,.045)}'+
'.fch-sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:2px 0 10px}.fch-sum>div{display:grid;gap:2px}.fch-sum span{font-size:12px;color:var(--sd-mut2);display:flex;align-items:center;gap:6px}.fch-sum i,.fch-tip i{width:8px;height:8px;border-radius:50%;display:inline-block}.fch-sum b{font-size:16px;font-weight:600}'+
'.fch-tip{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;font-size:12.5px;background:var(--sd-side);border:1px solid var(--sd-line);border-radius:8px;padding:7px 12px;min-height:34px}.fch-tip span{display:inline-flex;align-items:center;gap:6px;color:var(--sd-ink2)}.fch-tip>b{font-size:13px}'+
'@media (max-width:700px){.fch-sum{grid-template-columns:repeat(2,minmax(0,1fr))}}'+
'.fsd-chart{width:100%;height:auto}.fsd-leg{display:flex;gap:16px;font-size:12px;color:var(--sd-ink);margin-top:8px}.fsd-leg i,.fsd-dl i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}'+
'.fsd-dn{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;align-items:center}.fsd-donut{width:150px;height:150px}'+
'.fsd-dl span{white-space:nowrap}.fsd-dl span>i{flex:none}.fsd-dl span{overflow:hidden;text-overflow:ellipsis}'+
'.fsd-dl{display:grid;gap:7px;font-size:12px;color:var(--sd-ink2)}.fsd-dl span{display:flex;align-items:center;gap:4px;min-width:0}.fsd-dl b{margin-left:auto;color:var(--sd-ink);font-weight:500;white-space:nowrap}'+
'.fsd-task{display:grid;width:100%;text-align:left;border:0;border-top:1px solid var(--sd-line);background:none;padding:10px 0;cursor:pointer;gap:2px}.fsd-task:first-of-type{border-top:0;padding-top:0}.fsd-task b{font-weight:500;font-size:14px}.fsd-task span{font-size:12px;color:var(--sd-mut2)}.fsd-task:hover b{color:#534acc}'+
'.fsd-bar2{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--sd-line);margin-top:10px}.fsd-bar2 i{display:block;height:100%}.fsd-grid>.fsd-kpi{min-height:0}'+
'.fsd-big{font-size:20px;font-weight:600}.fsd-bigl{font-size:11px;color:var(--sd-mut2);margin:2px 0 10px;padding-bottom:10px;border-bottom:1px solid var(--sd-line)}'+
'.fsd-acc{display:flex;justify-content:space-between;width:100%;border:0;background:none;padding:6px 0;font-size:13px;cursor:pointer;color:var(--sd-ink)}.fsd-acc:hover span{color:#534acc}'+
'.fsd-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px;border-bottom:1px solid var(--sd-line)}'+
'.fsd-tabs{display:flex;gap:4px;flex-wrap:wrap}.fsd-tabs button{border:1px solid transparent;background:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:500;color:var(--sd-ink);cursor:pointer;line-height:16px}'+
'.fsd-tabs button:hover{background:var(--sd-hov)}.fsd-tabs button[aria-pressed="true"]{background:var(--sd-line)}.fsd-tabs .n{color:var(--sd-mut);font-weight:400}'+
'.fsd-q.f{height:32px;max-width:240px;border-radius:8px;border:1px solid var(--sd-line2);font-size:13px;padding:0 10px;background:#fff}'+
'.fsd-t{width:100%;border-collapse:collapse}body .fsd .fsd-t th{background:#fafafa!important;color:#100b2d!important;font-size:12px;text-transform:none;letter-spacing:0;color:var(--sd-ink);font-weight:500;padding:12px;border-bottom:1px solid var(--sd-line);text-align:left;white-space:nowrap;position:static}'+
'.fsd-t td{padding:8px 12px;height:48px;border-bottom:1px solid var(--sd-line);vertical-align:middle;font-size:14px;color:var(--sd-ink);background:#fff}.fsd-t td.m{color:var(--sd-ink2)}.fsd-t .sub{font-size:14px;color:var(--sd-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px}'+
'.fsd-t tr:last-child td{border-bottom:0}.fsd-t.sm td{padding:8px 0;height:auto;font-size:13px}.fsd-t .r{text-align:right}.fsd-t .nowrap{white-space:nowrap}'+
'.fsd-row{cursor:pointer}.fsd-row:hover td{background:#f8f8f9}'+
'.fsd-lock svg{width:13px;height:13px;vertical-align:-2px;margin-right:6px;color:var(--sd-mut)}'+
'.fsd-strike{text-decoration:line-through;color:var(--sd-mut)}.fsd-due{color:var(--sd-red)}'+
'.fsd-pill{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:2px 8px;font-size:12px;font-weight:500;white-space:nowrap;line-height:20px;color:var(--sd-ink)}'+
'.fsd-pill:before{content:"";width:5px;height:5px;border-radius:50%;box-sizing:border-box}'+
'.fsd-pill.open{background:#fdeeb5}.fsd-pill.open:before{border:1.5px solid #8a6a00;width:7px;height:7px}'+
'.fsd-pill.due{background:#fcd9d9}.fsd-pill.due:before{border:1.5px solid var(--sd-red);width:7px;height:7px}'+
'.fsd-pill.paid{background:#d7f6e6}.fsd-pill.paid:before{background:#14a05c;width:6px;height:6px}'+
'.fsd-pill.draft{background:#e4e3fb}.fsd-pill.draft:before{background:#534acc}'+
'.fsd-pill.grey{background:rgba(6,3,20,.06);color:var(--sd-mut)}.fsd-pill.grey:before{display:none}'+
'.fsd-chip{display:inline-block;background:rgba(6,3,20,.06);border-radius:6px;padding:2px 8px;font-size:12px;color:var(--sd-ink2);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}'+
'.fsd-ic{display:inline-flex;gap:10px;color:var(--sd-ink2)}.fsd-ic button,.fsd-ic a{border:0;background:none;padding:2px;cursor:pointer;color:inherit;display:grid}.fsd-ic svg{width:16px;height:16px}.fsd-ic button:hover,.fsd-ic a:hover{color:var(--sd-ink)}'+
'.fsd-pager{display:flex;justify-content:center;align-items:center;gap:18px;padding:14px;font-size:13px;color:var(--sd-ink);border-top:1px solid var(--sd-line)}.fsd-pager button{border:0;background:none;width:28px;height:28px;cursor:pointer;font-size:18px;color:var(--sd-ink)}.fsd-pager button:disabled{opacity:.3;cursor:default}'+
'.fsd-vou{display:grid;grid-template-columns:200px minmax(0,1fr);gap:16px;align-items:start}'+
'.fsd-cats{padding:8px;display:grid;gap:2px;position:sticky;top:64px;max-height:calc(100vh - 90px);overflow-y:auto}'+
'.fsd-cat{display:grid;grid-template-columns:26px minmax(0,1fr);text-align:left;border:0;background:none;border-radius:8px;padding:9px 8px;cursor:pointer;color:var(--sd-ink)}.fsd-cat svg{width:18px;height:18px;color:#c4c4cc;grid-row:span 2}'+
'.fsd-cat b{font-weight:400;font-size:14px;line-height:19px}.fsd-cat span{font-size:14px;line-height:19px}.fsd-cat:hover{background:var(--sd-hov)}.fsd-cat.on{background:rgba(6,3,20,.07)}'+
'.fsd .ok-t{color:#169c56}.fsd .bad-t{color:#e5322d}'+
'.fsd-dhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fsd-dhead h1{font-size:20px;font-weight:500;letter-spacing:-.3px;margin:0 0 0 8px}.fsd-dhead .sp{flex:1}'+
'.fsd-back{width:30px;height:30px;border-radius:8px;border:0;background:rgba(6,3,20,.06);display:grid;place-items:center;cursor:pointer;color:var(--sd-ink)}.fsd-back svg{width:16px;height:16px}'+
'.fsd-detail{display:grid;grid-template-columns:minmax(0,1fr) 372px;gap:14px;align-items:start}'+
'.fsd-pdf{background:#f3f3f4;border-radius:12px;overflow:hidden;padding:0}.fsd-pdf iframe{width:100%;height:calc(100vh - 150px);min-height:560px;border:0;display:block}'+
'.fsd-side{display:grid;gap:14px;position:sticky;top:64px}.fsd-side .fsd-card{padding:18px 20px}'+
'.fsd-nrbar{display:flex;align-items:center;justify-content:space-between}.fsd-nrbar b{font-size:18px;font-weight:500}.fsd-nrbar .fsd-ic svg{width:18px;height:18px}'+
'.fsd-cname{font-size:16px;font-weight:500}.fsd-cdate{font-size:13px;color:var(--sd-ink2);margin-top:4px}'+
'.fsd-amt{display:flex;justify-content:space-between;align-items:baseline;margin-top:44px}.fsd-amt span{color:var(--sd-ink2);font-size:13px}.fsd-amt span i{font-style:normal;color:var(--sd-mut)}.fsd-amt b{font-size:26px;font-weight:600;letter-spacing:-.5px}.fsd-amt b small{font-size:11px;font-weight:500;margin-left:3px}'+
'.fsd-rows{display:grid}.fsd-rows>div{display:flex;justify-content:space-between;gap:12px;padding:14px 0;border-bottom:1px solid var(--sd-line);font-size:13px}.fsd-rows>div:last-child{border-bottom:0}.fsd-rows dt{color:var(--sd-ink2)}.fsd-rows dd{margin:0;text-align:right}.fsd-rows svg{width:12px;height:12px;vertical-align:-1px;margin-right:4px}'+
'.fsd-ctitle{font-size:17px;font-weight:500;margin-bottom:4px}'+
'.fsd .notice,.fsd .sd-empty{font-size:14px}'+
'.fsm{display:block;min-height:calc(100vh - 60px);background:#f6f6f8;margin:0;padding-bottom:110px}'+
'.fsm-head{padding:14px 16px 4px;display:flex;justify-content:space-between;align-items:center}.fsm-hbtn{width:38px;height:38px;border-radius:50%;border:1px solid rgba(6,3,20,.12);background:#fff;display:grid;place-items:center;color:#100b2d}.fsm-hbtn svg{width:20px;height:20px}'+
'.fsd-help{margin-top:auto}.fsd-help kbd{margin-left:auto;font:inherit;font-size:11px;color:var(--sd-mut);border:1px solid var(--sd-line2);border-radius:4px;padding:0 5px}'+
'.fsm-head h1{font-size:24px;font-weight:600;letter-spacing:-.4px;margin:0;color:#100b2d}'+
'.fsm-nav{display:flex;gap:6px;overflow-x:auto;padding:8px 16px 12px;scrollbar-width:none;position:sticky;top:0;z-index:5;background:#f6f6f8}.fsm-nav::-webkit-scrollbar{display:none}'+
'.fsm-nav button{flex:none;border:1px solid rgba(6,3,20,.12);background:#fff;border-radius:99px;padding:7px 14px;font-size:14px;font-weight:500;color:#100b2d}'+
'.fsm-nav button[aria-current]{background:#212144;border-color:#212144;color:#fff}'+
'.fsm-body{padding:0 12px;display:grid;gap:12px}'+
'.fsm-card{background:#fff;border-radius:14px;border:1px solid rgba(6,3,20,.08);padding:14px 16px}.fsm-card.flush{padding:0;overflow:hidden}.fsm-card h3{font-size:15px;font-weight:600;margin:0 0 6px}'+
'.fsm-row{display:flex;width:100%;gap:12px;align-items:center;justify-content:space-between;text-align:left;border:0;background:#fff;padding:12px 16px;border-bottom:1px solid rgba(6,3,20,.07);min-height:62px;color:#100b2d}'+
'.fsm-card:not(.flush) .fsm-row{padding:11px 0}.fsm-row:last-child{border-bottom:0}.fsm-row:active{background:#f3f3f6}'+
'.fsm-l{display:grid;min-width:0;gap:2px}.fsm-l b{font-weight:500;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fsm-l span{font-size:12.5px;color:#717387;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.fsm-r{display:grid;justify-items:end;gap:4px;flex:none}.fsm-r b{font-weight:600;font-size:15px;white-space:nowrap}'+
'.fsm-scan{background:#212144;color:#fff;border-radius:16px;padding:18px 16px;display:grid;gap:10px}.fsm-scan p{margin:0;font-size:13px;opacity:.8}'+
'.fsm-scanbtn{display:flex;align-items:center;justify-content:center;gap:10px;background:#f15a3a;color:#fff;border-radius:12px;height:56px;font-size:17px;font-weight:600;cursor:pointer}.fsm-scanbtn svg{width:24px;height:24px}'+
'.fsm-scan2{display:grid;grid-template-columns:1fr 1fr;gap:8px}body .fsm-scan2 .btn,body .fsm-scan .btn{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.2);justify-content:center}'+
'.fsm-scan.slim{grid-template-columns:1fr auto;align-items:center;padding:10px}.fsm-scan.slim .fsm-scanbtn{height:46px;font-size:15px}.fsm-scan.slim .btn{height:46px}'+
'.fsm-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}.fsm-tile{display:grid;gap:2px;text-align:left;background:#fff;border:1px solid rgba(6,3,20,.08);border-radius:14px;padding:12px 14px;color:#100b2d}'+
'.fsm-tile span{font-size:12.5px;color:#717387}.fsm-tile b{font-size:20px;font-weight:600;letter-spacing:-.3px}.fsm-tile i{font-style:normal;font-size:12px;color:#717387}.fsm-tile.bad b{color:#c0362c}'+
'.fsm-more{width:100%;border:0;background:none;color:#534acc;font-weight:500;padding:12px 0 2px;font-size:14px}.fsm-empty{color:#717387;text-align:center;padding:18px 0;margin:0}'+
'.fsm-tabs{overflow-x:auto;scrollbar-width:none}.fsm-tabs .fsd-tabs{flex-wrap:nowrap}.fsm-tabs .fsd-tabs button{flex:none;font-size:13px;padding:7px 12px}'+
'.fsm .fsd-q.f{max-width:none;width:100%;height:42px;font-size:15px}.fsm-filt{display:grid;grid-template-columns:1fr auto;gap:8px}.fsm-filt select.f{height:42px;max-width:150px;border-radius:8px;border:1px solid rgba(6,3,20,.17);background:#fff;font-size:14px}'+
'.fsm-fab{position:fixed;right:18px;bottom:calc(84px + env(safe-area-inset-bottom));width:58px;height:58px;border-radius:50%;background:#f15a3a;color:#fff;display:grid;place-items:center;border:0;box-shadow:0 6px 18px rgba(241,90,58,.45);z-index:30;cursor:pointer}.fsm-fab svg{width:26px;height:26px}'+
'.fsm-dh{display:flex;align-items:center;gap:10px;padding:12px 4px 0}.fsm-dh b{font-size:19px;font-weight:600}'+
'.fsm-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.fsm-top>div{display:grid}.fsm-top b{font-size:16px;font-weight:600}.fsm-top span{font-size:13px;color:#717387}'+
'.fsm-amt{font-size:30px;font-weight:600;letter-spacing:-.6px;margin-top:16px}.fsm-sub{font-size:13px;color:#717387}'+
'.fsm-acts{display:grid;grid-template-columns:1fr 1fr;gap:8px}body .fsm-acts .btn{justify-content:center;height:46px}body .fsm-acts .btn.primary{grid-column:1/-1}'+
'.fsm-pos{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid rgba(6,3,20,.07);font-size:14px}.fsm-pos:last-child{border-bottom:0}.fsm-pos i{color:#717387;font-style:normal}'+
'.fsm .fsd-pager{border-top:1px solid rgba(6,3,20,.07)}.fsm-wide{overflow-x:auto}.fsm .fsd-head h1{font-size:20px}'+
'.md-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}.md-row{display:grid;grid-template-columns:150px minmax(0,1fr) 20px;gap:10px;align-items:center;width:100%;text-align:left;border:0;border-top:1px solid var(--sd-line);background:none;padding:10px 4px;cursor:pointer;font:inherit;color:var(--sd-ink)}.md-row span{font-size:13px;color:var(--sd-mut2)}.md-row b{font-weight:500;font-size:14px;word-break:break-word}.md-row i{color:var(--sd-mut);opacity:0;display:grid}.md-row i svg{width:15px;height:15px}.md-row:hover{background:var(--sd-hov)}.md-row:hover i{opacity:1}'+
'.md-edit{display:grid;grid-template-columns:150px 200px minmax(0,1fr) auto;gap:8px;align-items:center}@media (max-width:700px){.md-row{grid-template-columns:110px minmax(0,1fr) 18px}.md-row i{opacity:1}.md-edit{grid-template-columns:1fr 1fr}}'+
'.mo-flow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:12px}.mo-flow em{font-style:normal;color:var(--sd-mut);font-size:18px}.mo-k{display:grid;gap:1px}.mo-k span{font-size:12px;color:var(--sd-mut2)}.mo-k b{font-size:17px;font-weight:600}.mo-k i{font-style:normal;font-size:11.5px;color:var(--sd-mut2)}'+
'.mo-prof{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:12.5px;color:var(--sd-ink2)}.mo-prof i{font-style:normal}.mo-open{margin-top:10px}.mo-open summary{cursor:pointer;font-size:13.5px}.mo-row{display:grid;grid-template-columns:70px minmax(0,1fr) 90px 100px auto;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--sd-line);font-size:13px}.mo-row i{font-style:normal;color:var(--sd-mut2)}.mo-acc{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:8px 0;border-top:1px solid var(--sd-line);font-size:13px}.mo-acc .fsd-pill,.mo .fsd-pill{white-space:nowrap;flex:none}.mo-acc .num{text-align:right}@media(max-width:700px){.mo-acc{grid-template-columns:1fr auto}.mo-acc>span.muted{grid-column:1/-1;order:3;font-size:12px}}.rv-st{white-space:nowrap}'+
'.pt-wrap{margin-bottom:4px}.pt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.pt{display:grid;gap:4px;text-align:left;cursor:pointer;font:inherit;color:var(--sd-ink);padding:14px 16px}.pt:hover{border-color:var(--sd-line2);background:#fcfcfd}.pt-h{display:flex;justify-content:space-between;align-items:center}.pt-h b{font-size:14px;font-weight:600}.pt-h span{color:var(--sd-mut)}.pt-h svg{width:16px;height:16px}'+
'.pt-big{font-size:22px;font-weight:650;letter-spacing:-.3px;margin-top:4px}.pt-big small{font-size:12px;font-weight:500;color:var(--sd-mut2);margin-left:2px}.pt-bl{font-size:11.5px;color:var(--sd-mut2);margin-bottom:6px}.pt-rows{display:grid;gap:3px;border-top:1px solid var(--sd-line);padding-top:6px}.pt-rows div{display:flex;justify-content:space-between;gap:8px;font-size:12.5px}.pt-rows span{color:var(--sd-mut2)}.pt-rows b{font-weight:500}.pt-mo{font-size:11.5px;color:var(--sd-ink2);background:var(--sd-side);border-radius:6px;padding:4px 8px;margin-top:6px}'+
'.fsm .pt-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fsm .pt{background:#fff;border:1px solid rgba(6,3,20,.08);border-radius:14px;padding:12px}.fsm .pt-big{font-size:18px}.fsm .pt-rows div{font-size:11.5px}'+
'@media (max-width:1250px){.kbgrid{grid-template-columns:1fr 1fr!important}.fsd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fsd-detail{grid-template-columns:minmax(0,1fr)}.fsd-side{position:static}}'+
'@media (max-width:1100px){.fsd{grid-template-columns:200px minmax(0,1fr)}.fsd-vou{grid-template-columns:minmax(0,1fr)}.fsd-cats{position:static;max-height:240px}}'
);
})();
