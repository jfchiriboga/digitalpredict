'use strict';
// Autenticación del dashboard: contraseña compartida (DASHBOARD_PASSWORD) -> cookie de sesión firmada.
// El navegador envía la clave una sola vez a /api/login (cuerpo JSON, admite cualquier carácter Unicode);
// después solo viaja una cookie HttpOnly que JavaScript no puede leer.
const crypto = require('crypto');

const COOKIE = 'dp_session';
const TTL_SECONDS = 8 * 60 * 60;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest('base64url');

function password() { return String(process.env.DASHBOARD_PASSWORD || '').trim(); }

// La clave de firma mezcla SESSION_SECRET (opcional) con la contraseña:
// cambiar DASHBOARD_PASSWORD invalida todas las sesiones abiertas.
function signingKey() { return hmac(process.env.SESSION_SECRET || 'digitalpredict', 'k:' + password()); }

function passwordMatches(given) {
  return crypto.timingSafeEqual(sha(password()), sha(String(given == null ? '' : given).trim()));
}

function issueToken(now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return exp + '.' + hmac(signingKey(), String(exp));
}

function tokenValid(token, now = Date.now()) {
  const [exp, sig] = String(token || '').split('.');
  if (!/^\d{1,12}$/.test(exp || '') || !sig) return false;
  if (Number(exp) < Math.floor(now / 1000)) return false;
  const good = hmac(signingKey(), exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function isAuthenticated(req) { return tokenValid(readCookie(req, COOKIE)); }

function sessionCookie(req, token, maxAge = TTL_SECONDS) {
  const secure = String((req.headers || {})['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` + (secure ? '; Secure' : '');
}

module.exports = { passwordMatches, issueToken, tokenValid, isAuthenticated, sessionCookie, password, TTL_SECONDS };
