import {cp} from 'node:fs/promises';

// Framework links must remain relative when the bundle leaves the build host.
export async function copyDesktopBundle(source, destination) {
  await cp(source, destination, {recursive: true, verbatimSymlinks: true});
}
