/* Marketing › Posteingang (Server: mkt-posts.js /admin/api/mkt/inbox, Plattformen: mkt-publish.js inbox/inboxReply/inboxLike).
   Wie ein Mailprogramm: links EINE Zeile je Kommentar bzw. Unterhaltung (alle Marken oder eine), rechts der Verlauf mit Beitrag und Antwortfeld.
   Marken werden im Hintergrund geladen (höchstens 3 gleichzeitig), Filtern und Wechseln passiert sofort im Browser.
   Zustand je Eintrag: Neu (ungelesen) → Offen → Beantwortet; „Erledigt“ merkt sich der Server (bis wieder jemand schreibt).
   Likes sind keine Einträge, nur eine Zeile („… Likes diese Woche“) und die Beitragsübersicht rechts.
   Handy (≤ 900 px): Liste volle Breite, Antippen öffnet den Verlauf bildschirmfüllend (Zurück-Knopf, Antwortfeld unten fix). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
var BOX={}, CNT=null, CNTREQ=false, LOADING={}, BUSY={}, OPEN={}, DRAFT={}, MENU=false, QUEUE=[], INFLIGHT=0, PUSHED=false, LASTSEL="", PT=0;
UI.mkInBrand=UI.mkInBrand||F.ls("fsc_mkin_b")||"alle";
UI.mkInKind=UI.mkInKind||"offen";
UI.mkInSort=UI.mkInSort||F.ls("fsc_mkin_sort")||"neu";
UI.mkInQ=UI.mkInQ||"";
UI.mkInSel=UI.mkInSel||"";
UI.mkInPane=UI.mkInPane||"";
F.icons.minbox='<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>';
F.icons.mheart='<path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 8.2-4.1L12 8l.8-1.1A4.6 4.6 0 0 1 21 11c-2 4.6-9 9-9 9z"/>';
F.icons.msort='<path d="M7 4v16M3.5 16.5 7 20l3.5-3.5"/><path d="M17 20V4M13.5 7.5 17 4l3.5 3.5"/>';

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
'.mi-q input::-webkit-search-cancel-button{display:none}'+
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

function api(path,body){ return F.api(path,body?{body:body}:undefined); }
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
function kindLbl(i){ return i.kind==="message"?"Nachricht":i.kind==="mention"?"Erwähnung":"Kommentar"; }
function preview(i){ if(i.kind==="message"){ var t=i.thread||[], l=t[t.length-1]; if(l) return {me:!!l.mine,t:l.text}; return {me:!!i.mine,t:i.text}; } return {me:false,t:i.text}; }

/* ---------- Laden: alle verbundenen Marken, höchstens 3 gleichzeitig ---------- */
function liveKeys(){ return brands().filter(function(b){ return b.chs.length; }).map(function(b){ return b.key; }); }
function stale(k,age){ var d=BOX[k]; if(!d) return true; var t=Date.now()-(d._t||0); return d.error?t>60e3:t>(age||2*60e3); }
function ensure(force,age){ liveKeys().forEach(function(k){ if(force||stale(k,age)) load(k,force); }); }
function load(key,reload){ if(!key||LOADING[key]) return; LOADING[key]=true; QUEUE.push([key,!!reload]); pump(); }
function pump(){ while(INFLIGHT<3&&QUEUE.length){ (function(q){ var key=q[0]; INFLIGHT++;
  api("/admin/api/mkt/inbox?brand="+encodeURIComponent(key)+"&seen=1"+(q[1]?"&reload=1":"")).then(function(j){
    BOX[key]=j&&j.ok?Object.assign(j,{_t:Date.now()}):Object.assign({channels:[]},BOX[key]&&!BOX[key].error?BOX[key]:{},{error:(j&&j.error)||"Fehler beim Laden",_t:Date.now()}); })
  .catch(function(){ BOX[key]=Object.assign({channels:[]},BOX[key]&&!BOX[key].error?BOX[key]:{},{error:"Keine Verbindung zum Server",_t:Date.now()}); })
  .then(function(){ LOADING[key]=false; INFLIGHT--; if(!INFLIGHT&&!QUEUE.length) loadCounts(); paintSoon(); pump(); }); })(QUEUE.shift()); } }
function loadCounts(){ CNTREQ=true; api("/admin/api/mkt/inbox/counts").then(function(j){ if(j&&j.ok){ CNT=j.counts; tabPaint(); paintSoon(); } }); }
/* Zähler am Reiter „Posteingang“ (zmarketing.js) ohne Neuaufbau nachziehen */
function tabPaint(){ if(F.current==="mkt"&&F.mktTabPaint) F.mktTabPaint("posteingang"); }
function unreadTotal(){ var n=0; if(CNT) Object.keys(CNT).forEach(function(k){ n+=+CNT[k]||0; }); return n; }
function anyLoading(){ return Object.keys(LOADING).some(function(k){ return LOADING[k]; }); }

/* ---------- Daten für die Ansicht ---------- */
function scopeKeys(){ return UI.mkInBrand==="alle"?liveKeys():[UI.mkInBrand]; }
function allRows(keys){ var out=[]; keys.forEach(function(k){ var d=BOX[k], b=brandOf(k); if(!d||!d.channels||!b) return;
  d.channels.forEach(function(c){ c.items.forEach(function(i){ if(i.kind==="like") return; var s=stOf(i); out.push({k:k,b:b,c:c,it:i,uid:k+"|"+c.platform+"|"+i.id,st:s,open:isOpen(s),last:lastAt(i)}); }); }); });
  return out; }
function hay(r){ var i=r.it, p=[i.from&&i.from.name,i.from&&i.from.handle,i.text,i.post&&i.post.text,r.b.name,r.c.label];
  (i.replies||[]).concat(i.thread||[]).forEach(function(m){ p.push(m.text); }); return p.join(" \n ").toLowerCase(); }
function searched(rs){ var q=String(UI.mkInQ||"").trim().toLowerCase(); if(!q) return rs; var ws=q.split(/\s+/); return rs.filter(function(r){ var h=hay(r); return ws.every(function(w){ return h.indexOf(w)>-1; }); }); }
function byKind(rs,k){ return rs.filter(function(r){ var i=r.it; return k==="alle"?true:k==="nachrichten"?i.kind==="message":k==="kommentare"?i.kind!=="message":r.open; }); }
function sorted(rs){ var op=UI.mkInSort==="offen"; return rs.slice().sort(function(a,b){ return (op?(b.open?1:0)-(a.open?1:0):0)||b.last-a.last; }); }
function loaded(keys){ return keys.some(function(k){ return BOX[k]&&BOX[k]._t; }); }
/* Der geöffnete Eintrag bleibt in der Liste stehen, auch wenn er nach dem Antworten nicht mehr zum Reiter passt (wie im Mailprogramm) */
function view(){ var rs=searched(allRows(scopeKeys())), inK=byKind(rs,UI.mkInKind), sel=UI.mkInSel&&inK.every(function(r){ return r.uid!==UI.mkInSel; })&&rs.find(function(r){ return r.uid===UI.mkInSel; });
  return {all:rs,list:sorted(sel?inK.concat([sel]):inK),cnt:{offen:byKind(rs,"offen").length,kommentare:byKind(rs,"kommentare").length,nachrichten:byKind(rs,"nachrichten").length,alle:rs.length}}; }
function openCount(k){ var d=BOX[k]; if(!d||!d.channels||!d._t) return CNT&&CNT[k]||0; return allRows([k]).filter(function(r){ return r.open; }).length; }
function likesInfo(keys){ var wk=Date.now()-7*864e5, o={likes:0,com:0,fol:0,posts:[],notes:[],errs:[]};
  keys.forEach(function(k){ var d=BOX[k], b=brandOf(k); if(!d||!b) return; if(d.error) o.errs.push({k:k,b:b,t:d.error});
    (d.channels||[]).forEach(function(c){
      (c.posts||[]).forEach(function(p){ o.posts.push(Object.assign({pf:c.platform,pfLabel:c.label,b:b},p)); if(ms(p.at)>wk){ if(typeof p.likes==="number") o.likes+=p.likes; if(typeof p.comments==="number") o.com+=p.comments; } });
      c.items.forEach(function(i){ if(i.kind!=="like"||ms(i.at)<wk) return; if(i.sub==="follow") o.fol++; else if(i.sub!=="repost") o.likes++; });
      if(c.error) o.errs.push({k:k,b:b,t:c.label+": "+c.error}); (c.notes||[]).forEach(function(n){ o.notes.push(b.name+" · "+n); }); }); });
  o.posts.sort(function(a,b){ return ms(b.at)-ms(a.at); }); return o; }
function stampIso(keys){ var t=0; keys.forEach(function(k){ var d=BOX[k]; if(d&&d.at){ var x=ms(d.at); if(!t||x<t) t=x; } }); return t?new Date(t).toISOString():""; }
function stampTxt(keys){ if(anyLoading()) return "Lädt …"; var s=stampIso(keys); return s?'<span class="mi-sw">Stand </span>'+ago(s):"Aktualisieren"; }
function rowOf(uid){ var o=uid&&itemOf(uid), b=o&&brandOf(o.key); if(!o||!b) return null; var s=stOf(o.it); return {k:o.key,b:b,c:o.c,it:o.it,uid:uid,st:s,open:isOpen(s),last:lastAt(o.it)}; }

/* ---------- Bausteine ---------- */
function brandMenu(bs){ var all=UI.mkInBrand==="alle", tot=0; bs.forEach(function(b){ if(b.chs.length) tot+=openCount(b.key); });
  var it=function(key,dot,name,sub,n,off){ return '<button type="button" class="mi-mi'+(off?" off":"")+'" role="option" data-act="miopen:'+esc(key)+'" aria-current="'+(UI.mkInBrand===key)+'">'+dot+'<span class="mi-bwho"><b>'+esc(name)+'</b><small>'+esc(sub)+'</small></span>'+(n?'<span class="mi-n" title="'+n+' offen">'+n+'</span>':'<span></span>')+'</button>'; };
  return '<div class="mi-menu" role="listbox" aria-label="Marke wählen">'+it("alle",'<i class="mi-dot all"></i>',"Alle Marken",liveKeys().length+" mit verbundenen Kanälen",tot,false)+'<div class="mi-msep"></div>'+
    bs.map(function(b){ var n=b.chs.length; return it(b.key,'<i class="mi-dot" style="background:'+esc(b.color||"var(--ink-3)")+'"></i>',b.name,n?b.chs.map(function(c){ return pfName(c.platform); }).join(", "):"nicht verbunden",n?openCount(b.key):0,!n); }).join("")+'</div>'; }
function topHtml(bs,v,solo){ var b=UI.mkInBrand==="alle"?null:brandOf(UI.mkInBrand), n=b?openCount(b.key):liveKeys().reduce(function(a,k){ return a+openCount(k); },0);
  var sel='<div class="mi-bw"><button type="button" class="mi-bsel" data-act="mibmenu" aria-haspopup="listbox" aria-expanded="'+MENU+'" title="Marke wählen">'+(b?'<i class="mi-dot" style="background:'+esc(b.color||"var(--ink-3)")+'"></i>':'<i class="mi-dot all"></i>')+'<span class="mi-bt">'+esc(b?b.name:"Alle Marken")+'</span>'+(n?'<span class="mi-n" title="'+n+' offen">'+n+'</span>':'')+F.svg("chevD")+'</button>'+(MENU?brandMenu(bs):'')+'</div>';
  var tabs=[["offen","Offen"],["kommentare","Kommentare"],["nachrichten","Nachrichten"],["alle","Alle"]];
  var seg='<div class="mi-seg" role="group" aria-label="Filter">'+tabs.map(function(t){ var c=v.cnt[t[0]]||0; return '<button type="button" data-act="mikind:'+t[0]+'" aria-pressed="'+(UI.mkInKind===t[0])+'">'+t[1]+(v.ld?' <span class="mi-c'+(t[0]==="offen"&&c?" hot":"")+'">'+c+'</span>':'')+'</button>'; }).join("")+'</div>';
  var q='<label class="mi-q'+(UI.mkInQ?" has":"")+'">'+F.svg("search")+'<input type="search" data-miq data-keepfocus="miq" data-mifocus="q" value="'+esc(UI.mkInQ)+'" placeholder="Suchen …" title="Name, Text oder Beitrag suchen" aria-label="Posteingang durchsuchen" autocomplete="off" enterkeyhint="search">'+(UI.mkInQ?'<button type="button" class="mi-qx" data-act="miqclear" aria-label="Suche löschen">'+F.svg("close")+'</button>':'')+'</label>';
  return '<div class="mi-top">'+sel+(solo?'':seg+q)+'</div>'; }
function metaHtml(keys,li,v){ var unread=v.all.filter(function(r){ return r.it.isNew; }).length;
  var lk='<button type="button" class="mi-lnk likes" data-act="mikind:likes" title="Likes auf Beiträgen der letzten 7 Tage (Instagram, Facebook) und neue Likes auf Bluesky – zeigt deine letzten Beiträge">'+F.svg("mheart")+(li.likes?li.likes.toLocaleString("de-AT")+" Likes diese Woche":"Noch keine Likes diese Woche")+(li.fol?" · "+li.fol+(li.fol===1?" neuer Follower":" neue Follower"):"")+'</button>';
  if(!v.ld) lk='';
  var sort='<button type="button" class="mi-lnk" data-act="misort" title="Sortierung umschalten: '+(UI.mkInSort==="offen"?"Neueste zuerst":"Offene zuerst")+'">'+F.svg("msort")+(UI.mkInSort==="offen"?"Offene zuerst":"Neueste zuerst")+'</button>';
  var ra=unread?'<button type="button" class="mi-lnk" data-act="mireadall" title="Alle '+unread+' neuen Einträge als gelesen markieren">'+F.svg("mailOpen")+'<span class="mi-rl">Alle gelesen</span></button>':'';
  var busy=anyLoading();
  return '<div class="mi-meta">'+lk+'<span class="mi-sp"></span>'+sort+ra+'<button type="button" class="mi-lnk mi-rf'+(busy?" busy":"")+'" data-act="mireload"'+(busy?' disabled':'')+' title="Jetzt aktualisieren – holt Kommentare und Nachrichten frisch von den Plattformen" aria-label="Aktualisieren">'+F.svg("refresh")+'<span class="mi-stamp" id="miStamp">'+stampTxt(keys)+'</span></button></div>'; }
function rowHtml(r){ var i=r.it, nm=(i.from&&i.from.name)||"Unbekannt", pv=preview(i), un=i.isNew;
  return '<div class="mi-row'+(un?" unread":"")+(r.uid===UI.mkInSel?" sel":"")+'" role="button" tabindex="0" data-act="misel:'+esc(r.uid)+'" data-miit="'+esc(r.uid)+'" aria-current="'+(r.uid===UI.mkInSel)+'">'+avatar(nm,r.c.platform)+
    '<span class="mi-rm"><span class="mi-l1"><span class="mi-who" title="'+esc(nm+(i.from&&i.from.handle&&i.from.handle.replace(/^@/,"")!==nm?" ("+i.from.handle+")":""))+'">'+esc(nm)+'</span><span class="mi-when" title="'+esc(when(new Date(r.last).toISOString()))+'">'+ago(new Date(r.last).toISOString())+'</span></span>'+
    '<span class="mi-pre" title="'+esc(pv.t)+'">'+(pv.me?'<i>Du: </i>':'')+esc(String(pv.t||"").replace(/\s+/g," "))+'</span>'+
    '<span class="mi-l3"><i class="mi-dot" style="background:'+esc(r.b.color||"var(--ink-3)")+'"></i><span class="mi-bn" title="'+esc(r.b.name)+'">'+esc(r.b.name)+'</span><span>·</span><span class="mi-kd" title="'+esc(r.c.label)+'">'+kindLbl(i)+'</span><span class="mi-sp"></span><span class="mi-st '+r.st+'">'+ST_LBL[r.st]+'</span></span></span></div>'; }
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
      :empty(UI.mkInKind==="nachrichten"?"message":"minbox",UI.mkInKind==="nachrichten"?"Keine Nachrichten":UI.mkInKind==="kommentare"?"Keine Kommentare":"Noch nichts da","Sobald jemand kommentiert oder schreibt, erscheint es hier.","");
  } else body=v.list.map(rowHtml).join("");
  return '<section class="mi-lp" aria-label="Einträge">'+info+'<div class="mi-scroll" id="miList">'+body+'</div></section>'; }
function kindName(k){ return {offen:"Offen",kommentare:"Kommentare",nachrichten:"Nachrichten",alle:"Alle"}[k]||k; }
/* Links und E-Mail-Adressen im Text anklickbar (und nie mit Trennstrich umbrochen) */
function rich(t){ t=String(t||""); var re=/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]|[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,})/gi, out="", last=0, m;
  while((m=re.exec(t))){ var s=m[0], href=/^https?:/i.test(s)?s:"mailto:"+s; out+=esc(t.slice(last,m.index))+'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(s)+'</a>'; last=m.index+s.length; }
  return out+esc(t.slice(last)); }
function bubble(m,cls,extra,noName){ var nm=m.mine?"":(m.from&&m.from.name)||""; return '<div class="mi-b'+(m.mine?" me":"")+(cls?" "+cls:"")+'">'+(nm&&!noName?'<span class="mi-bwho">'+esc(nm)+'</span>':'')+'<div class="mi-bb">'+rich(m.text)+'</div><span class="mi-bmeta"><span title="'+esc(when(m.at))+'">'+(cls==="lead"||cls==="rep"?ago(m.at):hm(m.at))+'</span>'+(extra||"")+'</span></div>'; }
function threadHtml(r){
  var i=r.it, uid=esc(r.uid), nm=(i.from&&i.from.name)||"Unbekannt", hd=i.from&&i.from.handle||"", pu=profUrl(r.c.platform,i.from), busy=BUSY[i.id], s=r.st;
  var canDel=i.kind!=="message"&&["instagram","facebook","threads","youtube"].indexOf(r.c.platform)>-1, delT=r.c.platform==="threads"?"Auf Threads ausblenden":r.c.platform==="youtube"?"Auf YouTube ablehnen":"Auf "+r.c.label+" löschen";
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
      shown.map(function(m){ var dl=dayLbl(m.at), nd=dl!==lastDay, sep=nd?'<span class="mi-day">'+esc(dl)+'</span>':'', who=m.mine?"":(m.from&&m.from.name)||"", same=!nd&&who===lastWho; lastDay=dl; lastWho=who; return sep+bubble(m,"",null,same); }).join("");
  } else {
    var p=i.post, pu2=p&&/^https?:\/\//.test(p.url||"")?p.url:"", post=p&&(p.text||p.thumb||pu2)?(pu2?'<a class="mi-pctx" href="'+esc(pu2)+'" target="_blank" rel="noopener" title="'+esc(p.text||"Beitrag öffnen")+'">':'<div class="mi-pctx">')+
      (p.thumb?'<img src="'+esc(p.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="mi-ph">'+pfIcon(r.c.platform)+'</span>')+
      '<span class="mi-pt"><small>'+(r.c.platform==="youtube"?"Video auf YouTube":"Beitrag auf "+esc(r.c.label))+(p.at?" · "+ago(p.at):"")+'</small><span class="mi-cap">'+esc(p.text||(r.c.platform==="youtube"?"Kommentar zu deinem Video":"Ohne Text"))+'</span></span>'+(pu2?'<span class="mi-go">Zum Beitrag '+F.svg("external")+'</span></a>':'</div>'):'';
    var lk=(i.likes?'<span title="'+esc(i.likes)+' Likes">'+F.svg("mheart")+' '+esc(i.likes)+'</span>':'')+(i.can&&i.can.like?'<button type="button" class="mi-like" data-act="milike:'+uid+'"'+(i.liked||busy?' disabled':'')+'>'+F.svg("mheart")+(i.liked?"Gefällt dir":busy==="like"?"…":"Gefällt mir")+'</button>':'');
    tb=post+bubble({from:i.from,text:i.text,at:i.at,mine:i.mine},"lead",lk)+(i.replies||[]).map(function(x){ return bubble(x,"rep"); }).join("");
  }
  var lim=r.c.platform==="bluesky"?300:r.c.platform==="threads"?500:0, dr=DRAFT[r.uid]||"", ki=!!(F.mktPlan&&F.mktPlan()&&F.mktPlan().ki);
  var cmp=i.can&&i.can.reply?'<div class="mi-cmp"><div class="mi-cbox"><textarea rows="2" data-mirep="'+uid+'" data-keepfocus="mirep" data-mifocus="rep" data-lim="'+lim+'" placeholder="'+(i.kind==="message"?"Nachricht an ":"Antwort an ")+esc(nm)+' …" aria-label="Antwort schreiben">'+esc(dr)+'</textarea>'+
    '<div class="mi-cbar">'+(ki?'<button type="button" class="mi-ki" data-act="misuggest:'+uid+'"'+(busy==="ki"?' disabled':'')+' title="KI schreibt einen Vorschlag im Ton der Marke – Stichworte im Feld werden berücksichtigt. Du prüfst und sendest selbst.">'+F.svg("sparkle")+(busy==="ki"?"Schreibe …":"KI-Vorschlag")+'</button>':'')+
    '<span class="mi-sp"></span>'+(lim?'<span class="mi-cnt'+(dr.length>lim?" over":"")+'" data-micnt>'+dr.length+' / '+lim+'</span>':'')+'<span class="mi-hint">⌘↩ senden</span>'+
    '<button type="button" class="btn primary sm mi-send" data-act="misend:'+uid+'"'+(busy||(lim&&dr.length>lim)?' disabled':'')+' title="Senden (⌘↩)">'+F.svg("send")+(busy==="send"?" Sende …":" Senden")+'</button></div></div></div>'
    :'<div class="mi-cmp"><p class="mi-noreply">Antworten ist hier über die Schnittstelle nicht möglich – bitte direkt in der App von '+esc(r.c.label)+'.'+(pu?' <a href="'+esc(pu)+'" target="_blank" rel="noopener">Profil öffnen</a>':'')+'</p></div>';
  return '<div class="mi-thread" style="display:contents">'+head+'<div class="mi-tb" id="miThread">'+tb+'</div>'+cmp+'</div>'; }
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
  var keys=scopeKeys(), live=liveKeys();
  setTimeout(function(){ ensure(false); },0);
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
/* „Stand vor … Min.“ nachziehen und alle 3 Minuten still neu laden, solange der Posteingang offen ist */
setInterval(function(){ var s=document.getElementById("miStamp"); if(!s||document.hidden) return; s.innerHTML=stampTxt(scopeKeys()); if(!anyLoading()&&liveKeys().some(function(k){ return stale(k,3*60e3); })) ensure(false,3*60e3); },30e3);

/* ---------- Aktionen ---------- */
function itemOf(a){ var x=String(a||"").split("|"), d=BOX[x[0]]; if(!d||!d.channels) return null; var c=d.channels.find(function(c){ return c.platform===x[1]; }); var it=c&&c.items.find(function(i){ return i.id===x.slice(2).join("|"); }); return it?{key:x[0],platform:x[1],it:it,c:c,uid:a}:null; }
function setCnt(j){ if(j&&j.counts){ CNT=j.counts; tabPaint(); } }
function readItems(key,ids,all){ var d=BOX[key]; if(!d||!d.channels) return; d.channels.forEach(function(c){ c.items.forEach(function(i){ if(all||ids.indexOf(i.id)>-1) i.isNew=false; }); });
  api("/admin/api/mkt/inbox/act",{brand:key,op:all?"readall":"read",ids:ids}).then(setCnt).then(paintSoon); paintSoon(); }
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
F.action("miopen",function(k){ UI.mkInBrand=k||"alle"; F.ls("fsc_mkin_b",UI.mkInBrand); MENU=false; if(UI.mkInSel&&UI.mkInBrand!=="alle"&&UI.mkInSel.split("|")[0]!==UI.mkInBrand) UI.mkInSel=""; if(UI.mkInBrand!=="alle"&&stale(UI.mkInBrand)) load(UI.mkInBrand); paint(); });
F.action("mikind",function(k){ if(k==="likes"){ UI.mkInSel=""; UI.mkInPane="likes"; if(mob()&&!PUSHED){ try{ history.pushState({fscMi:1},""); PUSHED=true; }catch(e){} } paint(); return; }
  UI.mkInKind=k==="ungelesen"?"offen":(["offen","kommentare","nachrichten","alle"].indexOf(k)>-1?k:"offen"); if(UI.mkInPane==="likes"&&!mob()) UI.mkInPane=""; paint(); });
F.action("misort",function(){ UI.mkInSort=UI.mkInSort==="offen"?"neu":"offen"; F.ls("fsc_mkin_sort",UI.mkInSort); paint(); });
F.action("miqclear",function(){ UI.mkInQ=""; paint(); var q=document.querySelector("[data-miq]"); if(q&&!mob()) q.focus(); });
F.action("mireload",function(k){ if(k){ load(k,true); } else ensure(true); paint(); });
F.action("mireplan",function(){ if(F.mktPlanReload) F.mktPlanReload(); });
F.action("misend",function(a){ var o=itemOf(a); if(!o) return; var ta=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'), txt=(ta?ta.value:DRAFT[a]||"").trim(); if(!txt) return F.toast("Bitte zuerst einen Text schreiben",true);
  DRAFT[a]=ta?ta.value:txt; BUSY[o.it.id]="send"; paint();
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"reply",text:txt}).then(function(j){ delete BUSY[o.it.id];
    if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||"Senden fehlgeschlagen",true); }
    var i=o.c.items.indexOf(o.it); o.c.items[i]=Object.assign(j.item,{isNew:false,done:o.it.done}); delete DRAFT[a]; paint(); F.toast("Gesendet"); }); });
F.action("milike",function(a){ var o=itemOf(a); if(!o) return; BUSY[o.it.id]="like"; paint();
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"like"}).then(function(j){ delete BUSY[o.it.id]; if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||"Liken fehlgeschlagen",true); } o.it.liked=true; paint(); }); });
F.action("misuggest",function(a){ var o=itemOf(a); if(!o) return; var ta=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'), hint=ta?ta.value.trim():""; BUSY[o.it.id]="ki"; paint();
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"suggest",hint:hint}).then(function(j){ delete BUSY[o.it.id];
    if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||"KI-Vorschlag fehlgeschlagen",true); }
    DRAFT[a]=j.text; paint(); var t=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'); if(t){ t.focus(); try{ t.setSelectionRange(t.value.length,t.value.length); }catch(e){} } }); });
F.action("miread",function(a){ var o=itemOf(a); if(o) readItems(o.key,[o.it.id]); });
F.action("mireadall",function(){ scopeKeys().forEach(function(k){ var d=BOX[k]; if(d&&d.channels&&d.channels.some(function(c){ return c.items.some(function(i){ return i.isNew; }); })) readItems(k,[],true); }); });
F.action("mimore",function(a){ var o=itemOf(a); if(!o) return; OPEN[o.it.id]=1; paint(); });
function setDone(a,done){ var o=itemOf(a); if(!o) return; var nx=done&&UI.mkInKind==="offen"?a:"";
  o.it.done=done; o.it.isNew=false; if(nx) advance(a); else paint();
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:done?"done":"open"}).then(function(j){ if(!j||!j.ok){ o.it.done=!done; paint(); return F.toast((j&&j.error)||"Fehler",true); } setCnt(j); paintSoon(); });
  F.toast(done?"Erledigt":"Wieder offen",false,done?"Rückgängig":"",done?function(){ setDone(a,false); }:null); }
F.action("midone",function(a){ setDone(a,true); });
F.action("mireopen",function(a){ setDone(a,false); });
var gone=function(o){ o.c.items=o.c.items.filter(function(i){ return i.id!==o.it.id; }); };
F.action("mihide",function(a){ var o=itemOf(a); if(!o) return; api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"hide"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true);
  var sel=UI.mkInSel===a, n=sel&&!mob()?nextAfter(a):""; gone(o); if(sel){ if(mob()) advance(a); else if(n) select(n); else closeSel(); } else paint(); loadCounts(); F.toast("Ausgeblendet"); }); });
F.action("midel",function(a){ var o=itemOf(a); if(!o) return; F.confirm("Diesen Kommentar von "+((o.it.from&&o.it.from.name)||"")+" auf "+o.c.label+(o.platform==="threads"?" ausblenden":o.platform==="youtube"?" ablehnen (wird ausgeblendet)":" endgültig löschen")+"?",o.platform==="instagram"||o.platform==="facebook"?"Löschen":"Ausblenden",function(){
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"delete"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Löschen fehlgeschlagen",true);
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
  render:function(){ if(!CNT&&!CNTREQ) loadCounts(); if(F.mktPlan&&!F.mktPlan()&&F.mktPlanReload) F.mktPlanReload(); var h=body(); return '<div id="miRoot">'+h+'</div>'; },
  after:function(){ after(); }});
})();
