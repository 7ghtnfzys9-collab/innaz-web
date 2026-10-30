/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · LLAVES DE ACCESO (passkeys / WebAuthn) · 29-10-2026
   Verificación hecha a mano, sin librerías: CBOR mínimo, claves EC P-256 (ES256) y RSA (RS256),
   firmas con la criptografía del propio Cloudflare (WebCrypto).
   · El navegador crea la llave en el aparato (Face ID / Touch ID / código del aparato); aquí solo se guarda la parte pública.
   · Una llave con verificación del usuario (UV) vale por los dos factores: con ella se entra en la gestión sin el código de 6 cifras.
   · rpId = el dominio de la web (BASE_URL). Los retos duran 5 minutos y son de un solo uso.
   ══════════════════════════════════════════════════════════════════════ */

export const b64u = u8 => btoa(String.fromCharCode(...new Uint8Array(u8))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function deB64u(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url');
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
}
const sha256 = async u8 => new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** rpId y origen esperados, a partir de BASE_URL (en pruebas/local, del propio origen de la petición). */
export function relyingParty(env, request) {
  const origen = (env.BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  return { rpId: new URL(origen).hostname, origen, nombre: 'INNAZ' };
}

/* ── CBOR (solo lo que usa WebAuthn) ── */
export function cbor(u8) {
  let i = 0;
  const leer = () => {
    if (i >= u8.length) throw new Error('cbor: corto');
    const b = u8[i++], mt = b >> 5, ai = b & 31;
    let n;
    if (ai < 24) n = ai;
    else if (ai === 24) n = u8[i++];
    else if (ai === 25) { n = (u8[i] << 8) | u8[i + 1]; i += 2; }
    else if (ai === 26) { n = ((u8[i] << 24) >>> 0) + (u8[i + 1] << 16) + (u8[i + 2] << 8) + u8[i + 3]; i += 4; }
    else if (ai === 27) { n = 0; for (let k = 0; k < 8; k++) n = n * 256 + u8[i + k]; i += 8; }
    else throw new Error('cbor: tamaño no admitido');
    switch (mt) {
      case 0: return n;
      case 1: return -1 - n;
      case 2: { const v = u8.slice(i, i + n); i += n; return v; }
      case 3: { const v = new TextDecoder().decode(u8.slice(i, i + n)); i += n; return v; }
      case 4: { const a = []; for (let k = 0; k < n; k++) a.push(leer()); return a; }
      case 5: { const m = new Map(); for (let k = 0; k < n; k++) { const c = leer(); m.set(c, leer()); } return m; }
      case 7: if (ai === 20) return false; if (ai === 21) return true; if (ai === 22) return null; throw new Error('cbor: simple no admitido');
      default: throw new Error('cbor: tipo no admitido');
    }
  };
  const v = leer();
  return { valor: v, resto: u8.slice(i) };
}

/* ── authenticatorData ── */
export function leerAuthData(u8) {
  if (u8.length < 37) throw new Error('authData corto');
  const rpIdHash = u8.slice(0, 32), flags = u8[32];
  const contador = ((u8[33] << 24) >>> 0) + (u8[34] << 16) + (u8[35] << 8) + u8[36];
  const r = { rpIdHash, flags, up: !!(flags & 1), uv: !!(flags & 4), be: !!(flags & 8), bs: !!(flags & 16), at: !!(flags & 64), contador, credencial: null };
  if (r.at) {
    const aaguid = u8.slice(37, 53), len = (u8[53] << 8) | u8[54], id = u8.slice(55, 55 + len);
    const { valor: cose } = cbor(u8.slice(55 + len));
    r.credencial = { aaguid, id, cose };
  }
  return r;
}

/** Clave COSE → { jwk, alg } (solo ES256 y RS256). */
export function coseAJwk(cose) {
  if (!(cose instanceof Map)) throw new Error('clave no válida');
  const kty = cose.get(1), alg = cose.get(3);
  if (kty === 2 && alg === -7 && cose.get(-1) === 1) {
    return { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: b64u(cose.get(-2)), y: b64u(cose.get(-3)) } };
  }
  if (kty === 3 && alg === -257) {
    return { alg: -257, jwk: { kty: 'RSA', n: b64u(cose.get(-1)), e: b64u(cose.get(-2)) } };
  }
  throw new Error('Tipo de llave no admitido (solo ES256 y RS256)');
}

/** Firma DER (ECDSA) → r||s de 64 bytes, que es lo que espera WebCrypto. */
function derARaw(der) {
  if (der[0] !== 0x30) throw new Error('firma DER');
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const leerInt = () => { if (der[i++] !== 0x02) throw new Error('firma DER'); let l = der[i++]; let v = der.slice(i, i + l); i += l;
    while (v.length > 32 && v[0] === 0) v = v.slice(1); const out = new Uint8Array(32); out.set(v, 32 - v.length); return out; };
  const r = leerInt(), s = leerInt(); const out = new Uint8Array(64); out.set(r); out.set(s, 32); return out;
}

export async function verificarFirma(alg, jwk, datos, firma) {
  if (alg === -7) {
    const k = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, derARaw(firma), datos);
  }
  if (alg === -257) {
    const k = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256' }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', k, firma, datos);
  }
  return false;
}

/** clientDataJSON: comprueba tipo, reto y origen. Devuelve el hash (para la firma). */
async function leerClientData(cdjB64u, tipo, reto, origen) {
  const u8 = deB64u(cdjB64u);
  let cd; try { cd = JSON.parse(new TextDecoder().decode(u8)); } catch { throw new Error('clientData'); }
  if (cd.type !== tipo) throw new Error('El tipo de operación no coincide.');
  if (cd.challenge !== reto) throw new Error('El reto no coincide (¿ha pasado el tiempo?).');
  if (cd.origin !== origen) throw new Error('El origen no coincide: ' + cd.origin);
  return sha256(u8);
}

/** REGISTRO: comprueba la respuesta de navigator.credentials.create(). Devuelve { id, jwk, alg, contador, transportes, respaldada }. */
export async function comprobarRegistro(resp, { reto, rp }) {
  if (!resp || typeof resp !== 'object' || !resp.response) throw new Error('Respuesta incompleta.');
  await leerClientData(resp.response.clientDataJSON, 'webauthn.create', reto, rp.origen);
  const { valor: att } = cbor(deB64u(resp.response.attestationObject));
  if (!(att instanceof Map) || !(att.get('authData') instanceof Uint8Array)) throw new Error('attestationObject');
  const ad = leerAuthData(att.get('authData'));
  if (!iguales(ad.rpIdHash, await sha256(new TextEncoder().encode(rp.rpId)))) throw new Error('La llave no es de esta web.');
  if (!ad.up) throw new Error('Falta la presencia del usuario.');
  if (!ad.uv) throw new Error('La llave se creó sin Face ID, Touch ID ni código del aparato: vuelve a intentarlo con verificación.');
  if (!ad.credencial) throw new Error('Sin credencial.');
  const { jwk, alg } = coseAJwk(ad.credencial.cose);
  const id = b64u(ad.credencial.id);
  if (resp.id && resp.id !== id) throw new Error('El identificador no coincide.');
  const transportes = Array.isArray(resp.response.transports) ? resp.response.transports.filter(x => typeof x === 'string').slice(0, 6).join(',') : null;
  return { id, jwk, alg, contador: ad.contador, transportes, respaldada: ad.bs ? 1 : 0 };
}

/** ENTRADA: comprueba la respuesta de navigator.credentials.get() contra la llave guardada. Devuelve { contador, uv }. */
export async function comprobarEntrada(resp, llave, { reto, rp }) {
  if (!resp || typeof resp !== 'object' || !resp.response) throw new Error('Respuesta incompleta.');
  const hash = await leerClientData(resp.response.clientDataJSON, 'webauthn.get', reto, rp.origen);
  const authData = deB64u(resp.response.authenticatorData);
  const ad = leerAuthData(authData);
  if (!iguales(ad.rpIdHash, await sha256(new TextEncoder().encode(rp.rpId)))) throw new Error('La llave no es de esta web.');
  if (!ad.up) throw new Error('Falta la presencia del usuario.');
  const datos = new Uint8Array(authData.length + 32); datos.set(authData); datos.set(hash, authData.length);
  const ok = await verificarFirma(llave.algoritmo, JSON.parse(llave.clave_publica), datos, deB64u(resp.response.signature));
  if (!ok) throw new Error('La firma no es válida.');
  // Contador: si el aparato lo lleva, tiene que crecer (una copia clonada de la llave se delata aquí)
  if (ad.contador !== 0 || llave.contador !== 0) { if (ad.contador <= llave.contador) throw new Error('Contador de la llave no válido: avisa a INNAZ.'); }
  return { contador: ad.contador, uv: ad.uv };
}

export const nuevoReto = () => b64u(crypto.getRandomValues(new Uint8Array(32)));
export const RETO_SEGUNDOS = 300;
export const MAX_LLAVES = 5;
