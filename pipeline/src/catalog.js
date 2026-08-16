// The catalog of topics and niches. This is the "directory" the
// automated worker uses so it never guesses what content exists: it
// iterates every topic, reads that topic's coverage manifest to learn
// the current depth, and generates only the next deck. Generation
// covers every topic so every niche (a subset of topics) always has
// fresh content.

export const TOPICS = [
  { slug: "operating-systems", name: "Operating Systems" },
  { slug: "computer-networks", name: "Computer Networks" },
  { slug: "data-structures", name: "Data Structures" },
  { slug: "system-design", name: "System Design" },
  { slug: "databases", name: "Databases" },
  { slug: "network-security", name: "Network Security" },
  { slug: "network-protocols", name: "Network Protocols" },
];

export const NICHES = [
  {
    slug: "cs-major",
    name: "Computer Science major",
    topics: [
      "operating-systems",
      "computer-networks",
      "network-protocols",
      "data-structures",
      "system-design",
      "databases",
      "network-security",
    ],
  },
  {
    slug: "systems",
    name: "Systems engineer",
    topics: [
      "operating-systems",
      "computer-networks",
      "network-protocols",
      "network-security",
      "databases",
      "system-design",
    ],
  },
  {
    slug: "data",
    name: "Data engineer",
    topics: ["databases", "system-design", "data-structures"],
  },
  {
    slug: "app-dev",
    name: "App developer",
    topics: ["data-structures", "databases", "computer-networks", "network-protocols", "network-security"],
  },
];
