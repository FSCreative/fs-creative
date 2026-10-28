/* Marketing › Posteingang (Server: mkt-posts.js /admin/api/mkt/inbox, Plattformen: mkt-publish.js inbox/inboxReply/inboxLike).
   Je Marke (Unternehmensbereich) einzeln öffnen: Kommentare mit Antworten, Direktnachrichten und Likes aller verbundenen Kanäle –
   direkt antworten (Instagram, Facebook, Threads, Bluesky, YouTube) und liken (Facebook-Kommentare, Bluesky). Ungelesen bleibt ein Eintrag, bis er gelesen (angeklickt/„Gelesen“) wird; Kommentare löschen, Nachrichten ausblenden. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
var BOX={}, CNT=null, CNTREQ=false, LOADING={}, BUSY={};
UI.mkInBrand=UI.mkInBrand||F.ls("fsc_mkin_brand")||"";
UI.mkInKind=UI.mkInKind||"alle";
F.icons.minbox='<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>';
F.icons.mheart='<path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 8.2-4.1L12 8l.8-1.1A4.6 4.6 0 0 1 21 11c-2 4.6-9 9-9 9z"/>';

/* Alpenglas: Marken als Glas-Pillen, Einträge als Zeilen in EINER Glasfläche (keine gestapelten Karten), eigene Nachrichten in Akzentfarbe */
F.css(
'.mi-brands{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}'+
'@media (max-width:700px){.mi-brands{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -16px 14px;padding:2px 16px}.mi-brands::-webkit-scrollbar{display:none}.mi-brands button{flex:none}}'+
'.mi-brands button{display:flex;align-items:center;gap:9px;border:1px solid var(--line);background:var(--panel-2);border-radius:14px;padding:7px 12px;min-height:44px;font:inherit;font-weight:600;color:var(--ink);cursor:pointer;text-align:left}'+
'.mi-brands button:hover{border-color:var(--line-2)}'+
'.mi-brands button[aria-pressed="true"]{background:var(--glow-soft);border-color:color-mix(in srgb,var(--glow) 45%,transparent);color:var(--glow-ink)}'+
'.mi-brands i{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:0 0 0 1px var(--line-2)}'+
'.mi-brands .bn{display:grid;line-height:1.25;min-width:0}'+
'.mi-brands .n{background:var(--glow);color:var(--on-glow);border-radius:99px;font-size:11.5px;font-weight:700;line-height:18px;padding:0 7px;font-variant-numeric:tabular-nums}'+
'.mi-brands .s{font-size:11.5px;color:var(--ink-3);font-weight:500;white-space:nowrap}'+
'.mi-bar{display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}'+
'.mi-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto}'+
'.mi-c{font-variant-numeric:tabular-nums;opacity:.7;font-weight:700}'+
'@media (max-width:700px){.mi-bar .mi-kinds{flex:1 1 100%;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px}.mi-bar .mi-kinds::-webkit-scrollbar{display:none}.mi-bar .mi-kinds button{flex:none}.mi-tools{margin-left:0}}'+
'.mi-list{display:grid;gap:0;padding:0;overflow:hidden}'+
'.mi-it{display:grid;gap:9px;padding:14px 18px;border-top:1px solid var(--line);min-width:0}'+
'.mi-it:first-child{border-top:0}'+
'.mi-it.new{box-shadow:inset 3px 0 0 var(--glow);background:color-mix(in srgb,var(--glow-soft) 55%,transparent)}'+
'.mi-h{display:flex;gap:4px 10px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--ink-2);min-width:0}'+
'.mi-who{display:flex;gap:6px;align-items:baseline;min-width:0;max-width:100%}'+
'.mi-who b{color:var(--ink);font-size:15px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-it.new .mi-who b{font-weight:800}'+
'.mi-hd{color:var(--ink-3);font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-pf{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;border-radius:99px;padding:2px 9px 2px 6px;background:var(--sunk);color:var(--ink-2);white-space:nowrap}'+
'.mi-pf svg{width:14px;height:14px;flex:none}'+
'.mi-meta{color:var(--ink-3);font-size:12.5px;white-space:nowrap}'+
'.mi-lk{display:inline-flex;align-items:center;gap:4px;color:var(--ink-3);font-size:12.5px;font-variant-numeric:tabular-nums}.mi-lk svg{width:14px;height:14px;color:var(--pink);flex:none}'+
'.mi-t{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14.5px;line-height:1.5;text-wrap:pretty;-webkit-hyphens:auto;hyphens:auto}'+
'.mi-post{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--ink-3);text-decoration:none;min-width:0;max-width:100%}'+
'.mi-post:hover{color:var(--ink-2)}'+
'.mi-post img{width:38px;height:38px;border-radius:8px;object-fit:cover;flex:none}'+
'.mi-post span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.mi-rs{display:grid;gap:6px;border-left:2px solid var(--line-2);padding-left:12px}'+
'.mi-r{font-size:13.5px;overflow-wrap:anywhere}.mi-r.me{color:var(--ink-2)}.mi-r b{font-size:12.5px}'+
'.mi-thread{display:grid;gap:6px}'+
'.mi-msg{justify-self:start;max-width:min(80%,560px);padding:8px 12px;border-radius:16px 16px 16px 6px;background:var(--sunk);color:var(--ink);font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}'+
'.mi-msg.me{justify-self:end;border-radius:16px 16px 6px 16px;background:var(--glow);color:var(--on-glow)}'+
'.mi-msg i{display:block;font-style:normal;font-size:11px;opacity:.7;margin-top:2px}'+
'.mi-msg .w{display:block;font-size:11.5px;font-weight:700;opacity:.75;margin-bottom:2px}'+
'.mi-rep{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}'+
'.mi-rep textarea{flex:1 1 240px;min-height:40px;resize:vertical}'+
'.mi-acts2{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}'+
'.mi-acts2 .btn.danger{background:transparent;color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,transparent)}.mi-acts2 .btn.danger:hover{background:var(--bad-soft)}'+
'.mi-posts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:14px}'+
'.mi-pc{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--sunk);text-decoration:none;color:var(--ink);display:grid;align-content:start}'+
'.mi-pc:hover{border-color:var(--line-2)}'+
'.mi-pc img,.mi-pc .ph{width:100%;aspect-ratio:1;object-fit:cover;background:var(--sunk);display:block}'+
'.mi-pc div{padding:8px 10px;font-size:12px;display:grid;gap:3px;min-width:0}'+
'.mi-pc .k{display:flex;gap:12px;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}'+
'.mi-pc .k span{display:inline-flex;align-items:center;gap:4px}.mi-pc .k svg{width:14px;height:14px;flex:none}'+
'.mi-pc .x{overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'+
'.mi-note{font-size:12.5px;color:var(--ink-3);margin:10px 2px 0}'+
'@media (max-width:900px){.mi-it{padding:14px 16px}.mi-acts2{justify-content:flex-start}.mi-acts2 .btn,.mi-rep .btn{min-height:40px}}'+
/* Handy: Antwortfeld volle Breite, darunter Senden/Liken nebeneinander; Aktionen teilen sich eine Zeile */
'@media (max-width:700px){.mi-rep textarea{flex:1 1 100%}.mi-rep .btn{flex:1 1 0;justify-content:center}.mi-acts2 .btn{flex:1 1 auto;justify-content:center;padding:6px 10px}}'
);

function api(path,body){ return F.api(path,body?{body:body}:undefined); }
function brands(){ var S=F.mktState&&F.mktState(), P=F.mktPlan&&F.mktPlan(), chs=(P&&P.channels||[]).filter(function(c){ return c.status==="ok"; });
  return (S&&S.brands||[]).filter(function(b){ return b.enabled!==false; }).map(function(b){ return {key:b.key,name:b.name,color:(b.colors&&b.colors.primary)||"",chs:chs.filter(function(c){ return c.brand===b.key; })}; }); }
function ago(iso){ var t=Date.parse(iso); if(!t) return ""; var m=Math.round((Date.now()-t)/60000); if(m<1) return "gerade eben"; if(m<60) return "vor "+m+" Min."; var h=Math.round(m/60); if(h<24) return "vor "+h+" Std.";
  var d=Math.round(h/24); return d<7?"vor "+d+(d===1?" Tag":" Tagen"):new Date(t).toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"}); }
function loadCounts(){ CNTREQ=true; api("/admin/api/mkt/inbox/counts").then(function(j){ if(j&&j.ok){ CNT=j.counts; if(F.current==="mkt"&&UI.mktTab==="posteingang") paint(); tabPaint(); } }); }
/* Zähler am Reiter „Posteingang“ (zmarketing.js) ohne Neuaufbau nachziehen */
function tabPaint(){ if(F.current==="mkt"&&F.mktTabPaint) F.mktTabPaint("posteingang"); }
function unreadTotal(){ var n=0; if(CNT) Object.keys(CNT).forEach(function(k){ n+=+CNT[k]||0; }); return n; }
function pfIcon(k){ return F.mktPfIcon?F.mktPfIcon(k):""; }
function load(key,reload){ if(!key||LOADING[key]) return; LOADING[key]=true; paint();
  api("/admin/api/mkt/inbox?brand="+encodeURIComponent(key)+"&seen=1"+(reload?"&reload=1":"")).then(function(j){ LOADING[key]=false; BOX[key]=j&&j.ok?j:{error:(j&&j.error)||"Fehler beim Laden",channels:[]}; loadCounts(); paint(); })
    .catch(function(){ LOADING[key]=false; BOX[key]={error:"Keine Verbindung zum Server",channels:[]}; paint(); }); }
function paint(){ var el=document.getElementById("miRoot"); if(el) el.innerHTML=body(); }

function itemHtml(it,key){
  var pf='<span class="mi-pf" title="'+esc(it.pfLabel)+'">'+pfIcon(it.platform)+'<span>'+esc(it.pfLabel)+'</span></span>', nm=it.from&&it.from.name||"", hd=it.from&&it.from.handle||"";
  var who='<span class="mi-who"><b title="'+esc(nm)+'">'+esc(nm)+'</b>'+(hd&&hd.replace(/^@/,"")!==nm?'<span class="mi-hd" title="'+esc(hd)+'">'+esc(hd)+'</span>':'')+'</span>';
  var post=it.post&&(it.post.text||it.post.thumb)?'<a class="mi-post" href="'+esc(it.post.url||"#")+'" target="_blank" rel="noopener" title="'+esc("zu: "+(it.post.text||"Beitrag"))+'">'+(it.post.thumb?'<img src="'+esc(it.post.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span>zu: '+esc(it.post.text||"Beitrag")+'</span></a>':'';
  var id=esc(key+"|"+it.platform+"|"+it.id), busy=BUSY[it.id];
  if(it.kind==="like") return '<div class="mi-it"><div class="mi-h">'+pf+'<span class="mi-lk">'+F.svg("mheart")+'</span>'+who+'<span>'+esc(it.text)+'</span><span class="mi-meta">'+ago(it.at)+'</span></div>'+post+'</div>';
  var th=it.thread||[], full=OPEN[it.id], shown=full?th:th.slice(-10), msg=function(m){ return '<div class="mi-msg'+(m.mine?" me":"")+'"><span class="w">'+esc(m.mine?"Du":(m.from&&m.from.name)||"")+'</span>'+esc(m.text)+'<i>'+when(m.at)+'</i></div>'; };
  var main=it.kind==="message"?'<div class="mi-thread">'+(th.length>shown.length?'<button type="button" class="link small" data-act="mimore:'+id+'">'+(th.length-shown.length)+' ältere Nachrichten anzeigen</button>':'')+shown.map(msg).join("")+'</div>'
    :'<div class="mi-t">'+esc(it.text)+'</div>'+(it.replies&&it.replies.length?'<div class="mi-rs">'+it.replies.map(function(r){ return '<div class="mi-r'+(r.mine?" me":"")+'"><b>'+esc(r.mine?"Du":r.from&&r.from.name||"")+'</b> '+esc(r.text)+' <span class="muted small">'+ago(r.at)+'</span></div>'; }).join("")+'</div>':'');
  var acts=(it.can&&it.can.reply?'<div class="mi-rep"><textarea class="f" rows="1" data-mirep="'+id+'" placeholder="'+(it.kind==="message"?"Nachricht schreiben …":"Antworten …")+'"></textarea><button type="button" class="btn primary sm" data-act="misend:'+id+'"'+(busy?' disabled':'')+' title="Senden (⌘↩)">'+F.svg("send")+(busy==="send"?" Sende …":" Senden")+'</button>'+
    (it.can.like?'<button type="button" class="btn sm" data-act="milike:'+id+'"'+(it.liked||busy?' disabled':'')+'>'+F.svg("mheart")+(it.liked?' Geliked':' Liken')+'</button>':'')+'</div>':'');
  var tag=it.kind==="message"?'Nachricht':it.kind==="mention"?'Erwähnung':'Kommentar';
  var canDel=it.kind!=="message"&&["instagram","facebook","threads","youtube"].indexOf(it.platform)>-1;
  acts+='<div class="mi-acts2">'+(it.isNew?'<button type="button" class="btn sm" data-act="miread:'+id+'">'+F.svg("mailOpen")+' Gelesen</button>':'')+(canDel?'<button type="button" class="btn sm danger" data-act="midel:'+id+'">'+F.svg("trash")+' '+(it.platform==="threads"?"Ausblenden (Threads)":it.platform==="youtube"?"Ablehnen (YouTube)":"Löschen")+'</button>':'')+'<button type="button" class="btn sm" data-act="mihide:'+id+'" title="Nur im Cockpit ausblenden – kommt wieder, wenn etwas Neues dazukommt">'+F.svg("eyeOff")+' Ausblenden</button></div>';
  return '<div class="mi-it'+(it.isNew?" new":"")+'" data-miit="'+id+'"><div class="mi-h">'+pf+who+'<span class="mi-meta">'+tag+' · '+ago(it.at)+'</span>'+(it.isNew?'<span class="tag info">ungelesen</span>':'')+(it.answered||it.replies&&it.replies.some(function(r){ return r.mine; })||it.kind==="message"&&it.mine?'<span class="tag ok">beantwortet</span>':'')+(it.likes?'<span class="mi-lk" title="'+esc(it.likes)+' Likes">'+F.svg("mheart")+esc(it.likes)+'</span>':'')+'</div>'+main+post+acts+'</div>';
}
var OPEN={};
function when(iso){ var t=Date.parse(iso); if(!t) return ""; return new Date(t).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
function body(){
  var bs=brands(); if(!bs.length) return '<div class="muted" style="padding:20px">Lade …</div>';
  var key=UI.mkInBrand; if(!bs.some(function(b){ return b.key===key; })){ var w=bs.find(function(b){ return b.chs.length; })||bs[0]; key=UI.mkInBrand=w.key; }
  var chips='<div class="mi-brands" role="group" aria-label="Unternehmensbereich">'+bs.map(function(b){ var n=CNT&&CNT[b.key]||0; return '<button type="button" data-act="miopen:'+esc(b.key)+'" aria-pressed="'+(b.key===key)+'">'+(b.color?'<i style="background:'+esc(b.color)+'"></i>':'')+'<span class="bn"><span>'+esc(b.name)+'</span><span class="s">'+(b.chs.length?b.chs.length+(b.chs.length===1?" Kanal":" Kanäle"):"nicht verbunden")+'</span></span>'+(n?'<span class="n" title="'+n+' ungelesen">'+n+'</span>':'')+'</button>'; }).join("")+'</div>';
  var b=bs.find(function(x){ return x.key===key; });
  if(!b.chs.length) return chips+'<div class="panel empty">Für '+esc(b.name)+' ist noch kein Konto verbunden – <button type="button" class="link" data-act="mktab:kanaele">Kanäle verbinden</button>.</div>';
  var d=BOX[key]; if(!d){ setTimeout(function(){ load(key); },0); return chips+'<div class="muted" style="padding:20px">Lade Kommentare und Nachrichten …</div>'; }
  if(d.error) return chips+'<div class="notice"><span>'+esc(d.error)+'</span><button type="button" class="btn sm" data-act="mireload">'+F.svg("refresh")+' Erneut versuchen</button></div>';
  var items=[], posts=[], notes=[];
  d.channels.forEach(function(c){ c.items.forEach(function(i){ i.pfLabel=c.label; items.push(i); }); (c.posts||[]).forEach(function(p){ p.pfLabel=c.label; p.pfKey=c.platform; posts.push(p); });
    if(c.error) notes.push(c.label+": "+c.error); (c.notes||[]).forEach(function(n){ notes.push(n); }); });
  items.sort(function(a,b){ return (b.isNew?1:0)-(a.isNew?1:0)||(a.at<b.at?1:-1); });
  var unread=items.filter(function(i){ return i.isNew; }).length;
  var cnt={ungelesen:unread,alle:items.filter(function(i){ return i.kind!=="like"; }).length,kommentare:items.filter(function(i){ return i.kind==="comment"||i.kind==="mention"; }).length,nachrichten:items.filter(function(i){ return i.kind==="message"; }).length,likes:posts.length+items.filter(function(i){ return i.kind==="like"; }).length};
  var k=UI.mkInKind, kinds=[["alle","Alle"],["ungelesen","Ungelesen"],["kommentare","Kommentare"],["nachrichten","Nachrichten"],["likes","Likes"]];
  var bar='<div class="mi-bar"><div class="mp-pf mi-kinds" role="group" aria-label="Filter">'+kinds.map(function(x){ return '<button type="button" data-act="mikind:'+x[0]+'" aria-pressed="'+(k===x[0])+'">'+x[1]+' <span class="mi-c">'+(cnt[x[0]]||0)+'</span></button>'; }).join("")+'</div>'+
    '<div class="mi-tools">'+(unread?'<button type="button" class="btn sm" data-act="mireadall">'+F.svg("mailOpen")+' Alle als gelesen markieren</button>':'')+'<span class="muted small">Stand '+ago(d.at)+'</span><button type="button" class="btn sm" data-act="mireload"'+(LOADING[key]?' disabled':'')+'>'+F.svg("refresh")+(LOADING[key]?" Lade …":" Aktualisieren")+'</button></div></div>';
  var list;
  if(k==="likes"){
    var lk=items.filter(function(i){ return i.kind==="like"; });
    list=(posts.length?'<section class="panel"><div class="mi-posts">'+posts.map(function(p){ var tx=p.text||""; return '<a class="mi-pc" href="'+esc(p.url||"#")+'" target="_blank" rel="noopener"'+(tx?' title="'+esc(tx)+'"':'')+'>'+(p.thumb?'<img src="'+esc(p.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="ph"></span>')+'<div><span class="k">'+(p.likes!=null?'<span title="Likes">'+F.svg("mheart")+esc(p.likes)+'</span>':'')+'<span title="Kommentare">'+F.svg("message")+esc(p.comments||0)+'</span></span><span class="mi-pf" style="justify-self:start">'+pfIcon(p.pfKey||p.platform)+'<span>'+esc(p.pfLabel)+'</span></span><span class="muted">'+ago(p.at)+'</span><span class="x">'+esc(tx.slice(0,140))+'</span></div></a>'; }).join("")+'</div></section>':'')+
      (lk.length?'<section class="panel mi-list" style="margin-top:12px">'+lk.map(function(i){ return itemHtml(i,key); }).join("")+'</section>':'')+
      '<p class="mi-note">Instagram und Facebook zeigen über ihre Schnittstelle nur die Anzahl der Likes, nicht wer geliked hat. Bluesky liefert die Namen.</p>';
  } else {
    var sel=items.filter(function(i){ return k==="alle"?i.kind!=="like":k==="ungelesen"?i.isNew:k==="nachrichten"?i.kind==="message":(i.kind==="comment"||i.kind==="mention"); });
    list=sel.length?'<section class="panel mi-list">'+sel.map(function(i){ return itemHtml(i,key); }).join("")+'</section>':'<div class="panel empty">Nichts da – keine '+(k==="nachrichten"?"Nachrichten":"Kommentare")+' in den letzten Beiträgen.</div>';
  }
  return chips+bar+(notes.length?'<div class="notice" style="margin-bottom:12px"><span>'+notes.map(esc).join("<br>")+'</span></div>':'')+list;
}
F.action("miopen",function(k){ UI.mkInBrand=k; F.ls("fsc_mkin_brand",k); if(!BOX[k]||Date.now()-Date.parse(BOX[k].at||0)>2*60e3) load(k); else paint(); });
F.action("mikind",function(k){ UI.mkInKind=k; paint(); });
F.action("mireload",function(){ load(UI.mkInBrand,true); });
function itemOf(a){ var x=a.split("|"), d=BOX[x[0]]; if(!d) return null; var c=d.channels.find(function(c){ return c.platform===x[1]; }); var it=c&&c.items.find(function(i){ return i.id===x.slice(2).join("|"); }); return it?{key:x[0],platform:x[1],it:it,c:c}:null; }
F.action("misend",function(a){ var o=itemOf(a); if(!o) return; var ta=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'), txt=ta?ta.value.trim():""; if(!txt) return F.toast("Bitte zuerst einen Text schreiben",true);
  BUSY[o.it.id]="send"; paint();
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"reply",text:txt}).then(function(j){ delete BUSY[o.it.id];
    if(!j||!j.ok){ paint(); var t2=document.querySelector('[data-mirep="'+CSS.escape(a)+'"]'); if(t2) t2.value=txt; return F.toast((j&&j.error)||"Senden fehlgeschlagen",true); }
    var i=o.c.items.indexOf(o.it); o.c.items[i]=Object.assign(j.item,{isNew:false}); paint(); F.toast("Gesendet"); }); });
F.action("milike",function(a){ var o=itemOf(a); if(!o) return; BUSY[o.it.id]="like"; paint();
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"like"}).then(function(j){ delete BUSY[o.it.id]; if(!j||!j.ok){ paint(); return F.toast((j&&j.error)||"Liken fehlgeschlagen",true); } o.it.liked=true; paint(); }); });
function setCnt(j){ if(j&&j.counts){ CNT=j.counts; tabPaint(); } }
function readItems(key,ids,all){ var d=BOX[key]; if(!d) return; d.channels.forEach(function(c){ c.items.forEach(function(i){ if(all||ids.indexOf(i.id)>-1) i.isNew=false; }); }); api("/admin/api/mkt/inbox/act",{brand:key,op:all?"readall":"read",ids:ids}).then(setCnt).then(paint); paint(); }
F.action("miread",function(a){ var o=itemOf(a); if(o) readItems(o.key,[o.it.id]); });
F.action("mireadall",function(){ readItems(UI.mkInBrand,[],true); });
F.action("mimore",function(a){ var o=itemOf(a); if(!o) return; OPEN[o.it.id]=1; paint(); });
var gone=function(o){ o.c.items=o.c.items.filter(function(i){ return i.id!==o.it.id; }); paint(); };
F.action("mihide",function(a){ var o=itemOf(a); if(!o) return; api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"hide"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); gone(o); loadCounts(); F.toast("Ausgeblendet"); }); });
F.action("midel",function(a){ var o=itemOf(a); if(!o) return; F.confirm("Diesen Kommentar von "+((o.it.from&&o.it.from.name)||"")+" auf "+o.it.pfLabel+(o.platform==="threads"?" ausblenden":o.platform==="youtube"?" ablehnen (wird ausgeblendet)":" endgültig löschen")+"?",o.platform==="instagram"||o.platform==="facebook"?"Löschen":"Ausblenden",function(){
  api("/admin/api/mkt/inbox/act",{brand:o.key,platform:o.platform,id:o.it.id,op:"delete"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Löschen fehlgeschlagen",true); gone(o); loadCounts(); F.toast("Gelöscht"); }); },true); });
// Klick in einen ungelesenen Eintrag (Text lesen) markiert ihn als gelesen
document.addEventListener("click",function(e){ var el=e.target.closest&&e.target.closest(".mi-it.new[data-miit]"); if(!el||e.target.closest("button,a,textarea")) return; var o=itemOf(el.getAttribute("data-miit")); if(o) readItems(o.key,[o.it.id]); });
F.listen("keydown","[data-mirep]",function(el,e){ if(e&&e.key==="Enter"&&(e.metaKey||e.ctrlKey)){ var b=el.parentNode.querySelector('[data-act^="misend:"]'); if(b) b.click(); } });

F.mktTab({id:"posteingang",label:"Posteingang",icon:"inbox",order:1.5,sub:"Kommentare, Nachrichten und Likes je Unternehmensbereich – direkt antworten",
  count:function(){ if(!CNT&&!CNTREQ) loadCounts(); return unreadTotal(); }, countTitle:function(n){ return n+" ungelesen"; },
  render:function(){ if(!CNT) loadCounts(); if(F.mktPlan&&!F.mktPlan()&&F.mktPlanReload) F.mktPlanReload(); return '<div id="miRoot">'+body()+'</div>'; }});
})();
