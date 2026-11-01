'use strict';
// Prueba de api/data.js con Windsor simulado: validación y forma de la respuesta.
const assert = require('assert');
process.env.WINDSOR_API_KEY = 'k';
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
const call = async (query) => {
  const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ query, headers: {} }, res);
  return res;
};
(async () => {
  const cats = await call({ tipo: 'cats' });
  assert.strictEqual(cats.code, 200);
  assert.deepStrictEqual(cats.body.cats, ['BANCOS', 'OTRA']);
  assert.strictEqual((await call({ tipo: 'x' })).code, 400);
  assert.strictEqual((await call({ tipo: 'serie', categoria: 'BANCOS', desde: 'x' })).code, 400);
  assert.strictEqual((await call({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-01-01', plataforma: 'Radio' })).code, 400);
  const s = await call({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-10-01', plataforma: '' });
  assert.strictEqual(s.code, 200); assert.deepStrictEqual(s.body.m, ['A', 'B']); assert.strictEqual(s.body.r.length, 2);
  assert.deepStrictEqual(s.body.r[0], ['2026-10-01', 0, 0, 10.01, 12]);
  assert.strictEqual(lastUrl.searchParams.get('api_key'), 'k');
  const m = await call({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-10-01', plataforma: 'Meta' });
  assert.deepStrictEqual(m.body.r.map((r) => m.body.m[r[1]]), ['A']);
  delete process.env.WINDSOR_API_KEY;
  assert.strictEqual((await call({ tipo: 'cats' })).code, 500);
  console.log('api/data.js: todas las pruebas pasan');
})().catch((e) => { console.error(e); process.exit(1); });
