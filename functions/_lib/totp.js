/* Mi INNAZ · códigos de un solo uso por tiempo (TOTP, RFC 6238) · 27-10-2026
   Compatible con la app Contraseñas del iPhone, Google Authenticator, 1Password, etc.
   SHA-1, 6 cifras, 30 segundos (lo que entienden todas las apps). */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes) {
  let bits = 0, valor = 0, out = '';
  for (const b of bytes) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}

export function deBase32(txt) {
  const limpio = txt.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, valor = 0; const out = [];
  for (const c of limpio) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('base32 no válido');
    valor = (valor << 5) | i; bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

export const nuevoSecreto = () => base32(crypto.getRandomValues(new Uint8Array(20)));   // 160 bits

export const pasoActual = (t = Date.now()) => Math.floor(t / 1000 / 30);

export async function codigoEn(secretoB32, paso) {
  const clave = await crypto.subtle.importKey('raw', deBase32(secretoB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  let p = paso;
  for (let i = 7; i >= 0; i--) { msg[i] = p & 255; p = Math.floor(p / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', clave, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Devuelve el paso que coincide (±1 paso de margen por desfase del reloj) o null.
    'ultimoPaso': el último paso ya usado; un código no se acepta dos veces. */
export async function comprobar(secretoB32, codigo, ultimoPaso = -1, t = Date.now()) {
  if (!/^\d{6}$/.test(codigo || '')) return null;
  const actual = pasoActual(t);
  for (const d of [0, -1, 1]) {
    const paso = actual + d;
    if (paso <= ultimoPaso) continue;
    if ((await codigoEn(secretoB32, paso)) === codigo) return paso;
  }
  return null;
}

export function enlaceOtpauth(secretoB32, cuenta) {
  const etiqueta = encodeURIComponent('INNAZ:' + cuenta);
  return `otpauth://totp/${etiqueta}?secret=${secretoB32}&issuer=INNAZ&algorithm=SHA1&digits=6&period=30`;
}
