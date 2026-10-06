import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { localDateString } from "../api/auth";
import {
  adoptPet,
  applyRead,
  clearPet,
  hasPetPrompted,
  isPetHidden,
  loadPet,
  markPetPrompted,
  setPetHidden,
  switchPet,
} from "../api/pet";
import { recordReadStreak } from "../api/progress";
import { computeStats, feedMessage, moodOf } from "./petModel";

// The virtual pet, the same guest-first shape as the rest of the app: the
// pet lives in localStorage (api/pet.js) so it works signed out, and the
// only thing that advances it is reading a slide. There is a single day
// streak: the account-level server one for signed-in users (advanced on
// the first read of each day by recordReadStreak), falling back to the
// pet's local mirror for guests, who have no account to hold it.
const PetContext = createContext(null);

export function PetProvider({ children }) {
  const { streak, user, refreshProfile } = useAuth();
  const [pet, setPet] = useState(() => loadPet());
  // The user's local calendar date, refreshed on a slow timer so a
  // session left open across midnight starts a new "day" without a
  // reload. Decay is derived from this and the stored lastActiveDate.
  const [today, setToday] = useState(() => localDateString());
  // The latest "you fed me" event, consumed by the toast. null when none.
  const [feedEvent, setFeedEvent] = useState(null);
  // Whether the one-time adoption invitation has been shown and answered
  // (adopted or dismissed) in this browser.
  const [prompted, setPrompted] = useState(() => hasPetPrompted());
  // Whether the floating companion is hidden on the reading screens.
  const [hidden, setHidden] = useState(() => isPetHidden());
  // Whether the current reading surface has room for the pet at all. The
  // topic deck turns this off on its full-page reading cards and on for the
  // quiz cards, where there is space; Quick Bites and every other screen
  // leave it true. Distinct from `hidden`, which is the user's own toggle.
  const [surfaceAllows, setSurfaceAllows] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setToday(localDateString()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const adopt = useCallback((type, name) => {
    setPet(adoptPet(type, name));
    markPetPrompted();
    setPrompted(true);
  }, []);

  // Swaps the adopted pet for another, keeping the stored stats and
  // streak. Unlike adopt, this never re-triggers the one-time prompt.
  const changePet = useCallback((type) => {
    setPet(switchPet(type));
  }, []);

  // Dismisses the one-time adoption invitation without adopting; the
  // Profile page still offers adoption later.
  const dismissPrompt = useCallback(() => {
    markPetPrompted();
    setPrompted(true);
  }, []);

  // Hides / shows the floating companion on the reading screens. The pet
  // itself (and the Profile card) are unaffected; the choice persists.
  const hideCompanion = useCallback(() => {
    setPetHidden(true);
    setHidden(true);
  }, []);

  const showCompanion = useCallback(() => {
    setPetHidden(false);
    setHidden(false);
  }, []);

  // Whether the account streak has already been synced for the current
  // local day, so a session only ever makes one streak write per day.
  const streakSyncedRef = useRef(null);

  // Called once per new slide the user actually views. Two things happen:
  // the pet advances (applyRead), and the account-level day streak is
  // recorded once per local day, so reading itself advances the streak.
  // The pet update runs first and independently, so it still applies for
  // guests and when signed out. The feed-boundary toast is raised by the
  // effect below, so state is never set from inside another state updater.
  const recordRead = useCallback(() => {
    setPet((prev) => (prev ? applyRead(prev, localDateString()).pet : prev));

    if (!user) return;
    const day = localDateString();
    if (streakSyncedRef.current === day) return;
    streakSyncedRef.current = day;
    // Persist the read, then pull the refreshed streak so the profile and
    // topic-screen indicators update without a manual refresh.
    recordReadStreak().then(refreshProfile);
  }, [user, refreshProfile]);

  // Raises the "you fed me" toast whenever the stored feed counter grows.
  const prevFeedsRef = useRef(pet?.feeds || 0);
  useEffect(() => {
    const feeds = pet?.feeds || 0;
    if (feeds > prevFeedsRef.current) {
      // feeds is the new count, so feeds - 1 is this feed's zero-based
      // number for the day, which selects the escalating line. The pet's
      // type picks the set, so the line matches the animal speaking it.
      setFeedEvent({
        id: Date.now(),
        message: feedMessage(feeds - 1, pet?.type),
      });
    }
    prevFeedsRef.current = feeds;
  }, [pet]);

  const dismissFeedEvent = useCallback(() => setFeedEvent(null), []);

  // Clears the pet entirely (used when the account is deleted / the user
  // resets to a fresh guest).
  const resetPet = useCallback(() => {
    clearPet();
    setPet(null);
    setFeedEvent(null);
    setPrompted(false);
    setHidden(false);
  }, []);

  // One streak number everywhere: the account-level server streak when
  // signed in, the pet's local mirror for guests.
  const streakCount = user ? streak?.current_streak ?? 0 : pet?.streak ?? 0;

  const stats = useMemo(
    () => computeStats(pet, today, streakCount),
    [pet, today, streakCount]
  );
  const mood = moodOf(stats);

  // A user with no pet who has not yet been asked: the app invites them
  // once. Anyone, guest or signed in, is asked on their first load after
  // the feature ships.
  const shouldPrompt = !pet && !prompted;

  const value = useMemo(
    () => ({
      pet,
      stats,
      mood,
      today,
      feedEvent,
      shouldPrompt,
      hidden,
      surfaceAllows,
      streak: streakCount,
      adopt,
      changePet,
      recordRead,
      dismissFeedEvent,
      dismissPrompt,
      hideCompanion,
      showCompanion,
      resetPet,
    }),
    [
      pet,
      stats,
      mood,
      today,
      feedEvent,
      shouldPrompt,
      hidden,
      surfaceAllows,
      setSurfaceAllows,
      streakCount,
      adopt,
      changePet,
      recordRead,
      dismissFeedEvent,
      dismissPrompt,
      hideCompanion,
      showCompanion,
      resetPet,
    ]
  );

  return <PetContext.Provider value={value}>{children}</PetContext.Provider>;
}

export function usePet() {
  const ctx = useContext(PetContext);
  if (!ctx) throw new Error("usePet must be used within PetProvider");
  return ctx;
}
