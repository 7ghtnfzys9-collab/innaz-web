/* POST /api/mi/suscribirse { nivel, periodicidad, alumno?, centro?, confirmar? }
   Solicitud de suscripción (o mejora) de quien YA ha entrado. Queda pendiente de pago. 28-10-2026
   Si tiene acceso gratuito o prueba, la primera vez responde 409 { aviso, mensaje } y hay que repetir con confirmar: true. */
import { json, correoVerificado, AVISO_SIN_CONFIRMAR } from '../../_lib/util.js';
import { leerSesion } from '../../_lib/sesion.js';
import { validarPlan, crearSolicitud } from '../../_lib/solicitud.js';
import { faltanBasicos } from '../../_lib/basicos.js';

/** 30-10-2026 (César): para una suscripción de pago hacen falta los datos básicos y, además, el documento y la dirección. */
async function faltanParaPagar(env, uid) {
  const f = await faltanBasicos(env, uid);
  const d = await env.DB.prepare('SELECT documento_cifrado, direccion_cifrada FROM datos_personales WHERE usuario_id = ?').bind(uid).first();
  if (!d?.documento_cifrado) f.push('documento');
  if (!d?.direccion_cifrada) f.push('direccion');
  return f;
}
const NOMBRES = { nombre: 'nombre', apellidos: 'apellidos', pais: 'país', documento: 'documento de identidad', direccion: 'dirección postal' };

export async function onRequestPost({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  if (!(await correoVerificado(env, s.usuario.id))) return json({ error: AVISO_SIN_CONFIRMAR, confirmar: true }, 403);   // 30-10-2026
  let d; try { d = await request.json(); } catch { d = null; }
  const v = validarPlan(d);
  if (v.error) return json({ error: v.error }, 400);
  const faltan = await faltanParaPagar(env, s.usuario.id);
  if (faltan.length) return json({ error: `Para suscribirte necesitamos estos datos: ${faltan.map(k => NOMBRES[k]).join(', ')}. Complétalos en «Mis datos» y vuelve a intentarlo.`, faltan, datos: true }, 409);
  try {
    const r = await crearSolicitud(env, request, s.usuario.id, v.plan, d.confirmar === true);
    if (r.aviso) return json({ aviso: true, mensaje: r.mensaje }, 409);
    return r.error ? json({ error: r.error }, 409) : json(r);
  } catch (e) { console.error('suscribirse:', e); return json({ error: 'No se ha podido registrar la solicitud. Prueba otra vez.' }, 500); }
}
