/* Mi INNAZ · cifrado de datos sensibles en la base (AES-GCM) · 27-10-2026
   La clave se deriva (HKDF) del secreto CLAVE_CIFRADO si existe (v2); si no, del secreto SAL (v1,
   válido para la web de pruebas; en producción se pondrá CLAVE_CIFRADO aparte).
   Formato guardado: v1|v2.<iv base64>.<datos base64> */

const b64 = u8 => btoa(String.fromCharCode(...u8));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// v1 = clave derivada de SAL · v2 = clave derivada de CLAVE_CIFRADO. Cada dato guarda con qué versión se cifró,
// así poner CLAVE_CIFRADO más adelante no deja ilegible lo cifrado antes.
async function clave(env, uso, version) {
  const base = version === 'v2' ? env.CLAVE_CIFRADO : env.SAL;
  if (!base) throw new Error('Falta el secreto para cifrar (' + version + ')');
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(base), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('innaz-mi-innaz'), info: new TextEncoder().encode(uso) },
    k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function cifrar(env, uso, texto) {
  const v = env.CLAVE_CIFRADO ? 'v2' : 'v1';
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await clave(env, uso, v), new TextEncoder().encode(texto));
  return `${v}.${b64(iv)}.${b64(new Uint8Array(c))}`;
}

export async function descifrar(env, uso, guardado) {
  const [v, iv, datos] = String(guardado).split('.');
  if (v !== 'v1' && v !== 'v2') throw new Error('Formato de cifrado desconocido');
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await clave(env, uso, v), deB64(datos));
  return new TextDecoder().decode(p);
}
