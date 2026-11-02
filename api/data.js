'use strict';
// Función de servidor (Vercel). El navegador nunca ve la clave de Windsor:
// llama a /api/data y esta función consulta Windsor con parámetros validados.

const auth = require('./_auth');
const cache = require('./_cache');

const WINDSOR_URL = 'https://connectors.windsor.ai/mysql';
const DEFAULT_ACCOUNT = 'reporting01.markplan.com__infomedia_marts__mart_digital_predict_industria';
const PLATAFORMAS = ['Google Ads', 'Meta', 'TikTok', 'YouTube', 'Programatic', 'X'];
const SERIE_FIELDS = ['fecha', 'categorias', 'marcas', 'plataformas', 'digital_predict', 'timesfm'];

const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : null; };
const isoDay = (d) => d.toISOString().slice(0, 10);

async function windsor({ fields, from, to, filters }) {
  const url = new URL(WINDSOR_URL);
  url.searchParams.set('api_key', process.env.WINDSOR_API_KEY);
  url.searchParams.set('select_accounts', process.env.WINDSOR_ACCOUNT || DEFAULT_ACCOUNT);
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('date_from', from);
  url.searchParams.set('date_to', to);
  url.searchParams.set('date_filters', JSON.stringify({ General: 'fecha' }));
  if (filters) url.searchParams.set('filters', JSON.stringify(filters));
  url.searchParams.set('_renderer', 'json');
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await r.text();
  let j;
  try { j = JSON.parse(text); } catch { throw new Error(`Windsor respondió ${r.status} sin JSON: ${text.slice(0, 200)}`); }
  if (!r.ok) throw new Error(`Windsor respondió ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  const rows = Array.isArray(j) ? j : j && j.data;
  if (!Array.isArray(rows)) throw new Error('Windsor respondió sin filas. Claves: ' + Object.keys(j || {}).join(', '));
  return rows;
}

// Pares únicos [marca, categoría], ordenados por marca.
function buildPairs(rows) {
  const seen = new Set(), pairs = [];
  for (const r of rows) {
    if (!r.marcas || !r.categorias) continue;
    const k = r.categorias + '\u0000' + r.marcas;
    if (!seen.has(k)) { seen.add(k); pairs.push([r.marcas, r.categorias]); }
  }
  return pairs.sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=300');
  const fail = (code, error) => res.status(code).json({ error });
  try {
    if (!auth.password()) { auth.logEvent(req, 'data_falta_variable', { variable: 'DASHBOARD_PASSWORD' }); return fail(500, 'Falta la variable DASHBOARD_PASSWORD en el servidor.'); }
    if (!process.env.WINDSOR_API_KEY) return fail(500, 'Falta la variable WINDSOR_API_KEY en el servidor.');
    if (!auth.isAuthenticated(req)) { auth.logEvent(req, 'data_sin_sesion', { motivo: auth.sessionState(req) }); return fail(401, 'Sesión no iniciada o vencida.'); }

    const q = req.query || {};
    const today = new Date();

    if (q.tipo === 'cats' || q.tipo === 'marcas') {
      // Una sola consulta (últimos 30 días) alimenta categorías y marcas. Se guarda en Upstash:
      // los usuarios siguientes leen de Redis en vez de esperar a Windsor.
      const cached = await cache.read();
      let pairs = cached && cached.pairs;
      if (!cache.isFresh(cached)) {
        try {
          const from = isoDay(new Date(today.getTime() - 30 * 86400000));
          const rows = await windsor({ fields: ['categorias', 'marcas'], from, to: isoDay(today) });
          pairs = buildPairs(rows);
          if (pairs.length) await cache.write(pairs);
        } catch (e) {
          if (!pairs) throw e;                       // sin respaldo: se informa el error
          console.warn('[cache] Windsor falló, se sirve el índice anterior:', e.message);
        }
      }
      if (q.tipo === 'marcas') return res.status(200).json({ marcas: pairs });
      const cats = [...new Set(pairs.map((p) => p[1]))].sort((a, b) => a.localeCompare(b, 'es'));
      return res.status(200).json({ cats });
    }

    if (q.tipo === 'serie') {
      const categoria = String(q.categoria || '');
      const desde = String(q.desde || '');
      const hasta = String(q.hasta || '');
      const plataformas = [...new Set(String(q.plataforma || '').split(',').filter(Boolean))];
      if (!categoria || categoria.length > 120) return fail(400, 'categoria inválida');
      if (!/^20\d{2}-[01]\d-[0-3]\d$/.test(desde)) return fail(400, 'desde inválido');
      if (hasta && (!/^20\d{2}-[01]\d-[0-3]\d$/.test(hasta) || hasta < desde)) return fail(400, 'hasta inválido');
      if (plataformas.some((x) => !PLATAFORMAS.includes(x))) return fail(400, 'plataforma inválida');
      // Marcas de otras categorías para comparar: lista JSON de nombres (máx. 10).
      let extras = [];
      if (q.extras) {
        try { extras = JSON.parse(String(q.extras)); } catch { return fail(400, 'extras inválido'); }
        if (!Array.isArray(extras) || extras.length > 10 || extras.some((x) => typeof x !== 'string' || !x || x.length > 120)) return fail(400, 'extras inválido');
        extras = [...new Set(extras)];
      }

      const filters = [['categorias', 'eq', categoria]];
      if (plataformas.length === 1) filters.push('and', ['plataformas', 'eq', plataformas[0]]);
      const rows = await windsor({ fields: SERIE_FIELDS, from: desde, to: hasta || isoDay(today), filters });

      // Defensa: se vuelve a filtrar aquí por si Windsor ignora un filtro.
      // Respuesta en columnas con diccionarios para mantenerla bajo el límite de 4,5 MB de Vercel.
      const marcas = [], plats = [], mi = new Map(), pi = new Map(), out = [];
      for (const r of rows) {
        if (r.categorias !== categoria || String(r.fecha).slice(0, 10) < desde) continue;
        if (hasta && String(r.fecha).slice(0, 10) > hasta) continue;
        if (plataformas.length && !plataformas.includes(r.plataformas)) continue;
        if (!mi.has(r.marcas)) { mi.set(r.marcas, marcas.length); marcas.push(r.marcas); }
        if (!pi.has(r.plataformas)) { pi.set(r.plataformas, plats.length); plats.push(r.plataformas); }
        out.push([String(r.fecha).slice(0, 10), mi.get(r.marcas), pi.get(r.plataformas), num(r.digital_predict), num(r.timesfm)]);
      }
      // Marcas de otras categorías: una consulta por marca (solo las que no vinieron ya con la categoría).
      const ex = [], mc = {};
      const faltan = extras.filter((n) => !mi.has(n));
      const extraRows = await Promise.all(faltan.map((n) => {
        const f = [['marcas', 'eq', n]];
        if (plataformas.length === 1) f.push('and', ['plataformas', 'eq', plataformas[0]]);
        return windsor({ fields: SERIE_FIELDS, from: desde, to: hasta || isoDay(today), filters: f });
      }));
      faltan.forEach((n, i) => {
        for (const r of extraRows[i]) {
          const d = String(r.fecha).slice(0, 10);
          if (r.marcas !== n || d < desde || (hasta && d > hasta)) continue;
          if (plataformas.length && !plataformas.includes(r.plataformas)) continue;
          if (!mi.has(n)) { mi.set(n, marcas.length); marcas.push(n); ex.push(n); mc[n] = r.categorias; }
          if (!pi.has(r.plataformas)) { pi.set(r.plataformas, plats.length); plats.push(r.plataformas); }
          out.push([d, mi.get(n), pi.get(r.plataformas), num(r.digital_predict), num(r.timesfm)]);
        }
      });
      return res.status(200).json(ex.length ? { categoria, m: marcas, p: plats, r: out, ex, mc } : { categoria, m: marcas, p: plats, r: out });
    }

    return fail(400, 'tipo inválido');
  } catch (e) {
    return fail(502, String(e && e.message ? e.message : e));
  }
};
