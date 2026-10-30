# Mi INNAZ dentro de la web (30-10-2026)

Desde el 30-10-2026 el código de Mi INNAZ (área privada, suscripciones, gestión `/gestion`, ZLabs) vive en este
repositorio, junto a la web pública. Origen: `12 Desarrollo/mi-innaz/pruebas/` (que queda como histórico).

- `functions/` · filtro común `_middleware.js` (con el **interruptor `MI_INNAZ`**: sin la variable `MI_INNAZ=si` en
  Cloudflare, las rutas de Mi INNAZ responden 404 y la web se comporta como antes de la unión), librerías `_lib/`,
  plantillas de correo `_plantillas/` y la API (`/api/acceso`, `/api/mi`, `/api/gestion`, `/api/zlabs`, `/api/planes`,
  `/api/llaves`, `/api/instalar`). `/api/valoracion` (votos) ya estaba aquí: usa la misma base `DB`.
- Páginas: `entrar`, `acceder`, `mi-innaz`, `gestion`, `suscripciones`, `zlabs-preinscripcion`, `zlabs-mi-preinscripcion`,
  `instalar`; recursos `llaves.js`, `paises.js`, `mi-innaz.css` (antes `estilo.css`).
- `_routes.json`: solo esas rutas y `/api/*` pasan por las funciones; el resto de la web se sirve como siempre
  (sin gastar peticiones de Workers).
- Configuración (variables, secretos y base D1) en el panel de Cloudflare, proyecto `innaz-web`, **por entorno**:
  Preview = pruebas.innaz-web.pages.dev (base `innaz-pruebas`, `MI_INNAZ=si`, correo en simulación);
  Production = innaz.es (sin `MI_INNAZ` hasta el paso a real). Lista de variables de referencia:
  `_variables-mi-innaz-referencia.toml` (no se publica).
- Documentación de cada módulo: `12 Desarrollo/mi-innaz/pruebas/LEEME.md` y las actas de `08 Actas`.
