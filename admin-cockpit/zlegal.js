/* Rechtliches: Vertraulichkeitsvereinbarungen (NDA) online unterschreiben lassen.
   Link anlegen (optional mit Firma/Name, E-Mail, Projekt, Vertragsstrafe) → kopieren oder per Mail senden → Gegenpartei unterschreibt unter /nda/<token>
   → PDF an beide. Daten: /admin/api/nda/list, …/create, …/op (mail, revoke, reactivate, delete), …/pdf?id= (Server: nda.js). */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
F.icons.legal='<path d="M12 3.5v17M7.5 20.5h9M5 7h14"/><path d="M12 5.2 5 7M12 5.2 19 7"/><path d="m5 7-2.6 6.2a2.8 2.8 0 0 0 5.2 0z"/><path d="m19 7-2.6 6.2a2.8 2.8 0 0 0 5.2 0z"/>';
var ST=null, busy=false, at=0;
var TAG={open:"warn",signed:"ok",revoked:"grey"};
F.css('.lg-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 18px;border-top:1px solid var(--line)}.lg-row:first-child{border-top:0}.lg-row b{display:block;overflow-wrap:anywhere}.lg-row .muted{display:block;overflow-wrap:anywhere}'+
  '.lg-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.lg-acts .btn{padding:5px 10px;font-size:12.5px}@media(max-width:760px){.lg-row{grid-template-columns:minmax(0,1fr)}.lg-acts{justify-content:flex-start}}'+
  '.lg-link{display:flex;gap:8px;align-items:center}.lg-link input{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}.lg-note{font-size:13px;line-height:1.5}');
function load(){ if(busy) return; busy=true; F.api("/admin/api/nda/list").then(function(j){ busy=false; at=Date.now(); ST=j&&j.ok?j:{ok:false,error:(j&&j.error)||"Fehler",items:[]}; if(F.current==="legal") F.render(); }).catch(function(){ busy=false; ST={ok:false,error:"Nicht erreichbar",items:[]}; if(F.current==="legal") F.render(); }); }
function dt(iso){ return iso?new Date(iso).toLocaleString("de-AT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):""; }
function item(id){ return ((ST&&ST.items)||[]).find(function(x){ return x.id===id; }); }
function row(x){
  var when=x.status==="signed"?"unterschrieben "+dt(x.signedAt):x.status==="revoked"?"widerrufen "+dt(x.revokedAt):"erstellt "+dt(x.createdAt)+((x.mails||[]).length?" · gesendet an "+x.mails[x.mails.length-1].to:"");
  var a='<button class="btn" data-act="lgcopy:'+esc(x.id)+'">Link kopieren</button>';
  if(x.status==="signed") a+='<a class="btn" href="/admin/api/nda/pdf?id='+encodeURIComponent(x.id)+'" target="_blank" rel="noopener">PDF ansehen</a><a class="btn" href="/admin/api/nda/pdf?id='+encodeURIComponent(x.id)+'&amp;dl=1">Download</a>';
  if(x.status==="open") a+='<button class="btn" data-act="lgmail:'+esc(x.id)+'">Per Mail senden</button>';
  a+=x.status==="revoked"?'<button class="btn" data-act="lgreact:'+esc(x.id)+'">Reaktivieren</button>':'<button class="btn" data-act="lgrevoke:'+esc(x.id)+'">'+(x.status==="signed"?"Widerrufen":"Deaktivieren")+'</button>';
  if(x.status!=="signed"&&!x.signedAt) a+='<button class="btn icon" data-act="lgdel:'+esc(x.id)+'" title="Löschen" aria-label="Löschen">✕</button>';
  return '<div class="lg-row"><span><b>'+esc(x.party||"Gegenpartei noch offen")+' <span class="tag '+(TAG[x.status]||"grey")+'">'+esc(x.statusText)+'</span></b><span class="muted">'+esc(x.project||"Projekt noch offen")+(x.term?' · Gültigkeit: '+esc(x.term)+' + 3 Jahre':'')+(x.penalty?' · Vertragsstrafe '+esc(x.penalty):'')+(x.status==="signed"&&(x.mailed||[]).length<2?' · <b>PDF-Mail '+((x.mailed||[]).length?'teilweise':'nicht')+' versendet</b>':'')+'</span></span>'+
    '<span class="muted">'+esc(when)+(x.email?'<br>'+esc(x.email):'')+'</span><span class="lg-acts">'+a+'</span></div>';
}
function render(){
  var head=F.head("Rechtliches","Vertraulichkeitsvereinbarungen online unterschreiben lassen",'<button class="btn primary" data-act="lgnew">Neue Vertraulichkeitsvereinbarung</button><button class="btn" data-act="lgreload">Aktualisieren</button>');
  if(!ST){ load(); return head+'<div class="empty">Lade …</div>'; }
  if(!ST.ok) return head+'<div class="notice">'+esc(ST.error)+' <button class="btn" data-act="lgreload">Neu laden</button></div>';
  var L=ST.items||[], n={open:0,signed:0,revoked:0}; L.forEach(function(x){ n[x.status]=(n[x.status]||0)+1; });
  var note='<div class="notice lg-note"><span><b>Hinweis:</b> Die Vorlage '+esc(ST.version)+' (gegenseitige Vertraulichkeitsvereinbarung, österreichisches Recht) ist keine Rechtsberatung. Lass sie bitte einmal von einer Anwältin bzw. einem Anwalt prüfen, bevor du sie breit einsetzt.</span></div>';
  var info='<p class="muted" style="margin:10px 2px">'+n.open+' offen · '+n.signed+' unterschrieben · '+n.revoked+' widerrufen'+(ST.mail?' · Kopien gehen an '+esc(ST.office):' · <b>Mailversand nicht eingerichtet</b>')+(ST.db?'':' · ohne Datenbank (Dateispeicher)')+'</p>';
  return head+note+info+'<section class="panel">'+(L.length?L.map(row).join(""):'<div class="empty">Noch keine Vereinbarungen. Leg mit „Neue Vertraulichkeitsvereinbarung“ einen Link an.</div>')+'</section>';
}
function copy(text){
  function fb(){ var t=document.createElement("textarea"); t.value=text; t.setAttribute("readonly",""); t.style.position="fixed"; t.style.opacity="0"; document.body.appendChild(t); t.select(); var ok=false; try{ ok=document.execCommand("copy"); }catch(e){} t.remove(); F.toast(ok?"Link kopiert":"Kopieren nicht möglich – bitte manuell markieren",!ok); }
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){ F.toast("Link kopiert"); },fb); else fb();
}
function upsert(it){ if(!ST||!ST.items) return; var i=ST.items.findIndex(function(x){ return x.id===it.id; }); if(i>-1) ST.items[i]=it; else ST.items.unshift(it); }
function op(o,msg){ return F.api("/admin/api/nda/op",{body:Object.assign({confirm:true},o)}).then(function(j){ if(!j||!j.ok){ F.toast((j&&j.error)||"Fehler",true); return null; } if(j.item) upsert(j.item); else if(o.op==="delete"&&ST) ST.items=ST.items.filter(function(x){ return x.id!==o.id; }); F.toast(msg); F.render(); return j; }); }
function linkDialog(x){
  F.modal('<div class="row-between"><h2 style="font-size:20px">Link erstellt</h2>'+F.btnClose()+'</div><p style="margin:0">Schick diesen Link an '+esc(x.party||"die Gegenpartei")+'. Er ist nur für diese eine Vereinbarung gültig und kann nur einmal unterschrieben werden.</p>'+
    '<div class="lg-link"><input class="f" id="lgUrl" readonly value="'+esc(x.url)+'"><button class="btn primary" data-act="lgcopy:'+esc(x.id)+'">Kopieren</button></div>'+
    '<label class="fl">Per Mail senden an<input class="f" id="lgTo" type="email" value="'+esc(x.email||"")+'" placeholder="name@firma.at"></label>'+
    '<div class="foot"><a class="btn" href="'+esc(x.url)+'" target="_blank" rel="noopener">Seite öffnen</a><span class="row"><button type="button" class="btn" data-closemodal>Fertig</button>'+(ST&&ST.mail?'<button class="btn primary" data-act="lgmailto:'+esc(x.id)+'">Per Mail senden</button>':'')+'</span></div>',"wide");
}
function mailConfirm(id,to){
  var x=item(id); if(!x) return; to=String(to||x.email||"").trim();
  if(!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)){ F.toast("Bitte eine gültige E-Mail-Adresse angeben",true); return; }
  F.confirm("Link zur Vertraulichkeitsvereinbarung"+(x.project?" „"+x.project+"“":"")+" jetzt an "+to+" senden?","Senden",function(){ op({op:"mail",id:id,to:to},"Mail gesendet an "+to); });
}
F.action("lgreload",function(){ ST=null; F.render(); });
F.action("lgcopy",function(id){ var x=item(id); if(x) copy(x.url); });
F.action("lgmail",function(id){ var x=item(id); if(!x) return; if(x.email) return mailConfirm(id,x.email); linkDialog(x); });
F.action("lgmailto",function(id){ var el=document.getElementById("lgTo"); mailConfirm(id,el?el.value:""); });
F.action("lgrevoke",function(id){ var x=item(id); if(!x) return; F.confirm(x.status==="signed"?"Vereinbarung als widerrufen markieren? Der Link zeigt danach weder Vertrag noch PDF an.":"Link deaktivieren? Die Gegenpartei kann dann nicht mehr unterschreiben.",x.status==="signed"?"Widerrufen":"Deaktivieren",function(){ op({op:"revoke",id:id},x.status==="signed"?"Widerrufen":"Link deaktiviert"); },true); });
F.action("lgreact",function(id){ op({op:"reactivate",id:id},"Link wieder aktiv"); });
F.action("lgdel",function(id){ F.confirm("Diese (nicht unterschriebene) Vereinbarung endgültig löschen? Der Link funktioniert danach nicht mehr.","Löschen",function(){ op({op:"delete",id:id},"Gelöscht"); },true); });
F.action("lgnew",function(){
  F.modal('<form data-form="lgnew" class="stackf"><div class="row-between"><h2 style="font-size:20px">Neue Vertraulichkeitsvereinbarung</h2>'+F.btnClose()+'</div>'+
    '<p class="muted" style="margin:0">Alles optional – die Gegenpartei ergänzt ihre Daten selbst. Der Projektname ist nur ein Vorschlag, den sie ändern kann.</p>'+
    '<div class="grid2"><label class="fl">Firma<input class="f" name="company" maxlength="120" placeholder="z. B. Muster GmbH"></label><label class="fl">Name<input class="f" name="name" maxlength="100" placeholder="Vor- und Nachname"></label>'+
    '<label class="fl">E-Mail<input class="f" name="email" type="email" maxlength="160" placeholder="name@firma.at"></label><label class="fl">Projektname<input class="f" name="project" maxlength="140" placeholder="z. B. Relaunch Website"></label></div>'+
    '<label class="fl">Vertragsstrafe pro Verstoß (€, optional)<input class="f" name="penalty" inputmode="decimal" placeholder="leer = keine Vertragsstrafe"></label>'+
    '<p class="muted" style="margin:0">Mit Betrag wird eine Vertragsstrafe-Klausel (§ 11 Abs. 2) aufgenommen. Sie unterliegt dem richterlichen Mäßigungsrecht (§ 1336 Abs. 2 ABGB) – besonders bei Verbrauchern kann ein Gericht sie herabsetzen. Ohne Betrag gelten nur die gesetzlichen Ansprüche.</p>'+
    '<div class="foot"><span class="muted">Link: www.fs-creative.at/nda/…</span><span class="row"><button type="button" class="btn" data-closemodal>Abbrechen</button><button class="btn primary" type="submit">Link erstellen</button></span></div><div class="err" id="lgErr"></div></form>',"wide");
});
F.form("lgnew",function(f){
  var btn=f.querySelector("[type=submit]"), err=document.getElementById("lgErr"); btn.disabled=true; err.textContent="";
  F.api("/admin/api/nda/create",{body:{company:f.company.value,name:f.name.value,email:f.email.value,project:f.project.value,penalty:f.penalty.value}}).then(function(j){
    btn.disabled=false; if(!j||!j.ok){ err.textContent=(j&&j.error)||"Fehler"; return; } upsert(j.item); F.render(); linkDialog(j.item); }).catch(function(){ btn.disabled=false; err.textContent="Keine Verbindung."; });
});
F.view({id:"legal",label:"Rechtliches",short:"Recht",icon:"legal",order:75,render:render,after:function(){ if(!ST||Date.now()-at>60000) load(); }});
})();
