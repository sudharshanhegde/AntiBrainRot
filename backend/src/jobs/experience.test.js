// Unit tests for the robust experience-years extractor.
//
// Run from the backend directory:  node --test src/jobs/experience.test.js
//
// These encode the regression table that must stay green: each row is a real
// phrasing variant that a fragile per-pattern matcher used to silently break
// on (en-dashes, "yrs", "to" ranges, "YOE", fresher labels, internal leveling).
// If a future change to normalization or the parser breaks any of these, the
// test fails immediately instead of being noticed months later.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  extractYears,
  overallYears,
  authoritativeSingleYears,
  splitQualificationPaths,
  extractRequirementsSection,
} from "./experience.js";

// Runs the whole SKILL test-case table through extractYears and checks the
// resulting min/max. `expectedConfidence` is optional.
function assertYears(input, expectedMin, expectedMax, expectedConfidence) {
  const r = extractYears(input);
  assert.equal(
    r.min,
    expectedMin,
    `"${input}" -> expected min ${expectedMin}, got ${r.min} (confidence ${r.confidence})`
  );
  assert.equal(
    r.max,
    expectedMax,
    `"${input}" -> expected max ${expectedMax}, got ${r.max} (confidence ${r.confidence})`
  );
  if (expectedConfidence) assert.equal(r.confidence, expectedConfidence);
}

test("normalize collapses dash variants, abbreviations and case", () => {
  assert.equal(normalize("5\u2013 8 Yrs"), "5- 8 years"); // en-dash -> hyphen
  assert.equal(normalize("5\u2014 8 Yrs"), "5- 8 years"); // em-dash -> hyphen
  assert.equal(normalize("3+ YOE"), "3+ years of experience");
  assert.equal(normalize("  0-1  Yr  "), "0-1 years");
});

test("SKILL test-case table: plus, range, to, at-least, minimum, up-to, 0-N", () => {
  assertYears("10+ years experience in enterprise presales", 10, null, "high"); // the JFrog case
  assertYears("5-8 years of experience", 5, 8, "high");
  assertYears("3 to 5 years of relevant experience", 3, 5, "high");
  assertYears("at least 5 years", 5, null, "high");
  assertYears("minimum of 3 years", 3, null, "high");
  assertYears("up to 3 years of experience", 0, 3, "high");
  assertYears("0-2 years experience", 0, 2, "high");
  assertYears("0-1 Yr", 0, 1, "high"); // "Yr" normalized to "years"
  assertYears("3+ YOE", 3, null, "high"); // "YOE" normalized
});

test("fresher / no-experience labels resolve to 0 only when no number is stated", () => {
  const fresher = extractYears("Fresher / entry level, no prior experience required");
  assert.equal(fresher.confidence, "medium"); // inferred from a label, not a number
  assert.equal(fresher.min, 0);
  assert.equal(fresher.max, null);

  // An explicit number always beats a fresher keyword.
  const explicit = extractYears("Fresher welcome, but 3+ years preferred");
  assert.equal(explicit.confidence, "high");
  assert.equal(explicit.min, 3);
});

test("bare 'N years' is a floor, not a ceiling (never wrongly caps seniors)", () => {
  // "5 years" requirement must accept a candidate with 8 years, so max stays null.
  const r = extractYears("Minimum of 5 years of experience required");
  assert.equal(r.min, 5);
  assert.equal(r.max, null);
  // overallYears / authoritativeSingleYears also leave it open-ended.
  assert.deepEqual(overallYears("5 years of experience"), { min: 5, max: null });
  assert.deepEqual(authoritativeSingleYears("5 years of experience"), { min: 5, max: null });
});

test("multiple qualification paths are split per clause with their own degree", () => {
  const input = "Bachelor's with 2+ years of experience, or Master's with 0 years";
  const res = extractYears(input);
  assert.equal(res.confidence, "needs-path-splitting");
  assert.ok(Array.isArray(res.multiple) && res.multiple.length === 2);

  const paths = splitQualificationPaths(input);
  const bachelors = paths.find((p) => p.education_level === "bachelor");
  const masters = paths.find((p) => p.education_level === "master");
  assert.ok(bachelors, "expected a bachelor path");
  assert.ok(masters, "expected a master path");
  assert.equal(bachelors.years.min, 2);
  assert.equal(masters.years.min, 0);
});

test("internal leveling with no plain-language years is genuinely 'none'", () => {
  const r = extractYears("L5 (internal leveling, no years stated)");
  assert.equal(r.confidence, "none");
  assert.equal(r.min, null);
  assert.equal(r.max, null);
  // No authoritative figure -> a caller must NOT fabricate one from this text.
  assert.equal(authoritativeSingleYears("L5 (internal leveling, no years stated)"), null);
  assert.equal(overallYears("L5 (internal leveling, no years stated)"), null);
});

test("overallYears collapses multiple mentions to the lowest floor (safe fallback)", () => {
  // Two figures in one section with no degree split available: the lowest
  // floor is stored so a strict filter never over-gates the role.
  assert.deepEqual(
    overallYears("5+ years with Java and 3+ years with Kubernetes"),
    { min: 3, max: null }
  );
});

test("extractRequirementsSection scopes numbers out of boilerplate", () => {
  // A stray "years" in company boilerplate / perks must never become an
  // experience requirement. The section ends before "What we offer", so only
  // the real requirement figure is seen.
  const full =
    "Founded in 1995 with 30 years of history.\n\n" +
    "Requirements\n- 5+ years of hands-on SQL\n" +
    "What we offer\n8 years of stock options and free lunch";
  const section = extractRequirementsSection(full);
  assert.ok(!/8 years/.test(section), "perks boilerplate should be cut");
  assert.equal(extractYears(section).min, 5);
});
