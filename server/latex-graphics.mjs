import path from 'node:path';
import {realpath, stat} from 'node:fs/promises';

export function graphicDirectories(source) {
  const commands = [...source.matchAll(/\\graphicspath\s*\{((?:\s*\{[^{}]*\}\s*)+)\}/g)];
  return commands.flatMap(command => [...command[1].matchAll(/\{([^{}]*)\}/g)].map(match => match[1]));
}

export async function resolveLatexGraphic(sourcePath, reference, root, directories = []) {
  const actualRoot = await realpath(root);
  const bases = [path.dirname(sourcePath), root];
  const extensions = path.extname(reference) ? [''] : ['.pdf', '.png', '.jpg', '.jpeg', '.svg', '.webp'];
  const candidates = bases.flatMap(base => ['', ...directories].flatMap(directory => extensions.map(extension => path.resolve(base, directory, reference + extension))));
  for (const candidate of candidates) {
    if (candidate !== root && !candidate.startsWith(root + path.sep)) continue;
    try {
      const actual = await realpath(candidate);
      if ((actual === actualRoot || actual.startsWith(actualRoot + path.sep)) && (await stat(actual)).isFile()) return actual;
    } catch { /* Try the next project-contained location. */ }
  }
  throw new Error(`Included figure was not found inside the active project: ${reference}`);
}
