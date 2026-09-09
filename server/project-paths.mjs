import {lstatSync} from 'node:fs';
import path from 'node:path';

export const credentialName = /^(\.git|\.env(?:\..*)?|\.codex|\.claude|\.gemini|\.pi|\.ssh|\.aws|\.azure|\.kube|\.npmrc|\.netrc|auth\.json|credentials\.json|providers\.json)$/i;

// The explicitly selected root may itself be a symlink. Descendants may not:
// otherwise ordinary project writes can overwrite unrelated host files.
export function containedProjectPath(root, name = '.') {
  if (!root) throw Object.assign(new Error('Choose or create a research project first'), {status: 409});
  if (typeof name !== 'string' || name.includes('\0') || path.isAbsolute(name) || name.split(/[\\/]/).some(part => part === '..' || credentialName.test(part))) throw new Error('Use a project-relative path; credentials and parent paths are not accessible.');
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, name);
  if (target !== absoluteRoot && !target.startsWith(absoluteRoot + path.sep)) throw new Error('Path is outside the project.');
  let current = absoluteRoot;
  for (const part of path.relative(absoluteRoot, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Symlinks are not accessible through project file tools.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
