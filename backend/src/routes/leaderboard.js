import { Router } from "express";
import { query } from "../db.js";
import { optionalUserId } from "../auth.js";

export const leaderboardRouter = Router();

// GET /api/leaderboard
//
// Ranked by daily streak. Only users who opted in (leaderboard_opt_in)
// are visible, and only name/avatar/streak are ever exposed, never
// emails (SKILL_auth.md). current_streak is the primary sort key,
// longest_streak breaks ties, then name for a stable order. Users who
// opted in but have never completed a deck are omitted rather than
// filling the list with zeros.
//
// A signed-in user gets a `me` object (their own rank and streak) plus
// their row flagged is_me when it falls within the visible list, so they
// can see where they stand without hunting through the ranks.
leaderboardRouter.get("/", optionalUserId, async (req, res) => {
  try {
    const { rows } = await query(
      `select u.id as user_id, u.display_name, u.avatar_url, s.current_streak
         from user_streaks s
         join users u on u.id = s.user_id
        where u.leaderboard_opt_in = true
          and (s.current_streak > 0 or s.longest_streak > 0)
        order by s.current_streak desc, s.longest_streak desc, u.display_name asc
        limit 50`
    );

    const leaderboard = rows.map((r, i) => ({
      rank: i + 1,
      display_name: r.display_name || "anonymous",
      avatar_url: r.avatar_url,
      current_streak: r.current_streak,
      is_me: r.user_id === req.userId,
    }));

    let me = null;
    if (req.userId) {
      const mine = await query(
        `select s.current_streak, s.longest_streak, u.display_name, u.avatar_url, u.leaderboard_opt_in
           from user_streaks s
           join users u on u.id = s.user_id
          where s.user_id = $1`,
        [req.userId]
      );
      const myRow = mine.rows[0];

      if (myRow && myRow.leaderboard_opt_in) {
        // Rank among opted-in users with a nonzero streak, matching the
        // same ordering as the list above.
        const rankRes = await query(
          `select 1 + count(*)::int as rank
             from user_streaks s
             join users u on u.id = s.user_id
            where u.leaderboard_opt_in = true
              and (s.current_streak > 0 or s.longest_streak > 0)
              and (
                s.current_streak > $1
                or (s.current_streak = $1 and s.longest_streak > $2)
                or (s.current_streak = $1 and s.longest_streak = $2 and u.display_name < $3)
              )`,
          [myRow.current_streak, myRow.longest_streak, myRow.display_name || ""]
        );
        me = {
          rank: rankRes.rows[0].rank,
          display_name: myRow.display_name || "anonymous",
          avatar_url: myRow.avatar_url,
          current_streak: myRow.current_streak,
        };
      }
    }

    res.json({ leaderboard, me });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "could not load leaderboard" });
  }
});
