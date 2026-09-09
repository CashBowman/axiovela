function attachWindowRecovery(window, {dialog, isStopping, quit}) {
  let pending = false;
  const recover = async (reason = 'manual') => {
    if (pending || isStopping() || window.isDestroyed()) return;
    pending = true;
    const hung = reason === 'unresponsive';
    try {
      const {response} = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Recover Axiovela',
        message: hung ? 'The workspace is not responding.' : reason === 'manual' ? 'Reload the workspace?' : 'The workspace stopped displaying.',
        detail: 'Saved project files stay on disk and local tasks continue during reload. Unsaved edits may be recovered when the workspace reopens. Quit stops local tasks.',
        buttons: hung ? ['Keep waiting', 'Reload workspace', 'Quit Axiovela'] : ['Reload workspace', 'Quit Axiovela'],
        defaultId: 0, cancelId: hung ? 0 : 1,
      });
      if (window.isDestroyed() || isStopping()) return;
      if (response === (hung ? 1 : 0)) window.webContents.reload();
      else if (response === (hung ? 2 : 1)) quit();
    } catch {
      // Native dialog failure must not become an unhandled rejection.
      console.error('Workspace recovery could not open. Quit and reopen Axiovela.');
    } finally { pending = false; }
  };
  window.webContents.on('render-process-gone', (_event, details) => { if (details.reason !== 'clean-exit') void recover(details.reason); });
  window.on('unresponsive', () => { void recover('unresponsive'); });
  return recover;
}
module.exports = {attachWindowRecovery};
