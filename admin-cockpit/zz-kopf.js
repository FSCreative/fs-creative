/* Kopf-Reiter: ein gemeinsamer Look für die Bereichs-Menüs in den Kopfzeilen (Wunsch Simon 31.10.2026) – Finanzen, Kunden & Leads,
   Post (Ordner + Filter), Druckaufträge, Websites, Geld, Aufträge. Lädt als letztes Modul und setzt nur die Darstellung;
   Markup, Aktionen und Wischen bleiben in den Modulen. Ebene 1 = Reiter (gefüllte Pillen, aktiv kräftig), Ebene 2 = Filter (Kontur).
   Läuft die Leiste über den Rand, blendet sie rechts weich aus – am Ende (oder ohne Überlauf) nicht. */
(function(){
"use strict";
var F=window.FSC; if(!F||!F.css) return;
var BAR=".fsm-nav,.mx-segs,.mfstrip,.subnav,.tkm-tabs";
var TAB=".fsm-nav>button,.mx-seg,.mfs,.subnav>button,.tkm-tabs>button";
var ON='.fsm-nav>button[aria-current],.mx-seg[aria-pressed="true"],.mfs[aria-current="true"],.subnav>button[aria-current="true"],.tkm-tabs>button[aria-current]';
var CNT=".mx-seg b,.mfs i,.tkm-tabs>button b,.subnav>button b,.fsm-nav>button b";
/* :root davor = eine Klasse mehr Gewicht: gilt auch gegen Modul-Stile, die erst beim Öffnen einer Ansicht nachgeladen werden */
function sel(list,suffix){ return list.split(",").map(function(s){ return ":root "+s+suffix; }).join(","); }
F.css(
  sel(BAR,"")+"{display:flex;flex-wrap:nowrap;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;border:0;"+
    "-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 26px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 26px),transparent)}"+
  sel(BAR,"::-webkit-scrollbar")+"{display:none}"+
  sel(BAR,".kr-end")+"{-webkit-mask-image:none;mask-image:none}"+
  sel(TAB,"")+"{flex:none;display:inline-flex;align-items:center;gap:6px;height:34px;min-height:34px;padding:0 14px;margin:0;border:1px solid transparent;border-radius:99px;"+
    "background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--ink-2);font:inherit;font-size:13.5px;font-weight:600;letter-spacing:-.005em;line-height:1;white-space:nowrap;"+
    "box-shadow:none;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background-color .15s ease,color .15s ease,transform .1s ease}"+
  sel(TAB," svg")+"{width:15px;height:15px;flex:none;opacity:.85}"+
  sel(TAB,":active")+"{transform:scale(.97)}"+
  sel(TAB,":focus-visible")+"{outline:2px solid var(--glow);outline-offset:2px}"+
  "@media (hover:hover){"+sel(TAB,":hover")+"{background:color-mix(in srgb,var(--ink) 12%,transparent);color:var(--ink)}}"+
  sel(ON,"")+","+sel(ON,":hover")+"{background:var(--ink);border-color:var(--ink);color:var(--ground)}"+
  sel(ON," svg")+"{opacity:1;color:inherit}"+
  sel(CNT,"")+"{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 6px;border-radius:99px;background:color-mix(in srgb,var(--ink) 11%,transparent);"+
    "color:var(--ink-2);font:700 11px/1 var(--f-mono,inherit);font-style:normal;font-variant-numeric:tabular-nums;opacity:1}"+
  sel(ON," b")+","+sel(ON," i")+"{background:color-mix(in srgb,var(--ground) 22%,transparent);color:inherit}"+
  ":root .mfs.warn:not([aria-current]){color:var(--bad)}"+
  /* Ebene 2: Filter-Chips im Postfach – leichter als die Reiter */
  ":root .mchips .chip{height:30px;min-height:30px;padding:0 11px;border-radius:99px;border:1px solid var(--line);background:transparent;color:var(--ink-2);font-size:13px;font-weight:600}"+
  ":root .mchips .chip[aria-pressed=true]{background:color-mix(in srgb,var(--ink) 12%,transparent);border-color:transparent;color:var(--ink)}"
);
/* Ausblenden rechts nur, solange es dort noch etwas zu sehen gibt */
function check(el){ var end=el.scrollWidth-el.clientWidth-el.scrollLeft<=2; if(el.classList.contains("kr-end")!==end) el.classList.toggle("kr-end",end); }
function all(){ document.querySelectorAll(BAR).forEach(check); }
document.addEventListener("scroll",function(e){ var t=e.target; if(t&&t.nodeType===1&&t.matches&&t.matches(BAR)) check(t); },true);
window.addEventListener("resize",function(){ requestAnimationFrame(all); });
var pend=0; function soon(){ if(pend) return; pend=requestAnimationFrame(function(){ pend=0; all(); }); }
if(window.MutationObserver){ var main=document.getElementById("main"); if(main) new MutationObserver(soon).observe(main,{childList:true,subtree:true}); }
soon();
})();
