/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · LISTA FIJA DE PERMISOS · 26-10-2026, revisada el 27-10-2026 (borrador)
   Cada permiso es UNA acción concreta. Los perfiles (Presidencia, Sello…)
   son paquetes de estos permisos y se crean/editan desde el panel.
   «publico: true» = cambia algo que ve el público → si el perfil tiene
   requiere_aprobacion, el cambio espera el visto bueno de Presidencia.
   ══════════════════════════════════════════════════════════════════════ */
export const PERMISOS = {
  // Panel y administración
  'panel.entrar':             { grupo: 'Panel',         texto: 'Entrar en la gestión (parte trasera) con correo y contraseña' },
  'perfiles.gestionar':       { grupo: 'Panel',         texto: 'Crear, modificar y borrar roles' },
  'perfiles.asignar':         { grupo: 'Panel',         texto: 'Dar de alta personas en la gestión, asignar roles y modificar sus datos (el rol Administrador, solo un Administrador)' },
  'factor.reiniciar':         { grupo: 'Panel',         texto: 'Restablecer la contraseña de otra persona (le llega un enlace para crear otra)' },   // 30-10-2026: antes, reiniciar el segundo factor
  'cambios.aprobar':          { grupo: 'Panel',         texto: 'Aprobar o rechazar cambios pendientes (visto bueno)' },
  'registro.ver':             { grupo: 'Panel',         texto: 'Ver el registro de actividad' },

  // Suscripciones
  'suscriptores.ver':         { grupo: 'Suscripciones', texto: 'Ver la lista de suscriptores' },
  'suscriptores.alta':        { grupo: 'Suscripciones', texto: 'Dar de alta o renovar (alta manual, «pagado»)' },
  'suscriptores.editar':      { grupo: 'Suscripciones', texto: 'Cambiar nivel, datos o estado de un suscriptor' },
  'cuentas.eliminar':         { grupo: 'Suscripciones', texto: 'Eliminar la cuenta de una persona (se borran sus datos; los pagos quedan bloqueados)' },   // 31-10-2026
  'suscriptores.exportar':    { grupo: 'Suscripciones', texto: 'Exportar la lista en CSV' },
  'cobros.ver':               { grupo: 'Suscripciones', texto: 'Ver importes y referencias de pago' },
  'beneficios.editar':        { grupo: 'Suscripciones', texto: 'Elegir las ventajas de cada nivel', publico: true },
  'precios.editar':           { grupo: 'Suscripciones', texto: 'Cambiar el precio de los niveles (tras acuerdo)', publico: true },
  'certificados.emitir':      { grupo: 'Suscripciones', texto: 'Emitir certificados de suscriptor' },
  'solicitudes.ver':          { grupo: 'Suscripciones', texto: 'Ver y atender solicitudes de los suscriptores' },
  'estudiantes.centros':      { grupo: 'Suscripciones', texto: 'Dar de alta y editar los centros (conservatorios y escuelas superiores)' },
  'estudiantes.codigos':      { grupo: 'Suscripciones', texto: 'Generar, enviar y anular códigos de estudiante' },
  'colaboraciones.resolver':  { grupo: 'Suscripciones', texto: 'Aceptar o rechazar colaboraciones (A16: 1 mes de Colaborador)' },

  // Sello de Calidad
  'sello.ver':                { grupo: 'Sello',         texto: 'Ver las producciones con Sello y las solicitudes' },
  'sello.conceder':           { grupo: 'Sello',         texto: 'Conceder el Sello y asignar su número SDC-AANNN', publico: true },
  'sello.revisar':            { grupo: 'Sello',         texto: 'Anotar la revisión anual', publico: true },
  'sello.retirar':            { grupo: 'Sello',         texto: 'Retirar el Sello', publico: true },
  'sello.certificado':        { grupo: 'Sello',         texto: 'Generar el certificado del Sello' },
  'sello.solicitudes':        { grupo: 'Sello',         texto: 'Ver y atender solo las solicitudes de asesoramiento del Sello' },

  // Comunicación
  'boletin.preparar':         { grupo: 'Comunicación',  texto: 'Preparar el boletín' },
  'boletin.enviar':           { grupo: 'Comunicación',  texto: 'Enviar el boletín', publico: true },

  // Contenidos (más adelante, con la fase 3: publicar sin el Mac)
  'contenidos.noticias':      { grupo: 'Contenidos',    texto: 'Publicar noticias', publico: true },
  'contenidos.cartelera':     { grupo: 'Contenidos',    texto: 'Editar la Cartelera', publico: true },
  'contenidos.zarzuteca':     { grupo: 'Contenidos',    texto: 'Editar fichas de la Zarzuteca', publico: true },
  // ZLabs · selección (28-10-2026)
  'zlabs.ver':                { grupo: 'ZLabs',         texto: 'Ver las preinscripciones de ZLabs (sin documento ni dirección)' },
  'zlabs.seleccionar':        { grupo: 'ZLabs',         texto: 'Marcar admitido, reserva o no admitido, asignar papel y anotar' },
  'zlabs.comunicar':          { grupo: 'ZLabs',         texto: 'Enviar el resultado de la selección a los candidatos' },
  'zlabs.datos':              { grupo: 'ZLabs',         texto: 'Ver el documento y la dirección de un inscrito (matrícula y facturas)' },
};

/* ══ SECCIONES DE GESTIÓN (parte trasera) · César, 28-10-2026 ══
   · El PANEL DE CONTROL solo organiza personas y roles (perfiles). Nada de la gestión de secciones.
   · Cada sección (ZLabs, Noticias, Cartelera…) es una PESTAÑA de /gestion con el color de su pilar.
     Una persona ve una pestaña por cada sección de la que tenga algún permiso (el Administrador, todas),
     y entra en todas con un solo acceso.
   · color = el de la web (bordes y botones); oscuro = para textos y enlaces (contraste suficiente con blanco).
   · hecha: false → la sección existe en el plan pero aún no tiene página; no se muestra. */
export const SECCIONES = [
  { clave: 'panel',         nombre: 'Panel de control', grupo: 'Panel',         color: '#0097B2', oscuro: '#007A90', hecha: true },
  { clave: 'zlabs',         nombre: 'ZLabs',            grupo: 'ZLabs',         color: '#6F8AC6', oscuro: '#4C66A3', hecha: true },   // pilar Formación
  { clave: 'suscripciones', nombre: 'Suscripciones',    grupo: 'Suscripciones', color: '#0097B2', oscuro: '#007A90', hecha: true },   // 28-10-2026
  { clave: 'sello',         nombre: 'Sello de Calidad', grupo: 'Sello',         color: '#D27D8D', oscuro: '#A4505F', hecha: false },
  { clave: 'boletin',       nombre: 'Boletín',          grupo: 'Comunicación',  color: '#0097B2', oscuro: '#007A90', hecha: false },
  { clave: 'contenidos',    nombre: 'Contenidos',       grupo: 'Contenidos',    color: '#CA8BD0', oscuro: '#8E4F94', hecha: false },   // Noticias, Cartelera, Zarzuteca: se separarán al hacerlas
];
/** Secciones (hechas) que puede ver quien tiene estos permisos. 'panel.entrar' no da ninguna por sí solo. */
export function seccionesDe(permisos) {
  const grupos = new Set(permisos.filter(k => k !== 'panel.entrar').map(k => PERMISOS[k]?.grupo).filter(Boolean));
  return SECCIONES.filter(s => s.hecha && grupos.has(s.grupo)).map(({ clave, nombre, color, oscuro }) => ({ clave, nombre, color, oscuro }));
}
