/* ══════════════════════════════════════════════════════════════════════
   GET /api/acceso/google-vuelta?code=…&state=…   · vuelta de Google (30-10-2026)
   · Cuenta de Google ya vinculada → entra.
   · Correo de Google que ya tiene cuenta en INNAZ → se vincula, entra y se avisa por correo. Google ha verificado
     el correo: si la cuenta estaba sin confirmar (creada por otra persona con ese correo), pasa a ser de quien
     demuestra que es suyo y se quitan las llaves, la contraseña y las sesiones creadas antes.
   · Correo nuevo → /entrar#google=… para completar el país y aceptar la privacidad (datos básicos obligatorios).
   Los errores vuelven a /entrar#gerror=<código> (nunca con texto libre en la dirección).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, anotar, leerCookie, limpiarCorreo, baseURL } from '../../_lib/util.js';
import { crearSesion, cerrarSesion, leerSesion, marcarReauth } from '../../_lib/sesion.js';
import { asignarAdminInicial } from '../../_lib/gestion.js';
import { enviar } from '../../_lib/correo.js';
import { volverValido, sentenciasRecuperar } from '../../_lib/cuenta.js';
import { COOKIE_G, ALTA_SEGUNDOS, googleActivo, cambiarCodigo, tomarPaso, guardarPaso } from '../../_lib/google.js';

async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }
const borrarG = `${COOKIE_G}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
function ir(request, ruta, cookies = []) {
  const h = new Headers({ Location: new URL(ruta, request.url).toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  for (const c of [borrarG, ...cookies]) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), estado = url.searchParams.get('state') || '', codigo = url.searchParams.get('code') || '';
  if (!googleActivo(env)) return ir(request, '/entrar#gerror=apagado');
  if (url.searchParams.get('error')) return ir(request, '/entrar#gerror=cancelado');   // la persona canceló en Google
  if (!estado || leerCookie(request, COOKIE_G) !== estado) return ir(request, '/entrar#gerror=navegador');
  const paso = await tomarPaso(env, estado, 'google');
  if (!paso || !codigo) return ir(request, '/entrar#gerror=caducado');
  let g;
  try { g = await cambiarCodigo(env, request, codigo, paso.verificador, paso.nonce); }
  catch (e) { console.error('google-vuelta:', e); return ir(request, '/entrar#gerror=' + (/verificado/.test(e.message) ? 'sinverificar' : 'fallo')); }
  const correo = limpiarCorreo(g.correo); if (!correo) return ir(request, '/entrar#gerror=fallo');
  const DB = env.DB, t = ahora(), volver = volverValido(paso.volver) || '/mi-innaz';
  try {
    let u = null;
    const v = await DB.prepare('SELECT u.id, u.correo, u.nombre, u.estado FROM cuentas_google g JOIN usuarios u ON u.id = g.usuario_id WHERE g.sub = ?').bind(g.sub).first();
    if (v) {
      u = v;
      await DB.prepare('UPDATE cuentas_google SET ultimo_uso = ?, correo = ? WHERE sub = ?').bind(t, correo, g.sub).run();
    } else {
      const e = await DB.prepare('SELECT id, correo, nombre, estado, correo_verificado FROM usuarios WHERE correo = ?').bind(correo).first();
      if (!e) {   // cuenta nueva: faltan el país y la privacidad
        const id = await guardarPaso(env, 'google-alta', { sub: g.sub, correo, nombre: g.nombre, apellidos: g.apellidos, volver: paso.volver || null }, ALTA_SEGUNDOS);
        return ir(request, '/entrar#google=' + id);
      }
      if (e.estado !== 'activo') return ir(request, '/entrar#gerror=inactiva');
      const s = [DB.prepare('INSERT INTO cuentas_google (sub, usuario_id, correo, creado, ultimo_uso) VALUES (?,?,?,?,?)').bind(g.sub, e.id, correo, t, t)];
      // Cuenta creada sin confirmar por otra persona: primero se limpia todo lo suyo y después se vincula Google (auditoría 30-10-2026)
      await DB.batch(e.correo_verificado === 0 ? [...sentenciasRecuperar(DB, e.id), ...s] : s);
      await anotarSeguro(env, e.id, 'google.vincular', e.id, { recupera: e.correo_verificado === 0 });
      await enviar(env, 'aviso-google', correo, { nombre: e.nombre, enlace: baseURL(request, env) + '/mi-innaz#datos' }).catch(() => {});
      u = e;
    }
    if (!u || u.estado !== 'activo') return ir(request, '/entrar#gerror=inactiva');
    const sAct = await leerSesion(env, request);
    if (sAct && sAct.usuario.id === u.id) {   // auditoría 30-10-2026: ya estaba dentro → solo confirma su identidad y vuelve
      await marcarReauth(env, sAct); await anotarSeguro(env, u.id, 'acceso.reautenticar', null, { via: 'google' });
      return ir(request, volver);
    }
    await asignarAdminInicial(env, { id: u.id, correo: u.correo });
    await cerrarSesion(env, request);
    const cookie = await crearSesion(env, u.id, 'suscriptor', request);
    await DB.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?').bind(t, u.id).run();
    await anotarSeguro(env, u.id, 'acceso.entrar', null, { via: 'google' });
    return ir(request, volver, [cookie]);
  } catch (e) {
    console.error('google-vuelta:', e);
    return ir(request, '/entrar#gerror=fallo');
  }
}
