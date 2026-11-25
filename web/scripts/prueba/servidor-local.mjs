// Servidor local para probar las pantallas: sirve public/ y /api/rpc con la base de mentira y servicios simulados.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearDbFalsa } from './db-falsa.mjs';
const aqui = path.dirname(fileURLToPath(import.meta.url)), pub = path.join(aqui, '../../public');
Object.assign(process.env, { SUPABASE_URL: 'https://falso.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'k',
  ANTHROPIC_API_KEY: 'k', PLACES_API_KEY: 'k', ADMIN_EMAILS: 'hernan@autoinfinity.com.ar', SECRETO: 's', APP_URL: 'http://localhost:8787',
  WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_ID: '1', WHATSAPP_PRUEBA_A: '1164577267' });
const tool = input => ({ ok: true, json: async () => ({}), text: async () => JSON.stringify({ content: [{ type: 'tool_use', input }] }) });
globalThis.fetch = async (url, o = {}) => {
  url = String(url); const body = o.body ? JSON.parse(o.body) : {};
  if (url.includes('anthropic')) {
    const s = body.system;
    if (s.includes('Filtrás')) return tool({ sirven: [0, 1, 2] });
    if (s.includes('Leés el tablero')) return tool({ km: 133210, esTotal: true });
    if (s.includes('Leé la respuesta')) return tool({ cotiza: true, precio: 450000, cuando: 'Miércoles 18', incluye: 'Colocación y balanceo' });
    if (body.messages.length === 1) return tool({ pregunta: '¿Tenés alguna marca preferida?', opciones: ['Michelin', 'Pirelli', 'La más barata'] });
    return tool({ titulo: 'Cambio de 4 cubiertas', detalle: '4 cubiertas Michelin 225/55 R18', tipoTaller: 'gomería', trabajoTaller: '4 cubiertas Michelin 225/55 R18' });
  }
  if (url.includes('geocode/json?region')) return { json: async () => ({ results: [{ geometry: { location: { lat: -34.53, lng: -58.48 } } }] }) };
  if (url.includes('geocode/json?language')) return { json: async () => ({ results: [{ address_components: [{ long_name: 'Villa Adelina', types: ['locality'] }] }] }) };
  if (url.includes('places:searchText')) return { json: async () => ({ places: [
    { id: 'G1', displayName: { text: 'Gomería El Rulo' }, formattedAddress: 'Av. Maipú 100, Olivos', location: { latitude: -34.52, longitude: -58.49 }, rating: 4.7, userRatingCount: 210, internationalPhoneNumber: '+54 9 11 5555-0001' },
    { id: 'G2', displayName: { text: 'Neumáticos Sur' }, formattedAddress: 'Calle 2', location: { latitude: -34.525, longitude: -58.485 }, rating: 4.5, userRatingCount: 80, internationalPhoneNumber: '+54 11 4799-0002' },
    { id: 'G3', displayName: { text: 'Gomería 24 hs' }, formattedAddress: 'Calle 3', location: { latitude: -34.535, longitude: -58.475 }, rating: 4.2, userRatingCount: 30, internationalPhoneNumber: '+54 9 11 5555-0003' }] }) };
  if (url.includes('graph.facebook.com')) return { ok: true, json: async () => ({}) };
  return { ok: true, json: async () => ({}), text: async () => '' };
};
const base = await import('../../lib/base.js'); base._usarDb(crearDbFalsa());
const { default: rpc } = await import('../../api/rpc.js');
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/rpc') {
    let b = ''; for await (const ch of req) b += ch;
    req.body = JSON.parse(b || '{}');
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    return rpc(req, res);
  }
  const f = path.join(pub, u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith(pub) || !fs.existsSync(f)) { res.statusCode = 404; return res.end('no'); }
  res.setHeader('content-type', tipos[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(8787, () => console.log('listo en http://localhost:8787'));
