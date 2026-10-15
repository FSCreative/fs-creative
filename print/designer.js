/* FS Creative Druckshop – Online-Designer (Fabric.js 5.3.0 von cdnjs, erst in Schritt 3 geladen).
   Arbeitsfläche in Druckgeometrie: 1 mm = 4 Einheiten; Dokument = Endformat + 2 × Beschnitt. Hilfslinien (Beschnitt, Endformat,
   Sicherheitsabstand, Falz) werden nur angezeigt, nie exportiert. Export: je Seite SVG (Texte mit den mitgelieferten Schriften,
   Bilder in voller Auflösung eingebettet) → Server erzeugt daraus das Druck-PDF (Vektor, Schriften eingebettet, CMYK, TrimBox).
   Funktionen: Vorlagen, Text, Bilder (Zuschnitt, dpi-Warnung), Formen, Linien, QR-Code (URL/vCard), Hintergrund, Ebenen,
   Ausrichten/Verteilen, Gruppieren, Duplizieren, Rückgängig/Wiederholen, Tastenkürzel, Kopieren/Einfügen, Markenfarben & Logo,
   Smart Guides mit Einrasten, mm-Lineale, Zoom/Pan (Pinch), Vorder-/Rückseite, Autosave, Entwurf per Link, Vorschau & Druckdaten-Check. */
(function () {
  "use strict";
  var LIB = {
    fabric: { src: "https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js", sri: "sha512-P6uimDKoj1nnPSo2sPmgbZy99pPq9nHXhLwddOnLi1DC+fEM83FEUcHPRPifbx1rlRkdMinViaWyDfG45G9BuA==" },
    qr: { src: "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js", sri: "sha512-ZDSPMa/JM1D+7kdg2x3BsruQ6T/JpJo3jWDWkCZsP+5yVyp1KfESqLI+7RqB5k24F7p2cV7i2YHh/890y6P6Sw==" },
  };
  var U = 4, PT = 0.3528, MAXPX = 16e6, MAXSIDE = 6000;
  var PROPS = ["role", "__bg", "locked", "qr", "label", "nat", "dark", "name", "selectable", "evented", "hasControls", "lockMovementX", "lockMovementY", "lockScalingX", "lockScalingY", "lockRotation", "hoverCursor", "strokeUniform"];
  var SW = ["#000000", "#1d1d1f", "#6e6e73", "#d1d1d6", "#ffffff", "#0a84ff", "#003a75", "#5ac8fa", "#30d158", "#5c7f4f", "#ffe600", "#ffb703", "#ff6b35", "#ff375f", "#9d4eff", "#b08d57", "#f7f3ec", "#0a0a0f"];
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var r1 = function (n) { return Math.round(n * 10) / 10; };
  var isTouch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var toast = function (m, bad) { if (window.PrintShop) window.PrintShop.toast(m, bad); };
  function loadScript(l) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = l.src; if (l.sri) { s.integrity = l.sri; s.crossOrigin = "anonymous"; } s.referrerPolicy = "no-referrer"; s.onload = res; s.onerror = function () { rej(new Error("Bibliothek konnte nicht geladen werden")); }; document.head.appendChild(s); }); }
  var libsP = null;
  function libs() {
    if (!libsP) libsP = Promise.all([window.fabric ? 1 : loadScript(LIB.fabric), window.qrcode ? 1 : loadScript(LIB.qr), window.PrintTemplates ? 1 : loadScript({ src: "/print/templates.js?v=1" })]).catch(function (e) { libsP = null; throw e; });
    return libsP;
  }
  // ── Schriften (mitgeliefert, /print/fonts) ──
  var FONTS = [], fontCss = false;
  function fontFaces(list) {
    FONTS = list || []; if (fontCss) return; fontCss = true;
    var css = FONTS.map(function (f) { var a = [[400, "normal", ""]]; if (f.bold) a.push([700, "normal", ""]); if (f.italic) a.push([400, "italic", "i"]);
      return a.map(function (x) { return '@font-face{font-family:"' + f.family + '";src:url(/print/fonts/' + f.file + "-" + x[0] + x[2] + '.woff) format("woff");font-weight:' + x[0] + ";font-style:" + x[1] + ";font-display:block}"; }).join(""); }).join("");
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  }
  function fontInfo(fam) { return FONTS.filter(function (f) { return f.family === fam; })[0]; }
  function loadFont(fam, bold, italic) {
    if (!document.fonts || !fontInfo(fam)) return Promise.resolve();
    var p = document.fonts.load((italic ? "italic " : "") + (bold ? "700 " : "400 ") + "24px \"" + fam + "\"");
    return Promise.race([p, new Promise(function (r) { setTimeout(r, 4000); })]).then(function () { try { fabric.util.clearFabricFontCache(fam); } catch (e) {} });
  }
  function loadFontsOf(objs) {
    var seen = {}, ps = [];
    (function walk(list) { (list || []).forEach(function (o) { if (!o) return; if (o.objects) walk(o.objects); if (/text/i.test(o.type || "") || o.t === "text") { var fam = o.fontFamily || o.font, b = o.fontWeight === "bold" || o.bold, it = o.fontStyle === "italic" || o.italic, k = fam + b + it; if (fam && !seen[k]) { seen[k] = 1; ps.push(loadFont(fam, b, it)); } } }); })(objs);
    return Promise.all(ps);
  }
  // ── Bilder: große Bilder verkleinern (max. 16 MP), JPEG neu kodieren (Ausrichtung/EXIF) ──
  function readImage(file) {
    return new Promise(function (res, rej) {
      if (!/^image\/(png|jpeg)$/.test(file.type)) return rej(new Error("Bitte JPG oder PNG verwenden"));
      if (file.size > 40 * 1024 * 1024) return rej(new Error("Bild ist größer als 40 MB"));
      var fr = new FileReader(); fr.onerror = function () { rej(new Error("Bild konnte nicht gelesen werden")); };
      fr.onload = function () { var img = new Image(); img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, f = Math.min(1, MAXSIDE / Math.max(w, h), Math.sqrt(MAXPX / (w * h)));
        if (f >= 1 && file.type === "image/png") return res({ src: fr.result, w: w, h: h, scaled: false });
        var cw = Math.round(w * f), ch = Math.round(h * f), cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        var cx = cv.getContext("2d"); cx.imageSmoothingQuality = "high"; cx.drawImage(img, 0, 0, cw, ch);
        res({ src: file.type === "image/png" ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.95), w: cw, h: ch, scaled: f < 1 });
      }; img.onerror = function () { rej(new Error("Bildformat wird nicht unterstützt")); }; img.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  function pickFile(accept) { return new Promise(function (res) { var i = document.createElement("input"); i.type = "file"; i.accept = accept || "image/png,image/jpeg"; i.onchange = function () { res(i.files && i.files[0]); }; i.click(); }); }
  // ── Farben ──
  function hexOf(c) { if (!c || typeof c !== "string") return "#000000"; if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase(); if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map(function (x) { return x + x; }).join("").toLowerCase(); var m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? "#" + [1, 2, 3].map(function (i) { return ("0" + (+m[i]).toString(16)).slice(-2); }).join("") : "#000000"; }
  function vivid(c) { // sehr gesättigte Bildschirmfarbe → im CMYK-Druck matter
    var h = hexOf(c), r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx ? (mx - mn) / mx : 0, hue = 0;
    if (mx !== mn) { if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2); else hue = 60 * ((r - g) / (mx - mn) + 4); }
    if (hue < 0) hue += 360;
    return s > 0.72 && mx > 0.78 && !(hue >= 42 && hue <= 68);
  }
  var BRANDK = "fsc-print-brand";
  function brand(v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(BRANDK) || "null") || { colors: [], logo: null }; localStorage.setItem(BRANDK, JSON.stringify(v)); return v; } catch (e) { if (v !== undefined) toast("Speichern im Browser nicht möglich (Speicher voll?)", true); return { colors: [], logo: null }; } }

  var D = null;
  var ICON = {
    tpl: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
    shape: '<rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16.5" cy="7.5" r="4.5"/>', qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/>',
    bg: '<path d="M4 20 20 4M4 13 13 4M11 20l9-9"/><rect x="3" y="3" width="18" height="18" rx="2"/>', layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    brand: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
    check: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>', dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    al: '<path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/>', ac: '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>', ar: '<path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/>',
    at: '<path d="M3 4h18M7 8h4v10H7zM14 8h4v6h-4z"/>', am: '<path d="M3 12h18M7 6h4v12H7zM14 8h4v8h-4z"/>', ab: '<path d="M3 20h18M7 6h4v10H7zM14 10h4v6h-4z"/>',
    dh: '<path d="M4 4v16M20 4v16M9 8h2v8H9zM13 8h2v8h-2z"/>', dv: '<path d="M4 4h16M4 20h16M8 9h8v2H8zM8 13h8v2H8z"/>', grp: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M3 15v6h6M21 9V3h-6" stroke-dasharray="2 2"/>',
    tl: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', tc: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', tr: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>', tj: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7M8 21v-7h8v7"/>',
  };
  var svgI = function (k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[k] || "") + "</svg>"; };
  var TOOLS = [["tpl", "Vorlagen"], ["text", "Text"], ["img", "Bilder"], ["shape", "Formen"], ["qr", "QR-Code"], ["bg", "Hinter&shy;grund"], ["layers", "Ebenen"], ["brand", "Marke"], ["check", "Prüfen"]];

  // ── Öffnen ──
  function open(opts) {
    if (D) close(true);
    return libs().then(function () {
      fontFaces(opts.fonts);
      fabric.Object.prototype.set({ transparentCorners: false, cornerColor: "#ffffff", cornerStrokeColor: "#0a84ff", borderColor: "#0a84ff", cornerStyle: "circle", cornerSize: isTouch ? 16 : 10, touchCornerSize: 34, borderScaleFactor: 1.6, padding: 1 });
      fabric.Textbox.prototype.set({ editingBorderColor: "#0a84ff", cursorColor: "#0a84ff", selectionColor: "rgba(10,132,255,.25)" });
      var sz = opts.size, b = opts.bleed;
      var foldName = ((opts.labels || []).filter(function (l) { return /fold|falz/i.test(l[0]); })[0] || [])[1] || "";
      var panels = opts.product.key === "folder" ? (/wickel|zickzack|leporello|zig|letter|wrap|z-|3|drei/i.test(foldName) ? 3 : 2) : 1;
      var shape = ((opts.labels || []).filter(function (l) { return l[0] === "shape"; })[0] || [])[1] || "";
      D = { o: opts, W: (sz.w + 2 * b) * U, H: (sz.h + 2 * b) * U, mm: sz, b: b, safe: opts.safe || 3, sides: opts.sides, panels: panels, round: /rund|round|kreis|circle/i.test(shape + " " + (opts.sel.shape || "")),
        pages: [], cur: 0, hist: [], fut: [], panel: "tpl", guides: [], showGuides: true, showBleed: true, snap: true, imgs: {}, clip: null, dirty: false, keyH: null, loading: false };
      D.trim = { x: b * U, y: b * U, w: sz.w * U, h: sz.h * U };
      D.saferect = { x: (b + D.safe) * U, y: (b + D.safe) * U, w: (sz.w - 2 * D.safe) * U, h: (sz.h - 2 * D.safe) * U };
      D.akey = "fsc-print-autosave:" + opts.product.key + ":" + JSON.stringify(opts.sel);
      for (var i = 0; i < D.sides; i++) { D.pages.push(null); D.hist.push([]); D.fut.push([]); }
      build();
      var start = opts.design && opts.design.pages && opts.design.pages.length === D.sides ? Promise.resolve(opts.design.pages) : null;
      var auto = null; try { auto = JSON.parse(localStorage.getItem(D.akey) || "null"); } catch (e) {}
      if (start) return start.then(function (p) { D.pages = p.slice(); return loadPage(0, true); });
      if (auto && auto.pages && auto.pages.length === D.sides) {
        return applyTemplate(PrintTemplates.list(opts.product.key)[0].id, true).then(function () {
          modal('<h3>Entwurf fortsetzen?</h3><p class="pd-muted">Es gibt eine automatisch gespeicherte Gestaltung vom ' + esc(new Date(auto.at).toLocaleString("de-AT")) + '.</p><div class="foot"><button class="ps-btn" data-a="m:new">Neu beginnen</button><button class="ps-btn primary" data-a="m:resume">Fortsetzen</button></div>', function (a) { if (a === "resume") { D.pages = auto.pages.slice(); D.hist = D.pages.map(function () { return []; }); loadPage(0, true); } });
        });
      }
      return applyTemplate(PrintTemplates.list(opts.product.key)[0].id, true);
    }).then(function () { setPanel(isTouch ? null : "tpl"); });
  }
  function close(silent) {
    if (!D) return;
    try { saveCur(); } catch (e) {}
    var design = { pages: D.pages.slice() };
    document.removeEventListener("keydown", D.keyH, true); window.removeEventListener("resize", D.resizeH);
    if (D.ro) D.ro.disconnect();
    try { D.c.dispose(); } catch (e) {}
    D.root.remove(); document.body.classList.remove("pd-open");
    var o = D.o; D = null;
    if (!silent && o.onClose) o.onClose(design);
  }

  // ── Aufbau ──
  function build() {
    var o = D.o, sideNames = D.o.product.key === "folder" ? ["Außenseite", "Innenseite"] : ["Vorderseite", "Rückseite"];
    var root = document.createElement("div"); root.className = "pd"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Designer " + o.product.title);
    var tools = function (cls) { return TOOLS.map(function (t) { return '<button type="button" class="pd-tool ' + cls + '" data-tool="' + t[0] + '" aria-pressed="false">' + svgI(t[0]) + "<span>" + t[1] + "</span></button>"; }).join(""); };
    root.innerHTML = '<div class="pd-top"><button type="button" class="pd-ib" data-a="close" aria-label="Designer schließen" title="Schließen">' + svgI("close") + '</button>' +
      '<div class="ttl">' + esc(o.product.title) + "<small>" + D.mm.w + " × " + D.mm.h + " mm · Beschnitt " + D.b + " mm</small></div>" +
      (D.sides > 1 ? '<div class="pd-pages" role="tablist">' + sideNames.slice(0, D.sides).map(function (n, i) { return '<button type="button" role="tab" data-page="' + i + '" aria-current="' + (i === 0) + '"><span class="lf">' + n + '</span><span class="ls">' + (D.o.product.key === "folder" ? ["Außen", "Innen"] : ["Vorne", "Hinten"])[i] + "</span></button>"; }).join("") + "</div>" : "") +
      '<span class="sp"></span><button type="button" class="pd-ib" data-a="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig">' + svgI("undo") + '</button><button type="button" class="pd-ib" data-a="redo" title="Wiederholen (Strg+Umschalt+Z)" aria-label="Wiederholen">' + svgI("redo") + "</button>" +
      '<button type="button" class="pd-ib hm" data-a="preview" title="Vorschau">' + svgI("eye") + '<span class="lbl">Vorschau</span></button><button type="button" class="pd-ib hm" data-a="savelink" title="Entwurf per Link speichern">' + svgI("link") + '<span class="lbl">Link</span></button>' +
      '<button type="button" class="pd-ib primary" data-a="finish">Fertig</button></div>' +
      '<div class="pd-rail" role="toolbar" aria-label="Werkzeuge">' + tools("") + "</div>" +
      '<div class="pd-stage"><div class="pd-corner"></div><canvas class="pd-rh" aria-hidden="true"></canvas><canvas class="pd-rv" aria-hidden="true"></canvas><div class="pd-cv"><canvas></canvas></div>' +
      '<div class="pd-zoom"><div class="pd-legend"><span><i style="border-color:#ff375f"></i>Endformat (Schnitt)</span><span><i style="border-color:#ff9f9f;border-top-width:6px;opacity:.6"></i>Beschnitt ' + D.b + ' mm</span><span><i style="border-color:#0a84ff;border-top-style:dashed"></i>Sicherheitsabstand</span>' + (D.panels > 1 ? '<span><i style="border-color:#30d158;border-top-style:dashed"></i>Falz</span>' : "") + "</div>" +
      '<div class="grp"><button type="button" class="pd-ib" data-a="guides" aria-pressed="true" title="Hilfslinien ein/aus">' + svgI("eye") + '</button><button type="button" class="pd-ib" data-a="cut" aria-pressed="false" title="Schnittvorschau (ohne Beschnitt)">✂︎</button><button type="button" class="pd-ib" data-a="zoomout" aria-label="Verkleinern">' + svgI("minus") + '</button><span id="pdZ">100 %</span><button type="button" class="pd-ib" data-a="zoomin" aria-label="Vergrößern">' + svgI("plus") + '</button><button type="button" class="pd-ib" data-a="fit" title="Einpassen">' + svgI("fit") + "</button></div></div></div>" +
      '<div class="pd-props" aria-live="polite"><div class="pd-sheet-h"><b id="pdPT"></b><button type="button" class="pd-ib" data-a="sheetclose" aria-label="Schließen">' + svgI("close") + '</button></div><div id="pdP"></div></div>' +
      '<div class="pd-mbar" role="toolbar" aria-label="Werkzeuge"><button type="button" class="pd-tool" data-tool="obj" aria-pressed="false" hidden>' + svgI("edit") + "<span>Bearbeiten</span></button>" + tools("") + "</div>";
    document.body.appendChild(root); document.body.classList.add("pd-open");
    D.root = root; D.cv = root.querySelector(".pd-cv"); D.rh = root.querySelector(".pd-rh"); D.rv = root.querySelector(".pd-rv"); D.P = root.querySelector("#pdP");
    var el = D.cv.querySelector("canvas");
    var c = D.c = new fabric.Canvas(el, { preserveObjectStacking: true, selection: !isTouch, stopContextMenu: true, enableRetinaScaling: true, uniformScaling: true, targetFindTolerance: isTouch ? 8 : 4, perPixelTargetFind: false });
    c.setDimensions({ width: D.cv.clientWidth || 300, height: D.cv.clientHeight || 300 });
    fit();
    c.on("after:render", overlay);
    c.on("object:moving", snapMove);
    c.on("mouse:up", function () { if (D.guides.length) { D.guides = []; c.requestRenderAll(); } });
    ["object:modified", "object:added", "object:removed"].forEach(function (ev) { c.on(ev, function (e) { if (e && e.target && e.target.__tmp) return; changed(); }); });
    c.on("text:changed", function () { changed(); syncTextArea(); });
    c.on("selection:created", onSel); c.on("selection:updated", onSel); c.on("selection:cleared", onSel);
    c.on("mouse:wheel", function (opt) { var e = opt.e; e.preventDefault(); e.stopPropagation();
      if (e.ctrlKey || e.metaKey) { var z = c.getZoom() * Math.pow(0.996, e.deltaY); zoomTo(z, new fabric.Point(e.offsetX, e.offsetY)); }
      else { c.relativePan(new fabric.Point(-e.deltaX, -e.deltaY)); afterView(); } });
    // Verschieben der Ansicht: Leertaste/Alt + Ziehen, am Handy Ziehen auf leerer Fläche
    c.on("mouse:down", function (opt) { var e = opt.e; if (D.space || e.altKey || (isTouch && !opt.target)) { D.pan = { x: (e.touches ? e.touches[0] : e).clientX, y: (e.touches ? e.touches[0] : e).clientY }; c.selection = false; } });
    c.on("mouse:move", function (opt) { if (!D.pan || D.pinch) return; var e = opt.e, p = e.touches ? e.touches[0] : e; if (!p) return; c.relativePan(new fabric.Point(p.clientX - D.pan.x, p.clientY - D.pan.y)); D.pan = { x: p.clientX, y: p.clientY }; afterView(); });
    c.on("mouse:up", function () { if (D.pan) { D.pan = null; c.selection = !isTouch; } });
    // Pinch-Zoom mit zwei Fingern
    D.cv.addEventListener("touchstart", function (e) { if (e.touches.length === 2) { e.preventDefault(); e.stopPropagation(); var a = e.touches[0], bb = e.touches[1], r = D.cv.getBoundingClientRect(); D.pinch = { d: Math.hypot(a.clientX - bb.clientX, a.clientY - bb.clientY), z: c.getZoom(), mid: { x: (a.clientX + bb.clientX) / 2 - r.left, y: (a.clientY + bb.clientY) / 2 - r.top }, v: c.viewportTransform.slice() }; c._currentTransform = null; D.pan = null; } }, { passive: false, capture: true });
    D.cv.addEventListener("touchmove", function (e) { if (!D.pinch || e.touches.length !== 2) return; e.preventDefault(); e.stopPropagation(); var a = e.touches[0], bb = e.touches[1], r = D.cv.getBoundingClientRect(), P = D.pinch;
      var z = Math.max(P.z * 0.1, Math.min(P.z * 12, P.z * Math.hypot(a.clientX - bb.clientX, a.clientY - bb.clientY) / P.d)), mx = (a.clientX + bb.clientX) / 2 - r.left, my = (a.clientY + bb.clientY) / 2 - r.top;
      var dx = (P.mid.x - P.v[4]) / P.z, dy = (P.mid.y - P.v[5]) / P.z; c.setViewportTransform([z, 0, 0, z, mx - dx * z, my - dy * z]); afterView(); }, { passive: false, capture: true });
    D.cv.addEventListener("touchend", function (e) { if (e.touches.length < 2) D.pinch = null; }, { capture: true });
    // Größe
    D.resizeH = function () { var w = D.cv.clientWidth, h = D.cv.clientHeight; if (!w || !h) return; c.setDimensions({ width: w, height: h }); if (!D.userZoom) fit(); else afterView(); };
    if (window.ResizeObserver) { D.ro = new ResizeObserver(D.resizeH); D.ro.observe(D.cv); } window.addEventListener("resize", D.resizeH);
    root.addEventListener("click", onClick); root.addEventListener("input", onInput); root.addEventListener("change", onChange);
    D.keyH = onKey; document.addEventListener("keydown", D.keyH, true);
    document.addEventListener("keyup", function ku(e) { if (!D) { document.removeEventListener("keyup", ku); return; } if (e.code === "Space") D.space = false; });
  }

  // ── Ansicht: Einpassen, Zoom, Lineale ──
  function fit() { var c = D.c, cw = c.getWidth(), ch = c.getHeight(), pad = isTouch ? 18 : 40, z = Math.min((cw - pad * 2) / D.W, (ch - pad * 2) / D.H); c.setViewportTransform([z, 0, 0, z, (cw - D.W * z) / 2, (ch - D.H * z) / 2]); D.userZoom = false; afterView(); }
  function zoomTo(z, pt) { var c = D.c; z = Math.max(0.05, Math.min(60, z)); c.zoomToPoint(pt || new fabric.Point(c.getWidth() / 2, c.getHeight() / 2), z); D.userZoom = true; afterView(); }
  var rulerRaf = 0;
  function afterView() { var el = D.root.querySelector("#pdZ"); if (el) el.textContent = Math.round(D.c.getZoom() * U / 3.7795 * 100) + " %"; D.c.requestRenderAll(); if (!rulerRaf) rulerRaf = requestAnimationFrame(function () { rulerRaf = 0; if (D) rulers(); }); }
  function rulers() {
    var c = D.c, v = c.viewportTransform, z = v[0], dpr = window.devicePixelRatio || 1, ppm = z * U;
    var steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], major = steps.filter(function (s) { return s * ppm >= 46; })[0] || 1000, minor = major / (String(major)[0] === "2" ? 4 : 5);
    [[D.rh, true], [D.rv, false]].forEach(function (pair) {
      var cv = pair[0], hor = pair[1], w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      var x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h); x.fillStyle = "#16161c"; x.fillRect(0, 0, w, h);
      var off = hor ? v[4] : v[5], len = hor ? w : h, o0 = (hor ? D.trim.x : D.trim.y) * z + off; // Bildschirmposition von 0 mm (Endformat)
      x.fillStyle = "rgba(10,132,255,.18)"; var a = o0, bnd = (hor ? D.mm.w : D.mm.h) * ppm; if (hor) x.fillRect(a, 0, bnd, h); else x.fillRect(0, a, w, bnd);
      x.strokeStyle = "#5a5a66"; x.fillStyle = "#a1a1aa"; x.font = "10px -apple-system,Segoe UI,sans-serif"; x.lineWidth = 1;
      var startMm = Math.floor(-o0 / ppm / minor) * minor, endMm = (len - o0) / ppm;
      for (var mm = startMm; mm <= endMm; mm += minor) { var p = Math.round(o0 + mm * ppm) + 0.5, isMaj = Math.abs(mm / major - Math.round(mm / major)) < 1e-6, t = isMaj ? 10 : 5;
        x.beginPath(); if (hor) { x.moveTo(p, h); x.lineTo(p, h - t); } else { x.moveTo(w, p); x.lineTo(w - t, p); } x.stroke();
        if (isMaj) { var lab = String(Math.round(mm)); if (hor) x.fillText(lab, p + 2, 9); else { x.save(); x.translate(9, p + 2); x.rotate(-Math.PI / 2); x.fillText(lab, -x.measureText(lab).width - 2, 0); x.restore(); } } }
    });
  }
  function overlay(e) {
    if (!D || D.exporting) return;
    var c = D.c, ctx = c.contextContainer, v = c.viewportTransform, z = v[0], T = D.trim, S = D.saferect;
    ctx.save(); ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
    // Beschnittzone
    ctx.beginPath(); ctx.rect(0, 0, D.W, D.H);
    if (D.round) { ctx.moveTo(T.x + T.w, T.y + T.h / 2); ctx.ellipse(T.x + T.w / 2, T.y + T.h / 2, T.w / 2, T.h / 2, 0, 0, Math.PI * 2, true); } else { ctx.moveTo(T.x, T.y); ctx.lineTo(T.x, T.y + T.h); ctx.lineTo(T.x + T.w, T.y + T.h); ctx.lineTo(T.x + T.w, T.y); ctx.closePath(); }
    ctx.fillStyle = D.showBleed ? "rgba(255,69,58,.13)" : "#2a2b33"; ctx.fill("evenodd");
    if (D.showGuides) {
      ctx.lineWidth = 1.3 / z; ctx.strokeStyle = "#ff375f"; ctx.setLineDash([]);
      ctx.beginPath(); if (D.round) ctx.ellipse(T.x + T.w / 2, T.y + T.h / 2, T.w / 2, T.h / 2, 0, 0, Math.PI * 2); else ctx.rect(T.x, T.y, T.w, T.h); ctx.stroke();
      ctx.lineWidth = 1 / z; ctx.strokeStyle = "#0a84ff"; ctx.setLineDash([6 / z, 4 / z]); ctx.beginPath();
      if (D.round) ctx.ellipse(T.x + T.w / 2, T.y + T.h / 2, S.w / 2, S.h / 2, 0, 0, Math.PI * 2); else ctx.rect(S.x, S.y, S.w, S.h); ctx.stroke();
      if (D.panels > 1) { ctx.strokeStyle = "#30d158"; ctx.setLineDash([8 / z, 5 / z]); for (var i = 1; i < D.panels; i++) { var fx = T.x + T.w * i / D.panels; ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, D.H); ctx.stroke(); } }
      ctx.setLineDash([]);
    }
    if (D.guides.length) { ctx.strokeStyle = "#ff2d92"; ctx.lineWidth = 1 / z; D.guides.forEach(function (g) { ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x, -D.H); ctx.lineTo(g.x, D.H * 2); } else { ctx.moveTo(-D.W, g.y); ctx.lineTo(D.W * 2, g.y); } ctx.stroke(); }); }
    ctx.restore();
    if (!rulerRaf) rulerRaf = requestAnimationFrame(function () { rulerRaf = 0; if (D) rulers(); });
  }
  // Smart Guides: Kanten/Mitten von Endformat, Sicherheitsabstand und anderen Objekten
  function snapMove(e) {
    var o = e.target; if (!D.snap || !o) return;
    var c = D.c, z = c.getZoom(), th = 7 / z, br = o.getBoundingRect(true, true), T = D.trim, S = D.saferect;
    var xs = [T.x, T.x + T.w / 2, T.x + T.w, S.x, S.x + S.w, 0, D.W], ys = [T.y, T.y + T.h / 2, T.y + T.h, S.y, S.y + S.h, 0, D.H];
    if (D.panels > 1) for (var i = 1; i < D.panels; i++) xs.push(T.x + T.w * i / D.panels);
    c.getObjects().forEach(function (x) { if (x === o || x.__bg || !x.visible || (o.contains && o.contains(x))) return; var b = x.getBoundingRect(true, true); xs.push(b.left, b.left + b.width / 2, b.left + b.width); ys.push(b.top, b.top + b.height / 2, b.top + b.height); });
    D.guides = [];
    var best = function (edges, cands) { var r = null; edges.forEach(function (ed) { cands.forEach(function (cd) { var d = cd - ed; if (Math.abs(d) <= th && (!r || Math.abs(d) < Math.abs(r.d))) r = { d: d, at: cd }; }); }); return r; };
    var bx = best([br.left, br.left + br.width / 2, br.left + br.width], xs), by = best([br.top, br.top + br.height / 2, br.top + br.height], ys);
    if (bx) { o.left += bx.d; D.guides.push({ x: bx.at }); } if (by) { o.top += by.d; D.guides.push({ y: by.at }); }
    if (bx || by) o.setCoords();
  }

  // ── Seiten, Verlauf, Autosave ──
  function packJSON(j) { (function walk(list) { (list || []).forEach(function (o) { if (o.objects) walk(o.objects); if (o.type === "image" && o.src && o.src.length > 200) { var k = D.imgs.__rev && D.imgs.__rev.get(o.src); if (!k) { k = "img" + Object.keys(D.imgs).length; D.imgs[k] = o.src; (D.imgs.__rev = D.imgs.__rev || new Map()).set(o.src, k); } o.src = "#" + k; } }); })(j.objects); return j; }
  function unpackJSON(j) { j = JSON.parse(JSON.stringify(j)); (function walk(list) { (list || []).forEach(function (o) { if (o.objects) walk(o.objects); if (o.type === "image" && /^#img\d+$/.test(o.src || "")) o.src = D.imgs[o.src.slice(1)] || ""; }); })(j.objects); return j; }
  function snapshot() { return packJSON(D.c.toJSON(PROPS)); }
  function saveCur() { if (!D || D.loading) return; D.pages[D.cur] = unpackJSON(snapshot()); }
  var chT = 0, asT = 0;
  function changed() {
    if (!D || D.loading) return; D.dirty = true;
    clearTimeout(chT); chT = setTimeout(function () { if (!D || D.loading) return; var s = JSON.stringify(snapshot()), h = D.hist[D.cur]; if (h[h.length - 1] !== s) { h.push(s); if (h.length > 60) h.shift(); D.fut[D.cur] = []; } updUndo(); if (D.panel === "layers" || D.panel === "check") renderPanel(); }, 250);
    clearTimeout(asT); asT = setTimeout(autosave, 1500);
  }
  function autosave() { if (!D) return; saveCur(); try { localStorage.setItem(D.akey, JSON.stringify({ at: Date.now(), pages: D.pages })); D.asFail = false; } catch (e) { D.asFail = true; } }
  function updUndo() { if (!D) return; var u = D.root.querySelector('[data-a="undo"]'), r = D.root.querySelector('[data-a="redo"]'); if (u) u.disabled = D.hist[D.cur].length < 2; if (r) r.disabled = !D.fut[D.cur].length; }
  function loadJSON(json) {
    D.loading = true;
    return loadFontsOf(json.objects).then(function () { return new Promise(function (res) { D.c.loadFromJSON(json, function () { D.c.getObjects().forEach(function (o) { if (o.__bg) o.set({ selectable: false, evented: false, hoverCursor: "default" }); if (o.type === "textbox") { o.initDimensions(); o.setCoords(); } }); D.c.requestRenderAll(); D.loading = false; res(); }); }); });
  }
  function loadPage(i, first) {
    if (!first) saveCur();
    D.cur = i; D.c.discardActiveObject();
    var j = D.pages[i] || { objects: [] };
    return loadJSON(j).then(function () {
      if (!D.c.getObjects().some(function (o) { return o.__bg; })) { addBg("#ffffff"); }
      if (!D.hist[i].length) D.hist[i].push(JSON.stringify(snapshot()));
      updUndo(); D.root.querySelectorAll("[data-page]").forEach(function (b) { b.setAttribute("aria-current", String(+b.getAttribute("data-page") === i)); });
      renderPanel();
    });
  }
  function undo(redo) {
    var h = D.hist[D.cur], f = D.fut[D.cur];
    if (!redo) { if (h.length < 2) return; f.push(h.pop()); } else { if (!f.length) return; h.push(f.pop()); }
    loadJSON(unpackJSON(JSON.parse(h[h.length - 1]))).then(function () { updUndo(); renderPanel(); clearTimeout(asT); asT = setTimeout(autosave, 1500); });
  }

  // ── Objekte anlegen ──
  var X = function (mm) { return (mm + D.b) * U; };
  function addBg(fill) { var r = new fabric.Rect({ left: 0, top: 0, width: D.W, height: D.H, fill: fill, strokeWidth: 0, selectable: false, evented: false, hoverCursor: "default", __bg: true, name: "Hintergrund" }); r.__bg = true; D.c.add(r); D.c.moveTo(r, 0); return r; }
  function bgRect() { return D.c.getObjects().filter(function (o) { return o.__bg; })[0] || addBg("#ffffff"); }
  function ptToU(pt) { return pt * PT * U; }
  function textObj(o) {
    return new fabric.Textbox(o.text, { left: o.left, top: o.top, width: o.width, fontFamily: o.font || "Inter", fontSize: o.fontSize, fontWeight: o.bold ? "bold" : "normal", fontStyle: o.italic ? "italic" : "normal", fill: o.color || "#000000", textAlign: o.align || "left", lineHeight: o.lh || 1.16, charSpacing: o.ls || 0, splitByGrapheme: false, objectCaching: true, minWidth: 8 });
  }
  function placeholder(x, y, w, h, label, dark) {
    var col = dark ? "rgba(255,255,255,.75)" : "rgba(10,132,255,.9)";
    var r = new fabric.Rect({ left: 0, top: 0, width: w, height: h, fill: dark ? "rgba(255,255,255,.08)" : "rgba(10,132,255,.07)", stroke: col, strokeWidth: Math.max(1, Math.min(w, h) * 0.012), strokeDashArray: [Math.max(3, w * 0.02), Math.max(2, w * 0.014)], strokeUniform: true });
    var t = new fabric.Text("+ " + (label || "Bild"), { fontFamily: "Inter", fontSize: Math.max(8, Math.min(w * 0.09, h * 0.22)), fill: col, originX: "center", originY: "center", left: w / 2, top: h / 2 });
    var g = new fabric.Group([r, t], { left: x, top: y, role: "ph", label: label || "Bild", dark: !!dark, name: (label || "Bild") + "-Platzhalter" }); g.role = "ph"; return g;
  }
  function qrObj(data, sizeU, color, transparent) {
    var q = qrcode(0, "M"); q.addData(unescape(encodeURIComponent(data))); q.make();
    var n = q.getModuleCount(), quiet = 2, tot = n + quiet * 2, d = "";
    for (var r = 0; r < n; r++) for (var cc = 0; cc < n; cc++) if (q.isDark(r, cc)) d += "M" + (cc + quiet) + " " + (r + quiet) + "h1v1h-1z";
    var path = new fabric.Path(d, { fill: color || "#000000", left: 0, top: 0, strokeWidth: 0, objectCaching: false });
    path.set({ left: quiet, top: quiet });
    var items = transparent ? [path] : [new fabric.Rect({ left: 0, top: 0, width: tot, height: tot, fill: "#ffffff", strokeWidth: 0 }), path];
    var g = new fabric.Group(items, { role: "qr", name: "QR-Code" }); var s = sizeU / tot; g.set({ scaleX: s, scaleY: s, lockUniScaling: true }); g.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false }); return g;
  }
  function elemToObj(e) {
    var o;
    if (e.t === "rect") o = new fabric.Rect({ left: X(e.x), top: X(e.y), width: e.w * U, height: e.h * U, fill: e.fill || null, stroke: e.stroke || null, strokeWidth: e.stroke ? e.sw * U : 0, rx: (e.rx || 0) * U, ry: (e.rx || 0) * U, opacity: e.opacity == null ? 1 : e.opacity, strokeUniform: true });
    else if (e.t === "circle") o = new fabric.Circle({ left: X(e.cx - e.r), top: X(e.cy - e.r), radius: e.r * U, fill: e.fill || null, stroke: e.stroke || null, strokeWidth: e.stroke ? e.sw * U : 0, opacity: e.opacity == null ? 1 : e.opacity, strokeUniform: true });
    else if (e.t === "line") o = new fabric.Line([X(e.x1), X(e.y1), X(e.x2), X(e.y2)], { stroke: e.stroke, strokeWidth: e.sw * U, strokeUniform: true });
    else if (e.t === "text") o = textObj({ text: e.text, left: X(e.x), top: X(e.y), width: e.w * U, font: e.font, fontSize: ptToU(e.size), bold: e.bold && (fontInfo(e.font) || {}).bold !== false, italic: e.italic, color: e.color, align: e.align, lh: e.lh, ls: e.ls });
    else if (e.t === "img") o = placeholder(X(e.x), X(e.y), e.w * U, e.h * U, e.label, e.dark);
    else if (e.t === "qr") { o = qrObj(e.data, e.s * U, e.color); o.set({ left: X(e.x), top: X(e.y) }); o.qr = { mode: "url", url: e.data, color: e.color || "#000000" }; }
    return o;
  }
  function applyTemplate(id, initial) {
    var ctx = { product: D.o.product.key, w: D.mm.w, h: D.mm.h, bleed: D.b, safe: D.safe, sides: D.sides, panels: D.panels, round: D.round };
    var pages = PrintTemplates.build(id, ctx), all = []; pages.forEach(function (p) { all = all.concat(p); });
    return loadFontsOf(all).then(function () {
      var sc = new fabric.StaticCanvas(null, { width: D.W, height: D.H });
      D.pages = pages.map(function (els) { sc.clear(); els.forEach(function (e) { if (e.t === "bg") { var r = new fabric.Rect({ left: 0, top: 0, width: D.W, height: D.H, fill: e.fill, strokeWidth: 0, selectable: false, evented: false, hoverCursor: "default", __bg: true, name: "Hintergrund" }); r.__bg = true; sc.add(r); } else { var o = elemToObj(e); if (o) sc.add(o); } }); return sc.toJSON(PROPS); });
      sc.dispose();
      D.hist = D.pages.map(function () { return []; }); D.fut = D.pages.map(function () { return []; });
      D.dirty = !initial; return loadPage(0, true);
    });
  }
  function center(o) { o.set({ left: D.trim.x + (D.trim.w - o.getScaledWidth()) / 2, top: D.trim.y + (D.trim.h - o.getScaledHeight()) / 2 }); o.setCoords(); }
  function addObj(o, keepPos) { if (!keepPos) center(o); D.c.add(o); D.c.setActiveObject(o); D.c.requestRenderAll(); if (isTouch) setPanel("obj"); }
  var baseScale = function () { return Math.min(D.mm.w, D.mm.h) / 55; };
  function addText(kind) {
    var s = baseScale(), P = { h: ["Überschrift", 15, true, "Montserrat"], s: ["Untertitel", 9, false, "Inter"], b: ["Hier steht dein Text. Doppelt antippen zum Bearbeiten.", 7, false, "Inter"] }[kind] || ["Text", 9, false, "Inter"];
    var o = textObj({ text: P[0], left: 0, top: 0, width: D.trim.w * (kind === "b" ? 0.7 : 0.8), font: P[3], fontSize: ptToU(P[1] * Math.max(0.6, s)), bold: P[2], color: hexOf((bgRect().fill)) === "#0a0a0f" ? "#ffffff" : "#1d1d1f", align: "left" });
    loadFont(P[3], P[2], false).then(function () { addObj(o); });
  }
  function addShape(k) {
    var m = Math.min(D.trim.w, D.trim.h) * 0.35, o, fill = "#0a84ff";
    if (k === "rect") o = new fabric.Rect({ width: m * 1.4, height: m, fill: fill, strokeUniform: true });
    else if (k === "round") o = new fabric.Rect({ width: m * 1.4, height: m, rx: m * 0.15, ry: m * 0.15, fill: fill, strokeUniform: true });
    else if (k === "circle") o = new fabric.Circle({ radius: m / 2, fill: fill, strokeUniform: true });
    else if (k === "tri") o = new fabric.Triangle({ width: m, height: m * 0.87, fill: fill, strokeUniform: true });
    else if (k === "star") { var pts = []; for (var i = 0; i < 10; i++) { var a = Math.PI / 5 * i - Math.PI / 2, r = i % 2 ? m * 0.21 : m / 2; pts.push({ x: m / 2 + r * Math.cos(a), y: m / 2 + r * Math.sin(a) }); } o = new fabric.Polygon(pts, { fill: fill, strokeUniform: true }); }
    else if (k === "line") o = new fabric.Line([0, 0, m * 1.6, 0], { stroke: "#1d1d1f", strokeWidth: 0.5 * U, strokeUniform: true });
    else if (k === "frame") o = new fabric.Rect({ width: D.saferect.w, height: D.saferect.h, fill: null, stroke: "#1d1d1f", strokeWidth: 0.4 * U, strokeUniform: true });
    if (o) addObj(o);
  }
  function addImage(file, opt) {
    opt = opt || {};
    return readImage(file).then(function (im) { return new Promise(function (res) { fabric.Image.fromURL(im.src, function (img) {
      img.set({ nat: { w: im.w, h: im.h }, name: opt.name || file.name.replace(/\.[^.]+$/, "").slice(0, 30) || "Bild" });
      var ph = opt.ph, T = D.trim;
      if (opt.bg) { var s = Math.max(D.W / im.w, D.H / im.h); img.set({ scaleX: s, scaleY: s, left: (D.W - im.w * s) / 2, top: (D.H - im.h * s) / 2, role: "bgimg", name: "Hintergrundbild" }); D.c.add(img); D.c.moveTo(img, 1); }
      else if (ph) { var pb = ph.getBoundingRect(true, true), s2 = Math.max(pb.width / im.w, pb.height / im.h); img.set({ scaleX: s2, scaleY: s2 });
        // in den Platzhalter einpassen (Rest zuschneiden)
        var cw = pb.width / s2, ch = pb.height / s2; img.set({ cropX: (im.w - cw) / 2, cropY: (im.h - ch) / 2, width: cw, height: ch, left: pb.left, top: pb.top });
        var idx = D.c.getObjects().indexOf(ph); D.c.remove(ph); D.c.insertAt(img, idx); }
      else { var s3 = Math.min(T.w * 0.6 / im.w, T.h * 0.6 / im.h); img.set({ scaleX: s3, scaleY: s3 }); center(img); D.c.add(img); }
      img.setCoords(); D.c.setActiveObject(img); D.c.requestRenderAll(); changed();
      if (im.scaled) toast("Sehr großes Bild – auf " + im.w + " × " + im.h + " px verkleinert (reicht für scharfen Druck).");
      var dpi = dpiOf(img); if (dpi < 250) toast("Achtung: Bild hat bei dieser Größe nur " + dpi + " dpi – kleiner platzieren oder größeres Bild verwenden.", true);
      res(img); }); }); }).catch(function (e) { toast(e.message, true); });
  }
  function dpiOf(o) { if (!o || o.type !== "image") return 0; var wmm = o.getScaledWidth() / U, hmm = o.getScaledHeight() / U; return Math.round(Math.min(o.width / (wmm / 25.4), o.height / (hmm / 25.4))); }

  // ── Auswahl & Eigenschaften ──
  function act() { return D.c.getActiveObject(); }
  function onSel() { var o = act(); var mb = D.root.querySelector('.pd-mbar [data-tool="obj"]'); if (mb) mb.hidden = !o; if (o) { if (!isTouch || D.root.classList.contains("sheet-on")) setPanel("obj"); } else if (D.panel === "obj") setPanel(isTouch ? null : "tpl"); else renderPanel(); }
  function setPanel(p) {
    D.panel = p; D.root.querySelectorAll("[data-tool]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-tool") === p)); });
    D.root.classList.toggle("sheet-on", !!p && isTouch); if (!p && isTouch) { D.P.innerHTML = ""; return; }
    renderPanel();
  }
  function colorRow(key, cur, label) {
    var b = brand(), h = hexOf(cur);
    return '<div class="pd-sec"><h4>' + esc(label) + '</h4><div class="pd-col"><input type="color" data-color="' + key + '" value="' + h + '" aria-label="' + esc(label) + '"><input class="pd-in" style="width:96px" data-hex="' + key + '" value="' + h + '" maxlength="7" aria-label="Hex-Farbcode">' +
      SW.map(function (c) { return '<button type="button" class="pd-sw" style="background:' + c + '" data-sw="' + key + "|" + c + '" aria-label="Farbe ' + c + '" aria-pressed="' + (c === h) + '"></button>'; }).join("") +
      (b.colors.length ? '<span class="pd-muted" style="width:100%">Markenfarben</span>' + b.colors.map(function (c) { return '<button type="button" class="pd-sw" style="background:' + c + '" data-sw="' + key + "|" + c + '" aria-label="Markenfarbe ' + c + '"></button>'; }).join("") : "") + "</div>" +
      (cur && vivid(cur) ? '<div class="pd-warn">Sehr leuchtende Bildschirmfarbe – im Druck (CMYK) wirkt sie etwas matter.</div>' : "") + "</div>";
  }
  var TITLES = { tpl: "Vorlagen", text: "Text", img: "Bilder & Logo", shape: "Formen & Linien", qr: "QR-Code", bg: "Hintergrund", layers: "Ebenen", brand: "Marke", check: "Druckdaten-Check", obj: "Bearbeiten" };
  function renderPanel() {
    if (!D || !D.panel) return; var p = D.panel, h = "";
    D.root.querySelector("#pdPT").textContent = TITLES[p] || "";
    if (p === "tpl") {
      h = '<div class="pd-sec"><h4>Vorlagen für ' + esc(D.o.product.title) + '</h4><p class="pd-muted">Alle Texte, Farben und Bilder sind anpassbar. Eine Vorlage ersetzt die aktuelle Gestaltung.</p><div class="pd-tpls" id="pdTpls">' +
        PrintTemplates.list(D.o.product.key).map(function (t) { return '<button type="button" class="pd-tpl" data-tpl="' + t.id + '"><canvas width="10" height="10" data-thumb="' + t.id + '"></canvas><span>' + esc(t.name) + "</span></button>"; }).join("") +
        '</div><button type="button" class="ps-btn small" data-a="blank">Leere Seite</button></div>';
      D.P.innerHTML = h; thumbs(); return;
    }
    if (p === "text") h = '<div class="pd-sec"><h4>Text hinzufügen</h4><button type="button" class="ps-btn" data-a="t:h" style="font-family:Montserrat;font-weight:700;font-size:20px;justify-content:flex-start">Überschrift</button><button type="button" class="ps-btn" data-a="t:s" style="justify-content:flex-start">Untertitel</button><button type="button" class="ps-btn small" data-a="t:b" style="justify-content:flex-start">Fließtext</button><p class="pd-muted">Tipp: Doppelklick bzw. doppelt antippen, um direkt im Text zu schreiben.</p></div>';
    else if (p === "img") { var ph = act() && act().role === "ph"; h = '<div class="pd-sec"><h4>Bild oder Logo</h4><button type="button" class="ps-btn primary" data-a="img:add">' + (ph ? "Bild in Platzhalter einsetzen" : "Bild hochladen") + '</button><button type="button" class="ps-btn small" data-a="img:bg">Als Hintergrundbild (randlos)</button><p class="pd-muted">JPG oder PNG (Logos gern als PNG mit transparentem Hintergrund). Für scharfen Druck mindestens 250–300 dpi in Druckgröße – wir zeigen dir die Auflösung an.</p>' + (brand().logo ? '<button type="button" class="ps-btn small" data-a="brand:logoins">Gespeichertes Logo einfügen</button>' : "") + "</div>"; }
    else if (p === "shape") h = '<div class="pd-sec"><h4>Formen</h4><div class="pd-btns">' + [["rect", "▭", "Rechteck"], ["round", "▢", "Abgerundet"], ["circle", "◯", "Kreis"], ["tri", "△", "Dreieck"], ["star", "☆", "Stern"], ["line", "─", "Linie"], ["frame", "⬚", "Rahmen"]].map(function (s) { return '<button type="button" class="pd-ib" data-a="sh:' + s[0] + '" title="' + s[2] + '" aria-label="' + s[2] + '" style="font-size:20px">' + s[1] + "</button>"; }).join("") + "</div></div>";
    else if (p === "qr") { var q = (act() && act().role === "qr" && act().qr) || D.qrDraft || { mode: "url", url: "https://", color: "#000000" };
      h = '<div class="pd-sec"><h4>QR-Code</h4><div class="ps-seg" role="group"><button type="button" data-qrm="url" aria-pressed="' + (q.mode === "url") + '">Link</button><button type="button" data-qrm="vcard" aria-pressed="' + (q.mode === "vcard") + '">Visitenkarte</button><button type="button" data-qrm="text" aria-pressed="' + (q.mode === "text") + '">Text</button></div>' +
        (q.mode === "url" ? '<label class="pd-lbl">Adresse<input class="pd-in" data-qr="url" value="' + esc(q.url || "https://") + '" inputmode="url"></label>' :
          q.mode === "vcard" ? ["fn:Name", "org:Firma", "tel:Telefon", "email:E-Mail", "web:Website", "adr:Adresse"].map(function (f) { var k = f.split(":"); return '<label class="pd-lbl">' + k[1] + '<input class="pd-in" data-qr="' + k[0] + '" value="' + esc(q[k[0]] || "") + '"></label>'; }).join("") :
          '<label class="pd-lbl">Text<textarea class="pd-in" data-qr="text">' + esc(q.text || "") + "</textarea></label>") +
        '<label class="pd-lbl">Farbe<input type="color" data-qr="color" value="' + hexOf(q.color) + '"></label><button type="button" class="ps-btn primary" data-a="qr:make">' + (act() && act().role === "qr" ? "QR-Code aktualisieren" : "QR-Code einfügen") + '</button><p class="pd-muted">Für sicheres Scannen mindestens 15 × 15 mm groß drucken und dunkel auf hell.</p></div>'; D.qrDraft = q; }
    else if (p === "bg") { var bg = bgRect(); h = colorRow("bg", bg.fill, "Hintergrundfarbe (randlos inkl. Beschnitt)") + '<div class="pd-sec"><h4>Hintergrundbild</h4><button type="button" class="ps-btn small" data-a="img:bg">Bild als Hintergrund</button>' + (D.c.getObjects().some(function (o) { return o.role === "bgimg"; }) ? '<button type="button" class="ps-btn small" data-a="bgimg:del">Hintergrundbild entfernen</button>' : "") + "</div>"; }
    else if (p === "layers") {
      var objs = D.c.getObjects().filter(function (o) { return !o.__bg; }).reverse(), a = act();
      h = '<div class="pd-sec"><h4>Ebenen (oben = vorne)</h4><div class="pd-layers">' + (objs.length ? objs.map(function (o) { var i = D.c.getObjects().indexOf(o), sel = a && (a === o || (a.contains && a.contains(o)));
        return '<div class="pd-layer' + (o.visible ? "" : " hid") + '" aria-selected="' + !!sel + '"><span class="nm" data-lsel="' + i + '">' + esc(nameOf(o)) + '</span><button type="button" class="pd-ib" data-lvis="' + i + '" aria-label="' + (o.visible ? "Ausblenden" : "Einblenden") + '">' + svgI(o.visible ? "eye" : "eyeoff") + '</button><button type="button" class="pd-ib" data-llock="' + i + '" aria-label="' + (o.locked ? "Entsperren" : "Sperren") + '">' + svgI(o.locked ? "lock" : "unlock") + '</button><button type="button" class="pd-ib" data-lup="' + i + '" aria-label="Nach vorne">' + svgI("up") + '</button><button type="button" class="pd-ib" data-ldown="' + i + '" aria-label="Nach hinten">' + svgI("down") + "</button></div>"; }).join("") : '<p class="pd-muted">Noch keine Elemente.</p>') + "</div></div>";
    }
    else if (p === "brand") { var bk = brand();
      h = '<div class="pd-sec"><h4>Markenfarben</h4><div class="pd-col">' + bk.colors.map(function (c, i) { return '<button type="button" class="pd-sw" style="background:' + c + '" data-bdel="' + i + '" title="Entfernen" aria-label="Markenfarbe ' + c + ' entfernen"></button>'; }).join("") + '<input type="color" id="pdBrandC" value="#0a84ff" aria-label="Farbe wählen"><button type="button" class="ps-btn small" data-a="brand:add">Farbe speichern</button></div>' +
        '<h4 style="margin-top:8px">Logo</h4>' + (bk.logo ? '<img src="' + bk.logo + '" alt="Gespeichertes Logo" style="max-width:160px;max-height:80px;background:#fff;border-radius:8px;padding:6px"><div class="pd-row"><button type="button" class="ps-btn small" data-a="brand:logoins">Einfügen</button><button type="button" class="ps-btn small" data-a="brand:logodel">Entfernen</button></div>' : "") +
        '<button type="button" class="ps-btn small" data-a="brand:logo">' + (bk.logo ? "Anderes Logo speichern" : "Logo hochladen & merken") + '</button><p class="pd-muted">Markenfarben und Logo werden nur in diesem Browser gespeichert (nicht auf unserem Server).</p></div>'; }
    else if (p === "check") h = checkHtml(issues(D.cur)) + '<div class="pd-sec"><div class="pd-row"><button type="button" class="ps-btn small" data-a="preview">Vorschau</button><button type="button" class="ps-btn small" data-a="savelink">Entwurf per Link speichern</button></div></div>';
    else if (p === "obj") h = objPanel();
    D.P.innerHTML = h;
  }
  function nameOf(o) { if (o.role === "ph") return "Platzhalter: " + (o.label || "Bild"); if (o.role === "qr") return "QR-Code"; if (o.role === "bgimg") return "Hintergrundbild"; if (o.type === "textbox") return "Text: " + String(o.text).split("\n")[0].slice(0, 26); if (o.type === "image") return o.name || "Bild"; if (o.type === "group") return o.name || "Gruppe"; return o.name || ({ rect: "Rechteck", circle: "Kreis", triangle: "Dreieck", polygon: "Stern", line: "Linie" }[o.type] || "Form"); }
  function num(k, v, lbl, step, unit) { return '<label class="pd-lbl">' + lbl + '<input class="pd-in num" type="number" inputmode="decimal" step="' + (step || 0.5) + '" data-num="' + k + '" value="' + v + '"' + (unit ? ' aria-label="' + lbl + " in " + unit + '"' : "") + "></label>"; }
  function objPanel() {
    var o = act(); if (!o) return '<p class="pd-muted">Nichts ausgewählt.</p>';
    var multi = o.type === "activeSelection", br = o.getBoundingRect(true, true), h = "";
    if (o.locked) return '<div class="pd-sec"><h4>' + esc(nameOf(o)) + '</h4><p class="pd-muted">Dieses Element ist gesperrt.</p><button type="button" class="ps-btn" data-a="unlock">Entsperren</button></div>';
    if (o.type === "textbox") {
      var fi = fontInfo(o.fontFamily) || { bold: true, italic: true };
      h += '<div class="pd-sec"><h4>Text</h4><textarea class="pd-in" id="pdTA" aria-label="Text bearbeiten">' + esc(o.text) + "</textarea></div>" +
        '<div class="pd-sec"><h4>Schrift</h4><div class="pd-fontsel" role="listbox" aria-label="Schriftart">' + FONTS.map(function (f) { return '<button type="button" role="option" data-font="' + esc(f.family) + '" style="font-family:\'' + esc(f.family) + '\'" aria-pressed="' + (f.family === o.fontFamily) + '">' + esc(f.family) + "</button>"; }).join("") + "</div>" +
        '<div class="pd-row">' + num("fontSize", r1(o.fontSize * (o.scaleY || 1) / U / PT), "Größe (pt)", 0.5) + '<button type="button" class="pd-ib" data-a="bold" aria-pressed="' + (o.fontWeight === "bold") + '"' + (fi.bold ? "" : " disabled") + ' style="font-weight:800" aria-label="Fett">B</button><button type="button" class="pd-ib" data-a="italic" aria-pressed="' + (o.fontStyle === "italic") + '"' + (fi.italic ? "" : " disabled") + ' style="font-style:italic;font-family:serif" aria-label="Kursiv">I</button><button type="button" class="pd-ib" data-a="upper" aria-label="GROSSBUCHSTABEN">Aa</button></div>' +
        '<div class="pd-row">' + [["left", "tl"], ["center", "tc"], ["right", "tr"], ["justify", "tj"]].map(function (a) { return '<button type="button" class="pd-ib" data-align="' + a[0] + '" aria-pressed="' + (o.textAlign === a[0]) + '" aria-label="Ausrichtung ' + a[0] + '">' + svgI(a[1]) + "</button>"; }).join("") + "</div>" +
        '<label class="pd-lbl">Zeichenabstand <span>' + Math.round(o.charSpacing) + '</span><input type="range" min="-100" max="800" step="10" data-range="charSpacing" value="' + o.charSpacing + '"></label>' +
        '<label class="pd-lbl">Zeilenabstand <span>' + r1(o.lineHeight) + '</span><input type="range" min="0.7" max="2.5" step="0.05" data-range="lineHeight" value="' + o.lineHeight + '"></label>' +
        (o.fontSize * (o.scaleY || 1) / U / PT < 5.5 ? '<div class="pd-warn">Sehr kleine Schrift (unter 6 pt) ist im Druck schwer lesbar.</div>' : "") + "</div>" + colorRow("fill", o.fill, "Textfarbe");
    } else if (o.type === "image") {
      var dpi = dpiOf(o), cr = o.nat ? { l: Math.round(o.cropX / o.nat.w * 100), t: Math.round(o.cropY / o.nat.h * 100), r: Math.round((o.nat.w - o.cropX - o.width) / o.nat.w * 100), b: Math.round((o.nat.h - o.cropY - o.height) / o.nat.h * 100) } : null;
      h += '<div class="pd-sec"><h4>Bild</h4><div class="pd-warn' + (dpi < 150 ? " bad" : "") + '" style="' + (dpi >= 250 ? "background:#30d15822;color:#7ee2a0" : "") + '">Auflösung in Druckgröße: <b>' + dpi + " dpi</b>" + (dpi >= 300 ? " – sehr gut" : dpi >= 250 ? " – gut" : dpi >= 150 ? " – kann unscharf wirken (empfohlen ≥ 250)" : " – zu gering, bitte kleiner platzieren oder größeres Bild") + "</div>" +
        '<div class="pd-row"><button type="button" class="ps-btn small" data-a="img:replace">Ersetzen</button><button type="button" class="ps-btn small" data-a="flipx">Spiegeln</button><button type="button" class="ps-btn small" data-a="img:fill">Randlos füllen</button></div>' +
        (cr ? '<h4 style="margin-top:6px">Zuschneiden (%)</h4><div class="pd-row">' + num("crop:l", cr.l, "Links", 1) + num("crop:r", cr.r, "Rechts", 1) + num("crop:t", cr.t, "Oben", 1) + num("crop:b", cr.b, "Unten", 1) + "</div>" : "") + "</div>";
    } else if (o.role === "ph") {
      h += '<div class="pd-sec"><h4>Platzhalter</h4><p class="pd-muted">Platzhalter werden nicht gedruckt.</p><button type="button" class="ps-btn primary" data-a="img:add">Bild einsetzen</button>' + (o.label === "Logo" && brand().logo ? '<button type="button" class="ps-btn small" data-a="brand:logoins">Gespeichertes Logo einsetzen</button>' : "") + "</div>";
    } else if (o.role === "qr") {
      var mm = Math.min(o.getScaledWidth(), o.getScaledHeight()) / U;
      h += '<div class="pd-sec"><h4>QR-Code</h4>' + (mm < 15 ? '<div class="pd-warn">Nur ' + r1(mm) + " mm groß – mindestens 15 mm empfohlen.</div>" : "") + '<button type="button" class="ps-btn small" data-tool="qr">Inhalt bearbeiten</button></div>';
    } else if (!multi && o.type !== "group") {
      var isLine = o.type === "line";
      if (!isLine) h += colorRow("fill", o.fill || "#ffffff", "Füllung") + '<div class="pd-row"><button type="button" class="ps-btn small" data-a="nofill">Ohne Füllung</button></div>';
      h += colorRow("stroke", o.stroke || "#000000", isLine ? "Linienfarbe" : "Kontur") + '<div class="pd-row">' + num("strokeWidth", r1((o.strokeWidth || 0) / U), isLine ? "Stärke (mm)" : "Kontur (mm)", 0.1) + (o.type === "rect" ? num("rx", r1((o.rx || 0) / U), "Ecken (mm)", 0.5) : "") + "</div>" +
        ((o.strokeWidth || 0) > 0 && o.strokeWidth / U < 0.1 ? '<div class="pd-warn">Linien unter 0,1 mm können im Druck verschwinden.</div>' : "");
    }
    h += '<div class="pd-sec"><h4>Position &amp; Größe (mm, ab Schnittkante)</h4><div class="pd-row">' + num("x", r1((br.left - D.trim.x) / U), "X") + num("y", r1((br.top - D.trim.y) / U), "Y") + num("w", r1(br.width / U), "Breite") + num("h", r1(br.height / U), "Höhe") + (multi ? "" : num("angle", Math.round(o.angle || 0), "Drehung°", 1)) + "</div>" +
      '<label class="pd-lbl">Deckkraft <span>' + Math.round((o.opacity == null ? 1 : o.opacity) * 100) + ' %</span><input type="range" min="0.05" max="1" step="0.05" data-range="opacity" value="' + (o.opacity == null ? 1 : o.opacity) + '"></label></div>' +
      '<div class="pd-sec"><h4>Ausrichten ' + (multi ? "(zur Auswahl)" : "(zur Seite)") + '</h4><div class="pd-btns">' + [["al", "Links"], ["ac", "Mitte horizontal"], ["ar", "Rechts"], ["at", "Oben"], ["am", "Mitte vertikal"], ["ab", "Unten"]].map(function (a) { return '<button type="button" class="pd-ib" data-a="align:' + a[0] + '" title="' + a[1] + '" aria-label="' + a[1] + '">' + svgI(a[0]) + "</button>"; }).join("") +
      (multi && o.size() >= 3 ? '<button type="button" class="pd-ib" data-a="dist:h" title="Horizontal verteilen" aria-label="Horizontal verteilen">' + svgI("dh") + '</button><button type="button" class="pd-ib" data-a="dist:v" title="Vertikal verteilen" aria-label="Vertikal verteilen">' + svgI("dv") + "</button>" : "") + "</div></div>" +
      '<div class="pd-sec"><h4>Anordnen</h4><div class="pd-btns"><button type="button" class="pd-ib" data-a="front" title="Ganz nach vorne" aria-label="Ganz nach vorne">⤒</button><button type="button" class="pd-ib" data-a="fwd" title="Eine Ebene nach vorne" aria-label="Nach vorne">' + svgI("up") + '</button><button type="button" class="pd-ib" data-a="bwd" title="Eine Ebene nach hinten" aria-label="Nach hinten">' + svgI("down") + '</button><button type="button" class="pd-ib" data-a="back" title="Ganz nach hinten" aria-label="Ganz nach hinten">⤓</button>' +
      (multi ? '<button type="button" class="pd-ib" data-a="group" title="Gruppieren (Strg+G)" aria-label="Gruppieren">' + svgI("grp") + "</button>" : o.type === "group" && !o.role ? '<button type="button" class="pd-ib" data-a="ungroup" title="Gruppierung lösen" aria-label="Gruppierung lösen">⧉</button>' : "") +
      '<button type="button" class="pd-ib" data-a="lock" title="Sperren" aria-label="Sperren">' + svgI("lock") + '</button><button type="button" class="pd-ib" data-a="dup" title="Duplizieren (Strg+D)" aria-label="Duplizieren">' + svgI("dup") + '</button><button type="button" class="pd-ib" data-a="del" title="Löschen (Entf)" aria-label="Löschen" style="color:#ff6961">' + svgI("trash") + "</button></div></div>";
    return h;
  }
  function syncTextArea() { var ta = D && D.root.querySelector("#pdTA"), o = D && act(); if (ta && o && o.type === "textbox" && document.activeElement !== ta) ta.value = o.text; }
  var thumbCache = {};
  function thumbs() {
    var ctx = { product: D.o.product.key, w: D.mm.w, h: D.mm.h, bleed: D.b, safe: D.safe, sides: 1, panels: D.panels, round: D.round };
    PrintTemplates.list(D.o.product.key).forEach(function (t) {
      var cv = D.P.querySelector('[data-thumb="' + t.id + '"]'); if (!cv) return; var key = t.id + JSON.stringify(ctx);
      if (thumbCache[key]) { var im = new Image(); im.src = thumbCache[key]; im.alt = ""; cv.replaceWith(im); return; }
      var els = PrintTemplates.build(t.id, ctx)[0];
      loadFontsOf(els).then(function () {
        if (!D) return; var k = 240 / Math.max(D.mm.w, D.mm.h) / U, sc = new fabric.StaticCanvas(null, { width: Math.round(D.mm.w * U * k), height: Math.round(D.mm.h * U * k), enableRetinaScaling: false });
        sc.setViewportTransform([k, 0, 0, k, -D.b * U * k, -D.b * U * k]);
        els.forEach(function (e) { if (e.t === "bg") sc.add(new fabric.Rect({ left: 0, top: 0, width: D.W, height: D.H, fill: e.fill, strokeWidth: 0 })); else { var o = elemToObj(e); if (o) sc.add(o); } });
        sc.renderAll(); var url = sc.toDataURL({ format: "png" }); sc.dispose(); thumbCache[key] = url;
        var c2 = D && D.P.querySelector('[data-thumb="' + t.id + '"]'); if (c2) { var img = new Image(); img.src = url; img.alt = ""; c2.replaceWith(img); }
      });
    });
  }

  // ── Werkzeuge: Ausrichten, Verteilen, Ebenen ──
  function objsOf(o) { return o.type === "activeSelection" ? o.getObjects().slice() : [o]; }
  function reselect(list) { D.c.discardActiveObject(); if (list.length === 1) D.c.setActiveObject(list[0]); else D.c.setActiveObject(new fabric.ActiveSelection(list, { canvas: D.c })); D.c.requestRenderAll(); }
  function moveBy(o, dx, dy) { o.set({ left: o.left + dx, top: o.top + dy }); o.setCoords(); }
  function align(k) {
    var o = act(); if (!o) return; var list = objsOf(o), multi = list.length > 1; D.c.discardActiveObject();
    var ref = multi ? (function () { var b = list.map(function (x) { return x.getBoundingRect(true, true); }); var l = Math.min.apply(0, b.map(function (x) { return x.left; })), t = Math.min.apply(0, b.map(function (x) { return x.top; })); return { left: l, top: t, width: Math.max.apply(0, b.map(function (x) { return x.left + x.width; })) - l, height: Math.max.apply(0, b.map(function (x) { return x.top + x.height; })) - t }; })() : { left: D.trim.x, top: D.trim.y, width: D.trim.w, height: D.trim.h };
    list.forEach(function (x) { var b = x.getBoundingRect(true, true);
      if (k === "al") moveBy(x, ref.left - b.left, 0); if (k === "ar") moveBy(x, ref.left + ref.width - b.left - b.width, 0); if (k === "ac") moveBy(x, ref.left + ref.width / 2 - b.left - b.width / 2, 0);
      if (k === "at") moveBy(x, 0, ref.top - b.top); if (k === "ab") moveBy(x, 0, ref.top + ref.height - b.top - b.height); if (k === "am") moveBy(x, 0, ref.top + ref.height / 2 - b.top - b.height / 2); });
    reselect(list); changed();
  }
  function distribute(k) {
    var o = act(); if (!o || o.type !== "activeSelection") return; var list = objsOf(o); if (list.length < 3) return; D.c.discardActiveObject();
    var hor = k === "h", bs = list.map(function (x) { return { o: x, b: x.getBoundingRect(true, true) }; }).sort(function (a, b) { return hor ? a.b.left - b.b.left : a.b.top - b.b.top; });
    var first = bs[0].b, last = bs[bs.length - 1].b, total = bs.reduce(function (s, x) { return s + (hor ? x.b.width : x.b.height); }, 0);
    var span = hor ? last.left + last.width - first.left : last.top + last.height - first.top, gap = (span - total) / (bs.length - 1), pos = hor ? first.left : first.top;
    bs.forEach(function (x) { if (hor) moveBy(x.o, pos - x.b.left, 0); else moveBy(x.o, 0, pos - x.b.top); pos += (hor ? x.b.width : x.b.height) + gap; });
    reselect(list); changed();
  }
  function arrange(k) { var o = act(); if (!o) return; var c = D.c; objsOf(o).forEach(function (x) { if (k === "front") c.bringToFront(x); else if (k === "fwd") c.bringForward(x); else if (k === "bwd") { if (c.getObjects().indexOf(x) > 1) c.sendBackwards(x); } else if (k === "back") c.moveTo(x, 1); }); c.moveTo(bgRect(), 0); c.requestRenderAll(); changed(); }
  function cloneObj(o) { return new Promise(function (res) { o.clone(function (cl) { res(cl); }, PROPS); }); }
  function duplicate(src, off) {
    var o = src || act(); if (!o) return; off = off == null ? 3 * U : off;
    cloneObj(o).then(function (cl) { D.c.discardActiveObject(); cl.set({ left: cl.left + off, top: cl.top + off, evented: true });
      if (cl.type === "activeSelection") { cl.canvas = D.c; cl.forEachObject(function (x) { D.c.add(x); }); cl.setCoords(); } else D.c.add(cl);
      D.c.setActiveObject(cl); D.c.requestRenderAll(); changed(); });
  }
  function delSel() { var o = act(); if (!o || (o.isEditing)) return; objsOf(o).forEach(function (x) { if (!x.__bg) D.c.remove(x); }); D.c.discardActiveObject(); D.c.requestRenderAll(); }
  function setLock(o, on) { o.set({ locked: on, selectable: !on, evented: !on, lockMovementX: on, lockMovementY: on, lockScalingX: on, lockScalingY: on, lockRotation: on, hasControls: !on }); }
  function setProp(k, v) {
    var o = act(); if (!o) return; var c = D.c;
    if (k === "bg") { bgRect().set("fill", v); c.requestRenderAll(); changed(); return; }
    objsOf(o).forEach(function (x) {
      if (k === "fill" && x.type === "group" && x.role !== "qr") x.getObjects().forEach(function (y) { if (y.fill) y.set("fill", v); });
      else x.set(k, v);
      if (x.type === "textbox") { x.initDimensions(); x.setCoords(); }
    });
    c.requestRenderAll(); changed();
  }
  function setNum(k, v) {
    var o = act(); if (!o || !isFinite(v)) return; var br = o.getBoundingRect(true, true);
    if (k === "x") moveBy(o, D.trim.x + v * U - br.left, 0); else if (k === "y") moveBy(o, 0, D.trim.y + v * U - br.top);
    else if (k === "w" && v > 0) { var f = v * U / br.width; o.set({ scaleX: o.scaleX * f, scaleY: (o.type === "textbox" || o.role === "qr" || o.type === "image") ? o.scaleY * f : o.scaleY }); }
    else if (k === "h" && v > 0) { var g = v * U / br.height; o.set({ scaleY: o.scaleY * g, scaleX: (o.role === "qr" || o.type === "image") ? o.scaleX * g : o.scaleX }); }
    else if (k === "angle") o.rotate(v);
    else if (k === "fontSize") { o.set({ fontSize: ptToU(v) / (o.scaleY || 1) }); o.initDimensions(); }
    else if (k === "strokeWidth") o.set({ strokeWidth: Math.max(0, v) * U });
    else if (k === "rx") o.set({ rx: v * U, ry: v * U });
    else if (k.indexOf("crop:") === 0 && o.nat) {
      var side = k.slice(5), p = Math.max(0, Math.min(90, v)) / 100, cur = { l: o.cropX / o.nat.w, t: o.cropY / o.nat.h, r: (o.nat.w - o.cropX - o.width) / o.nat.w, b: (o.nat.h - o.cropY - o.height) / o.nat.h }; cur[side] = p;
      if (cur.l + cur.r > 0.95 || cur.t + cur.b > 0.95) return;
      var nx = cur.l * o.nat.w, ny = cur.t * o.nat.h; o.set({ left: o.left + (nx - o.cropX) * o.scaleX, top: o.top + (ny - o.cropY) * o.scaleY, cropX: nx, cropY: ny, width: o.nat.w * (1 - cur.l - cur.r), height: o.nat.h * (1 - cur.t - cur.b) });
    }
    o.setCoords(); D.c.requestRenderAll(); changed();
  }
  function makeQR() {
    var q = D.qrDraft || {}, data = q.mode === "vcard" ? ["BEGIN:VCARD", "VERSION:3.0", "N:" + (q.fn || "").split(" ").reverse().join(";"), "FN:" + (q.fn || ""), q.org ? "ORG:" + q.org : "", q.tel ? "TEL:" + q.tel : "", q.email ? "EMAIL:" + q.email : "", q.web ? "URL:" + q.web : "", q.adr ? "ADR:;;" + q.adr + ";;;;" : "", "END:VCARD"].filter(Boolean).join("\n") : q.mode === "text" ? (q.text || "") : (q.url || "");
    if (!data || data === "https://" || data.length > 1200) { toast(data.length > 1200 ? "Zu viel Inhalt für einen QR-Code" : "Bitte Inhalt eingeben", true); return; }
    var old = act() && act().role === "qr" ? act() : null, size = old ? old.getScaledWidth() : Math.max(18, Math.min(D.mm.w, D.mm.h) * 0.3) * U;
    var g = qrObj(data, size, q.color || "#000000"); g.qr = JSON.parse(JSON.stringify(q));
    if (old) { g.set({ left: old.left, top: old.top }); var i = D.c.getObjects().indexOf(old); D.c.remove(old); D.c.insertAt(g, i); D.c.setActiveObject(g); D.c.requestRenderAll(); changed(); } else addObj(g);
  }

  // ── Prüfung ──
  function issues(pageIdx) {
    var out = [], viv = {}, c = D.c, T = D.trim, S = D.saferect, tol = 0.5 * U, objs = c.getObjects().filter(function (o) { return !o.__bg && o.visible; });
    var pg = D.sides > 1 ? (D.o.product.key === "folder" ? ["Außenseite", "Innenseite"] : ["Vorderseite", "Rückseite"])[pageIdx] + ": " : "";
    if (!objs.length && (bgRect().fill === "#ffffff")) out.push({ level: "warn", text: pg + "Die Seite ist leer – sie wird weiß gedruckt." });
    objs.forEach(function (o) {
      var b = o.getBoundingRect(true, true), nm = nameOf(o);
      if (o.role === "ph") { out.push({ level: "info", text: pg + nm + " ist noch leer – Platzhalter werden nicht gedruckt." }); return; }
      if (o.type === "textbox") {
        if (b.left < S.x - tol || b.top < S.y - tol || b.left + b.width > S.x + S.w + tol || b.top + b.height > S.y + S.h + tol) out.push({ level: (b.left < T.x || b.top < T.y || b.left + b.width > T.x + T.w || b.top + b.height > T.y + T.h) ? "error" : "warn", text: pg + "„" + String(o.text).split("\n")[0].slice(0, 30) + "“ liegt außerhalb des Sicherheitsabstands" + ((b.left < T.x || b.top < T.y || b.left + b.width > T.x + T.w || b.top + b.height > T.y + T.h) ? " und wird angeschnitten." : " – könnte beim Schneiden zu knapp werden.") });
        if (o.fontSize * (o.scaleY || 1) / U / PT < 5.5) out.push({ level: "warn", text: pg + "Sehr kleine Schrift bei „" + String(o.text).slice(0, 24) + "“ (unter 6 pt)." });
        if (vivid(o.fill)) viv[hexOf(o.fill)] = 1;
      }
      if (o.type === "image") { var dpi = dpiOf(o); if (dpi < 250) out.push({ level: dpi < 100 ? "error" : "warn", text: pg + nm + ": nur " + dpi + " dpi in Druckgröße (empfohlen ≥ 250)." }); }
      if (o.role === "qr" && Math.min(b.width, b.height) / U < 15) out.push({ level: "warn", text: pg + "QR-Code ist kleiner als 15 mm – schwer scannbar." });
      if ((o.strokeWidth || 0) > 0 && o.stroke && o.strokeWidth / U < 0.1) out.push({ level: "warn", text: pg + nm + ": Linie dünner als 0,1 mm." });
      if (o.type !== "textbox" && o.fill && typeof o.fill === "string" && vivid(o.fill) && o.type !== "image") viv[hexOf(o.fill)] = 1;
      // endet genau an der Schnittkante → weißer Blitzer
      [["left", b.left, T.x, 0], ["top", b.top, T.y, 0], ["right", b.left + b.width, T.x + T.w, D.W], ["bottom", b.top + b.height, T.y + T.h, D.H]].forEach(function (e) {
        if (o.type !== "textbox" && Math.abs(e[1] - e[2]) < tol && Math.abs(e[1] - e[3]) > tol) out.push({ level: "warn", text: pg + nm + " endet genau an der Schnittkante (" + { left: "links", top: "oben", right: "rechts", bottom: "unten" }[e[0]] + ") – bitte bis in den Beschnitt ziehen, sonst können weiße Blitzer entstehen." }); });
    });
    if (Object.keys(viv).length) out.push({ level: "info", text: pg + "Sehr leuchtende Bildschirmfarbe" + (Object.keys(viv).length > 1 ? "n " : " ") + Object.keys(viv).join(", ") + " – im Druck (CMYK) wirk" + (Object.keys(viv).length > 1 ? "en sie" : "t sie") + " etwas matter." });
    var seen = {}; return out.filter(function (x) { if (seen[x.text]) return false; seen[x.text] = 1; return true; });
  }
  function checkHtml(list) {
    return '<div class="pd-sec"><h4>Aktuelle Seite</h4>' + (list.length ? '<ul class="ps-checks">' + list.map(function (x) { return '<li class="' + (x.level === "info" ? "warn" : x.level) + '">' + esc(x.text) + "</li>"; }).join("") + "</ul>" : '<ul class="ps-checks"><li>Keine Auffälligkeiten – Texte im Sicherheitsabstand, Bilder ausreichend aufgelöst.</li></ul>') +
      '<p class="pd-muted">Endformat ' + D.mm.w + " × " + D.mm.h + " mm, Datei " + (D.mm.w + 2 * D.b) + " × " + (D.mm.h + 2 * D.b) + " mm inkl. " + D.b + " mm Beschnitt. Farben werden für den Druck in CMYK umgerechnet." + (D.asFail ? " Automatisches Speichern im Browser war nicht möglich (zu groß) – nutze „Link“." : "") + "</p></div>";
  }

  // ── Vorschau, Export ──
  function renderPreview(maxSide) {
    var c = D.c, v = c.viewportTransform.slice(), act0 = act(); c.discardActiveObject(); D.exporting = true;
    var hidden = c.getObjects().filter(function (o) { return o.role === "ph" && o.visible; }); hidden.forEach(function (o) { o.visible = false; });
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    var k = (maxSide || 1400) / Math.max(D.trim.w, D.trim.h), url = c.toDataURL({ format: "jpeg", quality: 0.9, left: D.trim.x, top: D.trim.y, width: D.trim.w, height: D.trim.h, multiplier: k });
    hidden.forEach(function (o) { o.visible = true; }); c.setViewportTransform(v); D.exporting = false; if (act0 && c.getObjects().indexOf(act0) > -1) c.setActiveObject(act0); c.requestRenderAll();
    return url;
  }
  function exportSVG() {
    var c = D.c, v = c.viewportTransform.slice(); c.discardActiveObject(); D.exporting = true;
    var tmp = c.getObjects().filter(function (o) { return (!o.visible || o.role === "ph") && !o.excludeFromExport; }); tmp.forEach(function (o) { o.excludeFromExport = true; });   // Platzhalter/ausgeblendet nie drucken
    c.setViewportTransform([1, 0, 0, 1, 0, 0]);
    var svg = c.toSVG({ viewBox: { x: 0, y: 0, width: D.W, height: D.H }, width: D.W, height: D.H, suppressPreamble: true });
    tmp.forEach(function (o) { o.excludeFromExport = false; }); c.setViewportTransform(v); D.exporting = false; c.requestRenderAll();
    return svg;
  }
  function eachPage(fn) { // nacheinander alle Seiten laden und fn ausführen
    saveCur(); var start = D.cur, res = [], i = 0;
    return new Promise(function (resolve, reject) {
      (function next() { if (i >= D.sides) return loadPage(start, true).then(function () { resolve(res); }); loadPage(i, true).then(function () { try { res.push(fn(i)); } catch (e) { return reject(e); } i++; next(); }).catch(reject); })();
    });
  }
  function mock(previews) {
    var k = D.o.product.key, wall = k === "plakate" || k === "rollups", wpct = k === "visitenkarten" ? 46 : k === "aufkleber" ? 38 : k === "rollups" ? 22 : 40, land = D.mm.w >= D.mm.h;
    var sheet = function (src, cls) { return '<div class="sheet ' + (cls || "") + (D.round ? " round" : "") + '" style="width:' + (land ? wpct * 1.25 : wpct) + '%"><img src="' + src + '" alt=""></div>'; };
    return '<div class="ps-mock' + (wall ? " wall" : "") + '">' + (previews[1] && !wall ? sheet(previews[1], "back") : "") + sheet(previews[0]) + (k === "rollups" ? '<div class="stand" style="width:' + (wpct + 6) + '%"></div>' : "") + '<span class="cap">Vorschau – Bildschirmfarben können vom Druck abweichen</span></div>';
  }
  function preview() {
    busy("Vorschau wird erstellt …");
    eachPage(function () { return renderPreview(1100); }).then(function (pv) { busy(false);
      modal('<h3>Vorschau</h3>' + mock(pv) + '<div class="ps-thumbs" style="margin-top:14px">' + pv.map(function (s, i) { return '<figure><img src="' + s + '" alt=""><figcaption>' + (pv.length > 1 ? (i ? "Rückseite/Innen" : "Vorderseite/Außen") : "Endformat") + " – so wird geschnitten</figcaption></figure>"; }).join("") + '</div><div class="foot"><button class="ps-btn primary" data-a="m:ok">Schließen</button></div>', null, "wide");
    }).catch(function (e) { busy(false); toast(e.message, true); });
  }
  function finish() {
    busy("Druckdaten werden geprüft …");
    var all = [];
    eachPage(function (i) { all = all.concat(issues(i)); return { svg: exportSVG(), pv: renderPreview(1400) }; }).then(function (res) {
      busy(false);
      var errs = all.filter(function (x) { return x.level === "error"; }), warns = all.filter(function (x) { return x.level !== "error"; });
      modal('<h3>Druckdaten-Check</h3>' + mock(res.map(function (r) { return r.pv; })) +
        '<ul class="ps-checks">' + (all.length ? all.map(function (x) { return '<li class="' + (x.level === "info" ? "warn" : x.level) + '">' + esc(x.text) + "</li>"; }).join("") : '<li>Alles im grünen Bereich: Texte im Sicherheitsabstand, Bilder ausreichend aufgelöst.</li>') + "</ul>" +
        '<p class="pd-muted" style="margin-top:10px">Im nächsten Schritt erzeugen wir das Druck-PDF (' + (D.mm.w + 2 * D.b) + " × " + (D.mm.h + 2 * D.b) + " mm inkl. Beschnitt, Schriften eingebettet, CMYK) und prüfen es nochmals.</p>" +
        '<div class="foot"><button class="ps-btn" data-a="m:back">Weiter bearbeiten</button><button class="ps-btn primary" data-a="m:pdf">' + (errs.length ? "Trotzdem Druck-PDF erstellen" : "Druck-PDF erstellen") + "</button></div>", function (a) {
          if (a !== "pdf") return;
          busy("Druck-PDF wird erstellt …");
          var o = D.o, body = { product: o.product.key, sel: o.sel, copies: o.copies, urgency: o.urgency, pages: res.map(function (r) { return r.svg; }), warnings: warns.filter(function (x) { return x.level === "warn" && !/dpi/.test(x.text); }).map(function (x) { return x.text; }).slice(0, 10) };
          fetch("/print/api/design", { method: "POST", headers: { "Content-Type": "application/json", "X-Print-Shop": "1" }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return { ok: false, error: "Fehler " + r.status }; }); }).then(function (j) {
            busy(false);
            if (!j.ok) { toast(j.error || "PDF konnte nicht erstellt werden", true); return; }
            saveCur(); var design = { pages: D.pages.slice() }, pv = res.map(function (r) { return r.pv; }), cb = D.o.onDone;
            autosave(); close(true); cb(j, pv, design);
          }).catch(function () { busy(false); toast("Keine Verbindung – bitte erneut versuchen", true); });
        }, "wide");
    }).catch(function (e) { busy(false); toast(e.message || "Export fehlgeschlagen", true); });
  }
  function saveLink() {
    saveCur(); if (!window.PrintShop || !window.PrintShop.saveDraftLink) return;
    busy("Entwurf wird gespeichert …");
    window.PrintShop.saveDraftLink({ pages: D.pages }).then(function (j) { busy(false);
      if (!j.ok) { toast(j.error || "Speichern fehlgeschlagen", true); return; }
      modal('<h3>Entwurf gespeichert</h3><p class="pd-muted">Mit diesem Link kannst du die Gestaltung später (auch auf einem anderen Gerät) weiterbearbeiten. Er ist 60 Tage gültig – wer ihn kennt, kann den Entwurf öffnen.</p><input class="pd-in" id="pdLink" readonly value="' + esc(j.url) + '" style="margin-top:10px"><div class="foot"><button class="ps-btn" data-a="m:ok">Schließen</button><button class="ps-btn primary" data-a="m:copy">Link kopieren</button></div>', function (a) { if (a === "copy") { var i = document.getElementById("pdLink"); try { navigator.clipboard.writeText(i.value).then(function () { toast("Link kopiert"); }); } catch (e) { i.select(); document.execCommand("copy"); toast("Link kopiert"); } return true; } });
    }).catch(function () { busy(false); toast("Speichern fehlgeschlagen", true); });
  }
  function busy(t) { var b = D && D.root.querySelector(".pd-busy"); if (!t) { if (b) b.remove(); return; } if (!b) { b = document.createElement("div"); b.className = "pd-busy"; D.root.querySelector(".pd-stage").appendChild(b); } b.innerHTML = '<span><span class="ps-spin"></span> ' + esc(t) + "</span>"; }
  function modal(html, cb, cls) {
    var m = document.createElement("div"); m.className = "pd-modal"; m.innerHTML = '<div class="pd-dlg ' + (cls || "") + '" role="dialog" aria-modal="true">' + html + "</div>"; D.root.appendChild(m);
    var f = m.querySelector(".primary") || m.querySelector("button"); if (f) f.focus();
    m.addEventListener("click", function (e) { var t = e.target.closest("[data-a]"); if (e.target === m) { m.remove(); return; } if (!t || t.getAttribute("data-a").indexOf("m:") !== 0) return; e.stopPropagation(); var a = t.getAttribute("data-a").slice(2); var keep = cb && cb(a) === true; if (!keep) m.remove(); });
  }

  // ── Ereignisse ──
  function onClick(e) {
    var t = e.target.closest("[data-a],[data-tool],[data-page],[data-tpl],[data-sw],[data-font],[data-align],[data-qrm],[data-lsel],[data-lvis],[data-llock],[data-lup],[data-ldown],[data-bdel]"); if (!t || t.disabled || !D) return;
    if (t.closest(".pd-modal")) return;
    var c = D.c, o = act(), g = function (n) { return t.getAttribute(n); };
    if (t.hasAttribute("data-tool")) { var tl = g("data-tool"); setPanel(D.panel === tl && isTouch ? null : tl); return; }
    if (t.hasAttribute("data-page")) { loadPage(+g("data-page")); return; }
    if (t.hasAttribute("data-tpl")) { var id = g("data-tpl"); var go = function () { applyTemplate(id).then(function () { changed(); toast("Vorlage „" + PrintTemplates.styles[id].name + "“ übernommen"); if (isTouch) setPanel(null); }); }; if (D.dirty) modal('<h3>Vorlage übernehmen?</h3><p class="pd-muted">Die aktuelle Gestaltung (alle Seiten) wird ersetzt. Du kannst das mit „Rückgängig“ nicht zurückholen.</p><div class="foot"><button class="ps-btn" data-a="m:no">Abbrechen</button><button class="ps-btn primary" data-a="m:yes">Ersetzen</button></div>', function (a) { if (a === "yes") go(); }); else go(); return; }
    if (t.hasAttribute("data-sw")) { var p = g("data-sw").split("|"); if (p[0] === "bg") setProp("bg", p[1]); else setProp(p[0], p[1]); renderPanel(); return; }
    if (t.hasAttribute("data-font")) { var fam = g("data-font"), fi = fontInfo(fam) || {}; if (!o) return; var bold = o.fontWeight === "bold" && fi.bold, it = o.fontStyle === "italic" && fi.italic; loadFont(fam, bold, it).then(function () { objsOf(o).forEach(function (x) { if (x.type === "textbox") { x.set({ fontFamily: fam, fontWeight: bold ? "bold" : "normal", fontStyle: it ? "italic" : "normal" }); x.initDimensions(); x.setCoords(); } }); c.requestRenderAll(); changed(); renderPanel(); }); return; }
    if (t.hasAttribute("data-align")) { setProp("textAlign", g("data-align")); renderPanel(); return; }
    if (t.hasAttribute("data-qrm")) { D.qrDraft = Object.assign({}, D.qrDraft, { mode: g("data-qrm") }); renderPanel(); return; }
    var li = function (n) { return c.getObjects()[+g(n)]; };
    if (t.hasAttribute("data-lsel")) { var x = li("data-lsel"); if (x) { c.setActiveObject(x); c.requestRenderAll(); setPanel("obj"); } return; }
    if (t.hasAttribute("data-lvis")) { var y = li("data-lvis"); if (y) { y.visible = !y.visible; if (!y.visible) c.discardActiveObject(); c.requestRenderAll(); changed(); renderPanel(); } return; }
    if (t.hasAttribute("data-llock")) { var z = li("data-llock"); if (z) { setLock(z, !z.locked); c.discardActiveObject(); c.requestRenderAll(); changed(); renderPanel(); } return; }
    if (t.hasAttribute("data-lup")) { var u = li("data-lup"); if (u) { c.bringForward(u); changed(); renderPanel(); } return; }
    if (t.hasAttribute("data-ldown")) { var dn = li("data-ldown"); if (dn && c.getObjects().indexOf(dn) > 1) { c.sendBackwards(dn); changed(); renderPanel(); } return; }
    if (t.hasAttribute("data-bdel")) { var bk = brand(); bk.colors.splice(+g("data-bdel"), 1); brand(bk); renderPanel(); return; }
    var a = g("data-a"), i = a.indexOf(":"), k = i > -1 ? a.slice(0, i) : a, v = i > -1 ? a.slice(i + 1) : "";
    switch (k) {
      case "close": modal('<h3>Designer schließen?</h3><p class="pd-muted">Deine Gestaltung bleibt in diesem Browser gespeichert und ist beim nächsten Öffnen wieder da.</p><div class="foot"><button class="ps-btn" data-a="m:no">Weiter gestalten</button><button class="ps-btn primary" data-a="m:yes">Schließen</button></div>', function (r) { if (r === "yes") { autosave(); close(); } }); break;
      case "undo": undo(false); break; case "redo": undo(true); break;
      case "preview": preview(); break; case "finish": finish(); break; case "savelink": saveLink(); break;
      case "sheetclose": setPanel(null); break;
      case "guides": D.showGuides = !D.showGuides; t.setAttribute("aria-pressed", String(D.showGuides)); c.requestRenderAll(); break;
      case "cut": D.showBleed = !D.showBleed; t.setAttribute("aria-pressed", String(!D.showBleed)); c.requestRenderAll(); break;
      case "zoomin": zoomTo(c.getZoom() * 1.25); break; case "zoomout": zoomTo(c.getZoom() / 1.25); break; case "fit": fit(); break;
      case "t": addText(v); break; case "sh": addShape(v); break;
      case "blank": modal('<h3>Leere Seite?</h3><p class="pd-muted">Alle Elemente werden entfernt.</p><div class="foot"><button class="ps-btn" data-a="m:no">Abbrechen</button><button class="ps-btn primary" data-a="m:yes">Leeren</button></div>', function (r) { if (r === "yes") { D.pages = PrintTemplates.blank({ sides: D.sides }).map(function () { return { objects: [] }; }); D.hist = D.pages.map(function () { return []; }); loadPage(0, true).then(changed); } }); break;
      case "img": if (v === "add" || v === "replace") pickFile().then(function (f) { if (!f) return; var ph = o && o.role === "ph" ? o : (v === "replace" && o && o.type === "image" ? o : null); if (v === "replace" && ph) { var pb = ph; addImage(f, { ph: pb }); } else addImage(f, { ph: ph }); });
        else if (v === "bg") pickFile().then(function (f) { if (f) { c.getObjects().filter(function (x) { return x.role === "bgimg"; }).forEach(function (x) { c.remove(x); }); addImage(f, { bg: true }); } });
        else if (v === "fill" && o && o.type === "image") { var s = Math.max(D.W / o.width, D.H / o.height); o.set({ scaleX: s, scaleY: s, angle: 0, left: (D.W - o.width * s) / 2, top: (D.H - o.height * s) / 2 }); o.setCoords(); c.requestRenderAll(); changed(); }
        break;
      case "bgimg": c.getObjects().filter(function (x) { return x.role === "bgimg"; }).forEach(function (x) { c.remove(x); }); renderPanel(); break;
      case "qr": makeQR(); break;
      case "bold": if (o) { var nb = o.fontWeight === "bold" ? "normal" : "bold"; loadFont(o.fontFamily, nb === "bold", o.fontStyle === "italic").then(function () { setProp("fontWeight", nb); renderPanel(); }); } break;
      case "italic": if (o) { var ni = o.fontStyle === "italic" ? "normal" : "italic"; loadFont(o.fontFamily, o.fontWeight === "bold", ni === "italic").then(function () { setProp("fontStyle", ni); renderPanel(); }); } break;
      case "upper": if (o && o.type === "textbox") { o.set("text", o.text === o.text.toUpperCase() ? o.text.toLowerCase().replace(/(^|\s)\S/g, function (m) { return m.toUpperCase(); }) : o.text.toUpperCase()); o.initDimensions(); c.requestRenderAll(); changed(); syncTextArea(); } break;
      case "nofill": setProp("fill", null); renderPanel(); break;
      case "flipx": setProp("flipX", !(o && o.flipX)); break;
      case "align": align(v); break; case "dist": distribute(v); break;
      case "front": case "fwd": case "bwd": case "back": arrange(k); break;
      case "group": if (o && o.type === "activeSelection") { o.toGroup(); c.requestRenderAll(); changed(); setPanel("obj"); } break;
      case "ungroup": if (o && o.type === "group") { o.toActiveSelection(); c.requestRenderAll(); changed(); setPanel("obj"); } break;
      case "lock": if (o) { objsOf(o).forEach(function (x) { setLock(x, true); }); c.discardActiveObject(); c.requestRenderAll(); changed(); toast("Gesperrt – über „Ebenen“ wieder entsperren"); } break;
      case "unlock": if (o) { setLock(o, false); c.requestRenderAll(); changed(); renderPanel(); } break;
      case "dup": duplicate(); break; case "del": delSel(); break;
      case "brand": var b = brand();
        if (v === "add") { var col = D.root.querySelector("#pdBrandC").value; if (b.colors.indexOf(col) < 0) b.colors.push(col); b.colors = b.colors.slice(-12); brand(b); renderPanel(); }
        else if (v === "logo") pickFile().then(function (f) { if (!f) return; readImage(f).then(function (im) { if (im.src.length > 2.5e6) { toast("Logo ist zu groß zum Merken (max. ca. 1,8 MB)", true); return; } b.logo = im.src; brand(b); renderPanel(); toast("Logo gemerkt"); }).catch(function (er) { toast(er.message, true); }); });
        else if (v === "logodel") { b.logo = null; brand(b); renderPanel(); }
        else if (v === "logoins" && b.logo) { fetch(b.logo).then(function (r) { return r.blob(); }).then(function (bl) { addImage(new File([bl], "Logo.png", { type: bl.type }), { ph: o && o.role === "ph" ? o : null, name: "Logo" }); }); }
        break;
    }
  }
  function onInput(e) {
    var t = e.target, o = act(); if (!D) return;
    if (t.id === "pdTA" && o && o.type === "textbox") { o.set("text", t.value); o.initDimensions(); o.setCoords(); D.c.requestRenderAll(); changed(); return; }
    if (t.hasAttribute("data-range") && o) { var k = t.getAttribute("data-range"), v = parseFloat(t.value); setProp(k, v); var s = t.parentNode.querySelector("span"); if (s) s.textContent = k === "opacity" ? Math.round(v * 100) + " %" : k === "lineHeight" ? r1(v) : Math.round(v); return; }
    if (t.hasAttribute("data-color")) { var key = t.getAttribute("data-color"); setProp(key, t.value); var hx = D.P.querySelector('[data-hex="' + key + '"]'); if (hx) hx.value = t.value; return; }
    if (t.hasAttribute("data-qr")) { D.qrDraft = D.qrDraft || {}; D.qrDraft[t.getAttribute("data-qr")] = t.value; return; }
  }
  function onChange(e) {
    var t = e.target; if (!D) return;
    if (t.hasAttribute("data-num")) { setNum(t.getAttribute("data-num"), parseFloat(String(t.value).replace(",", "."))); renderPanel(); return; }
    if (t.hasAttribute("data-hex")) { var v = t.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(v)) { setProp(t.getAttribute("data-hex"), v[0] === "#" ? v : "#" + v); renderPanel(); } return; }
    if (t.hasAttribute("data-color")) { renderPanel(); return; }
  }
  function onKey(e) {
    if (!D) return; var tg = e.target, typing = tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.isContentEditable), o = act(), editing = o && o.isEditing, mod = e.metaKey || e.ctrlKey, k = e.key;
    if (k === "Escape") { var m = D.root.querySelector(".pd-modal"); if (m) { m.remove(); e.preventDefault(); return; } if (editing) return; if (o) { D.c.discardActiveObject(); D.c.requestRenderAll(); } else if (isTouch) setPanel(null); return; }
    if (typing || editing || D.root.querySelector(".pd-modal")) return;
    if (e.code === "Space") { D.space = true; e.preventDefault(); return; }
    if (mod && k.toLowerCase() === "z") { e.preventDefault(); undo(e.shiftKey); return; }
    if (mod && k.toLowerCase() === "y") { e.preventDefault(); undo(true); return; }
    if (mod && k.toLowerCase() === "c" && o) { e.preventDefault(); cloneObj(o).then(function (cl) { D.clip = cl; toast("Kopiert"); }); return; }
    if (mod && k.toLowerCase() === "x" && o) { e.preventDefault(); cloneObj(o).then(function (cl) { D.clip = cl; delSel(); }); return; }
    if (mod && k.toLowerCase() === "v" && D.clip) { e.preventDefault(); duplicate(D.clip, 4 * U); return; }
    if (mod && k.toLowerCase() === "d" && o) { e.preventDefault(); duplicate(); return; }
    if (mod && k.toLowerCase() === "g" && o) { e.preventDefault(); if (e.shiftKey && o.type === "group") o.toActiveSelection(); else if (o.type === "activeSelection") o.toGroup(); D.c.requestRenderAll(); changed(); return; }
    if (mod && k.toLowerCase() === "a") { e.preventDefault(); var all = D.c.getObjects().filter(function (x) { return !x.__bg && !x.locked && x.visible; }); if (all.length) reselect(all); return; }
    if ((k === "Delete" || k === "Backspace") && o) { e.preventDefault(); delSel(); return; }
    if (/^Arrow/.test(k) && o) { e.preventDefault(); var st = (e.shiftKey ? 5 : 0.5) * U; moveBy(o, k === "ArrowLeft" ? -st : k === "ArrowRight" ? st : 0, k === "ArrowUp" ? -st : k === "ArrowDown" ? st : 0); D.c.requestRenderAll(); changed(); return; }
    if (k === "+" || k === "=") { zoomTo(D.c.getZoom() * 1.25); return; } if (k === "-") { zoomTo(D.c.getZoom() / 1.25); return; } if (k === "0") { fit(); return; }
  }

  window.PrintDesigner = { open: open, close: function () { close(); }, _state: function () { return D; } };
})();
