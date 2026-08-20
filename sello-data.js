/* ══════════════════════════════════════════════════════
   SELLO DE CALIDAD INNAZ — DATOS COMPARTIDOS
   Usado por: webinnaz.html · sello.html · qr-imprimir.html
   ══════════════════════════════════════════════════════
   ⚠️ URL BASE: cuando la web esté publicada, sustituye
   esta URL por la real de la página del Sello. Los QR
   impresos apuntan a URL#votar-<id> y abren directamente
   la votación de esa producción.

   ⚠️ NOTA SOBRE LOS VOTOS: esto es una maqueta. Los
   valores "sum" y "count" son DATOS DE DEMOSTRACIÓN
   (no reales) y los votos nuevos se guardan solo en el
   navegador de cada visitante. Para votos compartidos
   entre todo el público hará falta conectar un backend
   (p. ej. Firebase o Google Forms).

   ➕ PARA AÑADIR UNA PRODUCCIÓN: copia un bloque {...},
   cambia sus datos y usa un id nuevo sin espacios.
   Aparecerá automáticamente en las tres páginas.

   Las producciones listadas son reales: programación
   2026/27 del Teatro de la Zarzuela y XXXIII Festival
   de Teatro Lírico Español de Oviedo.
   ══════════════════════════════════════════════════════ */
const SELLO_URL_BASE = 'https://innaz.es/sello.html';

const PRODUCCIONES = [
  {
    id: 'bruja',
    titulo: 'La bruja',
    compositor: 'Ruperto Chapí',
    teatro: 'Teatro de la Zarzuela, Madrid',
    detalle: 'Nueva producción · Temporada 2026/27 · Dir. musical: J. M. Pérez-Sierra · Dir. escena: Ignacio García',
    sum: 590, count: 128        /* DEMO: media 4.6 */
  },
  {
    id: 'gavilanes',
    titulo: 'Los Gavilanes',
    compositor: 'Jacinto Guerrero',
    teatro: 'Teatro de la Zarzuela, Madrid',
    detalle: 'Reposición · Temporada 2026/27 · Dir. musical: Jordi Bernàcer · Dir. escena: Mario Gas',
    sum: 431, count: 97         /* DEMO: media 4.4 */
  },
  {
    id: 'barberillo',
    titulo: 'El barberillo de Lavapiés',
    compositor: 'Francisco Asenjo Barbieri',
    teatro: 'Festival de Teatro Lírico de Oviedo · Theater Basel · Teatro de la Zarzuela',
    detalle: 'Coproducción internacional · Dir. escena: Christof Loy · Dir. musical: J. M. Pérez-Sierra',
    sum: 748, count: 156        /* DEMO: media 4.8 */
  },
  {
    id: 'verbena',
    titulo: 'La verbena de la Paloma',
    compositor: 'Tomás Bretón',
    teatro: 'Teatro de la Zarzuela · Festival de Oviedo (Teatro Campoamor)',
    detalle: 'Producción de Nuria Castejón · Dir. musical: Víctor Pablo Pérez',
    sum: 971, count: 211        /* DEMO: media 4.6 */
  }
];

/* Media y recuento incluyendo el voto local del visitante */
function mediaDe(p) {
  const voto = parseInt(localStorage.getItem('innaz_voto_' + p.id));
  const sum = p.sum + (voto ? voto : 0);
  const count = p.count + (voto ? 1 : 0);
  return { media: sum / count, count };
}
