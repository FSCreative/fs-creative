/* Verbindungen: alle Schnittstellen auf einen Blick – Zustand, was davon abhängt, „Jetzt prüfen“ und der direkte Weg zur Behebung.
   Öffnen: data-act="conn" bzw. "conn:<key>" (klappt diese Verbindung auf und scrollt hin). Versteckte Seite (nicht in der Leiste).
   Daten: GET /admin/api/connections (nur Zwischenspeicher, schnell), POST /admin/api/connections/check {key} bzw. {all:true} (frisch, gebremst).
   Kurzfassung kommt mit den Cockpit-Daten (F.D.connections) – daraus die Hinweise auf „Heute“. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;

var S={items:null,summary:null,cats:[],at:0,loading:false,err:"",busy:{},all:false,open:{},focus:"",showOff:false};
var WORD={ok:"läuft",warn:"Hinweis",error:"Störung",off:"nicht eingerichtet",pending:"wird geprüft"};
/* Markenfarben für die Symbol-Kacheln (nur als Tönung, Text bleibt lesbar) */
var TINT={mail:"#5aa9ff","mail-calendar":"#5aa9ff",icloud:"#5ac8fa",kochdu:"#8b5cf6",kantineur:"#f59e0b",blitzdings:"#eab308",valuero:"#22a06b",skikaiser:"#38bdf8",huettengaudi:"#f97316",
  finapi:"#9ff0ff",buchhaltung:"#5eeaa8",ebank:"#2870ed","mollie-org":"#8f9bff","mollie-print":"#8f9bff",paypal:"#3b7bbf",printcom:"#ef4444",finanzonline:"#e11d48",vies:"#3b82f6",fx:"#5eeaa8",
  "mkt-instagram":"#e1306c","mkt-facebook":"#1877f2","mkt-threads":"#a3a3a3","mkt-linkedin":"#0a66c2","mkt-youtube":"#ff3b3b","mkt-tiktok":"#ff0050","mkt-pinterest":"#e60023","mkt-bluesky":"#1185fe",
  pexels:"#05a081","google-seo":"#4285f4",pagespeed:"#fbbc04",whatsapp:"#25d366",push:"#ffc566",ki:"#d97757",cloudflare:"#f48120",railway:"#a855f7",postgres:"#4f8cc9",viw:"#0082c9"};
var MONO={kochdu:"kd",kantineur:"KA",blitzdings:"BD",valuero:"VA",skikaiser:"SK",huettengaudi:"HG",paypal:"PP",pexels:"Px"};

F.css(
'.view-conn .cn{display:grid;gap:14px;max-width:920px;margin:0 auto;padding-bottom:calc(28px + env(safe-area-inset-bottom,0px))}'+
'.cn-top{position:sticky;top:var(--top-h,0px);z-index:6;display:grid;gap:10px;padding:16px 18px;border-radius:var(--r);background:var(--glass-strong,var(--panel));border:1px solid var(--glass-line,var(--line));box-shadow:var(--glass-hi,0 0 0 transparent),var(--shadow,0 0 0 transparent)}'+
'.cn-tt{display:flex;align-items:center;gap:12px;flex-wrap:wrap}'+
'.cn-tt h1{flex:1 1 auto;min-width:0;margin:0;font-size:clamp(22px,3vw,28px);font-weight:700;letter-spacing:-.02em;line-height:1.15;text-wrap:balance}'+
'.cn-all{min-height:44px;padding:0 16px;gap:8px}'+
'.cn-sum{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;font-size:14px;color:var(--ink-2)}'+
'.cn-big{font-size:17px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums}'+
'.cn-chip{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}'+
'.cn-chip i{width:8px;height:8px;border-radius:50%;flex:none}'+
'.cn-chip.warn i{background:var(--warn)}.cn-chip.error i{background:var(--bad)}.cn-chip.error{color:var(--bad)}.cn-chip.off i{border:1.5px solid var(--ink-3)}.cn-chip.pending i{background:var(--glow)}'+
'.cn-bar{display:flex;gap:2px;height:6px;border-radius:99px;overflow:hidden;background:var(--sunk)}'+
'.cn-bar span{display:block;height:100%;min-width:3px}'+
'.cn-bar .ok{background:var(--ok)}.cn-bar .warn{background:var(--warn)}.cn-bar .error{background:var(--bad)}.cn-bar .pending{background:var(--glow-soft)}'+
'.cn-meta{font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}'+
'.cn-grp{background:var(--glass,var(--panel));border:1px solid var(--glass-line,var(--line));border-radius:var(--r);overflow:hidden}'+
'.cn-grp.prob{border-color:color-mix(in srgb,var(--bad) 35%,var(--line))}'+
'.cn-gh{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 16px 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)}'+
'.cn-gh span:last-child{letter-spacing:0;text-transform:none;font-weight:600;font-variant-numeric:tabular-nums}'+
'.cn-row+.cn-row{border-top:1px solid var(--line)}'+
'.cn-hd{display:flex;align-items:center;gap:12px;width:100%;min-height:62px;padding:10px 16px;border:0;background:transparent;color:var(--ink);text-align:left;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
'.cn-hd:hover{background:var(--hover,var(--sunk))}'+
'.cn-hd:focus-visible{outline:2px solid var(--glow);outline-offset:-2px;border-radius:var(--r-sm,12px)}'+
'.cn-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--b,var(--glow)) 20%,transparent);color:color-mix(in srgb,var(--b,var(--glow)) 72%,var(--ink));border:1px solid color-mix(in srgb,var(--b,var(--glow)) 30%,transparent)}'+
'.cn-ic svg{width:20px;height:20px}'+
'.cn-ic b{font-size:13px;font-weight:800;letter-spacing:-.02em}'+
'.cn-t{display:grid;gap:2px;min-width:0;flex:1}'+
'.cn-l{display:flex;align-items:center;gap:8px;min-width:0;font-size:15px;font-weight:600;line-height:1.3}'+
'.cn-l b{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.cn-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--ink-3)}'+
'.cn-dot.ok{background:var(--ok)}.cn-dot.warn{background:var(--warn)}.cn-dot.error{background:var(--bad);box-shadow:0 0 0 3px var(--bad-soft)}'+
'.cn-dot.off{background:transparent;border:1.5px solid var(--ink-3)}.cn-dot.pending{background:var(--glow);animation:cnPulse 1.4s ease-in-out infinite}'+
'.cn-d{font-size:13px;line-height:1.35;color:var(--ink-2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.cn-row.error:not(.open) .cn-d{color:var(--bad)}'+
'.cn-row.off .cn-l b{color:var(--ink-2)}'+
'.cn-chev{flex:none;display:grid;place-items:center;width:24px;height:24px;color:var(--ink-3);transition:transform .2s ease}'+
'.cn-chev svg{width:18px;height:18px}'+
'.cn-row.open .cn-chev{transform:rotate(180deg)}'+
'.cn-b{display:grid;gap:12px;padding:0 16px 16px 68px}'+
'.cn-full{margin:0;font-size:14px;line-height:1.45;color:var(--ink);text-wrap:pretty;hyphens:auto;overflow-wrap:anywhere}'+
'.cn-row.error .cn-full{color:var(--bad)}'+
'.cn-cap{font-size:12px;font-weight:600;color:var(--ink-3);margin-bottom:6px}'+
'.cn-uses{display:flex;flex-wrap:wrap;gap:6px}'+
'.cn-uses span{font-size:12.5px;line-height:1.3;padding:5px 10px;border-radius:99px;background:var(--sunk);color:var(--ink-2)}'+
'.cn-kv{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}'+
'.cn-kv b{font-weight:600;color:var(--ink-2)}'+
'.cn-acts{display:flex;flex-wrap:wrap;gap:8px}'+
'.cn-acts .btn{min-height:44px;padding:0 16px;gap:8px}'+
'.cn-fix{display:grid;gap:8px;padding:12px 14px;border-radius:var(--r-sm,12px);background:var(--sunk);border:1px solid var(--line)}'+
'.cn-fix p{margin:0;font-size:13px;line-height:1.45;color:var(--ink-2);text-wrap:pretty}'+
'.cn-fix b{color:var(--ink)}'+
'.cn-vars{display:flex;flex-wrap:wrap;gap:8px}'+
'.cn-var{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:0 0 0 10px;border-radius:10px;background:var(--field,var(--panel));border:1px solid var(--line)}'+
'.cn-var code{font:600 13px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink);overflow-wrap:anywhere;min-width:0}'+
'.cn-var button{flex:none;width:44px;height:44px;border:0;background:transparent;color:var(--ink-2);border-radius:9px;display:grid;place-items:center;cursor:pointer}'+
'.cn-var button:hover{color:var(--ink);background:var(--hover,var(--sunk))}'+
'.cn-var button svg{width:17px;height:17px}'+
'.cn-offt{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:52px;padding:12px 16px;border:0;background:transparent;color:var(--ink-2);font:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}'+
'.cn-offt:hover{background:var(--hover,var(--sunk))}'+
'.cn-offt svg{width:18px;height:18px;transition:transform .2s ease}'+
'.cn-offt[aria-expanded="true"] svg{transform:rotate(180deg)}'+
'.cn-off .cn-row{border-top:1px solid var(--line)}'+
'.cn-err{padding:14px 16px;border-radius:var(--r-sm,12px);background:var(--bad-soft);color:var(--bad);font-size:14px}'+
'.cn-empty{padding:28px 16px;text-align:center;color:var(--ink-3)}'+
'.cn-spin{display:inline-block;width:16px;height:16px;flex:none;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:cnSpin .8s linear infinite}'+
'.cn-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'+
'@keyframes cnSpin{to{transform:rotate(360deg)}}'+
'@keyframes cnPulse{50%{opacity:.35}}'+
'@media (max-width:900px){.cn-top{top:calc(env(safe-area-inset-top,0px) + 6px);padding:14px 14px 12px}.cn-b{padding:0 14px 16px}.cn-hd{padding:10px 14px}.cn-gh{padding:12px 14px 6px}}'+
'@media (max-width:420px){.cn-all span{display:none}.cn-all{width:44px;padding:0;justify-content:center}}'+
'@media (prefers-reduced-motion:reduce){.cn-spin,.cn-dot.pending{animation:none}.cn-chev,.cn-offt svg{transition:none}}'
);

/* ---------- Symbole (gemeinsame aus core.js, sonst ein kleiner Ersatz) ---------- */
function has(n){ return !!(F.icons&&F.icons[n]); }
function ic(n,fb){ return has(n)?F.svg(n):(fb||""); }
var FB={
  plug:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z"/><path d="M12 16v5"/></svg>',
  refresh:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  chevD:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  external:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
};
function icon(n){ return ic(n,FB[n]||""); }
function tile(x){
  var inner=MONO[x.key]?'<b>'+esc(MONO[x.key])+'</b>':has(x.icon)?F.svg(x.icon):'<b>'+esc(String(x.label||"?").replace(/[^A-Za-zÄÖÜäöü]/g,"").slice(0,2))+'</b>';
  return '<span class="cn-ic" style="--b:'+esc(TINT[x.key]||"var(--glow)")+'" aria-hidden="true">'+inner+'</span>';
}

/* ---------- Daten ---------- */
function load(){
  if(S.loading) return; S.loading=true;
  F.api("/admin/api/connections").then(function(j){
    S.loading=false;
    if(!j||j.ok===false){ S.err=(j&&j.error)||"Verbindungen konnten nicht geladen werden."; }
    else { S.items=j.items||[]; S.summary=j.summary||null; S.cats=j.categories||[]; S.err=""; if(F.D&&j.summary) F.D.connections=j.summary; }
    S.at=Date.now(); if(F.current==="conn") F.render();
  }).catch(function(){ S.loading=false; S.at=Date.now(); S.err="Keine Verbindung zum Server."; if(F.current==="conn") F.render(); });
}
function byKey(k){ return (S.items||[]).filter(function(x){ return x.key===k; })[0]||null; }
function stateOf(x){ return x.pending?"pending":x.state; }
function since(iso){ var s=F.ago(iso); return !s?"":s==="gerade eben"?"gerade eben":s.replace(/^vor /,"seit "); }
function isProblem(x){ return !x.pending&&(x.state==="error"||(x.state==="warn"&&!x.quiet)); }
function sum(){
  var s={ok:0,warn:0,error:0,off:0,pending:0,total:0,checkedAt:null};
  (S.items||[]).forEach(function(x){ s.total++; s[stateOf(x)]++; if(x.checkedAt&&(!s.checkedAt||x.checkedAt>s.checkedAt)) s.checkedAt=x.checkedAt; });
  return s;
}

/* ---------- Ansicht ---------- */
function headHtml(){
  var s=sum(), act=s.total-s.off, chips=[];
  if(s.warn) chips.push('<span class="cn-chip warn"><i></i>'+s.warn+(s.warn===1?" Hinweis":" Hinweise")+'</span>');
  if(s.error) chips.push('<span class="cn-chip error"><i></i>'+s.error+(s.error===1?" Störung":" Störungen")+'</span>');
  if(s.pending) chips.push('<span class="cn-chip pending"><i></i>'+s.pending+" werden geprüft</span>");
  if(s.off) chips.push('<span class="cn-chip off"><i></i>'+s.off+" nicht eingerichtet</span>");
  var seg=function(k){ return s[k]?'<span class="'+k+'" style="flex:'+s[k]+'"></span>':""; };
  var btn='<button type="button" class="btn primary cn-all" data-act="connall"'+(S.all?" disabled":"")+' aria-label="Alle Verbindungen jetzt prüfen">'+(S.all?'<i class="cn-spin" aria-hidden="true"></i>':icon("refresh"))+'<span>'+(S.all?"Prüfe …":"Alle prüfen")+'</span></button>';
  return '<header class="cn-top glass" aria-label="Zusammenfassung">'+
    '<div class="cn-tt"><h1>Verbindungen</h1>'+btn+'</div>'+
    (S.items?'<div class="cn-sum" role="status"><span class="cn-big">'+(act?s.ok+" von "+act+" laufen":"Noch nichts eingerichtet")+'</span>'+chips.join("")+'</div>'+
      '<div class="cn-bar" aria-hidden="true">'+seg("error")+seg("warn")+seg("pending")+seg("ok")+'</div>'+
      '<div class="cn-meta">'+(s.checkedAt?"zuletzt geprüft "+esc(F.ago(s.checkedAt)):"noch nicht geprüft")+'</div>':'<div class="cn-meta">'+(S.err?"":"Lade …")+'</div>')+
  '</header>';
}
function fixHtml(x){
  var f=x.fix; if(!f||f.kind==="none") return "";
  if(f.kind==="railway"){
    var vars=(f.vars||[]).map(function(v){ return '<span class="cn-var"><code>'+esc(v)+'</code><button type="button" data-act="cncopy:'+esc(v)+'" aria-label="'+esc(v)+' kopieren" title="Namen kopieren">'+icon("copy")+'</button></span>'; }).join("");
    return '<div class="cn-fix"><p><b>'+esc(f.label||"In Railway eintragen")+'</b> – '+esc(f.hint||"Railway → Dienst fs-creative → Variables")+'.'+(vars?' Danach startet der Dienst neu und die Verbindung wird automatisch geprüft.':'')+'</p>'+
      (vars?'<div class="cn-vars">'+vars+'</div>':'')+
      '<div class="cn-acts"><a class="btn" href="https://railway.com/dashboard" target="_blank" rel="noopener">'+icon("external")+'Railway öffnen</a></div></div>';
  }
  return "";
}
function fixBtn(x){
  var f=x.fix; if(!f) return "";
  if(f.kind==="action"&&f.act) return '<button type="button" class="btn primary" data-act="cnfix:'+esc(x.key)+'">'+esc(f.label||"Beheben")+'</button>';
  if(f.kind==="link"&&f.url) return '<a class="btn primary" href="'+esc(f.url)+'"'+(/^https:/.test(f.url)?' target="_blank" rel="noopener"':'')+'>'+esc(f.label||"Öffnen")+'</a>';
  return "";
}
function rowHtml(x){
  var st=stateOf(x), open=!!S.open[x.key], busy=!!S.busy[x.key], id="cnb-"+x.key.replace(/[^a-z0-9-]/gi,"");
  var head='<button type="button" class="cn-hd" data-act="cnopen:'+esc(x.key)+'" aria-expanded="'+open+'" aria-controls="'+id+'">'+tile(x)+
    '<span class="cn-t"><span class="cn-l"><i class="cn-dot '+st+'" aria-hidden="true"></i><b>'+esc(x.label)+'</b><span class="cn-sr">: '+WORD[st]+'</span></span>'+
    '<span class="cn-d"'+(open?'':' title="'+esc(x.detail||"")+'"')+'>'+(busy?"Wird geprüft …":esc(open?(x.sub||x.detail||""):(x.detail||x.sub||"")))+'</span></span>'+   // offen: Beschreibung, der Grund steht darunter ganz
    '<span class="cn-chev">'+icon("chevD")+'</span></button>';
  if(!open) return '<div class="cn-row '+st+'" data-cnk="'+esc(x.key)+'">'+head+'</div>';
  var kv=[];
  if(x.checkedAt) kv.push('<span>Geprüft <b>'+esc(F.ago(x.checkedAt))+'</b></span>');
  if(x.state==="ok"&&x.since) kv.push('<span>Läuft <b>'+esc(since(x.since))+'</b></span>');
  if(x.state==="error"&&x.since) kv.push('<span>Störung <b>'+esc(since(x.since))+'</b></span>');
  if(x.state==="error"&&x.lastOkAt) kv.push('<span>Zuletzt in Ordnung <b>'+esc(F.ago(x.lastOkAt))+'</b></span>');
  if(x.stale) kv.push('<span>Prüfung ist schon älter</span>');
  var acts=fixBtn(x)+(x.state==="off"?"":'<button type="button" class="btn" data-act="cncheck:'+esc(x.key)+'"'+(busy?" disabled":"")+'>'+(busy?'<i class="cn-spin" aria-hidden="true"></i>Prüfe …':icon("refresh")+"Jetzt prüfen")+'</button>');
  return '<div class="cn-row '+st+' open" data-cnk="'+esc(x.key)+'">'+head+
    '<div class="cn-b" id="'+id+'" role="region" aria-label="'+esc(x.label)+'">'+
      (x.detail?'<p class="cn-full">'+esc(x.detail)+'</p>':'')+
      fixHtml(x)+
      (acts?'<div class="cn-acts">'+acts+'</div>':'')+
      ((x.usedBy||[]).length?'<div><div class="cn-cap">Davon hängt ab</div><div class="cn-uses">'+x.usedBy.map(function(u){ return '<span>'+esc(u)+'</span>'; }).join("")+'</div></div>':'')+
      (kv.length?'<div class="cn-kv">'+kv.join("")+'</div>':'')+
    '</div></div>';
}
function render(){
  var out='<div class="cn">'+headHtml();
  if(S.err&&!S.items) return out+'<div class="cn-err" role="alert">'+esc(S.err)+' <button type="button" class="btn" data-act="connreload">Erneut versuchen</button></div></div>';
  if(!S.items) return out+'<div class="cn-empty">Lade Verbindungen …</div></div>';
  var items=S.items, prob=items.filter(isProblem).sort(function(a,b){ return (a.state==="error"?0:1)-(b.state==="error"?0:1); });
  var off=items.filter(function(x){ return x.state==="off"&&!x.pending; });
  if(prob.length) out+='<section class="cn-grp glass prob" aria-label="Braucht dich"><div class="cn-gh"><span>Braucht dich</span><span>'+prob.length+'</span></div>'+prob.map(rowHtml).join("")+'</section>';
  var cats=S.cats.slice(); items.forEach(function(x){ if(cats.indexOf(x.category)<0) cats.push(x.category); });
  cats.forEach(function(c){
    var all=items.filter(function(x){ return x.category===c&&x.state!=="off"; }), rows=all.filter(function(x){ return !isProblem(x); });
    if(!rows.length) return;   // alles davon steht schon unter „Braucht dich“
    var okN=all.filter(function(x){ return x.state==="ok"&&!x.pending; }).length;
    out+='<section class="cn-grp glass" aria-label="'+esc(c)+'"><div class="cn-gh"><span>'+esc(c)+'</span><span>'+okN+' von '+all.length+' laufen</span></div>'+rows.map(rowHtml).join("")+'</section>';
  });
  if(off.length) out+='<section class="cn-grp glass cn-off" aria-label="Nicht eingerichtet"><button type="button" class="cn-offt" data-act="cnoff" aria-expanded="'+S.showOff+'"><span>Nicht eingerichtet ('+off.length+')</span>'+icon("chevD")+'</button>'+(S.showOff?off.map(rowHtml).join(""):"")+'</section>';
  return out+'</div>';
}
/* Solange die Seite offen ist: alle 30 s aus dem Zwischenspeicher nachladen – solange etwas „wird geprüft“, alle 5 s */
function schedule(){
  var pend=(S.items||[]).some(function(x){ return x.pending; });
  S.tm=setTimeout(function(){ S.tm=null; if(F.current!=="conn") return; if(!document.hidden&&!S.loading) load(); schedule(); },pend?5000:30000);
}
function after(){
  if(!S.loading&&(!S.items||Date.now()-S.at>30000)) load();
  if(!S.tm) schedule();
  if(S.focus){ var k=S.focus, el=document.querySelector('.cn-row[data-cnk="'+(window.CSS&&CSS.escape?CSS.escape(k):k)+'"]'); if(el){ S.focus=""; el.scrollIntoView({block:"center",behavior:"auto"}); var b=el.querySelector(".cn-hd"); if(b) try{ b.focus({preventScroll:true}); }catch(e){} } }
}
F.view({id:"conn",label:"Verbindungen",short:"Verbindungen",icon:"plug",order:96,hidden:true,render:render,after:after});

/* ---------- Aktionen ---------- */
F.action("conn",function(key){
  if(key){ S.open[key]=true; S.focus=key; var x=byKey(key); if(x&&x.state==="off") S.showOff=true; }
  if(F.current!=="conn") F.go("conn"); else { F.closeModal(); F.closeDrawer(); F._forceRender=true; F.render(); }   // z. B. aus den Einstellungen: Dialog schließen
  if(!S.loading&&(!S.items||Date.now()-S.at>5000)) load();
});
F.action("connreload",function(){ S.err=""; load(); F.render(); });
F.action("cnopen",function(k){ S.open[k]=!S.open[k]; F._forceRender=true; F.render(); });
F.action("cnoff",function(){ S.showOff=!S.showOff; F._forceRender=true; F.render(); });
function applyResult(j){
  if(j.items) S.items=j.items;
  if(j.item){ var i=(S.items||[]).findIndex(function(x){ return x.key===j.item.key; }); if(i>-1) S.items[i]=j.item; }
  if(j.summary){ S.summary=j.summary; if(F.D) F.D.connections=j.summary; }
  S.at=Date.now();
}
F.action("cncheck",function(k){
  if(S.busy[k]) return; S.busy[k]=true; F._forceRender=true; F.render();
  F.api("/admin/api/connections/check",{body:{key:k}}).then(function(j){
    S.busy[k]=false;
    if(!j||j.ok===false){ F.toast((j&&j.error)||"Prüfen fehlgeschlagen",true); F.render(); return; }
    applyResult(j); var x=j.item||byKey(k);
    if(j.limited) F.toast("Eben erst geprüft – in "+j.retryIn+" s wieder möglich");
    else if(x) F.toast(x.label+": "+(x.state==="ok"?"läuft":x.state==="off"?"nicht eingerichtet":x.detail),x.state==="error");
    F._forceRender=true; F.render();
  }).catch(function(){ S.busy[k]=false; F.toast("Keine Verbindung zum Server",true); F.render(); });
});
F.action("connall",function(){
  if(S.all) return; S.all=true; F._forceRender=true; F.render();
  F.api("/admin/api/connections/check",{body:{all:true}}).then(function(j){
    S.all=false;
    if(!j||j.ok===false){ F.toast((j&&j.error)||"Prüfen fehlgeschlagen",true); F.render(); return; }
    applyResult(j); var s=sum();
    if(j.limited) F.toast("Eben erst geprüft – in "+j.retryIn+" s wieder möglich");
    else F.toast(s.error?"Geprüft – "+s.error+(s.error===1?" Störung":" Störungen"):s.warn?"Geprüft – "+s.warn+(s.warn===1?" Hinweis":" Hinweise"):"Geprüft – alles läuft",!!s.error);
    F._forceRender=true; F.render();
  }).catch(function(){ S.all=false; F.toast("Keine Verbindung zum Server",true); F.render(); });
});
/* Behebung: vorhandene Cockpit-Aktion (ggf. erst die passende Seite öffnen) bzw. Link */
function fixOf(k){ var x=byKey(k); if(x&&x.fix) return x.fix; var p=((F.D&&F.D.connections&&F.D.connections.problems)||[]).filter(function(y){ return y.key===k; })[0]; return p&&p.fix||null; }
function runFix(f){
  if(!f) return false;
  if(f.kind==="link"&&f.url){ if(/^https:/.test(f.url)) window.open(f.url,"_blank","noopener"); else location.href=f.url; return true; }
  if(f.kind!=="action"||!f.act) return false;
  var s=String(f.act), i=s.indexOf(":"), k=i>-1?s.slice(0,i):s, v=i>-1?s.slice(i+1):"";
  if(!F.actions[k]){ F.toast("Diese Aktion ist hier gerade nicht verfügbar",true); return true; }
  if(f.go&&F.current!==f.go&&f.go!=="conn") F.go(f.go);
  F.actions[k](v,null,null); return true;
}
F.action("cnfix",function(k){ if(!runFix(fixOf(k))) F.actions.conn(k); });
F.action("cncopy",function(v){
  var ok=function(){ F.toast(v+" kopiert"); };
  var fb=function(){ var t=document.createElement("textarea"); t.value=v; t.setAttribute("readonly",""); t.style.position="fixed"; t.style.opacity="0"; document.body.appendChild(t); t.select(); try{ document.execCommand("copy"); ok(); }catch(e){ F.toast("Bitte markieren und kopieren",true); } t.remove(); };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(ok,fb); else fb();
});

/* ---------- Heute: je Störung ein Hinweis, mehrere Hinweise gebündelt ---------- */
F.feed(function(){
  var c=F.D&&F.D.connections; if(!c||!c.problems) return [];
  var kalHas=!!(F.kalApi&&F.kalApi.CAL&&F.kalApi.CAL.priv&&F.kalApi.CAL.priv.error);   // iCloud-Probleme meldet kal.js schon selbst
  var errs=c.problems.filter(function(p){ return p.state==="error"&&!(p.key==="icloud"&&kalHas); });
  var warns=c.problems.filter(function(p){ return p.state==="warn"&&p.key!=="ki"&&!(p.key==="icloud"&&kalHas); });   // KI-Monatslimit meldet ki.js
  var out=errs.map(function(p){
    var direct=p.fix&&(p.fix.kind==="action"||p.fix.kind==="link");
    return {id:"conn:"+p.key+":"+(p.since||""),rank:2,sev:"bad",icon:"plug",tag:["bad","Verbindung"],t:"Verbindung gestört: "+p.label,d:p.detail||"",
      acts:direct?[[p.fix.label||"Beheben","cnfix:"+p.key,"primary"],["Details","conn:"+p.key]]:[["Beheben","conn:"+p.key,"primary"]]};
  });
  if(warns.length===1){ var w=warns[0]; out.push({id:"conn-w:"+w.key+":"+(w.since||""),rank:5,sev:"warn",icon:"plug",tag:["warn","Verbindung"],t:w.label+": Hinweis",d:w.detail||"",acts:[["Ansehen","conn:"+w.key]]}); }
  else if(warns.length>1) out.push({id:"conn-w:"+warns.map(function(w){ return w.key; }).join(","),rank:5,sev:"warn",icon:"plug",tag:["warn","Verbindungen"],t:warns.length+" Verbindungen mit Hinweisen",d:warns.map(function(w){ return w.label; }).join(", "),acts:[["Ansehen","conn"]]});
  return out;
});

/* ---------- Schnellsuche ---------- */
F.searcher(function(q){
  q=String(q||"").toLowerCase().trim(); if(q.length<2) return [];
  var out=[];
  if(/^(integr|stör|status|api|zugang|railway|token|schlüss)/.test(q)||"verbindungen & schnittstellen".indexOf(q)>-1) out.push({group:"Einstellungen",label:"Verbindungen & Schnittstellen",sub:"Status aller Zugänge prüfen",act:"conn"});
  (S.items||((F.D&&F.D.connections&&F.D.connections.problems)||[])).forEach(function(x){
    if(String(x.label||"").toLowerCase().indexOf(q)<0) return;
    out.push({group:"Verbindungen",label:x.label+" – Verbindung",sub:WORD[x.pending?"pending":x.state]||"",act:"conn:"+x.key});
  });
  return out.slice(0,6);
});
})();
