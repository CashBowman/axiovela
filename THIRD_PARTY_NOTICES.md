# Third-party software

Axiovela is MIT-licensed; see [LICENSE](LICENSE). Dependencies retain their respective licenses.

Desktop downloads include Electron (MIT), Chromium and its third-party components, Node.js, and production npm dependencies. Preserve Electron's `LICENSE` and `LICENSES.chromium.html` files next to the application binary. Runtime dependency license files remain in `resources/app/node_modules/` (inside the app bundle on macOS).

The interface bundles React, Lucide, KaTeX, Citation.js, Markdown tooling, and their dependencies. Manrope and DM Mono font files are distributed under the SIL Open Font License. Their full license texts and the UI dependency notices are included in the desktop application's `desktop/third-party-licenses/` folder by the release preparation script. Review the generated notices when updating dependencies.

Desktop beta.5 and later also bundle [Tectonic 0.17.0](https://github.com/tectonic-typesetting/tectonic/releases/tag/tectonic%400.17.0), under its MIT license and the licenses of its constituent components. The upstream license is in `desktop/licenses/tectonic.txt`; build provenance is in `desktop/tools/build.json`. TeX packages and fonts are downloaded by Tectonic as needed and retain their own licenses.
