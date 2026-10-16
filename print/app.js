/* FS Creative Druckshop – Ablauf auf /print: 1 Produkt → 2 Optionen & Menge (Live-Preis) → 3 Gestalten/Hochladen → 4 Adresse → 5 Prüfen & Bezahlen.
   Preise kommen immer vom Server (/print/api/price), bestellt wird über /print/api/order; der Designer (/print/designer.js) wird erst in Schritt 3 geladen.
   Produktarten (kind): flat (Drucksachen, auch eigenes Format), banner (Wunschgröße in cm), textile (Logo je Druckposition, Größen-Mix), promo (Logo auf Druckfläche).
   Produkte, Bilder und Kategorien stammen von Print.com (Sortiment im Cockpit freigeschaltet); allgemeine Produkte werden erst beim Öffnen geladen (/print/api/product). */
(function () {
  "use strict";
  var root = document.getElementById("shop");
  if (!root) return;
  var H = { "Content-Type": "application/json", "X-Print-Shop": "1" };
  var S = { cat: null, step: 1, prod: null, sel: {}, copies: 0, urgency: "standard", country: "AT", zip: "", ctype: "private", uid: "", uidRes: null, group: "", sub: "", q: "", gal: 0,
    custom: { w: 0, h: 0 }, textile: null, logos: {}, price: null, priceErr: "", priceBusy: false, file: null, previews: null, design: null, mode: "", customer: { country: "AT" }, payment: "", accept: {}, busy: false, err: "" };
  var STEPS = ["Produkt", "Ausführung", "Gestalten", "Lieferung", "Prüfen & Bezahlen"];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var eur = function (n) { return (+n || 0).toLocaleString("de-AT", { style: "currency", currency: "EUR" }); };
  var deDate = function (iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ""; var d = new Date(+m[1], +m[2] - 1, +m[3]); return d.toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long" }); };
  var imgOk = function (u) { return /^https:\/\/images\.ctfassets\.net\//.test(String(u || "")); };
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
    var pk = q.get("produkt"); if (pk && c.products.some(function (p) { return p.key === pk; })) { pickProduct(pk, function () { S.step = 2; render(); }); }
    render();
  }).catch(function () { document.getElementById("psLoading").hidden = true; document.getElementById("psSetup").hidden = false; });

  function prodByKey(k) { return (S.cat.products || []).filter(function (p) { return p.key === k; })[0] || null; }
  var kind = function () { return (S.prod && S.prod.kind) || "flat"; };
  var isLogo = function () { return kind() === "textile" || kind() === "promo"; };
  var isCustom = function () { return !!(S.prod && S.prod.custom && (kind() === "banner" || S.sel.size === "custom")); };
  // Ausschlussregeln wie auf dem Server: eine Regel greift nur, wenn ALLE Bedingungen zutreffen; Pflicht-Eigenschaften ohne Auswahl (auto) werden passend ergänzt
  function aliasMap() { var a = {}; (S.prod.props || []).forEach(function (pr) { (pr.sets || []).forEach(function (x) { a[x] = pr.slug; }); }); return a; }
  function hitRules(cur, al) { return (S.prod.excludes || []).some(function (r) { return r.length > 0 && r.every(function (x) { var v = cur[x.property] != null ? cur[x.property] : al[x.property] ? cur[al[x.property]] : null; return v != null && x.options.indexOf(String(v)) > -1; }); }); }
  function solve(vars, base) {
    var cur = Object.assign({}, base), steps = 0, al = aliasMap(); vars = vars.filter(function (v) { return base[v[0]] == null && v[1].length; });
    if (hitRules(cur, al)) return null;
    function goV(i) { if (i >= vars.length) return true; for (var k = 0; k < vars[i][1].length; k++) { if (++steps > 20000) return false; cur[vars[i][0]] = vars[i][1][k]; if (!hitRules(cur, al) && goV(i + 1)) return true; } delete cur[vars[i][0]]; return false; }
    return goV(0) ? cur : null;
  }
  function autoVars() { var au = S.prod.auto || {}; return Object.keys(au).map(function (k) { return [k, au[k]]; }); }
  function baseOf(sel) { var p = S.prod, b = {}, au = p.auto || {}; Object.keys(p.fixed || {}).forEach(function (k) { if (!au[k]) b[k] = p.fixed[k]; }); if (kind() === "banner") b.size = "custom"; return Object.assign(b, sel); }
  function excluded(sel) { return !solve(autoVars(), baseOf(sel)); }
  function fixSel(changed) { // ausgeschlossene Kombination → die übrigen Optionen auf die nächste gültige Kombination setzen (aktuelle Werte zuerst probieren)
    var p = S.prod; if (!excluded(S.sel)) return;
    var keep = {}; if (changed) keep[changed] = S.sel[changed];
    var vars = p.props.filter(function (pr) { return pr.slug !== changed; }).map(function (pr) { var c = S.sel[pr.slug]; return [pr.slug, [c].concat(pr.options.map(function (o) { return o.slug; }).filter(function (x) { return x !== c; }))]; });
    var r = solve(vars.concat(autoVars()), baseOf(keep)); if (!r) return;
    p.props.forEach(function (pr) { if (r[pr.slug] != null) S.sel[pr.slug] = r[pr.slug]; });
  }
  function disabledOf(pr) { // nie alle Optionen sperren (dann entscheidet Print.com beim Preis)
    var d = {}, n = 0; pr.options.forEach(function (o) { var t = Object.assign({}, S.sel); t[pr.slug] = o.slug; if (excluded(t)) { d[o.slug] = 1; n++; } });
    return n >= pr.options.length ? {} : d;
  }
  // Abhängigkeiten (parentOptions / parent): Eigenschaft bzw. Option nur zeigen, wenn ein passender Wert gewählt ist
  function selValues() { var v = {}; Object.keys(S.prod.fixed || {}).forEach(function (k) { v[S.prod.fixed[k]] = 1; }); Object.keys(S.sel).forEach(function (k) { v[S.sel[k]] = 1; }); return v; }
  function propVisible() { return true; }
  function optsOf(pr) { return pr.options; }
  // ── Bestseller: Produkte laut Print.com-Beliebtheit (Katalog „best“), Optionen = die meistgewählten Standards ──
  var BEST = { size: ["a5", "a4", "a6", "us_large", "bc", "bc_plus"], material: ["135gr_gesatineerd_mc", "170gr_gesatineerd_mc", "135gr_silk_mc", "350gr_silk_mc", "350gr_gesatineerd_mc", "300gr_silk_mc"], printtype: ["44"] };
  function isPoster() { return !!S.prod && /plakat|poster|wahlplakat/i.test(S.prod.key + " " + S.prod.title); }
  function bestOf(pr) {
    var l = BEST[pr.slug]; if (!l) return [];
    if (isPoster()) l = { size: ["a2", "a1", "a3", "a0"], material: ["135gr_gesatineerd_mc", "170gr_gesatineerd_mc", "115gr_blueback"], printtype: ["40"] }[pr.slug] || l;
    return l.filter(function (x) { return pr.options.some(function (o) { return o.slug === x; }); }).slice(0, 4);
  }
  function isBest(pr, slug) { return bestOf(pr).indexOf(slug) > -1; }
  function bestTiers(p) { var want = isPoster() ? [5, 10, 25] : [250, 500, 1000]; return (p.tiers || []).filter(function (n) { return want.indexOf(n) > -1; }); }
  // Auswahl als Liste mit Gruppenüberschriften (Print.com parentOptions, z. B. „A-Formate“)
  function selectHtml(pr, opts, dis) {
    var opt = function (o) { return '<option value="' + esc(o.slug) + '"' + (S.sel[pr.slug] === o.slug ? " selected" : "") + (dis[o.slug] ? " disabled" : "") + ">" + esc(o.name) + "</option>"; };
    var top = bestOf(pr).map(function (x) { return opts.filter(function (o) { return o.slug === x; })[0]; }).filter(Boolean); opts = opts.filter(function (o) { return !isBest(pr, o.slug); });
    var head = top.length ? '<optgroup label="★ Bestseller">' + top.map(opt).join("") + "</optgroup>" : "";
    var inner = pr.groups && pr.groups.length ? pr.groups.map(function (g) { var l = opts.filter(function (o) { return o.parent === g.slug; }); return l.length ? '<optgroup label="' + esc(g.name) + '">' + l.map(opt).join("") + "</optgroup>" : ""; }).join("") + opts.filter(function (o) { return !o.parent || !pr.groups.some(function (g) { return g.slug === o.parent; }); }).map(opt).join("") : opts.map(opt).join("");
    if (head && !(pr.groups && pr.groups.length)) inner = '<optgroup label="Alle ' + esc(pr.title) + '">' + inner + "</optgroup>";
    return '<select class="ps-sel" data-prop="' + esc(pr.slug) + '" aria-label="' + esc(pr.title) + '">' + head + inner + "</select>";
  }
  function pickProduct(key, cb) {
    var p = prodByKey(key); if (!p) return;
    if (p.lazy) { // allgemeine Produkte: Details erst jetzt laden
      toast("Produkt wird geladen …");
      api("/print/api/product?key=" + encodeURIComponent(key)).then(function (j) { if (!j.ok) { toast(j.error || "Produkt nicht verfügbar", true); return; } var i = S.cat.products.indexOf(p); S.cat.products[i] = j.product; pickProduct(key, cb); }).catch(function () { toast("Keine Verbindung", true); });
      return;
    }
    if (!S.prod || S.prod.key !== key) {
      S.prod = p; S.sel = {}; S.gal = 0; p.props.forEach(function (pr) { var d = (p.defaults || {})[pr.slug]; S.sel[pr.slug] = d != null && pr.options.some(function (o) { return o.slug === d; }) ? d : pr.options[0].slug; });
      ["size", "material", "printtype"].forEach(function (k) { var pr = p.props.filter(function (x) { return x.slug === k; })[0]; if (!pr) return;
        bestOf(pr).some(function (b) { var t = Object.assign({}, S.sel); t[k] = b; if (excluded(t)) return false; S.sel = t; return true; }); });
      var bt = bestTiers(p); S.copies = bt.length ? (bt.indexOf(500) > -1 ? 500 : bt[0]) : p.tiers.length ? p.tiers[Math.min(1, p.tiers.length - 1)] : 0; S.urgency = (p.urgency[0] || {}).slug || "standard"; S.file = null; S.previews = null; S.design = null; S.price = null; S.mode = ""; S.logos = {};
      var C = p.custom; if (C) { var cm = C.unit === "cm", f = cm ? 10 : 1, cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); }; S.custom = { w: cl(cm ? 2000 : 148, C.minW, C.maxW) / f, h: cl(cm ? 1000 : 210, C.minH, C.maxH) / f }; }
      if (p.kind === "textile") { var m = p.methods[0], sz = {}, ms = p.sizes.filter(function (x) { return /^(unisex_)?m$/i.test(x.slug); })[0] || p.sizes[0]; sz[ms.slug] = Math.max(10, m.min); S.textile = { method: m.key, positions: [m.positions[0]], sizes: sz }; } else S.textile = null;
      fixSel();
    }
    loadPrice(); if (cb) cb();
  }
  function sizeOf() {
    if (isCustom()) { var f = S.prod.custom.unit === "cm" ? 10 : 1, w = Math.round(parseFloat(S.custom.w) * f), h = Math.round(parseFloat(S.custom.h) * f); return w > 0 && h > 0 ? { w: w, h: h } : null; }
    var sp = S.prod.props.filter(function (x) { return x.slug === "size"; })[0]; var o = sp && sp.options.filter(function (x) { return x.slug === S.sel.size; })[0];
    return o && o.w ? { w: o.w, h: o.h } : S.prod.dims ? { w: S.prod.dims[0], h: S.prod.dims[1] } : (S.price && S.price.size) || null;
  }
  function sides() { var m = String((S.sel.printtype || (S.prod.fixed || {}).printtype) || "").match(/^(\d)(\d)$/); return m && m[2] !== "0" ? 2 : 1; }
  function labelOf(slug) { var pr = S.prod.props.filter(function (x) { return x.slug === slug; })[0]; var o = pr && pr.options.filter(function (x) { return x.slug === S.sel[slug]; })[0]; return o ? o.name : ""; }
  function totalCopies() { if (kind() !== "textile") return S.copies; var t = 0, z = S.textile.sizes; Object.keys(z).forEach(function (k) { t += +z[k] || 0; }); return t; }
  // Logo-Positionen: Textil = gewählte Positionen (feste Reihenfolge), Werbeartikel = Druckfläche
  function logoPositions() {
    var p = S.prod;
    if (kind() === "textile") return p.positions.filter(function (x) { return S.textile.positions.indexOf(x.slug) > -1; });
    if (S.price && S.price.positions) return S.price.positions;
    var a = p.areas || {}, ks = Object.keys(a), k = p.areaProp && (S.sel[p.areaProp] || (p.fixed || {})[p.areaProp]);
    return [{ slug: "area", title: "Druckfläche", area: (k && a[k]) || (ks.length === 1 ? a[ks[0]] : null) || p.printArea || [100, 100] }];
  }
  function logoKey() { return JSON.stringify(logoPositions().map(function (x) { return [x.slug, x.area]; })); }
  function cfgOf() { return { product: S.prod.key, sel: S.sel, copies: S.copies, urgency: S.urgency, custom: isCustom() ? S.custom : undefined, textile: S.textile || undefined }; }

  // ── Preis ──
  var pT, pSeq = 0;
  function loadPrice() {
    clearTimeout(pT); S.priceBusy = true; renderPrice();
    pT = setTimeout(function () {
      var seq = ++pSeq;
      api("/print/api/price", Object.assign(cfgOf(), { country: S.customer.country || S.country, zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "" })).then(function (j) {
        if (seq !== pSeq) return; S.priceBusy = false;
        if (j.ok) { var before = isLogo() ? logoKey() : ""; S.price = j.price; S.price.size = j.size; S.price.bleed = j.bleed; S.price.sides = j.sides; S.price.copies = j.copies; S.price.labels = j.labels; S.price.positions = j.positions; S.priceErr = "";
          if (isLogo() && before !== logoKey()) { S.logos = {}; S.file = null; } }
        else { S.price = null; S.priceErr = j.error || "Preis nicht verfügbar"; }
        renderPrice();
      }).catch(function () { if (seq !== pSeq) return; S.priceBusy = false; S.priceErr = "Keine Verbindung"; renderPrice(); });
    }, 220);
  }
  function priceHtml(compact) {
    if (!S.prod) return "";
    var p = S.price, co = S.ctype === "company", n = (p && p.copies) || totalCopies();
    var what = '<p class="what">' + esc(S.prod.title) + " · " + (+n || 0).toLocaleString("de-AT") + " Stk." + (isCustom() && sizeOf() ? " · " + esc(S.custom.w + " × " + S.custom.h + " " + S.prod.custom.unit) : labelOf("size") ? " · " + esc(labelOf("size")) : "") + "</p>";
    if (S.priceErr && !S.priceBusy) return what + '<p class="err">' + esc(S.priceErr) + "</p>";
    if (!p) return what + '<p class="note"><span class="ps-spin"></span> Preis wird berechnet …</p>';
    var main = co ? p.net : p.gross;
    return what + '<div class="sum' + (S.priceBusy ? " loading" : "") + '">' + eur(main) + '<small>' + (co ? "exkl. USt" : "inkl. USt") + "</small></div>" +
      (p.rate ? '<div class="sum2">' + eur(co ? p.gross : p.net) + "<small>" + (co ? "inkl. USt" : "exkl. USt") + "</small></div>" : "") +
      '<p class="note">' + (co ? "netto zzgl. " + p.rate + " % USt" + (p.rate ? " (" + eur(p.gross) + " brutto)" : "") : "inkl. " + p.rate + " % USt") + " · inkl. Versand innerhalb Österreichs</p>" +
      (compact ? "" : '<dl><dt>Stückpreis</dt><dd>' + eur(main / (n || 1)) + "</dd><dt>Datencheck</dt><dd>kostenlos</dd><dt>Versand (AT)</dt><dd>inklusive</dd>" + (p.deliveryDate ? "<dt>Lieferung voraussichtlich</dt><dd>" + esc(deDate(p.deliveryDate)) + "</dd>" : "") + "</dl>") +
      (p.taxNote ? '<p class="note">' + esc(p.taxNote) + "</p>" : "");
  }
  function renderPrice() {
    var b = document.getElementById("psPrice"); if (b) b.innerHTML = '<h3>Dein Preis</h3>' + priceHtml(false);
    var m = document.getElementById("psMbar"); if (m && S.prod) { var p = S.price; m.querySelector(".mp").innerHTML = p ? "<b>" + eur(S.ctype === "company" ? p.net : p.gross) + "</b><small>" + (S.ctype === "company" ? "netto" : "inkl. USt") + " · inkl. Versand</small>" : '<small>' + (S.priceErr ? esc(S.priceErr) : "Preis wird berechnet …") + "</small>"; }
    var nx = document.getElementById("psNext2"); if (nx) nx.disabled = !S.price || S.priceBusy;
    var tt = document.getElementById("psTexTotal"); if (tt) tt.textContent = totalCopies().toLocaleString("de-AT") + " Stk.";
  }

  // ── Darstellung ──
  function stepsHtml() {
    return '<ol class="ps-steps" aria-label="Bestellschritte">' + STEPS.map(function (t, i) { var n = i + 1, cur = n === S.step, done = n < S.step;
      return '<li class="' + (done ? "done" : "") + '"' + (cur ? ' aria-current="step"' : "") + '><button type="button" data-go="' + n + '"' + (done ? "" : " disabled") + '><span class="n">' + (done ? "✓" : n) + '</span><span class="t">' + t + "</span></button></li>"; }).join("") + "</ol>";
  }
  function render() {
    var h = stepsHtml();
    if (S.step === 1) h += vProducts(); else if (S.step === 2) h += vOptions(); else if (S.step === 3) h += isLogo() ? vLogos() : vDesign(); else if (S.step === 4) h += vAddress(); else h += vCheckout();
    root.innerHTML = h;
    if (S.step === 2 || S.step === 3 || S.step === 4) { var mb = document.createElement("div"); mb.className = "ps-mbar"; mb.id = "psMbar"; mb.innerHTML = '<div class="mp"></div>' + (S.step === 2 ? '<button type="button" class="ps-btn primary small" data-act="next2">Weiter</button>' : ""); root.appendChild(mb); renderPrice(); }
    if (S.step === 2) renderPrice();
  }
  function go(n) { S.step = n; S.err = ""; render(); var y = root.getBoundingClientRect().top + window.scrollY - 80; if (Math.abs(window.scrollY - y) > 40) window.scrollTo({ top: Math.max(0, y), behavior: "smooth" }); var f = root.querySelector("h2"); if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); } }

  // Schritt 1: Produktwahl – Hauptgruppen (Print.com), Untergruppen-Filter, Suche, echte Produktbilder
  function cardHtml(p) {
    var tag = p.lazy ? "Druckdaten hochladen" : p.kind === "textile" || p.kind === "promo" ? "Logo hochladen" : p.designer ? "Online gestalten oder hochladen" : "Druckdaten hochladen";
    return '<button type="button" class="ps-prod' + (p.best ? " best" : "") + '" data-prod="' + esc(p.key) + '" aria-pressed="' + (!!S.prod && S.prod.key === p.key) + '"><span class="ph">' + (p.best ? '<span class="ps-badge">★ Bestseller</span>' : "") + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async">' : '<span class="ic" aria-hidden="true">' + esc(p.icon) + "</span>") + "</span>" +
      '<span class="bd"><b>' + esc(p.title) + "</b><span>" + esc(p.desc) + '</span><span class="tag">' + tag + "</span></span></button>";
  }
  function filtered() {
    var qq = S.q.trim().toLowerCase();
    return S.cat.products.filter(function (p) { var c = p.cat || {}; if (S.group && c.main !== S.group) return false; if (S.sub && c.sub !== S.sub) return false;
      return !qq || (p.title + " " + p.desc + " " + (c.mainName || "") + " " + (c.subName || "") + " " + p.key).toLowerCase().indexOf(qq) > -1; });
  }
  function gridHtml() {
    var l = filtered(), groups = S.cat.groups || [];
    if (!l.length) return '<p class="pd-muted" style="padding:20px 0">Nichts gefunden – probier einen anderen Begriff oder <button type="button" class="ps-link" data-group="">alle Produkte</button>.</p>';
    if (S.group || S.q.trim()) return '<div class="ps-products">' + l.map(cardHtml).join("") + "</div>";
    var top = l.filter(function (p) { return p.best; }).sort(function (a, b) { return (b.pop || 0) - (a.pop || 0); });
    var bestSec = top.length ? '<section class="ps-grp ps-grp-best"><h3 class="ps-grp-h">★ Bestseller <span>die meistbestellten Produkte</span></h3><div class="ps-products">' + top.map(cardHtml).join("") + "</div></section>" : "";
    return bestSec + groups.map(function (g) { var x = l.filter(function (p) { return (p.cat || {}).main === g.slug; }); return x.length ? '<section class="ps-grp"><h3 class="ps-grp-h">' + esc(g.name) + ' <span>' + x.length + '</span></h3><div class="ps-products">' + x.map(cardHtml).join("") + "</div></section>" : ""; }).join("");
  }
  function vProducts() {
    var groups = S.cat.groups || [], g = groups.filter(function (x) { return x.slug === S.group; })[0];
    var tabs = groups.length > 1 ? '<div class="ps-tabs" role="group" aria-label="Kategorien"><button type="button" data-group="" aria-pressed="' + !S.group + '">Alle</button>' + groups.map(function (x) { return '<button type="button" data-group="' + esc(x.slug) + '" aria-pressed="' + (S.group === x.slug) + '">' + esc(x.name) + "</button>"; }).join("") + "</div>" : "";
    var subs = g && g.subs.length > 1 ? '<div class="ps-subs" role="group" aria-label="Untergruppen"><button type="button" data-sub="" aria-pressed="' + !S.sub + '">Alle</button>' + g.subs.map(function (x) { return '<button type="button" data-sub="' + esc(x.slug) + '" aria-pressed="' + (S.sub === x.slug) + '">' + esc(x.name) + "</button>"; }).join("") + "</div>" : "";
    return '<div class="ps-panel"><h2>Was möchtest du drucken?</h2><p class="sub">Alle Preise inkl. Versand innerhalb Österreichs.</p>' +
      '<div class="ps-find"><input type="search" id="psQ" value="' + esc(S.q) + '" placeholder="Produkt suchen, z. B. Flyer, T-Shirt, Banner …" aria-label="Produkt suchen" autocomplete="off"></div>' + tabs + subs + '<div id="psGrid">' + gridHtml() + "</div></div>";
  }
  // Schritt 2: Ausführung
  function chips(name, opts, cur, dis) {
    return '<div class="ps-chips" role="radiogroup">' + opts.map(function (o) { var vis = imgOk(o.img) ? '<img src="' + esc(o.img) + '" alt="" loading="lazy">' : o.color ? '<i class="sw" style="background:' + esc(o.color) + '"></i>' : "";
      return '<label class="ps-chip' + (vis ? " vis" : "") + '"' + (o.desc ? ' title="' + esc(o.desc) + '"' : "") + '><input type="radio" name="' + esc(name) + '" value="' + esc(o.slug) + '"' + (String(cur) === String(o.slug) ? " checked" : "") + (dis && dis[o.slug] ? " disabled" : "") + "><span>" + vis + esc(o.name) + "</span></label>"; }).join("") + "</div>";
  }
  function customHtml() {
    var C = S.prod.custom, cm = C.unit === "cm", f = cm ? 10 : 1, u = C.unit;
    return '<div class="ps-row2 ps-dims"><div class="ps-field"><label for="psW">Breite (' + u + ')</label><input id="psW" type="number" inputmode="decimal" min="' + Math.min(C.minW, C.minH) / f + '" max="' + Math.max(C.maxW, C.maxH) / f + '" step="' + (cm ? 1 : 1) + '" value="' + esc(S.custom.w) + '"></div>' +
      '<div class="ps-field"><label for="psH">Höhe (' + u + ')</label><input id="psH" type="number" inputmode="decimal" min="' + Math.min(C.minW, C.minH) / f + '" max="' + Math.max(C.maxW, C.maxH) / f + '" step="1" value="' + esc(S.custom.h) + '"></div></div>' +
      '<p class="ps-help">Mindestens ' + C.minW / f + " × " + C.minH / f + " " + u + ", höchstens " + C.maxW / f + " × " + C.maxH / f + " " + u + " (Endformat, ohne Beschnitt).</p>";
  }
  function propHtml(pr, v) {
    if (!propVisible(pr, v)) return "";
    var opts = optsOf(pr, v), dis = disabledOf(pr), cur = opts.filter(function (o) { return o.slug === S.sel[pr.slug]; })[0];
    var vis = opts.some(function (o) { return imgOk(o.img) || o.color; });
    var ctl = opts.length <= 6 || (vis && opts.length <= 12) ? chips("prop:" + pr.slug, opts, S.sel[pr.slug], dis)
      : selectHtml(pr, opts, dis);
    return '<fieldset class="ps-opt"><legend>' + esc(pr.title) + "</legend>" + ctl + (cur && cur.desc ? '<p class="ps-help">' + esc(cur.desc) + "</p>" : "") + (pr.slug === "size" && isCustom() ? customHtml() : "") + "</fieldset>";
  }
  // Ausführung wie bei druck.at: Abschnitte mit beschrifteten Auswahlkacheln (2 Spalten), seltene Optionen eingeklappt
  var SECT_FORMAT = ["size", "shape", "custom_shape", "orientation", "roll_up_banners"], SECT_MAT = ["material", "color_material", "printtype", "print_position", "type_glue", "color", "color_textile"];
  var NONE_RX = /^(ohne|keine?|nein|nicht|offen geliefert|none|no)\b/i;
  function tileHtml(pr) {
    var opts = optsOf(pr), dis = disabledOf(pr), cur = opts.filter(function (o) { return o.slug === S.sel[pr.slug]; })[0];
    if (/color/.test(pr.slug) && opts.some(function (o) { return o.color || imgOk(o.img); })) return '<div class="ps-tile wide"><span class="ps-tl">' + esc(pr.title) + (cur ? ": <b>" + esc(cur.name) + "</b>" : "") + "</span>" + chips("prop:" + pr.slug, opts, S.sel[pr.slug], dis) + "</div>";
    var best = cur && isBest(pr, cur.slug);
    return '<div class="ps-tile' + (best ? " best" : "") + '"><span class="ps-tl">' + esc(pr.title) + (best ? ' <span class="ps-bb">★ Bestseller</span>' : "") + "</span>" + selectHtml(pr, opts, dis) +
      (cur && cur.desc ? '<span class="ps-td">' + esc(String(cur.desc).slice(0, 160)) + "</span>" : "") + "</div>";
  }
  function sec(title, inner, extra) { return inner ? '<section class="ps-sec"><h3>' + esc(title) + '</h3><div class="ps-grid2">' + inner + "</div>" + (extra || "") + "</section>" : ""; }
  function sectionsHtml(p) {
    var props = p.props.filter(function (pr) { return propVisible(pr); }), inS = function (l) { return props.filter(function (pr) { return l.indexOf(pr.slug) > -1; }); };
    var fmt = inS(SECT_FORMAT), mat = inS(SECT_MAT), rest = props.filter(function (pr) { return fmt.indexOf(pr) < 0 && mat.indexOf(pr) < 0; });
    var isNone = function (pr) { var d = (p.defaults || {})[pr.slug], o = pr.options.filter(function (x) { return x.slug === d; })[0]; return o && NONE_RX.test(String(o.name).trim()); };
    var main = rest.filter(function (pr) { return !isNone(pr); }), minor = rest.filter(isNone), changed = minor.filter(function (pr) { return S.sel[pr.slug] !== (p.defaults || {})[pr.slug]; }).length;
    var tiles = function (l) { return l.map(tileHtml).join(""); };
    var more = minor.length ? '<details class="ps-more"' + (changed ? " open" : "") + "><summary>Weitere Optionen <span>" + esc(minor.map(function (pr) { return pr.title; }).join(", ")) + "</span>" + (changed ? ' <b class="ps-cnt">' + changed + " gewählt</b>" : "") + '</summary><div class="ps-grid2">' + tiles(minor) + "</div></details>" : "";
    var custom = (p.kind === "banner" && p.custom) || (fmt.some(function (pr) { return pr.slug === "size"; }) && isCustom()) ? customHtml() : "";
    return sec("Format", tiles(fmt), custom) + sec("Material & Druck", tiles(mat)) + (main.length || more ? '<section class="ps-sec"><h3>Veredelung &amp; Optionen</h3>' + (main.length ? '<div class="ps-grid2">' + tiles(main) + "</div>" : "") + more + "</section>" : "");
  }
  function amountHtml(p) {
    var bt = bestTiers(p), inT = p.tiers.indexOf(S.copies) > -1;
    var sel = '<select class="ps-sel" data-copies aria-label="Auflage">' + (inT ? "" : '<option value="' + S.copies + '" selected>' + (+S.copies).toLocaleString("de-AT") + " Stk. (eigene Menge)</option>") +
      p.tiers.map(function (n) { return '<option value="' + n + '"' + (n === S.copies ? " selected" : "") + ">" + n.toLocaleString("de-AT") + " Stk." + (bt.indexOf(n) > -1 ? "  ★ Bestseller" : "") + "</option>"; }).join("") + "</select>";
    var own = "";
    if (p.qty && p.qty.length) { var r = [].concat.apply([], p.qty.map(function (x) { return x.ranges; })), mn = Math.min.apply(null, r.map(function (g) { return g.min; })), mx = Math.max.apply(null, r.map(function (g) { return g.max; }));
      own = '<div class="ps-tile"><span class="ps-tl">Andere Menge</span><input id="psQty" class="ps-sel" type="number" inputmode="numeric" min="' + mn + '" max="' + mx + '" value="' + (inT ? "" : S.copies) + '" placeholder="' + mn + "–" + mx.toLocaleString("de-AT") + ' Stk."></div>'; }
    var ur = p.urgency.length > 1 ? '<div class="ps-tile' + (S.urgency === "standard" ? " best" : "") + '"><span class="ps-tl">Produktion' + (S.urgency === "standard" ? ' <span class="ps-bb">★ Bestseller</span>' : "") + '</span><select class="ps-sel" data-urgency aria-label="Produktion">' +
      p.urgency.map(function (u) { return '<option value="' + esc(u.slug) + '"' + (u.slug === S.urgency ? " selected" : "") + ">" + esc(u.name) + "</option>"; }).join("") + '</select><span class="ps-td">Bestimmt den Liefertermin rechts.</span></div>' : "";
    return '<section class="ps-sec"><h3>Auflage &amp; Lieferung</h3><div class="ps-grid2"><div class="ps-tile' + (bt.indexOf(S.copies) > -1 ? " best" : "") + '"><span class="ps-tl">Auflage' + (bt.indexOf(S.copies) > -1 ? ' <span class="ps-bb">★ Bestseller</span>' : "") + "</span>" + sel + "</div>" + own + ur + "</div></section>";
  }
  function qtyHtml(p) {
    var cp = '<fieldset class="ps-opt"><legend>Auflage</legend>' + chips("copies", p.tiers.map(function (n) { return { slug: n, name: n.toLocaleString("de-AT") + " Stk." }; }), S.copies);
    if (p.qty && p.qty.length) { var r = [].concat.apply([], p.qty.map(function (x) { return x.ranges; })), mn = Math.min.apply(null, r.map(function (g) { return g.min; })), mx = Math.max.apply(null, r.map(function (g) { return g.max; }));
      cp += '<div class="ps-qty"><label for="psQty">Andere Menge</label><input id="psQty" type="number" inputmode="numeric" min="' + mn + '" max="' + mx + '" value="' + (p.tiers.indexOf(S.copies) < 0 ? S.copies : "") + '" placeholder="' + mn + "–" + mx.toLocaleString("de-AT") + '"></div>'; }
    return cp + "</fieldset>";
  }
  function textileHtml(p) {
    var t = S.textile, m = p.methods.filter(function (x) { return x.key === t.method; })[0] || p.methods[0];
    var meth = '<fieldset class="ps-opt"><legend>Druckart</legend>' + chips("tmethod", p.methods.map(function (x) { return { slug: x.key, name: x.label }; }), t.method) + "</fieldset>";
    var pos = '<fieldset class="ps-opt"><legend>Druckpositionen</legend><div class="ps-chips">' + p.positions.map(function (x) { var ok = m.positions.indexOf(x.slug) > -1;
      return '<label class="ps-chip"><input type="checkbox" name="tpos" value="' + esc(x.slug) + '"' + (t.positions.indexOf(x.slug) > -1 ? " checked" : "") + (ok ? "" : " disabled") + "><span>" + esc(x.title) + "</span></label>"; }).join("") + '</div><p class="ps-help">Mindestens eine Position. Pro Position lädst du im nächsten Schritt dein Logo hoch (max. Druckfläche je Position wird angezeigt).</p></fieldset>';
    var sz = '<fieldset class="ps-opt"><legend>Größen &amp; Stückzahl</legend><div class="ps-sizes">' + p.sizes.map(function (x) { return '<label class="ps-size"><span>' + esc(x.name) + '</span><input type="number" inputmode="numeric" min="0" max="5000" data-tsize="' + esc(x.slug) + '" value="' + (t.sizes[x.slug] || "") + '" placeholder="0"></label>'; }).join("") +
      '</div><p class="ps-help">Gesamt: <b id="psTexTotal">' + totalCopies().toLocaleString("de-AT") + " Stk.</b>" + (m.min > 1 ? " · " + esc(m.label.replace(/ \(.*$/, "")) + " ab " + m.min + " Stück" : "") + " · Der Preis hängt nicht von der Größe ab.</p></fieldset>";
    return meth + pos + sz;
  }
  function galleryHtml(p) {
    var im = (p.images || []).filter(imgOk); if (!im.length && imgOk(p.img)) im = [p.img]; if (!im.length) return "";
    var i = Math.min(S.gal, im.length - 1);
    return '<div class="ps-gal"><div class="main"><img src="' + esc(im[i]) + '" alt="' + esc(p.title) + '"></div>' + (im.length > 1 ? '<div class="th">' + im.map(function (u, k) { return '<button type="button" data-gal="' + k + '" aria-label="Bild ' + (k + 1) + '" aria-pressed="' + (k === i) + '"><img src="' + esc(u.replace(/w=\d+/, "w=160")) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>" : "") + "</div>";
  }
  function aboutHtml(p) {
    var t = String(p.about || "").trim(); if (!t && !p.summary) return "";
    var lines = t.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), bul = lines.filter(function (x) { return /^[-*•]/.test(x); });
    var body = (lines.filter(function (x) { return !/^[-*•]/.test(x); }).map(function (x) { return "<p>" + esc(x.replace(/[#*_]+/g, "")) + "</p>"; }).join("")) + (bul.length ? "<ul>" + bul.map(function (x) { return "<li>" + esc(x.replace(/^[-*•]\s*/, "").replace(/[#*_]+/g, "")) + "</li>"; }).join("") + "</ul>" : "");
    return '<details class="ps-about"' + (bul.length && bul.length <= 6 ? " open" : "") + "><summary>Produktinfos" + (p.summary ? " · " + esc(p.summary) : "") + "</summary>" + body + "</details>";
  }
  function vOptions() {
    var p = S.prod, v = selValues(), k = kind();
    var props = sectionsHtml(p), cust = "";
    var amount = k === "textile" ? '<section class="ps-sec"><h3>Druck &amp; Größen</h3>' + textileHtml(p) + "</section>" : amountHtml(p);
    var area = k === "promo" ? (function () { var a = logoPositions()[0].area; return '<p class="ps-help ps-info">Druckfläche ' + a[0] + " × " + a[1] + " mm · dein Logo wird mittig platziert · Wir prüfen jede Datei vor dem Druck.</p>"; })() : "";
    var ur = k === "textile" && p.urgency.length > 1 ? '<fieldset class="ps-opt"><legend>Produktion</legend>' + chips("urgency", p.urgency, S.urgency) + "</fieldset>" : "";
    var who = '<fieldset class="ps-opt"><legend>Preise anzeigen für</legend><div class="ps-row2"><div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-ctype="private" aria-pressed="' + (S.ctype === "private") + '">Privat</button><button type="button" data-ctype="company" aria-pressed="' + (S.ctype === "company") + '">Firma</button></div>' +
      '<select class="ps-sel" data-country aria-label="Lieferland">' + S.cat.countries.map(function (c) { return '<option value="' + c.code + '"' + ((S.customer.country || "AT") === c.code ? " selected" : "") + ">Lieferung nach " + esc(c.name) + "</option>"; }).join("") + "</select></div></fieldset>";
    var crumbs = p.cat ? '<p class="ps-crumb">' + esc(p.cat.mainName || "") + (p.cat.subName ? " › " + esc(p.cat.subName) : "") + "</p>" : "";
    return '<div class="ps-layout"><div class="ps-panel">' + crumbs + '<div class="ps-head">' + galleryHtml(p) + '<div class="ps-head-t"><h2>' + esc(p.title) + '</h2><p class="sub">' + esc(p.desc || "Der Preis aktualisiert sich bei jeder Änderung.") + "</p>" + aboutHtml(p) + "</div></div>" + cust + props + area + amount + ur + who +
      '<div class="ps-nav"><button type="button" class="ps-btn" data-go="1">Zurück</button><button type="button" class="ps-btn primary" id="psNext2" data-act="next2">' + (isLogo() ? "Weiter zum Logo" : "Weiter zur Gestaltung") + "</button></div></div>" +
      '<aside class="ps-price" id="psPrice" aria-live="polite"></aside></div>';
  }
  // Schritt 3: Gestalten / Druckdatei (Drucksachen, Banner)
  function vDesign() {
    var p = S.prod, sz = sizeOf(), sd = sides(), b = (S.price && S.price.bleed != null) ? S.price.bleed : p.bleed;
    var spec = sz ? sz.w + " × " + sz.h + " mm" + (b ? " (mit Beschnitt " + (sz.w + 2 * b) + " × " + (sz.h + 2 * b) + " mm)" : "") : "";
    var h = '<div class="ps-panel"><h2>Gestalten oder Datei hochladen</h2><p class="sub">' + esc(p.title) + (spec ? " · Endformat " + esc(spec) : " · Format prüfen wir vor dem Druck") + " · " + (sd === 2 ? (p.key === "folder" ? "Außen- und Innenseite" : "Vorder- und Rückseite") : "einseitig") + "</p>";
    if (S.file) {
      h += '<div class="ps-file"><div><b>' + (S.file.kind === "design" ? "Deine Gestaltung" : esc(S.file.name)) + '</b><div class="pd-muted">' + (S.file.pages || "?") + " Seite(n) · " + (S.file.blocked ? "<span style=\"color:var(--ps-bad)\">bitte korrigieren</span>" : "bereit zum Druck") + '</div></div><div class="ps-row2" style="display:flex;gap:8px;flex-wrap:wrap">' +
        (S.file.kind === "design" ? '<button type="button" class="ps-btn small" data-act="editdesign">Weiter bearbeiten</button>' : "") +
        '<a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">PDF ansehen</a><button type="button" class="ps-btn small" data-act="clearfile">Andere Datei</button></div></div>' + checksHtml(S.file.checks);
      if (S.file.preflight && S.file.preflight.status === "PROCESSING") h += '<p class="pd-muted" style="margin-top:8px"><span class="ps-spin"></span> Print.com prüft die Datei zusätzlich …</p>';
    } else if (S.mode === "upload") {
      h += '<label class="ps-drop" id="psDrop"><input type="file" id="psFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><span style="font-size:30px" aria-hidden="true">📄</span><b>Datei auswählen oder hierher ziehen</b><small>' + (sz ? "PDF (empfohlen), JPG oder PNG" : "Druckfertige PDF") + " · max. 50 MB" + (spec ? " · " + esc(spec) : "") + (sd === 2 ? " · 2 Seiten" : "") + '</small><div class="ps-prog" id="psProg" hidden><i></i></div></label><div id="psUpErr"></div>' +
        '<p class="ps-terms">Tipp: PDF im Endformat' + (b ? " plus " + b + " mm Beschnitt an jeder Seite" : "") + ', Schriften eingebettet, Bilder mit ' + (p.dpi || 300) + ' dpi. <button type="button" class="ps-link" data-act="mode:">Zurück zur Auswahl</button></p>';
    } else {
      h += '<div class="ps-modes"><button type="button" class="ps-mode" data-act="mode:design"' + (p.designer && sz ? "" : " disabled") + '><span class="ic" aria-hidden="true">🎨</span><b>Online gestalten</b><span>' + (p.designer && sz ? "Mit Vorlagen, eigenen Texten, Logo und Bildern – Beschnitt und Sicherheitsabstand werden angezeigt." : "Für dieses Produkt bitte eine Druckdatei hochladen.") + '</span></button>' +
        '<button type="button" class="ps-mode" data-act="mode:upload"><span class="ic" aria-hidden="true">⬆️</span><b>Druckdatei hochladen</b><span>Du hast schon eine fertige PDF (oder JPG/PNG)? Wir prüfen Format, Seiten und Auflösung automatisch.</span></button></div>';
    }
    return h + '<div class="ps-nav"><button type="button" class="ps-btn" data-go="2">Zurück</button><button type="button" class="ps-btn primary" data-act="next3"' + (S.file && !S.file.blocked ? "" : " disabled") + ">Weiter zur Lieferung</button></div></div>";
  }
  // Schritt 3: Logos (Textil / Werbeartikel) – eine Datei je Position, danach eine gemeinsame PDF
  function vLogos() {
    var pos = logoPositions();
    var slots = pos.map(function (x) { var l = S.logos[x.slug];
      return '<div class="ps-logo"><div class="ps-logo-h"><b>' + esc(x.title) + '</b><span class="pd-muted">max. ' + x.area[0] + " × " + x.area[1] + " mm</span></div>" +
        (l ? '<div class="ps-file" style="margin-top:8px"><div><b>' + esc(l.name) + '</b><div class="pd-muted">' + (l.blocked ? '<span style="color:var(--ps-bad)">bitte anderes Logo</span>' : "Logo geprüft") + '</div></div><button type="button" class="ps-btn small" data-act="clearlogo:' + esc(x.slug) + '">Anderes Logo</button></div>' + checksHtml(l.checks.filter(function (c) { return c.level !== "ok"; }))
          : '<label class="ps-drop small" data-logo="' + esc(x.slug) + '"><input type="file" data-logo="' + esc(x.slug) + '" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"><b>Logo auswählen oder hierher ziehen</b><small>PNG mit transparentem Hintergrund (mind. 1000 px) oder Vektor-PDF · max. 50 MB</small><div class="ps-prog" hidden><i></i></div></label>') +
        '<div class="ps-uperr" data-err="' + esc(x.slug) + '"></div></div>'; }).join("");
    var merged = S.file ? '<div class="ps-file"><div><b>Logo-PDF für den Druck</b><div class="pd-muted">' + (S.file.pages || pos.length) + " Seite(n) – eine je Position · " + (S.file.blocked ? '<span style="color:var(--ps-bad)">bitte korrigieren</span>' : "bereit") + '</div></div><a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">PDF ansehen</a></div>' + checksHtml(S.file.checks.filter(function (c) { return c.level === "error"; })) : "";
    return '<div class="ps-panel"><h2>Logo hochladen</h2><p class="sub">' + esc(S.prod.title) + " · " + (kind() === "textile" ? "ein Logo je Druckposition" : "Logo für die Druckfläche") + ". Das Logo wird mittig in der Druckfläche platziert – wir prüfen jede Datei vor dem Druck.</p>" + '<div class="ps-logos">' + slots + "</div>" + merged +
      '<div class="ps-nav"><button type="button" class="ps-btn" data-go="2">Zurück</button><button type="button" class="ps-btn primary" data-act="next3"' + (S.file && !S.file.blocked ? "" : " disabled") + ">Weiter zur Lieferung</button></div></div>";
  }
  function checksHtml(list) { return list && list.length ? '<ul class="ps-checks">' + list.map(function (c) { return '<li class="' + esc(c.level) + '">' + esc(c.text) + "</li>"; }).join("") + "</ul>" : ""; }
  function field(id, label, val, attrs, hint) { return '<div class="ps-field"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" value="' + esc(val || "") + '" ' + (attrs || "") + ">" + (hint || "") + "</div>"; }
  function vAddress() {
    var c = S.customer, co = S.ctype === "company";
    var uidHint = S.uidRes ? (S.uidRes.valid ? '<span class="hint ok">✓ gültig' + (S.uidRes.name ? " – " + esc(S.uidRes.name) : "") + "</span>" : '<span class="hint bad">' + esc(S.uidRes.why || "UID ungültig") + "</span>") : '<span class="hint">Mit gültiger UID: Kauf auf Rechnung möglich.</span>';
    return '<div class="ps-layout"><div class="ps-panel"><h2>Lieferadresse &amp; Kontakt</h2><p class="sub">Wir liefern innerhalb Österreichs. Die Rechnung geht an diese Adresse.</p><form class="ps-form" id="psAddr" novalidate autocomplete="on">' +
      '<div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-ctype="private" aria-pressed="' + !co + '">Privat</button><button type="button" data-ctype="company" aria-pressed="' + co + '">Firma</button></div>' +
      (co ? '<div class="ps-row2">' + field("company", "Firma *", c.company, 'autocomplete="organization" required') + '<div class="ps-field"><label for="uid">UID-Nummer</label><div class="ps-uidrow"><input id="uid" name="uid" value="' + esc(S.uid) + '" placeholder="z. B. ATU12345678" autocapitalize="characters"><button type="button" class="ps-btn small" data-act="uidcheck">Prüfen</button></div>' + uidHint + "</div></div>" : "") +
      '<div class="ps-row2">' + field("firstName", "Vorname *", c.firstName, 'autocomplete="given-name" required') + field("lastName", "Nachname *", c.lastName, 'autocomplete="family-name" required') + "</div>" +
      field("street", "Straße und Hausnummer *", c.street, 'autocomplete="street-address" required') +
      '<div class="ps-row2"><div class="ps-row2">' + field("zip", "PLZ *", c.zip, 'autocomplete="postal-code" inputmode="numeric" required') + field("city", "Ort *", c.city, 'autocomplete="address-level2" required') + '</div><div class="ps-field"><label for="country">Land *</label><select id="country" name="country" autocomplete="country">' + S.cat.countries.map(function (x) { return '<option value="' + x.code + '"' + ((c.country || "AT") === x.code ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="ps-row2">' + field("email", "E-Mail *", c.email, 'type="email" autocomplete="email" required', '<span class="hint">Für Bestellbestätigung, Rechnung und Sendungsverfolgung.</span>') + field("phone", "Telefon *", c.phone, 'type="tel" autocomplete="tel" required', '<span class="hint">Nur für den Paketdienst bzw. Rückfragen.</span>') + "</div>" +
      '<div id="psAddrErr" class="ps-err" role="alert"></div></form><div class="ps-nav"><button type="button" class="ps-btn" data-go="3">Zurück</button><button type="button" class="ps-btn primary" data-act="next4">Weiter zur Prüfung</button></div></div><aside class="ps-price" id="psPrice" aria-live="polite"></aside></div>';
  }
  function mockHtml() {
    var pv = S.previews;
    if ((!pv || !pv.length) && imgOk(S.prod.img)) return '<div class="ps-mock photo"><img src="' + esc(S.prod.img) + '" alt=""><a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">' + (isLogo() ? "Logo-PDF ansehen" : "Druck-PDF ansehen") + '</a><span class="cap">Produktfoto von Print.com – dein Motiv ' + (isLogo() ? "wird wie hochgeladen platziert" : "siehst du im PDF") + "</span></div>"; var k = S.prod.key, round = /rund|round|kreis|circle/i.test(labelOf("shape") + " " + (S.sel.shape || ""));
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
    var n = (p.copies || totalCopies()), lab = p.labels || S.prod.props.map(function (pr) { return [pr.title, labelOf(pr.slug)]; });
    var rows = [["Produkt", S.prod.title + " · " + (+n).toLocaleString("de-AT") + " Stk."]].concat(lab, [["Produktion", (S.prod.urgency.filter(function (u) { return u.slug === S.urgency; })[0] || {}).name || "Standard"], ["Lieferung", [c.company, c.firstName + " " + c.lastName, c.street, c.zip + " " + c.city, "Österreich"].filter(Boolean).join(", ")]].concat(p.deliveryDate ? [["Voraussichtlich bei dir", deDate(p.deliveryDate)]] : []));
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
      '<label class="ps-cb"><input type="checkbox" data-acc="proof"' + (S.accept.proof ? " checked" : "") + '><span><b>Druckdaten geprüft:</b> Ich habe Texte, Rechtschreibung, Bilder, Farben und Format geprüft und gebe die Daten so zum Druck frei.' + (isLogo() ? " Farben und Logo-Platzierung können leicht abweichen." : "") + '</span></label>' +
      '<label class="ps-cb"><input type="checkbox" data-acc="terms"' + (S.accept.terms ? " checked" : "") + '><span>Ich akzeptiere die <a href="/print/agb" target="_blank" rel="noopener">AGB</a> und habe die <a href="/datenschutz" target="_blank" rel="noopener">Datenschutzerklärung</a> gelesen.</span></label>' +
      '<label class="ps-cb"><input type="checkbox" data-acc="fagg"' + (S.accept.fagg ? " checked" : "") + '><span>Ich nehme zur Kenntnis, dass bei Waren, die nach meinen Vorgaben angefertigt bzw. bedruckt werden, <b>kein Rücktrittsrecht</b> besteht (§ 18 Abs. 1 Z 3 FAGG).</span></label>' +
      '<div class="ps-err" id="psOrderErr" role="alert">' + esc(S.err) + '</div><div class="ps-nav"><button type="button" class="ps-btn" data-go="4">Zurück</button><button type="button" class="ps-btn primary" data-act="order"' + (S.busy ? " disabled" : "") + ">" + (S.busy ? '<span class="ps-spin"></span> Wird gesendet …' : (S.payment === "invoice" ? "Zahlungspflichtig bestellen" : "Zahlungspflichtig bestellen & bezahlen")) + "</button></div>" +
      '<p class="ps-terms">Mit dem Klick bestellst du verbindlich. Der Vertrag kommt mit unserer Bestellbestätigung per E-Mail zustande' + (S.payment === "invoice" ? ", bei Rechnungskauf mit der Freigabe" : "") + ".</p></div>" +
      '<aside class="ps-price" id="psPrice"><h3>Zusammenfassung</h3>' + priceHtml(true) + "</aside></div>";
  }

  // ── Ereignisse ──
  root.addEventListener("click", function (e) {
    var t = e.target.closest("[data-go],[data-prod],[data-act],[data-ctype],[data-group],[data-sub],[data-gal]"); if (!t || t.disabled) return;
    if (t.hasAttribute("data-go")) { e.preventDefault(); go(+t.getAttribute("data-go")); return; }
    if (t.hasAttribute("data-prod")) { pickProduct(t.getAttribute("data-prod"), function () { go(2); }); return; }
    if (t.hasAttribute("data-group")) { S.group = t.getAttribute("data-group"); S.sub = ""; render(); return; }
    if (t.hasAttribute("data-sub")) { S.sub = t.getAttribute("data-sub"); render(); return; }
    if (t.hasAttribute("data-gal")) { S.gal = +t.getAttribute("data-gal"); var gm = root.querySelector(".ps-gal .main img"), th = t.querySelector("img"); if (gm && th) gm.src = th.src.replace(/w=\d+/, "w=1000"); root.querySelectorAll("[data-gal]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); return; }
    if (t.hasAttribute("data-ctype")) { saveAddr(); S.ctype = t.getAttribute("data-ctype"); if (S.ctype === "private") S.uidRes = null; loadPrice(); render(); return; }
    var a = t.getAttribute("data-act"), i = a.indexOf(":"), k = i > -1 ? a.slice(0, i) : a, v = i > -1 ? a.slice(i + 1) : "";
    if (k === "next2") { if (S.price) go(3); return; }
    if (k === "clearlogo") { delete S.logos[v]; S.file = null; render(); return; }
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
    if (t.matches("select[data-copies]")) { S.copies = +t.value; var qx = document.getElementById("psQty"); if (qx) qx.value = ""; render(); loadPrice(); return; }
    if (t.matches("select[data-urgency]")) { S.urgency = t.value; render(); loadPrice(); return; }
    if (t.name === "copies") { S.copies = +t.value; var qi = document.getElementById("psQty"); if (qi) qi.value = ""; loadPrice(); return; }
    if (t.id === "psQty") { var n = parseInt(t.value, 10); if (n > 0) { S.copies = n; render(); loadPrice(); } return; }
    if (t.id === "psW" || t.id === "psH") { S.custom[t.id === "psW" ? "w" : "h"] = t.value; if (S.file) { S.file = null; S.previews = null; toast("Format geändert – bitte die Gestaltung bzw. Datei erneut prüfen."); } loadPrice(); return; }
    if (t.name === "tmethod") { var p = S.prod, m = p.methods.filter(function (x) { return x.key === t.value; })[0]; S.textile.method = t.value; S.textile.positions = S.textile.positions.filter(function (x) { return m.positions.indexOf(x) > -1; }); if (!S.textile.positions.length) S.textile.positions = [m.positions[0]]; resetLogos(); render(); loadPrice(); return; }
    if (t.name === "tpos") { var ps = S.textile.positions.filter(function (x) { return x !== t.value; }); if (t.checked) ps.push(t.value); S.textile.positions = S.prod.positions.map(function (x) { return x.slug; }).filter(function (x) { return ps.indexOf(x) > -1; }); resetLogos(); loadPrice(); return; }
    if (t.hasAttribute("data-logo") && t.files && t.files[0]) return uploadFile(t.files[0], t.getAttribute("data-logo"));
    if (t.name === "urgency") { S.urgency = t.value; loadPrice(); return; }
    if (t.matches("[data-country]")) { S.customer.country = t.value; if (S.customer.zip && !(t.value === "DE" ? /^\d{5}$/ : /^\d{4}$/).test(S.customer.zip)) S.customer.zip = ""; loadPrice(); return; }
    if (t.id === "psFile" && t.files && t.files[0]) return uploadFile(t.files[0]);
    if (t.id === "country" || t.id === "zip") { saveAddr(); loadPrice(); return; }
    if (t.id === "uid") { S.uid = t.value; S.uidRes = null; return; }
    if (t.name === "pay") { S.payment = t.value; render(); return; }
    if (t.hasAttribute("data-acc")) { S.accept[t.getAttribute("data-acc")] = t.checked; return; }
  });
  root.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "psQ") { S.q = t.value; var g = document.getElementById("psGrid"); if (g) g.innerHTML = gridHtml(); return; }
    if (t.hasAttribute("data-tsize")) { var n = Math.max(0, Math.min(5000, parseInt(t.value, 10) || 0)); if (n) S.textile.sizes[t.getAttribute("data-tsize")] = n; else delete S.textile.sizes[t.getAttribute("data-tsize")]; renderPrice(); loadPrice(); return; }
  });
  function resetLogos() { var keep = {}; S.textile.positions.forEach(function (x) { if (S.logos[x]) keep[x] = S.logos[x]; }); S.logos = keep; S.file = null; }
  function setProp(slug, val) {
    var before = JSON.stringify(S.sel), lk = isLogo() ? logoKey() : ""; S.sel[slug] = val; fixSel(slug);
    if (S.file && !isLogo() && before !== JSON.stringify(S.sel)) { S.file = null; S.previews = null; toast("Ausführung geändert – bitte die Gestaltung bzw. Datei erneut prüfen."); }
    if (isLogo() && kind() === "promo" && lk !== logoKey()) { S.logos = {}; S.file = null; }
    render(); loadPrice();
  }
  root.addEventListener("dragover", function (e) { var d = e.target.closest(".ps-drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  root.addEventListener("dragleave", function (e) { var d = e.target.closest(".ps-drop"); if (d) d.classList.remove("over"); });
  root.addEventListener("drop", function (e) { var d = e.target.closest(".ps-drop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) uploadFile(f, d.getAttribute("data-logo") || ""); });

  // Upload: Druckdatei bzw. Logo für eine Position (logo = Positions-Slug)
  function uploadFile(f, logo) {
    var er = logo ? root.querySelector('[data-err="' + logo + '"]') : document.getElementById("psUpErr"); er.innerHTML = "";
    if (f.size > 50 * 1024 * 1024) { er.innerHTML = '<p class="ps-err">Die Datei ist größer als 50 MB.</p>'; return; }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { er.innerHTML = '<p class="ps-err">Bitte PDF, JPG oder PNG hochladen.</p>'; return; }
    var pr = logo ? root.querySelector('label[data-logo="' + logo + '"] .ps-prog') : document.getElementById("psProg"); pr.hidden = false;
    var x = new XMLHttpRequest(); x.open("POST", "/print/api/upload");
    x.setRequestHeader("X-Print-Shop", "1"); x.setRequestHeader("Content-Type", "application/octet-stream");
    x.setRequestHeader("X-File-Name", encodeURIComponent(f.name)); x.setRequestHeader("X-Print-Config", encodeURIComponent(JSON.stringify(Object.assign(cfgOf(), logo ? { logo: logo } : {}))));
    x.upload.onprogress = function (ev) { if (ev.lengthComputable) pr.firstChild.style.width = Math.round(ev.loaded / ev.total * 100) + "%"; };
    x.onload = function () { var j = {}; try { j = JSON.parse(x.responseText); } catch (e2) {} if (j.ok && logo) { S.logos[logo] = j; S.file = null; render(); toast(j.blocked ? "Bitte ein anderes Logo verwenden." : "Logo geprüft ✓"); mergeLogos(); } else if (j.ok) { S.file = j; S.previews = null; S.design = null; render(); toast(j.blocked ? "Bitte die markierten Punkte korrigieren." : "Datei geprüft ✓"); pollPreflight(); } else { pr.hidden = true; er.innerHTML = '<p class="ps-err">' + esc(j.error || "Upload fehlgeschlagen") + "</p>"; } };
    x.onerror = function () { pr.hidden = true; er.innerHTML = '<p class="ps-err">Upload fehlgeschlagen – bitte erneut versuchen.</p>'; };
    x.send(f);
  }
  // alle Logos da → eine gemeinsame PDF (Seite je Position) auf dem Server
  function mergeLogos() {
    var pos = logoPositions(), logos = {}; if (!pos.every(function (x) { var l = S.logos[x.slug]; if (l) logos[x.slug] = { fileId: l.fileId, token: l.token }; return l && !l.blocked; })) return;
    api("/print/api/logos", Object.assign(cfgOf(), { logos: logos })).then(function (j) { if (j.ok) { S.file = j; if (S.step === 3) render(); } else toast(j.error || "Logos konnten nicht zusammengeführt werden", true); });
  }
  function pollPreflight(n) {
    n = n || 0; if (!S.file || !S.file.preflight || S.file.preflight.status !== "PROCESSING" || n > 20) return;
    setTimeout(function () { api("/print/api/file/" + S.file.fileId + "?t=" + S.file.token).then(function (j) { if (j.ok && S.file && j.fileId === S.file.fileId) { S.file = j; if (S.step === 3) render(); pollPreflight(n + 1); } }); }, 4000);
  }

  // ── Designer ──
  var dLoading = null;
  function loadDesigner() {
    if (window.PrintDesigner) return Promise.resolve(window.PrintDesigner);
    if (!dLoading) dLoading = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "/print/designer.js?v=" + (window.PRINT_V || "2"); s.onload = function () { window.PrintDesigner ? res(window.PrintDesigner) : rej(new Error("Designer fehlt")); }; s.onerror = function () { dLoading = null; rej(new Error("Designer konnte nicht geladen werden")); }; document.head.appendChild(s); });
    return dLoading;
  }
  function openDesigner(draft) {
    var sz = sizeOf(); if (!sz) { toast("Format unbekannt – bitte Datei hochladen", true); return; }
    toast("Designer wird geladen …");
    loadDesigner().then(function (D) {
      return D.open({ product: S.prod, sel: S.sel, labels: S.prod.props.map(function (pr) { return [pr.slug, labelOf(pr.slug)]; }), copies: S.copies, urgency: S.urgency, custom: isCustom() ? S.custom : undefined, size: sz, bleed: (S.price && S.price.bleed) || S.prod.bleed, safe: S.prod.safe || 3, sides: sides(), fonts: S.cat.fonts, design: draft || S.design,
        onDone: function (file, previews, design) { S.file = file; S.previews = previews; S.design = design; S.mode = "design"; render(); toast(file.blocked ? "Bitte die markierten Punkte prüfen." : "Druck-PDF erstellt ✓"); },
        onClose: function (design) { if (design) S.design = design; render(); } });
    }).catch(function (e) { toast(e.message || "Designer konnte nicht geladen werden", true); });
  }
  function loadDraft(id, t) {
    api("/print/api/draft/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(t)).then(function (j) {
      if (!j.ok || !j.draft || !prodByKey(j.draft.product)) { toast(j.error || "Entwurf nicht gefunden", true); render(); return; }
      var d = j.draft; pickProduct(d.product, function () {
        S.prod.props.forEach(function (pr) { if (d.sel && pr.options.some(function (o) { return o.slug === d.sel[pr.slug]; })) S.sel[pr.slug] = d.sel[pr.slug]; });
        if (+d.copies > 0) S.copies = +d.copies; if (d.urgency) S.urgency = d.urgency; if (d.custom && d.custom.w) S.custom = { w: d.custom.w, h: d.custom.h };
        fixSel(); loadPrice(); S.step = 3; S.design = d.design || null; render(); if (S.design) openDesigner(S.design);
        try { history.replaceState(null, "", "/print"); } catch (e) {}
      });
    });
  }
  window.PrintShop.saveDraftLink = function (design) {
    return api("/print/api/draft", Object.assign(cfgOf(), { design: design }));
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
