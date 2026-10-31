/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · ALTA DE CUENTAS Y CONFIRMACIÓN DEL CORREO · 30-10-2026
   Lo comparten el registro con contraseña (api/acceso/clave.js) y con Face ID (api/llaves.js).
   · La cuenta nace con el correo SIN confirmar (usuarios.correo_verificado = 0) y con los datos básicos completos.
   · El enlace de confirmación (48 h, un solo uso) puede llevar la página a la que volver (p. ej. la suscripción elegida).
     El boletín se activa al confirmar (doble consentimiento).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, huella, huellaIP, fichaAleatoria, baseURL, nuevoId } from './util.js';
import { enviar } from './correo.js';
import { asignarNumero } from './numero.js';

export const CONFIRMAR_SEGUNDOS = 48 * 3600;

/** Páginas a las que se puede volver tras entrar o confirmar (nunca una dirección cualquiera: evita redirecciones abiertas). */
export function volverValido(v) {
  if (typeof v !== 'string') return null;
  return /^\/(mi-innaz(#[a-z]+)?|zlabs-preinscripcion|suscripciones(\?nivel=[a-z]{3,20})?|(buscador|obras)(\.html)?(\?[A-Za-z0-9=&%+._-]{0,120})?)$/.test(v) ? v : null;
}

/** Envía el enlace «Confirma tu correo». extra: { boletin?, volver?, via? }. Devuelve { ok, simulado } o { error }. */
export async function enviarConfirmacion(env, request, usuario, extra = {}) {
  const t = ahora(), ficha = fichaAleatoria(), ip = await huellaIP(request, env);
  const max = Math.max(1, Number(env.LIMITE_ENLACES_CORREO) || 3);
  const volver = volverValido(extra.volver);
  const datos = JSON.stringify({ confirmar: true, boletin: !!extra.boletin, via: extra.via === 'llave' ? 'llave' : 'clave', ...(volver ? { volver } : {}) });
  const ins = await env.DB.prepare(
    `INSERT INTO enlaces_acceso (huella, correo, creado, expira, usado, ip, datos)
     SELECT ?1, ?2, ?3, ?4, NULL, ?5, ?6 WHERE (SELECT COUNT(*) FROM enlaces_acceso WHERE correo = ?2 AND creado > ?3 - 900) < ?7`)
    .bind(await huella(ficha), usuario.correo, t, t + CONFIRMAR_SEGUNDOS, ip, datos, max).run();
  if (!ins.meta.changes) return { error: 'Ya te hemos enviado varios correos hace poco. Espera unos minutos y vuelve a probar.' };
  const enlace = `${baseURL(request, env)}/acceder#${ficha}`;
  const r = await enviar(env, 'confirmar-correo', usuario.correo, { nombre: usuario.nombre, enlace, via: extra.via || 'clave' });
  return { ok: true, simulado: r.simulado && env.MODO === 'pruebas' ? enlace : null };
}

/** Lo que pidió la persona en su último enlace de confirmación (para reenviarlo igual). */
export async function ultimaConfirmacion(env, correo) {
  const prev = await env.DB.prepare(`SELECT datos FROM enlaces_acceso WHERE correo = ? AND datos LIKE '%"confirmar":true%' ORDER BY creado DESC LIMIT 1`).bind(correo).first();
  try { return JSON.parse(prev?.datos || '{}'); } catch { return {}; }
}

/** Sentencias para crear una cuenta nueva SIN confirmar con sus básicos y la aceptación de la privacidad. */
export function sentenciasAlta(DB, { id, correo, basicos, privacidad, ip, t }) {
  return [
    DB.prepare(`INSERT INTO usuarios (id, correo, nombre, creado, ultimo_acceso, estado, boletin, correo_verificado, pais_declarado)
                VALUES (?,?,?,?,?,'activo',0,0,?)`).bind(id, correo, basicos.nombre, t, t, basicos.pais),
    DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, actualizado) VALUES (?,?,?)`).bind(id, basicos.apellidos, t),
    DB.prepare(`INSERT INTO suscripciones (id, usuario_id, nivel, alta, estado, renovacion_auto) VALUES (?,?,'registrado',?,'activa',0)`).bind(nuevoId(), id, t),
    DB.prepare(`INSERT INTO aceptaciones (id, usuario_id, documento, version, fecha, ip) VALUES (?,?,'privacidad',?,?,?)`).bind(nuevoId(), id, privacidad, t, ip),
  ];
}
/** Recuperación de una cuenta creada SIN confirmar por otra persona (auditoría 30-10-2026): fuera contraseña, llaves, Google,
    sesiones y los datos que escribió (nombre, país, Mis datos). El dueño del correo la completa de nuevo. */
export function sentenciasRecuperar(DB, uid) {
  return [
    DB.prepare('DELETE FROM llaves_acceso WHERE usuario_id = ?').bind(uid),
    DB.prepare('DELETE FROM claves WHERE usuario_id = ?').bind(uid),
    DB.prepare('DELETE FROM claves_enlaces WHERE usuario_id = ?').bind(uid),
    DB.prepare('DELETE FROM cuentas_google WHERE usuario_id = ?').bind(uid),
    DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(uid),
    DB.prepare('DELETE FROM datos_personales WHERE usuario_id = ?').bind(uid),
    DB.prepare('UPDATE usuarios SET correo_verificado = 1, boletin = 0, nombre = NULL, pais_declarado = NULL WHERE id = ?').bind(uid),
  ];
}
export async function trasAlta(env, id, t) { try { await asignarNumero(env, id, t); } catch (e) { console.error('numero:', e); } }

/** Freno de INTENTOS de alta por conexión (por hora): cuenta cada intento, no solo las altas consumadas (auditoría 30-10-2026).
    true = se puede seguir. Se usa también para «comprobar» y «olvido». */
export async function altaPermitida(env, request, accion = 'cuenta.intento', max = null) {
  const ip = await huellaIP(request, env), tope = Math.max(1, max ?? (Number(env.LIMITE_COMPROBAR) || 30));   // mismo tope que «comprobar»: por aquí se sabe lo mismo
  const t = ahora();
  const n = (await env.DB.prepare(`SELECT COUNT(*) n FROM registro WHERE accion = ? AND objeto = ? AND fecha > ?`).bind(accion, 'ip:' + ip, t - 3600).first()).n;
  if (n >= tope) return false;
  try { await env.DB.prepare('INSERT INTO registro (fecha, usuario_id, accion, objeto, detalle) VALUES (?,?,?,?,NULL)').bind(t, null, accion, 'ip:' + ip).run(); } catch {}
  return true;
}
export const objetoIP = async (env, request) => 'ip:' + await huellaIP(request, env);
