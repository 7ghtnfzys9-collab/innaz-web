/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · NÚMERO DE REGISTRO · César, 28-10-2026
   · Cada persona registrada tiene UN número para siempre: AA (año de registro, hora de Madrid) + 4 cifras.
     Se guarda en usuarios.numero (p. ej. '260015').
   · El PREFIJO cambia según su nivel vigente en cada momento:
       R  Registrado · G  acceso gratuito · SS Simpatizante · SC Colaborador · SP Protector · SM Mecenas
     → R-260015, que al hacerse Colaborador pasa a SC-260015, con las mismas cifras.
   · Si tiene varias cosas vigentes, manda la de nivel más alto (la misma que ve en Mi INNAZ);
     si esa es un acceso gratuito, el prefijo es G.
   · «Estudiante» (nivel antiguo, con ventajas de Colaborador) usa SC. Prueba gratis y «pendiente de pago»:
     ver el LEEME (prueba → prefijo de su nivel, propuesta pendiente de César; pendiente de pago → no cuenta).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora } from './util.js';

export const PREFIJOS = { registrado: 'R', simpatizante: 'SS', colaborador: 'SC', estudiante: 'SC', protector: 'SP', mecenas: 'SM' };
export const PREFIJO_GRATUITO = 'G';

const anioMadrid = seg => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: '2-digit' }).format(new Date(seg * 1000));

/** Da a la cuenta su número si aún no lo tiene. Devuelve las cifras ('260015'). */
export async function asignarNumero(env, usuarioId, creadoSeg) {
  const DB = env.DB;
  const ya = await DB.prepare('SELECT numero FROM usuarios WHERE id = ?').bind(usuarioId).first();
  if (ya?.numero) return ya.numero;
  const aa = anioMadrid(creadoSeg || ahora());
  for (let intento = 0; intento < 5; intento++) {
    const fila = await DB.prepare(`SELECT MAX(CAST(substr(numero, 3) AS INTEGER)) n FROM usuarios WHERE numero LIKE ? AND length(numero) = 6`)
      .bind(aa + '%').first();
    const n = (fila?.n || 0) + 1;
    if (n > 9999) throw new Error(`No quedan números de registro del año ${aa}`);
    const numero = aa + String(n).padStart(4, '0');
    try {
      const r = await DB.prepare('UPDATE usuarios SET numero = ? WHERE id = ? AND numero IS NULL').bind(numero, usuarioId).run();
      if (r.meta.changes) return numero;
      return (await DB.prepare('SELECT numero FROM usuarios WHERE id = ?').bind(usuarioId).first())?.numero || null;
    } catch (e) { if (!/UNIQUE/i.test(String(e.message || e))) throw e; }   // dos altas a la vez: el siguiente
  }
  throw new Error('No se ha podido asignar el número de registro');
}

/** Prefijo según la fila vigente de más nivel (o null = Registrado). */
export const prefijoDe = vigente => !vigente ? 'R' : vigente.gratuito ? PREFIJO_GRATUITO : (PREFIJOS[vigente.nivel] || 'R');

/** Número completo de una persona ahora mismo: 'SC-260015'. Si la cuenta no tiene cifras (antigua), se le asignan. */
export async function numeroCompleto(env, usuarioId, t = ahora()) {
  try { return await calcular(env, usuarioId, t); }
  catch (e) { console.error('numeroCompleto:', e); return null; }   // p. ej. base sin la columna hasta pulsar /instalar
}
async function calcular(env, usuarioId, t) {
  const u = await env.DB.prepare('SELECT numero, creado FROM usuarios WHERE id = ?').bind(usuarioId).first();
  if (!u) return null;
  const cifras = u.numero || await asignarNumero(env, usuarioId, u.creado);
  const v = await env.DB.prepare(
    `SELECT s.nivel, s.gratuito FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
      WHERE s.usuario_id = ?1 AND s.estado IN ('activa','prueba') AND s.alta <= ?2 AND (s.vence IS NULL OR s.vence > ?2)
      ORDER BY n.orden DESC, s.gratuito ASC LIMIT 1`).bind(usuarioId, t).first();
  return cifras ? `${prefijoDe(v && v.nivel !== 'registrado' ? v : null)}-${cifras}` : null;
}
