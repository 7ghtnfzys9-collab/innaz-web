/* innaz-marco.js · 30-10-2026 · Comportamiento común de la cabecera de innaz.es en las páginas de Mi INNAZ:
   desplegables del menú, aviso de pruebas, «Z» de INNAZ en turquesa y el botón «Entrar» / «Mi INNAZ».
   El botón: pregunta a /api/acceso/yo una vez (se recuerda 1 minuto en sessionStorage). Con sesión, «Entrar» pasa a
   «Mi INNAZ»; si la ruta no existe (interruptor MI_INNAZ apagado, p. ej. en innaz.es antes del paso a real), se oculta. */
(function () {
  document.body.classList.add('con-marco');
  if (/\.pages\.dev$/.test(location.hostname)) document.body.classList.add('es-pruebas');

  /* Desplegables (misma lógica que en las páginas públicas, 30-8-2026) */
  var ds = document.querySelectorAll('.zz-drop');
  function cerrar(d) { d.classList.remove('open'); var t = d.querySelector('.zz-drop-t'); if (t) t.setAttribute('aria-expanded', 'false'); }
  ds.forEach(function (d) {
    var t = d.querySelector('.zz-drop-t');
    if (t) t.addEventListener('click', function (e) {
      e.preventDefault();
      ds.forEach(function (o) { if (o !== d) cerrar(o); });
      var abierto = d.classList.toggle('open');
      t.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
    d.querySelectorAll('.zz-drop-m a').forEach(function (a) {
      a.addEventListener('click', function () { cerrar(d); var nl = document.getElementById('navlinks'); if (nl) nl.classList.remove('open'); });
    });
  });
  document.addEventListener('click', function (e) { ds.forEach(function (d) { if (!d.contains(e.target)) cerrar(d); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ds.forEach(cerrar); });

  /* «Z» de INNAZ en turquesa en todo el texto: misma función que las páginas públicas (PALETA-SECCIONES) */
  (function(){var SEL='h1,h2,h3,h4,h5,h6,.section-label,.label,.hero-label,.hero-fullname,.nav-logo,.footer-logo,p,li,td,dd,figcaption,blockquote';function fondo(e){for(;e&&e.nodeType===1;e=e.parentElement){var c=getComputedStyle(e).backgroundColor,m=c.match(/[\d.]+/g);if(m&&(m.length<4||+m[3]>0.5))return (0.299*m[0]+0.587*m[1]+0.114*m[2])<128;}return false;}function pinta(w){}function f(r){(r||document).querySelectorAll(SEL).forEach(function(el){if(el.closest('a.btn,button,.nav-cta'))return;if(el.matches('p,li,td,dd,figcaption,blockquote')&&el.closest('nav,footer,.nav-links'))return;var tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),ns=[],t;while(t=tw.nextNode())if(/INNAZ/.test(t.nodeValue)&&!(t.parentElement.closest('.innaz-w')))ns.push(t);ns.forEach(function(t){var fr=document.createDocumentFragment();t.nodeValue.split(/(INNAZ)/).forEach(function(p){if(p==='INNAZ'){var w=document.createElement('span');w.className='innaz-w';w.appendChild(document.createTextNode('INNA'));var z=document.createElement('span');z.className='innaz-z';z.textContent='Z';z.style.setProperty('color','#0097B2','important');w.appendChild(z);fr.appendChild(w);}else if(p)fr.appendChild(document.createTextNode(p));});t.parentNode.replaceChild(fr,t);});});document.querySelectorAll('.innaz-w').forEach(pinta);}function go(){f();var p=0;new MutationObserver(function(){if(p)return;p=setTimeout(function(){p=0;f();},120);}).observe(document.body,{childList:true,subtree:true});addEventListener('load',function(){document.querySelectorAll('.innaz-w').forEach(pinta);});}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();})();

  /* Botón Entrar / Mi INNAZ */
  var btn = document.getElementById('nav-entrar');
  if (!btn) return;
  function pintar(yo) {
    if (!yo) { btn.closest('li').style.display = 'none'; return; }
    if (yo.conectado) {
      btn.textContent = 'Mi INNAZ';
      btn.href = 'mi-innaz.html';
      btn.title = yo.nombre ? yo.nombre : '';
    }
  }
  /* En las páginas de Mi INNAZ (donde se entra y se sale) no vale la copia guardada: se pregunta siempre */
  var propia = /^\/(entrar|acceder|mi-innaz|suscripciones|zlabs-)/.test(location.pathname);
  try {
    if (propia) sessionStorage.removeItem('innaz-yo');
    var c = sessionStorage.getItem('innaz-yo'), ahora = Date.now();
    if (c) { c = JSON.parse(c); if (ahora - c.t < 60 * 1000) { pintar(c.yo); return; } }
  } catch (e) {}
  fetch('/api/acceso/yo', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.status === 404 ? null : r.json(); })
    .then(function (yo) { try { sessionStorage.setItem('innaz-yo', JSON.stringify({ t: Date.now(), yo: yo })); } catch (e) {} pintar(yo); })
    .catch(function () {});
})();
