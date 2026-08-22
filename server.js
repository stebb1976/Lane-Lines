const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = __dirname;
const configFile = path.join(root, 'll_project.json');
const port = Number(process.env.PORT) || 8124;
const dataFiles = {
  library: ['ll_workouts.json', 'sets'],
  drills: ['ll_drills.json', 'drills'],
  blocks: ['ll_blocks.json', 'blocks'],
  log: ['ll_log.json', 'logs'],
  schedule: ['ll_schedule.json', 'scheduledWorkouts']
};
const contentTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};

function json(res, status, body) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

function readProjectConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`Could not read ll_project.json: ${error.message}`);
    return {};
  }
}

function writeProjectConfig(config) {
  const temporary = `${configFile}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, {encoding:'utf8', mode:0o600});
  fs.renameSync(temporary, configFile);
  fs.chmodSync(configFile, 0o600);
}

function validateDataStore(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || !path.isAbsolute(value.trim())) throw new Error('The data store location must be an absolute folder path.');
  const resolved = fs.realpathSync(value.trim());
  if (!fs.statSync(resolved).isDirectory()) throw new Error('The data store location must be a folder.');
  fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK);
  return resolved;
}

function configuredDataStore() {
  const configured = readProjectConfig().dataStorePath;
  if (!configured) throw new Error('Select Data Store Location');
  return validateDataStore(configured);
}

function persistDataStore(value) {
  const dataStorePath = validateDataStore(value);
  const config = {...readProjectConfig(), dataStorePath};
  writeProjectConfig(config);
  return dataStorePath;
}

function saveGitHubSettings(req, res) {
  readBody(req).then(payload => {
    const repository = String(payload.repository || '').trim();
    const branch = String(payload.branch || 'main').trim() || 'main';
    const token = String(payload.token || '').trim();
    if (!repository || !token || repository.length > 500 || branch.length > 200 || token.length > 500) throw new Error('A repository URL, branch, and access token are required.');
    writeProjectConfig({...readProjectConfig(), githubSettings:{repository, branch, token}});
    json(res, 200, {saved:true});
  }).catch(error => json(res, 400, {saved:false,error:error.message}));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10_000_000) reject(new Error('Request is too large.')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

function chooseDataStore(res) {
  if (process.platform !== 'darwin') return json(res, 501, {selected:false,error:'Folder browsing is currently available on macOS only.'});
  const script = ['set selectedFolder to choose folder with prompt "Choose the Lane Lines data store location"','return POSIX path of selectedFolder'].join('\n');
  const child = spawn('osascript', ['-e', script]);
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.once('error', error => json(res, 500, {selected:false,error:error.message}));
  child.once('close', code => {
    if (code !== 0) {
      if (/user canceled|cancelled|\(-128\)/i.test(stderr)) return json(res, 200, {selected:false,cancelled:true});
      return json(res, 500, {selected:false,error:`Could not select the folder${stderr.trim() ? `: ${stderr.trim()}` : '.'}`});
    }
    try { json(res, 200, {selected:true,dataStorePath:persistDataStore(stdout.trim())}); }
    catch (error) { json(res, 400, {selected:false,error:error.message}); }
  });
}

async function saveData(req, res) {
  try {
    const payload = await readBody(req);
    const dataStorePath = configuredDataStore();
    const written = [];
    for (const [type, [name, property]] of Object.entries(dataFiles)) {
      if (!(type in payload)) continue;
      const values = payload[type]?.[property];
      if (!Array.isArray(values)) throw new Error(`${name} requires a ${property} array.`);
      const target = path.join(dataStorePath, name), temporary = `${target}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(payload[type], null, 2)}\n`, 'utf8');
      fs.renameSync(temporary, target);
      written.push(name);
    }
    json(res, 200, {saved:true,dataStorePath,written});
  } catch (error) { json(res, 400, {saved:false,error:error.message}); }
}

function loadData(res) {
  try {
    const dataStorePath = configuredDataStore(), data = {};
    for (const [type, [name, property]] of Object.entries(dataFiles)) {
      const target = path.join(dataStorePath, name);
      if (!fs.existsSync(target)) continue;
      const payload = JSON.parse(fs.readFileSync(target, 'utf8'));
      const values = Array.isArray(payload) ? payload : payload[property];
      if (!Array.isArray(values)) throw new Error(`${name} does not contain a valid ${property} array.`);
      data[type] = values;
    }
    json(res, 200, {loaded:true,dataStorePath,data});
  } catch (error) { json(res, 400, {loaded:false,error:error.message}); }
}

http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (req.method === 'GET' && pathname === '/api/project-config') return json(res, 200, readProjectConfig());
  if (req.method === 'POST' && pathname === '/api/github-settings') return saveGitHubSettings(req, res);
  if (req.method === 'POST' && pathname === '/api/browse-data-store') return chooseDataStore(res);
  if (req.method === 'POST' && pathname === '/api/data') return saveData(req, res);
  if (req.method === 'GET' && pathname === '/api/data') return loadData(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {error:'Method not allowed'});
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const target = path.resolve(root, requested);
  if (!target.startsWith(`${root}${path.sep}`) || target === configFile) return json(res, 404, {error:'Not found'});
  fs.readFile(target, (error, contents) => {
    if (error) return json(res, 404, {error:'Not found'});
    const headers = {'Content-Type':contentTypes[path.extname(target)] || 'application/octet-stream'};
    if (/\.(html|js|css)$/.test(target) || path.basename(target) === 'sw.js') headers['Cache-Control'] = 'no-store, max-age=0';
    res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : contents);
  });
}).listen(port, '127.0.0.1', () => console.log(`Lane Lines local app: http://127.0.0.1:${port}`));
