/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · SOLICITUD DE SUSCRIPCIÓN desde la web · 28-10-2026
   Reglas (César, 28-10-2026):
   · Quien pulsa un nivel en la página de suscripciones se registra (o entra) y su suscripción queda «pendiente de
     pago». Mientras no haya Stripe, se paga por TRANSFERENCIA a la cuenta de INNAZ (variables TRANSFERENCIA_IBAN y
     TRANSFERENCIA_TITULAR) con su número de registro como concepto; INNAZ la marca pagada en la gestión.
   · UNA sola suscripción por persona. Una solicitud pendiente como mucho (la nueva sustituye a la anterior).
   · Con ACCESO GRATUITO (o prueba gratis de lanzamiento): se le avisa antes y tiene que confirmarlo; el gratuito
     sigue hasta que INNAZ reciba el pago y entonces termina.
   · MEJORA a un nivel superior (César, 29-10-2026): si pagó la cuota ANUAL, paga la cuota anual del nivel nuevo menos
     lo que pagó / 12 × meses que le quedan (completos; el último cuenta si quedan 15 días o más). Empieza un año nuevo desde el pago. Con cuota MENSUAL no hay
     descuento: paga la cuota nueva desde el pago. Bajar de nivel: escribir a INNAZ.
   · Alumnos de conservatorios y escuelas asociadas: 50 % con el CÓDIGO DE CENTRO del curso (tabla codigos_centro, César 29-10-2026);
     más adelante se cotejará con el listado de matriculados que facilite cada centro.
   · Mecenas: no se pide aquí, va siempre por contacto (César, 28-10-2026).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, nuevoId, anotar, limpiarTexto, baseURL } from './util.js';
import { enviar } from './correo.js';
import { numeroCompleto } from './numero.js';

export const NIVELES_WEB = ['simpatizante', 'colaborador', 'protector'];
export const euros = c => { const [e, d] = (c / 100).toFixed(2).split('.'); return e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== '00' ? ',' + d : '') + ' €'; };   // 1.000 €, 24,50 €
const fechaTxt = s => s == null ? null : new Date(s * 1000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', year: 'numeric' });
const esAlumno = f => /Alumno/.test(f?.notas || '');

/** Precios vigentes: { nivel: { mensual: cent, anual: cent, libre: bool } } */
export async function preciosVigentes(env, t = ahora()) {
  const filas = (await env.DB.prepare(
    `SELECT nivel, periodicidad, precio_cent, importe_libre FROM precios WHERE desde <= ?1 AND (hasta IS NULL OR hasta > ?1)`).bind(t).all()).results;
  const p = {};
  for (const f of filas) { (p[f.nivel] ||= {})[f.periodicidad] = f.precio_cent; if (f.importe_libre) p[f.nivel].libre = true; }
  return p;
}

/** La suscripción que ocupa a la persona (vigente o programada; de pago, gratuita o en prueba), o null. */
export async function actualDe(env, usuarioId, t = ahora()) {
  return env.DB.prepare(
    `SELECT s.*, n.nombre nivel_nombre, n.orden FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
      WHERE s.usuario_id = ?1 AND s.nivel <> 'registrado' AND s.estado IN ('activa','prueba') AND (s.vence IS NULL OR s.vence > ?2)
      ORDER BY (s.alta <= ?2) DESC, n.orden DESC, s.gratuito ASC LIMIT 1`).bind(usuarioId, t).first();
}
export async function pendienteDe(env, usuarioId) {
  return env.DB.prepare(`SELECT s.*, n.nombre nivel_nombre FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
    WHERE s.usuario_id = ? AND s.estado = 'pendiente_pago' ORDER BY s.alta DESC LIMIT 1`).bind(usuarioId).first();
}

/** Instrucciones de transferencia (null si aún no se ha puesto el IBAN en la configuración). */
export function transferencia(env, numero, importeCent) {
  const iban = (env.TRANSFERENCIA_IBAN || '').trim();
  if (!iban) return null;
  return { iban, titular: (env.TRANSFERENCIA_TITULAR || '').trim() || null, concepto: numero ? `${numero} INNAZ` : 'Suscripción INNAZ',
           importe: importeCent != null ? euros(importeCent) : null };
}

/** Comprueba lo que manda la página. Devuelve { plan } o { error }. */
export function validarPlan(d) {
  if (!d || typeof d !== 'object') return { error: 'Elige un nivel de suscripción.' };
  if (d.nivel === 'mecenas') return { error: 'Para hacerte mecenas, escríbenos desde el formulario de contacto.' };
  if (!NIVELES_WEB.includes(d.nivel)) return { error: 'Elige un nivel de suscripción.' };
  if (!['mensual', 'anual'].includes(d.periodicidad)) return { error: 'Elige pago mensual o anual.' };
  const alumno = d.alumno === true;
  const codigo = alumno ? String(d.codigoCentro || '').trim().toUpperCase().replace(/\s+/g, '') : '';
  if (alumno && !/^[A-Z0-9-]{3,20}$/.test(codigo)) return { error: 'Escribe el código de tu centro (te lo da tu conservatorio o escuela).' };
  return { plan: { nivel: d.nivel, periodicidad: d.periodicidad, alumno, codigoCentro: codigo, centro: '' } };
}

/** Qué supondría pedir ese plan: { tipo: 'nueva'|'sobre_gratuito'|'mejora', importe, actual, aviso? } o { error }. */
export async function cotizar(env, usuarioId, plan, t = ahora(), precios = null, niveles = null, actual = undefined) {
  precios ||= await preciosVigentes(env, t);
  const ordenes = niveles || Object.fromEntries((await env.DB.prepare('SELECT clave, orden FROM niveles').all()).results.map(x => [x.clave, x.orden]));
  const base = precios[plan.nivel]?.[plan.periodicidad];
  if (base == null) return { error: 'Ese nivel no está disponible ahora mismo.' };
  const a = actual !== undefined ? actual : await actualDe(env, usuarioId, t);   // auditoría 29-10-2026: /api/planes la pasa ya leída
  if (!a) return { tipo: 'nueva', importe: plan.alumno ? Math.round(base / 2) : base };
  if (a.gratuito || a.estado === 'prueba') {
    const que = a.gratuito ? 'un acceso gratuito' : 'la prueba gratis del lanzamiento';
    return { tipo: 'sobre_gratuito', actual: a, importe: plan.alumno ? Math.round(base / 2) : base,
      aviso: `Ahora tienes ${que} de ${a.nivel_nombre}${a.vence ? ' hasta el ' + fechaTxt(a.vence) : ''}. Si pides esta suscripción, ` +
             `lo seguirás teniendo hasta que INNAZ reciba tu pago; en ese momento terminará y empezará la suscripción de pago.` };
  }
  // De pago vigente: mejora a un nivel superior (César, 29-10-2026)
  if ((ordenes[plan.nivel] ?? 0) <= a.orden) return { error: `Ya tienes una suscripción ${a.nivel_nombre}. Para cambiar a un nivel igual o inferior, escríbenos.`, actual: a };
  if (a.alta > t || !a.vence) return { error: 'Tu suscripción actual no se puede mejorar desde aquí. Escríbenos.', actual: a };
  const cuota = esAlumno(a) ? Math.round(base / 2) : base;   // quien era alumno sigue con el 50 %
  if (a.periodicidad === 'anual' && a.importe_cent > 0) {
    if (plan.periodicidad !== 'anual') return { error: 'Tu suscripción es anual: la mejora también es anual.', actual: a };
    // Meses que le quedan: los completos, y el último cuenta entero si le quedan 15 días o más (César, 29-10-2026)
    let meses = 0; while (meses < 12) { const f = new Date(t * 1000); f.setUTCMonth(f.getUTCMonth() + meses + 1); if (f.getTime() / 1000 > a.vence) break; meses++; }
    { const f = new Date(t * 1000); f.setUTCMonth(f.getUTCMonth() + meses); const resto = (a.vence - f.getTime() / 1000) / 86400; if (resto >= 15 && meses < 12) meses++; }
    const credito = Math.round(a.importe_cent / 12 * meses);
    return { tipo: 'mejora', actual: a, importe: Math.max(0, cuota - credito), cuota, credito, meses, pagado: a.importe_cent, alumno: esAlumno(a) };
  }
  return { tipo: 'mejora', actual: a, importe: cuota, cuota, credito: 0, meses: 0, pagado: null, alumno: esAlumno(a) };   // mensual: sin descuento
}

/** Crea (o sustituye) la solicitud pendiente de pago. Devuelve { ok, mensaje } | { aviso, mensaje } (falta confirmar) | { error }. */
/** Código de centro vigente (César, 29-10-2026) o null. */
export async function codigoCentro(env, codigo, t = ahora()) {
  if (!codigo) return null;
  return env.DB.prepare(`SELECT * FROM codigos_centro WHERE codigo = ? AND activo = 1 AND hasta > ?`).bind(codigo, t).first();
}

export async function crearSolicitud(env, request, usuarioId, plan, confirmar = false) {
  const DB = env.DB, t = ahora();
  if (plan.alumno) {
    const cc = await codigoCentro(env, plan.codigoCentro, t);
    if (!cc) return { error: 'Ese código de centro no es válido o ya ha caducado. Pídeselo a tu conservatorio o escuela.' };
    plan = { ...plan, centro: cc.centro, curso: cc.curso };
  }
  const c = await cotizar(env, usuarioId, plan, t);
  if (c.error) return { error: c.error };
  if (c.aviso && !confirmar) return { aviso: true, mensaje: c.aviso };
  const niveles = Object.fromEntries((await DB.prepare('SELECT clave, nombre FROM niveles').all()).results.map(x => [x.clave, x.nombre]));
  const alumno = c.tipo === 'mejora' ? c.alumno : plan.alumno;
  const notas = ['Solicitada en la web',
    c.tipo === 'mejora' ? `Mejora desde ${c.actual.nivel_nombre}: cuota ${euros(c.cuota)}` + (c.credito ? ` − ${euros(c.credito)} (pagó ${euros(c.pagado)} / 12 × ${c.meses} meses que le quedaban)` : ' (mensual: sin descuento)') + '; empieza un periodo nuevo al pagar' : null,
    c.tipo === 'sobre_gratuito' ? `Tiene ${c.actual.gratuito ? 'acceso gratuito' : 'prueba gratis'} de ${c.actual.nivel_nombre}: termina al pagar (aceptado)` : null,
    plan.alumno && c.tipo !== 'mejora' ? `Alumno (50 %): código ${plan.codigoCentro} · ${plan.centro} · curso ${plan.curso} (pendiente de cotejar con el listado del centro)` : null].filter(Boolean).join(' · ');
  const anterior = await DB.prepare(`SELECT id FROM suscripciones WHERE usuario_id = ? AND estado = 'pendiente_pago'`).bind(usuarioId).all();
  const id = nuevoId();
  await DB.batch([
    DB.prepare(`UPDATE suscripciones SET estado = 'cancelada', vence = ?1, notas = trim(coalesce(notas,'') || ' · Sustituida por otra solicitud')
                 WHERE usuario_id = ?2 AND estado = 'pendiente_pago'`).bind(t, usuarioId),
    DB.prepare(`INSERT INTO suscripciones (id, usuario_id, nivel, periodicidad, alta, vence, estado, renovacion_auto, importe_cent, notas, gratuito, mejora_de)
                VALUES (?,?,?,?,?,NULL,'pendiente_pago',0,?,?,0,?)`)
      .bind(id, usuarioId, plan.nivel, plan.periodicidad, t, c.importe, notas, c.tipo === 'mejora' ? c.actual.id : null),
  ]);
  await anotar(env, usuarioId, 'suscripcion.solicitar', usuarioId, { id, ...plan, tipo: c.tipo, importe: c.importe, sustituye: anterior.results.length });
  const u = await DB.prepare('SELECT correo, nombre FROM usuarios WHERE id = ?').bind(usuarioId).first();
  const numero = await numeroCompleto(env, usuarioId);
  const datos = { nombre: u.nombre, correo: u.correo, nivel: niveles[plan.nivel], periodicidad: plan.periodicidad, importe: euros(c.importe),
                  alumno, centro: plan.centro, numero, enlace: baseURL(request, env) + '/mi-innaz', transferencia: transferencia(env, numero, c.importe),
                  mejora: c.tipo === 'mejora' ? { desde: c.actual.nivel_nombre, cuota: euros(c.cuota), credito: c.credito ? euros(c.credito) : null, meses: c.meses } : null,
                  gratuito: c.tipo === 'sobre_gratuito' ? c.actual.nivel_nombre : null };
  await enviar(env, 'solicitud-suscripcion', u.correo, datos).catch(() => {});
  await enviar(env, 'aviso-solicitud', env.AVISOS_SUSCRIPCIONES || 'info@innaz.es', datos).catch(() => {});
  const que = c.tipo === 'mejora' ? `Mejora a ${niveles[plan.nivel]} (pagas ${euros(c.importe)}${c.credito ? `: cuota ${euros(c.cuota)} menos ${euros(c.credito)} por los ${c.meses} meses que te quedan` : ''}; empieza un periodo nuevo cuando INNAZ reciba el pago)`
                                  : `Solicitud de ${niveles[plan.nivel]} (${plan.periodicidad === 'anual' ? 'anual' : 'mensual'}, ${euros(c.importe)})`;
  return { ok: true, id, mensaje: `${que} recibida. ${datos.transferencia ? 'Tienes los datos para la transferencia en Mi INNAZ y en tu correo.' : 'Te escribiremos con las instrucciones de pago.'}` };
}
