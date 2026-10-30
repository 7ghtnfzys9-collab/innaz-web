/* ══════════════════════════════════════════════════════════════════════
   Gestión · CONTRASEÑAS de los organizadores · 30-10-2026 (decisión de César)
   · La gestión se abre con correo y contraseña (sin segundo factor).
   · La contraseña nunca se guarda: solo su huella PBKDF2-SHA256 (100.000 vueltas, el máximo de Cloudflare)
     con una sal aleatoria por persona y la sal secreta del servidor (SAL). Así una copia robada de la base no sirve sola.
   · La primera contraseña la crea la propia persona con un enlace de un solo uso (48 h). Igual al olvidarla o
     cuando se la restablecen desde el panel. Los enlaces van en su propia tabla (no sirven para entrar en Mi INNAZ).
   · Mínimo 12 caracteres. Bloqueo temporal tras varios fallos (por persona y por conexión).
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, huella, fichaAleatoria } from './util.js';

export const VUELTAS = 100000;
export const MIN_LARGO = 12;
export const ENLACE_SEGUNDOS = 48 * 3600;
const b64 = u8 => btoa(String.fromCharCode(...new Uint8Array(u8)));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derivar(env, clave, salB64, vueltas) {
  if (!env.SAL) throw new Error('Falta el secreto SAL');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const sal = new Uint8Array([...deB64(salB64), ...new TextEncoder().encode('|' + env.SAL)]);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: vueltas }, base, 256));
}

/** Huella nueva de una contraseña: { hash, sal, vueltas }. */
export async function huellaClave(env, clave) {
  const sal = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { hash: await derivar(env, clave, sal, VUELTAS), sal, vueltas: VUELTAS };
}

/** Compara en tiempo constante. Con fila = null también trabaja (no delata si el correo existe). */
export async function claveCorrecta(env, clave, fila) {
  const h = await derivar(env, String(clave || ''), fila?.sal || 'AAAAAAAAAAAAAAAAAAAAAA==', fila?.vueltas || VUELTAS);
  const a = new TextEncoder().encode(h), b = new TextEncoder().encode(fila?.hash || 'x'.repeat(h.length));
  let dif = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) dif |= a[i] ^ b[i];
  return !!fila && dif === 0;
}

const COMUNES = ['contraseña', 'contrasena', 'password', '123456789012', 'qwertyuiopas', 'innazinnazinnaz', 'zarzuelazarzuela', 'abcdefghijkl'];
/** null si vale; si no, el motivo. */
export function claveNoValida(clave, correo = '') {
  if (typeof clave !== 'string' || [...clave].length < MIN_LARGO) return `La contraseña tiene que tener al menos ${MIN_LARGO} caracteres.`;
  if ([...clave].length > 200) return 'La contraseña es demasiado larga.';
  const l = clave.toLowerCase();
  if (/^(.)\1+$/.test(clave)) return 'La contraseña no puede ser un mismo carácter repetido.';
  if (COMUNES.some(c => l.includes(c))) return 'Esa contraseña es demasiado fácil de adivinar.';
  if (correo && l.includes(correo.split('@')[0].toLowerCase()) && correo.split('@')[0].length >= 4) return 'La contraseña no puede contener tu correo.';
  return null;
}

/** Crea un enlace para poner contraseña (alta, olvido o restablecida). Anula los anteriores de esa persona. Devuelve la ficha. */
export async function nuevoEnlaceClave(env, usuarioId, motivo) {
  const t = ahora(), ficha = fichaAleatoria();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM claves_enlaces WHERE usuario_id = ? OR expira < ?').bind(usuarioId, t),
    env.DB.prepare('INSERT INTO claves_enlaces (huella, usuario_id, motivo, creado, expira) VALUES (?,?,?,?,?)')
      .bind(await huella('clave|' + ficha), usuarioId, motivo, t, t + ENLACE_SEGUNDOS),
  ]);
  return ficha;
}
/** Gasta el enlace (una sola vez). Devuelve { usuario_id, motivo } o null. */
export async function gastarEnlaceClave(env, ficha) {
  if (typeof ficha !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(ficha)) return null;
  return env.DB.prepare('DELETE FROM claves_enlaces WHERE huella = ? AND expira > ? RETURNING usuario_id, motivo')
    .bind(await huella('clave|' + ficha), ahora()).first();
}
/** Sin gastarlo: ¿vale todavía? (para mostrar el formulario). */
export async function enlaceClaveVigente(env, ficha) {
  if (typeof ficha !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(ficha)) return null;
  return env.DB.prepare('SELECT e.motivo, u.correo, u.nombre FROM claves_enlaces e JOIN usuarios u ON u.id = e.usuario_id WHERE e.huella = ? AND e.expira > ?')
    .bind(await huella('clave|' + ficha), ahora()).first();
}
export const tieneClave = async (env, usuarioId) => !!(await env.DB.prepare('SELECT 1 FROM claves WHERE usuario_id = ?').bind(usuarioId).first());
