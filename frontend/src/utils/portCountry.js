import { nationalities } from './iloFields.js';

// The country a case's port is in. The ILO writes "Port, Country", but now and
// then gives the country alone ("Singapore", "Malta"). A port with no comma is
// a country when the cases use that name as one elsewhere: a ship's flag, a
// crew's nationality or another port's country. Anything else with no comma
// ("At sea") has no country. backend/src/shipFilters.js applies the same rule
// to the country filter.

function afterComma(port) {
  const parts = (port || '').split(',');
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

export function countryNames(ships) {
  const names = new Set();
  for (const ship of ships) {
    if (ship.flag) names.add(ship.flag);
    for (const { country } of nationalities(ship)) names.add(country);
    const country = afterComma(ship.port_of_abandonment);
    if (country) names.add(country);
  }
  return names;
}

export function portCountry(port, countries) {
  if (!port) return null;
  const country = afterComma(port);
  if (country) return country;
  return countries.has(port.trim()) ? port.trim() : null;
}
