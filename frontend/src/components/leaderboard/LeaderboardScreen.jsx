import { useEffect, useState } from "react";
import { fetchLeaderboard } from "../../api/auth";
import { useAuth } from "../../auth/AuthContext";
import { StreakIndicator } from "../ui/StreakIndicator";

// The leaderboard (SKILL_auth.md): ranked by daily streak. Only users
// who opted in appear, and only name/avatar/streak are shown — never
// emails. Rows use the same register-style numeric treatment as deck
// position counters: a name plus a monospace streak number, not a badge
// or trophy. The signed-in user's row is highlighted so they see where
// they stand; if they are outside the visible top 50 their own rank is
// still shown.
export function LeaderboardScreen({ onBack }) {
  const { user } = useAuth();
  const [data, setData] = useState({ leaderboard: [], me: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchLeaderboard()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "could not load the leaderboard");
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const rows = data.leaderboard;
  // The signed-in user's row when it is inside the visible list.
  const meRow = rows.find((r) => r.is_me) || null;
  const meVisible = data.me && meRow;

  return (
    <main className="screen-in h-dvh overflow-y-auto bg-paper">
      <header className="px-6 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            antibrainrot
          </p>
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
          >
            back
          </button>
        </div>
        <h1 className="mt-3 font-sans text-2xl font-semibold tracking-tight sm:text-3xl">
          Leaderboard
        </h1>
        <p className="mt-2 max-w-md font-sans text-[15px] leading-relaxed text-muted">
          Ranked by daily streak. Only people who opted in from their
          profile appear here.
        </p>
      </header>

      <div className="mt-6 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {loading && (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            loading…
          </p>
        )}

        {!loading && error && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-hairline bg-panel px-4 py-3">
              <p className="font-sans text-[14px] leading-relaxed text-ink/90">{error}</p>
            </div>
            <button
              type="button"
              onClick={load}
              className="w-full rounded-lg border border-ink bg-paper py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper"
            >
              try again
            </button>
          </div>
        )}

        {!loading && !error && data.me && !meVisible && (
          <div className="mb-3 rounded-lg border border-hairline bg-panel px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              your rank
            </p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="font-sans text-[15px] font-semibold tracking-tight text-ink">
                {data.me.display_name}
              </span>
              <StreakIndicator count={data.me.current_streak} />
            </div>
            <p className="mt-1 font-mono text-[11px] text-muted">
              #{data.me.rank} — keep going to break into the top 50
            </p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-hairline bg-panel px-4 py-3">
            <p className="font-sans text-[14px] leading-relaxed text-ink/90">
              No one has opted in to the leaderboard yet. Turn it on from
              your profile once you have a streak.
            </p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {rows.map((row) => {
              const isMe = Boolean(row.is_me);
              return (
                <div
                  key={row.rank}
                  className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${
                    isMe ? "border-ink" : "border-hairline"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="w-7 shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                      #{row.rank}
                    </span>
                    {row.avatar_url && (
                      <img
                        src={row.avatar_url}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full border border-hairline object-cover"
                      />
                    )}
                    <span className="truncate font-sans text-[15px] font-medium tracking-tight text-ink">
                      {row.display_name}
                      {isMe && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                          you
                        </span>
                      )}
                    </span>
                  </span>
                  <StreakIndicator count={row.current_streak} />
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && user && !data.me && (
          <p className="mt-4 font-sans text-[13px] leading-relaxed text-muted">
            You are not on the leaderboard yet. Opt in from your profile
            to appear once you complete a deck.
          </p>
        )}
      </div>
    </main>
  );
}
