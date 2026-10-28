"use strict";
/* Weihnachtsabteilung des Druckshops: www.fs-creative.at/print/weihnachten (saisonal, ca. 15.10.–6.1.)
   Themen mit Kachel- und Bannerbild, je Thema Produktvorschläge mit weihnachtlichem Beispielfoto statt des Katalogbilds.
   Bilder: Pfade im Contentful-Space unserer Produktbilder (Freigabe Simon 28.10.2026: „wir dürfen diese produktbilder auch alle verwenden“),
   ausgeliefert NUR über unseren Bild-Proxy /print/bild/… (print-bild.js) – Besucher verbinden sich nie mit Contentful (Datenschutzerklärung).
   Preis („ab“ = Startausführung des Konfigurators) und frühester Liefertermin: print-shop.js xmasBuild (12 h zwischengespeichert, niedrige Priorität).
   Texte selbst geschrieben (Du-Form, österreichisch), keine Lieferanten-Namen. */

const SPACE = "ez9mp376cw6o/";
const PROXY = "/print/bild/" + SPACE;
// Saison (Datum in Wien, MM-TT): sichtbar from…to (über den Jahreswechsel); „rechtzeitig zu Weihnachten“ = Zustellung spätestens am 23.12.
const SEASON = { from: "10-15", to: "01-06", last: "12-23" };

const HERO = { img: "2b1YaYbeItilwJpZriPgMS/e718edcaecdda38e992280aeef60aac2/2026_EOY-general-headerGeneral_bann.jpg", ratio: 600 / 261,
  alt: "Weihnachtliche Drucksachen und Geschenke auf blauen Podesten: Kalender, Etiketten, Geschenkband, Weinflaschen mit Etikett und Christbaumkugel" };

// Themen: slug (Sprungmarke), nav (kurz, Kachel), title, text, tile/banner (Bild, Seitenverhältnis), items: [Produkt-Key im Shop, Name auf der Karte, Weihnachtsbild, 1 = Querformat (doppelt breite Karte)]
const THEMES = [
  { slug: "planen", nav: "Planen", title: "Planen fürs neue Jahr",
    text: "Kalender, Haftnotizen und Schreibtischunterlagen mit deinem Logo oder euren Fotos – ein Geschenk, das im Büro und daheim das ganze Jahr in Gebrauch ist.",
    tile: ["3XAfT1NbSHKcXduGI2t7RA/8bf6dfd5034e26818406c31330c3da72/2da01ef6-7f27-4f36-b184-675e3be08e79.jpg", 600 / 450], banner: ["2lR8uLtSVlyUo3m0z1540N/ab4344e70e82f73d49376b8b3236ae74/2026-EOY-NewYearDeskKit-header.jpg", 600 / 261],
    alt: "Schreibtisch mit Tischkalender, Stiftehalter, Notizbuch und Haftnotizen im gleichen Design",
    items: [
      ["tear-off-calendars", "Abreißkalender", "7yHYxu7xttc8mDIAFHYvtu/4321a437627ef31d9ca209bd71255b09/EOY-2025-plan-tear-off-calendar.jpg"],
      ["wire-o-desk-calendars", "Tischkalender mit Spiralbindung", "1efKCkjiauZrvFjKgfNn23/867a7f41d6c554ed04f3aa1d2346c442/f462cbde-c8ce-4e53-a2bc-cd8ca9485939.jpg"],
      ["wire-o-wall-calendar", "Wandkalender mit Spiralbindung", "3pr6vZLNrUySmOGqwV6Cvv/59ad6b65302a698307000a71d5d6ee00/d9413e94-2399-40d7-8bd8-f70ceb880400.jpg"],
      ["stapled-wall-calendar", "Wandkalender geheftet", "4tlyEibEpsMqqVj6Yb64Xk/c5a2655523f48bea18ad4603096e617b/8118556d-dea4-4b5f-90cd-9580df23ffe9.jpg"],
      ["bureau-calendar", "Aufstell-Kalender", "3hWRqKgKJPgNqnSNWE7s88/aa93bb2874be358a18f111569429a2be/746c7ca7-2215-44e2-9e54-45c1974d0963.jpg"],
      ["diaries", "Buchkalender", "2lzrBK0S6nVYDIiHkR4POn/9020ffa3d453b245f708ac78b16c47fb/43fcc8e5-c8df-4e60-9901-b226310032d8.jpg"],
      ["basic-month-calendars", "Monatskalender Basic", "5qXJ43jkVt4IQf0O5TSH4Z/2d28f6cea19ea1165eb549025373b505/78f4e327-ea0d-43c0-99fd-6a934613e5b4.jpg"],
      ["month-calendars", "Monatskalender Premium", "4sxdKSd4Fp7nvjFUlC7FvS/dd6c1e6e44d3cfc49a0a6f77ccd907c9/a2acdfd5-8e6f-4777-9664-5713201a3b10.jpg"],
      ["desk-month-calendar", "Schreibtisch-Monatskalender", "T7Vgb9Vm4vnf473r7eC5d/04abc1c1e370809feddb5a4f09034863/445c0b81-acb5-4168-8f34-30afb3b27787.jpg"],
      ["sticky-notes", "Haftnotizen", "3sGGfSmLzQOnxqVEIkZXRD/a03b263b5ae8c747b3782c530e7d6257/2026-EOY-NewYearDeskKit-memoblok.jpg"],
      ["desk-pads", "Schreibtischunterlagen", "2NJnxQpHAOUYXVL9zEJfSp/70badc949a06a0c163d2986091b97f74/502dc011-4d42-4f0d-94f9-ab2a3c0a9fcc.jpg"],
      ["hexagon-pen-holder", "Pop-up-Stiftehalter", "40Pl939M0Zm4GQp41LUdgB/115a30b581283591f8bac1e865cd506f/2026-EOY-NewYearDeskKit-penholder-calendar.jpg"],
      ["textmarker", "Textmarker mit Logo", "1JRCHuUh79I1ZqEQQeLrJe/e89f4d35278c0a1e7efd0a3375796423/textmarker-family-2.jpg"],
      ["whiteboards-premium", "Whiteboard mit eigenem Druck", "6Ek7cCElBdiJsvrtFWlQfQ/e49f3848e2065cc1d0c7f95a13212e2d/whiteboard-premium-silver-crystal.jpg"]
    ] },
  { slug: "karten", nav: "Karten", title: "Weihnachtskarten & Kuverts",
    text: "Klassische Karten, Kartensets, Karten aus Birkenholz oder Saatpapier und die passenden Kuverts – für Kundschaft, Team, Familie und Freunde.",
    tile: ["HgFg2DW4LLUPXC4yYz7II/c21d90372c6c2f7ffc4f657f526c5527/EOY-2025-send-2-header__6_.jpg", 600 / 338], banner: ["6LCfa3ZZRRyKBd6q3SOxHt/1efdb842669e2b8bd13c374b2280da63/EOY-2025-send-2-header__4_.jpg", 600 / 229],
    alt: "Christbaum aus Karton, behängt mit bunten Weihnachtskarten, vor Lichterkette",
    items: [
      ["postcards", "Weihnachtskarten", "NU31pWTaiPaj8IRMpPGoO/577e26cc7c5be2572454d19432a18539/a33bdc87-db2f-4fce-af60-3efeaf6c13c8.jpg"],
      ["luxurious-postcards", "Karten Exklusiv mit Folienprägung", "3FmEpCGlzXaR5uWqTTZeW2/35c94fe82f7b4a095ce8147834902bd3/EOY-2025-products-cards-luxury.jpg"],
      ["card-sets", "Kartensets", "7kklbhfbrWFA82OPPY82hB/1f35380a5c17a16bcb6b71c22f9093a3/EOY_2025_Products_Cards_foil_V2.jpg"],
      ["postcards-with-envelopes", "Karten mit farbigem Kuvert", "6ai4P7HOm75IhWojLfL2CG/9f5043c35934308574dc0367563b2f17/EOY-2025-cards-with-envelopes-detail.jpg"],
      ["wooden-postcards", "Karten aus Birkenholz", "2kFAcA3olHoc5dlJenac3Y/9831e1d09d0b91bee75b10f23e5cce75/10a4590c-3096-4f09-8fa2-ff917872b66c.jpg"],
      ["growing-paper-cards", "Karten aus Saatpapier", "2qnPpQnx1yTkJSCblwsNhU/0d024eb374df01bcaf2adf02569f0a4d/EOY_2025_Products_growing_paper.jpg"],
      ["colored-envelope", "Farbige Kuverts", "7nulUgeTIK4axAn02ofafb/cdae02d35897e5b4ab2356cd8051998b/EOY-2025-cards-colored-envelopes.jpg", 1],
      ["all-over-printed-envelopes", "Kuverts rundum bedruckt", "7KymPM2GRWgwrZ9nWWZhft/647bba66a4ef83693cc2e87bbca68d09/EOY_2025_Products_envelopes_all_over.jpg"],
      ["growing-paper-envelopes", "Kuverts aus Saatpapier", "3dwtcxqaIzZAe5mReR1WO/d5c3a48c5eefb23813d7ebb7cb14b9f9/Growing-Paper-Envelopes-Seed-Detail.jpg"],
      ["cardboard-shipping-envelopes", "Versandtaschen aus Karton", "29PBeJdwNKxoOs1r89FI41/844dd874bb62f16328d8da5ae3532b39/image__1_.png"],
      ["giftcard-holders", "Schachteln für Geschenkkarten", "2mC8tdJgKmBaepB3eurFdb/1a466b88ea75a966cf100a5881c4fefb/9e8c6057-495a-4395-8832-c3695033d89d.jpg"]
    ] },
  { slug: "verpacken", nav: "Verpacken", title: "Schön verpackt",
    text: "Geschenkpapier, Seidenpapier, Bänder, Anhänger und Schachteln mit deinem Muster oder Logo – fürs Geschäft, den Online-Shop und die eigenen Geschenke.",
    tile: ["5rXJcP4VBTBoWfeBJT04U1/9be47ff461720259c70da198f8b8eea7/053da51c-cd16-4705-962a-a34dc4f00437.jpg", 600 / 450], banner: ["2rlkyNe88kQ4m9eMs7zMkJ/3c212728de8540734cd37f30c4aace91/053da51c-cd16-4705-962a-a34dc4f00437.jpg", 600 / 261],
    alt: "Versandkarton, Geschenkpapier, Geschenkband, Karte und runde Aufkleber im gleichen Muster",
    items: [
      ["gift-wrapping", "Geschenkpapier", "26NxupxGp2eIPRLYj69I9R/6774f4f163a3bf58ed1b61c4db8ce9ef/0b4eb084-f42d-47a2-9fdd-eb65f75eddba.jpg"],
      ["ribbon", "Geschenkband mit Druck", "XB00q4q2R11Mu5uR17Y9M/7e3801d7e9d80ae592bfb656745938f8/fcea376c-131c-491f-aee3-e87ca8ea4210.jpg"],
      ["tissue-paper", "Seidenpapier", "3Q8htfqwAKQRjBIXf9w0R5/8510d85349b68ba1ee519cd90973ccbb/eb16dce5-53a1-4ca0-ac59-422e66aee5e0.jpg"],
      ["hangtags", "Geschenkanhänger", "1zOKFKfFcpRqZ1KixhV3Dj/4da0253490f4346f6b04a0d1a8c4ceda/EOY_2025_Products_Hangtags_B.jpg"],
      ["sleeves", "Banderolen", "4JKUfuUefgHLRqUppVe5MX/6ed898517b518f733de0b8ad39e44877/EOY-wrap-magnetic-boxes.jpg", 1],
      ["magnetic-gift-boxes", "Magnetboxen", "4lTlrnrU5gQ7CEICQJAH7R/55616c8ee3ceeb7cce05f2ef8801cd38/EOY_2025_Products_Magnetic_boxes-crystal.jpg"],
      ["magnetic-gift-boxes-handles", "Magnetboxen mit Band", "1qK26vIPZCeHgSQVYJLyHt/a49dd3efa75c1edf40925186cdb48927/magneetdozen_met_lint_zwart_middel_staand_0_720.jpg"],
      ["boxes_with_two_lids", "Faltschachteln", "4w6o7XHqt2GxsHVx714d1S/90a807368ead81347da248a0059494a8/EOY_2025_Products_part_Packaging_Boxes.jpg"],
      ["pillow-packs", "Kissenverpackungen", "15rcw39QcSixPZvDKEHR9m/b9911c91f8d3c5c09a59edf6b36dff8e/2026-EOY-_loyalty_kit_-_pillow_pack.jpg"],
      ["pillow-packs-kraft", "Kissenverpackungen unbedruckt", "14YiexKt1eqpBsEn1jm3hu/03794db84e21f3bb3bc2faa91fa358a4/pillow-packs-family.jpg"],
      ["gift-bag", "Geschenktaschen", "33qHxhKZayg33kAK8WV4O6/d16d52f5279b19e935b761062c24612e/5b42bfd0-fe21-4793-90f1-a4e943d4a99e.jpg"],
      ["gift-bag-bow", "Geschenktaschen mit Schleife", "7y78KhdpjGnAFUPIPnvjlF/3b504fd8cfd880b609c53d289bc1a17e/Giftbag_bow_collage_4.jpg"],
      ["satin-bag", "Satinbeutel mit Kordel", "317bLdIBYWUADxQCq4DiT1/1708321a5f47565a5f3438e0f9192157/Satin_bags_collage_Colours.jpg"],
      ["cotton-bags-drawstring", "Baumwollbeutel mit Kordel", "2ZgWTTfg8BeneN958E6TAZ/0e3e766860e32dfe64383f1154eb251d/Cotton_Bags_drawstrings_collage_1.jpg"],
      ["labels-on-roll", "Aufkleber auf Rolle", "1d7TZ7ey0rM0SAquew0fmK/faa9db2a65f37893b1dddbb4eda3c257/92246a64-0736-400d-90e9-91e2055cd419.jpg"],
      ["shipping-boxes-digital", "Versandkartons", "1RbdWCZzfhhjSNj9uBkNDA/175ac289267f034f82ec6c0efa2d8c58/1ca1de19-1ba5-47b8-ab5f-43654a3a19a9.jpg"]
    ] },
  { slug: "dekorieren", nav: "Dekorieren", title: "Dekorieren",
    text: "Christbaumkugeln mit Logo, Fensteraufkleber, Sterne und Christbäume aus Karton, Aufsteller und Displays – fürs Geschäft, das Büro oder die Auslage.",
    tile: ["35mblaSJiT6WbOIR0QEdrG/ed68a7c58d52b53856918c45eac6e811/EOY-2025-show-header-V2.jpg", 600 / 338], banner: ["ZiLw5EdQE6x8jjM4Q817D/122df611ae7b63b61cdb85106e4503aa/EOY-2025-show-header.jpg", 600 / 229],
    alt: "Rot-weiß gestreifte Wand mit zwei gelben Sternen aus Karton und gerahmten Bildern",
    items: [
      ["christmas-baubles", "Christbaumkugeln mit Logo", "6xom3i1vWCZpKkeP3VBjF3/8993e6022637851cc5627e52cfe790d3/EOY_2025_Products_Christmas_bauble_collage_2-crystal.jpg"],
      ["window-sticker", "Fensteraufkleber", "6Rff6w2y7GrIeBmCE7rTL9/ae3ba46f28b27e4d084b1db2867b5a87/EOY_2025_Products_Window_sticker_def_1.jpg"],
      ["re-board-christmas", "Weihnachtsstern aus Karton", "77U0FnmeDCWqeAd6GKmqY8/9e7112b2e089f92c8bc7a0bcb6576349/EOY_2025_Products_Deco_re-board_V2.jpg"],
      ["inhaker-christmas-tree", "Christbaum aus Karton", "4352nVaJpfmuTmkXg5v9vW/f32a2c5a99eeb73794f3d358ed09dd31/EOY_2025_Products_Reboard_inhaker.jpg"],
      ["display-cube", "Display-Würfel", "aTKngikYjogWTbQOpgZgQ/e7389a4da5b91a55cf2d73203d18843a/EOY_2026_Products_Display_cubes.jpg"],
      ["stackable-pos-displays", "Stapelbare Displays", "7LL0a3HyU4rIaBnxcRDXZz/45e6f028175628167a6b294c7f382c54/Stackable_cube_display_EOY_1.jpg"],
      ["round-tier-shelf", "Etagere-Display", "7jmddFotbetlqGncAp2DXP/b70ebfaf964993c0c8b7d6e326692c6d/EOY_2026_Round_tier_display_square_total.jpg"],
      ["cardboard-photo-frame", "Bilderrahmen aus Karton", "5NQEQY8GzJnJvHanXJrke7/45115687c02250c6af25375e4db8e368/EOY_2025_Products_cardboard_photo_frames_A.jpg"],
      ["wallpaper", "Tapete mit eigenem Motiv", "1K6EnRz0W7wXMw24BN17Tu/b8856dffa8caa2249fbfe45ddd48de60/EOY-2025-show-wallpaper.jpg", 1],
      ["hockers", "Sitzhocker", "7uUaM7SK0V68xJN5hBrf5r/e8c725812c47504eab1e4ae7e8fa23fe/Hocker_Catalogi_vierkant_40_cm.jpg"]
    ] },
  { slug: "verschenken", nav: "Verschenken", title: "Kleine Geschenke",
    text: "Adventskalender, Thermoflaschen, Duftkerzen, Spielkarten und Genuss-Sets mit Logo oder Namen – für dein Team, deine Kundschaft und Geschäftspartner.",
    tile: ["1gWL8K8ttHMDjwzunw8ygf/6e1735052fa8f7a7d08a49368d9905c7/ac8faa55-8d7e-4812-9d26-77f4637febf1.jpg", 600 / 450], banner: ["1808xF5TA4amRTF8BJVCXH/d4b2c6545e1861818df8ba8b646704bb/ac8faa55-8d7e-4812-9d26-77f4637febf1.jpg", 600 / 261],
    alt: "Geschenkschachtel mit Christbaumkugeln, Weihnachtsstrumpf, Zuckerstange und Karten unter dem Christbaum",
    items: [
      ["premium-advent-calendar", "Adventskalender Premium", "2sbBbKFCQrzf307XAnemz3/810c1332880e39f71f82658ede33173d/e63c1e5c-61e2-4d98-8092-fac906c643cd.jpg"],
      ["basic-advent-calendar", "Adventskalender", "3dO6jE5Y9Hzjn2zrgEdu6Q/3d2e98e64aea3f198feb54fdc4a65c56/Adventkalender_groen_logo_name.jpg"],
      ["scented-candles", "Duftkerzen", "3T5Epp32VfdOWgzdMozzad/543dcdae2f9210fb8ef66d6b41a03d56/EOY_2025-GIVE-candle.jpg", 1],
      ["rvs-bamboo-teabottle", "Thermoflasche mit Teesieb", "4b8utET8vqDqDw6g3GtJD8/c804ef7c272b9333df904964174db72d/EOY_2025_Products_Water_bottle_Bamboo-crystal.jpg"],
      ["christmas-baubles", "Christbaumkugeln", "6Z8b25Pyz3woYZXEOU0EVl/1c504592d929791dfc111be62aa8d682/EOY_2025_Products_Christmas_bauble_red-crystal.jpg"],
      ["playing-cards", "Spielkarten", "1cJFPGHWGItZ7Wo4FMosrb/ed01fedb66bbd7237a3dc500167e782b/EOY_2025_Products_Playing_cards.jpg"],
      ["tea-tubes", "Tee im Reagenzglas", "4UFLgIhFxrloY5hkh0Y8ei/c3c3c127cc7e0c8faf3ab3fb9a8d6b4e/Tube_giftset_packaging_1_tube_tea_1.jpg"],
      ["tubes-giftset", "Reagenzglas-Geschenkset", "1eR768mtj56Z1eT13biBat/7becf54aeb540960335bc57df389db4c/Tube_giftset_wine.jpg"],
      ["olive-salt-pepper-tubes", "Olivenöl, Salz & Pfeffer im Reagenzglas", "3CmDRnG5UTcy4ZBeu67yQJ/1229cb5eea58a6e8014fc6c2b22df392/2af3cb92-74fa-4d1e-b887-7b3691b6cf5f.jpg"],
      ["shot-glasses-set", "Schnapsgläser-Set", "1GUlft45dAPVES4qcvQlC1/eae231f5890f2feec776c3d4d9b6d99b/shot-glass-total_720.jpg"],
      ["wine-set", "Wein-Set", "3PbO3lbOpsgKyNj2s7K1qh/25bb739babac166813d0cdc54127ff0b/Wine-Set-Open.jpg"],
      ["beer-crate", "Flaschenträger", "658wDMCpGbluLmqZlMBQtm/0a69da35daeb709cbd9b553b00f3a0a8/Beer-Crate-Full.jpg"],
      ["lunch-boxes", "Lunchboxen", "1Mse6Z6qOknB8w6rG2pVT0/ef4bb67e70e77e1a1fa363fe5ebdd575/Lunch-Box-Total.jpg"],
      ["bamboo-straw", "Trinkhalme aus Bambus", "5j7yJuXorNVyQ56FHFIB96/7fee7e0a892cb078900d2eae379a2605/EOY_2025_Products_part_bamboo_straws_B.jpg"],
      ["trolley", "Trolley-Koffer", "2OLKv5UjKhoyRrD8UTZOHS/040eb6383805b8f9d0400ee40da053a2/Trolley-EOY.jpg"],
      ["luxury-paper-bag-window", "Papiertaschen mit Fenster", "54Kw7diqU7STIdb7KZzaUS/6063ab3b9dc915b59c7d2933e5ddf073/luxury-paper-bag-window-family__1_.jpg"],
      ["recycled-bag", "Taschen aus recycelter Baumwolle", "3ctbFlWmRFk9bU641WAAZP/22d205e1a9051bdab9018bb05bf7bc73/recycled-bag-family.jpg"],
      ["gift-bag-bow", "Geschenktaschen mit Schleife", "aYt6bk4mvAEOfNkauPFQZ/604268b1b878d9ed7f6fa8b9a845c4df/Giftbag-bow-EOY.jpg"]
    ] },
  { slug: "geniessen", nav: "Genießen", title: "Feiern & genießen",
    text: "Weinetiketten, Flaschenanhänger, Menükarten, Tischsets und Weinverpackungen – für die Weihnachtsfeier, das Restaurant oder als Präsent für gute Kunden.",
    tile: ["6vWlrSQTnIGiejBPKXx1gN/848d8ba9594f0af05704dbbf679b732e/2026-EOY-wine-gifting-kit-header.jpg", 600 / 473], banner: ["3cG7HAJwS0dWPlYjN9yi0F/ec1e3bbb2ee06d8e80dcefe29452ef6f/2026-EOY-wine-gifting-kit-header.jpg", 600 / 261],
    alt: "Weinflasche mit eigenem Etikett, Weintasche, Geschenkschachtel und Fondue-Topf auf rotem Hintergrund",
    items: [
      ["luxurious-labels", "Weinetiketten", "5PUDRfLsTNLzMfJQJ7ZL9c/84429438f04545f25b40659cffeb0302/2026-eoy-wine-gifting-kit-winelabels_1024.jpg"],
      ["wine-hang-tags", "Flaschenanhänger", "22ligsQF8CmxNptjsedNz7/96867b98ce7a6dc9e242858dba96b8c0/2026-EOY-wine-gifting-kit-winetags.jpg"],
      ["wine-bags", "Weintaschen", "2r7Rt84YV8ZUiFRMtI6dem/744c84779955a1a7d0a083570f35a588/2026-EOY-wine-gifting-kit-winebag.jpg"],
      ["wine-packaging", "Geschenkschachteln für Flaschen", "7nZkxGwSrnDPebTUBj44FQ/788bfbc81a5adca444fe651284a55086/Wine_packaging_printed_white.jpg"],
      ["wineboxes-basic-wood", "Weinkisten aus Holz", "2Q5W8okXICaDoaxRXHWKY2/77a2a77274d3f4fcf6c1a96c3d4b4d0b/EOY_2025_Products_wooden_wine_box_detail.jpg"],
      ["wineboxes-pet-felt", "Weinkisten aus Filz", "26wZVMQTbcDBauBhoPoZqW/d555536dd61b640f5b8338950eb61dce/Winebox-Felt-Total.jpg"],
      ["wine-cooler", "Weinkühler", "7IqqVOC48RzpWX184Xihcp/b40370a60e399db6a3abba13de13114a/wine_cooler_front_2_720.jpg"],
      ["allegra-wine-glass-35cl", "Weingläser rundum bedruckt", "fS7hmLHVXDI3Ijaf2nDkD/e35acbd57ef6adb8ba52225242e0d91b/EOY_2025_Glassware_wine_glass_1.jpg"],
      ["menus", "Menükarten", "3JU9Qa9VDll2EdIgFEqyOo/6ae1de0cad5d9adca03e273a8d84992b/EOY-2025-serve-menus.jpg"],
      ["display-standing-triangle", "Tischaufsteller", "IMAwR2HShEiU2UuuGJHqD/b00629c45e1be74b3476f3ded2c95f71/EOY_2025_Products_Table_cards.jpg"],
      ["placemats", "Tischsets", "74ipUguU8GGY5o3khAZTPY/ba72b9686c06b27c29a3418bd6e14daa/hospitality_placemats_4_720.jpg"],
      ["beer-mats", "Bierdeckel", "5HANETjwRzMf2TG7t24jku/cfa96af7bedc479446acabad6425215a/2026-EOY-wine-gifting-kit-beermats__1_.jpg"],
      ["cutlery-pouches", "Bestecktaschen", "7JuAQ10dMkcvYpR8KozLIC/431d9097c4247a3e9130d9fa55c9cfd7/EOY-2025-serve-cutlery-bag.jpg", 1],
      ["wooden-block-stand", "Kartenhalter aus Holz", "3OxLDxNqJtOh9ZrbGjJqHf/c4be5250d4e71629217428db01480b35/EOY_2025_Products_Wooden_bloc_forex.jpg"],
      ["polystone-block-stand", "Kartenhalter aus Polystone", "n6utMLziIkAZJMVPDx6IL/45f53524c5db8a55f71304da27ff022a/Polystone-block-stand-two-sizes.jpg"],
      ["table-flag", "Tischflaggen", "2uy8O4YKxt00e59W0xbF4H/34d328803a63aa662862705639fba3cd/Wooden-Table-Flag-Total-Large.jpg"],
      ["apron-all-over", "Schürzen rundum bedruckt", "5Nj5DpKhXMJN4JChszQvo9/e02e8d9fd51aab69a26d9b53b396ae35/EOY_2025_Product_Apron_A.jpg"],
      ["chocolate-christmas-sleeve", "Schoko-Christbäume mit Banderole", "6CBBNwDz8hP9kES5SVS5g3/def45cfb244f82a306f4a9938ea42e2e/Chocoladeletter_goud_kerst-bewerkt__1_.jpg"],
      ["slider-boxes", "Schiebeschachteln", "3M7XgpA2VQW6hpMcF2GX7o/e67c34e3b1f9d364e1aa1cc5da31552c/Slider_boxes_front_open_2.jpg"],
      ["telescopic-boxes", "Stülpschachteln", "2WcMfR4O9zqEJMN2u8TS6w/d0377ecf84a6a1eb922d8014fb5a1c81/telescopic-box-365-365-140-mm-ontop.jpg"],
      ["luxury-paper-bag", "Papiertragetaschen Deluxe", "4L4m2nH627veLwMswIH3b1/9d3aa8630a30969d112e51b2fabc5691/luxury-paper-bag-red-family.jpg"]
    ] },
  { slug: "winterlook", nav: "Winter-Look", title: "Warm eingepackt",
    text: "Hauben, Touch-Handschuhe, Fleecedecken und Weihnachtspullover mit eurem Logo – fürs Team oder als Geschenk, das man gern trägt.",
    tile: ["5fIb52QkwsoCnXiJFo6tN2/c82715a2bf2959629ca48ac53e3fcb8e/EOY-2025-DRESS-header.jpg", 600 / 338], banner: ["6p9YCAyHHhkUclaCwur6je/88203da8da86075b0b51939f489536ce/EOY_2025-DRESS-header.jpg", 600 / 229],
    alt: "Haube, Handschuhe, Schal und Jacke mit Logo auf Baumstümpfen im Schnee neben einem Lagerfeuer aus Papier",
    items: [
      ["christmas-hats", "Weihnachtsmützen", "7tngIHab11kFpjHnVc3Zgt/c5a43933ba4cf3ee2859c2e6a1891915/EOY-2023-christmas-hats-grey-1174x624.jpg", 1],
      ["glove-touch", "Touch-Handschuhe", "2oPo35zH8QDQNtZ4sU4mpI/2827457c2bb09affa8700e2b1e6cbf72/EOY_2025_Products_Textile_gloves.jpg"],
      ["blanket-all-over-1", "Fleecedecken rundum bedruckt", "3A4JiJo1t6LIVxtnqg9OoM/887cb36ac5d0e0def4250cdf755fbcca/EOY_2025_Products_Textile_fleece_blanket.jpg"],
      ["christmas-sweater", "Weihnachtspullover", "2oNIRgEJn1RV2gC7xrOZUG/d407633432c479e5623b8d24c04febea/chrismas-sweater_green_front.jpg"]
    ] },
  { slug: "kundengeschenke", nav: "Für Kunden", title: "Danke an deine Kundschaft",
    text: "Gutscheine, Kundenkarten aus PVC, Rubbellose und die passende Verpackung – für Aktionen im Weihnachtsgeschäft und als Dankeschön an Stammkunden.",
    tile: ["2JfFF41oOoT50jHiRQEeBD/ee0730582bdb8c383825b02c8a5ee27a/2026-EOY-_loyalty_kit_-_header__1_.jpg", 600 / 450], banner: ["5FXZnUzS6W3140htl8y34f/1e6e71bb8118769c2297a9557f8fa387/2026-EOY-_loyalty_kit_-_header__1_.jpg", 600 / 261],
    alt: "Gutscheinbox aus Karton, Gutschein, Rubbellos, Kundenkarte und Geschenktasche in rot-weißem Design",
    items: [
      ["postcards", "Gutscheinkarten", "6LJBdECe9MImdb9vDHKcmB/861a5685217046fa2fbbc0ba11b76dd8/2026-EOY-_loyalty_kit_-_voucher.jpg"],
      ["pvc-cards", "Kundenkarten aus PVC", "64IRkCQAyTW1gI9f9h38SM/577c2399e3947a00f4bc892b55caaa1b/2026-EOY-_loyalty_kit_-_PVC_card.jpg"],
      ["scratch-off", "Rubbellose", "dbmX1YJEpbPZ1CRiF1Ytd/52d8390b6466089818177ebafadf7e7d/2026-EOY-_loyalty_kit_-_scratch_card.jpg"],
      ["giftcard-holders", "Gutscheinbox", "6McW7xML2wzzwvV2V7kXie/ab0b824fb6be5c9c1d6cd866e309b6b9/2026-EOY-_loyalty_kit_-_gift_card_holder__1_.jpg"],
      ["gift-bag", "Geschenktaschen", "2LUxBL718wPA8UWIEjO2LN/17ea8ce20a643964c0f252d3cf8a29f7/2026-EOY-_loyalty_kit_-_gift_bag.jpg"],
      ["pillow-packs", "Kissenverpackungen", "15rcw39QcSixPZvDKEHR9m/b9911c91f8d3c5c09a59edf6b36dff8e/2026-EOY-_loyalty_kit_-_pillow_pack.jpg"]
    ] },
  // Kachel/Banner aus den eigenen Produktfotos (das Set-Bild von Print.com ist dasselbe wie bei „Verpacken“)
  { slug: "verpackungsset", nav: "Im Set", title: "Alles im gleichen Design",
    text: "Etiketten, Geschenkband, Geschenkpapier, Versandkarton und Karten aufeinander abgestimmt – ideal für Online-Shops, Geschenkboxen und Firmenpakete.",
    tile: ["5VDzwsLi2ERG096VJ5zpZy/e9f912a18c6e9d3c8ed34b42c7f165dc/2026-EOY-wrapping-kit-mailbox.jpg", 1], banner: null,
    alt: "Versandkarton, Geschenkpapier und Geschenkband im gleichen Muster",
    items: [
      ["letterbox-box-with-lid", "Versandkartons mit Klappdeckel", "5VDzwsLi2ERG096VJ5zpZy/e9f912a18c6e9d3c8ed34b42c7f165dc/2026-EOY-wrapping-kit-mailbox.jpg"],
      ["gift-wrapping", "Geschenkpapier", "6HrUnGWFX1B17fvgCFkGsF/7dd075cc4526ac98d01c5d6c024f54c6/2026-EOY-wrapping-kit-wrapping-paper__1_.jpg"],
      ["ribbon", "Geschenkband", "6djKCY48hOwGSHB6G119g8/854f04e0d23c7f4673b47796351c07b4/2026-EOY-wrapping-kit-ribbon.jpg"],
      ["luxurious-labels", "Etiketten auf Rolle", "1d7TZ7ey0rM0SAquew0fmK/faa9db2a65f37893b1dddbb4eda3c257/92246a64-0736-400d-90e9-91e2055cd419.jpg"],
      ["wooden-postcards", "Holzkarten", "7CaLSVFcCkikJyjP9sR0TS/52bd41fcbc527f088fd64347d2a56752/2026-EOY-wrapping-kit-cards.jpg"],
      ["premium-advent-calendar", "Adventskalender Premium", "3uBH6WBdERjAqkrDEwpWcQ/9b4b7e703b7fe9669ec4543ff30518fc/2026-EOY-wrapping-kit-advent-calendar.jpg"]
    ] }
];

// Datum in Wien als „JJJJ-MM-TT“
const viennaDay = now => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(now ? new Date(now) : new Date());
// Saison: on = Abteilung sichtbar; before = Weihnachten steht noch bevor (Liefertermin-Hinweise); deadline = letzter sinnvoller Zustelltag
// PRINT_XMAS=1 erzwingt die Abteilung (Test/Vorschau), PRINT_XMAS=0 schaltet sie ab.
function season(now) {
  const d = viennaDay(now), md = d.slice(5), y = +d.slice(0, 4), force = process.env.PRINT_XMAS;
  const inWin = md >= SEASON.from || md <= SEASON.to, year = md >= "07-01" ? y : y - 1;
  const on = force === "1" ? true : force === "0" ? false : inWin;
  return { on, before: on && md >= "07-01" && md <= SEASON.last, today: d, deadline: year + "-" + SEASON.last, year };
}
// Alle Produkt-Keys (einmalig, in Seitenreihenfolge)
const keys = () => Array.from(new Set([].concat.apply([], THEMES.map(t => t.items.map(i => i[0])))));
// Jahreskalender mit falschem Jahr (z. B. „Monatskalender 2026“ zu Weihnachten 2026) nicht vorschlagen – erscheinen automatisch, sobald der Titel das neue Jahr trägt
function staleYear(title, sea) { const m = String(title || "").match(/\b(20\d\d)\b/); return !!(m && +m[1] <= sea.year); }
// Bild über unseren Proxy, WebP in fester Breite (Proxy rundet auf feste Stufen)
const img = (p, w) => PROXY + p + "?fm=webp&w=" + w + "&q=75";
const srcset = (p, ws) => ws.map(w => img(p, w) + " " + w + "w").join(", ");
const escH = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eurDe = n => (Math.round(n * 100) / 100).toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u00a0€";
const dayDe = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? +m[3] + "." + +m[2] + "." : ""; };
const wdDe = iso => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z"); return isNaN(d) ? "" : ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][d.getUTCDay()] + ".\u00a0"; };

// Preiszeile wie Shop-Karten und Website-Startseite: „ab 49,90 €“, darunter Menge und Stückpreis (Werbeartikel: Stückpreis groß, darunter Menge und Summe)
function priceHtml(x) {
  if (!x || !(x.gross > 0)) return '<span class="xm-p xm-p0">Preis sofort im Konfigurator</span>';
  const n = +x.copies || 1, stkTxt = n.toLocaleString("de-AT") + "\u00a0Stk.", per = eurDe(x.gross / n).replace(/(,\d\d)\d*/, "$1");
  if (x.promo && n > 1) return '<span class="xm-p">ab <b>' + per + "</b>/Stk.<small>" + stkTxt + " · " + eurDe(x.gross) + "</small></span>";
  return '<span class="xm-p">ab <b>' + eurDe(x.gross) + "</b><small>für " + stkTxt + (n > 1 ? " · " + per + "/Stk." : "") + "</small></span>";
}
// Liefertermin: frühester Tag aus der Preisberechnung (Standard-Produktion, Versand nach Österreich)
function shipHtml(x, sea) {
  if (!x || !x.date) return "";
  const late = sea.before && x.date > sea.deadline;
  const d = '<span class="xm-dd">' + wdDe(x.date) + dayDe(x.date) + "</span>";
  if (late) return '<span class="xm-d late"><i aria-hidden="true"></i><span>Kommt erst nach Weihnachten an (voraussichtlich ab ' + d + ")</span></span>";
  return '<span class="xm-d' + (sea.before ? " ok" : "") + '"><i aria-hidden="true"></i><span>Lieferung voraussichtlich ab ' + d + "</span></span>";
}
function cardHtml(it, x, sea, i) {
  // Ging die Startauflage bei der Prüfung nicht (z. B. kein Versand für 500 Stk.), öffnet der Link den Konfigurator gleich mit der geprüften Menge
  const menge = x && x.ok && x.copies && x.start && x.copies !== x.start ? x.copies : 0, name = it[1];
  const href = "/print?produkt=" + encodeURIComponent(it[0]) + (menge ? "&menge=" + menge : "");
  return '<a class="xm-card' + (it[3] ? " wide" : "") + (i >= MOB ? " xm-x" : "") + (x && x.date && sea.before && x.date > sea.deadline ? " is-late" : "") + '" href="' + escH(href) + '" data-prod="' + escH(it[0]) + '"' + (menge ? ' data-copies="' + menge + '"' : "") + '>' +
    '<span class="xm-ph"><img src="' + escH(img(it[2], it[3] ? 800 : 400)) + '" srcset="' + escH(srcset(it[2], it[3] ? [600, 800, 1200] : [300, 400, 600, 800])) + '" sizes="' + (it[3] ? "(max-width: 760px) 92vw, 520px" : "(max-width: 760px) 46vw, 260px") + '" width="' + (it[3] ? 800 : 400) + '" height="400" alt="' + escH("Beispielfoto: " + name) + '" loading="lazy" decoding="async"></span>' +
    '<span class="xm-bd"><b>' + escH(name) + "</b>" + priceHtml(x) + shipHtml(x, sea) + "</span></a>";
}
// Am Handy je Thema zuerst nur so viele Karten (Rest über „Alle … zeigen“), am Computer alle
const MOB = 6;
// Bewusst nicht vorgeschlagen (Prüfung 28.10.2026): Weihnachtspullover – Print.com verlangt eine Eigenschaft „size“, die das Produkt im Shop nicht hat → nie ein Preis
const OFF = { "christmas-sweater": 1 };
// Sichtbare Vorschläge eines Themas: nur im Shop freigeschaltete Produkte; nach der Prüfung nur mit Preis (vorher – erste Minuten nach einem Neustart – ohne Preiszeile)
function visible(t, data, shown) {
  return t.items.filter(it => { const x = data[it[0]]; if (OFF[it[0]] || (shown && !shown[it[0]])) return false; if (x && x.stale) return false; return !x || x.ok !== false; });
}
// Inhalt der Weihnachtsseite (serverseitig gerendert; app.js übernimmt dasselbe HTML als Ansicht „Weihnachten“)
// data: { key: { ok, gross, copies, promo, date, title, stale } }, shown: { key: true } = im Shop freigeschaltet
// Themen mit mindestens zwei sichtbaren Vorschlägen (ein einzelner Vorschlag ist kein Thema)
const pick = (data, shown) => THEMES.map(t => ({ t, items: visible(t, data || {}, shown) })).filter(x => x.items.length >= 2);
// Anzahl Vorschläge (verschiedene Produkte) für den Teaser
const count = (data, shown) => new Set([].concat.apply([], pick(data, shown).map(x => x.items.map(i => i[0])))).size;
function render(data, shown, sea, opts) {
  data = data || {}; opts = opts || {};
  const themes = pick(data, shown);
  const hero = '<section class="xm-hero" aria-labelledby="xmH"><picture><source media="(max-width: 700px)" srcset="' + escH(img(HERO.img, 900)) + '">' +
    '<img src="' + escH(img(HERO.img, 1600)) + '" srcset="' + escH(srcset(HERO.img, [1000, 1600, 2000])) + '" sizes="(max-width: 1760px) 96vw, 1680px" width="1600" height="696" alt="' + escH(HERO.alt) + '" fetchpriority="high" decoding="async"></picture>' +
    '<div class="xm-hero-t"><span class="xm-eb">Weihnachten ' + sea.year + "</span><h1 id=\"xmH\">Weihnachten mit deinem Design</h1>" +
    "<p>Karten, Kalender, Verpackung und kleine Geschenke – mit Logo, Foto oder eigenem Motiv gedruckt und in ganz Österreich geliefert.</p>" +
    (sea.before ? '<p class="xm-note">Bei jedem Produkt steht, wann es voraussichtlich ankommt. Für Lieferung vor dem 24.&nbsp;Dezember: rechtzeitig bestellen und die Druckdaten gleich mitschicken.</p>' : "") +
    '<a class="ps-btn primary" href="#xm-themen">Ideen ansehen</a></div></section>';
  const tiles = '<h2 class="xm-h" id="xm-themen">Ideen nach Thema</h2><nav class="xm-tiles" aria-label="Themen der Weihnachtsabteilung">' + themes.map(x => '<a class="xm-tile" href="#' + x.t.slug + '"><span class="xm-tph"><img src="' + escH(img(x.t.tile[0], 400)) + '" srcset="' + escH(srcset(x.t.tile[0], [300, 400, 600])) + '" sizes="(max-width: 560px) 46vw, 220px" width="400" height="300" alt="" loading="lazy" decoding="async"></span><b>' + escH(x.t.nav) + "</b><small>" + x.items.length + " Ideen</small></a>").join("") + "</nav>";
  const secs = themes.map(x => {
    const b = x.t.banner, collage = !b ? x.items.slice(0, 3).map(i => '<img src="' + escH(img(i[2], 600)) + '" srcset="' + escH(srcset(i[2], [400, 600, 800])) + '" sizes="(max-width: 700px) 33vw, 400px" width="400" height="400" alt="" loading="lazy" decoding="async">').join("") : "";
    return '<section class="xm-sec" id="' + x.t.slug + '" aria-labelledby="xm-h-' + x.t.slug + '">' +
      '<div class="xm-band' + (b ? "" : " collage") + '">' + (b ? '<img src="' + escH(img(b[0], 1600)) + '" srcset="' + escH(srcset(b[0], [800, 1200, 1600, 2000])) + '" sizes="(max-width: 1760px) 96vw, 1680px" width="1600" height="' + Math.round(1600 / b[1]) + '" alt="' + escH(x.t.alt) + '" loading="lazy" decoding="async">' : '<div class="xm-col" role="img" aria-label="' + escH(x.t.alt) + '">' + collage + "</div>") +
      '<div class="xm-band-t"><h2 id="xm-h-' + x.t.slug + '">' + escH(x.t.title) + "</h2><p>" + escH(x.t.text) + "</p></div></div>" +
      '<div class="xm-grid">' + x.items.map((it, i) => cardHtml(it, data[it[0]], sea, i)).join("") + "</div>" +
      (x.items.length > MOB ? '<button type="button" class="ps-btn xm-allb" data-act="xmall">Alle ' + x.items.length + " Ideen zu „" + escH(x.t.nav) + "“ zeigen</button>" : "") + "</section>";
  }).join("");
  const foot = '<section class="xm-foot"><h2>Nicht das Passende dabei?</h2><p>Im Sortiment findest du über 900 Produkte – oder wir gestalten deine Weihnachtskarte, dein Etikett oder deine Verpackung für dich.</p><div class="btn-row"><a class="ps-btn primary" href="/print?produkte">Alle Produkte</a><a class="ps-btn" href="/kontakt?von=print&amp;thema=Weihnachten">Gestaltung anfragen</a></div>' +
    '<p class="xm-fine">Preise inkl. 20&nbsp;% USt und Versand innerhalb Österreichs, jeweils für die angegebene Menge in der Standardausführung. Liefertermine sind voraussichtliche Termine bei Standard-Produktion; der genaue Termin steht im Konfigurator und in der Bestellbestätigung. Fotos sind Beispiele.</p></section>';
  const keys = Array.from(new Set([].concat.apply([], themes.map(x => x.items.map(i => i[0])))));
  const preload = '<link rel="preload" as="image" imagesrcset="' + escH(srcset(HERO.img, [1000, 1600, 2000])) + '" imagesizes="(max-width: 1760px) 96vw, 1680px" fetchpriority="high">';
  return { html: '<div class="xm" data-xmas>' + hero + tiles + secs + foot + "</div>", count: keys.length, keys, preload, themes: themes.map(x => ({ slug: x.t.slug, title: x.t.title, items: x.items.map(i => i[0]) })) };
}

module.exports = { THEMES, HERO, SEASON, season, keys, staleYear, render, count, img, viennaDay };
