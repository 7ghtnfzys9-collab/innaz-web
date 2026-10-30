/* POST /api/acceso/salir → cierra la sesión en este navegador. */
import { json } from '../../_lib/util.js';
import { cerrarSesion, cookieBorrar } from '../../_lib/sesion.js';

export async function onRequestPost({ request, env }) {
  await cerrarSesion(env, request);
  return json({ ok: true }, 200, { 'Set-Cookie': cookieBorrar() });
}
