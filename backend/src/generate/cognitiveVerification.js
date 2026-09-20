// Deterministic answer verification for the cognitive tests pipeline.
//
// The generation flow is generate-then-validate (a clean second LLM pass),
// the same two-pass discipline as the topic decks and Quick Bites. For two
// of the four categories a plain-code check is both cheaper and strictly
// more reliable than a second model call:
//
//   - logical/relational: a question like "Ravi is taller than Meera. Meera
//     is taller than Arjun. Who is the shortest?" states its own ordering, so
//     the ordering can be built and the claimed answer checked against it.
//   - numerical: a question whose text carries an arithmetic expression can
//     be evaluated directly and compared to the claimed option.
//
// The rule this module follows is deliberately conservative: it only returns
// a hard verdict when it could actually parse the question and reach a
// definite answer. When it cannot parse, it reports `checked: false` and the
// LLM validation pass is left to stand. It never fails a question just
// because the shape was unfamiliar, and it only rejects when the claimed
// correct option demonstrably contradicts the deterministic result.

// Relation vocabulary for ordering questions. Each entry maps a comparative
// ("taller") to the attribute stem it compares ("tall") and the direction:
// sign +1 means "A is R than B" => A > B on that stem, sign -1 means A < B.
const RELATIONS = {
  taller: { stem: "tall", sign: 1 },
  shorter: { stem: "tall", sign: -1 },
  faster: { stem: "fast", sign: 1 },
  slower: { stem: "fast", sign: -1 },
  older: { stem: "age", sign: 1 },
  younger: { stem: "age", sign: -1 },
  heavier: { stem: "weight", sign: 1 },
  lighter: { stem: "weight", sign: -1 },
  stronger: { stem: "strength", sign: 1 },
  weaker: { stem: "strength", sign: -1 },
};

// Superlatives that can appear in the question, mapped to the stem and
// whether the wanted entity is the maximum or the minimum on that stem.
const SUPERLATIVES = {
  tallest: { stem: "tall", want: "max" },
  shortest: { stem: "tall", want: "min" },
  fastest: { stem: "fast", want: "max" },
  slowest: { stem: "fast", want: "min" },
  oldest: { stem: "age", want: "max" },
  youngest: { stem: "age", want: "min" },
  heaviest: { stem: "weight", want: "max" },
  lightest: { stem: "weight", want: "min" },
  strongest: { stem: "strength", want: "max" },
  weakest: { stem: "strength", want: "min" },
};

const CANNOT_DETERMINE_RE = /cannot be determined|can't be determined|not enough information/i;

function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// Parses "A is <relation> than B" statements out of a question's text.
function parseStatements(text) {
  const edgesByStem = new Map(); // stem -> array of [greater, lesser]
  const entitiesByStem = new Map();
  const addEdge = (stem, greater, lesser) => {
    if (!edgesByStem.has(stem)) edgesByStem.set(stem, []);
    edgesByStem.get(stem).push([greater, lesser]);
    if (!entitiesByStem.has(stem)) entitiesByStem.set(stem, new Set());
    entitiesByStem.get(stem).add(greater);
    entitiesByStem.get(stem).add(lesser);
  };

  const re = /([A-Za-z][A-Za-z .'-]*?)\s+is\s+([a-z]+)\s+than\s+([A-Za-z][A-Za-z .'-]*?)(?=[.,;!?]|$)/gi;
  let match;
  let found = false;
  while ((match = re.exec(text)) !== null) {
    const relation = RELATIONS[match[2].toLowerCase()];
    if (!relation) continue;
    const a = normalizeName(match[1]);
    const b = normalizeName(match[3]);
    if (!a || !b || a === b) continue;
    found = true;
    const { stem, sign } = relation;
    if (sign > 0) addEdge(stem, a, b);
    else addEdge(stem, b, a);
  }
  return found ? { edgesByStem, entitiesByStem } : null;
}

// Transitive closure: returns true when `from` is greater than `to`.
function makesGreater(adj, from, to) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const node = stack.pop();
    for (const next of adj.get(node) || []) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

// Verifies a logical/relational ordering question. Returns
// { checked, ok, reason, answer }.
function verifyOrdering(questionText, correctOptionText) {
  const parsed = parseStatements(questionText);
  if (!parsed) return { checked: false };

  const superlativeMatch = questionText
    .toLowerCase()
    .match(/\b(tallest|shortest|fastest|slowest|oldest|youngest|heaviest|lightest|strongest|weakest)\b/);
  if (!superlativeMatch) return { checked: false };

  const { stem, want } = SUPERLATIVES[superlativeMatch[1]];
  const edges = parsed.edgesByStem.get(stem);
  const entities = parsed.entitiesByStem.get(stem);
  if (!edges || !entities || entities.size < 2) return { checked: false };

  const adj = new Map();
  for (const [greater, lesser] of edges) {
    if (!adj.has(greater)) adj.set(greater, new Set());
    adj.get(greater).add(lesser);
  }

  // An entity is a valid max when it is greater than every other entity
  // (path exists to each); a valid min when every other entity is greater
  // than it.
  const list = [...entities];
  const valid = list.filter((e) =>
    list.every((other) => {
      if (other === e) return true;
      return want === "max" ? makesGreater(adj, e, other) : makesGreater(adj, other, e);
    })
  );

  // Only a unique, fully determined extreme is checkable. Anything else
  // (a tie, or a partial order that does not settle who is extreme) means
  // the honest answer is "cannot be determined".
  if (valid.length !== 1) return { checked: false };
  const answer = valid[0];

  const claimed = normalizeName(correctOptionText);
  const cannotDetermine = CANNOT_DETERMINE_RE.test(correctOptionText || "");

  if (cannotDetermine) {
    return {
      checked: true,
      ok: false,
      reason: `ordering is determined (${answer}) but the answer claims it cannot be determined`,
    };
  }
  if (claimed && claimed !== answer) {
    return {
      checked: true,
      ok: false,
      reason: `deterministic ordering says "${answer}", answer claims "${correctOptionText}"`,
    };
  }
  return { checked: true, ok: true, answer };
}

// Guarded arithmetic evaluator. Only accepts a string built from digits,
// whitespace and + - * / ( ) . so it can never execute anything but math.
function safeEval(expression) {
  const cleaned = String(expression).replace(/\s+/g, "");
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${cleaned});`)();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

// Verifies a numerical question that carries an arithmetic expression. It
// extracts the longest candidate expression, evaluates it, and compares the
// result to the option texts. Only a definite conflict (the computed value
// appears in a different option and not in the claimed answer) is a hard
// failure; anything ambiguous is left unchecked.
function verifyArithmetic(questionText, optionTexts, correctOptionText) {
  const candidates = questionText.match(/\d+(?:\.\d+)?(?:\s*[+\-*/]\s*\d+(?:\.\d+)?)+/g);
  if (!candidates || candidates.length === 0) return { checked: false };

  // Longest candidate is the most likely intended expression.
  const expression = [...candidates].sort((a, b) => b.length - a.length)[0];
  const value = safeEval(expression);
  if (value === null) return { checked: false };

  const round = (n) => Math.round(n * 100) / 100;
  const containsValue = (text) => {
    const nums = String(text || "").match(/-?\d+(?:\.\d+)?/g);
    if (!nums) return false;
    return nums.some((n) => Math.abs(Number(n) - value) < 1e-6);
  };

  const correctHas = containsValue(correctOptionText);
  const conflicting = (optionTexts || []).filter((t) => containsValue(t) && !correctHas);

  if (correctHas) return { checked: true, ok: true, value: round(value) };
  if (conflicting.length > 0) {
    return {
      checked: true,
      ok: false,
      reason: `expression "${expression}" = ${round(value)}, but that value is one of the other options`,
    };
  }
  return { checked: false };
}

// Entry point used by the generation job. `question` is the generated
// question object; `correctOptionText` is resolved from its options.
export function verifyCognitiveQuestion(question, correctOptionText, optionTexts) {
  const category = question && question.category;
  const text = String((question && question.question_text) || "");
  if (!text) return { checked: false };

  if (category === "logical") {
    return verifyOrdering(text, correctOptionText);
  }
  if (category === "numerical") {
    return verifyArithmetic(text, optionTexts || [], correctOptionText);
  }
  return { checked: false };
}
