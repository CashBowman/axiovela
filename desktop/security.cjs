const APP_URL = 'methodflow://app/';
function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'methodflow:' && url.host === 'app' && !url.username && !url.password;
  } catch { return false; }
}
function isExternalUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
function allowsPermission(permission, requestingUrl, isMainFrame) {
  return permission === 'clipboard-sanitized-write' && isMainFrame === true && isAppUrl(requestingUrl);
}
function isMarkdownPdfResource(value) {
  if (typeof value !== 'string' || !value.startsWith('/api/artifacts/file?')) return false;
  const url = new URL(value, APP_URL);
  const keys = [...url.searchParams.keys()];
  return !url.hash && url.pathname === '/api/artifacts/file'
    && keys.filter(key => key === 'path').length === 1
    && keys.filter(key => key === 'workspace').length <= 1
    && keys.every(key => ['path', 'workspace'].includes(key))
    && /^exports\/chat-[a-f0-9-]+\.html$/.test(url.searchParams.get('path'))
    && (!keys.includes('workspace') || Boolean(url.searchParams.get('workspace')) && !/[\x00-\x1f]/.test(url.searchParams.get('workspace')));
}
module.exports = {APP_URL, isAppUrl, isExternalUrl, allowsPermission, isMarkdownPdfResource};
