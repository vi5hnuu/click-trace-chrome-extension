# Click Trace

A frontend developer toolkit for Chrome. Inspect, measure and trace any element on a page without opening DevTools.

## Tools

| Tool        | Key | What it does                                                                                                                                                                                                                                  |
| ----------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inspect** | `I` | Hover for a DevTools-style box model. Click to pin: click coordinates relative to the element, any ancestor, the viewport and the page. Walk the DOM with the arrow keys. Includes layout, typography, WCAG contrast and touch-target checks. |
| **Ruler**   | `R` | Drag to measure. Edges snap to nearby elements (hold `Alt` to disable). Drag from the pixel rulers to add guides. Measurements stay attached to the page while you scroll.                                                                    |
| **Spacing** | `D` | Hover an element to see its distance to the parent's edges, or click one element and hover another to measure the gap between them.                                                                                                           |
| **Styles**  | `S` | Grouped computed CSS for any element (layout, box, typography, visual). Copy single values or the whole block as CSS.                                                                                                                         |
| **Color**   | `C` | Pick any pixel with the native EyeDropper. Copy it as HEX, RGB, HSL or OKLCH, and check contrast against the previous pick.                                                                                                                   |
| **Grid**    | `G` | Column and baseline grid overlay (12/8/4-column presets, configurable). Works alongside any other tool.                                                                                                                                       |

Other keys: `U` cycles units (px / rem / %), `Esc` clears the current selection, then the tool, then closes Click Trace. After Click Trace has run on a page once, <kbd>⌘/Ctrl</kbd> + <kbd>Shift</kbd> + click any element to inspect it.

Global shortcuts (customisable at `chrome://extensions/shortcuts`): `Alt+Shift+I` Inspect, `Alt+Shift+R` Ruler, `Alt+Shift+X` close.

## Why it behaves well on real sites

- **Shadow DOM isolation**: page CSS resets can't restyle the overlay, and the overlay never leaks styles into the page.
- **Top layer**: the overlay renders as a popover, so it sits above any `z-index`, modal `<dialog>` or popover. While a modal is open it moves inside the dialog, so it stays clickable.
- **Clicks are captured** while a measuring tool is active, so links and buttons don't fire by accident.
- **Minimal permissions**: `activeTab`, `scripting` and `storage` only. Nothing runs on a page until you open Click Trace there.
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
```

Each tool extends `BaseTool`. Its listeners are registered with the activation's `AbortSignal`, so deactivating a tool always removes them.

### Packaging for the Chrome Web Store

```sh
npm run build && (cd dist && zip -r ../click-trace.zip .)
```

Upload `click-trace.zip` in the developer dashboard.
