/* Finanzen im Aufbau von sevDesk: eigene Navigation links (Übersicht, Aufträge, Rechnungen, Belege, Bank, Steuern, Verwalten),
   Tabellen wie in sevDesk, Rechnung als eigene Seite mit PDF links und Details rechts.
   Nutzt die vorhandenen Aktionen (senden, Zahlung, Mahnung, Storno, Beleg, Bank-Zuordnung …) und Unterseiten (UVA, U1, JAB, Prognose, Umstieg). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, eur=F.eur, eur0=F.eur0, de=F.de, UI=F.UI;
function deShort(v){ var m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?m[3]+"."+m[2]+"."+m[1].slice(2):""; }
UI.fin=UI.fin||F.ls("fsc_fin_page")||"dash";
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
  cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'
};
function ic(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IC[k]||"")+'</svg>'; }
/* Navigation wie in sevDesk */
var NAV=[
  {id:"dash",label:"Übersicht",icon:"dash"},
  {id:"orders",label:"Aufträge",icon:"orders",sub:[["orders","Angebote"]]},
  {id:"inv",label:"Rechnungen",icon:"inv",sub:[["inv","Alle"],["dun","Mahnungen"],["cn","Gutschriften"]]},
  {id:"vou",label:"Belege",icon:"vou"},
  {id:"bank",label:"Bank",icon:"bank",sub:[["bank","Konten"],["kasse","Kassenbuch"],["open","Unvollständig"]]},
  {id:"uva",label:"Steuern",icon:"tax",sub:[["uva","UVA"],["u1","U1 (USt-Jahr)"],["jab","E/A-Rechnung"],["prognose","Prognose"]]},
  {sep:"Verwalten"},
  {id:"ct",label:"Kontakte",icon:"ct"},
  {id:"prod",label:"Produkte",icon:"prod"},
  {id:"abgl",label:"Abgleich Plattformen",icon:"sync"},
  {id:"lock",label:"Festschreiben",icon:"lock"},
  {id:"umstieg",label:"Umstieg & Firma",icon:"set"}
];
function groupOf(p){ for(var i=0;i<NAV.length;i++){ var n=NAV[i]; if(n.id===p) return n.id; if(n.sub&&n.sub.some(function(s){return s[0]===p;})) return n.id; } return p; }
function sidebar(){
  var cur=UI.fin, g=groupOf(cur.split(":")[0]);
  return '<nav class="fsd-nav" aria-label="Finanzen"><button type="button" class="fsd-search" data-act="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>Suchen<kbd>⌘K</kbd></button>'+NAV.map(function(n){
    if(n.sep) return '<div class="fsd-sep">'+esc(n.sep)+'</div>';
    var on=g===n.id;
    return '<button type="button" class="fsd-i'+(on?" on":"")+'" data-act="fin:'+n.id+'">'+ic(n.icon)+'<span>'+esc(n.label)+'</span></button>'+
      (on&&n.sub&&n.sub.length>1&&n.id!=="orders"?'<div class="fsd-sub">'+n.sub.map(function(s){ return '<button type="button" class="'+(cur.split(":")[0]===s[0]?"on":"")+'" data-act="fin:'+s[0]+'">'+esc(s[1])+'</button>'; }).join("")+'</div>':'');
  }).join("")+'</nav>';
}
F.action("fin",function(p){ UI.fin=p; F.ls("fsc_fin_page",p.split(":")[0]); UI.fpg=0; F._forceRender=true; F.render(); window.scrollTo(0,0); });

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
function vouLoad(){ var y=String(F.D.year); if(C.vou[y]||C.busy["v"+y]) return; C.busy["v"+y]=1; F.api("/admin/api/sev/vouchers?year="+y).then(function(j){ C.busy["v"+y]=0; C.vou[y]=j||{ok:false}; F.render(); }); }
function pageDash(){
  if(!sevOk()) return noSev();
  var sev=F.D.sev, y=String(F.D.year); vouLoad();
  var inv=sev.invoices.filter(function(i){ return i.type!=="MA"&&i.type!=="SR"&&!i.cancelled&&(i.status>=200)&&String(i.date||"").slice(0,4)===y; });
  var rev=new Array(12).fill(0), exp=new Array(12).fill(0);
  inv.forEach(function(i){ var m=+String(i.date).slice(5,7)-1; rev[m]+=(i.type==="SR"?-1:1)*Math.abs(i.net||i.gross/1.2); });
  var vd=C.vou[y], cats={};
  // wie sevDesk „Gewinn und Verlust“: Umsatz = Rechnungen netto (ohne Stornierte) + Einnahme-Belege (Erlösminderung abziehen, durchlaufende Posten nicht)
  if(vd&&vd.ok) vd.vouchers.forEach(function(v){ if(v.cd!=="D"||v.status<100) return; if(/durchlaufend/i.test(v.category||"")) return; var m=+String(v.date||"").slice(5,7)-1; if(m>=0) rev[m]+=(/erl(ö|oe)sminderung/i.test(v.category||"")?-1:1)*(v.net||0); });
  if(vd&&vd.ok) vd.vouchers.forEach(function(v){ if(v.cd!=="C"||v.status<100) return; var m=+String(v.date||"").slice(5,7)-1; if(m>=0) exp[m]+=v.net||0; var c=v.category||"Sonstiges"; cats[c]=(cats[c]||0)+(v.net||0); });
  var max=Math.max.apply(null,rev.concat(exp).concat([1])), H=170, W=640, bw=W/12;
  var bars=rev.map(function(r,i){ var x=i*bw+bw*.18, w=bw*.3, hr=r/max*(H-20), he=exp[i]/max*(H-20); return '<rect x="'+x+'" y="'+(H-hr)+'" width="'+w+'" height="'+hr+'" rx="3" fill="#2fb27b"><title>Erträge '+eur(r)+'</title></rect><rect x="'+(x+w+3)+'" y="'+(H-he)+'" width="'+w+'" height="'+he+'" rx="3" fill="#ef4a4a"><title>Aufwendungen '+eur(exp[i])+'</title></rect><text x="'+(i*bw+bw/2)+'" y="'+(H+14)+'" text-anchor="middle" font-size="10" fill="var(--ink-3)">'+["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"][i]+'</text>'; }).join("");
  var tr=rev.reduce(function(a,b){return a+b;},0), te=exp.reduce(function(a,b){return a+b;},0);
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
    '<div class="fsd-grid">'+
      (function(){ var op=sev.invoices.filter(function(i){ return i.type!=="MA"&&i.type!=="SR"&&!i.cancelled&&(i.status===200||i.status===750); }), nf=function(i){ return i.gross?i.open*(i.net/i.gross):i.open; };
        var due=op.filter(function(i){return i.overdue;}).reduce(function(a,i){return a+nf(i);},0), notdue=op.filter(function(i){return !i.overdue;}).reduce(function(a,i){return a+nf(i);},0), tot=due+notdue||1;
        return '<section class="fsd-card fsd-kpi"><div class="fsd-ch"><b>Umsatz</b><span class="muted">netto · '+esc(y)+'</span></div><div class="fsd-big">'+(vd?eur(tr):'…')+'</div><div class="fsd-bigl">Rechnungen ohne Stornierte + Einnahme-Belege</div><button type="button" class="fsd-acc" data-act="fin:inv"><span>Rechnungen</span><b>→</b></button></section>'+
          '<section class="fsd-card fsd-kpi"><div class="fsd-ch"><b>Offene Forderungen</b><span class="muted">netto</span></div><div class="fsd-big">'+eur(due+notdue)+'</div><div class="fsd-bar2"><i style="width:'+(due/tot*100)+'%;background:#e5322d"></i><i style="width:'+(notdue/tot*100)+'%;background:#f5a524"></i></div>'+
          '<div class="fsd-dl" style="margin-top:8px"><span><i style="background:#e5322d"></i>Fällige Rechnungen<b>'+eur(due)+'</b></span><span><i style="background:#f5a524"></i>Offene Rechnungen<b>'+eur(notdue)+'</b></span></div></section>'; })()+
      '<section class="fsd-card span2"><div class="fsd-ch"><b>Ertrag / Aufwand</b><span class="muted">netto · Erträge '+eur0(tr)+' · Aufwand '+eur0(te)+(vd?'':' · lädt …')+'</span></div><svg viewBox="0 0 '+W+' '+(H+20)+'" class="fsd-chart">'+bars+'</svg><div class="fsd-leg"><span><i style="background:#2fb27b"></i>Erträge</span><span><i style="background:#ef4a4a"></i>Aufwendungen</span></div></section>'+
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
  if(!d.ok) return '<div class="notice">'+esc(d.error||"Rechnung nicht gefunden")+'</div>';
  var st=d.status, draft=st===100, open=st===200||st===750, i0=(F.D.sev.invoices||[]).find(function(x){return x.id===id;})||{};
  var kind=d.type==="MA"?"Mahnung":d.type==="SR"?"Stornorechnung":"Rechnung";
  var more=[];
  if(draft){ more.push(["sdedit:"+id,"Bearbeiten"]); more.push(["sdsent:"+id,"Als versendet markieren"]); }
  if(open||st===1000){ more.push(["sdsend:"+id,"Per E-Mail senden"]); }
  if(open&&d.type==="RE"){ more.push(["sdremind:"+id,"Mahnung erstellen"]); if(st===200&&!(d.paid>0)&&!d.enshrined) more.push(["sddraft:"+id,"Zurück auf Entwurf"]); }
  if(st===200&&d.type==="RE"&&!i0.cancelled) more.push(["sdcancel:"+id,"Stornieren"]);
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
function pageBank(mode){
  if(!C.tx){ txLoad(); return head("Konten","")+'<div class="sd-empty">Lade Bankumsätze …</div>'; }
  if(!C.tx.ok) return head("Konten","")+noSev();
  var parts=UI.fin.split(":"), acc=mode==="kasse"?(((C.tx.accounts||[]).find(function(a){return /kasse|register/i.test(a.name+" "+a.type);})||{}).id||"none"):(parts[1]||"all"), q=(UI.fq_tx||"").toLowerCase(), per=50, pg=UI.fpg||0;
  var accs=C.tx.accounts||[];
  var list=C.tx.transactions.filter(function(t){ if(acc!=="all"&&t.accountId!==acc) return false; if(mode==="open"&&t.status!==100) return false; return !q||(t.name+" "+t.purpose+" "+t.amount).toLowerCase().indexOf(q)>-1; });
  var stp=function(t){ return t.status===100?pill("open","Offen"):t.status===300?pill("grey","Privat"):t.status===350?pill("paid","Automatisch"):pill("paid","Gebucht"); };
  var rows=list.slice(pg*per,(pg+1)*per).map(function(t){ var lk=t.links.map(function(l){ return l.type==="Invoice"?'<a href="#" data-act="fin:invd:'+esc(l.id)+'">'+esc(l.nr)+'</a>':'<a href="#" data-act="sdvou:'+esc(l.id)+'">Beleg</a>'; }).join(", ");
    return '<tr><td>'+stp(t)+'</td><td><b>'+esc(t.name||"—")+'</b><div class="sub">'+esc(t.purpose)+'</div></td><td class="num">'+deShort(t.date)+'</td><td class="r num '+(t.amount<0?"bad-t":"ok-t")+'">'+eur(t.amount)+'</td><td>'+(lk||(t.status===100?'<button class="btn" data-act="ftxassign:'+esc(t.id)+'">Zuordnen</button>':'<span class="muted">—</span>'))+'</td></tr>'; }).join("");
  var title=mode==="kasse"?"Kassenbuch":mode==="open"?"Unvollständig":"Alle Konten";
  var accTabs=mode==="kasse"?"":tabs("fin:"+(mode==="open"?"open":"bank"),acc,[["all","Alle"]].concat(accs.map(function(a){ return [a.id,a.name]; })));
  return head(title,mode==="open"?list.length+" Umsätze ohne Zuordnung":"",'<button class="btn" data-act="sdbkimp">Kontoauszug importieren</button><button class="btn" data-act="ftxreload">Aktualisieren</button>')+
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
  if(p==="kasse") return pageBank("kasse");
  if(p==="open") return pageBank("open");
  if(p==="orders"){ return head("Angebote","",'<button class="btn primary" data-act="newoffer">Angebot erstellen</button>')+(F.offersPanelHtml?F.offersPanelHtml():'<div class="sd-empty">Angebote findest du unter Kunden & Leads.</div>'); }
  if(p==="ct"){ F.UI.stT="kontakte"; return pageTab("stamm"); }
  if(p==="prod"){ F.UI.stT="artikel"; return pageTab("stamm"); }
  if(p==="uva"||p==="u1"||p==="jab"||p==="prognose"||p==="umstieg") return p==="prognose"?head("Jahresprognose","")+(F.renderPrognose?F.renderPrognose():pageTab("prognose")):pageTab(p);
  if(p==="abgl") return pageAbgl();
  if(p==="lock") return pageLock();
  return pageDash();
}
/* ---------- Handy: gleiche Struktur als App-Ansicht (Reiter oben, Listen statt Tabellen, Beleg-Scan mit der Kamera) ---------- */
var MNAV=[["dash","Übersicht"],["inv","Rechnungen"],["vou","Belege"],["bank","Bank"],["orders","Angebote"],["uva","Steuern"],["ct","Kontakte"],["prod","Produkte"],["cn","Gutschriften"],["abgl","Abgleich"],["lock","Festschreiben"],["umstieg","Umstieg"]];
function mNav(){ var g=UI.fin.split(":")[0]; if(g==="invd"||g==="dun") g="inv"; if(g==="kasse"||g==="open") g="bank"; if(g==="u1"||g==="jab"||g==="prognose") g="uva";
  return '<nav class="fsm-nav" aria-label="Finanzen">'+MNAV.map(function(n){ return '<button type="button" data-act="fin:'+n[0]+'"'+(g===n[0]?' aria-current="page"':'')+'>'+esc(n[1])+'</button>'; }).join("")+'</nav>'; }
function scanInput(cls,label){ return '<label class="'+cls+'">'+ic("cam")+(label?'<span>'+label+'</span>':'')+'<input type="file" class="fsd-scan" accept="image/*,application/pdf" capture="environment" multiple hidden></label>'; }
F.listen("change",".fsd-scan",function(el){ var fs=el.files; if(fs&&fs.length){ if(F.KI&&F.KI.scan) F.KI.scan(fs); else F.toast("Beleg-Scan ist gerade nicht verfügbar",true); } el.value=""; });
function mRow(act,title,sub,amt,right){ return '<button type="button" class="fsm-row" data-act="'+act+'"><span class="fsm-l"><b>'+esc(title||"—")+'</b><span>'+sub+'</span></span><span class="fsm-r"><b>'+amt+'</b>'+(right||"")+'</span></button>'; }
function mDash(){
  if(!sevOk()) return noSev();
  var sev=F.D.sev, ab=F.D.abgleich.totals, accs=sev.accounts||[], bal=accs.reduce(function(a,x){return a+(+x.balance||0);},0);
  var od=sev.invoices.filter(function(i){return i.overdue;}), op=sev.invoices.filter(function(i){return i.open>0.005&&i.status!==100;}), dr=sev.invoices.filter(function(i){return i.status===100;});
  var tile=function(act,lbl,val,sub,cls){ return '<button type="button" class="fsm-tile'+(cls?" "+cls:"")+'" data-act="'+act+'"><span>'+lbl+'</span><b>'+val+'</b><i>'+sub+'</i></button>'; };
  return '<section class="fsm-scan">'+scanInput("fsm-scanbtn","Beleg scannen")+'<p>Foto mit der Kamera – die KI liest Lieferant, Datum und Betrag aus.</p><div class="fsm-scan2"><button type="button" class="btn" data-act="kiupload">Datei hochladen</button><button type="button" class="btn" data-act="newinvoice">Rechnung schreiben</button></div></section>'+
    '<div class="fsm-tiles">'+tile("fin:inv:open","Offen",eur0(op.reduce(function(a,i){return a+i.open;},0)),op.length+" Rechnungen")+tile("fin:inv:due","Überfällig",eur0(od.reduce(function(a,i){return a+i.open;},0)),od.length+" Rechnungen",od.length?"bad":"")+
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
  if(!d.ok) return '<div class="notice">'+esc(d.error||"Rechnung nicht gefunden")+'</div>';
  var st=d.status, i0=(F.D.sev.invoices||[]).find(function(x){return x.id===id;})||{}, draft=st===100, open=st===200||st===750;
  var b=[]; if(draft){ b.push(["sdsend","Per E-Mail senden",1]); b.push(["sdedit","Bearbeiten"]); b.push(["sdsent","Als versendet markieren"]); }
  if(open){ b.push(["book","Als bezahlt markieren",1]); b.push(["sdsend","Per E-Mail senden"]); if(d.type==="RE") b.push(["sdremind","Mahnung erstellen"]); }
  if(st===1000) b.push(["sdsend","Per E-Mail senden"]);
  if(st===200&&d.type==="RE"&&!i0.cancelled) b.push(["sdcancel","Stornieren"]);
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
    '<div class="fsm-filt">'+search("tx","Name, Zweck, Betrag …")+'<button type="button" class="btn" data-act="fin:'+(mode==="open"?"bank":"open")+'">'+(mode==="open"?"Alle":"Nur offene")+'</button></div>'+
    '<section class="fsm-card flush">'+(list.slice(pg*per,(pg+1)*per).map(function(t){ return mRow(t.status===100?"ftxassign:"+esc(t.id):(t.links[0]&&t.links[0].type==="Invoice"?"fin:invd:"+esc(t.links[0].id):(t.links[0]?"sdvou:"+esc(t.links[0].id):"fin:bank")),t.name||"—",esc(deShort(t.date)+" · "+(t.purpose||"").slice(0,60)),'<span class="'+(t.amount<0?"bad-t":"ok-t")+'">'+eur(t.amount)+'</span>',t.status===100?pill("open","Zuordnen"):pill("paid",t.links.length?(t.links[0].nr||"Gebucht"):"Gebucht")); }).join("")||'<p class="fsm-empty">Keine Umsätze.</p>')+pager(list.length,per)+'</section>';
}
function mobile(){
  var p=UI.fin.split(":")[0], id=UI.fin.split(":")[1], body;
  if(p==="dash") body=mDash(); else if(p==="inv") body=mInv("inv"); else if(p==="dun") body=mInv("dun"); else if(p==="invd") body=mInvDetail(id);
  else if(p==="vou") body=mVou(); else if(p==="bank"||p==="kasse") body=mBank("bank"); else if(p==="open") body=mBank("open");
  else body='<div class="fsm-wide">'+content()+'</div>';
  return '<div class="fsd fsm">'+(p==="invd"?"":'<div class="fsm-head"><h1>Finanzen</h1></div>'+mNav())+'<div class="fsm-body">'+body+'</div></div>';
}
var gv=F.views.find(function(x){return x.id==="geld";});
if(gv){
  F._geldOrig=gv.render;
  gv.render=function(){
    if(window.innerWidth<=900) return mobile();
    return '<div class="fsd">'+sidebar()+'<div class="fsd-main">'+content()+'</div></div>';
  };
}
/* nach Aktionen Detail neu laden */
var _load=F.load; F.load=function(force){ if(force){ DET={}; C.tx=null; C.cn=null; C.vou={}; } return _load.apply(this,arguments); };

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
'.fsm{display:block;min-height:auto;background:#f6f6f8;margin:0;padding-bottom:110px}'+
'.fsm-head{padding:14px 16px 4px}.fsm-head h1{font-size:24px;font-weight:600;letter-spacing:-.4px;margin:0;color:#100b2d}'+
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
'@media (max-width:1250px){.fsd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fsd-detail{grid-template-columns:minmax(0,1fr)}.fsd-side{position:static}}'+
'@media (max-width:1100px){.fsd{grid-template-columns:200px minmax(0,1fr)}.fsd-vou{grid-template-columns:minmax(0,1fr)}.fsd-cats{position:static;max-height:240px}}'
);
})();
