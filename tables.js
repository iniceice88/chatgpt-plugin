(function (root) {
  "use strict";

  function escapeText(text) {
    return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")
      .replace(/([`*_~\[\]])/g, "\\$1")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function cellText(node) {
    if (node.nodeType === 3) return escapeText(node.nodeValue);
    if (node.nodeType !== 1) return "";
    if (node.matches('button, script, style, svg, [aria-hidden="true"]')) return "";
    if (node.matches(".katex-display, .katex")) {
      const source = node.querySelector('annotation[encoding="application/x-tex"]');
      if (source) return "$" + source.textContent.trim().replace(/\|/g, "\\|") + "$";
    }
    if (node.tagName === "BR") return "\n";
    if (node.tagName === "IMG") return escapeText(node.getAttribute("alt") || "[图片]");
    const text = [...node.childNodes].map(cellText).join("");
    return /^(P|DIV|LI)$/.test(node.tagName) ? text + "\n" : text;
  }

  function toMarkdown(table) {
    const rows = [...table.rows].filter(row => row.closest("table") === table);
    const grid = [];
    let merged = false;
    rows.forEach((row, r) => {
      grid[r] ||= [];
      let column = 0;
      for (const cell of row.cells) {
        while (grid[r][column] !== undefined) column++;
        const rowspan = Math.min(cell.rowSpan === 0 ? rows.length - r : Math.max(1, cell.rowSpan), rows.length - r);
        const colspan = Math.max(1, cell.colSpan);
        if ((r + rowspan) * (column + colspan) > 100000) throw new Error("表格过大，无法转换");
        merged ||= rowspan > 1 || colspan > 1;
        const value = [...cell.childNodes].map(cellText).join("").trim()
          .replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
        for (let y = 0; y < rowspan; y++) {
          grid[r + y] ||= [];
          for (let x = 0; x < colspan; x++) grid[r + y][column + x] = x || y ? "" : value;
        }
        column += colspan;
      }
    });
    const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
    if (!width) throw new Error("表格尚无内容，请等待生成完成");
    const line = row => "| " + Array.from({ length: width }, (_, i) => row[i] ?? "").join(" | ") + " |";
    return {
      markdown: [line(grid[0]), line(Array(width).fill("---")), ...grid.slice(1).map(line)].join("\n"),
      merged
    };
  }

  function install({ copy, toast }) {
    const added = new Map();
    const marker = "data-chatgpt-markdown-toolbar";
    const anchor = "data-chatgpt-table-anchor";
    let timer;
    let positionFrame;
    function updatePositions() {
      positionFrame = undefined;
      for (const [table, { toolbar, container }] of added) {
        if (!table.isConnected) continue;
        const rect = table.getBoundingClientRect();
        const parent = container.getBoundingClientRect();
        // The DIL frame can be much wider than its centered table. Locate the
        // icon immediately outside its right edge, keeping its vertical position.
        toolbar.style.left = `${rect.right - parent.left - container.clientLeft + container.scrollLeft + 4}px`;
        toolbar.style.top = `${rect.top - parent.top - container.clientTop + container.scrollTop + 4}px`;
      }
    }
    function schedulePositions() {
      if (positionFrame === undefined) positionFrame = requestAnimationFrame(updatePositions);
    }
    const resizeObserver = new ResizeObserver(schedulePositions);
    window.addEventListener("resize", schedulePositions);
    document.addEventListener("scroll", schedulePositions, true);
    const style = document.createElement("style");
    style.textContent = `[${anchor}] { position:relative } [${marker}] button:hover { background:rgba(128,128,128,.15)!important;opacity:1!important } [${marker}] button:focus-visible { outline:2px solid currentColor;outline-offset:2px } [${marker}] button:disabled { cursor:wait!important;opacity:.4!important }`;
    document.documentElement.append(style);
    function nativeCopy(container) {
      return [...container.querySelectorAll("button")].some(button =>
        !button.closest(`[${marker}]`) &&
        /复制表格|copy\s*table/i.test([button.getAttribute("aria-label"), button.title, button.textContent].join(" ")));
    }
    function scan() {
      for (const [table, entry] of added) {
        if (!table.isConnected || !entry.toolbar.isConnected || nativeCopy(entry.container)) {
          entry.toolbar.remove();
          resizeObserver.unobserve(table);
          added.delete(table);
          if (![...added.values()].some(other => other.container === entry.container)) {
            entry.container.removeAttribute(anchor);
            resizeObserver.unobserve(entry.container);
          }
        }
      }
      for (const table of document.querySelectorAll("table")) {
        if (added.has(table) || !table.closest('main, [data-message-author-role], [class*="MarkdownRoot-"], [class*="DilResponseRoot-"]')) continue;
        const container = table.closest('[class*="TableContainer-"], [class*="TableFrame-"]') || table.parentElement;
        if (nativeCopy(container)) continue;
        const toolbar = document.createElement("div");
        toolbar.setAttribute(marker, "");
        toolbar.style.cssText = "display:flex;position:absolute;margin:0;z-index:1";
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-label", "复制表格为 Markdown");
        button.title = "复制为 Markdown";
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
            const result = toMarkdown(table);
            await copy(result.markdown);
            globalThis.ChatGPTCopyFeedback.success(button);
            toast(result.merged ? "表格已复制为 Markdown，合并单元格已展开" : "表格已复制为 Markdown");
          } catch (error) {
            globalThis.ChatGPTCopyFeedback.reset(button);
            toast(`复制失败：${error.message}`, true);
          } finally {
            button.disabled = false;
          }
        });
        toolbar.append(button);
        // Keep the overlay outside the scrolling viewport but locate it using
        // the table's own bounds, rather than the full-width frame.
        if (getComputedStyle(container).position === "static") container.setAttribute(anchor, "");
        container.append(toolbar);
        added.set(table, { toolbar, container });
        resizeObserver.observe(table);
        resizeObserver.observe(container);
      }
      updatePositions();
    }
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, 150);
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "title"]
    });
    scan();
  }

  const api = { toMarkdown, install };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChatGPTTables = api;
})(globalThis);
