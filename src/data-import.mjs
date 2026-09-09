// Native selections copy locally; browser File objects stream without base64 buffering.
export async function importData(apiRequest, selection, progress = () => {}) {
  const results = [];
  const {root: projectRoot} = await apiRequest('/api/project');
  if (!projectRoot) throw new Error('Choose a project first.');
  if (selection.paths) {
    for (const sourcePath of selection.paths) {
      progress(`Copying ${sourcePath.split(/[\\/]/).at(-1)}…`);
      results.push((await apiRequest('/api/datasets', {method: 'POST', body: JSON.stringify({sourcePath, projectRoot})})).dataset);
    }
  } else {
    const files = [...selection.files];
    const groups = selection.folder ? [files] : files.map(file => [file]);
    for (const group of groups) {
      const name = selection.folder ? group[0].webkitRelativePath.split('/')[0] : group[0].name;
      progress(`Importing ${name}…`);
      const body = new FormData();
      for (const file of group) {
        const relative = selection.folder ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name;
        body.append('files', file, encodeURIComponent(relative));
      }
      results.push((await apiRequest(`/api/datasets/upload?projectRoot=${encodeURIComponent(projectRoot)}&name=${encodeURIComponent(name)}${selection.folder ? '&folder=1' : ''}`, {method: 'POST', body})).dataset);
    }
  }
  return results;
}

export function importSummary(items) {
  const skipped = items.reduce((sum, item) => sum + (item.skipped || 0), 0);
  return `${items.length} item${items.length === 1 ? '' : 's'} added to workspace datasets.${skipped ? ` Skipped ${skipped} credential paths, symbolic links, or special files.` : ''}`;
}
