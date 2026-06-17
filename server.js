// Zero-dependency static server for FS Creative.
// Serves files from this directory and falls back to index.html (SPA routing).
// Handles macOS NFD vs NFC filename normalization (e.g. umlauts like ü).
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (e, data) => {
    if (e) return send(res, 500, "Server error");
    send(res, 200, data, TYPES[ext] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";

    let base = path.normalize(path.join(ROOT, urlPath));
    if (!base.startsWith(ROOT)) return send(res, 403, "Forbidden");

    // Try the exact path plus Unicode-normalized variants (macOS stores
    // umlauts as NFD; browsers usually request NFC).
    const candidates = [base];
    try { const nfc = base.normalize("NFC"); if (candidates.indexOf(nfc) < 0) candidates.push(nfc); } catch (e) {}
    try { const nfd = base.normalize("NFD"); if (candidates.indexOf(nfd) < 0) candidates.push(nfd); } catch (e) {}

    let found = null;
    for (const p of candidates) {
      try { if (fs.statSync(p).isFile()) { found = p; break; } } catch (e) {}
    }

    if (found) return serveFile(res, found);

    // SPA fallback
    fs.readFile(path.join(ROOT, "index.html"), (e, data) => {
      if (e) return send(res, 404, "Not found");
      send(res, 200, data, TYPES[".html"]);
    });
  } catch (e) {
    send(res, 500, "Server error");
  }
});

server.listen(PORT, () => {
  console.log("FS Creative running on port " + PORT);
});
