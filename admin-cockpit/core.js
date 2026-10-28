/* FS Cockpit – Kern: Daten laden, Navigation, Registrierung von Ansichten/Aktionen, gemeinsame Dialoge.
   Jede Ansicht liegt in einer eigenen Datei (admin-cockpit/*.js) und meldet sich über FSC.view(...) an. */
(function(){
"use strict";
var FSC = window.FSC = { D:null, UI:{}, year:String(new Date().getFullYear()), current:"heute", loadErr:"", busy:false };

/* ---------- Hilfen ---------- */
FSC.icons = {
  heute:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  kunden:'<circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 4.8a3.2 3.2 0 0 1 0 6.4M18 13.8c1.9.7 3 2.6 3 5.2"/>',
  geld:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
  post:'<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="m4 7.5 8 5.6 8-5.6"/>',
  kal:'<rect x="3.5" y="5" width="17" height="15" rx="2.4"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  web:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/>',
  plat:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
  lead:'<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  euro:'<path d="M17 6.5A6.5 6.5 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
  alert:'<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17v.01"/>',
  check:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  bank:'<path d="M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  more:'<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  /* Alpenglas: gemeinsamer Symbolsatz für alle Module (F.svg(name)) – 24×24, Strich 1.9, runde Enden */
  plug:'<path d="M9 3v5M15 3v5"/><path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z"/><path d="M12 17v4"/>',
  link:'<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  inbox:'<path d="M3.5 13.5 6 5.5h12l2.5 8V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z"/><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5"/>',
  mailOpen:'<path d="M3.5 10 12 4.5 20.5 10v8.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="m4 10.5 8 5.5 8-5.5"/>',
  reply:'<path d="M9.5 6 4 11.5 9.5 17"/><path d="M4.5 11.5H14a6 6 0 0 1 6 6V19"/>',
  replyAll:'<path d="M8 7 3.5 11.5 8 16"/><path d="M12.5 7 8 11.5l4.5 4.5"/><path d="M8.5 11.5H15a5.5 5.5 0 0 1 5.5 5.5v1.5"/>',
  forward:'<path d="M14.5 6 20 11.5 14.5 17"/><path d="M19.5 11.5H10a6 6 0 0 0-6 6V19"/>',
  archive:'<rect x="3" y="4.5" width="18" height="4.5" rx="1.2"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9"/><path d="M10 13h4"/>',
  trash:'<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="m6 7 1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"/><path d="M10 11v6M14 11v6"/>',
  star:'<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  flag:'<path d="M5 21V4"/><path d="M5 4.5h11l-2 4 2 4H5"/>',
  clip:'<path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"/>',
  send:'<path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4.5-7-7-4.5z"/>',
  sparkle:'<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/><path d="M18.5 15.5c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8z"/>',
  filter:'<path d="M3.5 5h17l-6.5 7.5V19l-4 2v-8.5z"/>',
  chevR:'<path d="m9 5 7 7-7 7"/>',
  chevL:'<path d="m15 5-7 7 7 7"/>',
  chevD:'<path d="m5 9 7 7 7-7"/>',
  checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8 5.4-5.5"/>',
  xCircle:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  alertCircle:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13M12 16.5v.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  cloud:'<path d="M7 18.5h10.5a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.3 10.6 4 4 0 0 0 7 18.5z"/>',
  server:'<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7.5 7.5h.01M7.5 16.5h.01M11 7.5h5M11 16.5h5"/>',
  shield:'<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16.5 6.5 19 9M14 9l2 2"/>',
  bell:'<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  phone:'<path d="M5 3.5h3.5l1.8 4.6-2.3 1.4a11 11 0 0 0 6.5 6.5l1.4-2.3 4.6 1.8V19a1.5 1.5 0 0 1-1.5 1.5A16.5 16.5 0 0 1 3.5 5 1.5 1.5 0 0 1 5 3.5z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>',
  building:'<path d="M4.5 21V5A1.5 1.5 0 0 1 6 3.5h8A1.5 1.5 0 0 1 15.5 5v16"/><path d="M15.5 9.5H18a1.5 1.5 0 0 1 1.5 1.5v10"/><path d="M3 21h18M8 7.5h4M8 11h4M8 14.5h4"/>',
  chart:'<path d="M4 4v16h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  wallet:'<path d="M3.5 8A2.5 2.5 0 0 1 6 5.5h11.5V8"/><rect x="3.5" y="8" width="17" height="11.5" rx="2.5"/><circle cx="16.3" cy="13.8" r="1.2"/>',
  card:'<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  printer:'<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="2"/><path d="M7 14h10v6.5H7zM17 11.5h.01"/>',
  box:'<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
  truck:'<path d="M2.5 5.5h11V16h-11z"/><path d="M13.5 9.5h4l3 3.5V16h-7"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  tag:'<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.5"/>',
  pin:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  cloudSun:'<path d="M8 3.5v1.2M3.6 8H2.4M4.9 4.9l.9.9M12.1 4.9l-.9.9"/><path d="M5.6 10.6A3.5 3.5 0 1 1 11.6 7"/><path d="M8.5 20h9a3.5 3.5 0 0 0 .5-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 8.5 20z"/>',
  snow:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
  rain:'<path d="M7 15.5h10.5a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.3 7.6 4 4 0 0 0 7 15.5z"/><path d="m8 18.5-1 2M12.5 18.5l-1 2M17 18.5l-1 2"/>',
  fog:'<path d="M7 13.5h10.5a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.3 5.6 4 4 0 0 0 7 13.5z"/><path d="M4 17h16M6 20.5h12"/>',
  storm:'<path d="M7 15.5h10.5a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.3 7.6 4 4 0 0 0 7 15.5z"/><path d="m12.5 13-2 4h3l-2 4"/>',
  copy:'<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  edit:'<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  download:'<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  upload:'<path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 19.5h15"/>',
  eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff:'<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.3 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.2-1"/><path d="M9.9 10a2.8 2.8 0 0 0 4 4"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  history:'<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 8v4.5l3 1.8"/>',
  sliders:'<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  zap:'<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/>',
  database:'<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  message:'<path d="M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.1-4.2A8.5 8.5 0 1 1 20.5 12z"/>',
  whatsapp:'<path d="M4 20.5l1.2-4.1A8.5 8.5 0 1 1 8.6 19.6z"/><path d="M9.2 8.2c.3 2.9 3.6 6.2 6.6 6.6l1.1-1.5-2.1-1.2-1 .8c-1-.4-2.3-1.7-2.7-2.7l.8-1-1.2-2.1z"/>',
  instagram:'<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>',
  facebook:'<path d="M14.5 21v-7.5h2.8l.4-3.2h-3.2V8.4c0-.9.3-1.6 1.6-1.6h1.7V4a20 20 0 0 0-2.5-.1c-2.5 0-4.1 1.5-4.1 4.2v2.2H8.4v3.2h2.8V21"/>',
  linkedin:'<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V16M8 7.5v.01M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.4-2.6s2.1.9 2.1 2.6v3"/>',
  youtube:'<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10.5 9.5 4.5 2.5-4.5 2.5z"/>',
  google:'<path d="M20.5 12.2c0 4.8-3.4 8.3-8.4 8.3a8.5 8.5 0 1 1 5.8-14.7"/><path d="M12.3 12.2h8.2"/>',
  home:'<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h3.5v-5h3v5H17a1.5 1.5 0 0 0 1.5-1.5V9.5"/>'
};
FSC.icons.eyeoff=FSC.icons.eyeOff;   // ältere Schreibweise (globals.js)
FSC.svg = function(k){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(FSC.icons[k]||"")+'</svg>'; };
FSC.esc = function(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); };
FSC.eur = function(n){ return (+n||0).toLocaleString("de-AT",{style:"currency",currency:"EUR"}); };
FSC.eur0 = function(n){ return (+n||0).toLocaleString("de-AT",{style:"currency",currency:"EUR",maximumFractionDigits:0}); };
FSC.de = function(iso){ var m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?m[3]+"."+m[2]+"."+m[1]:""; };
FSC.deShort = function(iso){ var m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?m[3]+"."+m[2]+".":""; };
FSC.ymd = function(d){ d=d||new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
FSC.ago = function(iso){ var t=Date.parse(iso); if(!t) return ""; var s=(Date.now()-t)/1000; if(s<90) return "gerade eben"; if(s<3600) return "vor "+Math.round(s/60)+" Min."; if(s<86400) return "vor "+Math.round(s/3600)+" Std."; var d=Math.round(s/86400); return d===1?"gestern":"vor "+d+" Tagen"; };
FSC.dayLabel = function(iso,today){ if(iso===today) return "Heute"; var t=new Date(today+"T12:00:00"); t.setDate(t.getDate()+1); if(iso===FSC.ymd(t)) return "Morgen"; var d=new Date(iso+"T12:00:00"); return d.toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long"}); };
FSC.ls = function(k,v){ try{ if(v===undefined) return JSON.parse(localStorage.getItem(k)||"null"); localStorage.setItem(k,JSON.stringify(v)); }catch(e){ return null; } };
FSC.api = function(path,opts){
  opts=opts||{};
  return fetch(path,{method:opts.method||(opts.body?"POST":"GET"),headers:opts.body?{"Content-Type":"application/json"}:{},body:opts.body?JSON.stringify(opts.body):undefined,cache:"no-store",credentials:"same-origin"})
    .then(function(r){ if(r.redirected&&/\/admin\/login/.test(r.url)){ location.href="/admin/login"; throw new Error("login"); } return r.json().catch(function(){ return {ok:false,error:"HTTP "+r.status}; }).then(function(j){ if(j&&typeof j==="object"&&!r.ok&&j.ok===undefined) j.ok=false; return j; }); });
};
var tt;
FSC.toast = function(msg,bad,actLabel,actFn){
  var t=document.getElementById("toast");
  t.innerHTML='<span>'+FSC.esc(msg)+'</span>'+(actLabel?'<button type="button" class="ta">'+FSC.esc(actLabel)+'</button>':'');
  if(actLabel) t.querySelector(".ta").onclick=function(){ t.className="toast"; if(actFn) actFn(); };
  t.className="toast on"+(bad?" bad":"")+(actLabel?" act":"");
  clearTimeout(tt); tt=setTimeout(function(){ t.className="toast"; },actLabel?6500:(bad?4500:2400));
};
FSC.head = function(t,sub,right){ return '<div class="head"><div><h1>'+t+'</h1>'+(sub?'<p>'+sub+'</p>':'')+'</div>'+(right?'<div class="head-r">'+right+'</div>':'')+'</div>'; };
FSC.btnClose = function(attr){ return '<button type="button" class="btn icon" '+(attr||"data-closemodal")+' aria-label="Schließen">'+FSC.svg("close")+'</button>'; };

/* Module können eigene Styles mitbringen */
FSC.css = function(text){ var s=document.createElement("style"); s.textContent=text; document.head.appendChild(s); };
/* Beträge ausblenden (z. B. beim Bildschirm teilen) */
FSC.priv = function(on){ if(on!==undefined) FSC.ls("fsc_priv",!!on); var v=!!FSC.ls("fsc_priv"); document.body.classList.toggle("priv",v); return v; };

/* ---------- Registrierung ---------- */
FSC.views = [];           // {id,label,short,icon,order,mobile,count(),render(),after()}
FSC.view = function(v){ FSC.views.push(v); FSC.views.sort(function(a,b){ return (a.order||50)-(b.order||50); }); };
FSC.actions = {};         // data-act="name:arg" → fn(arg, el, event)
FSC.action = function(name,fn){ FSC.actions[name]=fn; };
FSC.forms = {};           // <form data-form="kind"> → fn(form, event)
FSC.form = function(kind,fn){ FSC.forms[kind]=fn; };
FSC.feeds = [];           // Lieferanten für "Heute": fn() → [{id,rank,sev,icon,tag:[cls,txt],t,d,acts:[[label,act,cls]]}]
FSC.feed = function(fn){ FSC.feeds.push(fn); };
FSC.listeners = [];       // {type, sel, fn}
FSC.listen = function(type,sel,fn){ FSC.listeners.push({type:type,sel:sel,fn:fn}); };
FSC.dataHooks = [];       // nach jedem Laden
FSC.onData = function(fn){ FSC.dataHooks.push(fn); };
FSC.searchers = [];       // Schnellsuche: fn(q) → [{group,label,sub,act}]
FSC.searcher = function(fn){ FSC.searchers.push(fn); };

FSC.action("priv",function(){ var v=FSC.priv(!FSC.priv()); FSC.toast(v?"Beträge ausgeblendet":"Beträge sichtbar"); });

/* ---------- Laden ---------- */
FSC.load = function(force){
  if(FSC.busy) return Promise.resolve(); FSC.busy=true;
  return FSC.api("/admin/api/cockpit?year="+FSC.year+(force?"&force=1":"")).then(function(d){
    FSC.busy=false; if(!d||d.error||d.ok===false){ FSC.loadErr=(d&&d.error)||"Fehler"; } else { FSC.D=d; FSC.loadErr=""; FSC.dataHooks.forEach(function(h){ try{ h(d); }catch(e){ console.error(e); } }); }
    FSC.render(); runDeep();   // Deep-Link-Aktion (#ansicht/aktion:arg) erst mit Daten
    /* Server hat den letzten Stand sofort geliefert und aktualisiert im Hintergrund → kurz danach still nachladen */
    if(d&&d.stale){ clearTimeout(FSC._staleT); FSC._staleT=setTimeout(function(){ if(!document.hidden) FSC.load(false); },4000); }
  }).catch(function(e){ FSC.busy=false; if(String(e.message)!=="login"){ FSC.loadErr="Keine Verbindung zum Server."; FSC.render(); } });
};

/* ---------- Heute-Liste (aus allen Modulen) ---------- */
var SNOOZE_KEY="fsc_cockpit_snooze";
FSC.snoozed = function(){ var s=FSC.ls(SNOOZE_KEY)||{}; return FSC.D&&s.day===FSC.D.today?(s.ids||{}):{}; };
FSC.snooze = function(id){ var t=FSC.D.today, s=FSC.ls(SNOOZE_KEY)||{}; if(s.day!==t) s={day:t,ids:{}}; s.ids[id]=1; FSC.ls(SNOOZE_KEY,s); FSC.render(); };
FSC.feedItems = function(){
  if(!FSC.D) return []; var out=[], sz=FSC.snoozed();
  FSC.feeds.forEach(function(f){ try{ out=out.concat(f()||[]); }catch(e){ console.error(e); } });
  return out.filter(function(x){ return !sz[x.id]; }).sort(function(a,b){ return a.rank-b.rank; });
};

/* ---------- Navigation ---------- */
function navCount(v){ try{ return FSC.D&&v.count?v.count():0; }catch(e){ return 0; } }
/* Symbole in Leiste/Reitern/„Mehr“: wo es hilft, ein klareres aus dem gemeinsamen Satz (sonst das der Ansicht) */
var NAVI={post:"inbox",geld:"wallet",ki:"sparkle"};
FSC.navIcon = function(v){ var k=NAVI[v.id]; return FSC.svg(k&&FSC.icons[k]?k:v.icon); };
/* Gestörte Verbindungen (F.D.connections, Kurzfassung vom Server): roter Punkt unten in der Leiste und auf „Mehr“ */
FSC.connErrors = function(){ var c=FSC.D&&FSC.D.connections; return c&&+c.error>0?+c.error:0; };
function connTitle(n){
  var c=FSC.D&&FSC.D.connections, l=(c&&Array.isArray(c.problems)?c.problems:[]).filter(function(p){ return p&&p.state==="error"; }).map(function(p){ return p.label||p.key; }).filter(Boolean).slice(0,3);
  return (n===1?"1 Verbindung gestört":n+" Verbindungen gestört")+(l.length?": "+l.join(", "):"")+" – ansehen";
}
function setHtml(el,html){ if(el&&el._h!==html){ el.innerHTML=html; el._h=html; return true; } return false; }   // nur bei Änderung neu aufbauen (Hover/Tropfen bleiben ruhig)
FSC.renderNav = function(){
  var cur=FSC.current, bad=FSC.connErrors(), act=FSC.actions.conn?"conn":"settings";
  /* Seitenleiste in Gruppen; Seiten ohne Gruppe landen unter „System“ */
  var RL={viw:"VIW Cloud",mkt:"Marketing",post:"Postfach",web:"Websites",plat:"Plattformen",kunden:"Kunden",kal:"Kalender",geld:"Finanzen",print:"Druckshop",legal:"Rechtliches"};
  var GRP=[["Arbeit",["heute","auftraege","post","kal","chat","viw","mkt"]],["Kunden & Geld",["kunden","geld","print"]],["System",["web","plat","legal","ki"]]];
  var vis=FSC.views.filter(function(v){return !v.hidden;}), used={};
  var btn=function(v){ var c=navCount(v); return '<button type="button" class="nav-btn" data-go="'+v.id+'" title="'+FSC.esc(v.label)+'"'+(v.id===cur?' aria-current="page"':'')+'>'+FSC.navIcon(v)+'<span class="nl">'+FSC.esc(RL[v.id]||v.short||v.label)+'</span>'+(c?'<span class="count">'+c+'</span>':'')+'</button>'; };
  var groups=GRP.map(function(g){ return [g[0],g[1].map(function(id){ return vis.find(function(v){ return v.id===id; }); }).filter(Boolean)]; });
  groups.forEach(function(g){ g[1].forEach(function(v){ used[v.id]=1; }); });
  vis.forEach(function(v){ if(!used[v.id]) groups[groups.length-1][1].push(v); });
  setHtml(document.getElementById("nav"),groups.filter(function(g){ return g[1].length; }).map(function(g){ return '<div class="nav-g">'+FSC.esc(g[0])+'</div>'+g[1].map(btn).join(""); }).join(""));
  var mob=FSC.views.filter(function(v){return v.mobile;}).slice(0,5);
  var inMob=mob.some(function(v){return v.id===cur;});
  setHtml(document.getElementById("tabItems")||document.getElementById("tabbar"),mob.map(function(v){ var c=navCount(v); return '<button type="button" data-go="'+v.id+'"'+(v.id===cur?' aria-current="page"':'')+'>'+FSC.navIcon(v)+'<span>'+FSC.esc(v.short||v.label)+'</span>'+(c?'<span class="count">'+c+'</span>':'')+'</button>'; }).join("")+
    '<button type="button" data-act="moresheet"'+(!inMob?' aria-current="page"':'')+(bad?' title="'+FSC.esc(connTitle(bad))+'"':'')+'>'+FSC.svg("more")+'<span>Mehr</span>'+(bad?'<i class="tb-dot" aria-hidden="true"></i>':'')+'</button>');
  var me=document.getElementById("railMe"), sub=document.getElementById("railSub"), dot=me&&me.querySelector(".ru-dot");
  if(me){ me.title=bad?connTitle(bad):"Einstellungen"; me.setAttribute("data-act",bad?act:"settings"); me.classList.toggle("bad",!!bad); if(dot) dot.hidden=!bad;
    if(sub) sub.textContent=bad?(bad===1?"Verbindung gestört":bad+" Verbindungen gestört"):"FS Creative"; }
  var st=document.getElementById("stamp"); if(st) st.textContent=FSC.D?"Stand "+new Date(FSC.D.fetchedAt).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}):"";
  if(FSC.lqSync) FSC.lqSync();
};
/* Scrollpositionen innerer Bereiche (Mailliste, Tabellen, Lesebereich …) über ein Neuzeichnen hinweg behalten */
FSC.scrollSnap=function(root){ var out={}, seen={}; Array.prototype.forEach.call(root.querySelectorAll("*"),function(el){ if(!(el.scrollTop>0||el.scrollLeft>0)) return; var k=el.tagName+"."+(el.className||"")+(el.id?"#"+el.id:""), n=seen[k]=(seen[k]||0)+1; out[k+"@"+n]=[el.scrollTop,el.scrollLeft]; }); return out; };
FSC.scrollRestore=function(root,snap){ if(!snap) return; var keys=Object.keys(snap); if(!keys.length) return; var seen={};
  Array.prototype.forEach.call(root.querySelectorAll("*"),function(el){ var k=el.tagName+"."+(el.className||"")+(el.id?"#"+el.id:""), n=seen[k]=(seen[k]||0)+1, v=snap[k+"@"+n]; if(v){ el.scrollTop=v[0]; el.scrollLeft=v[1]; } }); };
/* is-scrolled an <html>: Kopfzeile bekommt erst beim Scrollen ihr Glas (oben bleibt der Blick aufs Bergfoto frei) */
var scrF=0; function scrFlag(){ scrF=0; var on=window.scrollY>4, de=document.documentElement; if(de.classList.contains("is-scrolled")!==on) de.classList.toggle("is-scrolled",on); }
FSC._scrollAt=0; window.addEventListener("scroll",function(){ FSC._scrollAt=Date.now(); if(!scrF) scrF=requestAnimationFrame(scrFlag); },{passive:true});
document.addEventListener("touchmove",function(){ FSC._scrollAt=Date.now(); },{passive:true});
/* Eigene Aktionen (Klick, Taste, Eingabe) nie verzögern – nur automatische Aktualisierungen warten aufs Scroll-Ende */
FSC._userAt=0; ["click","keydown","input","change","submit"].forEach(function(t){ document.addEventListener(t,function(){ FSC._userAt=Date.now(); },true); });
FSC.render = function(){
  FSC.renderNav();
  var main=document.getElementById("main");
  if(!FSC.D){ main.innerHTML='<div class="loading">'+(FSC.loadErr?FSC.esc(FSC.loadErr)+' <button class="btn" data-act="reload">Erneut versuchen</button>':'Lade deine Daten …')+'</div>'; return; }
  var v=FSC.views.find(function(x){return x.id===FSC.current;})||FSC.views[0];
  var ae=document.activeElement, keep=ae&&ae.getAttribute&&ae.getAttribute("data-keepfocus"), selS=keep&&ae.selectionStart;
  var y=window.scrollY, samev=FSC._lastView===v.id;
  /* Während gescrollt wird nicht neu aufbauen (bricht Scrollen ab, v. a. iPhone/Trackpad) – kurz danach nachholen */
  if(samev&&Date.now()-FSC._scrollAt<900&&!FSC._forceRender&&Date.now()-FSC._userAt>1500){ clearTimeout(FSC._deferT); FSC._deferT=setTimeout(FSC.render,950); return; }
  FSC._forceRender=false;
  var html; try{ html='<div class="view view-'+v.id+'">'+v.render()+'</div>'; }catch(e){ html='<div class="loading">Fehler beim Anzeigen: '+FSC.esc(e.message)+'</div>'; console.error(e); }
  /* Unveränderter Inhalt: DOM nicht anfassen (keine Sprünge, Eingaben bleiben) */
  if(samev&&html===FSC._lastHtml&&main.firstChild){ if(FSC.drawerRefresh&&document.getElementById("drawer").classList.contains("on")) FSC.drawerRefresh(); if(FSC.renderSide) try{ FSC.renderSide(); }catch(e){} return; }
  FSC._lastView=v.id; FSC._lastHtml=html; document.body.setAttribute("data-view",v.id);
  var inner=FSC.scrollSnap(main);
  main.innerHTML=html; try{ if(v.after) v.after(); }catch(e){ console.error(e); }
  if(keep){ var q=main.querySelector('[data-keepfocus="'+keep+'"]'); if(q){ q.focus({preventScroll:true}); try{ q.setSelectionRange(selS,selS); }catch(e){} } }
  if(samev) FSC.scrollRestore(main,inner);
  window.scrollTo(0,y);
  if(FSC.drawerRefresh&&document.getElementById("drawer").classList.contains("on")) FSC.drawerRefresh();
  if(FSC.renderSide) try{ FSC.renderSide(); }catch(e){ console.error(e); }   // Statusleiste rechts (zside.js)
};
FSC.go = function(id){ FSC._forceRender=true; FSC.current=id; try{ history.replaceState(null,"","#"+id); }catch(e){} FSC.closeDrawer(); FSC.closeModal(); FSC.render(); window.scrollTo(0,0); };

/* ---------- Drawer & Dialoge ---------- */
FSC.openDrawer = function(html,refresh){ var d=document.getElementById("drawer"); d.innerHTML=html; d.classList.add("on"); d.setAttribute("aria-hidden","false"); document.getElementById("scrim").classList.add("on"); FSC.drawerRefresh=refresh||null; var c=d.querySelector("[data-close]"); if(c) c.focus(); };
FSC.closeDrawer = function(){ var d=document.getElementById("drawer"); d.classList.remove("on"); d.setAttribute("aria-hidden","true"); document.getElementById("scrim").classList.remove("on"); FSC.drawerRefresh=null; };
FSC.modal = function(html,cls){ document.getElementById("modalHost").innerHTML='<div class="modal" role="dialog" aria-modal="true"><div class="dialog '+(cls||"")+'">'+html+'</div></div>'; var touch=window.matchMedia&&matchMedia("(hover:none)").matches, f=touch?null:(document.querySelector("#modalHost [autofocus]")||document.querySelector("#modalHost input:not([type=hidden]),#modalHost textarea,#modalHost select"));   /* am Handy springt keine Tastatur auf – erst beim Antippen eines Felds */ if(f) setTimeout(function(){ f.focus(); },30); };
FSC.closeModal = function(){ document.getElementById("modalHost").innerHTML=""; };
FSC.modalOpen = function(){ return !!document.getElementById("modalHost").innerHTML; };
/* Bestätigung im Dialog (confirm() wird nicht verwendet) */
FSC.confirm = function(text,okLabel,fn,danger){
  FSC.modal('<h2 style="font-size:19px">'+FSC.esc(text)+'</h2><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="button" class="btn '+(danger?"danger":"primary")+'" id="cfOk">'+FSC.esc(okLabel||"OK")+'</button></span></div>',"narrow");
  document.getElementById("cfOk").onclick=function(){ FSC.closeModal(); fn(); };
};

/* ---------- Darstellung: Alpenglas (Standard) / Dunkel / Hell / Wie System ---------- */
FSC.THEMES=[["glas","Alpenglas"],["dark","Dunkel"],["light","Hell"],["auto","Wie System"]];
var THEME_IDS=["glas","dark","light","auto"], DARKQ=window.matchMedia?window.matchMedia("(prefers-color-scheme: dark)"):null;
/* true für Alpenglas und Dunkel, bei „Wie System“ je nach Systemeinstellung – für Module, die per JS hell/dunkel unterscheiden */
FSC.isDark = function(){ var a=document.documentElement.getAttribute("data-theme"); if(a) return a!=="light"; return !!(DARKQ&&DARKQ.matches); };
function themeMeta(t){ var m=document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute("content",t==="glas"?"#0d1520":FSC.isDark()?"#0b0e14":"#f4f5f8"); }
FSC.theme = function(t){
  var want=t;
  if(want!==undefined){ if(THEME_IDS.indexOf(want)<0) want="glas"; FSC.ls("fsc_theme",want); }
  t=FSC.ls("fsc_theme"); if(THEME_IDS.indexOf(t)<0) t=want||"glas";
  var de=document.documentElement, was=de.getAttribute("data-theme")||"auto";
  if(t==="auto") de.removeAttribute("data-theme"); else de.setAttribute("data-theme",t);
  themeMeta(t);
  var s=document.getElementById("themeSel"); if(s) s.value=t;
  if(was!==t){ try{ document.dispatchEvent(new CustomEvent("fsc-theme",{detail:{theme:t,dark:FSC.isDark()}})); }catch(e){} }
  return t;
};
if(DARKQ&&DARKQ.addEventListener) DARKQ.addEventListener("change",function(){ if(document.documentElement.hasAttribute("data-theme")) return; themeMeta("auto"); try{ document.dispatchEvent(new CustomEvent("fsc-theme",{detail:{theme:"auto",dark:FSC.isDark()}})); }catch(e){} });
FSC.action("theme",function(v){ v=FSC.theme(v); FSC.toast(v==="glas"?"Alpenglas":v==="light"?"Heller Modus":v==="dark"?"Dunkler Modus":"Darstellung wie System"); if(document.getElementById("moreSheet")) FSC.actions.moresheet(); });
FSC.themeSeg = function(short){ var t=FSC.theme(); return '<div class="seg" role="group" aria-label="Darstellung">'+FSC.THEMES.map(function(o){ return '<button type="button" data-act="theme:'+o[0]+'" aria-pressed="'+(t===o[0])+'">'+(short&&o[0]==="auto"?"System":o[1])+'</button>'; }).join("")+'</div>'; };

/* ---------- Mehr-Menü (Handy) ---------- */
FSC.action("moresheet",function(){
  FSC.modal('<div class="row-between"><h2 style="font-size:19px">Mehr</h2>'+FSC.btnClose()+'</div><div class="sheet" id="moreSheet">'+FSC.views.filter(function(v){return !v.hidden;}).map(function(v){ var c=navCount(v); return '<button class="nav-btn" data-go="'+v.id+'"'+(v.id===FSC.current?' aria-current="page"':'')+'>'+FSC.navIcon(v)+'<span>'+FSC.esc(v.label)+'</span>'+(c?'<span class="count">'+c+'</span>':'')+'</button>'; }).join("")+
    '<div class="sec-t" style="margin-top:10px">Darstellung</div>'+FSC.themeSeg(true)+
    '<div class="sheet-links"><button class="btn" data-act="search">Suchen</button><button class="btn" data-act="priv">Beträge ein/aus</button><button class="btn" data-act="settings">Einstellungen</button>'+(FSC.actions.conn?'<button class="btn" data-act="conn">'+(FSC.connErrors()?'<span class="dot bad"></span>':'')+'Verbindungen</button>':'')+'<button class="btn" data-act="reload">Aktualisieren</button><a class="btn" href="/admin/logout">Abmelden</a></div></div>',"sheetdlg");
});

/* ---------- Zentrale Ereignisse ---------- */
FSC.action("go",function(v){ FSC.go(v); });
FSC.action("url",function(v){ window.open(v,"_blank","noopener"); });
FSC.action("reload",function(){ FSC.closeModal(); FSC.load(true); FSC.toast("Aktualisiere …"); });
document.addEventListener("click",function(e){
  var t=e.target;
  var g=t.closest("[data-go]"); if(g){ e.preventDefault(); FSC.go(g.getAttribute("data-go")); return; }
  var a=t.closest("[data-act]"); if(a&&!a.disabled){ var s=a.getAttribute("data-act"), i=s.indexOf(":"), k=i>-1?s.slice(0,i):s, v=i>-1?s.slice(i+1):""; if(FSC.actions[k]){ e.preventDefault(); FSC.actions[k](v,a,e); return; } }
  var sn=t.closest("[data-snooze]"); if(sn){ FSC.snooze(sn.getAttribute("data-snooze")); return; }
  // Hintergrund schließt nur, wenn auch der Druck dort begann – Text markieren und über den Rand ziehen schließt nicht mehr
  if(t.closest("[data-close]")||(t.id==="scrim"&&FSC._down===t)){ FSC.closeDrawer(); return; }
  if(t.closest("[data-closemodal]")||(t.classList.contains("modal")&&FSC._down===t)){ FSC.closeModal(); return; }
  FSC.listeners.forEach(function(l){ if(l.type!=="click") return; var el=t.closest(l.sel); if(el) l.fn(el,e); });
});
document.addEventListener("pointerdown",function(e){ FSC._down=e.target; },true);
["change","input","keydown","dragstart","dragover","drop","contextmenu"].forEach(function(type){
  document.addEventListener(type,function(e){ var t=e.target; if(!t.closest) return; FSC.listeners.forEach(function(l){ if(l.type!==type) return; var el=t.closest(l.sel); if(el) l.fn(el,e); }); });
});
document.addEventListener("submit",function(e){ var f=e.target, k=f.getAttribute("data-form"); if(!k||!FSC.forms[k]) return; e.preventDefault(); FSC.forms[k](f,e); });
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){ if(FSC.modalOpen()) FSC.closeModal(); else FSC.closeDrawer(); }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"&&FSC.actions.search){ e.preventDefault(); FSC.actions.search(); }
});

/* ---------- Liquid Glass: Navigation ----------
   Ein „Tropfen“ je Leiste markiert den aktiven Eintrag: gleitet per Feder (leichtes Überschwingen) und dehnt sich in Bewegungsrichtung,
   folgt Maus bzw. Tastaturfokus sanft und kehrt beim Verlassen zum aktiven Eintrag zurück; übersteht das Neuzeichnen der Leiste.
   Drücken und Ziehen (Finger, Maus, Stift): der Tropfen folgt, beim Loslassen rastet er federnd am nächsten Eintrag ein und öffnet ihn.
   Alpenglas zusätzlich wie iOS 26: beim Drücken hebt sich der Tropfen als klare Glaslinse aus der Leiste – größer als die Leiste,
   vergrößert die Einträge darunter, Lichtkante mit Regenbogensaum – folgt dem Finger und sinkt nach dem Einrasten zurück in die getönte Kapsel.
   Ohne backdrop-filter:url() (kann Safari nicht): die Linse zeigt eine vergrößerte Kopie der Einträge, die echten bekommen dort ein Loch (Maske).
   Pro Bild nur transform/opacity (dazu Lage/Größe der Maske). Glanzlicht folgt dem Zeiger (--mx/--my an .lq-glare, --dx/--dy am Tropfen).
   „Bewegung reduzieren“: keine Linse, springt ohne Animation. */
var RMQ=window.matchMedia?window.matchMedia("(prefers-reduced-motion: reduce)"):null;
function still(){ return !!(RMQ&&RMQ.matches); }
function glas(){ return document.documentElement.getAttribute("data-theme")==="glas"; }
function tnow(){ return window.performance&&performance.now?performance.now():Date.now(); }
function f2(n){ return String(Math.round(n*100)/100); }
var MASKOK=false; try{ MASKOK=!!(window.CSS&&CSS.supports&&(CSS.supports("mask-composite","exclude")||CSS.supports("-webkit-mask-composite","xor"))); }catch(e){}
function itemKey(b){ return b?(b.getAttribute("data-go")||b.getAttribute("data-act")||""):""; }
/* Federn [Steifigkeit, Dämpfung]: spring = zum aktiven Eintrag, soft = Hover/Finger, snap = Einrasten nach dem Ziehen (federnder),
   drag = Tropfen folgt dem Zeiger fast direkt, lens = Linse folgt mit kleinem Nachlauf */
var SPR={spring:[520,30],soft:[300,28],snap:[560,23],drag:[1400,72],lens:[950,46]};
function Drop(host,list,axis,sel){   // host: positionierter Container (scrollt mit den Einträgen), list: Container der Einträge, axis: "y" | "x"
  this.host=host; this.list=list; this.axis=axis; this.sel=sel;
  var el=document.createElement("span"); el.className="lq-drop off"; el.setAttribute("aria-hidden","true"); el.appendChild(document.createElement("i"));
  host.insertBefore(el,host.firstChild); this.el=el;
  this.p=null; this.t=null; this.tk=""; this.v=0; this.sv=0; this.k=520; this.c=30; this.raf=0; this.at=0; this.cur=""; this.hov=""; this.drag=false; this.S=null;
  this.L=0; this.Lv=0; this.Lt=0; this.kl=760; this.cl=30; this.dropAt=0; this.lens=null;   // Linse: Hub 0…1 (Feder), Ziel, Absinken ab Zeitpunkt
  var me=this; this._step=function(ts){ me.step(ts); };
}
Drop.prototype.items=function(){ return Array.prototype.slice.call(this.list.querySelectorAll(this.sel)); };
Drop.prototype.find=function(k){ var l=this.items(); for(var i=0;i<l.length;i++) if(itemKey(l[i])===k) return l[i]; return null; };
Drop.prototype.active=function(){ return this.list.querySelector(this.sel+'[aria-current="page"]'); };
/* Lage relativ zum Container über offset* (ohne CSS-Transform des gedrückten Knopfs); null = nicht sichtbar */
Drop.prototype.rect=function(b){
  if(!b||!b.offsetParent) return null;
  var x=0, y=0, e=b; while(e&&e!==this.host){ x+=e.offsetLeft; y+=e.offsetTop; e=e.offsetParent; }
  if(e!==this.host) return null;
  return {x:x,y:y,w:b.offsetWidth,h:b.offsetHeight};
};
Drop.prototype.box=function(b){ var r=this.rect(b); if(!r) return null; return this.axis==="y"?{pos:r.y,size:r.h,c:r.x,cs:r.w}:{pos:r.x,size:r.w,c:r.y,cs:r.h}; };
Drop.prototype.kick=function(){ if(!this.raf){ this.at=0; this.raf=requestAnimationFrame(this._step); } };
Drop.prototype.paint=function(){
  var p=this.p; if(!p) return;
  var s=still()?0:Math.min(1,Math.abs(this.v)/1700), al=1+0.32*s, cr=1-0.14*s, st=this.el.style;   // Dehnen in Laufrichtung, quer etwas schmäler
  if(this.axis==="y"){ st.width=p.cs+"px"; st.height=p.size+"px"; st.transform="translate3d("+p.c.toFixed(2)+"px,"+p.pos.toFixed(2)+"px,0) scale("+cr.toFixed(3)+","+al.toFixed(3)+")"; }
  else { st.width=p.size+"px"; st.height=p.cs+"px"; st.transform="translate3d("+p.pos.toFixed(2)+"px,"+p.c.toFixed(2)+"px,0) scale("+al.toFixed(3)+","+cr.toFixed(3)+")"; }
  if(this.lens&&this.lens.on) this.lens.paint(s);
};
Drop.prototype.go=function(b,mode){   // mode: "jump" (sofort) | "keep" (Ziel nachführen, Feder behalten) | Name aus SPR
  var t=this.box(b);
  if(!t){ this.el.classList.add("off"); return; }
  var was=this.el.classList.contains("off"); this.el.classList.remove("off"); this.tk=itemKey(b);
  if(!this.p||was||mode==="jump"||still()){ if(this.raf) cancelAnimationFrame(this.raf); this.raf=0; this.p={pos:t.pos,size:t.size,c:t.c,cs:t.cs}; this.t=t; this.v=this.sv=0; this.paint(); if(this.lens&&this.lens.on) this.kick(); return; }
  this.t=t; if(mode!=="keep"){ var k=SPR[mode]||SPR.spring; this.k=k[0]; this.c=k[1]; }
  this.kick();
};
/* Ziehen: Ziel folgt dem Zeiger (pos entlang der Leiste), Größe vom nächsten Eintrag */
Drop.prototype.follow=function(pos,b){ var q=this.box(b)||this.t; if(!q) return; this.t={pos:pos,size:q.size,c:q.c,cs:q.cs}; var k=SPR[this.lens&&this.lens.on?"lens":"drag"]; this.k=k[0]; this.c=k[1]; this.kick(); };
Drop.prototype.step=function(ts){
  this.raf=0; var dt=this.at?Math.min(0.034,Math.max(0.001,(ts-this.at)/1000)):1/60; this.at=ts;
  var p=this.p, t=this.t; if(!p||!t) return;
  var ln=!!(this.lens&&this.lens.on);
  if(ln&&this.dropAt&&tnow()>=this.dropAt){ this.Lt=0; this.dropAt=0; this.kl=420; this.cl=30; }   // Linse sinkt zurück in die Kapsel
  for(var i=0,h=dt/4;i<4;i++){
    this.v+=(-this.k*(p.pos-t.pos)-this.c*this.v)*h; p.pos+=this.v*h;
    this.sv+=(-this.k*(p.size-t.size)-this.c*this.sv)*h; p.size+=this.sv*h;
    if(ln){ this.Lv+=(-this.kl*(this.L-this.Lt)-this.cl*this.Lv)*h; this.L+=this.Lv*h; }
  }
  var f=Math.min(1,dt*16); p.c+=(t.c-p.c)*f; p.cs+=(t.cs-p.cs)*f;
  var rest=Math.abs(p.pos-t.pos)<0.3&&Math.abs(this.v)<8&&Math.abs(p.size-t.size)<0.3&&Math.abs(this.sv)<8&&Math.abs(p.c-t.c)<0.3&&Math.abs(p.cs-t.cs)<0.3;
  var lrest=!ln||(!this.dropAt&&Math.abs(this.L-this.Lt)<0.004&&Math.abs(this.Lv)<0.05);
  if(rest&&lrest){
    this.p={pos:t.pos,size:t.size,c:t.c,cs:t.cs}; this.v=this.sv=0;
    if(ln){ this.L=this.Lt; this.Lv=0; if(!this.Lt){ this.lens.stop(); ln=false; } }
    this.paint(); return;
  }
  this.paint(); this.raf=requestAnimationFrame(this._step);
};
/* nach jedem Zeichnen: zum aktiven (bzw. gerade überfahrenen) Eintrag; gleicher Eintrag in Ruhe = ohne Animation nachziehen */
Drop.prototype.sync=function(mode){
  if(this.drag) return;
  if(this.lens&&this.lens.on) this.lens.refresh();
  var a=this.active(), k=itemKey(a), h=this.hov?this.find(this.hov):null, tg=h||a;
  if(a&&k!==this.cur&&this.axis==="y"){ var hs=this.host, at=this.box(a); if(at&&(at.pos<hs.scrollTop||at.pos+at.size>hs.scrollTop+hs.clientHeight)) hs.scrollTop=Math.max(0,at.pos-hs.clientHeight/2); }   // aktiven Eintrag in der scrollenden Liste sichtbar halten
  this.cur=k;
  if(!tg){ this.el.classList.add("off"); return; }
  this.el.classList.toggle("away",!!h&&h!==a);
  var same=itemKey(tg)===this.tk;
  this.go(tg,mode||(same?(this.raf?"keep":"jump"):(h?"soft":"spring")));
};
/* Linse heben (nur Alpenglas, nicht bei „Bewegung reduzieren“); true = Linse ist oben */
Drop.prototype.lift=function(){
  if(still()||!glas()||!this.p) return false;
  try{ if(!this.lens) this.lens=new Lens(this); if(!this.lens.on&&!this.lens.start()) return false; }catch(e){ console.error(e); return false; }
  this.Lt=1; this.dropAt=0; this.kl=760; this.cl=30; this.kick(); return true;
};
Drop.prototype.lower=function(ms){ if(!this.lens||!this.lens.on) return; this.dropAt=tnow()+Math.max(0,ms||0); this.kick(); };
Drop.prototype.unlift=function(){ if(this.lens) this.lens.stop(); };   // sofort weg (Darstellung gewechselt, Bewegung reduzieren)

/* ---- Linse: eigene Ebene über allem (die Leiste beschneidet sie nicht). Aufbau: Schatten · Körper (leichte Unschärfe/Aufhellung;
   darin der Rand mit leicht verkleinerter Kopie = Brechung und die Mitte mit vergrößerter Kopie) · Lichtkante mit Regenbogensaum ---- */
function svgUrl(w,h,body){ return 'url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+body+'</svg>')+'")'; }
var MASKP=["webkitMaskImage","maskImage","webkitMaskRepeat","maskRepeat","webkitMaskSize","maskSize","webkitMaskPosition","maskPosition","webkitMaskComposite","maskComposite"];
function setMask(el,img,xor){ var s=el.style; s.webkitMaskImage=s.maskImage=img; s.webkitMaskRepeat=s.maskRepeat="no-repeat"; s.webkitMaskSize=s.maskSize="100% 100%"; if(xor){ s.webkitMaskComposite="xor"; s.maskComposite="exclude"; } }
function Lens(d){
  var kind=d.axis==="x"?"tab":"rail", el=document.createElement("div");
  el.className="lq-lens lq-lens-"+kind; el.setAttribute("aria-hidden","true"); try{ el.inert=true; }catch(e){}
  el.innerHTML='<i class="lq-ls"></i><span class="lq-lb"><span class="lq-le"><span></span></span><span class="lq-li"><span></span></span></span><i class="lq-lr"></i>';
  document.body.appendChild(el);
  this.d=d; this.kind=kind; this.el=el; this.on=false; this.W=0; this.H=0; this.src=null; this.ox=0; this.oy=0; this.lx=0; this.ly=0;
  this.ls=el.firstChild; this.lr=el.lastChild; this.le=el.querySelector(".lq-le"); this.li=el.querySelector(".lq-li");
  this.ge=this.le.firstChild; this.gi=this.li.firstChild;
  this.ge.className=this.gi.className=(kind==="tab"?"tabbar":"rail lq-on")+" lq-ghost";   // gleiche Klassen wie die echte Leiste → gleiche Darstellung
  this.mag=kind==="tab"?1.2:1.16; this.edge=0.9;   // Vergrößerung in der Mitte, Verkleinerung am Rand
  var me=this; d.host.addEventListener("scroll",function(){ if(me.on){ me.measure(); me.paint(0); } },{passive:true});
}
Lens.prototype.measure=function(){   // Lage des Containers am Bildschirm (einmal je Heben, beim Scrollen/Größe ändern) – nicht pro Bild
  var d=this.d, h=d.host, r=h.getBoundingClientRect(), l=d.rect(d.list);
  this.ox=r.left+h.clientLeft-h.scrollLeft; this.oy=r.top+h.clientTop-h.scrollTop; this.lx=l?l.x:0; this.ly=l?l.y:0;
  return r.width>0&&r.height>0;
};
Lens.prototype.size=function(W,H){
  this.W=W; this.H=H; this.el.style.width=W+"px"; this.el.style.height=H+"px";
  var R=Math.min(W,H)/2, b=Math.max(5,Math.round(Math.min(W,H)*0.15)), sd=(b*0.3).toFixed(1);
  this.hole=svgUrl(W,H,'<rect width="'+W+'" height="'+H+'" rx="'+R+'"/>');
  var inner=svgUrl(W,H,'<filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="'+sd+'"/></filter><rect x="'+b+'" y="'+b+'" width="'+(W-2*b)+'" height="'+(H-2*b)+'" rx="'+(R-b)+'" filter="url(#f)"/>');
  setMask(this.li,inner); setMask(this.le,inner+","+this.hole,true);   // Mitte weich ausgeblendet, Rand = Kapsel ohne Mitte
};
Lens.prototype.start=function(){
  var d=this.d, t=d.t||d.p; if(!t||!this.measure()) return false;
  var cw=d.axis==="x"?t.size:t.cs, ch=d.axis==="x"?t.cs:t.size, W, H;
  if(this.kind==="tab"){ H=Math.round(d.host.offsetHeight*1.16); W=Math.round(Math.max(cw*1.2,H*1.3)); }   // höher als die Leiste, ragt oben und unten hinaus
  else { W=Math.round(cw+14); H=Math.round(Math.max(ch*1.5,ch+16)); }
  if(!W||!H) return false;
  if(W!==this.W||H!==this.H) this.size(W,H);
  this.build(); this.on=true; this.el.classList.add("on");
  if(LQ.upd) try{ LQ.upd(); }catch(e){}   // Chromium: Brechungskarte passend zur Linsengröße
  d.el.classList.add("lq-lift");
  if(MASKOK) setMask(d.list,this.hole+",linear-gradient(#000,#000)",true); else d.list.classList.add("lq-fade");
  d.L=0; d.Lv=0; this.paint(0);
  return true;
};
/* Kopie der Einträge (ohne Aktionen/IDs) an derselben Stelle wie die echten, relativ zum Container */
Lens.prototype.build=function(){
  var d=this.d, ch=d.list.children, out=[];
  for(var i=0;i<ch.length;i++){
    var c=ch[i], r=d.rect(c); if(!r) continue;
    var k=c.cloneNode(true);
    ["id","data-go","data-act","title","tabindex","aria-label"].forEach(function(a){ k.removeAttribute(a); });
    k.classList.remove("lq-near"); k.classList.remove("lq-under"); k.setAttribute("data-lqi",String(i));
    k.style.cssText+=";position:absolute;left:"+r.x+"px;top:"+r.y+"px;width:"+r.w+"px;height:"+r.h+"px;margin:0;transform:none;transition:none";
    out.push(k.outerHTML);
  }
  var html=out.join(""); this.gi.innerHTML=html; this.ge.innerHTML=html; this.src=d.list._h;
};
Lens.prototype.refresh=function(){ if(this.on&&this.src!==this.d.list._h){ this.measure(); this.build(); } };   // Leiste wurde neu gezeichnet (aktiver Eintrag, Zähler)
Lens.prototype.near=function(b){
  if(!this.on) return; var i=b?Array.prototype.indexOf.call(this.d.list.children,b):-1;
  [this.gi,this.ge].forEach(function(g){ Array.prototype.forEach.call(g.children,function(x){ x.classList.toggle("lq-near",+x.getAttribute("data-lqi")===i); }); });
};
Lens.prototype.paint=function(s){
  var d=this.d, p=d.p; if(!this.on||!p) return;
  var X=d.axis==="x", L=d.L>0?d.L:0, Lc=L>1?1:L, W=this.W, H=this.H;
  var cw=X?p.size:p.cs, ch=X?p.cs:p.size, cx=X?p.pos+p.size/2:p.c+p.cs/2, cy=X?p.c+p.cs/2:p.pos+p.size/2;
  var vw=cw+(W-cw)*L, vh=ch+(H-ch)*L, al=1+0.2*(s||0), cr=1-0.09*(s||0);   // Kapsel → Linse (Überschwingen = kurzes Aufploppen), Dehnen beim Ziehen
  if(X){ vw*=al; vh*=cr; } else { vh*=al; vw*=cr; }
  var kx=vw/W, ky=vh/H;
  this.el.style.transform="translate3d("+f2(this.ox+cx-W/2)+"px,"+f2(this.oy+cy-H/2)+"px,0) scale("+kx.toFixed(4)+","+ky.toFixed(4)+")";
  /* Kopien: Punkt P der Leiste erscheint bei A + m·(P − A), A = Mitte der Linse (Seitenleiste mit Text: beim Symbol, sonst
     rutschen Symbol und Textanfang aus der Linse); Skalierung der Linse wird herausgerechnet */
  var m=1+(this.mag-1)*Lc, e=1-(1-this.edge)*Lc, ax=!X&&cw>120?p.c+22:cx;
  function gt(sx,sy){ return "translate("+f2(W/2+(ax-cx)/kx-sx*ax)+"px,"+f2(H/2-sy*cy)+"px) scale("+(sx).toFixed(4)+","+(sy).toFixed(4)+")"; }
  this.gi.style.transform=gt(m/kx,m/ky); this.ge.style.transform=gt(e/kx,e/ky);
  var a=String(Math.min(1,L*1.5)); this.lr.style.opacity=a; this.ls.style.opacity=a;
  d.el.style.opacity=String(Math.max(0,1-L*1.6));   // getönte Kapsel blendet aus, solange die Linse oben ist
  /* Loch in den echten Einträgen unter der Linse (sonst doppelt) */
  var hw=Math.max(0,vw-2), hh=Math.max(0,vh-2), hx=cx-this.lx-hw/2, hy=cy-this.ly-hh/2, ls=d.list.style;
  if(MASKOK){ ls.webkitMaskPosition=ls.maskPosition=f2(hx)+"px "+f2(hy)+"px,0 0"; ls.webkitMaskSize=ls.maskSize=f2(hw)+"px "+f2(hh)+"px,100% 100%"; }
  else { var lx=this.lx, ly=this.ly; Array.prototype.forEach.call(d.list.children,function(x){ var r=d.rect(x); if(!r) return; var mx=r.x+r.w/2-lx, my=r.y+r.h/2-ly; x.classList.toggle("lq-under",Math.abs(mx-hx-hw/2)<hw/2&&Math.abs(my-hy-hh/2)<hh/2); }); }   // ohne Masken: Einträge unter der Linse ausblenden
};
Lens.prototype.stop=function(){
  if(!this.on) return; var d=this.d, s=d.list.style;
  this.on=false; this.el.classList.remove("on"); this.gi.innerHTML=this.ge.innerHTML=""; this.src=null;
  MASKP.forEach(function(k){ s[k]=""; });
  d.list.classList.remove("lq-fade"); Array.prototype.forEach.call(d.list.children,function(x){ x.classList.remove("lq-under"); });
  d.el.classList.remove("lq-lift"); d.el.style.opacity=""; d.L=d.Lv=d.Lt=0; d.dropAt=0;
};

function lqKeys(list,sel,axis){   // Pfeiltasten wandern durch die Einträge
  list.addEventListener("keydown",function(e){
    var k=e.key, nx=axis==="y"?"ArrowDown":"ArrowRight", pv=axis==="y"?"ArrowUp":"ArrowLeft";
    if(k!==nx&&k!==pv&&k!=="Home"&&k!=="End") return;
    var l=Array.prototype.slice.call(list.querySelectorAll(sel)), i=l.indexOf(document.activeElement); if(i<0) return;
    e.preventDefault(); l[k==="Home"?0:k==="End"?l.length-1:(i+(k===nx?1:-1)+l.length)%l.length].focus();
  });
}
function lqGlare(surface,d){   // Glanzlicht folgt dem Zeiger; Variablen auf eigenen Elementen (kein Neuberechnen der ganzen Leiste)
  var g=document.createElement("span"); g.className="lq-glare"; g.setAttribute("aria-hidden","true"); surface.insertBefore(g,surface.firstChild);
  var raf=0, ev=null;
  surface.addEventListener("pointermove",function(e){ ev=e; if(raf) return; raf=requestAnimationFrame(function(){ raf=0; if(!ev) return;
    var r=surface.getBoundingClientRect(); g.style.setProperty("--mx",Math.round(ev.clientX-r.left)+"px"); g.style.setProperty("--my",Math.round(ev.clientY-r.top)+"px");
    var q=d.el.getBoundingClientRect(); if(q.width){ d.el.style.setProperty("--dx",Math.round(ev.clientX-q.left)+"px"); d.el.style.setProperty("--dy",Math.round(ev.clientY-q.top)+"px"); } }); },{passive:true});
  surface.addEventListener("pointerleave",function(){ ev=null; g.style.removeProperty("--mx"); g.style.removeProperty("--my"); d.el.style.removeProperty("--dx"); d.el.style.removeProperty("--dy"); });
}
/* Drücken/Ziehen über einer Leiste. o.follow: Tropfen folgt jedem Drücken (Reiterleiste), o.any: Drücken irgendwo auf der Leiste,
   o.noTouchDrag: Finger scrollt die Liste statt zu ziehen (Seitenleiste am iPad) */
function lqPress(d,surf,o){
  var X=d.axis==="x", S=null, noClick=0;
  function at(e,s){ return X?e.clientX-s.ox:e.clientY-s.oy; }   // Zeigerlage entlang der Leiste, relativ zum Container
  function boxes(){ return d.items().map(function(b){ var q=d.box(b); return q?{b:b,a:q.pos,z:q.pos+q.size,m:q.pos+q.size/2}:null; }).filter(Boolean); }
  function nearOf(l,hp){ var best=null, bd=1e9; l.forEach(function(q){ var dd=Math.abs(q.m-hp); if(dd<bd){ bd=dd; best=q; } }); return best; }
  function mark(b){ d.items().forEach(function(x){ x.classList.toggle("lq-near",x===b); }); if(d.lens) d.lens.near(b); }
  function later(){ setTimeout(function(){ if(!S){ d.hov=""; d.sync(); } },60); }
  function end(e,cancel){
    var s=S; S=d.S=null; d.el.classList.remove("press"); if(!s) return;
    if(s.moved){
      d.drag=false; d.el.classList.remove("drag"); mark(null); noClick=Date.now()+450; d.hov="";
      var q=!cancel&&e&&s.bx&&s.bx.length?nearOf(s.bx,at(e,s)):null, b=q&&q.b;
      if(b&&!b.isConnected) b=d.find(itemKey(b));   // Leiste wurde während des Ziehens neu gezeichnet → gleichen Eintrag im neuen DOM nehmen
      if(b&&(b.getAttribute("aria-current")!=="page"||b.hasAttribute("data-act"))){ d.hov=itemKey(b); d.sync("snap"); b.click(); later(); }   // einrasten und öffnen
      else d.sync("snap");
      if(s.lens) d.lower(150);
    } else {
      if(s.lens) d.lower(cancel?0:Math.max(70,240-(tnow()-s.at)));   // kurzes Antippen: Linse kurz zeigen
      if(d.hov&&(o.follow||s.type!=="mouse")) later();
    }
  }
  surf.addEventListener("pointerdown",function(e){
    if(e.button>0||(S&&tnow()-S.at<8000)) return;
    var b=e.target.closest&&e.target.closest(d.sel); if(b&&!d.list.contains(b)) b=null;
    if(!b&&!o.any) return;
    var r=d.host.getBoundingClientRect();
    S=d.S={id:e.pointerId,type:e.pointerType,x:e.clientX,y:e.clientY,moved:false,at:tnow(),lens:false,bx:null,ox:r.left+d.host.clientLeft-d.host.scrollLeft,oy:r.top+d.host.clientTop-d.host.scrollTop};
    d.el.classList.add("press");
    if(still()) return;
    if(!b){ var q=nearOf(boxes(),at(e,S)); b=q&&q.b; }
    S.lens=d.lift();   // Alpenglas: Linse heben
    if(b&&(S.lens||o.follow||e.pointerType!=="mouse")){ d.hov=itemKey(b); d.sync(); }   // Tropfen/Linse unter den Finger
  });
  surf.addEventListener("pointermove",function(e){
    if(!S||e.pointerId!==S.id) return;
    if(S.type==="mouse"&&!e.buttons){ end(e,true); return; }   // Maustaste außerhalb losgelassen
    if(!S.moved){
      if(still()||Math.abs(X?e.clientX-S.x:e.clientY-S.y)<8) return;
      if(o.noTouchDrag&&S.type==="touch") return;
      S.bx=boxes(); if(!S.bx.length||!d.p) return;
      S.moved=true; try{ surf.setPointerCapture(e.pointerId); }catch(x){}
      d.drag=true; d.el.classList.add("drag"); d.el.classList.remove("away");
    }
    var hp=at(e,S), q=nearOf(S.bx,hp), w=q.z-q.a, lo=S.bx[0].a, hi=S.bx[S.bx.length-1].z-w, pos=hp-w/2;
    if(pos<lo) pos=lo-Math.min(16,(lo-pos)*0.3); else if(pos>hi) pos=hi+Math.min(16,(pos-hi)*0.3);   // an den Enden leicht gummiartig
    d.follow(pos,q.b); mark(q.b);
  });
  surf.addEventListener("pointerup",function(e){ if(S&&e.pointerId===S.id) end(e,false); });
  surf.addEventListener("pointercancel",function(e){ if(S&&e.pointerId===S.id) end(e,true); });   // z. B. Finger scrollt die Seitenleiste
  surf.addEventListener("pointerleave",function(e){ if(S&&!S.moved&&e.pointerId===S.id&&e.pointerType==="mouse") end(e,true); });
  window.addEventListener("blur",function(){ if(S) end(null,true); });
  /* nach dem Ziehen keinen zusätzlichen Klick des Browsers auf den Startknopf durchlassen (der eigene .click() oben ist nicht „trusted“) */
  document.addEventListener("click",function(e){ if(Date.now()<noClick&&e.isTrusted&&surf.contains(e.target)){ e.preventDefault(); e.stopImmediatePropagation(); } },true);
}
function lqRail(d,rail){
  var list=d.list;
  list.addEventListener("pointerover",function(e){
    if(e.pointerType==="touch"||still()||d.S) return;
    var b=e.target.closest&&e.target.closest(d.sel); if(!b||!list.contains(b)) return;
    var k=itemKey(b); if(k===d.hov) return; d.hov=k; d.sync();
  });
  list.addEventListener("pointerleave",function(){ if(d.S&&d.S.moved) return; d.el.classList.remove("press"); if(!d.hov) return; d.hov=""; d.sync(); });
  list.addEventListener("focusin",function(e){ var b=e.target.closest&&e.target.closest(d.sel), fv=false; if(!b||still()) return; try{ fv=b.matches(":focus-visible"); }catch(x){} if(fv){ d.hov=itemKey(b); d.sync(); } });
  list.addEventListener("focusout",function(e){ if(e.relatedTarget&&list.contains(e.relatedTarget)) return; var hv=false; try{ hv=list.matches(":hover"); }catch(x){} if(d.hov&&!hv){ d.hov=""; d.sync(); } });
  lqPress(d,list,{follow:false,any:false,noTouchDrag:true});   // Maus: Drücken hebt die Linse, Ziehen über die Liste, Loslassen öffnet
  lqKeys(list,d.sel,"y"); lqGlare(rail,d);
}
function lqTab(d){
  lqPress(d,d.host,{follow:true,any:true,noTouchDrag:false});
  lqKeys(d.list,d.sel,"x"); lqGlare(d.host,d);
}
/* Brechung wie bei echtem Glas: nur Chromium kann SVG-Filter in backdrop-filter (Safari/WebKit behält Unschärfe + Sättigung + Glanz).
   Verschiebungskarte aus zwei Verläufen (Rot = x, Grün = y), an den Rändern am stärksten, passend zur Größe der Fläche. */
function lqRefract(){
  var ok=false;
  try{ ok=!!(navigator.userAgentData&&window.CSS&&CSS.supports("backdrop-filter","url(#lqRail) blur(2px)"))&&!(window.matchMedia&&window.matchMedia("(prefers-reduced-transparency: reduce)").matches); }catch(e){ ok=false; }
  if(!ok) return null;
  var NS="http://www.w3.org/2000/svg", XL="http://www.w3.org/1999/xlink", svg=document.createElementNS(NS,"svg"), defs=document.createElementNS(NS,"defs");
  svg.setAttribute("aria-hidden","true"); svg.setAttribute("focusable","false"); svg.style.cssText="position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  var FL=[["lqRail",".rail",22,34],["lqTab",".tabbar",16,26],["lqLens",".lq-lens.on .lq-lb",12,22]];   // id, Fläche, Randbreite px, Stärke (Linse: nur solange sie oben ist)
  function mk(tag,attrs,parent){ var n=document.createElementNS(NS,tag); Object.keys(attrs).forEach(function(k){ n.setAttribute(k,attrs[k]); }); parent.appendChild(n); return n; }
  FL.forEach(function(f){
    var fl=mk("filter",{id:f[0],x:"0",y:"0",width:"100%",height:"100%","color-interpolation-filters":"sRGB"},defs);
    mk("feImage",{result:"mx",preserveAspectRatio:"none"},fl); mk("feImage",{result:"my",preserveAspectRatio:"none"},fl);
    mk("feComposite",{"in":"mx",in2:"my",operator:"arithmetic",k1:"0",k2:"1",k3:"1",k4:"0",result:"map"},fl);
    mk("feDisplacementMap",{"in":"SourceGraphic",in2:"map",scale:String(f[3]),xChannelSelector:"R",yChannelSelector:"G"},fl);
  });
  svg.appendChild(defs); document.body.appendChild(svg);
  function map(w,h,edge,horiz){
    var L=horiz?w:h, a=Math.min(0.45,edge/L), b=Math.min(0.2,edge*0.4/L), col=function(v){ return horiz?"rgb("+v+",0,0)":"rgb(0,"+v+",0)"; };
    var st=[[0,0],[b,58],[a,128],[1-a,128],[1-b,198],[1,255]].map(function(s){ return '<stop offset="'+s[0].toFixed(4)+'" stop-color="'+col(s[1])+'"/>'; }).join("");
    return "data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><defs><linearGradient id="g" x1="0" y1="0" x2="'+(horiz?1:0)+'" y2="'+(horiz?0:1)+'">'+st+'</linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>');
  }
  function upd(){
    FL.forEach(function(f){
      var el=document.querySelector(f[1]), fl=document.getElementById(f[0]); if(!el||!fl) return;
      var w=el.offsetWidth, h=el.offsetHeight; if(!w||!h||fl._k===w+"x"+h) return; fl._k=w+"x"+h;
      var im=fl.getElementsByTagNameNS(NS,"feImage");
      [[im[0],map(w,h,f[2],true)],[im[1],map(w,h,f[2],false)]].forEach(function(x){ x[0].setAttribute("x","0"); x[0].setAttribute("y","0"); x[0].setAttribute("width",String(w)); x[0].setAttribute("height",String(h)); x[0].setAttribute("href",x[1]); try{ x[0].setAttributeNS(XL,"xlink:href",x[1]); }catch(e){} });
    });
  }
  upd(); document.documentElement.classList.add("lq-refract");
  return upd;
}
var LQ={};
FSC.lqSync=function(){ if(LQ.rail) LQ.rail.sync(); if(LQ.tab) LQ.tab.sync(); };
FSC.lqInit=function(){
  if(LQ.done) return; LQ.done=true;
  var ri=document.getElementById("railIn"), sc=document.getElementById("navSc")||ri, nav=document.getElementById("nav"), tb=document.getElementById("tabbar"), ti=document.getElementById("tabItems");
  var rail=ri&&ri.parentNode;
  if(sc&&nav&&rail){ LQ.rail=new Drop(sc,nav,"y",".nav-btn"); rail.classList.add("lq-on"); rail.classList.toggle("lq-hov",!still()); lqRail(LQ.rail,rail); }
  if(tb&&ti){ LQ.tab=new Drop(tb,ti,"x","button"); lqTab(LQ.tab); }
  var upd=null; try{ upd=lqRefract(); }catch(e){ console.error(e); } LQ.upd=upd;
  var both=function(fn){ [LQ.rail,LQ.tab].forEach(function(d){ if(d) fn(d); }); };
  var remeasure=function(){ both(function(d){ if(d.lens&&d.lens.on&&d.lens.measure()) d.lens.paint(0); }); };   // Linse oben: Lage am Bildschirm neu lesen
  var again=function(){ remeasure(); FSC.lqSync(); if(upd) upd(); }, rz=0;
  window.addEventListener("resize",function(){ clearTimeout(rz); rz=setTimeout(again,120); });
  window.addEventListener("scroll",remeasure,{passive:true});
  document.addEventListener("fsc-theme",function(){ if(!glas()) both(function(d){ d.unlift(); }); requestAnimationFrame(again); });
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(again,function(){});
  if(RMQ&&RMQ.addEventListener) RMQ.addEventListener("change",function(){ if(rail) rail.classList.toggle("lq-hov",!still()); if(still()) both(function(d){ d.unlift(); }); FSC.lqSync(); });
};
/* Symbole in fester Seiten-Markup (data-ico="name") */
function fillIcons(){ Array.prototype.forEach.call(document.querySelectorAll("[data-ico]"),function(el){ if(el._ico) return; el._ico=1; el.insertAdjacentHTML("afterbegin",FSC.svg(el.getAttribute("data-ico"))); }); }

/* ---------- Deep-Links (Mitteilungen, Links, Adresszeile) ----------
   „#ansicht“ öffnet die Seite – auch versteckte wie „#conn“ (Verbindungen); „#ansicht/aktion:arg“ ruft danach F.actions[aktion](arg) auf,
   sobald die Daten geladen sind (z. B. „#kunden/lead:<id>“, „#geld/fin:invd:<id>“); „#/aktion:arg“ bleibt auf der aktuellen Seite.
   Nur Sprung- und Öffnen-Aktionen (FSC.deepActs) – ein fremder Link kann so nie etwas senden, buchen oder löschen.
   Unbekannte Hashes (z. B. „#bank-verbunden“) bleiben wie bisher unberührt. */
FSC.deepActs={fin:1,lead:1,bkshow:1,prord:1,tkprojopen:1,tkopen:1,sdct:1,sdinv:1,sdtab:1,mmailto:1,mail:1,pltab:1,website:1,chopen:1,conn:1,settings:1,pushcfg:1,search:1};
var DEEP=null;
FSC.parseHash=function(h){
  h=String(h||"").replace(/^#/,""); if(!h) return null;
  try{ h=decodeURIComponent(h); }catch(e){}
  var i=h.indexOf("/"), v=i>-1?h.slice(0,i):h, a=i>-1?h.slice(i+1):"", j=a.indexOf(":"), k=j>-1?a.slice(0,j):a, arg=j>-1?a.slice(j+1):"";
  if(v&&!FSC.views.some(function(x){ return x.id===v; })) return null;
  if(k&&!(FSC.deepActs[k]&&FSC.actions[k])) k="";
  if(!v&&!k) return null;
  return {view:v,act:k,arg:arg};
};
function runDeep(){   // nach dem (ersten) Laden; ältere als 2 Minuten verfallen (z. B. Server war lange nicht erreichbar)
  if(!DEEP||!FSC.D) return; var d=DEEP; DEEP=null; if(Date.now()-d.at>120000) return;
  setTimeout(function(){ try{ FSC.actions[d.act](d.arg); }catch(e){ console.error(e); } },0);
}
/* true = Hash war ein Sprungziel. Seitenwechsel nur, wenn nötig (eine offene Seite bleibt sonst unverändert, wie bisher) */
FSC.openHash=function(h){
  var d=FSC.parseHash(h); if(!d) return false;
  if(d.view&&FSC.current!==d.view) FSC.go(d.view);
  else if(d.act){ try{ history.replaceState(null,"","#"+FSC.current); }catch(e){} }   // Aktion nicht in der Adresse lassen (Neu laden wiederholt sie sonst)
  if(d.act){ DEEP={act:d.act,arg:d.arg,at:Date.now()}; runDeep(); }
  return true;
};
window.addEventListener("hashchange",function(){ var h=location.hash.slice(1); if(h&&h!==FSC.current) FSC.openHash(h); });

/* ---------- Start ---------- */
FSC.start = function(){
  fillIcons(); try{ FSC.lqInit(); }catch(e){ console.error(e); }
  try{ var dh=FSC.parseHash(location.hash); if(dh){ if(dh.view) FSC.current=dh.view; if(dh.act){ DEEP={act:dh.act,arg:dh.arg,at:Date.now()}; history.replaceState(null,"",dh.view?"#"+dh.view:location.pathname+location.search); } } }catch(e){}
  if(!FSC.views.some(function(v){return v.id===FSC.current;})) FSC.current=FSC.views[0].id;
  var ys=document.getElementById("year"), cy=new Date().getFullYear(), o=""; for(var y=cy;y>=cy-4;y--) o+='<option value="'+y+'">'+y+'</option>'; ys.innerHTML=o; ys.value=FSC.year;
  ys.addEventListener("change",function(){ FSC.year=ys.value; FSC.D=null; FSC.render(); FSC.load(true); });
  var th=document.getElementById("themeSel"); if(th){ th.value=FSC.theme(); th.addEventListener("change",function(){ FSC.actions.theme(th.value); }); }
  document.getElementById("refresh").addEventListener("click",function(){ FSC.actions.reload(); });
  var sb=document.getElementById("searchBtn"); if(sb) sb.addEventListener("click",function(){ if(FSC.actions.search) FSC.actions.search(); });
  setInterval(function(){ if(!document.hidden&&!FSC.modalOpen()) FSC.load(false); },60000);
  document.addEventListener("visibilitychange",function(){ if(!document.hidden&&FSC.D&&Date.now()-Date.parse(FSC.D.fetchedAt)>60000) FSC.load(false); });
  FSC.priv();
  FSC.render(); FSC.load(false);
};
})();
