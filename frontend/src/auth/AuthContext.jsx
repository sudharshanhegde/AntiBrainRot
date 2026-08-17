import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../api/supabase";
import { setCurrentUserId } from "../api/client";
import {
  registerSession,
  fetchMe,
  updateLeaderboardOptIn,
  migrateLocalProgress,
} from "../api/auth";

const AuthContext = createContext(null);

// Wraps the whole app. Responsibilities (SKILL_auth.md):
// - restore the persisted Supabase session on load,
// - mount a single onAuthStateChange listener at the root so the access
//   token refreshes in the background (autoRefreshToken stays enabled)
//   instead of quietly going stale,
// - keep the authenticated user id in the api client cache so getUserId
//   returns the account id, not the anonymous one,
// - register the profile with the backend and run the one-time
//   anonymous-to-authenticated migration on first sign-in.
export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [streak, setStreak] = useState(null);
  // Guards the signed-in side effects so a double mount (StrictMode) or
  // repeated SIGNED_IN events cannot register/migrate twice per session.
  const signedInHandled = useRef(false);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await fetchMe();
      setProfile(data.user);
      setStreak(data.streak);
    } catch (err) {
      console.warn("could not refresh profile", err);
    }
  }, []);

  const handleSignedIn = useCallback(
    async (authUser) => {
      setUser(authUser);
      setCurrentUserId(authUser.id);
      if (signedInHandled.current) return;
      signedInHandled.current = true;
      // Register/upsert the users row with the backend.
      try {
        const data = await registerSession();
        setProfile(data.user);
        setStreak(data.streak);
      } catch (err) {
        console.warn("could not register session with backend", err);
      }
      // One-time migration of pre-auth progress. Only runs when an
      // anonymous id actually exists; on success the id is cleared so
      // this never runs again for the same user.
      try {
        const migrated = await migrateLocalProgress();
        if (migrated > 0) {
          console.log(`migrated ${migrated} anonymous progress rows to your account`);
        }
      } catch (err) {
        console.warn("anonymous progress migration failed", err);
      }
    },
    []
  );

  const handleSignedOut = useCallback(() => {
    setUser(null);
    setProfile(null);
    setStreak(null);
    setCurrentUserId(null);
    signedInHandled.current = false;
  }, []);

  useEffect(() => {
    let active = true;

    // Restore the persisted session, then listen for changes. The
    // listener stays mounted for the app's lifetime so the refresh token
    // flow keeps the session alive.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session?.user) {
        handleSignedIn(session.user);
      } else {
        handleSignedOut();
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!active) return;
        if (session?.user) {
          handleSignedIn(session.user);
        } else {
          handleSignedOut();
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [handleSignedIn, handleSignedOut]);

  const value = {
    loading,
    user,
    profile,
    streak,
    refreshProfile,
    setLeaderboardOptIn: async (optIn) => {
      const data = await updateLeaderboardOptIn(optIn);
      setProfile(data.user);
      return data.user;
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
