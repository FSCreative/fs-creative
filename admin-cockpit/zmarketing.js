/* Marketing: Gewinnspiel-Auslosung mit Video und Marken (Apps) – Server: marketing.js, Bilder/Videos: mkt-render.js.
   Reiter „Planer“ und „Kanäle“ liegen in zmkplan.js (meldet sich über F.mktTab an).
   Gewinnspiel: Teilnehmer einfügen (eine Zeile je Teilnahme) → Zähler (doppelte/ausgeschlossene) → „Jetzt fair auslosen“ (Server, kryptografischer Zufall,
   Protokoll) → Video 1080×1920 wird am Server erzeugt (Namen laufen durch und bleiben beim Gewinner stehen) → Vorschau, Download, Titelbild, Protokoll.
   Marken: Profil je App (Beschreibung, Zielgruppe, Ton, Farben, Logo, Hashtags) – Grundlage für Gewinnspiel-Videos und später die Post-Erstellung. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.mkt='<path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';
F.icons.mgift='<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8S10.5 3.5 8 4.2C5.8 4.8 7 8 12 8zM12 8s1.5-4.5 4-3.8C18.2 4.8 17 8 12 8z"/>';
F.icons.mig='<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1"/>';
F.icons.mdl='<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';

var ST=null, LOADING=false, POLL=null, PARSE=null, PARSE_T=null, BUSY=false;
UI.mktTab=UI.mktTab||F.ls("fsc_mkt_tab")||"planer";
var GW=UI.mktGw=UI.mktGw||Object.assign({brand:"kochdu",title:"Wer gewinnt?",prize:"",winners:1,backups:2,claim:"",dedupe:true,exclude:"",text:""},F.ls("fsc_mkt_gw")||{});
GW.text=GW.text||"";   /* Teilnehmerliste nur im Speicher, nicht im Browser abgelegt */
UI.mktSel=UI.mktSel||"";

F.css(
'.mk-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:16px;align-items:start}'+
'@media(max-width:1000px){.mk-grid{grid-template-columns:minmax(0,1fr)}}'+
'.mk-form{padding:16px 18px;display:grid;gap:12px}'+
'.mk-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}'+
'.mk-row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}'+
'@media(max-width:640px){.mk-row,.mk-row2{grid-template-columns:minmax(0,1fr)}}'+
'.mk-ta{min-height:210px;font-family:var(--f-mono);font-size:13px;line-height:1.5}'+
'.mk-count{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--ink-2);align-items:center}'+
'.mk-count b{color:var(--ink);font-size:15px}'+
'.mk-chips{display:flex;flex-wrap:wrap;gap:5px}'+
'.mk-chips span{font-size:12px;background:var(--sunk);border-radius:99px;padding:2px 9px;color:var(--ink-2)}'+
'.mk-go{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding-top:4px}'+
'.mk-res{padding:16px 18px;display:grid;gap:14px}'+
'.mk-win{display:grid;gap:6px}'+
'.mk-win .k{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);font-weight:700}'+
'.mk-win .w{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--ink);word-break:break-word}'+
'.mk-win ol{margin:0;padding-left:22px;display:grid;gap:2px}'+
'.mk-vid{display:grid;grid-template-columns:200px minmax(0,1fr);gap:16px;align-items:start}'+
'@media(max-width:640px){.mk-vid{grid-template-columns:minmax(0,1fr)}}'+
'.mk-vid video{width:200px;aspect-ratio:9/16;border-radius:14px;background:#111;display:block}'+
'.mk-vacts{display:grid;gap:8px;align-content:start}'+
'.mk-vacts .btn{justify-content:flex-start}'+
'.mk-spin{width:200px;aspect-ratio:9/16;border-radius:14px;background:var(--sunk);display:grid;place-items:center;text-align:center;padding:16px;color:var(--ink-2);font-size:13px}'+
'.mk-spin i{display:block;width:28px;height:28px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--glow);animation:mkspin 0.9s linear infinite;margin:0 auto 10px}'+
'@keyframes mkspin{to{transform:rotate(360deg)}}'+
'.mk-meta{font-size:12.5px;color:var(--ink-2);display:grid;gap:3px}'+
'.mk-meta code{font-size:11.5px;word-break:break-all}'+
'.mk-hist{list-style:none;margin:0;padding:0}'+
'.mk-hist li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:10px 18px;border-top:1px solid var(--line);cursor:pointer;font-size:13.5px}'+
'.mk-hist li:hover{background:var(--sunk)} .mk-hist li[aria-current="true"]{background:var(--glow-soft)}'+
'.mk-hist .s{color:var(--ink-2);font-size:12.5px}'+
'.mk-brands{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}'+
'.mk-b{padding:14px 16px;display:grid;gap:10px;align-content:start}'+
'.mk-b .lg{height:46px;display:flex;align-items:center;justify-content:flex-start;border-radius:10px;padding:6px 10px;background:#fff;border:1px solid var(--line)}'+
'.mk-b .lg.dark{background:#111}'+
'.mk-b .lg img{max-height:34px;max-width:100%;object-fit:contain}'+
'.mk-sw{display:flex;gap:5px} .mk-sw i{width:22px;height:22px;border-radius:6px;border:1px solid var(--line);display:block}'+
'.mk-b p{margin:0;font-size:13px;color:var(--ink-2)}'+
'.mk-bf{display:grid;gap:10px}'+
'.mk-cols{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}'+
'.mk-imp{display:flex;gap:10px;align-items:center;flex-wrap:wrap}'+
'.mk-igg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-height:60vh;overflow:auto}'+
'.mk-igm{display:grid;gap:4px;text-align:left;border:1px solid var(--line);border-radius:12px;padding:6px;background:var(--panel);font:inherit;color:inherit;cursor:pointer}'+
'.mk-igm:hover{border-color:var(--ink-3)} .mk-igm img,.mk-igph{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:var(--sunk);display:block}'+
'.mk-igm .c{font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden} .mk-igm .s{font-size:11.5px;color:var(--ink-2)}'+
'.mk-rules{display:grid;gap:9px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--sunk)}'+
'.mk-rules label{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:14px}'+
'.mk-rules label.dis{color:var(--ink-3)} .mk-rules label.dis span{font-size:12.5px}'+
'.mk-rules .f.mk-n{width:64px;padding:4px 8px} .mk-rules .f.mk-w{width:220px;padding:4px 8px}'+
'.mk-igres{padding:12px 2px;min-height:44px}'+
'.mk-lib{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;max-height:55vh;overflow:auto}'+
'.mk-li{position:relative;border-radius:10px;overflow:hidden;background:var(--sunk);aspect-ratio:4/5}'+
'.mk-li img,.mk-li video{width:100%;height:100%;object-fit:cover;display:block}'+
'.mk-li .btn{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;border:0}'+
'.mk-li .t{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;border-radius:99px;padding:2px 8px}'+
'.mk-cols input[type=color]{width:100%;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:2px}'
);

/* ---------- Laden ---------- */
function api(path,body){ return F.api(path,body?{body:body}:undefined); }
function load(){ if(LOADING) return; LOADING=true; return api("/admin/api/mkt/state").then(function(j){ LOADING=false; ST=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler beim Laden",brands:[],draws:[]}; if(ST.ok&&!ST.brands.some(function(b){ return b.key===GW.brand; })&&ST.brands[0]) GW.brand=ST.brands[0].key; pollIfBusy(); if(F.current==="mkt") F.render(); })
  .catch(function(){ LOADING=false; ST={ok:false,error:"Keine Verbindung zum Server",brands:[],draws:[]}; if(F.current==="mkt") F.render(); }); }
function pollIfBusy(){
  var busy=ST&&ST.draws&&ST.draws.some(function(d){ return d.video&&(d.video.status==="wartet"||d.video.status==="läuft"); });
  clearTimeout(POLL); if(busy) POLL=setTimeout(function(){ api("/admin/api/mkt/state").then(function(j){ if(j&&j.ok){ var was=JSON.stringify((ST.draws||[]).map(function(d){ return d.video.status; })); ST=j; if(F.current==="mkt"&&was!==JSON.stringify(j.draws.map(function(d){ return d.video.status; }))) paintRes(); pollIfBusy(); } }); },2500);
}
function brandOf(k){ return ST&&ST.brands?ST.brands.find(function(b){ return b.key===k; }):null; }
function saveGw(){ var c=Object.assign({},GW); delete c.text; F.ls("fsc_mkt_gw",c); }

/* ---------- Gewinnspiel ---------- */
function defaultExclude(b){ return b&&b.handles&&b.handles.length?b.handles.join("\n"):""; }
function countHtml(){
  if(!GW.text.trim()) return '<span class="muted">Noch keine Teilnehmer eingefügt.</span>';
  if(!PARSE) return '<span class="muted">Zähle …</span>';
  var p=PARSE;
  return '<b>'+p.count.toLocaleString("de-AT")+' Teilnahmen</b>'+(p.mode==="instagram"?'<span>aus Instagram-Kommentaren erkannt</span>':'')+(p.dupes?'<span>'+p.dupes+' doppelte entfernt</span>':'')+(p.excluded?'<span>'+p.excluded+' ausgeschlossen</span>':'')+(p.skipped?'<span>'+p.skipped+(p.skipped===1?' Zeile':' Zeilen')+' übersprungen</span>':'')+
    (p.sample&&p.sample.length?'<div class="mk-chips" style="flex-basis:100%">'+p.sample.map(function(n){ return '<span>'+esc(n)+'</span>'; }).join("")+(p.count>p.sample.length?'<span>+ '+(p.count-p.sample.length).toLocaleString("de-AT")+' weitere</span>':'')+'</div>':'');
}
function paintCount(){ var el=document.getElementById("mkCount"); if(el) el.innerHTML=countHtml(); var b=document.getElementById("mkDraw"); if(b) b.disabled=BUSY||!PARSE||PARSE.count<2||PARSE.count<=GW.winners; }
function reparse(){
  clearTimeout(PARSE_T); PARSE=null; paintCount();
  if(!GW.text.trim()) return;
  PARSE_T=setTimeout(function(){ var snap=GW.text+"|"+GW.exclude+"|"+GW.dedupe; api("/admin/api/mkt/giveaway/parse",{text:GW.text,exclude:GW.exclude,dedupe:GW.dedupe}).then(function(j){ if(snap!==GW.text+"|"+GW.exclude+"|"+GW.dedupe) return; PARSE=j&&j.ok?j:null; paintCount(); }); },300);
}
function formHtml(){
  var opts=(ST.brands||[]).filter(function(b){ return b.enabled!==false; }).map(function(b){ return '<option value="'+esc(b.key)+'"'+(b.key===GW.brand?' selected':'')+'>'+esc(b.name)+'</option>'; }).join("");
  return '<section class="panel"><div class="panel-h"><h2>Neue Auslosung</h2><span class="muted small">Eine Zeile je Teilnahme</span></div><div class="mk-form">'+
    '<div class="mk-row2"><label class="fl">Marke<select class="f" data-mkgw="brand">'+opts+'</select></label>'+
    '<label class="fl">Überschrift im Video<input class="f" data-mkgw="title" maxlength="60" value="'+esc(GW.title)+'" placeholder="Wer gewinnt?"></label></div>'+
    '<label class="fl">Gewinn<input class="f" data-mkgw="prize" maxlength="90" value="'+esc(GW.prize)+'" placeholder="z. B. Gewinn: 50 € kochdu-Gutschein"></label>'+
    '<div class="mk-row"><label class="fl">Gewinner<input class="f" type="number" min="1" max="10" data-mkgw="winners" value="'+(+GW.winners||1)+'"></label>'+
    '<label class="fl">Ersatzgewinner<input class="f" type="number" min="0" max="10" data-mkgw="backups" value="'+(+GW.backups||0)+'"></label>'+
    '<label class="fl" style="align-content:end"><span style="display:flex;gap:8px;align-items:center;padding:9px 0"><input type="checkbox" data-mkgw="dedupe"'+(GW.dedupe!==false?' checked':'')+'> Doppelte nur einmal</span></label></div>'+
    '<div class="mk-imp"><button type="button" class="btn" data-act="mkigimp">'+F.svg("mig")+' Aus Instagram-Beitrag laden</button>'+(GW.source?'<span class="muted small">Geladen: <a href="'+esc(GW.source.permalink||"#")+'" target="_blank" rel="noopener">Instagram-Beitrag</a> · '+esc(rulesTxt(GW.source.rules))+(GW.text!==GW.importedText?' · <b>von Hand geändert</b>':'')+' <button type="button" class="link" data-act="mkigclear">entfernen</button></span>':'<span class="muted small">oder Namen unten einfügen</span>')+'</div>'+
    '<label class="fl">Teilnehmer<textarea class="f mk-ta" data-mkgw="text" spellcheck="false" placeholder="@lisa.montafon\n@markus_bludenz\nAnna Huber\n…">'+esc(GW.text)+'</textarea></label>'+
    '<div class="mk-count" id="mkCount">'+countHtml()+'</div>'+
    '<div class="mk-row2"><label class="fl">Nicht teilnehmen (eigene Konten)<textarea class="f" rows="2" data-mkgw="exclude" placeholder="@kochdu.at">'+esc(GW.exclude)+'</textarea></label>'+
    '<label class="fl">Hinweis für Gewinner<textarea class="f" rows="2" data-mkgw="claim" maxlength="90" placeholder="Bitte melde dich per Direktnachricht bei uns.">'+esc(GW.claim)+'</textarea></label></div>'+
    '<div class="mk-go"><span class="muted small">Gelost wird am Server mit kryptografischem Zufall. Ergebnis und Teilnehmerliste werden protokolliert.</span>'+
    '<button type="button" class="btn primary" id="mkDraw" data-act="mkdraw"'+(BUSY||!PARSE||PARSE.count<2||PARSE.count<=GW.winners?' disabled':'')+'>'+F.svg("mgift")+' Jetzt fair auslosen</button></div>'+
    '</div></section>';
}
function vidHtml(d){
  var v=d.video||{}, base="/admin/api/mkt/giveaway/file?id="+encodeURIComponent(d.id);
  if(v.status==="fertig") return '<div class="mk-vid"><video controls playsinline preload="metadata" poster="'+base+'&kind=poster" src="'+base+'"></video><div class="mk-vacts">'+
    '<a class="btn primary" href="'+base+'&dl=1" download>'+F.svg("mdl")+' Video herunterladen</a>'+
    '<a class="btn" href="'+base+'&kind=cover&dl=1" download>'+F.svg("mdl")+' Titelbild (4:5)</a>'+
    '<a class="btn" href="/admin/api/mkt/giveaway/protocol?id='+encodeURIComponent(d.id)+'" download>'+F.svg("mdl")+' Protokoll</a>'+
    '<span class="muted small">'+(v.duration?String(v.duration).replace(".",",")+' s · ':'')+'1080×1920 · für Reel, Story, TikTok, Shorts</span>'+
    (d.postId?'<button type="button" class="btn" data-act="mktab:planer">Im Planer ansehen</button>':'<button type="button" class="btn" data-act="mkgwpost:'+esc(d.id)+'">'+F.svg("mkt")+' Als Reel einplanen</button>')+
    '<button type="button" class="btn sm" data-act="mkrevideo:'+esc(d.id)+'">Video neu erzeugen</button></div></div>';
  if(v.status==="fehler") return '<div class="notice"><span><b>Video fehlgeschlagen:</b> '+esc(v.error||"unbekannt")+'</span><button type="button" class="btn sm" data-act="mkrevideo:'+esc(d.id)+'">Nochmal versuchen</button></div>'+
    '<a class="btn" href="/admin/api/mkt/giveaway/protocol?id='+encodeURIComponent(d.id)+'" download>'+F.svg("mdl")+' Protokoll</a>';
  return '<div class="mk-vid"><div class="mk-spin"><div><i></i>'+(v.status==="läuft"?'Video wird erstellt …<br><span class="small">dauert etwa 20–40 Sekunden</span>':'Video wartet …')+'</div></div><div class="mk-vacts">'+
    '<a class="btn" href="/admin/api/mkt/giveaway/protocol?id='+encodeURIComponent(d.id)+'" download>'+F.svg("mdl")+' Protokoll</a></div></div>';
}
function resHtml(){
  var ds=ST.draws||[], d=ds.find(function(x){ return x.id===UI.mktSel; })||ds[0];
  var hist=ds.length?'<ul class="mk-hist">'+ds.map(function(x){ var st=x.video&&x.video.status;
    return '<li data-act="mksel:'+esc(x.id)+'" aria-current="'+(d&&x.id===d.id)+'"><span><b>'+esc(x.brandName)+'</b> · '+esc(x.winners.join(", "))+'<br><span class="s">'+new Date(x.at).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})+' · '+x.count.toLocaleString("de-AT")+' Teilnahmen</span></span><span class="s">'+(st==="fertig"?"Video fertig":st==="fehler"?"Fehler":"Video …")+'</span></li>'; }).join("")+'</ul>':'';
  if(!d) return '<section class="panel"><div class="panel-h"><h2>Ergebnis</h2></div><div class="mk-res"><p class="muted" style="margin:0">Noch keine Auslosung. Teilnehmer einfügen und auslosen – danach erscheint hier das Video zum Herunterladen.</p></div></section>';
  return '<section class="panel"><div class="panel-h"><h2>Ergebnis</h2><span class="muted small">'+new Date(d.at).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})+'</span></div><div class="mk-res">'+
    '<div class="mk-win"><span class="k">'+esc(d.brandName)+' · '+(d.winners.length>1?d.winners.length+" Gewinner":"Gewonnen hat")+'</span>'+(d.winners.length>1?'<ol class="w" style="font-size:20px">'+d.winners.map(function(w){ return '<li>'+esc(w)+'</li>'; }).join("")+'</ol>':'<span class="w">'+esc(d.winners[0])+'</span>')+
    (d.backups&&d.backups.length?'<span class="muted small">Ersatz, falls sich niemand meldet: '+d.backups.map(esc).join(" → ")+'</span>':'')+'</div>'+
    vidHtml(d)+
    '<div class="mk-meta"><span>'+d.count.toLocaleString("de-AT")+' gültige Teilnahmen'+(d.dupes?' · '+d.dupes+' doppelte entfernt':'')+(d.excluded?' · '+d.excluded+' ausgeschlossen':'')+'</span><span>Prüfsumme der Liste: <code>'+esc(d.hash.slice(0,24))+'…</code></span></div>'+
    '<div><button type="button" class="btn sm danger" data-act="mkdel:'+esc(d.id)+'">Auslosung löschen</button></div>'+
    '</div>'+(ds.length>1?'<div class="panel-h" style="border-top:1px solid var(--line);border-bottom:0"><h2>Frühere Auslosungen</h2></div>'+hist:'')+'</section>';
}
function paintRes(){ var el=document.getElementById("mkRes"); if(el) el.innerHTML=resHtml(); }
function gwHtml(){ return '<div class="mk-grid">'+formHtml()+'<div id="mkRes">'+resHtml()+'</div></div>'; }

F.listen("input","[data-mkgw]",function(el){ var k=el.getAttribute("data-mkgw"); if(k==="brand"||k==="dedupe") return;
  if(k==="dedupe") GW.dedupe=el.checked; else if(k==="winners"||k==="backups") GW[k]=Math.max(k==="winners"?1:0,Math.min(10,parseInt(el.value,10)||0)); else GW[k]=el.value;
  saveGw(); if(k==="text"||k==="exclude"||k==="dedupe") reparse(); else paintCount();
  if(k==="text"&&GW.source){ var imp=document.querySelector(".mk-imp b"); if(!imp&&GW.text!==GW.importedText){ var sp=document.querySelector(".mk-imp .muted"); if(sp) sp.insertAdjacentHTML("beforeend"," · <b>von Hand geändert</b>"); } } });
F.listen("change","[data-mkgw]",function(el){ var k=el.getAttribute("data-mkgw");
  if(k==="brand"){ var old=brandOf(GW.brand), nb=brandOf(el.value); if(!GW.exclude.trim()||GW.exclude===defaultExclude(old)) GW.exclude=defaultExclude(nb); GW.brand=el.value; saveGw(); F.render(); reparse(); }
  if(k==="dedupe"){ GW.dedupe=el.checked; saveGw(); reparse(); } });
F.action("mkdraw",function(){
  if(BUSY||!PARSE) return;
  var n=PARSE.count, b=brandOf(GW.brand);
  F.confirm("Jetzt "+(GW.winners>1?GW.winners+" Gewinner":"den Gewinner")+" aus "+n.toLocaleString("de-AT")+" Teilnahmen für "+(b?b.name:"")+" auslosen? Das Ergebnis wird protokolliert.","Auslosen",function(){
    BUSY=true; paintCount();
    var src=GW.source?Object.assign({},GW.source,{edited:GW.text!==GW.importedText}):null;
    api("/admin/api/mkt/giveaway/draw",{confirm:true,brand:GW.brand,title:GW.title,prize:GW.prize,claim:GW.claim,winners:GW.winners,backups:GW.backups,dedupe:GW.dedupe,exclude:GW.exclude,text:GW.text,source:src}).then(function(j){
      BUSY=false; if(!j||!j.ok){ F.toast((j&&j.error)||"Auslosung fehlgeschlagen",true); paintCount(); return; }
      ST.draws=[j.draw].concat(ST.draws||[]); UI.mktSel=j.draw.id; F.toast("Ausgelost: "+j.draw.winners.join(", ")); paintRes(); paintCount(); pollIfBusy();
    }).catch(function(){ BUSY=false; paintCount(); F.toast("Keine Verbindung zum Server",true); });
  });
});
F.action("mksel",function(id){ UI.mktSel=id; paintRes(); });
F.action("mkrevideo",function(id){ api("/admin/api/mkt/giveaway/video",{id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); ST.draws=ST.draws.map(function(d){ return d.id===id?j.draw:d; }); paintRes(); pollIfBusy(); }); });
F.action("mkdel",function(id){ F.confirm("Diese Auslosung samt Video und Protokoll löschen?","Löschen",function(){ api("/admin/api/mkt/giveaway/delete",{id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); ST.draws=ST.draws.filter(function(d){ return d.id!==id; }); if(UI.mktSel===id) UI.mktSel=""; paintRes(); F.toast("Gelöscht"); }); },true); });

F.action("mkgwpost",function(id){ api("/admin/api/mkt/giveaway/post",{id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true);
  ST.draws=ST.draws.map(function(d){ return d.id===id?Object.assign({},d,{postId:j.postId}):d; }); F.toast("Als Reel im Planer – dort Plattformen wählen und Go geben"); if(F.mktPlanReload) F.mktPlanReload(); UI.mktTab="planer"; F.ls("fsc_mkt_tab","planer"); F.render(); }); });

/* ---------- Teilnehmer aus einem Instagram-Beitrag ---------- */
var IGI=null;   /* {brand, media:[], sel, rules, res, loading} */
function rulesTxt(r){ r=r||{}; return [r.minTags?"mind. "+r.minTags+" markiert":"", r.keyword?"Stichwort „"+r.keyword+"“":"", r.until?"bis "+new Date(r.until).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"", r.replies?"mit Antworten":"", r.perComment?"jeder Kommentar = 1 Los":"1 Los je Person"].filter(Boolean).join(" · "); }
function igHasChannel(){ var P=F.mktPlan&&F.mktPlan(); return !!(P&&P.channels&&P.channels.some(function(c){ return c.brand===GW.brand&&c.platform==="instagram"&&c.status==="ok"; })); }
F.action("mkigimp",function(){
  if(!igHasChannel()){ F.modal('<div class="row-between"><h2 style="font-size:19px">Instagram verbinden</h2>'+F.btnClose()+'</div><p>Für den Import muss das Instagram-Konto von '+esc((brandOf(GW.brand)||{}).name||GW.brand)+' mit dem Cockpit verbunden sein (Business- oder Creator-Konto).</p><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Später</button><button type="button" class="btn primary" data-act="mkgokan">Zu den Kanälen</button></span></div>',"narrow"); return; }
  IGI={brand:GW.brand,media:null,sel:null,rules:Object.assign({minTags:1,keyword:"",until:"",replies:false,perComment:false,excludeOwn:true},(GW.source&&GW.source.rules)||{}),res:null,loading:true};
  igPaint(); api("/admin/api/mkt/ig-media?brand="+encodeURIComponent(GW.brand)).then(function(j){ if(!IGI) return; IGI.loading=false; if(!j||!j.ok){ IGI.err=(j&&j.error)||"Fehler"; } else IGI.media=j.media; igPaint(); });
});
F.action("mkgokan",function(){ F.closeModal(); UI.mktTab="kanaele"; F.ls("fsc_mkt_tab","kanaele"); F.render(); });
function igPaint(){
  if(!IGI) return; var h='<div class="row-between"><h2 style="font-size:19px">Teilnehmer aus Instagram</h2>'+F.btnClose()+'</div>';
  if(IGI.err) h+='<div class="notice"><span>'+esc(IGI.err)+'</span></div>';
  else if(!IGI.sel){
    h+=IGI.loading||!IGI.media?'<p class="muted">Lade deine letzten Beiträge …</p>':!IGI.media.length?'<p class="muted">Keine Beiträge gefunden.</p>':
      '<p class="muted small" style="margin:4px 0 10px">Welcher Beitrag war das Gewinnspiel?</p><div class="mk-igg">'+IGI.media.map(function(m){ return '<button type="button" class="mk-igm" data-act="mkigsel:'+esc(m.id)+'">'+(m.thumb?'<img src="'+esc(m.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="mk-igph"></span>')+'<span class="c">'+esc(m.caption||"(ohne Text)")+'</span><span class="s">'+new Date(m.at).toLocaleDateString("de-AT")+' · '+m.comments+' Kommentare</span></button>'; }).join("")+'</div>';
  } else {
    var r=IGI.rules, st=IGI.res&&IGI.res.stats, m=IGI.media.find(function(x){ return x.id===IGI.sel; })||{};
    h+='<p class="small" style="margin:4px 0 10px"><a href="'+esc(m.url||"#")+'" target="_blank" rel="noopener">Beitrag vom '+new Date(m.at).toLocaleDateString("de-AT")+'</a> · '+esc((m.caption||"").slice(0,80))+' <button type="button" class="link" data-act="mkigback">anderer Beitrag</button></p>'+
      '<div class="mk-rules"><b>Was muss gegeben sein?</b>'+
      '<label><input type="checkbox" checked disabled> Kommentar unter dem Beitrag</label>'+
      '<label><input type="checkbox" data-igr="tagsOn"'+(r.minTags>0?' checked':'')+'> Mindestens <input class="f mk-n" type="number" min="1" max="10" data-igr="minTags" value="'+(r.minTags||1)+'"> Person(en) markiert (@name)</label>'+
      '<label><input type="checkbox" data-igr="kwOn"'+(r.keyword?' checked':'')+'> Kommentar enthält <input class="f mk-w" data-igr="keyword" placeholder="z. B. #kochdu, Pizza" value="'+esc(r.keyword||"")+'"></label>'+
      '<label><input type="checkbox" data-igr="untilOn"'+(r.until?' checked':'')+'> Teilnahmeschluss <input class="f mk-w" type="datetime-local" data-igr="until" value="'+esc(r.until?localDT(r.until):"")+'"></label>'+
      '<label><input type="checkbox" data-igr="replies"'+(r.replies?' checked':'')+'> Antworten auf Kommentare zählen mit</label>'+
      '<label><input type="checkbox" data-igr="perComment"'+(r.perComment?' checked':'')+'> Jeder Kommentar ist ein eigenes Los (sonst jede Person nur einmal)</label>'+
      '<label><input type="checkbox" data-igr="excludeOwn"'+(r.excludeOwn!==false?' checked':'')+'> Eigenes Konto ausschließen</label>'+
      '<label class="dis"><input type="checkbox" disabled> Beitrag mit „Gefällt mir“ markiert <span>– nicht prüfbar</span></label>'+
      '<label class="dis"><input type="checkbox" disabled> Folgt dem Konto <span>– nicht prüfbar</span></label>'+
      '<label class="dis"><input type="checkbox" disabled> In der Story geteilt <span>– nicht prüfbar</span></label>'+
      '<p class="muted small" style="margin:2px 0 0">Instagram gibt Likes, Follower und Story-Teilungen über seine offizielle Schnittstelle nicht heraus.</p></div>'+
      '<div class="mk-igres" id="mkIgRes">'+igResHtml()+'</div>'+
      '<div class="foot"><button type="button" class="btn sm" data-act="mkigreload">Kommentare neu laden</button><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="button" class="btn primary" data-act="mkigok"'+(IGI.res&&IGI.res.participants.length?'':' disabled')+'>Übernehmen</button></span></div>';
  }
  F.modal(h,"wide");
}
function localDT(iso){ var d=new Date(iso); if(isNaN(d)) return ""; var z=function(n){ return String(n).padStart(2,"0"); }; return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())+"T"+z(d.getHours())+":"+z(d.getMinutes()); }
function igResHtml(){
  if(!IGI||IGI.loading) return '<span class="muted">Lade Kommentare …</span>'; if(!IGI.res) return '';
  var st=IGI.res.stats, out=[st.late?st.late+" nach Schluss":"",st.tags?st.tags+" zu wenige Markierungen":"",st.keyword?st.keyword+" ohne Stichwort":"",st.dupes?st.dupes+" weitere Kommentare derselben Person":"",st.excluded?st.excluded+(st.excluded===1?" eigenes Konto":" eigene Konten"):"",!IGI.rules.replies&&st.replies?st.replies+" Antworten":""].filter(Boolean);
  return '<b>'+IGI.res.participants.length.toLocaleString("de-AT")+' Lose</b> von '+IGI.res.persons.toLocaleString("de-AT")+' Personen aus '+st.total.toLocaleString("de-AT")+' Kommentaren'+(out.length?'<br><span class="muted small">Raus: '+out.join(" · ")+'</span>':'');
}
function igRun(reload){ if(!IGI||!IGI.sel) return; IGI.loading=true; var el=document.getElementById("mkIgRes"); if(el) el.innerHTML=igResHtml(); var snap=JSON.stringify(IGI.rules);
  api("/admin/api/mkt/ig-participants",{brand:IGI.brand,media:IGI.sel,rules:IGI.rules,reload:!!reload}).then(function(j){ if(!IGI||snap!==JSON.stringify(IGI.rules)) return; IGI.loading=false; if(!j||!j.ok){ IGI.res=null; var e=document.getElementById("mkIgRes"); if(e) e.innerHTML='<span class="bad-t">'+esc((j&&j.error)||"Fehler")+'</span>'; return; } IGI.res=j; IGI.loadedAt=new Date().toISOString(); var e2=document.getElementById("mkIgRes"); if(e2) e2.innerHTML=igResHtml(); var b=document.querySelector('[data-act="mkigok"]'); if(b) b.disabled=!j.participants.length; }); }
F.action("mkigsel",function(id){ if(!IGI) return; IGI.sel=id; IGI.res=null; igPaint(); igRun(false); });
F.action("mkigback",function(){ if(!IGI) return; IGI.sel=null; IGI.res=null; igPaint(); });
F.action("mkigreload",function(){ igRun(true); });
var IGT=null;
F.listen("input","[data-igr]",function(el){ if(!IGI) return; var k=el.getAttribute("data-igr"), r=IGI.rules, form=el.closest(".mk-rules"), v=function(n){ return form.querySelector('[data-igr="'+n+'"]'); };
  r.minTags=v("tagsOn").checked?Math.max(1,parseInt(v("minTags").value,10)||1):0;
  r.keyword=v("kwOn").checked?v("keyword").value.trim():""; if(k==="keyword"&&el.value.trim()&&!v("kwOn").checked){ v("kwOn").checked=true; r.keyword=el.value.trim(); }
  if(k==="until"&&el.value&&!v("untilOn").checked) v("untilOn").checked=true;
  r.until=v("untilOn").checked&&v("until").value?new Date(v("until").value).toISOString():"";
  r.replies=v("replies").checked; r.perComment=v("perComment").checked; r.excludeOwn=v("excludeOwn").checked;
  clearTimeout(IGT); IGT=setTimeout(function(){ igRun(false); },350); });
F.action("mkigok",function(){ if(!IGI||!IGI.res) return; var m=IGI.media.find(function(x){ return x.id===IGI.sel; })||{};
  GW.text=IGI.res.participants.join("\n"); GW.importedText=GW.text; GW.dedupe=!IGI.rules.perComment;
  GW.source={type:"instagram",media:IGI.sel,permalink:m.url||"",caption:(m.caption||"").slice(0,160),loadedAt:IGI.loadedAt||new Date().toISOString(),rules:Object.assign({},IGI.rules),stats:IGI.res.stats};
  IGI=null; F.closeModal(); saveGw(); F.render(); reparse(); F.toast("Teilnehmer übernommen"); });
F.action("mkigclear",function(){ GW.source=null; GW.importedText=""; F.render(); });

/* ---------- Marken ---------- */
function swatch(c){ return c?'<i style="background:'+esc(c)+'" title="'+esc(c)+'"></i>':''; }
function brandsHtml(){
  return '<p class="muted" style="margin:0 0 12px">Das Profil jeder App ist die Grundlage für Videos und Posts: Farben, Logo, Tonfall, Zielgruppe und Hashtags.</p><div class="mk-brands">'+(ST.brands||[]).map(function(b){ var c=b.colors||{};
    return '<div class="panel mk-b"><div class="lg'+(b.logoBg==="dark"?' dark':'')+'">'+(b.logo||b.logoUploaded?'<img src="/admin/api/mkt/logo?key='+encodeURIComponent(b.key)+'&v='+encodeURIComponent(b.logoUploaded?"u":"d")+'" alt="" onerror="this.replaceWith(document.createTextNode(\'kein Logo\'))">':'<span class="muted small">kein Logo – bitte hochladen</span>')+'</div>'+
      '<div class="row-between"><b>'+esc(b.name)+'</b><div class="mk-sw">'+swatch(c.primary)+swatch(c.dark)+swatch(c.light)+swatch(c.accent)+'</div></div>'+
      '<p>'+esc(b.oneLiner||"")+'</p><div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn sm" data-act="mkbrand:'+esc(b.key)+'">Bearbeiten</button><button type="button" class="btn sm" data-act="mklib:'+esc(b.key)+'">Bilder & Videos</button></div></div>'; }).join("")+'</div>';
}
function lines(a){ return (a||[]).join("\n"); }
F.action("mkbrand",function(key){
  var b=brandOf(key); if(!b) return; var c=b.colors||{};
  var col=function(k,l){ return '<label class="fl">'+l+'<input type="color" data-mkc="'+k+'" value="'+esc(c[k]||"#888888")+'"></label>'; };
  var ta=function(k,l,v,r){ return '<label class="fl">'+l+'<textarea class="f" rows="'+(r||3)+'" name="'+k+'">'+esc(v||"")+'</textarea></label>'; };
  F.modal('<form data-form="mkbrand" class="mk-bf" data-key="'+esc(key)+'"><div class="row-between"><h2 style="font-size:19px">'+esc(b.name)+'</h2>'+F.btnClose()+'</div>'+
    '<div class="mk-row2"><label class="fl">Name<input class="f" name="name" value="'+esc(b.name)+'"></label><label class="fl">Website<input class="f" name="url" value="'+esc(b.url||"")+'"></label></div>'+
    '<label class="fl">Ein Satz<input class="f" name="oneLiner" value="'+esc(b.oneLiner||"")+'"></label>'+
    ta("whatItIs","Was ist es?",b.whatItIs,3)+ta("audience","Zielgruppe",b.audience,2)+
    '<label class="fl">Tonfall<input class="f" name="tone" value="'+esc(b.tone||"")+'"></label>'+
    '<div class="mk-row2">'+ta("usps","Stärken (eine je Zeile)",lines(b.usps),4)+ta("pillars","Themen für Posts (eine je Zeile)",lines(b.pillars),4)+'</div>'+
    '<div class="mk-row2">'+ta("hashtags","Hashtags",(b.hashtags||[]).join(" "),3)+ta("ctas","Aufrufe zum Handeln (eine je Zeile)",lines(b.ctas),3)+'</div>'+
    '<div class="mk-row2"><label class="fl">Eigene Konten (z. B. @kochdu.at)<input class="f" name="handles" value="'+esc((b.handles||[]).join(" "))+'"></label>'+
    '<label class="fl">App Store<input class="f" name="appStoreUrl" value="'+esc(b.appStoreUrl||"")+'"></label></div>'+
    ta("seasonality","Saison",b.seasonality,2)+ta("guardrails","Nicht erwähnen / Regeln",b.guardrails,2)+
    ta("standing","Dauerhafte Vorgaben für Posts (gelten bei jedem Generieren, z. B. „immer Wirte namentlich nennen, nie Preise“)",b.standing,3)+
    '<div><span class="muted small">Farben</span><div class="mk-cols">'+col("primary","Haupt")+col("dark","Dunkel")+col("light","Hell")+col("ink","Text")+col("accent","Akzent")+'</div></div>'+
    '<div class="mk-row2"><label class="fl">Logo hochladen (PNG, JPG, SVG)<input class="f" type="file" accept="image/png,image/jpeg,image/svg+xml" id="mkLogo"></label>'+
    '<label class="fl">Logo-Hintergrund<select class="f" name="logoBg"><option value="light"'+(b.logoBg!=="dark"?' selected':'')+'>Weiß (für dunkle Logos)</option><option value="dark"'+(b.logoBg==="dark"?' selected':'')+'>Dunkel (für helle Logos)</option></select></label></div>'+
    '<div class="foot"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="enabled"'+(b.enabled!==false?' checked':'')+'> aktiv</label><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></span></div></form>',"wide");
});
F.form("mkbrand",function(form){
  var key=form.getAttribute("data-key"), g=function(n){ var el=form.querySelector('[name="'+n+'"]'); return el?el.value:""; }, ls=function(n){ return g(n).split("\n").map(function(s){ return s.trim(); }).filter(Boolean); };
  var patch={name:g("name"),url:g("url"),oneLiner:g("oneLiner"),whatItIs:g("whatItIs"),audience:g("audience"),tone:g("tone"),usps:ls("usps"),pillars:ls("pillars"),ctas:ls("ctas"),
    hashtags:g("hashtags").split(/[\s,]+/).filter(Boolean).map(function(h){ return h.charAt(0)==="#"?h:"#"+h; }),handles:g("handles").split(/[\s,]+/).filter(Boolean).map(function(h){ return h.charAt(0)==="@"?h:"@"+h; }),
    appStoreUrl:g("appStoreUrl"),seasonality:g("seasonality"),guardrails:g("guardrails"),standing:g("standing"),logoBg:g("logoBg"),enabled:form.querySelector('[name="enabled"]').checked,colors:{}};
  Array.prototype.forEach.call(form.querySelectorAll("[data-mkc]"),function(el){ patch.colors[el.getAttribute("data-mkc")]=el.value; });
  var file=document.getElementById("mkLogo"), f=file&&file.files&&file.files[0];
  var go=function(){ api("/admin/api/mkt/brand",{key:key,patch:patch}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Speichern fehlgeschlagen",true); ST.brands=ST.brands.map(function(b){ return b.key===key?j.brand:b; }); F.closeModal(); F.toast("Gespeichert"); F.render(); }); };
  if(f){ if(f.size>3e6) return F.toast("Logo zu groß (max. 3 MB)",true); var r=new FileReader(); r.onload=function(){ patch.logoData=String(r.result); go(); }; r.readAsDataURL(f); } else go();
});

/* ---------- Bildersammlung je Marke (für Posts und Reels) ---------- */
var LIBK=null;
function libPaint(items){
  var b=brandOf(LIBK)||{name:LIBK};
  F.modal('<div class="row-between"><h2 style="font-size:19px">Bilder & Videos – '+esc(b.name)+'</h2>'+F.btnClose()+'</div>'+
    '<p class="muted small" style="margin:4px 0 12px">Daraus nimmt der Planer Fotos für Posts und Hintergründe für Reels. Eigene Fotos (JPG/PNG) und kurze Hochformat-Videos (MP4) machen die Posts persönlicher.</p>'+
    (items?(items.length?'<div class="mk-lib">'+items.map(function(x){ var src="/admin/api/mkt/library-file?brand="+encodeURIComponent(LIBK)+"&id="+encodeURIComponent(x.id);
      return '<div class="mk-li">'+(x.kind==="clip"?'<video src="'+src+'" muted playsinline preload="metadata"></video><span class="t">Video</span>':'<img src="'+src+'" alt="" loading="lazy">')+'<button type="button" class="btn icon sm" data-act="mklibdel:'+esc(x.id)+'" title="Entfernen" aria-label="Entfernen">'+F.svg("close")+'</button></div>'; }).join("")+'</div>':'<p class="muted">Noch keine Bilder.</p>'):'<p class="muted">Lade …</p>')+
    '<div class="foot"><label class="btn"><input type="file" id="mkLibUp" accept="image/jpeg,image/png,video/mp4" multiple hidden> Hochladen</label><span class="muted small" id="mkLibMsg"></span><button type="button" class="btn" data-closemodal>Fertig</button></div>',"wide");
}
function libLoad(){ api("/admin/api/mkt/library?brand="+encodeURIComponent(LIBK)).then(function(j){ if(LIBK) libPaint(j&&j.ok?j.items:[]); }); }
F.action("mklib",function(k){ LIBK=k; libPaint(null); libLoad(); });
F.action("mklibdel",function(id){ F.confirm("Aus der Sammlung entfernen?","Entfernen",function(){ api("/admin/api/mkt/library",{brand:LIBK,remove:id}).then(function(){ libLoad(); }); },true); });
F.listen("change","#mkLibUp",function(el){ var files=Array.prototype.slice.call(el.files||[]), msg=document.getElementById("mkLibMsg"), chain=Promise.resolve(), n=0;
  files.forEach(function(f){ chain=chain.then(function(){ if(msg) msg.textContent="Lade hoch … "+(++n)+" von "+files.length;
    if(/^video\//.test(f.type)){ if(f.size>80e6){ F.toast(f.name+": zu groß (max. 80 MB)",true); return; } return fetch("/admin/api/mkt/library-clip?brand="+encodeURIComponent(LIBK)+"&name="+encodeURIComponent(f.name),{method:"PUT",body:f,credentials:"same-origin"}).then(function(r){ return r.json(); }).then(function(j){ if(!j||!j.ok) F.toast((j&&j.error)||"Fehler",true); }); }
    if(f.size>10e6){ F.toast(f.name+": zu groß (max. 10 MB)",true); return; }
    return new Promise(function(ok){ var r=new FileReader(); r.onload=function(){ api("/admin/api/mkt/library",{brand:LIBK,name:f.name,data:String(r.result)}).then(function(j){ if(!j||!j.ok) F.toast((j&&j.error)||"Fehler",true); ok(); }); }; r.readAsDataURL(f); }); }); });
  chain.then(function(){ libLoad(); }); });

/* ---------- Seite ---------- */
/* Reiter: {id,label,order,sub,render,right} – Planer/Kanäle kommen aus zmkplan.js */
var TABS=F.mktTabs=F.mktTabs||[];
F.mktTab=function(t){ TABS.push(t); TABS.sort(function(a,b){ return a.order-b.order; }); };
F.mktTab({id:"gewinnspiel",label:"Gewinnspiel",order:2,sub:"Fair auslosen und ein Video für Reel, Story und TikTok bekommen",render:function(){ return gwHtml(); }});
F.mktTab({id:"marken",label:"Marken",order:4,sub:"Profile deiner Apps",render:function(){ return brandsHtml(); }});
F.mktState=function(){ return ST; };
F.mktReload=function(){ return load(); };
function render(){
  if(!ST){ load(); return F.head("Marketing","Posts, Reels, Gewinnspiele")+'<div class="muted" style="padding:20px">Lade …</div>'; }
  if(!ST.ok) return F.head("Marketing","")+'<div class="notice"><span>'+esc(ST.error||"Fehler")+'</span><button type="button" class="btn sm" data-act="mkreload">Erneut versuchen</button></div>';
  var tab=TABS.find(function(t){ return t.id===UI.mktTab; })||TABS[0];
  var warn=ST.render&&!ST.render.video?'<div class="notice" style="margin-bottom:12px"><span>Die Video-Erzeugung ist am Server noch nicht bereit (ffmpeg fehlt).</span></div>':'';
  return F.head("Marketing",tab.sub||"",tab.right?tab.right():"")+'<nav class="subnav" aria-label="Marketing" style="margin-bottom:14px">'+TABS.map(function(t){ return '<button type="button" data-act="mktab:'+t.id+'" aria-current="'+(t.id===tab.id)+'">'+t.label+'</button>'; }).join("")+'</nav>'+warn+tab.render();
}
F.action("mktab",function(t){ UI.mktTab=t; F.ls("fsc_mkt_tab",t); if(t==="gewinnspiel"||t==="marken") load(); if((t==="planer"||t==="kanaele")&&F.mktPlanReload) F.mktPlanReload(); F.render(); });
F.action("mkreload",function(){ ST=null; F.render(); });
F.view({id:"mkt",label:"Marketing",short:"Marketing",icon:"mkt",order:18,render:render,after:function(){ if(GW.text.trim()&&!PARSE) reparse(); TABS.forEach(function(t){ if(t.id===UI.mktTab&&t.after) t.after(); }); }});
})();
