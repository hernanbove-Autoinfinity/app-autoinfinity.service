// =====================================================================
// AUTOINFINITY SERVICE — lógica de la app (lo que antes estaba en Code.gs)
// Cada función recibe primero el mail de quien la usa: lo pone el servidor
// a partir de la sesión, el celular no lo puede inventar.
// =====================================================================
import {
  db, q, aviso, esAdmin, soloAdmin, admins, appUrl, f, fd, fdc, sumarHorasHabiles, fmtKm, lindo,
  distancia, redondo1, normTel, esCelular, waLink, firmaOk, linkAlta, linkBaja, esc, env
} from './base.js';
import {
  ia, MODELO_BARATO, MODELO_BUENO, controlarUsoIA, geocodificar, barrioDe, buscarLugares, mandarMail,
  mandarWhatsApp, waConfigurado, waModoPrueba, subirFoto, linkFotoPrivada, linkFotoPublica
} from './externos.js';

// ================== CONFIGURACIÓN ==================
const KM_SERVICE = 10000;
const MAX_TALLERES = 10;
const HORAS_NORMAL = 48;
const HORAS_URGENTE = 3;
const MIN_POR_RUBRO = 5;          // talleres anotados que queremos por rubro y zona
const RADIOS_KM = [8, 15, 25];    // si no alcanzan, se agranda la búsqueda
const MAX_MAILS_DIA = 40;         // pocos mails de invitación por día, para no caer en spam
const MIN_RESENAS = 5;            // reseñas propias necesarias para mostrar el puntaje de Autoinfinity
const AVISO_SERVICE_KM = 1500;    // el botón "Cotizar service" aparece cuando falta menos que esto...
const AVISO_SERVICE_DIAS = 30;    // ...o menos de un mes
const WA_PRUEBA_MAX = () => Number(env('WHATSAPP_PRUEBA_MAX') || 3); // en modo prueba, cuántos WhatsApp te llegan por pedido

// ================== RUBROS ==================
export const BUSQUEDA = {
  'mecánica': 'taller mecánico',
  'gomería': 'gomería neumáticos',
  'chapa y pintura': 'taller de chapa y pintura',
  'sacabollos': 'sacabollos',
  'electricidad': 'electricidad del automotor',
  'detailing': 'detailing estética vehicular pulido',
  'tapicería': 'tapicería automotor',
  'cristales': 'cristales y parabrisas para autos',
  'aire acondicionado': 'aire acondicionado automotor',
  'alineación y tren delantero': 'alineación y balanceo tren delantero',
  'escapes': 'escapes y silenciadores',
  'cerrajería': 'cerrajería del automotor llaves',
  'audio y alarmas': 'audio y alarmas para autos',
  'lavadero': 'lavadero de autos',
  'gnc': 'taller de GNC'
};
const RUBROS = Object.keys(BUSQUEDA);
const TALLERES = RUBROS.join('|');
const GUIA_RUBRO = ' Elegí bien el rubro del taller: cubiertas/neumáticos → gomería; choque o pintura → chapa y pintura; ' +
  'bollo sin pintura dañada → sacabollos; luces, batería, arranque, tablero → electricidad; pulido, encerado, limpieza profunda → detailing; ' +
  'butacas, alfombras, techo interior → tapicería; parabrisas o vidrios → cristales; aire que no enfría → aire acondicionado; ' +
  'el auto tira para un lado o vibra el volante → alineación y tren delantero; ruido de caño de escape → escapes; ' +
  'llaves o cerraduras → cerrajería; estéreo o alarma → audio y alarmas; motor, frenos, embrague, service, ruidos → mecánica.';
const EJEMPLO_RUBRO = {
  'gomería': ['cambiar 4 cubiertas', 'gomerías'], 'mecánica': ['hacer el cambio de distribución', 'talleres mecánicos'],
  'chapa y pintura': ['pintar un paragolpe', 'talleres de chapa y pintura'], 'sacabollos': ['sacar un bollo de una puerta', 'sacabollos'],
  'electricidad': ['revisar una falla en las luces', 'talleres de electricidad'], 'detailing': ['pulir el auto', 'centros de detailing'],
  'tapicería': ['arreglar una butaca', 'tapicerías'], 'cristales': ['cambiar el parabrisas', 'casas de cristales'],
  'aire acondicionado': ['cargar el aire acondicionado', 'talleres de aire acondicionado'],
  'alineación y tren delantero': ['hacer alineación y balanceo', 'talleres de tren delantero'],
  'escapes': ['cambiar el silenciador', 'casas de escapes'], 'cerrajería': ['hacer una copia de llave', 'cerrajerías'],
  'audio y alarmas': ['instalar una alarma', 'casas de audio y alarmas'], 'lavadero': ['un lavado completo', 'lavaderos'],
  'gnc': ['revisar el equipo de GNC', 'talleres de GNC']
};

// ================== ESQUEMAS E INSTRUCCIONES DE INFI ==================
const TXT = { type: 'string' };
const LISTA = { type: 'array', items: { type: 'string' } };
const ESQ_PROBLEMA = { type: 'object', properties: {
  pregunta: TXT, opciones: LISTA, titulo: TXT, explicacion: TXT, seguridad: TXT, queHacer: TXT,
  urgencia: { type: 'string', enum: ['alta', 'media', 'baja'] }, tipoTaller: { type: 'string', enum: RUBROS }, bomberos: { type: 'boolean' }, trabajoTaller: TXT } };
const ESQ_PRESUPUESTO = { type: 'object', properties: { pregunta: TXT, opciones: LISTA, titulo: TXT, detalle: TXT, tipoTaller: { type: 'string', enum: RUBROS }, trabajoTaller: TXT } };
const ESQ_RESPUESTA = { type: 'object', properties: {
  cotiza: { type: 'boolean' }, precio: { type: 'number', description: 'precio total principal en pesos, entero, ej 450000; 0 si no dice' },
  cuando: TXT, incluye: TXT }, required: ['cotiza'] };
const ESQ_TABLERO = { type: 'object', properties: {
  km: { type: 'integer', description: 'kilometraje TOTAL (odómetro), sin puntos; 0 si no se ve' },
  esTotal: { type: 'boolean', description: 'true si estás seguro de que es el total y no un parcial (Trip A/B)' },
  nota: { type: 'string', description: 'si no se ve bien o es un parcial, qué tiene que hacer el cliente, en una frase' } }, required: ['km', 'esTotal'] };

const BASE_INFI = 'Sos Infi, la asistente de Autoinfinity Service (Argentina). Ayudás a gente que no sabe de autos. ' +
  'Hablás en castellano rioplatense, simple, cálido y sin palabras técnicas, como un amigo que sabe de autos. ';
const SIS_PROBLEMA = BASE_INFI + GUIA_RUBRO +
  'Analizá lo que cuenta el cliente y la foto si hay (por ejemplo una luz del tablero). ' +
  'Si te falta un dato clave para saber qué es o qué tan grave es, hacé UNA pregunta corta con 2 a 4 opciones para tocar. ' +
  'Si dudás de la gravedad, elegí la más alta. Si hay riesgo (humo, fuego, frenos, temperatura, luz de aceite en rojo), ' +
  'la seguridad va primero: qué hacer ya y qué NO hacer (por ejemplo, si sale vapor no abrir el capot ni el radiador porque quema). ' +
  'Respondé SOLO JSON, uno de estos dos: ' +
  '{"pregunta":"...","opciones":["...","..."]} o {"titulo":"frase corta","explicacion":"qué es y qué puede pasar, 2 o 3 oraciones",' +
  '"seguridad":"indicaciones de seguridad, o vacío si no hay riesgo","queHacer":"el siguiente paso concreto",' +
  '"urgencia":"alta|media|baja","tipoTaller":"' + TALLERES + '","bomberos":true o false,"trabajoTaller":"qué tiene que revisar o cotizar el taller, máximo 12 palabras, SIN nombrar el auto"}';
const SIS_PRESUPUESTO = BASE_INFI + GUIA_RUBRO +
  'El cliente quiere pedir presupuesto para un trabajo que ya sabe (por ejemplo, cambiar cubiertas). ' +
  'Si falta un dato clave para que un taller pueda cotizar (marca preferida, cantidad, medida, para cuándo), ' +
  'hacé UNA pregunta corta con opciones. La medida de cubiertas la podés leer de una foto del costado de la goma. ' +
  'Respondé SOLO JSON, uno de estos dos: {"pregunta":"...","opciones":["...","..."]} o ' +
  '{"titulo":"el trabajo en pocas palabras","detalle":"todo lo que el taller necesita saber para cotizar","tipoTaller":"' + TALLERES + '",' +
  '"trabajoTaller":"el pedido para el taller, máximo 15 palabras, SIN nombrar el auto (ej: 4 cubiertas Michelin 215/60 R16)"}';
const SIS_TABLERO = 'Leés el tablero de un auto en una foto. Buscá el kilometraje TOTAL (odómetro, a veces dice ODO o TOTAL). ' +
  'NO confundas con el parcial (TRIP, Trip A, Trip B), que suele ser un número chico con decimales. ' +
  'Si solo se ve el parcial, o no se ve ningún número, devolvé km 0 y en nota decile al cliente qué hacer, en castellano rioplatense ' +
  '(por ejemplo: "Tocá el botón del tablero hasta que aparezca el total" o "Poné el auto en contacto, con el tablero apagado no se ve").';

// ================== USUARIOS Y PERFIL ==================
async function asegurarUsuario(email) {
  await q(db().from('usuarios').upsert({ email }, { onConflict: 'email', ignoreDuplicates: true }));
}

async function idsDeMisAutos(email) {
  return (await q(db().from('auto_usuarios').select('auto_id').eq('email', email))).map(x => x.auto_id);
}

export async function inicio(email) {
  await asegurarUsuario(email);
  await revisarVencidos().catch(e => console.error('revisarVencidos', e));
  const u = (await q(db().from('usuarios').select('*').eq('email', email).maybeSingle())) || {};
  const autos = await misAutos(email);
  const ids = autos.map(a => a.id);
  const casos = ids.length ? await q(db().from('casos')
    .select('id,titulo,estado,modo,vence,calificacion,cotizaciones(count)')
    .in('auto_id', ids).in('estado', ['cotizando', 'listo', 'elegido']).order('fecha', { ascending: false }).limit(50)) : [];
  const activos = casos.map(c => ({ c, n: (c.cotizaciones && c.cotizaciones[0] && c.cotizaciones[0].count) || 0 }))
    .filter(({ c, n }) => c.estado === 'cotizando' || (c.estado === 'listo' && n) || (c.estado === 'elegido' && !c.calificacion))
    .map(({ c, n }) => {
      let t, grupo;
      if (c.estado === 'cotizando') { grupo = 'esperando'; t = c.modo === 'urgente' ? 'Urgente · ' + n + ' respuestas' : 'Informe el ' + f(c.vence); }
      else if (c.estado === 'listo') { grupo = 'listo'; t = n + ' cotizaciones'; }
      else { grupo = 'calificar'; t = 'Calificá el taller'; }
      return { id: c.id, titulo: c.titulo, estadoTexto: t, grupo, modo: c.modo, venceMs: c.vence ? new Date(c.vence).getTime() : 0 };
    });
  return {
    email,
    perfil: { nombre: u.nombre || '', mecanicoNombre: u.mecanico_nombre || '', mecanicoTel: u.mecanico_tel || '',
      seguroNombre: u.seguro_nombre || '', seguroTel: u.seguro_tel || '' },
    autos, activos, admin: esAdmin(email)
  };
}

export async function guardarPerfil(email, d) {
  await asegurarUsuario(email);
  await q(db().from('usuarios').update({
    nombre: String(d.nombre || '').slice(0, 80), mecanico_nombre: String(d.mecanicoNombre || '').slice(0, 80),
    mecanico_tel: String(d.mecanicoTel || '').slice(0, 30), seguro_nombre: String(d.seguroNombre || '').slice(0, 80),
    seguro_tel: String(d.seguroTel || '').slice(0, 30)
  }).eq('email', email));
  return inicio(email);
}

// ================== AUTOS Y KILÓMETROS ==================
function calcular(a) {
  const dias = (new Date(a.fecha_ultima) - new Date(a.fecha_primera)) / 864e5;
  let tasa = dias >= 7 ? (a.km_ultima - a.km_primera) / dias : 33; // 33 km por día ≈ 12.000 km por año
  if (tasa <= 0) tasa = 33;
  const desde = (Date.now() - new Date(a.fecha_ultima)) / 864e5;
  const est = Math.round(a.km_ultima + tasa * desde);
  const prox = (Math.floor(est / KM_SERVICE) + 1) * KM_SERVICE;
  const faltanDias = Math.max(0, Math.round((prox - est) / tasa));
  return {
    id: a.id, marca: a.marca, modelo: a.modelo, anio: a.anio, direccion: a.direccion,
    kmEstimado: est, kmUltimo: a.km_ultima, kmPorDia: Math.round(tasa),
    proximoService: prox, faltanKm: prox - est, faltanDias,
    mostrarService: (prox - est) <= AVISO_SERVICE_KM || faltanDias <= AVISO_SERVICE_DIAS,
    ultimaLectura: fd(a.fecha_ultima), diasSinCargar: Math.floor(desde), pedirLectura: desde >= 15
  };
}
async function misAutos(email) {
  const filas = await q(db().from('auto_usuarios').select('autos(*)').eq('email', email));
  return filas.map(x => x.autos).filter(Boolean).sort((a, b) => new Date(a.creado) - new Date(b.creado)).map(calcular);
}
async function autoDe(email, id) {
  const es = await q(db().from('auto_usuarios').select('auto_id').eq('auto_id', id).eq('email', email).maybeSingle());
  if (!es) aviso('Auto no encontrado');
  return q(db().from('autos').select('*').eq('id', id).single());
}

export async function agregarAuto(email, d) {
  const km = Math.round(Number(d.km));
  if (!d.marca || !d.modelo || !km || !d.direccion) aviso('Completá marca, modelo, kilómetros y dirección');
  const [lat, lng] = await geocodificar(d.direccion);
  const a = await q(db().from('autos').insert({
    marca: String(d.marca).slice(0, 40), modelo: String(d.modelo).slice(0, 60), anio: String(d.anio || '').slice(0, 4),
    direccion: String(d.direccion).slice(0, 200), lat, lng, km_primera: km, km_ultima: km
  }).select().single());
  await q(db().from('auto_usuarios').insert({ auto_id: a.id, email }));
  await q(db().from('lecturas').insert({ auto_id: a.id, km, fuente: 'alta' }));
  if (lat) await crearZona(lat, lng, d.direccion).catch(e => console.error('crearZona', e));
  return inicio(email);
}

// Si el número no tiene sentido (por ejemplo 50.000 km en dos semanas), pide confirmación antes de guardar
export async function cargarKm(email, id, km, fuente, confirmado) {
  km = Math.round(Number(km));
  if (!km) aviso('Poné el kilometraje');
  const a = await autoDe(email, id);
  if (km < a.km_ultima) aviso('No puede ser menor al último cargado (' + fmtKm(a.km_ultima) + ' km)');
  const dias = Math.max(1, (Date.now() - new Date(a.fecha_ultima)) / 864e5);
  const salto = km - a.km_ultima;
  if (!confirmado && salto > 2000 && salto / dias > 1200)
    return { revisar: 'Son ' + fmtKm(salto) + ' km más que la última vez, hace ' + Math.round(dias) + ' días. ¿Seguro que es ' + fmtKm(km) + '?' };
  await q(db().from('lecturas').insert({ auto_id: id, km, fuente: fuente === 'foto' ? 'foto' : 'manual' }));
  await q(db().from('autos').update({ km_ultima: km, fecha_ultima: new Date().toISOString() }).eq('id', id));
  return inicio(email);
}

// Infi lee el número del tablero. La foto NO se guarda: se usa y se descarta.
export async function leerTablero(email, id, foto) {
  if (!foto) aviso('Sacá una foto del tablero');
  const a = await autoDe(email, id);
  await controlarUsoIA(email, 'tablero');
  const r = await ia(MODELO_BARATO(), SIS_TABLERO, [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: foto } },
    { type: 'text', text: 'Auto: ' + a.marca + ' ' + a.modelo + ' ' + a.anio + '. El último kilometraje cargado fue ' + a.km_ultima + ' km.' }
  ] }], 400, ESQ_TABLERO);
  const km = Math.round(Number(r.km) || 0);
  return { km: km > 0 ? km : 0, esTotal: !!r.esTotal, nota: r.nota || '', ultimo: a.km_ultima };
}

export async function compartir(email, id, otro) {
  otro = String(otro || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(otro)) aviso('Poné un email válido');
  await autoDe(email, id);
  await q(db().from('auto_usuarios').upsert({ auto_id: id, email: otro }, { onConflict: 'auto_id,email', ignoreDuplicates: true }));
  return inicio(email);
}

// ================== INFI: PROBLEMAS Y PRESUPUESTOS ==================
export async function hablarInfi(email, autoId, tipo, charla, foto) {
  tipo = tipo === 'presupuesto' ? 'presupuesto' : 'problema';
  charla = (Array.isArray(charla) ? charla : []).slice(0, 8).map(m => ({ rol: m.rol === 'infi' ? 'infi' : 'cliente', texto: String(m.texto || '').slice(0, 1500) }));
  if (!charla.length) aviso('Contanos qué pasa');
  const a = await autoDe(email, autoId), km = calcular(a);
  await controlarUsoIA(email, tipo);
  const preguntas = charla.filter(m => m.rol === 'infi').length;
  const esq = tipo === 'problema' ? ESQ_PROBLEMA : ESQ_PRESUPUESTO;
  const sis = (tipo === 'problema' ? SIS_PROBLEMA : SIS_PRESUPUESTO) +
    (preguntas >= 2 ? ' YA HICISTE 2 PREGUNTAS: respondé el resultado final, sin preguntar más.' : '');
  const msgs = charla.map((m, i) => {
    if (m.rol === 'infi') return { role: 'assistant', content: m.texto };
    const content = [];
    if (i === 0 && foto) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: foto } });
    content.push({ type: 'text', text: i === 0
      ? 'Auto: ' + a.marca + ' ' + a.modelo + ' ' + a.anio + ', ' + km.kmEstimado + ' km. Cliente: ' + (m.texto || '(mandó solo una foto)')
      : (m.texto || '-') });
    return { role: 'user', content };
  });

  // Foto: siempre el modelo bueno. Texto: el barato, y si sale grave se confirma con el bueno.
  let r = await ia(foto ? MODELO_BUENO() : MODELO_BARATO(), sis, msgs, 1500, esq);
  if (!foto && !r.pregunta && tipo === 'problema' && r.urgencia === 'alta') r = await ia(MODELO_BUENO(), sis, msgs, 1500, esq);
  if (r.pregunta && preguntas < 2) return { pregunta: r.pregunta, opciones: r.opciones || [] };
  if (r.pregunta) r = await ia(MODELO_BUENO(), sis + ' NO PREGUNTES MÁS, respondé el resultado final con lo que tengas.', msgs, 1500, esq);

  const descripcion = charla.filter(m => m.rol === 'cliente').map(m => m.texto).filter(Boolean).join(' / ');
  const explicacion = r.explicacion || r.detalle || '';
  const c = await q(db().from('casos').insert({
    auto_id: autoId, email, tipo, descripcion, titulo: r.titulo || 'Consulta', explicacion, que_hacer: r.queHacer || '',
    seguridad: r.seguridad || '', urgencia: r.urgencia || 'baja', tipo_taller: RUBROS.includes(r.tipoTaller) ? r.tipoTaller : 'mecánica',
    pedido: r.trabajoTaller || r.titulo || '', estado: 'nuevo'
  }).select('id').single());
  if (foto) {
    const ruta = await subirFoto('fotos', c.id + '.jpg', foto);
    if (ruta) await q(db().from('casos').update({ foto_path: ruta }).eq('id', c.id));
  }
  return { final: true, caso: { id: c.id, tipo, titulo: r.titulo, explicacion, queHacer: r.queHacer || '',
    seguridad: r.seguridad || '', urgencia: r.urgencia || '', tipoTaller: r.tipoTaller || '', bomberos: !!r.bomberos } };
}

export async function casoService(email, autoId) {
  const a = await autoDe(email, autoId), km = calcular(a);
  const titulo = 'Service de los ' + fmtKm(km.proximoService) + ' km';
  const c = await q(db().from('casos').insert({
    auto_id: autoId, email, tipo: 'service', titulo,
    explicacion: 'Le pedimos a talleres cerca tuyo que coticen el service según tu auto y kilometraje.',
    tipo_taller: 'mecánica', urgencia: 'baja', estado: 'nuevo', pedido: titulo
  }).select('id').single());
  return { id: c.id };
}

// ================== TALLERES CERCA ==================
async function talleresCerca(lat, lng, km, tipo) {
  const filas = await q(db().rpc('talleres_cerca', { p_lat: lat, p_lng: lng, p_km: km, p_tipo: tipo || null }));
  return filas.map(r => Object.assign({}, r.taller, { km: r.km }));
}

// Busca en Google Maps un rubro alrededor de un punto y guarda los talleres nuevos (filtrados por la IA)
async function buscarEnGoogle(lat, lng, tipo, radioKm) {
  if (!env('PLACES_API_KEY')) return 0;
  // No repetir la misma búsqueda (misma zona, rubro y distancia) por 30 días: Google cobra cada una
  const clave = tipo + '|' + Number(lat).toFixed(2) + '|' + Number(lng).toFixed(2) + '|' + radioKm;
  const antes = await q(db().from('busquedas').select('fecha').eq('clave', clave).maybeSingle());
  if (antes && Date.now() - new Date(antes.fecha) < 30 * 864e5) return 0;
  await q(db().from('busquedas').upsert({ clave, fecha: new Date().toISOString() }));
  const lugares0 = await buscarLugares(BUSQUEDA[tipo] || tipo, lat, lng, radioKm);
  const gids = lugares0.map(p => p.id);
  const ya = gids.length ? (await q(db().from('talleres').select('google_id').eq('tipo', tipo).in('google_id', gids))).map(t => t.google_id) : [];
  let lugares = lugares0.filter(p => (p.internationalPhoneNumber || p.websiteUri) && !ya.includes(p.id) &&
    distancia(lat, lng, p.location.latitude, p.location.longitude) <= radioKm);
  // Google mezcla rubros: la IA (modelo barato) se queda solo con los que hacen este trabajo
  if (lugares.length) {
    try {
      const r = await ia(MODELO_BARATO(), 'Filtrás negocios de Google Maps en Argentina. Devolvé los números de los que SÍ son del rubro pedido. ' +
        'Ante la duda, dejalo afuera.', [{ role: 'user', content: 'Rubro: ' + tipo + '\n' +
        lugares.map((p, n) => n + ') ' + p.displayName.text + (p.primaryTypeDisplayName ? ' [' + p.primaryTypeDisplayName.text + ']' : '')).join('\n') }],
        500, { type: 'object', properties: { sirven: { type: 'array', items: { type: 'integer' } } }, required: ['sirven'] });
      lugares = lugares.filter((p, n) => (r.sirven || []).includes(n));
    } catch (e) { console.error('Filtro de rubro falló', e.message); }
  }
  if (lugares.length) await q(db().from('talleres').upsert(lugares.map(p => ({
    google_id: p.id, tipo, nombre: p.displayName.text, telefono: p.internationalPhoneNumber || '', direccion: p.formattedAddress || '',
    lat: p.location.latitude, lng: p.location.longitude, rating: p.rating || 0, resenas: p.userRatingCount || 0, web: p.websiteUri || ''
  })), { onConflict: 'google_id,tipo', ignoreDuplicates: true }));
  return lugares.length;
}

async function buscarTalleres(a, tipo) {
  let lat = a.lat, lng = a.lng;
  if (!lat) {
    [lat, lng] = await geocodificar(a.direccion);
    if (!lat) return [];
    await q(db().from('autos').update({ lat, lng }).eq('id', a.id));
  }
  const cerca = async km => (await talleresCerca(lat, lng, km, tipo)).filter(t => t.en_lista !== 'no' && t.telefono);
  // Primero cerca; si hay menos de 5, se agranda la distancia
  let lista = [];
  for (const km of RADIOS_KM) {
    lista = await cerca(km);
    if (lista.length < MAX_TALLERES && await buscarEnGoogle(lat, lng, tipo, km)) lista = await cerca(km);
    if (lista.length >= MIN_POR_RUBRO) break;
  }
  const puntaje = t => (t.en_lista === 'si' ? 1000 : 0) + (esCelular(t.telefono) ? 100 : 0) + Number(t.rating) * Math.log10(Number(t.resenas) + 1) - t.km;
  const buenos = lista.filter(t => t.en_lista === 'si' || (Number(t.rating) >= 4 && Number(t.resenas) >= 10));
  const resto = lista.filter(t => !buenos.includes(t));
  return buenos.sort((x, y) => puntaje(y) - puntaje(x)).concat(resto.sort((x, y) => puntaje(y) - puntaje(x))).slice(0, MAX_TALLERES);
}

// ================== MENSAJES PARA TALLERES ==================
function mensajeTaller(c, a, primeraVez) {
  const plazo = c.modo === 'urgente' ? 'Es urgente, ¿me respondés hoy?' : 'Respuesta hasta el ' + fdc(c.vence) + '.';
  const pedido = 'Auto: ' + lindo(a.marca + ' ' + a.modelo) + ' ' + a.anio + '\n' + 'Trabajo: ' + c.pedido + '\n\n' + plazo;
  if (c.modificado) return 'Hola! Te escribo de nuevo de Autoinfinity: el cliente cambió el pedido. ¿Me pasás presupuesto con esto?\n\n' + pedido + ' ¡Gracias!';
  if (!primeraVez) return 'Hola! Te escribo de Autoinfinity. ¿Me pasás presupuesto y cuándo lo podrías hacer?\n\n' + pedido + ' ¡Gracias!';
  const ej = EJEMPLO_RUBRO[c.tipo_taller] || EJEMPLO_RUBRO['mecánica'];
  return 'Hola! Somos Autoinfinity, agencia de autos. Con nuestra app, cuando un cliente necesita, por ejemplo, ' + ej[0] +
    ', le pedimos presupuesto a ' + ej[1] + ' de su zona y él elige y te contacta directo. Sin intermediarios ni comisiones.\n\n' +
    'Ahora tengo este pedido cerca tuyo:\n' + pedido + '\n\n' +
    '¿Me pasás precio y cuándo lo podrías hacer? Si te sirve, te sumo a nuestra lista para los próximos pedidos.';
}
const mensajeCierre = c => 'Hola! Te escribo de Autoinfinity por el presupuesto de ' + c.pedido +
  '. El cliente ya lo resolvió, así que lo cerramos. ¡Gracias, pronto te mandamos más trabajos!';
function mensajeInvitacion(t) {
  const ej = EJEMPLO_RUBRO[t.tipo] || EJEMPLO_RUBRO['mecánica'];
  return 'Hola! Somos Autoinfinity, agencia de autos. Con nuestra app, cuando un cliente de tu zona necesita, por ejemplo, ' + ej[0] +
    ', le pedimos presupuesto a ' + ej[1] + ' cercanos y él te contacta directo. Sin intermediarios ni comisiones.\n\n' +
    '¿Querés recibir pedidos? Dejanos tus datos acá (1 minuto): ' + linkAlta(t.id);
}

// Pedidos en los que ya les escribimos a estos talleres (para no repetirles la presentación)
async function contactados(tallerIds) {
  if (!tallerIds.length) return [];
  return q(db().from('envios').select('taller_id,caso_id').in('taller_id', tallerIds).in('estado', ['enviado', 'respondio', 'no cotiza']));
}
const esPrimeraVez = (t, casoId, filas) => t.en_lista !== 'si' && !filas.some(x => x.taller_id === t.id && x.caso_id !== casoId);

// Manda por WhatsApp el pedido a los talleres que todavía no lo recibieron
async function enviarPedidoWhatsApp(casoId) {
  if (!waConfigurado()) return { enviados: 0 };
  const c = await q(db().from('casos').select('*, autos(*)').eq('id', casoId).single());
  let envios = await q(db().from('envios').select('*, talleres(*)').eq('caso_id', casoId).eq('estado', 'pendiente'));
  if (waModoPrueba()) envios = envios.slice(0, WA_PRUEBA_MAX());
  const filas = await contactados(envios.map(e => e.taller_id));
  let enviados = 0;
  for (const e of envios) {
    const t = e.talleres;
    const primeraVez = esPrimeraVez(t, casoId, filas);
    const r = await mandarWhatsApp(t.whatsapp || t.telefono, mensajeTaller(c, c.autos, primeraVez), t.nombre);
    await q(db().from('envios').update(r.ok ? { estado: 'enviado', wa_error: '' } : { wa_error: r.error || '' })
      .eq('caso_id', casoId).eq('taller_id', t.id));
    if (r.ok) enviados++;
  }
  return { enviados };
}

// Avisa por WhatsApp a los talleres que el pedido se cerró. Si no se puede, queda en el panel para hacerlo a mano.
async function enviarCierreWhatsApp(casoId) {
  if (!waConfigurado()) return;
  const c = await q(db().from('casos').select('*').eq('id', casoId).single());
  let envios = await q(db().from('envios').select('*, talleres(*)').eq('caso_id', casoId).in('estado', ['enviado', 'respondio']));
  envios = envios.filter(e => e.taller_id !== c.taller_elegido);
  if (waModoPrueba()) envios = envios.slice(0, 1);
  let todos = true;
  for (const e of envios) {
    const r = await mandarWhatsApp(e.talleres.whatsapp || e.talleres.telefono, mensajeCierre(c), e.talleres.nombre);
    if (!r.ok) todos = false;
  }
  if (todos) await q(db().from('casos').update({ avisado: new Date().toISOString() }).eq('id', casoId));
}

// ================== CASOS Y COTIZACIONES ==================
async function casoMio(email, id) {
  const c = await q(db().from('casos').select('*').eq('id', id).maybeSingle());
  if (!c) aviso('Pedido no encontrado');
  if (!esAdmin(email)) await autoDe(email, c.auto_id); // los admins pueden ver cualquier pedido (para ayudar al cliente)
  return c;
}

export async function pedirCotizaciones(email, casoId, modo) {
  modo = modo === 'urgente' ? 'urgente' : 'normal';
  const c = await casoMio(email, casoId);
  if (c.estado !== 'nuevo') aviso('Este pedido ya se envió');
  const a = await q(db().from('autos').select('*').eq('id', c.auto_id).single());
  const lista = await buscarTalleres(a, c.tipo_taller || 'mecánica');
  const vence = modo === 'urgente' ? sumarHorasHabiles(new Date(), HORAS_URGENTE) : new Date(Date.now() + HORAS_NORMAL * 36e5);
  if (lista.length) await q(db().from('envios').upsert(lista.map(t => ({ caso_id: casoId, taller_id: t.id })), { onConflict: 'caso_id,taller_id', ignoreDuplicates: true }));
  await q(db().from('casos').update({ modo, vence: vence.toISOString(), estado: 'cotizando' }).eq('id', casoId));
  const wa = await enviarPedidoWhatsApp(casoId).catch(e => { console.error('WhatsApp pedido', e); return { enviados: 0 }; });
  await avisarAdmins((modo === 'urgente' ? 'URGENTE: ' : '') + 'Nuevo pedido para cotizar: ' + c.titulo,
    'Hay ' + lista.length + ' talleres.' + (lista.length ? '' : ' No se encontraron solos: agregalos a mano.') +
    (wa.enviados ? ' Se mandaron ' + wa.enviados + ' WhatsApp' + (waModoPrueba() ? ' (modo prueba: te llegan a vos).' : '.') : '') +
    '\nPanel Autoinfinity: ' + appUrl());
  return verCaso(email, casoId);
}

async function resenasTaller(tallerId) {
  const r = await q(db().from('casos').select('calificacion,comentario,foto_resena,fecha_resena,fecha,email,titulo', { count: 'exact' })
    .eq('taller_elegido', tallerId).not('calificacion', 'is', null).order('fecha_resena', { ascending: false }).limit(20));
  if (r.length < MIN_RESENAS) return { n: r.length, faltan: MIN_RESENAS - r.length };
  const us = await q(db().from('usuarios').select('email,nombre').in('email', [...new Set(r.map(x => x.email))]));
  const nombre = e => String((us.find(x => x.email === e) || {}).nombre || 'Cliente').split(' ')[0];
  return {
    n: r.length, faltan: 0,
    prom: Math.round(r.reduce((s, x) => s + Number(x.calificacion), 0) / r.length * 10) / 10,
    lista: r.map(x => ({ estrellas: Number(x.calificacion), texto: x.comentario || '', foto: linkFotoPublica(x.foto_resena),
      fecha: fd(x.fecha_resena || x.fecha), nombre: nombre(x.email), trabajo: x.titulo || '' }))
  };
}

export async function verCaso(email, casoId) {
  let c = await casoMio(email, casoId);
  if (c.estado === 'cotizando' && c.vence && new Date(c.vence) < new Date()) { await cerrarVencido(c); c = await casoMio(email, casoId); }
  const a = await q(db().from('autos').select('*').eq('id', c.auto_id).single());
  const envios = await q(db().from('envios').select('estado').eq('caso_id', casoId));
  const visibles = c.modo === 'urgente' || c.estado !== 'cotizando';
  const cots = visibles ? await q(db().from('cotizaciones').select('*, talleres(*)').eq('caso_id', casoId)) : [];
  const cotizaciones = await Promise.all(cots.map(async x => {
    const t = x.talleres || {};
    return {
      placeId: t.id, googleId: t.google_id || '', nombre: t.nombre || '', telefono: t.whatsapp || t.telefono || '',
      direccion: t.direccion || '', rating: Number(t.rating) || 0, resenas: Number(t.resenas) || 0,
      distancia: (a.lat && t.lat) ? redondo1(distancia(a.lat, a.lng, t.lat, t.lng)) : null,
      precio: Number(x.precio) || 0, cuando: x.cuando || '', incluye: x.incluye || '', interna: await resenasTaller(t.id)
    };
  }));
  const el = c.taller_elegido ? await q(db().from('talleres').select('*').eq('id', c.taller_elegido).maybeSingle()) : null;
  return {
    id: c.id, tipo: c.tipo, fecha: fd(c.fecha), auto: a.marca + ' ' + a.modelo + ' ' + a.anio,
    titulo: c.titulo, descripcion: c.descripcion, fotoUrl: await linkFotoPrivada(c.foto_path),
    explicacion: c.explicacion, queHacer: c.que_hacer, seguridad: c.seguridad,
    urgencia: c.urgencia, tipoTaller: c.tipo_taller, modo: c.modo,
    vence: f(c.vence), venceMs: c.vence ? new Date(c.vence).getTime() : 0, pedido: c.pedido,
    admin: esAdmin(email), estado: c.estado, consultados: envios.length,
    respondieron: envios.filter(e => e.estado === 'respondio').length, cotizaciones,
    elegido: el ? { placeId: el.id, nombre: el.nombre, telefono: el.whatsapp || el.telefono, direccion: el.direccion } : null,
    calificacion: Number(c.calificacion) || 0, comentario: c.comentario
  };
}

export async function elegirTaller(email, casoId, tallerId) {
  const c = await casoMio(email, casoId);
  const cot = await q(db().from('cotizaciones').select('id').eq('caso_id', casoId).eq('taller_id', tallerId).limit(1));
  if (!cot.length) aviso('Ese taller no cotizó este pedido');
  await q(db().from('casos').update({ estado: 'elegido', taller_elegido: tallerId }).eq('id', casoId));
  await enviarCierreWhatsApp(casoId).catch(e => console.error('Cierre WhatsApp', e));
  await avisarAdmins('Cliente eligió taller: ' + c.titulo, 'Panel Autoinfinity: ' + appUrl());
  return verCaso(email, casoId);
}
export async function cortarCaso(email, casoId) {
  const c = await casoMio(email, casoId);
  if (!['cotizando', 'listo', 'nuevo'].includes(c.estado)) aviso('Este pedido ya está cerrado');
  await q(db().from('casos').update({ estado: 'cerrado' }).eq('id', casoId));
  await enviarCierreWhatsApp(casoId).catch(e => console.error('Cierre WhatsApp', e));
  await avisarAdmins('Cliente cerró el pedido: ' + c.titulo, 'Panel Autoinfinity: ' + appUrl());
  return verCaso(email, casoId);
}
// El cliente cambia lo que pidió (ej: 2 cubiertas en vez de 4): se borra lo cotizado y se les avisa de nuevo a los talleres
export async function modificarPedido(email, casoId, texto) {
  const c = await casoMio(email, casoId);
  texto = String(texto || '').trim().slice(0, 300);
  if (!texto) aviso('Escribí qué necesitás');
  if (c.estado !== 'cotizando') aviso('Solo se puede modificar mientras se está cotizando');
  await q(db().from('casos').update({ pedido: texto, modificado: new Date().toISOString() }).eq('id', casoId));
  await q(db().from('cotizaciones').delete().eq('caso_id', casoId));
  await q(db().from('envios').update({ estado: 'pendiente', wa_error: '' }).eq('caso_id', casoId).neq('estado', 'no cotiza'));
  await enviarPedidoWhatsApp(casoId).catch(e => console.error('WhatsApp modificado', e));
  await avisarAdmins('Cliente modificó el pedido: ' + c.titulo, 'Ahora pide: ' + texto + '\nPanel Autoinfinity: ' + appUrl());
  return verCaso(email, casoId);
}
// SOLO PARA PRUEBAS: cierra el plazo ya y genera el informe
export async function forzarInforme(email, casoId) {
  soloAdmin(email);
  const c = await q(db().from('casos').select('*').eq('id', casoId).maybeSingle());
  if (!c || c.estado !== 'cotizando') aviso('Este pedido no está cotizando');
  await cerrarVencido(c);
  return verCaso(email, casoId);
}

export async function calificar(email, casoId, n, comentario, foto) {
  const c = await casoMio(email, casoId);
  n = Number(n);
  if (!(n >= 1 && n <= 5)) aviso('Tocá las estrellas');
  if (c.estado !== 'elegido') aviso('Primero elegí el taller');
  let foto_resena = '';
  if (foto) foto_resena = await subirFoto('resenas', casoId + '.jpg', foto);
  await q(db().from('casos').update({ calificacion: Math.round(n), comentario: String(comentario || '').slice(0, 1000), foto_resena,
    fecha_resena: new Date().toISOString() }).eq('id', casoId));
  return verCaso(email, casoId);
}

export async function historial(email) {
  const ids = await idsDeMisAutos(email);
  if (!ids.length) return [];
  const casos = await q(db().from('casos').select('id,titulo,fecha,tipo,autos(marca,modelo)').in('auto_id', ids)
    .order('fecha', { ascending: false }).limit(200));
  return casos.map(c => ({ id: c.id, titulo: c.titulo, fecha: fd(c.fecha), auto: c.autos ? c.autos.marca + ' ' + c.autos.modelo : '', tipo: c.tipo }));
}

// ================== CIERRE DE PLAZOS ==================
async function cerrarVencido(c) {
  const hecho = await q(db().from('casos').update({ estado: 'listo' }).eq('id', c.id).eq('estado', 'cotizando').select('id'));
  if (!hecho.length) return; // otro proceso ya lo cerró
  const { count } = await db().from('cotizaciones').select('id', { count: 'exact', head: true }).eq('caso_id', c.id);
  await avisarCliente(c, count ? 'Ya tenés tu informe: ' + count + ' talleres cotizaron' : 'Tu pedido de presupuesto cerró',
    (count ? 'Entrá a la app para comparar precios, reseñas y cercanía: '
      : 'Esta vez ningún taller respondió a tiempo. Podés pedirlo de nuevo desde la app: ') + appUrl());
}
export async function revisarVencidos() {
  const casos = await q(db().from('casos').select('*').eq('estado', 'cotizando').lt('vence', new Date().toISOString()).limit(50));
  for (const c of casos) await cerrarVencido(c).catch(e => console.error('cerrarVencido', e));
  return casos.length;
}

// ================== MAILS ==================
async function avisarAdmins(asunto, texto) {
  await mandarMail({ to: admins(), subject: asunto, text: texto });
}
async function avisarCliente(c, asunto, texto) {
  const filas = await q(db().from('auto_usuarios').select('email').eq('auto_id', c.auto_id));
  if (filas.length) await mandarMail({ to: filas.map(x => x.email), subject: asunto, text: texto + '\n\nAutoinfinity Service' });
}

// Todos los días: pedir kilómetros y avisar del service
export async function avisos() {
  let desde = 0, mandados = 0;
  for (;;) {
    const autos = await q(db().from('autos').select('*, auto_usuarios(email)').order('creado').range(desde, desde + 499));
    for (const a of autos) {
      const c = calcular(a), auto = c.marca + ' ' + c.modelo;
      let asunto = '', texto = '';
      if (c.diasSinCargar >= 15 && c.diasSinCargar % 15 === 0) {
        asunto = 'Actualizá los kilómetros de tu ' + auto;
        texto = 'Hola! Hace ' + c.diasSinCargar + ' días que no cargás los kilómetros de tu ' + auto +
          '. Sacale una foto al tablero desde la app y listo: ' + appUrl() + '/?km=' + a.id;
      } else if (c.faltanDias === 15) {
        asunto = 'Se acerca el service de tu ' + auto;
        texto = 'Hola! En unos 15 días tu ' + auto + ' llega a los ' + fmtKm(c.proximoService) +
          ' km y le toca el service. Desde la app te conseguimos presupuestos de talleres cerca: ' + appUrl();
      }
      const para = (a.auto_usuarios || []).map(x => x.email);
      if (asunto && para.length && await mandarMail({ to: para, subject: asunto, text: texto + '\n\nAutoinfinity Service' })) mandados++;
    }
    if (autos.length < 500) break;
    desde += 500;
  }
  return mandados;
}

// ================== PANEL AUTOINFINITY (ustedes) ==================
export async function panelAdmin(email) {
  soloAdmin(email);
  await revisarVencidos();
  const casos = await q(db().from('casos').select('*, autos(*)').eq('estado', 'cotizando').order('vence').limit(50));
  const ids = casos.map(c => c.id);
  const envios = ids.length ? await q(db().from('envios').select('*, talleres(*)').in('caso_id', ids)) : [];
  const filas = await contactados([...new Set(envios.map(e => e.taller_id))]);
  const pedidos = casos.map(c => {
    const a = c.autos;
    return {
      casoId: c.id, titulo: c.titulo, modo: c.modo, vence: f(c.vence), auto: a.marca + ' ' + a.modelo,
      autoLat: a.lat || null, autoLng: a.lng || null,
      envios: envios.filter(e => e.caso_id === c.id).map(e => {
        const t = e.talleres || {};
        // Primera vez = nunca le escribimos por otro pedido y no está en la lista
        const primeraVez = esPrimeraVez(t, c.id, filas);
        const tel = t.whatsapp || t.telefono;
        return {
          placeId: t.id, googleId: t.google_id || '', nombre: t.nombre || '', telefono: tel || '',
          celular: esCelular(tel), direccion: t.direccion || '', estado: e.estado, waError: e.wa_error || '',
          wa: waLink(tel, mensajeTaller(c, a, primeraVez)), tel: 'tel:+' + normTel(tel),
          rating: Number(t.rating) || 0, resenas: Number(t.resenas) || 0, primeraVez, lista: t.en_lista || '',
          lat: t.lat || null, lng: t.lng || null,
          kmAuto: (t.lat && a.lat) ? redondo1(distancia(a.lat, a.lng, t.lat, t.lng)) : null
        };
      })
    };
  });
  const cerr = await q(db().from('casos').select('*').in('estado', ['elegido', 'cerrado']).is('avisado', null).order('fecha', { ascending: false }).limit(30));
  const cIds = cerr.map(c => c.id);
  const cEnv = cIds.length ? await q(db().from('envios').select('*, talleres(*)').in('caso_id', cIds).in('estado', ['enviado', 'respondio'])) : [];
  const cierres = cerr.map(c => ({
    casoId: c.id, titulo: c.titulo,
    talleres: cEnv.filter(e => e.caso_id === c.id && e.taller_id !== c.taller_elegido).map(e => ({
      nombre: e.talleres.nombre, wa: waLink(e.talleres.whatsapp || e.talleres.telefono, mensajeCierre(c)) }))
  }));
  return { pedidos, cierres, base: await resumenBase(), whatsapp: { configurado: waConfigurado(), prueba: waModoPrueba() } };
}
export async function marcarEnvio(email, casoId, tallerId, estado) {
  soloAdmin(email);
  if (!['pendiente', 'enviado', 'respondio', 'no cotiza'].includes(estado)) aviso('Estado inválido');
  await q(db().from('envios').update({ estado }).eq('caso_id', casoId).eq('taller_id', tallerId));
  return panelAdmin(email);
}
export async function reenviarWhatsApp(email, casoId) {
  soloAdmin(email);
  const r = await enviarPedidoWhatsApp(casoId);
  if (!r.enviados) aviso('No se mandó ninguno. Fijate el error abajo de cada taller.');
  return panelAdmin(email);
}
export async function cargarRespuesta(email, casoId, tallerId, texto) {
  soloAdmin(email);
  texto = String(texto || '').trim().slice(0, 3000);
  if (!texto) aviso('Pegá la respuesta del taller');
  const c = await q(db().from('casos').select('*').eq('id', casoId).single());
  const r = await ia(MODELO_BARATO(), 'Leé la respuesta de un taller argentino a un pedido de presupuesto. Respondé SOLO JSON: ' +
    '{"cotiza":true o false,"precio":número en pesos sin puntos ni signos o null,"cuando":"cuándo lo pueden hacer, corto","incluye":"qué incluye el precio, corto"}',
    [{ role: 'user', content: 'Pedido: ' + c.pedido + '\nRespuesta del taller: ' + texto }], 800, ESQ_RESPUESTA);
  if (!r.cotiza) { await q(db().from('envios').update({ estado: 'no cotiza' }).eq('caso_id', casoId).eq('taller_id', tallerId)); return panelAdmin(email); }
  await q(db().from('cotizaciones').insert({ caso_id: casoId, taller_id: tallerId, precio: r.precio || null, cuando: r.cuando || '', incluye: r.incluye || '', texto }));
  await q(db().from('envios').update({ estado: 'respondio' }).eq('caso_id', casoId).eq('taller_id', tallerId));
  if (c.modo === 'urgente') await avisarCliente(c, 'Llegó una cotización: ' + c.titulo, 'Entrá a la app para verla: ' + appUrl());
  return panelAdmin(email);
}
export async function agregarTallerManual(email, casoId, nombre, tel) {
  soloAdmin(email);
  if (!nombre || !tel) aviso('Poné nombre y teléfono');
  const c = await q(db().from('casos').select('*, autos(lat,lng,direccion)').eq('id', casoId).single());
  const t = await q(db().from('talleres').insert({ tipo: c.tipo_taller, nombre: String(nombre).slice(0, 100), telefono: String(tel).slice(0, 30),
    whatsapp: String(tel).slice(0, 30), en_lista: 'si', lat: c.autos.lat, lng: c.autos.lng }).select('id').single());
  await q(db().from('envios').insert({ caso_id: casoId, taller_id: t.id }));
  return panelAdmin(email);
}
// Lista de talleres: 'si' = proveedor nuestro (va primero siempre), 'no' = lista negra (no se le escribe más)
async function marcarListaTodos(tallerId, valor, extra) {
  const t = await q(db().from('talleres').select('id,google_id').eq('id', tallerId).maybeSingle());
  if (!t) aviso('Taller no encontrado');
  const cambios = Object.assign({ en_lista: valor }, extra || {});
  if (t.google_id) await q(db().from('talleres').update(cambios).eq('google_id', t.google_id));
  else await q(db().from('talleres').update(cambios).eq('id', t.id));
  if (valor === 'no') {
    const filas = t.google_id ? await q(db().from('talleres').select('id').eq('google_id', t.google_id)) : [t];
    await q(db().from('envios').update({ estado: 'no cotiza' }).in('taller_id', filas.map(x => x.id)).eq('estado', 'pendiente'));
  }
}
export async function marcarLista(email, tallerId, valor) {
  soloAdmin(email);
  await marcarListaTodos(tallerId, valor === 'no' ? 'no' : 'si');
  return panelAdmin(email);
}
export async function marcarAvisado(email, casoId) {
  soloAdmin(email);
  await q(db().from('casos').update({ avisado: new Date().toISOString() }).eq('id', casoId));
  return panelAdmin(email);
}

// =====================================================================
// ============ BASE DE TALLERES: ZONAS Y RECLUTAMIENTO =================
// =====================================================================
// Cada zona sale de donde duerme el auto de un cliente. Todos los días, para cada zona,
// se busca UN rubro (mecánica hoy, chapa y pintura mañana...) hasta tener 5 talleres
// anotados por rubro. Si no hay suficientes cerca, se agranda la distancia.

async function crearZona(lat, lng, nombre) {
  const d = 5 / 111;
  const cerca = await q(db().from('zonas').select('lat,lng').gte('lat', lat - d).lte('lat', lat + d).gte('lng', lng - d * 1.3).lte('lng', lng + d * 1.3));
  if (cerca.some(z => distancia(lat, lng, z.lat, z.lng) < 5)) return;
  const barrio = await barrioDe(lat, lng);
  await q(db().from('zonas').insert({ nombre: barrio || String(nombre || 'Zona').split(',')[0].slice(0, 60), lat, lng }));
}
async function zonasDesdeAutos() {
  const autos = await q(db().from('autos').select('lat,lng,direccion').not('lat', 'is', null).limit(1000));
  for (const a of autos) await crearZona(a.lat, a.lng, a.direccion);
}
export async function agregarZona(email, direccion) {
  soloAdmin(email);
  const [lat, lng] = await geocodificar(direccion);
  if (!lat) aviso('No encontré esa dirección');
  await crearZona(lat, lng, direccion);
  return panelAdmin(email);
}

function contar(cerca, tipo, km) {
  const t = cerca.filter(x => x.tipo === tipo && x.km <= km);
  return { anotados: t.filter(x => x.en_lista === 'si').length, posibles: t.filter(x => x.en_lista !== 'no').length,
    invitados: t.filter(x => x.invitado && x.en_lista !== 'si').length };
}

// Una vez por día (Vercel Cron). También se puede tocar "Buscar ahora" en el panel.
export async function reclutar() {
  if (!(await q(db().from('zonas').select('id').limit(1))).length) await zonasDesdeAutos();
  const zonas = await q(db().from('zonas').select('*').order('ultima_recluta', { ascending: true, nullsFirst: true }).limit(3));
  let mails = 0;
  for (const z of zonas) {
    try { mails += await reclutarZona(z, MAX_MAILS_DIA - mails); } catch (e) { console.error('Zona ' + z.nombre, e); }
  }
  return mails;
}
export async function reclutarAhora(email, zonaId) {
  soloAdmin(email);
  const z = await q(db().from('zonas').select('*').eq('id', zonaId).maybeSingle());
  if (!z) aviso('Zona no encontrada');
  await reclutarZona(z, 15);
  return panelAdmin(email);
}

async function reclutarZona(z, cupoMails) {
  const est = z.estado || {};
  let cerca = await talleresCerca(z.lat, z.lng, RADIOS_KM[RADIOS_KM.length - 1], null);
  // Rubros que todavía no llegan a 5 anotados; se elige el menos trabajado
  const pendientes = RUBROS.filter(r => r !== 'lavadero' && contar(cerca, r, (est[r] || {}).km || RADIOS_KM[0]).anotados < MIN_POR_RUBRO);
  await q(db().from('zonas').update({ ultima_recluta: new Date().toISOString() }).eq('id', z.id));
  if (!pendientes.length) return 0;
  pendientes.sort((a, b) => ((est[a] || {}).veces || 0) - ((est[b] || {}).veces || 0));
  const rubro = pendientes[0];
  const e = est[rubro] || { km: RADIOS_KM[0], veces: 0 };
  // Si en esta distancia no hay ni 5 talleres posibles, agrandamos
  if (contar(cerca, rubro, e.km).posibles < MIN_POR_RUBRO) {
    await buscarEnGoogle(z.lat, z.lng, rubro, e.km);
    cerca = await talleresCerca(z.lat, z.lng, RADIOS_KM[RADIOS_KM.length - 1], null);
    const i = RADIOS_KM.indexOf(e.km);
    if (contar(cerca, rubro, e.km).posibles < MIN_POR_RUBRO && i < RADIOS_KM.length - 1) e.km = RADIOS_KM[i + 1];
  }
  e.veces = (e.veces || 0) + 1; e.ultima = fd(new Date()); est[rubro] = e;
  await q(db().from('zonas').update({ estado: est }).eq('id', z.id));
  const delRubro = cerca.filter(t => t.tipo === rubro && t.km <= e.km);
  await buscarMails(delRubro);
  return invitarPorMail(rubro, delRubro.map(t => t.id), cupoMails);
}

// Entra a la web de cada taller y busca un mail de contacto
async function buscarMails(talleres) {
  const lista = talleres.filter(t => t.web && !t.email && !t.mail_buscado).slice(0, 15);
  await Promise.allSettled(lista.map(async t => {
    let mail = '';
    try {
      const r = await fetch(t.web, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 AutoinfinityService' } });
      const html = (await r.text()).slice(0, 400000);
      const m = (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])
        .filter(x => !/\.(png|jpe?g|gif|webp|svg)$/i.test(x) && !/(sentry|wixpress|example|domain|godaddy|wordpress)/i.test(x));
      mail = (m[0] || '').toLowerCase();
    } catch (e) {}
    await q(db().from('talleres').update({ mail_buscado: new Date().toISOString(), email: mail }).eq('id', t.id));
  }));
}

async function invitarPorMail(rubro, ids, cupo) {
  if (cupo <= 0 || !ids.length) return 0;
  const ej = EJEMPLO_RUBRO[rubro] || EJEMPLO_RUBRO['mecánica'];
  const lista = await q(db().from('talleres').select('*').in('id', ids).neq('email', '').eq('invitado', '').is('en_lista', null).limit(cupo));
  let n = 0;
  for (const t of lista) {
    const html = '<p>Hola ' + esc(t.nombre) + ',</p>' +
      '<p>Somos <b>Autoinfinity</b>, agencia de autos. Con nuestra app, cuando un cliente de tu zona necesita, por ejemplo, ' + ej[0] +
      ', le pedimos presupuesto a ' + ej[1] + ' cercanos; él compara y te contacta directo. Sin intermediarios ni comisiones.</p>' +
      '<p>¿Querés recibir pedidos? Dejanos tu WhatsApp acá (1 minuto):<br><a href="' + linkAlta(t.id) + '"><b>Quiero recibir pedidos</b></a></p>' +
      '<p>Saludos,<br>Hernán · Autoinfinity</p>' +
      '<p style="color:#888;font-size:12px">Si no te interesa, <a href="' + linkBaja(t.id) + '" style="color:#888">tocá acá</a> y no te escribimos más.</p>';
    if (await mandarMail({ to: t.email, subject: 'Clientes para ' + t.nombre + ', de parte de Autoinfinity', html })) {
      await q(db().from('talleres').update({ invitado: 'mail ' + fd(new Date()) }).eq('id', t.id));
      n++;
    }
  }
  return n;
}

export async function marcarInvitado(email, tallerId) {
  soloAdmin(email);
  await q(db().from('talleres').update({ invitado: 'whatsapp ' + fd(new Date()) }).eq('id', tallerId));
  return true;
}

// Resumen para el panel: cada zona con cuántos anotados tiene por rubro, e invitaciones por WhatsApp pendientes
async function resumenBase() {
  const zonasDb = await q(db().from('zonas').select('*').order('creado').limit(50));
  const zonas = await Promise.all(zonasDb.map(async z => {
    const est = z.estado || {}, cerca = await talleresCerca(z.lat, z.lng, RADIOS_KM[RADIOS_KM.length - 1], null);
    return { id: z.id, nombre: z.nombre, rubros: RUBROS.filter(r => r !== 'lavadero').map(r => {
      const km = (est[r] || {}).km || RADIOS_KM[0], c = contar(cerca, r, km);
      return { rubro: r, anotados: c.anotados, invitados: c.invitados, km, buscado: !!est[r] };
    }) };
  }));
  const sinMail = await q(db().from('talleres').select('*').eq('email', '').eq('invitado', '').is('en_lista', null).neq('telefono', '').limit(300));
  const invitarWa = sinMail.filter(t => esCelular(t.telefono)).slice(0, 15).map(t => ({
    placeId: t.id, nombre: t.nombre, tipo: t.tipo, telefono: t.telefono, wa: waLink(t.telefono, mensajeInvitacion(t)) }));
  const { count } = await db().from('talleres').select('id', { count: 'exact', head: true }).eq('en_lista', 'si');
  return { zonas, invitarWa, anotados: count || 0 };
}

// ============ PÁGINA PARA QUE EL TALLER SE ANOTE (link del mail / WhatsApp) — sin sesión ============
async function tallerFirmado(id, t) {
  if (!id || !firmaOk(id, t)) aviso('Link inválido');
  const tt = await q(db().from('talleres').select('id,nombre,telefono,whatsapp,email,google_id').eq('id', id).maybeSingle());
  if (!tt) aviso('Link inválido');
  return tt;
}
export async function datosTaller(id, t) {
  const tt = await tallerFirmado(id, t);
  return { nombre: tt.nombre, whatsapp: tt.whatsapp || tt.telefono, email: tt.email };
}
export async function bajaTaller(id, t) {
  await tallerFirmado(id, t);
  await marcarListaTodos(id, 'no');
  return true;
}
export async function altaTaller(id, t, d) {
  const tt = await tallerFirmado(id, t);
  d = d || {};
  const wa = String(d.whatsapp || '').slice(0, 30), mail = String(d.email || '').trim().slice(0, 120);
  if (!wa.replace(/\D/g, '') && !mail.includes('@')) aviso('Dejanos un WhatsApp o un mail');
  const extra = { contacto: String(d.nombre || '').slice(0, 80) };
  if (wa.replace(/\D/g, '')) extra.whatsapp = wa;
  if (mail.includes('@')) extra.email = mail;
  await marcarListaTodos(id, 'si', extra);
  await avisarAdmins('Nuevo taller anotado: ' + tt.nombre, 'Se sumó a la lista de Autoinfinity Service. WhatsApp: ' + (wa || '-') + ' · Mail: ' + (mail || '-'));
  return true;
}

// ============ CONTACTO CON AUTOINFINITY ============
export async function enviarContacto(email, tipo, texto) {
  texto = String(texto || '').trim().slice(0, 3000);
  if (!texto) aviso('Escribinos tu mensaje');
  tipo = ['Sugerencia', 'Reclamo', 'Consulta'].includes(tipo) ? tipo : 'Consulta';
  const u = (await q(db().from('usuarios').select('nombre').eq('email', email).maybeSingle())) || {};
  await q(db().from('contactos').insert({ email, nombre: u.nombre || '', tipo, texto }));
  await mandarMail({ to: admins(), replyTo: email, subject: tipo + ' de ' + (u.nombre || email) + ' (Autoinfinity Service)',
    text: texto + '\n\n— ' + (u.nombre || '') + ' · ' + email + '\nRespondé este mail y le llega directo al cliente.' });
  return true;
}
