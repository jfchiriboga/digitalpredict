'use strict';
// Caché del índice marca -> categoría en Upstash Redis (API REST, sin dependencias).
// Si Redis no está configurado o falla, todo sigue funcionando consultando Windsor directo.

const KEY = 'dp:indice:v1';
const FRESH_MS = 6 * 3600 * 1000;       // pasado este tiempo se vuelve a consultar Windsor
const KEEP_S = 7 * 86400;               // Redis conserva el dato más tiempo, como respaldo si Windsor falla

// La integración de Upstash en Vercel define KV_REST_API_* (o UPSTASH_REDIS_REST_*, según cómo se creó).
const cfg = () => ({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

async function redis(cmd) {
  const { url, token } = cfg();
  if (!url || !token) return undefined;
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Upstash respondió ${r.status}`);
  return j.result;
}

// Devuelve { pairs, at } o null si no hay dato, Redis no está configurado o falla.
async function read() {
  try {
    const raw = await redis(['GET', KEY]);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v.pairs) && Number.isFinite(v.at) ? v : null;
  } catch (e) { console.warn('[cache] lectura falló:', e.message); return null; }
}

async function write(pairs) {
  try { await redis(['SET', KEY, JSON.stringify({ pairs, at: Date.now() }), 'EX', KEEP_S]); }
  catch (e) { console.warn('[cache] escritura falló:', e.message); }
}

const isFresh = (v) => !!v && Date.now() - v.at < FRESH_MS;

module.exports = { read, write, isFresh, enabled: () => !!(cfg().url && cfg().token) };
