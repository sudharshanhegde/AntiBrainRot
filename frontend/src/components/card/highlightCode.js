// Minimal, dependency-free syntax highlighter for the text_code card.
// It recognizes the constructs that actually appear in C, C++, and shell
// snippets (comments, strings, preprocessor lines and shell comments,
// numbers, keywords, and type names) and returns a flat list of
// { text, cls } spans. It never builds markup or HTML, so a generated
// snippet can never inject anything: React escapes every fragment when it
// renders the spans. Whitespace and line breaks are preserved verbatim.

const KEYWORDS = new Set([
  // C
  "auto", "break", "case", "const", "continue", "default", "do", "else",
  "enum", "extern", "for", "goto", "if", "inline", "register", "restrict",
  "return", "sizeof", "static", "struct", "switch", "typedef", "union",
  "volatile", "while", "_Atomic", "_Bool", "_Complex",
  // C++
  "alignas", "alignof", "and", "and_eq", "bitand", "bitor", "catch",
  "class", "compl", "concept", "constexpr", "consteval", "constinit",
  "const_cast", "co_await", "co_return", "co_yield", "decltype", "delete",
  "dynamic_cast", "explicit", "export", "false", "final", "friend",
  "mutable", "namespace", "new", "noexcept", "not", "not_eq", "nullptr",
  "operator", "or", "or_eq", "override", "private", "protected", "public",
  "reinterpret_cast", "requires", "static_assert", "static_cast", "template",
  "this", "thread_local", "throw", "true", "try", "typeid", "typename",
  "using", "virtual", "xor", "xor_eq",
]);

const TYPES = new Set([
  "bool", "char", "double", "float", "int", "long", "short", "signed",
  "unsigned", "void", "wchar_t", "size_t", "ssize_t", "ptrdiff_t",
  "intptr_t", "uintptr_t", "int8_t", "int16_t", "int32_t", "int64_t",
  "uint8_t", "uint16_t", "uint32_t", "uint64_t", "pid_t", "sig_atomic_t",
  "FILE", "std", "string", "vector",
]);

// Ordered so an earlier-starting token always wins: a string containing
// "//" is matched as a string because the opening quote is seen first, and
// a comment containing quotes is matched as a comment for the same reason.
const TOKEN_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d[\w.]*\b)|([A-Za-z_]\w*)/g;

export function highlightCode(code) {
  const text = String(code == null ? "" : code);
  const out = [];
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), cls: null });
    if (m[1]) {
      const isComment = m[1].startsWith("//") || m[1].startsWith("/*");
      out.push({ text: m[1], cls: isComment ? "tok-com" : "tok-meta" });
    } else if (m[2]) {
      out.push({ text: m[2], cls: "tok-str" });
    } else if (m[3]) {
      out.push({ text: m[3], cls: "tok-num" });
    } else {
      const word = m[4];
      const cls = KEYWORDS.has(word)
        ? "tok-kw"
        : TYPES.has(word)
          ? "tok-type"
          : null;
      out.push({ text: word, cls });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: null });
  return out;
}
