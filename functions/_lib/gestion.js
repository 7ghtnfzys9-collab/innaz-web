/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · perfiles de gestión y permisos · 27-10-2026
   · Quien tiene algún perfil vigente necesita el SEGUNDO FACTOR para gestionar.
   · exigirPermiso(): la puerta de todos los futuros endpoints del panel.
   · Primer Administrador: el correo de la variable ADMIN_INICIAL recibe el perfil
     «administrador» al entrar, SOLO si nunca ha habido ningún Administrador (una sola vez).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, anotar } from './util.js';
import { leerSesion } from './sesion.js';

export async function perfilesDe(env, usuarioId) {
  const t = ahora();
  return (await env.DB.prepare(
    `SELECT p.id, p.nombre, p.requiere_aprobacion FROM usuario_perfiles up JOIN perfiles p ON p.id = up.perfil_id
      WHERE up.usuario_id = ? AND up.desde <= ? AND (up.hasta IS NULL OR up.hasta > ?) ORDER BY p.nombre`)
    .bind(usuarioId, t, t).all()).results;
}

export async function permisosDe(env, usuarioId) {
  const t = ahora();
  const filas = (await env.DB.prepare(
    `SELECT DISTINCT pp.permiso FROM usuario_perfiles up JOIN perfil_permisos pp ON pp.perfil_id = up.perfil_id
      WHERE up.usuario_id = ? AND up.desde <= ? AND (up.hasta IS NULL OR up.hasta > ?) ORDER BY pp.permiso`)
    .bind(usuarioId, t, t).all()).results;
  return filas.map(f => f.permiso);
}

export async function tieneFactor(env, usuarioId) {
  return !!(await env.DB.prepare('SELECT 1 FROM segundo_factor WHERE usuario_id = ? AND confirmado = 1 LIMIT 1')
    .bind(usuarioId).first());
}

/** Primer Administrador (una sola vez): si no hay ninguno vigente y el correo coincide con ADMIN_INICIAL. */
export async function asignarAdminInicial(env, usuario) {
  const objetivo = (env.ADMIN_INICIAL || '').trim().toLowerCase();
  if (!objetivo || usuario.correo !== objetivo) return false;
  const t = ahora();
  // Solo la PRIMERA vez: si alguna vez ha habido un Administrador (vigente o no), ya no se asigna solo.
  const hay = await env.DB.prepare(`SELECT 1 FROM usuario_perfiles WHERE perfil_id = 'administrador' LIMIT 1`).first();
  if (hay) return false;
  const r = await env.DB.prepare(
    `INSERT INTO usuario_perfiles (usuario_id, perfil_id, asignado_por, desde, hasta) VALUES (?, 'administrador', NULL, ?, NULL)
     ON CONFLICT(usuario_id, perfil_id) DO UPDATE SET desde = excluded.desde, hasta = NULL`)
    .bind(usuario.id, t).run();
  if (r.meta.changes) await anotar(env, usuario.id, 'perfil.asignar', usuario.id, { perfil: 'administrador', origen: 'ADMIN_INICIAL' });
  return true;
}

/** Puerta de los endpoints del panel. Devuelve { s, permisos } o una Response de error. */
export async function exigirPermiso(env, request, permiso) {
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  if (s.sesion.tipo !== 'gestion') return json({ error: 'Tu sesión de gestión ha caducado: vuelve a entrar con tu contraseña.', entrar: true }, 403);
  const permisos = await permisosDe(env, s.usuario.id);
  if (permiso && !permisos.includes(permiso)) return json({ error: 'No tienes permiso para esto.' }, 403);
  return { s, permisos };
}
