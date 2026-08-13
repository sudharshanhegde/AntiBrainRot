// Deck store keyed by topic slug. The operating-systems deck is the
// full 10-card placeholder from placeholderDeck.js. The other topics
// carry short stand-in decks so every topic in the picker leads to a
// working feed; the content pipeline (SKILL.md) will replace these with
// reviewed, difficulty-ordered decks. No em dashes or emojis anywhere.

import { placeholderDeck } from "./placeholderDeck";

const computerNetworks = [
  {
    order_index: 0,
    template: "text_only",
    title: "A packet is the unit of the network",
    body: "The network moves data in packets, not streams. A packet is a block of bytes with a header and a payload. The header carries control information, the destination address, the source address, and fields that describe the payload that follows. When an application sends a message larger than one packet, the protocol stack splits it across several packets, each with a sequence number so the receiver can reassemble them in order. Routers inspect only the header of each packet and forward it toward the destination, which is what lets the network work without any single machine knowing the whole path. This unit-based design is why a network can carry many conversations at once over shared links. The cost is that packets can arrive out of order, be duplicated, or be dropped, which is why higher layers add sequence numbers and retransmission.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 1,
    template: "text_only",
    title: "TCP handshake opens a connection",
    body: "TCP turns an unreliable packet network into a reliable byte stream, and it starts with a three-way handshake. The client sends a SYN segment announcing a starting sequence number. The server replies with a SYN-ACK, acknowledging the client number and announcing its own. The client sends an ACK back, and from that point both sides know the initial sequence numbers for both directions. Every byte is numbered, so the receiver can detect gaps, ask for retransmission, and reorder what arrives out of order. The handshake also lets each side allocate buffers before any payload flows, so no data is lost to a receiver that was not ready. This is why opening a TCP connection costs a round trip before the first byte, and why connection reuse matters for latency in real applications.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 2,
    template: "text_only",
    title: "DNS turns names into addresses",
    body: "Humans remember names, the network works with numbers, and the Domain Name System bridges the two. A client asks a resolver for the address behind a name such as example.com. If the answer is not cached, the resolver walks a hierarchy: a root server points to the right top-level domain server, which points to the authoritative server for the domain, which returns the address records. The result is cached with a time to live, so repeated lookups for the same name are cheap and do not hit the hierarchy again. Caching is what makes DNS fast in practice, and it is also why a change to a domain's records takes time to propagate everywhere. Because the query is short and the cache is hot, DNS typically resolves in milliseconds, well below what a user would notice.",
    code_snippet: null,
    diagram_ref: null,
  },
];

const dataStructures = [
  {
    order_index: 0,
    template: "text_only",
    title: "An array indexes memory directly",
    body: "An array is a block of contiguous memory where every element is the same size, so the address of element i is base plus i times the element size. That arithmetic is why array access is constant time: the CPU computes the address and reads it, no search involved. The price is that inserting or deleting in the middle requires shifting every later element to keep the block contiguous, which costs linear time. The same contiguity makes arrays cache-friendly, since neighboring elements live in nearby memory and are fetched together by the cache. Choosing an array means committing to fixed-size, indexable storage where reads are the fast operation. The alternative shapes, linked structures and hash tables, trade that direct addressing for cheaper inserts or different lookup behavior, and each choice fits a different workload.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 1,
    template: "text_only",
    title: "A hash table trades order for speed",
    body: "A hash table stores key-value pairs in a fixed array and uses a hash function to convert a key into an array index. Lookup, insert, and delete are constant time on average because the function computes the bucket directly instead of searching. Two different keys can collide into the same bucket, and the table resolves that either by chaining, where each bucket holds a small list, or by probing, where the table searches nearby slots. The hash function must be fast and spread keys evenly, otherwise the table degrades toward linear search. The table resizes when it gets too full, rehashing every key into a larger array, which is why a table pays a rare, expensive cost after many cheap operations. What a hash table does not provide is order, so iterating over keys in sorted order is not one of its strengths.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 2,
    template: "text_only",
    title: "A binary search tree keeps data sorted",
    body: "A binary search tree is a node-based structure where each node holds a key and points to a left and a right subtree. The ordering invariant is that every key in the left subtree is smaller, and every key in the right subtree is larger, than the node's own key. That invariant makes search, insert, and delete follow a single path from the root, halving the remaining candidates at each step, so each operation is proportional to the tree height. In a balanced tree the height is logarithmic in the number of nodes, which gives the expected logarithmic cost. The catch is that the invariant alone does not guarantee balance: inserting keys in sorted order builds a degenerate tree that looks like a linked list and degrades to linear time. Self-balancing variants, such as AVL and red-black trees, add rotations after each insert and delete to keep the height bounded.",
    code_snippet: null,
    diagram_ref: null,
  },
];

const systemDesign = [
  {
    order_index: 0,
    template: "text_only",
    title: "A load balancer spreads requests",
    body: "When one server cannot handle the traffic, the answer is to run several and spread requests across them. A load balancer sits in front of the pool and decides which server gets each request. The simplest policies are round robin, which cycles through the pool in order, and least connections, which sends work to the least busy server. The balancer also hides the pool behind one address, so clients do not need to know how many servers exist or when one is added or removed. To keep sessions working, many systems route a client to the same server using a hash of the client identity, or they move session state to shared storage so any server can serve any request. A good balancer also notices when a server is unhealthy and stops sending it traffic, which is how a failing instance becomes invisible to users.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 1,
    template: "text_only",
    title: "A cache sits between work and repeat",
    body: "Some work only needs to happen once, and a cache is a fast store that remembers the result so repeats are cheap. The cache is checked before the expensive operation runs. On a hit the stored value is returned immediately. On a miss the slow work runs, the result is stored, and the request completes. The win depends entirely on the hit rate, which is why caches are tuned to the access pattern: hot items, the ones requested again and again, should stay resident. Because a cache holds a limited amount, it needs an eviction policy to decide what to drop when full, with least recently used being the common choice. The hard part is consistency, when the underlying data changes, cached copies can go stale, so caches set time to live values or invalidate entries on write. A cache does not make a system correct, it makes it fast.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 2,
    template: "text_only",
    title: "Indexes make reads fast and writes cost more",
    body: "Finding a row by scanning the whole table is linear in the table size, which gets expensive quickly. An index is a separate structure, typically a B-tree, that maps a column value to the location of matching rows, so lookups follow a short path instead of scanning everything. This makes point reads and range queries dramatically faster. The tradeoff is on writes: every insert, update, and delete must also keep every index on the table consistent, so each write does more work than it would without indexes. That is why the choice of which columns to index matters, indexing the columns you filter and join on helps reads, but indexing everything makes writes slow and bloats storage. Database designers tune this balance per workload, trading a bounded write cost for a large read win.",
    code_snippet: null,
    diagram_ref: null,
  },
];

const databases = [
  {
    order_index: 0,
    template: "text_only",
    title: "An index speeds up lookups",
    body: "A table stores rows, and without any index a query that filters on a column must scan every row to find matches. An index on that column is a secondary structure that maps column values to the rows that contain them, so the query jumps straight to the matches instead of scanning. The most common structure is a B-tree, which stays balanced and keeps its height logarithmic in the number of entries, so each lookup touches only a few nodes even in a huge table. Updates are the cost: the database must keep every index in sync on each insert, update, or delete, so each write does extra work per index. The practical rule is to index the columns you filter, join, or sort on, and to avoid indexing columns that only get written, since that adds write cost without helping any read.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 1,
    template: "text_only",
    title: "A transaction groups writes atomically",
    body: "A single logical operation often touches several rows, and a crash in the middle would leave the data half-changed. A transaction groups those writes so they either all commit or all roll back, and the database guarantees there is no in-between state. The implementation keeps a log of changes, and committing appends a commit record to it. If the system crashes before that record exists, recovery rolls the work back; if the record exists, the work is redone or left as committed. Grouping writes this way lets an application express multi-step operations such as moving money between two accounts without ever exposing a state where the money has left one account but not arrived at the other. The application signals the boundary by beginning a transaction, doing the writes, and then committing or aborting at the end.",
    code_snippet: null,
    diagram_ref: null,
  },
  {
    order_index: 2,
    template: "text_only",
    title: "ACID describes transaction guarantees",
    body: "ACID is the set of guarantees a transactional database offers, and each letter names one. Atomicity means a transaction's writes all happen or none do, with no partial result. Consistency means a transaction moves the database from one valid state to another, preserving the rules the schema and application define. Isolation means concurrent transactions do not see each other's uncommitted work, and the database serializes them as if each ran alone, though the degree of isolation is configurable. Durability means once a transaction commits, its effects survive a crash, because the commit record is written to durable storage before the transaction is acknowledged. Together these guarantees let an application treat a group of operations as one reliable unit. Weakening isolation improves concurrency and throughput, which is why many systems trade a strict setting for a faster one.",
    code_snippet: null,
    diagram_ref: null,
  },
];

export const deckStore = {
  "operating-systems": placeholderDeck.cards,
  "computer-networks": computerNetworks,
  "data-structures": dataStructures,
  "system-design": systemDesign,
  databases,
};
