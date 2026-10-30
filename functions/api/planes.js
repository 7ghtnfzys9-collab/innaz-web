/* GET /api/planes → precios vigentes para la página de suscripciones (público). 28-10-2026
   Si quien mira ha entrado, añade su suscripción actual y lo que le costaría cada nivel (nueva, sobre gratuito o mejora). */
import { json, ahora } from '../_lib/util.js';
import { leerSesion } from '../_lib/sesion.js';
import { preciosVigentes, NIVELES_WEB, actualDe, pendienteDe, cotizar } from '../_lib/solicitud.js';

export async function onRequestGet({ request, env }) {
  const t = ahora(), precios = await preciosVigentes(env, t);
  const nv = (await env.DB.prepare('SELECT clave, nombre, orden FROM niveles').all()).results;
  const nombres = Object.fromEntries(nv.map(x => [x.clave, x.nombre])), ordenes = Object.fromEntries(nv.map(x => [x.clave, x.orden]));
  // Ventajas destacadas de cada nivel (panel de ventajas, 30-10-2026). Si la base aún no tiene la columna, la página usa sus textos fijos.
  let destacadas = null;
  try { const f = (await env.DB.prepare(`SELECT nb.nivel, b.texto, nb.detalle FROM nivel_beneficios nb JOIN beneficios b ON b.codigo = nb.codigo
      WHERE nb.destacada = 1 AND b.estado <> 'oculto' ORDER BY nb.nivel, nb.codigo`).all()).results;
    destacadas = {}; for (const x of f) (destacadas[x.nivel] ||= []).push(x.texto + (x.detalle ? ' (' + x.detalle + ')' : '')); } catch { destacadas = null; }
  const conVentajas = k => destacadas && destacadas[k] ? { ventajas: destacadas[k] } : {};
  const salida = { planes: NIVELES_WEB.map(k => ({ clave: k, nombre: nombres[k], mensual: precios[k]?.mensual ?? null, anual: precios[k]?.anual ?? null, ...conVentajas(k) })),
                   mecenas: { nombre: nombres.mecenas, minimo: precios.mecenas?.anual ?? null, ...conVentajas('mecenas') } };
  const s = await leerSesion(env, request);
  if (s) {
    const a = await actualDe(env, s.usuario.id, t), p = await pendienteDe(env, s.usuario.id);
    const cotiza = {};
    for (const k of NIVELES_WEB) { cotiza[k] = {};
      for (const per of ['anual', 'mensual']) { const c = await cotizar(env, s.usuario.id, { nivel: k, periodicidad: per, alumno: false }, t, precios, ordenes, a);   // 1 consulta en vez de 8
        cotiza[k][per] = c.error ? { error: c.error } : { tipo: c.tipo, importe: c.importe, aviso: c.aviso || null, dias: c.dias || null }; } }
    salida.yo = { correo: s.usuario.correo,
      actual: a ? { nivel: a.nivel, nombre: a.nivel_nombre, periodicidad: a.periodicidad, vence: a.vence, gratuito: !!a.gratuito, prueba: a.estado === 'prueba', programada: a.alta > t } : null,
      pendiente: p ? { nivel: p.nivel, nombre: p.nivel_nombre } : null, cotiza };
  }
  return json(salida, 200, { 'Cache-Control': 'no-store' });
}
