English | [简体中文](README.zh-CN.md)

# ChatGPT: Copy in Feishu Format

A Manifest V3 extension for desktop Chrome and Edge. No build step or dependency installation is required.

## Installation

1. Open `chrome://extensions/` (or `edge://extensions/` in Edge).
2. Enable **Developer mode** and click **Load unpacked**.
3. Select the `chatgpt-plugin` folder.
4. **Refresh any ChatGPT pages that are already open.** After updating the extension, click Reload on the extensions page, then refresh ChatGPT.

## Usage

Select content in a conversation at `https://chatgpt.com/`, right-click, and choose **ChatGPT → 复制为飞书格式** (Copy in Feishu Format). Paste the result into the body of a Feishu document. Without a selection, the extension copies the entire message you right-clicked. Right-clicking outside a message without a selection prompts you to select content.

- Converts `\[ ... \]` and `\( ... \)` to `$$...$$`, removing whitespace immediately inside the delimiters.
- Extracts the source of rendered KaTeX formulas from hidden LaTeX annotations to avoid duplicated or garbled mathematical glyphs. Selecting part of a formula copies the complete formula.
- Preserves the contents of existing `$$...$$` formulas, trimming only leading and trailing whitespace. Single-dollar `$...$` expressions are not converted automatically, to avoid mistaking prices for formulas.
- Preserves paragraphs, lists, and table text (with tabs between cells). Code retains Markdown code markers, and formula examples inside a complete code block are not converted. Selecting only the formula text inside code still allows conversion.
- Writes plain text to the clipboard. Rich text formatting such as fonts, colors, images, and link destinations is not preserved.
- Leaves ChatGPT's native copy buttons and Ctrl+C behavior unchanged.

## Pasting into Feishu

Feishu documents support automatic conversion of `$$formula$$`, but pasted formulas may sometimes remain plain text. Following Feishu's official guidance, delete the final `$` and type it again to trigger conversion. Alternatively, use `/gs` to open the equation editor and paste only the formula body, without `$$`. The extension prepares the copied text; it cannot control how Feishu parses pasted content.

Reference: [Feishu Help Center: Use equations in documents](https://www.feishu.cn/hc/zh-CN/articles/894598450617) (Chinese).

## Copy Tables as Markdown (1.1.0)

For conversation tables without a native Copy Table button, the extension adds a small floating copy icon 4 px outside the table's right edge and 4 px below its top edge. Its tooltip reads **复制为 Markdown** (Copy as Markdown). The icon takes up no extra row and does not cover right-aligned cell text. Its position follows the actual table edges as the page scrolls or resizes, rather than aligning with a wider outer container. Clicking it copies only that table, producing a standard Markdown header, separator row, and data rows. Tables with a native copy button do not receive a duplicate button.

Supports DIL tables, standard HTML tables, and dynamically generated tables. Tables are checked automatically after switching conversations. Copying reads the latest content; clicking while a table is still being generated may copy an incomplete table.

The first row becomes the Markdown header. Line breaks within cells become `<br>`, pipes and Markdown special characters are escaped, and formulas use their LaTeX source when available. Merged cells are expanded into a grid, with content in the top-left cell and the remaining cells left empty. Text and image alt text are preserved; styles such as colors and fonts are not.

## Permissions and Limitations

The extension requests only context menu and clipboard write permissions. Content scripts run only on `https://chatgpt.com/*`. It does not upload content or read the clipboard. The image rendering library is bundled locally, with no runtime CDN scripts. When rendering an area containing remote images, the library may request those images to embed them in the screenshot. It does not additionally download web fonts.

## Copy Box Areas as Images (1.2.0)

A consistent copy icon appears inside the top-right corner of each outermost `data-d-component="box"` display area. Its tooltip reads **复制整个区域为图片** (Copy Entire Area as Image). The icon uses absolute positioning, takes up no extra row, and is automatically excluded from the generated image. Clicking it creates a PNG and writes it to the clipboard, ready to paste into Feishu, Word, chats, and other destinations that accept images.

- Icons are added only to complete areas, without duplicates on smaller nested boxes or inline citation markers.
- Captures the displayed state at the time of the click, including headings, text, colors, graphics, and the full dimensions of the area's root element, even when part of the area is off-screen.
- Excludes the extension's copy buttons. Uses 2× resolution by default, reducing the scale for large images to limit memory usage.
- Scrollable subpanels capture their currently displayed content. Cross-origin images, protected canvases, videos, or embedded pages may prevent image generation; failures are reported explicitly.
- Uses locally available fallback fonts, which may differ slightly from the page's web fonts. Dynamic interactions become a static image.

Bundled dependency: [html-to-image 1.11.13](https://github.com/bubkoo/html-to-image). Its MIT license is included in `vendor/html-to-image.LICENSE`.

## Copy Entire Responses as Markdown, Preserving Mermaid (1.3.0)

A teal copy icon appears next to the native copy button at the bottom of a response. Its tooltip reads **复制 Markdown（保留 Mermaid 源码）** (Copy Markdown, Preserving Mermaid Source). Clicking it generates Markdown directly from the current response. Diagrams are output as fenced code blocks with the `mermaid` language identifier, without SVG styling mixed in.

It does not read the system clipboard first, invoke the native copy button, or change that button's behavior. Common headings, bold, italics, links, lists, code, tables, and LaTeX are preserved. Images retain only their alt text, and interactive components cannot be fully converted to Markdown.

Mermaid source is read from page attributes when available. Otherwise, a script running in the MAIN world reads the `clipboardContent` / `content` fields of the current diagram's React component. This happens only when the button is clicked, and only for diagrams in the marked response. It does not read the entire conversation state or upload content. React internals are not a stable interface, so future page updates may require adjustments. If source is missing for any diagram, the extension reports a failure instead of overwriting the clipboard with styles or incomplete content.

Integration check: `node tests/markdown-browser.cjs` (requires Playwright and Chrome). Covers multiple diagrams, source recovery, SVG/CSS exclusion, code whitespace preservation, response boundaries, and failure paths.

Version 1.3.1 fixes code toolbar language labels leaking into the body and places language identifiers in code fences instead (for example, ` ```java `). Blockquotes retain normal paragraph spacing, and multiline code within blockquotes receives a `>` prefix on every line while preserving code whitespace.

Version 1.3.2 adds support for `data-code-block-source` code areas that do not use `<pre>`. Plain text content such as call chains remains in `text` code blocks, preserving line breaks and indentation.

Version 1.3.3 gives all three added copy button types consistent feedback: successful copies show a checkmark and **已复制** (Copied) tooltip, then restore the original icon and tooltip after 2 seconds. Failures do not show a success checkmark. Copying again restarts the timer.

Changes to ChatGPT's page structure or formula renderer may require adjustments. Formulas without LaTeX source fall back to available page text. Not all mathematical syntax is guaranteed to be supported by Feishu.

## Checks

```powershell
node --test tests/*.test.cjs
node --check background.js
node --check converter.js
node --check content.js
node --check boxes.js
```

An optional browser integration check is available at `node tests/browser-smoke.cjs`. It requires Playwright in the environment and an installed Chrome browser. It covers entire messages, selections, partial formula source recovery, empty selections, and clipboard failure paths.

Image copy browser check: `node tests/boxes-browser.cjs`. On an isolated test page, it verifies PNG content and dimensions, clipboard entries, nested box filtering, full off-screen areas, dynamic updates, and failure messages. It also generates `tests/box-preview.png` for visual inspection. Clipboard writes use a test double and do not modify your system clipboard while tests run.
