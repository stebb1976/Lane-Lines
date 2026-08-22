const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = __dirname;
const defaultDataDir = path.join(root, 'data');
const configFile = path.join(root, '.lane-lines-settings.json');
const port = Number(process.env.PORT) || 8124;
const files = {
  library: ['lane-lines-workout-library.json', 'sets'],
  schedule: ['lane-lines-scheduled-workouts.json', 'scheduledWorkouts']
};
const contentTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const noStoreExtensions = new Set(['.html', '.js', '.css']);

function json(res, status, body) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

function configuredDataDir() {
  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (typeof config.saveFolder === 'string' && path.isAbsolute(config.saveFolder)) return config.saveFolder;
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not read ${path.basename(configFile)}: ${error.message}`);
  }
  return defaultDataDir;
}

function validateSaveFolder(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter an absolute folder path.');
  if (value.includes('\0') || !path.isAbsolute(value.trim())) throw new Error('The save folder must be an absolute path.');
  const requested = path.resolve(value.trim());
  fs.mkdirSync(requested, {recursive:true});
  const resolved = fs.realpathSync(requested);
  if (!fs.statSync(resolved).isDirectory()) throw new Error('The save location must be a folder.');
  fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK);
  return resolved;
}

function persistSaveFolder(value) {
  const saveFolder = validateSaveFolder(value);
  const temporary = `${configFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({saveFolder}, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, configFile);
  return saveFolder;
}

function readBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 10_000_000) req.destroy();
  });
  req.on('end', () => {
    try { callback(JSON.parse(body || '{}')); }
    catch (error) { callback(undefined, error); }
  });
}

function saveSettings(req, res) {
  readBody(req, (payload, parseError) => {
    try {
      if (parseError) throw parseError;
      const saveFolder = persistSaveFolder(payload.saveFolder);
      json(res, 200, {saved:true, saveFolder, isDefault:saveFolder === defaultDataDir});
    } catch (error) {
      json(res, 400, {saved:false, error:`Could not use that save folder: ${error.message}`});
    }
  });
}

function chooseSaveFolder(res) {
  if (process.platform !== 'darwin') return json(res, 501, {selected:false, error:'The Browse button is only available on macOS. Enter an absolute folder path instead.'});
  const script = ['set selectedFolder to choose folder with prompt "Choose where Lane Lines should save workout JSON files"','return POSIX path of selectedFolder'].join('\n');
  const child = spawn('osascript', ['-e', script]);
  let stdout = '', stderr = '', answered = false;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.once('error', error => {
    if (answered) return;
    answered = true;
    json(res, 500, {selected:false, error:`Could not open the folder chooser: ${error.message}`});
  });
  child.once('close', code => {
    if (answered) return;
    answered = true;
    if (code !== 0) {
      const detail = stderr.trim();
      const cancelled = /user canceled|cancelled|\(-128\)/i.test(detail);
      if (cancelled) return json(res, 200, {selected:false, cancelled:true});
      const permissionDenied = /not authorized|not permitted|permission|privacy|automation|\(-1743\)/i.test(detail);
      const error = permissionDenied
        ? 'macOS blocked the folder chooser. Allow your terminal or Node launcher under System Settings → Privacy & Security → Automation, then try Browse… again. You can still use Save typed path.'
        : `The macOS folder chooser failed${detail ? `: ${detail}` : '.'} The current save folder was not changed; you can use Save typed path instead.`;
      return json(res, 500, {selected:false, cancelled:false, error});
    }
    try {
      const saveFolder = persistSaveFolder(stdout.trim());
      json(res, 200, {selected:true, saved:true, saveFolder, isDefault:saveFolder === defaultDataDir});
    } catch (error) {
      json(res, 400, {selected:false, error:`Could not use the selected folder: ${error.message}`});
    }
  });
}

function openSaveFolder(res) {
  try {
    const saveFolder = validateSaveFolder(configuredDataDir());
    if (process.platform !== 'darwin') throw new Error('Opening the folder automatically is only available on macOS.');
    const child = spawn('open', [saveFolder], {detached:true, stdio:'ignore'});
    let answered = false;
    child.once('error', error => {
      if (answered) return;
      answered = true;
      json(res, 500, {opened:false, error:`Could not open the folder in Finder: ${error.message}`});
    });
    child.once('spawn', () => {
      if (answered) return;
      answered = true;
      child.unref();
      json(res, 200, {opened:true, saveFolder});
    });
  } catch (error) {
    json(res, 400, {opened:false, error:error.message});
  }
}

function saveFiles(req, res) {
  readBody(req, (payload, parseError) => {
    try {
      if (parseError) throw parseError;
      if (!payload.library) throw new Error('Workout Library data is required.');
      const entries = Object.entries(files).filter(([type]) => payload[type] !== undefined);
      for (const [type, [, property]] of entries) {
        if (!payload[type] || !Array.isArray(payload[type][property])) throw new Error(`Invalid ${type} data.`);
      }
      const dataDir = validateSaveFolder(configuredDataDir());
      const written = [];
      for (const [type, [name]] of entries) {
        const target = path.join(dataDir, name);
        const temporary = `${target}.tmp`;
        fs.writeFileSync(temporary, `${JSON.stringify(payload[type], null, 2)}\n`, 'utf8');
        fs.renameSync(temporary, target);
        written.push(target);
      }
      json(res, 200, {saved:true, saveFolder:dataDir, files:written});
    } catch (error) {
      json(res, 400, {saved:false, error:error.message});
    }
  });
}

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/save-settings') {
    const saveFolder = configuredDataDir();
    return json(res, 200, {saveFolder, isDefault:saveFolder === defaultDataDir});
  }
  if (req.method === 'POST' && req.url === '/api/save-settings') return saveSettings(req, res);
  if (req.method === 'POST' && req.url === '/api/choose-save-folder') return chooseSaveFolder(res);
  if (req.method === 'POST' && req.url === '/api/open-save-folder') return openSaveFolder(res);
  if (req.method === 'POST' && req.url === '/api/save-workout-files') return saveFiles(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {error:'Method not allowed'});
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = path.resolve(root, requested);
  if (!target.startsWith(`${root}${path.sep}`) || target.startsWith(`${defaultDataDir}${path.sep}`)) return json(res, 404, {error:'Not found'});
  fs.readFile(target, (error, contents) => {
    if (error) return json(res, 404, {error:'Not found'});
    const extension = path.extname(target);
    const headers = {'Content-Type':contentTypes[extension] || 'application/octet-stream'};
    if (noStoreExtensions.has(extension) || path.basename(target) === 'sw.js') headers['Cache-Control'] = 'no-store, max-age=0';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : contents);
  });
}).listen(port, '127.0.0.1', () => console.log(`Lane Lines local app: http://127.0.0.1:${port}`));
