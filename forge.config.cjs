const path = require('node:path');
const mac = require('./scripts/mac-release-config.cjs').macReleaseSettings();

// An allowlist prevents local research, credentials, Git history, and development
// artifacts from entering installers. Production dependencies are pruned by Forge.
const included = new Set(['package.json', 'LICENSE', 'BETA_NOTICE.md', 'THIRD_PARTY_NOTICES.md', 'dist', 'server', 'desktop', 'project-template', 'examples', 'node_modules']);
module.exports = {
  packagerConfig: {
    name: 'Axiovela', executableName: 'axiovela', appBundleId: 'org.methodflow.desktop',
    appCategoryType: 'public.app-category.education',
    icon: path.join(__dirname, 'desktop/icons/icon'),
    asar: false,
    afterPrune: [(buildPath, version, platform, arch, callback) => {
      require('./scripts/mac-rpaths.cjs').prepareMacRpaths(buildPath, version, platform, arch).then(() => callback(), callback);
    }],
    ignore: file => {
      const relative = file.replaceAll('\\', '/').replace(/^\//, '');
      if (relative === 'node_modules/.bin' || relative.startsWith('node_modules/.bin/')) return true;
      if (relative === 'src' || relative === 'src/markdown-format.mjs') return false;
      return Boolean(relative) && !included.has(relative.split('/')[0]);
    },
    // Packaging changes Electron's Info.plist and resources, invalidating its
    // original seal. Re-sign the FINAL bundle even without Developer ID.
    // Ad-hoc signing establishes integrity, not Gatekeeper publisher trust.
    osxSign: mac.sign ? {identity: mac.identity} : {
      identity: '-', identityValidation: false,
      preAutoEntitlements: false, preEmbedProvisioningProfile: false,
      optionsForFile: () => ({hardenedRuntime: false, timestamp: 'none', entitlements: path.join(__dirname, 'desktop/entitlements.mac.plist')}),
    },
    // Notarize/staple the app before making ZIPs, then the final DMG separately.
    osxNotarize: mac.notarize ? mac.credentials : undefined,
  },
  rebuildConfig: {},
  makers: [
    {name: '@electron-forge/maker-zip', platforms: ['linux', 'darwin', 'win32']},
    {name: '@electron-forge/maker-squirrel', config: {name: 'Axiovela', authors: 'Axiovela contributors', description: 'A local research workspace', setupIcon: path.join(__dirname, 'desktop/icons/icon.ico')}},
    {name: '@electron-forge/maker-deb', config: {options: {name: 'axiovela', bin: 'axiovela', productName: 'Axiovela', genericName: 'Research workspace', categories: ['Science', 'Education'], icon: path.join(__dirname, 'desktop/icons/icon.png')}}},
    {name: '@electron-forge/maker-rpm', config: {options: {name: 'axiovela', bin: 'axiovela', productName: 'Axiovela', genericName: 'Research workspace', categories: ['Science', 'Education'], icon: path.join(__dirname, 'desktop/icons/icon.png')}}},
  ],
};
