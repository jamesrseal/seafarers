const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PAYMENT_STATUSES, REPATRIATION_STATUSES,
  parseNationalities, parseEntries, latestStatus, iloCaseFields,
} = require('../iloFields');

// Raw values as the ILO pages served them (the hidden inputs' values), one per
// shape the parser has to survive.
const RAW = {
  // oldest first, the usual order
  case1028Payment: '<strong>12 July 2024: Payment Pending<br></strong>US$56,697<br><br><strong>14 August 2024: Partially paid<br></strong>The unpaid 1-year salary of the captain was paid <br><br>In addition, the unpaid salary of the chief engineer was paid<br><br>',
  // newest first, then an undated opening status
  case439Payment: '<strong>8 July 2020: Paid<br></strong>The Liberian Flag Administration received a report that the mortgagee bank of the vessel settled the crew wages.<br><br><strong>Payment Pending<br></strong>The wages from March 2020 to date have not paid.<br><br>',
  // year-only and month-only dates
  case5Repat: '<strong>2004: Repatriated</strong><br>3 seafarers<br><strong>2004: Repatriation pending</strong><br>ICFTU reports 3 seafarers staid on board.<br><strong>October 2004: Repatriated</strong><br>Government of Romania: All seafarers were repatriated.<br>',
  // no dates at all
  case5Payment: '<strong>Paid<br></strong>3 seafarers<br><br><strong>Payment Pending<br></strong>3 seafarers<br><br>',
  // a <strong> opened inside another that never closes
  case500Actions: '<strong>10 October 2020: Flag State informed<br /><strong>Other<br /></strong>Wrote to DG Shipping in India, KISH P&I club and Charity organisation.<br />',
  // the last <strong> never closes
  case811Payment: '<strong>17 October 2023: Payment Pending<br></strong>Turk P&I and flag state authority have been promptly informed<br><br><strong>8 July 2025: Paid<br><br>',
};

test('nationalities: a trailing number in brackets is the head count', () => {
  assert.deepEqual(parseNationalities('Azerbaijan (11); Russian Federation (1); Türkiye (1)'), [
    { country: 'Azerbaijan', count: 11 },
    { country: 'Russian Federation', count: 1 },
    { country: 'Türkiye', count: 1 },
  ]);
});

test('nationalities: brackets in a name stay in the name, and a missing count is null', () => {
  assert.deepEqual(parseNationalities('Iran (Islamic Republic of) (12); Bolivia (Plurinational State of); India'), [
    { country: 'Iran (Islamic Republic of)', count: 12 },
    { country: 'Bolivia (Plurinational State of)', count: null },
    { country: 'India', count: null },
  ]);
  assert.deepEqual(parseNationalities(''), []);
  assert.deepEqual(parseNationalities(' ;  ; '), []);
});

test('entries: oldest-first lists come back newest first, with the detail as text', () => {
  const entries = parseEntries(RAW.case1028Payment);
  assert.deepEqual(entries.map(e => [e.date, e.dateText, e.status]), [
    ['2024-08-14', '14 August 2024', 'Partially paid'],
    ['2024-07-12', '12 July 2024', 'Payment Pending'],
  ]);
  assert.equal(entries[0].detail,
    'The unpaid 1-year salary of the captain was paid\n\nIn addition, the unpaid salary of the chief engineer was paid');
  assert.equal(entries[1].detail, 'US$56,697');
});

test('entries: an undated opening status sorts after the dated ones', () => {
  const entries = parseEntries(RAW.case439Payment);
  assert.deepEqual(entries.map(e => [e.date, e.status]), [['2020-07-08', 'Paid'], [null, 'Payment Pending']]);
  assert.equal(latestStatus(entries, PAYMENT_STATUSES), 'Paid');
});

test('entries: partial dates compare at their precision, and ties go to the later entry', () => {
  const entries = parseEntries(RAW.case5Repat);
  assert.deepEqual(entries.map(e => [e.date, e.dateText, e.status]), [
    ['2004-10', 'October 2004', 'Repatriated'],
    ['2004', '2004', 'Repatriation pending'],
    ['2004', '2004', 'Repatriated'],
  ]);
  assert.equal(entries[0].detail, 'Government of Romania: All seafarers were repatriated.');
});

test('entries: with no dates, the later entry counts as newer', () => {
  assert.deepEqual(parseEntries(RAW.case5Payment).map(e => e.status), ['Payment Pending', 'Paid']);
});

test('entries: malformed markup still splits at each <strong>', () => {
  const actions = parseEntries(RAW.case500Actions);
  assert.deepEqual(actions, [
    { date: '2020-10-10', dateText: '10 October 2020', status: 'Flag State informed', detail: '' },
    { date: null, dateText: null, status: 'Other', detail: 'Wrote to DG Shipping in India, KISH P&I club and Charity organisation.' },
  ]);
  const payment = parseEntries(RAW.case811Payment);
  assert.deepEqual(payment.map(e => [e.date, e.status, e.detail]), [
    ['2025-07-08', 'Paid', ''],
    ['2023-10-17', 'Payment Pending', 'Turk P&I and flag state authority have been promptly informed'],
  ]);
});

test('entries: blank or tag-only input has no entries', () => {
  assert.deepEqual(parseEntries(''), []);
  assert.deepEqual(parseEntries(null), []);
  assert.deepEqual(parseEntries('<br><br>'), []);
});

test('entries: text without any <strong> is one undated entry, its first line the heading', () => {
  assert.deepEqual(parseEntries('Repatriated<br>All crew home.'), [
    { date: null, dateText: null, status: 'Repatriated', detail: 'All crew home.' },
  ]);
});

test('entries: a word before the year is not mistaken for a month', () => {
  assert.deepEqual(parseEntries('<strong>Paid 2004: in full</strong>'), [
    { date: null, dateText: null, status: 'Paid 2004: in full', detail: '' },
  ]);
});

test('entities are decoded', () => {
  const [entry] = parseEntries('<strong>1 May 2025: Other</strong><br>P&amp;I club&nbsp;informed &#8220;today&#8221;');
  assert.equal(entry.detail, 'P&I club informed “today”');
});

test('the latest status takes the ILO spelling whatever the case or spacing', () => {
  const entries = [{ status: '  payment   pending ' }];
  assert.equal(latestStatus(entries, PAYMENT_STATUSES), 'Payment Pending');
  assert.equal(latestStatus([{ status: 'REPATRIATED' }], REPATRIATION_STATUSES), 'Repatriated');
  assert.equal(latestStatus([{ status: 'Vessel sold' }], PAYMENT_STATUSES), 'Vessel sold');
  assert.equal(latestStatus([], PAYMENT_STATUSES), '');
});

test('case fields: JSON for lists, blank strings for blank fields', () => {
  const fields = iloCaseFields({
    vessel_type: ' General Cargo Ship ',
    financial_security_provider: 'Hydor',
    nationalities: 'Azerbaijan (11); Türkiye (1)',
    payment: RAW.case1028Payment,
    repatriation: '',
    actions: RAW.case500Actions,
  });
  assert.equal(fields.vessel_type, 'General Cargo Ship');
  assert.equal(fields.financial_security_provider, 'Hydor');
  assert.deepEqual(JSON.parse(fields.nationalities), [{ country: 'Azerbaijan', count: 11 }, { country: 'Türkiye', count: 1 }]);
  assert.equal(JSON.parse(fields.payment_status).length, 2);
  assert.equal(fields.payment_latest, 'Partially paid');
  assert.equal(fields.repatriation_status, '');
  assert.equal(fields.repatriation_latest, '');
  assert.equal(JSON.parse(fields.actions_taken).length, 2);
});

test('case fields: a field missing from the page is blank, as the ILO omits empty ones', () => {
  // Case 1753 has no vessel type: its page has no P3_IMO_SHIP_TYPE element at all.
  const fields = iloCaseFields({
    vessel_type: null, financial_security_provider: null, nationalities: null,
    payment: null, repatriation: RAW.case5Repat, actions: undefined,
  });
  assert.deepEqual(fields, {
    vessel_type: '',
    financial_security_provider: '',
    nationalities: '',
    payment_status: '',
    payment_latest: '',
    repatriation_status: fields.repatriation_status,
    repatriation_latest: 'Repatriated',
    actions_taken: '',
  });
});

test('the same input always gives the same stored text', () => {
  // Ingest compares stored strings, so this is what keeps history honest.
  const a = iloCaseFields({ payment: RAW.case439Payment, nationalities: 'India (3)' });
  const b = iloCaseFields({ payment: RAW.case439Payment, nationalities: 'India (3)' });
  assert.deepEqual(a, b);
  assert.equal(a.nationalities, '[{"country":"India","count":3}]');
});

test('vocabularies are the ILO headings', () => {
  assert.deepEqual(PAYMENT_STATUSES, ['Paid', 'Partially paid', 'Payment Pending', 'Other']);
  assert.deepEqual(REPATRIATION_STATUSES, ['Repatriated', 'Repatriation pending', 'Other']);
});
