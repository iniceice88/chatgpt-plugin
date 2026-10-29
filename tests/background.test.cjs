const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("原生右键菜单使用指定父子标题，仅限 chatgpt.com", () => {
  const menus = [];
  const sent = [];
  let installed, clicked;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"), {
    chrome: {
      runtime: { onInstalled: { addListener(fn) { installed = fn; } } },
      contextMenus: {
        removeAll(fn) { menus.length = 0; fn(); },
        create(menu) { menus.push(menu); },
        onClicked: { addListener(fn) { clicked = fn; } }
      },
      tabs: { sendMessage(...args) { sent.push(args); return Promise.resolve(); } }
    }, console
  });
  installed();
  assert.equal(menus.length, 2);
  assert.equal(menus[0].title, "ChatGPT");
  assert.equal(menus[1].title, "复制为飞书格式");
  assert.equal(menus[1].parentId, menus[0].id);
  assert.equal(menus[1].documentUrlPatterns.join(), "https://chatgpt.com/*");
  installed();
  assert.equal(menus.length, 2);
  clicked({ menuItemId: "chatgpt" }, { id: 7 });
  assert.equal(sent.length, 0);
  clicked({ menuItemId: "copy-feishu", selectionText: "example", frameId: 0 }, { id: 7 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 7);
  assert.equal(sent[0][1].selectionText, "example");
});
