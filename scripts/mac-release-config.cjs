// Keep signing/notarization aliases and their precedence identical everywhere.
function macReleaseSettings(env = process.env) {
  const value = suffix => env[`AXIOVELA_MAC_${suffix}`] || env[`HYPOTERA_MAC_${suffix}`] || env[`METHODFLOW_MAC_${suffix}`];
  const sign = value('SIGN') === '1';
  const notarize = value('NOTARIZE') === '1';
  if (notarize && !sign) throw new Error('Mac notarization requires MAC_SIGN=1 and a Developer ID Application identity. Ad-hoc signatures cannot be notarized.');
  const identity = value('SIGN_IDENTITY');
  if (sign && (!identity || !identity.startsWith('Developer ID Application: '))) throw new Error('Set AXIOVELA_MAC_SIGN_IDENTITY to the installed Developer ID Application certificate name.');
  const profile = value('NOTARY_PROFILE');
  const credentials = profile ? {keychainProfile: profile} : {appleId: env.APPLE_ID, appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD, teamId: env.APPLE_TEAM_ID};
  if (notarize && !profile && !Object.values(credentials).every(Boolean)) throw new Error('Mac notarization requires AXIOVELA_MAC_NOTARY_PROFILE or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID.');
  return {sign, notarize, identity, credentials};
}
module.exports = {macReleaseSettings};
