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
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'
};
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
FSC.SEVURL = "https://my.sevdesk.de";
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
    FSC.render();
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
FSC.renderNav = function(){
  var cur=FSC.current;
  document.getElementById("nav").innerHTML=FSC.views.filter(function(v){return !v.hidden;}).map(function(v){ var c=navCount(v); return '<button class="nav-btn" data-go="'+v.id+'"'+(v.id===cur?' aria-current="page"':'')+'>'+FSC.svg(v.icon)+'<span>'+v.label+'</span>'+(c?'<span class="count">'+c+'</span>':'')+'</button>'; }).join("");
  var mob=FSC.views.filter(function(v){return v.mobile;}).slice(0,5);
  var inMob=mob.some(function(v){return v.id===cur;});
  document.getElementById("tabbar").innerHTML=mob.map(function(v){ var c=navCount(v); return '<button data-go="'+v.id+'"'+(v.id===cur?' aria-current="page"':'')+'>'+FSC.svg(v.icon)+'<span>'+(v.short||v.label)+'</span>'+(c?'<span class="count">'+c+'</span>':'')+'</button>'; }).join("")+
    '<button data-act="moresheet"'+(!inMob?' aria-current="page"':'')+'>'+FSC.svg("more")+'<span>Mehr</span></button>';
  var st=document.getElementById("stamp"); if(st) st.textContent=FSC.D?"Stand "+new Date(FSC.D.fetchedAt).toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}):"";
};
FSC.render = function(){
  FSC.renderNav();
  var main=document.getElementById("main");
  if(!FSC.D){ main.innerHTML='<div class="loading">'+(FSC.loadErr?FSC.esc(FSC.loadErr)+' <button class="btn" data-act="reload">Erneut versuchen</button>':'Lade deine Daten …')+'</div>'; return; }
  var v=FSC.views.find(function(x){return x.id===FSC.current;})||FSC.views[0];
  var ae=document.activeElement, keep=ae&&ae.getAttribute&&ae.getAttribute("data-keepfocus"), selS=keep&&ae.selectionStart;
  var y=window.scrollY;
  try{ main.innerHTML='<div class="view view-'+v.id+'">'+v.render()+'</div>'; if(v.after) v.after(); }
  catch(e){ main.innerHTML='<div class="loading">Fehler beim Anzeigen: '+FSC.esc(e.message)+'</div>'; console.error(e); }
  if(keep){ var q=main.querySelector('[data-keepfocus="'+keep+'"]'); if(q){ q.focus(); try{ q.setSelectionRange(selS,selS); }catch(e){} } }
  window.scrollTo(0,y);
  if(FSC.drawerRefresh&&document.getElementById("drawer").classList.contains("on")) FSC.drawerRefresh();
};
FSC.go = function(id){ FSC.current=id; try{ history.replaceState(null,"","#"+id); }catch(e){} FSC.closeDrawer(); FSC.closeModal(); FSC.render(); window.scrollTo(0,0); };

/* ---------- Drawer & Dialoge ---------- */
FSC.openDrawer = function(html,refresh){ var d=document.getElementById("drawer"); d.innerHTML=html; d.classList.add("on"); d.setAttribute("aria-hidden","false"); document.getElementById("scrim").classList.add("on"); FSC.drawerRefresh=refresh||null; var c=d.querySelector("[data-close]"); if(c) c.focus(); };
FSC.closeDrawer = function(){ var d=document.getElementById("drawer"); d.classList.remove("on"); d.setAttribute("aria-hidden","true"); document.getElementById("scrim").classList.remove("on"); FSC.drawerRefresh=null; };
FSC.modal = function(html,cls){ document.getElementById("modalHost").innerHTML='<div class="modal" role="dialog" aria-modal="true"><div class="dialog '+(cls||"")+'">'+html+'</div></div>'; var f=document.querySelector("#modalHost [autofocus]")||document.querySelector("#modalHost input:not([type=hidden]),#modalHost textarea,#modalHost select"); if(f) setTimeout(function(){ f.focus(); },30); };
FSC.closeModal = function(){ document.getElementById("modalHost").innerHTML=""; };
FSC.modalOpen = function(){ return !!document.getElementById("modalHost").innerHTML; };
/* Bestätigung im Dialog (confirm() wird nicht verwendet) */
FSC.confirm = function(text,okLabel,fn,danger){
  FSC.modal('<h2 style="font-size:19px">'+FSC.esc(text)+'</h2><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button type="button" class="btn '+(danger?"danger":"primary")+'" id="cfOk">'+FSC.esc(okLabel||"OK")+'</button></span></div>',"narrow");
  document.getElementById("cfOk").onclick=function(){ FSC.closeModal(); fn(); };
};

/* ---------- Darstellung: Automatisch / Hell / Dunkel ---------- */
FSC.theme = function(t){ if(t!==undefined){ FSC.ls("fsc_theme",t); } t=FSC.ls("fsc_theme")||"auto"; if(t==="auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme",t); var s=document.getElementById("themeSel"); if(s) s.value=t; return t; };
FSC.action("theme",function(v){ FSC.theme(v); FSC.toast(v==="light"?"Heller Modus":v==="dark"?"Dunkler Modus":"Darstellung wie System"); if(document.getElementById("moreSheet")) FSC.actions.moresheet(); });

/* ---------- Mehr-Menü (Handy) ---------- */
FSC.action("moresheet",function(){
  var t=FSC.theme();
  FSC.modal('<div class="row-between"><h2 style="font-size:19px">Mehr</h2>'+FSC.btnClose()+'</div><div class="sheet" id="moreSheet">'+FSC.views.filter(function(v){return !v.hidden;}).map(function(v){ var c=navCount(v); return '<button class="nav-btn" data-go="'+v.id+'"'+(v.id===FSC.current?' aria-current="page"':'')+'>'+FSC.svg(v.icon)+'<span>'+v.label+'</span>'+(c?'<span class="count">'+c+'</span>':'')+'</button>'; }).join("")+
    '<div class="sec-t" style="margin-top:10px">Darstellung</div><div class="seg">'+[["auto","Automatisch"],["light","Hell"],["dark","Dunkel"]].map(function(o){ return '<button type="button" data-act="theme:'+o[0]+'" aria-pressed="'+(t===o[0])+'">'+o[1]+'</button>'; }).join("")+'</div>'+
    '<div class="sheet-links"><button class="btn" data-act="search">Suchen</button><button class="btn" data-act="priv">Beträge ein/aus</button><button class="btn" data-act="settings">Einstellungen</button><button class="btn" data-act="reload">Aktualisieren</button><a class="btn" href="/admin/logout">Abmelden</a></div></div>',"sheetdlg");
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
  if(t.closest("[data-close]")||t.id==="scrim"){ FSC.closeDrawer(); return; }
  if(t.closest("[data-closemodal]")||t.classList.contains("modal")){ FSC.closeModal(); return; }
  FSC.listeners.forEach(function(l){ if(l.type!=="click") return; var el=t.closest(l.sel); if(el) l.fn(el,e); });
});
["change","input","keydown","dragstart","dragover","drop","contextmenu"].forEach(function(type){
  document.addEventListener(type,function(e){ var t=e.target; if(!t.closest) return; FSC.listeners.forEach(function(l){ if(l.type!==type) return; var el=t.closest(l.sel); if(el) l.fn(el,e); }); });
});
document.addEventListener("submit",function(e){ var f=e.target, k=f.getAttribute("data-form"); if(!k||!FSC.forms[k]) return; e.preventDefault(); FSC.forms[k](f,e); });
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){ if(FSC.modalOpen()) FSC.closeModal(); else FSC.closeDrawer(); }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"&&FSC.actions.search){ e.preventDefault(); FSC.actions.search(); }
});

/* ---------- Start ---------- */
FSC.start = function(){
  try{ var h=location.hash.slice(1); if(h&&FSC.views.some(function(v){return v.id===h;})) FSC.current=h; }catch(e){}
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
