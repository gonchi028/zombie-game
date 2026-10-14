// Zero-dependency static server: `npm start` then open http://localhost:8080
// (ES modules can't be loaded from file://, so the game needs to be served over http.)
// http://localhost:8080/dev is the sandbox: the same game with the dev panel from dev/ added. It only
// exists here; the GitHub Pages deploy never copies server.js or dev/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// index.html plus the sandbox panel. <base> keeps the game's relative URLs pointing at the root.
async function sandboxPage() {
  const html = await readFile(join(root, 'index.html'), 'utf8');
  return html
    .replace('<head>', '<head>\n  <base href="/" />')
    .replace('<title>Last Light</title>', '<title>Last Light · Sandbox</title>')
    .replace('</head>', '  <link rel="stylesheet" href="dev/sandbox.css" />\n</head>')
    .replace('</body>', '  <script type="module" src="dev/sandbox.js"></script>\n</body>');
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/dev' || path === '/dev/') {
    res.writeHead(200, { 'Content-Type': types['.html'], 'Cache-Control': 'no-cache' });
    res.end(await sandboxPage());
    return;
  }
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => {
  console.log(`Last Light running at http://localhost:${port}`);
  console.log(`Sandbox (dev tools) at http://localhost:${port}/dev`);
});
