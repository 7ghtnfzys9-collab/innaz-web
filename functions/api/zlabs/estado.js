/* GET /api/zlabs/estado · ¿está abierta la preinscripción? (28-10-2026) */
import { json } from '../../_lib/util.js';
import { config } from '../../_lib/zlabs.js';
export async function onRequestGet({ env }) {
  const c = config(env);
  return json({ edicion: c.edicion, abierta: c.abierta, nacidosDesde: c.nacidosDesde, edadMinima: c.edadMinima, inicio: c.inicio });
}
