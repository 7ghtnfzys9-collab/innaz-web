/* Mi INNAZ · utilidades comunes · 27-10-2026 */

export const ahora = () => Math.floor(Date.now() / 1000);

const CAB_JSON = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
export function json(obj, status = 200, extra = {}) {
  const h = new Headers(CAB_JSON);
  for (const [k, v] of Object.entries(extra)) {
    if (Array.isArray(v)) v.forEach(x => h.append(k, x)); else h.set(k, v);
  }
  return new Response(JSON.stringify(obj), { status, headers: h });
}

export async function huella(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Ficha aleatoria segura (32 bytes) en base64url: para enlaces y sesiones. */
export function fichaAleatoria(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Identificador para filas (UUID aleatorio). */
export const nuevoId = () => crypto.randomUUID();

/** Huella de la IP con la sal secreta: nunca se guarda la IP en claro. */
export async function huellaIP(request, env) {
  if (!env.SAL) throw new Error('Falta el secreto SAL');
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  return huella(env.SAL + '|' + ip);
}

/** Correo normalizado y validado (validación sencilla y prudente). */
export function limpiarCorreo(c) {
  if (typeof c !== 'string') return null;
  c = c.trim().toLowerCase();
  if (c.length > 254 || !/^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/.test(c)) return null;
  return c;
}

export function limpiarTexto(t, max = 120) {
  if (typeof t !== 'string') return null;
  t = t.replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
  return t ? t.slice(0, max) : null;
}

export function leerCookie(request, nombre) {
  const c = request.headers.get('Cookie') || '';
  for (const parte of c.split(';')) {
    const i = parte.indexOf('=');
    // Sin decodificar: nuestras fichas van en base64url. Lo que no lo sea, se descarta.
    if (i > 0 && parte.slice(0, i).trim() === nombre) {
      const v = parte.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
    }
  }
  return null;
}

/** Dirección fija de la web (variable BASE_URL); no se fía de la cabecera Host. */
export function baseURL(request, env) {
  if (env.BASE_URL) return env.BASE_URL.replace(/\/+$/, '');
  if (env.MODO === 'produccion') throw new Error('Falta la variable BASE_URL');
  return new URL(request.url).origin;   // solo en pruebas/local
}

/** ¿Ha confirmado su correo? (30-10-2026: las cuentas creadas con Face ID nacen sin confirmar). Si la columna aún no existe, sí. */
export async function correoVerificado(env, usuarioId) {
  try { const r = await env.DB.prepare('SELECT correo_verificado v FROM usuarios WHERE id = ?').bind(usuarioId).first(); return !!r && r.v !== 0; }
  catch (e) { console.error('correoVerificado:', e); return env.MODO === 'pruebas'; }   // auditoría 30-10-2026: en producción, ante la duda, NO verificado
}
export const AVISO_SIN_CONFIRMAR = 'Antes tienes que confirmar tu correo: pulsa el enlace que te hemos enviado (en Mi INNAZ puedes pedir que te lo enviemos otra vez).';

export async function anotar(env, usuarioId, accion, objeto = null, detalle = null) {
  await env.DB.prepare('INSERT INTO registro (fecha, usuario_id, accion, objeto, detalle) VALUES (?,?,?,?,?)')
    .bind(ahora(), usuarioId, accion, objeto, detalle ? JSON.stringify(detalle) : null).run();
}
