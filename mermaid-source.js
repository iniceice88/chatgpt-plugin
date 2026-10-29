// MAIN-world reader. It only returns source text for diagrams inside the reply
// explicitly marked by the isolated content script. It has no extension APIs.
(() => {
  "use strict";
  const requestEvent = "chatgpt-plugin:mermaid-request";
  const responseEvent = "chatgpt-plugin:mermaid-response";
  const selector = "[data-chatgpt-mermaid-preview], .mermaid";

  document.addEventListener(requestEvent, event => {
    let id;
    try { id = JSON.parse(event.detail).id; } catch { return; }
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) return;
    const root = document.querySelector(`[data-chatgpt-md-request="${id}"]`);
    if (!root) return;
    const diagrams = [...root.querySelectorAll(selector)].filter(node => !node.parentElement.closest(selector));
    const sources = diagrams.map(node => {
      const attribute = node.getAttribute("data-mermaid-source");
      if (attribute) return attribute;
      // Read only Mermaid component props, never the entire conversation state.
      const key = Object.keys(node).find(key => key.startsWith("__reactFiber$"));
      let fiber = key ? node[key] : null;
      for (let i = 0; fiber && i < 16; i++, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (props?.language?.toLowerCase?.() !== "mermaid") continue;
        const source = props.clipboardContent || props.content;
        if (typeof source === "string" && source.trim() && source.length < 1000000) return source;
      }
      const code = node.querySelector("code");
      return code?.textContent?.trim() || null;
    });
    document.dispatchEvent(new CustomEvent(responseEvent, { detail: JSON.stringify({ id, sources }) }));
  });
})();
