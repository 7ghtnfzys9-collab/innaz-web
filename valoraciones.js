/* ══════════════════════════════════════════════════════════════════════
   VALORACIÓN DEL PÚBLICO · código común de la web · 22-10-2026
   Lo usan la Cartelera, la ficha de obra (Representaciones), el Sello y la portada.

   Cómo se usa en una página:
     1. <script src="valoraciones.js"></script>
     2. Donde deba ir la valoración de un espectáculo de la Cartelera, se pone:
          VAL.hueco(id, primeraFecha, ultimaFecha, titulo)
        (devuelve un <div class="val" …> vacío). El código lo rellena solo, también
        cuando la página vuelve a pintar la lista (búsquedas, filtros…).

   Reglas (decisiones de César, 21 y 22-10-2026), las mismas que aplica el servidor
   (functions/api/valoracion/[[accion]].js):
   · Se puede valorar desde el día de la primera función hasta 15 días después de la última.
   · La nota (media ponderada bayesiana) se ve a partir de 10 votos; antes, solo el recuento.
   · Un voto por navegador y espectáculo, con pregunta de confirmación antes de enviarlo.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  const API = '/api/valoracion';
  const DIAS = 15, MINIMO = 10;
  const CONFIRMA = {
    5: '¡Bravo y bis! ¿Confirmas 5 estrellas?',
    4: 'Casi para pedir el bis. ¿Confirmas 4 estrellas?',
    3: 'Ni chicha ni limoná. ¿Confirmas 3 estrellas?',
    2: '¿Se te ha hecho largo? ¿Lo dejamos en 2 estrellas?',
    1: '¿Ni la romanza lo ha salvado? ¿Confirmas 1 estrella?'
  };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hoy = (d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(new Date());
  function masDias(iso, n) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }

  let notas = {}, votados = [], cargado = false, promesa = null;

  function nav() {
    try {
      let t = localStorage.getItem('innaz_nav');
      if (!/^[a-f0-9]{32}$/.test(t || '')) {
        t = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('innaz_nav', t);
      }
      return t;
    } catch (e) { return ''; }
  }
  function cargar() {
    if (promesa) return promesa;
    promesa = fetch(API + '/notas?nav=' + nav(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { notas = d.prods || {}; votados = d.votados || []; } cargado = true; pintar(); })
      .catch(() => { cargado = true; pintar(); });
    return promesa;
  }
  /* Grupos de «mismo espectáculo» (valoraciones-grupos.js) y Sello (sello-data.js). */
  function grupo(id) {
    const G = typeof GRUPOS_ESPECTACULO !== 'undefined' ? GRUPOS_ESPECTACULO : {};
    for (const ids of Object.values(G)) if (ids.includes(id)) return ids;
    return [id];
  }
  function selloDe(id) {
    if (typeof PRODUCCIONES === 'undefined') return null;
    const g = grupo(id);
    return PRODUCCIONES.find(p => [].concat(p.cartelera || []).some(c => g.includes(c))) || null;
  }
  const sello = id => selloDe(id) ? '<span class="val-sello" title="Concedido por el comité de INNAZ">✦ Sello de Calidad INNAZ</span>' : '';
  const yaVotado = id => grupo(id).some(x => votados.includes(x) || (() => { try { return !!localStorage.getItem('innaz_val_' + x); } catch (e) { return false; } })());
  const abierta = (f0, f1) => !!f0 && hoy >= f0 && hoy <= masDias(f1 || f0, DIAS);

  function hueco(id, f0, f1, titulo) {
    return `<div class="val" data-val="${esc(id)}" data-f0="${esc(f0 || '')}" data-f1="${esc(f1 || f0 || '')}" data-t="${esc(titulo || '')}"></div>`;
  }

  function contenido(el) {
    const id = el.dataset.val, f0 = el.dataset.f0, f1 = el.dataset.f1;
    const x = notas[id] || { n: 0, nota: null };
    const ab = abierta(f0, f1), voto = yaVotado(id);
    const votos = x.n === 1 ? '1 voto' : x.n.toLocaleString('es-ES') + ' votos';
    let h = sello(id);
    if (x.nota !== null && x.nota !== undefined) {
      h += `<span class="val-rot">Valoración del público</span>
        <span class="val-est" aria-label="${x.nota.toFixed(1).replace('.', ',')} sobre 5">★★★★★<span class="val-fill" style="width:${(x.nota / 5 * 100).toFixed(1)}%">★★★★★</span></span>
        <span class="val-num">${x.nota.toFixed(1).replace('.', ',')}</span><span class="val-n">(${votos})</span>`;
    } else if (x.n > 0) {
      h += `<span class="val-rot">Valoración del público</span><span class="val-n">Todavía hay pocas valoraciones · ${votos}</span>`;
    }
    if (ab && cargado) {
      h += voto ? `<span class="val-ya">✓ Ya has valorado este espectáculo</span>`
                : `<button type="button" class="val-btn" data-val-abrir="${esc(id)}">★ Valorar</button>`;
    }
    return h;
  }
  function pintar(raiz) {
    (raiz || document).querySelectorAll('.val[data-val]').forEach(el => {
      const h = contenido(el);
      if (el.innerHTML !== h) el.innerHTML = h;
      el.hidden = !h;
    });
  }

  /* ── Ventana de votación ── */
  let actual = null, elegido = 0, modal = null;
  function css() {
    const s = document.createElement('style');
    s.textContent = `
      .val{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;margin:.6rem 0 .2rem;font-size:.8rem;color:var(--muted,#6b6b6b);}
      .val[hidden]{display:none;}
      .val-rot{font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;}
      .val-sello,.val-sello-sola{display:inline-block;font-size:.64rem;letter-spacing:.12em;text-transform:uppercase;color:#fff;background:#8E3346;padding:.25rem .6rem;border-radius:2px;white-space:nowrap;}
      .val-est{position:relative;display:inline-block;color:#d9d4cb;letter-spacing:.06em;font-size:.95rem;line-height:1;}
      .val-fill{position:absolute;left:0;top:0;overflow:hidden;white-space:nowrap;color:#E3A62F;}
      .val-num{font-family:'Cormorant',serif;font-size:1.25rem;font-weight:600;color:var(--black,#111);}
      .val-btn{font:inherit;font-size:.7rem;letter-spacing:.09em;text-transform:uppercase;color:var(--teal-dark,#1b8a96);background:none;border:1.5px solid var(--teal-dark,#1b8a96);border-radius:22px;padding:.35rem .85rem;cursor:pointer;}
      .val-btn:hover{background:var(--teal-dark,#1b8a96);color:#fff;}
      .val-ya{font-size:.75rem;color:var(--teal-dark,#1b8a96);}
      .valm{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:9999;padding:16px;}
      .valm.on{display:flex;}
      .valm-c{position:relative;background:#f8f5ef;color:#111;max-width:440px;width:100%;padding:2.2rem 1.8rem 1.8rem;text-align:center;border-radius:3px;}
      .valm-x{position:absolute;top:.6rem;right:.8rem;background:none;border:0;font-size:1.1rem;cursor:pointer;color:#777;}
      .valm h3{font-family:'Cormorant',serif;font-size:1.6rem;font-weight:600;margin:0 0 .3rem;line-height:1.15;}
      .valm-sub{font-size:.82rem;color:#777;margin:0 0 1.2rem;}
      .valm-est{display:flex;justify-content:center;gap:.4rem;margin:1rem 0;}
      .valm-est button{background:none;border:0;font-size:2.2rem;line-height:1;color:#d9d4cb;cursor:pointer;transition:transform .1s;}
      .valm-est button.on{color:#E3A62F;}
      .valm-est button:hover{transform:scale(1.12);}
      .valm-conf{display:none;margin-top:.8rem;}
      .valm-preg{font-family:'Cormorant',serif;font-style:italic;font-size:1.35rem;line-height:1.3;margin:0 0 1rem;}
      .valm-bot{display:flex;justify-content:center;gap:.8rem;flex-wrap:wrap;}
      .valm-si{font:inherit;font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--teal-dark,#1b8a96);background:none;border:1.5px solid var(--teal-dark,#1b8a96);padding:.75rem 1.6rem;cursor:pointer;}
      .valm-si:hover{background:var(--teal-dark,#1b8a96);color:#fff;}
      .valm-no{background:none;border:0;font:inherit;font-size:.8rem;color:#777;text-decoration:underline;cursor:pointer;}
      .valm-msg{display:none;font-size:.92rem;padding:.9rem 1rem;margin-top:.6rem;color:var(--teal-dark,#1b8a96);background:rgba(42,171,184,.1);border:1px solid rgba(42,171,184,.25);}
      .valm-msg.err{color:#8a4b12;background:#fbf1e4;border-color:rgba(138,75,18,.25);}`;
    document.head.appendChild(s);
  }
  function crearModal() {
    if (modal) return modal;
    css();
    modal = document.createElement('div');
    modal.className = 'valm';
    modal.innerHTML = `<div class="valm-c" role="dialog" aria-modal="true" aria-labelledby="valmT">
      <button type="button" class="valm-x" aria-label="Cerrar">✕</button>
      <h3 id="valmT"></h3>
      <p class="valm-sub">¿Qué te ha parecido el espectáculo? Puntúa de 1 a 5 estrellas.</p>
      <div class="valm-est"></div>
      <div class="valm-conf"><p class="valm-preg"></p>
        <div class="valm-bot"><button type="button" class="valm-si">Sí, confirmo</button><button type="button" class="valm-no">Me he equivocado</button></div></div>
      <p class="valm-msg"></p></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.valm-x')) cerrar(); });
    modal.querySelector('.valm-no').onclick = () => abrir(actual.id, actual.t);
    modal.querySelector('.valm-si').onclick = enviar;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
    return modal;
  }
  function estrellas(n) { modal.querySelectorAll('.valm-est button').forEach((b, i) => b.classList.toggle('on', i < n)); }
  function abrir(id, titulo) {
    crearModal();
    actual = { id, t: titulo }; elegido = 0;
    modal.querySelector('#valmT').textContent = titulo || 'Valora el espectáculo';
    const est = modal.querySelector('.valm-est');
    est.style.display = 'flex'; est.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '★'; b.setAttribute('aria-label', i + (i === 1 ? ' estrella' : ' estrellas'));
      b.onmouseenter = () => { if (!elegido) estrellas(i); };
      b.onmouseleave = () => { if (!elegido) estrellas(0); };
      b.onclick = () => { elegido = i; estrellas(i); modal.querySelector('.valm-preg').textContent = CONFIRMA[i]; modal.querySelector('.valm-conf').style.display = 'block'; };
      est.appendChild(b);
    }
    modal.querySelector('.valm-conf').style.display = 'none';
    const m = modal.querySelector('.valm-msg'); m.style.display = 'none'; m.className = 'valm-msg';
    modal.classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function cerrar() { if (!modal) return; modal.classList.remove('on'); document.body.style.overflow = ''; actual = null; }
  async function enviar() {
    if (!actual || !elegido) return;
    const id = actual.id, si = modal.querySelector('.valm-si');
    si.disabled = true;
    let r = { ok: false, status: 0 };
    try {
      const res = await fetch(API + '/votar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estrellas: elegido, nav: nav() }) });
      let d = {}; try { d = await res.json(); } catch (e) {}
      r = Object.assign({ ok: res.ok, status: res.status }, d);
    } catch (e) {}
    si.disabled = false;
    modal.querySelector('.valm-est').style.display = 'none';
    modal.querySelector('.valm-conf').style.display = 'none';
    const m = modal.querySelector('.valm-msg');
    const MSG = {
      ya: 'Ya habías valorado este espectáculo desde este navegador.',
      tope: 'Hemos recibido muchos votos desde tu conexión en la última hora. Inténtalo un poco más tarde.',
      'aun-no': 'La valoración se abre el día de la primera función.',
      cerrada: 'La valoración de este espectáculo ya está cerrada.'
    };
    if (r.ok || r.error === 'ya') {
      try { localStorage.setItem('innaz_val_' + id, elegido); } catch (e) {}
      if (!votados.includes(id)) votados.push(id);
      if (r.prods) notas = r.prods;
      m.className = 'valm-msg'; m.textContent = r.ok ? '✓ ¡Gracias por tu voto!' : MSG.ya;
      pintar();
      setTimeout(cerrar, 2600);
    } else {
      m.className = 'valm-msg err';
      m.textContent = MSG[r.error] || 'No hemos podido registrar tu voto. Inténtalo de nuevo dentro de un rato.';
    }
    m.style.display = 'block';
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-val-abrir]');
    if (!b) return;
    const el = b.closest('.val');
    abrir(b.dataset.valAbrir, el ? el.dataset.t : '');
  });

  /* Rellena los huecos nuevos cuando la página vuelve a pintar listas. */
  function vigilar() {
    if (!document.querySelector('style[data-val-css]')) {
      const s = document.createElement('style'); s.dataset.valCss = '1';
      s.textContent = '.val{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;margin:.6rem 0 .2rem;font-size:.8rem;}.val[hidden]{display:none;}';
      document.head.appendChild(s);
    }
    crearModal();
    let p = 0;
    new MutationObserver(() => { if (p) return; p = setTimeout(() => { p = 0; pintar(); }, 50); })
      .observe(document.body, { childList: true, subtree: true });
    pintar();
    cargar().then(irAValorar);
    window.addEventListener('hashchange', irAValorar);
  }
  /* Enlace o QR directo a la votación: …#valorar-<código> (también vale #votar-<código>). */
  function irAValorar() {
    const m = decodeURIComponent(location.hash).match(/^#(?:valorar|votar)-(.+)$/);
    if (!m) return;
    const el = document.querySelector('.val[data-val="' + (window.CSS && CSS.escape ? CSS.escape(m[1]) : m[1]) + '"]');
    if (!el || !abierta(el.dataset.f0, el.dataset.f1) || yaVotado(m[1])) return;
    el.scrollIntoView({ block: 'center' });
    setTimeout(() => abrir(m[1], el.dataset.t), 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', vigilar); else vigilar();

  window.VAL = { hueco, abierta, cargar, pintar, abrir, grupo, selloDe,
    /* Distintivo suelto, para listas que no llevan valoración (Próximas funciones…). */
    sello: id => selloDe(id) ? '<span class="val-sello-sola" title="Concedido por el comité de INNAZ">✦ Sello de Calidad INNAZ</span>' : '',
    nota: id => notas[id] || { n: 0, nota: null }, DIAS, MINIMO };
})();
