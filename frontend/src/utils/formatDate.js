const MONTHS = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

// Normalize an ILO date (abandonment / notification) to ISO form, matching the
// Last Activity Date (YYYY-MM-DD) as closely as the available precision allows:
//   "2 July 2014"     -> "2014-07-02"
//   "September 2010"  -> "2010-09"
//   "2010"            -> "2010"
// Anything that doesn't match a known shape is returned unchanged.
export function formatIloDate(raw) {
  if (!raw) return raw;
  const parts = String(raw).trim().split(/\s+/);

  if (parts.length === 1) {
    return /^\d{4}$/.test(parts[0]) ? parts[0] : raw;
  }
  if (parts.length === 2) {
    const [month, year] = parts;
    const m = MONTHS[month.toLowerCase()];
    return m && /^\d{4}$/.test(year) ? `${year}-${m}` : raw;
  }
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const m = MONTHS[month.toLowerCase()];
    if (m && /^\d{1,2}$/.test(day) && /^\d{4}$/.test(year)) {
      return `${year}-${m}-${day.padStart(2, '0')}`;
    }
  }
  return raw;
}
