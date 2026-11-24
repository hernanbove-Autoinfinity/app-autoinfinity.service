// =====================================================
// AUTOINFINITY SERVICE - Code.gs (versión de prueba)
// =====================================================

// ================== CONFIGURACIÓN ==================
const CODIGO_INVITACION = 'AUTOINFINITY';
const ADMIN_EMAILS = ['hernanbove@autoinfinity.com.ar']; // Diego: 'diego.autoinfinity@gmail.com' (sacado por ahora)
const TZ = 'America/Argentina/Buenos_Aires';
const MODELO_BARATO = 'claude-haiku-5-5';
const MODELO_BUENO = 'claude-sonnet-5-5';
const KM_SERVICE = 10000;
const MAX_TALLERES = 10;
const RADIO_KM = 8;
const HORAS_NORMAL = 48;
const HORAS_URGENTE = 3;
const MIN_POR_RUBRO = 5;          // talleres que queremos en la lista por rubro y zona
const RADIOS_KM = [8, 15, 25];    // si no alcanzan, se agranda la búsqueda
const MAX_MAILS_DIA = 40;
const MIN_RESENAS = 5;            // reseñas propias necesarias para mostrar el puntaje de Autoinfinity         // pocos mails por día para no caer en spam

const SS = SpreadsheetApp.getActiveSpreadsheet();
const H = {
  Usuarios: ['email','nombre','alta','mecanicoNombre','mecanicoTel','seguroNombre','seguroTel'],
  Autos: ['id','emails','marca','modelo','anio','direccion','alta','lat','lng'],
  Lecturas: ['autoId','fecha','km','fuente'],
  Casos: ['id','autoId','email','fecha','tipo','descripcion','fotoUrl','titulo','explicacion','queHacer','seguridad',
          'urgencia','tipoTaller','pedido','modo','vence','estado','tallerElegido','calificacion','comentario','avisado','modificado','fotoResena','fechaResena'],
  Contactos: ['fecha','email','nombre','tipo','texto','estado'],
  Talleres: ['placeId','nombre','telefono','direccion','lat','lng','rating','resenas','tipo','enListado','web','email','whatsapp','invitado','mailBuscado','contacto'],
  Zonas: ['id','nombre','lat','lng','alta','estado'],
  Envios: ['casoId','placeId','fecha','estado'],
  Cotizaciones: ['casoId','placeId','fecha','precio','cuando','incluye','texto'],
  Planes: ['clave','plan','fecha']
};
const prop = k => PropertiesService.getScriptProperties().getProperty(k);
const URL_APP = () => ScriptApp.getService().getUrl();

// ============ PUESTA EN MARCHA (ejecutar UNA vez desde el editor) ============
function configurar() {
  Object.keys(H).forEach(hoja);
  carpetaFotos();
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('avisos').timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger('revisarCasos').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('reclutar').timeBased().everyDays(1).atHour(10).create();
  secreto();
  Maps.newGeocoder().setRegion('ar').geocode('Obelisco, Buenos Aires');
  UrlFetchApp.fetch('https://www.google.com');
  MailApp.getRemainingDailyQuota();
}

function doGet(e) {
  if (e && e.parameter && e.parameter.taller) return paginaTaller(e.parameter);
  // Diagnóstico: ?diag=1 prueba si corre JavaScript; ?diag=2 muestra la app en modo simple
  if (e && e.parameter && e.parameter.diag === '1') return HtmlService.createHtmlOutput(
    '<body style="font:20px sans-serif;padding:30px"><p id="x" style="color:red">JavaScript NO corre</p>' +
    '<script>document.getElementById("x").textContent="JavaScript funciona ✓";document.getElementById("x").style.color="green";' +
    'try{localStorage.setItem("t","1");document.body.insertAdjacentHTML("beforeend","<p>localStorage ✓</p>")}catch(e){document.body.insertAdjacentHTML("beforeend","<p>localStorage bloqueado</p>")}' +
    'document.body.insertAdjacentHTML("beforeend","<p>google.script.run: "+(window.google&&google.script?"✓":"no")+"</p>")</script></body>');
  if (e && e.parameter && e.parameter.diag === '2') {
    const html = HtmlService.createHtmlOutputFromFile('Index').getContent();
    return HtmlService.createHtmlOutput('<pre style="white-space:pre-wrap;font:12px monospace">Tamaño del Index: ' + html.length +
      ' caracteres\nPrimeros: ' + html.slice(0, 120).replace(/</g, '&lt;') + '\nÚltimos: ' + html.slice(-120).replace(/</g, '&lt;') + '</pre>');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Autoinfinity Service')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ================== PLANILLA ==================
const _ok = {};
function hoja(n) {
  let s = SS.getSheetByName(n);
  if (!s) { s = SS.insertSheet(n); s.appendRow(H[n]); _ok[n] = 1; return s; }
  if (!_ok[n]) {
    const act = s.getRange(1, 1, 1, Math.max(1, s.getLastColumn())).getValues()[0];
    H[n].forEach(c => { if (!act.includes(c)) { s.getRange(1, act.length + 1).setValue(c); act.push(c); } });
    _ok[n] = 1;
  }
  return s;
}
function filas(n) {
  const v = hoja(n).getDataRange().getValues(), h = v.shift();
  return v.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
function agregar(n, o) {
  const s = hoja(n), h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  // Los teléfonos con "+" Sheets los toma como fórmula (#ERROR!): se guardan como texto
  const txt = v => (typeof v === 'string' && /^[+=]|^0\d|^\d[\d\s-]{6,}$/.test(v)) ? "'" + v : v;
  s.appendRow(h.map(k => o[k] === undefined ? '' : txt(o[k])));
}
function actualizar(n, buscar, cambios) {
  const s = hoja(n), v = s.getDataRange().getValues(), h = v[0];
  for (let i = 1; i < v.length; i++) {
    const o = Object.fromEntries(h.map((k, j) => [k, v[i][j]]));
    if (buscar(o)) {
      Object.keys(cambios).forEach(k => s.getRange(i + 1, h.indexOf(k) + 1).setValue(cambios[k]));
      return true;
    }
  }
  return false;
}
function borrar(n, buscar) {
  const s = hoja(n), v = s.getDataRange().getValues(), h = v[0];
  for (let i = v.length - 1; i >= 1; i--) {
    if (buscar(Object.fromEntries(h.map((k, j) => [k, v[i][j]])))) s.deleteRow(i + 1);
  }
}
const f = d => d ? Utilities.formatDate(new Date(d), TZ, 'dd/MM HH:mm') : '';
const fd = d => d ? Utilities.formatDate(new Date(d), TZ, 'dd/MM/yyyy') : '';
const nuevoId = p => p + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
const esAdmin = email => ADMIN_EMAILS.map(e => e.toLowerCase()).includes(String(email).toLowerCase());
function soloAdmin(email) { if (!esAdmin(email)) throw new Error('Sin permiso'); }

// ================== USUARIOS Y PERFIL ==================
function ingresar(email, nombre, codigo) {
  email = String(email).trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Poné un email válido');
  if (String(codigo).trim().toUpperCase() !== String(CODIGO_INVITACION).trim().toUpperCase())
    throw new Error('Código de invitación incorrecto');
  if (!filas('Usuarios').find(u => u.email === email)) agregar('Usuarios', { email, nombre, alta: new Date() });
  return email;
}

function inicio(email) {
  const u = filas('Usuarios').find(x => x.email === email) || {};
  const cots = filas('Cotizaciones');
  const activos = casosDeMisAutos(email)
    .map(c => ({ c, n: cots.filter(q => q.casoId === c.id).length }))
    .filter(({ c, n }) => c.estado === 'cotizando' || (c.estado === 'listo' && n) || (c.estado === 'elegido' && !c.calificacion))
    .map(({ c, n }) => {
      let t, grupo;
      if (c.estado === 'cotizando') { grupo = 'esperando'; t = c.modo === 'urgente' ? 'Urgente · ' + n + ' respuestas' : 'Informe el ' + f(c.vence); }
      else if (c.estado === 'listo') { grupo = 'listo'; t = n + ' cotizaciones'; }
      else { grupo = 'calificar'; t = 'Calificá el taller'; }
      return { id: String(c.id), titulo: String(c.titulo), estadoTexto: t, grupo, modo: String(c.modo),
        venceMs: c.vence ? new Date(c.vence).getTime() : 0 };
    });
  return {
    perfil: {
      nombre: String(u.nombre || ''), mecanicoNombre: String(u.mecanicoNombre || ''), mecanicoTel: String(u.mecanicoTel || ''),
      seguroNombre: String(u.seguroNombre || ''), seguroTel: String(u.seguroTel || '')
    },
    autos: misAutos(email),
    activos,
    admin: esAdmin(email),
    // Botón "Instalar actualización": solo para el dueño (el primer mail de ADMIN_EMAILS)
    actualizador: email === ADMIN_EMAILS[0].toLowerCase() ? String(prop('ACTUALIZADOR_URL') || '') : ''
  };
}

function guardarPerfil(email, d) {
  actualizar('Usuarios', u => u.email === email, {
    nombre: d.nombre, mecanicoNombre: d.mecanicoNombre, mecanicoTel: d.mecanicoTel,
    seguroNombre: d.seguroNombre, seguroTel: d.seguroTel
  });
  return inicio(email);
}

// ================== AUTOS Y KILÓMETROS ==================
function listaEmails(a) { return String(a.emails).split(',').map(e => e.trim().toLowerCase()).filter(Boolean); }
function esMio(a, email) { return listaEmails(a).includes(String(email).toLowerCase()); }
function lecturasDe(id) { return filas('Lecturas').filter(l => String(l.autoId) === String(id)); }
function autoDe(email, id) {
  const a = filas('Autos').find(x => String(x.id) === String(id));
  if (!a || !esMio(a, email)) throw new Error('Auto no encontrado');
  return a;
}
function misAutos(email) {
  const lect = filas('Lecturas');
  return filas('Autos').filter(a => esMio(a, email))
    .map(a => calcular(a, lect.filter(l => String(l.autoId) === String(a.id)))).filter(Boolean);
}
function calcular(a, ls) {
  if (!ls.length) return null;
  ls.sort((x, y) => new Date(x.fecha) - new Date(y.fecha));
  const p = ls[0], u = ls[ls.length - 1];
  const dias = (new Date(u.fecha) - new Date(p.fecha)) / 864e5;
  let tasa = dias >= 7 ? (u.km - p.km) / dias : 33; // 33 km por día ≈ 12.000 km por año
  if (tasa <= 0) tasa = 33;
  const desde = (Date.now() - new Date(u.fecha)) / 864e5;
  const est = Math.round(Number(u.km) + tasa * desde);
  const prox = (Math.floor(est / KM_SERVICE) + 1) * KM_SERVICE;
  return {
    id: String(a.id), marca: String(a.marca), modelo: String(a.modelo), anio: String(a.anio),
    direccion: String(a.direccion), kmEstimado: est, kmPorDia: Math.round(tasa),
    proximoService: prox, faltanKm: prox - est, faltanDias: Math.max(0, Math.round((prox - est) / tasa)),
    ultimaLectura: fd(u.fecha), diasSinCargar: Math.floor(desde), pedirLectura: desde >= 15
  };
}
function geocodificar(dir) {
  try {
    const l = Maps.newGeocoder().setRegion('ar').geocode(dir).results[0].geometry.location;
    return [l.lat, l.lng];
  } catch (e) { return ['', '']; }
}
function agregarAuto(email, d) {
  if (!d.marca || !d.modelo || !d.km || !d.direccion) throw new Error('Completá marca, modelo, kilómetros y dirección');
  const id = nuevoId('A'), g = geocodificar(d.direccion);
  agregar('Autos', { id, emails: email, marca: d.marca, modelo: d.modelo, anio: d.anio, direccion: d.direccion,
    alta: new Date(), lat: g[0], lng: g[1] });
  agregar('Lecturas', { autoId: id, fecha: new Date(), km: Number(d.km), fuente: 'alta' });
  if (g[0]) crearZona(g[0], g[1], d.direccion);
  return inicio(email);
}
function cargarKm(email, id, km) {
  km = Number(km);
  if (!km) throw new Error('Poné el kilometraje');
  autoDe(email, id);
  const max = Math.max(...lecturasDe(id).map(l => Number(l.km)));
  if (km < max) throw new Error('No puede ser menor al último cargado (' + max + ' km)');
  agregar('Lecturas', { autoId: id, fecha: new Date(), km, fuente: 'manual' });
  return inicio(email);
}
function compartir(email, id, otro) {
  otro = String(otro).trim().toLowerCase();
  if (!otro.includes('@')) throw new Error('Poné un email válido');
  const a = autoDe(email, id);
  if (!esMio(a, otro)) actualizar('Autos', x => String(x.id) === String(id), { emails: a.emails + ',' + otro });
  return inicio(email);
}

// ================== INTELIGENCIA ARTIFICIAL ==================
// La IA responde siempre por "herramienta": así devuelve datos ordenados y no texto suelto
function ia(modelo, sistema, mensajes, max, esquema) {
  const key = prop('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Falta la clave ANTHROPIC_API_KEY en Propiedades del script');
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: modelo, max_tokens: max || 2000, system: sistema + ' Respondé SIEMPRE usando la herramienta responder.', messages: mensajes,
      tools: [{ name: 'responder', description: 'Devolvé tu respuesta con estos campos', input_schema: esquema || { type: 'object' } }],
      tool_choice: { type: 'auto' }
    })
  });
  const txt = r.getContentText();
  let j;
  try { j = JSON.parse(txt); } catch (e) { console.log('IA respuesta rara: ' + txt.slice(0, 500)); throw new Error('Infi no está disponible, probá en un rato'); }
  if (j.error) { console.log('IA error: ' + JSON.stringify(j.error)); throw new Error('Error de IA: ' + j.error.message); }
  const tool = (j.content || []).find(c => c.type === 'tool_use');
  if (tool && tool.input && Object.keys(tool.input).length) return tool.input;
  const t = (j.content || []).map(c => c.text || '').join('');
  try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
  catch (e) { console.log('IA sin datos (' + j.stop_reason + '): ' + JSON.stringify(j.content).slice(0, 800)); throw new Error('Infi no pudo responder bien, probá de nuevo'); }
}

// Rubros: la IA elige uno según el problema, y con eso se busca en Google Maps
const BUSQUEDA = {
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

const TXT = { type: 'string' };
const LISTA = { type: 'array', items: { type: 'string' } };
const ESQ_PROBLEMA = { type: 'object', properties: {
  pregunta: TXT, opciones: LISTA, titulo: TXT, explicacion: TXT, seguridad: TXT, queHacer: TXT,
  urgencia: { type: 'string', enum: ['alta', 'media', 'baja'] }, tipoTaller: { type: 'string', enum: RUBROS }, bomberos: { type: 'boolean' }, trabajoTaller: TXT } };
const ESQ_PRESUPUESTO = { type: 'object', properties: { pregunta: TXT, opciones: LISTA, titulo: TXT, detalle: TXT, tipoTaller: { type: 'string', enum: RUBROS }, trabajoTaller: TXT } };
const ESQ_PLAN = { type: 'object', properties: { trabajos: LISTA }, required: ['trabajos'] };
const ESQ_RESPUESTA = { type: 'object', properties: {
  cotiza: { type: 'boolean' }, precio: { type: 'number', description: 'precio total principal en pesos, entero, ej 450000; 0 si no dice' },
  cuando: TXT, incluye: TXT }, required: ['cotiza'] };

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

function hablarInfi(email, autoId, tipo, charla, foto) {
  const a = autoDe(email, autoId), km = calcular(a, lecturasDe(autoId));
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
  let r = ia(foto ? MODELO_BUENO : MODELO_BARATO, sis, msgs, 1500, esq);
  if (!foto && !r.pregunta && tipo === 'problema' && r.urgencia === 'alta') r = ia(MODELO_BUENO, sis, msgs, 1500, esq);
  if (r.pregunta && preguntas < 2) return { pregunta: r.pregunta, opciones: r.opciones || [] };
  if (r.pregunta) r = ia(MODELO_BUENO, sis + ' NO PREGUNTES MÁS, respondé el resultado final con lo que tengas.', msgs, 1500, esq);

  const id = nuevoId('C');
  let fotoUrl = '';
  if (foto) fotoUrl = carpetaFotos().createFile(
    Utilities.newBlob(Utilities.base64Decode(foto), 'image/jpeg', id + '.jpg')).getUrl();
  const descripcion = charla.filter(m => m.rol === 'cliente').map(m => m.texto).filter(Boolean).join(' / ');
  const explicacion = r.explicacion || r.detalle || '';
  const pedido = r.trabajoTaller || r.titulo;
  agregar('Casos', { id, autoId, email, fecha: new Date(), tipo, descripcion, fotoUrl,
    titulo: r.titulo, explicacion, queHacer: r.queHacer || '', seguridad: r.seguridad || '',
    urgencia: r.urgencia || 'baja', tipoTaller: r.tipoTaller || 'mecánica', pedido, estado: 'nuevo' });
  return { final: true, caso: { id, tipo, titulo: r.titulo, explicacion, queHacer: r.queHacer || '',
    seguridad: r.seguridad || '', urgencia: r.urgencia || '', tipoTaller: r.tipoTaller || '', bomberos: !!r.bomberos } };
}

function carpetaFotos() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('CARPETA_FOTOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const c = DriveApp.createFolder('Autoinfinity Service - Fotos');
  p.setProperty('CARPETA_FOTOS', c.getId());
  return c;
}

// ============ PLAN DE SERVICE (se calcula una sola vez por modelo y kilometraje) ============
function planService(a, prox) {
  const clave = [a.marca, a.modelo, a.anio, prox].join('|').toLowerCase().replace(/\s+/g, ' ');
  const guardado = filas('Planes').find(p => p.clave === clave);
  if (guardado) return JSON.parse(guardado.plan);
  const plan = ia(MODELO_BUENO, 'Sos mecánico experto en autos vendidos en Argentina. Usá el plan de mantenimiento del fabricante. ' +
    'Cada trabajo en 2 a 4 palabras (ej: "cambio de aceite", "filtro de aire"). Respondé SOLO JSON: {"trabajos":["trabajo 1","trabajo 2"]}',
    [{ role: 'user', content: '¿Qué incluye el service de los ' + prox + ' km de un ' + a.marca + ' ' + a.modelo + ' ' + a.anio + '?' }], 1500, ESQ_PLAN);
  agregar('Planes', { clave, plan: JSON.stringify(plan), fecha: new Date() });
  return plan;
}
function casoService(email, autoId) {
  const a = autoDe(email, autoId), km = calcular(a, lecturasDe(autoId));
  const titulo = 'Service de los ' + fmtKm(km.proximoService) + ' km';
  const id = nuevoId('C');
  agregar('Casos', { id, autoId, email, fecha: new Date(), tipo: 'service', titulo,
    explicacion: 'Le pedimos a talleres cerca tuyo que coticen el service según tu auto y kilometraje.',
    tipoTaller: 'mecánica', urgencia: 'baja', estado: 'nuevo', pedido: titulo });
  return { id };
}

// ================== CASOS Y COTIZACIONES ==================
function casosDeMisAutos(email) {
  const ids = filas('Autos').filter(a => esMio(a, email)).map(a => String(a.id));
  return filas('Casos').filter(c => ids.includes(String(c.autoId)));
}
function casoMio(email, id) {
  const c = filas('Casos').find(x => x.id === id);
  if (!c) throw new Error('Pedido no encontrado');
  autoDe(email, c.autoId);
  return c;
}
function sumarHorasHabiles(desde, horas) {
  let d = new Date(desde), resto = horas * 4;
  while (resto > 0) {
    d = new Date(d.getTime() + 15 * 60000);
    const dia = Number(Utilities.formatDate(d, TZ, 'u')), hora = Number(Utilities.formatDate(d, TZ, 'H'));
    if ((dia <= 5 && hora >= 9 && hora < 18) || (dia === 6 && hora >= 9 && hora < 13)) resto--;
  }
  return d;
}
function distancia(a, b, c, d) {
  const r = x => x * Math.PI / 180, R = 6371;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Busca en Google Maps un rubro alrededor de un punto y guarda los talleres nuevos (filtrados por la IA)
function buscarEnGoogle(lat, lng, tipo, radioKm) {
  const key = prop('PLACES_API_KEY');
  if (!key) return 0;
  // No repetir la misma búsqueda (misma zona, rubro y distancia) por 30 días: Google cobra cada una
  const marca = 'busq|' + tipo + '|' + lat.toFixed(2) + '|' + lng.toFixed(2) + '|' + radioKm;
  const pp = PropertiesService.getScriptProperties(), antes = Number(pp.getProperty(marca) || 0);
  if (Date.now() - antes < 30 * 864e5) return 0;
  pp.setProperty(marca, String(Date.now()));
  const r = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask':
      'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,' +
      'places.internationalPhoneNumber,places.primaryTypeDisplayName,places.websiteUri' },
    payload: JSON.stringify({ textQuery: BUSQUEDA[tipo] || tipo, languageCode: 'es', maxResultCount: 20,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radioKm, 50) * 1000 } } })
  });
  const j = JSON.parse(r.getContentText());
  if (j.error) throw new Error('Error de Google: ' + j.error.message);
  const ya = filas('Talleres').map(t => t.placeId + '|' + t.tipo);
  let lugares = (j.places || []).filter(p => (p.internationalPhoneNumber || p.websiteUri) && !ya.includes(p.id + '|' + tipo) &&
    distancia(lat, lng, p.location.latitude, p.location.longitude) <= radioKm);
  // Google mezcla rubros: la IA (modelo barato) se queda solo con los que hacen este trabajo
  if (lugares.length) {
    try {
      const f = ia(MODELO_BARATO, 'Filtrás negocios de Google Maps en Argentina. Devolvé los números de los que SÍ son del rubro pedido. ' +
        'Ante la duda, dejalo afuera.', [{ role: 'user', content: 'Rubro: ' + tipo + '\n' +
        lugares.map((p, n) => n + ') ' + p.displayName.text + (p.primaryTypeDisplayName ? ' [' + p.primaryTypeDisplayName.text + ']' : '')).join('\n') }],
        500, { type: 'object', properties: { sirven: { type: 'array', items: { type: 'integer' } } }, required: ['sirven'] });
      lugares = lugares.filter((p, n) => (f.sirven || []).includes(n));
    } catch (e) { console.log('Filtro de rubro falló: ' + e.message); }
  }
  lugares.forEach(p => agregar('Talleres', {
    placeId: p.id, nombre: p.displayName.text, telefono: p.internationalPhoneNumber || '', direccion: p.formattedAddress,
    lat: p.location.latitude, lng: p.location.longitude, rating: p.rating || 0, resenas: p.userRatingCount || 0, tipo, enListado: '',
    web: p.websiteUri || '' }));
  return lugares.length;
}

function buscarTalleres(a, tipo) {
  let lat = Number(a.lat), lng = Number(a.lng);
  if (!lat) {
    [lat, lng] = geocodificar(a.direccion);
    if (!lat) return [];
    actualizar('Autos', x => String(x.id) === String(a.id), { lat, lng });
  }
  const cerca = (lista, km) => lista.filter(t => t.tipo === tipo && t.enListado !== 'no' && t.telefono && t.lat &&
    distancia(lat, lng, Number(t.lat), Number(t.lng)) <= km);
  // Primero cerca; si hay menos de 5, se agranda la distancia
  let lista = [];
  for (const km of RADIOS_KM) {
    lista = cerca(filas('Talleres'), km);
    if (lista.length < MAX_TALLERES && buscarEnGoogle(lat, lng, tipo, km)) lista = cerca(filas('Talleres'), km);
    if (lista.length >= MIN_POR_RUBRO) break;
  }
  const puntaje = t => (t.enListado === 'si' ? 1000 : 0) + (esCelular(t.telefono) ? 100 : 0) + Number(t.rating) * Math.log10(Number(t.resenas) + 1)
    - distancia(lat, lng, Number(t.lat), Number(t.lng));
  const buenos = lista.filter(t => t.enListado === 'si' || (Number(t.rating) >= 4 && Number(t.resenas) >= 10));
  const resto = lista.filter(t => !buenos.includes(t));
  return buenos.sort((x, y) => puntaje(y) - puntaje(x)).concat(resto.sort((x, y) => puntaje(y) - puntaje(x))).slice(0, MAX_TALLERES);
}

function pedirCotizaciones(email, casoId, modo) {
  const c = casoMio(email, casoId);
  if (c.estado !== 'nuevo') throw new Error('Este pedido ya se envió');
  const a = filas('Autos').find(x => String(x.id) === String(c.autoId));
  const lista = buscarTalleres(a, c.tipoTaller || 'mecánica');
  const vence = modo === 'urgente' ? sumarHorasHabiles(new Date(), HORAS_URGENTE) : new Date(Date.now() + HORAS_NORMAL * 36e5);
  lista.forEach(t => agregar('Envios', { casoId, placeId: t.placeId, fecha: new Date(), estado: 'pendiente' }));
  actualizar('Casos', x => x.id === casoId, { modo, vence, estado: 'cotizando' });
  avisarAdmins((modo === 'urgente' ? 'URGENTE: ' : '') + 'Nuevo pedido para cotizar: ' + c.titulo,
    'Hay ' + lista.length + ' talleres para escribirles.' + (lista.length ? '' : ' No se encontraron solos: agregalos a mano.') +
    '\nEntrá al Panel Autoinfinity: ' + URL_APP());
  return verCaso(email, casoId);
}

function verCaso(email, casoId) {
  const c = casoMio(email, casoId);
  const a = filas('Autos').find(x => String(x.id) === String(c.autoId));
  const talleres = filas('Talleres'), casos = filas('Casos');
  const tall = id => talleres.find(t => String(t.placeId) === String(id)) || {};
  const interna = id => resenasTaller(id, casos);
  const envios = filas('Envios').filter(e => e.casoId === casoId);
  const visibles = c.modo === 'urgente' || c.estado !== 'cotizando';
  const cotizaciones = !visibles ? [] : filas('Cotizaciones').filter(q => q.casoId === casoId).map(q => {
    const t = tall(q.placeId);
    return {
      placeId: String(q.placeId), nombre: String(t.nombre || ''), telefono: String(t.telefono || ''),
      direccion: String(t.direccion || ''), rating: Number(t.rating) || 0, resenas: Number(t.resenas) || 0,
      distancia: (a.lat && t.lat) ? Math.round(distancia(Number(a.lat), Number(a.lng), Number(t.lat), Number(t.lng)) * 10) / 10 : null,
      precio: Number(q.precio) || 0, cuando: String(q.cuando || ''), incluye: String(q.incluye || ''), interna: interna(q.placeId)
    };
  });
  const el = c.tallerElegido ? tall(c.tallerElegido) : null;
  return {
    id: String(c.id), tipo: String(c.tipo), fecha: fd(c.fecha), auto: a.marca + ' ' + a.modelo + ' ' + a.anio,
    titulo: String(c.titulo), descripcion: String(c.descripcion || ''), fotoUrl: String(c.fotoUrl || ''),
    explicacion: String(c.explicacion || ''), queHacer: String(c.queHacer || ''), seguridad: String(c.seguridad || ''),
    urgencia: String(c.urgencia || ''), tipoTaller: String(c.tipoTaller || ''), modo: String(c.modo || ''),
    vence: f(c.vence), venceMs: c.vence ? new Date(c.vence).getTime() : 0, pedido: String(c.pedido || ''),
    admin: esAdmin(email), estado: String(c.estado), consultados: envios.length,
    respondieron: envios.filter(e => e.estado === 'respondio').length, cotizaciones,
    elegido: el ? { placeId: String(el.placeId), nombre: String(el.nombre), telefono: String(el.telefono), direccion: String(el.direccion || '') } : null,
    calificacion: Number(c.calificacion) || 0, comentario: String(c.comentario || '')
  };
}

function elegirTaller(email, casoId, placeId) {
  const c = casoMio(email, casoId);
  actualizar('Casos', x => x.id === casoId, { estado: 'elegido', tallerElegido: placeId });
  avisarAdmins('Cliente eligió taller: ' + c.titulo, 'Avisales a los demás talleres que se cerró. Panel: ' + URL_APP());
  return verCaso(email, casoId);
}
function cortarCaso(email, casoId) {
  const c = casoMio(email, casoId);
  if (!['cotizando', 'listo', 'nuevo'].includes(c.estado)) throw new Error('Este pedido ya está cerrado');
  actualizar('Casos', x => x.id === casoId, { estado: 'cerrado' });
  avisarAdmins('Cliente cerró el pedido: ' + c.titulo, 'Avisales a los talleres que se cerró. Panel: ' + URL_APP());
  return verCaso(email, casoId);
}
// El cliente cambia lo que pidió (ej: 2 cubiertas en vez de 4): se borra lo cotizado y hay que avisar de nuevo a los talleres
function modificarPedido(email, casoId, texto) {
  const c = casoMio(email, casoId);
  texto = String(texto || '').trim();
  if (!texto) throw new Error('Escribí qué necesitás');
  if (c.estado !== 'cotizando') throw new Error('Solo se puede modificar mientras se está cotizando');
  actualizar('Casos', x => x.id === casoId, { pedido: texto, modificado: new Date() });
  borrar('Cotizaciones', q => q.casoId === casoId);
  const s = hoja('Envios'), v = s.getDataRange().getValues(), h = v[0], iC = h.indexOf('casoId'), iE = h.indexOf('estado');
  for (let i = 1; i < v.length; i++) if (v[i][iC] === casoId && v[i][iE] !== 'no cotiza') s.getRange(i + 1, iE + 1).setValue('pendiente');
  avisarAdmins('Cliente modificó el pedido: ' + c.titulo, 'Ahora pide: ' + texto + '\nVolvé a mandar el WhatsApp a los talleres desde el panel: ' + URL_APP());
  return verCaso(email, casoId);
}

// SOLO PARA PRUEBAS: cierra el plazo ya y genera el informe
function forzarInforme(email, casoId) {
  soloAdmin(email);
  const c = filas('Casos').find(x => x.id === casoId);
  if (!c || c.estado !== 'cotizando') throw new Error('Este pedido no está cotizando');
  cerrarVencido(c, filas('Cotizaciones'));
  return verCaso(email, casoId);
}

function calificar(email, casoId, n, comentario, foto) {
  casoMio(email, casoId);
  if (!(Number(n) >= 1 && Number(n) <= 5)) throw new Error('Tocá las estrellas');
  let fotoResena = '';
  if (foto) {
    const f = carpetaFotos().createFile(Utilities.newBlob(Utilities.base64Decode(foto), 'image/jpeg', 'resena_' + casoId + '.jpg'));
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { console.log('No se pudo compartir la foto: ' + e.message); }
    fotoResena = f.getId();
  }
  actualizar('Casos', x => x.id === casoId, { calificacion: Number(n), comentario: comentario || '', fotoResena, fechaResena: new Date() });
  return verCaso(email, casoId);
}
function historial(email) {
  const autos = filas('Autos');
  return casosDeMisAutos(email).sort((x, y) => new Date(y.fecha) - new Date(x.fecha)).map(c => {
    const a = autos.find(x => String(x.id) === String(c.autoId));
    return { id: String(c.id), titulo: String(c.titulo), fecha: fd(c.fecha), auto: a.marca + ' ' + a.modelo, tipo: String(c.tipo) };
  });
}

// ================== PANEL AUTOINFINITY (ustedes) ==================
const fmtKm = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const lindo = t => String(t || '').toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase());

// Mensaje corto para el taller: auto una sola vez, el trabajo y el plazo
// Ejemplo de cómo trabajamos, según el rubro del taller
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

// Mensaje para el taller. Si es la primera vez que le escribimos, va con la presentación.
function mensajeTaller(c, a, primeraVez) {
  const plazo = c.modo === 'urgente' ? 'Es urgente, ¿me respondés hoy?' : 'Respuesta hasta el ' + Utilities.formatDate(new Date(c.vence), TZ, 'dd/MM') + '.';
  const pedido = 'Auto: ' + lindo(a.marca + ' ' + a.modelo) + ' ' + a.anio + '\n' + 'Trabajo: ' + c.pedido + '\n\n' + plazo;
  if (c.modificado) return 'Hola! Te escribo de nuevo de Autoinfinity: el cliente cambió el pedido. ¿Me pasás presupuesto con esto?\n\n' + pedido + ' ¡Gracias!';
  if (!primeraVez) return 'Hola! Te escribo de Autoinfinity. ¿Me pasás presupuesto y cuándo lo podrías hacer?\n\n' + pedido + ' ¡Gracias!';
  const ej = EJEMPLO_RUBRO[c.tipoTaller] || EJEMPLO_RUBRO['mecánica'];
  return 'Hola! Somos Autoinfinity, agencia de autos. Con nuestra app, cuando un cliente necesita, por ejemplo, ' + ej[0] +
    ', le pedimos presupuesto a ' + ej[1] + ' de su zona y él elige y te contacta directo. Sin intermediarios ni comisiones.\n\n' +
    'Ahora tengo este pedido cerca tuyo:\n' + pedido + '\n\n' +
    '¿Me pasás precio y cuándo lo podrías hacer? Si te sirve, te sumo a nuestra lista para los próximos pedidos.';
}
function mensajeCierre(c) {
  return 'Hola! Te escribo de Autoinfinity por el presupuesto de ' + c.pedido + '. El cliente ya lo resolvió, así que lo cerramos. ¡Gracias, pronto te mandamos más trabajos!';
}
// En Argentina, los celulares en formato internacional empiezan con 54 9. Los fijos no tienen WhatsApp.
function normTel(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d && !d.startsWith('54')) d = '549' + d.replace(/^0/, '');
  return d;
}
const esCelular = tel => normTel(tel).startsWith('549');
function waLink(tel, msg) {
  return esCelular(tel) ? 'https://wa.me/' + normTel(tel) + '?text=' + encodeURIComponent(msg) : '';
}

function panelAdmin(email) {
  soloAdmin(email);
  if (!filas('Zonas').length) zonasDesdeAutos();
  const casos = filas('Casos'), autos = filas('Autos'), talleres = filas('Talleres'), envios = filas('Envios'), lect = filas('Lecturas');
  const tall = id => talleres.find(t => String(t.placeId) === String(id)) || {};
  const pedidos = casos.filter(c => c.estado === 'cotizando').map(c => {
    const a = autos.find(x => String(x.id) === String(c.autoId));
    const km = calcular(a, lect.filter(l => String(l.autoId) === String(a.id)));
    return {
      casoId: String(c.id), titulo: String(c.titulo), modo: String(c.modo), vence: f(c.vence), auto: a.marca + ' ' + a.modelo,
      autoLat: Number(a.lat) || null, autoLng: Number(a.lng) || null,
      envios: envios.filter(e => e.casoId === c.id).map(e => {
        const t = tall(e.placeId);
        // Primera vez = nunca le escribimos por otro pedido y no está en la lista
        const primeraVez = t.enListado !== 'si' && !envios.some(x => String(x.placeId) === String(e.placeId) && x.casoId !== c.id &&
          ['enviado', 'respondio', 'no cotiza'].includes(x.estado));
        const msg = mensajeTaller(c, a, primeraVez);
        const tl = Number(t.lat), tg = Number(t.lng);
        return { placeId: String(e.placeId), nombre: String(t.nombre || ''), telefono: String(t.telefono || ''),
          celular: esCelular(t.telefono), direccion: String(t.direccion || ''),
          estado: String(e.estado), wa: waLink(t.telefono, msg), tel: 'tel:+' + normTel(t.telefono),
          rating: Number(t.rating) || 0, resenas: Number(t.resenas) || 0, primeraVez, lista: String(t.enListado || ''),
          lat: tl || null, lng: tg || null,
          kmAuto: (tl && Number(a.lat)) ? Math.round(distancia(Number(a.lat), Number(a.lng), tl, tg) * 10) / 10 : null };
      })
    };
  });
  const cierres = casos.filter(c => ['elegido', 'cerrado'].includes(c.estado) && !c.avisado).map(c => {
    const msg = mensajeCierre(c);
    return {
      casoId: String(c.id), titulo: String(c.titulo),
      talleres: envios.filter(e => e.casoId === c.id && ['enviado', 'respondio'].includes(e.estado) &&
        String(e.placeId) !== String(c.tallerElegido)).map(e => {
          const t = tall(e.placeId);
          return { nombre: String(t.nombre || ''), wa: waLink(t.telefono, msg) };
        })
    };
  });
  return { pedidos, cierres, base: resumenBase(talleres) };
}
function marcarEnvio(email, casoId, placeId, estado) {
  soloAdmin(email);
  actualizar('Envios', e => e.casoId === casoId && String(e.placeId) === String(placeId), { estado });
  return panelAdmin(email);
}
function cargarRespuesta(email, casoId, placeId, texto) {
  soloAdmin(email);
  const c = filas('Casos').find(x => x.id === casoId);
  const r = ia(MODELO_BARATO, 'Leé la respuesta de un taller argentino a un pedido de presupuesto. Respondé SOLO JSON: ' +
    '{"cotiza":true o false,"precio":número en pesos sin puntos ni signos o null,"cuando":"cuándo lo pueden hacer, corto","incluye":"qué incluye el precio, corto"}',
    [{ role: 'user', content: 'Pedido: ' + c.pedido + '\nRespuesta del taller: ' + texto }], 800, ESQ_RESPUESTA);
  const buscar = e => e.casoId === casoId && String(e.placeId) === String(placeId);
  if (!r.cotiza) { actualizar('Envios', buscar, { estado: 'no cotiza' }); return panelAdmin(email); }
  agregar('Cotizaciones', { casoId, placeId, fecha: new Date(), precio: r.precio || '', cuando: r.cuando || '', incluye: r.incluye || '', texto });
  actualizar('Envios', buscar, { estado: 'respondio' });
  if (c.modo === 'urgente') avisarCliente(c, 'Llegó una cotización: ' + c.titulo, 'Entrá a la app para verla: ' + URL_APP());
  return panelAdmin(email);
}
function agregarTallerManual(email, casoId, nombre, tel) {
  soloAdmin(email);
  if (!nombre || !tel) throw new Error('Poné nombre y teléfono');
  const c = filas('Casos').find(x => x.id === casoId);
  const placeId = nuevoId('M');
  agregar('Talleres', { placeId, nombre, telefono: tel, tipo: c.tipoTaller, enListado: 'si' });
  agregar('Envios', { casoId, placeId, fecha: new Date(), estado: 'pendiente' });
  return panelAdmin(email);
}
// Lista de talleres: 'si' = proveedor nuestro (va primero siempre), 'no' = lista negra (no se le escribe más)
function marcarLista(email, placeId, valor) {
  soloAdmin(email);
  const s = hoja('Talleres'), v = s.getDataRange().getValues(), h = v[0], iId = h.indexOf('placeId'), iL = h.indexOf('enListado');
  for (let i = 1; i < v.length; i++) if (String(v[i][iId]) === String(placeId)) s.getRange(i + 1, iL + 1).setValue(valor);
  if (valor === 'no') actualizar('Envios', e => String(e.placeId) === String(placeId) && e.estado === 'pendiente', { estado: 'no cotiza' });
  return panelAdmin(email);
}
function marcarAvisado(email, casoId) {
  soloAdmin(email);
  actualizar('Casos', x => x.id === casoId, { avisado: new Date() });
  return panelAdmin(email);
}

// ================== AVISOS POR MAIL ==================
function avisarAdmins(asunto, texto) {
  ADMIN_EMAILS.forEach(e => { try { MailApp.sendEmail(e, asunto, texto); } catch (x) {} });
}
function avisarCliente(c, asunto, texto) {
  const a = filas('Autos').find(x => String(x.id) === String(c.autoId));
  if (a) listaEmails(a).forEach(e => { try { MailApp.sendEmail(e, asunto, texto + '\n\nAutoinfinity Service'); } catch (x) {} });
}

// Cada hora: cierra los pedidos vencidos y avisa al cliente
function revisarCasos() {
  const ahora = new Date(), cots = filas('Cotizaciones');
  filas('Casos').filter(c => c.estado === 'cotizando' && c.vence && new Date(c.vence) < ahora).forEach(c => cerrarVencido(c, cots));
}
function cerrarVencido(c, cots) {
  actualizar('Casos', x => x.id === c.id, { estado: 'listo' });
  const n = cots.filter(q => q.casoId === c.id).length;
  avisarCliente(c, n ? 'Ya tenés tu informe: ' + n + ' talleres cotizaron' : 'Tu pedido de presupuesto cerró',
    (n ? 'Entrá a la app para comparar precios, reseñas y cercanía: '
       : 'Esta vez ningún taller respondió a tiempo. Podés pedirlo de nuevo desde la app: ') + URL_APP());
}

// Cada día: pedir kilómetros y avisar del service
function avisos() {
  const lect = filas('Lecturas');
  filas('Autos').forEach(a => {
    const c = calcular(a, lect.filter(l => String(l.autoId) === String(a.id)));
    if (!c) return;
    const auto = c.marca + ' ' + c.modelo;
    let asunto = '', texto = '';
    if (c.diasSinCargar >= 15 && c.diasSinCargar % 15 === 0) {
      asunto = 'Actualizá los kilómetros de tu ' + auto;
      texto = 'Hola! Hace ' + c.diasSinCargar + ' días que no cargás los kilómetros de tu ' + auto +
        '. Mirá el tablero y cargalos en 10 segundos: ' + URL_APP();
    } else if (c.faltanDias === 15) {
      asunto = 'Se acerca el service de tu ' + auto;
      texto = 'Hola! En unos 15 días tu ' + auto + ' llega a los ' + c.proximoService +
        ' km y le toca el service. Desde la app te conseguimos presupuestos de talleres cerca: ' + URL_APP();
    }
    if (asunto) listaEmails(a).forEach(e => { try { MailApp.sendEmail(e, asunto, texto + '\n\nAutoinfinity Service'); } catch (x) {} });
  });
}

// ============ REPARAR TELÉFONOS (ejecutar UNA vez desde el editor) ============
// Vuelve a pedir a Google el teléfono de los talleres que quedaron con #ERROR! o vacíos
function repararTalleres() {
  const key = prop('PLACES_API_KEY');
  const s = hoja('Talleres'), v = s.getDataRange().getValues(), h = v[0];
  const iId = h.indexOf('placeId'), iTel = h.indexOf('telefono');
  let n = 0;
  for (let i = 1; i < v.length; i++) {
    const tel = String(v[i][iTel]);
    if (tel && !tel.startsWith('#') && /\d{6}/.test(tel)) continue;
    if (String(v[i][iId]).startsWith('M')) continue;
    const r = UrlFetchApp.fetch('https://places.googleapis.com/v1/places/' + v[i][iId], {
      muteHttpExceptions: true, headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'internationalPhoneNumber' } });
    const j = JSON.parse(r.getContentText());
    if (j.internationalPhoneNumber) { s.getRange(i + 1, iTel + 1).setValue("'" + j.internationalPhoneNumber); n++; }
  }
  console.log('Teléfonos reparados: ' + n);
}


// =====================================================================
// ============ BASE DE TALLERES: ZONAS Y RECLUTAMIENTO =================
// =====================================================================
// Cada zona sale de donde duerme el auto de un cliente. Todos los días, para cada zona,
// se busca UN rubro (mecánica hoy, chapa y pintura mañana...) hasta tener 5 talleres
// anotados por rubro. Si no hay suficientes cerca, se agranda la distancia.

function secreto() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SECRETO');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRETO', s); }
  return s;
}
function firma(placeId) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(placeId), secreto())).slice(0, 16);
}
const linkAlta = id => URL_APP() + '?taller=' + encodeURIComponent(id) + '&t=' + firma(id);
const linkBaja = id => linkAlta(id) + '&baja=1';

function crearZona(lat, lng, nombre) {
  if (filas('Zonas').some(z => distancia(lat, lng, Number(z.lat), Number(z.lng)) < 5)) return;
  let barrio = '';
  try {
    const comp = Maps.newGeocoder().setLanguage('es').reverseGeocode(lat, lng).results[0].address_components;
    const c = comp.find(x => x.types.includes('sublocality')) || comp.find(x => x.types.includes('locality'));
    barrio = c ? c.long_name : '';
  } catch (e) {}
  agregar('Zonas', { id: nuevoId('Z'), nombre: barrio || String(nombre).split(',')[0], lat, lng, alta: new Date(), estado: '{}' });
}
// Las zonas salen de donde duermen los autos de los clientes
function zonasDesdeAutos() {
  filas('Autos').forEach(a => { if (Number(a.lat)) crearZona(Number(a.lat), Number(a.lng), a.direccion); });
}
function agregarZona(email, direccion) {
  soloAdmin(email);
  const g = geocodificar(direccion);
  if (!g[0]) throw new Error('No encontré esa dirección');
  crearZona(g[0], g[1], direccion);
  return panelAdmin(email);
}

// Cuántos talleres hay de un rubro alrededor de una zona
function contar(z, tipo, talleres, km) {
  const t = talleres.filter(x => x.tipo === tipo && x.lat && distancia(Number(z.lat), Number(z.lng), Number(x.lat), Number(x.lng)) <= km);
  return { anotados: t.filter(x => x.enListado === 'si').length, posibles: t.filter(x => x.enListado !== 'no').length,
    invitados: t.filter(x => x.invitado && x.enListado !== 'si').length };
}

// Se ejecuta una vez por día (activador). También se puede tocar "Buscar ahora" en el panel.
function reclutar() {
  zonasDesdeAutos();
  const zonas = filas('Zonas');
  let mails = 0;
  zonas.slice(0, 6).forEach(z => { try { mails += reclutarZona(z, MAX_MAILS_DIA - mails); } catch (e) { console.log('Zona ' + z.nombre + ': ' + e.message); } });
}
function reclutarAhora(email, zonaId) {
  soloAdmin(email);
  const z = filas('Zonas').find(x => x.id === zonaId);
  if (!z) throw new Error('Zona no encontrada');
  reclutarZona(z, 15);
  return panelAdmin(email);
}

function reclutarZona(z, cupoMails) {
  let est = {};
  try { est = JSON.parse(z.estado || '{}'); } catch (e) {}
  const talleres = filas('Talleres');
  // Rubros que todavía no llegan a 5 anotados; se elige el menos trabajado
  const pendientes = RUBROS.filter(r => r !== 'lavadero' && contar(z, r, talleres, (est[r] || {}).km || RADIOS_KM[0]).anotados < MIN_POR_RUBRO);
  if (!pendientes.length) return 0;
  pendientes.sort((a, b) => ((est[a] || {}).veces || 0) - ((est[b] || {}).veces || 0));
  const rubro = pendientes[0];
  const e = est[rubro] || { km: RADIOS_KM[0], veces: 0 };
  // Si en esta distancia no hay ni 5 talleres posibles, agrandamos
  let c = contar(z, rubro, talleres, e.km);
  if (c.posibles < MIN_POR_RUBRO) {
    buscarEnGoogle(Number(z.lat), Number(z.lng), rubro, e.km);
    c = contar(z, rubro, filas('Talleres'), e.km);
    const i = RADIOS_KM.indexOf(e.km);
    if (c.posibles < MIN_POR_RUBRO && i < RADIOS_KM.length - 1) e.km = RADIOS_KM[i + 1];
  }
  e.veces++; e.ultima = fd(new Date()); est[rubro] = e;
  actualizar('Zonas', x => x.id === z.id, { estado: JSON.stringify(est) });
  buscarMails(z, rubro, e.km);
  return invitarPorMail(z, rubro, e.km, cupoMails);
}

// Entra a la web de cada taller y busca un mail de contacto
function buscarMails(z, rubro, km) {
  const s = hoja('Talleres'), v = s.getDataRange().getValues(), h = v[0];
  const col = k => h.indexOf(k);
  const filasWeb = [];
  for (let i = 1; i < v.length; i++) {
    const t = v[i];
    if (t[col('tipo')] !== rubro || !t[col('web')] || t[col('email')] || t[col('mailBuscado')]) continue;
    if (distancia(Number(z.lat), Number(z.lng), Number(t[col('lat')]), Number(t[col('lng')])) > km) continue;
    filasWeb.push(i);
    if (filasWeb.length >= 15) break;
  }
  if (!filasWeb.length) return;
  const resp = UrlFetchApp.fetchAll(filasWeb.map(i => ({ url: String(v[i][col('web')]), muteHttpExceptions: true, followRedirects: true })));
  resp.forEach((r, n) => {
    const i = filasWeb[n];
    let mail = '';
    try {
      const html = r.getContentText().slice(0, 400000);
      const m = (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])
        .filter(x => !/\.(png|jpe?g|gif|webp|svg)$/i.test(x) && !/(sentry|wixpress|example|domain|godaddy|wordpress)/i.test(x));
      mail = m[0] || '';
    } catch (e) {}
    s.getRange(i + 1, col('mailBuscado') + 1).setValue(fd(new Date()));
    if (mail) s.getRange(i + 1, col('email') + 1).setValue(mail.toLowerCase());
  });
}

function invitarPorMail(z, rubro, km, cupo) {
  if (cupo <= 0) return 0;
  const ej = EJEMPLO_RUBRO[rubro] || EJEMPLO_RUBRO['mecánica'];
  const lista = filas('Talleres').filter(t => t.tipo === rubro && t.email && !t.invitado && !t.enListado &&
    distancia(Number(z.lat), Number(z.lng), Number(t.lat), Number(t.lng)) <= km).slice(0, cupo);
  lista.forEach(t => {
    const html = '<p>Hola ' + t.nombre + ',</p>' +
      '<p>Somos <b>Autoinfinity</b>, agencia de autos. Con nuestra app, cuando un cliente de tu zona necesita, por ejemplo, ' + ej[0] +
      ', le pedimos presupuesto a ' + ej[1] + ' cercanos; él compara y te contacta directo. Sin intermediarios ni comisiones.</p>' +
      '<p>¿Querés recibir pedidos? Dejanos tu WhatsApp acá (1 minuto):<br><a href="' + linkAlta(t.placeId) + '"><b>Quiero recibir pedidos</b></a></p>' +
      '<p>Saludos,<br>Hernán · Autoinfinity</p>' +
      '<p style="color:#888;font-size:12px">Si no te interesa, <a href="' + linkBaja(t.placeId) + '" style="color:#888">tocá acá</a> y no te escribimos más.</p>';
    try {
      MailApp.sendEmail({ to: t.email, subject: 'Clientes para ' + t.nombre + ', de parte de Autoinfinity', htmlBody: html, name: 'Autoinfinity' });
      actualizar('Talleres', x => x.placeId === t.placeId && x.tipo === t.tipo, { invitado: 'mail ' + fd(new Date()) });
    } catch (e) { console.log('Mail a ' + t.email + ' falló: ' + e.message); }
  });
  return lista.length;
}

// Invitación por WhatsApp para los que no tienen mail (la mandan ustedes desde el panel)
function mensajeInvitacion(t) {
  const ej = EJEMPLO_RUBRO[t.tipo] || EJEMPLO_RUBRO['mecánica'];
  return 'Hola! Somos Autoinfinity, agencia de autos. Con nuestra app, cuando un cliente de tu zona necesita, por ejemplo, ' + ej[0] +
    ', le pedimos presupuesto a ' + ej[1] + ' cercanos y él te contacta directo. Sin intermediarios ni comisiones.\n\n' +
    '¿Querés recibir pedidos? Dejanos tus datos acá (1 minuto): ' + linkAlta(t.placeId);
}
function marcarInvitado(email, placeId) {
  soloAdmin(email);
  actualizar('Talleres', x => String(x.placeId) === String(placeId), { invitado: 'whatsapp ' + fd(new Date()) });
  return true;
}

// Resumen para el panel: cada zona con cuántos anotados tiene por rubro, e invitaciones por WhatsApp pendientes
function resumenBase(talleres) {
  const zonas = filas('Zonas').map(z => {
    let est = {};
    try { est = JSON.parse(z.estado || '{}'); } catch (e) {}
    return { id: String(z.id), nombre: String(z.nombre), rubros: RUBROS.filter(r => r !== 'lavadero').map(r => {
      const km = (est[r] || {}).km || RADIOS_KM[0], c = contar(z, r, talleres, km);
      return { rubro: r, anotados: c.anotados, invitados: c.invitados, km, buscado: !!est[r] };
    }) };
  });
  const invitarWa = talleres.filter(t => !t.email && !t.invitado && !t.enListado && esCelular(t.telefono)).slice(0, 15)
    .map(t => ({ placeId: String(t.placeId), nombre: String(t.nombre), tipo: String(t.tipo), telefono: String(t.telefono),
      wa: waLink(t.telefono, mensajeInvitacion(t)) }));
  return { zonas, invitarWa, anotados: talleres.filter(t => t.enListado === 'si').length };
}

// ============ PÁGINA PARA QUE EL TALLER SE ANOTE (link del mail / WhatsApp) ============
function paginaTaller(p) {
  const id = String(p.taller), ok = p.t === firma(id);
  const t = ok && filas('Talleres').find(x => String(x.placeId) === id);
  let cuerpo;
  if (!t) cuerpo = '<h2>Link inválido</h2><p>Escribinos y te sumamos a mano.</p>';
  else if (p.baja) {
    actualizar('Talleres', x => String(x.placeId) === id, { enListado: 'no' });
    cuerpo = '<h2>Listo</h2><p>No te vamos a escribir más. ¡Gracias!</p>';
  } else {
    cuerpo = '<h2>Sumate a Autoinfinity Service</h2>' +
      '<p>' + t.nombre + ': dejanos dónde te mandamos los pedidos de presupuesto de clientes de tu zona. Sin intermediarios ni comisiones.</p>' +
      '<label>Tu nombre</label><input id="n">' +
      '<label>WhatsApp (con código de área)</label><input id="w" type="tel" value="' + String(t.telefono || '').replace(/"/g, '') + '">' +
      '<label>Mail (opcional)</label><input id="m" type="email" value="' + String(t.email || '').replace(/"/g, '') + '">' +
      '<button id="b" onclick="enviar()">Quiero recibir pedidos</button><p id="r"></p>' +
      '<script>function enviar(){var b=document.getElementById("b");b.disabled=true;b.textContent="Enviando...";' +
      'google.script.run.withSuccessHandler(function(){document.body.innerHTML="<div class=w><h2>¡Listo!</h2><p>Ya estás en nuestra lista. Te vamos a escribir cuando un cliente de tu zona necesite presupuesto.</p></div>"})' +
      '.withFailureHandler(function(e){b.disabled=false;b.textContent="Quiero recibir pedidos";document.getElementById("r").textContent=e.message})' +
      '.altaTaller(' + JSON.stringify(id) + ',' + JSON.stringify(p.t) + ',{nombre:document.getElementById("n").value,whatsapp:document.getElementById("w").value,email:document.getElementById("m").value})}</script>';
  }
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f6f5f2;color:#1d1d1f;font:16px -apple-system,system-ui,sans-serif}' +
    '.w{max-width:440px;margin:0 auto;padding:24px 16px}label{display:block;font-size:14px;color:#6e6e73;margin:12px 0 4px}' +
    'input{font:inherit;width:100%;box-sizing:border-box;padding:13px;border:1px solid #e5e3de;border-radius:12px}' +
    'button{font:inherit;font-weight:600;width:100%;margin-top:18px;padding:15px;border:0;border-radius:14px;background:#0a7d5a;color:#fff}</style></head>' +
    '<body><div class="w"><p style="color:#0a7d5a;font-weight:700">Autoinfinity</p>' + cuerpo + '</div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('Autoinfinity Service · Talleres').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function altaTaller(id, t, d) {
  if (t !== firma(id)) throw new Error('Link inválido');
  if (!String(d.whatsapp || '').replace(/\D/g, '') && !String(d.email || '').includes('@')) throw new Error('Dejanos un WhatsApp o un mail');
  const cambios = { enListado: 'si', contacto: d.nombre || '' };
  if (String(d.whatsapp || '').replace(/\D/g, '')) { cambios.whatsapp = "'" + d.whatsapp; cambios.telefono = "'" + d.whatsapp; }
  if (String(d.email || '').includes('@')) cambios.email = d.email;
  const s = hoja('Talleres'), v = s.getDataRange().getValues(), h = v[0];
  for (let i = 1; i < v.length; i++) if (String(v[i][h.indexOf('placeId')]) === String(id))
    Object.keys(cambios).forEach(k => s.getRange(i + 1, h.indexOf(k) + 1).setValue(cambios[k]));
  const tt = filas('Talleres').find(x => String(x.placeId) === String(id));
  avisarAdmins('Nuevo taller anotado: ' + (tt ? tt.nombre : id), 'Se sumó a la lista de Autoinfinity Service. WhatsApp: ' + (d.whatsapp || '-') + ' · Mail: ' + (d.email || '-'));
  return true;
}


// ============ RESEÑAS DE AUTOINFINITY ============
// Se muestran recién cuando el taller tiene 5 reseñas de clientes, como en Google
function resenasTaller(placeId, casos) {
  const usuarios = filas('Usuarios');
  const r = (casos || filas('Casos')).filter(x => String(x.tallerElegido) === String(placeId) && Number(x.calificacion) > 0)
    .sort((a, b) => new Date(b.fechaResena || b.fecha) - new Date(a.fechaResena || a.fecha));
  if (r.length < MIN_RESENAS) return { n: r.length, faltan: MIN_RESENAS - r.length };
  const nombre = e => { const u = usuarios.find(x => x.email === e); return String((u && u.nombre) || 'Cliente').split(' ')[0]; };
  return {
    n: r.length, faltan: 0,
    prom: Math.round(r.reduce((s, x) => s + Number(x.calificacion), 0) / r.length * 10) / 10,
    lista: r.slice(0, 20).map(x => ({ estrellas: Number(x.calificacion), texto: String(x.comentario || ''), foto: String(x.fotoResena || ''),
      fecha: fd(x.fechaResena || x.fecha), nombre: nombre(x.email), trabajo: String(x.titulo || '') }))
  };
}

// ============ CONTACTO CON AUTOINFINITY ============
function enviarContacto(email, tipo, texto) {
  texto = String(texto || '').trim();
  if (!texto) throw new Error('Escribinos tu mensaje');
  const u = filas('Usuarios').find(x => x.email === email) || {};
  agregar('Contactos', { fecha: new Date(), email, nombre: u.nombre || '', tipo, texto, estado: 'nuevo' });
  ADMIN_EMAILS.forEach(a => { try {
    MailApp.sendEmail({ to: a, replyTo: email, name: 'Autoinfinity Service',
      subject: tipo + ' de ' + (u.nombre || email) + ' (Autoinfinity Service)',
      body: texto + '\n\n— ' + (u.nombre || '') + ' · ' + email + '\nRespondé este mail y le llega directo al cliente.' });
  } catch (e) {} });
  return true;
}
