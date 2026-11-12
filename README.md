# Click Trace

A frontend developer toolkit for Chrome. Inspect, measure and trace any element on a page without opening DevTools.

## Tools

| Tool           | Key | What it does                                                                                                                                                                               |
| -------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Inspect**    | `I` | Box model on hover. Click to pin: coordinates relative to the element, any ancestor, the viewport and page. Arrow keys walk the DOM. Layout, typography, contrast and touch-target checks. |
| **Ruler**      | `R` | Drag to measure; edges snap to nearby elements (`Alt` disables). Drag guides from the pixel rulers. Measurements stay attached to the page while scrolling.                                |
| **Spacing**    | `D` | Distance to the parent's edges on hover, or between two elements (click one, hover another).                                                                                               |
| **Styles**     | `S` | Grouped computed CSS; copy single values or the whole block as CSS.                                                                                                                        |
| **Color**      | `C` | EyeDropper picker with HEX / RGB / HSL / OKLCH and a WCAG contrast check against the previous pick.                                                                                        |
| **Grid**       | `G` | Column and baseline grid overlay (12/8/4-column presets).                                                                                                                                  |
| **Outline**    | `O` | Colour-coded outline on every element to debug structure and overflow.                                                                                                                     |
| **Overlay**    | `P` | Drop, paste or choose a design mockup; compare with opacity or difference blending, @2x/@3x scaling, drag or arrow-key alignment.                                                          |
| **Screenshot** | `K` | Captures the visible tab with your measurements, downloads it and copies it to the clipboard.                                                                                              |

Grid, Outline and Overlay are layers: they combine with any other tool. Other keys: `U` cycles units (px / rem / %), `?` shows all shortcuts, `Esc` steps back one level (sheet → selection → tool → close). After Click Trace has run on a page once, <kbd>⌘/Ctrl</kbd> + <kbd>Shift</kbd> + click any element to inspect it. The toolbar also shows the live viewport size and Tailwind breakpoint.

Global shortcuts (customisable at `chrome://extensions/shortcuts`): `Alt+Shift+I` Inspect, `Alt+Shift+R` Ruler, `Alt+Shift+X` close.

## Why it behaves well on real sites

- **Shadow DOM isolation**: page CSS resets can't restyle the overlay, and the overlay never leaks styles into the page.
- **Top layer**: the overlay renders as a popover, so it sits above any `z-index`, modal `<dialog>` or popover. While a modal is open it moves inside the dialog, so it stays clickable.
- **Clicks are captured** while a measuring tool is active, so links and buttons don't fire by accident.
- **Minimal permissions**: `activeTab`, `scripting` and `storage` only. Nothing runs on a page until you open Click Trace there, and it makes no network requests.
- Works inside open shadow roots (web components).

## Development

Requires Node 20+.

```sh
npm install
npm run dev     # rebuilds dist/ on change
npm run build   # production build into dist/
npm run check   # typecheck + lint + unit tests
```

Load the extension: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the `dist/` folder.

### Project layout

```
public/              manifest.json and icons (copied to dist/ as-is)
scripts/build.mjs    two-pass Vite build (popup + worker as ES modules, content script as an IIFE)
src/background/      service worker: keyboard commands -> inject + message the page
src/popup/           toolbar popup: tool launcher and settings
src/shared/          tool registry, typed messages, settings, icons, tab helpers
src/content/
  app.ts             overlay session: active tool, grid, toolbar, keyboard, settings
  overlay/           shadow-root host, toolbar, panel, toast, styles
  tools/             one class per tool, all extending BaseTool
  lib/               pure helpers (geometry, color, units, css, selector) + DOM helpers
tests/               Vitest unit tests for the pure modules
docs/                landing page + privacy policy (GitHub Pages), with SEO meta and JSON-LD
store/               Chrome Web Store listing copy, screenshots and promo tile
```

Each tool extends `BaseTool`. Its listeners are registered with the activation's `AbortSignal`, so deactivating a tool always removes them.

### Packaging for the Chrome Web Store

```sh
npm run build && (cd dist && zip -r ../click-trace.zip .)
```

Upload `click-trace.zip` in the developer dashboard, and paste the listing text, permission
justifications and privacy answers from [`store/listing.md`](store/listing.md).

### Website

`docs/` is a static site. Enable it under **Settings → Pages → Deploy from a branch → `main` / `/docs`**.
It is served at https://vi5hnuu.github.io/click-trace-chrome-extension/. After publishing, submit
`sitemap.xml` in Google Search Console and replace the "Add to Chrome" links (search URL for now)
with the extension's direct Web Store URL.
