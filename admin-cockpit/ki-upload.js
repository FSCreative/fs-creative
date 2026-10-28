/* KI (Claude) – Beleg scannen/hochladen ohne Mail: Handykamera, Drag & Drop oder Dateiauswahl.
   Ein Fenster, ein Klick: nach dem Foto läuft „Scanne … · Lese Beleg …“ direkt im Fenster, danach zeigt jede Datei ein kompaktes
   Prüfblatt (Vorschaubild, Lieferant, Datum, Betrag, Steuer, Kategorie, Beschreibung – bei hoher KI-Sicherheit eingeklappt) und
   gleich die passende offene Bankbuchung (/admin/api/fin/suggest?amount=…). Die Buchung ist nur vorausgewählt – verbunden wird erst
   mit „Speichern & verbinden“ (nie automatisch). Gespeichert wird als offener Beleg (fertig erfasst) mit Datei; „Als Entwurf
   speichern“ legt wie früher nur einen Entwurf an. Liest die KI nicht (nicht eingerichtet, Limit, Fehler), bleibt das Blatt mit
   leeren Feldern und Bild – dann selbst ausfüllen. Einstieg: Finanzen → „Beleg scannen“/„Beleg erfassen“ und Ansicht „KI“. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc;
var K=F.KI=F.KI||{};
var UQ=[], busy=false, seq=0, MODE="upload", CATS=null, TAKEN={}, SUGT={};
var MAXB=15*1024*1024, RATES=[20,13,10,0], HIGH=0.85, MATCH=60;   /* Vorauswahl nur ab 60 – setzt seit fin-proposals.js einen passenden Namen im Buchungstext voraus (ohne Namen max. 55) */

function readAsDataURL(file){ return new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(){ res(String(r.result)); }; r.onerror=function(){ rej(new Error("Datei konnte nicht gelesen werden.")); }; r.readAsDataURL(file); }); }
/* Bilder: HEIC (falls der Browser es anzeigen kann) und große Fotos als JPEG (max. 2400 px, KI-Limit 5 MB) */
function prepImage(file){
  var heic=/\.(heic|heif)$/i.test(file.name)||/hei[cf]/i.test(file.type);
  if(!heic&&file.size<=3.5*1024*1024) return readAsDataURL(file).then(function(d){ return {name:file.name,mime:file.type,data:d}; });
  return new Promise(function(res,rej){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var s=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight)), c=document.createElement("canvas");
      c.width=Math.round(img.naturalWidth*s); c.height=Math.round(img.naturalHeight*s); c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
      res({name:file.name.replace(/\.[^.]+$/,"")+".jpg",mime:"image/jpeg",data:c.toDataURL("image/jpeg",0.85)});
    };
    img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error(heic?"HEIC-Fotos kann dieser Browser nicht umwandeln – bitte als JPG oder PDF hochladen (iPhone: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“).":"Bild konnte nicht gelesen werden.")); };
    img.src=url;
  });
}
function prep(file){
  if(file.size>MAXB) return Promise.reject(new Error("Größer als 15 MB."));
  if(/^image\//.test(file.type)||/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)) return prepImage(file);
  if(/pdf|xml/.test(file.type)||/\.(pdf|xml)$/i.test(file.name)) return readAsDataURL(file).then(function(d){ return {name:file.name,mime:file.type||"application/pdf",data:d}; });
  return Promise.reject(new Error("Dateityp nicht unterstützt (PDF, JPG, PNG, HEIC oder XML-Rechnung)."));
}

/* ---------- Warteschlange: nacheinander scannen → hochladen → KI liest ---------- */
function find(k){ return UQ.filter(function(x){ return x.key===k; })[0]; }
function pending(){ return UQ.some(function(x){ return x.status==="warte"||x.status==="scanne"||x.status==="lese"; }); }
function addFiles(list,scan){
  var fs=Array.prototype.slice.call(list||[]).slice(0,30); if(!fs.length) return;
  fs.forEach(function(f){ UQ.push({key:"u"+(++seq),file:f,name:f.name,size:f.size,status:"warte",scan:!!scan&&/^image\//.test(f.type||"image/")&&!/\.pdf$/i.test(f.name||""),f:{},cands:null,sel:""}); });
  if(!document.getElementById("kiUp")) K.openUpload(MODE); else paint();
  next();
}
function next(){
  if(busy) return; var it=UQ.filter(function(x){ return x.status==="warte"; })[0]; if(!it) return;
  busy=true; it.status=it.scan?"scanne":"lese"; paintItem(it);
  var p0=it.scan&&F.scanDoc?F.scanDoc(it.file).then(function(r){ it.cropped=r.cropped; return r; }).catch(function(){ return prep(it.file); }):prep(it.file);
  p0.then(function(p){
      if(/^image\//.test(p.mime||"")) it.thumb=p.data;
      it.status="lese"; paintItem(it);
      return K.api("beleg-upload",{filename:p.name,mime:p.mime,data:p.data,keep:true});
    })
    .then(function(j){ it.res=j; it.x=j.beleg||null; it.file=null; initForm(it); it.status="bereit"; it.open=!high(it); loadSug(it);
      if(!document.getElementById("kiUp")) F.toast("Beleg gelesen"+(it.x&&it.x.supplier?": "+it.x.supplier:""),false,"Prüfen",function(){ K.openUpload(MODE); }); })
    .catch(function(e){ it.status="fehler"; it.err=(e&&e.message)||"Fehler"; it.file=null; })
    .then(function(){ busy=false; paintItem(it); paintHead(); K.load(true); if(F.current==="ki") F.render(); next(); });
}

/* ---------- Formular-Zustand je Beleg ---------- */
function lastCat(){ try{ return String(localStorage.getItem("fsc_sev_cat")||"").replace(/^"|"$/g,""); }catch(e){ return ""; } }
function eurOk(x){ return !x||!x.currency||x.currency==="EUR"; }
function linesOf(x){ return ((x&&x.lines)||[]).filter(function(l){ return l.gross>0; }); }
function initForm(it){
  var x=it.x||{}, eur=eurOk(x), lines=linesOf(x), r=lines.length===1?lines[0].rate:(x.tax>0?20:0);
  it.f={supplier:x.supplier||"",date:x.invoiceDate||F.ymd(),gross:eur&&x.gross>0?(+x.gross).toFixed(2):"",
    rate:lines.length>1&&eur?"mix":String(RATES.indexOf(r)>-1?r:20),cat:x.accountingTypeId||lastCat()||"",
    desc:String((x.description||"")+(x.invoiceNumber&&String(x.description||"").indexOf(x.invoiceNumber)<0?" · Nr. "+x.invoiceNumber:"")).replace(/^ · /,"").slice(0,200)};
  if(!it.f.desc) it.f.desc=String(it.name||"").replace(/\.[^.]+$/,"").slice(0,200);
  it.f.rule=F.taxRuleOk(x.taxRule)?String(x.taxRule):"9"; if(F.taxRuleZero(it.f.rule)) it.f.rate="0";   /* Steuerliche Regel: KI-Vorschlag, sonst Vorsteuer abziehbar */
}
function num(v){ var n=parseFloat(String(v==null?"":v).replace(",",".")); return isFinite(n)?Math.round(n*100)/100:0; }
function catName(id){ var c=(CATS||[]).filter(function(t){ return t.id===id; })[0]; return c?c.name:""; }
function catOk(id){ return !!id&&(!CATS||CATS.some(function(t){ return t.id===id; })); }
function mixOk(it){ if(it.f.rate!=="mix") return true; var s=0; linesOf(it.x).forEach(function(l){ s+=+l.gross||0; }); return Math.abs(s-num(it.f.gross))<=0.02; }
function valid(it){ return num(it.f.gross)>0&&catOk(it.f.cat)&&mixOk(it); }
/* hohe KI-Sicherheit: Details eingeklappt, „Alle speichern“ erlaubt */
function high(it){ var x=it.x; return !!x&&(+x.confidence||0)>=HIGH&&x.isInvoice!==false&&eurOk(x)&&!(it.res&&it.res.dupes&&it.res.dupes.length)&&valid(it); }
function taxTxt(it){
  var g=num(it.f.gross); if(!(g>0)) return "";
  if(F.taxRuleZero(it.f.rule)) return F.taxRuleName(it.f.rule)+" · 0 % (die UVA rechnet 20 %)";
  if(it.f.rule==="10") return "Keine Vorsteuer"+(+it.f.rate?" · "+it.f.rate+" % USt":"");
  if(it.f.rate==="mix") return linesOf(it.x).map(function(l){ return l.rate+" %: "+F.eur(l.gross); }).join(" · ");
  var r=+it.f.rate; return r?r+" % · VSt "+F.eur(g-g/(1+r/100)):"0 % · ohne VSt";
}

/* ---------- Passende Buchung (nur Vorschlag; verbunden wird erst mit Klick) ---------- */
function loadSug(it){
  var g=num(it.f.gross); if(!(g>0)){ it.cands=[]; it.sel=""; paintMatch(it); return; }
  var q="amount="+encodeURIComponent(g.toFixed(2))+"&date="+encodeURIComponent(it.f.date||"")+"&name="+encodeURIComponent(it.f.supplier||"")+"&desc="+encodeURIComponent(String(it.f.desc||"").slice(0,120))+"&cd=C", my=it.sugQ=q;
  it.cands=null; paintMatch(it);
  F.api("/admin/api/fin/suggest?"+q).then(function(j){
    if(it.sugQ!==my) return;
    it.cands=(j&&j.ok?(j.candidates||[]):[]).filter(function(c){ return c.type==="tx"&&!TAKEN[c.id]; });
    if(it.sel&&!it.cands.some(function(c){ return c.id===it.sel; })) it.sel="";
    if(!it.selManual){ var top=it.cands[0], used=UQ.some(function(y){ return y!==it&&y.status!=="erledigt"&&y.sel&&top&&y.sel===top.id; });
      it.sel=top&&top.score>=MATCH&&!used?top.id:""; }
    paintMatch(it); paintFoot(it);
  }).catch(function(){ if(it.sugQ!==my) return; it.cands=[]; paintMatch(it); });
}
function candOf(it,id){ return (it.cands||[]).filter(function(c){ return c.id===id; })[0]; }
function candTxt(c){ return '<b>'+esc(c.name||"Umsatz")+'</b> · <span class="money">'+F.eur(c.amount)+'</span> · '+esc(F.de(c.date))+(c.account?' · '+esc(c.account):''); }
function matchHtml(it){
  if(it.cands===null) return '<span class="muted small">'+spin()+' Suche passende Buchung …</span>';
  if(!it.cands.length) return '<span class="muted small">Keine offene Bankbuchung mit diesem Betrag – zuordnen geht auch später unter Finanzen.</span>';
  var c=it.sel&&candOf(it,it.sel);
  if(c&&!it.showAll) return '<div class="kq-hit"><span class="kq-ok">✓</span><div class="kq-hl"><div>Passende Buchung: '+candTxt(c)+'</div><span class="muted small">'+esc((c.reasons||[]).join(" · "))+'</span></div>'+
    '<button type="button" class="kq-link" data-act="kqm:'+it.key+'~list">ändern</button></div>';
  return '<div class="kq-cl"><span class="muted small">'+(c?'Buchung wählen':'Mögliche Buchung – zum Verbinden antippen')+'</span>'+
    it.cands.map(function(x){ var on=x.id===it.sel; return '<button type="button" class="kq-c'+(on?' on':'')+'" aria-pressed="'+on+'" data-act="kqm:'+it.key+'~pick~'+esc(x.id)+'"><span class="kq-r">'+(on?'✓':'')+'</span><span class="kq-hl"><span>'+candTxt(x)+'</span><span class="muted small">'+esc(x.sub||"")+'</span><span class="muted small">'+esc((x.reasons||[]).join(" · "))+'</span></span></button>'; }).join("")+
    '<button type="button" class="kq-c'+(!it.sel?' on':'')+'" aria-pressed="'+(!it.sel)+'" data-act="kqm:'+it.key+'~none"><span class="kq-r">'+(!it.sel?'✓':'')+'</span><span class="kq-hl"><span>Keine Buchung verbinden</span></span></button></div>';
}

/* ---------- Darstellung ---------- */
function spin(){ return '<span class="kq-spin" aria-hidden="true"></span>'; }
function thumbHtml(it){
  var inner=it.thumb?'<img src="'+esc(it.thumb)+'" alt="">':'<span class="kq-pdf">'+esc((String(it.name||"").split(".").pop()||"PDF").toUpperCase().slice(0,4))+'</span>';
  return it.res&&it.res.uploadId?'<button type="button" class="kq-thumb" data-act="kqview:'+it.key+'" title="Beleg ansehen" aria-label="Beleg ansehen">'+inner+'</button>':'<span class="kq-thumb">'+inner+'</span>';
}
function catOpts(sel){
  if(!CATS) return '<option value="'+esc(sel||"")+'">Kategorien werden geladen …</option>';
  var used=CATS.filter(function(t){ return t.used>0; }), rest=CATS.filter(function(t){ return !(t.used>0); }), o=function(t){ return '<option value="'+esc(t.id)+'"'+(t.id===sel?' selected':'')+'>'+esc(t.name)+'</option>'; };
  return '<option value="">Kategorie wählen …</option>'+(used.length?'<optgroup label="Häufig verwendet">'+used.map(o).join("")+'</optgroup>':'')+'<optgroup label="Alle Kategorien">'+rest.map(o).join("")+'</optgroup>';
}
function fieldsHtml(it){
  var f=it.f, k=it.key, a=' data-kq="'+k+'" data-k=';
  var rateOpts=(it.x&&linesOf(it.x).length>1&&eurOk(it.x)?'<option value="mix"'+(f.rate==="mix"?' selected':'')+'>Mehrere ('+linesOf(it.x).map(function(l){ return l.rate+" %"; }).join(" / ")+')</option>':'')+
    RATES.map(function(r){ return '<option value="'+r+'"'+(String(r)===f.rate?' selected':'')+'>'+r+' %</option>'; }).join("");
  return '<div class="kq-f">'+
    '<label class="fl kq-w">Lieferant<input class="f"'+a+'"supplier" list="mvContacts" value="'+esc(f.supplier)+'" autocomplete="off"></label>'+
    '<label class="fl">Datum<input class="f"'+a+'"date" type="date" value="'+esc(f.date)+'"></label>'+
    '<label class="fl">Betrag brutto (€)<input class="f num"'+a+'"gross" type="number" step="0.01" min="0.01" inputmode="decimal" value="'+esc(f.gross)+'"></label>'+
    '<label class="fl">Steuersatz<select class="f"'+a+'"rate"'+(F.taxRuleZero(f.rule)?' disabled title="Bei dieser Regel steht keine österr. USt auf der Rechnung"':'')+'>'+rateOpts+'</select></label>'+
    F.taxRuleSelect('data-kq="'+k+'" data-k="rule" data-rate="[data-k=rate]"',f.rule).replace('class="fl trl"','class="fl trl kq-w"')+
    '<label class="fl">Kategorie<select class="f kq-cat"'+a+'"cat">'+catOpts(f.cat)+'</select></label>'+
    '<label class="fl kq-w">Beschreibung<input class="f"'+a+'"desc" maxlength="200" value="'+esc(f.desc)+'"></label></div>';
}
function sumHtml(it){
  var f=it.f, x=it.x, g=num(f.gross), cn=catName(f.cat)||(x&&x.accountingTypeId===f.cat?x.accountingTypeName:"");
  return '<b class="kq-sup">'+esc(f.supplier||"Lieferant fehlt")+'</b><span class="kq-amt money">'+(g>0?F.eur(g):'<span class="bad-t">Betrag fehlt</span>')+'</span>'+
    '<span class="muted small">'+esc(F.de(f.date)||"ohne Datum")+(taxTxt(it)?' · '+esc(taxTxt(it)):'')+'</span>'+
    '<span class="muted small">'+(cn?esc(cn):'<span class="bad-t">Kategorie fehlt</span>')+(f.desc?' · '+esc(f.desc):'')+'</span>'+
    '<span class="kitags">'+(x?K.conf(x.confidence):'<span class="tag grey">ohne KI</span>')+(x&&x.invoiceNumber?'<span class="tag grey">Nr. '+esc(x.invoiceNumber)+'</span>':'')+'</span>';
}
function notesHtml(it){
  var x=it.x, r=it.res||{}, out="";
  if(!x) out+='<div class="kq-warn">'+esc(r.kiError?"KI konnte den Beleg nicht lesen: "+r.kiError:"Keine KI-Daten")+' – bitte die Felder selbst ausfüllen.</div>';
  else {
    if(!eurOk(x)) out+='<div class="kq-warn">Rechnung in '+esc(x.currency)+' ('+esc(String(x.gross))+' '+esc(x.currency)+') – bitte den Euro-Betrag laut Kontoauszug eintragen.</div>';
    if(x.isInvoice===false) out+='<div class="kq-warn">Laut KI ist das vermutlich keine Rechnung.</div>';
    if(x.notes&&it.open) out+='<div class="muted small">'+esc(x.notes)+'</div>';
  }
  return out+(K.dupesHtml?K.dupesHtml(r.dupes):"");
}
function footHtml(it){
  var c=it.sel&&candOf(it,it.sel), dis=it.saving?' disabled':'';
  return '<button type="button" class="kq-link" data-act="kqsave:'+it.key+'~draft"'+dis+'>Als Entwurf speichern</button>'+
    '<button type="button" class="btn primary kq-go" data-act="kqsave:'+it.key+'"'+dis+'>'+(it.saving?spin()+' Speichere …':c?'Speichern &amp; verbinden':'Speichern')+'</button>';
}
function itemHtml(it){
  var k=it.key, st=it.status;
  if(st==="warte"||st==="scanne"||st==="lese") return '<div class="kq kq-busy" id="kq-'+k+'">'+thumbHtml(it)+'<div class="kq-hl"><b>'+spin()+' '+(st==="scanne"?"Scanne …":st==="lese"?"Lese Beleg …":"Wartet …")+'</b><span class="muted small">'+esc(it.name)+' · '+Math.max(1,Math.round(it.size/1024))+' KB</span></div></div>';
  if(st==="fehler") return '<div class="kq kq-busy" id="kq-'+k+'">'+thumbHtml(it)+'<div class="kq-hl"><b>'+esc(it.name)+'</b><span class="bad-t small">'+esc(it.err)+'</span></div><button type="button" class="btn icon" data-act="kiupdrop:'+k+'" title="Entfernen" aria-label="Entfernen">'+F.svg("close")+'</button></div>';
  if(st==="erledigt") return '<div class="kq kq-busy kq-done" id="kq-'+k+'">'+thumbHtml(it)+'<div class="kq-hl"><b><span class="kq-ok">✓</span> '+esc(it.f.supplier||it.name)+' · <span class="money">'+F.eur(num(it.f.gross))+'</span></b><span class="muted small">'+esc(it.doneTxt||"gespeichert")+'</span></div>'+(it.vid?'<button type="button" class="btn" data-act="sdvou:'+esc(it.vid)+'">Ansehen</button>':'')+'</div>';
  return '<div class="kq" id="kq-'+k+'"><div class="kq-top">'+thumbHtml(it)+'<div class="kq-sum" id="kqs-'+k+'">'+sumHtml(it)+'</div></div>'+notesHtml(it)+
    (it.open?fieldsHtml(it):'<button type="button" class="kq-link kq-more" data-act="kqopen:'+k+'">Details ändern</button>')+
    '<div class="kq-match" id="kqm-'+k+'">'+matchHtml(it)+'</div>'+
    '<div class="err small" id="kqe-'+k+'">'+esc(it.msg||"")+'</div><div class="kq-foot" id="kqf-'+k+'">'+footHtml(it)+'</div></div>';
}
function allOk(){ var r=UQ.filter(function(x){ return x.status==="bereit"; }); return r.length>=2&&!pending()&&r.every(high); }
function headHtml(){
  var r=UQ.filter(function(x){ return x.status==="bereit"; }).length, n=UQ.filter(function(x){ return x.status!=="fehler"; }).length, d=UQ.filter(function(x){ return x.status==="erledigt"; }).length;
  return (n>1?'<span class="muted small">'+d+' von '+n+' gespeichert</span>':'<span></span>')+(allOk()?'<button type="button" class="btn primary" data-act="kqall"'+(UQ.some(function(x){ return x.saving; })?' disabled':'')+'>Alle '+r+' speichern</button>':'');
}
function dropHtml(){
  return '<div class="kidrop" id="kiDrop" tabindex="0" role="button" aria-label="Dateien hier ablegen oder auswählen">'+F.svg("spark")+'<b>Belege hierher ziehen</b><span class="muted">PDF, JPG, PNG, HEIC oder XML-Rechnung · bis 15 MB · mehrere auf einmal</span>'+
    '<span class="row wrap" style="justify-content:center"><label class="btn primary">'+F.svg("upload")+'Dateien wählen<input type="file" id="kiFiles" multiple accept="application/pdf,image/*,.pdf,.xml,.heic,.heif" hidden></label>'+
    '<label class="btn">'+F.svg("camera")+'Foto aufnehmen<input type="file" id="kiCam" accept="image/*,application/pdf" capture="environment" multiple hidden></label></span></div>';
}
function bodyHtml(){
  var scan=MODE==="scan";
  return '<div class="stackf" id="kiUp"><div class="row-between"><h2 style="font-size:19px">'+(scan?"Beleg scannen":"Beleg hochladen (KI)")+'</h2>'+F.btnClose("data-closemodal autofocus")+'</div>'+
    (scan?'':'<p class="muted" style="margin:0">Claude liest Lieferant, Datum, Beträge und Steuer aus und sucht die passende Bankbuchung. Ein Klick speichert den Beleg (mit Datei) und verbindet ihn.</p>'+(K.st&&!K.st.configured?K.notSetHtml():'')+dropHtml())+
    '<div class="kq-head" id="kqHead">'+headHtml()+'</div>'+
    '<div class="kq-list" id="kqList">'+UQ.map(itemHtml).join("")+'</div>'+
    (scan?'<label class="kq-link kq-addcam">+ Weiteres Foto<input type="file" id="kiCam" accept="image/*,application/pdf" capture="environment" multiple hidden></label>':'')+
    '<datalist id="mvContacts"></datalist></div>';
}
function repl(id,html){ var n=document.getElementById(id); if(n) n.outerHTML=html; return !!n; }
function paint(){ var r=document.getElementById("kiUp"); if(r){ var l=document.getElementById("kqList"); if(l) l.innerHTML=UQ.map(itemHtml).join(""); paintHead(); } if(F.current==="ki") F.render(); }
function paintItem(it){ if(!document.getElementById("kiUp")) return; if(!repl("kq-"+it.key,itemHtml(it))) paint(); }
function paintHead(){ var h=document.getElementById("kqHead"); if(h) h.innerHTML=headHtml(); }
function paintMatch(it){ var n=document.getElementById("kqm-"+it.key); if(n) n.innerHTML=matchHtml(it); paintFoot(it); }
function paintFoot(it){ var n=document.getElementById("kqf-"+it.key); if(n) n.innerHTML=footHtml(it); var e=document.getElementById("kqe-"+it.key); if(e) e.textContent=it.msg||""; }
function paintSum(it){ var n=document.getElementById("kqs-"+it.key); if(n) n.innerHTML=sumHtml(it); paintHead(); }
function loadCats(){
  F.loadMeta(function(meta){
    if(meta&&meta.accountingTypes) CATS=meta.accountingTypes;
    else if(!CATS) CATS=[];
    Array.prototype.forEach.call(document.querySelectorAll("#kiUp .kq-cat"),function(s){ var it=find(s.getAttribute("data-kq")); if(it) s.innerHTML=catOpts(it.f.cat); });
    UQ.forEach(function(it){ if(it.status==="bereit"){ if(!it.open&&!high(it)){ it.open=true; paintItem(it); } else paintSum(it); } });
    var dl=document.getElementById("mvContacts"); if(dl&&meta&&meta.contacts) dl.innerHTML=meta.contacts.map(function(c){ return '<option value="'+esc(c.name)+'"></option>'; }).join("");
  });
}

/* ---------- Speichern: offener Beleg mit Datei + (falls gewählt) Buchung verbinden ---------- */
function save(it,draft){
  if(!it||it.status!=="bereit"||it.saving) return Promise.resolve(false);
  var f=it.f, x=it.x||{}, g=num(f.gross);
  it.msg="";
  if(!(g>0)) it.msg="Bitte den Rechnungsbetrag (brutto) eingeben.";
  else if(!catOk(f.cat)) it.msg="Bitte eine Kategorie wählen.";
  else if(!mixOk(it)) it.msg="Der Betrag passt nicht mehr zu den Steuersätzen – bitte einen Steuersatz wählen.";
  if(it.msg){ if(!it.open){ it.open=true; paintItem(it); } else paintFoot(it); return Promise.resolve(false); }
  var c=!draft&&it.sel&&candOf(it,it.sel);
  var body={uploadId:it.res.uploadId,mail:{filename:it.res.filename||x.filename||it.name},supplierName:String(f.supplier||"").trim(),date:f.date,description:String(f.desc||"").trim(),gross:g,
    taxRate:f.rate==="mix"?20:+f.rate,accountingTypeId:f.cat,open:!draft,confirm:true};
  if(f.rate==="mix") body.positions=linesOf(x).map(function(l){ return {gross:l.gross,taxRate:l.rate}; });
  if(x.deliveryFrom){ body.deliveryDate=x.deliveryFrom; if(x.deliveryTo) body.deliveryDateUntil=x.deliveryTo; }
  if(c) body.txId=c.id;
  try{ localStorage.setItem("fsc_sev_cat",f.cat); }catch(e){}
  it.saving=true; paintFoot(it); paintHead();
  return (K.sevVersion?K.sevVersion():Promise.resolve("")).then(function(ver){
    if(F.taxRuleOk(f.rule)) body.taxRule=f.rule;   /* gewählte steuerliche Regel (Server prüft, ob die Buchhaltung Regeln kennt) */
    return F.api("/admin/api/sevdesk/voucher",{body:body});
  }).then(function(j){
    it.saving=false;
    if(!j||!j.ok){ it.msg="Nicht gespeichert: "+((j&&j.error)||"unbekannter Fehler"); paintFoot(it); paintHead(); return false; }
    it.status="erledigt"; it.vid=j.id;
    if(j.booked){ TAKEN[c.id]=1; it.doneTxt="mit Buchung verbunden: "+(c.name||"Umsatz")+" · "+F.de(c.date);
      var S=F.sevState; if(S&&S.bank&&S.bank.transactions) S.bank.transactions=S.bank.transactions.filter(function(t){ return t.id!==c.id; });
      UQ.forEach(function(y){ if(y!==it&&y.status==="bereit"&&y.cands){ y.cands=y.cands.filter(function(z){ return z.id!==c.id; }); if(y.sel===c.id){ y.sel=""; y.selManual=false; } paintMatch(y); } }); }
    else it.doneTxt=draft?"als Entwurf gespeichert":j.opened?"gespeichert (offen)":"gespeichert";
    var msg=j.booked?"Beleg gespeichert und mit Buchung verbunden":draft?"Beleg als Entwurf gespeichert":"Beleg gespeichert";
    if(c&&!j.booked) F.toast("Beleg gespeichert – Buchung nicht verbunden: "+(j.bookError||j.openError||"unbekannter Fehler"),true);
    else if(!draft&&j.openError) F.toast("Beleg als Entwurf gespeichert – „fertig erfasst“ fehlgeschlagen: "+j.openError,true);
    else F.toast(msg);
    paintItem(it); paintHead(); afterSave();
    return true;
  }).catch(function(){ it.saving=false; it.msg="Keine Verbindung zum Server."; paintFoot(it); paintHead(); return false; });
}
var finT=null;
function afterSave(){
  clearTimeout(finT); finT=setTimeout(function(){ if(F.finAfterBook) F.finAfterBook(); if(F.finTxReset) F.finTxReset(); F.load(true); },300);
  if(!pending()&&!UQ.some(function(y){ return y.status==="bereit"||y.status==="fehler"; })) setTimeout(function(){ if(document.getElementById("kiUp")&&!pending()&&!UQ.some(function(y){ return y.status==="bereit"; })){ F.closeModal(); UQ=UQ.filter(function(y){ return y.status!=="erledigt"; }); if(F.current==="ki") F.render(); } },900);
}

/* ---------- Einstieg ---------- */
/* Handy-Scan: Kamera-Foto(s) direkt einlesen – Fortschritt und Prüfblatt im selben Fenster */
K.scan=function(files){ MODE="scan"; if(!document.getElementById("kiUp")) K.openUpload("scan"); addFiles(files,true); };
K.openUpload=function(mode){
  if(mode==="scan"||mode==="upload") MODE=mode; else MODE="upload";
  if(!document.getElementById("kiUp")) UQ=UQ.filter(function(y){ return y.status!=="erledigt"; });
  K.load(false); F.modal(bodyHtml(),"wide kqdlg"); loadCats();
};
/* Ansicht „KI“: Ablage + kurze Liste; geprüft wird im Fenster */
K.uploadPanelHtml=function(){
  var open=UQ.filter(function(x){ return x.status!=="erledigt"; });
  return K.panel("ki-upload","Beleg hochladen","Ohne Mail: Datei ablegen oder am Handy fotografieren","",dropHtml()+(open.length?'<div class="kilist">'+open.map(function(it){
    var st={warte:["grey","wartet"],scanne:["info","Scanne …"],lese:["info","Lese Beleg …"],bereit:["ok","bereit"],fehler:["bad","Fehler"]}[it.status]||["grey",it.status];
    return '<div class="kirow"><div class="kimain"><b>'+esc(it.f.supplier||it.name)+'</b> <span class="muted">'+esc(it.name)+'</span>'+(it.err?'<div class="bad-t" style="font-size:13px">'+esc(it.err)+'</div>':'')+'</div><div class="kiamt num money">'+(num(it.f.gross)?F.eur(num(it.f.gross)):'')+'</div>'+
      '<div class="row wrap"><span class="tag '+st[0]+'">'+st[1]+'</span>'+(it.status==="bereit"?'<button type="button" class="btn primary" data-act="kiupload">Prüfen &amp; speichern</button>':'')+'</div></div>'; }).join("")+'</div>':''));
};
F.action("kiupload",function(){ K.openUpload("upload"); });
F.listen("change","#kiFiles,#kiCam",function(el){ var fs=el.files; addFiles(fs,el.id==="kiCam"); el.value=""; });
F.listen("dragover","#kiDrop",function(el,e){ e.preventDefault(); el.classList.add("on"); });
F.listen("drop","#kiDrop",function(el,e){ e.preventDefault(); el.classList.remove("on"); if(e.dataTransfer&&e.dataTransfer.files) addFiles(e.dataTransfer.files,false); });
F.listen("keydown","#kiDrop",function(el,e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); var i=el.querySelector("#kiFiles"); if(i) i.click(); } });
F.action("kiupdrop",function(k){ UQ=UQ.filter(function(x){ return x.key!==k; }); paint(); });
/* alte Aktion (Links aus früheren Ansichten): öffnet das Fenster */
F.action("kiupopen",function(){ K.openUpload(MODE); });
F.action("kqview",function(k){ var it=find(k); if(!it||!it.res||!it.res.uploadId) return; var u="/admin/api/ki/beleg-upload?id="+encodeURIComponent(it.res.uploadId);
  if(F.viewDoc) F.viewDoc(u,it.f.supplier||it.name||"Beleg"); else window.open(u,"_blank","noopener"); });
F.action("kqopen",function(k){ var it=find(k); if(!it) return; it.open=true; paintItem(it); });
F.action("kqm",function(v){ var p=String(v).split("~"), it=find(p[0]); if(!it) return;
  if(p[1]==="list") it.showAll=true;
  else if(p[1]==="none"){ it.sel=""; it.selManual=true; it.showAll=true; }
  else if(p[1]==="pick"){ it.sel=p[2]; it.selManual=true; it.showAll=false; }
  paintMatch(it); });
F.action("kqsave",function(v){ var p=String(v).split("~"); save(find(p[0]),p[1]==="draft"); });
F.action("kqall",function(){
  var list=UQ.filter(function(x){ return x.status==="bereit"; }), i=0, ok=0;
  (function step(){ if(i>=list.length){ if(list.length>1) F.toast(ok+" von "+list.length+" Belegen gespeichert",ok<list.length); return; } save(list[i++],false).then(function(r){ if(r) ok++; step(); }); })();
});
F.listen("input","[data-kq]",function(el){ var it=find(el.getAttribute("data-kq")), k=el.getAttribute("data-k"); if(!it||!it.f) return; it.f[k]=el.value; it.msg=""; paintSum(it);
  if(k==="gross"||k==="date"||k==="supplier"){ clearTimeout(SUGT[it.key]); SUGT[it.key]=setTimeout(function(){ loadSug(it); },600); } });
F.listen("change","[data-kq]",function(el){ var it=find(el.getAttribute("data-kq")), k=el.getAttribute("data-k"); if(!it||!it.f) return; it.f[k]=el.value; paintSum(it); paintFoot(it); });

F.css([
".kidrop{border:2px dashed var(--line);border-radius:14px;padding:22px 14px;display:grid;gap:8px;justify-items:center;text-align:center;cursor:pointer}",
".kidrop.on,.kidrop:hover{border-color:var(--info);background:var(--info-soft)}",
".kidrop>svg{width:26px;height:26px;color:var(--info)}.kidrop .btn svg{width:16px;height:16px;color:currentColor}",
".dialog.kqdlg{gap:12px}",
".kq-list{display:grid;gap:12px}",
".kq-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.kq-head:empty{display:none}",
".kq{border:1px solid var(--line);border-radius:14px;padding:12px;display:grid;gap:10px;background:var(--sunk)}",
".kq-busy{grid-template-columns:auto minmax(0,1fr) auto;align-items:center}",
".kq-done{background:var(--ok-soft);border-color:transparent}",
".kq-top{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start}",
".kq-thumb{width:64px;height:84px;border-radius:8px;overflow:hidden;border:1px solid var(--line);background:var(--sunk);display:grid;place-items:center;padding:0;flex:none}",
"button.kq-thumb{cursor:zoom-in}",
".kq-thumb img{width:100%;height:100%;object-fit:cover;display:block}",
".kq-pdf{font-size:11px;font-weight:700;color:var(--ink-2)}",
".kq-sum,.kq-hl{display:grid;gap:2px;min-width:0}",
".kq-sum .kitags{margin-top:3px}",
".kq-sup{font-size:16px;overflow-wrap:anywhere;text-wrap:balance}",
".kq-amt{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2}",
".kq .small,.kq-head .small{font-size:12.5px}",
".kq-f{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}.kq-f .kq-w{grid-column:1/-1}",
".kq-warn{border-left:3px solid var(--warn);background:var(--warn-soft);border-radius:6px;padding:5px 8px;font-size:13px}",
".kq-match{border-top:1px solid var(--line);padding-top:8px}",
".kq-hit{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:start;background:var(--ok-soft);border-radius:10px;padding:8px 10px}",
".kq-ok{color:var(--ok);font-weight:800}",
".kq-cl{display:grid;gap:6px}",
".kq-c{display:grid;grid-template-columns:20px minmax(0,1fr);gap:6px;text-align:left;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:none;color:inherit;font:inherit;cursor:pointer;min-height:44px}",
".kq-c:hover{background:var(--hover,var(--sunk))}",
".kq-hl>span,.kq-hl>div{overflow-wrap:anywhere}",
".kq-c.on{border-color:var(--ok);background:var(--ok-soft)}.kq-r{color:var(--ok);font-weight:800}",
".kq-foot{display:flex;justify-content:space-between;align-items:center;gap:10px}",
".kq-go{flex:1 1 auto;max-width:280px;min-height:44px;font-size:15px}",
".kq-link{background:none;border:0;padding:6px 0;color:var(--info);font:inherit;font-size:13.5px;cursor:pointer;text-decoration:underline;text-underline-offset:2px}",
".kq-link[disabled]{opacity:.5}",
".kq-more{justify-self:start;padding:0}",
".kq-addcam{justify-self:center}",
".kq-spin{display:inline-block;width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;vertical-align:-2px;animation:kqspin .8s linear infinite}",
"@keyframes kqspin{to{transform:rotate(360deg)}}",
"@media (prefers-reduced-motion:reduce){.kq-spin{animation-duration:2.4s}}",
"@media (max-width:600px){.dialog.kqdlg{padding:14px}.kq-go{max-width:none}.kq-f{grid-template-columns:1fr 1fr}}"
].join("\n"));
})();
