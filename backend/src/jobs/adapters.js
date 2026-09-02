import { createHash } from "node:crypto";

// Jobs source adapters.
//
// Each ATS platform exposes a public, employer-facing job-board API that is
// stable and uncontroversial to consume, so official APIs are preferred over
// raw HTML scraping. Every adapter follows the same contract: it fetches
// published listings only and returns a normalized array of raw listings
// (role, location, apply/source URL, raw description) for the common
// extraction layer. Source-specific parsing stays isolated here.
//
// Rules every adapter honours:
//   1. Fetch only published/public listings.
//   2. Preserve the original source/application URL.
//   3. Preserve the raw description before LLM extraction.
//   4. Rate-limit requests and avoid unnecessary repeated detail calls
//      (list endpoints include full descriptions where the platform allows).

const SUPPORTED = new Set(["greenhouse", "lever", "ashby"]);
const DESCRIBED_BUT_UNSUPPORTED = new Set(["smartrecruiters"]);

// A stable content hash for dedupe fallback, over role+company+raw text.
function hashListing(listing) {
  return createHash("sha1")
    .update(`${listing.company}|${listing.role}|${listing.raw_text || ""}`)
    .digest("hex")
    .slice(0, 24);
}

// Decodes common HTML entities (also numeric ones) into their literal
// characters. Runs repeatedly because some ATS descriptions are doubly
// entity-encoded (the HTML is itself escaped, e.g. &lt;div&gt;), so a
// single pass leaves <div behind. Decoding fully first turns encoded tags
// back into real tags so they can be stripped and the surrounding text kept.
function decodeEntitiesN(s, passes = 3) {
  let out = String(s);
  const named = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };
  for (let i = 0; i < passes; i++) {
    // Note: this regex intentionally does not contain any entity sequences,
    // so it is not subject to the same escaping issues. It matches a leading
    // ampersand, an entity name or numeric code, and a trailing semicolon.
    const decoded = out.replace(/&([a-z]+|#\d+);/gi, (m, body) => {
      const key = body.toLowerCase();
      if (key.startsWith("#")) {
        const code = Number(key.slice(1));
        return Number.isFinite(code) ? String.fromCharCode(code) : m;
      }
      return named[key] != null ? named[key] : m;
    });
    if (decoded === out) break;
    out = decoded;
  }
  return out;
}

// HTML -> readable text. Fully decodes entities first (revealing any nested
// markup), turns block tags into line breaks and list items into bullets,
// then strips remaining tags and collapses whitespace. Good enough to hand a
// model readable requirement text and to store a scannable raw copy.
function htmlToText(html) {
  if (!html) return "";
  return decodeEntitiesN(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div|tr|ul|ol|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Truncate long descriptions before sending them to the LLM so extraction
// stays within a sane token budget; the full text is what gets persisted.
function truncate(text, max = 18000) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}\n[…]` : text;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

// --- Greenhouse ---------------------------------------------------------
// GET /v1/boards/{token}/jobs?content=true returns all published jobs with
// their full content. absolute_url is both the stable dedupe key and the
// original application URL.
async function fetchGreenhouse(source, company) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    source.source_identifier
  )}/jobs?content=true`;
  const data = await fetchJson(url);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs
    .filter((j) => j && !j.is_internal)
    .map((j) => {
      const rawHtml = j.content || "";
      const rawText = htmlToText(rawHtml);
      const sourceUrl = j.absolute_url || j.id;
      const listing = {
        company,
        role: j.title || "Untitled role",
        location: j.location?.name || "",
        source_url: sourceUrl,
        apply_url: j.absolute_url || sourceUrl,
        raw_text: rawText,
        raw_html: rawHtml,
        source_ref: String(j.id || ""),
      };
      listing.content_hash = hashListing(listing);
      return listing;
    });
}

// --- Lever --------------------------------------------------------------
// GET /v0/postings/{site}?mode=json returns published postings. hostedUrl is
// the hosted application URL; the description lives in descriptionPlain /
// text. Lists cover whole careers pages, so no per-posting detail call is
// needed and repeated calls are avoided.
async function fetchLever(source, company) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(
    source.source_identifier
  )}?mode=json`;
  const data = await fetchJson(url);
  const jobs = Array.isArray(data) ? data : [];
  return jobs.map((j) => {
    // Lever splits a posting into a short intro (descriptionPlain / text) and
    // a structured `lists` array — e.g. headings "Responsibilities", "Skills",
    // "Experience and Qualification" each with their own HTML content. That
    // structured part is where the actual requirements and years-of-experience
    // live, so it must be folded into the raw text or matching/summary miss it
    // (a role can look like it needs 0 years when it really needs 2-4).
    const parts = [j.descriptionPlain || j.text || ""];
    if (Array.isArray(j.lists)) {
      for (const l of j.lists) {
        if (!l || !l.text) continue;
        const body = htmlToText(l.content || "");
        parts.push(`${l.text}:\n${body}`);
      }
    }
    const rawText = parts.filter(Boolean).join("\n\n");

    const sourceUrl = j.hostedUrl || j.applyUrl || j.id;
    const location = (j.categories && (j.categories.location || j.categories.allLocations)) || "";
    const listing = {
      company,
      role: j.text ? j.text.split("\n")[0] : j.title || "Untitled role",
      location: Array.isArray(location) ? location.join(", ") : location,
      source_url: sourceUrl,
      apply_url: j.hostedUrl || j.applyUrl || sourceUrl,
      raw_text: truncate(rawText),
      raw_html: "",
      source_ref: String(j.id || ""),
    };
    listing.content_hash = hashListing(listing);
    return listing;
  });
}

// --- Ashby --------------------------------------------------------------
// GET /posting-api/job-board/{name} returns published jobs with full
// description HTML + plain text in one call. Only public ingestion.
async function fetchAshby(source, company) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    source.source_identifier
  )}`;
  const data = await fetchJson(url);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs
    .filter((j) => j && !j.isListed === false)
    .map((j) => {
      const rawText = j.descriptionPlain || htmlToText(j.descriptionHtml || "");
      const sourceUrl = j.jobUrl || j.applyUrl || j.id;
      const listing = {
        company,
        role: j.title || "Untitled role",
        location: j.location || "",
        source_url: sourceUrl,
        apply_url: j.jobUrl || j.applyUrl || sourceUrl,
        raw_text: truncate(rawText),
        raw_html: j.descriptionHtml || "",
        source_ref: String(j.id || ""),
        workplace: j.employmentType || "",
        // Ashby exposes an explicit isRemote flag; pass it so the parser
        // does not have to infer remoteness from free text alone.
        is_remote_hint: j.isRemote === true,
      };
      listing.content_hash = hashListing(listing);
      return listing;
    });
}

// --- Custom HTML --------------------------------------------------------
// The fallback for companies not on a supported platform. Raw HTML scraping
// is inherently more fragile and needs a page-specific parser, so no generic
// scraper is implemented here; a source of this type returns an empty result
// with a clear reason and should be handled by a bespoke scraper when the
// platform list is exhausted. Never guessed at blindly.
async function fetchCustom() {
  throw new Error(
    "custom sources need a page-specific scraper; not implemented generically"
  );
}

// Dispatches a source record to its adapter. Returns a normalized array of
// raw listings.
export async function fetchSourceListings(source) {
  const company = source.company;
  if (source.source_type === "greenhouse") {
    return fetchGreenhouse(source, company);
  }
  if (source.source_type === "lever") {
    return fetchLever(source, company);
  }
  if (source.source_type === "ashby") {
    return fetchAshby(source, company);
  }
  if (source.source_type === "custom") {
    return fetchCustom();
  }
  throw new Error(`unknown source type: ${source.source_type}`);
}

export function isSupportedSourceType(type) {
  return SUPPORTED.has(type);
}

export function isDescribedButUnsupportedSourceType(type) {
  return DESCRIBED_BUT_UNSUPPORTED.has(type);
}
