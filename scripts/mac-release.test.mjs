import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import config from './mac-release-config.cjs';
import {assertMacDistribution, assertTamperRejected} from './mac-release-gate.mjs';
import {finalizeMacDmg} from './mac-finalize.mjs';

test('all Mac aliases require a usable signing/notarization configuration', () => {
  for (const prefix of ['AXIOVELA', 'HYPOTERA', 'METHODFLOW']) {
    const env = {[`${prefix}_MAC_NOTARIZE`]: '1'};
    assert.throws(() => config.macReleaseSettings(env), /Ad-hoc/);
    env[`${prefix}_MAC_SIGN`] = '1';
    assert.throws(() => config.macReleaseSettings(env), /certificate name/);
    env[`${prefix}_MAC_SIGN_IDENTITY`] = 'Developer ID Application: Fixture (TEST)';
    assert.throws(() => config.macReleaseSettings(env), /NOTARY_PROFILE/);
    env[`${prefix}_MAC_NOTARY_PROFILE`] = 'fixture';
    assert.equal(config.macReleaseSettings(env).notarize, true);
  }
  assert.equal(config.macReleaseSettings({}).sign, false);
  assert.equal(config.macReleaseSettings({AXIOVELA_MAC_SIGN: '0', METHODFLOW_MAC_SIGN: '1'}).sign, false);
});

const success = () => ({status: 0, output: ''});
const appReport = () => ({signature: success(), identity: {status: 0, output: 'Authority=Developer ID Application: Fixture\nTimestamp=now\nCodeDirectory flags=0x10000(runtime)'}, gatekeeper: success(), distribution: success()});
const report = () => ({...appReport(), quarantined: appReport(), container: {integrity: success(), signature: success(), staple: success()}});
test('distribution gate rejects every failed, missing or timed-out assessment, including quarantine', () => {
  assert.doesNotThrow(() => assertMacDistribution(report()));
  for (const section of ['installed', 'quarantined', 'container']) {
    const keys = section === 'container' ? ['integrity', 'signature', 'staple'] : ['signature', 'identity', 'gatekeeper', 'distribution'];
    for (const key of keys) for (const failure of [undefined, {status: 3}, {status: null, error: 'timeout'}, {status: 0, error: 'failed'}]) {
      const r = report(); (section === 'installed' ? r : r[section])[key] = failure;
      assert.throws(() => assertMacDistribution(r), /failed|complete/);
    }
  }
  const adhoc = report(); adhoc.quarantined.identity.output = 'Signature=adhoc';
  assert.throws(() => assertMacDistribution(adhoc), /Developer ID/);
});
test('tamper rejection requires actual invalid seal diagnostics', () => {
  assert.doesNotThrow(() => assertTamperRejected({status: 1, output: 'a sealed resource is missing or invalid'}));
  for (const result of [{status: 0}, {status: null}, {status: 1, output: 'command not found'}, {status: 1, output: 'a sealed resource is missing', error: 'timeout'}]) assert.throws(() => assertTamperRejected(result));
});
test('final DMG preparation requires accepted notary logs before stapling', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'axiovela-notary-test-'));
  try {
    const calls = [];
    const settings = {sign: true, notarize: true, identity: 'Developer ID Application: Fixture', credentials: {keychainProfile: 'fixture'}};
    let issues = null;
    const execute = (command, args) => {
      calls.push([command, ...args]);
      if (args[1] === 'submit') return JSON.stringify({id: 'abcd-1234', status: 'Accepted'});
      if (args[1] === 'log') return JSON.stringify({status: 'Accepted', issues});
      return '';
    };
    await finalizeMacDmg('/fixture/App.dmg', {settings, execute, diagnostics: temporary});
    assert.deepEqual(calls.map(c => c.slice(0, 3)), [['codesign','--force','--sign'], ['codesign','--verify','--strict'], ['xcrun','notarytool','submit'], ['xcrun','notarytool','log'], ['xcrun','stapler','staple'], ['xcrun','stapler','validate'], ['hdiutil','verify','/fixture/App.dmg']]);
    calls.length = 0; issues = [{severity: 'warning'}];
    await assert.rejects(finalizeMacDmg('/fixture/App.dmg', {settings, execute, diagnostics: temporary}), /reported issues/);
    assert.ok(!calls.some(c => c[1] === 'stapler'));
    calls.length = 0;
    await finalizeMacDmg('/fixture/App.dmg', {settings: {sign: false}, execute});
    assert.equal(calls.length, 0);
  } finally { await rm(temporary, {recursive: true, force: true}); }
});
