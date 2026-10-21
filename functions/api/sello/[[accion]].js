/* ══════════════════════════════════════════════════════════════════════
   SELLO DE CALIDAD INNAZ · servidor de votos · 21-10-2026
   Cloudflare Pages Functions + base de datos D1 (vinculada con el nombre DB).

   Rutas:
     GET  /api/sello/notas?nav=<id del navegador>  → notas de todas las producciones
     POST /api/sello/votar  {prod, estrellas, nav}  → registra un voto

   Decisiones de César (21-10-2026):
   · Nota = media ponderada bayesiana: cada producción empieza con M votos
     «neutros» de valor C. nota = (C·M + suma) / (M + n).
   · La nota solo se muestra a partir de MINIMO votos reales; antes, solo el recuento.
   · Un voto por navegador y producción (no se puede cambiar: la web pide
     confirmación antes de enviarlo).
   · Freno contra abusos: como mucho TOPE_IP_HORA votos por hora desde la misma
     conexión para una misma producción (en un teatro, todo el público comparte IP).
   · La IP no se guarda tal cual: se guarda cifrada (SHA-256 con una «sal» secreta
     que se genera sola la primera vez y vive en la propia base de datos).
   Las tablas se crean solas en la primera llamada: no hay que escribir SQL.
   ══════════════════════════════════════════════════════════════════════ */

const M = 10;             // votos neutros de partida
const C = 3.5;            // valor de esos votos neutros
const MINIMO = 10;        // votos reales necesarios para mostrar la nota
const TOPE_IP_HORA = 30;  // votos por hora, misma IP y misma producción

const JSON_CAB = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const resp = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_CAB });

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
  let fila = await db.prepare(`SELECT valor FROM ajustes WHERE clave = 'sal'`).first();
  if (!fila) {
    const nueva = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
    await db.prepare(`INSERT OR IGNORE INTO ajustes (clave, valor) VALUES ('sal', ?)`).bind(nueva).run();
    fila = await db.prepare(`SELECT valor FROM ajustes WHERE clave = 'sal'`).first();
  }
  return fila.valor;
}

/* Las producciones válidas son las de sello-data.js (la misma lista que ve la web). */
async function produccionesValidas(env, request) {
  try {
    const r = await env.ASSETS.fetch(new URL('/sello-data.js', request.url));
    const txt = await r.text();
    const i = txt.indexOf('const PRODUCCIONES');
    if (i < 0) return new Set();
    const lista = txt.slice(i, txt.indexOf('];', i) + 2);
    return new Set([...lista.matchAll(/\bid\s*:\s*['"]([a-z0-9-]{1,60})['"]/g)].map(m => m[1]));
  } catch (e) {
    return new Set();
  }
}

const nota = (n, suma) => (n >= MINIMO ? Math.round(((C * M + suma) / (M + n)) * 10) / 10 : null);

async function resumen(db, prods) {
  const filas = (await db.prepare(`SELECT prod, COUNT(*) AS n, SUM(estrellas) AS s FROM votos GROUP BY prod`).all()).results || [];
  const out = {};
  for (const p of prods) out[p] = { n: 0, nota: null };
  for (const f of filas) if (out[f.prod]) out[f.prod] = { n: f.n, nota: nota(f.n, f.s) };
  return out;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const accion = (params.accion || [])[0] || '';
  if (!env.DB) return resp({ error: 'sin-bd' }, 503);
  const db = env.DB;
  await preparar(db);
  const prods = await produccionesValidas(env, request);
  const s = await sal(db);
  const url = new URL(request.url);

  if (accion === 'notas' && request.method === 'GET') {
    const nav = url.searchParams.get('nav') || '';
    let votados = [];
    if (/^[a-f0-9]{32}$/.test(nav)) {
      const navH = await sha256(s + '|nav|' + nav);
      votados = ((await db.prepare(`SELECT prod FROM votos WHERE nav = ?`).bind(navH).all()).results || []).map(f => f.prod);
    }
    return resp({ prods: await resumen(db, prods), votados, minimo: MINIMO });
  }

  if (accion === 'votar' && request.method === 'POST') {
    const origen = request.headers.get('Origin');
    if (origen && new URL(origen).host !== url.host) return resp({ error: 'origen' }, 403);
    let d;
    try { d = await request.json(); } catch (e) { return resp({ error: 'datos' }, 400); }
    const prod = String(d.prod || ''), est = Number(d.estrellas), nav = String(d.nav || '');
    if (!prods.has(prod) || !Number.isInteger(est) || est < 1 || est > 5 || !/^[a-f0-9]{32}$/.test(nav)) {
      return resp({ error: 'datos' }, 400);
    }
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ipH = await sha256(s + '|ip|' + prod + '|' + ip);
    const navH = await sha256(s + '|nav|' + nav);
    const ahora = Date.now();
    const yaVoto = await db.prepare(`SELECT 1 FROM votos WHERE prod = ? AND nav = ?`).bind(prod, navH).first();
    if (yaVoto) return resp({ error: 'ya' }, 409);
    const recientes = await db.prepare(`SELECT COUNT(*) AS c FROM votos WHERE prod = ? AND ip = ? AND fecha > ?`)
      .bind(prod, ipH, ahora - 3600 * 1000).first();
    if (recientes && recientes.c >= TOPE_IP_HORA) return resp({ error: 'tope' }, 429);
    try {
      await db.prepare(`INSERT INTO votos (prod, estrellas, nav, ip, fecha) VALUES (?, ?, ?, ?, ?)`)
        .bind(prod, est, navH, ipH, ahora).run();
    } catch (e) {
      if (String(e).includes('UNIQUE')) return resp({ error: 'ya' }, 409);
      throw e;
    }
    return resp({ ok: true, prods: await resumen(db, prods) });
  }

  return resp({ error: 'ruta' }, 404);
}
