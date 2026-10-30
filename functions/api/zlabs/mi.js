/* ══════════════════════════════════════════════════════════════════════
   POST /api/zlabs/mi · ZLabs (28-10-2026) · ver, corregir o cancelar la propia preinscripción
   { ficha | ref, accion: 'ver' | 'corregir' | 'cancelar', datos? }
   · La ficha es la parte secreta del enlace del correo; se busca por su huella.
   · O bien (desde Mi INNAZ, 28-10-2026) la referencia, con la sesión abierta: solo las preinscripciones de esa cuenta.
     En las hechas desde Mi INNAZ el correo es el de la cuenta y no se cambia aquí.
   · Corregir y cancelar solo con el plazo abierto y, si es activo, mientras no se le haya comunicado el resultado
     (César, 28-10-2026: no ve las decisiones provisionales de la Comisión). Después hay que escribir a ZLabs.
   · La modalidad no se cambia aquí (para pasar de oyente a activo, o al revés: cancelar e inscribirse de nuevo).
   · Documento y dirección nunca se devuelven enteros: solo los 4 últimos caracteres del documento.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, huella, anotar } from '../../_lib/util.js';
async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }
import { cifrar, descifrar } from '../../_lib/cifrado.js';
import { enviar } from '../../_lib/correo.js';
import { config, NOMBRE_CUERDA, validarPreinscripcion, estadoVisible, esEditable, textoEstado, SQL_EDITABLE } from '../../_lib/zlabs.js';
import { leerSesion } from '../../_lib/sesion.js';


export async function onRequestPost({ request, env }) {
  const c = config(env), DB = env.DB;
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos' }, 400);
  let fila = null, s = null;
  const conSesion = typeof d.ref === 'string';
  if (conSesion) {                                   // desde Mi INNAZ, con la sesión
    if (!/^ZL\d{2}-[A-Z0-9]{6}$/.test(d.ref)) return json({ error: 'Referencia no válida.' }, 400);
    s = await leerSesion(env, request);
    if (!s) return json({ error: 'Entra primero en Mi INNAZ.', entrar: true }, 401);
    fila = await DB.prepare('SELECT * FROM zlabs_preinscripciones WHERE referencia = ? AND usuario_id = ? AND edicion = ?')
      .bind(d.ref, s.usuario.id, c.edicion).first();
  } else {
    if (typeof d.ficha !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(d.ficha)) return json({ error: 'Enlace no válido.' }, 400);
    fila = await DB.prepare('SELECT * FROM zlabs_preinscripciones WHERE gestion_huella = ? AND edicion = ?')
      .bind(await huella(d.ficha), c.edicion).first();
  }
  if (!fila) return json({ error: 'Este enlace no es válido o la preinscripción ya no existe.' }, 404);
  // Hecha desde Mi INNAZ y abierta con el enlace secreto: se gestiona en Mi INNAZ (allí se ven todos los datos).
  if (!conSesion && fila.usuario_id) {
    if (d.accion === 'ver') return json({ ok: true, ir_a_cuenta: true, ref: fila.referencia });
    return json({ error: 'Esta preinscripción se gestiona desde Mi INNAZ.', entrar: true }, 409);
  }
  const editable = esEditable(fila, c);

  if (d.accion === 'ver') {
    let docFin = '', completo = {};
    try { const doc = await descifrar(env, 'zlabs', fila.documento_cifrado); docFin = doc.slice(-4);
      // Con la sesión de su propia cuenta, se devuelven todos los datos para que la corrección salga entera (César, 28-10-2026)
      if (conSesion) completo.documento = doc; } catch {}
    if (conSesion) { try { const x = JSON.parse(await descifrar(env, 'zlabs', fila.direccion_cifrada));
      for (const k of ['calle','numero','piso','cp','poblacion','provincia','pais']) completo['dir_' + k] = x[k] || ''; } catch {} }
    return json({ ok: true, editable, cuenta: !!fila.usuario_id, estado: estadoVisible(fila), estado_texto: textoEstado(fila), contacto: c.avisos,
      p: { referencia: fila.referencia, modalidad: fila.modalidad, nombre: fila.nombre, apellidos: fila.apellidos, correo: fila.correo,
           telefono: fila.telefono, fecha_nacimiento: fila.fecha_nacimiento, documento_tipo: fila.documento_tipo, documento_fin: docFin,
           cuerda: fila.cuerda, centro: fila.centro, num_suscriptor: fila.num_suscriptor,
           video_romanza: fila.video_romanza, video_texto: fila.video_texto, ...completo } });
  }
  if (!editable) return json({ error: `Esta preinscripción ya no se puede cambiar desde aquí (${textoEstado(fila)}). Escríbenos a ${c.avisos}.` }, 409);

  if (d.accion === 'cancelar') {
    await DB.prepare("UPDATE zlabs_preinscripciones SET estado='anulada', modificado=? WHERE id=? AND " + SQL_EDITABLE).bind(ahora(), fila.id).run();
    await anotarSeguro(env, fila.usuario_id || null, 'zlabs.cancelar', fila.id, { referencia: fila.referencia, modalidad: fila.modalidad, estadoAntes: fila.estado });   // queda en el registro (César, 29-10-2026)
    const datos = { nombre: fila.nombre, referencia: fila.referencia, edicion: c.edicion, modalidad: fila.modalidad };
    await enviar(env, 'zlabs-cancelada', fila.correo, datos);
    await enviar(env, 'zlabs-aviso-cambio', c.avisos, { ...datos, apellidos: fila.apellidos, correo: fila.correo, cambio: 'cancelada' });
    return json({ ok: true, mensaje: 'Tu preinscripción se ha cancelado. Te hemos enviado un correo de confirmación.' });
  }

  if (d.accion === 'corregir') {
    const datos = { ...(d.datos || {}), modalidad: fila.modalidad };           // la modalidad no cambia
    if (fila.usuario_id) datos.correo = fila.correo;                           // hecha desde Mi INNAZ: el correo es el de la cuenta
    datos.num_suscriptor = fila.num_suscriptor || '';                           // lo pone el sistema, no la persona
    const r = validarPreinscripcion(datos, c, { correccion: true });
    if (r.error) return json(r, 400);
    const v = r.v;
    if (v.correo !== fila.correo) {
      const otra = await DB.prepare("SELECT 1 FROM zlabs_preinscripciones WHERE edicion=? AND correo=? AND modalidad=? AND id<>? AND estado<>'anulada'")
        .bind(c.edicion, v.correo, fila.modalidad, fila.id).first();
      if (otra) return json({ error: 'Ya hay otra preinscripción con ese correo.', campo: 'correo' }, 409);
    }
    const dirC = v.direccion ? await cifrar(env, 'zlabs', v.direccion) : fila.direccion_cifrada;
    const docC = v.doc ? await cifrar(env, 'zlabs', v.doc) : fila.documento_cifrado;
    // Si se cambia el tipo de documento, hay que escribir el número nuevo.
    if (v.tipoDoc !== fila.documento_tipo && !v.doc) return json({ error: 'Has cambiado el tipo de documento: escribe también el número.', campo: 'documento' }, 400);
    // Qué ha cambiado (para avisar a la persona y a ZLabs; sin enseñar nunca el documento ni la dirección en el correo)
    let docAntes = null, dirAntes = null;
    try { docAntes = await descifrar(env, 'zlabs', fila.documento_cifrado); } catch {}
    try { dirAntes = await descifrar(env, 'zlabs', fila.direccion_cifrada); } catch {}
    const cambios = [];
    const mira = (antes, ahora_, etiqueta) => { if ((antes || '') !== (ahora_ || '')) cambios.push(etiqueta); };
    mira(fila.nombre, v.nombre, 'nombre'); mira(fila.apellidos, v.apellidos, 'apellidos'); mira(fila.correo, v.correo, 'correo');
    mira(fila.telefono, v.telefono, 'teléfono'); mira(fila.fecha_nacimiento, v.nac, 'fecha de nacimiento');
    if (v.tipoDoc !== fila.documento_tipo || (v.doc && v.doc !== docAntes)) cambios.push('documento');
    if (v.direccion && v.direccion !== dirAntes) cambios.push('dirección');
    mira(fila.centro, v.centro, 'centro de estudios'); mira(fila.cuerda, v.cuerda, 'cuerda');
    mira(fila.video_romanza, v.v1, 'vídeo 1'); mira(fila.video_texto, v.v2, 'vídeo 2');
    if (!cambios.length) return json({ ok: true, sin_cambios: true, mensaje: 'No has cambiado nada: todo se mantiene igual.' });
    try {
      await DB.prepare(`UPDATE zlabs_preinscripciones SET nombre=?, apellidos=?, correo=?, telefono=?, fecha_nacimiento=?,
          direccion_cifrada=?, documento_tipo=?, documento_cifrado=?, cuerda=?, centro=?, num_suscriptor=?, video_romanza=?,
          video_texto=?, modificado=? WHERE id=? AND ${SQL_EDITABLE}`)
        .bind(v.nombre, v.apellidos, v.correo, v.telefono, v.nac, dirC, v.tipoDoc, docC, v.cuerda, v.centro, v.susc,
              v.v1, v.v2, ahora(), fila.id).run();
    } catch (e) { if (/UNIQUE/i.test(String(e.message || e))) return json({ error: 'Ya hay otra preinscripción con ese correo.', campo: 'correo' }, 409); throw e; }
    const aviso = { nombre: v.nombre, referencia: fila.referencia, edicion: c.edicion, modalidad: fila.modalidad,
                    cuerda: v.cuerda ? NOMBRE_CUERDA[v.cuerda] : null, cambios };
    await anotarSeguro(env, fila.usuario_id || null, 'zlabs.corregir', fila.id, { referencia: fila.referencia, cambios });
    if (conSesion && d.guardar_mis_datos === true) {   // «Guardar también en Mis datos»
      try { await DB.batch([
        DB.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?').bind(v.nombre, s.usuario.id),
        DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, telefono, fecha_nacimiento, documento_tipo, documento_cifrado, direccion_cifrada, centro, actualizado)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(usuario_id) DO UPDATE SET apellidos=excluded.apellidos, telefono=excluded.telefono, fecha_nacimiento=excluded.fecha_nacimiento,
                  documento_tipo=excluded.documento_tipo, documento_cifrado=excluded.documento_cifrado, direccion_cifrada=excluded.direccion_cifrada,
                  centro=COALESCE(excluded.centro, datos_personales.centro), actualizado=excluded.actualizado`)
          .bind(s.usuario.id, v.apellidos, v.telefono, v.nac, v.tipoDoc, await cifrar(env, 'datos', v.doc || docAntes),
                await cifrar(env, 'datos', v.direccion || dirAntes), v.centro, ahora()) ]); } catch {}
    }
    await enviar(env, 'zlabs-corregida', v.correo, aviso);
    if (v.correo !== fila.correo) await enviar(env, 'zlabs-corregida', fila.correo, aviso);   // aviso también al correo anterior
    await enviar(env, 'zlabs-aviso-cambio', c.avisos, { ...aviso, apellidos: v.apellidos, correo: v.correo, cambio: 'corregida' });
    return json({ ok: true, cambios, mensaje: 'Cambios guardados (' + cambios.join(', ') + '). Te hemos enviado un correo de confirmación.' });
  }
  return json({ error: 'Acción desconocida' }, 400);
}
