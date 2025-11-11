# Symbiont – PDSA Figma Plugin

This repository contains a Figma plugin that assembles PDSA (Product Design Systems Architecture) data stored in a GitHub repository into structured Figma pages.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the plugin bundles:

   ```bash
   npm run build
   ```

   This produces `dist/code.js`, `dist/ui.js`, and copies `ui.html` so they can be referenced by `manifest.json`.

3. In Figma, choose **Plugins → Development → Import plugin from manifest…** and select the `manifest.json` file in this repository.

## Usage

1. Run the plugin inside a Figma file.
2. Provide the GitHub repository (e.g. `owner/repo`), branch, and optional base path where the PDSA files live.
3. Click **Sync from GitHub**. The plugin downloads `pds.json`, the flow definitions, and the design system map, then:
   - Builds a **System – Library** page grouping all mapped components by category.
   - Generates one page per flow with breakpoint frames and screen compositions.
   - Lays out a “Parts” area for each flow showing all component instances used.
   - Wires prototype navigation links defined in the flow JSON interactions.

The plugin is read-only: it never writes back to GitHub.
