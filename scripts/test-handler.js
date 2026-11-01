'use strict';
// Prueba de api/data.js con Windsor simulado: autenticación, validación y forma de la respuesta.
const assert = require('assert');
process.env.DASHBOARD_PASSWORD = 'secreto'; process.env.WINDSOR_API_KEY = 'k';
let lastUrl;
global.fetch = async (url) => {
  lastUrl = new URL(url);
  const rows = [
    { fecha: '2026-10-01', categorias: 'BANCOS', marcas: 'A', plataformas: 'Meta', digital_predict: '10.005', timesfm: '12' },
    { fecha: '2026-10-01', categorias: 'BANCOS', marcas: 'B', plataformas: 'TikTok', digital_predict: '5', timesfm: null },
    { fecha: '2026-09-01', categorias: 'BANCOS', marcas: 'A', plataformas: 'Meta', digital_predict: '1', timesfm: '1' },
    { fecha: '2026-10-01', categorias: 'OTRA', marcas: 'C', plataformas: 'Meta', digital_predict: '9', timesfm: '9' },
  ];
  return { ok: true, status: 200, text: async () => JSON.stringify({ data: lastUrl.searchParams.get('fields') === 'categorias' ? rows.map((r) => ({ categorias: r.categorias })) : rows }) };
};
const handler = require('../api/data.js');
const call = async (query, key) => {
  const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ query, headers: key === undefined ? {} : { 'x-dashboard-key': key } }, res);
  return res;
};
(async () => {
  assert.strictEqual((await call({ tipo: 'cats' })).code, 401);
  assert.strictEqual((await call({ tipo: 'cats' }, 'mal')).code, 401);
  const cats = await call({ tipo: 'cats' }, 'secreto');
  assert.deepStrictEqual(cats.body.cats, ['BANCOS', 'OTRA']);
  assert.strictEqual((await call({ tipo: 'serie', categoria: 'BANCOS', desde: 'x' }, 'secreto')).code, 400);
  assert.strictEqual((await call({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-01-01', plataforma: 'Radio' }, 'secreto')).code, 400);
  const s = await call({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-10-01', plataforma: '' }, 'secreto');
  assert.strictEqual(s.code, 200); assert.deepStrictEqual(s.body.m, ['A', 'B']); assert.strictEqual(s.body.r.length, 2);
  assert.deepStrictEqual(s.body.r[0], ['2026-10-01', 0, 0, 10.01, 12]);
  assert.strictEqual(lastUrl.searchParams.get('api_key'), 'k');
  const m = await call({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-10-01', plataforma: 'Meta' }, 'secreto');
  assert.deepStrictEqual(m.body.r.map((r) => m.body.m[r[1]]), ['A']);
  delete process.env.DASHBOARD_PASSWORD;
  assert.strictEqual((await call({ tipo: 'cats' }, '')).code, 500);
  console.log('api/data.js: todas las pruebas pasan');
})().catch((e) => { console.error(e); process.exit(1); });
