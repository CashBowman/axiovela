import {spawnSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import config from './mac-release-config.cjs';

// Never include argv in an error: notarytool may receive a password from env.
function run(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 1200000, maxBuffer: 8 * 1024 * 1024});
  if (result.error || result.status !== 0) throw new Error(`${command} could not complete Mac distribution preparation (status ${result.status ?? 'unavailable'}). Check signing/notary credentials and rerun; no distribution approval was granted.`);
  return result.stdout;
}

export async function finalizeMacDmg(dmg, {settings = config.macReleaseSettings(), execute = run, diagnostics = path.join(path.dirname(dmg), 'notary')} = {}) {
  if (!settings.sign) return;
  execute('codesign', ['--force', '--sign', settings.identity, '--timestamp', dmg]);
  execute('codesign', ['--verify', '--strict', dmg]);
  if (!settings.notarize) return;
  const c = settings.credentials;
  const authentication = c.keychainProfile ? ['--keychain-profile', c.keychainProfile] : ['--apple-id', c.appleId, '--password', c.appleIdPassword, '--team-id', c.teamId];
  const submission = JSON.parse(execute('xcrun', ['notarytool', 'submit', dmg, ...authentication, '--wait', '--output-format', 'json']));
  await mkdir(diagnostics, {recursive: true});
  await writeFile(path.join(diagnostics, path.basename(dmg) + '.submission.json'), JSON.stringify(submission, null, 2) + '\n');
  if (typeof submission.id !== 'string' || !/^[a-f0-9-]+$/i.test(submission.id)) throw new Error('Notary submission did not return an ID.');
  const log = JSON.parse(execute('xcrun', ['notarytool', 'log', submission.id, ...authentication]));
  await writeFile(path.join(diagnostics, path.basename(dmg) + '.log.json'), JSON.stringify(log, null, 2) + '\n');
  if (submission.status !== 'Accepted' || log.status !== 'Accepted' || (log.issues && log.issues.length)) throw new Error('Notarization failed or reported issues. Review the retained notary log before distribution.');
  execute('xcrun', ['stapler', 'staple', dmg]);
  execute('xcrun', ['stapler', 'validate', dmg]);
  execute('hdiutil', ['verify', dmg]);
}
