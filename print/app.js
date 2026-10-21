/* FS Creative Druckshop – Ablauf auf /print: 1 Produkt → 2 Optionen & Menge (Live-Preis) → 3 Gestalten/Hochladen → 4 Warenkorb → 5 Adresse → 6 Prüfen & Bezahlen.
   Warenkorb: localStorage (30 Tage), bei Anmeldung zusätzlich im Kundenkonto. Kundenkonto (Login, Registrierung mit Mail-Code, Profil, Bestellungen) unter /print?konto.
   Preise kommen immer vom Server (/print/api/price), bestellt wird über /print/api/checkout (alle Positionen, eine Zahlung); der Designer (/print/designer.js) wird erst in Schritt 3 geladen.
   Produktarten (kind): flat (Drucksachen, auch eigenes Format), banner (Wunschgröße in cm), textile (Logo je Druckposition, Größen-Mix), promo (Logo auf Druckfläche).
   Produkte, Bilder und Kategorien stammen von Print.com (Sortiment im Cockpit freigeschaltet); allgemeine Produkte werden erst beim Öffnen geladen (/print/api/product). */
(function () {
  "use strict";
  var root = document.getElementById("shop");
  if (!root) return;
  var H = { "Content-Type": "application/json", "X-Print-Shop": "1" };
  var S = { ddGrp: {}, ddCat: {}, cat: null, step: 1, prod: null, sel: {}, copies: 0, urgency: "standard", country: "AT", zip: "", ctype: "private", uid: "", uidRes: null, group: "", sub: "", q: "", gal: 0,
    custom: { w: 0, h: 0 }, textile: null, logos: {}, price: null, priceErr: "", priceBusy: false, file: null, previews: null, design: null, mode: "", customer: { country: "AT" }, payment: "", accept: {}, busy: false, err: "" };
  var STEPS = ["Produkt", "Ausführung", "Gestalten", "Warenkorb", "Lieferung", "Bezahlen"];
  S.page = "home"; S.check = "self"; S.cart = cartLoad(); S.me = null; S.orders = []; S.view = ""; S.acct = { mode: "login", email: "", msg: "", err: "" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var eur = function (n) { return (+n || 0).toLocaleString("de-AT", { style: "currency", currency: "EUR" }); };
  var deDate = function (iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ""; var d = new Date(+m[1], +m[2] - 1, +m[3]); return d.toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "long" }); };
  // Texte aus dem Print.com-CMS: HTML/Markdown/Links entfernen (teils abgeschnittene <a href=…)
  var txt = function (v) { return String(v || "").replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1").replace(/<[^>]*>?/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/&nbsp;/g, " ").replace(/\*\*|__/g, "").replace(/[ \t]{2,}/g, " ").trim(); };
  // erste Aussage einer Beschreibung (für Untertitel/Karten): keine Aufzählung, max. ~140 Zeichen
  var lead = function (v) { var t = txt(v); if (/^\s*[-*•]/.test(t)) return ""; t = t.split(/\n| - /)[0]; return t.length > 140 ? t.slice(0, 137).replace(/\s+\S*$/, "") + " …" : t; };
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
  (window.__catP ? window.__catP.catch(function () { return api("/print/api/catalog"); }) : api("/print/api/catalog")).then(function (c) {
    document.getElementById("psLoading").hidden = true;
    if (!c || !c.ready) { document.getElementById("psSetup").hidden = false; return; }
    S.cat = c; window.PrintShop.ai = !!c.ai; fixLabels(c.products);
    if (q.get("bestellung") && q.get("t")) return showStatus(q.get("bestellung"), q.get("t"));
    if (q.get("entwurf") && q.get("t")) return loadDraft(q.get("entwurf"), q.get("t"));
    if (q.has("konto")) S.view = "konto"; else if (q.has("warenkorb")) S.step = 4; else if (q.has("produkte") || q.get("q") || q.get("kategorie")) { S.page = "produkte"; S.q = q.get("q") || ""; S.group = q.get("kategorie") || ""; S.sub = q.get("unter") || ""; }
    var pk = q.get("produkt"); if (pk && c.products.some(function (p) { return p.key === pk; })) { pickProduct(pk, function () { if (q.get("c") && cfgApply(q.get("c"))) { toast("Gespeicherte Konfiguration geladen"); loadPrice(); } S.step = 2; render(); }); }
    render();
  }).catch(function () { document.getElementById("psLoading").hidden = true; document.getElementById("psSetup").hidden = false; });

  loadMe();

  // ── Konfiguration teilen & merken: alles Gewählte steckt im Link (?produkt=…&c=…), kein Server nötig ──
  var b64e = function (t) { return btoa(unescape(encodeURIComponent(t))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  var b64d = function (t) { t = String(t).replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "="; return decodeURIComponent(escape(atob(t))); };
  function cfgPack() { var c = { s: S.sel, q: S.copies, u: S.urgency }; if (S.pm && S.pm !== "auto") c.m = S.pm; if (isCustom()) c.c = S.custom; if (kind() === "textile" && S.textile) c.t = S.textile; return b64e(JSON.stringify(c)); }
  function cfgLink(p, code) { return location.origin + "/print?produkt=" + encodeURIComponent(p) + "&c=" + code; }
  function cfgApply(code) {
    var c; try { c = JSON.parse(b64d(code)); } catch (e) { return false; } if (!c || typeof c !== "object") return false;
    var p = S.prod; (p.props || []).forEach(function (pr) { var v = c.s && c.s[pr.slug]; if (v != null && pr.options.some(function (o) { return String(o.slug) === String(v); })) S.sel[pr.slug] = String(v); });
    if (+c.q > 0 && +c.q <= 1e6) S.copies = Math.round(+c.q); if (c.u && (p.urgency || []).some(function (u) { return u.slug === c.u; })) S.urgency = c.u; if (c.m && typeof c.m === "string") S.pm = c.m;
    if (c.c && c.c.w && c.c.h && p.custom) S.custom = { w: String(+c.c.w || ""), h: String(+c.c.h || "") };
    if (c.t && kind() === "textile" && S.textile && p.methods) { var m = p.methods.filter(function (x) { return x.key === c.t.method; })[0];
      if (m) { S.textile.method = m.key; var ps = (c.t.positions || []).filter(function (x) { return m.positions.indexOf(x) > -1; }); if (ps.length) S.textile.positions = ps;
        var sz = {}; Object.keys(c.t.sizes || {}).forEach(function (k) { if (p.sizes.some(function (x) { return x.slug === k; }) && +c.t.sizes[k] > 0) sz[k] = Math.min(5000, Math.round(+c.t.sizes[k])); }); if (Object.keys(sz).length) S.textile.sizes = sz; } }
    fixSel(); return true;
  }
  function cfgSum() { var pr = S.price || {}, l = (pr.labels || []).filter(function (x) { return x && x[1] && !/auflage|druckverfahren|lieferzeit/i.test(x[0]) && !NONE_RX.test(String(x[1]).trim()); }).slice(0, 4).map(function (x) { return x[1]; });
    return (isCustom() && S.custom ? [S.custom.w + " × " + S.custom.h + " " + S.prod.custom.unit] : []).concat(l).join(" · ").slice(0, 210); }
  function savedLocal(v) { try { if (v) { localStorage.setItem("fsc-print-saved", JSON.stringify(v.slice(0, 30))); return v; } var l = JSON.parse(localStorage.getItem("fsc-print-saved") || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function savedList() { return S.me ? (S.me.saved || []) : savedLocal(); }
  function cfgSavedNow() { if (!S.prod) return null; var code = cfgPack(); return savedList().filter(function (x) { return x.product === S.prod.key && x.c === code; })[0] || null; }
  function copyText(t) { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t); return new Promise(function (ok, no) { var a = document.createElement("textarea"); a.value = t; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0"; document.body.appendChild(a); a.select(); var r = false; try { r = document.execCommand("copy"); } catch (e) {} a.remove(); r ? ok() : no(); }); }
  function shareLink(url, title, text) {
    if (navigator.share && (navigator.maxTouchPoints > 0 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent))) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); return; }
    copyText(url).then(function () { toast("Link kopiert – einfach einfügen und teilen"); }, function () { window.prompt("Link zum Teilen (kopieren):", url); });
  }
  function cfgShare() { shareLink(cfgLink(S.prod.key, cfgPack()), S.prod.title + " – FS Creative Druckshop", S.prod.title + " · " + totalCopies().toLocaleString("de-AT") + " Stk." + (cfgSum() ? " · " + cfgSum() : "") + (S.price ? " · " + eur(S.price.gross) + " inkl. USt & Versand" : "")); }
  function cfgSave() {
    var had = cfgSavedNow(); if (had) { savDel(had.id); return; }   // zweiter Klick = wieder entfernen
    var it = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), product: S.prod.key, title: S.prod.title, img: imgOk(S.prod.img) ? S.prod.img : "", sum: cfgSum(), n: totalCopies(), gross: S.price ? S.price.gross : null, c: cfgPack(), at: new Date().toISOString() };
    if (S.me) api("/print/api/account/saved", { op: "add", item: it }).then(function (j) { if (!j.ok) { toast(j.error || "Merken hat nicht geklappt", true); return; } S.me = j.customer; toast("Gemerkt – in deinem Konto unter „Merkliste“"); cfgBarUpd(); }).catch(function () { toast("Keine Verbindung", true); });
    else { var l = savedLocal(); l.unshift(it); savedLocal(l); toast("Gemerkt – auf diesem Gerät. Mit Kundenkonto auf allen Geräten."); cfgBarUpd(); }
  }
  function savDel(id) {
    if (S.me) api("/print/api/account/saved", { op: "del", id: id }).then(function (j) { if (j.ok) { S.me = j.customer; toast("Aus der Merkliste entfernt"); if (S.view || S.step === 1) render(); else cfgBarUpd(); } });
    else { savedLocal(savedLocal().filter(function (x) { return x.id !== id; })); toast("Aus der Merkliste entfernt"); if (S.view || S.step === 1) render(); else cfgBarUpd(); }
  }
  function cfgBarHtml() { var on = !!cfgSavedNow();
    return '<div class="ps-cfgbar"><button type="button" class="ps-cfgb' + (on ? " on" : "") + '" data-act="cfgsave" aria-pressed="' + on + '"><span aria-hidden="true">' + (on ? "♥" : "♡") + "</span>" + (on ? "Gemerkt" : "Merken") + '</button><button type="button" class="ps-cfgb" data-act="cfgshare"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>Teilen</button></div>'; }
  function cfgBarUpd() { [].forEach.call(document.querySelectorAll(".ps-cfgbar"), function (b) { b.outerHTML = cfgBarHtml(); }); }
  function savedCard(x) { var url = cfgLink(x.product, x.c);
    return '<div class="ps-sav"><a class="im" href="' + esc(url) + '">' + (x.img ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : "") + '</a><div class="tx"><a href="' + esc(url) + '"><b>' + esc(x.title) + "</b></a><span>" + esc([(+x.n || 0).toLocaleString("de-AT") + " Stk."].concat(x.sum ? [x.sum] : []).join(" · ")) + "</span>" +
      (x.gross != null ? '<small>beim Merken ' + eur(x.gross) + " · aktueller Preis beim Öffnen</small>" : "") + '</div><div class="ac"><a class="ps-btn primary small" href="' + esc(url) + '">Öffnen</a><button type="button" class="ps-link" data-act="savshare:' + esc(x.id) + '">Teilen</button><button type="button" class="ps-link" data-act="savdel:' + esc(x.id) + '">Entfernen</button></div></div>'; }

  // ── Warenkorb (30 Tage im Browser, angemeldet zusätzlich im Konto) ──
  function cartLoad() { try { var c = JSON.parse(localStorage.getItem("fsc-print-cart") || "null"); if (c && Array.isArray(c.items) && Date.now() - (+c.at || 0) < 30 * 864e5) return c.items; } catch (e) {} return []; }
  function cartSave(noSync) {
    try { localStorage.setItem("fsc-print-cart", JSON.stringify({ at: Date.now(), items: S.cart })); } catch (e) { try { localStorage.setItem("fsc-print-cart", JSON.stringify({ at: Date.now(), items: S.cart.map(function (x) { return Object.assign({}, x, { preview: "" }); }) })); } catch (e2) {} }
    if (S.me && !noSync) api("/print/api/account/cart", { items: S.cart.map(function (x) { return Object.assign({}, x, { preview: "" }); }) });
    headUpdate();
  }
  function cartAdd() {
    var pr = S.price || {}, pv = S.previews && S.previews[0];
    var it = JSON.parse(JSON.stringify(cfgOf()));
    Object.assign(it, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: S.prod.title, tiers: (S.prod.tiers || []).slice(0, 30), img: imgOk(S.prod.img) ? S.prod.img : "", icon: S.prod.icon || "",
      fileId: S.file.fileId, fileToken: S.file.token, fileName: S.file.kind === "design" ? "Eigene Gestaltung" : (S.file.name || "Druckdatei"), preview: pv && pv.length < 90000 ? pv : "",
      n: pr.copies || totalCopies(), labels: (pr.labels || []).slice(0, 12), size: isCustom() && sizeOf() ? S.custom.w + " × " + S.custom.h + " " + S.prod.custom.unit : labelOf("size"),
      price: S.price ? { net: pr.net, gross: pr.gross, vat: pr.vat, rate: pr.rate, deliveryDate: pr.deliveryDate } : null, warn: (S.file.checks || []).some(function (c) { return c.level !== "ok"; }) || !!(S.file.edgeWarn && S.file.edgeWarn.length), clientWarn: (S.file.edgeWarn || []).map(function (w) { return w.replace(/^!/, ""); }).slice(0, 10), checks: (S.file.checks || []).filter(function (c) { return c.level !== "ok"; }).map(function (c) { return { level: c.level, text: String(c.text || "").slice(0, 400) }; }).slice(0, 10), at: Date.now() });
    if (S.mot.n > 1 && motOk()) { it.motifs = S.mot.split.map(function (v, i) { var f = S.mot.files[i]; return { copies: v, fileId: f.file.fileId, fileToken: f.file.token, fileName: f.file.kind === "design" ? "Eigene Gestaltung" : (f.file.name || "Druckdatei"), preview: f.previews && f.previews[0] && f.previews[0].length < 60000 ? f.previews[0] : "" }; }); it.fileName = it.motifs.length + " Motive (" + S.mot.split.join(" / ") + " Stk.)"; }
    S.cart.push(it); cartSave();
    S.file = null; S.previews = null; S.design = null; S.mode = ""; S.logos = {}; S.accept = {}; motReset();
    toast("„" + it.title + "“ liegt im Warenkorb");
  }
  var PRO_CHECK = 5;
  function cartTotals(noFee) { var t = { net: 0, vat: 0, gross: 0, rate: null, missing: false }; S.cart.forEach(function (x) { if (!x.price) { t.missing = true; return; } t.net += +x.price.net || 0; t.vat += +x.price.vat || 0; t.gross += +x.price.gross || 0; if (t.rate == null) t.rate = x.price.rate; });
    if (!noFee && S.check === "pro" && S.cart.length) { var fn = PRO_CHECK / (1 + (t.rate || 0) / 100); t.gross += PRO_CHECK; t.net += fn; t.vat += PRO_CHECK - fn; t.fee = PRO_CHECK; }
    ["net", "vat", "gross"].forEach(function (k) { t[k] = Math.round(t[k] * 100) / 100; }); return t; }
  var rqSeq = 0;
  function requoteCart() {
    var seq = ++rqSeq; S.quoting = S.cart.length; S.cartErr = {};
    S.cart.forEach(function (x) {
      api("/print/api/price", { product: x.product, sel: x.sel, copies: x.copies, urgency: x.urgency, pm: x.pm, custom: x.custom, textile: x.textile, country: S.customer.country || "AT", zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "", voucher: S.voucher || "" }).then(function (j) {
        if (seq !== rqSeq) return; S.quoting--;
        if (S.voucher) { if (j.voucherErr) { S.voucherErr = j.voucherErr; S.voucherOk = ""; } else if (j.voucher) { S.voucherOk = j.voucher.code + " · " + String(j.voucher.pct).replace(".", ",") + " % Rabatt"; S.voucherErr = ""; } }
        if (j.ok && j.labels && j.labels.length) x.labels = j.labels.slice(0, 12); if (j.ok) x.price = { net: j.price.net, gross: j.price.gross, vat: j.price.vat, rate: j.price.rate, deliveryDate: j.price.deliveryDate, taxNote: j.price.taxNote, bonus: j.price.bonus || null }; else { x.price = null; S.cartErr[x.id] = j.error || "Preis nicht verfügbar"; }
        if (!S.quoting) { cartSave(true); if (S.step === 6 || S.step === 4) render(); }
      }).catch(function () { if (seq !== rqSeq) return; S.quoting--; S.cartErr[x.id] = "Keine Verbindung"; if (!S.quoting && S.step === 6) render(); });
    });
  }
  function itemLine(x, noQty) { return [x.size, noQty ? "" : (+x.n || 0).toLocaleString("de-AT") + " Stk."].concat((x.labels || []).filter(function (l) { return l && l[1] && !/format|größe|auflage/i.test(l[0]) && !NONE_RX.test(String(l[1]).trim()); }).slice(0, 5).map(function (l) { return l[1]; })).filter(Boolean).join(" · "); }
  function itemThumb(x) { var pp = prodByKey(x.product) || {}, im = imgOk(x.img) ? x.img : imgOk(pp.img) ? pp.img : "";
    return '<span class="ps-ci-img">' + (x.preview || im ? '<img src="' + esc(x.preview || im) + '" alt="" loading="lazy"' + (x.preview && im ? ' data-fb="' + esc(im) + '"' : "") + ">" : '<span aria-hidden="true">' + esc(x.icon || pp.icon || "🖨️") + "</span>") + "</span>"; }
  // Aktionsbanner: Code kopieren / Banner schließen (merkt sich das Gerät)
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-promo-copy],[data-promo-x]"); if (!b) return;
    if (b.hasAttribute("data-promo-x")) { try { localStorage.setItem("fsc-print-promo-x", b.getAttribute("data-promo-x")); } catch (er) {} document.documentElement.classList.add("promo-x"); return; }
    var code = b.getAttribute("data-promo-copy"), lab = b.querySelector("i"); copyText(code).then(function () { if (lab) { lab.textContent = "Kopiert ✓"; b.classList.add("ok"); setTimeout(function () { lab.textContent = "Kopieren"; b.classList.remove("ok"); }, 2200); } toast("Code " + code + " kopiert – an der Kasse einfügen 🎉"); }, function () { window.prompt("Code kopieren:", code); }); });
  document.addEventListener("click", function (e) { var c = e.target.closest && e.target.closest("[data-copy]"); if (!c) return; copyText(c.getAttribute("data-copy")).then(function () { toast("Sendungsnummer kopiert"); }, function () {}); });
  // Vorschaubild kaputt (z. B. abgelaufen) → Produktbild
  document.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "IMG" && t.closest && t.closest(".ps-ci-img")) { var fb = t.getAttribute("data-fb"); if (fb && t.src !== fb) { t.removeAttribute("data-fb"); t.src = fb; } else t.style.visibility = "hidden"; } }, true);
  function vCart() {
    var co = S.ctype === "company", t = cartTotals();
    if (!S.cart.length) return '<div class="ps-panel ps-empty"><h2>Dein Warenkorb ist leer</h2><p class="sub">Such dir ein Produkt aus, gestalte es online oder lade deine Druckdaten hoch – dein Warenkorb bleibt 30 Tage gespeichert.</p><div class="ps-nav"><span></span><button type="button" class="ps-btn primary" data-act="shop">Produkte ansehen</button></div></div>';
    var h = '<div class="ps-layout"><div class="ps-panel"><h2>Warenkorb</h2><p class="sub">' + S.cart.length + (S.cart.length === 1 ? " Position" : " Positionen") + " · wird 30 Tage gespeichert" + (S.me ? " – auch in deinem Kundenkonto" : ' · <button type="button" class="ps-link" data-act="konto">Anmelden</button>, um ihn auf allen Geräten zu haben') + "</p><ul class=\"ps-cart\">";
    S.cart.forEach(function (x) {
      var tl = (x.tiers && x.tiers.length ? x.tiers : (prodByKey(x.product) || {}).tiers) || [], canQ = tl.length > 1 && !x.motifs && !(x.textile && x.textile.sizes && Object.keys(x.textile.sizes).length),
        qs = canQ ? '<label class="ps-ciq"><span>Stück</span><select data-cartq="' + esc(x.id) + '" aria-label="Stückzahl ' + esc(x.title) + '">' + (tl.indexOf(+x.copies) < 0 ? '<option value="' + (+x.copies) + '" selected>' + (+x.copies).toLocaleString("de-AT") + "</option>" : "") + tl.map(function (n) { return '<option value="' + n + '"' + (n === +x.copies ? " selected" : "") + ">" + n.toLocaleString("de-AT") + "</option>"; }).join("") + "</select></label>" : "";
      h += "<li>" + itemThumb(x) + '<div class="ps-ci-bd"><b>' + esc(x.title) + "</b><span>" + esc(itemLine(x, canQ)) + "</span>" + qs + '<span class="ps-ci-f">' + esc(x.fileName || "") + (x.warn ? ' · <button type="button" class="ps-link ps-warnl" data-act="cwarn:' + esc(x.id) + '">⚠ Hinweise zur Datei ansehen</button>' : "") +
        ' · <a class="ps-link" target="_blank" rel="noopener" href="/print/api/file/' + esc(x.fileId) + "?t=" + esc(x.fileToken) + '&pdf=1">PDF</a></span></div><div class="ps-ci-pr">' + (x.price ? "<b>" + eur(co ? x.price.net : x.price.gross) + "</b><small>" + (co ? "netto" : "inkl. USt") + "</small>" : '<small>' + esc((S.cartErr || {})[x.id] || (S.quoting ? "wird berechnet …" : "Preis folgt")) + "</small>") +
        '<button type="button" class="ps-link" data-act="cartdel:' + esc(x.id) + '" aria-label="' + esc(x.title) + ' entfernen">Entfernen</button></div></li>';
    });
    h += "</ul>" + '<div class="ps-nav"><button type="button" class="ps-btn" data-act="shop">Weiter einkaufen</button><button type="button" class="ps-btn primary" data-go="5">Zur Kasse</button></div></div>' +
      '<aside class="ps-price"><h3>Summe</h3><div class="sum">' + eur(co ? t.net : t.gross) + "<small>" + (co ? "exkl. USt" : "inkl. USt") + "</small></div>" + (co && t.gross ? '<div class="sum2">' + eur(t.gross) + "<small>inkl. USt</small></div>" : "") +
      '<p class="note">inkl. Versand innerhalb Österreichs · Datencheck kostenlos. Der endgültige Preis wird an der Kasse mit deiner Adresse bestätigt.</p></aside></div>';
    return h;
  }

  // ── Kundenkonto ──
  function applyMe(j) {
    S.me = j.customer || null; S.orders = j.orders || []; S.bonus = j.bonus || null;
    if (S.me) {
      var have = {}; S.cart.forEach(function (x) { have[x.id] = 1; }); var add = (j.cart || []).filter(function (x) { return x && x.id && !have[x.id]; });
      if (add.length) S.cart = S.cart.concat(add);
      var c = S.customer; ["company", "firstName", "lastName", "phone", "street", "zip", "city"].forEach(function (k) { if (!c[k] && S.me[k]) c[k] = S.me[k]; }); if (!c.email) c.email = S.me.email;
      if (S.me.type === "company") { S.ctype = "company"; if (!S.uid) S.uid = S.me.uid || ""; }
      var loc = savedLocal(); if (loc.length) api("/print/api/account/saved", { op: "merge", items: loc }).then(function (r) { if (r.ok) { S.me = r.customer; savedLocal([]); try { localStorage.removeItem("fsc-print-saved"); } catch (e) {} if (S.view === "konto" || S.step === 1) render(); } }).catch(function () {});
      cartSave(!add.length && (j.cart || []).length === S.cart.length);
    }
    headUpdate();
  }
  function refreshMe() { api("/print/api/account/me").then(function (j) { if (j.ok && j.customer) S.me = j.customer; }).catch(function () {}); }
  function loadMe() { api("/print/api/account/me").then(function (j) { if (j.ok) { applyMe(j); if (S.cat) render(); } }).catch(function () {}); }
  function headUpdate() {
    document.querySelectorAll("[data-acct-link]").forEach(function (a) { var l = a.querySelector("[data-acct-label]"); if (l) l.textContent = S.me ? "Konto" : "Anmelden"; else a.textContent = S.me ? "Mein Konto" : "Anmelden"; });
    var cur = S.view === "konto" ? "konto" : S.step >= 4 && !S.view ? "cart" : S.step === 1 ? (S.page === "produkte" ? "produkte" : "home") : "produkte";
    document.querySelectorAll("[data-bn]").forEach(function (a) { a.classList.toggle("on", a.getAttribute("data-bn") === cur); });
    document.querySelectorAll("[data-cart-n]").forEach(function (b) { b.textContent = S.cart.length ? String(S.cart.length) : ""; b.hidden = !S.cart.length; });
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-acct-link],[data-cart-link]"); if (!a || !S.cat) return; e.preventDefault();
    if (a.hasAttribute("data-acct-link")) { S.view = "konto"; S.acct.err = ""; S.acct.msg = ""; render(); } else { S.view = ""; go(4); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  function acctField(id, label, type, val, ac) { return '<div class="ps-field"><label for="ac_' + id + '">' + label + '</label><input id="ac_' + id + '" name="' + id + '" type="' + (type || "text") + '" value="' + esc(val || "") + '"' + (ac ? ' autocomplete="' + ac + '"' : "") + "></div>"; }
  function vAccount() {
    var A = S.acct, h = '<div class="ps-acct">';
    var back = '<button type="button" class="ps-link" data-act="shop">← Zurück zum Shop</button>';
    var msg = (A.msg ? '<p class="ps-ok" role="status">' + esc(A.msg) + "</p>" : "") + '<p class="ps-err" role="alert">' + esc(A.err) + "</p>";
    if (!S.me) {
      var m = A.mode, f = function (inner, act, btn) { return '<form class="ps-form" data-acct-form="' + act + '" novalidate>' + inner + msg + '<button type="submit" class="ps-btn primary"' + (A.busy ? " disabled" : "") + ">" + (A.busy ? '<span class="ps-spin"></span> ' : "") + btn + "</button></form>"; };
      h += back + '<div class="ps-panel"><div class="ps-seg" role="group" aria-label="Konto"><button type="button" data-act="am:login" aria-pressed="' + (m === "login" || m === "forgot" || m === "reset") + '">Anmelden</button><button type="button" data-act="am:register" aria-pressed="' + (m === "register" || m === "code") + '">Registrieren</button></div>';
      if (m === "login") h += "<h2>Anmelden</h2>" + f(acctField("email", "E-Mail", "email", A.email, "email") + acctField("password", "Passwort", "password", "", "current-password"), "login", "Anmelden") + '<p><button type="button" class="ps-link" data-act="am:forgot">Passwort vergessen?</button></p>';
      else if (m === "register") h += '<h2>Kundenkonto anlegen</h2><p class="sub">Bestellungen im Blick, Adresse gespeichert, Warenkorb auf allen Geräten. Wir schicken dir einen Bestätigungscode per E-Mail.</p>' +
        f('<div class="ps-row2">' + acctField("firstName", "Vorname", "text", "", "given-name") + acctField("lastName", "Nachname", "text", "", "family-name") + "</div>" + acctField("email", "E-Mail", "email", A.email, "email") + acctField("password", "Passwort (mind. 8 Zeichen)", "password", "", "new-password") +
          '<label class="ps-cb"><input type="checkbox" name="newsletter"><span>Gelegentlich Angebote und Neuheiten per E-Mail erhalten (jederzeit abbestellbar)</span></label>', "register", "Konto anlegen");
      else if (m === "code") h += '<h2>E-Mail bestätigen</h2><p class="sub">Wir haben einen 6-stelligen Code an <b>' + esc(A.email) + "</b> geschickt (15 Minuten gültig). Schau bitte auch im Spam-Ordner nach.</p>" +
        f('<div class="ps-field"><label for="ac_code">Code</label><input id="ac_code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="ps-code"></div>', "verify", "Bestätigen") + '<p><button type="button" class="ps-link" data-act="acresend:verify">Code erneut senden</button></p>';
      else if (m === "forgot") h += '<h2>Passwort vergessen</h2><p class="sub">Gib deine E-Mail-Adresse ein – wir schicken dir einen Code zum Zurücksetzen.</p>' + f(acctField("email", "E-Mail", "email", A.email, "email"), "forgot", "Code senden") + '<p><button type="button" class="ps-link" data-act="am:login">Zurück zur Anmeldung</button></p>';
      else if (m === "reset") h += '<h2>Neues Passwort</h2><p class="sub">Code aus der E-Mail an <b>' + esc(A.email) + "</b> und neues Passwort eingeben.</p>" +
        f('<div class="ps-field"><label for="ac_code">Code</label><input id="ac_code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="ps-code"></div>' + acctField("password", "Neues Passwort (mind. 8 Zeichen)", "password", "", "new-password"), "reset", "Passwort speichern") + '<p><button type="button" class="ps-link" data-act="acresend:reset">Code erneut senden</button></p>';
      return h + "</div></div>";
    }
    var me = S.me, co = me.type === "company", tab = A.tab || "start", fm = function (k) { return A.form === k ? msg : ""; };
    var TABS = [["start", "Übersicht"], ["orders", "Bestellungen" + (S.orders.length ? " (" + S.orders.length + ")" : "")], ["saved", "Merkliste" + ((me.saved || []).length ? " (" + me.saved.length + ")" : "")], ["drafts", "Entwürfe" + ((me.drafts || []).length ? " (" + me.drafts.length + ")" : "")], ["address", "Adresse"], ["settings", "Einstellungen"]];
    var ini = ((me.firstName || "")[0] || "") + ((me.lastName || "")[0] || "") || (me.email || "?")[0];
    h += back + '<div class="ps-acct-hd"><span class="av" aria-hidden="true">' + esc(ini.toUpperCase()) + '</span><div class="nm"><h2>Hallo' + (me.firstName ? " " + esc(me.firstName) : "") + '!</h2><span class="pd-muted">' + esc(me.email) + ' · <span class="ps-acct-type ' + (co ? "co" : "pr") + '">' + (co ? "Firmenkonto" + (me.company ? " · " + esc(me.company) : "") : "Privatkonto") + '</span></span></div><button type="button" class="ps-btn small" data-act="aclogout">Abmelden</button></div>' +
      '<nav class="ps-acct-nav" role="tablist" aria-label="Kundenkonto">' + TABS.map(function (t) { return '<button type="button" role="tab" aria-selected="' + (tab === t[0]) + '" data-act="atab:' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</nav>";
    var orderRow = function (o) { var url = "/print?bestellung=" + encodeURIComponent(o.id) + "&t=" + encodeURIComponent(o.token);
      return '<li><a href="' + url + '"><b>' + esc(o.product) + "</b><span>" + esc(o.nr) + " · " + esc(new Date(o.createdAt).toLocaleDateString("de-AT")) + " · " + (+o.copies || 0).toLocaleString("de-AT") + ' Stk.</span></a><span class="ps-ost">' + esc(o.statusText) + "</span><b>" + eur(co ? o.net : o.gross) + "</b>" +
        '<span class="act">' + (o.tracks && o.tracks.length ? '<a class="ps-link" href="' + esc(o.tracks[0]) + '" target="_blank" rel="noopener">Sendung verfolgen ↗</a>' : "") + (o.canReorder ? '<button type="button" class="ps-btn small" data-act="reorder:' + esc(o.id) + '">Nochmal bestellen</button>' : "") + '<a class="ps-link" href="' + url + '">Details</a></span></li>'; };
    if (tab === "start") {
      var lo = S.orders[0];
      h += '<div class="ps-acct-grid ps-acct-start">';
      h += '<section class="ps-panel"><h3>Letzte Bestellung</h3>' + (lo ? '<p class="ps-lo"><b>' + esc(lo.product) + "</b> · " + (+lo.copies || 0).toLocaleString("de-AT") + " Stk. · " + eur(co ? lo.net : lo.gross) + '<br><span class="pd-muted">' + esc(lo.nr) + " vom " + esc(new Date(lo.createdAt).toLocaleDateString("de-AT")) + " · " + esc(lo.statusText) + "</span></p>" + trackHtml(lo.status) +
        '<div class="btn-row">' + (lo.tracks && lo.tracks.length ? '<a class="ps-btn primary small" href="' + esc(lo.tracks[0]) + '" target="_blank" rel="noopener">📦 Sendung verfolgen</a>' : "") + (lo.canReorder ? '<button type="button" class="ps-btn' + (lo.tracks && lo.tracks.length ? "" : " primary") + ' small" data-act="reorder:' + esc(lo.id) + '">Nochmal bestellen</button>' : "") + '<a class="ps-btn small" href="/print?bestellung=' + encodeURIComponent(lo.id) + "&t=" + encodeURIComponent(lo.token) + '">Details</a>' + (S.orders.length > 1 ? '<button type="button" class="ps-link" data-act="atab:orders">Alle ' + S.orders.length + " Bestellungen</button>" : "") + "</div>"
        : '<p class="pd-muted">Noch keine Bestellungen – such dir ein Produkt aus und gestalte es online oder lade deine Datei hoch.</p><button type="button" class="ps-btn primary small" data-act="shop">Produkte ansehen</button>') + "</section>";
      h += '<div class="col"><section class="ps-panel ps-qstats"><button type="button" data-cart-link><b>' + S.cart.length + "</b><span>im Warenkorb</span></button><button type=\"button\" data-act=\"atab:saved\"><b>" + (me.saved || []).length + "</b><span>Gemerkt</span></button><button type=\"button\" data-act=\"atab:orders\"><b>" + S.orders.length + "</b><span>Bestellungen</span></button></section>";
      if (!co) h += '<section class="ps-panel ps-acct-up"><h3>Bestellst du für eine Firma?</h3><p class="pd-muted">Mit einem Firmenkonto siehst du Nettopreise, bekommst Rechnungen mit Firmenname und UID und sammelst Rabatt im Bonusprogramm ' + (S.bonus && S.bonus.tiers && S.bonus.tiers.length ? "(bis zu " + S.bonus.tiers[S.bonus.tiers.length - 1].pct + " %)" : "") + '.</p><button type="button" class="ps-btn small" data-act="atab:settings">In den Einstellungen umstellen</button></section>';
      if (!me.newsletter) h += '<section class="ps-panel ps-acct-up"><h3>Druck-Tipps jeden Montag</h3><p class="pd-muted">Unser Newsletter bringt dir jede Woche Produkttipps und einen Designer-Tipp – und einmal im Monat einen 5-%-Code.</p><button type="button" class="ps-btn small" data-act="atab:settings">Newsletter aktivieren</button></section>';
      h += "</div></div>" + bonusHtml();
    } else if (tab === "orders") {
      h += '<section class="ps-panel"><h3>Meine Bestellungen</h3>' + (S.orders.length ? '<ul class="ps-olist ps-olist2">' + S.orders.map(orderRow).join("") + '</ul><p class="pd-muted" style="font-size:13px;margin-top:12px">„Nochmal bestellen“ legt die Bestellung mit derselben Druckdatei in den Warenkorb – der Preis wird dabei aktuell berechnet, Menge und Ausführung kannst du dort noch ändern.</p>' : '<p class="pd-muted">Noch keine Bestellungen.</p>') + "</section>";
    } else if (tab === "saved") {
      var sv = me.saved || [];
      h += '<section class="ps-panel"><h3>Merkliste</h3>' + (sv.length ? '<div class="ps-savs">' + sv.map(savedCard).join("") + '</div><p class="pd-muted" style="font-size:13px;margin-top:12px">Gemerkte Konfigurationen öffnen sich mit allen Optionen – der Preis wird dabei aktuell berechnet. Über „Teilen“ schickst du den Link z. B. an Kollegen zur Freigabe.</p>'
        : '<p class="pd-muted">Noch nichts gemerkt. In jedem Produkt findest du oben „Merken“ und „Teilen“ – damit speicherst du die gewählte Ausführung oder schickst sie als Link weiter.</p>') + "</section>";
    } else if (tab === "drafts") {
      var dr = me.drafts || [];
      h += '<section class="ps-panel"><h3>Gespeicherte Entwürfe</h3>' + (dr.length ? '<div class="ps-drafts">' + dr.map(function (d) {
        return '<div class="ps-draft"><a class="pv" href="/print?entwurf=' + encodeURIComponent(d.id) + "&t=" + encodeURIComponent(d.t) + '">' + (d.preview ? '<img src="' + esc(d.preview) + '" alt="">' : '<span aria-hidden="true">✎</span>') + '</a><b>' + esc(d.title) + '</b><span class="pd-muted">gespeichert am ' + esc(new Date(d.at).toLocaleDateString("de-AT")) + " · noch " + Math.max(1, 60 - Math.floor((Date.now() - Date.parse(d.at)) / 864e5)) + ' Tage</span><div class="btn-row"><a class="ps-btn primary small" href="/print?entwurf=' + encodeURIComponent(d.id) + "&t=" + encodeURIComponent(d.t) + '">Weiter gestalten</a><button type="button" class="ps-link" data-act="draftdel:' + esc(d.id) + '">Entfernen</button></div></div>'; }).join("") + "</div>"
        : '<p class="pd-muted">Noch keine Entwürfe. Im Online-Designer findest du „Entwurf speichern“ – solange du angemeldet bist, landet der Entwurf hier und du kannst später (auch auf einem anderen Gerät) weitergestalten. Entwürfe bleiben 60 Tage gespeichert.</p>') + "</section>";
    } else if (tab === "address") {
      h += '<section class="ps-panel ps-acct-narrow"><h3>Rechnungs- &amp; Lieferadresse</h3><p class="pd-muted" style="margin-top:-4px">Wird an der Kasse automatisch eingesetzt.</p><form class="ps-form" data-acct-form="profile" novalidate>' +
        (co ? '<p class="ps-acct-hint">Firma: <b>' + esc(me.company || "–") + "</b>" + (me.uid ? " · UID " + esc(me.uid) : "") + ' – Firmendaten änderst du in den <button type="button" class="ps-link" data-act="atab:settings">Einstellungen</button>.</p>' : "") +
        '<div class="ps-row2">' + acctField("firstName", "Vorname", "text", me.firstName, "given-name") + acctField("lastName", "Nachname", "text", me.lastName, "family-name") + "</div>" +
        acctField("street", "Straße und Hausnummer", "text", me.street, "street-address") + '<div class="ps-row2 ps-zip">' + acctField("zip", "PLZ", "text", me.zip, "postal-code") + acctField("city", "Ort", "text", me.city, "address-level2") + "</div>" +
        acctField("phone", "Telefon (für den Paketdienst)", "tel", me.phone, "tel") + fm("profile") + '<button type="submit" class="ps-btn primary">Adresse speichern</button></form></section>';
    } else {
      var tf = A.typeOpen;
      h += '<div class="ps-acct-set">';
      h += '<section class="ps-panel"><h3>Kontotyp</h3><p class="ps-acct-cur"><span class="ps-acct-type ' + (co ? "co" : "pr") + '">' + (co ? "Firmenkonto" : "Privatkonto") + "</span>" + (me.typeAt ? ' <span class="pd-muted">seit ' + esc(new Date(me.typeAt).toLocaleDateString("de-AT")) + "</span>" : "") + "</p>";
      if (!co && !tf) h += '<p class="pd-muted">Preise siehst du inkl. 20 % USt. Bestellst du für ein Unternehmen, stell auf ein Firmenkonto um: Nettopreise in der Anzeige, Rechnung mit Firmenname und UID (immer mit ausgewiesener USt – die holst du dir über den Vorsteuerabzug zurück) und Rabatt im Bonusprogramm.</p><button type="button" class="ps-btn" data-act="actype:open">Auf Firmenkonto umstellen …</button>';
      if (!co && tf) h += '<form class="ps-form ps-typeform" data-acct-form="type" novalidate><input type="hidden" name="type" value="company"><p class="pd-muted">Bitte die Firmendaten angeben – sie stehen dann auf deinen Rechnungen.</p>' +
        acctField("company", "Firmenname *", "text", me.company, "organization") + acctField("uid", "UID-Nummer (empfohlen, z. B. ATU12345678)", "text", me.uid) +
        '<label class="ps-cb"><input type="checkbox" name="confirm"><span>Ich bestelle mit diesem Konto für ein Unternehmen. Preise werden netto angezeigt, die Rechnung weist immer 20 % USt aus.</span></label>' + fm("type") +
        '<div class="btn-row"><button type="submit" class="ps-btn primary">Auf Firmenkonto umstellen</button><button type="button" class="ps-btn" data-act="actype:close">Abbrechen</button></div></form>';
      if (co) h += '<form class="ps-form" data-acct-form="type" novalidate><input type="hidden" name="type" value="company"><input type="hidden" name="confirm" value="1">' +
        '<div class="ps-row2">' + acctField("company", "Firmenname", "text", me.company, "organization") + acctField("uid", "UID-Nummer", "text", me.uid) + "</div>" +
        (me.uid ? '<p class="pd-muted" style="font-size:13px;margin:-4px 0 10px">' + (me.uidValid === true ? "✓ UID laut EU-Prüfung (VIES) gültig" : me.uidValid === false ? "UID konnte zuletzt nicht bestätigt werden (VIES nicht erreichbar) – wir prüfen bei der Bestellung erneut." : "") + "</p>" : "") + fm("type") +
        '<button type="submit" class="ps-btn primary">Firmendaten speichern</button></form>' +
        '<details class="ps-del"><summary>Zurück auf Privatkonto umstellen</summary><form class="ps-form" data-acct-form="typeprivate" novalidate><p class="pd-muted">Preise werden dann inkl. USt angezeigt, das Bonusprogramm gilt nur für Firmenkonten. Deine Firmendaten bleiben gespeichert, falls du wieder umstellst.</p><label class="ps-cb"><input type="checkbox" name="confirm"><span>Ja, auf Privatkonto umstellen</span></label>' + fm("typeprivate") + '<button type="submit" class="ps-btn">Umstellen</button></form></details>';
      h += "</section>";
      h += '<section class="ps-panel"><h3>E-Mail-Adresse</h3>' + (me.pendingEmail ? '<p class="pd-muted">Wir haben einen Code an <b>' + esc(me.pendingEmail) + '</b> geschickt (15 Minuten gültig).</p><form class="ps-form" data-acct-form="emailverify" novalidate><div class="ps-field"><label for="ac_ecode">Code</label><input id="ac_ecode" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="ps-code"></div>' + fm("emailverify") + '<div class="btn-row"><button type="submit" class="ps-btn primary">Neue Adresse bestätigen</button><button type="button" class="ps-link" data-act="emailcancel">Abbrechen</button></div></form>'
        : '<p class="pd-muted">Aktuell: <b>' + esc(me.email) + '</b></p><details class="ps-del"><summary>E-Mail-Adresse ändern</summary><form class="ps-form" data-acct-form="email" novalidate>' + acctField("newEmail", "Neue E-Mail-Adresse", "email", "", "email") + acctField("password", "Passwort zur Bestätigung", "password", "", "current-password") + fm("email") + '<button type="submit" class="ps-btn">Code an neue Adresse senden</button></form></details>') + "</section>";
      h += '<section class="ps-panel"><h3>Newsletter</h3><form class="ps-form" data-acct-form="newsletter" novalidate><label class="ps-cb"><input type="checkbox" name="newsletter"' + (me.newsletter ? " checked" : "") + '><span>Jeden Montag Druck-Tipps und ein Designer-Tipp, einmal im Monat ein 5-%-Code per E-Mail (jederzeit abbestellbar)</span></label>' + fm("newsletter") + '<button type="submit" class="ps-btn small">Speichern</button></form></section>';
      h += '<section class="ps-panel"><h3>Passwort ändern</h3><form class="ps-form" data-acct-form="password" novalidate>' + acctField("current", "Aktuelles Passwort", "password", "", "current-password") + acctField("password", "Neues Passwort (mind. 8 Zeichen)", "password", "", "new-password") + fm("password") + '<button type="submit" class="ps-btn">Passwort ändern</button></form></section>';
      h += '<section class="ps-panel"><h3>Datenschutz</h3><p class="pd-muted">Lade alle Daten herunter, die wir zu deinem Konto speichern (Profil, Warenkorb, Entwürfe, Bestellübersicht).</p><a class="ps-btn small" href="/print/api/account/export" download>Meine Daten herunterladen</a>' +
        '<details class="ps-del"><summary>Konto löschen</summary><form class="ps-form" data-acct-form="delete" novalidate><p class="pd-muted">Dein Konto wird gelöscht. Bestellungen bewahren wir aus steuerlichen Gründen auf.</p>' + acctField("password", "Passwort zur Bestätigung", "password", "", "current-password") + fm("delete") + '<button type="submit" class="ps-btn">Konto endgültig löschen</button></form></details></section>';
      h += "</div>";
    }
    return h + "</div>";
  }
  function bonusHtml() {
    var b = S.bonus, me = S.me; if (!b) return "";
    var tiers = '<div class="ps-tiers">' + b.tiers.map(function (t) { return '<div class="ps-tier ' + t.key + (b.tier === t.key ? " cur" : "") + '"><span class="medal" aria-hidden="true"></span><h3>' + esc(t.name) + '</h3><p class="pct">' + t.pct + " %</p><p>ab " + eur(t.from).replace(",00", "") + "</p></div>"; }).join("") + "</div>";
    if (me.type !== "company") return "";   // Privatkunden: Bonusprogramm (nur Firmen) nicht anzeigen
    var top = b.tiers[b.tiers.length - 1], pct = Math.min(100, Math.round(b.revenue / top.from * 100));
    return '<section class="ps-panel ps-bonus-acc"><h3>Bonusprogramm</h3>' +
      '<div class="ps-bstat"><div><span class="pd-muted">Deine Stufe</span><b class="lvl ' + esc(b.tier || "none") + '">' + (b.name ? esc(b.name) + " · " + b.pct + " % Rabatt" : "noch keine Stufe") + '</b></div><div><span class="pd-muted">Umsatz ' + b.year + ' (netto)</span><b>' + eur(b.revenue) + "</b></div></div>" +
      '<div class="ps-bbar" role="progressbar" aria-valuemin="0" aria-valuemax="' + top.from + '" aria-valuenow="' + b.revenue + '"><i style="width:' + pct + '%"></i>' + b.tiers.map(function (t) { return '<span style="left:' + (t.from / top.from * 100) + '%" title="' + esc(t.name) + '"></span>'; }).join("") + "</div>" +
      '<p class="ps-bnext">' + (b.next ? "Noch <b>" + eur(b.next.missing) + "</b> bis <b>" + esc(b.next.name) + "</b> (" + b.next.pct + " % auf alles)." : "Höchste Stufe erreicht – danke für dein Vertrauen!") + "</p>" + tiers +
      '<p class="pd-muted" style="font-size:13px">Der Rabatt wird automatisch abgezogen, wenn du angemeldet als Firma bestellst. Zählt: Umsatz im Kalenderjahr. Am 31.12. sinkt die Stufe um zwei' + (b.resetTo !== undefined && b.name ? " (bei dir auf " + (b.resetTo || "keine Stufe") + ")" : "") + ' – mit neuem Umsatz steigst du wieder auf.</p></section>';
  }
  function acctDo(act, form) {
    var A = S.acct, v = {}; if (form) Array.prototype.forEach.call(form.elements, function (el) { if (el.name) v[el.name] = el.type === "checkbox" ? el.checked : el.value.trim(); });
    if (v.email) A.email = v.email.toLowerCase();
    var EP = { type: "type", typeprivate: "type", emailverify: "email-verify", newsletter: "profile" }, body = { email: A.email }, url = "/print/api/account/" + (EP[act] || act);
    if (act === "login") body.password = v.password;
    else if (act === "register") Object.assign(body, { password: v.password, firstName: v.firstName, lastName: v.lastName, newsletter: !!v.newsletter });
    else if (act === "verify") body.code = v.code;
    else if (act === "reset") Object.assign(body, { code: v.code, password: v.password });
    else if (act === "profile") body = v;
    else if (act === "type") body = { type: "company", company: v.company, uid: v.uid, confirm: v.confirm === true || v.confirm === "1" };
    else if (act === "typeprivate") body = { type: "private", confirm: v.confirm === true };
    else if (act === "email") body = { newEmail: v.newEmail, password: v.password };
    else if (act === "emailverify") body = { code: v.code };
    else if (act === "newsletter") body = { newsletter: !!v.newsletter };
    else if (act === "password") body = { current: v.current, password: v.password };
    else if (act === "delete") body = { password: v.password };
    A.busy = true; A.err = ""; A.msg = ""; A.form = act; render();
    api(url, body).then(function (j) {
      A.busy = false;
      if (!j.ok) { A.err = j.error || "Das hat nicht geklappt."; render(); return; }
      if (j.needCode) { A.mode = "code"; A.msg = j.info || ""; render(); return; }
      if (act === "forgot") { A.mode = "reset"; A.msg = "Falls ein Konto existiert, ist der Code unterwegs."; render(); return; }
      if (act === "delete") { S.me = null; S.orders = []; A.mode = "login"; A.msg = "Dein Konto wurde gelöscht."; headUpdate(); render(); return; }
      if (/^(profile|type|typeprivate)$/.test(act) && S.prod) loadPrice();
      if (/^(type|typeprivate|email|emailverify|newsletter)$/.test(act)) { S.me = j.customer; if (j.bonus) S.bonus = j.bonus; A.typeOpen = false;
        if (act === "type" || act === "typeprivate") { S.ctype = S.me.type; S.uid = S.me.uid || ""; S.customer.company = S.me.company || S.customer.company; }
        if (act === "emailverify") { A.email = S.customer.email = S.me.email; }
        A.msg = { type: S.me.type === "company" && act === "type" ? "Firmenkonto aktiv – Preise werden jetzt netto angezeigt." : "Gespeichert.", typeprivate: "Auf Privatkonto umgestellt.", email: "Code an " + S.me.pendingEmail + " geschickt.", emailverify: "E-Mail-Adresse geändert.", newsletter: S.me.newsletter ? "Newsletter aktiviert – die Bestätigung kommt per E-Mail." : "Newsletter abbestellt." }[act];
        render(); return; }
      if (act === "profile") { S.me = j.customer; S.bonus = j.bonus || S.bonus; A.msg = "Gespeichert."; ["company", "firstName", "lastName", "phone", "street", "zip", "city"].forEach(function (k) { S.customer[k] = S.me[k] || S.customer[k]; }); S.ctype = S.me.type; if (S.me.uid) S.uid = S.me.uid; render(); return; }
      if (act === "password") { A.msg = "Passwort geändert."; render(); return; }
      if (j.customer) { try { localStorage.removeItem("fsc-print-verify"); } catch (e) {} if (act === "verify" && !S.view && /bestellung=/.test(location.search)) { applyMe(j); toast("Willkommen – dein Konto ist bestätigt!"); S.view = "konto"; history.replaceState(null, "", "/print?konto"); render(); return; } applyMe(j); A.msg = ""; A.err = ""; toast(act === "verify" ? "Willkommen – dein Konto ist bestätigt!" : "Angemeldet"); render(); }
    }).catch(function () { A.busy = false; A.err = "Keine Verbindung – bitte erneut versuchen."; render(); });
  }
  root.addEventListener("submit", function (e) { var f = e.target.closest("[data-acct-form]"); if (!f) return; e.preventDefault(); acctDo(f.getAttribute("data-acct-form"), f); });

  // ── Mehrere Motive (Sortenmix): Anzahl + Stückzahl je Motiv in „Ausführung“, je Motiv eine Datei/Gestaltung in „Gestalten“ ──
  S.mot = { n: 1, split: [], files: [], i: 0 };
  var motOk = function () { return !!S.prod && kind() === "flat" && !isLogo() && !(S.prod.custom && kind() === "banner"); };
  function motBalance() { var n = S.mot.n, c = +S.copies || 0, b = Math.floor(c / n), r = c - b * n; S.mot.split = []; for (var i = 0; i < n; i++) S.mot.split.push(b + (i < r ? 1 : 0)); }
  function motReset(keepN) { var n = keepN ? S.mot.n : 1; S.mot = { n: n, split: [], files: [], i: 0 }; motBalance(); }
  function motSum() { return S.mot.split.reduce(function (a, b) { return a + (+b || 0); }, 0); }
  function motSave() { if (S.mot.n > 1) S.mot.files[S.mot.i] = { file: S.file, previews: S.previews, design: S.design, mode: S.mode }; }
  function motLoad(i) { motSave(); S.mot.i = i; var f = S.mot.files[i] || {}; S.file = f.file || null; S.previews = f.previews || null; S.design = f.design || null; S.mode = f.mode || ""; }
  function motHtml() {
    if (!motOk()) return "";
    var n = S.mot.n, sum = motSum(), ok = sum === +S.copies;
    var segs = [1, 2, 3, 4, 5].map(function (k) { return '<button type="button" class="ps-mn' + (n === k ? " on" : "") + '" data-motn="' + k + '" aria-pressed="' + (n === k) + '">' + k + "</button>"; }).join("") + '<button type="button" class="ps-mn' + (n > 5 ? " on" : "") + '" data-motn="' + (n > 5 ? n : 6) + '">' + (n > 5 ? n : "6+") + "</button>";
    var rows = n > 1 ? '<div class="ps-msplit">' + S.mot.split.map(function (v, i) { return '<label class="ps-ms"><span>Motiv ' + (i + 1) + '</span><input type="number" inputmode="numeric" min="1" data-mots="' + i + '" value="' + v + '"><small>Stk.</small></label>'; }).join("") +
      '<p class="ps-msum ' + (ok ? "ok" : "bad") + '">Summe: <b>' + sum.toLocaleString("de-AT") + "</b> von " + (+S.copies).toLocaleString("de-AT") + " Stk." + (ok ? " ✓" : " – bitte anpassen") + ' <button type="button" class="ps-link" data-motbal="1">gleichmäßig aufteilen</button></p></div>' : "";
    return '<div class="ps-tile wide ps-mot"><span class="ps-tl">Anzahl Motive <span class="pd-muted">· verschiedene Designs in einer Auflage, ohne Aufpreis</span></span><div class="ps-mns" role="group" aria-label="Anzahl Motive">' + segs + "</div>" + rows +
      (n > 1 ? '<p class="ps-help">Im nächsten Schritt lädst bzw. gestaltest du jedes Motiv einzeln – jeweils mit Vorder- und Rückseite.</p>' : "") + "</div>";
  }

  // Verständliche Namen + Erklärungen für Fachbegriffe aus dem Print.com-Katalog
  var LBL = {
    creasing: { t: "Rillen (sauberer Falz)", force: true, o: { yes: "Ja, rillen", no: "Nein" }, d: { yes: "Vor dem Falzen wird eine feine Rille eingeprägt – so bricht das Papier nicht und der Falz wird sauber. Empfohlen ab 170 g/m².", no: "Ohne Rille – bei dünnem Papier (bis ca. 150 g/m²) völlig ausreichend." } },
    custom_shape: { t: "Schnitt", o: { clean_cut: "Gerade geschnitten (Rechteck)", custom_shape_die_cut: "Konturgeschnitten – einzeln", custom_shape_kiss_cut: "Konturgeschnitten – auf dem Bogen" }, d: { clean_cut: "Die Aufkleber werden rechteckig zugeschnitten.", custom_shape_die_cut: "Jeder Aufkleber wird entlang deiner Form komplett ausgeschnitten und einzeln geliefert.", custom_shape_kiss_cut: "Nur der Aufkleber wird entlang der Form angeschnitten, das Trägerpapier bleibt ganz – ideal zum einfachen Abziehen, mehrere auf einem Bogen." } },
    plano_delivery: { t: "Ungefalzt liefern", o: { no: "Nein, gefalzt", yes: "Ja, flach (plano)" }, d: { yes: "Die Drucksachen kommen flach und ungefalzt – z. B. wenn du selbst falzen möchtest.", no: "Fertig gefalzt geliefert." } },
    slitting: { t: "Rückenschlitz", d: { no_slit: "Trägerpapier ohne Schlitz.", slit_center: "Ein Schlitz in der Mitte des Trägerpapiers – Aufkleber lässt sich leichter abziehen." } },
    loop_stitches: { t: "Ringösen (zum Abheften)" },
    customer_packing_option: { t: "Verpackung" },
    perforation: { t: "Perforation (Abreißlinie)" },
    type_glue: { t: "Klebstoff", d: { permanent: "Hält dauerhaft.", detachable: "Lässt sich rückstandsfrei wieder ablösen." } },
    shape: { t: "Form" }
  };
  function fixLabels(list) { (list || []).forEach(function (p) { (p.props || []).forEach(function (pr) { var L = LBL[pr.slug]; if (!L) return; if (L.t) pr.title = L.t; pr.options.forEach(function (o) { if (L.o && L.o[o.slug]) o.name = L.o[o.slug]; if (L.d && L.d[o.slug] && (!o.desc || L.force)) o.desc = L.d[o.slug]; }); if (L.force) pr.desc = ""; }); }); }

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
    function goV(i) { if (i >= vars.length) return true; for (var k = 0; k < vars[i][1].length; k++) { if (++steps > 20000) return false; if (vars[i][1][k] === null) delete cur[vars[i][0]]; else cur[vars[i][0]] = vars[i][1][k]; if (!hitRules(cur, al) && goV(i + 1)) return true; } delete cur[vars[i][0]]; return false; }
    return goV(0) ? cur : null;
  }
  var OMITTABLE = /^(pallet_delivery|bundle|cross_bundle|packaging_extras|sheet_size|special_size)$/;   // wie Server: darf als letzter Ausweg fehlen
  function autoVars() { var au = S.prod.auto || {}; return Object.keys(au).map(function (k) { return [k, OMITTABLE.test(k) ? au[k].concat([null]) : au[k]]; }); }
  function baseOf(sel) { var p = S.prod, b = {}, au = p.auto || {}; Object.keys(p.fixed || {}).forEach(function (k) { if (!au[k]) b[k] = p.fixed[k]; }); if (kind() === "banner") b.size = "custom"; return Object.assign(b, sel); }
  function excluded(sel) { return !solve(autoVars(), baseOf(sel)); }
  function fixSel(changed) { // ausgeschlossene Kombination → die übrigen Optionen auf die nächste gültige Kombination setzen (aktuelle Werte zuerst probieren)
    var p = S.prod; if (!excluded(S.sel)) return;
    var keep = {}; if (changed) keep[changed] = S.sel[changed];
    var vars = p.props.filter(function (pr) { return pr.slug !== changed; }).map(function (pr) { var c = S.sel[pr.slug]; return [pr.slug, [c].concat(pr.options.map(function (o) { return o.slug; }).filter(function (x) { return x !== c; }))]; });
    var r = solve(vars.concat(autoVars()), baseOf(keep)); if (!r) return;
    p.props.forEach(function (pr) { if (r[pr.slug] != null) S.sel[pr.slug] = r[pr.slug]; });
  }
  // Wie fixSel, aber ohne S.sel zu ändern: welche anderen Optionen müssten sich ändern, damit `slug=val` geht? (null = gar nicht möglich)
  function resolveWith(slug, val) {
    var p = S.prod, t = Object.assign({}, S.sel); t[slug] = val; if (!excluded(t)) return {};
    var keep = {}; keep[slug] = val;
    var vars = p.props.filter(function (pr) { return pr.slug !== slug; }).map(function (pr) { var c = S.sel[pr.slug]; return [pr.slug, [c].concat(pr.options.map(function (o) { return o.slug; }).filter(function (x) { return x !== c; }))]; });
    var r = solve(vars.concat(autoVars()), baseOf(keep)); if (!r) return null;
    var ch = {}; p.props.forEach(function (pr) { if (pr.slug !== slug && r[pr.slug] != null && r[pr.slug] !== S.sel[pr.slug]) ch[pr.slug] = r[pr.slug]; }); return ch;
  }
  function optName(slug, val) { var pr = S.prod.props.filter(function (x) { return x.slug === slug; })[0], o = pr && pr.options.filter(function (x) { return x.slug === val; })[0]; return o ? o.name : val; }
  function propTitle(slug) { var pr = S.prod.props.filter(function (x) { return x.slug === slug; })[0]; return pr ? pr.title : slug; }
  function changesText(ch) { return Object.keys(ch).map(function (k) { return propTitle(k) + " → " + optName(k, ch[k]); }).join(" · "); }
  // Eigene Auswahlliste: Bestseller oben, Gruppen, Suche ab 10 Einträgen, ⓘ je Option, nicht passende Optionen mit „passt mit …“ statt ausgegraut
  // Auswahl je nach Anzahl der Optionen: ≤ 4 direkt als Schaltflächen, ≤ 12 kompakte Liste, mehr = großer Auswahl-Dialog (Kategorien links, Optionen rechts, Suche)
  // ── Aufpreise neben den Optionen („+ 4,20 €“): vom Server (/print/api/deltas), nur für gerade sichtbare Optionen, zwischengespeichert ──
  var DLT = {}, DLQ = {}, DLR = {}, DLW = {}, dlT = 0, dlRun = 0, dlJobs = [];
  function dlBase() { return S.prod && S.price && !S.priceBusy && S.step === 2 ? JSON.stringify([cfgOf(), S.price.pm || "", S.ctype, S.customer.country || S.country, S.customer.zip || "", S.voucher || ""]) : ""; }
  // slug „@u“ = Produktionszeit (Standard/Schnell/Express): zusätzlich der Liefertermin
  function dShort(iso) { var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("de-AT", { weekday: "short", day: "numeric", month: "short" }) : ""; }
  function dlTxt(slug, val) {
    var b = dlBase(); if (!b) return S.priceBusy && S.step === 2 ? '<span class="ps-dl l" aria-label="Aufpreis wird berechnet"><i class="ps-spin"></i></span>' : "";
    var k = b + "|" + slug + "|" + val, d = DLT[k], u = slug === "@u", cur = u && val === S.urgency;
    if (d === undefined && !cur) return '<span class="ps-dl l" aria-label="Aufpreis wird berechnet"><i class="ps-spin"></i></span>';   // lädt (bzw. gleich) – Ladesymbol
    var dt = u ? (cur ? S.price && S.price.deliveryDate : d && d.date) : "", dh = dt ? '<span class="ps-dl d">' + esc(dShort(dt)) + "</span>" : "";
    if (cur || !d) return dh;
    var v = S.ctype === "company" ? d.net : d.gross, ph = Math.abs(v) < 0.05 ? (u ? "" : '<span class="ps-dl z">± 0 €</span>') : '<span class="ps-dl' + (v < 0 ? " m" : "") + '">' + (v > 0 ? "+ " : "− ") + eur(Math.abs(v)) + "</span>";
    return dh + (dh && ph ? " " : "") + ph;
  }
  function dlSpan(key, x) { if (x.off) return ""; var sl = key === "urgency" ? "@u" : key.indexOf("prop:") === 0 ? key.slice(5) : ""; if (!sl) return ""; return '<span class="ps-dlw" data-dl="' + esc(sl + "|" + x.val) + '">' + dlTxt(sl, x.val) + "</span>"; }
  function dlPaint() { [].forEach.call(root.querySelectorAll("[data-dl]"), function (el) { var v = el.getAttribute("data-dl"), i = v.indexOf("|"), h = dlTxt(v.slice(0, i), v.slice(i + 1)); if (el.innerHTML !== h) el.innerHTML = h; }); }
  function dlKick() { clearTimeout(dlT); dlT = setTimeout(dlLoad, 250); }
  if (root) root.addEventListener("toggle", function () { if (S.step === 2) dlKick(); }, true);   // aufgeklappte „Weitere Optionen“: deren Aufpreise laden
  function dlLoad() {
    var b = dlBase(); if (!b) return; var want = {};
    [].forEach.call(root.querySelectorAll("[data-dl]"), function (el) { if (!el.parentNode.getClientRects().length) return;   // nur Sichtbares (nicht in eingeklappten Bereichen; der leere Platzhalter selbst ist unsichtbar)
      var v = el.getAttribute("data-dl"), i = v.indexOf("|"), slug = v.slice(0, i), val = v.slice(i + 1), k = b + "|" + slug + "|" + val;
      if (k in DLT || DLQ[k] || (DLW[k] && Date.now() < DLW[k]) || (slug === "@u" ? val === S.urgency : String(S.sel[slug]) === val)) return; (want[slug] = want[slug] || []).push(val); });
    if (kind() !== "textile" && S.prod.urgency.length > 1) S.prod.urgency.forEach(function (u) { var k = b + "|@u|" + u.slug; if (u.slug === S.urgency || k in DLT || DLQ[k] || (DLW[k] && Date.now() < DLW[k])) return; var l = want["@u"] = want["@u"] || []; if (l.indexOf(u.slug) < 0) l.push(u.slug); });   // Liefertermine immer (auch ausgeblendete Stufen)
    Object.keys(want).forEach(function (slug) { var alts = [];
      want[slug].slice(0, 12).forEach(function (val) { var k = b + "|" + slug + "|" + val;
        if (slug === "@u") { DLQ[k] = 1; alts.push({ k: val, sel: Object.assign({}, S.sel), urgency: val }); return; }
        var ch = resolveWith(slug, val); if (ch === null) { DLT[k] = false; return; }
        var sel = Object.assign({}, S.sel, ch); sel[slug] = val; DLQ[k] = 1; alts.push({ k: val, sel: sel }); });
      if (alts.length) dlJobs.push({ b: b, slug: slug, alts: alts, cfg: Object.assign(cfgOf(), { pm: S.price.pm || S.pm || "auto", country: S.customer.country || S.country, zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "", voucher: S.voucher || "" }) }); });
    dlNext(); dlNext(); dlNext();
  }
  function dlNext() {
    if (dlRun >= 3 || !dlJobs.length) return; var j = dlJobs.shift(); if (j.b !== dlBase()) { j.alts.forEach(function (a) { delete DLQ[j.b + "|" + j.slug + "|" + a.k]; }); dlNext(); return; }   // Auswahl hat sich inzwischen geändert
    dlRun++;
    api("/print/api/deltas", Object.assign({}, j.cfg, { alts: j.alts })).then(function (r) {
      var later = false;
      j.alts.forEach(function (a) { var k = j.b + "|" + j.slug + "|" + a.k, x = r && r.ok && r.d ? r.d[a.k] : null; delete DLQ[k];
        if ((r && r.busy && !x) || (x && x.busy)) { DLR[k] = (DLR[k] || 0) + 1; if (DLR[k] < 5) { later = true; DLW[k] = Date.now() + 2500; return; } }   // Andrang beim Server: später nochmal (max. 5×)
        DLT[k] = x && !x.off && !x.busy && isFinite(x.net) ? x : false; });
      dlPaint(); if (j.slug === "@u") urRefresh(); if (later) setTimeout(dlKick, 2500 + Math.random() * 2000);
    }).catch(function () { j.alts.forEach(function (a) { var k = j.b + "|" + j.slug + "|" + a.k; delete DLQ[k]; DLT[k] = false; }); dlPaint(); }).then(function () { dlRun--; dlNext(); if (!dlJobs.length && !dlRun) dlKick(); });   // danach: noch sichtbare, nicht geladene Optionen nachholen
  }
  function ddRow(key, x, cur, zi) {
    var sel = String(x.val) === String(cur);
    return '<div class="ps-ddo' + (zi % 2 ? " z" : "") + (sel ? " sel" : "") + (x.warn ? " warn" : "") + (x.off ? " off" : "") + '" role="option" aria-selected="' + sel + '" data-q="' + esc(String(x.name + " " + (x.group || "")).toLowerCase()) + '">' +
      '<button type="button" class="ps-ddp' + (imgOk(x.img) ? " hasim" : "") + '" data-ddpick="' + esc(key) + "|" + esc(x.val) + '"' + (x.off ? " disabled" : "") + '>' + (imgOk(x.img) ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : "") + '<span class="n">' + esc(x.name) + (x.best ? ' <em>★ Bestseller</em>' : "") + "</span>" +
      (x.warn ? '<span class="h">passt mit: ' + esc(x.warn) + "</span>" : x.off ? '<span class="h">mit dieser Auswahl nicht lieferbar</span>' : x.sub ? '<span class="h">' + esc(x.sub) + "</span>" : "") + "</button>" +
      (sel ? '<span class="ps-ddck" aria-hidden="true">✓</span>' : dlSpan(key, x)) +
      (x.desc || x.img ? '<button type="button" class="ps-i" data-ddinfo="' + esc(key) + "|" + esc(x.val) + '" aria-label="Infos zu ' + esc(x.name) + '" aria-haspopup="dialog">i</button>' : "") + "</div>";
  }
  function ddHtml(key, title, items, cur) {
    DDI[key] = items;
    var c = items.filter(function (x) { return String(x.val) === String(cur); })[0] || {}, open = S.dd === key;
    if (items.length <= 4 && key !== "copies") return '<div class="ps-segs n' + items.length + '" role="radiogroup" aria-label="' + esc(title) + '">' + items.map(function (x) { var sel = String(x.val) === String(cur);
      return '<div class="ps-sgo' + (sel ? " on" : "") + (x.off ? " off" : "") + (imgOk(x.img) ? " hasim" : "") + '"><button type="button" role="radio" aria-checked="' + sel + '" data-ddpick="' + esc(key) + "|" + esc(x.val) + '"' + (x.off ? " disabled" : "") + '>' + (imgOk(x.img) ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : "") + '<b>' + esc(x.name) + (x.best ? ' <em title="Bestseller">★</em>' : "") + "</b>" + (x.warn ? '<small title="' + esc("passt mit: " + x.warn) + '">ändert ' + esc(x.warn.split(" · ").map(function (c) { return c.split(" → ")[0]; }).join(", ")) + "</small>" : x.sub ? "<small>" + esc(x.sub) + "</small>" : "") + (sel && key !== "urgency" ? "" : dlSpan(key, x)) + "</button>" +
        (x.desc || x.img ? '<button type="button" class="ps-i sm" data-ddinfo="' + esc(key) + "|" + esc(x.val) + '" aria-label="Infos zu ' + esc(x.name) + '" aria-haspopup="dialog">i</button>' : "") + "</div>"; }).join("") + "</div>";
    var btn = '<button type="button" class="ps-dd" data-dd="' + esc(key) + '" aria-haspopup="listbox" aria-expanded="' + open + '" aria-label="' + esc(title) + ": " + esc(c.name || "") + '"><span class="v">' + esc(c.name || "Bitte wählen") + (c.best ? ' <em class="ps-ddbs">★</em>' : "") + '</span><i aria-hidden="true">▾</i></button>';
    if (!open) return btn;
    var best = items.filter(function (x) { return x.best; }), rest = items.filter(function (x) { return !x.best; });
    if (items.length <= 12 && items.some(function (x) { return x.fold; })) {
      var zf = 0, G = S.ddGrp[key] || {}, main = items.filter(function (x) { return !x.fold; }), folds = [];
      items.forEach(function (x) { if (x.fold && folds.indexOf(x.fold) < 0) folds.push(x.fold); });
      return btn + '<div class="ps-ddl" role="listbox" aria-label="' + esc(title) + '"><div class="ps-dds">' + main.map(function (x) { return ddRow(key, x, cur, zf++); }).join("") +
        folds.map(function (fn) { var l = items.filter(function (x) { return x.fold === fn; }), has = l.some(function (x) { return String(x.val) === String(cur); }), on = G._set ? !!G[fn] : has;
          return '<div class="ps-ddg ps-ddgf"><button type="button" class="ps-ddgt" data-ddgrp="' + esc(key) + "|" + esc(fn) + '" aria-expanded="' + on + '"><span>' + esc(fn) + "</span><small>" + l.length + "</small>" + (has && !on ? '<b class="ps-ddgc" aria-label="enthält deine Auswahl">●</b>' : "") + '<i aria-hidden="true">' + (on ? "▾" : "▸") + "</i></button></div>" +
            (on ? l.map(function (x) { return ddRow(key, x, cur, zf++); }).join("") : ""); }).join("") + "</div></div>"; }
    if (items.length <= 12) { var zi = 0; return btn + '<div class="ps-ddl" role="listbox" aria-label="' + esc(title) + '"><div class="ps-dds">' + best.concat(rest).map(function (x) { return ddRow(key, x, cur, zi++); }).join("") + "</div></div>"; }
    // großer Auswahl-Dialog
    var cats = []; if (best.length) cats.push({ n: "★ Bestseller", l: best });
    rest.forEach(function (x) { var g = x.group || "Weitere"; var G = cats.filter(function (y) { return y.n === g; })[0]; if (!G) { G = { n: g, l: [] }; cats.push(G); } G.l.push(x); });
    if (cats.length > 1) cats.push({ n: "Alle Optionen", l: items, all: true });
    var curCat = S.ddCat[key]; if (!cats.some(function (C) { return C.n === curCat; })) { var hc = cats.filter(function (C) { return !C.all && C.l.some(function (x) { return String(x.val) === String(cur); }); })[0]; curCat = (hc || cats[0]).n; }
    return btn + '<div class="ps-ddl big" role="dialog" aria-label="' + esc(title) + ' wählen"><div class="ps-big-h"><b>' + esc(title) + ' wählen</b><input type="search" class="ps-ddq" placeholder="' + esc(title) + ' suchen …" aria-label="' + esc(title) + ' durchsuchen" autocomplete="off"><button type="button" class="ps-big-x" data-dd="' + esc(key) + '" aria-label="Schließen">×</button></div>' +
      '<div class="ps-big-b"><nav class="ps-big-n" aria-label="Kategorien">' + cats.map(function (C) { var has = !C.all && C.l.some(function (x) { return String(x.val) === String(cur); });
        return '<button type="button" data-ddcat="' + esc(key) + "|" + esc(C.n) + '" aria-current="' + (C.n === curCat) + '"><span>' + esc(C.n) + "</span><small>" + C.l.length + "</small>" + (has ? '<i aria-label="enthält deine Auswahl">●</i>' : "") + "</button>"; }).join("") + "</nav>" +
      '<div class="ps-dds">' + cats.filter(function (C) { return !C.all; }).map(function (C) { var zi2 = 0; return '<div class="ps-ddgb" data-cat="' + esc(C.n) + '"' + (C.n === curCat || curCat === "Alle Optionen" ? "" : " hidden") + '><div class="ps-ddg">' + esc(C.n) + "</div>" + C.l.map(function (x) { return ddRow(key, x, cur, zi2++); }).join("") + "</div>"; }).join("") + "</div></div></div>";
  }

  // Info-Popup zu einer Option (Papier, Veredelung …): Bild, Beschreibung, „Diese Option wählen“
  var DDI = {};
  function infoItem(key, val) {
    var it = (DDI[key] || []).filter(function (x) { return String(x.val) === String(val); })[0];
    if (!it && key.indexOf("prop:") === 0 && S.prod) { var pr0 = S.prod.props.filter(function (x) { return x.slug === key.slice(5); })[0]; if (pr0) it = propItems(pr0).filter(function (x) { return String(x.val) === String(val); })[0]; }
    return it || null;
  }
  // Infos beim Drüberfahren (Maus): kleine Karte neben dem „i“ – Klick öffnet weiterhin das große Fenster (am Handy/Tablet der einzige Weg)
  var TIP = null, tipT = 0, HOVER = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function tipHide() { clearTimeout(tipT); if (TIP) { TIP.remove(); TIP = null; } }
  function tipShow(btn) {
    var iv = btn.getAttribute("data-ddinfo") || "", ii = iv.indexOf("|"), key = iv.slice(0, ii), val = iv.slice(ii + 1), it = infoItem(key, val); if (!it) return;
    var pr = key.indexOf("prop:") === 0 && S.prod ? S.prod.props.filter(function (x) { return x.slug === key.slice(5); })[0] : null;
    var d = txt(it.desc) || (pr ? glossOf(pr, { name: it.name, slug: val }) : ""), short = d.length > 420 ? d.slice(0, 400).replace(/\s+\S*$/, "") + " …" : d;
    tipHide(); TIP = document.createElement("div"); TIP.className = "ps-tip"; TIP.setAttribute("role", "tooltip");
    TIP.innerHTML = (imgOk(it.img) ? '<img src="' + esc(String(it.img).replace(/w=\d+/, "w=600")) + '" alt="">' : "") + '<div class="ps-tip-b"><span class="ps-pop-k">' + esc(pr ? pr.title : "Info") + "</span><b>" + esc(it.name) + "</b>" +
      (short ? "<p>" + esc(short) + "</p>" : "") + (it.warn ? '<p class="ps-pop-w">Passt mit: ' + esc(it.warn) + "</p>" : it.off ? '<p class="ps-pop-w">Mit der aktuellen Auswahl nicht lieferbar.</p>' : "") + "</div>";
    document.body.appendChild(TIP);
    var r = btn.getBoundingClientRect(), w = TIP.offsetWidth, h = TIP.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var x = r.left - w - 12 >= 8 ? r.left - w - 12 : Math.min(vw - w - 8, r.right + 12), y = Math.max(8, Math.min(vh - h - 8, r.top + r.height / 2 - 40));
    TIP.style.left = Math.round(x) + "px"; TIP.style.top = Math.round(y) + "px";
  }
  if (HOVER) {
    document.addEventListener("mouseover", function (e) { var b = e.target.closest && e.target.closest(".ps-i[data-ddinfo]"); if (!b) return; if (TIP && TIP.__b === b) return; clearTimeout(tipT); tipT = setTimeout(function () { tipShow(b); if (TIP) TIP.__b = b; }, 120); });
    document.addEventListener("mouseout", function (e) { var b = e.target.closest && e.target.closest(".ps-i[data-ddinfo]"); if (!b || (e.relatedTarget && b.contains(e.relatedTarget))) return; clearTimeout(tipT); tipT = setTimeout(tipHide, 80); });
    document.addEventListener("focusin", function (e) { var b = e.target.closest && e.target.closest(".ps-i[data-ddinfo]"); if (b && b.matches(":focus-visible")) { tipShow(b); if (TIP) TIP.__b = b; } });
    document.addEventListener("focusout", function (e) { if (e.target.closest && e.target.closest(".ps-i[data-ddinfo]")) tipHide(); });
    window.addEventListener("scroll", tipHide, true); document.addEventListener("keydown", function (e) { if (e.key === "Escape") tipHide(); });
  }
  function infoPop(key, val) {
    tipHide();
    var it = infoItem(key, val);
    if (!it) return;
    var pr = key.indexOf("prop:") === 0 && S.prod ? S.prod.props.filter(function (x) { return x.slug === key.slice(5); })[0] : null, isCur = pr ? S.sel[pr.slug] === val : false;
    var m = document.createElement("div"); m.className = "ps-pop"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", it.name);
    m.innerHTML = '<div class="ps-pop-c">' + (it.img ? '<img src="' + esc(String(it.img).replace(/w=\d+/, "w=900")) + '" alt="">' : "") + '<div class="ps-pop-b"><span class="ps-pop-k">' + esc(pr ? pr.title : "Info") + "</span><h3>" + esc(it.name) + (it.best ? ' <span class="ps-bb">★ Bestseller</span>' : "") + "</h3>" +
      "<p>" + esc(txt(it.desc) || "Zu dieser Option gibt es keine weiteren Infos.") + "</p>" + (it.warn ? '<p class="ps-pop-w">Passt mit: ' + esc(it.warn) + "</p>" : it.off ? '<p class="ps-pop-w">Mit der aktuellen Auswahl nicht lieferbar.</p>' : "") +
      '<div class="ps-pop-a">' + (pr && !isCur && !it.off ? '<button type="button" class="ps-btn primary" data-popsel="1">Diese Option wählen</button>' : isCur ? '<span class="ps-pop-ok">✓ Aktuell gewählt</span>' : "") + '<button type="button" class="ps-btn" data-popx="1">Schließen</button></div></div><button type="button" class="ps-pop-x" data-popx="1" aria-label="Schließen">×</button></div>';
    document.body.appendChild(m); var f = m.querySelector("[data-popsel]") || m.querySelector("[data-popx]"); if (f) f.focus();
    var close = function () { m.remove(); document.removeEventListener("keydown", esc0); };
    var esc0 = function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", esc0);
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-popx]")) { close(); return; }
      if (e.target.closest("[data-popsel]")) { close(); var b = document.createElement("button"); b.setAttribute("data-ddpick", key + "|" + val); b.style.display = "none"; root.appendChild(b); b.click(); b.remove(); } });
  }
  // „Deine Auswahl im Detail“: immer sichtbare Infos zu allen gewählten Optionen
  function selInfoHtml(p) {
    var rows = p.props.map(function (pr) { var o = pr.options.filter(function (x) { return x.slug === S.sel[pr.slug]; })[0]; if (!o || NONE_RX.test(String(o.name).trim())) return ""; var d = txt(o.desc) || glossOf(pr, o), im = imgOk(o.img) ? o.img : "";
      return '<div class="ps-si">' + (im ? '<img src="' + esc(im) + '" alt="" loading="lazy">' : '<span class="ps-si-ic" aria-hidden="true">✓</span>') + '<div><span class="ps-si-k">' + esc(pr.title) + "</span><b>" + esc(/color/.test(pr.slug) ? colName(o.name) : o.name) + "</b>" + (d ? "<p>" + esc(d.length > 220 ? d.slice(0, 217) + " …" : d) + "</p>" : "") +
        (d.length > 220 || im ? '<button type="button" class="ps-link" data-ddinfo="prop:' + esc(pr.slug) + "|" + esc(o.slug) + '">Mehr Infos</button>' : "") + "</div></div>"; }).filter(Boolean);
    return rows.length ? '<details class="ps-selinfo"' + (window.innerWidth > 760 ? " open" : "") + '><summary>Deine Auswahl im Detail</summary><div class="ps-si-grid">' + rows.join("") + "</div>" + tplBtn("soft") + "</details>" : "";
  }
  // Eigene Infotexte, wenn Print.com keine Beschreibung liefert (Papiere, Grammaturen, Veredelungen, Großformat-Materialien)
  var GLOSS = [
    [/bilderdruck.*gl(ä|a)nz|gloss/i, "Gestrichenes Bilderdruckpapier mit glänzender Oberfläche: Farben wirken brillant und kontrastreich, Fotos besonders lebendig. Der Klassiker für Flyer, Plakate und Prospekte."],
    [/bilderdruck.*matt|silk/i, "Gestrichenes Bilderdruckpapier, seidenmatt: edle, blendfreie Oberfläche, angenehme Haptik und gut beschreibbar. Ideal für Texte, Speisekarten und hochwertige Drucksachen."],
    [/recycl|öko|oeko|eco|graspapier|gras/i, "Umweltfreundliches Papier aus Recycling- bzw. alternativen Fasern: natürliche Optik und Haptik, Farben wirken etwas matter. Für nachhaltige Marken die richtige Wahl."],
    [/natur.?offset|offsetpapier|hvo|ungestrichen|unbeschichtet/i, "Ungestrichenes Naturpapier (Offsetpapier): saugfähig, griffig und sehr gut beschreibbar – wie gutes Briefpapier. Farben wirken etwas weicher."],
    [/invercote|sulfatkarton|multicard|kingboard|sbs|sbd/i, "Hochwertiger, sehr steifer Sulfatkarton mit glatter, heller Oberfläche – formstabil und edel, beliebt für Karten, Verpackungen und Premium-Visitenkarten."],
    [/kraft/i, "Naturbraunes Kraftpapier: rustikal, robust und ehrlich – perfekt für handgemachte, nachhaltige oder regionale Marken."],
    [/linnen|leinen/i, "Papier mit feiner Leinenstruktur: fühlbar edel, klassisch-elegant – ideal für Visitenkarten und Einladungen."],
    [/metallic|perl|pearl/i, "Papier mit schimmernder Metallic- bzw. Perlmutt-Oberfläche: wirkt luxuriös und fällt sofort auf."],
    [/yupo|synthet|reißfest|reissfest|wasserfest|pvc.?frei/i, "Synthetisches, reiß- und wasserfestes Material: hält Regen, Fett und Knicke aus – für Outdoor, Gastronomie und Speisekarten."],
    [/bio top|biotop/i, "Bio Top 3®: ungestrichenes, naturweißes Premium-Papier aus nachhaltiger Forstwirtschaft, sehr angenehme Haptik."],
    [/munken|felt|tintoretto|gesso|sirio|curious|premium/i, "Premium-Feinstpapier mit besonderer Struktur bzw. Farbe – für Drucksachen, die man gern in der Hand hält."],
    [/blueback/i, "Plakatpapier mit blauer Rückseite: blickdicht, damit beim Kleben auf alte Plakate nichts durchscheint – der Standard für Außenplakate."],
    [/frontlit|pvc/i, "Robuste PVC-Plane (Frontlit) für Banner im Außenbereich: wetterfest, UV-beständig und reißfest."],
    [/mesh/i, "Gitterplane (Mesh): winddurchlässig dank feiner Löcher – ideal für Gerüste, Bauzäune und windige Standorte."],
    [/cellophan|lamination|kaschier/i, "Cellophanierung: hauchdünne Folie auf der Oberfläche – schützt vor Kratzern, Feuchtigkeit und Knicken und wertet die Optik auf (glänzend = brillant, matt = edel)."],
    [/soft.?touch/i, "Soft-Touch-Folie: samtig-weiche, fast pfirsichhautartige Oberfläche – fühlt sich besonders hochwertig an."],
    [/kratz|scratch/i, "Kratzfeste Folie: besonders widerstandsfähige Oberfläche für Drucksachen, die oft in die Hand genommen werden."],
    [/uv.?lack|spot/i, "UV-Lack: glänzender Lack (vollflächig oder partiell) für einen edlen Effekt und zusätzlichen Schutz."],
    [/^(geen|keine?|ohne|none)\b/i, "Ohne Veredelung – die günstigste Variante; der Druck liegt direkt auf dem Papier."]
  ];
  function glossOf(pr, o) {
    var n = String(o.name || "") + " " + o.slug, d = "", g = n.match(/(\d{2,4})\s*g/);
    for (var i = 0; i < GLOSS.length; i++) if (GLOSS[i][0].test(n)) { d = GLOSS[i][1]; break; }
    if (g && pr.slug === "material") { var w = +g[1]; d = (d ? d + " " : "") + (w <= 100 ? "Mit " + w + " g/m² leicht und dünn – gut für große Auflagen, Beilagen und Handzettel." : w <= 150 ? "Mit " + w + " g/m² die klassische Flyer-Stärke: stabil genug, angenehm in der Hand." : w <= 200 ? "Mit " + w + " g/m² spürbar fester – wirkt hochwertiger, ideal für Plakate und edlere Flyer." : w <= 300 ? "Mit " + w + " g/m² ein leichter Karton – für Postkarten, Umschläge und Karten." : "Mit " + w + " g/m² ein fester Karton – typisch für Visitenkarten und hochwertige Karten."); }
    return d;
  }
  function propItems(pr) {
    var gname = function (o) { var g = (pr.groups || []).filter(function (x) { return x.slug === o.parent; })[0]; return g ? g.name : ""; }, open = S.dd === "prop:" + pr.slug || pr.options.length <= 4;
    var items = optsOf(pr).map(function (o) { var it = { val: o.slug, name: o.name, best: isBest(pr, o.slug), desc: txt(o.desc) || glossOf(pr, o), img: imgOk(o.img) ? o.img : "", group: gname(o) };
      if (open && o.slug !== S.sel[pr.slug]) { var ch = resolveWith(pr.slug, o.slug); if (ch === null) it.off = true; else if (Object.keys(ch).length) it.warn = changesText(ch); }
      return it; });
    var bo = bestOf(pr); items.sort(function (a, b) { return a.best && b.best ? bo.indexOf(a.val) - bo.indexOf(b.val) : 0; });
    foldPrint(items);
    if (mobLite() && items.length > 4) {   // Handy: lange Listen nur mit Bestsellern (+ aktueller Auswahl), sonst die ersten 5 – der Rest „am PC“
      var cur = S.sel[pr.slug], keep = items.filter(function (it) { return it.best || it.val === cur; });
      if (keep.length < 2) { var d0 = (S.prod.defaults || {})[pr.slug]; keep = items.filter(function (it) { return it.val === d0 || it.val === cur; }); items.forEach(function (it) { if (keep.length < 5 && keep.indexOf(it) < 0 && !it.off) keep.push(it); }); }
      if (keep.length < items.length) { keep.more = items.length - keep.length; return keep; }
    }
    return items;
  }
  // Druckart (Wunsch Simon): normale Farbdrucke zuerst (beidseitig, einseitig farbig), Pantone- und Weiß-Varianten als eigene einklappbare Gruppen
  var FOLD_PMS = "Pantone-Sonderfarben", FOLD_WHITE = "Mit Weißdruck";
  function foldPrint(items) {
    items.forEach(function (it) { it.fold = /pantone/i.test(it.name) ? FOLD_PMS : /wei(ß|ss)/i.test(it.name) ? FOLD_WHITE : ""; });
    if (!items.some(function (it) { return it.fold; }) || items.every(function (it) { return it.fold; })) { items.forEach(function (it) { it.fold = ""; }); return; }
    var rank = function (it) { return it.fold === FOLD_PMS ? 30 : it.fold === FOLD_WHITE ? 20 : it.best ? 0 : /^beidseitig farbig\b/i.test(it.name) ? 1 : /^einseitig farbig\b/i.test(it.name) ? 2 : 10; }, pos = items.slice();
    items.sort(function (a, b) { return rank(a) - rank(b) || pos.indexOf(a) - pos.indexOf(b); });
    items.forEach(function (it) { if (it.fold) it.group = it.fold; else if (!it.group) it.group = "Farbdruck (CMYK)"; });   // großer Auswahl-Dialog: als Kategorien
  }
  function mobLite() { return window.innerWidth <= 760 && !S.mobAll; }   // Handy übersichtlich (Wunsch Simon): Bestseller statt aller Optionen, „hier alle zeigen“ schaltet um
  function morePc(n) { return n ? '<span class="ps-td ps-morepc">+ ' + n + " weitere Option" + (n === 1 ? "" : "en") + ' am PC · <button type="button" class="ps-link" data-act="moball">hier zeigen</button></span>' : ""; }
  function disabledOf(pr) { // nie alle Optionen sperren (dann entscheidet Print.com beim Preis)
    var d = {}, n = 0; pr.options.forEach(function (o) { var t = Object.assign({}, S.sel); t[pr.slug] = o.slug; if (excluded(t) || BAD[badKey(t)]) { d[o.slug] = 1; n++; } });
    return n >= pr.options.length ? {} : d;
  }
  // Abhängigkeiten (parentOptions / parent): Eigenschaft bzw. Option nur zeigen, wenn ein passender Wert gewählt ist
  function selValues() { var v = {}; Object.keys(S.prod.fixed || {}).forEach(function (k) { v[S.prod.fixed[k]] = 1; }); Object.keys(S.sel).forEach(function (k) { v[S.sel[k]] = 1; }); return v; }
  function propVisible() { return true; }
  function optsOf(pr) { return pr.options; }
  // ── Bestseller: Produkte laut Print.com-Beliebtheit (Katalog „best“), Optionen = die meistgewählten Standards ──
  var BEST = { size: ["a5", "a4", "a6", "us_large", "bc", "bc_plus"], material: ["135gr_gesatineerd_mc", "170gr_gesatineerd_mc", "135gr_silk_mc", "350gr_silk_mc", "350gr_gesatineerd_mc", "300gr_silk_mc"], printtype: ["44"] };
  // Großformat (Banner, Roll-ups, Displays …): typisch 1 Stück
  function bigFmt(p) { return p.kind === "banner" || /^(outdoor-advertising|indoor-interior|displays-pos-material|outdoor-furniture)$/.test((p.cat || {}).main || p.group || ""); }
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
      api("/print/api/product?key=" + encodeURIComponent(key)).then(function (j) { if (!j.ok) { toast(j.error || "Produkt nicht verfügbar", true); return; } var i = S.cat.products.indexOf(p); fixLabels([j.product]); S.cat.products[i] = j.product; pickProduct(key, cb); }).catch(function () { toast("Keine Verbindung", true); });
      return;
    }
    if (!S.prod || S.prod.key !== key) {
      recentAdd(key); S.prod = p; S.sel = {}; S.gal = 0; S.autoFix = key; S.pmkImg = 0; p.props.forEach(function (pr) { var d = (p.defaults || {})[pr.slug]; S.sel[pr.slug] = d != null && pr.options.some(function (o) { return o.slug === d; }) ? d : pr.options[0].slug; });
      ["size", "material", "printtype"].forEach(function (k) { var pr = p.props.filter(function (x) { return x.slug === k; })[0]; if (!pr) return;
        bestOf(pr).some(function (b) { var t = Object.assign({}, S.sel); t[k] = b; if (excluded(t)) return false; S.sel = t; return true; }); });
      S.mot = { n: 1, split: [], files: [], i: 0 }; var bt = bestTiers(p); S.copies = bt.length ? (bt.indexOf(500) > -1 ? 500 : bt[0]) : p.tiers[0] === 1 && bigFmt(p) ? 1 : p.tiers.length ? p.tiers[Math.min(1, p.tiers.length - 1)] : 0; S.urgency = p.urgency.some(function (u) { return u.slug === "standard"; }) ? "standard" : (p.urgency[0] || {}).slug || "standard"; S.file = null; S.previews = null; S.design = null; S.price = null; S.mode = ""; S.logos = {}; S.pm = "auto"; S.dd = "";
      var C = p.custom; if (C) { var cm = C.unit === "cm", f = cm ? 10 : 1, cl = function (v, a, b) { return Math.max(a, Math.min(b, v)); }; S.custom = { w: cl(cm ? 2000 : 148, C.minW, C.maxW) / f, h: cl(cm ? 1000 : 210, C.minH, C.maxH) / f }; }
      if (p.kind === "textile") { var m = p.methods[0], sz = {}, ms = p.sizes.filter(function (x) { return /^(unisex_)?m$/i.test(x.slug); })[0] || p.sizes[0]; sz[ms.slug] = Math.max(10, m.min); S.textile = { method: m.key, positions: [m.positions[0]], sizes: sz }; } else S.textile = null;
      fixSel(); S.presetBase = Object.assign({}, S.sel);
    }
    loadPrice(); if (cb) cb();
  }
  var FOLD_RX = /^(single|singlehorizontal|wikkel|zigzag|luik|cross)_\d+$/;
  function sizeOf() {
    if (S.sel.fold && FOLD_RX.test(S.sel.fold)) return S.price && S.price.folds && S.price.size ? S.price.size : null;   // Folder: Größe = gefalzt, Datei = offenes Format (vom Server)
    if (isCustom()) { var f = S.prod.custom.unit === "cm" ? 10 : 1, w = Math.round(parseFloat(S.custom.w) * f), h = Math.round(parseFloat(S.custom.h) * f); return w > 0 && h > 0 ? { w: w, h: h } : null; }
    var sp = S.prod.props.filter(function (x) { return x.slug === "size"; })[0]; var o = sp && sp.options.filter(function (x) { return x.slug === S.sel.size; })[0];
    return o && o.w ? { w: o.w, h: o.h } : S.prod.dims ? { w: S.prod.dims[0], h: S.prod.dims[1] } : (S.price && S.price.size) || null;
  }
  function pagesNeeded() { return S.price && S.price.pages || 0; }   // mehrseitige Produkte (Broschüre, Buch, Kalender): Seiten inkl. Umschlag
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
  function cfgOf() { return { product: S.prod.key, sel: S.sel, copies: S.copies, urgency: S.urgency, pm: S.pm || "auto", custom: isCustom() ? S.custom : undefined, textile: S.textile || undefined }; }

  // ── Preis ──
  var pT, pSeq = 0;
  function loadPrice() {
    clearTimeout(pT); S.priceBusy = true; renderPrice();
    pT = setTimeout(function () {
      var seq = ++pSeq;
      api("/print/api/price", Object.assign(cfgOf(), { country: S.customer.country || S.country, zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "" })).then(function (j) {
        if (seq !== pSeq) return; S.priceBusy = false;
        if (j.ok) { var before = isLogo() ? logoKey() : ""; S.price = j.price; S.price.size = j.size; S.price.folds = j.folds || null; S.price.closed = j.closed || null; S.price.bleed = j.bleed; S.price.sides = j.sides; S.price.pages = j.pages || null; S.price.copies = j.copies; S.price.labels = j.labels; S.price.positions = j.positions; S.priceErr = "";
          if (isLogo() && before !== logoKey()) { S.logos = {}; S.file = null; } }
        else if (S.undo && /nicht lieferbar|keinen Preis/i.test(j.error || "")) {   // gerade gewählte Option geht nicht → zurück zur letzten bestellbaren Auswahl
          var u = S.undo, t0 = Object.assign({}, u.sel); t0[u.slug] = u.val; BAD[badKey(t0)] = 1; BAD[badKey(S.sel)] = 1; S.undo = null;
          var pr0 = S.prod.props.filter(function (x) { return x.slug === u.slug; })[0], o0 = pr0 && pr0.options.filter(function (x) { return x.slug === u.val; })[0];
          S.sel = u.sel; toast("„" + (o0 ? o0.name : u.val) + "“ ist in dieser Kombination nicht lieferbar – deine vorige Auswahl ist wiederhergestellt.", true); render(); loadPrice(); wishAlts(u, o0 ? o0.name : u.val); return;
        }
        else { S.price = null; S.priceErr = j.error || "Preis nicht verfügbar"; findAlts(); }
        if (j.ok) { S.undo = null; S.autoFix = null; S.good = { key: S.prod.key, sel: JSON.parse(JSON.stringify(S.sel)) }; }
        if (j.ok) { S.alts = null; altSeq++; dlPaint(); dlKick(); urRefresh(); }
        var pe = S.step === 2 && root.querySelector("[data-pmtile]"); if (pe) { var nt = pmTile(); if (pe.getAttribute("data-sig") !== nt) { var tmp = document.createElement("div"); tmp.innerHTML = nt; var ne = tmp.firstChild; ne.setAttribute("data-sig", nt); pe.replaceWith(ne); fillRows(); } }   // Verfahren + Preise zur aktuellen Auswahl
        renderPrice();
      }).catch(function () { if (seq !== pSeq) return; S.priceBusy = false; S.priceErr = "Keine Verbindung"; renderPrice(); });
    }, 220);
  }
  // Nicht lieferbar → naheliegende Alternativen suchen (je eine Option ändern, Nachbar-Auflagen) und mit Preis anbieten
  var altSeq = 0;
  function findAlts() {
    var seq = ++altSeq, p = S.prod; if (!p || kind() === "textile") return; S.alts = "busy"; var auto = S.autoFix === p.key;
    var cands = [], seen = {}, add = function (sel, copies, label, w) { var k = JSON.stringify([sel, copies]); if (seen[k]) return; seen[k] = 1; cands.push({ sel: sel, copies: copies, label: label, w: w }); };
    var tiers = (p.tiers || []).slice().sort(function (a, b) { return Math.abs(a - S.copies) - Math.abs(b - S.copies); }).filter(function (t) { return t !== S.copies; }).slice(0, auto ? 6 : 2);
    tiers.forEach(function (t) { add(Object.assign({}, S.sel), t, "Auflage " + t.toLocaleString("de-AT") + " Stk.", 1); });
    p.props.forEach(function (pr) { var cur = S.sel[pr.slug], opts = pr.options.map(function (o) { return o.slug; }), i = opts.indexOf(cur);
      bestOf(pr).concat([opts[i - 1], opts[i + 1]]).filter(function (v, k, a) { return v && v !== cur && a.indexOf(v) === k; }).slice(0, 3).forEach(function (v) {
        var r = resolveWith(pr.slug, v); if (r === null) return; var sel = Object.assign({}, S.sel, r); sel[pr.slug] = v;
        add(sel, S.copies, pr.title + ": " + (/color/.test(pr.slug) ? colName(optName(pr.slug, v)) : optName(pr.slug, v)) + (Object.keys(r).length ? " · " + changesText(r) : ""), 1 + Object.keys(r).length); }); });
    cands = cands.sort(function (a, b) { return a.w - b.w; }).slice(0, 10);
    var found = [], left = cands.length; if (!left) { S.alts = []; renderPrice(); return; }
    cands.forEach(function (cd) {
      api("/print/api/price", Object.assign(cfgOf(), { sel: cd.sel, copies: cd.copies, country: S.customer.country || S.country, zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "" })).then(function (j) { if (j.ok) found.push(Object.assign(cd, { price: j.price })); }).catch(function () {}).then(function () {
        if (seq !== altSeq) return; if (--left) return;
        S.alts = found.sort(function (a, b) { return a.w - b.w || a.price.gross - b.price.gross; }).slice(0, 4);
        if (auto && S.autoFix === p.key && S.alts.length && S.prod === p) { var A0 = S.alts[0]; S.autoFix = null; S.sel = Object.assign({}, A0.sel); S.copies = A0.copies; S.alts = null; S.priceErr = ""; S.presetBase = Object.assign({}, S.sel); render(); loadPrice(); return; }   // beim Öffnen: gleich eine lieferbare Ausführung mit Preis vorauswählen
        renderPrice(); });
    });
  }
  function altsHtml() {
    if (!S.priceErr || S.priceBusy) return "";
    if (S.alts === "busy") return '<p class="note"><span class="ps-spin"></span> Wir suchen passende Alternativen …</p>';
    if (!S.alts || !S.alts.length) return '<p class="note">Bitte eine andere Option wählen – oder <a class="ps-link" href="#" data-chat-open>frag uns im Chat</a>, wir finden eine Lösung.</p>';
    var co = S.ctype === "company";
    return '<div class="ps-alts"><p class="ps-alts-h">Das geht – ähnliche Ausführungen:</p>' + S.alts.map(function (a, i) { return '<button type="button" class="ps-alt" data-alt="' + i + '"><span>' + esc(a.label) + "</span><b>" + eur(co ? a.price.net : a.price.gross) + "</b><small>Übernehmen →</small></button>"; }).join("") + "</div>";
  }
  // Banner: Preis je m² groß (lange Bahnen wie das 20-m-Vliesbanner: je Laufmeter), Gesamtpreis kleiner darunter
  function isPromo(p) { return !!p && (p.kind === "promo" || ((p.cat || {}).main || p.group) === "gifts-merchandise-promotional"); }   // Werbeartikel
  function unitOf() {
    var p = S.prod; if (p && isPromo(p) && kind() !== "textile") { var nn = (S.price && S.price.copies) || totalCopies() || 1; return nn > 1 ? { div: nn, unit: "Stk.", label: "Stück", piece: true } : null; }   // Werbeartikel: Stückpreis groß
    var sz = sizeOf(); if (!p || !sz || kind() === "textile" || kind() === "promo") return null;
    var t = p.key + " " + p.title; if (!(p.kind === "banner" || /banner|plane|bauzaun|mesh|vlies/i.test(t)) || /roll|aufsteller|display/i.test(t)) return null;
    var n = (S.price && S.price.copies) || totalCopies() || 1, L = Math.max(sz.w, sz.h), K = Math.min(sz.w, sz.h);
    if (L >= 3000 && L / K >= 8) return { div: L / 1000 * n, unit: "lfm", label: "Laufmeter" };
    return { div: sz.w * sz.h / 1e6 * n, unit: "m²", label: "m²" };
  }
  function priceHtml(compact) {
    if (!S.prod) return "";
    var p = S.price, co = S.ctype === "company", n = (p && p.copies) || totalCopies();
    var what = '<p class="what">' + esc(S.prod.title) + " · " + (+n || 0).toLocaleString("de-AT") + " Stk." + (isCustom() && sizeOf() ? " · " + esc(S.custom.w + " × " + S.custom.h + " " + S.prod.custom.unit) : labelOf("size") ? " · " + esc(labelOf("size")) : "") + "</p>";
    what += wishHtml();
    if (S.priceErr && !S.priceBusy) return what + '<p class="err">' + esc(S.priceErr) + "</p>" + altsHtml();
    if (!p) return what + '<p class="note"><span class="ps-spin"></span> Preis wird berechnet …</p>';
    var main = co ? p.net : p.gross;
    if (p.bonus) what += '<p class="ps-bonus-tag">★ ' + esc(p.bonus.tier || "Rabatt") + " (" + String(p.bonus.pct).replace(".", ",") + " %) · du sparst " + eur(co ? p.bonus.saved : p.bonus.saved * (1 + (p.rate || 0) / 100)) + "</p>";
    var u = unitOf();
    if (u && u.div > 0) return what + '<div class="sum' + (S.priceBusy ? " loading" : "") + '">' + eur(main / u.div) + '<small>pro ' + u.label + " · " + (co ? "exkl. USt" : "inkl. USt") + "</small></div>" +
      '<div class="sum2 ps-tot">Gesamt ' + eur(main) + "<small>" + (u.piece ? (+n).toLocaleString("de-AT") + " Stk." : (+n > 1 ? (+n).toLocaleString("de-AT") + " Stk. · " : "") + String(Math.round(u.div * 100) / 100).replace(".", ",") + " " + u.unit) + (co ? " · " + eur(p.gross) + " inkl. USt" : "") + "</small></div>" +
      '<p class="note">' + (co ? "netto zzgl. " + p.rate + " % USt" : "inkl. " + p.rate + " % USt") + " · inkl. Versand innerhalb Österreichs</p>" +
      (compact ? "" : '<dl><dt>Preis je ' + u.label + "</dt><dd>" + eur(main / u.div) + "</dd>" + (+n > 1 && !u.piece ? "<dt>Stückpreis</dt><dd>" + eur(main / n) + "</dd>" : "") + "<dt>Datencheck</dt><dd>automatisch gratis</dd><dt>Versand (AT)</dt><dd>inklusive</dd>" + (p.deliveryDate ? "<dt>Lieferung voraussichtlich</dt><dd>" + esc(deDate(p.deliveryDate)) + "</dd>" : "") + "</dl>" + (p.deliveryDate ? '<p class="ps-dnote">Zustellung durch den Paketdienst – in Einzelfällen auch erst am darauffolgenden Werktag.</p>' : "")) +
      (p.taxNote ? '<p class="note">' + esc(p.taxNote) + "</p>" : "");
    return what + '<div class="sum' + (S.priceBusy ? " loading" : "") + '">' + eur(main) + '<small>' + (co ? "exkl. USt" : "inkl. USt") + "</small></div>" +
      (p.rate ? '<div class="sum2">' + eur(co ? p.gross : p.net) + "<small>" + (co ? "inkl. USt" : "exkl. USt") + "</small></div>" : "") +
      '<p class="note">' + (co ? "netto zzgl. " + p.rate + " % USt" + (p.rate ? " (" + eur(p.gross) + " brutto)" : "") : "inkl. " + p.rate + " % USt") + " · inkl. Versand innerhalb Österreichs</p>" +
      (compact ? "" : '<dl><dt>Stückpreis</dt><dd>' + eur(main / (n || 1)) + "</dd><dt>Datencheck</dt><dd>automatisch gratis</dd><dt>Versand (AT)</dt><dd>inklusive</dd>" + (p.deliveryDate ? "<dt>Lieferung voraussichtlich</dt><dd>" + esc(deDate(p.deliveryDate)) + "</dd>" : "") + "</dl>" + (p.deliveryDate ? '<p class="ps-dnote">Zustellung durch den Paketdienst – in Einzelfällen auch erst am darauffolgenden Werktag.</p>' : "")) +
      (p.taxNote ? '<p class="note">' + esc(p.taxNote) + "</p>" : "");
  }
  function renderPrice() {
    var b = document.getElementById("psPrice"); if (b && S.step < 4 && !S.view) b.innerHTML = '<h3>Dein Preis</h3>' + priceHtml(false) +
      (S.step === 2 ? '<button type="button" class="ps-btn primary ps-pcta" data-act="next2"' + (S.price && !S.priceBusy ? "" : " disabled") + ">" + (isLogo() ? "Weiter zum Logo" : "Weiter zur Gestaltung") + " →</button>" :
       S.step === 3 && S.file && !S.file.blocked ? '<button type="button" class="ps-btn primary ps-pcta" data-act="next3">' + (S.mot.n > 1 && motOk() ? "Weiter" : "In den Warenkorb") + " →</button>" : "") +
      '<ul class="ps-ptrust"><li>Automatischer Datencheck, Profi-Check optional</li><li>Versand in Österreich inklusive</li><li>Sicher bezahlen – Firmen auch auf Rechnung</li></ul>';
    var m = document.getElementById("psMbar"); if (m && S.prod && (S.step === 2 || S.step === 3) && m.querySelector("button.mp")) { var p = S.price; var szl = labelOf("size").replace(/\s+-\s+.*$/, ""), sm = totalCopies().toLocaleString("de-AT") + " Stk." + (szl ? " · " + szl : "");
      var u0 = p && unitOf(); if (u0 && u0.div > 0) sm = eur((S.ctype === "company" ? p.net : p.gross) / u0.div) + "/" + u0.unit + " · " + sm;
      m.querySelector(".mp").innerHTML = p ? "<b>" + eur(S.ctype === "company" ? p.net : p.gross) + ' <i class="up" aria-hidden="true">⌃</i></b><small>' + esc(sm) + " · " + (S.ctype === "company" ? "netto" : "inkl. USt") + " · inkl. Versand</small>" : '<small>' + (S.priceErr ? esc(S.priceErr) : "Preis wird berechnet …") + "</small>"; }
    var nx = document.getElementById("psNext2"); if (nx) nx.disabled = !S.price || S.priceBusy;
    var tt = document.getElementById("psTexTotal"); if (tt) tt.textContent = totalCopies().toLocaleString("de-AT") + " Stk.";
  }

  // Mobil: Preisdetails als Bottom-Sheet (Inhalt = Preisbox)
  function openSheet() {
    var src = document.getElementById("psPrice"); if (!src || !src.innerHTML) return; closeSheet();
    var sh = document.createElement("div"); sh.className = "ps-sheet"; sh.id = "psSheet";
    sh.innerHTML = '<div class="ps-sheet-bg" data-act="psheetx"></div><div class="ps-sheet-c" role="dialog" aria-modal="true" aria-label="Preisdetails"><span class="ps-sheet-grip" aria-hidden="true"></span><button type="button" class="ps-sheet-x" data-act="psheetx" aria-label="Schließen">×</button><div class="ps-price in-sheet">' + src.innerHTML + "</div></div>";
    root.appendChild(sh); document.documentElement.classList.add("ps-noscroll"); var x = sh.querySelector(".ps-sheet-x"); if (x) x.focus();
  }
  function closeSheet() { var s0 = document.getElementById("psSheet"); if (s0) s0.remove(); document.documentElement.classList.remove("ps-noscroll"); }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.getElementById("psSheet")) closeSheet(); });
  // Mobil: mitlaufende Abschnitts-Navigation in Schritt 2 (Format · Material · Optionen · Auflage)
  function secNav() {
    if (S.step !== 2 || S.view || window.innerWidth > 900) return;
    var panel = root.querySelector(".ps-panel"); if (!panel) return;
    var secs = [].slice.call(panel.querySelectorAll(".ps-sec")).filter(function (x) { return !x.classList.contains("ps-pre") && x.querySelector("h3"); }); if (secs.length < 2) return;
    var nav = document.createElement("nav"); nav.className = "ps-secnav"; nav.setAttribute("aria-label", "Abschnitte");
    nav.innerHTML = secs.map(function (x, i) { x.id = "psSec" + i; var t = (x.querySelector("h3").firstChild || {}).textContent || ""; return '<button type="button" data-sec="psSec' + i + '">' + esc(t.replace(/\s*·.*$/, "").trim()) + "</button>"; }).join("") + '<button type="button" data-sec="psPrice" class="pr">Preis</button>';
    secs[0].parentNode.insertBefore(nav, secs[0].previousElementSibling && secs[0].previousElementSibling.classList.contains("ps-pre") ? secs[0].previousElementSibling : secs[0]);
    secSpy();
  }
  function secSpy() {
    var nav = root.querySelector(".ps-secnav"); if (!nav) return; var off = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"), 10) || 64) + nav.offsetHeight + 16, cur = null;
    [].slice.call(nav.querySelectorAll("[data-sec]")).forEach(function (b) { var el = document.getElementById(b.getAttribute("data-sec")); if (el && el.getBoundingClientRect().top - off < 4) cur = b; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = nav.querySelector(".pr");
    nav.querySelectorAll("[data-sec]").forEach(function (b) { b.classList.toggle("on", b === cur); });
    if (cur && cur !== nav.__cur) { nav.__cur = cur; var r = cur.getBoundingClientRect(), nr = nav.getBoundingClientRect(); if (r.left < nr.left || r.right > nr.right) nav.scrollTo({ left: cur.offsetLeft - 16, behavior: "smooth" }); }
  }
  var secRaf = 0, lastY = 0; window.addEventListener("scroll", function () { if (!secRaf) secRaf = requestAnimationFrame(function () { secRaf = 0; secSpy();
    // Mobil: untere Navigation beim Runterscrollen ausblenden, beim Hochscrollen (und am Seitenende) wieder zeigen – mehr Platz für den Inhalt
    var y = window.scrollY, end = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
    if (y > lastY + 6 && y > 140 && !end) document.body.classList.add("bn-hide"); else if (y < lastY - 6 || y < 140 || end) document.body.classList.remove("bn-hide");
    lastY = y; }); }, { passive: true });
  root.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-sec]"); if (!b) return; var el = document.getElementById(b.getAttribute("data-sec")), nav = root.querySelector(".ps-secnav"); if (!el) return;
    var off = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h"), 10) || 64) + (nav ? nav.offsetHeight : 0) + 10; window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" }); });
  // ── Darstellung ──
  function stepsHtml() {
    return '<ol class="ps-steps" aria-label="Bestellschritte">' + STEPS.map(function (t, i) { var n = i + 1, cur = n === S.step, done = n < S.step; if ((n === 2 || n === 3) && !S.prod) done = false; if (n > 4 && !S.cart.length) done = false;
      return '<li class="' + (done ? "done" : "") + '"' + (cur ? ' aria-current="step"' : "") + '><button type="button" data-go="' + n + '"' + (done ? "" : " disabled") + '><span class="n">' + (done ? "✓" : n) + '</span><span class="t">' + t + "</span></button></li>"; }).join("") + "</ol>";
  }
  // Jede neue Seite (Start, Produkte, Kategorie, Produkt, Bestellschritt, Konto …) beginnt ganz oben – Optionen ändern lässt die Position, wo sie ist
  try { history.scrollRestoration = "manual"; } catch (e) {}   // Zurück-Taste: Browser stellt keine alte (falsche) Scrollposition wieder her
  var lastSig = null;
  function pageSig() { return [S.view || "", S.step, S.step === 1 ? S.page + "|" + (S.group || "") + "|" + (S.sub || "") : "", S.step >= 2 && S.prod ? S.prod.key : "", S.step === 3 ? S.mode || "" : "", S.view === "konto" && S.acct ? S.acct.tab || "" : ""].join("|"); }
  function render() {
    var sig = pageSig(), jump = sig !== lastSig; lastSig = sig; render0();
    if (jump) { try { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, 0); } }
  }
  function render0() {
    document.querySelectorAll("[data-nav]").forEach(function (a) { if (a.closest(".nav-links")) a.classList.toggle("active", !S.view && S.step === 1 && S.page === a.getAttribute("data-nav")); });
    var acl = document.querySelector(".nav-links [data-acct-link]"); if (acl) acl.classList.toggle("active", S.view === "konto");
    if (!S.view && S.step === 1 && S.page !== "produkte") { root.innerHTML = vHome(); headUpdate(); loadFrom(recentProds().concat(classics(), dailyPicks(), newestProds()).map(function (p) { return p.key; })); hqLoad(); return; }
    var h = S.step > 1 ? stepsHtml() : "";
    if (S.view === "konto") { root.innerHTML = vAccount(); headUpdate(); return; }
    if ((S.step === 2 || S.step === 3) && !S.prod) S.step = 1;
    if (S.step >= 5 && !S.cart.length) S.step = 4;
    if (S.step === 1) h += vProducts(); else if (S.step === 2) h += vOptions(); else if (S.step === 3) h += isLogo() ? vLogos() : vDesign(); else if (S.step === 4) h += vCart(); else if (S.step === 5) h += vAddress(); else h += vCheckout();
    root.innerHTML = h; headUpdate(); document.documentElement.classList.remove("ps-noscroll");
    var dc = root.querySelector(".ps-dimc.on"); if (dc) { var dp = dc.parentNode; dp.scrollLeft += dc.getBoundingClientRect().left - dp.getBoundingClientRect().left - 12; } if (S.step === 1 && !S.view) fromObserve(); if (S.step === 3 && S.file && !isLogo()) setTimeout(pfvRender, 0); if (S.step === 3) setTimeout(pmkPaint, 0);
    if ((S.step === 5 || S.step === 6) && S.cart.length && !S.view) {   // Mobil: Summe + nächster Schritt immer griffbereit
      var t5 = cartTotals(), co5 = S.ctype === "company", m5 = document.createElement("div"); m5.className = "ps-mbar"; m5.id = "psMbar";
      m5.innerHTML = '<div class="mp"><b>' + eur(co5 ? t5.net : t5.gross) + "</b><small>" + (co5 ? "netto" : "inkl. USt") + " · inkl. Versand</small></div>" + (S.step === 5 ? '<button type="button" class="ps-btn primary small" data-act="next4">Weiter zur Zahlung</button>' : '<button type="button" class="ps-btn primary small" data-act="toorder">Bestellen ↓</button>'); root.appendChild(m5); }
    if (S.step === 4 && S.cart.length && !S.view) { var t4 = cartTotals(), co4 = S.ctype === "company", m4 = document.createElement("div"); m4.className = "ps-mbar"; m4.id = "psMbar";
      m4.innerHTML = '<div class="mp"><b>' + eur(co4 ? t4.net : t4.gross) + "</b><small>" + S.cart.length + (S.cart.length === 1 ? " Position" : " Positionen") + " · " + (co4 ? "netto" : "inkl. USt") + ' · inkl. Versand</small></div><button type="button" class="ps-btn primary small" data-go="5">Zur Kasse</button>'; root.appendChild(m4); }
    if (S.step === 2 || S.step === 3) { var mb = document.createElement("div"); mb.className = "ps-mbar"; mb.id = "psMbar"; mb.innerHTML = '<button type="button" class="mp" data-act="psheet" aria-label="Preisdetails anzeigen"></button>' + (S.step === 2 ? '<button type="button" class="ps-btn primary small" data-act="next2">' + (isLogo() ? "Zum Logo" : "Zur Gestaltung") + "</button>" : S.step === 3 && S.file && !S.file.blocked ? '<button type="button" class="ps-btn primary small" data-act="next3">' + (S.mot.n > 1 && motOk() ? "Weiter" : "In den Warenkorb") + "</button>" : ""); root.appendChild(mb); renderPrice(); }
    if (S.step === 2) { renderPrice(); secNav(); fillRows(); dlKick(); }
  }
  // Ausführung: Listen-Kacheln stehen paarweise; bleibt eine allein in der Reihe, nimmt sie die ganze Breite
  function fillRows() { [].forEach.call(root.querySelectorAll(".ps-sec .ps-grid2"), function (g) { var run = [];
    var end = function () { if (run.length % 2) run[run.length - 1].classList.add("full"); run = []; };
    [].forEach.call(g.children, function (c) { if (c.classList.contains("seg") || c.classList.contains("wide") || c.classList.contains("full")) end(); else run.push(c); }); end(); }); }
  // Schritte im Browser-Verlauf: Zurück-Taste/Wisch-Geste geht Schritt für Schritt zurück statt aus dem Shop (Upload → Auswahl → Ausführung)
  function stepPush(n, mode) { if (!S.prod || n < 2) return; var st = history.state || {}; if (st.psStep === n && (st.psMode || "") === (mode || "")) return;
    try { if (!history.state && n === 2 && /[?&]produkt=/.test(location.search)) history.replaceState({ psStep: 2, psMode: "" }, "", location.href);   // per Link direkt geöffnetes Produkt: dieser Eintrag ist die Ausführung (sonst neuer Eintrag – Zurück führt zur Startseite)
      else { if (!st.psStep && S.step === 2 && n > 2) history.replaceState(Object.assign({}, st, { psStep: 2, psMode: "" }), "", location.href); history.pushState({ psStep: n, psMode: mode || "" }, "", location.href); } } catch (e) {} }
  function go(n, nopush) { if (!nopush && n === 3 && S.step < 3 && !S.file && S.mode === "upload") S.mode = "";   // von der Ausführung kommend ohne Datei: zuerst die Auswahl
    if (!nopush) stepPush(n, n === 3 ? S.mode : ""); S.step = n; S.err = ""; render(); var f = root.querySelector("h2"); if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); } }

  // ── Startseite: „Was möchtest du heute drucken?“ + Suche, Klassiker (Flyer, Banner), täglich 4 andere Produkte, Kategorien, Designer ──
  function daySeed() { var d = new Date(); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); }
  function classics() { var P = S.cat.products, fl = prodByKey("flyer"), bn = P.filter(function (p) { return p.kind === "banner"; })[0]; return [fl, bn].filter(Boolean); }
  function dailyPicks() {
    var hm = S.cat.home && S.cat.home.focus && S.cat.home.focus.map(prodByKey).filter(Boolean); if (hm && hm.length >= 2) return hm.slice(0, 4);   // vom Server täglich geprüft (Preis, Bild, Mitbewerber)
    var skip = {}; classics().forEach(function (p) { skip[p.key] = 1; });
    // Fokus: Produkte, bei denen wir laut Preisvergleich (druck.at/Flyeralarm) günstiger sind
    var FOCUS = ["postcards", "plakate", "folder", "tshirt-basic", "tshirt-bio", "rollups", "mesh-banner", "bauzaun"];
    var pool = S.cat.products.filter(function (p) { return !skip[p.key] && FOCUS.indexOf(p.key) > -1; });
    if (pool.length < 4) pool = pool.concat(S.cat.products.filter(function (p) { return !skip[p.key] && FOCUS.indexOf(p.key) < 0 && imgOk(p.img) && !badDesc(p); }));
    var seed = daySeed(), rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // beliebte Produkte etwas häufiger, aber jeden Tag eine andere Mischung
    return pool.map(function (p) { return { p: p, k: rnd() * (p.best ? 1.6 : 1) }; }).sort(function (a, b) { return b.k - a.k; }).slice(0, 4).map(function (x) { return x.p; });
  }
  function sugHtml(qq) {
    qq = (qq || "").trim().toLowerCase(); if (!qq) return "";
    var l = S.cat.products.filter(function (p) { var c = p.cat || {}; return (p.title + " " + p.desc + " " + (c.mainName || "") + " " + (c.subName || "") + " " + p.key).toLowerCase().indexOf(qq) > -1; })
      .sort(function (a, b) { var at = a.title.toLowerCase().indexOf(qq) === 0, bt = b.title.toLowerCase().indexOf(qq) === 0; return (bt - at) || ((b.pop || 0) - (a.pop || 0)); }).slice(0, 7);
    if (!l.length) return '<div class="ps-sug-empty">Nichts gefunden – <button type="button" class="ps-link" data-nav="produkte">alle Produkte ansehen</button> oder <a class="ps-link" href="#" data-chat-open>frag uns im Chat</a>.</div>';
    return l.map(function (p, i) { return '<button type="button" class="ps-sug-it" role="option" data-prod="' + esc(p.key) + '"' + (i === 0 ? ' aria-selected="true"' : "") + '><span class="im">' + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="">' : esc(p.icon)) + "</span><span><b>" + esc(p.title) + "</b><small>" + esc((p.cat && p.cat.mainName) || p.desc || "") + "</small></span>" + (p.best ? '<span class="ps-badge sm">★</span>' : "") + "</button>"; }).join("") +
      '<button type="button" class="ps-sug-all" data-act="searchall">Alle Treffer für „' + esc(qq) + "“ anzeigen →</button>";
  }
  var SHORT = { "tshirt-basic": "T-Shirts", "tshirt-bio": "Bio-Shirts", "hoodie-bio": "Hoodies", "pvc-banner": "Banner", "mesh-banner": "Mesh-Banner", rollups: "Roll-ups" };
  var shortName = function (p) { return SHORT[p.key] || String(p.title).replace(/\s*\(.*\)\s*$/, ""); };
  var badDesc = function (p) { var d = txt(p.desc); return !d || d.toLowerCase() === String(p.title).toLowerCase() || /angebotsanfrage|nicht verfügbar|e-mail|@/i.test(d); };
  var FROMP = {};
  // „Zuletzt angesehen“ (nur in diesem Browser, ohne Personenbezug)
  function recentGet() { try { var l = JSON.parse(localStorage.getItem("fsc-print-recent") || "[]"); return Array.isArray(l) ? l.filter(function (k) { return typeof k === "string"; }).slice(0, 10) : []; } catch (e) { return []; } }
  function recentAdd(k) { try { var l = recentGet().filter(function (x) { return x !== k; }); l.unshift(k); localStorage.setItem("fsc-print-recent", JSON.stringify(l.slice(0, 10))); } catch (e) {} }
  function recentProds() { return recentGet().map(prodByKey).filter(Boolean).slice(0, 6); }   // höchstens 6 (Wunsch Simon)
  function savedHomeHtml() { var l = savedList().slice(0, 4); if (!l.length) return "";
    return '<section class="ps-hsec ps-recent ps-savhome"><div class="ps-hsec-h"><h2>Deine Merkliste</h2>' + (S.me ? '<button type="button" class="ps-link" data-act="konto">Alle im Konto →</button>' : "") + '</div><div class="ps-savs">' + l.map(savedCard).join("") + "</div></section>"; }
  function recentHtml() { var l = recentProds(); if (!l.length) return "";
    return '<section class="ps-hsec ps-recent"><div class="ps-hsec-h"><h2>Zuletzt angesehen</h2><button type="button" class="ps-link" data-act="recentclr">Liste leeren</button></div><div class="ps-rec">' + l.map(function (p) {
      return '<button type="button" data-prod="' + esc(p.key) + '"><span class="ri">' + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">' + esc(p.icon) + "</span>") + '</span><span class="rt"><b>' + esc(shortName(p)) + '</b><span class="ps-from" data-from="' + esc(p.key) + '">' + fromTxt(p.key) + "</span></span></button>"; }).join("") + "</div></section>"; }
  function fromSel(p) { var o = {}; (p.props || []).forEach(function (pr) { var b = (BEST[pr.slug] || []).filter(function (x) { return pr.options.some(function (q) { return q.slug === x; }); })[0]; if (b) o[pr.slug] = b; }); return o; }
  function loadFrom(keys) { var seen = {}; keys = keys.filter(function (k) { if (k in FROMP || seen[k]) return false; seen[k] = 1; return true; }); if (!keys.length) return;
    if (keys.length > 12) { for (var ci = 0; ci < keys.length; ci += 12) loadFrom(keys.slice(ci, ci + 12)); return; }   // Server nimmt max. 12 je Anfrage
    keys.forEach(function (k) { FROMP[k] = null; });
    var sels = {}; keys.forEach(function (k) { var p = prodByKey(k); if (!p) return; var o = fromSel(p); var t = p.tiers || [], bq = t.indexOf(500) > -1 ? 500 : t.indexOf(250) > -1 ? 250 : t[0] === 1 && bigFmt(p) ? 1 : t.indexOf(5) > -1 && t[0] === 1 ? 5 : t[Math.min(1, t.length - 1)]; if (bq) o.__copies = bq; if (Object.keys(o).length) sels[k] = o; });
    api("/print/api/from?keys=" + encodeURIComponent(keys.join(",")) + "&sel=" + encodeURIComponent(JSON.stringify(sels))).then(function (j) { if (!j.ok) return; Object.keys(j.from || {}).forEach(function (k) { FROMP[k] = j.from[k]; document.querySelectorAll('[data-from="' + k + '"]').forEach(function (el) { el.innerHTML = fromTxt(k); }); }); }).catch(function () {}); }
  function fromTxt(k) { var f = FROMP[k], pp = f && prodByKey(k), g0 = f && (S.ctype === "company" ? f.gross / 1.2 : f.gross);
    if (f && isPromo(pp) && f.copies > 1) return "<b>" + eur(g0 / f.copies).replace(/(,\d\d)\d*/, "$1") + "</b>/Stk. <small>(" + (+f.copies).toLocaleString("de-AT") + " Stk. " + eur(g0) + ")</small>";   // Werbeartikel: Stückpreis groß
    // Banner & lange Bahnen: Preis je m² bzw. Laufmeter groß, Größe dazu (sonst weiß niemand, dass „2 Stk.“ beim Vliesbanner 2 × 20 m sind)
    var bd = f && pp && (pp.dims ? { w: pp.dims[0], h: pp.dims[1] } : pp.kind === "banner" && pp.custom ? { w: Math.max(pp.custom.minW, 1000), h: Math.max(pp.custom.minH, 500) } : null);
    if (bd && (pp.kind === "banner" || /banner|plane|bauzaun|mesh|vlies/i.test(pp.key + " " + pp.title)) && !/roll|aufsteller|display/i.test(pp.key + " " + pp.title)) {
      var L = Math.max(bd.w, bd.h), K = Math.min(bd.w, bd.h), lm = L >= 3000 && L / K >= 8, n = +f.copies || 1, dv = lm ? L / 1000 * n : bd.w * bd.h / 1e6 * n;
      return "<b>" + eur(g0 / dv).replace(/(,\d\d)\d*/, "$1") + "</b>/" + (lm ? "lfm" : "m²") + " <small>(" + (n > 1 ? n + " × " : "") + fmtSize(bd.w, bd.h) + " · " + eur(g0) + ")</small>"; }
    return f ? (+f.copies).toLocaleString("de-AT") + " Stk. <b>" + eur(S.ctype === "company" ? f.gross / 1.2 : f.gross) + "</b>" + (f.copies > 1 ? ' <small>(' + eur((S.ctype === "company" ? f.gross / 1.2 : f.gross) / f.copies).replace(/(,\d\d)\d*/, "$1") + "/Stk.)</small>" : "") : ""; }
  function facts(p) { var pr = function (sl) { return (p.props || []).filter(function (x) { return x.slug === sl; })[0]; }, sz = pr("size"), mt = pr("material"), l = [];
    if (sz && sz.options.length > 1) l.push(sz.options.length + " Formate"); if (mt && mt.options.length > 1) l.push(mt.options.length + " Materialien"); if (p.tiers && p.tiers.length) l.push("ab " + p.tiers[0].toLocaleString("de-AT") + " Stk.");
    if (p.kind === "banner") l.push("Wunschgröße in cm"); if (p.designer) l.push("Online-Designer"); return l.slice(0, 4); }
  // Neu im Sortiment: die 4 zuletzt bei Print.com aufgenommenen Produkte (Datum aus dem Print.com-Katalog), ohne Doppelungen mit Klassikern/Fokus
  function newestProds() { var hf = S.cat.home && S.cat.home.fresh && S.cat.home.fresh.map(prodByKey).filter(Boolean); if (hf && hf.length >= 2) return hf.slice(0, 4);
    var ex = {}; classics().concat(dailyPicks()).forEach(function (p) { ex[p.key] = 1; });
    return S.cat.products.filter(function (p) { return p.added && imgOk(p.img) && !ex[p.key]; }).sort(function (a, b) { return a.added < b.added ? 1 : a.added > b.added ? -1 : 0; }).slice(0, 4); }
  function newLabel(d) { var t = new Date(d + "T12:00:00"); return isNaN(t) ? "Neu" : "Neu seit " + t.toLocaleDateString("de-AT", { day: "numeric", month: "long" }); }
  function featCard(p, big) {
    var tag = p.designer ? "Online gestalten oder Datei hochladen" : p.kind === "banner" ? "Wunschgröße in cm" : "Druckdaten hochladen";
    return '<button type="button" class="ps-feat' + (big ? " big" : "") + '" data-prod="' + esc(p.key) + '"><span class="ph">' + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '<span class="ic">' + esc(p.icon) + "</span>") + "</span>" +
      '<span class="bd">' + (p.__new ? '<span class="ps-badge new">' + esc(newLabel(p.added)) + "</span>" : p.best ? '<span class="ps-badge">★ Bestseller</span>' : "") + "<b>" + esc(p.title) + "</b>" + (badDesc(p) || !lead(p.desc) ? "" : "<span>" + esc(lead(p.desc)) + "</span>") +
      (big ? '<ul class="ps-facts">' + facts(p).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + '<span class="ps-from" data-from="' + esc(p.key) + '">' + fromTxt(p.key) + "</span>" + '<span class="go"><span class="gl">' + esc(tag) + '</span><span class="gs">' + (p.designer ? "Jetzt gestalten" : "Ansehen") + "</span> →</span></span></button>";
  }
  // Startseite: Sofortpreis im Hero – Produkt + Stückzahl antippen, echter Preis (Bestseller-Ausführung, inkl. Versand) kommt vom Server
  var HQP = [["flyer", [250, 500, 1000, 2500], 500], ["visitenkarten", [250, 500, 1000, 2500], 500], ["plakate", [5, 10, 25, 50], 10], ["pvc-banner", [1, 2, 3, 5], 1]], HQC = {};
  function hqList() { return HQP.map(function (x) { var p = prodByKey(x[0]); if (!p) return null; var t = p.tiers || [], q = x[1].filter(function (n) { return t.indexOf(n) > -1; }); if (!q.length) q = t.slice(0, 4); return q.length ? { p: p, q: q, d: x[2] } : null; }).filter(Boolean); }
  function hqCur() { var L = hqList(); if (!L.length) return null; var h = S.hq || (S.hq = { k: L[0].p.key, q: 0 }), c = L.filter(function (x) { return x.p.key === h.k; })[0] || L[0]; h.k = c.p.key;
    if (c.q.indexOf(h.q) < 0) h.q = c.q.indexOf(c.d) > -1 ? c.d : c.q[0]; return { L: L, c: c, h: h }; }
  function hqPriceHtml(v, q) { if (!v) return '<span class="v">…</span><small>Preis wird berechnet</small>'; var co = S.ctype === "company", g = co ? v.gross / 1.2 : v.gross;
    return '<span class="v" data-v="' + g.toFixed(2) + '">' + eur(g) + "</span><small>" + (co ? "netto, zzgl. 20 % USt" : "inkl. 20 % USt") + " · inkl. Versand" + (q > 1 ? " · " + eur(g / q).replace(/(,\d\d)\d*/, "$1") + "/Stk." : "") + "</small>"; }
  function hqInner() { var x = hqCur(); if (!x) return ""; var c = x.c, h = x.h, v = HQC[h.k + "|" + h.q];
    return '<div class="hq-h"><span class="live" aria-hidden="true"></span><b>Sofortpreis</b><small>Endpreis für die Bestseller-Ausführung</small></div>' +
      '<div class="hq-tabs" role="tablist" aria-label="Produkt">' + x.L.map(function (y) { var on = y.p.key === h.k; return '<button type="button" role="tab" aria-selected="' + on + '" data-act="hqk:' + esc(y.p.key) + '">' + (imgOk(y.p.img) ? '<img src="' + esc(y.p.img) + '" alt="" loading="lazy">' : '<i aria-hidden="true">' + esc(y.p.icon) + "</i>") + "<span>" + esc(shortName(y.p)) + "</span></button>"; }).join("") + "</div>" +
      '<div class="hq-qty" role="group" aria-label="Stückzahl"><span>Stück</span>' + c.q.map(function (n) { return '<button type="button" aria-pressed="' + (n === h.q) + '" data-act="hqq:' + n + '">' + n.toLocaleString("de-AT") + "</button>"; }).join("") + "</div>" +
      '<div class="hq-price' + (v ? "" : " busy") + '" aria-live="polite">' + hqPriceHtml(v, h.q) + "</div>" +
      '<p class="hq-spec">' + (c.p.kind === "banner" ? "100 × 50 cm · Bestseller-Ausführung · Größe frei wählbar" : "Bestseller-Ausführung · Format, Papier &amp; Veredelung im nächsten Schritt wählbar") + "</p>" +
      '<button type="button" class="ps-btn primary hq-go" data-act="hqgo">' + (c.p.designer ? "Jetzt gestalten" : "Jetzt konfigurieren") + " →</button>"; }
  function hqLoad() { var x = hqCur(); if (!x) return; var h = x.h, key = h.k + "|" + h.q;
    var show = function () { var box = document.querySelector("#psHq .hq-price"); if (!box || S.hq.k + "|" + S.hq.q !== key) return; var v = HQC[key], old = box.querySelector(".v[data-v]"), from = old ? +old.getAttribute("data-v") : 0;
      box.classList.remove("busy"); box.innerHTML = hqPriceHtml(v, h.q); var el = box.querySelector(".v[data-v]"); if (!el || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      var to = +el.getAttribute("data-v"), t0 = performance.now(); (function step(t) { var k = Math.min(1, (t - t0) / 420), e = 1 - Math.pow(1 - k, 3); el.textContent = eur(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); })(t0); };
    if (key in HQC) { show(); return; }
    var p = prodByKey(h.k), sels = {}; sels[h.k] = Object.assign(fromSel(p), { __copies: h.q });
    api("/print/api/from?keys=" + encodeURIComponent(h.k) + "&sel=" + encodeURIComponent(JSON.stringify(sels))).then(function (j) { HQC[key] = j.ok && j.from && j.from[h.k] || null; show(); }).catch(function () {}); }
  function hqUpd(keepPrice) { var c = document.getElementById("psHq"); if (!c) return; var old = c.querySelector(".hq-price .v[data-v]"), ov = old && old.outerHTML; c.innerHTML = hqInner();
    var box = c.querySelector(".hq-price.busy"); if (box && ov && keepPrice) box.querySelector(".v").outerHTML = ov; hqLoad(); }
  function vHome() {
    var chipsK = ["flyer", "visitenkarten", "plakate", "aufkleber", "rollups", "folder"], chipsL = chipsK.map(prodByKey).filter(Boolean);
    var bn = S.cat.products.filter(function (p) { return p.kind === "banner"; })[0]; if (bn) chipsL.splice(3, 0, bn);
    var tx = S.cat.products.filter(function (p) { return p.kind === "textile"; })[0]; if (tx) chipsL.push(tx);
    var groups = (S.cat.groups || []).map(function (g) { var l = S.cat.products.filter(function (p) { return (p.cat || {}).main === g.slug; }); var im = l.filter(function (p) { return imgOk(p.img); }).sort(function (a, b) { return (b.pop || 0) - (a.pop || 0); })[0]; return { g: g, n: l.length, img: im && im.img }; }).filter(function (x) { return x.n >= 5; });
    var dsg = S.cat.products.filter(function (p) { return p.designer; }).slice(0, 4);
    var nw = newestProds(), hq = hqInner(), reg = '<svg class="reg" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="11"/><circle cx="20" cy="20" r="5"/><path d="M20 2v36M2 20h36"/></svg>';
    return '<section class="ps-home-hero ps-hero2"><div class="sheet"><i class="crop tl" aria-hidden="true"></i><i class="crop tr" aria-hidden="true"></i><i class="crop bl" aria-hidden="true"></i><i class="crop br" aria-hidden="true"></i>' + reg +
      '<div class="hx"><span class="eyebrow">FS Creative Druckshop · Lieferung in ganz Österreich</span><h1>Flyer, Visitenkarten &amp; Banner <span class="gx">online drucken</span>' + (S.cat.products.length >= 103 ? '<span class="hx-more">+ über ' + Math.floor((S.cat.products.length - 3) / 100) * 100 + ' weitere Produkte</span>' : "") + "</h1>" +
      '<p class="lead">Preis sofort sehen, online gestalten oder Datei hochladen – jede Datei wird automatisch geprüft, auf Wunsch zusätzlich vom Profi. Versand innerhalb Österreichs inklusive.</p>' +
      '<div class="ps-hsearch" role="combobox" aria-expanded="false" aria-haspopup="listbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="psHomeQ" placeholder="Flyer, Visitenkarten, Banner …" aria-label="Produkt suchen" autocomplete="off" aria-controls="psSug"><button type="button" class="ps-btn primary" data-act="searchall">Suchen</button><div class="ps-sug" id="psSug" role="listbox" hidden></div></div>' +
      '<div class="ps-qchips">' + chipsL.map(function (p) { return '<button type="button" data-prod="' + esc(p.key) + '">' + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '<span class="qi" aria-hidden="true">' + esc(p.icon) + "</span>") + "<span>" + esc(shortName(p)) + "</span></button>"; }).join("") + '<button type="button" class="all" data-nav="produkte">Alle ' + S.cat.products.length + " Produkte →</button></div>" +
      '<ul class="ps-trust"><li><b>Preis sofort</b> inkl. Versand</li><li><b>Datencheck</b> automatisch, Profi-Check optional</li><li><b>Online gestalten</b> mit Vorlagen</li><li><b>Bestes Verfahren</b> automatisch zum besten Preis</li></ul></div>' + (hq ? '<div class="hq" id="psHq">' + hq + "</div>" : "") +
      '<div class="cmyk" aria-hidden="true"><i class="c"></i><i class="m"></i><i class="y"></i><i class="k"></i><i class="k75"></i><i class="k50"></i><i class="k25"></i><span>Farbkontrollstreifen · CMYK · 300 dpi · 3 mm Beschnitt</span></div></div></section>' + savedHomeHtml() + recentHtml() +
      '<section class="ps-hsec"><div class="ps-hsec-h"><h2>Unsere Klassiker</h2></div><div class="ps-feats two">' + classics().map(function (p) { return featCard(p, true); }).join("") + "</div></section>" +
      '<section class="ps-hsec"><div class="ps-hsec-h"><h2>Heute im Fokus</h2><span class="pd-muted">Jeden Tag vier andere Ideen aus unserem Sortiment</span></div><div class="ps-feats four">' + dailyPicks().map(function (p) { return featCard(p); }).join("") + "</div></section>" +
      (nw.length ? '<section class="ps-hsec ps-new"><div class="ps-hsec-h"><h2>Neu im Sortiment</h2><span class="pd-muted">Die vier neuesten Produkte – frisch aufgenommen</span></div><div class="ps-feats four">' + nw.map(function (p) { return featCard(Object.assign({}, p, { __new: true })); }).join("") + "</div></section>" : "") +
      '<section class="ps-hsec ps-designer-intro"><div class="dt"><span class="eyebrow">Online-Designer</span><h2>Selbst gestalten – ganz ohne Grafikprogramm</h2><p>Wähle eine Vorlage, tausche Texte und Bilder aus, füge dein Logo und einen QR-Code hinzu – fertig. Der Designer kennt Format, Beschnitt und Sicherheitsabstand und erstellt daraus ein druckfertiges PDF.</p>' +
      '<ul><li>Fertige Vorlagen für ' + dsg.map(function (p) { return esc(p.title); }).join(", ") + "</li><li>KI-Assistent: Texte und Gestaltungsideen auf Knopfdruck</li><li>Eigene Bilder, Logo, Farben, Schriften, QR-Code (Link oder Kontakt)</li><li>Vorschau wie gedruckt und automatischer Druckdaten-Check</li><li>Entwurf speichern und später weitermachen</li></ul>" +
      '<div class="btn-row">' + dsg.slice(0, 2).map(function (p, i) { return '<button type="button" class="ps-btn' + (i ? "" : " primary") + '" data-prod="' + esc(p.key) + '">' + esc(p.title) + " gestalten</button>"; }).join("") + '<a class="ps-link" href="/print/hilfe#designer">Mehr zum Designer</a></div></div>' +
      '<div class="dv" aria-hidden="true"><div class="dv-win"><div class="dv-bar"><i></i><i></i><i></i><span>Designer · Flyer A5</span></div><div class="dv-body"><div class="dv-side"><span class="on">✦</span><span>T</span><span>▢</span><span>🖼</span><span>QR</span></div>' +
        '<div class="dv-stage"><div class="dv-flyer"><span class="k">Samstag · 12. Juli · ab 17 Uhr</span><b>Sommer&shy;fest</b><span class="s">Musik · Kulinarik · gute Leute</span><span class="pic"></span><span class="f">Dorfplatz Gaschurn<br>www.muster-verein.at</span><span class="badge">Eintritt frei</span></div>' +
        '<div class="dv-card2"><span class="n">Maria Muster</span><span class="r">Gestalterin</span><span class="l"></span><span class="c">+43 664 123 45 67<br>maria@muster.at</span></div></div>' +
        '<div class="dv-ai"><b>✨ KI-Assistent</b><span>„Flyer fürs Sommerfest am 12. Juli, Eintritt frei“</span><em>Vorschlag übernommen ✓</em></div></div></div></div></section>' +
      '<section class="ps-hsec"><div class="ps-hsec-h"><h2>Alle Kategorien</h2><button type="button" class="ps-link" data-nav="produkte">Alle Produkte ansehen →</button></div><div class="ps-cats">' + groups.map(function (x) { return '<button type="button" class="ps-catt" data-nav="produkte" data-navgroup="' + esc(x.g.slug) + '"><span class="ci">' + (x.img ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : "") + '</span><span class="ct"><b>' + esc(x.g.name) + "</b><span>" + x.n + " Produkte →</span></span></button>"; }).join("") + "</div></section>" +
      '<section class="ps-hsec ps-hsteps"><div class="ps-hsec-h"><h2>So einfach geht’s</h2><a class="ps-link" href="/print/hilfe">So geht’s &amp; FAQ →</a></div><ol><li><b>Produkt wählen</b><span>Format, Papier, Auflage – Preis sofort</span></li><li><b>Gestalten oder hochladen</b><span>Im Designer oder als fertige PDF</span></li><li><b>Bezahlen</b><span>Online oder als Firma auf Rechnung</span></li><li><b>Prüfen &amp; drucken</b><span>Automatischer Datencheck, Versand in ganz Österreich</span></li></ol></section>';
  }
  function setPage(pg, push) {
    S.view = ""; S.page = pg; S.step = 1; S.dd = "";
    if (push !== false) try { history.pushState({ pg: pg }, "", pg === "produkte" ? "/print?produkte" + (S.group ? "&kategorie=" + encodeURIComponent(S.group) : "") : "/print"); } catch (e) {}
    render(); window.scrollTo({ top: 0 });
  }
  window.addEventListener("popstate", function () { if (!S.cat) return; var st = history.state;
    if (st && st.psStep && S.prod) { closeSheet(); S.view = ""; S.dd = ""; if (st.psStep === 3) S.mode = S.file ? S.mode : st.psMode || ""; go(st.psStep, true); return; }   // Schritt zurück/vor
    var qq = new URLSearchParams(location.search); if (qq.has("konto")) { S.view = "konto"; render(); return; } if (qq.has("warenkorb")) { S.view = ""; go(4, true); return; } S.group = qq.get("kategorie") || ""; S.sub = qq.get("unter") || ""; S.q = qq.get("q") || ""; setPage(qq.has("produkte") ? "produkte" : "home", false); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-nav]"); if (!a || !S.cat) return; e.preventDefault();
    var pg = a.getAttribute("data-nav"); S.group = a.getAttribute("data-navgroup") || ""; S.sub = ""; S.q = "";
    setPage(pg);
  });

  // Schritt 1: Produktwahl – Hauptgruppen (Print.com), Untergruppen-Filter, Suche, echte Produktbilder
  function cardHtml(p) {
    var tag = p.lazy ? "Druckdaten hochladen" : p.kind === "textile" || p.kind === "promo" ? "Logo hochladen" : p.designer ? "Online gestalten oder hochladen" : "Druckdaten hochladen";
    return '<button type="button" class="ps-prod' + (p.best ? " best" : "") + '" data-prod="' + esc(p.key) + '" aria-pressed="' + (!!S.prod && S.prod.key === p.key) + '"><span class="ph">' + (p.best ? '<span class="ps-badge">★ Bestseller</span>' : "") + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async">' : '<span class="ic" aria-hidden="true">' + esc(p.icon) + "</span>") + "</span>" +
      '<span class="bd"><b>' + esc(p.title) + "</b>" + (badDesc(p) || !lead(p.desc) ? "" : "<span>" + esc(lead(p.desc)) + "</span>") + '<span class="ps-from" data-from="' + esc(p.key) + '">' + fromTxt(p.key) + '</span><span class="tag">' + tag + "</span></span></button>";
  }
  function filtered() {
    var qq = S.q.trim().toLowerCase();
    return S.cat.products.filter(function (p) { var c = p.cat || {}; if (S.group && c.main !== S.group) return false; if (S.sub && c.sub !== S.sub) return false;
      return !qq || (p.title + " " + p.desc + " " + (c.mainName || "") + " " + (c.subName || "") + " " + p.key).toLowerCase().indexOf(qq) > -1; });
  }
  // Sortiment (Wunsch Simon 19.10.2026): Übersicht mit Kategorien + Unterkategorien statt aller Produkte untereinander;
  // Kategorie-Ansicht mit Seitenleiste (Unterkategorien), Filtern, Sortierung und kompakten Karten; Preise laden, sobald Karten sichtbar werden
  function cardSm(p) {
    return '<a class="ps-pc' + (p.best ? " best" : "") + '" href="/print?produkt=' + encodeURIComponent(p.key) + '" data-prod="' + esc(p.key) + '"><span class="ph">' + (p.best ? '<span class="ps-badge">★ Bestseller</span>' : isNew(p) ? '<span class="ps-badge nw">Neu</span>' : "") +
      (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async">' : '<span class="ic" aria-hidden="true">' + esc(p.icon) + "</span>") + '</span><span class="bd"><b>' + esc(p.title) + "</b>" +
      (p.designer ? '<span class="ps-pc-d">Online-Designer</span>' : "") + '<span class="ps-from" data-from="' + esc(p.key) + '">' + fromTxt(p.key) + "</span></span></a>";
  }
  function catA(main, sub, cls, inner, attrs) { return '<a' + (cls ? ' class="' + cls + '"' : "") + ' href="/print?produkte' + (main ? "&amp;kategorie=" + encodeURIComponent(main) : "") + (sub ? "&amp;unter=" + encodeURIComponent(sub) : "") + '" data-cat="' + esc(main || "") + "|" + esc(sub || "") + '"' + (attrs || "") + ">" + inner + "</a>"; }
  function isNew(p) { if (!p.added) return false; var t = Date.parse(p.added + "T12:00:00"); return isFinite(t) && Date.now() - t < 120 * 864e5; }
  function grpOf(slug) { return (S.cat.groups || []).filter(function (g) { return g.slug === slug; })[0] || null; }
  function inGrp(slug, sub) { return S.cat.products.filter(function (p) { var c = p.cat || {}; return c.main === slug && (!sub || (sub === "_" ? !c.sub : c.sub === sub)); }); }
  function subsOf(g) { var l = g.subs.map(function (x) { return { slug: x.slug, name: x.name, n: inGrp(g.slug, x.slug).length }; }).filter(function (x) { return x.n; }), rest = inGrp(g.slug, "_").length;
    if (rest) l.push({ slug: "_", name: "Weitere", n: rest }); return l; }
  function visGroups() { return (S.cat.groups || []).filter(function (g) { return inGrp(g.slug).length; }); }
  function sorted(l) { var k = S.sort || "pop", c = l.slice();
    if (k === "neu") c.sort(function (a, b) { return (b.added || "") < (a.added || "") ? -1 : (b.added || "") > (a.added || "") ? 1 : 0; });
    else if (k === "az") c.sort(function (a, b) { return String(a.title).localeCompare(String(b.title), "de"); });
    else c.sort(function (a, b) { return (b.best ? 1 : 0) - (a.best ? 1 : 0) || (b.pop || 0) - (a.pop || 0); });
    return c; }
  function fltd(l) { var f = S.flt || {}; return l.filter(function (p) { return (!f.best || p.best) && (!f.neu || isNew(p)) && (!f.des || p.designer); }); }
  function gridHtml() {
    var qq = S.q.trim();
    if (qq) { var ql = qq.toLowerCase(), l = sorted(S.cat.products.filter(function (p) { var c = p.cat || {}; return (p.title + " " + p.desc + " " + (c.mainName || "") + " " + (c.subName || "") + " " + p.key).toLowerCase().indexOf(ql) > -1; })); return l.length ? '<p class="ps-cv-n">' + l.length + " Treffer für „" + esc(qq) + "“</p>" + '<div class="ps-pcs">' + l.map(cardSm).join("") + "</div>"
      : '<p class="pd-muted" style="padding:20px 0">Nichts gefunden – probier einen anderen Begriff, ' + catA("", "", "ps-link", "stöbere in den Kategorien") + ' oder <a class="ps-link" href="#" data-chat-open>frag uns</a>.</p>'; }
    var g = S.group && grpOf(S.group);
    if (!g) {   // Übersicht: Bestseller + Kategorien mit Unterkategorien
      var top = S.cat.products.filter(function (p) { return p.best; }).sort(function (a, b) { return (b.pop || 0) - (a.pop || 0); }).slice(0, 10);
      return (top.length ? '<section class="ps-pov-best"><h3 class="ps-grp-h">★ Bestseller <span>die meistbestellten Produkte</span></h3><div class="ps-pcs row">' + top.map(cardSm).join("") + "</div></section>" : "") +
        '<h3 class="ps-grp-h">Alle Kategorien</h3><div class="ps-povg">' + visGroups().map(function (x) { var n = inGrp(x.slug).length, subs = subsOf(x).sort(function (a, b) { return b.n - a.n; }), more = subs.length > 5;
          return '<div class="ps-pov">' + catA(x.slug, "", "ps-pov-h", '<span class="ci">' + (imgOk(x.img) ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : "") + '</span><span class="ct"><b>' + esc(x.name) + "</b><small>" + n + " Produkte</small></span>") +
            '<ul>' + subs.slice(0, 5).map(function (y) { return "<li>" + catA(x.slug, y.slug === "_" ? "_" : y.slug, "", esc(y.name) + "<span>" + y.n + "</span>") + "</li>"; }).join("") + "</ul>" +
            catA(x.slug, "", "ps-link ps-pov-all", (more ? "Alle " + subs.length + " Bereiche · " : "Alle ") + n + " Produkte →") + "</div>"; }).join("") + "</div>";
    }
    var subs2 = subsOf(g), sub = subs2.filter(function (x) { return x.slug === S.sub; })[0], base = inGrp(g.slug, sub ? sub.slug : ""), l2 = sorted(fltd(base)), f = S.flt || {};
    var side = '<nav class="ps-cv-side" aria-label="Unterkategorien">' + catA(g.slug, "", "", "Alles in " + esc(g.name) + "<span>" + inGrp(g.slug).length + "</span>", ' aria-current="' + !sub + '"') +
      subs2.map(function (x) { return catA(g.slug, x.slug, "", esc(x.name) + "<span>" + x.n + "</span>", ' aria-current="' + (sub === x) + '"'); }).join("") +
      '<div class="ps-cv-oth"><small>Weitere Kategorien</small>' + visGroups().filter(function (x) { return x !== g; }).map(function (x) { return catA(x.slug, "", "", esc(x.name)); }).join("") + "</div></nav>";
    var chip = function (k, t, n) { return n ? '<button type="button" class="ps-fchip" data-flt="' + k + '" aria-pressed="' + !!f[k] + '">' + t + "</button>" : ""; };
    var bar = '<div class="ps-cv-bar"><span class="ps-cv-n">' + l2.length + " Produkt" + (l2.length === 1 ? "" : "e") + "</span>" + chip("best", "★ Bestseller", base.some(function (p) { return p.best; })) + chip("neu", "Neu", base.some(isNew)) + chip("des", "Online-Designer", base.some(function (p) { return p.designer; })) +
      '<label class="ps-cv-sort">Sortieren <select data-sort aria-label="Sortieren"><option value="pop"' + ((S.sort || "pop") === "pop" ? " selected" : "") + '>Beliebt</option><option value="neu"' + (S.sort === "neu" ? " selected" : "") + '>Neu</option><option value="az"' + (S.sort === "az" ? " selected" : "") + ">A–Z</option></select></label></div>";
    return '<div class="ps-cv">' + side + '<div class="ps-cv-main">' + bar + (l2.length ? '<div class="ps-pcs">' + l2.map(cardSm).join("") + "</div>" : '<p class="pd-muted" style="padding:20px 0">Keine Produkte mit diesen Filtern – <button type="button" class="ps-link" data-flt="">Filter zurücksetzen</button>.</p>') + "</div></div>";
  }
  function vProducts() {
    var g = S.group && grpOf(S.group), sub = g && S.sub && subsOf(g).filter(function (x) { return x.slug === S.sub; })[0];
    var crumbs = g || S.q.trim() ? '<nav class="ps-crumbs" aria-label="Pfad">' + catA("", "", "ps-link", "Alle Produkte") + (g ? " › " + catA(g.slug, "", "ps-link", esc(g.name)) : "") + (sub ? " › <span>" + esc(sub.name) + "</span>" : "") + "</nav>" : "";
    var h = sub ? sub.name : g ? g.name : "Alle Produkte";
    try { document.title = (S.q.trim() ? "Suche: " + S.q.trim() : h) + (g || S.q.trim() ? "" : " – " + S.cat.products.length + " Drucksachen & Werbeartikel") + " | FS Creative Druckshop"; } catch (e) {}
    return '<div class="ps-panel ps-prodpanel">' + crumbs + "<h2>" + esc(h) + '</h2><p class="sub">' + (g ? inGrp(g.slug, sub ? sub.slug : "").length + " Produkte" : S.cat.products.length + " Produkte in " + visGroups().length + " Kategorien") + " · alle Preise inkl. Versand innerhalb Österreichs.</p>" +
      '<div class="ps-find"><input type="search" id="psQ" value="' + esc(S.q) + '" placeholder="Produkt suchen, z. B. Flyer, T-Shirt, Banner …" aria-label="Produkt suchen" autocomplete="off"></div><div id="psGrid">' + gridHtml() + "</div></div>";
  }
  // „ab“-Preise erst laden, wenn die Karte in Sichtweite kommt (je 12 pro Anfrage, Server speichert 12 Std.)
  var fromIO = null, fromQ = [], fromT = 0;
  function fromObserve() {
    var els = [].slice.call(root.querySelectorAll("[data-prod] [data-from]")).filter(function (e) { return !(e.getAttribute("data-from") in FROMP); });
    if (fromIO) fromIO.disconnect();
    if (!("IntersectionObserver" in window)) { loadFrom(els.slice(0, 24).map(function (e) { return e.getAttribute("data-from"); })); return; }
    fromIO = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { fromQ.push(x.target.getAttribute("data-from")); fromIO.unobserve(x.target); } });
      clearTimeout(fromT); fromT = setTimeout(function () { var k = fromQ; fromQ = []; if (k.length) loadFrom(k); }, 150); }, { rootMargin: "400px 0px" });
    els.forEach(function (e) { fromIO.observe(e); });
  }
  function navCat(group, sub) {
    S.group = group || ""; S.sub = sub || ""; S.q = ""; S.flt = {};
    try { history.pushState({ pg: "produkte" }, "", "/print?produkte" + (S.group ? "&kategorie=" + encodeURIComponent(S.group) : "") + (S.sub ? "&unter=" + encodeURIComponent(S.sub) : "")); } catch (e) {}
    if (S.page !== "produkte" || S.step !== 1 || S.view) { S.view = ""; S.page = "produkte"; S.step = 1; }
    render(); window.scrollTo({ top: 0 });
  }
  // Schritt 2: Ausführung
  // Farbfelder: Hex je Farbname (Print.com liefert nur Namen/Produktfotos), englische Namen auf Deutsch
  var COLORS = {"natur": "#efe6d2", "schwarz": "#111111", "rot": "#d7262e", "weiß": "#ffffff", "himmelblau": "#7ec8f2", "rosa": "#f7b6c8", "gelb": "#ffd800", "orange": "#f57c1f", "apfelgrün": "#8cc63f", "lavendel": "#b9a6dc", "blattgrün": "#3a9a3e", "mittelblau": "#2e6fbf", "türkis": "#1fb5b0", "limettengrün": "#b5d334", "kornblumenblau": "#5a7fd6", "nachtblau": "#1b2a4a", "knallgelb": "#ffe500", "hellgrün": "#8fd16b", "knallgrün": "#29c43a", "königsblau": "#1f4fb5", "wildtaube": "#a59c94", "köningsflieder": "#b38fc9", "kakaobraun": "#6b4430", "aquamarin": "#5fd3c4", "babyrosa": "#f9cfdc", "babyblau": "#a9d2f0", "blau": "#1f5fbf", "karamell": "#c0813f", "grün": "#2e9a47", "karibikblau": "#1aa0c8", "marineblau": "#1d2a4d", "pfirsichfarbenes rouge": "#f2a68a", "palisanderholz": "#6d2e2a", "violett": "#6f3aa8", "matt kristallklar": "#e8eef2", "metallic gold": "#c9a54a", "metallic silber": "#bfc3c7", "metallic schwarz": "#2a2a2e", "metallic perle": "#efe9df", "kirschrot": "#b3122c", "lila metallic": "#8b4fb3", "metallic grün": "#2f8f4e", "metallic fuchsie": "#c8237f", "metallic blau": "#2a5db8", "metallic pink": "#ea5aa0", "metallic hellblau": "#7fb8e6", "metallic hellgrün": "#8fcf6a", "metallic lavendel": "#b9a3d8", "metallic königsblau": "#2245a8", "metallic knall orange": "#f26a1b", "metallic limettengrün": "#b2d23a", "metallic roségold": "#d6a08c", "metallic türkis": "#2bb3b1", "metallisch graphit": "#4a4c50", "silber": "#c0c4c8", "azure blue": "#2f9fe0", "bottle green": "#145a3c", "brick red": "#a8352b", "burgund": "#6d1a2c", "classic olive": "#5d6136", "deep navy": "#141d33", "fuchsie": "#d0287f", "grau meliert": "#a4a6a8", "kellygrün": "#1f9a4a", "light graphite": "#6a6d72", "navy": "#1f2a44", "lila": "#7b4bb0", "royal blue": "#1f4fb5", "sunflower": "#ffc423", "anthrazit": "#3a3d42", "blaues eis": "#cfe5f2", "flaschengrün": "#145a3c", "hellblau": "#9fcbee", "leuchtendes orange": "#ff7a1a", "weinrot": "#6e1a2a", "butter": "#f6e7a6", "canyon-rosa": "#d99a86", "baumwoll rosa": "#f4c9d2", "desert braun": "#a07b5a", "dunkelgrau meliert": "#55585c", "dämmerung": "#8a8fb0", "meliert": "#a4a6a8", "fiesta": "#f15a3a", "grün werden": "#5f9a5a", "heritage braun": "#6a4a36", "india ink grau": "#4a4f57", "khaki": "#a99a6c", "natürlich roh": "#efe6d2", "ozeanblau": "#1d6f9e", "salbei": "#a7b59a", "spectra gelb": "#ffe14a", "stiel grün": "#5b8a3a", "türkise monstera": "#2b8a83", "vintage weiß": "#f3efe6", "blue ice": "#cfe5f2", "cream": "#f5eedb", "dusk": "#8a8fb0", "mindful blue": "#4f6f9c", "misty jade": "#a9c9b7", "natural raw": "#efe6d2", "pink joy": "#f2a7c3", "stone": "#cfc6b6", "holzkohle": "#3c3c3e", "cherry red": "#b3122c", "daisy": "#ffd84a", "forest green": "#244a2e", "light_blue": "#9fcbee", "royal": "#1f4fb5", "sand": "#d8c7a3", "sapphire": "#1a74b8", "sport grey": "#9b9ea2", "farbmix luftballon": "conic-gradient(#e63946 0 25%,#ffd60a 0 50%,#2a9d8f 0 75%,#1f4fb5 0)", "farbmix metallic luftballon": "conic-gradient(#c9a54a 0 25%,#bfc3c7 0 50%,#c8237f 0 75%,#2a5db8 0)"}, COLOR_DE = {"azure blue": "Azurblau", "bottle green": "Flaschengrün", "brick red": "Ziegelrot", "classic olive": "Oliv", "deep navy": "Dunkles Marineblau", "light graphite": "Hellgraphit", "navy": "Marineblau", "royal blue": "Royalblau", "sunflower": "Sonnenblumengelb", "blue ice": "Eisblau", "cream": "Creme", "dusk": "Dämmerung", "mindful blue": "Taubenblau", "misty jade": "Jadegrün", "natural raw": "Natur roh", "pink joy": "Pink", "stone": "Stein", "cherry red": "Kirschrot", "daisy": "Gänseblümchengelb", "forest green": "Waldgrün", "light_blue": "Hellblau", "royal": "Royalblau", "sand": "Sand", "sapphire": "Saphirblau", "sport grey": "Sportgrau", "köningsflieder": "Königsflieder", "grün werden": "Frühlingsgrün", "lila metallic": "Metallic Lila"};
  var colKey = function (n) { return String(n || "").trim().toLowerCase(); };
  var colHex = function (o) { return o.color || COLORS[colKey(o.name)] || ""; };
  var colName = function (n) { return COLOR_DE[colKey(n)] || String(n || "").trim().replace(/_/g, " "); };
  function swatches(name, opts, cur, dis, pr) {
    var all = opts, more = 0; if (opts.length > 14 && !(S.swAll || {})[name]) { var ci = opts.findIndex(function (o) { return String(o.slug) === String(cur); }); opts = opts.slice(0, 12); if (ci >= 12) opts.push(all[ci]); more = all.length - opts.length; }
    return '<div class="ps-sws" role="radiogroup" aria-label="' + esc(pr ? pr.title : "Farbe") + '">' + opts.map(function (o) { var hx = colHex(o), nm = colName(o.name), best = pr && isBest(pr, o.slug), lt = /^#(f|e)[0-9a-f]/i.test(hx) || /^#ff[e-f]/i.test(hx);
      var face = hx ? '<i style="background:' + esc(hx) + '"' + (lt ? ' class="lt"' : "") + "></i>" : imgOk(o.img) ? '<i class="im"><img src="' + esc(o.img) + '" alt="" loading="lazy"></i>' : "<i></i>";
      return '<label class="ps-sw' + (/metallic|metallisch|gold|silber|perle/i.test(o.name) ? " met" : "") + '" title="' + esc(nm) + '"><input type="radio" name="' + esc(name) + '" value="' + esc(o.slug) + '"' + (String(cur) === String(o.slug) ? " checked" : "") + (dis && dis[o.slug] ? " disabled" : "") + ' aria-label="' + esc(nm) + '"><span>' + face + (best ? '<b class="st" aria-hidden="true">★</b>' : "") + "</span><small>" + esc(nm) + "</small></label>"; }).join("") + (more ? '<button type="button" class="ps-swmore" data-swall="' + esc(name) + '">+' + more + " weitere Farben</button>" : "") + "</div>";
  }
  function chips(name, opts, cur, dis) {
    return '<div class="ps-chips" role="radiogroup">' + opts.map(function (o) { var vis = imgOk(o.img) ? '<img src="' + esc(o.img) + '" alt="" loading="lazy">' : o.color ? '<i class="sw" style="background:' + esc(o.color) + '"></i>' : "";
      return '<label class="ps-chip' + (vis ? " vis" : "") + '"' + (o.desc ? ' title="' + esc(o.desc) + '"' : "") + '><input type="radio" name="' + esc(name) + '" value="' + esc(o.slug) + '"' + (String(cur) === String(o.slug) ? " checked" : "") + (dis && dis[o.slug] ? " disabled" : "") + "><span>" + vis + esc(o.name) + "</span></label>"; }).join("") + "</div>";
  }
  // Häufige Bannergrößen als Schnellwahl (cm), nur was das Produkt erlaubt
  var DIMS = [[100, 50], [150, 50], [200, 50], [200, 100], [250, 100], [300, 100], [400, 100], [300, 150], [300, 200], [500, 100]];
  function dimChips() {
    var C = S.prod.custom; if (C.unit !== "cm") return "";
    var ok = DIMS.filter(function (d) { var w = d[0] * 10, h = d[1] * 10; return w >= C.minW && w <= C.maxW && h >= C.minH && h <= C.maxH; }); if (ok.length < 3) return "";
    return '<div class="ps-dimchips" role="group" aria-label="Häufige Größen">' + ok.map(function (d) { var on = +S.custom.w === d[0] && +S.custom.h === d[1];
      return '<button type="button" class="ps-dimc' + (on ? " on" : "") + '" data-dim="' + d[0] + "x" + d[1] + '" aria-pressed="' + on + '">' + d[0] + " × " + d[1] + "</button>"; }).join("") + "</div>";
  }
  function customHtml() {
    var C = S.prod.custom, cm = C.unit === "cm", f = cm ? 10 : 1, u = C.unit;
    return dimChips() + '<div class="ps-row2 ps-dims"><div class="ps-field"><label for="psW">Breite (' + u + ')</label><input id="psW" type="number" inputmode="decimal" min="' + Math.min(C.minW, C.minH) / f + '" max="' + Math.max(C.maxW, C.maxH) / f + '" step="' + (cm ? 1 : 1) + '" value="' + esc(S.custom.w) + '"></div>' +
      '<div class="ps-field"><label for="psH">Höhe (' + u + ')</label><input id="psH" type="number" inputmode="decimal" min="' + Math.min(C.minW, C.minH) / f + '" max="' + Math.max(C.maxW, C.maxH) / f + '" step="1" value="' + esc(S.custom.h) + '"></div><button type="button" class="ps-dimswap" data-dimswap="1" aria-label="Breite und Höhe tauschen" title="Hoch-/Querformat tauschen">⇄</button></div>' +
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
    if (/color/.test(pr.slug) && opts.some(function (o) { return colHex(o) || imgOk(o.img); })) return '<div class="ps-tile wide ps-coltile"><span class="ps-tl">' + esc(pr.title) + (cur ? ": <b>" + esc(colName(cur.name)) + "</b>" : "") + '<span class="pd-muted"> · ' + opts.length + " Farben</span></span>" + swatches("prop:" + pr.slug, opts, S.sel[pr.slug], dis, pr) + "</div>";
    var best = cur && isBest(pr, cur.slug), its = propItems(pr), nseg = its.length >= 3 && its.length <= 4;
    return '<div class="ps-tile' + (nseg ? " seg" : "") + (best ? " best" : "") + (S.dd === "prop:" + pr.slug ? " open" + (its.length > 12 ? " wide" : "") : "") + '"><span class="ps-tl">' + esc(pr.title) + (best ? ' <span class="ps-bb">★ Bestseller</span>' : "") + (cur && (cur.desc || imgOk(cur.img) || glossOf(pr, cur)) ? '<button type="button" class="ps-i sm" data-ddinfo="prop:' + esc(pr.slug) + "|" + esc(cur.slug) + '" aria-label="Infos zu ' + esc(cur.name) + '" aria-haspopup="dialog">i</button>' : "") + "</span>" + ddHtml("prop:" + pr.slug, pr.title, its, S.sel[pr.slug]) +
      (cur && cur.desc ? '<span class="ps-td">' + esc(String(cur.desc).slice(0, 160)) + "</span>" : "") + morePc(its.more) + "</div>";
  }
  function sec(title, inner, extra) { return inner || extra ? '<section class="ps-sec"><h3>' + esc(title) + "</h3>" + (inner ? '<div class="ps-grid2">' + inner + "</div>" : "") + (extra || "") + "</section>" : ""; }
  function sectionsHtml(p) {
    var props = p.props.filter(function (pr) { return propVisible(pr); }), inS = function (l) { return props.filter(function (pr) { return l.indexOf(pr.slug) > -1; }); };
    var fmt = inS(SECT_FORMAT), mat = inS(SECT_MAT), rest = props.filter(function (pr) { return fmt.indexOf(pr) < 0 && mat.indexOf(pr) < 0; });
    var isNone = function (pr) { var d = (p.defaults || {})[pr.slug], o = pr.options.filter(function (x) { return x.slug === d; })[0]; return o && NONE_RX.test(String(o.name).trim()); };
    var keep = function (pr) { return pr.slug === "finish" || !isNone(pr); };   // Veredelung immer sichtbar
    var main = rest.filter(keep), minor = rest.filter(function (pr) { return !keep(pr); }), changed = minor.filter(function (pr) { return S.sel[pr.slug] !== (p.defaults || {})[pr.slug]; }).length;
    var tiles = function (l) { return l.map(tileHtml).join(""); };
    var more = minor.length ? '<details class="ps-more"' + (changed ? " open" : "") + "><summary>Weitere Optionen <span>" + esc(minor.map(function (pr) { return pr.title; }).join(", ")) + "</span>" + (changed ? ' <b class="ps-cnt">' + changed + " gewählt</b>" : "") + '</summary><div class="ps-grid2">' + tiles(minor) + "</div></details>" : "";
    var custom = (p.kind === "banner" && p.custom) || (fmt.some(function (pr) { return pr.slug === "size"; }) && isCustom()) ? customHtml() : "";
    var pmT = pmTile();
    return sec("Format", tiles(fmt), custom) + sec("Material & Druck", tiles(mat) + pmT) + (main.length || more ? '<section class="ps-sec"><h3>Veredelung &amp; Optionen</h3>' + (main.length ? '<div class="ps-grid2">' + tiles(main) + "</div>" : "") + more + "</section>" : "");
  }
  // Druckverfahren (Digital/Offset/…): Preise je Verfahren vom Server, günstigstes zuerst; „automatisch“ nimmt immer das günstigste
  function pmTile() {
    var m = S.price && S.price.methods; if (!m || m.length < 2) return '<div data-pmtile hidden></div>';
    var co = S.ctype === "company", amt = function (x) { return eur(co ? x.net : x.gross); }, cheapest = m[0];
    var auto = (S.pm || "auto") === "auto" ? m.filter(function (x) { return x.pm === S.price.pm; })[0] || cheapest : m.filter(function (x) { return x.pm === "offset"; })[0] || cheapest;   // „automatisch“ = was der Server gerade gewählt hat
    var items = [{ val: "auto", name: "Automatisch: " + auto.name, best: true, sub: (auto.pm === "offset" ? "Offsetdruck – hier am günstigsten bzw. gleichauf" : "günstigstes Verfahren für diese Auflage") + " · " + amt(auto) }].concat(m.map(function (x, i) { return { val: x.pm, name: x.name, sub: amt(x) + (i === 0 ? " · günstigstes" : " · +" + eur((co ? x.net - cheapest.net : x.gross - cheapest.gross))), desc: PM_INFO[x.pm] || "" }; }));
    var cur = S.pm || "auto", isAuto = cur === "auto";
    var fell = !isAuto && S.price.pm && S.price.pm !== cur;   // gewähltes Verfahren bei dieser Auswahl nicht möglich (z. B. Offset-Mindestmenge) → automatisch umgestellt
    if (fell) return '<div data-pmtile class="ps-tile warn' + (items.length <= 4 ? " seg" : "") + (S.dd === "pm" ? " open" : "") + '"><span class="ps-tl">Druckverfahren</span>' + ddHtml("pm", "Druckverfahren", items, S.price.pm) + '<span class="ps-td" style="color:#ffb340">' + esc((m.filter(function (x) { return x.pm === cur; })[0] ? "" : ({ offset: "Offset", digital: "Digitaldruck" }[cur] || cur) + " ist bei dieser Auflage nicht möglich – automatisch auf " + (m.filter(function (x) { return x.pm === S.price.pm; })[0] || {}).name + " umgestellt.")) + "</span></div>";
    return '<div data-pmtile class="ps-tile' + (items.length <= 4 ? " seg" : "") + (isAuto ? " best" : "") + (S.dd === "pm" ? " open" : "") + '"><span class="ps-tl">Druckverfahren' + (isAuto ? ' <span class="ps-bb">★ empfohlen</span>' : "") + "</span>" + ddHtml("pm", "Druckverfahren", items, cur) + '<span class="ps-td">' + esc(PM_INFO[S.price.pm] || "") + "</span></div>";
  }
  var PM_INFO = { digital: "Ideal für kleine Auflagen und schnelle Lieferung – ohne Einrichtekosten.", offset: "Ab mittleren Auflagen meist deutlich günstiger, sehr gleichmäßige Farben.", inkjet: "Moderner Inkjet-Digitaldruck – gestochen scharf, bei manchen Ausführungen (z. B. mit Kaschierung) am günstigsten.", digital_uv: "UV-härtende Tinte, direkt auf das Material gedruckt.", screen_printing: "Kräftige, langlebige Farben – ideal für Textilien und Werbeartikel.", sublimation: "Farbe geht ins Material über – waschfest und dauerhaft." };
  function amountHtml(p) {
    var bt = bestTiers(p), inT = p.tiers.indexOf(S.copies) > -1;
    var qi = (inT ? [] : [{ val: S.copies, name: (+S.copies).toLocaleString("de-AT") + " Stk. (eigene Menge)" }]).concat(p.tiers.map(function (n) { return { val: n, name: n.toLocaleString("de-AT") + " Stk.", best: bt.indexOf(n) > -1 }; }));
    var sel = ddHtml("copies", "Auflage", qi, S.copies);
    var own = "";
    if (p.qty && p.qty.length) { var r = [].concat.apply([], p.qty.map(function (x) { return x.ranges; })), mn = Math.min.apply(null, r.map(function (g) { return g.min; })), mx = Math.max.apply(null, r.map(function (g) { return g.max; }));
      own = '<label class="ps-own"><span>oder eigene Menge</span><input id="psQty" class="ps-sel" type="number" inputmode="numeric" min="' + mn + '" max="' + mx + '" value="' + (inT ? "" : S.copies) + '" placeholder="' + mn + "–" + mx.toLocaleString("de-AT") + ' Stk."></label>'; }
    var ur = urTile(p);
    return '<section class="ps-sec"><h3>Auflage &amp; Lieferung</h3><div class="ps-grid2"><div class="ps-tile' + (bt.indexOf(S.copies) > -1 ? " best" : "") + (S.dd === "copies" ? " open" : "") + '"><span class="ps-tl">Auflage' + (bt.indexOf(S.copies) > -1 ? ' <span class="ps-bb">★ Bestseller</span>' : "") + "</span>" + sel + own + "</div>" + ur + motHtml() + "</div></section>";
  }
  // Produktion: Schnell/Express nur zeigen, wenn sie wirklich früher liefern als eine günstigere Stufe (Termine kommen über /print/api/deltas)
  var UR_ORD = ["standard", "quick", "urgent"];
  function urState() {
    var p = S.prod, b = dlBase(), D = {}, all = !!b;
    p.urgency.forEach(function (u) { var dt = u.slug === S.urgency ? S.price && S.price.deliveryDate : b && (DLT[b + "|@u|" + u.slug] || {}).date; if (dt) D[u.slug] = dt; else all = false; });
    var hid = [];
    if (all) p.urgency.forEach(function (u) { var i = UR_ORD.indexOf(u.slug); if (i > 0 && UR_ORD.slice(0, i).some(function (c) { return D[c] && D[c] <= D[u.slug]; })) hid.push(u.slug); });
    else if (S.urLast && S.urLast.key === p.key) hid = S.urLast.hid.filter(function (x) { return x !== S.urgency; });   // bis die neuen Termine da sind: letzte Einschätzung
    if (all) S.urLast = { key: p.key, hid: hid };
    return { D: D, hid: hid, all: all };
  }
  function urTile(p) {
    if (kind() === "textile" || p.urgency.length < 2) return "";
    var st = urState(), vis = p.urgency.filter(function (u) { return st.hid.indexOf(u.slug) < 0; }), nm = function (sl) { return (p.urgency.filter(function (u) { return u.slug === sl; })[0] || {}).name || sl; };
    if (vis.length === 1) return '<div class="ps-tile" data-urtile><span class="ps-tl">Produktion</span><div class="ps-uronly"><b>' + esc(vis[0].name) + "</b>" + (st.D[vis[0].slug] ? "<span>Lieferung voraussichtlich " + esc(deDate(st.D[vis[0].slug])) + "</span>" : "") + "</div>" +
      '<span class="ps-td">Eine schnellere Produktion (' + esc(st.hid.map(nm).join(" oder ")) + ") gibt es für diese Ausführung nicht – " + esc(vis[0].name) + " ist hier bereits der früheste Liefertermin.</span></div>";
    return '<div class="ps-tile seg' + (S.urgency === "standard" ? " best" : "") + '" data-urtile><span class="ps-tl">Produktion' + (S.urgency === "standard" ? ' <span class="ps-bb">★ Bestseller</span>' : "") + "</span>" +
      ddHtml("urgency", "Produktion", vis.map(function (u) { return { val: u.slug, name: u.name, best: u.slug === "standard", sub: st.D[u.slug] ? "" : { quick: "schneller als Standard", standard: "bestes Preis-Leistungs-Verhältnis", urgent: "so schnell wie möglich" }[u.slug] || "" }; }), S.urgency) +   // sobald Termine da sind: Termin + Aufpreis statt Untertitel
      '<span class="ps-td">' + (st.hid.length ? esc(st.hid.map(nm).join(" und ")) + " bringt hier keinen früheren Liefertermin und ist deshalb ausgeblendet." : "Bestimmt den Liefertermin.") + "</span></div>";
  }
  // Neue Termine da: Kachel aktualisieren; gewählte Stufe ohne früheren Termin → automatisch auf die günstigere mit gleichem Termin
  function urRefresh() {
    if (S.step !== 2 || !S.prod) return; var st = urState();
    if (st.all && st.hid.indexOf(S.urgency) > -1) { var cur = st.D[S.urgency], to = UR_ORD.filter(function (c) { return st.D[c] && st.D[c] <= cur; })[0];
      if (to && to !== S.urgency) { var from = S.urgency; S.urgency = to; toast("„" + ((S.prod.urgency.filter(function (u) { return u.slug === from; })[0] || {}).name || from) + "“ bringt hier keinen früheren Liefertermin – wir haben die günstigere Produktion gewählt."); render(); loadPrice(); return; } }
    var el = root.querySelector("[data-urtile]"); if (!el || S.dd === "urgency") return; var h = urTile(S.prod); if (el.outerHTML === h) return;
    var tmp = document.createElement("div"); tmp.innerHTML = h; if (tmp.firstChild) { el.replaceWith(tmp.firstChild); fillRows(); dlPaint(); }
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
    var grpS = [], gOf = function (n) { var m = String(n).match(/^(Herren|Damen|Unisexe?|Kinder|Kids|Baby)\s+(.*)$/i); return m ? [m[1].replace(/^unisexe$/i, "Unisex"), m[2]] : ["", n]; };
    p.sizes.forEach(function (x) { var g = gOf(x.name), G = grpS.filter(function (y) { return y.n === g[0]; })[0]; if (!G) { G = { n: g[0], l: [] }; grpS.push(G); } G.l.push({ slug: x.slug, short: g[1] }); });
    var sz = '<fieldset class="ps-opt"><legend>Größen &amp; Stückzahl</legend>' + grpS.map(function (G) { return (G.n ? '<p class="ps-szg">' + esc(G.n) + "</p>" : "") + '<div class="ps-sizes">' + G.l.map(function (x) { var v = t.sizes[x.slug] || 0;
      return '<div class="ps-size' + (v ? " on" : "") + '"><span class="sz">' + esc(x.short) + '</span><div class="ps-step"><button type="button" data-tstep="' + esc(x.slug) + '|-1" aria-label="' + esc(G.n + " " + x.short) + ' weniger">−</button><input type="number" inputmode="numeric" min="0" max="5000" data-tsize="' + esc(x.slug) + '" value="' + (v || "") + '" placeholder="0" aria-label="' + esc(G.n + " " + x.short) + ' Stück"><button type="button" data-tstep="' + esc(x.slug) + '|1" aria-label="' + esc(G.n + " " + x.short) + ' mehr">+</button></div></div>'; }).join("") + "</div>"; }).join("") +
      '<p class="ps-help">Gesamt: <b id="psTexTotal">' + totalCopies().toLocaleString("de-AT") + " Stk.</b>" + (m.min > 1 ? " · " + esc(m.label.replace(/ \(.*$/, "")) + " ab " + m.min + " Stück" : "") + " · Der Preis hängt nicht von der Größe ab.</p></fieldset>";
    return meth + pos + sz;
  }
  // Warenkorb/Kasse: Hinweise zur Datei als Pop-up (automatische Prüfung beim Hochladen + Hinweise aus der Vorschau)
  function warnPop(id) {
    var x = S.cart.filter(function (c) { return c.id === id; })[0]; if (!x) return; var back = document.activeElement;
    var L = (x.checks || []).map(function (c) { return [c.level, c.text]; }).concat((x.clientWarn || []).map(function (t) { return ["warn", t]; }));
    var m = document.createElement("div"); m.className = "ps-pop"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Hinweise zur Datei");
    m.innerHTML = '<div class="ps-pop-c ps-warnpop"><div class="ps-pop-b"><span class="ps-pop-k">' + esc(x.title) + " · " + esc(x.fileName || "Druckdatei") + "</span><h3>Hinweise zur Datei</h3>" +
      (L.length ? '<ul class="ps-wl">' + L.map(function (w) { return '<li class="' + (w[0] === "error" ? "e" : "w") + '"><span aria-hidden="true">' + (w[0] === "error" ? "✕" : "⚠") + "</span><span>" + esc(w[1]) + "</span></li>"; }).join("") + "</ul>"
        : "<p>Bei der automatischen Prüfung gab es Hinweise zu dieser Datei. Öffne das Druck-PDF und kontrolliere Format, Ränder und Bildqualität.</p>") +
      '<p class="pd-muted">Das sind Hinweise, keine Fehler, die eine Bestellung verhindern. Du kannst so bestellen, die Datei ersetzen (Position entfernen und neu hochladen) oder an der Kasse den Profi-Datencheck wählen – dann sehen wir sie uns vor dem Druck persönlich an.</p>' +
      '<div class="ps-pop-a">' + (x.fileId ? '<a class="ps-btn primary" target="_blank" rel="noopener" href="/print/api/file/' + esc(x.fileId) + "?t=" + esc(x.fileToken) + '&pdf=1">Druck-PDF ansehen</a>' : "") + '<button type="button" class="ps-btn" data-popx="1">Schließen</button></div></div><button type="button" class="ps-pop-x" data-popx="1" aria-label="Schließen">×</button></div>';
    var close = function () { m.remove(); document.removeEventListener("keydown", k0); if (back && back.focus) back.focus(); }, k0 = function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-popx]")) close(); });
    document.addEventListener("keydown", k0); document.body.appendChild(m); var f = m.querySelector("[data-popx]"); if (f) f.focus();
  }
  // „Wir gestalten für dich“: Pop-up mit aktueller Konfiguration, Briefing-Text, Dateien und Kontakt → Anfrage an FS Creative (statt Kontaktformular)
  function briefPop() {
    var p = S.prod; if (!p) return; var back = document.activeElement, files = [], me = S.me || {}, cu = S.customer || {}, t0 = Date.now();
    var pr = S.price, co = S.ctype === "company", priceTxt = pr ? eur(co ? pr.net : pr.gross) + (co ? " netto" : " inkl. USt") : "";
    var labels = (pr && pr.labels && pr.labels.length ? pr.labels : p.props.map(function (x) { return [x.title, labelOf(x.slug)]; })).filter(function (l) { return l && l[1]; });
    var link = ""; try { link = cfgLink(p.key, cfgPack()); } catch (e) {}
    var val = function (k) { return esc(cu[k] || me[k] || ""); };
    var m = document.createElement("div"); m.className = "ps-pop"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Gestaltung anfragen");
    m.innerHTML = '<div class="ps-pop-c ps-brief"><div class="ps-pop-b"><span class="ps-pop-k">Wir gestalten für dich</span><h3>Gestaltung anfragen</h3><p>Sag uns kurz, was drauf soll – wir melden uns mit Entwurf und Angebot. Gedruckt wird erst nach deiner Freigabe.</p>' +
      '<div class="ps-brief-cfg"><b>' + esc(p.title) + " · " + totalCopies().toLocaleString("de-AT") + " Stk.</b><span>" + esc(labels.map(function (l) { return l[1]; }).join(" · ")) + "</span>" + (priceTxt ? "<span>Druckpreis laut Konfiguration: " + esc(priceTxt) + " (Gestaltung nach Angebot)</span>" : "") + "</div>" +
      '<label class="ps-bf"><span>Was soll gestaltet werden? *</span><textarea id="bfText" rows="5" maxlength="4000" placeholder="z. B. Anlass, Texte, Stil, Farben, was dir wichtig ist …"></textarea></label>' +
      '<div class="ps-bf"><span>Dateien (optional) – Logo, Fotos, Texte · max. 5 Dateien à 15 MB</span><label class="ps-drop small ps-bfdrop"><input type="file" id="bfFiles" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.svg,.ai,.eps,.psd,.tif,.tiff,.zip,.doc,.docx,.txt,.rtf,.odt"><b>Dateien auswählen oder hierher ziehen</b></label><ul class="ps-bfl" id="bfList"></ul></div>' +
      '<div class="ps-bf2"><label class="ps-bf"><span>Name *</span><input id="bfName" autocomplete="name" value="' + esc([cu.firstName || me.firstName, cu.lastName || me.lastName].filter(Boolean).join(" ")) + '"></label><label class="ps-bf"><span>E-Mail *</span><input id="bfMail" type="email" autocomplete="email" value="' + val("email") + '"></label>' +
      '<label class="ps-bf"><span>Telefon</span><input id="bfTel" type="tel" autocomplete="tel" value="' + val("phone") + '"></label><label class="ps-bf"><span>Firma / Verein</span><input id="bfCo" autocomplete="organization" value="' + val("company") + '"></label></div>' +
      '<input type="text" id="bfHp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">' +
      '<label class="ps-cb"><input type="checkbox" id="bfOk"><span>Ich bin einverstanden, dass FS Creative meine Angaben und Dateien zur Bearbeitung dieser Anfrage speichert (<a href="/datenschutz" target="_blank" rel="noopener">Datenschutz</a>).</span></label>' +
      '<p class="ps-err" id="bfErr" hidden></p><div class="ps-pop-a"><button type="button" class="ps-btn primary" id="bfSend">Anfrage senden</button><button type="button" class="ps-btn" data-popx="1">Abbrechen</button></div></div>' +
      '<button type="button" class="ps-pop-x" data-popx="1" aria-label="Schließen">×</button></div>';
    var q = function (id) { return m.querySelector("#" + id); }, err = function (t) { var e = q("bfErr"); if (!e) return; e.textContent = t || ""; e.hidden = !t; };
    var list = function () { q("bfList").innerHTML = files.map(function (f, i) { return "<li><span>📎 " + esc(f.name) + " <small>" + Math.max(1, Math.round(f.size / 1024)).toLocaleString("de-AT") + ' KB</small></span><button type="button" class="ps-link" data-bfdel="' + i + '">Entfernen</button></li>'; }).join(""); };
    var add = function (fl) { [].forEach.call(fl || [], function (f) { if (files.length >= 5) { err("Maximal 5 Dateien."); return; } if (f.size > 15 * 1024 * 1024) { err("„" + f.name + "“ ist größer als 15 MB."); return; } files.push(f); }); list(); };
    var close = function () { m.remove(); document.removeEventListener("keydown", k0); if (back && back.focus) back.focus(); }, k0 = function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-popx]")) { close(); return; } var d = e.target.closest("[data-bfdel]"); if (d) { files.splice(+d.getAttribute("data-bfdel"), 1); list(); } });
    m.addEventListener("change", function (e) { if (e.target.id === "bfFiles") { err(""); add(e.target.files); e.target.value = ""; } });
    var dz = m.querySelector(".ps-bfdrop"); ["dragover", "drop"].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); if (ev === "drop") { err(""); add(e.dataTransfer && e.dataTransfer.files); } }); });
    var up = function (f) { return new Promise(function (ok, no) { var x = new XMLHttpRequest(); x.open("POST", "/print/api/brief/file"); x.setRequestHeader("X-Print-Shop", "1"); x.setRequestHeader("Content-Type", "application/octet-stream"); x.setRequestHeader("X-File-Name", encodeURIComponent(f.name));
      x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} if (j && j.ok) ok(j); else no(new Error((j && j.error) || "Upload fehlgeschlagen")); }; x.onerror = function () { no(new Error("Keine Verbindung")); }; x.send(f); }); };
    q("bfSend").addEventListener("click", function () {
      var b = this, text = q("bfText").value.trim(), name = q("bfName").value.trim(), mail = q("bfMail").value.trim();
      if (!text && !files.length) { err("Bitte kurz beschreiben, was gestaltet werden soll."); q("bfText").focus(); return; }
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { err("Bitte Name und eine gültige E-Mail-Adresse angeben."); return; }
      if (!q("bfOk").checked) { err("Bitte die Einwilligung zum Datenschutz bestätigen."); return; }
      err(""); b.disabled = true; var done = [], i = 0;
      var next = function () { if (i >= files.length) return send(); b.textContent = "Datei " + (i + 1) + " von " + files.length + " wird hochgeladen …"; up(files[i]).then(function (j) { done.push({ id: j.id, token: j.token }); i++; next(); }).catch(function (e) { b.disabled = false; b.textContent = "Anfrage senden"; err(e.message); }); };
      var send = function () { b.textContent = "Wird gesendet …";
        api("/print/api/brief", { name: name, email: mail, phone: q("bfTel").value.trim(), company: q("bfCo").value.trim(), text: text, consent: true, website: q("bfHp").value, t: t0, files: done,
          cfg: { product: p.key, title: p.title, copies: totalCopies(), price: priceTxt, labels: labels.slice(0, 14), link: link } }).then(function (j) {
          if (!j.ok) { b.disabled = false; b.textContent = "Anfrage senden"; err(j.error || "Konnte nicht gesendet werden."); return; }
          m.querySelector(".ps-pop-b").innerHTML = '<span class="ps-pop-k">Wir gestalten für dich</span><h3>Danke, ' + esc(name.split(" ")[0]) + '! 🎉</h3><p>Deine Anfrage für ' + esc(p.title) + " ist bei uns angekommen" + (done.length ? " – samt " + done.length + (done.length === 1 ? " Datei" : " Dateien") : "") + ". Wir melden uns in der Regel innerhalb von 1–2 Werktagen mit Entwurf und Angebot an " + esc(mail) + '.</p><div class="ps-pop-a"><button type="button" class="ps-btn primary" data-popx="1">Schließen</button></div>';
        }).catch(function () { b.disabled = false; b.textContent = "Anfrage senden"; err("Keine Verbindung – bitte erneut versuchen."); }); };
      next();
    });
    document.addEventListener("keydown", k0); document.body.appendChild(m); var tf = q("bfText"); if (tf) tf.focus();
  }
  function galImgs(p) { var im = (p.images || []).filter(imgOk); if (!im.length && imgOk(p.img)) im = [p.img]; return im; }
  function galleryHtml(p) {
    var im = galImgs(p); if (!im.length) return "";
    var i = Math.min(S.gal, im.length - 1);
    return '<div class="ps-gal"><div class="main"><img src="' + esc(im[i]) + '" alt="' + esc(p.title) + '" data-galzoom="1"><button type="button" class="ps-gal-z" data-galzoom="1" aria-label="Bild vergrößern" title="Vergrößern">⤢</button>' + (im.length > 1 ? '<span class="ps-gal-n">' + (i + 1) + " / " + im.length + "</span>" : "") + "</div>" + (im.length > 1 ? '<div class="th">' + im.map(function (u, k) { return '<button type="button" data-gal="' + k + '" aria-label="Bild ' + (k + 1) + '" aria-pressed="' + (k === i) + '"><img src="' + esc(u.replace(/w=\d+/, "w=160")) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>" : "") + "</div>";
  }
  // Großansicht der Produktbilder: Klick aufs Bild, Pfeile/Wischen zum Blättern, Esc oder Klick daneben schließt
  function galPop(i) {
    var p = S.prod, im = p ? galImgs(p) : []; if (!im.length) return; var k = Math.max(0, Math.min(i || 0, im.length - 1)), back = document.activeElement;
    var m = document.createElement("div"); m.className = "ps-lb"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", p.title + " – Bilder");
    var draw = function () { m.innerHTML = '<img src="' + esc(String(im[k]).replace(/w=\d+/, "w=1800")) + '" alt="' + esc(p.title + " – Bild " + (k + 1)) + '">' +
      (im.length > 1 ? '<button type="button" class="ps-lb-n p" data-lb="-1" aria-label="Vorheriges Bild">‹</button><button type="button" class="ps-lb-n n" data-lb="1" aria-label="Nächstes Bild">›</button><span class="ps-lb-c">' + (k + 1) + " / " + im.length + "</span>" : "") +
      '<button type="button" class="ps-lb-x" aria-label="Schließen">×</button>'; var x = m.querySelector(".ps-lb-x"); if (x) x.focus(); };
    var go = function (d) { k = (k + d + im.length) % im.length; draw(); };
    var close = function () { m.remove(); document.removeEventListener("keydown", key); document.documentElement.classList.remove("ps-noscroll"); if (back && back.focus) back.focus(); };
    var key = function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "ArrowLeft" && im.length > 1) go(-1); else if (e.key === "ArrowRight" && im.length > 1) go(1); };
    m.addEventListener("click", function (e) { var b = e.target.closest("[data-lb]"); if (b) { go(+b.getAttribute("data-lb")); return; } if (e.target === m || e.target.closest(".ps-lb-x")) close(); });
    var x0 = null; m.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    m.addEventListener("touchend", function (e) { if (x0 == null || im.length < 2) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); });
    document.addEventListener("keydown", key); document.documentElement.classList.add("ps-noscroll"); document.body.appendChild(m); draw();
  }
  function aboutHtml(p) {
    var t = txt(p.about) || (/\n/.test(String(p.summary || "")) ? txt(p.summary) : "") || (/\n/.test(String(p.desc || "")) ? txt(p.desc) : ""); if (!t && !p.summary) return "";
    var lines = t.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), bul = lines.filter(function (x) { return /^[-*•]/.test(x); });
    var body = (lines.filter(function (x) { return !/^[-*•]/.test(x); }).map(function (x) { return "<p>" + esc(x.replace(/[#*_]+/g, "")) + "</p>"; }).join("")) + (bul.length ? "<ul>" + bul.map(function (x) { return "<li>" + esc(x.replace(/^[-*•]\s*/, "").replace(/[#*_]+/g, "")) + "</li>"; }).join("") + "</ul>" : "");
    return '<details class="ps-about"' + (bul.length && bul.length <= 6 && window.innerWidth > 760 ? " open" : "") + "><summary>Produktinfos" + (p.summary && lead(p.summary) && lead(p.summary).length < 50 && lead(p.summary).toLowerCase() !== String(p.title).toLowerCase() ? " · " + esc(lead(p.summary)) : "") + "</summary>" + body + "</details>";
  }
  // ── Technische Daten: Format, Material, Druck, fest vorgegebene Ausstattung (z. B. Ösen, Druckverfahren) + Einsatz/Beständigkeit je Material ──
  function fmtSize(w, h) { if (Math.max(w, h) < 1000) return mmF(w) + " × " + mmF(h) + " mm"; var big = Math.max(w, h) >= 10000, u = function (v) { return big && v >= 1000 ? String(Math.round(v / 10) / 100).replace(".", ",") + " m" : String(Math.round(v) / 10).replace(".", ",") + " cm"; }; return u(w) + " × " + u(h); }
  var USE = [   // [Muster im Material/Produkt, Einsatz, Eigenschaften] – erste passende Regel gilt
    [/vlies|non.?woven|recyban/i, "Außen, für Events und Aktionen", "Leicht, PVC-frei und recycelbar; wetterfest für Veranstaltungen und Saisonaktionen – nicht für den jahrelangen Dauereinsatz gedacht"],
    [/mesh|gitter|netz/i, "Außen", "Winddurchlässig dank feiner Löcher – für Gerüste, Bauzäune und windige Standorte; wetterfest und reißfest"],
    [/blockout/i, "Innen & außen", "Lichtundurchlässig – auch beidseitig bedruckt scheint nichts durch; wetterfest und reißfest"],
    [/backlit|citylight/i, "Leuchtkästen & Schaufenster", "Für Hinterleuchtung gemacht – Farben leuchten gleichmäßig"],
    [/frontlit|\bpvc\b|plane/i, "Außen", "Wetterfest, reißfest und UV-beständig – der Standard für Banner im Freien"],
    [/pes|polyester|textil|stoff|fahne|flag/i, "Innen & außen", "Knitterarm, leicht und edel in der Optik – für Messen, Rahmen und Beachflags"],
    [/blueback/i, "Außen auf Plakatwänden", "Blickdichte blaue Rückseite – zum Kleistern auf Plakatwände; Papier, daher nur begrenzt witterungsbeständig"],
    [/yupo|teslin|synaps|reißfest|reissfest|synthet|polyart/i, "Innen & außen", "Wasser- und reißfest – hält Regen, Fett und Knicke aus"],
    [/vinyl|folie|foil/i, "Innen & außen", "Wasserfest und robust; Haltbarkeit draußen je nach Untergrund und Witterung"],
    [/forex|hartschaum|dibond|alu|acryl|plexi|kapa|wabe|karton.?platte/i, "Innen (je nach Platte auch außen)", "Formstabile Platte – direkt aufstellbar oder montierbar"],
    [/papier|paper|bilderdruck|gesatineerd|silk|offset|recycl|karton|board|biotop|recystar|bankpost|\d{2,3}\s*g/i, "Innenbereich", "Papier ist nicht wetterfest – draußen nur kurzzeitig oder geschützt (z. B. hinter Glas)", 1]   // nur ab A4 (Plakate) – bei Visitenkarten & Co. selbstverständlich
  ];
  var BAG_RX = /tasche|beutel|\bbags?\b|tote|rucksack|shopper/i;
  // Produktgröße (z. B. Tasche „43 × 18 × 35 cm“): eigenes Feld vom Server, sonst Größen-Angabe aus den Produktdaten – immer getrennt von der Druckfläche
  function prodSize(p) {
    if (p.sizeLabel && /\d/.test(p.sizeLabel)) return p.sizeLabel.replace(/\s*[x*]\s*/g, " × ");
    var s = (p.specs || []).filter(function (x) { return x[2] === "size" && /\d/.test(x[1]); })[0]; if (!s) return "";
    var t = /\(([^)]*)\)/.exec(s[0]); return s[1].replace(/\s*[x*]\s*/g, " × ") + (t && /x|×/.test(t[1]) ? " (" + t[1].replace(/\s*x\s*/g, " × ") + ")" : "");
  }
  function prodMm(p) { var t = prodSize(p).replace(/,/g, "."), m = /(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)(?:\s*×\s*(\d+(?:\.\d+)?))?\s*(mm|cm)?/.exec(t); if (!m) return null; var f = m[4] === "mm" ? 1 : 10; return { w: +m[1] * f, h: +(m[3] || m[2]) * f }; }   // B × T × H → Ansicht B × H
  function specRows(p) {
    var rows = [], sp = p.props.filter(function (x) { return x.slug === "size"; })[0], sz = sizeOf(), specs = p.specs || [], hasDims = !sp && sz;
    var psz = prodSize(p);
    if (sp && sz && !isCustom()) rows.push(["Format", labelOf("size") + (/\d\s*[x×]\s*\d/.test(labelOf("size")) ? "" : " · " + fmtSize(sz.w, sz.h))]);
    else if (sz && p.dimsArea) { if (psz) rows.push(["Produktgröße", psz]); rows.push(["Druckfläche", "max. " + fmtSize(sz.w, sz.h)]); }
    else if (sz) rows.push([isCustom() || p.kind === "banner" ? "Format (gewählt)" : "Endformat", fmtSize(sz.w, sz.h)]);
    var mat = labelOf("material") || (specs.filter(function (x) { return x[2] === "material"; })[0] || [])[1] || "";
    specs.forEach(function (x) { if (x[2] === "size" && (hasDims || psz)) return; rows.push([x[0].replace(/\s*\(.*\)$/, ""), x[1]]); });
    var u = null; [mat, labelOf("color_material"), p.title + " " + (p.desc || "")].some(function (hay) { if (!hay) return false; for (var i = 0; i < USE.length; i++) if (USE[i][0].test(hay)) { u = USE[i]; return true; } return false; });   // Material zuerst, dann Produkt
    if (u && u[3] && !(sz && Math.max(sz.w, sz.h) >= 290)) u = null;
    if (u && p.kind !== "textile" && p.kind !== "promo" && !BAG_RX.test(p.title + " " + (p.cat && p.cat.subName || ""))) { rows.push(["Einsatz", u[1]]); rows.push(["Beständigkeit", u[2]]); }
    var fin = labelOf("finish"); if (fin && /kaschier|lamin|cellophan/i.test(fin)) rows.push(["Schutz", "Folienkaschierung schützt vor Feuchtigkeit, Kratzern und Abrieb"]);
    return rows;
  }
  function specsHtml(p) {
    var tx = kind() === "textile" || kind() === "promo";   // Textil/Werbeartikel: nur Marke, Material & Co. (Größen/Druck wählt man unten)
    var rows = tx ? (p.specs || []).filter(function (x) { return !/^(size|printtype|quality_level|color.*|textile_sizes)$/.test(x[2]) && !/^variabel$/i.test(x[1]); }).map(function (x) { return [x[0].replace(/\s*\(.*\)$/, ""), x[1]]; }) : specRows(p);
    if (tx) { var ps = prodSize(p), la = logoPositions(); rows = (ps ? [["Produktgröße", ps]] : []).concat(la.length && la[0].area ? [[la.length > 1 ? "Druckflächen" : "Druckfläche", la.map(function (x) { return (la.length > 1 ? x.title + ": " : "max. ") + x.area[0] + " × " + x.area[1] + " mm"; }).join(" · ")]] : [], rows); }
    if (rows.length < (tx ? 1 : 2)) return "";
    return '<details class="ps-specs"' + (window.innerWidth > 760 || !p.props.length ? " open" : "") + '><summary>Technische Daten</summary><dl>' + rows.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl></details>";
  }
  // ── Schnellauswahl: drei fertige Pakete (Beliebt / Günstig / Hochwertig) – ein Klick, darunter weiterhin die volle Auswahl ──
  var PRE = {};
  function presetsOf(p) {
    if (kind() !== "flat" || !S.presetBase) return [];
    var prop = function (sl) { return p.props.filter(function (x) { return x.slug === sl; })[0]; }, mat = prop("material"), fin = prop("finish"), base = S.presetBase;
    if (!mat) return [];
    var gr = function (o) { return +((String(o.name).match(/(\d{2,4})\s*g/) || [])[1] || 0); }, ob = function (sl) { return mat.options.filter(function (o) { return o.slug === sl; })[0] || {}; };
    var coated = mat.options.filter(function (o) { return /gesatineerd|silk/.test(o.slug) && gr(o) >= 90; }), g0 = gr(ob(base.material)) || 135;
    var ok = function (sel) { return !excluded(sel); }, mk = function (o) { return Object.assign({}, base, o); };
    // Günstig: Kandidaten (leichtere bzw. gleich schwere Papiere) – gewählt wird nach echtem Preis
    var cheap = [];   // bewusst kein „Günstig“-Paket: nur Beliebt und Hochwertig
    // Hochwertig: schwereres mattes Papier + matte Folie, sonst Rückfall-Varianten
    var lams = fin ? fin.options.filter(function (o) { return /matt/.test(o.slug) && /lamination/.test(o.slug); }).sort(function (a, b) { return (/^double/.test(b.slug) === (base.printtype === "44")) - (/^double/.test(a.slug) === (base.printtype === "44")); }) : [];
    var heav = coated.filter(function (o) { return /silk/.test(o.slug) && gr(o) > g0; }).sort(function (a, b) { return Math.abs(gr(a) - g0 * 1.35) - Math.abs(gr(b) - g0 * 1.35); });
    var prem = []; heav.slice(0, 3).forEach(function (h) { lams.slice(0, 2).forEach(function (l) { prem.push(mk({ material: h.slug, finish: l.slug })); }); }); lams.slice(0, 2).forEach(function (l) { prem.push(mk({ finish: l.slug })); }); heav.slice(0, 2).forEach(function (h) { prem.push(mk({ material: h.slug })); });
    prem = prem.filter(ok)[0];
    return { base: mk({}), cheap: cheap, prem: prem, fin: fin };
  }
  function presetHtml(p) {
    var P = presetsOf(p); if (!P || !P.base) return "";
    var co = S.ctype === "company", key = function (sel) { return JSON.stringify([sel, S.copies, S.urgency, S.ctype, S.pm || "auto"]); }, price = function (sel) { return PRE[key(sel)]; };
    var desc = function (sel) { return [optName("material", sel.material)].concat(sel.finish && P.fin ? [optName("finish", sel.finish)] : []).filter(function (t) { return t && !NONE_RX.test(t); }).join(" · "); };
    var isOn = function (sel) { return Object.keys(sel).every(function (k) { return String(S.sel[k]) === String(sel[k]); }); };
    var bp = price(P.base), cheapSel = null;
    if (bp) P.cheap.forEach(function (c) { var cp = price(c); if (cp && cp.gross < bp.gross - 0.5 && (!cheapSel || cp.gross < price(cheapSel).gross)) cheapSel = c; });
    var lite = mobLite(), l = [{ id: "beliebt", name: "Beliebt", icon: "★", sel: P.base }].concat(P.prem && !lite ? [{ id: "premium", name: "Hochwertig", icon: "◆", sel: P.prem }] : []);
    window.__presets = l;
    var todo = [P.base].concat(P.cheap, P.prem ? [P.prem] : []).filter(function (sel) { return !(key(sel) in PRE); });
    if (todo.length) setTimeout(function () { var left = todo.length; todo.forEach(function (sel) { var k = key(sel); PRE[k] = null;
      api("/print/api/price", Object.assign(cfgOf(), { sel: sel, country: S.customer.country || S.country, zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "" })).then(function (j) { PRE[k] = j.ok ? j.price : false; }).catch(function () { PRE[k] = false; }).then(function () {
        if (--left) return; var box = document.getElementById("psPre"); if (box && S.step === 2) box.outerHTML = presetHtml(S.prod); }); }); }, 0);
    if (l.length < 2 && !lite && !todo.length) return "";
    return '<section class="ps-sec ps-pre" id="psPre"><h3>Schnellauswahl <span class="pd-muted">· ein Klick, alles passend eingestellt</span></h3><div class="ps-pres">' + l.map(function (x) { var pr = price(x.sel), on = isOn(x.sel);
      return '<button type="button" class="ps-preb' + (on ? " on" : "") + '" data-preset="' + x.id + '" aria-pressed="' + on + '"><span class="pi" aria-hidden="true">' + x.icon + '</span><b>' + esc(x.name) + "</b><small>" + esc(desc(x.sel)) + '</small><span class="pp">' + (pr ? eur(co ? pr.net : pr.gross) : pr === false ? "–" : '<span class="ps-spin"></span>') + "</span>" + (on ? '<span class="ck">✓ gewählt</span>' : "") + "</button>"; }).join("") + (lite ? '<div class="ps-preb ps-prepc"><span class="pi" aria-hidden="true">🖥️</span><b>Weitere Optionen</b><small>Alle Papiere, Formate und Veredelungen findest du am PC.</small><button type="button" class="ps-link" data-act="moball">Hier alle zeigen</button></div>' : "") + "</div>" +
      '<p class="ps-pre-more">' + (lite ? "Unten siehst du die beliebtesten Optionen – Format, Papier, Veredelung und Auflage." : "Oder unten alles selbst einstellen – Format, Papier, Veredelung und Auflage.") + "</p></section>";
  }
  function vOptions() {
    var p = S.prod, v = selValues(), k = kind();
    var props = presetHtml(p) + sectionsHtml(p), cust = "";
    var amount = k === "textile" ? '<section class="ps-sec"><h3>Druck &amp; Größen</h3>' + textileHtml(p) + "</section>" : amountHtml(p);
    var area = k === "flat" && p.dimsArea && sizeOf() ? '<p class="ps-help ps-info">' + (prodSize(p) ? "Produktgröße " + esc(prodSize(p)) + " · " : "") + "Druckfläche max. " + fmtSize(sizeOf().w, sizeOf().h) + " · deine Datei wird automatisch eingepasst.</p>" : k === "promo" ? (function () { var a = logoPositions()[0].area; var ps = prodSize(p); return '<p class="ps-help ps-info">' + (ps ? "Produktgröße " + esc(ps) + " · " : "") + "Druckfläche max. " + a[0] + " × " + a[1] + " mm · dein Logo wird mittig platziert · jede Datei wird automatisch geprüft.</p>"; })() : "";
    var ur = k === "textile" && p.urgency.length > 1 ? '<fieldset class="ps-opt"><legend>Produktion</legend>' + chips("urgency", p.urgency, S.urgency) + "</fieldset>" : "";
    var who = '<fieldset class="ps-opt"><legend>Preise anzeigen für</legend><div class="ps-who"><div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-ctype="private" aria-pressed="' + (S.ctype === "private") + '">Privat</button><button type="button" data-ctype="company" aria-pressed="' + (S.ctype === "company") + '">Firma</button></div>' +
      '<select class="ps-sel" data-country aria-label="Lieferland">' + S.cat.countries.map(function (c) { return '<option value="' + c.code + '"' + ((S.customer.country || "AT") === c.code ? " selected" : "") + ">Lieferung nach " + esc(c.name) + "</option>"; }).join("") + "</select></div></fieldset>";
    var crumbs = p.cat ? '<p class="ps-crumb">' + esc(p.cat.mainName || "") + (p.cat.subName ? " › " + esc(p.cat.subName) : "") + "</p>" : "";
    return '<div class="ps-layout"><div class="ps-panel">' + crumbs + '<div class="ps-head">' + galleryHtml(p) + '<div class="ps-head-t"><h2>' + esc(p.title) + '</h2>' + (facts(p).length ? '<ul class="ps-facts">' + facts(p).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + '<p class="sub">' + esc(badDesc(p) ? "" : lead(p.desc) || "Der Preis aktualisiert sich bei jeder Änderung.") + "</p>" + aboutHtml(p) + specsHtml(p) + cfgBarHtml() + "</div></div>" + cust + props + area + amount + ur + who + (isLogo() ? "" : selInfoHtml(p)) +
      '<div class="ps-nav"><button type="button" class="ps-btn" data-go="1">Zurück</button><button type="button" class="ps-btn primary" id="psNext2" data-act="next2">' + (isLogo() ? "Weiter zum Logo" : "Weiter zur Gestaltung") + "</button></div></div>" +
      '<aside class="ps-price" id="psPrice" aria-live="polite"></aside></div>';
  }
  // Druckvorlage (PDF) für genau diese Ausführung: Endformat, Beschnitt, Sicherheitsabstand, Falzlinien
  function tplUrl() {
    var c = { sel: S.sel, copies: S.copies }; if (isCustom()) c.custom = S.custom;
    return "/print/api/template?dl=1&product=" + encodeURIComponent(S.prod.key) + "&c=" + encodeURIComponent(JSON.stringify(c));
  }
  function tplBtn(cls) {
    var p = S.prod; if (!p || p.kind === "textile" || p.kind === "promo" || (!sizeOf() && !(S.sel.fold && FOLD_RX.test(S.sel.fold)))) return "";
    var f = S.price && S.price.folds;
    return '<a class="ps-tpl' + (cls ? " " + cls : "") + '" href="' + esc(tplUrl()) + '" download><span class="ic" aria-hidden="true">📐</span><span><b>Druckvorlage herunterladen (PDF)</b><small>Für InDesign, Illustrator, Affinity, Canva &amp; Co. – mit Beschnitt, Sicherheitsabstand' + (f ? " und Falzlinien" : "") + ", passend zu deiner Auswahl.</small></span><span class=\"dl\" aria-hidden=\"true\">↓</span></a>";
  }
  // Druckdaten-Anforderungen für genau diese Ausführung: Skizze (Beschnitt, Endformat, Sicherheitsabstand, Falz) + Checkliste + Profi-Details
  function mmF(v) { return String(Math.round(v * 10) / 10).replace(".", ","); }
  // Technische Sonderfarben (Palette /print/sonderfarben.ase): Name → [Anzeigefarbe nur zur Unterscheidung, Bedeutung]
  var SPOTS = {"White":["#00ffff","Weißdruck"],"Kisscut":["#ff0000","Anschnitt (Kiss-Cut)"],"Thrucut":["#ff00ff","Konturschnitt (durch)"],"Insidecut":["#800080","Innenschnitt"],"Vcut":["#00ff00","V-Schnitt"],"Perforation":["#ffff00","Perforation"],"Creasing":["#ff8000","Rillung"],"Score":["#80ff00","Ritzlinie"],"Drilling":["#0000ff","Bohrlöcher"],"Numbering":["#000000","Nummerierung"],"Scodix Spot":["#00ffff","Partieller Glanzlack"],"Scodix Sense 40":["#0080ff","3D-Lack 40 µm"],"Scodix Sense 80":["#008080","3D-Lack 80 µm"],"Scodix Foil Gold":["#ffff00","Folie Gold"],"Scodix Foil Silver":["#cccccc","Folie Silber"],"Scodix Foil Copper":["#e36678","Folie Kupfer"],"Scodix Foil Rose":["#ffb200","Folie Roségold"],"Scodix Foil Glitter":["#ff0000","Folie Glitzer"],"Scodix Foil Rainbow":["#00ff00","Folie Regenbogen"],"Cold Foil":["#00ff80","Kaltfolie"]};
  function spotChip(n) { var x = SPOTS[n]; return '<span class="ps-spot"><i style="background:' + (x ? x[0] : "#888") + '"></i>' + esc(n) + "</span>"; }
  // Welche Sonderfarben braucht die Druckdatei für genau diese Ausführung? → [[Name, Erklärung], …]
  function spotNeeds() {
    var p = S.prod, v = Object.assign({}, p.fixed || {}, S.sel), out = [], none = /^(none|no|nee|geen|ohne|without|clean_cut|no_.*)$/;
    var add = function (n, t) { if (!out.some(function (x) { return x[0] === n; })) out.push([n, t]); };
    Object.keys(v).forEach(function (k) { var x = String(v[k] == null ? "" : v[k]).toLowerCase(); if (!x || none.test(x)) return;
      if (/^printtype/.test(k) && /white/.test(x)) add("White", "Weiß wird nur dort gedruckt, wo du Flächen in „White“ anlegst – z. B. unter Farbflächen und Logos");
      if (/kiss_?cut/.test(x)) add("Kisscut", "Schnittkontur als geschlossene Linie um jedes Motiv – nur die Folie wird geschnitten");
      else if (/die_?cut|thru_?cut/.test(x)) add("Thrucut", "Schnittkontur als geschlossene Linie – hier wird komplett durchgeschnitten");
      if (/^perforation/.test(k)) add("Perforation", "Lage der Perforationslinie(n) als gerade Linie einzeichnen");
      if (/drill/.test(k)) add("Drilling", "Bohrlöcher als Kreis in Originalgröße an die gewünschte Stelle setzen");
      if (/numbering/.test(k)) add("Numbering", "Feld für die fortlaufende Nummer als Rechteck markieren");
      if (/cold_?foil/.test(x)) add("Cold Foil", "Flächen für die Kaltfolie anlegen");
      else if (/foil/.test(x) && /spot|scodix|gold|silver|copper|rose|rainbow|glitter/.test(x)) { var fo = /silver/.test(x) ? "Silver" : /copper/.test(x) ? "Copper" : /rose/.test(x) ? "Rose" : /rainbow/.test(x) ? "Rainbow" : /glitter/.test(x) ? "Glitter" : "Gold"; add("Scodix Foil " + fo, "Flächen für die Folienveredelung anlegen"); }
      if (/spot_?uv|spot_?varnish|scodix_?spot/.test(x)) add("Scodix Spot", "Flächen, die glänzend lackiert werden");
      if (/sense|3d_?(varnish|lak|lack)|raised/.test(x)) add(/80/.test(x) ? "Scodix Sense 80" : "Scodix Sense 40", "Flächen für den erhabenen 3D-Lack");
    });
    return out;
  }
  function spotItem() {
    var need = spotNeeds(), pms = /pantone/i.test(labelOf("printtype") || "") || /pms/.test(String(S.sel.printtype || ""));
    if (!need.length && !pms) return null;
    return ["🎯", "Sonderfarben", (need.length ? "Deine Ausführung braucht in der Datei: " + need.map(function (x) { return '<span class="ps-spotr">' + spotChip(x[0]) + " " + esc(x[1]) + "</span>"; }).join("") +
      " Als <b>Volltonfarbe mit genau diesem Namen</b> anlegen, 100 %, auf Überdrucken, am besten auf eigener Ebene. " : "") +
      (pms ? "Pantone-Farben als <b>Volltonfarbe mit exaktem Namen</b> anlegen (z. B. PANTONE 286 C) – nicht in CMYK umwandeln. " : "") +
      '<a href="/print/sonderfarben.ase" download>Farbpalette laden (.ase)</a> · <a href="/print/hilfe#sonderfarben" target="_blank" rel="noopener">alle Sonderfarben erklärt</a>'];
  }
  function reqSketch(sz, b, safe, f) {
    var W = 200, H = Math.round(W * sz.h / sz.w); if (H > 250) { H = 250; W = Math.round(H * sz.w / sz.h); } if (H < 70) H = 70;
    var pb = 9, ps = 13, VW = W + 2 * pb, VH = H + 2 * pb, lines = "";
    if (f) { (f.x || []).forEach(function (x) { var xx = pb + x / sz.w * W; lines += '<line x1="' + xx + '" y1="' + (pb - 4) + '" x2="' + xx + '" y2="' + (pb + H + 4) + '" class="fo"/>'; });
      (f.y || []).forEach(function (y) { var yy = pb + y / sz.h * H; lines += '<line x1="' + (pb - 4) + '" y1="' + yy + '" x2="' + (pb + W + 4) + '" y2="' + yy + '" class="fo"/>'; }); }
    return '<svg class="ps-req-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="Skizze: Beschnitt, Endformat und Sicherheitsabstand">' +
      (b ? '<rect x="0.75" y="0.75" width="' + (VW - 1.5) + '" height="' + (VH - 1.5) + '" rx="3" class="bl"/>' : "") +
      '<rect x="' + pb + '" y="' + pb + '" width="' + W + '" height="' + H + '" class="tr"/>' +
      '<rect x="' + (pb + ps) + '" y="' + (pb + ps) + '" width="' + Math.max(10, W - 2 * ps) + '" height="' + Math.max(10, H - 2 * ps) + '" rx="2" class="sa"/>' + lines +
      '<g class="tx"><rect x="' + (pb + ps + 8) + '" y="' + (pb + ps + 10) + '" width="' + Math.min(70, W - 2 * ps - 16) + '" height="6" rx="3"/><rect x="' + (pb + ps + 8) + '" y="' + (pb + ps + 22) + '" width="' + Math.min(110, W - 2 * ps - 16) + '" height="4" rx="2"/><rect x="' + (pb + ps + 8) + '" y="' + (pb + ps + 31) + '" width="' + Math.min(90, W - 2 * ps - 16) + '" height="4" rx="2"/></g></svg>';
  }
  function reqHtml(open) {
    var p = S.prod, sz = sizeOf(), sd = sides(), b = (S.price && S.price.bleed != null) ? +S.price.bleed : +p.bleed || 0, safe = +p.safe || 3, dpi = p.dpi || 300, f = S.price && S.price.folds, cl = f && S.price.closed, big = p.kind === "banner" || dpi < 200;
    if (!sz) return "";
    var fileW = sz.w + 2 * b, fileH = sz.h + 2 * b, unit = function (v) { return big && v >= 1000 ? mmF(v / 10) + " cm" : mmF(v) + " mm"; };
    var pgN = pagesNeeded(), pagesTxt = pgN ? "<b>" + pgN + " Seiten in einer PDF</b> (inkl. Umschlag) – Einzelseiten in Leserichtung, keine Doppelseiten: Seite 1 = Titel, Seite " + pgN + " = Rückseite; leere Seiten bitte mitzählen"
      : sd === 2 ? (f ? "Seite 1 = Außenseite, Seite 2 = Innenseite" : "Seite 1 = Vorderseite, Seite 2 = Rückseite") + " – beide in einer PDF" : "1 Seite";
    var items = [
      ["📏", "Dateiformat", "<b>" + unit(fileW) + " × " + unit(fileH) + "</b> – Endformat " + unit(sz.w) + " × " + unit(sz.h) + (b ? " plus " + mmF(b) + " mm Beschnitt je Seite" : " (ohne Beschnitt)") + (cl ? "; gefalzt " + mmF(cl.w) + " × " + mmF(cl.h) + " mm" : "")],
      ["🛡️", "Sicherheitsabstand", "Texte, Logos und wichtige Inhalte mindestens <b>" + mmF(safe) + " mm</b> vom Rand des Endformats entfernt" + (p.kind === "banner" ? " – im Randbereich sitzen Saum und Ösen" : "")],
      ["🖼️", "Auflösung", "Bilder mit mindestens <b>" + dpi + " dpi</b> in Endgröße" + (big ? " (für Großformat genügt das, aus der Entfernung gesehen)" : "") + "; Logos und Texte am besten als Vektor"],
      ["📄", "Seiten", pagesTxt],
      ["🎨", "Farben", "<b>CMYK</b> anlegen – RGB-Dateien werden beim Druck umgerechnet, leuchtende Bildschirmfarben wirken dann etwas ruhiger"],
      ["🔤", "Schriften", "In der PDF <b>einbetten</b> oder in Pfade umwandeln; Schriftgröße ab " + (big ? "20 pt" : "6 pt") + ", feine Linien ab 0,25 pt"],
      ["📦", "Datei", "<b>PDF</b> (am besten PDF/X-4), alternativ JPG/PNG · max. 50 MB · keine Schnittmarken"]
    ];
    var spi = spotItem(); if (spi) items.splice(5, 0, spi);
    if (Math.max(fileW, fileH) > 5000) items.splice(1, 0, ["🔎", "Maßstab", "So große Formate legst du am besten im <b>Maßstab 1:10</b> an (" + mmF(fileW / 10) + " × " + mmF(fileH / 10) + " mm inkl. Beschnitt) – Bilder dann mit " + dpi * 10 + " dpi"]);
    if (f) items.splice(2, 0, ["📐", "Falz", "Falzlinien laut Vorlage – keine Texte direkt auf die Falz legen, " + esc(f.name || "") + (f.note ? " · " + esc(f.note) : "")]);
    return '<details class="ps-req"' + (open ? " open" : "") + '><summary><span class="ic" aria-hidden="true">✓</span><span><b>Druckdaten-Anforderungen</b><small>' + esc(p.title) + " · " + unit(fileW) + " × " + unit(fileH) + " inkl. Beschnitt</small></span><i aria-hidden=\"true\">▾</i></summary>" +
      '<div class="ps-req-b"><figure class="ps-req-fig">' + reqSketch(sz, b, safe, f) + '<figcaption><span><i class="bl"></i>Beschnitt ' + (b ? mmF(b) + " mm" : "–") + '</span><span><i class="tr"></i>Endformat</span><span><i class="sa"></i>Sicherheitsabstand ' + mmF(safe) + " mm</span>" + (f ? '<span><i class="fo"></i>Falz</span>' : "") + "</figcaption></figure>" +
      '<ul class="ps-req-l">' + items.map(function (x) { return '<li><span class="ri" aria-hidden="true">' + x[0] + "</span><div><b>" + x[1] + "</b><span>" + x[2] + "</span></div></li>"; }).join("") + "</ul></div>" +
      '<details class="ps-req-pro"><summary>Für Profis</summary><ul><li>Farbprofil: ISO Coated v2 / PSO Coated v3 (Bogen), Gesamtfarbauftrag max. 300 %</li><li>Große schwarze Flächen als Tiefschwarz (z. B. 40/30/30/100), Text in reinem Schwarz (0/0/0/100)</li><li>Hintergründe und randabfallende Bilder immer bis in den Beschnitt ziehen</li><li>Transparenzen reduzieren bzw. PDF/X-4 verwenden, Überdrucken nur bewusst einsetzen</li><li>Technische Sonderfarben (Weiß, Konturschnitt, Perforation, Bohrung, Veredelung …): <a href="/print/sonderfarben.ase" download>Farbpalette (.ase)</a> für Illustrator, InDesign &amp; Affinity · <a href="/print/hilfe#sonderfarben" target="_blank" rel="noopener">Übersicht</a></li>' + (sd === 2 ? "<li>Vorder- und Rückseite gleich ausgerichtet (Kopf an Kopf)</li>" : "") + "</ul></details>" +
      tplBtn("soft") + '<p class="ps-req-f">Jede Datei prüfen wir beim Hochladen automatisch – du siehst sofort eine Vorschau mit allen Rändern. Unsicher? Wähle an der Kasse den Profi-Datencheck, dann sieht sich ein Profi deine Daten vor dem Druck persönlich an.</p></details>';
  }
  function logoReqHtml(pos) {
    return '<div class="ps-req ps-req-logo" ><div class="ps-req-b"><ul class="ps-req-l">' +
      '<li><span class="ri" aria-hidden="true">🖼️</span><div><b>Beste Qualität</b><span>Vektor-PDF oder <b>PNG mit transparentem Hintergrund</b>, mindestens 1000 px breit</span></div></li>' +
      '<li><span class="ri" aria-hidden="true">📏</span><div><b>Druckfläche</b><span>' + pos.map(function (x) { return esc(x.title) + " max. " + x.area[0] + " × " + x.area[1] + " mm"; }).join(" · ") + " – dein Logo wird proportional eingepasst und mittig platziert</span></div></li>" +
      '<li><span class="ri" aria-hidden="true">🎨</span><div><b>Farben</b><span>Kräftige, klare Farben; sehr feine Linien und Schrift unter 2 mm Höhe werden auf Textil bzw. kleinen Werbeartikeln unscharf</span></div></li>' +
      '<li><span class="ri" aria-hidden="true">✓</span><div><b>Kein Rahmen, kein Hintergrund</b><span>Nur das Logo selbst – weiße Flächen um das Logo werden sonst mitgedruckt</span></div></li></ul></div></div>';
  }
  // Schritt 3: Gestalten / Druckdatei (Drucksachen, Banner)
  function vDesign() {
    var p = S.prod, sz = sizeOf(), sd = sides(), b = (S.price && S.price.bleed != null) ? S.price.bleed : p.bleed;
    var cl = S.price && S.price.folds && S.price.closed;
    var spec = sz ? (cl ? "offen " : "") + sz.w + " × " + sz.h + " mm" + (cl ? ", gefalzt " + cl.w + " × " + cl.h + " mm" : "") + (b ? " (Datei mit Beschnitt " + (sz.w + 2 * b) + " × " + (sz.h + 2 * b) + " mm)" : "") : "";
    var mtabs = "";
    if (S.mot.n > 1 && motOk()) { motSave(); mtabs = '<div class="ps-mtabs" role="tablist" aria-label="Motive">' + S.mot.split.map(function (v, i) { var f = S.mot.files[i], done = f && f.file && !f.file.blocked;
      return '<button type="button" role="tab" data-moti="' + i + '" aria-selected="' + (i === S.mot.i) + '" class="' + (done ? "done" : "") + '"><b>Motiv ' + (i + 1) + "</b><small>" + v.toLocaleString("de-AT") + " Stk. · " + (done ? "✓ fertig" : "offen") + "</small></button>"; }).join("") + "</div>"; }
    var h = '<div class="ps-panel">' + mtabs + '<h2>' + (S.mot.n > 1 && motOk() ? "Motiv " + (S.mot.i + 1) + ": gestalten oder hochladen" : "Gestalten oder Datei hochladen") + '</h2><p class="sub">' + esc(p.title) + (spec ? (p.dimsArea ? (prodSize(p) ? " · Produkt " + esc(prodSize(p)) : "") + " · Druckfläche " : " · Endformat ") + esc(spec) : " · Format bitte laut Produktbeschreibung anlegen") + " · " + (pagesNeeded() ? pagesNeeded() + " Seiten (inkl. Umschlag)" : sd === 2 ? (p.key === "folder" ? "Außen- und Innenseite" : "Vorder- und Rückseite") : "einseitig") + "</p>";
    if (S.file) {
      h += '<div class="ps-file"><div><b>' + (S.file.kind === "design" ? "Deine Gestaltung" : esc(S.file.name)) + '</b><div class="pd-muted">' + (S.file.pages || "?") + " Seite(n) · " + (S.file.blocked ? "<span style=\"color:var(--ps-bad)\">bitte korrigieren</span>" : "bereit zum Druck") + '</div></div><div class="ps-row2" style="display:flex;gap:8px;flex-wrap:wrap">' +
        (S.file.kind === "design" ? '<button type="button" class="ps-btn small" data-act="editdesign">Weiter bearbeiten</button>' : "") +
        '<a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">PDF ansehen</a><button type="button" class="ps-btn small" data-act="clearfile">Andere Datei</button></div></div>' + qualHtml(S.file) + checksHtml(S.file.checks) + adjHtml(S.file) + bleedFixHtml(S.file) + pmkHtml() +
        '<div class="ps-pfv" id="psPfv" data-fid="' + esc(S.file.fileId) + '"><div class="ps-pfv-h"><b>Vorschau mit Druckrändern</b><label class="ps-cb sm"><input type="checkbox" id="psPfvT"' + (S.pfvOff ? "" : " checked") + '><span>Ränder anzeigen</span></label></div><div class="ps-pfv-c"><span class="ps-spin"></span> Vorschau wird erstellt …</div>' +
        '<ul class="ps-pfv-l"><li><i class="b"></i>Beschnitt – wird abgeschnitten, Hintergründe bis hierher ziehen</li><li><i class="t"></i>Endformat – hier wird geschnitten</li><li><i class="s"></i>Sicherheitsabstand – Texte &amp; Logos innerhalb halten</li>' + (S.price && S.price.folds ? '<li><i class="f"></i>Falzlinie – keine Texte direkt auf die Falz</li>' : "") + '</ul><div class="ps-pfv-w" id="psPfvW"></div></div>' + reqHtml(false);
      if (S.file.preflight && S.file.preflight.status === "PROCESSING") h += '<p class="pd-muted" style="margin-top:8px"><span class="ps-spin"></span> Die Datei wird zusätzlich geprüft …</p>';
    } else if (S.mode === "upload") {
      h += (p.designer && sz ? '<div class="ps-modesw" role="group" aria-label="Wie möchtest du gestalten?"><button type="button" data-act="mode:design">🎨 Online gestalten</button><button type="button" class="on" aria-pressed="true">⬆️ Datei hochladen</button></div>'
        : '<p class="ps-modeback"><button type="button" class="ps-link" data-act="mode:">← Zurück zur Auswahl</button></p>');
      h += '<label class="ps-drop" id="psDrop"><input type="file" id="psFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><span style="font-size:30px" aria-hidden="true">📄</span><b>Datei auswählen oder hierher ziehen</b><small>' + (sz ? "PDF (empfohlen), JPG oder PNG" : "Druckfertige PDF") + " · max. 50 MB" + (spec ? " · " + esc(spec) : "") + (pagesNeeded() ? " · " + pagesNeeded() + " Seiten als PDF" : sd === 2 ? " · 2 Seiten" : "") + '</small><div class="ps-prog" id="psProg" hidden><i></i></div></label><div id="psUpErr"></div>' + tplBtn() +
        reqHtml(true) + '<p class="ps-terms"><button type="button" class="ps-link" data-act="mode:">Zurück zur Auswahl</button></p>';
    } else {
      h += '<div class="ps-modes"><button type="button" class="ps-mode" data-act="mode:design"' + (p.designer && sz ? "" : " disabled") + '><span class="ic" aria-hidden="true">🎨</span><b>Online gestalten</b><span>' + (p.designer && sz ? "Nutze Vorlagen, designe selbst oder nutze gratis unsere KI – Beschnitt und Sicherheitsabstand sind eingezeichnet." : "Für dieses Produkt bitte eine Druckdatei hochladen.") + '</span></button>' +
        '<button type="button" class="ps-mode" data-act="mode:upload"><span class="ic" aria-hidden="true">⬆️</span><b>Druckdatei hochladen</b><span>Du hast schon eine fertige PDF (oder JPG/PNG)? Wir prüfen Format, Seiten und Auflösung automatisch.</span></button>' +
        '<button type="button" class="ps-mode ps-mode-agency" data-act="brief"><span class="ic" aria-hidden="true">🤝</span><b>Wir gestalten für dich</b><span>Keine Zeit oder keine Idee? Unser Team gestaltet deine ' + esc(p.title) + ' – du bekommst vorab einen Entwurf und ein Angebot.</span></button></div>' + (reqHtml(false) || tplBtn("soft"));
    }
    return '<div class="ps-layout">' + h + '<div class="ps-nav"><button type="button" class="ps-btn" data-go="2">Zurück zur Ausführung</button>' + (S.file && !S.file.blocked ? '<button type="button" class="ps-btn primary" data-act="next3">' + (S.mot.n > 1 && motOk() ? "Weiter" : "In den Warenkorb") + "</button>" : '<span class="ps-nav-hint">' + (S.file ? "Bitte die rot markierten Punkte korrigieren." : "Wähle oben, wie du deine Druckdaten erstellst.") + "</span>") + '</div></div><aside class="ps-price" id="psPrice" aria-live="polite"></aside></div>';
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
    return '<div class="ps-panel"><h2>Logo hochladen</h2><p class="sub">' + esc(S.prod.title) + " · " + (kind() === "textile" ? "ein Logo je Druckposition" : "Logo für die Druckfläche") + ". Das Logo wird automatisch geprüft und mittig in der Druckfläche platziert.</p>" + '<div class="ps-logos">' + slots + "</div>" + (Object.keys(S.logos || {}).length ? pmkHtml() : "") + (S.file ? "" : logoReqHtml(pos)) + merged +
      '<div class="ps-nav"><button type="button" class="ps-btn" data-go="2">Zurück</button><button type="button" class="ps-btn primary" data-act="next3"' + (S.file && !S.file.blocked ? "" : " disabled") + ">In den Warenkorb</button></div></div>";
  }
  // Qualitäts-Ampel aus den Prüfergebnissen
  function qualHtml(f) {
    var c = f.checks || [], e = c.filter(function (x) { return x.level === "error"; }).length, w = c.filter(function (x) { return x.level === "warn"; }).length + ((f.edgeWarn || []).length); if (f.edgeErr) e++;
    var st = e ? ["bad", "Bitte korrigieren", "Die Datei kann so nicht gedruckt werden – siehe rote Punkte."] : w ? ["warn", "Druckbar – mit Hinweisen", "Bitte die gelben Hinweise prüfen. Unsicher? Wähle an der Kasse den Profi-Datencheck."] : ["ok", "Druckfertig", "Format, Beschnitt und Auflösung passen."];
    return '<div class="ps-qual ' + st[0] + '"><i aria-hidden="true"></i><div><b>' + st[1] + "</b><span>" + st[2] + "</span></div></div>";
  }
  // Vorschau der Druckdatei (pdf.js) mit Beschnitt, Endformat und Sicherheitsabstand + Randanalyse (Inhalte zu nah am Rand, fehlender Beschnitt)
  var PDFJS = null, PFV = {};
  function pdfjs() { if (PDFJS) return PDFJS; PDFJS = new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); }; sc.onerror = function () { PDFJS = null; rej(new Error("pdf.js")); }; document.head.appendChild(sc); }); return PDFJS; }
  // Tiefenprüfung je Seite: effektive Bildauflösung (Platzierung aus dem Inhaltsstrom) und nicht eingebettete Schriften
  function pdfDeep(pg) {
    var O = window.pdfjsLib.OPS; return pg.getOperatorList().then(function (ol) {
      var ctm = [1, 0, 0, 1, 0, 0], st = [], imgs = [], fonts = {};
      var mul = function (m, c) { return [m[0] * c[0] + m[1] * c[2], m[0] * c[1] + m[1] * c[3], m[2] * c[0] + m[3] * c[2], m[2] * c[1] + m[3] * c[3], m[4] * c[0] + m[5] * c[2] + c[4], m[4] * c[1] + m[5] * c[3] + c[5]]; };
      for (var i = 0; i < ol.fnArray.length; i++) { var fn = ol.fnArray[i], a = ol.argsArray[i];
        if (fn === O.save) st.push(ctm.slice()); else if (fn === O.restore) ctm = st.pop() || [1, 0, 0, 1, 0, 0]; else if (fn === O.transform) ctm = mul(a, ctm);
        else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintJpegXObject) { var im = null; try { im = typeof a[0] === "string" ? (pg.objs.has(a[0]) ? pg.objs.get(a[0]) : pg.commonObjs.has(a[0]) ? pg.commonObjs.get(a[0]) : null) : a[0]; } catch (e) {}
          var wpt = Math.hypot(ctm[0], ctm[1]), hpt = Math.hypot(ctm[2], ctm[3]); if (im && im.width && wpt > 14 && hpt > 14) imgs.push(Math.round(Math.min(im.width / (wpt / 72), im.height / (hpt / 72)))); }
        else if (fn === O.setFont) { try { var f = pg.commonObjs.get(a[0]); if (f && f.missingFile) fonts[String(f.name || "").replace(/^[A-Z]{6}\+/, "")] = 1; } catch (e) {} } }
      return { imgs: imgs, fonts: Object.keys(fonts) };
    });
  }
  function pfvRender() {
    var box = document.getElementById("psPfv"); if (!box || !S.file) return; var f = S.file, key = f.fileId + (S.pfvOff ? ":0" : ":1"), c = box.querySelector(".ps-pfv-c");
    if (PFV[key]) { c.innerHTML = PFV[key].html; document.getElementById("psPfvW").innerHTML = PFV[key].warn; return; }
    var trim = f.size || sizeOf(), bleed = f.bleed != null ? f.bleed : (S.prod.bleed || 0), safe = S.prod.safe || 3;
    if (!trim) { c.textContent = ""; return; }
    pdfjs().then(function (L) { return L.getDocument({ url: "/print/api/file/" + encodeURIComponent(f.fileId) + "?t=" + encodeURIComponent(f.token) + "&pdf=1", withCredentials: true }).promise; }).then(function (doc) {
      var n = Math.min(doc.numPages, 2), jobs = []; for (var i = 1; i <= n; i++) jobs.push(doc.getPage(i));
      return Promise.all(jobs).then(function (pages) { return Promise.all(pages.map(function (pg) {
        var v0 = pg.getViewport({ scale: 1 }), wmm = v0.width / 72 * 25.4, b = Math.abs(wmm - (trim.w + 2 * bleed)) < 2 || Math.abs(wmm - (trim.h + 2 * bleed)) < 2 ? bleed : 0;
        var sc = Math.min(2, 560 / v0.width), vp = pg.getViewport({ scale: sc }), cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        return pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise.then(function () { return pdfDeep(pg).catch(function () { return {}; }); }).then(function (deep) { return { cv: cv, b: b, mmW: wmm, deep: deep }; }); })); });
    }).then(function (res) {
      var warns = [], okNotes = [], out = res.map(function (r, idx) {
        var cv = r.cv, x = cv.getContext("2d"), pxmm = cv.width / r.mmW, bp = r.b * pxmm, sp = (r.b + safe) * pxmm, W = cv.width, H = cv.height;
        // Randanalyse: Pixel zwischen Endformat und Sicherheitslinie, die deutlich vom typischen Randton abweichen
        try { var data = x.getImageData(0, 0, W, H).data, lab = res.length > 1 ? (idx ? "Rückseite" : "Vorderseite") + ": " : "";
          var px = function (xx, yy) { var o = (yy * W + xx) * 4; return [data[o], data[o + 1], data[o + 2]]; };
          var dist = function (a, b2) { return Math.abs(a[0] - b2[0]) + Math.abs(a[1] - b2[1]) + Math.abs(a[2] - b2[2]); };
          var b0 = Math.ceil(bp) + 1, s0 = Math.floor(sp) - 1, hit = 0, sideNames = [];
          // je Seite: Hintergrundton = Pixel direkt an der Endformatlinie (Median), dann jede Zeile/Spalte im Sicherheitsstreifen nach abweichenden Pixeln scannen
          [["links", function (k, d) { return [b0 + d, k]; }, H], ["rechts", function (k, d) { return [W - 1 - b0 - d, k]; }, H], ["oben", function (k, d) { return [k, b0 + d]; }, W], ["unten", function (k, d) { return [k, H - 1 - b0 - d]; }, W]].forEach(function (sd) {
            if (s0 <= b0) return; var ref = [], k, d; for (k = 0; k < sd[2]; k += 7) ref.push(px.apply(null, sd[1](k, 0)));
            var med = [0, 1, 2].map(function (c2) { var a = ref.map(function (p2) { return p2[c2]; }).sort(function (m, n2) { return m - n2; }); return a[a.length >> 1]; });
            var rows = 0; for (k = Math.round(sp); k < sd[2] - Math.round(sp); k++) { for (d = 0; d <= s0 - b0; d++) { var q = sd[1](k, d); if (dist(px(q[0], q[1]), med) > 120) { rows++; break; } } }
            if (rows / pxmm > 1.2) { hit++; sideNames.push(sd[0]); } });
          if (hit) warns.push(lab + "Inhalte liegen sehr nah am Rand (" + sideNames.join(", ") + ", im Sicherheitsabstand von " + safe + " mm) – Texte und Logos bitte weiter nach innen rücken, sonst können sie angeschnitten werden.");
          if (r.b > 0) { var wo = 0, ci = 0, tot = 0; for (var yy = Math.round(sp); yy < H - sp; yy += 5) { tot++; var o1 = px(Math.max(0, Math.round(bp * 0.4)), yy), i1 = px(Math.round(bp) + 2, yy); if (o1[0] > 245 && o1[1] > 245 && o1[2] > 245 && !(i1[0] > 245 && i1[1] > 245 && i1[2] > 245)) wo++; }
            if (tot && wo / tot > 0.4) warns.push(lab + "Der Hintergrund reicht nicht bis in den Beschnitt – nach dem Schneiden können weiße Ränder (Blitzer) entstehen."); }
        } catch (e) {}
        var dp = r.deep || {}, lab2 = res.length > 1 ? (idx ? "Rückseite" : "Vorderseite") + ": " : "";
        if (dp.imgs && dp.imgs.length) { var lo = Math.min.apply(null, dp.imgs); if (lo < 150) warns.push("!" + lab2 + "Ein Bild hat nur ca. " + lo + " dpi in Druckgröße – wird sichtbar unscharf. Bitte ein größeres Bild verwenden (empfohlen 300 dpi)."); else if (lo < 250) warns.push(lab2 + "Ein Bild hat nur ca. " + lo + " dpi in Druckgröße (empfohlen 300 dpi) – kann leicht unscharf wirken."); else okNotes.push(lab2 + dp.imgs.length + " Bild(er) mit ausreichender Auflösung (ab " + lo + " dpi)."); }
        if (dp.fonts && dp.fonts.length) warns.push(lab2 + "Schrift nicht eingebettet: " + dp.fonts.slice(0, 3).join(", ") + " – beim Export „Schriften einbetten“ aktivieren oder Text in Pfade umwandeln.");
        if (!S.pfvOff) { x.save(); x.fillStyle = "rgba(255,59,48,.28)"; if (bp > 0) { x.fillRect(0, 0, W, bp); x.fillRect(0, H - bp, W, bp); x.fillRect(0, bp, bp, H - 2 * bp); x.fillRect(W - bp, bp, bp, H - 2 * bp); }
          x.lineWidth = 1.5; x.strokeStyle = "#ff3b30"; x.setLineDash([]); if (bp > 0) x.strokeRect(bp, bp, W - 2 * bp, H - 2 * bp); else x.strokeRect(1, 1, W - 2, H - 2);
          x.strokeStyle = "#30d158"; x.setLineDash([6, 4]); x.strokeRect(sp, sp, W - 2 * sp, H - 2 * sp);
          var fo = S.price && S.price.folds; if (fo && trim.w === (S.price.size || {}).w) { x.strokeStyle = "#bf5af2"; x.lineWidth = 2; x.setLineDash([8, 5]);
            fo.x.forEach(function (fx) { var X = bp + (idx % 2 ? trim.w - fx : fx) * pxmm; x.beginPath(); x.moveTo(X, 0); x.lineTo(X, H); x.stroke(); });
            fo.y.forEach(function (fy) { var Y = bp + fy * pxmm; x.beginPath(); x.moveTo(0, Y); x.lineTo(W, Y); x.stroke(); }); }
          x.restore(); }
        var sn = S.price && S.price.folds ? (idx ? "Innenseite" : "Außenseite") : (idx ? "Rückseite" : "Vorderseite");
        return '<figure><img src="' + cv.toDataURL("image/png") + '" alt="Vorschau ' + sn + '"><figcaption>' + (res.length > 1 ? sn : "Seite 1") + (r.b ? "" : " · ohne Beschnitt") + "</figcaption></figure>"; });
      var html = '<div class="ps-pfv-g">' + out.join("") + "</div>", wh = warns.length ? '<ul class="ps-checks">' + warns.map(function (w) { return '<li class="' + (w[0] === "!" ? "error" : "warn") + '">' + esc(w.replace(/^!/, "")) + "</li>"; }).join("") + "</ul>" : '<ul class="ps-checks"><li class="ok">Randanalyse: keine Inhalte zu nah am Rand gefunden.</li></ul>';
      if (okNotes.length) wh += '<ul class="ps-checks">' + okNotes.map(function (w) { return '<li class="ok">' + esc(w) + "</li>"; }).join("") + "</ul>";
      PFV[key] = { html: html, warn: wh }; var b2 = document.getElementById("psPfv"); if (b2 && b2.getAttribute("data-fid") === f.fileId) { b2.querySelector(".ps-pfv-c").innerHTML = html; document.getElementById("psPfvW").innerHTML = wh; }
      if (warns.length && S.file === f) { f.edgeWarn = warns; f.edgeErr = warns.some(function (w) { return w[0] === "!"; }); var qb = document.querySelector(".ps-qual"); if (qb && !/bad/.test(qb.className)) { qb.className = "ps-qual " + (f.edgeErr ? "bad" : "warn"); qb.innerHTML = '<i aria-hidden="true"></i><div><b>' + (f.edgeErr ? "Bitte korrigieren" : "Druckbar – mit Hinweisen") + "</b><span>Die automatische Prüfung hat etwas gefunden – siehe Hinweise unter der Vorschau." + (f.edgeErr ? " So würde der Druck sichtbar schlechter aussehen." : "") + " Unsicher? Wähle an der Kasse den Profi-Datencheck.</span></div>"; }
        if (f.edgeErr) document.querySelectorAll('[data-act="next3"]').forEach(function (bt) { if (!/Trotzdem/.test(bt.textContent)) bt.textContent = "Trotzdem in den Warenkorb"; }); }
    }).catch(function () { var b3 = document.getElementById("psPfv"); if (b3) b3.querySelector(".ps-pfv-c").innerHTML = '<p class="pd-muted">Vorschau gerade nicht möglich – bitte „PDF ansehen“ nutzen.</p>'; });
  }
  // Kein Beschnitt in der PDF → automatisch ergänzen lassen (Ränder spiegeln oder Motiv minimal vergrößern), jederzeit rückgängig
  function bleedFixHtml(f) {
    if (S.fileOrig && S.fileOrig.next === f.fileId) return '<div class="ps-bfix ok"><b>✓ Beschnitt ergänzt</b><span>' + (f.bleedMode === "zoom" ? "Motiv minimal vergrößert." : "Randbereiche gespiegelt – dein Motiv bleibt unverändert.") + ' Kontrolliere die Vorschau unten.</span><button type="button" class="ps-link" data-act="bleedundo">Rückgängig</button></div>';
    if (f.kind !== "upload" || !(f.checks || []).some(function (c) { return /keinen Beschnitt/.test(c.text || ""); })) return "";
    return '<div class="ps-bfix"><b>Kein Beschnitt in deiner Datei?</b><span>Wir können ihn automatisch ergänzen – so gibt es nach dem Schneiden keine weißen Blitzer.</span><div class="btns"><button type="button" class="ps-btn small primary" data-act="bleedfix:mirror">Ränder spiegeln (empfohlen)</button><button type="button" class="ps-btn small" data-act="bleedfix:zoom">Motiv leicht vergrößern</button></div></div>';
  }
  // ── Anpassen: Upload ganz einpassen / Format füllen, drehen, Größe – der Server setzt die Datei vom Original aus neu (exakte Größe inkl. Beschnitt) ──
  function adjHtml(f) {
    if (!f || !f.adj) return "";
    var pl = f.place || { mode: "fill", rotate: 0, scale: 1 }, sc = Math.round((pl.scale || 1) * 100), hot = (f.checks || []).some(function (c) { return c.level === "error" && /passt nicht zum gewählten Format/.test(c.text || ""); });
    var b = function (act, lab, on, tip) { return '<button type="button" class="ps-btn small' + (on ? " on" : "") + '" data-act="adj:' + act + '"' + (tip ? ' title="' + tip + '"' : "") + (on != null ? ' aria-pressed="' + !!on + '"' : "") + ">" + lab + "</button>"; };
    return '<div class="ps-adj' + (hot ? " hot" : "") + '" id="psAdj"><b>' + (hot ? "Format passt nicht? Mit einem Klick anpassen:" : "Datei anpassen") + '</b><div class="row">' +
      b("fit", "Ganz einpassen", pl.mode === "fit", "Alles bleibt sichtbar, freie Flächen bleiben weiß") + b("fill", "Format füllen", pl.mode !== "fit", "Füllt bis in den Beschnitt – Ränder werden angeschnitten") + '<span class="sep" aria-hidden="true"></span>' +
      b("rl", "↺ 90°", null, "Nach links drehen") + b("rr", "↻ 90°", null, "Nach rechts drehen") + "</div>" +
      '<div class="row"><label class="ps-adj-s"><span>Größe</span><input type="range" id="psAdjS" min="50" max="200" step="5" value="' + sc + '" aria-label="Größe in Prozent"><output id="psAdjO">' + sc + " %</output></label>" + (pl.mode !== "fit" && sc === 100 ? "" : b("reset", "Zurücksetzen")) + "</div></div>";
  }
  function adjApply(ch) {
    var f = S.file; if (!f || !f.adj || S.adjBusy) return; var pl = Object.assign({ mode: "fill", rotate: 0, scale: 1 }, f.place || {}, ch);
    S.adjBusy = true; var box = document.getElementById("psAdj"); if (box) box.classList.add("busy");
    api("/print/api/file/fit", { fileId: f.fileId, token: f.token, mode: pl.mode, rotate: ((pl.rotate % 360) + 360) % 360, scale: pl.scale }).then(function (j) { S.adjBusy = false; if (!j.ok) { toast(j.error || "Nicht möglich", true); render(); return; }
      S.file = j; S.previews = null; S.fileOrig = null; render(); pollPreflight(); toast(j.blocked ? "Angepasst – bitte die Hinweise prüfen" : "Angepasst ✓"); }).catch(function () { S.adjBusy = false; toast("Keine Verbindung", true); render(); });
  }
  // ── Druck auf dem Produkt: Produktfoto mit Motiv/Logo in der Druckfläche (Textil, Werbeartikel, Taschen) bzw. Blatt-Vorschau (Papier) ──
  var PMK = {};
  function onPhoto() { var k = kind(); return (k === "textile" || k === "promo" || !!S.prod.dimsArea) && galImgs(S.prod).length > 0; }
  function pmkHtml() { return '<section class="ps-pmk" id="psPmk"><div class="ps-pmk-h"><b>So sieht dein Druck aus</b><span class="pd-muted">Vorschau – Farben &amp; Platzierung ungefähr</span></div><div class="ps-pmk-c"><span class="ps-spin"></span> Vorschau wird erstellt …</div></section>'; }
  function fileUrl(f) { return "/print/api/file/" + encodeURIComponent(f.fileId) + "?t=" + encodeURIComponent(f.token) + "&pdf=1"; }
  // PDF-Seiten als Bild (Beschnitt abgeschnitten); transparent für Logos
  function pdfImgs(url, o) {
    return pdfjs().then(function (L) { return L.getDocument({ url: url, withCredentials: true }).promise; }).then(function (doc) {
      var jobs = []; for (var i = 1; i <= Math.min(o.pages || 1, doc.numPages); i++) jobs.push(doc.getPage(i));
      return Promise.all(jobs.map(function (pp) { return pp.then(function (pg) {
        var v0 = pg.getViewport({ scale: 1 }), sc = Math.min(3, (o.px || 700) / v0.width), vp = pg.getViewport({ scale: sc }), cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        return pg.render({ canvasContext: cv.getContext("2d"), viewport: vp, background: o.transparent ? "rgba(0,0,0,0)" : "#ffffff" }).promise.then(function () {
          var wmm = v0.width / 72 * 25.4, t = o.trim, b = o.bleed || 0, cut = t && b && (Math.abs(wmm - (t.w + 2 * b)) < 2 || Math.abs(wmm - (t.h + 2 * b)) < 2) ? b * cv.width / wmm : 0;
          var out = cv; if (cut > 0) { out = document.createElement("canvas"); out.width = Math.max(1, Math.round(cv.width - 2 * cut)); out.height = Math.max(1, Math.round(cv.height - 2 * cut)); out.getContext("2d").drawImage(cv, -cut, -cut); }
          return o.transparent ? out.toDataURL("image/png") : out.toDataURL("image/jpeg", 0.86); }); }); }));
    });
  }
  function logoImg(l) { var url = fileUrl(l); return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(url); }; im.onerror = rej; im.src = url; }).catch(function () { return pdfImgs(url, { transparent: true, px: 600 }).then(function (a) { return a[0]; }); }); }
  function pmkSrc(f, logo) {
    var k = f.fileId + (logo ? ":l" : ""); if (PMK[k]) return PMK[k];
    PMK[k] = (logo ? logoImg(f).then(function (u) { return [u]; }) : pdfImgs(fileUrl(f), { trim: f.size || sizeOf(), bleed: f.bleed != null ? f.bleed : S.prod.bleed, pages: 2, px: 800 })).catch(function () { delete PMK[k]; return null; });
    return PMK[k];
  }
  function pmkPaint() {
    var box = document.getElementById("psPmk"); if (!box) return; var c = box.querySelector(".ps-pmk-c"), p = S.prod, fid = S.file ? S.file.fileId : "", jobs;
    if (isLogo()) jobs = logoPositions().filter(function (x) { return S.logos[x.slug] && !S.logos[x.slug].blocked; }).map(function (x) { return pmkSrc(S.logos[x.slug], true).then(function (a) { return a && { slug: x.slug, title: x.title, area: x.area, src: a[0] }; }); });
    else if (S.file) { var sz = S.file.size || sizeOf(); jobs = sz ? [pmkSrc(S.file, false).then(function (a) { return a && { slug: "area", title: "Dein Druck", area: [sz.w, sz.h], src: a[0], pages: a, full: true }; })] : []; }
    if (!jobs || !jobs.length) { box.hidden = true; return; }
    Promise.all(jobs).then(function (L) { L = L.filter(Boolean); var b2 = document.getElementById("psPmk"); if (!b2 || (S.file ? S.file.fileId : "") !== fid) return;
      if (!L.length) { b2.hidden = true; return; }
      if (!isLogo() && S.file && S.file.kind === "upload" && !S.previews && L[0].pages) S.previews = L[0].pages.map(function (u) { return thumbOf(u); }).filter(Boolean);   // Warenkorb-Vorschau für hochgeladene Dateien
      b2.querySelector(".ps-pmk-c").innerHTML = onPhoto() ? photoMock(L) : sheetMock(L[0].pages || [L[0].src]); if (onPhoto()) pmkLayout(); });
  }
  function thumbOf(u) { try { var im = new Image(); im.src = u; if (!im.complete || !im.naturalWidth) return u.length < 90000 ? u : ""; var f = Math.min(1, 320 / im.naturalWidth), cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * f); cv.height = Math.round(im.naturalHeight * f); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height); return cv.toDataURL("image/jpeg", 0.8); } catch (e) { return ""; } }
  function sheetMock(pv) {
    var k = S.prod.key, sz = sizeOf() || { w: 1, h: 1 }, wall = k === "plakate" || k === "rollups" || Math.max(sz.w, sz.h) >= 590, round = /rund|round|circle/i.test(String(S.sel.shape || S.sel.size || "")) || k === "buttons";
    var wpct = k === "visitenkarten" ? 46 : k === "aufkleber" ? 38 : k === "rollups" ? 22 : 40;
    var sheet = function (src, cls) { return '<div class="sheet ' + (cls || "") + (round ? " round" : "") + '" style="width:' + (sz.w >= sz.h ? wpct * 1.25 : wpct) + '%"><img src="' + src + '" alt=""></div>'; };
    return '<div class="ps-mock' + (wall ? " wall" : "") + '" role="img" aria-label="Vorschau deiner Drucksache">' + (pv[1] && !wall ? sheet(pv[1], "back") : "") + sheet(pv[0]) + (k === "rollups" ? '<div class="stand" style="width:' + (wpct + 6) + '%"></div>' : "") + '<span class="cap">Vorschau – Farben am Bildschirm können vom Druck abweichen</span></div>';
  }
  function photoMock(L) {
    var p = S.prod, ims = galImgs(p), i = Math.min(S.pmkImg || 0, ims.length - 1), hasFront = L.some(function (x) { return x.slug === "positions_front"; }), back = null;
    var ov = L.map(function (x) {
      if (x.slug === "positions_back" && hasFront) { back = x; return ""; }
      return '<div class="ov' + (x.full ? " full" : "") + '" data-pmkey="' + esc(p.key + ":" + x.slug) + '" data-aw="' + x.area[0] + '" data-ah="' + x.area[1] + '" style="aspect-ratio:' + x.area[0] + " / " + x.area[1] + '" title="' + esc(x.title) + ' – zum Verschieben ziehen"><img src="' + x.src + '" alt="' + esc(x.title) + '" draggable="false"></div>'; }).join("");
    return '<div class="ps-pmk-ph"><div class="st"><img class="bg" src="' + esc(ims[i]) + '" crossorigin="anonymous" alt="' + esc(p.title) + '">' + ov + "</div></div>" +
      (ims.length > 1 ? '<div class="ps-pmk-th">' + ims.slice(0, 6).map(function (u, n) { return '<button type="button" data-pmkimg="' + n + '" aria-pressed="' + (n === i) + '" aria-label="Foto ' + (n + 1) + '"><img src="' + esc(u) + '" alt=""></button>'; }).join("") + "</div>" : "") +
      '<p class="pd-muted ps-pmk-n">' + (back ? "Rücken: dein Logo „" + esc(back.title) + "“ wird hinten gedruckt (auf dem Foto nicht sichtbar). " : "") + "Motiv ziehen, um die Wirkung zu sehen – gedruckt wird " + (isLogo() ? "mittig in der Druckfläche" : "genau wie in deiner Datei") + ".</p>";
  }
  // Produkt im Foto finden: Textil = zusammenhängende Shirtfarbe um die Bildmitte, sonst alles, was sich vom Hintergrund (Ecken) abhebt
  function prodBox(img, tex) {
    try { var n = 120, h = Math.max(1, Math.round(n * img.naturalHeight / img.naturalWidth)), cv = document.createElement("canvas"); cv.width = n; cv.height = h; var x = cv.getContext("2d"); x.drawImage(img, 0, 0, n, h);
      var d = x.getImageData(0, 0, n, h).data, px = function (a, b) { var o = (b * n + a) * 4; return [d[o], d[o + 1], d[o + 2]]; }, dist = function (u, v) { return Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]); };
      var bgc = [px(1, 1), px(n - 2, 1), px(1, h - 2), px(n - 2, h - 2)], isBg = function (c) { return bgc.some(function (b) { return dist(c, b) < 40; }); };
      if (tex) {   // Shirtfarbe: Median im Bereich um die Mitte, dann Zeile/Spalte entlang wachsen
        var cs = []; for (var yy = Math.round(h * .38); yy <= Math.round(h * .52); yy += 2) for (var xx = Math.round(n * .45); xx <= Math.round(n * .55); xx += 2) cs.push(px(xx, yy));
        var med = [0, 1, 2].map(function (k) { var a = cs.map(function (c) { return c[k]; }).sort(function (u, v) { return u - v; }); return a[a.length >> 1]; }); if (isBg(med)) return null;
        var hsv = function (c) { var r0 = c[0] / 255, g0 = c[1] / 255, b0 = c[2] / 255, mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), dd = mx - mn, hu = 0; if (dd) hu = mx === r0 ? ((g0 - b0) / dd) % 6 : mx === g0 ? (b0 - r0) / dd + 2 : (r0 - g0) / dd + 4; return [(hu * 60 + 360) % 360, mx ? dd / mx : 0, mx]; }, hm = hsv(med);
        var same = function (a, b) { var c = px(a, b), q = hsv(c); if (hm[1] < .22 || q[1] < .22) return dist(c, med) < 110 && Math.abs(q[1] - hm[1]) < .25; var dh = Math.abs(q[0] - hm[0]); return Math.min(dh, 360 - dh) < 20 && Math.abs(q[1] - hm[1]) < .4 && q[2] > .12; };   // Farbton statt Helligkeit – Falten/Schatten zählen mit
        var cnt = [], ext = []; for (var y3 = 0; y3 < h; y3++) { var c3 = 0, mn3 = n, mx3 = -1; for (var x3 = 0; x3 < n; x3++) if (same(x3, y3)) { c3++; if (x3 < mn3) mn3 = x3; if (x3 > mx3) mx3 = x3; } cnt.push(c3); ext.push([mn3, mx3]); }   // Maske der Shirtfarbe, Logos/Falten im Shirt stören nicht
        var t = 0, bt = h - 1; while (t < h && cnt[t] < n * .1) t++; while (bt > t && cnt[bt] < n * .1) bt--;
        var ys = Math.round(t + (bt - t) * .6), xs = []; for (var y4 = ys - 2; y4 <= ys + 2; y4++) if (ext[y4] && ext[y4][1] > ext[y4][0]) xs.push(ext[y4]);
        if (!xs.length) return null; var l = Math.min.apply(null, xs.map(function (e2) { return e2[0]; })), r = Math.max.apply(null, xs.map(function (e2) { return e2[1]; }));   // Rumpfbreite unterhalb der Ärmel
        if (r - l < n * .15 || bt - t < h * .15) return null;
        return { l: l / n, t: t / h, w: (r - l) / n, h: (bt - t) / h };
      }
      var L0 = n, R0 = 0, T0 = h, B0 = 0; for (var y2 = 0; y2 < h; y2 += 2) for (var x2 = 0; x2 < n; x2 += 2) if (!isBg(px(x2, y2))) { if (x2 < L0) L0 = x2; if (x2 > R0) R0 = x2; if (y2 < T0) T0 = y2; if (y2 > B0) B0 = y2; }
      if (R0 - L0 < n * .2 || B0 - T0 < h * .2) return null; return { l: L0 / n, t: T0 / h, w: (R0 - L0) / n, h: (B0 - T0) / h };
    } catch (e) { return null; }   // Foto ohne CORS: Standardlage
  }
  // Lage der Motive: Textil – Positionen relativ zum Shirt (Brust, Rücken, Ärmel), sonst mittig in der Produktfläche im Maßstab der Produktgröße
  var TEX_REL = { positions_chest: [.68, .24], positions_chest_right: [.32, .24], positions_front: [.5, .42], positions_back: [.5, .42], positions_sleeve_left: [.95, .12], positions_sleeve_right: [.05, .12] };
  function pmkLayout() {
    var st = document.querySelector(".ps-pmk-ph .st"), bg = st && st.querySelector(".bg"); if (!bg) return;
    var go = function () { var tex = kind() === "textile", bx = prodBox(bg, tex), pm = prodMm(S.prod), pos = S.pmkPos || {};
      if (!bx) bx = tex ? { l: .3, t: .28, w: .4, h: .45 } : { l: .2, t: .2, w: .6, h: .6 };
      [].forEach.call(st.querySelectorAll(".ov"), function (ov) { var key = ov.getAttribute("data-pmkey"), sl = key.slice(S.prod.key.length + 1), aw = +ov.getAttribute("data-aw"), mv = pos[key] || [0, 0];
        var rel = tex ? (TEX_REL[sl] || [.5, .42]) : [.5, .5], wf = tex ? bx.w * aw / 500 : pm && pm.w ? bx.w * .9 * aw / pm.w : bx.w * .55;
        if (ov.classList.contains("full") && !(pm && pm.w)) wf = bx.w * .6;
        wf = Math.max(.06, Math.min(bx.w * .95, wf));
        var at = [bx.l + rel[0] * bx.w, bx.t + rel[1] * bx.h]; ov.setAttribute("data-at", at.join(","));
        ov.style.width = (wf * 100).toFixed(2) + "%"; ov.style.left = ((at[0] + mv[0]) * 100).toFixed(2) + "%"; ov.style.top = ((at[1] + mv[1]) * 100).toFixed(2) + "%"; ov.style.visibility = "visible"; }); };
    if (bg.complete && bg.naturalWidth) go(); else { bg.onload = go; bg.onerror = function () { bg.removeAttribute("crossorigin"); bg.onerror = null; bg.onload = go; bg.src = bg.src + (bg.src.indexOf("?") > -1 ? "&" : "?") + "nc=1"; }; }
  }
  // Motiv auf dem Foto verschieben (nur Ansicht)
  root.addEventListener("pointerdown", function (e) {
    var ov = e.target.closest && e.target.closest(".ps-pmk-ph .ov"); if (!ov) return; e.preventDefault();
    var st = ov.parentNode.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, l0 = parseFloat(ov.style.left), t0 = parseFloat(ov.style.top), key = ov.getAttribute("data-pmkey");
    try { ov.setPointerCapture(e.pointerId); } catch (er) {} ov.classList.add("drag");
    var mv = function (ev) { ov.style.left = Math.max(5, Math.min(95, l0 + (ev.clientX - x0) / st.width * 100)) + "%"; ov.style.top = Math.max(5, Math.min(95, t0 + (ev.clientY - y0) / st.height * 100)) + "%"; };
    var up = function () { ov.removeEventListener("pointermove", mv); ov.removeEventListener("pointerup", up); ov.removeEventListener("pointercancel", up); ov.classList.remove("drag");
      var at = String(ov.getAttribute("data-at") || "0.5,0.5").split(",").map(Number); S.pmkPos = S.pmkPos || {}; S.pmkPos[key] = [parseFloat(ov.style.left) / 100 - at[0], parseFloat(ov.style.top) / 100 - at[1]]; };
    ov.addEventListener("pointermove", mv); ov.addEventListener("pointerup", up); ov.addEventListener("pointercancel", up);
  });
  function checksHtml(list) { return list && list.length ? '<ul class="ps-checks">' + list.map(function (c) { return '<li class="' + esc(c.level) + '">' + esc(c.text) + "</li>"; }).join("") + "</ul>" : ""; }
  function field(id, label, val, attrs, hint) { return '<div class="ps-field"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" value="' + esc(val || "") + '" ' + (attrs || "") + ">" + (hint || "") + "</div>"; }
  function vAddress() {
    var c = S.customer, co = S.ctype === "company";
    var uidHint = S.uidRes ? (S.uidRes.valid ? '<span class="hint ok">✓ gültig' + (S.uidRes.name ? " – " + esc(S.uidRes.name) : "") + "</span>" : '<span class="hint bad">' + esc(S.uidRes.why || "UID ungültig") + "</span>") : '<span class="hint">Mit gültiger UID: Kauf auf Rechnung möglich.</span>';
    return '<div class="ps-layout"><div class="ps-panel"><h2>Lieferadresse &amp; Kontakt</h2><p class="sub">Wir liefern innerhalb Österreichs. Die Rechnung geht an diese Adresse.</p><form class="ps-form" id="psAddr" novalidate autocomplete="on">' + (S.me ? "" : '<p class="ps-acct-hint">Schon Kunde? <button type="button" class="ps-link" data-act="konto">Anmelden</button> – deine Adresse wird automatisch übernommen.</p>') +
      '<div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-ctype="private" aria-pressed="' + !co + '">Privat</button><button type="button" data-ctype="company" aria-pressed="' + co + '">Firma</button></div>' +
      (co ? '<div class="ps-row2">' + field("company", "Firma *", c.company, 'autocomplete="organization" required') + '<div class="ps-field"><label for="uid">UID-Nummer</label><div class="ps-uidrow"><input id="uid" name="uid" value="' + esc(S.uid) + '" placeholder="z. B. ATU12345678" autocapitalize="characters"><button type="button" class="ps-btn small" data-act="uidcheck">Prüfen</button></div>' + uidHint + "</div></div>" : "") +
      '<div class="ps-row2">' + field("firstName", "Vorname *", c.firstName, 'autocomplete="given-name" required') + field("lastName", "Nachname *", c.lastName, 'autocomplete="family-name" required') + "</div>" +
      field("street", "Straße und Hausnummer *", c.street, 'autocomplete="street-address" required') +
      '<div class="ps-row2"><div class="ps-zipcity">' + field("zip", "PLZ *", c.zip, 'autocomplete="postal-code" inputmode="numeric" required') + field("city", "Ort *", c.city, 'autocomplete="address-level2" required') + '</div><div class="ps-field"><label for="country">Land *</label><select id="country" name="country" autocomplete="country">' + S.cat.countries.map(function (x) { return '<option value="' + x.code + '"' + ((c.country || "AT") === x.code ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="ps-row2">' + field("email", "E-Mail *", c.email, 'type="email" autocomplete="email" required', '<span class="hint">Für Bestellbestätigung, Rechnung und Sendungsverfolgung.</span>') + field("phone", "Telefon *", c.phone, 'type="tel" autocomplete="tel" required', '<span class="hint">Nur für den Paketdienst bzw. Rückfragen.</span>') + "</div>" +
      '<label class="ps-cb ps-nlopt"><input type="checkbox" id="psNlOpt"' + (S.nlOpt ? " checked" : "") + '><span>Ja, ich möchte jeden Montag Druck-Tipps und einmal im Monat einen 5-%-Code per E-Mail (Newsletter, jederzeit abbestellbar – du bekommst zuerst eine Bestätigungs-E-Mail). <a href="/datenschutz" target="_blank" rel="noopener">Datenschutz</a></span></label>' +
      '<label class="ps-cb ps-nlopt"><input type="checkbox" id="psFbOpt"' + (S.fbOpt ? " checked" : "") + '><span>Nach der Lieferung darf ich einmal per E-Mail um eine kurze Bewertung gebeten werden (freiwillig).</span></label>' +
      '<div id="psAddrErr" class="ps-err" role="alert"></div></form><div class="ps-nav"><button type="button" class="ps-btn" data-go="4">Zurück zum Warenkorb</button><button type="button" class="ps-btn primary" data-act="next4">Weiter zur Zahlung</button></div></div>' + cartAside() + "</div>";
  }
  function mockHtml() {
    var pv = S.previews;
    if ((!pv || !pv.length) && imgOk(S.prod.img)) return '<div class="ps-mock photo"><img src="' + esc(S.prod.img) + '" alt=""><a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">' + (isLogo() ? "Logo-PDF ansehen" : "Druck-PDF ansehen") + '</a><span class="cap">Beispielfoto – dein Motiv ' + (isLogo() ? "wird wie hochgeladen platziert" : "siehst du im PDF") + "</span></div>"; var k = S.prod.key, round = /rund|round|kreis|circle/i.test(labelOf("shape") + " " + (S.sel.shape || ""));
    if (!pv || !pv.length) return '<div class="ps-mock"><div style="text-align:center;color:rgba(255,255,255,.75)"><div style="font-size:42px">' + esc(S.prod.icon) + '</div><p style="margin:8px 0 12px">Hochgeladene Druckdatei</p><a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">PDF in voller Größe ansehen</a></div></div>';
    var wall = k === "plakate" || k === "rollups", sz = sizeOf() || { w: 1, h: 1 };
    var wpct = k === "visitenkarten" ? 46 : k === "aufkleber" ? 38 : k === "rollups" ? 22 : 40;
    var sheet = function (src, cls) { return '<div class="sheet ' + (cls || "") + (round ? " round" : "") + '" style="width:' + (sz.w >= sz.h ? wpct * 1.25 : wpct) + '%"><img src="' + src + '" alt=""></div>'; };
    return '<div class="ps-mock' + (wall ? " wall" : "") + '" role="img" aria-label="Vorschau deiner Drucksache">' + (pv[1] && !wall ? sheet(pv[1], "back") : "") + sheet(pv[0]) + (k === "rollups" ? '<div class="stand" style="width:' + (wpct + 6) + '%"></div>' : "") + '<span class="cap">Vorschau – Farben am Bildschirm können vom Druck abweichen</span></div>';
  }
  function cartAside() {
    var co = S.ctype === "company", t = cartTotals();
    return '<aside class="ps-price" id="psPrice" aria-live="polite"><h3>Warenkorb</h3><ul class="ps-mini">' + S.cart.map(function (x) { return "<li><span>" + esc(x.title) + " · " + (+x.n || 0).toLocaleString("de-AT") + " Stk.</span><b>" + (x.price ? eur(co ? x.price.net : x.price.gross) : "…") + "</b></li>"; }).join("") + "</ul>" +
      '<div class="sum' + (S.quoting ? " loading" : "") + '">' + eur(co ? t.net : t.gross) + "<small>" + (co ? "exkl. USt" : "inkl. USt") + "</small></div>" + '<p class="note">inkl. Versand innerhalb Österreichs</p></aside>';
  }
  function vCheckout() {
    var t = cartTotals(), c = S.customer, co = S.ctype === "company", invOk = co && S.uidRes && S.uidRes.valid, n = S.cart.length;
    if (!S.payment) S.payment = S.cat.payments.mollie ? "mollie" : (invOk ? "invoice" : "");
    if (S.payment === "invoice" && !invOk) S.payment = S.cat.payments.mollie ? "mollie" : "";
    var lastDel = S.cart.reduce(function (m, x) { var d = x.price && x.price.deliveryDate; return d && d > m ? d : m; }, "");
    var money = S.quoting ? '<div class="total"><span><span class="ps-spin"></span> Preise werden bestätigt …</span><b></b></div>' : co ? '<div><span>Netto</span><b>' + eur(t.net) + "</b></div><div><span>" + (t.rate ? "zzgl. " + t.rate + " % USt" : "USt (steuerfreie ig. Lieferung)") + "</span><b>" + eur(t.vat) + '</b></div><div class="total"><span>Gesamt</span><b>' + eur(t.gross) + "</b></div>"
      : '<div class="total"><span>Gesamt inkl. ' + (t.rate || 0) + " % USt und Versand</span><b>" + eur(t.gross) + "</b></div>";
    var items = '<ul class="ps-cart ps-cart-co">' + S.cart.map(function (x) { return "<li>" + itemThumb(x) + '<div class="ps-ci-bd"><b>' + esc(x.title) + "</b><span>" + esc(itemLine(x)) + '</span><span class="ps-ci-f"><a class="ps-link" target="_blank" rel="noopener" href="/print/api/file/' + esc(x.fileId) + "?t=" + esc(x.fileToken) + '&pdf=1">Druck-PDF prüfen</a>' + (x.warn ? ' · <button type="button" class="ps-link ps-warnl" data-act="cwarn:' + esc(x.id) + '">⚠ Hinweise zur Datei ansehen</button>' : "") + '</span></div><div class="ps-ci-pr">' + (x.price ? "<b>" + eur(co ? x.price.net : x.price.gross) + "</b>" : '<small>' + esc((S.cartErr || {})[x.id] || "…") + "</small>") + "</div></li>"; }).join("") + "</ul>";
    var addr = [c.company, c.firstName + " " + c.lastName, c.street, c.zip + " " + c.city, "Österreich"].filter(Boolean).join(", ");
    var saved = S.cart.reduce(function (a, x) { return a + (x.price && x.price.bonus ? +x.price.bonus.saved || 0 : 0); }, 0), dlab = (S.cart.filter(function (x) { return x.price && x.price.bonus; })[0] || { price: {} }).price.bonus;
    var warnN = S.cart.filter(function (x) { return x.warn; }).length;
    var chk = '<fieldset class="ps-pay ps-check" style="border:0;padding:0"><legend class="ps-lbl">Datencheck</legend>' +
      '<label class="ps-radio"><input type="radio" name="check" value="self"' + (S.check !== "pro" ? " checked" : "") + '><span><b>Direkt freigeben · 0 €</b><small>Deine Daten gehen nach der Zahlung sofort in Produktion – schnellste Lieferung. Unsere automatische Prüfung (Format, Beschnitt, Auflösung) ' +
        (warnN ? "hat bei " + warnN + (warnN === 1 ? " Position Hinweise" : " Positionen Hinweise") + " – bitte im Warenkorb bzw. im Druck-PDF ansehen." : "hat nichts gefunden.") + "</small></span></label>" +
      '<label class="ps-radio"><input type="radio" name="check" value="pro"' + (S.check === "pro" ? " checked" : "") + '><span><b>Profi-Datencheck · ' + eur(PRO_CHECK) + '</b><small>Ein Profi von FS Creative sieht sich deine Daten persönlich an (Beschnitt, Auflösung, Farben, Schriften) und meldet sich bei Problemen, bevor gedruckt wird. Hinweis: Das kann die Lieferzeit um etwa einen Werktag verlängern.</small></span></label>' +
      (warnN && S.check !== "pro" ? '<p class="ps-check-warn">⚠ Bei ' + warnN + (warnN === 1 ? " Datei gibt" : " Dateien gibt") + " es Hinweise. Wir empfehlen den Profi-Datencheck – oder prüfe die Datei selbst noch einmal.</p>" : "") + "</fieldset>";
    var vch = '<div class="ps-voucher"><label for="psVoucher" class="ps-lbl">Gutscheincode</label><div class="ps-uidrow"><input id="psVoucher" value="' + esc(S.voucher || "") + '" placeholder="z. B. WILLKOMMEN10" autocapitalize="characters" autocomplete="off"><button type="button" class="ps-btn small" data-act="voucher">' + (S.voucher ? "Ändern" : "Einlösen") + "</button>" + (S.voucher ? '<button type="button" class="ps-link" data-act="voucher:clear">entfernen</button>' : "") + "</div>" +
      (S.voucherErr ? '<span class="hint bad">' + esc(S.voucherErr) + "</span>" : S.voucherOk ? '<span class="hint ok">✓ ' + esc(S.voucherOk) + "</span>" : "") + "</div>";
    if (t.fee && !S.quoting) money = '<div><span>Profi-Datencheck</span><b>' + eur(co ? t.fee / (1 + (t.rate || 0) / 100) : t.fee) + "</b></div>" + money;
    if (saved > 0 && !S.quoting) money = '<div class="ps-save"><span>' + esc(dlab ? dlab.tier : "Rabatt") + '</span><b>− ' + eur(co ? saved : saved * (1 + (t.rate || 0) / 100)) + "</b></div>" + money;
    var acct = S.me ? '<p class="pd-muted">Die Bestellung wird in deinem Kundenkonto (' + esc(S.me.email) + ") gespeichert.</p>" :
      '<label class="ps-cb"><input type="checkbox" data-act="newacct"' + (S.newAcct ? " checked" : "") + '><span><b>Kundenkonto anlegen</b> – Bestellungen und Adresse speichern (Bestätigung per Code an ' + esc(c.email) + ")</span></label>" +
      (S.newAcct ? '<div class="ps-field" style="max-width:360px"><label for="psNewPw">Passwort (mind. 8 Zeichen)</label><input id="psNewPw" type="password" autocomplete="new-password" value="' + esc(S.newPw || "") + '"></div>' : "");
    return '<div class="ps-layout"><div class="ps-panel"><h2>Prüfen &amp; bestellen</h2><p class="sub">Bitte prüfe deine Druckdaten genau – gedruckt wird genau so, wie du sie freigibst.</p>' + items +
      '<div class="ps-sum"><div><span>Lieferung an</span><b>' + esc(addr) + ' <button type="button" class="ps-link" data-go="5">ändern</button></b></div>' + (lastDel ? "<div><span>Voraussichtlich bei dir<small class=\"ps-dnote\">ggf. auch erst am darauffolgenden Werktag</small></span><b>" + esc(deDate(lastDel)) + "</b></div>" : "") + money + "</div>" +
      '<fieldset class="ps-pay" style="border:0;padding:0"><legend class="ps-lbl">Zahlung</legend>' +
      '<label class="ps-radio' + (S.cat.payments.mollie ? "" : " dis") + '"><input type="radio" name="pay" value="mollie"' + (S.payment === "mollie" ? " checked" : "") + (S.cat.payments.mollie ? "" : " disabled") + '><span><b>Online bezahlen</b><small>Kreditkarte, Apple Pay, EPS, PayPal u. a. – sicher über Mollie' + (S.cat.payments.mollie ? "" : " (gerade nicht verfügbar)") + "</small></span></label>" +
      (co ? '' : '<!--') + '<label class="ps-radio' + (invOk ? "" : " dis") + '"><input type="radio" name="pay" value="invoice"' + (S.payment === "invoice" ? " checked" : "") + (invOk ? "" : " disabled") + '><span><b>Rechnung (14 Tage)</b><small>' + (invOk ? "Für Firmen mit geprüfter UID – wir geben die Bestellung nach kurzer Prüfung frei." : "Nur für Firmen mit gültiger UID-Nummer (bei der Lieferadresse eintragen und prüfen).") + "</small></span></label>" + (co ? "" : "-->") + "</fieldset>" + chk + vch + acct +
      '<label class="ps-cb"><input type="checkbox" data-acc="proof"' + (S.accept.proof ? " checked" : "") + '><span><b>Druckdaten geprüft:</b> Ich habe Texte, Rechtschreibung, Bilder, Farben und Format ' + (n > 1 ? "aller " + n + " Positionen " : "") + "geprüft und gebe die Daten so zum Druck frei.</span></label>" +
      '<label class="ps-cb"><input type="checkbox" data-acc="terms"' + (S.accept.terms ? " checked" : "") + '><span>Ich akzeptiere die <a href="/print/agb" target="_blank" rel="noopener">AGB</a> und habe die <a href="/datenschutz" target="_blank" rel="noopener">Datenschutzerklärung</a> gelesen.</span></label>' +
      '<label class="ps-cb"><input type="checkbox" data-acc="fagg"' + (S.accept.fagg ? " checked" : "") + '><span>Ich nehme zur Kenntnis, dass bei Waren, die nach meinen Vorgaben angefertigt bzw. bedruckt werden, <b>kein Rücktrittsrecht</b> besteht (§ 18 Abs. 1 Z 3 FAGG).</span></label>' +
      '<div class="ps-err" id="psOrderErr" role="alert">' + esc(S.err) + '</div><div class="ps-nav"><button type="button" class="ps-btn" data-go="5">Zurück</button><button type="button" class="ps-btn primary" data-act="order"' + (S.busy || S.quoting ? " disabled" : "") + ">" + (S.busy ? '<span class="ps-spin"></span> Wird gesendet …' : (S.payment === "invoice" ? "Zahlungspflichtig bestellen" : "Zahlungspflichtig bestellen & bezahlen")) + "</button></div>" +
      '<p class="ps-terms">Mit dem Klick bestellst du verbindlich. Der Vertrag kommt mit unserer Bestellbestätigung per E-Mail zustande' + (S.payment === "invoice" ? ", bei Rechnungskauf mit der Freigabe" : "") + ".</p></div>" + cartAside() + "</div>";
  }

  // ── Ereignisse ──
  root.addEventListener("keydown", function (e) {
    if (e.target.id !== "psHomeQ") return; var sg = document.getElementById("psSug"), its = sg ? [].slice.call(sg.querySelectorAll(".ps-sug-it")) : [], cur = its.findIndex(function (b) { return b.getAttribute("aria-selected") === "true"; });
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!its.length) return; var nx = (cur + (e.key === "ArrowDown" ? 1 : its.length - 1)) % its.length; its.forEach(function (b, i) { b.setAttribute("aria-selected", String(i === nx)); }); return; }
    if (e.key === "Enter") { e.preventDefault(); if (cur > -1 && its[cur] && e.target.value.trim()) its[cur].click(); else { S.q = e.target.value.trim(); setPage("produkte"); } }
    if (e.key === "Escape" && sg) { sg.hidden = true; }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.dd) { var k = S.dd; S.dd = ""; S.ddInfo = ""; render(); var b = root.querySelector('[data-dd="' + k + '"]'); if (b) b.focus(); } });
  document.addEventListener("click", function (e) { if (S.dd && e.target.isConnected && !root.contains(e.target)) { S.dd = ""; S.ddInfo = ""; render(); } });   // isConnected: Klick im Shop hat neu gerendert → nicht „außerhalb“
  root.addEventListener("click", function (e) {
    var tsb = e.target.closest("[data-tstep]");
    if (tsb) { var tv = tsb.getAttribute("data-tstep").split("|"), cur0 = S.textile.sizes[tv[0]] || 0, nv = Math.max(0, Math.min(5000, cur0 + (+tv[1]) * (cur0 >= 50 ? 5 : 1))); if (nv) S.textile.sizes[tv[0]] = nv; else delete S.textile.sizes[tv[0]];
      var inp = root.querySelector('[data-tsize="' + tv[0] + '"]'); if (inp) { inp.value = nv || ""; inp.closest(".ps-size").classList.toggle("on", !!nv); } renderPrice(); loadPrice(); return; }
    var dm = e.target.closest("[data-dim],[data-dimswap]");
    if (dm) { var wh = dm.hasAttribute("data-dim") ? dm.getAttribute("data-dim").split("x") : [S.custom.h, S.custom.w]; if (String(wh[0]) === String(S.custom.w) && String(wh[1]) === String(S.custom.h)) return;
      S.custom.w = String(wh[0]); S.custom.h = String(wh[1]); if (S.file || S.mot.files.length) { S.file = null; S.previews = null; motReset(true); toast("Format geändert – bitte die Gestaltung bzw. Datei erneut prüfen."); }
      var iw = document.getElementById("psW"), ih = document.getElementById("psH"); if (iw) iw.value = S.custom.w; if (ih) ih.value = S.custom.h;
      [].forEach.call(document.querySelectorAll(".ps-dimc"), function (b) { var on = b.getAttribute("data-dim") === S.custom.w + "x" + S.custom.h; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); loadPrice(); return; }
    var pmi = e.target.closest("[data-pmkimg]"); if (pmi) { S.pmkImg = +pmi.getAttribute("data-pmkimg"); pmkPaint(); return; }
    var swa = e.target.closest("[data-swall]"); if (swa) { S.swAll = S.swAll || {}; S.swAll[swa.getAttribute("data-swall")] = 1; render(); return; }
    var mn = e.target.closest("[data-motn],[data-motbal],[data-moti]");
    if (mn) {
      if (mn.hasAttribute("data-motn")) { var nn = Math.max(1, Math.min(10, +mn.getAttribute("data-motn"))); if (nn > S.copies) { toast("Mehr Motive als Stück geht nicht", true); return; } motSave(); S.mot.n = nn; S.mot.files = S.mot.files.slice(0, nn); S.mot.i = 0; motBalance(); render(); return; }
      if (mn.hasAttribute("data-motbal")) { motBalance(); render(); return; }
      if (mn.hasAttribute("data-moti")) { motLoad(+mn.getAttribute("data-moti")); render(); return; }
    }
    var pb = e.target.closest("[data-preset]");
    if (pb) { var P0 = (window.__presets || []).filter(function (x) { return x.id === pb.getAttribute("data-preset"); })[0]; if (P0) { var had = !!S.file; S.sel = Object.assign({}, S.sel, P0.sel); fixSel(); if (had) { S.file = null; S.previews = null; motReset(true); } toast("Paket „" + P0.name + "“ übernommen"); render(); loadPrice(); } return; }
    var alt = e.target.closest("[data-alt]");
    var wb = e.target.closest("[data-wish],[data-wishx]");
    if (wb) { if (wb.hasAttribute("data-wish") && S.wish && S.wish.items[+wb.getAttribute("data-wish")]) { S.sel = Object.assign({}, S.wish.items[+wb.getAttribute("data-wish")].sel); fixSel(); toast("Übernommen"); } S.wish = null; wishSeq++; render(); loadPrice(); return; }
    if (alt && S.alts && S.alts[+alt.getAttribute("data-alt")]) { var A = S.alts[+alt.getAttribute("data-alt")]; S.sel = Object.assign({}, A.sel); S.copies = A.copies; S.alts = null; S.priceErr = ""; if (S.file && !isLogo()) { S.file = null; S.previews = null; } toast("Übernommen: " + A.label); render(); loadPrice(); return; }
    var dc = e.target.closest("[data-ddcat]");
    if (dc) { var cv = dc.getAttribute("data-ddcat"), ci = cv.indexOf("|"); S.ddCat[cv.slice(0, ci)] = cv.slice(ci + 1); render(); var ds2 = root.querySelector(".ps-ddl.big .ps-dds"); if (ds2) ds2.scrollTop = 0; return; }
    if (e.target.closest("[data-galzoom]")) { galPop(S.gal); return; }
    var dg = e.target.closest("[data-ddgrp]");
    if (dg) { var gv = dg.getAttribute("data-ddgrp"), gi = gv.indexOf("|"), gk = gv.slice(0, gi), gn = gv.slice(gi + 1), opn = dg.getAttribute("aria-expanded") !== "true", G0 = S.ddGrp[gk] = { _set: 1 }; if (opn) G0[gn] = true;   // Akkordeon: andere schließen
      var sc0 = root.querySelector(".ps-dds"), st0 = sc0 ? sc0.scrollTop : 0; render(); var sc1 = root.querySelector(".ps-dds"); if (sc1) sc1.scrollTop = st0; return; }
    var dd = e.target.closest("[data-dd],[data-ddpick],[data-ddinfo]");
    if (dd) {
      if (dd.hasAttribute("data-dd")) { var k0 = dd.getAttribute("data-dd"); S.dd = S.dd === k0 ? "" : k0; S.ddInfo = ""; render(); if (S.dd) { var q0 = root.querySelector(".ps-ddq"), se = root.querySelector(".ps-ddo.sel"); if (se) se.scrollIntoView({ block: "nearest" }); if (q0 && window.innerWidth > 700) q0.focus(); } return; }
      if (dd.hasAttribute("data-ddinfo")) { var iv = dd.getAttribute("data-ddinfo"), ii = iv.indexOf("|"); infoPop(iv.slice(0, ii), iv.slice(ii + 1)); return; }
      var pv = dd.getAttribute("data-ddpick"), i0 = pv.indexOf("|"), key = pv.slice(0, i0), val = pv.slice(i0 + 1); S.dd = ""; S.ddInfo = "";
      if (key.indexOf("prop:") === 0) { var slug = key.slice(5), before = Object.assign({}, S.sel); setProp(slug, val); var ch = {}; Object.keys(S.sel).forEach(function (k) { if (k !== slug && S.sel[k] !== before[k]) ch[k] = S.sel[k]; }); if (Object.keys(ch).length) toast("Angepasst, damit es zusammenpasst: " + changesText(ch)); return; }
      if (key === "copies") { S.copies = +val; motBalance(); var qx = document.getElementById("psQty"); if (qx) qx.value = ""; render(); loadPrice(); return; }
      if (key === "urgency") { S.urgency = val; render(); loadPrice(); return; }
      if (key === "pm") { S.pm = val; render(); loadPrice(); return; }
      return;
    }
    if (S.dd && !e.target.closest(".ps-ddl")) { S.dd = ""; S.ddInfo = ""; render(); }
    var lk = e.target.closest("a[data-cat],a[data-prod]"); if (lk) { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); }   // echte Links: Strg/Cmd-Klick öffnet neuen Tab
    var ct = e.target.closest("[data-cat]"); if (ct) { var cv0 = ct.getAttribute("data-cat").split("|"); navCat(cv0[0], cv0[1]); return; }
    var fl = e.target.closest("[data-flt]"); if (fl) { var fk = fl.getAttribute("data-flt"); S.flt = S.flt || {}; if (!fk) S.flt = {}; else S.flt[fk] = !S.flt[fk]; var gg = document.getElementById("psGrid"); if (gg) { gg.innerHTML = gridHtml(); fromObserve(); } return; }
    var t = e.target.closest("[data-go],[data-prod],[data-act],[data-ctype],[data-group],[data-sub],[data-gal]"); if (!t || t.disabled) return;
    if (t.hasAttribute("data-go")) { e.preventDefault(); go(+t.getAttribute("data-go")); return; }
    if (t.hasAttribute("data-prod")) { pickProduct(t.getAttribute("data-prod"), function () { go(2); }); return; }
    if (t.hasAttribute("data-group")) { navCat(t.getAttribute("data-group"), ""); return; }
    if (t.hasAttribute("data-sub")) { navCat(S.group, t.getAttribute("data-sub")); return; }
    if (t.hasAttribute("data-gal")) { S.gal = +t.getAttribute("data-gal"); var gm = root.querySelector(".ps-gal .main img"), th = t.querySelector("img"), gn = root.querySelector(".ps-gal-n"); if (gm && th) gm.src = th.src.replace(/w=\d+/, "w=1000"); if (gn) gn.textContent = (S.gal + 1) + " / " + root.querySelectorAll("[data-gal]").length; root.querySelectorAll("[data-gal]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); return; }
    if (t.hasAttribute("data-ctype")) { saveAddr(); S.ctype = t.getAttribute("data-ctype"); if (S.ctype === "private") S.uidRes = null; reprice(); render(); return; }
    var a = t.getAttribute("data-act"), i = a.indexOf(":"), k = i > -1 ? a.slice(0, i) : a, v = i > -1 ? a.slice(i + 1) : "";
    if (k === "psheet") { openSheet(); return; }
    if (k === "cwarn") { warnPop(v); return; }
    if (k === "brief") { briefPop(); return; }
    if (k === "bleedfix" && S.file) { var f0 = S.file; t.disabled = true; t.textContent = "Wird ergänzt …";
      api("/print/api/file/bleed", { fileId: f0.fileId, token: f0.token, mode: v }).then(function (j) { if (!j.ok) { toast(j.error || "Nicht möglich", true); render(); return; }
        j.bleedMode = v; S.fileOrig = { file: f0, next: j.fileId }; S.file = j; S.previews = null; render(); pollPreflight(); toast("Beschnitt ergänzt ✓"); }).catch(function () { toast("Keine Verbindung", true); render(); }); return; }
    if (k === "adj" && S.file) { var pl0 = S.file.place || { mode: "fill", rotate: 0, scale: 1 };
      adjApply(v === "fit" || v === "fill" ? { mode: v } : v === "rl" ? { rotate: (pl0.rotate || 0) - 90 } : v === "rr" ? { rotate: (pl0.rotate || 0) + 90 } : { mode: "fill", scale: 1 }); return; }
    if (k === "bleedundo" && S.fileOrig) { S.file = S.fileOrig.file; S.fileOrig = null; S.previews = null; render(); toast("Originaldatei wiederhergestellt"); return; }
    if (k === "moball") { S.mobAll = true; render(); toast("Alle Optionen werden angezeigt"); return; }
    if (k === "toorder") { var ob = root.querySelector('.ps-nav [data-act="order"]'), un = root.querySelector('.ps-cb input[data-acc]:not(:checked)'); var tg = un ? un.closest(".ps-cb") : ob; if (tg) { tg.scrollIntoView({ behavior: "smooth", block: "center" }); if (un) { tg.classList.add("ps-need"); setTimeout(function () { tg.classList.remove("ps-need"); }, 1600); } } return; }
    if (k === "psheetx") { closeSheet(); return; }
    // ohne Datei immer zur Auswahl (Designer oder Upload), nicht wieder direkt in den Upload
    if (k === "next2") { if (S.price && !S.priceBusy) { if (!S.file && S.mode === "upload") S.mode = ""; go(3); } else toast(S.priceBusy ? "Einen Moment – der Preis wird noch berechnet" : "Diese Ausführung ist so nicht bestellbar – bitte eine andere Option wählen", true); return; }   // nur mit gültigem, aktuellem Preis weiter
    if (k === "clearlogo") { delete S.logos[v]; S.file = null; render(); return; }
    if (k === "mode") { if (v === "design") return openDesigner(); S.mode = v; if (v) stepPush(3, v); render(); return; }
    if (k === "clearfile") { S.file = null; S.previews = null; S.mode = ""; render(); return; }
    if (k === "editdesign") return openDesigner();
    if (k === "next3") { if (!S.file || S.file.blocked) return; if (!S.price || S.priceBusy) { toast(S.priceBusy ? "Einen Moment – der Preis wird noch berechnet" : "Diese Ausführung ist so nicht bestellbar", true); return; }
      if (S.mot.n > 1 && motOk()) { motSave(); var miss = -1; for (var mi = 0; mi < S.mot.n; mi++) { var mf = S.mot.files[mi]; if (!mf || !mf.file || mf.file.blocked) { miss = mi; break; } }
        if (miss > -1) { motLoad(miss); toast("Jetzt Motiv " + (miss + 1) + " gestalten oder hochladen"); render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        if (motSum() !== +S.copies) { toast("Die Stückzahlen der Motive ergeben nicht die Auflage – bitte in „Ausführung“ anpassen", true); return; } }
      cartAdd(); go(4); return; }
    if (k === "shop") { setPage(S.page === "produkte" ? "produkte" : "home"); return; }
    if (k === "searchall") { var hq = document.getElementById("psHomeQ"); S.q = hq ? hq.value.trim() : S.q; S.group = ""; S.sub = ""; setPage("produkte"); return; }
    if (k === "konto") { S.view = "konto"; render(); window.scrollTo({ top: 0 }); return; }
    if (k === "hqk" || k === "hqq") { if (k === "hqk") { S.hq.k = v; S.hq.q = 0; } else S.hq.q = +v; hqUpd(k === "hqq"); return; }
    if (k === "hqgo") { var hx = hqCur(); if (!hx) return; var qq = hx.h.q; pickProduct(hx.h.k, function () { if ((S.prod.tiers || []).indexOf(qq) > -1) S.copies = qq; go(2); loadPrice(); }); return; }
    if (k === "statusref") { var sp = v.split("|"); t.disabled = true; t.textContent = "wird aktualisiert …"; showStatus(sp[0], sp[1], 99, true); return; }
    if (k === "cfgsave") { cfgSave(); return; }
    if (k === "cfgshare") { cfgShare(); return; }
    if (k === "savdel") { savDel(v); return; }
    if (k === "savshare") { var sx = savedList().filter(function (x) { return x.id === v; })[0]; if (sx) shareLink(cfgLink(sx.product, sx.c), sx.title + " – FS Creative Druckshop", sx.title + " · " + (+sx.n || 0).toLocaleString("de-AT") + " Stk." + (sx.sum ? " · " + sx.sum : "")); return; }
    if (k === "recentclr") { try { localStorage.removeItem("fsc-print-recent"); } catch (e) {} render(); return; }
    if (k === "cartdel") { S.cart = S.cart.filter(function (x) { return x.id !== v; }); cartSave(); render(); return; }
    if (k === "am") { S.acct.mode = v; S.acct.err = ""; S.acct.msg = ""; render(); return; }
    if (k === "acresend") { api("/print/api/account/resend", { email: S.acct.email, purpose: v }).then(function () { S.acct.msg = "Neuer Code ist unterwegs."; S.acct.err = ""; render(); }); return; }
    if (k === "aclogout") { api("/print/api/account/logout", {}).then(function () { S.me = null; S.orders = []; S.acct.mode = "login"; toast("Abgemeldet"); render(); }); return; }
    if (k === "atab") { S.acct.tab = v; S.acct.err = ""; S.acct.msg = ""; S.acct.form = ""; S.acct.typeOpen = false; render(); var an = root.querySelector(".ps-acct-nav"); if (an && an.getBoundingClientRect().top < 60) window.scrollTo({ top: Math.max(0, an.getBoundingClientRect().top + window.scrollY - 80), behavior: "instant" }); return; }
    if (k === "actype") { S.acct.typeOpen = v === "open"; S.acct.err = ""; S.acct.msg = ""; S.acct.form = ""; render(); return; }
    if (k === "draftdel" || k === "emailcancel") { api("/print/api/account/" + (k === "draftdel" ? "draft-del" : "email-cancel"), { id: v }).then(function (j) { if (j.ok) { S.me = j.customer; render(); } else toast(j.error || "Das hat nicht geklappt", true); }).catch(function () { toast("Keine Verbindung", true); }); return; }
    if (k === "reorder") { t.disabled = true; api("/print/api/account/reorder", { orderId: v }).then(function (j) { t.disabled = false;
        if (!j.ok) { toast(j.error || "Das hat nicht geklappt", true); return; }
        S.cart.push(j.item); cartSave(); S.view = ""; toast("„" + j.item.title + "“ liegt wieder im Warenkorb – Preis wird aktualisiert"); go(4); requoteCart(); try { history.pushState(null, "", "/print?warenkorb"); } catch (e) {} })
      .catch(function () { t.disabled = false; toast("Keine Verbindung", true); }); return; }
    if (k === "voucher") { var vi = document.getElementById("psVoucher"); S.voucher = v === "clear" ? "" : (vi ? vi.value.trim().toUpperCase() : ""); S.voucherErr = ""; S.voucherOk = ""; requoteCart(); render(); return; }
    if (k === "newacct") { S.newAcct = !S.newAcct; render(); return; }
    if (k === "uidcheck") return uidCheck();
    if (k === "next4") return nextAddr();
    if (k === "order") return order();
    if (k === "retrypay") return retryPay(v);
  });
  root.addEventListener("change", function (e) {
    if (e.target.id === "psAdjS") { adjApply({ scale: +e.target.value / 100 }); return; }
    if (e.target.hasAttribute && e.target.hasAttribute("data-sort")) { S.sort = e.target.value; var gs = document.getElementById("psGrid"); if (gs) { gs.innerHTML = gridHtml(); fromObserve(); } return; }
    var t = e.target;
    if (t.name && t.name.indexOf("prop:") === 0) { setProp(t.name.slice(5), t.value); return; }
    if (t.matches("select[data-prop]")) { setProp(t.getAttribute("data-prop"), t.value); return; }
    if (t.matches("select[data-cartq]")) { var cx = S.cart.filter(function (x) { return x.id === t.getAttribute("data-cartq"); })[0]; if (!cx) return; cx.copies = +t.value; cx.n = +t.value; cx.price = null; S.cartErr = {}; cartSave(); requoteCart(); render(); return; }
    if (t.matches("select[data-copies]")) { S.copies = +t.value; var qx = document.getElementById("psQty"); if (qx) qx.value = ""; render(); loadPrice(); return; }
    if (t.matches("select[data-urgency]")) { S.urgency = t.value; render(); loadPrice(); return; }
    if (t.name === "copies") { S.copies = +t.value; var qi = document.getElementById("psQty"); if (qi) qi.value = ""; loadPrice(); return; }
    if (t.id === "psQty") { var n = parseInt(t.value, 10); if (n > 0) { S.copies = n; motBalance(); render(); loadPrice(); } return; }
    if (t.hasAttribute("data-mots")) { S.mot.split[+t.getAttribute("data-mots")] = Math.max(1, parseInt(t.value, 10) || 1); render(); return; }
    if (t.id === "psW" || t.id === "psH") { S.custom[t.id === "psW" ? "w" : "h"] = t.value; if (S.file || S.mot.files.length) { S.file = null; S.previews = null; motReset(true); toast("Format geändert – bitte die Gestaltung bzw. Datei erneut prüfen."); } loadPrice(); return; }
    if (t.name === "tmethod") { var p = S.prod, m = p.methods.filter(function (x) { return x.key === t.value; })[0]; S.textile.method = t.value; S.textile.positions = S.textile.positions.filter(function (x) { return m.positions.indexOf(x) > -1; }); if (!S.textile.positions.length) S.textile.positions = [m.positions[0]]; resetLogos(); render(); loadPrice(); return; }
    if (t.name === "tpos") { var ps = S.textile.positions.filter(function (x) { return x !== t.value; }); if (t.checked) ps.push(t.value); S.textile.positions = S.prod.positions.map(function (x) { return x.slug; }).filter(function (x) { return ps.indexOf(x) > -1; }); resetLogos(); loadPrice(); return; }
    if (t.hasAttribute("data-logo") && t.files && t.files[0]) return uploadFile(t.files[0], t.getAttribute("data-logo"));
    if (t.name === "urgency") { S.urgency = t.value; loadPrice(); return; }
    if (t.matches("[data-country]")) { S.customer.country = t.value; if (S.customer.zip && !(t.value === "DE" ? /^\d{5}$/ : /^\d{4}$/).test(S.customer.zip)) S.customer.zip = ""; loadPrice(); return; }
    if (t.id === "psFile" && t.files && t.files[0]) return uploadFile(t.files[0]);
    if (t.id === "country" || t.id === "zip") { saveAddr(); reprice(); return; }
    if (t.id === "uid") { S.uid = t.value; S.uidRes = null; return; }
    if (t.name === "pay") { S.payment = t.value; render(); return; }
    if (t.id === "psPfvT") { S.pfvOff = !t.checked; pfvRender(); return; }
    if (t.name === "check") { S.check = t.value === "pro" ? "pro" : "self"; render(); return; }
    if (t.hasAttribute("data-acc")) { S.accept[t.getAttribute("data-acc")] = t.checked; return; }
  });
  root.addEventListener("input", function (e) {
    if (e.target.id === "psAdjS") { var ao = document.getElementById("psAdjO"); if (ao) ao.textContent = e.target.value + " %"; return; }
    if (e.target.classList && e.target.classList.contains("ps-ddq")) { var qv = e.target.value.trim().toLowerCase(); root.querySelectorAll(".ps-ddo").forEach(function (o) { o.hidden = !!qv && o.getAttribute("data-q").indexOf(qv) < 0; }); root.querySelectorAll(".ps-ddg").forEach(function (g) { g.hidden = !!qv; }); var dsx = root.querySelector(".ps-dds"); if (dsx) dsx.classList.toggle("q", !!qv); return; }
    var t = e.target;
    if (t.id === "psHomeQ") { var sg = document.getElementById("psSug"), hv = sugHtml(t.value); sg.innerHTML = hv; sg.hidden = !hv; t.parentNode.setAttribute("aria-expanded", String(!!hv)); return; }
    if (t.id === "psQ") { S.q = t.value; var g = document.getElementById("psGrid"); if (g) { g.innerHTML = gridHtml(); fromObserve(); } return; }
    if (t.hasAttribute("data-tsize")) { var n = Math.max(0, Math.min(5000, parseInt(t.value, 10) || 0)); if (n) S.textile.sizes[t.getAttribute("data-tsize")] = n; else delete S.textile.sizes[t.getAttribute("data-tsize")]; renderPrice(); loadPrice(); return; }
  });
  function resetLogos() { var keep = {}; S.textile.positions.forEach(function (x) { if (S.logos[x]) keep[x] = S.logos[x]; }); S.logos = keep; S.file = null; }
  // Nicht lieferbare Kombinationen (Print.com lehnt ab, ohne dass eine Regel greift): merken, Option in diesem Zusammenhang sperren, letzte bestellbare Auswahl wiederherstellen
  var BAD = {};
  function badKey(sel) { return S.prod.key + "|" + JSON.stringify(Object.keys(sel).sort().map(function (k) { return [k, sel[k]]; })); }
  // Gewünschte, aber so nicht lieferbare Option: bis zu 4 Kombinationen suchen, in denen sie geht (eine andere Eigenschaft geändert, Material zuerst)
  var wishSeq = 0;
  function wishAlts(u, name) {
    var p = S.prod, seq = ++wishSeq, base = Object.assign({}, S.sel), cands = [], found = []; base[u.slug] = u.val;
    p.props.slice().sort(function (a, b) { return (b.slug === "material") - (a.slug === "material"); }).forEach(function (pr) { if (pr.slug === u.slug || cands.length >= 4) return; var cur = S.sel[pr.slug], n = 0;
      bestOf(pr).concat(pr.options.map(function (o) { return o.slug; })).filter(function (v, i, a) { return v !== cur && a.indexOf(v) === i; }).some(function (v) {
        var t = Object.assign({}, base); t[pr.slug] = v; if (excluded(t) || BAD[badKey(t)]) return false;
        cands.push({ sel: t, label: (pr.title || pr.slug) + ": " + optName(pr.slug, v) }); return ++n >= 2 || cands.length >= 4; }); });
    if (!cands.length) return; S.wish = { name: name, items: "busy" }; renderPrice();
    (function next(i) { if (seq !== wishSeq) return; if (i >= cands.length) { S.wish.items = found; renderPrice(); if (found.length && window.innerWidth <= 900 && S.step === 2 && !document.getElementById("psSheet")) openSheet(); return; }   // Handy: Vorschläge gleich zeigen
      api("/print/api/price", Object.assign(cfgOf(), { sel: cands[i].sel, country: S.customer.country || S.country, zip: S.customer.zip || "", customerType: S.ctype, uid: S.ctype === "company" ? S.uid : "" }))
        .then(function (j) { if (j.ok) found.push(Object.assign(cands[i], { price: j.price })); else BAD[badKey(cands[i].sel)] = 1; }).catch(function () {}).then(function () { next(i + 1); }); })(0);
  }
  function wishHtml() { var w = S.wish; if (!w) return ""; var co = S.ctype === "company";
    if (w.items === "busy") return '<div class="ps-wish"><p>„' + esc(w.name) + '“ geht so nicht – wir suchen passende Kombinationen <span class="ps-spin"></span></p></div>';
    if (!w.items.length) return '<div class="ps-wish"><p>„' + esc(w.name) + '“ ist mit dieser Ausführung leider nicht lieferbar.</p></div>';
    return '<div class="ps-wish"><p>„' + esc(w.name) + '“ gibt es so:</p>' + w.items.map(function (a, i) { return '<button type="button" class="ps-alt" data-wish="' + i + '"><span>' + esc(a.label) + "</span><b>" + eur(co ? a.price.net : a.price.gross) + "</b><small>Übernehmen →</small></button>"; }).join("") + '<button type="button" class="ps-link" data-wishx="1">Ausblenden</button></div>'; }
  function setProp(slug, val) { S.autoFix = null;
    var before = JSON.stringify(S.sel), lk = isLogo() ? logoKey() : ""; S.wish = null; wishSeq++;
    S.undo = S.good && S.good.key === S.prod.key ? { sel: JSON.parse(JSON.stringify(S.good.sel)), slug: slug, val: val } : null;   // zurück zur letzten Auswahl mit gültigem Preis
    S.sel[slug] = val; fixSel(slug);
    if ((S.file || S.mot.files.length) && !isLogo() && before !== JSON.stringify(S.sel)) { S.file = null; S.previews = null; motReset(true); toast("Ausführung geändert – bitte die Gestaltung bzw. Datei erneut prüfen."); }
    if (isLogo() && kind() === "promo" && lk !== logoKey()) { S.logos = {}; S.file = null; }
    render(); loadPrice();
  }
  root.addEventListener("dragover", function (e) { var d = e.target.closest(".ps-drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  root.addEventListener("dragleave", function (e) { var d = e.target.closest(".ps-drop"); if (d) d.classList.remove("over"); });
  root.addEventListener("drop", function (e) { var d = e.target.closest(".ps-drop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) uploadFile(f, d.getAttribute("data-logo") || ""); });

  // Upload: Druckdatei bzw. Logo für eine Position (logo = Positions-Slug)
  // Lade-Fenster beim Hochladen: Fortschritt, danach „wird geprüft“
  function upPop(state, pct, name) {
    var m = document.getElementById("psUpPop");
    if (state === "close") { if (m) m.remove(); return; }
    if (!m) { m = document.createElement("div"); m.id = "psUpPop"; m.className = "ps-pop ps-uppop"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-live", "polite"); document.body.appendChild(m); }
    var up = state === "up";
    m.innerHTML = '<div class="ps-pop-c ps-uppop-c"><div class="ps-uprings"><span class="ps-spin"></span></div><b>' + (up ? "Datei wird hochgeladen …" : "Datei wird geprüft …") + '</b><span class="pd-muted">' + esc(name || "") + '</span>' +
      '<div class="ps-upbar"><i style="width:' + (up ? pct : 100) + '%"></i></div><small>' + (up ? pct + " %" : "Format, Beschnitt, Seiten, Auflösung und Schriften – dauert nur ein paar Sekunden.") + "</small></div>";
  }
  function uploadFile(f, logo) {
    var er = logo ? root.querySelector('[data-err="' + logo + '"]') : document.getElementById("psUpErr"); er.innerHTML = "";
    if (f.size > 50 * 1024 * 1024) { er.innerHTML = '<p class="ps-err">Die Datei ist größer als 50 MB.</p>'; return; }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { er.innerHTML = '<p class="ps-err">Bitte PDF, JPG oder PNG hochladen.</p>'; return; }
    var pr = logo ? root.querySelector('label[data-logo="' + logo + '"] .ps-prog') : document.getElementById("psProg"); pr.hidden = false;
    var x = new XMLHttpRequest(); x.open("POST", "/print/api/upload");
    x.setRequestHeader("X-Print-Shop", "1"); x.setRequestHeader("Content-Type", "application/octet-stream");
    x.setRequestHeader("X-File-Name", encodeURIComponent(f.name)); x.setRequestHeader("X-Print-Config", encodeURIComponent(JSON.stringify(Object.assign(cfgOf(), logo ? { logo: logo } : {}))));
    upPop("up", 0, f.name);
    x.upload.onprogress = function (ev) { if (ev.lengthComputable) { var pc = Math.round(ev.loaded / ev.total * 100); pr.firstChild.style.width = pc + "%"; upPop(pc >= 100 ? "check" : "up", pc, f.name); } };
    x.upload.onload = function () { upPop("check", 100, f.name); };
    x.onload = function () { upPop("close"); var j = {}; try { j = JSON.parse(x.responseText); } catch (e2) {} if (j.ok && logo) { S.logos[logo] = j; S.file = null; render(); toast(j.blocked ? "Bitte ein anderes Logo verwenden." : "Logo geprüft ✓"); mergeLogos(); } else if (j.ok) { S.file = j; S.previews = null; S.design = null; render(); toast(j.blocked ? "Bitte die markierten Punkte korrigieren." : "Datei geprüft ✓"); pollPreflight(); } else { pr.hidden = true; er.innerHTML = '<p class="ps-err">' + esc(j.error || "Upload fehlgeschlagen") + "</p>"; } };
    x.onerror = function () { upPop("close"); pr.hidden = true; er.innerHTML = '<p class="ps-err">Upload fehlgeschlagen – bitte erneut versuchen.</p>'; };
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
    var sz = sizeOf(); if (!sz) { toast(S.sel.fold && FOLD_RX.test(S.sel.fold) ? "Einen Moment – das Format wird noch berechnet …" : "Format unbekannt – bitte Datei hochladen", true); return; }
    toast("Designer wird geladen …");
    loadDesigner().then(function (D) {
      var tt = document.getElementById("psToast"); if (tt && /Designer wird geladen/.test(tt.textContent)) tt.className = "ps-toast";
      return D.open({ product: S.prod, sel: S.sel, labels: S.prod.props.map(function (pr) { return [pr.slug, labelOf(pr.slug)]; }), copies: S.copies, urgency: S.urgency, custom: isCustom() ? S.custom : undefined, size: sz, folds: S.price && S.price.folds, closed: S.price && S.price.closed, bleed: (S.price && S.price.bleed) || S.prod.bleed, safe: S.prod.safe || 3, sides: sides(), fonts: S.cat.fonts, design: draft || S.design,
        motif: S.mot.n > 1 && motOk() ? S.mot.i + 1 : 0,
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
  window.PrintShop.saveDraftLink = function (design, preview) {
    return api("/print/api/draft", Object.assign(cfgOf(), { design: design, preview: preview || "" })).then(function (j) { if (j.ok && j.saved) refreshMe(); return j; });
  };

  // ── Adresse ──
  function saveAddr() {
    var f = document.getElementById("psAddr"); if (!f) return;
    ["company", "firstName", "lastName", "street", "zip", "city", "country", "email", "phone"].forEach(function (k) { var el = f.elements[k]; if (el) S.customer[k] = el.value.trim(); });
    if (f.elements.uid) S.uid = f.elements.uid.value.replace(/[\s.\-]/g, "").toUpperCase();
  }
  function reprice() { if (S.step >= 4) requoteCart(); else if (S.prod) loadPrice(); }
  function uidCheck() {
    saveAddr(); if (!S.uid) { toast("Bitte UID eingeben", true); return; }
    api("/print/api/uid", { uid: S.uid }).then(function (j) { S.uidRes = j.ok ? j : { valid: false, why: j.error }; if (j.uid) S.uid = j.uid; render(); reprice(); });
  }
  function nextAddr() {
    saveAddr(); var c = S.customer, bad = [], f = document.getElementById("psAddr");
    var req = { firstName: c.firstName, lastName: c.lastName, street: c.street && /\d/.test(c.street) ? c.street : "", zip: (c.country === "DE" ? /^\d{5}$/ : /^\d{4}$/).test(c.zip || "") ? c.zip : "", city: c.city, email: /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(c.email || "") ? c.email : "", phone: /^[+0-9 ()\/-]{6,40}$/.test(c.phone || "") ? c.phone : "" };
    if (S.ctype === "company") req.company = c.company;
    Object.keys(req).forEach(function (k) { var el = f.elements[k]; var ok = !!req[k]; if (el) el.setAttribute("aria-invalid", ok ? "false" : "true"); if (!ok) bad.push(k); });
    var names = { firstName: "Vorname", lastName: "Nachname", street: "Straße und Hausnummer", zip: "PLZ", city: "Ort", email: "E-Mail", phone: "Telefon", company: "Firma" };
    if (bad.length) { document.getElementById("psAddrErr").textContent = "Bitte prüfen: " + bad.map(function (k) { return names[k]; }).join(", "); var first = f.elements[bad[0]]; if (first) first.focus(); return; }
    if (S.ctype === "company" && S.uid && !S.uidRes) { uidCheck(); }
    var nlo = document.getElementById("psNlOpt"); S.nlOpt = !!(nlo && nlo.checked);
    var fbo = document.getElementById("psFbOpt"); S.fbOpt = !!(fbo && fbo.checked);
    if (S.nlOpt && !S.nlSent) { S.nlSent = true; api("/print/api/newsletter", { email: c.email, consent: true, source: "Kasse" }).catch(function () {}); }
    requoteCart(); go(6);
  }

  // ── Bestellen ──
  function order() {
    var er = document.getElementById("psOrderErr"), pw = document.getElementById("psNewPw");
    if (pw) S.newPw = pw.value;
    if (!S.accept.proof || !S.accept.terms || !S.accept.fagg) { er.textContent = "Bitte die drei Bestätigungen anhaken."; return; }
    if (!S.payment) { er.textContent = "Bitte eine Zahlungsart wählen."; return; }
    if (S.cart.some(function (x) { return !x.price; })) { er.textContent = "Nicht alle Preise sind verfügbar – bitte die markierten Positionen im Warenkorb prüfen."; return; }
    if (!S.me && S.newAcct && String(S.newPw || "").length < 8) { er.textContent = "Das Passwort für das Kundenkonto braucht mindestens 8 Zeichen."; if (pw) pw.focus(); return; }
    S.busy = true; S.err = ""; render();
    var body = { items: S.cart.map(function (x) { return { product: x.product, sel: x.sel, copies: x.copies, urgency: x.urgency, pm: x.pm, custom: x.custom, textile: x.textile, fileId: x.fileId, fileToken: x.fileToken, expectedGross: x.price.gross, clientWarn: x.clientWarn || undefined, motifs: x.motifs ? x.motifs.map(function (m) { return { copies: m.copies, fileId: m.fileId, fileToken: m.fileToken }; }) : undefined }; }),
      customer: Object.assign({ type: S.ctype, uid: S.ctype === "company" ? S.uid : "" }, S.customer), payment: S.payment, acceptTerms: true, acceptFagg: true, acceptProof: true,
      check: S.check === "pro" ? "pro" : "self", voucher: S.voucher && !S.voucherErr ? S.voucher : "", feedbackOk: !!S.fbOpt, createAccount: !S.me && !!S.newAcct, accountPassword: !S.me && S.newAcct ? S.newPw : undefined };
    api("/print/api/checkout", body).then(function (j) {
      S.busy = false;
      if (j.status === 409 && j.price) { var x = S.cart[j.index || 0]; if (x) { x.price = Object.assign({}, x.price, { gross: j.price.gross, net: j.price.net, vat: j.price.vat, rate: j.price.rate }); cartSave(true); }
        S.err = "Der Preis für „" + (x ? x.title : "eine Position") + "“ hat sich gerade geändert (neu: " + eur(S.ctype === "company" ? j.price.net : j.price.gross) + "). Bitte prüfen und erneut bestellen."; render(); return; }
      if (!j.ok) { S.err = j.error || "Bestellung fehlgeschlagen"; render(); return; }
      S.cart = []; cartSave(); S.accept = {}; S.newPw = ""; S.voucher = ""; S.voucherOk = "";
      try { if (j.accountCreated) localStorage.setItem("fsc-print-verify", S.customer.email); } catch (e) {}
      if (j.checkoutUrl) { location.href = j.checkoutUrl; return; }
      try { history.replaceState(null, "", "/print?bestellung=" + encodeURIComponent(j.orderId) + "&t=" + encodeURIComponent(j.token)); } catch (e) {}
      showStatus(j.orderId, j.token);
    }).catch(function () { S.busy = false; S.err = "Keine Verbindung – bitte erneut versuchen."; render(); });
  }
  function showStatus(id, t, n, refresh) {
    n = n || 0;
    api("/print/api/order/" + encodeURIComponent(id) + "?t=" + encodeURIComponent(t) + (refresh ? "&refresh=1" : "")).then(function (j) {
      if (!j.ok) { root.innerHTML = '<div class="ps-panel ps-status"><div class="big">🤔</div><h2>Bestellung nicht gefunden</h2><p>Bitte den Link aus der E-Mail verwenden oder uns kontaktieren.</p></div>'; return; }
      var o = j.order, st = o.status, h;
      if (st === "pending_payment" && n < 20) { root.innerHTML = '<div class="ps-panel ps-status"><div class="big"><span class="ps-spin" style="width:36px;height:36px"></span></div><h2>Zahlung wird bestätigt …</h2><p>Einen Moment – wir warten auf die Bestätigung von Mollie.</p></div>'; setTimeout(function () { showStatus(id, t, n + 1); }, 3000); return; }
      if (st === "pending_payment" || st === "payment_failed") h = '<div class="big">⚠️</div><h2>Zahlung nicht abgeschlossen</h2><p>Die Bestellung ' + esc(o.nr) + " ist gespeichert, aber noch nicht bezahlt.</p><div class=\"btn-row\" style=\"justify-content:center\"><button type=\"button\" class=\"ps-btn primary\" data-act=\"retrypay:" + esc(id) + "|" + esc(t) + "\">Erneut bezahlen</button></div>";
      else if (st === "rejected") h = '<div class="big">✋</div><h2>Bestellung storniert</h2><p>Die Bestellung ' + esc(o.nr) + " wurde storniert. Details haben wir dir per E-Mail geschickt.</p>";
      else h = '<div class="big">🎉</div><h2>Danke für deine Bestellung!</h2><p>Bestellnummer <b>' + esc(o.nr) + "</b> · " + esc(o.product) + " · " + o.copies + " Stk. · " + eur(o.gross) + "</p><p>" +
        (o.payment.method === "invoice" ? "Wir prüfen deine Bestellung und geben sie in Kürze frei. Die Rechnung kommt per E-Mail." : "Die Zahlung ist eingegangen. " + (o.check === "pro" || o.check === "review" ? "Wir prüfen deine Druckdaten persönlich und geben sie dann in Produktion." : "Deine Druckdaten gehen jetzt direkt in Produktion.")) +
        " Eine Bestätigung ist unterwegs an " + esc(o.email) + ".</p>" + trackHtml(st) + "<p>Status: <b>" + esc(o.statusText) + "</b>" + (o.deliveryDate ? " · Lieferung voraussichtlich " + esc(deDate(o.deliveryDate)) + " (ggf. auch am darauffolgenden Werktag)" : "") + "</p>" + trackCard(o, id, t) + fbHtml(o, id, t) +
        (o.groupSize > 1 ? '<p class="pd-muted">Teil eines Warenkorbs mit ' + o.groupSize + " Positionen – alle Bestellungen findest du in der Bestätigungsmail" + (S.me ? " und in deinem Kundenkonto" : "") + ".</p>" : "") +
        '<div class="btn-row" style="justify-content:center"><a class="ps-btn" href="/print">Weitere Drucksachen bestellen</a>' + (S.me ? '<a class="ps-btn" href="/print?konto">Mein Konto</a>' : "") + "</div>";
      var pv = ""; try { pv = localStorage.getItem("fsc-print-verify") || ""; } catch (e) {}
      if (pv && !S.me) { S.acct.email = pv; S.acct.mode = "code"; h += '<div class="ps-verify"><h3>Kundenkonto bestätigen</h3><p>Wir haben dir einen Code an <b>' + esc(pv) + '</b> geschickt.</p><form class="ps-form" data-acct-form="verify" novalidate><div class="ps-uidrow"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="ps-code" aria-label="Code"><button type="submit" class="ps-btn primary small">Bestätigen</button></div></form></div>'; }
      root.innerHTML = '<div class="ps-panel ps-status">' + h + "</div>";
      if (location.hash === "#feedback") { var fbx = document.getElementById("feedback"); if (fbx) fbx.scrollIntoView({ block: "center" }); }
    });
  }
  // Feedback (Wunsch Simon 19.10.2026): direkt nach der Bestellung zum Bestellvorgang, nach dem Versand zu den Drucksachen
  function fbHtml(o, id, t) {
    var f = o.feedback || {}, shipped = o.status === "shipped" || o.status === "delivered", ask = shipped && !f.product ? "product" : !f.order ? "order" : "";
    if (!ask) return f.order || f.product ? '<p class="ps-fb-done">Danke für dein Feedback!</p>' : "";
    return '<div class="ps-fb" id="feedback" data-fb="' + ask + '" data-id="' + esc(id) + '" data-t="' + esc(t) + '"><h3>' + (ask === "product" ? "Wie zufrieden bist du mit deinen Drucksachen?" : "Wie war das Bestellen bei uns?") + "</h3>" +
      '<div class="ps-fb-stars" role="radiogroup" aria-label="Bewertung von 1 bis 5 Sternen">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" aria-checked="false" data-fbstar="' + n + '" aria-label="' + n + " von 5 Sternen" + '">★</button>'; }).join("") + "</div>" +
      '<textarea maxlength="1000" rows="2" placeholder="' + (ask === "product" ? "Was hat dir gefallen, was können wir besser machen? (optional)" : "Was war gut, was hat gefehlt? (optional)") + '" aria-label="Kommentar (optional)"></textarea>' +
      '<button type="button" class="ps-btn primary small" data-fbsend>Feedback senden</button><p class="ps-fb-msg" role="status"></p></div>';
  }
  document.addEventListener("click", function (e) {
    var sb = e.target.closest && e.target.closest("[data-fbstar]");
    if (sb) { var box = sb.closest(".ps-fb"), n = +sb.getAttribute("data-fbstar"); box.setAttribute("data-r", n);
      [].forEach.call(box.querySelectorAll("[data-fbstar]"), function (b) { var v = +b.getAttribute("data-fbstar"); b.classList.toggle("on", v <= n); b.setAttribute("aria-checked", String(v === n)); }); return; }
    var fsb = e.target.closest && e.target.closest("[data-fbsend]"); if (!fsb) return;
    var bx = fsb.closest(".ps-fb"), r = +bx.getAttribute("data-r") || 0, msg = bx.querySelector(".ps-fb-msg");
    if (!r) { msg.textContent = "Bitte zuerst 1 bis 5 Sterne wählen."; return; }
    fsb.disabled = true; msg.textContent = "";
    api("/print/api/order/" + encodeURIComponent(bx.getAttribute("data-id")) + "/feedback?t=" + encodeURIComponent(bx.getAttribute("data-t")), { stage: bx.getAttribute("data-fb"), rating: r, text: bx.querySelector("textarea").value }).then(function (j) {
      if (j.ok) bx.innerHTML = '<p class="ps-fb-done">Danke für dein Feedback!' + (r >= 4 ? " Das freut uns sehr." : " Wir schauen uns das genau an.") + "</p>";
      else { msg.textContent = j.error || "Hat nicht geklappt – bitte später erneut versuchen."; fsb.disabled = false; }
    }).catch(function () { msg.textContent = "Hat nicht geklappt – bitte später erneut versuchen."; fsb.disabled = false; });
  });
  // Fortschritt der Bestellung als Zeitleiste
  function trackHtml(st) {
    var at = { paid: 1, invoice_requested: 1, ordered: 2, in_production: 2, problem: 2, shipped: 3, delivered: 4 }[st]; if (at == null) return "";
    var L = ["Bestellt", "Geprüft", "Produktion", "Versand", "Zugestellt"], fin = st === "delivered";
    return '<ol class="ps-track" aria-label="Bestellfortschritt">' + L.map(function (l, i) { var c = i < at || fin ? "done" : i === at ? "cur" + (st === "problem" ? " warn" : "") : "";
      return '<li class="' + c + '"' + (c.indexOf("cur") === 0 ? ' aria-current="step"' : "") + "><i aria-hidden=\"true\">" + (c === "done" ? "✓" : i + 1) + "</i><span>" + l + "</span></li>"; }).join("") + "</ol>";
  }
  // Sendungsverfolgung: Paketdienst, Sendungsnummer, Link; „Status aktualisieren“ fragt Print.com (höchstens alle 15 min)
  function trackCard(o, id, t) {
    var ti = o.trackInfo || [], open = ["ordered", "in_production", "shipped", "problem"].indexOf(o.status) > -1, upd = open ? '<button type="button" class="ps-link" data-act="statusref:' + esc(id) + "|" + esc(t) + '">Status aktualisieren</button>' : "";
    var chk = o.checkedAt ? '<span class="pd-muted">Stand ' + esc(new Date(o.checkedAt).toLocaleString("de-AT", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })) + "</span>" : "";
    if (ti.length) return '<div class="ps-trackc"><h3><span aria-hidden="true">📦</span> Sendungsverfolgung</h3>' + ti.map(function (x) {
        return '<div class="row"><div class="tx"><b>' + esc(x.carrier || "Paketdienst") + "</b>" + (x.code ? '<span>Sendungsnummer <code>' + esc(x.code) + '</code> <button type="button" class="ps-link" data-copy="' + esc(x.code) + '">kopieren</button></span>' : "") + '</div><a class="ps-btn primary small" href="' + esc(x.url) + '" target="_blank" rel="noopener">Sendung verfolgen ↗</a></div>'; }).join("") +
      '<p class="ft">' + chk + " " + upd + '<br><small>Die Zustellung kann in Einzelfällen auch erst am darauffolgenden Werktag erfolgen.</small></p></div>';
    if (open) return '<div class="ps-trackc wait"><h3><span aria-hidden="true">📦</span> Sendungsverfolgung</h3><p>Sobald dein Paket unterwegs ist, erscheint hier die Sendungsverfolgung – und du bekommst sie zusätzlich per E-Mail.</p><p class="ft">' + chk + " " + upd + "</p></div>";
    return "";
  }
  function retryPay(v) { var p = v.split("|"); fetch("/print/api/order/" + encodeURIComponent(p[0]) + "/pay?t=" + encodeURIComponent(p[1]), { method: "POST", headers: H, body: "{}" }).then(function (r) { return r.json(); }).then(function (j) { if (j.ok && j.checkoutUrl) location.href = j.checkoutUrl; else toast(j.error || "Zahlung nicht möglich", true); }); }
})();
