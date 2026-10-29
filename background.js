"use strict";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    const scope = {
      contexts: ["page", "selection", "link", "editable", "image"],
      documentUrlPatterns: ["https://chatgpt.com/*"]
    };
    chrome.contextMenus.create({ id: "chatgpt", title: "ChatGPT", ...scope });
    chrome.contextMenus.create({
      id: "copy-feishu", parentId: "chatgpt", title: "复制为飞书格式", ...scope
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "copy-feishu" || !tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "COPY_FEISHU", selectionText: info.selectionText || ""
  }, { frameId: info.frameId ?? 0 }).catch(error => {
    // Installing/reloading an extension requires refreshing existing ChatGPT tabs.
    console.warn("复制失败，请刷新 ChatGPT 页面后重试。", error);
  });
});
