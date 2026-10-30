/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · SUSCRIPCIONES · ayudantes del panel · 28-10-2026
   Reglas (César, 28-10-2026):
   · Desde el Panel se puede dar a cualquier usuario un nivel GRATIS, con fecha de inicio y de fin
     (o sin fin) y un motivo: organizador, colaboración, embajador, cortesía…
   · Al llegar la fecha de fin, el acceso caduca solo y la persona vuelve al nivel que tuviera
     (Mi INNAZ toma siempre el nivel más alto vigente).
   · Alta manual de pago mientras no haya Stripe: la marca quien tiene «suscriptores.alta».
   · Número: ya no va en cada suscripción, sino en la PERSONA (número de registro, `_lib/numero.js`, César 28-10-2026).
   ══════════════════════════════════════════════════════════════════════ */

// Niveles que se pueden dar desde el panel. «Estudiante» queda fuera: lo sustituye el 50 % para alumnos (César, 28-10-2026).
export const NIVELES_PANEL = ['simpatizante', 'colaborador', 'protector', 'mecenas'];
export const MOTIVOS = {
  organizador:  'Organizador de INNAZ',
  colaboracion: 'Colaboración (mejoras o materiales)',
  embajador:    'Embajador honorífico',
  cortesia:     'Cortesía',
  otro:         'Otro',
};
// Causa que se le dice a la persona (César, 28-10-2026). Cortesía y Otro, sin causa (la nota es solo interna).
export const CAUSAS = {
  organizador:  'por formar parte del equipo de INNAZ',
  colaboracion: 'por tu colaboración con mejoras o materiales',
  embajador:    'por tu dedicación a nuestro género lírico',
};
export const FORMAS_PAGO = ['transferencia', 'bizum', 'tpv', 'manual', 'otro'];

/** 'AAAA-MM-DD' → segundos, a las 00:00 (o 23:59:59 si finDia) de ese día en Madrid. null si no es una fecha válida. */
export function fechaMadrid(txt, finDia = false) {
  if (typeof txt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(txt)) return null;
  const [a, m, d] = txt.split('-').map(Number);
  const base = Date.UTC(a, m - 1, d, finDia ? 23 : 0, finDia ? 59 : 0, finDia ? 59 : 0);
  if (new Date(base).getUTCDate() !== d) return null;   // 31-02 y similares
  // Desfase de Madrid ese día (+1 en invierno, +2 en verano)
  const parte = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' })
    .formatToParts(new Date(base)).find(p => p.type === 'timeZoneName')?.value || 'GMT+1';
  const h = Number((parte.match(/GMT([+-]\d+)/) || [0, 1])[1]);
  return Math.floor((base - h * 3600 * 1000) / 1000);
}

/** Suma un periodo (mes o año) a una fecha en segundos, por calendario. */
export function sumarPeriodo(seg, periodicidad) {
  const f = new Date(seg * 1000);
  if (periodicidad === 'mensual') f.setUTCMonth(f.getUTCMonth() + 1); else f.setUTCFullYear(f.getUTCFullYear() + 1);
  return Math.floor(f.getTime() / 1000);
}

/** Estado legible de una fila de suscripción en este momento. */
export function situacion(f, t) {
  if (f.estado === 'cancelada') return 'retirada';
  if (f.alta > t) return 'programada';
  if (f.vence != null && f.vence <= t) return 'caducada';
  if (f.estado === 'pendiente_pago') return 'pendiente de pago';
  if (f.estado === 'prueba') return 'prueba gratis';
  return 'vigente';
}
