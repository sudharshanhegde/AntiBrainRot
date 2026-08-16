import { useState } from "react";
import { NichePicker } from "./components/onboarding/NichePicker";
import { TopicList } from "./components/topics/TopicList";
import { Feed } from "./components/feed/Feed";
import { findNiche } from "./data/topics";
import { fetchCooldownMap, markDeckCompleted } from "./api/progress";

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
// feed. The feed is the single surface that opens for a topic; previous
// days are reached from the feed's hamburger drawer. The niche and last
// topic persist so a returning user skips onboarding.
export default function App() {
  const [nicheSlug, setNicheSlug] = useState(() => readStored(STORAGE_KEYS.niche));
  const [topicSlug, setTopicSlug] = useState(() => readStored(STORAGE_KEYS.topic));
  const [view, setView] = useState(() => (nicheSlug ? "topics" : "niche"));
  const [revisionDeckIndex, setRevisionDeckIndex] = useState(null);
  // A short, dismissible note shown on the topics page, set when
  // "surprise me" cannot find an available topic so the user is told why
  // instead of being left on a dead-end error screen.
  const [surpriseNotice, setSurpriseNotice] = useState(null);

  const pickNiche = (slug) => {
    writeStored(STORAGE_KEYS.niche, slug);
    setNicheSlug(slug);
    setTopicSlug(null);
    writeStored(STORAGE_KEYS.topic, "");
    setSurpriseNotice(null);
    setView("topics");
  };

  // revisionIndex (optional) opens a specific completed day, used when a
  // topic on cooldown is tapped so the user can re-read it.
  const pickTopic = (slug, revisionIndex = null) => {
    writeStored(STORAGE_KEYS.topic, slug);
    setTopicSlug(slug);
    setRevisionDeckIndex(revisionIndex);
    setSurpriseNotice(null);
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

  // Called when the user reaches the end card of a deck. Records
  // progress on the API (fire and forget) and in the local mirror.
  const handleDeckComplete = (deckIndex) => {
    if (topicSlug) markDeckCompleted(topicSlug, deckIndex).catch(() => {});
  };

  // "Surprise me" picks a random topic from the niche that is not on
  // cooldown (read from the backend). If every topic is cooling down, or
  // availability cannot be determined, it never guesses and never leaves
  // the user on a dead-end error screen: it goes back to the topics page
  // with a short note explaining why.
  const handleSurprise = async () => {
    const niche = findNiche(nicheSlug);
    const all = niche ? [...niche.topics] : [];

    let available = [];
    try {
      const map = await fetchCooldownMap();
      available = all.filter((slug) => !(map.get(slug)?.is_on_cooldown));
    } catch {
      // Availability is unknown, so any pick could be on cooldown and
      // would surface a dead-end error in the feed. Be honest instead.
      setSurpriseNotice(
        "Could not check what is available right now. Pick a topic below, or come back after the cooldown."
      );
      setView("topics");
      return;
    }

    if (available.length === 0) {
      setSurpriseNotice(
        "You've completed everything available today. Come back after the cooldown for a fresh day."
      );
      setView("topics");
      return;
    }

    const pick = available[Math.floor(Math.random() * available.length)];
    pickTopic(pick);
  };

  if (view === "niche") {
    return <NichePicker onPick={pickNiche} />;
  }
  if (view === "topics") {
    return (
      <TopicList
        nicheSlug={nicheSlug}
        onPick={pickTopic}
        onChangeNiche={backToNiche}
        notice={surpriseNotice}
        onDismissNotice={() => setSurpriseNotice(null)}
      />
    );
  }
  return (
    <Feed
      topicSlug={topicSlug}
      onBack={backToTopics}
      onExplore={backToTopics}
      onDeckComplete={handleDeckComplete}
      onSurprise={handleSurprise}
      revisionDeckIndex={revisionDeckIndex}
    />
  );
}
