// Job listing extraction.
//
// Reliable qualification extraction (which degrees and how many years a
// posting accepts, whether it is new-grad only, and a short summary of the
// actual requirements/skills for display) needs to read messy free text, so
// a single model call per NEW listing produces those structured fields. This
// runs only once per newly-seen posting during the daily scrape, so the cost
// stays tiny. A deterministic parser is kept as the fallback so the pipeline
// still works if no model key is configured or the call fails.
//
// The structured country/remote fields come from deterministic parsing of the
// location string (the model is not needed for those). The raw requirement
// text is always preserved so a user can verify against the original.
import { jobChat } from "./llm.js";
import {
  authoritativeSingleYears,
  extractRequirementsSection,
  overallYears,
  titleExperienceFloor,
} from "./experience.js";

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
// needs). Uses the robust normalized parser so dash/abbreviation variants
// ("5–8 yrs", "0-1 Yr", "3 to 5 years") all resolve instead of silently
// failing. Ranges like "3-5 years" naturally resolve to their lower bound.
function explicitMinYears(text) {
  const overall = overallYears(extractRequirementsSection(text));
  return overall && Number.isInteger(overall.min) ? overall.min : null;
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

// A role title is a strong seniority signal in its own right. Regardless of
// what the free text or a model says, a clearly senior title (manager,
// director, president, head, staff, principal, senior, ...) must never resolve
// to a 0-year minimum, or the role would leak into a fresher's feed. This
// applies the title's floor as a hard LOWER BOUND on the parsed minimum — a
// figure from the text or model can raise it, but can never undercut a senior
// title below what the role actually demands.
function applyTitleFloor(paths, role) {
  const floor = titleExperienceFloor(role);
  if (floor <= 0) return paths;
  return (paths || []).map((p) => ({
    ...p,
    min_experience_years: Math.max(
      Number.isInteger(p.min_experience_years) ? p.min_experience_years : 0,
      floor
    ),
  }));
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
    /^(requirements?|qualifications?|minimum qualifications?|must haves?|you(?:'ll| will| would| should)? (?:need|have|bring|be able to)|we (?:need|require|look for|are looking for)|about you|who you are|(?:the )?ideal candidate|what you bring|skills?(?: and experience| required| needed)?|experience (?:required|needed)|responsibilities|what you(?:'ll| will) do|about the role|about this role|the role|role overview|job (?:summary|description)|key (?:skills|responsibilities))$/i.test(
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

// --- Structured section parser (deterministic) ---------------------------
// Postings are written with recognizable sections, so instead of hunting for
// numbers anywhere we bucket the text by its section headings and only treat
// the hard-requirement sections ("Minimum requirements", "Mandatory skills",
// "Qualifications", ...) as gates, while "Preferred / Good to have / Bonus"
// are explicitly NOT gates. This makes the no-model fallback much closer to a
// human reading the posting, and the model path stays the primary extractor.
function classifyHeading(line) {
  const t = line.replace(/[:.,]+$/, "").trim().toLowerCase();
  if (
    /^(requirements?|job requirements?|minimum requirements?|qualifications?|mandatory (?:skills?|requirements?|qualifications?)|must have|essential|you (?:must|should|need to) have|what we look for|what you(?:'ll| will)? need|about you|who you are|(?:the )?ideal candidate|what you bring|skills?(?: and experience| required)?$|experience (?:required|needed|qualifications?)|experience and qualifications?|additional requirements?|key (?:skills|requirements))$/i.test(
      t
    )
  ) {
    return "required";
  }
  if (
    /^(preferred qualifications?|good to have|nice to have|bonus(?: points)?|would be a plus|a plus|desired(?: skills)?|what would make you stand out|preferred)$/i.test(
      t
    )
  ) {
    return "preferred";
  }
  if (
    /^(responsibilities|about the role|about this role|the role|role overview|what you(?:'ll| will)? do|key responsibilities|day to day)$/i.test(
      t
    )
  ) {
    return "role";
  }
  if (
    /^(about us|about the company|our (?:impact|culture|values|mission|story|team)|who we are|life at|join us|why .+|we are an|equal opportunity)/i.test(
      t
    )
  ) {
    return "company";
  }
  return null;
}

// Parses degree + experience out of the structured requirement sections.
function parseStructuredRequirements(role, rawText) {
  const lines = String(rawText || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const buckets = { required: [], preferred: [], role: [] };
  let cur = null;
  for (const raw of lines) {
    if (raw.length < 2) continue;
    const h = classifyHeading(raw);
    if (h) {
      cur = h;
      continue;
    }
    if (cur && buckets[cur]) buckets[cur].push(raw);
  }

  const reqAndRole = `${buckets.required.join(" ")} ${buckets.role.join(" ")}`;
  const requiredText = buckets.required.join(" ");

  // Experience: one robust figure derived from the normalized requirements/
  // role text, so "5–8 years", "0-1 Yr", "3 to 5 yrs", "minimum of 3" all
  // resolve instead of silently failing on a phrasing variant. When a posting
  // lists several mentions (multiple accepted paths) the smallest stated floor
  // is used — never a guessed larger number — so a strict filter cannot
  // over-gate the role. A bounded range keeps its ceiling; a bare or plus
  // figure stays open-ended so a more-senior candidate is not wrongly capped.
  const overall = overallYears(reqAndRole);
  const minExp = overall && Number.isInteger(overall.min) ? overall.min : seniorityDefaultYears(role);
  const maxExp = overall && Number.isInteger(overall.max) ? overall.max : null;

  // Degree: only a degree stated inside a REQUIRED section gates matching.
  // A degree that only appears under "Good to have / Preferred" must not hide
  // the role from someone without it.
  const levels = [];
  const rt = requiredText.toLowerCase();
  if (/(ph\.?\s?d|doctorate)/.test(rt)) levels.push("phd");
  if (/(master|m\.?\s?tech|m\.?\s?s(?:c)?\b|mba)/.test(rt)) levels.push("master");
  if (/(bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?s(?:c)?\b|undergrad)/.test(rt)) levels.push("bachelor");
  if (levels.length === 0) levels.push("any");

  const paths = levels.map((education_level) => ({
    education_level,
    min_experience_years: minExp,
    max_experience_years: maxExp,
  }));

  // Fallback summary: the required + role content, bounded.
  const summarySrc = `${buckets.required.join("\n")}\n${buckets.role.join("\n")}`.trim();
  const summary = summarySrc.length > 900 ? `${summarySrc.slice(0, 900)}…` : summarySrc;

  return { qualification_paths: paths, requirements_summary: summary };
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
  const structured = parseStructuredRequirements(role, rawText);

  return {
    role,
    company: String(listing.company || "").trim(),
    location,
    location_country,
    is_remote: isRemote,
    remote_restricted_to,
    target_grad_year,
    qualification_paths: applyTitleFloor(structured.qualification_paths, role),
    requirements_summary: structured.requirements_summary || requirementsExcerpt(rawText, 900),
  };
}

// --- Model extraction ---------------------------------------------------
// A single call per new listing to reliably read degree/experience
// requirements and produce a concise requirements summary for display.
// temperature 0, JSON out, pinned to the same provider client used by the
// content pipeline. This is only ever invoked for listings not already in the
// jobs table, so the daily cost stays small.

function educationLevelFrom(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v || /^(any|none|not.required)$/.test(v)) return "any";
  if (/ph\.?d|doctorate/.test(v)) return "phd";
  if (/master|m\.?\s?tech|mba/.test(v)) return "master";
  if (/bachelor|b\.?\s?tech|b\.?\s?e\b|b\.?\s?s(?:c)?\b/.test(v)) return "bachelor";
  if (/associate/.test(v)) return "associate";
  return "any";
}

function years(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function extractionMessages(listing) {
  // Send only the requirements/qualifications excerpt (not the full posting
  // with company boilerplate, benefits, legal disclaimers), which keeps each
  // request small so the Groq model pool's per-minute token budget stretches
  // further. Falls back to the raw text if no requirement section is found.
  const text = requirementsExcerpt(String(listing.raw_text || ""), 2600);
  return [
    {
      role: "system",
      content: [
        "You extract structured job eligibility fields from a raw job description.",
        "Return ONLY a JSON object with this exact shape:",
        JSON.stringify(
          {
            is_new_grad_only: "boolean (true only if aimed at a specific graduating class/year)",
            target_grad_year: "integer|null (the graduation year a new-grad role targets, else null)",
            qualification_paths: [
              {
                education_level: "one of: any,associate,bachelor,master,phd",
                min_experience_years: "integer (minimum years required; 0 if none)",
                max_experience_years: "integer|null (upper bound, null if open-ended)",
              },
            ],
            requirements_summary:
              "string: 2-5 short bullet lines (use line breaks) quoting the actual requirements and key skills (degrees, years, tools/languages). Quote the posting, do not invent.",
          },
          null,
          2
        ),
        "Rules:",
        "- A posting can accept MULTIPLE paths (e.g. \"B.Tech + 2 years, or M.Tech + 0\"). Emit one",
        "  entry per accepted path, with that path's own experience. If no degree is required use 'any'.",
        "- Only set is_new_grad_only/target_grad_year when the posting targets a specific class.",
        "- requirements_summary must reflect ONLY what is in the text.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `Company: ${listing.company}\nRole: ${listing.role}\nLocation: ${listing.location}\n\nRaw job description:\n${text}`,
    },
  ];
}

// Reconciles model-provided qualification paths against the deterministic
// text parse.
//
// The model is good at structure (how many accepted paths, and which degree
// each needs) but a model can also hallucinate a number that the posting does
// not actually state — the exact failure that once routed a role on a guessed
// value. The deterministic regex over the real requirement text is the source
// of truth for a NUMBER, so whenever the text states one concrete overall
// figure it overrides the model's figure on every path. When the text lists
// several mentions (a true multi-path posting) or states no number at all, the
// model's own per-path structure is kept rather than collapsing it.
function reconcileModelPaths(paths, requirementsText) {
  const authoritative = authoritativeSingleYears(requirementsText);
  if (!authoritative) return paths;
  return (paths || []).map((p) => ({
    ...p,
    min_experience_years: authoritative.min,
    max_experience_years: authoritative.max,
  }));
}

async function extractWithModel(listing) {
  const res = await jobChat(extractionMessages(listing), {
    temperature: 0,
    json: true,
  });
  const p = JSON.parse(res.content);
  const paths = Array.isArray(p.qualification_paths)
    ? p.qualification_paths
        .map((x) => ({
          education_level: educationLevelFrom(x.education_level),
          min_experience_years: years(x.min_experience_years) ?? 0,
          max_experience_years: years(x.max_experience_years),
        }))
        .filter((x) => x.education_level !== "any" || true)
    : [];

  // The deterministic text parse always runs too, so a hallucinated or missing
  // model figure is corrected against what the posting actually says.
  const requirementsText = extractRequirementsSection(String(listing.raw_text || ""));
  const reconciled = reconcileModelPaths(paths, requirementsText);

  // Country/remote stay deterministic (a model is not needed for them).
  const location = String(listing.location || "").trim();
  const role = String(listing.role || "Untitled role").trim();
  const isRemote = listing.is_remote_hint === true || isRemoteText(location, role);
  const parsed = {
    role,
    company: String(listing.company || "").trim(),
    location,
    location_country: isRemote ? null : detectCountry(location),
    is_remote: isRemote,
    remote_restricted_to: isRemote ? remoteRestrictedTo(location) : null,
    target_grad_year: p.is_new_grad_only === true ? years(p.target_grad_year) : null,
    qualification_paths: applyTitleFloor(
      reconciled.length > 0 ? reconciled : detectQualificationPaths(role, requirementsText),
      role
    ),
    requirements_summary: String(p.requirements_summary || "").trim() || requirementsExcerpt(String(listing.raw_text || ""), 900),
  };
  return parsed;
}

// Orchestrator used by the sync job: prefer the model, fall back to the
// deterministic parser (e.g. no model key configured, or a transient failure)
// so the scrape never dies on an unavailable model.
export async function extractListing(listing) {
  try {
    return await extractWithModel(listing);
  } catch (err) {
    console.warn(`[jobs] model extraction failed for "${listing.role}", using heuristics: ${err.message}`);
    return parseListing(listing);
  }
}
