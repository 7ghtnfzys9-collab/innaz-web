/* innaz-sesion.js · 30-10-2026 · Unión de Mi INNAZ con las páginas públicas de innaz.es
   Pregunta a /api/acceso/estado (solo conectado, nombre de pila y códigos de ventaja; como mucho una vez por minuto, en sessionStorage).
   · Si Mi INNAZ está APAGADO (la ruta da 404: innaz.es hasta el paso a real) o hay un error, NO cambia nada:
     la página queda exactamente como antes de la unión.
   · Si está ENCENDIDO:
       – «Suscríbete» del menú lleva a /suscripciones (en la portada sigue bajando al bloque #socio) y los botones
         de los niveles de la portada abren /suscripciones con su nivel;
       – aparece «Entrar» en el menú; con sesión, «Mi INNAZ»;
       – bloqueo de ventajas: cada elemento con data-ventaja="CÓDIGO" se desactiva si la persona no tiene esa
         ventaja, con un aviso (data-ventaja-titulo y data-ventaja-nivel). Es solo para comodidades del navegador
         (p. ej. A2, filtros combinados): lo descargable o de pago se bloquea SIEMPRE en el servidor. */
(function () {
  var CLAVE = 'innaz-yo', VIDA = 60 * 1000;
  var NIVEL = { Simpatizante: 'simpatizante', Colaborador: 'colaborador', Protector: 'protector', Mecenas: 'mecenas' };

  function leer() { try { var c = JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); if (c && Date.now() - c.t < (c.yo ? VIDA : 30 * VIDA)) return c; } catch (e) {} return null; }   // apagado: se vuelve a preguntar a la media hora
  function guardar(yo) { try { sessionStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), yo: yo })); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function estilos() {
    if (document.getElementById('innaz-sesion-css')) return;
    var s = document.createElement('style'); s.id = 'innaz-sesion-css';
    s.textContent =
      '.ventaja-cerrada{opacity:.45;pointer-events:none;filter:grayscale(.3);user-select:none;}' +
      '.ventaja-aviso{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1rem;margin:.7rem 0 0;padding:.75rem 1rem;' +
      'background:#F3EFE8;background:color-mix(in srgb,var(--inst,#0097B2) 9%,#fff);border-left:3px solid var(--inst,#0097B2);' +
      'font-size:.84rem;line-height:1.5;color:#1A1A1A;}' +
      '.ventaja-aviso b{font-weight:600;}.ventaja-aviso .va-acc{display:flex;gap:.9rem;margin-left:auto;}' +
      '.ventaja-aviso a{color:#1A1A1A;font-weight:500;text-decoration:underline;text-decoration-color:var(--inst,#0097B2);text-decoration-thickness:2px;text-underline-offset:3px;}' +
      '@media(max-width:560px){.ventaja-aviso .va-acc{margin-left:0;}}';
    document.head.appendChild(s);
  }

  function bloquear(el, yo) {
    if (el.classList.contains('ventaja-cerrada')) return;
    el.classList.add('ventaja-cerrada'); el.setAttribute('aria-disabled', 'true');
    el.querySelectorAll('select,input,button,textarea').forEach(function (x) { x.disabled = true; x.tabIndex = -1; });
    var titulo = el.getAttribute('data-ventaja-titulo') || 'Esta herramienta';
    var nivel = el.getAttribute('data-ventaja-nivel') || 'Simpatizante';
    var volver = encodeURIComponent(location.pathname + location.search);
    var acc = yo && yo.conectado
      ? '<a href="/suscripciones">Ver suscripciones</a>'
      : '<a href="/entrar?volver=' + volver + '">Entrar</a><a href="/suscripciones">Suscríbete</a>';
    var aviso = document.createElement('div'); aviso.className = 'ventaja-aviso'; aviso.setAttribute('role', 'note');
    aviso.innerHTML = '<span><b>' + esc(titulo) + '</b> · ventaja para suscriptores desde el nivel ' + esc(nivel) +
      (yo && yo.conectado ? '. Tu nivel actual no la incluye.' : '.') + '</span><span class="va-acc">' + acc + '</span>';
    el.parentNode.insertBefore(aviso, el);
  }

  function aplicar(yo) {
    if (!yo) return;   // Mi INNAZ apagado o error: todo como siempre
    // Menú: Suscríbete → /suscripciones (salvo en la portada, que tiene el bloque #socio)
    document.querySelectorAll('a.nav-cta').forEach(function (a) { if (a.getAttribute('href') !== '#socio') a.href = '/suscripciones'; });
    // Portada: los botones de los niveles abren /suscripciones con su nivel (antes, aviso «Muy pronto»)
    if (typeof window.solicitarPlan === 'function') {
      window.solicitarPlan = function (p) { location.href = '/suscripciones' + (NIVEL[p] ? '?nivel=' + NIVEL[p] : ''); };
    }
    // Entrar / Mi INNAZ
    var li = document.getElementById('nav-entrar-li'), a = document.getElementById('nav-entrar');
    if (li && a) {
      if (yo.conectado) { a.textContent = 'Mi INNAZ'; a.href = '/mi-innaz'; if (yo.nombre) a.title = yo.nombre; }
      li.style.display = '';
    }
    // Ventajas
    var tengo = {};
    (yo.ventajas || []).forEach(function (v) { tengo[typeof v === 'string' ? v : v.codigo] = 1; });
    var cerradas = [].slice.call(document.querySelectorAll('[data-ventaja]')).filter(function (el) { return !tengo[el.getAttribute('data-ventaja')]; });
    if (cerradas.length) { estilos(); cerradas.forEach(function (el) { bloquear(el, yo); }); }
  }

  function arrancar() {
    var c = leer();
    if (c) { aplicar(c.yo); return; }
    fetch('/api/acceso/estado', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })     // 404 = Mi INNAZ apagado
      .then(function (yo) { guardar(yo); aplicar(yo); })
      .catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
})();
