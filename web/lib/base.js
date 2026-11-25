// =====================================================================
// Herramientas comunes del servidor: base de datos, fechas, teléfonos
// =====================================================================
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const env = k => process.env[k] || '';
export const TZ = 'America/Argentina/Buenos_Aires';

let _db;
export function db() {
  if (!_db) {
    if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_ROLE_KEY')) throw new Error('Falta configurar Supabase en Vercel');
    _db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _db;
}

// Devuelve los datos o tira el error de Supabase con un mensaje claro
// Solo para las pruebas automáticas: permite usar una base de datos de mentira
export function _usarDb(x) { _db = x; }

export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) { console.error('DB', error); throw new Error('Error de base de datos: ' + error.message); }
  return data;
}

// Error que se le puede mostrar tal cual al usuario
export class Aviso extends Error {}
export const aviso = m => { throw new Aviso(m); };

// ---------- Admins ----------
export const admins = () => env('ADMIN_EMAILS').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
export const esAdmin = email => admins().includes(String(email || '').toLowerCase());
export const soloAdmin = email => { if (!esAdmin(email)) aviso('Sin permiso'); };
export const appUrl = () => env('APP_URL').replace(/\/$/, '');

// ---------- Fechas en hora argentina ----------
function partes(d) {
  const p = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(d));
  return Object.fromEntries(p.map(x => [x.type, x.value]));
}
export const f = d => { if (!d) return ''; const p = partes(d); return p.day + '/' + p.month + ' ' + p.hour + ':' + p.minute; };
export const fd = d => { if (!d) return ''; const p = partes(d); return p.day + '/' + p.month + '/' + p.year; };
export const fdc = d => { if (!d) return ''; const p = partes(d); return p.day + '/' + p.month; };
const DIAS = { lun: 1, mar: 2, mié: 3, mie: 3, jue: 4, vie: 5, sáb: 6, sab: 6, dom: 7 };
export function diaHora(d) {
  const p = partes(d);
  return { dia: DIAS[String(p.weekday).toLowerCase().replace('.', '')] || 0, hora: Number(p.hour) };
}
// Suma horas hábiles: lunes a viernes de 9 a 18, sábados de 9 a 13
export function sumarHorasHabiles(desde, horas) {
  let d = new Date(desde), resto = horas * 4, vueltas = 0;
  while (resto > 0 && vueltas++ < 4000) {
    const { dia, hora } = diaHora(d);   // se mira el comienzo de cada cuarto de hora
    d = new Date(d.getTime() + 15 * 60000);
    if ((dia >= 1 && dia <= 5 && hora >= 9 && hora < 18) || (dia === 6 && hora >= 9 && hora < 13)) resto--;
  }
  return d;
}

// ---------- Números y textos ----------
export const fmtKm = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const lindo = t => String(t || '').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());
export function distancia(a, b, c, d) {
  const r = x => x * Math.PI / 180, R = 6371;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const redondo1 = n => Math.round(n * 10) / 10;

// En Argentina, los celulares en formato internacional empiezan con 54 9. Los fijos no tienen WhatsApp.
export function normTel(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d && !d.startsWith('54')) d = '549' + d.replace(/^0/, '');
  return d;
}
export const esCelular = tel => normTel(tel).startsWith('549');
export const waLink = (tel, msg) => esCelular(tel) ? 'https://wa.me/' + normTel(tel) + '?text=' + encodeURIComponent(msg) : '';

// ---------- Links firmados para que el taller se anote (no se pueden falsificar) ----------
export function firma(id) {
  if (!env('SECRETO')) throw new Error('Falta SECRETO en Vercel');
  return crypto.createHmac('sha256', env('SECRETO')).update(String(id)).digest('base64url').slice(0, 16);
}
export const firmaOk = (id, t) => {
  const a = Buffer.from(firma(id)), b = Buffer.from(String(t || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
export const linkAlta = id => appUrl() + '/taller.html?id=' + encodeURIComponent(id) + '&t=' + firma(id);
export const linkBaja = id => linkAlta(id) + '&baja=1';

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
