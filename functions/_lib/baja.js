/* ══════════════════════════════════════════════════════════════════════
   ELIMINAR UNA CUENTA · 31-10-2026 (decisiones de César)
   La usan Mi INNAZ («Eliminar mi cuenta») y la gestión (Suscripciones → ficha → «Eliminar cuenta»).
   · Se borra al momento, tras confirmar. Llega un correo de aviso a la persona.
   · Se BORRAN: nombre, correo, país, datos de «Mis datos» (documento, dirección, teléfono…), contraseña, llaves,
     cuenta de Google vinculada, sesiones, enlaces pendientes, preinscripciones de ZLabs, solicitudes y suscripciones
     pendientes de pago. Las suscripciones en curso terminan hoy (la persona pierde el tiempo que le queda; los
     reembolsos, si los hay, los decide INNAZ a mano: la gestión recibe un aviso).
   · Se BLOQUEA lo obligatorio: si la persona pagó alguna vez, sus datos de facturación (nombre, apellidos, correo,
     documento y dirección) se guardan CIFRADOS en `bajas_bloqueadas`, fuera de la vista de la gestión, solo para
     atender obligaciones legales, y se borran en `conservar_hasta`. Base: art. 32 LOPDGDD (bloqueo).
     ⚠ El plazo (BLOQUEO_ANIOS, 6 años por defecto) es PROVISIONAL: lo confirma el asesor fiscal.
   · Se conservan sin datos personales: las suscripciones de pago (importe, fechas), las aceptaciones (versión y
     fecha) y el registro de actividad, ligados al identificador ya anónimo de la cuenta.
   · No se puede eliminar una cuenta que tenga roles en la gestión: antes hay que quitárselos.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, anotar } from './util.js';
import { cifrar } from './cifrado.js';
import { perfilesDe } from './gestion.js';
import { enviar } from './correo.js';
import { numeroCompleto } from './numero.js';

export const CONFIRMACION = 'ELIMINAR';
const ANIO = 365 * 24 * 3600;

/** Lo que perdería la persona (para avisar antes): suscripción en curso y preinscripciones de ZLabs vivas. */
export async function resumenBaja(env, uid, t = ahora()) {
  const DB = env.DB;
  const sus = await DB.prepare(`SELECT s.nivel, s.vence, s.gratuito, s.estado, n.nombre FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
    WHERE s.usuario_id = ? AND s.nivel <> 'registrado' AND s.estado IN ('activa','prueba') AND (s.vence IS NULL OR s.vence > ?)
    ORDER BY s.vence DESC LIMIT 1`).bind(uid, t).first();
  let zlabs = [];
  try { zlabs = (await DB.prepare(`SELECT referencia, modalidad, estado FROM zlabs_preinscripciones WHERE usuario_id = ? AND estado <> 'anulada'`).bind(uid).all()).results; } catch {}
  const roles = await perfilesDe(env, uid);
  const s = sus ? { nombre: sus.nombre, hasta: sus.vence, tipo: sus.gratuito ? 'gratuita' : sus.estado === 'prueba' ? 'prueba' : 'pago' } : null;
  return {
    bloqueada: s?.tipo === 'pago' ? avisoPagado(s) : null,   // César, 31-10-2026: no se elimina desde Mi INNAZ con un periodo pagado en curso
    suscripcion: s,
    zlabs: zlabs.map(z => ({ referencia: z.referencia, modalidad: z.modalidad, estado: z.estado })),
    roles: roles.map(r => r.nombre),
  };
}

const fechaES = s => new Date(s * 1000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric' });
export const avisoPagado = sus => `Tu suscripción ${sus.nombre} está pagada${sus.hasta ? ' hasta el ' + fechaES(sus.hasta) : ''}. No puedes eliminar tu cuenta hasta que termine ese periodo; `
  + `${sus.hasta ? 'a partir de esa fecha' : 'cuando termine'} podrás hacerlo desde aquí. Si necesitas que borremos tus datos antes, escríbenos a info@innaz.es.`;

/** Elimina la cuenta. por: { tipo: 'persona'|'gestion', id, correo? }. Devuelve { ok } o { error, status }. */
export async function eliminarCuenta(env, request, uid, por) {
  const DB = env.DB, t = ahora();
  const u = await DB.prepare('SELECT * FROM usuarios WHERE id = ?').bind(uid).first();
  if (!u || u.estado === 'baja') return { error: 'Esa cuenta no existe o ya está eliminada.', status: 404 };
  const roles = await perfilesDe(env, uid);
  if (roles.length) return { error: por.tipo === 'persona'
      ? `Tu cuenta tiene roles en la gestión de INNAZ (${roles.map(r => r.nombre).join(', ')}). Antes de eliminarla, pide a un Administrador que te los quite.`
      : `Esta persona tiene roles en la gestión (${roles.map(r => r.nombre).join(', ')}). Quítaselos antes en «Personas».`, status: 409 };

  const resumen = await resumenBaja(env, uid, t);
  // César, 31-10-2026: con un periodo PAGADO en curso, la persona no puede eliminar su cuenta desde Mi INNAZ hasta que termine.
  // La gestión sí puede (p. ej. si lo pide por escrito ejerciendo el derecho de supresión, art. 17 RGPD).
  if (por.tipo === 'persona' && resumen.suscripcion?.tipo === 'pago') return { error: avisoPagado(resumen.suscripcion), status: 409, pagado: true };
  const numero = await numeroCompleto(env, uid, t).catch(() => u.numero);
  const pagos = (await DB.prepare(`SELECT COUNT(*) n FROM suscripciones WHERE usuario_id = ? AND gratuito = 0 AND estado <> 'pendiente_pago' AND COALESCE(importe_cent, 0) > 0`).bind(uid).first()).n;
  const datos = await DB.prepare('SELECT * FROM datos_personales WHERE usuario_id = ?').bind(uid).first();

  // 1) Bloqueo de los datos de facturación (solo si hubo pagos). De paso, se borran los bloqueos que ya cumplieron su plazo.
  const sentencias = [DB.prepare('DELETE FROM bajas_bloqueadas WHERE conservar_hasta < ?').bind(t)];
  if (pagos > 0) {
    const anios = Math.max(1, Number(env.BLOQUEO_ANIOS) || 6);
    const paquete = JSON.stringify({ correo: u.correo, nombre: u.nombre, apellidos: datos?.apellidos || null, pais: u.pais_declarado || null,
      documento_tipo: datos?.documento_tipo || null, documento_cifrado: datos?.documento_cifrado || null, direccion_cifrada: datos?.direccion_cifrada || null, numero });
    sentencias.push(DB.prepare(`INSERT INTO bajas_bloqueadas (usuario_id, fecha_baja, conservar_hasta, motivo, datos_cifrados) VALUES (?,?,?,?,?)
      ON CONFLICT(usuario_id) DO UPDATE SET fecha_baja = excluded.fecha_baja, conservar_hasta = excluded.conservar_hasta, datos_cifrados = excluded.datos_cifrados`)
      .bind(uid, t, t + anios * ANIO, 'pagos de suscripción', await cifrar(env, 'bloqueo', paquete)));
  }
  // 2) Suscripciones: las pendientes de pago se borran; las vigentes terminan hoy
  sentencias.push(
    DB.prepare(`DELETE FROM suscripciones WHERE usuario_id = ? AND estado = 'pendiente_pago'`).bind(uid),
    DB.prepare(`UPDATE suscripciones SET estado = 'cancelada', vence = ?2, renovacion_auto = 0, cancelar_al_vencer = 0,
      notas = trim(coalesce(notas, '') || ' · Cuenta eliminada')
      WHERE usuario_id = ?1 AND nivel <> 'registrado' AND estado IN ('activa','prueba') AND (vence IS NULL OR vence > ?2)`).bind(uid, t),
  );
  // 3) Todo lo personal fuera
  const borrar = [
    ['DELETE FROM sesiones WHERE usuario_id = ?', uid], ['DELETE FROM claves WHERE usuario_id = ?', uid], ['DELETE FROM claves_enlaces WHERE usuario_id = ?', uid],
    ['DELETE FROM llaves_acceso WHERE usuario_id = ?', uid], ['DELETE FROM llaves_retos WHERE usuario_id = ?', uid], ['DELETE FROM cuentas_google WHERE usuario_id = ?', uid],
    ['DELETE FROM segundo_factor WHERE usuario_id = ?', uid], ['DELETE FROM datos_personales WHERE usuario_id = ?', uid],
    ['DELETE FROM enlaces_acceso WHERE correo = ?', u.correo], ['DELETE FROM correos_salida WHERE destinatario = ?', u.correo],
    ['DELETE FROM contactos_proveedor WHERE usuario_id = ?', uid], ['DELETE FROM solicitudes WHERE usuario_id = ?', uid],
    ['DELETE FROM zlabs_preinscripciones WHERE usuario_id = ?', uid],
    ['UPDATE colaboraciones SET correo = NULL, nombre = NULL WHERE usuario_id = ?', uid],
  ];
  for (const [sql, v] of borrar) sentencias.push(DB.prepare(sql).bind(v));
  // Auditoría 30-10-2026 (decisión D): el correo y el nombre dejan de figurar en el registro de actividad y en los avisos internos
  // ya enviados; se sustituyen por el identificador anónimo. Los apuntes (quién hizo qué y cuándo) se conservan.
  const anon = `baja-${uid}`;
  sentencias.push(DB.prepare(`UPDATE registro SET detalle = replace(detalle, ?1, ?2) WHERE detalle LIKE '%' || ?1 || '%'`).bind(u.correo, anon));
  sentencias.push(DB.prepare(`UPDATE correos_salida SET datos = replace(datos, ?1, ?2) WHERE datos LIKE '%' || ?1 || '%'`).bind(u.correo, anon));
  if (u.nombre && u.nombre.length >= 3) {
    sentencias.push(DB.prepare(`UPDATE registro SET detalle = replace(detalle, ?1, ?2) WHERE (usuario_id = ?3 OR objeto = ?3) AND detalle LIKE '%' || ?1 || '%'`).bind(u.nombre, '—', uid));
    sentencias.push(DB.prepare(`UPDATE correos_salida SET datos = replace(datos, ?1, ?2) WHERE datos LIKE '%' || ?3 || '%' AND datos LIKE '%' || ?1 || '%'`).bind(u.nombre, '—', anon));
  }
  // 4) La fila de la cuenta queda sin datos personales (el identificador sigue ligando pagos y registro, ya anónimos).
  //    El correo se libera: la persona puede volver a registrarse con él.
  sentencias.push(DB.prepare(`UPDATE usuarios SET correo = ?, nombre = NULL, pais_declarado = NULL, pais_tarjeta = NULL, stripe_cliente = NULL,
      boletin = 0, boletin_fecha = NULL, boletin_origen = NULL, correo_verificado = 0, estado = 'baja', ultimo_acceso = ? WHERE id = ?`)
    .bind(`baja-${uid}@innaz.invalid`, t, uid));
  await DB.batch(sentencias);

  try { await anotar(env, por.tipo === 'gestion' ? por.id : null, 'cuenta.eliminar', uid,
    { por: por.tipo, numero, pagos: pagos > 0, suscripcionCortada: resumen.suscripcion?.tipo || null, zlabs: resumen.zlabs.map(z => z.referencia) }); } catch (e) { console.error('registro:', e); }
  // Avisos: a la persona (a su correo de siempre) y, si perdía algo, a la gestión
  await enviar(env, 'cuenta-eliminada', u.correo, { nombre: u.nombre, por: por.tipo }).catch(() => {});
  const avisos = (env.AVISOS_SUSCRIPCIONES || '').split(',').map(x => x.trim()).filter(Boolean);
  if (avisos.length && (resumen.suscripcion?.tipo === 'pago' || resumen.zlabs.length || pagos > 0))
    for (const a of avisos) await enviar(env, 'aviso-baja-cuenta', a, { correo: anon /* sin el correo real: no debe quedar en ningún aviso */, numero, por: por.tipo, suscripcion: resumen.suscripcion, zlabs: resumen.zlabs, pagos: pagos > 0 }).catch(() => {});
  return { ok: true, numero };
}
