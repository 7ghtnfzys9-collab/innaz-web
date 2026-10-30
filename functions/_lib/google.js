/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · ENTRAR CON GOOGLE (OpenID Connect, flujo «código de autorización» con PKCE) · 30-10-2026
   Decisión de César: Mi INNAZ se puede usar con Face ID, con Google y con correo y contraseña. La gestión, no.
   Qué pedimos a Google (lo mínimo): openid, email y profile → identificador de la cuenta (sub), correo y si está
   verificado, nombre y apellidos. Google NO recibe datos de INNAZ ni de sus suscriptores: solo sabe que esa persona
   ha usado su cuenta de Google para entrar en INNAZ.
   Variables: GOOGLE_CLIENT_ID (pública, en wrangler.toml) y GOOGLE_CLIENT_SECRET (secreta: se escribe en Cloudflare,
   nunca en el código). Sin las dos, el botón de Google no aparece.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, nuevoId, fichaAleatoria, baseURL } from './util.js';

export const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
export const COOKIE_G = '__Host-innaz-g';
export const RETO_SEGUNDOS = 10 * 60;      // tiempo para volver de Google
export const ALTA_SEGUNDOS = 30 * 60;      // tiempo para completar el país y la privacidad tras volver de Google

export const googleActivo = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const vuelta = (request, env) => `${baseURL(request, env)}/api/acceso/google-vuelta`;
// Solo en la web de pruebas, para las pruebas automáticas, se puede sustituir Google por un simulador local
const urlToken = env => env.MODO === 'pruebas' && env.GOOGLE_TOKEN_URL_PRUEBAS ? env.GOOGLE_TOKEN_URL_PRUEBAS : TOKEN;

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function pkce() {
  const verificador = fichaAleatoria(32);
  const reto = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
  return { verificador, reto };
}

/** Guarda un paso pendiente (reto o alta) en llaves_retos. Devuelve el id. */
export async function guardarPaso(env, tipo, datos, segundos, ip = null) {
  const t = ahora(), id = fichaAleatoria(24);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM llaves_retos WHERE expira < ?').bind(t - 3600),
    env.DB.prepare('INSERT INTO llaves_retos (id, reto, tipo, usuario_id, creado, expira, datos, ip) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, '-', tipo, null, t, t + segundos, JSON.stringify(datos), ip),
  ]);
  return id;
}
/** Toma (y borra) un paso pendiente. null si no existe, caducó o es de otro tipo. */
export async function tomarPaso(env, id, tipo) {
  if (typeof id !== 'string' || id.length < 20 || id.length > 100) return null;
  const r = await env.DB.prepare('DELETE FROM llaves_retos WHERE id = ? RETURNING *').bind(id).first();
  if (!r || r.tipo !== tipo || r.expira < ahora()) return null;
  try { return JSON.parse(r.datos); } catch { return null; }
}
/** Mira un paso sin gastarlo. */
export async function verPaso(env, id, tipo) {
  if (typeof id !== 'string' || id.length < 20 || id.length > 100) return null;
  const r = await env.DB.prepare('SELECT * FROM llaves_retos WHERE id = ?').bind(id).first();
  if (!r || r.tipo !== tipo || r.expira < ahora()) return null;
  try { return JSON.parse(r.datos); } catch { return null; }
}

/** Cambia el código por el id_token y comprueba lo que dice (emisor, destinatario, caducidad, nonce, correo verificado).
    El token llega directamente de Google por HTTPS (no a través del navegador): según OpenID Connect Core 1.0 §3.1.3.7,
    en ese caso la conexión TLS sustituye a la comprobación de la firma. */
export async function cambiarCodigo(env, request, codigo, verificador, nonce) {
  const res = await fetch(urlToken(env), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: codigo, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: vuelta(request, env), grant_type: 'authorization_code', code_verifier: verificador }) });
  let d = null; try { d = await res.json(); } catch {}
  if (!res.ok || !d || typeof d.id_token !== 'string') throw new Error('Google no ha devuelto la identificación (' + res.status + (d && d.error ? ' ' + d.error : '') + ')');
  const partes = d.id_token.split('.');
  if (partes.length !== 3) throw new Error('Identificación de Google mal formada');
  let c; try { c = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')), x => x.charCodeAt(0)))); }
  catch { throw new Error('Identificación de Google ilegible'); }
  const t = ahora();
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') throw new Error('Emisor inesperado');
  if (c.aud !== env.GOOGLE_CLIENT_ID) throw new Error('La identificación no es para INNAZ');
  if (!c.exp || c.exp < t - 60) throw new Error('Identificación caducada');
  if (c.nonce !== nonce) throw new Error('La identificación no corresponde a esta petición');
  if (!c.sub || !c.email) throw new Error('Google no ha dado el correo');
  if (c.email_verified !== true && c.email_verified !== 'true') throw new Error('Tu correo de Google no está verificado');
  return { sub: String(c.sub), correo: String(c.email).trim().toLowerCase(), nombre: c.given_name || c.name || '', apellidos: c.family_name || '' };
}
export const nuevoIdG = nuevoId;
