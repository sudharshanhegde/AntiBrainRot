// Persistent five-tab bottom bar.
//
// Fixed to the bottom of the viewport and shown only on the five primary
// destinations: Quick Bites, Jobs, Subjects, My Applications, and Profile.
// Every other screen (topic deck, Worth a Read, leaderboard, onboarding) is
// reached from one of these tabs and does not carry the bar.
//
// Each tab is an icon plus a short label beneath it, in the same mono
// register language as the rest of the chrome. The active tab is drawn in
// ink, the rest in muted. Because the bar overlays the bottom of content
// (including the full-height swipe feeds), tab screens pad their scroll
// content by var(--tabbar-h) so nothing sits hidden underneath.

const TABS = [
  { id: "quickBites", hash: "#/quick-bites", label: "Quick Bites" },
  { id: "jobs", hash: "#/jobs", label: "Jobs" },
  { id: "topics", hash: "#/topics", label: "Subjects" },
  { id: "applications", hash: "#/applications", label: "Applications" },
  { id: "profile", hash: "#/profile", label: "Profile" },
];

// The view ids that map to a bottom-bar destination. Non-tab views
// (niche, feed, worthARead, leaderboard) are excluded.
export const TAB_VIEW_IDS = TABS.map((t) => t.id);

export function isTabView(view) {
  return TAB_VIEW_IDS.includes(view);
}

// Icons signal the thing behind each tab rather than reusing a generic
// set: a lightning bolt for the quick refresh feed, a briefcase for the
// job board, a book for subjects, a checklist for applications, and a
// person for the profile. Same 24px stroke language as the other chrome
// icons (e.g. the hamburger), fill none, sized by currentColor.
function TabIcon({ name, className }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (name) {
    case "quickBites":
      return (
        <svg {...common} className={className}>
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      );
    case "jobs":
      return (
        <svg {...common} className={className}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 13h18" />
        </svg>
      );
    case "topics":
      return (
        <svg {...common} className={className}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "applications":
      return (
        <svg {...common} className={className}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      );
    case "profile":
    default:
      return (
        <svg {...common} className={className}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </svg>
      );
  }
}

export function BottomTabBar({ active, onSelect }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex" style={{ height: "var(--tabbar-h)" }}>
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          const tone = isActive ? "text-ink" : "text-muted";
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={isActive ? "page" : undefined}
              aria-label={tab.label}
              className="flex flex-1 flex-col items-center justify-center gap-1 px-1"
            >
              <TabIcon name={tab.id} className={tone} />
              <span
                className={`text-center font-mono text-[8px] uppercase leading-tight tracking-[0.1em] ${tone}`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
