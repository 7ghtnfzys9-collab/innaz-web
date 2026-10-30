/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · REGISTRO Y ENTRADA CON CORREO Y CONTRASEÑA · 30-10-2026 (decisión de César)
   POST /api/acceso/clave { accion, … }
     'registro'   {correo, clave, nombre, apellidos, pais, privacidad, boletin?, volver?}
                  → crea la cuenta con los datos básicos (correo SIN confirmar), entra y envía el enlace de confirmación
     'entrar'     {correo, clave}           → sesión de Mi INNAZ
     'olvido'     {correo}                  → enlace para crear otra contraseña (respuesta siempre igual)
     'ver_enlace' {ficha}                   → ¿vale el enlace? (para pintar el formulario)
     'crear'      {ficha, clave}            → pone la contraseña y entra. Quien lo abre demuestra que el correo es suyo:
                                              si la cuenta estaba sin confirmar, queda confirmada y se quitan las llaves
                                              y sesiones creadas antes (protección frente a quien registre un correo ajeno).
     'cambiar'    {actual?, nueva}          → con sesión. Si la cuenta aún no tiene contraseña (p. ej. creada con Face ID),
                                              no se pide la actual.
     'completar'  {nombre, apellidos, pais} → con sesión: guarda los datos básicos que falten (cuentas antiguas).
   Reglas (César, 30-10-2026):
   · Datos obligatorios para crear la cuenta: nombre, apellidos, correo y país de residencia. Sin ellos no se crea.
   · El correo ya no sirve para entrar (no hay enlace mágico): solo para confirmarlo y para «He olvidado mi contraseña».
   · Mientras el correo no esté confirmado, la cuenta no puede suscribirse ni inscribirse en ZLabs.
   Contraseñas: mismas reglas y mismo almacenamiento que la gestión (functions/_lib/clave.js).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, anotar, limpiarCorreo, huellaIP, baseURL, nuevoId } from '../../_lib/util.js';
import { leerSesion, crearSesion, cerrarSesion, reauthReciente, RESPUESTA_REAUTH, marcarReauth } from '../../_lib/sesion.js';
import { asignarAdminInicial, perfilesDe } from '../../_lib/gestion.js';
import { enviar } from '../../_lib/correo.js';
import { huellaClave, claveCorrecta, claveNoValida, nuevoEnlaceClave, gastarEnlaceClave, enlaceClaveVigente, tieneClave } from '../../_lib/clave.js';
import { leerBasicos, faltanBasicos, sentenciasBasicos } from '../../_lib/basicos.js';
import { enviarConfirmacion, sentenciasAlta, trasAlta, altaPermitida, objetoIP, sentenciasRecuperar } from '../../_lib/cuenta.js';

async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }
const ERROR_ENTRAR = 'Correo o contraseña incorrectos.';
const ENLACE_MAL = 'Este enlace no es válido, ya se usó o ha caducado. Pide otro con «He olvidado mi contraseña».';
const limites = env => ({ max: Math.max(1, Number(env.LIMITE_FALLOS_CODIGO) || 5), ventana: Math.max(1, Number(env.MINUTOS_FALLOS_CODIGO) || 15) * 60 });
const sentenciaClave = (DB, uid, h, t) => DB.prepare(`INSERT INTO claves (usuario_id, hash, sal, vueltas, creada, actualizada) VALUES (?,?,?,?,?,?)
  ON CONFLICT(usuario_id) DO UPDATE SET hash = excluded.hash, sal = excluded.sal, vueltas = excluded.vueltas, actualizada = excluded.actualizada`).bind(uid, h.hash, h.sal, h.vueltas, t, t);
const avisoClave = (env, request, u) => enviar(env, 'aviso-clave', u.correo, { nombre: u.nombre, ambito: 'mi', enlace: baseURL(request, env) + '/entrar' }).catch(() => {});

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos.' }, 400);
  const DB = env.DB, t = ahora();
  try {
    // ── Registro ──
    if (d.accion === 'registro') {
      const s = await leerSesion(env, request);
      if (s) return json({ error: 'Ya has entrado con una cuenta. Sal primero si quieres crear otra.' }, 409);
      const correo = limpiarCorreo(d.correo);
      if (!correo) return json({ error: 'Escribe un correo válido.', campo: 'correo' }, 400);
      const b = leerBasicos(d); if (b.error) return json(b, 400);
      const mal = claveNoValida(d.clave, correo); if (mal) return json({ error: mal, campo: 'clave' }, 400);
      if (d.privacidad !== true) return json({ error: 'Para crear la cuenta tienes que aceptar la política de privacidad.', campo: 'privacidad' }, 400);
      // Auditoría 30-10-2026: el freno va ANTES de decir si el correo existe (si no, serviría para rastrear correos sin límite)
      if (!(await altaPermitida(env, request))) return json({ error: '¡Demasiados intentos desde esta conexión! Prueba dentro de un rato.' }, 429);
      if (await DB.prepare('SELECT 1 FROM usuarios WHERE correo = ?').bind(correo).first())
        return json({ error: 'Ya hay una cuenta con ese correo. Entra con tu contraseña o, si no la recuerdas, pulsa «He olvidado mi contraseña».', existe: true, campo: 'correo' }, 409);
      const id = nuevoId(), ip = await huellaIP(request, env), h = await huellaClave(env, d.clave);
      const privacidad = env.VERSION_PRIVACIDAD || 'sin-version';
      try {
        await DB.batch([...sentenciasAlta(DB, { id, correo, basicos: b.v, privacidad, ip, t }), sentenciaClave(DB, id, h, t)]);
      } catch (e) {   // dos altas simultáneas del mismo correo: la segunda choca con el índice único
        if (/UNIQUE/i.test(String(e.message || e))) return json({ error: 'Ya hay una cuenta con ese correo.', existe: true, campo: 'correo' }, 409);
        throw e;
      }
      await trasAlta(env, id, t);
      await anotarSeguro(env, id, 'cuenta.alta', await objetoIP(env, request), { via: 'clave', privacidad, boletinPedido: d.boletin === true });
      const cookie = await crearSesion(env, id, 'suscriptor', request);
      const c = await enviarConfirmacion(env, request, { correo, nombre: b.v.nombre }, { boletin: d.boletin === true, volver: d.volver, via: 'clave' });
      return json({ ok: true, nuevo: true, mensaje: `¡Tu cuenta está creada! Te hemos enviado un correo a ${correo} para confirmarlo.`,
                    ...(c.simulado ? { enlace_simulado: c.simulado } : {}) }, 200, { 'Set-Cookie': cookie });
    }

    // ── ¿Este correo tiene cuenta? (31-10-2026, César: acceso en dos pasos, primero el correo) ──
    // Decisión de César: se informa si el correo no está registrado. Para que no sirva para rastrear correos en masa,
    // tiene freno por conexión (LIMITE_COMPROBAR cada 15 min; 30 por defecto).
    if (d.accion === 'comprobar') {
      const correo = limpiarCorreo(d.correo);
      if (!correo) return json({ error: 'Escribe un correo válido.', campo: 'correo' }, 400);
      if (!(await altaPermitida(env, request, 'cuenta.intento', Math.max(1, Number(env.LIMITE_COMPROBAR) || 30))))
        return json({ error: '¡Demasiados intentos desde esta conexión! Espera unos minutos y vuelve a probar.' }, 429);
      const u = await DB.prepare('SELECT id, estado FROM usuarios WHERE correo = ?').bind(correo).first();
      if (!u || u.estado !== 'activo') return json({ ok: true, correo, existe: !!u, activa: !u ? null : false });
      return json({ ok: true, correo, existe: true, clave: await tieneClave(env, u.id) });
    }

    // ── Entrar ──
    if (d.accion === 'entrar') {
      const correo = limpiarCorreo(d.correo), ip = await huellaIP(request, env), { max, ventana } = limites(env);
      const u = correo ? await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE correo = ?').bind(correo).first() : null;
      const fallos = await DB.prepare(`SELECT
          (SELECT COUNT(*) FROM registro WHERE accion = 'clave.fallo' AND usuario_id = ?1 AND objeto = ?2 AND fecha > ?3) parPersonaIp,
          (SELECT COUNT(*) FROM registro WHERE accion = 'clave.fallo' AND usuario_id = ?1 AND fecha > ?3) persona,
          (SELECT COUNT(*) FROM registro WHERE accion = 'clave.fallo' AND objeto = ?2 AND fecha > ?3) conexion`).bind(u?.id || '-', ip, t - ventana).first();
      // Auditoría 30-10-2026 (decisión C): el tope normal es por persona Y conexión; el global por persona es alto (×10), para que
      // un tercero que conozca el correo no pueda dejar fuera a su dueño; el de la conexión frena el rastreo de muchos correos.
      if (fallos.parPersonaIp >= max || fallos.persona >= max * 10 || fallos.conexion >= max * 4)
        return json({ error: `¡Demasiados intentos fallidos! Por seguridad, espera ${Math.round(ventana / 60)} minutos o pulsa «He olvidado mi contraseña».` }, 429);
      const fila = u ? await DB.prepare('SELECT hash, sal, vueltas FROM claves WHERE usuario_id = ?').bind(u.id).first() : null;
      const bien = await claveCorrecta(env, d.clave, fila);   // tarda lo mismo aunque la cuenta no exista
      if (!bien || !u || u.estado !== 'activo') {
        await anotarSeguro(env, u?.id || null, 'clave.fallo', ip, { al: 'mi' });
        return json({ error: ERROR_ENTRAR }, 400);
      }
      await cerrarSesion(env, request);
      const cookie = await crearSesion(env, u.id, 'suscriptor', request);
      await DB.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').bind(t, u.id).run();
      await anotarSeguro(env, u.id, 'acceso.entrar', ip, { via: 'clave' });
      return json({ ok: true, nombre: u.nombre || null, gestion: (await perfilesDe(env, u.id)).length > 0 }, 200, { 'Set-Cookie': cookie });
    }

    // ── He olvidado mi contraseña ──
    if (d.accion === 'olvido') {
      const correo = limpiarCorreo(d.correo);
      if (!correo) return json({ error: 'Escribe un correo válido.', campo: 'correo' }, 400);
      const comun = { ok: true, mensaje: 'Si ese correo tiene cuenta en INNAZ, te llegará un enlace para crear una contraseña nueva. Vale durante 48 horas.' };
      if (!(await altaPermitida(env, request, 'clave.olvido.ip', 10))) return json(comun);   // auditoría 30-10-2026: freno por conexión (10/h), silencioso
      const u = await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE correo = ?').bind(correo).first();
      if (!u || u.estado !== 'activo') return json(comun);
      const recientes = (await DB.prepare(`SELECT COUNT(*) n FROM registro WHERE accion = 'clave.olvido' AND usuario_id = ? AND fecha > ?`).bind(u.id, t - 900).first()).n;
      if (recientes >= 3) return json(comun);   // freno silencioso: 3 cada 15 minutos
      const ficha = await nuevoEnlaceClave(env, u.id, 'olvido-mi'), enlace = `${baseURL(request, env)}/entrar#clave=${ficha}`;
      await anotarSeguro(env, u.id, 'clave.olvido', u.id, { al: 'mi' });
      const r = await enviar(env, 'clave-enlace', u.correo, { nombre: u.nombre, motivo: 'olvido', ambito: 'mi', enlace }).catch(() => null);
      return json({ ...comun, ...(r && r.simulado && env.MODO === 'pruebas' ? { enlace_simulado: enlace } : {}) });
    }

    if (d.accion === 'ver_enlace') {
      const e = await enlaceClaveVigente(env, d.ficha);
      if (!e) return json({ error: ENLACE_MAL }, 404);
      return json({ ok: true, correo: e.correo, nombre: e.nombre, motivo: e.motivo });
    }

    if (d.accion === 'crear') {
      const e = await enlaceClaveVigente(env, d.ficha);
      if (!e) return json({ error: ENLACE_MAL }, 404);
      const mal = claveNoValida(d.clave, e.correo); if (mal) return json({ error: mal, campo: 'clave' }, 400);
      const g = await gastarEnlaceClave(env, d.ficha);
      if (!g) return json({ error: 'Este enlace ya se ha usado.' }, 409);
      const u = await DB.prepare('SELECT id, correo, nombre, estado, correo_verificado FROM usuarios WHERE id = ?').bind(g.usuario_id).first();
      if (!u || u.estado !== 'activo') return json({ error: 'La cuenta no está activa.' }, 403);
      const h = await huellaClave(env, d.clave), sentencias = [sentenciaClave(DB, u.id, h, t), DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(u.id)];
      const recupera = u.correo_verificado === 0;
      // El dueño del correo recupera la cuenta: fuera lo creado sin confirmar (también Google y los datos que escribió el otro).
      // Ojo al orden: primero se limpia y después se guarda la contraseña nueva.
      await DB.batch(recupera ? [...sentenciasRecuperar(DB, u.id), sentenciaClave(DB, u.id, h, t)] : sentencias);
      await anotarSeguro(env, u.id, 'clave.poner', u.id, { motivo: g.motivo, al: 'mi' });
      if (recupera) await anotarSeguro(env, u.id, 'cuenta.recuperar', u.id, { motivo: 'contraseña creada con el enlace del correo sobre cuenta sin confirmar' });
      await avisoClave(env, request, u);
      await asignarAdminInicial(env, { id: u.id, correo: u.correo });
      // Un enlace de la gestión (alta, restablecida, olvido) abre la gestión; uno de Mi INNAZ, Mi INNAZ.
      const deGestion = g.motivo !== 'olvido-mi' && (await perfilesDe(env, u.id)).length > 0;
      const cookie = await crearSesion(env, u.id, 'suscriptor', request);
      await anotarSeguro(env, u.id, 'acceso.entrar', await huellaIP(request, env), { tras: 'crear contraseña' });
      return json({ ok: true, deGestion, mensaje: 'Contraseña guardada. Ya estás dentro.' }, 200, { 'Set-Cookie': cookie });
    }

    // ── Con sesión ──
    const s = await leerSesion(env, request);
    if (!s) return json({ error: 'Hay que entrar primero.', entrar: true }, 401);
    const uid = s.usuario.id;

    if (d.accion === 'reautenticar') {   // auditoría 30-10-2026: confirmar la identidad con la contraseña para una acción sensible
      const fila = await DB.prepare('SELECT hash, sal, vueltas FROM claves WHERE usuario_id = ?').bind(uid).first();
      if (!fila) return json({ error: 'Tu cuenta no tiene contraseña: confirma con Face ID / Touch ID o con Google.' }, 400);
      const ip = await huellaIP(request, env), { max, ventana } = limites(env);
      const fallos = (await DB.prepare(`SELECT COUNT(*) n FROM registro WHERE accion = 'clave.fallo' AND usuario_id = ? AND objeto = ? AND fecha > ?`).bind(uid, ip, t - ventana).first()).n;
      if (fallos >= max) return json({ error: `¡Demasiados intentos fallidos! Espera ${Math.round(ventana / 60)} minutos.` }, 429);
      if (!(await claveCorrecta(env, d.clave, fila))) { await anotarSeguro(env, uid, 'clave.fallo', ip, { al: 'reautenticar' }); return json({ error: 'La contraseña no es correcta.', campo: 'clave' }, 400); }
      await marcarReauth(env, s);
      return json({ ok: true });
    }
    if (d.accion === 'cambiar') {
      const tenia = await tieneClave(env, uid);
      if (!tenia && !reauthReciente(s)) return json(RESPUESTA_REAUTH, 403);   // crear la primera contraseña: identidad reciente
      if (tenia) {
        const fila = await DB.prepare('SELECT hash, sal, vueltas FROM claves WHERE usuario_id = ?').bind(uid).first();
        if (!(await claveCorrecta(env, d.actual, fila))) {
          await anotarSeguro(env, uid, 'clave.fallo', await huellaIP(request, env), { al: 'cambiar-mi' });
          return json({ error: 'La contraseña actual no es correcta.', campo: 'actual' }, 400);
        }
        if (d.nueva === d.actual) return json({ error: 'La nueva tiene que ser distinta de la actual.', campo: 'nueva' }, 400);
      }
      const mal = claveNoValida(d.nueva, s.usuario.correo); if (mal) return json({ error: mal, campo: 'nueva' }, 400);
      const h = await huellaClave(env, d.nueva);
      await DB.batch([sentenciaClave(DB, uid, h, t), DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(uid),
        DB.prepare('DELETE FROM claves_enlaces WHERE usuario_id = ?').bind(uid)]);   // auditoría 30-10-2026: un enlace de olvido anterior deja de valer
      await anotarSeguro(env, uid, 'clave.poner', uid, { motivo: tenia ? 'cambio' : 'primera', al: 'mi' });
      await avisoClave(env, request, s.usuario);
      const cookie = await crearSesion(env, uid, s.sesion.tipo === 'gestion' ? 'suscriptor' : s.sesion.tipo, request);
      return json({ ok: true, mensaje: tenia ? 'Contraseña cambiada. Se han cerrado tus sesiones en otros navegadores.'
                                             : 'Contraseña guardada. A partir de ahora también puedes entrar con tu correo y esta contraseña.' }, 200, { 'Set-Cookie': cookie });
    }

    if (d.accion === 'completar') {
      const b = leerBasicos(d); if (b.error) return json(b, 400);
      await DB.batch(sentenciasBasicos(DB, uid, b.v, t));
      await anotarSeguro(env, uid, 'datos.basicos', uid, null);
      return json({ ok: true, mensaje: 'Datos guardados.', faltan: await faltanBasicos(env, uid) });
    }

    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error('acceso con contraseña:', e);
    return json({ error: 'No se ha podido completar. Prueba otra vez.' }, 500);
  }
}
