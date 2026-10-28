/* SEO (Server: seo.js): alle eigenen Websites – Seiten-Check mit Punkten, KI-Vorschläge je Seite, PageSpeed (Handy/Desktop),
   Google Search Console (Suchbegriffe, Seiten, Klicks, Position, Sitemap, Indexierung) und Google Unternehmensprofil (Bewertungen beantworten,
   Beiträge, Öffnungszeiten). Website-Liste wie unter „Websites“ (Railway + Cloudflare) plus von Hand ergänzte Domains. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
F.icons.seo='<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/><path d="M8.5 11.5 10.3 13l3.2-3.6"/>';
var ST=null, LOAD=false, SITE={}, GSC={}, GBP={}, POLL=null;
UI.seoSel=UI.seoSel||F.ls("fsc_seo_sel")||""; UI.seoTab=UI.seoTab||F.ls("fsc_seo_tab")||"ueb";

/* Alpenglas: Website-Liste als Zeilen in EINER Glasfläche, Kennzahlen als Kacheln (Beschriftung oben, Zahl darunter),
   Punkte-Ring per Maske (Mitte durchsichtig statt eigener Füllung), lange Adressen einzeilig mit „…“ und vollem Text im title. */
F.css(
'.seo-grid{display:grid;grid-template-columns:290px minmax(0,1fr);gap:16px;align-items:start}'+
'@media(max-width:900px){.seo-grid{grid-template-columns:minmax(0,1fr)}.seo-list{max-height:none;overflow:visible}}'+
'.seo-grid>div,.seo-si,.seo-si>*{min-width:0}'+
'.seo-side{display:grid;gap:0;overflow:hidden}'+
'.seo-list{display:grid;gap:0;max-height:calc(100vh - 250px);overflow:auto;overscroll-behavior:contain;padding:4px 0}'+
'.seo-si{display:flex;gap:12px;align-items:center;width:100%;border:0;border-top:1px solid var(--line);background:transparent;padding:10px 14px;min-height:58px;font:inherit;color:var(--ink);text-align:left;cursor:pointer}'+
'.seo-si:first-child{border-top:0}'+
'.seo-si:hover{background:var(--hover)}'+
'.seo-si[aria-current="true"]{background:var(--glow-soft);box-shadow:inset 3px 0 0 var(--glow)}'+
'.seo-si.hid{opacity:.62}'+
'.seo-si .seo-tx{display:grid;gap:1px;min-width:0}'+
'.seo-si b{display:block;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.seo-si span.d{font-size:12px;color:var(--ink-3);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.seo-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-top:1px solid var(--line)}'+
'.seo-ring{--v:0;--c:var(--ink-3);--w:4px;position:relative;flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font:700 12px var(--f-mono);font-variant-numeric:tabular-nums;color:var(--ink)}'+
'.seo-ring::before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(var(--c) calc(var(--v)*1%),var(--line) 0);'+
  '-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - var(--w) - .5px),#000 calc(100% - var(--w)));mask:radial-gradient(farthest-side,transparent calc(100% - var(--w) - .5px),#000 calc(100% - var(--w)))}'+
'.seo-ring i{position:relative;font-style:normal}'+
'.seo-ring.big{--w:7px;width:76px;height:76px;font-size:21px}'+
'.seo-head{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:16px 18px}'+
'.seo-head .ti{display:grid;gap:3px;min-width:0;flex:1 1 220px}'+
'.seo-head h2{margin:0;font-size:20px;line-height:1.2;overflow-wrap:anywhere}.seo-head .acts{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}'+
'.seo-dom{display:inline-flex;gap:5px;align-items:center;max-width:100%;min-width:0;font-size:13px;font-weight:600;color:var(--glow-ink);text-decoration:none;justify-self:start}'+
'.seo-dom:hover{text-decoration:underline}.seo-dom span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.seo-dom svg{width:13px;height:13px;flex:none}'+
'.seo-tabs{margin:0 18px}.seo-tabs button{display:inline-flex;gap:6px;align-items:center;white-space:nowrap}.seo-tabs button svg{width:15px;height:15px;flex:none}'+
'.seo-iss{display:grid;gap:0;padding:6px 18px 10px}'+
'.seo-is{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 10px;align-items:start;font-size:13.5px;padding:9px 0;border-bottom:1px solid var(--line)}'+
'.seo-is:last-child{border-bottom:0}.seo-is>span:nth-child(2){min-width:0;overflow-wrap:anywhere;text-wrap:pretty}'+
'.seo-is a{grid-column:2;min-width:0;font-size:12px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.seo-sev{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:none}.seo-sev svg{width:15px;height:15px}'+
'.seo-sev.bad{background:var(--bad-soft);color:var(--bad)}.seo-sev.warn{background:var(--warn-soft);color:var(--warn)}.seo-sev.info{background:var(--info-soft);color:var(--info)}.seo-sev.ok{background:var(--ok-soft);color:var(--ok)}'+
'.seo-tbl{width:100%;border-collapse:collapse;font-size:13px}.seo-tbl th{text-align:left;font-size:11.5px;color:var(--ink-3);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line);white-space:normal;text-wrap:balance;vertical-align:bottom}'+
'.seo-tbl td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}.seo-tbl td.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}'+
'.seo-tbl tbody tr:hover>td{background:var(--hover)}.seo-tbl tbody tr.sg:hover>td{background:none}'+
'.seo-tbl b{overflow-wrap:anywhere}'+
'.seo-tbl .u,.seo-tbl .pg{display:block;max-width:min(44ch,60vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
'.seo-tbl td:last-child .btn{white-space:nowrap}'+
'.seo-tbl .u{font-size:11.5px;color:var(--ink-3)}'+
'.seo-tbl .q{overflow-wrap:anywhere}'+
'.seo-len{font:600 11px var(--f-mono);padding:1px 6px;border-radius:6px}'+
'.seo-sug{display:grid;gap:12px;padding:14px 18px;border-top:1px solid var(--line);background:var(--sunk)}'+
'.seo-sug .row{display:grid;grid-template-columns:110px minmax(0,1fr) auto;gap:8px;align-items:start;font-size:13.5px}'+
'.seo-sug .row>span:nth-child(2){min-width:0;overflow-wrap:anywhere;text-wrap:pretty}'+
'@media(max-width:700px){.seo-sug .row{grid-template-columns:minmax(0,1fr) auto}.seo-sug .row>span:first-child{grid-column:1/-1;font-weight:600}}'+
'.seo-sug pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11.5px;max-height:220px;overflow:auto;background:var(--field);border:1px solid var(--line);border-radius:10px;padding:8px;margin:6px 0 0}'+
'.seo-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 18px}@media(max-width:700px){.seo-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}'+
'.seo-k{border:1px solid var(--line);background:var(--sunk);border-radius:14px;padding:11px 13px;display:grid;gap:3px;align-content:start;min-width:0}'+
'.seo-k .l{font-size:12px;font-weight:500;color:var(--ink-2);text-wrap:balance}'+
'.seo-k .v{font-size:22px;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}'+
'.seo-k .s{font-size:12px;font-weight:500;color:var(--ink-3)}'+
'.seo-k.ring{display:flex;gap:10px;align-items:center}'+
'.seo-lab{display:grid;gap:4px;padding:0 18px 12px;font-size:13px;text-wrap:pretty}.seo-lab .muted{font-weight:600;margin-right:4px}'+
'.seo-spark{display:flex;align-items:flex-end;gap:2px;height:70px;padding:0 18px 14px}.seo-spark i{flex:1;background:var(--glow);opacity:.8;border-radius:3px 3px 0 0;min-height:2px}.seo-spark i:hover{opacity:1}'+
'.seo-rev{display:grid;gap:8px;padding:14px 18px;border-bottom:1px solid var(--line)}.seo-rev:last-child{border-bottom:0}'+
'.seo-rev .rh{display:flex;gap:4px 10px;align-items:baseline;flex-wrap:wrap}.seo-rev .st{color:var(--warn);letter-spacing:1px}'+
'.seo-rev .seo-rtx{overflow-wrap:anywhere;text-wrap:pretty}'+
'.seo-rev .rp{border-left:2px solid var(--glow);padding-left:10px;font-size:13px;color:var(--ink-2);overflow-wrap:anywhere}'+
'.seo-rev .rr{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.seo-rev .rr .f{flex:1 1 220px;min-width:0}'+
'.seo-gacc{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;font-size:13px;color:var(--ink-2)}'+
'.seo-acc{display:inline-flex;gap:6px;align-items:center;min-width:0;max-width:100%}.seo-acc svg{width:15px;height:15px;flex:none}.seo-acc b{max-width:28ch;color:var(--ink);font-weight:600}'+
'.seo-mini{display:inline-flex;gap:5px;align-items:center}.seo-mini svg{width:13px;height:13px;flex:none}'+
'@media(max-width:900px){.seo-head .acts .btn,.seo-tools .btn{min-height:40px}}'
);

function api(p,b){ return F.api(p,b?{body:b}:undefined); }
function load(force){ if(LOAD) return; LOAD=true; api("/admin/api/seo/state"+(force?"?force=1":"")).then(function(j){ LOAD=false; ST=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler beim Laden",sites:[]}; if(F.current==="seo") F.render(); }); }
function loadSite(id){ api("/admin/api/seo/site?id="+encodeURIComponent(id)).then(function(j){ if(j&&j.ok){ SITE[id]=j; ST.sites=ST.sites.map(function(s){ return s.id===id?j.site:s; }); } paint(); poll(); }); }
function poll(){ clearTimeout(POLL); var s=cur(); if(s&&SITE[s.id]&&(SITE[s.id].site.running.check||SITE[s.id].site.running.psi)) POLL=setTimeout(function(){ if(F.current==="seo") loadSite(s.id); },4000); }
function cur(){ return ST&&ST.sites?(ST.sites.find(function(s){ return s.id===UI.seoSel; })||null):null; }
function paint(){ var el=document.getElementById("seoMain"); if(el) el.innerHTML=mainHtml(); var l=document.getElementById("seoList"); if(l) l.innerHTML=listHtml(); }
function col(v){ return v==null?"var(--ink-3)":v>=85?"var(--ok)":v>=60?"var(--warn)":"var(--bad)"; }
function ring(v,big){ return '<span class="seo-ring'+(big?" big":"")+'" style="--v:'+(v||0)+';--c:'+col(v)+'"'+(v==null?' title="Noch nicht geprüft"':' title="'+v+' von 100 Punkten"')+'><i>'+(v==null?"–":v)+'</i></span>'; }
function ago(iso){ if(!iso) return "noch nie"; var d=Math.round((Date.now()-Date.parse(iso))/864e5); return d<1?"heute":d===1?"gestern":"vor "+d+" Tagen"; }
function n0(x){ return Math.round(x||0).toLocaleString("de-AT"); }
function pct(x){ return ((x||0)*100).toFixed(1).replace(".",",")+" %"; }
function pos(x){ return x?(Math.round(x*10)/10).toString().replace(".",","):"–"; }
function lenTag(n,lo,hi){ if(n==null) return '<span class="seo-len tag bad">fehlt</span>'; return '<span class="seo-len tag '+(n<lo?"warn":n>hi?"warn":"ok")+'">'+n+'</span>'; }
/* Schwere als Symbol: Fehler ✕, Warnung/Hinweis !, in Ordnung ✓ */
function sev(cls,label,icon){ return '<span class="seo-sev '+cls+'" title="'+esc(label)+'">'+F.svg(icon||(cls==="bad"?"xCircle":cls==="ok"?"checkCircle":"alertCircle"))+'</span>'; }
function urlLink(u){ return '<a href="'+esc(u)+'" target="_blank" rel="noopener" title="'+esc(u)+'">'+esc(u)+'</a>'; }

function listHtml(){
  var list=(ST.sites||[]).filter(function(s){ return !s.hidden||UI.seoShowHidden; });
  return list.map(function(s){ var is=s.issues, parts=is?[is.fehler?is.fehler+' Fehler':'',is.warnung?is.warnung+' Warn.':''].filter(Boolean):[];
    return '<button type="button" class="seo-si'+(s.hidden?' hid':'')+'" data-act="seosel:'+esc(s.id)+'" aria-current="'+(s.id===UI.seoSel)+'" title="'+esc(s.name+" · "+s.domain)+'">'+ring(s.score)+'<span class="seo-tx"><b>'+esc(s.name)+'</b><span class="d">'+esc(s.domain)+(is?' · '+(parts.length?parts.join(", "):'ohne Fehler'):' · noch nicht geprüft')+'</span></span></button>'; }).join("")||'<div class="empty">Keine Websites gefunden.</div>';
}
function googleBar(){ var g=ST.google||{};
  if(g.connected){ var L=g.accounts&&g.accounts.length?g.accounts:[{email:g.email}];
    return '<span class="seo-gacc">'+L.map(function(x){ var em=x.email||"verbunden"; return '<span class="seo-acc" title="Verbundenes Google-Konto">'+F.svg("google")+'<b class="ell" title="'+esc(em)+'">'+esc(em)+'</b><button type="button" class="link" data-act="seogdis:'+esc(x.email||"")+'" title="Dieses Konto trennen">trennen</button></span>'; }).join("")+'<button type="button" class="btn sm" data-act="seogcon" title="Weiteres Google-Konto verbinden (z. B. mit weiteren Unternehmensprofilen)">'+F.svg("plus")+' Konto</button></span>'; }
  return '<button type="button" class="btn sm primary" data-act="seogcon"'+(g.app?'':' title="Zuerst Google-App-Zugang eintragen"')+'>'+F.svg("google")+' Google verbinden</button>'+(g.app?'':' <span class="muted small">Google-App-Zugang fehlt (Marketing › Kanäle › YouTube/Google). Weiterleitungs-Adresse: <code class="anyw">'+esc(g.redirect||"")+'</code></span>');
}
var TABS=[["ueb","Überblick","chart"],["seiten","Seiten","copy"],["gsc","Google Suche","google"],["speed","Geschwindigkeit","zap"],["gbp","Unternehmensprofil","building"]];
function mainHtml(){
  var s=cur(); if(!s) return '<div class="panel empty">Links eine Website wählen.</div>';
  var d=SITE[s.id]; if(!d){ loadSite(s.id); return '<div class="panel empty">Lade …</div>'; }
  var run=d.site.running, c=d.check;
  var head='<div class="panel"><div class="seo-head">'+ring(d.site.score,true)+'<div class="ti"><h2>'+esc(s.name)+'</h2><a class="seo-dom" href="'+esc(s.url)+'" target="_blank" rel="noopener" title="'+esc(s.url)+'"><span>'+esc(s.domain)+'</span>'+F.svg("external")+'</a><div class="muted small">Geprüft: '+ago(c&&c.at)+(c?' · '+c.pages.length+' Seiten':'')+(d.site.perf!=null?' · Handy-Tempo '+d.site.perf:'')+'</div></div>'+
    '<div class="acts"><button type="button" class="btn primary" data-act="seocheck:'+esc(s.id)+'"'+(run.check?' disabled':'')+'>'+F.svg("refresh")+(run.check?' Prüfe … (ca. 1 Min.)':' Jetzt prüfen')+'</button><button type="button" class="btn" data-act="seohide:'+esc(s.id)+'">'+F.svg(d.site.hidden?"eye":"eyeOff")+(d.site.hidden?' Wieder einblenden':' Ausblenden')+'</button></div></div>'+
    '<nav class="subnav seo-tabs" aria-label="SEO">'+TABS.map(function(t){ return '<button type="button" data-act="seotab:'+t[0]+'" aria-current="'+(UI.seoTab===t[0])+'">'+F.svg(t[2])+'<span>'+t[1]+'</span></button>'; }).join("")+'</nav><div style="height:10px"></div></div>';
  var body=UI.seoTab==="seiten"?pagesHtml(s,d):UI.seoTab==="gsc"?gscHtml(s):UI.seoTab==="speed"?speedHtml(s,d):UI.seoTab==="gbp"?gbpHtml(s):overHtml(s,d);
  return head+'<div style="height:12px"></div>'+body;
}
function overHtml(s,d){
  var c=d.check; if(!c) return '<div class="panel empty">'+(d.checkError?'<span class="bad-t">'+esc(d.checkError)+'</span><br>':'')+'Noch nicht geprüft – „Jetzt prüfen“ liest Startseite und Sitemap und zeigt, was Google stört.</div>';
  var grp={fehler:[],warnung:[],hinweis:[]}; c.issues.forEach(function(i){ (grp[i.sev]||grp.hinweis).push(i); });
  var sec=function(k,label,cls){ var l=grp[k]; if(!l.length) return ""; return '<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h2>'+label+' <span class="tag '+cls+'">'+l.length+'</span></h2></div><div class="seo-iss">'+l.map(function(i){ return '<div class="seo-is">'+sev(cls,label)+'<span>'+esc(i.msg)+'</span>'+(i.url?urlLink(i.url):'')+'</div>'; }).join("")+'</div></div>'; };
  var k='<div class="panel" style="margin-bottom:12px"><div class="seo-kpis">'+
    '<div class="seo-k"><span class="l">Seiten geprüft</span><span class="v">'+c.pages.length+'</span><span class="s">'+(c.sitemap?c.urlsInSitemap+' in der Sitemap':'keine Sitemap')+'</span></div>'+
    '<div class="seo-k"><span class="l">Fehler</span><span class="v" style="color:'+(grp.fehler.length?"var(--bad)":"var(--ok)")+'">'+grp.fehler.length+'</span><span class="s">wichtig für Google</span></div>'+
    '<div class="seo-k"><span class="l">Warnungen</span><span class="v">'+grp.warnung.length+'</span><span class="s">verbessern</span></div>'+
    '<div class="seo-k"><span class="l">robots.txt</span><span class="v" style="font-size:16px">'+(c.robots?"✓ vorhanden":"fehlt")+'</span><span class="s">Prüfdauer '+Math.round(c.ms/1000)+' s</span></div></div></div>';
  return k+(grp.fehler.length+grp.warnung.length+grp.hinweis.length?sec("fehler","Fehler","bad")+sec("warnung","Warnungen","warn")+sec("hinweis","Hinweise","info"):'<div class="panel empty">Keine Probleme gefunden 🎉</div>');
}
function pagesHtml(s,d){
  var c=d.check; if(!c) return '<div class="panel empty">Zuerst „Jetzt prüfen“.</div>';
  var sug=d.suggest||{};
  return '<div class="panel"><div class="panel-h"><h2>Seiten</h2><span class="muted small">Titel ideal 45–60, Beschreibung 120–155 Zeichen · „KI-Vorschlag“ schreibt bessere Texte (wenige Cent)</span></div><div style="overflow:auto"><table class="seo-tbl"><thead><tr><th>Seite</th><th>Titel</th><th>Beschr.</th><th>H1</th><th class="r">Wörter</th><th class="r">Bilder ohne Alt</th><th></th></tr></thead><tbody>'+
    c.pages.map(function(p,i){ var sg=sug[p.url];
      return '<tr><td><b>'+esc(p.title||"(kein Titel)")+'</b><span class="u" title="'+esc(p.url)+'">'+esc(p.url)+'</span>'+(p.status!==200?'<span class="small bad-t">'+esc(p.status||p.error)+'</span>':'')+'</td><td>'+lenTag(p.title?p.title.length:null,30,65)+'</td><td>'+lenTag(p.desc?p.desc.length:null,70,165)+'</td><td>'+(p.h1&&p.h1.length===1?'<span class="seo-len tag ok">1</span>':'<span class="seo-len tag warn">'+(p.h1?p.h1.length:0)+'</span>')+'</td><td class="r">'+n0(p.words)+'</td><td class="r">'+(p.noAlt?'<span class="warn-t">'+p.noAlt+'</span>':'0')+'</td>'+
        '<td><button type="button" class="btn sm" data-act="seosug:'+esc(s.id)+'|'+i+'">'+F.svg("sparkle")+(sg?" Neu vorschlagen":" KI-Vorschlag")+'</button></td></tr>'+(sg?'<tr class="sg"><td colspan="7" style="padding:0">'+sugHtml(p,sg)+'</td></tr>':'');
    }).join("")+'</tbody></table></div></div>';
}
function copyBtn(t){ return '<button type="button" class="btn sm" data-act="seocopy" data-copy="'+esc(t)+'">'+F.svg("copy")+' Kopieren</button>'; }
function sugHtml(p,g){
  return '<div class="seo-sug">'+
    '<div class="row"><span class="muted">Titel</span><span><b>'+esc(g.title)+'</b> '+lenTag(g.title.length,30,65)+'<br><span class="muted small">bisher: '+esc(p.title||"–")+'</span></span>'+copyBtn(g.title)+'</div>'+
    '<div class="row"><span class="muted">Beschreibung</span><span>'+esc(g.description)+' '+lenTag(g.description.length,70,165)+'<br><span class="muted small">bisher: '+esc(p.desc||"–")+'</span></span>'+copyBtn(g.description)+'</div>'+
    '<div class="row"><span class="muted">H1</span><span>'+esc(g.h1)+'</span>'+copyBtn(g.h1)+'</div>'+
    (g.keywords.length?'<div class="row"><span class="muted">Suchbegriffe</span><span>'+g.keywords.map(esc).join(" · ")+'</span><span></span></div>':'')+
    (g.tips.length?'<div class="row"><span class="muted">Tipps</span><span><ul style="margin:0;padding-left:18px">'+g.tips.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join("")+'</ul></span><span></span></div>':'')+
    (g.faqJsonLd?'<div class="row"><span class="muted">FAQ für Google</span><span>'+g.faq.map(function(f){ return '<b>'+esc(f.q)+'</b><br><span class="small">'+esc(f.a)+'</span>'; }).join("<br>")+'<pre>&lt;script type="application/ld+json"&gt;\n'+esc(g.faqJsonLd)+'\n&lt;/script&gt;</pre></span>'+copyBtn('<script type="application/ld+json">\n'+g.faqJsonLd+'\n</script>')+'</div>':'')+
    '</div>';
}
function speedHtml(s,d){
  var p=d.psi, run=d.site.running.psi;
  var btn='<button type="button" class="btn sm primary" data-act="seopsi:'+esc(s.id)+'"'+(run?' disabled':'')+'>'+F.svg("zap")+(run?' Messe … (ca. 1 Min.)':p?' Neu messen':' Jetzt messen')+'</button>';
  if(!p) return '<div class="panel empty">'+(d.psiError?'<span class="bad-t">'+esc(d.psiError)+'</span><br>':'')+'Google PageSpeed misst Ladezeit und Technik am Handy und am Computer. '+btn+'</div>';
  var blk=function(label,x){ if(!x||x.error) return '<div class="panel empty">'+label+': '+esc(x&&x.error||"–")+'</div>'; var sc=x.scores, f=x.field||{}, fv=function(m,u){ return m?'<span class="tag '+(m.cat==="FAST"?"ok":m.cat==="AVERAGE"?"warn":"bad")+'">'+(u==="s"?(m.p75/1000).toFixed(1).replace(".",",")+" s":u==="cls"?(m.p75/100).toFixed(2).replace(".",","):m.p75+" ms")+'</span>':'<span class="muted">–</span>'; };
    return '<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h2>'+label+'</h2><span class="muted small">'+ago(p.at)+'</span></div><div class="seo-kpis">'+
      [["Leistung",sc.performance],["SEO (Technik)",sc.seo],["Barrierefreiheit",sc.accessibility],["Best Practices",sc.best]].map(function(k){ return '<div class="seo-k ring">'+ring(k[1])+'<span class="l">'+k[0]+'</span></div>'; }).join("")+'</div>'+
      '<div class="seo-lab"><div><span class="muted">Labor:</span>Größter Inhalt (LCP) <b>'+esc(x.lab.lcp)+'</b> · Verschiebung (CLS) <b>'+esc(x.lab.cls)+'</b> · Blockierzeit <b>'+esc(x.lab.tbt)+'</b> · Erster Inhalt <b>'+esc(x.lab.fcp)+'</b></div><div><span class="muted">Echte Besucher (Chrome, 28 Tage):</span>LCP '+fv(f.lcp,"s")+' · INP '+fv(f.inp,"ms")+' · CLS '+fv(f.cls,"cls")+'</div></div>'+
      (x.opportunities.length?'<div class="seo-iss">'+x.opportunities.map(function(o){ return '<div class="seo-is">'+sev("warn","Verbesserung","zap")+'<span>'+esc(o.title)+(o.saving?' <span class="muted">('+esc(o.saving)+')</span>':'')+'</span></div>'; }).join("")+'</div>':'')+'</div>'; };
  return '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">'+btn+'</div>'+blk("Handy",p.mobile)+blk("Computer",p.desktop);
}
function gscHtml(s){
  var g=ST.google||{}; if(!g.connected) return '<div class="panel empty">Für Suchbegriffe, Klicks und Positionen Google verbinden (oben rechts).</div>';
  var d=GSC[s.id]; if(!d){ api("/admin/api/seo/gsc?id="+encodeURIComponent(s.id)).then(function(j){ GSC[s.id]=j&&j.ok?j.gsc:{error:(j&&j.error)||"Fehler"}; paint(); }); return '<div class="panel empty">Lade Search Console …</div>'; }
  if(d.error) return '<div class="notice"><span>'+esc(d.error)+'</span><button type="button" class="btn sm" data-act="seogscre:'+esc(s.id)+'">'+F.svg("refresh")+' Nochmal</button></div>';
  if(!d.property) return '<div class="panel empty">'+esc(d.note||"")+'<br><a class="btn sm" href="https://search.google.com/search-console/welcome" target="_blank" rel="noopener">In der Search Console hinzufügen'+F.svg("external")+'</a></div>';
  /* Veränderung zu den 28 Tagen davor – eigene Zeile unter der Zahl */
  var t=d.total, pv=d.prev, dlt=function(a,b,inv){ if(!b) return ""; var x=(a-b)/b*100; if(inv) x=-x; return '<span class="s"><span class="'+(x>=0?"ok-t":"bad-t")+'">'+(x>=0?"+":"")+Math.round(x)+' %</span> ggü. davor</span>'; };
  var mx=Math.max.apply(null,d.days.map(function(x){ return x.clicks; }).concat([1]));
  var tbl=function(rows,label){ return '<table class="seo-tbl"><thead><tr><th>'+label+'</th><th class="r">Klicks</th><th class="r">Impressionen</th><th class="r">CTR</th><th class="r">Position</th></tr></thead><tbody>'+rows.map(function(r){ var k=label==="Seite"?r.key.replace(/^https?:\/\/[^/]+/,"")||"/":r.key; return '<tr><td>'+(label==="Seite"?'<span class="pg" title="'+esc(r.key)+'">'+esc(k)+'</span>':'<span class="q">'+esc(k)+'</span>')+'</td><td class="r">'+n0(r.clicks)+'</td><td class="r">'+n0(r.impressions)+'</td><td class="r">'+pct(r.ctr)+'</td><td class="r">'+pos(r.position)+'</td></tr>'; }).join("")+'</tbody></table>'; };
  return '<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h2>Google Suche · letzte 28 Tage</h2><span class="muted small">'+esc(d.property)+' · <button type="button" class="link" data-act="seogscre:'+esc(s.id)+'">aktualisieren</button></span></div>'+
    '<div class="seo-kpis"><div class="seo-k"><span class="l">Klicks</span><span class="v">'+n0(t.clicks)+'</span>'+dlt(t.clicks,pv.clicks)+'</div><div class="seo-k"><span class="l">Impressionen</span><span class="v">'+n0(t.impressions)+'</span>'+dlt(t.impressions,pv.impressions)+'</div>'+
    '<div class="seo-k"><span class="l">Klickrate</span><span class="v">'+pct(t.ctr)+'</span></div><div class="seo-k"><span class="l">Ø Position</span><span class="v">'+pos(t.position)+'</span>'+dlt(t.position,pv.position,true)+'</div></div>'+
    '<div class="seo-spark" title="Klicks pro Tag">'+d.days.map(function(x){ return '<i style="height:'+Math.max(2,x.clicks/mx*100)+'%" title="'+esc(x.key)+': '+x.clicks+' Klicks"></i>'; }).join("")+'</div></div>'+
    '<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h2>Suchbegriffe</h2><span class="muted small">Position 4–15 mit vielen Impressionen = Chance mit wenig Aufwand</span></div><div style="overflow:auto">'+tbl(d.queries,"Suchbegriff")+'</div></div>'+
    '<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h2>Seiten</h2></div><div style="overflow:auto">'+tbl(d.pages,"Seite")+'</div></div>'+
    '<div class="panel"><div class="panel-h"><h2>Sitemaps &amp; Indexierung</h2><span class="row wrap"><button type="button" class="btn sm" data-act="seosm:'+esc(s.id)+'">'+F.svg("upload")+' Sitemap einreichen</button><button type="button" class="btn sm" data-act="seoinsp:'+esc(s.id)+'">'+F.svg("search")+' Startseite prüfen</button></span></div>'+
    (d.sitemaps.length?'<div style="overflow:auto"><table class="seo-tbl"><tbody>'+d.sitemaps.map(function(x){ return '<tr><td><span class="pg" title="'+esc(x.path)+'">'+esc(x.path)+'</span></td><td>'+(x.errors?'<span class="bad-t">'+x.errors+' Fehler</span>':'<span class="ok-t">ok</span>')+'</td><td><span class="u">eingereicht '+esc(String(x.submitted).slice(0,10))+' · gelesen '+esc(String(x.downloaded).slice(0,10))+'</span></td></tr>'; }).join("")+'</tbody></table></div>':'<div class="empty">Noch keine Sitemap eingereicht.</div>')+'<div id="seoInsp"></div></div>';
}
function gbpHtml(s){
  var g=ST.google||{}; if(!g.connected) return '<div class="panel empty">Für Bewertungen, Beiträge und Öffnungszeiten Google verbinden (oben rechts). Google muss den Zugang zum Unternehmensprofil einmalig freischalten.</div>';
  var d=GBP[s.id]; if(!d){ api("/admin/api/seo/gbp?id="+encodeURIComponent(s.id)).then(function(j){ GBP[s.id]=j&&j.ok?j.gbp:{error:(j&&j.error)||"Fehler"}; paint(); }); return '<div class="panel empty">Lade Unternehmensprofil …</div>'; }
  if(d.error) return '<div class="notice"><span>'+esc(d.error)+'</span><button type="button" class="btn sm" data-act="seogbpre:'+esc(s.id)+'">'+F.svg("refresh")+' Nochmal</button></div>';
  if(!d.locations.length) return '<div class="panel empty">Kein Unternehmensprofil mit dieser Website-Adresse gefunden.'+(d.all&&d.all.length?'<div style="display:grid;gap:6px;margin-top:10px;justify-items:center">'+d.all.map(function(l){ return '<button type="button" class="btn sm" data-act="seogbplink:'+esc(s.id)+'|'+esc(l.name)+'">'+F.svg("link")+' '+esc(l.title)+' zuordnen</button>'; }).join("")+'</div>':'')+'</div>';
  return d.locations.map(function(l){ var rv=l.reviews||{reviews:[]}, open=rv.reviews.filter(function(r){ return !r.reply; }).length;
    return '<div class="panel" style="margin-bottom:12px"><div class="panel-h"><h2>'+esc(l.title)+'</h2><span class="muted small">'+esc(l.address)+(l.maps?' · <a class="seo-mini" href="'+esc(l.maps)+'" target="_blank" rel="noopener">'+F.svg("pin")+'Google Maps</a>':'')+'</span></div>'+
      (l.error?'<div class="notice"><span>'+esc(l.error)+'</span></div>':'')+
      '<div class="seo-kpis"><div class="seo-k"><span class="l">Bewertung</span><span class="v">'+(rv.avg?String(Math.round(rv.avg*10)/10).replace(".",",")+' ★':'–')+'</span></div><div class="seo-k"><span class="l">Bewertungen</span><span class="v">'+n0(rv.total)+'</span></div><div class="seo-k"><span class="l">Unbeantwortet</span><span class="v" style="color:'+(open?"var(--warn)":"var(--ok)")+'">'+open+'</span></div>'+
      '<div class="seo-k"><span class="l">Bewertungslink</span><span class="s">'+(l.review?'<button type="button" class="btn sm" data-act="seocopy" data-copy="'+esc(l.review)+'">'+F.svg("copy")+' Link kopieren</button>':'–')+'</span></div></div>'+
      '<div class="seo-rev"><b>Beitrag im Unternehmensprofil</b><textarea class="f" rows="2" data-gbppost="'+esc(s.id)+'|'+esc(l.name)+'" placeholder="Neuigkeit, Angebot oder Veranstaltung …"></textarea><div class="rr"><input class="f" data-gbplink="'+esc(l.name)+'" placeholder="Link (optional), z. B. '+esc(s.url)+'"><button type="button" class="btn sm primary" data-act="seogbppost:'+esc(s.id)+'|'+esc(l.name)+'">'+F.svg("send")+' Veröffentlichen</button></div></div>'+
      rv.reviews.map(function(r){ return '<div class="seo-rev"><div class="rh"><b>'+esc(r.name)+'</b> <span class="st" aria-label="'+r.stars+' von 5 Sternen">'+"★★★★★".slice(0,r.stars)+'<span style="opacity:.25">'+"★★★★★".slice(r.stars)+'</span></span> <span class="muted small">'+esc(String(r.at).slice(0,10))+'</span></div>'+(r.text?'<div class="seo-rtx">'+esc(r.text)+'</div>':'')+
        (r.reply?'<div class="rp"><b>Deine Antwort:</b> '+esc(r.reply.text)+'</div>':'<div class="rr"><textarea class="f" rows="1" data-gbprep="'+esc(s.id)+'|'+esc(l.name)+'|'+esc(r.id)+'" placeholder="Antworten …"></textarea><button type="button" class="btn sm primary" data-act="seogbprep:'+esc(s.id)+'|'+esc(l.name)+'|'+esc(r.id)+'">'+F.svg("send")+' Senden</button></div>')+'</div>'; }).join("")+'</div>';
  }).join("");
}
function render(){
  if(!ST){ load(); return F.head("SEO","Alle Websites für Google optimieren")+'<div class="muted" style="padding:20px">Lade …</div>'; }
  if(!ST.ok) return F.head("SEO","")+'<div class="notice"><span>'+esc(ST.error)+'</span><button type="button" class="btn sm" data-act="seoreload">'+F.svg("refresh")+' Erneut</button></div>';
  if(!cur()&&ST.sites.length){ UI.seoSel=ST.sites[0].id; }
  return F.head("SEO",ST.sites.length+" Websites · Google-Suche, Geschwindigkeit, Unternehmensprofil",googleBar())+
    '<div class="seo-grid"><div class="panel seo-side"><div class="seo-list" id="seoList">'+listHtml()+'</div><div class="seo-tools"><button type="button" class="btn sm" data-act="seoadd">'+F.svg("plus")+' Domain</button><button type="button" class="btn sm" data-act="seoall">'+F.svg("refresh")+' Alle prüfen</button><button type="button" class="link small" data-act="seoshowhid">'+(UI.seoShowHidden?"Ausgeblendete verstecken":"Ausgeblendete zeigen")+'</button></div></div><div id="seoMain">'+mainHtml()+'</div></div>';
}
F.action("seosel",function(id){ UI.seoSel=id; F.ls("fsc_seo_sel",id); paint(); });
F.action("seotab",function(t){ UI.seoTab=t; F.ls("fsc_seo_tab",t); paint(); });
F.action("seoreload",function(){ ST=null; F.render(); });
F.action("seoshowhid",function(){ UI.seoShowHidden=!UI.seoShowHidden; F.render(); });
F.action("seocheck",function(id){ api("/admin/api/seo/check",{id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); setTimeout(function(){ loadSite(id); },600); }); });
F.action("seopsi",function(id){ api("/admin/api/seo/psi",{id:id}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); setTimeout(function(){ loadSite(id); },600); }); });
F.action("seoall",function(){ var l=(ST.sites||[]).filter(function(s){ return !s.hidden; }); F.confirm(l.length+" Websites nacheinander prüfen? Das dauert einige Minuten, du kannst weiterarbeiten.","Prüfen",function(){ var i=0; (function next(){ if(i>=l.length){ load(true); return F.toast("Alle Websites geprüft"); } var s=l[i++]; api("/admin/api/seo/check",{id:s.id}).then(function(){ var w=setInterval(function(){ api("/admin/api/seo/site?id="+encodeURIComponent(s.id)).then(function(j){ if(j&&j.ok&&!j.site.running.check){ clearInterval(w); SITE[s.id]=j; ST.sites=ST.sites.map(function(x){ return x.id===s.id?j.site:x; }); paint(); next(); } }); },5000); }); })(); }); });
F.action("seohide",function(id){ var s=SITE[id]; api("/admin/api/seo/hide",{id:id,hidden:!(s&&s.site.hidden)}).then(function(){ delete SITE[id]; load(true); }); });
F.action("seoadd",function(){ F.modal('<form data-form="seoadd"><div class="row-between"><h2 style="font-size:19px">Website ergänzen</h2>'+F.btnClose()+'</div><label class="fl">Domain<input class="f" name="domain" placeholder="beispiel.at" required></label><label class="fl">Name<input class="f" name="name" placeholder="Beispiel GmbH"></label><div class="foot"><span></span><button type="submit" class="btn primary">Hinzufügen</button></div></form>',"narrow"); });
F.form("seoadd",function(f){ api("/admin/api/seo/add",{domain:f.domain.value,name:f.name.value}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); F.closeModal(); UI.seoSel=j.id; ST=null; load(true); }); });
F.action("seosug",function(a){ var x=a.split("|"), d=SITE[x[0]], p=d&&d.check&&d.check.pages[+x[1]]; if(!p) return; F.toast("KI schreibt Vorschläge …");
  api("/admin/api/seo/suggest",{id:x[0],url:p.url}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); d.suggest=d.suggest||{}; d.suggest[p.url]=j.suggest; paint(); }); });
F.action("seocopy",function(a,el){ var t=el&&el.getAttribute("data-copy")||""; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ F.toast("Kopiert"); },function(){ F.toast("Kopieren nicht möglich",true); }); });
F.action("seogcon",function(){ api("/admin/api/seo/google/connect",{}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); location.href=j.url; }); });
F.action("seogdis",function(email){ F.confirm((email?"Google-Konto "+email+" trennen? Websites und Unternehmensprofile dieses Kontos sind dann nicht mehr sichtbar.":"Google trennen? Search Console und Unternehmensprofil sind dann nicht mehr sichtbar."),"Trennen",function(){ api("/admin/api/seo/google/disconnect",{email:email||""}).then(function(){ GSC={}; GBP={}; load(true); }); },true); });
F.action("seogscre",function(id){ delete GSC[id]; api("/admin/api/seo/gsc?force=1&id="+encodeURIComponent(id)).then(function(j){ GSC[id]=j&&j.ok?j.gsc:{error:(j&&j.error)||"Fehler"}; paint(); }); });
F.action("seosm",function(id){ var s=ST.sites.find(function(x){ return x.id===id; }); api("/admin/api/seo/sitemap",{id:id,sitemap:s.url+"sitemap.xml"}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); F.toast("Sitemap eingereicht"); delete GSC[id]; paint(); }); });
F.action("seoinsp",function(id){ var el=document.getElementById("seoInsp"); if(el) el.innerHTML='<div class="empty">Frage Google …</div>'; api("/admin/api/seo/inspect",{id:id}).then(function(j){ var e=document.getElementById("seoInsp"); if(!e) return; if(!j||!j.ok){ e.innerHTML='<div class="notice"><span>'+esc((j&&j.error)||"Fehler")+'</span></div>'; return; } var r=j.result;
  e.innerHTML='<div class="seo-iss"><div class="seo-is">'+sev(r.verdict==="PASS"?"ok":"warn",r.verdict==="PASS"?"Indexiert":"Prüfen")+'<span>'+esc(r.coverage||r.verdict)+(r.lastCrawl?' · zuletzt gecrawlt '+esc(String(r.lastCrawl).slice(0,10)):'')+(r.canonical?' · Google-Canonical: '+esc(r.canonical):'')+(r.link?' · <a class="seo-mini" href="'+esc(r.link)+'" target="_blank" rel="noopener">in der Search Console'+F.svg("external")+'</a>':'')+'</span></div></div>'; }); });
F.action("seogbpre",function(id){ delete GBP[id]; paint(); });
F.action("seogbplink",function(a){ var x=a.split("|"); api("/admin/api/seo/gbp/link",{id:x[0],locations:[x[1]]}).then(function(){ delete GBP[x[0]]; paint(); }); });
F.action("seogbprep",function(a){ var x=a.split("|"), ta=document.querySelector('[data-gbprep="'+CSS.escape(a)+'"]'), t=ta?ta.value.trim():""; if(!t) return F.toast("Bitte zuerst eine Antwort schreiben",true);
  api("/admin/api/seo/gbp/reply",{id:x[0],location:x[1],review:x[2],text:t}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); F.toast("Antwort veröffentlicht"); delete GBP[x[0]]; api("/admin/api/seo/gbp?force=1&id="+encodeURIComponent(x[0])).then(function(k){ GBP[x[0]]=k&&k.ok?k.gbp:{error:"Fehler"}; paint(); }); }); });
F.action("seogbppost",function(a){ var x=a.split("|"), ta=document.querySelector('[data-gbppost="'+CSS.escape(a)+'"]'), ln=document.querySelector('[data-gbplink="'+CSS.escape(x[1])+'"]'), t=ta?ta.value.trim():""; if(!t) return F.toast("Bitte einen Text eingeben",true);
  F.confirm("Beitrag im Google-Unternehmensprofil veröffentlichen? Er ist danach öffentlich auf Google sichtbar.","Veröffentlichen",function(){ api("/admin/api/seo/gbp/post",{id:x[0],location:x[1],text:t,link:ln&&ln.value.trim()||""}).then(function(j){ if(!j||!j.ok) return F.toast((j&&j.error)||"Fehler",true); F.toast("Beitrag veröffentlicht"); if(ta) ta.value=""; }); }); });

/* Rückkehr von der Google-Anmeldung */
(function(){ try{ var q=new URLSearchParams(location.search), m=q.get("seo"); if(!m) return; history.replaceState(null,"",location.pathname+location.hash); setTimeout(function(){ F.toast(m.replace(/^(ok|fehler):/,""),m.indexOf("ok:")!==0); ST=null; if(F.current==="seo") F.render(); },1200); }catch(e){} })();

F.view({id:"seo",label:"SEO",short:"SEO",icon:"seo",order:19,render:render,after:function(){ poll(); }});
})();
