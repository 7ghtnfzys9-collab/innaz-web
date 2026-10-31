/* GET /api/acceso/estado → lo mínimo que necesitan las páginas PÚBLICAS de innaz.es (auditoría de la unión, 30-10-2026):
   { conectado, nombre, ventajas: ['A1','A2',…] }. Nada más: ni correo, ni sesión, ni suscripción, ni llaves.
   Lo usa innaz-sesion.js (menú «Entrar / Mi INNAZ» y bloqueo de ventajas en el navegador). La ficha completa sigue en /yo,
   solo para las páginas de Mi INNAZ. */
import { ahora, json } from '../../_lib/util.js';
import { leerSesion } from '../../_lib/sesion.js';

export async function onRequestGet({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ conectado: false });
  const DB = env.DB, t = ahora();
  const sus = await DB.prepare(
    `SELECT s.nivel, n.ventajas_de FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
      WHERE s.usuario_id = ?1 AND s.estado IN ('activa','prueba') AND s.alta <= ?2 AND (s.vence IS NULL OR s.vence > ?2)
      ORDER BY n.orden DESC LIMIT 1`).bind(s.usuario.id, t).first();
  const nivel = sus?.ventajas_de || sus?.nivel || 'registrado';
  const ventajas = (await DB.prepare(
    `SELECT nb.codigo FROM nivel_beneficios nb JOIN beneficios b ON b.codigo = nb.codigo
      WHERE nb.nivel = ? AND b.estado = 'activo' ORDER BY nb.codigo`).bind(nivel).all()).results.map(x => x.codigo);
  const nombre = String(s.usuario.nombre || '').trim().split(/\s+/)[0] || '';   // solo el nombre de pila
  return json({ conectado: true, nombre, ventajas });
}
