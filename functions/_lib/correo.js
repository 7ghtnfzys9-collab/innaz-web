/* ══════════════════════════════════════════════════════════════════════
   Mi INNAZ · ÚNICO MÓDULO DE CORREO (intercambiable) · 27-10-2026
   Todo correo pasa por aquí y por la tabla correos_salida.
   Cambiar de proveedor = cambiar SOLO este archivo.
     enviar(env, plantilla, destinatario, datos)
     sincronizarContacto(env, usuario)        → pendiente (con Brevo)
     enviarBoletin(env, segmento, contenido)  → pendiente (con Brevo)
   Modos (variable CORREO):
     'simulacion' → no se envía nada; queda anotado como enviado por 'simulacion'.
     'brevo'      → API transaccional de Brevo; la clave es el secreto BREVO_API_KEY.
   ══════════════════════════════════════════════════════════════════════ */
import { ahora, nuevoId } from './util.js';
import { PLANTILLAS } from '../_plantillas/index.js';

export async function enviar(env, plantilla, destinatario, datos = {}) {
  const p = PLANTILLAS[plantilla];
  if (!p) throw new Error('Plantilla desconocida: ' + plantilla);
  const id = nuevoId();
  // En la cola NO se guarda el enlace de acceso (sería como guardar una llave): solo las demás variables.
  const datosCola = Object.fromEntries(Object.entries(datos).filter(([k]) => k !== 'enlace'));
  await env.DB.prepare(
    'INSERT INTO correos_salida (id, plantilla, destinatario, datos, estado, intentos, creado) VALUES (?,?,?,?,?,0,?)')
    .bind(id, plantilla, destinatario, JSON.stringify(datosCola), 'pendiente', ahora()).run();

  const modo = env.CORREO || 'simulacion';
  // En producción no se admite la simulación: el usuario recibiría «ok» sin que salga ningún correo.
  if (env.MODO === 'produccion' && modo !== 'brevo') throw new Error('En producción CORREO debe ser «brevo»');
  let ok = false, ref = null, proveedor = modo;
  try {
    if (modo === 'simulacion') {
      ok = true; ref = 'simulado';
    } else if (modo === 'brevo') {
      if (!env.BREVO_API_KEY) throw new Error('Falta el secreto BREVO_API_KEY');
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          sender: { email: env.REMITENTE_CORREO, name: env.REMITENTE_NOMBRE },
          to: [{ email: destinatario }],
          subject: p.asunto(datos),
          htmlContent: p.html(datos),
          textContent: p.texto(datos),
        }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      ok = r.ok; ref = cuerpo.messageId || (ok ? null : `HTTP ${r.status}`);
    } else {
      throw new Error('Modo de correo desconocido: ' + modo);
    }
  } catch (e) {
    ok = false; ref = String(e.message || e).slice(0, 200);
  }
  await env.DB.prepare(
    'UPDATE correos_salida SET estado=?, intentos=intentos+1, proveedor=?, ref_proveedor=?, enviado=? WHERE id=?')
    .bind(ok ? 'enviado' : 'fallido', proveedor, ref, ok ? ahora() : null, id).run();
  return { ok, simulado: modo === 'simulacion' };
}

export async function sincronizarContacto() { throw new Error('sincronizarContacto: pendiente (llegará con Brevo)'); }
export async function enviarBoletin()      { throw new Error('enviarBoletin: pendiente (llegará con Brevo)'); }
