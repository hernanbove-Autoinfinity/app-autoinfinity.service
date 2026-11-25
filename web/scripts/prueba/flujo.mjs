// Prueba completa de la app, sin internet: base de datos de mentira y servicios de afuera simulados.
// Correr con:  node scripts/prueba/flujo.mjs
import assert from 'node:assert/strict';
import { crearDbFalsa } from './db-falsa.mjs';

Object.assign(process.env, {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k', ANTHROPIC_API_KEY: 'k', PLACES_API_KEY: 'k',
  ADMIN_EMAILS: 'admin@autoinfinity.com.ar', SECRETO: 'secreto-de-prueba', APP_URL: 'https://service.autoinfinity.com.ar',
  RESEND_API_KEY: 'k', MAIL_FROM: 'Autoinfinity <service@autoinfinity.com.ar>',
  WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_ID: '123', WHATSAPP_PRUEBA_A: '11 6457 7267'
});

const enviados = { mails: [], wa: [] };
let iaLlamadas = 0;
const tool = input => ({ ok: true, json: async () => ({ content: [{ type: 'tool_use', name: 'responder', input }] }), text: async () => JSON.stringify({ content: [{ type: 'tool_use', name: 'responder', input }] }) });
globalThis.fetch = async (url, o = {}) => {
  url = String(url);
  const body = o.body ? JSON.parse(o.body) : {};
  if (url.includes('anthropic.com')) {
    iaLlamadas++;
    const s = body.system;
    if (s.includes('Filtrás negocios')) return tool({ sirven: [0, 1, 2, 3] });
    if (s.includes('Leés el tablero')) return tool({ km: 132450, esTotal: true, nota: '' });
    if (s.includes('Leé la respuesta')) return tool({ cotiza: true, precio: 450000, cuando: 'Miércoles 18', incluye: 'Mano de obra y balanceo' });
    if (body.messages.length === 1) return tool({ pregunta: '¿Qué marca preferís?', opciones: ['Michelin', 'La más barata'] });
    return tool({ titulo: 'Cambio de 4 cubiertas', detalle: '4 cubiertas Michelin 225/55 R18', tipoTaller: 'gomería', trabajoTaller: '4 cubiertas Michelin 225/55 R18' });
  }
  if (url.includes('geocode/json?region')) return { json: async () => ({ results: [{ geometry: { location: { lat: -34.53, lng: -58.48 } } }] }) };
  if (url.includes('geocode/json?language')) return { json: async () => ({ results: [{ address_components: [{ long_name: 'Villa Adelina', types: ['locality'] }] }] }) };
  if (url.includes('places:searchText')) return { json: async () => ({ places: [
    { id: 'G1', displayName: { text: 'Gomería El Rulo' }, formattedAddress: 'Av. Maipú 100', location: { latitude: -34.52, longitude: -58.49 }, rating: 4.7, userRatingCount: 210, internationalPhoneNumber: '+54 9 11 5555-0001', websiteUri: 'https://elrulo.com.ar' },
    { id: 'G2', displayName: { text: 'Neumáticos Sur' }, formattedAddress: 'Calle 2', location: { latitude: -34.525, longitude: -58.485 }, rating: 4.5, userRatingCount: 80, internationalPhoneNumber: '+54 11 4799-0002' },
    { id: 'G3', displayName: { text: 'Gomería 24 hs' }, formattedAddress: 'Calle 3', location: { latitude: -34.535, longitude: -58.475 }, rating: 4.2, userRatingCount: 30, internationalPhoneNumber: '+54 9 11 5555-0003' },
    { id: 'G4', displayName: { text: 'Cubiertas Ya' }, formattedAddress: 'Calle 4', location: { latitude: -34.54, longitude: -58.47 }, rating: 4.9, userRatingCount: 15, internationalPhoneNumber: '+54 9 11 5555-0004' },
    { id: 'G5', displayName: { text: 'Taller Lejano' }, formattedAddress: 'Lejos', location: { latitude: -35.5, longitude: -58.48 }, rating: 5, userRatingCount: 99, internationalPhoneNumber: '+54 9 11 5555-0005' }
  ] }) };
  if (url.includes('resend.com')) { enviados.mails.push(body); return { ok: true, text: async () => '' }; }
  if (url.includes('graph.facebook.com')) { enviados.wa.push(body); return { ok: true, json: async () => ({}) }; }
  if (url.includes('elrulo.com.ar')) return { text: async () => '<a href="mailto:ventas@elrulo.com.ar">mail</a> <img src="logo@2x.png">' };
  throw new Error('fetch no simulado: ' + url);
};

const base = await import('../../lib/base.js');
const dbf = crearDbFalsa();
base._usarDb(dbf);
const app = await import('../../lib/app.js');
const U = 'cliente@gmail.com', A = 'admin@autoinfinity.com.ar', OTRO = 'esposa@gmail.com';
const ok = m => console.log('✓ ' + m);
const tiraAviso = async (p, m) => { await assert.rejects(p, e => e instanceof base.Aviso); ok(m); };

// 1. Primera entrada
let d = await app.inicio(U);
assert.equal(d.autos.length, 0); assert.equal(d.admin, false); ok('inicio vacío, no es admin');
d = await app.guardarPerfil(U, { nombre: 'Laura Pérez' }); assert.equal(d.perfil.nombre, 'Laura Pérez'); ok('perfil');

// 2. Auto + zona
d = await app.agregarAuto(U, { marca: 'PEUGEOT', modelo: '3008', anio: '2019', km: 132000, direccion: 'Av. Santa Fe 1000, Villa Adelina' });
assert.equal(d.autos.length, 1); const auto = d.autos[0];
assert.equal(auto.kmEstimado, 132000); assert.equal(auto.proximoService, 140000); assert.equal(auto.mostrarService, false);
assert.equal(dbf.T.zonas.length, 1); assert.equal(dbf.T.zonas[0].nombre, 'Villa Adelina'); ok('auto agregado, zona "Villa Adelina" creada');
await tiraAviso(app.agregarAuto(U, { marca: 'X' }), 'faltan datos del auto → aviso');

// 3. Kilómetros: menor, salto raro, confirmado, foto
await tiraAviso(app.cargarKm(U, auto.id, 100), 'km menor al último → aviso');
const r1 = await app.cargarKm(U, auto.id, 190000);
assert.ok(r1.revisar); ok('salto de 58.000 km en 1 día → pide confirmación: "' + r1.revisar.slice(0, 40) + '…"');
d = await app.cargarKm(U, auto.id, 138700, 'foto', true);
assert.equal(d.autos[0].kmUltimo, 138700); assert.equal(d.autos[0].mostrarService, true); ok('km cargado; ahora aparece "Cotizar service" (faltan 1.300 km)');
const t1 = await app.leerTablero(U, auto.id, 'AAAA');
assert.equal(t1.km, 132450); assert.equal(Object.keys(dbf.archivos).length, 0); ok('foto del tablero: leyó 132.450 y NO guardó la foto');

// 4. Seguridad: otro usuario no ve ni toca el auto; un cliente no entra al panel
await tiraAviso(app.cargarKm('intruso@x.com', auto.id, 140000), 'otro usuario no puede cargar km en mi auto');
await tiraAviso(app.panelAdmin(U), 'cliente no entra al panel');

// 5. Infi: pregunta y después resultado
let r = await app.hablarInfi(U, auto.id, 'presupuesto', [{ rol: 'cliente', texto: 'Quiero cambiar las 4 cubiertas' }], 'BBBB');
assert.ok(r.pregunta); ok('Infi pregunta: ' + r.pregunta);
r = await app.hablarInfi(U, auto.id, 'presupuesto', [{ rol: 'cliente', texto: 'Quiero cambiar las 4 cubiertas' }, { rol: 'infi', texto: r.pregunta }, { rol: 'cliente', texto: 'Michelin' }], 'BBBB');
assert.ok(r.final); const casoId = r.caso.id;
assert.equal(dbf.T.casos[0].tipo_taller, 'gomería'); assert.ok(dbf.archivos['fotos/' + casoId + '.jpg']); ok('caso creado (gomería) y foto del problema guardada en privado');

// 6. Pedir cotizaciones: busca en Google, filtra por IA y manda WhatsApp (modo prueba: a Hernán, máximo 3)
let c = await app.pedirCotizaciones(U, casoId, 'normal');
assert.equal(c.estado, 'cotizando'); assert.equal(c.consultados, 4); assert.equal(c.cotizaciones.length, 0);
assert.equal(dbf.T.talleres.length, 4, 'el taller lejano no se guarda'); ok('4 gomerías encontradas (la de 100 km quedó afuera)');
assert.equal(enviados.wa.length, 3); assert.ok(enviados.wa.every(w => w.to === '5491164577267'));
assert.ok(enviados.wa[0].text.body.startsWith('🧪 PRUEBA')); assert.ok(enviados.wa[0].text.body.includes('Sin intermediarios'));
ok('3 WhatsApp de prueba a tu número, con presentación: «' + enviados.wa[0].text.body.split('\n').slice(0, 1)[0] + '»');
await tiraAviso(app.pedirCotizaciones(U, casoId, 'normal'), 'no se puede pedir dos veces');

// 7. Panel: carga respuesta de un taller
let p = await app.panelAdmin(A);
assert.equal(p.pedidos.length, 1); const env1 = p.pedidos[0].envios.find(e => e.nombre === 'Gomería El Rulo');
assert.equal(env1.estado, 'enviado'); assert.equal(env1.primeraVez, true); assert.equal(env1.celular, true);
assert.equal(p.base.zonas.length, 1); ok('panel: pedido con talleres, el primero ya "enviado" por WhatsApp');
p = await app.cargarRespuesta(A, casoId, env1.placeId, 'Te lo hago a $450.000 el miércoles 18, incluye balanceo');
c = await app.verCaso(U, casoId); assert.equal(c.cotizaciones.length, 0); assert.equal(c.respondieron, 1);
ok('respuesta cargada; el cliente todavía no la ve (es normal, espera las 48 h)');

// 8. Informe ya (prueba), elegir, calificar
c = await app.forzarInforme(A, casoId);
assert.equal(c.estado, 'listo'); assert.equal(c.cotizaciones.length, 1); assert.equal(c.cotizaciones[0].precio, 450000);
assert.equal(c.cotizaciones[0].interna.faltan, 5); ok('informe listo: 1 cotización de $450.000, "faltan reseñas"');
assert.ok(enviados.mails.some(m => m.subject.startsWith('Ya tenés tu informe'))); ok('mail al cliente: "Ya tenés tu informe"');
const waAntes = enviados.wa.length;
c = await app.elegirTaller(U, casoId, env1.placeId);
assert.equal(c.estado, 'elegido'); assert.equal(c.elegido.nombre, 'Gomería El Rulo');
assert.equal(enviados.wa.length, waAntes + 1); ok('eligió taller y se avisó el cierre por WhatsApp a los demás');
await tiraAviso(app.calificar(U, casoId, 0, ''), 'calificar sin estrellas → aviso');
c = await app.calificar(U, casoId, 5, 'Rápidos y honestos', 'CCCC');
assert.equal(c.calificacion, 5); assert.ok(dbf.archivos['resenas/' + casoId + '.jpg']); ok('calificación con foto pública');

// 9. Compartir el auto
d = await app.compartir(U, auto.id, OTRO);
d = await app.inicio(OTRO); assert.equal(d.autos.length, 1); ok('auto compartido: la otra persona lo ve');
const h = await app.historial(OTRO); assert.equal(h.length, 1); ok('historial compartido');

// 10. Modificar y cerrar otro pedido
r = await app.hablarInfi(U, auto.id, 'presupuesto', [{ rol: 'cliente', texto: 'cubiertas' }, { rol: 'infi', texto: '?' }, { rol: 'cliente', texto: 'Michelin' }]);
const caso2 = r.caso.id;
c = await app.pedirCotizaciones(U, caso2, 'urgente');
assert.equal(c.modo, 'urgente'); assert.ok(c.venceMs > Date.now());
const waAntes2 = enviados.wa.length;
c = await app.modificarPedido(U, caso2, '2 cubiertas Michelin');
assert.equal(c.pedido, '2 cubiertas Michelin'); assert.ok(enviados.wa.length > waAntes2);
assert.ok(enviados.wa[enviados.wa.length - 1].text.body.includes('cambió el pedido')); ok('pedido modificado y reenviado: "el cliente cambió el pedido"');
c = await app.cortarCaso(U, caso2); assert.equal(c.estado, 'cerrado'); ok('pedido cerrado por el cliente');

// 11. Service
const s = await app.casoService(U, auto.id);
c = await app.verCaso(U, s.id); assert.equal(c.titulo, 'Service de los 140.000 km'); assert.equal(c.pedido, 'Service de los 140.000 km'); ok('caso de service sin plan detallado');

// 12. Reclutar: busca mail en la web y manda invitación con link firmado
const mailsAntes = enviados.mails.length;
await app.reclutar();
const inv = enviados.mails.slice(mailsAntes).find(m => m.subject && m.subject.startsWith('Clientes para'));
assert.ok(inv, 'mandó invitación'); assert.equal(inv.to[0], 'ventas@elrulo.com.ar');
ok('invitación por mail a ventas@elrulo.com.ar (sacado de su web)');
const link = inv.html.match(/href="([^"]+taller\.html[^"]+)"/)[1].replace(/&amp;/g, '&');
const u = new URL(link), tid = u.searchParams.get('id'), tok = u.searchParams.get('t');
await tiraAviso(app.datosTaller(tid, 'falso'), 'link de taller falsificado → rechazado');
assert.equal((await app.datosTaller(tid, tok)).nombre, 'Gomería El Rulo');
await app.altaTaller(tid, tok, { nombre: 'Rulo', whatsapp: '11 5555 0001' });
assert.equal(dbf.T.talleres.find(t => t.id === tid).en_lista, 'si'); ok('el taller se anotó solo con el link: queda "en la lista"');

// 13. Avisos diarios: 15 días sin cargar km
dbf.T.autos[0].fecha_ultima = new Date(Date.now() - 15.2 * 864e5).toISOString();
const n = await app.avisos(); assert.equal(n, 1);
assert.ok(enviados.mails.some(m => m.subject.startsWith('Actualizá los kilómetros') && m.to.includes(OTRO))); ok('aviso de 15 días a los dos dueños del auto');

// 14. Contacto y tope de IA
await app.enviarContacto(U, 'Reclamo', 'No me llegó el informe');
assert.ok(enviados.mails.some(m => m.reply_to === U)); ok('Contactanos: mail a admins con respuesta directa al cliente');
for (let i = 0; i < 45; i++) dbf.T.uso_ia.push({ email: 'abusador@x.com', fecha: new Date().toISOString() });
await app.agregarAuto('abusador@x.com', { marca: 'Fiat', modelo: 'Uno', km: 1000, direccion: 'x' });
const aid = dbf.T.auto_usuarios.find(x => x.email === 'abusador@x.com').auto_id;
await tiraAviso(app.leerTablero('abusador@x.com', aid, 'AAAA'), 'tope diario de IA por persona');

console.log('\nTodo OK · llamadas a la IA: ' + iaLlamadas + ' · mails: ' + enviados.mails.length + ' · WhatsApp: ' + enviados.wa.length);
