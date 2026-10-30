/* Mi INNAZ · plantillas de correo (nuestras, no del editor de Brevo) · 27-10-2026
   Cada plantilla: asunto(datos), html(datos), texto(datos).
   Sin dirección postal en ningún pie (decisión de César, 27-10-2026). */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Logo de los correos (28-10-2026, César): el mismo de la firma de correo, servido desde innaz.es.
// publish_innaz/firma/ NO se borra ni se renombra (lo usan también la firma de Mail y estos correos).
const LOGO_CORREO = 'https://www.innaz.es/firma/logo-innaz-160.png';

const marco = (cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;background:#f6f4f0;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-top:4px solid #0097B2" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 32px 8px"><img src="${LOGO_CORREO}" width="160" height="59" alt="INNAZ · Instituto Nacional de Zarzuela" style="display:block;border:0;width:160px;height:59px"></td></tr>
<tr><td style="padding:8px 32px 28px;font-size:15px;line-height:1.55">${cuerpo}</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e1d8;font-size:12px;color:#6b6b6b">
Instituto Nacional de Zarzuela · <a href="https://innaz.es" style="color:#007A90">innaz.es</a></td></tr>
</table></td></tr></table></body></html>`;

// ── ZLabs · ayudantes de los correos (28-10-2026) ──
const CONTACTO_ZL = 'zlabs@innaz.es';
const ZL = d => `<span style="color:#0097B2">Z</span>Labs ${esc(d.edicion)}`;
/** Género gramatical por la cuerda: soprano/mezzosoprano → f; tenor/barítono → m; sin cuerda → neutro. */
const generoDe = d => /soprano/i.test(d.cuerda || '') ? 'f' : /tenor|bar[ií]tono/i.test(d.cuerda || '') ? 'm' : null;
const g = (d, m, f, n) => ({ m, f }[generoDe(d)] || n);
const comoQue = (d, texto = false) => d.modalidad === 'activo'
  ? g(d, 'alumno activo', 'alumna activa', 'alumno/a activo/a') + (d.cuerda ? ` (${texto ? d.cuerda : esc(d.cuerda)})` : '')
  : 'oyente';
const PIE_ZL = (d, frase, conRef = false) => `<p style="font-size:13px;color:#6b6b6b">${conRef ? 'Referencia ' + esc(d.referencia) + '. ' : ''}${frase} <a href="mailto:${CONTACTO_ZL}" style="color:#007A90">${CONTACTO_ZL}</a>.</p>`;

export const PLANTILLAS = {
  // Se manda cuando alguien pide entrar con un correo que no tiene cuenta y no ha aceptado la privacidad.
  // Así la web responde lo mismo siempre y no revela quién está registrado.
  'aviso-alta': {
    asunto: () => 'Para crear tu cuenta en Mi INNAZ',
    html: d => marco(`
<p>Hola:</p>
<p>Has pedido entrar en Mi INNAZ con este correo, pero todavía no tiene cuenta.</p>
<p>Para crearla (es gratis), vuelve a la página de entrada y marca la casilla de la política de privacidad.</p>
<p style="margin:28px 0"><a href="${esc(d.enlace)}" style="background:#0097B2;color:#ffffff;text-decoration:none;padding:12px 22px;display:inline-block">Crear mi cuenta</a></p>
<p style="font-size:13px;color:#6b6b6b">Si no has sido tú, no hagas nada.</p>`),
    texto: d => `Hola:

Has pedido entrar en Mi INNAZ con este correo, pero todavía no tiene cuenta.
Para crearla (es gratis), vuelve a ${d.enlace} y marca la casilla de la política de privacidad.

Si no has sido tú, no hagas nada.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // 'aviso-factor': retirada el 30-10-2026 (ya no hay segundo factor); copia en _to_delete/segundo-factor-retirado_30-10-2026
  // Módulo 3: cambios hechos por un Administrador que afectan a la persona.
  'aviso-perfil': {
    asunto: d => d.alta ? `Tienes un rol de gestión en INNAZ: ${d.perfil}` : `Se ha retirado tu rol de gestión en INNAZ: ${d.perfil}`,
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
${d.alta
  ? `<p>Se te ha asignado el rol <strong>${esc(d.perfil)}</strong> en la gestión de INNAZ.</p>
<p>Entra en la gestión interna de INNAZ${d.enlace ? ` (<a href="${esc(d.enlace)}">${esc(d.enlace)}</a>)` : ''} con esta cuenta: verás una pestaña por cada sección que puedes gestionar. Se entra con tu correo y tu contraseña.</p>`
  : `<p>Se ha retirado el rol <strong>${esc(d.perfil)}</strong> de tu cuenta en la gestión de INNAZ.</p>`}
<p style="font-size:13px;color:#6b6b6b">Si no esperabas este cambio, avisa a Presidencia.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

${d.alta ? `Se te ha asignado el rol «${d.perfil}» en la gestión de INNAZ.
Entra en la gestión interna de INNAZ${d.enlace ? ' (' + d.enlace + ')' : ''} con esta cuenta: verás una pestaña por cada sección que puedes gestionar. Se entra con tu correo y tu contraseña.`
         : `Se ha retirado el rol «${d.perfil}» de tu cuenta en la gestión de INNAZ.`}

Si no esperabas este cambio, avisa a Presidencia.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Un solo correo por cambio de roles (auditoría 29-10-2026): lo que entra y lo que sale, en el mismo aviso
  'aviso-roles': {
    asunto: d => d.altas.length && d.bajas.length ? 'Cambios en tus roles de gestión en INNAZ'
                : d.altas.length ? `Tienes ${d.altas.length === 1 ? 'un rol' : 'roles'} de gestión en INNAZ: ${d.altas.join(', ')}`
                : `Se ha retirado tu ${d.bajas.length === 1 ? 'rol' : 'roles'} de gestión en INNAZ: ${d.bajas.join(', ')}`,
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
${d.altas.length ? `<p>Se te ${d.altas.length === 1 ? 'ha asignado el rol' : 'han asignado los roles'} <strong>${esc(d.altas.join(', '))}</strong> en la gestión de INNAZ.</p>` : ''}
${d.bajas.length ? `<p>Se ${d.bajas.length === 1 ? 'ha retirado el rol' : 'han retirado los roles'} <strong>${esc(d.bajas.join(', '))}</strong> de tu cuenta en la gestión de INNAZ.</p>` : ''}
${d.altas.length ? `<p>Entra en la gestión interna de INNAZ${d.enlace ? ` (<a href="${esc(d.enlace)}">${esc(d.enlace)}</a>)` : ''} con esta cuenta: verás una pestaña por cada sección que puedes gestionar. Se entra con tu correo y tu contraseña.</p>` : ''}
<p style="font-size:13px;color:#6b6b6b">Si no esperabas este cambio, avisa a Presidencia.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}
${d.altas.length ? `
Se te ${d.altas.length === 1 ? 'ha asignado el rol' : 'han asignado los roles'} «${d.altas.join('», «')}» en la gestión de INNAZ.` : ''}${d.bajas.length ? `
Se ${d.bajas.length === 1 ? 'ha retirado el rol' : 'han retirado los roles'} «${d.bajas.join('», «')}» de tu cuenta en la gestión de INNAZ.` : ''}${d.altas.length ? `
Entra en la gestión interna de INNAZ${d.enlace ? ' (' + d.enlace + ')' : ''} con esta cuenta: verás una pestaña por cada sección que puedes gestionar. Se entra con tu correo y tu contraseña.` : ''}

Si no esperabas este cambio, avisa a Presidencia.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Confirmación de cambios hechos desde la gestión (César, 29-10-2026): retirada, solicitud anulada, nivel corregido, renovación
  'aviso-cambio-suscripcion': {
    asunto: d => ({ retirada: 'Tu suscripción a INNAZ se ha dado de baja', anulada: 'Tu solicitud de suscripción a INNAZ se ha anulado',
                    nivel: `Tu suscripción a INNAZ pasa a ${d.nivel}`, renovada: `Tu suscripción a INNAZ (${d.nivel}) se ha renovado` })[d.tipo],
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
${{ retirada: `<p>Tu suscripción <strong>${esc(d.nivel)}</strong> a INNAZ se ha dado de baja hoy. Tu cuenta sigue activa como registrada${d.numero ? ` (${esc(d.numero)})` : ''}: conservas el acceso a lo que es libre para todos y puedes volver a suscribirte cuando quieras.</p>`,
     anulada:  `<p>Tu solicitud de suscripción <strong>${esc(d.nivel)}</strong> ha quedado anulada. Si no la has pedido tú o quieres volver a solicitarla, puedes hacerlo desde ${d.enlace ? `<a href="${esc(d.enlace)}">Mi INNAZ</a>` : 'Mi INNAZ'}.</p>`,
     nivel:    `<p>Hemos corregido tu suscripción: ahora es <strong>${esc(d.nivel)}</strong>${d.antes ? ` (antes, ${esc(d.antes)})` : ''}${d.numero ? `, con el número ${esc(d.numero)}` : ''}. No supone ningún cobro.</p>`,
     renovada: `<p>Tu suscripción <strong>${esc(d.nivel)}</strong> se ha renovado${d.hasta ? ` hasta el <strong>${esc(d.hasta)}</strong>` : ''}. ¡Gracias por seguir con nosotros!</p>` }[d.tipo]}
${d.enlace && d.tipo !== 'anulada' ? `<p>Lo ves en <a href="${esc(d.enlace)}">Mi INNAZ</a>.</p>` : ''}
<p style="font-size:13px;color:#6b6b6b">Si no esperabas este cambio, responde a este correo.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

${{ retirada: `Tu suscripción ${d.nivel} a INNAZ se ha dado de baja hoy. Tu cuenta sigue activa como registrada${d.numero ? ` (${d.numero})` : ''}: conservas el acceso a lo que es libre para todos y puedes volver a suscribirte cuando quieras.`,
     anulada:  `Tu solicitud de suscripción ${d.nivel} ha quedado anulada. Si no la has pedido tú o quieres volver a solicitarla, puedes hacerlo desde Mi INNAZ${d.enlace ? ' (' + d.enlace + ')' : ''}.`,
     nivel:    `Hemos corregido tu suscripción: ahora es ${d.nivel}${d.antes ? ` (antes, ${d.antes})` : ''}${d.numero ? `, con el número ${d.numero}` : ''}. No supone ningún cobro.`,
     renovada: `Tu suscripción ${d.nivel} se ha renovado${d.hasta ? ` hasta el ${d.hasta}` : ''}. ¡Gracias por seguir con nosotros!` }[d.tipo]}
${d.enlace && d.tipo !== 'anulada' ? `\nLo ves en Mi INNAZ: ${d.enlace}\n` : ''}
Si no esperabas este cambio, responde a este correo.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Suscripciones desde el panel (28-10-2026) · BORRADOR: textos pendientes de aprobar por César
  'aviso-suscripcion': {
    asunto: d => d.tipo === 'gratuito' ? `Tienes acceso gratuito a INNAZ: ${d.nivel}` : `Tu suscripción a INNAZ: ${d.nivel}`,   // tipo: gratuito | pago | prueba
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
${d.tipo === 'gratuito'
  ? `<p>INNAZ te ha concedido <strong>acceso gratuito</strong> con las ventajas del nivel <strong>${esc(d.nivel)}</strong>${d.desde ? ' a partir del ' + esc(d.desde) : ''}${d.hasta ? ', hasta el ' + esc(d.hasta) : ''}${d.causa ? ', ' + esc(d.causa) : ''}.</p>`
  : d.tipo === 'prueba'
  ? `<p>Ya está activa tu suscripción <strong>${esc(d.nivel)}</strong> con los <strong>tres primeros meses gratis</strong> del lanzamiento, hasta el ${esc(d.hasta)}. Antes de esa fecha te escribiremos para continuar.</p>`
  : `<p>Ya está activa tu suscripción <strong>${esc(d.nivel)}</strong>${d.desde ? ' a partir del ' + esc(d.desde) : ''}, hasta el ${esc(d.hasta)}.</p>`}
${d.numero ? `<p>Tu número de registro es <strong>${esc(d.numero)}</strong>.</p>` : ''}
<p>Puedes ver tus ventajas en Mi INNAZ:</p>
<p style="margin:24px 0"><a href="${esc(d.enlace)}" style="background:#0097B2;color:#ffffff;text-decoration:none;padding:12px 22px;display:inline-block">Ir a Mi INNAZ</a></p>
<p>¡Gracias por formar parte de INNAZ!</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

${d.tipo === 'gratuito'
  ? `INNAZ te ha concedido acceso gratuito con las ventajas del nivel ${d.nivel}${d.desde ? ' a partir del ' + d.desde : ''}${d.hasta ? ', hasta el ' + d.hasta : ''}${d.causa ? ', ' + d.causa : ''}.`
  : d.tipo === 'prueba'
  ? `Ya está activa tu suscripción ${d.nivel} con los tres primeros meses gratis del lanzamiento, hasta el ${d.hasta}. Antes de esa fecha te escribiremos para continuar.`
  : `Ya está activa tu suscripción ${d.nivel}${d.desde ? ' a partir del ' + d.desde : ''}, hasta el ${d.hasta}.`}
${d.numero ? 'Tu número de registro es ' + d.numero + '.\n' : ''}
Puedes ver tus ventajas en Mi INNAZ: ${d.enlace}

¡Gracias por formar parte de INNAZ!

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Solicitud de suscripción desde la web (28-10-2026) · BORRADOR: textos pendientes de aprobar por César
  'solicitud-suscripcion': {
    asunto: d => d.mejora ? `Hemos recibido tu mejora de suscripción: ${d.nivel}` : `Hemos recibido tu solicitud de suscripción: ${d.nivel}`,
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
${d.mejora
  ? `<p>Hemos recibido tu petición para mejorar tu suscripción de <strong>${esc(d.mejora.desde)}</strong> a <strong>${esc(d.nivel)}</strong>. Pagas solo la diferencia por el tiempo que te queda: <strong>${esc(d.importe)}</strong>. Tu suscripción seguirá terminando el ${esc(d.mejora.hasta)}.</p>`
  : `<p>Hemos recibido tu solicitud de suscripción <strong>${esc(d.nivel)}</strong> (${d.periodicidad === 'anual' ? 'anual' : 'mensual'}, ${esc(d.importe)}${d.alumno ? ', con el 50 % para alumnos' : ''}).</p>`}
${d.gratuito ? `<p>Seguirás con tu acceso gratuito de ${esc(d.gratuito)} hasta que recibamos el pago; en ese momento terminará y empezará tu suscripción.</p>` : ''}
${d.transferencia
  ? `<p><strong>Cómo pagar:</strong> haz una transferencia de <strong>${esc(d.transferencia.importe)}</strong> a la cuenta de INNAZ:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;font-size:15px">
<tr><td style="padding:2px 12px 2px 0;color:#6b6b6b">IBAN</td><td><strong>${esc(d.transferencia.iban)}</strong></td></tr>
${d.transferencia.titular ? `<tr><td style="padding:2px 12px 2px 0;color:#6b6b6b">Titular</td><td>${esc(d.transferencia.titular)}</td></tr>` : ''}
<tr><td style="padding:2px 12px 2px 0;color:#6b6b6b">Concepto</td><td><strong>${esc(d.transferencia.concepto)}</strong></td></tr></table>
<p>Cuando la recibamos, activaremos tu suscripción y te avisaremos.</p>`
  : `<p>Te escribiremos en breve con las instrucciones de pago. Cuando lo recibamos, se activará y te avisaremos.</p>`}
${d.alumno && !d.mejora ? `<p>Comprobaremos con tu centro (${esc(d.centro)}) que eres alumno.</p>` : ''}
${d.numero ? `<p>Tu número de registro es <strong>${esc(d.numero)}</strong>.</p>` : ''}
<p style="margin:24px 0"><a href="${esc(d.enlace)}" style="background:#0097B2;color:#ffffff;text-decoration:none;padding:12px 22px;display:inline-block">Ir a Mi INNAZ</a></p>
<p>¡Gracias por apoyar a INNAZ!</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

${d.mejora
  ? `Hemos recibido tu petición para mejorar tu suscripción de ${d.mejora.desde} a ${d.nivel}. Pagas solo la diferencia por el tiempo que te queda: ${d.importe}. Tu suscripción seguirá terminando el ${d.mejora.hasta}.`
  : `Hemos recibido tu solicitud de suscripción ${d.nivel} (${d.periodicidad === 'anual' ? 'anual' : 'mensual'}, ${d.importe}${d.alumno ? ', con el 50 % para alumnos' : ''}).`}
${d.gratuito ? 'Seguirás con tu acceso gratuito de ' + d.gratuito + ' hasta que recibamos el pago; en ese momento terminará y empezará tu suscripción.\n' : ''}${d.transferencia
  ? `Cómo pagar: transferencia de ${d.transferencia.importe} a la cuenta de INNAZ.
IBAN: ${d.transferencia.iban}
${d.transferencia.titular ? 'Titular: ' + d.transferencia.titular + '\n' : ''}Concepto: ${d.transferencia.concepto}
Cuando la recibamos, activaremos tu suscripción y te avisaremos.`
  : 'Te escribiremos en breve con las instrucciones de pago. Cuando lo recibamos, se activará y te avisaremos.'}
${d.alumno && !d.mejora ? 'Comprobaremos con tu centro (' + d.centro + ') que eres alumno.\n' : ''}${d.numero ? 'Tu número de registro es ' + d.numero + '.\n' : ''}
Mi INNAZ: ${d.enlace}

¡Gracias por apoyar a INNAZ!

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  'aviso-solicitud': {
    asunto: d => `${d.mejora ? 'Mejora' : 'Nueva solicitud'} de suscripción: ${d.nivel} · ${d.correo}`,
    html: d => marco(`
<p><strong>${esc(d.correo)}</strong>${d.nombre ? ' (' + esc(d.nombre) + ')' : ''}${d.numero ? ' · ' + esc(d.numero) : ''} ha ${d.mejora ? 'pedido mejorar de ' + esc(d.mejora.desde) + ' a' : 'solicitado la suscripción'} <strong>${esc(d.nivel)}</strong>
(${d.periodicidad === 'anual' ? 'anual' : 'mensual'}, ${esc(d.importe)}${d.mejora ? ', diferencia; mantiene el fin el ' + esc(d.mejora.hasta) : ''}).</p>
${d.gratuito ? `<p>Tiene acceso gratuito de ${esc(d.gratuito)}: terminará al marcar el pago.</p>` : ''}
${d.alumno && !d.mejora ? `<p>Dice ser alumno de <strong>${esc(d.centro)}</strong> (50 %): hay que comprobarlo.</p>` : ''}
<p>${d.transferencia ? 'Se le han enviado los datos de la transferencia (concepto ' + esc(d.transferencia.concepto) + '). ' : 'Hay que enviarle las instrucciones de pago. '}Al recibir el pago, márcalo en la gestión interna (Suscripciones → su ficha).</p>`),
    texto: d => `${d.correo}${d.nombre ? ' (' + d.nombre + ')' : ''}${d.numero ? ' · ' + d.numero : ''} ha ${d.mejora ? 'pedido mejorar de ' + d.mejora.desde + ' a' : 'solicitado la suscripción'} ${d.nivel} (${d.periodicidad === 'anual' ? 'anual' : 'mensual'}, ${d.importe}${d.mejora ? ', diferencia; mantiene el fin el ' + d.mejora.hasta : ''}).
${d.gratuito ? 'Tiene acceso gratuito de ' + d.gratuito + ': terminará al marcar el pago.\n' : ''}${d.alumno && !d.mejora ? 'Dice ser alumno de ' + d.centro + ' (50 %): hay que comprobarlo.\n' : ''}${d.transferencia ? 'Se le han enviado los datos de la transferencia (concepto ' + d.transferencia.concepto + '). ' : 'Hay que enviarle las instrucciones de pago. '}Al recibir el pago, márcalo en la gestión interna (Suscripciones → su ficha).`,
  },
  // Contraseñas (César, 30-10-2026) · motivo: 'alta' (con roles) | 'olvido' | 'restablecida' · ambito: 'mi' (Mi INNAZ) o, si falta, gestión.
  // Texto en borrador.
  'clave-enlace': {
    asunto: d => d.motivo === 'alta' ? 'Bienvenido a la gestión de INNAZ: crea tu contraseña' : `Crea una contraseña nueva para ${d.ambito === 'mi' ? 'Mi INNAZ' : 'la gestión de INNAZ'}`,
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
${d.motivo === 'alta' ? `<p>Se te ha dado acceso a la gestión interna de INNAZ${d.roles && d.roles.length ? ` con ${d.roles.length === 1 ? 'el rol' : 'los roles'} <strong>${esc(d.roles.join(', '))}</strong>` : ''}.</p>
<p>Para entrar, crea tu contraseña. Es personal e intransferible: no la compartas con nadie.</p>`
 : d.motivo === 'restablecida' ? `<p>Un Administrador ha <strong>anulado tu contraseña</strong> de la gestión de INNAZ y ha cerrado tus sesiones abiertas. Crea una nueva:</p>`
 : `<p>Has pedido crear una contraseña nueva para ${d.ambito === 'mi' ? 'Mi INNAZ' : 'la gestión de INNAZ'}.</p>`}
<p style="margin:22px 0"><a href="${esc(d.enlace)}" style="background:#0097B2;color:#fff;padding:12px 22px;text-decoration:none;display:inline-block">Crear mi contraseña</a></p>
<p style="font-size:13px;color:#6b6b6b">El enlace vale durante 48 horas y solo se puede usar una vez. La contraseña tiene que tener al menos 12 caracteres.
${d.motivo === 'olvido' ? 'Si no lo has pedido tú, ignora este correo: tu contraseña actual sigue valiendo.' : 'Si no esperabas este correo, avisa a Presidencia.'}</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

${d.motivo === 'alta' ? `Se te ha dado acceso a la gestión interna de INNAZ${d.roles && d.roles.length ? ` con ${d.roles.length === 1 ? 'el rol' : 'los roles'} «${d.roles.join('», «')}»` : ''}.
Para entrar, crea tu contraseña. Es personal e intransferible: no la compartas con nadie.`
 : d.motivo === 'restablecida' ? 'Un Administrador ha anulado tu contraseña de la gestión de INNAZ y ha cerrado tus sesiones abiertas. Crea una nueva.'
 : `Has pedido crear una contraseña nueva para ${d.ambito === 'mi' ? 'Mi INNAZ' : 'la gestión de INNAZ'}.`}

Crear mi contraseña: ${d.enlace}

El enlace vale durante 48 horas y solo se puede usar una vez. La contraseña tiene que tener al menos 12 caracteres.
${d.motivo === 'olvido' ? 'Si no lo has pedido tú, ignora este correo: tu contraseña actual sigue valiendo.' : 'Si no esperabas este correo, avisa a Presidencia.'}

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  'aviso-clave': {
    asunto: d => d.ambito === 'mi' ? 'Tu contraseña de INNAZ ha cambiado' : 'Tu contraseña de la gestión de INNAZ ha cambiado',
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
<p>Se acaba de guardar una contraseña nueva para tu acceso a ${d.ambito === 'mi' ? 'Mi INNAZ' : 'la gestión de INNAZ'} y se han cerrado tus sesiones en otros navegadores.</p>
<p style="font-size:13px;color:#6b6b6b"><strong>Si no has sido tú</strong>, ${d.ambito === 'mi' ? 'crea otra enseguida con «He olvidado mi contraseña» en la página de entrada y avisa a INNAZ.' : 'avisa enseguida a Presidencia para que la anule.'}</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

Se acaba de guardar una contraseña nueva para tu acceso a ${d.ambito === 'mi' ? 'Mi INNAZ' : 'la gestión de INNAZ'} y se han cerrado tus sesiones en otros navegadores.

Si no has sido tú, ${d.ambito === 'mi' ? 'crea otra enseguida con «He olvidado mi contraseña» en la página de entrada y avisa a INNAZ.' : 'avisa enseguida a Presidencia para que la anule.'}

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Alta en Mi INNAZ (30-10-2026): confirmar el correo · via: 'clave' (contraseña) | 'llave' (Face ID / Touch ID)
  'confirmar-correo': {
    asunto: () => 'Confirma tu correo en INNAZ',
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
<p>Acabas de crear tu cuenta de INNAZ${d.via === 'llave' ? ' con Face ID o Touch ID' : ''}. Para terminar, <strong>confirma que este correo es tuyo</strong>:</p>
<p style="margin:22px 0"><a href="${esc(d.enlace)}" style="background:#0097B2;color:#fff;padding:12px 22px;text-decoration:none;display:inline-block">Confirmar mi correo</a></p>
<p style="font-size:13px;color:#6b6b6b">El enlace vale durante 48 horas. Hasta que lo confirmes no podrás suscribirte ni inscribirte en ZLabs.<br>
Si no has creado tú esta cuenta, no pulses el enlace. Si quieres recuperar este correo para ti, ve a la página de entrada de Mi INNAZ y pulsa «He olvidado mi contraseña»: la cuenta pasará a ser tuya.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

Acabas de crear tu cuenta de INNAZ${d.via === 'llave' ? ' con Face ID o Touch ID' : ''}. Para terminar, confirma que este correo es tuyo con este enlace:
${d.enlace}

El enlace vale durante 48 horas. Hasta que lo confirmes no podrás suscribirte ni inscribirte en ZLabs.
Si no has creado tú esta cuenta, no pulses el enlace. Si quieres recuperar este correo para ti, ve a la página de entrada de Mi INNAZ y pulsa «He olvidado mi contraseña»: la cuenta pasará a ser tuya.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Google (30-10-2026): se ha vinculado una cuenta de Google a la de INNAZ. Texto en borrador.
  'aviso-google': {
    asunto: () => 'Has entrado en INNAZ con Google',
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
<p>Acabas de entrar en Mi INNAZ con tu cuenta de Google. A partir de ahora puedes usarla para entrar, además de tus otros accesos.</p>
<p style="font-size:13px;color:#6b6b6b"><strong>Si no has sido tú</strong>, avisa enseguida a INNAZ respondiendo a este correo.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

Acabas de entrar en Mi INNAZ con tu cuenta de Google. A partir de ahora puedes usarla para entrar, además de tus otros accesos.

Si no has sido tú, avisa enseguida a INNAZ respondiendo a este correo.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Eliminar cuenta (31-10-2026). Textos en borrador.
  'cuenta-eliminada': {
    asunto: () => 'Tu cuenta de INNAZ se ha eliminado',
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
<p>${d.por === 'gestion' ? 'INNAZ ha eliminado tu cuenta de Mi INNAZ.' : 'Tal como has pedido, hemos eliminado tu cuenta de Mi INNAZ.'} Hemos borrado tus datos personales y tus formas de entrar.</p>
<p>Si en algún momento pagaste una suscripción, conservamos bloqueados solo los datos que la ley obliga a guardar, durante el tiempo que exige, y después se borran.</p>
<p>Puedes volver a registrarte cuando quieras con este mismo correo.</p>
<p style="font-size:13px;color:#6b6b6b">Si no has pedido esto, escríbenos a info@innaz.es.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

${d.por === 'gestion' ? 'INNAZ ha eliminado tu cuenta de Mi INNAZ.' : 'Tal como has pedido, hemos eliminado tu cuenta de Mi INNAZ.'} Hemos borrado tus datos personales y tus formas de entrar.

Si en algún momento pagaste una suscripción, conservamos bloqueados solo los datos que la ley obliga a guardar, durante el tiempo que exige, y después se borran.

Puedes volver a registrarte cuando quieras con este mismo correo.

Si no has pedido esto, escríbenos a info@innaz.es.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // Aviso interno a la gestión: una cuenta con suscripción, pagos o ZLabs se ha eliminado (para decidir reembolsos o plazas)
  'aviso-baja-cuenta': {
    asunto: d => `Cuenta eliminada: ${d.numero || 'sin número'}`,
    html: d => marco(`
<p>Se ha eliminado la cuenta <strong>${esc(d.numero || '')}</strong> (${esc(d.correo)}) ${d.por === 'gestion' ? 'desde la gestión' : 'a petición de la propia persona'}.</p>
${d.suscripcion ? `<p>Tenía en curso: <strong>${esc(d.suscripcion.nombre)}</strong> (${d.suscripcion.tipo === 'pago' ? 'de pago' : d.suscripcion.tipo}). Ha terminado hoy. Si procede algún reembolso, hay que decidirlo y hacerlo a mano.</p>` : ''}
${d.zlabs && d.zlabs.length ? `<p>Preinscripciones de ZLabs borradas: ${d.zlabs.map(z => esc(z.referencia) + ' (' + esc(z.modalidad) + ', ' + esc(z.estado) + ')').join(', ')}. Si había plaza asignada, queda libre.</p>` : ''}
${d.pagos ? '<p>Hubo pagos: sus datos de facturación quedan bloqueados y cifrados el tiempo que obliga la ley.</p>' : ''}`),
    texto: d => `Se ha eliminado la cuenta ${d.numero || ''} (${d.correo}) ${d.por === 'gestion' ? 'desde la gestión' : 'a petición de la propia persona'}.
${d.suscripcion ? `Tenía en curso: ${d.suscripcion.nombre} (${d.suscripcion.tipo === 'pago' ? 'de pago' : d.suscripcion.tipo}). Ha terminado hoy. Si procede algún reembolso, hay que decidirlo y hacerlo a mano.\n` : ''}${d.zlabs && d.zlabs.length ? `Preinscripciones de ZLabs borradas: ${d.zlabs.map(z => z.referencia + ' (' + z.modalidad + ', ' + z.estado + ')').join(', ')}.\n` : ''}${d.pagos ? 'Hubo pagos: sus datos de facturación quedan bloqueados y cifrados el tiempo que obliga la ley.\n' : ''}`,
  },
  // Llaves de acceso (29-10-2026): alta y baja
  'aviso-llave': {
    asunto: d => d.alta ? 'Nueva llave de acceso en tu cuenta de INNAZ' : 'Se ha quitado una llave de acceso de tu cuenta de INNAZ',
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
<p>${d.alta ? `Se acaba de añadir la llave de acceso <strong>${esc(d.llave)}</strong> (Face ID, Touch ID o código del aparato) a tu cuenta de INNAZ. Con ella puedes entrar sin esperar el enlace del correo.`
            : `Se ha quitado la llave de acceso <strong>${esc(d.llave)}</strong> de tu cuenta de INNAZ.`}</p>
<p style="font-size:13px;color:#6b6b6b">Si no has sido tú, responde a este correo enseguida.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

${d.alta ? `Se acaba de añadir la llave de acceso «${d.llave}» (Face ID, Touch ID o código del aparato) a tu cuenta de INNAZ. Con ella puedes entrar sin esperar el enlace del correo.`
         : `Se ha quitado la llave de acceso «${d.llave}» de tu cuenta de INNAZ.`}

Si no has sido tú, responde a este correo enseguida.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // 'aviso-factor-reiniciado': retirada el 30-10-2026 (ya no hay segundo factor); copia en _to_delete/segundo-factor-retirado_30-10-2026
  'enlace-acceso': {
    asunto: () => 'Tu enlace para entrar en Mi INNAZ',
    html: d => marco(`
<p>${d.nombre ? 'Hola, ' + esc(d.nombre) + ':' : 'Hola:'}</p>
<p>Pulsa el botón para entrar en Mi INNAZ. El enlace sirve <strong>una sola vez</strong> y caduca en <strong>15 minutos</strong>.</p>
<p style="margin:28px 0"><a href="${esc(d.enlace)}" style="background:#0097B2;color:#ffffff;text-decoration:none;padding:12px 22px;display:inline-block">Entrar en Mi INNAZ</a></p>
<p style="font-size:13px;color:#6b6b6b">Si no has pedido este enlace, no hagas nada: nadie podrá entrar sin él.</p>`),
    texto: d => `${d.nombre ? 'Hola, ' + d.nombre + ':' : 'Hola:'}

Abre este enlace para entrar en Mi INNAZ. Sirve una sola vez y caduca en 15 minutos:
${d.enlace}

Si no has pedido este enlace, no hagas nada: nadie podrá entrar sin él.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // ══ ZLabs (28-10-2026, revisado con César) ═══════════════════════════════════════════════
  // Género según la cuerda (soprano y mezzosoprano: femenino; tenor y barítono: masculino); sin cuerda, neutro.
  // La «Z» de ZLabs, en turquesa. Contacto: zlabs@innaz.es.
  'zlabs-preinscripcion': {
    asunto: d => `ZLabs ${d.edicion}: hemos recibido tu preinscripción (${d.referencia})`,
    html: d => marco(`
<p>Hola, ${esc(d.nombre)}:</p>
<p>Hemos recibido tu preinscripción en <strong>${ZL(d)}</strong> como <strong>${comoQue(d)}</strong>.</p>
<p>Tu referencia es <strong>${esc(d.referencia)}</strong>. Guárdala por si tienes que escribirnos.</p>
${d.modalidad === 'activo'
  ? '<p>La comisión artística revisará tus vídeos y te comunicará el resultado por correo. Si te selecciona, te enviaremos tu papel y las instrucciones para pagar la matrícula.</p>'
  : (d.plaza === 'reserva' ? '<p>El aforo de oyentes está completo, así que estás en la <strong>lista de espera</strong>. Si queda libre una plaza, te avisaremos por correo.</p>' : '<p><strong>Tu plaza de oyente está confirmada.</strong> Te enviaremos por correo las instrucciones para completar la inscripción (gratis con suscripción anual; 10 € sin ella) y recibir tu código QR de acceso.</p>')}
<p>${d.modalidad === 'activo' ? 'Mientras esté pendiente de revisión' : 'Mientras el plazo esté abierto'}, puedes <strong>verla, corregirla o cancelarla</strong> en Mi INNAZ:</p>
<p style="margin:24px 0"><a href="${esc(d.enlace)}" style="background:#0097B2;color:#ffffff;text-decoration:none;padding:12px 22px;display:inline-block">Ver o cambiar mi preinscripción</a></p>
${PIE_ZL(d, 'Si no has hecho tú esta preinscripción, escríbenos a')}`),
    texto: d => `Hola, ${d.nombre}:

Hemos recibido tu preinscripción en ZLabs ${d.edicion} como ${comoQue(d, true)}.
Tu referencia es ${d.referencia}. Guárdala por si tienes que escribirnos.

${d.modalidad === 'activo'
  ? 'La comisión artística revisará tus vídeos y te comunicará el resultado por correo. Si te selecciona, te enviaremos tu papel y las instrucciones para pagar la matrícula.'
  : (d.plaza === 'reserva' ? 'El aforo de oyentes está completo, así que estás en la lista de espera. Si queda libre una plaza, te avisaremos por correo.'
     : 'Tu plaza de oyente está confirmada. Te enviaremos por correo las instrucciones para completar la inscripción (gratis con suscripción anual; 10 € sin ella) y recibir tu código QR de acceso.')}

${d.modalidad === 'activo' ? 'Mientras esté pendiente de revisión' : 'Mientras el plazo esté abierto'}, puedes verla, corregirla o cancelarla en Mi INNAZ:
${d.enlace}

Si no has hecho tú esta preinscripción, escríbenos a ${CONTACTO_ZL}.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // ZLabs · aviso interno de cada preinscripción (sin datos sensibles: ni documento ni dirección)
  'zlabs-aviso': {
    asunto: d => `[ZLabs ${d.edicion}] Nueva preinscripción ${d.modalidad === 'activo' ? 'ACTIVO' : 'oyente'} · ${d.referencia}`,
    html: d => marco(`
<p>Nueva preinscripción en <strong>${ZL(d)}</strong>:</p>
<p><strong>${esc(d.nombre)} ${esc(d.apellidos)}</strong> · ${esc(d.correo)}<br>
${d.modalidad === 'activo' ? 'Activo · ' + esc(d.cuerda || '') : 'Oyente'} · ${esc(d.referencia)}</p>
<p style="font-size:13px;color:#6b6b6b">Los vídeos y el resto de datos están en la pestaña ZLabs de la gestión interna.</p>`),
    texto: d => `Nueva preinscripción en ZLabs ${d.edicion}:
${d.nombre} ${d.apellidos} · ${d.correo}
${d.modalidad === 'activo' ? 'Activo · ' + (d.cuerda || '') : 'Oyente'} · ${d.referencia}

Los vídeos y el resto de datos están en la pestaña ZLabs de la gestión interna.`,
  },
  // ZLabs · el candidato ha cancelado su preinscripción
  'zlabs-cancelada': {
    asunto: d => `ZLabs ${d.edicion}: preinscripción cancelada (${d.referencia})`,
    html: d => marco(`
<p>Hola, ${esc(d.nombre)}:</p>
<p>Hemos cancelado tu preinscripción <strong>${esc(d.referencia)}</strong> en <strong>${ZL(d)}</strong>, como pediste.</p>
<p>Si cambias de idea, puedes volver a preinscribirte mientras el plazo esté abierto.</p>
${PIE_ZL(d, 'Si no has sido tú, escríbenos a')}`),
    texto: d => `Hola, ${d.nombre}:

Hemos cancelado tu preinscripción ${d.referencia} en ZLabs ${d.edicion}, como pediste.
Si cambias de idea, puedes volver a preinscribirte mientras el plazo esté abierto.

Si no has sido tú, escríbenos a ${CONTACTO_ZL}.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // ZLabs · el candidato ha corregido sus datos
  'zlabs-corregida': {
    asunto: d => `ZLabs ${d.edicion}: hemos guardado los cambios de tu preinscripción (${d.referencia})`,
    html: d => marco(`
<p>Hola, ${esc(d.nombre)}:</p>
<p>Hemos guardado los cambios de tu preinscripción <strong>${esc(d.referencia)}</strong> en <strong>${ZL(d)}</strong>${d.modalidad === 'activo' && d.cuerda ? ' (' + esc(d.cuerda) + ')' : ''}.</p>
${d.cambios && d.cambios.length ? '<p>Has cambiado: <strong>' + esc(d.cambios.join(', ')) + '</strong>. Todo lo demás se mantiene igual.</p>' : ''}
<p>Puedes volver a revisarla en Mi INNAZ mientras esté pendiente de revisión.</p>
${PIE_ZL(d, 'Si no has sido tú, escríbenos cuanto antes a')}`),
    texto: d => `Hola, ${d.nombre}:

Hemos guardado los cambios de tu preinscripción ${d.referencia} en ZLabs ${d.edicion}${d.modalidad === 'activo' && d.cuerda ? ' (' + d.cuerda + ')' : ''}.
${d.cambios && d.cambios.length ? 'Has cambiado: ' + d.cambios.join(', ') + '. Todo lo demás se mantiene igual.\n' : ''}Puedes volver a revisarla en Mi INNAZ mientras esté pendiente de revisión.

Si no has sido tú, escríbenos cuanto antes a ${CONTACTO_ZL}.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  // ZLabs · aviso interno de cancelación o corrección
  'zlabs-aviso-cambio': {
    asunto: d => `[ZLabs ${d.edicion}] Preinscripción ${d.cambio} · ${d.referencia}`,
    html: d => marco(`
<p>La preinscripción <strong>${esc(d.referencia)}</strong> (${esc(d.nombre)} ${esc(d.apellidos)} · ${esc(d.correo)}) ha sido <strong>${esc(d.cambio)}</strong> por el candidato.</p>${d.cambios && d.cambios.length ? '<p>Cambios: ' + esc(d.cambios.join(', ')) + '.</p>' : ''}`),
    texto: d => `La preinscripción ${d.referencia} (${d.nombre} ${d.apellidos} · ${d.correo}) ha sido ${d.cambio} por el candidato.${d.cambios && d.cambios.length ? ' Cambios: ' + d.cambios.join(', ') + '.' : ''}`,
  },
  // ZLabs · resultado de la selección (admitida / reserva / no_admitida)
  // Plaza de oyente liberada (César, 29-10-2026): texto en borrador
  'zlabs-plaza-oyente': {
    asunto: d => `ZLabs ${d.edicion}: ya tienes plaza de oyente (${d.referencia})`,
    html: d => marco(`
<p>Hola, ${esc(d.nombre)}:</p>
<p>Ha quedado libre una plaza de oyente en <strong>${ZL(d)}</strong> y es para ti: <strong>tu plaza está confirmada</strong>.</p>
<p>Te enviaremos por correo las instrucciones para completar la inscripción (gratis con suscripción anual; 10 € sin ella) y recibir tu código QR de acceso.</p>
${PIE_ZL(d, 'Si ya no te interesa, dínoslo cuanto antes para pasar la plaza a la siguiente persona:', true)}`),
    texto: d => `Hola, ${d.nombre}:

Ha quedado libre una plaza de oyente en ZLabs ${d.edicion} y es para ti: tu plaza está confirmada.
Te enviaremos por correo las instrucciones para completar la inscripción (gratis con suscripción anual; 10 € sin ella) y recibir tu código QR de acceso.

Referencia ${d.referencia}. Si ya no te interesa, dínoslo cuanto antes para pasar la plaza a la siguiente persona: ${CONTACTO_ZL}.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
  'zlabs-resultado': {
    asunto: d => d.estado === 'admitida' ? `ZLabs ${d.edicion}: ¡has sido ${g(d, 'admitido', 'admitida', 'seleccionado/a')}! (${d.referencia})`
               : d.estado === 'reserva'  ? `ZLabs ${d.edicion}: estás en la lista de reserva (${d.referencia})`
               : `ZLabs ${d.edicion}: resultado de la selección (${d.referencia})`,
    html: d => marco(`
<p>Hola, ${esc(d.nombre)}:</p>
${d.estado === 'admitida'
  ? `<p>La comisión artística de <strong>${ZL(d)}</strong> te ha seleccionado como <strong>${g(d, 'alumno activo', 'alumna activa', 'alumno/a activo/a')}</strong> (${esc(d.cuerda)})${d.papel ? ', con el papel de <strong>' + esc(d.papel) + '</strong>' : ''}. ¡Enhorabuena!</p>
<p>En los próximos días te enviaremos la partitura y el libreto, y las instrucciones para pagar la matrícula y confirmar tu plaza. Recuerda que hay que llegar al curso con el papel aprendido de memoria.</p>`
  : d.estado === 'reserva'
  ? `<p>La comisión artística de <strong>${ZL(d)}</strong> te ha incluido en la <strong>lista de reserva</strong> (${esc(d.cuerda)}). Si queda libre una plaza de tu cuerda, te avisaremos por correo.</p>
<p>Mientras tanto, puedes acudir como <strong>oyente</strong>.</p>`
  : `<p>Gracias por presentarte a <strong>${ZL(d)}</strong>. Esta vez la comisión artística no ha podido seleccionarte como ${g(d, 'alumno activo', 'alumna activa', 'alumno/a activo/a')}.</p>
<p>Puedes asistir como <strong>oyente</strong> y presentarte a las próximas convocatorias de <span style="color:#0097B2">Z</span>Labs.</p>`}
${PIE_ZL(d, 'Para cualquier duda, escríbenos a', true)}`),
    texto: d => `Hola, ${d.nombre}:

${d.estado === 'admitida'
  ? `La comisión artística de ZLabs ${d.edicion} te ha seleccionado como ${g(d, 'alumno activo', 'alumna activa', 'alumno/a activo/a')} (${d.cuerda})${d.papel ? ', con el papel de ' + d.papel : ''}. ¡Enhorabuena!
En los próximos días te enviaremos la partitura y el libreto, y las instrucciones para pagar la matrícula y confirmar tu plaza. Recuerda que hay que llegar al curso con el papel aprendido de memoria.`
  : d.estado === 'reserva'
  ? `La comisión artística de ZLabs ${d.edicion} te ha incluido en la lista de reserva (${d.cuerda}). Si queda libre una plaza de tu cuerda, te avisaremos por correo.
Mientras tanto, puedes acudir como oyente.`
  : `Gracias por presentarte a ZLabs ${d.edicion}. Esta vez la comisión artística no ha podido seleccionarte como ${g(d, 'alumno activo', 'alumna activa', 'alumno/a activo/a')}.
Puedes asistir como oyente y presentarte a las próximas convocatorias de ZLabs.`}

Referencia ${d.referencia}. Para cualquier duda, escríbenos a ${CONTACTO_ZL}.

Instituto Nacional de Zarzuela · https://innaz.es`,
  },
};
