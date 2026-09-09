import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {setupCommand} = createRequire(import.meta.url)('../desktop/provider-setup.cjs');
test('setup actions reject arbitrary tools and shell text', () => {
  for (const id of ['__proto__', 'constructor', 'pi; touch /tmp/unsafe', '../../bin/sh', null]) assert.throws(() => setupCommand(id, 'install'));
  for (const action of ['exec', 'install; echo x', null]) assert.throws(() => setupCommand('pi', action));
  assert.throws(() => setupCommand('pi', 'integration'));
  assert.throws(() => setupCommand('herdr', 'login'));
});
test('fixed platform-specific setup and login commands', () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    assert.match(setupCommand('pi', 'install', platform), /--ignore-scripts @earendil-works\/pi-coding-agent@0.85.1$/);
    assert.equal(setupCommand('herdr', 'integration', platform), 'herdr integration install pi');
    assert.equal(setupCommand('pi', 'login', platform), platform === 'win32' ? 'pi.cmd' : 'pi');
    assert.match(setupCommand('herdr', 'install', platform), platform === 'win32' ? /install.ps1/ : /install.sh/);
  }
});
