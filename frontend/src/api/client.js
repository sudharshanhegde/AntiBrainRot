import { API_BASE } from "./config";

// Shared helpers for talking to the Express API. The API addresses
// topics by numeric id, while the rest of the app uses slugs, so the
// topics list is cached here as a slug-to-topic map.

let topicsCache = null;

export async function getTopics() {
  if (topicsCache) return topicsCache;
  const res = await fetch(`${API_BASE}/api/topics`);
  if (!res.ok) throw new Error("could not load topics from the API");
  const { topics } = await res.json();
  topicsCache = new Map(topics.map((t) => [t.slug, t]));
  return topicsCache;
}

export async function getTopicId(slug) {
  const topics = await getTopics();
  const topic = topics.get(slug);
  if (!topic) throw new Error(`unknown topic: ${slug}`);
  return topic.id;
}

// Stable anonymous user id kept in localStorage. No auth in v1, per
// README.md; this is what identifies a user to the progress API.
export function getUserId() {
  try {
    let id = localStorage.getItem("antibrainrot:user");
    if (!id) {
      id = `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("antibrainrot:user", id);
    }
    return id;
  } catch {
    return "anon-local";
  }
}
