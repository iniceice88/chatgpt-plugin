const { chromium } = require("playwright");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.route("https://chatgpt.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
    await page.goto("https://chatgpt.com/extension-test");
    await page.setContent(`<style>
      body{margin:0;background:white;font:16px Arial}main{padding:20px}
      .region{box-sizing:border-box;width:768px;border:1px solid #999;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px}
      .grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:3px}
      .cell{height:32px;display:flex;align-items:center;justify-content:center;background:rgb(216,235,220);border-radius:4px;color:#26364a}
    </style><main>
      <div id="diagram" class="region" data-d-component="box"><div>G1 堆内存示意图</div><div class="grid">
      ${Array.from({ length: 32 }, (_, i) => `<div class="cell" data-d-component="box">${"ESOH"[i % 4]}</div>`).join("")}
      </div><div>E = Eden　S = Survivor　O = Old　H = Humongous</div><div>Region 的角色分布不要求物理连续。</div></div>
      <span data-d-component="box" data-d-inline>Oracle 文档</span>
      <div style="height:900px"></div>
      <div id="offscreen" class="region" data-d-component="box" style="height:900px;justify-content:space-between"><div>TOP</div><div style="height:40px;background:rgb(200,0,0)">BOTTOM</div></div>
    </main>`);
    const originalLayout = await page.evaluate(() => {
      const box = document.querySelector("#diagram").getBoundingClientRect();
      return { top: box.top, height: box.height, nextTop: document.querySelector("#offscreen").getBoundingClientRect().top };
    });
    await page.addScriptTag({ path: path.join(__dirname, "../vendor/html-to-image.js") });
    await page.addScriptTag({ path: path.join(__dirname, "../boxes.js") });
    await page.addScriptTag({ path: path.join(__dirname, "../copy-feedback.js") });
    await page.evaluate(() => {
      window.notices = [];
      window.ChatGPTBoxes.install({ toast: (text, error) => window.notices.push({ text, error }) });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        async write(items) { window.clipboardItems = items; window.savedImage = await items[0].getType("image/png"); }
      } });
    });
    const icons = page.getByRole("button", { name: "复制区域图片", exact: true });
    assert.equal(await icons.count(), 2, "nested region cells and inline citations have no extra buttons");
    assert.equal(await icons.first().textContent(), "");
    const layout = await page.evaluate(() => {
      const box = document.querySelector("#diagram");
      const rect = box.getBoundingClientRect();
      const toolbar = box.querySelector('[data-chatgpt-box-toolbar]');
      const buttonRect = toolbar.getBoundingClientRect();
      return { top: rect.top, height: rect.height, nextTop: document.querySelector("#offscreen").getBoundingClientRect().top,
        position: getComputedStyle(toolbar).position, rightInset: rect.right - buttonRect.right, topInset: buttonRect.top - rect.top };
    });
    assert.deepEqual({ top: layout.top, height: layout.height, nextTop: layout.nextTop }, originalLayout);
    assert.equal(layout.position, "absolute");
    assert.ok(layout.topInset >= 6 && layout.topInset <= 8 && layout.rightInset >= 6 && layout.rightInset <= 8);
    await page.locator("#diagram").screenshot({ path: path.join(__dirname, "box-ui-preview.png") });
    // Give the toolbar an unmistakable color to prove it is omitted from PNG.
    await page.evaluate(() => document.querySelector('[data-chatgpt-box-toolbar]').style.backgroundColor = "rgb(255, 0, 255)");
    await icons.first().click();
    await page.waitForFunction(() => window.notices.length > 0);
    assert.equal(await icons.first().getAttribute("data-chatgpt-copy-state"), "success");
    assert.equal(await icons.first().getAttribute("title"), "已复制");
    await page.waitForFunction(() => !document.querySelector('[data-chatgpt-box-toolbar] button').hasAttribute('data-chatgpt-copy-state'));
    assert.equal(await icons.first().getAttribute("title"), "复制整个区域为图片");
    const png = await page.evaluate(async () => {
      const bitmap = await createImageBitmap(window.savedImage);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0);
      let green = 0, opaque = 0, magenta = 0;
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === 216 && pixels[i + 1] === 235 && pixels[i + 2] === 220) green++;
        if (pixels[i + 3] === 255) opaque++;
        if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 255) magenta++;
      }
      const result = { width: bitmap.width, height: bitmap.height, bytes: window.savedImage.size, type: window.savedImage.type, green, opaque, magenta };
      bitmap.close();
      return result;
    });
    assert.equal(png.type, "image/png");
    assert.equal(png.width, 1536);
    assert.equal(png.magenta, 0, "the overlaid toolbar is excluded from the image");
    assert.ok(png.bytes > 2000 && png.green > 50000 && png.opaque === png.width * png.height, JSON.stringify(png));
    // Save the rendered preview for visual verification without reading clipboard.
    await page.evaluate(async () => {
      const url = URL.createObjectURL(window.savedImage);
      const img = document.createElement("img"); img.id = "preview"; img.src = url;
      img.style.cssText = "position:fixed;inset:0;width:768px;z-index:999;background:white";
      document.body.append(img);
      await img.decode();
    });
    await page.locator("#preview").screenshot({ path: path.join(__dirname, "box-preview.png") });
    await page.evaluate(() => document.querySelector("#preview").remove());

    // Entire region is rendered even when below the viewport and taller than it.
    const offscreen = await page.evaluate(async () => {
      const blob = await window.ChatGPTBoxes.capture(document.querySelector("#offscreen"));
      const image = await createImageBitmap(blob);
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      const pixel = [...ctx.getImageData(40, image.height - 60, 1, 1).data];
      return { width: image.width, height: image.height, pixel };
    });
    assert.equal(offscreen.height, 1800);
    assert.deepEqual(offscreen.pixel, [200, 0, 0, 255]);

    await page.evaluate(() => {
      navigator.clipboard.write = async () => { throw new Error("denied"); };
      window.notices.length = 0;
    });
    await icons.first().click();
    await page.waitForFunction(() => window.notices.length > 0);
    assert.equal(await page.evaluate(() => window.notices[0].error), true);
    assert.equal(await icons.first().getAttribute("data-chatgpt-copy-state"), null);
    assert.equal(await icons.first().isEnabled(), true);
    await page.evaluate(() => document.querySelector("#offscreen").remove());
    await page.waitForFunction(() => document.querySelectorAll('[data-chatgpt-box-toolbar]').length === 1);
    await page.evaluate(() => {
      const box = document.createElement("div"); box.setAttribute("data-d-component", "box"); box.textContent = "动态区域";
      document.querySelector("main").append(box);
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-chatgpt-box-toolbar]').length === 2);
    console.log("PASS: outer regions only, PNG clipboard item, Chinese diagram rendering, colors and opaque background, full offscreen region, denied clipboard, dynamic insert/remove");
    console.log(JSON.stringify({ png, offscreen }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
