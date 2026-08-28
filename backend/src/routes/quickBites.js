import { Router } from "express";
import { query } from "../db.js";
import { optionalUserId } from "../auth.js";

// Quick Bites feed routes ().
//
// The low-commitment feed module: no deck grouping, no "which day am I
// on", no cooldown, no quiz. GET returns unseen cards for the requesting
// user (checked against quick_bites_seen), freshest generated_date first,
// falling back to older unseen cards once the newest batch is exhausted,
// so a user who scrolls a lot in one sitting does not hit a wall. POST
// marks cards seen as they are scrolled past.
//
// Both routes use optionalUserId: Quick Bites is meant to be always
// available, including to guests, so the same anonymous user_id fallback
// used by the content routes applies.

export const quickBitesRouter = Router();

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function toBite(r) {
  return {
    id: r.id,
    tag: r.tag,
    body: r.body,
    generated_date: r.generated_date,
  };
}

// GET /api/quick-bites?user_id=...&limit=...
quickBitesRouter.get("/", optionalUserId, async (req, res) => {
  try {
    const userId = req.userId || String(req.query.user_id || "");
    const rawLimit = Number(req.query.limit);
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

    const result = await query(
      `select qb.id, qb.tag, qb.body, qb.generated_date
         from quick_bites qb
         left join quick_bites_seen qbs
           on qbs.quick_bite_id = qb.id and qbs.user_id = $1
        where qbs.quick_bite_id is null
        order by qb.generated_date desc, qb.id desc
        limit $2`,
      [userId, limit]
    );

    res.json({
      status: "ok",
      bites: result.rows.map(toBite),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load quick bites" });
  }
});

// POST /api/quick-bites/seen  body: { user_id, ids: [1,2,3] }
// Marks cards as seen as the user scrolls past them. Idempotent; a card
// already marked seen is left untouched (on conflict do nothing).
quickBitesRouter.post("/seen", optionalUserId, async (req, res) => {
  try {
    const userId = req.userId || String(req.body.user_id || "");
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    let marked = 0;
    for (const id of ids) {
      const n = Number(id);
      if (!Number.isInteger(n)) continue;
      await query(
        `insert into quick_bites_seen (user_id, quick_bite_id)
         values ($1, $2)
         on conflict (user_id, quick_bite_id) do nothing`,
        [userId, n]
      );
      marked += 1;
    }
    res.json({ status: "ok", marked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not mark quick bites seen" });
  }
});
