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
  var txt = function (v) { return String(v || "").replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1").replace(/<[^>]*>?/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/&nbsp;/g, " ").replace(/[ \t]{2,}/g, " ").trim(); };
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
    S.cat = c; window.PrintShop.ai = !!c.ai;
    if (q.get("bestellung") && q.get("t")) return showStatus(q.get("bestellung"), q.get("t"));
    if (q.get("entwurf") && q.get("t")) return loadDraft(q.get("entwurf"), q.get("t"));
    if (q.has("konto")) S.view = "konto"; else if (q.has("warenkorb")) S.step = 4; else if (q.has("produkte") || q.get("q") || q.get("kategorie")) { S.page = "produkte"; S.q = q.get("q") || ""; S.group = q.get("kategorie") || ""; }
    var pk = q.get("produkt"); if (pk && c.products.some(function (p) { return p.key === pk; })) { pickProduct(pk, function () { S.step = 2; render(); }); }
    render();
  }).catch(function () { document.getElementById("psLoading").hidden = true; document.getElementById("psSetup").hidden = false; });

  loadMe();

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
    Object.assign(it, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: S.prod.title, img: imgOk(S.prod.img) ? S.prod.img : "", icon: S.prod.icon || "",
      fileId: S.file.fileId, fileToken: S.file.token, fileName: S.file.kind === "design" ? "Eigene Gestaltung" : (S.file.name || "Druckdatei"), preview: pv && pv.length < 90000 ? pv : "",
      n: pr.copies || totalCopies(), labels: (pr.labels || []).slice(0, 12), size: isCustom() && sizeOf() ? S.custom.w + " × " + S.custom.h + " " + S.prod.custom.unit : labelOf("size"),
      price: S.price ? { net: pr.net, gross: pr.gross, vat: pr.vat, rate: pr.rate, deliveryDate: pr.deliveryDate } : null, warn: (S.file.checks || []).some(function (c) { return c.level !== "ok"; }) || !!(S.file.edgeWarn && S.file.edgeWarn.length), at: Date.now() });
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
        if (j.ok) x.price = { net: j.price.net, gross: j.price.gross, vat: j.price.vat, rate: j.price.rate, deliveryDate: j.price.deliveryDate, taxNote: j.price.taxNote, bonus: j.price.bonus || null }; else { x.price = null; S.cartErr[x.id] = j.error || "Preis nicht verfügbar"; }
        if (!S.quoting) { cartSave(true); if (S.step === 6 || S.step === 4) render(); }
      }).catch(function () { if (seq !== rqSeq) return; S.quoting--; S.cartErr[x.id] = "Keine Verbindung"; if (!S.quoting && S.step === 6) render(); });
    });
  }
  function itemLine(x) { return [x.size, (+x.n || 0).toLocaleString("de-AT") + " Stk."].concat((x.labels || []).filter(function (l) { return l && l[1] && !/format|größe|auflage/i.test(l[0]) && !NONE_RX.test(String(l[1]).trim()); }).slice(0, 5).map(function (l) { return l[1]; })).filter(Boolean).join(" · "); }
  function itemThumb(x) { return '<span class="ps-ci-img">' + (x.preview ? '<img src="' + esc(x.preview) + '" alt="">' : imgOk(x.img) ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : '<span aria-hidden="true">' + esc(x.icon || "🖨️") + "</span>") + "</span>"; }
  function vCart() {
    var co = S.ctype === "company", t = cartTotals();
    if (!S.cart.length) return '<div class="ps-panel ps-empty"><h2>Dein Warenkorb ist leer</h2><p class="sub">Such dir ein Produkt aus, gestalte es online oder lade deine Druckdaten hoch – dein Warenkorb bleibt 30 Tage gespeichert.</p><div class="ps-nav"><span></span><button type="button" class="ps-btn primary" data-act="shop">Produkte ansehen</button></div></div>';
    var h = '<div class="ps-layout"><div class="ps-panel"><h2>Warenkorb</h2><p class="sub">' + S.cart.length + (S.cart.length === 1 ? " Position" : " Positionen") + " · wird 30 Tage gespeichert" + (S.me ? " – auch in deinem Kundenkonto" : ' · <button type="button" class="ps-link" data-act="konto">Anmelden</button>, um ihn auf allen Geräten zu haben') + "</p><ul class=\"ps-cart\">";
    S.cart.forEach(function (x) {
      h += "<li>" + itemThumb(x) + '<div class="ps-ci-bd"><b>' + esc(x.title) + "</b><span>" + esc(itemLine(x)) + '</span><span class="ps-ci-f">' + esc(x.fileName || "") + (x.warn ? ' · <em>Hinweise zur Datei beachten</em>' : "") +
        ' · <a class="ps-link" target="_blank" rel="noopener" href="/print/api/file/' + esc(x.fileId) + "?t=" + esc(x.fileToken) + '&pdf=1">PDF</a></span></div><div class="ps-ci-pr">' + (x.price ? "<b>" + eur(co ? x.price.net : x.price.gross) + "</b><small>" + (co ? "netto" : "inkl. USt") + "</small>" : '<small>' + esc((S.cartErr || {})[x.id] || "Preis folgt") + "</small>") +
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
      cartSave(!add.length && (j.cart || []).length === S.cart.length);
    }
    headUpdate();
  }
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
    var me = S.me, co = me.type === "company";
    h += back + '<div class="ps-acct-hd"><h2>Hallo' + (me.firstName ? " " + esc(me.firstName) : "") + '!</h2><span class="pd-muted">' + esc(me.email) + '</span><button type="button" class="ps-btn small" data-act="aclogout">Abmelden</button></div>';
    h += '<div class="ps-acct-grid"><section class="ps-panel"><h3>Letzte Bestellungen</h3>' + (S.orders.length ? '<ul class="ps-olist">' + S.orders.slice(0, 20).map(function (o) {
      return '<li><a href="/print?bestellung=' + encodeURIComponent(o.id) + "&t=" + encodeURIComponent(o.token) + '"><b>' + esc(o.product) + "</b><span>" + esc(o.nr) + " · " + esc(new Date(o.createdAt).toLocaleDateString("de-AT")) + " · " + (+o.copies || 0).toLocaleString("de-AT") + " Stk.</span></a><span class=\"ps-ost\">" + esc(o.statusText) + "</span><b>" + eur(o.gross) + "</b></li>"; }).join("") + "</ul>"
      : '<p class="pd-muted">Noch keine Bestellungen.</p>') + (S.cart.length ? '<p><button type="button" class="ps-btn small" data-cart-link>Warenkorb (' + S.cart.length + ")</button></p>" : "") + "</section>";
    h += bonusHtml();
    h += '<section class="ps-panel"><h3>Rechnungs- &amp; Lieferadresse</h3><form class="ps-form" data-acct-form="profile" novalidate>' +
      '<div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-act="acType:private" aria-pressed="' + !co + '">Privat</button><button type="button" data-act="acType:company" aria-pressed="' + co + '">Firma</button></div>' +
      (co ? '<div class="ps-row2">' + acctField("company", "Firma", "text", me.company, "organization") + acctField("uid", "UID-Nummer", "text", me.uid) + "</div>" : "") +
      '<div class="ps-row2">' + acctField("firstName", "Vorname", "text", me.firstName, "given-name") + acctField("lastName", "Nachname", "text", me.lastName, "family-name") + "</div>" +
      acctField("street", "Straße und Hausnummer", "text", me.street, "street-address") + '<div class="ps-row2">' + acctField("zip", "PLZ", "text", me.zip, "postal-code") + acctField("city", "Ort", "text", me.city, "address-level2") + "</div>" +
      acctField("phone", "Telefon", "tel", me.phone, "tel") + (A.form === "profile" ? msg : "") + '<button type="submit" class="ps-btn primary">Speichern</button></form></section>';
    h += '<section class="ps-panel"><h3>Passwort ändern</h3><form class="ps-form" data-acct-form="password" novalidate>' + acctField("current", "Aktuelles Passwort", "password", "", "current-password") + acctField("password", "Neues Passwort (mind. 8 Zeichen)", "password", "", "new-password") + (A.form === "password" ? msg : "") + '<button type="submit" class="ps-btn">Passwort ändern</button></form>' +
      '<details class="ps-del"><summary>Konto löschen</summary><form class="ps-form" data-acct-form="delete" novalidate><p class="pd-muted">Dein Konto wird gelöscht. Bestellungen bewahren wir aus steuerlichen Gründen auf.</p>' + acctField("password", "Passwort zur Bestätigung", "password", "", "current-password") + (A.form === "delete" ? msg : "") + '<button type="submit" class="ps-btn">Konto endgültig löschen</button></form></details></section></div>';
    return h + "</div>";
  }
  function bonusHtml() {
    var b = S.bonus, me = S.me; if (!b) return "";
    var tiers = '<div class="ps-tiers">' + b.tiers.map(function (t) { return '<div class="ps-tier ' + t.key + (b.tier === t.key ? " cur" : "") + '"><span class="medal" aria-hidden="true"></span><h3>' + esc(t.name) + '</h3><p class="pct">' + t.pct + " %</p><p>ab " + eur(t.from).replace(",00", "") + "</p></div>"; }).join("") + "</div>";
    if (me.type !== "company") return '<section class="ps-panel ps-bonus-acc"><h3>Bonusprogramm für Firmen</h3><p class="pd-muted">Bis zu 10 % Rabatt auf alles – für Firmenkonten ab 5.000 € Jahresumsatz. Stell dazu unten den Kundentyp auf „Firma“.</p>' + tiers + '<p><a class="ps-link" href="/print/hilfe#bonus">So funktioniert’s</a></p></section>';
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
    var body = { email: A.email }, url = "/print/api/account/" + act;
    if (act === "login") body.password = v.password;
    else if (act === "register") Object.assign(body, { password: v.password, firstName: v.firstName, lastName: v.lastName, newsletter: !!v.newsletter });
    else if (act === "verify") body.code = v.code;
    else if (act === "reset") Object.assign(body, { code: v.code, password: v.password });
    else if (act === "profile") body = Object.assign({ type: S.me.type }, v);
    else if (act === "password") body = { current: v.current, password: v.password };
    else if (act === "delete") body = { password: v.password };
    A.busy = true; A.err = ""; A.msg = ""; A.form = act; render();
    api(url, body).then(function (j) {
      A.busy = false;
      if (!j.ok) { A.err = j.error || "Das hat nicht geklappt."; render(); return; }
      if (j.needCode) { A.mode = "code"; A.msg = j.info || ""; render(); return; }
      if (act === "forgot") { A.mode = "reset"; A.msg = "Falls ein Konto existiert, ist der Code unterwegs."; render(); return; }
      if (act === "delete") { S.me = null; S.orders = []; A.mode = "login"; A.msg = "Dein Konto wurde gelöscht."; headUpdate(); render(); return; }
      if (act === "profile" && S.prod) loadPrice();
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
  function ddRow(key, x, cur, zi) {
    var sel = String(x.val) === String(cur);
    return '<div class="ps-ddo' + (zi % 2 ? " z" : "") + (sel ? " sel" : "") + (x.warn ? " warn" : "") + (x.off ? " off" : "") + '" role="option" aria-selected="' + sel + '" data-q="' + esc(String(x.name + " " + (x.group || "")).toLowerCase()) + '">' +
      '<button type="button" class="ps-ddp" data-ddpick="' + esc(key) + "|" + esc(x.val) + '"' + (x.off ? " disabled" : "") + '><span class="n">' + esc(x.name) + (x.best ? ' <em>★ Bestseller</em>' : "") + "</span>" +
      (x.warn ? '<span class="h">passt mit: ' + esc(x.warn) + "</span>" : x.off ? '<span class="h">mit dieser Auswahl nicht lieferbar</span>' : x.sub ? '<span class="h">' + esc(x.sub) + "</span>" : "") + "</button>" +
      (sel ? '<span class="ps-ddck" aria-hidden="true">✓</span>' : "") +
      (x.desc || x.img ? '<button type="button" class="ps-i" data-ddinfo="' + esc(key) + "|" + esc(x.val) + '" aria-label="Infos zu ' + esc(x.name) + '" aria-haspopup="dialog">i</button>' : "") + "</div>";
  }
  function ddHtml(key, title, items, cur) {
    DDI[key] = items;
    var c = items.filter(function (x) { return String(x.val) === String(cur); })[0] || {}, open = S.dd === key;
    if (items.length <= 4 && key !== "copies") return '<div class="ps-segs n' + items.length + '" role="radiogroup" aria-label="' + esc(title) + '">' + items.map(function (x) { var sel = String(x.val) === String(cur);
      return '<div class="ps-sgo' + (sel ? " on" : "") + (x.off ? " off" : "") + '"><button type="button" role="radio" aria-checked="' + sel + '" data-ddpick="' + esc(key) + "|" + esc(x.val) + '"' + (x.off ? " disabled" : "") + '><b>' + esc(x.name) + "</b>" + (x.best ? '<em title="Bestseller">★</em>' : "") + (x.warn ? '<small title="' + esc("passt mit: " + x.warn) + '">ändert ' + esc(x.warn.split(" · ").map(function (c) { return c.split(" → ")[0]; }).join(", ")) + "</small>" : x.sub ? "<small>" + esc(x.sub) + "</small>" : "") + "</button>" +
        (x.desc || x.img ? '<button type="button" class="ps-i sm" data-ddinfo="' + esc(key) + "|" + esc(x.val) + '" aria-label="Infos zu ' + esc(x.name) + '" aria-haspopup="dialog">i</button>' : "") + "</div>"; }).join("") + "</div>";
    var btn = '<button type="button" class="ps-dd" data-dd="' + esc(key) + '" aria-haspopup="listbox" aria-expanded="' + open + '" aria-label="' + esc(title) + ": " + esc(c.name || "") + '"><span class="v">' + esc(c.name || "Bitte wählen") + (c.best ? ' <em class="ps-ddbs">★</em>' : "") + '</span><i aria-hidden="true">▾</i></button>';
    if (!open) return btn;
    var best = items.filter(function (x) { return x.best; }), rest = items.filter(function (x) { return !x.best; });
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
  function infoPop(key, val) {
    var it = (DDI[key] || []).filter(function (x) { return String(x.val) === String(val); })[0];
    if (!it && key.indexOf("prop:") === 0 && S.prod) { var pr0 = S.prod.props.filter(function (x) { return x.slug === key.slice(5); })[0]; if (pr0) it = propItems(pr0).filter(function (x) { return String(x.val) === String(val); })[0]; }
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
    return rows.length ? '<details class="ps-selinfo"' + (window.innerWidth > 760 ? " open" : "") + '><summary>Deine Auswahl im Detail</summary><div class="ps-si-grid">' + rows.join("") + "</div></details>" : "";
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
    return items;
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
      S.mot = { n: 1, split: [], files: [], i: 0 }; var bt = bestTiers(p); S.copies = bt.length ? (bt.indexOf(500) > -1 ? 500 : bt[0]) : p.tiers.length ? p.tiers[Math.min(1, p.tiers.length - 1)] : 0; S.urgency = p.urgency.some(function (u) { return u.slug === "standard"; }) ? "standard" : (p.urgency[0] || {}).slug || "standard"; S.file = null; S.previews = null; S.design = null; S.price = null; S.mode = ""; S.logos = {}; S.pm = "auto"; S.dd = "";
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
  function cfgOf() { return { product: S.prod.key, sel: S.sel, copies: S.copies, urgency: S.urgency, pm: S.pm || "auto", custom: isCustom() ? S.custom : undefined, textile: S.textile || undefined }; }

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
        else { S.price = null; S.priceErr = j.error || "Preis nicht verfügbar"; findAlts(); }
        if (j.ok) { S.alts = null; altSeq++; }
        renderPrice();
      }).catch(function () { if (seq !== pSeq) return; S.priceBusy = false; S.priceErr = "Keine Verbindung"; renderPrice(); });
    }, 220);
  }
  // Nicht lieferbar → naheliegende Alternativen suchen (je eine Option ändern, Nachbar-Auflagen) und mit Preis anbieten
  var altSeq = 0;
  function findAlts() {
    var seq = ++altSeq, p = S.prod; if (!p || isLogo()) return; S.alts = "busy";
    var cands = [], seen = {}, add = function (sel, copies, label, w) { var k = JSON.stringify([sel, copies]); if (seen[k]) return; seen[k] = 1; cands.push({ sel: sel, copies: copies, label: label, w: w }); };
    var tiers = (p.tiers || []).slice().sort(function (a, b) { return Math.abs(a - S.copies) - Math.abs(b - S.copies); }).filter(function (t) { return t !== S.copies; }).slice(0, 2);
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
        S.alts = found.sort(function (a, b) { return a.w - b.w || a.price.gross - b.price.gross; }).slice(0, 4); renderPrice(); });
    });
  }
  function altsHtml() {
    if (!S.priceErr || S.priceBusy) return "";
    if (S.alts === "busy") return '<p class="note"><span class="ps-spin"></span> Wir suchen passende Alternativen …</p>';
    if (!S.alts || !S.alts.length) return '<p class="note">Bitte eine andere Option wählen – oder <a class="ps-link" href="#" data-chat-open>frag uns im Chat</a>, wir finden eine Lösung.</p>';
    var co = S.ctype === "company";
    return '<div class="ps-alts"><p class="ps-alts-h">Das geht – ähnliche Ausführungen:</p>' + S.alts.map(function (a, i) { return '<button type="button" class="ps-alt" data-alt="' + i + '"><span>' + esc(a.label) + "</span><b>" + eur(co ? a.price.net : a.price.gross) + "</b><small>Übernehmen →</small></button>"; }).join("") + "</div>";
  }
  function priceHtml(compact) {
    if (!S.prod) return "";
    var p = S.price, co = S.ctype === "company", n = (p && p.copies) || totalCopies();
    var what = '<p class="what">' + esc(S.prod.title) + " · " + (+n || 0).toLocaleString("de-AT") + " Stk." + (isCustom() && sizeOf() ? " · " + esc(S.custom.w + " × " + S.custom.h + " " + S.prod.custom.unit) : labelOf("size") ? " · " + esc(labelOf("size")) : "") + "</p>";
    if (S.priceErr && !S.priceBusy) return what + '<p class="err">' + esc(S.priceErr) + "</p>" + altsHtml();
    if (!p) return what + '<p class="note"><span class="ps-spin"></span> Preis wird berechnet …</p>';
    var main = co ? p.net : p.gross;
    if (p.bonus) what += '<p class="ps-bonus-tag">★ ' + esc(p.bonus.tier || "Rabatt") + " (" + String(p.bonus.pct).replace(".", ",") + " %) · du sparst " + eur(co ? p.bonus.saved : p.bonus.saved * (1 + (p.rate || 0) / 100)) + "</p>";
    return what + '<div class="sum' + (S.priceBusy ? " loading" : "") + '">' + eur(main) + '<small>' + (co ? "exkl. USt" : "inkl. USt") + "</small></div>" +
      (p.rate ? '<div class="sum2">' + eur(co ? p.gross : p.net) + "<small>" + (co ? "inkl. USt" : "exkl. USt") + "</small></div>" : "") +
      '<p class="note">' + (co ? "netto zzgl. " + p.rate + " % USt" + (p.rate ? " (" + eur(p.gross) + " brutto)" : "") : "inkl. " + p.rate + " % USt") + " · inkl. Versand innerhalb Österreichs</p>" +
      (compact ? "" : '<dl><dt>Stückpreis</dt><dd>' + eur(main / (n || 1)) + "</dd><dt>Datencheck</dt><dd>automatisch gratis</dd><dt>Versand (AT)</dt><dd>inklusive</dd>" + (p.deliveryDate ? "<dt>Lieferung voraussichtlich</dt><dd>" + esc(deDate(p.deliveryDate)) + "</dd>" : "") + "</dl>") +
      (p.taxNote ? '<p class="note">' + esc(p.taxNote) + "</p>" : "");
  }
  function renderPrice() {
    var b = document.getElementById("psPrice"); if (b && S.step < 4 && !S.view) b.innerHTML = '<h3>Dein Preis</h3>' + priceHtml(false);
    var m = document.getElementById("psMbar"); if (m && S.prod) { var p = S.price; m.querySelector(".mp").innerHTML = p ? "<b>" + eur(S.ctype === "company" ? p.net : p.gross) + "</b><small>" + (S.ctype === "company" ? "netto" : "inkl. USt") + " · inkl. Versand</small>" : '<small>' + (S.priceErr ? esc(S.priceErr) : "Preis wird berechnet …") + "</small>"; }
    var nx = document.getElementById("psNext2"); if (nx) nx.disabled = !S.price || S.priceBusy;
    var tt = document.getElementById("psTexTotal"); if (tt) tt.textContent = totalCopies().toLocaleString("de-AT") + " Stk.";
  }

  // ── Darstellung ──
  function stepsHtml() {
    return '<ol class="ps-steps" aria-label="Bestellschritte">' + STEPS.map(function (t, i) { var n = i + 1, cur = n === S.step, done = n < S.step; if ((n === 2 || n === 3) && !S.prod) done = false; if (n > 4 && !S.cart.length) done = false;
      return '<li class="' + (done ? "done" : "") + '"' + (cur ? ' aria-current="step"' : "") + '><button type="button" data-go="' + n + '"' + (done ? "" : " disabled") + '><span class="n">' + (done ? "✓" : n) + '</span><span class="t">' + t + "</span></button></li>"; }).join("") + "</ol>";
  }
  function render() {
    document.querySelectorAll("[data-nav]").forEach(function (a) { if (a.closest(".nav-links")) a.classList.toggle("active", !S.view && S.step === 1 && S.page === a.getAttribute("data-nav")); });
    var acl = document.querySelector(".nav-links [data-acct-link]"); if (acl) acl.classList.toggle("active", S.view === "konto");
    if (!S.view && S.step === 1 && S.page !== "produkte") { root.innerHTML = vHome(); headUpdate(); loadFrom(classics().concat(dailyPicks()).map(function (p) { return p.key; })); return; }
    var h = stepsHtml();
    if (S.view === "konto") { root.innerHTML = vAccount(); headUpdate(); return; }
    if ((S.step === 2 || S.step === 3) && !S.prod) S.step = 1;
    if (S.step >= 5 && !S.cart.length) S.step = 4;
    if (S.step === 1) h += vProducts(); else if (S.step === 2) h += vOptions(); else if (S.step === 3) h += isLogo() ? vLogos() : vDesign(); else if (S.step === 4) h += vCart(); else if (S.step === 5) h += vAddress(); else h += vCheckout();
    root.innerHTML = h; headUpdate(); if (S.step === 1 && !S.view) loadFrom([].slice.call(root.querySelectorAll(".ps-prod[data-prod]")).slice(0, 12).map(function (b) { return b.getAttribute("data-prod"); })); if (S.step === 3 && S.file && !isLogo()) setTimeout(pfvRender, 0);
    if (S.step === 2 || S.step === 3) { var mb = document.createElement("div"); mb.className = "ps-mbar"; mb.id = "psMbar"; mb.innerHTML = '<div class="mp"></div>' + (S.step === 2 ? '<button type="button" class="ps-btn primary small" data-act="next2">Weiter</button>' : S.step === 3 && S.file && !S.file.blocked ? '<button type="button" class="ps-btn primary small" data-act="next3">' + (S.mot.n > 1 && motOk() ? "Weiter" : "In den Warenkorb") + "</button>" : ""); root.appendChild(mb); renderPrice(); }
    if (S.step === 2) renderPrice();
  }
  function go(n) { S.step = n; S.err = ""; render(); var y = root.getBoundingClientRect().top + window.scrollY - 80; if (Math.abs(window.scrollY - y) > 40) window.scrollTo({ top: Math.max(0, y), behavior: "smooth" }); var f = root.querySelector("h2"); if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); } }

  // ── Startseite: „Was möchtest du heute drucken?“ + Suche, Klassiker (Flyer, Banner), täglich 4 andere Produkte, Kategorien, Designer ──
  function daySeed() { var d = new Date(); return d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate(); }
  function classics() { var P = S.cat.products, fl = prodByKey("flyer"), bn = P.filter(function (p) { return p.kind === "banner"; })[0]; return [fl, bn].filter(Boolean); }
  function dailyPicks() {
    var skip = {}; classics().forEach(function (p) { skip[p.key] = 1; });
    var pool = S.cat.products.filter(function (p) { return !skip[p.key] && imgOk(p.img) && !badDesc(p); }); if (pool.length < 4) pool = S.cat.products.filter(function (p) { return !skip[p.key]; });
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
  function loadFrom(keys) { keys = keys.filter(function (k) { return !(k in FROMP); }); if (!keys.length) return; keys.forEach(function (k) { FROMP[k] = null; });
    var sels = {}; keys.forEach(function (k) { var p = prodByKey(k); if (!p || !p.props) return; var o = {}; p.props.forEach(function (pr) { var b = (BEST[pr.slug] || []).filter(function (x) { return pr.options.some(function (q) { return q.slug === x; }); })[0]; if (b) o[pr.slug] = b; }); if (Object.keys(o).length) sels[k] = o; });
    api("/print/api/from?keys=" + encodeURIComponent(keys.join(",")) + "&sel=" + encodeURIComponent(JSON.stringify(sels))).then(function (j) { if (!j.ok) return; Object.keys(j.from || {}).forEach(function (k) { FROMP[k] = j.from[k]; document.querySelectorAll('[data-from="' + k + '"]').forEach(function (el) { el.innerHTML = fromTxt(k); }); }); }).catch(function () {}); }
  function fromTxt(k) { var f = FROMP[k]; return f ? "ab <b>" + eur(S.ctype === "company" ? f.gross / 1.2 : f.gross) + "</b> · " + (+f.copies).toLocaleString("de-AT") + " Stk." : ""; }
  function facts(p) { var pr = function (sl) { return (p.props || []).filter(function (x) { return x.slug === sl; })[0]; }, sz = pr("size"), mt = pr("material"), l = [];
    if (sz && sz.options.length > 1) l.push(sz.options.length + " Formate"); if (mt && mt.options.length > 1) l.push(mt.options.length + " Materialien"); if (p.tiers && p.tiers.length) l.push("ab " + p.tiers[0].toLocaleString("de-AT") + " Stk.");
    if (p.kind === "banner") l.push("Wunschgröße in cm"); if (p.designer) l.push("Online-Designer"); return l.slice(0, 4); }
  function featCard(p, big) {
    var tag = p.designer ? "Online gestalten oder Datei hochladen" : p.kind === "banner" ? "Wunschgröße in cm" : "Druckdaten hochladen";
    return '<button type="button" class="ps-feat' + (big ? " big" : "") + '" data-prod="' + esc(p.key) + '"><span class="ph">' + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '<span class="ic">' + esc(p.icon) + "</span>") + "</span>" +
      '<span class="bd">' + (p.best ? '<span class="ps-badge">★ Bestseller</span>' : "") + "<b>" + esc(p.title) + "</b>" + (badDesc(p) ? "" : "<span>" + esc(txt(p.desc)) + "</span>") +
      (big ? '<ul class="ps-facts">' + facts(p).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + '<span class="ps-from" data-from="' + esc(p.key) + '">' + fromTxt(p.key) + "</span>" + '<span class="go">' + esc(tag) + " →</span></span></button>";
  }
  function vHome() {
    var chipsK = ["flyer", "visitenkarten", "plakate", "aufkleber", "rollups", "folder"], chipsL = chipsK.map(prodByKey).filter(Boolean);
    var bn = S.cat.products.filter(function (p) { return p.kind === "banner"; })[0]; if (bn) chipsL.splice(3, 0, bn);
    var tx = S.cat.products.filter(function (p) { return p.kind === "textile"; })[0]; if (tx) chipsL.push(tx);
    var groups = (S.cat.groups || []).map(function (g) { var l = S.cat.products.filter(function (p) { return (p.cat || {}).main === g.slug; }); var im = l.filter(function (p) { return imgOk(p.img); }).sort(function (a, b) { return (b.pop || 0) - (a.pop || 0); })[0]; return { g: g, n: l.length, img: im && im.img }; }).filter(function (x) { return x.n >= 5; });
    var dsg = S.cat.products.filter(function (p) { return p.designer; }).slice(0, 4);
    return '<section class="ps-home-hero"><span class="eyebrow">FS Creative Druckshop</span><h1>Was möchtest du heute drucken?</h1>' +
      '<div class="ps-hsearch" role="combobox" aria-expanded="false" aria-haspopup="listbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="psHomeQ" placeholder="z. B. Flyer, Visitenkarten, Banner, T-Shirts …" aria-label="Produkt suchen" autocomplete="off" aria-controls="psSug"><button type="button" class="ps-btn primary" data-act="searchall">Suchen</button><div class="ps-sug" id="psSug" role="listbox" hidden></div></div>' +
      '<div class="ps-qchips">' + chipsL.map(function (p) { return '<button type="button" data-prod="' + esc(p.key) + '">' + esc(shortName(p)) + "</button>"; }).join("") + '<button type="button" class="all" data-nav="produkte">Alle ' + S.cat.products.length + " Produkte →</button></div>" +
      '<ul class="ps-trust"><li><b>Preis sofort</b> inkl. Versand</li><li><b>Persönlich geprüft</b> vor jedem Druck</li><li><b>Online gestalten</b> mit Vorlagen</li><li><b>Offsetdruck</b> wo möglich – günstigster Preis zuerst</li></ul></section>' +
      '<section class="ps-hsec"><div class="ps-hsec-h"><h2>Unsere Klassiker</h2></div><div class="ps-feats two">' + classics().map(function (p) { return featCard(p, true); }).join("") + "</div></section>" +
      '<section class="ps-hsec"><div class="ps-hsec-h"><h2>Heute im Fokus</h2><span class="pd-muted">Jeden Tag vier andere Ideen aus unserem Sortiment</span></div><div class="ps-feats four">' + dailyPicks().map(function (p) { return featCard(p); }).join("") + "</div></section>" +
      '<section class="ps-hsec ps-designer-intro"><div class="dt"><span class="eyebrow">Online-Designer</span><h2>Selbst gestalten – ganz ohne Grafikprogramm</h2><p>Wähle eine Vorlage, tausche Texte und Bilder aus, füge dein Logo und einen QR-Code hinzu – fertig. Der Designer kennt Format, Beschnitt und Sicherheitsabstand und erstellt daraus ein druckfertiges PDF.</p>' +
      '<ul><li>Fertige Vorlagen für ' + dsg.map(function (p) { return esc(p.title); }).join(", ") + "</li><li>KI-Assistent: Texte und Gestaltungsideen auf Knopfdruck</li><li>Eigene Bilder, Logo, Farben, Schriften, QR-Code (Link oder Kontakt)</li><li>Vorschau wie gedruckt und automatischer Druckdaten-Check</li><li>Entwurf speichern und später weitermachen</li></ul>" +
      '<div class="btn-row">' + dsg.slice(0, 2).map(function (p, i) { return '<button type="button" class="ps-btn' + (i ? "" : " primary") + '" data-prod="' + esc(p.key) + '">' + esc(p.title) + " gestalten</button>"; }).join("") + '<a class="ps-link" href="/print/hilfe#designer">Mehr zum Designer</a></div></div>' +
      '<div class="dv" aria-hidden="true"><div class="dv-win"><div class="dv-bar"><i></i><i></i><i></i><span>Designer · Flyer A5</span></div><div class="dv-body"><div class="dv-side"><span class="on">✦</span><span>T</span><span>▢</span><span>🖼</span><span>QR</span></div>' +
        '<div class="dv-stage"><div class="dv-flyer"><span class="k">Samstag · 12. Juli · ab 17 Uhr</span><b>Sommer&shy;fest</b><span class="s">Musik · Kulinarik · gute Leute</span><span class="pic"></span><span class="f">Dorfplatz Gaschurn<br>www.muster-verein.at</span><span class="badge">Eintritt frei</span></div>' +
        '<div class="dv-card2"><span class="n">Maria Muster</span><span class="r">Gestalterin</span><span class="l"></span><span class="c">+43 664 123 45 67<br>maria@muster.at</span></div></div>' +
        '<div class="dv-ai"><b>✨ KI-Assistent</b><span>„Flyer fürs Sommerfest am 12. Juli, Eintritt frei“</span><em>Vorschlag übernommen ✓</em></div></div></div></div></section>' +
      '<section class="ps-hsec"><div class="ps-hsec-h"><h2>Alle Kategorien</h2><button type="button" class="ps-link" data-nav="produkte">Alle Produkte ansehen →</button></div><div class="ps-cats">' + groups.map(function (x) { return '<button type="button" class="ps-catt" data-nav="produkte" data-navgroup="' + esc(x.g.slug) + '"><span class="ci">' + (x.img ? '<img src="' + esc(x.img) + '" alt="" loading="lazy">' : "") + '</span><span class="ct"><b>' + esc(x.g.name) + "</b><span>" + x.n + " Produkte →</span></span></button>"; }).join("") + "</div></section>" +
      '<section class="ps-hsec ps-hsteps"><div class="ps-hsec-h"><h2>So einfach geht’s</h2><a class="ps-link" href="/print/hilfe">So geht’s &amp; FAQ →</a></div><ol><li><b>Produkt wählen</b><span>Format, Papier, Auflage – Preis sofort</span></li><li><b>Gestalten oder hochladen</b><span>Im Designer oder als fertige PDF</span></li><li><b>Bezahlen</b><span>Online oder als Firma auf Rechnung</span></li><li><b>Wir prüfen &amp; drucken</b><span>Persönlich geprüft, geliefert in ganz Österreich</span></li></ol></section>';
  }
  function setPage(pg, push) {
    S.view = ""; S.page = pg; S.step = 1; S.dd = "";
    if (push !== false) try { history.pushState({ pg: pg }, "", pg === "produkte" ? "/print?produkte" + (S.group ? "&kategorie=" + encodeURIComponent(S.group) : "") : "/print"); } catch (e) {}
    render(); window.scrollTo({ top: 0 });
  }
  window.addEventListener("popstate", function () { if (!S.cat) return; var qq = new URLSearchParams(location.search); if (qq.has("konto")) { S.view = "konto"; render(); return; } if (qq.has("warenkorb")) { S.view = ""; go(4); return; } setPage(qq.has("produkte") ? "produkte" : "home", false); });
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-nav]"); if (!a || !S.cat) return; e.preventDefault();
    var pg = a.getAttribute("data-nav"); S.group = a.getAttribute("data-navgroup") || ""; S.sub = ""; S.q = "";
    setPage(pg);
  });

  // Schritt 1: Produktwahl – Hauptgruppen (Print.com), Untergruppen-Filter, Suche, echte Produktbilder
  function cardHtml(p) {
    var tag = p.lazy ? "Druckdaten hochladen" : p.kind === "textile" || p.kind === "promo" ? "Logo hochladen" : p.designer ? "Online gestalten oder hochladen" : "Druckdaten hochladen";
    return '<button type="button" class="ps-prod' + (p.best ? " best" : "") + '" data-prod="' + esc(p.key) + '" aria-pressed="' + (!!S.prod && S.prod.key === p.key) + '"><span class="ph">' + (p.best ? '<span class="ps-badge">★ Bestseller</span>' : "") + (imgOk(p.img) ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async">' : '<span class="ic" aria-hidden="true">' + esc(p.icon) + "</span>") + "</span>" +
      '<span class="bd"><b>' + esc(p.title) + "</b>" + (badDesc(p) ? "" : "<span>" + esc(txt(p.desc)) + "</span>") + '<span class="ps-from" data-from="' + esc(p.key) + '">' + fromTxt(p.key) + '</span><span class="tag">' + tag + "</span></span></button>";
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
    return '<div class="ps-panel"><h2>Alle Produkte</h2><p class="sub">' + S.cat.products.length + " Produkte · alle Preise inkl. Versand innerhalb Österreichs.</p>" +
      '<div class="ps-find"><input type="search" id="psQ" value="' + esc(S.q) + '" placeholder="Produkt suchen, z. B. Flyer, T-Shirt, Banner …" aria-label="Produkt suchen" autocomplete="off"></div>' + tabs + subs + '<div id="psGrid">' + gridHtml() + "</div></div>";
  }
  // Schritt 2: Ausführung
  // Farbfelder: Hex je Farbname (Print.com liefert nur Namen/Produktfotos), englische Namen auf Deutsch
  var COLORS = {"natur": "#efe6d2", "schwarz": "#111111", "rot": "#d7262e", "weiß": "#ffffff", "himmelblau": "#7ec8f2", "rosa": "#f7b6c8", "gelb": "#ffd800", "orange": "#f57c1f", "apfelgrün": "#8cc63f", "lavendel": "#b9a6dc", "blattgrün": "#3a9a3e", "mittelblau": "#2e6fbf", "türkis": "#1fb5b0", "limettengrün": "#b5d334", "kornblumenblau": "#5a7fd6", "nachtblau": "#1b2a4a", "knallgelb": "#ffe500", "hellgrün": "#8fd16b", "knallgrün": "#29c43a", "königsblau": "#1f4fb5", "wildtaube": "#a59c94", "köningsflieder": "#b38fc9", "kakaobraun": "#6b4430", "aquamarin": "#5fd3c4", "babyrosa": "#f9cfdc", "babyblau": "#a9d2f0", "blau": "#1f5fbf", "karamell": "#c0813f", "grün": "#2e9a47", "karibikblau": "#1aa0c8", "marineblau": "#1d2a4d", "pfirsichfarbenes rouge": "#f2a68a", "palisanderholz": "#6d2e2a", "violett": "#6f3aa8", "matt kristallklar": "#e8eef2", "metallic gold": "#c9a54a", "metallic silber": "#bfc3c7", "metallic schwarz": "#2a2a2e", "metallic perle": "#efe9df", "kirschrot": "#b3122c", "lila metallic": "#8b4fb3", "metallic grün": "#2f8f4e", "metallic fuchsie": "#c8237f", "metallic blau": "#2a5db8", "metallic pink": "#ea5aa0", "metallic hellblau": "#7fb8e6", "metallic hellgrün": "#8fcf6a", "metallic lavendel": "#b9a3d8", "metallic königsblau": "#2245a8", "metallic knall orange": "#f26a1b", "metallic limettengrün": "#b2d23a", "metallic roségold": "#d6a08c", "metallic türkis": "#2bb3b1", "metallisch graphit": "#4a4c50", "silber": "#c0c4c8", "azure blue": "#2f9fe0", "bottle green": "#145a3c", "brick red": "#a8352b", "burgund": "#6d1a2c", "classic olive": "#5d6136", "deep navy": "#141d33", "fuchsie": "#d0287f", "grau meliert": "#a4a6a8", "kellygrün": "#1f9a4a", "light graphite": "#6a6d72", "navy": "#1f2a44", "lila": "#7b4bb0", "royal blue": "#1f4fb5", "sunflower": "#ffc423", "anthrazit": "#3a3d42", "blaues eis": "#cfe5f2", "flaschengrün": "#145a3c", "hellblau": "#9fcbee", "leuchtendes orange": "#ff7a1a", "weinrot": "#6e1a2a", "butter": "#f6e7a6", "canyon-rosa": "#d99a86", "baumwoll rosa": "#f4c9d2", "desert braun": "#a07b5a", "dunkelgrau meliert": "#55585c", "dämmerung": "#8a8fb0", "meliert": "#a4a6a8", "fiesta": "#f15a3a", "grün werden": "#5f9a5a", "heritage braun": "#6a4a36", "india ink grau": "#4a4f57", "khaki": "#a99a6c", "natürlich roh": "#efe6d2", "ozeanblau": "#1d6f9e", "salbei": "#a7b59a", "spectra gelb": "#ffe14a", "stiel grün": "#5b8a3a", "türkise monstera": "#2b8a83", "vintage weiß": "#f3efe6", "blue ice": "#cfe5f2", "cream": "#f5eedb", "dusk": "#8a8fb0", "mindful blue": "#4f6f9c", "misty jade": "#a9c9b7", "natural raw": "#efe6d2", "pink joy": "#f2a7c3", "stone": "#cfc6b6", "holzkohle": "#3c3c3e", "cherry red": "#b3122c", "daisy": "#ffd84a", "forest green": "#244a2e", "light_blue": "#9fcbee", "royal": "#1f4fb5", "sand": "#d8c7a3", "sapphire": "#1a74b8", "sport grey": "#9b9ea2", "farbmix luftballon": "conic-gradient(#e63946 0 25%,#ffd60a 0 50%,#2a9d8f 0 75%,#1f4fb5 0)", "farbmix metallic luftballon": "conic-gradient(#c9a54a 0 25%,#bfc3c7 0 50%,#c8237f 0 75%,#2a5db8 0)"}, COLOR_DE = {"azure blue": "Azurblau", "bottle green": "Flaschengrün", "brick red": "Ziegelrot", "classic olive": "Oliv", "deep navy": "Dunkles Marineblau", "light graphite": "Hellgraphit", "navy": "Marineblau", "royal blue": "Royalblau", "sunflower": "Sonnenblumengelb", "blue ice": "Eisblau", "cream": "Creme", "dusk": "Dämmerung", "mindful blue": "Taubenblau", "misty jade": "Jadegrün", "natural raw": "Natur roh", "pink joy": "Pink", "stone": "Stein", "cherry red": "Kirschrot", "daisy": "Gänseblümchengelb", "forest green": "Waldgrün", "light_blue": "Hellblau", "royal": "Royalblau", "sand": "Sand", "sapphire": "Saphirblau", "sport grey": "Sportgrau", "köningsflieder": "Königsflieder", "grün werden": "Frühlingsgrün", "lila metallic": "Metallic Lila"};
  var colKey = function (n) { return String(n || "").trim().toLowerCase(); };
  var colHex = function (o) { return o.color || COLORS[colKey(o.name)] || ""; };
  var colName = function (n) { return COLOR_DE[colKey(n)] || String(n || "").trim().replace(/_/g, " "); };
  function swatches(name, opts, cur, dis, pr) {
    return '<div class="ps-sws" role="radiogroup" aria-label="' + esc(pr ? pr.title : "Farbe") + '">' + opts.map(function (o) { var hx = colHex(o), nm = colName(o.name), best = pr && isBest(pr, o.slug), lt = /^#(f|e)[0-9a-f]/i.test(hx) || /^#ff[e-f]/i.test(hx);
      var face = hx ? '<i style="background:' + esc(hx) + '"' + (lt ? ' class="lt"' : "") + "></i>" : imgOk(o.img) ? '<i class="im"><img src="' + esc(o.img) + '" alt="" loading="lazy"></i>' : "<i></i>";
      return '<label class="ps-sw' + (/metallic|metallisch|gold|silber|perle/i.test(o.name) ? " met" : "") + '" title="' + esc(nm) + '"><input type="radio" name="' + esc(name) + '" value="' + esc(o.slug) + '"' + (String(cur) === String(o.slug) ? " checked" : "") + (dis && dis[o.slug] ? " disabled" : "") + ' aria-label="' + esc(nm) + '"><span>' + face + (best ? '<b class="st" aria-hidden="true">★</b>' : "") + "</span><small>" + esc(nm) + "</small></label>"; }).join("") + "</div>";
  }
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
    if (/color/.test(pr.slug) && opts.some(function (o) { return colHex(o) || imgOk(o.img); })) return '<div class="ps-tile wide ps-coltile"><span class="ps-tl">' + esc(pr.title) + (cur ? ": <b>" + esc(colName(cur.name)) + "</b>" : "") + '<span class="pd-muted"> · ' + opts.length + " Farben</span></span>" + swatches("prop:" + pr.slug, opts, S.sel[pr.slug], dis, pr) + "</div>";
    var best = cur && isBest(pr, cur.slug);
    return '<div class="ps-tile' + (best ? " best" : "") + (S.dd === "prop:" + pr.slug ? " open" + (pr.options.length > 12 ? " wide" : "") : "") + '"><span class="ps-tl">' + esc(pr.title) + (best ? ' <span class="ps-bb">★ Bestseller</span>' : "") + (cur && (cur.desc || imgOk(cur.img) || glossOf(pr, cur)) ? '<button type="button" class="ps-i sm" data-ddinfo="prop:' + esc(pr.slug) + "|" + esc(cur.slug) + '" aria-label="Infos zu ' + esc(cur.name) + '" aria-haspopup="dialog">i</button>' : "") + "</span>" + ddHtml("prop:" + pr.slug, pr.title, propItems(pr), S.sel[pr.slug]) +
      (cur && cur.desc ? '<span class="ps-td">' + esc(String(cur.desc).slice(0, 160)) + "</span>" : "") + "</div>";
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
    var m = S.price && S.price.methods; if (!m || m.length < 2) return "";
    var co = S.ctype === "company", amt = function (x) { return eur(co ? x.net : x.gross); }, cheapest = m[0];
    var auto = m.filter(function (x) { return x.pm === "offset"; })[0] || cheapest;
    var items = [{ val: "auto", name: "Automatisch: " + auto.name, best: true, sub: (auto.pm === "offset" ? "Offsetdruck – hier am günstigsten bzw. gleichauf" : "günstigstes Verfahren für diese Auflage") + " · " + amt(auto) }].concat(m.map(function (x, i) { return { val: x.pm, name: x.name, sub: amt(x) + (i === 0 ? " · günstigstes" : " · +" + eur((co ? x.net - cheapest.net : x.gross - cheapest.gross))), desc: PM_INFO[x.pm] || "" }; }));
    var cur = S.pm || "auto", isAuto = cur === "auto";
    var fell = !isAuto && S.price.pm && S.price.pm !== cur;   // gewähltes Verfahren bei dieser Auswahl nicht möglich (z. B. Offset-Mindestmenge) → automatisch umgestellt
    if (fell) return '<div class="ps-tile warn' + (S.dd === "pm" ? " open" : "") + '"><span class="ps-tl">Druckverfahren</span>' + ddHtml("pm", "Druckverfahren", items, S.price.pm) + '<span class="ps-td" style="color:#ffb340">' + esc((m.filter(function (x) { return x.pm === cur; })[0] ? "" : ({ offset: "Offset", digital: "Digitaldruck" }[cur] || cur) + " ist bei dieser Auflage nicht möglich – automatisch auf " + (m.filter(function (x) { return x.pm === S.price.pm; })[0] || {}).name + " umgestellt.")) + "</span></div>";
    return '<div class="ps-tile' + (isAuto ? " best" : "") + (S.dd === "pm" ? " open" : "") + '"><span class="ps-tl">Druckverfahren' + (isAuto ? ' <span class="ps-bb">★ empfohlen</span>' : "") + "</span>" + ddHtml("pm", "Druckverfahren", items, cur) + '<span class="ps-td">' + esc(PM_INFO[S.price.pm] || "") + "</span></div>";
  }
  var PM_INFO = { digital: "Ideal für kleine Auflagen und schnelle Lieferung – ohne Einrichtekosten.", offset: "Ab mittleren Auflagen meist deutlich günstiger, sehr gleichmäßige Farben.", inkjet: "Großformatdruck für Plakate, Banner und Displays.", digital_uv: "UV-härtende Tinte, direkt auf das Material gedruckt.", screen_printing: "Kräftige, langlebige Farben – ideal für Textilien und Werbeartikel.", sublimation: "Farbe geht ins Material über – waschfest und dauerhaft." };
  function amountHtml(p) {
    var bt = bestTiers(p), inT = p.tiers.indexOf(S.copies) > -1;
    var qi = (inT ? [] : [{ val: S.copies, name: (+S.copies).toLocaleString("de-AT") + " Stk. (eigene Menge)" }]).concat(p.tiers.map(function (n) { return { val: n, name: n.toLocaleString("de-AT") + " Stk.", best: bt.indexOf(n) > -1 }; }));
    var sel = ddHtml("copies", "Auflage", qi, S.copies);
    var own = "";
    if (p.qty && p.qty.length) { var r = [].concat.apply([], p.qty.map(function (x) { return x.ranges; })), mn = Math.min.apply(null, r.map(function (g) { return g.min; })), mx = Math.max.apply(null, r.map(function (g) { return g.max; }));
      own = '<div class="ps-tile"><span class="ps-tl">Andere Menge</span><input id="psQty" class="ps-sel" type="number" inputmode="numeric" min="' + mn + '" max="' + mx + '" value="' + (inT ? "" : S.copies) + '" placeholder="' + mn + "–" + mx.toLocaleString("de-AT") + ' Stk."></div>'; }
    var ur = p.urgency.length > 1 ? '<div class="ps-tile' + (S.urgency === "standard" ? " best" : "") + '"><span class="ps-tl">Produktion' + (S.urgency === "standard" ? ' <span class="ps-bb">★ Bestseller</span>' : "") + "</span>" +
      ddHtml("urgency", "Produktion", p.urgency.map(function (u) { return { val: u.slug, name: u.name, best: u.slug === "standard", sub: { quick: "schneller als Standard", standard: "bestes Preis-Leistungs-Verhältnis", urgent: "so schnell wie möglich" }[u.slug] || "" }; }), S.urgency) + '<span class="ps-td">Bestimmt den Liefertermin rechts.</span></div>' : "";
    return '<section class="ps-sec"><h3>Auflage &amp; Lieferung</h3><div class="ps-grid2"><div class="ps-tile' + (bt.indexOf(S.copies) > -1 ? " best" : "") + (S.dd === "copies" ? " open" : "") + '"><span class="ps-tl">Auflage' + (bt.indexOf(S.copies) > -1 ? ' <span class="ps-bb">★ Bestseller</span>' : "") + "</span>" + sel + "</div>" + own + ur + motHtml() + "</div></section>";
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
    var grpS = [], gOf = function (n) { var m = String(n).match(/^(Herren|Damen|Unisex|Kinder|Kids|Baby)\s+(.*)$/i); return m ? [m[1], m[2]] : ["", n]; };
    p.sizes.forEach(function (x) { var g = gOf(x.name), G = grpS.filter(function (y) { return y.n === g[0]; })[0]; if (!G) { G = { n: g[0], l: [] }; grpS.push(G); } G.l.push({ slug: x.slug, short: g[1] }); });
    var sz = '<fieldset class="ps-opt"><legend>Größen &amp; Stückzahl</legend>' + grpS.map(function (G) { return (G.n ? '<p class="ps-szg">' + esc(G.n) + "</p>" : "") + '<div class="ps-sizes">' + G.l.map(function (x) { var v = t.sizes[x.slug] || 0;
      return '<div class="ps-size' + (v ? " on" : "") + '"><span class="sz">' + esc(x.short) + '</span><div class="ps-step"><button type="button" data-tstep="' + esc(x.slug) + '|-1" aria-label="' + esc(G.n + " " + x.short) + ' weniger">−</button><input type="number" inputmode="numeric" min="0" max="5000" data-tsize="' + esc(x.slug) + '" value="' + (v || "") + '" placeholder="0" aria-label="' + esc(G.n + " " + x.short) + ' Stück"><button type="button" data-tstep="' + esc(x.slug) + '|1" aria-label="' + esc(G.n + " " + x.short) + ' mehr">+</button></div></div>'; }).join("") + "</div>"; }).join("") +
      '<p class="ps-help">Gesamt: <b id="psTexTotal">' + totalCopies().toLocaleString("de-AT") + " Stk.</b>" + (m.min > 1 ? " · " + esc(m.label.replace(/ \(.*$/, "")) + " ab " + m.min + " Stück" : "") + " · Der Preis hängt nicht von der Größe ab.</p></fieldset>";
    return meth + pos + sz;
  }
  function galleryHtml(p) {
    var im = (p.images || []).filter(imgOk); if (!im.length && imgOk(p.img)) im = [p.img]; if (!im.length) return "";
    var i = Math.min(S.gal, im.length - 1);
    return '<div class="ps-gal"><div class="main"><img src="' + esc(im[i]) + '" alt="' + esc(p.title) + '"></div>' + (im.length > 1 ? '<div class="th">' + im.map(function (u, k) { return '<button type="button" data-gal="' + k + '" aria-label="Bild ' + (k + 1) + '" aria-pressed="' + (k === i) + '"><img src="' + esc(u.replace(/w=\d+/, "w=160")) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>" : "") + "</div>";
  }
  function aboutHtml(p) {
    var t = txt(p.about); if (!t && !p.summary) return "";
    var lines = t.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean), bul = lines.filter(function (x) { return /^[-*•]/.test(x); });
    var body = (lines.filter(function (x) { return !/^[-*•]/.test(x); }).map(function (x) { return "<p>" + esc(x.replace(/[#*_]+/g, "")) + "</p>"; }).join("")) + (bul.length ? "<ul>" + bul.map(function (x) { return "<li>" + esc(x.replace(/^[-*•]\s*/, "").replace(/[#*_]+/g, "")) + "</li>"; }).join("") + "</ul>" : "");
    return '<details class="ps-about"' + (bul.length && bul.length <= 6 ? " open" : "") + "><summary>Produktinfos" + (p.summary ? " · " + esc(txt(p.summary)) : "") + "</summary>" + body + "</details>";
  }
  function vOptions() {
    var p = S.prod, v = selValues(), k = kind();
    var props = sectionsHtml(p), cust = "";
    var amount = k === "textile" ? '<section class="ps-sec"><h3>Druck &amp; Größen</h3>' + textileHtml(p) + "</section>" : amountHtml(p);
    var area = k === "promo" ? (function () { var a = logoPositions()[0].area; return '<p class="ps-help ps-info">Druckfläche ' + a[0] + " × " + a[1] + " mm · dein Logo wird mittig platziert · Wir prüfen jede Datei vor dem Druck.</p>"; })() : "";
    var ur = k === "textile" && p.urgency.length > 1 ? '<fieldset class="ps-opt"><legend>Produktion</legend>' + chips("urgency", p.urgency, S.urgency) + "</fieldset>" : "";
    var who = '<fieldset class="ps-opt"><legend>Preise anzeigen für</legend><div class="ps-who"><div class="ps-seg" role="group" aria-label="Kundentyp"><button type="button" data-ctype="private" aria-pressed="' + (S.ctype === "private") + '">Privat</button><button type="button" data-ctype="company" aria-pressed="' + (S.ctype === "company") + '">Firma</button></div>' +
      '<select class="ps-sel" data-country aria-label="Lieferland">' + S.cat.countries.map(function (c) { return '<option value="' + c.code + '"' + ((S.customer.country || "AT") === c.code ? " selected" : "") + ">Lieferung nach " + esc(c.name) + "</option>"; }).join("") + "</select></div></fieldset>";
    var crumbs = p.cat ? '<p class="ps-crumb">' + esc(p.cat.mainName || "") + (p.cat.subName ? " › " + esc(p.cat.subName) : "") + "</p>" : "";
    return '<div class="ps-layout"><div class="ps-panel">' + crumbs + '<div class="ps-head">' + galleryHtml(p) + '<div class="ps-head-t"><h2>' + esc(p.title) + '</h2><p class="sub">' + esc(badDesc(p) ? "" : txt(p.desc) || "Der Preis aktualisiert sich bei jeder Änderung.") + "</p>" + aboutHtml(p) + "</div></div>" + cust + props + area + amount + ur + who + (isLogo() ? "" : selInfoHtml(p)) +
      '<div class="ps-nav"><button type="button" class="ps-btn" data-go="1">Zurück</button><button type="button" class="ps-btn primary" id="psNext2" data-act="next2">' + (isLogo() ? "Weiter zum Logo" : "Weiter zur Gestaltung") + "</button></div></div>" +
      '<aside class="ps-price" id="psPrice" aria-live="polite"></aside></div>';
  }
  // Schritt 3: Gestalten / Druckdatei (Drucksachen, Banner)
  function vDesign() {
    var p = S.prod, sz = sizeOf(), sd = sides(), b = (S.price && S.price.bleed != null) ? S.price.bleed : p.bleed;
    var spec = sz ? sz.w + " × " + sz.h + " mm" + (b ? " (mit Beschnitt " + (sz.w + 2 * b) + " × " + (sz.h + 2 * b) + " mm)" : "") : "";
    var mtabs = "";
    if (S.mot.n > 1 && motOk()) { motSave(); mtabs = '<div class="ps-mtabs" role="tablist" aria-label="Motive">' + S.mot.split.map(function (v, i) { var f = S.mot.files[i], done = f && f.file && !f.file.blocked;
      return '<button type="button" role="tab" data-moti="' + i + '" aria-selected="' + (i === S.mot.i) + '" class="' + (done ? "done" : "") + '"><b>Motiv ' + (i + 1) + "</b><small>" + v.toLocaleString("de-AT") + " Stk. · " + (done ? "✓ fertig" : "offen") + "</small></button>"; }).join("") + "</div>"; }
    var h = mtabs + '<div class="ps-panel"><h2>' + (S.mot.n > 1 && motOk() ? "Motiv " + (S.mot.i + 1) + ": gestalten oder hochladen" : "Gestalten oder Datei hochladen") + '</h2><p class="sub">' + esc(p.title) + (spec ? " · Endformat " + esc(spec) : " · Format prüfen wir vor dem Druck") + " · " + (sd === 2 ? (p.key === "folder" ? "Außen- und Innenseite" : "Vorder- und Rückseite") : "einseitig") + "</p>";
    if (S.file) {
      h += '<div class="ps-file"><div><b>' + (S.file.kind === "design" ? "Deine Gestaltung" : esc(S.file.name)) + '</b><div class="pd-muted">' + (S.file.pages || "?") + " Seite(n) · " + (S.file.blocked ? "<span style=\"color:var(--ps-bad)\">bitte korrigieren</span>" : "bereit zum Druck") + '</div></div><div class="ps-row2" style="display:flex;gap:8px;flex-wrap:wrap">' +
        (S.file.kind === "design" ? '<button type="button" class="ps-btn small" data-act="editdesign">Weiter bearbeiten</button>' : "") +
        '<a class="ps-btn small" target="_blank" rel="noopener" href="/print/api/file/' + esc(S.file.fileId) + "?t=" + esc(S.file.token) + '&pdf=1">PDF ansehen</a><button type="button" class="ps-btn small" data-act="clearfile">Andere Datei</button></div></div>' + qualHtml(S.file) + checksHtml(S.file.checks) +
        '<div class="ps-pfv" id="psPfv" data-fid="' + esc(S.file.fileId) + '"><div class="ps-pfv-h"><b>Vorschau mit Druckrändern</b><label class="ps-cb sm"><input type="checkbox" id="psPfvT"' + (S.pfvOff ? "" : " checked") + '><span>Ränder anzeigen</span></label></div><div class="ps-pfv-c"><span class="ps-spin"></span> Vorschau wird erstellt …</div>' +
        '<ul class="ps-pfv-l"><li><i class="b"></i>Beschnitt – wird abgeschnitten, Hintergründe bis hierher ziehen</li><li><i class="t"></i>Endformat – hier wird geschnitten</li><li><i class="s"></i>Sicherheitsabstand – Texte &amp; Logos innerhalb halten</li></ul><div class="ps-pfv-w" id="psPfvW"></div></div>';
      if (S.file.preflight && S.file.preflight.status === "PROCESSING") h += '<p class="pd-muted" style="margin-top:8px"><span class="ps-spin"></span> Die Datei wird zusätzlich geprüft …</p>';
    } else if (S.mode === "upload") {
      h += '<label class="ps-drop" id="psDrop"><input type="file" id="psFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><span style="font-size:30px" aria-hidden="true">📄</span><b>Datei auswählen oder hierher ziehen</b><small>' + (sz ? "PDF (empfohlen), JPG oder PNG" : "Druckfertige PDF") + " · max. 50 MB" + (spec ? " · " + esc(spec) : "") + (sd === 2 ? " · 2 Seiten" : "") + '</small><div class="ps-prog" id="psProg" hidden><i></i></div></label><div id="psUpErr"></div>' +
        '<p class="ps-terms">Tipp: PDF im Endformat' + (b ? " plus " + b + " mm Beschnitt an jeder Seite" : "") + ', Schriften eingebettet, Bilder mit ' + (p.dpi || 300) + ' dpi. <button type="button" class="ps-link" data-act="mode:">Zurück zur Auswahl</button></p>';
    } else {
      h += '<div class="ps-modes"><button type="button" class="ps-mode" data-act="mode:design"' + (p.designer && sz ? "" : " disabled") + '><span class="ic" aria-hidden="true">🎨</span><b>Online gestalten</b><span>' + (p.designer && sz ? "Mit Vorlagen, eigenen Texten, Logo und Bildern – Beschnitt und Sicherheitsabstand werden angezeigt." : "Für dieses Produkt bitte eine Druckdatei hochladen.") + '</span></button>' +
        '<button type="button" class="ps-mode" data-act="mode:upload"><span class="ic" aria-hidden="true">⬆️</span><b>Druckdatei hochladen</b><span>Du hast schon eine fertige PDF (oder JPG/PNG)? Wir prüfen Format, Seiten und Auflösung automatisch.</span></button></div>';
    }
    return h + '<div class="ps-nav"><button type="button" class="ps-btn" data-go="2">Zurück</button><button type="button" class="ps-btn primary" data-act="next3"' + (S.file && !S.file.blocked ? "" : " disabled") + ">In den Warenkorb</button></div></div>";
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
      '<div class="ps-nav"><button type="button" class="ps-btn" data-go="2">Zurück</button><button type="button" class="ps-btn primary" data-act="next3"' + (S.file && !S.file.blocked ? "" : " disabled") + ">In den Warenkorb</button></div></div>";
  }
  // Qualitäts-Ampel aus den Prüfergebnissen
  function qualHtml(f) {
    var c = f.checks || [], e = c.filter(function (x) { return x.level === "error"; }).length, w = c.filter(function (x) { return x.level === "warn"; }).length + ((f.edgeWarn || []).length);
    var st = e ? ["bad", "Bitte korrigieren", "Die Datei kann so nicht gedruckt werden – siehe rote Punkte."] : w ? ["warn", "Druckbar – mit Hinweisen", "Bitte die gelben Hinweise prüfen. Unsicher? Wähle an der Kasse den Profi-Datencheck."] : ["ok", "Druckfertig", "Format, Beschnitt und Auflösung passen."];
    return '<div class="ps-qual ' + st[0] + '"><i aria-hidden="true"></i><div><b>' + st[1] + "</b><span>" + st[2] + "</span></div></div>";
  }
  // Vorschau der Druckdatei (pdf.js) mit Beschnitt, Endformat und Sicherheitsabstand + Randanalyse (Inhalte zu nah am Rand, fehlender Beschnitt)
  var PDFJS = null, PFV = {};
  function pdfjs() { if (PDFJS) return PDFJS; PDFJS = new Promise(function (res, rej) { var sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; sc.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; res(window.pdfjsLib); }; sc.onerror = function () { PDFJS = null; rej(new Error("pdf.js")); }; document.head.appendChild(sc); }); return PDFJS; }
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
        return pg.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise.then(function () { return { cv: cv, b: b, mmW: wmm }; }); })); });
    }).then(function (res) {
      var warns = [], out = res.map(function (r, idx) {
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
        if (!S.pfvOff) { x.save(); x.fillStyle = "rgba(255,59,48,.28)"; if (bp > 0) { x.fillRect(0, 0, W, bp); x.fillRect(0, H - bp, W, bp); x.fillRect(0, bp, bp, H - 2 * bp); x.fillRect(W - bp, bp, bp, H - 2 * bp); }
          x.lineWidth = 1.5; x.strokeStyle = "#ff3b30"; x.setLineDash([]); if (bp > 0) x.strokeRect(bp, bp, W - 2 * bp, H - 2 * bp); else x.strokeRect(1, 1, W - 2, H - 2);
          x.strokeStyle = "#30d158"; x.setLineDash([6, 4]); x.strokeRect(sp, sp, W - 2 * sp, H - 2 * sp); x.restore(); }
        return '<figure><img src="' + cv.toDataURL("image/png") + '" alt="Vorschau ' + (idx ? "Rückseite" : "Vorderseite") + '"><figcaption>' + (res.length > 1 ? (idx ? "Rückseite" : "Vorderseite") : "Seite 1") + (r.b ? "" : " · ohne Beschnitt") + "</figcaption></figure>"; });
      var html = '<div class="ps-pfv-g">' + out.join("") + "</div>", wh = warns.length ? '<ul class="ps-checks">' + warns.map(function (w) { return '<li class="warn">' + esc(w) + "</li>"; }).join("") + "</ul>" : '<ul class="ps-checks"><li class="ok">Randanalyse: keine Inhalte zu nah am Rand gefunden.</li></ul>';
      PFV[key] = { html: html, warn: wh }; var b2 = document.getElementById("psPfv"); if (b2 && b2.getAttribute("data-fid") === f.fileId) { b2.querySelector(".ps-pfv-c").innerHTML = html; document.getElementById("psPfvW").innerHTML = wh; }
      if (warns.length && S.file === f) { f.edgeWarn = warns; var qb = document.querySelector(".ps-qual.ok"); if (qb) { qb.className = "ps-qual warn"; qb.innerHTML = '<i aria-hidden="true"></i><div><b>Druckbar – mit Hinweisen</b><span>Die Randanalyse hat etwas gefunden – siehe Vorschau unten. Unsicher? Wähle an der Kasse den Profi-Datencheck.</span></div>'; } }
    }).catch(function () { var b3 = document.getElementById("psPfv"); if (b3) b3.querySelector(".ps-pfv-c").innerHTML = '<p class="pd-muted">Vorschau gerade nicht möglich – bitte „PDF ansehen“ nutzen.</p>'; });
  }
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
    var items = '<ul class="ps-cart ps-cart-co">' + S.cart.map(function (x) { return "<li>" + itemThumb(x) + '<div class="ps-ci-bd"><b>' + esc(x.title) + "</b><span>" + esc(itemLine(x)) + '</span><span class="ps-ci-f"><a class="ps-link" target="_blank" rel="noopener" href="/print/api/file/' + esc(x.fileId) + "?t=" + esc(x.fileToken) + '&pdf=1">Druck-PDF prüfen</a>' + (x.warn ? " · <em>Hinweise zur Datei beachten</em>" : "") + '</span></div><div class="ps-ci-pr">' + (x.price ? "<b>" + eur(co ? x.price.net : x.price.gross) + "</b>" : '<small>' + esc((S.cartErr || {})[x.id] || "…") + "</small>") + "</div></li>"; }).join("") + "</ul>";
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
      '<div class="ps-sum"><div><span>Lieferung an</span><b>' + esc(addr) + ' <button type="button" class="ps-link" data-go="5">ändern</button></b></div>' + (lastDel ? "<div><span>Voraussichtlich bei dir</span><b>" + esc(deDate(lastDel)) + "</b></div>" : "") + money + "</div>" +
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
    var mn = e.target.closest("[data-motn],[data-motbal],[data-moti]");
    if (mn) {
      if (mn.hasAttribute("data-motn")) { var nn = Math.max(1, Math.min(10, +mn.getAttribute("data-motn"))); if (nn > S.copies) { toast("Mehr Motive als Stück geht nicht", true); return; } motSave(); S.mot.n = nn; S.mot.files = S.mot.files.slice(0, nn); S.mot.i = 0; motBalance(); render(); return; }
      if (mn.hasAttribute("data-motbal")) { motBalance(); render(); return; }
      if (mn.hasAttribute("data-moti")) { motLoad(+mn.getAttribute("data-moti")); render(); return; }
    }
    var alt = e.target.closest("[data-alt]");
    if (alt && S.alts && S.alts[+alt.getAttribute("data-alt")]) { var A = S.alts[+alt.getAttribute("data-alt")]; S.sel = Object.assign({}, A.sel); S.copies = A.copies; S.alts = null; S.priceErr = ""; if (S.file && !isLogo()) { S.file = null; S.previews = null; } toast("Übernommen: " + A.label); render(); loadPrice(); return; }
    var dc = e.target.closest("[data-ddcat]");
    if (dc) { var cv = dc.getAttribute("data-ddcat"), ci = cv.indexOf("|"); S.ddCat[cv.slice(0, ci)] = cv.slice(ci + 1); render(); var ds2 = root.querySelector(".ps-ddl.big .ps-dds"); if (ds2) ds2.scrollTop = 0; return; }
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
    var t = e.target.closest("[data-go],[data-prod],[data-act],[data-ctype],[data-group],[data-sub],[data-gal]"); if (!t || t.disabled) return;
    if (t.hasAttribute("data-go")) { e.preventDefault(); go(+t.getAttribute("data-go")); return; }
    if (t.hasAttribute("data-prod")) { pickProduct(t.getAttribute("data-prod"), function () { go(2); }); return; }
    if (t.hasAttribute("data-group")) { S.group = t.getAttribute("data-group"); S.sub = ""; render(); return; }
    if (t.hasAttribute("data-sub")) { S.sub = t.getAttribute("data-sub"); render(); return; }
    if (t.hasAttribute("data-gal")) { S.gal = +t.getAttribute("data-gal"); var gm = root.querySelector(".ps-gal .main img"), th = t.querySelector("img"); if (gm && th) gm.src = th.src.replace(/w=\d+/, "w=1000"); root.querySelectorAll("[data-gal]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === t)); }); return; }
    if (t.hasAttribute("data-ctype")) { saveAddr(); S.ctype = t.getAttribute("data-ctype"); if (S.ctype === "private") S.uidRes = null; reprice(); render(); return; }
    var a = t.getAttribute("data-act"), i = a.indexOf(":"), k = i > -1 ? a.slice(0, i) : a, v = i > -1 ? a.slice(i + 1) : "";
    if (k === "next2") { if (S.price) go(3); return; }
    if (k === "clearlogo") { delete S.logos[v]; S.file = null; render(); return; }
    if (k === "mode") { if (v === "design") return openDesigner(); S.mode = v; render(); return; }
    if (k === "clearfile") { S.file = null; S.previews = null; S.mode = ""; render(); return; }
    if (k === "editdesign") return openDesigner();
    if (k === "next3") { if (!S.file || S.file.blocked) return;
      if (S.mot.n > 1 && motOk()) { motSave(); var miss = -1; for (var mi = 0; mi < S.mot.n; mi++) { var mf = S.mot.files[mi]; if (!mf || !mf.file || mf.file.blocked) { miss = mi; break; } }
        if (miss > -1) { motLoad(miss); toast("Jetzt Motiv " + (miss + 1) + " gestalten oder hochladen"); render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
        if (motSum() !== +S.copies) { toast("Die Stückzahlen der Motive ergeben nicht die Auflage – bitte in „Ausführung“ anpassen", true); return; } }
      cartAdd(); go(4); return; }
    if (k === "shop") { setPage(S.page === "produkte" ? "produkte" : "home"); return; }
    if (k === "searchall") { var hq = document.getElementById("psHomeQ"); S.q = hq ? hq.value.trim() : S.q; S.group = ""; S.sub = ""; setPage("produkte"); return; }
    if (k === "konto") { S.view = "konto"; render(); window.scrollTo({ top: 0 }); return; }
    if (k === "cartdel") { S.cart = S.cart.filter(function (x) { return x.id !== v; }); cartSave(); render(); return; }
    if (k === "am") { S.acct.mode = v; S.acct.err = ""; S.acct.msg = ""; render(); return; }
    if (k === "acresend") { api("/print/api/account/resend", { email: S.acct.email, purpose: v }).then(function () { S.acct.msg = "Neuer Code ist unterwegs."; S.acct.err = ""; render(); }); return; }
    if (k === "aclogout") { api("/print/api/account/logout", {}).then(function () { S.me = null; S.orders = []; S.acct.mode = "login"; toast("Abgemeldet"); render(); }); return; }
    if (k === "acType") { S.me.type = v; render(); return; }
    if (k === "voucher") { var vi = document.getElementById("psVoucher"); S.voucher = v === "clear" ? "" : (vi ? vi.value.trim().toUpperCase() : ""); S.voucherErr = ""; S.voucherOk = ""; requoteCart(); render(); return; }
    if (k === "newacct") { S.newAcct = !S.newAcct; render(); return; }
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
    if (e.target.classList && e.target.classList.contains("ps-ddq")) { var qv = e.target.value.trim().toLowerCase(); root.querySelectorAll(".ps-ddo").forEach(function (o) { o.hidden = !!qv && o.getAttribute("data-q").indexOf(qv) < 0; }); root.querySelectorAll(".ps-ddg").forEach(function (g) { g.hidden = !!qv; }); var dsx = root.querySelector(".ps-dds"); if (dsx) dsx.classList.toggle("q", !!qv); return; }
    var t = e.target;
    if (t.id === "psHomeQ") { var sg = document.getElementById("psSug"), hv = sugHtml(t.value); sg.innerHTML = hv; sg.hidden = !hv; t.parentNode.setAttribute("aria-expanded", String(!!hv)); return; }
    if (t.id === "psQ") { S.q = t.value; var g = document.getElementById("psGrid"); if (g) g.innerHTML = gridHtml(); return; }
    if (t.hasAttribute("data-tsize")) { var n = Math.max(0, Math.min(5000, parseInt(t.value, 10) || 0)); if (n) S.textile.sizes[t.getAttribute("data-tsize")] = n; else delete S.textile.sizes[t.getAttribute("data-tsize")]; renderPrice(); loadPrice(); return; }
  });
  function resetLogos() { var keep = {}; S.textile.positions.forEach(function (x) { if (S.logos[x]) keep[x] = S.logos[x]; }); S.logos = keep; S.file = null; }
  function setProp(slug, val) {
    var before = JSON.stringify(S.sel), lk = isLogo() ? logoKey() : ""; S.sel[slug] = val; fixSel(slug);
    if ((S.file || S.mot.files.length) && !isLogo() && before !== JSON.stringify(S.sel)) { S.file = null; S.previews = null; motReset(true); toast("Ausführung geändert – bitte die Gestaltung bzw. Datei erneut prüfen."); }
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
  window.PrintShop.saveDraftLink = function (design) {
    return api("/print/api/draft", Object.assign(cfgOf(), { design: design }));
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
    var body = { items: S.cart.map(function (x) { return { product: x.product, sel: x.sel, copies: x.copies, urgency: x.urgency, pm: x.pm, custom: x.custom, textile: x.textile, fileId: x.fileId, fileToken: x.fileToken, expectedGross: x.price.gross, motifs: x.motifs ? x.motifs.map(function (m) { return { copies: m.copies, fileId: m.fileId, fileToken: m.fileToken }; }) : undefined }; }),
      customer: Object.assign({ type: S.ctype, uid: S.ctype === "company" ? S.uid : "" }, S.customer), payment: S.payment, acceptTerms: true, acceptFagg: true, acceptProof: true,
      check: S.check === "pro" ? "pro" : "self", voucher: S.voucher && !S.voucherErr ? S.voucher : "", createAccount: !S.me && !!S.newAcct, accountPassword: !S.me && S.newAcct ? S.newPw : undefined };
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
        (o.groupSize > 1 ? '<p class="pd-muted">Teil eines Warenkorbs mit ' + o.groupSize + " Positionen – alle Bestellungen findest du in der Bestätigungsmail" + (S.me ? " und in deinem Kundenkonto" : "") + ".</p>" : "") +
        '<div class="btn-row" style="justify-content:center"><a class="ps-btn" href="/print">Weitere Drucksachen bestellen</a>' + (S.me ? '<a class="ps-btn" href="/print?konto">Mein Konto</a>' : "") + "</div>";
      var pv = ""; try { pv = localStorage.getItem("fsc-print-verify") || ""; } catch (e) {}
      if (pv && !S.me) { S.acct.email = pv; S.acct.mode = "code"; h += '<div class="ps-verify"><h3>Kundenkonto bestätigen</h3><p>Wir haben dir einen Code an <b>' + esc(pv) + '</b> geschickt.</p><form class="ps-form" data-acct-form="verify" novalidate><div class="ps-uidrow"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="ps-code" aria-label="Code"><button type="submit" class="ps-btn primary small">Bestätigen</button></div></form></div>'; }
      root.innerHTML = '<div class="ps-panel ps-status">' + h + "</div>";
    });
  }
  function retryPay(v) { var p = v.split("|"); fetch("/print/api/order/" + encodeURIComponent(p[0]) + "/pay?t=" + encodeURIComponent(p[1]), { method: "POST", headers: H, body: "{}" }).then(function (r) { return r.json(); }).then(function (j) { if (j.ok && j.checkoutUrl) location.href = j.checkoutUrl; else toast(j.error || "Zahlung nicht möglich", true); }); }
})();
