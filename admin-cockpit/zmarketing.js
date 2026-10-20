/* Marketing: Gewinnspiel-Auslosung mit Video und Marken (Apps) – Server: marketing.js, Bilder/Videos: mkt-render.js.
   Gewinnspiel: Teilnehmer einfügen (eine Zeile je Teilnahme) → Zähler (doppelte/ausgeschlossene) → „Jetzt fair auslosen“ (Server, kryptografischer Zufall,
   Protokoll) → Video 1080×1920 wird am Server erzeugt (Namen laufen durch und bleiben beim Gewinner stehen) → Vorschau, Download, Titelbild, Protokoll.
   Marken: Profil je App (Beschreibung, Zielgruppe, Ton, Farben, Logo, Hashtags) – Grundlage für Gewinnspiel-Videos und später die Post-Erstellung. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.mkt='<path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>';
F.icons.mgift='<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8S10.5 3.5 8 4.2C5.8 4.8 7 8 12 8zM12 8s1.5-4.5 4-3.8C18.2 4.8 17 8 12 8z"/>';
F.icons.mdl='<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';

var ST=null, LOADING=false, POLL=null, PARSE=null, PARSE_T=null, BUSY=false;
UI.mktTab=UI.mktTab||F.ls("fsc_mkt_tab")||"gewinnspiel";
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
  saveGw(); if(k==="text"||k==="exclude"||k==="dedupe") reparse(); else paintCount(); });
F.listen("change","[data-mkgw]",function(el){ var k=el.getAttribute("data-mkgw");
  if(k==="brand"){ var old=brandOf(GW.brand), nb=brandOf(el.value); if(!GW.exclude.trim()||GW.exclude===defaultExclude(old)) GW.exclude=defaultExclude(nb); GW.brand=el.value; saveGw(); F.render(); reparse(); }
  if(k==="dedupe"){ GW.dedupe=el.checked; saveGw(); reparse(); } });
F.action("mkdraw",function(){
  if(BUSY||!PARSE) return;
  var n=PARSE.count, b=brandOf(GW.brand);
  F.confirm("Jetzt "+(GW.winners>1?GW.winners+" Gewinner":"den Gewinner")+" aus "+n.toLocaleString("de-AT")+" Teilnahmen für "+(b?b.name:"")+" auslosen? Das Ergebnis wird protokolliert.","Auslosen",function(){
    BUSY=true; paintCount();
    api("/admin/api/mkt/giveaway/draw",{confirm:true,brand:GW.brand,title:GW.title,prize:GW.prize,claim:GW.claim,winners:GW.winners,backups:GW.backups,dedupe:GW.dedupe,exclude:GW.exclude,text:GW.text}).then(function(j){
      BUSY=false; if(!j||!j.ok){ F.toast((j&&j.error)||"Auslosung fehlgeschlagen",true); paintCount(); return; }
      ST.draws=[j.draw].concat(ST.draws||[]); UI.mktSel=j.draw.id; F.toast("Ausgelost: "+j.draw.winners.join(", ")); paintRes(); paintCount(); pollIfBusy();
    }).catch(function(){ BUSY=false; paintCount(); F.toast("Keine Verbindung zum Server",true); });
  });
});
F.action("mksel",function(id){ UI.mktSel=id; paintRes(); });
F.action("mkrevideo",function(id){ api("/admin/api/mkt/giveaway/video",{id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); ST.draws=ST.draws.map(function(d){ return d.id===id?j.draw:d; }); paintRes(); pollIfBusy(); }); });
F.action("mkdel",function(id){ F.confirm("Diese Auslosung samt Video und Protokoll löschen?","Löschen",function(){ api("/admin/api/mkt/giveaway/delete",{id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); ST.draws=ST.draws.filter(function(d){ return d.id!==id; }); if(UI.mktSel===id) UI.mktSel=""; paintRes(); F.toast("Gelöscht"); }); },true); });

/* ---------- Marken ---------- */
function swatch(c){ return c?'<i style="background:'+esc(c)+'" title="'+esc(c)+'"></i>':''; }
function brandsHtml(){
  return '<p class="muted" style="margin:0 0 12px">Das Profil jeder App ist die Grundlage für Videos und Posts: Farben, Logo, Tonfall, Zielgruppe und Hashtags.</p><div class="mk-brands">'+(ST.brands||[]).map(function(b){ var c=b.colors||{};
    return '<div class="panel mk-b"><div class="lg'+(b.logoBg==="dark"?' dark':'')+'">'+(b.logo||b.logoUploaded?'<img src="/admin/api/mkt/logo?key='+encodeURIComponent(b.key)+'&v='+encodeURIComponent(b.logoUploaded?"u":"d")+'" alt="" onerror="this.replaceWith(document.createTextNode(\'kein Logo\'))">':'<span class="muted small">kein Logo – bitte hochladen</span>')+'</div>'+
      '<div class="row-between"><b>'+esc(b.name)+'</b><div class="mk-sw">'+swatch(c.primary)+swatch(c.dark)+swatch(c.light)+swatch(c.accent)+'</div></div>'+
      '<p>'+esc(b.oneLiner||"")+'</p><div><button type="button" class="btn sm" data-act="mkbrand:'+esc(b.key)+'">Bearbeiten</button></div></div>'; }).join("")+'</div>';
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
    '<div><span class="muted small">Farben</span><div class="mk-cols">'+col("primary","Haupt")+col("dark","Dunkel")+col("light","Hell")+col("ink","Text")+col("accent","Akzent")+'</div></div>'+
    '<div class="mk-row2"><label class="fl">Logo hochladen (PNG, JPG, SVG)<input class="f" type="file" accept="image/png,image/jpeg,image/svg+xml" id="mkLogo"></label>'+
    '<label class="fl">Logo-Hintergrund<select class="f" name="logoBg"><option value="light"'+(b.logoBg!=="dark"?' selected':'')+'>Weiß (für dunkle Logos)</option><option value="dark"'+(b.logoBg==="dark"?' selected':'')+'>Dunkel (für helle Logos)</option></select></label></div>'+
    '<div class="foot"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="enabled"'+(b.enabled!==false?' checked':'')+'> aktiv</label><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="submit" class="btn primary">Speichern</button></span></div></form>',"wide");
});
F.form("mkbrand",function(form){
  var key=form.getAttribute("data-key"), g=function(n){ var el=form.querySelector('[name="'+n+'"]'); return el?el.value:""; }, ls=function(n){ return g(n).split("\n").map(function(s){ return s.trim(); }).filter(Boolean); };
  var patch={name:g("name"),url:g("url"),oneLiner:g("oneLiner"),whatItIs:g("whatItIs"),audience:g("audience"),tone:g("tone"),usps:ls("usps"),pillars:ls("pillars"),ctas:ls("ctas"),
    hashtags:g("hashtags").split(/[\s,]+/).filter(Boolean).map(function(h){ return h.charAt(0)==="#"?h:"#"+h; }),handles:g("handles").split(/[\s,]+/).filter(Boolean).map(function(h){ return h.charAt(0)==="@"?h:"@"+h; }),
    appStoreUrl:g("appStoreUrl"),seasonality:g("seasonality"),guardrails:g("guardrails"),logoBg:g("logoBg"),enabled:form.querySelector('[name="enabled"]').checked,colors:{}};
  Array.prototype.forEach.call(form.querySelectorAll("[data-mkc]"),function(el){ patch.colors[el.getAttribute("data-mkc")]=el.value; });
  var file=document.getElementById("mkLogo"), f=file&&file.files&&file.files[0];
  var go=function(){ api("/admin/api/mkt/brand",{key:key,patch:patch}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Speichern fehlgeschlagen",true); ST.brands=ST.brands.map(function(b){ return b.key===key?j.brand:b; }); F.closeModal(); F.toast("Gespeichert"); F.render(); }); };
  if(f){ if(f.size>3e6) return F.toast("Logo zu groß (max. 3 MB)",true); var r=new FileReader(); r.onload=function(){ patch.logoData=String(r.result); go(); }; r.readAsDataURL(f); } else go();
});

/* ---------- Seite ---------- */
var TABS=[["gewinnspiel","Gewinnspiel"],["marken","Marken"]];
function render(){
  if(!ST){ load(); return F.head("Marketing","Gewinnspiele, Marken und Posts")+'<div class="muted" style="padding:20px">Lade …</div>'; }
  if(!ST.ok) return F.head("Marketing","")+'<div class="notice"><span>'+esc(ST.error||"Fehler")+'</span><button type="button" class="btn sm" data-act="mkreload">Erneut versuchen</button></div>';
  var tab=UI.mktTab;
  var sub=tab==="gewinnspiel"?"Fair auslosen und ein Video für Reel, Story und TikTok bekommen":"Profile deiner Apps";
  var warn=ST.render&&!ST.render.video?'<div class="notice" style="margin-bottom:12px"><span>Die Video-Erzeugung ist am Server noch nicht bereit (ffmpeg fehlt). Auslosen und Protokoll funktionieren trotzdem.</span></div>':'';
  return F.head("Marketing",sub)+'<nav class="subnav" aria-label="Marketing" style="margin-bottom:14px">'+TABS.map(function(t){ return '<button type="button" data-act="mktab:'+t[0]+'" aria-current="'+(t[0]===tab)+'">'+t[1]+'</button>'; }).join("")+'</nav>'+warn+
    (tab==="marken"?brandsHtml():gwHtml());
}
F.action("mktab",function(t){ UI.mktTab=t; F.ls("fsc_mkt_tab",t); F.render(); });
F.action("mkreload",function(){ ST=null; F.render(); });
F.view({id:"mkt",label:"Marketing",short:"Marketing",icon:"mkt",order:18,render:render,after:function(){ if(GW.text.trim()&&!PARSE) reparse(); }});
})();
