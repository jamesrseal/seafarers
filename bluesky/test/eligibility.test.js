const test = require('node:test');
const assert = require('node:assert/strict');
const { rejectSentence, rejectUpdate, quoteCandidates } = require('../src/eligibility');
const { parseUpdates, circumstanceLines } = require('../src/parse');
const { bird16, shreenathJi } = require('../fixtures/ships');

// Most of these are real ILO sentences the scan of every case turned up.
const REJECTED = [
  ['redaction', 'The owner Mr. *** refused to pay the crew.'],
  ['email address', 'Contact the agent at crew@example.com for details.'],
  ['web address', 'Details are posted at www.example.org for the crew.'],
  ['phone number', 'Call the agent on +90 532 123 4567 today.'],
  ['named person', 'Captain Ahmed has not been paid for months.'],
  ['death or self-harm', '1 seafarer committed suicide on board.'],
  ['medical detail', 'The 2nd officer urgently needs to be taken to hospital; he has reported symptoms of urine infection.'],
  ['medical detail', 'One of the crew has a  serious case of Haemorrhoids that needs urgent medical attention.'],
  ['medical detail', 'Crew member needs urgent medical assistance.'],
  ['first person', 'The 12 Syrians are afraid to talk to us.'],
  ['second person', 'Your email about the new case has been processed.'],
  ['salutation', 'Dear Sir or Madam, the crew is unpaid.'],
  ['boilerplate', 'The case has been duly noted and will be recorded.'],
  ['boilerplate', 'Thus, with this declaration, the issue of M\\ V BADR Ill is concluded.'],
  ['correspondence', 'Letters issued to the concerned RPSL Companies , DSEO, MEA Division wise and DO letter issued to the Ministry'],
  ['status restatement', 'The ILO was informed by the ICFTU/ITF that, following contact with the Registry, the ITF was considering that the case could be classed as resolved.'],
  ['attribution line', 'From Finlay McIntosh, Inspectorate Coordination Supervisor'],
  ['attribution line', 'From Panama Maritime Authority'],
  ['attribution line', '(by Permanent Representation of the Republic of Palau to the IMO)'],
  ['record correction', 'The correct IMO number is 6617726 and the flag state should be Senegal and NOT Cabo Verde'],
  ['record correction', 'The flag State originally reported by the ITF was Sierra Leone.'],
  ['record correction', 'IMO Number 7938933 on IMO GISIS, flag: Gambia'],
  ['record correction', 'As a general practice, the flag State for abandonment cases is initially recorded based on the information provided in the first report.'],
  ['correspondence', 'Through email date September 16, 2021.'],
  ['correspondence', 'The IMO has received a letter from the flag State register.'],
  ['insurance detail', 'The P&I club has been contacted about the claim.'],
  ['misreadable jargon', 'Vessel is now dead.'],
  ['status restatement', 'This case has been resolved.'],
  ['status restatement', 'No further update expected from the flag state.'],
  ['status restatement', 'No further updated expected'],
  ['status restatement', 'No comments received from flag state'],
  ['too long', 'Crew unpaid for many months and '.repeat(8)],
  ['ends with a colon', 'The crew sent the following message:'],
  ['labelled note', 'Update 06/05: Vessel arrested 17/07/03.'],
  ['labelled note', 'No. of Seafarers: 4 (presently on board, others already left)'],
  ['starts mid-thought', 'and then the crew left the ship.'],
  ['too short', 'Resolved.'],
  ['nested quotation marks', 'The owner called it “a misunderstanding” again.'],
  ['unbalanced brackets', 'Crew unpaid (since March and still waiting.'],
  ['unbalanced quotation marks', 'The crew said "they want to go home.'],
  ['garbled text', 'Company has abandoned 8 ships without fuel supply and cut off ships¿ mobiles.'],
  ['written in capitals', 'MAY AND JUNE WAGES OUTSTANDING'],
  ['heading', 'St. Kitts and Nevis International Ship Registry'],
];

for (const [reason, sentence] of REJECTED) {
  test(`rejects ${reason}: ${sentence.slice(0, 50)}`, () => {
    assert.equal(rejectSentence(sentence), reason);
  });
}

test('accepts plain factual sentences', () => {
  for (const sentence of [
    'Outstanding wages for 2 months',
    'Crew repatriated with their owed wages.',
    'US$ 5,000 is owed to the crew.',
    '2 Indian Officers have 4 months of unpaid salary.',
    'Outstanding wages for 3 months: August, September and October.',
    'From December 2009 the company stopped supplying the vessel.',
    'Some crew in need of medical assistance.',
    'Two seafarers in need of medical assistance have had to use their own funds as again no response from company.',
    'Now sailing under the name of Abdil Ibrahimli.',
    'USD 92,500 Backpay obtained',
  ]) {
    assert.equal(rejectSentence(sentence), null, sentence);
  }
});

test('a relayed letter is never quoted, even where a sentence would pass', () => {
  const [latest, letter] = parseUpdates(shreenathJi.comments);
  assert.equal(rejectUpdate(latest), null);
  assert.equal(rejectUpdate(letter), 'relayed letter');
});

test('candidates run from the start of a line, longest first', () => {
  assert.deepEqual(quoteCandidates(circumstanceLines(bird16.circumstances)).map(c => c.text), [
    'Bangladeshi seafarer has a 9 months outstanding salary and repatriation request. His contract is expired.',
    'Bangladeshi seafarer has a 9 months outstanding salary and repatriation request.',
    '2 Indian Officers have 4 months of unpaid salary.',
  ]);
});

test('a rejected sentence ends the run', () => {
  assert.deepEqual(quoteCandidates(['Crew repatriated with their owed wages. Resolved.']).map(c => c.text), [
    'Crew repatriated with their owed wages.',
  ]);
  // The first sentence is refused, so nothing after it is offered either.
  assert.deepEqual(quoteCandidates(['The 12 Syrians are afraid to talk to us. They have not been paid.']), []);
});
