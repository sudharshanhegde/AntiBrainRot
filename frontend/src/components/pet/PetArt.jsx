// Real pet photos, not vector art. The four pets are the household photos
// in public/pets, background-removed to transparent PNGs so only the animal
// shows, and rendered inside a sized box (the caller's className). Life
// comes from layered, GPU-only CSS in index.css: the wrapper breathes (a
// slow scale from the feet) and the photo sways and shifts, so it reads as
// a living companion rather than a still image. `mood` tunes the energy and
// desaturates a sick pet; the celebrate hop is applied by the callers when
// the pet is fed.

const PHOTOS = {
  bablu: "/pets/bablu.png",
  guddu: "/pets/guddu.png",
  maya: "/pets/maya.png",
  tippu: "/pets/tippu.png",
};

// Renders the chosen pet's cutout. Sized entirely by the caller's
// className; object-fit contains the animal within the box so its natural
// proportions are kept regardless of frame shape.
export function PetArt({ type, className = "", title, style, mood = "content" }) {
  return (
    <span
      className={`pet-art pet-mood-${mood} ${className}`.trim()}
      style={style}
    >
      <img
        className="pet-photo"
        src={PHOTOS[type] || PHOTOS.bablu}
        alt={title || type}
        draggable="false"
      />
    </span>
  );
}
