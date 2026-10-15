/* FS Creative Druckshop – Ablauf auf /print: 1 Produkt → 2 Optionen & Menge (Live-Preis) → 3 Gestalten/Hochladen → 4 Adresse → 5 Prüfen & Bezahlen.
   Preise kommen immer vom Server (/print/api/price), bestellt wird über /print/api/order; der Designer (/print/designer.js) wird erst in Schritt 3 geladen. */
(function () {
  "use strict";
  var root = document.getElementById("shop");
  if (!root) return;
  var H = { "Content-Type": "application/json", "X-Print-Shop": "1" };
  var S = { cat: null, step: 1, prod: null, sel: {}, copies: 0, urgency: "standard", country: "AT", zip: "", ctype: "private", uid: "", uidRes: null,
    price: null, priceErr: "", priceBusy: false, file: null, previews: null, design: null, mode: "", customer: { country: "AT" }, payment: "", accept: {}, busy: false, err: "" };
  var STEPS = ["Produkt", "Ausführung", "Gestalten", "Lieferung", "Prüfen & Bezahlen"];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var eur = function (n) { return (+n || 0).toLocaleString("de-AT", { style: "currency", currency: "EUR" }); };
  var deDate = function (iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ""; var d = new Date(+m[1], +m[2] - 1, +m[3]); return d.toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long" }); };
  function api(path, body, method) {
    return fetch(path, { method: method || (body ? "POST" : "GET"), headers: body ? H : {}, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Fehler " + r.status }; }).then(function (j) { j.status = r.status; return j; }); });
  }
  var toastT;
  function toast(msg, bad) { var t = document.getElementById("psToast"); if (!t) { t = document.createElement("div"); t.id = "psToast"; t.className = "ps-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.className = "ps-toast on" + (bad ? " bad" : ""); clearTimeout(toastT); toastT = setTimeout(function () { t.className = "ps-toast"; }, bad ? 5000 : 2600); }
  window.PrintShop = { toast: toast, api: api, esc: esc };

  // ── Start ──
  var q = new URLSearchParams(location.search);
  api("/print/api/catalog").then(function (c) {
    document.getElementById("psLoading").hidden = true;
    if (!c || !c.ready) { document.getElementById("psSetup").hidden = false; return; }
    S.cat = c;
    if (q.get("bestellung") && q.get("t")) return showStatus(q.get("bestellung"), q.get("t"));
    if (q.get("entwurf") && q.get("t")) return loadDraft(q.get("entwurf"), q.get("t"));
    var pk = q.get("produkt"); if (pk && c.products.some(function (p) { return p.key === pk; })) { pickProduct(pk); S.step = 2; }
    render();
  }).catch(function () { document.getElementById("psLoading").hidden = true; document.getElementById("psSetup").hidden = false; });

  function prodByKey(k) { return (S.cat.products || []).filter(function (p) { return p.key === k; })[0] || null; }
  function excluded(sel) { var p = S.prod, all = Object.assign({}, p.fixed || {}, sel); return (p.excludes || []).some(function (rule) { return rule.every(function (x) { return all[x.property] != null && x.options.indexOf(String(all[x.property])) > -1; }); }); }
  function fixSel() { // ausgeschlossene Kombination → erste mögliche Option nehmen
    var p = S.prod; if (!excluded(S.sel)) return;
    for (var i = p.props.length - 1; i >= 0; i--) { var pr = p.props[i]; for (var k = 0; k < pr.options.length; k++) { var t = Object.assign({}, S.sel); t[pr.slug] = pr.options[k].slug; if (!excluded(t)) { S.sel = t; return; } } }
  }
  function pickProduct(key) {
    var p = prodByKey(key); if (!p) return;
    if (!S.prod || S.prod.key !== key) { S.prod = p; S.sel = {}; p.props.forEach(function (pr) { S.sel[pr.slug] = pr.options[0].slug; }); S.copies = p.tiers[Math.min(1, p.tiers.length - 1)]; S.urgency = (p.urgency[0] || {}).slug || "standard"; S.file = null; S.previews = null; S.design = null; S.price = null; fixSel(); }
    loadPrice();
  }
  function sizeOf() { var sp = S.prod.props.filter(function (x) { return x.slug === "size"; })[0]; var o = sp && sp.options.filter(function (x) { return x.slug === S.sel.size; })[0]; return o && o.w ? { w: o.w, h: o.h } : (S.price && S.price.size) || null; }
  function sides() { var m = String((S.sel.printtype || (S.prod.fixed || {}).printtype) || "").match(/^(\d)(\d)$/); return m && m[2] !== "0" ? 2 : 1; }
  function labelOf(slug) { var pr = S.prod.props.filter(function (x) { return x.slug === slug; })[0]; var o = pr && pr.options.filter(function (x) { return x.slug === S.sel[slug]; })[0]; return o ? o.name : ""; }

  // ── Preis ──
  var pT, pSeq = 0;
  function loadPrice() {
    clearTimeout(pT); S.priceBusy = true; renderPrice();
    pT = setTimeout(function () {
      var seq = ++pSeq;
      api("/print/api/price", { product: S.prod.key, sel: S.sel, copies: S.copies, urgency: S.urgency, country: S.customer.country || S.country, zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "" }).then(function (j) {
        if (seq !== pSeq) return; S.priceBusy = false;
        if (j.ok) { S.price = j.price; S.price.size = j.size; S.price.bleed = j.bleed; S.price.sides = j.sides; S.priceErr = ""; } else { S.price = null; S.priceErr = j.error || "Preis nicht verfügbar"; }
        renderPrice();
      }).catch(function () { if (seq !== pSeq) return; S.priceBusy = false; S.priceErr = "Keine Verbindung"; renderPrice(); });
    }, 220);
  }
  function priceHtml(compact) {
    if (!S.prod) return "";
    var p = S.price, co = S.ctype === "company";
    var what = '<p class="what">' + esc(S.prod.title) + " · " + S.copies + " Stk." + (labelOf("size") ? " · " + esc(labelOf("size")) : "") + "</p>";
    if (S.priceErr && !S.priceBusy) return what + '<p class="err">' + esc(S.priceErr) + "</p>";
    if (!p) return what + '<p class="note"><span class="ps-spin"></span> Preis wird berechnet …</p>';
    var main = co ? p.net : p.gross;
    return what + '<div class="sum' + (S.priceBusy ? " loading" : "") + '">' + eur(main) + "</div>" +
      '<p class="note">' + (co ? "netto zzgl. " + p.rate + " % USt" + (p.rate ? " (" + eur(p.gross) + " brutto)" : "") : "inkl. " + p.rate + " % USt") + " · inkl. Versand nach " + (S.customer.country === "DE" ? "Deutschland" : "Österreich") + "</p>" +
      (compact ? "" : '<dl><dt>Stückpreis</dt><dd>' + eur(main / S.copies) + "</dd>" + (p.deliveryDate ? "<dt>Lieferung voraussichtlich</dt><dd>" + esc(deDate(p.deliveryDate)) + "</dd>" : "") + "</dl>") +
      (p.taxNote ? '<p class="note">' + esc(p.taxNote) + "</p>" : "");
  }
  function renderPrice() {
    var b = document.getElementById("psPrice"); if (b) b.innerHTML = '<h3>Dein Preis</h3>' + priceHtml(false);
    var m = document.getElementById("psMbar"); if (m && S.prod) { var p = S.price; m.querySelector(".mp").innerHTML = p ? "<b>" + eur(S.ctype === "company" ? p.net : p.gross) + "</b><small>" + (S.ctype === "company" ? "netto" : "inkl. USt") + " · inkl. Versand</small>" : '<small>' + (S.priceErr ? esc(S.priceErr) : "Preis wird berechnet …") + "</small>"; }
    var nx = document.getElementById("psNext2"); if (nx) nx.disabled = !S.price || S.priceBusy;
  }

  // ── Darstellung ──
  function stepsHtml() {
    return '<ol class="ps-steps" aria-label="Bestellschritte">' + STEPS.map(function (t, i) { var n = i + 1, cur = n === S.step, done = n < S.step;
      return '<li class="' + (done ? "done" : "") + '"' + (cur ? ' aria-current="step"' : "") + '><button type="button" data-go="' + n + '"' + (done ? "" : " disabled") + '><span class="n">' + (done ? "✓" : n) + '</span><span class="t">' + t + "</span></button></li>"; }).join("") + "</ol>";
  }
  function render() {
    var h = stepsHtml();
    if (S.step === 1) h += vProducts(); else if (S.step === 2) h += vOptions(); else if (S.step === 3) h += vDesign(); else if (S.step === 4) h += vAddress(); else h += vCheckout();
    root.innerHTML = h;
    if (S.step === 2 || S.step === 3 || S.step === 4) { var mb = document.createElement("div"); mb.className = "ps-mbar"; mb.id = "psMbar"; mb.innerHTML = '<div class="mp"></div>' + (S.step === 2 ? '<button type="button" class="ps-btn primary small" data-act="next2">Weiter</button>' : ""); root.appendChild(mb); renderPrice(); }
    if (S.step === 2) renderPrice();
  }
  function go(n) { S.step = n; S.err = ""; render(); var y = root.getBoundingClientRect().top + window.scrollY - 80; if (Math.abs(window.scrollY - y) > 40) window.scrollTo({ top: Math.max(0, y), behavior: "smooth" }); var f = root.querySelector("h2"); if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); } }

  function vProducts() {
    return '<div class="ps-panel"><h2>Was möchtest du drucken?</h2><p class="sub">Alle Preise inkl. Versand nach Österreich und Deutschland.</p><div class="ps-products">' +
      S.cat.products.map(function (p) { return '<button type="button" class="ps-prod" data-prod="' + esc(p.key) + '" aria-pressed="' + (S.prod && S.prod.key === p.key) + '"><span class="ic" aria-hidden="true">' + esc(p.icon) + "</span><b>" + esc(p.title) + "</b><span>" + esc(p.desc) + '</span><span class="tag">' + (p.designer ? "Online gestalten oder hochladen" : "Druckdatei hochladen") + "</span></button>"; }).join("") + "</div></div>";
  }
  function chips(name, opts, cur, dis) {
    return '<div class="ps-chips" role="radiogroup">' + opts.map(function (o) { return '<label class="ps-chip"><input type="radio" name="' + esc(name) + '" value="' + esc(o.slug) + '"' + (String(cur) === String(o.slug) ? " checked" : "") + (dis && dis(o) ? " disabled" : "") + "><span>" + esc(o.name) + "</span></label>"; }).join("") + "</div>";
  }
  function vOptions() {
    var p = S.prod;
    var props = p.props.map(function (pr) {
      var dis = function (o) { var t = Object.assign({}, S.sel); t[pr.slug] = o.slug; return excluded(t); };
      return '<fieldset class="ps-opt"><legend>' + esc(pr.title) + "</legend>" + (pr.options.length > 8 ? '<select class="ps-sel" data-prop="' + esc(pr.slug) + '">' + pr.options.map(function (o) { return '<option value="' + esc(o.slug) + '"' + (S.sel[pr.slug] === o.slug ? " selected" : "") + (dis(o) ? " disabled" : "") + ">" + esc(o.name) + "</option>"; }).join("") + "</select>" : chips("prop:" + pr.slug, pr.options, S.sel[pr.slug], dis)) + "</fieldset>";
    }).join("");
    var cp = '<fieldset class="ps-opt"><legend>Auflage</legend>' + chips("copies", p.tiers.map(function (n) { return { slug: n, name: n.toLocaleString("de-AT") + " Stk." }; }), S.copies) + "</fieldset>";
    var ur = p.urgency.length > 1 ? '<fieldset class="ps-opt"><legend>Produktion</legend>' + chips("urgency", p.urgency, S.urgency) + "</fieldset>" : "";
    var who = '<fieldset class="ps-opt"><legend>Preise anzeigen für</legend><div class="ps-row2"><div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-ctype="private" aria-pressed="' + (S.ctype === "private") + '">Privat</button><button type="button" data-ctype="company" aria-pressed="' + (S.ctype === "company") + '">Firma</button></div>' +
      '<select class="ps-sel" data-country aria-label="Lieferland">' + S.cat.countries.map(function (c) { return '<option value="' + c.code + '"' + ((S.customer.country || "AT") === c.code ? " selected" : "") + ">Lieferung nach " + esc(c.name) + "</option>"; }).join("") + "</select></div></fieldset>";
    return '<div class="ps-layout"><div class="ps-panel"><h2>' + esc(p.title) + ' – Ausführung</h2><p class="sub">Der Preis aktualisiert sich bei jeder Änderung.</p>' + props + cp + ur + who +
      '<div class="ps-nav"><button type="button" class="ps-btn" data-go="1">Zurück</button><button type="button" class="ps-btn primary" id="psNext2" data-act="next2">Weiter zur Gestaltung</button></div></div>' +
      '<aside class="ps-price" id="psPrice" aria-live="polite"></aside></div>';
  }
  function vDesign() {
    var p = S.prod, sz = sizeOf(), sd = sides(), b = (S.price && S.price.bleed) || p.bleed;
    var spec = sz ? sz.w + " × " + sz.h + " mm" + " (mit Beschnitt " + (sz.w + 2 * b) + " × " + (sz.h + 2 * b) + " mm)" : "";
    var h = '<div class="ps-panel"><h2>Gestalten oder Datei hochladen</h2><p class="sub">' + esc(p.title) + (spec ? " · Endformat " + esc(spec) : "") + " · " + (sd === 2 ? (p.key === "folder" ? "Außen- und Innenseite" : "Vorder- und Rückseite") : "einseitig") + "</p>";
    if (S.file) {
      h += '<div class="ps-file"><div><b>' + (S.file.kind === "design" ? "Deine Gestaltung" : esc(S.file.name)) + '</b><div class="pd-muted">' + (S.file.pages || "?") + " Seite(n) · " + (S.file.blocked ? "<span style=\"color:var(--ps-bad)\">bitte korrigieren</span>" : "bereit zum Druck") + '</div></div><div class="ps-row2" style="display:flex;gap:8px;flex-wrap:wrap">' +
        (S.file.kind === "design" ? '<button type="button" class="ps-btn small" data-act="editdesign">Weiter bearbeiten</button>' : "") +
        '<a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">PDF ansehen</a><button type="button" class="ps-btn small" data-act="clearfile">Andere Datei</button></div></div>' + checksHtml(S.file.checks);
      if (S.file.preflight && S.file.preflight.status === "PROCESSING") h += '<p class="pd-muted" style="margin-top:8px"><span class="ps-spin"></span> Print.com prüft die Datei zusätzlich …</p>';
    } else if (S.mode === "upload") {
      h += '<label class="ps-drop" id="psDrop"><input type="file" id="psFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><span style="font-size:30px" aria-hidden="true">📄</span><b>Datei auswählen oder hierher ziehen</b><small>PDF (empfohlen), JPG oder PNG · max. 50 MB · ' + esc(spec) + (sd === 2 ? " · 2 Seiten" : "") + '</small><div class="ps-prog" id="psProg" hidden><i></i></div></label><div id="psUpErr"></div>' +
        '<p class="ps-terms">Tipp: PDF im Endformat plus ' + b + ' mm Beschnitt an jeder Seite, Schriften eingebettet, Bilder mit 300 dpi. <button type="button" class="ps-link" data-act="mode:">Zurück zur Auswahl</button></p>';
    } else {
      h += '<div class="ps-modes"><button type="button" class="ps-mode" data-act="mode:design"' + (p.designer && sz ? "" : " disabled") + '><span class="ic" aria-hidden="true">🎨</span><b>Online gestalten</b><span>' + (p.designer && sz ? "Mit Vorlagen, eigenen Texten, Logo und Bildern – Beschnitt und Sicherheitsabstand werden angezeigt." : "Für dieses Produkt bitte eine Druckdatei hochladen.") + '</span></button>' +
        '<button type="button" class="ps-mode" data-act="mode:upload"><span class="ic" aria-hidden="true">⬆️</span><b>Druckdatei hochladen</b><span>Du hast schon eine fertige PDF (oder JPG/PNG)? Wir prüfen Format, Seiten und Auflösung automatisch.</span></button></div>';
    }
    return h + '<div class="ps-nav"><button type="button" class="ps-btn" data-go="2">Zurück</button><button type="button" class="ps-btn primary" data-act="next3"' + (S.file && !S.file.blocked ? "" : " disabled") + ">Weiter zur Lieferung</button></div></div>";
  }
  function checksHtml(list) { return list && list.length ? '<ul class="ps-checks">' + list.map(function (c) { return '<li class="' + esc(c.level) + '">' + esc(c.text) + "</li>"; }).join("") + "</ul>" : ""; }
  function field(id, label, val, attrs, hint) { return '<div class="ps-field"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" value="' + esc(val || "") + '" ' + (attrs || "") + ">" + (hint || "") + "</div>"; }
  function vAddress() {
    var c = S.customer, co = S.ctype === "company";
    var uidHint = S.uidRes ? (S.uidRes.valid ? '<span class="hint ok">✓ gültig' + (S.uidRes.name ? " – " + esc(S.uidRes.name) : "") + "</span>" : '<span class="hint bad">' + esc(S.uidRes.why || "UID ungültig") + "</span>") : '<span class="hint">Mit gültiger UID: Kauf auf Rechnung möglich, in Deutschland steuerfreie Lieferung.</span>';
    return '<div class="ps-layout"><div class="ps-panel"><h2>Lieferadresse &amp; Kontakt</h2><p class="sub">Wir liefern nach Österreich und Deutschland. Die Rechnung geht an diese Adresse.</p><form class="ps-form" id="psAddr" novalidate autocomplete="on">' +
      '<div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-ctype="private" aria-pressed="' + !co + '">Privat</button><button type="button" data-ctype="company" aria-pressed="' + co + '">Firma</button></div>' +
      (co ? '<div class="ps-row2">' + field("company", "Firma *", c.company, 'autocomplete="organization" required') + '<div class="ps-field"><label for="uid">UID-Nummer</label><div class="ps-uidrow"><input id="uid" name="uid" value="' + esc(S.uid) + '" placeholder="z. B. ATU12345678" autocapitalize="characters"><button type="button" class="ps-btn small" data-act="uidcheck">Prüfen</button></div>' + uidHint + "</div></div>" : "") +
      '<div class="ps-row2">' + field("firstName", "Vorname *", c.firstName, 'autocomplete="given-name" required') + field("lastName", "Nachname *", c.lastName, 'autocomplete="family-name" required') + "</div>" +
      field("street", "Straße und Hausnummer *", c.street, 'autocomplete="street-address" required') +
      '<div class="ps-row2"><div class="ps-row2">' + field("zip", "PLZ *", c.zip, 'autocomplete="postal-code" inputmode="numeric" required') + field("city", "Ort *", c.city, 'autocomplete="address-level2" required') + '</div><div class="ps-field"><label for="country">Land *</label><select id="country" name="country" autocomplete="country">' + S.cat.countries.map(function (x) { return '<option value="' + x.code + '"' + ((c.country || "AT") === x.code ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="ps-row2">' + field("email", "E-Mail *", c.email, 'type="email" autocomplete="email" required', '<span class="hint">Für Bestellbestätigung, Rechnung und Sendungsverfolgung.</span>') + field("phone", "Telefon *", c.phone, 'type="tel" autocomplete="tel" required', '<span class="hint">Nur für den Paketdienst bzw. Rückfragen.</span>') + "</div>" +
      '<div id="psAddrErr" class="ps-err" role="alert"></div></form><div class="ps-nav"><button type="button" class="ps-btn" data-go="3">Zurück</button><button type="button" class="ps-btn primary" data-act="next4">Weiter zur Prüfung</button></div></div><aside class="ps-price" id="psPrice" aria-live="polite"></aside></div>';
  }
  function mockHtml() {
    var pv = S.previews; var k = S.prod.key, round = /rund|round|kreis|circle/i.test(labelOf("shape") + " " + (S.sel.shape || ""));
    if (!pv || !pv.length) return '<div class="ps-mock"><div style="text-align:center;color:rgba(255,255,255,.75)"><div style="font-size:42px">' + esc(S.prod.icon) + '</div><p style="margin:8px 0 12px">Hochgeladene Druckdatei</p><a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">PDF in voller Größe ansehen</a></div></div>';
    var wall = k === "plakate" || k === "rollups", sz = sizeOf() || { w: 1, h: 1 };
    var wpct = k === "visitenkarten" ? 46 : k === "aufkleber" ? 38 : k === "rollups" ? 22 : 40;
    var sheet = function (src, cls) { return '<div class="sheet ' + (cls || "") + (round ? " round" : "") + '" style="width:' + (sz.w >= sz.h ? wpct * 1.25 : wpct) + '%"><img src="' + src + '" alt=""></div>'; };
    return '<div class="ps-mock' + (wall ? " wall" : "") + '" role="img" aria-label="Vorschau deiner Drucksache">' + (pv[1] && !wall ? sheet(pv[1], "back") : "") + sheet(pv[0]) + (k === "rollups" ? '<div class="stand" style="width:' + (wpct + 6) + '%"></div>' : "") + '<span class="cap">Vorschau – Farben am Bildschirm können vom Druck abweichen</span></div>';
  }
  function vCheckout() {
    var p = S.price || {}, c = S.customer, co = S.ctype === "company", invOk = co && S.uidRes && S.uidRes.valid;
    if (!S.payment) S.payment = S.cat.payments.mollie ? "mollie" : (invOk ? "invoice" : "");
    if (S.payment === "invoice" && !invOk) S.payment = S.cat.payments.mollie ? "mollie" : "";
    var rows = [["Produkt", S.prod.title + " · " + S.copies.toLocaleString("de-AT") + " Stk."]].concat(S.prod.props.map(function (pr) { return [pr.title, labelOf(pr.slug)]; }), [["Produktion", (S.prod.urgency.filter(function (u) { return u.slug === S.urgency; })[0] || {}).name || "Standard"], ["Lieferung", [c.company, c.firstName + " " + c.lastName, c.street, c.zip + " " + c.city, c.country === "DE" ? "Deutschland" : "Österreich"].filter(Boolean).join(", ")]].concat(p.deliveryDate ? [["Voraussichtlich bei dir", deDate(p.deliveryDate)]] : []));
    var money = co ? '<div><span>Netto</span><b>' + eur(p.net) + "</b></div><div><span>" + (p.rate ? "zzgl. " + p.rate + " % USt" : "USt (steuerfreie ig. Lieferung)") + "</span><b>" + eur(p.vat) + '</b></div><div class="total"><span>Gesamt</span><b>' + eur(p.gross) + "</b></div>"
      : '<div class="total"><span>Gesamt inkl. ' + p.rate + " % USt und Versand</span><b>" + eur(p.gross) + "</b></div>";
    var thumbs = S.previews && S.previews.length ? '<div class="ps-thumbs">' + S.previews.map(function (src, i) { return '<figure><img src="' + src + '" alt="Seite ' + (i + 1) + '"><figcaption>' + (S.previews.length > 1 ? (i ? "Rückseite" : "Vorderseite") : "Endformat") + " (ohne Beschnitt)</figcaption></figure>"; }).join("") + "</div>" : "";
    return '<div class="ps-layout"><div class="ps-panel"><h2>Prüfen &amp; bestellen</h2><p class="sub">Bitte prüfe deine Druckdaten genau – gedruckt wird genau so, wie du sie freigibst.</p>' +
      '<div class="ps-proof">' + mockHtml() + thumbs + checksHtml((S.file.checks || []).filter(function (x) { return x.level !== "ok"; })) +
      '<div><a class="ps-link" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">Druck-PDF ansehen</a> · <button type="button" class="ps-link" data-go="3">Gestaltung ändern</button></div></div>' +
      '<div class="ps-sum">' + rows.map(function (r) { return "<div><span>" + esc(r[0]) + "</span><b>" + esc(r[1]) + "</b></div>"; }).join("") + money + "</div>" +
      '<fieldset class="ps-pay" style="border:0;padding:0"><legend class="ps-lbl">Zahlung</legend>' +
      '<label class="ps-radio' + (S.cat.payments.mollie ? "" : " dis") + '"><input type="radio" name="pay" value="mollie"' + (S.payment === "mollie" ? " checked" : "") + (S.cat.payments.mollie ? "" : " disabled") + '><span><b>Online bezahlen</b><small>Kreditkarte, Apple Pay, EPS, PayPal u. a. – sicher über Mollie' + (S.cat.payments.mollie ? "" : " (gerade nicht verfügbar)") + "</small></span></label>" +
      '<label class="ps-radio' + (invOk ? "" : " dis") + '"><input type="radio" name="pay" value="invoice"' + (S.payment === "invoice" ? " checked" : "") + (invOk ? "" : " disabled") + '><span><b>Rechnung (14 Tage)</b><small>' + (invOk ? "Für Firmen mit geprüfter UID – wir geben die Bestellung nach kurzer Prüfung frei." : "Nur für Firmen mit gültiger UID-Nummer (in Schritt 4 eintragen und prüfen).") + "</small></span></label></fieldset>" +
      '<label class="ps-cb"><input type="checkbox" data-acc="proof"' + (S.accept.proof ? " checked" : "") + '><span><b>Druckdaten geprüft:</b> Ich habe Texte, Rechtschreibung, Bilder, Farben und Format geprüft und gebe die Daten so zum Druck frei.</span></label>' +
      '<label class="ps-cb"><input type="checkbox" data-acc="terms"' + (S.accept.terms ? " checked" : "") + '><span>Ich akzeptiere die <a href="/print/agb" target="_blank" rel="noopener">AGB</a> und habe die <a href="/datenschutz" target="_blank" rel="noopener">Datenschutzerklärung</a> gelesen.</span></label>' +
      '<label class="ps-cb"><input type="checkbox" data-acc="fagg"' + (S.accept.fagg ? " checked" : "") + '><span>Ich nehme zur Kenntnis, dass bei Drucksachen, die nach meinen Vorgaben angefertigt werden, <b>kein Rücktrittsrecht</b> besteht (§ 18 Abs. 1 Z 3 FAGG).</span></label>' +
      '<div class="ps-err" id="psOrderErr" role="alert">' + esc(S.err) + '</div><div class="ps-nav"><button type="button" class="ps-btn" data-go="4">Zurück</button><button type="button" class="ps-btn primary" data-act="order"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? '<span class="ps-spin"></span> Wird gesendet …' : (S.payment === "invoice" ? "Zahlungspflichtig bestellen" : "Zahlungspflichtig bestellen & bezahlen")) + "</button></div>" +
      '<p class="ps-terms">Mit dem Klick bestellst du verbindlich. Der Vertrag kommt mit unserer Bestellbestätigung per E-Mail zustande' + (S.payment === "invoice" ? ", bei Rechnungskauf mit der Freigabe" : "") + ".</p></div>" +
      '<aside class="ps-price" id="psPrice"><h3>Zusammenfassung</h3>' + priceHtml(true) + "</aside></div>";
  }

  // ── Ereignisse ──
  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go],[data-prod],[data-act],[data-ctype]"); if (!t || t.disabled) return;
    if (t.hasAttribute("data-go")) { e.preventDefault(); go(+t.getAttribute("data-go")); return; }
    if (t.hasAttribute("data-prod")) { pickProduct(t.getAttribute("data-prod")); go(2); return; }
    if (t.hasAttribute("data-ctype")) { saveAddr(); S.ctype = t.getAttribute("data-ctype"); if (S.ctype === "private") S.uidRes = null; loadPrice(); render(); return; }
    var a = t.getAttribute("data-act"), i = a.indexOf(":"), k = i > -1 ? a.slice(0, i) : a, v = i > -1 ? a.slice(i + 1) : "";
    if (k === "next2") { if (S.price) go(3); return; }
    if (k === "mode") { if (v === "design") return openDesigner(); S.mode = v; render(); return; }
    if (k === "clearfile") { S.file = null; S.previews = null; S.mode = ""; render(); return; }
    if (k === "editdesign") return openDesigner();
    if (k === "next3") { if (S.file && !S.file.blocked) go(4); return; }
    if (k === "uidcheck") return uidCheck();
    if (k === "next4") return nextAddr();
    if (k === "order") return order();
    if (k === "retrypay") return retryPay(v);
  });
  root.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name && t.name.indexOf("prop:") === 0) { setProp(t.name.slice(5), t.value); return; }
    if (t.matches("select[data-prop]")) { setProp(t.getAttribute("data-prop"), t.value); return; }
    if (t.name === "copies") { S.copies = +t.value; loadPrice(); return; }
    if (t.name === "urgency") { S.urgency = t.value; loadPrice(); return; }
    if (t.matches("[data-country]")) { S.customer.country = t.value; if (S.customer.zip && !(t.value === "DE" ? /^\d{5}$/ : /^\d{4}$/).test(S.customer.zip)) S.customer.zip = ""; loadPrice(); return; }
    if (t.id === "psFile" && t.files && t.files[0]) return uploadFile(t.files[0]);
    if (t.id === "country" || t.id === "zip") { saveAddr(); loadPrice(); return; }
    if (t.id === "uid") { S.uid = t.value; S.uidRes = null; return; }
    if (t.name === "pay") { S.payment = t.value; render(); return; }
    if (t.hasAttribute("data-acc")) { S.accept[t.getAttribute("data-acc")] = t.checked; return; }
  });
  function setProp(slug, val) {
    var before = JSON.stringify(S.sel); S.sel[slug] = val; fixSel();
    if (S.file && before !== JSON.stringify(S.sel)) { S.file = null; S.previews = null; toast("Ausführung geändert – bitte die Gestaltung bzw. Datei erneut prüfen."); }
    render(); loadPrice();
  }
  root.addEventListener("dragover", function (e) { var d = e.target.closest("#psDrop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  root.addEventListener("dragleave", function (e) { var d = e.target.closest("#psDrop"); if (d) d.classList.remove("over"); });
  root.addEventListener("drop", function (e) { var d = e.target.closest("#psDrop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) uploadFile(f); });

  function cfgOf() { return { product: S.prod.key, sel: S.sel, copies: S.copies, urgency: S.urgency }; }
  function uploadFile(f) {
    var er = document.getElementById("psUpErr"); er.innerHTML = "";
    if (f.size > 50 * 1024 * 1024) { er.innerHTML = '<p class="ps-err">Die Datei ist größer als 50 MB.</p>'; return; }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { er.innerHTML = '<p class="ps-err">Bitte PDF, JPG oder PNG hochladen.</p>'; return; }
    var pr = document.getElementById("psProg"); pr.hidden = false;
    var x = new XMLHttpRequest(); x.open("POST", "/print/api/upload");
    x.setRequestHeader("X-Print-Shop", "1"); x.setRequestHeader("Content-Type", "application/octet-stream");
    x.setRequestHeader("X-File-Name", encodeURIComponent(f.name)); x.setRequestHeader("X-Print-Config", encodeURIComponent(JSON.stringify(cfgOf())));
    x.upload.onprogress = function (ev) { if (ev.lengthComputable) pr.firstChild.style.width = Math.round(ev.loaded / ev.total * 100) + "%"; };
    x.onload = function () { var j = {}; try { j = JSON.parse(x.responseText); } catch (e2) {} if (j.ok) { S.file = j; S.previews = null; S.design = null; render(); toast(j.blocked ? "Bitte die markierten Punkte korrigieren." : "Datei geprüft ✓"); pollPreflight(); } else { pr.hidden = true; er.innerHTML = '<p class="ps-err">' + esc(j.error || "Upload fehlgeschlagen") + "</p>"; } };
    x.onerror = function () { pr.hidden = true; er.innerHTML = '<p class="ps-err">Upload fehlgeschlagen – bitte erneut versuchen.</p>'; };
    x.send(f);
  }
  function pollPreflight(n) {
    n = n || 0; if (!S.file || !S.file.preflight || S.file.preflight.status !== "PROCESSING" || n > 20) return;
    setTimeout(function () { api("/print/api/file/" + S.file.fileId + "?t=" + S.file.token).then(function (j) { if (j.ok && S.file && j.fileId === S.file.fileId) { S.file = j; if (S.step === 3) render(); pollPreflight(n + 1); } }); }, 4000);
  }

  // ── Designer ──
  var dLoading = null;
  function loadDesigner() {
    if (window.PrintDesigner) return Promise.resolve(window.PrintDesigner);
    if (!dLoading) dLoading = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "/print/designer.js?v=1"; s.onload = function () { window.PrintDesigner ? res(window.PrintDesigner) : rej(new Error("Designer fehlt")); }; s.onerror = function () { dLoading = null; rej(new Error("Designer konnte nicht geladen werden")); }; document.head.appendChild(s); });
    return dLoading;
  }
  function openDesigner(draft) {
    var sz = sizeOf(); if (!sz) { toast("Format unbekannt – bitte Datei hochladen", true); return; }
    toast("Designer wird geladen …");
    loadDesigner().then(function (D) {
      return D.open({ product: S.prod, sel: S.sel, labels: S.prod.props.map(function (pr) { return [pr.slug, labelOf(pr.slug)]; }), copies: S.copies, urgency: S.urgency, size: sz, bleed: (S.price && S.price.bleed) || S.prod.bleed, safe: S.prod.safe || 3, sides: sides(), fonts: S.cat.fonts, design: draft || S.design,
        onDone: function (file, previews, design) { S.file = file; S.previews = previews; S.design = design; S.mode = "design"; render(); toast(file.blocked ? "Bitte die markierten Punkte prüfen." : "Druck-PDF erstellt ✓"); },
        onClose: function (design) { if (design) S.design = design; render(); } });
    }).catch(function (e) { toast(e.message || "Designer konnte nicht geladen werden", true); });
  }
  function loadDraft(id, t) {
    api("/print/api/draft/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(t)).then(function (j) {
      if (!j.ok || !j.draft || !prodByKey(j.draft.product)) { toast(j.error || "Entwurf nicht gefunden", true); render(); return; }
      var d = j.draft; pickProduct(d.product);
      S.prod.props.forEach(function (pr) { if (d.sel && pr.options.some(function (o) { return o.slug === d.sel[pr.slug]; })) S.sel[pr.slug] = d.sel[pr.slug]; });
      if (S.prod.tiers.indexOf(+d.copies) > -1) S.copies = +d.copies; if (d.urgency) S.urgency = d.urgency;
      fixSel(); loadPrice(); S.step = 3; S.design = d.design || null; render(); if (S.design) openDesigner(S.design);
      try { history.replaceState(null, "", "/print"); } catch (e) {}
    });
  }
  window.PrintShop.saveDraftLink = function (design) {
    return api("/print/api/draft", { product: S.prod.key, sel: S.sel, copies: S.copies, urgency: S.urgency, design: design });
  };

  // ── Adresse ──
  function saveAddr() {
    var f = document.getElementById("psAddr"); if (!f) return;
    ["company", "firstName", "lastName", "street", "zip", "city", "country", "email", "phone"].forEach(function (k) { var el = f.elements[k]; if (el) S.customer[k] = el.value.trim(); });
    if (f.elements.uid) S.uid = f.elements.uid.value.replace(/[\s.\-]/g, "").toUpperCase();
  }
  function uidCheck() {
    saveAddr(); if (!S.uid) { toast("Bitte UID eingeben", true); return; }
    api("/print/api/uid", { uid: S.uid }).then(function (j) { S.uidRes = j.ok ? j : { valid: false, why: j.error }; if (j.uid) S.uid = j.uid; render(); loadPrice(); });
  }
  function nextAddr() {
    saveAddr(); var c = S.customer, bad = [], f = document.getElementById("psAddr");
    var req = { firstName: c.firstName, lastName: c.lastName, street: c.street && /\d/.test(c.street) ? c.street : "", zip: (c.country === "DE" ? /^\d{5}$/ : /^\d{4}$/).test(c.zip || "") ? c.zip : "", city: c.city, email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c.email || "") ? c.email : "", phone: /^[+0-9 ()\/-]{6,40}$/.test(c.phone || "") ? c.phone : "" };
    if (S.ctype === "company") req.company = c.company;
    Object.keys(req).forEach(function (k) { var el = f.elements[k]; var ok = !!req[k]; if (el) el.setAttribute("aria-invalid", ok ? "false" : "true"); if (!ok) bad.push(k); });
    var names = { firstName: "Vorname", lastName: "Nachname", street: "Straße und Hausnummer", zip: "PLZ", city: "Ort", email: "E-Mail", phone: "Telefon", company: "Firma" };
    if (bad.length) { document.getElementById("psAddrErr").textContent = "Bitte prüfen: " + bad.map(function (k) { return names[k]; }).join(", "); var first = f.elements[bad[0]]; if (first) first.focus(); return; }
    if (S.ctype === "company" && S.uid && !S.uidRes) { uidCheck(); }
    loadPrice(); go(5);
  }

  // ── Bestellen ──
  function order() {
    var er = document.getElementById("psOrderErr");
    if (!S.accept.proof || !S.accept.terms || !S.accept.fagg) { er.textContent = "Bitte die drei Bestätigungen anhaken."; return; }
    if (!S.payment) { er.textContent = "Bitte eine Zahlungsart wählen."; return; }
    if (!S.price) { er.textContent = "Preis wird noch berechnet – bitte kurz warten."; return; }
    S.busy = true; S.err = ""; render();
    var body = Object.assign(cfgOf(), { fileId: S.file.fileId, fileToken: S.file.token, customer: Object.assign({ type: S.ctype, uid: S.ctype === "company" ? S.uid : "" }, S.customer), payment: S.payment,
      acceptTerms: true, acceptFagg: true, acceptProof: true, expectedGross: S.price.gross });
    api("/print/api/order", body).then(function (j) {
      S.busy = false;
      if (j.status === 409 && j.price) { S.price.gross = j.price.gross; S.price.net = j.price.net; S.price.vat = j.price.vat; S.price.rate = j.price.rate; S.err = "Der Preis hat sich gerade geändert (neu: " + eur(S.ctype === "company" ? j.price.net : j.price.gross) + "). Bitte prüfen und erneut bestellen."; render(); return; }
      if (!j.ok) { S.err = j.error || "Bestellung fehlgeschlagen"; render(); return; }
      if (j.checkoutUrl) { location.href = j.checkoutUrl; return; }
      try { history.replaceState(null, "", "/print?bestellung=" + encodeURIComponent(j.orderId) + "&t=" + encodeURIComponent(j.token)); } catch (e) {}
      showStatus(j.orderId, j.token);
    }).catch(function () { S.busy = false; S.err = "Keine Verbindung – bitte erneut versuchen."; render(); });
  }
  function showStatus(id, t, n) {
    n = n || 0;
    api("/print/api/order/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(t)).then(function (j) {
      if (!j.ok) { root.innerHTML = '<div class="ps-panel ps-status"><div class="big">🤔</div><h2>Bestellung nicht gefunden</h2><p>Bitte den Link aus der E-Mail verwenden oder uns kontaktieren.</p></div>'; return; }
      var o = j.order, st = o.status, h;
      if (st === "pending_payment" && n < 20) { root.innerHTML = '<div class="ps-panel ps-status"><div class="big"><span class="ps-spin" style="width:36px;height:36px"></span></div><h2>Zahlung wird bestätigt …</h2><p>Einen Moment – wir warten auf die Bestätigung von Mollie.</p></div>'; setTimeout(function () { showStatus(id, t, n + 1); }, 3000); return; }
      if (st === "pending_payment" || st === "payment_failed") h = '<div class="big">⚠️</div><h2>Zahlung nicht abgeschlossen</h2><p>Die Bestellung ' + esc(o.nr) + " ist gespeichert, aber noch nicht bezahlt.</p><div class=\"btn-row\" style=\"justify-content:center\"><button type=\"button\" class=\"ps-btn primary\" data-act=\"retrypay:" + esc(id) + "|" + esc(t) + "\">Erneut bezahlen</button></div>";
      else if (st === "rejected") h = '<div class="big">✋</div><h2>Bestellung storniert</h2><p>Die Bestellung ' + esc(o.nr) + " wurde storniert. Details haben wir dir per E-Mail geschickt.</p>";
      else h = '<div class="big">🎉</div><h2>Danke für deine Bestellung!</h2><p>Bestellnummer <b>' + esc(o.nr) + "</b> · " + esc(o.product) + " · " + o.copies + " Stk. · " + eur(o.gross) + "</p><p>" +
        (o.payment.method === "invoice" ? "Wir prüfen deine Bestellung und geben sie in Kürze frei. Die Rechnung kommt per E-Mail." : "Die Zahlung ist eingegangen. Wir prüfen deine Druckdaten persönlich und geben sie dann in Produktion.") +
        " Eine Bestätigung ist unterwegs an " + esc(o.email) + ".</p><p>Status: <b>" + esc(o.statusText) + "</b>" + (o.deliveryDate ? " · Lieferung voraussichtlich " + esc(deDate(o.deliveryDate)) : "") + "</p>" + (o.tracks && o.tracks.length ? '<p><a class="ps-btn small" href="' + esc(o.tracks[0]) + '" target="_blank" rel="noopener">Sendung verfolgen</a></p>' : "") +
        '<div class="btn-row" style="justify-content:center"><a class="ps-btn" href="/print">Weitere Drucksachen bestellen</a></div>';
      root.innerHTML = '<div class="ps-panel ps-status">' + h + "</div>";
    });
  }
  function retryPay(v) { var p = v.split("|"); fetch("/print/api/order/" + encodeURIComponent(p[0]) + "/pay?t=" + encodeURIComponent(p[1]), { method: "POST", headers: H, body: "{}" }).then(function (r) { return r.json(); }).then(function (j) { if (j.ok && j.checkoutUrl) location.href = j.checkoutUrl; else toast(j.error || "Zahlung nicht möglich", true); }); }
})();
