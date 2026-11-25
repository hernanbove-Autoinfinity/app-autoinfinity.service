# Autoinfinity Service

App para clientes de Autoinfinity.

**Versión nueva, para escalar:** carpeta [`web/`](web/README.md) (Vercel + Supabase). Ahí está la guía de puesta en marcha.

**Versión de prueba actual:** Google Apps Script (los archivos de abajo), hasta que la nueva esté andando.

- `Code.gs` — servidor (Apps Script).
- `Index.html` — la app (pantallas).
- `actualizador/` — proyecto aparte que baja estos archivos y publica la versión nueva.

Claves que van en Propiedades de la secuencia de comandos de la app (nunca en el código):
`ANTHROPIC_API_KEY`, `PLACES_API_KEY` y, opcional, `ACTUALIZADOR_URL` (link del Actualizador, para el botón "⬆ Instalar actualización").

Ojo al editar `Index.html`: Google corta todo lo que viene después de una barra seguida de asterisco, y se confunde con links (https) escritos dentro de textos con comillas invertidas.
