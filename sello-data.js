/* ══════════════════════════════════════════════════════
   SELLO DE CALIDAD INNAZ — DATOS COMPARTIDOS
   Usado por: index.html (portada) · sello.html · qr-imprimir.html
   ══════════════════════════════════════════════════════
   22-10-2026 (César): el Sello lo concede el COMITÉ; no depende
   de los votos. La valoración del público es aparte y vale para
   cualquier espectáculo de la Cartelera (valoraciones.js y el
   servidor functions/api/valoracion/). Cada producción con Sello
   se enlaza con su ficha de la Cartelera mediante el campo
   «cartelera» (el código de cualquiera de sus fichas: MAD-02,
   SUR-15…). Si el espectáculo va a varios teatros (grupo de
   valoraciones-grupos.js), el Sello aparece en todos ellos.
   Se muestra en la Cartelera, en Valoraciones, en la ficha de
   la obra, en las Próximas funciones y en el pilar Interpretación.

   ➕ PARA AÑADIR UNA PRODUCCIÓN CON SELLO: copia el bloque de
   la plantilla dentro de los corchetes de PRODUCCIONES, cambia
   sus datos, pon un id nuevo (minúsculas, sin espacios ni tildes)
   y en «cartelera» el código de su ficha de la Cartelera.

   Los QR y enlaces de votación de cualquier espectáculo pueden
   apuntar a: https://innaz.es/valoraciones.html#valorar-<código>
   (vale para los que siguen en cartel y para los ya terminados).
   ══════════════════════════════════════════════════════ */
const SELLO_URL_BASE = 'https://innaz.es/proyecto-interpretacion.html#sello';

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
  const id = [].concat(p.cartelera || [])[0];
  const c = (typeof CARTELERA !== 'undefined' ? CARTELERA : []).find(x => x.id === id);
  const f = c ? (c.f || []).slice().sort() : [];
  return f.length ? [f[0], f[f.length - 1]] : ['', ''];
}

/* Hueco de la valoración del público de una producción con Sello. */
function selloValoracion(p) {
  if (!p.cartelera || typeof VAL === 'undefined') return '';
  const [f0, f1] = selloFechas(p);
  return VAL.hueco([].concat(p.cartelera)[0], f0, f1, p.titulo);
}
