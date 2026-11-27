-- =====================================================================
-- AUTOINFINITY SERVICE — base de datos (Supabase / Postgres)
-- Se pega UNA vez en Supabase → SQL Editor → Run.
-- Se puede volver a correr: no borra datos.
-- =====================================================================

-- Toda la app entra por el servidor (Vercel) con la clave de servicio.
-- Por eso cada tabla tiene la seguridad por filas (RLS) prendida y SIN reglas:
-- nadie puede leer ni escribir directo desde afuera, ni con la clave pública.


-- ---------- Usuarios (el acceso lo maneja Supabase Auth; acá van sus datos) ----------
create table if not exists usuarios (
  email            text primary key,
  nombre           text not null default '',
  mecanico_nombre  text not null default '',
  mecanico_tel     text not null default '',
  seguro_nombre    text not null default '',
  seguro_tel       text not null default '',
  creado           timestamptz not null default now()
);

-- ---------- Autos ----------
-- Los km "primera" y "última" están copiados acá para calcular rápido sin leer todas las lecturas.
create table if not exists autos (
  id              uuid primary key default gen_random_uuid(),
  marca           text not null,
  modelo          text not null,
  anio            text not null default '',
  direccion       text not null default '',
  lat             double precision,
  lng             double precision,
  km_primera      integer not null,
  fecha_primera   timestamptz not null default now(),
  km_ultima       integer not null,
  fecha_ultima    timestamptz not null default now(),
  creado          timestamptz not null default now()
);

-- Quién ve cada auto (un auto se puede compartir; el mail puede no tener cuenta todavía)
create table if not exists auto_usuarios (
  auto_id  uuid not null references autos(id) on delete cascade,
  email    text not null,
  creado   timestamptz not null default now(),
  primary key (auto_id, email)
);
create index if not exists auto_usuarios_email on auto_usuarios (email);

create table if not exists lecturas (
  id       bigint generated always as identity primary key,
  auto_id  uuid not null references autos(id) on delete cascade,
  fecha    timestamptz not null default now(),
  km       integer not null,
  fuente   text not null default 'manual'   -- alta | manual | foto
);
create index if not exists lecturas_auto on lecturas (auto_id, fecha);

-- ---------- Talleres ----------
-- Un mismo negocio de Google puede estar en más de un rubro (una fila por rubro).
create table if not exists talleres (
  id            uuid primary key default gen_random_uuid(),
  google_id     text,                       -- id de Google Maps (vacío si se cargó a mano)
  tipo          text not null,              -- rubro: mecánica, gomería, ...
  nombre        text not null,
  telefono      text not null default '',
  direccion     text not null default '',
  lat           double precision,
  lng           double precision,
  rating        real not null default 0,
  resenas       integer not null default 0,
  en_lista      text,                       -- 'si' proveedor, 'no' lista negra, null sin definir
  web           text not null default '',
  email         text not null default '',
  whatsapp      text not null default '',
  contacto      text not null default '',
  invitado      text not null default '',
  mail_buscado  timestamptz,
  creado        timestamptz not null default now(),
  unique (google_id, tipo)
);
create index if not exists talleres_tipo_lugar on talleres (tipo, lat, lng);

-- ---------- Casos (problemas, presupuestos y services) ----------
create table if not exists casos (
  id              uuid primary key default gen_random_uuid(),
  auto_id         uuid not null references autos(id) on delete cascade,
  email           text not null,
  fecha           timestamptz not null default now(),
  tipo            text not null,            -- problema | presupuesto | service
  descripcion     text not null default '',
  foto_path       text not null default '',
  titulo          text not null default '',
  explicacion     text not null default '',
  que_hacer       text not null default '',
  seguridad       text not null default '',
  urgencia        text not null default 'baja',
  tipo_taller     text not null default 'mecánica',
  pedido          text not null default '',
  modo            text not null default '',  -- normal | urgente
  vence           timestamptz,
  estado          text not null default 'nuevo',  -- nuevo | cotizando | listo | elegido | cerrado
  taller_elegido  uuid references talleres(id),
  calificacion    smallint,
  comentario      text not null default '',
  foto_resena     text not null default '',
  fecha_resena    timestamptz,
  avisado         timestamptz,
  modificado      timestamptz
);
create index if not exists casos_auto on casos (auto_id, fecha desc);
create index if not exists casos_estado_vence on casos (estado, vence);
create index if not exists casos_elegido on casos (taller_elegido) where calificacion is not null;

create table if not exists envios (
  caso_id    uuid not null references casos(id) on delete cascade,
  taller_id  uuid not null references talleres(id) on delete cascade,
  fecha      timestamptz not null default now(),
  estado     text not null default 'pendiente',   -- pendiente | enviado | respondio | no cotiza
  wa_error   text not null default '',
  primary key (caso_id, taller_id)
);
create index if not exists envios_taller on envios (taller_id);

create table if not exists cotizaciones (
  id         bigint generated always as identity primary key,
  caso_id    uuid not null references casos(id) on delete cascade,
  taller_id  uuid not null references talleres(id) on delete cascade,
  fecha      timestamptz not null default now(),
  precio     numeric,
  cuando     text not null default '',
  incluye    text not null default '',
  texto      text not null default '',
  disponible date                          -- desde cuándo lo pueden hacer (para ordenar por tiempos)
);
create index if not exists cotizaciones_caso on cotizaciones (caso_id);
alter table cotizaciones add column if not exists disponible date;

-- ---------- Zonas (de dónde duermen los autos) ----------
create table if not exists zonas (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  lat              double precision not null,
  lng              double precision not null,
  estado           jsonb not null default '{}'::jsonb,   -- por rubro: { km, veces, ultima }
  ultima_recluta   timestamptz,
  creado           timestamptz not null default now()
);
create index if not exists zonas_lugar on zonas (lat, lng);

create table if not exists contactos (
  id      bigint generated always as identity primary key,
  fecha   timestamptz not null default now(),
  email   text not null,
  nombre  text not null default '',
  tipo    text not null,
  texto   text not null,
  estado  text not null default 'nuevo'
);

-- Búsquedas en Google ya hechas (Google cobra cada una: no se repiten por 30 días)
create table if not exists busquedas (
  clave  text primary key,
  fecha  timestamptz not null default now()
);

-- Cuántas veces usó cada persona la IA (tope diario para cuidar los costos)
create table if not exists uso_ia (
  id     bigint generated always as identity primary key,
  email  text not null,
  fecha  timestamptz not null default now(),
  tipo   text not null default ''
);
create index if not exists uso_ia_email_fecha on uso_ia (email, fecha);

-- ---------- Distancia en km entre dos puntos ----------
create or replace function km_entre(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Talleres de un rubro a menos de X km (primero filtra por un cuadrado, que usa el índice, y después por distancia real)
create or replace function talleres_cerca(p_lat double precision, p_lng double precision, p_km double precision, p_tipo text default null)
returns table (taller talleres, km double precision) language sql stable as $$
  select t, km_entre(p_lat, p_lng, t.lat, t.lng)
  from talleres t
  where (p_tipo is null or t.tipo = p_tipo)
    and t.lat between p_lat - p_km / 111.0 and p_lat + p_km / 111.0
    and t.lng between p_lng - p_km / (111.0 * cos(radians(p_lat))) and p_lng + p_km / (111.0 * cos(radians(p_lat)))
    and km_entre(p_lat, p_lng, t.lat, t.lng) <= p_km
$$;

-- ---------- Seguridad: RLS prendido en todo, sin reglas ----------
alter table usuarios       enable row level security;
alter table autos          enable row level security;
alter table auto_usuarios  enable row level security;
alter table lecturas       enable row level security;
alter table talleres       enable row level security;
alter table casos          enable row level security;
alter table envios         enable row level security;
alter table cotizaciones   enable row level security;
alter table zonas          enable row level security;
alter table contactos      enable row level security;
alter table busquedas      enable row level security;
alter table uso_ia         enable row level security;
revoke execute on function talleres_cerca(double precision, double precision, double precision, text) from public, anon, authenticated;

-- ---------- Permisos para el servidor ----------
-- Los proyectos nuevos de Supabase pueden venir sin permisos automáticos: se los damos explícitos
-- SOLO a la clave de servicio (la que usa Vercel). La clave pública no recibe nada.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on function km_entre(double precision, double precision, double precision, double precision) to service_role;
grant execute on function talleres_cerca(double precision, double precision, double precision, text) to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
