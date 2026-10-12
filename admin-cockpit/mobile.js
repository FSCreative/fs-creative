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
    '<div class="mquick"><button type="button" data-act="search">'+IC.search+'<span>Suchen</span></button><button type="button" data-act="priv">'+IC.eye+'<span>Beträge</span></button><button type="button" data-act="settings">'+IC.gear+'<span>Einstellungen</span></button><button type="button" data-act="reload">'+IC.refresh+'<span>Aktualisieren</span></button><a href="/admin/logout">'+IC.out+'<span>Abmelden</span></a></div>',"msheet");
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
  '.mtile .mt-c{position:absolute;top:-4px;right:-6px;min-width:19px;height:19px;border-radius:99px;background:var(--glow);color:#2a1a00;font:700 11px/19px var(--f-mono);padding:0 5px}'+
  '.mquick{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;margin-top:4px}'+
  '.mquick button,.mquick a{border:0;background:none;color:var(--ink-2);display:grid;justify-items:center;gap:5px;padding:8px 0;font:inherit;font-size:10.5px;overflow-wrap:anywhere;text-align:center;font-weight:600;text-decoration:none;border-radius:12px}'+
  '.mquick svg{width:22px;height:22px}.mquick button:active,.mquick a:active{background:var(--sunk)}'+
  '.dialog.msheet{gap:10px}'+
'}'
);
})();
