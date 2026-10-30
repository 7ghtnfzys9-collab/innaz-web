/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · ENTRAR O CREAR LA CUENTA CON GOOGLE · 30-10-2026 (ver functions/_lib/google.js)
   GET  /api/acceso/google?accion=config            → { activo }  (¿se muestra el botón?)
   GET  /api/acceso/google?accion=inicio&volver=…   → lleva a Google (302)
   POST /api/acceso/google { accion:'ver_alta', id } → nombre, apellidos y correo que dio Google (para el formulario)
   POST /api/acceso/google { accion:'alta', id, nombre, apellidos, pais, privacidad, boletin? }
        → crea la cuenta (correo ya verificado por Google), la vincula y entra
   La vuelta de Google la recibe /api/acceso/google-vuelta.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, nuevoId, huellaIP, anotar, fichaAleatoria } from '../../_lib/util.js';
import { leerSesion, crearSesion, cerrarSesion, reauthReciente, RESPUESTA_REAUTH } from '../../_lib/sesion.js';
import { asignarAdminInicial } from '../../_lib/gestion.js';
import { leerBasicos } from '../../_lib/basicos.js';
import { sentenciasAlta, trasAlta, altaPermitida, objetoIP, volverValido } from '../../_lib/cuenta.js';
import { AUTORIZAR, COOKIE_G, RETO_SEGUNDOS, googleActivo, vuelta, pkce, guardarPaso, verPaso, tomarPaso } from '../../_lib/google.js';

async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), accion = url.searchParams.get('accion');
  if (accion === 'config') return json({ activo: googleActivo(env) });
  if (accion !== 'inicio') return json({ error: 'Acción desconocida.' }, 400);
  if (!googleActivo(env)) return Response.redirect(new URL('/entrar#gerror=apagado', request.url).toString(), 302);
  const { verificador, reto } = await pkce(), nonce = fichaAleatoria(24);
  const estado = await guardarPaso(env, 'google', { verificador, nonce, volver: volverValido(url.searchParams.get('volver')) }, RETO_SEGUNDOS, await huellaIP(request, env));
  const destino = new URL(AUTORIZAR);
  for (const [k, v] of Object.entries({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: vuelta(request, env), response_type: 'code', scope: 'openid email profile',
    state: estado, nonce, code_challenge: reto, code_challenge_method: 'S256', prompt: 'select_account' })) destino.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: destino.toString(), 'Cache-Control': 'no-store',
    // Ata la vuelta a ESTE navegador (evita que alguien meta a otra persona en su cuenta con un enlace preparado)
    'Set-Cookie': `${COOKIE_G}=${estado}; Path=/; Max-Age=${RETO_SEGUNDOS}; HttpOnly; Secure; SameSite=Lax` } });
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos.' }, 400);
  const DB = env.DB, t = ahora();
  try {
    if (d.accion === 'ver_alta') {
      const p = await verPaso(env, d.id, 'google-alta');
      if (!p) return json({ error: 'Ha pasado demasiado tiempo. Vuelve a pulsar «Continuar con Google».' }, 404);
      return json({ ok: true, correo: p.correo, nombre: p.nombre, apellidos: p.apellidos });
    }
    if (d.accion === 'alta') {
      if (await leerSesion(env, request)) return json({ error: 'Ya has entrado con una cuenta. Sal primero si quieres crear otra.' }, 409);
      const p0 = await verPaso(env, d.id, 'google-alta');
      if (!p0) return json({ error: 'Ha pasado demasiado tiempo. Vuelve a pulsar «Continuar con Google».' }, 404);
      const b = leerBasicos(d); if (b.error) return json(b, 400);
      if (d.privacidad !== true) return json({ error: 'Para crear la cuenta tienes que aceptar la política de privacidad.', campo: 'privacidad' }, 400);
      if (!(await altaPermitida(env, request))) return json({ error: '¡Demasiadas cuentas nuevas desde esta conexión! Prueba dentro de un rato.' }, 429);
      const p = await tomarPaso(env, d.id, 'google-alta');   // ahora sí se gasta
      if (!p) return json({ error: 'Este paso ya se ha usado.' }, 409);
      if (await DB.prepare('SELECT 1 FROM usuarios WHERE correo = ?').bind(p.correo).first())
        return json({ error: 'Ya hay una cuenta con ese correo: vuelve a pulsar «Continuar con Google» para entrar con ella.', existe: true }, 409);
      const id = nuevoId(), ip = await huellaIP(request, env), privacidad = env.VERSION_PRIVACIDAD || 'sin-version';
      try {
        await DB.batch([...sentenciasAlta(DB, { id, correo: p.correo, basicos: b.v, privacidad, ip, t }),
          DB.prepare(`UPDATE usuarios SET correo_verificado = 1, boletin = ?, boletin_fecha = ?, boletin_origen = ? WHERE id = ?`)
            .bind(d.boletin === true ? 1 : 0, d.boletin === true ? t : null, d.boletin === true ? 'registro-google' : null, id),
          DB.prepare('INSERT INTO cuentas_google (sub, usuario_id, correo, creado, ultimo_uso) VALUES (?,?,?,?,?)').bind(p.sub, id, p.correo, t, t)]);
      } catch (e) {
        if (/UNIQUE/i.test(String(e.message || e))) return json({ error: 'Esa cuenta de Google o ese correo ya están en INNAZ: vuelve a pulsar «Continuar con Google».', existe: true }, 409);
        throw e;
      }
      await trasAlta(env, id, t);
      await anotarSeguro(env, id, 'cuenta.alta', await objetoIP(env, request), { via: 'google', privacidad, boletin: d.boletin === true });
      await asignarAdminInicial(env, { id, correo: p.correo });
      await cerrarSesion(env, request);
      const cookie = await crearSesion(env, id, 'suscriptor', request);
      return json({ ok: true, nuevo: true, volver: volverValido(p.volver) }, 200, { 'Set-Cookie': cookie });
    }
    // Quitar la cuenta de Google de «Formas de entrar» (31-10-2026). Tiene que quedar al menos otra forma.
    if (d.accion === 'quitar') {
      const s = await leerSesion(env, request);
      if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
      if (!reauthReciente(s)) return json(RESPUESTA_REAUTH, 403);   // auditoría 30-10-2026
      const uid = s.usuario.id;
      const otras = (await DB.prepare(`SELECT (SELECT COUNT(*) FROM claves WHERE usuario_id = ?1) + (SELECT COUNT(*) FROM llaves_acceso WHERE usuario_id = ?1) n`).bind(uid).first()).n;
      if (!otras) return json({ error: 'Es tu única forma de entrar. Antes crea una contraseña o añade Face ID / Touch ID.' }, 409);
      const r = await DB.prepare('DELETE FROM cuentas_google WHERE usuario_id = ?').bind(uid).run();
      if (!r.meta.changes) return json({ error: 'Tu cuenta no tiene Google vinculado.' }, 404);
      await anotarSeguro(env, uid, 'google.quitar', uid, null);
      return json({ ok: true, mensaje: 'Google ya no sirve para entrar en tu cuenta. Si vuelves a pulsar «Continuar con Google» con el mismo correo, se vinculará de nuevo.' });
    }
    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error('google:', e);
    return json({ error: 'No se ha podido completar. Prueba otra vez.' }, 500);
  }
}
