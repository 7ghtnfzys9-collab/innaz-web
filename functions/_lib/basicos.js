/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · DATOS BÁSICOS OBLIGATORIOS · 30-10-2026 (decisión de César)
   Para crear cualquier cuenta: nombre, apellidos, correo y país de residencia.
   Documento y dirección postal solo se piden al suscribirse de pago o inscribirse en ZLabs (minimización, RGPD art. 5.1.c).
   El país se guarda como código ISO de 2 letras en usuarios.pais_declarado. Los nombres de los países los da el propio
   sistema (Intl.DisplayNames, en español): no hay listas copiadas a mano.
   ══════════════════════════════════════════════════════════════════════ */
import { limpiarTexto } from './util.js';

// Códigos ISO 3166-1 alfa-2 en vigor (249) más XK (Kosovo, código provisional de uso común). Lista cerrada: así no entran
// códigos que Intl también conoce pero no son países o están retirados (UE, Naciones Unidas, Canarias, «SU», «YU»…).
// La misma lista está en public/paises.js.
export const ISO = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XK'.split(' '));
let nombres = null;
const nombresPais = () => nombres ||= new Intl.DisplayNames(['es'], { type: 'region', fallback: 'none' });

/** Código de país válido (en mayúsculas) o null. */
export function paisValido(c) {
  if (typeof c !== 'string' || !/^[A-Za-z]{2}$/.test(c.trim())) return null;
  const k = c.trim().toUpperCase();
  if (!ISO.has(k)) return null;
  try { return nombresPais().of(k) ? k : null; } catch { return null; }
}
export const nombrePais = c => { try { return nombresPais().of(c) || c; } catch { return c; } };

/** Comprueba los básicos de un formulario. Devuelve { v: {nombre, apellidos, pais} } o { error, campo }. */
export function leerBasicos(d) {
  const nombre = limpiarTexto(d.nombre, 80), apellidos = limpiarTexto(d.apellidos, 120), pais = paisValido(d.pais);
  if (!nombre) return { error: 'Escribe tu nombre.', campo: 'nombre' };
  if (!apellidos) return { error: 'Escribe tus apellidos.', campo: 'apellidos' };
  if (!pais) return { error: 'Elige tu país de residencia.', campo: 'pais' };
  return { v: { nombre, apellidos, pais } };
}

/** Qué básicos le faltan a una cuenta: [] si ninguno. (Si la columna o la tabla aún no existen, no se exige nada.) */
export async function faltanBasicos(env, usuarioId) {
  try {
    const r = await env.DB.prepare(`SELECT u.nombre, u.pais_declarado pais, d.apellidos FROM usuarios u
      LEFT JOIN datos_personales d ON d.usuario_id = u.id WHERE u.id = ?`).bind(usuarioId).first();
    if (!r) return [];
    return [!r.nombre && 'nombre', !r.apellidos && 'apellidos', !r.pais && 'pais'].filter(Boolean);
  } catch { return []; }
}

/** Guarda los básicos (nombre en usuarios, apellidos en datos_personales, país en usuarios). Devuelve las sentencias para un lote. */
export function sentenciasBasicos(DB, usuarioId, v, t) {
  return [
    DB.prepare('UPDATE usuarios SET nombre = ?, pais_declarado = ? WHERE id = ?').bind(v.nombre, v.pais, usuarioId),
    DB.prepare(`INSERT INTO datos_personales (usuario_id, apellidos, actualizado) VALUES (?,?,?)
                ON CONFLICT(usuario_id) DO UPDATE SET apellidos = excluded.apellidos, actualizado = excluded.actualizado`).bind(usuarioId, v.apellidos, t),
  ];
}

export const AVISO_FALTAN_BASICOS = 'Antes tienes que completar tus datos básicos (nombre, apellidos y país) en Mi INNAZ.';
