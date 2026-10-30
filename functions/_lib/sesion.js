/* Mi INNAZ · sesiones · 27-10-2026
   La cookie lleva una ficha aleatoria; en la base solo se guarda su huella (SHA-256). */
import { ahora, huella, fichaAleatoria, leerCookie } from './util.js';

export const COOKIE = '__Host-innaz';
export const DURACION_SUSCRIPTOR = 30 * 24 * 3600;   // 30 días (decisión de César)
// Gestión: tras el segundo factor, los permisos de gestión duran pocas horas (variable DURACION_GESTION_HORAS, 4 por defecto).
// Pasado ese tiempo la persona sigue dentro como suscriptor y, para gestionar, vuelve a dar el código.
export const duracionGestion = env => Math.max(1, Math.min(12, Number(env.DURACION_GESTION_HORAS) || 4)) * 3600;

export function cookieSesion(ficha, segundos) {
  return `${COOKIE}=${ficha}; Path=/; Max-Age=${segundos}; HttpOnly; Secure; SameSite=Lax`;
}
export const cookieBorrar = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/** Crea una sesión. 'expira' permite conservar la caducidad de la sesión anterior al pasar a gestión. */
export async function crearSesion(env, usuarioId, tipo, request, expira = null) {
  const ficha = fichaAleatoria();
  const t = ahora();
  const fin = expira || t + DURACION_SUSCRIPTOR;
  await env.DB.prepare('INSERT INTO sesiones (huella, usuario_id, tipo, creada, expira, navegador, reauth) VALUES (?,?,?,?,?,?,?)')
    .bind(await huella(ficha), usuarioId, tipo, t, fin,
          (request.headers.get('User-Agent') || '').slice(0, 200), t).run();
  return cookieSesion(ficha, Math.max(60, fin - t));
}

/* Auditoría 30-10-2026 (decisión de César, B): las acciones sensibles (eliminar la cuenta, crear la primera contraseña,
   añadir una llave, quitar Google) exigen haber demostrado la identidad hace poco: al entrar o con «reautenticar». */
export const REAUTH_SEGUNDOS = 10 * 60;
export const reauthReciente = s => !!s && typeof s.sesion.reauth === 'number' && ahora() - s.sesion.reauth < REAUTH_SEGUNDOS;
export const RESPUESTA_REAUTH = { error: 'Por seguridad, antes confirma que eres tú (contraseña, Face ID / Touch ID o Google).', reauth: true };
export async function marcarReauth(env, s) {
  await env.DB.prepare('UPDATE sesiones SET reauth = ? WHERE huella = ?').bind(ahora(), s.sesion.huella).run();
}

/** Tras el segundo factor: la sesión actual se sustituye por una nueva de tipo 'gestion'
    (ficha nueva: lo que hubiera antes en el navegador deja de valer) con la misma caducidad. */
export async function elevarSesion(env, request, s) {
  const r = await env.DB.prepare('DELETE FROM sesiones WHERE huella = ?').bind(s.sesion.huella).run();
  if (r.meta.changes !== 1) return null;   // ya se elevó en otra petición simultánea: no se abren dos sesiones
  return crearSesion(env, s.usuario.id, 'gestion', request, s.sesion.expira);
}

/** Devuelve { sesion, usuario } o null. Solo usuarios en estado 'activo'. */
export async function leerSesion(env, request) {
  const ficha = leerCookie(request, COOKIE);
  if (!ficha || ficha.length < 20 || ficha.length > 100) return null;
  const h = await huella(ficha);
  const fila = await env.DB.prepare(
    `SELECT s.huella, s.tipo, s.creada, s.expira, s.reauth, u.id, u.correo, u.nombre, u.estado, u.boletin
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.huella = ?`).bind(h).first();
  if (!fila) return null;
  if (fila.expira <= ahora() || fila.estado !== 'activo') {
    await env.DB.prepare('DELETE FROM sesiones WHERE huella = ?').bind(h).run();
    return null;
  }
  // 'gestion' solo vale unas horas desde que se dio el código; después, la sesión sigue como suscriptor.
  const gestionHasta = fila.tipo === 'gestion' ? fila.creada + duracionGestion(env) : null;
  const tipo = fila.tipo === 'gestion' && ahora() < gestionHasta ? 'gestion' : 'suscriptor';
  return { sesion: { huella: h, tipo, creada: fila.creada, expira: fila.expira, reauth: fila.reauth ?? fila.creada, gestionHasta: tipo === 'gestion' ? gestionHasta : null },
           usuario: { id: fila.id, correo: fila.correo, nombre: fila.nombre, boletin: fila.boletin } };
}

export async function cerrarSesion(env, request) {
  const ficha = leerCookie(request, COOKIE);
  if (ficha) await env.DB.prepare('DELETE FROM sesiones WHERE huella = ?').bind(await huella(ficha)).run();
}
