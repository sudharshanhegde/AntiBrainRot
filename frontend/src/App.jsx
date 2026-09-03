import { useEffect, useState } from "react";
import { NichePicker } from "./components/onboarding/NichePicker";
import { WelcomeGate } from "./components/onboarding/WelcomeGate";
import { TopicList } from "./components/topics/TopicList";
import { Feed } from "./components/feed/Feed";
import { QuickBitesFeed } from "./components/feed/QuickBitesFeed";
import { WorthAReadList } from "./components/worthARead/WorthAReadList";
import { JobsScreen } from "./components/jobs/JobsScreen";
import { ApplicationsScreen } from "./components/jobs/ApplicationsScreen";
import { ProfileScreen } from "./components/profile/ProfileScreen";
import { LeaderboardScreen } from "./components/leaderboard/LeaderboardScreen";
import { StatusScreen } from "./components/ui/StatusScreen";
import { BottomTabBar, isTabView } from "./components/ui/BottomTabBar";
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

// --- Hash routing --------------------------------------------------------
// Navigation is URL-based via the fragment ("#/jobs", "#/topic/os/decks/0",
// ...) using the History API, so the browser's back/forward buttons move
// between real app screens (e.g. Jobs -> Topics -> Home) instead of exiting
// the site. Hash routing works on any static host with no server config.
const STATIC_ROUTES = {
  "#/niche": "niche",
  "#/topics": "topics",
  "#/profile": "profile",
  "#/leaderboard": "leaderboard",
  "#/quick-bites": "quickBites",
  "#/worth-a-read": "worthARead",
  "#/jobs": "jobs",
  "#/applications": "applications",
};

// Parses the current location hash into { view, topicSlug, revision }, or
// null when it is empty/unknown (caller falls back to the stored default).
function parseRoute(hash) {
  const h = hash || "";
  if (h.startsWith("#/topic/")) {
    const parts = h.replace("#/topic/", "").split("/");
    const slug = decodeURIComponent(parts[0]) || null;
    const rev = parts[1] ? Number(parts[1]) : null;
    return { view: "feed", topicSlug: slug, revision: Number.isInteger(rev) ? rev : null };
  }
  const view = STATIC_ROUTES[h];
  return view ? { view, topicSlug: null, revision: null } : null;
}

export default function App() {
  const { user, loading } = useAuth();
  const [nicheSlug, setNicheSlug] = useState(() => readStored(STORAGE_KEYS.niche));
  const [topicSlug, setTopicSlug] = useState(() => readStored(STORAGE_KEYS.topic));
  // Quick Bites is the app's default landing tab, whatever a user sees
  // first after the first-visit gate resolves.
  const [view, setView] = useState("quickBites");
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

  // Changes the URL hash (adds a history entry) and lets the hashchange
  // listener below update the view, so the browser back button can return to
  // the previous in-app screen.
  function navigate(hash) {
    if (window.location.hash === hash) return;
    window.location.hash = hash;
  }

  // Moves between the five primary destinations via the bottom tab bar.
  // Notices that only make sense on the screen that raised them are
  // cleared so they never carry over to another tab.
  const TAB_HASH = {
    quickBites: "#/quick-bites",
    jobs: "#/jobs",
    topics: "#/topics",
    applications: "#/applications",
    profile: "#/profile",
  };
  const selectTab = (id) => {
    const hash = TAB_HASH[id];
    if (!hash) return;
    setSurpriseNotice(null);
    setAuthNotice(null);
    navigate(hash);
  };

  // Applies the current hash to the view state (also runs on back/forward).
  useEffect(() => {
    const onHash = () => {
      const route = parseRoute(window.location.hash);
      if (!route) {
        setView("quickBites");
        setRevisionDeckIndex(null);
        return;
      }
      setView(route.view);
      if (route.view === "feed" && route.topicSlug) {
        setTopicSlug(route.topicSlug);
        setRevisionDeckIndex(route.revision);
      } else if (route.view !== "feed") {
        setRevisionDeckIndex(null);
      }
    };
    onHash(); // initial load / deep link
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

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
          navigate("#/quick-bites");
        }}
        onLogin={() => {
          markVisited();
          setGateChosen(true);
          setAuthNotice(null);
          navigate("#/quick-bites");
        }}
        onGuest={() => {
          resetToGuest();
          markVisited();
          setGateChosen(true);
          navigate("#/quick-bites");
        }}
      />
    );
  }

  const pickNiche = (slug) => {
    writeStored(STORAGE_KEYS.niche, slug);
    setNicheSlug(slug);
    writeStored(STORAGE_KEYS.topic, "");
    setSurpriseNotice(null);
    navigate("#/topics");
  };

  // revisionIndex (optional) opens a specific published day so the user
  // can re-read a completed deck. Guests can open any topic too: content
  // is public, and their progress is kept in the local mirror until they
  // sign in and migrate it to an account.
  const pickTopic = async (slug, revisionIndex = null) => {
    writeStored(STORAGE_KEYS.topic, slug);
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
    setTopicSlug(slug);
    navigate(
      `#/topic/${encodeURIComponent(slug)}${revisionIndex != null ? `/${revisionIndex}` : ""}`
    );
  };

  const backToTopics = () => navigate("#/topics");
  const backToNiche = () => {
    setSurpriseNotice(null);
    navigate("#/niche");
  };
  const openProfile = () => {
    setAuthNotice(null);
    navigate("#/profile");
  };
  const openLeaderboard = () => navigate("#/leaderboard");
  const openQuickBites = () => {
    setSurpriseNotice(null);
    navigate("#/quick-bites");
  };
  const openWorthARead = () => {
    setSurpriseNotice(null);
    navigate("#/worth-a-read");
  };
  const openJobs = () => {
    setSurpriseNotice(null);
    navigate("#/jobs");
  };
  const openApplications = () => navigate("#/applications");
  const backToJobs = () => navigate("#/jobs");

  // After account deletion: back to a clean guest start.
  const handleDeleted = () => {
    setNicheSlug(null);
    setTopicSlug(null);
    setRevisionDeckIndex(null);
    writeStored(STORAGE_KEYS.niche, "");
    writeStored(STORAGE_KEYS.topic, "");
    navigate("#/quick-bites");
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
      navigate("#/topics");
      return;
    }
    const pick = all[Math.floor(Math.random() * all.length)];
    pickTopic(pick);
  };

  let screen;
  if (view === "niche") {
    screen = <NichePicker onPick={pickNiche} />;
  } else if (view === "profile") {
    screen = (
      <ProfileScreen
        onBack={backToTopics}
        onDeleted={handleDeleted}
        initialNotice={authNotice}
      />
    );
  } else if (view === "leaderboard") {
    screen = <LeaderboardScreen onBack={backToTopics} />;
  } else if (view === "topics") {
    screen = (
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
  } else if (view === "quickBites") {
    screen = <QuickBitesFeed onBack={backToTopics} onOpenProfile={openProfile} />;
  } else if (view === "worthARead") {
    screen = <WorthAReadList onBack={backToTopics} />;
  } else if (view === "jobs") {
    screen = (
      <JobsScreen
        onBack={backToTopics}
        onOpenProfile={openProfile}
        onOpenApplications={openApplications}
      />
    );
  } else if (view === "applications") {
    screen = <ApplicationsScreen onBack={backToJobs} onOpenProfile={openProfile} />;
  } else {
    screen = (
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

  // The five primary destinations carry the persistent bottom tab bar;
  // drilled-down screens (topic deck, Worth a Read, leaderboard, niche
  // picker) render full-screen without it.
  if (isTabView(view)) {
    return (
      <>
        {screen}
        <BottomTabBar active={view} onSelect={selectTab} />
      </>
    );
  }
  return screen;
}
