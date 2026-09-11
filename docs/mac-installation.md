# Install Axiovela 0.2.4 on Mac

[Download Axiovela 0.2.4](https://github.com/CashBowman/axiovela/releases/tag/v0.2.4) for Apple Silicon or Intel Mac.

Requires macOS 13 or later. For an M1/M2/M3/M4/M5 or other Apple M-series chip, use `Axiovela-0.2.4-darwin-arm64.dmg`. For Intel Macs, use `Axiovela-0.2.4-darwin-x64.dmg`. Check Apple menu → About This Mac if unsure.

1. Quit Axiovela or Hypotera. Keep a backup of your research projects.
2. Open the matching DMG and drag **Axiovela** into **Applications**. Choose Replace if prompted for an older Axiovela app.
3. Eject the disk image and open **Axiovela from Applications**.
4. This release has an ad-hoc integrity signature but is not Developer ID-signed or notarized. If macOS shows an unidentified-developer or cannot-check warning for this trusted download, try opening once, then choose **System Settings → Privacy & Security → Open Anyway**, and confirm Open if available. See [Apple's instructions](https://support.apple.com/en-us/102445). If Open Anyway is unavailable, or macOS reports damage/malware or a managed-device restriction, stop and report the exact warning through the project issue tracker. Do not remove quarantine or disable system security.
5. Confirm **Help → About Axiovela** shows **0.2.4**, then choose **Help → Try the example study**.

If you still have Hypotera.app, remove that old application after installing Axiovela to avoid launching it accidentally. Keep your existing projects and MethodFlow profile; you do not need to reset settings. Do not reuse beta.9, beta.10, or beta.11 Mac installers. Earlier versions had framework-link or code-signature defects.

No Git, Node, or npm installation is required. Read BETA_NOTICE.txt and LICENSE.txt before use. Provider accounts and optional research tools are separate. Include in your issue report the app version, Mac model, macOS version, and steps if anything fails; omit credentials and private research.
