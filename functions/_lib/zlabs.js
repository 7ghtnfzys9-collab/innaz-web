/* ══════════════════════════════════════════════════════════════════════
   ZLabs · reglas de la preinscripción (28-10-2026)
   Todo lo que puede cambiar de una edición a otra sale de variables de wrangler.toml:
     ZLABS_EDICION        '2027'
     ZLABS_ABIERTA        'si' | 'no'            (plazo abierto)
     ZLABS_NACIDOS_DESDE  '1994-01-01'           (alumnos activos nacidos a partir de esta fecha)
     ZLABS_EDAD_MINIMA    '18'                   (edad el primer día del curso; no se admiten menores, César 28-10-2026)
     ZLABS_INICIO         '2027-07-05'           (primer día del curso)
     ZLABS_AVISOS         'info@innaz.es'        (a quién llega el aviso interno; luego zlabs@innaz.es)
     ZLABS_VERSION_CONDICIONES 'borrador-2026-10-28'
     ZLABS_AFORO_OYENTES  '40'                  (PROVISIONAL, pendiente de cerrar con la ESCM)
   ══════════════════════════════════════════════════════════════════════ */
import { limpiarCorreo, limpiarTexto } from './util.js';
import { numeroCompleto } from './numero.js';


export function config(env) {
  return {
    edicion: env.ZLABS_EDICION || '2027',
    abierta: (env.ZLABS_ABIERTA || 'no') === 'si',
    nacidosDesde: env.ZLABS_NACIDOS_DESDE || '1994-01-01',
    edadMinima: parseInt(env.ZLABS_EDAD_MINIMA || '18', 10),
    inicio: env.ZLABS_INICIO || '2027-07-05',
    avisos: env.ZLABS_AVISOS || 'info@innaz.es',
    versionCondiciones: env.ZLABS_VERSION_CONDICIONES || 'borrador',
    aforoOyentes: parseInt(env.ZLABS_AFORO_OYENTES || '40', 10),   // provisional (pendiente con la ESCM)
  };
}

export const CUERDAS = ['soprano', 'mezzosoprano', 'tenor', 'baritono'];
export const NOMBRE_CUERDA = { soprano: 'Soprano', mezzosoprano: 'Mezzosoprano', tenor: 'Tenor', baritono: 'Barítono' };

/** Fecha AAAA-MM-DD válida y real (no 31 de febrero). */
export function fechaValida(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  const d = new Date(f + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === f;
}

/** Edad cumplida en una fecha dada (ambas AAAA-MM-DD). */
export function edadEn(nacimiento, dia) {
  const [a, m, d] = nacimiento.split('-').map(Number), [A, M, D] = dia.split('-').map(Number);
  return A - a - ((M < m || (M === m && D < d)) ? 1 : 0);
}

const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
/** Documento de identidad normalizado (sin espacios ni guiones, en mayúsculas) o null si no es válido. */
export function documentoValido(tipo, num) {
  if (typeof num !== 'string') return null;
  const n = num.toUpperCase().replace(/[\s.-]/g, '');
  if (tipo === 'dni') {
    if (!/^\d{8}[A-Z]$/.test(n)) return null;
    return LETRAS[parseInt(n.slice(0, 8), 10) % 23] === n[8] ? n : null;
  }
  if (tipo === 'nie') {
    if (!/^[XYZ]\d{7}[A-Z]$/.test(n)) return null;
    const num = String('XYZ'.indexOf(n[0])) + n.slice(1, 8);
    return LETRAS[parseInt(num, 10) % 23] === n[8] ? n : null;
  }
  if (tipo === 'pasaporte') return /^[A-Z0-9]{5,20}$/.test(n) ? n : null;
  return null;
}

/** Enlace a un vídeo: solo https y con un dominio; no se abre ni se descarga. */
export function enlaceValido(u) {
  if (typeof u !== 'string') return null;
  u = u.trim();
  if (u.length > 500) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch { return null; }
}

/** Teléfono: dígitos, espacios, + y guiones; entre 9 y 15 dígitos. */
export function telefonoValido(t) {
  if (typeof t !== 'string') return null;
  const limpio = t.replace(/[^\d+]/g, '');
  const digitos = limpio.replace(/\D/g, '');
  return (digitos.length >= 9 && digitos.length <= 15) ? limpio : null;
}

/** Número de registro (César, 28-10-2026): R/G/SS/SC/SP/SM + '-' + AANNNN (p. ej. SC-260015). Se admite también el antiguo S-AANNN. */
export function suscriptorValido(s) {
  if (typeof s !== 'string' || !s.trim()) return '';
  const n = s.trim().toUpperCase();
  return /^(R|G|SS|SC|SP|SM)-\d{6}$/.test(n) || /^S-\d{5,7}$/.test(n) ? n : null;
}

/** Referencia legible para el candidato: ZL27-XXXXXX (sin letras que se confundan). */
export function nuevaReferencia(edicion) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(6));
  return `ZL${String(edicion).slice(-2)}-` + [...r].map(b => A[b % A.length]).join('');
}

/* ── Validación común (alta y corrección) · 28-10-2026 ──
   Devuelve { error, campo } o { v: {...valores limpios} }.
   En la corrección (opciones.correccion), documento y dirección pueden dejarse vacíos: se conservan los guardados. */

export function validarPreinscripcion(d, c, opciones = {}) {
  const mal = (campo, error) => ({ error, campo });
  const correccion = !!opciones.correccion;
  const modalidad = d.modalidad === 'activo' || d.modalidad === 'oyente' ? d.modalidad : null;
  if (!modalidad) return mal('modalidad', 'Elige si te inscribes como alumno activo u oyente.');
  const nombre = limpiarTexto(d.nombre, 80), apellidos = limpiarTexto(d.apellidos, 120);
  if (!nombre) return mal('nombre', 'Escribe tu nombre.');
  if (!apellidos) return mal('apellidos', 'Escribe tus apellidos.');
  const correo = limpiarCorreo(d.correo);
  if (!correo) return mal('correo', 'Escribe un correo válido.');
  const telefono = telefonoValido(d.telefono);
  if (!telefono) return mal('telefono', 'Escribe un teléfono válido (con prefijo si no es español).');

  const rd = validarDireccion(d, correccion);
  if (rd.error) return rd;
  const direccion = rd.vacia ? null : JSON.stringify(rd.v);

  if (!fechaValida(d.fecha_nacimiento)) return mal('fecha_nacimiento', 'Escribe una fecha de nacimiento válida.');
  const nac = d.fecha_nacimiento;
  if (edadEn(nac, c.inicio) < c.edadMinima)
    return mal('fecha_nacimiento', `ZLabs no admite menores de edad: hay que tener ${c.edadMinima} años cumplidos el ${c.inicio.split('-').reverse().join('/')}.`);
  if (modalidad === 'activo' && nac < c.nacidosDesde)
    return mal('fecha_nacimiento', `Las plazas de alumno activo son para nacidos a partir de ${c.nacidosDesde.slice(0, 4)}. Puedes inscribirte como oyente.`);

  const tipoDoc = ['dni', 'nie', 'pasaporte'].includes(d.documento_tipo) ? d.documento_tipo : null;
  if (!tipoDoc) return mal('documento_tipo', 'Elige el tipo de documento.');
  let doc = null;
  if (!(correccion && !String(d.documento || '').trim())) {
    doc = documentoValido(tipoDoc, d.documento);
    if (!doc) return mal('documento', 'El número de documento no es válido. Revisa la letra.');
  }

  let cuerda = null, v1 = null, v2 = null;
  if (modalidad === 'activo') {
    cuerda = CUERDAS.includes(d.cuerda) ? d.cuerda : null;
    if (!cuerda) return mal('cuerda', 'Elige tu cuerda.');
    v1 = enlaceValido(d.video_romanza);
    if (!v1) return mal('video_romanza', 'Pega el enlace (https://…) al vídeo de la romanza.');
    v2 = enlaceValido(d.video_texto);
    if (!v2) return mal('video_texto', 'Pega el enlace (https://…) al vídeo del texto.');
    if (v1 === v2) return mal('video_texto', 'Los dos vídeos tienen el mismo enlace.');
  }
  const centro = limpiarTexto(d.centro, 150);
  const susc = suscriptorValido(d.num_suscriptor);
  if (susc === null) return mal('num_suscriptor', 'El número de registro tiene el formato SC-260015.');
  if (!correccion) {
    if (d.acepta_condiciones !== true) return mal('acepta_condiciones', 'Tienes que aceptar las condiciones de ZLabs.');
    if (d.acepta_privacidad !== true) return mal('acepta_privacidad', 'Tienes que aceptar la política de privacidad.');
    if (d.acepta_imagen !== true) return mal('acepta_imagen', 'Tienes que aceptar la cesión de imagen para la grabación del curso.');
  }
  return { v: { modalidad, nombre, apellidos, correo, telefono, direccion, nac, tipoDoc, doc,
                cuerda, v1, v2, centro, susc: susc || null } };
}

/* ── Dirección por partes (César, 28-10-2026): calle, número, piso/puerta, CP, población, provincia y país ──
   Se guarda cifrada como JSON. Devuelve { error, campo } o { v: {...} } o { vacia: true } (solo en corrección). */
export function validarDireccion(d, correccion = false) {
  const t = (k, max) => limpiarTexto(d[k], max);
  const dir = { calle: t('dir_calle', 120), numero: t('dir_numero', 10), piso: t('dir_piso', 30), cp: t('dir_cp', 10),
                poblacion: t('dir_poblacion', 80), provincia: t('dir_provincia', 80), pais: t('dir_pais', 60) || 'España' };
  const algo = ['calle', 'numero', 'piso', 'cp', 'poblacion', 'provincia'].some(k => dir[k]);
  if (correccion && !algo) return { vacia: true };
  const mal = (campo, error) => ({ error, campo });
  if (!dir.calle || dir.calle.length < 2) return mal('dir_calle', 'Escribe la calle (tipo y nombre de la vía).');
  if (!dir.numero) return mal('dir_numero', 'Escribe el número (o «s/n» si no tiene).');
  const espana = /^espa(ñ|n)a$/i.test(dir.pais);
  if (espana ? !/^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/.test(dir.cp || '') : !/^[A-Za-z0-9 -]{3,10}$/.test(dir.cp || ''))
    return mal('dir_cp', espana ? 'Ese código postal español no es válido: son 5 cifras y empieza entre 01 y 52 (p. ej. 28001).' : 'Escribe el código postal.');
  if (!dir.poblacion) return mal('dir_poblacion', 'Escribe la población.');
  if (!dir.provincia) return mal('dir_provincia', 'Escribe la provincia (o región, si vives fuera de España).');
  return { v: dir };
}
/** Dirección guardada → una línea legible (también las antiguas, guardadas como texto). */
export function direccionEnTexto(guardada) {
  try { const x = JSON.parse(guardada);
    if (x && typeof x === 'object') return [[x.calle, x.numero].filter(Boolean).join(' ') + (x.piso ? ', ' + x.piso : ''),
      [x.cp, x.poblacion].filter(Boolean).join(' '), x.provincia, x.pais].filter(Boolean).join(' · ');
  } catch {}
  return String(guardada || '');
}

/* ── Suscripción y descuento de ZLabs (César, 28-10-2026) ──
   Da descuento (activo 108 € en vez de 135 €; oyente gratis en vez de 10 €) una suscripción:
     · ANUAL (no mensual), · PAGADA (estado 'activa'; la prueba gratis no cuenta),
     · y vigente el primer día del curso (ZLABS_INICIO).
   Aquí solo se INFORMA a la persona que ha entrado (nunca se consulta por correo ajeno).
   El descuento se comprueba de nuevo en el momento del pago. */
export async function estadoSuscripcion(env, usuarioId, c) {
  const limite = Math.floor(Date.parse(c.inicio + 'T23:59:59+02:00') / 1000);   // fin del primer día del curso (hora de Madrid)
  const fila = await env.DB.prepare(
    `SELECT s.nivel, s.numero, s.estado, s.periodicidad, s.vence, s.cancelar_al_vencer, s.gratuito, n.nombre
       FROM suscripciones s JOIN niveles n ON n.clave = s.nivel
      WHERE s.usuario_id = ? AND s.nivel <> 'registrado' AND s.estado IN ('activa','prueba','pendiente_pago')
        AND s.alta <= strftime('%s','now') AND (s.vence IS NULL OR s.vence > strftime('%s','now'))
      ORDER BY (s.estado = 'activa' AND s.periodicidad = 'anual' AND s.gratuito = 0) DESC, s.vence DESC LIMIT 1`).bind(usuarioId).first();
  const inicioTxt = c.inicio.split('-').reverse().join('/');
  const num = await numeroCompleto(env, usuarioId);   // número de registro de la persona (César, 28-10-2026)
  if (!fila) return { descuento: false, numero: num,
    texto: `No tienes suscripción. Si antes de pagar el curso tienes una suscripción anual pagada vigente el ${inicioTxt}, se te aplicará el descuento.` };
  const base = { nivel: fila.nombre, numero: num, vence: fila.vence };
  const venceTxt = fila.vence ? new Date(fila.vence * 1000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : '';
  let motivo = null;
  if (fila.estado === 'prueba') motivo = 'estás en el periodo de prueba gratis, y el descuento es solo para suscripciones pagadas (podrás pasar a la suscripción pagada antes de pagar el curso)';
  else if (fila.estado === 'pendiente_pago') motivo = 'tu suscripción está pendiente de pago';
  else if (fila.gratuito) motivo = 'tienes un acceso gratuito concedido por INNAZ, y el descuento es solo para la suscripción anual pagada';   // 28-10-2026, regla de CLAUDE.md §8
  else if (fila.periodicidad !== 'anual') motivo = 'tu suscripción es mensual (el descuento es para la anual)';
  else if (!fila.vence || fila.vence < limite)
    motivo = fila.cancelar_al_vencer ? `tu suscripción vence el ${venceTxt} y la cancelaste` : `tu suscripción vence el ${venceTxt}, antes del curso: tendrá que estar renovada`;
  if (motivo) return { ...base, descuento: false,
    texto: `Tienes suscripción ${fila.nombre}${num ? ' (' + num + ')' : ''}, pero ahora mismo no da descuento: ${motivo}. Se vuelve a comprobar al pagar.` };
  return { ...base, descuento: true,
    texto: `Tienes suscripción anual ${fila.nombre}${num ? ' (' + num + ')' : ''}, pagada y vigente hasta el ${venceTxt}: se te aplicará el descuento (se confirma al pagar).` };
}

/* ── Lo que ve el candidato (César, 28-10-2026) ──
   · ALUMNOS ACTIVOS: solo ven el resultado de la selección cuando se les COMUNICA («Enviar resultados»).
     Hasta entonces, «en revisión», aunque la Comisión ya haya marcado algo en el panel. Si la Comisión cambia
     un resultado ya enviado, siguen viendo el último comunicado hasta el siguiente envío.
   · OYENTES: no pasan por selección. Quedan admitidos al preinscribirse hasta llenar el aforo
     (ZLABS_AFORO_OYENTES); después, lista de espera. Se les comunica en el mismo correo de confirmación. */
export function estadoVisible(f) {
  if (f.estado === 'anulada') return 'anulada';
  if (f.modalidad === 'oyente') return f.estado;
  return f.comunicado_estado || 'recibida';
}
/** ¿Puede corregir o cancelar desde Mi INNAZ? Plazo abierto y, si es activo, sin resultado comunicado. */
export function esEditable(f, c) {
  return c.abierta && f.estado !== 'anulada' && (f.modalidad === 'oyente' || !f.comunicado_estado);
}
/** Condición SQL equivalente (para que el servidor no cambie lo que ya no se puede cambiar). */
export const SQL_EDITABLE = "estado <> 'anulada' AND (modalidad = 'oyente' OR comunicado_estado IS NULL)";

const TEXTO_ESTADO = {
  activo: { recibida: 'En revisión por la comisión artística', admitida: 'Admitido/a', reserva: 'En lista de reserva',
            no_admitida: 'No seleccionado/a en esta edición', anulada: 'Cancelada' },
  oyente: { admitida: 'Plaza de oyente confirmada', reserva: 'En lista de espera de oyentes', recibida: 'Recibida',
            no_admitida: 'Sin plaza', anulada: 'Cancelada' },
};
export function textoEstado(f) { const e = estadoVisible(f); return (TEXTO_ESTADO[f.modalidad] || {})[e] || e; }

/** «Mis ZLabs»: pasos del curso y siguiente paso, según lo que ve el candidato. Pago, QR y diploma aún no existen. */
export function pasosCurso(f) {
  const e = estadoVisible(f), activo = f.modalidad === 'activo';
  const nombres = activo ? ['Preinscripción', 'Selección', 'Matrícula', 'Acceso (QR)', 'Diploma']
                         : ['Inscripción', 'Plaza', 'Pago o confirmación', 'Acceso (QR)', 'Diploma'];
  let hechos = 1, siguiente = '';
  if (e === 'anulada') { hechos = 0; siguiente = 'Cancelaste esta preinscripción.'; }
  else if (activo && e === 'recibida') siguiente = 'La comisión artística revisará tus vídeos. Te escribiremos con el resultado.';
  else if (e === 'admitida') { hechos = 2; siguiente = activo
      ? 'Te enviaremos la partitura y el libreto, y las instrucciones para pagar la matrícula y confirmar tu plaza.'
      : 'Te enviaremos las instrucciones para confirmar tu plaza (gratis con suscripción anual; 10 € sin ella) y recibir tu código QR.'; }
  else if (e === 'reserva') siguiente = activo
      ? 'Si queda libre una plaza de tu cuerda, te avisaremos por correo. Mientras, puedes inscribirte como oyente.'
      : 'Si queda libre una plaza de oyente, te avisaremos por correo.';
  else if (e === 'no_admitida') { siguiente = 'Puedes asistir como oyente y presentarte a las próximas convocatorias.'; }
  return { pasos: nombres.map((t, i) => ({ t, hecho: i < hechos, actual: i === hechos && e !== 'anulada' && e !== 'no_admitida' })), siguiente };
}
