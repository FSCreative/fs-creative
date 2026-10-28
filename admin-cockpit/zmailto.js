/* E-Mail-Links bleiben im Cockpit: Klick auf „mailto:“ (Druckauftrag, Kunden, Marketing, auch Links in gelesenen Mails)
   öffnet das eigene Verfassen-Fenster statt Outlook bzw. Apple Mail. Ohne F.compose (Modul fehlt) bleibt das normale Verhalten. */
(function(){
"use strict";
var F=window.FSC;

/* mailto:a@b.at,c@d.at?subject=…&cc=…&body=… → {to, subject, cc, bcc, text} */
function parse(href){
  var m=String(href||"").match(/^mailto:([^?]*)(?:\?(.*))?$/i); if(!m) return null;
  var dec=function(s){ try{ return decodeURIComponent(String(s||"").replace(/\+/g,"%20")); }catch(e){ return String(s||""); } };
  var o={to:dec(m[1]).split(/[,;]/).map(function(s){ return s.trim(); }).filter(Boolean).join(", ")};
  String(m[2]||"").split("&").forEach(function(kv){ var i=kv.indexOf("="); if(i<1) return; var k=kv.slice(0,i).toLowerCase(), v=dec(kv.slice(i+1));
    if(k==="subject") o.subject=v; else if(k==="cc") o.cc=v; else if(k==="bcc") o.bcc=v; else if(k==="body") o.text=v; else if(k==="to") o.to=o.to?o.to+", "+v:v; });
  return o;
}
function handle(e){
  if(e.defaultPrevented||e.button>0) return;
  var a=e.target&&e.target.closest?e.target.closest('a[href^="mailto:" i]'):null; if(!a||typeof F.compose!=="function") return;
  var pre=parse(a.getAttribute("href")); if(!pre) return;
  e.preventDefault(); e.stopPropagation();
  if(F.closeModal&&a.closest(".modal")&&!a.closest("#mcompose")) F.closeModal();
  F.compose(pre);
}
document.addEventListener("click",handle,true);
/* Mail-Vorschau (iframe, gleiche Herkunft, ohne Skripte): Klicks dort ebenfalls abfangen */
document.addEventListener("load",function(e){
  var f=e.target; if(!f||f.tagName!=="IFRAME") return;
  try{ var d=f.contentDocument; if(d&&!d.__fscMailto){ d.__fscMailto=1; d.addEventListener("click",handle,true); } }catch(err){}
},true);
F.mailtoParse=parse;
})();
