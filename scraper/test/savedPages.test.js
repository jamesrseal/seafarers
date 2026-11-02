const test = require('node:test');
const assert = require('node:assert/strict');
const { SAVED_PAGE, identifyPages } = require('../savedPages');

// The top of an .mhtml as Chrome writes it.
const mhtml = (address, title = 'Armony - United Republic of Tanzania - 1 April 2026') => [
  'From: <Saved by Blink>',
  `Snapshot-Content-Location: ${address}`,
  `Subject: ${title}`,
  'Date: Mon, 02 Nov 2026 15:33:51 GMT',
  'MIME-Version: 1.0',
  '',
  '',
].join('\r\n');
const details = id => `https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?p3_abandonment_id=${id}`;

test("Chrome's own file name works: the case comes from the address", () => {
  const files = identifyPages([
    { name: 'Armony - United Republic of Tanzania - 1 April 2026.mhtml', head: mhtml(details(1847)) },
  ]);
  assert.deepEqual(files, [{ name: 'Armony - United Republic of Tanzania - 1 April 2026.mhtml', id: '1847' }]);
});

test('a file named by case ID works, with or without an address', () => {
  assert.equal(identifyPages([{ name: '1835.mhtml', head: mhtml(details(1835)) }])[0].id, '1835');
  assert.equal(identifyPages([{ name: '1835.html', head: '<!DOCTYPE html><html>' }])[0].id, '1835');
});

test('IDs come back plain, whatever the zeros, and in numeric order', () => {
  const files = identifyPages([
    { name: 'b.mhtml', head: mhtml(details('01850')) },
    { name: 'c.mhtml', head: mhtml(details(999)) },
    { name: 'a.mhtml', head: mhtml(details(1847)) },
  ]);
  assert.deepEqual(files.map(f => f.id), ['999', '1847', '1850']);
});

test('the case ID is found among other parameters in the address', () => {
  const address = 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/details?session=123&p3_abandonment_id=1847&cs=abc';
  assert.equal(identifyPages([{ name: 'a.mhtml', head: mhtml(address) }])[0].id, '1847');
});

test('a name and an address that disagree are refused', () => {
  assert.throws(
    () => identifyPages([{ name: '1851.mhtml', head: mhtml(details(1850)) }]),
    /1851\.mhtml: named for case 1851, but saved from the address of case 1850/,
  );
});

test('a page with no case ID in its address or name is refused', () => {
  const home = 'https://wwwex.ilo.org/dyn/r/abandonment/seafarers/search';
  assert.throws(() => identifyPages([{ name: 'ILO home.mhtml', head: mhtml(home) }]), /can't tell which case/);
  assert.throws(() => identifyPages([{ name: 'notes.html', head: '<!DOCTYPE html>' }]), /can't tell which case/);
});

test('two files for one case are refused', () => {
  assert.throws(
    () => identifyPages([
      { name: '1850.mhtml', head: mhtml(details(1850)) },
      { name: 'Setaregan.mhtml', head: mhtml(details(1850)) },
    ]),
    /1850\.mhtml and Setaregan\.mhtml are both case 1850/,
  );
});

test('only saved pages are picked up from the folder', () => {
  for (const name of ['1847.mhtml', 'Armony.MHTML', 'a.mht', 'a.html', 'a.htm']) assert.ok(SAVED_PAGE.test(name), name);
  for (const name of ['notes.txt', 'desktop.ini', 'november', 'shot.png']) assert.ok(!SAVED_PAGE.test(name), name);
});
