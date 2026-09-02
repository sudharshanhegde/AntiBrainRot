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

// --- Strict requirement extraction (degree + experience) ----------------
// Every listing gets at least one concrete qualification path so the feed can
// filter strictly against the user's profile instead of showing everything.
// A role's requirement is read from the description when it is stated, with
// a seniority-based fallback derived from the role title when it is not, so a
// 0-experience user never sees clearly senior roles and the feed stays
// curated (no infinite scroll of everything). No model is used.

// The smallest "N years" figure stated in the text (the minimum a candidate
// needs). Ranges like "3-5 years" naturally resolve to their lower bound.
function explicitMinYears(text) {
  const m = text.match(/(\d{1,2})\s*(?:\+)?\s*years?/gi);
  if (!m) return null;
  const nums = m.map((s) => Number(s.replace(/\D/g, ""))).filter((n) => n < 60);
  if (nums.length === 0) return null;
  return Math.min(...nums);
}

// Fallback minimum experience from role seniority when the text is silent.
function seniorityDefaultYears(role) {
  const r = role.toLowerCase();
  if (/\bintern|internship|trainee|fresher|graduate/.test(r)) return 0;
  const rules = [
    [/director|principal|head|vp\b|chief/.test(r) && true, 8],
    [/manager|lead|staff|architect/.test(r), 6],
    [/\bsenior\b/.test(r), 4],
    [/associate|analyst|junior|executive|support/.test(r), 0],
  ];
  for (const [hit, years] of rules) {
    if (hit) return years;
  }
  return 0;
}

// The degree level(s) a posting will accept, as distinct tracks. When no
// degree is mentioned at all, a single "any" track is used (no degree gate).
function degreeTracks(role, rawText) {
  const t = `${role || ""} ${rawText || ""}`.toLowerCase();
  const tracks = [];
  if (/(ph\.?\s?d|doctorate)/.test(t)) tracks.push("phd");
  if (/(master|m\.?\s?tech|m\.?\s?s(?:c)?\b|mba)/.test(t)) tracks.push("master");
  if (/(bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?s(?:c)?\b|undergrad)/.test(t)) tracks.push("bachelor");
  if (tracks.length === 0) tracks.push("any");
  return tracks;
}

// Builds the qualification paths for one listing. Never returns an empty
// array.
function detectQualificationPaths(role, rawText) {
  const text = `${role || ""} ${rawText || ""}`;
  const stated = explicitMinYears(text);
  const minYears = stated != null ? stated : seniorityDefaultYears(role);

  const paths = degreeTracks(role, rawText).map((education_level) => ({
    education_level,
    min_experience_years: minYears,
    max_experience_years: null,
  }));
  return paths.filter(
    (p, i, arr) => arr.findIndex((q) => q.education_level === p.education_level) === i
  );
}

// Requirement-section excerpt.
//
// A posting's raw description almost always opens with heavy company
// boilerplate ("About us", "Our impact", product marketing) before it gets to
// the actual role, and that boilerplate is useless to a candidate. This
// deterministically pulls out the role-specific section: it skips leading
// company copy and returns the "About the role / Requirements /
// Qualifications / You have / skills" portion, capped at `max` characters.
// It is not perfect (postings are not written consistently) but it removes
// the "random info" that was being shown whole on each card.
export function requirementsExcerpt(rawText, max = 1600) {
  if (!rawText) return "";
  const lines = rawText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  // Headings that mark role/requirement content (good place to start).
  const isReqHeading = (l) =>
    /^(requirements?|qualifications?|minimum qualifications?|must haves?|you(?:'ll| will| would| should)? (?:need|have|bring|be able to)|we (?:need|require|look for|are looking for)|skills?(?: and experience| required| needed)?|experience (?:required|needed)|responsibilities|what you(?:'ll| will) do|about the role|about this role|the role|role overview|job (?:summary|description)|key (?:skills|responsibilities))$/i.test(
      l
    );
  // Headings that mark boilerplate / apply sections (stop here).
  const isStopHeading = (l) =>
    /^(about us|about the company|about (the )?(?:organisation|organization)|our (?:impact|culture|story|mission|values|benefits)|who we are|benefits|what we offer|perks?|how to apply|to apply|apply(?: now| here)?|equal opportunity|life at|follow us|learn more|watch our|visit our|backed by|join us|connect with us|get in touch)/i.test(
      l
    );

  // Prefer the first requirement heading; otherwise the first role heading;
  // otherwise start at the top (already role-ish or heading-less prose).
  let start = -1;
  let fallbackRole = -1;
  for (let i = 0; i < lines.length; i++) {
    if (start < 0 && isReqHeading(lines[i])) start = i;
    if (fallbackRole < 0 && /^(about the role|the role|responsibilities|job (summary|description))/i.test(lines[i])) fallbackRole = i;
    if (start >= 0) break;
  }
  if (start < 0) start = fallbackRole >= 0 ? fallbackRole : 0;

  // Stop at the first boilerplate/apply heading after the start.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (isStopHeading(lines[i])) {
      end = i;
      break;
    }
  }

  let out = lines.slice(start, end).join("\n").trim();
  if (out.length > max) {
    let cut = out.slice(0, max);
    const nl = cut.lastIndexOf("\n");
    out = (nl > max * 0.6 ? cut.slice(0, nl) : cut) + "\n…";
  }
  return out;
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
