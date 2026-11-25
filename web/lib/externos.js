// =====================================================================
// Servicios de afuera: IA (Anthropic), Google Maps, mails (Resend), WhatsApp (Meta), fotos (Supabase Storage)
// =====================================================================
import { env, db, q, normTel, esCelular, aviso } from './base.js';

// ---------------- IA ----------------
export const MODELO_BARATO = () => env('MODELO_BARATO') || 'claude-haiku-5-5';
export const MODELO_BUENO = () => env('MODELO_BUENO') || 'claude-sonnet-5-5';
const TOPE_IA_DIA = () => Number(env('TOPE_IA_DIA') || 40);

// Tope diario por persona: cuida los costos si alguien abusa
export async function controlarUsoIA(email, tipo) {
  const desde = new Date(Date.now() - 864e5).toISOString();
  const { count, error } = await db().from('uso_ia').select('id', { count: 'exact', head: true }).eq('email', email).gte('fecha', desde);
  if (error) throw new Error(error.message);
  if (count >= TOPE_IA_DIA()) aviso('Llegaste al máximo de consultas a Infi por hoy. Probá mañana, o escribinos desde Contactanos.');
  await q(db().from('uso_ia').insert({ email, tipo }));
}

// La IA responde con una "herramienta": así devuelve datos ordenados y no texto suelto
export async function ia(modelo, sistema, mensajes, max, esquema) {
  if (!env('ANTHROPIC_API_KEY')) throw new Error('Falta ANTHROPIC_API_KEY en Vercel');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: modelo, max_tokens: max || 2000, system: sistema + ' Respondé SIEMPRE usando la herramienta responder.', messages: mensajes,
      tools: [{ name: 'responder', description: 'Devolvé tu respuesta con estos campos', input_schema: esquema || { type: 'object' } }],
      tool_choice: { type: 'auto' }
    })
  });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch (e) { console.error('IA rara', txt.slice(0, 500)); aviso('Infi no está disponible, probá en un rato'); }
  if (j.error) { console.error('IA error', j.error); aviso('Infi no está disponible, probá en un rato'); }
  const tool = (j.content || []).find(c => c.type === 'tool_use');
  if (tool && tool.input && Object.keys(tool.input).length) return tool.input;
  const t = (j.content || []).map(c => c.text || '').join('');
  try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
  catch (e) { console.error('IA sin datos', j.stop_reason, JSON.stringify(j.content).slice(0, 800)); aviso('Infi no pudo responder bien, probá de nuevo'); }
}

// ---------------- Google Maps ----------------
export async function geocodificar(dir) {
  if (!env('PLACES_API_KEY') || !dir) return [null, null];
  try {
    const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?region=ar&language=es&address=' +
      encodeURIComponent(dir) + '&key=' + env('PLACES_API_KEY'));
    const j = await r.json();
    const l = j.results && j.results[0] && j.results[0].geometry.location;
    return l ? [l.lat, l.lng] : [null, null];
  } catch (e) { console.error('Geocoding', e); return [null, null]; }
}
export async function barrioDe(lat, lng) {
  if (!env('PLACES_API_KEY')) return '';
  try {
    const r = await fetch('https://maps.googleapis.com/maps/api/geocode/json?language=es&latlng=' + lat + ',' + lng + '&key=' + env('PLACES_API_KEY'));
    const comp = ((await r.json()).results || [])[0]?.address_components || [];
    const c = comp.find(x => x.types.includes('sublocality')) || comp.find(x => x.types.includes('locality'));
    return c ? c.long_name : '';
  } catch (e) { return ''; }
}
export async function buscarLugares(texto, lat, lng, radioKm) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': env('PLACES_API_KEY'), 'X-Goog-FieldMask':
      'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,' +
      'places.internationalPhoneNumber,places.primaryTypeDisplayName,places.websiteUri' },
    body: JSON.stringify({ textQuery: texto, languageCode: 'es', maxResultCount: 20,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radioKm, 50) * 1000 } } })
  });
  const j = await r.json();
  if (j.error) throw new Error('Error de Google: ' + j.error.message);
  return j.places || [];
}

// ---------------- Mails (Resend) ----------------
// Si falta la clave, no corta nada: deja anotado en el registro y sigue
export async function mandarMail({ to, subject, text, html, replyTo }) {
  if (!env('RESEND_API_KEY') || !env('MAIL_FROM')) { console.log('Mail sin configurar →', to, subject); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env('RESEND_API_KEY') },
      body: JSON.stringify({ from: env('MAIL_FROM'), to: Array.isArray(to) ? to : [to], subject, text, html, reply_to: replyTo })
    });
    if (!r.ok) { console.error('Resend', r.status, await r.text()); return false; }
    return true;
  } catch (e) { console.error('Resend', e); return false; }
}

// ---------------- WhatsApp (API oficial de Meta) ----------------
// WHATSAPP_MODO = 'prueba' (todo llega a WHATSAPP_PRUEBA_A, con el nombre del taller arriba) o 'real' (le llega al taller)
export const waConfigurado = () => !!(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_ID'));
export const waModoPrueba = () => env('WHATSAPP_MODO') !== 'real';

async function waPost(cuerpo) {
  const r = await fetch('https://graph.facebook.com/v21.0/' + env('WHATSAPP_PHONE_ID') + '/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env('WHATSAPP_TOKEN') },
    body: JSON.stringify(Object.assign({ messaging_product: 'whatsapp' }, cuerpo))
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, error: j.error };
}

// Devuelve { ok, error } — nunca corta el resto del trabajo
export async function mandarWhatsApp(tel, texto, nombre) {
  if (!waConfigurado()) return { ok: false, error: 'WhatsApp sin configurar' };
  let destino = normTel(tel);
  if (waModoPrueba()) {
    destino = normTel(env('WHATSAPP_PRUEBA_A'));
    if (!destino) return { ok: false, error: 'Falta WHATSAPP_PRUEBA_A' };
    texto = '🧪 PRUEBA · iría a: ' + (nombre || '') + ' (' + (tel || 'sin teléfono') + ')\n\n' + texto;
  } else if (!esCelular(tel)) return { ok: false, error: 'No es celular' };

  // 1) Texto libre: funciona si esa persona nos escribió en las últimas 24 horas
  let r = await waPost({ to: destino, type: 'text', text: { body: texto.slice(0, 4000), preview_url: false } });
  if (r.ok) return { ok: true };
  // 2) Fuera de las 24 horas, Meta exige una plantilla aprobada (con una sola variable {{1}})
  const plantilla = env('WHATSAPP_PLANTILLA');
  if (plantilla) {
    r = await waPost({ to: destino, type: 'template', template: { name: plantilla, language: { code: env('WHATSAPP_IDIOMA') || 'es_AR' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: texto.replace(/\s*\n+\s*/g, ' · ').slice(0, 1000) }] }] } });
    if (r.ok) return { ok: true };
  }
  const e = r.error || {};
  console.error('WhatsApp', JSON.stringify(e));
  return { ok: false, error: e.code === 131047 || e.code === 131026
    ? 'Fuera de las 24 horas: falta la plantilla aprobada' : (e.message || 'No se pudo mandar') };
}

// ---------------- Fotos (Supabase Storage) ----------------
export async function subirFoto(bucket, ruta, base64) {
  const buf = Buffer.from(String(base64), 'base64');
  if (buf.length > 3 * 1024 * 1024) aviso('La foto es muy pesada');
  const { error } = await db().storage.from(bucket).upload(ruta, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) { console.error('Storage', error); return ''; }
  return ruta;
}
export async function linkFotoPrivada(ruta) {
  if (!ruta) return '';
  const { data } = await db().storage.from('fotos').createSignedUrl(ruta, 3600);
  return data ? data.signedUrl : '';
}
export const linkFotoPublica = ruta => ruta ? db().storage.from('resenas').getPublicUrl(ruta).data.publicUrl : '';
