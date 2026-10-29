// Optional browser integration check: requires Playwright and installed Chrome.
const { chromium } = require("playwright");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <article><div data-message-author-role="assistant">
        <p id="intro">预计输出：</p>
        <div class="katex-display"><span class="katex">
          <span class="katex-mathml"><math><semantics><mi>x</mi>
            <annotation encoding="application/x-tex">\\text{预计输出行数} \\approx rows \\times \\frac{filtered}{100}</annotation>
          </semantics></math></span><span class="katex-html">visual-duplicate</span>
        </span></div>
        <p id="raw">行内：\\( x_1 \\)</p>
        <pre><code>const price = '$100';\n\\[literal\\]</code></pre>
      </div></article><div id="outside">外部区域</div>`);
    await page.evaluate(() => {
      window.chrome = { runtime: { onMessage: { addListener(fn) { window.listener = fn; } } } };
      Object.defineProperty(navigator, "clipboard", {
        value: { async writeText(text) { window.copied = text; } }, configurable: true
      });
      window.trigger = async selector => {
        document.querySelector(selector).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        return new Promise(resolve => window.listener({ type: "COPY_FEISHU", selectionText: "" }, {}, resolve));
      };
    });
    await page.addScriptTag({ path: path.join(__dirname, "../converter.js") });
    await page.addScriptTag({ path: path.join(__dirname, "../copy-feedback.js") });
    await page.addScriptTag({ path: path.join(__dirname, "../tables.js") });
    await page.addScriptTag({ path: path.join(__dirname, "../boxes.js") });
    await page.addScriptTag({ path: path.join(__dirname, "../markdown.js") });
    await page.addScriptTag({ path: path.join(__dirname, "../content.js") });

    let response = await page.evaluate(() => window.trigger("#intro"));
    assert.equal(response.ok, true);
    const copied = await page.evaluate(() => window.copied);
    assert.ok(copied.includes(String.raw`$$\text{预计输出行数} \approx rows \times \frac{filtered}{100}$$`));
    assert.ok(copied.includes("行内：$$x_1$$"));
    assert.ok(!copied.includes("visual-duplicate"));
    assert.ok(copied.includes(String.raw`\[literal\]`));

    response = await page.evaluate(() => {
      const range = document.createRange();
      const text = document.querySelector(".katex-html").firstChild;
      range.setStart(text, 2);
      range.setEnd(text, 5);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return window.trigger(".katex-html");
    });
    assert.equal(response.ok, true);
    assert.equal(await page.evaluate(() => window.copied), String.raw`$$\text{预计输出行数} \approx rows \times \frac{filtered}{100}$$`);

    response = await page.evaluate(() => {
      getSelection().removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#raw"));
      getSelection().addRange(range);
      return window.trigger("#raw");
    });
    assert.equal(response.ok, true);
    assert.equal(await page.evaluate(() => window.copied), "行内：$$x_1$$");

    response = await page.evaluate(() => {
      getSelection().removeAllRanges();
      return window.trigger("#outside");
    });
    assert.equal(response.ok, false);

    // Exercise clipboard failure: success is never reported if both paths fail.
    response = await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error("denied"); };
      document.execCommand = () => false;
      return window.trigger("#intro");
    });
    assert.equal(response.ok, false);
    await page.evaluate(() => {
      navigator.clipboard.writeText = async text => { window.copied = text; };
      const main = document.createElement("main");
      main.innerHTML = `<div class="DilResponseRoot-test">
        <div class="TableFrame-test" id="missing" style="width:900px"><div class="TableViewport-test"><table style="width:400px;margin:auto">
          <tr><th>字段</th><th>说明</th></tr>
          <tr><td>type</td><td>a|b<br>下一行</td></tr>
        </table></div></div>
        <div class="TableContainer-test" id="native"><table><tr><th>原生</th></tr></table><button aria-label="复制表格"></button></div>
      </div>`;
      document.body.append(main);
      const frame = document.querySelector("#missing").getBoundingClientRect();
      const table = document.querySelector("#missing table").getBoundingClientRect();
      window.tableOriginalLayout = { top: frame.top, height: frame.height, tableTop: table.top, tableHeight: table.height };
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-chatgpt-markdown-toolbar]').length === 1);
    const icon = page.getByRole("button", { name: "复制表格为 Markdown", exact: true });
    assert.equal(await icon.textContent(), "");
    assert.equal(await icon.locator("svg").count(), 1);
    assert.equal(await icon.getAttribute("title"), "复制为 Markdown");
    const floating = await page.evaluate(() => {
      const frame = document.querySelector("#missing").getBoundingClientRect();
      const table = document.querySelector("#missing table").getBoundingClientRect();
      const toolbar = document.querySelector('[data-chatgpt-markdown-toolbar]');
      const rect = toolbar.getBoundingClientRect();
      return { layout: { top: frame.top, height: frame.height, tableTop: table.top, tableHeight: table.height },
        original: window.tableOriginalLayout, position: getComputedStyle(toolbar).position,
        inside: Math.abs(rect.top - table.top - 4) < 1 && rect.bottom <= table.bottom,
        aligned: Math.abs(rect.left - (table.right + 4)) < 1,
        differsFromFrame: Math.abs(rect.right - frame.right) > 100 };
    });
    assert.deepEqual(floating.layout, floating.original);
    assert.equal(floating.position, "absolute");
    assert.equal(floating.inside, true);
    assert.equal(floating.aligned, true);
    assert.equal(floating.differsFromFrame, true);
    await page.evaluate(() => document.querySelector("#missing").style.width = "700px");
    await page.waitForFunction(() => {
      const table = document.querySelector("#missing table").getBoundingClientRect();
      const icon = document.querySelector('[data-chatgpt-markdown-toolbar]').getBoundingClientRect();
      return Math.abs(icon.left - table.right - 4) < 1;
    });
    await icon.click();
    assert.equal(await icon.getAttribute("data-chatgpt-copy-state"), "success");
    assert.equal(await icon.getAttribute("title"), "已复制");
    await page.waitForFunction(() => !document.querySelector('[data-chatgpt-markdown-toolbar] button').hasAttribute('data-chatgpt-copy-state'));
    assert.equal(await icon.getAttribute("title"), "复制为 Markdown");
    assert.equal(await page.evaluate(() => window.copied), "| 字段 | 说明 |\n| --- | --- |\n| type | a\\|b<br>下一行 |");
    // Read content at click time, including rows added while the answer streams.
    await page.evaluate(() => {
      const table = document.querySelector("#missing table");
      const row = table.insertRow();
      row.insertCell().textContent = "rows";
      row.insertCell().textContent = "100";
      const frame = document.createElement("div");
      frame.className = "TableFrame-test";
      frame.id = "dynamic";
      frame.innerHTML = "<table><tr><th>A</th><th>B</th></tr><tr><td rowspan='2'>x</td><td>1</td></tr><tr><td>2</td></tr></table>";
      document.querySelector("main").append(frame);
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-chatgpt-markdown-toolbar]').length === 2);
    await icon.first().click();
    assert.ok((await page.evaluate(() => window.copied)).endsWith("| rows | 100 |"));
    const merged = await page.evaluate(() => window.ChatGPTTables.toMarkdown(document.querySelector("#dynamic table")));
    assert.equal(merged.markdown, "| A | B |\n| --- | --- |\n| x | 1 |\n|  | 2 |");
    assert.equal(merged.merged, true);
    // If a native toolbar arrives later, the extension removes its own button.
    await page.evaluate(() => {
      const b = document.createElement("button");
      b.setAttribute("aria-label", "Copy table");
      document.querySelector("#missing").append(b);
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-chatgpt-markdown-toolbar]').length === 1);
    await page.evaluate(() => document.querySelector("#dynamic").remove());
    await page.waitForFunction(() => document.querySelectorAll('[data-chatgpt-markdown-toolbar]').length === 0);
    console.log("PASS: message copy, KaTeX source recovery, partial formula selection, text selection, empty context, clipboard failure");
    console.log("PASS: icon-only table button, Markdown escaping, line breaks, native button detection, streaming updates, merged cells, dynamic insertion and cleanup");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
