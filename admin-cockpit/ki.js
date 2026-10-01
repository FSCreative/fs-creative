/* KI (Claude) – Kern: Status, Ansicht „KI“ (vorbereitete Belege, Beleg-Prüfung, UVA-Check, Anfragen, Kosten & Einstellungen),
   Abschnitt in den Einstellungen, Hinweis in „Heute“. Weitere Teile: ki-belege.js, ki-chat.js, ki-mail.js (gemeinsamer Zustand in FSC.KI).
   Ohne ANTHROPIC_API_KEY zeigt jede KI-Funktion nur den Hinweis zum Einrichten. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
F.icons.spark='<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>';
K.ui=K.ui||{belege:null,belegeP:"",uva:null,uvaP:"",busy:{},sendersDraft:null,open:{}};
K.st=K.st||null;
K.NOT_SET="KI nicht eingerichtet – ANTHROPIC_API_KEY in Railway setzen";

/* ---------- Server ---------- */
K.api=function(path,body){
  return F.api("/admin/api/ki/"+path,body?{body:body}:{}).then(function(j){
    if(!j||j.ok===false){ var e=new Error((j&&j.error)||"KI-Anfrage fehlgeschlagen."); e.code=(j&&j.code)||"error"; if(e.code==="not_configured"&&K.st) K.st.configured=false; throw e; }
    return j;
  });
};
var stAt=0, stP=null;
K.load=function(force){
  if(stP) return stP; if(!force&&K.st&&Date.now()-stAt<60000) return Promise.resolve(K.st);
  stP=F.api("/admin/api/ki/status").then(function(j){ stP=null; if(j&&j.ok){ K.st=j; stAt=Date.now(); } return K.st; }).catch(function(){ stP=null; return K.st; });
  return stP;
};
K.ready=function(){ return !!(K.st&&K.st.configured); };
K.fail=function(e){ var msg=(e&&e.message)||String(e); F.toast(msg,true); return msg; };
K.pct=function(c){ return Math.round((+c||0)*100)+" %"; };
K.conf=function(c){ c=+c||0; var t=c>=0.85?"ok":c>=0.6?"warn":"bad"; return '<span class="tag '+t+'" title="Sicherheit der KI">'+K.pct(c)+'</span>'; };
K.notSetHtml=function(){ return '<div class="notice"><span>'+esc(K.NOT_SET)+'. Danach den Dienst neu starten – die übrigen Funktionen laufen ohne KI unverändert.</span></div>'; };
K.rerender=function(){ if(F.current==="ki") F.render(); };
F.onData(function(){ K.load(false).then(function(){ F.renderNav(); }); });

/* ---------- Texte ---------- */
var RULE_TXT={"8":"ig. Erwerb","9":"Vorsteuer abziehbar","10":"keine Vorsteuer","12":"RC Drittland (mit VSt)","13":"RC ohne Vorsteuer","14":"RC EU (mit VSt)"};
var CLASS_TXT={"060":"Vorsteuer KZ 060","rc":"Reverse Charge 057/066","rcnv":"RC ohne VSt 057","ige":"ig. Erwerb 070/072/065","ige3":"ig. Erwerb Dreieck 070/077","ige0":"steuerfreier ig. Erwerb 070/071","eust":"EUSt 061","fx":"ausl. USt – keine VSt","none":"keine Vorsteuer"};
K.RULE_TXT=RULE_TXT; K.CLASS_TXT=CLASS_TXT;
K.e1aTxt=function(code){ var E=(window.FSC_STEUER&&FSC_STEUER.E1A)||[]; for(var i=0;i<E.length;i++) if(E[i][0]===code) return code+" "+E[i][1]; return code||"–"; };
K.periods=function(){
  var t=F.D?F.D.today:F.ymd(), y=+t.slice(0,4), q=Math.floor((+t.slice(5,7)-1)/3)+1, out=[];
  for(var i=0;i<6;i++){ out.push([y+"-Q"+q,q+". Quartal "+y]); q--; if(!q){ q=4; y--; } }
  out.push([String(+t.slice(0,4)),"Jahr "+t.slice(0,4)]); out.push([String(+t.slice(0,4)-1),"Jahr "+(+t.slice(0,4)-1)]);
  return out;
};
function sel(id,cur,opts){ return '<select class="f" id="'+id+'" style="width:auto">'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(o[0]===cur?" selected":"")+'>'+esc(o[1])+'</option>'; }).join("")+'</select>'; }
K.sel=sel;

/* ---------- Ansicht „KI“ ---------- */
function costLine(){
  var s=K.st; if(!s) return "Lade KI-Status …";
  if(!s.configured) return esc(K.NOT_SET);
  return "Claude Opus 5.5 · Kosten "+esc(monthName(s.month))+": <b class=\"money\">"+F.eur(s.cost.eur)+"</b> (≈, umgerechnet mit 1 $ = "+String(s.usdEur).replace(".",",")+" €)"+(s.limitEur?" · Limit "+F.eur(s.limitEur)+(s.overLimit?' <span class="tag bad">erreicht</span>':''):"");
}
function monthName(mk){ var m=String(mk||"").match(/^(\d{4})-(\d{2})$/); if(!m) return mk||""; return new Date(+m[1],+m[2]-1,15).toLocaleDateString("de-AT",{month:"long",year:"numeric"}); }
function panel(id,title,sub,right,inner){ return '<section class="panel kip" id="'+id+'"><div class="panel-h"><div><b>'+title+'</b>'+(sub?'<div class="muted">'+sub+'</div>':'')+'</div><div class="row wrap">'+(right||"")+'</div></div><div class="kib">'+inner+'</div></section>'; }
K.panel=panel;

function queueHtml(){
  var s=K.st, q=K.queue||[];
  var right='<button type="button" class="btn" data-act="kiscan"'+(K.ui.busy.scan?" disabled":"")+'>'+(K.ui.busy.scan?"Prüfe Postfach …":"Postfach jetzt prüfen")+'</button>';
  var sub="Rechnungsmails bekannter Absender werden alle 15 Minuten ausgelesen und hier vorbereitet. An sevDesk geht nur, was du freigibst.";
  var inner;
  if(!s||!s.configured) inner=K.notSetHtml();
  else if(!q.length) inner='<div class="empty">Keine vorbereiteten Belege.'+(s.scan&&s.scan.at?' Letzte Prüfung '+esc(F.ago(new Date(s.scan.at).toISOString()))+(s.scan.err?' – '+esc(s.scan.err):'')+'.':'')+'</div>';
  else inner='<div class="kilist">'+q.map(function(it){ var x=it.x||{};
    return '<div class="kirow"><div class="kimain"><b>'+esc(x.supplier||it.mail.fromName||it.mail.from)+'</b> <span class="muted">'+esc(F.de(x.invoiceDate)||"")+(x.invoiceNumber?" · Nr. "+esc(x.invoiceNumber):"")+'</span><div class="muted">'+esc(it.att.filename)+' · '+esc(it.mail.subject||"")+'</div>'+
      '<div class="kitags"><span class="tag grey">'+esc(RULE_TXT[x.taxRule]||x.taxRule)+'</span><span class="tag grey">E1a '+esc(x.e1a)+'</span>'+(x.accountingTypeName?'<span class="tag grey">'+esc(x.accountingTypeName)+'</span>':'')+K.conf(x.confidence)+(x.currency&&x.currency!=="EUR"?'<span class="tag warn">'+esc(x.currency)+'</span>':'')+'</div>'+(x.notes?'<div class="muted">'+esc(x.notes)+'</div>':'')+'</div>'+
      '<div class="kiamt num money">'+F.eur(x.gross)+'</div><div class="row wrap"><button type="button" class="btn primary" data-act="kiqopen:'+esc(it.key)+'">Prüfen &amp; an sevDesk</button><button type="button" class="btn" data-act="kiqdrop:'+esc(it.key)+'">Verwerfen</button></div></div>'; }).join("")+'</div>';
  return panel("ki-queue","Vorbereitete Belege","",right,'<p class="muted kip-sub">'+sub+'</p>'+inner);
}
function leadsHtml(){
  var s=K.st, ls=((F.D&&F.D.leads)||[]).filter(function(l){ return (l.stage||"anfrage")==="anfrage"; }).slice(0,12);
  var inner;
  if(!ls.length) inner='<div class="empty">Keine offenen Anfragen.</div>';
  else inner='<div class="kilist">'+ls.map(function(l){ var r=s&&s.leads&&s.leads[l.id];
    return '<div class="kirow"><div class="kimain"><b>'+esc(l.company||l.name)+'</b> <span class="muted">'+esc(l.topic||"")+' · '+esc(F.de(l.created))+'</span>'+
      (r?'<div class="kitags"><span class="tag '+(r.priority==="hoch"?"bad":r.priority==="mittel"?"warn":"grey")+'">Priorität '+esc(r.priority)+'</span>'+(r.budgetRange?'<span class="tag grey">'+esc(r.budgetRange)+'</span>':'')+(r.projectType?'<span class="tag grey">'+esc(r.projectType)+'</span>':'')+'</div><div class="muted">Nächster Schritt: '+esc(r.nextStep)+'</div>':'<div class="muted">'+esc(String(l.message||"").slice(0,140))+'</div>')+'</div>'+
      '<div class="row wrap"><button type="button" class="btn" data-act="lead:'+esc(l.id)+'">Öffnen</button>'+(r?'':'<button type="button" class="btn" data-act="kilead:'+esc(l.id)+'"'+(K.ui.busy["lead"+l.id]?" disabled":"")+'>'+(K.ui.busy["lead"+l.id]?"Schätze ein …":"Einschätzen")+'</button>')+'</div></div>'; }).join("")+'</div>';
  return panel("ki-leads","Neue Anfragen","Priorität, Budget und nächster Schritt – neue Anfragen werden automatisch eingeschätzt.","",inner);
}
function settingsHtml(){
  var s=K.st; if(!s) return panel("ki-set","Kosten &amp; Einstellungen","","",'<div class="empty">Lade …</div>');
  var by=s.cost.byFeature||{}, lab={}; (s.features||[]).forEach(function(f){ lab[f.key]=f.label; });
  var rows=Object.keys(by).map(function(k){ var b=by[k]; return '<tr><td>'+esc(lab[k]||k)+'</td><td class="num">'+b.calls+'</td><td class="num">'+Math.round((b.input+b.cacheRead+b.cacheWrite)/1000)+'k / '+Math.round(b.output/1000)+'k</td><td class="num money">'+F.eur(b.eur)+'</td></tr>'; }).join("");
  var hist=(s.months||[]).map(function(m){ return '<span class="tag grey">'+esc(monthName(m.month))+': <span class="money">'+F.eur(m.eur)+'</span></span>'; }).join(" ");
  var toggles=(s.features||[]).map(function(f){ return '<label class="kitog"><input type="checkbox" data-kifeat="'+esc(f.key)+'"'+(f.on?" checked":"")+'> <span>'+esc(f.label)+(f.essential?' <span class="muted">(läuft auch über dem Limit)</span>':'')+'</span></label>'; }).join("");
  var senders=K.ui.sendersDraft!=null?K.ui.sendersDraft:(s.senders||"");
  return panel("ki-set","Kosten &amp; Einstellungen","Preise Claude Opus 5.5: 4 $ / 20 $ je 1 Mio. Tokens (Eingabe/Ausgabe), Cache-Lesen 0,20 $. Euro-Beträge sind umgerechnet (≈).","",
    '<div class="kigrid"><div><div class="sec-t">Status</div>'+(s.configured?'<div class="amsg ok">Verbunden · Modell '+esc(s.model)+'</div>':K.notSetHtml())+
      '<div class="sec-t" style="margin-top:12px">Diesen Monat</div>'+(rows?'<table class="kitab"><thead><tr><th>Funktion</th><th>Aufrufe</th><th>Tokens ein/aus</th><th>Kosten</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td colspan="3"><b>Summe</b></td><td class="num money"><b>'+F.eur(s.cost.eur)+'</b></td></tr></tfoot></table>':'<div class="muted">Noch keine KI-Aufrufe.</div>')+
      (hist?'<div class="kitags" style="margin-top:8px">'+hist+'</div>':'')+
      '<p class="muted">Monatslimit: '+(s.limitEur?F.eur(s.limitEur)+' – darüber laufen nur noch Beleg- und Steuerfunktionen.':'keines gesetzt (optional Variable <b>KI_MONTHLY_LIMIT_EUR</b> in Railway, z. B. 30).')+'</p></div>'+
    '<div><div class="sec-t">Funktionen</div><div class="kitogs">'+toggles+'</div>'+
      '<div class="sec-t" style="margin-top:12px">Bekannte Rechnungsabsender (Automatik)</div><textarea class="f" id="kiSenders" data-keepfocus="kiSenders" rows="6" placeholder="ein Begriff pro Zeile, z. B. railway">'+esc(senders)+'</textarea>'+
      '<p class="muted">Trifft auf Absender, Name oder Betreff zu (Groß-/Kleinschreibung egal).</p><button type="button" class="btn" data-act="kisavesenders">Absender speichern</button></div></div>');
}
function vKi(){
  var s=K.st;
  return F.head("KI",costLine(),'<button type="button" class="btn" data-act="newinvoice">Rechnung mit KI</button><button type="button" class="btn primary" data-act="kichat">'+F.svg("spark")+' Assistent öffnen <span style="opacity:.7;font-size:12px">⌘J</span></button>')+
    (s&&!s.configured?K.notSetHtml():'')+
    '<div class="kistack">'+(K.uploadPanelHtml?K.uploadPanelHtml():'')+queueHtml()+(K.belegeHtml?K.belegeHtml():'')+(K.uvaHtml?K.uvaHtml():'')+leadsHtml()+settingsHtml()+'</div>';
}
F.view({id:"ki",label:"KI",short:"KI",icon:"spark",order:80,count:function(){ return K.st&&K.st.configured?(K.st.queue||0):0; },render:vKi,after:function(){ if(!K.st||Date.now()-stAt>60000) K.load(true).then(K.rerender); if(K.queue==null&&!K.ui.busy.q){ K.ui.busy.q=1; K.loadQueue(); } }});

/* ---------- Vorbereitete Belege ---------- */
K.queue=null;
K.loadQueue=function(){ return F.api("/admin/api/ki/queue").then(function(j){ K.ui.busy.q=0; K.queue=(j&&j.queue)||[]; K.rerender(); }).catch(function(){ K.ui.busy.q=0; K.queue=[]; }); };
F.action("kiscan",function(){
  if(!K.ready()){ F.toast(K.NOT_SET,true); return; }
  K.ui.busy.scan=1; K.rerender();
  K.api("queue",{op:"scan"}).then(function(j){ K.ui.busy.scan=0; K.queue=j.queue||[]; F.toast(j.scan&&j.scan.found?j.scan.found+" neue Belege vorbereitet":"Keine neuen Rechnungsmails gefunden"+(j.scan&&j.scan.err?" ("+j.scan.err+")":"")); K.load(true).then(K.rerender); })
    .catch(function(e){ K.ui.busy.scan=0; K.fail(e); K.rerender(); });
});
F.action("kiqdrop",function(key){ K.api("queue",{op:"dismiss",key:key}).then(function(j){ K.queue=j.queue||[]; if(K.st) K.st.queue=K.queue.length; F.toast("Verworfen"); K.rerender(); F.renderNav(); }).catch(K.fail); });
F.action("kiqopen",function(key){
  var it=(K.queue||[]).filter(function(q){ return q.key===key; })[0]; if(!it) return;
  if(!F.M||!F.M.openVoucher){ F.toast("Postfach-Modul nicht geladen.",true); return; }
  var m={id:it.mail.id,account:it.mail.account,folder:it.mail.folder,uid:it.mail.uid,subject:it.mail.subject,from:it.mail.from,fromName:it.mail.fromName,date:it.mail.date};
  var a={index:it.att.index,filename:it.att.filename,size:it.att.size};
  K.openVoucherWith(m,a,it.x,function(j){ K.api("queue",{op:"done",key:key,voucherId:j&&j.id}).then(function(r){ K.queue=r.queue||[]; if(K.st) K.st.queue=K.queue.length; K.rerender(); F.renderNav(); }).catch(function(){}); });
});

/* ---------- Anfragen ---------- */
F.action("kilead",function(id){
  if(!K.ready()){ F.toast(K.NOT_SET,true); return; }
  K.ui.busy["lead"+id]=1; K.rerender();
  K.api("lead",{id:id}).then(function(j){ K.ui.busy["lead"+id]=0; if(K.st){ K.st.leads=K.st.leads||{}; K.st.leads[id]=j.lead; } K.rerender(); if(K.onLead) K.onLead(id,j.lead); })
    .catch(function(e){ K.ui.busy["lead"+id]=0; K.fail(e); K.rerender(); });
});

/* ---------- Einstellungen ---------- */
F.listen("change","[data-kifeat]",function(el){
  var f={}; f[el.getAttribute("data-kifeat")]=el.checked;
  K.api("settings",{features:f}).then(function(j){ K.st=j; stAt=Date.now(); F.toast(el.checked?"Eingeschaltet":"Ausgeschaltet"); K.rerender(); }).catch(K.fail);
});
F.listen("input","#kiSenders",function(el){ K.ui.sendersDraft=el.value; });
F.action("kisavesenders",function(){ var t=document.getElementById("kiSenders"); if(!t) return; K.api("settings",{senders:t.value}).then(function(j){ K.st=j; stAt=Date.now(); K.ui.sendersDraft=null; F.toast("Absender gespeichert"); K.rerender(); }).catch(K.fail); });

/* Abschnitt im Einstellungen-Dialog (settings.js ruft F.kiSettingsHtml auf) */
F.kiSettingsHtml=function(){
  var s=K.st; if(!s){ K.load(true); return '<p class="set-p">Lade …</p>'; }
  return (s.configured?'<div class="amsg ok">Verbunden · Claude Opus 5.5 · '+esc(monthName(s.month))+': <span class="money">'+F.eur(s.cost.eur)+'</span> (≈)'+(s.limitEur?' von '+F.eur(s.limitEur)+' Limit':'')+'</div>':'<div class="amsg wait">'+esc(K.NOT_SET)+'.</div>')+
    '<p class="set-p">'+(s.features||[]).filter(function(f){ return f.on; }).length+' von '+(s.features||[]).length+' KI-Funktionen eingeschaltet.</p><button type="button" class="btn" data-go="ki">KI-Einstellungen &amp; Kosten</button>';
};

/* ---------- Heute: Hinweise ---------- */
F.feed(function(){
  var s=K.st; if(!s||!s.configured) return [];
  var out=[];
  if(s.queue) out.push({id:"ki-queue-"+s.queue,rank:4,sev:"info",icon:"spark",tag:["info","KI"],t:s.queue+(s.queue===1?" Beleg":" Belege")+" aus Mails vorbereitet",d:"Von der KI ausgelesen – kurz prüfen und als Entwurf an sevDesk senden.",acts:[["Ansehen","go:ki","primary"]]});
  if(s.overLimit) out.push({id:"ki-limit-"+s.month,rank:6,sev:"warn",icon:"spark",tag:["warn","KI"],t:"KI-Monatslimit erreicht",d:"Assistent und Mail-Funktionen sind bis Monatsende pausiert; Belege und Steuer laufen weiter.",acts:[["Kosten","go:ki"]]});
  return out;
});
F.searcher(function(q){ return /^(ki|kü|ass|claude|chat|frag)/.test(q)?[{group:"KI",label:"KI-Assistent fragen",sub:"⌘J",act:"kichat"},{group:"KI",label:"KI-Übersicht & Kosten",sub:"Belege, UVA-Check, Anfragen",act:"go:ki"}]:[]; });

F.css([
".kistack{display:grid;gap:16px}",
".kib{padding:12px 18px 16px;display:grid;gap:10px}",
".kip-sub{margin:0}",
".kilist{display:grid;gap:0}",
".kirow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px 14px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}",
".kirow:first-child{border-top:0}",
".kimain{min-width:0;display:grid;gap:3px;overflow-wrap:anywhere}",
".kitags{display:flex;flex-wrap:wrap;gap:5px}",
".kiamt{font-weight:700;white-space:nowrap}",
".kigrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}",
".kitab{width:100%;border-collapse:collapse;font-size:13px}.kitab th,.kitab td{padding:5px 6px;border-bottom:1px solid var(--line);text-align:left}.kitab .num{text-align:right}",
".kitogs{display:grid;gap:6px}.kitog{display:flex;gap:8px;align-items:flex-start;font-size:13.5px}",
"@media (max-width:700px){.kirow{grid-template-columns:minmax(0,1fr) auto}.kirow>.row{grid-column:1/-1}}"
].join("\n"));
})();
