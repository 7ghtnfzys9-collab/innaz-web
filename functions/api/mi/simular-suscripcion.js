/* ══════════════════════════════════════════════════════════════════════
   POST /api/mi/simular-suscripcion · SOLO WEB DE PRUEBAS (28-10-2026)
   Para probar el descuento de ZLabs sin pagos reales: da a la propia cuenta una suscripción simulada.
   { tipo: 'anual' | 'prueba' | 'mensual' | 'quitar' }
   · Las simuladas llevan origen 'manual', nota «SIMULADA (pruebas)» y número S-9xxxx.
   · En la web real (MODO distinto de 'pruebas') no hace nada.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, nuevoId } from '../../_lib/util.js';
import { leerSesion } from '../../_lib/sesion.js';

const NOTA = 'SIMULADA (pruebas)';

export async function onRequestPost({ request, env }) {
  if (env.MODO !== 'pruebas') return json({ error: 'Solo en la web de pruebas' }, 403);
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  let d; try { d = await request.json(); } catch { d = null; }
  const tipo = d && d.tipo;
  if (!['anual', 'prueba', 'mensual', 'quitar'].includes(tipo)) return json({ error: 'Tipo desconocido' }, 400);
  const DB = env.DB, t = ahora(), uid = s.usuario.id;
  await DB.prepare("DELETE FROM suscripciones WHERE usuario_id = ? AND notas = ?").bind(uid, NOTA).run();
  if (tipo === 'quitar') return json({ ok: true, mensaje: 'Suscripción simulada quitada.' });
  const un = 365 * 24 * 3600, mes = 30 * 24 * 3600;
  const numero = 'S-9' + String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0');
  const fila = tipo === 'anual'   ? { periodicidad: 'anual',   estado: 'activa', vence: t + un, prueba: null }
             : tipo === 'mensual' ? { periodicidad: 'mensual', estado: 'activa', vence: t + mes, prueba: null }
             :                      { periodicidad: 'anual',   estado: 'prueba', vence: t + 90 * 24 * 3600, prueba: t + 90 * 24 * 3600 };
  await DB.prepare(`INSERT INTO suscripciones (id, usuario_id, nivel, numero, periodicidad, alta, vence, estado, prueba_hasta, origen_pago, notas)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(nuevoId(), uid, 'simpatizante', numero, fila.periodicidad, t, fila.vence, fila.estado, fila.prueba, 'manual', NOTA).run();
  return json({ ok: true, mensaje: `Suscripción simulada: Simpatizante ${tipo === 'prueba' ? 'en prueba gratis' : tipo} (${numero}).` });
}
