const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST_ROOT = path.resolve(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.map': 'application/json',
};

if (!fs.existsSync(DIST_ROOT)) {
  console.error(`ERROR: dist/ folder not found at ${DIST_ROOT}`);
  console.error('Run the build step first: pnpm --filter @workspace/mobile run build');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  let filePath = path.join(DIST_ROOT, pathname);

  if (!filePath.startsWith(DIST_ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_ROOT, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  const content = fs.readFileSync(filePath);

  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': isHtml
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable',
  });
  res.end(content);
});

const port = parseInt(process.env.PORT || '3000', 10);
server.listen(port, '0.0.0.0', () => {
  console.log(`HMS Leviathan running on port ${port}`);
});
