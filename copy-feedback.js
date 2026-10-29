(() => {
  "use strict";
  const states = new WeakMap();

  function reset(button) {
    const state = states.get(button);
    if (!state) return;
    clearTimeout(state.timer);
    button.replaceChildren(...state.nodes);
    button.title = state.title;
    button.removeAttribute("data-chatgpt-copy-state");
    states.delete(button);
  }

  function start(button) {
    // A second click cancels the previous success timer before starting again.
    reset(button);
    states.set(button, { nodes: [...button.childNodes], title: button.title });
    button.setAttribute("data-chatgpt-copy-state", "pending");
  }

  function success(button) {
    if (!states.has(button)) start(button);
    const state = states.get(button);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", "M5 12l4 4L19 6");
    svg.append(path);
    button.replaceChildren(svg);
    button.title = "已复制";
    button.setAttribute("data-chatgpt-copy-state", "success");
    clearTimeout(state.timer);
    state.timer = setTimeout(() => reset(button), 2000);
  }

  globalThis.ChatGPTCopyFeedback = { start, success, reset };
})();
