(() => {
  "use strict";
  const diagramSelector = "[data-chatgpt-mermaid-preview], .mermaid";
  const buttonMarker = "data-chatgpt-clean-copy";

  function diagramsIn(root) {
    return [...root.querySelectorAll(diagramSelector)].filter(node => !node.parentElement.closest(diagramSelector));
  }

  function readSources(root) {
    const diagrams = diagramsIn(root);
    if (!diagrams.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const cleanup = () => {
        clearTimeout(timeout);
        document.removeEventListener("chatgpt-plugin:mermaid-response", receive);
        root.removeAttribute("data-chatgpt-md-request");
      };
      const receive = event => {
        let data;
        try { data = JSON.parse(event.detail); } catch { return; }
        if (data.id !== id) return;
        cleanup();
        if (!Array.isArray(data.sources) || data.sources.length !== diagrams.length || data.sources.some(source => typeof source !== "string" || !source.trim())) {
          reject(new Error("未能读取部分 Mermaid 源码，请等待图表生成完成或刷新页面重试"));
        } else resolve(data.sources);
      };
      const timeout = setTimeout(() => { cleanup(); reject(new Error("Mermaid 源码读取超时，请重新加载插件并刷新页面")); }, 3000);
      document.addEventListener("chatgpt-plugin:mermaid-response", receive);
      root.setAttribute("data-chatgpt-md-request", id);
      document.dispatchEvent(new CustomEvent("chatgpt-plugin:mermaid-request", { detail: JSON.stringify({ id }) }));
    });
  }

  function toMarkdown(root, sources = []) {
    const sourceMap = new Map(diagramsIn(root).map((node, index) => [node, sources[index]]));
    const saved = [];
    const nonce = crypto.randomUUID();
    const hold = text => {
      const token = `\uE000${nonce}:${saved.length}\uE001`;
      saved.push({ token, text });
      return token;
    };
    const escape = text => text.replace(/\\/g, "\\\\").replace(/([`*_[\]~])/g, "\\$1").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fenced = (source, language = "") => {
      const ticks = "`".repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map(match => match[0].length + 1)));
      return hold(`${ticks}${language}\n${source.replace(/\n$/, "")}\n${ticks}`);
    };
    const normalize = text => text.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+\n/g, "\n\n").replace(/\n{3,}/g, "\n\n").trim();
    const expand = text => {
      for (const { token, text: value } of saved) text = text.replace(token, () => value);
      return text;
    };
    function codeBlock(pre, wrapper = pre.closest('[data-code-block="true"], [data-markdown-copy="code-block"]')) {
      const code = pre.querySelector("code") || pre;
      const languageClass = (code.className + " " + pre.className).match(/(?:language-|lang-)([\w+#-]+)/)?.[1];
      let language = code.getAttribute("data-language") || pre.getAttribute("data-language") || wrapper?.getAttribute("data-language") || languageClass || "";
      if (!language && wrapper) {
        const header = wrapper.querySelector('[data-markdown-copy="exclude"], [class*="ActionBar-"]')?.cloneNode(true);
        if (header) {
          header.querySelectorAll("button,svg,[data-code-block-controls]").forEach(node => node.remove());
          const label = header.textContent.trim().toLowerCase();
          const aliases = { "纯文本": "text", "plain text": "text", "plaintext": "text", "c++": "cpp", "c#": "csharp", "shell script": "bash" };
          language = aliases[label] || (/^[a-z][\w+#-]*$/.test(label) ? label : "");
        }
      }
      // The fence info string must stay on one line, even for future labels.
      language = /^[\w+#-]+$/.test(language) ? language.toLowerCase() : "";
      return "\n\n" + fenced(code.textContent, language) + "\n\n";
    }
    const children = node => [...node.childNodes].map(render).join("");
    function render(node) {
      if (node.nodeType === Node.TEXT_NODE) return escape(node.nodeValue.replace(/\s+/g, " "));
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      if (node.matches(`script,style,button,svg,noscript,[data-markdown-copy="exclude"],[${buttonMarker}],[data-chatgpt-markdown-toolbar],[data-chatgpt-box-toolbar]`)) return "";
      if (sourceMap.has(node)) {
        const source = sourceMap.get(node);
        if (!source) throw new Error("缺少 Mermaid 源码，已取消复制");
        return "\n\n" + fenced(source, "mermaid") + "\n\n";
      }
      if (node.matches(".katex-display, .katex")) {
        const source = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
        if (source) return hold(node.matches(".katex-display") ? `\n\n$$\n${source}\n$$\n\n` : `$${source}$`);
      }
      const tag = node.tagName;
      if (node.matches('[data-code-block="true"], [data-markdown-copy="code-block"]')) {
        const source = node.querySelector('pre, [data-code-block-source]');
        if (source) return codeBlock(source, node);
      }
      if (node.hasAttribute("data-code-block-source")) return codeBlock(node);
      if (tag === "BR") return "\n";
      if (tag === "HR") return "\n\n---\n\n";
      if (tag === "PRE") return codeBlock(node);
      if (tag === "CODE") {
        const text = node.textContent;
        const ticks = "`".repeat(Math.max(1, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1)));
        return hold(ticks + " " + text + " " + ticks);
      }
      if (tag === "TABLE") return "\n\n" + hold(globalThis.ChatGPTTables.toMarkdown(node).markdown) + "\n\n";
      if (tag === "IMG") return escape(node.getAttribute("alt") || "[图片]");
      const text = children(node);
      if (/^H[1-6]$/.test(tag)) return "\n\n" + "#".repeat(Number(tag[1])) + " " + text.trim() + "\n\n";
      if (tag === "STRONG" || tag === "B" || node.hasAttribute("data-d-default-strong")) return `**${text}**`;
      if (tag === "EM" || tag === "I") return `*${text}*`;
      if (tag === "DEL" || tag === "S") return `~~${text}~~`;
      if (tag === "A") {
        const href = node.getAttribute("href");
        return href && /^(https?:|mailto:|\/|#)/i.test(href) ? `[${text}](${node.href.replace(/\(/g, "%28").replace(/\)/g, "%29")})` : text;
      }
      if (tag === "LI") {
        const list = node.parentElement;
        const index = [...list.children].indexOf(node) + Number(list.getAttribute("start") || 1);
        const prefix = list.tagName === "OL" ? `${index}. ` : "- ";
        return prefix + text.trim().replace(/\n/g, "\n" + " ".repeat(prefix.length)) + "\n";
      }
      if (tag === "UL" || tag === "OL") return "\n\n" + text.trim() + "\n\n";
      if (tag === "BLOCKQUOTE") {
        // Paragraph renderers add their own separators. Collapse them before
        // adding quote markers, then expand protected code so every line is quoted.
        const quote = expand(normalize(text)).split("\n").map(line => line ? "> " + line : ">").join("\n");
        return "\n\n" + hold(quote) + "\n\n";
      }
      if (tag === "P") return "\n\n" + text.trim() + "\n\n";
      return text;
    }
    return expand(normalize(render(root)));
  }

  function findReply(button) {
    let parent = button.parentElement;
    for (let i = 0; parent && i < 8; i++, parent = parent.parentElement) {
      const root = parent.querySelector('[class*="MarkdownRoot-"], [data-message-author-role="assistant"], .markdown');
      if (root) return root;
    }
    return null;
  }

  function install({ copy, toast }) {
    const entries = new Map();
    let timer;
    const style = document.createElement("style");
    style.textContent = `[${buttonMarker}]:hover { background:rgba(13,148,136,.12)!important } [${buttonMarker}]:focus-visible { outline:2px solid #0d9488;outline-offset:2px }`;
    document.documentElement.append(style);
    function scan() {
      for (const [native, button] of entries) {
        if (!native.isConnected || !button.isConnected) { button.remove(); entries.delete(native); }
      }
      const natives = document.querySelectorAll('.turn-action-controls button[aria-label="复制"], .turn-action-controls button[aria-label="Copy"], button[data-testid="copy-turn-action-button"]');
      for (const native of natives) {
        if (entries.has(native) || !findReply(native)) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(buttonMarker, "");
        button.setAttribute("aria-label", "复制 Markdown（保留 Mermaid 源码）");
        button.title = "复制 Markdown（保留 Mermaid 源码）";
        button.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:3px;border:0;border-radius:6px;background:transparent;color:#0d9488;cursor:pointer";
        const icon = native.querySelector("svg");
        if (icon) { const clone = icon.cloneNode(true); clone.setAttribute("aria-hidden", "true"); button.append(clone); }
        else button.textContent = "⧉";
        button.addEventListener("click", async event => {
          event.preventDefault(); event.stopPropagation();
          globalThis.ChatGPTCopyFeedback.start(button);
          button.disabled = true;
          try {
            const root = findReply(native);
            if (!root) throw new Error("回复已移除，请重试");
            const sources = await readSources(root);
            const text = toMarkdown(root, sources);
            if (!text.trim()) throw new Error("回复尚无可复制内容");
            await copy(text);
            globalThis.ChatGPTCopyFeedback.success(button);
            toast("已复制 Markdown，Mermaid 图表已保留为源码代码块");
          } catch (error) {
            globalThis.ChatGPTCopyFeedback.reset(button);
            toast(`复制失败：${error.message}`, true);
          }
          finally { button.disabled = false; }
        });
        native.after(button);
        entries.set(native, button);
      }
    }
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; scan(); }, 150);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
  }

  globalThis.ChatGPTMarkdown = { readSources, toMarkdown, install };
})();
