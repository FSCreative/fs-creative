/* Marketing: eine Reel-Szene in einem eigenen Thread rechnen (mkt-motion.js verteilt die Szenen eines Reels auf mehrere Threads –
   das Bild-für-Bild-Rechnen mit satori/resvg ist CPU-gebunden und läuft so parallel). */
"use strict";
const { parentPort } = require("worker_threads");
const R = require("./mkt-render.js"), MO = require("./mkt-motion.js")(R);
parentPort.on("message", async m => {
  try { const r = await MO._scene(m.s, m.brand, m.o, m.i, m.len, m.delay, m.punch); parentPort.postMessage({ id: m.id, ok: true, r }); }
  catch (e) { parentPort.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) }); }
});
