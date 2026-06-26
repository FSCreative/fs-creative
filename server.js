// FS Creative — serves the public static site AND a private admin
// (task manager + commission/fee tracker) backed by PostgreSQL.
const express = require("express");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "fscreative-admin";
const SESSION_SECRET = process.env.SESSION_SECRET || "fsc-dev-secret-change-me";
const COOKIE = "fscsess";
const MAX_AGE = 1000 * 60 * 60 * 24 * 14;

/* ============================ DB ============================ */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
const q = (t, p) => pool.query(t, p);

async function initDb() {
  await q(`CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'offen',
    priority TEXT DEFAULT 'mittel',
    due DATE,
    project TEXT DEFAULT '',
    done_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  );`);
  await q(`CREATE TABLE IF NOT EXISTS commissions (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    partner TEXT DEFAULT '',
    direction TEXT DEFAULT 'in',
    amount NUMERIC(12,2) DEFAULT 0,
    percent NUMERIC(6,2),
    base NUMERIC(12,2),
    period TEXT DEFAULT '',
    status TEXT DEFAULT 'offen',
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
  );`);
  await q("ALTER TABLE commissions ADD COLUMN IF NOT EXISTS site TEXT DEFAULT ''");
  // Seed example commissions once (the two the user mentioned).
  const c = await q("SELECT COUNT(*)::int AS c FROM commissions");
  if (c.rows[0].c === 0) {
    await q(
      `INSERT INTO commissions (title,partner,direction,amount,percent,base,period,status,note)
       VALUES
       ('Antonhaus – 5% Provision','Antonhaus','in',0,5,NULL,'','offen','5% Vermittlungsprovision auf Buchungen'),
       ('kochdu – Gebühren','kochdu','in',0,NULL,NULL,'','offen','Bestell-/Servicegebühren')`
    );
  }
  await q("UPDATE commissions SET site='Antonhaus' WHERE COALESCE(site,'')='' AND title LIKE 'Antonhaus%'");
  await q("UPDATE commissions SET site='kochdu' WHERE COALESCE(site,'')='' AND (partner='kochdu' OR title LIKE 'kochdu%')");
  const t = await q("SELECT COUNT(*)::int AS c FROM tasks");
  if (t.rows[0].c === 0) {
    await q(
      `INSERT INTO tasks (title,notes,status,priority)
       VALUES
       ('Antonhaus-Provision abrechnen','Beträge eintragen & Rechnung stellen','offen','hoch'),
       ('kochdu-Gebühren des Monats prüfen','','offen','mittel')`
    );
  }
}

/* ============================ AUTH ============================ */
function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return data + "." + mac;
}
function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [data, mac] = token.split(".");
  const exp = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  if (mac.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(exp))) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}
function cookies(req) {
  const out = {}; const raw = req.headers.cookie; if (!raw) return out;
  raw.split(";").forEach((p) => { const i = p.indexOf("="); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function checkPw(pw) {
  if (typeof pw !== "string" || !pw.length) return false;
  const a = Buffer.from(pw), b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function isAuthed(req) { return !!verify(cookies(req)[COOKIE]); }
function requireAuth(req, res, next) { if (isAuthed(req)) return next(); res.redirect("/admin/login"); }

/* ============================ HELPERS ============================ */
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function eur(n) {
  const v = Number(n || 0);
  return v.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
function parseAmount(v) {
  if (v == null || v === "") return null;
  let s = String(v).trim().replace(/[^0-9.,-]/g, "");
  if (s.indexOf(",") > -1) { s = s.replace(/\./g, "").replace(",", "."); }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function dstr(d) { if (!d) return ""; try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return ""; } }
const SITES = ["Blitzdings", "VALUERO", "kochdu", "La Taverna", "Antonhaus", "Musikfest Gaschurn-Partenen", "Ortsfeuerwehr Gaschurn", "Feuerwehrfest Gortipohl", "Spenglerei Flöry", "Paketshop", "FS Creative"];
function siteDatalist() { return '<datalist id="sites">' + SITES.map((s) => `<option value="${esc(s)}">`).join("") + "</datalist>"; }

/* ============================ ADMIN CSS ============================ */
const ADMIN_CSS = `
:root{--bg:#0a0a0f;--surface:#14141b;--surface2:#1b1b24;--ink:#f4f4f7;--muted:#9a9aa6;--faint:#6b6b76;--line:#262630;--accent:#0a84ff;--accent2:#5fb0ff;--green:#34c759;--amber:#ffb340;--red:#ff5f57;--radius:14px}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
a{color:var(--accent2);text-decoration:none}
.shell{display:flex;min-height:100vh}
.side{width:250px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--line);padding:24px 18px;position:sticky;top:0;height:100vh}
.side .logo{display:flex;align-items:center;gap:9px;font-weight:700;font-size:18px;margin-bottom:2px}
.side .logo img{width:24px;height:24px}
.side .sub{font-size:12px;color:var(--muted);margin-bottom:24px}
.side nav a{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-radius:10px;color:var(--muted);font-weight:500;font-size:14.5px;margin-bottom:4px}
.side nav a:hover{background:var(--surface2);color:var(--ink)}
.side nav a.active{background:var(--accent);color:#fff}
.side .badge{background:var(--accent);color:#fff;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px}
.side nav a.active .badge{background:rgba(255,255,255,.25)}
.side .foot{position:absolute;bottom:20px;left:18px;right:18px;font-size:13px}
.main{flex:1;padding:30px 38px;max-width:1100px}
.ptitle{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.ptitle h1{font-size:27px;letter-spacing:-.02em}
.btn{display:inline-flex;align-items:center;gap:7px;border-radius:10px;padding:10px 17px;font-weight:600;font-size:14px;cursor:pointer;border:1px solid transparent;font-family:inherit;transition:.15s}
.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:#3a9bff}
.btn-ghost{background:var(--surface2);color:var(--ink);border-color:var(--line)}.btn-ghost:hover{border-color:var(--accent)}
.btn-danger{background:transparent;color:var(--red);border-color:#5e2f2f}.btn-danger:hover{background:var(--red);color:#fff}
.btn-sm{padding:7px 12px;font-size:13px}
.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px}
.stat .l{font-size:12.5px;color:var(--muted)}
.stat .n{font-size:26px;font-weight:700;margin-top:6px;letter-spacing:-.02em}
.stat .n.green{color:var(--green)}.stat .n.amber{color:var(--amber)}.stat .n.red{color:#ff8a82}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.card h2{font-size:16px;margin-bottom:14px}
.rows{display:flex;flex-direction:column;gap:10px}
.row{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px}
.row .info{flex:1;min-width:0}
.row .info h3{font-size:15.5px}
.row .info p{font-size:13px;color:var(--muted);margin-top:2px}
.row .acts{display:flex;gap:7px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.amt{font-weight:700;font-size:15px;white-space:nowrap}
.amt.in{color:var(--green)}.amt.out{color:#ff8a82}
.tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--surface2);color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.tag.offen{background:#3a2d18;color:#ffce6a}.tag.verrechnet{background:#16263a;color:#7fb6ff}.tag.bezahlt{background:#16331f;color:#5fd07f}
.tag.erledigt{background:#16331f;color:#5fd07f}.tag.in_arbeit{background:#16263a;color:#7fb6ff}
.tag.hoch{background:#3a1d1d;color:#ff8a82}.tag.mittel{background:#33301a;color:#ffce6a}.tag.niedrig{background:#1d2a33;color:#7fb6ff}
.tag.dir-in{background:#16331f;color:#5fd07f}.tag.dir-out{background:#3a1d1d;color:#ff8a82}
.muted{color:var(--muted)}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.chip{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 14px;font-size:13px;color:var(--muted);cursor:pointer}
.chip.active{background:var(--accent);border-color:var(--accent);color:#fff}
.form{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:26px;max-width:720px}
.fr{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.fr.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fr.three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
label{font-size:13px;font-weight:600}
input,select,textarea{font-family:inherit;font-size:14px;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);width:100%}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent)}
textarea{resize:vertical;min-height:74px}
.hint{font-size:12px;color:var(--faint)}
.form-actions{display:flex;gap:10px;margin-top:6px}
.empty{color:var(--muted);padding:30px;text-align:center}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:34px;width:100%;max-width:370px}
.login .logo{display:flex;align-items:center;gap:9px;font-weight:700;font-size:19px;justify-content:center}
.login .logo img{width:26px;height:26px}
.login .sub{text-align:center;color:var(--muted);font-size:13px;margin:6px 0 22px}
.err{background:#3a2020;color:#e89b8f;border:1px solid #5e2f2f;padding:10px 13px;border-radius:10px;font-size:13px;margin-bottom:14px}
.ok{background:#16331f;color:#7fe09a;border:1px solid #2f6e44;padding:10px 13px;border-radius:10px;font-size:13px;margin-bottom:14px}
@media(max-width:760px){.side{display:none}.main{padding:20px}.stat-grid{grid-template-columns:1fr 1fr}.fr.two,.fr.three{grid-template-columns:1fr}}
`;

/* ============================ ADMIN VIEWS ============================ */
const LOGO = '/logos/Logo%20Gl%C3%BChbirne%20Weiss.png';
function shell({ title, active, body, pending }) {
  const link = (href, label, badge) =>
    `<a href="${href}" class="${active === href ? "active" : ""}">${label}${badge ? `<span class="badge">${badge}</span>` : ""}</a>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · FS Creative Admin</title><style>${ADMIN_CSS}</style></head><body>
<div class="shell">
  <aside class="side">
    <div class="logo"><img src="${LOGO}" alt=""> FS Creative</div>
    <div class="sub">Admin & Manager</div>
    <nav>
      ${link("/admin", "Übersicht")}
      ${link("/admin/aufgaben", "Aufgaben", pending)}
      ${link("/admin/provisionen", "Provisionen")}
    </nav>
    <div class="foot"><a href="/" target="_blank">↗ Website</a><br><a href="/admin/logout">Abmelden</a></div>
  </aside>
  <main class="main">${body}</main>
</div></body></html>`;
}
function loginPage(err) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Login · FS Creative Admin</title><style>${ADMIN_CSS}</style></head><body>
<div class="login-wrap"><form class="login" method="POST" action="/admin/login">
  <div class="logo"><img src="${LOGO}" alt=""> FS Creative</div>
  <div class="sub">Admin-Anmeldung</div>
  ${err ? `<div class="err">${esc(err)}</div>` : ""}
  <div class="fr"><label>Passwort</label><input type="password" name="password" autofocus required></div>
  <button class="btn btn-primary" style="width:100%;justify-content:center" type="submit">Anmelden</button>
</form></div></body></html>`;
}

function dashboard(d) {
  const body = `
  <div class="ptitle"><h1>Übersicht</h1></div>
  <div class="stat-grid">
    <div class="stat"><div class="l">Offene Einnahmen</div><div class="n green">${eur(d.inOpen)}</div></div>
    <div class="stat"><div class="l">Offene Ausgaben</div><div class="n red">${eur(d.outOpen)}</div></div>
    <div class="stat"><div class="l">Offener Saldo</div><div class="n ${d.saldo >= 0 ? "green" : "red"}">${eur(d.saldo)}</div></div>
    <div class="stat"><div class="l">Offene Aufgaben</div><div class="n amber">${d.openTasks}</div></div>
  </div>
  <div class="card" style="margin-bottom:18px">
    <h2>Zu verrechnen / zu erhalten</h2>
    ${d.toInvoice.length ? `<div class="rows">${d.toInvoice.map(commRow).join("")}</div>` : `<p class="muted">Keine offenen Provisionen. <a href="/admin/provisionen/neu">Eintrag hinzufügen →</a></p>`}
  </div>
  <div class="card">
    <h2>Nächste Aufgaben</h2>
    ${d.nextTasks.length ? `<div class="rows">${d.nextTasks.map(taskRow).join("")}</div>` : `<p class="muted">Keine offenen Aufgaben. <a href="/admin/aufgaben/neu">Aufgabe hinzufügen →</a></p>`}
  </div>`;
  return shell({ title: "Übersicht", active: "/admin", body, pending: d.openTasks });
}

function taskRow(t) {
  const sTag = t.status === "erledigt" ? "erledigt" : t.status === "in_arbeit" ? "in_arbeit" : "offen";
  const sLabel = t.status === "in_arbeit" ? "In Arbeit" : t.status === "erledigt" ? "Erledigt" : "Offen";
  const meta = [t.project, t.due ? "fällig " + dstr(t.due) : ""].filter(Boolean).join(" · ");
  return `<div class="row">
    <div class="info"><h3>${esc(t.title)} <span class="tag ${sTag}">${sLabel}</span> <span class="tag ${esc(t.priority)}">${esc(t.priority)}</span></h3>
      ${meta ? `<p>${esc(meta)}</p>` : ""}${t.notes ? `<p>${esc(t.notes)}</p>` : ""}</div>
    <div class="acts">
      ${t.status !== "erledigt" ? `<form method="POST" action="/admin/aufgaben/${t.id}/erledigt" style="display:inline"><button class="btn btn-ghost btn-sm">✓ Erledigt</button></form>` : ""}
      <a class="btn btn-ghost btn-sm" href="/admin/aufgaben/${t.id}">Bearbeiten</a>
      <form method="POST" action="/admin/aufgaben/${t.id}/loeschen" style="display:inline" onsubmit="return confirm('Aufgabe löschen?')"><button class="btn btn-danger btn-sm">Löschen</button></form>
    </div></div>`;
}
function commRow(c) {
  const amt = effAmount(c);
  const sLabel = c.status === "verrechnet" ? "Verrechnet" : c.status === "bezahlt" ? "Bezahlt" : "Offen";
  const dirLabel = c.direction === "out" ? "Ausgabe" : "Einnahme";
  const sub = [c.partner, c.period, c.percent != null ? c.percent + "%" + (c.base != null ? " von " + eur(c.base) : "") : "", c.note].filter(Boolean).join(" · ");
  return `<div class="row">
    <div class="info"><h3>${esc(c.title)} ${c.site ? `<span class="tag" style="background:#16263a;color:#7fb6ff">${esc(c.site)}</span>` : ""} <span class="tag dir-${c.direction === "out" ? "out" : "in"}">${dirLabel}</span> <span class="tag ${esc(c.status)}">${sLabel}</span></h3>
      ${sub ? `<p>${esc(sub)}</p>` : ""}</div>
    <span class="amt ${c.direction === "out" ? "out" : "in"}">${c.direction === "out" ? "−" : "+"}${eur(amt)}</span>
    <div class="acts">
      <a class="btn btn-ghost btn-sm" href="/admin/provisionen/${c.id}">Bearbeiten</a>
      <form method="POST" action="/admin/provisionen/${c.id}/loeschen" style="display:inline" onsubmit="return confirm('Eintrag löschen?')"><button class="btn btn-danger btn-sm">Löschen</button></form>
    </div></div>`;
}
function effAmount(c) {
  if (c.amount != null && Number(c.amount) !== 0) return Number(c.amount);
  if (c.percent != null && c.base != null) return Number(c.base) * Number(c.percent) / 100;
  return Number(c.amount || 0);
}

function tasksPage(tasks, pending) {
  const groups = { offen: [], in_arbeit: [], erledigt: [] };
  tasks.forEach((t) => (groups[t.status] || groups.offen).push(t));
  const section = (key, label) => groups[key].length
    ? `<h2 style="margin:22px 0 12px;font-size:15px;color:var(--muted)">${label} (${groups[key].length})</h2><div class="rows">${groups[key].map(taskRow).join("")}</div>` : "";
  const body = `
  <div class="ptitle"><h1>Aufgaben</h1><a class="btn btn-primary" href="/admin/aufgaben/neu">+ Neue Aufgabe</a></div>
  ${tasks.length ? section("offen", "Offen") + section("in_arbeit", "In Arbeit") + section("erledigt", "Erledigt")
    : `<div class="empty">Noch keine Aufgaben. <a href="/admin/aufgaben/neu">Erste Aufgabe anlegen →</a></div>`}`;
  return shell({ title: "Aufgaben", active: "/admin/aufgaben", body, pending });
}
function taskForm(t, pending) {
  t = t || {};
  const isNew = !t.id;
  const sel = (v, val) => (v === val ? "selected" : "");
  const body = `
  <div class="ptitle"><h1>${isNew ? "Neue Aufgabe" : "Aufgabe bearbeiten"}</h1><a class="btn btn-ghost" href="/admin/aufgaben">← Zurück</a></div>
  <form class="form" method="POST" action="${isNew ? "/admin/aufgaben/neu" : "/admin/aufgaben/" + t.id}">
    <div class="fr"><label>Titel *</label><input name="title" required value="${esc(t.title)}"></div>
    <div class="fr"><label>Notizen</label><textarea name="notes">${esc(t.notes)}</textarea></div>
    <div class="fr three">
      <div class="fr" style="margin:0"><label>Status</label><select name="status">
        <option value="offen" ${sel(t.status, "offen")}>Offen</option>
        <option value="in_arbeit" ${sel(t.status, "in_arbeit")}>In Arbeit</option>
        <option value="erledigt" ${sel(t.status, "erledigt")}>Erledigt</option></select></div>
      <div class="fr" style="margin:0"><label>Priorität</label><select name="priority">
        <option value="niedrig" ${sel(t.priority, "niedrig")}>Niedrig</option>
        <option value="mittel" ${sel(t.priority, "mittel")}>Mittel</option>
        <option value="hoch" ${sel(t.priority, "hoch")}>Hoch</option></select></div>
      <div class="fr" style="margin:0"><label>Fällig</label><input type="date" name="due" value="${dstr(t.due)}"></div>
    </div>
    <div class="fr"><label>Projekt / Website</label><input name="project" list="sites" value="${esc(t.project)}" placeholder="auswählen oder eingeben"></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Speichern</button><a class="btn btn-ghost" href="/admin/aufgaben">Abbrechen</a></div>
  </form>${siteDatalist()}`;
  return shell({ title: "Aufgabe", active: "/admin/aufgaben", body, pending });
}

function commPage(items, totals, filter, pending, siteTotals) {
  const chip = (key, label) => `<a class="chip ${filter === key ? "active" : ""}" href="/admin/provisionen?f=${key}">${label}</a>`;
  const siteRow = (s) => `<div class="row"><div class="info"><h3>${esc(s.site)}</h3><p>+${eur(s.in)} erhalten · −${eur(s.out)} zahlen</p></div><span class="amt ${s.net >= 0 ? "in" : "out"}">${s.net >= 0 ? "+" : "−"}${eur(Math.abs(s.net))}</span></div>`;
  const body = `
  <div class="ptitle"><h1>Provisionen & Gebühren</h1><a class="btn btn-primary" href="/admin/provisionen/neu">+ Neuer Eintrag</a></div>
  <div class="stat-grid">
    <div class="stat"><div class="l">Offen zu erhalten</div><div class="n green">${eur(totals.inOpen)}</div></div>
    <div class="stat"><div class="l">Offen zu zahlen</div><div class="n red">${eur(totals.outOpen)}</div></div>
    <div class="stat"><div class="l">Verrechnet (offen bez.)</div><div class="n amber">${eur(totals.invoiced)}</div></div>
    <div class="stat"><div class="l">Bereits bezahlt</div><div class="n">${eur(totals.paid)}</div></div>
  </div>
  ${siteTotals && siteTotals.length ? `<div class="card" style="margin-bottom:18px"><h2>Offener Saldo pro Website</h2><div class="rows">${siteTotals.map(siteRow).join("")}</div></div>` : ""}
  <div class="filters">
    ${chip("alle", "Alle")}${chip("offen", "Offen")}${chip("verrechnet", "Verrechnet")}${chip("bezahlt", "Bezahlt")}
    ${chip("in", "Einnahmen")}${chip("out", "Ausgaben")}
  </div>
  ${items.length ? `<div class="rows">${items.map(commRow).join("")}</div>` : `<div class="empty">Keine Einträge für diesen Filter.</div>`}`;
  return shell({ title: "Provisionen", active: "/admin/provisionen", body, pending });
}
function commForm(c, pending) {
  c = c || {};
  const isNew = !c.id;
  const sel = (v, val) => (v === val ? "selected" : "");
  const body = `
  <div class="ptitle"><h1>${isNew ? "Neuer Eintrag" : "Eintrag bearbeiten"}</h1><a class="btn btn-ghost" href="/admin/provisionen">← Zurück</a></div>
  <form class="form" method="POST" action="${isNew ? "/admin/provisionen/neu" : "/admin/provisionen/" + c.id}">
    <div class="fr"><label>Bezeichnung *</label><input name="title" required value="${esc(c.title)}" placeholder="z. B. Antonhaus – 5% Provision"></div>
    <div class="fr two">
      <div class="fr" style="margin:0"><label>Website / Projekt</label><input name="site" list="sites" value="${esc(c.site)}" placeholder="auswählen oder eingeben"></div>
      <div class="fr" style="margin:0"><label>Partner / Kontakt (optional)</label><input name="partner" value="${esc(c.partner)}" placeholder="z. B. Familie Wachter"></div>
    </div>
    <div class="fr two">
      <div class="fr" style="margin:0"><label>Richtung</label><select name="direction">
        <option value="in" ${sel(c.direction, "in")}>Einnahme – ich bekomme/verrechne</option>
        <option value="out" ${sel(c.direction, "out")}>Ausgabe – ich zahle/führe ab</option></select></div>
    </div>
    <div class="fr two">
      <div class="fr" style="margin:0"><label>Betrag (€)</label><input name="amount" value="${c.amount != null && Number(c.amount) !== 0 ? String(c.amount).replace(".", ",") : ""}" placeholder="z. B. 100,00"></div>
      <div class="fr" style="margin:0"><label>Zeitraum</label><input name="period" value="${esc(c.period)}" placeholder="z. B. März 2026"></div>
    </div>
    <div class="fr two">
      <div class="fr" style="margin:0"><label>Prozent (optional)</label><input name="percent" value="${c.percent != null ? String(c.percent).replace(".", ",") : ""}" placeholder="z. B. 5"></div>
      <div class="fr" style="margin:0"><label>Basis (€, optional)</label><input name="base" value="${c.base != null ? String(c.base).replace(".", ",") : ""}" placeholder="z. B. 2000"></div>
    </div>
    <span class="hint">Trag entweder den fixen Betrag ein, oder Prozent + Basis — dann wird der Betrag berechnet.</span>
    <div class="fr" style="margin-top:14px"><label>Status</label><select name="status">
      <option value="offen" ${sel(c.status, "offen")}>Offen</option>
      <option value="verrechnet" ${sel(c.status, "verrechnet")}>Verrechnet (Rechnung gestellt)</option>
      <option value="bezahlt" ${sel(c.status, "bezahlt")}>Bezahlt / erledigt</option></select></div>
    <div class="fr"><label>Notiz</label><textarea name="note">${esc(c.note)}</textarea></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">Speichern</button><a class="btn btn-ghost" href="/admin/provisionen">Abbrechen</a></div>
  </form>${siteDatalist()}`;
  return shell({ title: "Provision", active: "/admin/provisionen", body, pending });
}

/* ============================ APP ============================ */
const app = express();
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

async function pendingCount() {
  const r = await q("SELECT COUNT(*)::int AS c FROM tasks WHERE status<>'erledigt'");
  return r.rows[0].c;
}

// ---- auth routes ----
app.get("/admin/login", (req, res) => { if (isAuthed(req)) return res.redirect("/admin"); res.send(loginPage(req.query.e ? "Falsches Passwort." : "")); });
app.post("/admin/login", (req, res) => {
  if (checkPw(req.body.password)) {
    const token = sign({ a: 1, exp: Date.now() + MAX_AGE });
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${Math.floor(MAX_AGE / 1000)}; SameSite=Lax`);
    return res.redirect("/admin");
  }
  res.redirect("/admin/login?e=1");
});
app.get("/admin/logout", (req, res) => { res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`); res.redirect("/admin/login"); });

app.use("/admin", requireAuth);

// ---- dashboard ----
app.get("/admin", async (req, res, next) => {
  try {
    const sums = (await q(`SELECT direction, status, COALESCE(SUM(CASE WHEN amount<>0 THEN amount WHEN percent IS NOT NULL AND base IS NOT NULL THEN base*percent/100 ELSE 0 END),0) AS s
      FROM commissions GROUP BY direction, status`)).rows;
    let inOpen = 0, outOpen = 0;
    sums.forEach((r) => { if (r.status !== "bezahlt") { if (r.direction === "out") outOpen += Number(r.s); else inOpen += Number(r.s); } });
    const openTasks = await pendingCount();
    const toInvoice = (await q("SELECT * FROM commissions WHERE status<>'bezahlt' ORDER BY (status='offen') DESC, id DESC LIMIT 6")).rows;
    const nextTasks = (await q("SELECT * FROM tasks WHERE status<>'erledigt' ORDER BY (priority='hoch') DESC, COALESCE(due,'2999-01-01') ASC, id DESC LIMIT 6")).rows;
    res.send(dashboard({ inOpen, outOpen, saldo: inOpen - outOpen, openTasks, toInvoice, nextTasks }));
  } catch (e) { next(e); }
});

// ---- tasks ----
app.get("/admin/aufgaben", async (req, res, next) => {
  try {
    const tasks = (await q("SELECT * FROM tasks ORDER BY (status='erledigt') ASC, (priority='hoch') DESC, COALESCE(due,'2999-01-01') ASC, id DESC")).rows;
    res.send(tasksPage(tasks, await pendingCount()));
  } catch (e) { next(e); }
});
app.get("/admin/aufgaben/neu", async (req, res, next) => { try { res.send(taskForm({}, await pendingCount())); } catch (e) { next(e); } });
app.post("/admin/aufgaben/neu", async (req, res, next) => {
  try {
    const b = req.body;
    await q("INSERT INTO tasks (title,notes,status,priority,due,project) VALUES ($1,$2,$3,$4,$5,$6)",
      [String(b.title || "").slice(0, 200), String(b.notes || ""), b.status || "offen", b.priority || "mittel", b.due || null, String(b.project || "")]);
    res.redirect("/admin/aufgaben");
  } catch (e) { next(e); }
});
app.get("/admin/aufgaben/:id", async (req, res, next) => {
  try { const r = await q("SELECT * FROM tasks WHERE id=$1", [req.params.id]); if (!r.rows[0]) return res.redirect("/admin/aufgaben"); res.send(taskForm(r.rows[0], await pendingCount())); } catch (e) { next(e); }
});
app.post("/admin/aufgaben/:id", async (req, res, next) => {
  try {
    const b = req.body;
    await q("UPDATE tasks SET title=$1,notes=$2,status=$3,priority=$4,due=$5,project=$6,done_at=CASE WHEN $3='erledigt' AND done_at IS NULL THEN now() WHEN $3<>'erledigt' THEN NULL ELSE done_at END WHERE id=$7",
      [String(b.title || "").slice(0, 200), String(b.notes || ""), b.status || "offen", b.priority || "mittel", b.due || null, String(b.project || ""), req.params.id]);
    res.redirect("/admin/aufgaben");
  } catch (e) { next(e); }
});
app.post("/admin/aufgaben/:id/erledigt", async (req, res, next) => {
  try { await q("UPDATE tasks SET status='erledigt', done_at=now() WHERE id=$1", [req.params.id]); res.redirect(req.headers.referer && req.headers.referer.indexOf("/admin/aufgaben") > -1 ? "/admin/aufgaben" : "/admin"); } catch (e) { next(e); }
});
app.post("/admin/aufgaben/:id/loeschen", async (req, res, next) => { try { await q("DELETE FROM tasks WHERE id=$1", [req.params.id]); res.redirect("/admin/aufgaben"); } catch (e) { next(e); } });

// ---- commissions ----
app.get("/admin/provisionen", async (req, res, next) => {
  try {
    const f = req.query.f || "alle";
    let where = "";
    if (f === "offen" || f === "verrechnet" || f === "bezahlt") where = `WHERE status='${f}'`;
    else if (f === "in" || f === "out") where = `WHERE direction='${f}'`;
    const items = (await q(`SELECT * FROM commissions ${where} ORDER BY (status='offen') DESC, id DESC`)).rows;
    const all = (await q("SELECT * FROM commissions")).rows;
    let inOpen = 0, outOpen = 0, invoiced = 0, paid = 0;
    const bySite = {};
    all.forEach((c) => {
      const a = effAmount(c);
      if (c.status === "bezahlt") paid += a;
      else if (c.status === "verrechnet") invoiced += a;
      if (c.status !== "bezahlt") {
        if (c.direction === "out") outOpen += a; else inOpen += a;
        const k = c.site || "— ohne Website";
        bySite[k] = bySite[k] || { in: 0, out: 0 };
        if (c.direction === "out") bySite[k].out += a; else bySite[k].in += a;
      }
    });
    const siteTotals = Object.keys(bySite).sort().map((k) => ({ site: k, in: bySite[k].in, out: bySite[k].out, net: bySite[k].in - bySite[k].out }));
    res.send(commPage(items, { inOpen, outOpen, invoiced, paid }, f, await pendingCount(), siteTotals));
  } catch (e) { next(e); }
});
app.get("/admin/provisionen/neu", async (req, res, next) => { try { res.send(commForm({ direction: "in", status: "offen" }, await pendingCount())); } catch (e) { next(e); } });
function commValues(b) {
  return [String(b.title || "").slice(0, 200), String(b.partner || ""), b.direction === "out" ? "out" : "in",
    parseAmount(b.amount) || 0, parseAmount(b.percent), parseAmount(b.base), String(b.period || ""), b.status || "offen", String(b.note || ""), String(b.site || "")];
}
app.post("/admin/provisionen/neu", async (req, res, next) => {
  try { await q("INSERT INTO commissions (title,partner,direction,amount,percent,base,period,status,note,site) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", commValues(req.body)); res.redirect("/admin/provisionen"); } catch (e) { next(e); }
});
app.get("/admin/provisionen/:id", async (req, res, next) => {
  try { const r = await q("SELECT * FROM commissions WHERE id=$1", [req.params.id]); if (!r.rows[0]) return res.redirect("/admin/provisionen"); res.send(commForm(r.rows[0], await pendingCount())); } catch (e) { next(e); }
});
app.post("/admin/provisionen/:id", async (req, res, next) => {
  try { const v = commValues(req.body); v.push(req.params.id);
    await q("UPDATE commissions SET title=$1,partner=$2,direction=$3,amount=$4,percent=$5,base=$6,period=$7,status=$8,note=$9,site=$10 WHERE id=$11", v); res.redirect("/admin/provisionen"); } catch (e) { next(e); }
});
app.post("/admin/provisionen/:id/loeschen", async (req, res, next) => { try { await q("DELETE FROM commissions WHERE id=$1", [req.params.id]); res.redirect("/admin/provisionen"); } catch (e) { next(e); } });

/* ---- public static site (umlaut-aware) + SPA fallback ---- */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".pdf": "application/pdf", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
function sendIndex(res) { fs.readFile(path.join(ROOT, "index.html"), (e, data) => { if (e) return res.status(404).send("Not found"); res.set("Content-Type", TYPES[".html"]).send(data); }); }
app.use((req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).send("Method not allowed");
    let urlPath = decodeURIComponent((req.path || "/"));
    if (urlPath === "/" || urlPath === "") return sendIndex(res);
    let base = path.normalize(path.join(ROOT, urlPath));
    if (!base.startsWith(ROOT)) return res.status(403).send("Forbidden");
    const cands = [base];
    try { const nfc = base.normalize("NFC"); if (cands.indexOf(nfc) < 0) cands.push(nfc); } catch (e) {}
    try { const nfd = base.normalize("NFD"); if (cands.indexOf(nfd) < 0) cands.push(nfd); } catch (e) {}
    for (const p of cands) { try { if (fs.statSync(p).isFile()) { const ext = path.extname(p).toLowerCase(); return res.set("Content-Type", TYPES[ext] || "application/octet-stream").send(fs.readFileSync(p)); } } catch (e) {} }
    return sendIndex(res); // SPA fallback
  } catch (e) { res.status(500).send("Server error"); }
});

app.use((err, req, res, next) => { console.error(err); res.status(500).send("Serverfehler."); });

function start() {
  initDb().then(() => app.listen(PORT, () => console.log("FS Creative on " + PORT)))
    .catch((e) => { console.error("DB init failed:", e); app.listen(PORT, () => console.log("FS Creative (no DB) on " + PORT)); });
}
if (require.main === module) start();
module.exports = { app, start };
