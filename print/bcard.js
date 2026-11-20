/* Visitenkarten-Vorlagen im Kundenportal (Simon 19.11.2026) – nur Firmenkunden, je Konto im Cockpit freigeschaltet.
   Einfacher eigener Editor: leeres Design (PDF/PNG/JPG) als Hintergrund, Textfelder (Schrift, Größe, Farbe, Ausrichtung, Position), Logos.
   Bestellen: Vorlage wählen → Daten der Person eintippen → „Bestellen“ → Lieferadresse im Pop-up bestätigen → Bestellung auf Rechnung.
   Die Karte wird als SVG gebaut (gleiches SVG für Vorschau und Druck) und über /print/api/design zum Druck-PDF (Schriften eingebettet, CMYK, Beschnitt). */
(function () {
  "use strict";
  var MM_PT = 72 / 25.4, PT_MM = 25.4 / 72, PROD = "visitenkarten", BASE_SEL = { size: "bc", material: "350gr_silk_mc", finish: "geen" };
  var PRESETS = [["name", "Name", "Max Mustermann", 10, true], ["role", "Funktion", "Geschäftsführung", 7.5, false], ["dept", "Abteilung", "Vertrieb", 7, false], ["phone", "Telefon", "+43 5556 12345", 7, false],
    ["mobile", "Mobil", "+43 664 1234567", 7, false], ["mail", "E-Mail", "max.mustermann@firma.at", 7, false], ["addr", "Adresse", "Musterstraße 1, 6780 Schruns", 7, false], ["web", "Web", "www.firma.at", 7, false], ["free", "Freitext", "Text", 7, false]];
  var C = null, ST = { view: "list", tpls: null, fonts: [], prod: null, info: null };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var toast = function (m, bad) { if (C && C.toast) C.toast(m, bad); };
  function jfetch(url, body, method) { return fetch(url, { method: method || (body ? "POST" : "GET"), credentials: "same-origin", headers: Object.assign({ "X-Print-Shop": "1" }, body && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}), body: body ? (body instanceof Blob ? body : JSON.stringify(body)) : undefined })
    .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Fehler " + r.status }; }); }); }
  /* ── Schriften: mitgelieferte (/print/fonts) + eigene des Kunden ── */
  var baseCss = null;
  function fontCss() { var el = document.getElementById("bcFonts"); if (!el) { el = document.createElement("style"); el.id = "bcFonts"; document.head.appendChild(el); }
    if (baseCss == null) { baseCss = ""; (C.fonts || []).forEach(function (f) { baseCss += '@font-face{font-family:"' + f.family + '";src:url(/print/fonts/' + f.file + '-400.woff) format("woff");font-weight:400;font-display:swap}';
      if (f.bold) baseCss += '@font-face{font-family:"' + f.family + '";src:url(/print/fonts/' + f.file + '-700.woff) format("woff");font-weight:700;font-display:swap}';
      if (f.italic) baseCss += '@font-face{font-family:"' + f.family + '";src:url(/print/fonts/' + f.file + '-400i.woff) format("woff");font-weight:400;font-style:italic;font-display:swap}'; }); }
    el.textContent = baseCss + ST.fonts.map(function (f) { return '@font-face{font-family:"cf-' + f.id + '";src:url(/print/api/account/bc/font/' + f.id + ');font-display:swap}'; }).join(""); }
  function fontList() { return ST.fonts.map(function (f) { return { family: "cf-" + f.id, label: f.name + " (eigene)", bold: false, italic: false }; }).concat((C.fonts || []).map(function (f) { return { family: f.family, label: f.family, bold: !!f.bold, italic: !!f.italic }; })); }
  function fontOf(fam) { return fontList().filter(function (f) { return f.family === fam; })[0]; }
  /* ── Karte als SVG (Maße in mm; Text-y = Grundlinie) – Vorschau und Druck identisch ── */
  function cardSvg(t, side, vals, opt) {
    opt = opt || {}; var p = t.pages[side] || { items: [] }, b = t.bleed, W = t.w + 2 * b, H = t.h + 2 * b;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + r1(W * MM_PT) + '" height="' + r1(H * MM_PT) + '" viewBox="' + (opt.trim ? b + " " + b + " " + t.w + " " + t.h : "0 0 " + W + " " + H) + '"' + (opt.cls ? ' class="' + opt.cls + '"' : "") + ">";
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';
    if (p.bg) s += '<image x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="xMidYMid slice" xlink:href="' + p.bg + '"/>';
    var up = vals ? closeGaps(p.items || [], vals) : {};
    (p.items || []).forEach(function (it, i) {
      if (it.t === "img") { s += '<image x="' + r1(it.x + b) + '" y="' + r1(it.y + b) + '" width="' + r1(it.w) + '" height="' + r1(it.h) + '" preserveAspectRatio="xMidYMid meet" xlink:href="' + it.src + '"' + (opt.edit ? ' data-i="' + i + '" class="bc-it' + (opt.sel === i ? " sel" : "") + '"' : "") + "/>"; return; }
      var txt = vals && vals[it.key] != null ? vals[it.key] : it.text; if (!txt && !opt.edit) return; if (!txt) txt = "[" + it.label + "]";
      var anc = it.align === "center" ? "middle" : it.align === "right" ? "end" : "start", ax = it.x + b + (it.align === "center" ? it.w / 2 : it.align === "right" ? it.w : 0), fs = it.size * PT_MM;
      var lines = String(txt).split(/\n/).slice(0, 4);
      s += '<text x="' + r1(ax) + '" y="' + r1(it.y + b - (up[i] || 0)) + '" font-family="' + esc(it.font) + '" font-size="' + r1(fs * 100) / 100 + '" font-weight="' + (it.bold ? "bold" : "normal") + '" font-style="' + (it.italic ? "italic" : "normal") + '" fill="' + esc(it.color || "#000000") + '" text-anchor="' + anc + '"' + (opt.edit ? ' data-i="' + i + '" class="bc-it' + (opt.sel === i ? " sel" : "") + '"' : "") + ">" +
        lines.map(function (l, k) { return k ? '<tspan x="' + r1(ax) + '" dy="' + r1(fs * 1.2 * 100) / 100 + '">' + esc(l) + "</tspan>" : esc(l); }).join("") + "</text>";
    });
    if (opt.edit) { (p.items || []).forEach(function (it, i) { var g = boxOf(t, it); s += '<rect x="' + g.x + '" y="' + g.y + '" width="' + g.w + '" height="' + g.h + '" data-i="' + i + '" class="bc-it bc-box' + (opt.sel === i ? " sel" : "") + '" fill="transparent"/>'; });
      var si = opt.sel != null ? (p.items || [])[opt.sel] : null; if (si && si.t === "img") s += '<rect x="' + r1(si.x + b + si.w - 1.3) + '" y="' + r1(si.y + b + si.h - 1.3) + '" width="2.6" height="2.6" rx="0.5" data-h="' + opt.sel + '" class="bc-h"><title>Ziehen = Größe ändern</title></rect>';
      s += '<rect x="' + b + '" y="' + b + '" width="' + t.w + '" height="' + t.h + '" fill="none" stroke="#ff375f" stroke-width="0.25" pointer-events="none"/><rect x="' + (b + 3) + '" y="' + (b + 3) + '" width="' + (t.w - 6) + '" height="' + (t.h - 6) + '" fill="none" stroke="#0a84ff" stroke-width="0.2" stroke-dasharray="1 0.8" pointer-events="none"/>'; }
    return s + "</svg>";
  }
  /* Bleibt ein Feld bei einer Person leer (z. B. keine Mobilnummer), rücken die Zeilen darunter nach – sonst bliebe eine Lücke im Textblock (Prüfung 20.11.2026).
     Gilt nur innerhalb eines Blocks: gleiche linke Kante und Ausrichtung, normaler Zeilenabstand (bis 2,3 × Schriftgröße). Einzeln stehende Felder bleiben, wo sie sind. */
  function closeGaps(items, vals) { var cols = {}, out = {};
    items.forEach(function (it, i) { if (it.t === "img") return; var k = Math.round(it.x * 2) + "|" + (it.align || "left"); (cols[k] = cols[k] || []).push({ it: it, i: i }); });
    Object.keys(cols).forEach(function (k) { var l = cols[k].sort(function (a, c) { return a.it.y - c.it.y; }), sh = 0;
      var near = function (a, c) { var g = c.it.y - a.it.y; return g > 0 && g <= Math.max(a.it.size, c.it.size) * PT_MM * 2.3; };
      l.forEach(function (o, n) { if (n && !near(l[n - 1], o)) sh = 0; out[o.i] = sh; var v = vals[o.it.key] != null ? vals[o.it.key] : o.it.text; if (!String(v == null ? "" : v).trim() && l[n + 1] && near(o, l[n + 1])) sh += l[n + 1].it.y - o.it.y; }); });
    return out; }
  /* Rahmen eines Felds in mm (inkl. Beschnitt-Versatz): Text = Feldbreite × Zeilenhöhe ab Grundlinie, Logo = Bildfläche. Dient als Auswahlrahmen und Greiffläche. */
  function boxOf(t, it) { var b = t.bleed; if (it.t === "img") return { x: r1(it.x + b), y: r1(it.y + b), w: r1(it.w), h: r1(it.h) };
    var fs = it.size * PT_MM, n = Math.max(1, Math.min(4, String(it.text || "").split(/\n/).length)); return { x: r1(it.x + b - 0.6), y: r1(it.y + b - fs * 0.95), w: r1(it.w + 1.2), h: r1(fs * 1.2 * (n - 1) + fs * 1.3) }; }
  /* ── Daten laden ── */
  function load() { return jfetch("/print/api/account/bc").then(function (j) { if (!j.ok) { ST.err = j.error; ST.tpls = []; return; } ST.err = ""; ST.tpls = j.templates || []; ST.fonts = j.fonts || []; fontCss(); }); }
  function setFrom(j) { if (j && j.ok) { ST.tpls = j.templates || ST.tpls; ST.fonts = j.fonts || ST.fonts; fontCss(); } }
  function prodInfo(sides) { var sel = Object.assign({}, BASE_SEL, { printtype: sides > 1 ? "44" : "40" });
    return jfetch("/print/api/price", { product: PROD, sel: sel, copies: 100, urgency: "standard", pm: "auto", country: "AT", zip: "", customerType: "company" }).then(function (j) { if (!j.ok) throw new Error(j.error || "Preis nicht verfügbar");
      var sz = j.price.size || { w: 85, h: 55 }; return { sel: sel, w: +sz.w || 85, h: +sz.h || 55, bleed: j.price.bleed != null ? +j.price.bleed : 1.5 }; }); }
  /* ── Bild/PDF → JPEG (ca. 600 dpi, max. 4000 px) ── */
  function pdfLib() { if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib); return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); }; s.onerror = function () { rej(new Error("PDF-Leser konnte nicht geladen werden")); }; document.head.appendChild(s); }); }
  function toImg(file, page, png) {
    var out = function (cv) { return png ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.92); };
    if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) return file.arrayBuffer().then(function (ab) { return pdfLib().then(function (L) { return L.getDocument({ data: ab }).promise; }); }).then(function (doc) { if (page > doc.numPages) return null;
      return doc.getPage(page).then(function (pg) { var v0 = pg.getViewport({ scale: 1 }), sc = Math.min(600 / 72, 4000 / Math.max(v0.width, v0.height)), vp = pg.getViewport({ scale: sc }), cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        var x = cv.getContext("2d"); if (!png) { x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); } return pg.render({ canvasContext: x, viewport: vp, background: png ? "rgba(0,0,0,0)" : undefined }).promise.then(function () { return { src: out(cv), w: cv.width, h: cv.height, pages: doc.numPages }; }); }); });
    if (!/^image\/(png|jpeg)$/.test(file.type)) return Promise.reject(new Error("Bitte PDF, PNG oder JPG verwenden"));
    return new Promise(function (res, rej) { var im = new Image(), u = URL.createObjectURL(file); im.onload = function () { var k = Math.min(1, 4000 / Math.max(im.width, im.height)), cv = document.createElement("canvas"); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      var x = cv.getContext("2d"); if (!png) { x.fillStyle = "#fff"; x.fillRect(0, 0, cv.width, cv.height); } x.drawImage(im, 0, 0, cv.width, cv.height); URL.revokeObjectURL(u); res({ src: out(cv), w: cv.width, h: cv.height, pages: 1 }); }; im.onerror = function () { rej(new Error("Bild konnte nicht gelesen werden")); }; im.src = u; });
  }
  function thumb(t) { return new Promise(function (res) { var im = new Image(), svg = cardSvg(t, 0, null, {}); im.onload = function () { var cv = document.createElement("canvas"), k = 320 / im.width; cv.width = 320; cv.height = Math.round(im.height * k); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); try { res(cv.toDataURL("image/jpeg", 0.78)); } catch (e) { res(""); } }; im.onerror = function () { res(""); }; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }); }

  /* ════════ Ansichten ════════ */
  function paint() { var el = C && C.el; if (!el || !document.body.contains(el)) return;
    try { var hd = document.querySelector("header.nav"), fx = hd && getComputedStyle(hd).position === "fixed"; el.style.setProperty("--bc-top", (fx ? Math.round(hd.getBoundingClientRect().height) + 6 : 8) + "px"); } catch (e0) {}   /* Abstand der mitlaufenden Karte zur festen Kopfleiste (Handy) */ el.innerHTML = ST.view === "edit" ? vEdit() : ST.view === "order" ? vOrder() : vList(); after(); }
  function vList() {
    if (!ST.tpls) return '<p class="pd-muted"><span class="ps-spin"></span> Vorlagen werden geladen …</p>';
    var me = C.me || {}, inv = me.type === "company" && me.uidValid;
    return '<div class="bc-head"><div><h2>Visitenkarten</h2><p class="pd-muted">Vorlage einmal einrichten – dann für jede Person nur noch Name &amp; Daten eintippen und bestellen. Geliefert wird an den Standort, verrechnet auf Rechnung an ' + esc(me.company || "eure Firma") + ".</p></div></div>" +
      (ST.err ? '<p class="ps-err">' + esc(ST.err) + "</p>" : "") + (inv ? "" : '<p class="ps-help ps-info">Für die Bestellung auf Rechnung braucht euer Konto eine gültige UID-Nummer – bitte unter „Profil &amp; Einstellungen“ hinterlegen.</p>') +
      (ST.tpls.length ? "" : '<ol class="bc-how"><li><b>Leeres Kartendesign hochladen</b><span>Eure Visitenkarte ohne Namen und Kontaktdaten – als PDF, PNG oder JPG.</span></li><li><b>Felder platzieren</b><span>Name, Funktion, Telefon … einmal an die richtige Stelle ziehen, Schrift und Farbe wählen.</span></li><li><b>Für jede Person bestellen</b><span>Nur noch die Daten eintippen – Vorschau prüfen, bestellen, fertig.</span></li></ol>') +
      '<div class="bc-grid">' + ST.tpls.map(function (t) { return '<div class="bc-card"><div class="pv">' + (t.preview ? '<img src="' + esc(t.preview) + '" alt="">' : "") + '</div><b>' + esc(t.name) + '</b><small class="pd-muted">' + (t.sides > 1 ? "Vorder- &amp; Rückseite" : "Einseitig") + (t.fields && t.fields.length ? " · " + t.fields.length + " Felder" : "") + "</small>" +
        '<div class="ac"><button type="button" class="ps-btn primary" data-bc="order:' + esc(t.id) + '">Karte bestellen</button><button type="button" class="ps-btn small" data-bc="edit:' + esc(t.id) + '">Vorlage bearbeiten</button><button type="button" class="ps-link" data-bc="del:' + esc(t.id) + '">Löschen</button></div></div>'; }).join("") +
      '<div class="bc-card new"><b>Neue Vorlage</b><p class="pd-muted small">Leeres Design der Visitenkarte (ohne Namen) als PDF, PNG oder JPG – 85 × 55 mm, am besten mit 1,5 mm Beschnitt.</p>' +
      '<label class="bc-up">Vorderseite *<input type="file" id="bcF" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"></label><label class="bc-up">Rückseite (optional)<input type="file" id="bcB" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"></label>' +
      '<button type="button" class="ps-btn primary" data-bc="new"' + (ST.busy ? " disabled" : "") + ">" + (ST.busy ? '<span class="ps-spin"></span> ' + esc(ST.busy) : "Vorlage einrichten →") + "</button></div></div>" +
      '<h3 class="bc-h3">Eigene Schriften</h3><p class="pd-muted small">TTF, OTF, WOFF oder WOFF2 – stehen im Editor ganz oben in der Schriftauswahl. Bitte nur Schriften hochladen, die ihr verwenden dürft.</p><ul class="bc-fonts">' +
      (ST.fonts.length ? ST.fonts.map(function (f) { return '<li><span class="smp" style="font-family:\'cf-' + esc(f.id) + '\'">Max Mustermann 0123</span><span>' + esc(f.name) + '</span><button type="button" class="ps-link" data-bc="fdel:' + esc(f.id) + '">Entfernen</button></li>'; }).join("") : '<li class="pd-muted">Noch keine eigenen Schriften – 36 Schriften stehen immer zur Auswahl.</li>') +
      '</ul><label class="ps-btn small">+ Schrift hochladen<input type="file" id="bcFont" multiple accept=".ttf,.otf,.woff,.woff2" hidden></label>';
  }
  /* ── Editor ── */
  function E() { return ST.ed; }
  function vEdit() {
    var e = E(), t = e.t, it = e.sel != null ? (t.pages[e.side].items || [])[e.sel] : null, fl = fontList();
    var side = t.pages.length > 1 ? '<div class="bc-seg">' + t.pages.map(function (_, i) { return '<button type="button" data-bc="side:' + i + '" aria-pressed="' + (e.side === i) + '">' + (i ? "Rückseite" : "Vorderseite") + "</button>"; }).join("") + "</div>" : "";
    var panel = "";
    if (it && it.t !== "img") {
      var fo = fontOf(it.font) || {};
      panel = '<div class="bc-props"><h4>Textfeld</h4><label>Bezeichnung<input data-p="label" value="' + esc(it.label) + '" maxlength="30"></label><label>Beispieltext<input data-p="text" value="' + esc(it.text) + '" maxlength="120"></label>' +
        '<label>Schrift<select data-p="font">' + fl.map(function (f) { return '<option value="' + esc(f.family) + '"' + (f.family === it.font ? " selected" : "") + ' style="font-family:\'' + esc(f.family) + '\'">' + esc(f.label) + "</option>"; }).join("") + "</select></label>" +
        '<div class="bc-row"><label>Größe (pt)<input data-p="size" type="number" min="4" max="40" step="0.5" value="' + it.size + '"></label><label>Farbe<input data-p="color" type="color" value="' + esc(it.color || "#000000") + '"></label></div>' +
        '<div class="bc-row"><button type="button" class="bc-tg" data-bc="bold" aria-pressed="' + !!it.bold + '"' + (fo.bold ? "" : " disabled title=\"Diese Schrift hat keinen fetten Schnitt\"") + '><b>F</b> Fett</button><button type="button" class="bc-tg" data-bc="italic" aria-pressed="' + !!it.italic + '"' + (fo.italic ? "" : " disabled") + '><i>K</i> Kursiv</button></div>' +
        '<div class="bc-row bc-al">' + [["left", "Links"], ["center", "Mitte"], ["right", "Rechts"]].map(function (a) { return '<button type="button" class="bc-tg" data-bc="align:' + a[0] + '" aria-pressed="' + (it.align === a[0]) + '">' + a[1] + "</button>"; }).join("") + "</div>" +
        '<div class="bc-row"><label>X (mm)<input data-p="x" type="number" step="0.5" value="' + r1(it.x) + '"></label><label>Grundlinie Y (mm)<input data-p="y" type="number" step="0.5" value="' + r1(it.y) + '"></label><label>Breite (mm)<input data-p="w" type="number" step="1" min="5" value="' + r1(it.w) + '"></label></div>' +
        '<button type="button" class="ps-link bad" data-bc="rm">Feld entfernen</button></div>';
    } else if (it) panel = '<div class="bc-props"><h4>Logo</h4><div class="bc-row"><label>X (mm)<input data-p="x" type="number" step="0.5" value="' + r1(it.x) + '"></label><label>Y (mm)<input data-p="y" type="number" step="0.5" value="' + r1(it.y) + '"></label><label>Breite (mm)<input data-p="iw" type="number" step="0.5" min="3" value="' + r1(it.w) + '"></label></div><p class="pd-muted small">Größe: am blauen Griff rechts unten ziehen oder die Breite eintippen.</p><button type="button" class="ps-link bad" data-bc="rm">Logo entfernen</button></div>';
    else panel = '<div class="bc-props"><p class="pd-muted">Feld oder Logo in der Karte anklicken, um es zu bearbeiten. Verschieben: mit der Maus ziehen oder mit den Pfeiltasten (Umschalt = größere Schritte), Entf entfernt das Feld.</p></div>';
    return '<div class="bc-ed"><div class="bc-top"><button type="button" class="ps-link" data-bc="back">← Zurück</button><input class="bc-name" data-p="tname" value="' + esc(t.name) + '" maxlength="80" aria-label="Name der Vorlage"><span class="sp"></span><button type="button" class="ps-btn small" data-bc="undo"' + (e.hist && e.hist.length ? "" : " disabled") + ' title="Letzte Änderung zurücknehmen (Strg+Z)">↶ Rückgängig</button><button type="button" class="ps-btn primary" data-bc="save">Vorlage speichern</button></div>' +
      '<div class="bc-cols"><div class="bc-stage">' + side + '<div class="bc-cv" id="bcCv">' + cardSvg(t, e.side, null, { edit: true, sel: e.sel, cls: "bc-svg" }) + '</div><p class="pd-muted small">Rot = Schnittkante, blau gestrichelt = 3 mm Sicherheitsabstand. Texte und Logos innerhalb der blauen Linie halten.</p></div>' +
      '<aside class="bc-side"><h4>Feld hinzufügen</h4><div class="bc-add">' + PRESETS.map(function (p) { return '<button type="button" class="ps-btn small" data-bc="add:' + p[0] + '">+ ' + p[1] + "</button>"; }).join("") + '</div><label class="ps-btn small bc-logo">+ Logo (PNG, JPG, PDF)<input type="file" id="bcLogo" accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" hidden></label>' + panel + "</aside></div></div>";
  }
  /* Rückgängig (Prüfung 20.11.2026: ein versehentlich gelöschtes oder verschobenes Feld war nicht zurückzuholen): vor jeder Änderung den Stand der Felder merken */
  function snap(tag) { var e = E(); if (!e) return; var now = Date.now(); if (tag && e.snapTag === tag && now - (e.snapAt || 0) < 1500) { e.snapAt = now; return; }   /* Tippen/Schieben im selben Feld = ein Schritt */
    e.snapTag = tag || ""; e.snapAt = now; e.hist = e.hist || []; e.hist.push({ side: e.side, items: e.t.pages.map(function (pg) { return (pg.items || []).map(function (it) { return Object.assign({}, it); }); }) }); if (e.hist.length > 60) e.hist.shift(); }
  function undo() { var e = E(), h = e && e.hist && e.hist.pop(); if (!h) { toast("Nichts mehr rückgängig zu machen"); return; } h.items.forEach(function (its, i) { if (e.t.pages[i]) e.t.pages[i].items = its; }); e.side = Math.min(h.side, e.t.pages.length - 1); e.sel = null; e.snapTag = ""; paint(); }
  function addField(key) {
    var e = E(), t = e.t, p = PRESETS.filter(function (x) { return x[0] === key; })[0], items = t.pages[e.side].items, n = items.filter(function (x) { return x.t !== "img"; }).length; snap();
    var k = key === "free" ? "free" + (Date.now() % 100000) : key; if (items.some(function (x) { return x.key === k; })) k = key + (n + 1);
    var f0 = fontList().filter(function (f) { return !/^cf-/.test(f.family); })[0] || { family: "Inter" };
    /* unter das letzte Textfeld setzen und dessen linke Kante, Schrift, Farbe und Ausrichtung übernehmen – so stehen die Zeilen von selbst sauber untereinander */
    var last = items.filter(function (x) { return x.t !== "img"; }).slice(-1)[0], fnt = last ? last.font : (ST.fonts[0] ? "cf-" + ST.fonts[0].id : f0.family), fo = fontOf(fnt) || {};
    items.push({ t: "text", key: k, label: p[1], text: p[2], font: fnt, size: p[3], bold: !!(p[4] && fo.bold), italic: false, color: last ? last.color : "#1d1d1f", align: last ? last.align : "left", x: last ? last.x : 6,
      y: last ? r1(Math.min(t.h - 4, last.y + Math.max(4, (last.size + p[3]) / 2 * PT_MM * 1.55))) : 12, w: last ? last.w : t.w - 12 });
    e.sel = items.length - 1; paint();
  }
  function fieldsOf(t) { var out = []; t.pages.forEach(function (p) { (p.items || []).forEach(function (it) { if (it.t !== "img" && !out.some(function (o) { return o.key === it.key; })) out.push({ key: it.key, label: it.label, text: it.text }); }); }); return out; }
  function save() { var e = E(), t = e.t; if (!fieldsOf(t).length) { toast("Bitte mindestens ein Textfeld anlegen (z. B. Name)", true); return; }
    toast("Vorlage wird gespeichert …");
    thumb(t).then(function (pv) { return jfetch("/print/api/account/bc/tpl", { id: t.id || undefined, name: t.name, product: PROD, sel: t.sel, sides: t.pages.length, design: { v: 1, w: t.w, h: t.h, bleed: t.bleed, pages: t.pages }, preview: pv, fields: fieldsOf(t).map(function (f) { return f.label; }) }); })
      .then(function (j) { if (!j.ok) { toast(j.error || "Speichern fehlgeschlagen", true); return; } setFrom(j); t.id = j.id; toast("Vorlage „" + t.name + "“ gespeichert ✓"); ST.view = "list"; ST.ed = null; paint(); }).catch(function () { toast("Keine Verbindung", true); }); }
  function getTpl(id) { var meta = ST.tpls.filter(function (x) { return x.id === id; })[0]; if (!meta) return Promise.reject(new Error("Vorlage nicht gefunden"));
    return jfetch("/print/api/account/bc/tpl/" + encodeURIComponent(id)).then(function (j) { if (!j.ok || !j.design || !j.design.pages) throw new Error(j.error || "Vorlage nicht gefunden"); var d = j.design;
      return { id: id, name: meta.name, sel: meta.sel || Object.assign({}, BASE_SEL, { printtype: d.pages.length > 1 ? "44" : "40" }), w: d.w, h: d.h, bleed: d.bleed, pages: d.pages }; }); }
  /* ── Bestellen ── */
  function vOrder() {
    var o = ST.ord, t = o.t, fs = fieldsOf(t), me = C.me || {}, co = true, pr = o.price;
    return '<div class="bc-ed"><div class="bc-top"><button type="button" class="ps-link" data-bc="back">← Alle Vorlagen</button><b class="bc-tn">' + esc(t.name) + '</b><span class="sp"></span></div>' +
      '<div class="bc-cols"><div class="bc-stage">' + '<div class="bc-pair' + (t.pages.length > 1 ? " two" : "") + '">' + t.pages.map(function (_, i) { return '<figure class="bc-cv sm">' + cardSvg(t, i, o.vals, { cls: "bc-svg", trim: true }) + "<figcaption>" + (i ? "Rückseite" : "Vorderseite") + "</figcaption></figure>"; }).join("") + '</div><p class="pd-muted small">Vorschau im Endformat 85 × 55 mm – so wird die Karte gedruckt.</p></div>' +
      '<aside class="bc-side"><h4>Daten der Person</h4>' + fs.map(function (f) { return '<label class="bc-fld">' + esc(f.label) + (/addr/.test(f.key) ? '<textarea data-v="' + esc(f.key) + '" rows="2">' : '<input data-v="' + esc(f.key) + '" value="') + esc(o.vals[f.key] != null ? o.vals[f.key] : "") + (/addr/.test(f.key) ? "</textarea>" : '" placeholder="' + esc(f.text) + '">') + "</label>"; }).join("") +
      '<label class="bc-fld">Menge<select data-q>' + [100, 250, 500, 1000].map(function (n) { return '<option value="' + n + '"' + (o.copies === n ? " selected" : "") + ">" + n + " Stück</option>"; }).join("") + "</select></label>" +
      '<div class="bc-price">' + (o.busy ? '<span class="ps-spin"></span> Preis wird berechnet …' : pr ? '<b>' + C.eur(pr.net) + '</b> netto <small class="pd-muted">(' + C.eur(pr.gross) + " inkl. USt) · inkl. Versand · Lieferung voraussichtlich " + esc(dShort(pr.deliveryDate)) + "</small>" : '<span class="pd-muted">Preis nicht verfügbar</span>') + "</div>" +
      '<button type="button" class="ps-btn primary bc-go" data-bc="buy"' + (pr && !o.busy ? "" : " disabled") + ">Bestellen →</button>" +
      '<p class="pd-muted small">Leere Felder werden nicht gedruckt. Verrechnung auf Rechnung an ' + esc(me.company || "eure Firma") + ".</p></aside></div></div>";
  }
  function dShort(iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "short" }) : ""; }
  function quote() { var o = ST.ord; o.busy = true; paint();
    jfetch("/print/api/price", { product: PROD, sel: o.t.sel, copies: o.copies, urgency: "standard", pm: "auto", country: "AT", zip: (o.ship && o.ship.zip) || (C.me || {}).zip || "", customerType: "company", uid: (C.me || {}).uid || "" })
      .then(function (j) { o.busy = false; o.price = j.ok ? j.price : null; if (!j.ok) toast(j.error || "Preis nicht verfügbar", true); paint(); }).catch(function () { o.busy = false; paint(); }); }
  function buyPop() {
    var o = ST.ord, me = C.me || {}, s = o.ship || { company: me.company || "", firstName: me.firstName || "", lastName: me.lastName || "", street: me.street || "", zip: me.zip || "", city: me.city || "", phone: me.phone || "" };
    /* Steht im Konto kein Ansprechpartner, den Empfänger aus dem Namensfeld der Karte vorschlagen (statt leerer Felder) – bleibt änderbar */
    var nm = String((o.vals && o.vals.name) || "").replace(/\s+/g, " ").trim(); if (nm && !o.ship && !s.firstName && !s.lastName) { var nmP = nm.split(" "); s.lastName = nmP.length > 1 ? nmP.pop() : ""; s.firstName = nmP.join(" "); }
    if (!(me.type === "company" && me.uidValid)) { toast("Kauf auf Rechnung braucht eine gültige UID – bitte im Profil hinterlegen", true); return; }
    var ov = document.createElement("div"); ov.className = "ps-pop bc-pop"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", "Bestellung bestätigen");
    var f = function (k, l, w) { return '<label class="bc-fld' + (w ? " " + w : "") + '">' + l + '<input data-s="' + k + '" value="' + esc(s[k] || "") + '"></label>'; };
    var inv = [me.company, [me.firstName, me.lastName].join(" "), me.street, [me.zip, me.city].join(" ")].filter(function (x) { return String(x || "").trim(); });
    ov.innerHTML = '<div class="ps-pop-c"><button type="button" class="bc-pop-x" data-x aria-label="Schließen">×</button><div class="bc-pop-b">' +
      '<h3>Bestellung bestätigen</h3><div class="bc-pop-sum"><span>' + esc(o.t.name) + '</span><span>' + o.copies + ' Stück</span><b>' + C.eur(o.price.net) + ' netto</b></div>' +
      '<section class="bc-pop-s"><h4>Lieferadresse (Standort)</h4><div class="bc-grid2">' + f("company", "Firma / Standort", "w2") + f("firstName", "Vorname", "t3") + f("lastName", "Nachname", "t3") + f("phone", "Telefon (Paketdienst)", "t3") + f("street", "Straße & Nr.", "w2") + f("zip", "PLZ", "zp") + f("city", "Ort", "ct") + "</div></section>" +
      '<section class="bc-pop-s"><h4>Rechnung an</h4><div class="bc-pop-inv">' + "<b>" + esc(inv[0] || "") + "</b>" + (me.uid ? ' <span class="pd-muted">· UID ' + esc(me.uid) + "</span>" : "") + "<br>" + esc(inv.slice(1).join(" · ")) + "</div></section>" +
      '<label class="ps-cb bc-pop-cb"><input type="checkbox" data-agb><span>Ich bestelle verbindlich auf Rechnung – es gelten die <a href="/print/agb" target="_blank" rel="noopener">AGB</a>. Die Vorschau habe ich geprüft.</span></label></div>' +
      '<div class="bc-pop-f"><button type="button" class="ps-btn" data-x>Abbrechen</button><button type="button" class="ps-btn primary" data-ok>Jetzt bestellen</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (ev) { if (ev.target === ov || ev.target.closest("[data-x]")) { close(); return; }
      if (!ev.target.closest("[data-ok]")) return; var sh = {}; [].forEach.call(ov.querySelectorAll("[data-s]"), function (i) { sh[i.getAttribute("data-s")] = i.value.trim(); });
      var miss = ["firstName", "lastName", "street", "zip", "city", "phone"].filter(function (k) { return !sh[k]; }); if (miss.length || !/^\d{4}$/.test(sh.zip)) { toast("Bitte die Lieferadresse vollständig ausfüllen (PLZ 4-stellig, Telefon)", true); return; }
      if (!ov.querySelector("[data-agb]").checked) { toast("Bitte die Bestellung bestätigen (Häkchen)", true); return; }
      o.ship = sh; var bt = ev.target.closest("[data-ok]"); bt.disabled = true; bt.innerHTML = '<span class="ps-spin"></span> Wird bestellt …'; order(sh).then(function (r) { close(); if (r) { ST.done = r; paint(); } }, function () { bt.disabled = false; bt.textContent = "Jetzt bestellen"; }); });
  }
  function order(sh) {
    var o = ST.ord, t = o.t, me = C.me || {};
    var pages = t.pages.map(function (_, i) { return cardSvg(t, i, o.vals, {}); });
    return jfetch("/print/api/design", { product: PROD, sel: t.sel, copies: o.copies, urgency: "standard", pages: pages }).then(function (f) {
      if (!f.ok) throw new Error(f.error || "Druckdatei konnte nicht erstellt werden");
      if (f.blocked) throw new Error("Die Druckdatei hat Fehler – bitte die Vorlage prüfen");
      var cust = { type: "company", company: me.company, uid: me.uid, firstName: me.firstName || sh.firstName, lastName: me.lastName || sh.lastName, street: me.street, zip: me.zip, city: me.city, country: "AT", email: me.email, phone: me.phone || sh.phone };
      var ship = { company: sh.company, firstName: sh.firstName, lastName: sh.lastName, street: sh.street, zip: sh.zip, city: sh.city, country: "AT", phone: sh.phone };
      var item = { product: PROD, sel: t.sel, copies: o.copies, urgency: "standard", pm: "auto", fileId: f.fileId, fileToken: f.token, check: "self" };
      var body = function (exp) { return { items: [Object.assign({}, item, { expectedGross: exp })], customer: cust, shipTo: ship, ship: ship, payment: "invoice", check: "self", acceptTerms: true, acceptFagg: true, acceptProof: true, origin: { land: "/print/konto/visitenkarten" } }; };
      return jfetch("/print/api/checkout", body(o.price.gross)).then(function (j) { if (!j.ok && j.price) return jfetch("/print/api/checkout", body(j.price.gross)); return j; });
    }).then(function (j) { if (!j.ok) throw new Error(j.error || "Bestellung fehlgeschlagen"); toast("Bestellt ✓ – " + j.nr); if (C.onOrder) C.onOrder(); return { nr: j.nr, name: o.vals.name || "" }; })
      .catch(function (e) { toast(e.message || "Bestellung fehlgeschlagen", true); throw e; });
  }
  function vDone() { var d = ST.done; return '<div class="bc-done"><div class="ic">✓</div><h2>Bestellt!</h2><p>' + (d.name ? "Visitenkarten für <b>" + esc(d.name) + "</b> – " : "") + "Bestellnummer <b>" + esc(d.nr) + "</b>. Die Rechnung kommt an die hinterlegte Firmenadresse.</p>" +
    '<div class="ac"><button type="button" class="ps-btn primary" data-bc="again">Nächste Person bestellen</button><button type="button" class="ps-btn" data-bc="back">Zu den Vorlagen</button></div></div>'; }

  /* ════════ Ereignisse ════════ */
  function after() {
    var el = C.el; if (ST.done && ST.view === "order") { el.innerHTML = vDone(); }
    var cv = el.querySelector("#bcCv svg"); if (cv && ST.view === "edit") drag(cv);
  }
  function drag(svg) {
    var e = E(), t = e.t, W = t.w + 2 * t.bleed, H = t.h + 2 * t.bleed;
    /* immer die gerade angezeigte Karte vermessen: paint() ersetzt das SVG, eine alte (abgehängte) Fläche hat Breite 0 */
    var pt = function (ev) { var cur = (C.el && C.el.querySelector("#bcCv svg")) || svg, r = cur.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return null; return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H }; };
    svg.addEventListener("pointerdown", function (ev) { var hn = ev.target.closest("[data-h]");
      if (hn) { var hi = +hn.getAttribute("data-h"), im = t.pages[e.side].items[hi], q0 = pt(ev), w0 = im && im.w, h0 = im && im.h, did = false; ev.preventDefault(); if (!im || !q0) return;
        var rmv = function (m) { var q = pt(m); if (!q) return; var nw = Math.max(3, Math.min(t.w + 2 * t.bleed, w0 + (q.x - q0.x))); if (!isFinite(nw)) return; if (!did) { snap(); did = true; } im.w = r1(nw); im.h = r1(nw * h0 / w0); live(); };
        var rup = function () { window.removeEventListener("pointermove", rmv); window.removeEventListener("pointerup", rup); window.removeEventListener("pointercancel", rup); if (did) paint(); };
        window.addEventListener("pointermove", rmv); window.addEventListener("pointerup", rup); window.addEventListener("pointercancel", rup); return; }
      var n = ev.target.closest("[data-i]"); if (!n) { if (e.sel != null) { e.sel = null; paint(); } return; }
      var i = +n.getAttribute("data-i"), it = t.pages[e.side].items[i], p0 = pt(ev), x0 = it.x, y0 = it.y, moved = false; ev.preventDefault(); if (!it || !p0) return;
      /* Einrasten (0,7 mm): Sicherheitsabstand links/oben und linke Kanten der anderen Felder – Zeilen stehen ohne Zielen bündig */
      var snapX = [3].concat(t.pages[e.side].items.filter(function (o, k) { return k !== i; }).map(function (o) { return o.x; })), near = function (v, list) { for (var k = 0; k < list.length; k++) if (Math.abs(v - list[k]) < 0.7) return list[k]; return v; };
      if (e.sel !== i) { e.sel = i; paint(); }
      var mv = function (m) { var p = pt(m); if (!p) return; var nx = x0 + p.x - p0.x, ny = y0 + p.y - p0.y; if (!isFinite(nx) || !isFinite(ny)) return;
        if (!moved && Math.abs(p.x - p0.x) < 0.3 && Math.abs(p.y - p0.y) < 0.3) return;   /* reiner Klick = nur auswählen */
        if (!moved) snap(); if (!m.altKey) { nx = near(nx, snapX); if (it.t === "img") ny = near(ny, [3]); }   /* Alt gedrückt = frei, ohne Einrasten */
        it.x = r1(Math.max(-t.bleed, Math.min(t.w + t.bleed - 3, nx))); it.y = r1(Math.max(it.t === "img" ? -t.bleed : 1, Math.min(t.h + t.bleed, ny))); moved = true; liveMove(i); };
      var up = function () { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); if (moved) paint(); };
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up); });
  }
  /* beim Ziehen nur das bewegte Feld versetzen (kein Neuaufbau der Karte mit dem großen Hintergrundbild je Mausbewegung) */
  function liveMove(i) { var e = E(), t = e.t, it = t.pages[e.side].items[i], svg = C.el.querySelector("#bcCv svg"), b = t.bleed; if (!svg || !it) return;
    [].forEach.call(svg.querySelectorAll('[data-i="' + i + '"]'), function (n) { var g = boxOf(t, it);
      if (n.classList.contains("bc-box")) { n.setAttribute("x", g.x); n.setAttribute("y", g.y); var hd = svg.querySelector('[data-h="' + i + '"]'); if (hd) { hd.setAttribute("x", r1(it.x + b + it.w - 1.3)); hd.setAttribute("y", r1(it.y + b + it.h - 1.3)); } }
      else if (it.t === "img") { n.setAttribute("x", r1(it.x + b)); n.setAttribute("y", r1(it.y + b)); }
      else { var ax = r1(it.x + b + (it.align === "center" ? it.w / 2 : it.align === "right" ? it.w : 0)); n.setAttribute("x", ax); n.setAttribute("y", r1(it.y + b)); [].forEach.call(n.querySelectorAll("tspan"), function (ts) { ts.setAttribute("x", ax); }); } }); }
  function live() { var e = E(), cv = C.el.querySelector("#bcCv"); if (cv) { cv.innerHTML = cardSvg(e.t, e.side, null, { edit: true, sel: e.sel, cls: "bc-svg" }); var svg = cv.querySelector("svg"); if (svg) drag(svg); } }
  /* Tastatur im Editor (nicht während der Eingabe in ein Feld): Pfeile verschieben das gewählte Feld um 0,5 mm (Umschalt 2 mm), Entf entfernt es, Esc hebt die Auswahl auf */
  function onKey(ev) { if (!C || !C.el || !document.body.contains(C.el) || ST.view !== "edit") return; var e = E(), tg = ev.target; if (!e) return;
    if (tg && (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable)) return;
    if ((ev.metaKey || ev.ctrlKey) && !ev.shiftKey && String(ev.key).toLowerCase() === "z") { ev.preventDefault(); undo(); return; }
    if (ev.metaKey || ev.ctrlKey || ev.altKey || e.sel == null) return;
    var it = e.t.pages[e.side].items[e.sel], k = ev.key, d = ev.shiftKey ? 2 : 0.5; if (!it) return;
    if (k === "Escape") { e.sel = null; paint(); return; }
    if (k === "Delete" || k === "Backspace") { ev.preventDefault(); snap(); e.t.pages[e.side].items.splice(e.sel, 1); e.sel = null; paint(); return; }
    var dx = k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0, dy = k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0; if (!dx && !dy) return;
    ev.preventDefault(); snap("key" + e.sel); it.x = r1(it.x + dx); it.y = r1(it.y + dy); paint(); }
  function onClick(ev) {
    var b = ev.target.closest("[data-bc]"); if (!b || !C.el.contains(b)) return; var a = b.getAttribute("data-bc"), i = a.indexOf(":"), k = i < 0 ? a : a.slice(0, i), v = i < 0 ? "" : a.slice(i + 1);
    if (k === "back") { ST.view = "list"; ST.ed = null; ST.ord = null; ST.done = null; paint(); return; }
    if (k === "new") return newTpl();
    if (k === "edit" || k === "order") { toast(k === "edit" ? "Vorlage wird geöffnet …" : "Karte wird vorbereitet …"); getTpl(v).then(function (t) { if (k === "edit") { ST.ed = { t: t, side: 0, sel: null }; ST.view = "edit"; paint(); }
        else { var vals = {}; fieldsOf(t).forEach(function (f) { vals[f.key] = ""; }); ST.ord = { t: t, vals: vals, copies: 100, price: null }; ST.done = null; ST.view = "order"; paint(); quote(); } }).catch(function (e2) { toast(e2.message, true); }); return; }
    if (k === "del") { var t0 = ST.tpls.filter(function (x) { return x.id === v; })[0]; if (t0 && confirm("Vorlage „" + t0.name + "“ löschen?")) jfetch("/print/api/account/bc/tpl-del", { id: v }).then(function (j) { setFrom(j); paint(); }); return; }
    if (k === "fdel") { if (confirm("Schrift entfernen? Vorlagen mit dieser Schrift zeigen dann eine Ersatzschrift.")) jfetch("/print/api/account/bc/font-del", { id: v }).then(function (j) { setFrom(j); paint(); }); return; }
    if (k === "side") { E().side = +v; E().sel = null; paint(); return; }
    if (k === "add") return addField(v);
    if (k === "save") return save();
    if (k === "undo") return undo();
    if (k === "rm") { var e = E(); snap(); e.t.pages[e.side].items.splice(e.sel, 1); e.sel = null; paint(); return; }
    if (k === "bold" || k === "italic") { var it = E().t.pages[E().side].items[E().sel]; snap(); it[k] = !it[k]; paint(); return; }
    if (k === "align") { var it2 = E().t.pages[E().side].items[E().sel]; snap(); it2.align = v; paint(); return; }
    if (k === "buy") return buyPop();
    if (k === "again") { var o = ST.ord; Object.keys(o.vals).forEach(function (x) { o.vals[x] = ""; }); ST.done = null; paint(); var f0 = C.el.querySelector("[data-v]"); if (f0) f0.focus(); return; }
  }
  function onInput(ev) {
    var x = ev.target; if (!C.el.contains(x)) return;
    if (x.hasAttribute("data-v")) { ST.ord.vals[x.getAttribute("data-v")] = x.value; [].forEach.call(C.el.querySelectorAll(".bc-stage .bc-cv"), function (cv, i) { var sv = cv.querySelector("svg"); if (sv) sv.outerHTML = cardSvg(ST.ord.t, i, ST.ord.vals, { cls: "bc-svg", trim: true }); }); return; }
    if (x.hasAttribute("data-q") && ev.type === "change") { ST.ord.copies = +x.value; quote(); return; }
    var p = x.getAttribute("data-p"); if (!p || !ST.ed) return; var e = E();
    if (p === "tname") { e.t.name = x.value; return; }
    var it = e.t.pages[e.side].items[e.sel]; if (!it) return; snap("in" + p + e.sel);
    if (p === "size" || p === "x" || p === "y" || p === "w") { var n = parseFloat(String(x.value).replace(",", ".")); if (!isFinite(n)) return; it[p] = n; }
    else if (p === "iw") { var n2 = parseFloat(x.value); if (!(n2 > 0)) return; var k2 = n2 / it.w; it.w = n2; it.h = r1(it.h * k2); }
    else if (p === "font") { it.font = x.value; var fo = fontOf(it.font) || {}; if (!fo.bold) it.bold = false; if (!fo.italic) it.italic = false; if (ev.type === "change") { paint(); return; } }
    else it[p] = x.value;
    live();
  }
  function onChange(ev) {
    var x = ev.target; if (!C.el.contains(x)) return;
    if (x.id === "bcFont") { upFonts(x.files); return; }
    if (x.id === "bcLogo" && x.files && x.files[0]) { var e = E(); toImg(x.files[0], 1, true).then(function (im) { var w = 25, h = r1(w * im.h / im.w); snap(); e.t.pages[e.side].items.push({ t: "img", src: im.src, x: e.t.w - w - 6, y: 6, w: w, h: h }); e.sel = e.t.pages[e.side].items.length - 1; paint(); }).catch(function (er) { toast(er.message, true); }); return; }
    onInput(ev);
  }
  function upFonts(files) { var l = Array.prototype.slice.call(files || []), i = 0;
    var nx = function () { if (i >= l.length) { paint(); return; } var f = l[i++]; toast("Schrift „" + f.name + "“ wird hochgeladen …");
      fetch("/print/api/account/bc/font", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(f.name), "X-Font-Name": encodeURIComponent(f.name.replace(/\.(ttf|otf|woff2?)$/i, "").replace(/[-_]+/g, " ")) }, body: f })
        .then(function (r) { return r.json(); }).then(function (j) { if (!j.ok) toast(j.error || "Upload fehlgeschlagen", true); else { setFrom(j); toast("Schrift „" + f.name + "“ hinzugefügt ✓"); } nx(); }).catch(function () { toast("Keine Verbindung", true); nx(); }); };
    nx(); }
  function newTpl() {
    var fF = C.el.querySelector("#bcF"), fB = C.el.querySelector("#bcB"), front = fF && fF.files[0], back = fB && fB.files[0];
    if (!front) { toast("Bitte die Vorderseite (leeres Design) auswählen", true); return; }
    ST.busy = "Design wird gelesen …"; paint();
    toImg(front, 1).then(function (a) { return (back ? toImg(back, 1) : a.pages > 1 ? toImg(front, 2) : Promise.resolve(null)).then(function (bk) { return [a, bk]; }); })
      .then(function (ims) { var sides = ims[1] ? 2 : 1; return prodInfo(sides).then(function (pi) { ST.busy = ""; ST.ed = { t: { id: "", name: "Visitenkarte " + (ST.tpls.length + 1), sel: pi.sel, w: pi.w, h: pi.h, bleed: pi.bleed, pages: [{ bg: ims[0].src, items: [] }].concat(ims[1] ? [{ bg: ims[1].src, items: [] }] : []) }, side: 0, sel: null }; ST.view = "edit"; addField("name"); addField("role"); ST.ed.hist = []; paint(); toast("Felder verschieben, Schrift wählen, dann „Vorlage speichern“"); }); })
      .catch(function (e) { ST.busy = ""; paint(); toast(e.message || "Design konnte nicht gelesen werden", true); });
  }
  var bound = null;
  window.PrintBCard = {
    mount: function (el, ctx) { C = Object.assign({}, ctx, { el: el });
      if (bound !== el) { if (!bound) document.addEventListener("keydown", onKey); bound = el; el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("change", onChange); }
      if (!ST.tpls) { paint(); load().then(paint); } else paint(); }
  };
})();
