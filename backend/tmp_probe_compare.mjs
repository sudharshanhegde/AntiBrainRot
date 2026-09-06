import "./src/env.js";
import { pool } from "./src/db.js";
import { parseListing } from "./src/jobs/extract.js";
import { isolateQualificationSection } from "./src/jobs/experience.js";

// READ-ONLY dry-run: compare what the NEW (improved) extraction computes for a
// small sample of existing live jobs against what is currently stored.
//
// It shows, per job:
//   - raw_len / section_len  -> how much the qualifications-scoping narrows the
//                               text (and therefore the model input).
//   - stored_years           -> the min experience currently stored (from the
//                               model/old path).
//   - computed_years         -> the min experience our NEW deterministic logic
//                               derives from the isolated qualification section.
//
// A computed_years HIGHER than stored_years on a senior role is exactly the
// "senior role leaking to juniors" class of bug this fixes.
//
// Run against PRODUCTION (no local DB):
//   cd backend && node tmp_probe_compare.mjs

const LIMIT = Number(process.env.SAMPLE_LIMIT || 20);

function storedMin(paths) {
  const mins = (paths || []).map((p) => Number(p.min_experience_years)).filter(Number.isInteger);
  return mins.length ? Math.max(...mins) : null;
}

async function main() {
  const { rows } = await pool.query(
    `select j.id, j.role, j.company, j.location, j.raw_requirements_text,
            coalesce((
              select jsonb_agg(jsonb_build_object(
                'education_level', qp.education_level,
                'min_experience_years', qp.min_experience_years,
                'max_experience_years', qp.max_experience_years))
              from job_qualification_paths qp where qp.job_id = j.id), '[]'::jsonb
            ) as stored_paths
       from jobs j
      where j.expired = false and j.raw_requirements_text is not null
      order by j.id
      limit $1`,
    [LIMIT]
  );

  console.log(`Comparing ${rows.length} live jobs (old stored vs new computed):\n`);
  for (const r of rows) {
    const raw = r.raw_requirements_text || "";
    const section = isolateQualificationSection(raw);
    const stored = storedMin(r.stored_paths);
    let computed = null;
    let usedSection = false;
    try {
      const parsed = parseListing({
        company: r.company,
        role: r.role,
        location: r.location || "",
        raw_text: raw,
      });
      const mins = (parsed.qualification_paths || [])
        .map((p) => Number(p.min_experience_years))
        .filter(Number.isInteger);
      computed = mins.length ? Math.max(...mins) : 0;
    } catch {
      computed = null;
    }
    const flag = stored != null && computed != null && computed > stored ? "  <-- UNDERSTATES (leak risk)" : "";
    console.log(`#${r.id} ${r.role} (${r.company})`);
    console.log(`   raw_len=${raw.length}  section_len=${section.length}${usedSection ? "" : ""}`);
    console.log(`   stored_years=${stored}   computed_years=${computed}${flag}`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
