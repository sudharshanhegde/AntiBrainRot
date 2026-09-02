import { useState } from "react";
import { NichePicker } from "./components/onboarding/NichePicker";
import { WelcomeGate } from "./components/onboarding/WelcomeGate";
import { TopicList } from "./components/topics/TopicList";
import { Feed } from "./components/feed/Feed";
import { QuickBitesFeed } from "./components/feed/QuickBitesFeed";
import { WorthAReadList } from "./components/worthARead/WorthAReadList";
import { JobsScreen } from "./components/jobs/JobsScreen";
import { ProfileScreen } from "./components/profile/ProfileScreen";
import { LeaderboardScreen } from "./components/leaderboard/LeaderboardScreen";
import { StatusScreen } from "./components/ui/StatusScreen";
import { findNiche } from "./data/topics";
import { markDeckCompleted, getResumeCardIndex } from "./api/progress";
import { hasGuestId, hasVisited, markVisited, resetToGuest } from "./api/client";
import { useAuth } from "./auth/AuthContext";
import { isSupabaseConfigured } from "./api/supabase";

const STORAGE_KEYS = {
  niche: "antibrainrot:niche",
  topic: "antibrainrot:topic",
};

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable (private mode); navigation still works
    // for the session.
  }
}

// Navigation is a small state machine, not a router: niche -> topics ->
// feed, plus profile and leaderboard reachable from the hamburger menu.
// The niche and last topic persist so a returning user skips onboarding.
export default function App() {
  const { user, loading } = useAuth();
  const [nicheSlug, setNicheSlug] = useState(() => readStored(STORAGE_KEYS.niche));
  const [topicSlug, setTopicSlug] = useState(() => readStored(STORAGE_KEYS.topic));
  const [view, setView] = useState(() => (nicheSlug ? "topics" : "niche"));
  const [revisionDeckIndex, setRevisionDeckIndex] = useState(null);
  // Which card within the deck to resume at (0 = start of deck).
  const [initialCardIndex, setInitialCardIndex] = useState(0);
  // Forces the first-visit gate off once a choice is made, before the
  // persisted "visited" marker is what keeps it off on later loads.
  const [gateChosen, setGateChosen] = useState(false);
  // A short, dismissible note shown on the topics page, set when
  // "surprise me" cannot find an available topic so the user is told why
  // instead of being left on a dead-end error screen.
  const [surpriseNotice, setSurpriseNotice] = useState(null);
  // Note shown on the profile screen when a signed-out user tried to open
  // a topic, explaining why an account is needed.
  const [authNotice, setAuthNotice] = useState(null);

  // Auth session is still being restored from storage; don't render the
  // app until the identity (or lack of one) is known.
  if (loading) {
    return <StatusScreen label="loading" title="antibrainrot" />;
  }

  // First-visit gate: only for genuinely new browsers (no session, no
  // guest id, never seen the gate). Content does
  // not load until a choice is made; any choice marks the browser as
  // visited so the gate never re-shows for it.
  const firstVisit =
    isSupabaseConfigured && !user && !gateChosen && !hasGuestId() && !hasVisited();
  if (firstVisit) {
    return (
      <WelcomeGate
        onRegister={() => {
          markVisited();
          setGateChosen(true);
          setAuthNotice(null);
          setView("profile");
        }}
        onLogin={() => {
          markVisited();
          setGateChosen(true);
          setAuthNotice(null);
          setView("profile");
        }}
        onGuest={() => {
          resetToGuest();
          markVisited();
          setGateChosen(true);
          setView(nicheSlug ? "topics" : "niche");
        }}
      />
    );
  }

  const pickNiche = (slug) => {
    writeStored(STORAGE_KEYS.niche, slug);
    setNicheSlug(slug);
    setTopicSlug(null);
    writeStored(STORAGE_KEYS.topic, "");
    setSurpriseNotice(null);
    setView("topics");
  };

  // revisionIndex (optional) opens a specific published day so the user
  // can re-read a completed deck. Guests can open any topic too: content
  // is public, and their progress is kept in the local mirror until they
  // sign in and migrate it to an account.
  const pickTopic = async (slug, revisionIndex = null) => {
    writeStored(STORAGE_KEYS.topic, slug);
    setTopicSlug(slug);
    setRevisionDeckIndex(revisionIndex);
    setSurpriseNotice(null);
    // Resume: opening a topic lands in the current in-progress deck at
    // the card the user was last on. Revision
    // reads start fresh at card 0.
    let resume = 0;
    if (revisionIndex == null) {
      try {
        resume = await getResumeCardIndex(slug);
      } catch {
        resume = 0;
      }
    }
    setInitialCardIndex(revisionIndex != null ? 0 : resume);
    setView("feed");
  };

  const backToTopics = () => {
    setRevisionDeckIndex(null);
    setView("topics");
  };
  const backToNiche = () => {
    setSurpriseNotice(null);
    setView("niche");
  };
  const openProfile = () => {
    setAuthNotice(null);
    setView("profile");
  };
  const openLeaderboard = () => {
    setView("leaderboard");
  };
  // The Quick Bites feed is a separate mode from the topic decks, opened
  // from its own entry point on the topics page ().
  const openQuickBites = () => {
    setSurpriseNotice(null);
    setView("quickBites");
  };
  // Worth a Read is a separate screen from the topic decks and Quick Bites,
  // opened from its own entry point on the topics page.
  const openWorthARead = () => {
    setSurpriseNotice(null);
    setView("worthARead");
  };
  // The Jobs board is its own screen (separate from the topic decks, Quick
  // Bites, and Worth a Read), opened from its own entry point on the topics
  // page. It requires a signed-in account for personal matching.
  const openJobs = () => {
    setSurpriseNotice(null);
    setView("jobs");
  };
  // After account deletion: back to a clean guest start.
  const handleDeleted = () => {
    setNicheSlug(null);
    setTopicSlug(null);
    setRevisionDeckIndex(null);
    writeStored(STORAGE_KEYS.niche, "");
    writeStored(STORAGE_KEYS.topic, "");
    setView("niche");
  };

  // Called when the user reaches the end card of a deck. Records
  // progress on the API (fire and forget) and in the local mirror.
  const handleDeckComplete = (deckIndex) => {
    if (topicSlug) markDeckCompleted(topicSlug, deckIndex).catch(() => {});
  };

  // "Surprise me" picks a random topic from the niche. There is no
  // cooldown or availability gate anymore, so any topic can be picked
  // directly.
  const handleSurprise = async () => {
    const niche = findNiche(nicheSlug);
    const all = niche ? [...niche.topics] : [];
    if (all.length === 0) {
      setSurpriseNotice("No topics to pick from yet.");
      setView("topics");
      return;
    }
    const pick = all[Math.floor(Math.random() * all.length)];
    pickTopic(pick);
  };

  if (view === "niche") {
    return <NichePicker onPick={pickNiche} />;
  }
  if (view === "profile") {
    return (
      <ProfileScreen
        onBack={backToTopics}
        onDeleted={handleDeleted}
        initialNotice={authNotice}
      />
    );
  }
  if (view === "leaderboard") {
    return <LeaderboardScreen onBack={backToTopics} />;
  }
  if (view === "topics") {
    return (
      <TopicList
        nicheSlug={nicheSlug}
        onPick={pickTopic}
        onChangeNiche={backToNiche}
        onOpenLeaderboard={openLeaderboard}
        onOpenProfile={openProfile}
        onOpenQuickBites={openQuickBites}
        onOpenWorthARead={openWorthARead}
        onOpenJobs={openJobs}
        notice={surpriseNotice}
        onDismissNotice={() => setSurpriseNotice(null)}
      />
    );
  }
  if (view === "quickBites") {
    return <QuickBitesFeed onBack={backToTopics} onOpenProfile={openProfile} />;
  }
  if (view === "worthARead") {
    return <WorthAReadList onBack={backToTopics} />;
  }
  if (view === "jobs") {
    return <JobsScreen onBack={backToTopics} onOpenProfile={openProfile} />;
  }
  return (
    <Feed
      topicSlug={topicSlug}
      onBack={backToTopics}
      onExplore={backToTopics}
      onDeckComplete={handleDeckComplete}
      onSurprise={handleSurprise}
      onOpenProfile={openProfile}
      revisionDeckIndex={revisionDeckIndex}
      initialCardIndex={initialCardIndex}
    />
  );
}
