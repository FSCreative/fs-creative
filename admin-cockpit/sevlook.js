/* Finanzen im sevDesk-Look: Navy-Schrift, Indigo als Hauptfarbe, Koralle für Warnungen, warmes Off-White, Karten mit feinem Rahmen.
   Gilt nur, solange „Finanzen“ offen ist (body[data-view="geld"]) – inkl. Dialoge und Seitenleiste, die von dort geöffnet werden. */
(function(){
"use strict";
var F=window.FSC;
var S='body[data-view="geld"]';
var SC=S+' main,'+S+' #drawer,'+S+' #modalHost';
var LIGHT='--ground:#faf8f8;--panel:#ffffff;--sunk:#f5f2f2;--line:#ebebeb;--ink:#212144;--ink-2:#5e5e74;--ink-3:#8b8ba0;'+
  '--glow:#534acc;--glow-ink:#2e2780;--glow-soft:#ecedfe;--on-glow:#ffffff;--sel:#ecedfe;'+
  '--ok:#1e8e5a;--ok-soft:#e3f6ec;--warn:#b86a00;--warn-soft:#fff3df;--bad:#e5432f;--bad-soft:#ffebe7;--info:#534acc;--info-soft:#ecedfe;'+
  '--m-blue:#534acc;--m-red:#fb523b;--shadow:none;';
var DARK='--ground:#14142a;--panel:#1c1c37;--sunk:#25254a;--line:#2e2e56;--ink:#ececf6;--ink-2:#b9b9d2;--ink-3:#8c8cad;'+
  '--glow:#8c84ff;--glow-ink:#d2ceff;--glow-soft:#2a2862;--on-glow:#0f0f24;--sel:#2a2862;'+
  '--ok:#4cc38a;--ok-soft:#123327;--warn:#f0b04a;--warn-soft:#3a2b10;--bad:#ff7a66;--bad-soft:#3d1c18;--info:#8c84ff;--info-soft:#2a2862;'+
  '--m-blue:#7d74ff;--m-red:#ff6a52;--shadow:none;';
var M=S+' main';
F.css(
  SC+'{'+LIGHT+'}'+
  '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) '+SC.split(",").join(',:root:not([data-theme="light"]) ')+'{'+DARK+'}}'+
  ':root[data-theme="dark"] '+SC.split(",").join(',:root[data-theme="dark"] ')+'{'+DARK+'}'+
  M+'{background:var(--ground);color:var(--ink)}'+
  S+'{background:var(--ground)}'+
  /* Kopf */
  M+' .head h1{font-weight:700;letter-spacing:-.02em;color:var(--ink)}'+
  M+' .head h1:after{content:"sevdesk";display:inline-block;margin-left:10px;vertical-align:5px;font:700 11px/1 var(--f-body);letter-spacing:.02em;color:#fff;background:var(--m-red);border-radius:5px;padding:4px 7px}'+
  M+' .head p{color:var(--ink-2)}'+
  /* Karten */
  M+' .panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:none}'+
  M+' .panel-h{border-bottom:1px solid var(--line)}'+
  M+' .panel-h h2{font-weight:700;color:var(--ink)}'+
  /* Kennzahlen */
  M+' .kpi{padding:18px 20px;gap:6px}'+
  M+' .kpi .k{text-transform:none;letter-spacing:0;font-size:13px;font-weight:500;color:var(--ink-2)}'+
  M+' .kpi .v{font-size:26px;font-weight:700;color:var(--ink);letter-spacing:-.02em}'+
  M+' button.kpi:hover{border-color:var(--glow)}'+
  /* Knöpfe */
  M+' .btn,'+S+' #drawer .btn,'+S+' #modalHost .btn{border-radius:8px;border-color:#e1e1e3;font-weight:600}'+
  M+' .btn.primary,'+S+' #drawer .btn.primary,'+S+' #modalHost .btn.primary{background:var(--glow);border-color:var(--glow);color:var(--on-glow)}'+
  M+' .btn.danger,'+S+' #drawer .btn.danger,'+S+' #modalHost .btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}'+
  /* Reiter wie in sevDesk */
  M+' .subnav{border-bottom:1px solid var(--line);gap:2px}'+
  M+' .subnav button{font-weight:600;color:var(--ink-2);border-bottom:2px solid transparent;padding:10px 14px}'+
  M+' .subnav button[aria-current="true"]{color:var(--glow);border-color:var(--glow);background:none}'+
  /* Chips */
  M+' .chip{border-radius:99px;border-color:var(--line);color:var(--ink-2);font-weight:600}'+
  M+' .chip[aria-pressed="true"]{background:var(--glow-soft);color:var(--glow-ink);border-color:transparent}'+
  /* Status-Pillen */
  S+' :is(main,#drawer,#modalHost) .tag{border-radius:99px;font-weight:600;padding:3px 10px}'+
  /* Tabellen & Listen */
  M+' th{background:var(--ground);font-size:11px;letter-spacing:.06em;color:var(--ink-3)}'+
  M+' tbody tr:hover td{background:var(--sunk)}'+
  M+' .sd-row:hover{background:var(--sunk)}'+
  M+' .sd-row .amt,'+M+' .amt{color:var(--ink);font-weight:700}'+
  M+' .sd-sug{border-color:var(--glow);background:var(--glow-soft);color:var(--glow-ink)}'+
  M+' input.f,'+M+' select.f,'+S+' #drawer input.f,'+S+' #modalHost input.f,'+S+' #modalHost select.f,'+S+' #modalHost textarea.f{border-radius:8px}'+
  /* Diagramme: Indigo, aktueller Monat in Koralle */
  M+' .chart rect[fill="var(--ink)"]{fill:var(--glow)}'+
  M+' .chart rect[fill="var(--glow)"]{fill:var(--m-red)}'+
  /* „Zu tun“-Kacheln ruhig, mit Farbstreifen links */
  M+' .todo button{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--line);box-shadow:none}'+
  M+' .todo button.bad{border-left-color:var(--m-red)}'+M+' .todo button.warn{border-left-color:var(--warn)}'+M+' .todo button.info{border-left-color:var(--glow)}'+
  M+' .todo button:hover{transform:none;box-shadow:none;border-color:var(--glow)}'+
  M+' .bill .c{border-radius:12px;border-color:var(--line)}'+
  M+' .notice{background:var(--warn-soft);border-radius:10px}'+
  /* Seitenleiste & Dialoge */
  S+' #drawer{background:var(--panel);color:var(--ink)}'+
  S+' #modalHost .dialog{background:var(--panel);color:var(--ink);border-radius:14px}'+
  S+' .sd-hero .big{color:var(--ink)}'+
  S+' .sd-steps span.on{background:var(--glow-soft);color:var(--glow-ink)}'+
  /* Handy */
  '@media (max-width:900px){'+M+' .head h1:after{display:none}'+M+' .mh-t b:after{content:"sevdesk";display:inline-block;margin-left:8px;vertical-align:3px;font:700 10px/1 var(--f-body);color:#fff;background:var(--m-red);border-radius:4px;padding:3px 6px}}'
);
})();
