// Picks the first published day after the one just finished that the user
// has not read yet, so the end card can offer continuing in the same
// subject instead of the 24-hour wait. Days come from GET /api/days, which
// lists the reviewed decks in order; completed days are skipped because
// re-reading one is revision, not continuation. Returns null when nothing
// unread follows, which keeps the existing wait copy.
export function pickNextDay(days, currentDeckIndex) {
  if (!Number.isInteger(currentDeckIndex)) return null;
  let next = null;
  for (const day of days || []) {
    if (!Number.isInteger(day.deck_index)) continue;
    if (day.deck_index <= currentDeckIndex) continue;
    if (day.status === "completed") continue;
    if (next === null || day.deck_index < next.deck_index) next = day;
  }
  return next;
}
