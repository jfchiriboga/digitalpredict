'use strict';
// POST /api/login {"password": "..."}  -> 200 + cookie de sesión | 400 | 401 | 405 | 500
// DELETE /api/login                    -> 200 y borra la cookie (cerrar sesión)
const auth = require('./_auth');

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw && typeof req.on === 'function') {
    raw = await new Promise((resolve, reject) => {
      let s = '';
      req.on('data', (c) => { s += c; if (s.length > 4096) reject(new Error('cuerpo demasiado grande')); });
      req.on('end', () => resolve(s));
      req.on('error', reject);
    });
  }
  return JSON.parse(raw || '{}');
}

module.exports = async function login(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (code, error) => res.status(code).json({ error });

  if (req.method === 'DELETE') {
    auth.logEvent(req, 'logout');
    res.setHeader('Set-Cookie', auth.sessionCookie(req, '', 0));
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') {
    auth.logEvent(req, 'login_metodo_no_permitido', { metodo: req.method });
    res.setHeader('Allow', 'POST, DELETE'); return fail(405, 'Método no permitido.');
  }

  if (!auth.password()) {
    auth.logEvent(req, 'login_falta_variable', { variable: 'DASHBOARD_PASSWORD' });
    return fail(500, 'Falta la variable DASHBOARD_PASSWORD en el servidor.');
  }

  let body;
  try { body = await readBody(req); } catch { auth.logEvent(req, 'login_solicitud_invalida'); return fail(400, 'Solicitud inválida.'); }
  if (!body || typeof body.password !== 'string' || !body.password.trim()) {
    auth.logEvent(req, 'login_clave_vacia');
    return fail(400, 'Escribe la contraseña.');
  }

  if (!auth.passwordMatches(body.password)) {
    // Solo longitudes, nunca la clave: permiten detectar espacios, saltos de línea o claves truncadas.
    auth.logEvent(req, 'login_clave_incorrecta', { largo_recibido: body.password.length, largo_recibido_recortado: body.password.trim().length, largo_guardado_recortado: auth.password().length });
    return fail(401, 'Contraseña incorrecta.');
  }

  auth.logEvent(req, 'login_ok');
  res.setHeader('Set-Cookie', auth.sessionCookie(req, auth.issueToken()));
  return res.status(200).json({ ok: true });
};
