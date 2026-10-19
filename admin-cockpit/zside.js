/* Statusleiste rechts (Wunsch Simon 19.10.2026): Monatskalender, die 5 nächsten Termine, neueste Mails, aktuelle Fristen (Aufträge + To-Dos).
   Nur auf breiten Bildschirmen (ab 1360 px); ein-/ausblendbar über die Kopfleiste, Einstellung bleibt gespeichert. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.side=F.icons.side||'<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M15 4.5v15"/>';
var MQ=window.matchMedia?window.matchMedia("(min-width:1360px)"):null;
UI.sideOn=F.ls("fsc_side")!==false;
UI.sideM=UI.sideM||"";   // angezeigter Monat JJJJ-MM

function today(){ return (F.D&&F.D.today)||F.ymd(); }
function addDays(iso,n){ var d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return F.ymd(d); }
function dayShort(iso){ var t=today(); if(iso===t) return "Heute"; if(iso===addDays(t,1)) return "Morgen"; return new Date(iso+"T12:00:00").toLocaleDateString("de-AT",{weekday:"short",day:"numeric",month:"numeric"}).replace(/\.,?/,","); }
function events(){ var D=F.D, ev=(F.calEvents?F.calEvents():D.events)||[];
  var bz=((D.platforms&&D.platforms.blitzdings&&D.platforms.blitzdings.upcoming)||[]).map(function(b){ return {id:"",title:"Fotobox: "+(b.customerName||"Buchung"),date:String(b.eventDate||"").slice(0,10),time:"",location:b.location||""}; }).filter(function(b){ return /^\d{4}-\d{2}-\d{2}$/.test(b.date); });
  return ev.concat(bz); }
function nextEvents(n){ var t=today(), now=new Date(), hm=String(now.getHours()).padStart(2,"0")+":"+String(now.getMinutes()).padStart(2,"0");
  return events().filter(function(e){ return e.date>t||(e.date===t&&(!e.time||(e.end||e.time)>=hm)); }).sort(function(a,b){ return (a.date+(a.time||"")).localeCompare(b.date+(b.time||"")); }).slice(0,n); }
function newestMails(n){ var M=(F.D&&F.D.mail&&F.D.mail.messages)||[];
  return M.filter(function(m){ return !m.deleted&&F.isInbox&&F.isInbox(m); }).sort(function(a,b){ return String(b.date).localeCompare(String(a.date)); }).slice(0,n); }
function deadlines(n){ var t=today(), l=(F.tkDeadlines?F.tkDeadlines(n):[]).map(function(d){ return Object.assign({kind:"tk"},d); });
  ((F.D&&F.D.todos)||[]).filter(function(x){ return !x.done&&x.due; }).forEach(function(x){ l.push({kind:"todo",id:x.id,title:x.text,due:x.due,label:dayShort(x.due),cls:x.due<t?"over":x.due===t?"today":"",color:"var(--info)",project:"To-Do"}); });
  return l.sort(function(a,b){ return a.due.localeCompare(b.due); }).slice(0,n); }

function monthHtml(){ var t=today(), m=UI.sideM||t.slice(0,7), y=+m.slice(0,4), mo=+m.slice(5,7)-1, first=new Date(y,mo,1), start=(first.getDay()+6)%7, days=new Date(y,mo+1,0).getDate();
  var evDays={}; events().forEach(function(e){ if(e.date&&e.date.slice(0,7)===m) evDays[e.date]=1; });
  var dl=F.tkDueDays?F.tkDueDays():{};
  var cells=""; for(var i=0;i<start;i++) cells+='<span></span>';
  for(var d=1;d<=days;d++){ var iso=m+"-"+String(d).padStart(2,"0"), dots=(evDays[iso]?'<i class="e"></i>':'')+(dl[iso]?'<i class="d"></i>':'');
    cells+='<button type="button" class="sd'+(iso===t?" t":"")+(iso<t?" past":"")+'" data-act="dayview:'+iso+'" title="'+esc(new Date(iso+"T12:00:00").toLocaleDateString("de-AT",{weekday:"long",day:"numeric",month:"long"}))+'">'+d+(dots?'<span class="dots">'+dots+'</span>':'')+'</button>'; }
  var label=first.toLocaleDateString("de-AT",{month:"long",year:"numeric"});
  return '<section class="sb"><div class="sb-h"><b class="cap">'+esc(label)+'</b><span class="sp"></span><button type="button" class="sb-n" data-act="sidem:-1" aria-label="Voriger Monat">‹</button><button type="button" class="sb-n" data-act="sidem:0" title="Heute">•</button><button type="button" class="sb-n" data-act="sidem:1" aria-label="Nächster Monat">›</button></div>'+
    '<div class="scal"><span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span>'+cells+'</div>'+
    '<div class="slg"><span><i class="e"></i>Termin</span><span><i class="d"></i>Frist</span></div></section>'; }
function eventsHtml(){ var l=nextEvents(5);
  return '<section class="sb"><div class="sb-h"><b>Nächste Termine</b><span class="sp"></span><button type="button" class="link" data-go="kal">Kalender</button></div>'+
    (l.length?l.map(function(e){ return '<button type="button" class="si"'+(e.id?' data-act="event:'+esc(e.id)+'"':' data-go="kal"')+'><span class="sw">'+esc(dayShort(e.date))+'<small>'+esc(e.time||"ganztags")+'</small></span><span class="sm"><b>'+esc(e.title)+'</b>'+(e.location?'<small>'+esc(e.location)+'</small>':'')+'</span></button>'; }).join(""):'<p class="se">Keine anstehenden Termine.</p>')+'</section>'; }
function mailsHtml(){ var l=newestMails(5);
  return '<section class="sb"><div class="sb-h"><b>Neueste Mails</b><span class="sp"></span><button type="button" class="link" data-go="post">Postfach</button></div>'+
    (l.length?l.map(function(m){ var d=new Date(m.date), t=today(), when=F.ymd(d)===t?d.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("de-AT",{day:"numeric",month:"numeric"});
      return '<button type="button" class="si ml'+(m.read?"":" un")+'" data-act="sidemail:'+esc(m.id)+'"><span class="sm"><b>'+esc(m.fromName||m.from||"—")+'</b><small>'+esc(m.subject||"(kein Betreff)")+'</small></span><span class="tm">'+esc(when)+'</span></button>'; }).join(""):'<p class="se">Keine Mails.</p>')+'</section>'; }
function deadlinesHtml(){ var l=deadlines(6);
  return '<section class="sb"><div class="sb-h"><b>Fristen</b><span class="sp"></span><button type="button" class="link" data-go="auftraege">Aufträge</button></div>'+
    (l.length?l.map(function(d){ return '<button type="button" class="si dl" data-act="'+(d.kind==="tk"?"tkopen:":"todoview:")+esc(d.id)+'"><span class="bar" style="background:'+d.color+'"></span><span class="sm"><b>'+esc(d.title)+'</b><small>'+esc(d.project||"Ohne Auftrag")+'</small></span><span class="dd '+(d.cls||"")+'">'+esc(d.label||dayShort(d.due))+'</span></button>'; }).join(""):'<p class="se">Keine offenen Fristen. <button type="button" class="link" data-act="tknew:">Aufgabe anlegen</button></p>')+'</section>'; }

var last="";
F.sideVisible=function(){ return !!(UI.sideOn&&(!MQ||MQ.matches)); };
F.renderSide=function(){
  var el=document.getElementById("side"), app=document.querySelector(".app"); if(!el||!app) return;
  var on=UI.sideOn&&(!MQ||MQ.matches)&&!!F.D;
  app.classList.toggle("has-side",on); el.hidden=!on;
  var tb=document.getElementById("sideBtn"); if(tb) tb.setAttribute("aria-pressed",String(!!UI.sideOn));
  if(!on) return;
  var html; try{ html=monthHtml()+eventsHtml()+mailsHtml()+deadlinesHtml(); }catch(e){ console.error(e); html=""; }
  if(html!==last){ last=html; el.innerHTML=html; }
};
F.action("sidem",function(v){ var t=today(); if(+v===0){ UI.sideM=""; } else { var m=UI.sideM||t.slice(0,7), d=new Date(+m.slice(0,4),+m.slice(5,7)-1+(+v),1); UI.sideM=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); } F.renderSide(); });
F.action("sidemail",function(id){ UI.msel=id; if(F.current!=="post") F.go("post"); else F.render(); });
F.action("sidetoggle",function(){ UI.sideOn=!UI.sideOn; F.ls("fsc_side",UI.sideOn); F.renderSide(); if(F.current==="heute"){ F._forceRender=true; F.render(); } });
if(MQ&&MQ.addEventListener) MQ.addEventListener("change",function(){ F.renderSide(); if(F.current==="heute"){ F._forceRender=true; F.render(); } });
/* Schalter in der Kopfleiste */
(function(){ var r=document.querySelector(".topbar .tb-right"); if(!r||document.getElementById("sideBtn")) return;
  var b=document.createElement("button"); b.type="button"; b.id="sideBtn"; b.className="rf-ic side-btn"; b.title="Statusleiste rechts ein-/ausblenden"; b.setAttribute("aria-label","Statusleiste ein-/ausblenden"); b.setAttribute("data-act","sidetoggle"); b.innerHTML=F.svg("side");
  var ref=document.getElementById("refresh"); r.insertBefore(b,ref&&ref.parentNode===r?ref:null); })();

F.css(
'.side{display:none}'+
'@media (min-width:1360px){'+
  '.app.has-side{grid-template-columns:var(--rail-w,244px) minmax(0,1fr) 312px;grid-template-areas:"rail top side" "rail main side"}'+
  '.app.has-side .side{grid-area:side;display:flex;flex-direction:column;gap:14px;position:sticky;top:0;height:100vh;overflow-y:auto;padding:18px 16px 24px;border-left:1px solid var(--line);background:var(--ground);overscroll-behavior:contain;scrollbar-width:thin}'+
'}'+
'.side-btn svg{width:18px;height:18px}'+
'@media (max-width:1359px){.side-btn{display:none!important}}'+
'.sb{background:var(--panel);border:1px solid var(--line);border-radius:var(--r,14px);padding:14px 12px 10px;box-shadow:var(--shadow)}'+
'.sb-h{display:flex;align-items:center;gap:4px;padding:0 4px 10px}.sb-h b{font-size:14.5px;font-weight:700;letter-spacing:-.01em;color:var(--ink)}.sb-h .link{color:var(--ink-3);font-weight:500}.sb-h .link:hover{color:var(--glow);text-decoration:none}.sb-h .cap{text-transform:capitalize}.sb-h .sp{flex:1}.sb-h .link{font-size:12px}'+
'.sb-n{border:0;background:none;width:24px;height:24px;border-radius:6px;color:var(--ink-2);font-size:16px;line-height:1}.sb-n:hover{background:var(--sunk);color:var(--ink)}'+
'.scal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;text-align:center}.scal>span{font-size:10.5px;color:var(--ink-3);font-weight:600;padding-bottom:2px}'+
'.sd{position:relative;border:0;background:none;border-radius:7px;height:30px;font-size:12.5px;color:var(--ink);font-variant-numeric:tabular-nums;padding:0}.sd:hover{background:var(--sunk)}.sd.past{color:var(--ink-3)}'+
'.sd.t{background:var(--glow);color:var(--on-glow);font-weight:700}'+
'.sd .dots{position:absolute;left:0;right:0;bottom:2px;display:flex;justify-content:center;gap:2px}.sd i,.slg i{display:inline-block;width:4px;height:4px;border-radius:50%}.sd i.e,.slg i.e{background:var(--glow)}.sd i.d,.slg i.d{background:var(--warn)}.sd.t i{background:var(--on-glow)}'+
'.slg{display:flex;gap:12px;justify-content:center;font-size:11px;color:var(--ink-3);padding-top:6px}.slg i{margin-right:4px;vertical-align:1px}'+
'.si{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;text-align:left;padding:7px 6px;border-radius:8px;color:var(--ink);min-width:0}.si:hover{background:var(--sunk)}'+
'.si .sm{flex:1;min-width:0;display:grid}.si .sm b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.si .sm small{font-size:12px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.si .sw{flex:none;width:62px;display:grid;font-size:12px;font-weight:600;color:var(--glow)}.si .sw small{font-weight:400;color:var(--ink-3)}'+
'.si.ml .sm b{font-weight:500}.si.ml.un .sm b{font-weight:700}.si.ml.un:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--glow);flex:none;margin-right:-4px}.si .tm{font-size:11.5px;color:var(--ink-3);flex:none}'+
'.si.dl .bar{width:3px;align-self:stretch;border-radius:3px;flex:none}.si .dd{font-size:12px;font-weight:600;color:var(--ink-2);flex:none}.si .dd.over{color:var(--bad)}.si .dd.today{color:var(--glow)}.si .dd.soon{color:var(--warn)}'+
'.se{font-size:12.5px;color:var(--ink-3);margin:2px 6px 6px}'
);
})();
