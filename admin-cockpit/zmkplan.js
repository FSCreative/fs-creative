/* Marketing › Planer und Kanäle (Server: mkt-posts.js, mkt-publish.js).
   Planer: App wählen → „Generieren“ (KI schreibt Posts, Reels, Captions, Hashtags; der Server erzeugt Bilder/Videos) → prüfen, Zeit/Plattformen anpassen →
   „Go“ (wird zur geplanten Zeit automatisch gepostet) oder „Jetzt posten“. Nichts geht ohne Go raus.
   Kanäle: App-Zugänge der Plattformen (einmalig), Konten je App verbinden (Anmeldung bei der Plattform), Bluesky mit App-Passwort, Musik und Stockvideos. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.mplay='<path d="M8 5v14l11-7z"/>';
F.icons.mgo='<path d="M5 12.5l4.5 4.5L19 7.5"/>';
F.icons.mspark='<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>';
F.icons.mlink='<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>';
F.icons.mnote='<path d="M9 18V5.5l11-2V16"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>';
function pfIcon(k){ return F.mktPfIcon?F.mktPfIcon(k):""; }

var PL=null, PLOAD=false, PPOLL=null, GEN=false;
UI.mkBrand=UI.mkBrand||F.ls("fsc_mk_brand")||"kochdu";
var GO=UI.mkGen=UI.mkGen||Object.assign({count:4,reel:true,karussell:true,bild:true,topic:""},F.ls("fsc_mk_gen")||{});
F.mktPlan=function(){ return PL; };

F.css(
'.mp-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}'+
'@media (max-width:700px){.mp-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -16px 14px;padding:2px 16px}.mp-chips::-webkit-scrollbar{display:none}.mp-chips button{flex:none}}'+
'.mp-chips button{border:1px solid var(--line);background:var(--panel-2);border-radius:99px;padding:6px 14px;min-height:36px;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink-2);cursor:pointer;display:inline-flex;gap:7px;align-items:center;white-space:nowrap}'+
'.mp-chips button:hover{color:var(--ink);border-color:var(--line-2)}'+
'.mp-chips button[aria-pressed="true"]{background:var(--glow-soft);color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 40%,transparent)}'+
'.mp-chips i{width:10px;height:10px;border-radius:50%;display:inline-block;box-shadow:0 0 0 1px var(--line-2)}'+
'.mp-chips .count{margin-left:0}'+
'.mp-gen{padding:14px 18px;display:grid;gap:12px}'+
'.mp-genrow{display:flex;gap:10px 16px;align-items:center;flex-wrap:wrap}'+
'.mp-genrow label{display:flex;gap:6px;align-items:center;font-size:14px}'+
'.mp-genrow .f{width:auto}'+
'.mp-info{font-size:13px;color:var(--ink-2);display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center}'+
'.mp-sec{margin-top:18px}'+
'.mp-sec>.row-between{margin-bottom:10px;flex-wrap:wrap}'+
'.mp-sec h2{font-size:16px}'+
':root[data-theme="glas"] .mp-sec>.row-between h2{text-shadow:0 1px 14px rgba(0,0,0,.35)}'+
/* Posts als Zeilen in EINER Glasfläche je Abschnitt (statt vieler einzelner Glaskarten – ruhiger und schneller) */
'.mp-list{display:grid;gap:0;padding:2px 0}'+
'.mp-card{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;padding:16px 18px;border-top:1px solid var(--line);min-width:0}'+
'.mp-card:first-child{border-top:0}'+
'@media(max-width:640px){.mp-card{grid-template-columns:minmax(0,1fr);padding:14px 16px}}'+
'.mp-prev{position:relative;width:150px}'+
'.mp-prev img,.mp-prev video{width:150px;border-radius:10px;display:block;background:var(--sunk);cursor:pointer}'+
'.mp-prev img{aspect-ratio:4/5;object-fit:cover} .mp-prev video{aspect-ratio:9/16;object-fit:cover}'+
'.mp-prev .n{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.6);color:#fff;font-size:11.5px;font-weight:700;border-radius:99px;padding:2px 8px}'+
'.mp-wait{width:150px;aspect-ratio:4/5;border-radius:10px;background:var(--sunk);display:grid;place-items:center;text-align:center;font-size:12.5px;color:var(--ink-2);padding:10px}'+
'.mp-wait i{display:block;width:24px;height:24px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--glow);animation:mkspin .9s linear infinite;margin:0 auto 8px}'+
'.mp-body{display:grid;gap:9px;align-content:start;min-width:0}'+
'.mp-opts{border:1px solid var(--line);border-radius:12px;padding:10px 12px}.mp-opts summary{cursor:pointer;font-weight:600}.mp-og{display:grid;gap:6px;padding:10px 0;border-top:1px solid var(--line);margin-top:8px}.mp-og:first-of-type{border-top:0}'+
'.mp-place{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.mp-place .f{flex:1 1 260px}.mp-placer{flex-basis:100%;display:flex;flex-wrap:wrap;gap:4px 14px}'+
'.mp-top{display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:12.5px}'+
'.mp-top .b{font-weight:700;background:var(--sunk);border-radius:99px;padding:2px 9px}'+
'.mp-idea{font-weight:700;font-size:15.5px;line-height:1.3;overflow-wrap:anywhere;text-wrap:balance}'+
'.mp-cap{font-size:13.5px;line-height:1.5;color:var(--ink-2);white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty;-webkit-hyphens:auto;hyphens:auto;display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}'+
'.mp-cap.open{display:block;-webkit-line-clamp:unset;line-clamp:none;overflow:visible}'+
'.mp-more{justify-self:start;padding:0}'+
'.mp-pf{display:flex;gap:6px;flex-wrap:wrap}'+
'.mp-tags{display:flex;gap:4px;flex-wrap:wrap}'+
'.mp-meta{display:flex;gap:4px 14px;flex-wrap:wrap;font-size:12.5px;color:var(--ink-2);min-width:0}'+
'.mp-meta>span{display:inline-flex;gap:5px;align-items:center;min-width:0;max-width:100%}.mp-meta svg{width:14px;height:14px;flex:none;color:var(--ink-3)}'+
'.mp-ok{display:inline-flex;gap:4px;align-items:center;color:var(--ok);font-weight:600}.mp-ok svg{width:14px;height:14px;flex:none}'+
'.mp-meta .link{display:inline-flex;gap:5px;align-items:center;padding:0}.mp-meta .link svg{color:currentColor}'+
'.mp-mus{font-size:12.5px;margin:4px 0;display:flex;gap:4px 10px;flex-wrap:wrap}'+
'.mp-mus span{background:var(--sunk);border-radius:99px;padding:1px 9px}'+
'.mp-tags span{font-size:11.5px;color:var(--glow-ink,var(--ink-2));background:var(--glow-soft,var(--sunk));border-radius:99px;padding:1px 8px}'+
'.mp-qk{display:flex;gap:6px;flex-wrap:wrap}'+
'.mp-qk button{border:1px dashed var(--line);background:none;border-radius:99px;padding:4px 11px;font:inherit;font-size:12.5px;color:var(--ink-2);cursor:pointer}'+
'.mp-qk button:hover{border-color:var(--ink-3);color:var(--ink)}'+
'.mp-vorg{min-height:70px}'+
'.mp-pf button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel-2);border-radius:99px;padding:4px 12px;min-height:30px;font:inherit;font-size:12.5px;font-weight:600;color:var(--ink-3);cursor:pointer;white-space:nowrap}'+
'.mp-pf button svg{width:14px;height:14px;flex:none}'+
'.mp-pf button:hover:not(:disabled){color:var(--ink);border-color:var(--line-2)}'+
'.mp-pf button[aria-pressed="true"]{background:var(--glow-soft);color:var(--glow-ink);border-color:color-mix(in srgb,var(--glow) 45%,transparent)}'+
'.mp-pf button:disabled{cursor:default}'+
'.mp-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}'+
'.mp-acts input[type=datetime-local]{width:auto;padding:5px 9px}'+
'.mp-res{display:grid;gap:4px;font-size:13px}'+
'.mp-res>span{overflow-wrap:anywhere}'+
'.mp-res a{font-weight:600}'+
'@media (max-width:900px){.mp-acts .btn,.mp-pf button{min-height:40px}}'+
'.mp-empty{padding:18px;color:var(--ink-2);font-size:14px}'+
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
  if(busy||soon) PPOLL=setTimeout(function(){ if(F.current!=="mkt"){ schedulePoll(); return; } api("/admin/api/mkt/posts").then(function(j){ if(j&&j.ok){ var was=sig(PL); PL=j; if(was!==sig(j)&&!F.modalOpen()) F.render(); } schedulePoll(); }); },busy?3000:30000);
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
function postCard(p){
  var md=p.media||{}, base="/admin/api/mkt/post-file?id="+encodeURIComponent(p.id)+"&v="+encodeURIComponent(md.rev||""), prev;
  if(md.status!=="fertig") prev=md.status==="fehler"?'<div class="mp-wait"><div><b class="bad-t">Fehler</b><br>'+esc(md.error||"")+'<br><button type="button" class="btn sm" data-act="mprer:'+esc(p.id)+'">Nochmal</button></div></div>':'<div class="mp-wait"><div><i></i>'+(p.format==="reel"?"Reel wird animiert …<br><span class=\"small\">dauert 1–2 Minuten</span>":"Bilder werden erstellt …")+'</div></div>';
  else if(p.format==="reel") prev='<video src="'+base+'&kind=video" poster="'+base+'&kind=cover" playsinline muted controls preload="none"></video>';
  else prev='<img src="'+base+'&i=0" alt="" data-act="mpview:'+esc(p.id)+'" loading="lazy">'+(md.images>1?'<span class="n">1/'+md.images+'</span>':'');
  var connected=(PL.platforms||[]).filter(function(pf){ var c=chOf(p.brand,pf.key); return c&&c.status!=="getrennt"&&pf.formats.indexOf(p.format)>-1; });
  var editable=p.status==="entwurf"||p.status==="geplant";
  var pfs=connected.length?'<div class="mp-pf" role="group" aria-label="Plattformen">'+connected.map(function(pf){ var on=p.platforms.indexOf(pf.key)>-1; return '<button type="button" '+(editable?'data-act="mppf:'+esc(p.id)+'|'+pf.key+'"':'disabled')+' aria-pressed="'+on+'">'+pfIcon(pf.key)+'<span>'+esc(pf.label)+'</span></button>'; }).join("")+'</div>':'<div class="muted small">Noch kein passendes Konto verbunden – <button type="button" class="link" data-act="mktab:kanaele">Kanäle</button></div>';
  var res="";
  if(Object.keys(p.results||{}).length) res='<div class="mp-res">'+Object.keys(p.results).map(function(k){ var r=p.results[k];
    var can=p.can||{}, ra=r.status==="ok"&&r.id?((can.edit||[]).indexOf(k)>-1?' <button type="button" class="link small" data-act="mprem:'+esc(p.id)+'|'+k+'|edit">Text ändern</button>':'')+((can.comments||[]).indexOf(k)>-1?' <button type="button" class="link small" data-act="mprem:'+esc(p.id)+'|'+k+'|comments">Kommentare '+(r.commentsOff?'ein':'aus')+'</button>':'')+((can.remove||[]).indexOf(k)>-1?' <button type="button" class="link small" data-act="mprem:'+esc(p.id)+'|'+k+'|delete">Löschen</button>':''):'';
    return '<span><span class="mk-pfi">'+pfIcon(k)+esc(pfLabel(k))+':</span> '+(r.status==="gelöscht"?'<span class="muted">gelöscht</span>':r.status==="ok"?(r.url?'<a class="mp-ok" href="'+esc(r.url)+'" target="_blank" rel="noopener">'+F.svg("checkCircle")+' ansehen</a>':'<span class="mp-ok">'+F.svg("checkCircle")+' gepostet</span>')+(r.editedAt?' <span class="muted small">geändert</span>':'')+ra:r.status==="entwurf"?'<b>Entwurf in der App</b> <span class="muted">'+esc(r.note||"")+'</span>':r.status==="übersprungen"?'<span class="muted">'+esc(r.error)+'</span>':'<span class="bad-t">'+esc(r.error||"Fehler")+'</span> <button type="button" class="link" data-act="mpretry:'+esc(p.id)+'|'+k+'">nochmal</button>')+'</span>'; }).join("")+'</div>';
  var acts;
  if(p.status==="entwurf") acts='<input class="f" type="datetime-local" value="'+esc(localDT(p.scheduledAt))+'" data-mptime="'+esc(p.id)+'" title="Geplante Zeit"><button type="button" class="btn primary" data-act="mpgo:'+esc(p.id)+'"'+(md.status!=="fertig"||!p.platforms.length?' disabled':'')+'>'+F.svg("mgo")+' Go</button><button type="button" class="btn" data-act="mpnow:'+esc(p.id)+'"'+(md.status!=="fertig"||!p.platforms.length?' disabled':'')+'>'+F.svg("send")+' Jetzt posten</button><button type="button" class="btn" data-act="mped:'+esc(p.id)+'">'+F.svg("edit")+' Bearbeiten</button>'+(/^gewinnspiel/.test(p.source||"")?'':'<button type="button" class="btn" data-act="mprw:'+esc(p.id)+'">'+F.svg("mspark")+' Neu schreiben</button>')+'<button type="button" class="btn sm" data-act="mpdel:'+esc(p.id)+'">'+F.svg("trash")+' Verwerfen</button>';
  else if(p.status==="geplant") acts='<span class="small"><b>Geht '+esc(when(p.scheduledAt))+' raus</b></span><input class="f" type="datetime-local" value="'+esc(localDT(p.scheduledAt))+'" data-mptime="'+esc(p.id)+'" title="Geplante Zeit"><button type="button" class="btn" data-act="mpstop:'+esc(p.id)+'">'+F.svg("xCircle")+' Stopp</button><button type="button" class="btn" data-act="mpnow:'+esc(p.id)+'">'+F.svg("send")+' Jetzt posten</button><button type="button" class="btn" data-act="mped:'+esc(p.id)+'">'+F.svg("edit")+' Bearbeiten</button>';
  else if(p.status==="läuft") acts='<span class="small"><b>Wird gerade gepostet …</b></span>';
  else acts='<span class="small muted">'+esc(when(p.postedAt||p.scheduledAt))+'</span>'+(p.status!=="gepostet"?'<button type="button" class="btn sm" data-act="mpretry:'+esc(p.id)+'|">'+F.svg("refresh")+' Fehlgeschlagene nochmal</button>':'')+'<button type="button" class="btn sm" data-act="mpdel:'+esc(p.id)+'">'+F.svg("trash")+' Entfernen</button>';
  var cap=p.preview&&(p.preview.instagram||p.preview[Object.keys(p.preview)[0]])||(p.captions&&p.captions.instagram)||"";
  var capTxt=String(cap).replace(/\n\n(#\S+\s*)+$/,""), capOpen=!!(UI.mpCapOpen&&UI.mpCapOpen[p.id]), capLong=capTxt.length>200||(capTxt.match(/\n/g)||[]).length>2;
  var mi=function(icon,title,txt){ return '<span title="'+esc(title)+'">'+F.svg(icon)+'<span class="ell">'+esc(txt)+'</span></span>'; };
  return '<div class="mp-card" id="mp-'+esc(p.id)+'"><div class="mp-prev">'+prev+'</div><div class="mp-body">'+
    '<div class="mp-top"><span class="b">'+esc(FMT[p.format]||p.format)+'</span>'+(UI.mkBrand==="alle"?'<span class="b">'+esc(brandOf(p.brand).name)+'</span>':'')+(p.pillar?'<span class="muted">'+esc(p.pillar)+'</span>':'')+'<span class="muted">· '+esc(STL[p.status]||p.status)+'</span></div>'+
    '<div class="mp-idea">'+esc(p.idea||"")+'</div><div class="mp-cap'+(capOpen?' open':'')+'">'+esc(capTxt)+'</div>'+
    (capLong?'<button type="button" class="link small mp-more" data-act="mpcap:'+esc(p.id)+'" aria-expanded="'+capOpen+'">'+(capOpen?'Weniger anzeigen':'Ganzen Text anzeigen')+'</button>':'')+
    (((p.hashtags||{}).instagram||[]).length?'<div class="mp-tags">'+p.hashtags.instagram.slice(0,PL.igTags||5).map(function(t){ return '<span>'+esc(t.charAt(0)==="#"?t:"#"+t)+'</span>'; }).join("")+'</div>':'')+
    '<div class="mp-meta">'+(p.place?mi("pin","Standort (Instagram/Facebook)",p.place.name):'')+((p.tags||[]).length?mi("user","Markierte Personen (Instagram)",p.tags.map(function(u){ return "@"+u; }).join(" ")):'')+((p.collabs||[]).length?mi("link","Collab (Instagram)",p.collabs.map(function(u){ return "@"+u; }).join(" ")):'')+(p.format==="reel"?mi("mnote","Musik",p.track?p.track.name+(p.track.license&&/CC0/.test(p.track.license)?" · CC0":""):p.music==="none"?"ohne Musik":"wird gewählt"):'')+(p.firstComment?mi("message","Erster Kommentar: "+p.firstComment,p.firstComment.slice(0,70)+(p.firstComment.length>70?'…':'')):'')+(p.altText?mi("eye","Bildbeschreibung: "+p.altText,"Bildbeschreibung"):'')+
    (p.platforms.indexOf("tiktok")>-1?'<button type="button" class="link" data-act="mptt:'+esc(p.id)+'">'+F.svg("copy")+' TikTok-Text kopieren</button>':'')+'</div>'+pfs+res+'<div class="mp-acts">'+acts+'</div></div></div>';
}
function planHtml(){
  if(!PL){ load(); return '<div class="muted" style="padding:20px">Lade …</div>'; }
  if(!PL.ok) return '<div class="notice"><span>'+esc(PL.error)+'</span><button type="button" class="btn sm" data-act="mpreload">Erneut versuchen</button></div>';
  var bs=brands(), cur=UI.mkBrand, b=brandOf(cur);
  var chips='<div class="mp-chips">'+[{key:"alle",name:"Alle",colors:{}}].concat(bs).map(function(x){ var n=(PL.posts||[]).filter(function(p){ return (x.key==="alle"||p.brand===x.key)&&p.status==="entwurf"; }).length;
    return '<button type="button" data-act="mpbrand:'+esc(x.key)+'" aria-pressed="'+(x.key===cur)+'">'+(x.colors&&x.colors.primary?'<i style="background:'+esc(x.colors.primary)+'"></i>':'')+esc(x.name)+(n?' <span class="count">'+n+'</span>':'')+'</button>'; }).join("")+'</div>';
  var gen="";
  if(cur!=="alle"){
    var chs=(PL.channels||[]).filter(function(c){ return c.brand===cur; }), plan=PL.plans&&PL.plans[cur]||{perWeek:3,times:[]};
    gen='<section class="panel"><div class="panel-h"><h2>Neue Posts für '+esc(b.name)+'</h2><span class="muted small">KI schreibt Texte und Hashtags, der Server macht Bilder und Reels</span></div><div class="mp-gen">'+
      (!PL.ki?'<div class="notice"><span>Die KI-Funktion „Marketing“ ist nicht aktiv (Einstellungen → KI) oder das Monatslimit ist erreicht.</span></div>':'')+
      '<div class="mp-genrow"><label>Anzahl <select class="f" data-mpgen="count">'+[1,2,3,4,5,7,10].map(function(n){ return '<option'+(+GO.count===n?' selected':'')+'>'+n+'</option>'; }).join("")+'</select></label>'+
      '<label><input type="checkbox" data-mpgen="reel"'+(GO.reel!==false?' checked':'')+'> Reels</label><label><input type="checkbox" data-mpgen="karussell"'+(GO.karussell!==false?' checked':'')+'> Karussells</label><label><input type="checkbox" data-mpgen="bild"'+(GO.bild!==false?' checked':'')+'> Einzelbilder</label></div>'+
      '<label class="fl">Deine Vorgaben für diesen Plan (optional)<textarea class="f mp-vorg" data-mpgen="instructions" maxlength="2000" rows="3" placeholder="z. B. „Wintersaison startet – Fokus auf Lieferung bei Schlechtwetter, locker in Mundart, ein Post mit Frage an die Community“">'+esc(GO.instructions!=null?GO.instructions:(GO.topic||""))+'</textarea></label>'+
      '<div class="mp-qk">'+QUICK.map(function(q){ return '<button type="button" data-act="mpquick:'+esc(q)+'">+ '+esc(q)+'</button>'; }).join("")+'</div>'+
      (b.standing?'<div class="mp-info"><span>Dauerhafte Vorgaben: '+esc(String(b.standing).slice(0,140))+(String(b.standing).length>140?'…':'')+' <button type="button" class="link" data-act="mkbrand:'+esc(cur)+'">ändern</button></span></div>':'<div class="mp-info"><span>Tipp: Dauerhafte Vorgaben für '+esc(b.name)+' (z. B. „immer Wirte namentlich nennen“) <button type="button" class="link" data-act="mkbrand:'+esc(cur)+'">hier eintragen</button></span></div>')+
      '<div class="mp-genrow" style="justify-content:space-between"><div class="mp-info"><span>Rhythmus: <b>'+plan.perWeek+' pro Woche</b> · '+esc((plan.times||[]).join(", "))+' <button type="button" class="link" data-act="mpplan:'+esc(cur)+'">ändern</button></span>'+
      '<span>Kanäle: '+(chs.length?chs.map(function(c){ return esc(pfLabel(c.platform))+(c.status!=="ok"?' <b class="bad-t">(neu verbinden)</b>':''); }).join(", "):'<b>keine</b> – <button type="button" class="link" data-act="mktab:kanaele">verbinden</button>')+'</span></div>'+
      '<button type="button" class="btn primary" data-act="mpgen"'+(GEN||!PL.ki?' disabled':'')+'>'+F.svg("mspark")+(GEN?' KI schreibt … (ca. 1 Min.)':' Generieren')+'</button></div></div></section>';
  }
  var mine=(PL.posts||[]).filter(function(p){ return cur==="alle"||p.brand===cur; });
  var drafts=mine.filter(function(p){ return p.status==="entwurf"; }).sort(byTime), planned=mine.filter(function(p){ return p.status==="geplant"||p.status==="läuft"; }).sort(byTime), done=mine.filter(function(p){ return ["gepostet","teilweise","fehler"].indexOf(p.status)>-1; }).sort(function(a,b){ return String(b.postedAt||b.scheduledAt).localeCompare(String(a.postedAt||a.scheduledAt)); }).slice(0,30);
  var sec=function(t,list,right,empty){ return '<div class="mp-sec"><div class="row-between"><h2>'+t+(list.length?' <span class="muted">('+list.length+')</span>':'')+'</h2>'+(right||"")+'</div>'+(list.length?'<section class="panel mp-list">'+list.map(postCard).join("")+'</section>':'<div class="panel mp-empty">'+empty+'</div>')+'</div>'; };
  var allGo=drafts.filter(function(p){ return p.media.status==="fertig"&&p.platforms.length; }).length;
  return chips+gen+sec("Zur Freigabe",drafts,allGo>1?'<button type="button" class="btn primary sm" data-act="mpgoall">'+F.svg("mgo")+' Alle '+allGo+' freigeben</button>':'',cur==="alle"?"Keine Entwürfe.":"Noch keine Entwürfe – oben auf „Generieren“ klicken.")+
    sec("Geplant",planned,"","Nichts geplant. Mit „Go“ landen Posts hier und gehen zur geplanten Zeit automatisch raus.")+
    (done.length?sec("Veröffentlicht",done,"",""):"");
}
function byTime(a,b){ return String(a.scheduledAt||"").localeCompare(String(b.scheduledAt||"")); }
function upd(post){ PL.posts=PL.posts.map(function(p){ return p.id===post.id?post:p; }); }
function postOp(id,op,extra,msg){ return api("/admin/api/mkt/post",Object.assign({id:id,op:op},extra||{})).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; } if(j.post) upd(j.post); else if(op==="delete") PL.posts=PL.posts.filter(function(p){ return p.id!==id; }); if(msg) F.toast(msg); F.render(); schedulePoll(); return j; }); }
F.action("mpbrand",function(k){ UI.mkBrand=k; F.ls("fsc_mk_brand",k); F.render(); });
F.action("mpreload",function(){ PL=null; F.render(); });
F.listen("change","[data-mpgen]",function(el){ var k=el.getAttribute("data-mpgen"); GO[k]=el.type==="checkbox"?el.checked:el.value; F.ls("fsc_mk_gen",GO); });
F.listen("input","[data-mpgen=instructions]",function(el){ GO.instructions=el.value; F.ls("fsc_mk_gen",GO); });
F.action("mpquick",function(q){ var el=document.querySelector("[data-mpgen=instructions]"), v=(el?el.value:(GO.instructions||"")).trim(); v=v?(v.replace(/[.,;]$/,"")+", "+q):q; GO.instructions=v; F.ls("fsc_mk_gen",GO); if(el){ el.value=v; el.focus(); } });
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
    (p.format==="reel"&&!/^gewinnspiel/.test(p.source||"")?'<label class="fl">Musik (CC0 bzw. eigene)<select class="f" name="music"><option value="">Passend zur Stimmung „'+esc(((PL.moods||[]).find(function(m){ return m.key===p.mood; })||{label:"Marke"}).label)+'“</option><option value="none"'+(p.music==="none"?' selected':'')+'>Ohne Musik</option>'+
      (PL.moods||[]).map(function(md){ var ms=music.filter(function(m){ return m.mood===md.key; }); return ms.length?'<optgroup label="'+esc(md.label)+'">'+ms.map(function(m){ return '<option value="'+esc(m.id)+'"'+(p.music===m.id?' selected':'')+'>'+esc(m.name)+'</option>'; }).join("")+'</optgroup>':''; }).join("")+
      (music.some(function(m){ return !m.mood; })?'<optgroup label="Eigene">'+music.filter(function(m){ return !m.mood; }).map(function(m){ return '<option value="'+esc(m.id)+'"'+(p.music===m.id?' selected':'')+'>'+esc(m.name)+'</option>'; }).join("")+'</optgroup>':'')+'</select></label>':'')+
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
      return '<td>'+(prov.ready?'<button type="button" class="btn sm" data-act="mkcon:'+esc(b.key)+'|'+pf.key+'">Verbinden</button>':'<span class="muted small" title="Zuerst den App-Zugang oben eintragen">–</span>')+'</td>'; }).join("")+'</tr>'; }).join("")+'</tbody></table></div>'+
    '<p class="muted small" style="margin:10px 18px 14px">TikTok: Videos landen als Entwurf in deiner TikTok-App (dort auf „Posten“ tippen) – direktes Posten erlaubt TikTok erst nach einer Prüfung der App. X/Twitter kostet seit 2026 pro Post und ist deshalb nicht dabei.</p></section>';
  var extra='<section class="panel"><div class="panel-h"><h2>3. Extras für bessere Reels</h2></div><div class="mk-prov">'+
    '<div><div><b>Stockvideos & -fotos</b><br>'+(PL.pixabay||PL.pexels?'<span class="ok-t small">✓ aktiv'+(PL.pixabay?' (Pixabay'+(PL.pexels?' + Pexels':'')+')':' (Pexels)')+'</span>':'<span class="muted small">aus</span>')+'<br><a class="small" href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">Pixabay-API (gratis)</a></div><div><p class="muted small" style="margin:0 0 8px">Kostenlos: auf pixabay.com registrieren, dann angemeldet <a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">pixabay.com/api/docs</a> öffnen – bei „key (required)“ steht grün <b>Your API key</b>. Reels bekommen damit echte Videos als Hintergrund.</p><form data-form="mkpix" autocomplete="off"><input class="f" name="key" type="password" placeholder="'+(PL.pixabay?"Schlüssel gespeichert":"Pixabay-API-Schlüssel")+'" autocomplete="new-password"><button type="submit" class="btn sm">Speichern</button>'+(PL.pixabay?'<button type="button" class="btn sm" data-act="mkpixdel">Entfernen</button>':'')+'</form></div></div>'+
    '<div><div><b>Pexels (optional)</b><br>'+(PL.pexels?'<span class="ok-t small">✓ aktiv</span>':'<span class="muted small">aus</span>')+'<br><a class="small" href="https://www.pexels.com/api/" target="_blank" rel="noopener">Pexels-API</a></div><div><p class="muted small" style="margin:0 0 8px">Mit einem kostenlosen Pexels-Schlüssel bekommen Reels echte Videos als Hintergrund (Essen, Berge, Feiern …) statt Farbverlauf.</p><form data-form="mkpex" autocomplete="off"><input class="f" name="key" type="password" placeholder="'+(PL.pexels?"Schlüssel gespeichert":"Pexels-API-Schlüssel")+'" autocomplete="new-password"><button type="submit" class="btn sm">Speichern</button>'+(PL.pexels?'<button type="button" class="btn sm" data-act="mkpexdel">Entfernen</button>':'')+'</form></div></div>'+
    '<div><div><b>Musik für Reels</b><br><span class="muted small">'+(PL.music||[]).length+' Titel</span></div><div><p class="muted small" style="margin:0 0 8px">Dabei: '+(PL.music||[]).filter(function(m){ return m.seed; }).length+' Titel unter <b>CC0</b> (FreePD – frei für Werbung und alle Plattformen, ohne Namensnennung). Jedes Reel bekommt einen Titel passend zur Stimmung, im Post änderbar. Eigene lizenzfreie Musik kannst du dazuladen.</p>'+
      (PL.moods||[]).map(function(md){ var ms=(PL.music||[]).filter(function(m){ return m.mood===md.key; }); return ms.length?'<div class="mp-mus"><b>'+esc(md.label)+'</b> '+ms.map(function(m){ return '<span>'+esc(m.name)+' <button type="button" class="link" data-act="mkmusdel:'+esc(m.id)+'" title="Nicht verwenden" aria-label="Entfernen">×</button></span>'; }).join("")+'</div>':''; }).join("")+
      ((PL.music||[]).some(function(m){ return !m.mood; })?'<div class="mp-mus"><b>eigene</b> '+PL.music.filter(function(m){ return !m.mood; }).map(function(m){ return '<span>'+esc(m.name)+' <button type="button" class="link" data-act="mkmusdel:'+esc(m.id)+'" aria-label="Entfernen">×</button></span>'; }).join("")+'</div>':'')+
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px"><select class="f" style="width:auto" id="mkMusicMood"><option value="">Stimmung …</option>'+(PL.moods||[]).map(function(md){ return '<option value="'+esc(md.key)+'">'+esc(md.label)+'</option>'; }).join("")+'</select><input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg" id="mkMusic" multiple><button type="button" class="link small" data-act="mkmusrestore">ausgeblendete zurückholen</button></div></div></div>'+
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
F.listen("change","#mkMusic",function(el){ var files=Array.prototype.slice.call(el.files||[]); if(!files.length) return; var chain=Promise.resolve();
  files.forEach(function(f){ chain=chain.then(function(){ if(f.size>12e6){ F.toast(f.name+": zu groß (max. 12 MB)",true); return; } return new Promise(function(ok){ var r=new FileReader(); r.onload=function(){ api("/admin/api/mkt/music",{name:f.name.replace(/\.[^.]+$/,""),mood:(document.getElementById("mkMusicMood")||{}).value||"",data:String(r.result).replace(/^data:audio\/mp3;/,"data:audio/mpeg;")}).then(function(j){ if(j&&j.ok) PL=j; else F.toast((j&&j.error)||"Fehler",true); ok(); }); }; r.readAsDataURL(f); }); }); });
  chain.then(function(){ F.toast("Musik hochgeladen"); F.render(); }); });
F.action("mkmusrestore",function(){ api("/admin/api/mkt/music",{restore:true}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); } }); });
F.action("mkmusdel",function(id){ api("/admin/api/mkt/music",{remove:id}).then(function(j){ if(j&&j.ok){ PL=j; F.render(); } }); });

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

F.mktTab({id:"planer",label:"Planer",icon:"kal",order:1,sub:"Posts und Reels erstellen, freigeben, automatisch posten",render:planHtml});
F.mktTab({id:"kanaele",label:"Kanäle",icon:"link",order:3,sub:"Social-Media-Konten verbinden",render:kanHtml});
})();
