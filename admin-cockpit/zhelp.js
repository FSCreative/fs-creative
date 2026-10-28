/* Hilfe in den Finanzen: Erklärung zur aktuellen Seite, alle Themen zum Aufklappen, Suche und Begriffe von A–Z.
   Öffnen über „Hilfe“ in der Finanzen-Navigation, das ?-Symbol am Handy oder die Taste „?“. */
(function(){
"use strict";
var F=window.FSC, esc=F.esc, UI=F.UI;
/* Themen: id = Seite (UI.fin), t = Titel, s = Kurzbeschreibung, b = Absätze/Listen ([“Überschrift”, “Text”]) */
var T=[
 {id:"dash",t:"Übersicht",s:"Deine Zahlen auf einen Blick",b:[
  ["Umsatz","Netto (ohne Umsatzsteuer): alle fertigen Rechnungen des Jahres ohne stornierte, plus Einnahme-Belege. Klein darunter steht der Brutto-Betrag (inkl. USt)."],
  ["Offene Forderungen","Was Kunden dir noch schulden, netto. Rot = Zahlungsziel überschritten (fällig), gelb = noch nicht fällig."],
  ["Zu erledigen","Alles, was du noch tun solltest: Entwürfe versenden, überfällige Rechnungen mahnen, nicht versendete Mahnungen senden, Bankumsätze zuordnen, Beleg-Entwürfe abschließen, fällige VALUERO-Gebühren verrechnen, USt-Zahllast überweisen. Ein Klick führt direkt hin. Druckshop-Entwürfe stehen hier nicht – sie gehen beim Bestellen automatisch raus."],
  ["Ertrag / Aufwand","Grün = Einnahmen, rot = Ausgaben je Monat (netto, nach Rechnungs- bzw. Belegdatum)."]]},
 {id:"inv",t:"Rechnungen",s:"Schreiben, senden, Zahlungseingang erfassen",b:[
  ["So läuft eine Rechnung","1. „Rechnung schreiben“ → Entwurf (noch ohne Nummer). 2. Prüfen und „Per E-Mail senden“ (oder als versendet markieren) → erst jetzt bekommt sie die fortlaufende Nummer und wird festgeschrieben. 3. Zahlung kommt → im Bankumsatz zuordnen oder „Zahlungseingang erfassen“."],
  ["Status","Entwurf (lila) · Offen (gelb) · Fällig (rot, Zahlungsziel vorbei) · Teilbezahlt · Bezahlt (grün) · Storniert (grau, zählt nie als bezahlt) · Storno (die Stornorechnung selbst)."],
  ["Druckshop-Rechnungen","Jede Druckbestellung legt einen Entwurf an („wartet auf Druckauftrag“). Er wird beim Bestellen bei Print.com automatisch fertiggestellt und an den Kunden gesendet – nicht von Hand senden, sonst bekommt der Kunde die Rechnung doppelt. Der Knopf öffnet den Druckauftrag."],
  ["Fehler in einer Rechnung?","Noch offen und unbezahlt → „Stornieren“ (es entsteht eine Stornorechnung) und neu schreiben. Schon bezahlt → „Gutschrift (Minderleistung)“. Versendete Rechnungen kann man nicht mehr ändern – das schreibt das Gesetz so vor."],
  ["Kunde zahlt weniger","Im Zahlungsdialog den Grund wählen: Teilzahlung (Rest bleibt offen), Skonto (mindert Umsatz und USt) oder Bankspesen (Ausgabe ohne Vorsteuer)."]]},
 {id:"invd",t:"Rechnung im Detail",s:"PDF, Status und alle Aktionen",b:[
  ["Aktionen","Oben rechts: „Zahlungseingang erfassen“ bzw. „Per E-Mail senden“ (bei Druckshop-Entwürfen „Druckauftrag öffnen“). Unter „Mehr“: Mahnung, Gutschrift, als wiederkehrend anlegen, Stornieren."],
  ["Herkunft & Verknüpfungen","Zeigt, wozu die Rechnung gehört: Kontakt, Kundenakte, Angebot, Stornorechnung, Druckauftrag, Plattform oder Website und Auftrag – ein Klick öffnet es."],
  ["Festgeschrieben 🔒","Die Rechnung ist unveränderbar (gesetzliche Pflicht). Zahlungen, Mahnungen, Storno und Gutschrift gehen trotzdem."]]},
 {id:"wkr",t:"Wiederkehrende Rechnungen",s:"Monatlich, jährlich … automatisch",b:[
  ["Anlegen","Eine passende Rechnung öffnen → Mehr → „Als wiederkehrend anlegen“. Intervall, erstes Datum und ggf. Enddatum wählen."],
  ["Im Voraus / nachträglich","Im Voraus: Leistungszeitraum beginnt mit dem Rechnungsdatum (z. B. Wartung Oktober am 1.10.). Nachträglich: der vergangene Zeitraum wird abgerechnet."],
  ["Versand vorschlagen","Zum Termin entsteht immer ein Entwurf. Ist „Versand vorschlagen“ an, erscheint unter Finanzen → „Zur Prüfung“ ein Vorschlag – erst mit „Bestätigen“ wird die Rechnung fertiggestellt und an den Kunden geschickt."]]},
 {id:"review",t:"Zur Prüfung",s:"Nichts wird automatisch gebucht",b:[
  ["Was landet hier?","Alles, was das Cockpit selbst erkennt: Bankregeln, Mollie-Zahlungen → Rechnung, Mollie-Gebühren und -Auszahlungen, Geldtransit zwischen Konten, Belegdateien aus Mails, USt-Zahlung ans Finanzamt, wiederkehrende Belege/Rechnungen und Mahnungen."],
  ["Bestätigen / Ablehnen","„Bestätigen“ führt genau die vorgeschlagene Buchung aus. „Ablehnen“ merkt sich den Vorschlag – er kommt nicht wieder. Veraltete Vorschläge (z. B. Umsatz inzwischen zugeordnet) verschwinden von selbst."],
  ["Vorschlag beim Öffnen","Beim Öffnen eines offenen Bankumsatzes oder eines unbezahlten Belegs steht oben der beste Kandidat mit Begründung – „Übernehmen“ ordnet mit einem Tipp zu."]]},
 {id:"dun",t:"Mahnungen",s:"Erinnern, mahnen, Mahngebühr",b:[
  ["Stufen","1. Zahlungserinnerung (freundlich, meist ohne Gebühr) → 1. Mahnung → 2. Mahnung → letzte Mahnung. Jede Stufe setzt eine neue Frist."],
  ["Mahngebühr","Ist Schadenersatz und daher nicht umsatzsteuerpflichtig: ohne USt auf der Mahnung, nicht in der UVA. Zahlt der Kunde die Gebühr mit, wird sie automatisch als eigene Einnahme gebucht. Beim Mahnen von Hand wird die Gebühr aus den Mahnlauf-Einstellungen vorgeschlagen (Firma oder privat)."],
  ["Nicht versendete Mahnungen","Eine Mahnung, die erstellt, aber nie verschickt wurde (z. B. Dialog geschlossen). Die Rechnung zeigt die Mahnstufe trotzdem, und der Mahnlauf überspringt sie, bis die Mahnung raus ist. Unter Mahnungen steht sie mit „Senden“."],
  ["Bezahlt","Sobald die Rechnung bezahlt ist, gelten auch alle Mahnungen dazu als erledigt."]]},
 {id:"cn",t:"Gutschriften",s:"Korrektur bezahlter Rechnungen",b:[
  ["Wann?","Nur bei bezahlten oder teilbezahlten Rechnungen, z. B. Leistung kleiner als verrechnet oder Teilrückerstattung. Offene Rechnungen werden stattdessen storniert."],
  ["Steuer","Die Gutschrift mindert Umsatz und Umsatzsteuer im Monat, in dem sie ausgestellt wird."]]},
 {id:"orders",t:"Angebote",s:"Vom Angebot zur Rechnung (in der Seitenleiste „Aufträge“ sind deine Projekte)",b:[
  ["In Rechnung","„In Rechnung“ macht aus dem Angebot einen Rechnungsentwurf."],
  ["Abschlagsrechnung (Anzahlung)","„Abschlag“: einen Prozentsatz oder Betrag vorab verrechnen. Die USt dafür ist im Monat der Zahlung fällig – das macht die UVA automatisch."],
  ["Schlussrechnung","Wenn alle Abschläge bezahlt sind: „Schlussrechnung“ – alle Positionen minus der Abschläge."]]},
 {id:"vou",t:"Belege",s:"Ausgaben und sonstige Einnahmen",b:[
  ["Erfassen","Am Handy „Beleg scannen“ (Kamera), am PC „Ausgabe erfassen“ oder aus einem Mail-Anhang. Die KI liest Lieferant, Datum, Betrag und Steuer aus – du prüfst und speicherst."],
  ["Kategorie","Bestimmt, wo die Ausgabe in der E/A-Rechnung landet (z. B. Büro, Software, Werbung). Links in der Liste siehst du die Summen je Kategorie."],
  ["Entwurf → offen → bezahlt","Entwürfe zählen noch nicht. Fertige Belege werden bezahlt, sobald du den Bankumsatz zuordnest."],
  ["Größere Anschaffung?","Über 1.000 € netto (z. B. Laptop, Kamera) → unter Steuern › Anlagen & Abschreibungen als Anlage markieren."]]},
 {id:"bank",t:"Bank & Kasse",s:"Kontoumsätze importieren und zuordnen",b:[
  ["Kontoauszug importieren","In George: Konto → Umsätze → Export (CAMT/XML, CSV oder JSON) und hier „Kontoauszug importieren“. Doppelte Umsätze werden erkannt und übersprungen."],
  ["Zuordnen","Jeder Umsatz gehört zu einer Rechnung (Geld rein) oder einem Beleg (Geld raus). „Nicht zugeordnet“ zeigt, was noch fehlt – mit Vorschlägen."],
  ["Privat","Private Ausgaben/Einlagen nicht als Beleg erfassen, sondern als „privat“ markieren."],
  ["Regeln","Unter „Regeln“ legst du fest, was mit wiederkehrenden Umsätzen automatisch passiert: z. B. „Kontoführung“ → Beleg Bankspesen 0 %, „SVS“ → Beleg Sozialversicherung, Überweisung aufs Privatkonto → privat. Sie laufen nach jedem Kontoauszug-Import und Mollie-Abruf; die oberste passende Regel gewinnt."],
  ["Mollie","Mollie ist ein eigenes Zahlungskonto: jede Kundenzahlung kommt mit dem vollen Betrag herein (→ der Rechnung zuordnen), die Mollie-Gebühr als eigene Ausgabe, kochdu-Provisionen (Connect) als Einnahme. Die Auszahlung aufs Bankkonto wird automatisch mit dem George-Umsatz als „Geldtransit“ verknüpft – sie ist kein Umsatz. Deshalb passt es, auch wenn wegen der Gebühren weniger ausbezahlt wird."],
  ["George direkt","Einmal „George verbinden“ und die Freigabe in George bestätigen (nur Lesen, keine Zahlungen). Danach holt das Cockpit täglich die gebuchten Umsätze – doppelte aus einem früheren Kontoauszug-Import werden erkannt. Die Freigabe gilt 180 Tage; 14 Tage vorher erscheint „Freigabe erneuern“. Der Saldo wird mit George verglichen."],
  ["PayPal direkt","PayPal-Umsätze kommen täglich automatisch (nur Lesen). Eingänge werden mit der PayPal-Gebühr gespeichert – beim Zuordnen zur Rechnung wird die Gebühr als Zahlungsgebühr gebucht, damit der Betrag stimmt. Auszahlungen aufs Bankkonto werden als Geldtransit verknüpft."]]},
 {id:"open",t:"Nicht zugeordnete Umsätze",s:"Was noch fehlt",b:[["Warum wichtig?","Erst zugeordnete Umsätze gelten als bezahlt – das braucht die E/A-Rechnung (Einnahmen/Ausgaben nach Zahlungsdatum)."]]},
 {id:"kasse",t:"Kassenbuch",s:"Bargeld richtig aufzeichnen",b:[
  ["Regeln","Jede Kassenbuchung ist sofort unveränderbar. Fehler korrigierst du mit „Stornieren“ – das bucht eine Gegenbuchung mit heutigem Datum. Der Kassenstand darf nie unter 0 fallen."],
  ["Belege","Danach die Buchung mit „Zuordnen“ dem passenden Beleg oder der Rechnung zuweisen."]]},
 {id:"pay",t:"Zahlungsaufträge",s:"Überweisungen anlegen und freigeben",b:[
  ["Überweisung anlegen","Von Hand oder aus einer Rechnungsmail (Postfach → „Überweisung anlegen“): die KI liest Empfänger, IBAN, Betrag und Referenz aus. Auf Wunsch entsteht gleich der Beleg (offen)."],
  ["Freigeben","„In George freigeben“ legt die Überweisung an – ausgeführt wird erst nach deiner Bestätigung in George. Alternativ QR-Code mit der George-App scannen oder SEPA-Datei hochladen."],
  ["Bezahlt","Wird automatisch erkannt, sobald die Abbuchung am Konto ist."]]},
 {id:"steuer",t:"Steuer-Übersicht",s:"Was steht an, was ist bezahlt",b:[
  ["Voranmeldungen","Jede Zeile ist ein UVA-Zeitraum: grün abgegeben, gelb bald fällig, rot überfällig. „Prüfen & abgeben“ führt direkt zur Voranmeldung."],
  ["Jahr auf einen Blick","Umsatzsteuer (was du dem Finanzamt schuldest), Gewinn und geschätzte Einkommensteuer – jeweils mit „schon bezahlt“ und „noch offen“."],
  ["Jahreserklärung","Die drei Schritte für das Vorjahr: Umsatzsteuer-Jahr, Gewinn prüfen, an FinanzOnline senden – Frist 30. Juni."]]},
 {id:"uva",t:"Umsatzsteuer-Voranmeldung (UVA)",s:"Quartal prüfen und abgeben",b:[
  ["Was ist das?","Du meldest, wie viel Umsatzsteuer du kassiert (aus Rechnungen) und wie viel Vorsteuer du bezahlt hast (aus Belegen). Die Differenz ist die Zahllast – zu zahlen bis zum 15. des zweitfolgenden Monats (Q3 → 15.11.)."],
  ["Ablauf","Quartal wählen → oben Zahllast und Frist prüfen → „UVA vorbereiten“ → an FinanzOnline senden → überweisen. Danach ist das Quartal grün."],
  ["Unklare Belege","Steht oben ein Hinweis „Belege konnten nicht eingeordnet werden“, zuerst dort klicken – sonst fehlen sie in den Zahlen."],
  ["Details & Sonderfälle","Eingeklappt unten: EU & Ausland (Reverse Charge, ZM), 0-%-Rechnungen, Gutschriften, manuelle Werte und Einstellungen. Meist musst du da nichts tun."]]},
 {id:"u1",t:"Umsatzsteuer-Jahreserklärung (U1)",s:"Das ganze Jahr zusammen",b:[["Was ist das?","Die Summe aller Voranmeldungen eines Jahres – Abweichungen werden hier ausgeglichen. Abgabe zusammen mit der Einkommensteuer bis 30. Juni des Folgejahres."]]},
 {id:"jab",t:"Gewinn & Jahreserklärung",s:"E/A-Rechnung und Einkommensteuer",b:[
  ["Gewinn","Einnahmen minus Ausgaben nach Zahlungsdatum (Einnahmen-Ausgaben-Rechnung, Formular E1a). Anlagen gehen über die Abschreibung ein."],
  ["Gewinnfreibetrag","Bis 33.000 € Gewinn sind 15 % automatisch steuerfrei (Grundfreibetrag)."],
  ["Eingaben","Kilometergeld, Pauschalen, Kinder, Vorauszahlungen hier pflegen – sie fließen in die Einkommensteuer-Schätzung."]]},
 {id:"anlagen",t:"Anlagen & Abschreibungen",s:"Größere Anschaffungen über Jahre absetzen",b:[
  ["Was ist eine Anlage?","Etwas, das du länger als ein Jahr nutzt und das über 1.000 € netto kostet. Es wird über die Nutzungsdauer verteilt abgesetzt (Abschreibung/AfA)."],
  ["Zu prüfen","Oben stehen größere Käufe, die noch nicht eingeordnet sind: „Als Anlage abschreiben“ oder „Sofortaufwand“."],
  ["Plan","Klick auf eine Anlage zeigt den Abschreibungsplan Jahr für Jahr und die Einstellungen (Nutzungsdauer, Methode, Verkauf)."],
  ["Halbjahresregel","Kauf ab 1. Juli → im ersten Jahr nur die halbe Abschreibung."]]},
 {id:"prognose",t:"Prognose",s:"Wie wird das Jahr?",b:[["Hochrechnung","Rechnet aus den bisherigen Monaten das ganze Jahr hoch – inklusive geschätzter Steuern. Nur ein Richtwert."]]},
 {id:"ct",t:"Kontakte",s:"Kunden und Lieferanten",b:[["Tipp","E-Mail-Adresse beim Kunden hinterlegen – dann gehen Rechnungen, Mahnungen und wiederkehrende Rechnungen automatisch an die richtige Adresse."]]},
 {id:"prod",t:"Produkte",s:"Deine Standard-Leistungen",b:[["Wozu?","Häufige Positionen mit Preis und Steuersatz anlegen – beim Rechnungschreiben einfach auswählen."]]},
 {id:"mydata",t:"Meine Daten",s:"UID, Steuernummer, IBAN, D-U-N-S …",b:[["Kopieren","Klick auf eine Zeile kopiert den Wert, „Gruppe kopieren“ z. B. alle Bankdaten auf einmal, „Alles kopieren“ den ganzen Block."],["Ändern","„Bearbeiten“: Werte ändern, Zeilen hinzufügen oder entfernen, eigene Gruppen anlegen (z. B. Versicherungsnummern)."]]},
 {id:"lock",t:"Festschreiben",s:"Unveränderbarkeit (gesetzliche Pflicht)",b:[["Warum?","Buchhaltung muss unveränderbar sein (BAO/GoBD). Rechnungen werden beim Versand automatisch festgeschrieben. Belege und Zahlungen schreibst du hier je Zeitraum fest – am besten monatlich oder mit jeder UVA."]]},
 {id:"umstieg",t:"Firma & Einstellungen",s:"Firmendaten",b:[["Firmendaten","Erscheinen auf Rechnungen, Mahnungen und Angeboten (Adresse, UID, Bank). Bitte vollständig halten."],["Eigene Buchhaltung","Rechnungen, Angebote, Belege, Bank und Steuer laufen vollständig im Cockpit. Die Daten aus früheren Jahren wurden einmalig übernommen."]]}
];
var G=[
 ["Geldtransit","Geld wandert zwischen deinen eigenen Konten (z. B. Mollie → Bank). Kein Umsatz und keine Ausgabe."],
 ["Netto / Brutto","Netto = ohne Umsatzsteuer, brutto = inklusive. Für deinen Gewinn zählt netto; die USt reichst du nur durch."],
 ["Umsatzsteuer (USt)","Die 20 % (10 %, 13 %) auf deinen Rechnungen. Gehört dem Finanzamt."],
 ["Vorsteuer","Die USt auf deinen Einkäufen. Wird von der Umsatzsteuer abgezogen."],
 ["Zahllast","Umsatzsteuer minus Vorsteuer – das zahlst du mit der UVA ans Finanzamt."],
 ["Reverse Charge","Bei Rechnungen aus dem EU-Ausland ohne USt (Google, Meta …) schuldest du die USt selbst – und ziehst sie gleich als Vorsteuer ab. Ergebnis 0, muss aber gemeldet werden."],
 ["Istbesteuerung","Die Umsatzsteuer entsteht erst im Monat, in dem der Kunde bezahlt; Vorsteuer, wenn du die Eingangsrechnung bezahlt hast. Gilt bei dir seit 2026 (umschaltbar unter Steuern → Einstellungen)."],
 ["Sollbesteuerung","USt zählt im Monat der Leistung, egal wann bezahlt wird. Bei dir für Zeiträume bis 2025."],
 ["Zahlungseingang erfassen","Ein Kunde hat eine Rechnung bezahlt – mit Teilzahlung, Skonto oder Bankspesen. Nicht verwechseln mit „Überweisung anlegen“."],
 ["Überweisung anlegen","Du bezahlst selbst etwas (Zahlungsauftrag): unter Bank & Kasse → Zahlungsaufträge, freigeben in George."],
 ["E/A-Rechnung","Einnahmen-Ausgaben-Rechnung: Gewinn nach Zahlungsdatum (Geld rein minus Geld raus, Anlagen über Abschreibung)."],
 ["Abschreibung (AfA)","Kosten einer Anlage werden über die Nutzungsdauer verteilt abgesetzt."],
 ["GWG","Geringwertiges Wirtschaftsgut bis 1.000 € netto – sofort voll absetzbar."],
 ["Festschreiben","Ein Dokument wird unveränderbar. Korrektur nur per Storno, Gutschrift oder Gegenbuchung."],
 ["Storno","Hebt eine offene Rechnung auf – es entsteht eine Stornorechnung mit negativem Betrag."],
 ["Gutschrift","Korrigiert eine bezahlte Rechnung (Minderleistung) und mindert Umsatz und USt."],
 ["ZM (Zusammenfassende Meldung)","Meldung deiner Leistungen an EU-Unternehmer – nur nötig, wenn du an Firmen im EU-Ausland verrechnest."],
 ["FinanzOnline","Das Online-Portal des Finanzamts – UVA, U1 und Einkommensteuer werden dort abgegeben."]
];
function topicHtml(x,open){ return '<details class="hp-t"'+(open?" open":"")+'><summary><b>'+esc(x.t)+'</b><span>'+esc(x.s)+'</span></summary>'+x.b.map(function(p){ return '<div class="hp-p"><b>'+esc(p[0])+'</b><p>'+esc(p[1])+'</p></div>'; }).join("")+'</details>'; }
function body(q){
  q=(q||"").trim().toLowerCase(); var cur=(UI.fin||"dash").split(":")[0]; if(cur==="kasse"||cur==="open") cur=cur; var here=T.find(function(x){ return x.id===cur; })||T[0];
  var hit=function(s){ return !q||s.toLowerCase().indexOf(q)>-1; };
  var tl=T.filter(function(x){ return hit(x.t+" "+x.s+" "+x.b.map(function(p){ return p.join(" "); }).join(" ")); }), gl=G.filter(function(g){ return hit(g.join(" ")); });
  return (q?'':'<div class="hp-sec">Zu dieser Seite</div>'+topicHtml(here,true))+
    '<div class="hp-sec">'+(q?tl.length+' Treffer in Themen':'Alle Themen')+'</div>'+tl.filter(function(x){ return q||x!==here; }).map(function(x){ return topicHtml(x,!!q); }).join("")+
    '<div class="hp-sec">Begriffe kurz erklärt</div>'+(gl.map(function(g){ return '<div class="hp-g"><b>'+esc(g[0])+'</b><p>'+esc(g[1])+'</p></div>'; }).join("")||'<p class="muted">Kein Begriff gefunden.</p>');
}
F.action("help",function(){
  F.openDrawer('<div class="hp"><div class="row-between"><h2 style="font-size:20px;margin:0">Hilfe</h2>'+F.btnClose("data-close")+'</div>'+
    '<input class="f" id="hpQ" type="search" placeholder="Suchen, z. B. Mahngebühr, Abschreibung, UVA …" autocomplete="off" style="margin:12px 0">'+
    '<div id="hpB">'+body("")+'</div><p class="muted small" style="margin-top:16px">Tipp: Die Taste „?“ öffnet die Hilfe jederzeit.</p></div>');
  setTimeout(function(){ var i=document.getElementById("hpQ"); if(i&&window.innerWidth>900) i.focus(); },60);
});
F.listen("input","#hpQ",function(el){ var b=document.getElementById("hpB"); if(b) b.innerHTML=body(el.value); });
document.addEventListener("keydown",function(e){ if(e.key==="?"&&!/input|textarea|select/i.test((e.target&&e.target.tagName)||"")&&!e.target.isContentEditable&&F.current==="geld"){ e.preventDefault(); F.actions.help(); } });
F.css('.hp-sec{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin:18px 0 6px;font-weight:600}'+
 '.hp-t{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:var(--panel)}:where(:root[data-theme="glas"]) .hp-t{background:var(--sunk);border-radius:14px}.hp-t summary{cursor:pointer;padding:10px 12px;display:grid;gap:2px;list-style:none}.hp-t summary::-webkit-details-marker{display:none}.hp-t summary span{font-size:13px;color:var(--ink-3)}'+
 '.hp-t[open] summary{border-bottom:1px solid var(--line)}.hp-p{padding:8px 12px}.hp-p p,.hp-g p{margin:2px 0 0;font-size:14px;line-height:1.5;color:var(--ink-2)}.hp-g{padding:6px 0;border-bottom:1px solid var(--line)}');
})();
