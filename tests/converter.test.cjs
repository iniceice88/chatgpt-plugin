const { test } = require("node:test");
const assert = require("node:assert/strict");
const { convert } = require("../converter.js");

test("用户的中文展示公式转为飞书格式", () => {
  assert.equal(convert(String.raw`\[
\text{预计输出行数} \approx rows \times \frac{filtered}{100}
\]`), String.raw`$$\text{预计输出行数} \approx rows \times \frac{filtered}{100}$$`);
});

test("混合正文、行内公式、多个展示公式", () => {
  assert.equal(convert(String.raw`设 \( x_1 \) 成立。
\[a+b\]，\[c+d\]`), "设 $$x_1$$ 成立。\n$$a+b$$，$$c+d$$");
});

test("已有公式去除边缘空白，重复转换结果不变", () => {
  const result = convert("$$ \\frac{x}{2} $$\n$$y$$");
  assert.equal(result, "$$\\frac{x}{2}$$\n$$y$$");
  assert.equal(convert(result), result);
});

test("代码示例和价格保持原样", () => {
  const text = "价格 $100，代码 `\\[x\\]`\n```latex\n\\[x\\]\n```\n";
  assert.equal(convert(text), text);
});

test("不转换不完整公式，保留多行对齐环境", () => {
  assert.equal(convert(String.raw`\[x`), String.raw`\[x`);
  assert.equal(convert(String.raw`\[\begin{aligned}a&=b\\c&=d\end{aligned}\]`),
    String.raw`$$\begin{aligned}a&=b\\c&=d\end{aligned}$$`);
});
