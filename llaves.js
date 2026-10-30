/* Mi INNAZ · Llaves de acceso (Face ID / Touch ID) en el navegador · 29-10-2026
   Usado por /entrar, /mi-innaz y /gestion. Habla con /api/llaves. Sin librerías. */
(function () {
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const deB64u = s => { const b = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(b), c => c.charCodeAt(0)); };
  const post = cuerpo => fetch('/api/llaves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
    .then(async r => ({ ok: r.ok, status: r.status, d: await r.json().catch(() => ({ error: 'Respuesta inesperada (' + r.status + ').' })) }))
    .catch(() => ({ ok: false, d: { error: 'Error de conexión.' } }));
  const errorNavegador = e => {
    if (!e) return 'No se ha podido.';
    if (e.name === 'NotAllowedError') return 'Cancelado o sin respuesta del aparato. Vuelve a intentarlo.';
    if (e.name === 'InvalidStateError') return 'Este aparato ya tiene una llave registrada para esta cuenta.';
    if (e.name === 'SecurityError') return 'El navegador no permite llaves en esta dirección.';
    if (e.name === 'NotSupportedError') return 'Este aparato o navegador no admite llaves de acceso.';
    return e.message || String(e);
  };
  const soportado = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  async function conBiometria() { try { return soportado() && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; } }

  async function registrar(nombre) {
    if (!soportado()) return { ok: false, d: { error: 'Este navegador no admite llaves de acceso.' } };
    const o = await post({ accion: 'registro_opciones' }); if (!o.ok) return o;
    const pk = o.d.opciones;
    pk.challenge = deB64u(pk.challenge); pk.user.id = deB64u(pk.user.id);
    pk.excludeCredentials = (pk.excludeCredentials || []).map(c => ({ ...c, id: deB64u(c.id) }));
    let cred; try { cred = await navigator.credentials.create({ publicKey: pk }); } catch (e) { return { ok: false, d: { error: errorNavegador(e) } }; }
    if (!cred) return { ok: false, d: { error: 'No se ha creado la llave.' } };
    const r = cred.response;
    return post({ accion: 'registro_confirmar', reto: o.d.retoId, nombre: nombre || '', credencial: { id: cred.id, rawId: b64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: b64u(r.clientDataJSON), attestationObject: b64u(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] } } });
  }
  /* Crear la cuenta con Face ID en un paso (30-10-2026): { correo, nombre, privacidad, boletin } */
  async function crearCuenta(datos) {
    if (!soportado()) return { ok: false, d: { error: 'Este navegador no admite llaves de acceso.' } };
    const o = await post({ accion: 'alta_opciones', ...datos }); if (!o.ok) return o;
    const pk = o.d.opciones;
    pk.challenge = deB64u(pk.challenge); pk.user.id = deB64u(pk.user.id);
    let cred; try { cred = await navigator.credentials.create({ publicKey: pk }); } catch (e) { return { ok: false, d: { error: errorNavegador(e) } }; }
    if (!cred) return { ok: false, d: { error: 'No se ha creado la llave.' } };
    const r = cred.response;
    return post({ accion: 'alta_confirmar', reto: o.d.retoId, credencial: { id: cred.id, rawId: b64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: b64u(r.clientDataJSON), attestationObject: b64u(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] } } });
  }
  async function entrar() {
    if (!soportado()) return { ok: false, d: { error: 'Este navegador no admite llaves de acceso.' } };
    const o = await post({ accion: 'entrar_opciones' }); if (!o.ok) return o;
    const pk = { ...o.d.opciones, challenge: deB64u(o.d.opciones.challenge), allowCredentials: [] };
    let cred; try { cred = await navigator.credentials.get({ publicKey: pk }); } catch (e) { return { ok: false, d: { error: errorNavegador(e) } }; }
    if (!cred) return { ok: false, d: { error: 'No se ha podido usar la llave.' } };
    const r = cred.response;
    return post({ accion: 'entrar_confirmar', reto: o.d.retoId, credencial: { id: cred.id, rawId: b64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), userHandle: r.userHandle ? b64u(r.userHandle) : null } } });
  }

  /* Bloque «Llaves de acceso» (lista + añadir + quitar) dentro del elemento indicado. */
  async function pintar(cont, { titulo = 'Llaves de acceso', nota = null } = {}) {
    const el = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
    const caja = typeof cont === 'string' ? document.getElementById(cont) : cont; if (!caja) return;
    caja.textContent = '';
    const h = el('h3', titulo); h.style.cssText = "font-family:'Cormorant',Georgia,serif;font-weight:600;margin:18px 0 4px"; caja.append(h);
    caja.append(el('p', nota || 'Con una llave entras con Face ID, Touch ID o el código del aparato, sin escribir la contraseña. Se guarda en este aparato (y en tu llavero de iCloud o Google, si lo tienes activado).', 'nota'));
    const msg = el('p', '', 'mensaje'); msg.setAttribute('role', 'status');
    const lista = el('div'); caja.append(lista);
    const fecha = s => s ? new Date(s * 1000).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : null;
    let armada = null;
    async function cargar() {
      lista.textContent = '';
      const r = await fetch('/api/llaves', { cache: 'no-store' }).then(x => x.json()).catch(() => null);
      if (!r || r.error) { lista.append(el('p', (r && r.error) || 'No se han podido cargar las llaves.', 'nota')); return; }
      if (!r.llaves.length) lista.append(el('p', 'Todavía no tienes ninguna llave.', 'nota'));
      for (const l of r.llaves) {
        const f = el('div', null, 'susc'); f.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center';
        f.append(el('strong', l.nombre || 'Llave'), el('span', 'añadida el ' + fecha(l.creada) + (l.ultimoUso ? ' · usada el ' + fecha(l.ultimoUso) : ' · sin usar aún'), 'nota'));
        const q = el('button', 'Quitar', 'secundario'); q.type = 'button'; q.style.cssText = 'margin:0;padding:4px 10px;font-size:.8rem';
        q.onclick = async () => { if (armada !== l.id) { armada = l.id; q.textContent = '¿Seguro? Pulsa otra vez'; setTimeout(() => { if (armada === l.id) { armada = null; q.textContent = 'Quitar'; } }, 8000); return; }
          armada = null; q.disabled = true; const x = await post({ accion: 'quitar', id: l.id }); msg.className = 'mensaje' + (x.ok ? '' : ' error'); msg.textContent = x.d.mensaje || x.d.error; await cargar(); };
        f.append(q); lista.append(f);
      }
      btn.disabled = r.llaves.length >= r.max; if (btn.disabled) btn.title = 'Máximo ' + r.max + ' llaves';
    }
    const fila = el('div'); fila.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px';
    const nombre = el('input'); nombre.placeholder = 'Nombre (p. ej. iPhone de César)'; nombre.maxLength = 60; nombre.style.cssText = 'flex:1 1 220px;padding:8px 10px;font:inherit;border:1px solid #c9c4b8;background:#fff';
    const btn = el('button', 'Añadir una llave en este aparato'); btn.type = 'button'; btn.style.margin = '0';
    btn.onclick = async () => { btn.disabled = true; msg.className = 'mensaje'; msg.textContent = 'Sigue las indicaciones de tu aparato…';
      let x = await registrar(nombre.value.trim());
      if (!x.ok && x.d.reauth && window.INNAZ_reauth) { msg.textContent = ''; if (await window.INNAZ_reauth()) { msg.textContent = 'Sigue las indicaciones de tu aparato…'; x = await registrar(nombre.value.trim()); } else { btn.disabled = false; return; } }
      btn.disabled = false; msg.className = 'mensaje' + (x.ok ? '' : ' error'); msg.textContent = x.d.mensaje || x.d.error; if (x.ok) { nombre.value = ''; await cargar(); } };
    fila.append(nombre, btn); caja.append(fila, msg);
    if (!soportado()) { btn.disabled = true; msg.className = 'mensaje'; msg.textContent = 'Este navegador no admite llaves de acceso (hace falta https y un navegador actual).'; }
    else if (!(await conBiometria())) caja.append(el('p', 'Este aparato no tiene Face ID, Touch ID ni Windows Hello: puede que el navegador ofrezca guardar la llave en el móvil o en una llave física.', 'nota'));
    await cargar();
  }

  /* Botón «Entrar con Face ID / Touch ID» para /entrar y /gestion: llama a entrar() y, si va bien, llama a `despues(d)`. */
  function botonEntrar(cont, despues, texto = 'Entrar con Face ID / Touch ID') {
    const caja = typeof cont === 'string' ? document.getElementById(cont) : cont; if (!caja || !soportado()) return null;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'secundario'; b.textContent = texto;
    const m = document.createElement('p'); m.className = 'mensaje'; m.setAttribute('role', 'status');
    b.onclick = async () => { b.disabled = true; m.className = 'mensaje'; m.textContent = 'Sigue las indicaciones de tu aparato…';
      const x = await entrar(); b.disabled = false; if (!x.ok) { m.className = 'mensaje error'; m.textContent = x.d.error; return; } m.textContent = ''; despues(x.d); };
    caja.append(b, m); return b;
  }
  window.Llaves = { soportado, conBiometria, registrar, crearCuenta, entrar, pintar, botonEntrar };
})();
