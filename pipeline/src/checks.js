// Automated, machine-checkable validation rules from SKILL.md and
// SKILL_frontend.md. These run on every generated string before a deck
// can be accepted. Anything failing here is rejected and sent back for
// regeneration, never manually patched.

export const EM_DASH_RE = /[\u2013\u2014]/; // en dash, em dash
export const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const TEMPLATES = new Set(["text_only", "text_code", "text_diagram"]);

export function wordCount(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function checkString(text, label) {
  const issues = [];
  const value = text == null ? "" : String(text);
  if (EM_DASH_RE.test(value)) {
    issues.push(`${label}: contains an em dash or en dash`);
  }
  if (EMOJI_RE.test(value)) {
    issues.push(`${label}: contains an emoji`);
  }
  return issues;
}

// Validates a full deck object. Returns { ok, errors } where errors is
// a list of human-readable reasons to send back for regeneration.
export function checkDeck(deck) {
  const errors = [];
  if (!deck || typeof deck !== "object") {
    return { ok: false, errors: ["deck is not an object"] };
  }

  if (!Number.isInteger(deck.deck_index) || deck.deck_index < 0) {
    errors.push("deck_index must be a non-negative integer");
  }
  if (!Array.isArray(deck.cards) || deck.cards.length !== 10) {
    errors.push(
      `deck must have exactly 10 cards, got ${
        deck.cards ? deck.cards.length : "none"
      }`
    );
  }

  const seenOrders = new Set();
  for (const [i, card] of (deck.cards || []).entries()) {
    if (!card || typeof card !== "object") {
      errors.push(`card ${i}: not an object`);
      continue;
    }
    const at = (field) => `card ${card.order_index ?? i}.${field}`;

    if (!Number.isInteger(card.order_index)) {
      errors.push(`${at("order_index")}: must be an integer`);
    } else if (seenOrders.has(card.order_index)) {
      errors.push(`${at("order_index")}: duplicate`);
    } else {
      seenOrders.add(card.order_index);
    }

    if (typeof card.title !== "string" || !card.title.trim()) {
      errors.push(`${at("title")}: required string`);
    } else {
      if (wordCount(card.title) > 8) {
        errors.push(`${at("title")}: more than 8 words`);
      }
      errors.push(...checkString(card.title, at("title")));
    }

    if (typeof card.body !== "string" || !card.body.trim()) {
      errors.push(`${at("body")}: required string`);
    } else {
      const wc = wordCount(card.body);
      if (wc < 100 || wc > 200) {
        errors.push(`${at("body")}: word count ${wc}, expected 100-200`);
      }
      errors.push(...checkString(card.body, at("body")));
    }

    if (!TEMPLATES.has(card.template)) {
      errors.push(`${at("template")}: must be one of ${[...TEMPLATES].join(", ")}`);
    } else {
      if (card.template === "text_code") {
        if (
          typeof card.code_snippet !== "string" ||
          !card.code_snippet.trim()
        ) {
          errors.push(`${at("code_snippet")}: required for text_code`);
        } else {
          errors.push(...checkString(card.code_snippet, at("code_snippet")));
        }
      } else if (card.code_snippet != null && String(card.code_snippet).trim() !== "") {
        errors.push(`${at("code_snippet")}: should be null or empty for non-code templates`);
      }

      if (card.template === "text_diagram") {
        if (typeof card.diagram_ref !== "string" || !card.diagram_ref.trim()) {
          errors.push(`${at("diagram_ref")}: required for text_diagram`);
        } else {
          errors.push(...checkString(card.diagram_ref, at("diagram_ref")));
        }
      } else if (card.diagram_ref != null && String(card.diagram_ref).trim() !== "") {
        errors.push(`${at("diagram_ref")}: should be null or empty for non-diagram templates`);
      }
    }

    if (typeof card.concept !== "string" || !card.concept.trim()) {
      errors.push(
        `${at("concept")}: required short noun phrase for the coverage registry`
      );
    } else {
      errors.push(...checkString(card.concept, at("concept")));
    }
  }

  return { ok: errors.length === 0, errors };
}
