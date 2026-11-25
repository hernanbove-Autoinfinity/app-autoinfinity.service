-- =====================================================================
-- AUTOINFINITY SERVICE — lugar para las fotos (Supabase Storage)
-- Se pega UNA vez en Supabase → SQL Editor → Run, después de schema.sql.
-- =====================================================================

-- Fotos de los problemas: privadas (solo se ven con un link que vence en 1 hora)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

-- Fotos de las reseñas: públicas (las ve cualquier cliente que mira el taller)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resenas', 'resenas', true, 3145728, array['image/jpeg'])
on conflict (id) do nothing;
