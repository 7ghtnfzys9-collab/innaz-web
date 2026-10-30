/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · SUSCRIPCIONES en la gestión interna · 28-10-2026 (reordenado por César el 28-10-2026 noche)
   GET  /api/gestion/suscripciones                    → opciones, permisos, pendientes de visto bueno, contadores
        /api/gestion/suscripciones?lista=1&q=&estado=&nivel=&orden=&pagina=   → listado de usuarios con filtros
        /api/gestion/suscripciones?usuario=id          → ficha: suscripción actual, solicitud pendiente e historial
   POST /api/gestion/suscripciones { accion, … }
        'gratuito'  {usuario, nivel, desde, hasta?, motivo, nota?}   acceso gratuito (solo si no tiene suscripción)    suscriptores.alta
        'pago'      {usuario, nivel, periodicidad, desde, forma, referencia?, importe?, cerrarGratuito?}  alta manual  suscriptores.alta
        'convertir' {id, motivo, hasta?, nota?}  pasar a gratuita la suscripción de pago actual                       suscriptores.alta
        'renovar' {id} · 'nivel' {id, nivel} · 'fin' {id, hasta?} · 'retirar' {id}                                    alta / editar
        'activar'   {id, forma, referencia?, importe?, desde?, prueba?}  marcar pagada una solicitud                  suscriptores.alta
        'anular'    {id}                                                                                              suscriptores.editar
        'aprobar' / 'rechazar' {pendiente, comentario?}                                                              cambios.aprobar
   Reglas (César, 28-10-2026):
   · UNA suscripción por persona: no se da un acceso gratuito ni un alta a quien ya tiene una; se cambia la que tiene.
     Al activar el pago de una solicitud se cierra el acceso gratuito o la prueba que tuviera.
   · Una MEJORA (solicitud con «mejora_de»): cuota anual nueva − pagado/12 × meses restantes; al pagar empieza un periodo nuevo (César, 29-10-2026).
   · Visto bueno de Presidencia para dar, alargar o convertir en gratuito si lo hace quien no tiene «cambios.aprobar».
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, json, nuevoId, anotar, limpiarTexto, correoVerificado } from '../../_lib/util.js';
import { exigirPermiso } from '../../_lib/gestion.js';
import { resumenBaja, eliminarCuenta, CONFIRMACION } from '../../_lib/baja.js';
import { enviar } from '../../_lib/correo.js';
import { NIVELES_PANEL, MOTIVOS, CAUSAS, FORMAS_PAGO, fechaMadrid, sumarPeriodo, situacion } from '../../_lib/suscripciones.js';
import { numeroCompleto, prefijoDe } from '../../_lib/numero.js';
import { actualDe, pendienteDe } from '../../_lib/solicitud.js';

async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }
const LANZAMIENTO_MAX = 50;   // los 50 primeros, 3 meses gratis (César, 26-10-2026)
const POR_PAGINA = 50;
const fechaTxt = s => s == null ? null : new Date(s * 1000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'numeric', year: 'numeric' });
const enlaceMi = (env, request) => (env.BASE_URL || new URL(request.url).origin) + '/mi-innaz';
const esAlumno = f => /Alumno/.test(f?.notas || '');
// Confirmación por correo de los cambios hechos desde la gestión (César, 29-10-2026)
async function avisarCambio(env, request, f, tipo, extra = {}) {
  const u = await env.DB.prepare('SELECT correo, nombre FROM usuarios WHERE id = ?').bind(f.usuario_id).first();
  if (!u) return;
  const niveles = await nombresNiveles(env);
  await enviar(env, 'aviso-cambio-suscripcion', u.correo, { tipo, nombre: u.nombre, nivel: niveles[extra.nivel || f.nivel] || f.nivel,
    antes: extra.antes ? niveles[extra.antes] : null, hasta: extra.hasta || null, numero: await numeroCompleto(env, f.usuario_id), enlace: enlaceMi(env, request) }).catch(() => {});
}
async function nombresNiveles(env) {
  return Object.fromEntries((await env.DB.prepare('SELECT clave, nombre FROM niveles').all()).results.map(x => [x.clave, x.nombre]));
}

// Filtros del listado. «v» = suscripción que ocupa a la persona; «p» = solicitud pendiente de pago.
const FILTROS = {
  todos:       { txt: 'Todos',                  sql: '1' },
  registrados: { txt: 'Solo registrados',       sql: 'vid IS NULL' },
  vigentes:    { txt: 'Con suscripción vigente', sql: 'vid IS NOT NULL AND valta <= :t' },
  pago:        { txt: 'De pago',                sql: "vid IS NOT NULL AND valta <= :t AND vgratuito = 0 AND vestado = 'activa'" },
  gratuitos:   { txt: 'Gratuitos',              sql: 'vid IS NOT NULL AND vgratuito = 1' },
  prueba:      { txt: 'Prueba gratis',          sql: "vid IS NOT NULL AND vestado = 'prueba'" },
  pendientes:  { txt: 'Pendientes de pago',     sql: 'pid IS NOT NULL' },
  porvencer:   { txt: 'Vencen en 30 días',      sql: 'vid IS NOT NULL AND vvence IS NOT NULL AND vvence <= :t + 2592000' },
  programadas: { txt: 'Programadas',            sql: 'vid IS NOT NULL AND valta > :t' },
  caducadas:   { txt: 'Caducadas o retiradas',  sql: 'vid IS NULL AND ultima_fin IS NOT NULL' },
};
const ORDENES = {
  recientes: 'creado DESC', nombre: "lower(coalesce(nombre, correo))", correo: 'lower(correo)', numero: 'cifras', vence: 'vvence IS NULL, vvence',
};
const BASE_SQL = `WITH base AS (
  SELECT u.id, u.correo, u.nombre, u.creado, u.numero cifras, u.estado cuenta,
         v.id vid, v.nivel vnivel, v.gratuito vgratuito, v.estado vestado, v.alta valta, v.vence vvence, v.periodicidad vper, v.motivo vmotivo,
         p.id pid, p.nivel pnivel, p.importe_cent pimporte, p.mejora_de pmejora,
         (SELECT MAX(x.vence) FROM suscripciones x WHERE x.usuario_id = u.id AND x.nivel <> 'registrado' AND x.estado <> 'pendiente_pago'
            AND x.vence IS NOT NULL AND x.vence <= :t AND x.alta <= x.vence) ultima_fin,
         (SELECT x.estado FROM suscripciones x WHERE x.usuario_id = u.id AND x.nivel <> 'registrado' AND x.estado <> 'pendiente_pago'
            AND x.vence IS NOT NULL AND x.vence <= :t AND x.alta <= x.vence ORDER BY x.vence DESC LIMIT 1) ultima_estado
    FROM usuarios u
    LEFT JOIN suscripciones v ON v.id = (SELECT s.id FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
         WHERE s.usuario_id = u.id AND s.nivel <> 'registrado' AND s.estado IN ('activa','prueba') AND (s.vence IS NULL OR s.vence > :t)
         ORDER BY (s.alta <= :t) DESC, n.orden DESC, s.gratuito ASC LIMIT 1)
    LEFT JOIN suscripciones p ON p.id = (SELECT id FROM suscripciones WHERE usuario_id = u.id AND estado = 'pendiente_pago' ORDER BY alta DESC LIMIT 1)
   WHERE u.estado <> 'baja')`;   // las cuentas eliminadas no aparecen (31-10-2026)
// D1 no admite parámetros con nombre: se sustituye :t por ?1
const conT = sql => sql.replace(/:t/g, '?1');

function estadoTexto(f, t) {
  if (!f.vid) return f.ultima_fin ? (f.ultima_estado === 'cancelada' ? 'retirada' : 'caducada') : 'registrado';   // retirada ≠ caducada (César, 29-10-2026)
  if (f.valta > t) return 'programada';
  if (f.vgratuito) return 'gratuito';
  if (f.vestado === 'prueba') return 'prueba gratis';
  return 'de pago';
}

export async function onRequestGet(ctx) {
  try { return await leer(ctx); }
  catch (e) {
    console.error('suscripciones (lectura):', e);
    const falta = /no such (column|table)/i.test(String(e.message || e));
    return json({ error: falta ? 'La base de datos no está al día: abre /instalar y pulsa el botón (paso «migrar»). Después recarga esta página.'
                               : 'No se ha podido cargar. Recarga la página; si se repite, avisa.' }, 500);
  }
}
async function leer({ request, env }) {
  const p = await exigirPermiso(env, request, 'suscriptores.ver');
  if (p instanceof Response) return p;
  const { permisos } = p, DB = env.DB, t = ahora(), url = new URL(request.url);
  const cobros = permisos.includes('cobros.ver'), aprobar = permisos.includes('cambios.aprobar');
  const niveles = await nombresNiveles(env);

  // ── Listado ──
  if (url.searchParams.get('lista')) {
    const filtro = FILTROS[url.searchParams.get('estado')] ? url.searchParams.get('estado') : 'todos';
    const orden = ORDENES[url.searchParams.get('orden')] ? url.searchParams.get('orden') : 'recientes';
    const nivel = NIVELES_PANEL.includes(url.searchParams.get('nivel')) ? url.searchParams.get('nivel') : '';
    const pagina = Math.max(1, Math.min(1000, Number(url.searchParams.get('pagina')) || 1));
    let q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const cond = [FILTROS[filtro].sql], args = [t];
    if (nivel) { cond.push(`${filtro === 'pendientes' ? 'pnivel' : 'vnivel'} = ?${args.length + 1}`); args.push(nivel); }
    if (q) {
      const cifras = q.replace(/^[a-z]{1,2}-?/, '');
      const patron = '%' + q.replace(/[%_\\]/g, c => '\\' + c) + '%';
      cond.push(`(lower(correo) LIKE ?${args.length + 1} ESCAPE '\\' OR lower(coalesce(nombre,'')) LIKE ?${args.length + 1} ESCAPE '\\'` +
                (/^\d{2,6}$/.test(cifras) ? ` OR cifras LIKE ?${args.length + 2}` : '') + ')');
      args.push(patron); if (/^\d{2,6}$/.test(cifras)) args.push(cifras + '%');
    }
    const where = cond.join(' AND ');
    // Auditoría 29-10-2026: filas y total en UNA consulta (COUNT(*) OVER ()), y los contadores a la vez: dos consultas en vez de tres.
    const [rFilas, rCuentas] = await DB.batch([
      DB.prepare(conT(`${BASE_SQL} SELECT *, COUNT(*) OVER () total_filas FROM base WHERE ${where} ORDER BY ${ORDENES[orden]} LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`)).bind(...args),
      DB.prepare(conT(`${BASE_SQL} SELECT ` + Object.entries(FILTROS).map(([k, f]) => `SUM(CASE WHEN ${f.sql} THEN 1 ELSE 0 END) "${k}"`).join(', ') + ' FROM base')).bind(t),
    ]);
    const filas = rFilas.results, cuentas = rCuentas.results[0];
    // Página más allá del final (p. ej. tras borrar filtros): el total se pide aparte
    const total = filas.length ? filas[0].total_filas
      : (await DB.prepare(conT(`${BASE_SQL} SELECT COUNT(*) n FROM base WHERE ${where}`)).bind(...args).first()).n;
    return json({ total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)), cuentas,
      filas: filas.map(f => ({ id: f.id, correo: f.correo, nombre: f.nombre, alta: fechaTxt(f.creado), cuenta: f.cuenta,
        numero: f.cifras ? prefijoDe(f.vid && f.valta <= t ? { nivel: f.vnivel, gratuito: f.vgratuito } : null) + '-' + f.cifras : null,
        nivel: f.vid ? niveles[f.vnivel] : null, estado: estadoTexto(f, t), periodicidad: f.vper, hasta: fechaTxt(f.vvence), sinFin: !!f.vid && f.vvence == null,
        motivo: f.vgratuito ? (MOTIVOS[f.vmotivo] || null) : null,
        pendiente: f.pid ? { nivel: niveles[f.pnivel], importe: f.pimporte != null ? f.pimporte / 100 : null, mejora: !!f.pmejora } : null })) });
  }

  // ── Ficha ──
  const uid = url.searchParams.get('usuario');
  if (uid) {
    const u = await DB.prepare('SELECT id, correo, nombre, estado, creado FROM usuarios WHERE id = ?').bind(uid).first();
    if (!u || u.estado === 'baja') return json({ error: 'No existe esa persona.' }, 404);
    const filas = (await DB.prepare(
      `SELECT s.*, (SELECT correo FROM usuarios WHERE id = s.creado_por) creado_por_correo FROM suscripciones s
        WHERE s.usuario_id = ? AND s.nivel <> 'registrado' ORDER BY s.alta DESC`).bind(uid).all()).results;
    const a = await actualDe(env, uid, t), pe = await pendienteDe(env, uid);
    const lanzUsados = (await DB.prepare('SELECT COUNT(*) n FROM suscripciones WHERE lanzamiento = 1').first()).n;
    const fila = f => ({ id: f.id, nivel: f.nivel, nivelNombre: niveles[f.nivel] || f.nivel, periodicidad: f.periodicidad,
      desde: fechaTxt(f.alta), hasta: fechaTxt(f.vence), situacion: situacion(f, t), gratuito: !!f.gratuito, prueba: f.estado === 'prueba',
      motivo: f.gratuito ? (MOTIVOS[f.motivo] || f.motivo) : null, notas: f.notas, por: f.creado_por_correo, alumno: esAlumno(f),
      ...(cobros ? { forma: f.origen_pago, referencia: f.ref_pago, importe: f.importe_cent != null ? f.importe_cent / 100 : null } : {}) });
    return json({ usuario: { ...u, alta: fechaTxt(u.creado), numero: await numeroCompleto(env, u.id, t) },
      actual: a ? fila(filas.find(x => x.id === a.id) || a) : null,
      pendiente: pe ? { ...fila(filas.find(x => x.id === pe.id) || pe), mejora: !!pe.mejora_de,
        lanzamiento: !pe.mejora_de && ['simpatizante', 'colaborador'].includes(pe.nivel) && !esAlumno(pe) && lanzUsados < LANZAMIENTO_MAX } : null,
      historial: filas.filter(f => f.id !== a?.id && f.id !== pe?.id).map(fila),
      baja: permisos.includes('cuentas.eliminar') ? await resumenBaja(env, uid, t) : null });   // 31-10-2026: eliminar la cuenta
  }

  // ── Portada de la pestaña ──
  const pendientes = (await DB.prepare(
    `SELECT c.id, c.tipo, c.objeto, c.datos, c.propuesto_en, u.correo propuesto_por, d.correo persona
       FROM cambios_pendientes c JOIN usuarios u ON u.id = c.propuesto_por LEFT JOIN usuarios d ON d.id = c.objeto
      WHERE c.estado = 'pendiente' AND c.tipo LIKE 'suscripcion.%' ${aprobar ? '' : 'AND c.propuesto_por = ?'}
      ORDER BY c.propuesto_en`).bind(...(aprobar ? [] : [p.s.usuario.id])).all()).results;
  const lanzUsados = (await DB.prepare('SELECT COUNT(*) n FROM suscripciones WHERE lanzamiento = 1').first()).n;
  // Códigos de centro (César, 29-10-2026)
  const codigos = permisos.includes('estudiantes.codigos') ? (await DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM suscripciones s WHERE s.notas LIKE '%código ' || c.codigo || ' %') usos FROM codigos_centro c ORDER BY c.activo DESC, c.hasta DESC, c.centro`).all()).results
    .map(c => ({ codigo: c.codigo, centro: c.centro, curso: c.curso, hasta: fechaTxt(c.hasta), vigente: !!c.activo && c.hasta > t, activo: !!c.activo, usos: c.usos })) : null;
  const TIPO = { 'suscripcion.gratuito': 'Acceso gratuito', 'suscripcion.fin': 'Alargar acceso gratuito', 'suscripcion.convertir': 'Pasar a gratuita' };
  return json({
    pendientes: pendientes.map(c => { const d = JSON.parse(c.datos); return { id: c.id, tipo: c.tipo, tipoTexto: TIPO[c.tipo] || c.tipo, persona: c.persona, usuario: c.objeto,
      propuestoPor: c.propuesto_por, propuestoEn: fechaTxt(c.propuesto_en), nivel: d.nivel ? niveles[d.nivel] : null, desde: d.desde ? fechaTxt(d.desde) : null,
      hasta: d.hasta ? fechaTxt(d.hasta) : 'sin fin', motivo: d.motivo ? MOTIVOS[d.motivo] : null, nota: d.nota || null }; }),
    filtros: Object.entries(FILTROS).map(([clave, f]) => ({ clave, nombre: f.txt })),
    lanzamiento: { usados: lanzUsados, max: LANZAMIENTO_MAX },
    codigos,
    opciones: { niveles: NIVELES_PANEL.map(k => ({ clave: k, nombre: niveles[k] || k })), motivos: Object.entries(MOTIVOS).map(([clave, nombre]) => ({ clave, nombre })),
      formas: FORMAS_PAGO },
    puede: { alta: permisos.includes('suscriptores.alta'), editar: permisos.includes('suscriptores.editar'), aprobar, cobros, codigos: permisos.includes('estudiantes.codigos') },
  });
}

// ── Aplicar cambios (también al aprobar uno pendiente) ─────────────────
async function aplicarGratuito(env, request, d, porId, aprobadoPor = null) {
  const t = ahora(), id = nuevoId();
  const notas = [d.nota, aprobadoPor ? `Visto bueno de ${aprobadoPor}` : null].filter(Boolean).join(' · ') || null;
  await env.DB.prepare(
    `INSERT INTO suscripciones (id, usuario_id, nivel, numero, periodicidad, alta, vence, estado, renovacion_auto, notas, creado_por, gratuito, motivo)
     VALUES (?,?,?,NULL,NULL,?,?,'activa',0,?,?,1,?)`)
    .bind(id, d.usuario, d.nivel, d.desde, d.hasta ?? null, notas, porId, d.motivo).run();
  await anotarSeguro(env, porId, 'suscripcion.gratuito', d.usuario, { id, nivel: d.nivel, desde: d.desde, hasta: d.hasta ?? null, motivo: d.motivo });
  await avisarGratuito(env, request, d.usuario, d.nivel, d.desde, d.hasta, d.motivo);
  return id;
}
async function avisarGratuito(env, request, usuarioId, nivel, desde, hasta, motivo) {
  const t = ahora(), u = await env.DB.prepare('SELECT correo, nombre FROM usuarios WHERE id = ?').bind(usuarioId).first();
  const niveles = await nombresNiveles(env);
  await enviar(env, 'aviso-suscripcion', u.correo, { tipo: 'gratuito', nombre: u.nombre, nivel: niveles[nivel], desde: desde > t ? fechaTxt(desde) : null,
    hasta: fechaTxt(hasta ?? null), causa: CAUSAS[motivo] || null, numero: desde > t ? null : await numeroCompleto(env, usuarioId),
    enlace: enlaceMi(env, request) }).catch(() => {});
}
async function aplicarFin(env, f, hasta, porId, aprobadoPor = null) {
  await env.DB.prepare(`UPDATE suscripciones SET vence = ?, notas = trim(coalesce(notas,'') || ?) WHERE id = ?`)
    .bind(hasta ?? null, ` · Fin cambiado a ${fechaTxt(hasta) || 'sin fin'}${aprobadoPor ? ' (visto bueno de ' + aprobadoPor + ')' : ''}`, f.id).run();
  await anotarSeguro(env, porId, 'suscripcion.fin', f.usuario_id, { id: f.id, antes: f.vence, hasta: hasta ?? null });
}
async function aplicarConvertir(env, request, f, d, porId, aprobadoPor = null) {
  const nota = [`Pasa a gratuita (antes de pago${f.periodicidad ? ', ' + f.periodicidad : ''})`, d.nota, aprobadoPor ? `visto bueno de ${aprobadoPor}` : null].filter(Boolean).join(' · ');
  await env.DB.prepare(`UPDATE suscripciones SET gratuito = 1, motivo = ?, vence = ?, renovacion_auto = 0, notas = trim(coalesce(notas,'') || ' · ' || ?) WHERE id = ?`)
    .bind(d.motivo, d.hasta ?? null, nota, f.id).run();
  await anotarSeguro(env, porId, 'suscripcion.convertir', f.usuario_id, { id: f.id, motivo: d.motivo, hasta: d.hasta ?? null });
  await avisarGratuito(env, request, f.usuario_id, f.nivel, f.alta, d.hasta, d.motivo);
}
/** Cierra (desde ahora) las suscripciones que ocupan a la persona, salvo la indicada. */
async function cerrarOtras(env, usuarioId, salvoId, motivoTxt) {
  const t = ahora();
  return env.DB.prepare(`UPDATE suscripciones SET estado = 'cancelada', vence = ?1, notas = trim(coalesce(notas,'') || ' · ' || ?2)
     WHERE usuario_id = ?3 AND id <> ?4 AND nivel <> 'registrado' AND estado IN ('activa','prueba') AND (vence IS NULL OR vence > ?1)`)
    .bind(t, motivoTxt, usuarioId, salvoId || '').run();
}
const proponer = async (env, DB, tipo, objeto, datos, yoId, t) => {
  const id = nuevoId();
  await DB.prepare(`INSERT INTO cambios_pendientes (id, tipo, objeto, datos, propuesto_por, propuesto_en) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, tipo, objeto, JSON.stringify(datos), yoId, t).run();
  await anotarSeguro(env, yoId, 'cambio.proponer', objeto, { tipo, pendiente: id });
};
function leerGratuito(d, desdeMin) {
  if (!MOTIVOS[d.motivo]) return { error: 'Elige el motivo del acceso gratuito.' };
  const nota = limpiarTexto(d.nota, 200) || null;
  if (d.motivo === 'otro' && !nota) return { error: 'Con el motivo «Otro», explica cuál en la nota.' };
  let hasta = null;
  if (d.hasta) { hasta = fechaMadrid(d.hasta, true); if (hasta == null) return { error: 'Fecha de fin no válida.' };
    if (hasta <= desdeMin) return { error: 'La fecha de fin tiene que ser posterior a la de inicio y a hoy.' }; }
  return { motivo: d.motivo, nota, hasta };
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos.' }, 400);
  const NECESITA = { gratuito: 'suscriptores.alta', pago: 'suscriptores.alta', convertir: 'suscriptores.alta', renovar: 'suscriptores.alta',
                     nivel: 'suscriptores.editar', fin: 'suscriptores.editar', retirar: 'suscriptores.editar', activar: 'suscriptores.alta',
                     anular: 'suscriptores.editar', aprobar: 'cambios.aprobar', rechazar: 'cambios.aprobar',
                     codigo_crear: 'estudiantes.codigos', codigo_activo: 'estudiantes.codigos', eliminar: 'cuentas.eliminar' };
  if (!NECESITA[d.accion]) return json({ error: 'Acción desconocida.' }, 400);
  const p = await exigirPermiso(env, request, NECESITA[d.accion]);
  if (p instanceof Response) return p;
  const { s, permisos } = p, DB = env.DB, t = ahora(), yo = s.usuario;
  const aprobador = permisos.includes('cambios.aprobar');
  const niveles = await nombresNiveles(env);

  try {
    // ── Eliminar la cuenta de una persona (César, 31-10-2026; ver functions/_lib/baja.js) ──
    if (d.accion === 'eliminar') {
      if (String(d.confirmar || '').trim().toUpperCase() !== CONFIRMACION) return json({ error: `Escribe ${CONFIRMACION} para confirmar.`, campo: 'confirmar' }, 400);
      if (String(d.usuario || '') === yo.id) return json({ error: 'Tu propia cuenta no se elimina desde aquí: hazlo desde Mi INNAZ.' }, 400);
      const r = await eliminarCuenta(env, request, String(d.usuario || ''), { tipo: 'gestion', id: yo.id, correo: yo.correo });
      if (r.error) return json({ error: r.error }, r.status || 400);
      return json({ ok: true, mensaje: `Cuenta ${r.numero || ''} eliminada. Se le ha enviado un correo de aviso.`.replace('  ', ' ') });
    }
    // ── Códigos de centro por curso (César, 29-10-2026) ──
    if (d.accion === 'codigo_crear') {
      const centro = limpiarTexto(d.centro, 150);
      if (!centro) return json({ error: 'Escribe el nombre del centro.' }, 400);
      const m = String(d.curso || '').trim().match(/^(20\d{2})\s*[-/]\s*(\d{2}|20\d{2})$/);
      if (!m || (Number(m[2].slice(-2)) !== (Number(m[1]) + 1) % 100)) return json({ error: 'El curso se escribe así: 2026-27.' }, 400);
      const a1 = Number(m[1]), curso = `${a1}-${String((a1 + 1) % 100).padStart(2, '0')}`;
      const hasta = d.hasta ? fechaMadrid(d.hasta, true) : fechaMadrid(`${a1 + 1}-08-31`, true);   // por defecto, 31 de agosto
      if (hasta == null || hasta <= t) return json({ error: 'La fecha de fin no es válida o ya ha pasado.' }, 400);
      const sigla = centro.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z0-9]+/)
        .filter(w => w && !/^(de|del|la|las|el|los|y|e)$/i.test(w)).map(w => w[0].toUpperCase()).join('').slice(0, 6) || 'CENTRO';
      let codigo = String(d.codigo || '').trim().toUpperCase().replace(/\s+/g, '') || `${sigla}-${String(a1 % 100).padStart(2, '0')}${String((a1 + 1) % 100).padStart(2, '0')}`;
      if (!/^[A-Z0-9-]{3,20}$/.test(codigo)) return json({ error: 'El código solo puede llevar letras, números y guiones (3 a 20).' }, 400);
      if (await DB.prepare('SELECT 1 FROM codigos_centro WHERE codigo = ?').bind(codigo).first()) return json({ error: `El código ${codigo} ya existe: escribe otro.` }, 409);
      await DB.prepare('INSERT INTO codigos_centro (codigo, centro, curso, hasta, activo, creado, creado_por) VALUES (?,?,?,?,1,?,?)').bind(codigo, centro, curso, hasta, t, yo.id).run();
      await anotarSeguro(env, yo.id, 'codigo.crear', null, { codigo, centro, curso });
      return json({ ok: true, mensaje: `Código ${codigo} creado para ${centro} (curso ${curso}, vale hasta el ${fechaTxt(hasta)}). Envíaselo al centro para sus alumnos.` });
    }
    if (d.accion === 'codigo_activo') {
      const r = await DB.prepare('UPDATE codigos_centro SET activo = ? WHERE codigo = ?').bind(d.activo ? 1 : 0, String(d.codigo || '')).run();
      if (!r.meta.changes) return json({ error: 'No existe ese código.' }, 404);
      await anotarSeguro(env, yo.id, d.activo ? 'codigo.activar' : 'codigo.desactivar', null, { codigo: d.codigo });
      return json({ ok: true, mensaje: d.activo ? 'Código activado.' : 'Código desactivado: ya no se puede usar en solicitudes nuevas.' });
    }

    // ── Altas: acceso gratuito y alta manual de pago (solo a quien no tiene suscripción) ──
    if (d.accion === 'gratuito' || d.accion === 'pago') {
      const u = await DB.prepare('SELECT id, correo, nombre, estado FROM usuarios WHERE id = ?').bind(String(d.usuario || '')).first();
      if (!u) return json({ error: 'Esa persona no está registrada. Tiene que registrarse antes en innaz.es.' }, 404);
      if (u.estado !== 'activo') return json({ error: 'La cuenta de esa persona no está activa.' }, 400);
      if (!(await correoVerificado(env, u.id))) return json({ error: 'Esa persona aún no ha confirmado su correo (creó la cuenta con Face ID). Pídele que pulse el enlace que le llegó.' }, 409);
      if (!NIVELES_PANEL.includes(d.nivel)) return json({ error: 'Elige un nivel.' }, 400);
      const desde = fechaMadrid(d.desde || '');
      if (desde == null) return json({ error: 'Fecha de inicio no válida.' }, 400);
      const a = await actualDe(env, u.id, t);

      if (d.accion === 'gratuito') {
        if (a) return json({ error: `Ya tiene una suscripción (${a.nivel_nombre}${a.gratuito ? ', gratuita' : ''}). Una sola por persona: cámbiala en su ficha (nivel, fin o «Pasar a gratuita»).` }, 409);
        const g = leerGratuito(d, Math.max(desde, t)); if (g.error) return json({ error: g.error }, 400);
        const datos = { usuario: u.id, nivel: d.nivel, desde, ...g };
        if (!aprobador) {
          await proponer(env, DB, 'suscripcion.gratuito', u.id, datos, yo.id, t);
          return json({ ok: true, pendiente: true, mensaje: `Acceso gratuito de ${niveles[d.nivel]} para ${u.correo} propuesto. Queda pendiente del visto bueno de Presidencia.` });
        }
        await aplicarGratuito(env, request, datos, yo.id);
        return json({ ok: true, mensaje: `Acceso gratuito de ${niveles[d.nivel]} para ${u.correo} ${desde > t ? 'desde el ' + fechaTxt(desde) + ' ' : ''}${g.hasta ? 'hasta el ' + fechaTxt(g.hasta) : 'sin fecha de fin'}. Su número ahora: ${await numeroCompleto(env, u.id)}. Se le ha avisado por correo.` });
      }

      // pago (alta manual)
      if (a && !a.gratuito && a.estado !== 'prueba') return json({ error: `Ya tiene una suscripción de pago (${a.nivel_nombre}). Una sola por persona: renuévala o cámbiale el nivel en su ficha.` }, 409);
      if (a && !d.cerrarGratuito) return json({ aviso: true, error: `Tiene ${a.gratuito ? 'acceso gratuito' : 'prueba gratis'} de ${a.nivel_nombre}${a.vence ? ' hasta el ' + fechaTxt(a.vence) : ''}. Al darle el alta de pago, terminará hoy. Pulsa otra vez para confirmarlo.` }, 409);
      if (!['mensual', 'anual'].includes(d.periodicidad)) return json({ error: 'Elige mensual o anual.' }, 400);
      if (d.nivel === 'mecenas' && d.periodicidad !== 'anual') return json({ error: 'Mecenas solo es anual.' }, 400);
      if (!FORMAS_PAGO.includes(d.forma)) return json({ error: 'Elige la forma de pago.' }, 400);
      let importe = null;
      if (d.importe !== undefined && d.importe !== null && d.importe !== '') {
        const n = Number(String(d.importe).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 100000) return json({ error: 'Importe no válido.' }, 400);
        importe = Math.round(n * 100);
      }
      const vence = sumarPeriodo(desde, d.periodicidad);
      if (vence <= t) return json({ error: 'Con esa fecha de inicio la suscripción ya habría vencido.' }, 400);
      const id = nuevoId();
      if (a) await cerrarOtras(env, u.id, null, 'Cerrada al dar el alta de pago');
      await DB.prepare(
        `INSERT INTO suscripciones (id, usuario_id, nivel, numero, periodicidad, alta, vence, estado, renovacion_auto, origen_pago, ref_pago, importe_cent, notas, creado_por, gratuito)
         VALUES (?,?,?,NULL,?,?,?,'activa',0,?,?,?,?,?,0)`)
        .bind(id, u.id, d.nivel, d.periodicidad, desde, vence, d.forma, limpiarTexto(d.referencia, 80) || null, importe, 'Alta manual', yo.id).run();
      const numero = await numeroCompleto(env, u.id);
      await anotarSeguro(env, yo.id, 'suscripcion.alta', u.id, { id, nivel: d.nivel, periodicidad: d.periodicidad, numero, cierraGratuito: !!a });
      await enviar(env, 'aviso-suscripcion', u.correo, { tipo: 'pago', nombre: u.nombre, nivel: niveles[d.nivel], numero,
        desde: desde > t ? fechaTxt(desde) : null, hasta: fechaTxt(vence), enlace: enlaceMi(env, request) }).catch(() => {});
      return json({ ok: true, mensaje: `Alta de ${niveles[d.nivel]} (${d.periodicidad}) para ${u.correo} hasta el ${fechaTxt(vence)}. Su número ahora: ${numero}. Se le ha avisado por correo.` });
    }

    // ── Visto bueno ──
    if (d.accion === 'aprobar' || d.accion === 'rechazar') {
      const c = await DB.prepare(`SELECT * FROM cambios_pendientes WHERE id = ? AND estado = 'pendiente' AND tipo LIKE 'suscripcion.%'`).bind(String(d.pendiente || '')).first();
      if (!c) return json({ error: 'Ese cambio ya no está pendiente.' }, 404);
      const comentario = limpiarTexto(d.comentario, 200) || null;
      const r = await DB.prepare(`UPDATE cambios_pendientes SET estado = ?, revisado_por = ?, revisado_en = ?, comentario = ? WHERE id = ? AND estado = 'pendiente'`)
        .bind(d.accion === 'aprobar' ? 'aprobado' : 'rechazado', yo.id, t, comentario, c.id).run();
      if (!r.meta.changes) return json({ error: 'Ese cambio ya no está pendiente.' }, 409);
      await anotarSeguro(env, yo.id, d.accion === 'aprobar' ? 'cambio.aprobar' : 'cambio.rechazar', c.objeto, { pendiente: c.id, tipo: c.tipo });
      if (d.accion === 'rechazar') return json({ ok: true, mensaje: 'Cambio rechazado.' });
      const datos = JSON.parse(c.datos);
      if (c.tipo === 'suscripcion.gratuito') {
        if (datos.hasta && datos.hasta <= t) return json({ ok: true, mensaje: 'Aprobado, pero la fecha de fin ya había pasado: no se ha dado el acceso.' });
        if (await actualDe(env, datos.usuario, t)) return json({ ok: true, mensaje: 'Aprobado, pero mientras tanto esa persona ha pasado a tener una suscripción: no se ha dado el acceso (una sola por persona).' });
        await aplicarGratuito(env, request, datos, c.propuesto_por, yo.correo);
        return json({ ok: true, mensaje: 'Aprobado: acceso gratuito concedido y avisada la persona.' });
      }
      const f = await DB.prepare('SELECT * FROM suscripciones WHERE id = ?').bind(datos.id).first();
      if (!f || f.estado === 'cancelada' || (f.vence != null && f.vence <= t)) return json({ ok: true, mensaje: 'Aprobado, pero esa suscripción ya no está vigente: no se ha cambiado nada.' });
      if (c.tipo === 'suscripcion.fin') { await aplicarFin(env, f, datos.hasta, c.propuesto_por, yo.correo); return json({ ok: true, mensaje: 'Aprobado: fecha de fin cambiada.' }); }
      if (c.tipo === 'suscripcion.convertir') { await aplicarConvertir(env, request, f, datos, c.propuesto_por, yo.correo); return json({ ok: true, mensaje: 'Aprobado: la suscripción pasa a gratuita y se ha avisado a la persona.' }); }
      return json({ error: 'Tipo de cambio desconocido.' }, 400);
    }

    // ── Cambios sobre una suscripción existente ──
    const f = await DB.prepare('SELECT * FROM suscripciones WHERE id = ?').bind(String(d.id || '')).first();
    if (!f || f.nivel === 'registrado') return json({ error: 'No existe esa suscripción.' }, 404);
    if (f.estado === 'cancelada') return json({ error: 'Esa suscripción está retirada.' }, 400);
    if ((d.accion === 'activar' || d.accion === 'anular') !== (f.estado === 'pendiente_pago'))
      return json({ error: f.estado === 'pendiente_pago' ? 'Es una solicitud pendiente de pago: primero márcala como pagada.' : 'Esa suscripción no está pendiente de pago.' }, 400);

    if (d.accion === 'activar') {
      const desde = d.desde ? fechaMadrid(d.desde) : t;
      if (desde == null) return json({ error: 'Fecha de pago no válida.' }, 400);
      const u = await DB.prepare('SELECT correo, nombre FROM usuarios WHERE id = ?').bind(f.usuario_id).first();
      if (d.prueba) {   // lanzamiento: 3 meses gratis
        if (f.mejora_de) return json({ error: 'Una mejora de nivel no tiene los 3 meses gratis.' }, 400);
        if (!['simpatizante', 'colaborador'].includes(f.nivel)) return json({ error: 'Los 3 meses gratis son solo para Simpatizante y Colaborador.' }, 400);
        if (esAlumno(f)) return json({ error: 'Los 3 meses gratis no se aplican a los alumnos de conservatorios y escuelas asociadas.' }, 400);
        const usados = (await DB.prepare('SELECT COUNT(*) n FROM suscripciones WHERE lanzamiento = 1').first()).n;
        if (usados >= LANZAMIENTO_MAX) return json({ error: `Ya se han dado los ${LANZAMIENTO_MAX} lanzamientos.` }, 400);
        const v = new Date(desde * 1000); v.setUTCMonth(v.getUTCMonth() + 3); const vence = Math.floor(v.getTime() / 1000);
        await cerrarOtras(env, f.usuario_id, f.id, 'Cerrada al activar su suscripción');
        const rp = await DB.prepare(`UPDATE suscripciones SET estado = 'prueba', alta = ?, vence = ?, prueba_hasta = ?, lanzamiento = 1, creado_por = ?,
                          notas = trim(coalesce(notas,'') || ' · Lanzamiento: 3 meses gratis') WHERE id = ? AND estado = 'pendiente_pago'`)
          .bind(desde, vence, vence, yo.id, f.id).run();
        if (!rp.meta.changes) return json({ error: 'Esa solicitud ya se ha activado (quizá otra persona un momento antes).' }, 409);
        await anotarSeguro(env, yo.id, 'suscripcion.prueba', f.usuario_id, { id: f.id, nivel: f.nivel, vence });
        await enviar(env, 'aviso-suscripcion', u.correo, { tipo: 'prueba', nombre: u.nombre, nivel: niveles[f.nivel], hasta: fechaTxt(vence),
          numero: await numeroCompleto(env, f.usuario_id), enlace: enlaceMi(env, request) }).catch(() => {});
        return json({ ok: true, mensaje: `Activada con 3 meses gratis (lanzamiento ${usados + 1} de ${LANZAMIENTO_MAX}) hasta el ${fechaTxt(vence)}.` });
      }
      if (!FORMAS_PAGO.includes(d.forma)) return json({ error: 'Elige la forma de pago.' }, 400);
      let importe = f.importe_cent;
      if (d.importe !== undefined && d.importe !== null && d.importe !== '') {
        const n = Number(String(d.importe).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0 || n > 1000000) return json({ error: 'Importe no válido.' }, 400);
        importe = Math.round(n * 100);
      }
      let vence;
      if (f.mejora_de) {   // mejora (César, 29-10-2026): se cierra la anterior y empieza un periodo nuevo desde el pago
        const m = await DB.prepare('SELECT * FROM suscripciones WHERE id = ?').bind(f.mejora_de).first();
        if (!m || m.estado === 'cancelada' || !m.vence || m.vence <= t)
          return json({ error: 'La suscripción que mejoraba ya no está vigente (el descuento ya no vale). Anula esta solicitud y que pida una nueva.' }, 409);
        vence = sumarPeriodo(desde, f.periodicidad);
        await cerrarOtras(env, f.usuario_id, f.id, `Mejorada a ${niveles[f.nivel]}`);
      } else {
        vence = sumarPeriodo(desde, f.periodicidad);
        if (vence <= t) return json({ error: 'Con esa fecha de pago ya habría vencido.' }, 400);
        await cerrarOtras(env, f.usuario_id, f.id, 'Cerrada al activar la suscripción de pago');
      }
      const ra = await DB.prepare(`UPDATE suscripciones SET estado = 'activa', alta = ?, vence = ?, origen_pago = ?, ref_pago = ?, importe_cent = ?, creado_por = ?
                         WHERE id = ? AND estado = 'pendiente_pago'`)
        .bind(desde, vence, d.forma, limpiarTexto(d.referencia, 80) || null, importe, yo.id, f.id).run();
      if (!ra.meta.changes) return json({ error: 'Esa solicitud ya se ha activado (quizá otra persona un momento antes).' }, 409);
      await anotarSeguro(env, yo.id, 'suscripcion.activar', f.usuario_id, { id: f.id, nivel: f.nivel, importe, forma: d.forma, mejora: !!f.mejora_de });
      await enviar(env, 'aviso-suscripcion', u.correo, { tipo: 'pago', nombre: u.nombre, nivel: niveles[f.nivel], hasta: fechaTxt(vence),
        numero: await numeroCompleto(env, f.usuario_id), enlace: enlaceMi(env, request) }).catch(() => {});
      return json({ ok: true, mensaje: `${f.mejora_de ? 'Mejora pagada' : 'Pagada'} y activada hasta el ${fechaTxt(vence)}. Su número ahora: ${await numeroCompleto(env, f.usuario_id)}.` });
    }
    if (d.accion === 'anular') {
      await DB.prepare(`UPDATE suscripciones SET estado = 'cancelada', vence = ?, notas = trim(coalesce(notas,'') || ' · Solicitud anulada') WHERE id = ?`).bind(t, f.id).run();
      await anotarSeguro(env, yo.id, 'suscripcion.anular', f.usuario_id, { id: f.id });
      await avisarCambio(env, request, f, 'anulada');
      return json({ ok: true, mensaje: 'Solicitud anulada. Se le ha avisado por correo.' });
    }
    if (d.accion === 'convertir') {
      if (f.gratuito || f.estado !== 'activa') return json({ error: 'Solo se pasa a gratuita una suscripción de pago vigente.' }, 400);
      const g = leerGratuito(d, t); if (g.error) return json({ error: g.error }, 400);
      if (!aprobador) {
        await proponer(env, DB, 'suscripcion.convertir', f.usuario_id, { id: f.id, nivel: f.nivel, ...g }, yo.id, t);
        return json({ ok: true, pendiente: true, mensaje: 'Pasar a gratuita necesita el visto bueno de Presidencia: queda pendiente.' });
      }
      await aplicarConvertir(env, request, f, g, yo.id);
      return json({ ok: true, mensaje: `Pasa a gratuita (${MOTIVOS[g.motivo]}), ${g.hasta ? 'hasta el ' + fechaTxt(g.hasta) : 'sin fecha de fin'}. Se le ha avisado por correo.` });
    }
    if (d.accion === 'renovar') {
      if (f.gratuito || !f.periodicidad || f.estado === 'prueba') return json({ error: 'Solo se renuevan las suscripciones de pago. En un acceso gratuito, cambia la fecha de fin.' }, 400);
      const vence = sumarPeriodo(Math.max(f.vence || t, t), f.periodicidad);
      await DB.prepare(`UPDATE suscripciones SET vence = ?, estado = 'activa' WHERE id = ?`).bind(vence, f.id).run();
      await anotarSeguro(env, yo.id, 'suscripcion.renovar', f.usuario_id, { id: f.id, antes: f.vence, vence });
      await avisarCambio(env, request, f, 'renovada', { hasta: fechaTxt(vence) });
      return json({ ok: true, mensaje: `Renovada hasta el ${fechaTxt(vence)}. Se le ha avisado por correo.` });
    }
    if (d.accion === 'nivel') {
      if (!NIVELES_PANEL.includes(d.nivel)) return json({ error: 'Elige un nivel.' }, 400);
      if (d.nivel === 'mecenas' && f.periodicidad === 'mensual') return json({ error: 'Mecenas solo es anual.' }, 400);
      if (d.nivel === f.nivel) return json({ ok: true, mensaje: 'Ya tenía ese nivel.' });
      if (f.gratuito && !aprobador && NIVELES_PANEL.indexOf(d.nivel) > NIVELES_PANEL.indexOf(f.nivel))
        return json({ error: 'Subir el nivel de un acceso gratuito necesita el visto bueno de Presidencia.' }, 403);
      await DB.prepare('UPDATE suscripciones SET nivel = ?, notas = trim(coalesce(notas,\'\') || ?) WHERE id = ?')
        .bind(d.nivel, ` · Nivel cambiado de ${niveles[f.nivel]} a ${niveles[d.nivel]} en la gestión`, f.id).run();
      await anotarSeguro(env, yo.id, 'suscripcion.nivel', f.usuario_id, { id: f.id, antes: f.nivel, nivel: d.nivel });
      await avisarCambio(env, request, f, 'nivel', { nivel: d.nivel, antes: f.nivel });
      return json({ ok: true, mensaje: `Nivel cambiado a ${niveles[d.nivel]} (sin cobro: es una corrección; para una mejora con cobro, la persona la pide en la web). Se le ha avisado por correo.` });
    }
    if (d.accion === 'fin') {
      if (!f.gratuito) return json({ error: 'La fecha de fin solo se cambia en los accesos gratuitos. Una suscripción de pago se renueva.' }, 400);
      let hasta = null;
      if (d.hasta) { hasta = fechaMadrid(d.hasta, true); if (hasta == null) return json({ error: 'Fecha de fin no válida.' }, 400);
        if (hasta <= Math.max(f.alta, t)) return json({ error: 'La fecha de fin tiene que ser posterior a hoy y al inicio. Para quitarlo ya, usa «Retirar».' }, 400); }
      const alarga = hasta === null ? f.vence !== null : (f.vence !== null && hasta > f.vence);
      if (alarga && !aprobador) {
        await proponer(env, DB, 'suscripcion.fin', f.usuario_id, { id: f.id, hasta, nivel: f.nivel, motivo: f.motivo }, yo.id, t);
        return json({ ok: true, pendiente: true, mensaje: 'Alargar un acceso gratuito necesita el visto bueno de Presidencia: queda pendiente.' });
      }
      await aplicarFin(env, f, hasta, yo.id);
      return json({ ok: true, mensaje: `Fecha de fin: ${fechaTxt(hasta) || 'sin fin'}.` });
    }
    if (d.accion === 'retirar') {
      await DB.prepare(`UPDATE suscripciones SET estado = 'cancelada', vence = CASE WHEN vence IS NULL OR vence > ?1 THEN ?1 ELSE vence END,
                        notas = trim(coalesce(notas,'') || ?2) WHERE id = ?3`).bind(t, ` · Retirada el ${fechaTxt(t)}`, f.id).run();
      await anotarSeguro(env, yo.id, 'suscripcion.retirar', f.usuario_id, { id: f.id, nivel: f.nivel, gratuito: !!f.gratuito });
      await avisarCambio(env, request, f, 'retirada');
      return json({ ok: true, mensaje: 'Retirada desde hoy. La persona pasa a Registrado. Se le ha avisado por correo.' });
    }
    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error('suscripciones:', e);
    return json({ error: 'No se ha podido completar. Prueba otra vez; si se repite, avisa.' }, 500);
  }
}
