# Scope: Implementation Track

## Architecture

- **Static Frontend**: Vite dev/prod server, files hosted in `frontend/`, output in `dist-web/`.
- **Offline PWA**: Service Worker (`sw.js`) caching assets, Python wheels for Pyodide, and `manifest.json`.
- **Font Rendering & Preview**: opentype.js and `ruby.ts` computed client-side.
- **Font Compilation**: SVG Font XML generated in-browser, converted to TTF via `svg2ttf`, and loaded.
- **Feature Injection & Compression**: Pyodide running in browser, using `fonttools` and `brotli` wheels, executing GSUB injection rules and compiling WOFF2.
- **IndexedDB Storage**: Stores compiled font binaries and user settings.

## Milestones

| #     | Name                                                    | Scope                                                                                                                        | Dependencies | Status      |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| M2    | Dependency Vendoring & PWA Setup                        | Download Pyodide runtime, Python wheels (`fonttools`, `brotli`), `opentype.js`, and setup `manifest.json` and `sw.js`.       | None         | IN_PROGRESS |
| M3    | Client-Side Vector Preview Rendering                    | Implement client-side loading of `DroidSansFallbackFull.ttf` via `opentype.js` and port `ruby.ts` for browser-side previews. | M2           | PLANNED     |
| M4    | Browser-Side Font Compilation                           | Implement browser-side SVG font XML generation, convert to TTF via `svg2ttf`, and register via CSS Font Loading API.         | M3           | PLANNED     |
| M5    | Browser-Side GSUB rules injection and WOFF2 Compression | Initialize Pyodide with vendored assets, run GSUB injection and WOFF2 compression on the TTF in-browser.                     | M2, M4       | PLANNED     |
| M6    | Offline Storage & Cleanup                               | Store compiled fonts and settings in IndexedDB; remove server-side API middlewares in `vite.config.ts`.                      | M5           | PLANNED     |
| Final | E2E & Adversarial Hardening                             | Pass 100% E2E test suite (Tiers 1-4) and white-box adversarial testing (Tier 5).                                             | M6           | PLANNED     |
