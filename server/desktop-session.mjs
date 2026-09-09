import {timingSafeEqual} from 'node:crypto';

let token = null;
export function configureDesktop(value) {
  if (token || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid desktop session configuration');
  token = value;
}
export function isDesktopSession() { return token !== null; }
export function authorizedDesktopRequest(value) {
  if (!token) return true;
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(token));
}
