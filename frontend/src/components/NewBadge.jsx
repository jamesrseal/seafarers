// Marks a case the ILO database has only just started carrying, as opposed to
// one the refresh merely edited. `is_new` is decided server-side in
// backend/src/newCases.js, so the table, the detail panel and the map can't
// disagree about it.
//
// Returns null when there is nothing to mark, like FlagIcon, so callers can
// drop it in without a conditional.
//
// Solid rather than the pastel of the status badges beside it: table rows are
// white, gray-50, blue-50 when hovered and blue-100 when highlighted, so a
// pastel blue would disappear on a highlighted row — and a second pastel pill
// next to the status would read as a second status.
export default function NewBadge({ ship, className = '' }) {
  if (!ship?.is_new) return null;
  return (
    <span
      title="First seen in the most recent refresh"
      className={`inline-block shrink-0 align-middle bg-blue-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-0.5 leading-none cursor-help ${className}`}
    >
      NEW
    </span>
  );
}
