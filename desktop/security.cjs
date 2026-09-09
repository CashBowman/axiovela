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
module.exports = {APP_URL, isAppUrl, isExternalUrl, allowsPermission};
