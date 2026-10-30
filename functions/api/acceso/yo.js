/* GET /api/acceso/yo → quién soy, mi nivel y mis ventajas (solo lo del suscriptor).
   28-10-2026 (César): Mi INNAZ y la gestión interna van separadas; aquí ya no se devuelven roles ni secciones. */
import { ahora, json, correoVerificado } from '../../_lib/util.js';
import { leerSesion, reauthReciente } from '../../_lib/sesion.js';
import { numeroCompleto } from '../../_lib/numero.js';
import { actualDe, transferencia } from '../../_lib/solicitud.js';
import { MOTIVOS, CAUSAS } from '../../_lib/suscripciones.js';
import { faltanBasicos } from '../../_lib/basicos.js';
import { tieneClave } from '../../_lib/clave.js';

export async function onRequestGet({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ conectado: false });
  const DB = env.DB, t = ahora();

  // Nivel vigente: la suscripción activa o en prueba de mayor rango que no haya vencido.
  // Auditoría 29-10-2026: nivel vigente y solicitud pendiente en un solo lote (antes, dos viajes a la base)
  const [rSus, rPend] = await DB.batch([
    DB.prepare(
    `SELECT s.nivel, s.numero, s.estado, s.vence, s.periodicidad, n.nombre, n.orden, n.ventajas_de
       FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
      WHERE s.usuario_id = ?1 AND s.estado IN ('activa','prueba') AND s.alta <= ?2 AND (s.vence IS NULL OR s.vence > ?2)
      ORDER BY n.orden DESC LIMIT 1`).bind(s.usuario.id, t),   // alta <= ahora: un acceso programado aún no cuenta (28-10-2026)
    DB.prepare(
    `SELECT s.*, n.nombre FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
      WHERE s.usuario_id = ? AND s.estado = 'pendiente_pago' ORDER BY s.alta DESC LIMIT 1`).bind(s.usuario.id),
  ]);
  const sus = rSus.results[0] || null, pf = rPend.results[0] || null;

  const nivelVentajas = sus?.ventajas_de || sus?.nivel || 'registrado';
  const ventajas = (await DB.prepare(
    `SELECT b.codigo, b.grupo, b.texto, nb.detalle, b.estado FROM nivel_beneficios nb
       JOIN beneficios b ON b.codigo = nb.codigo
      WHERE nb.nivel = ? AND b.estado != 'oculto' ORDER BY b.codigo`).bind(nivelVentajas).all()).results;

  // Solicitud de suscripción pendiente de pago (28-10-2026); s.* para que funcione también en una base antigua
  const pend = pf ? { nombre: pf.nombre, periodicidad: pf.periodicidad, importe_cent: pf.importe_cent, alta: pf.alta, mejora_de: pf.mejora_de || null } : null;
  const numero = await numeroCompleto(env, s.usuario.id, t);
  if (pend) pend.transferencia = transferencia(env, numero, pend.importe_cent);   // datos para pagar (28-10-2026)
  // «Mi suscripción» (28-10-2026): la que tiene ahora (de pago, gratuita o en prueba), con sus fechas
  let a = null; try { a = await actualDe(env, s.usuario.id, t); } catch (e) { console.error('actualDe (¿falta /instalar?):', e); }
  const actual = a ? { nivel: a.nivel, nombre: a.nivel_nombre, periodicidad: a.periodicidad, desde: a.alta, hasta: a.vence, estado: a.estado,
    gratuito: !!a.gratuito, motivo: a.gratuito ? (MOTIVOS[a.motivo] || null) : null, causa: a.gratuito ? (CAUSAS[a.motivo] || null) : null, programada: a.alta > t } : null;

  return json({
    conectado: true,
    usuario: s.usuario,
    sesion: { tipo: s.sesion.tipo, expira: s.sesion.expira },
    suscripcion: sus || null,
    correoVerificado: await correoVerificado(env, s.usuario.id),   // 30-10-2026: alta con Face ID
    faltan: await faltanBasicos(env, s.usuario.id),                 // 30-10-2026: datos básicos obligatorios pendientes
    tieneClave: await tieneClave(env, s.usuario.id).catch(() => false),
    reauth: reauthReciente(s),   // auditoría 30-10-2026: ¿puede hacer acciones sensibles sin volver a identificarse?
    tieneLlaves: !!(await DB.prepare('SELECT 1 FROM llaves_acceso WHERE usuario_id = ? LIMIT 1').bind(s.usuario.id).first().catch(() => null)),
    google: (await DB.prepare('SELECT correo FROM cuentas_google WHERE usuario_id = ? ORDER BY creado LIMIT 1').bind(s.usuario.id).first().catch(() => null))?.correo || null,   // 30-10-2026
    numero,   // número de registro con el prefijo de su nivel (César, 28-10-2026)
    actual,
    ventajas,
    pendiente: pend || null,
  });
}
