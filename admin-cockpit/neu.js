/* „+ Neu“ in der Kopfzeile (Look „Montafon Night“): ein Menü für alles, was man neu anlegt – Mail, Termin, Aufgabe, Auftrag, Rechnung, Angebot, Kunde.
   Taste N öffnet das Menü (außer beim Tippen und im Kalender, dort ist N „Neuer Termin“), Esc oder ein Klick daneben schließt es. */
(function(){
"use strict";
var F=window.FSC;
F.icons.offer=F.icons.offer||'<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>';
F.icons.plus=F.icons.plus||'<path d="M12 5v14M5 12h14"/>';
var ITEMS=[["post","Neue Mail","compose"],["kal","Neuer Termin","newevent:"],["check","Neue Aufgabe","tknew:"],["board","Neuer Auftrag","newproj"],"-",["euro","Neue Rechnung","newinvoice"],["offer","Neues Angebot","newoffer"],["kunden","Neuer Kunde / Lead","newlead"]];
var menu=null;
function close(){ if(menu){ menu.remove(); menu=null; document.removeEventListener("mousedown",outside,true); } }
function outside(e){ if(menu&&!menu.contains(e.target)&&!e.target.closest(".tb-new")) close(); }
function open(anchor){
  close(); menu=document.createElement("div"); menu.className="nmenu"; menu.setAttribute("role","menu");
  menu.innerHTML=ITEMS.filter(function(x){ return x==="-"||F.actions[x[2].split(":")[0]]; }).map(function(x){ return x==="-"?'<hr>':'<button type="button" role="menuitem" data-nmenu="'+F.esc(x[2])+'">'+F.svg(x[0])+'<span>'+F.esc(x[1])+'</span></button>'; }).join("");
  document.body.appendChild(menu);
  var r=anchor?anchor.getBoundingClientRect():{right:window.innerWidth-24,bottom:70};
  menu.style.top=Math.round(r.bottom+8)+"px"; menu.style.left=Math.max(12,Math.round(r.right-menu.offsetWidth))+"px";
  document.addEventListener("mousedown",outside,true);
  var first=menu.querySelector("button"); if(first) first.focus();
}
F.action("newmenu",function(v,el){ if(menu){ close(); return; } open(el||document.querySelector(".tb-new")); });
F.action("newproj",function(){ if(F.current!=="auftraege") F.go("auftraege"); if(F.actions.tkprojnew) F.actions.tkprojnew(); });
document.addEventListener("click",function(e){ var b=e.target.closest&&e.target.closest("[data-nmenu]"); if(!b) return; e.preventDefault(); var s=b.getAttribute("data-nmenu"), i=s.indexOf(":"), k=i>-1?s.slice(0,i):s, v=i>-1?s.slice(i+1):""; close(); if(F.actions[k]) F.actions[k](v,b,e); });
document.addEventListener("keydown",function(e){
  if(menu&&e.key==="Escape"){ close(); return; }
  if(menu&&(e.key==="ArrowDown"||e.key==="ArrowUp")){ e.preventDefault(); var l=[].slice.call(menu.querySelectorAll("button")), i=l.indexOf(document.activeElement); l[(i+(e.key==="ArrowDown"?1:-1)+l.length)%l.length].focus(); return; }
  var t=e.target, typing=t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT"||t.isContentEditable);
  if(!typing&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&(e.key==="n"||e.key==="N")&&!(F.modalOpen&&F.modalOpen())&&window.innerWidth>900&&F.current!=="kal"){ e.preventDefault(); open(document.querySelector(".tb-new")); }
});
window.addEventListener("resize",close);
})();
