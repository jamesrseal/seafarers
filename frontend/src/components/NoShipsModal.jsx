const FILTER_LABELS = {
  status:  v => `Status: ${v}`,
  flag:    v => `Flag: ${v}`,
  country: v => `Country: ${v}`,
  port:    v => `Port: ${v}`,
  q:       v => `Search: "${v}"`,
};

export default function NoShipsModal({ lastFilter, onClearLast, onClearAll }) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6 text-center">
        <div className="text-4xl mb-3">⚓</div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">No ships found</h2>
        <p className="text-sm text-gray-500 mb-5">
          The current filters don't match any records.
        </p>
        <div className="flex flex-col gap-2">
          {lastFilter && (
            <button
              onClick={onClearLast}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Remove "{FILTER_LABELS[lastFilter.key]?.(lastFilter.value) ?? lastFilter.value}"
            </button>
          )}
          <button
            onClick={onClearAll}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
          >
            Clear all filters
          </button>
        </div>
      </div>
    </div>
  );
}
