/* Marketing › Posteingang (Server: mkt-posts.js /admin/api/mkt/inbox/all, Plattformen: mkt-publish.js inbox/inboxReply/inboxLike).
   Wie ein Mailprogramm: links EINE Zeile je Kommentar bzw. Unterhaltung (alle Marken oder eine), rechts der Verlauf mit Beitrag und Antwortfeld.
   Sofort da: alle Marken kommen in EINER Antwort aus dem Zwischenspeicher des Servers, aufgefrischt wird im Hintergrund („Stand vor … Min.“ + drehendes Symbol).
   Filtern und Wechseln passiert sofort im Browser, der letzte Stand bleibt beim Wechseln der Ansicht erhalten.
   Zustand je Eintrag: Neu (ungelesen) → Offen → Beantwortet; „Erledigt“ merkt sich der Server (bis wieder jemand schreibt).
   Likes sind keine Einträge, nur eine Zeile („… Likes diese Woche“) und die Beitragsübersicht rechts.
   Handy (≤ 900 px): Liste volle Breite, Antippen öffnet den Verlauf bildschirmfüllend (Zurück-Knopf, Antwortfeld unten fix). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
var BOX={}, CNT=null, CNTREQ=false, LOADING={}, REFR={}, BUSY={}, OPEN={}, DRAFT={}, MENU=false, PUSHED=false, LASTSEL="", PT=0;
var FAILED={}, ALT={}, QUOTE={};   // Medien, die nicht laden (abgelaufen/gelöscht) bzw. statt als Bild als Video nachgeladen werden; Antwortfeld im Zitat-Modus
var PULL=0, PV="", PLAST=0, PERR=false, PTIMER=0, SRV={keys:null,at:""};   // laufende Anfragen, Kennung des letzten Stands, letzte Antwort (fehlgeschlagen?), Marken laut Server
UI.mkInBrand=UI.mkInBrand||F.ls("fsc_mkin_b")||"alle";
UI.mkInKind=UI.mkInKind||"offen";
UI.mkInSort=UI.mkInSort||F.ls("fsc_mkin_sort")||"neu";
UI.mkInQ=UI.mkInQ||"";
UI.mkInSel=UI.mkInSel||"";
UI.mkInPane=UI.mkInPane||"";
F.icons.minbox='<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>';
F.icons.mheart='<path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 8.2-4.1L12 8l.8-1.1A4.6 4.6 0 0 1 21 11c-2 4.6-9 9-9 9z"/>';
F.icons.msort='<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5"/><path d="M17 20V4M13.5 7.5 17 4l3.5 3.5"/>';
F.icons.miplay='<path d="M8 5.5v13l10.5-6.5z"/>';
F.icons.mistory='<circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 2.3"/><path d="M12 8.5v7M8.5 12h7"/>';
F.icons.mirepost='<path d="M17 3.5 20.5 7 17 10.5"/><path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7h14"/><path d="M7 20.5 3.5 17 7 13.5"/><path d="M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5h-14"/>';
F.icons.miquote='<path d="M6.5 7h4v4c0 3-1.4 5-4 6"/><path d="M14 7h4v4c0 3-1.4 5-4 6"/>';
F.icons.mifile='<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>';
F.icons.micopy='<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>';
F.icons.miext='<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>';
F.icons.miup='<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 14.5V18A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5v-3.5"/>';
F.icons.miimg='<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-8.5 8.5"/>';
F.icons.mieye='<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>';
F.icons.miclock='<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>';
F.icons.mitag='<path d="M3.5 12.5V5A1.5 1.5 0 0 1 5 3.5h7.5l8 8-9 9z"/><circle cx="8.5" cy="8.5" r="1.5"/>';

/* Alpenglas: EIN Fenster aus Glas (Werkzeugleiste, Infozeile, zwei Spalten) – nichts Bedienbares liegt direkt auf dem Foto.
   Unschärfe als ::before, nie auf dem Fenster selbst – sonst hängt die bildschirmfüllende Ansicht am Handy fest;
   Zeilen durchsichtig, Hover/Auswahl über Tokens, eigene Nachrichten in Akzentfarbe. */
F.css(
'#miRoot{--mi-bg:var(--panel);--mi-solid:var(--panel-solid,var(--panel));--mi-ov:var(--panel-solid,var(--ground))}'+
':root[data-theme="glas"] #miRoot{--mi-bg:color-mix(in srgb,var(--panel-solid) 58%,transparent)}'+
'@media (prefers-reduced-transparency:reduce){:root[data-theme="glas"] #miRoot{--mi-bg:var(--panel-solid)}}'+
'.mi-win{position:relative;z-index:0;border:1px solid var(--line);border-radius:var(--r);background:var(--mi-bg);box-shadow:var(--shadow)}'+
':root[data-theme="glas"] .mi-win{background:transparent;border-color:var(--glass-line,var(--line));box-shadow:var(--glass-hi,0 0 0 0 transparent),var(--shadow)}'+
':root[data-theme="glas"] .mi-win::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--mi-bg);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);pointer-events:none;border-radius:inherit}'+
/* Werkzeugleiste: Marke · Reiter · Suche */
'@media (min-width:901px){#miRoot{container:mi/inline-size}}'+
'.mi-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap;position:relative;z-index:5;padding:12px 14px 0}'+
'@container mi (max-width:700px){.mi-q{flex-basis:100%;max-width:none;margin-left:0}}'+
'.mi-bw{position:relative;flex:none}'+
'.mi-bsel{display:inline-flex;align-items:center;gap:9px;min-height:42px;max-width:240px;padding:0 12px 0 14px;border-radius:14px;border:1px solid var(--glass-line,var(--line));background:var(--glass,var(--panel));box-shadow:var(--glass-hi,0 0 0 0 transparent);color:var(--ink);font:inherit;font-weight:600;font-size:14px;cursor:pointer;min-width:0}'+
'.mi-bsel:hover{border-color:var(--line-2)}.mi-bsel[aria-expanded="true"]{border-color:color-mix(in srgb,var(--glow) 50%,transparent)}'+
'.mi-bsel .mi-bt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}'+
'.mi-bsel>svg{width:16px;height:16px;color:var(--ink-3);flex:none}'+
'.mi-dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:0 0 0 1px var(--line-2)}'+
'.mi-dot.all{background:conic-gradient(#8b5cf6,#38bdf8,#34d399,#fbbf24,#f87171,#8b5cf6)}'+
'.mi-n{font-size:11.5px;font-weight:700;line-height:19px;padding:0 7px;border-radius:99px;background:var(--glow-soft);color:var(--glow-ink);font-variant-numeric:tabular-nums;flex:none}'+
'.mi-n.z{background:transparent;color:var(--ink-3);font-weight:600}'+
'.mi-menu{position:absolute;z-index:20;top:calc(100% + 6px);left:0;width:min(320px,calc(100vw - 32px));max-height:min(70vh,560px);overflow:auto;overscroll-behavior:contain;padding:6px;border-radius:16px;border:1px solid var(--glass-line,var(--line));background:var(--glass-strong,var(--panel-solid));-webkit-backdrop-filter:var(--glass-blur,none);backdrop-filter:var(--glass-blur,none);box-shadow:var(--shadow-pop,var(--shadow));display:grid;gap:2px}'+
'.mi-mi{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;min-height:44px;padding:6px 10px;border:0;border-radius:11px;background:none;color:var(--ink);font:inherit;text-align:left;cursor:pointer}'+
'.mi-mi:hover,.mi-mi:focus-visible{background:var(--hover,var(--sunk));outline:none}.mi-mi[aria-current="true"]{background:var(--sel)}'+
'.mi-mi .mi-bwho{display:grid;min-width:0}.mi-mi b{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-mi small{font-size:12px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-mi.off b{color:var(--ink-2);font-weight:500}'+
'.mi-msep{height:1px;background:var(--line);margin:4px 6px}'+
'.mi-seg{display:inline-flex;gap:2px;padding:3px;border-radius:13px;background:var(--sunk);border:1px solid var(--line);flex:none;max-width:100%;overflow-x:auto;scrollbar-width:none}.mi-seg::-webkit-scrollbar{display:none}'+
'.mi-seg button{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border:0;border-radius:10px;background:none;color:var(--ink-2);font:inherit;font-size:13.5px;font-weight:600;white-space:nowrap;cursor:pointer;flex:none}'+
'.mi-seg button:hover{color:var(--ink);background:var(--hover,var(--sunk))}'+
'.mi-seg button[aria-pressed="true"]{background:var(--active,var(--sel));color:var(--ink);box-shadow:0 1px 3px rgb(0 0 0/.18)}'+
'.mi-seg .mi-c{font-size:12px;font-weight:600;color:var(--ink-3);font-variant-numeric:tabular-nums}'+
'.mi-seg button[aria-pressed="true"] .mi-c{color:var(--ink-2)}.mi-seg .mi-c.hot{color:var(--glow-ink);font-weight:700}'+
'.mi-q{position:relative;flex:1 1 120px;min-width:120px;max-width:420px;margin-left:auto}'+
'.mi-q>svg{position:absolute;left:12px;top:50%;width:16px;height:16px;transform:translateY(-50%);color:var(--ink-3);pointer-events:none}'+
'.mi-q input{width:100%;height:42px;padding:0 36px 0 38px;border-radius:14px;border:1px solid var(--glass-line,var(--line));background:var(--field,var(--panel));color:var(--ink);font:inherit;font-size:14px}'+
'.mi-q input::placeholder{color:var(--ink-3)}.mi-q input:focus{outline:none;border-color:var(--glow);box-shadow:0 0 0 3px var(--glow-soft)}'+
'.mi-q input::-webkit-search-cancel-button{display:none}.mi-q:not(.has) input{padding-right:10px}'+
'.mi-q .mi-qx{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;border-radius:9px;background:none;color:var(--ink-3);display:grid;place-items:center;cursor:pointer}.mi-q .mi-qx:hover{background:var(--hover,var(--sunk));color:var(--ink)}.mi-q .mi-qx svg{width:14px;height:14px}'+
/* Infozeile: Likes · Hinweise · Sortierung · Stand */
'.mi-meta{display:flex;align-items:center;gap:4px 14px;flex-wrap:wrap;padding:6px 14px 6px 16px;font-size:12.5px;color:var(--ink-3);min-height:40px}'+
'.mi-meta .mi-sp{flex:1}'+
'.mi-lnk{display:inline-flex;align-items:center;gap:6px;border:0;background:none;padding:4px 2px;color:var(--ink-2);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;border-radius:8px;white-space:nowrap;font-variant-numeric:tabular-nums}'+
'.mi-lnk:hover{color:var(--ink)}.mi-lnk svg{width:15px;height:15px;flex:none}'+
'.mi-lnk.likes svg{color:var(--pink)}.mi-lnk.warn,.mi-lnk.warn svg{color:var(--warn)}'+
'.mi-lnk[disabled]{opacity:.6;cursor:default}'+
'.mi-stamp{white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:500;color:var(--ink-3)}.mi-lnk:hover .mi-stamp{color:var(--ink-2)}'+
'.mi-lnk.busy svg{animation:mispin .9s linear infinite}'+
'.mi-spin{display:inline-block;width:11px;height:11px;border:2px solid var(--line-2);border-top-color:var(--glow);border-radius:50%;animation:mispin .8s linear infinite;vertical-align:-1px;flex:none}'+
'@keyframes mispin{to{transform:rotate(360deg)}}'+
'@media (prefers-reduced-motion:reduce){.mi-spin,.mi-lnk.busy svg{animation:none}.mi-spin{border-top-color:var(--glow)}}'+
/* Zwei Spalten unten im Fenster */
'.mi-box{display:grid;grid-template-columns:clamp(320px,40%,440px) minmax(0,1fr);height:var(--mi-h,calc(100vh - 290px));min-height:480px;border-top:1px solid var(--line);border-radius:0 0 calc(var(--r) - 1px) calc(var(--r) - 1px);overflow:clip;position:relative}'+
'.mi-lp{display:flex;flex-direction:column;min-height:0;min-width:0;border-right:1px solid var(--line)}'+
'.mi-scroll{overflow-y:auto;flex:1;min-height:0;overscroll-behavior:contain;scrollbar-width:thin}'+
'.mi-rp{display:flex;flex-direction:column;min-height:0;min-width:0;container-type:inline-size}'+
'.mi-solo .mi-top{padding-bottom:12px}.mi-solo .mi-box{display:block;height:auto;min-height:0}.mi-solo .mi-empty{padding:56px 22px}'+
/* Zeile */
'.mi-row{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;padding:11px 14px 11px 18px;border-bottom:1px solid var(--line);cursor:pointer;position:relative;background:transparent;transition:background .12s;outline:none}'+
'.mi-row:hover{background:var(--hover,var(--sunk))}'+
'.mi-row:focus-visible{box-shadow:inset 0 0 0 2px var(--glow)}'+
'.mi-row.sel{background:var(--sel);box-shadow:inset 3px 0 0 var(--glow)}'+
'.mi-row.unread::before{content:"";position:absolute;left:6px;top:27px;width:7px;height:7px;border-radius:50%;background:var(--glow);box-shadow:0 0 0 3px var(--glow-soft)}'+
'.mi-rm{display:grid;gap:2px;min-width:0}'+
'.mi-rm .mi-l1,.mi-rm .mi-l3{display:flex;align-items:center;gap:6px;min-width:0}'+
'.mi-rm .mi-who{flex:1;min-width:0;font-size:14.5px;font-weight:600;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-row.unread .mi-who{font-weight:700;color:var(--ink)}'+
'.mi-rm .mi-when{flex:none;font-size:12px;color:var(--ink-3);white-space:nowrap;font-variant-numeric:tabular-nums}'+
'.mi-row.unread .mi-when{color:var(--glow-ink);font-weight:600}'+
'.mi-rm .mi-pre{font-size:13.5px;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}'+
'.mi-row.unread .mi-pre{color:var(--ink)}'+
'.mi-rm .mi-pre i{font-style:normal;color:var(--ink-3)}'+
'.mi-rm .mi-l3{font-size:12px;color:var(--ink-3);margin-top:2px}'+
'.mi-rm .mi-l3 .mi-bn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:3.2em;flex:0 1 auto}'+
'.mi-rm .mi-l3 .mi-kd{white-space:nowrap;flex:none}.mi-rm .mi-l3 .mi-sp{flex:1}'+
'.mi-rm .mi-dot{width:7px;height:7px}'+
'.mi-st{display:inline-flex;align-items:center;font-size:11px;font-weight:700;line-height:18px;padding:0 7px;border-radius:99px;white-space:nowrap;flex:none}'+
'.mi-st.neu{background:var(--glow-soft);color:var(--glow-ink)}.mi-st.offen{background:var(--warn-soft);color:var(--warn)}'+
'.mi-st.beantwortet{background:var(--ok-soft);color:var(--ok)}.mi-st.erledigt,.mi-st.eigen{background:var(--sunk);color:var(--ink-3)}'+
/* Avatar mit Plattform-Zeichen */
'.mi-av{position:relative;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-size:13.5px;font-weight:700;flex:none;letter-spacing:.01em}'+
'.mi-av .mi-pfb{position:absolute;right:-3px;bottom:-3px;width:19px;height:19px;border-radius:50%;display:grid;place-items:center;background:var(--mi-solid);box-shadow:0 0 0 1.5px var(--line-2);color:var(--ink-2)}'+
'.mi-av .mi-pfb svg{width:12px;height:12px}'+
'.mi-av .mi-pfb.instagram{color:var(--pink)}.mi-av .mi-pfb.facebook,.mi-av .mi-pfb.bluesky{color:var(--info)}.mi-av .mi-pfb.youtube{color:var(--bad)}'+
'.mi-av.lg{width:42px;height:42px;font-size:14px}'+
/* Gerüst beim Laden */
'.mi-sk{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;padding:13px 14px 13px 18px;border-bottom:1px solid var(--line)}'+
'.mi-sk i{display:block;border-radius:8px;background:var(--sunk);height:11px}.mi-sk .mi-ska{width:40px;height:40px;border-radius:50%}.mi-sk .mi-skb{display:grid;gap:8px;align-content:center}'+
'@media (prefers-reduced-motion:no-preference){.mi-sk i{animation:mipulse 1.4s ease-in-out infinite}}'+
'@keyframes mipulse{50%{opacity:.45}}'+
/* Leere Zustände, Hinweise */
'.mi-empty{display:grid;justify-items:center;align-content:center;gap:6px;padding:44px 22px;color:var(--ink-3);text-align:center;font-size:13.5px;text-wrap:pretty;min-height:100%}'+
'.mi-empty b{color:var(--ink);font-size:16px;font-weight:700;text-wrap:balance}'+
'.mi-empty .mi-ei{width:52px;height:52px;border-radius:18px;background:var(--sunk);display:grid;place-items:center;color:var(--ink-2);margin-bottom:4px}.mi-empty .mi-ei svg{width:24px;height:24px}'+
'.mi-empty .mi-ea{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px}'+
'.mi-empty .btn svg,.mi-ban .btn svg{width:15px;height:15px}'+
'.mi-ban{display:flex;gap:10px;align-items:center;padding:9px 12px 9px 14px;border-bottom:1px solid color-mix(in srgb,var(--warn) 30%,transparent);background:var(--warn-soft);font-size:13px;color:var(--ink)}'+
'.mi-ban.bad{background:var(--bad-soft);border-bottom-color:color-mix(in srgb,var(--bad) 30%,transparent)}'+
'.mi-ban>svg{width:17px;height:17px;flex:none;color:var(--warn)}.mi-ban.bad>svg{color:var(--bad)}'+
'.mi-ban span{flex:1;min-width:0;text-wrap:pretty;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35}'+
'.mi-ban .btn{flex:none}'+
'.mi-bans .mi-ban{border-bottom:0;border-top:1px solid color-mix(in srgb,var(--bad) 30%,transparent);padding:8px 14px 8px 16px}.mi-bans .mi-ban span{-webkit-line-clamp:3}'+
'.mi-loadl{display:flex;align-items:center;gap:8px;padding:8px 18px;font-size:12.5px;color:var(--ink-3);border-bottom:1px solid var(--line)}'+
/* Verlauf: Kopf, Inhalt, Antwortfeld */
'.mi-th{display:flex;align-items:center;gap:12px;padding:12px 14px 12px 18px;border-bottom:1px solid var(--line);min-width:0;flex:none}'+
'.mi-tw{display:grid;gap:1px;min-width:0;flex:1}'+
'.mi-tw b{font-size:16px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-tw span{font-size:12.5px;color:var(--ink-3);display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden}'+
'.mi-tw span>*{flex:none}.mi-tw span .mi-bn{overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;min-width:0}'+
'.mi-ta{display:flex;gap:4px;align-items:center;flex:none}'+
'.mi-ib{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;min-width:38px;padding:0 10px;border:1px solid transparent;border-radius:11px;background:none;color:var(--ink-2);font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;text-decoration:none}'+
'.mi-ib:hover{background:var(--hover,var(--sunk));color:var(--ink)}.mi-ib svg{width:18px;height:18px;flex:none}'+
'.mi-ib.dg:hover{background:var(--bad-soft);color:var(--bad)}'+
'.mi-ib.done{border-color:var(--line);background:var(--sunk);color:var(--ink)}.mi-ib.done svg{color:var(--ok)}.mi-ib.done:hover{border-color:color-mix(in srgb,var(--ok) 45%,transparent)}'+
'.mi-ib.done.on svg{color:var(--ink-3)}'+
'.mi-back{display:none}'+
'@container (max-width:620px){.mi-ib:not(.done) .mi-rl{display:none}.mi-ib:not(.done){padding:0 9px}}'+
'@container (max-width:540px){.mi-th>.mi-av{display:none}.mi-th{padding-left:16px}}'+
'@container (max-width:420px){.mi-ib .mi-rl{display:none}.mi-ib{padding:0 9px}}'+
'.mi-tb{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 18px 18px;display:flex;flex-direction:column;gap:10px}'+
'.mi-pctx{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 12px;border-radius:14px;background:var(--sunk);border:1px solid var(--line);text-decoration:none;color:var(--ink);margin-bottom:6px}'+
'.mi-pctx:hover{border-color:var(--line-2)}'+
'.mi-pctx img,.mi-pctx .mi-ph{width:52px;height:52px;border-radius:10px;object-fit:cover;display:grid;place-items:center;background:var(--hover,var(--sunk));color:var(--ink-3)}.mi-pctx .mi-ph svg{width:22px;height:22px}'+
'.mi-pctx .mi-pt{display:grid;gap:2px;min-width:0}'+
'.mi-pctx small{font-size:12px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.mi-pctx .mi-cap{font-size:13.5px;line-height:1.4;color:var(--ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;text-wrap:pretty}'+
'.mi-pctx .mi-go{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--glow-ink);white-space:nowrap}.mi-pctx .mi-go svg{width:14px;height:14px}'+
'.mi-day{align-self:center;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:var(--ink-3);background:var(--sunk);border-radius:99px;padding:2px 10px;margin:6px 0 2px}'+
'.mi-b{align-self:flex-start;max-width:min(82%,560px);display:grid;gap:3px}'+
'.mi-b .mi-bb{padding:9px 13px;border-radius:18px 18px 18px 6px;background:var(--sunk);border:1px solid var(--line);color:var(--ink);font-size:14.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;text-wrap:pretty;-webkit-hyphens:auto;hyphens:auto}'+
'.mi-b .mi-bwho{font-size:12px;font-weight:700;color:var(--ink-2);padding:0 6px}'+
'.mi-b .mi-bmeta{font-size:11.5px;color:var(--ink-3);padding:0 6px;display:flex;gap:8px;align-items:center;font-variant-numeric:tabular-nums;flex-wrap:wrap}'+
'.mi-b .mi-bmeta svg{width:13px;height:13px;color:var(--pink)}'+
'.mi-b.me{align-self:flex-end;justify-items:end}'+
'.mi-b.me .mi-bb{background:var(--glow);border-color:transparent;color:var(--on-glow);border-radius:18px 18px 6px 18px}'+
'.mi-b.lead .mi-bb{font-size:15px}'+
'.mi-bb a{color:inherit;text-decoration:underline;text-underline-offset:2px;-webkit-hyphens:none;hyphens:none}'+
'.mi-b.rep{margin-left:22px}'+
'.mi-like{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:none;border-radius:99px;padding:2px 10px 2px 8px;min-height:26px;color:var(--ink-2);font:inherit;font-size:12px;font-weight:600;cursor:pointer}'+
'.mi-like:hover{border-color:var(--pink);color:var(--ink)}.mi-like svg{width:13px;height:13px}'+
'.mi-like[disabled]{cursor:default;opacity:1;border-color:transparent;background:color-mix(in srgb,var(--pink) 16%,transparent);color:var(--pink)}.mi-like[disabled] svg{fill:currentColor}'+
'.mi-more{align-self:center;border:1px solid var(--line);background:var(--sunk);border-radius:99px;padding:4px 12px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink-2);cursor:pointer}.mi-more:hover{color:var(--ink)}'+
'.mi-cmp{flex:none;padding:10px 14px 14px;border-top:1px solid var(--line)}'+
'.mi-cbox{border:1px solid var(--line);border-radius:16px;background:var(--field,var(--panel));padding:8px 10px 8px 12px;display:grid;gap:6px}'+
'.mi-cbox:focus-within{border-color:var(--glow);box-shadow:0 0 0 3px var(--glow-soft)}'+
'.mi-cbox textarea{border:0;background:none;resize:none;width:100%;min-height:44px;max-height:200px;font:inherit;font-size:14.5px;line-height:1.45;color:var(--ink);outline:none;padding:4px 0}'+
'.mi-cbox textarea::placeholder{color:var(--ink-3)}'+
'.mi-cbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'+
'.mi-cbar .mi-sp{flex:1}'+
'.mi-hint{font-size:12px;color:var(--ink-3);white-space:nowrap}'+
'.mi-cnt{font-size:12px;color:var(--ink-3);font-variant-numeric:tabular-nums}.mi-cnt.over{color:var(--bad);font-weight:700}'+
'.mi-ki{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:99px;border:1px solid color-mix(in srgb,var(--glow) 35%,transparent);background:var(--glow-soft);color:var(--glow-ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}'+
'.mi-ki:hover{border-color:var(--glow)}.mi-ki svg{width:15px;height:15px}.mi-ki[disabled]{opacity:.7;cursor:progress}'+
'#miRoot .mi-send{min-height:36px;padding:0 14px}.mi-send svg{width:15px;height:15px}'+
'.mi-noreply{font-size:13px;color:var(--ink-3);padding:4px 2px;text-wrap:pretty}'+
/* Überblick rechts (nichts gewählt / Likes) */
'.mi-ovb{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:20px 22px 24px;display:grid;gap:18px;align-content:start}'+
'.mi-pick{display:flex;align-items:center;gap:12px;color:var(--ink-3);font-size:13.5px;text-wrap:pretty}.mi-pick svg{width:20px;height:20px;flex:none}'+
'.mi-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px}'+
'.mi-kpi{border:1px solid var(--line);background:var(--sunk);border-radius:14px;padding:12px 14px;display:grid;gap:2px;align-content:start;text-align:left;font:inherit;color:var(--ink);cursor:pointer}'+
'.mi-kpi:hover{border-color:var(--line-2)}'+
'.mi-kpi b{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}.mi-kpi span{font-size:12.5px;color:var(--ink-3)}'+
'.mi-h3{font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3);margin:0;display:flex;align-items:center;gap:8px}'+
'.mi-h3 .mi-sp{flex:1}.mi-h3 small{font-size:12px;letter-spacing:0;text-transform:none;font-weight:500}'+
'.mi-posts{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px}'+
'.mi-pc{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--sunk);text-decoration:none;color:var(--ink);display:grid;align-content:start}'+
'.mi-pc:hover{border-color:var(--line-2)}'+
'.mi-pc img,.mi-pc .mi-ph{width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--hover,var(--sunk));display:grid;place-items:center;color:var(--ink-3)}.mi-pc .mi-ph svg{width:26px;height:26px}'+
'.mi-pc>div{padding:8px 10px 10px;font-size:12px;display:grid;gap:4px;min-width:0}'+
'.mi-pc .mi-pk{display:flex;gap:12px;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}'+
'.mi-pc .mi-pk span{display:inline-flex;align-items:center;gap:4px}.mi-pc .mi-pk svg{width:14px;height:14px;flex:none}.mi-pc .mi-pk .mi-lk svg{color:var(--pink)}'+
'.mi-pc .mi-ps{display:flex;align-items:center;gap:5px;color:var(--ink-3);min-width:0;white-space:nowrap;overflow:hidden}.mi-pc .mi-ps svg{width:13px;height:13px;flex:none}.mi-pc .mi-ps span{overflow:hidden;text-overflow:ellipsis}'+
'.mi-pc .mi-px{color:var(--ink-2);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.35}'+
'.mi-notes{display:grid;gap:6px;margin:0;padding:0;list-style:none}.mi-notes li{font-size:13px;color:var(--ink-2);background:var(--sunk);border-radius:12px;padding:8px 12px;text-wrap:pretty;overflow-wrap:anywhere}'+
'.mi-foot{font-size:12px;color:var(--ink-3);text-wrap:pretty;margin:0}'+
/* Handy: Liste volle Breite, Verlauf bildschirmfüllend */
'@media (max-width:900px){'+
'  .mi-top{gap:8px;padding:10px 10px 0}.mi-solo .mi-top{padding-bottom:10px}.mi-bw{flex:1 1 0;min-width:0}.mi-menu{width:calc(100% + 54px)}.mi-bsel{width:100%;max-width:none;min-height:46px;font-size:15px}.mi-bsel .mi-bt{flex:1;text-align:left}'+
/* Suche am Handy: Lupe neben der Marke, klappt beim Antippen (oder mit Suchtext) auf eine eigene Zeile auf */
'  .mi-q{order:2;flex:0 0 46px;min-width:0;max-width:none;margin:0}.mi-q input{height:46px;font-size:16px;border-radius:14px;padding:0 0 0 44px;cursor:pointer;background:var(--glass,var(--field))}.mi-q input::placeholder{color:transparent}.mi-q>svg{left:15px}'+
'  .mi-q:focus-within,.mi-q.has{order:3;flex:1 1 100%}.mi-q:focus-within input,.mi-q.has input{padding:0 40px;cursor:text;background:var(--field,var(--panel))}.mi-q:focus-within input::placeholder,.mi-q.has input::placeholder{color:var(--ink-3)}.mi-q:focus-within>svg,.mi-q.has>svg{left:13px}'+
'  .mi-seg{order:4;flex:1 1 100%;display:flex;gap:0}.mi-seg button{flex:1 1 auto;justify-content:center;min-height:44px;font-size:13px;padding:0 5px;gap:3px}.mi-seg .mi-c{font-size:11.5px}'+
'  .mi-meta{padding:4px 6px 2px 8px;gap:0 6px}.mi-lnk{min-height:44px;padding:4px 6px}.mi-lnk.likes{flex:1 1 100%;min-width:0}.mi-meta .mi-sp{display:none}.mi-lnk.mi-rf{margin-left:auto}.mi-sw{display:none}'+
'  .mi-box{display:block;height:auto!important;min-height:0}'+
'  .mi-lp{border-right:0}.mi-scroll{overflow:visible}.mi-scroll>.mi-row:last-child,.mi-scroll>.mi-sk:last-child{border-bottom:0}'+
'  .mi-row{padding:12px 14px 12px 18px;gap:12px}.mi-rm .mi-who{font-size:15px}.mi-rm .mi-pre{font-size:14px}'+
'  .mi-box:not(.reading)>.mi-rp{display:none}'+
'  .mi-win.reading{z-index:auto}'+
'  .mi-box.reading>.mi-rp{position:fixed;inset:0;z-index:45;background:var(--mi-ov);container-type:normal}'+
'  :root[data-theme="glas"] .mi-box.reading>.mi-rp{background:var(--glass-strong);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur)}'+
'  html:has(.mi-box.reading){overflow:hidden}'+
'  .mi-th{padding:calc(8px + env(safe-area-inset-top,0px)) 8px 8px 6px;gap:8px;background:var(--mi-solid)}'+
'  :root[data-theme="glas"] .mi-th{background:color-mix(in srgb,var(--panel-solid) 70%,transparent)}'+
'  .mi-back{display:inline-flex;min-width:44px;min-height:44px;padding:0;color:var(--ink)}.mi-back svg{width:22px;height:22px}'+
'  .mi-th .mi-av{display:none}.mi-tw b{font-size:16px}'+
'  .mi-ib{min-width:44px;min-height:44px}.mi-ib .mi-rl{display:none}.mi-ib.done{padding:0}'+
'  .mi-tb{padding:14px 14px 18px}.mi-b{max-width:88%}.mi-like{min-height:44px;padding:0 16px 0 14px;font-size:13.5px}.mi-more{min-height:44px}.mi-pctx{min-height:72px}'+
'  .mi-cmp{padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px));background:var(--mi-solid)}'+
'  :root[data-theme="glas"] .mi-cmp{background:color-mix(in srgb,var(--panel-solid) 70%,transparent)}'+
'  .mi-cbox textarea{font-size:16px;min-height:44px}'+
'  .mi-hint{display:none}#miRoot .mi-send,.mi-ki{min-height:44px}#miRoot .mi-send{padding:0 18px;font-size:14px}'+
'  #miRoot .mi-empty .btn,#miRoot .mi-ban .btn{min-height:44px;padding:0 16px}'+
'  .mi-ovb{padding:16px 14px calc(24px + env(safe-area-inset-bottom,0px))}'+
'  .mi-kpis{grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}.mi-kpi{padding:10px 11px;min-height:64px}.mi-kpi b{font-size:19px}.mi-kpi span{font-size:12px;line-height:1.3}'+
'}'
);
/* Anhänge im Verlauf: Fotos/GIFs (Klick vergrößert), Sticker, Videos, Sprachnachrichten, Dateien, geteilte Beiträge/Reels, Story-Erwähnungen (9:16 mit Restzeit),
   Platzhalter mit Grund (abgelaufen, gelöscht, nur in der App), Kontextleiste (Anfrage, Teilen, Reposten) und die Dialoge zum Teilen */
F.css(
'.mi-atts{display:grid;gap:6px;justify-items:start;min-width:0;max-width:100%}.mi-b.me .mi-atts{justify-items:end}'+
'.mi-at{max-width:100%;min-width:0}'+
'.mi-img{display:block;position:relative;padding:0;width:240px;max-height:340px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--sunk);cursor:zoom-in}'+
'.mi-img img{display:block;width:100%;height:100%;object-fit:cover}'+
'.mi-gif{position:absolute;left:8px;bottom:8px;font-size:10.5px;font-weight:800;letter-spacing:.06em;padding:1px 6px;border-radius:6px;background:rgb(0 0 0/.55);color:#fff}'+
'.mi-stk img{display:block;width:96px;height:96px;object-fit:contain}'+
'.mi-vid{display:block;width:260px;max-height:380px;border-radius:16px;background:#000;border:1px solid var(--line)}'+
'.mi-aud audio{display:block;width:min(280px,72vw);height:40px}'+
'.mi-file{display:flex;align-items:center;gap:10px;width:270px;padding:9px 12px;border:1px solid var(--line);border-radius:14px;background:var(--sunk)}'+
'.mi-file>svg{width:22px;height:22px;flex:none;color:var(--ink-2)}.mi-file>span{display:grid;min-width:0;flex:1}'+
'.mi-file b{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mi-file small{font-size:12px;color:var(--ink-3)}'+
'.mi-xl{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--glow-ink);text-decoration:none}.mi-xl:hover{text-decoration:underline}.mi-xl svg{width:13px;height:13px;flex:none}'+
'.mi-card{display:grid;width:240px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--sunk);text-decoration:none;color:var(--ink)}'+
'.mi-cm{position:relative;overflow:hidden;max-height:300px;background:var(--hover,var(--sunk))}.mi-card.reel .mi-cm{max-height:360px}'+
'.mi-cm img,.mi-cm video{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}'+
'.mi-cm .mi-ph2{position:absolute;inset:0;display:grid;place-items:center;color:var(--ink-3)}.mi-cm .mi-ph2 svg{width:28px;height:28px}'+
'.mi-pl{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none}.mi-pl svg{width:44px;height:44px;color:#fff;fill:rgb(255 255 255/.9);filter:drop-shadow(0 2px 6px rgb(0 0 0/.5))}'+
'.mi-cb{display:grid;gap:4px;padding:9px 12px 11px;min-width:0}.mi-cb small{font-size:12px;color:var(--ink-3);font-weight:600}'+
'.mi-cb .mi-cap{font-size:13.5px;line-height:1.4;color:var(--ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}'+
'.mi-link{grid-template-columns:72px minmax(0,1fr);align-items:center;width:280px}.mi-link.nt{grid-template-columns:minmax(0,1fr)}.mi-link>img{display:block;width:72px;height:72px;object-fit:cover}'+
'.mi-link b{font-size:13.5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}'+
'.mi-quote{display:grid;gap:4px;width:280px;padding:10px 12px;border:1px solid var(--line);border-left:3px solid var(--info);border-radius:12px;background:var(--sunk);text-decoration:none;color:var(--ink);font-size:13.5px;line-height:1.4;overflow-wrap:anywhere}'+
'.mi-quote small{font-size:12px;color:var(--ink-3);font-weight:600}.mi-quote img{width:100%;max-height:160px;object-fit:cover;border-radius:8px}.mi-quote.gone{color:var(--ink-3);font-style:italic;border-left-color:var(--line-2)}'+
'.mi-note{display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:min(380px,100%);padding:8px 12px;border-radius:12px;background:var(--sunk);border:1px dashed var(--line-2);font-size:13px;line-height:1.4;color:var(--ink-2)}'+
'.mi-note>svg{width:16px;height:16px;flex:none;color:var(--ink-3)}.mi-note>span{flex:1 1 180px;min-width:0;text-wrap:pretty}'+
'.mi-gone{display:grid;gap:6px;justify-items:start;width:250px;padding:14px;border-radius:16px;border:1px dashed var(--line-2);background:var(--sunk);color:var(--ink-2);font-size:13px;line-height:1.4;text-wrap:pretty}'+
'.mi-gone>svg{width:22px;height:22px;color:var(--ink-3)}.mi-gone b{color:var(--ink);font-size:13.5px}'+
/* Story-Erwähnung bzw. Antwort auf deine Story: Hochformat mit Restzeit, abgelaufen → dunkler Platzhalter mit Datum */
'.mi-story{display:grid;width:200px;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:var(--sunk)}.mi-story.rep{width:150px}'+
'.mi-sth{padding:8px 11px;font-size:12.5px;line-height:1.35;color:var(--ink-2);text-wrap:pretty}.mi-sth b{color:var(--ink)}'+
'.mi-stm{position:relative;aspect-ratio:9/16;overflow:hidden;background:#0d1117}.mi-stm img,.mi-stm video{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}'+
'.mi-cd{position:absolute;left:8px;top:8px;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:99px;background:rgb(0 0 0/.62);color:#fff;font-variant-numeric:tabular-nums}.mi-cd.low{background:#f59e0b;color:#1a1300}'+
'.mi-stp{position:absolute;inset:0;display:grid;align-content:center;justify-items:center;gap:7px;padding:14px;text-align:center;color:#d6dbe4;background:linear-gradient(160deg,#1d2533,#0d1117)}'+
'.mi-stp>svg{width:28px;height:28px;color:#9aa4b5}.mi-stp b{font-size:13.5px;line-height:1.3;color:#fff;text-wrap:balance}.mi-stp small{font-size:12px;color:#9aa4b5}.mi-stp .mi-xl{display:inline;color:#a9cbff;line-height:1.35}.mi-stp .mi-xl svg{display:inline;vertical-align:-2px;margin-right:4px}'+
'.mi-sta{display:grid;gap:6px;padding:9px}.mi-sta .btn{justify-content:center}.mi-sta .btn svg{width:15px;height:15px}'+
'.mi-rto{max-width:100%;margin:0 6px;padding:0 0 0 8px;border-left:2px solid var(--line-2);font-size:12px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-reacts{display:inline-flex;gap:3px}.mi-reacts span{font-size:12.5px;line-height:20px;padding:0 5px;border-radius:99px;background:var(--sunk);border:1px solid var(--line)}'+
/* Kontextleiste unter dem Kopf: Anfrage annehmen, in die Story teilen, reposten/zitieren, Ergebnis */
'.mi-xb{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:9px 14px 9px 18px;border-bottom:1px solid var(--line);font-size:13px;line-height:1.4;color:var(--ink-2);flex:none}'+
'.mi-xb>svg{width:17px;height:17px;flex:none;color:var(--glow-ink)}.mi-xb>span:first-of-type{flex:1 1 220px;min-width:0;text-wrap:pretty}.mi-xb b{color:var(--ink)}'+
'.mi-xb.req{background:var(--glow-soft)}.mi-xb.info>svg{color:var(--ink-3)}'+
'.mi-xa{display:flex;gap:6px;flex-wrap:wrap}.mi-xa .btn svg{width:15px;height:15px}'+
'.mi-chip{display:inline-flex;align-items:center;font-size:12px;font-weight:700;line-height:20px;padding:0 9px;border-radius:99px;background:var(--ok-soft);color:var(--ok)}'+
'.mi-w24{display:flex;gap:8px;align-items:flex-start;margin:0 0 8px;font-size:12.5px;line-height:1.4;color:var(--warn);text-wrap:pretty}.mi-w24 svg{width:15px;height:15px;flex:none;margin-top:1px}.mi-w24 a{color:inherit;font-weight:600}'+
'.mi-qm{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:12.5px;color:var(--ink-2)}.mi-qm>svg{width:15px;height:15px;flex:none;color:var(--info)}.mi-qm>span{flex:1;min-width:0}'+
/* Liste: Mini-Vorschau, Restzeit */
'.mi-l2{display:flex;align-items:center;gap:8px;min-width:0}.mi-l2 .mi-pre{flex:1}'+
'.mi-mt{width:34px;height:34px;flex:none;border-radius:8px;overflow:hidden;background:var(--sunk);border:1px solid var(--line)}.mi-mt img{display:block;width:100%;height:100%;object-fit:cover}'+
'.mi-st.cd{background:var(--glow-soft);color:var(--glow-ink)}.mi-st.cd.low{background:var(--warn-soft);color:var(--warn)}.mi-st.ex{background:var(--sunk);color:var(--ink-3)}'+
'.mi-rm .mi-kd.hl{color:var(--glow-ink);font-weight:600}.mi-rm .mi-l3 .mi-kd{flex:0 1 auto;min-width:2.5em;overflow:hidden;text-overflow:ellipsis}'+
/* Dialoge: In die Story teilen (QR), als eigene Story hochladen, Bild groß */
'.mi-shp{margin:0;font-size:13.5px;line-height:1.45;color:var(--ink-2);text-wrap:pretty}.mi-shp,.mi-steps,.mi-up,.mi-consent,.mi-xb{-webkit-hyphens:manual;hyphens:manual}.mi-nw{white-space:nowrap}'+
'.mi-qr{justify-self:center;width:216px;height:216px;display:grid;place-items:center;padding:10px;border-radius:16px;background:#fff;color:#333}.mi-qr svg{width:100%;height:100%}'+
'.mi-steps{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;line-height:1.45}'+
'.mi-up{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start}.mi-up img{width:96px;height:120px;object-fit:cover;border-radius:12px;background:var(--sunk)}.mi-up p{margin:0;font-size:13.5px;line-height:1.45}'+
'.mi-consent{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--sunk);font-size:14px;line-height:1.4;cursor:pointer}.mi-consent input{width:18px;height:18px;margin-top:2px;flex:none}'+
'.mi-zoom{width:100%;max-height:75vh;object-fit:contain;border-radius:12px;background:var(--sunk)}'+
'@media (max-width:900px){.mi-seg{flex-wrap:wrap;overflow:visible}.mi-xb{padding:8px 12px}.mi-xa{flex:1 1 100%}.mi-xa .btn{flex:1;justify-content:center;min-height:44px}.mi-img{width:220px}.mi-story{width:180px}.mi-sta .btn{min-height:44px}.mi-mt{width:38px;height:38px}}'
);

function api(path,body){ return F.api(path,body?{body:body}:undefined); }
/* Aktionen (gelesen, antworten, liken, erledigt, ausblenden, löschen): eine Antwort von /inbox/all, die der Server vor dem Ende einer Aktion
   zusammengestellt hat, würde den gerade geänderten Eintrag zurücksetzen → verwerfen und nach der Aktion frisch holen */
var ACTS=0, AGEN=0, REPULL=false;
function act(body){ ACTS++; AGEN++;
  return api("/admin/api/mkt/inbox/act",body).catch(function(){ return {ok:false,error:"Keine Verbindung zum Server"}; })
    .then(function(j){ ACTS--; AGEN++; setTimeout(repull,0); return j; }); }
function repull(){ if(REPULL&&!ACTS&&!PULL){ REPULL=false; pull(""); } }
function mob(){ return !!(window.matchMedia&&matchMedia("(max-width:900px)").matches); }
function brands(){ var S=F.mktState&&F.mktState(), P=F.mktPlan&&F.mktPlan(), chs=(P&&P.channels||[]).filter(function(c){ return c.status==="ok"; });
  return (S&&S.brands||[]).filter(function(b){ return b.enabled!==false; }).map(function(b){ return {key:b.key,name:b.name,color:(b.colors&&b.colors.primary)||"",chs:chs.filter(function(c){ return c.brand===b.key; })}; }); }
function brandOf(k){ return brands().find(function(b){ return b.key===k; }); }
function pfIcon(k){ return F.mktPfIcon?F.mktPfIcon(k):""; }
function pfName(k){ var P=F.mktPlan&&F.mktPlan(), x=P&&(P.platforms||[]).find(function(p){ return p.key===k; }); return x&&x.label||k; }
function ms(t){ return Date.parse(t||0)||0; }
function ago(iso){ var t=ms(iso); if(!t) return ""; var m=Math.round((Date.now()-t)/60000); if(m<1) return "gerade eben"; if(m<60) return "vor "+m+" Min."; var h=Math.round(m/60); if(h<24) return "vor "+h+" Std.";
  var d=Math.round(h/24); return d===1?"gestern":d<7?"vor "+d+" Tagen":new Date(t).toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"}); }
function when(iso){ var t=ms(iso); return t?new Date(t).toLocaleString("de-AT",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""; }
function hm(iso){ var t=ms(iso); return t?new Date(t).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}):""; }
function dayLbl(iso){ var d=new Date(ms(iso)), t=new Date(); d.setHours(0,0,0,0); t.setHours(0,0,0,0); var n=Math.round((t-d)/864e5);
  return n<=0?"Heute":n===1?"Gestern":d.toLocaleDateString("de-AT",{weekday:"short",day:"numeric",month:"short"}); }
var TONES=["info","glow","ok","warn","bad"];
function tone(s){ s=String(s||"?"); var h=0; for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return TONES[h%TONES.length]; }
function initials(n){ var p=String(n||"?").replace(/^@/,"").replace(/[._\-]+/g," ").trim().split(/\s+/).filter(Boolean); return (((p[0]||"?").charAt(0))+((p[1]||"").charAt(0))).toUpperCase(); }
function avatar(name,pf,cls){ var t=tone(name); return '<span class="mi-av '+(cls||"")+'" style="background:var(--'+t+'-soft);color:var(--'+t+')" aria-hidden="true">'+esc(initials(name))+'<span class="mi-pfb '+esc(pf)+'">'+pfIcon(pf)+'</span></span>'; }
function profUrl(pf,from){ var h=String(from&&from.handle||"").replace(/^@/,""); if(!h) return ""; h=encodeURIComponent(h);
  return pf==="instagram"?"https://www.instagram.com/"+h+"/":pf==="threads"?"https://www.threads.net/@"+h:pf==="bluesky"?"https://bsky.app/profile/"+h:""; }

/* ---------- Zustand je Eintrag ---------- */
function answered(i){ if(i.answered) return true; if(i.kind==="message"){ var t=i.thread||[]; return t.length?!!t[t.length-1].mine:!!i.mine; } var r=i.replies||[]; return r.length>0&&!!r[r.length-1].mine; }
function stOf(i){ return i.isNew?"neu":i.done?"erledigt":i.mine&&i.kind!=="message"?"eigen":answered(i)?"beantwortet":"offen"; }
var ST_LBL={neu:"Neu",offen:"Offen",beantwortet:"Beantwortet",erledigt:"Erledigt",eigen:"Von dir"};
function isOpen(s){ return s==="neu"||s==="offen"; }
function lastAt(i){ var m=ms(i.at); (i.replies||[]).concat(i.thread||[]).forEach(function(r){ m=Math.max(m,ms(r.at)); }); return m; }
function kindLbl(i){ return i.kind==="collab"?"Collab-Einladung":i.kind==="mention"?(i.sub==="tag"?"Markierung":i.sub==="quote"?"Zitat":"Erwähnung"):i.kind==="message"?(i.flags&&i.flags.storyMention?"Story-Erwähnung":i.request&&!i.accepted?"Anfrage":"Nachricht"):"Kommentar"; }
function preview(i){ if(i.kind==="message"){ var t=i.thread||[], l=t[t.length-1]; if(l) return {me:!!l.mine,t:l.text||l.label||""}; return {me:!!i.mine,t:i.text||i.label||""}; }
  if(i.kind==="mention"&&i.sub==="tag") return {me:false,t:(i.label||"hat dich markiert")+(i.text?" · "+i.text:"")};
  return {me:false,t:i.text||i.label||""}; }
/* Erwähnungen: Markierungen, @-Erwähnungen, Zitate, Collab und Unterhaltungen mit Story-Erwähnung (ohne zweiten Eintrag) */
function isMen(i){ return i.kind==="mention"||i.kind==="collab"||!!(i.flags&&i.flags.storyMention); }
/* Mini-Vorschau rechts in der Zeile (Bild aus der letzten Nachricht bzw. der Markierung) */
function thumbOf(r){ var i=r.it, list=null, mid="";
  if(i.kind==="message"){ var t=i.thread||[]; for(var k=t.length-1;k>=Math.max(0,t.length-3)&&!list;k--) if(t[k].att&&t[k].att.length){ list=t[k].att; mid=t[k].id; } } else list=i.media;
  if(!list) return ""; for(var j=0;j<list.length;j++){ var a=list[j]; if((a.state||"ok")!=="ok"||["image","gif","sticker","video","post","reel","story_mention","story_reply"].indexOf(a.t)<0) continue;
    if(a.t==="video"&&!hasPrev(r,a)) continue; var src=hasPrev(r,a)?msrc(r,mid,j,a,"prev"):msrc(r,mid,j,a,"full"); if(!src||FAILED[src]||ALT[src]) continue;
    return '<span class="mi-mt" aria-hidden="true"><img src="'+esc(src)+'" data-misrc="'+esc(src)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>'; }
  return ""; }

/* ---------- Laden: alle Marken in EINER Anfrage, sofort aus dem Zwischenspeicher des Servers ----------
   Der Server antwortet gleich mit dem letzten Stand (auch nach Neustart/Deploy) und frischt Veraltetes im Hintergrund auf („refreshing“).
   Solange etwas aufgefrischt wird, fragt das Cockpit mit wait= nach – der Server antwortet, sobald eine Marke fertig ist (spätestens nach 20 s);
   sonst alle 3 Minuten. Unverändertes kommt nur als Kennung zurück (v). „Aktualisieren“ stößt alle Marken an, ohne etwas zu blockieren. */
function liveKeys(){ return brands().filter(function(b){ return b.chs.length; }).map(function(b){ return b.key; }); }
function refreshing(keys){ return (keys||Object.keys(REFR)).some(function(k){ return REFR[k]; }); }
function pull(reload,wait){ var t0=Date.now(), g=AGEN, q=[]; PULL++;
  if(reload) q.push("reload="+encodeURIComponent(reload)); if(wait) q.push("wait="+wait); if(PV) q.push("v="+PV);
  api("/admin/api/mkt/inbox/all"+(q.length?"?"+q.join("&"):""))
    .then(function(j){ if(j&&j.ok&&(g!==AGEN||ACTS)){ REPULL=true; return; } apply(j); },function(){ apply({ok:false,error:"Keine Verbindung zum Server"}); })   // während einer Aktion: veraltet
    .then(function(){ PULL--; PLAST=Date.now(); if(REPULL&&!ACTS&&!PULL){ REPULL=false; pull(""); return; } paintSoon(); next(Date.now()-t0); }); }
function apply(j){
  PERR=!j||!j.ok;
  if(PERR){ var er=(j&&j.error)||"Fehler beim Laden"; REFR={}; Object.keys(LOADING).forEach(function(k){ if(LOADING[k]&&!BOX[k]) BOX[k]={channels:[],error:er,_t:Date.now()}; LOADING[k]=false; });
    liveKeys().forEach(function(k){ if(!BOX[k]) BOX[k]={channels:[],error:er,_t:Date.now()}; }); return; }
  if(j.same) return;
  PV=j.v||""; SRV={keys:Object.keys(j.brands||{}),at:j.at||""};
  SRV.keys.forEach(function(k){ var d=j.brands[k]; REFR[k]=!!d.refreshing;
    if(!d.at){ LOADING[k]=!!d.refreshing; if(!d.refreshing) BOX[k]={channels:[],error:d.error||"Noch nichts geladen",_t:Date.now()}; else if(BOX[k]&&!BOX[k].at) delete BOX[k]; return; }   // noch nie geladen: erst nach der ersten Abfrage
    LOADING[k]=false; BOX[k]=Object.assign(d,{_t:Date.now()}); });
  Object.keys(REFR).forEach(function(k){ if(SRV.keys.indexOf(k)<0){ REFR[k]=false; LOADING[k]=false; } });
  if(j.counts){ CNT=j.counts; CNTREQ=true; tabPaint(); } }
/* Marken mit Kanälen ohne Posteingang (TikTok, LinkedIn, Pinterest) – der Server kennt für sie nichts: leer statt „lädt“ */
function fillEmpty(){ if(!SRV.keys) return; liveKeys().forEach(function(k){ if(!BOX[k]&&SRV.keys.indexOf(k)<0) BOX[k]={at:SRV.at,channels:[],_t:Date.now()}; }); }
/* nächste Nachfrage: nur solange aufgefrischt wird und der Posteingang offen ist (kam die Antwort sofort, kurz warten) */
function next(dur){ clearTimeout(PTIMER); PTIMER=0; if(PULL||!refreshing()||!document.getElementById("miRoot")) return;
  PTIMER=setTimeout(function(){ PTIMER=0; if(!PULL) pull("",20000); },dur<1000?2000:0); }
/* beim Öffnen: sofort zeichnen (letzter Stand im Speicher) und den aktuellen Stand holen, wenn er fehlt, älter als 3 Min. ist oder gerade aufgefrischt wird */
function ensure(){ if(PULL||PTIMER) return; if(!PLAST||Date.now()-PLAST>(PERR?30e3:3*60e3)||refreshing()) pull(""); }
function reloadAll(k){ (k?[k]:liveKeys()).forEach(function(x){ REFR[x]=true; }); pull(k||"1"); paint(); }
function loadCounts(){ CNTREQ=true; api("/admin/api/mkt/inbox/counts").then(function(j){ if(j&&j.ok){ CNT=j.counts; tabPaint(); paintSoon(); } }); }
/* Zähler am Reiter „Posteingang“ (zmarketing.js) ohne Neuaufbau nachziehen */
function tabPaint(){ if(F.current==="mkt"&&F.mktTabPaint) F.mktTabPaint("posteingang"); }
function unreadTotal(){ var n=0; if(CNT) Object.keys(CNT).forEach(function(k){ n+=+CNT[k]||0; }); return n; }
function anyLoading(){ return Object.keys(LOADING).some(function(k){ return LOADING[k]; }); }
function busyNow(keys){ return anyLoading()||refreshing(keys); }

/* ---------- Daten für die Ansicht ---------- */
function scopeKeys(){ return UI.mkInBrand==="alle"?liveKeys():[UI.mkInBrand]; }
function allRows(keys){ var out=[]; keys.forEach(function(k){ var d=BOX[k], b=brandOf(k); if(!d||!d.channels||!b) return;
  d.channels.forEach(function(c){ c.items.forEach(function(i){ if(i.kind==="like") return; var s=stOf(i); out.push({k:k,b:b,c:c,it:i,uid:k+"|"+c.platform+"|"+i.id,st:s,open:isOpen(s),last:lastAt(i)}); }); }); });
  return out; }
function hay(r){ var i=r.it, p=[i.from&&i.from.name,i.from&&i.from.handle,i.text,i.post&&i.post.text,r.b.name,r.c.label];
  (i.replies||[]).concat(i.thread||[]).forEach(function(m){ p.push(m.text,m.label); (m.att||[]).forEach(function(a){ p.push(a.title,a.owner,a.name); }); });
  (i.media||[]).forEach(function(a){ p.push(a.title,a.owner); }); p.push(i.label,kindLbl(i)); return p.filter(Boolean).join(" \n ").toLowerCase(); }
function searched(rs){ var q=String(UI.mkInQ||"").trim().toLowerCase(); if(!q) return rs; var ws=q.split(/\s+/); return rs.filter(function(r){ var h=hay(r); return ws.every(function(w){ return h.indexOf(w)>-1; }); }); }
function byKind(rs,k){ return rs.filter(function(r){ var i=r.it; return k==="alle"?true:k==="nachrichten"?i.kind==="message":k==="kommentare"?i.kind==="comment":k==="erwaehnungen"?isMen(i):k==="anfragen"?!!i.request&&!i.accepted:r.open; }); }
function sorted(rs){ var op=UI.mkInSort==="offen"; return rs.slice().sort(function(a,b){ return (op?(b.open?1:0)-(a.open?1:0):0)||b.last-a.last; }); }
function loaded(keys){ return keys.some(function(k){ return BOX[k]&&BOX[k]._t; }); }
/* Der geöffnete Eintrag bleibt in der Liste stehen, auch wenn er nach dem Antworten nicht mehr zum Reiter passt (wie im Mailprogramm) */
function view(){ var rs=searched(allRows(scopeKeys())), inK=byKind(rs,UI.mkInKind), sel=UI.mkInSel&&inK.every(function(r){ return r.uid!==UI.mkInSel; })&&rs.find(function(r){ return r.uid===UI.mkInSel; });
  return {all:rs,list:sorted(sel?inK.concat([sel]):inK),cnt:{offen:byKind(rs,"offen").length,kommentare:byKind(rs,"kommentare").length,nachrichten:byKind(rs,"nachrichten").length,erwaehnungen:byKind(rs,"erwaehnungen").length,anfragen:byKind(rs,"anfragen").length,alle:rs.length}}; }
function openCount(k){ var d=BOX[k]; if(!d||!d.channels||!d._t) return CNT&&CNT[k]||0; return allRows([k]).filter(function(r){ return r.open; }).length; }
function likesInfo(keys){ var wk=Date.now()-7*864e5, o={likes:0,com:0,fol:0,posts:[],notes:[],errs:[]};
  keys.forEach(function(k){ var d=BOX[k], b=brandOf(k); if(!d||!b) return; if(d.error) o.errs.push({k:k,b:b,t:d.error});
    (d.channels||[]).forEach(function(c){
      (c.posts||[]).forEach(function(p){ o.posts.push(Object.assign({pf:c.platform,pfLabel:c.label,b:b},p)); if(ms(p.at)>wk){ if(typeof p.likes==="number") o.likes+=p.likes; if(typeof p.comments==="number") o.com+=p.comments; } });
      c.items.forEach(function(i){ if(i.kind!=="like"||ms(i.at)<wk) return; if(i.sub==="follow") o.fol++; else if(i.sub!=="repost") o.likes++; });
      if(c.error) o.errs.push({k:k,b:b,t:c.label+": "+c.error}); (c.notes||[]).forEach(function(n){ o.notes.push(b.name+" · "+n); }); }); });
  o.posts.sort(function(a,b){ return ms(b.at)-ms(a.at); }); return o; }
function stampIso(keys){ var t=0; keys.forEach(function(k){ var d=BOX[k]; if(d&&d.at){ var x=ms(d.at); if(!t||x<t) t=x; } }); return t?new Date(t).toISOString():""; }
function stampTxt(keys){ var s=stampIso(keys); if(!s) return busyNow(keys)?"Lädt …":"Aktualisieren"; return '<span class="mi-sw">Stand </span>'+ago(s); }
function rowOf(uid){ var o=uid&&itemOf(uid), b=o&&brandOf(o.key); if(!o||!b) return null; var s=stOf(o.it); return {k:o.key,b:b,c:o.c,it:o.it,uid:uid,st:s,open:isOpen(s),last:lastAt(o.it)}; }

/* ---------- Bausteine ---------- */
function brandMenu(bs){ var all=UI.mkInBrand==="alle", tot=0; bs.forEach(function(b){ if(b.chs.length) tot+=openCount(b.key); });
  var it=function(key,dot,name,sub,n,off){ return '<button type="button" class="mi-mi'+(off?" off":"")+'" role="option" data-act="miopen:'+esc(key)+'" aria-current="'+(UI.mkInBrand===key)+'">'+dot+'<span class="mi-bwho"><b>'+esc(name)+'</b><small>'+esc(sub)+'</small></span>'+(n?'<span class="mi-n" title="'+n+' offen">'+n+'</span>':'<span></span>')+'</button>'; };
  return '<div class="mi-menu" role="listbox" aria-label="Marke wählen">'+it("alle",'<i class="mi-dot all"></i>',"Alle Marken",liveKeys().length+" mit verbundenen Kanälen",tot,false)+'<div class="mi-msep"></div>'+
    bs.map(function(b){ var n=b.chs.length; return it(b.key,'<i class="mi-dot" style="background:'+esc(b.color||"var(--ink-3)")+'"></i>',b.name,n?b.chs.map(function(c){ return pfName(c.platform); }).join(", "):"nicht verbunden",n?openCount(b.key):0,!n); }).join("")+'</div>'; }
function topHtml(bs,v,solo){ var b=UI.mkInBrand==="alle"?null:brandOf(UI.mkInBrand), n=b?openCount(b.key):liveKeys().reduce(function(a,k){ return a+openCount(k); },0);
  var sel='<div class="mi-bw"><button type="button" class="mi-bsel" data-act="mibmenu" aria-haspopup="listbox" aria-expanded="'+MENU+'" title="Marke wählen">'+(b?'<i class="mi-dot" style="background:'+esc(b.color||"var(--ink-3)")+'"></i>':'<i class="mi-dot all"></i>')+'<span class="mi-bt">'+esc(b?b.name:"Alle Marken")+'</span>'+(n?'<span class="mi-n" title="'+n+' offen">'+n+'</span>':'')+F.svg("chevD")+'</button>'+(MENU?brandMenu(bs):'')+'</div>';
  var tabs=[["offen","Offen"],["kommentare","Kommentare"],["nachrichten","Nachrichten"],["erwaehnungen","Erwähnungen"],["anfragen","Anfragen"],["alle","Alle"]].filter(function(t){ return (t[0]!=="erwaehnungen"&&t[0]!=="anfragen")||v.cnt[t[0]]||UI.mkInKind===t[0]; });   // Erwähnungen/Anfragen nur, wenn es welche gibt
  var seg='<div class="mi-seg" role="group" aria-label="Filter">'+tabs.map(function(t){ var c=v.cnt[t[0]]||0; return '<button type="button" data-act="mikind:'+t[0]+'" aria-pressed="'+(UI.mkInKind===t[0])+'">'+t[1]+(v.ld?' <span class="mi-c'+(t[0]==="offen"&&c?" hot":"")+'">'+c+'</span>':'')+'</button>'; }).join("")+'</div>';
  var q='<label class="mi-q'+(UI.mkInQ?" has":"")+'">'+F.svg("search")+'<input type="search" data-miq data-keepfocus="miq" data-mifocus="q" value="'+esc(UI.mkInQ)+'" placeholder="Suchen …" title="Name, Text oder Beitrag suchen" aria-label="Posteingang durchsuchen" autocomplete="off" enterkeyhint="search">'+(UI.mkInQ?'<button type="button" class="mi-qx" data-act="miqclear" aria-label="Suche löschen">'+F.svg("close")+'</button>':'')+'</label>';
  return '<div class="mi-top">'+sel+(solo?'':seg+q)+'</div>'; }
function metaHtml(keys,li,v){ var unread=v.all.filter(function(r){ return r.it.isNew; }).length;
  var lk='<button type="button" class="mi-lnk likes" data-act="mikind:likes" title="Likes auf Beiträgen der letzten 7 Tage (Instagram, Facebook) und neue Likes auf Bluesky – zeigt deine letzten Beiträge">'+F.svg("mheart")+(li.likes?li.likes.toLocaleString("de-AT")+" Likes diese Woche":"Noch keine Likes diese Woche")+(li.fol?" · "+li.fol+(li.fol===1?" neuer Follower":" neue Follower"):"")+'</button>';
  if(!v.ld) lk='';
  var sort='<button type="button" class="mi-lnk" data-act="misort" title="Sortierung umschalten: '+(UI.mkInSort==="offen"?"Neueste zuerst":"Offene zuerst")+'">'+F.svg("msort")+(UI.mkInSort==="offen"?"Offene zuerst":"Neueste zuerst")+'</button>';
  var ra=unread?'<button type="button" class="mi-lnk" data-act="mireadall" title="Alle '+unread+' neuen Einträge als gelesen markieren">'+F.svg("mailOpen")+'<span class="mi-rl">Alle gelesen</span></button>':'';
  var busy=busyNow(keys), tt=busy?"Wird im Hintergrund aktualisiert – du kannst schon lesen und antworten":"Jetzt aktualisieren – holt Kommentare und Nachrichten frisch von den Plattformen";
  return '<div class="mi-meta">'+lk+'<span class="mi-sp"></span>'+sort+ra+'<button type="button" class="mi-lnk mi-rf'+(busy?" busy":"")+'" data-act="mireload"'+(busy?' disabled':'')+' title="'+tt+'" aria-label="'+(busy?"Wird aktualisiert":"Aktualisieren")+'">'+F.svg("refresh")+'<span class="mi-stamp" id="miStamp">'+stampTxt(keys)+'</span></button></div>'; }
function rowHtml(r){ var i=r.it, nm=(i.from&&i.from.name)||"Unbekannt", pv=preview(i), un=i.isNew;
  return '<div class="mi-row'+(un?" unread":"")+(r.uid===UI.mkInSel?" sel":"")+'" role="button" tabindex="0" data-act="misel:'+esc(r.uid)+'" data-miit="'+esc(r.uid)+'" aria-current="'+(r.uid===UI.mkInSel)+'">'+avatar(nm,r.c.platform)+
    '<span class="mi-rm"><span class="mi-l1"><span class="mi-who" title="'+esc(nm+(i.from&&i.from.handle&&i.from.handle.replace(/^@/,"")!==nm?" ("+i.from.handle+")":""))+'">'+esc(nm)+'</span><span class="mi-when" title="'+esc(when(new Date(r.last).toISOString()))+'">'+ago(new Date(r.last).toISOString())+'</span></span>'+
    (function(){ var pre='<span class="mi-pre" title="'+esc(pv.t)+'">'+(pv.me?'<i>Du: </i>':'')+esc(String(pv.t||"").replace(/\s+/g," "))+'</span>', th=thumbOf(r); return th?'<span class="mi-l2">'+pre+th+'</span>':pre; })()+
    '<span class="mi-l3"><i class="mi-dot" style="background:'+esc(r.b.color||"var(--ink-3)")+'"></i><span class="mi-bn" title="'+esc(r.b.name)+'">'+esc(r.b.name)+'</span><span>·</span><span class="mi-kd'+(i.kind!=="message"&&i.kind!=="comment"||i.flags&&i.flags.storyMention||i.request&&!i.accepted?" hl":"")+'" title="'+esc(r.c.label)+'">'+kindLbl(i)+'</span><span class="mi-sp"></span>'+smChip(i)+'<span class="mi-st '+r.st+'">'+ST_LBL[r.st]+'</span></span></span></div>'; }
/* Story-Erwähnung in der Zeile: Restzeit zum Teilen bzw. „abgelaufen“ */
function smChip(i){ var f=i.flags; if(!f||!f.storyMention||i.shared) return ""; var h=f.smState==="expired"?0:hrsLeft(f.smExp);
  return h?'<span class="mi-st cd'+(h<3?" low":"")+'" title="So lange kannst du die Story noch in deiner Story teilen">noch '+h+' h</span>':'<span class="mi-st ex" title="Story nach 24 h abgelaufen oder gelöscht">abgelaufen</span>'; }
function skel(n){ var s=""; for(var i=0;i<n;i++) s+='<div class="mi-sk" aria-hidden="true"><i class="mi-ska"></i><span class="mi-skb"><i style="width:'+(45+(i*17)%35)+'%"></i><i style="width:'+(70+(i*11)%25)+'%"></i><i style="width:30%"></i></span></div>'; return s; }
function empty(icon,t,d,acts){ return '<div class="mi-empty"><span class="mi-ei">'+F.svg(icon)+'</span><b>'+t+'</b>'+(d?'<span>'+d+'</span>':'')+(acts?'<span class="mi-ea">'+acts+'</span>':'')+'</div>'; }
function bansHtml(li){ return li.errs.length?'<div class="mi-bans">'+li.errs.map(function(e){ return '<div class="mi-ban bad" role="alert">'+F.svg("alertCircle")+'<span title="'+esc(e.t)+'"><b>'+esc(e.b.name)+':</b> '+esc(e.t)+'</span><button type="button" class="btn sm" data-act="mireload:'+esc(e.k)+'">'+F.svg("refresh")+' Erneut</button></div>'; }).join("")+'</div>':''; }
function listHtml(keys,v,li){
  var loadingKeys=keys.filter(function(k){ return LOADING[k]; }), noneYet=keys.every(function(k){ return !BOX[k]; });
  var info=loadingKeys.length&&!noneYet?'<div class="mi-loadl"><span class="mi-spin" aria-hidden="true"></span>Lade '+(keys.length>1?loadingKeys.length+" von "+keys.length+" Marken":"neue Einträge")+' …</div>':'';
  var body;
  if(noneYet) body=skel(7);
  else if(!v.list.length){ var q=String(UI.mkInQ||"").trim();
    body=q?empty("search","Nichts gefunden","Keine Einträge zu „"+esc(q)+"“"+(UI.mkInKind!=="alle"?" unter „"+esc(kindName(UI.mkInKind))+"“":"")+".",'<button type="button" class="btn sm" data-act="miqclear">Suche löschen</button>'+(UI.mkInKind!=="alle"?'<button type="button" class="btn sm" data-act="mikind:alle">In allen suchen</button>':''))
      :UI.mkInKind==="offen"?empty("checkCircle","Alles beantwortet","Keine offenen Kommentare oder Nachrichten"+(UI.mkInBrand==="alle"?"":" bei "+esc((brandOf(UI.mkInBrand)||{}).name||""))+".",v.cnt.alle?'<button type="button" class="btn sm" data-act="mikind:alle">Alle anzeigen</button>':'')
      :empty(UI.mkInKind==="nachrichten"?"message":"minbox",UI.mkInKind==="nachrichten"?"Keine Nachrichten":UI.mkInKind==="kommentare"?"Keine Kommentare":UI.mkInKind==="erwaehnungen"?"Keine Erwähnungen":UI.mkInKind==="anfragen"?"Keine Anfragen":"Noch nichts da",UI.mkInKind==="erwaehnungen"?"Story-Erwähnungen, Markierungen und @-Erwähnungen erscheinen hier.":"Sobald jemand kommentiert oder schreibt, erscheint es hier.","");
  } else body=v.list.map(rowHtml).join("");
  return '<section class="mi-lp" aria-label="Einträge">'+info+'<div class="mi-scroll" id="miList">'+body+'</div></section>'; }
function kindName(k){ return {offen:"Offen",kommentare:"Kommentare",nachrichten:"Nachrichten",erwaehnungen:"Erwähnungen",anfragen:"Anfragen",alle:"Alle"}[k]||k; }
/* Links und E-Mail-Adressen im Text anklickbar (und nie mit Trennstrich umbrochen) */
function rich(t){ t=String(t||""); var re=/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]|[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,})/gi, out="", last=0, m;
  while((m=re.exec(t))){ var s=m[0], href=/^https?:/i.test(s)?s:"mailto:"+s; out+=esc(t.slice(last,m.index))+'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(s)+'</a>'; last=m.index+s.length; }
  return out+esc(t.slice(last)); }
/* ---------- Anhänge ----------
   Meta-Medien (Instagram, Facebook, Threads) kommen über den Server (/inbox/media – nur Kennungen, die Adresse kennt nur der Server), Bluesky-Medien direkt.
   Abgelaufen, gelöscht oder nur in der App sichtbar → Platzhalter mit Grund und Link in die App, nie nur „Anhang“. */
function enc(s){ return encodeURIComponent(String(s||"")); }
function msrc(r,mid,idx,a,v){
  if(r.c.platform==="bluesky"){ var u=v==="prev"?(a.prev||a.url):(a.url||a.prev); return /^https:\/\//.test(u||"")?u:""; }
  if(!(a.f||a.p)) return "";
  return "/admin/api/mkt/inbox/media?brand="+enc(r.k)+"&pf="+enc(r.c.platform)+"&id="+enc(r.it.id)+(mid?"&m="+enc(mid):"")+"&a="+idx+"&v="+v; }
function hasPrev(r,a){ return r.c.platform==="bluesky"?!!a.prev:!!a.p; }
function fmtSize(n){ n=+n||0; return n>=1048576?(n/1048576).toFixed(1).replace(".",",")+" MB":n>=1024?Math.round(n/1024)+" KB":""; }
function hrsLeft(iso){ var t=ms(iso)-Date.now(); return t>0?Math.max(1,Math.round(t/3600e3)):0; }
function cdChip(exp){ var h=hrsLeft(exp); return h?'<span class="mi-cd'+(h<3?" low":"")+'" title="Story läuft ab: '+esc(when(exp))+'">noch '+h+' h</span>':''; }
function appLink(i){ var L=i&&i.links||{}; return /^https:\/\//.test(L.app||"")?L.app:/^https:\/\//.test(L.web||"")?L.web:""; }
function extA(href,label,cls){ return href?'<a class="mi-xl'+(cls?" "+cls:"")+'" href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+F.svg("miext")+esc(label)+'</a>':''; }
function ratio(a,def){ var w=+a.w||0,h=+a.h||0; return w&&h?Math.max(.45,Math.min(2.2,w/h)).toFixed(3):def; }
function dtShort(t){ return t?new Date(t).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""; }
/* Bild oder Video: ist der Typ unklar (Story, geteilter Beitrag), erst als Bild, scheitert das, als Video */
function media(src,a,o){ o=o||{}; if(!src) return '<span class="mi-ph2">'+F.svg("miimg")+'</span>';
  var vid=o.video||ALT[src]||/^video\//.test(a.mime||"");
  return vid?'<video src="'+esc(src)+'" data-misrc="'+esc(src)+'" playsinline preload="metadata"'+(o.controls!==false?' controls':' muted')+(o.poster?' poster="'+esc(o.poster)+'"':'')+'></video>'
    :'<img src="'+esc(src)+'" data-misrc="'+esc(src)+'"'+(o.alt&&!/^image\//.test(a.mime||"")?' data-mialt="1"':'')+' alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">'; }
function gonePh(a,r){ var ap=appLink(r.it);
  return '<div class="mi-at mi-gone">'+F.svg("miclock")+'<b>Nicht mehr verfügbar</b><span>Der Link der Plattform ist abgelaufen oder der Inhalt wurde gelöscht.</span>'+extA(ap,"In der App ansehen")+'</div>'; }
function storyHtml(a,r,mid,idx,mine){ var i=r.it, men=a.t==="story_mention", h=(i.from&&(i.from.handle||i.from.name))||"Jemand", full=msrc(r,mid,idx,a,"full"),
  dead=a.state==="expired"||a.state==="gone"||FAILED[full], at=ms(a.exp)?ms(a.exp)-864e5:0, pu=profUrl(r.c.platform,i.from)||appLink(i), body;
  if(dead) body='<div class="mi-stp">'+F.svg("miclock")+'<b>Story abgelaufen (24 h) oder gelöscht</b>'+(at?'<small>'+(men?"erwähnt":"geantwortet")+' am '+esc(dtShort(at))+'</small>':'')+(pu?extA(pu,"Profil von "+h+" öffnen"):'')+'</div>';
  else if(!full||a.state==="unknown") body='<div class="mi-stp">'+F.svg("mieye")+'<b>Vorschau nur in der App</b><small>Instagram liefert für diese Story kein Bild.</small>'+extA(appLink(i),"In Instagram öffnen")+'</div>';
  else body=media(full,a,{alt:1,controls:false})+cdChip(a.exp);
  var acts=men&&!dead&&!mine?'<div class="mi-sta"><button type="button" class="btn sm primary" data-act="mistory:'+esc(r.uid)+'">'+F.svg("mistory")+' In meiner Story teilen</button>'+(i.can&&i.can.reply?'<button type="button" class="btn sm" data-act="mifocus:'+esc(r.uid)+'">Antworten</button>':'')+'</div>':'';
  return '<div class="mi-at mi-story'+(men?"":" rep")+'"><div class="mi-sth">'+(men?(mine?'📣 Du hast '+esc(h)+' in deiner Story erwähnt':'📣 <b>'+esc(h)+'</b> hat dich in der Story erwähnt'):'↩︎ Antwort auf '+(mine?"eine Story":"deine Story"))+'</div><div class="mi-stm">'+body+'</div>'+acts+'</div>'; }
function attHtml(a,r,mid,idx,mine){ var t=a.t, st=a.state||"ok", ttl=a.title||"", own=a.owner||"", link=/^https:\/\//.test(a.link||"")?a.link:"", ap=appLink(r.it), lbl=r.c.label;
  var full=msrc(r,mid,idx,a,"full"), prev=hasPrev(r,a)?msrc(r,mid,idx,a,"prev"):"";
  if(t==="story_mention"||t==="story_reply") return storyHtml(a,r,mid,idx,mine);
  if(t==="ephemeral") return '<div class="mi-at mi-note">'+F.svg("mieye")+'<span>Einmal-Foto/-Video – nur in der '+esc(lbl)+'-App sichtbar.</span>'+extA(ap,"In der App öffnen")+'</div>';
  if(t==="unsupported") return '<div class="mi-at mi-note">'+F.svg("alertCircle")+'<span>'+(a.old?"Älterer Anhang – Meta liefert den Inhalt nur für die 20 neuesten Nachrichten.":"Inhalt nur in der App sichtbar (z. B. Umfrage, Collab-Einladung, Anruf oder Sticker).")+'</span>'+extA(ap,"In der App öffnen")+'</div>';
  if(t==="quote"){ var qi=prev&&!FAILED[prev]?'<img src="'+esc(prev)+'" data-misrc="'+esc(prev)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'';
    return (link?'<a class="mi-at mi-quote'+(st==="gone"?" gone":"")+'" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">':'<div class="mi-at mi-quote'+(st==="gone"?" gone":"")+'">')+(own?'<small>Zitat von '+esc(own)+'</small>':'')+'<span>'+esc(ttl||"Zitierter Beitrag")+'</span>'+qi+(link?'</a>':'</div>'); }
  if(t==="link"){ var th=prev&&!FAILED[prev]?'<img src="'+esc(prev)+'" data-misrc="'+esc(prev)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'', host=""; try{ host=new URL(link).hostname.replace(/^www\./,""); }catch(e){}
    return link?'<a class="mi-at mi-card mi-link'+(th?"":" nt")+'" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+th+'<span class="mi-cb"><b>'+esc(ttl||host)+'</b><small>'+esc(host)+'</small></span></a>':''; }
  if(st==="expired"||st==="gone"||FAILED[full]||(prev&&FAILED[prev]&&!full)) return gonePh(a,r);
  if(t==="image"||t==="gif"){ var src=t==="gif"?full:(prev||full); if(!src) return gonePh(a,r);
    return '<button type="button" class="mi-at mi-img" data-act="mizoom" data-full="'+esc(full||src)+'" style="aspect-ratio:'+ratio(a,"1")+'" aria-label="Bild vergrößern">'+media(src,a)+(t==="gif"?'<span class="mi-gif">GIF</span>':'')+'</button>'; }
  if(t==="sticker") return full?'<span class="mi-at mi-stk">'+media(full,a)+'</span>':'';
  if(t==="video"){
    if(r.c.platform==="bluesky"&&!(a.hls&&document.createElement("video").canPlayType("application/vnd.apple.mpegurl"))) return '<div class="mi-at mi-card">'+'<div class="mi-cm" style="aspect-ratio:'+ratio(a,"9/16")+'">'+media(prev,a)+'<span class="mi-pl">'+F.svg("miplay")+'</span></div><div class="mi-cb">'+extA(appLink(r.it),"Video in Bluesky ansehen")+'</div></div>';
    var vs=r.c.platform==="bluesky"?a.hls:full; if(!vs) return gonePh(a,r);
    return '<video class="mi-at mi-vid" src="'+esc(vs)+'" data-misrc="'+esc(vs)+'" controls playsinline preload="metadata"'+(prev?' poster="'+esc(prev)+'"':'')+(ratio(a,"")?' style="aspect-ratio:'+ratio(a,"")+'"':'')+'></video>'; }
  if(t==="audio") return full?'<div class="mi-at mi-aud"><audio src="'+esc(full)+'" data-misrc="'+esc(full)+'" controls preload="none"></audio></div>':gonePh(a,r);
  if(t==="file") return '<div class="mi-at mi-file">'+F.svg("mifile")+'<span><b title="'+esc(a.name||"Datei")+'">'+esc(a.name||"Datei")+'</b><small>'+esc([fmtSize(a.size),(a.mime||"").split("/").pop().toUpperCase()].filter(Boolean).join(" · ")||"Datei")+'</small></span>'+(full?'<a class="mi-xl" href="'+esc(full)+'" target="_blank" rel="noopener">Öffnen</a>':'')+'</div>';
  if(t==="post"||t==="reel"||t==="template"){ var reel=t==="reel", ms0=prev||full;
    return '<div class="mi-at mi-card'+(reel?" reel":"")+'"><div class="mi-cm" style="aspect-ratio:'+(reel?"9/16":ratio(a,"4/5"))+'">'+media(ms0,a,{alt:1,controls:false,poster:full&&prev?prev:""})+(reel?'<span class="mi-pl">'+F.svg("miplay")+'</span>':'')+'</div>'+
      '<div class="mi-cb"><small>'+(t==="template"?"Karte":reel?"Geteiltes Reel":r.it.kind==="mention"?"Beitrag":"Geteilter Beitrag")+(own?" von "+esc(own):"")+'</small>'+(ttl?'<span class="mi-cap">'+esc(ttl)+'</span>':'')+extA(link||ap,link?"Original öffnen":"In der App öffnen")+'</div></div>'; }
  return ''; }
function attsHtml(list,r,mid,mine){ return list&&list.length?'<div class="mi-atts">'+list.map(function(a,k){ return attHtml(a,r,mid,k,mine); }).join("")+'</div>':''; }
/* Blase: Text (oder Kurztext, wenn nur ein Anhang ohne Darstellung da ist), Anhänge, zitierte Nachricht, Reaktionen; Antwort auf eine Story zeigt die Story über dem Text */
function bubble(m,cls,extra,noName,ax){ var nm=m.mine?"":(m.from&&m.from.name)||"", list=ax&&ax.list||[], txt=m.text||"", ah=ax?attsHtml(list,ax.r,ax.mid,!!m.mine):"", lbl=!txt&&!ah?(m.label||""):"";
  var top=list.some(function(a){ return a.t==="story_reply"; }), body=txt||lbl?'<div class="mi-bb">'+rich(txt||lbl)+'</div>':'';
  var rt=m.replyTo&&m.replyTo.text?'<span class="mi-rto" title="'+esc(m.replyTo.text)+'">↩︎ '+esc(m.replyTo.text)+'</span>':'', re=m.react&&m.react.length?'<span class="mi-reacts" title="Reaktionen">'+m.react.map(function(x){ return '<span>'+esc(x.e)+'</span>'; }).join("")+'</span>':'';
  return '<div class="mi-b'+(m.mine?" me":"")+(cls?" "+cls:"")+'">'+(nm&&!noName?'<span class="mi-bwho">'+esc(nm)+'</span>':'')+rt+(top?ah+body:body+ah)+'<span class="mi-bmeta"><span title="'+esc(when(m.at))+'">'+(cls==="lead"||cls==="rep"?ago(m.at):hm(m.at))+'</span>'+(extra||"")+re+'</span></div>'; }
/* Kontextleiste unter dem Kopf: Nachrichtenanfrage annehmen, markierten Beitrag teilen, Bluesky reposten/zitieren, Collab, Ergebnisse */
function xbarHtml(r){ var i=r.it, uid=esc(r.uid), out="", chips=[], h=(i.from&&(i.from.handle||i.from.name))||"", L=i.links||{};
  if(i.shared) chips.push("✓ "+(i.shared.via==="reupload"?"Als Story hochgeladen":"In deiner Story geteilt")+" "+hm(i.shared.at));
  if(i.reposted) chips.push("✓ Repostet "+hm(i.reposted.at));
  if(i.quoted) chips.push("✓ Zitiert "+hm(i.quoted.at));
  if(i.accepted) chips.push("✓ Anfrage angenommen");
  var req=i.kind==="message"&&i.can&&i.can.reply&&!i.accepted&&(i.request||(r.c.platform==="instagram"&&!(i.thread||[]).some(function(m){ return m.mine; })));
  if(req) out+='<div class="mi-xb req">'+F.svg("inbox")+'<span>'+(i.request?'<b>Nachrichtenanfrage'+(i.filtered?" (gefiltert)":"")+'</b> – mit deiner Antwort nimmst du sie an. Ablehnen oder blockieren geht nur in der App.':'<b>Neue Unterhaltung</b> – liegt sie in Instagram unter „Anfragen“, nimmst du sie mit deiner Antwort an.')+'</span>'+
    '<span class="mi-xa"><button type="button" class="btn sm primary" data-act="mifocus:'+uid+'">'+F.svg("reply")+' Annehmen &amp; antworten</button><button type="button" class="btn sm" data-act="mihide:'+uid+'">Ignorieren</button>'+extA(appLink(i),"In der App öffnen")+'</span></div>';
  if(i.kind==="mention"&&i.sub==="tag"&&r.c.platform==="instagram") out+='<div class="mi-xb">'+F.svg("mitag")+'<span><b>'+esc(h||"Jemand")+'</b> hat dich in einem Beitrag markiert.</span><span class="mi-xa">'+
    (appLink(i)?'<button type="button" class="btn sm primary" data-act="mistory:'+uid+'">'+F.svg("mistory")+' In meiner Story teilen</button>':'')+(i.can&&i.can.story==="app+reupload"?'<button type="button" class="btn sm" data-act="mistoryup:'+uid+'">'+F.svg("miup")+' Als eigene Story hochladen …</button>':'')+'</span></div>';
  if(i.kind==="mention"&&i.sub==="tag"&&r.c.platform==="facebook") out+='<div class="mi-xb">'+F.svg("mitag")+'<span><b>'+esc(h||"Jemand")+'</b> hat deine Seite markiert – deine Antwort erscheint als Kommentar unter dem Beitrag.</span><span class="mi-xa">'+extA(L.web,"Beitrag öffnen")+'</span></div>';
  if(i.can&&(i.can.repost||i.can.quote)) out+='<div class="mi-xb">'+F.svg("mirepost")+'<span>'+(i.sub==="quote"?"Hat deinen Beitrag zitiert.":"Hat dich erwähnt.")+' Teile es mit deinen Followern.</span><span class="mi-xa">'+
    (i.can.repost?'<button type="button" class="btn sm" data-act="mirepost:'+uid+'"'+(i.reposted||BUSY[i.id]==="repost"?' disabled':'')+'>'+F.svg("mirepost")+(i.reposted?" Repostet":BUSY[i.id]==="repost"?" …":" Reposten")+'</button>':'')+
    (i.can.quote?'<button type="button" class="btn sm" data-act="miquote:'+uid+'">'+F.svg("miquote")+' Zitieren …</button>':'')+'</span></div>';
  if(i.kind==="collab") out+='<div class="mi-xb info">'+F.svg("alertCircle")+'<span><b>Collab-Einladung</b> – annehmen oder ablehnen geht über die Schnittstelle nur mit Facebook-Login. Bis dahin in Instagram unter „Benachrichtigungen“.</span><span class="mi-xa">'+extA(appLink(i)||"https://www.instagram.com/","In Instagram öffnen")+'</span></div>';
  if(chips.length) out+='<div class="mi-xb"><span class="mi-xa">'+chips.map(function(c){ return '<span class="mi-chip">'+esc(c)+'</span>'; }).join("")+'</span></div>';
  return out; }
function threadHtml(r){
  var i=r.it, uid=esc(r.uid), nm=(i.from&&i.from.name)||"Unbekannt", hd=i.from&&i.from.handle||"", pu=profUrl(r.c.platform,i.from), busy=BUSY[i.id], s=r.st;
  var canDel=i.kind==="comment"&&["instagram","facebook","threads","youtube"].indexOf(r.c.platform)>-1, delT=r.c.platform==="threads"?"Auf Threads ausblenden":r.c.platform==="youtube"?"Auf YouTube ablehnen":"Auf "+r.c.label+" löschen";
  var head='<div class="mi-th"><button type="button" class="mi-ib mi-back" data-act="miback" aria-label="Zurück zur Liste">'+F.svg("chevL")+'</button>'+avatar(nm,r.c.platform,"lg")+
    '<div class="mi-tw"><b title="'+esc(nm)+'">'+esc(nm)+'</b><span>'+(hd&&hd.replace(/^@/,"")!==nm?'<span class="mi-bn" title="'+esc(hd)+'">'+esc(hd)+'</span><span>·</span>':'')+'<span>'+esc(r.c.label)+'</span><span>·</span><i class="mi-dot" style="background:'+esc(r.b.color||"var(--ink-3)")+'"></i><span class="mi-bn" title="'+esc(r.b.name)+'">'+esc(r.b.name)+'</span></span></div>'+
    '<div class="mi-ta">'+(pu?'<a class="mi-ib" href="'+esc(pu)+'" target="_blank" rel="noopener" title="Profil von '+esc(nm)+' auf '+esc(r.c.label)+' öffnen">'+F.svg("user")+'<span class="mi-rl">Profil</span></a>':'')+
    '<button type="button" class="mi-ib" data-act="mihide:'+uid+'" title="Ausblenden – nur im Cockpit, kommt wieder, wenn etwas Neues dazukommt" aria-label="Ausblenden">'+F.svg("eyeOff")+'<span class="mi-rl">Ausblenden</span></button>'+
    (canDel?'<button type="button" class="mi-ib dg" data-act="midel:'+uid+'" title="'+esc(delT)+'" aria-label="'+esc(delT)+'">'+F.svg("trash")+'</button>':'')+
    (s==="erledigt"?'<button type="button" class="mi-ib done on" data-act="mireopen:'+uid+'" title="Wieder als offen markieren" aria-label="Wieder öffnen">'+F.svg("refresh")+'<span class="mi-rl">Wieder öffnen</span></button>'
      :'<button type="button" class="mi-ib done" data-act="midone:'+uid+'" title="Als erledigt markieren – verschwindet aus „Offen“" aria-label="Erledigt">'+F.svg("checkCircle")+'<span class="mi-rl">Erledigt</span></button>')+'</div></div>';
  var tb;
  if(i.kind==="message"){ var th=i.thread&&i.thread.length?i.thread:[{from:i.from,text:i.text,at:i.at,mine:i.mine}], shown=OPEN[i.id]?th:th.slice(-30), lastDay="", lastWho=null;
    tb=(th.length>shown.length?'<button type="button" class="mi-more" data-act="mimore:'+uid+'">'+(th.length-shown.length)+' ältere Nachrichten anzeigen</button>':'')+
      shown.map(function(m){ var dl=dayLbl(m.at), nd=dl!==lastDay, sep=nd?'<span class="mi-day">'+esc(dl)+'</span>':'', who=m.mine?"":(m.from&&m.from.name)||"", same=!nd&&who===lastWho; lastDay=dl; lastWho=who; return sep+bubble(m,"",null,same,{r:r,mid:m.id,list:m.att}); }).join("");
  } else {
    var p=i.post, pu2=p&&/^https?:\/\//.test(p.url||"")?p.url:"", post=p&&(p.text||p.thumb||pu2)?(pu2?'<a class="mi-pctx" href="'+esc(pu2)+'" target="_blank" rel="noopener" title="'+esc(p.text||"Beitrag öffnen")+'">':'<div class="mi-pctx">')+
      (p.thumb?'<img src="'+esc(p.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="mi-ph">'+pfIcon(r.c.platform)+'</span>')+
      '<span class="mi-pt"><small>'+(r.c.platform==="youtube"?"Video auf YouTube":"Beitrag auf "+esc(r.c.label))+(p.at?" · "+ago(p.at):"")+'</small><span class="mi-cap">'+esc(p.text||(r.c.platform==="youtube"?"Kommentar zu deinem Video":"Ohne Text"))+'</span></span>'+(pu2?'<span class="mi-go">Zum Beitrag '+F.svg("external")+'</span></a>':'</div>'):'';
    var lk=(i.likes?'<span title="'+esc(i.likes)+' Likes">'+F.svg("mheart")+' '+esc(i.likes)+'</span>':'')+(i.can&&i.can.like?'<button type="button" class="mi-like" data-act="milike:'+uid+'"'+(i.liked||busy?' disabled':'')+'>'+F.svg("mheart")+(i.liked?"Gefällt dir":busy==="like"?"…":"Gefällt mir")+'</button>':'');
    tb=post+bubble({from:i.from,text:i.text,label:i.label,at:i.at,mine:i.mine},"lead",lk,false,{r:r,mid:"",list:i.media})+(i.replies||[]).map(function(x){ return bubble(x,"rep"); }).join("");
  }
  var qm=!!QUOTE[r.uid], lim=r.c.platform==="bluesky"?300:r.c.platform==="threads"?500:0, dr=DRAFT[r.uid]||"", ki=!!(F.mktPlan&&F.mktPlan()&&F.mktPlan().ki)&&!qm;
  /* Instagram/Facebook: Antworten nur bis 24 h nach der letzten Nachricht der Person (danach nur in der App) */
  var w24="", lt=0; if(i.kind==="message"&&(r.c.platform==="instagram"||r.c.platform==="facebook")){ (i.thread||[]).forEach(function(m){ if(!m.mine) lt=Math.max(lt,ms(m.at)); }); if(lt&&Date.now()-lt>864e5) w24='<p class="mi-w24">'+F.svg("miclock")+'<span>Antwortfenster abgelaufen: Meta lässt Antworten über die Schnittstelle nur bis 24 Stunden nach der letzten Nachricht zu.'+(appLink(i)?' <a href="'+esc(appLink(i))+'" target="_blank" rel="noopener noreferrer">In der App antworten</a>':'')+'</span></p>'; }
  var qh=qm?'<p class="mi-qm">'+F.svg("miquote")+'<span>Zitat von '+esc((i.from&&(i.from.handle||i.from.name))||"")+' – dein Text erscheint über dem zitierten Beitrag.</span><button type="button" class="btn sm" data-act="miquotex:'+uid+'">Abbrechen</button></p>':'';
  var cmp=i.can&&i.can.reply||qm?'<div class="mi-cmp">'+w24+qh+'<div class="mi-cbox"><textarea rows="2" data-mirep="'+uid+'" data-keepfocus="mirep" data-mifocus="rep" data-lim="'+lim+'" placeholder="'+(qm?"Dein Text zum Zitat":(i.kind==="message"?"Nachricht an ":i.sub==="tag"&&r.c.platform==="facebook"?"Kommentar unter dem Beitrag von ":"Antwort an ")+esc(nm))+' …" aria-label="'+(qm?"Zitat schreiben":"Antwort schreiben")+'">'+esc(dr)+'</textarea>'+
    '<div class="mi-cbar">'+(ki?'<button type="button" class="mi-ki" data-act="misuggest:'+uid+'"'+(busy==="ki"?' disabled':'')+' title="KI schreibt einen Vorschlag im Ton der Marke – Stichworte im Feld werden berücksichtigt. Du prüfst und sendest selbst.">'+F.svg("sparkle")+(busy==="ki"?"Schreibe …":"KI-Vorschlag")+'</button>':'')+
    '<span class="mi-sp"></span>'+(lim?'<span class="mi-cnt'+(dr.length>lim?" over":"")+'" data-micnt>'+dr.length+' / '+lim+'</span>':'')+'<span class="mi-hint">⌘↩ senden</span>'+
    '<button type="button" class="btn primary sm mi-send" data-act="misend:'+uid+'"'+(busy||(lim&&dr.length>lim)?' disabled':'')+' title="'+(qm?"Zitieren":"Senden")+' (⌘↩)">'+F.svg(qm?"miquote":"send")+(busy==="send"?" Sende …":qm?" Zitieren":" Senden")+'</button></div></div></div>'
    :'<div class="mi-cmp"><p class="mi-noreply">'+(i.kind==="mention"&&i.sub==="tag"?'Unter fremden Beiträgen kommentierst du in der App von '+esc(r.c.label)+'.'+(appLink(i)?' <a href="'+esc(appLink(i))+'" target="_blank" rel="noopener noreferrer">Beitrag öffnen</a>':''):'Antworten ist hier über die Schnittstelle nicht möglich – bitte direkt in der App von '+esc(r.c.label)+'.'+(pu?' <a href="'+esc(pu)+'" target="_blank" rel="noopener">Profil öffnen</a>':''))+'</p></div>';
  return '<div class="mi-thread" style="display:contents">'+head+xbarHtml(r)+'<div class="mi-tb" id="miThread">'+tb+'</div>'+cmp+'</div>'; }
function overviewHtml(keys,v,li,likesPane){
  var head=likesPane||mob()?'<div class="mi-th"><button type="button" class="mi-ib mi-back" data-act="miback" aria-label="Zurück zur Liste">'+F.svg("chevL")+'</button><div class="mi-tw"><b>Beiträge &amp; Likes</b><span>'+esc(UI.mkInBrand==="alle"?"Alle Marken":(brandOf(UI.mkInBrand)||{}).name||"")+'</span></div></div>':'';
  if(!v.ld) return head+'<div class="mi-ovb">'+empty("minbox","Lade Kommentare und Nachrichten …","Alle verbundenen Marken werden abgefragt – das dauert ein paar Sekunden.","")+'</div>';
  var base=allRows(keys), open=base.filter(function(r){ return r.open; }).length, neu=base.filter(function(r){ return r.it.isNew; }).length, wkT="Beiträge der letzten 7 Tage (Instagram, Facebook) und neue Likes auf Bluesky";
  var kO='<button type="button" class="mi-kpi" data-act="mikind:offen" title="Offene Einträge anzeigen"><b>'+open+'</b><span>offen</span></button>', kN='<button type="button" class="mi-kpi" data-act="mikind:offen" title="Offene Einträge anzeigen"><b>'+neu+'</b><span>neu</span></button>',
    kL='<div class="mi-kpi" style="cursor:default" title="'+wkT+'"><b>'+li.likes.toLocaleString("de-AT")+'</b><span>Likes diese Woche</span></div>', kC='<div class="mi-kpi" style="cursor:default" title="Kommentare auf Beiträgen der letzten 7 Tage"><b>'+li.com.toLocaleString("de-AT")+'</b><span>Kommentare diese Woche</span></div>', kF=li.fol?'<div class="mi-kpi" style="cursor:default"><b>'+li.fol+'</b><span>'+(li.fol===1?"neuer Follower":"neue Follower")+'</span></div>':'';
  var kp='<div class="mi-kpis">'+(likesPane?kL+kC+kF:kO+kN+kL+kF)+'</div>';
  var pick=likesPane||!v.list.length?'':'<p class="mi-pick">'+F.svg("chevL")+'<span>Wähle links einen Kommentar oder eine Nachricht – hier liest und antwortest du.</span></p>';
  var posts=li.posts.slice(0,24), pg=posts.length?'<div class="mi-posts">'+posts.map(function(p){ var tx=p.text||"", u=/^https?:\/\//.test(p.url||"")?p.url:""; return (u?'<a class="mi-pc" href="'+esc(u)+'" target="_blank" rel="noopener" title="'+esc(tx||"Beitrag öffnen")+'">':'<div class="mi-pc"'+(tx?' title="'+esc(tx)+'"':'')+'>')+(p.thumb?'<img src="'+esc(p.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="mi-ph">'+pfIcon(p.pf)+'</span>')+
    '<div><span class="mi-pk">'+(p.likes!=null?'<span class="mi-lk" title="Likes">'+F.svg("mheart")+esc(p.likes)+'</span>':'')+'<span title="Kommentare">'+F.svg("message")+esc(p.comments||0)+'</span></span><span class="mi-ps">'+pfIcon(p.pf)+'<span>'+esc(p.b.name)+' · '+esc(ago(p.at)||p.pfLabel)+'</span></span>'+(tx?'<span class="mi-px">'+esc(tx.slice(0,140))+'</span>':'')+'</div>'+(u?'</a>':'</div>'); }).join("")+'</div>':'<p class="mi-foot">Noch keine Beiträge geladen.</p>';
  var notes=li.notes.length?'<h3 class="mi-h3">Hinweise zu Kanälen</h3><ul class="mi-notes">'+li.notes.map(function(n){ return '<li>'+esc(n)+'</li>'; }).join("")+'</ul>':'';
  return head+'<div class="mi-ovb">'+pick+kp+'<h3 class="mi-h3">Deine letzten Beiträge<span class="mi-sp"></span><small>'+posts.length+'</small></h3>'+pg+
    '<p class="mi-foot">Instagram und Facebook zeigen über ihre Schnittstelle nur die Anzahl der Likes, nicht wer geliked hat. Bluesky liefert die Namen.</p>'+notes+'</div>'; }

function body(){
  var bs=brands(), P=F.mktPlan&&F.mktPlan();
  if(!bs.length||!P) return '<div class="mi-win"><div class="mi-box"><section class="mi-lp"><div class="mi-scroll">'+skel(6)+'</div></section><section class="mi-rp"></section></div></div>';
  if(P.ok===false) return '<div class="notice"><span>'+esc(P.error||"Kanäle konnten nicht geladen werden")+'</span><button type="button" class="btn sm" data-act="mireplan">'+F.svg("refresh")+' Erneut versuchen</button></div>';
  if(UI.mkInBrand!=="alle"&&!brandOf(UI.mkInBrand)) UI.mkInBrand="alle";
  fillEmpty(); var keys=scopeKeys(), live=liveKeys();
  setTimeout(ensure,0);
  var v=view(), li=likesInfo(keys); v.ld=loaded(keys); var top=topHtml(bs,v);
  if(!live.length) return '<div class="mi-win mi-solo">'+topHtml(bs,v,true)+'<div class="mi-box"><section class="mi-lp" style="border:0">'+empty("plug","Noch keine Kanäle verbunden","Verbinde Instagram, Facebook &amp; Co. – dann landen Kommentare und Nachrichten aller Marken hier.",'<button type="button" class="btn primary sm" data-act="mktab:kanaele">'+F.svg("link")+' Kanäle verbinden</button>')+'</section></div></div>';
  var b=UI.mkInBrand!=="alle"&&brandOf(UI.mkInBrand);
  if(b&&!b.chs.length) return '<div class="mi-win mi-solo">'+topHtml(bs,v,true)+'<div class="mi-box"><section class="mi-lp" style="border:0">'+empty("plug","Für "+esc(b.name)+" ist noch kein Konto verbunden","Verbinde ein Konto, dann erscheinen Kommentare und Nachrichten hier.",'<button type="button" class="btn primary sm" data-act="mktab:kanaele">'+F.svg("link")+' Kanäle verbinden</button><button type="button" class="btn sm" data-act="miopen:alle">Alle Marken</button>')+'</section></div></div>';
  var r=rowOf(UI.mkInSel); if(UI.mkInSel&&!r&&!anyLoading()) UI.mkInSel="";
  var likesPane=!r&&UI.mkInPane==="likes", reading=!!r||likesPane;
  return '<div class="mi-win'+(reading?" reading":"")+'">'+top+metaHtml(keys,li,v)+bansHtml(li)+'<div class="mi-box'+(reading?" reading":"")+'">'+listHtml(keys,v,li)+'<section class="mi-rp" aria-label="'+(r?"Verlauf":"Überblick")+'">'+(r?threadHtml(r):overviewHtml(keys,v,li,likesPane))+'</section></div></div>';
}

/* ---------- Zeichnen (nur #miRoot; Eingaben, Fokus und Scrollstand bleiben) ---------- */
function paintSoon(){ if(PT) return; PT=requestAnimationFrame(function(){ PT=0; paint(); }); }
function paint(){ var el=document.getElementById("miRoot"); if(!el) return;
  var ae=document.activeElement, fk=ae&&el.contains(ae)&&ae.getAttribute("data-mifocus"), s0=fk&&ae.selectionStart, s1=fk&&ae.selectionEnd;
  var snap=F.scrollSnap(el), html=body(); if(el._h===html) return; el._h=html; el.innerHTML=html; F.scrollRestore(el,snap);
  if(fk){ var q=el.querySelector('[data-mifocus="'+fk+'"]'); if(q){ q.focus({preventScroll:true}); try{ q.setSelectionRange(s0,s1); }catch(e){} } }
  after(); }
function after(){ fit(); vv(); Array.prototype.forEach.call(document.querySelectorAll("#miRoot textarea[data-mirep]"),grow);
  if(UI.mkInSel!==LASTSEL){ LASTSEL=UI.mkInSel; var t=document.getElementById("miThread"), o=itemOf(UI.mkInSel); if(t) t.scrollTop=o&&o.it.kind==="message"?t.scrollHeight:0;
    var row=UI.mkInSel&&document.querySelector('.mi-row[data-miit="'+CSS.escape(UI.mkInSel)+'"]'); if(row&&!mob()&&row.scrollIntoView) row.scrollIntoView({block:"nearest"}); } }
/* PC: Box füllt das Fenster bis unten, Liste und Verlauf scrollen getrennt */
function fit(){ var b=document.querySelector("#miRoot .mi-box"); if(!b) return; if(mob()){ b.style.removeProperty("--mi-h"); return; }
  var top=b.getBoundingClientRect().top+window.scrollY; b.style.setProperty("--mi-h",Math.max(480,Math.round(window.innerHeight-top-24))+"px"); }
function vv(){ var v=window.visualViewport, rp=document.querySelector("#miRoot .mi-box.reading>.mi-rp"); if(!rp) return;
  if(!v||!mob()){ rp.style.removeProperty("top"); rp.style.removeProperty("height"); rp.style.removeProperty("bottom"); return; }
  rp.style.top=Math.round(v.offsetTop)+"px"; rp.style.height=Math.round(v.height)+"px"; rp.style.bottom="auto"; }
if(window.visualViewport){ visualViewport.addEventListener("resize",vv); visualViewport.addEventListener("scroll",vv); }
function grow(t){ if(!t) return; t.style.height="auto"; t.style.height=Math.min(t.scrollHeight+2,mob()?160:200)+"px"; }
window.addEventListener("resize",function(){ if(document.getElementById("miRoot")) fit(); });
/* „Stand vor … Min.“ nachziehen und alle 3 Minuten still nachfragen, solange der Posteingang offen ist (der Server frischt Veraltetes auf) */
setInterval(function(){ var s=document.getElementById("miStamp"); if(!s||document.hidden) return; s.innerHTML=stampTxt(scopeKeys()); ensure(); },30e3);

/* ---------- Aktionen ---------- */
function itemOf(a){ var x=String(a||"").split("|"), d=BOX[x[0]]; if(!d||!d.channels) return null; var c=d.channels.find(function(c){ return c.platform===x[1]; }); var it=c&&c.items.find(function(i){ return i.id===x.slice(2).join("|"); }); return it?{key:x[0],platform:x[1],it:it,c:c,uid:a}:null; }
function setCnt(j){ if(j&&j.counts){ CNT=j.counts; tabPaint(); } }
function readItems(key,ids,all){ var d=BOX[key]; if(!d||!d.channels) return; d.channels.forEach(function(c){ c.items.forEach(function(i){ if(all||ids.indexOf(i.id)>-1) i.isNew=false; }); });
  act({brand:key,op:all?"readall":"read",ids:ids}).then(setCnt).then(paintSoon); paintSoon(); }
/* nach Erledigt/Ausblenden am PC gleich zum nächsten Eintrag der Liste (Handy: zurück zur Liste) */
function nextAfter(uid){ var l=view().list, i=l.findIndex(function(r){ return r.uid===uid; }); if(i<0) return ""; var n=l[i+1]||l[i-1]; return n?n.uid:""; }
function select(uid){ var ae=document.activeElement, fr=ae&&ae.classList&&ae.classList.contains("mi-row");
  UI.mkInSel=uid||""; UI.mkInPane=""; MENU=false; var o=uid&&itemOf(uid); if(o&&o.it.isNew) readItems(o.key,[o.it.id]);
  if(uid&&mob()&&!PUSHED){ try{ history.pushState({fscMi:1},""); PUSHED=true; }catch(e){} } paint();
  if(fr&&uid){ var row=document.querySelector('.mi-row[data-miit="'+CSS.escape(uid)+'"]'); if(row) row.focus({preventScroll:true}); } }
function closeSel(){ UI.mkInSel=""; UI.mkInPane=""; paint(); }
function advance(uid){ if(mob()){ if(PUSHED){ history.back(); return; } closeSel(); return; } var n=nextAfter(uid); if(n) select(n); else closeSel(); }
F.action("misel",function(uid){ if(uid===UI.mkInSel&&!mob()) return; select(uid); });
F.action("miback",function(){ if(PUSHED){ history.back(); return; } closeSel(); });
window.addEventListener("popstate",function(){ if(!PUSHED) return; PUSHED=false; if(UI.mkInSel||UI.mkInPane){ UI.mkInSel=""; UI.mkInPane=""; paint(); } });
F.action("mibmenu",function(){ MENU=!MENU; paint(); if(MENU){ var f=document.querySelector('.mi-mi[aria-current="true"]')||document.querySelector(".mi-mi"); if(f) f.focus({preventScroll:true}); } });
F.action("miopen",function(k){ UI.mkInBrand=k||"alle"; F.ls("fsc_mkin_b",UI.mkInBrand); MENU=false; if(UI.mkInSel&&UI.mkInBrand!=="alle"&&UI.mkInSel.split("|")[0]!==UI.mkInBrand) UI.mkInSel=""; ensure(); paint(); });
F.action("mikind",function(k){ if(k==="likes"){ UI.mkInSel=""; UI.mkInPane="likes"; if(mob()&&!PUSHED){ try{ history.pushState({fscMi:1},""); PUSHED=true; }catch(e){} } paint(); return; }
  UI.mkInKind=k==="ungelesen"?"offen":(["offen","kommentare","nachrichten","erwaehnungen","anfragen","alle"].indexOf(k)>-1?k:"offen"); if(UI.mkInPane==="likes"&&!mob()) UI.mkInPane=""; paint(); });
F.action("misort",function(){ UI.mkInSort=UI.mkInSort==="offen"?"neu":"offen"; F.ls("fsc_mkin_sort",UI.mkInSort); paint(); });
F.action("miqclear",function(){ UI.mkInQ=""; paint(); var q=document.querySelector("[data-miq]"); if(q&&!mob()) q.focus(); });
F.action("mireload",function(k){ reloadAll(k||""); });
F.action("mireplan",function(){ if(F.mktPlanReload) F.mktPlanReload(); });
F.action("misend",function(a){ var o=itemOf(a); if(!o) return; var ta=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'), txt=(ta?ta.value:DRAFT[a]||"").trim(); if(!txt) return F.toast("Bitte zuerst einen Text schreiben",true);
  var qm=!!QUOTE[a]; DRAFT[a]=ta?ta.value:txt; BUSY[o.it.id]="send"; paint();
  act({brand:o.key,platform:o.platform,id:o.it.id,op:qm?"quote":"reply",text:txt}).then(function(j){ delete BUSY[o.it.id];
    if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||(qm?"Zitieren fehlgeschlagen":"Senden fehlgeschlagen"),true); }
    var i=o.c.items.indexOf(o.it); o.c.items[i]=Object.assign(j.item,{isNew:false,done:o.it.done}); delete DRAFT[a]; delete QUOTE[a]; paint(); F.toast(qm?"Zitiert":"Gesendet"); }); });
/* Eintrag nach einer Aktion durch die Antwort des Servers ersetzen (erledigt bleibt) */
function replaceItem(o,item){ var k=o.c.items.indexOf(o.it); if(k>-1&&item) o.c.items[k]=Object.assign({done:o.it.done},item,{isNew:false}); }
function focusRep(a){ var t=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'); if(t){ t.focus(); try{ t.setSelectionRange(t.value.length,t.value.length); }catch(e){} } }
/* „Annehmen & antworten“ / „Antworten“: ins Antwortfeld (die Antwort nimmt eine Anfrage an) */
F.action("mifocus",function(a){ focusRep(a); });
/* Bild groß */
F.action("mizoom",function(x,el){ var s=el&&el.getAttribute("data-full"); if(!s) return; F.modal('<div class="row-between"><h2 style="font-size:17px">Bild</h2>'+F.btnClose()+'</div><img class="mi-zoom" src="'+esc(s)+'" alt="" referrerpolicy="no-referrer">',"wide"); });
F.action("micopy",function(x,el){ var u=el&&el.getAttribute("data-url"); if(!u) return;
  (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(u):Promise.reject()).then(function(){ F.toast("Link kopiert"); },function(){ F.toast("Kopieren ging nicht – "+u,true); }); });
/* „In meiner Story teilen“: Meta erlaubt das nur in der App. Am Handy direkt der Link, am Mac ein QR-Code zum Scannen (Server baut ihn aus dem Eintrag) */
F.action("mistory",function(a){ var o=itemOf(a); if(!o) return; var i=o.it, url=appLink(i), sm=i.kind==="message", coarse=!!(window.matchMedia&&matchMedia("(pointer:coarse)").matches);
  var h='<span class="mi-nw">'+esc((i.from&&(i.from.handle||i.from.name))||"der Person")+'</span>', ex=sm&&i.flags&&i.flags.smState!=="expired"?hrsLeft(i.flags.smExp):0;
  if(!url) return F.toast("Für diesen Eintrag gibt es keinen Link in die App",true);
  var open=coarse?'Link öffnen':'QR-Code mit dem Handy scannen (oder den Link am Handy öffnen)';
  var steps=sm?[open+' – die Unterhaltung mit '+h+' öffnet sich in Instagram.','Unter der Erwähnung auf <b>„Zu deiner Story hinzufügen“</b> tippen – geht, solange die Story läuft und '+h+' das Teilen erlaubt.','Danach hier auf <b>„Geteilt“</b> tippen.']
    :[open+' – der Beitrag öffnet sich in Instagram.','Auf <b>Teilen ✈</b> → <b>„Zu deiner Story hinzufügen“</b> tippen.','Danach hier auf <b>„Geteilt“</b> tippen.'];
  F.modal('<div class="row-between"><h2 style="font-size:19px">In deiner Story teilen</h2>'+F.btnClose()+'</div>'+
    '<p class="mi-shp">Instagram lässt das Teilen in die Story nur in der App zu, nicht über die Schnittstelle.'+(ex?' Die Story ist noch <b class="mi-nw">'+ex+' h</b> teilbar.':'')+'</p>'+
    (coarse?'':'<div class="mi-qr" id="miQr" aria-label="QR-Code zum Link"><span class="mi-spin" aria-hidden="true"></span></div>')+
    '<ol class="mi-steps">'+steps.map(function(x){ return '<li>'+x+'</li>'; }).join("")+'</ol>'+
    '<div class="foot"><button type="button" class="btn sm" data-act="micopy" data-url="'+esc(url)+'">'+F.svg("micopy")+' Link kopieren</button><span class="row"><a class="btn'+(coarse?' primary':'')+'" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+F.svg("miext")+' In Instagram öffnen</a>'+
    '<button type="button" class="btn'+(coarse?'':' primary')+'" data-act="mishared:'+esc(a)+'">'+F.svg("check")+' Geteilt</button></span></div>',"narrow");
  if(!coarse) api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:i.id,op:"deeplink"}).then(function(j){ var q=document.getElementById("miQr"); if(!q) return;
    q.innerHTML=j&&j.ok&&/^<svg[\s>]/.test(String(j.qr||"").replace(/^<\?xml[^>]*>\s*/,""))?String(j.qr).replace(/^<\?xml[^>]*>\s*/,""):'<small>QR-Code nicht verfügbar – Link kopieren und am Handy öffnen.</small>'; },function(){});
});
F.action("mishared",function(a){ var o=itemOf(a); if(!o) return; F.closeModal();
  act({brand:o.key,platform:o.platform,id:o.it.id,op:"shared"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); replaceItem(o,j.item); setCnt(j); paint(); F.toast("Als geteilt vermerkt"); }); });
/* Markierten Feed-Beitrag als eigene Story hochladen – nur mit Häkchen (Einverständnis), Urheber wird markiert; nie für Story-Erwähnungen */
F.action("mistoryup",function(a){ var o=itemOf(a), r=rowOf(a); if(!o||!r) return; var i=o.it, h=(i.from&&i.from.handle)||"", m=(i.media||[])[0], src=m?(hasPrev(r,m)?msrc(r,"",0,m,"prev"):msrc(r,"",0,m,"full")):"", bn=(brandOf(o.key)||{}).name||"";
  F.modal('<div class="row-between"><h2 style="font-size:19px">Als eigene Story hochladen</h2>'+F.btnClose()+'</div>'+
    '<div class="mi-up">'+(src&&m.t!=="video"?'<img src="'+esc(src)+'" alt="" referrerpolicy="no-referrer">':'<span></span>')+'<p>Das Cockpit holt den Beitrag von <b class="mi-nw">'+esc(h)+'</b>, bringt ihn ins Story-Format (1080 × 1920, unten <span class="mi-nw">„📸 '+esc(h)+'“</span>) und veröffentlicht ihn als Story von <b>'+esc(bn)+'</b> – mit Markierung von <span class="mi-nw">'+esc(h)+'</span>. Die Datei wird danach sofort gelöscht.</p></div>'+
    '<p class="mi-shp">Meist besser: in der App über Teilen ✈ → „Zu deiner Story hinzufügen“ – dann sieht man den Originalbeitrag und <span class="mi-nw">'+esc(h)+'</span> bekommt die Reichweite.</p>'+
    '<label class="mi-consent"><input type="checkbox" id="miConsent"><span><span class="mi-nw">'+esc(h||"Die Person")+'</span> hat zugestimmt bzw. ich darf den Inhalt verwenden.</span></label>'+
    '<div class="foot"><button type="button" class="btn" data-act="mistory:'+esc(a)+'">In der App teilen</button><button type="button" class="btn primary" id="miUpGo" data-act="mistoryupgo:'+esc(a)+'" disabled>'+F.svg("miup")+' Als Story veröffentlichen</button></div>',"narrow"); });
F.listen("change","#miConsent",function(el){ var b=document.getElementById("miUpGo"); if(b) b.disabled=!el.checked; });
F.action("mistoryupgo",function(a,el){ var o=itemOf(a), cb=document.getElementById("miConsent"); if(!o||!cb||!cb.checked) return; el.disabled=true; el.innerHTML='<span class="mi-spin" aria-hidden="true"></span> Wird veröffentlicht …';
  act({brand:o.key,platform:o.platform,id:o.it.id,op:"story_reupload",consent:true}).then(function(j){ F.closeModal(); if(!j||!j.ok) return F.toast((j&&j.error)||"Story-Upload fehlgeschlagen",true);
    replaceItem(o,j.item); paint(); F.toast(j.note?"Story veröffentlicht – "+j.note:"Als Story veröffentlicht"); }); });
/* Bluesky: reposten, zitieren (Antwortfeld im Zitat-Modus) */
F.action("mirepost",function(a){ var o=itemOf(a); if(!o||o.it.reposted) return; BUSY[o.it.id]="repost"; paint();
  act({brand:o.key,platform:o.platform,id:o.it.id,op:"repost"}).then(function(j){ delete BUSY[o.it.id]; if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||"Reposten fehlgeschlagen",true); } replaceItem(o,j.item); paint(); F.toast("Repostet"); }); });
F.action("miquote",function(a){ QUOTE[a]=1; paint(); focusRep(a); });
F.action("miquotex",function(a){ delete QUOTE[a]; paint(); });
/* Medien, die nicht laden: unklarer Typ → als Video nochmal, sonst Platzhalter (abgelaufen/gelöscht); Mini-Vorschau in der Liste verschwindet einfach */
document.addEventListener("error",function(e){ var t=e.target; if(!t||!t.getAttribute||!t.closest||!t.closest("#miRoot")) return; var s=t.getAttribute("data-misrc"); if(!s) return;
  if(t.tagName==="IMG"&&t.getAttribute("data-mialt")&&!ALT[s]) ALT[s]=1; else FAILED[s]=1;
  if(t.closest(".mi-mt")){ var m=t.closest(".mi-mt"); if(m&&m.parentNode) m.parentNode.removeChild(m); return; }
  paintSoon(); },true);
F.action("milike",function(a){ var o=itemOf(a); if(!o) return; BUSY[o.it.id]="like"; paint();
  act({brand:o.key,platform:o.platform,id:o.it.id,op:"like"}).then(function(j){ delete BUSY[o.it.id]; if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||"Liken fehlgeschlagen",true); } o.it.liked=true; paint(); }); });
F.action("misuggest",function(a){ var o=itemOf(a); if(!o) return; var ta=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'), hint=ta?ta.value.trim():""; BUSY[o.it.id]="ki"; paint();
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"suggest",hint:hint}).then(function(j){ delete BUSY[o.it.id];
    if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||"KI-Vorschlag fehlgeschlagen",true); }
    DRAFT[a]=j.text; paint(); var t=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'); if(t){ t.focus(); try{ t.setSelectionRange(t.value.length,t.value.length); }catch(e){} } }); });
F.action("miread",function(a){ var o=itemOf(a); if(o) readItems(o.key,[o.it.id]); });
F.action("mireadall",function(){ scopeKeys().forEach(function(k){ var d=BOX[k]; if(d&&d.channels&&d.channels.some(function(c){ return c.items.some(function(i){ return i.isNew; }); })) readItems(k,[],true); }); });
F.action("mimore",function(a){ var o=itemOf(a); if(!o) return; OPEN[o.it.id]=1; paint(); });
function setDone(a,done){ var o=itemOf(a); if(!o) return; var nx=done&&UI.mkInKind==="offen"?a:"";
  o.it.done=done; o.it.isNew=false; if(nx) advance(a); else paint();
  act({brand:o.key,platform:o.platform,id:o.it.id,op:done?"done":"open"}).then(function(j){ if(!j||!j.ok){ o.it.done=!done; paint(); return F.toast((j&&j.error)||"Fehler",true); } setCnt(j); paintSoon(); });
  F.toast(done?"Erledigt":"Wieder offen",false,done?"Rückgängig":"",done?function(){ setDone(a,false); }:null); }
F.action("midone",function(a){ setDone(a,true); });
F.action("mireopen",function(a){ setDone(a,false); });
var gone=function(o){ o.c.items=o.c.items.filter(function(i){ return i.id!==o.it.id; }); };
F.action("mihide",function(a){ var o=itemOf(a); if(!o) return; act({brand:o.key,platform:o.platform,id:o.it.id,op:"hide"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true);
  var sel=UI.mkInSel===a, n=sel&&!mob()?nextAfter(a):""; gone(o); if(sel){ if(mob()) advance(a); else if(n) select(n); else closeSel(); } else paint(); loadCounts(); F.toast("Ausgeblendet"); }); });
F.action("midel",function(a){ var o=itemOf(a); if(!o) return; F.confirm("Diesen Kommentar von "+((o.it.from&&o.it.from.name)||"")+" auf "+o.c.label+(o.platform==="threads"?" ausblenden":o.platform==="youtube"?" ablehnen (wird ausgeblendet)":" endgültig löschen")+"?",o.platform==="instagram"||o.platform==="facebook"?"Löschen":"Ausblenden",function(){
  act({brand:o.key,platform:o.platform,id:o.it.id,op:"delete"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Löschen fehlgeschlagen",true);
    var sel=UI.mkInSel===a, n=sel&&!mob()?nextAfter(a):""; gone(o); if(sel){ if(mob()) advance(a); else if(n) select(n); else closeSel(); } else paint(); loadCounts(); F.toast(o.platform==="instagram"||o.platform==="facebook"?"Gelöscht":"Ausgeblendet"); }); },true); });

/* Eingaben: Suche filtert sofort, Antwortfeld wächst mit und merkt sich den Entwurf */
F.listen("input","[data-miq]",function(el){ UI.mkInQ=el.value; paint(); });
F.listen("input","[data-mirep]",function(el){ var a=el.getAttribute("data-mirep"); DRAFT[a]=el.value; grow(el); var lim=+el.getAttribute("data-lim")||0, box=el.closest(".mi-cbox");
  if(lim&&box){ var c=box.querySelector("[data-micnt]"), b=box.querySelector(".mi-send"), over=el.value.length>lim; if(c){ c.textContent=el.value.length+" / "+lim; c.classList.toggle("over",over); } if(b) b.disabled=over; } });
F.listen("keydown","[data-mirep]",function(el,e){ if(e&&e.key==="Enter"&&(e.metaKey||e.ctrlKey)){ e.preventDefault(); var b=el.closest(".mi-cbox")&&el.closest(".mi-cbox").querySelector('[data-act^="misend:"]'); if(b&&!b.disabled) b.click(); } });
F.listen("keydown","[data-miq]",function(el,e){ if(e.key==="Escape"&&el.value){ e.stopPropagation(); UI.mkInQ=""; paint(); } if(e.key==="ArrowDown"){ var r=document.querySelector(".mi-row"); if(r){ e.preventDefault(); r.focus(); } } });
/* Liste mit Tastatur: ↑/↓ wandert, Enter/Leertaste öffnet */
F.listen("keydown",".mi-row",function(el,e){ if(e.target!==el) return;
  if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.click(); return; }
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); var n=e.key==="ArrowDown"?el.nextElementSibling:el.previousElementSibling; if(n&&n.classList.contains("mi-row")){ n.focus(); if(!mob()) n.click(); } } });
F.listen("keydown",".mi-menu",function(el,e){ if(e.key!=="ArrowDown"&&e.key!=="ArrowUp") return; e.preventDefault(); var l=Array.prototype.slice.call(el.querySelectorAll(".mi-mi")), i=l.indexOf(document.activeElement); var n=l[Math.max(0,Math.min(l.length-1,i+(e.key==="ArrowDown"?1:-1)))]; if(n) n.focus(); });
document.addEventListener("click",function(e){ if(MENU&&!(e.target.closest&&e.target.closest(".mi-bw"))){ MENU=false; paint(); } });
document.addEventListener("keydown",function(e){ if(e.key!=="Escape"||!document.getElementById("miRoot")||F.modalOpen&&F.modalOpen()) return;
  if(MENU){ MENU=false; paint(); var b=document.querySelector(".mi-bsel"); if(b) b.focus(); return; }
  if(mob()&&(UI.mkInSel||UI.mkInPane)&&!(e.target.closest&&e.target.closest("textarea"))){ if(PUSHED) history.back(); else closeSel(); } });

F.mktTab({id:"posteingang",label:"Posteingang",icon:"inbox",order:1.5,sub:"Kommentare und Nachrichten aller Marken – lesen, beantworten, erledigen",
  count:function(){ if(!CNT&&!CNTREQ) loadCounts(); return unreadTotal(); }, countTitle:function(n){ return n+" ungelesen"; },
  render:function(){ ensure(); if(!CNT&&!CNTREQ&&!PULL) loadCounts(); if(F.mktPlan&&!F.mktPlan()&&F.mktPlanReload) F.mktPlanReload(); var h=body(); return '<div id="miRoot">'+h+'</div>'; },
  after:function(){ after(); }});
})();
