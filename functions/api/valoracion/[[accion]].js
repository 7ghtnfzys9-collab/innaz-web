/* ══════════════════════════════════════════════════════════════════════
   VALORACIÓN DEL PÚBLICO · servidor de votos · 22-10-2026
   Cloudflare Pages Functions + base de datos D1 (vinculada con el nombre DB).

   El público puede valorar CUALQUIER espectáculo de la Cartelera (cartelera-data.js),
   tenga o no el Sello de Calidad INNAZ, que es un distintivo aparte que concede el comité.

   Rutas:
     GET  /api/valoracion/notas?nav=<id del navegador>  → notas de los espectáculos con votos
     POST /api/valoracion/votar  {id, estrellas, nav}    → registra un voto

   Decisiones de César (21 y 22-10-2026):
   · Cada ficha de la Cartelera (código MAD-02, SUR-15…) tiene su propia nota.
   · La votación se abre el día de la primera función y se cierra DIAS_TRAS_ULTIMA
     días después de la última (hora de Madrid).
   · Nota = media ponderada bayesiana: nota = (C·M + suma) / (M + n).
   · La nota se muestra a partir de MINIMO votos reales; antes, solo el recuento.
   · Un voto por navegador y espectáculo; la web pide confirmación antes de enviarlo.
   · Freno contra abusos: TOPE_IP_HORA votos por hora desde una misma conexión
     para un mismo espectáculo (en un teatro, todo el público comparte IP).
   · La IP se guarda cifrada (SHA-256 con una «sal» secreta guardada en la propia base).
   ⚠ Los votos van ligados al código del espectáculo: no se cambia ni se reutiliza
     el código de un espectáculo que ya tenga votos.
   Las tablas se crean solas en la primera llamada.
   ══════════════════════════════════════════════════════════════════════ */

const M = 10;
const C = 3.5;
const MINIMO = 10;
const TOPE_IP_HORA = 30;
const DIAS_TRAS_ULTIMA = 15;

const CAB = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CAB });

async function sha256(txt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

let preparada = false;
async function preparar(db) {
  if (preparada) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS votos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prod TEXT NOT NULL,
      estrellas INTEGER NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
      nav TEXT NOT NULL,
      ip TEXT NOT NULL,
      fecha INTEGER NOT NULL,
      UNIQUE (prod, nav))`),
    db.prepare(`CREATE INDEX IF NOT EXISTS votos_ip ON votos (prod, ip, fecha)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`),
  ]);
  preparada = true;
}

async function sal(db) {
  let f = await db.prepare(`SELECT valor FROM ajustes WHERE clave = 'sal'`).first();
  if (!f) {
    const nueva = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
    await db.prepare(`INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('sal', ?)`).bind(nueva).run();
    f = await db.prepare(`SELECT valor FROM ajustes WHERE clave = 'sal'`).first();
  }
  return f.valor;
}

/* Fecha de hoy en Madrid, AAAA-MM-DD. */
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
function masDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/* Espectáculos de la Cartelera con sus fechas: { id: [primera, última] }. */
async function cartelera(env, request) {
  try {
    const txt = await (await env.ASSETS.fetch(new URL('/cartelera-data.js', request.url))).text();
    const i = txt.indexOf('CARTELERA=');
    const L = JSON.parse(txt.slice(txt.indexOf('[', i), txt.lastIndexOf(']') + 1));
    const out = {};
    for (const e of L) {
      const f = (e.f || []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
      if (e.id && f.length) out[e.id] = [f[0], f[f.length - 1]];
    }
    return out;
  } catch (e) {
    return {};
  }
}

const nota = (n, s) => (n >= MINIMO ? Math.round(((C * M + s) / (M + n)) * 10) / 10 : null);

async function resumen(db) {
  const filas = (await db.prepare(`SELECT prod, COUNT(*) AS n, SUM(estrellas) AS s FROM votos GROUP BY prod`).all()).results || [];
  const out = {};
  for (const f of filas) out[f.prod] = { n: f.n, nota: nota(f.n, f.s) };
  return out;
}

export async function onRequest({ request, env, params }) {
  const accion = (params.accion || [])[0] || '';
  if (!env.DB) return resp({ error: 'sin-bd' }, 503);
  const db = env.DB;
  await preparar(db);
  const s = await sal(db);
  const url = new URL(request.url);

  if (accion === 'notas' && request.method === 'GET') {
    const nav = url.searchParams.get('nav') || '';
    let votados = [];
    if (/^[a-f0-9]{32}$/.test(nav)) {
      const navH = await sha256(s + '|nav|' + nav);
      votados = ((await db.prepare(`SELECT prod FROM votos WHERE nav = ?`).bind(navH).all()).results || []).map(f => f.prod);
    }
    return resp({ prods: await resumen(db), votados, minimo: MINIMO, dias: DIAS_TRAS_ULTIMA });
  }

  if (accion === 'votar' && request.method === 'POST') {
    const origen = request.headers.get('Origin');
    if (origen && new URL(origen).host !== url.host) return resp({ error: 'origen' }, 403);
    let d;
    try { d = await request.json(); } catch (e) { return resp({ error: 'datos' }, 400); }
    const id = String(d.id || ''), est = Number(d.estrellas), nav = String(d.nav || '');
    if (!Number.isInteger(est) || est < 1 || est > 5 || !/^[a-f0-9]{32}$/.test(nav)) return resp({ error: 'datos' }, 400);
    const CAR = await cartelera(env, request);
    if (!CAR[id]) return resp({ error: 'datos' }, 400);
    const hoy = hoyMadrid(), [f0, f1] = CAR[id];
    if (hoy < f0) return resp({ error: 'aun-no' }, 403);
    if (hoy > masDias(f1, DIAS_TRAS_ULTIMA)) return resp({ error: 'cerrada' }, 403);
    const ipH = await sha256(s + '|ip|' + id + '|' + (request.headers.get('CF-Connecting-IP') || ''));
    const navH = await sha256(s + '|nav|' + nav);
    const ahora = Date.now();
    if (await db.prepare(`SELECT 1 FROM votos WHERE prod = ? AND nav = ?`).bind(id, navH).first()) return resp({ error: 'ya' }, 409);
    const r = await db.prepare(`SELECT COUNT(*) AS c FROM votos WHERE prod = ? AND ip = ? AND fecha > ?`).bind(id, ipH, ahora - 3600 * 1000).first();
    if (r && r.c >= TOPE_IP_HORA) return resp({ error: 'tope' }, 429);
    try {
      await db.prepare(`INSERT INTO votos (prod, estrellas, nav, ip, fecha) VALUES (?, ?, ?, ?, ?)`).bind(id, est, navH, ipH, ahora).run();
    } catch (e) {
      if (String(e).includes('UNIQUE')) return resp({ error: 'ya' }, 409);
      throw e;
    }
    return resp({ ok: true, prods: await resumen(db) });
  }

  return resp({ error: 'ruta' }, 404);
}
