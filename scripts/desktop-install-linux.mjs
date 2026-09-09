import {cp, mkdir, readFile, writeFile, access} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
if (process.platform !== 'linux') throw new Error('This per-user launcher installer is for Linux. Use the platform installer on Windows or macOS.');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const source = path.resolve(`out/Axiovela-linux-${process.arch}`);
await access(path.join(source, 'axiovela'));
const packagedVersion = JSON.parse(await readFile(path.join(source, 'resources/app/package.json'), 'utf8')).version;
if (packagedVersion !== pkg.version) throw new Error(`Packaged app is ${packagedVersion}, but the source is ${pkg.version}. Build or extract the matching package before installing; the launcher was not changed.`);
const base = process.env.XDG_DATA_HOME || path.join(homedir(), '.local/share');
const destination = path.join(base, 'axiovela', `desktop-${pkg.version}`);
await mkdir(path.dirname(destination), {recursive: true});
await cp(source, destination, {recursive: true, verbatimSymlinks: true});
const applications = path.join(base, 'applications');
await mkdir(applications, {recursive: true});
const escapeExec = value => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('`', '\\`').replaceAll('$', '\\$').replaceAll('%', '%%');
const desktop = `[Desktop Entry]\nType=Application\nName=Axiovela\nComment=Local research workspace\nExec="${escapeExec(path.join(destination, 'axiovela'))}"\nIcon=${path.join(destination, 'resources/app/desktop/icons/icon.png')}\nTerminal=false\nCategories=Science;Education;\nKeywords=Axiovela;research;science;modeling;statistics;\nStartupWMClass=axiovela\n`;
const launcher = path.join(applications, 'axiovela.desktop');
try { await cp(launcher, launcher + `.before-${pkg.version}`, {force: false, errorOnExist: true}); } catch (error) { if (!['ENOENT', 'EEXIST', 'ERR_FS_CP_EEXIST'].includes(error.code)) throw error; }
await writeFile(launcher, desktop, {mode: 0o644});
// Preserve old pins and the original launchers, without modifying custom entries.
for (const name of ['hypotera.desktop', 'methodflow.desktop']) {
  const legacyLauncher = path.join(applications, name);
  try {
    const legacy = await readFile(legacyLauncher, 'utf8');
    const generated = [['MethodFlow', 'methodflow'], ['Hypotera', 'hypotera'], ['Axiovela', 'axiovela']].some(([brand, wmClass]) => (legacy.includes(`Name=${brand} Beta\n`) || legacy.includes(`Name=${brand}\n`)) && legacy.includes(`StartupWMClass=${wmClass}\n`));
    if (generated && legacy.includes('resources/app/desktop/icons/icon.png')) {
      try { await cp(legacyLauncher, legacyLauncher + '.before-axiovela', {force: false, errorOnExist: true}); }
      catch (error) { if (!['EEXIST', 'ERR_FS_CP_EEXIST'].includes(error.code)) throw error; }
      await writeFile(legacyLauncher, desktop + 'NoDisplay=true\n', {mode: 0o644});
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// KDE search may retain the previous version even after the desktop file changes.
// Refresh both the installer locale and Plasma's locale (which can differ).
function refresh(command, args, env = process.env) {
  const result = spawnSync(command, args, {env, encoding: 'utf8', timeout: 15000});
  if (result.error?.code !== 'ENOENT' && (result.error || result.status !== 0)) console.warn(`Could not refresh ${command}; log out and back in if search shows an old version.`);
}
refresh('update-desktop-database', [applications]);
refresh('kbuildsycoca6', ['--noincremental']);
const localeResult = spawnSync('kreadconfig6', ['--file', 'plasma-localerc', '--group', 'Formats', '--key', 'LANG'], {encoding: 'utf8', timeout: 5000});
const desktopLocale = localeResult.stdout?.trim();
if (desktopLocale && /^[A-Za-z0-9_.@-]+$/.test(desktopLocale)) {
  refresh('kbuildsycoca6', ['--noincremental'], {...process.env, LANG: desktopLocale, LC_ALL: desktopLocale, LANGUAGE: desktopLocale.split('.')[0]});
}

console.log(`Installed Axiovela in your application menu. Pin it from your desktop's launcher.\nApplication: ${destination}\nLauncher: ${launcher}\nTo uninstall this version, remove those two paths and any methodflow.desktop compatibility alias in the same launcher directory. Research projects and your app profile are kept separately.`);
