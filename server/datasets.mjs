import {randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, rename, realpath, open, rm, lstat, readdir} from 'node:fs/promises';
import path from 'node:path';
import {constants} from 'node:fs';
import {pipeline, finished} from 'node:stream/promises';
import {Transform} from 'node:stream';
import Busboy from 'busboy';
import {projectFile} from './assistant-api.mjs';
import {credentialName} from './project-paths.mjs';

const textData = /\.(csv|tsv|json|jsonl|ndjson|txt|md|markdown|ya?ml|xml|tex|py|[cm]?js|ts|sh|sql|log)$/i;
const secretPath = {test: value => String(value).split(/[\\/]/).some(part => credentialName.test(part))};
const uploadLimit = 10 * 1024 * 1024;
let queue = Promise.resolve();
const serialize = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };

export async function listDatasets(root) {
  if (!root) return [];
  try {
    const catalog = JSON.parse(await readFile(await projectFile(root, 'datasets/catalog.json'), 'utf8'));
    return Array.isArray(catalog.datasets) ? catalog.datasets.filter(item => item && typeof item.id === 'string' && /^datasets\/[a-f0-9-]{36}\//.test(item.path)) : [];
  } catch (error) { if (error.code === 'ENOENT') return []; throw new Error('Dataset catalog is invalid or inaccessible. Restore datasets/catalog.json before importing data.'); }
}
async function saveCatalog(root, datasets) {
  const destination = await projectFile(root, 'datasets/catalog.json', true);
  await mkdir(path.dirname(destination), {recursive: true});
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({schemaVersion: 'workbench.datasets/v1', datasets}, null, 2) + '\n');
  await rename(temporary, destination);
}

function safeName(value) {
  if (typeof value !== 'string' || !value || value === '.' || value === '..' || /[\\/\x00-\x1f<>:"|?*]/.test(value) || secretPath.test(value)) throw new Error('Choose a regular data file or folder, not a credential or configuration file.');
  return value;
}

async function importTransaction(root, name, work) {
  if (!root) throw Object.assign(new Error('Choose a project first.'), {status: 409});
  safeName(name);
  const datasets = await listDatasets(root);
  const id = randomUUID();
  const relative = `datasets/${id}/${name}`;
  const container = await projectFile(root, `datasets/${id}`, true);
  await mkdir(container, {recursive: true});
  try {
    const details = await work(path.join(container, name));
    const dataset = {id, name, path: relative, format: path.extname(name).slice(1).toLowerCase() || 'file', createdAt: new Date().toISOString(), ...details};
    await saveCatalog(root, [...datasets, dataset]);
    return dataset;
  } catch (error) { await rm(container, {recursive: true, force: true}); throw error; }
}

export function addDataset(root, body) {
  return serialize(async () => {
    if (!root) throw Object.assign(new Error('Choose a project first.'), {status: 409});
    if (body.sourcePath === undefined) {
      // Legacy JSON clients remain bounded; current pickers use streaming multipart.
      if (typeof body.data !== 'string' || body.data.length > Math.ceil(uploadLimit / 3) * 4 || body.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.data)) throw new Error('Invalid base64 data. Use the streaming upload endpoint for large files.');
      const data = Buffer.from(body.data, 'base64');
      if (data.length > uploadLimit || data.toString('base64') !== body.data) throw new Error('Upload a valid base64 data file.');
      return importTransaction(root, body.name, async destination => { await writeFile(destination, data, {flag: 'wx'}); return {bytes: data.length, storage: 'upload'}; });
    }
    if (typeof body.sourcePath !== 'string' || !path.isAbsolute(body.sourcePath) || secretPath.test(body.sourcePath)) throw new Error('Use an absolute data path, not a credential path.');
    const source = await realpath(body.sourcePath);
    if (secretPath.test(source)) throw new Error('Credential directories cannot be imported.');
    const sourceInfo = await lstat(body.sourcePath);
    if (sourceInfo.isSymbolicLink()) throw new Error('Choose the original file or folder, not a symbolic link.');
    if (sourceInfo.isDirectory()) {
      const actualRoot = await realpath(root);
      const relativeRoot = path.relative(source, actualRoot);
      if (!relativeRoot || (!relativeRoot.startsWith('..' + path.sep) && relativeRoot !== '..' && !path.isAbsolute(relativeRoot))) throw new Error('Choose a data subfolder, not the project itself or a folder containing it.');
      const relativeData = path.relative(path.join(actualRoot, 'datasets'), source);
      if (!relativeData || (!relativeData.startsWith('..' + path.sep) && relativeData !== '..' && !path.isAbsolute(relativeData))) throw new Error('This folder is already inside workspace datasets.');
    }
    return importTransaction(root, path.basename(source), async destination => {
      let bytes = 0, fileCount = 0, skipped = 0;
      const copy = async (from, to) => {
        const info = await lstat(from);
        if (secretPath.test(path.basename(from)) || info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) { skipped++; return; }
        safeName(path.basename(from));
        if (info.isDirectory()) {
          await mkdir(to);
          for (const name of await readdir(from)) await copy(path.join(from, name), path.join(to, name));
        } else {
          const input = await open(from, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
          try {
            if (!(await input.stat()).isFile()) throw new Error('Only regular files can be imported.');
            const output = await open(to, 'wx');
            await pipeline(input.createReadStream(), new Transform({transform(chunk, encoding, done) { bytes += chunk.length; done(null, chunk); }}), output.createWriteStream());
            fileCount++;
          } finally { await input.close(); }
        }
      };
      await copy(source, destination);
      if (!sourceInfo.isDirectory() && !fileCount) throw new Error('Only regular files and folders can be imported.');
      return {bytes, fileCount, skipped, storage: 'import', ...(sourceInfo.isDirectory() ? {format: 'folder', kind: 'directory'} : {})};
    });
  });
}

// Multipart streams directly to disk, independent of file size and JSON limits.
// A folder is one catalog entry and retains its relative directory structure.
export function uploadDataset(root, request, name, folder = false) {
  return serialize(() => importTransaction(root, name, async destination => {
    if (request.destroyed || request.aborted) throw new Error('Upload interrupted. Please select the files again.');
    if (folder) await mkdir(destination);
    let bytes = 0, fileCount = 0, skipped = 0, seen = 0;
    const writes = [];
    const parser = Busboy({headers: request.headers, preservePath: true});
    parser.on('file', (_field, stream, info) => {
      seen++;
      const work = (async () => {
        const relative = decodeURIComponent(info.filename);
        const parts = relative.split('/');
        if (!folder && seen > 1) throw new Error('Choose folder mode for multiple files.');
        if (parts.some(part => credentialName.test(part))) { skipped++; stream.resume(); return; }
        parts.forEach(safeName);
        const target = folder ? path.join(destination, ...parts) : destination;
        await mkdir(path.dirname(target), {recursive: true});
        const output = await open(target, 'wx');
        await pipeline(stream, new Transform({transform(chunk, encoding, done) { bytes += chunk.length; done(null, chunk); }}), output.createWriteStream());
        fileCount++;
      })();
      writes.push(work);
      work.catch(error => { stream.resume(); parser.destroy(error); });
    });
    try {
      const aborted = () => parser.destroy(new Error('Upload interrupted. Please select the files again.'));
      request.once('aborted', aborted);
      request.once('error', aborted);
      try { request.pipe(parser); await finished(parser); }
      finally { request.off('aborted', aborted); request.off('error', aborted); request.unpipe(parser); request.resume(); }
      await Promise.all(writes);
      if (!fileCount) throw new Error('No importable files were selected. Credential files are excluded.');
      return {bytes, fileCount, skipped, storage: 'upload', ...(folder ? {format: 'folder', kind: 'directory'} : {})};
    } finally { await Promise.allSettled(writes); }
  }));
}

export function removeDataset(root, id) {
  return serialize(async () => { const datasets = await listDatasets(root); await saveCatalog(root, datasets.filter(item => item.id !== id)); return {removed: datasets.some(item => item.id === id), filesPreserved: true}; });
}
export async function previewDataset(root, id) {
  const dataset = (await listDatasets(root)).find(item => item.id === id);
  if (!dataset) throw Object.assign(new Error('Dataset not found.'), {status: 404});
  const file = await projectFile(root, dataset.path);
  if (dataset.kind === 'directory') return {dataset, text: null, note: `Folder containing ${dataset.fileCount} files. Relative paths are preserved; ask the assistant to inspect the workspace copy.`};
  if (!textData.test(dataset.name)) return {dataset, text: null, note: 'Text preview is unavailable for this format. Ask the assistant to inspect the workspace copy with an appropriate reader.'};
  const handle = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(65536);
    const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
    return {dataset, text: buffer.subarray(0, bytesRead).toString('utf8'), truncated: (await handle.stat()).size > bytesRead};
  } finally { await handle.close(); }
}
