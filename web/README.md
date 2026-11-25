# Autoinfinity Service — versión para escalar (Vercel + Supabase)

Esta carpeta es la app nueva. La versión de Apps Script (en la raíz del repositorio) sigue funcionando igual hasta que esta esté lista.

## Cómo está armada

| Parte | Dónde vive | Para qué |
|---|---|---|
| Pantallas (`public/`) | Vercel | La app que ve el cliente, la página de alta de talleres, ícono y manifest para instalarla en el celular |
| Servidor (`api/` + `lib/`) | Vercel | Toda la lógica: Infi, talleres, cotizaciones, panel. Una sola puerta: `/api/rpc` |
| Tareas automáticas (`api/cron.js`) | Vercel Cron | Todos los días a las 9: avisos de km y service, cierre de plazos, búsqueda de talleres por zona |
| Base de datos y acceso | Supabase | Postgres con todo cerrado (RLS) y entrada con código de 6 números por mail |
| Fotos | Supabase Storage | Problemas (privadas) y reseñas (públicas). La foto del tablero NO se guarda |
| Mails | Resend | Avisos, invitaciones a talleres y los códigos de entrada |
| WhatsApp | API oficial de Meta | Pedidos y cierres a talleres. En modo prueba te llegan a vos |

Cada vez que se sube un cambio a GitHub, Vercel publica la app solo. Ya no hace falta el Actualizador.

---

## Puesta en marcha (una sola vez)

### 1. Supabase (base de datos y acceso) — 10 minutos
1. Entrá a **supabase.com** con el mail de Autoinfinity y creá un proyecto **autoinfinity-service**.
   - Región: **South America (São Paulo)**, la más cerca de Argentina.
   - Guardá la contraseña de la base en un lugar seguro.
2. **SQL Editor** → New query → pegá todo `supabase/schema.sql` → **Run**. Después lo mismo con `supabase/storage.sql`.
3. **Authentication → Sign In / Providers → Email**: dejalo prendido. Fijate que **Email OTP Length** sea **6**.
4. **Authentication → Email Templates → Magic Link**: reemplazá el texto por esto, para que llegue el código y no un link:
   ```
   <h2>Tu código para entrar a Autoinfinity Service</h2>
   <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Vence en 1 hora. Si no lo pediste, ignorá este mail.</p>
   ```
5. **Project Settings → API Keys**: vas a necesitar la **URL**, la clave **anon / publishable** y la clave **service_role / secret**. La service_role es como la llave de la base: va solo en Vercel, nunca en otro lado.

> Ojo: el mail que trae Supabase de fábrica manda muy pocos mails por hora. Alcanza para probar, pero antes de dársela a clientes hay que conectar Resend (paso 2).

### 2. Resend (mails) — 15 minutos
1. Entrá a **resend.com** y creá la cuenta.
2. **Domains → Add domain** → `autoinfinity.com.ar`. Te da unos registros DNS para cargar donde está el dominio. Hasta que no se verifiquen, los mails no salen.
3. **API Keys → Create** y guardala.
4. En **Supabase → Authentication → SMTP Settings** prendé "Custom SMTP":
   host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = la API key de Resend,
   remitente `service@autoinfinity.com.ar`, nombre `Autoinfinity Service`.

### 3. Google Maps
Usamos la misma clave de antes (`PLACES_API_KEY`). En Google Cloud → APIs y servicios → Biblioteca, **habilitá también "Geocoding API"** (antes lo hacía Apps Script gratis; ahora lo hace la clave). En la restricción de la clave, sumá Geocoding API.

### 4. Vercel (donde vive la app) — 10 minutos
1. Entrá a **vercel.com** → "Continue with GitHub" con la cuenta **hernanbove-Autoinfinity**.
2. **Add New → Project** → importá **app-autoinfinity.service**.
3. **Root Directory: `web`**. Framework: **Other**. No toques el resto.
4. En **Environment Variables** cargá:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | la URL del paso 1.5 |
| `SUPABASE_ANON_KEY` | la clave anon / publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | la clave service_role / secret |
| `ANTHROPIC_API_KEY` | la misma que usa la app de Apps Script |
| `PLACES_API_KEY` | la misma de Google |
| `ADMIN_EMAILS` | `hernanbove@autoinfinity.com.ar` (separados por coma para sumar a Diego) |
| `APP_URL` | `https://service.autoinfinity.com.ar` (o el link de Vercel mientras tanto) |
| `SECRETO` | un texto largo al azar (firma los links de los talleres) |
| `CRON_SECRET` | otro texto largo al azar (protege las tareas automáticas) |
| `RESEND_API_KEY` | la de Resend |
| `MAIL_FROM` | `Autoinfinity Service <service@autoinfinity.com.ar>` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_PRUEBA_A`, `WHATSAPP_MODO`, `WHATSAPP_PLANTILLA` | ver paso 6 (se pueden dejar para después) |

5. **Deploy**. En un minuto te da un link tipo `app-autoinfinity-service.vercel.app`.

### 5. Dominio service.autoinfinity.com.ar
1. En Vercel → el proyecto → **Settings → Domains** → agregá `service.autoinfinity.com.ar`.
2. Vercel te dice qué registro cargar (un **CNAME** `service` → `cname.vercel-dns.com`). Se carga donde se administra el DNS de autoinfinity.com.ar.
3. Cuando quede verificado, cambiá `APP_URL` en Vercel y hacé Redeploy.

### 6. WhatsApp automático (Meta) — modo prueba
1. **developers.facebook.com** → My Apps → Create App → tipo **Business** → conectala al Meta Business de Autoinfinity.
2. Agregá el producto **WhatsApp** → API Setup. Ahí está el **número de prueba** de Meta.
3. En "To", agregá **tu celular** y verificalo con el código que te llega.
4. Copiá el **Phone number ID** → `WHATSAPP_PHONE_ID`, y el **token** → `WHATSAPP_TOKEN`.
   El token de esa pantalla vence a las 24 horas: para que no venza, Business Settings → System users → crear uno con permiso `whatsapp_business_messaging` y generar un token permanente.
5. `WHATSAPP_PRUEBA_A` = tu celular (ej. `11 6457 7267`). `WHATSAPP_MODO` = `prueba`.
6. **Importante:** Meta solo deja mandar texto libre si esa persona escribió al número en las últimas 24 horas. Para probar, mandale "hola" al número de prueba desde tu WhatsApp. Para que funcione siempre, creá una **plantilla** (WhatsApp Manager → Message templates) de tipo Utility con un solo texto variable, por ejemplo:
   `Pedido de presupuesto de Autoinfinity: {{1}}`
   y poné su nombre en `WHATSAPP_PLANTILLA`.
7. Cuando quieras que les llegue a los talleres de verdad: número propio en Meta y `WHATSAPP_MODO` = `real`.

En modo prueba te llegan hasta 3 WhatsApp por pedido (se cambia con `WHATSAPP_PRUEBA_MAX`), con el nombre del taller arriba.

### 7. Traer los talleres de la planilla vieja (opcional, recomendado)
Cada taller costó una búsqueda en Google. Para no pagarlas de nuevo:
1. En la planilla vieja, pestaña **Talleres** → Archivo → Descargar → CSV. Lo mismo con **Zonas**.
2. `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/importar-desde-sheets.mjs Talleres.csv Zonas.csv`
   (lo puede correr Claude si le pasás los CSV).

---

## Costos, sin vueltas

| Servicio | Para probar | Cuando haya clientes |
|---|---|---|
| Supabase | Gratis (el proyecto se pausa si pasa 1 semana sin uso; la tarea diaria lo mantiene despierto) | **Pro, 25 USD/mes**: backups diarios y sin pausas |
| Vercel | Gratis (Hobby) | **Pro, 20 USD/mes**: el plan gratis es para uso personal, no comercial |
| Resend | Gratis hasta 3.000 mails/mes | 20 USD/mes hasta 50.000 |
| Google Maps | Cupo gratis mensual | Unos centavos por búsqueda nueva (las repetidas no se pagan) |
| Anthropic (Infi) | Centavos por consulta | Tope de 40 consultas por persona por día (`TOPE_IA_DIA`) |
| WhatsApp (Meta) | Gratis con el número de prueba | Unos centavos de dólar por conversación iniciada |

---

## Para el que programa

- Probar la lógica completa sin internet: `node scripts/prueba/flujo.mjs` (base de datos de mentira + servicios simulados).
- Probar las pantallas: `node scripts/prueba/servidor-local.mjs` y abrir `http://localhost:8787`.
- Seguridad: el celular nunca manda su mail; el servidor lo saca de la sesión de Supabase. Todas las tablas tienen RLS sin reglas, así que con la clave pública no se puede leer nada directo.
- Escala: la base usa índices por auto, por estado y por ubicación; las búsquedas de talleres por distancia filtran primero por un cuadrado que usa el índice.
