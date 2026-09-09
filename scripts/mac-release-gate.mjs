export function requireSuccessfulCheck(check, label) {
  if (check?.status !== 0 || check.error) throw new Error(`${label} failed or could not complete. See the retained Mac trust report.`);
}

export function assertMacDistribution(report) {
  for (const [label, copy] of [['Installed app', report], ['Quarantined app', report?.quarantined]]) {
    for (const key of ['signature', 'identity', 'gatekeeper', 'distribution']) requireSuccessfulCheck(copy?.[key], `${label}: ${key}`);
    if (!/Authority=Developer ID Application:/.test(copy.identity.output) || !/Timestamp=/.test(copy.identity.output) || !/flags=.*runtime/.test(copy.identity.output)) {
      throw new Error(`${label} needs a timestamped Developer ID signature with hardened runtime.`);
    }
  }
  for (const key of ['integrity', 'signature', 'staple']) requireSuccessfulCheck(report?.container?.[key], `DMG: ${key}`);
}

export function assertTamperRejected(check) {
  if (!Number.isInteger(check?.status) || check.status <= 0 || check.error || !/sealed resource|resource envelope|resource.*(?:modified|missing|invalid)|invalid signature|code or signature modified/i.test(check.output || '')) {
    throw new Error('Tamper check must complete and report an invalid signature/resource seal; missing commands and timeouts do not count.');
  }
}
