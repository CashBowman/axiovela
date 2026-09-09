const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const toolKeys = ['LATEX', 'CODEX', 'CLAUDE', 'GEMINI', 'PI', 'OPENCODE', 'HERDR'];
function toolEnvironment(env, settings = {}, {home = os.homedir(), platform = process.platform, root = path.resolve(__dirname, '..')} = {}) {
  if (!settings || typeof settings !== 'object') settings = {};
  const p = platform === 'win32' ? path.win32 : path.posix;
  const delimiter = platform === 'win32' ? ';' : ':';
  const existingKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  const common = platform === 'win32'
    ? [p.join(env.APPDATA || p.join(home, 'AppData', 'Roaming'), 'npm'), p.join(home, '.local', 'bin'), p.join(home, 'scoop', 'shims')]
    : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/Library/TeX/texbin', p.join(home, '.local/bin'), p.join(home, '.cargo/bin'), p.join(home, '.npm-global/bin'), p.join(home, '.volta/bin'), p.join(home, 'miniforge3/bin'), p.join(home, 'miniconda3/bin'), p.join(home, 'anaconda3/bin')];
  const directories = [...(Array.isArray(settings.directories) ? settings.directories : []).filter(value => typeof value === 'string' && p.isAbsolute(value)), ...(env[existingKey] || '').split(delimiter), ...common].filter(value => value && p.isAbsolute(value));
  const result = {...env};
  delete result[existingKey];
  result.PATH = [...new Set(directories)].join(delimiter);
  for (const key of toolKeys) {
    const value = settings[key];
    if (typeof value === 'string' && p.isAbsolute(value)) result[`WORKBENCH_${key}_PATH`] = value;
  }
  const bundled = p.join(root, 'desktop', 'tools', platform === 'win32' ? 'tectonic.exe' : 'tectonic');
  if (!result.WORKBENCH_LATEX_PATH && fs.existsSync(bundled)) result.WORKBENCH_LATEX_PATH = bundled;
  if (result.WORKBENCH_LATEX_PATH) result.PATH = [p.dirname(result.WORKBENCH_LATEX_PATH), result.PATH].join(delimiter);
  return result;
}
function toolStatus(env) {
  const entries = [['LaTeX (Tectonic)', env.WORKBENCH_LATEX_PATH || 'tectonic'], ['Python', 'python3'], ['Python (Windows/Conda)', 'python'], ['Git', 'git'], ['SSH', 'ssh'], ['Podman', 'podman'], ['Docker', 'docker'], ...toolKeys.filter(key => key !== 'LATEX').map(key => [key.toLowerCase(), env[`WORKBENCH_${key}_PATH`] || key.toLowerCase()])];
  return entries.map(([name, command]) => {
    const candidates = path.isAbsolute(command) ? [command] : (env.PATH || '').split(path.delimiter).flatMap(directory => (process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']).map(extension => path.join(directory, command + extension)));
    const found = candidates.find(candidate => { try { fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); return fs.statSync(candidate).isFile(); } catch { return false; } });
    return `${name}: ${found || 'Not found'}`;
  }).join('\n');
}
module.exports = {toolEnvironment, toolKeys, toolStatus};
