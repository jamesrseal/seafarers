// The ILO spells some vessel types two ways, the shorter without "Ship" or
// "Vessel": 161 cases say "General Cargo" and 278 "General Cargo Ship", over
// the same years. The dashboard and the vessel type filter count each pair as
// one type, under the longer name. The stored text stays as the ILO wrote it.
// backend/src/vesselTypes.js copies this for the filter; its test fails if the
// two drift.
export const VESSEL_TYPE_ALIASES = {
  'General Cargo': 'General Cargo Ship',
  'Fishing': 'Fishing Vessel',
  'Ro-Ro Cargo': 'Ro-Ro Cargo Ship',
  'Refrigerated Cargo': 'Refrigerated Cargo Ship',
  'Container': 'Container Ship',
  'Passenger/Ro-Ro Cargo': 'Passenger/Ro-Ro Cargo Ship',
};

// A case's vessel type under the name the site counts it by, or null if the
// ILO records none.
export function vesselType(ship) {
  const type = ship.vessel_type?.trim();
  return type ? VESSEL_TYPE_ALIASES[type] ?? type : null;
}
