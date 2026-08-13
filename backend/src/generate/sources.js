import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Loads the curated source material from the pipeline sources directory.
// Source material quality is the grounding strategy and is added by
// hand; everything downstream of it is automated.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_ROOT = join(__dirname, "..", "..", "..", "pipeline", "sources");
const SOURCE_CHAR_CAP = 6000;
const TOTAL_SOURCE_CAP = 24000;

export async function loadSources(topicSlug) {
  let files;
  try {
    files = await readdir(join(SOURCES_ROOT, topicSlug));
  } catch {
    return [];
  }
  const sources = [];
  let total = 0;
  for (const file of files) {
    if (file === "README.md") continue;
    const text = await readFile(join(SOURCES_ROOT, topicSlug, file), "utf8");
    const capped = text.slice(0, SOURCE_CHAR_CAP);
    sources.push({ name: `sources/${topicSlug}/${file}`, text: capped });
    total += capped.length;
    if (total > TOTAL_SOURCE_CAP) break;
  }
  return sources;
}
