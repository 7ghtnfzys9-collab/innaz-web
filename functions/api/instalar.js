/* ══════════════════════════════════════════════════════════════════════
   POST /api/instalar   { paso: 'estructura' | 'semilla' | 'migrar' }
   Crea la base de datos de la web de pruebas sin usar el Terminal (desde /instalar).
   · Solo en la web de pruebas (MODO = 'pruebas'), que ya está protegida con contraseña.
   · No borra nada: si la estructura ya existe, no hace nada.
   · Dos pasos para no pasar del límite de consultas por llamada de D1.
   ══════════════════════════════════════════════════════════════════════ */
import { json } from '../_lib/util.js';
import { ESTRUCTURA, SEMILLA, ZLABS, MIS_DATOS } from '../_lib/instalacion.js';

// Columnas añadidas después de crear la base (27-10-2026 en adelante)
const MIGRACIONES = [
  // 30-10-2026 · panel de ventajas (César): las «destacadas» son las que salen en la tarjeta del nivel en /suscripciones
  { tabla: 'nivel_beneficios', columna: 'destacada', sql: 'ALTER TABLE nivel_beneficios ADD COLUMN destacada INTEGER NOT NULL DEFAULT 0' },
  // 30-10-2026 · auditoría: cuándo demostró la persona su identidad por última vez en esta sesión (acciones sensibles)
  { tabla: 'sesiones', columna: 'reauth', sql: 'ALTER TABLE sesiones ADD COLUMN reauth INTEGER' },
  // 30-10-2026 · datos básicos obligatorios de Mi INNAZ (César): país de residencia (código ISO de 2 letras)
  { tabla: 'usuarios', columna: 'pais_declarado', sql: 'ALTER TABLE usuarios ADD COLUMN pais_declarado TEXT' },
  // 30-10-2026 · alta con Face ID: el correo queda sin confirmar hasta pulsar el enlace (las cuentas anteriores ya lo confirmaron)
  { tabla: 'usuarios', columna: 'correo_verificado', sql: 'ALTER TABLE usuarios ADD COLUMN correo_verificado INTEGER NOT NULL DEFAULT 1' },
  { tabla: 'segundo_factor', columna: 'confirmado',
    sql: 'ALTER TABLE segundo_factor ADD COLUMN confirmado INTEGER NOT NULL DEFAULT 0' },
  { tabla: 'segundo_factor', columna: 'sesion_alta',
    sql: 'ALTER TABLE segundo_factor ADD COLUMN sesion_alta TEXT' },
  // Número de registro de cada persona (César, 28-10-2026)
  { tabla: 'usuarios', columna: 'numero', sql: 'ALTER TABLE usuarios ADD COLUMN numero TEXT' },
  // Accesos gratuitos desde el panel (César, 28-10-2026)
  { tabla: 'suscripciones', columna: 'gratuito', sql: 'ALTER TABLE suscripciones ADD COLUMN gratuito INTEGER NOT NULL DEFAULT 0' },
  { tabla: 'suscripciones', columna: 'motivo', sql: 'ALTER TABLE suscripciones ADD COLUMN motivo TEXT' },
  { tabla: 'suscripciones', columna: 'mejora_de', sql: 'ALTER TABLE suscripciones ADD COLUMN mejora_de TEXT' },   // mejoras de nivel (28-10-2026)
  // ZLabs (28-10-2026): por si la tabla se creó antes de estas columnas
  ...['gestion_huella TEXT', 'modificado INTEGER', 'papel TEXT', 'comunicado INTEGER', 'comunicado_estado TEXT', 'usuario_id TEXT'].map(c => ({
    tabla: 'zlabs_preinscripciones', columna: c.split(' ')[0], sql: `ALTER TABLE zlabs_preinscripciones ADD COLUMN ${c}` })),
];
// Datos añadidos después de cargar la semilla (sentencias que no hacen nada si ya están)
const DATOS = [
  // 30-10-2026 · ventajas destacadas iniciales (las que tenía escritas la página pública), solo si aún no hay ninguna marcada
  ...[['simpatizante', ['A2', 'B4', 'D2', 'D1', 'F1', 'F2']], ['colaborador', ['Z1', 'C1', 'A4', 'A3', 'D3', 'D7']], ['protector', ['A12', 'A11', 'C6', 'C5', 'D6']], ['mecenas', ['E4', 'F5', 'F10']]]
    .map(([nivel, codigos]) => ({ nombre: `destacadas ${nivel}`, sql: `UPDATE nivel_beneficios SET destacada = 1 WHERE nivel = '${nivel}' AND codigo IN (${codigos.map(c => `'${c}'`).join(',')})
      AND NOT EXISTS (SELECT 1 FROM nivel_beneficios WHERE destacada = 1 AND nivel = '${nivel}')` })),
  // 31-10-2026 · eliminar cuenta (César): datos de facturación BLOQUEADOS (cifrados) de quien pagó y se dio de baja
  { nombre: 'tabla bajas_bloqueadas', sql: `CREATE TABLE IF NOT EXISTS bajas_bloqueadas (usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id), fecha_baja INTEGER NOT NULL, conservar_hasta INTEGER NOT NULL, motivo TEXT, datos_cifrados TEXT NOT NULL)` },
  { nombre: 'permiso cuentas.eliminar (Administrador)', sql: `INSERT OR IGNORE INTO perfil_permisos (perfil_id, permiso) VALUES ('administrador', 'cuentas.eliminar')` },
  // 30-10-2026 · entrar con Google en Mi INNAZ (César): cuenta de Google (sub) vinculada a cada persona
  { nombre: 'tabla cuentas_google', sql: `CREATE TABLE IF NOT EXISTS cuentas_google (sub TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), correo TEXT, creado INTEGER NOT NULL, ultimo_uso INTEGER)` },
  { nombre: 'índice cuentas_google por persona', sql: 'CREATE INDEX IF NOT EXISTS idx_google_usuario ON cuentas_google (usuario_id)' },
  // 30-10-2026 · gestión con correo y contraseña (César): huellas de contraseñas y enlaces para crearlas
  { nombre: 'tabla claves', sql: `CREATE TABLE IF NOT EXISTS claves (usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id), hash TEXT NOT NULL, sal TEXT NOT NULL, vueltas INTEGER NOT NULL, creada INTEGER NOT NULL, actualizada INTEGER NOT NULL)` },
  { nombre: 'tabla claves_enlaces', sql: `CREATE TABLE IF NOT EXISTS claves_enlaces (huella TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), motivo TEXT NOT NULL, creado INTEGER NOT NULL, expira INTEGER NOT NULL)` },
  { nombre: 'índice de fallos de contraseña', sql: 'CREATE INDEX IF NOT EXISTS idx_registro_accion ON registro (accion, fecha)' },
  // 29-10-2026 · llaves de acceso (Face ID / Touch ID): llaves públicas y retos de un solo uso
  { nombre: 'tabla llaves_acceso', sql: `CREATE TABLE IF NOT EXISTS llaves_acceso (id TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), clave_publica TEXT NOT NULL,
      algoritmo INTEGER NOT NULL, contador INTEGER NOT NULL DEFAULT 0, nombre TEXT, creada INTEGER NOT NULL, ultimo_uso INTEGER, transportes TEXT, respaldada INTEGER NOT NULL DEFAULT 0)` },
  { nombre: 'índice llaves por cuenta', sql: 'CREATE INDEX IF NOT EXISTS idx_llaves_usuario ON llaves_acceso (usuario_id)' },
  { nombre: 'tabla llaves_retos', sql: `CREATE TABLE IF NOT EXISTS llaves_retos (id TEXT PRIMARY KEY, reto TEXT NOT NULL, tipo TEXT NOT NULL, usuario_id TEXT, creado INTEGER NOT NULL, expira INTEGER NOT NULL, datos TEXT, ip TEXT)` },
  // 29-10-2026 · códigos de centro por curso (alumnos, 50 %)
  { nombre: 'tabla codigos_centro', sql: `CREATE TABLE IF NOT EXISTS codigos_centro (codigo TEXT PRIMARY KEY, centro TEXT NOT NULL, curso TEXT NOT NULL, hasta INTEGER NOT NULL, activo INTEGER NOT NULL DEFAULT 1, creado INTEGER NOT NULL, creado_por TEXT REFERENCES usuarios(id))` },
  // 28-10-2026 · número de registro: índice único y número para quien aún no lo tenga (por orden de alta en cada año)
  { nombre: 'índice único del número de registro', sql: 'CREATE UNIQUE INDEX IF NOT EXISTS usuarios_numero ON usuarios (numero)' },
  { nombre: 'números de registro de las cuentas existentes',
    sql: `UPDATE usuarios SET numero = (SELECT x.n FROM (
            SELECT id, substr(strftime('%Y', creado, 'unixepoch'), 3, 2) || printf('%04d',
                   coalesce((SELECT MAX(CAST(substr(numero, 3) AS INTEGER)) FROM usuarios v WHERE v.numero LIKE substr(strftime('%Y', u.creado, 'unixepoch'), 3, 2) || '%'), 0)
                   + ROW_NUMBER() OVER (PARTITION BY substr(strftime('%Y', creado, 'unixepoch'), 3, 2) ORDER BY creado, id)) n
              FROM usuarios u WHERE numero IS NULL) x WHERE x.id = usuarios.id)
          WHERE numero IS NULL` },
  // 28-10-2026 · índice para buscar las preinscripciones de cada cuenta (no hace nada si ya existe)
  { nombre: 'índice zlabs por cuenta', sql: 'CREATE INDEX IF NOT EXISTS idx_zlabs_usuario ON zlabs_preinscripciones (usuario_id)' },
  { nombre: 'permiso factor.reiniciar para Administrador',
    sql: `INSERT OR IGNORE INTO perfil_permisos (perfil_id, permiso) VALUES ('administrador', 'factor.reiniciar')` },
  // 28-10-2026 · perfil «Comisión ZLabs» y permisos de ZLabs (también para el Administrador)
  { nombre: 'perfil Comisión ZLabs',
    sql: "INSERT OR IGNORE INTO perfiles (id,nombre,descripcion,del_sistema,requiere_aprobacion) VALUES ('zlabs','Comisión ZLabs','Comisión artística de ZLabs (de momento, un solo acceso compartido). Solo ve ZLabs; no ve documentos, direcciones ni pagos.',0,0)" },
  ...['panel.entrar','zlabs.ver','zlabs.seleccionar','zlabs.comunicar'].map(p => ({ nombre: `permiso ${p} para Comisión ZLabs`,
    sql: `INSERT OR IGNORE INTO perfil_permisos (perfil_id, permiso) VALUES ('zlabs', '${p}')` })),
  ...['zlabs.ver','zlabs.seleccionar','zlabs.comunicar','zlabs.datos'].map(p => ({ nombre: `permiso ${p} para Administrador`,
    sql: `INSERT OR IGNORE INTO perfil_permisos (perfil_id, permiso) VALUES ('administrador', '${p}')` })),
];

/** Un paso de la instalación. Devuelve { ok, hecho, recuento? } o { error }. Lanza si falla la base de datos. */
async function paso(env, paso) {
  const DB = env.DB;
  const hay = async t => !!(await DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").bind(t).first());
  if (paso === 'estructura') {
    if (await hay('usuarios')) return { ok: true, hecho: 'La estructura ya existía: no se ha tocado.' };
    await DB.batch(ESTRUCTURA.map(s => DB.prepare(s)));
    return { ok: true, hecho: `Estructura creada (${ESTRUCTURA.length} sentencias).`, nuevo: true };
  }
  if (paso === 'semilla') {
    if (!(await hay('niveles'))) return { error: 'Primero, la estructura.' };
    const n = (await DB.prepare('SELECT COUNT(*) n FROM niveles').first()).n;
    if (n > 0) return { ok: true, hecho: 'Los datos iniciales ya estaban: no se han tocado.' };
    await DB.batch(SEMILLA.map(s => DB.prepare(s)));
    const c = await DB.prepare(`SELECT (SELECT COUNT(*) FROM niveles) niveles, (SELECT COUNT(*) FROM precios) precios,
      (SELECT COUNT(*) FROM perfiles) perfiles, (SELECT COUNT(*) FROM perfil_permisos) permisos,
      (SELECT COUNT(*) FROM beneficios) ventajas, (SELECT COUNT(*) FROM nivel_beneficios) casillas`).first();
    return { ok: true, hecho: 'Datos iniciales cargados.', recuento: c, nuevo: true };
  }
  if (paso === 'migrar') {
    // Cambios de estructura posteriores a la instalación (no borran nada; se aplican una vez).
    const hechos = [];
    if (!(await hay('zlabs_preinscripciones'))) { await DB.batch(ZLABS.map(s => DB.prepare(s))); hechos.push('tabla zlabs_preinscripciones'); }
    if (!(await hay('datos_personales'))) { await DB.batch(MIS_DATOS.map(s => DB.prepare(s))); hechos.push('tabla datos_personales (Mis datos)'); }
    for (const m of MIGRACIONES) {
      try { await DB.prepare(m.sql).run(); hechos.push(`${m.tabla}.${m.columna}`); }
      catch (e) { if (!/duplicate column/i.test(String(e.message || e))) throw e; }   // ya estaba
    }
    for (const m of DATOS) {
      const r = await DB.prepare(m.sql).run();
      if (r.meta.changes) hechos.push(m.nombre);
    }
    return { ok: true, hecho: hechos.length ? 'Actualizado: ' + hechos.join(', ') : 'La estructura ya estaba al día.', nuevo: hechos.length > 0 };
  }
  return { error: 'Paso desconocido' };
}

/** Pone la base al día de una vez (estructura, datos iniciales y cambios). La usa el filtro común en la web de pruebas
    al primer acceso tras cada subida (César, 29-10-2026: que no haga falta pulsar /instalar). */
export async function ponerAlDia(env) {
  const salida = [];
  for (const p of ['estructura', 'semilla', 'migrar']) { const r = await paso(env, p); if (r.error) throw new Error(r.error); if (r.nuevo) salida.push(r.hecho); }
  return salida;
}

export async function onRequestPost({ request, env }) {
  if (env.MODO !== 'pruebas') return json({ error: 'Solo en la web de pruebas' }, 403);
  let d; try { d = await request.json(); } catch { d = null; }
  try {
    const r = await paso(env, d && d.paso);
    return r.error ? json({ error: r.error }, 400) : json(r);
  } catch (e) {
    return json({ error: 'Ha fallado: ' + String(e.message || e).slice(0, 300) }, 500);
  }
}
