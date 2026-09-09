import {spawnSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function macCheck(command, args) {
  const r = spawnSync(command, args, {encoding: 'utf8', timeout: 120000});
  return {status: r.status, output: `${r.stdout || ''}${r.stderr || ''}`, error: r.error?.message};
}

export function inspectMacContainer(dmg) {
  return {
    integrity: macCheck('hdiutil', ['verify', dmg]),
    signature: macCheck('codesign', ['--verify', '--strict', '--verbose=4', dmg]),
    staple: macCheck('xcrun', ['stapler', 'validate', dmg]),
  };
}

export function inspectMacTrust(app) {
  const check = macCheck;
  return {
    signature: check('codesign', ['--verify', '--deep', '--strict', '--verbose=4', app]),
    identity: check('codesign', ['--display', '--verbose=4', app]),
    gatekeeper: check('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]),
    distribution: check('syspolicy_check', ['distribution', app]),
    xprotectLog: check('log', ['show', '--last', '2m', '--style', 'compact', '--predicate', 'process == "XprotectService" OR eventMessage CONTAINS "rPathCmd" OR eventMessage CONTAINS "loadCmd"']),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [app, output] = process.argv.slice(2);
  if (process.platform !== 'darwin' || !app || !output) throw new Error('Usage on macOS: mac-trust-report.mjs App.app report.json');
  const report = inspectMacTrust(app);
  await mkdir(path.dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
