const { chromium } = require("playwright");
const path = require("node:path");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://chatgpt.com/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><body></body>" }));
    await page.goto("https://chatgpt.com/extension-test");
    await page.setContent(`<article data-talvt-turn-state="complete" id="first">
      <div class="MarkdownRoot-test" id="reply">
        <h2>启动流程</h2><p>先<strong>准备环境</strong>，再运行 <code>run()</code>。<a href="https://example.com/docs">文档</a></p>
        <div data-chatgpt-mermaid-preview id="chart1"><svg id="chatgpt-mermaid-test"><style>#chatgpt-mermaid-test{font-family:Arial}</style><text>节点标签</text></svg></div>
        <pre><code class="language-java">one();\n\n\n  two();</code></pre>
        <div data-code-block="true" data-markdown-copy="code-block">
          <div data-markdown-copy="exclude"><svg></svg><div>Java</div><div data-code-block-controls><button>Copy code</button></div></div>
          <div><pre><code>class Demo {}</code></pre></div>
        </div>
        <div data-code-block="true"><div data-markdown-copy="exclude">纯文本</div><pre><code>hello</code></pre></div>
        <p>大致调用链：</p>
        <div data-code-block="true" data-markdown-copy="code-block">
          <div data-markdown-copy="exclude"><div>纯文本</div><button aria-label="复制代码"></button></div>
          <div data-code-block-source="true"><code><span><span>ServletWebServerApplicationContext.onRefresh()</span>\n<span>    └── createWebServer()</span>\n<span>          └── ServletWebServerFactory.getWebServer()</span>\n<span>                └── 创建内嵌 Tomcat</span></span></code></div>
        </div>
        <table><tr><th>步骤</th><th>含义</th></tr><tr><td>run</td><td>启动</td></tr></table>
        <div data-chatgpt-mermaid-preview id="chart2"><svg><style>#bad-css{fill:red}</style></svg></div>
        <ol><li>第一步</li><li>第二步</li></ol>
        <blockquote id="quote"><p>第一段</p><p>第二段</p><p>第三段</p></blockquote>
        <blockquote id="quote-code"><p>示例</p><pre><code class="language-java">one();\n\n\n  two();</code></pre><p>结束</p></blockquote>
      </div>
      <div class="turn-action-controls"><button aria-label="复制"><svg viewBox="0 0 24 24"><path d="M8 8h12v12H8z"/></svg></button><button aria-label="评价回复"></button></div>
    </article><article id="second"><div class="MarkdownRoot-test"><p>另一个回复</p></div><div class="turn-action-controls"><button aria-label="复制"></button></div></article>`);
    await page.evaluate(() => {
      window.flow = 'flowchart TD\n    A["main()"] --> B["SpringApplication.run()"]';
      window.sequence = "sequenceDiagram\n    A->>B: start";
      // Match the currently observed React component props, rather than making
      // original Mermaid source artificially available in rendered text.
      document.querySelector("#chart1").__reactFiber$test = { memoizedProps: {}, return: { memoizedProps: { language: "mermaid", clipboardContent: window.flow } } };
      document.querySelector("#chart2").__reactFiber$test = { memoizedProps: { language: "mermaid", content: window.sequence } };
      window.copies = []; window.notices = [];
    });
    for (const name of ["copy-feedback.js", "tables.js", "mermaid-source.js", "markdown.js"]) await page.addScriptTag({ path: path.join(__dirname, "..", name) });
    await page.evaluate(() => window.ChatGPTMarkdown.install({
      copy: async text => window.copies.push(text), toast: (text, error) => window.notices.push({ text, error })
    }));
    const copy = page.locator("#first [data-chatgpt-clean-copy]");
    assert.equal(await copy.count(), 1);
    assert.equal(await copy.textContent(), "");
    assert.equal(await copy.locator("svg").count(), 1);
    assert.equal(await copy.getAttribute("title"), "复制 Markdown（保留 Mermaid 源码）");
    assert.equal(await copy.evaluate(el => el.previousElementSibling.getAttribute("aria-label")), "复制");
    assert.equal(await copy.evaluate(el => getComputedStyle(el).color), "rgb(13, 148, 136)");
    await copy.click();
    await page.waitForFunction(() => window.copies.length === 1);
    assert.equal(await copy.getAttribute("data-chatgpt-copy-state"), "success");
    assert.equal(await copy.getAttribute("title"), "已复制");
    await page.waitForFunction(() => !document.querySelector('#first [data-chatgpt-clean-copy]').hasAttribute('data-chatgpt-copy-state'));
    assert.equal(await copy.getAttribute("title"), "复制 Markdown（保留 Mermaid 源码）");
    const text = await page.evaluate(() => window.copies[0]);
    assert.ok(text.includes('```mermaid\nflowchart TD\n    A["main()"] --> B["SpringApplication.run()"]\n```'), text);
    assert.ok(text.includes("```mermaid\nsequenceDiagram\n    A->>B: start\n```"), text);
    assert.ok(text.includes("## 启动流程") && text.includes("**准备环境**"));
    assert.ok(text.includes("[文档](https://example.com/docs)"));
    assert.ok(text.includes("```java\none();\n\n\n  two();\n```"));
    assert.ok(text.includes("```java\nclass Demo {}\n```"), text);
    assert.ok(text.includes("```text\nhello\n```"), text);
    assert.ok(text.includes("大致调用链：\n\n```text\nServletWebServerApplicationContext.onRefresh()\n    └── createWebServer()\n          └── ServletWebServerFactory.getWebServer()\n                └── 创建内嵌 Tomcat\n```"), "source containers without PRE must remain fenced blocks with indentation");
    assert.ok(!text.includes("Java\n") && !text.includes("Copy code") && !text.includes("纯文本"), "toolbar labels must not leak into prose");
    assert.ok(text.includes("> 第一段\n>\n> 第二段\n>\n> 第三段"), text);
    assert.ok(!text.includes("> 第一段\n>\n>\n>"), "paragraph separators must not multiply inside quotes");
    assert.ok(text.includes("> ```java\n> one();\n>\n>\n>   two();\n> ```"), "quote markers must cover code lines without removing code whitespace");
    assert.ok(text.includes("| 步骤 | 含义 |\n| --- | --- |"));
    assert.ok(!text.includes("font-family") && !text.includes("chatgpt-mermaid") && !text.includes("bad-css") && !text.includes("节点标签"));
    assert.ok(!text.includes("另一个回复"));
    // A reply without diagrams works without the MAIN-world source reader.
    await page.locator("#second [data-chatgpt-clean-copy]").click();
    assert.equal(await page.evaluate(() => window.copies[1]), "另一个回复");
    // A source read failure must not replace valid clipboard content with CSS
    // or silently omit a diagram.
    await page.evaluate(() => { document.querySelector("#chart2").__reactFiber$test = null; window.notices.length = 0; });
    await copy.click();
    await page.waitForFunction(() => window.notices.length === 1);
    assert.equal(await page.evaluate(() => window.notices[0].error), true);
    assert.equal(await copy.getAttribute("data-chatgpt-copy-state"), null);
    assert.equal(await page.evaluate(() => window.copies.length), 2);
    // React can mount a new toolbar when switching chats.
    await page.evaluate(() => {
      const article = document.createElement("article");
      article.innerHTML = '<div class="MarkdownRoot-test"><p>新回复</p></div><div class="turn-action-controls"><button aria-label="Copy"></button></div>';
      document.body.append(article);
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-chatgpt-clean-copy]').length === 3);
    console.log("PASS: adjacent teal copy icon, Mermaid source recovery from component props, multiple diagrams, Markdown formatting, code whitespace, reply isolation, missing-source error, dynamic replies");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
