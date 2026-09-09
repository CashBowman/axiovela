const {contextBridge, ipcRenderer} = require('electron');
// No generic IPC, filesystem, shell, token, or provider-key API is exposed.
contextBridge.exposeInMainWorld('methodflowDesktop', Object.freeze({
  update: (action, value) => ipcRenderer.invoke('desktop:update', action, value),
  onUpdate: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:update-state', listener);
    return () => ipcRenderer.removeListener('desktop:update-state', listener);
  },
  onUpdateOpen: callback => {
    const listener = () => callback();
    ipcRenderer.on('desktop:update-open', listener);
    return () => ipcRenderer.removeListener('desktop:update-open', listener);
  },
  chooseData: directory => ipcRenderer.invoke('desktop:choose-data', directory),
  setupProvider: (id, action) => ipcRenderer.invoke('desktop:setup-provider', id, action),
  detectTools: () => ipcRenderer.invoke('desktop:detect-tools'),
  exportMarkdownPdf: url => ipcRenderer.invoke('desktop:export-markdown-pdf', url),
  chooseTool: key => ipcRenderer.invoke('desktop:choose-tool', key),
  chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
  onExampleRequest: callback => {
    const listener = () => callback();
    ipcRenderer.on('desktop:example-requested', listener);
    return () => ipcRenderer.removeListener('desktop:example-requested', listener);
  },
  createExample: () => ipcRenderer.invoke('desktop:create-example'),
}));
