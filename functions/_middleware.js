/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · filtro común a TODAS las peticiones · 27-10-2026
   1. Web de pruebas: pide contraseña (secreto CLAVE_PRUEBAS). Sin el secreto, no abre.
      Se entra con un formulario propio (/pruebas-entrar), que deja una cookie de 30 días.
      (Revisado el 27-10: la ventana de usuario y contraseña del navegador no se puede usar con
      las herramientas de Claude ni es cómoda en el móvil; se mantiene solo para pruebas con curl.)
   2. Peticiones que cambian algo (POST…): deben venir de la propia web (freno CSRF).
   3. Cabeceras: fuera de los buscadores (en pruebas) y protecciones básicas.
   5. Web de pruebas: la base de datos se pone al día SOLA en el primer acceso tras cada subida (César, 29-10-2026),
      así basta con SUBIR_PRUEBAS. /instalar sigue disponible. En la web real NO se hace solo (habrá que decidirlo).
   4. Gestión interna (/gestion y /api/gestion/…), César 28-10-2026: separada de Mi INNAZ y sin anunciarse.
      Desde el 30-10-2026 se entra con correo y contraseña: /gestion es el formulario y se sirve a cualquiera.
      Las demás rutas de la API: sin sesión 401; con una cuenta SIN roles, «no encontrado» (404). Siempre fuera de los buscadores.
   6. UNIÓN CON innaz.es (30-10-2026, César): este filtro vive ahora en el repositorio de la web pública. INTERRUPTOR MI_INNAZ:
      si la variable MI_INNAZ no vale 'si' (hoy, Production), las rutas de Mi INNAZ responden 404 y el resto de la web pasa
      sin tocar, exactamente como antes de la unión. En Preview (pruebas.innaz-web.pages.dev) MI_INNAZ = 'si'.
   7. La contraseña de pruebas (CLAVE_PRUEBAS) es opcional desde el 30-10-2026: la web de pruebas la cierra Cloudflare Access.
   ══════════════════════════════════════════════════════════════════════ */
import { huella, leerCookie } from './_lib/util.js';
import { leerSesion } from './_lib/sesion.js';
import { perfilesDe } from './_lib/gestion.js';
import { PAGINA_404 } from './_lib/no-encontrada.js';
import { ponerAlDia } from './api/instalar.js';

const COOKIE_PRUEBAS = '__Host-innaz-pruebas';
const RUTA_GATE = '/pruebas-entrar';

const iguales = async (a, b) => (await huella('c|' + a)) === (await huella('c|' + b));   // sin pistas por tiempo
const valorCookie = env => huella('cookie|' + env.SAL + '|' + env.CLAVE_PRUEBAS);

async function basicCorrecto(request, env) {
  const a = request.headers.get('Authorization') || '';
  if (!a.startsWith('Basic ')) return false;
  let dec = '';
  try { dec = atob(a.slice(6)); } catch { return false; }
  return iguales(dec.slice(dec.indexOf(':') + 1), env.CLAVE_PRUEBAS);
}
async function cookieCorrecta(request, env) {
  const c = leerCookie(request, COOKIE_PRUEBAS);
  return !!c && iguales(c, await valorCookie(env));
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function paginaGate(error = '', destino = '/') {
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Web de pruebas · INNAZ</title><link rel="stylesheet" href="/mi-innaz.css"></head><body>
<div class="aviso-pruebas">Web de pruebas · no es innaz.es</div><main><div class="caja">
<p class="marca">INNA<span class="z">Z</span></p><h1>Web de pruebas</h1>
<p>Esta web es solo para pruebas internas de INNAZ.</p>
<form method="post" action="${RUTA_GATE}"><input type="hidden" name="destino" value="${esc(destino)}">
<label for="clave">Contraseña de pruebas</label><input id="clave" name="clave" type="password" autocomplete="current-password" required
 style="width:100%;padding:10px 12px;font:inherit;border:1px solid #c9c4b8">
<button type="submit">Entrar</button></form>
${error ? `<p class="mensaje error">${esc(error)}</p>` : ''}</div></main>
<script>/* 28-10-2026: conserva el «#…» del enlace (mágico o de ZLabs) al pasar por la contraseña */
if (location.hash) { const d = document.querySelector('[name=destino]'); if (d && !d.value.includes('#')) d.value += location.hash; }</script>
</body></html>`,
    { status: error ? 401 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

// Rutas que pertenecen a Mi INNAZ (páginas, recursos y API). Con el interruptor apagado no existen.
const RUTAS_MI_INNAZ = /^\/(entrar|acceder|mi-innaz|gestion|suscripciones|zlabs-preinscripcion|zlabs-mi-preinscripcion|instalar|pruebas-entrar|llaves\.js|paises\.js|mi-innaz\.css)(\.html|\/)?$|^\/api\/(acceso|mi|gestion|zlabs|planes|llaves|instalar)(\/|$)/;

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // 6. Interruptor: sin MI_INNAZ = 'si', la web se comporta como antes de la unión (innaz.es hoy).
  if (env.MI_INNAZ !== 'si') {
    if (RUTAS_MI_INNAZ.test(url.pathname)) {
      return url.pathname.startsWith('/api/')
        ? new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
        : new Response(PAGINA_404, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
    }
    return next();
  }

  const enPruebas = env.MODO !== 'produccion';

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origen = request.headers.get('Origin');
    if (!origen || origen !== url.origin) {
      return new Response(JSON.stringify({ error: 'Origen no permitido' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
  }

  if (!env.SAL) return new Response('Falta el secreto SAL en la configuración de Cloudflare.', { status: 503 });
  if (enPruebas && env.CLAVE_PRUEBAS) {   // 30-10-2026: solo si se ha puesto la contraseña (en pruebas.innaz-web.pages.dev ya cierra Cloudflare Access)
    // La hoja de estilos se sirve siempre (la usa la propia página de la contraseña).
    const libre = url.pathname === '/mi-innaz.css' || url.pathname === '/robots.txt';
    if (url.pathname === RUTA_GATE) {
      if (request.method === 'POST') {
        const f = await request.formData().catch(() => null);
        const clave = f && f.get('clave');
        let destino = (f && f.get('destino')) || '/';
        if (typeof destino !== 'string' || !/^\/[A-Za-z0-9_\-\/?=&#%.]*$/.test(destino) || destino.startsWith('//')) destino = '/';   // auditoría 30-10-2026: sin «\» ni dominios
        if (typeof clave === 'string' && await iguales(clave, env.CLAVE_PRUEBAS)) {
          return new Response(null, { status: 303, headers: {
            'Location': destino, 'Cache-Control': 'no-store',
            'Set-Cookie': `${COOKIE_PRUEBAS}=${await valorCookie(env)}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; Secure; SameSite=Lax` } });
        }
        return paginaGate('Contraseña incorrecta.', destino);
      }
      return paginaGate('', url.searchParams.get('destino') || '/');
    }
    if (!libre && !(await cookieCorrecta(request, env)) && !(await basicCorrecto(request, env))) {
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'Web de pruebas: hace falta la contraseña' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      // El «#…» del enlace mágico lo conserva el navegador al redirigir.
      return new Response(null, { status: 302, headers: { 'Location': `${RUTA_GATE}?destino=${encodeURIComponent(url.pathname + url.search)}`, 'Cache-Control': 'no-store' } });
    }
  }

  // 5. Base al día sola en pruebas (una vez por instancia; si falla, se reintenta en la siguiente petición)
  if (enPruebas && !globalThis.__innazBaseAlDia && env.DB && !url.pathname.startsWith('/mi-innaz.css') && url.pathname !== RUTA_GATE) {
    try { const h = await ponerAlDia(env); globalThis.__innazBaseAlDia = true; if (h.length) console.log('Base puesta al día:', h.join(' · ')); }
    catch (e) { console.error('No se ha podido poner al día la base:', e); }
  }

  // 4. Gestión interna
  const esPaginaGestion = ['/gestion', '/gestion/', '/gestion.html'].includes(url.pathname);
  const esGestion = esPaginaGestion || url.pathname.startsWith('/api/gestion/');
  // 30-10-2026 (César): la gestión se abre con correo y contraseña. La página y su ruta de acceso se sirven a cualquiera
  // (es el formulario de entrada); el resto de /api/gestion/ sigue cerrado: sin sesión 401, con una cuenta sin roles 404.
  const libreGestion = esPaginaGestion || url.pathname === '/api/gestion/acceso';
  if (esGestion && !libreGestion) {
    const s = await leerSesion(env, request);
    if (!s) {
      // la API responde ella misma «Hay que entrar primero» (401)
    } else if (!(await perfilesDe(env, s.usuario.id)).length) {
      return url.pathname.startsWith('/api/')
        ? new Response(JSON.stringify({ error: 'No encontrado' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
        : new Response(PAGINA_404, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
    }
  }

  const r = await next();
  const resp = new Response(r.body, r);
  if (enPruebas || esGestion) resp.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (esGestion) resp.headers.set('Cache-Control', 'no-store');
  resp.headers.set('X-Content-Type-Options', 'nosniff');
  resp.headers.set('Referrer-Policy', 'same-origin');   // el enlace mágico no sale hacia otras webs
  resp.headers.set('X-Frame-Options', 'DENY');
  return resp;
}
