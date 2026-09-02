import { chat } from "../generate/deepseek.js";

// Job listing extraction and validation.
//
// A job's required experience range, degree requirement, and target
// graduation year have to be pulled out of unstructured description text,
// so this is an LLM parsing step — the same kind of task as the content
// pipeline's generation. But the cost of a mistake here is different: a user
// might skip a role they qualified for, or waste time on one they did not.
// So the raw requirement text is preserved alongside whatever structured
// fields are extracted, and a separate validation pass checks the structured
// fields are actually supported by the raw text before a listing is stored.

// Allowed education levels, ordered from least to most. "none"/"associate"
// are accepted from free-form text but normalized to "bachelor"/"master"
// handling is left to matching (a bachelor role requires at least a
// bachelor). Postings rarely demand less than a bachelor for these roles.
const EDUCATION_LEVELS = new Set(["associate", "bachelor", "master", "phd"]);

function normalizeEducation(value) {
  const v = String(value || "").toLowerCase().trim();
  if (!v) return null;
  if (/(ph\.?d|doctorate|doctoral)/.test(v)) return "phd";
  if (/master|m\.?s|m\.?tech|mba/.test(v)) return "master";
  if (/bachelor|b\.?s|b\.?tech|b\.?e|undergrad/.test(v)) return "bachelor";
  if (/associate/.test(v)) return "associate";
  return null;
}

function normalizeYears(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

// Builds the system + user prompt for extracting structured fields from one
// listing's raw description.
function extractionMessages(listing) {
  return [
    {
      role: "system",
      content: [
        "You extract structured job eligibility fields from raw job description text.",
        "Return ONLY a JSON object with this exact shape:",
        JSON.stringify(
          {
            role: "string",
            company: "string",
            location: "string (clean summary of where the role is based)",
            location_country: "string|null (country name, or null if unknown)",
            is_remote: "boolean (whether the posting is remote)",
            remote_restricted_to:
              "string|null (if remote, the country it is actually limited to, else null; null means open globally)",
            is_new_grad_role:
              "boolean (true only if the posting is specifically for recent/new graduates with a target year)",
            target_grad_year:
              "integer|null (graduation year required, only for new-grad roles, else null)",
            qualification_paths: [
              {
                education_level: "one of: associate,bachelor,master,phd",
                min_experience_years: "integer (0 if none)",
                max_experience_years: "integer|null (null if open-ended)",
              },
            ],
          },
          null,
          2
        ),
        "Rules:",
        "- A posting often accepts MULTIPLE paths (e.g. \"Bachelor's plus 2 years, or Master's plus 0\").",
        "  Emit one qualification_paths entry per accepted path.",
        "- experience years come from the requirements text, NOT the whole description.",
        "- Only set target_grad_year / is_new_grad_role=true when the posting is explicitly for",
        "  current/recent students with a graduation window (e.g. \"2026 or 2027 graduates\").",
        "- location_country is the country implied by the location string. A remote role may still",
        "  have remote_restricted_to set when the posting says remote workers must live in one country.",
        "- If no qualification info exists, return qualification_paths: [].",
      ].join("\n"),
    },
    {
      role: "user",
      content: `Company: ${listing.company}\nRole title from feed: ${listing.role}\nLocation from feed: ${listing.location}\n\nRaw job description:\n${listing.raw_text || "(no description)"}`,
    },
  ];
}

// Pass 1: extraction. Returns the parsed structured fields.
export async function extractListing(listing) {
  const res = await chat(extractionMessages(listing), {
    temperature: 0,
    json: true,
    topic: `jobs:${listing.company}`,
  });
  const parsed = JSON.parse(res.content);

  const paths = Array.isArray(parsed.qualification_paths)
    ? parsed.qualification_paths
        .map((p) => ({
          education_level: normalizeEducation(p.education_level),
          min_experience_years: normalizeYears(p.min_experience_years) ?? 0,
          max_experience_years: normalizeYears(p.max_experience_years),
        }))
        .filter((p) => p.education_level && EDUCATION_LEVELS.has(p.education_level))
    : [];

  const isNewGrad = Boolean(parsed.is_new_grad_role);
  return {
    role: String(parsed.role || listing.role || "Untitled role").trim(),
    company: String(parsed.company || listing.company || "").trim(),
    location: String(parsed.location || listing.location || "").trim(),
    location_country: parsed.location_country
      ? String(parsed.location_country).trim()
      : null,
    is_remote: Boolean(parsed.is_remote),
    remote_restricted_to: parsed.remote_restricted_to
      ? String(parsed.remote_restricted_to).trim()
      : null,
    target_grad_year: isNewGrad ? normalizeYears(parsed.target_grad_year) : null,
    qualification_paths: paths,
  };
}

// Pass 2: validation. A separate DeepSeek call with clean context checks
// that the extracted structured fields are actually supported by the raw
// text, mirroring the content pipeline's generate-then-validate split.
function validationMessages(listing, extracted) {
  return [
    {
      role: "system",
      content: [
        "You judge whether a set of extracted job-eligibility fields is SUPPORTED by the raw job description.",
        "Return ONLY a JSON object: {\"pass\": boolean, \"issues\": [\"string\", ...]}.",
        "An extracted field must be clearly grounded in the raw text. Flag:",
        "- a target_grad_year set when the posting is not new-grad specific, or a graduation year that",
        "  contradicts the text;",
        "- an experience/education requirement stricter or looser than the text supports;",
        "- a remote_restricted_to country the text does not mention;",
        "- a location_country that clearly conflicts with the raw text.",
        "Missing/unknown info is fine as long as you did not invent a contradictory field.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `RAW JOB DESCRIPTION:\n${listing.raw_text || "(none)"}`,
        "",
        "EXTRACTED FIELDS:",
        JSON.stringify(
          {
            location: extracted.location,
            location_country: extracted.location_country,
            is_remote: extracted.is_remote,
            remote_restricted_to: extracted.remote_restricted_to,
            target_grad_year: extracted.target_grad_year,
            qualification_paths: extracted.qualification_paths,
          },
          null,
          2
        ),
      ].join("\n"),
    },
  ];
}

// Returns { ok, issues }. A listing that passes this is safe to insert.
export async function validateExtraction(listing, extracted) {
  const res = await chat(validationMessages(listing, extracted), {
    temperature: 0,
    json: true,
    topic: `jobs:${listing.company}`,
  });
  const verdict = JSON.parse(res.content);
  const issues = Array.isArray(verdict.issues) ? verdict.issues : [];
  return { ok: verdict.pass === true, issues };
}
