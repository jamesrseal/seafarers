// Reads the ILO fields scraper/iloFields.js stores. Each is NULL on every case
// until a refresh has captured it, and blank where the ILO has nothing.

// A case's crew as the ILO lists them: [{ country, count }], count null where
// the ILO gives none.
export function nationalities(ship) {
  return ship.nationalities ? JSON.parse(ship.nationalities) : [];
}

// "India (11); Türkiye (1)", as the ILO writes it.
export function nationalitiesText(ship) {
  return nationalities(ship)
    .map(({ country, count }) => (count == null ? country : `${country} (${count})`))
    .join('; ');
}

// The newest heading in the case's actions taken, which are stored newest first.
export function latestAction(ship) {
  return ship.actions_taken ? JSON.parse(ship.actions_taken)[0].status : '';
}
