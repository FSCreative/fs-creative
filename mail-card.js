"use strict";
// Gemeinsames Mail-Layout (Shop-Mails, Rechnungsversand …) – robust für Outlook, Gmail, Apple Mail und die Mail-Ansicht im Cockpit:
// nur Tabellen, Farben zusätzlich als bgcolor-Attribut (manche Programme entfernen CSS-Hintergründe), heller Kopf mit dunklem Logo,
// Fortschritt als Tabellenzellen, Knöpfe als „bulletproof“-Tabelle. Keine externen Schriften, keine Hintergrundbilder.
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const BLUE = "#0a66d8", INK = "#1d1d1f", MUTED = "#6e6e73", LINE = "#e5e5ea", YEL = "#ffe600";
const LOGO = "https://www.fs-creative.at/logos/gluehbirne-kopf-dunkel.png";
// Text mit Links (URLs werden klickbar), Zeilenumbrüche bleiben
const para = (t, size, col) => '<p style="margin:0 0 14px;font-family:' + FONT + ";font-size:" + (size || 15) + "px;line-height:1.55;color:" + (col || INK) + '">' +
  esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + BLUE + '">$1</a>').replace(/\n/g, "<br>") + "</p>";
const button = (label, url, ghost) => '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 8px 0"><tr><td bgcolor="' + (ghost ? "#ffffff" : BLUE) + '" style="border-radius:999px;' + (ghost ? "border:1px solid #c9d8f0;" : "") + 'background:' + (ghost ? "#ffffff" : BLUE) + '">' +
  '<a href="' + esc(url) + '" style="display:inline-block;padding:12px 24px;font-family:' + FONT + ";font-size:15px;font-weight:600;color:" + (ghost ? BLUE : "#ffffff") + ';text-decoration:none;border-radius:999px">' + esc(label) + "</a></td></tr></table>";
function steps(list, cur) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 22px"><tr>' + list.map((t, k) => {
    const done = k <= cur, c = done ? BLUE : "#e5e5ea";
    return '<td width="' + Math.floor(100 / list.length) + '%" style="padding:0 2px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="6" bgcolor="' + c + '" style="height:6px;line-height:6px;font-size:0;background:' + c + ';border-radius:3px">&nbsp;</td></tr></table>' +
      '<div style="padding-top:7px;text-align:center;white-space:nowrap;font-family:' + FONT + ";font-size:11.5px;letter-spacing:-.1px;color:" + (done ? INK : "#a1a1a6") + ";font-weight:" + (k === cur ? 700 : 500) + '">' + (done && k !== cur ? "✓&nbsp;" : "") + esc(t).replace(/ /g, "&nbsp;") + "</div></td>"; }).join("") + "</tr></table>";   // Schrittnamen ohne Umbruch (z. B. „In Produktion“)
}
function table(rows) {
  if (!rows || !rows.length) return "";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;border:1px solid ' + LINE + ';border-radius:12px;border-collapse:separate">' + rows.map((r, k) =>
    "<tr><td valign=\"top\" style=\"padding:10px 14px;" + (k ? "border-top:1px solid #f0f0f2;" : "") + "font-family:" + FONT + ";font-size:13px;color:" + MUTED + ';width:38%">' + esc(r[0]) + "</td>" +
    "<td valign=\"top\" style=\"padding:10px 14px;" + (k ? "border-top:1px solid #f0f0f2;" : "") + "font-family:" + FONT + ";font-size:14px;color:" + INK + ';font-weight:600">' + esc(r[1]).replace(/\n/g, "<br>") + "</td></tr>").join("") + "</table>";
}
// card({ brand: "Druckshop", title, intro:[], rows:[[k,v]], buttons:[[label,url]], outro:[], steps:{ list, cur }, extraHtml, footer })
function card(o) {
  o = o || {};
  const intro = (o.intro || []).map(t => para(t)).join(""), outro = (o.outro || []).map(t => para(t, 14, "#3a3a3c")).join("");
  const btns = (o.buttons || []).filter(b => /^https?:\/\//.test(String(b[1] || ""))).map((b, k) => button(b[0], b[1], k > 0)).join("");
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f5" style="background:#f2f2f5"><tr><td align="center" style="padding:24px 10px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;background:#ffffff;border:1px solid #e8e8ed;border-radius:18px">' +
    // Kopf: hell, dunkles Logo, gelbe Akzentlinie
    '<tr><td style="padding:20px 26px 16px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><img src="' + LOGO + '" width="28" height="35" alt="" style="display:block;border:0"></td>' +
    '<td valign="middle" style="padding-left:10px;font-family:' + FONT + ";font-size:17px;font-weight:700;color:" + INK + '">FS Creative' + (o.brand ? ' <span style="font-weight:500;color:' + BLUE + '">' + esc(o.brand) + "</span>" : "") + "</td></tr></table></td></tr>" +
    '<tr><td height="4" bgcolor="' + YEL + '" style="height:4px;line-height:4px;font-size:0;background:' + YEL + '">&nbsp;</td></tr>' +
    '<tr><td style="padding:26px 26px 6px">' +
    '<h1 style="margin:0 0 16px;font-family:' + FONT + ";font-size:24px;line-height:1.25;color:" + INK + '">' + esc(o.title || "") + "</h1>" +
    (o.steps ? steps(o.steps.list, o.steps.cur) : "") + intro + table(o.rows) + (btns ? '<div style="margin:2px 0 16px">' + btns + "</div>" : "") + (o.extraHtml || "") + outro + "</td></tr>" +
    '<tr><td style="padding:14px 26px 22px;border-top:1px solid #f0f0f2;font-family:' + FONT + ';font-size:12.5px;line-height:1.6;color:#86868b">' +
    (o.footer != null ? o.footer : "FS Creative · Simon Felder · Dorfstraße 3/1 · 6793 Gaschurn, Österreich<br>Fragen? Einfach auf diese Mail antworten · <a href=\"https://www.fs-creative.at\" style=\"color:" + BLUE + ";text-decoration:none\">fs-creative.at</a>") +
    "</td></tr></table></td></tr></table>";
}
module.exports = { card, esc, para, button, table, steps };
