/* Reklamationen (Wunsch Simon 26.11.2026) – Server claims.js, API /admin/api/claims.
   Ansicht im Stil von George (Erste Bank): helle Karten, viel Luft, kräftiges Blau, runde Status-Pillen, Verlauf als Zeitleiste.
   Automatisch erkannt aus neuen Mails und Website-Chats (Stichwort-Vorfilter + KI); unsichere Fälle als „Vorschläge“ zum Übernehmen.
   In der Mail-Ansicht (M.claimBar) und im Chat: „Als Reklamation anlegen“. Antworten nur als Entwurf im Verfassen-Fenster – nie automatisch senden. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, M=F.M=F.M||{};
F.icons.claim='<path d="M12 3 2.8 19a1.2 1.2 0 0 0 1 1.8h16.4a1.2 1.2 0 0 0 1-1.8L12 3z"/><path d="M12 9.5v4.5M12 17.2h.01"/>';
var ST=null, FILT="offen", Q="", CUR=null, CURD=null, loading=false, loadAt=0;
var SM={neu:["Neu","#2870ED"],pruefung:["In Prüfung","#D9822B"],printcom:["Bei Print.com","#7B61FF"],loesung:["Lösung vereinbart","#0E9AA7"],erledigt:["Erledigt","#1E9E5A"],abgelehnt:["Abgelehnt","#8A94A6"]};
var STEPS=["neu","pruefung","printcom","loesung","erledigt"];
var CAT={druck:"Druckfehler",farbe:"Farbe",format:"Format/Größe",beschaedigt:"Beschädigt",fehlt:"Fehlt/Menge",falsch:"Falsches Produkt",lieferung:"Lieferung",rechnung:"Rechnung",sonstiges:"Sonstiges"};
var RES={"":"– noch offen –",nachdruck:"Nachdruck",gutschrift:"Gutschrift",teilerstattung:"Teilerstattung",erstattung:"Erstattung",kulanz:"Kulanz/Rabatt",keine:"Keine (abgelehnt)"};
var SRC={mail:"Mail",chat:"Chat",manuell:"von Hand"};
var B="#2870ED";

F.css(
 '.rk{--rk-b:'+B+';--rk-bs:color-mix(in srgb,'+B+' 12%,transparent);display:grid;gap:18px;max-width:1180px}'+
 '.rk-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap}.rk-hd h1{font-size:28px;letter-spacing:-.02em;margin:0}.rk-hd p{margin:4px 0 0;color:var(--ink-3);font-size:14px}'+
 '.rk-hd .acts{display:flex;gap:10px;align-items:center;flex-wrap:wrap}'+
 '.rk-btn{display:inline-flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:11px 20px;font-weight:700;font-size:14.5px;cursor:pointer;background:var(--rk-b);color:#fff;box-shadow:0 6px 18px color-mix(in srgb,'+B+' 35%,transparent)}.rk-btn:hover{filter:brightness(1.06)}.rk-btn svg{width:18px;height:18px}'+
 '.rk-btn.ghost{background:var(--rk-bs);color:var(--rk-b);box-shadow:none}.rk-btn.plain{background:var(--sunk);color:var(--ink);box-shadow:none}.rk-btn.danger{background:var(--bad-soft);color:var(--bad);box-shadow:none}.rk-btn.sm{padding:7px 14px;font-size:13px}'+
 '.rk-auto{display:inline-flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-size:13px;font-weight:600;color:var(--ink-2);cursor:pointer}'+
 '.rk-auto i{width:38px;height:22px;border-radius:99px;background:var(--sunk);position:relative;border:1px solid var(--line)}.rk-auto i::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--ink-3);transition:transform .2s}'+
 '.rk-auto.on i{background:var(--rk-b);border-color:var(--rk-b)}.rk-auto.on i::after{transform:translateX(16px);background:#fff}'+
 '.rk-hero{border-radius:22px;padding:22px 24px;background:linear-gradient(135deg,'+B+' 0%,#1B5FD1 55%,#123F9C 100%);color:#fff;display:grid;grid-template-columns:auto 1fr;gap:6px 26px;align-items:center;box-shadow:0 14px 36px rgba(27,95,209,.28)}'+
 '.rk-hero .big{font-size:46px;font-weight:800;letter-spacing:-.03em;line-height:1}.rk-hero .lb{font-size:13px;opacity:.85;font-weight:600;text-transform:uppercase;letter-spacing:.06em}.rk-hero .info{font-size:14px;opacity:.92;line-height:1.5}'+
 '.rk-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}'+
 '.rk-tile{border:1px solid var(--line);background:var(--panel);border-radius:18px;padding:14px 16px;text-align:left;cursor:pointer;color:var(--ink);display:grid;gap:6px;box-shadow:0 2px 10px rgba(16,24,40,.05);transition:transform .15s,box-shadow .15s}'+
 '.rk-tile:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(16,24,40,.09)}.rk-tile b{font-size:26px;font-weight:800;letter-spacing:-.02em}.rk-tile span{font-size:12.5px;color:var(--ink-3);font-weight:600;display:flex;align-items:center;gap:7px}.rk-tile span i{width:9px;height:9px;border-radius:50%}'+
 '.rk-tile[aria-pressed=true]{border-color:var(--rk-b);box-shadow:0 0 0 3px var(--rk-bs)}'+
 '.rk-card{background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:0 2px 12px rgba(16,24,40,.05);overflow:hidden}'+
 '.rk-card>h2{font-size:16px;margin:0;padding:16px 20px 6px;display:flex;align-items:center;gap:10px}.rk-card>p.sub{margin:0;padding:0 20px 10px;color:var(--ink-3);font-size:13px}'+
 '.rk-sg{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 20px;border-top:1px solid var(--line)}.rk-sg .t b{display:block;font-size:14.5px}.rk-sg .t span{display:block;font-size:13px;color:var(--ink-2)}.rk-sg .t em{font-style:normal;font-size:12px;color:var(--ink-3)}.rk-sg .a{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}'+
 '.rk-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.rk-seg{display:inline-flex;background:var(--sunk);border-radius:999px;padding:4px}.rk-seg button{border:0;background:none;padding:8px 16px;border-radius:999px;font-weight:700;font-size:13.5px;color:var(--ink-2);cursor:pointer}.rk-seg button[aria-pressed=true]{background:var(--panel);color:var(--rk-b);box-shadow:0 2px 8px rgba(16,24,40,.08)}'+
 '.rk-q{flex:1 1 220px;min-width:0;border-radius:999px;border:1px solid var(--line);background:var(--panel);padding:10px 16px;font-size:14px;color:var(--ink)}'+
 '.rk-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:14px;align-items:center;width:100%;padding:14px 20px;border:0;border-top:1px solid var(--line);background:none;text-align:left;color:inherit;cursor:pointer}.rk-row:first-of-type{border-top:0}.rk-row:hover{background:var(--hover,var(--sunk))}'+
 '.rk-av{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:var(--rk-b);background:var(--rk-bs);flex:none}.rk-av svg{width:20px;height:20px}'+
 '.rk-row .t{min-width:0}.rk-row .t b{display:flex;gap:8px;align-items:center;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rk-row .t b small{font-weight:700;color:var(--ink-3);font-size:12px}.rk-row .t span{display:block;font-size:13.5px;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rk-row .t em{display:block;font-style:normal;font-size:12px;color:var(--ink-3);margin-top:2px}'+
 '.rk-row .r{display:grid;justify-items:end;gap:6px;font-size:12px;color:var(--ink-3)}.rk-dot{width:8px;height:8px;border-radius:50%;background:var(--rk-b);display:inline-block}'+
 '.rk-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;font-size:12.5px;font-weight:800;white-space:nowrap}.rk-pill i{width:7px;height:7px;border-radius:50%;background:currentColor}.rk-pill.lg{padding:8px 16px;font-size:14px}'+
 '.rk-due{font-weight:700}.rk-due.late{color:var(--bad)}'+
 '.rk-empty{padding:42px 20px;text-align:center;color:var(--ink-3);font-size:14.5px;display:grid;gap:8px;justify-items:center}.rk-empty svg{width:42px;height:42px;color:var(--rk-b);opacity:.7}'+
 /* Detail (Seitenleiste) */
 '.rkd{display:grid;gap:16px;--rk-b:'+B+';--rk-bs:color-mix(in srgb,'+B+' 12%,transparent)}.rkd-top{display:flex;align-items:flex-start;gap:12px}.rkd-top .t{flex:1;min-width:0}.rkd-top .t small{color:var(--ink-3);font-weight:700;font-size:12.5px}.rkd-top h2{font-size:20px;margin:2px 0 8px;line-height:1.25}'+
 '.rkd-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin:4px 0}.rkd-steps div{display:grid;gap:6px;justify-items:center;text-align:center;font-size:11px;font-weight:700;color:var(--ink-3)}.rkd-steps div i{height:6px;width:100%;border-radius:99px;background:var(--sunk)}.rkd-steps div.on{color:var(--rk-b)}.rkd-steps div.on i{background:var(--rk-b)}'+
 '.rkd-box{border:1px solid var(--line);border-radius:16px;padding:14px 16px;background:var(--panel-2,var(--sunk));display:grid;gap:10px}.rkd-box h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin:0}'+
 '.rkd-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}.rkd-grid div{min-width:0}.rkd-grid small{display:block;color:var(--ink-3);font-size:11.5px;font-weight:700}.rkd-grid span{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis}'+
 '.rkd-acts{display:flex;gap:8px;flex-wrap:wrap}.rkd-prob{font-size:14.5px;line-height:1.5;white-space:pre-wrap}'+
 '.rkd-att{display:flex;gap:8px;flex-wrap:wrap}.rkd-att a{display:flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:12px;padding:6px 10px;font-size:12.5px;color:var(--ink);text-decoration:none;background:var(--panel);max-width:100%}.rkd-att a img{width:84px;height:84px;object-fit:cover;border-radius:8px;display:block}.rkd-att a.img{padding:3px}'+
 '.rkd-tl{display:grid;gap:0;position:relative;margin-left:6px}.rkd-tl>div{position:relative;padding:0 0 14px 22px;border-left:2px solid var(--line)}.rkd-tl>div:last-child{border-left-color:transparent}.rkd-tl>div::before{content:"";position:absolute;left:-7px;top:2px;width:12px;height:12px;border-radius:50%;background:var(--panel);border:2px solid var(--rk-b)}'+
 '.rkd-tl>div.auto::before{border-color:#7B61FF}.rkd-tl>div.note::before{background:var(--rk-b)}.rkd-tl b{display:block;font-size:13.5px;font-weight:600;white-space:pre-wrap}.rkd-tl small{color:var(--ink-3);font-size:11.5px}.rkd-tl button{margin-top:4px}'+
 '.rkd textarea,.rkd input,.rkd select{width:100%;border-radius:12px}.rkd-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}'+
 '.rkd-ord{display:grid;gap:4px;font-size:13.5px}.rkd-ord b{font-size:14px}'+
 /* Leiste in der Mail */
 '.rk-mb{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0;padding:8px 12px;border-radius:14px;background:color-mix(in srgb,'+B+' 9%,transparent);font-size:13px;color:var(--ink-2)}.rk-mb b{color:'+B+'}.rk-mb .rk-btn{padding:6px 12px;font-size:12.5px}'+
 '@media (max-width:1000px){.rk-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}'+
 '@media (max-width:640px){.rk-hero{grid-template-columns:1fr}.rk-hero .big{font-size:38px}.rk-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.rk-row{grid-template-columns:40px minmax(0,1fr);padding:12px 14px}.rk-row .r{grid-column:2;justify-items:start;grid-auto-flow:column;justify-content:start;align-items:center}.rk-sg{grid-template-columns:40px minmax(0,1fr);padding:12px 14px}.rk-sg .a{grid-column:1/-1;justify-content:flex-start}.rkd-grid{grid-template-columns:1fr}.rkd-steps div{font-size:10px}}'
);

function api(body){ return F.api("/admin/api/claims",{body:Object.assign({confirm:true},body)}); }
function load(force){
  if(loading||(!force&&ST&&Date.now()-loadAt<20000)) return Promise.resolve(ST);
  loading=true; return F.api("/admin/api/claims").then(function(j){ loading=false; loadAt=Date.now(); if(j&&j.ok){ ST=j; paint(); } return ST; }).catch(function(){ loading=false; return ST; });
}
function setST(j){ if(j&&j.ok!==false&&j.claims){ ST=j; loadAt=Date.now(); } }
function paint(){ if(F.current==="reklamationen") F.render(); else F.renderNav(); }
function pill(s,lg){ var m=SM[s]||["?","#888"]; return '<span class="rk-pill'+(lg?" lg":"")+'" style="color:'+m[1]+';background:color-mix(in srgb,'+m[1]+' 14%,transparent)"><i></i>'+esc(m[0])+'</span>'; }
function fd(iso){ if(!iso) return ""; var d=new Date(iso); if(isNaN(d)) return ""; return d.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit",year:"2-digit"}); }
function fdt(iso){ var d=new Date(iso); if(isNaN(d)) return ""; return d.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); }
function today(){ return new Date().toISOString().slice(0,10); }
function isOpen(c){ return ["neu","pruefung","printcom","loesung"].indexOf(c.status)>-1; }
function initials(c){ var n=(c.customer&&(c.customer.name||c.customer.email))||"?"; return n.split(/[\s@.]+/).filter(Boolean).slice(0,2).map(function(x){ return x[0].toUpperCase(); }).join(""); }
function dueHtml(c){ if(!c.due||!isOpen(c)) return ""; var late=c.due<today(); return '<span class="rk-due'+(late?" late":"")+'">'+(late?"überfällig seit ":"Frist ")+esc(fd(c.due+"T12:00:00"))+'</span>'; }

function render(){
  if(!ST){ load(true); return '<div class="rk"><div class="rk-card"><div class="rk-empty">Lade Reklamationen …</div></div></div>'; }
  var cs=ST.claims||[], c=ST.counts||{}, q=Q.trim().toLowerCase();
  var list=cs.filter(function(x){ return FILT==="alle"?true:FILT==="offen"?isOpen(x):FILT==="zu"?!isOpen(x):x.status===FILT; })
    .filter(function(x){ return !q||[x.no,x.title,x.problem,x.customer&&x.customer.name,x.customer&&x.customer.email,x.orderNr,x.invoiceNr].join(" ").toLowerCase().indexOf(q)>-1; });
  var late=cs.filter(function(x){ return isOpen(x)&&x.due&&x.due<today(); }).length;
  var h='<div class="rk">'+
    '<div class="rk-hd"><div><h1>Reklamationen</h1><p>Beanstandungen an einem Ort – aus Mails und Chats automatisch erkannt.</p></div><div class="acts">'+
      '<button type="button" class="rk-auto'+(ST.auto?" on":"")+'" data-act="rkauto" title="Neue Mails und Chats automatisch prüfen"><i></i>Automatisch erkennen'+(ST.ki?"":" (KI aus)")+'</button>'+
      '<button type="button" class="rk-btn" data-act="rknew">'+F.svg("plus")+'Neue Reklamation</button></div></div>'+
    '<div class="rk-hero"><div><div class="lb">Offen</div><div class="big">'+(ST.open||0)+'</div></div><div class="info">'+
      (ST.fresh?'<b>'+ST.fresh+' neu</b> – noch nicht angesehen. ':'Keine neuen Fälle. ')+(late?'<b>'+late+' über der Frist.</b> ':'')+
      ((ST.sugg||[]).length?(ST.sugg.length+' mögliche Reklamation'+(ST.sugg.length===1?"":"en")+' zum Prüfen. '):'')+
      '<br><span style="opacity:.8">'+(ST.scanning?'Suche in den letzten 30 Tagen läuft …':ST.scanned?'Zuletzt durchsucht: '+esc(fdt(ST.scanned)):'')+'</span></div></div>'+
    '<div class="rk-tiles">'+["neu","pruefung","printcom","loesung","erledigt","abgelehnt"].map(function(s){ return '<button type="button" class="rk-tile" data-act="rkf:'+s+'" aria-pressed="'+(FILT===s)+'"><b>'+(c[s]||0)+'</b><span><i style="background:'+SM[s][1]+'"></i>'+esc(SM[s][0])+'</span></button>'; }).join("")+'</div>';
  if((ST.sugg||[]).length) h+='<div class="rk-card"><h2>'+F.svg("spark")+'Mögliche Reklamationen</h2><p class="sub">Von der KI gefunden, aber nicht sicher genug für automatisches Anlegen. Übernehmen oder verwerfen.</p>'+
    ST.sugg.slice(0,12).map(function(s){ var who=s.mail?(s.mail.fromName||s.mail.from):(s.chat&&s.chat.name)||"Chat";
      return '<div class="rk-sg"><span class="rk-av">'+(s.kind==="chat"?F.svg("chat"):F.svg("post"))+'</span><div class="t"><b>'+esc(who)+(s.orderNr?' · '+esc(s.orderNr):'')+'</b><span>'+esc(s.problem||(s.mail&&s.mail.subject)||"")+'</span><em>'+esc((s.kind==="chat"?"Chat":"Mail")+(s.mail?" · „"+s.mail.subject+"“":"")+" · Sicherheit "+Math.round((s.confidence||0)*100)+" %"+(s.reason?" · "+s.reason:""))+'</em></div>'+
        '<div class="a">'+(s.mail?'<button type="button" class="rk-btn plain sm" data-act="rksgopen:'+esc(s.key)+'">Mail</button>':'<button type="button" class="rk-btn plain sm" data-act="rksgopen:'+esc(s.key)+'">Chat</button>')+'<button type="button" class="rk-btn ghost sm" data-act="rksgno:'+esc(s.key)+'">Verwerfen</button><button type="button" class="rk-btn sm" data-act="rksgok:'+esc(s.key)+'">Übernehmen</button></div></div>'; }).join("")+'</div>';
  h+='<div class="rk-bar"><div class="rk-seg" role="group" aria-label="Filter">'+[["offen","Offen"],["alle","Alle"],["zu","Abgeschlossen"]].map(function(o){ return '<button type="button" data-act="rkf:'+o[0]+'" aria-pressed="'+(FILT===o[0])+'">'+o[1]+'</button>'; }).join("")+'</div>'+
    '<input class="rk-q" id="rkQ" type="search" placeholder="Suchen: Kunde, Bestellung, Problem …" value="'+esc(Q)+'" data-keepfocus="1">'+
    '<button type="button" class="rk-btn plain sm" data-act="rkscan" title="Mails und Chats der letzten 30 Tage nach Reklamationen durchsuchen">Letzte 30 Tage durchsuchen</button></div>';
  h+='<div class="rk-card">'+(list.length?list.map(row).join(""):'<div class="rk-empty">'+F.svg("claim")+'<b>'+(cs.length?"Keine Reklamationen in dieser Ansicht.":"Noch keine Reklamationen.")+'</b><span>'+(cs.length?"Filter ändern oder Suche leeren.":"Neue Fälle aus Mails und Chats erscheinen hier automatisch.")+'</span></div>')+'</div>';
  return h+'</div>';
}
function row(c){
  var cu=c.customer||{};
  return '<button type="button" class="rk-row" data-act="rkopen:'+esc(c.id)+'"><span class="rk-av">'+esc(initials(c))+'</span><span class="t"><b>'+(c.unseen?'<span class="rk-dot" aria-label="neu"></span>':'')+esc(cu.name||cu.email||"Unbekannt")+' <small>'+esc(c.no)+'</small></b><span>'+esc(c.problem||c.title||"")+'</span>'+
    '<em>'+esc([CAT[c.category]||"",c.orderNr,c.invoiceNr,SRC[c.source]+(c.auto?" (automatisch)":""),c.resolution?RES[c.resolution]+(c.amount?" "+F.eur(c.amount):""):""].filter(Boolean).join(" · "))+'</em></span>'+
    '<span class="r">'+pill(c.status)+'<span>'+esc(fd(c.created))+'</span>'+dueHtml(c)+'</span></button>';
}

/* ── Detail ── */
function openClaim(id){ CUR=id; F.api("/admin/api/claims?id="+encodeURIComponent(id)).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } CURD=j; drawer(); var s=ST&&(ST.claims||[]).find(function(x){ return x.id===id; }); if(s&&s.unseen){ s.unseen=false; paint(); } }); }
function drawer(){ if(!CURD) return; F.openDrawer(detail(CURD),function(){ if(CUR) openClaim(CUR); }); }
function detail(j){
  var c=j.claim, cu=c.customer||{}, si=STEPS.indexOf(c.status), o=(j.orders||[])[0];
  var next={neu:["pruefung","In Prüfung nehmen"],pruefung:["printcom","Bei Print.com reklamiert"],printcom:["loesung","Lösung vereinbart"],loesung:["erledigt","Als erledigt abschließen"]}[c.status];
  var atts=[]; (c.mails||[]).forEach(function(m){ (m.atts||[]).forEach(function(a){ atts.push({m:m,a:a}); }); });
  var h='<div class="rkd"><div class="rkd-top"><div class="t"><small>'+esc(c.no)+' · '+esc(SRC[c.source]||"")+(c.auto?" · automatisch erkannt":"")+' · '+esc(fdt(c.created))+'</small><h2>'+esc(c.title||"Reklamation")+'</h2>'+pill(c.status,true)+(c.resolution?' <span class="rk-pill lg" style="color:var(--ink-2);background:var(--sunk)">'+esc(RES[c.resolution])+(c.amount?" · "+F.eur(c.amount):"")+'</span>':'')+'</div><button type="button" class="btn icon" data-close aria-label="Schließen">'+F.svg("close")+'</button></div>'+
    (c.status!=="abgelehnt"?'<div class="rkd-steps">'+STEPS.map(function(s,i){ return '<div class="'+(i<=si?"on":"")+'"><i></i>'+esc(SM[s][0])+'</div>'; }).join("")+'</div>':'')+
    '<div class="rkd-acts">'+(next?'<button type="button" class="rk-btn" data-act="rkst:'+next[0]+'">'+esc(next[1])+'</button>':'')+
      '<button type="button" class="rk-btn ghost" data-act="rkreply">'+F.svg("post")+'Antwort-Entwurf</button>'+
      (isOpen(c)?'<button type="button" class="rk-btn plain" data-act="rkst:abgelehnt">Ablehnen</button>':'<button type="button" class="rk-btn plain" data-act="rkst:pruefung">Wieder öffnen</button>')+'</div>'+
    '<div class="rkd-box"><h3>Problem</h3><div class="rkd-prob">'+esc(c.problem||"– noch nicht beschrieben –")+'</div>'+(c.reason&&c.auto?'<small class="muted">KI: '+esc(c.reason)+'</small>':'')+'</div>'+
    '<div class="rkd-box"><h3>Details</h3><div class="rkd-grid">'+
      '<div><small>Kunde</small><span>'+esc(cu.name||"–")+'</span></div><div><small>E-Mail</small><span>'+(cu.email?'<a href="mailto:'+esc(cu.email)+'" data-act="rkmailto">'+esc(cu.email)+'</a>':'–')+'</span></div>'+
      '<div><small>Telefon</small><span>'+esc(cu.phone||"–")+'</span></div><div><small>Kategorie</small><span>'+esc(CAT[c.category]||"–")+'</span></div>'+
      '<div><small>Bestellung</small><span>'+esc(c.orderNr||"–")+'</span></div><div><small>Rechnung</small><span>'+esc(c.invoiceNr||"–")+'</span></div>'+
      '<div><small>Frist</small><span>'+(c.due?esc(fd(c.due+"T12:00:00"))+(isOpen(c)&&c.due<today()?' <b style="color:var(--bad)">überfällig</b>':''):'–')+'</span></div><div><small>Print.com-Fall</small><span>'+esc(c.pcRef||"–")+'</span></div></div>'+
      '<div class="rkd-acts"><button type="button" class="rk-btn plain sm" data-act="rkedit">Bearbeiten</button></div></div>';
  if(o) h+='<div class="rkd-box"><h3>Bestellung im Druckshop</h3><div class="rkd-ord"><b>'+esc(o.nr||"")+' · '+esc(o.product||"")+(o.copies?' · '+esc(String(o.copies))+' Stk.':'')+'</b><span>'+esc(o.statusText||o.status||"")+(o.pcOrder?' · Print.com '+esc(o.pcOrder):'')+(o.gross!=null?' · '+F.eur(o.gross):'')+'</span>'+
    (o.progress&&o.progress.track&&o.progress.track.url?'<span><a href="'+esc(o.progress.track.url)+'" target="_blank" rel="noopener">Sendungsverfolgung</a></span>':'')+
    (o.paymentStatus?'<span class="muted small">Zahlung: '+esc(o.payment||"")+' · '+esc(o.paymentStatus)+' – Erstattungen nur in Mollie bzw. per Gutschrift selbst auslösen.</span>':'')+
    '</div><div class="rkd-acts"><button type="button" class="rk-btn plain sm" data-act="rkord:'+esc(o.id)+'">Bestellung öffnen</button></div></div>';
  if(atts.length) h+='<div class="rkd-box"><h3>Fotos & Anhänge</h3><div class="rkd-att">'+atts.map(function(x){ var u=M.attHref?M.attHref(x.m,x.a):"#", img=/^image\//i.test(x.a.contentType||"");
    return '<a class="'+(img?"img":"")+'" href="'+esc(u)+'" target="_blank" rel="noopener" title="'+esc(x.a.filename)+'">'+(img?'<img src="'+esc(u)+'" alt="'+esc(x.a.filename)+'" loading="lazy">':F.svg("clip")+esc(x.a.filename))+'</a>'; }).join("")+'</div></div>';
  h+='<div class="rkd-box"><h3>Verknüpft</h3><div class="rkd-acts">'+(c.mails||[]).map(function(m){ return '<button type="button" class="rk-btn plain sm" data-act="rkmail:'+esc(m.id)+'" title="'+esc(m.subject)+'">'+F.svg("post")+esc(fd(m.date))+' '+esc((m.subject||"Mail").slice(0,34))+'</button>'; }).join("")+
    (c.chats||[]).map(function(x){ return '<button type="button" class="rk-btn plain sm" data-act="rkchatopen:'+esc(x.convId)+'">'+F.svg("chat")+esc(x.name||"Chat")+'</button>'; }).join("")+((c.mails||[]).length+(c.chats||[]).length?'':'<span class="muted small">Keine Mails oder Chats verknüpft.</span>')+'</div></div>';
  h+='<div class="rkd-box"><h3>Notiz</h3><form data-form="rknote" class="stackf" style="display:grid;gap:8px"><textarea class="f" name="text" rows="2" placeholder="z. B. Fotos angefordert, mit Print.com telefoniert …"></textarea><div class="rkd-acts"><button class="rk-btn sm" type="submit">Notiz speichern</button></div></form></div>'+
    '<div class="rkd-box"><h3>Verlauf</h3><div class="rkd-tl">'+(c.timeline||[]).slice().reverse().map(function(e){ return '<div class="'+(e.by==="auto"?"auto":"")+(e.kind==="note"?" note":"")+'"><b>'+esc(e.text)+'</b><small>'+esc(fdt(e.at))+(e.by==="auto"?" · automatisch":"")+'</small>'+(e.mailId?'<br><button type="button" class="rk-btn plain sm" data-act="rkmail:'+esc(e.mailId)+'">Mail öffnen</button>':'')+'</div>'; }).join("")+'</div></div>'+
    '<div class="rkd-acts" style="justify-content:flex-end"><button type="button" class="rk-btn danger sm" data-act="rkdel">Reklamation löschen</button></div></div>';
  return h;
}
function upd(j,msg){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } setST(j); if(msg) F.toast(msg); if(CUR) openClaim(CUR); paint(); }
F.action("rkopen",function(id){ openClaim(id); });
F.action("rkf",function(v){ FILT=v; F.render(); });
F.listen("input","#rkQ",function(el){ Q=el.value; clearTimeout(F._rkT); F._rkT=setTimeout(function(){ F.render(); },180); });
F.action("rkauto",function(){ api({op:"settings",auto:!ST.auto}).then(function(j){ setST(j); F.toast(ST.auto?"Automatische Erkennung an":"Automatische Erkennung aus"); paint(); }); });
F.action("rkscan",function(){ api({op:"scan"}).then(function(j){ setST(j); if(ST) ST.scanning=true; F.toast("Suche läuft – Vorschläge erscheinen gleich oben"); paint(); setTimeout(function(){ load(true); },25000); setTimeout(function(){ load(true); },70000); }); });
F.action("rkst",function(s){
  var c=CURD&&CURD.claim; if(!c) return;
  if(s==="loesung"||s==="erledigt"&&!c.resolution){
    F.modal('<form data-form="rkres" class="stackf"><div class="row-between"><h2 style="font-size:19px">'+(s==="loesung"?"Lösung vereinbart":"Abschließen")+'</h2>'+F.btnClose()+'</div><input type="hidden" name="status" value="'+s+'">'+
      '<label class="fl">Lösung<select class="f" name="resolution">'+Object.keys(RES).filter(function(k){ return k; }).map(function(k){ return '<option value="'+k+'"'+(k===c.resolution?" selected":"")+'>'+esc(RES[k])+'</option>'; }).join("")+'</select></label>'+
      '<label class="fl">Betrag (€, optional)<input class="f" name="amount" inputmode="decimal" value="'+(c.amount||"")+'"></label><label class="fl">Notiz<textarea class="f" name="note" rows="2"></textarea></label>'+
      '<p class="muted small" style="margin:0">Gutschrift, Erstattung oder Nachdruck löst du selbst aus (Rechnungen, Mollie, Druck) – hier wird nur der Stand festgehalten.</p>'+
      '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Speichern</button></span></div></form>',"narrow"); return; }
  if(s==="abgelehnt"){ F.confirm("Reklamation ablehnen? Der Kunde wird nicht automatisch informiert.","Ablehnen",function(){ api({op:"status",id:c.id,status:"abgelehnt",resolution:"keine"}).then(function(j){ upd(j,"Abgelehnt"); }); },true); return; }
  api({op:"status",id:c.id,status:s}).then(function(j){ upd(j,"Status: "+SM[s][0]); });
});
F.form("rkres",function(f){ var c=CURD&&CURD.claim; if(!c) return; var a=String(f.amount.value||"").replace(",",".");
  api({op:"status",id:c.id,status:f.status.value,resolution:f.resolution.value,amount:a?+a:0,note:f.note.value}).then(function(j){ F.closeModal(); upd(j,"Gespeichert"); }); });
F.form("rknote",function(f){ var c=CURD&&CURD.claim, t=f.text.value.trim(); if(!c||!t) return; api({op:"note",id:c.id,text:t}).then(function(j){ upd(j,"Notiz gespeichert"); }); });
F.action("rkdel",function(){ var c=CURD&&CURD.claim; if(!c) return; F.confirm("Reklamation "+c.no+" löschen? Mails und Chats bleiben erhalten.","Löschen",function(){ api({op:"delete",id:c.id}).then(function(j){ CUR=null; CURD=null; F.closeDrawer(); upd(j,"Gelöscht"); }); },true); });
F.action("rkord",function(id){ F.closeDrawer(); if(F.actions.prord) F.actions.prord(id); });
F.action("rkmail",function(id){ var m=M.find&&M.find(id); if(!m){ F.toast("Mail ist im geladenen Postfach nicht (mehr) vorhanden – evtl. verschoben oder älter.",true); return; } F.closeDrawer(); M.open(id,{fromOutside:true}); });
F.action("rkchatopen",function(id){ F.closeDrawer(); F.go("chat"); setTimeout(function(){ if(F.actions.chopen) F.actions.chopen(id); },400); });
F.action("rkmailto",function(){ F.actions.rkreply(); });
/* Bearbeiten */
F.action("rkedit",function(){ var c=CURD&&CURD.claim; if(!c) return; var cu=c.customer||{};
  F.modal('<form data-form="rkedit" class="stackf"><div class="row-between"><h2 style="font-size:19px">Reklamation '+esc(c.no)+' bearbeiten</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Titel<input class="f" name="title" value="'+esc(c.title||"")+'"></label><label class="fl">Problem<textarea class="f" name="problem" rows="3">'+esc(c.problem||"")+'</textarea></label>'+
    '<div class="grid2"><label class="fl">Kategorie<select class="f" name="category">'+Object.keys(CAT).map(function(k){ return '<option value="'+k+'"'+(k===c.category?" selected":"")+'>'+esc(CAT[k])+'</option>'; }).join("")+'</select></label><label class="fl">Frist<input class="f" type="date" name="due" value="'+esc(c.due||"")+'"></label>'+
    '<label class="fl">Kunde<input class="f" name="name" value="'+esc(cu.name||"")+'"></label><label class="fl">E-Mail<input class="f" type="email" name="email" value="'+esc(cu.email||"")+'"></label>'+
    '<label class="fl">Telefon<input class="f" name="phone" value="'+esc(cu.phone||"")+'"></label><label class="fl">Bestellnummer<input class="f" name="orderNr" placeholder="D-261124-ABCD" value="'+esc(c.orderNr||"")+'"></label>'+
    '<label class="fl">Rechnung<input class="f" name="invoiceNr" placeholder="RE-1234" value="'+esc(c.invoiceNr||"")+'"></label><label class="fl">Print.com-Fall<input class="f" name="pcRef" value="'+esc(c.pcRef||"")+'"></label></div>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Speichern</button></span></div></form>',"wide"); });
F.form("rkedit",function(f){ var c=CURD&&CURD.claim; if(!c) return;
  api({op:"update",id:c.id,fields:{title:f.title.value,problem:f.problem.value,category:f.category.value,due:f.due.value,orderNr:f.orderNr.value,invoiceNr:f.invoiceNr.value,pcRef:f.pcRef.value,customer:{name:f.name.value,email:f.email.value,phone:f.phone.value}}}).then(function(j){ F.closeModal(); upd(j,"Gespeichert"); }); });
/* Neu von Hand */
F.action("rknew",function(){
  F.modal('<form data-form="rknew" class="stackf"><div class="row-between"><h2 style="font-size:19px">Neue Reklamation</h2>'+F.btnClose()+'</div>'+
    '<div class="grid2"><label class="fl">Kunde<input class="f" name="name" required autofocus></label><label class="fl">E-Mail<input class="f" type="email" name="email"></label><label class="fl">Telefon<input class="f" name="phone"></label>'+
    '<label class="fl">Kategorie<select class="f" name="category">'+Object.keys(CAT).map(function(k){ return '<option value="'+k+'">'+esc(CAT[k])+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Bestellnummer<input class="f" name="orderNr" placeholder="D-261124-ABCD"></label><label class="fl">Rechnung<input class="f" name="invoiceNr" placeholder="RE-1234"></label></div>'+
    '<label class="fl">Problem<textarea class="f" name="problem" rows="3" required></textarea></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Anlegen</button></span></div></form>',"wide"); });
F.form("rknew",function(f){ api({op:"create",problem:f.problem.value,category:f.category.value,orderNr:f.orderNr.value,invoiceNr:f.invoiceNr.value,customer:{name:f.name.value,email:f.email.value,phone:f.phone.value}}).then(function(j){ F.closeModal(); if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } setST(j); paint(); if(j.id) openClaim(j.id); F.toast("Reklamation angelegt"); }); });
/* Vorschläge */
F.action("rksgok",function(k){ api({op:"accept",key:k}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } setST(j); paint(); F.toast("Übernommen"); if(j.id) openClaim(j.id); }); });
F.action("rksgno",function(k){ api({op:"discard",key:k}).then(function(j){ setST(j); paint(); F.toast("Verworfen"); }); });
F.action("rksgopen",function(k){ var s=ST&&(ST.sugg||[]).find(function(x){ return x.key===k; }); if(!s) return; if(s.mail) F.actions.rkmail(s.mail.id); else if(s.chat) F.actions.rkchatopen(s.chat.convId); });

/* Antwort-Entwurf: nur das Verfassen-Fenster öffnen – gesendet wird nur, wenn du selbst auf Senden klickst */
function salut(cu){ var n=(cu&&cu.name)||""; return n&&!/@/.test(n)?"Guten Tag "+n+",":"Guten Tag,"; }
function draftText(c){
  var ord=c.orderNr?" zu Ihrer Bestellung "+c.orderNr:"", p=[];
  p.push(salut(c.customer));
  if(c.status==="loesung"||c.status==="erledigt"){
    p.push("vielen Dank für Ihre Geduld. Wir haben eine Lösung"+ord+":");
    p.push(c.resolution==="nachdruck"?"Wir drucken Ihre Bestellung kostenlos neu. Sobald der Nachdruck unterwegs ist, erhalten Sie die Sendungsverfolgung – die Lieferung erfolgt voraussichtlich in den nächsten Werktagen.":
      c.resolution==="gutschrift"?"Wir stellen Ihnen eine Gutschrift"+(c.amount?" über "+F.eur(c.amount):"")+" aus.":
      c.resolution==="teilerstattung"||c.resolution==="erstattung"?"Wir erstatten Ihnen"+(c.amount?" "+F.eur(c.amount):" den Betrag")+" auf dem ursprünglichen Zahlungsweg.":
      c.resolution==="kulanz"?"Als kleines Dankeschön für Ihr Verständnis kommen wir Ihnen bei der nächsten Bestellung entgegen.":"[Lösung beschreiben]");
  } else if(c.status==="printcom"){
    p.push("vielen Dank für Ihre Rückmeldung"+ord+". Wir haben den Fall bereits an unsere Druckerei weitergegeben und melden uns, sobald wir eine Rückmeldung haben.");
  } else if(c.status==="abgelehnt"){
    p.push("vielen Dank für Ihre Nachricht"+ord+". Wir haben uns die Sache genau angesehen: [Begründung].");
  } else {
    p.push("vielen Dank für Ihre Nachricht"+ord+" – und entschuldigen Sie bitte die Unannehmlichkeiten.");
    p.push("Wir sehen uns das sofort an und melden uns so rasch wie möglich mit einer Lösung. Falls noch nicht geschehen, schicken Sie uns bitte ein paar Fotos, auf denen das Problem gut zu sehen ist – damit geht es am schnellsten.");
  }
  return p;
}
F.action("rkreply",function(){
  var c=CURD&&CURD.claim; if(!c) return;
  if(!M.openCompose){ F.toast("Postfach ist noch nicht geladen",true); return; }
  var ms=(c.mails||[]).slice().sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); }), last=ms[0], m=last&&M.find&&M.find(last.id);
  var html=draftText(c).map(function(t){ return "<div>"+esc(t)+"</div><div><br></div>"; }).join("");
  var to=(m&&(m.replyTo||m.from))||(last&&last.from)||(c.customer&&c.customer.email)||"";
  var subj=last?("Re: "+String(last.subject||"").replace(/^((re|aw|wg|fw|fwd)\s*:\s*)+/i,"")):("Ihre Reklamation "+c.no+(c.orderNr?" – Bestellung "+c.orderNr:""));
  var q=last?'<div><br></div><div class="qh">Am '+esc(fdt(last.date))+' schrieb '+esc(last.fromName||last.from)+':</div><blockquote type="cite">'+esc(last.text||"").replace(/\n/g,"<br>")+'</blockquote>':"";
  F.closeDrawer();
  M.openCompose("Antworten",to,subj,html+q,{inReplyTo:(last&&last.messageId)||"",account:(m&&M.accOf?M.accOf(m):last&&last.account)||undefined});
  api({op:"draftlog",id:c.id}); F.toast("Entwurf geöffnet – prüfen und selbst senden");
});

/* ── Mail-Ansicht: Leiste „Reklamation“ (post.js ruft M.claimBar) ── */
function claimOfMail(m){ if(!ST||!m) return null; return (ST.claims||[]).find(function(c){ return (c.mailIds||[]).indexOf(m.id)>-1||(m.messageId&&(c.msgIds||[]).indexOf(m.messageId)>-1)||(m.inReplyTo&&(c.msgIds||[]).indexOf(m.inReplyTo)>-1); }); }
M.claimBar=function(m){
  if(!m||(M.isSent&&M.isSent(m))) return "";
  var c=claimOfMail(m);
  if(c) return '<div class="rk-mb">'+F.svg("claim")+'<span>Gehört zu Reklamation <b>'+esc(c.no)+'</b></span>'+pill(c.status)+'<button type="button" class="rk-btn sm" data-act="rkgo:'+esc(c.id)+'">Öffnen</button></div>';
  return '<div class="rk-mb" style="background:none;padding:0"><button type="button" class="rk-btn ghost sm" data-act="rkfrommail:'+esc(m.id)+'">'+F.svg("claim")+'Als Reklamation anlegen</button></div>';
};
F.action("rkgo",function(id){ F.go("reklamationen"); openClaim(id); });
F.action("rkfrommail",function(id){
  var m=M.find&&M.find(id); if(!m) return; F.toast("Lege Reklamation an …");
  var mail={id:m.id,messageId:m.messageId||"",inReplyTo:m.inReplyTo||"",account:m.account||"",folder:m.folder||"INBOX",uid:m.uid,subject:m.subject||"",from:m.from||"",fromName:m.fromName||"",date:m.date||"",attachments:m.attachments||[],body:String(m.body||m.preview||"").slice(0,60000),bodyHtml:!!m.bodyHtml};
  api({op:"create",mail:mail}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } setST(j); F.toast(j.added?"An bestehende Reklamation angehängt":"Reklamation angelegt"); F.go("reklamationen"); if(j.id) openClaim(j.id); });
});
/* Chat: Knopf im Kopf der Unterhaltung (zchat.js ruft F.actions.rkfromchat) */
F.claimOfConv=function(id){ return ST&&(ST.claims||[]).find(function(c){ return (c.convIds||[]).indexOf(id)>-1; }); };
F.action("rkfromchat",function(){
  var id=F.chatSel&&F.chatSel(); if(!id) return; var ex=F.claimOfConv(id); if(ex){ F.actions.rkgo(ex.id); return; }
  F.toast("Lege Reklamation an …");
  api({op:"create",convId:id}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return; } setST(j); F.toast("Reklamation angelegt"); F.go("reklamationen"); if(j.id) openClaim(j.id); });
});

/* Stand regelmäßig holen (Zähler in der Navigation, Leiste in Mails) */
setTimeout(function(){ load(true); },3500);
setInterval(function(){ if(!document.hidden) load(true); },120000);
F.feed(function(){ if(!ST) return []; var out=[];
  if(ST.fresh) out.push({id:"rk-new-"+ST.fresh,rank:1,sev:"warn",icon:"claim",tag:["warn","Reklamation"],t:ST.fresh+(ST.fresh===1?" neue Reklamation":" neue Reklamationen"),d:(ST.claims||[]).filter(function(c){ return c.status==="neu"; }).slice(0,3).map(function(c){ return (c.customer&&c.customer.name)||c.no; }).join(", "),acts:[["Ansehen","go:reklamationen","primary"]]});
  if((ST.sugg||[]).length) out.push({id:"rk-sugg-"+ST.sugg.length,rank:3,sev:"info",icon:"claim",tag:["info","Reklamation"],t:ST.sugg.length+" mögliche Reklamation"+(ST.sugg.length===1?"":"en")+" zum Prüfen",d:"Von der KI in Mails/Chats gefunden.",acts:[["Prüfen","go:reklamationen","primary"]]});
  return out; });
F.view({id:"reklamationen",label:"Reklamationen",short:"Reklam.",icon:"claim",order:37,count:function(){ return ST?(ST.fresh||0)+((ST.sugg||[]).length||0):0; },render:render,after:function(){ load(false); }});
})();
