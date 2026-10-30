/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · PERSONAS Y PERFILES DE GESTIÓN · 27-10-2026 (módulo 3)
   GET  /api/gestion/personas[?correo=…]
        → perfiles disponibles, personas con algún perfil vigente y, si se busca un correo, esa persona.
   POST /api/gestion/personas { accion, correo, perfil? }
        'asignar'          {correo, nombre, apellidos, perfil}: rol a una persona; si no tiene cuenta, se le crea
                           (cuenta de trabajo, César 29-10-2026); se guardan nombre y apellidos (permiso perfiles.asignar)
        'retirar'          perfil (queda en el historial con fecha fin)   (permiso perfiles.asignar)
        'editar'           {correo, nombre, apellidos, nuevoCorreo?}: corregir sus datos (29-10-2026)  (perfiles.asignar)
        'quitar'           {correo}: quitarla de la gestión (retira todos sus roles; la cuenta NO se borra)  (perfiles.asignar)
        'restablecer_clave' {correo}: anula su contraseña, la saca de todos los navegadores y le envía un enlace para crear otra
                           (si la han robado o no le llegó el primer enlace)  (permiso factor.reiniciar) · 30-10-2026
        'guardar'          {correo, nombre, apellidos, nuevoCorreo?, roles[]}: TODO el formulario de una persona en una sola
                           petición (auditoría 29-10-2026): datos, roles que entran y roles que salen; crea la cuenta de trabajo
                           si no existe. Se comprueba todo ANTES de escribir nada, un solo apunte en el registro y UN solo
                           correo a la persona con lo que ha cambiado.                 (permiso perfiles.asignar)
   Acceso con correo y contraseña (César, 30-10-2026): al dar de alta a alguien (o darle un rol si aún no tiene contraseña) le llega
   un enlace de un solo uso (48 h) para crear ÉL MISMO su contraseña. El rol Administrador solo lo da, lo quita o lo toca un Administrador
   (también: modificar, quitar o restablecer la contraseña de una persona que sea Administrador).
   Reglas (decisión de César, 27-10-2026, opción A):
   · Nunca se queda la asociación sin Administrador: no se puede retirar el último.
   · Nadie se reinicia su propio factor ni se retira a sí mismo el perfil de Administrador.
   · Todo queda en el registro de actividad y se avisa por correo a la persona afectada.
   · Al retirar un rol, la persona SIGUE dentro de la gestión si conserva otros (los permisos se leen en cada petición);
     solo cuando se queda sin ninguno su sesión baja a la de suscriptor (auditoría 29-10-2026; antes se la expulsaba del todo).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, anotar, limpiarCorreo, limpiarTexto, nuevoId, correoVerificado, baseURL } from '../../_lib/util.js';
import { asignarNumero } from '../../_lib/numero.js';
import { exigirPermiso, perfilesDe } from '../../_lib/gestion.js';
import { nuevoEnlaceClave, tieneClave } from '../../_lib/clave.js';
import { enviar } from '../../_lib/correo.js';

// El cambio ya está hecho: si falla el registro, se avisa en el log del servidor pero no se devuelve error.
async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }

async function adminsVigentes(env) {
  const t = ahora();
  return (await env.DB.prepare(
    `SELECT COUNT(*) n FROM usuario_perfiles up JOIN usuarios u ON u.id = up.usuario_id
      WHERE up.perfil_id = 'administrador' AND u.estado = 'activo' AND up.desde <= ? AND (up.hasta IS NULL OR up.hasta > ?)`)
    .bind(t, t).first()).n;
}

/** Si la persona ya no tiene ningún rol vigente, su sesión de gestión pasa a ser de suscriptor (no se la expulsa). */
async function bajarSesionSiSinRoles(env, usuarioId) {
  if ((await perfilesDe(env, usuarioId)).length) return;
  await env.DB.prepare("UPDATE sesiones SET tipo = 'suscriptor' WHERE usuario_id = ? AND tipo = 'gestion'").bind(usuarioId).run();
}
const enlaceGestion = (env, request) => (env.BASE_URL || new URL(request.url).origin) + '/gestion';
const esAdmin = async (env, uid) => (await perfilesDe(env, uid)).some(x => x.id === 'administrador');
/** Enlace para crear la contraseña (alta o restablecida) y su correo. Devuelve { enlace_simulado? } (solo en pruebas). */
async function enviarEnlaceClave(env, request, u, motivo, roles = []) {
  const ficha = await nuevoEnlaceClave(env, u.id, motivo), enlace = `${baseURL(request, env)}/gestion#clave=${ficha}`;
  const r = await enviar(env, 'clave-enlace', u.correo, { nombre: u.nombre, motivo, roles, enlace }).catch(() => null);
  return r && r.simulado && env.MODO === 'pruebas' ? { enlace_simulado: enlace } : {};
}

export async function onRequestGet({ request, env }) {
  const p = await exigirPermiso(env, request, 'perfiles.asignar');
  if (p instanceof Response) return p;
  const DB = env.DB, t = ahora();
  const perfiles = (await DB.prepare('SELECT id, nombre, descripcion FROM perfiles ORDER BY del_sistema DESC, nombre').all()).results;
  const filas = (await DB.prepare(
    `SELECT u.id, u.correo, u.nombre, (SELECT apellidos FROM datos_personales WHERE usuario_id = u.id) apellidos, p.id perfil, p.nombre perfil_nombre, up.desde,
            EXISTS (SELECT 1 FROM claves c WHERE c.usuario_id = u.id) tiene_clave
       FROM usuario_perfiles up JOIN usuarios u ON u.id = up.usuario_id JOIN perfiles p ON p.id = up.perfil_id
      WHERE up.desde <= ? AND (up.hasta IS NULL OR up.hasta > ?)
      ORDER BY u.correo, p.nombre`).bind(t, t).all()).results;
  const personas = {};
  for (const f of filas) {
    personas[f.id] ??= { correo: f.correo, nombre: f.nombre, apellidos: f.apellidos || null, tieneClave: !!f.tiene_clave, perfiles: [] };
    personas[f.id].perfiles.push({ id: f.perfil, nombre: f.perfil_nombre });
  }
  let buscada = null;
  const q = limpiarCorreo(new URL(request.url).searchParams.get('correo') || '');
  if (q) {
    const u = await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE correo = ?').bind(q).first();
    buscada = u ? { correo: u.correo, nombre: u.nombre, estado: u.estado, perfiles: await perfilesDe(env, u.id),
                    tieneClave: await tieneClave(env, u.id) } : { correo: q, noRegistrada: true };
  }
  return json({ perfiles, personas: Object.values(personas), buscada, yo: p.s.usuario.correo,
                puedeRestablecer: p.permisos.includes('factor.reiniciar'), soyAdmin: await esAdmin(env, p.s.usuario.id) });
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos' }, 400);
  if (d.accion === 'reiniciar_factor') d.accion = 'restablecer_clave';   // nombre antiguo (hasta el 29-10-2026)
  const permiso = d.accion === 'restablecer_clave' ? 'factor.reiniciar' : 'perfiles.asignar';
  const p = await exigirPermiso(env, request, permiso);
  if (p instanceof Response) return p;
  const { s } = p, DB = env.DB, t = ahora();

  const correo = limpiarCorreo(d.correo);
  if (!correo) return json({ error: 'Correo no válido.' }, 400);
  let u = await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE correo = ?').bind(correo).first();
  // Asignar (César, 29-10-2026): se registran nombre, apellidos y correo; si no tiene cuenta, se crea su cuenta de trabajo.
  let creada = false;
  if (d.accion === 'asignar') {
    const nombre = limpiarTexto(d.nombre, 80), apellidos = limpiarTexto(d.apellidos, 120);
    if (!nombre || !apellidos) return json({ error: 'Escribe el nombre y los apellidos.' }, 400);
    // Se comprueba el rol antes de crear nada (auditoría 29-10-2026: antes se creaba la cuenta aunque el rol no existiera).
    if (!await DB.prepare('SELECT 1 FROM perfiles WHERE id = ?').bind(String(d.perfil || '')).first()) return json({ error: 'Perfil desconocido.' }, 400);
    if (u && u.estado !== 'activo') return json({ error: 'La cuenta de esa persona no está activa.' }, 400);
    if (!u) {
      const id = nuevoId();
      await DB.batch([
        DB.prepare(`INSERT INTO usuarios (id, correo, nombre, creado, estado, boletin) VALUES (?,?,?,?,'activo',0)`).bind(id, correo, nombre, t),
        DB.prepare(`INSERT INTO suscripciones (id, usuario_id, nivel, alta, estado, renovacion_auto) VALUES (?,?,'registrado',?,'activa',0)`).bind(nuevoId(), id, t),
      ]);
      try { await asignarNumero(env, id, t); } catch (e) { console.error('numero:', e); }
      await anotarSeguro(env, s.usuario.id, 'cuenta.alta_gestion', id, { correo });
      u = { id, correo, nombre, estado: 'activo' }; creada = true;
    } else await DB.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?').bind(nombre, u.id).run();
    await DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, actualizado) VALUES (?,?,?)
                      ON CONFLICT(usuario_id) DO UPDATE SET apellidos = excluded.apellidos, actualizado = excluded.actualizado`).bind(u.id, apellidos, t).run();
    u.nombre = nombre;
  }
  if (!u && d.accion !== 'guardar') return json({ error: 'No hay ninguna cuenta con ese correo.' }, 404);   // 'guardar' crea la cuenta de trabajo
  // Cuenta creada sin confirmar el correo (30-10-2026): al darle un rol, el Administrador avala el correo; se borran llaves, contraseña,
  // Google y sesiones creadas sin confirmar (podrían no ser del dueño del correo). El dueño creará su contraseña con el enlace de alta.
  if (u && (d.accion === 'guardar' || d.accion === 'asignar') && !(await correoVerificado(env, u.id))) {
    await DB.batch([
      DB.prepare('DELETE FROM llaves_acceso WHERE usuario_id = ?').bind(u.id),
      DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(u.id),
      DB.prepare('DELETE FROM claves WHERE usuario_id = ?').bind(u.id),          // auditoría 30-10-2026: la contraseña también pudo ponerla otra persona
      DB.prepare('DELETE FROM claves_enlaces WHERE usuario_id = ?').bind(u.id),
      DB.prepare('DELETE FROM cuentas_google WHERE usuario_id = ?').bind(u.id),
      DB.prepare('UPDATE usuarios SET correo_verificado = 1, boletin = 0 WHERE id = ?').bind(u.id),
    ]);
    await anotarSeguro(env, s.usuario.id, 'cuenta.avalar', u.id, { correo: u.correo });
  }
  const yoMismo = !!u && u.id === s.usuario.id;
  // El rol Administrador solo lo maneja un Administrador (César, 30-10-2026)
  const soyAdmin = await esAdmin(env, s.usuario.id);
  if (!soyAdmin && u && !yoMismo && await esAdmin(env, u.id))
    return json({ error: 'Esa persona es Administrador: solo otro Administrador puede modificarla, quitarla o restablecer su contraseña.' }, 403);
  if (!soyAdmin && (d.accion === 'asignar' || d.accion === 'retirar') && String(d.perfil || '') === 'administrador')
    return json({ error: 'Solo un Administrador puede dar o quitar el rol de Administrador.' }, 403);
  if (!soyAdmin && d.accion === 'guardar' && Array.isArray(d.roles) && d.roles.map(String).includes('administrador'))
    return json({ error: 'Solo un Administrador puede dar el rol de Administrador.' }, 403);

  try {
    if (d.accion === 'asignar' || d.accion === 'retirar') {
      const perfil = await DB.prepare('SELECT id, nombre FROM perfiles WHERE id = ?').bind(String(d.perfil || '')).first();
      if (!perfil) return json({ error: 'Perfil desconocido.' }, 400);

      if (d.accion === 'asignar') {
        if (u.estado !== 'activo') return json({ error: 'La cuenta de esa persona no está activa.' }, 400);
        const r = await DB.prepare(
          `INSERT INTO usuario_perfiles (usuario_id, perfil_id, asignado_por, desde, hasta) VALUES (?,?,?,?,NULL)
           ON CONFLICT(usuario_id, perfil_id) DO UPDATE SET asignado_por = excluded.asignado_por, desde = excluded.desde, hasta = NULL
            WHERE usuario_perfiles.hasta IS NOT NULL AND usuario_perfiles.hasta <= excluded.desde`)
          .bind(u.id, perfil.id, s.usuario.id, t).run();
        if (!r.meta.changes) return json({ ok: true, mensaje: `${u.correo} ya tenía el rol ${perfil.nombre}.` });
        await anotarSeguro(env, s.usuario.id, 'perfil.asignar', u.id, { perfil: perfil.id, correo: u.correo });
        let extraClave = {};
        if (await tieneClave(env, u.id)) await enviar(env, 'aviso-perfil', u.correo, { nombre: u.nombre, perfil: perfil.nombre, alta: true,
                                                     enlace: enlaceGestion(env, request) }).catch(() => {});
        else extraClave = await enviarEnlaceClave(env, request, u, 'alta', [perfil.nombre]);   // 30-10-2026: crea él mismo su contraseña
        // Cuentas aparte (César, 28-10-2026): la gestión se hace con una cuenta de trabajo, no con la de suscriptor. Solo se avisa.
        const sus = await DB.prepare(`SELECT 1 FROM suscripciones WHERE usuario_id = ? AND nivel != 'registrado' AND estado IN ('activa','prueba') LIMIT 1`).bind(u.id).first();
        const avisoCuenta = sus ? ' ⚠ Esta cuenta tiene una suscripción: la gestión debe hacerse con una cuenta aparte, de trabajo.' : '';
        return json({ ok: true, ...extraClave, mensaje: `${creada ? 'Cuenta creada y r' : 'R'}ol ${perfil.nombre} asignado a ${u.nombre} (${u.correo}). ${extraClave.enlace_simulado !== undefined || !(await tieneClave(env, u.id)) ? 'Le hemos enviado un enlace para crear su contraseña (vale 48 horas).' : 'Entrará en /gestion con su contraseña.'}${avisoCuenta}` });
      }

      // retirar
      if (perfil.id === 'administrador') {
        if (yoMismo) return json({ error: 'No puedes retirarte a ti mismo el perfil de Administrador. Que lo haga otro Administrador.' }, 400);
        // El recuento y la retirada en una sola sentencia: dos retiradas simultáneas no dejan la asociación sin Administrador.
        const r = await DB.prepare(
          `UPDATE usuario_perfiles SET hasta = ?1
            WHERE usuario_id = ?2 AND perfil_id = 'administrador' AND (hasta IS NULL OR hasta > ?1)
              AND (SELECT COUNT(*) FROM usuario_perfiles up JOIN usuarios us ON us.id = up.usuario_id
                    WHERE up.perfil_id = 'administrador' AND us.estado = 'activo' AND up.usuario_id != ?2
                      AND up.desde <= ?1 AND (up.hasta IS NULL OR up.hasta > ?1)) >= 1`)
          .bind(t, u.id).run();
        if (!r.meta.changes) {
          return json({ error: (await adminsVigentes(env)) <= 1 ? 'Es el único Administrador: antes hay que nombrar otro.' : `${u.correo} no tenía ese perfil.` }, 400);
        }
      } else {
        const r = await DB.prepare(
          'UPDATE usuario_perfiles SET hasta = ? WHERE usuario_id = ? AND perfil_id = ? AND (hasta IS NULL OR hasta > ?)')
          .bind(t, u.id, perfil.id, t).run();
        if (!r.meta.changes) return json({ error: `${u.correo} no tenía ese perfil.` }, 400);
      }
      await bajarSesionSiSinRoles(env, u.id);   // si conserva otros roles sigue dentro: los permisos se leen en cada petición
      await anotarSeguro(env, s.usuario.id, 'perfil.retirar', u.id, { perfil: perfil.id, correo: u.correo });
      await enviar(env, 'aviso-perfil', u.correo, { nombre: u.nombre, perfil: perfil.nombre, alta: false }).catch(() => {});
      return json({ ok: true, mensaje: `Rol ${perfil.nombre} retirado a ${u.correo}.` });
    }

    // ── Guardar el formulario entero de una persona en una sola petición (auditoría 29-10-2026) ──
    if (d.accion === 'guardar') {
      const nombre = limpiarTexto(d.nombre, 80), apellidos = limpiarTexto(d.apellidos, 120);
      if (!nombre || !apellidos) return json({ error: 'Escribe el nombre y los apellidos.' }, 400);
      const pedidos = [...new Set((Array.isArray(d.roles) ? d.roles : []).map(String))];
      if (!pedidos.length) return json({ error: u ? 'Para quitarle todos los roles, usa «Quitar».' : 'Marca al menos un rol.' }, 400);
      const catalogo = (await DB.prepare('SELECT id, nombre FROM perfiles').all()).results;
      const porId = Object.fromEntries(catalogo.map(x => [x.id, x]));
      if (pedidos.some(id => !porId[id])) return json({ error: 'Perfil desconocido.' }, 400);
      const nuevo = d.nuevoCorreo ? limpiarCorreo(d.nuevoCorreo) : correo;
      if (!nuevo) return json({ error: 'El correo nuevo no es válido.' }, 400);
      const cambiaCorreo = !!u && nuevo !== u.correo;
      if (u && u.estado !== 'activo') return json({ error: 'La cuenta de esa persona no está activa.' }, 400);
      if (cambiaCorreo && await DB.prepare('SELECT 1 FROM usuarios WHERE correo = ? AND id <> ?').bind(nuevo, u.id).first())
        return json({ error: 'Ya hay otra cuenta con ese correo.' }, 409);
      const actuales = u ? (await perfilesDe(env, u.id)).map(x => x.id) : [];
      const altas = pedidos.filter(id => !actuales.includes(id)), bajas = actuales.filter(id => !pedidos.includes(id));
      if (yoMismo && bajas.includes('administrador')) return json({ error: 'No puedes retirarte a ti mismo el perfil de Administrador. Que lo haga otro Administrador.' }, 400);
      if (!yoMismo && bajas.includes('administrador') && (await adminsVigentes(env)) <= 1) return json({ error: 'Es el único Administrador: antes hay que nombrar otro.' }, 400);
      // Todo comprobado: ahora se escribe (cuenta nueva si hace falta, datos, roles) en un solo lote.
      let creada = false, id = u ? u.id : nuevoId();
      const ops = [];
      if (!u) {
        creada = true;
        ops.push(DB.prepare(`INSERT INTO usuarios (id, correo, nombre, creado, estado, boletin) VALUES (?,?,?,?,'activo',0)`).bind(id, correo, nombre, t),
                 DB.prepare(`INSERT INTO suscripciones (id, usuario_id, nivel, alta, estado, renovacion_auto) VALUES (?,?,'registrado',?,'activa',0)`).bind(nuevoId(), id, t));
      } else ops.push(DB.prepare('UPDATE usuarios SET nombre = ?, correo = ? WHERE id = ?').bind(nombre, cambiaCorreo ? nuevo : u.correo, id));
      ops.push(DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, actualizado) VALUES (?,?,?)
                           ON CONFLICT(usuario_id) DO UPDATE SET apellidos = excluded.apellidos, actualizado = excluded.actualizado`).bind(id, apellidos, t));
      for (const r of altas) ops.push(DB.prepare(
        `INSERT INTO usuario_perfiles (usuario_id, perfil_id, asignado_por, desde, hasta) VALUES (?,?,?,?,NULL)
         ON CONFLICT(usuario_id, perfil_id) DO UPDATE SET asignado_por = excluded.asignado_por, desde = excluded.desde, hasta = NULL`).bind(id, r, s.usuario.id, t));
      for (const r of bajas) ops.push(DB.prepare('UPDATE usuario_perfiles SET hasta = ?1 WHERE usuario_id = ?2 AND perfil_id = ?3 AND (hasta IS NULL OR hasta > ?1)').bind(t, id, r));
      if (cambiaCorreo && !yoMismo) ops.push(DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(id));   // con el correo nuevo tendrá que volver a entrar
      await DB.batch(ops);
      if (creada) { try { await asignarNumero(env, id, t); } catch (e) { console.error('numero:', e); } }
      if (bajas.length && !cambiaCorreo) await bajarSesionSiSinRoles(env, id);
      await anotarSeguro(env, s.usuario.id, creada ? 'cuenta.alta_gestion' : 'persona.guardar', id,
        { correo: nuevo, nombre, altas, bajas, ...(cambiaCorreo ? { antes: u.correo } : {}) });
      // 30-10-2026: quien aún no tiene contraseña recibe el enlace para crearla (con sus roles); quien ya la tiene, el aviso de roles
      const conClave = !creada && await tieneClave(env, id);
      let extraClave = {};
      if (!conClave && (creada || altas.length)) extraClave = await enviarEnlaceClave(env, request, { id, correo: nuevo, nombre }, 'alta', pedidos.map(r => porId[r].nombre));
      else if (altas.length || bajas.length) await enviar(env, 'aviso-roles', nuevo, { nombre, altas: altas.map(r => porId[r].nombre), bajas: bajas.map(r => porId[r].nombre),
                                                                                  enlace: altas.length ? enlaceGestion(env, request) : null }).catch(() => {});
      const partes = [];
      if (creada) partes.push('Cuenta de trabajo creada.');
      if (altas.length) partes.push('Roles asignados: ' + altas.map(r => porId[r].nombre).join(', ') + '.');
      if (bajas.length) partes.push('Roles retirados: ' + bajas.map(r => porId[r].nombre).join(', ') + '.');
      if (cambiaCorreo) partes.push('A partir de ahora entra con ' + nuevo + '.');
      if (!conClave && (creada || altas.length)) partes.push('Le hemos enviado un correo con un enlace para crear su contraseña (vale 48 horas).');
      else if (altas.length) partes.push('Entrará en /gestion con su contraseña de siempre.');
      if (!u) { /* nada */ } else if (await DB.prepare(`SELECT 1 FROM suscripciones WHERE usuario_id = ? AND nivel != 'registrado' AND estado IN ('activa','prueba') LIMIT 1`).bind(id).first())
        partes.push('⚠ Esta cuenta tiene una suscripción: la gestión debe hacerse con una cuenta aparte, de trabajo.');
      return json({ ok: true, ...extraClave, mensaje: `Datos de ${nombre} ${apellidos} guardados. ${partes.join(' ')}`.trim(), altas, bajas, creada });
    }

    // ── Modificar los datos de una persona (César, 29-10-2026) ──
    if (d.accion === 'editar') {
      const nombre = limpiarTexto(d.nombre, 80), apellidos = limpiarTexto(d.apellidos, 120);
      if (!nombre || !apellidos) return json({ error: 'Escribe el nombre y los apellidos.' }, 400);
      let nuevo = d.nuevoCorreo ? limpiarCorreo(d.nuevoCorreo) : u.correo;
      if (!nuevo) return json({ error: 'El correo nuevo no es válido.' }, 400);
      const cambiaCorreo = nuevo !== u.correo;
      if (cambiaCorreo && await DB.prepare('SELECT 1 FROM usuarios WHERE correo = ? AND id <> ?').bind(nuevo, u.id).first())
        return json({ error: 'Ya hay otra cuenta con ese correo.' }, 409);
      await DB.batch([
        DB.prepare('UPDATE usuarios SET nombre = ?, correo = ? WHERE id = ?').bind(nombre, nuevo, u.id),
        DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, actualizado) VALUES (?,?,?)
                    ON CONFLICT(usuario_id) DO UPDATE SET apellidos = excluded.apellidos, actualizado = excluded.actualizado`).bind(u.id, apellidos, t),
        ...(cambiaCorreo && !yoMismo ? [DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(u.id)] : []),   // con el correo nuevo tendrá que volver a entrar
      ]);
      await anotarSeguro(env, s.usuario.id, 'persona.editar', u.id, { nombre, cambiaCorreo, antes: cambiaCorreo ? u.correo : undefined, correo: nuevo });
      return json({ ok: true, mensaje: `Datos de ${nombre} ${apellidos} guardados.${cambiaCorreo ? ' A partir de ahora entra con ' + nuevo + '.' : ''}` });
    }
    // ── Quitar a una persona de la gestión: todos sus roles fuera (la cuenta no se borra; César, 29-10-2026) ──
    if (d.accion === 'quitar') {
      if (yoMismo) return json({ error: 'No puedes quitarte a ti mismo de la gestión. Que lo haga otro Administrador.' }, 400);
      const suyos = await perfilesDe(env, u.id);
      if (!suyos.length) return json({ error: `${u.correo} no tiene ningún rol.` }, 400);
      if (suyos.some(x => x.id === 'administrador') && (await adminsVigentes(env)) <= 1) return json({ error: 'Es el único Administrador: antes hay que nombrar otro.' }, 400);
      await DB.batch([
        DB.prepare('UPDATE usuario_perfiles SET hasta = ?1 WHERE usuario_id = ?2 AND (hasta IS NULL OR hasta > ?1)').bind(t, u.id),
        DB.prepare("UPDATE sesiones SET tipo = 'suscriptor' WHERE usuario_id = ? AND tipo = 'gestion'").bind(u.id),
      ]);
      await anotarSeguro(env, s.usuario.id, 'persona.quitar', u.id, { correo: u.correo, roles: suyos.map(x => x.id) });
      // Un solo correo con todos los roles retirados (antes, uno por rol)
      await enviar(env, 'aviso-roles', u.correo, { nombre: u.nombre, altas: [], bajas: suyos.map(x => x.nombre) }).catch(() => {});
      return json({ ok: true, mensaje: `${u.nombre || u.correo} ya no está en la gestión (roles retirados: ${suyos.map(x => x.nombre).join(', ')}). Su cuenta se conserva.` });
    }

    // ── Restablecer la contraseña (César, 30-10-2026): si se la han robado o no le llegó el enlace ──
    if (d.accion === 'restablecer_clave') {
      if (yoMismo) return json({ error: 'Tu propia contraseña la cambias abajo, en «Cambiar mi contraseña».' }, 400);
      if (!(await perfilesDe(env, u.id)).length) return json({ error: `${u.correo} no tiene ningún rol en la gestión.` }, 400);
      const teniaClave = await tieneClave(env, u.id);
      await DB.batch([
        DB.prepare('DELETE FROM claves WHERE usuario_id = ?').bind(u.id),          // la contraseña antigua deja de valer ya
        DB.prepare('DELETE FROM sesiones WHERE usuario_id = ?').bind(u.id),        // fuera de todos sus navegadores
      ]);
      await anotarSeguro(env, s.usuario.id, 'clave.restablecer', u.id, { correo: u.correo });
      const extra = await enviarEnlaceClave(env, request, u, teniaClave ? 'restablecida' : 'alta', teniaClave ? [] : (await perfilesDe(env, u.id)).map(x => x.nombre));
      return json({ ok: true, ...extra, correo: u.correo, mensaje: teniaClave
        ? `Contraseña de ${u.nombre || u.correo} anulada y sesiones cerradas. Le hemos enviado un enlace para crear otra (vale 48 horas).`
        : `Le hemos enviado otra vez a ${u.nombre || u.correo} el enlace para crear su contraseña (vale 48 horas; el anterior ya no sirve).` });
    }
    return json({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error('personas:', e);
    return json({ error: 'No se ha podido completar.' }, 500);
  }
}
