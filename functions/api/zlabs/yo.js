/* ══════════════════════════════════════════════════════════════════════
   GET /api/zlabs/yo · «Mis ZLabs» en Mi INNAZ (28-10-2026)
   Para la persona que ha entrado (nunca para otra):
   · si la convocatoria está abierta,
   · qué dice su suscripción sobre el descuento (solo informativo; se comprueba al pagar),
   · sus cursos de esta edición: referencia, modalidad, estado VISIBLE, pasos y siguiente paso
     (los activos solo ven el resultado cuando se les comunica: _lib/zlabs.js → estadoVisible),
   · y qué puede hacer ahora («puede»: 'nueva', 'oyente' o null).
   ══════════════════════════════════════════════════════════════════════ */
import { json } from '../../_lib/util.js';
import { leerSesion } from '../../_lib/sesion.js';
import { config, NOMBRE_CUERDA, estadoSuscripcion, estadoVisible, esEditable, textoEstado, pasosCurso } from '../../_lib/zlabs.js';

export async function onRequestGet({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ conectado: false });
  const c = config(env);
  const filas = (await env.DB.prepare(
    `SELECT referencia, modalidad, cuerda, estado, comunicado_estado, papel, creado FROM zlabs_preinscripciones
      WHERE edicion = ? AND (usuario_id = ? OR (usuario_id IS NULL AND correo = ?)) ORDER BY creado DESC`)
    .bind(c.edicion, s.usuario.id, s.usuario.correo).all()).results;
  // Qué puede hacer ahora: una preinscripción por persona; si como activo se le COMUNICÓ reserva o no admitido, también oyente.
  const vivas = filas.filter(f => f.estado !== 'anulada');
  let puede = null;
  if (c.abierta) {
    if (!vivas.length) puede = 'nueva';
    else if (vivas.length === 1 && vivas[0].modalidad === 'activo' && ['reserva', 'no_admitida'].includes(estadoVisible(vivas[0]))) puede = 'oyente';
  }
  return json({ conectado: true, edicion: c.edicion, abierta: c.abierta, inicio: c.inicio, puede,
    suscripcion: await estadoSuscripcion(env, s.usuario.id, c),
    preinscripciones: filas.map(f => {
      const e = estadoVisible(f), { pasos, siguiente } = pasosCurso(f);
      return { referencia: f.referencia, modalidad: f.modalidad, cuerda: f.cuerda ? NOMBRE_CUERDA[f.cuerda] : null,
        estado: e, estado_texto: textoEstado(f), creado: f.creado, pasos, siguiente,
        papel: (f.modalidad === 'activo' && e === 'admitida' && f.papel) ? f.papel : null,
        editable: esEditable(f, c) };
    }) });
}
