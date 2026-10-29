(() => {
  "use strict";
  const selector = '[data-d-component="box"]';
  const marker = "data-chatgpt-box-toolbar";
  const anchor = "data-chatgpt-box-anchor";

  function isRegion(box) {
    return box.matches(selector) && !box.hasAttribute("data-d-inline") &&
      !box.parentElement?.closest(selector) &&
      !!box.closest('main, [data-message-author-role], [class*="DilResponseRoot-"]');
  }

  function background(box) {
    for (let node = box; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    }
    return getComputedStyle(document.documentElement).colorScheme.includes("dark") ? "#212121" : "#ffffff";
  }

  async function capture(box) {
    if (!box.isConnected) throw new Error("区域已移除，请重试");
    if (box.querySelector("iframe, video")) throw new Error("此区域包含视频或嵌入页面，暂不支持复制图片");
    await document.fonts.ready;
    const rect = box.getBoundingClientRect();
    const computed = getComputedStyle(box);
    const width = Math.ceil(Math.max(rect.width, box.scrollWidth + parseFloat(computed.borderLeftWidth || 0) + parseFloat(computed.borderRightWidth || 0)));
    const height = Math.ceil(Math.max(rect.height, box.scrollHeight + parseFloat(computed.borderTopWidth || 0) + parseFloat(computed.borderBottomWidth || 0)));
    if (!width || !height) throw new Error("区域尚未显示，请等待内容加载");
    // Bound canvas memory while retaining a sharp 2x image for normal diagrams.
    const pixelRatio = Math.min(2, 8192 / Math.max(width, height), Math.sqrt(16000000 / (width * height)));
    if (pixelRatio < 0.5) throw new Error("区域过大，请缩小内容后重试");
    const blob = await globalThis.htmlToImage.toBlob(box, {
      width, height, pixelRatio, backgroundColor: background(box),
      // No stylesheet scraping or webfont downloading; use the local font fallback.
      // This also avoids cross-origin stylesheet errors on ChatGPT.
      fontEmbedCSS: "",
      style: { margin: "0", overflow: "visible", maxWidth: "none", maxHeight: "none", boxSizing: "border-box" },
      filter: node => !node.hasAttribute?.(marker) && !node.hasAttribute?.("data-chatgpt-markdown-toolbar")
    });
    if (!blob || !blob.size) throw new Error("未能生成图片");
    return blob;
  }

  async function copyImage(box) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("当前浏览器不支持复制图片，请使用新版 Chrome 或 Edge");
    }
    // Start clipboard.write in the click handler, keeping the user gesture while
    // the promise renders the image. Rejections propagate to the visible error.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": capture(box) })]);
  }

  function install({ toast }) {
    const entries = new Map();
    let timer;
    const style = document.createElement("style");
    style.textContent = `[${anchor}] { position:relative } [${marker}] button:hover { background:rgba(128,128,128,.15)!important;opacity:1!important } [${marker}] button:focus-visible { outline:2px solid currentColor;outline-offset:2px } [${marker}] button:disabled { cursor:wait!important;opacity:.4!important }`;
    document.documentElement.append(style);
    function scan() {
      for (const [box, toolbar] of entries) {
        if (!box.isConnected || !toolbar.isConnected || !isRegion(box)) {
          toolbar.remove();
          box.removeAttribute(anchor);
          entries.delete(box);
        }
      }
      for (const box of document.querySelectorAll(selector)) {
        if (entries.has(box) || !isRegion(box)) continue;
        const toolbar = document.createElement("div");
        toolbar.setAttribute(marker, "");
        toolbar.style.cssText = "display:flex;position:absolute;top:6px;right:6px;margin:0;z-index:1";
        const button = document.createElement("button");
        button.type = "button";
        button.title = "复制整个区域为图片";
        button.setAttribute("aria-label", "复制区域图片");
        button.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:4px;border:0;border-radius:7px;background:transparent;color:inherit;opacity:.7;cursor:pointer";
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        for (const [key, value] of Object.entries({ width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
        const rect = document.createElementNS(svg.namespaceURI, "rect");
        for (const [key, value] of Object.entries({ x: "8", y: "8", width: "12", height: "13", rx: "2" })) rect.setAttribute(key, value);
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", "M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3");
        svg.append(rect, path);
        button.append(svg);
        button.addEventListener("click", async event => {
          event.preventDefault();
          event.stopPropagation();
          globalThis.ChatGPTCopyFeedback.start(button);
          button.disabled = true;
          try {
            await copyImage(box);
            globalThis.ChatGPTCopyFeedback.success(button);
            toast("区域图片已复制，可直接粘贴");
          } catch (error) {
            globalThis.ChatGPTCopyFeedback.reset(button);
            toast(`图片复制失败：${error.message || "浏览器未允许写入剪贴板"}`, true);
          } finally {
            button.disabled = false;
          }
        });
        toolbar.append(button);
        // Establish an anchor only for unpositioned boxes. The toolbar stays out
        // of normal flow and the capture filter omits it from the cloned image.
        if (getComputedStyle(box).position === "static") box.setAttribute(anchor, "");
        box.append(toolbar);
        entries.set(box, toolbar);
      }
    }
    // Throttle rather than debounce: continuously streaming responses should not
    // postpone toolbar installation indefinitely.
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; scan(); }, 150);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-d-component", "data-d-inline"] });
    scan();
  }

  globalThis.ChatGPTBoxes = { isRegion, capture, copyImage, install };
})();
