// Topic metadata and niche definitions. This is static configuration,
// not per-user content. The accents are the per-topic colors the design
// system assigns, so a user builds a visual association: kernel content
// is amber, networking is blue, and so on.

export const topicPalette = {
  "operating-systems": {
    name: "Operating Systems",
    short: "OS",
    accent: "accent-os",
    blurb:
      "Processes, memory, scheduling, and the syscalls that tie them together.",
  },
  "computer-networks": {
    name: "Computer Networks",
    short: "NET",
    accent: "accent-net",
    blurb:
      "Packets, protocols, and how data crosses the wire in practice.",
  },
  "data-structures": {
    name: "Data Structures",
    short: "DSA",
    accent: "accent-dsa",
    blurb:
      "The shapes data takes in memory and the cost of each choice.",
  },
  "system-design": {
    name: "System Design",
    short: "SYS",
    accent: "accent-sys",
    blurb:
      "Scaling, caching, and the tradeoffs behind real systems.",
  },
  databases: {
    name: "Databases",
    short: "DB",
    accent: "accent-db",
    blurb:
      "Storage, indexing, and transactions under the hood.",
  },
  "computer-organization-and-architecture": {
    name: "Computer Organization and Architecture",
    short: "COA",
    accent: "accent-coa",
    blurb:
      "How a CPU works: gates, registers, caches, and the fetch-execute cycle.",
  },
  "artificial-intelligence": {
    name: "Artificial Intelligence",
    short: "AI",
    accent: "accent-ai",
    blurb:
      "Search, learning, and how models are trained and evaluated.",
  },
  "network-security": {
    name: "Network Security",
    short: "SEC",
    accent: "accent-sec",
    blurb:
      "Threats, cryptography, and how data stays safe on the wire.",
  },
  "network-protocols": {
    name: "Network Protocols",
    short: "PRT",
    accent: "accent-proto",
    blurb:
      "The layered stack behind every packet, frame by frame.",
  },
  "quantitative-aptitude": {
    name: "Quantitative Aptitude",
    short: "APT",
    accent: "accent-apt",
    blurb:
      "The math and reasoning problems asked in interviews and aptitude tests.",
  },
};

// A niche decides which topics appear on the topic list. The content
// pipeline and feed API serve decks per topic regardless of niche.
export const niches = [
  {
    slug: "cs-major",
    name: "Computer Science major",
    description: "The full set. OS, networking, DSA, system design, databases.",
    topics: [
      "operating-systems",
      "computer-networks",
      "network-protocols",
      "data-structures",
      "system-design",
      "databases",
      "computer-organization-and-architecture",
      "artificial-intelligence",
      "network-security",
      "quantitative-aptitude",
    ],
  },
  {
    slug: "systems",
    name: "Systems engineer",
    description: "Kernel, wire, and storage. Deep and low level.",
    topics: [
      "operating-systems",
      "computer-networks",
      "network-protocols",
      "network-security",
      "databases",
      "system-design",
      "computer-organization-and-architecture",
    ],
  },
  {
    slug: "data",
    name: "Data engineer",
    description: "Databases and system design first, with DSA for the shape of data.",
    topics: [
      "databases",
      "system-design",
      "data-structures",
      "artificial-intelligence",
    ],
  },
  {
    slug: "app-dev",
    name: "App developer",
    description: "DSA and databases first, with networking for the wire.",
    topics: [
      "data-structures",
      "databases",
      "computer-networks",
      "network-protocols",
      "network-security",
      "computer-organization-and-architecture",
      "artificial-intelligence",
      "quantitative-aptitude",
    ],
  },
];

export function findNiche(slug) {
  return niches.find((n) => n.slug === slug) || null;
}
