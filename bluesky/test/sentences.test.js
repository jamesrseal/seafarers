const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSentences } = require('../src/sentences');

const texts = line => splitSentences(line).map(s => s.text);

test('splits where a sentence ends and a capital or digit begins the next', () => {
  assert.deepEqual(
    texts('Bangladeshi seafarer has a 9 months outstanding salary and repatriation request. His contract is expired.'),
    ['Bangladeshi seafarer has a 9 months outstanding salary and repatriation request.', 'His contract is expired.'],
  );
  assert.deepEqual(texts('Crew left. 2 Indian Officers remain.'), ['Crew left.', '2 Indian Officers remain.']);
  assert.deepEqual(texts('USD 1.5 million owed. Resolved.'), ['USD 1.5 million owed.', 'Resolved.']);
  assert.deepEqual(texts('Wages owed (August – November). Crew on board.'), ['Wages owed (August – November).', 'Crew on board.']);
});

test('holds abbreviations, initials, decimals and brackets together', () => {
  assert.deepEqual(texts('IMO No. 9134361 arrived. Crew left.'), ['IMO No. 9134361 arrived.', 'Crew left.']);
  assert.deepEqual(texts('M.V. Bird left. 2 Indian Officers remain.'), ['M.V. Bird left.', '2 Indian Officers remain.']);
  assert.deepEqual(texts('Contact Mr. Smith today.'), ['Contact Mr. Smith today.']);
  assert.deepEqual(texts('(Crew said. Owner left.) Then nothing.'), ['(Crew said. Owner left.) Then nothing.']);
  assert.deepEqual(texts('The crew said no. then left'), ['The crew said no. then left']);
});

test('every sentence is an exact slice of its line', () => {
  const line = '  Vessel arrested.  Crew unpaid!  "Help" they said. ';
  const sentences = splitSentences(line);
  assert.deepEqual(sentences.map(s => s.text), ['Vessel arrested.', 'Crew unpaid!', '"Help" they said.']);
  for (const s of sentences) assert.equal(line.slice(s.start, s.end), s.text);
});
