/* ═══════════════════════════════════════════════════════════════════
   EMBAJADORES HONORÍFICOS DE INNAZ  (9-10-2026)
   Una sola lista para toda la web: la leen la portada (carrusel) y
   «Qué es INNAZ» (cuadrícula). Para añadir a alguien:
     1. Deja su foto en publish_innaz/equipo/ (vertical, 800 x 1000 px).
     2. Copia una línea, cámbiala y respeta el orden alfabético por apellido.
     «cargo»: una profesión entre comillas, o varias entre corchetes
     ["Soprano", "Actriz"]; cada una sale en su propia línea.
   «credito» es el autor de la foto; si no se sabe, déjalo en "".
   Instituciones: añade «institucion: true» (logo sobre fondo blanco; su
   nombre se ajusta de tamaño aparte del de las personas).
   ═══════════════════════════════════════════════════════════════════ */
const EMBAJADORES = [
  { foto: "equipo/carlos-alvarez.jpg",  nombre: "Carlos Álvarez",  cargo: "Barítono",                          credito: "Carlos Díaz de la Fuente" },
  { foto: "equipo/nuria-castejon.jpg",  nombre: "Nuria Castejón",  cargo: ["Coreógrafa", "Directora de escena"], credito: "" },
  { foto: "equipo/ruben-fernandez-aguirre.jpg", nombre: "Rubén Fernández Aguirre", cargo: "Pianista", credito: "" },
  { foto: "equipo/ruth-iniesta.jpg",    nombre: "Ruth Iniesta",    cargo: "Soprano",                           credito: "" },
  { foto: "equipo/jorge-de-leon.jpg",   nombre: "Jorge de León",   cargo: "Tenor",                             credito: "" },
  { foto: "equipo/milagros-martin.jpg", nombre: "Milagros Martín", cargo: "Soprano",                           credito: "" },
  { foto: "equipo/emilio-sagi.jpg",     nombre: "Emilio Sagi",     cargo: "Director de escena",                credito: "" },
  // Instituciones: después de las personas
  { foto: "equipo/fundacion-juan-march.jpg", nombre: "Fundación Juan March", cargo: "Institución",       credito: "", institucion: true },
];
