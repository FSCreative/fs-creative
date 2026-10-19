"use strict";
/* Echte Besucher-IP (für Rate-Limits und Login-Sperre).
   Auf Railway: X-Real-IP – setzt Railways Edge selbst mit der Adresse, die sie sieht (Live-Prüfung 19.10.2026: Domain läuft direkt über Railways Edge,
   nicht über einen eigenen Cloudflare-Proxy). Ist das eine Cloudflare-Adresse (eigener Cloudflare-Proxy davor), gilt CF-Connecting-IP.
   Sonst (lokal/Tests): X-Forwarded-For wird von RECHTS gelesen: die rechten Einträge hängen unsere Proxys an, links kann der Besucher beliebiges eintragen.
   Private/interne Adressen (Railway) werden übersprungen; ist der erste öffentliche Eintrag eine Cloudflare-Adresse, gilt CF-Connecting-IP
   (setzt Cloudflare selbst, vom Besucher nicht fälschbar). Direkte Zugriffe an Cloudflare vorbei liefern die von Railway gesehene Adresse. */
const net = require("net");
const CF = [["173.245.48.0", 20], ["103.21.244.0", 22], ["103.22.200.0", 22], ["103.31.4.0", 22], ["141.101.64.0", 18], ["108.162.192.0", 18], ["190.93.240.0", 20], ["188.114.96.0", 20],
  ["197.234.240.0", 22], ["198.41.128.0", 17], ["162.158.0.0", 15], ["104.16.0.0", 13], ["104.24.0.0", 14], ["172.64.0.0", 13], ["131.0.72.0", 22],
  ["2400:cb00::", 32], ["2606:4700::", 32], ["2803:f800::", 32], ["2405:b500::", 32], ["2405:8100::", 32], ["2a06:98c0::", 29], ["2c0f:f248::", 32]];
const PRIV = [["10.0.0.0", 8], ["172.16.0.0", 12], ["192.168.0.0", 16], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["0.0.0.0", 8], ["fc00::", 7], ["fe80::", 10], ["::1", 128]];
const fam = ip => net.isIPv4(ip) ? "ipv4" : net.isIPv6(ip) ? "ipv6" : null;
const list = arr => { const b = new net.BlockList(); arr.forEach(x => b.addSubnet(x[0], x[1], fam(x[0]))); return b; };
const CFL = list(CF), PRIVL = list(PRIV);
const norm = ip => String(ip || "").trim().replace(/^\[|\]$/g, "").replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, "$1");
const isCf = ip => { const f = fam(ip); return !!f && CFL.check(ip, f); };
let diag = 0;
function railwayIp(req) {
  const h = req.headers || {}, rip = norm(h["x-real-ip"]), f = fam(rip); if (!f) return "";
  if (CFL.check(rip, f)) { const cf = norm(h["cf-connecting-ip"]); return fam(cf) ? cf : rip; }
  return rip;
}
const cls = ip => { const f = fam(ip); return !f ? "ungültig" : PRIVL.check(ip, f) ? "privat" : CFL.check(ip, f) ? "cloudflare" : "öffentlich"; };
function clientIp(req) {
  if (process.env.RAILWAY_ENVIRONMENT) {
    const r = railwayIp(req);
    if (diag < 3 && req.headers && req.headers["x-forwarded-for"]) { diag++;   // Kontrolle der Annahmen (ohne IP-Adressen)
      const x = String(req.headers["x-forwarded-for"]).split(",").map(norm), cf = norm(req.headers["cf-connecting-ip"]);
      console.log("IP-Kette: X-Real-IP " + (r ? cls(norm(req.headers["x-real-ip"])) : "fehlt") + ", XFF " + x.map(cls).join(" › ") + ", XFF[0] = X-Real-IP: " + (x[0] === r ? "ja" : "nein") + ", CF-Connecting-IP = X-Real-IP: " + (cf ? (cf === r ? "ja" : "nein") : "fehlt")); }
    if (r) return r.slice(0, 64);
  }
  const chain = String((req.headers && req.headers["x-forwarded-for"]) || "").split(",").map(norm).filter(Boolean).concat(norm(req.socket && req.socket.remoteAddress));
  let out = "";
  for (let i = chain.length - 1; i >= 0; i--) {
    const ip = chain[i], f = fam(ip); if (!f || PRIVL.check(ip, f)) continue;
    if (CFL.check(ip, f)) { const cf = norm(req.headers["cf-connecting-ip"]); out = fam(cf) ? cf : (chain[i - 1] && fam(chain[i - 1]) ? chain[i - 1] : ip); }
    else out = ip;
    break;
  }
  if (!out) out = chain[chain.length - 1] || "";
  return out.slice(0, 64);
}
// Zähler für Rate-Limits: abgelaufene Einträge werden regelmäßig entfernt; nie die ganze Tabelle leeren
// (sonst könnte eine Flut neuer Schlüssel alle laufenden Sperren zurücksetzen). Bei Überlauf fallen die ältesten Schlüssel weg.
function hitCounter(cap, keep) {
  const M = new Map(); let pruned = 0; cap = cap || 20000; keep = keep || 3600000;
  function prune(now) { pruned = now; for (const [k, v] of M) if (!v.length || now - v[v.length - 1] > keep) M.delete(k);
    // Überlauf: zuerst Schlüssel mit nur einem Treffer (typische Flut), dann die ältesten – Schlüssel mit vielen Treffern (laufende Sperren) bleiben
    if (M.size > cap) { const goal = Math.floor(cap * 0.9);
      for (const [k, v] of M) { if (M.size <= goal) break; if (v.length <= 1) M.delete(k); }
      for (const k of M.keys()) { if (M.size <= goal) break; M.delete(k); } } }
  // hit(key, max, win): true = Limit überschritten (Versuch wird mitgezählt)
  function hit(key, max, win) { const now = Date.now(); if (now - pruned > 60000 || M.size > cap) prune(now);
    const a = (M.get(key) || []).filter(t => now - t < win); a.push(now); M.delete(key); M.set(key, a.slice(-Math.max(max + 1, 1))); return a.length > max; }
  const count = (key, win) => { const now = Date.now(); return (M.get(key) || []).filter(t => now - t < win).length; };
  return { hit, count, reset: key => M.delete(key), get size() { return M.size; } };
}
module.exports = { clientIp, isCf, hitCounter };
