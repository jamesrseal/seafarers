import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countryNames, portCountry } from '../src/utils/portCountry.js';

const ships = [
  { flag: 'Malta', port_of_abandonment: 'Valletta, Malta', nationalities: '' },
  { flag: '', port_of_abandonment: 'Keppel, Singapore', nationalities: JSON.stringify([{ country: 'Bahrain', count: 3 }]) },
];
const countries = countryNames(ships);

test('the country is what follows the last comma', () => {
  assert.equal(portCountry('Sharjah, United Arab Emirates', countries), 'United Arab Emirates');
  assert.equal(portCountry('Bandar Abbas, Iran (Islamic Republic of)', countries), 'Iran (Islamic Republic of)');
});

test("a port given as a country alone is that country, if the cases use the name as one", () => {
  assert.equal(portCountry('Singapore', countries), 'Singapore', "another port's country");
  assert.equal(portCountry('Malta', countries), 'Malta', 'a flag');
  assert.equal(portCountry('Bahrain ', countries), 'Bahrain', 'a nationality, trimmed');
});

test('anything else without a comma has no country', () => {
  assert.equal(portCountry('At sea', countries), null);
  assert.equal(portCountry('aground near by Manila', countries), null);
  assert.equal(portCountry('', countries), null);
  assert.equal(portCountry(null, countries), null);
});
