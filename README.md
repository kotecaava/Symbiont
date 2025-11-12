# DS Component Browser (v0.1)

A lightweight Figma plugin that indexes the components and variants in the current file and presents them in a searchable browser. It is designed as a zero-network, current-file-only utility for quickly locating component definitions.

## Install locally

1. Install dependencies (first run only):
   ```bash
   npm install
   ```
2. Build the plugin bundle:
   ```bash
   npm run build
   ```
3. In Figma choose **Plugins → Development → Import plugin from manifest…** and pick `manifest.json` from this repository. The compiled assets live in `dist/` and are checked into source control for convenience.

## Build commands

- `npm run build` – rebuilds the main bundle (`dist/code.js`), UI bundle (`dist/ui.js`), and copies `dist/ui.html`.
- `npm run build:main` – rebuilds only the plugin worker bundle.
- `npm run build:ui` – rebuilds only the UI script bundle.
- `npm run build:html` – copies the static HTML shell into `dist/`.

## Known limitations

- Scans the current file only; it does not browse remote/team libraries.
- Thumbnails are requested lazily on demand and cached for the current session only.
- No persistence is stored between sessions (no localStorage/IndexedDB usage).

## QA test checklist

| Test | Status |
| ---- | ------ |
| Opening the plugin triggers a scan; shows count and timestamp. | Pending manual QA |
| Searching by full component name returns correct items. | Pending manual QA |
| Searching by partial name/canonical/page/variant tokens filters correctly. | Pending manual QA |
| Thumbnails appear within 300–800 ms after the row becomes visible. | Pending manual QA |
| Clicking a row copies the node id (verify by pasting). | Pending manual QA |
| Rescan updates counts after components change. | Pending manual QA |
| Handles large files (~3k items) without crashing. | Pending manual QA |
| Works on both Mac and Windows Figma desktop apps. | Pending manual QA |
