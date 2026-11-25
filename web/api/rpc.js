// =====================================================================
// Puerta única del servidor: la app manda { fn, args } y acá se decide
// quién es (por la sesión de Supabase) y qué puede hacer.
// =====================================================================
import * as app from '../lib/app.js';
import { db, env, Aviso } from '../lib/base.js';

// Sin sesión: solo la configuración pública y la página de alta de talleres
const PUBLICAS = {
  config: async () => ({ supabaseUrl: env('SUPABASE_URL'), supabaseAnonKey: env('SUPABASE_ANON_KEY') }),
  datosTaller: app.datosTaller,
  altaTaller: app.altaTaller,
  bajaTaller: app.bajaTaller
};

// Con sesión: el primer argumento (el mail) lo pone el servidor, nunca el celular.
// Las de administración controlan adentro que el mail sea de un admin.
const CON_SESION = [
  'inicio', 'guardarPerfil', 'agregarAuto', 'cargarKm', 'leerTablero', 'compartir', 'hablarInfi', 'casoService',
  'pedirCotizaciones', 'verCaso', 'elegirTaller', 'cortarCaso', 'modificarPedido', 'calificar', 'historial', 'enviarContacto',
  'panelAdmin', 'marcarEnvio', 'reenviarWhatsApp', 'cargarRespuesta', 'agregarTallerManual', 'marcarLista', 'marcarAvisado',
  'agregarZona', 'reclutarAhora', 'marcarInvitado', 'forzarInforme'
];

async function quienEs(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data || !data.user || !data.user.email) return null;
  return data.user.email.toLowerCase();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usá POST' });
  try {
    const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const fn = String(cuerpo.fn || ''), args = Array.isArray(cuerpo.args) ? cuerpo.args : [];
    if (PUBLICAS[fn]) return res.json({ ok: await PUBLICAS[fn](...args) });
    if (!CON_SESION.includes(fn) || typeof app[fn] !== 'function') return res.status(404).json({ error: 'Función desconocida' });
    const email = await quienEs(req);
    if (!email) return res.status(401).json({ error: 'Tu sesión venció. Entrá de nuevo.', sesion: false });
    return res.json({ ok: await app[fn](email, ...args) });
  } catch (e) {
    if (e instanceof Aviso) return res.status(400).json({ error: e.message });
    console.error('RPC', e);
    return res.status(500).json({ error: 'Algo falló de nuestro lado. Probá de nuevo en un rato.' });
  }
}
