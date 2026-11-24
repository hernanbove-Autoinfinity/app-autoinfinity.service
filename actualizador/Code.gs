/* =====================================================================
 * ACTUALIZADOR — App Autoinfinity
 * Proyecto aparte (no es la app). Baja Code.gs e Index.html del repositorio
 * privado de GitHub, los pone en la app y publica la versión nueva.
 * Configuración (Configuración del proyecto → Propiedades de la secuencia de comandos):
 *   GITHUB_TOKEN   token de GitHub de solo lectura del repositorio
 *   APP_SCRIPT_ID  ID de la secuencia de comandos de la app a actualizar
 *   GITHUB_REPO    (opcional) dueño/repositorio; si no está, usa el de la app Staff
 *   APP_NOMBRE     (opcional) nombre que se muestra, ej: Autoinfinity Service
 * ===================================================================== */
const REPO = PropertiesService.getScriptProperties().getProperty('GITHUB_REPO') || 'hernanbove-Autoinfinity/app-autoinfinity.staff';
const NOMBRE = PropertiesService.getScriptProperties().getProperty('APP_NOMBRE') || 'App Autoinfinity';

/** Abrís el link: te muestra qué cambió y un botón "Aplicar". */
function doGet(e) {
  let html;
  try {
    const c = ultimoCambio_();
    if (e && e.parameter && e.parameter.ok === c.sha) {
      const r = actualizar_();
      html = '<h1>' + (r.igual ? 'Ya estaba actualizada' : 'Listo ✅') + '</h1><p>' + esc_(r.msg) + '</p>';
    } else {
      html = '<h1>Actualizar ' + esc_(NOMBRE) + '</h1><p class="m">Último cambio (' + esc_(c.fecha) + '):</p><pre>' + esc_(c.msg) + '</pre>' +
        '<a class="b" href="' + ScriptApp.getService().getUrl() + '?ok=' + c.sha + '" target="_top">Aplicar</a>';
    }
  } catch (err) {
    html = '<h1>No se pudo</h1><pre>' + esc_(err.message) + '</pre>';
  }
  return HtmlService.createHtmlOutput('<style>body{font:17px -apple-system,system-ui,sans-serif;margin:24px;color:#111}h1{font-size:26px}.m{color:#666}pre{white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:10px}' +
    '.b{display:block;text-align:center;background:#1d4ed8;color:#fff;padding:16px;border-radius:12px;font-weight:600;text-decoration:none;margin-top:20px}</style>' + html)
    .setTitle('Actualizar ' + NOMBRE).addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Para correr desde el editor. */
function actualizar() { Logger.log(actualizar_().msg); }

function actualizar_() {
  const P = PropertiesService.getScriptProperties(), id = P.getProperty('APP_SCRIPT_ID');
  if (!id) throw new Error('Falta APP_SCRIPT_ID en las propiedades de la secuencia de comandos.');
  const c = ultimoCambio_(), code = gh_('Code.gs', c.sha), index = gh_('Index.html', c.sha);
  const cur = api_(id, 'get', '/content');
  const files = cur.files || [];
  const srv = files.find(f => f.type === 'SERVER_JS' && /function doGet\s*\(/.test(f.source)) || files.find(f => f.type === 'SERVER_JS' && /^(Code|Código)$/i.test(f.name));
  const htm = files.find(f => f.type === 'HTML' && /^index$/i.test(f.name)) || files.find(f => f.type === 'HTML');
  if (!srv || !htm) throw new Error('No encontré los archivos Code / Index en la app. Archivos: ' + files.map(f => f.name).join(', '));
  let nuevo = code;
  if (/const CRM = 'PEGÁ_ACÁ/.test(nuevo)) { const m = srv.source.match(/^const CRM = .*$/m); if (m) nuevo = nuevo.replace(/^const CRM = .*$/m, m[0]); }
  if (srv.source === nuevo && htm.source === index) return { igual: true, msg: 'La app ya tiene este cambio: ' + c.msg.split('\n')[0] };
  srv.source = nuevo; htm.source = index;
  api_(id, 'put', '/content', { files: files });
  const v = api_(id, 'post', '/versions', { description: (c.msg.split('\n')[0] || 'Actualización').slice(0, 90) });
  const deps = (api_(id, 'get', '/deployments').deployments || []).filter(d => d.deploymentConfig && d.deploymentConfig.versionNumber && (d.entryPoints || []).some(p => p.entryPointType === 'WEB_APP'));
  if (!deps.length) throw new Error('Guardé el código (versión ' + v.versionNumber + ') pero no encontré la implementación web para publicarla. Hacelo a mano: Implementar → Administrar implementaciones → lápiz → versión ' + v.versionNumber + '.');
  deps.forEach(d => api_(id, 'put', '/deployments/' + d.deploymentId, { deploymentConfig: { scriptId: id, versionNumber: v.versionNumber, manifestFileName: 'appsscript', description: d.deploymentConfig.description || NOMBRE } }));
  return { igual: false, msg: 'Publicada la versión ' + v.versionNumber + ': ' + c.msg.split('\n')[0] };
}

function ultimoCambio_() {
  const j = JSON.parse(ghFetch_('https://api.github.com/repos/' + REPO + '/commits/main', 'application/vnd.github+json'));
  return { sha: j.sha, msg: String(j.commit.message || '').replace(/\n*Co-Authored-By:[\s\S]*$/i, '').trim(), fecha: Utilities.formatDate(new Date(j.commit.committer.date), 'America/Argentina/Buenos_Aires', 'dd/MM HH:mm') };
}
function gh_(file, sha) { return ghFetch_('https://api.github.com/repos/' + REPO + '/contents/' + encodeURIComponent(file) + '?ref=' + sha, 'application/vnd.github.raw'); }
function ghFetch_(url, accept) {
  const tok = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!tok) throw new Error('Falta GITHUB_TOKEN en las propiedades de la secuencia de comandos.');
  const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + tok, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('GitHub respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  return r.getContentText();
}
function api_(id, method, path, body) {
  const o = { method: method, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + id + path, o), t = r.getContentText();
  if (r.getResponseCode() >= 300) throw new Error('Apps Script API ' + method.toUpperCase() + ' ' + path + ' (' + r.getResponseCode() + '): ' + t.slice(0, 600));
  return t ? JSON.parse(t) : {};
}
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
