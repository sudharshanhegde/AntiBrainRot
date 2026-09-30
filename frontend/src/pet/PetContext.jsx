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
  loadPet,
  markPetPrompted,
} from "../api/pet";
import { computeStats, feedMessage, moodOf } from "./petModel";

// The virtual pet, the same guest-first shape as the rest of the app: the
// pet lives in localStorage (api/pet.js) so it works signed out, and the
// only thing that advances it is reading a slide. The signed-in server
// streak is folded in as a happiness boost, but never required.
const PetContext = createContext(null);

export function PetProvider({ children }) {
  const { streak } = useAuth();
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

  useEffect(() => {
    const id = setInterval(() => setToday(localDateString()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const adopt = useCallback((type, name) => {
    setPet(adoptPet(type, name));
    markPetPrompted();
    setPrompted(true);
  }, []);

  // Dismisses the one-time adoption invitation without adopting; the
  // Profile page still offers adoption later.
  const dismissPrompt = useCallback(() => {
    markPetPrompted();
    setPrompted(true);
  }, []);

  // Called once per new slide the user actually views. applyRead advances
  // the pet; the effect below turns a feed-boundary crossing into the
  // toast, so state is never set from inside another state updater.
  const recordRead = useCallback(() => {
    setPet((prev) => (prev ? applyRead(prev, localDateString()).pet : prev));
  }, []);

  // Raises the "you fed me" toast whenever the stored feed counter grows.
  const prevFeedsRef = useRef(pet?.feeds || 0);
  useEffect(() => {
    const feeds = pet?.feeds || 0;
    if (feeds > prevFeedsRef.current) {
      // feeds is the new count, so feeds - 1 is this feed's zero-based
      // number for the day, which selects the escalating line.
      setFeedEvent({ id: Date.now(), message: feedMessage(feeds - 1) });
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
  }, []);

  const stats = useMemo(
    () => computeStats(pet, today, streak?.current_streak || 0),
    [pet, today, streak]
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
      adopt,
      recordRead,
      dismissFeedEvent,
      dismissPrompt,
      resetPet,
    }),
    [
      pet,
      stats,
      mood,
      today,
      feedEvent,
      shouldPrompt,
      adopt,
      recordRead,
      dismissFeedEvent,
      dismissPrompt,
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
