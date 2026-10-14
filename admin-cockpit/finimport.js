/* Finanzen › Firma & Einstellungen: Firmendaten für Rechnungen, Mahnungen und Angebote. */
(function(){
"use strict";
var F=window.FSC;
var ST={m:null,sc:null};
function loadMode(){ F.api("/admin/api/fin/mode").then(function(j){ ST.m=j||{}; F.render(); }); F.api("/admin/api/fin/obj?type=SevClient").then(function(j){ ST.sc=(j&&j.objects&&j.objects[0])||{}; F.render(); }); }
var FIRM=[["name","Firma"],["owner","Inhaber"],["street","Straße"],["zip","PLZ"],["city","Ort"],["country","Land"],["phone","Telefon"],["email","E-Mail"],["web","Website"],["bank","Bank"],["iban","IBAN"],["bic","BIC"],["uid","UID-Nummer"],["taxNumber","Steuernummer"],["court","Firmenbuch/Gericht"],["contactPerson","Ansprechpartner"]];
function firmDefaults(){ var c=ST.sc||{}; var ib=String(c.bankIban||"").replace(/\s+/g,"").replace(/(.{4})/g,"$1 ").trim(); return {name:c.name||"FS Creative",owner:c.ceoName||"Simon Felder",street:c.addressStreet||"",zip:c.addressZip||"",city:c.addressCity||"",country:"Österreich",phone:c.contactPhone||"",email:"office@fs-creative.at",web:c.website||"",bank:c.bank||"",iban:ib,bic:c.bankBic||"",uid:c.vatNumber||"",taxNumber:c.taxNumber||"",court:c.districtCourt||"",contactPerson:c.ceoName||"Simon Felder"}; }
function firmPanel(){
  if(!ST.m){ loadMode(); return ""; }
  var f=ST.m.firm||firmDefaults();
  return '<section class="panel"><div class="panel-h"><h2>Firmendaten für Rechnungen</h2>'+(ST.m.firm?'<span class="tag ok">gespeichert</span>':'<span class="tag warn">bitte prüfen & speichern</span>')+'</div>'+
    '<form data-form="finfirm" class="stackf" style="padding:16px"><p class="muted" style="margin:0">Erscheinen im Kopf und in der Fußzeile jeder Rechnung, Mahnung und jedes Angebots.</p>'+
    '<div class="grid2">'+FIRM.map(function(x){ return '<label class="fl">'+x[1]+'<input class="f" name="'+x[0]+'" value="'+F.esc(f[x[0]]||"")+'"></label>'; }).join("")+'</div>'+
    '<div class="foot"><span></span><button class="btn primary" type="submit">Firmendaten speichern</button></div></form></section>';
}
F.form("finfirm",function(f){ var b={}; FIRM.forEach(function(x){ b[x[0]]=f[x[0]].value.trim(); }); F.api("/admin/api/fin/firm",{body:b}).then(function(j){ if(j&&j.ok){ ST.m.firm=j.firm; F.toast("Firmendaten gespeichert"); F.render(); } else F.toast((j&&j.error)||"Fehler",true); }); });
(F.geldTab||function(t){ (F._pendTabs=F._pendTabs||[]).push(t); })({id:"umstieg",label:"Firma & Einstellungen",order:90,sub:"Firmendaten für Rechnungen, Mahnungen und Angebote.",render:function(){ return firmPanel(); }});
})();
