const {readdir, access} = require('node:fs/promises');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

// Sharp supports several package-manager layouts. A distributable bundle has
// just one; unused LC_RPATH entries trigger Gatekeeper's dangling-path checks.
async function prepareMacRpaths(buildPath, _version, platform, arch) {
  if (platform !== 'darwin') return;
  const directory = path.join(buildPath, `node_modules/@img/sharp-darwin-${arch}/lib`);
  const binaryName = (await readdir(directory)).find(name => name.endsWith('.node'));
  if (!binaryName) throw new Error('Packaged Sharp native module is missing');
  const binary = path.join(directory, binaryName);
  const listing = execFileSync('otool', ['-l', binary], {encoding: 'utf8'});
  const paths = [...listing.matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.+) \(offset \d+\)/g)].map(match => match[1]);
  if (!paths.length) throw new Error('Sharp has no library search path');
  const retained = [];
  for (const entry of paths) {
    if (!entry.startsWith('@loader_path/')) throw new Error(`Unexpected Sharp search path: ${entry}`);
    const resolved = path.resolve(directory, entry.slice('@loader_path/'.length));
    let keep = resolved.startsWith(path.resolve(buildPath) + path.sep);
    try {
      await access(resolved);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      keep = false;
    }
    if (keep) retained.push(entry);
    else {
      execFileSync('install_name_tool', ['-delete_rpath', entry, binary], {stdio: 'inherit'});
      console.log(`Removed unused Sharp library search path: ${entry}`);
    }
  }
  if (!retained.length) throw new Error('No bundled Sharp library directory remains');
}

module.exports = {prepareMacRpaths};
