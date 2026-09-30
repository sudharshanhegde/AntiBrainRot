// Hand-authored vector pets. Inline SVG rather than <img> so each pet
// inherits the pet accent token (var(--accent-pet)) and can animate: the
// whole body bobs and every pet blinks (see .pet-bob / .pet-eye in
// index.css). Vector means it stays crisp at any size, from the 40px
// adoption thumbnail to the profile card. No raster assets.
//
// Body shapes inherit fill/stroke from the root <svg> (soft tint fill,
// accent stroke). Details — eyes, noses, spots — set their own fill, and
// open strokes (tails, feet, muzzle rings) opt out with fill="none".

const STROKE = 2.4;

function Cat() {
  return (
    <g className="pet-bob">
      <path d="M84 92 C104 92 108 70 92 64" fill="none" />
      <path d="M60 98 C38 98 30 82 30 68 C30 58 38 52 50 52 L70 52 C82 52 90 58 90 68 C90 82 82 98 60 98 Z" />
      <path d="M44 30 L38 10 L58 26 Z" />
      <path d="M76 30 L82 10 L62 26 Z" />
      <circle cx="60" cy="44" r="22" />
      <circle className="pet-eye" cx="52" cy="43" r="3" fill="var(--accent-pet)" stroke="none" />
      <circle className="pet-eye" cx="68" cy="43" r="3" fill="var(--accent-pet)" stroke="none" />
      <path d="M60 50 l-3 4 h6 Z" fill="var(--accent-pet)" stroke="none" />
    </g>
  );
}

function Poodle() {
  return (
    <g className="pet-bob">
      <ellipse cx="46" cy="102" rx="8" ry="7" />
      <ellipse cx="74" cy="102" rx="8" ry="7" />
      <circle cx="60" cy="78" r="26" />
      <circle cx="40" cy="70" r="12" />
      <circle cx="80" cy="70" r="12" />
      <circle cx="48" cy="92" r="12" />
      <circle cx="72" cy="92" r="12" />
      <circle cx="60" cy="24" r="10" />
      <circle cx="48" cy="32" r="8" />
      <circle cx="72" cy="32" r="8" />
      <circle cx="60" cy="46" r="20" />
      <ellipse cx="38" cy="54" rx="8" ry="14" />
      <ellipse cx="82" cy="54" rx="8" ry="14" />
      <circle cx="60" cy="56" r="9" fill="none" />
      <circle className="pet-eye" cx="52" cy="44" r="3" fill="var(--accent-pet)" stroke="none" />
      <circle className="pet-eye" cx="68" cy="44" r="3" fill="var(--accent-pet)" stroke="none" />
      <circle cx="60" cy="53" r="3" fill="var(--accent-pet)" stroke="none" />
    </g>
  );
}

function Parrot() {
  return (
    <g className="pet-bob">
      <path d="M72 88 C90 92 102 104 98 114 C86 110 74 102 64 96 Z" />
      <ellipse cx="58" cy="70" rx="26" ry="30" />
      <path d="M62 62 C76 64 84 76 78 90 C70 84 62 80 56 74 Z" />
      <circle cx="52" cy="40" r="20" />
      <path d="M34 36 C20 40 20 54 34 56 C30 48 32 42 38 40 Z" />
      <circle className="pet-eye" cx="50" cy="36" r="3.2" fill="var(--accent-pet)" stroke="none" />
      <path d="M50 98 l-4 8 M52 98 l6 8" fill="none" />
    </g>
  );
}

function Dinosaur() {
  return (
    <g className="pet-bob">
      <path d="M84 86 C102 86 110 94 112 104 C100 100 92 98 84 96 Z" />
      <rect x="44" y="94" width="11" height="16" rx="3" />
      <rect x="66" y="94" width="11" height="16" rx="3" />
      <ellipse cx="58" cy="82" rx="28" ry="20" />
      <path d="M42 84 C30 62 34 34 52 28 C62 25 70 31 70 40 C70 49 61 52 55 52 C48 52 44 58 46 68 L52 84 Z" />
      <circle cx="64" cy="80" r="3.5" fill="var(--accent-pet)" stroke="none" opacity="0.55" />
      <circle cx="52" cy="88" r="3" fill="var(--accent-pet)" stroke="none" opacity="0.55" />
      <circle className="pet-eye" cx="58" cy="37" r="3" fill="var(--accent-pet)" stroke="none" />
    </g>
  );
}

const ART = { cat: Cat, poodle: Poodle, parrot: Parrot, dinosaur: Dinosaur };

// Renders the chosen pet. Sized entirely by the caller's className; the
// viewBox keeps the proportions fixed.
export function PetArt({ type, className = "", title, style }) {
  const Body = ART[type] || Cat;
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      style={style}
      role="img"
      aria-label={title || type}
      fill="var(--accent-pet-soft)"
      stroke="var(--accent-pet)"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Body />
    </svg>
  );
}
