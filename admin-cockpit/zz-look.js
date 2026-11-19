/* Farben je Bereich (Cockpit-Durchsicht 19.11.2026, Wunsch Simon: „modern und schöner, gerne Farben, Highlights“).
   Jeder Bereich bekommt eine eigene Akzentfarbe (--sec): farbige Symbole in Seitenleiste und Tab-Leiste, farbiges Kennzeichen vor dem
   Seitentitel und ein weicher Farbschimmer hinter dem Kopf. Hauptknöpfe bleiben im gewohnten Indigo, damit „Was klicke ich?“ eindeutig bleibt.
   Lädt nach zz-kopf.js und setzt nur Darstellung. */
(function(){
"use strict";
var F=window.FSC; if(!F||!F.css) return;
var SEC={
  heute:"#f5a524", auftraege:"#8b5cf6", post:"#3b82f6", kal:"#14b8a6", chat:"#22c55e", viw:"#0ea5e9", mkt:"#ec4899",
  kunden:"#f43f5e", geld:"#10b981", finanzamt:"#ef4444", print:"#f97316", web:"#06b6d4", plat:"#6366f1", legal:"#94a3b8",
  ki:"#d946ef", seo:"#84cc16", uploads:"#38bdf8"
};
var css="";
Object.keys(SEC).forEach(function(k){
  css+='.nav-btn[data-go="'+k+'"],.tabbar [data-go="'+k+'"],.view-'+k+'{--sec:'+SEC[k]+'}';
});
F.css(
  css+
  /* Seitenleiste: Symbole in Bereichsfarbe, aktiver Eintrag mit Farbstreifen */
  '.nav-btn{position:relative}'+
  '.nav-btn svg{color:var(--sec,currentColor);opacity:.9;transition:opacity .15s,transform .15s}'+
  '.nav-btn:hover svg{opacity:1;transform:scale(1.06)}'+
  '.nav-btn[aria-current] svg{opacity:1;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--sec) 55%,transparent))}'+
  '.nav-btn[aria-current]::before{content:"";position:absolute;left:-10px;top:50%;width:4px;height:20px;margin-top:-10px;border-radius:0 4px 4px 0;background:var(--sec);box-shadow:0 0 10px color-mix(in srgb,var(--sec) 60%,transparent)}'+
  /* Handy-Tab-Leiste: aktiver Bereich in seiner Farbe */
  '.tabbar [data-go][aria-current] svg{color:var(--sec)}'+
  /* Seitenkopf: farbiges Kennzeichen + weicher Schimmer */
  '.view{position:relative;isolation:isolate}'+
  '.view::before{content:"";position:absolute;left:-60px;right:-60px;top:-70px;height:300px;z-index:-1;pointer-events:none;'+
    'background:radial-gradient(520px 190px at 12% 18%,color-mix(in srgb,var(--sec,transparent) 16%,transparent),transparent 72%)}'+
  ':root[data-theme="light"] .view::before{opacity:.75}'+
  '.view>.head h1{display:flex;align-items:center;gap:12px}'+
  '.view>.head h1::before{content:"";flex:none;width:11px;height:11px;border-radius:4px;background:var(--sec,var(--glow));box-shadow:0 0 0 4px color-mix(in srgb,var(--sec,var(--glow)) 22%,transparent),0 0 16px color-mix(in srgb,var(--sec,var(--glow)) 45%,transparent)}'+
  '.mh-t b{display:inline-flex;align-items:center;gap:10px}'+
  '.mh-t b::before{content:"";flex:none;width:9px;height:9px;border-radius:3px;background:var(--sec,var(--glow));box-shadow:0 0 0 3px color-mix(in srgb,var(--sec,var(--glow)) 22%,transparent)}'+
  /* Aufträge: Hinweis „Kundenanfragen stehen unter Kunden“ (statt doppelter Aufgaben) */
  '.tk-inq{display:flex;align-items:center;gap:12px;margin:0 0 14px;padding:10px 12px 10px 10px;border-radius:14px;border:1px solid color-mix(in srgb,#f43f5e 35%,var(--line));background:color-mix(in srgb,#f43f5e 9%,var(--panel));font-size:13.5px;color:var(--ink-2)}'+
  '.tk-inq b{color:var(--ink)}.tk-inq>span:nth-child(2){flex:1;min-width:0}'+
  '.tk-inq-i{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,#f43f5e 22%,transparent);color:#f43f5e}.tk-inq-i svg{width:18px;height:18px}'+
  '@media (max-width:640px){.tk-inq{flex-wrap:wrap}.tk-inq .btn{width:100%}}'+
  /* Postfach: breite Anhang-Zeilen brechen um statt über den Rand zu laufen (kein overflow – sonst drückt das Raster die Box auf eine Zeile zusammen) */
  '.rin>.attbox{min-width:0}.rin>.attbox .attl{flex-wrap:wrap}.rin>.attbox .att{max-width:100%;min-width:0;flex-wrap:wrap}'+
  /* KI-Leiste im Postfach darf am Handy umbrechen */
  '@media (max-width:900px){.kibar{flex-wrap:wrap;row-gap:8px}}'
);
})();
