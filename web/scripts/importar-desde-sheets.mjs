// =====================================================================
// Pasa los talleres y las zonas de la planilla vieja (Apps Script) a Supabase.
// Los talleres valen plata (cada búsqueda en Google se pagó), por eso conviene traerlos.
//
// 1. En la planilla vieja: pestaña "Talleres" → Archivo → Descargar → CSV. Lo mismo con "Zonas".
// 2. Correr (con las claves de Supabase):
//    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/importar-desde-sheets.mjs Talleres.csv Zonas.csv
// =====================================================================
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [csvTalleres, csvZonas] = process.argv.slice(2);
if (!csvTalleres) { console.log('Uso: node scripts/importar-desde-sheets.mjs Talleres.csv [Zonas.csv]'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Lector de CSV simple que respeta comillas
function leerCsv(ruta) {
  const t = fs.readFileSync(ruta, 'utf8').replace(/^﻿/, '');
  const filas = []; let fila = [], campo = '', comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) { if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') comillas = false; else campo += c; }
    else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...resto] = filas;
  return resto.filter(f => f.some(Boolean)).map(f => Object.fromEntries(cab.map((k, i) => [k.trim(), (f[i] || '').trim()])));
}
const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);

const talleres = leerCsv(csvTalleres).filter(t => t.nombre && t.tipo).map(t => ({
  google_id: t.placeId && !t.placeId.startsWith('M') ? t.placeId : null,
  tipo: t.tipo, nombre: t.nombre, telefono: t.telefono.replace(/^'/, ''), direccion: t.direccion || '',
  lat: num(t.lat), lng: num(t.lng), rating: num(t.rating) || 0, resenas: num(t.resenas) || 0,
  en_lista: t.enListado === 'si' || t.enListado === 'no' ? t.enListado : null,
  web: t.web || '', email: t.email || '', whatsapp: (t.whatsapp || '').replace(/^'/, ''), contacto: t.contacto || '', invitado: t.invitado || ''
})).filter(t => !t.telefono.startsWith('#'));
const deGoogle = talleres.filter(t => t.google_id), aMano = talleres.filter(t => !t.google_id);
if (deGoogle.length) {
  const { error } = await db.from('talleres').upsert(deGoogle, { onConflict: 'google_id,tipo', ignoreDuplicates: true });
  if (error) throw error;
}
if (aMano.length) { const { error } = await db.from('talleres').insert(aMano); if (error) throw error; }
console.log('Talleres importados:', talleres.length);

if (csvZonas) {
  const zonas = leerCsv(csvZonas).filter(z => num(z.lat)).map(z => {
    let estado = {}; try { estado = JSON.parse(z.estado || '{}'); } catch (e) {}
    return { nombre: z.nombre || 'Zona', lat: num(z.lat), lng: num(z.lng), estado };
  });
  if (zonas.length) { const { error } = await db.from('zonas').insert(zonas); if (error) throw error; }
  console.log('Zonas importadas:', zonas.length);
}
