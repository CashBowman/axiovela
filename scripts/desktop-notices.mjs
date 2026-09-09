import {readdir, readFile, mkdir, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
const modules = path.resolve('node_modules');
const destination = path.resolve('desktop/third-party-licenses');
await rm(destination, {recursive: true, force: true});
await mkdir(destination, {recursive: true});
const packages = [];
for (const entry of await readdir(modules, {withFileTypes: true})) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  if (entry.name.startsWith('@')) for (const child of await readdir(path.join(modules, entry.name))) packages.push(`${entry.name}/${child}`);
  else packages.push(entry.name);
}
const index = [];
for (const name of packages.sort()) {
  const directory = path.join(modules, name);
  let pkg;
  try { pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')); } catch { continue; }
  const licenses = (await readdir(directory)).filter(file => /^(?:licen[cs]e|copying|notice|ofl)(?:[._-]|$)/i.test(file));
  const record = {name: pkg.name, version: pkg.version, license: pkg.license || 'See package notices', files: []};
  for (const file of licenses) {
    const target = `${name.replaceAll('/', '__')}-${file}`;
    try { await writeFile(path.join(destination, target), await readFile(path.join(directory, file))); record.files.push(target); } catch (error) { if (error.code !== 'EISDIR') throw error; }
  }
  index.push(record);
}
await writeFile(path.join(destination, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Included license metadata for ${index.length} runtime, UI, font, and build packages.`);
