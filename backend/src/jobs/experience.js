// Robust experience-years extraction.
//
// Postings state experience in wildly different ways: "10+ years", "5–8
// years", "3 to 5 yrs", "up to 3 years", "minimum of 3 years", "0-1 Yr",
// "fresher / no experience required", or nothing numeric at all. Code that
// tries a separate regex per phrasing breaks the moment a new variant shows
// up (an en-dash instead of a hyphen, "yrs" instead of "years", a bare "3 to
// 5" instead of "3-5").
//
// This module is the opposite of that. It normalizes the text into one
// consistent shape first, then runs ONE general range parser over the result,
// so phrasing variation is absorbed by normalization instead of needing a new
// pattern. Concretely that fixes the class of bug where a posting said
// "10+ years" but a fragile pattern silently failed to match and the role was
// routed on a guessed value.
//
// The module is deliberately pure and synchronous: no network, no model, no
// randomness. Qualification years are derived deterministically from the raw
// text, so the number is trustworthy with or without AI support. A model
// outage (HTTP 400/429) falls back to this and a hallucinated model figure is
// overridden by it — AI can never be the thing that corrupts eligibility data
// or blocks a matching user.

// ---------------------------------------------------------------------------
// Step 1: normalize before ever matching. Dash variants, abbreviations and
// capitalization all collapse here once, before any regex runs, so a whole
// category of "it broke on X phrasing" bugs disappear instead of requiring a
// new pattern.
// ---------------------------------------------------------------------------
// Cardinal words used by postings that spell the requirement out ("a minimum
// of five years"). They are folded to digits in normalize(), the same way
// "yrs" -> "years" is, so they are absorbed by the single general parser
// instead of needing a whole second set of patterns.
const CARDINAL_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const TENS_WORDS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const UNIT_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const SINGLE_WORDS = Object.keys(CARDINAL_WORDS).filter((w) => !TENS_WORDS.includes(w));

// Folds spelled-out cardinals into digits: "five years" -> "5 years",
// "three to five years" -> "3 to 5 years", "ten+ years" -> "10+ years",
// "twenty five years" -> "25 years". Word-boundary matching keeps it from
// corrupting ordinary words ("someone", "fourth", "years"). Only ever used on
// the lowercased, whitespace-collapsed normalize() output.
export function expandNumberWords(text) {
  const s = String(text || "");
  // Tens + optional unit first ("twenty five", "twenty-five", "twenty").
  let out = s.replace(
    new RegExp(`\\b(${TENS_WORDS.join("|")})(?:[ -](${UNIT_WORDS.join("|")}))?\\b`, "g"),
    (whole, ten, unit) => {
      const base = CARDINAL_WORDS[ten];
      return String(base + (unit ? CARDINAL_WORDS[unit] : 0));
    }
  );
  // Then the remaining single words (zero..nineteen) that were not consumed.
  out = out.replace(
    new RegExp(`\\b(${SINGLE_WORDS.join("|")})\\b`, "g"),
    (whole, word) => String(CARDINAL_WORDS[word])
  );
  return out;
}

export function normalize(text) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/[\u2012\u2013\u2014\u2015]/g, "-") // en-dash, em-dash, etc -> hyphen
    .replace(/\byrs?\.?\b/g, "years") // yr, yrs, yr. -> years
    .replace(/\byoe\b/g, "years of experience") // yoe -> spelled out
    .replace(/\byear\b/g, "years") // singular "1 year" -> "1 years" so it matches
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
  // Fold spelled-out cardinals ("five years" -> "5 years") last, so the single
  // general parser only ever has to deal with digits.
  return expandNumberWords(s);
}

// ---------------------------------------------------------------------------
// Step 2: scope to the requirements section before looking for numbers. This
// cuts salary figures, travel percentages and "Fortune 500" out of the
// candidate set entirely, so a "10%" or a stray year in boilerplate is never
// mistaken for an experience requirement.
// ---------------------------------------------------------------------------
export function extractRequirementsSection(text) {
  // Lowercase up front so "Requirements"/"What we offer" headings match
  // regardless of case. The returned section is normalized later by
  // extractYears, which is case-insensitive, so lowercasing here is harmless.
  const s = String(text || "").toLowerCase();
  const startPatterns =
    /(?:requirements?|qualifications?|what you.?ll need|who you are|you have|must have|minimum qualifications)/;
  const endPatterns =
    /(?:what we offer|benefits|perks|compensation|what .*can offer|equal opportunity)/;
  const startMatch = s.search(startPatterns);
  if (startMatch === -1) return s;
  const rest = s.slice(startMatch);
  const endMatch = rest.search(endPatterns);
  return endMatch === -1 ? rest : rest.slice(0, endMatch);
}

// ---------------------------------------------------------------------------
// Step 3: one general range parser, not a list of special cases.
//
// Applied to normalized text, a single optional-group pattern handles a
// plus-form ("10+ years"), a hyphen range ("5-8 years"), a "to" range
// ("3 to 5 years") and a bare number ("5 years").
//
// NOTE on the bare-number case: a bare "N years of experience" is a FLOOR,
// not a ceiling. A posting that asks for "5 years" still accepts a candidate
// with 8, so it resolves to { min: N, max: null }. Capping max at N here would
// wrongly hide the posting from every more-senior candidate, which is exactly
// the destructive kind of wrong match this module exists to prevent.
// ---------------------------------------------------------------------------
const YEARS_PATTERN = /(\d{1,2})\s*(?:(\+)|-\s*(\d{1,2})|\s*to\s*(\d{1,2}))?\s*years/g;

function parseYearsMatch(match) {
  const [, first, plusSign, rangeEnd, toEnd] = match;
  const min = parseInt(first, 10);
  if (plusSign) return { min, max: null }; // "10+ years" -> open-ended
  if (rangeEnd) return { min, max: parseInt(rangeEnd, 10) }; // "5-8 years"
  if (toEnd) return { min, max: parseInt(toEnd, 10) }; // "3 to 5 years"
  return { min, max: null }; // bare "5 years" -> a floor, not a cap
}

// Two modifier patterns catch phrasing the core pattern does not, checked
// before falling back to it.
const AT_LEAST_PATTERN = /(?:at least|minimum(?: of)?)\s*(\d{1,2})\s*years/;
const UP_TO_PATTERN = /up to\s*(\d{1,2})\s*years/;

// Returns one of:
//   { min, max, confidence: 'high' }                     single concrete figure
//   { multiple: [{min,max}], confidence: 'needs-path-splitting' }
//                                                       more than one mention
//   { min: 0, max: null, confidence: 'medium' }          fresher / no experience
//   { min: null, max: null, confidence: 'none' }         genuinely nothing found
//
// `extractYears` normalizes its own input, so callers may pass scoped text
// straight in without worrying about dash/abbreviation variants.
export function extractYears(sectionText) {
  const text = normalize(sectionText);
  const atLeast = text.match(AT_LEAST_PATTERN);
  if (atLeast) return { min: parseInt(atLeast[1], 10), max: null, confidence: "high" };

  const upTo = text.match(UP_TO_PATTERN);
  if (upTo) return { min: 0, max: parseInt(upTo[1], 10), confidence: "high" };

  const matches = [...text.matchAll(YEARS_PATTERN)];
  if (matches.length === 0) return checkFresherKeywords(text);
  if (matches.length > 1) {
    // Multiple mentions in the requirements section are usually several
    // qualification paths ("B.Tech with 2+ years, or M.Tech with 0"), so they
    // are surfaced for splitting (see splitQualificationPaths) instead of
    // being collapsed into one guessed number.
    return { multiple: matches.map(parseYearsMatch), confidence: "needs-path-splitting" };
  }
  return { ...parseYearsMatch(matches[0]), confidence: "high" };
}

// ---------------------------------------------------------------------------
// Step 4: fresher / no-experience signals, only when there is no number at
// all. An explicit number always wins if one exists.
// ---------------------------------------------------------------------------
const FRESHER_KEYWORDS =
  /\b(fresher|freshers|entry.level|new grad|new graduate|recent graduate|campus hire|no prior experience|no experience required)\b/;

export function checkFresherKeywords(sectionText) {
  if (FRESHER_KEYWORDS.test(sectionText)) {
    // medium, not high: this is inferred from a label, not a stated number.
    return { min: 0, max: null, confidence: "medium" };
  }
  return { min: null, max: null, confidence: "none" };
}

// The highest education level named in a clause, used to pair each split
// clause with the degree it actually requires.
export function educationLevelOf(text) {
  const t = normalize(text);
  if (/(ph\.?\s?d|doctorate)/.test(t)) return "phd";
  if (/(master|m\.?\s?tech|m\.?\s?s(?:c)?\b|mba)/.test(t)) return "master";
  if (/(bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?s(?:c)?\b|undergrad)/.test(t)) return "bachelor";
  if (/\bassociate\b/.test(t)) return "associate";
  return "any";
}

// ---------------------------------------------------------------------------
// Step 5: multiple qualification paths. "Bachelor's with 2+ years, or
// Master's with 0 years" yields two years-mentions, which is the
// `needs-path-splitting` case. Split on "or" and pair each clause with the
// degree keyword nearest it so each accepted path keeps its own requirement
// instead of being collapsed into one number. Clauses with no concrete
// experience signal are dropped.
// ---------------------------------------------------------------------------
export function splitQualificationPaths(sectionText) {
  const clauses = normalize(sectionText).split(/\bor\b/);
  return clauses
    .map((clause) => ({
      education_level: educationLevelOf(clause),
      years: extractYears(clause),
    }))
    .filter((path) => path.years.confidence !== "none");
}

// ---------------------------------------------------------------------------
// Reduction helpers used by the deterministic extractor and the model
// reconciler.
// ---------------------------------------------------------------------------

// A single concrete, trustworthy experience figure for the whole section, or
// null. When the section lists several mentions (a multi-path posting) this
// returns null so per-path splitting / the model's own split is honoured
// rather than collapsing different requirements into one number.
export function authoritativeSingleYears(sectionText) {
  const r = extractYears(sectionText);
  if (r.multiple) return null;
  if ((r.confidence === "high" || r.confidence === "medium") && Number.isInteger(r.min)) {
    return { min: r.min, max: Number.isInteger(r.max) ? r.max : null };
  }
  return null;
}

// The smallest experience floor we can defend from the text, regardless of how
// many mentions there are. Used by the deterministic fallback: when a posting
// lists several figures, the lowest floor is the safest single number to store
// so a strict filter never over-gates a role. Returns null when the text has
// no concrete experience signal at all (the caller then falls back to a
// role-seniority default).
export function overallYears(sectionText) {
  const r = extractYears(sectionText);
  if (r.multiple) {
    const figures = r.multiple.map((y) => y.min).filter(Number.isInteger);
    if (figures.length === 0) return null;
    // A posting that lists several figures is usually stating cumulative,
    // sub-requirements ("10+ years total ... with 3+ years managing a team"),
    // not interchangeable alternatives. The role is gated by the STRONGEST of
    // them, so err to the larger figure: understating a requirement is exactly
    // how a senior role leaks to a fresher. (Genuine multi-degree alternatives
    // are handled as separate rows by the model path, not collapsed here.)
    return { min: Math.max(...figures), max: null };
  }
  if ((r.confidence === "high" || r.confidence === "medium") && Number.isInteger(r.min)) {
    return { min: r.min, max: Number.isInteger(r.max) ? r.max : null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Role-title seniority floor.
//
// A role title is a strong seniority signal in its own right. A listing called
// "Data Science Manager" or "Director, Engineering" is senior no matter what
// the free text or a model happens to say, so it must NEVER resolve to a
// 0-year minimum — that is how clearly experienced roles leak into a fresher's
// feed. Returns a positive floor for clearly senior titles and 0 for genuinely
// junior/neutral ones (intern, fresher, junior, analyst, engineer, ...), so it
// can be used as a hard lower bound on the parsed experience minimum.
// ---------------------------------------------------------------------------
export function titleExperienceFloor(role) {
  const r = String(role || "").toLowerCase();
  // Explicitly junior / entry titles are never floored.
  if (/\b(intern|internship|trainee|fresher|graduate|entry.?level|junior|assistant)\b/.test(r)) {
    return 0;
  }
  const rules = [
    [/president|director|principal|head|chief|\bvp\b|founder|co-?founder|staff|fellow|owner|senior\b/, 8],
    [/\b(manager|lead|architect|head)\b/, 6],
  ];
  for (const [re, years] of rules) {
    if (re.test(r)) return years;
  }
  return 0;
}
