/* Handy-Stil für alle Seiten (wie die Outlook-App): fixierte Kopfzeile mit Titel, Haupt-Aktion als blauer Knopf unten rechts,
   weitere Aktionen hinter „⋯“, Reiter als wischbare Chips, Dialoge als Blatt von unten, „Mehr“ als App-Raster.
   Postfach und Kalender haben eigene Kopfzeilen (post.js, kalm.js) und werden hier ausgenommen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
function mob(){ return window.innerWidth<=900; }
var OWN={post:1,kal:1};          // Seiten mit eigener Handy-Kopfzeile

/* ---------- Kopfzeile: F.head liefert zusätzlich die Handy-Variante ---------- */
var MH={items:[]};
var _head=F.head;
F.head=function(t,sub,right){
  var desk=_head.apply(this,arguments);
  if(OWN[F.current]) return desk;
  var tpl=document.createElement("template"); tpl.innerHTML=right||"";
  var els=Array.prototype.slice.call(tpl.content.querySelectorAll("button,a")).filter(function(b){ return b.hasAttribute("data-act")||b.hasAttribute("data-go")||b.hasAttribute("href"); });
  var pri=els.filter(function(b){ return /\bprimary\b/.test(b.className); })[0]||null;
  var rest=els.filter(function(b){ return b!==pri; });
  MH.items=rest.map(function(b){ var lbl=(b.getAttribute("aria-label")||b.getAttribute("title")||b.textContent||"").replace(/\s+/g," ").trim(); return {html:b.outerHTML,label:lbl||"Aktion"}; });
  var subTxt=String(sub||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
  var fab="";
  if(pri){ var c=pri.cloneNode(true); c.className="mfabx"; c.removeAttribute("style"); var lab=c.textContent.replace(/\s+/g," ").trim(); c.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>'+esc(lab.replace(/^\+\s*/,""))+'</span>'; fab=c.outerHTML; }
  return desk+'<div class="mh"><div class="mh-t"><b>'+t+'</b>'+(subTxt?'<span>'+esc(subTxt)+'</span>':'')+'</div>'+
    (MH.items.length?'<button type="button" class="mh-i" data-act="mhmore" aria-label="Weitere Aktionen">'+F.svg("more")+'</button>':'')+'</div>'+fab;
};
F.action("mhmore",function(){
  if(!MH.items.length) return;
  F.modal('<div class="msheet-t">Aktionen</div><div class="msheet-l">'+MH.items.map(function(it,i){ return '<button type="button" data-act="mhdo:'+i+'">'+esc(it.label)+'</button>'; }).join("")+'</div><button type="button" class="msheet-x" data-closemodal>Abbrechen</button>',"msheet");
});
/* Original-Knopf kurz nachbauen und anklicken – so laufen Aktionen, Navigation und Links wie am Desktop */
F.action("mhdo",function(i){
  var it=MH.items[+i]; F.closeModal(); if(!it) return;
  var host=document.createElement("div"); host.style.display="none"; host.innerHTML=it.html; document.body.appendChild(host);
  var el=host.firstElementChild; setTimeout(function(){ if(el) el.click(); host.remove(); },0);
});

/* ---------- „Mehr“ als App-Raster ---------- */
var IC={
  search:F.svg("search"),
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  gear:F.svg("gear"),
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>'
};
var _more=F.actions.moresheet;
F.action("moresheet",function(){
  if(!mob()&&_more) return _more();
  var t=F.theme(), cnt=function(v){ var c=v.count?v.count():0; return c?'<span class="mt-c">'+c+'</span>':''; };
  F.modal('<div class="msheet-t">Alle Bereiche</div><div class="mtiles" id="moreSheet">'+F.views.filter(function(v){ return !v.hidden; }).map(function(v){
      return '<button type="button" class="mtile" data-go="'+v.id+'"'+(v.id===F.current?' aria-current="page"':'')+'><span class="mt-i">'+F.svg(v.icon)+cnt(v)+'</span><span class="mt-l">'+esc(v.short||v.label)+'</span></button>'; }).join("")+'</div>'+
    '<div class="msheet-t">Darstellung</div><div class="seg">'+[["auto","Automatisch"],["light","Hell"],["dark","Dunkel"]].map(function(o){ return '<button type="button" data-act="theme:'+o[0]+'" aria-pressed="'+(t===o[0])+'">'+o[1]+'</button>'; }).join("")+'</div>'+
    '<div class="mquick"><button type="button" data-act="search">'+IC.search+'<span>Suchen</span></button><button type="button" data-act="priv">'+IC.eye+'<span>Beträge</span></button><button type="button" data-act="settings">'+IC.gear+'<span>Einstellungen</span></button><button type="button" data-act="pushcfg">'+F.svg("bell")+'<span>Mitteilungen</span></button><button type="button" data-act="reload">'+IC.refresh+'<span>Aktualisieren</span></button><a href="/admin/logout">'+IC.out+'<span>Abmelden</span></a></div>',"msheet");
});
/* Nach Navigation aus dem Blatt schließen */
F.listen("click",".mtile",function(){ F.closeModal(); });

/* ---------- Styles (nur Handy) ---------- */
F.css(
'.mh,.mfabx{display:none}'+
'@media (max-width:900px){'+
  /* Kopfzeile */
  '.view>.head{display:none}'+
  '.view{margin-top:-16px}'+
  '.mh{display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:20;margin:0 calc(-1*clamp(16px,4vw,44px)) 6px;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 10px;background:color-mix(in srgb,var(--ground) 88%,transparent);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid color-mix(in srgb,var(--line) 70%,transparent)}'+
  '.mh-t{flex:1;min-width:0;display:grid;gap:1px}'+
  '.mh-t b{font-size:22px;letter-spacing:-.015em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--f-display)}'+
  '.mh-t b .tag{font-size:12px;vertical-align:3px}'+
  '.mh-t span{font-size:12.5px;color:var(--ink-3);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'+
  '.mh-i{width:40px;height:40px;border-radius:50%;border:0;background:var(--sunk);color:var(--ink);display:grid;place-items:center;flex:none}.mh-i svg{width:20px;height:20px}'+
  '.view-post .mh,.view-kal .mh,.view-post .mfabx,.view-kal .mfabx{display:none!important}'+
  /* Haupt-Aktion als Pillen-Knopf */
  '.mfabx{display:inline-flex;align-items:center;gap:8px;position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:25;height:54px;padding:0 20px 0 16px;border-radius:18px;border:0;background:var(--m-blue,#0f6cbd);color:#fff;font:inherit;font-weight:700;font-size:15px;box-shadow:0 8px 24px rgba(0,0,0,.25);text-decoration:none;transition:transform .25s cubic-bezier(.2,.8,.2,1)}'+
  '.mfabx svg{width:20px;height:20px}.mfabx:active{transform:scale(.95)}'+
  'body:has(.toast.on) .mfabx{transform:translateY(-64px)}'+
  'main{padding-bottom:150px}'+
  /* Reiter als wischbare Chips */
  '.subnav{flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;margin-inline:calc(-1*clamp(16px,4vw,44px));padding:2px 16px 4px;gap:8px}'+
  '.subnav::-webkit-scrollbar{display:none}.subnav button{flex:none}'+
  '.chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.chips::-webkit-scrollbar{display:none}.chips .chip{flex:none}'+
  /* Karten & Kennzahlen kompakter */
  '.view{gap:14px}'+
  '.panel{border-radius:16px}'+
  '.panel-h{padding:12px 14px}'+
  '.kpis{gap:10px}.kpi{padding:12px 14px}.kpi .v{font-size:22px}.kpi .k{font-size:11px}.kpi .s{font-size:12px}'+
  '.todo{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.todo button{padding:12px 14px}.todo .n{font-size:22px}.todo .l{font-size:14px}.todo .h{font-size:12px}'+
  '.item{padding:12px 14px 12px 0}'+
  '.sd-tools{padding:10px 12px}.sd-tools input.f{max-width:none;flex:1 1 100%}'+
  '.bill{grid-template-columns:minmax(0,1fr);padding:10px}'+
  /* Dialoge als Blatt von unten */
  '.modal:not(:has(.sheetdlg)){place-items:end stretch;padding:0}'+
  '.modal .dialog:not(.sheetdlg){width:100%;max-width:none;max-height:92vh;border-radius:20px 20px 0 0;border-bottom:0;padding:10px 18px calc(18px + env(safe-area-inset-bottom,0px));animation:msheetu .24s cubic-bezier(.2,.8,.2,1)}'+
  '.modal .dialog:not(.sheetdlg):before{content:"";display:block;width:38px;height:5px;border-radius:99px;background:var(--line);margin:0 auto 6px;flex:none}'+
  '@keyframes msheetu{from{transform:translateY(60px);opacity:.4}to{transform:none;opacity:1}}'+
  '.modal .dialog input.f,.modal .dialog textarea.f,.modal .dialog select.f{font-size:16px}'+
  '.modal .dialog .foot{position:sticky;bottom:calc(-18px - env(safe-area-inset-bottom,0px));background:var(--panel);padding:10px 0 4px;margin-bottom:-4px}'+
  /* Detail-Seitenleisten im Vollbild */
  '.drawer{width:100%!important;border-left:0;padding-top:calc(14px + env(safe-area-inset-top,0px))}'+
  /* Blatt-Listen (Aktionen, Mehr) */
  '.msheet-t{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--ink-3);font-weight:700;padding:6px 4px 2px}'+
  '.msheet-l{display:grid;border-radius:14px;overflow:hidden;background:var(--sunk)}'+
  '.msheet-l button{border:0;border-top:1px solid var(--line);background:none;color:var(--ink);font:inherit;font-size:16px;text-align:left;padding:14px 16px}.msheet-l button:first-child{border-top:0}.msheet-l button:active{background:var(--line)}'+
  '.msheet-x{border:0;border-radius:14px;background:var(--sunk);color:var(--ink);font:inherit;font-weight:700;font-size:16px;padding:14px}'+
  '.mtiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 4px}'+
  '.mtile{border:0;background:none;color:var(--ink);display:grid;justify-items:center;gap:6px;padding:8px 2px;font:inherit;border-radius:14px}'+
  '.mtile .mt-i{position:relative;width:52px;height:52px;border-radius:16px;background:var(--sunk);display:grid;place-items:center}'+
  '.mtile .mt-i svg{width:24px;height:24px}'+
  '.mtile[aria-current="page"] .mt-i{background:var(--m-blue,#0f6cbd);color:#fff}'+
  '.mtile .mt-l{font-size:12px;font-weight:600;text-align:center;line-height:1.2}'+
  '.mtile .mt-c{position:absolute;top:-4px;right:-6px;min-width:19px;height:19px;border-radius:99px;background:var(--glow);color:var(--on-glow);font:700 11px/19px var(--f-mono);padding:0 5px}'+
  '.mquick{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin-top:4px}'+
  '.mquick button,.mquick a{border:0;background:none;color:var(--ink-2);display:grid;justify-items:center;gap:5px;padding:8px 0;font:inherit;font-size:10.5px;overflow-wrap:anywhere;text-align:center;font-weight:600;text-decoration:none;border-radius:12px}'+
  '.mquick svg{width:22px;height:22px}.mquick button:active,.mquick a:active{background:var(--sunk)}'+
  '.dialog.msheet{gap:10px}'+
'}'
);

/* ---------- Tabellen am Handy als Karten (ab 4 Spalten, Beschriftung aus dem Tabellenkopf) ---------- */
function cardTables(){
  if(!mob()) return;
  var root=document.getElementById("main"); if(!root) return;
  root.querySelectorAll(".view table:not(.mcards):not(.sd-pos)").forEach(function(t){
    var ths=t.querySelectorAll("thead th"); if(ths.length<4) return;
    var lbl=Array.prototype.map.call(ths,function(th){ return th.textContent.trim(); });
    t.classList.add("mcards");
    t.querySelectorAll("tbody tr").forEach(function(tr){ var i=0; Array.prototype.forEach.call(tr.children,function(td){ var span=+td.getAttribute("colspan")||1; if(span===1&&lbl[i]) td.setAttribute("data-label",lbl[i]); i+=span; }); });
  });
}
var cardT=null;
if(window.MutationObserver) new MutationObserver(function(){ clearTimeout(cardT); cardT=setTimeout(cardTables,0); }).observe(document.getElementById("main")||document.body,{childList:true,subtree:true});

/* ---------- Wischen auf Zeilen: je Zeilentyp eine Aktion links/rechts ---------- */
function firstBtn(el,sel){ return el.querySelector(sel); }
function clickIn(el,sel){ var b=firstBtn(el,sel); if(b) b.click(); }
var RULES=[
  {sel:".view-heute .item",
   right:function(el){ var b=firstBtn(el,".acts .btn.primary")||firstBtn(el,".acts .btn"); return b?{label:b.textContent.trim(),cls:"r",run:function(){ b.click(); }}:null; },
   left:function(el){ var b=firstBtn(el,"[data-snooze]"); return b?{label:"Bis morgen",cls:"l",remove:true,run:function(){ b.click(); }}:null; }},
  {sel:'.sd-row[data-act^="sdinv:"]',
   right:function(el){ var b=firstBtn(el,'[data-act^="book:"]')||firstBtn(el,'[data-act^="sdsend:"]'); return b?{label:b.textContent.trim()||"Zahlung",cls:"r",run:function(){ b.click(); }}:null; },
   left:function(el){ var b=firstBtn(el,'[data-act^="sdremind:"]'); return b?{label:"Mahnen",cls:"l",run:function(){ b.click(); }}:{label:"Details",cls:"g",run:function(){ el.click(); }}; }},
  {sel:'.sd-row[data-act^="sdct:"]',
   right:function(el){ var id=el.getAttribute("data-act").slice(5); return id==="new"?null:{label:"Neue Rechnung",cls:"r",run:function(){ F.actions.sdctinv(id); }}; },
   left:function(el){ var id=el.getAttribute("data-act").slice(5), st=F.sevState, c=st&&st.ct&&st.ct.contacts&&st.ct.contacts.find(function(x){ return x.id===id; }); return c&&c.email?{label:"Mail",cls:"g",run:function(){ F.actions.sdctmail(id); }}:null; }},
  {sel:".sd-tx",
   right:function(el){ var b=firstBtn(el,".sd-sug"); return b?{label:"Zuordnen",cls:"r",run:function(){ b.click(); }}:null; },
   left:function(el){ var b=firstBtn(el,'[data-act^="sdbknew:"]'); return b?{label:b.textContent.trim(),cls:"l2",run:function(){ b.click(); }}:null; }}
];
var SG=null, TH=0.3;
function vib(){ try{ if(navigator.vibrate) navigator.vibrate(8); }catch(e){} }
document.addEventListener("touchstart",function(e){
  SG=null; if(!mob()||e.touches.length!==1||F.modalOpen()) return;
  var t=e.touches[0], tg=e.target; if(!tg.closest) return;
  if(F.current==="post"||F.current==="kal") return;
  if(tg.closest("input,textarea,select,.chips,.subnav,.pipe,.scroll:not(:has(.mcards)),.kgrid,.chart")) return;
  var rule=null, row=null;
  for(var i=0;i<RULES.length;i++){ var r=tg.closest(RULES[i].sel); if(r){ rule=RULES[i]; row=r; break; } }
  SG={x:t.clientX,y:t.clientY,dx:0,lock:null,rule:rule,row:row,piv:!!document.querySelector("#main .subnav"),ptr:window.scrollY<=0};
},{passive:true});
document.addEventListener("touchmove",function(e){
  if(!SG) return; var t=e.touches[0], dx=t.clientX-SG.x, dy=t.clientY-SG.y;
  if(SG.lock===null&&(Math.abs(dx)>10||Math.abs(dy)>10)){
    SG.lock=Math.abs(dx)>Math.abs(dy)*1.25?"x":"y";
    if(SG.lock==="x"&&SG.row){ SG.L=SG.rule.left?SG.rule.left(SG.row):null; SG.R=SG.rule.right?SG.rule.right(SG.row):null; }
  }
  if(SG.lock==="y"){ if(SG.ptr&&dy>0&&window.scrollY<=0) ptrMove(dy); return; }
  if(SG.lock!=="x") return;
  F._scrollAt=Date.now(); SG.dx=dx;
  var act=dx<0?SG.L:SG.R;
  if(SG.row&&(SG.L||SG.R)){
    if(!SG.wrap){ var w=document.createElement("div"); w.className="msw gsw"; w.innerHTML='<div class="msw-bg gbg r"></div><div class="msw-bg gbg l"></div>'; SG.row.parentNode.insertBefore(w,SG.row); w.appendChild(SG.row); SG.wrap=w; SG.w=SG.row.offsetWidth; }
    var x=act?dx:dx*0.15; SG.row.style.transition="none"; SG.row.style.transform="translateX("+x+"px)";
    var bgR=SG.wrap.querySelector(".gbg.r"), bgL=SG.wrap.querySelector(".gbg.l");
    bgR.style.visibility=dx>0&&SG.R?"visible":"hidden"; bgL.style.visibility=dx<0&&SG.L?"visible":"hidden";
    if(act){ var bg=dx<0?bgL:bgR; bg.className="msw-bg gbg "+(dx<0?"l":"r")+" c-"+act.cls; bg.innerHTML='<span>'+esc(act.label)+'</span>'; var go=Math.abs(dx)>SG.w*TH; bg.classList.toggle("go",go); if(go!==SG.go){ SG.go=go; if(go) vib(); } }
    return;
  }
  if(SG.piv&&!SG.row){ var m=document.querySelector("#main .view"); if(m){ m.style.transition="none"; m.style.transform="translateX("+dx*0.35+"px)"; m.style.opacity=String(1-Math.min(.35,Math.abs(dx)/700)); } }
},{passive:true});
function sgEnd(){
  if(!SG) return; var s=SG; SG=null;
  if(s.lock==="y"){ ptrEnd(); return; }
  if(s.lock!=="x") return;
  if(s.wrap){
    var act=s.dx<0?s.L:s.R, r=s.row, w=s.wrap, ok=act&&Math.abs(s.dx)>s.w*TH;
    r.style.transition="transform .25s cubic-bezier(.2,.8,.2,1)";
    var unwrap=function(){ if(w.parentNode){ w.parentNode.insertBefore(r,w); w.remove(); } r.style.transform=""; r.style.transition=""; };
    if(!ok){ r.style.transform=""; setTimeout(unwrap,260); return; }
    if(act.remove){ r.style.transform="translateX("+(s.dx<0?"-110%":"110%")+")"; setTimeout(function(){ w.style.height=w.offsetHeight+"px"; void w.offsetHeight; w.classList.add("out"); w.style.height="0"; w.style.opacity="0"; },180); setTimeout(function(){ F._forceRender=true; act.run(); },420); return; }
    r.style.transform=""; setTimeout(function(){ unwrap(); F._userAt=Date.now(); act.run(); },230); return;
  }
  if(s.piv&&!s.row){
    var m=document.querySelector("#main .view"); if(m){ m.style.transition="transform .2s,opacity .2s"; m.style.transform=""; m.style.opacity=""; }
    if(Math.abs(s.dx)<70) return;
    var bs=Array.prototype.slice.call(document.querySelectorAll("#main .subnav button")), cur=bs.findIndex(function(b){ return b.getAttribute("aria-current")==="true"; }), nx=bs[cur+(s.dx<0?1:-1)];
    if(nx){ F._userAt=Date.now(); nx.click(); window.scrollTo(0,0); var sn=document.querySelector("#main .subnav button[aria-current=\"true\"]"); if(sn&&sn.scrollIntoView) sn.scrollIntoView({inline:"center",block:"nearest"}); }
  }
}
document.addEventListener("touchend",sgEnd,{passive:true});
document.addEventListener("touchcancel",function(){ if(SG){ SG.dx=0; sgEnd(); } },{passive:true});

/* Nach unten ziehen = aktualisieren (alle Seiten außer Postfach/Kalender) */
var PTR=null;
function ptrEl(){ if(!PTR){ PTR=document.createElement("div"); PTR.className="gptr"; PTR.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/></svg>'; document.body.appendChild(PTR); } return PTR; }
function ptrMove(dy){ var p=ptrEl(), h=Math.min(80,dy*0.5); p.style.transition="none"; p.style.transform="translate(-50%,"+(h-44)+"px)"; p.style.opacity=String(Math.min(1,h/50)); p.classList.toggle("ready",h>=60); }
function ptrEnd(){ if(!PTR) return; var p=PTR; p.style.transition=""; if(p.classList.contains("ready")){ p.classList.remove("ready"); p.classList.add("spin"); p.style.transform="translate(-50%,24px)"; F.load(true); setTimeout(function(){ p.classList.remove("spin"); p.style.transform=""; p.style.opacity="0"; },1200); } else { p.style.transform=""; p.style.opacity="0"; } }

/* Blätter nach unten zuwischen, Detailansichten nach rechts */
var SH=null;
document.addEventListener("touchstart",function(e){
  SH=null; if(!mob()||e.touches.length!==1) return; var tg=e.target; if(!tg.closest) return;
  var dlg=tg.closest(".modal .dialog"), dr=tg.closest("#drawer.on");
  if(dlg&&dlg.scrollTop<=0&&!tg.closest("input,textarea,select")) SH={el:dlg,kind:"sheet",y:e.touches[0].clientY,x:e.touches[0].clientX,d:0};
  else if(dr&&e.touches[0].clientX<40) SH={el:dr,kind:"drawer",y:e.touches[0].clientY,x:e.touches[0].clientX,d:0};
},{passive:true});
document.addEventListener("touchmove",function(e){
  if(!SH) return; var t=e.touches[0];
  if(SH.kind==="sheet"){ var dy=t.clientY-SH.y; if(dy<=0||Math.abs(t.clientX-SH.x)>dy){ SH.el.style.transform=""; return; } SH.d=dy; SH.el.style.transition="none"; SH.el.style.transform="translateY("+dy+"px)"; }
  else { var dx=t.clientX-SH.x; if(dx<=0) return; SH.d=dx; SH.el.style.transition="none"; SH.el.style.transform="translateX("+dx+"px)"; }
},{passive:true});
document.addEventListener("touchend",function(){
  if(!SH) return; var s=SH; SH=null; s.el.style.transition="";
  if(s.d>110){ if(s.kind==="sheet"){ s.el.style.transform="translateY(100%)"; setTimeout(function(){ F.closeModal(); },180); } else { s.el.style.transform=""; F.closeDrawer(); } }
  else s.el.style.transform="";
},{passive:true});

F.css(
'.gptr{display:none}'+
'@media (max-width:900px){'+
  '.gptr{display:grid;place-items:center;position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;z-index:60;width:40px;height:40px;border-radius:50%;background:var(--panel);color:var(--glow);box-shadow:0 4px 14px rgba(0,0,0,.2);transform:translate(-50%,-60px);opacity:0;transition:transform .25s,opacity .25s;pointer-events:none}'+
  '.gptr svg{width:20px;height:20px;transition:transform .2s}.gptr.ready svg{transform:rotate(180deg)}.gptr.spin svg{animation:mspin .8s linear infinite}'+
  '@keyframes mspin{to{transform:rotate(360deg)}}'+
  '.gsw{position:relative;overflow:hidden}'+
  '.gbg{display:flex!important;position:absolute;inset:0;align-items:center;padding:0 22px;color:#fff;font-weight:700;font-size:14px}'+
  '.gbg.r{justify-content:flex-start}.gbg.l{justify-content:flex-end}'+
  '.gbg.c-r{background:var(--m-blue,#0f6cbd)}.gbg.c-l{background:var(--m-red,#d13438)}.gbg.c-l2{background:#8a6d1f}.gbg.c-g{background:#5c5c5c}'+
  '.gbg span{transition:transform .18s}.gbg.go span{transform:scale(1.12)}'+
  '.gsw.out{transition:height .22s ease,opacity .22s ease}'+
  '.view-heute .item,.sd-row,.sd-tx{background:var(--panel)}'+
  '.view-heute .item [data-snooze]{display:none}'+
  /* Karten statt Tabellen */
  '.scroll:has(table.mcards){overflow:visible}'+
  'table.mcards,table.mcards tbody,table.mcards tr,table.mcards td{display:block;width:100%}'+
  'table.mcards thead{display:none}'+
  'table.mcards tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px;padding:12px 14px;border-bottom:1px solid var(--line)}'+
  'table.mcards tr:last-child{border-bottom:0}'+
  'table.mcards td{padding:0;border:0;text-align:left!important;min-width:0}'+
  'table.mcards td:first-child{grid-column:1/-1;font-weight:600;font-size:15px}'+
  
  'table.mcards td[data-label]:before{content:attr(data-label);display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);font-weight:600;margin-bottom:1px}'+
  'table.mcards td:last-child:not([data-label]),table.mcards td[colspan]{grid-column:1/-1}'+'table.mcards tr td:first-child:before{display:none}'+'.chip{border-radius:99px}'+
  'table.mcards td:empty{display:none}'+
  'table.mcards tr.grp{display:block;background:var(--sunk);padding:8px 14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-2)}'+
  'table.mcards td .row{justify-content:flex-start!important}'+
  /* Pipeline: Spalten einrasten */
  '.pipe{scroll-snap-type:x mandatory;grid-template-columns:repeat(5,86%)!important;margin-inline:calc(-1*clamp(16px,4vw,44px));padding:0 16px 8px;scroll-padding:0 16px}'+
  '.pipe>*{scroll-snap-align:start}'+
'}'
);


/* ---------- Ruhiger am Handy: Aktionen erst beim Antippen (Blatt), flache Flächen ---------- */
function actSheet(title,btns){
  btns=btns.filter(function(b){ return b&&(b.hasAttribute("data-act")||b.hasAttribute("data-go")||b.hasAttribute("href")); });
  if(!btns.length) return false;
  MH.items=btns.map(function(b){ var lbl=(b.getAttribute("aria-label")||b.textContent||b.getAttribute("title")||"").replace(/\s+/g," ").trim(); return {html:b.outerHTML,label:lbl||"Öffnen"}; });
  F.modal('<div class="msheet-t">'+esc(title||"Aktionen")+'</div><div class="msheet-l">'+MH.items.map(function(it,i){ return '<button type="button" data-act="mhdo:'+i+'">'+esc(it.label)+'</button>'; }).join("")+'</div><button type="button" class="msheet-x" data-closemodal>Abbrechen</button>',"msheet");
  return true;
}
F.mActSheet=actSheet;
document.addEventListener("click",function(e){
  if(!mob()) return; var tg=e.target; if(!tg.closest||tg.closest("button,a,input,select,textarea,label,summary")) return;
  var it=tg.closest(".view-heute .item");
  if(it){ e.preventDefault(); var tc=(it.querySelector(".t")||it).cloneNode(true); Array.prototype.forEach.call(tc.querySelectorAll(".tag"),function(x){ x.remove(); }); actSheet(tc.textContent.replace(/\s+/g," ").trim(),Array.prototype.slice.call(it.querySelectorAll(".acts .btn:not([data-snooze])")).concat([it.querySelector("[data-snooze]")]).filter(Boolean).map(function(b){ if(b.hasAttribute("data-snooze")){ var c=document.createElement("button"); c.setAttribute("data-act","msnooze:"+b.getAttribute("data-snooze")); c.textContent="Bis morgen ausblenden"; return c; } return b; })); return; }
  var tx=tg.closest(".sd-tx");
  if(tx){ e.preventDefault(); actSheet((tx.querySelector("b")||tx).textContent.trim(),Array.prototype.slice.call(tx.querySelectorAll(".sd-acts button"))); return; }
  var tr=tg.closest("table.mcards tbody tr");
  if(tr&&!tr.classList.contains("grp")){ var bs=Array.prototype.slice.call(tr.querySelectorAll("td:last-child button,td:last-child a")); if(bs.length>1){ e.preventDefault(); actSheet((tr.querySelector("td")||tr).textContent.replace(/\s+/g," ").trim().slice(0,60),bs); } }
},true);
F.action("msnooze",function(id){ F.snooze(id); });

F.css(
'@media (max-width:900px){'+
  /* weniger Knöpfe: Aktionen per Antippen/Wischen */
  '.view-heute .item .acts,.view-heute .item .ico,.sd-row .acts{display:none!important}'+
  '.view-heute .item{grid-template-columns:4px minmax(0,1fr) 14px!important;cursor:pointer;padding:12px 14px 12px 0!important}'+
  '.view-heute .item:after{content:"›";color:var(--ink-3);font-size:20px;line-height:1}'+
  '.view-heute .item .t{font-size:15px}.view-heute .item .t .tag{display:none}.view-heute .item .d{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
  '.sd-tx .sd-acts>button.btn{display:none}.sd-tx{cursor:pointer}'+
  'table.mcards td:last-child:has(button+button),table.mcards td:last-child:has(a+button){display:none}'+
  'table.mcards tbody tr:not(.grp){cursor:pointer}'+
  /* Untertitel nur kurz */
  '.mh-t span{-webkit-line-clamp:1}'+
  '.view-geld .mh-t span,.view-kunden .mh-t span,.view-web .mh-t span,.view-plat .mh-t span,.view-ki .mh-t span{display:none}'+
  /* flache, ruhige Flächen */
  '.view{gap:18px}'+
  '.panel{border:0!important;box-shadow:none!important;border-radius:14px}'+
  '.panel-h{border-bottom:0;padding:14px 16px 6px}'+
  '.panel-h h2{font-size:16px}'+
  '.panel-h .muted{font-size:12px}'+
  '.kpis{gap:1px!important;background:var(--line);border-radius:14px;overflow:hidden}'+
  '.kpis>.kpi,.kpis>.panel{border:0!important;border-radius:0!important;box-shadow:none!important;background:var(--panel)}'+
  '.kpi .v{font-size:20px}.kpi .k{letter-spacing:.04em}'+
  '.todo button{background:var(--panel)!important;border:0!important;box-shadow:none!important;position:relative;padding-left:26px!important}'+
  '.todo button:before{content:"";position:absolute;left:12px;top:19px;width:7px;height:7px;border-radius:50%;background:var(--ink-3)}'+
  '.todo button.bad:before{background:var(--bad)}.todo button.warn:before{background:var(--warn)}.todo button.info:before{background:var(--glow)}'+
  '.todo .n{font-size:20px}'+
  '.bill{padding:4px 8px 10px}.bill .c{border:0;background:var(--sunk);border-radius:12px}'+
  '.sd-row,.sd-tx,.item{border-color:color-mix(in srgb,var(--line) 70%,transparent)}'+
  '.sd-tools{border-bottom:0}'+
  '.notice{border-radius:12px}'+
  'details.abg{background:var(--panel)}'+
  '.chart{padding:4px 12px 10px}'+
'}'
);

})();
