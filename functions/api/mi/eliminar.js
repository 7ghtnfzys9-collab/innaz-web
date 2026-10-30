/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · ELIMINAR MI CUENTA · 31-10-2026 (decisiones de César; ver functions/_lib/baja.js)
   GET  /api/mi/eliminar                         → qué se perdería (suscripción en curso, ZLabs, roles)
   POST /api/mi/eliminar { confirmar: 'ELIMINAR' } → se elimina al momento y se cierra la sesión
   ══════════════════════════════════════════════════════════════════════ */
import { json } from '../../_lib/util.js';
import { leerSesion, cookieBorrar, reauthReciente, RESPUESTA_REAUTH } from '../../_lib/sesion.js';
import { resumenBaja, eliminarCuenta, CONFIRMACION } from '../../_lib/baja.js';

export async function onRequestGet({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  return json({ ok: true, confirmacion: CONFIRMACION, reauth: reauthReciente(s), ...(await resumenBaja(env, s.usuario.id)) });
}

export async function onRequestPost({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  if (!reauthReciente(s)) return json(RESPUESTA_REAUTH, 403);   // auditoría 30-10-2026 (decisión B)
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || String(d.confirmar || '').trim().toUpperCase() !== CONFIRMACION)
    return json({ error: `Para eliminar tu cuenta escribe ${CONFIRMACION} en la casilla.`, campo: 'confirmar' }, 400);
  try {
    const r = await eliminarCuenta(env, request, s.usuario.id, { tipo: 'persona', id: s.usuario.id });
    if (r.error) return json({ error: r.error }, r.status || 400);
    return json({ ok: true, mensaje: 'Tu cuenta se ha eliminado. Te hemos enviado un correo de confirmación.' }, 200, { 'Set-Cookie': cookieBorrar() });
  } catch (e) { console.error('eliminar cuenta:', e); return json({ error: 'No se ha podido eliminar la cuenta. Prueba otra vez; si se repite, escribe a info@innaz.es.' }, 500); }
}
