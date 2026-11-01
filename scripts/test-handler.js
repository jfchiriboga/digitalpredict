'use strict';
// Prueba de api/login.js y api/data.js con Windsor simulado: autenticación por cookie, validación y forma de la respuesta.
const assert = require('assert');
process.env.DASHBOARD_PASSWORD = 'secreto'; process.env.WINDSOR_API_KEY = 'k'; process.env.SESSION_SECRET = 's1';
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
const data = require('../api/data.js'), login = require('../api/login.js'), auth = require('../api/_auth.js');
const mkRes = () => ({ h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const callData = async (query, cookie) => { const res = mkRes(); await data({ query, headers: cookie ? { cookie } : {} }, res); return res; };
const callLogin = async (method, body, headers = {}) => { const res = mkRes(); await login({ method, body, headers }, res); return res; };
const cookieOf = (res) => String(res.h['Set-Cookie']).split(';')[0];

// captura de los registros del servidor
const origLog = console.log;
const logs = [];
const grab = (...a) => logs.push(a.join(' '));
console.log = grab; console.warn = grab;
const lastLog = () => JSON.parse(logs[logs.length - 1].replace(/^\[auth\] /, ''));

(async () => {
  // sin sesión
  assert.strictEqual((await callData({ tipo: 'cats' })).code, 401);
  assert.strictEqual(lastLog().evento, 'data_sin_sesion'); assert.strictEqual(lastLog().motivo, 'sin_cookie');
  assert.strictEqual((await callData({ tipo: 'cats' }, 'dp_session=basura')).code, 401);
  assert.strictEqual(lastLog().motivo, 'cookie_invalida');

  // login: validaciones y contraseña incorrecta
  assert.strictEqual((await callLogin('GET')).code, 405);
  assert.strictEqual((await callLogin('POST', {})).code, 400);
  assert.strictEqual((await callLogin('POST', { password: '   ' })).code, 400);
  assert.strictEqual((await callLogin('POST', { password: 'mal' })).code, 401);
  assert.deepStrictEqual([lastLog().evento, lastLog().largo_recibido, lastLog().largo_guardado_recortado], ['login_clave_incorrecta', 3, 7]);
  assert.strictEqual((await callLogin('POST', '{no es json')).code, 400);

  // login correcto -> cookie HttpOnly firmada
  const ok = await callLogin('POST', { password: 'secreto' }, { 'x-forwarded-proto': 'https' });
  assert.strictEqual(ok.code, 200); assert.strictEqual(lastLog().evento, 'login_ok');
  assert.match(ok.h['Set-Cookie'], /^dp_session=\d+\.[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  const ck = cookieOf(ok);
  const cats = await callData({ tipo: 'cats' }, ck);
  assert.strictEqual(cats.code, 200); assert.deepStrictEqual(cats.body.cats, ['BANCOS', 'OTRA']);
  assert.strictEqual(cats.h['Cache-Control'], 'private, max-age=300');

  // cookie manipulada o vencida
  const [exp, sig] = ck.split('=')[1].split('.');
  assert.strictEqual((await callData({ tipo: 'cats' }, `dp_session=${Number(exp) + 1}.${sig}`)).code, 401);
  assert.strictEqual(auth.tokenValid(auth.issueToken(Date.now() - 9 * 3600 * 1000)), false);
  assert.strictEqual(auth.tokenValid(auth.issueToken()), true);

  // la contraseña admite espacios sobrantes en la variable y caracteres fuera de Latin-1
  process.env.DASHBOARD_PASSWORD = '  Clave€ ✓ñ\n';
  assert.strictEqual((await callLogin('POST', { password: 'Clave€ ✓ñ' })).code, 200);
  assert.strictEqual((await callLogin('POST', { password: 'Clave€ ✓' })).code, 401);
  // cambiar la contraseña invalida las sesiones abiertas
  assert.strictEqual((await callData({ tipo: 'cats' }, ck)).code, 401);
  process.env.DASHBOARD_PASSWORD = 'secreto';

  // cerrar sesión borra la cookie
  assert.match((await callLogin('DELETE')).h['Set-Cookie'], /Max-Age=0/);

  // validación de /api/data con sesión
  assert.strictEqual((await callData({ tipo: 'serie', categoria: 'BANCOS', desde: 'x' }, ck)).code, 400);
  assert.strictEqual((await callData({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-01-01', plataforma: 'Radio' }, ck)).code, 400);
  const s = await callData({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-10-01', plataforma: '' }, ck);
  assert.strictEqual(s.code, 200); assert.deepStrictEqual(s.body.m, ['A', 'B']); assert.strictEqual(s.body.r.length, 2);
  assert.deepStrictEqual(s.body.r[0], ['2026-10-01', 0, 0, 10.01, 12]);
  assert.strictEqual(lastUrl.searchParams.get('api_key'), 'k');
  const m = await callData({ tipo: 'serie', categoria: 'BANCOS', desde: '2026-10-01', plataforma: 'Meta' }, ck);
  assert.deepStrictEqual(m.body.r.map((r) => m.body.m[r[1]]), ['A']);

  // variables faltantes
  delete process.env.SESSION_SECRET;
  assert.strictEqual((await callLogin('POST', { password: 'secreto' })).code, 200); // SESSION_SECRET es opcional
  delete process.env.DASHBOARD_PASSWORD;
  assert.strictEqual((await callLogin('POST', { password: 'x' })).code, 500);
  assert.strictEqual((await callData({ tipo: 'cats' }, ck)).code, 500);
  // ningún registro contiene contraseñas ni tokens
  const all = logs.join('\n');
  for (const secreto of ['secreto', 'Clave', 'mal"', ck.split('=')[1]]) assert.ok(!all.includes(secreto), 'el registro filtra: ' + secreto);
  assert.ok(logs.some((l) => l.includes('login_falta_variable')) && logs.some((l) => l.includes('data_falta_variable')));
  console.log = origLog;
  console.log('api/login.js + api/data.js: todas las pruebas pasan');
})().catch((e) => { console.error(e); process.exit(1); });
