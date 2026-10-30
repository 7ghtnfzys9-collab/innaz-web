/* ══════════════════════════════════════════════════════════════════════
   POST /api/zlabs/preinscripcion · ZLabs (28-10-2026)
   Recibe la preinscripción de un alumno activo u oyente y la guarda en zlabs_preinscripciones.
   · Valida todo en el servidor (functions/_lib/zlabs.js → validarPreinscripcion).
   · No se admiten menores de edad (decisión de César, 28-10-2026).
   · Dirección y documento se guardan cifrados. La IP, solo como huella.
   · Frenos: campo trampa para robots y 5 preinscripciones por conexión cada hora.
   · Una preinscripción viva por persona (correo), edición y modalidad. Una cancelada no impide volver a inscribirse.
   · Enlace personal para cancelar o corregir (/zlabs-mi-preinscripcion#…): se guarda solo su huella.
   · Correos: confirmación al candidato (con el enlace) y aviso interno (en pruebas, simulados).
   · Desde el 28-10-2026 se hace DENTRO de Mi INNAZ: hay que haber entrado. El correo es el de la cuenta.
     Documento vacío = el guardado en «Mis datos». Con «guardar_mis_datos» se actualizan también «Mis datos».
     El número de suscriptor ya no se escribe: se toma de la suscripción de la cuenta (solo informativo;
     el descuento se comprueba al pagar).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, huella, huellaIP, fichaAleatoria, nuevoId, baseURL, anotar, correoVerificado, AVISO_SIN_CONFIRMAR } from '../../_lib/util.js';
import { cifrar, descifrar } from '../../_lib/cifrado.js';
import { leerSesion } from '../../_lib/sesion.js';
import { enviar } from '../../_lib/correo.js';
import { config, NOMBRE_CUERDA, validarPreinscripcion, nuevaReferencia, estadoSuscripcion, estadoVisible } from '../../_lib/zlabs.js';

const MAX_IP_HORA = 5;

export async function onRequestPost({ request, env }) {
  const c = config(env);
  if (!c.abierta) return json({ error: 'La preinscripción de ZLabs no está abierta.' }, 403);
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos' }, 400);
  if (d.web) return json({ ok: true, referencia: 'ZL00-000000' });   // campo trampa: robots

  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Para preinscribirte, entra primero en Mi INNAZ.', entrar: true }, 401);
  if (!(await correoVerificado(env, s.usuario.id))) return json({ error: AVISO_SIN_CONFIRMAR, confirmar: true }, 403);   // 30-10-2026
  d.correo = s.usuario.correo;                                        // siempre el de la cuenta
  const guardado = await env.DB.prepare('SELECT documento_tipo, documento_cifrado FROM datos_personales WHERE usuario_id = ?').bind(s.usuario.id).first();
  if (!String(d.documento || '').trim() && guardado?.documento_cifrado) {   // documento vacío → el de «Mis datos»
    if (guardado.documento_tipo !== d.documento_tipo) return json({ error: 'Has cambiado el tipo de documento: escribe también el número.', campo: 'documento' }, 400);
    try { d.documento = await descifrar(env, 'datos', guardado.documento_cifrado); } catch {}
  }
  const susc = await estadoSuscripcion(env, s.usuario.id, c);
  d.num_suscriptor = susc.numero || '';

  const r = validarPreinscripcion(d, c);
  if (r.error) return json(r, 400);
  const v = r.v;

  const t = ahora(), ip = await huellaIP(request, env), DB = env.DB;
  const previa = await DB.prepare('SELECT id, referencia, estado FROM zlabs_preinscripciones WHERE edicion=? AND correo=? AND modalidad=?')
    .bind(c.edicion, v.correo, v.modalidad).first();
  if (previa && previa.estado !== 'anulada')
    return json({ error: `Ya hay una preinscripción con este correo como ${v.modalidad === 'activo' ? 'alumno activo' : 'oyente'} (${previa.referencia}). Puedes verla, corregirla o cancelarla en Mi INNAZ.` }, 409);

  // Una sola preinscripción viva por persona (César, 28-10-2026). Única excepción: quien se presentó como
  // alumno activo y ha quedado en reserva o no admitido puede inscribirse además como oyente.
  const otra = await DB.prepare(`SELECT referencia, modalidad, estado, comunicado_estado FROM zlabs_preinscripciones
      WHERE edicion = ? AND (usuario_id = ? OR correo = ?) AND modalidad <> ? AND estado <> 'anulada' LIMIT 1`)
    .bind(c.edicion, s.usuario.id, v.correo, v.modalidad).first();
  if (otra && !(v.modalidad === 'oyente' && otra.modalidad === 'activo' && ['reserva', 'no_admitida'].includes(estadoVisible(otra))))
    return json({ error: `Ya tienes una preinscripción en ZLabs ${c.edicion} (${otra.referencia}, como ${otra.modalidad === 'activo' ? 'alumno activo' : 'oyente'}). Si quieres cambiar de modalidad, cancélala antes en Mi INNAZ.` }, 409);

  const id = nuevoId(), ref = nuevaReferencia(c.edicion), ficha = fichaAleatoria();
  // Oyentes (César, 28-10-2026): sin selección; admitidos hasta el aforo (?25), después lista de espera. Activos: 'recibida'.
  const PLAZA = `CASE WHEN ?5 <> 'oyente' THEN 'recibida' WHEN (SELECT COUNT(*) FROM zlabs_preinscripciones
      WHERE edicion = ?3 AND modalidad = 'oyente' AND estado = 'admitida') < ?25 THEN 'admitida' ELSE 'reserva' END`;
  const dirC = await cifrar(env, 'zlabs', v.direccion), docC = await cifrar(env, 'zlabs', v.doc);
  const sql = [];
  if (previa) sql.push(DB.prepare('DELETE FROM zlabs_preinscripciones WHERE id = ? AND estado = ?').bind(previa.id, 'anulada'));
  sql.push(DB.prepare(
    `INSERT INTO zlabs_preinscripciones (id, referencia, edicion, creado, modalidad, nombre, apellidos, correo, telefono,
       fecha_nacimiento, direccion_cifrada, documento_tipo, documento_cifrado, cuerda, centro, num_suscriptor,
       video_romanza, video_texto, acepta_condiciones, acepta_privacidad, acepta_imagen, ip, gestion_huella, usuario_id,
       estado, comunicado, comunicado_estado)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,
       ${PLAZA}, CASE WHEN ?5 = 'oyente' THEN ?4 END, CASE WHEN ?5 = 'oyente' THEN ${PLAZA} END
      WHERE (SELECT COUNT(*) FROM zlabs_preinscripciones WHERE ip = ?22 AND creado > ?4 - 3600) < ${MAX_IP_HORA}`)
    .bind(id, ref, c.edicion, t, v.modalidad, v.nombre, v.apellidos, v.correo, v.telefono, v.nac, dirC, v.tipoDoc, docC,
          v.cuerda, v.centro, v.susc, v.v1, v.v2, c.versionCondiciones, env.VERSION_PRIVACIDAD || 'sin-version',
          c.versionCondiciones, ip, await huella(ficha), s.usuario.id, c.aforoOyentes));
  let res;
  try { res = await DB.batch(sql); }
  catch (e) { if (/UNIQUE/i.test(String(e.message || e))) return json({ error: 'Ya hay una preinscripción con este correo.' }, 409); throw e; }
  const ins = res[res.length - 1];
  if (!ins.meta || ins.meta.changes !== 1) return json({ error: '¡Demasiados envíos desde esta conexión! Prueba dentro de una hora.' }, 429);
  // Queda en el registro de actividad (César, 29-10-2026: el histórico no se pierde aunque luego se cancele y se reinscriba)
  try { await anotar(env, s.usuario.id, 'zlabs.preinscribir', id, { referencia: ref, modalidad: v.modalidad, cuerda: v.cuerda, sustituyeAnulada: previa ? previa.referencia : null }); } catch (e) { console.error('registro:', e); }

  if (d.guardar_mis_datos === true) {          // «Guardar también en Mis datos» (marcado por defecto), solo si se ha guardado la preinscripción
    const misDatos = [];
    misDatos.push(DB.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?').bind(v.nombre, s.usuario.id));
    misDatos.push(DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, telefono, fecha_nacimiento, documento_tipo, documento_cifrado, direccion_cifrada, centro, actualizado)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(usuario_id) DO UPDATE SET apellidos=excluded.apellidos, telefono=excluded.telefono, fecha_nacimiento=excluded.fecha_nacimiento,
                  documento_tipo=excluded.documento_tipo, documento_cifrado=excluded.documento_cifrado, direccion_cifrada=excluded.direccion_cifrada,
                  centro=COALESCE(excluded.centro, datos_personales.centro), actualizado=excluded.actualizado`)
      .bind(s.usuario.id, v.apellidos, v.telefono, v.nac, v.tipoDoc, await cifrar(env, 'datos', v.doc), await cifrar(env, 'datos', v.direccion), v.centro, t));
    try { await DB.batch(misDatos); } catch {}
  }

  // Desde Mi INNAZ, el enlace del correo lleva a la preinscripción dentro de la cuenta (pide haber entrado).
  const enlace = `${baseURL(request, env)}/zlabs-mi-preinscripcion#ref=${ref}`;
  const plaza = v.modalidad === 'oyente' ? (await DB.prepare('SELECT estado FROM zlabs_preinscripciones WHERE id = ?').bind(id).first())?.estado : null;
  const datos = { nombre: v.nombre, referencia: ref, edicion: c.edicion, modalidad: v.modalidad, cuerda: v.cuerda ? NOMBRE_CUERDA[v.cuerda] : null, plaza };
  const envio = await enviar(env, 'zlabs-preinscripcion', v.correo, { ...datos, enlace });
  await enviar(env, 'zlabs-aviso', c.avisos, { ...datos, apellidos: v.apellidos, correo: v.correo });
  const salida = { ok: true, referencia: ref, suscripcion: susc.texto, descuento: susc.descuento, plaza };
  if (envio.simulado && env.MODO === 'pruebas') salida.enlace_simulado = enlace;   // NUNCA en producción
  return json(salida);
}
