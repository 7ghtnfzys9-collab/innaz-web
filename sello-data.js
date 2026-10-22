/* ══════════════════════════════════════════════════════
   SELLO DE CALIDAD INNAZ — DATOS COMPARTIDOS
   Usado por: index.html (portada) · sello.html · qr-imprimir.html
   ══════════════════════════════════════════════════════
   22-10-2026 (César): el Sello lo concede el COMITÉ; no depende
   de los votos. La valoración del público es aparte y vale para
   cualquier espectáculo de la Cartelera (valoraciones.js y el
   servidor functions/api/valoracion/). Cada producción con Sello
   se enlaza con su ficha de la Cartelera mediante el campo
   «cartelera» (su código: MAD-02, SUR-15…), y así muestra la
   misma valoración del público que en la Cartelera.

   ➕ PARA AÑADIR UNA PRODUCCIÓN CON SELLO: copia el bloque de
   la plantilla dentro de los corchetes de PRODUCCIONES, cambia
   sus datos, pon un id nuevo (minúsculas, sin espacios ni tildes)
   y en «cartelera» el código de su ficha de la Cartelera.

   Los QR y enlaces de votación de cualquier espectáculo pueden
   apuntar a: https://innaz.es/cartelera.html#valorar-<código>
   ══════════════════════════════════════════════════════ */
const SELLO_URL_BASE = 'https://innaz.es/sello.html';

/* PLANTILLA (los datos son de ejemplo):

   {
     id: 'la-bruja-zarzuela-2027',
     cartelera: 'MAD-04',
     titulo: 'La bruja',
     compositor: 'Ruperto Chapí',
     teatro: 'Teatro de la Zarzuela, Madrid',
     detalle: 'Nueva producción · Temporada 2026/27 · Dir. musical: … · Dir. escena: …'
   },
*/
const PRODUCCIONES = [];

/* Primera y última función de una producción con Sello, según la Cartelera. */
function selloFechas(p) {
  const c = (typeof CARTELERA !== 'undefined' ? CARTELERA : []).find(x => x.id === p.cartelera);
  const f = c ? (c.f || []).slice().sort() : [];
  return f.length ? [f[0], f[f.length - 1]] : ['', ''];
}

/* Hueco de la valoración del público de una producción con Sello. */
function selloValoracion(p) {
  if (!p.cartelera || typeof VAL === 'undefined') return '';
  const [f0, f1] = selloFechas(p);
  return VAL.hueco(p.cartelera, f0, f1, p.titulo);
}
