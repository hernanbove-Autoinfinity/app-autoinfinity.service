// =====================================================================
// Tareas automáticas (Vercel Cron, ver vercel.json)
//   /api/cron?tarea=diaria   → avisos de km y service + reclutar talleres + cerrar plazos
//   /api/cron?tarea=revisar  → solo cerrar plazos vencidos (se puede llamar más seguido)
// Vercel manda la clave CRON_SECRET; sin ella no corre.
// =====================================================================
import { avisos, reclutar, revisarVencidos } from '../lib/app.js';
import { env } from '../lib/base.js';

export default async function handler(req, res) {
  if (!env('CRON_SECRET') || req.headers.authorization !== 'Bearer ' + env('CRON_SECRET')) return res.status(401).json({ error: 'No autorizado' });
  const tarea = req.query.tarea || 'diaria';
  const hecho = {};
  try {
    hecho.cerrados = await revisarVencidos();
    if (tarea === 'diaria') {
      hecho.avisos = await avisos();
      hecho.invitaciones = await reclutar();
    }
    return res.json({ ok: true, hecho });
  } catch (e) {
    console.error('CRON', e);
    return res.status(500).json({ error: e.message, hecho });
  }
}
