'use strict';
// Servidor local: sirve public/ y monta api/data.js. Uso: cp .env.example .env, completar y `npm run dev`.
const http = require('http'), fs = require('fs'), path = require('path'), { URL } = require('url');
try { for (const l of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch { /* sin .env */ }
const handler = require('../api/data.js'), login = require('../api/login.js');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/data' || u.pathname === '/api/login') {
    req.query = Object.fromEntries(u.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    return (u.pathname === '/api/login' ? login : handler)(req, res);
  }
  const f = path.join(__dirname, '..', 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(path.join(__dirname, '..', 'public')) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('no encontrado'); }
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
