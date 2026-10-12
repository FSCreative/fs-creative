/* Kalender & To-Dos am Handy – wie die Outlook-App: Kopfzeile, Wochenleiste (wischbar, aufklappbar zum Monat),
   Agenda als Standard, Tagesansicht mit Stundenraster, runder „+“-Knopf; To-Dos mit Abhakkreisen und Wischgesten.
   Daten und Dialoge kommen aus kal.js (F.kalApi). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
function A(){ return F.kalApi; }
UI.kmView=UI.kmView||F.ls("fsc_kal_mview")||"agenda";
var HOUR=56;
var DOW=["Mo","Di","Mi","Do","Fr","Sa","So"];

F.css(
'.kmapp,.kmstrip,.kmonthx,.kagd,.kday,.ktadd,.kmtabs{display:none}'+
'@media (max-width:900px){'+
  '.view-kal{margin-top:-16px}'+
  '.view-kal>.head,.view-kal>.kal-top{display:none}'+
  '.kmapp{display:flex}'+
  '.kmapp .mapp-t b{font-size:21px;text-transform:capitalize}'+
  '.kmtoday{position:relative;width:40px;height:40px;border-radius:50%;border:0;background:var(--sunk);color:var(--ink);display:grid;place-items:center;flex:none}'+
  '.kmtoday svg{width:22px;height:22px}.kmtoday b{position:absolute;top:15px;left:0;right:0;font:700 10px/1 var(--f-mono);text-align:center}'+
  '.kmbadge{position:absolute;top:-2px;right:-2px;min-width:17px;height:17px;border-radius:99px;background:var(--glow);color:#2a1a00;font:700 10px/17px var(--f-mono);padding:0 4px;text-align:center}'+
  /* Wochenleiste */
  '.kmhead{position:sticky;top:0;z-index:20;margin-inline:calc(-1*clamp(16px,4vw,44px));background:color-mix(in srgb,var(--ground) 90%,transparent);backdrop-filter:saturate(1.6) blur(14px);-webkit-backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid var(--line)}'+'.kmhead .mapp{position:static;margin:0;background:none;backdrop-filter:none;-webkit-backdrop-filter:none}'+'.kmstrip{display:block;touch-action:pan-y}'+
  '.kmdows,.kmweek,.kmgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));padding:0 6px}'+
  '.kmdows span{text-align:center;font-size:11px;font-weight:600;color:var(--ink-3);padding:2px 0 4px;text-transform:uppercase;letter-spacing:.04em}'+
  '.kmweek{padding-bottom:8px;transition:transform .22s cubic-bezier(.2,.8,.2,1),opacity .22s}'+
  '.kmd{border:0;background:none;color:var(--ink);display:grid;justify-items:center;gap:3px;padding:2px 0;font:inherit}'+
  '.kmd .n{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-size:16px;font-weight:600}'+
  '.kmd.out .n{color:var(--ink-3)}'+
  '.kmd.today .n{color:var(--m-blue,#0f6cbd);font-weight:800}'+
  '.kmd.sel .n{background:var(--m-blue,#0f6cbd);color:#fff}'+
  '.kmd .dots{display:flex;gap:2px;height:5px}.kmd .dots i{width:5px;height:5px;border-radius:50%;background:var(--c)}'+
  '.kmgrid{padding-bottom:6px}.kmgrid .kmd .n{width:34px;height:34px;font-size:15px}'+
  '.kmgrab{display:block;width:38px;height:5px;border-radius:99px;background:var(--line);margin:2px auto 6px;border:0}'+
  /* Agenda */
  '.kagd{display:block;margin-inline:calc(-1*clamp(16px,4vw,44px))}'+
  '.kagd-h{position:sticky;top:var(--kst,120px);z-index:5;padding:10px 16px 6px;font-size:13px;font-weight:700;color:var(--ink-2);background:var(--ground);text-transform:none}'+
  '.kagd-h.today{color:var(--m-blue,#0f6cbd)}'+
  '.kagd-h small{font-weight:500;color:var(--ink-3);margin-left:6px}'+
  '.kai{display:grid;grid-template-columns:62px 4px minmax(0,1fr);gap:12px;align-items:stretch;width:100%;border:0;background:none;padding:10px 16px;text-align:left;color:var(--ink);font:inherit}'+
  '.kai:active{background:var(--sunk)}'+
  '.kai .t{display:grid;align-content:start;font-size:13.5px;font-weight:600;line-height:1.35}.kai .t small{font-weight:500;color:var(--ink-3);font-size:12px}'+
  '.kai .bar{display:block;border-radius:3px;background:var(--c);min-height:38px}'+
  '.kai .m{display:grid;min-width:0;gap:1px}.kai .m b{font-size:15.5px;font-weight:600;overflow-wrap:anywhere}.kai .m small{color:var(--ink-3);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.kai.late .m b{color:var(--bad)}'+
  '.kai-none{padding:6px 16px 12px;color:var(--ink-3);font-size:14px}'+
  '.kagd-more{display:block;margin:12px auto 24px;border:0;background:var(--sunk);color:var(--ink-2);font:inherit;font-weight:600;font-size:14px;padding:9px 16px;border-radius:99px}'+
  /* Tag */
  '.kday{display:block;margin-inline:calc(-1*clamp(16px,4vw,44px));touch-action:pan-y}'+
  '.kday-h{display:flex;align-items:center;justify-content:space-between;padding:10px 16px 6px}'+
  '.kday-h b{font-size:15px;text-transform:capitalize}'+
  '.kday-all{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 10px 64px}'+
  '.kday-all button{border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 18%,var(--panel));color:var(--ink);border-radius:6px;padding:4px 8px;font:inherit;font-size:13px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.kgridd{position:relative;margin-left:56px;margin-right:12px;border-top:1px solid var(--line)}'+
  '.kgridd .hr{height:'+HOUR+'px;border-bottom:1px solid var(--line);position:relative}'+
  '.kgridd .hr span{position:absolute;left:-50px;top:-8px;width:42px;text-align:right;font:500 11.5px/1 var(--f-mono);color:var(--ink-3)}'+
  '.kev{position:absolute;border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 22%,var(--panel));color:var(--ink);border-radius:8px;padding:4px 7px;text-align:left;font:inherit;font-size:13px;line-height:1.3;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.08)}'+
  '.kev b{display:block;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kev small{color:var(--ink-2);font-size:11.5px}'+
  '.know{position:absolute;left:-6px;right:0;height:2px;background:var(--m-red,#d13438);z-index:3}.know:before{content:"";position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:var(--m-red,#d13438)}'+
  /* Monat */
  '.view-kal .kmonthwrap>.panel{border-radius:0;border-inline:0;margin-inline:calc(-1*clamp(16px,4vw,44px))}'+
  '.view-kal .kmonthwrap .kcal-h,.view-kal .kmonthwrap .klegend{display:none}'+
  /* Blätter (Dialoge) von unten */
  '.modal:has(.dialog.ksheet){place-items:end stretch;padding:0}'+
  '.dialog.ksheet{width:100%;max-width:none;max-height:92vh;border-radius:20px 20px 0 0;padding:10px 18px calc(18px + env(safe-area-inset-bottom,0px));animation:ksheetu .24s cubic-bezier(.2,.8,.2,1)}'+
  '.dialog.ksheet:before{content:"";display:block;width:38px;height:5px;border-radius:99px;background:var(--line);margin:0 auto 8px}'+
  '@keyframes ksheetu{from{transform:translateY(60px);opacity:.4}to{transform:none;opacity:1}}'+
  '.dialog.ksheet input.f,.dialog.ksheet textarea.f,.dialog.ksheet select.f{font-size:16px}'+
  /* To-Dos */
  '.kmtabs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:4px 0 10px}.kmtabs::-webkit-scrollbar{display:none}.kmtabs .chip{flex:none;padding:7px 14px;font-size:14px}'+
  '.view-kal .kmtodo .kpis,.view-kal .kmtodo .kadd,.view-kal .kmtodo .kprog{display:none}'+
  '.view-kal .kmtodo>.panel{border-radius:0;border-inline:0;margin-inline:calc(-1*clamp(16px,4vw,44px));background:var(--ground)}'+
  '.view-kal .ktodo{grid-template-columns:28px minmax(0,1fr) auto;gap:12px;padding:12px 16px;background:var(--ground);position:relative;transition:transform .25s cubic-bezier(.2,.8,.2,1)}'+
  '.view-kal .ktodo .del{display:none}'+
  '.view-kal .ktodo input{appearance:none;-webkit-appearance:none;width:24px;height:24px;border-radius:50%;border:2px solid var(--ink-3);display:grid;place-items:center;transition:.15s}'+
  '.view-kal .ktodo input:checked{background:var(--ok);border-color:var(--ok)}.view-kal .ktodo input:checked:after{content:"✓";color:#fff;font-size:14px;font-weight:800}'+
  '.view-kal .ktodo .todo-t{font-size:15.5px}'+
  '.ktsw{position:relative;overflow:hidden}.ktsw-bg{position:absolute;inset:0;display:flex;align-items:center;padding:0 24px;color:#fff;font-weight:700;gap:8px}'+
  '.ktsw-bg.l{background:var(--m-red,#d13438);justify-content:flex-end}.ktsw-bg.r{background:var(--ok);justify-content:flex-start}'+
  '.ktadd{display:flex;gap:8px;position:fixed;left:0;right:0;bottom:calc(64px + env(safe-area-inset-bottom,0px));z-index:24;padding:8px 12px;background:color-mix(in srgb,var(--ground) 92%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line)}'+
  '.ktadd input{flex:1;border-radius:99px;height:44px;font-size:16px;padding-inline:16px}'+
  '.ktadd input[type=date]{flex:0 0 46px;width:46px;padding:0 8px;color:transparent}.ktadd input[type=date]::-webkit-datetime-edit{display:none}'+
  '.ktadd button{border-radius:99px;width:44px;height:44px;padding:0;display:grid;place-items:center;background:var(--m-blue,#0f6cbd);border:0;color:#fff;font-size:24px}'+
  '.view-kal .kmtodo{padding-bottom:70px}'+
'}'
);

/* ---------- Hilfen ---------- */
function weekStart(iso){ var d=new Date(iso+"T12:00:00"), wd=(d.getDay()+6)%7; return A().addDays(iso,-wd); }
function sel(){ var a=A(); if(!a.isoOk(UI.kalSel)) UI.kalSel=a.today(); return UI.kalSel; }
function setSel(k,noRender){ UI.kalSel=k; UI.kalMonth=k.slice(0,7); if(!noRender){ F._forceRender=true; F.render(); } }
function dayLabel(k){ var a=A(), t=a.today(), d=a.diffDays(k,t), base=a.longDate(k,k.slice(0,4)===t.slice(0,4));
  return (d===0?"Heute · ":d===1?"Morgen · ":d===-1?"Gestern · ":"")+base; }
function dotsHtml(list){ return '<span class="dots">'+list.slice(0,3).map(function(e){ return '<i style="--c:var(--sp-'+e.c+')"></i>'; }).join("")+'</span>'; }
function dayBtn(k,map,month){ var a=A(), list=map[k]||[], d=new Date(k+"T12:00:00");
  return '<button type="button" class="kmd'+(k===a.today()?" today":"")+(k===sel()?" sel":"")+(month&&k.slice(0,7)!==month?" out":"")+'" data-kmday="'+k+'" aria-label="'+esc(a.longDate(k))+'"><span class="n">'+d.getDate()+'</span>'+dotsHtml(list)+'</button>'; }
function stripHtml(map){
  var a=A(), s=sel();
  if(UI.kmExpand){
    var m=s.slice(0,7).split("-"), first=new Date(+m[0],+m[1]-1,1), start=F.ymd(new Date(+m[0],+m[1]-1,1-((first.getDay()+6)%7))), cells="";
    for(var i=0;i<42;i++) cells+=dayBtn(a.addDays(start,i),map,s.slice(0,7));
    return '<div class="kmdows">'+DOW.map(function(x){ return '<span>'+x+'</span>'; }).join("")+'</div><div class="kmgrid" id="kmweek">'+cells+'</div><button type="button" class="kmgrab" data-act="kmexpand" aria-label="Monat einklappen"></button>';
  }
  var ws=weekStart(s), days="";
  for(var j=0;j<7;j++) days+=dayBtn(a.addDays(ws,j),map,"");
  return '<div class="kmdows">'+DOW.map(function(x){ return '<span>'+x+'</span>'; }).join("")+'</div><div class="kmweek" id="kmweek">'+days+'</div><button type="button" class="kmgrab" data-act="kmexpand" aria-label="Ganzen Monat zeigen"></button>';
}
function itemHtml(e){
  var t=e.time?'<span class="t">'+esc(e.time)+(e.end?'<small>'+esc(e.end)+'</small>':'')+'</span>':'<span class="t"><small>ganztägig</small></span>';
  var sub=[e.sub,e.loc].filter(Boolean).join(" · ");
  return '<button type="button" class="kai'+(e.late?" late":"")+'" data-act="'+esc(e.act)+'">'+t+'<span class="bar" style="--c:var(--sp-'+e.c+')"></span><span class="m"><b>'+(e.priv?'🔒 ':'')+esc(e.label)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':'')+'</span></button>';
}

/* ---------- Agenda ---------- */
function agendaHtml(map){
  var a=A(), t=a.today(), s=sel(), start=s<t?s:t, span=60+(UI.kmMore||0), out="";
  for(var i=0;i<span;i++){
    var k=a.addDays(start,i), list=map[k]||[];
    if(!list.length&&k!==t&&k!==s) continue;
    out+='<div class="kagd-d" data-kmagd="'+k+'"><div class="kagd-h'+(k===t?" today":"")+'">'+esc(dayLabel(k))+(list.length>1?'<small>'+list.length+' Einträge</small>':'')+'</div>'+
      (list.length?list.map(itemHtml).join(""):'<div class="kai-none">Keine Termine</div>')+'</div>';
  }
  return '<div class="kagd" id="kagd">'+out+'<button type="button" class="kagd-more" data-act="kmmore">Weitere Wochen laden</button></div>';
}

/* ---------- Tag (Stundenraster) ---------- */
function mins(t){ var m=String(t||"").match(/^(\d{1,2}):(\d{2})/); return m?(+m[1])*60+(+m[2]):null; }
function dayHtml(map){
  var a=A(), s=sel(), list=map[s]||[], allday=list.filter(function(e){ return mins(e.time)==null; }), timed=list.filter(function(e){ return mins(e.time)!=null; });
  /* Überlappungen nebeneinander */
  var ev=timed.map(function(e){ var st=mins(e.time), en=mins(e.end); if(en==null||en<=st) en=st+60; return {e:e,st:st,en:en,col:0,cols:1}; }).sort(function(x,y){ return x.st-y.st; });
  var groups=[], cur=null;
  ev.forEach(function(x){ if(!cur||x.st>=cur.end){ cur={items:[],end:x.en}; groups.push(cur); } cur.items.push(x); cur.end=Math.max(cur.end,x.en); });
  groups.forEach(function(g){ var colsEnd=[]; g.items.forEach(function(x){ var c=0; while(colsEnd[c]!=null&&colsEnd[c]>x.st) c++; x.col=c; colsEnd[c]=x.en; }); var n=colsEnd.length; g.items.forEach(function(x){ x.cols=n; }); });
  var hrs=""; for(var h=0;h<24;h++) hrs+='<div class="hr">'+(h?'<span>'+String(h).padStart(2,"0")+':00</span>':'')+'</div>';
  var blocks=ev.map(function(x){ var top=x.st/60*HOUR, hgt=Math.max(26,(x.en-x.st)/60*HOUR-2), w=100/x.cols;
    return '<button type="button" class="kev" data-act="'+esc(x.e.act)+'" style="--c:var(--sp-'+x.e.c+');top:'+top+'px;height:'+hgt+'px;left:calc('+(w*x.col)+'% + 2px);width:calc('+w+'% - 4px)"><b>'+(x.e.priv?'🔒 ':'')+esc(x.e.label)+'</b><small>'+esc(x.e.time+(x.e.end?"–"+x.e.end:""))+(x.e.loc?" · "+esc(x.e.loc):"")+'</small></button>'; }).join("");
  var now="";
  if(s===a.today()){ var d=new Date(); now='<div class="know" style="top:'+((d.getHours()*60+d.getMinutes())/60*HOUR)+'px"></div>'; }
  return '<div class="kday" id="kday"><div class="kday-h"><b>'+esc(dayLabel(s))+'</b><span class="muted">'+(list.length?list.length+(list.length===1?" Eintrag":" Einträge"):"frei")+'</span></div>'+
    (allday.length?'<div class="kday-all">'+allday.map(function(e){ return '<button type="button" style="--c:var(--sp-'+e.c+')" data-act="'+esc(e.act)+'">'+esc(e.label)+'</button>'; }).join("")+'</div>':'')+
    '<div class="kgridd" id="kgridd">'+hrs+blocks+now+'</div></div>';
}

/* ---------- To-Dos ---------- */
function todoHtml(){
  var a=A(), s=a.todoStats(), f=UI.todoF||"open";
  var chip=function(k,l,n){ return '<button type="button" class="chip" data-act="tfilter:'+k+'" aria-pressed="'+(f===k)+'">'+l+(n!=null?' · '+n:'')+'</button>'; };
  /* vTodo aus kal.js liefert die Liste; Kacheln/Formular blendet CSS am Handy aus */
  return '<div class="kmtabs">'+chip("open","Offen",s.open.length)+chip("today","Heute",s.tod.length)+chip("over","Überfällig",s.over.length)+chip("done","Erledigt",s.done.length)+'</div>'+
    '<div class="kmtodo">'+(F.kalVTodo?F.kalVTodo():"")+'</div>'+
    '<form class="ktadd" data-form="kaltodoadd"><input class="f" name="text" placeholder="Aufgabe hinzufügen" aria-label="Neue Aufgabe" required data-keepfocus="ktodoaddm" autocomplete="off"><input class="f" type="date" name="due" aria-label="Fällig am" title="Fällig am"><button type="submit" aria-label="Hinzufügen">+</button></form>';
}

/* ---------- Ansicht ---------- */
F.kalMobile=function(){
  var a=A(), todo=UI.kalTab==="todo", s=sel(), s2=a.todoStats();
  if(todo){
    return '<div class="mapp kmapp"><button type="button" class="mapp-i" data-act="kaltab:kal" aria-label="Zurück zum Kalender">'+F.svg("kal")+'</button><div class="mapp-t"><b>To-Dos</b><span>'+(s2.open.length?s2.open.length+" offen"+(s2.over.length?" · "+s2.over.length+" überfällig":""):"Alles erledigt")+'</span></div></div>'+todoHtml();
  }
  var map=a.calItems(), v=UI.kmView, title=new Date(s+"T12:00:00").toLocaleDateString("de-AT",{month:"long",year:s.slice(0,4)===a.today().slice(0,4)?undefined:"numeric"});
  var td=new Date().getDate();
  var bar='<div class="mapp kmapp"><button type="button" class="mapp-t" data-act="kmexpand"><b>'+esc(title)+' '+F.svg("m_chev")+'</b><span>'+(a.CAL.ready?(a.CAL.loading?"aktualisiert …":({agenda:"Agenda",day:"Tag",month:"Monat"}[v])):"lädt …")+'</span></button>'+
    '<button type="button" class="kmtoday" data-act="kmtoday" aria-label="Heute"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg><b>'+td+'</b></button>'+
    '<button type="button" class="mapp-i" data-act="kmview" aria-label="Ansicht wechseln"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg></button>'+
    '<button type="button" class="mapp-i" data-act="kaltab:todo" aria-label="To-Dos" style="position:relative">'+F.svg("todo")+(s2.open.length?'<span class="kmbadge">'+s2.open.length+'</span>':'')+'</button></div>';
  var body;
  if(v==="month") body='<div class="kmhead">'+bar+'</div><div class="kmonthwrap">'+a.vCal()+'</div>';
  else body='<div class="kmhead" id="kmhead">'+bar+'<div class="kmstrip" id="kmstrip">'+stripHtml(map)+'</div></div>'+(v==="day"?dayHtml(map):agendaHtml(map));
  return body+'<button type="button" class="mfab" data-act="newevent:'+s+'" aria-label="Neuer Termin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>';
};
/* Nach dem Aufbau: Agenda/Tag an die richtige Stelle scrollen, Wochenleiste beim Scrollen mitführen */
var OBS=null, jump=true;
F.kalMobileAfter=function(){
  if(UI.kalTab==="todo") return;
  var hd=document.getElementById("kmhead"), off=hd?hd.getBoundingClientRect().height:60;
  document.documentElement.style.setProperty("--kst",off+"px");
  if(UI.kmView==="day"&&jump){ jump=false; var g=document.getElementById("kgridd"); if(g){ var d=new Date(), h=sel()===A().today()?Math.max(0,d.getHours()-1):7; setTimeout(function(){ window.scrollTo(0,g.getBoundingClientRect().top+window.scrollY+h*HOUR-off-10); },0); } }
  if(UI.kmView==="agenda"){
    if(jump){ jump=false; var el=document.querySelector('[data-kmagd="'+sel()+'"]'); if(el) setTimeout(function(){ window.scrollTo(0,Math.max(0,el.getBoundingClientRect().top+window.scrollY-off)); },0); }
    if(OBS) OBS.disconnect();
    if(window.IntersectionObserver){
      OBS=new IntersectionObserver(function(ents){
        var vis=ents.filter(function(x){ return x.isIntersecting; }); if(!vis.length||Date.now()-(F._kmJumpAt||0)<700) return;
        var k=vis.sort(function(x,y){ return x.boundingClientRect.top-y.boundingClientRect.top; })[0].target.getAttribute("data-kmagd");
        if(!k||k===UI.kalSel) return; var ws=weekStart(UI.kalSel); UI.kalSel=k; UI.kalMonth=k.slice(0,7);
        var st=document.getElementById("kmstrip");
        if(st&&(UI.kmExpand?k.slice(0,7)!==ws.slice(0,7):weekStart(k)!==ws)) st.innerHTML=stripHtml(A().calItems());
        else document.querySelectorAll(".kmd").forEach(function(b){ b.classList.toggle("sel",b.getAttribute("data-kmday")===k); });
      },{rootMargin:"-"+(off+2)+"px 0px -70% 0px"});
      document.querySelectorAll("[data-kmagd]").forEach(function(x){ OBS.observe(x); });
    }
  }
};
function jumpTo(k){
  var a=A(); setSel(k,true); jump=true; F._kmJumpAt=Date.now();
  if(UI.kmView==="agenda"&&!document.querySelector('[data-kmagd="'+k+'"]')) UI.kmMore=Math.max(0,a.diffDays(k,a.today())-50);
  F._forceRender=true; F.render();
}
F.listen("click","[data-kmday]",function(el){ var k=el.getAttribute("data-kmday"); if(UI.kmExpand){ UI.kmExpand=false; } jumpTo(k); });
F.action("kmtoday",function(){ UI.kmExpand=false; jumpTo(A().today()); });
F.action("kmexpand",function(){ if(UI.kmView==="month"){ F.actions.kmview(); return; } UI.kmExpand=!UI.kmExpand; F._forceRender=true; F.render(); });
F.action("kmmore",function(){ UI.kmMore=(UI.kmMore||0)+60; F._forceRender=true; F.render(); });
F.action("kmview",function(){
  var set=function(v){ return function(){ UI.kmView=v; F.ls("fsc_kal_mview",v); UI.kmExpand=false; jump=true; F._forceRender=true; F.render(); window.scrollTo(0,0); }; };
  if(F.M&&F.M.ctx) F.M.ctx(0,0,[{label:(UI.kmView==="agenda"?"✓ ":"")+"Agenda",act:set("agenda")},{label:(UI.kmView==="day"?"✓ ":"")+"Tag",act:set("day")},{label:(UI.kmView==="month"?"✓ ":"")+"Monat",act:set("month")}],"Ansicht");
  else set(UI.kmView==="agenda"?"day":UI.kmView==="day"?"month":"agenda")();
});
/* Neu zeichnen, wenn die Breite die Handy-Grenze überschreitet */
var wasM=null; window.addEventListener("resize",function(){ var m=A()&&A().isMobile(); if(wasM!==null&&m!==wasM&&F.current==="kal"){ F._forceRender=true; F.render(); } wasM=m; });

/* ---------- Gesten: Wochenleiste/Tag wischen; To-Dos wischen (rechts erledigt, links löschen) ---------- */
var G=null;
document.addEventListener("touchstart",function(e){
  if(F.current!=="kal"||e.touches.length!==1||!(A()&&A().isMobile())){ G=null; return; }
  var t=e.touches[0], tg=e.target;
  var st=tg.closest&&tg.closest("#kmstrip"), dy=tg.closest&&tg.closest("#kday"), td=tg.closest&&tg.closest(".view-kal .ktodo");
  if(td&&!tg.closest("input")){ G={kind:"todo",el:td,x:t.clientX,y:t.clientY,dx:0,lock:null,w:td.offsetWidth}; return; }
  G=st?{kind:"strip",x:t.clientX,y:t.clientY,dx:0,lock:null}:dy?{kind:"day",x:t.clientX,y:t.clientY,dx:0,lock:null}:null;
},{passive:true});
document.addEventListener("touchmove",function(e){
  if(!G) return; var t=e.touches[0], dx=t.clientX-G.x, dy=t.clientY-G.y;
  if(G.lock===null&&(Math.abs(dx)>8||Math.abs(dy)>8)) G.lock=Math.abs(dx)>Math.abs(dy)*1.2?"x":"y";
  if(G.lock!=="x") return; G.dx=dx; F._scrollAt=Date.now();
  if(G.kind==="strip"){ var w=document.getElementById("kmweek"); if(w){ w.style.transition="none"; w.style.transform="translateX("+dx*0.6+"px)"; w.style.opacity=String(1-Math.min(.5,Math.abs(dx)/500)); } return; }
  if(G.kind==="todo"){
    if(!G.wrap){ var wr=document.createElement("div"); wr.className="ktsw"; wr.innerHTML='<div class="ktsw-bg r">✓ Erledigt</div><div class="ktsw-bg l">Löschen 🗑</div>'; G.el.parentNode.insertBefore(wr,G.el); wr.appendChild(G.el); G.wrap=wr; }
    G.el.style.transition="none"; G.el.style.transform="translateX("+dx+"px)";
    G.wrap.querySelector(".ktsw-bg.r").style.visibility=dx>0?"visible":"hidden"; G.wrap.querySelector(".ktsw-bg.l").style.visibility=dx<0?"visible":"hidden";
  }
},{passive:true});
document.addEventListener("touchend",function(){
  if(!G) return; var g=G; G=null; if(g.lock!=="x") return;
  var a=A();
  if(g.kind==="strip"){ var w=document.getElementById("kmweek"); if(Math.abs(g.dx)<50){ if(w){ w.style.transition=""; w.style.transform=""; w.style.opacity=""; } return; }
    var dir=g.dx<0?1:-1, s=sel(), k;
    if(UI.kmExpand){ var m=s.slice(0,7).split("-"); k=F.ymd(new Date(+m[0],+m[1]-1+dir,1)); } else k=a.addDays(s,7*dir);
    if(w){ w.style.transition=""; w.style.transform="translateX("+(-dir*60)+"px)"; w.style.opacity="0"; }
    setTimeout(function(){ jumpTo(k); },140); return; }
  if(g.kind==="day"){ if(Math.abs(g.dx)>60) jumpTo(a.addDays(sel(),g.dx<0?1:-1)); return; }
  if(g.kind==="todo"){
    var el=g.el, id=(el.querySelector("[data-todo]")||{getAttribute:function(){return "";}}).getAttribute("data-todo"), done=Math.abs(g.dx)>g.w*0.35;
    el.style.transition="";
    if(!done||!id){ el.style.transform=""; setTimeout(function(){ if(g.wrap&&g.wrap.parentNode){ g.wrap.parentNode.insertBefore(el,g.wrap); g.wrap.remove(); } },260); return; }
    el.style.transform="translateX("+(g.dx<0?"-110%":"110%")+")";
    setTimeout(function(){ var wr=g.wrap; wr.style.transition="height .2s,opacity .2s"; wr.style.height=wr.offsetHeight+"px"; void wr.offsetHeight; wr.style.height="0"; wr.style.opacity="0"; },180);
    setTimeout(function(){ F._forceRender=true; if(g.dx<0) a.delTodo(id); else { var t=a.findTodo(id); if(t) a.patchTodo(id,{done:!t.done,doneAt:!t.done?Date.now():null}).then(function(j){ if(a.okJ(j)) F.toast(t.done?"Wieder offen":"Erledigt",false,"Rückgängig",function(){ a.patchTodo(id,{done:!!t.done,doneAt:t.done?Date.now():null}); }); }); } },400);
  }
},{passive:true});
})();
