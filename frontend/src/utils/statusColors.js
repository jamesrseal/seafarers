export const STATUS_COLORS = {
  Inactive: { fill: '#bbc2e2', text: 'text-blue-400', badge: 'bg-blue-100 text-blue-800' },
  resolved: { fill: '#7dce82', text: 'text-green-500', badge: 'bg-green-100 text-green-800' },
  '':       { fill: '#de1a1a', text: 'text-red-500',   badge: 'bg-red-100 text-red-800' },
};

export function statusColor(status) {
  return STATUS_COLORS[status] ?? { fill: '#e8e288', text: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-800' };
}

export function markerRadius(numSeafarers) {
  const n = parseInt(numSeafarers, 10) || 1;
  // Scale 1–100 seafarers to radius 5–22px
  return Math.min(22, Math.max(5, 5 + (n / 100) * 17));
}
