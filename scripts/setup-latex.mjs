import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const environment = path.join(repoRoot, '.workbench-tools', 'tectonic');
const executable = path.join(environment, process.platform === 'win32' ? 'Scripts/tectonic.exe' : 'bin/tectonic');
if (existsSync(executable)) {
  console.log(`Tectonic is ready: ${executable}`);
  process.exit(0);
}
const conda = process.platform === 'win32' ? 'conda.exe' : 'conda';
console.log('Installing the Tectonic LaTeX engine into .workbench-tools/tectonic…');
const child = spawn(conda, ['create', '-y', '-p', environment, '-c', 'conda-forge', 'tectonic=0.17.0'], {cwd: repoRoot, stdio: 'inherit'});
child.on('error', error => {
  console.error(`Could not start Conda: ${error.message}\nInstall Tectonic manually and set WORKBENCH_LATEX_PATH to its executable.`);
  process.exit(1);
});
child.on('close', code => process.exit(code ?? 1));
