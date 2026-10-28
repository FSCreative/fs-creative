/* Kalender am PC im Outlook-Stil: links Mini-Monat + Bereiche, rechts Tag / Arbeitswoche / Woche mit Stundenraster oder Monat.
   Daten, Dialoge und Monatsraster kommen aus kal.js (F.kalApi). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
function A(){ return F.kalApi; }
var HR=48, DOW=["Mo","Di","Mi","Do","Fr","Sa","So"];
var GL=':root[data-theme="glas"] ';
UI.kdView=UI.kdView||F.ls("fsc_kal_dview")||"workweek";

F.css(
'.kd{display:grid;grid-template-columns:248px minmax(0,1fr);gap:16px;align-items:start}'+
'.kd-side{display:grid;gap:14px;padding:14px;position:sticky;top:60px}'+
'.kd-new{justify-content:center;width:100%;min-height:36px!important}'+
'.kd-mini-h{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:14px;text-transform:capitalize}'+
'.kd-mini-h button{border:0;background:none;color:var(--ink-2);width:28px;height:28px;border-radius:8px;font-size:16px;display:inline-grid;place-items:center}.kd-mini-h button:hover{background:var(--hover,var(--sunk))}.kd-mini-h button svg{width:16px;height:16px}'+
'.kd-mini{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;text-align:center}'+
'.kd-mini span{font-size:11px;color:var(--ink-3);font-weight:600;padding:2px 0}'+
'.kd-mini button{border:0;background:none;color:var(--ink);font:500 12.5px/1 var(--f-body);font-variant-numeric:tabular-nums;height:28px;border-radius:50%;position:relative}'+
'.kd-mini button:hover{background:var(--hover,var(--sunk))}'+
'.kd-mini button.out{color:var(--ink-3)}'+
'.kd-mini button.inr{background:var(--sel)}'+
'.kd-mini button.today{background:var(--glow);color:var(--on-glow);font-weight:700}'+
'.kd-mini button.has:after{content:"";position:absolute;bottom:3px;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--ink-3)}'+
'.kd-mini button.today.has:after{background:var(--on-glow)}'+
'.kd-leg{display:grid;gap:6px;font-size:13px;color:var(--ink-2)}.kd-leg b{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)}'+
'.kd-leg span{display:flex;align-items:center;gap:8px}.kd-leg i{width:12px;height:12px;border-radius:3px;background:var(--c);flex:none}'+
'.kd-side .kst{padding:0;border:0;font-size:12px}'+
'.kd-main{min-width:0;overflow:clip}'+
/* Alpenglas: Kalenderflächen etwas dunkler getönt (viele kleine Texte über dem Foto) – ohne eigenen Blur, die Container enthalten Termine mit Ziehen */
GL+'.kd>.panel{background:color-mix(in srgb,var(--ground) 45%,var(--panel))}'+
'.kd-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}'+
'.kd-bar .t{font-size:17px;font-weight:700;margin:0 6px;text-transform:capitalize}'+
'.kd-bar .sp{flex:1}'+
'.kd-seg{display:flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}'+
'.kd-seg button{border:0;border-left:1px solid var(--line);background:transparent;padding:5px 12px;font-size:13px;font-weight:600;color:var(--ink-2)}.kd-seg button:first-child{border-left:0}.kd-seg button:hover{background:var(--hover,var(--sunk))}'+
'.kd-seg button[aria-pressed="true"]{background:var(--glow-soft);color:var(--glow-ink)}'+
'.kd-nav{width:32px;height:32px;border:0;background:none;border-radius:8px;color:var(--ink);font-size:18px;display:inline-grid;place-items:center}.kd-nav:hover{background:var(--hover,var(--sunk))}.kd-nav svg{width:18px;height:18px}'+
/* Wochenraster */
'.kw{--cols:5;display:grid;grid-template-columns:56px repeat(var(--cols),minmax(0,1fr))}'+
'.kw-h{position:sticky;top:0;z-index:3;background:var(--panel-solid,var(--panel));border-bottom:1px solid var(--line)}'+
'.kw-h .d{padding:8px 8px 6px;border-left:1px solid var(--line);display:flex;align-items:baseline;gap:6px;cursor:pointer;min-width:0}'+
'.kw-h .d:hover{background:var(--hover,var(--sunk))}'+
'.kw-h .d b{font-size:22px;font-weight:600;line-height:1}.kw-h .d span{font-size:12px;color:var(--ink-3);font-weight:600}'+
'.kw-h .d.today b{color:var(--glow)}.kw-h .d.today span{color:var(--glow)}'+
'.kw-h .d.today{box-shadow:inset 0 3px 0 var(--glow)}'+
'.kw-all{border-bottom:1px solid var(--line)}'+
'.kw-all .c{border-left:1px solid var(--line);padding:3px;display:grid;gap:2px;min-height:26px;align-content:start}'+
'.kw-all .lbl{font-size:10.5px;color:var(--ink-3);padding:6px 4px;text-align:right}'+
'.kw-all button{border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 18%,transparent);color:var(--ink);border-radius:3px;padding:2px 6px;font-size:12px;font-weight:600;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}'+
'.kw-all button:hover{background:color-mix(in srgb,var(--c) 28%,transparent)}'+GL+'.kw-all button{background:color-mix(in srgb,var(--c) 26%,transparent)}'+GL+'.kw-all button:hover{background:color-mix(in srgb,var(--c) 36%,transparent)}'+
'.kw-all button svg,.kwe b svg{width:11px;height:11px;vertical-align:-1px;margin-right:3px}'+
'.kw-scroll{max-height:calc(100vh - 290px);min-height:420px;overflow-y:auto}'+
'.kw-times .tm{height:'+HR+'px;position:relative}.kw-times .tm span{position:absolute;top:-7px;right:8px;font:500 11px/1 var(--f-mono);color:var(--ink-3)}'+
'.kw-col{position:relative;border-left:1px solid var(--line);background:repeating-linear-gradient(to bottom,transparent 0,transparent '+(HR-1)+'px,var(--line) '+(HR-1)+'px,var(--line) '+HR+'px)}'+
'.kw-col.today{background-color:color-mix(in srgb,var(--glow-soft) 45%,transparent)}'+
'.kw-col .slot{position:absolute;left:0;right:0;height:'+(HR/2)+'px;cursor:pointer}.kw-col .slot:hover{background:color-mix(in srgb,var(--glow) 10%,transparent)}'+
/* Termine im Raster: deckender Grund (Rasterlinien und Nachbartermine scheinen nicht durch) */
'.kwe{position:absolute;z-index:1;border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 20%,var(--panel-solid,var(--panel)));color:var(--ink);border-radius:4px;padding:3px 6px;text-align:left;font:inherit;font-size:12px;line-height:1.3;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.08)}'+
'.kwe:hover{background:color-mix(in srgb,var(--c) 30%,var(--panel-solid,var(--panel)));z-index:2}'+
GL+'.kwe{background:color-mix(in srgb,var(--c) 28%,var(--panel-solid,var(--panel)))}'+GL+'.kwe:hover{background:color-mix(in srgb,var(--c) 38%,var(--panel-solid,var(--panel)))}'+
'.kwe b{display:block;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kwe small{display:block;color:var(--ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}'+
'.kw-now{position:absolute;left:-1px;right:0;height:2px;background:var(--bad);z-index:2}.kw-now:before{content:"";position:absolute;left:-5px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--bad)}'+
'.kd-main .kcal-h,.kd-main .kst,.kd-main .klegend{display:none}.kd-main>section.panel{box-shadow:none;border-radius:0;border:0;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none}'+
'@media (max-width:1100px){.kd{grid-template-columns:minmax(0,1fr)}.kd-side{display:none}}'
);

function sel(){ var a=A(); if(!a.isoOk(UI.kalSel)) UI.kalSel=a.today(); return UI.kalSel; }
function wStart(iso){ var d=new Date(iso+"T12:00:00"); return A().addDays(iso,-((d.getDay()+6)%7)); }
function mins(t){ var m=String(t||"").match(/^(\d{1,2}):(\d{2})/); return m?(+m[1])*60+(+m[2]):null; }
function days(){ var a=A(), s=sel(), v=UI.kdView;
  if(v==="day") return [s];
  var ws=wStart(s), n=v==="workweek"?5:7, out=[]; for(var i=0;i<n;i++) out.push(a.addDays(ws,i)); return out; }
function rangeTitle(ds){
  var f=new Date(ds[0]+"T12:00:00"), l=new Date(ds[ds.length-1]+"T12:00:00");
  if(UI.kdView==="month") return new Date(A().curMonth()+"-15T12:00:00").toLocaleDateString("de-AT",{month:"long",year:"numeric"});
  if(ds.length===1) return f.toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  var sameM=f.getMonth()===l.getMonth();
  return f.getDate()+"."+(sameM?"":" "+f.toLocaleDateString("de-AT",{month:"long"}))+" – "+l.getDate()+". "+l.toLocaleDateString("de-AT",{month:"long",year:"numeric"});
}
function layout(list){
  var ev=list.map(function(e){ var st=mins(e.time), en=mins(e.end); if(en==null||en<=st) en=st+60; return {e:e,st:st,en:en,col:0,cols:1}; }).sort(function(x,y){ return x.st-y.st||y.en-x.en; });
  var groups=[], cur=null;
  ev.forEach(function(x){ if(!cur||x.st>=cur.end){ cur={items:[],end:x.en}; groups.push(cur); } cur.items.push(x); cur.end=Math.max(cur.end,x.en); });
  groups.forEach(function(g){ var ends=[]; g.items.forEach(function(x){ var c=0; while(ends[c]!=null&&ends[c]>x.st) c++; x.col=c; ends[c]=x.en; }); g.items.forEach(function(x){ x.cols=ends.length; }); });
  return ev;
}
function miniHtml(map){
  var a=A(), s=sel(), m=(UI.kdMini||s.slice(0,7)).split("-"), y=+m[0], mo=+m[1]-1, first=new Date(y,mo,1), start=F.ymd(new Date(y,mo,1-((first.getDay()+6)%7))), t=a.today(), ds=UI.kdView==="month"?[]:days(), cells="";
  for(var i=0;i<42;i++){ var k=a.addDays(start,i), d=new Date(k+"T12:00:00");
    cells+='<button type="button" data-kdday="'+k+'" class="'+(d.getMonth()!==mo?"out ":"")+(k===t?"today ":"")+(ds.indexOf(k)>-1?"inr ":"")+((map[k]||[]).length?"has":"")+'" aria-label="'+esc(a.longDate(k))+'">'+d.getDate()+'</button>'; }
  return '<div><div class="kd-mini-h"><span>'+esc(first.toLocaleDateString("de-AT",{month:"long",year:"numeric"}))+'</span><span><button type="button" data-act="kdmini:-1" aria-label="Voriger Monat">'+F.svg("chevL")+'</button><button type="button" data-act="kdmini:1" aria-label="Nächster Monat">'+F.svg("chevR")+'</button></span></div>'+
    '<div class="kd-mini">'+DOW.map(function(x){ return '<span>'+x.charAt(0)+'</span>'; }).join("")+cells+'</div></div>';
}
function weekHtml(map){
  var a=A(), ds=days(), t=a.today(), n=ds.length;
  var head='<div class="kw kw-h" style="--cols:'+n+'"><div></div>'+ds.map(function(k){ var d=new Date(k+"T12:00:00"); return '<div class="d'+(k===t?" today":"")+'" data-kdday="'+k+'" title="Tagesansicht"><b>'+d.getDate()+'</b><span>'+DOW[(d.getDay()+6)%7]+(n===1?" · "+d.toLocaleDateString("de-AT",{month:"long"}):"")+'</span></div>'; }).join("")+'</div>';
  var all='<div class="kw kw-all" style="--cols:'+n+'"><div class="lbl">ganztägig</div>'+ds.map(function(k){ return '<div class="c" data-kdcol="'+k+'">'+(map[k]||[]).filter(function(e){ return mins(e.time)==null; }).map(function(e){ return '<button type="button" style="--c:var(--sp-'+e.c+')" data-act="'+esc(e.act)+'"'+(e.editable?' data-kev="'+esc(e.id)+'" data-kday="'+k+'"':'')+' title="'+esc(e.label+" · "+(e.money?"Rechnung":e.sub))+'">'+(F.kalIco?F.kalIco(e):'')+esc(e.label)+'</button>'; }).join("")+'</div>'; }).join("")+'</div>';
  var times='<div class="kw-times">'; for(var h=0;h<24;h++) times+='<div class="tm">'+(h?'<span>'+String(h).padStart(2,"0")+':00</span>':'')+'</div>'; times+='</div>';
  var cols=ds.map(function(k){
    var slots=""; for(var s2=0;s2<48;s2++) slots+='<div class="slot" style="top:'+(s2*HR/2)+'px" data-kdslot="'+k+'|'+String(Math.floor(s2/2)).padStart(2,"0")+':'+(s2%2?"30":"00")+'"></div>';
    var evs=layout((map[k]||[]).filter(function(e){ return mins(e.time)!=null; })).map(function(x){ var top=x.st/60*HR, hg=Math.max(20,(x.en-x.st)/60*HR-2), w=100/x.cols;
      return '<button type="button" class="kwe'+(x.e.editable?' kedit':'')+'" data-act="'+esc(x.e.act)+'"'+(x.e.editable?' data-kev="'+esc(x.e.id)+'" data-kday="'+k+'" data-kst="'+x.st+'" data-ken="'+x.en+'"':'')+' style="--c:var(--sp-'+x.e.c+');top:'+top+'px;height:'+hg+'px;left:calc('+(w*x.col)+'% + 2px);width:calc('+w+'% - 5px)" title="'+esc(x.e.time+(x.e.end?"–"+x.e.end:"")+" · "+x.e.label+(x.e.loc?" · "+x.e.loc:""))+'"><b>'+(F.kalIco?F.kalIco(x.e):'')+esc(x.e.label)+'</b>'+(hg>34?'<small>'+esc(x.e.time+(x.e.end?"–"+x.e.end:""))+(x.e.loc?" · "+esc(x.e.loc):"")+'</small>':'')+(x.e.editable?'<span class="kwe-rs t" aria-hidden="true"></span><span class="kwe-rs b" aria-hidden="true"></span>':'')+'</button>'; }).join("");
    var now=""; if(k===t){ var d=new Date(); now='<div class="kw-now" style="top:'+((d.getHours()*60+d.getMinutes())/60*HR)+'px"></div>'; }
    return '<div class="kw-col'+(k===t?" today":"")+'" data-kdcol="'+k+'">'+slots+evs+now+'</div>';
  }).join("");
  return head+all+'<div class="kw-scroll" id="kwScroll"><div class="kw" style="--cols:'+n+'">'+times+cols+'</div></div>';
}
F.kalDesk=function(){
  var a=A(), map=a.calItems(), v=UI.kdView, ds=days(), s=sel();
  var seg=[["day","Tag"],["workweek","Arbeitswoche"],["week","Woche"],["month","Monat"]].map(function(o){ return '<button type="button" data-act="kdview:'+o[0]+'" aria-pressed="'+(v===o[0])+'">'+o[1]+'</button>'; }).join("");
  var bar='<div class="kd-bar"><button type="button" class="btn" data-act="kdtoday">Heute</button><button type="button" class="kd-nav" data-act="kdshift:-1" aria-label="Zurück" title="Zurück (←)">'+F.svg("chevL")+'</button><button type="button" class="kd-nav" data-act="kdshift:1" aria-label="Weiter" title="Weiter (→)">'+F.svg("chevR")+'</button><span class="t">'+esc(rangeTitle(ds))+'</span><span class="sp"></span><div class="kd-seg" role="group" aria-label="Ansicht">'+seg+'</div></div>';
  var leg='<div class="kd-leg"><b>Bereiche</b>'+a.SPARTEN.map(function(x){ return '<span><i style="--c:var(--sp-'+x[0]+')"></i>'+esc(x[0]==="privat"?"Privat (iCloud)":x[1])+'</span>'; }).join("")+'<span><i style="--c:var(--sp-todo)"></i>Fristen (Aufträge)</span><span><i style="--c:var(--sp-inv)"></i>Rechnung fällig</span></div>';
  return '<div class="kd"><aside class="panel kd-side"><button type="button" class="btn primary kd-new" data-act="newevent:'+s+'">+ Neuer Termin</button>'+miniHtml(map)+leg+a.statusLine()+'</aside>'+
    '<section class="panel kd-main">'+bar+(v==="month"?a.vCal():weekHtml(map))+'</section></div>';
};
/* Nach dem Aufbau zur Arbeitszeit scrollen (einmal je Ansicht/Zeitraum) */
var lastKey="";
var _after=null;
function afterDesk(){
  var sc=document.getElementById("kwScroll"); if(!sc) return;
  var key=UI.kdView+"|"+days()[0]; if(key===lastKey&&sc.scrollTop>0) return; lastKey=key;
  var d=new Date(), h=days().indexOf(A().today())>-1&&d.getHours()>=9&&d.getHours()<=17?d.getHours()-2:7; sc.scrollTop=h*HR;
}
var v=F.views.find(function(x){ return x.id==="kal"; });
if(v){ _after=v.after; v.after=function(){ if(_after) _after(); if(!A().isMobile()&&UI.kalTab!=="todo") afterDesk(); }; }

function shift(n){
  var a=A(), v=UI.kdView;
  if(v==="month"){ var m=a.curMonth().split("-"); UI.kalMonth=F.ymd(new Date(+m[0],+m[1]-1+n,1)).slice(0,7); UI.kalSel=UI.kalMonth+"-01"; }
  else UI.kalSel=a.addDays(sel(),n*(v==="day"?1:7));
  UI.kalMonth=UI.kalSel.slice(0,7); UI.kdMini=null; F._forceRender=true; F.render(); return true;
}
F.kalDeskShift=function(n){ if(A().isMobile()||UI.kalTab==="todo") return false; return shift(n); };
F.action("kdshift",function(n){ shift(+n); });
F.action("kdtoday",function(){ UI.kalSel=A().today(); UI.kalMonth=UI.kalSel.slice(0,7); UI.kdMini=null; F._forceRender=true; F.render(); });
F.action("kdview",function(v){ UI.kdView=v; F.ls("fsc_kal_dview",v); lastKey=""; if(v==="month") UI.kalMonth=sel().slice(0,7); F._forceRender=true; F.render(); });
F.action("kdmini",function(n){ var m=(UI.kdMini||sel().slice(0,7)).split("-"); UI.kdMini=F.ymd(new Date(+m[0],+m[1]-1+(+n),1)).slice(0,7); F._forceRender=true; F.render(); });
F.listen("click","[data-kdday]",function(el){ var k=el.getAttribute("data-kdday"); UI.kalSel=k; UI.kalMonth=k.slice(0,7); UI.kdMini=null; if(el.classList.contains("d")){ UI.kdView="day"; F.ls("fsc_kal_dview","day"); } else if(UI.kdView==="month"){ UI.kdView="day"; } F._forceRender=true; F.render(); });
/* Klick in eine freie halbe Stunde: neuer Termin mit Uhrzeit */
F.listen("click","[data-kdslot]",function(el){
  var p=el.getAttribute("data-kdslot").split("|"); A().openEventEdit(null,p[0]);
  setTimeout(function(){ var f=document.querySelector('form[data-form="kalevent"]'); if(!f) return; f.time.value=p[1]; var hh=+p[1].slice(0,2)+1; if(f.end) f.end.value=String(Math.min(23,hh)).padStart(2,"0")+p[1].slice(2); },30);
});
})();
