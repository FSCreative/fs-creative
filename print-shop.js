"use strict";
// Online-Druckshop www.fs-creative.at/print – Produktion über die Print.com-API, Zahlung über Mollie oder „Rechnung für Firmen“.
// Grundsatz (Vorgabe Simon): NICHTS wird ohne seine Kontrolle bei Print.com bestellt. Ablauf:
//   Kunde konfiguriert → gestaltet/lädt hoch → bezahlt (Mollie „paid“) oder wählt Rechnung (Firma mit gültiger UID)
//   → Auftrag gespeichert, Rechnungs-ENTWURF in der eigenen Buchhaltung, Vorschlag „Zur Prüfung“ + Push
//   → im Cockpit (Druckaufträge) „Bei Print.com bestellen“ → POST /orders, Rechnung fertigstellen + an Kunden senden
//   → täglich Status/Tracking von Print.com abrufen, Versandmail an den Kunden.
// „Bezahlte Bestellungen automatisch senden“ ist eine Einstellung im Cockpit (Standard AUS).
// Preise: Einkauf live von Print.com (Produkt + Versand) + Aufschlag PRINT_MARKUP_PCT, mindestens PRINT_MIN_MARGIN_EUR Marge –
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
const FIRM_DEFAULT = { name: "FS Creative", owner: "Simon Leonhard Felder", street: "Dorfstraße 3/1", zip: "6793", city: "Gaschurn", uid: "ATU82622967", email: "office@fs-creative.at", phone: "+43 664 1430620" };

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
    products[p.sku] = { n: String(p.productName || "").trim().slice(0, 120), i: A(p.image || p.icon), g: (p.images || []).map(A).filter(Boolean).slice(0, 6), d: String(p.description || "").trim().slice(0, 600), s: String(p.subtitle || p.summary || "").trim().slice(0, 200), pp: +p.popularity || 0 }; });   // pp = Beliebtheit laut Print.com (für „Bestseller“)
  const options = {};
  Object.values(j.option || {}).forEach(o => { if (!o || !o.slug || !o.property || o.property === "summary_image") return; const u = A(o.icon); if (u) options[o.property + "|" + o.slug] = u; });
  const info = Object.values(j.propertyOptionInfo || {}).filter(x => x && x.slug).map(x => ({ s: [String(x.slug)].concat(String(x.multipleSlugs || "").split(/\s+/).filter(Boolean)), p: String(x.product || "").split(/[\s,]+/).filter(Boolean), d: String(x.description || "").replace(/\s+/g, " ").trim().slice(0, 240), i: A(x.image) })).filter(x => x.d || x.i);
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
  { key: "pvc-banner", group: BANNER, cat: BANNER + "/banners-outdoor", kind: "banner", title: "PVC-Banner (Frontlit)", icon: "🏁", desc: "Wetterfestes Werbebanner in Wunschgröße – für Zaun, Fassade und Events.", skus: ["pvc-510"],
    expose: ["material"], fixedOpts: { printtype: "40", all_sides_equal_finish: "yes" }, tiers: [1, 2, 3, 5, 10], designer: true, safe: 30, bleed: 40, dpi: 100, custom: [300, 5000, 3000], prefer: { konfektion: ["hem_eyelets_50"] } },
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
  { key: "kugelschreiber", group: PROMO, kind: "promo", title: "Kugelschreiber", icon: "🖊️", desc: "Kugelschreiber mit vollfarbigem Logo-Druck.", skus: ["pen-apollo-hardcolor"], expose: ["color"], titles: { color: "Farbe" },
    fixedOpts: { printtype: "40", printingmethod: "digital_uv" }, tiers: [50, 150, 500, 2500], areaProp: "printing_size", printArea: [70, 6] },
  { key: "feuerzeug", group: PROMO, kind: "promo", title: "Feuerzeug", icon: "🔥", desc: "Cricket-Feuerzeuge mit deinem Logo.", skus: ["cricket-original"], expose: ["color"], titles: { color: "Farbe" },
    optLabels: { color: { yellow_pms_102c: "Gelb", red_pms_192c: "Rot", blue_pms_2118c: "Blau", "440002_15_black": "Schwarz" } }, fixedOpts: { printtype: "40", printingmethod: "digital_uv" }, tiers: [100, 250, 500, 1000], areaProp: "size", printArea: [60, 15] },
  { key: "schluesselband", group: PROMO, kind: "promo", title: "Schlüsselband", icon: "🔑", desc: "Lanyards mit vollflächigem Druck für Events und Team.", skus: ["subyard-standard"], expose: ["size"], titles: { size: "Breite" },
    optLabels: { size: { "15_x_430_mm": "15 mm", "20_x_430_mm": "20 mm" } }, fixedOpts: { printtype: "40", printingmethod: "sublimation" }, tiers: [50, 100, 250, 500], areaProp: "size", printArea: [20, 430] },
  { key: "baumwolltasche", group: PROMO, kind: "promo", title: "Baumwolltasche", icon: "👜", desc: "Robuste Stofftasche mit deinem Logo im Siebdruck.", skus: ["canvas-tote-bags"], expose: ["color_material", "print_position", "printtype"],
    titles: { color_material: "Farbe", print_position: "Druck auf", printtype: "Farben" }, skipOpts: { printtype: ["00"] }, fixedOpts: { printingmethod: "screen_printing" }, tiers: [50, 100, 250, 500], printArea: [250, 300], prefer: { printtype: ["10"] },
    optLabels: { color_material: { canvas_natural: "Natur", canvas_black: "Schwarz" }, print_position: { front: "Vorderseite", front_and_back_same_print: "Vorder- und Rückseite (gleiches Motiv)" } } },
  { key: "tasse", group: PROMO, kind: "promo", title: "Tasse mit Logo", icon: "☕", desc: "Keramiktasse mit Rundum-Druck – auch als Einzelstück.", skus: ["mugs"], expose: "auto", fixedOpts: { printtype: "40", printingmethod: "sublimation" }, tiers: [1, 2, 6, 12, 24, 36, 48, 72, 144], printArea: [200, 90] },
  { key: "fruchtgummi", group: PROMO, kind: "promo", title: "Fruchtgummi (Werbetütchen)", icon: "🍬", desc: "Vegane Fruchtgummis im bedruckten Werbetütchen.", skus: ["fruit-gummy-vegan-bears"], expose: "auto", fixedOpts: { printtype: "40" }, tiers: [500, 1000, 1500, 2000], areaProp: "size", printArea: [85, 60] },
  { key: "luftballons", group: PROMO, kind: "promo", title: "Luftballons", icon: "🎈", desc: "Bedruckte Luftballons in vielen Farben.", skus: ["balloons"], expose: ["size", "color", "printtype"], titles: { size: "Ballon", color: "Farbe", printtype: "Druck" }, only: { printtype: ["10", "11"] },
    optLabels: { size: { balloon: "Luftballon (Standard)", heart_balloon: "Herzballon", big_balloon_60: "Riesenballon 60 cm", big_balloon_90: "Riesenballon 90 cm" }, printtype: { "10": "1-farbig, einseitig", "11": "1-farbig, beidseitig" } },
    fixedOpts: { printingmethod: "screen_printing" }, tiers: [100, 250, 500, 1000], printArea: [100, 100] },
];
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
const AGB_VERSION = "2026-10-15";
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
  const store = {
    async getOrder(id) { if (!okId(id)) return null; if (useDb()) { const r = await (await db()).query("select data from print_order where id=$1", [id]); return r.rows[0] ? r.rows[0].data : null; } return rdJson(path.join(FDIR(), "orders", id + ".json")); },
    async putOrder(o) { o.updatedAt = nowIso(); if (useDb()) { await (await db()).query("insert into print_order(id,data) values($1,$2::jsonb) on conflict(id) do update set data=excluded.data, updated_at=now()", [o.id, JSON.stringify(o)]); return o; } wrJson(path.join(FDIR(), "orders", o.id + ".json"), o); return o; },
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
    SETTINGS = { anchors: objOf(s.anchors), anchorGap: s.anchorGap != null && isFinite(+s.anchorGap) ? +s.anchorGap : 2, minMarginPct: s.minMarginPct != null && isFinite(+s.minMarginPct) ? +s.minMarginPct : 10, markupPct: s.markupPct != null && isFinite(+s.markupPct) ? +s.markupPct : null, minMarginEur: s.minMarginEur != null && isFinite(+s.minMarginEur) ? +s.minMarginEur : null, live: s.live === true, autoSend: s.autoSend === true, open: s.open !== false, products: objOf(s.products), enabled: objOf(s.enabled), catEnabled: objOf(s.catEnabled), catOverride: objOf(s.catOverride), seeded: objOf(s.seeded), anchorsFile: String(s.anchorsFile || "") };
    // Mitbewerber-Preisanker aus print-anchors.json (versioniert im Repo): neue Version → Produkte daraus übernehmen, übrige Anker bleiben
    if (process.env.PRINT_ANCHORS_FILE !== "off") try { const f = JSON.parse(fs.readFileSync(path.join(__dirname, "print-anchors.json"), "utf8")); if (f && f.version && String(f.version) !== SETTINGS.anchorsFile && f.anchors) { await saveSettings({ anchors: f.anchors, anchorsFile: String(f.version) }); log("Preisanker " + f.version + " übernommen (" + Object.keys(f.anchors).length + " Produkte)"); } } catch (e) { if (e.code !== "ENOENT") log("Preisanker-Datei:", e.message); }
    return SETTINGS;
  }
  const SKU_RX = /^[a-z0-9_-]{1,80}$/i;
  async function saveSettings(pl) {
    const s = await settings();
    if (pl.live !== undefined) s.live = pl.live === true;
    if (pl.anchorsFile) s.anchorsFile = String(pl.anchorsFile).slice(0, 40);
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
  async function pcApi(method, p, body, opts) {
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
    const w = parseFloat(String(o.width || "").replace(",", ".")), h = parseFloat(String(o.height || "").replace(",", "."));
    if (w > 0 && h > 0 && w < 5000 && h < 5000) return [w, h];
    const slug = String(o.slug || "").toLowerCase(), t = (slug + " " + String(o.name || "")).toLowerCase().replace(/_/g, " ");
    const m = t.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m\b)?/);
    // „banner_85_x_200“ (Roll-ups) ohne Einheit = cm
    if (m) { const f = m[3] === "cm" || (!m[3] && /^banner_\d/.test(slug)) ? 10 : m[3] === "m" ? 1000 : 1; return [parseFloat(m[1].replace(",", ".")) * f, parseFloat(m[2].replace(",", ".")) * f]; }
    const a = t.match(/\b(a[0-7]|dl|din lang)\b/); if (a) return A_SIZES[a[1].replace(" ", "_")].slice();
    return null;
  }
  const fmtDims = d => d[0] >= 100 && d[1] >= 100 && d[0] % 10 === 0 && d[1] % 10 === 0 ? d[0] / 10 + " × " + d[1] / 10 + " cm" : d[0] + " × " + d[1] + " mm";
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
    const optExtra = (slug, o) => { const x = {}; const inf = cmsInfo(sku, String(o.slug)); const d = String(o.description || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || (inf && inf.d) || ""; if (d) x.desc = d.slice(0, 220);
      const ic = cmsOptImg(slug, String(o.slug)) || (inf && inf.i) || ""; if (ic) x.img = IMG(ic, 160);
      const hex = JSON.stringify(o.enrichments || "").match(/#[0-9a-f]{6}\b/i); if (hex) x.color = hex[0];
      if (o.parent != null && (typeof o.parent === "string" || typeof o.parent === "number")) x.parent = String(o.parent);
      return x; };
    const optOut = (slug, o) => { const d = slug === "size" || slug === areaProp ? (dimsOf(o) || (slug === "size" && c.dims ? c.dims.slice() : null)) : null;
      const nm = (L[slug] && L[slug][o.slug]) || (kind === "promo" && slug === "printtype" && ptLabel(o.slug)) || (o.name != null && String(o.name) !== String(o.slug) ? String(o.name) : d ? fmtDims(d) : String(o.name || o.slug));
      return Object.assign({ slug: String(o.slug), name: String(o.slug) === "custom" && slug === "size" ? "Eigenes Format" : nm, w: d ? d[0] : null, h: d ? d[1] : null }, optExtra(slug, o)); };
    props.forEach(p => {
      if (!p || !p.slug || HIDDEN_PROPS.test(p.slug) || p.locked) return;
      let opts = (Array.isArray(p.options) ? p.options : []).filter(o => o && o.slug != null);
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
      sizes = ((by.textile_sizes && by.textile_sizes.options) || []).filter(o => o && o.slug != null).map(o => ({ slug: String(o.slug), name: (L.textile_sizes && L.textile_sizes[o.slug]) || (o.name != null && String(o.name) !== String(o.slug) ? String(o.name) : String(o.slug).replace(/^unisex_/, "").toUpperCase()) }));
      positions = TEX_POS.filter(x => by[x[0]] && Array.isArray(by[x[0]].options) && by[x[0]].options.length).map(x => ({ slug: x[0], title: x[1], area: x[2].slice(), opts: by[x[0]].options.map(o => String(o.slug)) }));
      const pm = by.printingmethod && Array.isArray(by.printingmethod.options) ? by.printingmethod.options.map(o => String(o.slug)) : null;
      methods = TEX_METHODS.filter(m => !pm || pm.indexOf(m.pm) > -1).map(m => ({ key: m.key, label: m.label, pm: pm ? m.pm : null, val: m.val, min: m.min, positions: positions.filter(p => p.opts.indexOf(m.val) > -1 && (!m.only || m.only.test(p.slug))).map(p => p.slug) })).filter(m => m.positions.length);
      if (!sizes.length || !methods.length) throw new Error("Textil-Eigenschaften (Größen/Druckpositionen) fehlen");
      maxCopies = avail.length ? avail[avail.length - 1] : 2500;
    }
    // Endformat bei fester Größe: aus der Option (width/height bzw. Slug/Name), sonst kuratierte Maße, sonst Druckfläche
    let dims = null;
    if (kind === "flat" && !exposed.some(x => x.slug === "size")) {
      const so = by.size && (by.size.options || []).find(o => o && String(o.slug) === fixed.size);
      dims = (so && dimsOf(so)) || (c.dims ? c.dims.slice() : null) || ((by.printing_size && (by.printing_size.options || []).map(o => o && dimsOf(o)).filter(Boolean)[0]) || null);
    }
    const prod = { key: c.key, title: c.title, icon: c.icon, desc: c.desc, group: c.group || OTHER, kind, generic: !!c.generic, designer: c.designer !== undefined ? c.designer : kind === "flat" || kind === "banner", safe: c.safe || 3, sku: String(sku),
      bleed: kind === "textile" || kind === "promo" ? 0 : +pd.bleed > 0 && +pd.bleed <= 100 ? +pd.bleed : c.bleed != null ? c.bleed : 2, dpi: c.dpi || (kind === "banner" ? 100 : 300),
      props: exposed, tiers, qty, urgency, fixed, auto, excludes: [], dims, custom, sizes, positions, methods, maxCopies, areaProp, areas, printArea: c.printArea ? c.printArea.slice() : null, defaults: {},
      cat: c.cat ? { main: c.cat.split("/")[0], sub: c.cat.split("/")[1] || "" } : Array.isArray(pd.category) && pd.category[0] ? { main: slugN(pd.category[0]), sub: slugN(pd.category[1]) } : null };
    prod.excludes = (Array.isArray(pd.excludes) ? pd.excludes : []).filter(Array.isArray).slice(0, 600).map(rule => rule.filter(x => x && x.property && Array.isArray(x.options)).map(x => ({ property: String(x.property), options: x.options.map(o => String(o && typeof o === "object" ? o.slug : o)) }))).filter(r => r.length);
    // Vorauswahl: bevorzugte Optionen zuerst (kuratiert bzw. Papier 115–170 g Bilderdruck), dann die erste Kombination ohne Ausschluss
    const pref = c.prefer || {}, paper = c.paper !== undefined ? c.paper : kind === "flat" ? [115, 170] : null;
    const order = pr => { const o = pr.options.map(x => x.slug); const p = (pref[pr.slug] || (pr.slug === "printtype" ? ["40", "44"] : [])).filter(x => o.indexOf(x) > -1); let rest = o.filter(x => p.indexOf(x) < 0);
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
  const genericCfg = (it, g) => ({ key: it.sku, title: it.title, icon: GROUP_ICON[g.main] || "📦", desc: "Individuell bedruckt – Druckdaten hochladen, wir prüfen jede Datei.", group: g.main, expose: "auto", safe: 3, generic: true, prefer: GEN_PREF[it.sku] });
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
    CMS = Object.assign({ at: nowIso(), file: de.fileName, v: 2 }, t); await store.setMeta("print_cms", CMS); PD_CACHE.clear();
    return CMS;
  }
  async function cms(force) {
    if (!CMS) CMS = await store.getMeta("print_cms").catch(() => null);
    if (force || !CMS || !CMS.at || CMS.v !== 2 || Date.now() - Date.parse(CMS.at) > 24 * 3600e3) {   // v2: mit Beliebtheit
      if (!cmsLoading) cmsLoading = cmsRefresh().catch(e => { log("CMS:", e.message); return CMS; }).finally(() => { cmsLoading = null; });
      if (force || !CMS) return cmsLoading;
    }
    return CMS;
  }
  const cmsProd = sku => (CMS && CMS.products && CMS.products[sku]) || null;
  const cmsOptImg = (prop, slug) => (CMS && CMS.options && CMS.options[prop + "|" + slug]) || "";
  // Info/Bild zu einer Option nur, wenn Print.com sie ausdrücklich diesem Produkt zuordnet (Slugs wie „a3“, „40“, „none“ gibt es in vielen Produkten mit anderer Bedeutung)
  const cmsInfo = (sku, slug) => { const l = (CMS && CMS.info) || []; return l.find(x => x.s.indexOf(slug) > -1 && x.p.length && x.p.indexOf(sku) > -1) || null; };
  const groupName = slug => (CMS && CMS.names && CMS.names[slug]) || MAIN_DE[slug] || slug;
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
    const out = { at: nowIso(), products: [], errors: [] };
    for (const c of CURATED) {
      const ov = s.products[c.key] || {};
      let sku = ov.sku || "";
      if (!sku) { const ex = items.find(p => c.skus.indexOf(String(p.sku).toLowerCase()) > -1); sku = ex ? ex.sku : (c.rx && (items.find(p => c.rx.test(p.sku) || c.rx.test(p.titlePlural || "") || c.rx.test(p.titleSingle || "")) || {}).sku) || ""; }
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
    const stale = !CAT || !CAT.at || Date.now() - Date.parse(CAT.at) > 24 * 3600e3;
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
    key = String(key || ""); s = s || await settings();
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
  const shortDesc = (cp, fb) => { const t = cp && (cp.s || String(cp.d || "").split(/\n/).map(x => x.replace(/^[-*•\s]+/, "").trim()).filter(Boolean)[0]); return clip(t || fb || "", 140); };
  const catPub = g => ({ main: g.main, sub: g.sub || "", mainName: groupName(g.main), subName: g.sub ? groupName(g.sub) : "" });
  const pubProd = p => { const cp = cmsProd(p.sku), g = p.cat || { main: p.group || OTHER, sub: "" };
    return { key: p.key, title: p.generic && cp && cp.n ? cp.n : p.title, icon: p.icon || GROUP_ICON[g.main] || "📦", desc: shortDesc(cp, p.desc), group: g.main, cat: catPub(g), img: cp && cp.i ? IMG(cp.i, 600) : "",
      pop: (cp && cp.pp) || 0, images: cp ? [cp.i].concat(cp.g || []).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 7).map(x => IMG(x, 1000)) : [], about: cp ? clip(cp.d, 600) : "", summary: cp ? clip(cp.s, 200) : "",
      kind: p.kind || "flat", designer: p.designer, bleed: p.bleed, safe: p.safe, dpi: p.dpi, props: p.props, tiers: p.tiers, qty: p.qty || [], urgency: p.urgency, fixed: p.fixed, auto: p.auto || {},
      excludes: p.excludes, defaults: p.defaults || {}, dims: p.dims || null, custom: p.custom || null, sizes: p.sizes || null, positions: p.positions || null, methods: p.methods || null, maxCopies: p.maxCopies || null, areaProp: p.areaProp || null, areas: p.areas || {}, printArea: p.printArea || null }; };
  // Shop-Katalog: nur freigeschaltete Produkte (allgemeine nur als Karte, Details beim Öffnen), gruppiert nach Print.com-Hauptgruppe/Untergruppe
  function publicCatalog(cat, s, all) {
    const cur = ((cat && cat.products) || []).map(p => productOf(cat, p.key, s)).filter(Boolean).map(pubProd);
    const skuSet = new Set(((cat && cat.products) || []).map(p => p.sku));
    const gen = ((all && all.items) || []).filter(it => !skuSet.has(it.sku)).map(it => [it, catOf(it.sku, s, it.auto)]).filter(x => shown(s, x[0].sku, x[0].sku, x[1]))
      .map(x => { const cp = cmsProd(x[0].sku); return { key: x[0].sku, title: (cp && cp.n) || x[0].title, icon: GROUP_ICON[x[1].main] || "📦", desc: shortDesc(cp, "Individuell bedruckt – Druckdaten hochladen."), group: x[1].main, cat: catPub(x[1]), img: cp && cp.i ? IMG(cp.i, 600) : "", pop: (cp && cp.pp) || 0, lazy: true }; });
    const order = mainsList().map(m => m.slug), ix = g => { const i = order.indexOf(g); return i < 0 ? 900 : i; };
    // Bestseller: die beliebtesten Produkte laut Print.com (Top 12, mindestens Beliebtheit 4 000); innerhalb der Gruppe zuerst
    // ohne Saison-/Nischenprodukte (Print.com führt z. B. Kalender, Lesezeichen, Pläne weit oben, das sind aber keine Alltags-Bestseller)
    const NICHE = /calendar|kalender|bookmark|lesezeichen|^maps$|plan$|election|wahlplakat/i, cand = p => (p.pop || 0) >= 4000 && !NICHE.test(p.key + " " + p.title);
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
    const vars = Object.keys(prod.auto || {}).map(k => [k, only && only[k] ? prod.auto[k].filter(x => only[k].indexOf(x) > -1) : prod.auto[k]]).map(v => OMITTABLE.test(v[0]) ? [v[0], v[1].concat([null])] : v);   // only: z. B. Druckverfahren passend zur Auflage
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
    if (kind === "promo") { const a = areaOf(prod, all); positions = [{ slug: "area", title: "Druckfläche", area: [a.w, a.h] }]; fileSel = { pos: ["area"], area: [a.w, a.h] }; more.push(["Druckfläche", a.w + " × " + a.h + " mm"]); }
    const pcOpts = Object.assign({}, all, { copies }); if (prod.urgency.length) pcOpts.urgency = urgency;
    if (kind === "flat" && !size) size = sizeOf(prod, all);
    let folds = null, closed = null;
    if (size && all.fold) { folds = foldSpec(all.fold, size.w, size.h); if (folds) { closed = size; size = folds.open; more.push(["Format offen", size.w + " × " + size.h + " mm"]); } }
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
    return { sel, fileSel, copies, urgency, pcOpts, pcMore: variantsOf(prod, pcOpts), labels, pmWanted, pmAlts, sides: positions ? positions.length : sidesOf(all), size, folds, closed, variants, positions, textile: tex, excluded: excl, kind };
  }

  // ── Steuer ──
  // AT: immer 20 %. DE privat: österreichische USt 20 % (TODO OSS: ab 10.000 € EU-weiten Fernverkäufen pro Jahr deutsche USt 19 % über OSS abführen –
  // Schwelle im Blick behalten). DE Firma mit gültiger (VIES) deutscher UID: steuerfreie innergemeinschaftliche Lieferung 0 %, Hinweis auf der Rechnung.
  function taxFor(country, cust) {
    const uid = String(cust && cust.uid || "").replace(/[\s.\-]/g, "").toUpperCase();
    if (country !== "AT" && cust && cust.company && cust.uidValid && uid.slice(0, 2) === country) return { case: "igl", rate: 0, uid, note: "Steuerfreie innergemeinschaftliche Lieferung (Art. 6 Abs. 1 iVm Art. 7 UStG 1994). UID des Leistungsempfängers: " + uid + "." };
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
    for (const k of VARY) { const l = (prod.auto || {})[k]; if (!l || opts[k] === undefined) continue;
      for (const v of l.concat(OMITTABLE.test(k) ? [null] : [])) { if (out.length >= 5) break; if (v === opts[k]) continue; const o = Object.assign({}, opts); if (v === null) delete o[k]; else o[k] = v; if (!hitRules(prod.excludes, o, al)) out.push(o); } }
    return out;
  }
  async function buyAny(prod, n, list, country, postcode) {
    let last; for (const o of (list && list.length ? list : [n.pcOpts])) { try { return { v: await purchase(prod, Object.assign({}, n, { pcOpts: o }), country, postcode), pcOpts: o }; } catch (e) { last = e; if (e.status !== 400) break; } }
    throw last;
  }
  async function purchase(prod, n, country, postcode) {
    const key = JSON.stringify([prod.sku, n.pcOpts, country, postcode || ""]);
    const hit = PRICE_CACHE.get(key); if (hit && Date.now() - hit.at < 30 * 60e3) return hit.v;
    // Print.com ist maßgeblich: lehnt Print.com ab (oder Preis 0) und greift eine Ausschlussregel → „nicht lieferbar“
    let pr; try { pr = await pcApi("POST", "/products/" + encodeURIComponent(prod.sku) + "/price", { sku: prod.sku, options: n.pcOpts, deliveryPromise: 0 }); }
    catch (e) { if (n.excluded || e.status === 400 || e.status === 422) throw Object.assign(new Error(n.excluded ? "Diese Kombination ist leider nicht lieferbar" : "Für diese Auswahl gibt es gerade keinen Preis"), { status: 400 }); throw e; }
    const P = pr && pr.prices || {};
    const productPrice = +P.salesPrice > 0 ? +P.salesPrice : +P.productPrice > 0 ? +P.productPrice : +P.normalPrice;
    if (!(productPrice > 0)) throw Object.assign(new Error(n.excluded ? "Diese Kombination ist leider nicht lieferbar" : "Für diese Auswahl gibt es gerade keinen Preis"), { status: n.excluded ? 400 : 502 });
    const sp = await pcApi("POST", "/shipping/shipping-possibilities", { item: { sku: prod.sku, options: n.pcOpts, deliveryPromise: 0 }, address: { country, postcode: postcode || (country === "DE" ? "10115" : "6793") }, numberOfDays: 21 });
    let poss = []; ((sp && sp.results) || []).forEach(r => (r.possibilities || []).forEach(x => poss.push(x)));
    const same = poss.filter(x => !x.urgency || x.urgency === n.urgency); if (same.length) poss = same;
    const cost = x => { const p = x.price || {}; return +p.cost > 0 ? +p.cost : (+p.base || 0) + (+p.urgency || 0); };
    poss.sort((a, b) => cost(a) - cost(b) || String(a.deliveryDate).localeCompare(String(b.deliveryDate)));
    if (!poss.length) throw Object.assign(new Error("Versand in dieses Land ist für diese Auswahl gerade nicht möglich"), { status: 502 });
    const best = poss[0];
    const fastest = poss.slice().sort((a, b) => String(a.deliveryDate).localeCompare(String(b.deliveryDate)))[0];
    const v = { product: r2(productPrice), shipping: r2(cost(best)), total: r2(productPrice + cost(best)), deliveryDate: String(best.deliveryDate || "").slice(0, 10), carrier: String(best.carrier || ""), method: String(best.method || ""), earliest: String(fastest.deliveryDate || "").slice(0, 10) };
    PRICE_CACHE.set(key, { at: Date.now(), v }); if (PRICE_CACHE.size > 2000) PRICE_CACHE.clear();
    return v;
  }
  const PM_DE = { digital: "Digitaldruck", offset: "Offsetdruck", inkjet: "Inkjet-Großformatdruck", digital_uv: "UV-Digitaldruck", screen_printing: "Siebdruck", sublimation: "Sublimationsdruck", hybrid: "Hybriddruck" };
  async function quote(prod, n, country, postcode, cust) {
    if (!COUNTRIES[country]) throw Object.assign(new Error("Lieferung derzeit nur innerhalb Österreichs"), { status: 400 });
    const s = await settings(), ov = s.products[prod.key] || {}, c = cfg();
    const markup = ov.markupPct != null ? +ov.markupPct : s.markupPct != null ? s.markupPct : c.markup, minM = ov.minMarginEur != null ? +ov.minMarginEur : s.minMarginEur != null ? s.minMarginEur : c.minMargin;
    // Aufschlag (und ggf. Mindestmarge) nur auf das Produkt – Versand wird zum Einkaufspreis weitergegeben; auf 10 Cent aufrunden
    // Mindestmarge immer NACH Zahlungsgebühr (Mollie, konservativ: Kreditkarte) – netto ≥ (Einkauf × (1 + min %) + Fixgebühr) / (1 − (1 + USt) × Gebühr %)
    const tax0 = taxFor(country, cust), fee = payFee(), floorOf = b => ((b.product + b.shipping) * (1 + (s.minMarginPct != null ? s.minMarginPct : 10) / 100) + fee.fix) / (1 - (1 + tax0.rate / 100) * fee.pct / 100);
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
    const netOf = b => Math.ceil(Math.max(floorOf(b), ancNet || (Math.max(b.product * (1 + markup / 100), b.product + minM) + b.shipping)) * 10 - 1e-6) / 10;
    const tax = taxFor(country, cust);
    // Druckverfahren: lässt Print.com mehrere zu (z. B. Digital/Offset), jedes rechnen und standardmäßig das günstigste nehmen; gewähltes Verfahren geht in die Bestellung
    let buy, methods = null;
    if (n.pmAlts) {
      const tries = await Promise.all(n.pmAlts.map(a => buyAny(prod, n, a.more || [a.pcOpts], country, postcode).then(r => ({ pm: a.pm, pcOpts: r.pcOpts, v: r.v }), () => null)));
      const ok = tries.filter(Boolean).sort((a, b) => netOf(a.v) - netOf(b.v));
      if (ok.length) {
        // automatisch: Offset, wo er preislich passt, sonst das günstigste (z. B. kleine Auflagen → Digitaldruck)
        // Offset nur, wenn er höchstens ~10 % über dem günstigsten Verfahren liegt (bei Kleinauflagen ist Offset oft ein Vielfaches teurer)
        const off = ok.find(x => x.pm === "offset"), offOk = off && netOf(off.v) <= netOf(ok[0].v) * 1.1 + 0.5;
        const pick = (n.pmWanted && n.pmWanted !== "auto" && ok.find(x => x.pm === n.pmWanted)) || (offOk ? off : ok[0]); buy = pick.v;
        n.pcOpts = pick.pcOpts; n.pm = pick.pm;
        if (n.labels && !n.labels.some(l => l[0] === "Druckverfahren")) n.labels.push(["Druckverfahren", PM_DE[pick.pm] || pick.pm]);
        methods = ok.map(x => { const nt = netOf(x.v); return { pm: x.pm, name: PM_DE[x.pm] || x.pm, net: r2(nt), gross: r2(nt + r2(nt * tax.rate / 100)), deliveryDate: x.v.deliveryDate }; });
      }
    }
    if (!buy) { const r = await buyAny(prod, n, n.pcMore, country, postcode); buy = r.v; n.pcOpts = r.pcOpts; }
    // Rabatte (Bonusprogramm bzw. Kundenrabatt, Gutschein): auf den ganzen Nettopreis, hintereinander, auf 10 Cent abgerundet
    const dl = (cust && Array.isArray(cust.disc) ? cust.disc : []).filter(d => d && +d.pct > 0).map(d => ({ label: String(d.label || "Rabatt").slice(0, 60), pct: Math.min(50, +d.pct) }));
    const fac = dl.reduce((f, d) => f * (1 - d.pct / 100), 1), bp = dl.length;
    const disc = nt => bp ? Math.floor(nt * fac * 10 + 1e-6) / 10 : nt;
    if (bp && methods) methods = methods.map(m => { const nt = disc(m.net); return Object.assign({}, m, { net: r2(nt), gross: r2(nt + r2(nt * tax.rate / 100)) }); });
    const list = netOf(buy), net0 = disc(list), vat0 = r2(net0 * tax.rate / 100);
    // Rabatte (Bonus, Kundenrabatt, Gutschein) dürfen die Mindestmarge nach Gebühr nicht unterschreiten
    const net = Math.max(net0, Math.ceil(floorOf(buy) * 10 - 1e-6) / 10), vat = r2(net * tax.rate / 100), payCost = r2((net + vat) * fee.pct / 100 + fee.fix);
    return { anchor: ancGross ? r2(ancGross) : null, methods, pm: n.pm || null, net: r2(net), vat, gross: r2(net + vat), bonus: bp ? { pct: r2((1 - fac) * 100), tier: dl.map(d => d.label).join(" + "), items: dl, listNet: r2(list), saved: r2(list - net) } : null, rate: tax.rate, taxCase: tax.case, taxNote: tax.note, uid: tax.uid, purchase: buy, payFee: payCost, margin: r2(net - buy.total - payCost), markupPct: markup, minMarginEur: minM, deliveryDate: buy.deliveryDate, at: nowIso() };
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
  function pdfInfo(buf) {
    const s = buf.toString("latin1");
    const box = name => { const m = s.match(new RegExp("\\/" + name + "\\s*\\[\\s*(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)\\s*\\]")); return m ? { w: r2(Math.abs(m[3] - m[1]) / MM_PT), h: r2(Math.abs(m[4] - m[2]) / MM_PT) } : null; };
    let pages = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
    const cm = s.match(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g) || [];
    cm.forEach(x => { const n = parseInt((x.match(/\/Count\s+(\d+)/) || [])[1], 10); if (n > pages) pages = n; });
    return { encrypted: /\/Encrypt\b/.test(s), pages: pages || null, media: box("MediaBox"), trim: box("TrimBox") };
  }
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const fits = (box, w, h, tol) => box && ((near(box.w, w, tol) && near(box.h, h, tol)) || (near(box.w, h, tol) && near(box.h, w, tol)));
  function checkPdf(info, size, bleed, sides) {
    const out = [], W = size.w + 2 * bleed, H = size.h + 2 * bleed;
    if (info.trim && fits(info.trim, size.w, size.h, 1)) out.push({ level: "ok", text: "Endformat (TrimBox) " + size.w + " × " + size.h + " mm passt." });
    if (fits(info.media, W, H, 1.2)) out.push({ level: "ok", text: "Seitengröße inkl. " + bleed + " mm Beschnitt passt (" + W + " × " + H + " mm)." });
    else if (fits(info.media, size.w, size.h, 1)) out.push({ level: "warn", text: "Die Datei hat keinen Beschnitt (" + bleed + " mm je Seite). Motive bis zum Rand werden evtl. mit weißem Blitzer geschnitten." });
    else if (info.media) {
      const ar = (info.media.w / info.media.h), arT = W / H;
      if (near(ar, arT, 0.02) || near(1 / ar, arT, 0.02)) out.push({ level: "warn", text: "Seitengröße " + info.media.w + " × " + info.media.h + " mm weicht ab, Seitenverhältnis passt – die Datei wird auf " + W + " × " + H + " mm skaliert." });
      else out.push({ level: "error", text: "Seitengröße " + info.media.w + " × " + info.media.h + " mm passt nicht zum gewählten Format (" + W + " × " + H + " mm inkl. Beschnitt)." });
    } else out.push({ level: "warn", text: "Seitengröße konnte nicht automatisch gelesen werden – wir prüfen die Datei vor dem Druck persönlich." });
    if (info.pages && info.pages !== sides) out.push({ level: info.pages < sides ? "warn" : "error", text: "Die Datei hat " + info.pages + " Seite(n), für die gewählte Druckart werden " + sides + " benötigt." + (info.pages < sides ? " Die Rückseite bleibt sonst weiß." : "") });
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
  const fileView = m => ({ fileId: m.id, token: sig("file", m.id), name: m.name, kind: m.kind, pages: m.pages, size: m.size, bleed: m.bleed, checks: m.checks || [], blocked: (m.checks || []).some(c => c.level === "error"), preflight: m.preflight ? { status: m.preflight.status } : null, bytes: m.bytes });
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
    return { prod, n, target: { product: prod.key, sel: n.fileSel, size: n.size, bleed: prod.bleed, sides: n.sides } };
  }
  const isLogo = prod => prod.kind === "textile" || prod.kind === "promo";
  // Upload-Konfiguration vorab prüfen (bevor die Datei gelesen wird)
  async function uploadTarget(input) {
    const prod = await findProduct(input.product); if (!prod) throw Object.assign(new Error("Produkt nicht verfügbar"), { status: 400 });
    if (!isLogo(prod)) return targetOf(input, true);
    // Logo je Druckposition: Textil – Position aus dem Produkt; Werbeartikel – Druckfläche der aktuellen Auswahl
    if (prod.kind === "textile") { const p = (prod.positions || []).find(x => x.slug === String(input.logo || "")); if (!p) throw bad("Druckposition fehlt"); return { prod, pos: { slug: p.slug, title: p.title, area: p.area } }; }
    const n = normalizeSel(prod, input); return { prod, pos: n.positions[0] };
  }
  async function handleUpload(buf, name, input) {
    const t0 = await uploadTarget(input);
    if (t0.pos) return handleLogo(buf, name, t0.prod, t0.pos);
    const { prod, target } = t0;
    const type = sniff(buf); if (!type) throw Object.assign(new Error("Nur PDF, JPG oder PNG möglich"), { status: 415 });
    if (!target.size) {   // Produkt ohne lesbares Endformat (allgemeines Print.com-Produkt): Datei annehmen, Format prüfen wir vor dem Druck
      if (type !== "pdf") throw Object.assign(new Error("Für dieses Produkt bitte eine druckfertige PDF hochladen"), { status: 400 });
      const info = pdfInfo(buf); if (info.encrypted) throw bad("Die PDF ist verschlüsselt/geschützt – bitte ohne Kennwortschutz exportieren");
      target.pages = info.pages;
      return newFile("upload", name, buf, target, [{ level: "warn", text: "Format wird vor dem Druck geprüft – wir melden uns, falls etwas nicht passt." + (info.media ? " Seitengröße der Datei: " + info.media.w + " × " + info.media.h + " mm." : "") }], { original: "pdf" });
    }
    if (type === "pdf") {
      const info = pdfInfo(buf); if (info.encrypted) throw Object.assign(new Error("Die PDF ist verschlüsselt/geschützt – bitte ohne Kennwortschutz exportieren"), { status: 400 });
      target.pages = info.pages;
      return newFile("upload", name, buf, target, checkPdf(info, target.size, target.bleed, target.sides), { original: "pdf" });
    }
    const dm = imgDims(buf, type); if (!dm || !dm.w || !dm.h) throw Object.assign(new Error("Bild konnte nicht gelesen werden"), { status: 400 });
    if (dm.w * dm.h > 150e6) throw Object.assign(new Error("Bild ist zu groß (max. 150 Megapixel)"), { status: 400 });
    const W = target.size.w + 2 * target.bleed, H = target.size.h + 2 * target.bleed;
    const rot = (dm.w > dm.h) !== (W > H) && Math.abs(W - H) > 1;
    const dpi = Math.round(Math.min((rot ? dm.h : dm.w) / (W / 25.4), (rot ? dm.w : dm.h) / (H / 25.4)));
    const D0 = prod.dpi || 300, f = D0 / 300;   // Großformat (Banner) braucht weniger dpi
    const checks = [];
    if (dpi >= D0) checks.push({ level: "ok", text: "Auflösung " + dpi + " dpi – passt." });
    else if (dpi >= Math.round(150 * f)) checks.push({ level: "warn", text: "Auflösung nur " + dpi + " dpi (empfohlen " + D0 + " dpi). Der Druck kann leicht unscharf wirken." });
    else if (dpi >= Math.round(72 * f)) checks.push({ level: "warn", text: "Auflösung sehr gering (" + dpi + " dpi). Der Druck wird sichtbar unscharf – besser eine größere Datei verwenden." });
    else checks.push({ level: "error", text: "Auflösung viel zu gering (" + dpi + " dpi) für " + W + " × " + H + " mm." });
    if (rot) checks.push({ level: "error", text: "Bild ist " + (dm.w > dm.h ? "quer" : "hoch") + ", das Format aber " + (W > H ? "quer" : "hoch") + " – bitte passend drehen." });
    const ar = (dm.w / dm.h) / (W / H); if (!rot && Math.abs(ar - 1) > 0.03) checks.push({ level: "warn", text: "Seitenverhältnis weicht ab – das Bild wird mittig auf " + W + " × " + H + " mm zugeschnitten." });
    checks.push({ level: "warn", text: "Bitte beachte: Inhalte im Beschnitt (" + target.bleed + " mm je Seite) werden abgeschnitten." });
    if (target.sides > 1) checks.push({ level: "warn", text: "Bild-Upload füllt nur die Vorderseite – die Rückseite bleibt weiß. Für zwei Seiten bitte eine 2-seitige PDF hochladen." });
    let pdf; try { pdf = await imageToPdf(buf, type, target.size, target.bleed, target.sides); } catch (e) { throw Object.assign(new Error("Bild konnte nicht verarbeitet werden"), { status: 400 }); }
    target.pages = target.sides;
    return newFile("upload", String(name || "bild").replace(/\.(jpe?g|png)$/i, "") + ".pdf", pdf, target, checks, { original: type, px: dm, dpi });
  }
  // Logo (Textil/Werbeartikel): Original wird gespeichert und geprüft; zusammengeführt wird erst in mergeLogos (eine PDF-Seite je Position)
  async function handleLogo(buf, name, prod, pos) {
    const type = sniff(buf); if (!type) throw Object.assign(new Error("Nur PDF, PNG oder JPG möglich"), { status: 415 });
    const A = pos.area, checks = [], extra = { original: type, pos: pos.slug, area: A };
    if (type === "pdf") {
      const info = pdfInfo(buf); if (info.encrypted) throw bad("Die PDF ist verschlüsselt/geschützt – bitte ohne Kennwortschutz exportieren");
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
    checks.push({ level: "ok", text: pos.title + ": Logo wird mittig in der Druckfläche platziert (max. " + A[0] + " × " + A[1] + " mm, Platzierung ca. wie gezeigt). Wir prüfen jede Datei vor dem Druck." });
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
  const orderRows = o => [["Bestellnummer", o.nr], ["Produkt", o.product.title + " · " + o.copies + " Stk."]].concat(o.labels.map(l => [l[0], l[1]]), [["Lieferzeit", (URGENCY_DE[o.urgency] || o.urgency) + (o.price.deliveryDate ? " · voraussichtlich " + deDate(o.price.deliveryDate) : "")],
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
    const q = await quote(prod, n, "AT", "", {}); const v = { gross: q.gross, copies: n.copies }; FROM.set(k + "|nl", { at: Date.now(), v }); return v;
  }
  const nlMod = () => NEWS || (NEWS = require("./print-newsletter.js")({ store, mailSend: D.mailSend, sig, sigOk, nowIso, log, limited, send: D.send,
    publicUrl: () => cfg().publicUrl, firm: () => Object.assign({}, FIRM_DEFAULT, (D.firm && D.firm()) || {}),
    products: async () => { const s = await settings(); return publicCatalog(await catalog(false), s, await catalogAll().catch(() => null)); },
    priceFrom, vouchers, saveVouchers: all => store.setMeta("print_vouchers", all), accounts: () => accountMod().listAll() }));
  // Kundenkonten (print-account.js): erst bei Bedarf laden
  let ACCOUNT = null;
  const accountMod = () => ACCOUNT || (ACCOUNT = require("./print-account.js")({ store, mail, sig, sigOk, limited, nowIso, secure: /^https:/.test(cfg().publicUrl) }));
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
    const prod = CURATED.find(x => x.key === b.product); const styles = Object.keys(AI_STYLES);
    const fonts = FONTS.map(f => f.family);
    const str = { type: "string" }, hex = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" };
    const schema = { type: "object", additionalProperties: false, required: ["style", "H", "S", "O", "B", "F", "A", "W", "pal", "tip"], properties: { style: { type: "string", enum: styles }, H: str, S: str, O: str, B: str, F: str, A: str, W: str,
      pal: { type: "object", additionalProperties: false, required: ["bg", "fg", "mute", "ac", "ac2", "fh", "fb"], properties: { bg: hex, fg: hex, mute: hex, ac: hex, ac2: hex, fh: { type: "string", enum: fonts }, fb: { type: "string", enum: fonts } } }, tip: str } };
    const system = ["Du bist Grafikdesigner:in im Online-Druckshop von FS Creative (Österreich). Du entwirfst Druckprodukte für Kund:innen: Texte (Deutsch, österreichische Schreibweise, Du-Form nur wenn passend), Stil und Farbpalette.",
      "Felder: H = Hauptüberschrift (kurz, max. 5 Wörter), S = Unterzeile, O = Datum/Ort/Kerninfo (kurz, sonst leer), B = Fließtext (max. 40 Wörter; bei Visitenkarten/Aufklebern leer), F = Kontakt-/Fußzeile (Zeilen mit \n), A = Störer/Preis/Badge (max. 3 Wörter, sonst leer), W = Website ohne https://.",
      "Für Visitenkarten: H = Name, S = Funktion, F = Telefon\nE-Mail\nWebsite, A = Adresse. Für Folder: B in Abschnitte mit Leerzeile trennen (Titel in erster Zeile).",
      "Erfinde keine konkreten Telefonnummern, Adressen oder Preise, die nicht im Auftrag stehen – nutze dann klar erkennbare Platzhalter wie „+43 …“ oder „www.deine-website.at“.",
      "Farben: druckfreundlich (CMYK-tauglich, kein Neon außer beim Stil neon), ausreichend Kontrast zwischen bg und fg (fg auf bg gut lesbar), ac = Akzent, ac2 = zweiter Akzent, mute = gedämpfte Textfarbe. Schriften nur aus der Liste.",
      "Wähle den Stil, der am besten passt: " + styles.map(k => k + " (" + AI_STYLES[k] + ")").join(", ") + ".",
      "tip = ein kurzer, konkreter Gestaltungstipp für genau diesen Auftrag (ein Satz).",
      "Lehne Inhalte ab, die illegal, hetzerisch, diskriminierend oder sexuell explizit sind, oder fremde Marken/Logos imitieren – setze dann H auf „Bitte anderen Inhalt wählen“ und alle anderen Texte leer."].join("\n");
    const user = "Produkt: " + (prod ? prod.title : clip(b.product, 60)) + (b.w && b.h ? " · Format " + Math.round(+b.w) + " × " + Math.round(+b.h) + " mm" : "") + "\nAuftrag der Kundin/des Kunden:\n" + brief;
    let r; try { r = await ki.printDesign(system, user, schema); } catch (e) { throw Object.assign(new Error(e.kiCode === "not_configured" || e.kiCode === "disabled" ? "Der KI-Assistent ist gerade nicht verfügbar." : e.message || "KI-Fehler"), { status: 502 }); }
    const u = await aiUse(); u.by[key] = (u.by[key] || 0) + r.eur; u.total += r.eur; u.calls = (u.calls || 0) + 1; store.setMeta("print_ai_usage", u).catch(() => {});
    return { design: r.json, left: Math.round(Math.max(0, aiCfg().day - u.by[key]) * 100) / 100 };
  }
  // ── Rabatte: Bonusprogramm (Firmenkonto) oder eigener Kundenrabatt (der höhere gilt) + Gutscheincode ──
  let VOUCHERS = null; const FROM = new Map();
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

  async function ordersOfCustomer(c) {
    const l = (await store.listOrders()).filter(o => o.customerId === c.id || (c.verified && o.customer && o.customer.email === c.email));
    return l.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50).map(o => Object.assign(orderPublic(o), { createdAt: o.createdAt, token: sig("order", o.id), groupId: o.groupId || null, labels: o.labels || [] }));
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
    const cust = validCustomer(input.customer);
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
  // Status/Tracking bei Print.com abrufen (täglich bzw. auf Klick / Webhook von Print.com)
  const PC_DONE = { SHIPPED: "shipped", INTRANSIT: "shipped", DELIVERED: "delivered" };
  const PC_PROBLEM = /CANCELED|REFUSED|REJECTED|ERROR|RETURN/;
  async function pollOrder(o) {
    if (!o.printcom || !o.printcom.orderNumber) return o;
    const r = firstOf(await pcApi("GET", "/orders/" + encodeURIComponent(o.printcom.orderNumber)));
    const items = Array.isArray(r.items) ? r.items : [];
    const st = String((items[0] && items[0].status) || r.status || "").toUpperCase();
    const tracks = []; (Array.isArray(r.shipments) ? r.shipments : []).forEach(s => (s.tracks || []).forEach(t => { if (t && /^https?:\/\//.test(String(t.trackUrl || "")) && tracks.indexOf(t.trackUrl) < 0) tracks.push(String(t.trackUrl)); }));
    items.forEach(it => { if (it && /^https?:\/\//.test(String(it.trackingUrl || it.trackUrl || "")) && tracks.indexOf(it.trackingUrl || it.trackUrl) < 0) tracks.push(String(it.trackingUrl || it.trackUrl)); });
    const before = o.status;
    o.printcom.status = st; o.printcom.checkedAt = nowIso(); if (tracks.length) o.printcom.tracks = tracks.slice(0, 5);
    if (PC_DONE[st]) o.status = PC_DONE[st];
    else if (PC_PROBLEM.test(st)) o.status = "problem";
    else if (st && ["ordered", "problem"].indexOf(o.status) > -1) o.status = "in_production";
    if (o.status !== before) hist(o, "Print.com-Status: " + st);
    if ((o.status === "shipped" || o.status === "delivered") && !o.mails.shipped) {
      o.mails.shipped = await mail(o.customer.email, "Deine Drucksachen sind unterwegs · " + o.nr, "Deine Bestellung ist versendet",
        ["Hallo " + o.customer.firstName + ",", "deine Bestellung " + o.nr + " (" + o.product.title + ", " + o.copies + " Stk.) ist gedruckt und auf dem Weg zu dir."],
        tracks.map((t, i) => ["Sendungsverfolgung" + (tracks.length > 1 ? " " + (i + 1) : ""), t]), tracks.length ? [] : ["Die Sendungsverfolgung schicken wir dir nach, sobald sie verfügbar ist."], D.notifyTo) ? nowIso() : null;
      if (o.mails.shipped) hist(o, "Versandmail gesendet");
    }
    await store.putOrder(o);
    return o;
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
    for (const f of files) if (!f.orderId && Date.now() - Date.parse(f.createdAt) > (f.kind === "draft" ? 60 : 3) * 864e5) { await store.delFile(f.id); n++; }
    return n;
  }
  let lastDaily = 0;
  async function tick() {
    nlMod().tick().catch(() => {});   // Newsletter: Entwurf bereitstellen, ggf. montags versenden (stündlich)
    try {
      if (Date.now() - lastDaily < 20 * 3600e3) return;
      const m = (await store.getMeta("print_daily").catch(() => null)) || {};
      if (m.at && Date.now() - Date.parse(m.at) < 20 * 3600e3) { lastDaily = Date.parse(m.at); return; }
      lastDaily = Date.now(); await store.setMeta("print_daily", { at: nowIso() });
      if (cfg().pcKey) { await catalog(true).catch(() => null); await pollAll(); }
      await cleanupFiles();
    } catch (e) { log("Tageslauf:", e.message); }
  }

  // ───────────────────────── HTTP: öffentlich ─────────────────────────
  const HITS = new Map();
  function limited(bucket, ip, max, windowMs) {
    const k = bucket + "|" + ip, now = Date.now(); const a = (HITS.get(k) || []).filter(t => now - t < windowMs); a.push(now); HITS.set(k, a);
    if (HITS.size > 20000) HITS.clear(); return a.length > max;
  }
  const ipOf = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
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
  const orderPublic = o => ({ id: o.id, nr: o.nr, groupSize: o.groupSize || 1, status: o.status, statusText: STATUS_PUB[o.status] || o.status, product: o.product.title, copies: o.copies, labels: o.labels, gross: o.price.gross, net: o.price.net, rate: o.price.rate,
    payment: { method: o.payment.method, status: o.payment.status }, deliveryDate: o.price.deliveryDate, tracks: (o.printcom && o.printcom.tracks) || [], email: o.customer.email.replace(/^(.).*(@.*)$/, "$1…$2") });

  // Startschalter: solange PRINT_SHOP_LIVE nicht "1" ist, ist der Shop für Besucher gesperrt („Bald verfügbar“);
  // im Cockpit angemeldete Admins sehen /print als Vorschau (Banner, noindex). Webhooks und signierte Druckdateien bleiben erreichbar.
  const live = () => process.env.PRINT_SHOP_LIVE === "1" || !!(SETTINGS && SETTINGS.live);   // Railway-Variable oder Schalter im Cockpit
  // Ansichtsmodus (PRINT_SHOP_VIEW=1, z. B. für die Mollie-Prüfung): Shop, Preise, AGB öffentlich sichtbar – Bestellen noch gesperrt
  const viewOnly = () => !live() && process.env.PRINT_SHOP_VIEW === "1";
  const VIEW_MSG = "Bestellungen sind in Kürze möglich – der Druckshop startet in den nächsten Tagen. Fragen gerne an office@fs-creative.at.";
  function soonPage(res) {
    const html = '<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Bald verfügbar — FS Creative</title><link rel="stylesheet" href="/landing.css?v=4"></head><body><main id="main"><div class="wrap"><section class="lhero"><span class="eyebrow">Druck</span><h1>Bald verfügbar.</h1><p class="lead">Diese Seite ist noch nicht öffentlich. Drucksachen gestalten und drucken wir gern persönlich für dich.</p><div class="btn-row"><a class="btn primary" href="/druck">Zu Druck &amp; Print</a><a class="btn ghost" href="/kontakt?von=print&amp;thema=Druck">Anfragen</a></div></section></div></main></body></html>';
    return D.send(res, 404, html, "text/html; charset=utf-8", { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  }
  const ASSET_V = String(process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || Date.now()).replace(/[^\w.-]/g, "").slice(0, 12);
  function shopPage(req, res, preview) {
    let html = ""; try { html = fs.readFileSync(path.join(__dirname, "print.html"), "utf8"); } catch (e) { return D.send(res, 404, "Not found"); }
    // Shop-Dateien je Deploy neu laden (sonst bleibt bis zu 1 Std. die alte app.js/print.css im Browser-Cache)
    html = html.replace(/(\/print\/(?:app\.js|print\.css))\?v=[\w.-]+/g, "$1?v=" + ASSET_V).replace("</head>", '<script>window.PRINT_V="' + ASSET_V + '";</script>\n</head>');
    if (preview === "view") html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, nofollow" />')
      .replace(/<body([^>]*)>/, '<body$1><div role="note" style="position:fixed;left:50%;top:calc(var(--nav-h) + 8px);transform:translateX(-50%);z-index:150;background:#ffd60a;color:#1d1d1f;font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:calc(100vw - 32px);text-align:center">Bestellungen sind in Kürze möglich – der Druckshop startet bald</div>');
    else if (preview) html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '<meta name="robots" content="noindex, nofollow" />')
      .replace(/<body([^>]*)>/, '<body$1><div role="note" style="position:fixed;left:50%;top:calc(var(--nav-h) + 8px);transform:translateX(-50%);z-index:150;background:#ffd60a;color:#1d1d1f;font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.4)">Vorschau – nicht öffentlich (PRINT_SHOP_LIVE ist aus)</div>');
    return D.sendGz(req, res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-cache", "X-Robots-Tag": preview ? "noindex, nofollow" : "index, follow" });
  }
  async function handlePublic(req, res, u, p) {
    await settings().catch(() => null);
    const open = live(), view = viewOnly(), admin = !!(D.adminAuthed && D.adminAuthed(req));
    const gated = !(p.indexOf("/print-files/") === 0 || p === "/print/mollie-webhook" || p.indexOf("/print/printcom-webhook/") === 0);
    if (gated && !open && !admin && !view) { if (p.indexOf("/print/api/") === 0) return J(res, 404, { ok: false, error: "not_found" }); return soonPage(res); }
    if (view && !open && !admin && req.method === "POST" && /^\/print\/api\/(order|draft|upload)$/.test(p)) return J(res, 403, { ok: false, error: VIEW_MSG });
    if (p === "/print" || p === "/print/" || p === "/print.html") { if (p !== "/print") return D.send(res, 301, "", "text/plain", { Location: "/print" + (u.search || "") }); return shopPage(req, res, open ? false : (view && !admin) ? "view" : true); }
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
      if (p.indexOf("/print/api/account/") === 0) {
        if (req.method === "POST" && !sameOrigin(req)) return J(res, 403, { ok: false, error: "forbidden" });
        return await accountMod().handle(req, res, p, ip, J, readJson, ordersOfCustomer, bonusOf);
      }
      if (p === "/print/api/catalog" && req.method === "GET") {
        const c = cfg(), s = await settings();
        if (!c.pcKey || !s.open) return J(res, 200, { ok: true, ready: false, reason: !c.pcKey ? "setup" : "closed" });
        const cat = await catalog(false), all = await catalogAll().catch(() => null);
        const products = publicCatalog(cat, s, all);
        return J(res, 200, { ok: true, ready: products.length > 0, reason: products.length ? "" : "setup", products: scrubPub(products), groups: publicGroups(products), fonts: FONTS, ai: !!(D.ki && D.ki.printDesignOn && D.ki.printDesignOn()), agbVersion: AGB_VERSION, payments: { mollie: !!c.mollieKey, invoice: true }, countries: Object.keys(COUNTRIES).map(k => ({ code: k, name: COUNTRIES[k] })) });
      }
      // Produktdetails (allgemeine Produkte werden erst beim Öffnen geladen)
      // „ab“-Preise für Produktkarten (Standardausführung, kleinste Auflage), 12 Std. zwischengespeichert
      if (p === "/print/api/from" && req.method === "GET") {
        let sels = {}; try { sels = JSON.parse(String(u.searchParams.get("sel") || "{}")) || {}; } catch (e) {}
        const keys = String(u.searchParams.get("keys") || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 12), out = {}, s0 = await settings();
        await Promise.all(keys.map(async k => {
          const sel = Object.assign({}, sels[k] && typeof sels[k] === "object" ? sels[k] : {}), qc = parseInt(sel.__copies, 10) || 0, ck = k + JSON.stringify(sel); delete sel.__copies;
          const hit = FROM.get(ck); if (hit && Date.now() - hit.at < 12 * 3600e3) { out[k] = hit.v; return; }
          try { const prod = await findProduct(k, s0); if (!prod || prod.kind === "textile" || prod.kind === "promo") return; const t = qc && (prod.tiers || []).indexOf(qc) > -1 ? qc : (prod.tiers || [])[0];
            const n = normalizeSel(prod, Object.assign({ copies: t, sel }, prod.kind === "banner" && prod.custom ? { custom: { w: Math.max(prod.custom.minW, 1000) / 10, h: Math.max(prod.custom.minH, 500) / 10 } } : {}));
            const q = await quote(prod, n, "AT", "", {}); const v = { gross: q.gross, copies: n.copies }; FROM.set(ck, { at: Date.now(), v }); out[k] = v; } catch (e) {} }));
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
      m = p.match(/^\/print\/api\/order\/([A-Za-z0-9_-]{6,60})(\/pay)?$/);
      if (m) {
        if (!sigOk("order", m[1], u.searchParams.get("t"))) return J(res, 404, { ok: false, error: "not_found" });
        const o = await store.getOrder(m[1]); if (!o) return J(res, 404, { ok: false, error: "not_found" });
        if (!m[2] && req.method === "GET") return J(res, 200, { ok: true, order: orderPublic(o) });
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
        return J(res, 200, { ok: true, price: publicPrice(q), voucher: dd.voucher ? { code: dd.voucher.code, pct: dd.voucher.pct } : null, voucherErr: dd.voucherErr || "", sides: n.sides, size: n.size, folds: n.folds, closed: n.closed, bleed: prod.bleed, copies: n.copies, labels: n.labels, positions: n.positions });
      }
      if (p === "/print/api/ai/design") {
        if (limited("ai", ip, 40, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Anfragen – bitte später erneut" });
        const b = await readJson(req, 4000); const me = await accountMod().current(req);
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
        const buf = await readBody(req, MAX_UPLOAD); if (buf.length < 100) return J(res, 400, { ok: false, error: "Datei ist leer" });
        const meta = await handleUpload(buf, name, input);
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/logos") {
        if (limited("upload", ip, 60, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const meta = await mergeLogos(await readJson(req, 40000));
        return J(res, 200, Object.assign({ ok: true }, fileView(meta), { pageMap: meta.pageMap }));
      }
      if (p === "/print/api/design") {
        if (limited("upload", ip, 60, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Versuche – bitte später erneut" });
        const b = await readJson(req, MAX_UPLOAD);
        const meta = await handleDesign(b);
        return J(res, 200, Object.assign({ ok: true }, fileView(meta)));
      }
      if (p === "/print/api/draft") {
        if (limited("draft", ip, 30, 3600e3)) return J(res, 429, { ok: false, error: "Zu viele Entwürfe – bitte später erneut" });
        const b = await readJson(req, 25 * 1024 * 1024);
        const data = JSON.stringify({ product: clip(b.product, 80), sel: b.sel && typeof b.sel === "object" ? b.sel : {}, copies: b.copies, urgency: clip(b.urgency, 20), custom: objOf(b.custom), design: b.design });
        if (data.length > 25 * 1024 * 1024) return J(res, 413, { ok: false, error: "Entwurf zu groß" });
        const meta = { id: "f" + crypto.randomBytes(12).toString("hex"), kind: "draft", name: "entwurf.json", bytes: data.length, createdAt: nowIso(), orderId: null };
        await store.putFile(meta, Buffer.from(data, "utf8"));
        return J(res, 200, { ok: true, id: meta.id, token: sig("draft", meta.id), url: cfg().publicUrl + "/print?entwurf=" + meta.id + "&t=" + sig("draft", meta.id) });
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
  async function adminState() {
    const c = cfg(), s = await settings();
    const orders = await store.listOrders();
    const cat = c.pcKey ? await catalog(false).catch(() => null) : null;
    return { ok: true, live: live(), envLive: process.env.PRINT_SHOP_LIVE === "1", mollieMode: c.mollieKey ? (/^test_/.test(c.mollieKey) ? "test" : "live") : "", configured: { printcom: !!c.pcKey, mollie: !!c.mollieKey, preflight: c.preflight, db: useDb(), base: c.pcBase }, defaults: { markupPct: SETTINGS && SETTINGS.markupPct != null ? SETTINGS.markupPct : c.markup, minMarginEur: SETTINGS && SETTINGS.minMarginEur != null ? SETTINGS.minMarginEur : c.minMargin, envMarkupPct: c.markup, envMinMarginEur: c.minMargin },
      settings: s, catalog: cat ? { at: cat.at, errors: cat.errors || [], products: (cat.products || []).map(p => ({ key: p.key, title: p.title, sku: p.sku, group: p.group, kind: p.kind, props: p.props.map(x => ({ slug: x.slug, title: x.title, options: x.options.map(o => ({ slug: o.slug, name: o.name })) })), tiers: p.tiers })) } : null,
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
          all[code] = Object.assign(prev, { pct: Math.round(pct * 10) / 10, maxUses: Math.max(0, parseInt(b.maxUses, 10) || 0), until, perCustomer: b.perCustomer !== false, active: b.active !== false, note: clip(b.note, 200) });
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

  // für „Zur Prüfung“: Vorschlag gültig, solange die Bestellung noch auf die Freigabe wartet
  async function proposalValid(orderId) { const o = await store.getOrder(orderId); return !!o && !!REVIEW[o.status]; }

  return { live, handlePublic, handleAdmin, tick, placeOrder, proposalValid, catalog, _test: { taxFor, pdfInfo, svgSafe, imgDims, sniff, dimsOf, cmyk, svgPagesToPdf, FONTS, AGB_VERSION, categoryOf, parseProduct, normalizeSel, solveSel, hitRules, CURATED, cmsTrim } };
};
module.exports._bonusCalc = bonusCalc;
