// Builds the extension into dist/ in two passes:
//  1. popup page + background service worker (ES modules)
//  2. content script as a single self-contained IIFE, as required by
//     chrome.scripting.executeScript({ files }).
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = `${root}dist`;
const watch = process.argv.includes('--watch') ? {} : null;

/** @type {import('vite').InlineConfig} */
const extensionPages = {
  configFile: false,
  root: `${root}src/popup`,
  publicDir: `${root}public`,
  build: {
    outDir,
    emptyOutDir: true,
    target: 'chrome116',
    watch,
    rollupOptions: {
      input: {
        popup: `${root}src/popup/popup.html`,
        background: `${root}src/background/index.ts`,
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
};

/** @type {import('vite').InlineConfig} */
const contentScript = {
  configFile: false,
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    target: 'chrome116',
    watch,
    lib: {
      entry: `${root}src/content/index.ts`,
      formats: ['iife'],
      name: 'ClickTrace',
      fileName: () => 'content.js',
    },
  },
};

await build(extensionPages);
await build(contentScript);
