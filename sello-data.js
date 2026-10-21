/* ══════════════════════════════════════════════════════
   SELLO DE CALIDAD INNAZ — DATOS COMPARTIDOS
   Usado por: index.html (portada) · sello.html · qr-imprimir.html
   ══════════════════════════════════════════════════════
   Los QR y los enlaces apuntan a SELLO_URL_BASE#votar-<id>
   y abren directamente la votación de esa producción.

   VOTOS (21-10-2026): son reales y compartidos. Los guarda
   el servidor de la web (Cloudflare, base de datos D1), en
   functions/api/sello/[[accion]].js. Allí están también las
   reglas: media ponderada bayesiana (10 votos neutros de 3,5),
   nota visible desde 10 votos, un voto por navegador y tope
   de 30 votos por hora desde una misma conexión.

   ➕ PARA AÑADIR UNA PRODUCCIÓN: copia el bloque de la
   plantilla, pégalo dentro de los corchetes de PRODUCCIONES,
   cambia sus datos y pon un id nuevo, en minúsculas, sin
   espacios ni tildes (solo letras, números y guiones).
   Aparecerá automáticamente en las tres páginas y el
   servidor empezará a aceptar votos para ella.
   ⚠ No cambies el id de una producción que ya tenga votos:
   los votos van ligados a ese id.
   ══════════════════════════════════════════════════════ */
const SELLO_URL_BASE = 'https://innaz.es/sello.html';

/* PLANTILLA (los datos son de ejemplo):

   {
     id: 'la-bruja-zarzuela-2026',
     titulo: 'La bruja',
     compositor: 'Ruperto Chapí',
     teatro: 'Teatro de la Zarzuela, Madrid',
     detalle: 'Nueva producción · Temporada 2026/27 · Dir. musical: … · Dir. escena: …'
   },
*/
const PRODUCCIONES = [];

/* ── Votos: lectura del servidor ─────────────────────── */
const SELLO_API = '/api/sello';
let SELLO_NOTAS = { prods: {}, votados: [], minimo: 10, ok: false };

/* Identificador anónimo de este navegador (no contiene datos personales). */
function selloNav() {
  try {
    let t = localStorage.getItem('innaz_nav');
    if (!/^[a-f0-9]{32}$/.test(t || '')) {
      t = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('innaz_nav', t);
    }
    return t;
  } catch (e) { return ''; }
}

async function cargarNotasSello() {
  if (!PRODUCCIONES.length) return SELLO_NOTAS;
  try {
    const r = await fetch(SELLO_API + '/notas?nav=' + selloNav(), { cache: 'no-store' });
    if (r.ok) SELLO_NOTAS = Object.assign(await r.json(), { ok: true });
  } catch (e) { /* sin conexión con el servidor: se muestra sin nota */ }
  return SELLO_NOTAS;
}

function notaDe(p) { return SELLO_NOTAS.prods[p.id] || { n: 0, nota: null }; }

function yaVotadoSello(id) {
  if ((SELLO_NOTAS.votados || []).includes(id)) return true;
  try { return !!localStorage.getItem('innaz_voto_' + id); } catch (e) { return false; }
}

/* Puntuación de una tarjeta: nota con estrellas desde 10 votos; antes, solo el recuento. */
function htmlPuntuacionSello(p) {
  const { n, nota } = notaDe(p);
  const votos = n === 1 ? '1 voto' : n.toLocaleString('es-ES') + ' votos';
  if (nota === null || nota === undefined) {
    return `<div class="sello-rating"><span class="rating-count">Todavía hay pocas valoraciones · ${votos}</span></div>`;
  }
  return `<div class="sello-rating">
      <span class="stars">★★★★★<span class="stars-fill" style="width:${(nota / 5 * 100).toFixed(1)}%">★★★★★</span></span>
      <span class="rating-num">${nota.toFixed(1).replace('.', ',')}</span>
      <span class="rating-count">(${votos})</span>
    </div>`;
}

/* Preguntas de confirmación (tono B, decisión de César del 21-10-2026). */
const SELLO_CONFIRMA = {
  5: '¡Bravo y bis! ¿Confirmas 5 estrellas?',
  4: 'Casi para pedir el bis. ¿Confirmas 4 estrellas?',
  3: 'Ni chicha ni limoná. ¿Confirmas 3 estrellas?',
  2: '¿Se te ha hecho largo? ¿Lo dejamos en 2 estrellas?',
  1: '¿Ni la romanza lo ha salvado? ¿Confirmas 1 estrella?'
};

async function enviarVotoSello(prod, estrellas) {
  try {
    const r = await fetch(SELLO_API + '/votar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prod, estrellas, nav: selloNav() })
    });
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (d.prods) SELLO_NOTAS.prods = d.prods;
    return Object.assign({ ok: r.ok, status: r.status }, d);
  } catch (e) {
    return { ok: false, status: 0 };
  }
}
