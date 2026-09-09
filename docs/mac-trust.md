# Mac trust and validation

Axiovela 0.2.0 Mac installers have ad-hoc signatures. Native installation and app
execution checks passed on Apple Silicon and Intel on macOS 15 and 26.
Automatic trust assessment was rejected: these builds are not notarized.
The assessment also reported an Internal XProtect Error. This is not a passing
security assessment. See the MAC-TRUST reports attached to the release.

Bundle integrity, successful execution, and publisher trust are separate checks.
Follow [Mac installation](mac-installation.md) and the device's policy.
For Developer ID signing and notarization, follow [Mac distribution](mac-distribution.md).
