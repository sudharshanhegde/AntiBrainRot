import "./env.js";

// Account-level daily streak (SKILL_auth.md): did this user complete at
// least one deck, on any topic, today. Runs as a side effect of the
// deck-completion write, not a separate cron.

function dateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function offsetDays(isoDate, delta) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dateString(dt);
}

// Updates the user's streak in the same transaction as the progress
// write (caller passes an open client). today is the user's local
// calendar date (YYYY-MM-DD) sent by the frontend so a streak counts a
// "day" in the user's own timezone; when absent it falls back to the
// server UTC date.
//
//   today already counted     -> leave current_streak unchanged
//   yesterday was active      -> increment current_streak
//   older than yesterday/null -> reset current_streak to 1
//
// longest_streak is bumped whenever the new value exceeds it.
export async function updateStreak(client, userId, today = null) {
  const todayStr = today || dateString(new Date());
  const yesterday = offsetDays(todayStr, -1);

  const { rows } = await client.query(
    `select current_streak, longest_streak, last_active_date::text as last_active_date
       from user_streaks
      where user_id = $1
      for update`,
    [userId]
  );
  const prev = rows[0];

  let current = 1;
  if (prev && prev.last_active_date === todayStr) {
    current = prev.current_streak;
  } else if (prev && prev.last_active_date === yesterday) {
    current = prev.current_streak + 1;
  }
  const longest = Math.max(prev ? prev.longest_streak : 0, current);

  await client.query(
    `insert into user_streaks (user_id, current_streak, longest_streak, last_active_date)
     values ($1, $2, $3, $4::date)
     on conflict (user_id) do update set
       current_streak = $2,
       longest_streak = $3,
       last_active_date = $4::date`,
    [userId, current, longest, todayStr]
  );

  return { current_streak: current, longest_streak: longest };
}
