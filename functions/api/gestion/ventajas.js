/* ══════════════════════════════════════════════════════════════════════
   Gestión · VENTAJAS POR NIVEL · 30-10-2026 (petición de César)
   GET  /api/gestion/ventajas → { niveles, grupos, ventajas: [{ codigo, grupo, texto, estado, niveles: { <nivel>: { si, detalle, destacada } } }], puede }
   POST /api/gestion/ventajas { accion, … }   (permiso 'beneficios.editar')
     'crear'   { grupo, texto, estado?, codigo? }           → ventaja nueva (código automático por grupo si no se da)
     'editar'  { codigo, grupo?, texto?, estado? }          → cambia texto, grupo o estado (activo | proximamente | oculto)
     'asignar' { codigo, nivel, si, detalle?, destacada? }  → marca o desmarca la casilla de un nivel (y su detalle y si se destaca)
   Decisiones de César (30-10-2026):
   · Cuadrícula: filas = ventajas, columnas = Registrado, Simpatizante, Colaborador, Protector, Mecenas.
   · Estudiante hereda las de Colaborador (niveles.ventajas_de): no tiene columna propia.
   · Lo que se cambia aquí se ve en Mi INNAZ (todas las ventajas) y en la página pública /suscripciones (solo las «destacadas»).
   · Las ventajas no se borran (hay suscriptores que las tienen): se ponen en estado «oculto».
   ══════════════════════════════════════════════════════════════════════ */
import { json, anotar, limpiarTexto } from '../../_lib/util.js';
import { exigirPermiso } from '../../_lib/gestion.js';

const ESTADOS = ['activo', 'proximamente', 'oculto'];
const MAX_DESTACADAS = 6;
async function anotarSeguro(env, ...a) { try { await anotar(env, ...a); } catch (e) { console.error('registro:', e); } }

async function columnas(env) {   // niveles con columna propia: todos menos los que heredan
  return (await env.DB.prepare('SELECT clave, nombre, orden FROM niveles WHERE ventajas_de IS NULL ORDER BY orden').all()).results;
}
async function leer(env, permisos) {
  const niveles = await columnas(env);
  const hereda = (await env.DB.prepare('SELECT clave, nombre, ventajas_de FROM niveles WHERE ventajas_de IS NOT NULL').all()).results;
  const filas = (await env.DB.prepare('SELECT codigo, grupo, texto, estado FROM beneficios ORDER BY grupo, codigo').all()).results;
  const asig = (await env.DB.prepare('SELECT nivel, codigo, detalle, destacada FROM nivel_beneficios').all()).results;
  const porCodigo = {}; for (const a of asig) (porCodigo[a.codigo] ||= {})[a.nivel] = { si: true, detalle: a.detalle, destacada: !!a.destacada };
  // Orden natural de los códigos: letras y después número (A2 antes que A10)
  const peso = c => { const m = /^([A-Z]+)(\d+)$/.exec(c); return m ? [m[1], Number(m[2])] : [c, 0]; };
  filas.sort((x, y) => x.grupo.localeCompare(y.grupo, 'es') || (peso(x.codigo)[0] < peso(y.codigo)[0] ? -1 : peso(x.codigo)[0] > peso(y.codigo)[0] ? 1 : peso(x.codigo)[1] - peso(y.codigo)[1]));
  const grupos = [...new Set(filas.map(f => f.grupo))];
  return json({ niveles: niveles.map(n => ({ clave: n.clave, nombre: n.nombre })), hereda: hereda.map(h => ({ clave: h.clave, nombre: h.nombre, de: h.ventajas_de })),
    grupos, estados: ESTADOS, maxDestacadas: MAX_DESTACADAS,
    ventajas: filas.map(f => ({ codigo: f.codigo, grupo: f.grupo, texto: f.texto, estado: f.estado, niveles: porCodigo[f.codigo] || {} })),
    puede: { editar: permisos.includes('beneficios.editar') } });
}

export async function onRequestGet({ request, env }) {
  const p = await exigirPermiso(env, request, 'suscriptores.ver');
  if (p instanceof Response) return p;
  try { return await leer(env, p.permisos); }
  catch (e) { console.error('ventajas:', e); return json({ error: 'No se han podido cargar las ventajas.' }, 500); }
}

export async function onRequestPost({ request, env }) {
  let d; try { d = await request.json(); } catch { d = null; }
  if (!d || typeof d !== 'object') return json({ error: 'Datos no válidos.' }, 400);
  const p = await exigirPermiso(env, request, 'beneficios.editar');
  if (p instanceof Response) return p;
  const DB = env.DB, yo = p.s.usuario;
  try {
    if (d.accion === 'crear' || d.accion === 'editar') {
      const texto = d.texto !== undefined ? limpiarTexto(d.texto, 200) : undefined, grupo = d.grupo !== undefined ? limpiarTexto(d.grupo, 40) : undefined;
      const estado = d.estado !== undefined ? String(d.estado) : undefined;
      if (estado !== undefined && !ESTADOS.includes(estado)) return json({ error: 'Estado no válido.' }, 400);
      if (d.accion === 'crear') {
        if (!texto) return json({ error: 'Escribe el texto de la ventaja (lo que verá el suscriptor).', campo: 'texto' }, 400);
        if (!grupo) return json({ error: 'Elige o escribe el grupo (Zarzuteca, Formación…).', campo: 'grupo' }, 400);
        let codigo = limpiarTexto(d.codigo, 6)?.toUpperCase() || null;
        if (codigo && !/^[A-Z]{1,2}\d{1,3}$/.test(codigo)) return json({ error: 'El código tiene que ser una o dos letras y un número (p. ej. A17).', campo: 'codigo' }, 400);
        if (!codigo) {   // automático: la letra del grupo (la más usada en él) y el siguiente número libre
          const usados = (await DB.prepare('SELECT codigo FROM beneficios WHERE grupo = ?').bind(grupo).all()).results.map(x => x.codigo);
          const letras = {}; for (const c of usados) { const m = /^([A-Z]+)/.exec(c); if (m) letras[m[1]] = (letras[m[1]] || 0) + 1; }
          const letra = Object.entries(letras).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N';
          const todos = (await DB.prepare('SELECT codigo FROM beneficios').all()).results.map(x => x.codigo);
          let n = 1; for (const c of todos) { const m = new RegExp('^' + letra + '(\\d+)$').exec(c); if (m) n = Math.max(n, Number(m[1]) + 1); }
          codigo = letra + n;
        }
        if (await DB.prepare('SELECT 1 FROM beneficios WHERE codigo = ?').bind(codigo).first()) return json({ error: `Ya existe la ventaja ${codigo}.`, campo: 'codigo' }, 409);
        await DB.prepare('INSERT INTO beneficios (codigo, grupo, texto, estado) VALUES (?,?,?,?)').bind(codigo, grupo, texto, estado || 'activo').run();
        await anotarSeguro(env, yo.id, 'ventaja.crear', codigo, { grupo, texto, estado: estado || 'activo' });
        return json({ ok: true, codigo, mensaje: `Ventaja ${codigo} creada. Ahora marca en qué niveles entra.` });
      }
      const f = await DB.prepare('SELECT * FROM beneficios WHERE codigo = ?').bind(String(d.codigo || '')).first();
      if (!f) return json({ error: 'No existe esa ventaja.' }, 404);
      if (texto === null) return json({ error: 'El texto no puede quedar vacío.', campo: 'texto' }, 400);
      if (grupo === null) return json({ error: 'El grupo no puede quedar vacío.', campo: 'grupo' }, 400);
      const nuevo = { grupo: grupo ?? f.grupo, texto: texto ?? f.texto, estado: estado ?? f.estado };
      await DB.prepare('UPDATE beneficios SET grupo = ?, texto = ?, estado = ? WHERE codigo = ?').bind(nuevo.grupo, nuevo.texto, nuevo.estado, f.codigo).run();
      await anotarSeguro(env, yo.id, 'ventaja.editar', f.codigo, { antes: { grupo: f.grupo, texto: f.texto, estado: f.estado }, despues: nuevo });
      return json({ ok: true, mensaje: `Ventaja ${f.codigo} guardada.` });
    }
    if (d.accion === 'asignar') {
      const codigo = String(d.codigo || ''), nivel = String(d.nivel || '');
      if (!(await DB.prepare('SELECT 1 FROM beneficios WHERE codigo = ?').bind(codigo).first())) return json({ error: 'No existe esa ventaja.' }, 404);
      const n = await DB.prepare('SELECT clave, nombre, ventajas_de FROM niveles WHERE clave = ?').bind(nivel).first();
      if (!n) return json({ error: 'No existe ese nivel.' }, 404);
      if (n.ventajas_de) return json({ error: `${n.nombre} hereda las ventajas de otro nivel: cámbialas allí.` }, 400);
      const detalle = limpiarTexto(d.detalle, 80) || null, destacada = d.destacada === true ? 1 : 0;
      if (d.si === false) {
        const r = await DB.prepare('DELETE FROM nivel_beneficios WHERE nivel = ? AND codigo = ?').bind(nivel, codigo).run();
        if (r.meta.changes) await anotarSeguro(env, yo.id, 'ventaja.quitar', codigo, { nivel });
        return json({ ok: true, mensaje: `${codigo} quitada de ${n.nombre}.` });
      }
      if (destacada) {
        const nd = (await DB.prepare('SELECT COUNT(*) c FROM nivel_beneficios WHERE nivel = ? AND destacada = 1 AND codigo <> ?').bind(nivel, codigo).first()).c;
        if (nd >= MAX_DESTACADAS) return json({ error: `${n.nombre} ya tiene ${MAX_DESTACADAS} ventajas destacadas (las que salen en la página pública). Quita alguna antes.` }, 409);
      }
      await DB.prepare(`INSERT INTO nivel_beneficios (nivel, codigo, detalle, destacada) VALUES (?,?,?,?)
                        ON CONFLICT(nivel, codigo) DO UPDATE SET detalle = excluded.detalle, destacada = excluded.destacada`).bind(nivel, codigo, detalle, destacada).run();
      await anotarSeguro(env, yo.id, 'ventaja.asignar', codigo, { nivel, detalle, destacada: !!destacada });
      return json({ ok: true, mensaje: `${codigo} en ${n.nombre}${detalle ? ' (' + detalle + ')' : ''}${destacada ? ' · destacada' : ''}.` });
    }
    return json({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error('ventajas:', e);
    return json({ error: 'No se ha podido guardar. Prueba otra vez.' }, 500);
  }
}
