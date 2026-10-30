/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · «Mis datos» (28-10-2026)
   GET  /api/mi/datos  → los datos de la persona que ha entrado (nunca de otra).
        El documento solo se devuelve con sus 4 últimos caracteres; la dirección, entera (es la suya).
   POST /api/mi/datos  { nombre, apellidos, telefono, fecha_nacimiento, documento_tipo, documento?, dir_* }
        · Nombre, apellidos y país son obligatorios (datos básicos, César 30-10-2026); el resto se puede ir completando,
          pero lo que se escribe se valida igual que en ZLabs.
        · Documento vacío = se conserva el guardado. Dirección: o entera o vacía (vacía = se conserva).
        · El correo no se cambia aquí (más adelante, con confirmación por correo).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, anotar, limpiarTexto } from '../../_lib/util.js';
import { leerSesion } from '../../_lib/sesion.js';
import { cifrar, descifrar } from '../../_lib/cifrado.js';
import { leerBasicos, nombrePais } from '../../_lib/basicos.js';
import { fechaValida, documentoValido, telefonoValido, validarDireccion } from '../../_lib/zlabs.js';

const USO = 'datos';
const mal = (campo, error) => json({ error, campo }, 400);

export async function onRequestGet({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  const f = await env.DB.prepare('SELECT * FROM datos_personales WHERE usuario_id = ?').bind(s.usuario.id).first();
  let documento_fin = '', dir = {};
  if (f?.documento_cifrado) { try { documento_fin = (await descifrar(env, USO, f.documento_cifrado)).slice(-4); } catch {} }
  if (f?.direccion_cifrada) { try { dir = JSON.parse(await descifrar(env, USO, f.direccion_cifrada)); } catch {} }
  const u = await env.DB.prepare('SELECT pais_declarado FROM usuarios WHERE id = ?').bind(s.usuario.id).first().catch(() => null);
  return json({ correo: s.usuario.correo, nombre: s.usuario.nombre || '', pais: u?.pais_declarado || '', pais_nombre: u?.pais_declarado ? nombrePais(u.pais_declarado) : '',
    apellidos: f?.apellidos || '', telefono: f?.telefono || '', fecha_nacimiento: f?.fecha_nacimiento || '',
    documento_tipo: f?.documento_tipo || 'dni', documento_fin, centro: f?.centro || '',
    dir_calle: dir.calle || '', dir_numero: dir.numero || '', dir_piso: dir.piso || '', dir_cp: dir.cp || '',
    dir_poblacion: dir.poblacion || '', dir_provincia: dir.provincia || '', dir_pais: dir.pais || 'España',
    actualizado: f?.actualizado || null });
}

export async function onRequestPost({ request, env }) {
  const s = await leerSesion(env, request);
  if (!s) return json({ error: 'Hay que entrar primero.' }, 401);
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos' }, 400);

  const b = leerBasicos(d); if (b.error) return json(b, 400);
  const { nombre, apellidos, pais } = b.v, centro = limpiarTexto(d.centro, 150);
  let telefono = null;
  if (String(d.telefono || '').trim()) { telefono = telefonoValido(d.telefono); if (!telefono) return mal('telefono', 'Escribe un teléfono válido (con prefijo si no es español).'); }
  let nac = null;
  if (String(d.fecha_nacimiento || '').trim()) {
    if (!fechaValida(d.fecha_nacimiento) || d.fecha_nacimiento > new Date().toISOString().slice(0, 10) || d.fecha_nacimiento < '1900-01-01')
      return mal('fecha_nacimiento', 'Escribe una fecha de nacimiento válida.');
    nac = d.fecha_nacimiento;
  }
  const tipoDoc = ['dni', 'nie', 'pasaporte'].includes(d.documento_tipo) ? d.documento_tipo : 'dni';
  const actual = await env.DB.prepare('SELECT documento_tipo, documento_cifrado, direccion_cifrada FROM datos_personales WHERE usuario_id = ?').bind(s.usuario.id).first();
  let docC = actual?.documento_cifrado || null;
  if (String(d.documento || '').trim()) {
    const doc = documentoValido(tipoDoc, d.documento);
    if (!doc) return mal('documento', 'El número de documento no es válido. Revisa la letra.');
    docC = await cifrar(env, USO, doc);
  } else if (docC && actual.documento_tipo !== tipoDoc) return mal('documento', 'Has cambiado el tipo de documento: escribe también el número.');
  const rd = validarDireccion(d, true);
  if (rd.error) return json(rd, 400);
  const dirC = rd.vacia ? (actual?.direccion_cifrada || null) : await cifrar(env, USO, JSON.stringify(rd.v));

  const t = ahora(), DB = env.DB;
  await DB.batch([
    DB.prepare('UPDATE usuarios SET nombre = ?, pais_declarado = ? WHERE id = ?').bind(nombre, pais, s.usuario.id),
    DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, telefono, fecha_nacimiento, documento_tipo, documento_cifrado, direccion_cifrada, centro, actualizado)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(usuario_id) DO UPDATE SET apellidos=excluded.apellidos, telefono=excluded.telefono, fecha_nacimiento=excluded.fecha_nacimiento,
                  documento_tipo=excluded.documento_tipo, documento_cifrado=excluded.documento_cifrado, direccion_cifrada=excluded.direccion_cifrada,
                  centro=excluded.centro, actualizado=excluded.actualizado`)
      .bind(s.usuario.id, apellidos, telefono, nac, docC ? tipoDoc : null, docC, dirC, centro, t),
  ]);
  try { await anotar(env, s.usuario.id, 'datos.editar', s.usuario.id); } catch {}
  return json({ ok: true, mensaje: 'Datos guardados.' });
}
