(function (root) {
  "use strict";

  function wrapMath(source) {
    return "$$" + source.trim() + "$$";
  }

  function convert(text) {
    // Preserve existing $$ equations atomically, so \[ inside them is untouched.
    // Code examples also stay literal. A selection consisting solely of LaTeX
    // inside a code block is deliberately converted by the caller as plain text.
    return text.replace(
      /(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*(?=\n|$))|(`+)[^\n]*?\3|\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/gm,
      (match, fence, fenceMark, ticks, dollars, display, inline) => {
        if (fence || ticks) return match;
        return wrapMath(dollars ?? display ?? inline);
      }
    );
  }

  const api = { convert, wrapMath };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ChatGPTFeishu = api;
})(globalThis);
