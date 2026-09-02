// Job listing extraction (deterministic, no LLM).
//
// The ATS source APIs already give us structured role, company, and location
// fields, so this layer only fills in the fields that are NOT structured in
// the raw feed: which country a posting is based in, whether it is remote
// (and restricted to a country if so), and whether it is a new-grad role with
// a target graduation year. Everything here is plain, deterministic parsing
// over the adapter's structured fields plus the raw description text — no
// model call, no cost, no extra moving part.
//
// This is intentionally conservative and "fail-open": whenever a field
// cannot be determined confidently it is left null rather than guessed, and
// the consumer treats an unknown location as not-worth-hiding. The raw
// requirement text is preserved alongside these fields so the user can read
// the actual requirements and self-screen.

// Ordered country/city recognizers. Order matters: the first country whose
// token matches the location string wins, so the more specific/common
// recognizers come first. Tokens deliberately avoid short ambiguous ones.
const COUNTRY_RECOGNIZERS = [
  { country: "India", re: /(india|bengaluru|bangalore|mumbai|bombay|hyderabad|pune|chennai|gurgaon|gurugram|noida|new delhi|delhi|kolkata|ahmedabad|kochi|coimbatore|indore)/i },
  { country: "United States", re: /(united states|\busa\b|u\.?s\.?a\.?|san francisco|new york|seattle|austin|mountain view|palo alto|redwood city|boston|chicago|atlanta|los angeles)/i },
  { country: "United Kingdom", re: /(united kingdom|\buk\b|england|britain|london|manchester)/i },
  { country: "Canada", re: /(canada|toronto|vancouver|ottawa|montreal|waterloo)/i },
  { country: "Germany", re: /(germany|berlin|munich|hamburg)/i },
  { country: "Singapore", re: /(singapore)/i },
  { country: "United Arab Emirates", re: /(united arab emirates|\buae\b|dubai|abu dhabi)/i },
  { country: "Netherlands", re: /(netherlands|amsterdam|rotterdam)/i },
  { country: "Australia", re: /(australia|sydney|melbourne)/i },
  { country: "France", re: /(france|paris)/i },
  { country: "Japan", re: /(japan|tokyo)/i },
];

function detectCountry(text) {
  if (!text) return null;
  for (const r of COUNTRY_RECOGNIZERS) {
    if (r.re.test(text)) return r.country;
  }
  return null;
}

// Remote detection is best-effort and drawn from the structured location
// field (and role title), NOT the whole description, so phrases like
// "we are a remote-first company" do not misclassify an on-site role.
function isRemoteText(location, role) {
  return /\bremote\b/i.test(`${location || ""} ${role || ""}`);
}

// For a remote posting, decide the country it is actually restricted to, if
// the posting states one. Drawn from the location string (e.g. "Remote –
// India" or "Remote (US)"), so an explicit restriction is honoured while a
// bare "Remote" stays open (null = worldwide).
function remoteRestrictedTo(location) {
  if (!location) return null;
  if (/\bremote\b/i.test(location)) {
    return detectCountry(location.replace(/\bremote\b/gi, " "));
  }
  return null;
}

// New-grad target graduation year, when the posting is specifically aimed at
// a graduating class (e.g. "2026/2027 graduates", "graduating in 2026",
// "2027 passouts"). Returns null for general experienced-hire roles.
function detectTargetGradYear(role, rawText) {
  const text = `${role || ""} ${rawText || ""}`;
  // "graduat(e|es|ing|ed) ... 20XX" and "20XX ... (graduates|grad|passout|batch)"
  const m =
    text.match(/graduat(?:e|es|ing|ed)?[^.\n]{0,40}?(20\d{2})/i) ||
    text.match(/(20\d{2})\s*(?:graduates?|graduation|grad|pass(?:ed)?\s?outs?|batch)/i);
  if (!m) return null;
  const year = Number(m[1]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

// Best-effort education/experience summary drawn from the requirement text.
// Returns an informational list of qualification paths. This is deliberately
// lightweight (no model): it surfaces what is clearly stated and leaves the
// fields empty when the wording is ambiguous, so the caller can fail open
// rather than wrongly hide a role.
function detectQualificationPaths(role, rawText) {
  const text = `${role || ""} ${rawText || ""}`.toLowerCase();
  const isIntern = /\bintern\b/.test(text) || /internship/.test(text);

  const hasBachelors = /(bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?s(?:c)?\b|undergrad)/.test(text);
  const hasMasters = /(master|m\.?\s?tech|m\.?\s?s(?:c)?\b|mba)/.test(text);
  const hasPhD = /(ph\.?\s?d|doctorate)/.test(text);

  // Smallest stated "N years" figure, 0 when none is stated (entry-level).
  const yearMatches = text.match(/(\d{1,2})\s*(?:\+)?\s*years?/g) || [];
  let minYears = 0;
  if (yearMatches.length > 0) {
    const nums = yearMatches.map((s) => Number(s.replace(/\D/g, ""))).filter((n) => n < 60);
    if (nums.length > 0) minYears = Math.min(...nums);
  }

  const levels = [];
  if (hasPhD) levels.push("phd");
  if (hasMasters) levels.push("master");
  if (hasBachelors) levels.push("bachelor");
  // No degree keyword: interns are typically bachelor-track; otherwise leave
  // the role open rather than inventing a requirement.
  if (levels.length === 0) {
    if (isIntern) levels.push("bachelor");
    else return [];
  }

  const paths = levels.map((education_level) => ({
    education_level,
    min_experience_years: minYears,
    max_experience_years: null,
  }));
  // Dedupe by education level.
  return paths.filter(
    (p, i, arr) => arr.findIndex((q) => q.education_level === p.education_level) === i
  );
}

// Parses one raw adapter listing into the structured fields stored on the
// jobs table. Pure and synchronous — no network, no model.
export function parseListing(listing) {
  const location = String(listing.location || "").trim();
  const role = String(listing.role || "Untitled role").trim();
  const rawText = String(listing.raw_text || "").trim();

  const isRemote = listing.is_remote_hint === true || isRemoteText(location, role);
  const location_country = isRemote ? null : detectCountry(location);
  const remote_restricted_to = isRemote ? remoteRestrictedTo(location) : null;
  const target_grad_year = detectTargetGradYear(role, rawText);

  return {
    role,
    company: String(listing.company || "").trim(),
    location,
    location_country,
    is_remote: isRemote,
    remote_restricted_to,
    target_grad_year,
    qualification_paths: detectQualificationPaths(role, rawText),
  };
}
