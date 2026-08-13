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

// Navigation is a small state machine, not a router: v1 has exactly
// three screens. The niche and last topic persist so a returning user
// skips onboarding. No auth in v1, so identity is local only.
export default function App() {
  const [nicheSlug, setNicheSlug] = useState(() => readStored(STORAGE_KEYS.niche));
  const [topicSlug, setTopicSlug] = useState(() => readStored(STORAGE_KEYS.topic));
  const [view, setView] = useState(() => (nicheSlug ? "topics" : "niche"));
  const [revisionDeckIndex, setRevisionDeckIndex] = useState(null);

  const pickNiche = (slug) => {
    writeStored(STORAGE_KEYS.niche, slug);
    setNicheSlug(slug);
    setTopicSlug(null);
    writeStored(STORAGE_KEYS.topic, "");
    setView("topics");
  };

  // revisionIndex (optional) re-reads a specific completed deck.
  const pickTopic = (slug, revisionIndex = null) => {
    writeStored(STORAGE_KEYS.topic, slug);
    setTopicSlug(slug);
    setRevisionDeckIndex(revisionIndex);
    setView("feed");
  };

  const backToTopics = () => {
    setRevisionDeckIndex(null);
    setView("topics");
  };
  const backToNiche = () => setView("niche");

  // Called when the user reaches the end card of a deck. Records
  // progress on the API (fire and forget) and in the local mirror.
  const handleDeckComplete = (deckIndex) => {
    if (topicSlug) markDeckCompleted(topicSlug, deckIndex).catch(() => {});
  };

  // "Surprise me" picks a random topic from the niche that is not on
  // cooldown (read from the backend). If every topic is cooling down,
  // fall back to the list.
  const handleSurprise = async () => {
    const niche = findNiche(nicheSlug);
    let available = niche ? [...niche.topics] : [];
    try {
      const map = await fetchCooldownMap();
      available = available.filter(
        (slug) => !(map.get(slug)?.is_on_cooldown)
      );
    } catch {
      // fall through and let the feed surface any cooldown
    }
    if (available.length === 0) {
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
      />
    );
  }
  return (
    <Feed
      topicSlug={topicSlug}
      onBack={backToTopics}
      onDeckComplete={handleDeckComplete}
      onSurprise={handleSurprise}
      revisionDeckIndex={revisionDeckIndex}
    />
  );
}
