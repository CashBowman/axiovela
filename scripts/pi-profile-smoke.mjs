// Optional real-runtime check. Install Pi separately; never reads user auth or
// sends a prompt/model request. WORKBENCH_PI_PATH may identify an exact version.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {RpcProcess} from '../server/assistant-runtime.mjs';
import {commandFor} from '../server/assistant-process.mjs';
import {researchProfiles, profileSkillPath} from '../server/research-profiles.mjs';
const cwd = await mkdtemp(path.join(os.tmpdir(), 'axiovela-pi-profile-'));
const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'SystemDrive', 'COMSPEC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, {HOME: cwd, USERPROFILE: cwd, APPDATA: path.join(cwd, 'AppData/Roaming'), LOCALAPPDATA: path.join(cwd, 'AppData/Local'), PI_CODING_AGENT_DIR: path.join(cwd, 'agent'), XDG_CONFIG_HOME: path.join(cwd, 'config'), XDG_CACHE_HOME: path.join(cwd, 'cache'), TERM: 'dumb'});
try {
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'PI_CODING_AGENT_DIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME']) await mkdir(env[key], {recursive: true});
  for (const profile of researchProfiles) {
    const skill = profileSkillPath(profile.id);
    const rpc = new RpcProcess(commandFor('pi'), ['--mode', 'rpc', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-approve', '--tools', 'read,grep,find,ls', '--no-session', '--offline', ...(skill ? ['--skill', skill] : [])], {cwd, env, protocol: 'pi'});
    try {
      const {commands} = await rpc.request('get_commands');
      assert.deepEqual(commands.filter(command => command.source === 'skill').map(command => command.name), skill ? [`skill:axiovela-${profile.id}`] : []);
      console.log(`Real Pi skill discovery passed: ${profile.id}.`);
    } finally { await rpc.close(); }
  }
  console.log('No model request was sent; user credentials and settings were not used.');
} finally { await rm(cwd, {recursive: true, force: true, maxRetries: 5, retryDelay: 200}); }
