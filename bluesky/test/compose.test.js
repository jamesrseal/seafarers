const test = require('node:test');
const assert = require('node:assert/strict');
const { composePost, buildRecord } = require('../src/compose');
const { graphemeLength } = require('../src/text');
const { nikolayMeshkov, bird16, shreenathJi } = require('../fixtures/ships');

test('a case with little detail: one circumstances quote', () => {
  const draft = composePost(nikolayMeshkov);
  assert.equal(draft.text,
    'Nikolay Meshkov (Palau flag): 13 seafarers abandoned in Samsun, Türkiye, on 1 July 2026.\n\n'
    + '“Owed wages of 3 months. One of the seafarers has been onboard for over a year.”\n\n'
    + 'Status: Unresolved · ILO case');
  assert.equal(draft.graphemes, 201);
  assert.deepEqual(draft.facets, [
    { index: { byteStart: 0, byteEnd: 15 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://abandonedseafarers.org/?ship=1821' }] },
    { index: { byteStart: 199, byteEnd: 207 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: nikolayMeshkov.ilo_url }] },
  ]);
});

test('a resolved case with updates: both quotes, shortened to fit', () => {
  const draft = composePost(bird16);
  assert.equal(draft.text,
    'Bird 16 (Comoros flag): 15 seafarers abandoned in Mersin, Türkiye, on 1 September 2024.\n\n'
    + '“2 Indian Officers have 4 months of unpaid salary.”\n\n'
    + 'Latest update, 15 June 2025: “The 3 crew members who complained confirmed that they received their outstanding wages.”\n\n'
    + 'Status: Resolved · ILO case');
  assert.equal(draft.graphemes, 289);
});

test('a long back-and-forth: the latest update, never the letters before it', () => {
  const draft = composePost(shreenathJi);
  assert.equal(draft.text,
    'Shreenath Ji (Panama flag): 10 seafarers abandoned in Dubai, United Arab Emirates, on 1 April 2025.\n\n'
    + 'Latest update, 16 June 2026: “Seafarer has been repatriated without receiving his outstanding wages.”\n\n'
    + 'Status: Disputed · ILO case');
  assert.equal(draft.graphemes, 231);
});

test('the header leaves a missing value out rather than inventing one', () => {
  const header = changes => composePost({ ...nikolayMeshkov, ...changes }).text.split('\n')[0];
  const place = 'abandoned in Samsun, Türkiye, on 1 July 2026.';
  assert.equal(header({ num_seafarers: 1 }), `Nikolay Meshkov (Palau flag): 1 seafarer ${place}`);
  assert.equal(header({ num_seafarers: null }), `Nikolay Meshkov (Palau flag): Seafarers ${place}`);
  assert.equal(header({ num_seafarers: 0 }), `Nikolay Meshkov (Palau flag): Seafarers ${place}`);
  assert.equal(header({ flag: '' }), `Nikolay Meshkov: 13 seafarers ${place}`);
  assert.equal(header({ flag: 'Unknown' }), `Nikolay Meshkov: 13 seafarers ${place}`);
  assert.equal(header({ port_of_abandonment: 'At sea' }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned on 1 July 2026.');
  assert.equal(header({ port_of_abandonment: '' }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned on 1 July 2026.');
  assert.equal(header({ port_of_abandonment: 'Singapore' }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned in Singapore on 1 July 2026.');
  assert.equal(header({ port_of_abandonment: 'Sharjah Anchorage, United Arab Emirates' }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned in Sharjah Anchorage, United Arab Emirates, on 1 July 2026.');
  for (const position of [
    'Vessel underway to Khor Fakkan, United Arab Emirates',
    'En-route to Alexandria, Egypt',
    'Currently en-route to Khor Fakkan, United Arab Emirates',
    'Anchored 68 miles outside Mersa Teklay, Eritrea',
    'Anchorage outside Dubai, United Arab Emirates',
    'Off Limbe, Cameroon',
    '25 NM off Hamriya Port',
  ]) {
    assert.equal(header({ port_of_abandonment: position }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned on 1 July 2026.', position);
  }
  assert.equal(header({ abandonment_date: 'March 2019' }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned in Samsun, Türkiye, in March 2019.');
  assert.equal(header({ abandonment_date: '2010' }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned in Samsun, Türkiye, in 2010.');
  assert.equal(header({ abandonment_date: 'unknown' }), 'Nikolay Meshkov (Palau flag): 13 seafarers abandoned in Samsun, Türkiye.');
  assert.equal(header({ fishing_vessel: 1 }), `Fishing vessel Nikolay Meshkov (Palau flag): 13 seafarers ${place}`);
});

// A sentence of exactly n graphemes that passes every quoting rule.
const sentence = (n, word = 'Crew') => `${word} wages owed ${'x'.repeat(n - word.length - 13)}.`;
const update = text => `1 August 2026: International Transport Workers' Federation\n${text}`;

test('over budget, the flag goes before any quote is shortened', () => {
  const base = { ...nikolayMeshkov, ship_name: 'Test Ship', flag: 'Saint Vincent and the Grenadines', circumstances: '', comments: update('') };
  const withoutFlag = composePost({ ...base, flag: '' }).graphemes;
  const room = 300 - withoutFlag - graphemeLength('\n\n“”') - graphemeLength('\n\nLatest update, 1 August 2026: “”');
  // Circumstances of two sentences; with the flag shown only the first fits.
  const second = sentence(50, 'Later');
  const first = sentence(Math.floor(room / 2) - second.length - 1);
  const ship = { ...base, circumstances: `${first} ${second}`, comments: update(sentence(room - Math.floor(room / 2))) };

  const draft = composePost(ship);
  assert.equal(draft.layout.showFlag, false);
  assert.ok(draft.text.includes(`${first} ${second}`));
  assert.ok(draft.layout.updateQuote);
  assert.equal(draft.graphemes, 300);
});

test('when only one quote fits, an open case keeps its latest update and a resolved one its circumstances', () => {
  const ship = { ...nikolayMeshkov, flag: '', circumstances: sentence(150, 'Before'), comments: update(sentence(150, 'After')) };
  const open = composePost({ ...ship, ship_status: 'disputed' });
  assert.deepEqual([open.layout.circumstancesQuote, open.layout.updateQuote], [false, true]);
  const resolved = composePost({ ...ship, ship_status: 'resolved' });
  assert.deepEqual([resolved.layout.circumstancesQuote, resolved.layout.updateQuote], [true, false]);
});

test('refuses rather than cut the facts to fit', () => {
  assert.throws(() => composePost({ ...nikolayMeshkov, ship_name: 'Long name '.repeat(30) }), /exceed 300 graphemes/);
});

test('the record carries the text, both links and a card built from the record', () => {
  const record = buildRecord(composePost(nikolayMeshkov), new Date('2026-09-15T13:41:00Z'));
  assert.equal(record.$type, 'app.bsky.feed.post');
  assert.equal(record.createdAt, '2026-09-15T13:41:00.000Z');
  assert.deepEqual(record.langs, ['en']);
  assert.equal(record.facets.length, 2);
  assert.deepEqual(record.embed, {
    $type: 'app.bsky.embed.external',
    external: {
      uri: 'https://abandonedseafarers.org/?ship=1821',
      title: 'Nikolay Meshkov — Abandoned Seafarers',
      description: 'ILO case 1821 · Status: Unresolved · Palau flag · IMO 8862507 · Samsun, Türkiye',
    },
  });
});
