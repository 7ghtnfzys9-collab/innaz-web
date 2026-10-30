/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · LLAVES DE ACCESO (Face ID / Touch ID) · 29-10-2026
   GET  /api/llaves                         → mis llaves (hace falta haber entrado)
   POST /api/llaves { accion, … }
     'registro_opciones'                    → reto y opciones para navigator.credentials.create()   (con sesión)
     'registro_confirmar' {reto, credencial, nombre?} → guarda la llave                              (con sesión)
     'entrar_opciones'                      → reto y opciones para navigator.credentials.get()      (sin sesión)
     'entrar_confirmar' {reto, credencial}  → entra (o eleva a gestión) con la llave
     'quitar' {id} · 'renombrar' {id, nombre}                                                        (con sesión)
     'alta_opciones' {correo, nombre, apellidos, pais, privacidad, boletin?, volver?}  (datos básicos obligatorios, César 30-10-2026)  → crear la CUENTA con Face ID en un paso (sin sesión) · 30-10-2026
     'alta_confirmar' {reto, credencial}    → crea la cuenta (correo SIN confirmar), guarda la llave, entra y envía el enlace de confirmación
     'reenviar_confirmacion'                → vuelve a enviar el enlace de confirmación                       (con sesión)
   Alta con Face ID (César, 30-10-2026): mientras no se confirme el correo, la cuenta no puede suscribirse ni inscribirse en ZLabs.
   Si el dueño real del correo crea su contraseña con «He olvidado mi contraseña», la cuenta pasa a ser suya y se borran las llaves
   creadas sin confirmar (functions/api/acceso/clave.js). El boletín solo se activa al confirmar (doble consentimiento).
   Reglas (César, 29-10-2026):
   · Sirve para entrar en Mi INNAZ. La gestión se abre con correo y contraseña (César, 30-10-2026): una cuenta con rol que entra
     con su llave queda como suscriptor y, para gestionar, da su contraseña en /gestion.
   · Máximo 5 llaves por cuenta. Alta y baja se anotan y se avisan por correo.
   · Los retos duran 5 minutos y se consumen al usarse.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, nuevoId, anotar, limpiarTexto, limpiarCorreo, huella, huellaIP, fichaAleatoria, baseURL, correoVerificado } from '../_lib/util.js';
import { leerBasicos } from '../_lib/basicos.js';
import { enviarConfirmacion, ultimaConfirmacion, sentenciasAlta, trasAlta, altaPermitida } from '../_lib/cuenta.js';
import { leerSesion, crearSesion, cerrarSesion, reauthReciente, RESPUESTA_REAUTH, marcarReauth } from '../_lib/sesion.js';
import { perfilesDe } from '../_lib/gestion.js';
import { enviar } from '../_lib/correo.js';
import { relyingParty, nuevoReto, RETO_SEGUNDOS, MAX_LLAVES, comprobarRegistro, comprobarEntrada, b64u } from '../_lib/llaves.js';

async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }
const fila = l => ({ id: l.id, nombre: l.nombre, creada: l.creada, ultimoUso: l.ultimo_uso, respaldada: !!l.respaldada });
const nombrePorDefecto = request => { const ua = request.headers.get('User-Agent') || '';
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Macintosh/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : 'Este aparato'; };

async function crearReto(env, tipo, usuarioId, datos = null, ip = null) {
  const t = ahora(), id = nuevoId(), reto = nuevoReto();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM llaves_retos WHERE expira < ?').bind(t - 3600),   // se guardan 1 h más para el freno por conexión
    env.DB.prepare('INSERT INTO llaves_retos (id, reto, tipo, usuario_id, creado, expira, datos, ip) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, reto, tipo, usuarioId, t, t + RETO_SEGUNDOS, datos ? JSON.stringify(datos) : null, ip),
  ]);
  return { id, reto };
}
/** Toma el reto (una sola vez). null si no existe, caducó o no es del tipo/persona esperados. Devuelve { reto, datos }. */
async function tomarReto(env, id, tipo, usuarioId = null) {
  const r = await env.DB.prepare('DELETE FROM llaves_retos WHERE id = ? RETURNING *').bind(String(id || '')).first();
  if (!r || r.tipo !== tipo || r.expira < ahora() || (usuarioId && r.usuario_id !== usuarioId)) return null;
  return { reto: r.reto, datos: r.datos ? JSON.parse(r.datos) : null };
}
const consumirReto = async (...a) => (await tomarReto(...a))?.reto || null;

export async function onRequestGet({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  const llaves = (await env.DB.prepare('SELECT * FROM llaves_acceso WHERE usuario_id = ? ORDER BY creada').bind(s.usuario.id).all()).results;
  return json({ llaves: llaves.map(fila), max: MAX_LLAVES, rpId: relyingParty(env, request).rpId });
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos' }, 400);
  const DB = env.DB, t = ahora(), rp = relyingParty(env, request);
  const s = await leerSesion(env, request);
  try {
    if (d.accion === 'entrar_opciones') {
      const { id, reto } = await crearReto(env, 'entrar', null);
      return json({ ok: true, retoId: id, opciones: { challenge: reto, rpId: rp.rpId, userVerification: 'required', timeout: 120000 } });
    }
    if (d.accion === 'entrar_confirmar') {
      const reto = await consumirReto(env, d.reto, 'entrar');
      if (!reto) return json({ error: 'El reto ha caducado: vuelve a intentarlo.' }, 400);
      const cred = d.credencial;
      const llave = cred && typeof cred.id === 'string' ? await DB.prepare('SELECT * FROM llaves_acceso WHERE id = ?').bind(cred.id).first() : null;
      if (!llave) return json({ error: 'Esa llave no está registrada en INNAZ. Entra con tu correo y contraseña y añádela en Mis datos.' }, 404);
      const u = await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE id = ?').bind(llave.usuario_id).first();
      if (!u || u.estado !== 'activo') return json({ error: 'La cuenta no está activa.' }, 403);
      let v; try { v = await comprobarEntrada(cred, llave, { reto, rp }); }
      catch (e) { await anotarSeguro(env, u.id, 'llave.fallo', llave.id, { motivo: String(e.message || e).slice(0, 120) }); return json({ error: 'No se ha podido comprobar la llave: ' + String(e.message || e) }, 400); }
      if (!v.uv) return json({ error: 'Hace falta Face ID, Touch ID o el código del aparato para entrar.' }, 400);
      await DB.prepare('UPDATE llaves_acceso SET contador = ?, ultimo_uso = ? WHERE id = ?').bind(v.contador, t, llave.id).run();
      if (s && s.usuario.id === u.id) {   // auditoría 30-10-2026: ya estaba dentro → solo confirma su identidad (acción sensible)
        await marcarReauth(env, s); await anotarSeguro(env, u.id, 'acceso.reautenticar', llave.id, { via: 'llave' });
        return json({ ok: true, reautenticado: true, nombre: u.nombre || null, correo: u.correo });
      }
      // 30-10-2026 (César): la gestión se abre solo con correo y contraseña; la llave da acceso a Mi INNAZ.
      const gestion = (await perfilesDe(env, u.id)).length > 0;
      const cookie = await crearSesion(env, u.id, 'suscriptor', request);
      await DB.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').bind(t, u.id).run();
      await anotarSeguro(env, u.id, 'acceso.llave', llave.id, { nombre: llave.nombre, gestion });
      return json({ ok: true, gestion, nuevo: false, nombre: u.nombre || null, correo: u.correo }, 200, { 'Set-Cookie': cookie });
    }

    // ── Crear la cuenta con Face ID en un paso (César, 30-10-2026) ──
    if (d.accion === 'alta_opciones') {
      if (s) return json({ error: 'Ya has entrado. Para añadir una llave a tu cuenta, ve a Mis datos.' }, 409);
      const correo = limpiarCorreo(d.correo);
      if (!correo) return json({ error: 'Escribe un correo válido.', campo: 'correo' }, 400);
      const b = leerBasicos(d); if (b.error) return json(b, 400);
      if (d.privacidad !== true) return json({ error: 'Para crear la cuenta tienes que aceptar la política de privacidad.', campo: 'privacidad' }, 400);
      // Auditoría 30-10-2026: el freno va ANTES de decir si el correo existe
      if (!(await altaPermitida(env, request))) return json({ error: '¡Demasiados intentos desde esta conexión! Prueba dentro de un rato.' }, 429);
      if (await DB.prepare('SELECT 1 FROM usuarios WHERE correo = ?').bind(correo).first())
        return json({ error: 'Ya hay una cuenta con ese correo. Entra con tu contraseña o tu llave; si no recuerdas la contraseña, pulsa «He olvidado mi contraseña».', existe: true, campo: 'correo' }, 409);
      const ip = await huellaIP(request, env);
      const uid = nuevoId(), nombre = b.v.nombre;
      const { id, reto } = await crearReto(env, 'alta', null, { uid, correo, basicos: b.v, boletin: d.boletin === true, volver: d.volver || null, privacidad: env.VERSION_PRIVACIDAD || 'sin-version' }, ip);
      return json({ ok: true, retoId: id, opciones: {
        rp: { id: rp.rpId, name: rp.nombre }, challenge: reto,
        user: { id: b64u(new TextEncoder().encode(uid)), name: correo, displayName: `${nombre} ${b.v.apellidos}` },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, timeout: 120000, attestation: 'none' } });
    }
    if (d.accion === 'alta_confirmar') {
      const tr = await tomarReto(env, d.reto, 'alta');
      if (!tr || !tr.datos) return json({ error: 'Ha pasado demasiado tiempo: vuelve a pulsar «Crear mi cuenta con Face ID».' }, 400);
      const a = tr.datos;
      let r; try { r = await comprobarRegistro(d.credencial, { reto: tr.reto, rp }); }
      catch (e) { return json({ error: 'No se ha podido crear la llave: ' + String(e.message || e) }, 400); }
      if (await DB.prepare('SELECT 1 FROM llaves_acceso WHERE id = ?').bind(r.id).first()) return json({ error: 'Esa llave ya está registrada.' }, 409);
      const ip = await huellaIP(request, env);
      if (!a.basicos) return json({ error: 'Faltan tus datos básicos: vuelve a empezar.' }, 400);
      const nombreLlave = limpiarTexto(d.nombre, 60) || nombrePorDefecto(request);
      try {
        await DB.batch([...sentenciasAlta(DB, { id: a.uid, correo: a.correo, basicos: a.basicos, privacidad: a.privacidad, ip, t }),
          DB.prepare(`INSERT INTO llaves_acceso (id, usuario_id, clave_publica, algoritmo, contador, nombre, creada, ultimo_uso, transportes, respaldada)
                      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(r.id, a.uid, JSON.stringify(r.jwk), r.alg, r.contador, nombreLlave, t, t, r.transportes, r.respaldada)]);
      } catch (e) {
        if (/UNIQUE/i.test(String(e.message || e))) return json({ error: 'Ya hay una cuenta con ese correo. Entra con tu contraseña o tu llave.', existe: true }, 409);
        throw e;
      }
      await trasAlta(env, a.uid, t);
      await anotarSeguro(env, a.uid, 'cuenta.alta', a.uid, { via: 'llave', privacidad: a.privacidad, boletinPedido: !!a.boletin });
      await anotarSeguro(env, a.uid, 'llave.alta', r.id, { nombre: nombreLlave, alg: r.alg });
      await cerrarSesion(env, request);   // auditoría 30-10-2026: la sesión que hubiera en este navegador se sustituye
      const cookie = await crearSesion(env, a.uid, 'suscriptor', request);
      const c = await enviarConfirmacion(env, request, { correo: a.correo, nombre: a.basicos.nombre }, { boletin: a.boletin, volver: a.volver, via: 'llave' });
      return json({ ok: true, nuevo: true, gestion: false, mensaje: `¡Tu cuenta está creada! Te hemos enviado un correo a ${a.correo} para confirmarlo.`,
                    ...(c.simulado ? { enlace_simulado: c.simulado } : {}) }, 200, { 'Set-Cookie': cookie });
    }

    if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
    const uid = s.usuario.id;
    if (d.accion === 'reenviar_confirmacion') {
      if (await correoVerificado(env, uid)) return json({ ok: true, mensaje: 'Tu correo ya está confirmado.' });
      const u = await DB.prepare('SELECT correo, nombre FROM usuarios WHERE id = ?').bind(uid).first();
      const prev = await ultimaConfirmacion(env, u.correo);
      const c = await enviarConfirmacion(env, request, u, { boletin: !!prev.boletin, volver: prev.volver, via: prev.via || 'clave' });
      if (c.error) return json({ error: c.error }, 429);
      return json({ ok: true, mensaje: `Te hemos enviado otra vez el enlace a ${u.correo}. Vale durante 48 horas.`, ...(c.simulado ? { enlace_simulado: c.simulado } : {}) });
    }
    if (d.accion === 'registro_opciones') {
      if (!reauthReciente(s)) return json(RESPUESTA_REAUTH, 403);   // auditoría 30-10-2026
      const mias = (await DB.prepare('SELECT id, transportes FROM llaves_acceso WHERE usuario_id = ?').bind(uid).all()).results;
      if (mias.length >= MAX_LLAVES) return json({ error: `Ya tienes ${MAX_LLAVES} llaves: quita alguna antes de añadir otra.` }, 409);
      const { id, reto } = await crearReto(env, 'registro', uid);
      return json({ ok: true, retoId: id, opciones: {
        rp: { id: rp.rpId, name: rp.nombre }, challenge: reto,
        user: { id: b64u(new TextEncoder().encode(uid)), name: s.usuario.correo, displayName: s.usuario.nombre || s.usuario.correo },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: mias.map(m => ({ type: 'public-key', id: m.id, ...(m.transportes ? { transports: m.transportes.split(',') } : {}) })),
        timeout: 120000, attestation: 'none' } });
    }
    if (d.accion === 'registro_confirmar') {
      const reto = await consumirReto(env, d.reto, 'registro', uid);
      if (!reto) return json({ error: 'El reto ha caducado: vuelve a pulsar «Añadir una llave».' }, 400);
      let r; try { r = await comprobarRegistro(d.credencial, { reto, rp }); }
      catch (e) { return json({ error: 'No se ha podido registrar la llave: ' + String(e.message || e) }, 400); }
      const n = (await DB.prepare('SELECT COUNT(*) n FROM llaves_acceso WHERE usuario_id = ?').bind(uid).first()).n;
      if (n >= MAX_LLAVES) return json({ error: `Ya tienes ${MAX_LLAVES} llaves.` }, 409);
      if (await DB.prepare('SELECT 1 FROM llaves_acceso WHERE id = ?').bind(r.id).first()) return json({ error: 'Esa llave ya está registrada.' }, 409);
      const nombre = limpiarTexto(d.nombre, 60) || nombrePorDefecto(request);
      await DB.prepare(`INSERT INTO llaves_acceso (id, usuario_id, clave_publica, algoritmo, contador, nombre, creada, ultimo_uso, transportes, respaldada)
                        VALUES (?,?,?,?,?,?,?,NULL,?,?)`).bind(r.id, uid, JSON.stringify(r.jwk), r.alg, r.contador, nombre, t, r.transportes, r.respaldada).run();
      await anotarSeguro(env, uid, 'llave.alta', r.id, { nombre, alg: r.alg, respaldada: r.respaldada });
      await enviar(env, 'aviso-llave', s.usuario.correo, { nombre: s.usuario.nombre, llave: nombre, alta: true }).catch(() => {});
      return json({ ok: true, mensaje: `Llave «${nombre}» añadida. A partir de ahora puedes entrar con ella en este aparato.`, llave: { id: r.id, nombre, creada: t, ultimoUso: null, respaldada: !!r.respaldada } });
    }
    if (d.accion === 'quitar' || d.accion === 'renombrar') {
      const l = await DB.prepare('SELECT * FROM llaves_acceso WHERE id = ? AND usuario_id = ?').bind(String(d.id || ''), uid).first();
      if (!l) return json({ error: 'No existe esa llave.' }, 404);
      if (d.accion === 'renombrar') {
        const nombre = limpiarTexto(d.nombre, 60); if (!nombre) return json({ error: 'Escribe un nombre.' }, 400);
        await DB.prepare('UPDATE llaves_acceso SET nombre = ? WHERE id = ?').bind(nombre, l.id).run();
        return json({ ok: true, mensaje: 'Nombre guardado.' });
      }
      // 31-10-2026: no se quita la última forma de entrar (sin contraseña, sin Google y sin otra llave)
      const otras = (await DB.prepare(`SELECT (SELECT COUNT(*) FROM claves WHERE usuario_id = ?1) + (SELECT COUNT(*) FROM cuentas_google WHERE usuario_id = ?1)
        + (SELECT COUNT(*) FROM llaves_acceso WHERE usuario_id = ?1 AND id <> ?2) n`).bind(uid, l.id).first().catch(() => ({ n: 1 }))).n;
      if (!otras) return json({ error: 'Es tu única forma de entrar. Antes crea una contraseña (en «Mi contraseña») o añade otra llave.' }, 409);
      await DB.prepare('DELETE FROM llaves_acceso WHERE id = ?').bind(l.id).run();
      await anotarSeguro(env, uid, 'llave.baja', l.id, { nombre: l.nombre });
      await enviar(env, 'aviso-llave', s.usuario.correo, { nombre: s.usuario.nombre, llave: l.nombre, alta: false }).catch(() => {});
      return json({ ok: true, mensaje: `Llave «${l.nombre}» quitada. Si la tenías en el aparato, puedes borrarla también allí.` });
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error('llaves:', e);
    return json({ error: 'No se ha podido completar. Prueba otra vez.' }, 500);
  }
}
