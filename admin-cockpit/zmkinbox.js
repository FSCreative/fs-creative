/* Marketing › Posteingang (Server: mkt-posts.js /admin/api/mkt/inbox, Plattformen: mkt-publish.js inbox/inboxReply/inboxLike).
   Je Marke (Unternehmensbereich) einzeln öffnen: Kommentare mit Antworten, Direktnachrichten und Likes aller verbundenen Kanäle –
   direkt antworten (Instagram, Facebook, Threads, Bluesky, YouTube) und liken (Facebook-Kommentare, Bluesky). Neu = seit dem letzten Öffnen der Marke. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
var BOX={}, CNT=null, LOADING={}, BUSY={};
UI.mkInBrand=UI.mkInBrand||F.ls("fsc_mkin_brand")||"";
UI.mkInKind=UI.mkInKind||"alle";
F.icons.minbox='<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>';
F.icons.mheart='<path d="M12 20s-7-4.4-9-9a4.6 4.6 0 0 1 8.2-4.1L12 8l.8-1.1A4.6 4.6 0 0 1 21 11c-2 4.6-9 9-9 9z"/>';

F.css(
'.mi-brands{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}'+
'.mi-brands button{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:8px 12px;font:inherit;font-weight:600;color:var(--ink);cursor:pointer}'+
'.mi-brands button[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}'+
'.mi-brands .n{background:var(--accent,#6645ef);color:#fff;border-radius:99px;font-size:11.5px;padding:1px 7px}'+
'.mi-brands .s{font-size:11.5px;color:var(--ink-3);font-weight:500}'+
'.mi-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}'+
'.mi-list{display:grid;gap:10px}'+
'.mi-it{border:1px solid var(--line);border-radius:14px;background:var(--panel);padding:12px 14px;display:grid;gap:8px}'+
'.mi-it.new{border-color:var(--accent,#6645ef);box-shadow:0 0 0 1px var(--accent,#6645ef) inset}'+
'.mi-h{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:13px;color:var(--ink-2)}'+
'.mi-h b{color:var(--ink);font-size:14px}'+
'.mi-pf{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:6px;padding:2px 7px;background:var(--ground-2,#eee);color:var(--ink-2)}'+
'.mi-t{white-space:pre-wrap;word-break:break-word;font-size:14.5px;line-height:1.45}'+
'.mi-post{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--ink-3);text-decoration:none}'+
'.mi-post img{width:38px;height:38px;border-radius:6px;object-fit:cover;flex:none}'+
'.mi-rs{display:grid;gap:6px;border-left:2px solid var(--line);padding-left:10px}'+
'.mi-r{font-size:13.5px}.mi-r.me{color:var(--ink-2)}.mi-r b{font-size:12.5px}'+
'.mi-thread{display:grid;gap:6px}'+
'.mi-msg{max-width:80%;padding:7px 11px;border-radius:14px;background:var(--ground-2,#f1f1f4);font-size:14px;white-space:pre-wrap;word-break:break-word}'+
'.mi-msg.me{justify-self:end;background:var(--accent,#6645ef);color:#fff}'+
'.mi-msg i{display:block;font-style:normal;font-size:11px;opacity:.7;margin-top:2px}'+
'.mi-rep{display:flex;gap:8px;align-items:flex-end}'+
'.mi-rep textarea{flex:1;min-height:38px;resize:vertical}'+
'.mi-posts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}'+
'.mi-pc{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel);text-decoration:none;color:var(--ink);display:grid}'+
'.mi-pc img,.mi-pc .ph{width:100%;aspect-ratio:1;object-fit:cover;background:var(--ground-2,#eee)}'+
'.mi-pc div{padding:7px 9px;font-size:12px;display:grid;gap:3px}'+
'.mi-pc .k{display:flex;gap:10px;font-weight:700;font-size:13px}'+
'.mi-note{font-size:12.5px;color:var(--ink-3)}'
);

function api(path,body){ return F.api(path,body?{body:body}:undefined); }
function brands(){ var S=F.mktState&&F.mktState(), P=F.mktPlan&&F.mktPlan(), chs=(P&&P.channels||[]).filter(function(c){ return c.status==="ok"; });
  return (S&&S.brands||[]).filter(function(b){ return b.enabled!==false; }).map(function(b){ return {key:b.key,name:b.name,chs:chs.filter(function(c){ return c.brand===b.key; })}; }); }
function ago(iso){ var t=Date.parse(iso); if(!t) return ""; var m=Math.round((Date.now()-t)/60000); if(m<1) return "gerade eben"; if(m<60) return "vor "+m+" Min."; var h=Math.round(m/60); if(h<24) return "vor "+h+" Std.";
  var d=Math.round(h/24); return d<7?"vor "+d+(d===1?" Tag":" Tagen"):new Date(t).toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"}); }
function loadCounts(){ api("/admin/api/mkt/inbox/counts").then(function(j){ if(j&&j.ok){ CNT=j.counts; if(F.current==="mkt"&&UI.mktTab==="posteingang") paint(); } }); }
function load(key,reload){ if(!key||LOADING[key]) return; LOADING[key]=true; paint();
  api("/admin/api/mkt/inbox?brand="+encodeURIComponent(key)+"&seen=1"+(reload?"&reload=1":"")).then(function(j){ LOADING[key]=false; BOX[key]=j&&j.ok?j:{error:(j&&j.error)||"Fehler beim Laden",channels:[]}; if(CNT) CNT[key]=0; paint(); })
    .catch(function(){ LOADING[key]=false; BOX[key]={error:"Keine Verbindung zum Server",channels:[]}; paint(); }); }
function paint(){ var el=document.getElementById("miRoot"); if(el) el.innerHTML=body(); }

function itemHtml(it,key){
  var pf='<span class="mi-pf">'+esc(it.pfLabel)+'</span>', who=esc(it.from&&it.from.name||"")+(it.from&&it.from.handle&&it.from.handle.replace(/^@/,"")!==(it.from.name||"")?' <span class="muted">'+esc(it.from.handle)+'</span>':'');
  var post=it.post&&(it.post.text||it.post.thumb)?'<a class="mi-post" href="'+esc(it.post.url||"#")+'" target="_blank" rel="noopener">'+(it.post.thumb?'<img src="'+esc(it.post.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'')+'<span>zu: '+esc(it.post.text||"Beitrag")+'</span></a>':'';
  var id=esc(key+"|"+it.platform+"|"+it.id), busy=BUSY[it.id];
  if(it.kind==="like") return '<div class="mi-it"><div class="mi-h">'+pf+F.svg("mheart")+' <b>'+who+'</b> '+esc(it.text)+' <span>· '+ago(it.at)+'</span></div>'+post+'</div>';
  var main=it.kind==="message"?'<div class="mi-thread">'+(it.thread||[]).slice(-8).map(function(m){ return '<div class="mi-msg'+(m.mine?" me":"")+'">'+esc(m.text)+'<i>'+ago(m.at)+'</i></div>'; }).join("")+'</div>'
    :'<div class="mi-t">'+esc(it.text)+'</div>'+(it.replies&&it.replies.length?'<div class="mi-rs">'+it.replies.map(function(r){ return '<div class="mi-r'+(r.mine?" me":"")+'"><b>'+esc(r.mine?"Du":r.from&&r.from.name||"")+'</b> '+esc(r.text)+' <span class="muted small">'+ago(r.at)+'</span></div>'; }).join("")+'</div>':'');
  var acts=(it.can&&it.can.reply?'<div class="mi-rep"><textarea class="f" rows="1" data-mirep="'+id+'" placeholder="'+(it.kind==="message"?"Nachricht schreiben …":"Antworten …")+'"></textarea><button type="button" class="btn primary sm" data-act="misend:'+id+'"'+(busy?' disabled':'')+'>'+(busy==="send"?"Sende …":"Senden")+'</button>'+
    (it.can.like?'<button type="button" class="btn sm" data-act="milike:'+id+'"'+(it.liked||busy?' disabled':'')+'>'+F.svg("mheart")+(it.liked?' Geliked':' Liken')+'</button>':'')+'</div>':'');
  var tag=it.kind==="message"?'Nachricht':it.kind==="mention"?'Erwähnung':'Kommentar';
  return '<div class="mi-it'+(it.isNew?" new":"")+'"><div class="mi-h">'+pf+'<b>'+who+'</b><span>'+tag+' · '+ago(it.at)+'</span>'+(it.isNew?'<span class="tag info">neu</span>':'')+(it.answered||it.replies&&it.replies.some(function(r){ return r.mine; })||it.kind==="message"&&it.mine?'<span class="tag ok">beantwortet</span>':'')+(it.likes?'<span class="muted small">♥ '+it.likes+'</span>':'')+'</div>'+main+post+acts+'</div>';
}
function body(){
  var bs=brands(); if(!bs.length) return '<div class="muted" style="padding:20px">Lade …</div>';
  var key=UI.mkInBrand; if(!bs.some(function(b){ return b.key===key; })){ var w=bs.find(function(b){ return b.chs.length; })||bs[0]; key=UI.mkInBrand=w.key; }
  var chips='<div class="mi-brands">'+bs.map(function(b){ var n=CNT&&CNT[b.key]||0; return '<button type="button" data-act="miopen:'+esc(b.key)+'" aria-pressed="'+(b.key===key)+'">'+esc(b.name)+(n?'<span class="n">'+n+'</span>':'')+'<span class="s">'+(b.chs.length?b.chs.length+(b.chs.length===1?" Kanal":" Kanäle"):"nicht verbunden")+'</span></button>'; }).join("")+'</div>';
  var b=bs.find(function(x){ return x.key===key; });
  if(!b.chs.length) return chips+'<div class="panel empty">Für '+esc(b.name)+' ist noch kein Konto verbunden – <button type="button" class="link" data-act="mktab:kanaele">Kanäle</button>.</div>';
  var d=BOX[key]; if(!d){ setTimeout(function(){ load(key); },0); return chips+'<div class="muted" style="padding:20px">Lade Kommentare und Nachrichten …</div>'; }
  if(d.error) return chips+'<div class="notice"><span>'+esc(d.error)+'</span><button type="button" class="btn sm" data-act="mireload">Erneut versuchen</button></div>';
  var items=[], posts=[], notes=[];
  d.channels.forEach(function(c){ c.items.forEach(function(i){ i.pfLabel=c.label; items.push(i); }); (c.posts||[]).forEach(function(p){ p.pfLabel=c.label; posts.push(p); });
    if(c.error) notes.push(c.label+": "+c.error); (c.notes||[]).forEach(function(n){ notes.push(n); }); });
  items.sort(function(a,b){ return (b.isNew?1:0)-(a.isNew?1:0)||(a.at<b.at?1:-1); });
  var cnt={alle:items.filter(function(i){ return i.kind!=="like"; }).length,kommentare:items.filter(function(i){ return i.kind==="comment"||i.kind==="mention"; }).length,nachrichten:items.filter(function(i){ return i.kind==="message"; }).length,likes:posts.length+items.filter(function(i){ return i.kind==="like"; }).length};
  var k=UI.mkInKind, kinds=[["alle","Alle"],["kommentare","Kommentare"],["nachrichten","Nachrichten"],["likes","Likes"]];
  var bar='<div class="mi-bar"><div class="mp-pf">'+kinds.map(function(x){ return '<button type="button" data-act="mikind:'+x[0]+'" aria-pressed="'+(k===x[0])+'">'+x[1]+' '+(cnt[x[0]]||0)+'</button>'; }).join("")+'</div>'+
    '<span class="muted small">Stand '+ago(d.at)+'</span><button type="button" class="btn sm" data-act="mireload"'+(LOADING[key]?' disabled':'')+'>'+(LOADING[key]?"Lade …":"Aktualisieren")+'</button></div>';
  var list;
  if(k==="likes"){
    var lk=items.filter(function(i){ return i.kind==="like"; });
    list=(posts.length?'<div class="mi-posts">'+posts.map(function(p){ return '<a class="mi-pc" href="'+esc(p.url||"#")+'" target="_blank" rel="noopener">'+(p.thumb?'<img src="'+esc(p.thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':'<span class="ph"></span>')+'<div><span class="k">'+(p.likes!=null?'<span>♥ '+p.likes+'</span>':'')+'<span>💬 '+(p.comments||0)+'</span></span><span class="muted">'+esc(p.pfLabel)+' · '+ago(p.at)+'</span><span>'+esc((p.text||"").slice(0,70))+'</span></div></a>'; }).join("")+'</div>':'')+
      (lk.length?'<div class="mi-list" style="margin-top:12px">'+lk.map(function(i){ return itemHtml(i,key); }).join("")+'</div>':'')+
      '<p class="mi-note">Instagram und Facebook zeigen über ihre Schnittstelle nur die Anzahl der Likes, nicht wer geliked hat. Bluesky liefert die Namen.</p>';
  } else {
    var sel=items.filter(function(i){ return k==="alle"?i.kind!=="like":k==="nachrichten"?i.kind==="message":(i.kind==="comment"||i.kind==="mention"); });
    list=sel.length?'<div class="mi-list">'+sel.map(function(i){ return itemHtml(i,key); }).join("")+'</div>':'<div class="panel empty">Nichts da – keine '+(k==="nachrichten"?"Nachrichten":"Kommentare")+' in den letzten Beiträgen.</div>';
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
F.listen("keydown","[data-mirep]",function(el,e){ if(e&&e.key==="Enter"&&(e.metaKey||e.ctrlKey)){ var b=el.parentNode.querySelector('[data-act^="misend:"]'); if(b) b.click(); } });

F.mktTab({id:"posteingang",label:"Posteingang",order:1.5,sub:"Kommentare, Nachrichten und Likes je Unternehmensbereich – direkt antworten",
  render:function(){ if(!CNT) loadCounts(); if(F.mktPlan&&!F.mktPlan()&&F.mktPlanReload) F.mktPlanReload(); return '<div id="miRoot">'+body()+'</div>'; }});
})();
