/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · ROLES (perfiles) de la gestión interna · César, 29-10-2026
   GET  /api/gestion/roles  → roles con sus permisos y cuántas personas los tienen, y el catálogo de permisos
   POST /api/gestion/roles { accion, … }                                         (permiso perfiles.gestionar: Administrador)
        'crear'  {nombre, descripcion?, aprobacion?, permisos[]}
        'editar' {id, nombre, descripcion?, aprobacion?, permisos[]}
        'borrar' {id}           solo si nadie lo tiene
   · El rol Administrador (del sistema) no se modifica ni se borra: así nunca se pierde el acceso a todo.
   · Todo rol lleva «panel.entrar» (sin él no se podría entrar en la gestión).
   · «aprobacion»: los cambios públicos de ese rol esperan el visto bueno de Presidencia (regla del 26-10-2026).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, anotar, limpiarTexto } from '../../_lib/util.js';
import { exigirPermiso } from '../../_lib/gestion.js';
import { PERMISOS } from '../../_lib/permisos.js';

async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export async function onRequestGet({ request, env }) {
  const p = await exigirPermiso(env, request, 'perfiles.gestionar');
  if (p instanceof Response) return p;
  const t = ahora(), DB = env.DB;
  const roles = (await DB.prepare(
    `SELECT pf.*, (SELECT COUNT(*) FROM usuario_perfiles up JOIN usuarios u ON u.id = up.usuario_id
                    WHERE up.perfil_id = pf.id AND u.estado = 'activo' AND up.desde <= ?1 AND (up.hasta IS NULL OR up.hasta > ?1)) personas
       FROM perfiles pf ORDER BY pf.del_sistema DESC, pf.nombre`).bind(t).all()).results;
  const pp = (await DB.prepare('SELECT perfil_id, permiso FROM perfil_permisos').all()).results;
  const de = id => pp.filter(x => x.perfil_id === id).map(x => x.permiso);
  return json({
    roles: roles.map(r => ({ id: r.id, nombre: r.nombre, descripcion: r.descripcion, sistema: !!r.del_sistema, aprobacion: !!r.requiere_aprobacion,
      personas: r.personas, permisos: de(r.id) })),
    catalogo: Object.entries(PERMISOS).filter(([k]) => k !== 'panel.entrar').map(([clave, x]) => ({ clave, grupo: x.grupo, texto: x.texto, publico: !!x.publico })),
  });
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos.' }, 400);
  const p = await exigirPermiso(env, request, 'perfiles.gestionar');
  if (p instanceof Response) return p;
  const DB = env.DB, t = ahora(), yo = p.s.usuario;
  try {
    if (d.accion === 'crear' || d.accion === 'editar') {
      const nombre = limpiarTexto(d.nombre, 60), descripcion = limpiarTexto(d.descripcion, 200) || null;
      if (!nombre) return json({ error: 'Escribe el nombre del rol.' }, 400);
      const permisos = [...new Set((Array.isArray(d.permisos) ? d.permisos : []).filter(k => PERMISOS[k] && k !== 'panel.entrar'))];
      if (!permisos.length) return json({ error: 'Marca al menos un permiso.' }, 400);
      let id;
      if (d.accion === 'crear') {
        id = slug(nombre) || 'rol';
        if (await DB.prepare('SELECT 1 FROM perfiles WHERE id = ? OR nombre = ?').bind(id, nombre).first()) return json({ error: 'Ya hay un rol con ese nombre.' }, 409);
        await DB.prepare('INSERT INTO perfiles (id, nombre, descripcion, del_sistema, requiere_aprobacion) VALUES (?,?,?,0,?)').bind(id, nombre, descripcion, d.aprobacion ? 1 : 0).run();
      } else {
        const r = await DB.prepare('SELECT * FROM perfiles WHERE id = ?').bind(String(d.id || '')).first();
        if (!r) return json({ error: 'No existe ese rol.' }, 404);
        if (r.del_sistema) return json({ error: 'El rol Administrador no se modifica: tiene siempre todos los permisos.' }, 400);
        if (await DB.prepare('SELECT 1 FROM perfiles WHERE nombre = ? AND id <> ?').bind(nombre, r.id).first()) return json({ error: 'Ya hay otro rol con ese nombre.' }, 409);
        id = r.id;
        await DB.prepare('UPDATE perfiles SET nombre = ?, descripcion = ?, requiere_aprobacion = ? WHERE id = ?').bind(nombre, descripcion, d.aprobacion ? 1 : 0, id).run();
      }
      await DB.batch([
        DB.prepare('DELETE FROM perfil_permisos WHERE perfil_id = ?').bind(id),
        ...['panel.entrar', ...permisos].map(k => DB.prepare('INSERT INTO perfil_permisos (perfil_id, permiso) VALUES (?, ?)').bind(id, k)),
      ]);
      if (d.accion === 'editar') await DB.prepare("DELETE FROM sesiones WHERE tipo = 'gestion' AND usuario_id IN (SELECT usuario_id FROM usuario_perfiles WHERE perfil_id = ?) AND usuario_id <> ?").bind(id, yo.id).run();
      await anotarSeguro(env, yo.id, d.accion === 'crear' ? 'rol.crear' : 'rol.editar', id, { nombre, permisos, aprobacion: !!d.aprobacion });
      return json({ ok: true, id, mensaje: d.accion === 'crear' ? `Rol «${nombre}» creado con ${permisos.length} permisos. Ya se puede asignar.`
                                                              : `Rol «${nombre}» guardado. Quien lo tenga verá los cambios la próxima vez que entre en la gestión.` });
    }
    if (d.accion === 'borrar') {
      const r = await DB.prepare('SELECT * FROM perfiles WHERE id = ?').bind(String(d.id || '')).first();
      if (!r) return json({ error: 'No existe ese rol.' }, 404);
      if (r.del_sistema) return json({ error: 'El rol Administrador no se puede borrar.' }, 400);
      const n = (await DB.prepare(`SELECT COUNT(*) n FROM usuario_perfiles WHERE perfil_id = ? AND (hasta IS NULL OR hasta > ?)`).bind(r.id, t).first()).n;
      if (n) return json({ error: `No se puede borrar: lo tienen ${n} persona${n === 1 ? '' : 's'}. Retíraselo antes.` }, 409);
      await DB.batch([
        DB.prepare('DELETE FROM perfil_permisos WHERE perfil_id = ?').bind(r.id),
        DB.prepare('DELETE FROM usuario_perfiles WHERE perfil_id = ?').bind(r.id),   // solo historial ya cerrado
        DB.prepare('DELETE FROM perfiles WHERE id = ?').bind(r.id),
      ]);
      await anotarSeguro(env, yo.id, 'rol.borrar', r.id, { nombre: r.nombre });
      return json({ ok: true, mensaje: `Rol «${r.nombre}» borrado.` });
    }
    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error('roles:', e);
    return json({ error: 'No se ha podido completar.' }, 500);
  }
}
