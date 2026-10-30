/* GET /api/gestion/panel → portada del panel de gestión: quién eres, tus perfiles y tus permisos.
   Exige sesión de gestión (segundo factor) y el permiso «panel.entrar». Es la plantilla de todos los
   endpoints del panel que vendrán (ventajas, Sello, suscriptores). */
import { json } from '../../_lib/util.js';
import { exigirPermiso, perfilesDe } from '../../_lib/gestion.js';
import { PERMISOS, seccionesDe } from '../../_lib/permisos.js';

export async function onRequestGet({ request, env }) {
  const p = await exigirPermiso(env, request, 'panel.entrar');
  if (p instanceof Response) return p;
  const { s, permisos } = p;
  return json({
    usuario: s.usuario,
    gestionHasta: s.sesion.gestionHasta,
    perfiles: await perfilesDe(env, s.usuario.id),
    secciones: seccionesDe(permisos),   // una pestaña por sección (César, 28-10-2026)
    permisos: permisos.map(k => ({ clave: k, grupo: PERMISOS[k]?.grupo || '—', texto: PERMISOS[k]?.texto || k })),
  });
}
