// Automated, machine-checkable validation rules (mirrors the pipeline
// checks.js). These are hard gates in the automated job: a deck that
// fails any of these is never published, no matter what the LLM judge
// says.

// SKILL_quiz.md: a deck is now concept, quiz, concept, quiz, repeated.
// 10 concepts plus their 10 quiz cards = 20 cards. Even positions are
// concept cards, odd positions are the quiz that immediately follows.
export const DECK_SIZE = 20;

export const EM_DASH_RE = /[\u2013\u2014]/;
export const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

const TEMPLATES = new Set(["text_only", "text_code", "text_diagram"]);
const OPTION_IDS = new Set(["a", "b", "c", "d"]);

export function wordCount(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function checkString(text, label) {
  const issues = [];
  const value = text == null ? "" : String(text);
  if (EM_DASH_RE.test(value)) issues.push(`${label}: contains an em dash or en dash`);
  if (EMOJI_RE.test(value)) issues.push(`${label}: contains an emoji`);
  return issues;
}

// SKILL_quiz.md validation checklist for a quiz card:
// - exactly one correct_option_id matching one of the four option ids
// - no duplicate option text among the four choices
// - question and options pass the em dash / emoji checks
// The "correct answer is supported by the preceding concept body" check
// is the LLM validation pass, not machine-checkable.
function checkQuizCard(card, at, conceptCard, errors) {
  if (typeof card.question !== "string" || !card.question.trim()) {
    errors.push(`${at("question")}: required string, one sentence about the preceding card`);
  } else {
    errors.push(...checkString(card.question, at("question")));
  }

  const options = Array.isArray(card.options) ? card.options : [];
  if (options.length !== 4) {
    errors.push(`${at("options")}: must have exactly 4 options, got ${options.length}`);
  } else {
    const ids = new Set();
    const texts = new Set();
    for (const opt of options) {
      if (!opt || typeof opt !== "object") {
        errors.push(`${at("options")}: each option must be an object { id, text }`);
        continue;
      }
      if (!OPTION_IDS.has(opt.id)) {
        errors.push(`${at("options")}: option id "${opt.id}" must be one of a/b/c/d`);
      } else if (ids.has(opt.id)) {
        errors.push(`${at("options")}: duplicate option id "${opt.id}"`);
      } else {
        ids.add(opt.id);
      }
      if (typeof opt.text !== "string" || !opt.text.trim()) {
        errors.push(`${at("options")}: option ${opt.id}.text required`);
      } else {
        const trimmed = opt.text.trim();
        if (texts.has(trimmed)) {
          errors.push(`${at("options")}: duplicate option text "${opt.text}"`);
        } else {
          texts.add(trimmed);
        }
        errors.push(...checkString(opt.text, `${at("options")}.${opt.id}.text`));
      }
    }
  }

  if (typeof card.correct_option_id !== "string" || !card.correct_option_id) {
    errors.push(`${at("correct_option_id")}: required, exactly one of a/b/c/d`);
  } else if (!OPTION_IDS.has(card.correct_option_id)) {
    errors.push(`${at("correct_option_id")}: must be one of a/b/c/d, got "${card.correct_option_id}"`);
  } else if (options.length === 4 && !options.some((o) => o.id === card.correct_option_id)) {
    errors.push(`${at("correct_option_id")}: "${card.correct_option_id}" does not match any option id`);
  }

  if (!conceptCard) {
    errors.push(`${at("tests_card_id")}: quiz card must be immediately preceded by the concept card it tests`);
  } else if (card.tests_card_id !== conceptCard.order_index) {
    errors.push(
      `${at("tests_card_id")}: must equal the preceding concept card's order_index (${conceptCard.order_index}), got ${card.tests_card_id}`
    );
  }
}

export function checkDeck(deck) {
  const errors = [];
  if (!deck || typeof deck !== "object") {
    return { ok: false, errors: ["deck is not an object"] };
  }
  if (!Number.isInteger(deck.deck_index) || deck.deck_index < 0) {
    errors.push("deck_index must be a non-negative integer");
  }
  if (!Array.isArray(deck.cards) || deck.cards.length !== DECK_SIZE) {
    errors.push(
      `deck must have exactly ${DECK_SIZE} cards (concept, quiz, repeated), got ${deck.cards ? deck.cards.length : "none"}`
    );
  }

  const seenOrders = new Set();
  for (const [i, card] of (deck.cards || []).entries()) {
    if (!card || typeof card !== "object") {
      errors.push(`card ${i}: not an object`);
      continue;
    }
    const at = (field) => `card ${card.order_index ?? i}.${field}`;

    if (!Number.isInteger(card.order_index)) errors.push(`${at("order_index")}: must be an integer`);
    else if (seenOrders.has(card.order_index)) errors.push(`${at("order_index")}: duplicate`);
    else seenOrders.add(card.order_index);

    // Alternation: even array positions are concept cards, odd are quiz.
    const expectedType = i % 2 === 0 ? "concept" : "quiz";
    if (card.type !== expectedType) {
      errors.push(`${at("type")}: expected "${expectedType}" at array position ${i}, got "${card.type || "undefined"}"`);
    }

    if (card.type === "quiz") {
      checkQuizCard(card, at, (deck.cards || [])[i - 1], errors);
      continue;
    }

    // Concept card checks (the original card schema).
    if (typeof card.title !== "string" || !card.title.trim()) {
      errors.push(`${at("title")}: required string`);
    } else {
      if (wordCount(card.title) > 8) errors.push(`${at("title")}: more than 8 words`);
      errors.push(...checkString(card.title, at("title")));
    }

    if (typeof card.body !== "string" || !card.body.trim()) {
      errors.push(`${at("body")}: required string`);
    } else {
      const wc = wordCount(card.body);
      if (wc < 100 || wc > 200) errors.push(`${at("body")}: word count ${wc}, expected 100-200`);
      errors.push(...checkString(card.body, at("body")));
    }

    if (!TEMPLATES.has(card.template)) {
      errors.push(`${at("template")}: must be one of ${[...TEMPLATES].join(", ")}`);
    } else {
      if (card.template === "text_code") {
        if (typeof card.code_snippet !== "string" || !card.code_snippet.trim()) {
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
      errors.push(`${at("concept")}: required short noun phrase for coverage`);
    } else {
      errors.push(...checkString(card.concept, at("concept")));
    }
  }

  return { ok: errors.length === 0, errors };
}
