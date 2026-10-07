import test from "node:test";
import assert from "node:assert/strict";
import { highlightCode } from "./highlightCode.js";

// The highlighter must never lose, reorder, or reflow the snippet: the
// concatenation of every span's text has to equal the input exactly, and
// whitespace including newlines and indentation stays intact.
function joined(tokens) {
  return tokens.map((t) => t.text).join("");
}

test("preserves the snippet exactly, including whitespace", () => {
  const code = "int main(void) {\n    return 0;\n}\n";
  assert.equal(joined(highlightCode(code)), code);
});

test("classifies line and block comments", () => {
  assert.deepEqual(highlightCode("// note")[0], { text: "// note", cls: "tok-com" });
  assert.deepEqual(highlightCode("/* a */"), [{ text: "/* a */", cls: "tok-com" }]);
});

test("classifies strings, numbers, keywords, and types", () => {
  const tokens = highlightCode('return "x" + 42;');
  assert.ok(tokens.some((t) => t.text === "return" && t.cls === "tok-kw"));
  assert.ok(tokens.some((t) => t.text === '"x"' && t.cls === "tok-str"));
  assert.ok(tokens.some((t) => t.text === "42" && t.cls === "tok-num"));
  const typed = highlightCode("unsigned x;");
  assert.ok(typed.some((t) => t.text === "unsigned" && t.cls === "tok-type"));
});

test("treats a preprocessor line or shell comment as a meta token", () => {
  assert.deepEqual(highlightCode("#include <stdio.h>")[0], {
    text: "#include <stdio.h>",
    cls: "tok-meta",
  });
  assert.deepEqual(highlightCode("# SIGTERM, cleanup allowed")[0], {
    text: "# SIGTERM, cleanup allowed",
    cls: "tok-meta",
  });
});

test("does not mistake a comment marker inside a string", () => {
  const tokens = highlightCode('char *s = "// not a comment";');
  assert.ok(tokens.some((t) => t.text === '"// not a comment"' && t.cls === "tok-str"));
  assert.ok(!tokens.some((t) => t.cls === "tok-com"));
});
