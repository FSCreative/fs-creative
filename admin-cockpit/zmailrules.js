/* Mail-Regeln (wie Outlook): Liste, anlegen/bearbeiten, Vorschau „welche Mails passen“, auf den Posteingang anwenden.
   Die Regeln laufen am Server für neue Mails (alle 2 Minuten), auch wenn das Cockpit geschlossen ist. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var R={list:null,last:null,edit:null,prev:null};
function store(){ return (F.M&&F.M.store)||{folders:[],accounts:[]}; }
function folders(){ var skip=/^(inbox|INBOX)$/; return (store().folders||[]).filter(function(f){ return !skip.test(f.path)&&!/trash|papierkorb|deleted|gel(ö|oe)scht|junk|spam|draft|entw(ü|ue)rf/i.test(f.path+" "+(f.special||"")); }); }
function accounts(){ var a={}; (store().folders||[]).forEach(function(f){ if(f.account) a[f.account]=1; }); return Object.keys(a); }
var UP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m6 11 6-6 6 6"/></svg>';
function load(){ return F.api("/admin/api/mail-rules").then(function(j){ R.list=j&&j.ok?j.rules:[]; R.last=j&&j.last; paint(); }); }
function summary(r){ var c=r.cond, a=r.act, w=[];
  if(c.from) w.push("von „"+c.from+"“"); if(c.to) w.push("an „"+c.to+"“"); if(c.subject) w.push("Betreff „"+c.subject+"“"); if(c.body) w.push("Text „"+c.body+"“"); if(c.account) w.push("Konto "+c.account); if(c.attach) w.push("mit Anhang");
  var d=[]; if(a.seen) d.push("als gelesen"); if(a.flag) d.push("markieren"); if(a.move) d.push("nach „"+a.move.split("|").pop()+"“ verschieben"); if(a.trash) d.push("löschen"); if(a.spam) d.push("als Spam");
  return "Wenn "+(w.join(" und ")||"–")+" → "+(d.join(", ")||"–"); }
function listHtml(){
  if(R.list==null) return '<div class="empty">Lade …</div>';
  return (R.list.length?R.list.map(function(r,i){ return '<div class="mr-row'+(r.active?"":" off")+'"><label class="mr-sw" title="Regel an/aus"><input type="checkbox" data-mrtog="'+esc(r.id)+'"'+(r.active?" checked":"")+'><span></span></label><div class="mr-main"><b>'+esc(r.name)+'</b><span>'+esc(summary(r))+'</span><i>'+(r.hits?r.hits+"× angewendet"+(r.lastHit?" · zuletzt "+F.de(r.lastHit.slice(0,10)):""):"noch nicht angewendet")+'</i></div>'+
    '<div class="mr-btns">'+(i>0?'<button type="button" class="btn icon" data-act="mrup:'+i+'" title="Nach oben (wird früher angewendet)" aria-label="Nach oben">'+UP+'</button>':'')+'<button type="button" class="btn" data-act="mredit:'+esc(r.id)+'">Bearbeiten</button><button type="button" class="btn" data-act="mrapply:'+esc(r.id)+'">Jetzt anwenden</button><button type="button" class="btn icon mr-del" data-act="mrdel:'+esc(r.id)+'" title="Regel löschen" aria-label="Regel löschen">'+F.svg("close")+'</button></div></div>'; }).join(""):'<div class="mr-empty"><b>Noch keine Regeln</b><span>Lege z. B. eine an, die Newsletter automatisch in einen Ordner verschiebt.</span></div>');
}
function editHtml(){
  var r=R.edit, c=r.cond, a=r.act, fo=folders(), ac=accounts();
  var inp=function(k,l,ph){ return '<label class="fl">'+l+'<input class="f" data-mrc="'+k+'" value="'+esc(c[k]||"")+'" placeholder="'+esc(ph)+'"></label>'; };
  return '<div class="mr-ed"><label class="fl">Name der Regel<input class="f" data-mrn="1" value="'+esc(r.name||"")+'" placeholder="z. B. Newsletter wegsortieren"></label>'+
    '<div class="mr-sec">Wenn eine neue Mail … <span class="muted small">(alle angegebenen Bedingungen müssen passen; mehrere Begriffe mit Komma trennen = einer davon reicht)</span></div>'+
    '<div class="grid2">'+inp("from","Absender enthält","newsletter@, amazon.de")+inp("subject","Betreff enthält","Rechnung, Invoice")+inp("to","Empfänger enthält","simon@fs-creative.at")+inp("body","Text enthält","abmelden, unsubscribe")+'</div>'+
    '<div class="row wrap" style="gap:16px">'+(ac.length>1?'<label class="fl inline">Nur Konto <select class="f" data-mrc="account"><option value="">alle Konten</option>'+ac.map(function(x){ return '<option'+(c.account===x?" selected":"")+'>'+esc(x)+'</option>'; }).join("")+'</select></label>':'')+'<label class="row small"><input type="checkbox" data-mrcb="attach"'+(c.attach?" checked":"")+'> hat einen Anhang</label></div>'+
    '<div class="mr-sec">… dann</div><div class="row wrap" style="gap:16px">'+
      '<label class="row small"><input type="checkbox" data-mrab="seen"'+(a.seen?" checked":"")+'> als gelesen markieren</label><label class="row small"><input type="checkbox" data-mrab="flag"'+(a.flag?" checked":"")+'> markieren (Fahne)</label>'+
      '<label class="row small"><input type="checkbox" data-mrab="trash"'+(a.trash?" checked":"")+'> löschen</label><label class="row small"><input type="checkbox" data-mrab="spam"'+(a.spam?" checked":"")+'> als Spam</label></div>'+
    '<label class="fl">In Ordner verschieben<select class="f" data-mra="move"><option value="">– nicht verschieben –</option>'+fo.map(function(f){ var k=(f.account||"")+"|"+f.path; return '<option value="'+esc(k)+'"'+(a.move===k?" selected":"")+'>'+esc((ac.length>1?(f.account||"")+" · ":"")+(f.name||f.path))+'</option>'; }).join("")+'</select></label>'+
    '<label class="row small"><input type="checkbox" data-mrs="1"'+(r.stop?" checked":"")+'> danach keine weiteren Regeln anwenden</label>'+
    '<div class="row wrap" style="justify-content:space-between;margin-top:6px"><button type="button" class="btn" data-act="mrprev">Vorschau: welche Mails im Posteingang passen?</button><span class="err" id="mrErr"></span></div><div id="mrPrev">'+(R.prev?prevHtml(R.prev):'')+'</div>'+
    '<div class="foot"><span class="muted small">Gilt automatisch für neue Mails. Bestehende Mails nur mit „Jetzt anwenden“.</span><span class="row"><button type="button" class="btn" data-act="mrback">Zurück</button><button type="button" class="btn primary" data-act="mrsave">Speichern</button></span></div></div>';
}
function prevHtml(p){ return '<div class="mr-prev"><b>'+p.count+' Mail'+(p.count===1?"":"s")+' im Posteingang passen</b>'+(p.sample||[]).map(function(m){ return '<div><span>'+esc(m.from||"")+'</span> '+esc(m.subject||"")+'</div>'; }).join("")+'</div>'; }
function body(){ return '<div class="stackf" id="mrBox"><div class="row-between"><h2 style="font-size:19px">'+(R.edit?(R.edit.id?"Regel bearbeiten":"Neue Regel"):"Regeln")+'</h2>'+F.btnClose()+'</div>'+
  (R.edit?editHtml():'<p class="muted" style="margin:0">Regeln sortieren neue Mails automatisch – am Server, auch wenn das Cockpit zu ist. Reihenfolge zählt: oben zuerst.</p>'+listHtml()+'<div class="foot"><span class="muted small">'+(R.last&&R.last.at?"Zuletzt geprüft "+R.last.at.slice(11,16)+(R.last.error?" · Fehler: "+esc(R.last.error):""):"")+'</span><button type="button" class="btn primary" data-act="mrnew">Neue Regel</button></div>')+'</div>'; }
function paint(){ var b=document.getElementById("mrBox"); if(b) b.outerHTML=body(); }
F.action("mailrules",function(){ R.edit=null; R.prev=null; F.modal(body(),"wide"); load(); });
F.action("mrnew",function(){ R.edit={name:"",active:true,cond:{},act:{},stop:false}; R.prev=null; paint(); });
F.action("mredit",function(id){ var r=(R.list||[]).find(function(x){ return x.id===id; }); if(!r) return; R.edit=JSON.parse(JSON.stringify(r)); R.prev=null; paint(); });
F.action("mrback",function(){ R.edit=null; paint(); });
F.listen("input","[data-mrc],[data-mrn]",function(el){ if(!R.edit) return; if(el.hasAttribute("data-mrn")) R.edit.name=el.value; else R.edit.cond[el.getAttribute("data-mrc")]=el.value; });
F.listen("change","[data-mrc]",function(el){ if(R.edit) R.edit.cond[el.getAttribute("data-mrc")]=el.value; });
F.listen("change","[data-mrcb]",function(el){ if(R.edit) R.edit.cond[el.getAttribute("data-mrcb")]=el.checked; });
F.listen("change","[data-mrab]",function(el){ if(R.edit) R.edit.act[el.getAttribute("data-mrab")]=el.checked; });
F.listen("change","[data-mra]",function(el){ if(R.edit) R.edit.act.move=el.value; });
F.listen("change","[data-mrs]",function(el){ if(R.edit) R.edit.stop=el.checked; });
F.listen("change","[data-mrtog]",function(el){ var r=(R.list||[]).find(function(x){ return x.id===el.getAttribute("data-mrtog"); }); if(!r) return; r.active=el.checked; F.api("/admin/api/mail-rules",{body:{confirm:true,op:"save",rule:r}}).then(function(j){ F.toast(j&&j.ok?(el.checked?"Regel aktiv":"Regel pausiert"):((j&&j.error)||"Fehler"),!(j&&j.ok)); load(); }); });
function err(t){ var e=document.getElementById("mrErr"); if(e) e.textContent=t||""; }
F.action("mrprev",function(){ err(""); F.api("/admin/api/mail-rules",{body:{confirm:true,op:"preview",rule:R.edit}}).then(function(j){ if(!j||!j.ok){ err((j&&j.error)||"Fehler"); return; } R.prev=j; var p=document.getElementById("mrPrev"); if(p) p.innerHTML=prevHtml(j); }); });
F.action("mrsave",function(){ err(""); F.api("/admin/api/mail-rules",{body:{confirm:true,op:"save",rule:R.edit}}).then(function(j){ if(!j||!j.ok){ err((j&&j.error)||"Fehler"); return; } F.toast("Regel gespeichert"); R.edit=null; load(); }); });
F.action("mrdel",function(id){ F.confirm("Regel löschen? Bereits sortierte Mails bleiben, wo sie sind.","Löschen",function(){ F.api("/admin/api/mail-rules",{body:{confirm:true,op:"delete",id:id}}).then(function(){ F.actions.mailrules(); }); },true); });
F.action("mrup",function(i){ i=+i; var L=(R.list||[]).slice(); if(i<1) return; var x=L[i]; L[i]=L[i-1]; L[i-1]=x; R.list=L; paint(); F.api("/admin/api/mail-rules",{body:{confirm:true,op:"order",ids:L.map(function(r){ return r.id; })}}); });
F.action("mrapply",function(id){ var r=(R.list||[]).find(function(x){ return x.id===id; }); if(!r) return;
  F.api("/admin/api/mail-rules",{body:{confirm:true,op:"preview",id:id}}).then(function(p){ if(!p||!p.ok){ F.toast((p&&p.error)||"Fehler",true); return; }
    if(!p.count){ F.toast("Keine passenden Mails im Posteingang"); return; }
    F.confirm("„"+r.name+"“ jetzt auf "+p.count+" Mail"+(p.count===1?"":"s")+" im Posteingang anwenden? ("+summary(r).split("→")[1].trim()+")","Anwenden",function(){
      F.api("/admin/api/mail-rules",{body:{confirm:true,op:"apply",id:id}}).then(function(j){ F.toast(j&&j.ok?j.count+" Mails bearbeitet":((j&&j.error)||"Fehler"),!(j&&j.ok)); if(F.M&&F.M.scheduleReload) F.M.scheduleReload(800); F.actions.mailrules(); }); },!!(r.act.trash||r.act.spam)); }); });
F.css('.mr-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}.mr-row.off .mr-main{opacity:.55}.mr-main{display:grid;gap:2px;min-width:0}.mr-main b{overflow-wrap:anywhere}.mr-main span{font-size:13px;color:var(--ink-2);overflow-wrap:anywhere;text-wrap:pretty}.mr-main i{font-style:normal;font-size:12px;color:var(--ink-3)}'+
 '.mr-btns .btn.icon svg{width:15px;height:15px}.mr-btns .mr-del:hover{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 45%,transparent)}'+
 '.mr-empty{display:grid;gap:4px;justify-items:center;text-align:center;padding:26px 16px;color:var(--ink-3);font-size:13.5px;border:1px dashed var(--line);border-radius:14px}.mr-empty b{color:var(--ink);font-size:15px}'+
 '.mr-btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.mr-sw{position:relative;width:36px;height:20px;display:inline-block}.mr-sw input{opacity:0;width:0;height:0}.mr-sw span{position:absolute;inset:0;border-radius:99px;background:var(--line-2,var(--line));cursor:pointer;transition:.2s}.mr-sw span:before{content:"";position:absolute;width:16px;height:16px;left:2px;top:2px;border-radius:50%;background:#fff;transition:.2s}.mr-sw input:checked+span{background:var(--ok)}.mr-sw input:checked+span:before{transform:translateX(16px)}.mr-sw input:focus-visible+span{outline:2px solid var(--glow);outline-offset:2px}'+
 '.mr-ed{display:grid;gap:10px}.mr-sec{font-weight:600;margin-top:6px}.mr-prev{background:var(--sunk);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;gap:4px;font-size:13px;overflow-wrap:anywhere}.mr-prev span{color:var(--ink-3)}'+
 '@media (max-width:700px){.mr-row{grid-template-columns:auto minmax(0,1fr)}.mr-btns{grid-column:1/-1;justify-content:flex-start}.mr-btns .btn{min-height:42px}.mr-sw{width:44px;height:26px}.mr-sw span:before{width:22px;height:22px}.mr-sw input:checked+span:before{transform:translateX(18px)}}'+
 '@media (prefers-reduced-motion:reduce){.mr-sw span,.mr-sw span:before{transition:none}}');
})();
