// The vessel types the ILO spells two ways, each shorter spelling mapped to the
// name the site counts it under. Copied from frontend/src/utils/vesselTypes.js,
// which the backend can't import (the site is ESM, this is CommonJS), as
// status.js is: test/vesselTypes.test.js reads the site's file and fails on drift.
const VESSEL_TYPE_ALIASES = {
  'General Cargo': 'General Cargo Ship',
  'Fishing': 'Fishing Vessel',
  'Ro-Ro Cargo': 'Ro-Ro Cargo Ship',
  'Refrigerated Cargo': 'Refrigerated Cargo Ship',
  'Container': 'Container Ship',
  'Passenger/Ro-Ro Cargo': 'Passenger/Ro-Ro Cargo Ship',
};

// The name a stored vessel type is counted under.
function canonicalVesselType(name) {
  return VESSEL_TYPE_ALIASES[name] ?? name;
}

// Every stored spelling that counts as this type, itself included.
function spellingsOf(name) {
  return [name, ...Object.keys(VESSEL_TYPE_ALIASES).filter(alias => VESSEL_TYPE_ALIASES[alias] === name)];
}

module.exports = { VESSEL_TYPE_ALIASES, canonicalVesselType, spellingsOf };
