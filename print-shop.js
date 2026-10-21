"use strict";
// Online-Druckshop www.fs-creative.at/print – Produktion über die Print.com-API, Zahlung über Mollie oder „Rechnung für Firmen“.
// Grundsatz (Vorgabe Simon): NICHTS wird ohne seine Kontrolle bei Print.com bestellt. Ablauf:
//   Kunde konfiguriert → gestaltet/lädt hoch → bezahlt (Mollie „paid“) oder wählt Rechnung (Firma mit gültiger UID)
//   → Auftrag gespeichert, Rechnungs-ENTWURF in der eigenen Buchhaltung, Vorschlag „Zur Prüfung“ + Push
//   → im Cockpit (Druckaufträge) „Bei Print.com bestellen“ → POST /orders, Rechnung fertigstellen + an Kunden senden
//   → täglich Status/Tracking von Print.com abrufen, Versandmail an den Kunden.
// „Bezahlte Bestellungen automatisch senden“ ist eine Einstellung im Cockpit (Standard AUS).
// Preise: Einkauf live von Print.com (Produkt + Versand) + Aufschlag PRINT_MARKUP_PCT (nur Prozentregeln, keine €-Mindestmarge) –
// immer serverseitig berechnet, Preise vom Browser werden nie übernommen.
// Speicher: mit DATABASE_URL in Postgres (print_order, print_file, Einstellungen/Katalog in fin_meta), sonst Dateien unter DATA_DIR/print-shop.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MM_PT = 72 / 25.4;
// nur Österreich: Print.com liefert direkt aus den NL – bei Lieferung nach DE wäre es kein ig. Erwerb in AT mehr (Dreiecksgeschäft bzw. DE-Registrierung)
const COUNTRIES = { AT: "Österreich" };
const PLZ = { AT: /^\d{4}$/, DE: /^\d{5}$/ };
const MAX_UPLOAD = 50 * 1024 * 1024;
const FIRM_DEFAULT = { name: "FS Creative", owner: "Simon Leonhard Felder", street: "Dorfstraße 3/1", zip: "6793", city: "Gaschurn", uid: "ATU82622967", email: "simon@fs-creative.at", phone: "+43 664 1430620" };

// Kategorien = Print.com-Produktbaum (Hauptgruppe/Untergruppe als Slug, Namen aus dem Print.com-CMS). Ohne Angabe von Print.com: Stichwort-Regeln als Ersatz.
const PAPER = "paper-print", BANNER = "outdoor-advertising", INDOOR = "indoor-interior", STICK = "stickers-tapes", BAGS = "packaging-bags", PROMO = "gifts-merchandise-promotional", TEX = "clothing-textile", MATS = "materials-samples", OTHER = "other";
const MAIN_DE = { [PAPER]: "Papier & Druck", [BANNER]: "Außenwerbung", [INDOOR]: "Innenwerbung & Interieur", [STICK]: "Aufkleber & Klebebänder", [BAGS]: "Taschen & Verpackungen", [PROMO]: "Werbeartikel & Geschenke", [TEX]: "Bekleidung & Textil", [MATS]: "Materialien & Muster", [OTHER]: "Sonstiges" };
const GROUP_ICON = { [PAPER]: "📄", [BANNER]: "🏁", [INDOOR]: "🪧", [STICK]: "🏷️", [BAGS]: "👜", [PROMO]: "🎁", [TEX]: "👕", [MATS]: "🧪", [OTHER]: "📦" };
// Ersatz-Einteilung (sku + Titel, deutsch/englisch), nur wenn Print.com keine Kategorie liefert: erste passende Regel gewinnt – zum Erweitern Wörter ergänzen.
// Reihenfolge ist wichtig: „Textilrahmen“ vor Textil, „Tote Bag (Canvas)“ vor Leinwand, „Posterhalter“ vor Poster.
const CAT_RULES = [
  [PROMO, /mentos|gumm(y|ies|i)|fruchtgummi|chocolat|schoko|cookie|keks|candy|candies|bonbon|lolli|sweets|\btea\b|\btee\b|coffee|kaffee|olive|smoothie|hone[yi]|honig|jelly|snack|popcorn|\bmints?\b|kaugummi|chewing|lebensmittel|\bfood\b/],
  [BANNER, /banner|\bmesh\b|roll ?ups?|roller|display|beach ?flag|\bflags?\b|fahne|textile ?frame|textilrahmen|backdrop|backwall|pavement|kundenstopper|stopper|poster ?holder|posterhalter|\bfence|bauzaun|\btents?\b|zelt|counter|theke|messe|exhibition|spanntuch|a ?frame|sandwich ?board|parasol/],
  [TEX, /t ?shirt|tshirt|\bpolos?\b|hoodie|sweater|sweatshirt|pullover|jacket|jacke|\bcaps?\b|beanie|m(ü|u)tze|apron|sch(ü|u)rze|\bscarf|\bschal\b|\bbaby|romper|strampler|\bsocks?\b|socken|towel|handtuch|badelaken|bademantel|textile|\btextil|\bshirts?\b|\bvests?\b|weste|bandana|bodywarmer/],
  [BAGS, /\bbags?\b|tasche|beutel|\btotes?\b|backpack|rucksack|\bbox(es)?\b|schachtel|karton|carton|mailer|versand|packaging|verpackung|ribbon|geschenkband|\bgifts?\b|geschenk|pouch|wrapping|packpapier/],
  [STICK, /sticker|aufkleber|\blabels?\b|etikett|\btape\b|klebeband/],
  [PROMO, /\bpens?\b|kugelschreiber|\bstift|pencil|lighter|feuerzeug|cricket|lanyard|subyard|schl(ü|u)sselband|key ?ring|schl(ü|u)sselanh|keychain|\bmugs?\b|tasse|becher|\bcups?\b|bottle|flasche|umbrella|schirm|\busb\b|powerbank|notebook|notizbuch|balloon|ballon|stress|sunglass|sonnenbrille|frisbee|coaster|untersetzer|mouse ?pad|mauspad|\bbuttons?\b|\bpins?\b|badge|opener|ice ?scraper|eiskratzer|\bphone|sticky|haftnotiz|werbeartikel|promotional|puzzle|\bgames?\b|\btoys?\b/],
  [INDOOR, /\bsigns?\b|schild|dibond|\balu|forex|acryl|plexi|canvas|leinwand|wallpaper|tapete|\bfloor|fu(ß|ss)boden|\bwindow|fenster|\bwall|wand|magnet|\bphoto|\bfoto|\bframes?\b|rahmen|\bdeko|decoration|\bglass?\b|\bglas\b|\bwood|\bholz/],
  [PAPER, /flyer|folder|leaflet|business ?cards?|visitenkart|poster|plakat|brochure|brosch|magazine|magazin|letterhead|briefpapier|envelope|kuvert|umschlag|postcard|postkarte|\bcards?\b|karte|notepad|notizblock|\bblock|calendar|kalender|booklet|\bmenu|speisekarte|ticket|placemat|tischset|\bbooks?\b|\bbuch|invitation|einladung|certificate|urkunde|\bpaper|papier|door ?hanger|bookmark|lesezeichen|stempel|\bstamps?\b|\bprints?\b|\bdruck/],
];
// Bild-URL (nur images.ctfassets.net), als WebP verkleinert
const IMG = (p, w) => p ? "https://images.ctfassets.net/" + p + (/\.svg$/i.test(p) ? "" : "?fm=webp&w=" + (w || 800)) : "";
function categoryOf(sku, single, plural) { const t = (String(sku || "") + " " + String(single || "") + " " + String(plural || "")).toLowerCase().replace(/[-_]+/g, " "); const r = CAT_RULES.find(x => x[1].test(t)); return r ? r[0] : OTHER; }
const slugN = v => String(v || "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
// Print.com-CMS (öffentliches JSON der Reseller-App): Bilder, Namen, Beschreibungen, Produktbaum – gekürzt auf das Nötige (nicht die ganzen ~10 MB speichern)
// Print.com-Namen, die maschinell falsch übersetzt sind (werden sonst so im Shop angezeigt)
const NAME_FIX = { "bar-apron-pocket": "Barschürzen mit Tasche", "bar-apron-green-generation": "Barschürzen „Green Generation“", "bar-apron-canvas": "Barschürzen aus Canvas", "apron-canvas": "Schürzen aus Canvas", "houston-cap": "Caps „Houston“" };
function cmsTrim(j, keepSkus) {
  j = j || {};
  const A = ref => { const id = ref && (ref.id || ref); const a = id && j.asset && j.asset[id]; const f = a && String(a.file || ""); return f && /^\/\/images\.ctfassets\.net\/[\w\-./%]+$/i.test(f) ? f.slice(23) : ""; };   // Pfad ohne „//images.ctfassets.net/“ (spart Platz)
  const names = {}; Object.values(j.productGroup || {}).forEach(g => { if (g && g.slug) names[slugN(g.slug)] = String(g.name || "").trim(); });
  const pg = id => (j.productGroup || {})[id];
  const menu = Object.values(j.menu || {}).find(m => m && /product groups international/i.test(m.name || "")) || Object.values(j.menu || {}).find(m => m && (m.items || []).some(it => pg(it.id) && slugN(pg(it.id).slug) === PAPER));
  const mains = ((menu && menu.items) || []).map(it => pg(it.id)).filter(Boolean).map(g => ({ slug: slugN(g.slug), name: String(g.name || "").trim(), img: A(g.imageThumbnail || g.groupImage),
    subs: (g.products || []).filter(x => x.type === "productGroup").map(x => pg(x.id)).filter(Boolean).map(s => ({ slug: slugN(s.slug), name: String(s.name || "").trim(), img: A(s.imageThumbnail || s.groupImage) })) }));
  const products = {};
  Object.values(j.product || {}).forEach(p => { if (!p || !p.sku || (keepSkus && !keepSkus.has(String(p.sku)))) return;
    products[p.sku] = { n: String(NAME_FIX[p.sku] || p.productName || "").trim().slice(0, 120), da: String(p.dateAdded || "").slice(0, 10), i: A(p.image || p.icon), g: (p.images || []).map(A).filter(Boolean).slice(0, 6), d: String(p.description || "").trim().slice(0, 600), s: String(p.subtitle || p.summary || "").trim().slice(0, 200), pp: +p.popularity || 0 }; });   // pp = Beliebtheit laut Print.com (für „Bestseller“)
  const options = {};
  Object.values(j.option || {}).forEach(o => { if (!o || !o.slug || !o.property || o.property === "summary_image") return; const u = A(o.icon); if (u) options[o.property + "|" + o.slug] = u; });
  const info = Object.values(j.propertyOptionInfo || {}).filter(x => x && x.slug).map(x => ({ s: [String(x.slug)].concat(String(x.multipleSlugs || "").split(/\s+/).filter(Boolean)), p: String(x.product || "").split(/[\s,]+/).filter(Boolean), pr: String(x.property || ""), d: String(x.description || "").replace(/\s+/g, " ").trim().slice(0, 240), i: A(x.image) })).filter(x => x.d || x.i);
  return { mains, names, products, options, info };
}

// Kuratierte Auswahl: welche Print.com-Produkte, welche Eigenschaften der Kunde sieht, welche Auflagen angeboten werden – liegt über der allgemeinen Produkt-Logik
// (jedes andere im Cockpit freigeschaltete Print.com-Produkt läuft automatisch, siehe genericCfg).
// Felder: group (Kategorie), kind ("flat" Standard | "banner" freie Größe | "textile" | "promo"), designer (Standard: flat/banner ja), expose (Eigenschaften für den Kunden
// oder "auto"), only/skipOpts (Optionen einschränken), fixedOpts (feste Werte, falls die Option existiert), optLabels/titles (deutsche Bezeichnungen), tiers (Auflagen),
// dims (Endformat in mm, falls nicht aus der Größe lesbar), printArea (Druckfläche in mm), areaProp (Eigenschaft mit der Druckfläche), bleed (falls Print.com keinen liefert), dpi (Zielauflösung), prefer (Vorauswahl).
const KONF_DE = { trimmed: "Zuschnitt (ohne Saum)", hemmed: "Gesäumt", hem_eyelet_corner: "Gesäumt, Ösen an den Ecken", hem_eyelets_50: "Gesäumt, Ösen alle 50 cm", hem_eyelets_30: "Gesäumt, Ösen alle 30 cm", sleeve_5cm: "Tunnelsaum 5 cm" };
const TEX_OPTS = { group: TEX, kind: "textile", expose: ["color_textile"], titles: { color_textile: "Farbe" }, fixedOpts: { printtype: "variable", individually_sealed: "no" }, designer: false };
const CURATED = [
  { key: "visitenkarten", group: PAPER, title: "Visitenkarten", icon: "💼", desc: "Der erste Eindruck zum Mitnehmen – ein- oder beidseitig.", skus: ["businesscards", "business-cards", "visitekaartjes"], rx: /business ?cards?|visitenkart|visitekaart/i,
    expose: "auto", tiers: [100, 250, 500, 1000, 2500], designer: true, safe: 3, prefer: { size: ["85x55", "85_x_55", "85_x_55_mm"] } },
  { key: "flyer", group: PAPER, title: "Flyer", icon: "📄", desc: "Angebote, Events und Infos – von A6 bis A4.", skus: ["flyers", "flyer"], rx: /^flyers?$|^flyer/i,
    expose: "auto", tiers: [50, 100, 250, 500, 1000, 2500, 5000], designer: true, safe: 3, prefer: { size: ["a5", "a6", "dl", "din_lang"] } },
  { key: "plakate", group: PAPER, title: "Plakate", icon: "📢", desc: "Große Wirkung für Veranstaltungen und Aktionen.", skus: ["posters", "poster"], rx: /posters?|plakat/i,
    expose: "auto", tiers: [1, 2, 5, 10, 25, 50, 100], designer: true, safe: 5, prefer: { size: ["a2", "a1"] } },
  { key: "folder", group: PAPER, title: "Folder", icon: "🗂️", desc: "Gefalzte Folder für Speisekarten, Preislisten und Prospekte.", skus: ["folders", "folder", "folded-leaflets"], rx: /folders?|falz/i,
    expose: "auto", tiers: [50, 100, 250, 500, 1000, 2500], designer: true, safe: 4 },   // „size“ = gefalztes Format (print.com: „gevouwen A5 = 148 × 210“), Datei = offenes Format → foldSpec()
  { key: "aufkleber", group: PAPER, title: "Aufkleber", icon: "🏷️", desc: "Sticker und Etiketten in vielen Formen.", skus: ["stickers", "sticker"], rx: /stickers?|aufkleber/i,
    expose: "auto", tiers: [50, 100, 250, 500, 1000], designer: true, safe: 3 },
  // Roll-ups: echte SKU „roller-banners“ (nicht „cardboard-roller-banners“ / „table-roll-up-banner“); Größe „banner_85_x_200“ = 85 × 200 cm
  { key: "rollups", group: BANNER, title: "Roll-ups", icon: "🪧", desc: "Mobile Werbesysteme für Messe, Empfang und Events.", skus: ["roller-banners", "rollupbanners", "roll-up-banners", "rollups", "roll-up-banner", "rollup-banners"], rx: /^(roller|roll ?-?ups?) ?-?banners?$/i,
    expose: ["size", "roll_up_banners", "material", "printtype"], titles: { roll_up_banners: "System" }, tiers: [1, 2, 3, 5, 10], designer: true, safe: 10, bleed: 10, dpi: 150, prefer: { size: ["banner_85_x_200"], roll_up_banners: ["basic", "budget"], printtype: ["40"] },
    optLabels: { roll_up_banners: { none: "Nur Druck (ohne System)", budget: "Budget", basic: "Basic", premium: "Premium", luxe: "Luxe", black_basic: "Basic schwarz", premium_black: "Premium schwarz", black_deluxe: "Deluxe schwarz", xxl: "XXL", double_deluxe: "Double Deluxe (beidseitig)" } } },
  // Banner in Wunschgröße: size "custom" + width/height in mm (live geprüft), Konfektion rundum gleich (all_sides_equal_finish)
  // Banner: Print.com-Produkt „banners“ mit allen Materialien (PVC Frontlit, Blockout, Mesh, Textil) und ein-/beidseitigem Druck; Größe frei im Rahmen von Print.com
  { key: "pvc-banner", group: BANNER, cat: BANNER + "/banners-outdoor", kind: "banner", title: "Banner", icon: "🏁", desc: "Wetterfestes Werbebanner in Wunschgröße – PVC Frontlit, Blockout, Mesh oder Textil.", skus: ["banners", "pvc-510"],
    expose: ["material", "printtype"], skipOpts: { printtype: ["00"] }, titles: { material: "Material", printtype: "Druck" },
    optLabels: { material: { "510gr_pvc": "PVC Frontlit 510 g (B1)", "610gr_blockout": "PVC Blockout 610 g (B1, blickdicht)", "280gr_mesh_b1": "Mesh 270 g (winddurchlässig, B1)", pes_outdoor: "Textil PES Outdoor 280 g" }, printtype: { "40": "Einseitig bedruckt", "44": "Beidseitig bedruckt" } },
    fixedOpts: { all_sides_equal_finish: "yes" }, tiers: [1, 2, 3, 5, 10], designer: true, safe: 30, bleed: 40, dpi: 100, prefer: { material: ["510gr_pvc"], printtype: ["40"], konfektion: ["hem_eyelets_50"] } },
  { key: "mesh-banner", group: BANNER, cat: BANNER + "/banners-outdoor", kind: "banner", title: "Mesh-Banner (winddurchlässig)", icon: "🌬️", desc: "Gitterbanner für Gerüste, Zäune und windige Standorte – in Wunschgröße.", skus: ["mesh"],
    expose: ["material"], fixedOpts: { printtype: "40", all_sides_equal_finish: "yes" }, tiers: [1, 2, 3, 5, 10], designer: true, safe: 30, bleed: 40, dpi: 100, custom: [300, 5000, 3000], prefer: { konfektion: ["hem_eyelets_50"] } },
  // Bauzaun: Größe „banner_site_fences“ ohne Maße im Slug → 3410 × 1730 mm (Standard-Bauzaunfeld; vor Livegang mit Print.com-Vorlage prüfen)
  { key: "bauzaun", group: BANNER, title: "Bauzaun-Banner", icon: "🚧", desc: "Werbung am Bauzaun – passend für Standard-Bauzaunfelder.", skus: ["construction-fence-banners"],
    expose: ["material", "finish_all_around"], titles: { material: "Material", finish_all_around: "Konfektion" }, only: { material: ["280gr_mesh_b1", "pes_outdoor", "510gr_pvc"], finish_all_around: ["eyelets_30", "hem_eyelets_30"] },
    optLabels: { material: { "280gr_mesh_b1": "Mesh (winddurchlässig, B1)", pes_outdoor: "Textil (PES outdoor)", "510gr_pvc": "PVC 510 g" }, finish_all_around: { eyelets_30: "Ösen alle 30 cm", hem_eyelets_30: "Gesäumt, Ösen alle 30 cm" } },
    fixedOpts: { printtype: "40" }, dims: [3410, 1730], tiers: [1, 2, 3, 5, 10], designer: true, safe: 30, bleed: 40, dpi: 100 },
  // Textil: Logodruck, Größen-Mix über variants, keine Gestaltung im Designer
  Object.assign({ key: "tshirt-basic", title: "T-Shirt Basic (Fruit of the Loom)", icon: "👕", desc: "Klassisches Baumwoll-Shirt mit deinem Logo – schon ab 1 Stück.", skus: ["t-shirt-budget-5"] }, TEX_OPTS),
  Object.assign({ key: "tshirt-bio", title: "T-Shirt Bio (Stanley/Stella)", icon: "🌱", desc: "Hochwertiges Bio-Baumwoll-Shirt mit deinem Logo.", skus: ["t-shirt-premium-4"] }, TEX_OPTS),
  Object.assign({ key: "hoodie-bio", title: "Hoodie Bio (Stanley/Stella)", icon: "🧥", desc: "Kuscheliger Bio-Hoodie für Team, Verein und Merch.", skus: ["hoodie-premium-8"] }, TEX_OPTS),
  Object.assign({ key: "polo", title: "Poloshirt", icon: "👔", desc: "Poloshirt mit Logo – gedruckt oder gestickt.", skus: ["polo-budget-6"] }, TEX_OPTS),
  // Werbeartikel: Logo-Upload, Logo mittig auf der Druckfläche
  { key: "kugelschreiber", group: PROMO, kind: "promo", title: "Kugelschreiber", icon: "🖊️", desc: "Kugelschreiber mit vollfarbigem Logo-Druck.", skus: ["pen-apollo-hardcolor"], expose: ["color", "printtype"], titles: { color: "Farbe", printtype: "Druck" },
    skipOpts: { printtype: ["00"] }, prefer: { printtype: ["40"] }, fixedOpts: { printingmethod: "digital_uv" }, tiers: [50, 150, 500, 2500], areaProp: "printing_size", printArea: [70, 6] },
  { key: "feuerzeug", group: PROMO, kind: "promo", title: "Feuerzeug", icon: "🔥", desc: "Cricket-Feuerzeuge mit deinem Logo.", skus: ["cricket-original"], expose: ["color", "printtype"], titles: { color: "Farbe", printtype: "Druck" },
    optLabels: { color: { yellow_pms_102c: "Gelb", red_pms_192c: "Rot", blue_pms_2118c: "Blau", "440002_15_black": "Schwarz", "440002_13_white": "Weiß" } }, skipOpts: { printtype: ["00"] }, prefer: { printtype: ["40"] }, fixedOpts: { printingmethod: "digital_uv" }, tiers: [100, 250, 500, 1000], areaProp: "size", printArea: [60, 15] },
  { key: "schluesselband", group: PROMO, kind: "promo", title: "Schlüsselband", icon: "🔑", desc: "Lanyards mit vollflächigem Druck für Events und Team.", skus: ["subyard-standard"], expose: ["size", "printtype", "accessories"], titles: { size: "Breite", printtype: "Druck", accessories: "Ausweishülle" },
    optLabels: { size: { "15_x_430_mm": "15 mm", "20_x_430_mm": "20 mm" }, accessories: { none: "Ohne" } }, skipOpts: { printtype: ["00"] }, prefer: { printtype: ["40"], accessories: ["none"] }, fixedOpts: { printingmethod: "sublimation" }, tiers: [50, 100, 250, 500], areaProp: "size", printArea: [20, 430] },
  { key: "baumwolltasche", group: PROMO, kind: "promo", title: "Baumwolltasche", icon: "👜", desc: "Robuste Stofftasche mit deinem Logo im Siebdruck.", skus: ["canvas-tote-bags"], expose: ["color_material", "print_position", "printtype"],
    titles: { color_material: "Farbe", print_position: "Druck auf", printtype: "Farben" }, skipOpts: { printtype: ["00"] }, fixedOpts: { printingmethod: "screen_printing" }, tiers: [50, 100, 250, 500], printArea: [250, 300], prefer: { printtype: ["10"] },
    optLabels: { color_material: { canvas_natural: "Natur", canvas_black: "Schwarz" }, print_position: { front: "Vorderseite", front_and_back_same_print: "Vorder- und Rückseite (gleiches Motiv)" } } },
  { key: "tasse", group: PROMO, kind: "promo", title: "Tasse mit Logo", icon: "☕", desc: "Keramiktasse mit Rundum-Druck – auch als Einzelstück.", skus: ["mugs"], expose: "auto", fixedOpts: { printtype: "40", printingmethod: "sublimation" }, tiers: [1, 2, 6, 12, 24, 36, 48, 72, 144], printArea: [200, 90] },
  { key: "fruchtgummi", group: PROMO, kind: "promo", title: "Fruchtgummi (Werbetütchen)", icon: "🍬", desc: "Vegane Fruchtgummis im bedruckten Werbetütchen.", skus: ["fruit-gummy-vegan-bears"], expose: "auto", fixedOpts: { printtype: "40" }, tiers: [500, 1000, 1500, 2000], areaProp: "size", printArea: [85, 60] },
  { key: "luftballons", group: PROMO, kind: "promo", title: "Luftballons", icon: "🎈", desc: "Bedruckte Luftballons in vielen Farben.", skus: ["balloons"], expose: ["size", "color", "printtype"], titles: { size: "Ballon", color: "Farbe", printtype: "Druck" }, only: { printtype: ["10", "11"] },
    optLabels: { size: { balloon: "Luftballon (Standard)", heart_balloon: "Herzballon", big_balloon_60: "Riesenballon 60 cm", big_balloon_90: "Riesenballon 90 cm" }, printtype: { "10": "1-farbig, einseitig", "11": "1-farbig, beidseitig" } },
    fixedOpts: { printingmethod: "screen_printing" }, tiers: [100, 250, 500, 1000], printArea: [100, 100] },
];
// Prüfsumme der kuratierten Auswahl (+ Version der Zuordnungslogik): ändert sie sich (Deploy), wird der Katalog sofort neu eingelesen statt erst nach 24 h
const CUR_V = require("crypto").createHash("sha1").update("9" + JSON.stringify(CURATED, (k, v) => v instanceof RegExp ? String(v) : v)).digest("hex").slice(0, 10);
// Textil: Druckpositionen (Reihenfolge = Seitenreihenfolge der Logo-PDF) mit maximaler Druckfläche in mm; Druckarten vereinfacht
const TEX_POS = [["positions_chest", "Brust links", [100, 100]], ["positions_chest_right", "Brust rechts", [100, 100]], ["positions_front", "Vorne groß", [280, 380]], ["positions_back", "Rücken", [280, 380]], ["positions_sleeve_left", "Ärmel links", [80, 80]], ["positions_sleeve_right", "Ärmel rechts", [80, 80]]];
const TEX_METHODS = [{ key: "transfer", label: "Transferdruck (ab 1 Stk., fotorealistisch)", pm: "heat_transfer", val: "transfer", min: 1 }, { key: "screen1", label: "Siebdruck 1-farbig (günstiger ab 25 Stk.)", pm: "screen_printing", val: "1pms", min: 25 },
  { key: "embroidery", label: "Stick (nur Brust)", pm: "embroidering", val: "embroidery", min: 1, only: /^positions_chest/ }];
// bei „alle Optionen“ nicht anbieten: braucht eigene Dateien/Stanzformen/Daten oder betrifft Verpackung & Palettenlieferung
const AUTO_SKIP = /^(personalize|die_cut|spot_finish.*|variable_creasing_line|pallet_delivery|sealed|bundle|box_delivery|flexibleprintingmethod|delivery|standard_bundling|provide_label|designs)$/;
const HIDDEN_PROPS = /^(copies|urgency|hidden|summary_image.*|brezo_article|product_weight|weight|article_number.*|personalize)$/;   // personalize: Personalisierung aus Excel – nie stillschweigend mitbestellen
// Zusatzleistungen, die Print.com als „Pflicht“ markiert, obwohl sie ohne Angabe gültig (und günstiger) sind – z. B. Briefpapier: Bohrlöcher/Ecken ohne „keine“-Option
const EXTRA_PROPS = /^(drillholes|rounded_corners|perforation|sealed|punching|eyelets|creasing_lines?|numbering)$/;
const NONE_OPT = "__none", NONE_SLUG = /^(none|no|geen|no_.*|without.*|0)$/;
const DEF_TIERS = { flat: [100, 250, 500, 1000, 2500], banner: [1, 2, 3, 5, 10], promo: [50, 100, 250, 500, 1000], textile: [] };
const NICE_TIERS = [1, 2, 3, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const URGENCY_DE = { standard: "Standard", quick: "Schnell", urgent: "Express" };
const A_SIZES = { a0: [841, 1189], a1: [594, 841], a2: [420, 594], a3: [297, 420], a4: [210, 297], a5: [148, 210], a6: [105, 148], a7: [74, 105], dl: [99, 210], din_lang: [99, 210] };
// Status im Shop (nicht Print.com): Reihenfolge = Ablauf
const STATUS_DE = { pending_payment: "Wartet auf Zahlung", payment_failed: "Zahlung fehlgeschlagen", paid: "Bezahlt – zur Prüfung", invoice_requested: "Rechnung – Freigabe nötig",
  ordered: "Bei Print.com bestellt", in_production: "In Produktion", shipped: "Versendet", delivered: "Zugestellt", rejected: "Abgelehnt", problem: "Problem bei Print.com" };
const REVIEW = { paid: 1, invoice_requested: 1 };
// Für Kund:innen: nie den Produktionspartner nennen
const STATUS_PUB = Object.assign({}, STATUS_DE, { ordered: "In Produktion gegeben", problem: "In Klärung – wir melden uns" });
// Texte aus dem Print.com-CMS für den Shop: fremde E-Mail-Adressen → simon@fs-creative.at, Links/Nennungen von Print.com entfernen
const SHOP_MAIL = "simon@fs-creative.at";
function scrubText(t) {
  return String(t).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, m => /fs-creative\.at$/i.test(m) ? m : SHOP_MAIL)
    .replace(/https?:\/\/(?:[a-z0-9-]+\.)*print\.com\S*/gi, "").replace(/\bwww\.print\.com\S*/gi, "")
    .replace(/\b(?:bei |von |über |via )?print\.com\b/gi, m => /^(bei|von|über|via) /i.test(m) ? m.split(" ")[0] + " uns" : "FS Creative")
    .replace(/\b(?:drukwerkdeal|printdeal)\b(?:\.[a-z]{2,3})?/gi, "FS Creative");
}
function scrubPub(v, key) {
  if (typeof v === "string") return /^(img|images|src|url|sku|slug|key|val|parent|icon)$/.test(key || "") || /^https:\/\/images\.ctfassets\.net\//.test(v) ? v : scrubText(v);
  if (Array.isArray(v)) return v.map(x => scrubPub(x, key === "images" ? "images" : ""));
  if (v && typeof v === "object") { const o = {}; Object.keys(v).forEach(k => { o[k] = scrubPub(v[k], k); }); return o; }
  return v;
}
// Bonusprogramm für Geschäftskunden: Nettoumsatz (bezahlt bzw. freigegeben) der letzten 12 Monate im Firmenkonto → Rabatt auf alles
const BONUS_TIERS = [{ key: "bronze", name: "Bronze", from: 5000, pct: 3 }, { key: "silber", name: "Silber", from: 10000, pct: 5 }, { key: "gold", name: "Gold", from: 20000, pct: 8 }, { key: "platin", name: "Platin", from: 25000, pct: 10 }];
// Datencheck: „self“ = Kunde gibt frei (automatische Hinweise), bezahlte Aufträge gehen sofort an Print.com; „pro“ = Profi-Check gegen Aufpreis (je Warenkorb), landet in der Warteschlange
const PRO_CHECK_GROSS = 5, MAX_MOTIFS = 10;
// Zahlungsgebühr (Mollie) für die Kalkulation: Standard Kreditkarte EU 1,8 % + 0,25 € (anpassbar per Railway)
const payFee = () => ({ pct: isFinite(parseFloat(process.env.PRINT_PAY_FEE_PCT)) ? parseFloat(process.env.PRINT_PAY_FEE_PCT) : 1.8, fix: isFinite(parseFloat(process.env.PRINT_PAY_FEE_FIX)) ? parseFloat(process.env.PRINT_PAY_FEE_FIX) : 0.25 });
const BONUS_COUNTS = { paid: 1, ordered: 1, in_production: 1, shipped: 1, delivered: 1, problem: 1 };
// Stufe je Kalenderjahr: Umsatz des Jahres ergibt eine Stufe; am 31.12. fällt die erreichte Stufe um zwei zurück (Platin → Silber, Gold → Bronze, Silber/Bronze → keine)
function bonusCalc(orders, year) {
  const by = {}; orders.forEach(o => { const y = +String(o.createdAt).slice(0, 4); if (y) by[y] = (by[y] || 0) + (+(o.price && o.price.net) || 0); });
  const idxOf = rev => { let k = -1; BONUS_TIERS.forEach((t, i) => { if (rev >= t.from) k = i; }); return k; };
  const years = Object.keys(by).map(Number).filter(y => y < year).sort(); let idx = -1, prev = null;
  for (const y of years) { if (prev != null) for (let g = prev; g < y; g++) idx = Math.max(-1, idx - 2); idx = Math.max(idx, idxOf(by[y])); prev = y; }
  if (prev != null) for (let g = prev; g < year; g++) idx = Math.max(-1, idx - 2);
  const carried = idx, revenue = Math.round((by[year] || 0) * 100) / 100, cur = Math.max(carried, idxOf(revenue));
  return { revenue, idx: cur, carried, year };
}

// Shop-AGB: Version wird bei jeder Bestellung gespeichert (bei Änderung der AGB hochzählen, Datum = Stand)
const AGB_VERSION = "2026-10-19";
// Mitgelieferte Schriften (SIL Open Font License, latin-Teilmenge, aus @fontsource) – Browser und PDF nutzen dieselben Dateien (print/fonts/*.woff)
const FONTS = [
  ["Inter", "inter", 1], ["Open Sans", "open-sans", 1], ["Montserrat", "montserrat", 1], ["Lato", "lato", 1], ["Poppins", "poppins", 1], ["Raleway", "raleway", 1], ["Nunito", "nunito", 1],
  ["Playfair Display", "playfair-display", 1], ["Merriweather", "merriweather", 1], ["Lora", "lora", 1], ["Oswald", "oswald", 0], ["Dancing Script", "dancing-script", 0], ["Bebas Neue", "bebas-neue", -1], ["Pacifico", "pacifico", -1],
].map(f => ({ family: f[0], file: f[1], italic: f[2] === 1, bold: f[2] >= 0 }));

module.exports = function (D) {
  D = D || {};
  const DATA_DIR = D.DATA_DIR || __dirname;
  const r2 = n => Math.round((+n || 0) * 100) / 100;
  const nowIso = () => new Date().toISOString();
  const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
  const clip = (v, n) => String(v == null ? "" : v).replace(/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
  const eur = n => (+n || 0).toFixed(2).replace(".", ",") + " €";
  const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const rnd = n => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.randomBytes(n); let s = ""; for (let i = 0; i < n; i++) s += A[b[i] % A.length]; return s; };
  const log = (...a) => console.log("Druckshop:", ...a);

  // ── Konfiguration (Umgebungsvariablen werden bei Bedarf gelesen, damit Tests sie setzen können) ──
  const cfg = () => ({
    pcKey: String(process.env.PRINTCOM_API_KEY || "").trim(),
    pcBase: String(process.env.PRINTCOM_BASE || "https://api.print.com").replace(/\/+$/, ""),
    pcPlatform: String(process.env.PRINTCOM_PLATFORM_BASE || "https://platform.print.com").replace(/\/+$/, ""),
    preflight: process.env.PRINTCOM_PREFLIGHT === "1",
    mollieKey: String(process.env.MOLLIE_PRINT_API_KEY || "").trim(),
    mollieBase: String(process.env.PRINT_MOLLIE_BASE || "https://api.mollie.com/v2").replace(/\/+$/, ""),
    markup: isFinite(parseFloat(process.env.PRINT_MARKUP_PCT)) ? parseFloat(process.env.PRINT_MARKUP_PCT) : 35,
    minMargin: isFinite(parseFloat(process.env.PRINT_MIN_MARGIN_EUR)) ? parseFloat(process.env.PRINT_MIN_MARGIN_EUR) : 8,
    publicUrl: String(process.env.PRINT_PUBLIC_URL || D.ORIGIN || "https://www.fs-creative.at").replace(/\/+$/, ""),
    taxRuleIgl: String(process.env.PRINT_TAXRULE_IGL || "3"),
  });
  const SECRET = (() => {
    const s = String(process.env.PRINT_SECRET || "").trim();
    return s || crypto.createHmac("sha256", String(process.env.ADMIN_AUTH_SECRET || "bitte-ADMIN_AUTH_SECRET-setzen")).update("print-shop-v1").digest("hex");
  })();
  const sig = (kind, id) => crypto.createHmac("sha256", SECRET).update(kind + ":" + id).digest("hex").slice(0, 40);
  const sigOk = (kind, id, got) => { const exp = sig(kind, id); got = String(got || ""); return got.length === exp.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(exp)); };
  // Rechnungsanschrift bei Print.com = FS Creative (deren Rechnung kommt per Mail an FS Creative, nie an den Kunden)
  const billingFs = () => ({ companyName: "FS Creative", firstName: "Simon", lastName: "Felder", fullstreet: process.env.PRINT_BILLING_STREET || "Dorfstraße 3/1", postcode: process.env.PRINT_BILLING_ZIP || "6793",
    city: process.env.PRINT_BILLING_CITY || "Gaschurn", country: "AT", email: process.env.PRINT_BILLING_EMAIL || "simon@fs-creative.at", telephone: process.env.PRINT_BILLING_PHONE || "+43 664 1430620",
    vatNr: String(process.env.PRINT_BILLING_VATNR || FIRM_DEFAULT.uid || "").replace(/\s+/g, "") || undefined });

  // ───────────────────────── Speicher ─────────────────────────
  const useDb = () => !!(process.env.DATABASE_URL && D.fin);
  let dbReady = null;
  async function db() {
    const c = D.fin.db();
    if (!dbReady) dbReady = (async () => {
      await D.fin.init();
      await c.query("create table if not exists print_order (id text primary key, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())");
      await c.query("create table if not exists print_file (id text primary key, meta jsonb not null, data bytea, created_at timestamptz not null default now())");
    })().catch(e => { dbReady = null; throw e; });
    await dbReady; return c;
  }
  const FDIR = () => { const d = path.join(DATA_DIR, "print-shop"); ["orders", "files"].forEach(s => { try { fs.mkdirSync(path.join(d, s), { recursive: true }); } catch (e) {} }); return d; };
  const rdJson = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
  const wrJson = (f, o) => { const t = f + ".tmp" + process.pid; fs.writeFileSync(t, JSON.stringify(o)); fs.renameSync(t, f); };
  const okId = id => /^[A-Za-z0-9_-]{6,60}$/.test(String(id || ""));
  // Aufträge im Cockpit (server.js): jede gespeicherte Bestellung meldet ihren Stand – daraus wird die Aufgabe im Auftrag „Druckshop“
  function taskInfo(o) { const c = o.customer || {}, p = o.price || {};
    return { id: o.id, nr: o.nr, status: o.status, statusText: STATUS_DE[o.status] || o.status, createdAt: o.createdAt, product: (o.product && o.product.title) || "", copies: o.copies, customer: c.company || ((c.firstName || "") + " " + (c.lastName || "")).trim(),
      gross: p.gross, purchase: p.purchase && p.purchase.total, margin: p.margin, delivery: p.deliveryDate || "", payment: o.payment && o.payment.method, paymentStatus: o.payment && o.payment.status, pcOrder: (o.printcom && o.printcom.orderNumber) || "", reason: o.rejectReason || "" }; }
  function toTask(o) { if (D.onOrder && o && o.id) { try { D.onOrder(taskInfo(o)); } catch (e) { console.log("Druckshop: Aufträge", e.message); } } }
  const store = {
    async getOrder(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select data from print_order where id=$1", [id]); return r.rows[0] ? r.rows[0].data : null; } return rdJson(path.join(FDIR(), "orders", id + ".json")); },
    async putOrder(o) { o.updatedAt = nowIso(); if (useDb()) { await (await db()).query("insert into print_order(id,data) values($1,$2::jsonb) on conflict(id) do update set data=excluded.data, updated_at=now()", [o.id, JSON.stringify(o)]); toTask(o); return o; } wrJson(path.join(FDIR(), "orders", o.id + ".json"), o); toTask(o); return o; },
    async listOrders() { if (useDb()) { const r = await (await db()).query("select data from print_order order by created_at desc limit 1000"); return r.rows.map(x => x.data); }
      const d = path.join(FDIR(), "orders"); return fs.readdirSync(d).filter(f => /\.json$/.test(f)).map(f => rdJson(path.join(d, f))).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); },
    async putFile(meta, buf) { if (useDb()) { await (await db()).query("insert into print_file(id,meta,data) values($1,$2::jsonb,$3) on conflict(id) do update set meta=excluded.meta, data=coalesce(excluded.data, print_file.data)", [meta.id, JSON.stringify(meta), buf || null]); return meta; }
      const d = path.join(FDIR(), "files"); if (buf) fs.writeFileSync(path.join(d, meta.id + ".pdf"), buf); wrJson(path.join(d, meta.id + ".json"), meta); return meta; },
    async fileMeta(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select meta from print_file where id=$1", [id]); return r.rows[0] ? r.rows[0].meta : null; } return rdJson(path.join(FDIR(), "files", id + ".json")); },
    async fileData(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select data from print_file where id=$1", [id]); return r.rows[0] ? r.rows[0].data : null; } try { return fs.readFileSync(path.join(FDIR(), "files", id + ".pdf")); } catch (e) { return null; } },
    async listFiles() { if (useDb()) { const r = await (await db()).query("select meta from print_file"); return r.rows.map(x => x.meta); } const d = path.join(FDIR(), "files"); return fs.readdirSync(d).filter(f => /\.json$/.test(f)).map(f => rdJson(path.join(d, f))).filter(Boolean); },
    async delFile(id) { if (!okId(id)) return; if (useDb()) { await (await db()).query("delete from print_file where id=$1", [id]); return; } ["pdf", "json"].forEach(x => { try { fs.unlinkSync(path.join(FDIR(), "files", id + "." + x)); } catch (e) {} }); },
    async getMeta(k) { if (useDb()) { await db(); return D.fin.getMeta(k); } return rdJson(path.join(FDIR(), k + ".json")); },
    async setMeta(k, v) { if (useDb()) { await db(); return D.fin.setMeta(k, v); } wrJson(path.join(FDIR(), k + ".json"), v); },
  };

  // ───────────────────────── Einstellungen ─────────────────────────
  // Sortiment: enabled[sku] (true/false, fehlt = Kategorie entscheidet), catEnabled[Kategorie] (ganze Kategorie an), catOverride[sku] (Kategorie von Hand),
  // seeded[sku] (kuratierte Produkte einmalig freigeschaltet – spätere Entscheidungen im Cockpit werden nie überschrieben). products[key]: Aufschlag/Mindestmarge/SKU/Optionen.
  let SETTINGS = null;
  const objOf = x => x && typeof x === "object" && !Array.isArray(x) ? x : {};
  async function settings() {
    if (SETTINGS) return SETTINGS;
    const s = (await store.getMeta("print_settings").catch(() => null)) || {};
    SETTINGS = { anchors: objOf(s.anchors), anchorGap: s.anchorGap != null && isFinite(+s.anchorGap) ? +s.anchorGap : 2, minMarginPct: s.minMarginPct != null && isFinite(+s.minMarginPct) ? +s.minMarginPct : 10, markupPct: s.markupPct != null && isFinite(+s.markupPct) ? +s.markupPct : null, minMarginEur: s.minMarginEur != null && isFinite(+s.minMarginEur) ? +s.minMarginEur : null, live: s.live === true, autoSend: s.autoSend === true, open: s.open !== false, products: objOf(s.products), enabled: objOf(s.enabled), catEnabled: objOf(s.catEnabled), catOverride: objOf(s.catOverride), seeded: objOf(s.seeded), anchorsFile: String(s.anchorsFile || ""), groupMargin: objOf(s.groupMargin) };
    // Mitbewerber-Preisanker aus print-anchors.json (versioniert im Repo): neue Version → Produkte daraus übernehmen, übrige Anker bleiben
    if (process.env.PRINT_ANCHORS_FILE !== "off") try { const f = JSON.parse(fs.readFileSync(path.join(__dirname, "print-anchors.json"), "utf8")); if (f && f.version && String(f.version) !== SETTINGS.anchorsFile && f.anchors) { await saveSettings({ anchors: f.anchors, anchorsFile: String(f.version) }); log("Preisanker " + f.version + " übernommen (" + Object.keys(f.anchors).length + " Produkte)"); } } catch (e) { if (e.code !== "ENOENT") log("Preisanker-Datei:", e.message); }
    return SETTINGS;
  }
  const SKU_RX = /^[a-z0-9_-]{1,80}$/i;
  async function saveSettings(pl) {
    const s = await settings();
    if (pl.live !== undefined) s.live = pl.live === true;
    if (pl.anchorsFile) s.anchorsFile = String(pl.anchorsFile).slice(0, 40);
    // Ziel-Marge je Hauptkategorie in % vom Nettopreis (1–60), null = Standard
    if (pl.groupMargin && typeof pl.groupMargin === "object") { s.groupMargin = s.groupMargin || {}; Object.keys(pl.groupMargin).slice(0, 40).forEach(k => { if (!/^[a-z0-9_-]{1,60}$/.test(k)) return; const v = pl.groupMargin[k], n = parseFloat(String(v == null ? "" : v).replace(",", ".")); if (v === null || v === "" || !isFinite(n)) delete s.groupMargin[k]; else s.groupMargin[k] = Math.max(1, Math.min(60, Math.round(n * 10) / 10)); }); }
    // Marge für alle Produkte: globaler Aufschlag/Mindestmarge (null = Standard aus PRINT_MARKUP_PCT/PRINT_MIN_MARGIN_EUR); applyAll entfernt alle Einzelwerte
    ["markupPct", "minMarginEur"].forEach(k => { if (pl[k] === undefined) return; const n = parseFloat(String(pl[k]).replace(",", ".")); s[k] = pl[k] === null || pl[k] === "" || !isFinite(n) ? null : Math.max(0, Math.min(k === "markupPct" ? 500 : 1000, n)); });
    // Preisanker (Mitbewerber-Bruttopreise je Ausführung und Auflage): Ziel = Anker − Abstand, nie unter Einkauf + Mindestmarge
    if (pl.anchors && typeof pl.anchors === "object") Object.keys(pl.anchors).slice(0, 300).forEach(k => { const a = pl.anchors[k]; if (a === null) { delete s.anchors[k]; return; } if (!Array.isArray(a)) return;
      const tc = t => Object.keys(t || {}).reduce((o, c) => { const v = parseFloat(t[c]); if (+c > 0 && v > 0) o[+c] = v; return o; }, {});
      // area: Banner in Wunschgröße – Mitbewerberpreise je Fläche (m²) und Auflage, dazwischen linear interpoliert
      s.anchors[k] = a.slice(0, 400).map(x => Object.assign({ sig: Object.assign({}, x.sig || {}), tiers: tc(x.tiers), src: clip(x.src || "druck.at", 60), at: x.at || today() },
        Array.isArray(x.area) ? { area: x.area.slice(0, 120).map(p => [parseFloat(p && p[0]), tc(p && p[1])]).filter(p => p[0] > 0 && Object.keys(p[1]).length) } : {})).filter(x => Object.keys(x.tiers).length || (x.area && x.area.length > 1)); });
    if (pl.anchorGap !== undefined) { const g = parseFloat(String(pl.anchorGap).replace(",", ".")); if (isFinite(g) && g >= 0 && g <= 50) s.anchorGap = g; }
    if (pl.minMarginPct !== undefined) { const g = parseFloat(String(pl.minMarginPct).replace(",", ".")); if (isFinite(g) && g >= 0 && g <= 100) s.minMarginPct = g; }
    if (pl.applyAll === true) Object.keys(s.products).forEach(k => { delete s.products[k].markupPct; delete s.products[k].minMarginEur; });   // Startschalter im Cockpit (zusätzlich zu PRINT_SHOP_LIVE)
    if (pl.autoSend !== undefined) s.autoSend = pl.autoSend === true;
    if (pl.open !== undefined) s.open = pl.open !== false;
    if (pl.products && typeof pl.products === "object") {
      Object.keys(pl.products).slice(0, 2000).forEach(key => {
        const c = CURATED.find(x => x.key === key); if (!c && !SKU_RX.test(key)) return;   // kuratierter Schlüssel oder Print.com-SKU (allgemeine Produkte)
        const x = pl.products[key]; if (!x || typeof x !== "object") return;
        const cur = s.products[key] = s.products[key] || {};
        if (x.enabled !== undefined) cur.enabled = x.enabled !== false;
        if (x.sku !== undefined && c) cur.sku = /^[a-z0-9_-]{0,80}$/i.test(String(x.sku || "")) ? String(x.sku || "") : cur.sku || "";
        ["markupPct", "minMarginEur"].forEach(k => { if (x[k] === undefined) return; const n = parseFloat(String(x[k]).replace(",", ".")); cur[k] = x[k] === null || x[k] === "" || !isFinite(n) ? null : Math.max(0, Math.min(k === "markupPct" ? 500 : 1000, n)); });
        if (x.allow && typeof x.allow === "object") { cur.allow = {}; Object.keys(x.allow).slice(0, 20).forEach(prop => { if (!/^[a-z0-9_-]{1,60}$/i.test(prop) || !Array.isArray(x.allow[prop])) return; const v = x.allow[prop].map(String).filter(o => /^[a-z0-9_.-]{1,80}$/i.test(o)).slice(0, 80); if (v.length) cur.allow[prop] = v; }); }
      });
    }
    await store.setMeta("print_settings", s); SETTINGS = s; return s;
  }
  // Sichtbar im Shop: einzeln an ODER (Kategorie an UND nicht einzeln aus); Untergruppe (an/aus) vor Hauptgruppe; kuratierte zusätzlich über products[key].enabled abschaltbar
  function shown(s, sku, key, cat) {
    const ov = (key && s.products[key]) || {}; if (ov.enabled === false) return false;
    const e = s.enabled[sku]; if (e === true) return true; if (e === false) return false;
    cat = cat || {}; if (cat.sub && (s.catEnabled[cat.sub] === true || s.catEnabled[cat.sub] === false)) return s.catEnabled[cat.sub];
    return s.catEnabled[cat.main] === true;
  }
  const CAT_RX = /^[a-z0-9-]{1,80}(\/[a-z0-9-]{1,80})?$/;
  async function sortimentOp(b) {
    const s = await settings(), op = String(b.op || ""), sku = String(b.sku || ""), cat = String(b.cat || "");
    if (op === "set") { if (!SKU_RX.test(sku)) throw new Error("SKU ungültig"); if (b.on === true || b.on === false) s.enabled[sku] = b.on; else delete s.enabled[sku];
      if (b.on === true) CURATED.forEach(c => { const ov = s.products[c.key]; if (ov && ov.enabled === false && CAT && (CAT.products || []).some(p => p.key === c.key && p.sku === sku)) delete ov.enabled; }); }
    else if (op === "cat") { if (!/^[a-z0-9-]{1,80}$/.test(cat)) throw new Error("Kategorie unbekannt"); if (b.on === true || b.on === false) s.catEnabled[cat] = b.on; else delete s.catEnabled[cat]; }
    else if (op === "catAll") { if (!/^[a-z0-9-]{1,80}$/.test(cat)) throw new Error("Kategorie unbekannt"); const all = await catalogAll(); ((all && all.items) || []).forEach(it => { const c = catOf(it.sku, s, it.auto); if (c.main === cat || c.sub === cat) s.enabled[it.sku] = b.on === true; }); }
    else if (op === "override") { if (!SKU_RX.test(sku)) throw new Error("SKU ungültig"); if (CAT_RX.test(cat)) s.catOverride[sku] = cat; else delete s.catOverride[sku]; }
    else throw new Error("unbekannte Aktion");
    await store.setMeta("print_settings", s); SETTINGS = s; return s;
  }

  // ───────────────────────── Print.com ─────────────────────────
  // Print.com schonen: höchstens 4 Anfragen gleichzeitig (Rest wartet), bei Drosselung (429) bzw. kurzer Störung (502/503) automatisch kurz warten und neu versuchen
  // Nebensächliches (Aufpreise neben den Optionen) läuft mit niedriger Priorität: lässt immer einen Platz und 2 Anfragen/s für echte Preisanfragen frei
  const PC_MAX = 6; let pcActive = 0; const pcWait = [], pcLow = [];
  const PC_RATE = 8, pcStarts = [];   // höchstens 8 Anfragen je Sekunde
  const pcSlot = low => new Promise(res => { if (pcActive < (low ? PC_MAX - 2 : PC_MAX)) { pcActive++; res(); } else (low ? pcLow : pcWait).push(res); }).then(async () => {
    for (;;) { const now = Date.now(); while (pcStarts.length && now - pcStarts[0] > 1000) pcStarts.shift(); if (pcStarts.length < (low ? PC_RATE - 2 : PC_RATE)) { pcStarts.push(now); return; } await new Promise(r => setTimeout(r, 1000 - (now - pcStarts[0]) + 5)); } });
  const pcFree = () => { const n = pcWait.shift() || pcLow.shift(); if (n) n(); else pcActive--; };
  async function pcApi(method, p, body, opts) {
    for (let a = 0; ; a++) {
      await pcSlot(!!(opts && opts.low)); let e0 = null, out;
      try { out = await pcApi1(method, p, body, opts); } catch (e) { e0 = e; } finally { pcFree(); }
      if (!e0) return out;
      // kurze Störungen bei Print.com: 429/502/503 immer, 500 nur bei Preis-/Versandabfragen (z. B. „calculating urgency prices failed: UNAVAILABLE“)
      const transient = e0.status === 429 || e0.status === 502 || e0.status === 503 || e0.status === 504 || (e0.status === 500 && /\/price$|^\/shipping\//.test(p));
      if (!transient || a >= 3 || (opts && opts.form)) throw e0;
      await new Promise(r => setTimeout(r, [700, 1800, 4000][a] + Math.random() * 400));
    }
  }
  async function pcApi1(method, p, body, opts) {
    opts = opts || {};
    const c = cfg(); if (!c.pcKey) { const e = new Error("Print.com ist noch nicht eingerichtet (PRINTCOM_API_KEY fehlt)"); e.status = 503; throw e; }
    const auth = /^(Bearer|PrintApiKey)\s/i.test(c.pcKey) ? c.pcKey : "PrintApiKey " + c.pcKey;
    const headers = { authorization: auth, accept: "application/json", "accept-language": "de-DE" };
    let payload;
    if (opts.form) payload = opts.form; else if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
    const r = await fetch((opts.base || c.pcBase) + p, { method, headers, body: payload, signal: AbortSignal.timeout(opts.timeout || 30000) });
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch (e) {}
    if (!r.ok) { const m = (j && (j.message || (j.error && (j.error.message || j.error)) || (Array.isArray(j.errors) && j.errors.map(x => x.message || x).join("; ")))) || txt.slice(0, 200) || "HTTP " + r.status; const e = new Error("Print.com: " + String(m).slice(0, 300)); e.status = r.status; e.detail = j; throw e; }
    return j;
  }
  const firstOf = j => (j && Array.isArray(j.results) ? j.results[0] : j) || {};

  // ── Katalog (täglich neu) ──
  let CAT = null, catLoading = null, ALL = null;
  const PD_CACHE = new Map();   // allgemeine (nicht kuratierte) Produkte: Details erst beim Öffnen laden, 24 h merken
  function dimsOf(o) {
    const slug = String(o.slug || "").toLowerCase(), t = (slug + " " + String(o.name || "")).toLowerCase().replace(/_/g, " ");
    const RX = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m\b)?/, num = x => parseFloat(x.replace(",", "."));
    const conv = m => { const f = m[3] === "cm" || (!m[3] && /^banner_\d/.test(slug)) ? 10 : m[3] === "m" ? 1000 : 1; return [num(m[1]) * f, num(m[2]) * f]; };   // „banner_85_x_200“ (Roll-ups) ohne Einheit = cm
    const w = parseFloat(String(o.width || "").replace(",", ".")), h = parseFloat(String(o.height || "").replace(",", "."));
    if (w > 0 && h > 0 && w <= 60000 && h <= 60000) {   // Breite/Höhe von Print.com (mm; Roll-ups z. B. 1000 × 2060 inkl. Kassette)
      // … außer sie stehen offensichtlich in cm: Name mit Einheit ist genau 10× so groß (Vliesbanner: 2000/76, Name „2000 x 76 cm“ = 20 m × 76 cm)
      const mN = String(o.name || "").toLowerCase().replace(/_/g, " ").match(RX), n = mN && mN[3] ? conv(mN) : null, near = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.01);
      return n && near(n[0], w * 10) && near(n[1], h * 10) ? n : [w, h];
    }
    if (/\d\s*[x×*]\s*\d+(?:[.,]\d+)?\s*[x×*]\s*\d/.test(t)) return null;   // „43 x 18 x 35 cm“ = Produktmaße (B × T × H einer Tasche), kein Druckformat
    const m = t.match(RX); if (m) return conv(m);
    const a = t.match(/\b(a[0-7]|dl|din lang)\b/); if (a) return A_SIZES[a[1].replace(" ", "_")].slice();
    return null;
  }


  const fmtDims = d => d[0] >= 100 && d[1] >= 100 && d[0] % 10 === 0 && d[1] % 10 === 0 ? d[0] / 10 + " × " + d[1] / 10 + " cm" : d[0] + " × " + d[1] + " mm";
  // Druckart verständlich benennen: „4/4-farbig“ → „Beidseitig farbig (4/4)“, „1/0 Pantone“ → „Einseitig, 1 Pantone-Farbe (1/0)“ (Wunsch Simon: 4/4 allein versteht nicht jeder)
  function ptName(name, slug) {
    const nm = String(name || ""), sl = String(slug || ""), m = nm.match(/(\d)\s*\/\s*(\d)/) || sl.match(/^(\d)(\d)(?:_|$)/); if (!m) return nm;
    const a = +m[1], b = +m[2], t = nm + " " + sl, pms = /pantone|pms/i.test(t), white = /wei(ß|ss)|white/i.test(t), black = /schwarz|black/i.test(t), code = " (" + a + "/" + b + ")";
    if (!a && !b) return "Unbedruckt";
    if (a !== b && b !== 0) return "Vorderseite " + (a === 4 ? "farbig" : a + "-farbig") + ", Rückseite " + (b === 1 ? "schwarz" : b === 4 ? "farbig" : b + "-farbig") + code;
    const side = b === 0 ? "Einseitig" : "Beidseitig";
    if (white) return side + " farbig + Weiß" + code;
    if (pms) return side + (black && a === 1 ? " " : ", ") + (black && a === 1 ? "schwarz (Pantone-Schwarz)" : a === 1 ? "1 Pantone-Farbe" : a + " Pantone-Farben") + code;
    return side + " " + (a === 4 ? "farbig" : a === 1 && black ? "schwarz" : a + "-farbig") + code;
  }
  const ptLabel = v => { const m = String(v).match(/^(\d)(\d)$/); if (!m) return null; if (m[1] === "0") return "ohne Druck"; return m[2] === "0" ? (m[1] === "4" ? "4-farbig (CMYK)" : m[1] + "-farbig") : m[1] + "/" + m[2] + "-farbig (beidseitig)"; };
  const weightOf = o => { const m = (String(o.slug) + " " + String(o.name || "")).match(/(\d{2,4})\s*(gr|g\b|g\/m|gsm)/i); return m ? +m[1] : 0; };
  const coated = o => /bilderdruck|gloss|glänz|matt|silk|satin|(^|_)mc(_|$)/i.test(String(o.slug) + " " + String(o.name || "")) ? 1 : 0;
  // Größen klein → groß, Papiere leicht → schwer (ohne Angabe ans Ende, sonst Reihenfolge von Print.com)
  function sortOpts(slug, opts) {
    const by = f => opts.map((o, i) => [o, i]).sort((a, b) => f(a[0]) - f(b[0]) || a[1] - b[1]).map(x => x[0]);
    if (opts.some(o => o.w && o.h)) return by(o => o.w && o.h ? o.w * o.h : 1e12);
    if (/^(material|paper)/.test(slug) && opts.some(weightOf)) return by(o => weightOf(o) || 1e9);
    return opts;
  }
  function autoKind(by, pd) {
    if (by.textile_sizes) return "textile";
    const so = by.size && Array.isArray(by.size.options) ? by.size.options : [];
    if (so.some(o => o && String(o.slug) === "custom") && !so.some(o => { const d = o && String(o.slug) !== "custom" && dimsOf(o); return d && Math.max(d[0], d[1]) < 1000; })) return "banner";   // nur freie Größe bzw. nur Großformate
    if (by.printing_size || (pd.bleed !== undefined && +pd.bleed === 0 && !so.some(o => o && dimsOf(o)))) return "promo";
    return "flat";
  }
  // Ausschlussregeln von Print.com: Liste von Regeln, jede Regel = Liste von Bedingungen {property, options}; eine Regel schließt eine Auswahl nur aus,
  // wenn ALLE Bedingungen zutreffen (Wert der Eigenschaft ∈ options). Nicht gesetzte Eigenschaften treffen nie zu. alias: finish_left … → „konfektion“.
  function hitRules(excludes, cur, alias) {
    return (excludes || []).some(r => r.length > 0 && r.every(x => { const v = cur[x.property] != null ? cur[x.property] : alias && alias[x.property] ? cur[alias[x.property]] : null; return v != null && x.options.indexOf(String(v)) > -1; }));
  }
  // Erste gültige Ergänzung: vars = [[slug, [Optionen in Wunsch-Reihenfolge]], …] (Tiefensuche, bricht ab, sobald eine Regel vollständig zutrifft)
  const OMITTABLE = /^(pallet_delivery|bundle|cross_bundle|packaging_extras|sheet_size|special_size)$/;   // Logistik-/Produktionsangaben, die Print.com je Verfahren auch ohne Wert akzeptiert
  function solveSel(vars, base, excludes, alias) {
    const cur = Object.assign({}, base); vars = vars.filter(v => base[v[0]] == null && v[1].length);
    if (hitRules(excludes, cur, alias)) return null;
    let steps = 0;
    // Option null = Eigenschaft weglassen (letzter Ausweg): Print.com verlangt z. B. pallet_delivery nur bei Offset – bei Digital/Inkjet ist jeder Wert ausgeschlossen, ohne Angabe gültig
    const go = i => { if (i >= vars.length) return true; for (const o of vars[i][1]) { if (++steps > 20000) return false; if (o === null) delete cur[vars[i][0]]; else cur[vars[i][0]] = o; if (!hitRules(excludes, cur, alias) && go(i + 1)) return true; } delete cur[vars[i][0]]; return false; };
    return go(0) ? cur : null;
  }
  const qtyIn = (r, n) => r.ranges.some(g => n >= g.min && n <= g.max && (n - g.min) % g.step === 0);
  const aliasOf = prod => { const a = {}; prod.props.forEach(pr => (pr.sets || []).forEach(x => { a[x] = pr.slug; })); return a; };
  function parseProduct(c, sku, pd) {
    pd = pd || {};
    const props = Array.isArray(pd.properties) ? pd.properties : [];
    const by = {}; props.forEach(p => { if (p && p.slug) by[p.slug] = p; });
    const kind = c.kind || (c.generic ? autoKind(by, pd) : "flat");
    // Auflagen-Bereiche (rangeSets, je Druckverfahren): freie Menge in Schritten, summary = Schnellauswahl
    const qty = (by.copies && Array.isArray(by.copies.rangeSets) ? by.copies.rangeSets : []).filter(r => r && typeof r === "object").slice(0, 10).map(r => ({ pm: r.printingmethod ? String(r.printingmethod) : null,
      summary: (Array.isArray(r.summary) ? r.summary : []).map(Number).filter(n => n > 0 && n <= 1e6),
      ranges: (Array.isArray(r.options) ? r.options : []).map(o => ({ min: +o.min, max: +o.max, step: +o.steps > 0 ? +o.steps : 1 })).filter(g => g.min > 0 && g.max >= g.min) })).filter(r => r.ranges.length);
    const qtyAny = n => qty.some(r => qtyIn(r, n));
    let avail = (by.copies && Array.isArray(by.copies.options) ? by.copies.options : []).map(o => parseInt(o.slug != null ? o.slug : o.name, 10)).filter(n => n > 0).sort((a, b) => a - b);
    if (!avail.length && qty.length) avail = Array.from(new Set([].concat.apply([], qty.map(r => r.summary)))).filter(qtyAny).sort((a, b) => a - b);
    // Auflagen: kuratiert (soweit bei Print.com vorhanden); allgemein aus den Print.com-Auflagen (runde Werte), sonst Standard je Art
    let tiers = c.generic && avail.length ? [] : (c.tiers || DEF_TIERS[kind] || DEF_TIERS.flat).filter(t => qty.length ? qtyAny(t) : !avail.length || avail.indexOf(t) > -1);
    if (!tiers.length) { const nice = avail.filter(n => NICE_TIERS.indexOf(n) > -1); tiers = Array.from(new Set(nice.length >= 3 || !qty.length ? (nice.length ? nice : avail) : avail)).slice(0, 10); }
    if (kind === "textile") tiers = []; else if (!tiers.length) throw new Error("keine Auflagen");
    const urgency = (by.urgency && Array.isArray(by.urgency.options) && by.urgency.options.length ? by.urgency.options : [{ slug: "standard" }]).map(o => ({ slug: String(o.slug), name: URGENCY_DE[o.slug] || o.name || o.slug })).filter(o => /^(standard|quick|urgent)$/.test(o.slug));
    const L = c.optLabels || {}, T = c.titles || {}, only = c.only || {}, skip = c.skipOpts || {}, fo = c.fixedOpts || {}, autoExp = c.expose === "auto", expose = autoExp ? [] : (c.expose || []);
    const areaProp = c.areaProp !== undefined ? c.areaProp : kind === "promo" ? (by.printing_size ? "printing_size" : "size") : null;
    const manual = kind === "textile" ? /^(positions_|textile_sizes$|printingmethod$)/ : kind === "banner" ? /^(size|width|height)$/ : null;
    const fixed = {}, auto = {}, exposed = [], areas = {};
    // Reihenfolge/Sichtbarkeit wie in der Print.com-App: propertyGroups (Spalte „hidden“/„summary“ = nicht anzeigen), viewMode.reseller "hidden"
    const pOrder = [], pHidden = {};
    (Array.isArray(pd.propertyGroups) ? pd.propertyGroups : []).forEach(g => { const cw = String((g && ((g.columnWidth && g.columnWidth.reseller) || (g.viewMode && g.viewMode.reseller))) || ""); ((g && g.properties) || []).forEach(x => { const sl = x && typeof x === "object" ? x.slug : x; if (!sl) return; pOrder.push(String(sl)); if (/hidden|summary/.test(cw)) pHidden[sl] = 1; }); });
    // freie Größe (Option „custom“ mit customSizes in mm): Banner kuratiert in cm, sonst mm
    const cuOpt = by.size && (by.size.options || []).find(o => o && String(o.slug) === "custom"), cs = cuOpt && cuOpt.customSizes;
    const custom = c.custom ? { minW: c.custom[0], minH: c.custom[0], maxW: c.custom[1], maxH: c.custom[2], unit: "cm" }
      : cs && +cs.maxWidth > 0 && +cs.maxHeight > 0 ? { minW: +cs.minWidth || 10, minH: +cs.minHeight || 10, maxW: +cs.maxWidth, maxH: +cs.maxHeight, unit: kind === "banner" ? "cm" : "mm" } : kind === "banner" ? { minW: 300, minH: 300, maxW: 5000, maxH: 3000, unit: "cm" } : null;
    const optExtra = (slug, o) => { const x = {}; const inf = cmsInfo(sku, String(o.slug), slug); const d = String(o.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || (inf && inf.d) || ""; if (d) x.desc = d.slice(0, 220);
      const ic = cmsOptImg(slug, String(o.slug)) || (inf && inf.i) || ""; if (ic) x.img = IMG(ic, 160);
      const hex = JSON.stringify(o.enrichments || "").match(/#[0-9a-f]{6}\b/i); if (hex) x.color = hex[0];
      if (o.parent != null && (typeof o.parent === "string" || typeof o.parent === "number")) x.parent = String(o.parent);
      return x; };
    const optOut = (slug, o) => { const d = slug === "size" || slug === areaProp ? (dimsOf(o) || (slug === "size" && c.dims ? c.dims.slice() : null)) : null;
      const nm = (L[slug] && L[slug][o.slug]) || (/^printtype/.test(slug) && ptName(o.name, o.slug)) || (o.name != null && String(o.name) !== String(o.slug) ? String(o.name) : d ? fmtDims(d) : String(o.name || o.slug));
      return Object.assign({ slug: String(o.slug), name: String(o.slug) === "custom" && slug === "size" ? "Eigenes Format" : nm, w: d ? d[0] : null, h: d ? d[1] : null }, optExtra(slug, o)); };
    props.forEach(p => {
      if (!p || !p.slug || HIDDEN_PROPS.test(p.slug) || p.locked) return;
      let opts = (Array.isArray(p.options) ? p.options : []).filter(o => o && o.slug != null && String(o.slug).trim() !== "-" && String(o.name == null ? o.slug : o.name).trim() !== "");   // Print.com-Platzhalter („-“, leerer Name) weglassen
      if (areaProp && p.slug === areaProp) opts.forEach(o => { const d = dimsOf(o); if (d) areas[String(o.slug)] = d; });
      if (manual && manual.test(p.slug)) return;
      if (kind !== "banner" && p.slug === "size" && !custom) opts = opts.filter(o => String(o.slug) !== "custom");   // „custom“ ohne erlaubte Maße ausblenden
      if (only[p.slug]) { const f = opts.filter(o => only[p.slug].indexOf(String(o.slug)) > -1); if (f.length) opts = f; }
      if (EXTRA_PROPS.test(p.slug) && !opts.some(o => NONE_SLUG.test(String(o.slug)))) { p = Object.assign({}, p, { required: false }); opts = [{ slug: NONE_OPT, name: "Ohne" }].concat(opts); }   // „Ohne“ = Eigenschaft weglassen
      if (skip[p.slug]) { const f = opts.filter(o => skip[p.slug].indexOf(String(o.slug)) < 0); if (f.length) opts = f; }
      if (!opts.length) return;
      const hidden = pHidden[p.slug] || (p.viewMode && String(p.viewMode.reseller || "") === "hidden");
      const want = autoExp ? opts.length > 1 && !hidden && fo[p.slug] === undefined && !/^(finish_(left|right|top|bottom)|printingmethod)$/.test(p.slug) && !AUTO_SKIP.test(p.slug) : expose.indexOf(p.slug) > -1;   // Druckverfahren wählt der Shop passend zu Menge/Ausschlüssen
      // parentOptions sind bei Print.com Gruppenüberschriften der Optionen (z. B. „A-Formate“, „Quadrat“, Papierfamilien) – keine Bedingung
      const grp = Array.isArray(p.parentOptions) ? p.parentOptions.filter(x => x && typeof x === "object" && x.slug != null).map(x => ({ slug: String(x.slug), name: String(x.name || x.slug) })).slice(0, 50) : [];
      if (want) exposed.push(Object.assign({ slug: p.slug, title: T[p.slug] || p.title || p.slug, options: sortOpts(p.slug, opts.slice(0, 160).map(o => optOut(p.slug, o))) }, grp.length > 1 ? { groups: grp } : {}));
      else if (fo[p.slug] !== undefined && opts.some(o => String(o.slug) === String(fo[p.slug]))) fixed[p.slug] = String(fo[p.slug]);
      else if (p.required) {   // Pflicht-Eigenschaft ohne Auswahl im Shop: passende Option wird je Auswahl so gewählt, dass keine Ausschlussregel greift
        const o = opts.filter(x => !x.nullable).concat(opts.filter(x => x.nullable)).map(x => String(x.slug));
        fixed[p.slug] = o[0]; if (o.length > 1) auto[p.slug] = o.slice(0, 40);
      }
    });
    if (!autoExp) exposed.sort((a, b) => expose.indexOf(a.slug) - expose.indexOf(b.slug));
    else if (pOrder.length) { const ix = x => { const i = pOrder.indexOf(x.slug); return i < 0 ? 999 : i; }; exposed.sort((a, b) => ix(a) - ix(b)); }
    if (kind === "banner") {
      if (!cuOpt) throw new Error("keine freie Größe (size: custom)");
      const fin = by.finish_left, have = fin && Array.isArray(fin.options) ? fin.options.map(o => String(o.slug)) : [];
      const ko = Object.keys(KONF_DE).filter(k => have.indexOf(k) > -1);
      if (ko.length) {   // EINE Auswahl „Konfektion“ setzt alle vier Seiten gleich
        const sets = ["finish_left", "finish_right", "finish_top", "finish_bottom"].filter(x => by[x]);
        exposed.push({ slug: "konfektion", title: "Konfektion", options: ko.map(k => ({ slug: k, name: KONF_DE[k], w: null, h: null })), sets });
        sets.forEach(x => { delete fixed[x]; delete auto[x]; });
        if (!fixed.all_sides_equal_finish && by.all_sides_equal_finish && (by.all_sides_equal_finish.options || []).some(o => o && o.slug === "yes")) { fixed.all_sides_equal_finish = "yes"; delete auto.all_sides_equal_finish; }
      }
    }
    let sizes = null, positions = null, methods = null, maxCopies = null;
    if (kind === "textile") {
      sizes = ((by.textile_sizes && by.textile_sizes.options) || []).filter(o => o && o.slug != null).map(o => ({ slug: String(o.slug), name: (L.textile_sizes && L.textile_sizes[o.slug]) || (o.name != null && String(o.name) !== String(o.slug) ? String(o.name) : String(o.slug).replace(/^unisex_/, "").toUpperCase()).replace(/^Unisexe\b/i, "Unisex") }));
      positions = TEX_POS.filter(x => by[x[0]] && Array.isArray(by[x[0]].options) && by[x[0]].options.length).map(x => ({ slug: x[0], title: x[1], area: x[2].slice(), opts: by[x[0]].options.map(o => String(o.slug)) }));
      const pm = by.printingmethod && Array.isArray(by.printingmethod.options) ? by.printingmethod.options.map(o => String(o.slug)) : null;
      methods = TEX_METHODS.filter(m => !pm || pm.indexOf(m.pm) > -1).map(m => ({ key: m.key, label: m.label, pm: pm ? m.pm : null, val: m.val, min: m.min, positions: positions.filter(p => p.opts.indexOf(m.val) > -1 && (!m.only || m.only.test(p.slug))).map(p => p.slug) })).filter(m => m.positions.length);
      if (!sizes.length || !methods.length) throw new Error("Textil-Eigenschaften (Größen/Druckpositionen) fehlen");
      maxCopies = avail.length ? avail[avail.length - 1] : 2500;
    }
    // Technische Daten: von Print.com fest vorgegebene Eigenschaften (genau eine Option bzw. kuratiert fix) – sonst für Kunden unsichtbar (z. B. Vliesbanner: Ösen oben/unten, Druckverfahren)
    const SPEC_SKIP = /^(copies|urgency|bundle|sheet_size|special_size|pallet_delivery|packaging_extras|cross_bundle|delivery|box_delivery|standard_bundling|provide_label|designs|sealed|all_sides_equal_finish|flexibleprintingmethod|personalize|customer_packing_option|plano_delivery|summary_.*)$/;
    const SPEC_PM = { digital: "Digitaldruck", offset: "Offsetdruck", inkjet: "Inkjet-Digitaldruck", digital_uv: "UV-Digitaldruck", screen_printing: "Siebdruck", sublimation: "Sublimationsdruck", lfp_dye_sublimation: "Sublimationsdruck (Großformat)", hybrid: "Hybriddruck", lfp_uv: "UV-Großformatdruck", lfp_latex: "Latex-Großformatdruck", latex: "Latex-Digitaldruck" };
    const specs = [], inExp = sl => exposed.some(x => x.slug === sl || (x.sets || []).indexOf(sl) > -1);
    props.forEach(p => {
      if (!p || !p.slug || HIDDEN_PROPS.test(p.slug) || SPEC_SKIP.test(p.slug) || inExp(p.slug) || fixed[p.slug] == null || auto[p.slug]) return;
      const v = String(fixed[p.slug]), o = (p.options || []).find(x => x && String(x.slug) === v); if (!o || NONE_SLUG.test(v)) return;
      const nm = p.slug === "printingmethod" ? SPEC_PM[v] || (String(o.name || "") !== v ? String(o.name) : "") : (L[p.slug] && L[p.slug][v]) || (/^printtype/.test(p.slug) && ptName(o.name, v)) || (o.name != null && String(o.name) !== v ? String(o.name) : "");
      if (nm && !/^(geen|none|nee|no|keine?|ohne)$/i.test(nm.trim())) specs.push([clip(T[p.slug] || (p.slug === "printingmethod" ? "Druckverfahren" : p.title) || p.slug, 60), clip(nm, 140), p.slug]);
    });
    // Konfektion je Seite (finish_top/bottom/left/right) mit gleichem Wert zu einer Zeile zusammenfassen
    const SIDE = { finish_top: "oben", finish_bottom: "unten", finish_left: "links", finish_right: "rechts" }, fins = specs.filter(x => SIDE[x[2]]);
    if (fins.length) { const byV = {}; fins.forEach(x => { (byV[x[1]] = byV[x[1]] || []).push(SIDE[x[2]]); });
      const at = specs.indexOf(fins[0]); specs.splice(0, specs.length, ...specs.filter(x => !SIDE[x[2]]));
      specs.splice(Math.min(at, specs.length), 0, ...Object.keys(byV).map(v => ["Konfektion " + (byV[v].length === 4 ? "rundum" : byV[v].join(" & ")), v, "finish"])); }
    // Endformat bei fester Größe: aus der Option (width/height bzw. Slug/Name), sonst kuratierte Maße, sonst Druckfläche
    // Kommen die Maße nur aus der Druckfläche (z. B. Taschen: Größe „43 x 18 x 35 cm“ ohne lesbare Maße), sind sie die Druckfläche – nicht das Produkt.
    let dims = null, dimsArea = false, sizeLabel = "";
    if (kind === "flat" && !exposed.some(x => x.slug === "size")) {
      const so = by.size && (by.size.options || []).find(o => o && String(o.slug) === fixed.size);
      dims = (so && dimsOf(so)) || (c.dims ? c.dims.slice() : null);
      if (!dims) { dims = (by.printing_size && (by.printing_size.options || []).map(o => o && dimsOf(o)).filter(Boolean)[0]) || null; dimsArea = !!dims; }
      if (so && !dimsOf(so)) sizeLabel = clip(String((L.size && L.size[so.slug]) || so.name || ""), 80);
    }
    if (!sizeLabel && fixed.size && by.size) { const so = (by.size.options || []).find(o => o && String(o.slug) === fixed.size); if (so && so.name && !/^custom$/i.test(so.slug)) sizeLabel = clip(String(so.name), 80); }
    // Sehr große bzw. extrem lange Formate (z. B. 20 m × 76 cm): Großformat-Auflösung, kein Online-Designer (nur Datei-Upload, Maßstab 1:10)
    const huge = dims && (Math.max(dims[0], dims[1]) > 5000 || Math.max(dims[0], dims[1]) / Math.max(1, Math.min(dims[0], dims[1])) > 10), large = dims && Math.max(dims[0], dims[1]) >= 1000;
    const prod = { key: c.key, title: c.title, icon: c.icon, desc: c.desc, group: c.group || OTHER, kind, generic: !!c.generic, designer: c.designer !== undefined ? c.designer : (kind === "flat" || kind === "banner") && !huge && !exposed.some(x => x.slug === "pages") && fixed.pages == null && fixed.number_of_pages == null, safe: c.safe || 3, sku: String(sku),
      bleed: kind === "textile" || kind === "promo" ? 0 : +pd.bleed > 0 && +pd.bleed <= 100 ? +pd.bleed : c.bleed != null ? c.bleed : 2, dpi: c.dpi || (kind === "banner" || large ? 100 : 300), specs,
      props: exposed, tiers, qty, urgency, fixed, auto, excludes: [], dims, dimsArea, sizeLabel, custom, sizes, positions, methods, maxCopies, areaProp, areas, printArea: c.printArea ? c.printArea.slice() : null, defaults: {},
      cat: c.cat ? { main: c.cat.split("/")[0], sub: c.cat.split("/")[1] || "" } : Array.isArray(pd.category) && pd.category[0] ? { main: slugN(pd.category[0]), sub: slugN(pd.category[1]) } : null };
    prod.excludes = (Array.isArray(pd.excludes) ? pd.excludes : []).filter(Array.isArray).slice(0, 600).map(rule => rule.filter(x => x && x.property && Array.isArray(x.options)).map(x => ({ property: String(x.property), options: x.options.map(o => String(o && typeof o === "object" ? o.slug : o)) }))).filter(r => r.length);
    // Vorauswahl: bevorzugte Optionen zuerst (kuratiert bzw. Papier 115–170 g Bilderdruck), dann die erste Kombination ohne Ausschluss
    const pref = c.prefer || {}, paper = c.paper !== undefined ? c.paper : kind === "flat" ? [115, 170] : null;
    // Druck-Eigenschaften (Druck, Druckposition, Druckseite …): „Unbedruckt“/„Ohne“ nur als letzter Ausweg – beim Öffnen soll ein bedrucktes Produkt mit Preis stehen
    const PRINTISH = /^(printtype.*|print_position.*|print_side.*|printing_(position|side|colou?rs?).*|positions?_.*|imprint.*)$/, BLANK = o => NONE_SLUG.test(String(o.slug)) || /^0+(_.*)?$|^0\/0|unprint|blank|^none$/i.test(String(o.slug)) || /^(unbedruckt|ohne( druck)?|keine?|blanko|neutral)$/i.test(String(o.name || "").trim());
    const order = pr => { const o = pr.options.map(x => x.slug); const p = (pref[pr.slug] || (pr.slug === "printtype" ? ["40", "44"] : [])).filter(x => o.indexOf(x) > -1); let rest = o.filter(x => p.indexOf(x) < 0);
      if (!pref[pr.slug] && PRINTISH.test(pr.slug)) { const blank = pr.options.filter(BLANK).map(x => x.slug); rest = rest.filter(x => blank.indexOf(x) < 0).concat(rest.filter(x => blank.indexOf(x) > -1)); }
      if (!pref[pr.slug] && paper && /^(material|paper)/.test(pr.slug)) { const good = pr.options.filter(x => { const g = weightOf(x); return g >= paper[0] && g <= paper[1]; }).sort((a, b) => coated(b) - coated(a) || weightOf(a) - weightOf(b)).map(x => x.slug); rest = good.concat(rest.filter(x => good.indexOf(x) < 0)); }
      return p.concat(rest); };
    const base = {}; Object.keys(fixed).forEach(k => { if (!auto[k]) base[k] = fixed[k]; });
    const sol = solveSel(exposed.map(pr => [pr.slug, order(pr)]).concat(Object.keys(auto).map(k => [k, OMITTABLE.test(k) ? auto[k].concat([null]) : auto[k]])), base, prod.excludes, aliasOf(prod));
    exposed.forEach(pr => { prod.defaults[pr.slug] = sol && sol[pr.slug] != null ? sol[pr.slug] : order(pr)[0]; });
    return prod;
  }
  // Sinnvolle Vorauswahl für beliebte allgemeine Produkte (sonst nimmt Print.com oft das kleinste Format, z. B. Briefpapier A6)
  const GEN_PREF = {
    "printed-letterheads": { size: ["a4"], material: ["90gr_hv_bankpost", "100gr_hv_bankpost"], printtype: ["40"] },
    "stapled-magazines": { size: ["a5", "a4"], pages: ["8", "12", "16"], material: ["135gr_gesatineerd_mc", "135gr_silk_mc"], cover_material: ["selfcover"] },
    "bounded-magazines": { size: ["a5", "a4"], material: ["135gr_gesatineerd_mc", "135gr_silk_mc"] },
    "wire-o-magazines": { size: ["a5", "a4"], material: ["135gr_gesatineerd_mc", "135gr_silk_mc"] },
    "blocknotes": { size: ["a5", "a4", "a6"], material: ["80gr_hvo", "90gr_hvo"], printtype: ["40"], sheets_per_block: ["50s", "25s"], binding: ["blocknotes_bounded"] },
    "postcards": { size: ["a6", "a6_landscape"], material: ["350gr_silk_mc", "300gr_silk_mc", "350gr_gesatineerd_mc"], printtype: ["44", "40"] },
    "bookmarks": { material: ["350gr_silk_mc", "300gr_silk_mc"], printtype: ["44"] },
    "placemats": { size: ["a3_landscape", "a3"], printtype: ["40"] },
    "tear-off-calendars": { size: ["a4", "a5"] }
  };
  const genericCfg = (it, g) => ({ key: it.sku, title: it.title, icon: GROUP_ICON[g.main] || "📦", desc: "Individuell bedruckt – Druckdaten hochladen, jede Datei wird automatisch geprüft.", group: g.main, expose: "auto", safe: 3, generic: true, prefer: GEN_PREF[it.sku] });
  // ── Print.com-CMS (Bilder, Namen, Beschreibungen, Produktbaum), täglich ──
  let CMS = null, cmsLoading = null;
  const cmsBase = () => String(process.env.PRINT_CMS_BASE || "https://app.print.com/reseller").replace(/\/+$/, "");
  async function cmsRefresh() {
    const get = async (u, t) => { const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(t) }); if (!r.ok) throw new Error("CMS HTTP " + r.status); return r.json(); };
    const idx = await get(cmsBase() + "/index.json", 15000);
    const de = (Array.isArray(idx) ? idx : []).find(x => x && x.langCode === "de");
    if (!de || !/^[\w.-]{1,120}\.json$/.test(String(de.fileName || ""))) throw new Error("CMS: keine deutsche Datei");
    const t = cmsTrim(await get(cmsBase() + "/" + de.fileName, 90000));
    if (!t.mains.length && !Object.keys(t.products).length) throw new Error("CMS: leer");
    CMS = Object.assign({ at: nowIso(), file: de.fileName, v: 4 }, t); await store.setMeta("print_cms", CMS); PD_CACHE.clear();
    return CMS;
  }
  async function cms(force) {
    if (!CMS) CMS = await store.getMeta("print_cms").catch(() => null);
    if (force || !CMS || !CMS.at || CMS.v !== 4 || Date.now() - Date.parse(CMS.at) > 24 * 3600e3) {   // v2: mit Beliebtheit, v3: mit Aufnahmedatum (Neuheiten), v4: Eigenschaft je Options-Info (Fotos)
      if (!cmsLoading) cmsLoading = cmsRefresh().catch(e => { log("CMS:", e.message); return CMS; }).finally(() => { cmsLoading = null; });
      if (force || !CMS) return cmsLoading;
    }
    return CMS;
  }
  const cmsProd = sku => (CMS && CMS.products && CMS.products[sku]) || null;
  const cmsOptImg = (prop, slug) => (CMS && CMS.options && CMS.options[prop + "|" + slug]) || "";
  // Info/Bild zu einer Option: 1. ausdrücklich diesem Produkt zugeordnet, 2. allgemein für genau diese Eigenschaft (z. B. Druckart 4/0 → Symbol),
  // 3. allgemein ohne Eigenschaft nur bei eindeutigen langen Kennungen (z. B. „custom_shape_kiss_cut“). Kurze Slugs wie „a3“, „40“, „none“ gibt es in vielen Produkten mit anderer Bedeutung.
  const cmsInfo = (sku, slug, prop) => { const l = (CMS && CMS.info) || [], has = x => x.s.indexOf(slug) > -1;
    return l.find(x => has(x) && x.p.length && x.p.indexOf(sku) > -1) || (prop && l.find(x => has(x) && !x.p.length && x.pr === prop)) || (slug.length >= 12 && /_/.test(slug) && l.find(x => has(x) && !x.p.length && !x.pr)) || null; };
  const groupName = slug => { const n = String((CMS && CMS.names && CMS.names[slug]) || MAIN_DE[slug] || slug); return n.charAt(0).toUpperCase() + n.slice(1); };   // „stickers“ → „Stickers“
  function mainsList() {
    const m = CMS && CMS.mains && CMS.mains.length ? CMS.mains : Object.keys(MAIN_DE).filter(k => k !== OTHER).map(k => ({ slug: k, name: MAIN_DE[k], img: "", subs: [] }));
    return m.concat(m.some(x => x.slug === OTHER) ? [] : [{ slug: OTHER, name: MAIN_DE[OTHER], img: "", subs: [] }]);
  }
  // ── Sortiment-Import: Kategorie & Eckdaten je SKU aus den Produktdetails (gedrosselt im Hintergrund, Ergebnis in print_skus) ──
  let SKUS = null; const JOB = { running: false, done: 0, total: 0, errors: 0, started: null, at: null };
  async function skus() { if (!SKUS) SKUS = (await store.getMeta("print_skus").catch(() => null)) || { at: null, items: {} }; if (!SKUS.items) SKUS.items = {}; return SKUS; }
  function summaryOf(pd) {
    const by = {}; (Array.isArray(pd && pd.properties) ? pd.properties : []).forEach(p => { if (p && p.slug) by[p.slug] = p; });
    const so = by.size && Array.isArray(by.size.options) ? by.size.options : [];
    const c = (Array.isArray(pd && pd.category) ? pd.category : []).map(slugN).filter(Boolean).slice(0, 2);
    const cp = (by.copies && Array.isArray(by.copies.options) ? by.copies.options : []).map(o => parseInt(o && o.slug, 10)).filter(n => n > 0);
    const rs = by.copies && Array.isArray(by.copies.rangeSets) ? by.copies.rangeSets : [];
    const mins = cp.concat([].concat.apply([], rs.map(r => (r && r.options || []).map(o => +o.min).filter(n => n > 0))));
    return { c, k: autoKind(by, pd || {}), cu: so.some(o => o && o.slug === "custom"), m: mins.length ? Math.min.apply(null, mins) : null, at: nowIso() };
  }
  async function importAll(force) {
    if (JOB.running || !cfg().pcKey) return JOB;
    const all = await catalogAll(); const S0 = await skus(); if (!all) return JOB;
    const todo = all.items.filter(it => force || !S0.items[it.sku] || !S0.items[it.sku].at || Date.now() - Date.parse(S0.items[it.sku].at) > 7 * 864e5);
    Object.assign(JOB, { running: true, done: 0, total: todo.length, errors: 0, started: nowIso() });
    const dv = parseInt(process.env.PRINT_IMPORT_DELAY_MS, 10), delay = isFinite(dv) && dv >= 0 ? dv : 800;   // 4 parallel × 800 ms ≈ 5 Anfragen/s
    let i = 0, saved = Date.now();
    const worker = async () => {
      while (i < todo.length) {
        const it = todo[i++];
        try { S0.items[it.sku] = summaryOf(await pcApi("GET", "/products/" + encodeURIComponent(it.sku) + "?view=reseller")); } catch (e) { JOB.errors++; }
        JOB.done++;
        if (Date.now() - saved > 15000) { saved = Date.now(); await store.setMeta("print_skus", S0).catch(() => {}); }
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
    };
    Promise.all([worker(), worker(), worker(), worker()]).then(async () => { S0.at = nowIso(); await store.setMeta("print_skus", S0).catch(e => log("Sortiment speichern:", e.message)); })
      .catch(e => log("Sortiment-Import:", e.message)).finally(() => { JOB.running = false; JOB.at = nowIso(); });
    return JOB;
  }
  // Kategorie einer SKU: Hand-Zuordnung (Cockpit) → Print.com-Kategorie → Stichwort-Ersatz
  function catOf(sku, s, auto, own) {
    const o = s && s.catOverride[sku]; if (o) { const x = o.split("/"); return { main: x[0], sub: x[1] || "" }; }
    if (own && own.main) return own;
    const x = SKUS && SKUS.items[sku]; if (x && x.c && x.c[0]) return { main: x.c[0], sub: x.c[1] || "" };
    return { main: auto || OTHER, sub: "" };
  }
  async function catalogRefresh() {
    const s = await settings();
    const list = await pcApi("GET", "/products");
    const items = (Array.isArray(list) ? list : (list && (list.items || list.results)) || []).filter(p => p && p.sku && p.active !== false);
    await cms(false);
    // ganzes Sortiment (für Cockpit „Sortiment“ und allgemeine Produkte)
    ALL = { at: nowIso(), items: items.filter(p => SKU_RX.test(String(p.sku))).map(p => ({ sku: String(p.sku), title: clip(p.titlePlural || p.titleSingle || p.title || p.sku, 120), single: clip(p.titleSingle || "", 120), auto: categoryOf(p.sku, p.titleSingle, p.titlePlural) })) };
    await store.setMeta("print_catalog_all", ALL); PD_CACHE.clear();
    const out = { at: nowIso(), cv: CUR_V, products: [], errors: [] };
    for (const c of CURATED) {
      const ov = s.products[c.key] || {};
      let sku = ov.sku || "";
      if (!sku) { let ex = null; for (const k of c.skus) { ex = items.find(p => String(p.sku).toLowerCase() === k); if (ex) break; } sku = ex ? ex.sku : (c.rx && (items.find(p => c.rx.test(p.sku) || c.rx.test(p.titlePlural || "") || c.rx.test(p.titleSingle || "")) || {}).sku) || ""; }
      if (!sku) { out.errors.push(c.title + ": kein passendes Print.com-Produkt gefunden"); continue; }
      try { out.products.push(parseProduct(c, sku, await pcApi("GET", "/products/" + encodeURIComponent(sku) + "?view=reseller"))); }
      catch (e) { out.errors.push(c.title + " (" + sku + "): " + e.message); }
    }
    if (!out.products.length && CAT && CAT.products && CAT.products.length) { CAT.errors = out.errors; return CAT; }   // Ausfall: alten Stand behalten
    // kuratierte Produkte einmalig freischalten (danach entscheidet nur noch das Cockpit)
    let seed = false; out.products.forEach(p => { if (!s.seeded[p.sku]) { s.seeded[p.sku] = true; if (s.enabled[p.sku] === undefined) s.enabled[p.sku] = true; seed = true; } });
    if (seed) await store.setMeta("print_settings", s);
    await store.setMeta("print_catalog", out); CAT = out; PRICE_CACHE.clear();
    if (out.errors.length) log("Katalog:", out.errors.join(" · "));
    if (process.env.PRINT_IMPORT !== "0") importAll(false).catch(e => log("Sortiment-Import:", e.message));
    return out;
  }
  async function catalog(force) {
    if (!cfg().pcKey) return null;
    if (!CAT) CAT = await store.getMeta("print_catalog").catch(() => null);
    const stale = !CAT || !CAT.at || Date.now() - Date.parse(CAT.at) > 24 * 3600e3 || CAT.cv !== CUR_V;   // kuratierte Auswahl geändert → neu einlesen
    if (force || stale) {
      if (!catLoading) catLoading = catalogRefresh().catch(e => { log("Katalog:", e.message); if (CAT) CAT.errors = [e.message]; return CAT; }).finally(() => { catLoading = null; });
      if (force || !CAT || !CAT.products || !CAT.products.length) return catLoading;
    }
    return CAT;
  }
  async function catalogAll(force) {
    if (!cfg().pcKey) return null;
    if (!ALL) ALL = await store.getMeta("print_catalog_all").catch(() => null);
    await skus(); if (!CMS) await cms(false);
    if (force || !ALL || !ALL.items) await catalog(true);
    else await catalog(false);
    return ALL;
  }
  function withAllow(p, s) {
    const allow = ((s && s.products[p.key]) || {}).allow || {};
    const props = p.props.map(pr => { const a = allow[pr.slug]; const opts = a && a.length ? pr.options.filter(o => a.indexOf(o.slug) > -1) : pr.options; return Object.assign({}, pr, { options: opts.length ? opts : pr.options }); });
    return Object.assign({}, p, { props });
  }
  function productOf(cat, key, s, any) {
    const p = cat && (cat.products || []).find(x => x.key === key); if (!p) return null;
    const g = catOf(p.sku, s, p.group || OTHER, p.cat);
    if (!any && !shown(s, p.sku, p.key, g)) return null;
    return Object.assign(withAllow(p, s), { group: g.main, cat: g });
  }
  // Produkt für Shop/Preis/Bestellung: kuratiert (Schlüssel) oder allgemein (Print.com-SKU, nur wenn im Cockpit freigeschaltet; any = Cockpit-Vorschau)
  async function findProduct(key, s, any) {
    key = String(key || ""); s = s || await settings(); if (isInternal(key, "")) return null;
    const cat = await catalog(false);
    const cp = cat && (cat.products || []).find(x => x.key === key || (any && x.sku === key));
    if (cp) return productOf(cat, cp.key, s, any);
    if (!SKU_RX.test(key)) return null;
    const all = await catalogAll(); const it = all && (all.items || []).find(x => x.sku === key); if (!it) return null;
    let hit = PD_CACHE.get(key);
    const g0 = catOf(it.sku, s, it.auto, hit && hit.p.cat); if (!any && !shown(s, it.sku, it.sku, g0)) return null;
    if (!hit || Date.now() - hit.at > 24 * 3600e3) {
      let pd; try { pd = await pcApi("GET", "/products/" + encodeURIComponent(key) + "?view=reseller"); } catch (e) { log("Produkt " + key + ":", e.message); throw Object.assign(new Error("Produkt ist gerade nicht verfügbar"), { status: 502 }); }
      let p; try { p = parseProduct(genericCfg(it, g0), key, pd); } catch (e) { log("Produkt " + key + ":", e.message); throw Object.assign(new Error("Dieses Produkt kann gerade nicht online bestellt werden"), { status: 400 }); }
      if (PD_CACHE.size > 300) PD_CACHE.clear();
      hit = { at: Date.now(), p }; PD_CACHE.set(key, hit);
    }
    const g = catOf(it.sku, s, it.auto, hit.p.cat);
    return Object.assign(withAllow(hit.p, s), { group: g.main, cat: g });
  }
  // Kurzbeschreibung für die Karte: Untertitel bzw. erste Zeile der Print.com-Beschreibung
  // Print.com-interne Produkte (z. B. „Probe intern“ / samples-internal, Test-Artikel) nie im Shop zeigen
  const INTERNAL_RX = /(^|[-_\s])(intern|internal|test|dummy)([-_\s]|$)/i, isInternal = (sku, title) => INTERNAL_RX.test(String(sku || "")) || INTERNAL_RX.test(String(title || ""));
  // Lieferantentexte bereinigen: keine Lieferzeit-Versprechen (der Termin kommt immer live aus der Preisabfrage), keine Verweise „hier bestellen“ auf die Lieferanten-Seite
  const CMS_LINK = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>|\[([^\]]*)\]\s*\(([^)]*)\)/gi, EXT_URL = /print\.com|ctfassets\.net|downloads\./i;
  const CTA_RX = /\b(hier|klick|bestell|konfigur|findest du|sieh dir|erhältlich|übersicht)/i;
  const PROMISE_RX = /\b\d{1,2}([:.]\d{2})?\s*Uhr\b|nächsten (Werk|Arbeits)?tag|folgenden (Werk|Arbeits)?tag|\bWerktag|über ?nacht|same.?day/i;
  function cmsClean(t) {
    return String(t || "").replace(/\s+in Rekordzeit/gi, "").split("\n").map(line => {
      const sents = line.replace(CMS_LINK, (m, h1, t1, t2, h2) => { const href = h1 || h2 || "", txt = String(t1 != null ? t1 : t2 || "").replace(/<[^>]*>/g, "").trim(); return EXT_URL.test(href) ? "\u0001" + txt : txt; })
        .split(/(?<=[.!?])\s+/).filter(s => !PROMISE_RX.test(s) && !(/\u0001/.test(s) && (CTA_RX.test(s) || /\u0001\s*(\.|$)/.test(s))));
      const out = sents.join(" ").replace(/\u0001/g, "").trim();
      return /^[-*•]?\s*$/.test(out) && line.trim() ? null : out;
    }).filter(x => x !== null).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const noHtml = t => String(t || "").replace(/<[^>]*>?/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").trim();   // Beschreibungen aus dem Print.com-CMS teils mit HTML
  const BRIEF_EXT = /^(pdf|jpe?g|png|gif|webp|svg|ai|eps|psd|tiff?|zip|docx?|txt|rtf|odt)$/i;
  const shortDesc = (cp, fb) => { const t = cp && (cmsClean(cp.s) || cmsClean(cp.d).split(/\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean)[0]); return clip(noHtml(t || fb || ""), 140); };
  const catPub = g => ({ main: g.main, sub: g.sub || "", mainName: groupName(g.main), subName: g.sub ? groupName(g.sub) : "" });
  const pubProd = p => { const cp = cmsProd(p.sku), g = p.cat || { main: p.group || OTHER, sub: "" };
    return { key: p.key, title: NAME_FIX[p.sku] || (p.generic && cp && cp.n ? cp.n : p.title), added: (cp && cp.da) || "", icon: p.icon || GROUP_ICON[g.main] || "📦", desc: shortDesc(cp, p.desc), group: g.main, cat: catPub(g), img: cp && cp.i ? IMG(cp.i, 600) : "",
      pop: (cp && cp.pp) || 0, images: cp ? [cp.i].concat(cp.g || []).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 7).map(x => IMG(x, 1000)) : [], about: cp ? clip(cmsClean(cp.d).split("\n").map(noHtml).join("\n"), 4000) : "", summary: cp ? clip(noHtml(cmsClean(cp.s)), 200) : "",
      kind: p.kind || "flat", designer: p.designer, bleed: p.bleed, safe: p.safe, dpi: p.dpi, props: p.props, tiers: p.tiers, qty: p.qty || [], urgency: p.urgency, fixed: p.fixed, auto: p.auto || {},
      excludes: p.excludes, defaults: p.defaults || {}, dims: p.dims || null, dimsArea: !!p.dimsArea, sizeLabel: p.sizeLabel || "", specs: (p.specs || []).map(x => [x[0], x[1], x[2]]), custom: p.custom || null, sizes: p.sizes || null, positions: p.positions || null, methods: p.methods || null, maxCopies: p.maxCopies || null, areaProp: p.areaProp || null, areas: p.areas || {}, printArea: p.printArea || null }; };
  // Sortiment aufräumen (nur Anzeige, Preise/Margen rechnen weiter mit der Print.com-Kategorie): Mini-Hauptgruppen, die anderswo Untergruppe sind,
  // dort einordnen; Produkte ohne Untergruppe per Stichwort in die passende Untergruppe. Hand-Zuordnungen im Cockpit gehen immer vor.
  const MAIN_INTO = { "gift-packaging": ["packaging-bags", "gift-packaging"], "displays-pos-material": ["indoor-interior", "displays-pos-material"], "outdoor-furniture": ["outdoor-advertising", "outdoor-furniture"], "materials-samples": ["outdoor-advertising", "banners-outdoor"] };
  const SUB_BY_WORD = [[/liegest|deckchair/i, "outdoor-advertising", "outdoor-furniture"], [/fahne|flagge|skydancer/i, "outdoor-advertising", "flags-outdoor"], [/halterung für schilder|schildhalter/i, "outdoor-advertising", "signs-banners"],
    [/bettbez|kissen|handtuch|schürze/i, "clothing-textile", "kitchen-living-textiles"], [/polo|shirt|socke|weste|leibchen|hoodie|pullover|jacke|\bactive t\b/i, "clothing-textile", "clothing"],
    [/display|regalwobbler|regalstreifen|broschürenhalter|klapprahmen|warenpräsentation|inforahmen|aufsteller/i, "indoor-interior", "displays-pos-material"], [/tapete|kleister/i, "indoor-interior", "decoration"],
    [/rakel|applikat/i, "stickers-tapes", "sticker-accessories"], [/namensschild/i, "paper-print", "office-print"], [/magazin|broschüre|buch|pocketplan|faltplan/i, "paper-print", "brochures-magazines"]];
  function tidyCat(p, s) {
    if (s && s.catOverride && s.catOverride[p.key]) return;
    const c = p.cat || {}, into = MAIN_INTO[c.main]; let main = c.main, sub = c.sub || "";
    if (into) { main = into[0]; sub = into[1]; }
    else if (!sub || main === OTHER) { const hit = SUB_BY_WORD.find(x => x[0].test(p.title)); if (hit) { main = hit[1]; sub = hit[2]; } }
    if (main !== c.main || sub !== (c.sub || "")) { p.cat = catPub({ main, sub }); p.group = main; }
  }
  // Shop-Katalog: nur freigeschaltete Produkte (allgemeine nur als Karte, Details beim Öffnen), gruppiert nach Print.com-Hauptgruppe/Untergruppe
  function publicCatalog(cat, s, all) {
    const cur = ((cat && cat.products) || []).map(p => productOf(cat, p.key, s)).filter(Boolean).map(pubProd);
    const skuSet = new Set(((cat && cat.products) || []).map(p => p.sku));
    const gen = ((all && all.items) || []).filter(it => !skuSet.has(it.sku) && !isInternal(it.sku, it.title)).map(it => [it, catOf(it.sku, s, it.auto)]).filter(x => shown(s, x[0].sku, x[0].sku, x[1]))
      .map(x => { const cp = cmsProd(x[0].sku); return { key: x[0].sku, title: NAME_FIX[x[0].sku] || (cp && cp.n) || x[0].title, added: (cp && cp.da) || "", icon: GROUP_ICON[x[1].main] || "📦", desc: shortDesc(cp, "Individuell bedruckt – Druckdaten hochladen."), group: x[1].main, cat: catPub(x[1]), img: cp && cp.i ? IMG(cp.i, 600) : "", pop: (cp && cp.pp) || 0, lazy: true }; });
    const order = mainsList().map(m => m.slug), ix = g => { const i = order.indexOf(g); return i < 0 ? 900 : i; };
    // Bestseller: die beliebtesten Produkte laut Print.com (Top 12, mindestens Beliebtheit 4 000); innerhalb der Gruppe zuerst
    // ohne Saison-/Nischenprodukte (Print.com führt z. B. Kalender, Lesezeichen, Pläne weit oben, das sind aber keine Alltags-Bestseller)
    const NICHE = /calendar|kalender|bookmark|lesezeichen|^maps$|plan$|election|wahlplakat/i, cand = p => (p.pop || 0) >= 4000 && !NICHE.test(p.key + " " + p.title);
    gen.forEach(p => tidyCat(p, s));
    const all2 = cur.concat(gen), tops = all2.filter(cand).map(p => p.pop).sort((a, b) => b - a), cut = tops.length ? tops[Math.min(9, tops.length - 1)] : Infinity;
    all2.forEach(p => { p.best = cand(p) && p.pop >= cut; });
    return all2.map((p, i) => [p, i]).sort((a, b) => ix(a[0].group) - ix(b[0].group) || (b[0].pop || 0) - (a[0].pop || 0) || a[1] - b[1]).map(x => x[0]);
  }
  // Gruppen für den Shop: nur mit sichtbaren Produkten, Untergruppen in Print.com-Reihenfolge
  function publicGroups(products) {
    const used = {}; products.forEach(p => { used[p.cat.main] = used[p.cat.main] || {}; if (p.cat.sub) used[p.cat.main][p.cat.sub] = 1; });
    const ms = mainsList(), out = ms.filter(m => used[m.slug]).map(m => ({ slug: m.slug, name: m.name, img: m.img ? IMG(m.img, 400) : "", subs: m.subs.filter(x => used[m.slug][x.slug]).map(x => ({ slug: x.slug, name: x.name })).concat(Object.keys(used[m.slug]).filter(k => !m.subs.some(x => x.slug === k)).map(k => ({ slug: k, name: groupName(k) }))) }));
    Object.keys(used).filter(k => !ms.some(m => m.slug === k)).forEach(k => out.push({ slug: k, name: groupName(k), img: "", subs: Object.keys(used[k]).map(x => ({ slug: x, name: groupName(x) })) }));
    return out;
  }
  function sidesOf(sel) { const t = String(sel.printtype || ""); const m = t.match(/^(\d)(\d)$/); return m && m[2] !== "0" ? 2 : 1; }
  // Mehrseitige Produkte (Broschüren, Bücher, Kalender): benötigte PDF-Seiten laut Auswahl „pages“ (inkl. Umschlag) bzw. „N Blätter“ (× 2 bei beidseitigem Druck)
  function pagesOf(prod, all) {
    const pr = prod.props.find(x => x.slug === "pages"), v = all.pages != null ? all.pages : all.number_of_pages; if (v == null) return null;
    const o = pr && pr.options.find(x => String(x.slug) === String(v)), nm = String((o && o.name) || ""), bl = nm.match(/(\d+)\s*Bl(ä|a)tt/i);
    const n = bl ? +bl[1] * sidesOf(all) : Math.round(parseFloat(String(v))); return n > 2 ? n : null;
  }
  function sizeOf(prod, sel) {
    const sp = prod.props.find(x => x.slug === "size"); const o = sp && sp.options.find(x => x.slug === sel.size);
    if (o && o.w && o.h) return { w: o.w, h: o.h };
    if (prod.dims) return { w: prod.dims[0], h: prod.dims[1] };
    const d = dimsOf({ slug: sel.size || prod.fixed.size || "" }); return d ? { w: d[0], h: d[1] } : null;
  }
  // ── Falzgeometrie ──
  // Print.com nennt bei Foldern das GEFALZTE Format (z. B. „1/3 A4 – 99 × 210 mm“ = DIN-lang-Folder aus A4); Druckdaten = offenes Format.
  // Wickelfalz: einklappende Felder schmaler (2 mm, ab 4 Feldern 1,5 mm je Stufe), Fensterfalz: Klappen je 1 mm schmaler.
  // x/y = Falzpositionen in mm ab linker/oberer Schnittkante, gemessen auf der Außenseite (Seite 1); Innenseite gespiegelt.
  const FOLD_NAMES = { single: "Einbruchfalz", singlehorizontal: "Einbruchfalz oben", wikkel: "Wickelfalz", zigzag: "Zickzackfalz", luik: "Fensterfalz", cross: "Kreuzfalz" };
  function foldSpec(slug, w, h) {
    const m = String(slug || "").match(/^(single|singlehorizontal|wikkel|zigzag|luik|cross)_(\d+)$/); if (!m || !(w > 0 && h > 0)) return null;
    const t = m[1], pages = +m[2], rd = v => Math.round(v * 2) / 2, name = pages + "-seitiger " + FOLD_NAMES[t];
    const acc = ws => ws.slice(0, -1).reduce((a, x) => a.concat([rd((a.length ? a[a.length - 1] : 0) + x)]), []);
    if (t === "cross") return { slug, name, pages, closed: { w, h }, open: { w: 2 * w, h: 2 * h }, x: [w], y: [h], out: ["Rückseite", "Titel", "Innen", "Innen"], in: ["Innen", "Innen", "Innen", "Innen"], note: "Kreuzfalz: erst quer, dann längs gefalzt – Bogen 2 × 2 Felder." };
    if (t === "singlehorizontal") return { slug, name, pages, closed: { w, h }, open: { w, h: 2 * h }, x: [], y: [h], out: ["Rückseite (180° gedreht anlegen)", "Titel"], in: ["Innen oben", "Innen unten"], note: "Falz oben: Rückseite steht im offenen Bogen auf dem Kopf." };
    let ws, out, inn, note = "";
    const n = t === "single" ? 2 : t === "luik" ? (pages === 6 ? 3 : 4) : pages / 2;
    if (t === "single" || t === "zigzag") { ws = Array(n).fill(w); out = Array(n).fill("").map((x, i) => i === n - 1 ? "Titel" : i === n - 2 && t === "single" ? "Rückseite" : "Außen " + (i + 1)); inn = Array(n).fill("").map((x, i) => "Innen " + (i + 1)); if (t === "zigzag") note = "Zickzackfalz: alle Felder gleich breit."; }
    else if (t === "wikkel") {
      const st = n > 3 ? 1.5 : 2, flaps = Array(n - 2).fill(0).map((x, i) => w - st * (i + 1)), full = (n * w - flaps.reduce((a, x) => a + x, 0)) / 2;
      const inside = [full, full].concat(flaps).map(rd); ws = inside.slice().reverse();   // Außenseite = gespiegelte Innenseite
      out = ws.map((x, i) => i === n - 1 ? "Titel" : i === n - 2 ? "Rückseite" : "Klappe (außen)"); inn = inside.map((x, i) => i < 2 ? "Innen " + (i + 1) : "Einklappseite " + (i - 1));
      note = "Wickelfalz: einklappende Seite" + (n > 3 ? "n sind" : " ist") + " schmaler, damit sie beim Falzen nicht staucht.";
    } else {   // Fensterfalz
      ws = n === 3 ? [w / 2 - 1, w + 2, w / 2 - 1] : [w - 1, w + 1, w + 1, w - 1]; ws = ws.map(rd);
      out = n === 3 ? ["Titel – rechte Hälfte", "Rückseite", "Titel – linke Hälfte"] : ["Klappe (außen)", "Rückseite", "Titel", "Klappe (außen)"]; inn = n === 3 ? ["Klappe innen", "Innen Mitte", "Klappe innen"] : ["Klappe innen", "Innen", "Innen", "Klappe innen"];
      note = "Fensterfalz: beide Klappen falzen zur Mitte und sind je 1 mm schmaler.";
    }
    return { slug, name, pages, closed: { w, h }, open: { w: rd(ws.reduce((a, x) => a + x, 0)), h }, x: acc(ws), y: [], widths: ws, out, in: inn, note };
  }
  function areaOf(prod, all) {
    const a = prod.areas || {}, k = prod.areaProp && all[prod.areaProp], ks = Object.keys(a);
    const v = (k && a[k]) || (ks.length === 1 ? a[ks[0]] : null) || prod.printArea || [100, 100];
    return { w: v[0], h: v[1] };
  }
  // feste + gewählte Werte, dazu die Pflicht-Eigenschaften ohne Auswahl so ergänzen, dass keine Ausschlussregel greift
  function resolveSel(prod, sel, extra, only) {
    const base = {}; Object.keys(prod.fixed).forEach(k => { if (!prod.auto || !prod.auto[k]) base[k] = prod.fixed[k]; });
    prod.props.forEach(pr => { if (sel[pr.slug] != null) base[pr.slug] = sel[pr.slug]; }); Object.assign(base, extra || {});
    const vars = Object.keys(prod.auto || {}).map(k => [k, only && only[k] ? prod.auto[k].filter(x => only[k].indexOf(x) > -1) : prod.auto[k]]).map(v => OMITTABLE.test(v[0]) ? [v[0], [null].concat(v[1])] : v);   // only: z. B. Druckverfahren passend zur Auflage; Bündeln/Bogengröße/Verpackung zuerst weglassen (wie die Print.com-App, sonst Aufpreis – z. B. Digital-Bogen bei Offset +6 %), Werte nur als Ausweichlösung
    let all = solveSel(vars, base, prod.excludes, aliasOf(prod)); const excl = !all;
    if (!all) all = Object.assign({}, prod.fixed, base);
    prod.props.forEach(pr => { if (pr.sets) { pr.sets.forEach(x => { all[x] = all[pr.slug]; }); delete all[pr.slug]; } });
    Object.keys(all).forEach(k => { if (all[k] === NONE_OPT) delete all[k]; });
    return { all, excluded: excl };
  }
  const bad = m => Object.assign(new Error(m), { status: 400 });
  // Auswahl prüfen: nur angebotene Optionen, sonst Fehler (nie stillschweigend etwas anderes bestellen). Unsere Ausschlussregeln blockieren nicht –
  // maßgeblich ist Print.com (Preisabfrage); „excluded“ wird nur für eine verständliche Fehlermeldung gemerkt.
  function normalizeSel(prod, input) {
    input = input || {};
    const kind = prod.kind || "flat", sel = {}, extra = {}, more = [];
    for (const pr of prod.props) {
      const v = input.sel && input.sel[pr.slug] != null ? String(input.sel[pr.slug]) : null;
      if (v == null) { const d = prod.defaults && prod.defaults[pr.slug]; sel[pr.slug] = d != null && pr.options.some(o => o.slug === d) ? d : pr.options[0].slug; }
      else if (pr.options.some(o => o.slug === v)) sel[pr.slug] = v;
      else throw bad("Ungültige Option für " + pr.title);
    }
    let copies, size = null, positions = null, fileSel = sel, tex = null, fmt = null;
    if (kind === "textile") {
      const t = objOf(input.textile);
      const m = prod.methods.find(x => x.key === String(t.method || prod.methods[0].key)); if (!m) throw bad("Ungültige Druckart");
      const want = Array.isArray(t.positions) ? t.positions.map(String) : [];
      if (want.some(p => m.positions.indexOf(p) < 0)) throw bad("Diese Druckposition ist mit der gewählten Druckart nicht möglich");
      positions = prod.positions.filter(p => want.indexOf(p.slug) > -1).map(p => ({ slug: p.slug, title: p.title, area: p.area }));
      if (!positions.length) throw bad("Bitte mindestens eine Druckposition wählen");
      const sz = objOf(t.sizes);
      if (Object.keys(sz).some(k => !prod.sizes.some(x => x.slug === k))) throw bad("Ungültige Größe");
      const list = prod.sizes.map(x => ({ slug: x.slug, name: x.name, n: Math.max(0, Math.min(100000, parseInt(sz[x.slug], 10) || 0)) })).filter(x => x.n > 0);
      copies = list.reduce((a, x) => a + x.n, 0);
      if (!copies) throw bad("Bitte die Stückzahl je Größe eingeben");
      if (copies < m.min) throw bad(m.label.replace(/ \(.*$/, "") + " ist ab " + m.min + " Stück möglich");
      if (copies > prod.maxCopies) throw bad("Maximal " + prod.maxCopies + " Stück pro Bestellung");
      if (m.pm) extra.printingmethod = m.pm; positions.forEach(p => { extra[p.slug] = m.val; }); extra.textile_sizes = list[0].slug;   // Preis hängt nicht von der Größe ab
      sel.druck = m.key; sel.positionen = positions.map(p => p.slug); sel.groessen = list.map(x => x.slug + ":" + x.n).join(",");
      fileSel = { pos: positions.map(p => p.slug) };
      tex = { method: m.key, methodLabel: m.label, positions: positions.map((p, i) => ({ slug: p.slug, title: p.title, area: p.area, page: i + 1 })), sizes: list };
      more.push(["Druck", m.label], ["Druckpositionen", positions.map(p => p.title).join(", ")], ["Größen", list.map(x => x.name + " × " + x.n).join(", ")]);
    } else {
      copies = parseInt(input.copies, 10);
      if (!(copies > 0 && copies <= 1e6)) throw bad("Ungültige Auflage");
      if (prod.qty && prod.qty.length) { if (!prod.qty.some(r => qtyIn(r, copies))) throw bad("Diese Auflage ist nicht möglich – bitte eine der vorgeschlagenen Mengen bzw. einen passenden Schritt wählen"); }
      else if (prod.tiers.indexOf(copies) < 0) throw bad("Ungültige Auflage");
    }
    if (prod.custom && (kind === "banner" || sel.size === "custom")) {   // freie Größe: Eingabe in cm (Banner) bzw. mm, an Print.com immer mm
      const cu = objOf(input.custom), C = prod.custom, f = C.unit === "cm" ? 10 : 1, u = v => C.unit === "cm" ? v / 10 + " cm" : v + " mm";
      const w = Math.round(parseFloat(String(cu.w).replace(",", ".")) * f), h = Math.round(parseFloat(String(cu.h).replace(",", ".")) * f);
      if (!(w > 0 && h > 0)) throw bad("Bitte Breite und Höhe in " + C.unit + " angeben");
      const ok = (a, b) => a >= C.minW && a <= C.maxW && b >= C.minH && b <= C.maxH;
      if (!ok(w, h) && !ok(h, w)) throw bad("Eigenes Format: mindestens " + u(C.minW) + " × " + u(C.minH) + ", höchstens " + u(C.maxW) + " × " + u(C.maxH));
      sel.custom = w / f + "x" + h / f; extra.size = "custom"; extra.width = w; extra.height = h; size = { w, h }; fmt = ["Format", (C.unit === "cm" ? w / 10 + " × " + h / 10 + " cm" : w + " × " + h + " mm")];
    }
    const urgency = String(input.urgency || ((prod.urgency.find(x => x.slug === "standard") || prod.urgency[0] || {}).slug) || "standard");   // Standard vor „Schnell“ (Print.com listet „quick“ teils zuerst)
    if (prod.urgency.length && !prod.urgency.some(u => u.slug === urgency)) throw bad("Ungültige Lieferzeit");
    // Auflagen-Bereiche je Druckverfahren: nur Verfahren zulassen, die diese Menge drucken
    let pmOnly = null;
    if (prod.qty && prod.qty.length && prod.qty.some(x => x.pm) && !prod.qty.some(x => !x.pm && qtyIn(x, copies))) pmOnly = { printingmethod: prod.qty.filter(x => x.pm && qtyIn(x, copies)).map(x => x.pm) };
    const r = resolveSel(prod, sel, extra, pmOnly), all = r.all; let excl = r.excluded;
    if (pmOnly && all.printingmethod != null && pmOnly.printingmethod.indexOf(String(all.printingmethod)) < 0) throw bad("Diese Auflage ist mit dem gewählten Druckverfahren nicht möglich");
    let variants = null;
    if (tex) {   // Textil: Größen-Mix als variants (je Größe gleiche Farbe), jede Größe gegen die Ausschlussregeln prüfen
      variants = tex.sizes.map(x => Object.assign({ textile_sizes: x.slug }, all.color_textile != null ? { color_textile: all.color_textile } : {}, { copies: x.n }));
      if (variants.some(v => hitRules(prod.excludes, Object.assign({}, all, { textile_sizes: v.textile_sizes })))) excl = true;
    }
    if (kind === "promo") { const a = areaOf(prod, all), two = /^(44|11)$/.test(String(all.printtype || ""));
      positions = two ? [{ slug: "area", title: "Vorderseite", area: [a.w, a.h] }, { slug: "area2", title: "Rückseite", area: [a.w, a.h] }] : [{ slug: "area", title: "Druckfläche", area: [a.w, a.h] }]; fileSel = { pos: positions.map(x => x.slug), area: [a.w, a.h] }; more.push(["Druckfläche", a.w + " × " + a.h + " mm"]); }
    const pcOpts = Object.assign({}, all, { copies }); if (prod.urgency.length) pcOpts.urgency = urgency;
    if (kind === "flat" && !size) size = sizeOf(prod, all);
    let folds = null, closed = null;
    if (size && all.fold) { folds = foldSpec(all.fold, size.w, size.h); if (folds) { closed = size; size = folds.open; more.push(["Format offen", size.w + " × " + size.h + " mm"]); } }
    if (!fmt && size && !prod.props.some(pr => pr.slug === "size") && kind === "flat") fmt = ["Endformat", fmtDims([size.w, size.h])];
    const labels = (fmt ? [fmt] : []).concat(prod.props.map(pr => [pr.title, (pr.options.find(o => o.slug === sel[pr.slug]) || {}).name || sel[pr.slug]]), more);
    const pmWanted = String(input.pm || "auto").replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "auto";   // Druckverfahren: „auto“ = Offset wo möglich, sonst günstigstes
    // Alternativen je Druckverfahren (Digital/Offset/…): jeweils mit den Ausschlussregeln und Mengenbereichen gelöst – nur gültige Kombinationen
    let pmAlts = null;
    if (kind !== "textile" && kind !== "promo" && prod.auto && Array.isArray(prod.auto.printingmethod) && prod.auto.printingmethod.length > 1 && !excl) {
      pmAlts = [];
      for (const pm of prod.auto.printingmethod.map(String)) {
        if (pmOnly && pmOnly.printingmethod.indexOf(pm) < 0) continue;
        const rr = resolveSel(prod, sel, extra, Object.assign({}, pmOnly || {}, { printingmethod: [pm] }));
        if (rr.excluded || String(rr.all.printingmethod) !== pm) continue;
        const po = Object.assign({}, rr.all, { copies }); if (prod.urgency.length) po.urgency = urgency; pmAlts.push({ pm, pcOpts: po, more: variantsOf(prod, po) });
      }
      if (pmAlts.length < 2) pmAlts = null;
    }
    const pages = positions ? null : pagesOf(prod, all);
    return { sel, fileSel, copies, urgency, pcOpts, pcMore: variantsOf(prod, pcOpts), labels, pmWanted, pmAlts, sides: positions ? positions.length : pages || sidesOf(all), pages, size, folds, closed, variants, positions, textile: tex, excluded: excl, kind };
  }

  // ── Steuer ──
  // Immer österreichische USt 20 % – auch bei Firmen (Wunsch Simon, 19.10.2026): Anzeige für Firmen netto, Rechnung und Zahlung
  // immer brutto mit ausgewiesener USt; Firmen holen sie sich über den Vorsteuerabzug zurück. Keine steuerfreie ig. Lieferung.
  // (Hinweis bei späterer EU-Lieferung: Fernverkäufe an Private ggf. OSS, an Firmen mit UID wäre die ig. Lieferung gesetzlich steuerfrei.)
  function taxFor(country, cust) {
    const uid = String(cust && cust.uid || "").replace(/[\s.\-]/g, "").toUpperCase();
    return { case: "at20", rate: 20, uid: uid || "", note: "" };
  }
  async function uidCheck(uid) {
    const v = D.uidValid ? D.uidValid(uid) : { ok: /^[A-Z]{2}[A-Z0-9]{8,12}$/.test(String(uid || "").replace(/\s+/g, "").toUpperCase()), uid: String(uid || "").replace(/\s+/g, "").toUpperCase() };
    if (!v.ok) return { valid: false, format: false, uid: v.uid || uid, why: v.why || "Format ungültig" };
    if (!D.viesCheck) return { valid: false, format: true, uid: v.uid, why: "Prüfung nicht verfügbar" };
    try { const r = await D.viesCheck(v.uid); return { valid: !!r.valid, format: true, uid: r.uid || v.uid, name: r.name || "", why: r.why || "" }; }
    catch (e) { return { valid: false, format: true, uid: v.uid, why: "VIES nicht erreichbar", unreachable: true }; }
  }

  // ── Preis (live) ──
  const PRICE_CACHE = new Map();
  // Produktionsangaben, die Print.com nicht in Ausschlussregeln abbildet (z. B. Bogengröße „large_indigo_sheet“ nur Digital):
  // liefert Print.com „keinen Preis“, die nächste gültige Variante probieren (sonst fiele z. B. Offset bei Broschüren weg → nur teurer Inkjet)
  const VARY = ["sheet_size", "special_size", "flexibleprintingmethod"];
  function variantsOf(prod, opts) {
    const out = [opts], al = aliasOf(prod);
    for (const k of VARY) { const l = (prod.auto || {})[k]; if (!l || (opts[k] === undefined && !OMITTABLE.test(k))) continue;
      for (const v of l.concat(OMITTABLE.test(k) ? [null] : [])) { if (out.length >= 5) break; if (v === opts[k] || (v === null && opts[k] === undefined)) continue; const o = Object.assign({}, opts); if (v === null) delete o[k]; else o[k] = v; if (!hitRules(prod.excludes, o, al)) out.push(o); } }
    return out;
  }
  // Erste lieferbare Variante (nacheinander, sparsam): für den ersten Durchgang je Druckverfahren
  async function buyFirst(prod, n, list, country, postcode) {
    let last; for (const o of (list && list.length ? list : [n.pcOpts]).slice(0, 4)) { try { return { v: await purchase(prod, Object.assign({}, n, { pcOpts: o }), country, postcode), pcOpts: o }; } catch (e) { last = e; if (e.status !== 400) break; } }
    throw last;
  }
  // Immer die günstigste Produktionsvariante (Wunsch Simon 19.10.2026): bis zu 3 Varianten (z. B. mit/ohne Bogengröße → anderer Produzent/Versand)
  // parallel anfragen und die mit dem niedrigsten Gesamtpreis inkl. Versand nehmen; Print.com-Antworten 30 min zwischengespeichert
  async function buyAny(prod, n, list, country, postcode) {
    const L = (list && list.length ? list : [n.pcOpts]).slice(0, 3);
    const rs = await Promise.all(L.map(o => purchase(prod, Object.assign({}, n, { pcOpts: o }), country, postcode).then(v => ({ v, pcOpts: o }), e => ({ e }))));
    const ok = rs.filter(r => r.v).sort((a, b) => a.v.total - b.v.total); if (ok.length) return ok[0];
    throw (rs.find(r => r.e && r.e.status !== 400) || rs[0]).e;
  }
  // Viele Besucher: gleiche Print.com-Anfragen, die gerade laufen, teilen sich ein Ergebnis (INFLIGHT); Zwischenspeicher 6 h (Kasse: frisch, max. 5 min)
  const INFLIGHT = new Map();
  async function purchase(prod, n, country, postcode) {
    const key = JSON.stringify([prod.sku, n.pcOpts, country, postcode || ""]);
    const hit = PRICE_CACHE.get(key); if (hit && Date.now() - hit.at < (n.fresh ? 5 * 60e3 : 6 * 3600e3)) return hit.v;
    if (n.cacheOnly) throw Object.assign(new Error("busy"), { status: 429, busy: true });   // Andrang: Nebensächliches nur aus dem Zwischenspeicher
    if (INFLIGHT.has(key)) return INFLIGHT.get(key);
    const run = purchase1(prod, n, country, postcode, key); INFLIGHT.set(key, run);
    try { return await run; } finally { INFLIGHT.delete(key); }
  }
  async function purchase1(prod, n, country, postcode, key) {
    // Print.com ist maßgeblich: lehnt Print.com ab (oder Preis 0) und greift eine Ausschlussregel → „nicht lieferbar“
    const lo = n.low ? { low: true } : undefined;
    // Versandmöglichkeiten gleichzeitig mit dem Preis anfragen (halbe Wartezeit); schlägt der Preis fehl, wird das Ergebnis verworfen
    const shipP = pcApi("POST", "/shipping/shipping-possibilities", { item: { sku: prod.sku, options: n.pcOpts, deliveryPromise: 0 }, address: { country, postcode: postcode || (country === "DE" ? "10115" : "6793") }, numberOfDays: 21 }, lo); shipP.catch(() => {});
    let pr; try { pr = await pcApi("POST", "/products/" + encodeURIComponent(prod.sku) + "/price", { sku: prod.sku, options: n.pcOpts, deliveryPromise: 0 }, lo); }
    catch (e) { if (n.excluded || e.status === 400 || e.status === 422) throw Object.assign(new Error(n.excluded ? "Diese Kombination ist leider nicht lieferbar" : "Für diese Auswahl gibt es gerade keinen Preis"), { status: 400 }); throw e; }
    const P = pr && pr.prices || {};
    const productPrice = +P.salesPrice > 0 ? +P.salesPrice : +P.productPrice > 0 ? +P.productPrice : +P.normalPrice;
    if (!(productPrice > 0)) throw Object.assign(new Error(n.excluded ? "Diese Kombination ist leider nicht lieferbar" : "Für diese Auswahl gibt es gerade keinen Preis"), { status: n.excluded ? 400 : 502 });
    let sp = await shipP, poss = []; ((sp && sp.results) || []).forEach(r => (r.possibilities || []).forEach(x => poss.push(x)));
    if (!poss.length) {   // leere Versandantwort ist bei Print.com manchmal nur eine kurze Störung → einmal neu anfragen
      await new Promise(r => setTimeout(r, 800));
      sp = await pcApi("POST", "/shipping/shipping-possibilities", { item: { sku: prod.sku, options: n.pcOpts, deliveryPromise: 0 }, address: { country, postcode: postcode || (country === "DE" ? "10115" : "6793") }, numberOfDays: 21 }, lo).catch(() => null);
      ((sp && sp.results) || []).forEach(r => (r.possibilities || []).forEach(x => poss.push(x)));
    }
    const same = poss.filter(x => !x.urgency || x.urgency === n.urgency); if (same.length) poss = same;
    const cost = x => { const p = x.price || {}; return +p.cost > 0 ? +p.cost : (+p.base || 0) + (+p.urgency || 0); };
    poss.sort((a, b) => cost(a) - cost(b) || String(a.deliveryDate).localeCompare(String(b.deliveryDate)));
    if (!poss.length) throw Object.assign(new Error("Versand in dieses Land ist für diese Auswahl gerade nicht möglich"), { status: 502 });
    const best = poss[0];
    const fastest = poss.slice().sort((a, b) => String(a.deliveryDate).localeCompare(String(b.deliveryDate)))[0];
    const v = { product: r2(productPrice), shipping: r2(cost(best)), total: r2(productPrice + cost(best)), deliveryDate: String(best.deliveryDate || "").slice(0, 10), carrier: String(best.carrier || ""), method: String(best.method || ""), earliest: String(fastest.deliveryDate || "").slice(0, 10) };
    PRICE_CACHE.set(key, { at: Date.now(), v }); if (PRICE_CACHE.size > 20000) { const old = Array.from(PRICE_CACHE.keys()).slice(0, 4000); old.forEach(k => PRICE_CACHE.delete(k)); }
    return v;
  }
  const PM_DE = { digital: "Digitaldruck", offset: "Offsetdruck", inkjet: "Inkjet-Digitaldruck", digital_uv: "UV-Digitaldruck", screen_printing: "Siebdruck", sublimation: "Sublimationsdruck", hybrid: "Hybriddruck" };
  async function quote(prod, n, country, postcode, cust) {
    if (!COUNTRIES[country]) throw Object.assign(new Error("Lieferung derzeit nur innerhalb Österreichs"), { status: 400 });
    const s = await settings(), ov = s.products[prod.key] || {}, c = cfg();
    // Ziel-Marge je Kategorie (Cockpit, z. B. Werbeartikel 5 %): Marge in % vom Nettopreis NACH Zahlungsgebühr → Aufschlag und Mindestmarge daraus (Produkt-Aufschlag geht vor)
    const gmAll = s.groupMargin || {}, gmMain = catOf(prod.sku, s, prod.group, prod.cat).main, gmv = gmAll[gmMain] != null ? gmAll[gmMain] : gmAll[prod.group], gm = gmv != null && isFinite(+gmv) ? +gmv : null;
    const gmUp = gm != null ? gm / (100 - gm) * 100 / (1 - 1.2 * payFee().pct / 100) : null;
    const markup = ov.markupPct != null ? +ov.markupPct : gmUp != null ? gmUp : s.markupPct != null ? s.markupPct : c.markup, minM = 0   /* keine €-Mindestmarge – nur Prozentregeln (Wunsch Simon 19.10.2026) */;
    // Aufschlag (und ggf. Mindestmarge) nur auf das Produkt – Versand wird zum Einkaufspreis weitergegeben; auf 10 Cent aufrunden
    // Mindestmarge immer NACH Zahlungsgebühr (Mollie, konservativ: Kreditkarte) – netto ≥ (Einkauf × (1 + min %) + Fixgebühr) / (1 − (1 + USt) × Gebühr %)
    const tax0 = taxFor(country, cust), fee = payFee(), floorOf = b => ((b.product + b.shipping) * (1 + (gmUp != null ? gmUp : s.minMarginPct != null ? s.minMarginPct : 10) / 100) + fee.fix) / (1 - (1 + tax0.rate / 100) * fee.pct / 100);
    // Preisanker: passender Mitbewerberpreis (brutto, AT) für diese Ausführung → knapp darunter; zwischen zwei Auflagen linear interpoliert
    const anc = (s.anchors || {})[prod.key], ancGross = (() => { if (!anc || !n.sel || (n.urgency && n.urgency !== "standard")) return 0;   // Textil: sig z. B. { druck: "transfer", positionen: "positions_front" }
      const a = anc.find(x => Object.keys(x.sig).every(k => String(n.sel[k]) === String(x.sig[k]))); if (!a) return 0;
      const c = +n.copies, at = t => { const cs = Object.keys(t || {}).map(Number).sort((x, y) => x - y); if (!cs.length || c < cs[0] || c > cs[cs.length - 1]) return 0;
        if (t[c]) return t[c]; const hi = cs.find(x => x > c), lo = cs.filter(x => x < c).pop(); return t[lo] + (t[hi] - t[lo]) * (c - lo) / (hi - lo); };
      if (a.area) {   // Wunschgröße: Preis über die Fläche interpolieren (gleiche Fläche → günstigster Mitbewerberpreis), nur innerhalb der verglichenen Flächen
        if (!n.size) return 0; const m2 = n.size.w * n.size.h / 1e6, by = {};
        a.area.forEach(p => { const v = at(p[1]); if (v > 0 && (!by[p[0]] || v < by[p[0]])) by[p[0]] = v; });
        const pts = Object.keys(by).map(Number).sort((x, y) => x - y).map(x => [x, by[x]]); if (pts.length < 2 || m2 < pts[0][0] * 0.98 || m2 > pts[pts.length - 1][0] * 1.02) return 0;
        const hi = pts.find(p => p[0] >= m2) || pts[pts.length - 1], lo = pts.filter(p => p[0] <= m2).pop() || pts[0];
        return hi[0] === lo[0] ? lo[1] : lo[1] + (hi[1] - lo[1]) * (m2 - lo[0]) / (hi[0] - lo[0]);
      }
      return n.kind === "banner" ? 0 : at(a.tiers); })();
    const ancNet = ancGross ? (ancGross - (s.anchorGap != null ? s.anchorGap : 2)) / (1 + 20 / 100) : 0;   // Anker sind österreichische Bruttopreise (20 %)
    // Mit Mitbewerberpreis darf die Marge bis auf anchorMinPct (Standard 5 % vom Nettopreis nach Gebühr, Freigabe Simon 19.10.2026) sinken, damit wir knapp darunter bleiben
    const ancMin = s.anchorMinPct != null && isFinite(+s.anchorMinPct) ? +s.anchorMinPct : 5, ancUp = ancMin / (100 - ancMin) * 100 / (1 - 1.2 * fee.pct / 100);
    const floorA = b => gmUp == null && ancNet ? ((b.product + b.shipping) * (1 + Math.min(ancUp, s.minMarginPct != null ? s.minMarginPct : 10) / 100) + fee.fix) / (1 - (1 + tax0.rate / 100) * fee.pct / 100) : floorOf(b);
    // Große Aufträge ohne Mitbewerberpreis: Aufschlag sinkt ab bulkFrom € Einkauf linear bis auf bulkFactor × Aufschlag bei bulkTo € (Standard 150 € → 1 500 €: 30 % → 12 %)
    const bulkF = b => { if (gmUp != null || ov.markupPct != null) return 1; const t = b.product + b.shipping, a = s.bulkFrom != null ? +s.bulkFrom : 150, z = s.bulkTo != null ? +s.bulkTo : 1500, f = s.bulkFactor != null ? +s.bulkFactor : 0.4;
      return t <= a ? 1 : t >= z ? f : 1 - (1 - f) * (t - a) / (z - a); };
    // Werbeartikel: höchstens 15 % Aufschlag auf den Produkt-Einkauf (Wunsch Simon 19.10.2026, sonst zu teuer) – gilt auch gegenüber Mitbewerber-Ankern; die Zahlungsgebühr wird immer gedeckt
    const promoCap = prod.kind === "promo" || gmMain === PROMO ? (s.promoMaxPct != null && isFinite(+s.promoMaxPct) ? +s.promoMaxPct : 15) : null;
    const netOf0 = b => Math.max(floorA(b), ancNet || (Math.max(b.product * (1 + markup * bulkF(b) / 100), b.product + minM) + b.shipping));
    const netOf = b => Math.ceil((promoCap != null ? Math.min(netOf0(b), Math.max(b.product * (1 + promoCap / 100) + b.shipping, (b.product + b.shipping + fee.fix) / (1 - (1 + tax0.rate / 100) * fee.pct / 100))) : netOf0(b)) * 10 - 1e-6) / 10;
    const tax = taxFor(country, cust);
    // Druckverfahren: lässt Print.com mehrere zu (z. B. Digital/Offset), jedes rechnen und standardmäßig das günstigste nehmen; gewähltes Verfahren geht in die Bestellung
    let buy, methods = null;
    if (n.pmAlts) {
      // 1. Durchgang: je Verfahren die erste lieferbare Variante; 2. Durchgang: nur beim günstigsten Verfahren 1–2 weitere Varianten vergleichen (spart Print.com-Anfragen)
      // n.quick (Aufpreise): nur das Verfahren der aktuellen Auswahl, ohne Feinvergleich – 2 Print.com-Anfragen je Option
      const pmL = n.quick && n.pmAlts.some(a => a.pm === n.pmWanted) ? n.pmAlts.filter(a => a.pm === n.pmWanted) : n.pmAlts;
      const tries = await Promise.all(pmL.map(a => buyFirst(prod, n, a.more || [a.pcOpts], country, postcode).then(r => ({ pm: a.pm, pcOpts: r.pcOpts, v: r.v }), () => null)));
      const ok = tries.filter(Boolean).sort((a, b) => netOf(a.v) - netOf(b.v));
      if (ok.length && !n.quick && pcWait.length < 8) { const b0 = ok[0], al = n.pmAlts.find(a => a.pm === b0.pm), sig = JSON.stringify(b0.pcOpts), alts = ((al && al.more) || []).filter(o => JSON.stringify(o) !== sig).slice(0, 2);
        if (alts.length) { const r = await buyAny(prod, n, [b0.pcOpts].concat(alts), country, postcode).catch(() => null); if (r && r.v.total < b0.v.total) ok[0] = { pm: b0.pm, pcOpts: r.pcOpts, v: r.v }; }
        ok.sort((a, b) => netOf(a.v) - netOf(b.v)); }
      if (ok.length) {
        // automatisch: immer das günstigste Verfahren/der günstigste Produzent (Wunsch Simon 19.10.2026) – bei Gleichstand Offset (gleichmäßigere Farben)
        const off = ok.find(x => x.pm === "offset"), offOk = off && netOf(off.v) <= netOf(ok[0].v);
        const pick = (n.pmWanted && n.pmWanted !== "auto" && ok.find(x => x.pm === n.pmWanted)) || (offOk ? off : ok[0]); buy = pick.v;
        n.pcOpts = pick.pcOpts; n.pm = pick.pm;
        if (n.labels && !n.labels.some(l => l[0] === "Druckverfahren")) n.labels.push(["Druckverfahren", PM_DE[pick.pm] || pick.pm]);
        methods = ok.map(x => { const nt = netOf(x.v); return { pm: x.pm, name: PM_DE[x.pm] || x.pm, net: r2(nt), gross: r2(nt + r2(nt * tax.rate / 100)), deliveryDate: x.v.deliveryDate }; });
      }
    }
    if (!buy) { const r = await (n.quick ? buyFirst : buyAny)(prod, n, n.pcMore, country, postcode); buy = r.v; n.pcOpts = r.pcOpts; }
    // Rabatte (Bonusprogramm bzw. Kundenrabatt, Gutschein): auf den ganzen Nettopreis, hintereinander, auf 10 Cent abgerundet
    const dl = (cust && Array.isArray(cust.disc) ? cust.disc : []).filter(d => d && +d.pct > 0).map(d => ({ label: String(d.label || "Rabatt").slice(0, 60), pct: Math.min(50, +d.pct) }));
    const fac = dl.reduce((f, d) => f * (1 - d.pct / 100), 1), bp = dl.length;
    const disc = nt => bp ? Math.floor(nt * fac * 10 + 1e-6) / 10 : nt;
    if (bp && methods) methods = methods.map(m => { const nt = disc(m.net); return Object.assign({}, m, { net: r2(nt), gross: r2(nt + r2(nt * tax.rate / 100)) }); });
    const list = netOf(buy), net0 = disc(list), vat0 = r2(net0 * tax.rate / 100);
    // Rabatte (Bonus, Kundenrabatt, Gutschein) dürfen die Mindestmarge nach Gebühr nicht unterschreiten
    const net = Math.max(net0, Math.ceil((promoCap != null ? Math.min(floorA(buy), list) : floorA(buy)) * 10 - 1e-6) / 10), vat = r2(net * tax.rate / 100), payCost = r2((net + vat) * fee.pct / 100 + fee.fix);
    // Welche Regel hat den Preis bestimmt? (für die Marge-Übersicht im Cockpit)
    const rule = (b => { if (promoCap != null && netOf(b) < Math.ceil(netOf0(b) * 10 - 1e-6) / 10 - 0.05) return "promoCap"; const f = floorA(b); if (ancNet) return ancNet >= f ? "anchor" : "floor"; if (gmUp != null && ov.markupPct == null) return "category";
      const up = b.product * (1 + markup * bulkF(b) / 100), mk = Math.max(up, b.product + minM) + b.shipping; if (f >= mk) return "floor"; if (b.product + minM > up) return "minEur";
      return ov.markupPct != null ? "product" : bulkF(b) < 1 ? "bulk" : "markup"; })(buy);
    return { anchor: ancGross ? r2(ancGross) : null, rule, methods, pm: n.pm || null, net: r2(net), vat, gross: r2(net + vat), bonus: bp ? { pct: r2((1 - fac) * 100), tier: dl.map(d => d.label).join(" + "), items: dl, listNet: r2(list), saved: r2(list - net) } : null, rate: tax.rate, taxCase: tax.case, taxNote: tax.note, uid: tax.uid, purchase: buy, payFee: payCost, margin: r2(net - buy.total - payCost), markupPct: r2(markup * bulkF(buy)), minMarginEur: minM, deliveryDate: buy.deliveryDate, at: nowIso() };
  }
  const publicPrice = q => ({ net: q.net, vat: q.vat, gross: q.gross, bonus: q.bonus || null, rate: q.rate, taxCase: q.taxCase, taxNote: q.taxNote, deliveryDate: q.deliveryDate, shippingIncluded: true, methods: q.methods || null, pm: q.pm || null });

  // ───────────────────────── Dateien ─────────────────────────
  function sniff(buf) {
    if (buf.length > 5 && buf.slice(0, 5).toString("latin1") === "%PDF-") return "pdf";
    if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return "jpg";
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504E47 && buf.readUInt32BE(4) === 0x0D0A1A0A) return "png";
    return "";
  }
  function imgDims(buf, type) {
    if (type === "png") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  // Wie pdfInfo, aber auch für komprimierte PDFs (Objekt-Streams, z. B. aus InDesign/pdf-lib): fehlende Angaben per pdf-lib nachlesen
  async function pdfInfoX(buf) {
    const i = pdfInfo(buf); if (i.encrypted || (i.media && i.pages)) return i;
    try { const { PDFDocument } = require("pdf-lib"), d = await PDFDocument.load(buf, { updateMetadata: false }), pg = d.getPages(), p0 = pg[0];
      if (p0) { const m = p0.getMediaBox(), t = p0.getTrimBox(), r = v => r2(v / MM_PT);
        if (!i.media) i.media = { w: r(m.width), h: r(m.height) };
        if (!i.trim && t && (Math.abs(t.width - m.width) > 0.5 || Math.abs(t.height - m.height) > 0.5)) i.trim = { w: r(t.width), h: r(t.height) }; }
      if (!i.pages || i.pages < pg.length) i.pages = pg.length;
    } catch (e) { if (/encrypt/i.test(String(e.message))) i.encrypted = true; }
    return i;
  }
  function pdfInfo(buf) {
    const s = buf.toString("latin1");
    const box = name => { const m = s.match(new RegExp("\\/" + name + "\\s*\\[\\s*(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s*\\]")); return m ? { w: r2(Math.abs(m[3] - m[1]) / MM_PT), h: r2(Math.abs(m[4] - m[2]) / MM_PT) } : null; };
    let pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
    const cm = s.match(/\/Type\s*\/Pages\b[^>]{0,400}?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]{0,400}?\/Type\s*\/Pages\b/g) || [];
    cm.forEach(x => { const n = parseInt((x.match(/\/Count\s+(\d+)/) || [])[1], 10); if (n > pages) pages = n; });
    return { encrypted: /\/Encrypt\b/.test(s), pages: pages || null, media: box("MediaBox"), trim: box("TrimBox") };
  }
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const fits = (box, w, h, tol) => box && ((near(box.w, w, tol) && near(box.h, h, tol)) || (near(box.w, h, tol) && near(box.h, w, tol)));
  function checkPdf(info, size, bleed, sides, multi) {
    const out = [], W = size.w + 2 * bleed, H = size.h + 2 * bleed;
    if (info.trim && fits(info.trim, size.w, size.h, 1)) out.push({ level: "ok", text: "Endformat (TrimBox) " + size.w + " × " + size.h + " mm passt." });
    if (fits(info.media, W, H, 1.2)) out.push({ level: "ok", text: "Seitengröße inkl. " + bleed + " mm Beschnitt passt (" + W + " × " + H + " mm)." });
    else if (fits(info.media, size.w, size.h, 1)) out.push({ level: "warn", text: "Die Datei hat keinen Beschnitt (" + bleed + " mm je Seite). Motive bis zum Rand werden evtl. mit weißem Blitzer geschnitten." });
    else if (info.media) {
      const ar = (info.media.w / info.media.h), arT = W / H;
      if (near(ar, arT, 0.02) || near(1 / ar, arT, 0.02)) out.push({ level: "warn", text: "Seitengröße " + info.media.w + " × " + info.media.h + " mm weicht ab, Seitenverhältnis passt – die Datei wird auf " + W + " × " + H + " mm skaliert." });
      else out.push({ level: "error", text: "Seitengröße " + info.media.w + " × " + info.media.h + " mm passt nicht zum gewählten Format (" + W + " × " + H + " mm inkl. Beschnitt)." });
    } else out.push({ level: "warn", text: "Seitengröße konnte nicht automatisch gelesen werden – bitte kontrolliere das Format selbst oder wähle an der Kasse den Profi-Datencheck." });
    if (multi && info.pages && info.pages !== sides) out.push({ level: "warn", text: "Die Datei hat " + info.pages + " Seiten, für deine Auswahl werden " + sides + " Seiten (inkl. Umschlag) benötigt – bitte Seitenzahl prüfen oder eine passende PDF hochladen." });
    else if (multi && info.pages) out.push({ level: "ok", text: info.pages + " Seiten – passt zur gewählten Seitenzahl." });
    else if (info.pages && info.pages !== sides) out.push({ level: info.pages < sides ? "warn" : "error", text: "Die Datei hat " + info.pages + " Seite(n), für die gewählte Druckart werden " + sides + " benötigt." + (info.pages < sides ? " Die Rückseite bleibt sonst weiß." : "") });
    else if (info.pages) out.push({ level: "ok", text: info.pages + " Seite(n) – passt zur gewählten Druckart." });
    return out;
  }
  async function imageToPdf(buf, type, size, bleed, sides) {
    const PDFDocument = require("pdfkit");
    const W = (size.w + 2 * bleed) * MM_PT, H = (size.h + 2 * bleed) * MM_PT;
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: "Druckdaten", Producer: "FS Creative Druckshop" } });
    const chunks = []; doc.on("data", c => chunks.push(c)); const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
    doc.addPage({ size: [W, H], margin: 0 });
    doc.image(buf, 0, 0, { cover: [W, H], align: "center", valign: "center" });
    for (let i = 1; i < sides; i++) doc.addPage({ size: [W, H], margin: 0 });
    doc.end(); await done; return Buffer.concat(chunks);
  }
  // SVG aus dem Designer → druckfertiges PDF (Vektor; Texte in Helvetica/Times/Courier = Arial/Times New Roman/Courier New im Browser)
  function svgSafe(svg) {
    svg = String(svg || "").replace(/^\s*(<\?xml[^>]*>\s*)?<!DOCTYPE svg PUBLIC "-\/\/W3C\/\/DTD SVG 1\.1\/\/EN" "http:\/\/www\.w3\.org\/Graphics\/SVG\/1\.1\/DTD\/svg11\.dtd">\s*/i, "");   // Standard-Vorspann von Fabric.js
    if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) throw Object.assign(new Error("Ungültige Gestaltung"), { status: 400 });
    if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject|javascript:|<iframe|<object|<embed|@import/i.test(svg)) throw Object.assign(new Error("Unzulässiger Inhalt in der Gestaltung"), { status: 400 });
    const hrefs = svg.match(/(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*')/gi) || [];
    for (const h of hrefs) { const v = h.replace(/^[^=]*=\s*/, "").slice(1, -1).trim(); if (!(/^#[\w-]+$/.test(v) || /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=\s]+$/i.test(v))) throw Object.assign(new Error("Bilder müssen direkt eingebettet sein"), { status: 400 }); }
    const urls = svg.match(/url\(\s*['"]?([^'")]*)/gi) || [];
    for (const u of urls) { const v = u.replace(/^url\(\s*['"]?/i, ""); if (!/^#[\w-]+$/.test(v)) throw Object.assign(new Error("Unzulässiger Verweis in der Gestaltung"), { status: 400 }); }
    return svg.replace(/<svg([^>]*)>/i, (m, a) => "<svg" + a.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, "") + ">");
  }
  // Schrift für das PDF: mitgelieferte Schrift (eingebettet, Teilmenge) – fehlt Fett/Kursiv, rechnet svg-to-pdfkit „faux“; Unbekanntes → Helvetica
  const FONT_BUF = {};
  function fontBuf(name) { if (!(name in FONT_BUF)) { try { FONT_BUF[name] = fs.readFileSync(path.join(__dirname, "print", "fonts", name + ".woff")); } catch (e) { FONT_BUF[name] = null; } } return FONT_BUF[name]; }
  function fontFor(doc, family, bold, italic, fo) {
    const first = String(family || "").split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
    const f = FONTS.find(x => x.family.toLowerCase() === first);
    if (f) {
      const b = bold && f.bold, i = italic && f.italic && !b;   // Fett+Kursiv: fette Schrift, kursiv gerechnet
      const name = f.file + "-" + (b ? "700" : "400") + (i ? "i" : "");
      const buf = fontBuf(name);
      if (buf) {
        if (!doc._registeredFonts || !doc._registeredFonts[name]) doc.registerFont(name, buf);
        if (fo) { if (bold && !b) fo.fauxBold = true; if (italic && !i) fo.fauxItalic = true; }
        return name;
      }
    }
    const base = /times|georgia|serif/.test(first) && !/sans/.test(first) ? "Times" : /courier|mono/.test(first) ? "Courier" : "Helvetica";
    if (base === "Times") return bold && italic ? "Times-BoldItalic" : bold ? "Times-Bold" : italic ? "Times-Italic" : "Times-Roman";
    return bold && italic ? base + "-BoldOblique" : bold ? base + "-Bold" : italic ? base + "-Oblique" : base;
  }
  // RGB → CMYK (einfach, mit Unterfarbenreduktion: Schwarz/Grau nur aus K) – Vektorfarben landen als CMYK im PDF
  function cmyk(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, k = 1 - Math.max(r, g, b);
    if (k >= 0.999) return [0, 0, 0, 100];
    const c = (1 - r - k) / (1 - k), m = (1 - g - k) / (1 - k), y = (1 - b - k) / (1 - k);
    return [c, m, y, k].map(v => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10);
  }
  // ── Druckvorlage (PDF) je Produkt/Ausführung: Datenformat, Endformat, Beschnitt, Sicherheitsabstand, Falzlinien ──
  const TPL_CACHE = new Map();
  async function templatePdf(prod, n) {
    const PDFDocument = require("pdfkit");
    const bleed = n.kind === "textile" || n.kind === "promo" ? 0 : +prod.bleed || 0, safe = +prod.safe || 3;
    const shapeTxt = (n.labels || []).map(l => l[1]).join(" "), round = /\b(rund|kreis|oval|round|circle)/i.test(shapeTxt) && !/eckig/i.test(shapeTxt);
    const sheets = [];
    if (n.size) { const sd = n.folds ? 2 : Math.max(1, Math.min(2, n.sides || 1)); for (let i = 0; i < sd; i++) sheets.push({ w: n.size.w, h: n.size.h, b: bleed, title: n.folds ? (i ? "Innenseite" : "Außenseite") : sd > 1 ? (i ? "Rückseite" : "Vorderseite") : "Motiv", side: i }); }
    else (n.positions || []).forEach(p => { if (p.area) sheets.push({ w: p.area[0], h: p.area[1], b: 0, title: "Druckfläche " + p.title, side: 0, area: true }); });
    if (!sheets.length) throw Object.assign(new Error("Für dieses Produkt gibt es keine feste Vorlage – lade einfach dein Motiv hoch, wir prüfen es."), { status: 404 });
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: "Druckvorlage " + prod.title, Author: "FS Creative", Producer: "FS Creative Druckshop", Subject: "Hilfslinien für Endformat, Beschnitt, Sicherheitsabstand und Falz" } });
    const chunks = []; doc.on("data", c => chunks.push(c)); const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
    const C = { bleed: [0, 70, 25, 0], trim: [0, 100, 0, 0], safe: [80, 20, 0, 0], fold: [70, 0, 100, 0], text: [0, 0, 0, 85], muted: [0, 0, 0, 45] };
    const mm = v => v * MM_PT, fmtMm = v => String(Math.round(v * 10) / 10).replace(".", ",");
    for (const sh of sheets) {
      const W = mm(sh.w + 2 * sh.b), H = mm(sh.h + 2 * sh.b), B = mm(sh.b), S = mm(safe), tw = mm(sh.w), th = mm(sh.h);
      doc.addPage({ size: [W, H], margin: 0 });
      doc.page.dictionary.data.TrimBox = [B, B, W - B, H - B]; doc.page.dictionary.data.BleedBox = [0, 0, W, H];
      const lw = Math.max(0.7, Math.min(3, Math.min(W, H) / 400)), dash = Math.max(2, Math.min(W, H) / 120);
      // Beschnittzone (wird abgeschnitten) leicht eingefärbt
      if (B > 0) { doc.save().rect(0, 0, W, H).fillColor(C.bleed).fillOpacity(0.2).fill().restore(); doc.save(); round ? doc.ellipse(W / 2, H / 2, tw / 2, th / 2) : doc.rect(B, B, tw, th); doc.fillColor([0, 0, 0, 0]).fill().restore(); }
      // Endformat (Schnitt)
      doc.save().lineWidth(lw).strokeColor(C.trim); round ? doc.ellipse(W / 2, H / 2, tw / 2, th / 2) : doc.rect(B, B, tw, th); doc.stroke().restore();
      // Roll-up: unterer Bereich steckt in der Kassette (Druckformat 850 × 2060 bei sichtbaren 2000 mm)
      const vis = prod.key === "rollups" && /(\d+)_x_(\d+)/.exec(String(n.sel && n.sel.size || "")), hid = vis ? sh.h - +vis[2] * 10 : 0;
      if (hid > 0 && hid < 300) { const hy = B + th - mm(hid); doc.save().rect(B, hy, tw, mm(hid)).fillColor([0, 0, 0, 40]).fillOpacity(0.18).fill().restore();
        doc.save().fillColor(C.text).font("Helvetica").fontSize(Math.max(6, Math.min(30, mm(hid) * 0.28))).text("ca. " + fmtMm(hid) + " mm verschwinden in der Kassette – hier nur Hintergrund, keine Texte/Logos", B + S, hy + mm(hid) * 0.32, { width: tw - 2 * S, align: "center" }).restore(); }
      // Falzlinien (Innenseite gespiegelt)
      const f = !sh.area && n.folds, xs = f ? f.x.map(x => sh.side ? sh.w - x : x).sort((a, b) => a - b) : [], ys = f ? f.y : [], FS = 3;
      // Sicherheitsabstand – bei Foldern je Feld (an der Falz 3 mm Abstand, damit nichts im Bruch liegt)
      { const cx = [0].concat(xs).concat([sh.w]), cy = [0].concat(ys).concat([sh.h]);
        doc.save().lineWidth(lw).dash(dash, { space: dash * 0.7 }).strokeColor(C.safe);
        if (round) doc.ellipse(W / 2, H / 2, tw / 2 - S, th / 2 - S);
        else for (let yi = 0; yi < cy.length - 1; yi++) for (let xi = 0; xi < cx.length - 1; xi++) {
          const l = cx[xi] + (xi ? FS : safe), r = cx[xi + 1] - (xi < cx.length - 2 ? FS : safe), t = cy[yi] + (yi ? FS : safe), bo = cy[yi + 1] - (yi < cy.length - 2 ? FS : safe);
          if (r > l && bo > t) doc.rect(B + mm(l), B + mm(t), mm(r - l), mm(bo - t)); }
        doc.stroke().undash().restore(); }
      const fs = Math.max(4.5, Math.min(40, Math.min(sh.w, sh.h) * 0.032 * MM_PT));
      doc.font("Helvetica");
      xs.forEach(x => { const X = B + mm(x); doc.save().lineWidth(lw * 1.2).dash(dash * 1.6, { space: dash }).strokeColor(C.fold).moveTo(X, 0).lineTo(X, H).stroke().undash().restore();
        const ty = H - B - S - fs * 4; doc.save().fillColor(C.fold).fontSize(fs * 0.8).rotate(-90, { origin: [X - fs * 0.35, ty] }).text("Falz · " + fmtMm(x) + " mm", X - fs * 0.35, ty, { lineBreak: false }).restore(); });
      ys.forEach(y => { const Y = B + mm(y); doc.save().lineWidth(lw * 1.2).dash(dash * 1.6, { space: dash }).strokeColor(C.fold).moveTo(0, Y).lineTo(W, Y).stroke().undash().restore();
        doc.save().fillColor(C.fold).fontSize(fs * 0.8).text("Falz · " + fmtMm(y) + " mm", B + S + fs, Y - fs * 1.1, { lineBreak: false }).restore(); });
      // Felder beschriften
      const cutsX = [0].concat(xs).concat([sh.w]), cutsY = [0].concat(ys).concat([sh.h]);
      const labs = f ? (sh.side ? f.in.slice() : f.out.slice()) : [];
      const cells = []; for (let yi = 0; yi < cutsY.length - 1; yi++) for (let xi = 0; xi < cutsX.length - 1; xi++) cells.push({ x0: cutsX[xi], x1: cutsX[xi + 1], y0: cutsY[yi], y1: cutsY[yi + 1] });
      const labBottom = {};   // je Feld: Unterkante der Beschriftung (Infoblock beginnt darunter)
      cells.forEach((c, i) => { const lab = labs[i]; if (!lab) return; const cw = mm(c.x1 - c.x0) - 2 * S, x0 = B + mm(c.x0) + S; let y = B + mm(c.y0) + S + fs * 1.2;
        let ls = fs * 1.5; doc.font("Helvetica"); while (ls > fs * 0.8 && doc.fontSize(ls).widthOfString(lab) > cw) ls -= 0.5;
        doc.save().fillColor(C.muted).fontSize(ls).text(lab, x0, y, { width: cw, align: "center" }).restore(); y = doc.y + fs * 0.2;
        if (f.x.length && cells.length === cutsX.length - 1) { doc.save().fillColor(C.muted).fontSize(fs * 0.9).text("Feldbreite " + fmtMm(c.x1 - c.x0) + " mm", x0, y, { width: cw, align: "center" }).restore(); y = doc.y; }
        labBottom[i] = y + fs; });
      // Infoblock im größten Feld
      const big = cells.reduce((a, c) => (c.x1 - c.x0) * (c.y1 - c.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? c : a, cells[0]);
      const bx = B + mm(big.x0) + S + fs * 0.5, bwid = Math.max(20, mm(big.x1 - big.x0) - 2 * S - fs);
      const lines = [
        ["b", "Druckvorlage " + prod.title + " – " + sh.title],
        ["", sh.area ? "Druckfläche: " + fmtMm(sh.w) + " × " + fmtMm(sh.h) + " mm" : "Datenformat (Dateigröße): " + fmtMm(sh.w + 2 * sh.b) + " × " + fmtMm(sh.h + 2 * sh.b) + " mm"],
        ["", "Endformat" + (n.folds ? " offen" : "") + ": " + fmtMm(sh.w) + " × " + fmtMm(sh.h) + " mm" + (n.closed ? " · gefalzt " + fmtMm(n.closed.w) + " × " + fmtMm(n.closed.h) + " mm" : "")],
        sh.b ? ["", "Beschnittzugabe: " + fmtMm(sh.b) + " mm je Seite · Sicherheitsabstand: " + fmtMm(safe) + " mm"] : ["", "Sicherheitsabstand: " + fmtMm(safe) + " mm"],
        n.folds ? ["", n.folds.name + (n.folds.note ? " – " + n.folds.note : "")] : null,
        ["", "Hintergründe bis zur äußeren Kante ziehen, Texte und Logos innerhalb der blauen Linie halten."],
        ["", "Diese Hilfslinien vor dem Export ausblenden bzw. löschen – PDF in Datenformat hochladen."]
      ].filter(Boolean);
      const bigI = cells.indexOf(big), top = labBottom[bigI] != null ? labBottom[bigI] : B + mm(big.y0) + S, bot = B + mm(big.y1) - (big.y1 >= sh.h ? S + fs * 2.6 : mm(3) + fs * 1.4);
      const totH = sz => lines.reduce((a, l) => { doc.font(l[0] ? "Helvetica-Bold" : "Helvetica").fontSize(l[0] ? sz * 1.15 : sz); return a + doc.heightOfString(l[1], { width: bwid }) + sz * 0.35; }, 0);
      let size = fs; const fit = () => lines.every(l => { doc.font(l[0] ? "Helvetica-Bold" : "Helvetica").fontSize(size); return doc.heightOfString(l[1], { width: bwid }) < size * 3.6; }) && totH(size) <= bot - top;
      while (size > 3.5 && !fit()) size -= 0.25;
      const tot = totH(size); let y = Math.max(top, (top + bot) / 2 - tot / 2);
      lines.forEach(l => { doc.font(l[0] ? "Helvetica-Bold" : "Helvetica").fontSize(l[0] ? size * 1.15 : size).fillColor(l[0] ? C.text : C.muted); doc.text(l[1], bx, y, { width: bwid, align: "center" }); y = doc.y + size * 0.35; });
      // Legende unten
      const leg = [[C.bleed, "Beschnitt (wird abgeschnitten)"], [C.trim, "Endformat / Schnittkante"], [C.safe, "Sicherheitsabstand"]].concat(xs.length || ys.length ? [[C.fold, "Falzlinie"]] : []).filter((x, i) => sh.b || i);
      const ls = Math.max(4, size * 0.85); doc.font("Helvetica").fontSize(ls);
      const legW = leg.reduce((a, x) => a + doc.widthOfString(x[1]) + ls * 2.6, 0);
      if (legW < tw - 2 * S) { let lx = W / 2 - legW / 2; const ly = H - B - S - ls * 2.2;
        doc.save().roundedRect(lx - ls, ly - ls * 0.6, legW + ls, ls * 2.1, ls * 0.5).fillColor([0, 0, 0, 0]).fill().restore();
        leg.forEach(x => { doc.save().rect(lx, ly, ls * 1.1, ls * 0.9).fillColor(x[0]).fill().restore(); doc.fillColor(C.text).text(x[1], lx + ls * 1.5, ly - ls * 0.05, { lineBreak: false }); lx += doc.widthOfString(x[1]) + ls * 2.6; }); }
      doc.font("Helvetica").fontSize(Math.max(3.5, ls * 0.8)).fillColor(C.muted).text("fs-creative.at/print", B + S, B + S * 0.35 > B + 2 ? B + S * 0.35 : B + 2, { lineBreak: false });
    }
    doc.end(); await done;
    return { pdf: Buffer.concat(chunks), sheets };
  }

  async function svgPagesToPdf(pages, size, bleed) {
    const PDFDocument = require("pdfkit"), SVGtoPDF = require("svg-to-pdfkit");
    const W = (size.w + 2 * bleed) * MM_PT, H = (size.h + 2 * bleed) * MM_PT, B = bleed * MM_PT;
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: "Druckdaten", Producer: "FS Creative Druckshop" } });
    const chunks = []; doc.on("data", c => chunks.push(c)); const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
    const warns = [], images = [];
    // Bild-Auflösung beim Zeichnen messen: doc.image(img,0,0) zeichnet 1 px = 1 pt, die aktuelle Matrix skaliert → dpi = 72 / Skalierung
    // Gruppen (Maske/Clip/Deckkraft) zeichnet svg-to-pdfkit in ein Form-XObject mit zurückgesetzter Matrix → äußere Matrix mitführen, sonst stimmt die dpi nicht
    const mul = (o, i) => [o[0] * i[0] + o[2] * i[1], o[1] * i[0] + o[3] * i[1], o[0] * i[2] + o[2] * i[3], o[1] * i[2] + o[3] * i[3], o[0] * i[4] + o[2] * i[5] + o[4], o[1] * i[4] + o[3] * i[5] + o[5]];
    const outer = [], base = () => outer.length ? outer[outer.length - 1].m : [1, 0, 0, 1, 0, 0];
    let ctm = doc._ctm || [1, 0, 0, 1, 0, 0], prevCtm = ctm, curPage = doc.page;
    Object.defineProperty(doc, "_ctm", { configurable: true, get: () => ctm, set: (v) => { prevCtm = ctm; ctm = v; } });
    Object.defineProperty(doc, "page", { configurable: true, get: () => curPage, set: (v) => {
      if (outer.length && v === outer[outer.length - 1].page) outer.pop();
      else if (v && curPage && !v.dictionary && typeof v.write === "function") outer.push({ page: curPage, m: mul(base(), prevCtm) });
      curPage = v; } });
    const origImage = doc.image.bind(doc);
    doc.image = function (img, x, y, opt) {
      const m = mul(base(), doc._ctm || [1, 0, 0, 1, 0, 0]), sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]);
      const iw = img && img.width, ih = img && img.height;
      if (iw && ih && !opt) images.push({ page: doc._pageCount || 0, px: [iw, ih], mm: [r2(iw * sx / MM_PT), r2(ih * sy / MM_PT)], dpi: Math.round(72 / Math.max(sx, sy)) });
      return origImage(img, x, y, opt);
    };
    let pageNo = 0;
    for (const svg of pages) {
      doc.addPage({ size: [W, H], margin: 0 }); doc._pageCount = ++pageNo;
      // Endformat und Beschnitt im PDF kennzeichnen (Druckereien lesen TrimBox/BleedBox)
      doc.page.dictionary.data.TrimBox = [B, B, W - B, H - B]; doc.page.dictionary.data.BleedBox = [0, 0, W, H];
      SVGtoPDF(doc, svg, 0, 0, { width: W, height: H, preserveAspectRatio: "none",
        fontCallback: (fam, bold, italic, fo) => fontFor(doc, fam, bold, italic, fo),
        colorCallback: c => c && Array.isArray(c[0]) && c[0].length === 3 ? [cmyk(c[0]), c[1]] : c,
        imageCallback: link => { link = String(link || "").replace(/\s+/g, ""); return /^data:image\/(png|jpe?g);base64,/i.test(link) ? link : ""; },
        documentCallback: () => null, warningCallback: w => { if (warns.length < 20) warns.push(String(w).slice(0, 200)); } });
    }
    doc.end(); await done;
    return { buf: Buffer.concat(chunks), warns, images };
  }
  async function preflightStart(meta, buf) {
    const c = cfg(); if (!c.preflight || !c.pcKey || !meta.size) return null;
    const fd = new FormData();
    fd.append("document", new Blob([JSON.stringify({ bleed: { left: meta.bleed, right: meta.bleed, top: meta.bleed, bottom: meta.bleed }, profile: "GWG_SheetCmyk_2015 CMYK + RGB", template: [{ width: meta.size.w, height: meta.size.h }] })], { type: "application/json" }));
    fd.append("file", new Blob([buf], { type: "application/pdf" }), "druck.pdf");
    const j = await pcApi("POST", "/pdf/preflight", undefined, { base: c.pcPlatform, form: fd, timeout: 60000 });
    return j && j.id ? { id: String(j.id), status: "PROCESSING" } : null;
  }
  async function preflightPoll(meta) {
    if (!meta.preflight || meta.preflight.status !== "PROCESSING") return meta;
    try {
      const j = await pcApi("GET", "/pdf/preflight/" + encodeURIComponent(meta.preflight.id), undefined, { base: cfg().pcPlatform });
      if (j && j.status && j.status !== "PROCESSING") {
        meta.preflight = { id: meta.preflight.id, status: j.status, errors: (j.errors || []).map(x => clip(x.message, 300)).slice(0, 20), warnings: (j.warnings || []).map(x => clip(x.message, 300)).slice(0, 20), fixes: (j.fixes || []).map(x => clip(x.message, 300)).slice(0, 20), reason: clip(j.failure_reason, 300) };
        meta.preflight.errors.forEach(t => meta.checks.push({ level: "error", text: "Erweiterte Prüfung: " + scrubText(t) }));
        meta.preflight.warnings.forEach(t => meta.checks.push({ level: "warn", text: "Erweiterte Prüfung: " + scrubText(t) }));
        await store.putFile(meta);
      }
    } catch (e) { log("Preflight:", e.message); }
    return meta;
  }
  const fileView = m => ({ fileId: m.id, token: sig("file", m.id), name: m.name, kind: m.kind, pages: m.pages, size: m.size, bleed: m.bleed, checks: m.checks || [], blocked: (m.checks || []).some(c => c.level === "error"), preflight: m.preflight ? { status: m.preflight.status } : null, bytes: m.bytes, adj: m.kind === "upload" && !!m.src && !!m.size, place: m.place || null });
  // Datei aufs Format setzen: „fill“ = füllt die Seite inkl. Beschnitt (Ränder werden angeschnitten), „fit“ = ganz sichtbar im Endformat (Rest weiß),
  // rotate 0/90/180/270 (im Uhrzeigersinn), scale 0,25–4 (1 = passend), dx/dy = Verschiebung in mm. Quelle: PDF (alle Seiten) oder JPG/PNG (eine Seite).
  async function placeFile(buf, type, size, bleed, o, sides) {
    const { PDFDocument, degrees } = require("pdf-lib");
    const out = await PDFDocument.create(), b = (+bleed || 0) * MM_PT, W = size.w * MM_PT + 2 * b, H = size.h * MM_PT + 2 * b;
    const mode = o.mode === "fit" ? "fit" : "fill", sc = Math.min(4, Math.max(0.25, +o.scale || 1)), dx = (+o.dx || 0) * MM_PT, dy = (+o.dy || 0) * MM_PT;
    let items = [];
    if (type === "pdf") { const src = await PDFDocument.load(buf); for (const sp of src.getPages()) items.push({ el: await out.embedPage(sp), rot: (sp.getRotation().angle || 0), page: true }); }
    else items.push({ el: type === "png" ? await out.embedPng(buf) : await out.embedJpg(buf), rot: 0 });
    const auto = o.rotate == null || o.rotate === "auto";
    for (const it of items) {
      const w0 = it.el.width, h0 = it.el.height, srcRot = ((it.rot % 360) + 360) % 360;
      let rot = auto ? 0 : ((Math.round(+o.rotate / 90) * 90) % 360 + 360) % 360;
      const eff = r => (r + srcRot) % 180 ? [h0, w0] : [w0, h0];
      if (auto && (eff(0)[0] > eff(0)[1]) !== (W > H) && Math.abs(W - H) > MM_PT && Math.abs(eff(0)[0] - eff(0)[1]) > 1) rot = 90;   // Hochformat-Motiv auf Querformat (und umgekehrt): automatisch drehen
      it.usedRot = rot;
      const [rw, rh] = eff(rot), bw = mode === "fit" ? W - 2 * b : W, bh = mode === "fit" ? H - 2 * b : H;
      const f = (mode === "fit" ? Math.min(bw / rw, bh / rh) : Math.max(bw / rw, bh / rh)) * sc, a = w0 * f, c = h0 * f;
      const th = -((rot + srcRot) % 360) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);   // pdf-lib dreht gegen den Uhrzeigersinn um den Ursprung
      const cx = W / 2 + dx, cy = H / 2 - dy, ox = cx - (a / 2 * cos - c / 2 * sin), oy = cy - (a / 2 * sin + c / 2 * cos);
      const pg = out.addPage([W, H]), opt = { x: ox, y: oy, width: a, height: c, rotate: degrees(-((rot + srcRot) % 360)) };
      if (mode === "fit" || sc < 1) pg.drawRectangle({ x: 0, y: 0, width: W, height: H, color: require("pdf-lib").rgb(1, 1, 1) });
      if (it.page) pg.drawPage(it.el, { x: ox, y: oy, xScale: f, yScale: f, rotate: opt.rotate }); else pg.drawImage(it.el, opt);
      pg.setTrimBox(b, b, W - 2 * b, H - 2 * b); pg.setBleedBox(0, 0, W, H);
    }
    for (let i = items.length; i < (sides || 1); i++) out.addPage([W, H]);
    return { pdf: Buffer.from(await out.save({ useObjectStreams: false })), rot: items[0] ? items[0].usedRot : 0, mode };
  }
  // Fehlender Beschnitt: automatisch ergänzen – „mirror“ = Randbereiche spiegeln (Motiv bleibt 1:1), „zoom“ = Motiv minimal vergrößern (Ränder werden angeschnitten)
  async function addBleed(buf, size, bleed, mode) {
    const { PDFDocument, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = require("pdf-lib");
    const src = await PDFDocument.load(buf), out = await PDFDocument.create(), W = size.w * MM_PT, H = size.h * MM_PT, b = bleed * MM_PT;
    for (const sp of src.getPages()) {
      if ((sp.getRotation().angle || 0) % 360) throw bad("Gedrehte PDF-Seiten können nicht automatisch ergänzt werden");
      const emb = await out.embedPage(sp), pw = emb.width, ph = emb.height, pg = out.addPage([W + 2 * b, H + 2 * b]);
      if (mode === "zoom") { const f = Math.max((W + 2 * b) / pw, (H + 2 * b) / ph); pg.drawPage(emb, { x: (W + 2 * b - pw * f) / 2, y: (H + 2 * b - ph * f) / 2, xScale: f, yScale: f }); }
      else {   // 8 gespiegelte Kopien rundum, leicht überlappend (keine Nahtlinien), Mitte zuletzt obenauf
        const sx = W / pw, sy = H / ph, e = 1.5;
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const cx = dx < 0 ? 0 : dx === 0 ? b : b + W, cw = dx === 0 ? W : b, cy = dy < 0 ? 0 : dy === 0 ? b : b + H, ch = dy === 0 ? H : b;
          pg.pushOperators(pushGraphicsState(), rectangle(Math.max(0, cx - e), Math.max(0, cy - e), cw + 2 * e, ch + 2 * e), clip(), endPath());
          pg.drawPage(emb, { x: dx === 0 ? b : dx < 0 ? b + e : b + 2 * W - e, y: dy === 0 ? b : dy < 0 ? b + e : b + 2 * H - e, xScale: dx === 0 ? sx : -sx, yScale: dy === 0 ? sy : -sy });
          pg.pushOperators(popGraphicsState());
        }
        pg.drawPage(emb, { x: b, y: b, xScale: sx, yScale: sy });
      }
      pg.setTrimBox(b, b, W, H); pg.setBleedBox(0, 0, W + 2 * b, H + 2 * b);
    }
    return Buffer.from(await out.save());
  }
  async function newFile(kind, name, pdf, target, checks, extra) {
    const meta = Object.assign({ id: "f" + crypto.randomBytes(12).toString("hex"), kind, name: clip(name, 120) || "druck.pdf", bytes: pdf.length, createdAt: nowIso(), product: target.product, sel: target.sel, size: target.size, bleed: target.bleed, sides: target.sides, pages: target.pages || null, checks, orderId: null, sha256: crypto.createHash("sha256").update(pdf).digest("hex") }, extra || {});
    try { const pf = await preflightStart(meta, pdf); if (pf) meta.preflight = pf; } catch (e) { log("Preflight-Start:", e.message); }
    await store.putFile(meta, pdf);
    return meta;
  }
  async function targetOf(input, loose) {
    const prod = await findProduct(input.product); if (!prod) throw Object.assign(new Error("Produkt nicht verfügbar"), { status: 400 });
    const n = normalizeSel(prod, input);
    if (!n.size && !loose) throw Object.assign(new Error("Format unbekannt – bitte Druckdatei hochladen oder Gestaltung anfragen"), { status: 400 });
    return { prod, n, target: { product: prod.key, sel: n.fileSel, size: n.size, bleed: prod.bleed, sides: n.sides, multi: !!n.pages } };
  }
  const isLogo = prod => prod.kind === "textile" || prod.kind === "promo";
  // Upload-Konfiguration vorab prüfen (bevor die Datei gelesen wird)
  async function uploadTarget(input) {
    const prod = await findProduct(input.product); if (!prod) throw Object.assign(new Error("Produkt nicht verfügbar"), { status: 400 });
    if (!isLogo(prod)) return targetOf(input, true);
    // Logo je Druckposition: Textil – Position aus dem Produkt; Werbeartikel – Druckfläche der aktuellen Auswahl
    if (prod.kind === "textile") { const p = (prod.positions || []).find(x => x.slug === String(input.logo || "")); if (!p) throw bad("Druckposition fehlt"); return { prod, pos: { slug: p.slug, title: p.title, area: p.area } }; }
    const n = normalizeSel(prod, input); return { prod, pos: n.positions.find(x => x.slug === String(input.logo || "")) || n.positions[0] };   // beidseitig: Vorder-/Rückseite
  }
  // Original einer hochgeladenen Datei (für „Anpassen“: einpassen/füllen/drehen/skalieren – immer vom Original aus, ohne Qualitätsverlust)
  async function keepSrc(buf, type, name) {
    const meta = { id: "f" + crypto.randomBytes(12).toString("hex"), kind: "src", name: clip(String(name || "original"), 120), bytes: buf.length, createdAt: nowIso(), original: type, orderId: null };
    await store.putFile(meta, buf); return meta.id;
  }
  async function handleUpload(buf, name, input) {
    const t0 = await uploadTarget(input);
    if (t0.pos) return handleLogo(buf, name, t0.prod, t0.pos);
    const { prod, target } = t0;
    const type = sniff(buf); if (!type) throw Object.assign(new Error("Nur PDF, JPG oder PNG möglich"), { status: 415 });
    if (!target.size) {   // Produkt ohne lesbares Endformat (allgemeines Print.com-Produkt): Datei annehmen, Format prüfen wir vor dem Druck
      if (type !== "pdf") throw Object.assign(new Error("Für dieses Produkt bitte eine druckfertige PDF hochladen"), { status: 400 });
      const info = await pdfInfoX(buf); if (info.encrypted) throw bad("Die PDF ist verschlüsselt/geschützt – bitte ohne Kennwortschutz exportieren");
      target.pages = info.pages;
      return newFile("upload", name, buf, target, [{ level: "warn", text: "Das Format kann hier nicht automatisch geprüft werden – bitte kontrolliere es selbst laut Produktbeschreibung oder wähle an der Kasse den Profi-Datencheck." + (info.media ? " Seitengröße der Datei: " + info.media.w + " × " + info.media.h + " mm." : "") }], { original: "pdf" });
    }
    if (type === "pdf") {
      const info = await pdfInfoX(buf); if (info.encrypted) throw Object.assign(new Error("Die PDF ist verschlüsselt/geschützt – bitte ohne Kennwortschutz exportieren"), { status: 400 });
      target.pages = info.pages;
      const checks = checkPdf(info, target.size, target.bleed, target.sides, target.multi), src = target.multi ? null : await keepSrc(buf, "pdf", name);
      const sc = checks.findIndex(c => /Seitenverhältnis passt/.test(c.text || ""));
      if (sc > -1 && src) {   // nur die Größe weicht ab → jetzt wirklich skalieren (vorher stand nur der Hinweis da)
        try { const r = await withPdf(() => placeFile(buf, "pdf", target.size, target.bleed, { mode: "fill" }, target.sides));
          checks[sc] = { level: "ok", text: "Seitengröße " + info.media.w + " × " + info.media.h + " mm automatisch auf " + (target.size.w + 2 * target.bleed) + " × " + (target.size.h + 2 * target.bleed) + " mm (inkl. Beschnitt) skaliert" + (r.rot ? " und gedreht" : "") + " – bitte in der Vorschau kontrollieren." };
          return newFile("upload", name, r.pdf, target, checks, { original: "pdf", src, place: { mode: "fill", rotate: r.rot, scale: 1 } });
        } catch (e) { log("Auto-Skalierung:", e.message); }
      }
      return newFile("upload", name, buf, target, checks, { original: "pdf", src });
    }
    if (target.multi) throw Object.assign(new Error("Für mehrseitige Produkte bitte eine PDF mit allen " + target.sides + " Seiten hochladen"), { status: 400 });
    const dm = imgDims(buf, type); if (!dm || !dm.w || !dm.h) throw Object.assign(new Error("Bild konnte nicht gelesen werden"), { status: 400 });
    if (dm.w * dm.h > 150e6) throw Object.assign(new Error("Bild ist zu groß (max. 150 Megapixel)"), { status: 400 });
    const W = target.size.w + 2 * target.bleed, H = target.size.h + 2 * target.bleed;
    const rot = (dm.w > dm.h) !== (W > H) && Math.abs(W - H) > 1 && dm.w !== dm.h;
    const dpi = Math.round(Math.min((rot ? dm.h : dm.w) / (W / 25.4), (rot ? dm.w : dm.h) / (H / 25.4)));
    const D0 = prod.dpi || 300, f = D0 / 300;   // Großformat (Banner) braucht weniger dpi
    const checks = [];
    if (dpi >= D0) checks.push({ level: "ok", text: "Auflösung " + dpi + " dpi – passt." });
    else if (dpi >= Math.round(150 * f)) checks.push({ level: "warn", text: "Auflösung nur " + dpi + " dpi (empfohlen " + D0 + " dpi). Der Druck kann leicht unscharf wirken." });
    else if (dpi >= Math.round(72 * f)) checks.push({ level: "warn", text: "Auflösung sehr gering (" + dpi + " dpi). Der Druck wird sichtbar unscharf – besser eine größere Datei verwenden." });
    else checks.push({ level: "error", text: "Auflösung viel zu gering (" + dpi + " dpi) für " + W + " × " + H + " mm." });
    if (rot) checks.push({ level: "ok", text: "Bild ist " + (dm.w > dm.h ? "quer" : "hoch") + ", das Format " + (W > H ? "quer" : "hoch") + " – automatisch um 90° gedreht. Unter „Anpassen“ kannst du die Drehung ändern." });
    const ar = ((rot ? dm.h : dm.w) / (rot ? dm.w : dm.h)) / (W / H); if (Math.abs(ar - 1) > 0.03) checks.push({ level: "warn", text: "Seitenverhältnis weicht ab – das Bild füllt das Format und wird an den Rändern etwas angeschnitten. Unter „Anpassen“ kannst du es stattdessen ganz einpassen." });
    checks.push({ level: "warn", text: "Bitte beachte: Inhalte im Beschnitt (" + target.bleed + " mm je Seite) werden abgeschnitten." });
    if (target.sides > 1) checks.push({ level: "warn", text: "Bild-Upload füllt nur die Vorderseite – die Rückseite bleibt weiß. Für zwei Seiten bitte eine 2-seitige PDF hochladen." });
    let pdf; try { pdf = (await withPdf(() => placeFile(buf, type, target.size, target.bleed, { mode: "fill" }, target.sides))).pdf; } catch (e) { try { pdf = await imageToPdf(buf, type, target.size, target.bleed, target.sides); } catch (e2) { throw Object.assign(new Error("Bild konnte nicht verarbeitet werden"), { status: 400 }); } }
    target.pages = target.sides;
    const src = await keepSrc(buf, type, name);
    return newFile("upload", String(name || "bild").replace(/\.(jpe?g|png)$/i, "") + ".pdf", pdf, target, checks, { original: type, px: dm, dpi, src, place: { mode: "fill", rotate: rot ? 90 : 0, scale: 1 } });
  }
  // Logo (Textil/Werbeartikel): Original wird gespeichert und geprüft; zusammengeführt wird erst in mergeLogos (eine PDF-Seite je Position)
  async function handleLogo(buf, name, prod, pos) {
    const type = sniff(buf); if (!type) throw Object.assign(new Error("Nur PDF, PNG oder JPG möglich"), { status: 415 });
    const A = pos.area, checks = [], extra = { original: type, pos: pos.slug, area: A };
    if (type === "pdf") {
      const info = await pdfInfoX(buf); if (info.encrypted) throw bad("Die PDF ist verschlüsselt/geschützt – bitte ohne Kennwortschutz exportieren");
      if (info.pages && info.pages > 1) checks.push({ level: "error", text: "Die PDF hat " + info.pages + " Seiten – bitte nur das Logo (1 Seite) hochladen." });
      if (info.media && fits(info.media, A[0], A[1], 1)) checks.push({ level: "ok", text: "Vektor-PDF in Größe der Druckfläche (" + A[0] + " × " + A[1] + " mm) – ideal." });
      else checks.push({ level: "warn", text: "Seitengröße " + (info.media ? info.media.w + " × " + info.media.h + " mm" : "unbekannt") + " – wir platzieren das Logo vor dem Druck passend in der Druckfläche (max. " + A[0] + " × " + A[1] + " mm)." });
      extra.pages = info.pages || 1;
    } else {
      const dm = imgDims(buf, type); if (!dm || !dm.w || !dm.h) throw bad("Bild konnte nicht gelesen werden");
      if (dm.w * dm.h > 100e6) throw bad("Bild ist zu groß (max. 100 Megapixel)");
      const short = Math.min(dm.w, dm.h); extra.px = dm;
      if (short >= 1000) checks.push({ level: "ok", text: "Auflösung " + dm.w + " × " + dm.h + " px – passt." });
      else if (short >= 300) checks.push({ level: "warn", text: "Logo nur " + dm.w + " × " + dm.h + " px – empfohlen sind mindestens 1000 px an der kurzen Seite oder eine Vektor-PDF." });
      else checks.push({ level: "error", text: "Logo viel zu klein (" + dm.w + " × " + dm.h + " px) – bitte mindestens 1000 px an der kurzen Seite oder eine Vektor-PDF." });
      const alpha = type === "png" && (buf[25] === 4 || buf[25] === 6 || buf.indexOf("tRNS", 33, "latin1") > -1);
      if (!alpha) checks.push({ level: "warn", text: (type === "jpg" ? "JPG" : "PNG") + " ohne transparenten Hintergrund – der Hintergrund wird mitgedruckt. Empfohlen: PNG mit transparentem Hintergrund." });
    }
    checks.push({ level: "ok", text: pos.title + ": Logo wird mittig in der Druckfläche platziert (max. " + A[0] + " × " + A[1] + " mm, Platzierung ca. wie gezeigt)." });
    const meta = { id: "f" + crypto.randomBytes(12).toString("hex"), kind: "logo", name: clip(name, 120) || "logo", bytes: buf.length, createdAt: nowIso(), product: prod.key, sel: { pos: pos.slug }, size: null, bleed: 0, sides: 1, pages: 1, checks, orderId: null, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
    Object.assign(meta, extra);
    await store.putFile(meta, buf);
    return meta;
  }
  // Logos → EINE PDF (Print.com nimmt nur eine Datei pro Position im Auftrag): Seite je Druckposition in fester Reihenfolge, Seite = maximale Druckfläche, Logo mittig.
  // Vektor-PDFs können ohne PDF-Bibliothek nicht eingebettet werden → nur bei genau einer Position (dann wird die PDF direkt verwendet).
  async function mergeLogos(input) {
    const { prod, n } = await targetOf(input, true);
    if (!isLogo(prod)) throw bad("Nur für Textil und Werbeartikel");
    const given = objOf(input.logos), metas = [];
    for (const p of n.positions) {
      const g = objOf(given[p.slug]); const fm = await store.fileMeta(String(g.fileId || ""));
      if (!fm || !sigOk("file", fm.id, g.token) || fm.kind !== "logo" || fm.product !== prod.key || fm.pos !== p.slug) throw bad("Bitte für „" + p.title + "“ ein Logo hochladen");
      if (fm.orderId) throw Object.assign(new Error("Dieses Logo gehört schon zu einer Bestellung – bitte erneut hochladen"), { status: 409 });
      metas.push([p, fm]);
    }
    const checks = [];
    metas.forEach(x => (x[1].checks || []).forEach(c => checks.push({ level: c.level, text: (n.positions.length > 1 ? x[0].title + ": " : "") + c.text.replace(new RegExp("^" + x[0].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ": "), "") })));
    const pageMap = n.positions.map((p, i) => ({ page: i + 1, pos: p.slug, title: p.title, area: p.area }));
    let pdf;
    if (metas.some(x => x[1].original === "pdf")) {
      if (metas.length > 1) throw bad("Bei mehreren Druckpositionen bitte die Logos als PNG oder JPG hochladen (Vektor-PDF nur bei einer Position) – oder die Vektordatei nach der Bestellung per Mail schicken.");
      pdf = await store.fileData(metas[0][1].id);
    } else {
      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({ autoFirstPage: false, margin: 0, info: { Title: "Logos", Producer: "FS Creative Druckshop" } });
      const chunks = []; doc.on("data", c => chunks.push(c)); const done = new Promise((res, rej) => { doc.on("end", res); doc.on("error", rej); });
      try {
        for (const x of metas) {
          const W = x[0].area[0] * MM_PT, H = x[0].area[1] * MM_PT, img = await store.fileData(x[1].id);
          doc.addPage({ size: [W, H], margin: 0 }); doc.page.dictionary.data.TrimBox = [0, 0, W, H];
          doc.image(Buffer.from(img), 0, 0, { fit: [W, H], align: "center", valign: "center" });
        }
        doc.end(); await done;
      } catch (e) { log("Logo-PDF:", e.message); throw bad("Logo konnte nicht verarbeitet werden"); }
      pdf = Buffer.concat(chunks);
    }
    checks.unshift({ level: "ok", text: "Logo-PDF erstellt: " + pageMap.map(p => "Seite " + p.page + " = " + p.title + " (" + p.area[0] + " × " + p.area[1] + " mm)").join(", ") + "." });
    const target = { product: prod.key, sel: n.fileSel, size: null, bleed: 0, sides: n.positions.length, pages: n.positions.length };
    return newFile("logos", "logos.pdf", pdf, target, checks, { pageMap, logos: metas.map(x => x[1].id) });
  }
  async function handleDesign(input) {
    const { prod, target } = await targetOf(input);
    if (!prod.designer) throw bad("Für dieses Produkt bitte eine Datei hochladen");
    const pages = Array.isArray(input.pages) ? input.pages : [];
    if (pages.length !== target.sides) throw Object.assign(new Error("Anzahl der Seiten passt nicht (" + target.sides + " benötigt)"), { status: 400 });
    const clean = pages.map(svgSafe);
    let r; try { r = await svgPagesToPdf(clean, target.size, target.bleed); } catch (e) { log("Designer-PDF:", e.message); throw Object.assign(new Error("PDF konnte nicht erstellt werden"), { status: 400 }); }
    const W = r2(target.size.w + 2 * target.bleed), H = r2(target.size.h + 2 * target.bleed);
    // Endkontrolle: Seitengröße des erzeugten PDFs = Endformat + 2 × Beschnitt
    const info = pdfInfo(r.buf);
    if (!fits(info.media, W, H, 0.2) || info.pages !== clean.length) { log("Designer-PDF Größe falsch", JSON.stringify(info), W, H); throw Object.assign(new Error("PDF-Größe stimmt nicht – bitte erneut versuchen"), { status: 500 }); }
    const checks = [{ level: "ok", text: "Druck-PDF erstellt: " + W + " × " + H + " mm (Endformat " + target.size.w + " × " + target.size.h + " mm + " + target.bleed + " mm Beschnitt), " + clean.length + " Seite(n), Schriften eingebettet, Farben in CMYK." }];
    const f = (prod.dpi || 300) / 300, lo = Math.round(250 * f), min = Math.round(100 * f);   // Großformat: Schwellen anteilig
    const low = r.images.filter(x => x.dpi < lo);
    low.forEach(x => checks.push({ level: x.dpi < min ? "error" : "warn", text: "Bild auf Seite " + x.page + " hat bei " + x.mm[0] + " × " + x.mm[1] + " mm nur " + x.dpi + " dpi (empfohlen ≥ " + (prod.dpi || 300) + ", mindestens " + lo + ")." + (x.dpi < min ? " Bitte größeres Bild verwenden oder kleiner platzieren." : " Der Druck kann unscharf wirken.") }));
    if (r.images.length && !low.length) checks.push({ level: "ok", text: r.images.length + " Bild(er) mit ausreichender Auflösung (≥ " + lo + " dpi)." });
    (Array.isArray(input.warnings) ? input.warnings : []).slice(0, 10).forEach(w => checks.push({ level: "warn", text: clip(w, 200) }));
    target.pages = clean.length;
    return newFile("design", "gestaltung.pdf", r.buf, target, checks, { svgWarns: r.warns.length, images: r.images.slice(0, 30) });
  }

  // ───────────────────────── Mollie ─────────────────────────
  async function mollie(method, p, body) {
    const c = cfg(); if (!c.mollieKey) throw Object.assign(new Error("Online-Zahlung ist noch nicht eingerichtet"), { status: 503 });
    const r = await fetch(c.mollieBase + p, { method, headers: Object.assign({ authorization: "Bearer " + c.mollieKey, accept: "application/json" }, body ? { "content-type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error("Mollie: " + (j.detail || j.title || "HTTP " + r.status)), { status: r.status });
    return j;
  }
  async function createPayment(list) {   // eine Bestellung oder alle Positionen eines Warenkorbs (gemeinsame Zahlung)
    const c = cfg(), orders = Array.isArray(list) ? list : [list], o = orders[0], gid = orders.length > 1 ? o.groupId : null;
    const sum = Math.round(orders.reduce((a, x) => a + x.price.gross, 0) * 100) / 100;
    const pay = await mollie("POST", "/payments", { amount: { currency: "EUR", value: sum.toFixed(2) }, description: "FS Creative Druck " + (gid ? orders.map(x => x.nr).join(", ").slice(0, 200) : o.nr),
      redirectUrl: c.publicUrl + "/print?bestellung=" + encodeURIComponent(o.id) + "&t=" + sig("order", o.id), webhookUrl: c.publicUrl + "/print/mollie-webhook",
      metadata: gid ? { orderId: o.id, groupId: gid, orderIds: orders.map(x => x.id).join(",") } : { orderId: o.id, nr: o.nr }, locale: "de_AT" });
    const url = pay._links && pay._links.checkout && pay._links.checkout.href || "";
    for (const x of orders) { x.payment.mollieId = String(pay.id || ""); x.payment.attempts = (x.payment.attempts || []).concat([x.payment.mollieId]).slice(-10); x.payment.status = String(pay.status || "open"); x.payment.checkoutUrl = url; }
    return url;
  }

  // ───────────────────────── Mails ─────────────────────────
  function mailHtml(title, intro, rows, outro) {
    return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;color:#1d1d1f;max-width:600px">' +
      "<h2 style=\"font-size:20px;margin:0 0 12px\">" + escH(title) + "</h2>" + intro.map(p => "<p style=\"margin:0 0 12px;line-height:1.5\">" + escH(p) + "</p>").join("") +
      (rows && rows.length ? '<table cellpadding="5" style="border-collapse:collapse;margin:8px 0 14px">' + rows.map(r => "<tr><td style=\"color:#6e6e73;vertical-align:top\">" + escH(r[0]) + "</td><td><b>" + escH(r[1]) + "</b></td></tr>").join("") + "</table>" : "") +
      (outro || []).map(p => "<p style=\"margin:0 0 12px;line-height:1.5\">" + escH(p) + "</p>").join("") +
      '<p style="margin:18px 0 0;color:#6e6e73;font-size:13px">FS Creative · Simon Felder · Dorfstraße 3/1 · 6793 Gaschurn · <a href="https://www.fs-creative.at">fs-creative.at</a></p></div>';
  }
  async function mail(to, subject, title, intro, rows, outro, replyTo) {
    if (!D.mailSend) return false;
    const text = [title, ""].concat(intro, [""], (rows || []).map(r => r[0] + ": " + r[1]), [""], outro || [], ["", "FS Creative · Simon Felder · Dorfstraße 3/1 · 6793 Gaschurn"]).join("\n");
    try { await D.mailSend({ to, subject, text, html: mailHtml(title, intro, rows, outro), replyTo }); return true; } catch (e) { log("Mail an " + String(to).replace(/^[^@]+/, "…") + " fehlgeschlagen:", e.message); return false; }
  }
  const orderRows = o => [["Bestellnummer", o.nr], ["Produkt", o.product.title + " · " + o.copies + " Stk."]].concat(o.labels.map(l => [l[0], l[1]]), [["Lieferzeit", (URGENCY_DE[o.urgency] || o.urgency) + (o.price.deliveryDate ? " · voraussichtlich " + deDate(o.price.deliveryDate) + " (ggf. auch am darauffolgenden Werktag)" : "")],
    ["Lieferadresse", [o.customer.company, o.customer.firstName + " " + o.customer.lastName, o.customer.street, o.customer.zip + " " + o.customer.city, COUNTRIES[o.customer.country]].filter(Boolean).join(", ")],
    [o.price.rate ? "Gesamt inkl. " + o.price.rate + " % USt" : "Gesamt (steuerfrei)", eur(o.price.gross) + (o.price.rate ? " (netto " + eur(o.price.net) + ")" : "")], ["Zahlung", o.payment.method === "invoice" ? "Rechnung (14 Tage)" : "Online bezahlt (Mollie)"]]);
  const deDate = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };

  // Newsletter (print-newsletter.js): wöchentlich montags, Double-Opt-in, Bearbeitung im Cockpit
  let NEWS = null;
  async function priceFrom(k) {
    const hit = FROM.get(k + "|nl"); if (hit && Date.now() - hit.at < 12 * 3600e3) return hit.v;
    const s0 = await settings(), prod = await findProduct(k, s0); if (!prod || prod.kind === "textile" || prod.kind === "promo") return null;
    const t = (prod.tiers || []).indexOf(500) > -1 ? 500 : (prod.tiers || []).indexOf(100) > -1 ? 100 : (prod.tiers || [])[0];
    const n = normalizeSel(prod, Object.assign({ copies: t }, prod.kind === "banner" && prod.custom ? { custom: { w: 200, h: 100 } } : {}));
    const q = await quote(prod, n, "AT", "", {}); const v = { gross: q.gross, copies: n.copies }; fromSet(k + "|nl", { at: Date.now(), v }); return v;
  }
  const nlMod = () => NEWS || (NEWS = require("./print-newsletter.js")({ store, mailSend: D.mailSend, sig, sigOk, nowIso, log, limited, send: D.send,
    publicUrl: () => cfg().publicUrl, firm: () => Object.assign({}, FIRM_DEFAULT, (D.firm && D.firm()) || {}),
    products: async () => { const s = await settings(); return publicCatalog(await catalog(false), s, await catalogAll().catch(() => null)); },
    priceFrom, vouchers, saveVouchers: all => store.setMeta("print_vouchers", all), accounts: () => accountMod().listAll() }));
  // Kundenkonten (print-account.js): erst bei Bedarf laden
  let ACCOUNT = null;
  const accountMod = () => ACCOUNT || (ACCOUNT = require("./print-account.js")({ store, mail, sig, sigOk, limited, nowIso, secure: /^https:/.test(cfg().publicUrl), uidCheck, reorderOf }));
  // ── KI-Assistent im Designer: Tageslimit je Kunde (Konto bzw. IP) und gesamt; Kosten werden je Aufruf exakt verbucht ──
  const AI_STYLES = { klar: "klar, modern, weiß mit Blau", nacht: "dunkel, edel, Nachtblau mit Leuchten", elegant: "elegant, Creme mit Gold, Serifen", akzent: "seriös mit farbigem Band", bold: "plakativ, Gelb/Schwarz, große Großbuchstaben", natur: "natürlich, grün, ruhig", split: "großes Bild + Text, orange Akzente", kreise: "dunkel mit bunten Kreisen, lebendig", pastell: "sanfte Pastelltöne, freundlich", retro: "Retro 70er, Orange/Creme, Streifen", mono: "minimalistisch schwarz-weiß", business: "Business, Dunkelblau/Türkis", neon: "Neon, Nacht, Party", terracotta: "warm, Terracotta, Bild + Serifen", ozean: "frisch, Blau/Türkis, Wellen", kreide: "Kreidetafel, Gastro, dunkel mit Gelb", festlich: "festlich, Bordeaux mit Gold", sport: "sportlich, Schwarz/Rot, kräftig", frisch: "frisch, Grün/Weiß", handmade: "handgemacht, Kraftpapier, Schreibschrift", editorial: "Magazin-Stil, Rot-Akzent, Serifen", verspielt: "verspielt, Lila/Gelb, Punkte, Kinder & Feste" };
  const aiCfg = () => ({ day: Math.max(0.05, parseFloat(String(process.env.PRINT_AI_DAY_EUR || "0.3").replace(",", ".")) || 0.3), total: Math.max(0.5, parseFloat(String(process.env.PRINT_AI_DAY_TOTAL_EUR || "5").replace(",", ".")) || 5) });
  let AI_USE = null;
  async function aiUse() { const d = today(); if (!AI_USE) AI_USE = (await store.getMeta("print_ai_usage").catch(() => null)) || {}; if (AI_USE.day !== d) AI_USE = { day: d, total: 0, by: {} }; return AI_USE; }
  const aiKey = (me, ip) => me ? "k:" + me.id : "ip:" + crypto.createHash("sha256").update(String(ip) + SECRET).digest("hex").slice(0, 16);
  async function aiLeft(key) { const u = await aiUse(), c = aiCfg(); return Math.max(0, Math.min(c.day - (u.by[key] || 0), c.total - u.total)); }
  async function aiDesign(b, me, ip) {
    const ki = D.ki; if (!ki || !ki.printDesignOn || !ki.printDesignOn()) throw Object.assign(new Error("Der KI-Assistent ist gerade nicht verfügbar."), { status: 503 });
    const key = aiKey(me, ip), left = await aiLeft(key);
    if (left < 0.02) throw Object.assign(new Error("Dein KI-Kontingent für heute ist aufgebraucht – morgen geht’s weiter. Vorlagen und alle anderen Funktionen kannst du natürlich weiter nutzen."), { status: 429 });
    const brief = clip(b.brief, 700); if (brief.length < 4) throw Object.assign(new Error("Beschreib kurz, was du gestalten möchtest."), { status: 400 });
    const prod = CURATED.find(x => x.key === b.product), fonts = FONTS.map(f => f.family), hx = v => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : "";
    // nur Stile, die es für dieses Produkt als Vorlage gibt (vom Designer mitgeschickt, inkl. Grundpalette)
    const given = (Array.isArray(b.styles) ? b.styles : []).slice(0, 30).filter(x => x && AI_STYLES[x.id]);
    const styles = given.length ? given.map(x => x.id) : Object.keys(AI_STYLES);
    const styleTxt = k => { const g = given.find(x => x.id === k); return k + " (" + AI_STYLES[k] + (g ? "; Grundfarben bg " + hx(g.bg) + ", fg " + hx(g.fg) + ", ac " + hx(g.ac) + ", ac2 " + hx(g.ac2) + "; Schriften " + (fonts.indexOf(g.fh) > -1 ? g.fh : "?") + " / " + (fonts.indexOf(g.fb) > -1 ? g.fb : "?") : "") + ")"; };
    const str = { type: "string" }, hex = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
    const schema = { type: "object", additionalProperties: false, required: ["style", "photo", "H", "S", "O", "B", "F", "A", "W", "pal", "tip"], properties: { style: { type: "string", enum: styles }, photo: { type: "boolean" }, H: str, S: str, O: str, B: str, F: str, A: str, W: str,
      pal: { type: "object", additionalProperties: false, required: ["bg", "fg", "mute", "ac", "ac2", "fh", "fb"], properties: { bg: hex, fg: hex, mute: hex, ac: hex, ac2: hex, fh: { type: "string", enum: fonts }, fb: { type: "string", enum: fonts } } }, tip: str } };
    const system = ["Du bist Grafikdesigner:in im Online-Druckshop von FS Creative (Österreich). Du entwirfst Druckprodukte für Kund:innen: Texte (Deutsch, österreichische Schreibweise, Du-Form nur wenn passend), Stil und Farbpalette.",
      "Felder: H = Hauptüberschrift (kurz, max. 5 Wörter), S = Unterzeile, O = Datum/Ort/Kerninfo (kurz, sonst leer), B = Fließtext (max. 40 Wörter; bei Visitenkarten/Aufklebern leer), F = Kontakt-/Fußzeile (Zeilen mit \n), A = Störer/Preis/Badge (max. 3 Wörter, sonst leer), W = Website ohne https://.",
      "Für Visitenkarten: H = Name, S = Funktion, F = Telefon\nE-Mail\nWebsite, A = Adresse. Für Folder: B in Abschnitte mit Leerzeile trennen (Titel in erster Zeile).",
      "Erfinde keine konkreten Telefonnummern, Adressen oder Preise, die nicht im Auftrag stehen – nutze dann klar erkennbare Platzhalter wie „+43 …“ oder „www.deine-website.at“.",
      "Texte: konkret auf genau diesen Auftrag zugeschnitten, keine Floskeln oder Füllwörter. H kurz und einprägsam (Anlass, Name oder Kernversprechen), S ergänzt H statt es zu wiederholen, O nur mit echten Angaben aus dem Auftrag (Datum, Uhrzeit, Ort), B nennt Nutzen/Programm in kurzen Sätzen, A nur bei echtem Aufhänger (z. B. „Eintritt frei“, „−20 %“, „Neu“).",
      "Farben: harmonisch und druckfreundlich (CMYK-tauglich, kein Neon außer beim Stil neon). Geh von den Grundfarben des gewählten Stils aus und passe sie an Branche, Anlass und genannte Firmenfarben an (z. B. Bäckerei warm, Technik kühl, Natur/Bio Grüntöne). Höchstens zwei Akzentfarben, fg auf bg sehr gut lesbar (Kontrast mind. 4,5:1), mute ebenfalls lesbar, ac2 harmoniert mit ac. Bei hellem bg dunkle Schrift, bei dunklem bg helle.",
      "Schriften nur aus der Liste: fh = Überschrift, fb = Fließtext. Schreibschriften (Pacifico, Dancing Script) und schmale Plakatschriften (Bebas Neue, Oswald) nur als fh, nie als fb. fb immer gut lesbar (z. B. Inter, Open Sans, Lato, Nunito, Lora). fh und fb dürfen gleich sein (z. B. minimal), sonst stimmig kombinieren (Serif + Sans).",
      "photo = true nur, wenn der Auftrag ausdrücklich ein eigenes Foto/Bild erwähnt (z. B. Produktfoto, Foto vom Haus, Team- oder Speisenfotos). Sonst false – dann wird ein reines Typo-Design mit Dekor ohne Bildrahmen gesetzt. Es werden nie Fotos gesucht oder erzeugt.",
      "Wähle den Stil, der inhaltlich und optisch am besten passt (nur aus dieser Liste): " + styles.map(styleTxt).join(", ") + ".",
      "tip = ein kurzer, konkreter Gestaltungstipp für genau diesen Auftrag (ein Satz).",
      "Lehne Inhalte ab, die illegal, hetzerisch, diskriminierend oder sexuell explizit sind, oder fremde Marken/Logos imitieren – setze dann H auf „Bitte anderen Inhalt wählen“ und alle anderen Texte leer."].join("\n");
    const user = "Produkt: " + (prod ? prod.title : clip(b.product, 60)) + (b.w && b.h ? " · Format " + Math.round(+b.w) + " × " + Math.round(+b.h) + " mm" : "") + "\nAuftrag der Kundin/des Kunden:\n" + brief;
    let r; try { r = await ki.printDesign(system, user, schema); } catch (e) { throw Object.assign(new Error(e.kiCode === "not_configured" || e.kiCode === "disabled" ? "Der KI-Assistent ist gerade nicht verfügbar." : e.message || "KI-Fehler"), { status: 502 }); }
    const u = await aiUse(); u.by[key] = (u.by[key] || 0) + r.eur; u.total += r.eur; u.calls = (u.calls || 0) + 1; store.setMeta("print_ai_usage", u).catch(() => {});
    return { design: r.json, left: Math.round(Math.max(0, aiCfg().day - u.by[key]) * 100) / 100 };
  }
  // ── Rabatte: Bonusprogramm (Firmenkonto) oder eigener Kundenrabatt (der höhere gilt) + Gutscheincode ──
  let VOUCHERS = null; const FROM = new Map();
  const fromSet = (k, v) => { if (FROM.size >= 6000) { let n = 1000; for (const x of FROM.keys()) { FROM.delete(x); if (--n <= 0) break; } } FROM.delete(k); FROM.set(k, v); };   // „ab“-Preise: höchstens 6 000 Einträge
  async function vouchers() { if (!VOUCHERS) VOUCHERS = (await store.getMeta("print_vouchers").catch(() => null)) || {}; return VOUCHERS; }
  const vCode = c => String(c || "").trim().toUpperCase().replace(/\s+/g, "").slice(0, 40);
  async function voucherCheck(code, email) {
    code = vCode(code); if (!code) return { v: null };
    const v = (await vouchers())[code], bad = m => ({ v: null, err: m });
    if (!v || v.active === false) return bad("Der Gutscheincode „" + code + "“ ist ungültig.");
    if (v.until && today() > v.until) return bad("Der Gutschein „" + code + "“ ist abgelaufen.");
    if (v.maxUses && (v.used || 0) >= v.maxUses) return bad("Der Gutschein „" + code + "“ wurde schon vollständig eingelöst.");
    if (v.perCustomer && email && (v.usedBy || []).indexOf(String(email).toLowerCase()) > -1) return bad("Du hast den Gutschein „" + code + "“ schon eingelöst.");
    return { v };
  }
  async function useVoucher(code, email) {
    const all = await vouchers(), v = all[vCode(code)]; if (!v) return;
    v.used = (v.used || 0) + 1; if (email) v.usedBy = (v.usedBy || []).concat([String(email).toLowerCase()]).slice(-2000); v.lastUsed = nowIso();
    await store.setMeta("print_vouchers", all);
  }
  async function discFor(me, isCompany, code, email) {
    const disc = []; let base = null;
    if (me) {
      const bo = me.type === "company" && isCompany ? await bonusOf(me) : null;
      if (bo && bo.pct) base = { label: bo.name + "-Bonus", pct: bo.pct };
      if (+me.discountPct > 0 && (!base || +me.discountPct > base.pct)) base = { label: "Kundenrabatt", pct: +me.discountPct };
    }
    if (base) disc.push(base);
    const vc = await voucherCheck(code, email || (me && me.email));
    if (vc.v) disc.push({ label: "Gutschein " + vc.v.code, pct: vc.v.pct });
    return { disc, voucher: vc.v || null, voucherErr: vc.err || "" };
  }
  async function bonusOf(c, all) {
    if (!c) return null;
    const l = (all || await store.listOrders()).filter(o => (o.customerId === c.id || (c.verified && o.customer && o.customer.email === c.email)) && BONUS_COUNTS[o.status]);
    const year = +today().slice(0, 4), b = bonusCalc(l, year), company = c.type === "company";
    const cur = b.idx > -1 ? BONUS_TIERS[b.idx] : null, nx = BONUS_TIERS[b.idx + 1] || null;
    return { company, revenue: b.revenue, year, carried: b.carried > -1 ? BONUS_TIERS[b.carried].name : "", tier: company && cur ? cur.key : "", name: company && cur ? cur.name : "", pct: company && cur ? cur.pct : 0,
      next: nx ? { key: nx.key, name: nx.name, from: nx.from, pct: nx.pct, missing: r2(Math.max(0, nx.from - b.revenue)) } : null, tiers: BONUS_TIERS,
      resetTo: cur ? (BONUS_TIERS[b.idx - 2] ? BONUS_TIERS[b.idx - 2].name : "") : "", orders: l.length };
  }

  // „Nochmal bestellen“ (Kundenkonto): Kopie der bestellten Druckdatei ohne Bestellbezug + gleiche Ausführung → Warenkorb; der Preis wird dort neu berechnet
  async function reorderOf(c, id) {
    const o = await store.getOrder(id); if (!o || !(o.customerId === c.id || (c.verified && o.customer && o.customer.email === c.email))) return null;
    if (o.motifs && o.motifs.length > 1) return null;   // mehrere Motive: bitte neu zusammenstellen
    const f = await store.fileMeta(String(o.fileId || "")); if (!f) return null; const data = await store.fileData(f.id); if (!data) return null;
    const prod = await findProduct(o.product.key, await settings()).catch(() => null); if (!prod) return null;
    const nf = Object.assign({}, f, { id: "f" + crypto.randomBytes(12).toString("hex"), createdAt: nowIso(), orderId: null, copyOf: f.id }); await store.putFile(nf, data);
    const sel = Object.assign({}, o.sel || {}); delete sel.custom;
    const C = prod.custom, k = C && C.unit === "cm" ? 10 : 1, custom = o.custom && o.custom.w && C ? { w: String(o.custom.w / k), h: String(o.custom.h / k) } : undefined;
    const textile = o.textile ? { method: o.textile.method, positions: (o.textile.positions || []).map(x => x.slug), sizes: (o.textile.sizes || []).reduce((a, x) => { a[x.slug] = x.n; return a; }, {}) } : undefined;
    const fl = (o.labels || []).find(l => /format|größe/i.test(l[0]));
    return { product: prod.key, sel, copies: o.copies, urgency: o.urgency || "standard", pm: "auto", custom, textile, id: "r" + Date.now().toString(36) + crypto.randomBytes(2).toString("hex"), title: prod.title, img: "", icon: prod.icon || "",
      tiers: (prod.tiers || []).slice(0, 30), fileId: nf.id, fileToken: sig("file", nf.id), fileName: (f.kind === "design" ? "Eigene Gestaltung" : f.name || "Druckdatei") + " (wie " + o.nr + ")", preview: "",
      n: o.copies, labels: (o.labels || []).slice(0, 12), size: fl ? fl[1] : "", price: null, warn: false, clientWarn: [], at: Date.now(), reorderOf: o.nr };
  }
  async function ordersOfCustomer(c) {
    const l = (await store.listOrders()).filter(o => o.customerId === c.id || (c.verified && o.customer && o.customer.email === c.email));
    return l.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50).map(o => Object.assign(orderPublic(o), { createdAt: o.createdAt, token: sig("order", o.id), groupId: o.groupId || null, labels: o.labels || [], productKey: o.product.key, canReorder: !!o.fileId && !(o.motifs && o.motifs.length > 1) && o.status !== "pending_payment" && o.status !== "payment_failed" }));
  }

  // ───────────────────────── Bestellungen ─────────────────────────
  const hist = (o, what) => { o.history = (o.history || []).concat([{ at: nowIso(), what: clip(what, 300) }]).slice(-60); };
  function validCustomer(c) {
    c = c || {};
    const x = { type: c.type === "company" ? "company" : "private", company: clip(c.company, 120), uid: clip(c.uid, 20).replace(/[\s.\-]/g, "").toUpperCase(), firstName: clip(c.firstName, 60), lastName: clip(c.lastName, 60),
      email: clip(c.email, 160).toLowerCase(), phone: clip(c.phone, 40), street: clip(c.street, 120), zip: clip(c.zip, 10), city: clip(c.city, 80), country: String(c.country || "AT").toUpperCase() };
    const bad = [];
    if (!x.firstName) bad.push("Vorname"); if (!x.lastName) bad.push("Nachname");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(x.email)) bad.push("E-Mail");
    if (!/^[+0-9 ()\/-]{6,40}$/.test(x.phone)) bad.push("Telefon");
    if (!x.street || !/\d/.test(x.street)) bad.push("Straße und Hausnummer");
    if (!COUNTRIES[x.country]) bad.push("Land (nur Österreich)"); else if (!PLZ[x.country].test(x.zip)) bad.push("PLZ");
    if (!x.city) bad.push("Ort");
    if (x.type === "company" && !x.company) bad.push("Firmenname");
    if (x.type !== "company") { x.company = ""; x.uid = ""; }
    if (bad.length) throw Object.assign(new Error("Bitte prüfen: " + bad.join(", ")), { status: 400, fields: bad });
    return x;
  }
  async function createOrder(input) {   // eine Position (bisherige API /print/api/order)
    const r = await createCheckout(Object.assign({}, input, { items: [input] }));
    return r.priceChanged ? r : { order: r.orders[0], checkoutUrl: r.checkoutUrl, account: r.account };
  }
  // Warenkorb-Checkout: Kunde/Zahlung/Bestätigungen einmal prüfen, je Position eine Bestellung (Gruppe), eine gemeinsame Mollie-Zahlung
  async function createCheckout(input) {
    const cat = await catalog(false), s = await settings();
    if (!cat || !s.open) throw Object.assign(new Error("Der Shop ist gerade nicht verfügbar"), { status: 503 });
    const items = Array.isArray(input.items) ? input.items.slice(0, 30) : []; if (!items.length) throw Object.assign(new Error("Der Warenkorb ist leer"), { status: 400 });
    if (input.acceptTerms !== true || input.acceptFagg !== true || input.acceptProof !== true) throw Object.assign(new Error("Bitte AGB, den Hinweis zum Rücktrittsrecht und die geprüften Druckdaten bestätigen"), { status: 400 });
    const cust = validCustomer(input.customer); cust.feedbackOk = input.feedbackOk === true;   // freiwillig: nach der Lieferung per Mail um Feedback bitten
    let uidRes = null;
    if (cust.type === "company" && cust.uid) { uidRes = await uidCheck(cust.uid); cust.uidValid = !!uidRes.valid; if (uidRes.uid) cust.uid = uidRes.uid; }
    const method = input.payment === "invoice" ? "invoice" : "mollie";
    if (method === "invoice" && !(cust.type === "company" && cust.uidValid)) throw Object.assign(new Error(uidRes && uidRes.unreachable ? "Die UID kann gerade nicht geprüft werden – bitte online bezahlen oder später erneut versuchen" : "Kauf auf Rechnung nur für Firmen mit gültiger UID"), { status: 400 });
    if (method === "mollie" && !cfg().mollieKey) throw Object.assign(new Error("Online-Zahlung ist noch nicht eingerichtet – bitte Rechnung wählen oder uns kontaktieren"), { status: 503 });
    const prepared = [];
    for (let i = 0; i < items.length; i++) {
      const it = Object.assign({}, items[i] || {}, { __disc: input.__disc || [] }), x = await prepItem(it, s, cust, method, uidRes, i, items.length);
      if (x.priceChanged) return { priceChanged: true, price: x.price, index: i };
      prepared.push(x);
    }
    // Konto: angemeldet → verknüpfen; sonst auf Wunsch gleich anlegen (Code per Mail)
    let account = null;
    if (input.__customerId) account = { id: input.__customerId };
    else if (input.createAccount === true && input.accountPassword) { const c = await accountMod().createFromCheckout(cust, String(input.accountPassword)); if (c) account = { id: c.id, created: !c.verified }; }
    const groupId = prepared.length > 1 ? "G" + Date.now().toString(36).toUpperCase() + rnd(4) : null;
    const check = input.check === "pro" ? "pro" : input.check === "self" ? "self" : "review";   // ohne Angabe (alte Clients): wie bisher prüfen, ohne Aufpreis
    if (check === "pro") {   // Aufpreis einmal je Warenkorb – auf der ersten Position (eigene Rechnungszeile)
      const o0 = prepared[0].o, rate = o0.price.rate || 0, net = r2(PRO_CHECK_GROSS / (1 + rate / 100)), vat = r2(PRO_CHECK_GROSS - net);
      o0.price.checkFee = { gross: PRO_CHECK_GROSS, net, vat }; o0.price.gross = r2(o0.price.gross + PRO_CHECK_GROSS); o0.price.net = r2(o0.price.net + net); o0.price.vat = r2(o0.price.vat + vat); o0.price.margin = r2(o0.price.margin + net);
    }
    for (const x of prepared) {
      const o = x.o; o.check = check; if (account) o.customerId = account.id; if (groupId) { o.groupId = groupId; o.groupSize = prepared.length; }
      if (Array.isArray(x.clientWarn) && x.clientWarn.length) { o.clientChecks = x.clientWarn.slice(0, 10).map(t => clip(t, 300)); }
      hist(o, "Bestellung eingegangen (" + (method === "invoice" ? "Rechnung" : "Mollie") + ", " + (check === "pro" ? "Profi-Datencheck gewünscht" : check === "self" ? "Daten vom Kunden direkt freigegeben" : "Prüfung durch FS Creative") + ")" + (groupId ? " · Warenkorb " + groupId + " mit " + prepared.length + " Positionen" : ""));
      if (o.clientChecks) hist(o, "Hinweise der automatischen Prüfung im Browser: " + o.clientChecks.join(" | "));
      x.fm.orderId = o.id; await store.putFile(x.fm); await store.putOrder(o);
      for (const lid of (x.fm.logos || []).concat(x.fm.motifFiles || [])) { const lm = await store.fileMeta(lid); if (lm && !lm.orderId) { lm.orderId = o.id; await store.putFile(lm); } }
    }
    const orders = prepared.map(x => x.o);
    if (method === "mollie") {
      try { const url = await createPayment(orders); for (const o of orders) { hist(o, "Mollie-Zahlung " + o.payment.mollieId + " erstellt"); await store.putOrder(o); } return { orders, checkoutUrl: url, groupId, account }; }
      catch (e) { for (const x of prepared) { x.fm.orderId = null; await store.putFile(x.fm); x.o.status = "payment_failed"; hist(x.o, "Zahlung konnte nicht gestartet werden: " + e.message); await store.putOrder(x.o); } throw Object.assign(new Error("Zahlung konnte nicht gestartet werden – bitte später erneut versuchen"), { status: 502 }); }
    }
    for (const o of orders) await submitted(o);
    return { orders, groupId, account };
  }
  async function prepItem(input, s, cust, method, uidRes, idx, total) {
    const where = total > 1 ? "Position " + (idx + 1) + ": " : "";
    const fail = (m, st) => Object.assign(new Error(where + m), { status: st || 400 });
    const prod = await findProduct(input.product, s); if (!prod) throw fail("Produkt nicht verfügbar");
    const n = normalizeSel(prod, input);
    const chk = async (fid, tok, label) => {
      const f = await store.fileMeta(String(fid || "")), w = label ? label + ": " : "";
      if (!f || !sigOk("file", f.id, tok)) throw fail(w + "Druckdatei nicht gefunden – bitte erneut hochladen");
      if (f.orderId) throw fail(w + "Diese Druckdatei gehört schon zu einer Bestellung – bitte erneut hochladen", 409);
      if (f.kind === "logo" || (f.kind === "logos") !== isLogo(prod)) throw fail("Bitte die Logos erneut hochladen");
      if (f.product !== prod.key || JSON.stringify(f.sel) !== JSON.stringify(n.fileSel)) throw fail(w + "Die Druckdatei passt nicht mehr zur gewählten Ausführung – bitte erneut hochladen oder gestalten", 409);
      if ((f.checks || []).some(c => c.level === "error")) throw fail(w + "Die Druckdatei hat noch Fehler – bitte korrigieren");
      return f;
    };
    let fm, motifs = null;
    // Mehrere Motive (Sortenmix): Stückzahlen je Motiv = Gesamtauflage; die Druckdateien werden zu einem PDF zusammengeführt (Motiv für Motiv), an Print.com als variants
    if (Array.isArray(input.motifs) && input.motifs.length > 1 && (prod.kind || "flat") === "flat") {
      const ms = input.motifs.slice(0, MAX_MOTIFS); let sum = 0; const list = [];
      for (let i = 0; i < ms.length; i++) { const c = Math.max(1, parseInt(ms[i].copies, 10) || 0); sum += c; list.push({ fm: await chk(ms[i].fileId, ms[i].fileToken, "Motiv " + (i + 1)), copies: c }); }
      if (sum !== n.copies) throw fail("Die Stückzahlen der Motive (" + sum + ") ergeben nicht die Gesamtauflage (" + n.copies + ")");
      const { PDFDocument } = require("pdf-lib"); const doc = await PDFDocument.create(); const pageMap = []; let pg = 1;
      for (let i = 0; i < list.length; i++) { const src = await PDFDocument.load(await store.fileData(list[i].fm.id)); const pages = await doc.copyPages(src, src.getPageIndices()); pages.forEach(x => doc.addPage(x));
        pageMap.push({ page: pages.length > 1 ? pg + "–" + (pg + pages.length - 1) : String(pg), title: "Motiv " + (i + 1) + " (" + list[i].copies + " Stk.)", motif: i + 1, copies: list[i].copies }); pg += pages.length; }
      const t0 = list[0].fm, checks = [{ level: "ok", text: list.length + " Motive zusammengeführt: " + pageMap.map(p => "Seite " + p.page + " = " + p.title).join(", ") + "." }].concat(...list.map((x, i) => (x.fm.checks || []).filter(c => c.level !== "ok").map(c => ({ level: c.level, text: "Motiv " + (i + 1) + ": " + c.text }))));
      fm = await newFile("motifs", "motive.pdf", Buffer.from(await doc.save()), { product: t0.product, sel: t0.sel, size: t0.size, bleed: t0.bleed, sides: t0.sides, pages: pg - 1 }, checks, { pageMap, motifFiles: list.map(x => x.fm.id) });
      motifs = list.map((x, i) => ({ motif: i + 1, copies: x.copies, fileId: x.fm.id, fileName: x.fm.name }));
    } else fm = await chk(input.fileId, input.fileToken, "");
    n.fresh = true;   // an der Kasse: Einkaufspreise höchstens 5 min alt
    const q = await quote(prod, n, cust.country, cust.zip, Object.assign({}, cust, { disc: Array.isArray(input.__disc) ? input.__disc : [] }));
    const exp = parseFloat(input.expectedGross);
    if (!isFinite(exp) || Math.abs(exp - q.gross) > 0.009) return { priceChanged: true, price: publicPrice(q) };
    const id = "P" + Date.now().toString(36).toUpperCase() + rnd(6);
    const o = { id, nr: "D-" + today().slice(2).replace(/-/g, "") + "-" + rnd(4), createdAt: nowIso(), status: method === "invoice" ? "invoice_requested" : "pending_payment",
      product: { key: prod.key, title: prod.title, sku: prod.sku, kind: prod.kind || "flat", group: prod.group || "" }, sel: n.sel,
      custom: n.kind === "banner" ? n.size : undefined, textile: n.textile || undefined, variants: n.variants || (motifs ? motifs.map(m => ({ copies: m.copies })) : undefined), motifs: motifs || undefined, pageMap: fm.pageMap || undefined, logoFiles: fm.logos || undefined, labels: n.labels, copies: n.copies, urgency: n.urgency, pcOptions: n.pcOpts, sides: n.sides, size: n.size, bleed: prod.bleed,
      fileId: fm.id, fileName: fm.name, fileKind: fm.kind, fileChecks: fm.checks || [], customer: cust, uidCheck: uidRes ? { valid: uidRes.valid, name: uidRes.name || "", at: nowIso() } : null,
      price: { net: q.net, vat: q.vat, gross: q.gross, rate: q.rate, taxCase: q.taxCase, taxNote: q.taxNote, deliveryDate: q.deliveryDate, purchase: q.purchase, margin: q.margin, markupPct: q.markupPct, minMarginEur: q.minMarginEur, bonus: q.bonus || undefined },
      payment: { method, status: method === "invoice" ? "invoice" : "open" }, invoice: {}, printcom: {}, mails: {}, history: [],
      consent: { agbVersion: AGB_VERSION, agbAcceptedAt: nowIso(), faggNotice: true, proofConfirmed: true } };
    return { o, fm, clientWarn: Array.isArray(input.clientWarn) ? input.clientWarn : null };
  }
  // Bestellung ist verbindlich (bezahlt bzw. Rechnung gewählt): Rechnungsentwurf, Vorschlag, Push, Mails – dann ggf. automatisch senden
  async function submitted(o) {
    await makeInvoice(o);
    await store.putOrder(o);
    return submittedRest(o);
  }
  // Rechnungs-ENTWURF in der eigenen Buchhaltung (fertiggestellt und gesendet wird erst beim Bestellen bei Print.com)
  async function makeInvoice(o) {
    if (!o.invoice.id && D.createInvoice) {
      try {
        const c = o.customer, name = c.type === "company" ? c.company : c.firstName + " " + c.lastName;
        const posName = o.product.title + " – " + o.copies + " Stück";
        const posText = o.labels.map(l => l[0] + ": " + l[1]).concat(["Lieferzeit: " + (URGENCY_DE[o.urgency] || o.urgency), "inkl. Versand nach " + COUNTRIES[c.country]]).join("\n");
        const r = await D.createInvoice({ contactName: name, email: c.email, uid: c.uidValid ? c.uid : "", street: c.street, zip: c.zip, city: c.city, country: c.country.toLowerCase(), contactPerson: c.type === "company" ? c.firstName + " " + c.lastName : "",
          header: "Rechnung Druckauftrag " + o.nr, reference: o.nr,
          headText: "Vielen Dank für Ihre Bestellung im FS Creative Druckshop (Bestellung " + o.nr + ")." + (o.payment.method === "mollie" && o.payment.mollieId ? " Bezahlt online – Mollie " + o.payment.mollieId + "." : ""),
          footText: (o.price.taxNote ? o.price.taxNote + "\n" : "") + (o.payment.method === "mollie" ? "Der Betrag wurde bereits online bezahlt." : "Zahlbar innerhalb von 14 Tagen ohne Abzug."),
          timeToPay: o.payment.method === "mollie" ? 0 : 14, taxRule: o.price.taxCase === "igl" ? cfg().taxRuleIgl : "",
          items: [{ name: posName, text: posText, qty: 1, priceGross: r2(o.price.gross - (o.price.checkFee ? o.price.checkFee.gross : 0)), taxRate: o.price.rate }].concat(o.price.checkFee ? [{ name: "Profi-Datencheck", text: "Persönliche Prüfung der Druckdaten vor Produktionsstart", qty: 1, priceGross: o.price.checkFee.gross, taxRate: o.price.rate }] : []) });
        o.invoice = { id: r.id, nr: r.nr || "", draft: true, at: nowIso() }; hist(o, "Rechnungsentwurf angelegt" + (r.nr ? " " + r.nr : ""));
      } catch (e) { o.invoice = { error: clip(e.message, 300) }; hist(o, "Rechnungsentwurf fehlgeschlagen: " + e.message); log("Rechnungsentwurf", o.nr, e.message); }
    }
  }
  async function submittedRest(o) {
    if (D.propose) await D.propose({ kind: "print-order", key: "print:" + o.id, title: "Druckauftrag " + o.nr + " prüfen und bei Print.com bestellen · " + (o.customer.company || o.customer.firstName + " " + o.customer.lastName),
      detail: o.product.title + " · " + o.copies + " Stk. · " + (o.payment.method === "invoice" ? "Rechnung (Freigabe nötig)" : "bezahlt") + " · Marge " + eur(o.price.margin), amount: o.price.gross, date: today(), source: "Druckshop", payload: { orderId: o.id } }).catch(e => log("Vorschlag:", e.message));
    if (D.push) D.push("lead", { title: "Neuer Druckauftrag " + o.nr, body: o.product.title + " · " + o.copies + " Stk. · " + eur(o.price.gross) + (o.payment.method === "invoice" ? " · Rechnung – Freigabe nötig" : " · bezahlt"), url: "/admin#print", tag: "print-" + o.id }).catch(() => {});
    if (!o.mails.confirm) {
      o.mails.confirm = await mail(o.customer.email, "Bestellbestätigung " + o.nr + " · FS Creative Druck", "Danke für deine Bestellung!",
        ["Hallo " + o.customer.firstName + ",", "wir haben deine Bestellung erhalten" + (o.payment.method === "mollie" ? " und die Zahlung ist eingegangen." : ". Die Rechnung bekommst du, sobald der Auftrag in Produktion geht.") + (o.check === "review" ? " Bevor gedruckt wird, schauen wir uns deine Druckdaten noch persönlich an – bei Fragen melden wir uns." : o.check === "self" ? " Du hast deine Druckdaten direkt freigegeben – wir geben den Auftrag " + (o.payment.method === "mollie" ? "sofort" : "nach der Freigabe") + " in Produktion." : " Du hast den Profi-Datencheck gewählt: Wir prüfen deine Druckdaten persönlich und melden uns bei Fragen, bevor gedruckt wird.")],
        orderRows(o), ["Den Versand bestätigen wir dir mit Sendungsverfolgung per E-Mail.",
          "Es gelten unsere AGB für den Druckshop (Stand " + deDate(AGB_VERSION) + "), die du bei der Bestellung akzeptiert hast: " + cfg().publicUrl + "/print/agb",
          "Hinweis: Da die Drucksachen nach deinen Vorgaben angefertigt werden, besteht kein Rücktrittsrecht (§ 18 Abs. 1 Z 3 FAGG).",
          "Bei Fragen antworte einfach auf diese Mail."], D.notifyTo) ? nowIso() : null;
      if (D.notifyTo) await mail(D.notifyTo, "Druckshop: neue Bestellung " + o.nr + " – " + eur(o.price.gross), "Neue Bestellung im Druckshop", ["Bitte im Cockpit unter „Druckaufträge“ prüfen und bei Print.com bestellen. Einkauf " + eur(o.price.purchase.total) + ", Marge " + eur(o.price.margin) + "."], orderRows(o).concat([["E-Mail", o.customer.email], ["Telefon", o.customer.phone]].concat(o.customer.uid ? [["UID", o.customer.uid + (o.customer.uidValid ? " (gültig)" : " (nicht bestätigt)")]] : [])), [], o.customer.email);
      await store.putOrder(o);
    }
    const s = await settings();
    const direct = o.check === "self" && !(o.fileChecks || []).some(c => c.level === "error") && !(o.clientChecks || []).some(t => /wird sichtbar unscharf/.test(t));
    if ((s.autoSend || direct) && o.status === "paid") { try { await placeOrder(o.id, direct ? "automatisch (vom Kunden direkt freigegeben)" : "automatisch (Einstellung)"); } catch (e) { hist(o, "Automatisch senden fehlgeschlagen: " + e.message); await store.putOrder(o).catch(() => {}); log("Automatisch senden", o.nr, e.message); } }
  }
  const LOCK = new Set();
  // Referenz am Artikel: Bestellnummer + Seitenzuordnung der Logo-PDF (z. B. „S1 Brust links, S2 Rücken“)
  const itemRef = o => Array.isArray(o.pageMap) && o.pageMap.length ? clip(o.nr + " · " + o.pageMap.map(p => "S" + p.page + " " + p.title).join(", "), 120) : o.nr;
  // Bei Print.com bestellen – nur per Klick im Cockpit (bzw. Einstellung „automatisch“ für bezahlte Bestellungen)
  async function placeOrder(id, by) {
    if (LOCK.has(id)) throw new Error("Wird gerade gesendet");
    LOCK.add(id);
    try {
      const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden");
      if (!(o.status === "paid" || o.status === "invoice_requested" || (o.status === "problem" && !o.printcom.orderNumber))) throw new Error("Status „" + (STATUS_DE[o.status] || o.status) + "“ – kann nicht bestellt werden");
      const fm = await store.fileMeta(o.fileId); if (!fm) throw new Error("Druckdatei fehlt");
      const c = o.customer, base = cfg().publicUrl;
      const addr = { companyName: c.company || undefined, firstName: c.firstName, lastName: c.lastName, fullstreet: c.street, postcode: c.zip, city: c.city, country: c.country, telephone: c.phone, email: c.email };
      const body = { deDuplicationId: o.id, customerReference: o.nr, poNumber: o.nr, webhookUrl: base + "/print/printcom-webhook/" + sig("pchook", o.id) + "/" + encodeURIComponent(o.id),
        billingAddress: billingFs(),
        items: [Object.assign({ sku: o.product.sku, customerReference: itemRef(o), options: o.pcOptions },
          // Textil: Größen-Mix als variants im Artikel (Variantenstruktur laut Doku, vor Livegang mit Testbestellung prüfen)
          Array.isArray(o.variants) && o.variants.length ? { variants: o.variants } : {}, { fileUrl: base + "/print-files/" + fm.id + "/" + sig("pcfile", fm.id) + ".pdf", fileOptions: { isProduction: true }, approveDesign: true,
          senderAddress: Object.assign({}, billingFs(), { vatNr: undefined }), shipments: [{ address: addr, copies: o.copies }] })] };
      let j;
      try { j = await pcApi("POST", "/orders", body, { timeout: 60000 }); }
      catch (e) { o.status = "problem"; o.printcom.error = clip(e.message, 300); hist(o, "Print.com-Bestellung fehlgeschlagen: " + e.message); await store.putOrder(o); throw e; }
      const r = firstOf(j);
      o.printcom = { orderNumber: String(r.orderNumber || (r.items && r.items[0] && r.items[0].orderNumber) || ""), at: nowIso(), by: by || "Cockpit", total: +r.orderTotal || +r.grandTotal || null, status: String((r.items && r.items[0] && r.items[0].status) || r.status || "") };
      o.status = "ordered"; hist(o, "Bei Print.com bestellt (" + (by || "Cockpit") + ")" + (o.printcom.orderNumber ? " – Auftrag " + o.printcom.orderNumber : ""));
      await store.putOrder(o);
      // Rechnung fertigstellen und an den Kunden senden
      if (o.invoice.id && !o.invoice.sentAt && D.sendInvoice) {
        try { await D.sendInvoice(o.invoice.id, o.customer.email, "Rechnung zu deiner Druckbestellung " + o.nr + " · FS Creative",
          "Hallo " + o.customer.firstName + ",\n\ndein Druckauftrag " + o.nr + " ist jetzt in Produktion. Anbei die Rechnung" + (o.payment.method === "mollie" ? " (bereits bezahlt)." : " – zahlbar innerhalb von 14 Tagen.") + "\n\nVielen Dank!\n\nFreundliche Grüße\nSimon Felder\nFS Creative");
          o.invoice.sentAt = nowIso(); o.invoice.draft = false; hist(o, "Rechnung fertiggestellt und an " + o.customer.email + " gesendet");
        } catch (e) { o.invoice.sendError = clip(e.message, 300); hist(o, "Rechnung senden fehlgeschlagen: " + e.message); }
        await store.putOrder(o);
      }
      return o;
    } finally { LOCK.delete(id); }
  }
  async function rejectOrder(id, reason, refund) {
    const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden");
    if (["ordered", "in_production", "shipped", "delivered"].indexOf(o.status) > -1) throw new Error("Schon bei Print.com bestellt – dort stornieren bzw. Gutschrift manuell");
    if (o.status === "rejected") throw new Error("Schon abgelehnt");
    if (refund && o.payment.method === "mollie" && o.payment.status === "paid" && !o.payment.refund) {
      const rf = await mollie("POST", "/payments/" + encodeURIComponent(o.payment.mollieId) + "/refunds", { amount: { currency: "EUR", value: o.price.gross.toFixed(2) }, description: "Erstattung Druckauftrag " + o.nr });
      o.payment.refund = { id: String(rf.id || ""), status: String(rf.status || ""), at: nowIso(), amount: o.price.gross }; hist(o, "Erstattung über Mollie veranlasst (" + eur(o.price.gross) + ")");
    }
    if (o.invoice.id && o.invoice.draft && D.deleteInvoice) { try { await D.deleteInvoice(o.invoice.id); o.invoice.deleted = nowIso(); hist(o, "Rechnungsentwurf gelöscht"); } catch (e) { o.invoice.deleteError = clip(e.message, 200); } }
    o.status = "rejected"; o.rejectReason = clip(reason, 500); hist(o, "Abgelehnt" + (reason ? ": " + reason : ""));
    await store.putOrder(o);
    if (o.status === "rejected" && o.payment.status !== "open") await mail(o.customer.email, "Deine Druckbestellung " + o.nr + " · FS Creative", "Deine Bestellung konnte leider nicht gedruckt werden",
      ["Hallo " + o.customer.firstName + ",", "leider können wir deine Bestellung " + o.nr + " so nicht in Druck geben." + (o.rejectReason ? " Grund: " + o.rejectReason : ""), o.payment.refund ? "Den Betrag von " + eur(o.price.gross) + " erstatten wir dir über den gewählten Zahlungsweg – das dauert meist ein paar Werktage." : ""].filter(Boolean),
      [], ["Melde dich gern, dann finden wir gemeinsam eine Lösung."], D.notifyTo);
    return o;
  }
  // Mollie-Webhook: nie dem Inhalt trauen, sondern die Zahlung bei Mollie abrufen
  async function mollieWebhook(paymentId) {
    if (!/^tr_[A-Za-z0-9]{4,40}$/.test(paymentId)) return;
    const pay = await mollie("GET", "/payments/" + paymentId);
    const md = (pay && pay.metadata) || {};
    if (md.groupId) {   // Warenkorb: eine Zahlung für mehrere Bestellungen
      const ids = String(md.orderIds || "").split(",").filter(Boolean).slice(0, 30), orders = [];
      for (const id of ids) { const x = await store.getOrder(id); if (x && x.groupId === md.groupId && (x.payment.attempts || [x.payment.mollieId]).indexOf(paymentId) > -1) orders.push(x); }
      if (!orders.length) { log("Webhook: unbekannte Gruppenzahlung", paymentId); return; }
      const st = String(pay.status || ""), sum = Math.round(orders.reduce((a, x) => a + x.price.gross, 0) * 100) / 100, amt = pay.amount && parseFloat(pay.amount.value);
      for (const x of orders) {
        if (st === "paid" && x.payment.status !== "paid") {
          if (!(Math.abs(amt - sum) < 0.005) || (pay.amount && pay.amount.currency !== "EUR")) { x.payment.status = "mismatch"; hist(x, "Zahlung " + paymentId + " mit falschem Betrag " + (pay.amount && pay.amount.value)); await store.putOrder(x); continue; }
          x.payment.status = "paid"; x.payment.mollieId = paymentId; x.payment.paidAt = String(pay.paidAt || nowIso()); x.payment.methodDetail = clip(pay.method, 40);
          if (x.status === "pending_payment" || x.status === "payment_failed") x.status = "paid";
          hist(x, "Zahlung eingegangen (Mollie " + paymentId + ", Warenkorb " + md.groupId + ")"); await store.putOrder(x); await submitted(x);
        } else if (["canceled", "expired", "failed"].indexOf(st) > -1 && x.payment.status !== "paid" && paymentId === x.payment.mollieId) { x.payment.status = st; if (x.status === "pending_payment") x.status = "payment_failed"; hist(x, "Zahlung " + st); await store.putOrder(x); }
      }
      return;
    }
    const oid = md.orderId; const o = oid && await store.getOrder(String(oid));
    if (!o || (o.payment.attempts || [o.payment.mollieId]).indexOf(paymentId) < 0) { log("Webhook: unbekannte Zahlung", paymentId); return; }
    const st = String(pay.status || "");
    if (st === "paid" && o.payment.status !== "paid") {
      const amt = pay.amount && parseFloat(pay.amount.value);
      if (!(Math.abs(amt - o.price.gross) < 0.005) || (pay.amount && pay.amount.currency !== "EUR")) { o.payment.status = "mismatch"; hist(o, "Zahlung " + paymentId + " mit falschem Betrag " + (pay.amount && pay.amount.value)); await store.putOrder(o); return; }
      o.payment.status = "paid"; o.payment.mollieId = paymentId; o.payment.paidAt = String(pay.paidAt || nowIso()); o.payment.methodDetail = clip(pay.method, 40);
      if (o.status === "pending_payment" || o.status === "payment_failed") o.status = "paid";
      hist(o, "Zahlung eingegangen (Mollie " + paymentId + ")"); await store.putOrder(o);
      await submitted(o);
    } else if (["canceled", "expired", "failed"].indexOf(st) > -1 && o.payment.status !== "paid" && paymentId === o.payment.mollieId) {
      o.payment.status = st; if (o.status === "pending_payment") o.status = "payment_failed"; hist(o, "Zahlung " + st); await store.putOrder(o);
    } else if (pay.amountRefunded && parseFloat(pay.amountRefunded.value) > 0 && o.payment.refund && o.payment.refund.status !== "refunded") { o.payment.refund.status = "refunded"; await store.putOrder(o); }
  }
  const carrierOf = url => { const h = (String(url).match(/^https?:\/\/([^/]+)/) || [])[1] || ""; return /dhl/i.test(h) ? "DHL" : /dpd/i.test(h) ? "DPD" : /ups/i.test(h) ? "UPS" : /gls/i.test(h) ? "GLS" : /fedex|tnt/i.test(h) ? "FedEx/TNT" : /post\.at|austrianpost/i.test(h) ? "Österreichische Post" : /postnl/i.test(h) ? "PostNL" : ""; };
  // Status/Tracking bei Print.com abrufen (alle 2 h für offene Sendungen, auf Klick / Webhook von Print.com)
  const PC_DONE = { SHIPPED: "shipped", INTRANSIT: "shipped", DELIVERED: "delivered" };
  const PC_PROBLEM = /CANCELED|REFUSED|REJECTED|ERROR|RETURN/;
  async function pollOrder(o) {
    if (!o.printcom || !o.printcom.orderNumber) return o;
    const r = firstOf(await pcApi("GET", "/orders/" + encodeURIComponent(o.printcom.orderNumber)));
    const items = Array.isArray(r.items) ? r.items : [];
    const st = String((items[0] && items[0].status) || r.status || "").toUpperCase();
    const tracks = [], info = [], addT = (url, code, carrier) => { url = String(url || ""); if (!/^https?:\/\//.test(url) || tracks.indexOf(url) > -1) return; tracks.push(url); info.push({ url, code: clip(code || "", 60), carrier: clip(carrier || carrierOf(url), 40) }); };
    (Array.isArray(r.shipments) ? r.shipments : []).forEach(s => (s.tracks || []).forEach(t => { if (t) addT(t.trackUrl || t.url, t.trackingNumber || t.trackAndTraceCode || t.code || t.number, t.carrier || s.carrier || s.carrierName); }));
    items.forEach(it => { if (it) addT(it.trackingUrl || it.trackUrl, it.trackingNumber || it.trackAndTraceCode, it.carrier); });
    const before = o.status;
    o.printcom.status = st; o.printcom.checkedAt = nowIso(); if (tracks.length) { o.printcom.tracks = tracks.slice(0, 5); o.printcom.trackInfo = info.slice(0, 5); }
    if (PC_DONE[st]) o.status = PC_DONE[st];
    else if (PC_PROBLEM.test(st)) o.status = "problem";
    else if (st && ["ordered", "problem"].indexOf(o.status) > -1) o.status = "in_production";
    if (o.status !== before) hist(o, "Print.com-Status: " + st);
    if ((o.status === "shipped" || o.status === "delivered") && !o.mails.shipped) {
      o.mails.shipped = await mail(o.customer.email, "Deine Drucksachen sind unterwegs · " + o.nr, "Deine Bestellung ist versendet",
        ["Hallo " + o.customer.firstName + ",", "deine Bestellung " + o.nr + " (" + o.product.title + ", " + o.copies + " Stk.) ist gedruckt und auf dem Weg zu dir."],
        tracks.map((t, i) => ["Sendungsverfolgung" + (tracks.length > 1 ? " " + (i + 1) : ""), t]), tracks.length ? [] : ["Die Sendungsverfolgung schicken wir dir nach, sobald sie verfügbar ist."], D.notifyTo) ? nowIso() : null;
      if (o.mails.shipped) { hist(o, "Versandmail gesendet"); if (tracks.length) o.mails.tracking = o.mails.shipped; }
    } else if (o.mails.shipped && !o.mails.tracking && tracks.length) {   // Versandmail ging ohne Tracking raus → Tracking nachschicken
      o.mails.tracking = await mail(o.customer.email, "Sendungsverfolgung zu deiner Bestellung · " + o.nr, "Hier kannst du dein Paket verfolgen",
        ["Hallo " + o.customer.firstName + ",", "für deine Bestellung " + o.nr + " (" + o.product.title + ") ist jetzt die Sendungsverfolgung verfügbar."],
        info.map((t, i) => [(t.carrier || "Sendungsverfolgung") + (t.code ? " · " + t.code : "") + (info.length > 1 ? " (" + (i + 1) + ")" : ""), t.url]), ["Die Zustellung kann in Einzelfällen auch erst am darauffolgenden Werktag erfolgen."], D.notifyTo) ? nowIso() : null;
      if (o.mails.tracking) hist(o, "Sendungsverfolgung per Mail nachgeschickt");
    }
    await store.putOrder(o);
    return o;
  }
  async function feedbackMails() {
    const all = await store.listOrders(); let n = 0;
    for (const o of all) {
      if (!o.customer || o.customer.feedbackOk !== true || !o.mails || !o.mails.shipped || o.mails.feedback || (o.feedback && o.feedback.product)) continue;
      const age = Date.now() - Date.parse(o.mails.shipped); if (!(age > 4 * 864e5 && age < 30 * 864e5) || ["shipped", "delivered"].indexOf(o.status) < 0) continue;
      const link = cfg().publicUrl + "/print?bestellung=" + encodeURIComponent(o.id) + "&t=" + encodeURIComponent(sig("order", o.id)) + "#feedback";
      o.mails.feedback = await mail(o.customer.email, "Wie gefallen dir deine Drucksachen? · " + o.nr, "Kurze Frage zu deiner Bestellung",
        ["Hallo " + o.customer.firstName + ",", "deine Bestellung " + o.nr + " (" + o.product.title + ", " + o.copies + " Stk.) sollte inzwischen bei dir sein. Wie zufrieden bist du damit? Deine Bewertung (1–5 Sterne, dauert 20 Sekunden) hilft uns sehr."],
        [["Jetzt bewerten", link]], ["Du bekommst diese Mail, weil du bei der Bestellung zugestimmt hast, nach der Lieferung um Feedback gebeten zu werden. Es folgt keine weitere Erinnerung."]) ? nowIso() : "skip";
      hist(o, o.mails.feedback !== "skip" ? "Feedback-Mail gesendet" : "Feedback-Mail fehlgeschlagen"); await store.putOrder(o); n++;
      if (n >= 30) break;
    }
    return n;
  }
  async function pollAll() {
    const all = await store.listOrders(); let n = 0;
    for (const o of all) {
      if (!o.printcom || !o.printcom.orderNumber) continue;
      if (o.status === "delivered" || o.status === "rejected") continue;
      if (o.status === "shipped" && o.mails.shipped && Date.now() - Date.parse(o.printcom.at) > 30 * 864e5) continue;
      try { await pollOrder(o); n++; } catch (e) { log("Status", o.nr, e.message); }
    }
    return n;
  }
  async function cleanupFiles() {
    const files = await store.listFiles(); let n = 0;
    for (const f of files) if (!f.orderId && Date.now() - Date.parse(f.createdAt) > (f.kind === "draft" ? 60 : f.kind === "brief" ? 180 : 3) * 864e5) { await store.delFile(f.id); n++; }
    return n;
  }
  let lastDaily = 0;
  let lastTrack = 0;
  // Vorwärmen (alle 2 h, niedrige Priorität): Hauptprodukte in der Standard-Ausführung samt Aufpreisen kurzer Optionen und Produktionszeiten –
  // die Print.com-Antworten liegen dann im Zwischenspeicher (3 h) und Preise/Aufpreise erscheinen beim Öffnen sofort
  // ── Startseite: „Heute im Fokus“ und „Neu im Sortiment“ täglich prüfen – nur Produkte mit abrufbarem Preis, Bild und ohne bekannten teureren Mitbewerberpreis zeigen ──
  const FOCUS_POOL = ["postcards", "plakate", "folder", "tshirt-basic", "tshirt-bio", "rollups", "mesh-banner", "bauzaun", "aufkleber", "visitenkarten", "printed-letterheads", "blocknotes"];
  let HOME = null, homeRun = false;
  const BEST_SEL = { size: ["a5", "a4", "a6", "us_large", "bc", "bc_plus"], material: ["135gr_gesatineerd_mc", "170gr_gesatineerd_mc", "135gr_silk_mc", "350gr_silk_mc", "350gr_gesatineerd_mc", "300gr_silk_mc"], printtype: ["44"] },
    BEST_POSTER = { size: ["a2", "a1", "a3", "a0"], material: ["135gr_gesatineerd_mc", "170gr_gesatineerd_mc", "115gr_blueback"], printtype: ["40"] };
  function bestSel(p, base) {   // wie app.js beim Öffnen eines Produkts: Format, Papier, Druck auf den ersten lieferbaren Bestseller
    let sel = Object.assign({}, p.defaults || {}); const poster = /plakat|poster|wahlplakat/i.test(p.key + " " + p.title);
    for (const k of ["size", "material", "printtype"]) { const pr = (p.props || []).find(x => x.slug === k); if (!pr) continue;
      for (const v of ((poster && BEST_POSTER[k]) || BEST_SEL[k]).filter(x => pr.options.some(o => o.slug === x)).slice(0, 4)) {
        const t = Object.assign({}, sel, { [k]: v }); try { if (!normalizeSel(p, Object.assign({}, base, { sel: t })).excluded) { sel = t; break; } } catch (e) {} } }
    return sel;
  }
  function stdInput(p) {   // Standard-/Bestseller-Ausführung wie im Shop vorausgewählt
    if (p.kind === "textile") { const m = (p.methods || [])[0], sz = (p.sizes || []).find(x => /(^|_)m$/i.test(x.slug)) || (p.sizes || [])[0]; return m && sz ? { copies: 10, textile: { method: m.key, positions: m.positions.slice(0, 1), sizes: { [sz.slug]: Math.max(10, m.min || 1) } } } : null; }
    const T = p.tiers || [], bt = (/plakat|poster/i.test(p.key + " " + p.title) ? [5, 10, 25] : [250, 500, 1000]).filter(x => T.indexOf(x) > -1);
    const big = p.kind === "banner" || /^(outdoor-advertising|indoor-interior|displays-pos-material|outdoor-furniture)$/.test((p.cat && p.cat.main) || p.group || "");
    const base = { copies: bt.indexOf(500) > -1 ? 500 : bt[0] || (T[0] === 1 && big ? 1 : T[Math.min(1, T.length - 1)]), sel: {}, urgency: "standard", custom: p.kind === "banner" && p.custom ? { w: 200, h: 100 } : undefined };
    base.sel = bestSel(p, base); return base;
  }
  async function homeCheck() {
    if (homeRun) return; homeRun = true;
    try {
      const s = await settings(), cat = await catalog(false), pub = publicCatalog(cat, s, await catalogAll().catch(() => null)), byKey = {}; pub.forEach(x => { byKey[x.key] = x; });
      const day = today(), checks = [];
      const check = async (key, area) => { const pp = byKey[key]; if (!pp) return null; const r = { key, title: pp.title, area, img: !!pp.img, ok: false, why: "" };
        if (!pp.img) { r.why = "kein Produktbild"; checks.push(r); return r; }
        try { const p = await findProduct(key, s); const inp = p && stdInput(p); if (!inp) throw new Error("keine Standard-Ausführung");
          const n = normalizeSel(p, inp); n.low = true; const q = await quote(p, n, "AT", "", {});
          Object.assign(r, { ok: true, gross: q.gross, net: q.net, copies: n.copies, purchase: q.purchase.total, margin: q.margin, pct: q.net ? r2(q.margin / q.net * 100) : 0, anchor: q.anchor || null, rule: q.rule });
          if (q.anchor && q.gross > q.anchor + 0.5) { r.ok = false; r.why = "teurer als Mitbewerber (" + eur(q.anchor) + ")"; }
        } catch (e) { r.why = clip(e.message, 120); }
        checks.push(r); return r; };
      // Fokus: Pool täglich neu gemischt, die ersten 4 geprüften
      let seed = +day.replace(/-/g, "") % 233280; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      const pool = FOCUS_POOL.filter(k => byKey[k] && k !== "flyer" && k !== "pvc-banner").map(k => [k, rnd()]).sort((a, b) => a[1] - b[1]).map(x => x[0]), focus = [];
      for (const k of pool) { if (focus.length >= 4) break; const r = await check(k, "Fokus"); if (r && r.ok) focus.push(k); }
      // Neu im Sortiment: die neuesten Produkte mit Bild, geprüft – die ersten 4, die bestehen
      const fresh = [], newest = pub.filter(x => x.added && x.img && focus.indexOf(x.key) < 0 && x.key !== "flyer" && x.key !== "pvc-banner").sort((a, b) => b.added.localeCompare(a.added)).slice(0, 10);
      for (const x of newest) { if (fresh.length >= 4) break; const r = await check(x.key, "Neu"); if (r && r.ok) fresh.push(x.key); }
      HOME = { date: day, at: nowIso(), focus, fresh, checks };
      await store.setMeta("print_home", HOME).catch(() => {});
      log("Druckshop: Startseite geprüft – Fokus " + focus.join(", ") + " · Neu " + fresh.join(", ") + " · " + checks.filter(c => !c.ok).length + " aussortiert");
    } finally { homeRun = false; }
  }
  // ── Öffentliche Preise für Suchmaschinen & KI-Assistenten (/print/preise, /llms.txt, Produktseiten, Website-Chat) ──
  // Standard-Ausführung (wie im Shop vorausgewählt), typische Mengen, Endpreis inkl. 20 % USt und Versand nach Österreich; alle 6 h im Hintergrund (niedrige Priorität)
  let PUB = null, pubRun = false, lastPub = 0;
  const PUB_Q = { flat: [100, 250, 500, 1000, 2500, 5000], banner: [1, 2, 5], promo: [100, 250, 500, 1000], textile: [10, 25, 50] };
  async function pubBuild() {
    if (pubRun) return; pubRun = true;
    try {
      const s = await settings(), cat = await catalog(false), pub = publicCatalog(cat, s, await catalogAll().catch(() => null)), byKey = {}; pub.forEach(x => { byKey[x.key] = x; });
      const h = await homeState(), keys = CURATED.map(c => c.key).concat((h && h.focus) || [], (h && h.fresh) || []).filter((k, i, a) => a.indexOf(k) === i && byKey[k]);
      const items = [];
      for (const key of keys) {
        const p = await findProduct(key, s).catch(() => null), base = p && stdInput(p); if (!base) continue;
        const okQ = n => p.kind === "textile" ? n >= (((p.methods || [])[0] || {}).min || 1) : p.qty && p.qty.length ? p.qty.some(r => qtyIn(r, n)) : (p.tiers || []).indexOf(n) > -1;
        const big = p.kind === "banner" || /^(outdoor-advertising|indoor-interior|displays-pos-material|outdoor-furniture)$/.test((p.cat && p.cat.main) || p.group || "") || /roll|bauzaun|banner/i.test(p.key);
        let qs = (big ? PUB_Q.banner : PUB_Q[p.kind] || PUB_Q.flat).filter(okQ).slice(0, 4); if (!qs.length) qs = [base.copies];
        const rows = []; let label = "";
        for (const q of qs) {
          const inp = JSON.parse(JSON.stringify(base)); inp.copies = q; if (inp.textile) { const sz = Object.keys(inp.textile.sizes)[0]; inp.textile.sizes = { [sz]: q }; }
          try { const n = normalizeSel(p, inp); n.low = true; const qt = await quote(p, n, "AT", "", {}); rows.push({ copies: n.copies, gross: qt.gross, net: qt.net });
            if (!label) label = (n.labels || []).filter(l => !/Druckverfahren|Zuschnitt|^Bündelung/i.test(l[0]) && !/^(ohne|nein|keine?)$/i.test(String(l[1]).trim())).map(l => l[1]).slice(0, 5).join(" · "); } catch (e) {}
        }
        if (!rows.length || (rows.length > 1 && rows.every(r => Math.abs(r.gross - rows[0].gross) < 0.01))) { if (rows.length > 1) log("Preisübersicht: " + key + " ausgelassen (gleicher Preis für alle Mengen)"); continue; }
        const x = byKey[key]; items.push({ key, title: x.title, group: (x.cat && x.cat.mainName) || "", label: clip(label, 180), desc: clip(x.desc || "", 160), img: x.img || "", kind: p.kind, rows });
      }
      if (items.length) { PUB = { at: nowIso(), items }; await store.setMeta("print_pub", PUB).catch(() => {}); }
      log("Druckshop: Preisübersicht aktualisiert (" + items.length + " Produkte)");
    } finally { pubRun = false; }
  }
  async function pubState() { if (!PUB) PUB = await store.getMeta("print_pub").catch(() => null); return PUB; }
  const SITE = "https://www.fs-creative.at";
  const eurDe = n => (Math.round(n * 100) / 100).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const pieceDe = (g, n) => n > 1 ? (g / n < 1 ? (Math.round(g / n * 1000) / 1000).toLocaleString("de-AT", { minimumFractionDigits: 3 }) : (Math.round(g / n * 100) / 100).toLocaleString("de-AT", { minimumFractionDigits: 2 })) + " €" : "";
  const dateDe = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("de-AT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Vienna" }); };
  function offersLd(it) {
    const url = SITE + "/print?produkt=" + encodeURIComponent(it.key), g = it.rows.map(r => r.gross);
    return { "@type": "Product", name: it.title, description: it.label || it.desc, url, image: it.img || undefined, brand: { "@type": "Brand", name: "FS Creative" }, category: it.group || undefined,
      offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: Math.min.apply(null, g).toFixed(2), highPrice: Math.max.apply(null, g).toFixed(2), offerCount: it.rows.length,
        offers: it.rows.map(r => ({ "@type": "Offer", price: r.gross.toFixed(2), priceCurrency: "EUR", availability: "https://schema.org/InStock", url, eligibleQuantity: { "@type": "QuantitativeValue", value: r.copies, unitText: "Stück" },
          priceSpecification: { "@type": "UnitPriceSpecification", price: r.gross.toFixed(2), priceCurrency: "EUR", valueAddedTaxIncluded: true }, shippingDetails: { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: "0", currency: "EUR" }, shippingDestination: { "@type": "DefinedRegion", addressCountry: "AT" } }, seller: { "@type": "Organization", name: "FS Creative" } })) } };
  }
  // Kurzfassung für den Website-Chat (Systemkontext) und llms.txt
  function pubLines(max) { const P = PUB; if (!P || !P.items) return [];
    return P.items.slice(0, max || 40).map(it => "- " + it.title + (it.label ? " (" + it.label + ")" : "") + ": " + it.rows.map(r => r.copies.toLocaleString("de-AT") + " Stk. " + eurDe(r.gross)).join(" · ") + " – " + SITE + "/print?produkt=" + encodeURIComponent(it.key)); }
  function chatPrices() { const L = pubLines(30); if (!L.length) return "";
    return "\n\nDruckshop-Preisliste (Stand " + dateDe(PUB.at) + "; Endpreise inkl. 20 % USt und Versand innerhalb Österreichs, Standard-Ausführung – andere Ausführungen und Mengen zeigt der Konfigurator sofort):\n" + L.join("\n"); }
  async function llmsTxt() {
    const P = await pubState(), L = pubLines(40);
    return ["# FS Creative", "", "> Kreativ- und Digitalagentur von Simon Felder aus Gaschurn im Montafon (Vorarlberg, Österreich): Websites, Grafikdesign, Druck & Werbemittel – mit eigenem Online-Druckshop für ganz Österreich.", "",
      "## Online-Druckshop: " + SITE + "/print",
      "- Über 900 Druckprodukte: Flyer, Visitenkarten, Plakate, Folder, Broschüren, Briefpapier, Banner (PVC, Mesh, Vlies), Roll-ups, Aufkleber, Textilien und Werbeartikel",
      "- Preis sofort im Konfigurator – Endpreise inkl. 20 % USt und Versand innerhalb Österreichs; Firmen sehen auf Wunsch Nettopreise",
      "- Online-Designer mit Vorlagen und KI-Assistent oder Upload der Druckdatei (PDF, JPG, PNG) mit automatischem Datencheck; optional Profi-Datencheck (5 €)",
      "- Bezahlung online (u. a. Kreditkarte, Apple Pay, EPS, PayPal), Firmen mit UID auch auf Rechnung; Bonusprogramm für Firmenkunden",
      "- Voraussichtlicher Liefertermin wird vor der Bestellung angezeigt; Sendungsverfolgung im Kundenkonto", "",
      "## Aktuelle Beispielpreise" + (P ? " (Stand " + dateDe(P.at) + ")" : ""), "Endpreise inkl. 20 % USt und Versand nach Österreich, jeweils die im Shop vorausgewählte Standard-Ausführung:", ""].concat(L.length ? L : ["- Preise siehe " + SITE + "/print/preise"], ["",
      "Vollständige Preisübersicht: " + SITE + "/print/preise", "",
      "## Weitere Seiten", "- So geht’s & FAQ zum Druckshop: " + SITE + "/print/hilfe", "- AGB Druckshop: " + SITE + "/print/agb", "- Leistungen der Agentur: " + SITE + "/leistungen", "- Kontakt: " + SITE + "/kontakt", ""]).join("\n");
  }
  // Preisübersicht als eigene, ohne JavaScript lesbare Seite
  async function pricesPage(req, res) {
    let html = ""; try { html = fs.readFileSync(path.join(__dirname, "print.html"), "utf8"); } catch (e) { return D.send(res, 404, "Not found"); }
    const P = await pubState(), items = (P && P.items) || [], groups = [];
    items.forEach(it => { let g = groups.find(x => x.n === it.group); if (!g) groups.push(g = { n: it.group || "Weitere Produkte", l: [] }); g.l.push(it); });
    const card = it => '<div class="pp-c"><h3><a href="/print?produkt=' + escH(encodeURIComponent(it.key)) + '">' + escH(it.title) + "</a></h3>" + (it.label ? '<p class="pp-l">' + escH(it.label) + "</p>" : "") +
      '<table class="pp-t"><thead><tr><th>Menge</th><th>Endpreis inkl. USt &amp; Versand</th><th>pro Stück</th></tr></thead><tbody>' + it.rows.map(r => "<tr><td>" + r.copies.toLocaleString("de-AT") + " Stk.</td><td><b>" + eurDe(r.gross) + "</b></td><td>" + (pieceDe(r.gross, r.copies) || "–") + "</td></tr>").join("") + "</tbody></table>" +
      '<a class="pp-go" href="/print?produkt=' + escH(encodeURIComponent(it.key)) + '">Andere Ausführung oder Menge konfigurieren →</a></div>';
    const faq = [["Sind die Preise Endpreise?", "Ja. Alle Preise sind Endpreise inklusive 20 % österreichischer Umsatzsteuer und Versand innerhalb Österreichs. Firmen können sich im Shop Nettopreise anzeigen lassen; die Rechnung weist die Umsatzsteuer aus."],
      ["Warum kann mein Preis abweichen?", "Die Tabelle zeigt die im Shop vorausgewählte Standard-Ausführung. Andere Formate, Papiere, Veredelungen, Mengen oder eine schnellere Produktion ändern den Preis – der Konfigurator zeigt ihn sofort an."],
      ["Wie aktuell sind die Preise?", "Die Übersicht wird mehrmals täglich automatisch aus dem Shop aktualisiert" + (P ? " (Stand " + dateDe(P.at) + ")" : "") + ". Verbindlich ist der Preis im Konfigurator bzw. in der Kasse."],
      ["Wird meine Druckdatei geprüft?", "Jede Datei wird beim Hochladen automatisch geprüft (Format, Beschnitt, Auflösung, Seitenzahl). Auf Wunsch sieht sich ein Profi die Daten vor dem Druck persönlich an (Profi-Datencheck, 5 €)."],
      ["Wohin wird geliefert?", "In ganz Österreich. Den voraussichtlichen Liefertermin siehst du vor der Bestellung; in Einzelfällen kann die Zustellung auch erst am darauffolgenden Werktag erfolgen."]];
    const main = '<main id="main"><div class="wrap ps-helppage pp">' +
      '<section class="lhero ps-hero"><span class="eyebrow">Druckshop · Preise</span><h1>Druckpreise im Überblick</h1><p class="lead">Endpreise inkl. 20 % USt und Versand innerhalb Österreichs für die meistgewählte Ausführung' + (P ? " – Stand " + escH(dateDe(P.at)) : "") + '. Den Preis für deine Wunsch-Ausführung siehst du sofort im <a href="/print">Konfigurator</a> – über 900 Produkte.</p></section>' +
      (groups.length ? groups.map(g => '<section class="sect"><h2>' + escH(g.n) + '</h2><div class="pp-g">' + g.l.map(card).join("") + "</div></section>").join("") : '<section class="sect"><p class="lead">Die Preisübersicht wird gerade erstellt – den Preis siehst du jederzeit sofort im <a href="/print">Konfigurator</a>.</p></section>') +
      '<section class="sect"><h2>Häufige Fragen zu den Preisen</h2><div class="faq">' + faq.map(f => "<details><summary>" + escH(f[0]) + "</summary><p>" + escH(f[1]) + "</p></details>").join("") + "</div></section>" +
      '<section class="sect"><div class="btn-row"><a class="btn primary" href="/print">Zum Druckshop</a><a class="btn" href="/print/hilfe">So geht’s &amp; FAQ</a></div></section>' +
      '<style>.pp-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.pp-c{padding:18px 20px;border-radius:18px;border:1px solid var(--border,rgba(255,255,255,.1));background:var(--surface)}.pp-c h3{margin:0 0 4px;font-size:18px}.pp-c h3 a{color:inherit;text-decoration:none}.pp-l{margin:0 0 10px;font-size:13px;color:var(--text-dim)}.pp-t{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}.pp-t th{text-align:left;font-weight:600;font-size:12px;color:var(--text-dim);padding:4px 0}.pp-t td{padding:6px 0;border-top:1px solid var(--border,rgba(255,255,255,.08))}.pp-t th:not(:first-child),.pp-t td:not(:first-child){text-align:right}.pp-go{display:inline-block;margin-top:10px;font-weight:600;font-size:14px}</style>' +
      "</div></main>";
    const ld = [{ "@context": "https://schema.org", "@type": "ItemList", name: "Druckpreise FS Creative Druckshop", itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, item: offersLd(it) })) },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(f => ({ "@type": "Question", name: f[0], acceptedAnswer: { "@type": "Answer", text: f[1] } })) }];
    html = html.replace(/(\/print\/(?:app\.js|print\.css))\?v=[\w.-]+/g, "$1?v=" + ASSET_V).replace(/<main id="main">[\s\S]*<\/main>/, () => main)
      .replace(/<title>[^<]*<\/title>/, "<title>Druckpreise im Überblick – Flyer, Visitenkarten, Banner &amp; mehr | FS Creative Druckshop</title>")
      .replace(/(<meta name="description" content=")[^"]*/, "$1Aktuelle Endpreise inkl. 20 % USt und Versand in Österreich: Flyer, Visitenkarten, Plakate, Folder, Banner, Roll-ups, Aufkleber, Textilien und Werbeartikel im Online-Druckshop von FS Creative.")
      .replace(/<link rel="canonical" href="[^"]*"/, '<link rel="canonical" href="' + SITE + '/print/preise"').replace(/(<meta property="og:url" content=")[^"]*/, "$1" + SITE + "/print/preise")
      .replace(/<script src="\/print\/app\.js[^"]*" defer><\/script>/, '<script>try{var c=JSON.parse(localStorage.getItem("fsc-print-cart")||"null");var n=c&&Date.now()-c.at<2592e6&&c.items?c.items.length:0;document.querySelectorAll("[data-cart-n]").forEach(function(b){b.textContent=n||"";b.hidden=!n;});}catch(e){}</script>')
      .replace(/<script>try\{window\.__catP[\s\S]*?<\/script>/, "")
      .replace("</head>", '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, "\\u003c") + "</script>\n</head>");
    return D.sendGz(req, res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache" });
  }
  // Produktseite (/print?produkt=…): Inhalte schon im HTML – für Suchmaschinen und KI-Crawler ohne JavaScript; der Konfigurator ersetzt sie beim Laden
  async function productSeo(html, key) {
    const s = await settings(), cat = await catalog(false).catch(() => null), pub = publicCatalog(cat, s, await catalogAll().catch(() => null)), x = pub.find(y => y.key === key); if (!x) return html;
    const P = await pubState(), it = P && P.items ? P.items.find(y => y.key === key) : null, url = SITE + "/print?produkt=" + encodeURIComponent(key);
    const cp = cat && (cat.products || []).find(y => y.key === key), full = cp ? productOf(cat, key, s) : (PD_CACHE.get(key) || {}).p || null;
    const specs = full ? [].concat((full.props || []).slice(0, 8).map(pr => [pr.title, pr.options.slice(0, 12).map(o => o.name).join(", ") + (pr.options.length > 12 ? " …" : "")]), (full.specs || []).map(z => [z[0], z[1]])) : [];
    const desc = noHtml(x.about || x.desc || "").replace(/\s+/g, " ").slice(0, 400);
    const block = '<div class="ps-loading ps-seo" id="psLoading"><article style="padding:24px 0">' + crumbsHtml(x.cat, x.title) + '<p class="eyebrow">FS Creative Druckshop' + (x.cat && x.cat.mainName ? " · " + escH(x.cat.mainName) : "") + "</p><h1>" + escH(x.title) + " online drucken</h1>" + (desc ? "<p>" + escH(desc) + "</p>" : "") +
      (it ? "<h2>Preise (Stand " + escH(dateDe(P.at)) + ", inkl. 20 % USt und Versand in Österreich)</h2><p>" + escH(it.label) + "</p><ul>" + it.rows.map(r => "<li>" + r.copies.toLocaleString("de-AT") + " Stück: " + eurDe(r.gross) + (r.copies > 1 ? " (" + pieceDe(r.gross, r.copies) + " pro Stück)" : "") + "</li>").join("") + "</ul>" : "<p>Preis inkl. USt und Versand sofort im Konfigurator.</p>") +
      (specs.length ? "<h2>Ausführungen</h2><ul>" + specs.map(z => "<li><b>" + escH(z[0]) + ":</b> " + escH(z[1]) + "</li>").join("") + "</ul>" : "") +
      '<p>Online gestalten oder Druckdatei hochladen, automatischer Datencheck, Lieferung in ganz Österreich. <a href="/print/preise">Alle Preise im Überblick</a></p>' + simHtml(pub, x) + '<p class="pd-muted">Konfigurator wird geladen …</p></article></div>';
    const ld = Object.assign({ "@context": "https://schema.org" }, it ? offersLd(it) : { "@type": "Product", name: x.title, description: desc || x.title, url, image: x.img || undefined, brand: { "@type": "Brand", name: "FS Creative" } });
    if (!ld.image && x.img) ld.image = x.img;
    const t = escH(x.title) + " online drucken – Preis sofort inkl. Versand | FS Creative Druckshop", d = escH((x.title + ": " + (desc || "individuell bedruckt") + "").slice(0, 120) + (it ? " Ab " + eurDe(Math.min.apply(null, it.rows.map(r => r.gross))) + " inkl. USt und Versand." : " Preis sofort im Konfigurator.") + " Online gestalten oder Datei hochladen.");
    return html.replace(/<div class="ps-loading" id="psLoading">[\s\S]*?<\/section><\/div>/, () => block)
      .replace(/<title>[^<]*<\/title>/, "<title>" + t + "</title>").replace(/(<meta name="description" content=")[^"]*/, "$1" + d)
      .replace(/<link rel="canonical" href="[^"]*"/, '<link rel="canonical" href="' + escH(url) + '"').replace(/(<meta property="og:url" content=")[^"]*/, "$1" + escH(url)).replace(/(<meta property="og:title" content=")[^"]*/, "$1" + t)
      .replace(/(<meta property="og:description" content=")[^"]*/, "$1" + d).replace(/(<meta property="og:image" content=")[^"]*/, "$1" + escH(x.img ? x.img.replace(/w=\d+/, "w=1200") : SITE + "/og-image.png"))
      .replace(/<script type="application\/ld\+json">\{"@context": "https:\/\/schema.org", "@type": "BreadcrumbList"[^<]*<\/script>/, () => ldTag(crumbsLd(x.cat, x.title, url)))
      .replace("</head>", ldTag(ld) + "\n</head>");
  }
  // ── SEO für Sortiment und Kategorien (/print?produkte[&kategorie=…[&unter=…]]): vorgerendert mit Links, Brotkrumen, strukturierten Daten ──
  const ldTag = o => '<script type="application/ld+json">' + JSON.stringify(Object.assign({ "@context": "https://schema.org" }, o)).replace(/</g, "\\u003c") + "</script>";
  const catUrl = (main, sub, abs) => (abs ? SITE : "") + "/print?produkte" + (main ? "&kategorie=" + encodeURIComponent(main) : "") + (sub ? "&unter=" + encodeURIComponent(sub) : "");
  const prodUrl = (key, abs) => (abs ? SITE : "") + "/print?produkt=" + encodeURIComponent(key);
  function crumbsHtml(c, last) {
    c = c || {}; const l = ['<a href="/print">Druckshop</a>', '<a href="' + escH(catUrl()) + '">Alle Produkte</a>'];
    if (c.main) l.push('<a href="' + escH(catUrl(c.main)) + '">' + escH(c.mainName || c.main) + "</a>");
    if (c.sub && last) l.push('<a href="' + escH(catUrl(c.main, c.sub)) + '">' + escH(c.subName || c.sub) + "</a>");
    if (last) l.push("<span>" + escH(last) + "</span>");
    return '<nav class="ps-crumbs" aria-label="Pfad">' + l.join(" › ") + "</nav>";
  }
  function crumbsLd(c, last, url) {
    c = c || {}; const L = [["Start", SITE + "/"], ["Druckshop", SITE + "/print"], ["Alle Produkte", catUrl("", "", true)]];
    if (c.main) L.push([c.mainName || c.main, catUrl(c.main, "", true)]); if (c.sub) L.push([c.subName || c.sub, catUrl(c.main, c.sub, true)]); if (last) L.push([last, url]);
    return { "@type": "BreadcrumbList", itemListElement: L.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x[0], item: x[1] })) };
  }
  function simHtml(pub, x) {
    const c = x.cat || {}, l = pub.filter(y => y.key !== x.key && y.cat && y.cat.main === c.main && (!c.sub || y.cat.sub === c.sub)).sort((a, b) => (b.pop || 0) - (a.pop || 0)).slice(0, 12);
    return l.length ? "<h2>Ähnliche Produkte</h2><ul>" + l.map(y => '<li><a href="' + escH(prodUrl(y.key)) + '">' + escH(y.title) + "</a></li>").join("") + "</ul>" : "";
  }
  async function catSeo(html, main, sub) {
    const s = await settings(), cat = await catalog(false).catch(() => null), pub = publicCatalog(cat, s, await catalogAll().catch(() => null)), groups = publicGroups(pub);
    const g = groups.find(x => x.slug === main) || null, sg = g && sub ? g.subs.find(x => x.slug === sub) || null : null;
    const inG = (m, su) => pub.filter(p => p.cat && p.cat.main === m && (!su || p.cat.sub === su));
    let h1, intro, body, items, url, c;
    if (!g) {
      url = catUrl("", "", true); h1 = "Alle Produkte"; c = {};
      intro = pub.length + " Drucksachen und Werbeartikel in " + groups.length + " Kategorien – Preis sofort online, alle Preise inkl. Versand innerhalb Österreichs.";
      body = groups.map(x => '<h2><a href="' + escH(catUrl(x.slug)) + '">' + escH(x.name) + "</a> (" + inG(x.slug).length + ")</h2><ul>" + x.subs.filter(su => inG(x.slug, su.slug).length).map(su => '<li><a href="' + escH(catUrl(x.slug, su.slug)) + '">' + escH(su.name) + "</a> (" + inG(x.slug, su.slug).length + ")</li>").join("") + "</ul>").join("");
      items = pub.filter(p => p.best).slice(0, 20);
    } else {
      const list = inG(g.slug, sg ? sg.slug : "").sort((a, b) => (b.pop || 0) - (a.pop || 0)); url = catUrl(g.slug, sg ? sg.slug : "", true); c = { main: g.slug, mainName: g.name, sub: sg ? sg.slug : "", subName: sg ? sg.name : "" };
      h1 = (sg ? sg.name : g.name) + " online drucken";
      intro = list.length + " Produkte" + (sg ? " in „" + sg.name + "“ (" + g.name + ")" : " in „" + g.name + "“") + ": individuell bedruckt, Preis sofort online, Druckdaten hochladen oder online gestalten – Lieferung in ganz Österreich, Preise inkl. Versand.";
      body = (!sg && g.subs.length > 1 ? "<h2>Bereiche</h2><ul>" + g.subs.filter(su => inG(g.slug, su.slug).length).map(su => '<li><a href="' + escH(catUrl(g.slug, su.slug)) + '">' + escH(su.name) + "</a> (" + inG(g.slug, su.slug).length + ")</li>").join("") + "</ul>" : "") +
        "<h2>Produkte</h2><ul>" + list.slice(0, 400).map(p => '<li><a href="' + escH(prodUrl(p.key)) + '">' + escH(p.title) + "</a>" + (p.desc && !/^individuell bedruckt/i.test(p.desc) ? " – " + escH(clip(noHtml(p.desc), 110)) : "") + "</li>").join("") + "</ul>";
      items = list.slice(0, 60);
    }
    const t = escH(h1 + (g ? " – " + inG(g.slug, sg ? sg.slug : "").length + " Produkte" : " – " + pub.length + " Drucksachen & Werbeartikel") + " | FS Creative Druckshop"), d = escH(intro.slice(0, 158));
    const block = '<div class="ps-loading ps-seo" id="psLoading"><article style="padding:24px 0">' + crumbsHtml(c, "") + "<h1>" + escH(h1) + "</h1><p>" + escH(intro) + "</p>" + body + '<p class="pd-muted">Sortiment wird geladen …</p></article></div>';
    const coll = { "@type": "CollectionPage", name: h1, url, description: intro, isPartOf: { "@type": "WebSite", name: "FS Creative", url: SITE + "/" },
      mainEntity: { "@type": "ItemList", numberOfItems: items.length, itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: prodUrl(p.key, true), name: p.title })) } };
    return html.replace(/<div class="ps-loading" id="psLoading">[\s\S]*?<\/section><\/div>/, () => block)
      .replace(/<title>[^<]*<\/title>/, "<title>" + t + "</title>").replace(/(<meta name="description" content=")[^"]*/, "$1" + d)
      .replace(/<link rel="canonical" href="[^"]*"/, '<link rel="canonical" href="' + escH(url) + '"').replace(/(<meta property="og:url" content=")[^"]*/, "$1" + escH(url)).replace(/(<meta property="og:title" content=")[^"]*/, "$1" + t).replace(/(<meta property="og:description" content=")[^"]*/, "$1" + d)
      .replace(/<script type="application\/ld\+json">\{"@context": "https:\/\/schema.org", "@type": "BreadcrumbList"[^<]*<\/script>/, () => ldTag(crumbsLd(c, "", url)))
      .replace("</head>", ldTag(coll) + "\n</head>");
  }
  // Sitemap: Preisübersicht + Produktseiten (nur mit Bild)
  async function sitemapExtra() {
    const s = await settings(), cat = await catalog(false).catch(() => null), pub = publicCatalog(cat, s, await catalogAll().catch(() => null)), d = today();
    const groups = publicGroups(pub), has = (m, su) => pub.some(p => p.cat && p.cat.main === m && (!su || p.cat.sub === su)), loc = u => "  <url><loc>" + u.replace(/&/g, "&amp;") + "</loc><lastmod>" + d + "</lastmod><changefreq>weekly</changefreq><priority>";
    const cats = [loc(catUrl("", "", true)) + "0.7</priority></url>"].concat(groups.filter(g => has(g.slug)).map(g => loc(catUrl(g.slug, "", true)) + "0.7</priority></url>"),
      [].concat.apply([], groups.map(g => g.subs.filter(su => has(g.slug, su.slug)).map(su => loc(catUrl(g.slug, su.slug, true)) + "0.6</priority></url>")))).join("\n") + "\n";
    return '  <url><loc>' + SITE + '/print/preise</loc><lastmod>' + d + '</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n' + cats +
      pub.filter(x => x.img).map(x => '  <url><loc>' + SITE + "/print?produkt=" + encodeURIComponent(x.key) + "</loc><lastmod>" + d + "</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>").join("\n") + "\n";
  }
  async function homeState() { if (!HOME) HOME = await store.getMeta("print_home").catch(() => null); return HOME; }
  let lastWarm = 0;
  const WARM = ["flyer", "visitenkarten", "plakate", "folder", "pvc-banner", "aufkleber", "postcards", "rollups"];
  async function warmPrices() {
    const s = await settings(), cat = await catalog(false); let n0 = 0;
    for (const key of WARM) {
      const p = productOf(cat, key, s); if (!p || p.kind === "textile" || p.kind === "promo") continue;
      const T = p.tiers || [], bt = (/plakat|poster/i.test(p.key + " " + p.title) ? [5, 10, 25] : [250, 500, 1000]).filter(x => T.indexOf(x) > -1);
      const copies = bt.indexOf(500) > -1 ? 500 : bt[0] || (T[0] === 1 && p.kind === "banner" ? 1 : T[Math.min(1, T.length - 1)]);
      const base = stdInput(p) || { copies, sel: {}, urgency: "standard", custom: p.kind === "banner" && p.custom ? { w: 200, h: 100 } : undefined };
      let q0; try { const n = normalizeSel(p, base); n.low = true; q0 = await quote(p, n, "AT", "", {}); n0++; } catch (e) { continue; }
      const runQ = inp => { let n; try { n = normalizeSel(p, Object.assign({}, base, { pm: q0.pm || "auto" }, inp)); } catch (e) { return Promise.resolve(null); } n.quick = true; n.low = true; return quote(p, n, "AT", "", {}).then(() => { n0++; }, () => null); };
      const jobs = (p.urgency || []).filter(u => u.slug !== "standard").map(u => ({ urgency: u.slug }));
      p.props.forEach(pr => { if (pr.options.length <= 6) pr.options.forEach(o => { if (o.slug !== base.sel[pr.slug]) jobs.push({ sel: Object.assign({}, base.sel, { [pr.slug]: o.slug }) }); }); });
      for (let i = 0; i < jobs.length; i += 3) await Promise.all(jobs.slice(i, i + 3).map(runQ));
    }
    log("Druckshop: Preise vorgewärmt (" + n0 + " Kalkulationen)");
  }
  async function tick() {
    if (cfg().pcKey) homeState().then(h => { if (!h || h.date !== today()) homeCheck().catch(e => log("Startseiten-Check:", e.message)); });   // täglich: Fokus & Neu prüfen
    if (cfg().pcKey && live() && Date.now() - lastPub > 6 * 3600e3) { lastPub = Date.now(); setTimeout(() => pubBuild().catch(e => log("Preisübersicht:", e.message)), 5 * 60e3); }   // nach dem Vorwärmen (Cache)
    if (cfg().pcKey && live() && Date.now() - lastWarm > 110 * 60e3) { lastWarm = Date.now(); warmPrices().catch(e => log("Vorwärmen:", e.message)); }
    syncTasks().catch(e => log("Aufträge:", e.message));   // Druckaufträge ↔ Aufträge im Cockpit
    nlMod().tick().catch(() => {});   // Newsletter: Entwurf bereitstellen, ggf. montags versenden (stündlich)
    if (cfg().pcKey && Date.now() - lastTrack > 2 * 3600e3) { lastTrack = Date.now(); pollAll().catch(e => log("Sendungsstatus:", e.message)); }   // Status/Tracking alle 2 h
    try {
      if (Date.now() - lastDaily < 20 * 3600e3) return;
      const m = (await store.getMeta("print_daily").catch(() => null)) || {};
      if (m.at && Date.now() - Date.parse(m.at) < 20 * 3600e3) { lastDaily = Date.parse(m.at); return; }
      lastDaily = Date.now(); await store.setMeta("print_daily", { at: nowIso() });
      if (cfg().pcKey) { await catalog(true).catch(() => null); await pollAll(); }
      await feedbackMails().catch(e => log("Feedback-Mails:", e.message));
      await cleanupFiles();
    } catch (e) { log("Tageslauf:", e.message); }
  }

  // ───────────────────────── HTTP: öffentlich ─────────────────────────
  const { clientIp, hitCounter } = require("./client-ip.js");
  const HITS = hitCounter(20000);
  const limited = (bucket, ip, max, windowMs) => HITS.hit(bucket + "|" + ip, max, windowMs);
  // Rechenintensive PDF-Arbeit (Designer-PDF, Logos, Beschnitt, Upload-Prüfung): höchstens 2 gleichzeitig, weitere warten (max. 12 in der Schlange, 60 s)
  const PDF_SLOTS = { busy: 0, wait: [] };
  function pdfSlot() {
    const release = () => { const w = PDF_SLOTS.wait.shift(); if (w) { clearTimeout(w.t); w.res(release); } else PDF_SLOTS.busy--; };
    if (PDF_SLOTS.busy < 2) { PDF_SLOTS.busy++; return Promise.resolve(release); }
    if (PDF_SLOTS.wait.length >= 12) return Promise.reject(Object.assign(new Error("Gerade sehr viel los – bitte in einer Minute erneut versuchen"), { status: 503 }));
    return new Promise((res, rej) => { const w = { res, t: setTimeout(() => { PDF_SLOTS.wait.splice(PDF_SLOTS.wait.indexOf(w), 1); rej(Object.assign(new Error("Gerade sehr viel los – bitte in einer Minute erneut versuchen"), { status: 503 })); }, 60000) }; PDF_SLOTS.wait.push(w); });
  }
  const withPdf = async fn => { const rel = await pdfSlot(); try { return await fn(); } finally { rel(); } };
  // Entwürfe: je IP höchstens 150 MB pro Tag (Speicher schützen)
  const DRAFT_BYTES = new Map();
  function draftBudget(ip, bytes) { const day = new Date().toISOString().slice(0, 10), o = DRAFT_BYTES.get(ip); const used = o && o.day === day ? o.n : 0;
    if (used + bytes > 150 * 1048576) return false; if (DRAFT_BYTES.size > 5000) DRAFT_BYTES.clear(); DRAFT_BYTES.set(ip, { day, n: used + bytes }); return true; }
  const ipOf = clientIp;   // echte Besucher-IP (Cloudflare/Railway, nicht fälschbar über X-Forwarded-For)
  function sameOrigin(req) {
    if (req.headers["x-print-shop"] !== "1") return false;
    const o = req.headers.origin; if (!o) return true;
    try { const h = new URL(o).host.toLowerCase(); return h === String(req.headers.host || "").toLowerCase() || "https://" + h === String(D.ORIGIN || "").toLowerCase(); } catch (e) { return false; }
  }
  function readBody(req, max) {
    return new Promise((resolve, reject) => {
      const len = parseInt(req.headers["content-length"] || "0", 10); if (len > max) { reject(Object.assign(new Error("Datei zu groß (max. " + Math.round(max / 1048576) + " MB)"), { status: 413 })); req.resume(); return; }
      const chunks = []; let n = 0, dead = false;
      req.on("data", c => { if (dead) return; n += c.length; if (n > max) { dead = true; reject(Object.assign(new Error("Datei zu groß (max. " + Math.round(max / 1048576) + " MB)"), { status: 413 })); req.resume(); return; } chunks.push(c); });
      req.on("end", () => { if (!dead) resolve(Buffer.concat(chunks)); }); req.on("error", e => { if (!dead) reject(e); });
    });
  }
  async function readJson(req, max) { const b = await readBody(req, max); try { return JSON.parse(b.toString("utf8") || "{}"); } catch (e) { throw Object.assign(new Error("bad_json"), { status: 400 }); } }
  function J(res, code, o) { D.send(res, code, JSON.stringify(o), "application/json; charset=utf-8", { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); }
  const orderPublic = o => ({ id: o.id, nr: o.nr, check: o.check || "review", groupSize: o.groupSize || 1, status: o.status, statusText: STATUS_PUB[o.status] || o.status, product: o.product.title, copies: o.copies, labels: o.labels, gross: o.price.gross, net: o.price.net, rate: o.price.rate,
    payment: { method: o.payment.method, status: o.payment.status }, deliveryDate: o.price.deliveryDate, tracks: (o.printcom && o.printcom.tracks) || [],
    trackInfo: (o.printcom && o.printcom.trackInfo) || ((o.printcom && o.printcom.tracks) || []).map(u => ({ url: u, code: "", carrier: carrierOf(u) })), checkedAt: (o.printcom && o.printcom.checkedAt) || "", feedback: { order: !!(o.feedback && o.feedback.order), product: !!(o.feedback && o.feedback.product) }, shippedAt: (o.history || []).filter(h => /Versandmail/.test(h.what)).map(h => h.at)[0] || "", email: o.customer.email.replace(/^(.).*(@.*)$/, "$1…$2") });

  // Startschalter: solange PRINT_SHOP_LIVE nicht "1" ist, ist der Shop für Besucher gesperrt („Bald verfügbar“);
  // im Cockpit angemeldete Admins sehen /print als Vorschau (Banner, noindex). Webhooks und signierte Druckdateien bleiben erreichbar.
  const live = () => process.env.PRINT_SHOP_LIVE === "1" || !!(SETTINGS && SETTINGS.live);   // Railway-Variable oder Schalter im Cockpit
  const liveReady = async () => { if (!SETTINGS) await settings().catch(() => null); return live(); };   // nach Neustart: Einstellungen erst laden
  setTimeout(() => { settings().catch(() => {}); vouchers().catch(() => {}); }, 0);
  // Ansichtsmodus (PRINT_SHOP_VIEW=1, z. B. für die Mollie-Prüfung): Shop, Preise, AGB öffentlich sichtbar – Bestellen noch gesperrt
  const viewOnly = () => !live() && process.env.PRINT_SHOP_VIEW === "1";
  const VIEW_MSG = "Bestellungen sind in Kürze möglich – der Druckshop startet in den nächsten Tagen. Fragen gerne an simon@fs-creative.at.";
  function soonPage(res) {
    const html = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Bald verfügbar — FS Creative</title><link rel="stylesheet" href="/landing.css?v=4"></head><body><main id="main"><div class="wrap"><section class="lhero"><span class="eyebrow">Druck</span><h1>Bald verfügbar.</h1><p class="lead">Diese Seite ist noch nicht öffentlich. Drucksachen gestalten und drucken wir gern persönlich für dich.</p><div class="btn-row"><a class="btn primary" href="/druck">Zu Druck &amp; Print</a><a class="btn ghost" href="/kontakt?von=print&amp;thema=Druck">Anfragen</a></div></section></div></main></body></html>';
    return D.send(res, 404, html, "text/html; charset=utf-8", { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  }
  const ASSET_V = String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || Date.now()).replace(/[^\w.-]/g, "").slice(0, 12);
  // Aktionsbanner in der Kopfzeile: aktiver Gutschein mit banner:true bzw. WILLKOMMEN10 (endet automatisch mit Ablauf/Deaktivierung im Cockpit)
  function promoOf() { const t = today(), ok = x => x && x.active !== false && (!x.until || t <= x.until) && !(x.maxUses && (x.used || 0) >= x.maxUses) && +x.pct > 0, L = Object.values(VOUCHERS || {});
    const v = L.find(x => ok(x) && x.banner === true) || L.find(x => ok(x) && x.banner !== false && /^WILLKOMMEN/i.test(String(x.code || "")));   // im Cockpit markiert, sonst WILLKOMMEN…
    return v ? { code: String(v.code).toUpperCase(), pct: +v.pct, until: v.until || "", once: !!v.perCustomer } : null; }
  function promoHtml(pr) {
    const until = pr.until ? new Date(pr.until + "T12:00:00").toLocaleDateString("de-AT", { day: "numeric", month: "long" }) : "", pct = String(pr.pct).replace(".", ","), c = escH(pr.code);
    return '<div class="ps-promo" id="psPromo" role="region" aria-label="Aktion"><div class="in"><span class="em" aria-hidden="true">🎉</span><span class="tx"><b>' + pct + ' % Willkommensrabatt</b><span class="lg"> auf deine Bestellung</span> – Code:</span>' +
      '<button type="button" class="code" data-promo-copy="' + c + '" aria-label="Code ' + c + ' kopieren"><span>' + c + '</span><i>Kopieren</i></button>' +
      '<span class="sm">' + (pr.once ? "einmal pro Kunde" : "") + (pr.once && until ? " · " : "") + (until ? "gültig bis " + escH(until) : "") + '</span><button type="button" class="x" data-promo-x="' + c + '" aria-label="Banner schließen">×</button></div></div>';
  }
  async function shopPage(req, res, preview, u) {
    let html = ""; try { html = fs.readFileSync(path.join(__dirname, "print.html"), "utf8"); } catch (e) { return D.send(res, 404, "Not found"); }
    const pr = promoOf(); if (pr) html = html.replace('<html lang="de">', '<html lang="de" class="has-promo">').replace("</head>", '<script>try{if(localStorage.getItem("fsc-print-promo-x")==="' + pr.code + '")document.documentElement.classList.add("promo-x")}catch(e){}</script>\n</head>').replace(/<body([^>]*)>/, m => m + promoHtml(pr));
    // Shop-Dateien je Deploy neu laden (sonst bleibt bis zu 1 Std. die alte app.js/print.css im Browser-Cache)
    html = html.replace(/(\/print\/(?:app\.js|print\.css))\?v=[\w.-]+/g, "$1?v=" + ASSET_V).replace("</head>", '<script>window.PRINT_V="' + ASSET_V + '";</script>\n</head>');
    if (preview === "view") html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, nofollow" />')
      .replace(/<body([^>]*)>/, '<body$1><div role="note" style="position:fixed;left:50%;top:calc(var(--nav-h) + 8px);transform:translateX(-50%);z-index:150;background:#ffd60a;color:#1d1d1f;font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:calc(100vw - 32px);text-align:center">Bestellungen sind in Kürze möglich – der Druckshop startet bald</div>');
    else if (preview) html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, nofollow" />')
      .replace(/<body([^>]*)>/, '<body$1><div role="note" style="position:fixed;left:50%;top:calc(var(--nav-h) + 8px);transform:translateX(-50%);z-index:150;background:#ffd60a;color:#1d1d1f;font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.4)">Vorschau – nicht öffentlich (PRINT_SHOP_LIVE ist aus)</div>');
    const pk = u && u.searchParams && String(u.searchParams.get("produkt") || "").slice(0, 120);
    if (pk && /^[\w-]+$/.test(pk) && !isInternal(pk, "")) { try { html = await productSeo(html, pk); } catch (e) { log("Produkt-SEO:", e.message); } }
    else if (u && u.searchParams && u.searchParams.has("produkte")) { const km = String(u.searchParams.get("kategorie") || ""), ks = String(u.searchParams.get("unter") || "");
      if (/^[\w-]{0,80}$/.test(km) && /^[\w-]{0,80}$/.test(ks)) { try { html = await catSeo(html, km, ks); } catch (e) { log("Kategorie-SEO:", e.message); } } }
    return D.sendGz(req, res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache", "X-Robots-Tag": preview ? "noindex, nofollow" : "index, follow" });
  }
  async function handlePublic(req, res, u, p) {
    await settings().catch(() => null);
    const open = live(), view = viewOnly(), admin = !!(D.adminAuthed && D.adminAuthed(req));
    const gated = !(p.indexOf("/print-files/") === 0 || p === "/print/mollie-webhook" || p.indexOf("/print/printcom-webhook/") === 0);
    if (gated && !open && !admin && !view) { if (p.indexOf("/print/api/") === 0) return J(res, 404, { ok: false, error: "not_found" }); return soonPage(res); }
    if (view && !open && !admin && req.method === "POST" && /^\/print\/api\/(order|draft|upload)$/.test(p)) return J(res, 403, { ok: false, error: VIEW_MSG });
    if (p === "/print" || p === "/print/" || p === "/print.html") { if (p !== "/print") return D.send(res, 301, "", "text/plain", { Location: "/print" + (u.search || "") }); return shopPage(req, res, open ? false : (view && !admin) ? "view" : true, u); }
    if ((p === "/print/preise" || p === "/print/preise/") && (req.method === "GET" || req.method === "HEAD")) return pricesPage(req, res);
    try {
      // Druckdatei für Print.com: nur mit Signatur und nur für echte, freigegebene Bestellungen
      let m = p.match(/^\/print-files\/(f[a-f0-9]{24})\/([a-f0-9]{40})\.pdf$/);
      if (m && (req.method === "GET" || req.method === "HEAD")) {
        if (!sigOk("pcfile", m[1], m[2])) return D.send(res, 404, "Not found");
        const fm = await store.fileMeta(m[1]); const o = fm && fm.orderId && await store.getOrder(fm.orderId);
        if (!o || ["ordered", "in_production", "shipped", "delivered", "problem", "paid", "invoice_requested"].indexOf(o.status) < 0) return D.send(res, 404, "Not found");
        const buf = await store.fileData(m[1]); if (!buf) return D.send(res, 404, "Not found");
        return D.send(res, 200, req.method === "HEAD" ? "" : buf, "application/pdf", { "Content-Length": String(buf.length), "Content-Disposition": 'inline; filename="' + o.nr + '.pdf"', "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" });
      }
      if (p === "/print/app.js" || p === "/print/designer.js" || p === "/print/templates.js") {
        let js = ""; try { js = fs.readFileSync(path.join(__dirname, "print", p.slice(7))); } catch (e) { return D.send(res, 404, "Not found"); }
        return D.sendGz(req, res, 200, js, "text/javascript; charset=utf-8", { "Cache-Control": "no-cache" });
      }
      if ((p === "/print/hilfe" || p === "/print/hilfe/") && (req.method === "GET" || req.method === "HEAD")) {
        let html = "", main = ""; try { html = fs.readFileSync(path.join(__dirname, "print.html"), "utf8"); main = fs.readFileSync(path.join(__dirname, "print", "hilfe-main.html"), "utf8"); } catch (e) { return D.send(res, 404, "Not found"); }
        html = html.replace(/(\/print\/(?:app\.js|print\.css))\?v=[\w.-]+/g, "$1?v=" + ASSET_V).replace(/<main id="main">[\s\S]*<\/main>/, () => main).replace(/<title>[^<]*<\/title>/, "<title>So geht’s &amp; FAQ – Druckshop | FS Creative</title>")
          .replace(/(<meta name="description" content=")[^"]*/, "$1So funktioniert der FS Creative Druckshop: bestellen, Online-Designer mit Vorlagen und KI-Assistent, Bonusprogramm für Firmen, Digital- oder Offsetdruck und Antworten auf häufige Fragen.")
          .replace(/https:\/\/www\.fs-creative\.at\/print"/g, 'https://www.fs-creative.at/print/hilfe"').replace(/<script src="\/print\/app\.js[^"]*" defer><\/script>/, '<script>try{var c=JSON.parse(localStorage.getItem("fsc-print-cart")||"null");var n=c&&Date.now()-c.at<2592e6&&c.items?c.items.length:0;document.querySelectorAll("[data-cart-n]").forEach(function(b){b.textContent=n||"";b.hidden=!n;});}catch(e){}</script>')
          .replace('data-hilfe>', 'data-hilfe class="active">').replace(/<script>try\{window\.__catP[\s\S]*?<\/script>/, "");
        return D.sendGz(req, res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache" });
      }
      if (p === "/print/sonderfarben.ase" && (req.method === "GET" || req.method === "HEAD")) {   // Sonderfarben-Palette (Adobe Swatch Exchange) für Weiß, Schnitt, Bohrung, Veredelung
        let b = null; try { b = fs.readFileSync(path.join(__dirname, "print", "sonderfarben.ase")); } catch (e) { return D.send(res, 404, "Not found"); }
        return D.send(res, 200, req.method === "HEAD" ? "" : b, "application/octet-stream", { "Content-Disposition": 'attachment; filename="FS-Creative-Sonderfarben.ase"', "Content-Length": b.length, "Cache-Control": "public, max-age=86400" });
      }
      if (p === "/print/agb.html") return D.send(res, 301, "", "text/plain", { Location: "/print/agb" });
      if ((p === "/print/agb" || p === "/print/agb/") && (req.method === "GET" || req.method === "HEAD")) {
        let html = ""; try { html = fs.readFileSync(path.join(__dirname, "print", "agb.html"), "utf8"); } catch (e) { return D.send(res, 404, "Not found"); }
        const F = Object.assign({}, FIRM_DEFAULT, (D.firm && D.firm()) || {});
        html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => k === "agbVersion" ? deDate(AGB_VERSION) : escH(F[k] != null && String(F[k]).trim() ? F[k] : FIRM_DEFAULT[k] || ""));
        return D.sendGz(req, res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache" });
      }
      if (p === "/print/mollie-webhook" && req.method === "POST") {
        const b = (await readBody(req, 4096)).toString("utf8"); const id = new URLSearchParams(b).get("id") || "";
        try { await mollieWebhook(id); } catch (e) { if (e.status === 404) return D.send(res, 200, "ok"); log("Mollie-Webhook:", e.message); return D.send(res, 500, "retry"); }
        return D.send(res, 200, "ok");
      }
      m = p.match(/^\/print\/printcom-webhook\/([a-f0-9]{40})\/([A-Za-z0-9_-]{6,60})$/);
      if (m && req.method === "POST") {
        await readBody(req, 20000).catch(() => null);
        if (!sigOk("pchook", m[2], m[1])) return D.send(res, 404, "Not found");
        const o = await store.getOrder(m[2]); if (o) await pollOrder(o).catch(e => log("Print.com-Webhook:", e.message));   // Inhalt egal – Status selbst abrufen
        return D.send(res, 200, "ok");
      }
      if (p.indexOf("/print/newsletter/") === 0 || p === "/print/api/newsletter") { const r = await nlMod().handlePublic(req, res, p, u, ipOf(req), J, readJson, sameOrigin); if (r !== false) return; }
      if (p.indexOf("/print/api/") !== 0) return D.send(res, 404, "Not found");
      const ip = ipOf(req);
      // „Wir gestalten für dich“: Briefing mit Konfiguration, Text und Dateien → Anfrage im Cockpit (Lead + Mail an Simon)
      if (p === "/print/api/brief/file" && req.method === "POST") {
        if (!sameOrigin(req)) { req.resume(); return J(res, 403, { ok: false, error: "forbidden" }); }
        if (limited("brief-file", ip, 25, 3600e3)) { req.resume(); return J(res, 429, { ok: false, error: "Zu viele Dateien – bitte später erneut" }); }
        const name = clip(decodeURIComponent(String(req.headers["x-file-name"] || "datei")), 120).replace(/[\\/:*?"<>|]/g, "_") || "datei";
        const ext = (name.match(/\.([a-z0-9]{1,5})$/i) || [])[1] || "";
        if (!BRIEF_EXT.test(ext)) { req.resume(); return J(res, 415, { ok: false, error: "Dateityp nicht erlaubt (PDF, Bilder, AI/EPS/PSD, Word, TXT oder ZIP)" }); }
        const buf = await readBody(req, 15 * 1024 * 1024); if (buf.length < 10) return J(res, 400, { ok: false, error: "Datei ist leer" });
        const meta = { id: "f" + crypto.randomBytes(12).toString("hex"), kind: "brief", name, ext: ext.toLowerCase(), bytes: buf.length, createdAt: nowIso(), orderId: null, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
        await store.putFile(meta, buf);
        return J(res, 200, { ok: true, id: meta.id, token: sig("brief", meta.id), name, bytes: buf.length });
      }
      if (p === "/print/api/brief" && req.method === "POST") {
        if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
        if (limited("brief", ip, 6, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte später erneut" });
        const b = await readJson(req, 30000);
        if (b.website || !(Date.now() - Number(b.t || 0) > 3000)) return J(res, 200, { ok: true });   // Spam-Schutz wie beim Kontaktformular
        const name = clip(b.name, 120), email = clip(b.email, 160).toLowerCase(), phone = clip(b.phone, 60), company = clip(b.company, 160), text = clip(b.text, 4000);
        if (!name || !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(email)) return J(res, 400, { ok: false, error: "Bitte Name und eine gültige E-Mail-Adresse angeben" });
        if (b.consent !== true) return J(res, 400, { ok: false, error: "Bitte die Datenschutz-Einwilligung bestätigen" });
        if (!text && !(Array.isArray(b.files) && b.files.length)) return J(res, 400, { ok: false, error: "Bitte kurz beschreiben, was gestaltet werden soll (oder Dateien anhängen)" });
        const files = [];
        for (const f of (Array.isArray(b.files) ? b.files : []).slice(0, 5)) { const id = String(f && f.id || ""); if (!/^f[a-f0-9]{24}$/.test(id) || !sigOk("brief", id, String(f.token || ""))) continue; const m = await store.fileMeta(id); if (m && m.kind === "brief") files.push(m); }
        const c = b.cfg && typeof b.cfg === "object" ? b.cfg : {}, lab = (Array.isArray(c.labels) ? c.labels : []).slice(0, 14).map(l => clip(l && l[0], 60) + ": " + clip(l && l[1], 120)).filter(x => x.length > 2);
        const msg = ["Gestaltungsanfrage aus dem Druckshop („Wir gestalten für dich“)", "",
          "Produkt: " + clip(c.title || c.product, 120) + (c.copies ? " · " + clip(c.copies, 12) + " Stk." : "") + (c.price ? " · aktueller Druckpreis " + clip(c.price, 40) : ""),
          lab.length ? "Ausführung: " + lab.join(" · ") : "", c.link ? "Konfiguration öffnen: " + clip(c.link, 900) : "", "",
          "Wünsche / Briefing:", text || "(kein Text – siehe Dateien)", "",
          files.length ? "Dateien (" + files.length + ", Download mit Cockpit-Anmeldung):\n" + files.map(m => "- " + m.name + " (" + Math.max(1, Math.round(m.bytes / 1024)) + " KB): " + cfg().publicUrl + "/admin/api/print/brief-file?id=" + m.id).join("\n") : "Keine Dateien angehängt."].filter(x => x !== "").join("\n");
        const L = D.saveLead ? await D.saveLead({ name, email, phone, company, topic: "Grafik & Branding", entwurf: false, message: msg, source: "Druckshop: Gestaltung " + clip(c.title || c.product, 60) }) : null;
        if (!L) return J(res, 500, { ok: false, error: "Konnte nicht gesendet werden – bitte schreib uns an simon@fs-creative.at" });
        for (const m of files) { m.leadId = L.id; m.keepUntil = new Date(Date.now() + 180 * 864e5).toISOString(); await store.putFile(m).catch(() => {}); }
        return J(res, 200, { ok: true });
      }
      if (p.indexOf("/print/api/account/") === 0) {
        if (req.method === "POST" && !sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
        return await accountMod().handle(req, res, p, ip, J, readJson, ordersOfCustomer, bonusOf);
      }
      if (p === "/print/api/catalog" && req.method === "GET") {
        const c = cfg(), s = await settings();
        if (!c.pcKey || !s.open) return J(res, 200, { ok: true, ready: false, reason: !c.pcKey ? "setup" : "closed" });
        const cat = await catalog(false), all = await catalogAll().catch(() => null); cms(false).catch(() => {});   // CMS bei Versionswechsel im Hintergrund auffrischen
        const products = publicCatalog(cat, s, all);
        return J(res, 200, { ok: true, ready: products.length > 0, reason: products.length ? "" : "setup", products: scrubPub(products), groups: publicGroups(products), fonts: FONTS, ai: !!(D.ki && D.ki.printDesignOn && D.ki.printDesignOn()), agbVersion: AGB_VERSION, home: HOME && HOME.date === today() ? { focus: HOME.focus, fresh: HOME.fresh } : null, payments: { mollie: !!c.mollieKey, invoice: true }, countries: Object.keys(COUNTRIES).map(k => ({ code: k, name: COUNTRIES[k] })) });
      }
      // Produktdetails (allgemeine Produkte werden erst beim Öffnen geladen)
      // „ab“-Preise für Produktkarten (Standardausführung, kleinste Auflage), 12 Std. zwischengespeichert
      if (p === "/print/api/from" && req.method === "GET") {
        // Schutz: Anfragen je IP begrenzt, Auswahl nur einfache Werte (begrenzte Größe), Zwischenspeicher mit Obergrenze, Print.com-Abfragen mit niedriger Priorität
        if (limited("from", ip, 150, 600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" });
        const rawSel = String(u.searchParams.get("sel") || "{}"); let sels = {}; if (rawSel.length <= 8000) try { sels = JSON.parse(rawSel) || {}; } catch (e) {}
        if (typeof sels !== "object" || Array.isArray(sels)) sels = {};
        const keys = String(u.searchParams.get("keys") || "").split(",").map(x => x.trim()).filter(x => /^[\w.-]{1,80}$/.test(x)).slice(0, 12), out = {}, s0 = await settings();
        await Promise.all(keys.map(async k => {
          const s1 = sels[k] && typeof sels[k] === "object" && !Array.isArray(sels[k]) ? sels[k] : {}, sel = {};
          Object.keys(s1).slice(0, 30).forEach(x => { if (/^[\w-]{1,60}$/.test(x) && (typeof s1[x] === "string" || typeof s1[x] === "number")) sel[x] = String(s1[x]).slice(0, 80); });
          const qc = parseInt(sel.__copies, 10) || 0, ck = k + JSON.stringify(sel); delete sel.__copies;
          const hit = FROM.get(ck); if (hit && Date.now() - hit.at < 12 * 3600e3) { out[k] = hit.v; return; }
          try { const prod = await findProduct(k, s0); if (!prod || prod.kind === "textile" || prod.kind === "promo") return; const tl = prod.tiers || [], big = prod.kind === "banner" || /^(outdoor-advertising|indoor-interior|displays-pos-material|outdoor-furniture)$/.test((prod.cat && prod.cat.main) || prod.group || ""),
              t = qc && tl.indexOf(qc) > -1 ? qc : tl[0] === 1 && big ? 1 : tl[0] === 1 && tl.indexOf(5) > -1 ? 5 : [500, 250, 100, 50].find(x => tl.indexOf(x) > -1) || tl[0];   // typische Auflage statt kleinster
            const mk = sl => normalizeSel(prod, Object.assign({ copies: t, sel: sl }, prod.kind === "banner" && prod.custom ? { custom: { w: Math.max(prod.custom.minW, 1000) / 10, h: Math.max(prod.custom.minH, 500) / 10 } } : {}));
            // Bestseller-Auswahl (z. B. beidseitig 4/4) ist nicht bei jedem Produkt lieferbar (PVC-Banner) → mit der Standard-Ausführung rechnen
            let n = mk(sel), q; n.low = true; try { q = await quote(prod, n, "AT", "", {}); } catch (e) { if (!Object.keys(sel).length) throw e; n = mk({}); n.low = true; q = await quote(prod, n, "AT", "", {}); } const v = { gross: q.gross, copies: n.copies }; fromSet(ck, { at: Date.now(), v }); out[k] = v; } catch (e) {} }));
        return J(res, 200, { ok: true, from: out });
      }
      if (p === "/print/api/product" && req.method === "GET") {
        if (!cfg().pcKey) return J(res, 503, { ok: false, error: "Der Shop wird gerade eingerichtet" });
        if (limited("product", ip, 300, 600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" });
        const prod = await findProduct(u.searchParams.get("key")); if (!prod) return J(res, 404, { ok: false, error: "Produkt nicht verfügbar" });
        return J(res, 200, { ok: true, product: scrubPub(pubProd(prod)) });
      }
      if (p === "/print/api/template" && req.method === "GET") {
        if (limited("tpl", ip, 80, 600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" });
        const prod = await findProduct(u.searchParams.get("product")); if (!prod) return J(res, 404, { ok: false, error: "Produkt nicht verfügbar" });
        let b = {}; try { b = JSON.parse(String(u.searchParams.get("c") || "{}")) || {}; } catch (e) {}
        const inp = { sel: objOf(b.sel), custom: objOf(b.custom), copies: b.copies || (prod.tiers || [])[0] || (prod.qty && prod.qty[0] && prod.qty[0].min) || 1, textile: b.textile };
        let n; try { n = normalizeSel(prod, inp); } catch (e) { if (prod.kind !== "textile") return J(res, 400, { ok: false, error: e.message }); n = { kind: "textile", positions: prod.positions, labels: [] }; }
        const key = prod.key + JSON.stringify([n.size, n.folds && n.folds.slug, n.sides, n.positions && n.positions.map(x => x.slug), (n.labels || []).map(l => l[1]).join("|").slice(0, 300)]);
        let hit = TPL_CACHE.get(key); if (!hit) { hit = await templatePdf(prod, n); TPL_CACHE.set(key, hit); if (TPL_CACHE.size > 200) TPL_CACHE.delete(TPL_CACHE.keys().next().value); }
        const s0 = hit.sheets[0], nm = ("Druckvorlage_" + prod.title + "_" + (s0 ? Math.round(s0.w + 2 * s0.b) + "x" + Math.round(s0.h + 2 * s0.b) + "mm" : "")).replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, "-");
        return D.send(res, 200, hit.pdf, "application/pdf", { "Content-Disposition": (u.searchParams.get("dl") === "1" ? "attachment" : "inline") + '; filename="' + nm.replace(/[^\x20-\x7e]/g, "_") + '.pdf"; filename*=UTF-8\'\'' + encodeURIComponent(nm) + ".pdf", "Cache-Control": "public, max-age=3600", "X-Robots-Tag": "noindex" });
      }
      m = p.match(/^\/print\/api\/file\/(f[a-f0-9]{24})$/);
      if (m && req.method === "GET") {
        if (!sigOk("file", m[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "not_found" });
        let fm = await store.fileMeta(m[1]); if (!fm) return J(res, 404, { ok: false, error: "not_found" });
        if (u.searchParams.get("pdf") === "1") { const buf = await store.fileData(fm.id); return D.send(res, 200, buf, fm.kind === "logo" && fm.original !== "pdf" ? (fm.original === "png" ? "image/png" : "image/jpeg") : "application/pdf", { "Content-Disposition": 'inline; filename="druckdaten.pdf"', "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" }); }
        fm = await preflightPoll(fm);
        return J(res, 200, Object.assign({ ok: true }, fileView(fm)));
      }
      m = p.match(/^\/print\/api\/draft\/(f[a-f0-9]{24})$/);
      if (m && req.method === "GET") {
        if (!sigOk("draft", m[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "Entwurf nicht gefunden" });
        const fm = await store.fileMeta(m[1]); const buf = fm && fm.kind === "draft" && await store.fileData(m[1]);
        if (!buf) return J(res, 404, { ok: false, error: "Entwurf nicht gefunden (Entwürfe werden nach 60 Tagen gelöscht)" });
        let d = null; try { d = JSON.parse(Buffer.from(buf).toString("utf8")); } catch (e) {}
        return J(res, 200, { ok: true, draft: d });
      }
      // Feedback zur Bestellung (Bestellvorgang direkt danach, Drucksachen nach dem Versand): nur mit gültigem Bestell-Link
      const fbm = p.match(/^\/print\/api\/order\/([A-Za-z0-9_-]{6,60})\/feedback$/);
      if (fbm && req.method === "POST") {
        if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
        if (!sigOk("order", fbm[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "not_found" });
        if (limited("feedback", ip, 20, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const o = await store.getOrder(fbm[1]); if (!o) return J(res, 404, { ok: false, error: "not_found" });
        const b = await readJson(req, 6000), stage = b.stage === "product" ? "product" : "order", rating = parseInt(b.rating, 10), text = clip(String(b.text || "").replace(/\s+/g, " "), 1000);
        if (!(rating >= 1 && rating <= 5)) return J(res, 400, { ok: false, error: "Bitte 1 bis 5 Sterne wählen" });
        if (stage === "product" && ["shipped", "delivered"].indexOf(o.status) < 0) return J(res, 400, { ok: false, error: "Die Drucksachen sind noch nicht unterwegs" });
        if (Date.now() - Date.parse(o.createdAt) > 120 * 864e5) return J(res, 400, { ok: false, error: "Diese Bestellung ist schon zu lange her" });
        o.feedback = o.feedback || {}; const first = !o.feedback[stage]; o.feedback[stage] = { rating, text, at: nowIso() }; hist(o, "Feedback (" + (stage === "product" ? "Drucksachen" : "Bestellung") + "): " + rating + "/5"); await store.putOrder(o);
        if (D.push && (rating <= 3 || (text && first))) D.push("lead", { title: (rating <= 2 ? "⚠️ " : "") + "Feedback " + "★".repeat(rating) + "☆".repeat(5 - rating) + " · " + o.nr, body: (stage === "product" ? "Drucksachen: " : "Bestellvorgang: ") + (text || "ohne Kommentar"), url: "/admin#print", tag: "fb-" + o.id }).catch(() => {});
        return J(res, 200, { ok: true });
      }
      m = p.match(/^\/print\/api\/order\/([A-Za-z0-9_-]{6,60})(\/pay)?$/);
      if (m) {
        if (!sigOk("order", m[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "not_found" });
        const o = await store.getOrder(m[1]); if (!o) return J(res, 404, { ok: false, error: "not_found" });
        if (!m[2] && req.method === "GET") {
          if (u.searchParams.get("refresh") === "1" && o.printcom && o.printcom.orderNumber && ["ordered", "in_production", "shipped", "problem"].indexOf(o.status) > -1
            && (!o.printcom.checkedAt || Date.now() - Date.parse(o.printcom.checkedAt) > 15 * 60e3) && !limited("track", ip, 20, 3600e3)) { try { await pollOrder(o); } catch (e) { log("Tracking", o.nr, e.message); } }
          return J(res, 200, { ok: true, order: orderPublic(o) });
        }
        if (m[2] && req.method === "POST") {
          if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
          if (limited("pay", ip, 10, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
          if (o.payment.method !== "mollie" || o.payment.status === "paid" || ["pending_payment", "payment_failed"].indexOf(o.status) < 0) return J(res, 400, { ok: false, error: "Für diese Bestellung ist keine Zahlung offen" });
          if (Date.now() - Date.parse(o.createdAt) > 3 * 864e5) return J(res, 400, { ok: false, error: "Die Bestellung ist zu alt – bitte neu bestellen" });
          let grp = [o];
          if (o.groupId) { grp = (await store.listOrders()).filter(x => x.groupId === o.groupId && x.payment.method === "mollie" && x.payment.status !== "paid" && ["pending_payment", "payment_failed"].indexOf(x.status) > -1); if (!grp.length) grp = [o]; }
          grp.forEach(x => { x.status = "pending_payment"; }); const url = await createPayment(grp); for (const x of grp) { hist(x, "Neuer Zahlungsversuch " + x.payment.mollieId); await store.putOrder(x); }
          return J(res, 200, { ok: true, checkoutUrl: url });
        }
        return J(res, 405, { ok: false, error: "method_not_allowed" });
      }
      if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
      if (!sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
      if (!cfg().pcKey) return J(res, 503, { ok: false, error: "Der Shop wird gerade eingerichtet" });
      if (p === "/print/api/price") {
        if (limited("price", ip, 240, 600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" });
        const b = await readJson(req, 20000);
        const s = await settings(); const prod = await findProduct(b.product, s); if (!prod) return J(res, 400, { ok: false, error: "Produkt nicht verfügbar" });
        const n = normalizeSel(prod, b);
        const country = String(b.country || "AT").toUpperCase(), zip = String(b.zip || "").trim();
        const cust = { company: b.customerType === "company", uid: String(b.uid || "") };
        const dd = await discFor(await accountMod().current(req), cust.company, b.voucher, ""); cust.disc = dd.disc;
        if (cust.company && cust.uid && country !== "AT") { const r = await uidCheck(cust.uid); cust.uidValid = r.valid; }
        const q = await quote(prod, n, country, COUNTRIES[country] && PLZ[country].test(zip) ? zip : "", cust);
        return J(res, 200, { ok: true, price: publicPrice(q), voucher: dd.voucher ? { code: dd.voucher.code, pct: dd.voucher.pct } : null, voucherErr: dd.voucherErr || "", sides: n.sides, pages: n.pages || null, size: n.size, folds: n.folds, closed: n.closed, bleed: prod.bleed, copies: n.copies, labels: n.labels, positions: n.positions });
      }
      if (p === "/print/api/deltas") {   // Aufpreise je Option („+ 4,20 €“) gegenüber der aktuellen Auswahl – gleiches Druckverfahren, niedrige Priorität, max. 12 je Anfrage
        if (limited("delta", ip, 300, 600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte kurz warten" });
        const b = await readJson(req, 60000);
        const s = await settings(); const prod = await findProduct(b.product, s); if (!prod) return J(res, 400, { ok: false, error: "Produkt nicht verfügbar" });
        const country = String(b.country || "AT").toUpperCase(), zip0 = String(b.zip || "").trim(), zip = COUNTRIES[country] && PLZ[country].test(zip0) ? zip0 : "";
        const cust = { company: b.customerType === "company", uid: String(b.uid || "") };
        const dd = await discFor(await accountMod().current(req), cust.company, b.voucher, ""); cust.disc = dd.disc;
        const busy = pcLow.length > 24 || pcWait.length > 6;   // Andrang: Aufpreise nur aus dem Zwischenspeicher, der Rest kommt ein paar Sekunden später (Client fragt nach)
        const run = (sel, urg) => { const n = normalizeSel(prod, Object.assign({}, b, { sel }, urg ? { urgency: String(urg) } : {})); n.quick = true; n.low = true; n.cacheOnly = busy; return quote(prod, n, country, zip, cust); };   // urg: andere Produktionszeit (Standard/Schnell/Express)
        let base; try { base = await run(b.sel); } catch (e) { return J(res, 200, { ok: true, d: {}, busy: !!e.busy }); }
        const alts = (Array.isArray(b.alts) ? b.alts : []).slice(0, 12), d = {}; let i = 0;
        await Promise.all([0, 1, 2, 3].map(async () => { while (i < alts.length) { const a = alts[i++] || {}, k = String(a.k == null ? "" : a.k).slice(0, 120); if (!k || !a.sel || typeof a.sel !== "object") continue;
          try { const q = await run(a.sel, a.urgency); d[k] = { net: r2(q.net - base.net), gross: r2(q.gross - base.gross), date: q.deliveryDate || "" }; } catch (e) { d[k] = e.busy ? { busy: true } : { off: e.status === 400 }; } } }));
        return J(res, 200, { ok: true, d, busy });
      }
      if (p === "/print/api/ai/design") {
        if (limited("ai", ip, 40, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte später erneut" });
        const b = await readJson(req, 12000); const me = await accountMod().current(req);
        const r = await aiDesign(b, me, ip); return J(res, 200, Object.assign({ ok: true }, r));
      }
      if (p === "/print/api/uid") {
        if (limited("uid", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte später erneut" });
        const b = await readJson(req, 2000); const r = await uidCheck(String(b.uid || ""));
        return J(res, 200, { ok: true, valid: r.valid, uid: r.uid, name: r.name || "", why: r.why || "" });
      }
      if (p === "/print/api/upload") {
        if (limited("upload", ip, 60, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Uploads – bitte später erneut" });
        let input; try { input = JSON.parse(decodeURIComponent(String(req.headers["x-print-config"] || ""))); } catch (e) { input = null; }
        if (!input || typeof input !== "object") { req.resume(); return J(res, 400, { ok: false, error: "Konfiguration fehlt" }); }
        const name = clip(decodeURIComponent(String(req.headers["x-file-name"] || "druck")), 120).replace(/[\\/:*?"<>|]/g, "_");
        await uploadTarget(input).catch(e => { req.resume(); throw e; });
        const rel = await pdfSlot().catch(e => { req.resume(); throw e; }); let meta;
        try { const buf = await readBody(req, MAX_UPLOAD); if (buf.length < 100) return J(res, 400, { ok: false, error: "Datei ist leer" }); meta = await handleUpload(buf, name, input); } finally { rel(); }
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/file/fit" && req.method === "POST") {   // Anpassen: einpassen/füllen, drehen, skalieren, verschieben – immer vom Original aus (neue Datei)
        if (limited("upload", ip, 120, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const b = await readJson(req, 2000), id = String(b.fileId || "");
        if (!sigOk("file", id, String(b.token || ""))) return J(res, 403, { ok: false, error: "Datei nicht gefunden" });
        const fm = await store.fileMeta(id); if (!fm || fm.orderId || fm.kind !== "upload" || !fm.src || !fm.size) return J(res, 400, { ok: false, error: "Für diese Datei nicht möglich" });
        const sm = await store.fileMeta(fm.src), data = sm && await store.fileData(fm.src); if (!data) return J(res, 400, { ok: false, error: "Original nicht mehr vorhanden – bitte Datei neu hochladen" });
        const o = { mode: b.mode === "fit" ? "fit" : "fill", rotate: [0, 90, 180, 270].indexOf(+b.rotate) > -1 ? +b.rotate : 0, scale: Math.min(4, Math.max(0.25, +b.scale || 1)), dx: Math.max(-2000, Math.min(2000, +b.dx || 0)), dy: Math.max(-2000, Math.min(2000, +b.dy || 0)) };
        let r; try { r = await withPdf(() => placeFile(data, sm.original || "pdf", fm.size, +fm.bleed || 0, o, +fm.sides || 1)); } catch (e) { return J(res, 400, { ok: false, error: e.status ? e.message : "Datei konnte nicht angepasst werden" }); }
        const W = fm.size.w + 2 * (+fm.bleed || 0), H = fm.size.h + 2 * (+fm.bleed || 0);
        const checks = (fm.checks || []).filter(c => c.level === "ok" && /dpi|Seite\(n\)|Seiten –/.test(c.text || "") || /Rückseite bleibt weiß|Bild-Upload füllt/.test(c.text || ""));
        checks.unshift({ level: "ok", text: "Angepasst: " + (o.mode === "fit" ? "ganz eingepasst (freie Flächen bleiben weiß)" : "füllt das Format inkl. Beschnitt") + (o.rotate ? " · um " + o.rotate + "° gedreht" : "") + (o.scale !== 1 ? " · " + Math.round(o.scale * 100) + " %" : "") + (o.dx || o.dy ? " · verschoben" : "") + " – Seite " + W + " × " + H + " mm inkl. Beschnitt." });
        if (o.mode === "fill" || o.scale > 1) checks.push({ level: "warn", text: "Bitte in der Vorschau kontrollieren: Inhalte am Rand und im Beschnitt (" + fm.bleed + " mm je Seite) werden abgeschnitten." });
        if (fm.dpi && o.scale > 1) { const d2 = Math.round(fm.dpi / o.scale); if (d2 < 150) checks.push({ level: "warn", text: "Durch die Vergrößerung nur noch ca. " + d2 + " dpi – der Druck kann unscharf wirken." }); }
        const meta = await newFile("upload", String(fm.name || "druck.pdf").replace(/( \(angepasst\))?(\.pdf)?$/i, "") + " (angepasst).pdf", r.pdf, { product: fm.product, sel: fm.sel, size: fm.size, bleed: fm.bleed, sides: fm.sides, pages: fm.pages }, checks, { original: fm.original, src: fm.src, from: fm.id, place: o, px: fm.px, dpi: fm.dpi });
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/file/bleed" && req.method === "POST") {   // Beschnitt automatisch ergänzen (neue Datei, Original bleibt)
        if (limited("upload", ip, 60, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const b = await readJson(req, 2000), id = String(b.fileId || ""), mode = b.mode === "zoom" ? "zoom" : "mirror";
        if (!sigOk("file", id, String(b.token || ""))) return J(res, 403, { ok: false, error: "Datei nicht gefunden" });
        const fm = await store.fileMeta(id); if (!fm || fm.orderId || fm.kind !== "upload" || !fm.size || !(+fm.bleed > 0)) return J(res, 400, { ok: false, error: "Für diese Datei nicht möglich" });
        const data = await store.fileData(id), info = await pdfInfoX(data); if (info.encrypted || !info.media) return J(res, 400, { ok: false, error: "Für diese Datei nicht möglich" });
        if (fits(info.media, fm.size.w + 2 * fm.bleed, fm.size.h + 2 * fm.bleed, 1.2)) return J(res, 400, { ok: false, error: "Die Datei hat bereits Beschnitt" });
        const out = await withPdf(() => addBleed(data, fm.size, +fm.bleed, mode)), multi = (+fm.sides || 1) > 2;
        const checks = [{ level: "ok", text: mode === "zoom" ? "Beschnitt ergänzt: Motiv minimal vergrößert (" + fm.bleed + " mm je Seite) – Inhalte ganz am Rand werden etwas angeschnitten." : "Beschnitt automatisch ergänzt: Randbereiche gespiegelt (" + fm.bleed + " mm je Seite) – dein Motiv bleibt unverändert." }].concat(checkPdf(await pdfInfoX(out), fm.size, +fm.bleed, +fm.sides || 1, multi));
        const meta = await newFile("upload", String(fm.name || "druck.pdf").replace(/(\.pdf)?$/i, "") + " (mit Beschnitt).pdf", out, { product: fm.product, sel: fm.sel, size: fm.size, bleed: fm.bleed, sides: fm.sides, pages: fm.pages }, checks, { original: "pdf", bleedFix: mode, from: fm.id });
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/logos") {
        if (limited("upload", ip, 60, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const lb = await readJson(req, 40000), meta = await withPdf(() => mergeLogos(lb));
        return J(res, 200, Object.assign({ ok: true }, fileView(meta), { pageMap: meta.pageMap }));
      }
      if (p === "/print/api/design") {
        if (limited("upload", ip, 60, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const rel = await pdfSlot().catch(e => { req.resume(); throw e; }); let meta;   // Platz in der Warteschlange vor dem Einlesen (große Anfragen nicht alle gleichzeitig im Speicher)
        try { const b = await readJson(req, MAX_UPLOAD); meta = await handleDesign(b); } finally { rel(); }
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/draft") {
        if (limited("draft", ip, 20, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Entwürfe – bitte später erneut" });
        const b = await readJson(req, 25 * 1024 * 1024);
        const data = JSON.stringify({ product: clip(b.product, 80), sel: b.sel && typeof b.sel === "object" ? b.sel : {}, copies: b.copies, urgency: clip(b.urgency, 20), custom: objOf(b.custom), design: b.design });
        if (data.length > 25 * 1024 * 1024) return J(res, 413, { ok: false, error: "Entwurf zu groß" });
        if (!draftBudget(ip, data.length)) return J(res, 429, { ok: false, error: "Heute wurden schon sehr viele Entwürfe gespeichert – bitte morgen erneut" });
        const meta = { id: "f" + crypto.randomBytes(12).toString("hex"), kind: "draft", name: "entwurf.json", bytes: data.length, createdAt: nowIso(), orderId: null };
        await store.putFile(meta, Buffer.from(data, "utf8"));
        const me = await accountMod().current(req).catch(() => null);   // angemeldet: Entwurf im Kundenkonto merken
        if (me) { const pr = CURATED.find(x => x.key === b.product); await accountMod().addDraft(me, { id: meta.id, t: sig("draft", meta.id), product: clip(b.product, 80), title: pr ? pr.title : clip(b.product, 80), preview: typeof b.preview === "string" ? b.preview : "" }).catch(() => {}); }
        return J(res, 200, { ok: true, id: meta.id, token: sig("draft", meta.id), saved: !!me, url: cfg().publicUrl + "/print?entwurf=" + meta.id + "&t=" + sig("draft", meta.id) });
      }
      if (p === "/print/api/checkout") {   // Warenkorb mit mehreren Positionen
        if (limited("order", ip, 40, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Bestellversuche – bitte später erneut" });
        const b = await readJson(req, 400000); const me = await accountMod().current(req); b.__customerId = me ? me.id : null;
        const dd = await discFor(me, b.customer && b.customer.type === "company", b.voucher, b.customer && b.customer.email);
        if (dd.voucherErr) return J(res, 400, { ok: false, error: dd.voucherErr }); b.__disc = dd.disc;
        const r = await createCheckout(b);
        if (!r.priceChanged && dd.voucher) await useVoucher(dd.voucher.code, b.customer && b.customer.email);
        if (r.priceChanged) return J(res, 409, { ok: false, error: "Der Preis hat sich geändert – bitte den Warenkorb prüfen", price: r.price, index: r.index });
        const o = r.orders[0];
        return J(res, 200, { ok: true, orderId: o.id, nr: o.nr, token: sig("order", o.id), orders: r.orders.map(x => ({ id: x.id, nr: x.nr, token: sig("order", x.id) })), checkoutUrl: r.checkoutUrl || null, accountCreated: !!(r.account && r.account.created) });
      }
      if (p === "/print/api/order") {
        if (limited("order", ip, 40, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Bestellversuche – bitte später erneut" });
        const b = await readJson(req, 40000); { const me = await accountMod().current(req); b.__customerId = me ? me.id : null; const dd = await discFor(me, b.customer && b.customer.type === "company", b.voucher, b.customer && b.customer.email); if (dd.voucherErr) return J(res, 400, { ok: false, error: dd.voucherErr }); b.__disc = dd.disc; b.__voucher = dd.voucher; }
        const r = await createOrder(b);
        if (r.priceChanged) return J(res, 409, { ok: false, error: "Der Preis hat sich geändert – bitte prüfen und erneut bestellen", price: r.price });
        if (b.__voucher) await useVoucher(b.__voucher.code, b.customer && b.customer.email);
        const o = r.order;
        return J(res, 200, { ok: true, orderId: o.id, nr: o.nr, token: sig("order", o.id), checkoutUrl: r.checkoutUrl || null });
      }
      return J(res, 404, { ok: false, error: "not_found" });
    } catch (e) {
      const code = e.status && e.status >= 400 && e.status < 600 ? (e.status === 401 || e.status === 403 ? 502 : e.status) : 500;
      if (code >= 500) log(p, e.message);
      return J(res, code, { ok: false, error: code === 500 ? "Interner Fehler – bitte später erneut versuchen" : String(e.message || e).slice(0, 300), fields: e.fields });
    }
  }

  // ───────────────────────── HTTP: Cockpit (/admin/api/print/…) ─────────────────────────
  function orderSummary(o) {
    return { id: o.id, nr: o.nr, createdAt: o.createdAt, updatedAt: o.updatedAt, status: o.status, statusText: STATUS_DE[o.status] || o.status, review: !!REVIEW[o.status], product: o.product.title, copies: o.copies,
      customer: o.customer.company || (o.customer.firstName + " " + o.customer.lastName), country: o.customer.country, gross: o.price.gross, net: o.price.net, margin: o.price.margin, purchase: o.price.purchase && o.price.purchase.total,
      payment: o.payment.method, paymentStatus: o.payment.status, pcOrder: o.printcom && o.printcom.orderNumber || "", warn: (o.fileChecks || []).some(c => c.level !== "ok") };
  }
  // ── Marge-Übersicht (Cockpit): Beispielrechnungen der kuratierten Produkte (Bestseller-Ausführung, Privatkunde, Lieferung AT) + echte Bestellungen ──
  let MG = null;
  const MG_Q = { flat: [250, 1000, 5000], banner: [1, 5], promo: [100, 500, 1000], textile: [10, 50] };
  function mgCases(p) {
    const ok = n => p.qty && p.qty.length ? p.qty.some(r => qtyIn(r, n)) : (p.tiers || []).indexOf(n) > -1;
    const T = p.tiers || []; let qs = (MG_Q[p.kind] || MG_Q.flat).filter(ok); if (qs.length < 2 && p.kind !== "textile") qs = [T[0], T[Math.min(T.length - 1, 3)], T[T.length - 1] <= 5000 ? T[T.length - 1] : T[Math.min(T.length - 1, 5)]].filter((n, i, a) => n && a.indexOf(n) === i);
    if (p.key === "rollups" || p.key === "pvc-banner" || p.key === "mesh-banner" || p.key === "bauzaun") qs = [1, 5].filter(ok).length ? [1, 5].filter(ok) : qs;
    const custom = p.custom ? { w: p.custom.unit === "cm" ? 200 : 100, h: p.custom.unit === "cm" ? 100 : 100 } : undefined;
    if (p.kind === "textile") { const m = (p.methods || [])[0], sz = (p.sizes || [])[Math.min(3, (p.sizes || []).length - 1)]; if (!m || !sz) return [];
      return [Math.max(10, m.min), 50].filter((n, i, a) => a.indexOf(n) === i).map(n => ({ copies: n, textile: { method: m.key, positions: m.positions.slice(0, 1), sizes: { [sz.slug]: n } } })); }
    return qs.map(n => ({ copies: n, custom, sel: bestSel(p, { copies: n, custom, urgency: "standard" }) }));   // Bestseller-Ausführung wie im Shop
  }
  async function marginsRun() {
    if (MG && MG.running) return; const s = await settings(), cat = await catalog(false);
    const prods = CURATED.map(c => productOf(cat, c.key, s)).filter(Boolean), cases = [];
    prods.forEach((p, pi) => mgCases(p).forEach(x => cases.push([p, x, pi])));
    MG = { running: true, at: nowIso(), done: 0, total: cases.length, rows: [] }; let i = 0;
    await Promise.all([0, 1].map(async () => { while (i < cases.length) { const [p, inp, pi] = cases[i++];
      try { const n = normalizeSel(p, inp); n.low = true; const q = await quote(p, n, "AT", "", { company: false });
        const lab = (n.labels || []).filter(l => /format|größe|material|papier|druck$|banner|system/i.test(l[0])).map(l => l[1]).slice(0, 3).join(" · ");
        MG.rows.push({ o: pi, key: p.key, title: p.title, copies: n.copies, label: clip(lab, 140), pm: q.pm || "", product: q.purchase.product, shipping: q.purchase.shipping, purchase: q.purchase.total, net: q.net, gross: q.gross, fee: q.payFee, margin: q.margin, pct: q.net ? r2(q.margin / q.net * 100) : 0, rule: q.rule, anchor: q.anchor }); }
      catch (e) { MG.rows.push({ o: pi, key: p.key, title: p.title, copies: inp.copies, error: clip(e.message, 120) }); }
      MG.done++; } })).catch(e => log("Marge-Übersicht:", e.message));
    MG.rows.sort((a, b) => a.o - b.o || a.copies - b.copies); MG.running = false; MG.at = nowIso();
  }
  async function marginsState() {
    const s = await settings(), c = cfg(), fee = payFee(), orders = (await store.listOrders()).filter(o => BONUS_COUNTS[o.status] && o.price && o.price.purchase);
    const sum = l => l.reduce((a, o) => { a.n++; a.net += +o.price.net || 0; a.purchase += +o.price.purchase.total || 0; a.fee += +o.price.payFee || 0; a.margin += +o.price.margin || 0; return a; }, { n: 0, net: 0, purchase: 0, fee: 0, margin: 0 });
    const mon = today().slice(0, 7), d30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const r = x => Object.keys(x).reduce((o, k) => { o[k] = k === "n" ? x[k] : r2(x[k]); return o; }, {});
    return { ok: true, rules: { markupPct: s.markupPct != null ? s.markupPct : c.markup, minMarginPct: s.minMarginPct != null ? s.minMarginPct : 10,
        anchorMinPct: s.anchorMinPct != null ? +s.anchorMinPct : 5, anchorGap: s.anchorGap != null ? s.anchorGap : 2, anchors: Object.keys(s.anchors || {}).length, bulkFrom: s.bulkFrom != null ? +s.bulkFrom : 150, bulkTo: s.bulkTo != null ? +s.bulkTo : 1500, bulkFactor: s.bulkFactor != null ? +s.bulkFactor : 0.4,
        feePct: fee.pct, feeFix: fee.fix, proCheck: PRO_CHECK_GROSS, groupMargin: Object.keys(s.groupMargin || {}).filter(k => s.groupMargin[k] != null).map(k => ({ name: groupName(k), pct: s.groupMargin[k] })),
        overrides: Object.keys(s.products || {}).filter(k => s.products[k] && s.products[k].markupPct != null).map(k => ({ key: k, title: (CURATED.find(x => x.key === k) || {}).title || k, pct: s.products[k].markupPct })) },
      home: await homeState(), job: MG ? { running: MG.running, at: MG.at, done: MG.done, total: MG.total } : null, rows: MG ? MG.rows.slice().sort((a, b) => a.o - b.o || a.copies - b.copies) : [],
      orders: { month: r(sum(orders.filter(o => String(o.createdAt || "").slice(0, 7) === mon))), d30: r(sum(orders.filter(o => String(o.createdAt || "") >= d30))), all: r(sum(orders)) } };
  }
  async function adminState() {
    const c = cfg(), s = await settings();
    const orders = await store.listOrders();
    const cat = c.pcKey ? await catalog(false).catch(() => null) : null;
    return { ok: true, live: live(), envLive: process.env.PRINT_SHOP_LIVE === "1", mollieMode: c.mollieKey ? (/^test_/.test(c.mollieKey) ? "test" : "live") : "", configured: { printcom: !!c.pcKey, mollie: !!c.mollieKey, preflight: c.preflight, db: useDb(), base: c.pcBase }, defaults: { markupPct: SETTINGS && SETTINGS.markupPct != null ? SETTINGS.markupPct : c.markup, minMarginEur: SETTINGS && SETTINGS.minMarginEur != null ? SETTINGS.minMarginEur : c.minMargin, envMarkupPct: c.markup, envMinMarginEur: c.minMargin },
      settings: s, groups: mainsList().map(m => ({ slug: m.slug, name: m.name })), catalog: cat ? { at: cat.at, errors: cat.errors || [], products: (cat.products || []).map(p => ({ key: p.key, title: p.title, sku: p.sku, group: p.group, kind: p.kind, props: p.props.map(x => ({ slug: x.slug, title: x.title, options: x.options.map(o => ({ slug: o.slug, name: o.name })) })), tiers: p.tiers })) } : null,
      curated: CURATED.map(x => { const p = cat && (cat.products || []).find(y => y.key === x.key), g = p ? catOf(p.sku, s, p.group, p.cat) : { main: x.group || OTHER }; return { key: x.key, title: x.title, group: groupName(g.main) }; }), review: orders.filter(o => REVIEW[o.status]).length, orders: orders.slice(0, 300).map(orderSummary) };
  }
  async function sortimentState() {
    const s = await settings(), all = await catalogAll().catch(() => null), cat = CAT;
    const cur = {}; ((cat && cat.products) || []).forEach(p => { cur[p.sku] = p; });
    const items = ((all && all.items) || []).map(it => { const cp = cur[it.sku], g = cp ? catOf(it.sku, s, cp.group, cp.cat) : catOf(it.sku, s, it.auto), c = cmsProd(it.sku), sm = SKUS && SKUS.items[it.sku];
      return { sku: it.sku, title: cp ? cp.title : (c && c.n) || it.title, pc: it.title, img: c && c.i ? IMG(c.i, 120) : "", main: g.main, sub: g.sub || "", override: s.catOverride[it.sku] || "", on: shown(s, it.sku, cp ? cp.key : it.sku, g),
        set: s.enabled[it.sku] === true || s.enabled[it.sku] === false ? s.enabled[it.sku] : null, curated: cp ? cp.key : "", kind: cp ? cp.kind : sm ? sm.k : "", custom: !!(sm && sm.cu), min: sm ? sm.m : null }; });
    const en = k => s.catEnabled[k] === true || s.catEnabled[k] === false ? s.catEnabled[k] : null;
    const count = l => ({ total: l.length, on: l.filter(x => x.on).length });
    const ms = mainsList().slice(); items.forEach(x => { if (!ms.some(m => m.slug === x.main)) ms.push({ slug: x.main, name: groupName(x.main), img: "", subs: [] }); });
    const tree = ms.map(m => { const l = items.filter(x => x.main === m.slug); const subs = m.subs.slice(); l.forEach(x => { if (x.sub && !subs.some(y => y.slug === x.sub)) subs.push({ slug: x.sub, name: groupName(x.sub) }); });
      return Object.assign({ slug: m.slug, name: m.name, img: m.img ? IMG(m.img, 120) : "", en: en(m.slug) }, count(l), { subs: subs.map(y => Object.assign({ slug: y.slug, name: y.name, en: en(y.slug) }, count(l.filter(x => x.sub === y.slug)))).filter(y => y.total) }); }).filter(m => m.total);
    return { ok: true, at: all && all.at, cmsAt: CMS && CMS.at, job: JOB, imported: SKUS ? Object.keys(SKUS.items).length : 0, tree, items };
  }
  // Vorschau-Preis im Cockpit (kleinste Auflage, Standard-Auswahl) – nur lesend
  async function previewPrice(sku) {
    try {
      const prod = await findProduct(sku, null, true); if (!prod) return { ok: false, error: "Produkt nicht gefunden" };
      const m = prod.methods && prod.methods[0];
      const input = { copies: prod.tiers[0], custom: { w: 100, h: 100 }, textile: m ? { method: m.key, positions: [m.positions[0]], sizes: { [prod.sizes[0].slug]: m.min } } : null };
      const n = normalizeSel(prod, input), q = await quote(prod, n, "AT", "", {});
      return { ok: true, sku, kind: prod.kind, copies: n.copies, labels: n.labels, gross: q.gross, net: q.net, purchase: q.purchase.total, margin: q.margin };
    } catch (e) { return { ok: false, error: String(e.message || e).slice(0, 300) }; }
  }
  async function handleAdmin(req, res, u, p) {
    try {
      if (p === "/admin/api/print/state" && req.method === "GET") return J(res, 200, await adminState());
      if (p === "/admin/api/print/feedback" && req.method === "GET") {   // Kundenfeedback: Durchschnitt + neueste Bewertungen
        const rows = (await store.listOrders()).filter(o => o.feedback && (o.feedback.order || o.feedback.product)).map(o => ({ id: o.id, nr: o.nr, product: o.product.title, copies: o.copies, name: [o.customer.firstName, o.customer.lastName].join(" ").trim(), company: o.customer.company || "",
          order: o.feedback.order || null, productFb: o.feedback.product || null, at: (o.feedback.product || o.feedback.order).at })).sort((a, b) => a.at < b.at ? 1 : -1);
        const avg = k => { const l = rows.map(r => r[k]).filter(Boolean); return l.length ? { n: l.length, avg: Math.round(l.reduce((a, x) => a + x.rating, 0) / l.length * 10) / 10 } : { n: 0, avg: null }; };
        const asked = (await store.listOrders()).filter(o => o.mails && o.mails.feedback && o.mails.feedback !== "skip").length;
        return J(res, 200, { ok: true, order: avg("order"), product: avg("productFb"), asked, rows: rows.slice(0, 100) });
      }
      if (p === "/admin/api/print/margins") {   // Marge-Übersicht: GET = Stand (startet beim ersten Aufruf bzw. nach 12 h die Beispielrechnung), POST {op:"run"} = neu berechnen
        const mb = req.method === "POST" ? await readJson(req, 1000) : {};
        if (mb.op === "pub" && cfg().pcKey) { await pubBuild(); return J(res, 200, Object.assign(await marginsState(), { pub: (await pubState()) ? { at: PUB.at, n: PUB.items.length } : null })); }   // Preisübersicht jetzt neu erstellen
        if (mb.op === "home" && cfg().pcKey) { homeCheck().catch(e => log("Startseiten-Check:", e.message)); return J(res, 200, Object.assign(await marginsState(), { homeRunning: true })); }
        if (cfg().pcKey && ((mb.op === "run") || !MG || (!MG.running && Date.now() - Date.parse(MG.at) > 12 * 3600e3))) marginsRun().catch(e => { if (MG) MG.running = false; log("Marge-Übersicht:", e.message); });
        return J(res, 200, await marginsState());
      }
      if (p === "/admin/api/print/newsletter") return await nlMod().handleAdmin(req, res, p, J, readJson);
      if (p === "/admin/api/print/customers") {
        const A = accountMod();
        if (req.method === "POST") { const b = await readJson(req, 4000); if (b.op !== "discount") return J(res, 400, { ok: false, error: "op" }); const c = await A.setDiscount(String(b.id || ""), b.pct, b.note); return c ? J(res, 200, { ok: true }) : J(res, 404, { ok: false, error: "Kunde nicht gefunden" }); }
        const list = await A.listAll(), orders = await store.listOrders();
        const out = await Promise.all(list.map(async c => { const mine = orders.filter(o => o.customerId === c.id || (c.verified && o.customer && o.customer.email === c.email)), paid = mine.filter(o => BONUS_COUNTS[o.status]);
          const bo = await bonusOf(c, orders), rev12 = bo.revenue, tier = bo.name;
          return { id: c.id, email: c.email, name: [c.firstName, c.lastName].filter(Boolean).join(" "), company: c.company || "", type: c.type || "private", uid: c.uid || "", phone: c.phone || "", city: [c.zip, c.city].filter(Boolean).join(" "), verified: !!c.verified, createdAt: c.createdAt, lastLogin: c.lastLogin || "",
            orders: mine.length, revenue: r2(paid.reduce((a, o) => a + (+(o.price && o.price.net) || 0), 0)), revenue12: rev12, tier, discountPct: +c.discountPct || 0, discountNote: c.discountNote || "", newsletter: !!c.newsletter, lastOrder: mine.map(o => o.createdAt).sort().pop() || "" }; }));
        return J(res, 200, { ok: true, customers: out.sort((a, b) => String(b.lastOrder || b.createdAt).localeCompare(String(a.lastOrder || a.createdAt))), tiers: BONUS_TIERS });
      }
      if (p === "/admin/api/print/vouchers") {
        const all = await vouchers();
        if (req.method === "POST") {
          const b = await readJson(req, 4000), code = vCode(b.code);
          if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return J(res, 400, { ok: false, error: "Code: 3–40 Zeichen, nur Buchstaben, Ziffern, - und _" });
          if (b.op === "delete") { delete all[code]; await store.setMeta("print_vouchers", all); return J(res, 200, { ok: true }); }
          const pct = parseFloat(String(b.pct).replace(",", ".")); if (!(pct > 0 && pct <= 50)) return J(res, 400, { ok: false, error: "Rabatt 0,1–50 %" });
          const until = /^\d{4}-\d{2}-\d{2}$/.test(String(b.until || "")) ? String(b.until) : "";
          const prev = all[code] || { code, createdAt: nowIso(), used: 0, usedBy: [] };
          all[code] = Object.assign(prev, { pct: Math.round(pct * 10) / 10, maxUses: Math.max(0, parseInt(b.maxUses, 10) || 0), until, perCustomer: b.perCustomer !== false, active: b.active !== false, note: clip(b.note, 200), banner: b.banner === true ? true : b.banner === false ? false : prev.banner });
          if (all[code].banner === true) Object.keys(all).forEach(k => { if (k !== code && (all[k].banner === true || (all[k].banner !== false && /^WILLKOMMEN/i.test(k)))) all[k].banner = false; });   // nur ein Code im Shop-Banner
          await store.setMeta("print_vouchers", all); return J(res, 200, { ok: true, voucher: all[code] });
        }
        return J(res, 200, { ok: true, vouchers: Object.values(all).map(v => Object.assign({}, v, { usedBy: undefined, customers: (v.usedBy || []).length })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
      }
      if (p === "/admin/api/print/order" && req.method === "GET") {
        const o = await store.getOrder(String(u.searchParams.get("id") || "")); if (!o) return J(res, 404, { ok: false, error: "Bestellung nicht gefunden" });
        const fm = await store.fileMeta(o.fileId);
        return J(res, 200, { ok: true, order: o, file: fm ? { id: fm.id, name: fm.name, kind: fm.kind, bytes: fm.bytes, pages: fm.pages, checks: fm.checks, preflight: fm.preflight || null, dpi: fm.dpi || null } : null, statusText: STATUS_DE[o.status] || o.status, autoSend: (await settings()).autoSend });
      }
      // Print.com-Sortiment (nur lesend): alle Produkte bzw. ein Produkt mit Eigenschaften – zum Auswählen fürs Shop-Sortiment
      if (p === "/admin/api/print/pcproducts" && req.method === "GET") {
        const sku = String(u.searchParams.get("sku") || "");
        if (sku && u.searchParams.get("raw") === "1") { if (!/^[a-z0-9_-]{1,80}$/i.test(sku)) return J(res, 400, { ok: false, error: "sku" }); return J(res, 200, { ok: true, raw: await pcApi("GET", "/products/" + encodeURIComponent(sku) + (u.searchParams.get("view") === "plain" ? "" : "?view=reseller")) }); }
        if (sku) { if (!/^[a-z0-9_-]{1,80}$/i.test(sku)) return J(res, 400, { ok: false, error: "sku" }); const pd = await pcApi("GET", "/products/" + encodeURIComponent(sku) + "?view=reseller"); return J(res, 200, { ok: true, product: { sku, bleed: pd.bleed, properties: (pd.properties || []).map(x => ({ slug: x.slug, title: x.title, required: x.required, locked: x.locked, options: (x.options || []).slice(0, 80).map(o => ({ slug: o.slug, name: o.name, width: o.width, height: o.height })) })) } }); }
        const list = await pcApi("GET", "/products"); const items = Array.isArray(list) ? list : (list && (list.items || list.results)) || [];
        return J(res, 200, { ok: true, count: items.length, products: items.map(x => ({ sku: x.sku, title: x.titleSingle || x.titlePlural || x.title || "", plural: x.titlePlural || "", active: x.active, category: x.category || x.categoryName || "" })) });
      }
      // Sortiment: alle Print.com-Produkte mit Kategorie und Freischaltung
      if (p === "/admin/api/print/sortiment" && req.method === "GET") return J(res, 200, await sortimentState());
      if (p === "/admin/api/print/file" && req.method === "GET") {
        const o = await store.getOrder(String(u.searchParams.get("id") || "")); const buf = o && await store.fileData(o.fileId);
        if (!buf) return D.send(res, 404, "Datei nicht gefunden");
        return D.send(res, 200, buf, "application/pdf", { "Content-Disposition": 'inline; filename="' + o.nr + '.pdf"', "Cache-Control": "private, no-store" });
      }
      if (p === "/admin/api/print/brief-file" && req.method === "GET") {
        const id = String(u.searchParams.get("id") || ""), m = /^f[a-f0-9]{24}$/.test(id) ? await store.fileMeta(id) : null; if (!m || m.kind !== "brief") return D.send(res, 404, "Not found");
        const data = await store.fileData(id); if (!data) return D.send(res, 404, "Not found");
        return D.send(res, 200, data, "application/octet-stream", { "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(m.name), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
      }
      if (req.method !== "POST") return J(res, 405, { ok: false, error: "method_not_allowed" });
      const b = await readJson(req, 100000);
      // Preis-Aufschlüsselung wie im Shop (nur lesend): Einkauf Produkt/Versand, Aufschlag, Verkauf; optional Print.com-Optionen überschreiben (pcOverride)
      if (p === "/admin/api/print/quote") {
        const s = await settings(); const prod = await findProduct(b.product, s); if (!prod) return J(res, 400, { ok: false, error: "Produkt nicht verfügbar" });
        const n = normalizeSel(prod, b); if (b.pcOverride && typeof b.pcOverride === "object") { n.pcOpts = Object.assign({}, n.pcOpts, b.pcOverride); n.pcMore = null; n.pmAlts = null; }
        try { const q = await quote(prod, n, "AT", "", { company: false }); return J(res, 200, { ok: true, pcOpts: n.pcOpts, quote: q }); }
        catch (e) { return J(res, 200, { ok: false, error: e.message, pcOpts: n.pcOpts }); }
      }
      // Einkaufspreis testen (nur lesend, keine Bestellung): beliebige SKU + Optionen
      if (p === "/admin/api/print/pcprice") {
        const sku = String(b.sku || ""); if (!/^[a-z0-9_-]{1,80}$/i.test(sku)) return J(res, 400, { ok: false, error: "sku" });
        try { const pr = await pcApi("POST", "/products/" + encodeURIComponent(sku) + "/price", Object.assign({ sku, options: b.options || {}, deliveryPromise: 0 }, Array.isArray(b.variants) ? { variants: b.variants } : {})); return J(res, 200, { ok: true, price: pr }); }
        catch (e) { return J(res, 200, { ok: false, error: e.message, detail: e.detail || null }); }
      }
      if (p === "/admin/api/print/sortiment") {
        if (b.op === "refresh") { await cms(true); await catalogAll(true); await importAll(b.full === true); return J(res, 200, await sortimentState()); }
        if (b.op === "import") { await importAll(b.full === true); return J(res, 200, await sortimentState()); }
        if (b.op === "preview") return J(res, 200, await previewPrice(String(b.sku || "")));
        await sortimentOp(b); PRICE_CACHE.clear(); return J(res, 200, await sortimentState());
      }
      if (p === "/admin/api/print/settings") { const s = await saveSettings(b); PRICE_CACHE.clear(); return J(res, 200, { ok: true, settings: s }); }
      if (p === "/admin/api/print/catalog") { const cat = await catalog(true); return J(res, 200, { ok: true, at: cat && cat.at, errors: (cat && cat.errors) || [], count: cat && cat.products ? cat.products.length : 0 }); }
      if (p === "/admin/api/print/op") {
        if (b.confirm !== true) return J(res, 400, { ok: false, error: "Bestätigung fehlt" });
        const id = String(b.id || ""); const op = String(b.op || "");
        if (op === "place") { const o = await placeOrder(id, "Cockpit"); return J(res, 200, { ok: true, order: o }); }
        if (op === "reject") { const o = await rejectOrder(id, b.reason, b.refund !== false); return J(res, 200, { ok: true, order: o }); }
        if (op === "complete") {   // manuell abschließen (z. B. aus den Aufträgen: „Erledigt“) – erst nach der Bestellung bei Print.com
          const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden");
          if (!(["ordered", "in_production", "shipped"].indexOf(o.status) > -1 || (o.status === "problem" && o.printcom && o.printcom.orderNumber))) throw new Error("Status „" + (STATUS_DE[o.status] || o.status) + "“ – abschließen geht erst nach der Bestellung bei Print.com");
          o.status = "delivered"; o.closedAt = nowIso(); hist(o, "Manuell abgeschlossen" + (b.by ? " (" + clip(b.by, 40) + ")" : "")); await store.putOrder(o); return J(res, 200, { ok: true, order: o });
        }
        if (op === "poll") { const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden"); return J(res, 200, { ok: true, order: await pollOrder(o) }); }
        if (op === "pollAll") return J(res, 200, { ok: true, polled: await pollAll() });
        if (op === "requote") {
          const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden");
          const prod = await findProduct(o.product.key, null, true);
          if (!prod) throw new Error("Produkt nicht mehr im Katalog");
          PRICE_CACHE.clear(); const buy = await purchase(Object.assign({}, prod, { sku: o.product.sku }), { pcOpts: o.pcOptions, urgency: o.urgency }, o.customer.country, o.customer.zip);
          o.price.liveCheck = { at: nowIso(), total: buy.total, product: buy.product, shipping: buy.shipping, margin: r2(o.price.net - buy.total) }; hist(o, "Einkaufspreis neu geprüft: " + eur(buy.total)); await store.putOrder(o);
          return J(res, 200, { ok: true, order: o });
        }
        if (op === "invoice") { const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden"); if (o.invoice.id) throw new Error("Rechnungsentwurf existiert schon"); o.invoice = {}; await makeInvoice(o); await store.putOrder(o); if (o.invoice.error) throw new Error(o.invoice.error); return J(res, 200, { ok: true, order: o }); }
        if (op === "note") { const o = await store.getOrder(id); if (!o) throw new Error("Bestellung nicht gefunden"); o.note = clip(b.note, 2000); await store.putOrder(o); return J(res, 200, { ok: true, order: o }); }
        return J(res, 400, { ok: false, error: "unbekannte Aktion" });
      }
      return J(res, 404, { ok: false, error: "not_found" });
    } catch (e) { return J(res, 200, { ok: false, error: String(e.message || e).slice(0, 300) }); }
  }

  // Abgleich mit den Aufträgen (nach dem Start und stündlich): offene Bestellungen ins Board, Statuswechsel nachziehen
  async function syncTasks() { if (!D.onOrder) return 0; let n = 0;
    for (const o of await store.listOrders()) { if (o.status === "pending_payment" || o.status === "payment_failed") continue;
      if (!REVIEW[o.status] && Date.now() - Date.parse(o.updatedAt || o.createdAt) > 90 * 864e5) continue; toTask(o); n++; }
    return n; }
  // für „Zur Prüfung“: Vorschlag gültig, solange die Bestellung noch auf die Freigabe wartet
  async function proposalValid(orderId) { const o = await store.getOrder(orderId); return !!o && !!REVIEW[o.status]; }

  // Marketing (mkt-posts.js): Produktfotos der freigeschalteten Produkte – Bestseller zuerst, dann nach Beliebtheit; JPG (satori kann kein WebP)
  async function marketingProducts(n) {
    const s = await settings(), pub = publicCatalog(await catalog(false), s, await catalogAll().catch(() => null));
    return pub.filter(p => p.img).map((p, i) => [p, i]).sort((a, b) => (b[0].best ? 1 : 0) - (a[0].best ? 1 : 0) || (b[0].pop || 0) - (a[0].pop || 0) || a[1] - b[1]).slice(0, n || 30)
      .map(x => ({ key: x[0].key, title: x[0].title, desc: x[0].desc || "", img: x[0].img.replace(/fm=webp/, "fm=jpg&q=85").replace(/([?&])w=\d+/, "$1w=1080") }));
  }
  return { llmsTxt, chatPrices, sitemapExtra, live, liveReady, handlePublic, handleAdmin, tick, placeOrder, proposalValid, catalog, syncTasks, marketingProducts, _test: { taxFor, pdfInfo, svgSafe, imgDims, sniff, dimsOf, cmyk, svgPagesToPdf, FONTS, AGB_VERSION, categoryOf, parseProduct, normalizeSel, solveSel, hitRules, CURATED, cmsTrim } };
};
module.exports._bonusCalc = bonusCalc;
