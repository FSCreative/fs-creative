// Zero-dependency static server for FS Creative.
// Serves files from this directory and falls back to index.html (SPA routing).
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
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, type) {
  res.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";

    // Resolve safely inside ROOT
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden");

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        // SPA fallback
        return fs.readFile(path.join(ROOT, "index.html"), (e, data) => {
          if (e) return send(res, 404, "Not found");
          send(res, 200, data, TYPES[".html"]);
        });
      }
      const ext = path.extname(filePath).toLowerCase();
      fs.readFile(filePath, (e, data) => {
        if (e) return send(res, 500, "Server error");
        send(res, 200, data, TYPES[ext] || "application/octet-stream");
      });
    });
  } catch (e) {
    send(res, 500, "Server error");
  }
});

server.listen(PORT, () => {
  console.log("FS Creative running on port " + PORT);
});
