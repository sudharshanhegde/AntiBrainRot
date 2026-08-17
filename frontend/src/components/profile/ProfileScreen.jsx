import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { isSupabaseConfigured } from "../../api/supabase";
import { signInWithGoogle, signInWithEmail, signUpWithEmail, signOut } from "../../api/auth";
import { StreakIndicator } from "../ui/StreakIndicator";

// The profile screen: streak indicator (permanent, SKILL_auth.md),
// account settings (leaderboard opt-in, default off), and sign in/out.
// Google is the default sign-in; email/password is the fallback for
// people who do not want Google. Signing in routes through Supabase
// Auth; the AuthContext listener then registers the profile with the
// backend and runs the one-time anonymous progress migration.
export function ProfileScreen({ onBack, initialNotice = null }) {
  const { user, profile, streak, refreshProfile, setLeaderboardOptIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(initialNotice);

  // A gate notice (e.g. "sign in to start a deck") is context for the
  // sign-in form; once a session exists there is nothing to gate, so
  // drop it.
  useEffect(() => {
    if (user) setNotice(null);
  }, [user]);

  const handleOAuth = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      // Supabase redirects to Google; the session arrives on return via
      // the auth state listener.
    } catch (err) {
      setError(err.message || "could not start Google sign-in");
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!email || !password) {
      setError("enter an email and password");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await signUpWithEmail(email, password);
        if (signUpError) throw signUpError;
        if (!data.session) {
          // Email confirmation is enabled on this project; the user must
          // confirm before the first login.
          setNotice("check your email to confirm your account, then sign in");
          setBusy(false);
          return;
        }
      } else {
        const { error: signInError } = await signInWithEmail(email, password);
        if (signInError) throw signInError;
      }
      // On success the auth state listener picks up the session and the
      // screen re-renders signed-in. Clear the form.
      setEmail("");
      setPassword("");
      setBusy(false);
    } catch (err) {
      setError(err.message || "could not sign in");
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(err.message || "could not sign out");
    }
  };

  const handleToggleOptIn = async (checked) => {
    setError(null);
    try {
      await setLeaderboardOptIn(checked);
    } catch (err) {
      setError(err.message || "could not update settings");
    }
  };

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
          Profile
        </h1>
      </header>

      {notice && (
        <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-lg border border-hairline bg-panel px-4 py-3">
          <p className="font-sans text-[14px] leading-relaxed text-ink/90">{notice}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6 px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {!isSupabaseConfigured && (
          <div className="rounded-lg border border-hairline bg-panel px-4 py-3">
            <p className="font-sans text-[14px] leading-relaxed text-ink/90">
              Auth is not configured. Add <span className="font-mono text-[12px]">VITE_SUPABASE_URL</span> and{" "}
              <span className="font-mono text-[12px]">VITE_SUPABASE_ANON_KEY</span> to{" "}
              <span className="font-mono text-[12px]">frontend/.env</span> (copy{" "}
              <span className="font-mono text-[12px]">.env.example</span>) to enable sign-in.
            </p>
          </div>
        )}

        {user ? (
          <>
            {/* Streak: permanent home, large version. */}
            <section className="flex items-center justify-between rounded-lg border border-hairline bg-paper px-5 py-4">
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  current streak
                </span>
                <StreakIndicator count={streak?.current_streak ?? 0} size="lg" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  best {streak?.longest_streak ?? 0}
                </span>
              </span>
              <button
                type="button"
                onClick={refreshProfile}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
              >
                refresh
              </button>
            </section>

            {/* Account + settings */}
            <section className="rounded-lg border border-hairline bg-paper px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                account
              </p>
              <div className="mt-3 flex items-center gap-3">
                {profile?.avatar_url && (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full border border-hairline object-cover"
                  />
                )}
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-[16px] font-semibold tracking-tight text-ink">
                    {profile?.display_name || user.email?.split("@")[0] || "you"}
                  </span>
                  {profile?.email && (
                    <span className="font-mono text-[11px] text-muted">{profile.email}</span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="font-sans text-[15px] font-medium tracking-tight text-ink">
                    Show me on the leaderboard
                  </span>
                  <span className="font-sans text-[13px] leading-relaxed text-muted">
                    Off by default. Only your name, avatar, and streak are
                    shared if you turn it on.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(profile?.leaderboard_opt_in)}
                  onClick={() => handleToggleOptIn(!profile?.leaderboard_opt_in)}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                    profile?.leaderboard_opt_in
                      ? "border-ink bg-ink"
                      : "border-hairline bg-panel"
                  }`}
                >
                  <span
                    className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-paper transition-all ${
                      profile?.leaderboard_opt_in ? "left-[calc(100%-1.25rem)]" : "left-1"
                    }`}
                  />
                </button>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-6 w-full rounded-lg border border-ink bg-paper py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper"
              >
                sign out
              </button>
            </section>
          </>
        ) : (
          <>
            {/* Streak while signed out: nothing to count yet. */}
            <section className="flex items-center justify-between rounded-lg border border-hairline bg-paper px-5 py-4">
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  current streak
                </span>
                <StreakIndicator count={0} size="lg" />
              </span>
            </section>

            <section className="rounded-lg border border-hairline bg-paper px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                sign in to save progress
              </p>
              <button
                type="button"
                onClick={handleOAuth}
                disabled={busy || !isSupabaseConfigured}
                className="mt-4 w-full rounded-lg border border-ink bg-paper py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
              >
                continue with google
              </button>

              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-hairline" />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  or
                </span>
                <span className="h-px flex-1 bg-hairline" />
              </div>

              <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="rounded-lg border border-hairline bg-paper px-4 py-2.5 font-sans text-[15px] text-ink outline-none transition-colors focus:border-ink"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    password
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="rounded-lg border border-hairline bg-paper px-4 py-2.5 font-sans text-[15px] text-ink outline-none transition-colors focus:border-ink"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || !isSupabaseConfigured}
                  className="mt-1 w-full rounded-lg border border-ink bg-paper py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "working…" : mode === "signup" ? "create account" : "sign in"}
                </button>
              </form>

              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="mt-3 w-full font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-ink"
              >
                {mode === "login" ? "need an account? sign up" : "have an account? sign in"}
              </button>
            </section>
          </>
        )}

        {error && (
          <div className="rounded-lg border border-hairline bg-panel px-4 py-3">
            <p className="font-sans text-[14px] leading-relaxed text-ink/90">{error}</p>
          </div>
        )}
      </div>
    </main>
  );
}
