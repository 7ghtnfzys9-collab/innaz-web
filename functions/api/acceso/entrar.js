/* ══════════════════════════════════════════════════════════════════════
   POST /api/acceso/entrar   { ficha, paso? }
   Usa el ENLACE DE CONFIRMACIÓN DEL CORREO (48 h, un solo uso). Se llama desde acceder.html al pulsar el botón
   (no al abrir el enlace: así los antivirus de correo que abren enlaces solos no lo gastan).
   30-10-2026 (César): el correo ya no sirve para entrar. Este enlace solo confirma el correo de una cuenta recién creada
   (con contraseña o con Face ID), activa el boletín si se pidió (doble consentimiento) y deja dentro a la persona.
   Auditoría 30-10-2026 (decisión de César, opción A1): si la confirmación llega desde un navegador que NO tiene la sesión
   con la que se creó la cuenta, puede ser que otra persona registrara este correo. Entonces:
     paso 'consultar' → no gasta el enlace; responde { preguntar: true } y acceder.html pregunta «¿Has creado tú esta cuenta?»
     paso 'propia'    → confirma como siempre.
     paso 'recuperar' → el dueño del correo recupera la cuenta: fuera contraseña, llaves, Google, sesiones y datos del otro;
                        se devuelve un enlace para crear SU contraseña (ya ha demostrado que el correo es suyo).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, huella, anotar, baseURL } from '../../_lib/util.js';
import { crearSesion, cerrarSesion, leerSesion } from '../../_lib/sesion.js';
import { asignarAdminInicial } from '../../_lib/gestion.js';
import { volverValido, sentenciasRecuperar } from '../../_lib/cuenta.js';
import { nuevoEnlaceClave } from '../../_lib/clave.js';

const ERROR = { error: 'El enlace no es válido, ya se usó o ha caducado. Si tu correo sigue sin confirmar, entra y pide otro desde Mi INNAZ.' };

export async function onRequestPost({ request, env }) {
  let d;
  try { d = await request.json(); } catch { d = null; }
  const ficha = d && typeof d === 'object' && typeof d.ficha === 'string' ? d.ficha.trim() : '';
  if (ficha.length < 20 || ficha.length > 100) return json(ERROR, 400);
  const paso = ['consultar', 'propia', 'recuperar'].includes(d.paso) ? d.paso : 'propia';

  const DB = env.DB, t = ahora(), h = await huella(ficha);
  try {
    const s = await leerSesion(env, request);
    if (paso === 'consultar') {   // mirar sin gastar
      const e = await DB.prepare('SELECT correo FROM enlaces_acceso WHERE huella = ? AND usado IS NULL AND expira > ?').bind(h, t).first();
      if (!e) return json(ERROR, 400);
      const u = await DB.prepare('SELECT id, correo_verificado FROM usuarios WHERE correo = ?').bind(e.correo).first();
      const preguntar = !!u && u.correo_verificado === 0 && (!s || s.usuario.id !== u.id);
      return json({ ok: true, preguntar, correo: e.correo });
    }
    const enlace = await DB.prepare(
      'UPDATE enlaces_acceso SET usado = ? WHERE huella = ? AND usado IS NULL AND expira > ? RETURNING correo, datos')
      .bind(t, h, t).first();
    if (!enlace) return json(ERROR, 400);
    let datos = {}; try { datos = JSON.parse(enlace.datos || '{}'); } catch {}
    if (!datos.confirmar) return json(ERROR, 400);   // solo enlaces de confirmación

    const u = await DB.prepare('SELECT id, estado, correo_verificado FROM usuarios WHERE correo = ?').bind(enlace.correo).first();
    if (!u || u.estado !== 'activo') return json(ERROR, 400);

    if (paso === 'recuperar' && u.correo_verificado === 0) {
      await DB.batch(sentenciasRecuperar(DB, u.id));
      await anotar(env, u.id, 'cuenta.recuperar', u.id, { motivo: 'al confirmar el correo dijo que no había creado la cuenta' });
      const f = await nuevoEnlaceClave(env, u.id, 'olvido-mi');
      return json({ ok: true, recuperada: true, crearClave: `${baseURL(request, env)}/entrar#clave=${f}` });
    }
    let confirmado = false;
    if (u.correo_verificado === 0) {
      await DB.prepare(`UPDATE usuarios SET correo_verificado = 1, boletin = ?, boletin_fecha = ?, boletin_origen = ?, ultimo_acceso = ? WHERE id = ?`)
        .bind(datos.boletin ? 1 : 0, datos.boletin ? t : null, datos.boletin ? 'registro-' + (datos.via || 'clave') : null, t, u.id).run();
      await anotar(env, u.id, 'cuenta.confirmar', u.id, { boletin: !!datos.boletin, via: datos.via || null, mismoNavegador: !!s && s.usuario.id === u.id });
      confirmado = true;
    } else await DB.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').bind(t, u.id).run();
    await asignarAdminInicial(env, { id: u.id, correo: enlace.correo });
    await cerrarSesion(env, request);   // si en este navegador había otra cuenta abierta, se cierra
    const cookie = await crearSesion(env, u.id, 'suscriptor', request);
    await anotar(env, u.id, 'acceso.entrar', null, { via: 'confirmar' });
    return json({ ok: true, confirmado, volver: volverValido(datos.volver) }, 200, { 'Set-Cookie': cookie });
  } catch (e) {
    console.error('confirmar:', e);
    return json({ error: 'No se ha podido completar. Prueba otra vez; si se repite, avisa a INNAZ.' }, 500);
  }
}
