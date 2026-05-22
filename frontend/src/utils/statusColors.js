export const STATUS_COLORS = {
  '':         { label: 'Unresolved', fill: '#e8e288', text: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-800' },
  disputed:   { label: 'Disputed',   fill: '#de1a1a', text: 'text-red-500',    badge: 'bg-red-100 text-red-800' },
  inactive:   { label: 'Inactive',   fill: '#9ca3af', text: 'text-gray-500',   badge: 'bg-gray-100 text-gray-600' },
  resolved:   { label: 'Resolved',   fill: '#7dce82', text: 'text-green-500',  badge: 'bg-green-100 text-green-800' },
};

export function statusColor(status) {
  return STATUS_COLORS[status ?? ''] ?? STATUS_COLORS[''];
}

export function statusLabel(status) {
  return STATUS_COLORS[status ?? '']?.label ?? status;
}

export function markerRadius(numSeafarers) {
  const n = parseInt(numSeafarers, 10) || 1;
  // Scale 1–100 seafarers to radius 5–22px
  return Math.min(22, Math.max(5, 5 + (n / 100) * 17));
}
