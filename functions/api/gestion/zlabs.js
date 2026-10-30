/* ══════════════════════════════════════════════════════════════════════
   Panel · ZLabs · selección de candidatos (28-10-2026, paso 3)
   GET  /api/gestion/zlabs                → preinscripciones de la edición, recuentos por cuerda   (zlabs.ver)
   GET  /api/gestion/zlabs?datos=<id>     → documento y dirección de un inscrito (queda anotado)    (zlabs.datos)
   POST /api/gestion/zlabs { accion:'estado', id, estado, papel?, notas? }                         (zlabs.seleccionar)
   POST /api/gestion/zlabs { accion:'comunicar' } → envía el resultado a los ACTIVOS cuyo estado
        (admitida, reserva, no_admitida) aún no se ha comunicado o ha cambiado desde el último envío  (zlabs.comunicar)
   · Las preinscripciones canceladas por el candidato no se pueden tocar.
   · Aviso (no bloqueo) si se admiten más de 4 por cuerda.
   · Todo cambio queda en el registro de actividad.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, anotar, limpiarTexto } from '../../_lib/util.js';
import { exigirPermiso } from '../../_lib/gestion.js';
import { descifrar } from '../../_lib/cifrado.js';
import { enviar } from '../../_lib/correo.js';
import { config, CUERDAS, NOMBRE_CUERDA, edadEn, direccionEnTexto } from '../../_lib/zlabs.js';

const PLAZAS_POR_CUERDA = 4;
const ESTADOS_SELECCION = ['recibida', 'admitida', 'reserva', 'no_admitida'];
async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), c = config(env), DB = env.DB;
  const idDatos = url.searchParams.get('datos');
  if (idDatos) {
    const p = await exigirPermiso(env, request, 'zlabs.datos');
    if (p instanceof Response) return p;
    const f = await DB.prepare('SELECT id, referencia, documento_tipo, documento_cifrado, direccion_cifrada FROM zlabs_preinscripciones WHERE id = ?').bind(idDatos).first();
    if (!f) return json({ error: 'No existe.' }, 404);
    await anotarSeguro(env, p.s.usuario.id, 'zlabs.ver_datos', f.id, { referencia: f.referencia });
    return json({ referencia: f.referencia, documento_tipo: f.documento_tipo,
      documento: await descifrar(env, 'zlabs', f.documento_cifrado), direccion: direccionEnTexto(await descifrar(env, 'zlabs', f.direccion_cifrada)) });
  }
  const p = await exigirPermiso(env, request, 'zlabs.ver');
  if (p instanceof Response) return p;
  const filas = (await DB.prepare(
    `SELECT id, referencia, creado, modificado, modalidad, nombre, apellidos, correo, telefono, fecha_nacimiento, cuerda, centro,
            num_suscriptor, video_romanza, video_texto, estado, papel, notas, comunicado, comunicado_estado
       FROM zlabs_preinscripciones WHERE edicion = ? ORDER BY modalidad, cuerda, creado`).bind(c.edicion).all()).results;
  const lista = filas.map(f => ({ ...f, edad: edadEn(f.fecha_nacimiento, c.inicio),
    pendienteComunicar: f.modalidad === 'activo' && ['admitida', 'reserva', 'no_admitida'].includes(f.estado) && f.comunicado_estado !== f.estado }));
  const recuento = {};
  for (const k of CUERDAS) recuento[k] = { nombre: NOMBRE_CUERDA[k], total: 0, admitida: 0, reserva: 0, no_admitida: 0, recibida: 0, plazas: PLAZAS_POR_CUERDA };
  for (const f of lista) if (f.modalidad === 'activo' && f.estado !== 'anulada' && recuento[f.cuerda]) { recuento[f.cuerda].total++; recuento[f.cuerda][f.estado]++; }
  return json({ edicion: c.edicion, abierta: c.abierta, recuento, lista,
    oyentes: lista.filter(f => f.modalidad === 'oyente' && f.estado !== 'anulada').length,
    pendientes: lista.filter(f => f.pendienteComunicar).length,
    puede: { seleccionar: p.permisos.includes('zlabs.seleccionar'), comunicar: p.permisos.includes('zlabs.comunicar'), datos: p.permisos.includes('zlabs.datos') } });
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos' }, 400);
  const c = config(env), DB = env.DB;

  if (d.accion === 'estado') {
    const p = await exigirPermiso(env, request, 'zlabs.seleccionar');
    if (p instanceof Response) return p;
    if (!ESTADOS_SELECCION.includes(d.estado)) return json({ error: 'Estado no válido.' }, 400);
    const f = await DB.prepare('SELECT id, referencia, modalidad, cuerda, estado FROM zlabs_preinscripciones WHERE id = ? AND edicion = ?').bind(String(d.id || ''), c.edicion).first();
    if (!f) return json({ error: 'No existe.' }, 404);
    if (f.estado === 'anulada') return json({ error: 'El candidato canceló esta preinscripción: no se puede cambiar.' }, 409);
    const papel = limpiarTexto(d.papel, 80), notas = limpiarTexto(d.notas, 1000);
    await DB.prepare('UPDATE zlabs_preinscripciones SET estado=?, papel=?, notas=?, modificado=? WHERE id=?')
      .bind(d.estado, papel, notas, ahora(), f.id).run();
    await anotarSeguro(env, p.s.usuario.id, 'zlabs.estado', f.id, { referencia: f.referencia, de: f.estado, a: d.estado, papel });
    let aviso = null;
    if (d.estado === 'admitida' && f.modalidad === 'activo') {
      const n = (await DB.prepare("SELECT COUNT(*) n FROM zlabs_preinscripciones WHERE edicion=? AND modalidad='activo' AND cuerda=? AND estado='admitida'")
        .bind(c.edicion, f.cuerda).first()).n;
      if (n > PLAZAS_POR_CUERDA) aviso = `Atención: hay ${n} ${NOMBRE_CUERDA[f.cuerda].toLowerCase()}s admitidas y las plazas son ${PLAZAS_POR_CUERDA}.`;
    }
    return json({ ok: true, mensaje: aviso || `${f.referencia}: guardado.`, aviso: !!aviso });
  }

  // Dar plaza a un oyente en lista de espera (César, 29-10-2026): queda admitido y se le avisa al momento
  if (d.accion === 'plaza_oyente') {
    const p = await exigirPermiso(env, request, 'zlabs.seleccionar');
    if (p instanceof Response) return p;
    const f = await DB.prepare("SELECT id, referencia, nombre, correo, estado FROM zlabs_preinscripciones WHERE id = ? AND edicion = ? AND modalidad = 'oyente'").bind(String(d.id || ''), c.edicion).first();
    if (!f) return json({ error: 'No existe ese oyente.' }, 404);
    if (f.estado !== 'reserva') return json({ error: f.estado === 'anulada' ? 'El oyente canceló su inscripción.' : 'Ese oyente ya tiene plaza.' }, 409);
    const t = ahora();
    // Solo si queda sitio, y en una sola sentencia (dos pulsaciones a la vez no dan dos plazas de más)
    const r = await DB.prepare(`UPDATE zlabs_preinscripciones SET estado = 'admitida', comunicado = ?1, comunicado_estado = 'admitida', modificado = ?1
        WHERE id = ?2 AND estado = 'reserva'
          AND (SELECT COUNT(*) FROM zlabs_preinscripciones WHERE edicion = ?3 AND modalidad = 'oyente' AND estado = 'admitida') < ?4`)
      .bind(t, f.id, c.edicion, c.aforoOyentes).run();
    if (!r.meta.changes) return json({ error: `No queda sitio: el aforo de oyentes (${c.aforoOyentes}) está completo.` }, 409);
    await anotarSeguro(env, p.s.usuario.id, 'zlabs.plaza_oyente', f.id, { referencia: f.referencia });
    const env_ = await enviar(env, 'zlabs-plaza-oyente', f.correo, { nombre: f.nombre, referencia: f.referencia, edicion: c.edicion });
    return json({ ok: true, mensaje: `${f.referencia}: plaza de oyente confirmada${env_.ok ? ' y avisado por correo' : ' (el correo ha fallado: avísale a mano)'}.` });
  }

  if (d.accion === 'comunicar') {
    const p = await exigirPermiso(env, request, 'zlabs.comunicar');
    if (p instanceof Response) return p;
    const filas = (await DB.prepare(
      `SELECT id, referencia, nombre, correo, cuerda, estado, papel, comunicado_estado FROM zlabs_preinscripciones
        WHERE edicion = ? AND modalidad = 'activo' AND estado IN ('admitida','reserva','no_admitida')
          AND (comunicado_estado IS NULL OR comunicado_estado <> estado)`).bind(c.edicion).all()).results;
    let enviados = 0, fallidos = 0;
    for (const f of filas) {
      // Auditoría 29-10-2026: se marca ANTES de enviar (si dos personas pulsan a la vez, cada correo sale una sola vez); si falla el envío, se desmarca.
      const antes = f.comunicado_estado ?? null;
      const marca = await DB.prepare(`UPDATE zlabs_preinscripciones SET comunicado=?1, comunicado_estado=?2 WHERE id=?3 AND estado=?2 AND (comunicado_estado IS NULL OR comunicado_estado <> ?2)`)
        .bind(ahora(), f.estado, f.id).run();
      if (!marca.meta.changes) continue;   // ya lo envió otra persona un instante antes
      const r = await enviar(env, 'zlabs-resultado', f.correo,
        { nombre: f.nombre, referencia: f.referencia, edicion: c.edicion, estado: f.estado, cuerda: NOMBRE_CUERDA[f.cuerda] || '', papel: f.papel });
      if (r.ok) enviados++;
      else { fallidos++; await DB.prepare('UPDATE zlabs_preinscripciones SET comunicado_estado=? WHERE id=?').bind(antes, f.id).run(); }
    }
    await anotarSeguro(env, p.s.usuario.id, 'zlabs.comunicar', null, { enviados, fallidos });
    return json({ ok: fallidos === 0, mensaje: `Resultados enviados: ${enviados}.` + (fallidos ? ` Han fallado ${fallidos}: vuelve a intentarlo.` : '') });
  }
  return json({ error: 'Acción desconocida' }, 400);
}
