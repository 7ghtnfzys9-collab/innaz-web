/* ══════════════════════════════════════════════════════════════════════
   Gestión · ACCESO CON CORREO Y CONTRASEÑA · 30-10-2026 (decisión de César: sin segundo factor)
   GET  /api/gestion/acceso → { gestion, gestionHasta, usuario?, perfiles? }
   POST /api/gestion/acceso { accion, … }
     'entrar'     {correo, clave}           → sesión de gestión (dura DURACION_GESTION_HORAS)
     'olvido'     {correo}                  → enlace para crear otra contraseña (respuesta siempre igual)
     'ver_enlace' {ficha}                   → ¿vale el enlace? (para pintar el formulario)
     'crear'      {ficha, clave}            → pone la contraseña (alta, olvido o restablecida) y entra
     'cambiar'    {actual, nueva}           → cambia la propia contraseña (con sesión de gestión)
   Esta ruta se abre aunque no se haya entrado (la deja pasar el filtro común).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, anotar, limpiarCorreo, huellaIP, baseURL } from '../../_lib/util.js';
import { leerSesion, crearSesion, cerrarSesion, duracionGestion } from '../../_lib/sesion.js';
import { perfilesDe } from '../../_lib/gestion.js';
import { enviar } from '../../_lib/correo.js';
import { altaPermitida } from '../../_lib/cuenta.js';
import { huellaClave, claveCorrecta, claveNoValida, nuevoEnlaceClave, gastarEnlaceClave, enlaceClaveVigente } from '../../_lib/clave.js';

async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }
const ERROR_ENTRAR = 'Correo o contraseña incorrectos.';
const limites = env => ({ max: Math.max(1, Number(env.LIMITE_FALLOS_CODIGO) || 5), ventana: Math.max(1, Number(env.MINUTOS_FALLOS_CODIGO) || 15) * 60 });
const simulado = (env, r, enlace) => r && r.simulado && env.MODO === 'pruebas' ? { enlace_simulado: enlace } : {};

/** Guarda la contraseña nueva, cierra las demás sesiones de la persona y avisa por correo. */
async function ponerClave(env, request, u, clave, motivo) {
  const h = await huellaClave(env, clave), t = ahora();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO claves (usuario_id, hash, sal, vueltas, creada, actualizada) VALUES (?,?,?,?,?,?)
                    ON CONFLICT(usuario_id) DO UPDATE SET hash = excluded.hash, sal = excluded.sal, vueltas = excluded.vueltas, actualizada = excluded.actualizada`)
      .bind(u.id, h.hash, h.sal, h.vueltas, t, t),
    env.DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(u.id),   // fuera de todos los navegadores (por si alguien la conocía)
    env.DB.prepare('DELETE FROM claves_enlaces WHERE usuario_id = ?').bind(u.id),   // auditoría 30-10-2026: enlaces de olvido pendientes dejan de valer
  ]);
  await anotarSeguro(env, u.id, 'clave.poner', u.id, { motivo });
  await enviar(env, 'aviso-clave', u.correo, { nombre: u.nombre, enlace: baseURL(request, env) + '/gestion' }).catch(() => {});
}

export async function onRequestGet({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ gestion: false });
  return json({ gestion: s.sesion.tipo === 'gestion', gestionHasta: s.sesion.gestionHasta, usuario: { correo: s.usuario.correo, nombre: s.usuario.nombre },
                perfiles: s.sesion.tipo === 'gestion' ? await perfilesDe(env, s.usuario.id) : [] });
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos.' }, 400);
  const DB = env.DB, t = ahora();
  try {
    if (d.accion === 'entrar') {
      const correo = limpiarCorreo(d.correo), ip = await huellaIP(request, env), { max, ventana } = limites(env);
      const u = correo ? await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE correo = ?').bind(correo).first() : null;
      // Freno: fallos recientes de esa persona y de esa conexión (se cuentan ANTES de comprobar)
      const fallos = await DB.prepare(`SELECT
          (SELECT COUNT(*) FROM registro WHERE accion = 'clave.fallo' AND usuario_id = ?1 AND objeto = ?2 AND fecha > ?3) parPersonaIp,
          (SELECT COUNT(*) FROM registro WHERE accion = 'clave.fallo' AND usuario_id = ?1 AND fecha > ?3) persona,
          (SELECT COUNT(*) FROM registro WHERE accion = 'clave.fallo' AND objeto = ?2 AND fecha > ?3) conexion`).bind(u?.id || '-', ip, t - ventana).first();
      // Auditoría 30-10-2026 (decisión C): el tope normal es por persona Y conexión; el global por persona es alto (×10), para que
      // un tercero que conozca el correo no pueda dejar fuera a su dueño; el de la conexión frena el rastreo de muchos correos.
      if (fallos.parPersonaIp >= max || fallos.persona >= max * 10 || fallos.conexion >= max * 4)
        return json({ error: `¡Demasiados intentos fallidos! Por seguridad, espera ${Math.round(ventana / 60)} minutos o pide un enlace con «He olvidado mi contraseña».` }, 429);
      const fila = u ? await DB.prepare('SELECT hash, sal, vueltas FROM claves WHERE usuario_id = ?').bind(u.id).first() : null;
      const bien = await claveCorrecta(env, d.clave, fila);   // trabaja igual aunque no exista la cuenta
      if (!bien || !u || u.estado !== 'activo') {
        await anotarSeguro(env, u?.id || null, 'clave.fallo', ip, null);
        return json({ error: ERROR_ENTRAR }, 400);
      }
      const perfiles = await perfilesDe(env, u.id);
      if (!perfiles.length) return json({ error: 'Tu cuenta ya no tiene ningún rol en la gestión. Si crees que es un error, habla con un Administrador.' }, 403);
      await cerrarSesion(env, request);   // la sesión que hubiera en este navegador se sustituye
      const cookie = await crearSesion(env, u.id, 'gestion', request, t + duracionGestion(env));
      await DB.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').bind(t, u.id).run();
      await anotarSeguro(env, u.id, 'gestion.entrar', ip, null);
      return json({ ok: true }, 200, { 'Set-Cookie': cookie });
    }

    if (d.accion === 'olvido') {
      const correo = limpiarCorreo(d.correo);
      const comun = { ok: true, mensaje: 'Si ese correo es de una persona de la gestión, te llegará un enlace para crear una contraseña nueva. Vale durante 48 horas.' };
      if (!correo) return json({ error: 'Escribe un correo válido.' }, 400);
      if (!(await altaPermitida(env, request, 'clave.olvido.ip', 10))) return json(comun);   // auditoría 30-10-2026: freno por conexión
      const u = await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE correo = ?').bind(correo).first();
      if (!u || u.estado !== 'activo' || !(await perfilesDe(env, u.id)).length) return json(comun);
      const recientes = (await DB.prepare(`SELECT COUNT(*) n FROM registro WHERE accion = 'clave.olvido' AND usuario_id = ? AND fecha > ?`).bind(u.id, t - 900).first()).n;
      if (recientes >= 3) return json(comun);   // freno silencioso: 3 cada 15 minutos
      const ficha = await nuevoEnlaceClave(env, u.id, 'olvido'), enlace = `${baseURL(request, env)}/gestion#clave=${ficha}`;
      await anotarSeguro(env, u.id, 'clave.olvido', u.id, null);
      const r = await enviar(env, 'clave-enlace', u.correo, { nombre: u.nombre, motivo: 'olvido', enlace }).catch(() => null);
      return json({ ...comun, ...simulado(env, r, enlace) });
    }

    if (d.accion === 'ver_enlace') {
      const e = await enlaceClaveVigente(env, d.ficha);
      if (!e) return json({ error: 'Este enlace no es válido, ya se usó o ha caducado. Pide otro con «He olvidado mi contraseña».' }, 404);
      return json({ ok: true, correo: e.correo, nombre: e.nombre, motivo: e.motivo });
    }

    if (d.accion === 'crear') {
      const e = await enlaceClaveVigente(env, d.ficha);
      if (!e) return json({ error: 'Este enlace no es válido, ya se usó o ha caducado. Pide otro con «He olvidado mi contraseña».' }, 404);
      const mal = claveNoValida(d.clave, e.correo); if (mal) return json({ error: mal, campo: 'clave' }, 400);
      const g = await gastarEnlaceClave(env, d.ficha);   // ahora sí se gasta (una sola vez)
      if (!g) return json({ error: 'Este enlace ya se ha usado.' }, 409);
      const u = await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE id = ?').bind(g.usuario_id).first();
      if (!u || u.estado !== 'activo') return json({ error: 'La cuenta no está activa.' }, 403);
      await ponerClave(env, request, u, d.clave, g.motivo);
      if (!(await perfilesDe(env, u.id)).length) return json({ ok: true, mensaje: 'Contraseña guardada, pero tu cuenta ya no tiene ningún rol en la gestión.' });
      const cookie = await crearSesion(env, u.id, 'gestion', request, t + duracionGestion(env));
      await anotarSeguro(env, u.id, 'gestion.entrar', await huellaIP(request, env), { tras: 'crear contraseña' });
      return json({ ok: true, mensaje: 'Contraseña guardada. Ya estás dentro.' }, 200, { 'Set-Cookie': cookie });
    }

    if (d.accion === 'cambiar') {
      const s = await leerSesion(env, request);
      if (!s || s.sesion.tipo !== 'gestion') return json({ error: 'Tu sesión de gestión ha caducado: vuelve a entrar.', entrar: true }, 401);
      const fila = await DB.prepare('SELECT hash, sal, vueltas FROM claves WHERE usuario_id = ?').bind(s.usuario.id).first();
      if (!(await claveCorrecta(env, d.actual, fila))) { await anotarSeguro(env, s.usuario.id, 'clave.fallo', await huellaIP(request, env), { al: 'cambiar' });
        return json({ error: 'La contraseña actual no es correcta.', campo: 'actual' }, 400); }
      const mal = claveNoValida(d.nueva, s.usuario.correo); if (mal) return json({ error: mal, campo: 'nueva' }, 400);
      if (d.nueva === d.actual) return json({ error: 'La nueva tiene que ser distinta de la actual.', campo: 'nueva' }, 400);
      await ponerClave(env, request, { id: s.usuario.id, correo: s.usuario.correo, nombre: s.usuario.nombre }, d.nueva, 'cambio');
      const cookie = await crearSesion(env, s.usuario.id, 'gestion', request, t + duracionGestion(env));   // sigue dentro en este navegador
      return json({ ok: true, mensaje: 'Contraseña cambiada. Se han cerrado tus sesiones en otros navegadores.' }, 200, { 'Set-Cookie': cookie });
    }
    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error('acceso gestión:', e);
    return json({ error: 'No se ha podido completar. Prueba otra vez.' }, 500);
  }
}
