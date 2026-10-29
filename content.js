(() => {
  "use strict";
  const { convert, wrapMath } = globalThis.ChatGPTFeishu;
  let context = { text: "", message: null };
  let toastTimer;

  function mathAncestor(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.closest(".katex-display") || element?.closest(".katex");
  }

  function serialize(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return "";
    const tag = node.nodeName;
    if (["SCRIPT", "STYLE", "BUTTON", "SVG"].includes(tag)) return "";
    if (tag === "BR") return "\n";
    if (tag === "IMG") return node.getAttribute("alt") || "[图片]";
    if (tag === "PRE") {
      const code = node.querySelector("code") || node;
      const text = code.textContent;
      const ticks = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));
      return "\n" + ticks + "\n" + text + "\n" + ticks + "\n";
    }
    const text = [...node.childNodes].map(serialize).join("");
    if (tag === "CODE") {
      const ticks = "`".repeat(Math.max(1, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));
      return ticks + " " + text + " " + ticks;
    }
    if (tag === "LI") {
      const siblings = [...(node.parentNode?.children || [])];
      const marker = node.parentNode?.nodeName === "OL"
        ? `${Number(node.parentNode.getAttribute("start") || 1) + siblings.indexOf(node)}. ` : "- ";
      return marker + text.trim() + "\n";
    }
    if (tag === "TR") return text + "\n";
    if (tag === "TD" || tag === "TH") return text + "\t";
    if (/^(P|DIV|SECTION|ARTICLE|BLOCKQUOTE|H[1-6]|UL|OL|TABLE)$/.test(tag)) return "\n" + text + "\n";
    return text;
  }

  function extract(fragment) {
    // Replace the outer KaTeX node once: visual HTML and hidden MathML otherwise
    // duplicate the formula. Only use the source annotation, never visual glyphs.
    for (const math of fragment.querySelectorAll(".katex-display, .katex")) {
      if (!fragment.contains(math)) continue;
      const source = math.querySelector('annotation[encoding="application/x-tex"]');
      if (source) math.replaceWith(document.createTextNode(wrapMath(source.textContent)));
    }
    return convert(serialize(fragment).replace(/\n{3,}/g, "\n\n").trim());
  }

  document.addEventListener("contextmenu", event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const message = target?.closest("[data-message-author-role]");
    context = { text: "", message };
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const parts = [];
    for (let index = 0; index < selection.rangeCount; index++) {
      const range = selection.getRangeAt(index).cloneRange();
      // Expand a partly selected rendered formula to recover its complete source.
      const start = mathAncestor(range.startContainer);
      const end = mathAncestor(range.endContainer);
      if (start) range.setStartBefore(start);
      if (end) range.setEndAfter(end);
      const fragment = range.cloneContents();
      // Selecting the contents of a code example should still convert raw LaTeX.
      parts.push(extract(fragment));
    }
    context.text = parts.join("\n");
  }, true);

  function toast(text, failed = false) {
    let host = document.getElementById("chatgpt-feishu-copy-toast");
    if (!host) {
      host = document.createElement("div");
      host.id = "chatgpt-feishu-copy-toast";
      host.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:2147483647;pointer-events:none";
      host.attachShadow({ mode: "open" });
      document.documentElement.append(host);
    }
    const box = document.createElement("div");
    box.style.cssText = `background:${failed ? "#9f2424" : "#165c45"};color:white;padding:12px 18px;border-radius:10px;font:14px/1.5 system-ui;box-shadow:0 4px 18px #0003;max-width:360px`;
    box.setAttribute("role", "status");
    box.textContent = text;
    host.shadowRoot.replaceChildren(box);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => host.remove(), 4000);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can fail when native context menus temporarily take focus.
      const active = document.activeElement;
      const selection = window.getSelection();
      const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.append(area);
      try {
        area.select();
        if (!document.execCommand("copy")) throw new Error("浏览器未允许写入剪贴板");
      } finally {
        area.remove();
        active?.focus({ preventScroll: true });
        if (selection) {
          selection.removeAllRanges();
          ranges.forEach(range => selection.addRange(range));
        }
      }
    }
  }

  globalThis.ChatGPTTables.install({ copy, toast });
  globalThis.ChatGPTBoxes.install({ toast });
  globalThis.ChatGPTMarkdown.install({ copy, toast });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "COPY_FEISHU") return;
    (async () => {
      try {
        const text = context.text || convert(message.selectionText || "") ||
          (context.message?.isConnected ? extract(context.message.cloneNode(true)) : "");
        if (!text.trim()) throw new Error("请先选中对话内容，或在一条消息内右键");
        await copy(text);
        toast("已复制为飞书格式，可粘贴到飞书文档");
        sendResponse({ ok: true });
      } catch (error) {
        toast(`复制失败：${error.message}`, true);
        sendResponse({ ok: false, error: error.message });
      }
    })();
    return true;
  });
})();
