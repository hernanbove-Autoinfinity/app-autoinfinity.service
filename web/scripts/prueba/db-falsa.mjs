// Base de datos de mentira, en memoria, que imita a supabase-js lo justo para probar la app completa sin internet.
import crypto from 'node:crypto';

const ahora = () => new Date().toISOString();
const DEF = {
  usuarios: () => ({ nombre: '', mecanico_nombre: '', mecanico_tel: '', seguro_nombre: '', seguro_tel: '', creado: ahora() }),
  autos: () => ({ id: crypto.randomUUID(), anio: '', direccion: '', lat: null, lng: null, fecha_primera: ahora(), fecha_ultima: ahora(), creado: ahora() }),
  auto_usuarios: () => ({ creado: ahora() }),
  lecturas: () => ({ id: crypto.randomInt(1e9), fecha: ahora(), fuente: 'manual' }),
  talleres: () => ({ id: crypto.randomUUID(), google_id: null, telefono: '', direccion: '', lat: null, lng: null, rating: 0, resenas: 0, en_lista: null,
    web: '', email: '', whatsapp: '', contacto: '', invitado: '', mail_buscado: null, creado: ahora() }),
  casos: () => ({ id: crypto.randomUUID(), fecha: ahora(), descripcion: '', foto_path: '', titulo: '', explicacion: '', que_hacer: '', seguridad: '',
    urgencia: 'baja', tipo_taller: 'mecánica', pedido: '', modo: '', vence: null, estado: 'nuevo', taller_elegido: null, calificacion: null,
    comentario: '', foto_resena: '', fecha_resena: null, avisado: null, modificado: null }),
  envios: () => ({ fecha: ahora(), estado: 'pendiente', wa_error: '' }),
  cotizaciones: () => ({ id: crypto.randomInt(1e9), fecha: ahora(), precio: null, cuando: '', incluye: '', texto: '' }),
  zonas: () => ({ id: crypto.randomUUID(), estado: {}, ultima_recluta: null, creado: ahora() }),
  contactos: () => ({ id: crypto.randomInt(1e9), fecha: ahora(), nombre: '', estado: 'nuevo' }),
  busquedas: () => ({ fecha: ahora() }),
  uso_ia: () => ({ id: crypto.randomInt(1e9), fecha: ahora(), tipo: '' })
};
const PK = { usuarios: ['email'], auto_usuarios: ['auto_id', 'email'], envios: ['caso_id', 'taller_id'], busquedas: ['clave'] };
// Relaciones: tabla → { embebida: [campo propio, campo de la otra, uno|muchos] }
const REL = {
  auto_usuarios: { autos: ['auto_id', 'id', 1] },
  autos: { auto_usuarios: ['id', 'auto_id', 'n'] },
  casos: { autos: ['auto_id', 'id', 1], cotizaciones: ['id', 'caso_id', 'n'] },
  envios: { talleres: ['taller_id', 'id', 1] },
  cotizaciones: { talleres: ['taller_id', 'id', 1] }
};

function partir(sel) {
  const out = []; let nivel = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') nivel++; if (ch === ')') nivel--;
    if (ch === ',' && !nivel) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const km = (a, b, c, d) => { const r = x => x * Math.PI / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

export function crearDbFalsa() {
  const T = Object.fromEntries(Object.keys(DEF).map(k => [k, []]));
  const archivos = {};
  function proyectar(tabla, fila, sel) {
    if (!sel || sel === '*') return { ...fila };
    const o = {};
    for (const parte of partir(sel)) {
      const m = parte.match(/^(\w+)\((.*)\)$/);
      if (!m) { if (parte === '*') Object.assign(o, fila); else o[parte] = fila[parte]; continue; }
      const [, otra, sub] = m, rel = (REL[tabla] || {})[otra];
      if (!rel) throw new Error('Relación desconocida ' + tabla + '→' + otra);
      const hijos = T[otra].filter(x => x[rel[1]] === fila[rel[0]]);
      if (sub === 'count') o[otra] = [{ count: hijos.length }];
      else o[otra] = rel[2] === 1 ? (hijos[0] ? proyectar(otra, hijos[0], sub) : null) : hijos.map(h => proyectar(otra, h, sub));
    }
    return o;
  }
  function from(tabla) {
    if (!T[tabla]) throw new Error('Tabla desconocida ' + tabla);
    const st = { op: 'select', sel: '*', filtros: [], orden: [], lim: null, desde: 0, unico: null, countHead: false, datos: null, opts: {}, retSel: null };
    const b = {
      select(sel, o) { if (st.op === 'select') { st.sel = sel || '*'; if (o && o.head) st.countHead = true; if (o && o.count) st.count = true; } else st.retSel = sel || '*'; return b; },
      insert(d) { st.op = 'insert'; st.datos = Array.isArray(d) ? d : [d]; return b; },
      upsert(d, o) { st.op = 'upsert'; st.datos = Array.isArray(d) ? d : [d]; st.opts = o || {}; return b; },
      update(d) { st.op = 'update'; st.datos = d; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(c, v) { st.filtros.push(x => x[c] === v); return b; },
      neq(c, v) { st.filtros.push(x => x[c] !== v); return b; },
      in(c, v) { st.filtros.push(x => v.includes(x[c])); return b; },
      gte(c, v) { st.filtros.push(x => x[c] != null && x[c] >= v); return b; },
      lte(c, v) { st.filtros.push(x => x[c] != null && x[c] <= v); return b; },
      lt(c, v) { st.filtros.push(x => x[c] != null && x[c] < v); return b; },
      is(c, v) { st.filtros.push(x => x[c] == null); return b; },
      not(c, op, v) { st.filtros.push(x => x[c] != null); return b; },
      order(c, o) { st.orden.push([c, !o || o.ascending !== false]); return b; },
      limit(n) { st.lim = n; return b; },
      range(a, z) { st.desde = a; st.lim = z - a + 1; return b; },
      single() { st.unico = 'single'; return b; },
      maybeSingle() { st.unico = 'maybe'; return b; },
      then(ok, mal) { return Promise.resolve().then(ejecutar).then(ok, mal); }
    };
    function ejecutar() {
      try {
        let filas = T[tabla].filter(x => st.filtros.every(f => f(x)));
        let res;
        if (st.op === 'insert' || st.op === 'upsert') {
          res = [];
          for (const d of st.datos) {
            const conf = st.op === 'upsert' ? (st.opts.onConflict ? st.opts.onConflict.split(',') : PK[tabla]) : (PK[tabla] || ['id']);
            const ya = conf && T[tabla].find(x => conf.every(k => x[k] === d[k] && d[k] != null));
            if (ya) {
              if (st.op === 'insert') return { data: null, error: { message: 'duplicate key ' + tabla } };
              if (!st.opts.ignoreDuplicates) Object.assign(ya, d);
              continue;
            }
            const nueva = Object.assign(DEF[tabla](), d);
            T[tabla].push(nueva); res.push(nueva);
          }
          if (!st.retSel) return { data: null, error: null };
          filas = res.map(x => proyectar(tabla, x, st.retSel));
        } else if (st.op === 'update') {
          filas.forEach(x => Object.assign(x, st.datos));
          if (!st.retSel) return { data: null, error: null };
          filas = filas.map(x => proyectar(tabla, x, st.retSel));
        } else if (st.op === 'delete') {
          T[tabla] = T[tabla].filter(x => !filas.includes(x));
          return { data: null, error: null };
        } else {
          for (const [c, asc] of st.orden.slice().reverse()) filas = filas.slice().sort((a, z) => (a[c] == null) - (z[c] == null) || (a[c] > z[c] ? 1 : a[c] < z[c] ? -1 : 0) * (asc ? 1 : -1));
          const total = filas.length;
          filas = filas.slice(st.desde, st.lim == null ? undefined : st.desde + st.lim).map(x => proyectar(tabla, x, st.sel));
          if (st.countHead) return { data: null, error: null, count: total };
          if (st.count && !st.unico) return { data: filas, error: null, count: total };
        }
        if (st.unico === 'single') return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { message: 'single: ' + filas.length + ' filas en ' + tabla } };
        if (st.unico === 'maybe') return filas.length > 1 ? { data: null, error: { message: 'maybeSingle: varias filas' } } : { data: filas[0] || null, error: null };
        return { data: filas, error: null };
      } catch (e) { return { data: null, error: { message: e.message } }; }
    }
    return b;
  }
  return {
    T, archivos,
    from,
    auth: { getUser: async token => token && token.includes('@') ? { data: { user: { email: token } }, error: null } : { data: null, error: { message: 'token' } } },
    rpc(nombre, p) {
      if (nombre !== 'talleres_cerca') throw new Error('rpc desconocida');
      const data = T.talleres.filter(t => (!p.p_tipo || t.tipo === p.p_tipo) && t.lat != null && km(p.p_lat, p.p_lng, t.lat, t.lng) <= p.p_km)
        .map(t => ({ taller: { ...t }, km: km(p.p_lat, p.p_lng, t.lat, t.lng) }));
      return Promise.resolve({ data, error: null });
    },
    storage: {
      from(b) {
        return {
          upload: async (ruta, buf) => { archivos[b + '/' + ruta] = buf.length; return { error: null }; },
          createSignedUrl: async ruta => ({ data: { signedUrl: 'https://firmado/' + b + '/' + ruta } }),
          getPublicUrl: ruta => ({ data: { publicUrl: 'https://publico/' + b + '/' + ruta } })
        };
      }
    }
  };
}
