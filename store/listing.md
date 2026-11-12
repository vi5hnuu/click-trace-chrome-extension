# Chrome Web Store listing

Copy-paste source for the developer dashboard. Keyword guidance: use the words people search for
("CSS inspector", "ruler", "measure", "spacing", "pixel perfect", "box model", "color picker",
"contrast") in natural sentences. Repeating keywords or listing them is treated as keyword spam
under the Web Store listing policy.

## Store listing

**Name** (from `manifest.json`, max 75 characters)

> Click Trace — CSS Inspector, Ruler & Spacing Tool

**Summary** (from `manifest.json` `description`, max 132 characters)

> Inspect CSS, box model and contrast, measure with a snapping ruler, check spacing, grids and pixel-perfect design overlays.

**Category**: Developer Tools · **Language**: English

**Description**

```text
Click Trace is a CSS inspector and pixel ruler for frontend developers, designers and QA. Inspect, measure and trace any element on a web page without opening DevTools.

TOOLS
• Inspect (I): hover to see the box model — margin, border, padding and content. Click to pin an element and read the click coordinates relative to it, any parent, the viewport or the page. Walk the DOM with the arrow keys.
• Ruler (R): drag to measure anything. Edges snap to nearby elements; drag guides out of the pixel rulers. Measurements stay attached to the page while you scroll.
• Spacing (D): see the distance between two elements, or from an element to its parent — Figma-style spacing lines.
• Styles (S): grouped computed CSS for layout, box model, typography and visuals, including flex and grid gap. Copy a value or the whole block as CSS.
• Color (C): eyedropper color picker with HEX, RGB, HSL and OKLCH, plus a WCAG contrast checker.
• Grid (G): 12, 8 or 4-column layout grid and baseline grid overlay.
• Outline (O): outline every element to debug layout, overflow and stray wrappers.
• Overlay (P): drop or paste a design mockup and compare it with the live page using opacity or difference blending — pixel-perfect QA for @1x, @2x and @3x exports.
• Screenshot (K): capture the page with your measurements, copied to the clipboard and saved.

BUILT FOR REAL-WORLD SITES
• Stays on top of modal dialogs and popovers, and stays clickable over them.
• Page CSS can't break the toolbar or panels (Shadow DOM isolation).
• Clicks are blocked while you measure, so links and buttons don't fire by accident.
• Accessibility checks: text contrast ratio with AA/AAA grades and touch-target size warnings.
• Units in px, rem or percent. Light and dark themes, custom accent color.
• Inspects elements inside web components (open shadow roots).

PRIVATE BY DESIGN
Click Trace runs only on the tab where you open it (activeTab). It makes no network requests and collects no data. Settings stay in your browser.

KEYBOARD FIRST
Every tool has a one-key shortcut. Press ? on the page to see them all. Alt+Shift+I toggles Inspect from anywhere.

Questions or ideas? https://github.com/vi5hnuu/click-trace-chrome-extension/issues
```

**Graphics**

| Asset                 | Size     | File                            |
| --------------------- | -------- | ------------------------------- |
| Screenshots (up to 5) | 1280×800 | `store/screenshots/*.png`       |
| Small promo tile      | 440×280  | `store/promo-small-440x280.png` |
| Store icon            | 128×128  | `public/icons/128x128.png`      |

**Website**: https://click-trace.laxmi.solutions/
**Support**: https://github.com/vi5hnuu/click-trace-chrome-extension/issues

## Privacy practices tab

**Single purpose**

> Click Trace helps web developers inspect and measure elements on the page they are viewing: box model, dimensions, spacing, CSS, colors and alignment.

**Permission justifications**

- `activeTab` — Gives temporary access to the current tab only when the user opens Click Trace from the toolbar or a keyboard shortcut, to draw the measurement overlay and take screenshots of that tab.
- `scripting` — Injects the overlay script into the current tab on demand, instead of running on every website.
- `storage` — Saves the user's preferences (theme, units, grid settings, toolbar position, recent colors) locally.

**Remote code**: No, I am not using remote code.

**Data usage**: Click Trace does not collect or transmit any user data. Tick no data types, and certify the three
limited-use statements.

**Privacy policy URL**: https://legal.laxmi.solutions/click-trace/privacy-policy
