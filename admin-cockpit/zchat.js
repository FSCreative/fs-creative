/* Website-Chat (Overlay auf www.fs-creative.at, Server chat.js): Unterhaltungen links, Verlauf rechts (Handy: Liste → Verlauf), oben Online/Offline.
   Online nur, solange das Cockpit offen ist (Herzschlag alle 45 s, 3 Min. ohne = offline → KI antwortet). Keine Push-Nachrichten für den Chat.
   KI je Unterhaltung: Auto (nur wenn du offline bist) · An (immer) · Aus. Schreibst du selbst, hört die KI auf.
   Daten: /admin/api/chat/state (?v= → {same}), …/conv?id=&read=1, …/send, …/status, …/op (ai, close, reopen, delete, lead).
   Umschalter oben „Website | WhatsApp“ (gemerkt in fsc_chat_mode): WhatsApp (nur lesen) zeichnet admin-cockpit/zwa.js über F.waChat. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
F.icons.chat='<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.2A8 8 0 1 1 20 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/>';
F.icons.globe=F.icons.globe||'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/>';
F.icons.whatsapp=F.icons.whatsapp||'<path d="M20 11.6a8.1 8.1 0 0 1-12 7.1L4 20l1.4-3.9A8.1 8.1 0 1 1 20 11.6z"/><path d="M9.2 8.6c.2-.4.5-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c.6 1.1 1.4 1.9 2.5 2.5l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.3.1.4.3.4.5v.5c0 .2 0 .5-.4.7-.5.3-1.3.5-2.3.1-2-.8-3.6-2.4-4.4-4.4-.4-1-.2-1.8.1-2.3z"/>';
F.icons.chevL=F.icons.chevL||'<path d="m15 6-6 6 6 6"/>';
var GL=':root[data-theme="glas"] ';
var ST=null, VER="", SEL=null, TH=null, DRAFT={}, busy=false, beatT=null, ticks=0, compFor=null, sending=false;
var MODE=F.ls("fsc_chat_mode")==="wa"?"wa":"web";
F.chatMode=function(){ return MODE; };
F.css('.ch-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.ch-top h1{font-size:26px}.ch-top p{margin:2px 0 0;color:var(--ink-3);font-size:13.5px}'+
  '.ch-st{display:inline-flex;align-items:center;gap:12px;padding:10px 18px 10px 12px;border-radius:99px;border:2px solid var(--line);background:var(--panel);font-weight:700;font-size:16px;color:var(--ink);cursor:pointer;min-height:52px}'+
  '.ch-st .sw{position:relative;width:52px;height:30px;border-radius:99px;background:var(--sunk);border:1px solid var(--line);transition:background .2s}.ch-st .sw::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--ink-3);transition:transform .2s,background .2s}'+
  '.ch-st.on{border-color:var(--ok);background:var(--ok-soft);color:var(--ok)}.ch-st.on .sw{background:var(--ok)}.ch-st.on .sw::after{transform:translateX(22px);background:#fff}.ch-st small{display:block;font-weight:500;font-size:11.5px;color:var(--ink-3)}'+
  '.ch-app{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);height:calc(100vh - 190px);height:calc(100dvh - 190px);min-height:440px;overflow:hidden;padding:0}'+
  '.ch-list{border-right:1px solid var(--line);overflow-y:auto;min-width:0}.ch-empty{padding:28px 18px;color:var(--ink-3);text-align:center;font-size:14px}'+
  '.ch-c{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;padding:11px 14px;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;color:inherit;cursor:pointer}.ch-c:hover{background:var(--hover,var(--sunk))}.ch-c[aria-current=true]{background:var(--sel,var(--sunk))}'+
  '.ch-av{width:40px;height:40px;border-radius:50%;background:var(--sunk);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:var(--ink-2)}.ch-c .t{min-width:0}.ch-c .t b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14.5px}'+
  '.ch-c .t span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;color:var(--ink-2)}.ch-c .t em{display:block;font-style:normal;font-size:11.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ch-c .r{display:grid;justify-items:end;gap:4px;font-size:11.5px;color:var(--ink-3)}'+
  '.ch-badge{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--ok);color:var(--on-glow);font-weight:700;font-size:11.5px;line-height:20px;text-align:center}.ch-c.closed{opacity:.6}'+
  '.ch-th{display:flex;flex-direction:column;min-width:0;min-height:0}.ch-hd{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}.ch-hd .t{flex:1 1 180px;min-width:0}.ch-hd .t b{display:block;font-size:15.5px}.ch-hd .t span{display:block;font-size:12.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.ch-hd .acts{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.ch-hd .seg{display:inline-flex}.ch-hd .seg button{padding:5px 10px;font-size:12.5px}.ch-back{display:none}'+
  '.ch-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:6px;background:var(--sunk)}.ch-m{max-width:76%;padding:8px 12px;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:14.5px;line-height:1.45;background:var(--panel);border:1px solid var(--line)}'+
  '.ch-m small{display:block;font-size:11px;color:var(--ink-3);margin-top:2px}.ch-m.v{align-self:flex-start;border-bottom-left-radius:5px;font-family:var(--f-body);font-size:14.5px;font-weight:400;letter-spacing:normal;line-height:1.45;color:var(--ink)}.ch-m.me{align-self:flex-end;background:var(--ok-soft);border-color:transparent;border-bottom-right-radius:5px}'+
  '.ch-m.ki{align-self:flex-end;background:var(--info-soft);border-color:transparent;border-bottom-right-radius:5px}.ch-m .ki-t{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.04em;padding:0 6px;border-radius:6px;background:var(--info);color:var(--on-glow);margin-bottom:3px}'+
  '.ch-m.sys{align-self:center;background:none;border:0;color:var(--ink-3);font-size:12.5px;text-align:center}.ch-ty{align-self:flex-end;font-size:12.5px;color:var(--ink-3)}.ch-info{font-size:12.5px;color:var(--ink-2);padding:8px 14px;border-bottom:1px solid var(--line);display:flex;gap:12px;flex-wrap:wrap}'+
  '.ch-comp{display:flex;gap:8px;align-items:flex-end;padding:10px 12px;border-top:1px solid var(--line)}.ch-comp textarea{flex:1;resize:none;min-height:42px;max-height:160px;border-radius:14px}.ch-none{flex:1;display:flex;align-items:center;justify-content:center;color:var(--ink-3);padding:30px;text-align:center}'+
  '.ch-tr{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.ch-mode button{padding:8px 16px;font-size:14px;display:inline-flex;align-items:center;gap:6px}.ch-mode button svg{width:16px;height:16px;flex:none}.ch-back svg{width:18px;height:18px}.ch-mn:empty{display:none}.ch-mn{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--ok);color:var(--on-glow);font-size:11px;font-weight:700;line-height:18px;text-align:center}'+
  '@media (prefers-reduced-motion:reduce){.ch-st .sw,.ch-st .sw::after{transition:none}}'+
  GL+'.ch-msgs{background:color-mix(in srgb,var(--ground) 18%,transparent)}'+GL+'.ch-m{background:var(--panel-2)}'+GL+'.ch-m.me{background:var(--ok-soft)}'+GL+'.ch-m.ki{background:var(--info-soft)}'+GL+'.ch-m.sys{background:none}'+
  '@media(max-width:900px){.ch-app{grid-template-columns:1fr;height:calc(100dvh - 230px)}.ch-app .ch-th{display:none}.ch-app.sel .ch-list{display:none}.ch-app.sel .ch-th{display:flex}.ch-back{display:inline-flex}.ch-m{max-width:88%}.ch-st{font-size:15px}}');

function api(path,body){ return F.api(path,body?{body:body}:undefined); }
function load(){
  if(busy) return; busy=true;
  api("/admin/api/chat/state?v="+encodeURIComponent(VER)).then(function(j){ busy=false;
    if(!j||j.ok===false){ if(!ST) ST={ok:false,error:(j&&j.error)||"Fehler",convs:[]}; paint(); return; }
    if(j.same) return;
    var prevOn=ST&&ST.online; ST=j; VER=j.ver; F.renderNav(); beat(j.online); paint();
    if(SEL&&F.current==="chat"&&MODE==="web") loadThread();
    if(prevOn===true&&j.online===false&&F.current==="chat") F.toast("Chat-Status: offline – die KI antwortet",true);
  }).catch(function(){ busy=false; });
}
function loadThread(){
  var id=SEL; if(!id) return;
  api("/admin/api/chat/conv?id="+encodeURIComponent(id)+"&read=1").then(function(j){ if(SEL!==id) return;
    if(!j||!j.ok){ if(j&&j.error==="not_found"){ SEL=null; TH=null; paint(); } return; }
    var same=TH&&TH.id===id&&JSON.stringify(TH.msgs)===JSON.stringify(j.msgs)&&JSON.stringify(TH.conv)===JSON.stringify(j.conv);
    TH={id:id,conv:j.conv,msgs:j.msgs,pages:j.pages||[]}; if(!same) paintThread();
  });
}
/* Herzschlag: solange du online bist und das Cockpit offen ist */
function beat(on){ clearInterval(beatT); beatT=null; if(on) beatT=setInterval(function(){ api("/admin/api/chat/status",{online:true}).then(function(j){ if(j&&j.ok&&ST&&ST.online!==j.online){ ST.online=j.online; paint(); } }); },45000); }
setInterval(function(){ ticks++; if(F.current==="chat"&&!document.hidden) load(); else if(ticks%5===0) load(); },4000);
document.addEventListener("visibilitychange",function(){ if(!document.hidden&&ST&&ST.online) api("/admin/api/chat/status",{online:true}).then(function(){ VER=""; load(); }); });
setTimeout(load,1500);

var fmtT=function(iso){ var t=new Date(iso); if(isNaN(t)) return ""; var td=new Date(); return t.toDateString()===td.toDateString()?t.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}):t.toLocaleDateString("de-AT",{day:"2-digit",month:"2-digit"})+" "+t.toLocaleTimeString("de-AT",{hour:"2-digit",minute:"2-digit"}); };
function nameOf(c){ return c.name||("Besucher #"+c.no); }
function initials(c){ if(!c.name) return "#"; var p=c.name.trim().split(/\s+/); return (p[0][0]+(p.length>1?p[p.length-1][0]:"")).toUpperCase(); }
function aiTxt(c){ return c.ai==="on"?"KI an":c.ai==="off"?"KI aus":(ST&&ST.online?"KI wartet (du bist online)":"KI antwortet (du bist offline)"); }

function statusBtn(){ var on=ST&&ST.online; return '<button type="button" class="ch-st'+(on?" on":"")+'" data-act="chstatus" role="switch" aria-checked="'+(!!on)+'" aria-label="Chat-Status: '+(on?"Online":"Offline")+' – umschalten"><span class="sw" aria-hidden="true"></span><span>'+(on?"Online":"Offline")+'<small>'+(on?"Besucher sehen „Simon ist online“":"Die KI nimmt Anfragen an")+'</small></span></button>'; }
function listHtml(){
  var cs=(ST&&ST.convs)||[]; if(!cs.length) return '<div class="ch-empty">Noch keine Unterhaltungen.<br>Sobald jemand auf der Website schreibt, erscheint er hier.</div>';
  return cs.map(function(c){ var l=c.last||{};
    return '<button type="button" class="ch-c'+(c.closed?" closed":"")+'" data-act="chopen:'+esc(c.id)+'" title="'+esc(nameOf(c)+(c.page?" · "+c.page:""))+'"'+(c.id===SEL?' aria-current="true"':'')+'><span class="ch-av" aria-hidden="true">'+esc(initials(c))+'</span><span class="t"><b>'+esc(nameOf(c))+'</b><span>'+(l.from==="me"?"Du: ":l.from==="ki"?"KI: ":"")+esc(l.text||"")+'</span><em>'+esc(c.page||"")+(c.leadId?" · Lead":"")+(c.closed?" · beendet":"")+'</em></span>'+
      '<span class="r"><span>'+esc(fmtT(c.updated))+'</span>'+(c.unread?'<span class="ch-badge" aria-label="'+c.unread+' ungelesen">'+c.unread+'</span>':c.typing?'<span>schreibt …</span>':'')+'</span></button>'; }).join("");
}
function threadHead(c){
  return '<div class="ch-hd"><button type="button" class="btn icon ch-back" data-act="chback" aria-label="Zurück zur Liste">'+F.svg("chevL")+'</button><div class="t"><b>'+esc(nameOf(c))+'</b><span>'+esc([c.email,c.phone].filter(Boolean).join(" · ")||"keine Kontaktdaten")+(c.page?' · auf '+esc(c.page):'')+'</span></div>'+
    '<div class="acts"><span class="muted small">KI übernimmt</span><div class="seg" role="group" aria-label="KI übernimmt">'+[["auto","Auto"],["on","An"],["off","Aus"]].map(function(o){ return '<button type="button" data-act="chai:'+o[0]+'" aria-pressed="'+(c.ai===o[0])+'">'+o[1]+'</button>'; }).join("")+'</div>'+
    (c.leadId?'<button type="button" class="btn" data-go="kunden">Lead ✓</button>':'<button type="button" class="btn" data-act="chlead">Als Lead</button>')+
    '<button type="button" class="btn" data-act="'+(c.closed?"chreopen":"chclose")+'">'+(c.closed?"Wieder öffnen":"Beenden")+'</button><button type="button" class="btn danger" data-act="chdel" aria-label="Unterhaltung löschen">Löschen</button></div></div>'+
    '<div class="ch-info"><span>'+esc(aiTxt(c))+'</span>'+(c.aiCount?'<span>KI-Antworten: '+c.aiCount+'/'+((ST&&ST.aiConvMax)||15)+'</span>':'')+(c.request?'<span>Anliegen: '+esc(c.request)+'</span>':'')+(TH&&TH.pages&&TH.pages.length>1?'<span>Seiten: '+esc(TH.pages.join(", "))+'</span>':'')+'</div>';
}
function msgsHtml(){
  var out=(TH.msgs||[]).map(function(m){ var cls=["v","me","ki","sys"].indexOf(m.from)>-1?m.from:"sys";
    return '<div class="ch-m '+cls+'">'+(cls==="ki"?'<span class="ki-t">KI</span><br>':'')+esc(m.text)+(cls!=="sys"?'<small>'+esc(fmtT(m.at))+'</small>':'')+'</div>'; }).join("");
  if(TH.conv&&TH.conv.typing) out+='<div class="ch-ty">KI schreibt …</div>';
  return out||'<div class="ch-m sys">Noch keine Nachrichten.</div>';
}
function paintThread(){
  var th=document.getElementById("chThread"); if(!th) return;
  if(!SEL){ compFor=null; th.innerHTML='<div class="ch-none">Wähle links eine Unterhaltung.</div>'; return; }
  var conv=(TH&&TH.id===SEL&&TH.conv)||((ST&&ST.convs)||[]).find(function(x){ return x.id===SEL; }); if(!conv){ th.innerHTML='<div class="ch-none">Lade …</div>'; compFor=null; return; }
  var hd=document.getElementById("chHd"), ms=document.getElementById("chMsgs");
  if(compFor!==SEL||!hd||!ms){
    compFor=SEL;
    th.innerHTML='<div id="chHd"></div><div class="ch-msgs" id="chMsgs" role="log" aria-live="polite" aria-label="Nachrichten"></div><form class="ch-comp" data-form="chsend"><textarea class="f" id="chText" rows="1" maxlength="2000" placeholder="Antwort schreiben … (Enter = senden, Umschalt+Enter = neue Zeile)" aria-label="Antwort"></textarea><button type="submit" class="btn primary">Senden</button></form>';
    hd=document.getElementById("chHd"); ms=document.getElementById("chMsgs");
    var ta=document.getElementById("chText"); ta.value=DRAFT[SEL]||""; grow(ta);
    if(window.matchMedia&&!window.matchMedia("(max-width:900px)").matches) setTimeout(function(){ ta.focus({preventScroll:true}); },30);
  }
  hd.innerHTML=threadHead(conv);
  if(TH&&TH.id===SEL){ var end=ms.scrollHeight-ms.scrollTop-ms.clientHeight<80||!ms.childNodes.length; ms.innerHTML=msgsHtml(); if(end) ms.scrollTop=ms.scrollHeight; }
  else ms.innerHTML='<div class="ch-m sys">Lade …</div>';
}
function togN(){ var tn=document.getElementById("chTogN"); if(tn) tn.textContent=ST&&ST.unread?String(ST.unread):""; }   /* Zahl am Umschalter – auch in der WhatsApp-Ansicht */
function paint(){
  togN();
  var root=document.getElementById("chRoot"); if(!root) return;
  var stb=document.getElementById("chStatus"); if(stb) stb.innerHTML=statusBtn();
  if(ST&&ST.ok===false){ document.getElementById("chList").innerHTML='<div class="ch-empty">'+esc(ST.error)+'</div>'; return; }
  var app=document.getElementById("chApp"); app.classList.toggle("sel",!!SEL);
  var ls=document.getElementById("chList"), y=ls.scrollTop; ls.innerHTML=ST?listHtml():'<div class="ch-empty">Lade …</div>'; ls.scrollTop=y;
  var note=document.getElementById("chNote"); if(note) note.textContent=ST?(ST.ki?"KI aktiv · heute "+ST.aiToday+"/"+ST.aiDayMax+" KI-Antworten":"KI nicht eingerichtet (ANTHROPIC_API_KEY) – offline gibt es eine feste Antwort")+(ST.db?"":" · Dateispeicher"):"";
  paintThread();
}
function grow(ta){ ta.style.height="auto"; ta.style.height=Math.min(160,ta.scrollHeight+2)+"px"; }
/* Umschalter Website | WhatsApp – Zahlen (ungelesen) trägt jede Seite selbst ein (chTogN hier, waTogN in zwa.js) */
function modeSeg(){ return '<div class="seg ch-mode" role="group" aria-label="Chat-Quelle"><button type="button" data-act="chmode:web" aria-pressed="'+(MODE==="web")+'">'+F.svg("globe")+'Website<span class="ch-mn" id="chTogN"></span></button><button type="button" data-act="chmode:wa" aria-pressed="'+(MODE==="wa")+'">'+F.svg("whatsapp")+'WhatsApp<span class="ch-mn" id="waTogN"></span></button></div>'; }
function render(){
  if(MODE==="wa"&&F.waChat) return F.waChat.render(modeSeg());
  if(!ST) load();
  return '<div id="chRoot" class="stackf"><div class="ch-top"><div><h1>Chat</h1><p>Website-Chat auf allen Seiten von fs-creative.at · <span id="chNote"></span></p></div><div class="ch-tr">'+modeSeg()+'<div id="chStatus"></div></div></div>'+
    '<section class="panel ch-app" id="chApp"><aside class="ch-list" id="chList" aria-label="Unterhaltungen"></aside><section class="ch-th" id="chThread" aria-label="Verlauf"></section></section></div>';
}
function after(){ togN(); if(F.waChat) F.waChat.badge(); if(MODE==="wa"&&F.waChat) return F.waChat.after(); compFor=null; paint(); if(SEL) loadThread(); }
F.action("chmode",function(m){ m=m==="wa"?"wa":"web"; if(m===MODE) return; MODE=m; F.ls("fsc_chat_mode",MODE); F._forceRender=true; F.render(); });
function setConv(c){ if(!c||!ST) return; ST.convs=(ST.convs||[]).map(function(x){ return x.id===c.id?c:x; }); if(TH&&TH.id===c.id) TH.conv=c; VER=""; paint(); }
function op(body){ body.id=SEL; return api("/admin/api/chat/op",body).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; } if(j.conv) setConv(j.conv); VER=""; load(); loadThread(); return j; }); }

F.action("chstatus",function(){ var on=!(ST&&ST.online); api("/admin/api/chat/status",{online:on}).then(function(j){ if(!j||!j.ok){ F.toast("Status konnte nicht gespeichert werden",true); return; } if(ST) ST.online=j.online; beat(j.online); VER=""; paint(); load(); F.toast(j.online?"Du bist online – Besucher sehen „Simon ist online“":"Offline – die KI nimmt Anfragen an"); }); });
F.action("chopen",function(id){ if(SEL===id&&TH) return; SEL=id; TH=null; compFor=null; paint(); loadThread(); });
F.action("chback",function(){ SEL=null; TH=null; paint(); });
F.action("chai",function(m){ op({op:"ai",mode:m}).then(function(j){ if(j) F.toast(m==="on"?"KI übernimmt diese Unterhaltung":m==="off"?"KI aus für diese Unterhaltung":"KI antwortet nur, wenn du offline bist"); }); });
F.action("chclose",function(){ op({op:"close"}).then(function(j){ if(j) F.toast("Unterhaltung beendet"); }); });
F.action("chreopen",function(){ op({op:"reopen"}); });
F.action("chdel",function(){ var id=SEL; F.confirm("Diese Unterhaltung endgültig löschen?","Löschen",function(){ api("/admin/api/chat/op",{op:"delete",id:id}).then(function(j){ if(!j||!j.ok){ F.toast("Löschen fehlgeschlagen",true); return; } SEL=null; TH=null; if(ST) ST.convs=ST.convs.filter(function(x){ return x.id!==id; }); VER=""; paint(); load(); F.toast("Unterhaltung gelöscht"); }); },true); });
F.action("chlead",function(){
  var c=TH&&TH.conv; if(!c) return; var tp=(ST&&ST.topics)||["Website"];
  var msg=c.request||(TH.msgs||[]).filter(function(m){ return m.from==="v"; }).map(function(m){ return m.text; }).join("\n").slice(0,1500);
  F.modal('<form data-form="chlead" class="stackf"><div class="row-between"><h2 style="font-size:19px">Als Lead übernehmen</h2>'+F.btnClose()+'</div><div class="grid2"><label class="fl">Name<input class="f" name="name" value="'+esc(c.name||"")+'" required autofocus></label><label class="fl">Firma / Verein<input class="f" name="company"></label><label class="fl">E-Mail<input class="f" name="email" type="email" value="'+esc(c.email||"")+'"></label><label class="fl">Telefon<input class="f" name="phone" type="tel" value="'+esc(c.phone||"")+'"></label></div>'+
    '<label class="fl">Thema<select class="f" name="topic">'+tp.map(function(t){ return '<option'+(t===(c.topic||"Website")?" selected":"")+'>'+esc(t)+'</option>'; }).join("")+'</select></label><label class="fl">Anliegen<textarea class="f" name="message" rows="4">'+esc(msg)+'</textarea></label>'+
    '<p class="muted small" style="margin:0">Landet unter „Kunden & Leads“ (Quelle „Website-Chat“).</p><div class="foot"><span></span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Lead anlegen</button></span></div><div class="err" id="chLeadErr"></div></form>',"narrow");
});
F.form("chlead",function(f){ api("/admin/api/chat/op",{op:"lead",id:SEL,name:f.name.value,company:f.company.value,email:f.email.value,phone:f.phone.value,topic:f.topic.value,message:f.message.value}).then(function(j){
  if(!j||!j.ok){ var e=document.getElementById("chLeadErr"); if(e) e.textContent=(j&&j.error)||"Fehler"; return; }
  F.closeModal(); setConv(j.conv); F.toast("Lead angelegt"); if(F.load) F.load(true); }); });
F.form("chsend",function(f){
  var ta=document.getElementById("chText"), text=ta.value.trim(), id=SEL; if(!text||sending||!id) return; sending=true;
  api("/admin/api/chat/send",{id:id,text:text}).then(function(j){ sending=false;
    if(!j||!j.ok){ F.toast(j&&j.error==="too_long"?"Höchstens 2000 Zeichen":"Senden fehlgeschlagen",true); return; }
    DRAFT[id]=""; if(SEL===id){ ta.value=""; grow(ta); if(TH&&TH.id===id){ TH.msgs=TH.msgs.concat([j.msg]); TH.conv=j.conv; } paintThread(); } setConv(j.conv); load();
  }).catch(function(){ sending=false; F.toast("Keine Verbindung",true); });
});
F.listen("input","#chText",function(el){ if(SEL) DRAFT[SEL]=el.value; grow(el); });
F.listen("keydown","#chText",function(el,e){ if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); var f=el.closest("form"); if(f&&F.forms.chsend) F.forms.chsend(f,e); } });

F.feed(function(){ var cs=((ST&&ST.convs)||[]).filter(function(c){ return c.unread&&!c.closed; }); if(!cs.length) return []; var n=cs.reduce(function(a,c){ return a+c.unread; },0);
  return [{id:"chat-unread-"+n+"-"+cs[0].id,rank:1,sev:"warn",icon:"chat",tag:["warn","Chat"],t:n+(n===1?" ungelesene Chat-Nachricht":" ungelesene Chat-Nachrichten"),d:cs.slice(0,3).map(nameOf).join(", ")+" – auf der Website.",acts:[["Antworten","go:chat","primary"]]}]; });
F.view({id:"chat",label:"Chat",short:"Chat",icon:"chat",order:15,count:function(){ return ST&&ST.ok!==false?(ST.unread||0):0; },render:render,after:after});
})();
