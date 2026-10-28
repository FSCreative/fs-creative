/* Marketing › Planer und Kanäle (Server: mkt-posts.js, mkt-publish.js).
   Planer: App wählen → „Generieren“ (KI schreibt Posts, Reels, Captions, Hashtags; der Server erzeugt Bilder/Videos) → prüfen, Zeit/Plattformen anpassen →
   „Go“ (wird zur geplanten Zeit automatisch gepostet) oder „Jetzt posten“. Nichts geht ohne Go raus.
   Kanäle: App-Zugänge der Plattformen (einmalig), Konten je App verbinden (Anmeldung bei der Plattform), Bluesky mit App-Passwort, Musik und Stockvideos.
   Musik (mkt-music.js): je Reel KI-Titel (Stability) bzw. passender Bibliothekstitel; im Post „Andere Musik“, 3 Vorschläge mit Hörprobe, Neu komponieren, Daumen. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.mplay='<path d="M8 5v14l11-7z"/>';
F.icons.mgo='<path d="M5 12.5l4.5 4.5L19 7.5"/>';
F.icons.mspark='<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>';
F.icons.mlink='<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';
F.icons.mnote='<path d="M9 18V5.5l11-2V16"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>';
F.icons.mlayers='<path d="M12 3.5 3.5 8 12 12.5 20.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>';
F.icons.mimage='<rect x="3.5" y="4" width="17" height="16" rx="3"/><circle cx="9" cy="9.5" r="1.7"/><path d="m20.5 15.5-5-5L6 20"/>';
F.icons.mreel='<rect x="5.5" y="2.5" width="13" height="19" rx="3"/><path d="M10.5 9.3v5.4l4.3-2.7z"/>';
function pfIcon(k){ return F.mktPfIcon?F.mktPfIcon(k):""; }

var PL=null, PLOAD=false, PPOLL=null, GEN=false;
UI.mkBrand=UI.mkBrand||F.ls("fsc_mk_brand")||"kochdu";
var GO=UI.mkGen=UI.mkGen||Object.assign({count:4,reel:true,karussell:true,bild:true,topic:""},F.ls("fsc_mk_gen")||{});
F.mktPlan=function(){ return PL; };

F.css(
/* Planer: eigener Container – die nutzbare Breite hängt von Seitenleiste und rechter Spalte ab, nicht vom Fenster (1440 px ≈ 790 px Inhalt, 1840 px ≈ 1190 px) */
'.mp{container:mp/inline-size;display:grid;gap:18px;min-width:0}.mp>*{min-width:0}'+
/* Markenfarbe: auf dunklem Grund (Glas/Dunkel) aufgehellt, damit auch dunkle Marken (Hüttengaudi, VALUERO) sichtbar bleiben */
'.mp [style*="--bc"]{--bcv:var(--bc)}'+
':root:is([data-theme="glas"],[data-theme="dark"]) .mp [style*="--bc"]{--bcv:color-mix(in oklab,var(--bc),#fff 32%)}'+
'.st-entwurf{--sc:var(--warn)}.st-geplant{--sc:var(--glow)}.st-laeuft{--sc:var(--info)}.st-gepostet{--sc:var(--ok)}.st-teilweise{--sc:var(--warn)}.st-fehler{--sc:var(--bad)}'+
'.mp-spin{display:inline-flex}.mp-spin svg{animation:mkspin 1s linear infinite}'+
/* Marken-Chips */
'.mp-chips{display:flex;gap:6px;flex-wrap:wrap}'+
'@media (max-width:700px){.mp-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px}.mp-chips::-webkit-scrollbar{display:none}.mp-chips button{flex:none}}'+
'.mp-chips button{border:1px solid var(--line);background:var(--panel-2);border-radius:99px;padding:6px 14px;min-height:36px;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink-2);cursor:pointer;display:inline-flex;gap:7px;align-items:center;white-space:nowrap}'+
'.mp-chips button:hover{color:var(--ink);border-color:var(--line-2)}'+
':root[data-theme="glas"] .mp-chips button{-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%)}'+
':root[data-theme="glas"] .mp-chips button:not([aria-pressed="true"]){background:rgba(10,16,26,.56);border-color:rgba(255,255,255,.16)}'+
'.mp-chips button[aria-pressed="true"]{background:var(--glow-soft);color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 40%,transparent)}'+
'.mp-chips i{width:10px;height:10px;border-radius:50%;display:inline-block;background:var(--bcv);box-shadow:0 0 0 1px var(--line-2)}'+
'.mp-chips .count{margin-left:0}'+
/* Wochenplan: 7 Tage, Posts als Kärtchen in Markenfarbe (Entwurf = gestrichelt), freie gute Zeiten laut Rhythmus */
'.mp-cal{position:relative}'+
'.mp-calh{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:14px 16px 12px 18px}'+
'.mp-calt{display:grid;gap:1px;min-width:0}.mp-calt h2{font-size:16px;margin:0;letter-spacing:-.01em}.mp-calt span{font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}'+
'.mp-stats{display:flex;gap:6px;flex-wrap:wrap;margin-right:auto}'+
'.mp-stat{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--sunk);border-radius:99px;padding:3px 11px 3px 9px;min-height:28px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink-2);cursor:pointer;white-space:nowrap}'+
'.mp-stat:hover{color:var(--ink);border-color:var(--line-2)}.mp-stat i{width:7px;height:7px;border-radius:50%;background:var(--sc,var(--ink-3))}.mp-stat b{color:var(--ink);font-variant-numeric:tabular-nums}'+
'.mp-nav{display:inline-flex;gap:4px;align-items:center;margin-left:auto}'+
'.mp-nav button{display:inline-grid;place-items:center;height:32px;min-width:32px;padding:0 9px;border:1px solid var(--line);background:var(--panel-2);border-radius:10px;color:var(--ink-2);font:inherit;font-size:13px;font-weight:600;cursor:pointer}'+
'.mp-nav button:hover{color:var(--ink);border-color:var(--line-2)}.mp-nav button[aria-pressed="true"]{color:var(--glow-ink);background:var(--glow-soft);border-color:color-mix(in srgb,var(--glow) 40%,transparent)}.mp-nav svg{width:16px;height:16px}'+
'.mp-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;padding:0 10px 10px}'+
'.mp-day{display:flex;flex-direction:column;gap:5px;min-width:0;min-height:128px;padding:8px 6px 7px;border-radius:14px;background:var(--sunk);border:1px solid transparent}'+
'.mp-day.today{background:color-mix(in srgb,var(--glow) 10%,var(--sunk));border-color:color-mix(in srgb,var(--glow) 38%,transparent)}'+
'.mp-dh{display:flex;align-items:baseline;gap:5px;padding:0 4px 2px;white-space:nowrap}'+
'.mp-dh span{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}'+
'.mp-dh b{font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}.mp-day.past .mp-dh{opacity:.6}'+
'.mp-day.today .mp-dh b,.mp-day.today .mp-dh span{color:var(--glow-ink)}'+
'.mp-dh em{margin-left:auto;font-style:normal;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--glow-ink)}'+
'.mp-ev{display:grid;grid-template-columns:minmax(0,1fr);width:100%;padding:0;border-radius:11px;overflow:hidden;border:1px solid color-mix(in srgb,var(--bcv) 48%,transparent);border-left:3px solid var(--bcv);background:color-mix(in srgb,var(--bcv) 16%,var(--panel-2));text-align:left;font:inherit;color:var(--ink);cursor:pointer;min-width:0;transition:transform .15s,border-color .15s,box-shadow .15s}'+
'.mp-ev:hover{transform:translateY(-1px);border-color:var(--bcv);box-shadow:0 6px 18px rgba(0,0,0,.18)}'+
'.mp-ev.draft{border-style:dashed;border-left-style:solid;background:color-mix(in srgb,var(--bcv) 6%,transparent)}'+
'.mp-ev img,.mp-ev .ph{width:100%;aspect-ratio:2/1;object-fit:cover;object-position:50% 30%;display:block;background:linear-gradient(135deg,var(--bcv),color-mix(in srgb,var(--bcv) 45%,#000))}'+
'.mp-ev.draft img{opacity:.85}'+
'.mp-ev .t{display:flex;align-items:center;gap:4px;padding:5px 7px 0;font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;line-height:16px;min-width:0}'+
'.mp-ev .t svg{width:13px;height:13px;flex:none;color:var(--sc);margin-left:auto}.mp-ev .t .mp-spin{margin-left:auto}.mp-ev .t .mp-spin svg{margin:0}'+
'.mp-ev .x{margin:1px 7px 6px;font-size:11.5px;line-height:1.3;color:var(--ink-2);display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}'+
'.mp-free{display:flex;align-items:center;gap:5px;width:100%;min-height:28px;padding:5px 7px;border:1px dashed var(--line-2);border-radius:10px;background:none;font:inherit;font-size:11.5px;font-weight:600;color:var(--ink-3);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;cursor:pointer;text-align:left;transition:color .15s,border-color .15s,background-color .15s}.mp-free svg{width:12px;height:12px;flex:none}'+
'.mp-free:hover,.mp-free:focus-visible{color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 55%,transparent);background:var(--glow-soft)}'+
'.mp-calnone{margin:0;padding:0 18px 14px;font-size:12.5px;color:var(--ink-3)}'+
/* Kopf: bei mittlerer Breite Zähler in eigene Zeile unter Titel und Blättern (sonst rutscht das Blättern allein in eine zweite Zeile) */
'@container mp (max-width:900px){.mp-stats{order:3;flex:1 1 100%;margin-right:0}}'+
'@container mp (max-width:640px){.mp-calt .mp-rh i{display:none}.mp-calt .mp-rh{margin-left:8px}}'+
/* Rhythmus-Anzeige im Kopf: ●●●○ 3/4 */
'.mp-calt .mp-rh{display:inline-flex;align-items:center;gap:3px;margin-left:10px;vertical-align:2px;font-size:12px;letter-spacing:0;color:var(--ink-3)}.mp-rh i{width:6px;height:6px;border-radius:50%;background:var(--line-2)}.mp-rh i.on{background:var(--glow)}.mp-rh b{margin-left:3px;font-size:12px;color:var(--ink-2)}'+
/* Platzhalter im Kärtchen: Format-Symbol, Lade-Kreis oder Fehler statt leerer Farbfläche */
'.mp-ev .ph{display:grid;place-items:center;color:rgba(255,255,255,.92)}.mp-ev .ph svg{width:18px;height:18px}'+
'.mp-ev .ph.bad{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--bad) 26%,var(--sunk)) 0 7px,color-mix(in srgb,var(--bad) 14%,var(--sunk)) 7px 14px);color:var(--bad)}'+
'.mp-dot{display:block;width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:mkspin .9s linear infinite}'+
(function(){ /* kompakte Kärtchen: kleines Bild links, Zeit daneben, Titel darunter (viele Posts an einem Tag, Handy) */
  var c=function(p){ return p+' .mp-ev{grid-template-columns:30px minmax(0,1fr);column-gap:7px;align-items:center;padding:5px 6px 6px 5px}'+p+' .mp-ev img,'+p+' .mp-ev .ph{grid-row:1;width:30px;height:36px;aspect-ratio:auto;border-radius:6px}'+
    p+' .mp-ev .ph svg{width:14px;height:14px}'+p+' .mp-ev .mp-dot{width:12px;height:12px}'+p+' .mp-ev .t{grid-row:1;padding:0}'+p+' .mp-ev .x{grid-column:1/-1;margin:4px 1px 0}'; };
  // sehr schmale Tage (1440 px, „Alle“ mit vielen Posts): Bildchen weglassen, damit Uhrzeit und Status-Symbol Platz haben
  return c('.mp-days.dense')+'.mp-days.dense .mp-day{container:mpday/inline-size}@container mpday (max-width:110px){.mp-days.dense .mp-ev{grid-template-columns:minmax(0,1fr);padding-left:7px}.mp-days.dense .mp-ev :is(img,.ph){display:none}}'+
    '@container mp (max-width:640px){'+c('.mp-days')+'.mp-day{min-height:92px}}'; })()+
'@container mp (max-width:640px){.mp-stats{order:3;flex:1 1 100%;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -16px 0 -18px;padding:0 16px 0 18px}.mp-stats::-webkit-scrollbar{display:none}.mp-stat{flex:none}.mp-days{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(132px,40%);overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding:0 12px 12px;scroll-padding:0 12px}.mp-days::-webkit-scrollbar{display:none}.mp-day{scroll-snap-align:start;min-height:112px}}'+
/* Neue Posts: kompakte Leiste, Optionen aufklappbar */
'.mp-gen{position:relative;overflow:hidden;scroll-margin-top:84px}'+
'.mp-gen.busy::after{content:"";position:absolute;left:0;top:0;height:2px;width:40%;background:linear-gradient(90deg,transparent,var(--glow),transparent);animation:mpbar 1.3s ease-in-out infinite}'+
'@keyframes mpbar{from{transform:translateX(-100%)}to{transform:translateX(260%)}}'+
'.mp-genbar{display:flex;align-items:center;gap:12px 14px;flex-wrap:wrap;padding:14px 16px 14px 18px}'+
'.mp-genic{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none;color:#fff;background:linear-gradient(140deg,color-mix(in oklab,var(--bc),#fff 22%),var(--bc));box-shadow:0 6px 18px color-mix(in srgb,var(--bc) 42%,transparent),inset 0 1px 0 rgba(255,255,255,.3)}.mp-genic svg{width:21px;height:21px}'+
'.mp-gent{flex:1 1 200px;min-width:0;display:grid;gap:1px}.mp-gent b{font-size:15.5px;letter-spacing:-.01em}'+
'.mp-gent span{font-size:12.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mp-genbtns{display:flex;gap:8px;align-items:center;margin-left:auto}'+
'.mp-genx svg:last-child{transition:transform .2s}.mp-genx[aria-expanded="true"] svg:last-child{transform:rotate(180deg)}'+
'.mp-kioff{margin:0 16px 14px;padding:9px 12px;border-radius:12px;font-size:13px;background:var(--warn-soft);color:var(--ink);border:1px solid color-mix(in srgb,var(--warn) 35%,transparent)}'+
'.mp-genbody{display:grid;grid-template-columns:minmax(0,1fr);gap:16px 22px;padding:16px 18px 18px;border-top:1px solid var(--line)}'+
'@container mp (min-width:740px){.mp-genbody{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}}'+
'.mp-gencol{display:grid;gap:12px;align-content:start;min-width:0}'+
'.mp-vorg{min-height:96px;max-height:260px;field-sizing:content}'+
/* Handy: Schnell-Vorgaben als eine wischbare Zeile statt fünf Zeilen Chips */
'@container mp (max-width:640px){.mp-gen .mp-qk{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -18px;padding:0 18px}.mp-gen .mp-qk::-webkit-scrollbar{display:none}.mp-gen .mp-qk button{flex:none;min-height:36px}}'+
'.mp-lab{font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3)}'+
'.mp-fmt{display:flex;gap:6px;flex-wrap:wrap;align-items:center}'+
'.mp-fmt label{position:relative;display:inline-flex;align-items:center;gap:7px;border:1px dashed var(--line-2);background:var(--panel-2);border-radius:99px;padding:5px 13px 5px 11px;min-height:34px;font-size:13px;font-weight:600;color:var(--ink-3);cursor:pointer;white-space:nowrap}'+
'.mp-fmt label:hover{color:var(--ink);border-color:var(--line-2)}'+
'.mp-fmt label:has(input:checked){background:var(--glow-soft);color:var(--glow-ink);border-style:solid;border-color:color-mix(in srgb,var(--glow) 50%,transparent)}'+
'.mp-fmt label:has(input:focus-visible){outline:2px solid var(--glow);outline-offset:2px}'+
'.mp-fmt input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}.mp-fmt svg{width:15px;height:15px;flex:none}'+
'.mp-fmt select.f{width:auto;min-height:34px;padding:4px 30px 4px 12px;border-radius:99px}'+
'.mp-kv{display:grid;gap:9px;font-size:13px;color:var(--ink-2);padding-top:12px;border-top:1px solid var(--line)}'+
'.mp-kv>div{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px;align-items:baseline}.mp-kv b{color:var(--ink)}'+
/* Abschnitte */
'.mp-sec{display:grid;gap:10px;scroll-margin-top:84px}'+
'.mp-sh{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;min-height:34px;padding:0 2px}'+
'.mp-sh h2{margin:0;font-size:17px;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}'+
'.mp-sh h2 i{width:9px;height:9px;border-radius:50%;background:var(--sc);box-shadow:0 0 0 4px color-mix(in srgb,var(--sc) 22%,transparent);flex:none}'+
'.mp-sh .n{font-size:12px;font-weight:700;line-height:20px;padding:0 8px;border-radius:99px;background:var(--sunk);color:var(--ink-2);font-variant-numeric:tabular-nums;box-shadow:inset 0 0 0 1px var(--line)}'+
'.mp-sh p{margin:0;font-size:12.5px;color:var(--ink-2)}.mp-sh .r{margin-left:auto}'+
'@container mp (max-width:560px){.mp-sh p{flex-basis:100%;order:3}}'+
':root[data-theme="glas"] .mp-sh :is(h2,p){text-shadow:0 1px 14px rgba(0,0,0,.45)}'+
':root[data-theme="glas"] .mp-sh .n{background:rgba(10,16,26,.35)}'+
/* Post-Karten: eine Glasfläche je Abschnitt, darin Zeilen (schneller als viele einzelne Glaskarten).
   Breit: Vorschau | Inhalt | Termin + Plattformen + Knöpfe · mittel: Termin/Knöpfe unter dem Text · Handy: Vorschau neben Titel und Termin */
'.mp-list{display:grid;padding:0}'+
'.mp-card{--pw:184px;position:relative;display:grid;grid-template-columns:var(--pw) minmax(0,1fr);grid-template-areas:"prev head" "prev when" "prev body" "prev side";grid-template-rows:auto auto auto 1fr;gap:12px 22px;padding:20px;border-top:1px solid var(--line);min-width:0;scroll-margin:96px 0}'+
'.mp-card:first-child{border-top:0}.mp-card.slim{--pw:84px;gap:10px 20px;padding:16px 20px}'+
'.mp-card.flash{animation:mpflash 1.9s ease-out}@keyframes mpflash{0%,40%{background:color-mix(in srgb,var(--glow) 16%,transparent)}100%{background:transparent}}'+
'.mp.alle .mp-card::before{content:"";position:absolute;left:0;top:20px;bottom:20px;width:3px;border-radius:0 3px 3px 0;background:var(--bcv)}'+
/* Breit: Mitte (Kopf + Text) und rechte Spalte (Termin + Knöpfe) als eigene Spalten – sonst entsteht unter dem Titel eine Lücke, so hoch wie das Kalenderblatt */
'.mp-mid,.mp-rt{display:contents}'+
'@container mp (min-width:1000px){.mp-card{--pw:204px;grid-template-columns:var(--pw) minmax(0,1fr) minmax(270px,340px);grid-template-areas:"prev mid rt";grid-template-rows:auto;column-gap:26px}.mp-card.slim{--pw:92px}'+
  '.mp-mid,.mp-rt{display:grid;gap:12px;align-content:start;min-width:0}.mp-card .mp-mid>*,.mp-card .mp-rt>*{grid-area:auto}.mp-mid{grid-area:mid}.mp-rt{grid-area:rt;gap:14px;padding-left:24px;border-left:1px solid var(--line);align-self:stretch}.mp-rt .mp-gh{padding:5px 7px}}'+
'@container mp (max-width:560px){.mp-card{--pw:112px;grid-template-areas:"prev head" "prev when" "body body" "side side";grid-template-rows:auto 1fr auto auto;gap:12px 14px;padding:16px}.mp-card.slim{--pw:72px;padding:14px 16px}.mp-when{align-self:start}.mp.alle .mp-card::before{top:16px;bottom:16px}}'+
'.mp-prev{grid-area:prev;position:relative;width:var(--pw);min-width:0;align-self:start}'+
'.mp-prev img,.mp-prev video{width:100%;display:block;border-radius:14px;background:var(--sunk);cursor:pointer;aspect-ratio:4/5;object-fit:cover}'+
'.mp-prev>img{box-shadow:0 10px 26px rgba(0,0,0,.2),0 0 0 1px var(--line)}.mp-prev video{aspect-ratio:9/16}'+
'.mp-card.slim .mp-prev img,.mp-card.slim .mp-prev video{aspect-ratio:4/5;border-radius:11px}'+
/* Reel in der Liste: stumm, beim Drüberfahren läuft es an; Klick öffnet die große Vorschau mit Ton */
'.mp-reel{position:relative;display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;border-radius:14px;overflow:hidden;color:#fff;box-shadow:0 10px 26px rgba(0,0,0,.22),0 0 0 1px var(--line)}'+
'.mp-card.slim .mp-reel{border-radius:11px}.mp-reel video{pointer-events:none}'+
'.mp-reel .pl{position:absolute;left:8px;right:8px;bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 10px;border-radius:99px;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-size:12.5px;font-weight:700;transition:transform .15s,background .15s}'+
'.mp-reel:hover .pl,.mp-reel:focus-visible .pl{transform:scale(1.04);background:rgba(0,0,0,.72)} .mp-reel .pl svg{width:15px;height:15px;flex:none}'+
'.mp-card.slim .mp-reel .pl{left:50%;right:auto;bottom:50%;width:34px;height:34px;padding:0;transform:translate(-50%,50%)}.mp-card.slim .mp-reel .pl span{display:none}'+
'.mp-card.slim .mp-reel:hover .pl{transform:translate(-50%,50%) scale(1.08)}'+
'@container mp (max-width:560px){.mp-reel .pl span{display:none}.mp-reel .pl{left:50%;right:auto;width:38px;height:38px;padding:0;transform:translateX(-50%)}.mp-reel:hover .pl{transform:translateX(-50%) scale(1.06)}}'+
'.mp-prev .n{position:absolute;top:7px;right:7px;display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.58);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font-size:11.5px;font-weight:700;border-radius:99px;padding:2px 8px 2px 6px;pointer-events:none}.mp-prev .n svg{width:12px;height:12px}'+
'.mp-wait{width:100%;aspect-ratio:4/5;border-radius:14px;background:var(--sunk);box-shadow:inset 0 0 0 1px var(--line);display:grid;place-items:center;text-align:center;font-size:12.5px;line-height:1.4;color:var(--ink-2);padding:10px;overflow:hidden}'+
'.mp-wait.r{aspect-ratio:9/16}.mp-card.slim .mp-wait{aspect-ratio:4/5;border-radius:11px;font-size:11px;padding:6px}'+
'.mp-wait i{display:block;width:24px;height:24px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--glow);animation:mkspin .9s linear infinite;margin:0 auto 8px}'+
'.mp-wait.bad{background:var(--bad-soft);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 35%,transparent)}.mp-wait .btn{margin-top:8px}'+
'.mp-head{grid-area:head;display:grid;gap:8px;align-content:start;min-width:0}'+
'.mp-badges{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12px}'+
'.mp-st,.mp-fb,.mp-br{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:2px 9px 2px 7px;font-weight:700;line-height:18px;white-space:nowrap}'+
'.mp-st{color:var(--sc);background:color-mix(in srgb,var(--sc) 15%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sc) 34%,transparent)}'+
'.mp-st svg,.mp-fb svg{width:13px;height:13px;flex:none}'+
'.mp-fb,.mp-br{background:var(--sunk);color:var(--ink-2);box-shadow:inset 0 0 0 1px var(--line)}.mp-br{color:var(--ink)}.mp-br i{width:8px;height:8px;border-radius:50%;background:var(--bcv)}'+
'.mp-pil{color:var(--ink-3);font-weight:600}'+
'.mp-idea{margin:0;font-size:17px;font-weight:700;line-height:1.3;letter-spacing:-.01em;overflow-wrap:anywhere;text-wrap:balance}.mp-card.slim .mp-idea{font-size:15px}'+
'@container mp (max-width:560px){.mp-idea{font-size:15.5px}.mp-card.slim .mp-idea{font-size:14.5px}}'+
/* Termin wie ein Kalenderblatt (Kopf in Statusfarbe) */
'.mp-when{grid-area:when;display:flex;align-items:center;gap:12px;min-width:0}'+
'.mp-c1{width:50px;flex:none;display:grid;text-align:center;border-radius:12px;overflow:hidden;background:var(--panel-2);box-shadow:inset 0 0 0 1px var(--line)}'+
'.mp-c1 span:first-child{background:color-mix(in srgb,var(--sc) 24%,transparent);color:var(--sc);font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;line-height:19px}'+
'.mp-c1 b{font-size:20px;line-height:24px;padding-top:2px;font-variant-numeric:tabular-nums}.mp-c1 span:last-child{font-size:10.5px;font-weight:600;color:var(--ink-3);line-height:15px;padding-bottom:4px}'+
'.mp-wt{display:grid;gap:1px;min-width:0}'+
'.mp-when .lb{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--sc)}.mp-when .lb svg{width:13px;height:13px}'+
'.mp-when .tm{font-size:19px;font-weight:700;letter-spacing:-.01em;line-height:1.25;font-variant-numeric:tabular-nums}'+
'.mp-when .rel{font-size:12.5px;color:var(--ink-2)}'+
'.mp-card.slim .mp-c1{width:44px}.mp-card.slim .mp-c1 b{font-size:17px;line-height:21px}.mp-card.slim .mp-when .tm{font-size:16px}'+
/* Text */
'.mp-body{grid-area:body;display:grid;gap:9px;align-content:start;min-width:0}'+
'.mp-cap{font-size:13.5px;line-height:1.5;color:var(--ink-2);white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty;-webkit-hyphens:auto;hyphens:auto;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}'+
'.mp-card.slim .mp-cap{-webkit-line-clamp:2;line-clamp:2}'+
'.mp-cap.open,.mp-card.slim .mp-cap.open{display:block;-webkit-line-clamp:unset;line-clamp:none;overflow:visible}'+
/* Absätze: gekürzt ohne Leerzeile (mehr Text in 3 Zeilen), aufgeklappt mit Abstand */
'.mp-cap .pp{display:block}.mp-cap.open .pp+.pp{margin-top:.6em}.mp-more[hidden]{display:none}'+
'.mp-more{justify-self:start;padding:0}'+
'.mp-tags{display:flex;gap:4px;flex-wrap:wrap}'+
'.mp-tags span{font-size:11.5px;color:var(--glow-ink,var(--ink-2));background:var(--glow-soft,var(--sunk));border-radius:99px;padding:1px 8px}'+
'.mp-meta{display:flex;gap:4px 14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2);min-width:0}'+
'.mp-meta>span{display:inline-flex;gap:5px;align-items:center;min-width:0;max-width:100%}.mp-meta svg{width:14px;height:14px;flex:none;color:var(--ink-3)}'+
'.mp-meta .link{display:inline-flex;gap:5px;align-items:center;padding:0}.mp-meta .link svg{color:currentColor}'+
/* Termin, Plattformen, Knöpfe */
'.mp-side{grid-area:side;display:grid;gap:11px;align-content:start;min-width:0}'+
'.mp-pf{display:flex;gap:6px;flex-wrap:wrap}'+
'.mp-pf button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel-2);border-radius:99px;padding:4px 12px 4px 10px;min-height:32px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink-3);cursor:pointer;white-space:nowrap}'+
'.mp-pf button svg{width:15px;height:15px;flex:none}'+
'.mp-pf button:not([aria-pressed="true"]):hover:not(:disabled){color:var(--ink);border-color:var(--line-2)}.mp-pf button[aria-pressed="true"]:hover:not(:disabled){border-color:var(--glow)}'+
'.mp-pf button[aria-pressed="true"]{background:var(--glow-soft);color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 45%,transparent)}'+
'.mp-pf button[aria-pressed="false"]{border-style:dashed;border-color:var(--line-2);background:none}.mp-pf button[aria-pressed="false"] svg{opacity:.7}.mp-pf button:disabled{cursor:default}'+
'.mp-nopf{font-size:12.5px;color:var(--ink-2)}'+
'.mp-time{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3)}'+
'.mp-time input.f{flex:1 1 auto;width:auto;min-width:0;padding:5px 10px;min-height:36px;font-size:13.5px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--ink)}'+
'.mp-act{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center}.mp-time{flex:0 1 270px}'+
'.mp-main{display:flex;gap:8px;flex-wrap:wrap}.mp-main .btn{justify-content:center}'+
'@container mp (min-width:1000px){.mp-act{display:grid}.mp-main .btn{flex:1 1 auto}}'+
'@container mp (max-width:560px){.mp-time{flex-basis:100%}.mp-main{flex:1 1 100%}.mp-main .btn{flex:1 1 auto}}'+
'.mp-subs{display:flex;gap:2px;flex-wrap:wrap;margin:-3px -8px 0}'+
'.mp-gh{display:inline-flex;align-items:center;gap:6px;border:0;background:none;border-radius:9px;padding:5px 8px;min-height:32px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink-2);cursor:pointer;white-space:nowrap}'+
'.mp-gh:hover{background:var(--hover,var(--sunk));color:var(--ink)}.mp-gh svg{width:15px;height:15px;flex:none}.mp-gh.bad:hover{color:var(--bad);background:var(--bad-soft)}'+
'.mp-hint{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-3);margin-top:-4px}.mp-hint svg{width:14px;height:14px;flex:none}'+
'.mp-res{display:grid;gap:6px;font-size:13px}'+
'.mp-r{display:flex;flex-wrap:wrap;align-items:center;gap:3px 8px;padding:7px 10px;border-radius:11px;background:var(--sunk);box-shadow:inset 0 0 0 1px var(--line);min-width:0}'+
'.mp-r .pfn{display:inline-flex;align-items:center;gap:6px;font-weight:700;margin-right:auto}.mp-r .pfn svg{width:15px;height:15px;flex:none}'+
'.mp-r .msg{flex-basis:100%;font-size:12.5px;line-height:1.4;overflow-wrap:anywhere}.mp-r .lk{flex-basis:100%;display:flex;flex-wrap:wrap;gap:0 12px}.mp-r .lk .link{padding:2px 0}'+
'.mp-r.bad{background:var(--bad-soft);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 30%,transparent)}'+
'.mp-err{display:inline-flex;align-items:center;gap:4px;font-weight:600}.mp-err svg{width:14px;height:14px;flex:none}'+
'.mp-ok{display:inline-flex;gap:4px;align-items:center;color:var(--ok);font-weight:600}.mp-ok svg{width:14px;height:14px;flex:none}'+
'@media (max-width:900px){.mp-main .btn,.mp-pf button,.mp-gh{min-height:40px}}'+
/* Leer-Zustände, „weitere“, Laden */
'.mp-empty{display:flex;align-items:center;gap:12px 14px;flex-wrap:wrap;padding:18px 20px}'+
'.mp-empty .ic{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none;background:var(--sunk);color:var(--sc,var(--ink-3));box-shadow:inset 0 0 0 1px var(--line)}.mp-empty .ic svg{width:20px;height:20px}'+
'.mp-et{flex:1 1 220px;display:grid;gap:2px;min-width:0}.mp-et b{font-size:14.5px}.mp-et span{font-size:13px;color:var(--ink-2)}'+
'.mp-morebar{display:flex;justify-content:center;padding:12px 16px;border-top:1px solid var(--line)}'+
'.mp-sk{min-height:120px;background:linear-gradient(100deg,transparent 30%,var(--hover,var(--sunk)) 50%,transparent 70%) var(--glass,var(--panel));background-size:220% 100%;animation:mpsk 1.4s linear infinite}'+
'@keyframes mpsk{from{background-position:120% 0}to{background-position:-120% 0}}'+
'@media (prefers-reduced-motion:reduce){.mp-sk,.mp-gen.busy::after,.mp-spin svg,.mp-card.flash{animation:none}.mp-ev{transition:none}}'+
/* Große Reel-Vorschau: Handy im Format 9:16 in Bildschirmhöhe, mit Ton und Instagram-Oberfläche (zeigt, was Texte verdecken) */
'.modal:has(.dialog.mpv){place-items:center}'+
'.modal .dialog.mpv{width:auto;max-width:none;max-height:none;padding:0;border-radius:0;animation:none;background:none!important;border:0!important;box-shadow:none!important;overflow:visible;display:block}.modal .dialog.mpv:before{display:none}'+
'.mpv-wrap{display:flex;gap:16px;align-items:stretch}'+
'.mpv-ph{position:relative;width:min(calc((100vh - 64px)*9/16),calc(100vw - 110px),480px);aspect-ratio:9/16;border-radius:30px;overflow:hidden;background:#000;color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.14);-webkit-user-select:none;user-select:none}'+
'@supports(height:100dvh){.mpv-ph{width:min(calc((100dvh - 64px)*9/16),calc(100vw - 110px),480px)}}'+
'.mpv-ph video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block;cursor:pointer}'+
'.mpv-ui{position:absolute;inset:0;pointer-events:none;transition:opacity .25s}'+
'.mpv-ph.pure .mpv-ui{opacity:0}'+
'.mpv-top{position:absolute;top:0;left:0;right:0;padding:16px 18px 48px;background:linear-gradient(rgba(0,0,0,.42),transparent);font-weight:800;font-size:17px;letter-spacing:-.01em}'+
'.mpv-bot{position:absolute;left:0;right:0;bottom:0;padding:70px 66px 24px 14px;background:linear-gradient(transparent,rgba(0,0,0,.62));display:grid;gap:9px;font-size:13.5px;line-height:1.38;text-shadow:0 1px 3px rgba(0,0,0,.45)}'+
'.mpv-who{display:flex;align-items:center;gap:9px;font-weight:700;min-width:0}.mpv-who .ell{min-width:0}'+
'.mpv-av{width:32px;height:32px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:12px;font-weight:800;overflow:hidden;box-shadow:0 0 0 1.5px #fff;text-shadow:none}'+
'.mpv-av img{width:100%;height:100%;object-fit:contain;padding:4px}'+
'.mpv-fo{border:1px solid rgba(255,255,255,.75);border-radius:8px;padding:2px 10px;font-size:12.5px;flex:none}'+
'.mpv-cap{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line;overflow-wrap:anywhere;pointer-events:auto;cursor:pointer}'+
'.mpv-cap.open{display:block;max-height:38vh;overflow-y:auto}'+
'.mpv-mus{display:flex;align-items:center;gap:6px;font-size:12.5px;min-width:0}.mpv-mus svg{width:14px;height:14px;flex:none}'+
'.mpv-side{position:absolute;right:8px;bottom:92px;display:grid;gap:20px;justify-items:center}'+
'.mpv-side svg{width:28px;height:28px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))}'+
'.mpv-big{position:absolute;left:50%;top:50%;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;background:rgba(0,0,0,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:grid;place-items:center;opacity:0;transform:scale(.8);transition:opacity .2s,transform .2s;pointer-events:none}'+
'.mpv-ph.paused .mpv-big{opacity:1;transform:none}.mpv-big svg{width:34px;height:34px;margin-left:5px}'+
'.mpv-bar{position:absolute;left:0;right:0;bottom:0;height:22px;display:flex;align-items:flex-end;cursor:pointer;touch-action:none;z-index:2}'+
'.mpv-bar i{position:relative;display:block;width:100%;height:3px;background:rgba(255,255,255,.28);transition:height .15s}'+
'.mpv-bar:hover i,.mpv-bar.drag i{height:7px}.mpv-bar b{position:absolute;left:0;top:0;bottom:0;width:0;background:#fff}'+
'.mpv-msg{position:absolute;left:50%;top:22%;transform:translateX(-50%);background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:99px;padding:8px 14px;font-size:13px;font-weight:700;white-space:nowrap;pointer-events:none;transition:opacity .3s}'+
'.mpv-msg:empty{opacity:0}'+
'.mpv-ctl{display:flex;flex-direction:column;gap:10px;align-items:center}'+
'.mpv-ctl button,.mpv-ctl a{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--glass-line,var(--line));background:var(--glass-strong,var(--panel));color:var(--ink);cursor:pointer;-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);box-shadow:var(--glass-hi,none);transition:transform .15s}'+
'.mpv-ctl button:hover,.mpv-ctl a:hover{transform:scale(1.07)}.mpv-ctl button[aria-pressed="true"]{color:var(--glow,var(--accent))}.mpv-ctl svg{width:20px;height:20px}'+
'.mpv-ctl .x{margin-bottom:auto}.mpv-ctl a{text-decoration:none}.mpv-t{font-size:12px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 1px 4px rgba(0,0,0,.6);white-space:nowrap}'+
'@media(max-width:640px){.modal:has(.dialog.mpv){padding:0;background:#000;place-items:center}.mpv-wrap{position:relative;display:block}'+
  '.mpv-ph{width:min(100vw,calc(100vh*9/16));border-radius:0;box-shadow:none}@supports(height:100dvh){.mpv-ph{width:min(100vw,calc(100dvh*9/16))}}'+
  '.mpv-top{padding-right:70px}.mpv-ctl{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:10px;gap:8px;z-index:3}.mpv-ctl button,.mpv-ctl a{width:40px;height:40px;background:rgba(0,0,0,.45);color:#fff;border-color:rgba(255,255,255,.25)}.mpv-ctl .dl,.mpv-ctl .ed{display:none}}'+
'.mp-opts{border:1px solid var(--line);border-radius:12px;padding:10px 12px}.mp-opts summary{cursor:pointer;font-weight:600}.mp-og{display:grid;gap:6px;padding:10px 0;border-top:1px solid var(--line);margin-top:8px}.mp-og:first-of-type{border-top:0}'+
'.mp-place{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mp-place .f{flex:1 1 260px}.mp-placer{flex-basis:100%;display:flex;flex-wrap:wrap;gap:4px 14px}'+
'.mp-mus{font-size:12.5px;margin:4px 0;display:flex;gap:4px 10px;flex-wrap:wrap}'+
'.mp-mus span{background:var(--sunk);border-radius:99px;padding:1px 9px}'+
'.mp-qk{display:flex;gap:6px;flex-wrap:wrap}'+
'.mp-qk button{border:1px dashed var(--line);background:none;border-radius:99px;padding:4px 11px;font:inherit;font-size:12.5px;color:var(--ink-2);cursor:pointer}'+
'.mp-qk button:hover{border-color:var(--ink-3);color:var(--ink)}'+
'.mk-kan{display:grid;gap:16px}'+
'.mk-prov{display:grid;gap:0}'+
'.mk-prov>div{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:8px 16px;padding:12px 18px;border-top:1px solid var(--line);align-items:start}'+
'@media(max-width:760px){.mk-prov>div{grid-template-columns:minmax(0,1fr)}}'+
'.mk-prov form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'+
'.mk-prov form .f{width:200px}'+
'.mk-tbl{width:100%;border-collapse:collapse;font-size:13px}'+
'.mk-tbl th,.mk-tbl td{padding:8px 10px;border-top:1px solid var(--line);text-align:left;vertical-align:top}'+
'.mk-tbl th{font-size:12px;color:var(--ink-2);font-weight:600;white-space:nowrap}'+
'.mk-tbl td:first-child{white-space:nowrap}'+
'.mk-tbl .mk-acc{display:grid;gap:3px;justify-items:start;min-width:0} .mk-tbl .mk-acc b{font-weight:600;overflow-wrap:anywhere} .mk-tbl .mk-acc .link{padding:0;text-align:left}'+
'.mk-wrapx{overflow-x:auto}'+
'.mk-uri{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 18px}'+
'.mk-uri code{background:var(--sunk);border-radius:8px;padding:6px 10px;font-size:12.5px;word-break:break-all}'+
'.mp-ed{display:grid;gap:10px}'+
'.mp-ed textarea.f{min-height:90px;font-size:13.5px}'+
'.mp-slide{border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:8px}'+
'.mp-car{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory}'+
'.mp-car img{height:min(70vh,560px);border-radius:12px;scroll-snap-align:start}'
);

function api(path,body){ return F.api(path,body?{body:body}:undefined); }
function load(){ if(PLOAD) return; PLOAD=true; return api("/admin/api/mkt/posts").then(function(j){ PLOAD=false; PL=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler",posts:[],channels:[],platforms:[],providers:[]}; schedulePoll(); if(F.current==="mkt") F.render(); }).catch(function(){ PLOAD=false; PL={ok:false,error:"Keine Verbindung zum Server",posts:[],channels:[],platforms:[],providers:[]}; if(F.current==="mkt") F.render(); }); }
F.mktPlanReload=load;
setTimeout(function(){ if(!PL) load(); },2000);
function schedulePoll(){
  clearTimeout(PPOLL); if(!PL||!PL.posts) return;
  var busy=PL.posts.some(function(p){ return p.media&&(p.media.status==="wartet"||p.media.status==="läuft")||p.status==="läuft"; });
  var soon=PL.posts.some(function(p){ return p.status==="geplant"&&Date.parse(p.scheduledAt)-Date.now()<5*60e3; });
  if(busy||soon) PPOLL=setTimeout(function(){ if(F.current!=="mkt"){ schedulePoll(); return; } api("/admin/api/mkt/posts").then(function(j){ if(j&&j.ok){ var was=sig(PL); PL=j; if(was!==sig(j)){ if(!F.modalOpen()) F.render(); else Array.prototype.forEach.call(document.querySelectorAll("#modalHost [data-mpmus]"),function(el){ musRepaint(el.getAttribute("data-mpmus")); }); } } schedulePoll(); }); },busy?3000:30000);
}
function sig(o){ return JSON.stringify((o.posts||[]).map(function(p){ return [p.id,p.status,p.media.status,p.media.rev,Object.keys(p.results||{}).map(function(k){ return p.results[k].status; }).join()]; })); }
function brands(){ var S=F.mktState&&F.mktState(); return (S&&S.brands||[]).filter(function(b){ return b.enabled!==false; }); }
function brandOf(k){ return brands().find(function(b){ return b.key===k; })||{key:k,name:k,colors:{}}; }
function pfLabel(k){ var p=(PL.platforms||[]).find(function(x){ return x.key===k; }); return p?p.label:k; }
function chOf(brand,pf){ return (PL.channels||[]).find(function(c){ return c.brand===brand&&c.platform===pf; }); }
var QUICK=["lustig & locker","seriös & informativ","kurz & knackig","Frage an die Community","Aktion bewerben","saisonal","hinter die Kulissen","Tipps & Tricks","in Mundart"];
var FMT={reel:"Reel",karussell:"Karussell",bild:"Bild"}, STL={entwurf:"Zur Freigabe",geplant:"Geplant","läuft":"Wird gepostet",gepostet:"Gepostet",teilweise:"Teilweise gepostet",fehler:"Fehler"};
function when(iso){ var d=new Date(iso); if(isNaN(d)) return ""; return d.toLocaleString("de-AT",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
function localDT(iso){ var d=new Date(iso); if(isNaN(d)) return ""; var z=function(n){ return String(n).padStart(2,"0"); }; return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+"T"+z(d.getHours())+":"+z(d.getMinutes()); }

/* ---------- Rückkehr von der Anmeldung bei einer Plattform ---------- */
(function(){ try{
  var q=new URLSearchParams(location.search), m=q.get("mkt"), pick=q.get("mktpick");
  if(!m&&!pick) return;
  history.replaceState(null,"",location.pathname+location.hash);
  UI.mktTab="kanaele"; F.ls("fsc_mkt_tab","kanaele");
  setTimeout(function(){
    if(m){ var ok=m.indexOf("ok:")===0; F.toast(m.replace(/^(ok|fehler):/,""),!ok); load(); }
    if(pick) api("/admin/api/mkt/pick?id="+encodeURIComponent(pick)).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Auswahl abgelaufen",true);
      F.modal('<div class="row-between"><h2 style="font-size:19px">Welches Konto für '+esc(brandOf(j.brand).name)+'?</h2>'+F.btnClose()+'</div><div style="display:grid;gap:8px;margin-top:10px">'+j.options.map(function(o){ return '<button type="button" class="btn" style="justify-content:flex-start" data-act="mkpick:'+esc(pick)+'|'+o.i+'">'+esc(pfLabel(o.platform))+': <b>'+esc(o.name)+'</b> '+esc(o.handle||"")+'</button>'; }).join("")+'</div>',"narrow"); });
  },1200);
}catch(e){} })();
F.action("mkpick",function(a){ var p=a.split("|"); api("/admin/api/mkt/pick",{id:p[0],i:+p[1]}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); PL=j; F.closeModal(); F.toast("Verbunden"); F.render(); }); });

/* ---------- Planer ---------- */
var WD=["So","Mo","Di","Mi","Do","Fr","Sa"], WDL=["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"], WDK=["so","mo","di","mi","do","fr","sa"], MON=["Jan.","Feb.","März","Apr.","Mai","Juni","Juli","Aug.","Sep.","Okt.","Nov.","Dez."];
var STC={entwurf:"entwurf",geplant:"geplant","läuft":"laeuft",gepostet:"gepostet",teilweise:"teilweise",fehler:"fehler"};
var STI={entwurf:"edit",geplant:"clock","läuft":"refresh",gepostet:"checkCircle",teilweise:"alertCircle",fehler:"alertCircle"};
var STB={entwurf:"Zur Freigabe",geplant:"Geplant","läuft":"Wird gepostet",gepostet:"Gepostet",teilweise:"Teilweise gepostet",fehler:"Fehler"};
var FMI={reel:"mreel",karussell:"mlayers",bild:"mimage"};
function stIcon(s){ return s==="läuft"?'<span class="mp-spin">'+F.svg("refresh")+'</span>':F.svg(STI[s]||"clock"); }
function hm(d){ return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function relDay(d){ var a=new Date(); a.setHours(0,0,0,0); var b=new Date(d); b.setHours(0,0,0,0); var n=Math.round((b-a)/864e5);
  return n===0?"heute":n===1?"morgen":n===2?"übermorgen":n===-1?"gestern":n>1?"in "+n+" Tagen":"vor "+(-n)+" Tagen"; }
function postDate(p){ return ["gepostet","teilweise","fehler"].indexOf(p.status)>-1?(p.postedAt||p.scheduledAt||""):(p.scheduledAt||""); }
function bColor(k){ var b=brandOf(k); return (b.colors&&b.colors.primary)||"#8a93a8"; }
function fileBase(p){ return "/admin/api/mkt/post-file?id="+encodeURIComponent(p.id)+"&v="+encodeURIComponent((p.media||{}).rev||""); }
function thumbOf(p){ var md=p.media||{}; if(md.status!=="fertig") return ""; return p.format==="reel"?(md.cover?fileBase(p)+"&kind=cover":""):(md.images?fileBase(p)+"&i=0":""); }
/* TikTok: Marken ohne eigenes TikTok posten über das gemeinsame Konto (Server: sharedTiktok) – im Planer daher auch dort als Plattform zeigen */
function chFor(brand,pf){ var c=chOf(brand,pf); if(!c&&pf==="tiktok"&&PL.tiktokShared&&PL.tiktokShared.brand!==brand) c=chOf(PL.tiktokShared.brand,"tiktok"); return c; }
function weekStart(off){ var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(d.getDay()+6)%7+7*(off||0)); return d; }
function isoWeek(d0){ var d=new Date(Date.UTC(d0.getFullYear(),d0.getMonth(),d0.getDate())), day=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-day); var y=new Date(Date.UTC(d.getUTCFullYear(),0,1)); return Math.ceil(((d-y)/864e5+1)/7); }

function whenTile(p){
  var iso=postDate(p), d=new Date(iso), lb={entwurf:"Vorschlag",geplant:"Geht raus","läuft":"Wird gepostet",gepostet:"Gepostet",teilweise:"Gepostet",fehler:"Versucht"}[p.status]||"";
  if(!iso||isNaN(d)) return '<div class="mp-when"><div class="mp-wt"><span class="lb">'+esc(lb)+'</span><span class="tm">Ohne Termin</span></div></div>';
  return '<div class="mp-when"><div class="mp-c1" aria-hidden="true"><span>'+WD[d.getDay()]+'</span><b>'+d.getDate()+'</b><span>'+MON[d.getMonth()]+'</span></div>'+
    '<div class="mp-wt"><span class="lb">'+(p.status==="läuft"?stIcon("läuft"):'')+esc(lb)+'</span><span class="tm">'+hm(d)+' Uhr</span><span class="rel">'+WDL[d.getDay()]+', '+d.getDate()+'. '+MON[d.getMonth()]+' · '+relDay(d)+'</span></div></div>';
}
function postCard(p,slim){
  var md=p.media||{}, base=fileBase(p), prev, reel=p.format==="reel";
  if(md.status!=="fertig") prev=md.status==="fehler"?'<div class="mp-wait bad'+(reel?' r':'')+'"><div><b class="bad-t">Fehler</b><br>'+esc(md.error||"")+'<br><button type="button" class="btn sm" data-act="mprer:'+esc(p.id)+'">Nochmal</button></div></div>':'<div class="mp-wait'+(reel?' r':'')+'"><div><i></i>'+(reel?"Reel wird animiert …"+(slim?'':'<br><span class="small">dauert 1–2 Minuten</span>'):"Bilder werden erstellt …")+'</div></div>';
  else if(reel) prev='<button type="button" class="mp-reel" data-act="mpvid:'+esc(p.id)+'" aria-label="Reel mit Ton ansehen"><video src="'+base+'&kind=video" poster="'+base+'&kind=cover" playsinline muted loop preload="none"></video><span class="pl">'+mpvI("play")+'<span>Ansehen</span></span></button>';
  else prev='<img src="'+base+'&i=0" alt="" data-act="mpview:'+esc(p.id)+'" loading="lazy">'+(md.images>1?'<span class="n">'+F.svg("mlayers")+md.images+'</span>':'');
  var connected=(PL.platforms||[]).filter(function(pf){ var c=chFor(p.brand,pf.key); return c&&c.status!=="getrennt"&&pf.formats.indexOf(p.format)>-1; });
  var editable=p.status==="entwurf"||p.status==="geplant", hasRes=Object.keys(p.results||{}).length>0;
  var pfs=connected.length?'<div class="mp-pf" role="group" aria-label="Plattformen">'+connected.map(function(pf){ var on=p.platforms.indexOf(pf.key)>-1; return '<button type="button" '+(editable?'data-act="mppf:'+esc(p.id)+'|'+pf.key+'"':'disabled')+' aria-pressed="'+on+'">'+pfIcon(pf.key)+'<span>'+esc(pf.label)+'</span></button>'; }).join("")+'</div>':'<div class="mp-nopf">Noch kein passendes Konto verbunden – <button type="button" class="link" data-act="mktab:kanaele">Kanäle</button></div>';
  var res="";
  if(hasRes) res='<div class="mp-res">'+Object.keys(p.results).map(function(k){ var r=p.results[k], can=p.can||{};
    var lk=r.status==="ok"&&r.id?((can.edit||[]).indexOf(k)>-1?'<button type="button" class="link small" data-act="mprem:'+esc(p.id)+'|'+k+'|edit">Text ändern</button>':'')+((can.comments||[]).indexOf(k)>-1?'<button type="button" class="link small" data-act="mprem:'+esc(p.id)+'|'+k+'|comments">Kommentare '+(r.commentsOff?'ein':'aus')+'</button>':'')+((can.remove||[]).indexOf(k)>-1?'<button type="button" class="link small" data-act="mprem:'+esc(p.id)+'|'+k+'|delete">Löschen</button>':''):'';
    var st=r.status==="gelöscht"?'<span class="muted">gelöscht</span>':r.status==="ok"?(r.url?'<a class="mp-ok" href="'+esc(r.url)+'" target="_blank" rel="noopener">'+F.svg("checkCircle")+' ansehen</a>':'<span class="mp-ok">'+F.svg("checkCircle")+' gepostet</span>')+(r.editedAt?' <span class="muted small">geändert</span>':''):
      r.status==="entwurf"?'<b>Entwurf in der App</b>':r.status==="übersprungen"?'<span class="muted">übersprungen</span>':'<span class="bad-t mp-err">'+F.svg("alertCircle")+' Fehler</span><button type="button" class="link" data-act="mpretry:'+esc(p.id)+'|'+k+'">nochmal</button>';
    var bad=["ok","gelöscht","entwurf","übersprungen"].indexOf(r.status)<0;
    var msg=bad?'<span class="msg bad-t">'+esc(r.error||"Fehler")+'</span>':r.status==="entwurf"&&r.note?'<span class="msg muted">'+esc(r.note)+'</span>':r.status==="übersprungen"&&r.error?'<span class="msg muted">'+esc(r.error)+'</span>':'';
    return '<div class="mp-r'+(bad?' bad':'')+'"><span class="pfn">'+pfIcon(k)+esc(pfLabel(k))+'</span>'+st+msg+(lk?'<span class="lk">'+lk+'</span>':'')+'</div>'; }).join("")+'</div>';
  var ready=md.status==="fertig", main="", subs="", hint="", time=editable?'<label class="mp-time"><span>Zeit</span><input class="f" type="datetime-local" value="'+esc(localDT(p.scheduledAt))+'" data-mptime="'+esc(p.id)+'" title="Geplante Zeit"></label>':'';
  if(p.status==="entwurf"){ var dis=!ready||!p.platforms.length?' disabled':'';
    main='<button type="button" class="btn primary" data-act="mpgo:'+esc(p.id)+'"'+dis+'>'+F.svg("mgo")+' Go</button><button type="button" class="btn" data-act="mpnow:'+esc(p.id)+'"'+dis+'>'+F.svg("send")+' Jetzt posten</button>';
    hint=!ready?(md.status==="fehler"?"Erst Bild/Video neu erstellen (Nochmal)":"Freigabe, sobald "+(reel?"das Video":"die Bilder")+" fertig "+(reel?"ist":"sind")):!p.platforms.length?"Für „Go“ mindestens eine Plattform wählen":"";
    subs='<button type="button" class="mp-gh" data-act="mped:'+esc(p.id)+'">'+F.svg("edit")+' Bearbeiten</button>'+(/^gewinnspiel/.test(p.source||"")?'':'<button type="button" class="mp-gh" data-act="mprw:'+esc(p.id)+'">'+F.svg("mspark")+' Neu schreiben</button>')+'<button type="button" class="mp-gh bad" data-act="mpdel:'+esc(p.id)+'">'+F.svg("trash")+' Verwerfen</button>'; }
  else if(p.status==="geplant"){ main='<button type="button" class="btn" data-act="mpstop:'+esc(p.id)+'">'+F.svg("xCircle")+' Stopp</button><button type="button" class="btn" data-act="mpnow:'+esc(p.id)+'">'+F.svg("send")+' Jetzt posten</button>';
    subs='<button type="button" class="mp-gh" data-act="mped:'+esc(p.id)+'">'+F.svg("edit")+' Bearbeiten</button>'; }
  else if(p.status==="läuft") hint="Wird gerade auf "+esc(p.platforms.map(pfLabel).join(", ")||"den Plattformen")+" gepostet …";
  else { if(p.status!=="gepostet") main='<button type="button" class="btn" data-act="mpretry:'+esc(p.id)+'|">'+F.svg("refresh")+' Fehlgeschlagene nochmal</button>';
    subs='<button type="button" class="mp-gh bad" data-act="mpdel:'+esc(p.id)+'">'+F.svg("trash")+' Entfernen</button>'; }
  var cap=p.preview&&(p.preview.instagram||p.preview[Object.keys(p.preview)[0]])||(p.captions&&p.captions.instagram)||"";
  // „Ganzen Text anzeigen“ gibt es immer; ob der Text wirklich gekürzt ist, misst planAfter (hängt von Breite und Absätzen ab)
  var capTxt=String(cap).replace(/\n\n(#\S+\s*)+$/,"").trim(), capOpen=!!(UI.mpCapOpen&&UI.mpCapOpen[p.id]);
  var capHtml=capTxt.split(/\n\s*\n/).map(function(x){ return '<span class="pp">'+esc(x.trim())+'</span>'; }).join("");
  var mi=function(icon,title,txt){ return '<span title="'+esc(title)+'">'+F.svg(icon)+'<span class="ell">'+esc(txt)+'</span></span>'; };
  var meta=(p.place?mi("pin","Standort (Instagram/Facebook)",p.place.name):'')+((p.tags||[]).length?mi("user","Markierte Personen (Instagram)",p.tags.map(function(u){ return "@"+u; }).join(" ")):'')+((p.collabs||[]).length?mi("link","Collab (Instagram)",p.collabs.map(function(u){ return "@"+u; }).join(" ")):'')+(reel?'<button type="button" class="link mp-musl" data-act="mpmus:'+esc(p.id)+'" title="Musik anhören und ändern">'+F.svg("mnote")+'<span class="ell">'+esc(musLine(p))+'</span>'+(p.musicNote?'<i title="'+esc(p.musicNote)+'"></i>':'')+'</button>':'')+(p.firstComment?mi("message","Erster Kommentar: "+p.firstComment,p.firstComment.slice(0,70)+(p.firstComment.length>70?'…':'')):'')+(p.altText?mi("eye","Bildbeschreibung: "+p.altText,"Bildbeschreibung"):'')+
    (p.platforms.indexOf("tiktok")>-1?'<button type="button" class="link" data-act="mptt:'+esc(p.id)+'">'+F.svg("copy")+' TikTok-Text kopieren</button>':'');
  var nImg=!reel&&md.images>1?' · '+md.images:'';
  return '<article class="mp-card st-'+(STC[p.status]||"entwurf")+(slim?' slim':'')+'" id="mp-'+esc(p.id)+'" style="--bc:'+esc(bColor(p.brand))+'" aria-labelledby="mpt-'+esc(p.id)+'">'+
    '<div class="mp-prev">'+prev+'</div><div class="mp-mid">'+
    '<div class="mp-head"><div class="mp-badges"><span class="mp-st">'+stIcon(p.status)+esc(STB[p.status]||p.status)+'</span><span class="mp-fb">'+F.svg(FMI[p.format]||"mimage")+esc((FMT[p.format]||p.format)+nImg)+'</span>'+
      (UI.mkBrand==="alle"?'<span class="mp-br"><i></i>'+esc(brandOf(p.brand).name)+'</span>':'')+(p.pillar?'<span class="mp-pil">'+esc(p.pillar)+'</span>':'')+'</div>'+
      '<h3 class="mp-idea" id="mpt-'+esc(p.id)+'">'+esc(p.idea||"Ohne Titel")+'</h3></div>'+
    '<div class="mp-body">'+(capTxt?'<div class="mp-cap'+(capOpen?' open':'')+'">'+capHtml+'</div>'+
      '<button type="button" class="link small mp-more" data-act="mpcap:'+esc(p.id)+'" aria-expanded="'+capOpen+'"'+(capOpen?'':' hidden')+'>'+(capOpen?'Weniger anzeigen':'Ganzen Text anzeigen')+'</button>':'')+
      (((p.hashtags||{}).instagram||[]).length?'<div class="mp-tags">'+p.hashtags.instagram.slice(0,PL.igTags||5).map(function(t){ return '<span>'+esc(t.charAt(0)==="#"?t:"#"+t)+'</span>'; }).join("")+'</div>':'')+
      (meta?'<div class="mp-meta">'+meta+'</div>':'')+'</div></div><div class="mp-rt">'+whenTile(p)+
    '<div class="mp-side">'+(hasRes?res:pfs)+(time||main?'<div class="mp-act">'+time+(main?'<div class="mp-main">'+main+'</div>':'')+'</div>':'')+(hint?'<div class="mp-hint">'+F.svg(p.status==="läuft"?"clock":"alertCircle")+'<span>'+hint+'</span></div>':'')+(subs?'<div class="mp-subs">'+subs+'</div>':'')+'</div></div></article>';
}
/* Wochenplan: was geht wann raus (alle Marken in ihrer Farbe), Entwürfe gestrichelt, freie „beste Zeiten“ der gewählten Marke */
function weekHtml(mine,cur,stats){
  var off=UI.mpWeek||0, s=weekStart(off), e=new Date(s), now=new Date(), today=new Date(); today.setHours(0,0,0,0); e.setDate(s.getDate()+7);
  var plan=cur!=="alle"&&PL.plans&&PL.plans[cur], last=new Date(e); last.setDate(e.getDate()-1);
  var evs=mine.filter(function(p){ var t=Date.parse(postDate(p)); return t>=+s&&t<+e; }).sort(function(a,b){ return Date.parse(postDate(a))-Date.parse(postDate(b)); });
  /* Freie Termine wie der Server sie beim Generieren vergibt (mkt-posts.js nextSlot): beste Zeiten der Marke, höchstens perWeek je Woche, mind. 20 h Abstand */
  var free=[], rh="";
  if(plan){ var taken=mine.filter(function(p){ return p.scheduledAt&&["entwurf","geplant","läuft","gepostet","teilweise"].indexOf(p.status)>-1; }).map(function(p){ return Date.parse(p.scheduledAt); });
    var inWk=taken.filter(function(t){ return t>=+s&&t<+e; }).length, per=+plan.perWeek||0, left=Math.max(0,per-inWk), from=Date.now()+20*60e3, cand=[];
    for(var i=0;i<7;i++){ var dd=new Date(s); dd.setDate(s.getDate()+i);
      (plan.times||[]).forEach(function(t){ var m=String(t).toLowerCase().match(/^(mo|di|mi|do|fr|sa|so)\s+(\d{1,2}):(\d{2})$/); if(!m||WDK.indexOf(m[1])!==dd.getDay()) return; var ms=+new Date(dd.getFullYear(),dd.getMonth(),dd.getDate(),+m[2],+m[3]); if(ms>=from) cand.push(ms); }); }
    cand.sort(function(a,b){ return a-b; }).forEach(function(ms){ if(free.length>=left||taken.some(function(t){ return Math.abs(t-ms)<20*3600e3; })) return; free.push(ms); taken.push(ms); });
    if(per) rh='<span class="mp-rh" title="'+esc(inWk+" von "+per+" Posts dieser Woche laut Rhythmus")+'">'+Array.from({length:Math.min(per,10)}).map(function(_,k){ return '<i'+(k<inWk?' class="on"':'')+'></i>'; }).join("")+'<b>'+inWk+'/'+per+'</b></span>'; }
  var perDay=Array.from({length:7}).map(function(_,i){ var d=new Date(s); d.setDate(s.getDate()+i); var dn=new Date(d); dn.setDate(d.getDate()+1);
    return { d:d, list:evs.filter(function(p){ var t=Date.parse(postDate(p)); return t>=+d&&t<+dn; }), free:free.filter(function(ms){ return ms>=+d&&ms<+dn; }) }; });
  // viele Posts an einem Tag (z. B. „Alle“): kompakte Kärtchen mit kleinem Bild links statt Bildstreifen
  var dense=perDay.some(function(x){ return x.list.length>2; });
  var cols=perDay.map(function(x){ var d=x.d, list=x.list, isT=+d===+today, past=d<today;
    return '<div class="mp-day'+(isT?' today':'')+(past?' past':'')+'"><div class="mp-dh"><span>'+WD[d.getDay()]+'</span><b>'+d.getDate()+'.</b>'+(isT?'<em>Heute</em>':'')+'</div>'+
      list.map(function(p){ var t=new Date(postDate(p)), th=thumbOf(p), ms=(p.media||{}).status;
        var ph=ms==="fehler"?'<span class="ph bad">'+F.svg("alertCircle")+'</span>':ms==="wartet"||ms==="läuft"?'<span class="ph"><i class="mp-dot"></i></span>':'<span class="ph">'+F.svg(FMI[p.format]||"mimage")+'</span>';
        return '<button type="button" class="mp-ev st-'+(STC[p.status]||"entwurf")+(p.status==="entwurf"?' draft':'')+'" style="--bc:'+esc(bColor(p.brand))+'" data-act="mpjump:'+esc(p.id)+'" title="'+esc(hm(t)+" · "+(cur==="alle"?brandOf(p.brand).name+" · ":"")+(FMT[p.format]||p.format)+" · "+(STB[p.status]||p.status)+(ms==="fehler"?" (Bild/Video fehlgeschlagen)":"")+" – "+(p.idea||""))+'">'+
          (th?'<img src="'+th+'" alt="" loading="lazy">':ph)+'<span class="t">'+hm(t)+stIcon(p.status)+'</span><span class="x">'+esc(p.idea||"")+'</span></button>'; }).join("")+
      x.free.map(function(ms){ var t=hm(new Date(ms)); return '<button type="button" class="mp-free" data-act="mpfree" title="'+esc("Freier Termin laut Rhythmus – „Generieren“ füllt ihn mit einem neuen Post")+'" aria-label="'+esc(t+" Uhr frei – neue Posts generieren")+'">'+F.svg("plus")+t+' frei</button>'; }).join("")+'</div>'; }).join("");
  var anyFree=free.length>0;
  var rng=s.getDate()+". "+(s.getMonth()!==last.getMonth()?MON[s.getMonth()]+" ":"")+"– "+last.getDate()+". "+MON[last.getMonth()]+(last.getFullYear()!==today.getFullYear()?" "+last.getFullYear():"");
  var st=stats.map(function(x){ return x[2]?'<button type="button" class="mp-stat st-'+x[0]+'" data-act="mpjump:'+x[1]+'"'+(x[0]==="gepostet"?' title="in den letzten 7 Tagen"':'')+'><i></i><b>'+x[2]+'</b> '+x[3]+'</button>':''; }).join("");
  return '<section class="panel mp-cal" aria-label="Wochenplan"><div class="mp-calh"><div class="mp-calt"><h2>'+(off===0?'Diese Woche':off===1?'Nächste Woche':off===-1?'Letzte Woche':'KW '+isoWeek(s))+rh+'</h2><span>KW '+isoWeek(s)+' · '+rng+'</span></div>'+
    (st?'<div class="mp-stats">'+st+'</div>':'')+
    '<div class="mp-nav"><button type="button" data-act="mpweek:-1" aria-label="Woche zurück" title="Woche zurück">'+F.svg("chevL")+'</button><button type="button" data-act="mpweek:0" aria-pressed="'+(off===0)+'">Heute</button><button type="button" data-act="mpweek:1" aria-label="Woche vor" title="Woche vor">'+F.svg("chevR")+'</button></div></div>'+
    '<div class="mp-days'+(dense?' dense':'')+'">'+cols+'</div>'+(!evs.length&&!anyFree?'<p class="mp-calnone">In dieser Woche ist nichts geplant.</p>':'')+'</section>';
}
var GENF=[["reel","Reels","mreel"],["karussell","Karussells","mlayers"],["bild","Einzelbilder","mimage"]];
function genSum(){ var on=GENF.filter(function(f){ return GO[f[0]]!==false; }).map(function(f){ return f[1]; }), ins=String(GO.instructions!=null?GO.instructions:(GO.topic||"")).trim(), n=+GO.count||4;
  return n+(n===1?" Post":" Posts")+" · "+(on.length?on.join(", "):"kein Format gewählt")+(ins?" · „"+ins.slice(0,70)+(ins.length>70?"…":"")+"“":""); }
function genOpen(nDrafts){ var v=UI.mpGenOpen; if(v==null) v=F.ls("fsc_mp_genopen"); return v==null?!nDrafts:!!v; }
function genHtml(cur,b,nDrafts){
  var chs=(PL.channels||[]).filter(function(c){ return c.brand===cur; }), plan=PL.plans&&PL.plans[cur]||{perWeek:3,times:[]}, open=genOpen(nDrafts);
  var shTt=!chs.some(function(c){ return c.platform==="tiktok"; })&&PL.tiktokShared&&PL.tiktokShared.brand!==cur;
  var fm=GENF, n=+GO.count||4, sum=genSum();
  var body=open?'<div class="mp-genbody" id="mpGenBody"><div class="mp-gencol">'+
      '<label class="fl">Deine Vorgaben für diesen Plan (optional)<textarea class="f mp-vorg" data-mpgen="instructions" maxlength="2000" rows="3" placeholder="z. B. „Wintersaison startet – Fokus auf Lieferung bei Schlechtwetter, locker in Mundart, ein Post mit Frage an die Community“">'+esc(GO.instructions!=null?GO.instructions:(GO.topic||""))+'</textarea></label>'+
      '<div class="mp-qk">'+QUICK.map(function(q){ return '<button type="button" data-act="mpquick:'+esc(q)+'">+ '+esc(q)+'</button>'; }).join("")+'</div></div>'+
    '<div class="mp-gencol"><span class="mp-lab">Anzahl und Formate</span><div class="mp-fmt"><select class="f" data-mpgen="count" aria-label="Anzahl">'+[1,2,3,4,5,7,10].map(function(x){ return '<option value="'+x+'"'+(n===x?' selected':'')+'>'+x+(x===1?' Post':' Posts')+'</option>'; }).join("")+'</select>'+
      fm.map(function(f){ return '<label><input type="checkbox" data-mpgen="'+f[0]+'"'+(GO[f[0]]!==false?' checked':'')+'>'+F.svg(f[2])+f[1]+'</label>'; }).join("")+'</div>'+
      '<div class="mp-kv"><div><span class="mp-lab">Rhythmus</span><span><b>'+plan.perWeek+' pro Woche</b> · '+esc((plan.times||[]).join(", "))+' <button type="button" class="link" data-act="mpplan:'+esc(cur)+'">ändern</button></span></div>'+
        '<div><span class="mp-lab">Kanäle</span><span>'+(chs.length||shTt?chs.map(function(c){ return esc(pfLabel(c.platform))+(c.status!=="ok"?' <b class="bad-t">(neu verbinden)</b>':''); }).concat(shTt?['TikTok <span class="muted">(gemeinsam)</span>']:[]).join(", ")+' <button type="button" class="link" data-act="mktab:kanaele">verwalten</button>':'<b>keine</b> – <button type="button" class="link" data-act="mktab:kanaele">verbinden</button>')+'</span></div>'+
        '<div><span class="mp-lab">Dauerhaft</span><span>'+(b.standing?esc(String(b.standing).slice(0,140))+(String(b.standing).length>140?'…':'')+' <button type="button" class="link" data-act="mkbrand:'+esc(cur)+'">ändern</button>':'<span class="muted">Vorgaben für jeden Plan (z. B. „immer Wirte namentlich nennen“)</span> <button type="button" class="link" data-act="mkbrand:'+esc(cur)+'">eintragen</button>')+'</span></div></div></div></div>':'';
  return '<section class="panel mp-gen'+(GEN?' busy':'')+'" style="--bc:'+esc(bColor(cur))+'" aria-label="Neue Posts generieren"><div class="mp-genbar"><span class="mp-genic" aria-hidden="true">'+F.svg("mspark")+'</span>'+
    '<div class="mp-gent"><b>Neue Posts für '+esc(b.name)+'</b><span id="mpGenSum">'+(GEN?'KI schreibt Texte und Hashtags – dauert ca. 1 Minute …':esc(sum))+'</span></div>'+
    '<div class="mp-genbtns"><button type="button" class="btn mp-genx" data-act="mpgenopen" aria-expanded="'+open+'"'+(open?' aria-controls="mpGenBody"':'')+'>'+F.svg("sliders")+' Optionen '+F.svg("chevD")+'</button>'+
    '<button type="button" class="btn primary" data-act="mpgen"'+(GEN||!PL.ki?' disabled':'')+'>'+F.svg("mspark")+(GEN?' KI schreibt …':' Generieren')+'</button></div></div>'+
    (!PL.ki?'<div class="mp-kioff">Die KI-Funktion „Marketing“ ist nicht aktiv (Einstellungen → KI) oder das Monatslimit ist erreicht.</div>':'')+body+'</section>';
}
function emptyBox(icon,title,txt,btn){ return '<div class="panel mp-empty"><span class="ic">'+F.svg(icon)+'</span><div class="mp-et"><b>'+title+'</b><span>'+txt+'</span></div>'+(btn||'')+'</div>'; }
function planHtml(){
  if(!PL){ load(); return '<div class="mp" aria-busy="true"><div class="panel mp-sk" style="min-height:200px"></div><div class="panel mp-sk" style="min-height:74px"></div><div class="panel mp-sk" style="min-height:280px"></div></div>'; }
  if(!PL.ok) return '<div class="notice"><span>'+esc(PL.error)+'</span><button type="button" class="btn sm" data-act="mpreload">Erneut versuchen</button></div>';
  var bs=brands(), cur=UI.mkBrand, b=brandOf(cur), alle=cur==="alle";
  var chips='<div class="mp-chips" role="group" aria-label="Marke">'+[{key:"alle",name:"Alle",colors:{}}].concat(bs).map(function(x){ var n=(PL.posts||[]).filter(function(p){ return (x.key==="alle"||p.brand===x.key)&&p.status==="entwurf"; }).length;
    return '<button type="button" data-act="mpbrand:'+esc(x.key)+'" aria-pressed="'+(x.key===cur)+'">'+(x.colors&&x.colors.primary?'<i style="--bc:'+esc(x.colors.primary)+'"></i>':'')+esc(x.name)+(n?' <span class="count" title="'+n+' zur Freigabe">'+n+'</span>':'')+'</button>'; }).join("")+'</div>';
  var mine=(PL.posts||[]).filter(function(p){ return alle||p.brand===cur; });
  var drafts=mine.filter(function(p){ return p.status==="entwurf"; }).sort(byTime), planned=mine.filter(function(p){ return p.status==="geplant"||p.status==="läuft"; }).sort(byTime);
  var byPosted=function(a,b){ return String(b.postedAt||b.scheduledAt).localeCompare(String(a.postedAt||a.scheduledAt)); };
  var errs=mine.filter(function(p){ return p.status==="fehler"||p.status==="teilweise"; }).sort(byPosted), done=mine.filter(function(p){ return p.status==="gepostet"; }).sort(byPosted).slice(0,30);
  var wk=Date.now()-7*864e5, doneWeek=done.filter(function(p){ return Date.parse(p.postedAt||p.scheduledAt)>wk; }).length;
  var stats=[["fehler","mps-err",errs.length,"Fehler"],["entwurf","mps-frei",drafts.length,"zur Freigabe"],["geplant","mps-plan",planned.length,"geplant"],["gepostet","mps-done",doneWeek,"gepostet"]];
  var sec=function(id,cls,t,sub,list,right,empty,slim,more){ return '<section class="mp-sec st-'+cls+'" id="'+id+'" aria-labelledby="'+id+'-h"><div class="mp-sh"><h2 id="'+id+'-h"><i aria-hidden="true"></i>'+t+'</h2>'+(list.length?'<span class="n">'+list.length+'</span>':'')+(sub&&list.length?'<p>'+sub+'</p>':'')+(right?'<span class="r">'+right+'</span>':'')+'</div>'+
    (list.length?'<div class="panel mp-list">'+list.map(function(p){ return postCard(p,slim); }).join("")+(more||'')+'</div>':empty)+'</section>'; };
  var allGo=drafts.filter(function(p){ return p.media.status==="fertig"&&p.platforms.length; }).length;
  var DONE_N=6, doneShow=UI.mpDoneAll?done:done.slice(0,DONE_N);
  // Fehler zuerst: selten, aber dringend – sonst stehen sie unter vielen Entwürfen
  return '<div class="mp'+(alle?' alle':'')+'">'+chips+weekHtml(mine,cur,stats)+(alle?'':genHtml(cur,b,drafts.length))+
    (errs.length?sec("mps-err","fehler","Fehler beim Posten","Nicht auf allen Plattformen gepostet – nochmal versuchen oder entfernen",errs,"","",true):'')+
    sec("mps-frei","entwurf","Zur Freigabe","Prüfen, Zeit und Plattformen anpassen, dann „Go“",drafts,allGo>1?'<button type="button" class="btn primary sm" data-act="mpgoall">'+F.svg("mgo")+' Alle '+allGo+' freigeben</button>':'',
      alle?emptyBox("edit","Keine Entwürfe","Wähle oben eine Marke – dort schreibt die KI über „Generieren“ neue Posts."):emptyBox("checkCircle","Keine Entwürfe für "+esc(b.name),"Alles freigegeben. Neue Posts, Reels und Karussells schreibt die KI – oben bei „Neue Posts“ auf „Generieren“."),false)+
    sec("mps-plan","geplant","Geplant","Geht zur geplanten Zeit automatisch raus",planned,"",emptyBox("clock","Nichts geplant","Mit „Go“ landen Posts hier und gehen zur geplanten Zeit automatisch raus."),true)+
    (done.length?sec("mps-done","gepostet","Veröffentlicht","",doneShow,"","",true,done.length>DONE_N?'<div class="mp-morebar"><button type="button" class="btn sm" data-act="mpdone">'+(UI.mpDoneAll?'Weniger anzeigen':'Alle '+done.length+' anzeigen')+'</button></div>':''):'')+
    '</div>';
}
function byTime(a,b){ return String(a.scheduledAt||"").localeCompare(String(b.scheduledAt||"")); }
function upd(post){ PL.posts=PL.posts.map(function(p){ return p.id===post.id?post:p; }); }
function postOp(id,op,extra,msg){ return api("/admin/api/mkt/post",Object.assign({id:id,op:op},extra||{})).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; } if(j.post) upd(j.post); else if(op==="delete") PL.posts=PL.posts.filter(function(p){ return p.id!==id; }); if(msg) F.toast(msg); F.render(); schedulePoll(); return j; }); }
F.action("mpbrand",function(k){ UI.mkBrand=k; F.ls("fsc_mk_brand",k); F.render(); });
F.action("mpreload",function(){ PL=null; F.render(); });
// Wochenplan blättern, zu einem Post bzw. Abschnitt springen, Optionen „Neue Posts“ auf/zu, alle Veröffentlichten zeigen
F.action("mpweek",function(v){ UI.mpWeek=+v===0?0:(UI.mpWeek||0)+(+v||0); F.render(); });
F.action("mpjump",function(id){ var sec=id.indexOf("mps-")===0, el=document.getElementById(sec?id:"mp-"+id);
  if(!el&&!sec){ UI.mpDoneAll=true; F.render(); el=document.getElementById("mp-"+id); }
  if(!el) return; var calm=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({behavior:calm?"auto":"smooth",block:sec?"start":"center"});
  if(!sec){ el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); setTimeout(function(){ el.classList.remove("flash"); },2000); } });
F.action("mpgenopen",function(a,el){ var open=!!(el&&el.getAttribute("aria-expanded")==="true"); UI.mpGenOpen=!open; F.ls("fsc_mp_genopen",!open); F.render();
  if(!open){ var t=document.querySelector("[data-mpgen=instructions]"); if(t&&!(window.matchMedia&&matchMedia("(hover:none)").matches)) t.focus({preventScroll:true}); } });
F.action("mpdone",function(){ UI.mpDoneAll=!UI.mpDoneAll; F.render(); });
// Handy: im Wochenplan den heutigen Tag ins Bild schieben
// (nach F.scrollRestore, das sonst die Wisch-Position der vorigen Woche zurückholt): neue Woche → heute bzw. Montag zeigen
var lastWk=null;
function planAfter(){ capCheck(); var off=UI.mpWeek||0, chg=lastWk!==off; lastWk=off;
  requestAnimationFrame(function(){ var w=document.querySelector(".mp-days"); if(!w||w.scrollWidth<=w.clientWidth+4) return; var d=w.querySelector(".today");
    if(chg) w.scrollLeft=d?Math.max(0,d.offsetLeft-w.offsetLeft-12):0; else if(d&&!w.scrollLeft) w.scrollLeft=Math.max(0,d.offsetLeft-w.offsetLeft-12); }); }
// „Ganzen Text anzeigen“ nur, wenn der Text wirklich gekürzt ist (Breite, Absätze, Emojis – vorher nicht sicher zu schätzen)
function capCheck(){ document.querySelectorAll(".mp-card .mp-cap:not(.open)").forEach(function(c){ var bt=c.nextElementSibling; if(bt&&bt.classList.contains("mp-more")) bt.hidden=c.scrollHeight<=c.clientHeight+1; }); }
var capT=0; window.addEventListener("resize",function(){ clearTimeout(capT); capT=setTimeout(function(){ if(F.current==="mkt") capCheck(); },150); });
// freier Termin im Wochenplan: „Neue Posts“ aufklappen und hinscrollen (der Server vergibt beim Generieren genau diese Termine)
F.action("mpfree",function(){ UI.mpGenOpen=true; F.ls("fsc_mp_genopen",true); F.render(); var g=document.querySelector(".mp-gen"); if(!g) return;
  g.scrollIntoView({behavior:window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
  var t=document.querySelector("[data-mpgen=instructions]"); if(t&&!(window.matchMedia&&matchMedia("(hover:none)").matches)) t.focus({preventScroll:true}); });
F.listen("change","[data-mpgen]",function(el){ var k=el.getAttribute("data-mpgen"); GO[k]=el.type==="checkbox"?el.checked:el.value; F.ls("fsc_mk_gen",GO); });
F.listen("input","[data-mpgen=instructions]",function(el){ GO.instructions=el.value; F.ls("fsc_mk_gen",GO); genSumPaint(); });
F.listen("change","[data-mpgen]",function(){ genSumPaint(); });
function genSumPaint(){ var e=document.getElementById("mpGenSum"); if(e&&!GEN) e.textContent=genSum(); }
F.action("mpquick",function(q){ var el=document.querySelector("[data-mpgen=instructions]"), v=(el?el.value:(GO.instructions||"")).trim(); v=v?(v.replace(/[.,;]$/,"")+", "+q):q; GO.instructions=v; F.ls("fsc_mk_gen",GO); genSumPaint(); if(el){ el.value=v; el.focus(); } });
F.action("mpgen",function(){
  if(GEN) return; GEN=true; F.render();
  api("/admin/api/mkt/generate",{brand:UI.mkBrand,count:+GO.count||4,formats:{reel:GO.reel!==false,karussell:GO.karussell!==false,bild:GO.bild!==false},instructions:GO.instructions!=null?GO.instructions:(GO.topic||"")}).then(function(j){
    GEN=false; if(!j||!j.ok){ F.toast((j&&j.error)||"Generieren fehlgeschlagen",true); F.render(); return; }
    PL.posts=j.posts.concat(PL.posts||[]); F.toast(j.posts.length+(j.posts.length===1?" Post erstellt":" Posts erstellt")+(j.eur?" (KI-Kosten ca. "+String(j.eur.toFixed(2)).replace(".",",")+" €)":"")+" – Bilder und Videos werden gerade gemacht"); F.render(); schedulePoll();
  }).catch(function(){ GEN=false; F.render(); F.toast("Keine Verbindung zum Server",true); });
});
F.action("mppf",function(a){ var x=a.split("|"), p=PL.posts.find(function(q){ return q.id===x[0]; }); if(!p) return; var on=p.platforms.indexOf(x[1])>-1, list=on?p.platforms.filter(function(k){ return k!==x[1]; }):p.platforms.concat([x[1]]); postOp(p.id,"update",{patch:{platforms:list}}); });
F.listen("change","[data-mptime]",function(el){ if(!el.value) return; postOp(el.getAttribute("data-mptime"),"update",{patch:{scheduledAt:new Date(el.value).toISOString()}},"Zeit geändert"); });
F.action("mpgo",function(id){ postOp(id,"go",null,"Freigegeben – geht zur geplanten Zeit raus"); });
F.action("mpgoall",function(){ var ids=PL.posts.filter(function(p){ return p.status==="entwurf"&&(UI.mkBrand==="alle"||p.brand===UI.mkBrand)&&p.media.status==="fertig"&&p.platforms.length; }).map(function(p){ return p.id; });
  F.confirm(ids.length+" Posts freigeben? Sie gehen zu ihren geplanten Zeiten automatisch raus.","Alle freigeben",function(){ var chain=Promise.resolve(); ids.forEach(function(id){ chain=chain.then(function(){ return api("/admin/api/mkt/post",{id:id,op:"go"}).then(function(j){ if(j&&j.post) upd(j.post); }); }); }); chain.then(function(){ F.toast(ids.length+" Posts freigegeben"); F.render(); schedulePoll(); }); }); });
F.action("mpnow",function(id){ var p=PL.posts.find(function(q){ return q.id===id; }); F.confirm("Jetzt sofort auf "+(p?p.platforms.map(pfLabel).join(", "):"")+" posten?","Jetzt posten",function(){ postOp(id,"now",null,"Wird gepostet …"); }); });
F.action("mpstop",function(id){ postOp(id,"stop",null,"Gestoppt – wieder bei „Zur Freigabe“"); });
F.action("mpretry",function(a){ var x=a.split("|"); postOp(x[0],"retry",{platform:x[1]||""},"Wird nochmal versucht …"); });
F.action("mprer",function(id){ postOp(id,"rerender",null,"Wird neu erstellt …"); });
F.action("mpdel",function(id){ var p=PL.posts.find(function(q){ return q.id===id; }); F.confirm(p&&p.status==="gepostet"?"Aus der Liste entfernen? (Bei den Plattformen bleibt der Post online.)":"Diesen Entwurf verwerfen?",p&&p.status==="gepostet"?"Entfernen":"Verwerfen",function(){ postOp(id,"delete",null,"Entfernt"); },true); });
/* Caption ganz zeigen / wieder kürzen – direkt im DOM, der Zustand bleibt für das nächste Neuzeichnen gemerkt */
F.action("mpcap",function(id,el){ var o=UI.mpCapOpen=UI.mpCapOpen||{}; o[id]=!o[id];
  var card=el&&el.closest(".mp-card"), c=card&&card.querySelector(".mp-cap");
  if(!c){ F.render(); return; }
  c.classList.toggle("open",!!o[id]); el.setAttribute("aria-expanded",String(!!o[id])); el.textContent=o[id]?"Weniger anzeigen":"Ganzen Text anzeigen"; });
F.action("mptt",function(id){ var p=PL.posts.find(function(q){ return q.id===id; }); var t=p&&p.preview&&p.preview.tiktok||""; if(!t) return F.toast("Kein TikTok-Text",true); try{ navigator.clipboard.writeText(t); F.toast("TikTok-Text kopiert – in der TikTok-App einfügen"); }catch(e){ F.toast("Bitte von Hand kopieren",true); } });
F.action("mpview",function(id){ var p=PL.posts.find(function(q){ return q.id===id; }); if(!p) return; var base="/admin/api/mkt/post-file?id="+encodeURIComponent(id)+"&v="+encodeURIComponent(p.media.rev||"");
  F.modal('<div class="row-between"><h2 style="font-size:17px">'+esc(p.idea||"")+'</h2>'+F.btnClose()+'</div><div class="mp-car">'+Array.from({length:p.media.images}).map(function(_,i){ return '<a href="'+base+'&i='+i+'&dl=1" download title="Herunterladen"><img src="'+base+'&i='+i+'" alt="Folie '+(i+1)+'"></a>'; }).join("")+'</div><p class="muted small">Klick auf ein Bild lädt es herunter.</p>',"wide"); });
/* Reel-Vorschau: Handyformat 9:16 in Bildschirmhöhe, startet mit Ton; eigene Regler statt Browser-Vollbild.
   Die Instagram-Oberfläche (Name, Text, Musik, Symbole rechts) zeigt, ob Texte im Video verdeckt werden – per Auge-Knopf ausblendbar. */
var MPV_I={play:'<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',pause:'<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  vol:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a7.8 7.8 0 0 1 0 11"/>',mute:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  heart:'<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',cmt:'<path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.6A8.5 8.5 0 1 1 20.5 11.5z"/>',
  send:'<path d="M21 3.5 10.5 13.5M21 3.5l-6.5 17-4-7-7-4z"/>',dots:'<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'};
function mpvI(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+MPV_I[k]+'</svg>'; }
function mpvFmt(s){ s=Math.max(0,Math.floor(s||0)); return Math.floor(s/60)+":"+("0"+s%60).slice(-2); }
function mpvMsg(t){ var m=document.getElementById("mpvMsg"); if(!m) return; m.textContent=t; clearTimeout(mpvMsg.t); mpvMsg.t=setTimeout(function(){ m.textContent=""; },1600); }
function mpvSync(){ var v=document.getElementById("mpvV"), ph=document.getElementById("mpvPh"); if(!v||!ph) return;
  ph.classList.toggle("paused",v.paused);
  var pb=document.getElementById("mpvPlay"), mb=document.getElementById("mpvMute");
  if(pb){ pb.innerHTML=mpvI(v.paused?"play":"pause"); pb.setAttribute("aria-label",v.paused?"Abspielen (Leertaste)":"Pause (Leertaste)"); pb.title=pb.getAttribute("aria-label"); }
  if(mb){ mb.innerHTML=mpvI(v.muted?"mute":"vol"); mb.setAttribute("aria-label",v.muted?"Ton an (M)":"Ton aus (M)"); mb.title=mb.getAttribute("aria-label"); }
}
function mpvWire(v){
  var bar=document.getElementById("mpvBar"), pos=document.getElementById("mpvPos"), t=document.getElementById("mpvT"), drag=false;
  ["play","pause","volumechange"].forEach(function(ev){ v.addEventListener(ev,mpvSync); });
  v.addEventListener("click",function(){ if(v.paused) v.play().catch(function(){}); else v.pause(); });
  (function tick(){ if(!v.isConnected) return; var d=v.duration||0; if(!drag) pos.style.width=(d?v.currentTime/d*100:0)+"%"; t.textContent=mpvFmt(v.currentTime)+" / "+mpvFmt(d); requestAnimationFrame(tick); })();
  function seek(e){ var r=bar.getBoundingClientRect(), x=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)); pos.style.width=x*100+"%"; if(v.duration) v.currentTime=x*v.duration; }
  bar.addEventListener("pointerdown",function(e){ drag=true; bar.classList.add("drag"); try{ bar.setPointerCapture(e.pointerId); }catch(er){} seek(e); });
  bar.addEventListener("pointermove",function(e){ if(drag) seek(e); });
  ["pointerup","pointercancel"].forEach(function(ev){ bar.addEventListener(ev,function(){ drag=false; bar.classList.remove("drag"); }); });
}
F.action("mpvid",function(id){ var p=(PL.posts||[]).find(function(q){ return q.id===id; }); if(!p||!p.media) return;
  var base="/admin/api/mkt/post-file?id="+encodeURIComponent(id)+"&v="+encodeURIComponent(p.media.rev||""), b=brandOf(p.brand), ch=chOf(p.brand,"instagram")||chOf(p.brand,"tiktok"), acc=ch&&ch.account||{};
  var who=String(acc.handle||acc.name||b.name||"").replace(/^@/,""), col=b.logoBg==="dark"?((b.colors&&b.colors.dark)||"#0a0a0f"):(b.logo||b.logoUploaded)?"#fff":((b.colors&&b.colors.primary)||"#3a4a5c");   /* Kreis wie das Profilbild: Logo auf passendem Grund */
  var av=(b.logo||b.logoUploaded)?'<img src="/admin/api/mkt/logo?key='+encodeURIComponent(b.key)+'&v='+encodeURIComponent(b.logoUploaded?"u":"d")+'" alt="">':esc(String(b.name||"?").split(/\s+/).map(function(w){ return w.charAt(0); }).join("").slice(0,2).toUpperCase());
  var cap=String(p.preview&&(p.preview.instagram||p.preview[Object.keys(p.preview)[0]])||(p.captions&&p.captions.instagram)||"").replace(/\n\n(#\S+\s*)+$/,"");
  var mus=p.track&&p.track.name?p.track.name:p.music==="none"?"Originalton – "+who:"Musik passend zur Stimmung", pure=F.ls("fsc_mpv_pure")===true;
  F.modal('<div class="mpv-wrap"><div class="mpv-ph paused'+(pure?' pure':'')+'" id="mpvPh">'+
      '<video id="mpvV" src="'+base+'&kind=video" poster="'+base+'&kind=cover" playsinline loop preload="auto"></video>'+
      '<div class="mpv-ui" aria-hidden="true"><div class="mpv-top">Reels</div>'+
        '<div class="mpv-side">'+mpvI("heart")+mpvI("cmt")+mpvI("send")+mpvI("dots")+'</div>'+
        '<div class="mpv-bot"><div class="mpv-who"><span class="mpv-av" style="background:'+esc(col)+'">'+av+'</span><span class="ell">'+esc(who)+'</span><span class="mpv-fo">Folgen</span></div>'+
          (cap?'<div class="mpv-cap" data-act="mpvcap">'+esc(cap)+'</div>':'')+(mus?'<div class="mpv-mus">'+F.svg("mnote")+'<span class="ell">'+esc(mus)+'</span></div>':'')+'</div></div>'+
      '<div class="mpv-big">'+mpvI("play")+'</div><div class="mpv-msg" id="mpvMsg"></div>'+
      '<div class="mpv-bar" id="mpvBar" role="slider" aria-label="Position im Video"><i><b id="mpvPos"></b></i></div></div>'+
    '<div class="mpv-ctl"><button type="button" class="x" data-closemodal aria-label="Schließen (Esc)" title="Schließen (Esc)">'+F.svg("close")+'</button>'+
      '<button type="button" id="mpvPlay" data-act="mpvplay"></button><button type="button" id="mpvMute" data-act="mpvmute"></button>'+
      '<button type="button" data-act="mpvui" aria-pressed="'+!pure+'" aria-label="Instagram-Oberfläche ein/aus" title="Instagram-Oberfläche ein/aus – zeigt, was Name, Text und Symbole verdecken">'+F.svg("eye")+'</button>'+
      '<a class="dl" href="'+base+'&kind=video&dl=1" download aria-label="Video herunterladen" title="Video herunterladen">'+F.svg("download")+'</a>'+
      (p.status==="entwurf"||p.status==="geplant"?'<button type="button" class="ed" data-act="mped:'+esc(p.id)+'" aria-label="Post bearbeiten" title="Post bearbeiten">'+F.svg("edit")+'</button>':'')+
      '<span class="mpv-t" id="mpvT">0:00</span></div></div>',"mpv");
  var v=document.getElementById("mpvV"); mpvWire(v); mpvSync();
  v.muted=false; var pr=v.play();   // Klick zählt als Erlaubnis → startet mit Ton; blockiert der Browser, läuft es stumm mit Hinweis
  if(pr&&pr.catch) pr.catch(function(){ v.muted=true; v.play().catch(function(){}); mpvMsg("Ton aus – tippe auf den Lautsprecher"); });
});
F.action("mpvplay",function(){ var v=document.getElementById("mpvV"); if(v){ if(v.paused) v.play().catch(function(){}); else v.pause(); } });
F.action("mpvmute",function(){ var v=document.getElementById("mpvV"); if(v){ v.muted=!v.muted; if(!v.muted&&v.paused) v.play().catch(function(){}); mpvMsg(v.muted?"Ton aus":"Ton an"); } });
F.action("mpvui",function(){ var ph=document.getElementById("mpvPh"), on=ph.classList.toggle("pure"); F.ls("fsc_mpv_pure",on); var bt=document.querySelector('[data-act="mpvui"]'); if(bt) bt.setAttribute("aria-pressed",String(!on)); mpvMsg(on?"Nur Video":"Mit Instagram-Oberfläche"); });
F.action("mpvcap",function(){ var c=document.querySelector(".mpv-cap"); if(c) c.classList.toggle("open"); });
document.addEventListener("keydown",function(e){ var v=document.getElementById("mpvV"); if(!v||e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName||"")) return;
  if(e.key===" "||e.key==="k"){ e.preventDefault(); if(v.paused) v.play().catch(function(){}); else v.pause(); }
  else if(e.key==="m"||e.key==="M"){ v.muted=!v.muted; mpvMsg(v.muted?"Ton aus":"Ton an"); }
  else if(e.key==="ArrowLeft"){ e.preventDefault(); v.currentTime=Math.max(0,v.currentTime-3); }
  else if(e.key==="ArrowRight"){ e.preventDefault(); v.currentTime=Math.min(v.duration||0,v.currentTime+3); } });
// Liste: Reel läuft beim Drüberfahren stumm an (nur mit Maus)
if(window.matchMedia&&matchMedia("(hover:hover)").matches){
  document.addEventListener("mouseover",function(e){ var r=e.target.closest&&e.target.closest(".mp-reel"); if(!r||r.contains(e.relatedTarget)) return; var v=r.querySelector("video"); if(v){ v.muted=true; v.play().catch(function(){}); } });
  document.addEventListener("mouseout",function(e){ var r=e.target.closest&&e.target.closest(".mp-reel"); if(!r||r.contains(e.relatedTarget)) return; var v=r.querySelector("video"); if(v) v.pause(); });
}
// Bearbeiten: Texte je Plattform, Hashtags, Folientexte (Folien ändern → Bilder neu)
var CAPS=[["instagram","Instagram"],["facebook","Facebook"],["tiktok","TikTok"],["linkedin","LinkedIn"],["threads","Threads (max. 500)"],["bluesky","Bluesky (max. 300)"],["youtube","YouTube-Beschreibung"],["youtubeTitle","YouTube-Titel"],["pinterestTitle","Pinterest-Titel"]];
F.action("mped",function(id){ var p=PL.posts.find(function(q){ return q.id===id; }); if(!p) return; var c=p.captions||{}, h=p.hashtags||{};
  var music=(PL.music||[]);
  var slides=(p.slides||[]).map(function(s,i){ return '<div class="mp-slide" data-slide="'+i+'"><b class="small">'+(p.format==="reel"?"Szene ":"Folie ")+(i+1)+' · '+esc(s.template)+'</b>'+
    '<input class="f" data-sf="headline" value="'+esc(s.headline||"")+'" placeholder="Überschrift (*Wort* = markiert)">'+(s.sub||s.template==="hook"||s.template==="cta"?'<input class="f" data-sf="sub" value="'+esc(s.sub||"")+'" placeholder="Unterzeile">':'')+
    ((s.items||[]).length?'<textarea class="f" data-sf="items" rows="3" placeholder="Punkte (einer je Zeile)">'+esc((s.items||[]).join("\n"))+'</textarea>':'')+(s.cta||s.template==="cta"?'<input class="f" data-sf="cta" value="'+esc(s.cta||"")+'" placeholder="Knopf-Text">':'')+'</div>'; }).join("");
  F.modal('<form data-form="mped" class="mp-ed" data-id="'+esc(id)+'"><div class="row-between"><h2 style="font-size:19px">Post bearbeiten</h2>'+F.btnClose()+'</div>'+
    CAPS.map(function(k){ return '<label class="fl">'+k[1]+(/Title$/.test(k[0])?'<input class="f" name="cap_'+k[0]+'" value="'+esc(c[k[0]]||"")+'">':'<textarea class="f" name="cap_'+k[0]+'">'+esc(c[k[0]]||"")+'</textarea>')+'</label>'; }).join("")+
    '<label class="fl">Hashtags Instagram<input class="f" name="tag_instagram" value="'+esc((h.instagram||[]).join(" "))+'"></label>'+
    '<div class="mk-row2"><label class="fl">Hashtags TikTok<input class="f" name="tag_tiktok" value="'+esc((h.tiktok||[]).join(" "))+'"></label><label class="fl">Hashtags LinkedIn/Facebook<input class="f" name="tag_linkedin" value="'+esc((h.linkedin||[]).join(" "))+'"></label></div>'+
    (slides&&!/^gewinnspiel/.test(p.source||"")?'<div class="fl"><span>Texte auf den '+(p.format==="reel"?"Szenen":"Folien")+' <span class="muted small">(Änderung erzeugt '+(p.format==="reel"?"das Video":"die Bilder")+' neu)</span></span>'+slides+'</div>':'')+
    (p.format==="reel"&&!/^gewinnspiel/.test(p.source||"")&&PL.musicCfg?'<div class="fl"><span>Musik <span class="muted small">(Änderungen gelten sofort)</span></span>'+musPanel(p)+'</div>':'')+
    '<div class="mk-row2"><label class="fl">Standort (Instagram/Facebook)<select class="f" name="place"><option value="">Kein Standort</option>'+((PL.locations&&PL.locations[p.brand])||[]).map(function(l){ return '<option value="'+esc(l.id)+'"'+(p.place&&p.place.id===l.id?' selected':'')+'>'+esc(l.name)+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Erster Kommentar (Instagram/Facebook)<input class="f" name="firstComment" maxlength="300" value="'+esc(p.firstComment||"")+'"></label></div>'+
    '<div class="mk-row2"><label class="fl">Personen markieren (Instagram)<input class="f" name="tags" placeholder="@lisa.montafon @kantineur" value="'+esc((p.tags||[]).map(function(u){ return "@"+u; }).join(" "))+'"></label>'+
    '<label class="fl">Collab mit (Instagram, max. 3 – Partner bestätigt in Instagram)<input class="f" name="collabs" placeholder="@partnerkonto" value="'+esc((p.collabs||[]).map(function(u){ return "@"+u; }).join(" "))+'"></label></div>'+
    '<div class="mp-place"><input class="f" id="mpPlaceQ" placeholder="Ort suchen (z. B. Schruns, Gasthof …) oder Instagram-Orts-Link einfügen" data-brand="'+esc(p.brand)+'"><button type="button" class="btn sm" data-act="mpplace:'+esc(p.brand)+'">Ort suchen / hinzufügen</button><div id="mpPlaceR" class="mp-placer"></div></div>'+
    '<label class="fl">Bildbeschreibung (Alt-Text)<input class="f" name="altText" maxlength="400" value="'+esc(p.altText||"")+'"></label>'+
    '<label class="fl">Eigener Link (statt Website; Facebook, LinkedIn, YouTube, Pinterest)<input class="f" name="link" placeholder="https://…" value="'+esc(p.link||"")+'"></label>'+
    optsHtml(p)+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></span></div></form>',"wide"); });
// Zusatz-Optionen je Plattform (eingeklappt)
function optsHtml(p){ var o=p.opts||{}, reel=p.format==="reel", chk=function(k,t,def){ var on=o[k]===undefined?!!def:!!o[k]; return '<label class="chk"><input type="checkbox" data-opt="'+k+'"'+(on?' checked':'')+'> '+t+'</label>'; },
    sel=function(k,t,l){ return '<label class="fl">'+t+'<select class="f" data-opt="'+k+'">'+l.map(function(x){ return '<option value="'+esc(x[0])+'"'+((o[k]||"")===x[0]?' selected':'')+'>'+esc(x[1])+'</option>'; }).join("")+'</select></label>'; },
    inp=function(k,t,ph){ return '<label class="fl">'+t+'<input class="f" data-opt="'+k+'" value="'+esc(o[k]||"")+'" placeholder="'+esc(ph||"")+'"></label>'; };
  return '<details class="mp-opts"><summary>Mehr Optionen je Plattform</summary>'+
    '<div class="mp-og"><b>Instagram</b>'+chk("igStory","Zusätzlich als Story teilen")+chk("igCommentsOff","Kommentare ausschalten")+(reel?chk("igShareToFeed","Reel auch im Feed zeigen",true)+chk("igTrial","Test-Reel (zuerst nur Nicht-Follower, Instagram entscheidet nach Erfolg)")+
      '<div class="mk-row2">'+inp("igThumbOffset","Titelbild aus dem Video (Millisekunde, leer = gestaltetes Titelbild)","z. B. 2500")+inp("igAudioName","Name der Tonspur","z. B. kochdu Sound")+'</div>':'')+'</div>'+
    '<div class="mp-og"><b>Facebook</b>'+chk("fbStory","Zusätzlich als Story der Seite teilen")+'</div>'+
    '<div class="mp-og"><b>Threads</b><div class="mk-row2">'+sel("thReplyControl","Wer darf antworten?",[["","Alle (Standard)"],["accounts_you_follow","Nur Profile, denen du folgst"],["followers_only","Nur Follower"],["mentioned_only","Nur Erwähnte"]])+inp("thTopic","Thema (Topic-Tag)","z. B. Montafon")+'</div></div>'+
    '<div class="mp-og"><b>LinkedIn</b><div class="mk-row2">'+sel("liVisibility","Sichtbarkeit",[["","Öffentlich"],["CONNECTIONS","Nur Kontakte"]])+'</div>'+chk("liNoReshare","Teilen durch andere verbieten")+'</div>'+
    (reel?'<div class="mp-og"><b>YouTube</b><div class="mk-row2">'+sel("ytPrivacy","Sichtbarkeit",[["","Öffentlich"],["unlisted","Nicht gelistet"],["private","Privat"]])+'</div>'+chk("ytKids","Speziell für Kinder")+chk("ytAi","Enthält KI-erzeugte, realistisch wirkende Inhalte (Kennzeichnung)")+'</div>':'')+
    (!reel?'<div class="mp-og"><b>Pinterest</b>'+inp("pinLink","Ziel-Link des Pins","https://…")+'</div>':'')+
    '<div class="mp-og"><b>Bluesky</b><div class="mk-row2">'+sel("bsReply","Wer darf antworten?",[["","Alle"],["followers","Nur Follower"],["following","Nur Profile, denen du folgst"],["mentioned","Nur Erwähnte"],["nobody","Niemand"]])+sel("bsLang","Sprache",[["","Deutsch"],["en","Englisch"],["it","Italienisch"],["nl","Niederländisch"],["fr","Französisch"]])+'</div></div>'+
    '</details>'; }
F.action("mpplace",function(brand){ var q=document.getElementById("mpPlaceQ"), box=document.getElementById("mpPlaceR"), v=q?q.value.trim():""; if(!v) return;
  var addLoc=function(name,id){ api("/admin/api/mkt/location-add",{brand:brand,name:name,id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); PL.locations=j.locations; var sel=document.querySelector('form[data-form="mped"] [name="place"]');
    if(sel){ sel.insertAdjacentHTML("beforeend",'<option value="'+esc(j.place.id)+'">'+esc(j.place.name)+'</option>'); sel.value=j.place.id; } box.innerHTML=""; q.value=""; F.toast("Ort „"+j.place.name+"“ hinzugefügt und gewählt"); }); };
  if(/instagram\.com\/explore\/locations\/|facebook\.com\/|^\d{5,}$/.test(v)){ var nm=(v.match(/explore\/locations\/\d+\/([^/?]+)/)||[])[1]; var name=window.prompt("Name für diesen Ort",nm?decodeURIComponent(nm).replace(/-/g," "):""); if(name) addLoc(name,v); return; }
  box.innerHTML='<span class="muted small">Suche …</span>';
  api("/admin/api/mkt/place-search",{brand:brand,q:v}).then(function(j){ if(!j||!j.ok){ box.innerHTML='<span class="bad-t small">'+esc((j&&j.error)||"Fehler")+'</span>'; return; }
    box.innerHTML=j.places.length?j.places.map(function(x){ return '<button type="button" class="link" data-pid="'+esc(x.id)+'" data-pname="'+esc(x.name)+'">'+esc(x.name)+(x.city?' <span class="muted small">'+esc(x.city)+'</span>':'')+'</button>'; }).join(""):'<span class="muted small">Nichts gefunden – Instagram-Orts-Link einfügen.</span>';
    Array.prototype.forEach.call(box.querySelectorAll("[data-pid]"),function(b){ b.addEventListener("click",function(){ addLoc(b.getAttribute("data-pname"),b.getAttribute("data-pid")); }); }); }); });
F.form("mped",function(form){ var id=form.getAttribute("data-id"), p=PL.posts.find(function(q){ return q.id===id; }); if(!p) return;
  var caps={}, tags={}, tg=function(v){ return String(v||"").split(/[\s,]+/).filter(Boolean).map(function(t){ return t.charAt(0)==="#"?t:"#"+t; }); };
  CAPS.forEach(function(k){ var el=form.querySelector('[name="cap_'+k[0]+'"]'); if(el) caps[k[0]]=el.value; });
  tags.instagram=tg(form.querySelector('[name="tag_instagram"]').value); tags.tiktok=tg(form.querySelector('[name="tag_tiktok"]').value); tags.linkedin=tg(form.querySelector('[name="tag_linkedin"]').value); tags.facebook=tags.linkedin.slice(0,3);
  var patch={captions:caps,hashtags:tags}, changed=false;
  var sl=(p.slides||[]).map(function(s,i){ var box=form.querySelector('[data-slide="'+i+'"]'); if(!box) return s; var o=Object.assign({},s); Array.prototype.forEach.call(box.querySelectorAll("[data-sf]"),function(el){ var k=el.getAttribute("data-sf"), v=k==="items"?el.value.split("\n").map(function(x){ return x.trim(); }).filter(Boolean):el.value; if(JSON.stringify(v)!==JSON.stringify(s[k]||(k==="items"?[]:""))) changed=true; o[k]=v; }); return o; });
  if(changed) patch.slides=sl;
  var mu=form.querySelector('[name="music"]'); if(mu&&mu.value!==(p.music||"")) patch.music=mu.value;
  var pl0=form.querySelector('[name="place"]'); if(pl0&&pl0.value!==((p.place&&p.place.id)||"")) patch.place=pl0.value;
  var op={}; Array.prototype.forEach.call(form.querySelectorAll("[data-opt]"),function(el){ var k=el.getAttribute("data-opt"); op[k]=el.type==="checkbox"?el.checked:el.value; }); patch.opts=op; patch.link=form.querySelector('[name="link"]').value.trim();
  patch.firstComment=form.querySelector('[name="firstComment"]').value; patch.tags=form.querySelector('[name="tags"]').value; patch.collabs=form.querySelector('[name="collabs"]').value; patch.altText=form.querySelector('[name="altText"]').value;
  api("/admin/api/mkt/post",{id:id,op:"update",patch:patch}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); upd(j.post); F.closeModal(); F.toast(changed||patch.music!==undefined?"Gespeichert – wird neu erstellt":"Gespeichert"); F.render(); schedulePoll(); }); });
// Einen Post mit Anweisung neu schreiben lassen (KI), Bild/Reel wird neu erzeugt
F.action("mprw",function(id){ var p=PL.posts.find(function(q){ return q.id===id; }); if(!p) return;
  F.modal('<form data-form="mprw" data-id="'+esc(id)+'" class="mp-ed"><div class="row-between"><h2 style="font-size:19px">Neu schreiben</h2>'+F.btnClose()+'</div><p class="muted small" style="margin:0">'+esc(p.idea||"")+'</p>'+
    '<label class="fl">Was soll anders sein?<textarea class="f" name="ins" rows="4" maxlength="2000" autofocus placeholder="z. B. „lustiger, mehr Mundart, Fokus auf Pizza, Frage an die Community am Schluss“"></textarea></label>'+
    '<div class="mp-qk">'+["lustiger","seriöser","kürzer","mehr Emojis","weniger Emojis","andere Hashtags","anderes Thema","Frage an die Community"].map(function(q){ return '<button type="button" data-act="mprwq:'+esc(q)+'">+ '+esc(q)+'</button>'; }).join("")+'</div>'+
    '<div class="foot"><span class="muted small">Format bleibt, Texte, Hashtags und '+(p.format==="reel"?"Video":"Bilder")+' werden neu erstellt.</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary" id="mpRwBtn">'+F.svg("mspark")+' Neu schreiben</button></span></div></form>',"narrow"); });
F.action("mprwq",function(q){ var el=document.querySelector('form[data-form="mprw"] [name=ins]'); if(!el) return; var v=el.value.trim(); el.value=v?(v.replace(/[.,;]$/,"")+", "+q):q; el.focus(); });
F.form("mprw",function(form){ var id=form.getAttribute("data-id"), ins=form.ins.value.trim(), b=document.getElementById("mpRwBtn"); if(!ins) return F.toast("Bitte kurz sagen, was anders sein soll",true);
  if(b){ b.disabled=true; b.textContent="KI schreibt um …"; }
  api("/admin/api/mkt/post",{id:id,op:"rewrite",instruction:ins}).then(function(j){ if(!j||!j.ok){ if(b){ b.disabled=false; b.textContent="Neu schreiben"; } return F.toast((j&&j.error)||"Fehler",true); } upd(j.post); F.closeModal(); F.toast("Neu geschrieben – "+(j.post.format==="reel"?"Video":"Bilder")+" werden erstellt"); F.render(); schedulePoll(); }).catch(function(){ if(b){ b.disabled=false; } F.toast("Keine Verbindung",true); }); });

// Rhythmus je Marke
F.action("mpplan",function(k){ var pl=PL.plans&&PL.plans[k]||{perWeek:3,times:[]};
  F.modal('<form data-form="mpplan" data-key="'+esc(k)+'" class="mp-ed"><div class="row-between"><h2 style="font-size:19px">Rhythmus für '+esc(brandOf(k).name)+'</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Posts pro Woche<input class="f" type="number" min="1" max="14" name="perWeek" value="'+pl.perWeek+'"></label>'+
    '<label class="fl">Beste Zeiten (eine je Zeile, z. B. „do 11:00“) – „Go“ nimmt die nächste freie Zeit, mindestens 20 Stunden Abstand<textarea class="f" name="times" rows="6">'+esc((pl.times||[]).join("\n"))+'</textarea></label>'+
    '<div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></span></div></form>',"narrow"); });
F.form("mpplan",function(form){ api("/admin/api/mkt/plan",{brand:form.getAttribute("data-key"),perWeek:+form.perWeek.value,times:form.times.value.split("\n").map(function(s){ return s.trim(); }).filter(Boolean)}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); PL=j; F.closeModal(); F.toast("Gespeichert"); F.render(); }); });

/* ---------- Kanäle ---------- */
function kanHtml(){
  if(!PL){ load(); return '<div class="muted" style="padding:20px">Lade …</div>'; }
  if(!PL.ok) return '<div class="notice"><span>'+esc(PL.error)+'</span><button type="button" class="btn sm" data-act="mpreload">Erneut versuchen</button></div>';
  var provs=(PL.providers||[]), bs=brands(), pfs=PL.platforms||[];
  var appsHtml='<section class="panel"><div class="panel-h"><h2>1. App-Zugänge der Plattformen (einmalig)</h2><span class="muted small">Kostenlos – bei jeder Plattform eine eigene „App“ anlegen</span></div>'+
    '<div class="mk-uri"><span class="small">Diese Adresse bei jeder Plattform als <b>Weiterleitungs-URL (Redirect URI)</b> eintragen:</span><code id="mkUri">'+esc(PL.redirectUri)+'</code><button type="button" class="btn sm" data-act="mkcopy">Kopieren</button></div>'+
    '<div class="mk-prov">'+provs.filter(function(p){ return p.key!=="bluesky"; }).map(function(p){
      return '<div><div><b class="mk-pfi">'+pfIcon(p.key)+esc(p.label)+'</b><br>'+(p.ready?'<span class="ok-t small">✓ eingerichtet</span>':'<span class="muted small">noch nicht eingerichtet</span>')+'<br><a class="small mk-pfi" href="'+esc(p.portal)+'" target="_blank" rel="noopener">Entwickler-Portal öffnen'+F.svg("external")+'</a></div>'+
        '<div><p class="muted small" style="margin:0 0 8px">'+esc(p.hint)+'</p><form data-form="mkapp" data-prov="'+esc(p.key)+'" autocomplete="off"><input class="f" name="clientId" placeholder="App-ID / Client-ID" value="'+esc(p.clientId||"")+'"><input class="f" name="secret" type="password" placeholder="'+(p.ready?"Geheimschlüssel gespeichert":"Geheimschlüssel")+'" autocomplete="new-password">'+(p.key==="facebook"?'<input class="f" name="configId" inputmode="numeric" placeholder="Konfigurations-ID (Login for Business)" value="'+esc(p.configId||"")+'">':'')+'<button type="submit" class="btn sm">Speichern</button>'+(p.ready?'<button type="button" class="btn sm" data-act="mkappdel:'+esc(p.key)+'">Entfernen</button>':'')+'</form></div></div>'; }).join("")+'</div></section>';
  var tbl='<section class="panel"><div class="panel-h"><h2>2. Konten je App verbinden</h2><span class="muted small">Du meldest dich bei der Plattform selbst an – das Cockpit sieht dein Passwort nie</span></div><div class="mk-wrapx"><table class="mk-tbl"><thead><tr><th>App</th>'+pfs.map(function(p){ return '<th><span class="mk-pfi">'+pfIcon(p.key)+esc(p.label)+'</span></th>'; }).join("")+'</tr></thead><tbody>'+
    bs.map(function(b){ return '<tr><td><b>'+esc(b.name)+'</b></td>'+pfs.map(function(pf){ var c=chOf(b.key,pf.key), prov=provs.find(function(x){ return x.key===pf.provider; })||{};
      if(c) return '<td><div class="mk-acc"><b>'+esc(c.account&&(c.account.handle||c.account.name)||"verbunden")+'</b>'+(c.status==="ok"?'<span class="ok-t small">✓ verbunden</span>':'<span class="bad-t small">abgelaufen – <button type="button" class="link" data-act="mkcon:'+esc(b.key)+'|'+pf.key+'">neu verbinden</button></span>')+(c.lastError&&c.status==="ok"?'<span class="small muted" title="'+esc(c.lastError)+'">letzter Fehler</span>':'')+(c.status==="ok"?'<button type="button" class="link small" data-act="mkcon:'+esc(b.key)+'|'+pf.key+'" title="Neu anmelden, z. B. für neue Berechtigungen (Nachrichten)">neu verbinden</button>':'')+'<button type="button" class="link small" data-act="mkdis:'+esc(c.id)+'">trennen</button></div></td>';
      if(pf.key==="tiktok"&&PL.tiktokShared&&PL.tiktokShared.brand!==b.key) return '<td><div class="mk-acc"><span class="small muted">über</span><b>'+esc(PL.tiktokShared.account||"gemeinsames Konto")+'</b><span class="small muted">gemeinsames TikTok aller Marken</span></div></td>';
      return '<td>'+(prov.ready?'<button type="button" class="btn sm" data-act="mkcon:'+esc(b.key)+'|'+pf.key+'">Verbinden</button>':'<span class="muted small" title="Zuerst den App-Zugang oben eintragen">–</span>')+'</td>'; }).join("")+'</tr>'; }).join("")+'</tbody></table></div>'+
    '<p class="muted small" style="margin:10px 18px 14px">TikTok: Videos landen als Entwurf in deiner TikTok-App (dort auf „Posten“ tippen) – direktes Posten erlaubt TikTok erst nach einer Prüfung der App. X/Twitter kostet seit 2026 pro Post und ist deshalb nicht dabei.</p></section>';
  var extra='<section class="panel"><div class="panel-h"><h2>3. Extras für bessere Reels</h2></div><div class="mk-prov">'+
    '<div><div><b>Stockvideos & -fotos</b><br>'+(PL.pixabay||PL.pexels?'<span class="ok-t small">✓ aktiv'+(PL.pixabay?' (Pixabay'+(PL.pexels?' + Pexels':'')+')':' (Pexels)')+'</span>':'<span class="muted small">aus</span>')+'<br><a class="small" href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">Pixabay-API (gratis)</a></div><div><p class="muted small" style="margin:0 0 8px">Kostenlos: auf pixabay.com registrieren, dann angemeldet <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">pixabay.com/api/docs</a> öffnen – bei „key (required)“ steht grün <b>Your API key</b>. Reels bekommen damit echte Videos als Hintergrund.</p><form data-form="mkpix" autocomplete="off"><input class="f" name="key" type="password" placeholder="'+(PL.pixabay?"Schlüssel gespeichert":"Pixabay-API-Schlüssel")+'" autocomplete="new-password"><button type="submit" class="btn sm">Speichern</button>'+(PL.pixabay?'<button type="button" class="btn sm" data-act="mkpixdel">Entfernen</button>':'')+'</form></div></div>'+
    '<div><div><b>Pexels (optional)</b><br>'+(PL.pexels?'<span class="ok-t small">✓ aktiv</span>':'<span class="muted small">aus</span>')+'<br><a class="small" href="https://www.pexels.com/api/" target="_blank" rel="noopener">Pexels-API</a></div><div><p class="muted small" style="margin:0 0 8px">Mit einem kostenlosen Pexels-Schlüssel bekommen Reels echte Videos als Hintergrund (Essen, Berge, Feiern …) statt Farbverlauf.</p><form data-form="mkpex" autocomplete="off"><input class="f" name="key" type="password" placeholder="'+(PL.pexels?"Schlüssel gespeichert":"Pexels-API-Schlüssel")+'" autocomplete="new-password"><button type="submit" class="btn sm">Speichern</button>'+(PL.pexels?'<button type="button" class="btn sm" data-act="mkpexdel">Entfernen</button>':'')+'</form></div></div>'+
    musExtras()+

    '<div><div><b>Hashtags auf Instagram</b><br><span class="muted small">je Post</span></div><div><p class="muted small" style="margin:0 0 8px">Instagram erlaubt offiziell nur noch 5 Hashtags (seit Dezember 2025). Stellst du mehr ein und Instagram lehnt den Post ab, postet das Cockpit automatisch nochmal mit 5.</p><select class="f" style="width:auto" data-mpigtags>'+[5,10,15,20,30].map(function(n){ return '<option value="'+n+'"'+((PL.igTags||5)===n?' selected':'')+'>'+n+(n===5?' (empfohlen)':'')+'</option>'; }).join("")+'</select></div></div>'+
    '<div><div><b>Mitteilungen</b></div><div><p class="muted small" style="margin:0">Bei „gepostet“ oder Fehlern bekommst du eine Mitteilung, wenn du in den Mitteilungs-Einstellungen „Marketing“ einschaltest.</p></div></div></div></section>';
  return '<div class="mk-kan">'+appsHtml+tbl+extra+'</div>';
}
F.listen("change","[data-mpigtags]",function(el){ api("/admin/api/mkt/app",{provider:"igTags",value:+el.value}).then(function(j){ if(j&&j.ok){ PL=j; F.toast("Instagram: "+j.igTags+" Hashtags je Post"); } }); });
F.action("mkcopy",function(){ try{ navigator.clipboard.writeText(PL.redirectUri); F.toast("Kopiert"); }catch(e){ F.toast("Bitte von Hand kopieren",true); } });
F.form("mkapp",function(form){ var prov=form.getAttribute("data-prov"), cid=form.clientId.value.trim(), sec=form.secret.value.trim(); if(!cid) return F.toast("App-ID fehlt",true);
  api("/admin/api/mkt/app",Object.assign({provider:prov,clientId:cid,secret:sec},form.configId?{configId:form.configId.value.trim()}:{})).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); PL=j; F.toast("Gespeichert"); F.render(); }); });
F.action("mkappdel",function(prov){ F.confirm("App-Zugang entfernen? Verbundene Konten bleiben gespeichert, können aber nicht mehr erneuert werden.","Entfernen",function(){ api("/admin/api/mkt/app",{provider:prov,remove:true}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); } }); },true); });
F.form("mkpex",function(form){ var k=form.key.value.trim(); if(!k) return; api("/admin/api/mkt/app",{provider:"pexels",key:k}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); PL=j; F.toast("Gespeichert"); F.render(); }); });
F.form("mkpix",function(form){ var k=form.key.value.trim(); if(!k) return; api("/admin/api/mkt/app",{provider:"pixabay",key:k}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); PL=j; F.toast("Pixabay-Schlüssel gespeichert"); F.render(); }); });
F.action("mkpixdel",function(){ api("/admin/api/mkt/app",{provider:"pixabay",key:""}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); } }); });
F.action("mkpexdel",function(){ api("/admin/api/mkt/app",{provider:"pexels",key:""}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); } }); });
F.action("mkcon",function(a){ var x=a.split("|");
  if(x[1]==="bluesky"){ F.modal('<form data-form="mkbsky" data-brand="'+esc(x[0])+'" class="mp-ed"><div class="row-between"><h2 style="font-size:19px">Bluesky verbinden – '+esc(brandOf(x[0]).name)+'</h2>'+F.btnClose()+'</div><p class="muted small" style="margin:0">In Bluesky: Einstellungen → Datenschutz und Sicherheit → App-Passwörter → neues App-Passwort. Nicht dein normales Passwort verwenden.</p><label class="fl">Bluesky-Name<input class="f" name="handle" placeholder="name.bsky.social" autocomplete="username"></label><label class="fl">App-Passwort<input class="f" name="password" type="password" autocomplete="new-password" placeholder="xxxx-xxxx-xxxx-xxxx"></label><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Verbinden</button></span></div></form>',"narrow"); return; }
  api("/admin/api/mkt/connect",{brand:x[0],platform:x[1]}).then(function(j){ if(!j||!j.ok||!j.url) return F.toast((j&&j.error)||"Fehler",true); location.href=j.url; }); });
F.form("mkbsky",function(form){ api("/admin/api/mkt/connect",{brand:form.getAttribute("data-brand"),platform:"bluesky",handle:form.handle.value.trim(),password:form.password.value.trim()}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Anmeldung fehlgeschlagen",true); PL=j; F.closeModal(); F.toast("Bluesky verbunden"); F.render(); }); });
F.action("mkdis",function(id){ F.confirm("Konto trennen? Geplante Posts gehen dann nicht mehr auf diese Plattform.","Trennen",function(){ api("/admin/api/mkt/disconnect",{id:id}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); F.toast("Getrennt"); } }); },true); });
F.listen("change","#mkMusic",function(el){ var files=Array.prototype.slice.call(el.files||[]); if(!files.length) return; var v=function(i){ var x=document.getElementById(i); return x?(x.type==="checkbox"?x.checked:x.value):""; }, lic=v("mkMusLic"), chain=Promise.resolve(), n=0;
  if(!lic){ el.value=""; return F.toast("Bitte zuerst die Lizenz des Titels wählen",true); }
  if(/^cc-by/.test(lic)&&(!String(v("mkMusArt")).trim()||!/^https?:\/\/\S+$/.test(String(v("mkMusSrc")).trim()))){ el.value=""; return F.toast("Bei CC BY bitte Künstler und Quell-Adresse angeben",true); }
  F.toast("Wird hochgeladen und analysiert …");
  files.forEach(function(f){ chain=chain.then(function(){ if(f.size>12e6){ F.toast(f.name+": zu groß (max. 12 MB)",true); return; } return new Promise(function(ok){ var r=new FileReader(); r.onload=function(){ api("/admin/api/mkt/music",{op:"upload",name:f.name.replace(/\.[^.]+$/,""),mood:v("mkMusicMood"),license:lic,vocals:v("mkMusVoc"),artist:String(v("mkMusArt")).trim(),sourceUrl:String(v("mkMusSrc")).trim(),data:String(r.result).replace(/^data:audio\/mp3;/,"data:audio/mpeg;")}).then(function(j){ if(j&&j.ok){ PL=Object.assign(PL,j); n++; if(j.quality&&!j.quality.ok) F.toast(f.name+": aufgenommen, aber abgelehnt – "+(j.quality.reasons||[]).join(", "),true); } else F.toast(f.name+": "+((j&&j.error)||"Fehler"),true); ok(); }); }; r.readAsDataURL(f); }); }); });
  chain.then(function(){ el.value=""; if(n) F.toast(n+(n===1?" Titel":" Titel")+" hochgeladen"); F.render(); }); });
F.action("mkmusrestore",function(){ api("/admin/api/mkt/music",{restore:true}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); } }); });
F.action("mkmusdel",function(id){ api("/admin/api/mkt/music",{remove:id}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); } }); });

/* ---------- Reel-Musik (Server: mkt-music.js): Bereich im Editor bzw. eigener Dialog über die Musik-Zeile der Post-Kachel ----------
   Aktueller Titel mit Hörprobe (genau der Ausschnitt im Reel), „Andere Musik“ (gleiches Tempo → nur Ton neu, Sekunden; sonst neu schneiden),
   3 Vorschläge mit 12-s-Hörprobe, „Neu komponieren“ (Stability, ≈ 0,08 $), Daumen hoch/runter je Marke, Stimmung/Energie/Tempo.
   Aktualisiert nur den Bereich (kein Neuladen – Simon nutzt das Cockpit als App). */
F.icons.mthumbup='<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.2 20H7"/>';
F.icons.mthumbdn='<path d="M7 13V4H4v9z"/><path d="M7 13l4 7a2 2 0 0 0 3-2l-1-4h5.5a2 2 0 0 0 2-2.3l-1.3-6A2 2 0 0 0 17.2 4H7"/>';
F.icons.mshuffle='<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>';
F.css(
'.mu{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--sunk);min-width:0}'+
'.mu-cur{display:grid;gap:8px;min-width:0}.mu-t{display:flex;gap:6px 8px;flex-wrap:wrap;align-items:center;min-width:0}.mu-t b{font-size:15px;margin-right:2px}'+
'.mu-b{display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;border-radius:99px;padding:2px 9px;background:var(--panel-2);border:1px solid var(--line);color:var(--ink-2);white-space:nowrap}'+
'.mu-b.ai{background:color-mix(in srgb,var(--glow) 16%,var(--panel-2));color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 40%,transparent)}.mu-b.warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 45%,transparent)}'+
'.mu-pl{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mu-pl audio{height:34px;flex:1 1 220px;min-width:0;max-width:100%}'+
'.mu-th{display:inline-flex;gap:4px}.mu-th button{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--panel-2);color:var(--ink-2);cursor:pointer}'+
'.mu-th button[aria-pressed="true"]{color:var(--glow-ink);background:var(--glow-soft);border-color:color-mix(in srgb,var(--glow) 40%,transparent)}.mu-th svg{width:17px;height:17px}'+
'.mu-act{display:flex;gap:6px;flex-wrap:wrap}.mu-act .btn svg{width:15px;height:15px}'+
'.mu-want{display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;font-size:13px}.mu-want select{width:auto}.mu-en{display:inline-flex;gap:3px}'+
'.mu-en button{min-width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--panel-2);font:inherit;font-weight:700;color:var(--ink-2);cursor:pointer}.mu-en button[aria-pressed="true"]{background:var(--glow-soft);color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 40%,transparent)}'+
'.mu-note{margin:0;font-size:12.5px;color:var(--warn);display:flex;gap:6px;align-items:flex-start}.mu-note svg{width:15px;height:15px;flex:none;margin-top:1px}.mu-hint{margin:0;font-size:12px;color:var(--ink-3)}'+
'.mu-sug{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}.mu-sug:empty{display:none}'+
'.mu-card{display:grid;gap:6px;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--panel-2);min-width:0}.mu-card b{font-size:14px}.mu-card audio{width:100%;height:32px}.mu-card .tags{font-size:11.5px;color:var(--ink-3)}'+
'.mp-meta .mp-musl{max-width:100%;color:var(--ink-2)}.mp-meta .mp-musl:hover{color:var(--ink)}.mp-meta .mp-musl i{width:7px;height:7px;border-radius:50%;background:var(--warn);flex:none}'+
'.mu-chips{display:flex;gap:5px;flex-wrap:wrap}.mu-chip{position:relative;display:inline-flex}.mu-chip input{position:absolute;opacity:0;pointer-events:none}'+
'.mu-chip span{font-size:12px;border:1px solid var(--line);border-radius:99px;padding:3px 10px;cursor:pointer;background:var(--panel-2);color:var(--ink-2)}.mu-chip input:checked+span{background:var(--glow-soft);color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 40%,transparent)}'+
'.mu-chip input:focus-visible+span{outline:2px solid var(--glow);outline-offset:1px}'+
'.mu-lib{display:grid;gap:4px}.mu-lib .row{display:flex;gap:6px 10px;flex-wrap:wrap;align-items:center;font-size:12.5px}.mu-lib .it{display:inline-flex;gap:4px;align-items:center;background:var(--sunk);border-radius:99px;padding:1px 4px 1px 9px}'+
'.mu-lib .it button{border:0;background:none;color:var(--ink-3);cursor:pointer;padding:2px 4px;font:inherit}.mu-lib .it button:hover{color:var(--ink)}.mu-lib .it.off{opacity:.5;text-decoration:line-through}'+
'.mu-set{display:grid;gap:8px;font-size:13px}.mu-set .rw{display:flex;gap:8px 12px;flex-wrap:wrap;align-items:center}.mu-set input.f,.mu-set select.f{width:auto}'+
'.mu-bar{height:6px;border-radius:9px;background:var(--line);overflow:hidden;max-width:260px}.mu-bar i{display:block;height:100%;background:var(--glow)}.mu-bar.hi i{background:var(--warn)}'+
'.mu-prof{width:100%;border-collapse:collapse;font-size:12.5px}.mu-prof td,.mu-prof th{padding:6px 8px;border-top:1px solid var(--line);text-align:left;vertical-align:top}.mu-prof th{font-weight:600;color:var(--ink-3)}'+
'@media(max-width:700px){.mu-sug{grid-template-columns:minmax(0,1fr)}.mu-prof .hide-s{display:none}}');
function mcfg(){ return (PL&&PL.musicCfg)||{}; }
function moodLabel(k){ var m=(PL.moods||[]).find(function(x){ return x.key===k; }); return m?m.label:(k||""); }
function musTrack(id){ return (PL.music||[]).find(function(m){ return m.id===id; })||null; }
function eurUsd(usd){ return (Math.round(usd*(mcfg().usdEur||0.86)*100)/100).toFixed(2).replace(".",","); }
function musBadges(t,extra){ var b=[], lic=t.licKey||"";
  b.push('<span class="mu-b'+(t.ai?' ai':'')+'">'+esc(t.src||t.source||"")+'</span>');
  if(/^cc-by/.test(lic)||t.credit) b.push('<span class="mu-b warn" title="Namensnennung wird automatisch in die Caption gesetzt">CC BY · Credit</span>');
  if(t.mood) b.push('<span class="mu-b">'+esc(moodLabel(t.mood))+'</span>');
  if(t.energy) b.push('<span class="mu-b" title="Energie 1–5">Energie '+t.energy+'</span>');
  if(t.bpm) b.push('<span class="mu-b">'+Math.round(t.bpm)+' BPM</span>');
  if(t.contentId==="claim"||t.contentId==="registriert") b.push('<span class="mu-b warn">Content-ID: '+esc(t.contentId)+'</span>');
  return b.concat(extra||[]).join(""); }
function musLine(p){ var t=p.track; if(p.music==="none") return "Ohne Musik"; if(!t) return p.media&&p.media.status==="fertig"?"Musik: –":"Musik wird gewählt";
  return "Musik: "+t.name+" · "+(t.ai?"KI":t.credit?"CC BY (Credit in Caption)":/CC0/.test(t.license||"")?"CC0":(t.src||"")); }
function musPanel(p){
  var t=p.track||null, c=mcfg(), w=p.musicWant||{}, mood=w.mood||p.mood||"", en=+w.energy||0, tempo=w.tempo||"", st=(p.media||{}).status, busy=st==="wartet"||st==="läuft", id=esc(p.id);
  var lib=t?musTrack(t.id):null, rate=lib&&lib.rating?(lib.rating[p.brand]||0):0, pv=t?'/admin/api/mkt/music/preview?id='+encodeURIComponent(t.id)+'&off='+(+t.offset||0)+(t.gainDb!=null?'&g='+t.gainDb:''):'';
  var nx=busy&&p.music&&p.music!=="none"&&(!t||p.music!==t.id)?musTrack(p.music):null;   // „Andere Musik“/Vorschlag gewählt, Reel wird gerade neu geschnitten
  if(nx) return '<div class="mu" data-mpmus="'+id+'"><div class="mu-cur"><div class="mu-t"><b>'+esc(nx.name)+'</b>'+musBadges(nx,['<span class="mu-b ai">wird eingesetzt – Reel wird neu geschnitten …</span>'])+'</div>'+(t?'<p class="mu-hint">bisher: '+esc(t.name)+'</p>':'')+'</div></div>';
  var cur=t&&p.music!=="none"?'<div class="mu-cur"><div class="mu-t"><b>'+esc(t.name)+'</b>'+musBadges(Object.assign({},lib||{},t),[t.composed?'<span class="mu-b ai">neu komponiert für diesen Post</span>':'',p.music&&p.music===t.id?'<span class="mu-b" title="Von dir gewählt – Abwechslungs-Sperren gelten nicht">fest gewählt</span>':''])+'</div>'+
      '<div class="mu-pl"><audio controls preload="none" src="'+esc(pv)+'" aria-label="Hörprobe: der Ausschnitt im Reel"></audio><span class="mu-th"><button type="button" data-act="mpmrate:'+id+'|1" aria-pressed="'+(rate===1)+'" title="Passt (für diese Marke merken)" aria-label="Daumen hoch">'+F.svg("mthumbup")+'</button><button type="button" data-act="mpmrate:'+id+'|-1" aria-pressed="'+(rate===-1)+'" title="Passt nicht – nie wieder für diese Marke, gleich andere Musik" aria-label="Daumen runter">'+F.svg("mthumbdn")+'</button></span></div>'+
      '<p class="mu-hint">'+(t.offset?'Startet bei '+(Math.round(t.offset*10)/10).toString().replace(".",",")+' s im Titel (auf dem Takt)':'Startet am Titelanfang')+(t.gainDb!=null?' · auf −14 LUFS angeglichen':'')+(t.drop!=null?' · Aufruf auf dem Drop':'')+'</p></div>'
    :'<div class="mu-cur"><span class="muted small">'+(p.music==="none"?"Ohne Musik – nur dezente Effekte":busy?"Musik wird gewählt …":"Noch keine Musik")+'</span></div>';
  var comp=c.canCompose?'<button type="button" class="btn sm" data-act="mpmcomp:'+id+'"'+(busy?' disabled':'')+' title="Stable Audio 3.0 komponiert einen eigenen Titel für dieses Reel">'+F.svg("mspark")+' Neu komponieren (≈ 0,08 $)</button>'
    :'<button type="button" class="btn sm" disabled title="'+esc((c.stability&&c.stability.configured?"":"Kein Stability-Key – ")+(c.composeBlock||"")+" (Kanäle › Extras)")+'">'+F.svg("mspark")+' Neu komponieren</button>';
  var act='<div class="mu-act">'+(p.music==="none"?'<button type="button" class="btn sm" data-act="mpmnone:'+id+'|0">Mit Musik</button>':
      '<button type="button" class="btn sm" data-act="mpmshuf:'+id+'"'+(busy?' disabled':'')+'>'+F.svg("mshuffle")+' Andere Musik</button><button type="button" class="btn sm" data-act="mpmsug:'+id+'"'+(busy?' disabled':'')+'>'+F.svg("mplay")+' 3 Vorschläge</button>'+comp+
      '<button type="button" class="btn sm" data-act="mpmnone:'+id+'|1">Ohne Musik</button>')+'</div>';
  var want=p.music==="none"?'':'<div class="mu-want"><label>Stimmung <select class="f" data-mpmw="mood" data-id="'+id+'">'+(PL.moods||[]).map(function(m){ return '<option value="'+esc(m.key)+'"'+(m.key===mood?' selected':'')+'>'+esc(m.label)+'</option>'; }).join("")+'</select></label>'+
      '<span>Energie <span class="mu-en" role="group" aria-label="Energie 1 bis 5">'+[1,2,3,4,5].map(function(n){ return '<button type="button" data-act="mpmen:'+id+'|'+n+'" aria-pressed="'+(n===en)+'">'+n+'</button>'; }).join("")+'</span></span>'+
      '<label>Tempo <select class="f" data-mpmw="tempo" data-id="'+id+'">'+[["","automatisch"],["langsam","langsam"],["mittel","mittel"],["schnell","schnell"]].map(function(x){ return '<option value="'+x[0]+'"'+(x[0]===tempo?' selected':'')+'>'+x[1]+'</option>'; }).join("")+'</select></label></div>';
  var note=p.musicNote?'<p class="mu-note">'+F.svg("alertCircle")+'<span>'+esc(p.musicNote)+'</span></p>':'';
  var tt=(p.platforms||[]).indexOf("tiktok")>-1?'<p class="mu-hint">TikTok: Im TikTok-Entwurf kannst du den Sound gegen einen aus der Commercial Music Library tauschen.</p>':'';
  return '<div class="mu" data-mpmus="'+id+'">'+cur+note+act+want+'<div class="mu-sug" id="mpmSug-'+id+'"></div>'+tt+'</div>';
}
function musRepaint(id){ var p=(PL.posts||[]).find(function(q){ return q.id===id; }), el=document.querySelector('[data-mpmus="'+id+'"]'); if(p&&el) el.outerHTML=musPanel(p); }
function musOp(id,op,extra,msg){ return api("/admin/api/mkt/post",Object.assign({id:id,op:op},extra||{})).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; }
  if(j.post) upd(j.post); musRepaint(id); F.render(); schedulePoll(); var m=typeof msg==="function"?msg(j):msg; if(m) F.toast(m); return j; }).catch(function(){ F.toast("Keine Verbindung",true); }); }
var MUS_SWAP=function(j){ return j.remuxed?"Andere Musik – nur der Ton wurde neu gemischt":"Andere Musik – das Reel wird neu geschnitten …"; };
F.action("mpmus",function(id){ var p=PL.posts.find(function(q){ return q.id===id; }); if(!p) return; if(!PL.musicCfg) return F.toast("Die neue Musik-Auswahl kommt mit dem nächsten Server-Update – bis dahin unter „Bearbeiten“",true);
  F.modal('<div class="row-between"><h2 style="font-size:19px">Musik</h2>'+F.btnClose()+'</div><p class="muted small" style="margin:0 0 10px">'+esc(p.idea||"")+'</p>'+musPanel(p),"wide"); });
F.action("mpmshuf",function(id){ musOp(id,"musicShuffle",null,MUS_SWAP); });
F.action("mpmset",function(a){ var x=a.split("|"); musOp(x[0],"musicSet",{track:x[1]},MUS_SWAP); });
F.action("mpmcomp",function(id){ musOp(id,"musicCompose",null,"Wird neu komponiert – das Reel kommt in 1–3 Minuten"); });
F.action("mpmnone",function(a){ var x=a.split("|"); musOp(x[0],"musicNone",{on:x[1]==="1"},x[1]==="1"?"Ohne Musik – wird neu erstellt":"Mit Musik – wird neu erstellt"); });
F.action("mpmrate",function(a){ var x=a.split("|"), v=+x[1], p=PL.posts.find(function(q){ return q.id===x[0]; }), lib=p&&p.track?musTrack(p.track.id):null, cur=lib&&lib.rating?lib.rating[p.brand]||0:0;
  if(v>0&&cur===1) v=0;   // nochmal Daumen hoch = zurücknehmen
  musOp(x[0],"musicRate",{v:v},v<0?MUS_SWAP:v>0?"Gemerkt: passt zu dieser Marke":"Bewertung zurückgenommen").then(function(j){ if(j&&lib){ lib.rating=Object.assign({},lib.rating||{}); if(v) lib.rating[p.brand]=v; else delete lib.rating[p.brand]; musRepaint(x[0]); } }); });
F.action("mpmen",function(a){ var x=a.split("|"); musOp(x[0],"musicWant",{energy:+x[1]},"Energie "+x[1]+" – neue Auswahl, Reel wird neu erstellt"); });
F.listen("change","[data-mpmw]",function(el){ var o={}; o[el.getAttribute("data-mpmw")]=el.value; musOp(el.getAttribute("data-id"),"musicWant",o,"Neue Auswahl – Reel wird neu erstellt"); });
F.action("mpmsug",function(id){ var box=document.getElementById("mpmSug-"+id); if(box) box.innerHTML='<span class="muted small">Suche passende Titel …</span>';
  api("/admin/api/mkt/post",{id:id,op:"musicSuggest"}).then(function(j){ if(!box) return; if(!j||!j.ok){ box.innerHTML='<span class="bad-t small">'+esc((j&&j.error)||"Fehler")+'</span>'; return; }
    box.innerHTML=(j.suggestions||[]).map(function(t){ return '<div class="mu-card"><b>'+esc(t.name)+'</b><div class="mu-t">'+musBadges(t)+'</div>'+
      ((t.genres||[]).length||(t.instruments||[]).length?'<span class="tags">'+esc((t.genres||[]).concat(t.instruments||[]).join(" · "))+'</span>':'')+(t.last?'<span class="tags">'+esc(t.last)+'</span>':'<span class="tags">noch nie verwendet</span>')+
      '<audio controls preload="none" src="'+esc(t.preview)+'" aria-label="12-Sekunden-Hörprobe"></audio><button type="button" class="btn sm primary" data-act="mpmset:'+esc(id)+'|'+esc(t.id)+'">Übernehmen</button></div>'; }).join("")||'<span class="muted small">Keine weiteren passenden Titel'+(j.note?' – '+esc(j.note):'')+'</span>'; }); });

/* ---------- Kanäle › Extras: KI-Musik (Stability AI), Musik-Bibliothek, Musikprofile je Marke ---------- */
function musExtras(){
  if(!PL.musicCfg) return '<div><div><b>Musik für Reels</b><br><span class="muted small">'+(PL.music||[]).length+' Titel</span></div><div><p class="muted small" style="margin:0">Die neue Musik-Verwaltung (KI-Musik, Hörproben, Lizenzen) wird mit dem nächsten Server-Update aktiv.</p></div></div>';
  var c=mcfg(), b=c.budget||{}, s=c.stability||{}, chk=s.check, lic=PL.musicLicenses||[], all=(PL.music||[]).filter(function(m){ return !m.gone; });
  var mon=["Jänner","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"][+(String(b.month||"").slice(5,7))-1]||"Diesen Monat";
  var stab='<div><div><b>KI-Musik (Stability AI)</b><br>'+(s.configured?'<span class="ok-t small">✓ Key gespeichert'+(s.env?' (Railway)':'')+'</span>':'<span class="muted small">aus – Reels nutzen die Bibliothek</span>')+'<br><a class="small" href="https://platform.stability.ai/" target="_blank" rel="noopener">platform.stability.ai</a></div><div class="mu-set">'+
    '<p class="muted small" style="margin:0">Pro Reel komponiert <b>Stable Audio 3.0</b> einen eigenen Titel (instrumental, ~30 s, passend zu Idee, Stimmung und Marke). Der Titel gehört dir (Stability-Nutzungsbedingungen ab 30.09.2026), keine Namensnennung nötig. <b>0,08 $ je Titel</b> vom Prepaid-Guthaben bei Stability. Ohne Key oder über dem Limit kommt Musik aus der Bibliothek.</p>'+
    '<form data-form="mkstab" autocomplete="off" class="rw"><input class="f" name="key" type="password" style="flex:1 1 220px" placeholder="'+(s.configured?"Key gespeichert – zum Ersetzen neu einfügen":"Stability-API-Key (sk-…)")+'" autocomplete="new-password"><button type="submit" class="btn sm">Speichern</button>'+(s.configured&&!s.env?'<button type="button" class="btn sm" data-act="mkstabdel">Entfernen</button>':'')+(s.configured?'<button type="button" class="btn sm" data-act="mkstabchk">Guthaben prüfen</button>':'')+'</form>'+
    (chk?'<span class="small '+(chk.ok?(chk.low?'warn-t':'ok-t'):'bad-t')+'">'+(chk.ok?'Guthaben: '+String(chk.credits).replace(".",",")+' Credits ≈ '+String(chk.usd).replace(".",",")+' $ (≈ '+Math.floor((chk.credits||0)/8)+' Titel)'+(chk.low?' – bitte nachkaufen':''):'Prüfung: '+esc(chk.error||"Fehler"))+' · '+esc(new Date(chk.at).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))+'</span>':'')+
    '<label class="chk"><input type="checkbox" data-mkmus="revenueOk"'+(c.revenueOk?' checked':'')+'> Jahresumsatz (alle Marken/Firma) unter 1 Mio. USD – Voraussetzung der Stability Community License'+(c.revenueOk?' <span class="muted">(bestätigt am '+esc(c.revenueOk.split("-").reverse().join("."))+')</span>':'')+'</label>'+
    '<div class="rw"><label>Monatslimit <input class="f" data-mkmus="limitEur" inputmode="decimal" style="width:80px" value="'+esc(String(c.limitEur==null?15:c.limitEur).replace(".",","))+'"> €</label><span class="small">'+esc(mon)+': '+(b.count||0)+' Titel · '+String(b.usd||0).replace(".",",")+' $ ≈ '+eurUsd(b.usd||0)+' € ('+(b.pct||0)+' %) · noch ≈ '+(b.left||0)+' Titel</span></div>'+
    '<div class="mu-bar'+((b.pct||0)>=80?' hi':'')+'" aria-hidden="true"><i style="width:'+Math.min(100,b.pct||0)+'%"></i></div>'+
    '<div class="rw"><label>Musik <select class="f" data-mkmus="engine"><option value="auto"'+(c.engine!=="library"?' selected':'')+'>KI je Reel, sonst Bibliothek</option><option value="library"'+(c.engine==="library"?' selected':'')+'>nur Bibliothek</option></select></label>'+
      '<label>Wochen-Vorrat je Marke <select class="f" data-mkmus="weekly">'+[0,1,2,3].map(function(n){ return '<option value="'+n+'"'+((+c.weekly)===n?' selected':'')+'>'+n+'</option>'; }).join("")+'</select></label></div>'+
    '<label class="chk"><input type="checkbox" data-mkmus="saver"'+(c.saver?' checked':'')+'> Sparmodus: zuerst ungenutzte passende KI-Titel aus dem Vorrat nehmen</label>'+
    '<label class="chk"><input type="checkbox" data-mkmus="ytAi"'+(c.ytAi!==false?' checked':'')+'> KI-Musik bei YouTube als KI-Inhalt kennzeichnen (empfohlen)</label>'+
    (c.warn?'<p class="mu-note">'+F.svg("alertCircle")+'<span>'+esc(c.warn)+'</span></p>':s.configured&&c.composeBlock?'<p class="mu-note">'+F.svg("alertCircle")+'<span>KI-Musik pausiert: '+esc(c.composeBlock)+'</span></p>':'')+
    (c.weeklyLast?'<span class="muted small">Wochen-Nachschub '+esc(String(c.weeklyLast.week||""))+': '+(c.weeklyLast.added||0)+' neue Titel · '+String(c.weeklyLast.usd||0).replace(".",",")+' $</span>':'')+'</div></div>';
  var n=function(f){ return all.filter(f).length; }, groups=(PL.moods||[]).map(function(md){ var ms=all.filter(function(m){ return m.mood===md.key; }); return ms.length?'<div class="row"><b>'+esc(md.label)+'</b> '+ms.map(musItem).join("")+'</div>':''; }).join("")+
    (all.some(function(m){ return !m.mood; })?'<div class="row"><b>ohne Stimmung</b> '+all.filter(function(m){ return !m.mood; }).map(musItem).join("")+'</div>':'');
  var libH='<div><div><b>Musik-Bibliothek</b><br><span class="muted small">'+all.length+' Titel · '+n(function(m){ return m.ai; })+' KI · '+n(function(m){ return m.seed; })+' CC0 · '+n(function(m){ return !m.ai&&!m.seed; })+' eigene/Envato</span>'+(c.storage?'<br><span class="muted small">'+String(c.storage.mb).replace(".",",")+' MB</span>':'')+'</div><div class="mu-set">'+
    '<p class="muted small" style="margin:0">Jedes Reel bekommt einen passenden Titel (Stimmung, Energie, Tempo, Marke), nie zweimal kurz hintereinander, Einstieg am Höhepunkt, Lautstärke angeglichen. ▶ = Hörprobe, Klick auf den Namen = Tags, Lizenz, „Claim gemeldet“. Tags der CC0-Titel sind Vorschläge – bitte einmal durchhören und bestätigen.</p>'+
    '<audio id="mkMusAud" controls preload="none" style="width:100%;max-width:420px;height:34px"></audio><div class="mu-lib">'+groups+'</div>'+
    '<div class="rw"><select class="f" id="mkMusLic" aria-label="Lizenz (Pflicht)"><option value="">Lizenz wählen (Pflicht) …</option>'+lic.map(function(l){ return '<option value="'+esc(l.key)+'">'+esc(l.text)+'</option>'; }).join("")+'</select>'+
      '<select class="f" id="mkMusicMood"><option value="">Stimmung automatisch</option>'+(PL.moods||[]).map(function(md){ return '<option value="'+esc(md.key)+'">'+esc(md.label)+'</option>'; }).join("")+'</select><label class="chk"><input type="checkbox" id="mkMusVoc"> enthält Gesang</label></div>'+
    '<div class="rw"><input class="f" id="mkMusArt" placeholder="Künstler (bei CC BY Pflicht)" style="flex:1 1 160px"><input class="f" id="mkMusSrc" placeholder="Quell-Adresse https://… (bei CC BY Pflicht)" style="flex:2 1 220px"></div>'+
    '<div class="rw"><input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg" id="mkMusic" multiple><button type="button" class="link small" data-act="mkmusrestore">ausgeblendete zurückholen</button></div>'+
    '<p class="muted small" style="margin:0">Pixabay-Musik nur ohne Content-ID-Schild herunterladen. NC-, ND- und SA-Lizenzen sind gesperrt. CC-BY-Titel bekommen automatisch die Namensnennung in die Caption und sind für TikTok-Entwürfe gesperrt.</p></div></div>';
  var prof=PL.musicProfiles||{}, bs=brands(), profH='<div><div><b>Musikprofile je Marke</b><br><span class="muted small">bestimmen Stimmung, Genres, Instrumente, Energie und Tempo</span></div><div class="mk-wrapx"><table class="mu-prof"><thead><tr><th>Marke</th><th>Stimmung</th><th class="hide-s">Genres</th><th>Energie</th><th class="hide-s">BPM</th><th></th></tr></thead><tbody>'+
    bs.map(function(b){ var p=prof[b.key]; if(!p) return ''; return '<tr><td><b>'+esc(b.name)+'</b></td><td>'+esc(moodLabel(p.mood))+'</td><td class="hide-s">'+esc((p.genres||[]).join(", "))+'</td><td>'+p.energy[0]+'–'+p.energy[1]+'</td><td class="hide-s">'+p.bpm[0]+'–'+p.bpm[1]+'</td><td><button type="button" class="link small" data-act="mkmusprof:'+esc(b.key)+'">Ändern</button></td></tr>'; }).join("")+'</tbody></table></div></div>';
  return stab+libH+profH;
}
function musItem(m){ return '<span class="it'+(m.hidden?' off':'')+'" title="'+esc((m.license||"")+(m.q&&!m.q.ok?" – abgelehnt: "+(m.q.reasons||[]).join(", "):""))+'"><button type="button" data-act="mkmustrack:'+esc(m.id)+'">'+esc(m.name)+(m.ai?' · KI':'')+(m.credit?' · CC BY':'')+(m.q&&!m.q.ok?' ⚠':'')+'</button>'+
  '<button type="button" data-act="mkmusplay:'+esc(m.id)+'" aria-label="Anhören: '+esc(m.name)+'" title="Anhören (12 s ab dem Höhepunkt)">▶</button>'+(m.hidden?'':'<button type="button" data-act="mkmusdel:'+esc(m.id)+'" title="Nicht mehr verwenden" aria-label="Ausblenden: '+esc(m.name)+'">×</button>')+'</span>'; }
function musSet(o,msg){ return api("/admin/api/mkt/music",o).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; } PL=Object.assign(PL,j); if(msg) F.toast(typeof msg==="function"?msg(j):msg); F.render(); return j; }); }
F.listen("change","[data-mkmus]",function(el){ var k=el.getAttribute("data-mkmus"), o={op:"settings"}; o[k]=el.type==="checkbox"?el.checked:el.value; musSet(o,"Gespeichert"); });
F.form("mkstab",function(form){ var k=form.key.value.trim(); if(!k) return; musSet({op:"keys",provider:"stability",key:k},"Stability-Key gespeichert").then(function(j){ if(j) musSet({op:"balance"},function(x){ var b=x.balance||{}; return b.ok?"Guthaben: "+b.credits+" Credits":"Key geprüft: "+(b.error||"Fehler"); }); }); });
F.action("mkstabdel",function(){ F.confirm("Stability-Key entfernen? Reels bekommen dann Musik aus der Bibliothek.","Entfernen",function(){ musSet({op:"keys",provider:"stability",key:""},"Entfernt"); },true); });
F.action("mkstabchk",function(){ musSet({op:"balance"},function(x){ var b=x.balance||{}; return b.ok?"Guthaben: "+b.credits+" Credits ≈ "+b.usd+" $":"Prüfung: "+(b.error||"Fehler"); }); });
F.action("mkmusplay",function(id){ var a=document.getElementById("mkMusAud"); if(!a) return; a.src="/admin/api/mkt/music/preview?id="+encodeURIComponent(id); a.play().catch(function(){}); });
F.action("mkmusprof",function(k){ var p=(PL.musicProfiles||{})[k], V=PL.musicVocab||{genres:[],instruments:[]}; if(!p) return;
  var chips=function(name,list,on){ return '<div class="mu-chips">'+list.map(function(x){ return '<label class="mu-chip"><input type="checkbox" name="'+name+'" value="'+esc(x)+'"'+(on.indexOf(x)>-1?' checked':'')+'><span>'+esc(name==="moods"?moodLabel(x):x)+'</span></label>'; }).join("")+'</div>'; };
  var opt=function(n,cur){ return [1,2,3,4,5].map(function(i){ return '<option'+(i===cur?' selected':'')+'>'+i+'</option>'; }).join(""); };
  F.modal('<form data-form="mkmusprof" data-key="'+esc(k)+'" class="mp-ed"><div class="row-between"><h2 style="font-size:19px">Musikprofil – '+esc(brandOf(k).name)+'</h2>'+F.btnClose()+'</div>'+
    '<label class="fl">Standard-Stimmung<select class="f" name="mood">'+(PL.moods||[]).map(function(m){ return '<option value="'+esc(m.key)+'"'+(m.key===p.mood?' selected':'')+'>'+esc(m.label)+'</option>'; }).join("")+'</select></label>'+
    '<div class="fl"><span>Weitere Stimmungen</span>'+chips("moods",(PL.moods||[]).map(function(m){ return m.key; }),p.moods||[])+'</div>'+
    '<div class="fl"><span>Genres</span>'+chips("genres",V.genres,p.genres)+'</div><div class="fl"><span>Instrumente</span>'+chips("instruments",V.instruments,p.instruments)+'</div>'+
    '<div class="mk-row2"><label class="fl">Energie von/bis<span class="row" style="gap:6px"><select class="f" name="e0">'+opt(0,p.energy[0])+'</select><select class="f" name="e1">'+opt(0,p.energy[1])+'</select></span></label>'+
    '<label class="fl">Tempo (BPM) von/bis<span class="row" style="gap:6px"><input class="f" name="b0" inputmode="numeric" value="'+p.bpm[0]+'" style="width:80px"><input class="f" name="b1" inputmode="numeric" value="'+p.bpm[1]+'" style="width:80px"></span></label></div>'+
    '<label class="fl">Meiden (Komma-getrennt: Stimmungen, Genres, Instrumente oder Wörter wie „banjo“)<input class="f" name="avoid" value="'+esc((p.avoid||[]).join(", "))+'"></label>'+
    '<div class="foot"><button type="button" class="btn" data-act="mkmusprofreset:'+esc(k)+'">Standard</button><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></span></div></form>',"wide"); });
F.form("mkmusprof",function(form){ var all=function(n){ return Array.prototype.slice.call(form.querySelectorAll('[name="'+n+'"]:checked')).map(function(x){ return x.value; }); };
  musSet({op:"profile",brand:form.getAttribute("data-key"),profile:{mood:form.mood.value,moods:all("moods"),genres:all("genres"),instruments:all("instruments"),energy:[+form.e0.value,+form.e1.value],bpm:[+form.b0.value,+form.b1.value],avoid:form.avoid.value}},"Musikprofil gespeichert").then(function(j){ if(j) F.closeModal(); }); });
F.action("mkmusprofreset",function(k){ musSet({op:"profile",brand:k,reset:true},"Standard wiederhergestellt").then(function(j){ if(j) F.closeModal(); }); });
F.action("mkmustrack",function(id){ var m=musTrack(id), V=PL.musicVocab||{genres:[],instruments:[]}; if(!m) return;
  var chips=function(name,list,on){ return '<div class="mu-chips">'+list.map(function(x){ return '<label class="mu-chip"><input type="checkbox" name="'+name+'" value="'+esc(x)+'"'+(on.indexOf(x)>-1?' checked':'')+'><span>'+esc(name==="moods"?moodLabel(x):x)+'</span></label>'; }).join("")+'</div>'; };
  var own=!m.seed&&!m.ai;
  F.modal('<form data-form="mkmustag" data-id="'+esc(id)+'" class="mp-ed"><div class="row-between"><h2 style="font-size:19px">'+esc(m.name)+'</h2>'+F.btnClose()+'</div><div class="mu-t">'+musBadges(m)+'</div>'+
    '<audio controls preload="none" src="/admin/api/mkt/music/preview?id='+encodeURIComponent(id)+'" style="width:100%;height:34px"></audio>'+
    '<p class="muted small" style="margin:0">'+esc(m.license||"")+(m.artist?' · '+esc(m.artist):'')+' · Content-ID: '+esc(m.contentId||"unbekannt")+' · verwendet '+(m.use&&m.use.count||0)+'×'+(m.q&&!m.q.ok?' · <span class="bad-t">abgelehnt: '+esc((m.q.reasons||[]).join(", "))+'</span>':'')+(m.moodGuess?' · Stimmung geschätzt':'')+'</p>'+
    '<div class="mk-row2"><label class="fl">Stimmung<select class="f" name="mood">'+(PL.moods||[]).map(function(md){ return '<option value="'+esc(md.key)+'"'+(md.key===m.mood?' selected':'')+'>'+esc(md.label)+'</option>'; }).join("")+'</select></label>'+
    '<label class="fl">Energie<select class="f" name="energy">'+[1,2,3,4,5].map(function(i){ return '<option'+(i===m.energy?' selected':'')+'>'+i+'</option>'; }).join("")+'</select></label></div>'+
    '<div class="fl"><span>Weitere Stimmungen</span>'+chips("moods",(PL.moods||[]).map(function(x){ return x.key; }),m.moods||[])+'</div>'+
    '<div class="fl"><span>Genres</span>'+chips("genres",V.genres,m.genres||[])+'</div><div class="fl"><span>Instrumente</span>'+chips("instruments",V.instruments,m.instruments||[])+'</div>'+
    '<label class="chk"><input type="checkbox" name="vocals"'+(m.vocals?' checked':'')+'> enthält Gesang</label>'+
    (own?'<label class="fl">Lizenz<select class="f" name="license">'+(PL.musicLicenses||[]).map(function(l){ return '<option value="'+esc(l.key)+'"'+(l.key===m.licKey?' selected':'')+'>'+esc(l.text)+'</option>'; }).join("")+(m.licKey==="own-legacy"?'<option value="own-legacy" selected>eigene Datei (alt) – bitte Lizenz wählen</option>':'')+'</select></label>':'')+
    '<div class="foot"><span class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn sm" data-act="mkmusproof:'+esc(id)+'">Lizenznachweis kopieren</button><button type="button" class="btn sm" data-act="mkmusclaim:'+esc(id)+'">Claim gemeldet</button>'+(m.hidden?'<button type="button" class="btn sm" data-act="mkmusun:'+esc(id)+'">wieder verwenden</button>':'<button type="button" class="btn sm" data-act="mkmusdel:'+esc(id)+'">Ausblenden</button>')+'</span>'+
    '<span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Tags bestätigen</button></span></div></form>',"wide"); });
F.form("mkmustag",function(form){ var id=form.getAttribute("data-id"), all=function(n){ return Array.prototype.slice.call(form.querySelectorAll('[name="'+n+'"]:checked')).map(function(x){ return x.value; }); };
  var lic=form.querySelector('[name="license"]'), m=musTrack(id);
  var go=function(){ musSet({op:"tag",id:id,mood:form.mood.value,moods:all("moods"),energy:+form.energy.value,genres:all("genres"),instruments:all("instruments"),vocals:form.vocals.checked},"Tags gespeichert").then(function(j){ if(j) F.closeModal(); }); };
  if(lic&&m&&lic.value!==m.licKey&&lic.value!=="own-legacy"){ var cc=/^cc-by/.test(lic.value), art=cc?window.prompt("Künstler (Pflicht bei CC BY)",m.artist||""):"", src=cc?window.prompt("Quell-Adresse https://… (Pflicht bei CC BY)",m.sourceUrl||""):"";
    api("/admin/api/mkt/music",{op:"license",id:id,license:lic.value,artist:art||"",sourceUrl:src||""}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); PL=Object.assign(PL,j); go(); }); }
  else go(); });
F.action("mkmusproof",function(id){ api("/admin/api/mkt/music/proof?id="+encodeURIComponent(id)).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); try{ navigator.clipboard.writeText(j.text); F.toast("Lizenznachweis kopiert"); }catch(e){ F.toast("Bitte von Hand kopieren",true); } }); });
F.action("mkmusclaim",function(id){ F.confirm("Claim gemeldet? Der Titel wird sofort gesperrt; betroffene geplante Reels bekommen „Andere Musik“ vorgeschlagen.","Sperren",function(){ musSet({op:"claim",id:id},function(j){ var a=j.affected||[]; return a.length?"Gesperrt – betroffen: "+a.map(function(x){ return x.idea||x.id; }).join(", ")+" (dort „Andere Musik“)":"Gesperrt"; }); },true); });
F.action("mkmusun",function(id){ musSet({op:"restore",id:id},"Wird wieder verwendet").then(function(j){ if(j) F.closeModal(); }); });

// Nach dem Posten: Text ändern / Kommentare ein-aus / auf der Plattform löschen
// (stand bisher außerhalb der Funktionsklammer – dort gab es weder F noch PL, die Knöpfe taten nichts)
F.action("mprem",function(v){ var x=v.split("|"), p=PL.posts.find(function(q){ return q.id===x[0]; }); if(!p) return; var pf=x[1], act=x[2], r=(p.results||{})[pf]||{};
  var run=function(extra){ api("/admin/api/mkt/post",Object.assign({id:p.id,op:"remote",platform:pf,action:act},extra)).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); upd(j.post); F.closeModal(); F.toast(act==="delete"?"Auf "+pfLabel(pf)+" gelöscht":act==="edit"?"Text auf "+pfLabel(pf)+" geändert":"Gespeichert"); F.render(); }); };
  if(act==="delete") return F.confirm("Diesen Beitrag auf "+pfLabel(pf)+" endgültig löschen? Das lässt sich nicht rückgängig machen.","Löschen",function(){ run({confirm:true}); },true);
  if(act==="comments") return run({on:!!r.commentsOff});
  var txt=r.text||(p.preview&&p.preview[pf])||"", yt=pf==="youtube"||pf==="pinterest";
  F.modal('<form data-form="mprem" class="mp-ed"><div class="row-between"><h2 style="font-size:19px">Text auf '+esc(pfLabel(pf))+' ändern</h2>'+F.btnClose()+'</div>'+(yt?'<label class="fl">Titel<input class="f" name="title" maxlength="100" value="'+esc(pf==="youtube"?(p.captions||{}).youtubeTitle||"":(p.captions||{}).pinterestTitle||"")+'"></label>':'')+
    '<label class="fl">Text<textarea class="f" name="text" rows="8">'+esc(txt)+'</textarea></label><div class="foot"><span class="muted small">Wird direkt auf '+esc(pfLabel(pf))+' geändert.</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Ändern</button></span></div></form>',"wide");
  F.form("mprem",function(form){ var t=form.querySelector('[name="title"]'); run({text:form.querySelector('[name="text"]').value,title:t?t.value:""}); }); });

F.mktTab({id:"planer",label:"Planer",icon:"kal",order:1,sub:"Posts und Reels erstellen, freigeben, automatisch posten",render:planHtml,after:planAfter});
F.mktTab({id:"kanaele",label:"Kanäle",icon:"link",order:3,sub:"Social-Media-Konten verbinden",render:kanHtml});
})();
